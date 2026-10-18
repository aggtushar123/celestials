"""mail.compose ("Write an email", guided agent spec §2.2): a new email (not
a reply) to the record's main contact, written from the bundle's diagnosis
and what the runner may read, saved as a Gmail draft in the runner's own
mailbox (a `MailDraft`: it shows in Communications and in Gmail's Drafts).
The server picks who it goes to (`guided.main_contact`); the model writes
only the subject and the body. The draft's text is handed to the bundle's
`mail.send_draft` step. Undo deletes the draft while it is still a draft."""

import logging

from django.db import transaction
from django.utils import timezone

from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.customers.models import Customer
from services.customers.scoping import can_open
from services.mail import agent_send
from services.mail.models import MailboxConnection, MailDraft
from services.metrics.models import AgentAction

from .. import diagnosis, guided, placeholders
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale, StepFailed
from .diagnose import CANT_OPEN, COULDNT, NO_CREDITS, new_key

logger = logging.getLogger(__name__)
K = AgentAction.Kind
S = AgentAction.Status
GMAIL_ONLY = "Writing an email needs a connected Gmail mailbox."
NO_CONTACT = "Add a contact with an email address to {name} first."
SENT = "This email has been sent."
NOT_THE_DIAGNOSER = "Only {name} can write this email: they ran the diagnosis."
NOT_YOURS = "Only {name} can delete this draft: it is in their mailbox."
#: What a send step holds once the draft is written (and loses on undo).
HANDED = ("draft_id", "owner_id", "to", "to_name", "contact_id", "subject", "body")


def compose_blocked(connection):
    """Why `connection` can't hold the agent's draft, or None: a connected,
    two-way Gmail (a `MailDraft` is a Gmail draft)."""
    from services.mail import gates as mail_gates

    stop = agent_send.blocked(connection)
    if stop:
        return stop
    if not connection.is_google:
        return GMAIL_ONLY
    # SOC2:AUTH-02 a paused Gmail (workspace off, no seat, suspended) never writes or sends
    paused = mail_gates.paused_reason(connection)
    if paused:
        return mail_gates.PAUSED_MESSAGES[paused]
    return None


def validate(payload, row, ctx, evidence):
    if ctx.thread_ref is None and ctx.slack_message is None:
        raise Invalid("only a message bundle writes this email")
    if row["kind"] not in ("customer", "account"):
        raise Invalid("an email to a record's contact")
    return {"key": new_key()}


def target(payload):
    return f"compose:{payload['key']}"


def _name(user_id):
    from services.accounts.models import User

    return User.objects.filter(pk=user_id).values_list("name", flat=True).first() or "someone"


def preview(action, reader):
    record = action.record
    name = record.name if record is not None else ""
    result = action.result if isinstance(action.result, dict) else {}
    if action.status in (S.APPLIED, S.UNDONE) and result.get("draft_id"):
        own = result.get("owner_id") == reader.pk
        # SOC2:AUTH-02 the draft is its owner's mail: its words and address are theirs alone
        return {
            "compose": {
                "record": name,
                "to": {
                    "name": result.get("to_name", ""),
                    "address": result.get("to") if own else None,
                },
                "from": result.get("from") if own else None,
                "subject": result.get("subject") if own else None,
                "body": result.get("body") if own else None,
                "draft_id": result.get("draft_id") if own else None,
                "private": not own,
                "owner": _name(result.get("owner_id")),
            }
        }
    from ..outside.gates import mailbox_of

    contact = guided.main_contact(record, reader) if record is not None else None
    connection = mailbox_of(reader)
    return {
        "compose": {
            "record": name,
            "to": {"name": contact.name, "address": contact.email} if contact else None,
            "from": connection.address if compose_blocked(connection) is None else None,
            "subject": None,
            "body": None,
            "draft_id": None,
            "private": False,
            "owner": reader.name,
        }
    }


def _diagnosis_of(action):
    """The bundle's diagnosis this email is written from (the nearest one before it)."""
    return (
        action.bundle.steps.filter(kind=K.RECORD_DIAGNOSE, position__lt=action.position)
        .order_by("-position")
        .first()
    )


def _hand(action, payload):
    """The written draft goes to the bundle's waiting send steps after this one."""
    from ..deciding import locked

    for pk in action.bundle.steps.filter(
        kind=K.MAIL_SEND_DRAFT, status=S.PROPOSED, position__gt=action.position
    ).values_list("pk", flat=True):
        step = locked(pk)
        kept = {k: v for k, v in (step.payload or {}).items() if k not in HANDED}
        step.payload = {**kept, **payload}
        step.save(update_fields=["payload"])


