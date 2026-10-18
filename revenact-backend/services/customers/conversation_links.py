"""Slack escalations D4 (contract SE4-17, spec §6): a Slack thread and the
Jira tickets filed from it, each shown on the other, and named only when
the reader may read it on its own (the twice-filter): its department
(`visible_tickets` / `visible_conversations`' rule) and the same record as
the side being read. What they may not read is counted (`hidden_links`),
never named."""

from .models import Ticket
from .personal import reads_every_ticket_department

FIELDS = (
    "id",
    "conversation_id",
    "ticket_number",
    "status",
    "assignee_name",
    "external_url",
    "department",
    "customer_id",
    "account_id",
)


def _reads(user, department):
    # SOC2:AUTH-02 visible_tickets' and visible_conversations' rule, for one row
    return reads_every_ticket_department(user) or department in ("", user.function)


def record_of(row):
    """("account" | "customer", id) for a model row or a values() dict."""
    get = row.get if isinstance(row, dict) else lambda key: getattr(row, key)
    if get("account_id"):
        return ("account", get("account_id"))
    return ("customer", get("customer_id"))


def ticket_line(row):
    """Contract §2.3's ticket line from a values() row."""
    assignee = (row["assignee_name"] or "").strip()
    url = row["external_url"] or ""
    return {
        "id": row["id"],
        "number": row["ticket_number"],
        "status": row["status"],
        "assignee": None if assignee in ("", "Unassigned") else assignee,
        "url": url if url.startswith("https://") else None,
    }


def _rows(conversation_ids):
    return (
        Ticket.objects.filter(conversation_id__in=conversation_ids)
        .order_by("opened_at", "id")
        .values(*FIELDS)
    )


def _named(user, row, record):
    return _reads(user, row["department"]) and record_of(row) == record


def tickets_for(user, conversation):
    """(lines, hidden) for one conversation the reader already may read: one query."""
    lines, hidden = [], 0
    record = record_of(conversation)
    for row in _rows([conversation.pk]):
        if _named(user, row, record):
            lines.append(ticket_line(row))
        else:
            hidden += 1
    return lines, hidden


def _from_slack(user, conversation, record):
    if conversation is None:
        return None, 0
    if _reads(user, conversation.department) and record_of(conversation) == record:
        return {
            "id": conversation.pk,
            "channel": f"#{conversation.channel_name}" if conversation.channel_name else "",
            # As the Slack item's actor: the member when the thread links one
            "started_by": (
                conversation.started_by.name
                if conversation.started_by is not None
                else conversation.started_by_name
            ),
        }, 0
    return None, 1


def attach(items, user):
    """Each Slack item's `tickets` and each ticket item's `from_slack`, with
    `hidden_links`; the private keys `render` left (`_record`,
    `_conversation`) are dropped. One query, only when a Slack item is there."""
    slack, records = {}, {}
    for item in items:
        record = item.pop("_record", None)
        if item["kind"] == "ticket":
            item["from_slack"], item["hidden_links"] = _from_slack(
                user, item.pop("_conversation", None), record
            )
        elif item["kind"] == "slack":
            item["tickets"], item["hidden_links"] = [], 0
            slack[item["id"]], records[item["id"]] = item, record
    if not slack:
        return items
    for row in _rows(list(slack)):
        item = slack[row["conversation_id"]]
        if _named(user, row, records[item["id"]]):
            item["tickets"].append(ticket_line(row))
        else:
            item["hidden_links"] += 1
    return items
