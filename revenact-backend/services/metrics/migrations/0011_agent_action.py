from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

LEGACY = {"task": "task.create", "initiative": "initiative.create"}


def forwards(apps, schema_editor):
    """Each old proposal becomes the action it always was: an Ops agent's
    task or initiative. A task's organisation moves from the JSON into the
    FK; one that no longer exists leaves a waiting task expired."""
    AgentAction = apps.get_model("metrics", "AgentAction")
    Customer = apps.get_model("customers", "Customer")
    for action in AgentAction.objects.all().iterator():
        old = action.payload if isinstance(action.payload, dict) else {}
        action.agent = "ops"
        action.target = f"legacy:{action.pk}"
        action.kind = LEGACY.get(action.kind, action.kind)
        if action.kind == "task.create":
            customer_id = old.get("customer_id")
            if (
                isinstance(customer_id, int)
                and Customer.objects.filter(
                    pk=customer_id, organisation_id=action.organisation_id
                ).exists()
            ):
                action.customer_id = customer_id
            elif action.status == "proposed":
                action.status = "expired"
                action.expired_reason = "changed"
            action.payload = {
                "title": old.get("title") or action.title,
                "assignee_id": None,
                "assignee_name": old.get("assignee_name") or "",
                "due_date": old.get("due_date"),
                "priority": old.get("priority") or "medium",
            }
        if action.status == "approved":
            action.status = "applied"
            action.applied_at = action.decided_at
        action.save()


def backwards(apps, schema_editor):
    AgentAction = apps.get_model("metrics", "AgentAction")
    back = {new: old for old, new in LEGACY.items()}
    for action in AgentAction.objects.all().iterator():
        if action.kind not in back:
            action.delete()
            continue
        payload = dict(action.payload or {})
        if action.kind == "task.create" and action.customer_id is not None:
            payload["customer_id"] = action.customer_id
        action.kind = back[action.kind]
        action.payload = payload
        if action.status in ("applied", "undone"):
            action.status = "approved"
        elif action.status == "expired":
            action.status = "rejected"
        action.save()


class Migration(migrations.Migration):
    dependencies = [
        ("metrics", "0010_initiative_baseline_scope"),
        ("customers", "0057_task_tracking"),
        ("copilot", "0019_modelcall_scope_key"),
        # Work's recommendations point at the proposal: it must exist first.
        ("work", "0003_digestsend"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel("Proposal", "AgentAction"),
        # Keep the legacy table's name (contract, Compatibility).
        migrations.AlterModelTable("agentaction", "metrics_proposal"),
        migrations.RenameField("agentaction", "action", "payload"),
        migrations.AddField(
            "agentaction",
            "agent",
            models.CharField(
                choices=[("cs", "CS agent"), ("sales", "Sales agent"), ("ops", "Ops agent")],
                default="ops",
                max_length=8,
            ),
        ),
        migrations.AddField(
            "agentaction",
            "customer",
            models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="agent_actions",
                to="customers.customer",
            ),
        ),
        migrations.AddField(
            "agentaction",
            "account",
            models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="agent_actions",
                to="customers.account",
            ),
        ),
        migrations.AddField("agentaction", "target", models.CharField(blank=True, max_length=160)),
        migrations.AddField("agentaction", "before", models.JSONField(blank=True, null=True)),
        migrations.AddField("agentaction", "after", models.JSONField(blank=True, null=True)),
        migrations.AddField("agentaction", "auto", models.BooleanField(default=False)),
        migrations.AddField(
            "agentaction", "applied_at", models.DateTimeField(blank=True, null=True)
        ),
        migrations.AddField(
            "agentaction",
            "undone_by",
            models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            "agentaction", "undone_at", models.DateTimeField(blank=True, null=True)
        ),
        migrations.AddField(
            "agentaction", "expired_reason", models.CharField(blank=True, max_length=24)
        ),
        migrations.AlterField(
            "agentaction",
            "kind",
            models.CharField(
                choices=[
                    ("record.lifecycle", "Change lifecycle stage"),
                    ("record.owner", "Change owner"),
                    ("record.attribute", "Set an AI attribute"),
                    ("task.create", "Create a task"),
                    ("task.reassign", "Reassign a task"),
                    ("task.redate", "Change a task's due date"),
                    ("task.complete", "Mark a task done"),
                    ("task.snooze", "Snooze a task"),
                    ("note.create", "File a note"),
                    ("initiative.create", "Start an initiative"),
                ],
                max_length=24,
            ),
        ),
        migrations.AlterField(
            "agentaction",
            "status",
            models.CharField(
                choices=[
                    ("proposed", "Proposed"),
                    ("applied", "Applied"),
                    ("rejected", "Rejected"),
                    ("expired", "Expired"),
                    ("undone", "Undone"),
                ],
                default="proposed",
                max_length=16,
            ),
        ),
        # State-only: the help text follows the new meaning.
        migrations.AlterField(
            "agentaction",
            "batch",
            models.CharField(help_text="One run; its actions share it.", max_length=32),
        ),
        migrations.AlterField(
            "agentaction",
            "payload",
            models.JSONField(help_text="Exactly what applying does, validated when proposed."),
        ),
        migrations.AlterField(
            "agentaction",
            "result",
            models.JSONField(
                blank=True, default=dict, help_text="What applying created, e.g. a task id."
            ),
        ),
        migrations.AlterField(
            "agentaction",
            "session",
            models.ForeignKey(
                blank=True,
                help_text="Set when the facilitator wrote this from a multiplayer session's "
                "decisions rather than an agent from the figures alone.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="proposals",
                to="copilot.copilotsession",
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.AddIndex(
            "agentaction",
            models.Index(fields=["organisation", "status", "agent"], name="agent_action_queue"),
        ),
        migrations.AddConstraint(
            "agentaction",
            models.UniqueConstraint(
                condition=models.Q(status="proposed"),
                fields=("organisation", "kind", "customer", "account", "target"),
                name="agent_action_one_open",
                nulls_distinct=False,
            ),
        ),
    ]