def _content(connection, contact, subject, body, record):
    from services.mail import compose, html
    from services.mail.send_as import signature_block

    kind = "customer" if isinstance(record, Customer) else "account"
    return {
        "to": [[contact.name, contact.email]],
        "cc": [],
        "bcc": [],
        "subject": subject,
        "html": html.paragraphs(body) + signature_block(connection),
        "forwarded": [],
        "record": compose.Record(kind, record.pk, record.name),
    }


def apply(action, actor, **_):
    from services.mail import actions as mail_actions
    from services.mail import drafts as mail_drafts

    if actor is None:
        raise Stale("a person writes this email")
    record = action.record
    if record is None:
        raise Stale("the record is gone")
    # SOC2:AUTH-02 written as the runner, on a record they may open
    if not can_open(actor, record):
        raise StepFailed(CANT_OPEN)
    found = _diagnosis_of(action)
    if found is None or found.status != S.APPLIED:
        raise StepFailed(placeholders.needs_sentence(found.position if found else 1))
    # SOC2:AUTH-02 the diagnosis may rest on its runner's own mail: only they carry it on
    if found.decided_by_id != actor.pk:
        raise StepFailed(NOT_THE_DIAGNOSER.format(name=_name(found.decided_by_id)))
    connection = MailboxConnection.objects.filter(user=actor).first()
    stop = compose_blocked(connection)
    if stop:
        raise StepFailed(stop)
    # The server picks the address: never the model.
    contact = guided.main_contact(record, actor)
    if contact is None:
        raise StepFailed(NO_CONTACT.format(name=record.name))
    told = found.result if isinstance(found.result, dict) else {}
    gathered = diagnosis.gather(record, actor, action.bundle)
    try:
        subject, body = diagnosis.compose(
            action.organisation,
            actor,
            action.agent,
            gathered,
            contact,
            told.get("summary", ""),
            [f.get("text", "") for f in told.get("findings") or []],
        )
    except BudgetExceeded:
        raise StepFailed(NO_CREDITS) from None
    except (CopilotNotConfigured, CopilotRequestFailed, ValueError) as exc:
        logger.info("compose %s: no answer: %s", action.pk, type(exc).__name__)
        raise StepFailed(COULDNT) from None
    with transaction.atomic():
        locked_connection = mail_actions.lock_connection(connection)
        draft = mail_drafts.create(
            locked_connection,
            actor,
            kind=MailDraft.Kind.NEW,
            source=None,
            content=_content(locked_connection, contact, subject, body, record),
            now=timezone.now(),
            record_chosen=True,
        )
    handed = {
        "draft_id": draft.pk,
        "owner_id": actor.pk,
        "to": contact.email,
        "to_name": contact.name,
        "contact_id": contact.pk,
        "subject": subject,
        "body": body,
    }
    _hand(action, handed)
    return {"draft_id": draft.pk}, {**handed, "from": connection.address}


def undo(action, actor):
    from services.mail import drafts as mail_drafts

    result = action.result if isinstance(action.result, dict) else {}
    owner = result.get("owner_id")
    # SOC2:AUTH-02 a draft is its owner's alone, however senior the reader
    if owner != actor.pk:
        raise ChangedSince(NOT_YOURS.format(name=_name(owner)))
    draft = (
        MailDraft.objects.filter(owner_id=owner, pk=result.get("draft_id"))
        .exclude(status=MailDraft.Status.DISCARDED)
        .first()
    )
    if draft is not None:
        if draft.status != MailDraft.Status.OPEN:
            raise ChangedSince(SENT)
        locked = mail_drafts.lock(actor, draft.pk)
        mail_drafts.discard([locked], request=None, now=timezone.now())
    from ..deciding import locked as locked_step

    for pk in action.bundle.steps.filter(
        kind=K.MAIL_SEND_DRAFT, status=S.PROPOSED, position__gt=action.position
    ).values_list("pk", flat=True):
        step = locked_step(pk)
        step.payload = {k: v for k, v in (step.payload or {}).items() if k not in HANDED}
        step.save(update_fields=["payload"])


COMPOSE = Kind(
    key=AgentAction.Kind.MAIL_COMPOSE,
    label="Write an email",
    example="Write to Dana Smith to save Twilio",
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
    outputs=("draft_id",),
    message_only=True,
    on_threads=True,
)
