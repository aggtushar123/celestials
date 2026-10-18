"""An issue a step made from a Slack conversation is filed at once (Slack
escalations D4, SE4-8): a Ticket on the step's record, through the Jira
connection, linked to the thread. Later syncs update it by (connector,
external_id), as any issue (`sync.file_ticket`'s existing branch). Filing
never fails the step: it is logged."""

import logging

from django.db import transaction

from services.customers.models import SlackConversation, Ticket
from services.work.clock import today_for

logger = logging.getLogger(__name__)
PRIORITIES = {value.casefold(): value for value in Ticket.Priority.values}


def _conversation(action):
    pk = (action.payload or {}).get("conversation_id")
    if not isinstance(pk, int) or isinstance(pk, bool):
        return None
    on = (
        {"account_id": action.account_id}
        if action.account_id
        else {"customer_id": action.customer_id}
    )
    # SOC2:AUTH-02 only a conversation on the step's own record
    return SlackConversation.objects.filter(pk=pk, **on).first()


def file_made_issue(action, connector, issue, actor):
    """The Ticket for `issue` (a tools.Issue) on the step's record, made or
    found; None when the connection doesn't cover the record or filing failed."""
    try:
        record = action.record
        # SOC2:AUTH-02 a ticket is filed only on a record its connection covers (Ticket.clean)
        if record is None or not connector.covers(customer=action.customer, account=action.account):
            return None
        payload = action.payload or {}
        conversation = _conversation(action)
        named = str((payload.get("priority") or {}).get("name") or "").casefold()
        with transaction.atomic():
            ticket, made = Ticket.objects.get_or_create(
                connector=connector,
                external_id=issue.key[:128],
                defaults={
                    "customer": action.customer,
                    "account": action.account,
                    "ticket_number": issue.key[:32],
                    "title": str(payload.get("summary") or issue.key)[:255],
                    "assignee_name": "Unassigned",
                    "status": Ticket.Status.OPEN,
                    "priority": PRIORITIES.get(named, Ticket.Priority.MEDIUM),
                    "department": connector.department,
                    "external_url": issue.url[:500],
                    "description": str(payload.get("description") or ""),
                    "requester_name": actor.name[:150],
                    "opened_at": today_for(action.organisation),
                    "conversation": conversation,
                },
            )
            if not made and ticket.conversation_id is None and conversation is not None:
                Ticket.objects.filter(pk=ticket.pk).update(conversation=conversation)
    except Exception as exc:  # noqa: BLE001 - filing never fails the step (SE4-8)
        logger.warning("agents: filing a made issue failed: %s", type(exc).__name__)
        return None
    return ticket
