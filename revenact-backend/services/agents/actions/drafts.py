"""draft.reply (Agents round §2, owner decisions 2026-10-08): a reply to a
record's newest unanswered customer email or its newest open ticket,
drafted for the record's owner. Nothing is sent: the owner sends an email
draft from Communications, or copies a ticket draft into its source and
marks it sent. Only readers of the source may read the action
(`agents.source_access`)."""

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from core import audit
from services.accounts.models import User
from services.customers.models import Email, ReplyDraft, Ticket
from services.customers.personal import visible_tickets
from services.mail import drafts as mail_drafts
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction

from .. import bulk
from ..edits import LONG_REPLY, NO_REPLY, checked, text_field
from ..kinds import AUTO, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale

BODY_LIMIT = 4000
#: How much of the body a preview shows.
EXCERPT = 280


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate(payload, row, ctx, evidence):
    email_id, ticket_id = payload.get("email_id"), payload.get("ticket_id")
    if _whole(email_id) == _whole(ticket_id):
        raise Invalid("a draft answers exactly one email or ticket")
    body = str(payload.get("body") or "").strip()
    if not body or len(body) > BODY_LIMIT:
        raise Invalid("a draft needs a body under 4000 characters")
    if _whole(email_id):
        source = ctx.emails.get(email_id)
        owner_id = (row.get("owner") or {}).get("id")
        if source is None or source["record"] != row["ref"] or owner_id not in ctx.mailboxes:
            raise Invalid("not this record's unanswered email, or no connected mailbox")
        clean = {"email_id": email_id, "body": body, "to": source["to"]}
        clean["subject"] = source["subject"]
    else:
        source = ctx.tickets.get(ticket_id)
        if source is None or source["record"] != row["ref"]:
            raise Invalid("not this record's open ticket")
        clean = {"ticket_id": ticket_id, "body": body, "ticket": source["number"]}
        clean["subject"] = source["title"]
    # It cites its own source's line, and only that.
    if any(line != source["line"].strip() for line in evidence):
        raise Invalid("a draft cites only its own email or ticket")
    return clean


def target(payload):
    if "email_id" in payload:
        return f"draft:email:{payload['email_id']}"
    return f"draft:ticket:{payload['ticket_id']}"


def _head(email_id):
    """The newest email in `email_id`'s thread for its mailbox owner, sent
    or received; None once the email is gone."""
    page = bulk.active()
    if page is not None and email_id in page.heads:
        return page.heads[email_id]
    email = Email.objects.filter(pk=email_id).values("mailbox_owner_id", "thread_id").first()
    if email is None:
        return None
    return (
        Email.objects.filter(
            mailbox_owner_id=email["mailbox_owner_id"], thread_id=email["thread_id"]
        )
        .order_by("-sent_at", "-id")
        .values_list("id", flat=True)
        .first()
    )


def _ticket_status(ticket_id):
    page = bulk.active()
    if page is not None and ticket_id in page.ticket_status:
        return page.ticket_status[ticket_id]
    return Ticket.objects.filter(pk=ticket_id).values_list("status", flat=True).first()


def current(action):
    """An email draft's thread head (someone replied, or the customer wrote
    again, and it moves). A ticket draft's ticket: "open" while open,
    in-progress or on-hold, "resolved" once resolved or closed, None once
    gone. Only resolving or closing it expires the draft (contract
    question 1)."""
    payload = action.payload
    if "email_id" in payload:
        return _head(payload["email_id"])
    status = _ticket_status(payload["ticket_id"])
    if status is None:
        return None
    return "resolved" if status in Ticket.RESOLVED_STATUSES else "open"


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    excerpt = str(payload.get("body", ""))[:EXCERPT]
    if "email_id" in payload:
        shown = {"channel": "email", "to": payload.get("to", "")}
    else:
        shown = {"channel": "ticket", "ticket": payload.get("ticket", "")}
    return {"draft": {**shown, "subject": payload.get("subject", ""), "excerpt": excerpt}}


def _tell(draft, action, actor, record):
    """`agent_draft_ready` to the draft's owner, unless they approved it."""
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    if actor is not None and actor.pk == draft.owner_id:
        return
    agent = AgentAction.Agent(action.agent).label
    if draft.channel == ReplyDraft.Channel.EMAIL:
        who = draft.email.sender_name or draft.email.from_address
        message = f"The {agent} drafted a reply to {who} on {record.name}."
    else:
        message = f"The {agent} drafted a reply to a ticket on {record.name}."
    notify(
        recipient=draft.owner,
        actor=actor,
        kind=Notification.Kind.AGENT_DRAFT_READY,
        message=message[:500],
        link=f"/communications?draft={draft.pk}",
        push_on_commit=True,
    )


