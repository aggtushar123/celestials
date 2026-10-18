"""Every existing agent action becomes a bundle of one (Agent bundles,
contract §1.4). Batches of 500; the bundle keeps the action's dates."""

from django.db import migrations

BATCH = 500
BUNDLE = {
    "proposed": "waiting",
    "applied": "done",
    "undone": "done",
    "rejected": "rejected",
    "expired": "expired",
}
LINK = {
    "task_id": ("task_url", "/work/mine?task={}"),
    "campaign_id": ("campaign_url", "/campaigns/{}"),
    "survey_id": ("survey_url", "/surveys/{}"),
    "segment_id": ("segment_url", "/segments/{}"),
    "rule_id": ("rule_url", "/scenarios/rules/{}"),
    "canvas_id": ("canvas_url", "/canvas/{}"),
}
IDS = ("note_id", "draft_id", "plan_id", "template_id", "initiative_id", "send_id", *LINK)


def outputs(result):
    out = {}
    for key in IDS:
        value = (result or {}).get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            out[key] = value
            if key in LINK:
                link_key, pattern = LINK[key]
                out[link_key] = pattern.format(value)
    return out


def forwards(apps, schema_editor):
    Action = apps.get_model("metrics", "AgentAction")
    Bundle = apps.get_model("agents", "AgentBundle")
    rows = Action.objects.filter(bundle__isnull=True).select_related("customer", "account")
    while True:
        batch = list(rows.order_by("id")[:BATCH])
        if not batch:
            return
        for action in batch:
            record = action.account if action.account_id else action.customer
            status = BUNDLE.get(action.status, "expired")
            if status == "expired" and action.expired_reason == "replaced":
                status = "superseded"
            ran = status == "done"
            bundle = Bundle.objects.create(
                organisation_id=action.organisation_id,
                agent=action.agent,
                title=action.title,
                reason=action.rationale,
                source="nightly",
                customer_id=action.customer_id,
                account_id=action.account_id,
                routed_to="owner" if record is not None else "admins",
                routed_user_id=getattr(record, "owner_id", None),
                status=status,
                run_by_id=action.decided_by_id if ran else None,
                run_started_at=action.decided_at if ran else None,
                run_finished_at=action.decided_at if ran else None,
                reject_note=(action.decision_note or "")[:255] if status == "rejected" else "",
            )
            Bundle.objects.filter(pk=bundle.pk).update(
                created_at=action.created_at, updated_at=action.decided_at or action.created_at
            )
            Action.objects.filter(pk=action.pk).update(
                bundle_id=bundle.pk, position=1, selected=True, outputs=outputs(action.result)
            )


def backwards(apps, schema_editor):
    Action = apps.get_model("metrics", "AgentAction")
    Action.objects.update(bundle_id=None)
    apps.get_model("agents", "AgentBundle").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0002_agent_bundle"),
        ("metrics", "0014_agent_action_steps"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
