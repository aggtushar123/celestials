"""Delivery 1's rejected bundles name who rejected them (agent bundles
D2-28): the first rejected step's `decided_by`. Reverse: nothing to undo."""

from django.db import migrations


def backfill(apps, schema_editor):
    AgentBundle = apps.get_model("agents", "AgentBundle")
    AgentAction = apps.get_model("metrics", "AgentAction")
    rejected = AgentBundle.objects.filter(status="rejected", rejected_by__isnull=True)
    for pk in list(rejected.values_list("pk", flat=True)):
        who = (
            AgentAction.objects.filter(bundle_id=pk, status="rejected", decided_by__isnull=False)
            .order_by("position", "pk")
            .values_list("decided_by_id", flat=True)
            .first()
        )
        if who is not None:
            AgentBundle.objects.filter(pk=pk).update(rejected_by_id=who)


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0004_signal_thread"),
        ("metrics", "0016_agent_action_edited_at"),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
