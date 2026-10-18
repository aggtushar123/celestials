"""Reply drafts (Agents round §2, owner decision 2026-10-08): who may read
one, the contract's ReplyDraft shape, and the checks on an edit.

A draft is read by its owner, and by anyone who may open its record and
read its source: the email's mailbox chain (`mail.visibility`), the
ticket's department (`personal.visible_tickets`). Anyone else gets a 404.
Every write is the owner's (`drafts_views`). `id IN` subqueries, never a
join made unique with DISTINCT (Postgres 16)."""

from datetime import timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import Account, Customer, Email, ReplyDraft, Ticket
from .personal import visible_tickets
from .scoping import visible_accounts, visible_customers

stamp = serializers.DateTimeField().to_representation

#: The most drafts the list returns; it has no pages.
LIST_LIMIT = 100
#: What every read of a draft loads with it.
RELATED = ("customer", "account", "email", "ticket__connector", "owner", "sent_by", "mail_draft")
BODY_LIMIT = 20_000
SUBJECT_LIMIT = 255
WRITE_REPLY = "Write the reply."
LONG_BODY = "Keep the reply under 20,000 characters."
LONG_SUBJECT = "Keep the subject under 255 characters."
TICKET_SUBJECT = "A ticket reply has no subject."
SEND_AN_OBJECT = "Send the fields as one object."
#: How long a claimed send (`sending`) waits for its provider before its
#: owner may say whether it went (confirm-sent) or not (reopen).
UNCONFIRMED_AFTER = timedelta(minutes=10)


def org_tickets_q(organisation_id):
    """A ticket of `organisation_id`'s, on one of its organisations or their
    accounts (Account has no organisation of its own): an `id IN`, no join
    made unique."""
    links = Account.customers.through.objects.filter(customer__organisation_id=organisation_id)
    return Q(customer__organisation_id=organisation_id) | Q(
        account_id__in=links.values("account_id")
    )


def readable_drafts(reader):
    """The drafts in `reader`'s workspace they may read."""
    on_record = Q(customer_id__in=visible_customers(reader).values("id")) | Q(
        account_id__in=visible_accounts(reader).values("id")
    )
    # SOC2:AUTH-02 a draft quotes its source: read by its owner, or on a
    # record the reader opens with a source they may read
    # Only the workspace's own drafts' sources, never every tenant's.
    own = ReplyDraft.objects.filter(organisation_id=reader.organisation_id)
    # A reply to mail is its mailbox owner's work, shared or not (2026-10-17).
    emails = Email.objects.filter(
        mailbox_owner=reader,
        id__in=own.filter(email__isnull=False).values("email_id"),
        mailbox_owner__organisation_id=reader.organisation_id,
    ).values("id")
    tickets = visible_tickets(
        reader,
        Ticket.objects.filter(
            org_tickets_q(reader.organisation_id),
            id__in=own.filter(ticket__isnull=False).values("ticket_id"),
        ),
    ).values("id")
    source = Q(email_id__in=emails) | Q(ticket_id__in=tickets)
    return ReplyDraft.objects.filter(organisation_id=reader.organisation_id).filter(
        Q(owner_id=reader.pk) | (on_record & source)
    )


def _person(user):
    return None if user is None else {"id": user.pk, "name": user.name}


def _record(draft):
    record = draft.record
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def _source(draft):
    if draft.channel == ReplyDraft.Channel.EMAIL:
        email = draft.email
        return {
            "kind": "email",
            "id": email.pk,
            "subject": email.subject,
            "from": {"name": email.sender_name, "address": email.from_address},
            "sent_at": stamp(email.sent_at),
        }
    ticket = draft.ticket
    connector = ticket.connector
    return {
        "kind": "ticket",
        "id": ticket.pk,
        "number": ticket.ticket_number,
        "title": ticket.title,
        # A ticket raised in Revenact has no source system.
        "external_url": None if connector is None else (ticket.external_url or None),
        "source_name": None if connector is None else connector.name,
    }


