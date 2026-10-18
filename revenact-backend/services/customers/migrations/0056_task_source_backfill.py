"""Where each existing task came from (Work round, spec §1.1): a plan's tasks
carry `plan`; an approved AI-agent proposal's carry `initiative` when the
proposal served one; everything else is called manual. Rule-made tasks
cannot be told apart (no rule link is stored) and read as manual.

`backfill` takes the model so the test can run it on the real one
(services/customers/tests/test_task_model.py)."""

from django.db import migrations


def backfill(Task):
    Task.objects.filter(plan__isnull=False).update(source="plan")
    Task.objects.filter(plan__isnull=True, initiative__isnull=False).update(source="agent")
    Task.objects.filter(plan__isnull=True, initiative__isnull=True).update(source="manual")


def forwards(apps, schema_editor):
    backfill(apps.get_model("customers", "Task"))


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0055_task_work"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
