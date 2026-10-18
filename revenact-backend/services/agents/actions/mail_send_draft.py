"""mail.send_draft ("Send it", guided agent spec §2.3): send the draft the
bundle's `mail.compose` wrote, from its owner's own Gmail, through the draft
send path (`services/mail/draft_send.py`: the claim before Gmail is called,
the sent copy, the filing on the record, `mailbox.sent`). Its owner may
change who of the record's contacts it goes to, the subject and the body
first: an edit rewrites the draft before it is sent. The mailbox has no
delayed send, so it can't be undone. Once sent, the filed email is added to
Revenact (`sharing.set_shared`): it is a customer email the agent wrote on
the record's behalf, and it shows on the record's timeline."""

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from core import audit
from services.customers.models import Email
from services.customers.scoping import can_open
from services.mail.models import MailboxConnection, MailDraft
from services.metrics.models import AgentAction

from .. import guided, placeholders
from ..edits import checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed
from ..outside import keys, tools, trail
from .diagnose import CANT_OPEN, new_key
from .mail_compose import _name, compose_blocked

logger = logging.getLogger(__name__)
K = AgentAction.Kind
S = AgentAction.Status
SENT = "This email has been sent."
EXCERPT = 280
SUBJECT_LIMIT = 150
BODY_LIMIT = 4000
NOT_YOURS = "Only {name} can send this email: it is in their mailbox."
NOT_YOURS_EDIT = "Only {name} can change this email: it is in their mailbox."
DRAFT_GONE = "The draft was deleted. Write the email again."
UNCONFIRMED = "We couldn't confirm the email went out. Check your Sent mail before you retry."
CHOOSE_CONTACT = "Choose one of {name}'s contacts."
NO_SUBJECT = "Write a subject."
LONG_SUBJECT = "Keep the subject under 150 characters."
NO_BODY = "Write the email."
LONG_BODY = "Keep the email under 4000 characters."
TO_CUSTOMER = "This goes to a customer, so it can't use another step's result."


def validate(payload, row, ctx, evidence):
    if ctx.thread_ref is None and ctx.slack_message is None:
        raise Invalid("only a message bundle sends this email")
    if row["kind"] not in ("customer", "account"):
        raise Invalid("an email to a record's contact")
    return {"key": new_key()}


def target(payload):
    return f"send:{payload['key']}"


def editable_for(payload):
    # Nothing to change until the email is written (mail.compose hands it over).
    return ("to", "subject", "body") if payload.get("draft_id") else ()


def fields_for(step, reader, values):
    payload = step.payload if isinstance(step.payload, dict) else {}
    # SOC2:AUTH-02 the draft is its owner's mail: only they read or change its fields
    if payload.get("owner_id") != reader.pk:
        return None
    return values


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    result = action.result if isinstance(action.result, dict) else {}
    own = payload.get("owner_id") == reader.pk
    sent = action.status in (S.APPLIED, S.UNDONE)
    sender = result.get("from") if sent else None
    if not sent and own:
        from ..outside.gates import mailbox_of

        connection = mailbox_of(reader)
        sender = connection.address if compose_blocked(connection) is None else None
    return {
        "send": {
            "to": {
                "name": payload.get("to_name", ""),
                "address": payload.get("to") if own else None,
            }
            if payload.get("draft_id")
            else None,
            "from": sender if own else None,
            "subject": payload.get("subject") if own else None,
            "excerpt": str(payload.get("body") or "")[:EXCERPT] if own else None,
            "draft_id": payload.get("draft_id") if own else None,
            "sent": sent,
            "shared": bool(result.get("shared")),
            "private": not own,
        }
    }


class _Text(serializers.Serializer):
    subject = text_field(SUBJECT_LIMIT, NO_SUBJECT, LONG_SUBJECT)
    body = text_field(BODY_LIMIT, NO_BODY, LONG_BODY)


def edit(action, fields, runner):
    payload = action.payload if isinstance(action.payload, dict) else {}
    owner = payload.get("owner_id")
    if owner != runner.pk:
        raise FieldErrors({key: [NOT_YOURS_EDIT.format(name=_name(owner))] for key in fields})
    errors, clean = {}, {}
    if "to" in fields:
        record = action.record
        address = fields["to"].strip().lower() if isinstance(fields["to"], str) else ""
        # SOC2:AUTH-02 only a contact of this record the runner may see; never a free address
        contact = (
            guided.contacts_of(record, runner).filter(email__iexact=address).first()
            if record is not None and address
            else None
        )
        if contact is None:
            errors["to"] = [CHOOSE_CONTACT.format(name=getattr(record, "name", "the record"))]
        else:
            clean.update(to=contact.email, to_name=contact.name, contact_id=contact.pk)
    try:
        clean.update(checked(_Text, {k: fields[k] for k in ("subject", "body") if k in fields}))
    except FieldErrors as exc:
        errors.update(exc.errors)
    for key in ("subject", "body"):
        if key in clean and (placeholders.find({key: clean[key]}) or "{{" in clean[key]):
            errors[key] = [TO_CUSTOMER]
    if errors:
        raise FieldErrors(errors)
    return {**payload, **clean}