def _sending(draft):
    """`pending`, then `unconfirmed` once UNCONFIRMED_AFTER has passed since
    the claim; None for a draft not being sent."""
    if draft.status != ReplyDraft.Status.SENDING:
        return None
    waited = timezone.now() - draft.updated_at
    return "unconfirmed" if waited >= UNCONFIRMED_AFTER else "pending"


def email_summary(email):
    """A send's filed email, as the send routes answer it; None when unfiled."""
    if email is None:
        return None
    return {
        "id": email.pk,
        "subject": email.subject,
        "sent_at": stamp(email.sent_at),
        "thread_id": email.thread_id,
    }


def _mail_draft_id(draft, reader):
    """The linked Gmail draft (D3 decision 4): its owner's alone."""
    # SOC2:AUTH-02 another reader never learns of the owner's Gmail draft
    if draft.owner_id != reader.pk:
        return None
    try:
        return draft.mail_draft.pk
    except ObjectDoesNotExist:
        return None


def draft_payload(draft, reader):
    """The contract's ReplyDraft, for `reader`. Needs `RELATED` loaded."""
    is_email = draft.channel == ReplyDraft.Channel.EMAIL
    sending = _sending(draft)
    return {
        "id": draft.pk,
        "channel": draft.channel,
        # `sending` is internal: a draft being sent reads as sent (sent_at null).
        "status": ReplyDraft.Status.OPEN if draft.status == ReplyDraft.Status.OPEN else "sent",
        "sending": sending,
        "record": _record(draft),
        "source": _source(draft),
        "to": [list(pair) for pair in draft.to] if is_email else None,
        "subject": draft.subject if is_email else None,
        "body": draft.body,
        "agent": draft.agent,
        "agent_action_id": draft.agent_action_id,
        "mail_draft_id": _mail_draft_id(draft, reader),
        "owner": _person(draft.owner),
        "edited": draft.edited,
        "created_at": stamp(draft.created_at),
        "updated_at": stamp(draft.updated_at),
        "sent_at": None if draft.sent_at is None else stamp(draft.sent_at),
        "sent_by": _person(draft.sent_by),
        # SOC2:AUTH-02 only the owner writes, and only while it is open
        "can_edit": draft.owner_id == reader.pk and draft.status == ReplyDraft.Status.OPEN,
        # SOC2:AUTH-02 only the owner, who may send it, settles an unconfirmed send
        "can_resolve": draft.owner_id == reader.pk and sending == "unconfirmed",
    }


def clean_edits(draft, data):
    """The `{body, subject}` a PATCH (or a Send) would set, checked: every
    field's problem at once, as a 400. Nothing else is taken: recipients
    are fixed to the source email's sender (contract)."""
    if not isinstance(data, dict):
        raise ValidationError({"non_field_errors": [SEND_AN_OBJECT]})
    errors, clean = {}, {}
    if "body" in data:
        body = data["body"] if isinstance(data["body"], str) else ""
        if not body.strip():
            errors["body"] = [WRITE_REPLY]
        elif len(body) > BODY_LIMIT:
            errors["body"] = [LONG_BODY]
        else:
            clean["body"] = body
    if "subject" in data:
        subject = data["subject"] if isinstance(data["subject"], str) else ""
        if draft.channel == ReplyDraft.Channel.TICKET:
            errors["subject"] = [TICKET_SUBJECT]
        elif len(subject) > SUBJECT_LIMIT:
            errors["subject"] = [LONG_SUBJECT]
        else:
            clean["subject"] = subject
    if errors:
        raise ValidationError(errors)
    return clean


def apply_edits(draft, clean):
    """Set `clean` on `draft` and save it; the changed names, sorted."""
    changed = sorted(name for name, value in clean.items() if getattr(draft, name) != value)
    for name in changed:
        setattr(draft, name, clean[name])
    if changed:
        draft.save(update_fields=[*changed, "updated_at"])
    return changed
