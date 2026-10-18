"""mail.send_reply (agent bundles D3 contract §2.1): a reply to the thread's
newest customer email, sent from the runner's own mailbox when they press
Run (D3-1 to D3-3). The model writes only the body; who it goes to comes
from the thread (D3-2). The step's key travels as a header and every Retry
looks first (D3-11); a Retry is the runner's only. Can't be undone."""

import logging
import re

from django.db import transaction
from rest_framework import serializers

from core import audit
from services.customers.models import Email
from services.mail import agent_send
from services.mail.draft_send import ADD_SOMEONE
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction

from .. import placeholders
from ..edits import LONG_REPLY, NO_REPLY, checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed
from ..outside import gates, keys, tools, trail
from . import drafts
from .surveys import NOT_THE_RUNNER

logger = logging.getLogger(__name__)
S = AgentAction.Status
BODY_LIMIT = 4000
SUBJECT_LIMIT = 255
EXCERPT = 280
MOST = 10
BAD_ADDRESS = "Enter email addresses like ann@example.com."
TOO_MANY = "Send to at most 10 people."
NO_SUBJECT = "Write a subject."
LONG_SUBJECT = "Keep the subject under 255 characters."
TO_CUSTOMER = "This goes to a customer, so it can't use another step's result."
SENT = "This email has been sent."
ADDRESS = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")


def validate(payload, row, ctx, evidence):
    source = ctx.thread_email
    if source is None or source["record"] != row["ref"]:
        raise Invalid("not this thread's customer email")
    body = str(payload.get("body") or "").strip()
    if not body or len(body) > BODY_LIMIT:
        raise Invalid("a reply needs a body under 4000 characters")
    # It cites its own email's line, and only that.
    if any(line != source["line"].strip() for line in evidence):
        raise Invalid("a reply cites only its own email")
    # D3-2: who it goes to and its subject come from the thread, never the model.
    return {
        "email_id": source["id"],
        "mailbox_id": source["mailbox_id"],
        "to": [source["address"]],
        "cc": [],
        "subject": source["subject"],
        "body": body,
    }


def target(payload):
    # Shared with draft.reply: one reply per email (D3-18).
    return f"draft:email:{payload['email_id']}"


def current(action):
    """The thread's head: someone answering, or the customer writing again, expires it."""
    return drafts._head(action.payload["email_id"])


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    result = action.result if isinstance(action.result, dict) else {}
    if action.status in (S.APPLIED, S.UNDONE):
        sender, threaded = result.get("from"), bool(result.get("threaded"))
    else:
        connection = gates.mailbox_of(reader)
        able = connection is not None and agent_send.blocked(connection) is None
        sender = connection.address if able else None
        threaded = (
            able
            and connection.provider
            in (MailboxConnection.Provider.GOOGLE, MailboxConnection.Provider.MICROSOFT)
            and connection.pk == payload.get("mailbox_id")
        )
    return {
        "mail": {
            "from": sender,
            "to": list(payload.get("to") or []),
            "cc": list(payload.get("cc") or []),
            "subject": payload.get("subject", ""),
            "excerpt": str(payload.get("body", ""))[:EXCERPT],
            "threaded": bool(threaded),
        }
    }


def _addresses(value, *, required):
    if not isinstance(value, list) or not all(isinstance(a, str) for a in value):
        raise ValueError(BAD_ADDRESS)
    clean = list(dict.fromkeys(a.strip().lower() for a in value if a.strip()))
    if required and not clean:
        raise ValueError(ADD_SOMEONE)
    if len(clean) > MOST:
        raise ValueError(TOO_MANY)
    if any(not ADDRESS.match(a) for a in clean):
        raise ValueError(BAD_ADDRESS)
    return clean


class _Text(serializers.Serializer):
    subject = serializers.CharField(
        required=False,
        max_length=SUBJECT_LIMIT,
        error_messages={
            "blank": NO_SUBJECT,
            "null": NO_SUBJECT,
            "invalid": NO_SUBJECT,
            "max_length": LONG_SUBJECT,
        },
    )
    body = text_field(BODY_LIMIT, NO_REPLY, LONG_REPLY)


def edit(action, fields, runner):
    errors, clean = {}, {}
    for key in ("to", "cc"):
        if key in fields:
            try:
                clean[key] = _addresses(fields[key], required=key == "to")
            except ValueError as exc:
                errors[key] = [str(exc)]
    try:
        clean.update(checked(_Text, {k: fields[k] for k in ("subject", "body") if k in fields}))
    except FieldErrors as exc:
        errors.update(exc.errors)
    for key in ("subject", "body"):
        # D3-17: a customer never reads another step's output.
        if key in clean and placeholders.find({key: clean[key]}):
            errors[key] = [TO_CUSTOMER]
    if errors:
        raise FieldErrors(errors)
    return {**action.payload, **clean}