def _rewrite(actor, draft, payload, connection):
    """The step's edit, written to the draft before it is sent (as a PATCH would)."""
    from services.mail import drafts as mail_drafts
    from services.mail import html
    from services.mail.send_as import signature_block

    with transaction.atomic():
        locked = mail_drafts.lock(actor, draft.pk)
        valid = {
            "to": [[payload.get("to_name", ""), payload["to"]]],
            "subject": payload["subject"][:255],
            "html": html.clean(html.paragraphs(payload["body"]) + signature_block(connection)),
        }
        mail_drafts.commit(
            locked, mail_drafts.apply_content(locked, valid, user=actor), now=timezone.now()
        )
    return mail_drafts.readable(actor, draft.pk)


def _share(actor, email):
    """Add the sent email to Revenact: its record's readers see it. Best effort."""
    from services.mail import sharing

    if email is None or email.mailbox_owner_id != actor.pk:
        return False
    try:
        with transaction.atomic():
            sharing.set_shared(actor, email, True)
        return True
    except Exception as exc:  # noqa: BLE001 - the email has gone; the step stands
        logger.warning("guided send: sharing the sent email failed: %s", type(exc).__name__)
        return False


def _done(action, actor, connection, draft, email, provider_id="", message_id=None):
    shared = _share(actor, email)
    payload = action.payload
    audit.record(  # SOC2:LOG-01 ids only: the recipients and subject are in mailbox.sent
        "mail.agent_sent",
        actor=actor,
        organisation=action.organisation,
        target=action,
        target_repr=f"Action {action.pk}",
        metadata={
            "agent_step": action.pk,
            "bundle": action.bundle_id,
            "draft": draft.pk,
            "email": email.pk if email is not None else None,
            "shared": shared,
        },
    )
    result = {
        **keys.attempt(action, actor),
        "sent_by": actor.pk,
        "from": connection.address,
        "provider": connection.provider,
        "provider_id": provider_id or (email.provider_message_id if email else ""),
        "draft_id": draft.pk,
        "to": payload.get("to", ""),
        "to_name": payload.get("to_name", ""),
        "shared": shared,
    }
    if email is not None:
        result["email_id"] = email.pk
    if message_id:
        result["message_id"] = message_id
    return {"sent": result["provider_id"]}, result


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person sends this email")
    payload = action.payload if isinstance(action.payload, dict) else {}
    if not payload.get("draft_id"):
        compose = (
            action.bundle.steps.filter(kind=K.MAIL_COMPOSE, position__lt=action.position)
            .order_by("-position")
            .first()
        )
        raise StepFailed(placeholders.needs_sentence(compose.position if compose else 1))
    owner = payload.get("owner_id")
    # SOC2:AUTH-02 mail leaves only from its owner's own mailbox, sent by them
    if owner != actor.pk:
        raise StepFailed(NOT_YOURS.format(name=_name(owner)))
    record = action.record
    if record is None:
        raise Stale("the record is gone")
    if not can_open(actor, record):
        raise StepFailed(CANT_OPEN)
    draft = (
        MailDraft.objects.filter(owner=actor, pk=payload["draft_id"])
        .exclude(status=MailDraft.Status.DISCARDED)
        .select_related("sent_email")
        .first()
    )
    if draft is None:
        raise StepFailed(DRAFT_GONE)
    connection = MailboxConnection.objects.filter(user=actor).first()
    # SOC2:API-08 the draft's own claim is the idempotency key: sending or sent, never again
    if draft.status == MailDraft.Status.SENT:
        # A Retry after it went (or it was sent from Communications): done, never twice.
        return _done(action, actor, connection, draft, draft.sent_email)
    if draft.status == MailDraft.Status.SENDING:
        raise StepFailed(UNCONFIRMED)
    stop = compose_blocked(connection)
    if stop:
        raise StepFailed(stop)
    if action.edited_at is not None:
        draft = _rewrite(actor, draft, payload, connection)
    where = f"mailbox {connection.pk}"
    try:
        sent = tools.current().mail.send_draft(connection, draft=draft, actor=actor)
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="mail", op="send", outcome="unconfirmed", where=where)
        raise StepFailed(exc.sentence, result=keys.attempt(action, actor)) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="mail", op="send", outcome="refused", where=where)
        raise StepFailed(exc.sentence, result=keys.attempt(action, actor)) from None
    trail.call(
        action, actor, tool="mail", op="send", outcome="ok", where=where, returned=sent.provider_id
    )
    email = Email.objects.filter(pk=sent.email_id).first() if sent.email_id else None
    return _done(action, actor, connection, draft, email, sent.provider_id, sent.message_id)


def undo(action, actor):
    raise ChangedSince(SENT)


SEND_DRAFT = Kind(
    key=AgentAction.Kind.MAIL_SEND_DRAFT,
    label="Send it",
    example="Send the email to Dana Smith",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    per_reader=True,
    texts=lambda payload: [],
    irreversible=True,
    outside=True,
    editable=("to", "subject", "body"),
    editable_for=editable_for,
    edit=edit,
    fields_for=fields_for,
    outputs=("email_id",),
    customer_facing=("subject", "body"),
    cant_undo=SENT,
    message_only=True,
    on_threads=True,
)
