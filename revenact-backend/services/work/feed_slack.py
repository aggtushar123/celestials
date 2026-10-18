"""The Slack messages a reader sent to their own Work with the "Send to
Revenact" shortcut (Connections spec §3, option A), as rows of the feed's
suggested group. The reader's own alone: no Team scope, no chain, no
company reach ever reads them."""

from rest_framework import serializers

from .feed_shape import SLACK_MESSAGE, after_q, item, record_ref
from .models import SlackSuggestion

FROM = {"type": "slack", "label": "Slack"}
ORDER = ("created_at", "id")
EXCERPT = 280
_stamp = serializers.DateTimeField().to_representation


def mine(reader):
    # SOC2:AUTH-02 a Slack message sent to Work is its sender's alone, in their workspace
    return SlackSuggestion.objects.filter(
        owner_id=reader.pk, organisation_id=reader.organisation_id
    )


def suggested_step(kind):
    if not kind:
        return None
    from services.metrics.models import AgentAction

    labels = dict(AgentAction.Kind.choices)
    return {"kind": kind, "label": labels.get(kind, kind)} if kind in labels else None


#: Open tickets shown with a message's customer, newest first.
OPEN_TICKETS = 3
#: A page reads at most this many open tickets for all its records together.
MAX_TICKETS_READ = 200


def _day(value):
    return value.date() if hasattr(value, "date") else value


def open_tickets(reader, records):
    """{(type, id): the record's newest open tickets the reader may read}, in
    one query for a page: number, title, link, days open."""
    from django.db.models import Q
    from django.utils import timezone

    from services.customers.models import Account, Ticket
    from services.customers.personal import visible_tickets

    customers = {r.pk for r in records if not isinstance(r, Account)}
    accounts = {r.pk for r in records if isinstance(r, Account)}
    if not customers and not accounts:
        return {}
    base = Ticket.objects.filter(
        Q(customer_id__in=sorted(customers)) | Q(account_id__in=sorted(accounts))
    ).exclude(status__in=Ticket.RESOLVED_STATUSES)
    # SOC2:AUTH-02 the department rule the Tickets tab uses
    rows = visible_tickets(reader, base).order_by("-opened_at", "-id")[:MAX_TICKETS_READ]
    today = timezone.localdate()
    found = {}
    for t in rows:
        key = ("account", t.account_id) if t.account_id else ("customer", t.customer_id)
        bucket = found.setdefault(key, [])
        if len(bucket) < OPEN_TICKETS:
            bucket.append(
                {
                    "number": t.ticket_number,
                    "title": t.title,
                    "url": t.external_url,
                    "days_open": (today - _day(t.opened_at)).days if t.opened_at else None,
                }
            )
    return found


def _key(record):
    from services.customers.models import Account

    return ("account" if isinstance(record, Account) else "customer", record.pk)


def detail(row, *, record=None, jira=None, tickets=None):
    from services.customers.communications import _context_for

    from .slack_actions import project_of

    return {
        "summary": row.summary,
        "text": row.text,
        "excerpt": row.text[:EXCERPT],
        "sender": row.sender_name,
        "permalink": row.permalink,
        "suggested_step": suggested_step(row.suggested_kind),
        # Only a record the reader may still open: its numbers and tickets.
        "context": _context_for(record) if record is not None else None,
        "open_tickets": (tickets or {}).get(_key(record), []) if record is not None else [],
        "jira": {
            "available": jira is not None,
            "project": project_of(jira) if jira is not None else "",
            "summary": row.jira_summary or row.summary,
            "description": row.jira_description or row.text,
            "key": row.jira_key,
            "url": row.jira_url,
        },
        "reply": {
            "to": row.sender_name,
            "draft": row.reply_draft,
            "with_issue": row.reply_with_issue,
            "sent_at": _stamp(row.replied_at) if row.replied_at else None,
            "url": row.reply_url,
        },
        # Slack handover (2026-10-18): the colleagues it was sent to, [{id, name}].
        "handed_to": list(row.handed_to or []),
    }


def slack_item(row, *, may_open=True, jira=None, tickets=None):
    """The FeedItem; the record is named only when the reader may still open it."""
    record = row.record if may_open else None
    return item(
        key=f"slack_message:{row.pk}",
        kind=SLACK_MESSAGE,
        pk=row.pk,
        title=row.summary,
        record=record_ref(record) if record is not None else None,
        source=FROM,
        at=row.created_at,
        private=True,
        actions=["open", "dismiss", "jira", "reply"],
        detail=detail(row, record=record, jira=jira, tickets=tickets),
    )


def bundled():
    """Slack bundles (owner, 2026-10-17): the cards whose bundle stands in for
    them, as an `id IN` subquery: waiting (inside its 14 days), running, run
    or rejected. An expired or superseded bundle gives the card back."""
    from django.db.models import Q
    from django.utils import timezone

    from services.agents.deciding import WAIT
    from services.agents.models import AgentBundle

    B = AgentBundle.Status
    return (
        AgentBundle.objects.filter(
            source=AgentBundle.Source.SLACK_MESSAGE, slack_suggestion__isnull=False
        )
        .filter(
            Q(status__in=(B.RUNNING, B.DONE, B.PARTLY_DONE, B.REJECTED))
            | Q(status=B.WAITING, created_at__gt=timezone.now() - WAIT)
        )
        .values("slack_suggestion_id")
    )


class SlackMessages:
    kind = SLACK_MESSAGE

    def __init__(self, reader):
        self.reader = reader
        # The bundle item replaces the card while it stands (Slack bundles); a
        # message handed to the reader shows as its task instead (Slack handover).
        self.rows = mine(reader).exclude(id__in=bundled()).filter(handed_from__isnull=True)

    def _openable(self, rows):
        """{row pk: whether the reader may open its record}, two queries at most."""
        from services.customers.scoping import visible_accounts, visible_customers

        customers = {r.customer_id for r in rows if r.account_id is None and r.customer_id}
        accounts = {r.account_id for r in rows if r.account_id}
        # SOC2:AUTH-02 the twice-filter: a record is named only while the reader may open it
        seen_c = (
            set(
                visible_customers(self.reader)
                .filter(id__in=sorted(customers))
                .values_list("id", flat=True)
            )
            if customers
            else set()
        )
        seen_a = (
            set(
                visible_accounts(self.reader)
                .filter(id__in=sorted(accounts))
                .values_list("id", flat=True)
            )
            if accounts
            else set()
        )
        return {
            r.pk: (r.account_id in seen_a) if r.account_id else (r.customer_id in seen_c)
            for r in rows
        }

    def count(self):
        return self.rows.count()

    def page(self, after, limit):
        rows = self.rows.select_related("customer__owner", "account__owner")
        if after is not None:
            rows = rows.filter(after_q(ORDER, after, descending=True))
        found = list(rows.order_by("-created_at", "-id")[:limit])
        opens = self._openable(found)
        from .slack_actions import jira_connector

        jira = jira_connector(self.reader.organisation_id) if found else None
        named = [row.record for row in found if opens[row.pk] and row.record is not None]
        tickets = open_tickets(self.reader, named)
        return [
            (
                (row.created_at, row.pk),
                slack_item(row, may_open=opens[row.pk], jira=jira, tickets=tickets),
            )
            for row in found
        ]