def apply(action, actor, **_):
    """A ReplyDraft owned by the record's owner, whoever decides it."""
    record = action.record
    owner_id = None if record is None else record.owner_id
    owner = User.objects.filter(pk=owner_id, is_active=True).first() if owner_id else None
    if owner is None:
        raise Stale("the record or its owner is gone")
    payload = action.payload
    on = {"customer_id": action.customer_id, "account_id": action.account_id}
    if "email_id" in payload:
        email = Email.objects.filter(pk=payload["email_id"], **on).first()
        # The owner's own mail, still the newest in its thread (contract question 3).
        if email is None or email.mailbox_owner_id != owner.pk or _head(email.pk) != email.pk:
            raise Stale("the email moved on")
        if not MailboxConnection.objects.filter(
            user=owner, status=MailboxConnection.Status.CONNECTED
        ).exists():
            raise Stale("the mailbox is no longer connected")
        source = {
            "channel": ReplyDraft.Channel.EMAIL,
            "email": email,
            "to": [[email.sender_name, email.from_address]],
            "subject": payload["subject"],
            "written_subject": payload["subject"],
        }
    else:
        ticket = Ticket.objects.filter(pk=payload["ticket_id"], **on).first()
        # SOC2:AUTH-02 the draft's owner must read the ticket it answers
        readable = ticket is not None and (
            visible_tickets(owner, Ticket.objects.filter(pk=ticket.pk)).exists()
        )
        if not readable or ticket.status in Ticket.RESOLVED_STATUSES:
            raise Stale("the ticket moved on")
        source = {"channel": ReplyDraft.Channel.TICKET, "ticket": ticket}
    try:
        with transaction.atomic():
            draft = ReplyDraft.objects.create(
                organisation_id=action.organisation_id,
                owner=owner,
                customer_id=action.customer_id,
                account_id=action.account_id,
                body=payload["body"],
                written_body=payload["body"],
                agent=action.agent,
                agent_action=action,
                **source,
            )
    except IntegrityError:
        # One open draft per source (contract question 2).
        raise Stale("an open draft already answers it") from None
    audit.record(  # SOC2:LOG-01
        "reply_draft.created",
        actor=actor,
        organisation=action.organisation,
        target=draft,
        metadata={"channel": draft.channel, "agent_action": action.pk},
    )
    _tell(draft, action, actor, record)
    if draft.channel == ReplyDraft.Channel.EMAIL:
        # Decision 3: also a Gmail draft when the owner's mailbox is two-way and live.
        mail_drafts.link_agent_draft(draft, now=timezone.now())
    return draft.pk, {"draft_id": draft.pk}


def _draft(action, *, lock=False):
    draft_id = (action.result or {}).get("draft_id")
    page = bulk.active()
    if page is not None and not lock and draft_id in page.drafts:
        return page.drafts[draft_id]
    rows = ReplyDraft.objects.filter(pk=draft_id)
    if lock:
        rows = rows.select_for_update(of=("self",))
    return rows.first()


def undo(action, actor):
    """Deletes the draft while it is open and as the agent wrote it."""
    draft = _draft(action, lock=True)
    if draft is None:
        raise ChangedSince("This draft was discarded.")
    if draft.status != ReplyDraft.Status.OPEN:
        raise ChangedSince("This draft has been sent.")
    if draft.edited:
        raise ChangedSince("This draft has been edited since.")
    # A linked Gmail draft is discarded too (D3 §3).
    mail_drafts.discard_linked(draft, request=None, now=timezone.now())
    draft.delete()


def unchanged(action, current):
    """Undo's read-time hint: the draft is still open and as written."""
    draft = _draft(action)
    return draft is not None and draft.status == ReplyDraft.Status.OPEN and not draft.edited


class _ReplyEdit(serializers.Serializer):
    body = text_field(BODY_LIMIT, NO_REPLY, LONG_REPLY)


def edit(action, fields, runner):
    clean = checked(_ReplyEdit, fields)
    return {**action.payload, **clean}


REPLY = Kind(
    key=AgentAction.Kind.DRAFT_REPLY,
    label="Draft a reply",
    example="Draft a reply to Ann Lee's email about the renewal",
    max_level=AUTO,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    # A re-proposed draft for the same source is the same proposal, whatever its body.
    same=lambda a, b: target(a) == target(b),
    current=current,
    unchanged=unchanged,
    preview=preview,
    apply=apply,
    undo=undo,
    editable=("body",),
    edit=edit,
    outputs=("draft_id",),
    customer_facing=("body",),
)
