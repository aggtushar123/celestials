"""Slack escalations D3 (SC3-11): a one-channel Slack connection becomes a
connection with that channel, caught up as of now (the poll read its last 7
days). Its single record (D1's "Choose its customer") moves onto the
channel; its agent threads and its waiting Needs-a-customer rows take keys
with the channel. `config["channel"]` stays, unused. Forwards only."""

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    Connector = apps.get_model("connectors", "Connector")
    Channel = apps.get_model("connectors", "SlackChannel")
    Unmatched = apps.get_model("connectors", "UnmatchedItem")
    Thread = apps.get_model("agents", "SignalThread")
    now = timezone.now()
    for connector in Connector.objects.filter(provider="slack"):
        config = connector.config or {}
        channel = str(config.get("channel") or "").strip()[:32]
        if not channel:
            continue
        customers = list(connector.customers.all()[:2])
        accounts = list(connector.accounts.all()[:2])
        customer = customers[0] if len(customers) == 1 and not accounts else None
        account = accounts[0] if len(accounts) == 1 and not customers else None
        Channel.objects.get_or_create(
            connector=connector,
            channel_id=channel,
            defaults={
                "name": str(config.get("channel_name") or "")[:80],
                "is_private": channel.startswith("G"),
                "external_shared": bool(config.get("external_shared")),
                "is_member": True,
                "included": True,
                "customer": customer,
                "account": account,
                "read_at": now,
            },
        )
        if customer is not None or account is not None:
            connector.customers.clear()
            connector.accounts.clear()
        for row in Unmatched.objects.filter(connector=connector, provider="slack"):
            if ":" not in row.external_id:
                row.external_id = f"{channel}:{row.external_id}"[:128]
                row.save(update_fields=["external_id"])
        prefix = f"{connector.pk}:"
        rows = Thread.objects.filter(
            source_kind="slack", external_id__startswith=prefix
        ).select_related("conversation")
        for thread in rows:
            ts = thread.external_id[len(prefix) :]
            if ":" in ts:
                continue
            own = thread.conversation.channel if thread.conversation_id else ""
            thread.external_id = f"{connector.pk}:{own or channel}:{ts}"
            thread.save(update_fields=["external_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("connectors", "0009_slackchannel"),
        ("customers", "0064_slackconversation_channel_once"),
        ("agents", "0008_slack_tickets_to_conversations"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
