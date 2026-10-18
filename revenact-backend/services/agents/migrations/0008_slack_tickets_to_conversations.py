"""Slack escalations D1 (SE1-18): every Slack ticket becomes a Slack
conversation; its thread and its Slack reply steps follow; the ticket goes
(its reply drafts with it). Forwards only."""

from datetime import UTC, datetime, time

from django.db import migrations


def _at(ticket):
    try:
        return datetime.fromtimestamp(float(ticket.external_id), tz=UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        return datetime.combine(ticket.opened_at, time.min, tzinfo=UTC)


def forwards(apps, schema_editor):
    Ticket = apps.get_model("customers", "Ticket")
    Conversation = apps.get_model("customers", "SlackConversation")
    Thread = apps.get_model("agents", "SignalThread")
    Action = apps.get_model("metrics", "AgentAction")
    User = apps.get_model("accounts", "User")
    for ticket in Ticket.objects.filter(connector__provider="slack").select_related("connector"):
        connector = ticket.connector
        config = connector.config or {}
        ts = (ticket.external_id or str(ticket.pk))[:32]
        email = (ticket.requester_email or "").lower()
        member = (
            User.objects.filter(
                organisation_id=connector.organisation_id, email__iexact=email, is_active=True
            ).first()
            if email
            else None
        )
        conversation, _ = Conversation.objects.get_or_create(
            connector=connector,
            thread_ts=ts,
            defaults={
                "customer_id": ticket.customer_id,
                "account_id": ticket.account_id,
                "department": ticket.department,
                "channel": str(config.get("channel", ""))[:32],
                "channel_name": str(config.get("channel_name", ""))[:80],
                "title": ticket.title[:255],
                "messages": [
                    {
                        "ts": ts,
                        "user_id": "",
                        "name": ticket.requester_name,
                        "text": (ticket.description or "")[:3000],
                        "bot": False,
                    }
                ],
                "started_by": member,
                "started_by_name": ticket.requester_name,
                "started_by_email": email,
                "url": ticket.external_url or "",
                "last_message_at": _at(ticket),
                "matched_by": "earlier",
                "external_shared": bool(config.get("external_shared")),
            },
        )
        Thread.objects.filter(ticket_id=ticket.pk).update(
            conversation_id=conversation.pk, ticket_id=None
        )
        for step in Action.objects.filter(kind="slack.reply", payload__ticket_id=ticket.pk):
            payload = {k: v for k, v in step.payload.items() if k != "ticket_id"}
            payload["conversation_id"] = conversation.pk
            step.payload = payload
            step.target = f"draft:conversation:{conversation.pk}"
            fields = ["payload", "target"]
            if step.status == "proposed":
                step.before = "open"  # nothing resolves a conversation (SE1-13)
                fields.append("before")
            step.save(update_fields=fields)
        ticket.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0007_signal_thread_conversation"),
        ("customers", "0062_slackconversation"),
        ("connectors", "0007_unmatched_candidates"),
        ("metrics", "0018_agent_action_jira_comment"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
