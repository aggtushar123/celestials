"""plan.start (Agents round §2, owner decision 3): start a plan on a CS or
Sales record from a template every member may read. Ask only, so a person
approves it and is its actor (`starting.start_plan` needs one). Undo takes
the plan back to Draft, its tasks kept on it (`plans.drafting`); it never
deletes the plan."""

from django.db.models import Q

from services.metrics.models import AgentAction
from services.plans.drafting import HasDoneWork, return_to_draft
from services.plans.models import OPEN, Plan, PlanTemplate, Sharing
from services.plans.starting import PlanOpen, TemplateGone, owner_for, start_plan
from services.work.clock import today_for

from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate(payload, row, ctx, evidence):
    template_id = payload.get("template_id")
    template = ctx.templates.get(template_id) if _whole(template_id) else None
    if template is None:
        raise Invalid("not a listed template")
    if any(plan["template_id"] == template_id for plan in row.get("plans", [])):
        raise Invalid("the record already runs a plan from this template")
    return {
        "template_id": template_id,
        "template": template["name"],
        "milestones": template["milestones"],
        "tasks": template["tasks"],
    }


def _shared(organisation_id):
    """The templates every member may read: built-ins and the workspace's shared ones."""
    return PlanTemplate.objects.filter(
        Q(is_builtin=True) | Q(organisation_id=organisation_id, sharing=Sharing.WORKSPACE)
    )


def apply(action, actor, **_):
    # Ask only: a person approves it, and is the plan's actor.
    if actor is None:
        raise Stale("a plan is started by a person")
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    template_id = action.payload["template_id"]
    # SOC2:AUTH-02 still a template every reader of the action may read
    if not _shared(action.organisation_id).filter(pk=template_id).exists():
        raise Stale("the template is gone or no longer shared")
    try:
        plan = start_plan(
            template_id,
            record,
            owner=owner_for(record, actor),
            start_date=today_for(action.organisation),
            actor=actor,
        )
    except (PlanOpen, TemplateGone):
        raise Stale("the record already runs this plan, or the template is gone") from None
    Plan.objects.filter(pk=plan.pk).update(agent_action=action)
    return plan.pk, {"plan_id": plan.pk}


def undo(action, actor):
    """Back to Draft, under the plan's row lock (taken after the action's)."""
    plan = (
        Plan.objects.select_for_update(of=("self",))
        .select_related("organisation")
        .filter(pk=(action.result or {}).get("plan_id"))
        .first()
    )
    if plan is None:
        raise ChangedSince("This plan has been deleted.")
    if plan.status not in OPEN:
        raise ChangedSince("This plan has been finished or cancelled.")
    try:
        return_to_draft(plan, actor=actor, agent_action=action.pk)
    except HasDoneWork:
        raise ChangedSince("Work on this plan has been done: it can't go back to draft.") from None


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {
        "plan": {
            "template": payload.get("template", ""),
            "milestones": payload.get("milestones", 0),
            "tasks": payload.get("tasks", 0),
        }
    }


START = Kind(
    key=AgentAction.Kind.PLAN_START,
    label="Start a plan",
    example="Start the Onboarding plan on Dough Co",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=lambda payload: f"plan:{payload['template_id']}",
    # It makes a thing: nothing to compare when deciding it.
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    outputs=("plan_id",),
)
