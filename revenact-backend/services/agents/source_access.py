"""Who may read a draft reply's action (owner decision 2, 2026-10-08): a
reader of its source, the email (its mailbox owner, or anyone once it is
added to Revenact, `mail.visibility`) or
the ticket (its department, `personal.visible_tickets`). Anyone else,
view-all readers included, has it counted in `hidden`, never named, and
may not decide or undo it.

One `id IN` subquery over the workspace's draft actions, each checked
against its own source only (a correlated EXISTS on the pk in its payload),
never a scan of every tenant's mail or tickets: no join, no DISTINCT
(Postgres 16). A source that is gone, or another workspace's, is unreadable."""

from django.db.models import BigIntegerField, Exists, OuterRef
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast

from services.customers.drafts import org_tickets_q
from services.customers.models import Email, Ticket
from services.customers.personal import visible_tickets
from services.mail.visibility import visible_emails
from services.metrics.models import AgentAction

from . import bulk

DRAFT = AgentAction.Kind.DRAFT_REPLY


def _source_pk(key):
    """The outer action's `payload[key]` as a pk (validated a whole number when proposed)."""
    return Cast(KeyTextTransform(key, OuterRef("payload")), output_field=BigIntegerField())


def unreadable_draft_ids(reader):
    """The draft replies in `reader`'s workspace whose source they may not
    read, as an `id IN` subquery."""
    organisation_id = reader.organisation_id
    # SOC2:AUTH-02 a draft reply quotes its source: only its source's readers read it
    email = visible_emails(
        reader,
        Email.objects.filter(
            pk=_source_pk("email_id"), mailbox_owner__organisation_id=organisation_id
        ),
    )
    ticket = visible_tickets(
        reader, Ticket.objects.filter(org_tickets_q(organisation_id), pk=_source_pk("ticket_id"))
    )
    return (
        AgentAction.objects.filter(organisation_id=organisation_id, kind=DRAFT)
        .exclude(Exists(email) | Exists(ticket))
        .values("id")
    )


def may_read_source(reader, action):
    """Whether `reader` may read `action`'s source; True for any other kind."""
    if action.kind != DRAFT:
        return True
    page = bulk.active()
    if page is not None and action.pk in page.draft_action_ids:
        return action.pk not in page.unreadable_drafts(reader)
    return not unreadable_draft_ids(reader).filter(id=action.pk).exists()