def _audit_reply(action, actor, source, payload):
    """`mailbox.reply` (the standing "mail left through a held credential"
    event), best effort: its failure never fails a sent step (D3-12)."""
    try:
        with transaction.atomic():
            audit.record(  # SOC2:LOG-01 mail left the building through a credential we hold
                "mailbox.reply",
                actor=actor,
                organisation=action.organisation,
                target=source,
                metadata={
                    "to": list(payload["to"]),
                    "cc": list(payload.get("cc") or []),
                    "bcc_count": 0,
                    "subject": payload["subject"],
                    "attachments": 0,
                    "bytes": len(payload["body"].encode()),
                    "agent_step": action.pk,
                },
            )
    except Exception as exc:  # noqa: BLE001 - the send happened; the step stands
        logger.warning(
            "agent reply %s: mailbox.reply not written: %s", action.pk, type(exc).__name__
        )


def _done(actor, sent, attempt):
    result = {
        **attempt,
        "sent_by": actor.pk,
        "from": sent.address,
        "provider": sent.provider,
        "provider_id": sent.provider_id,
        "threaded": sent.threaded,
    }
    if sent.email_id:
        result["email_id"] = sent.email_id
    if sent.message_id:
        result["message_id"] = sent.message_id
    return {"sent": sent.provider_id}, result


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person sends a reply")
    payload = action.payload
    # A crash settled by the sweep leaves no attempt: the runner is the bundle's,
    # which a Retry never changes.
    owner = (action.result or {}).get("attempted_by") or action.bundle.run_by_id
    # SOC2:AUTH-02 a reply's Retry is its runner's: the lookup reads their mailbox (D3-1)
    if keys.retrying(action) and owner != actor.pk:
        raise StepFailed(NOT_THE_RUNNER)
    source = (
        Email.objects.filter(
            pk=payload["email_id"], customer_id=action.customer_id, account_id=action.account_id
        )
        .select_related("customer", "account")
        .first()
    )
    if source is None:
        raise Stale("the email is gone")
    # SOC2:AUTH-02 mail is owner-only (2026-10-17): only the mailbox's owner answers its mail
    if source.mailbox_owner_id is not None and source.mailbox_owner_id != actor.pk:
        raise Stale("the email is in someone else's mailbox")
    connection = MailboxConnection.objects.filter(user=actor).first()
    stop = agent_send.blocked(connection)
    if stop:
        raise StepFailed(stop)
    tool, key = tools.current().mail, keys.key_for(action)
    where = f"mailbox {connection.pk}"
    attempt = keys.attempt(action, actor)
    if keys.retrying(action):
        try:
            found = tool.find(connection, key=key, since=keys.since(action), source=source)
        except tools.Refused as exc:
            trail.call(action, actor, tool="mail", op="lookup", outcome="refused", where=where)
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action,
            actor,
            tool="mail",
            op="lookup",
            outcome="found" if found else "not_found",
            where=where,
            returned=found.provider_id if found else "",
        )
        if found is not None:
            return _done(actor, found, attempt)
    try:
        sent = tool.send(
            connection,
            source=source,
            to=payload["to"],
            cc=payload.get("cc") or [],
            subject=payload["subject"],
            body=payload["body"],
            key=key,
        )
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="mail", op="send", outcome="unconfirmed", where=where)
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="mail", op="send", outcome="refused", where=where)
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action, actor, tool="mail", op="send", outcome="ok", where=where, returned=sent.provider_id
    )
    _audit_reply(action, actor, source, payload)
    return _done(actor, sent, attempt)


def undo(action, actor):
    raise ChangedSince(SENT)


SEND_REPLY = Kind(
    key=AgentAction.Kind.MAIL_SEND_REPLY,
    label="Send an email reply",
    example="Reply to Ann Lee that the login fix ships on Friday",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=current,
    preview=preview,
    apply=apply,
    undo=undo,
    per_reader=True,
    texts=lambda payload: [payload.get("subject"), payload.get("body")],
    irreversible=True,
    outside=True,
    editable=("to", "cc", "subject", "body"),
    edit=edit,
    outputs=("email_id",),
    customer_facing=("subject", "body"),
    cant_undo=SENT,
)
