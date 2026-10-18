"""plan.template (Agents delivery 3): the Ops agent writes a whole plan
template; a person approves it, owns it, and it is shared with the
workspace so plan.start and every member can use it. Undo deletes it while
it is unedited, no plan was started from it, and no scenario or waiting
plan start names it."""

from rest_framework.exceptions import ValidationError

from core import audit
from services.metrics.models import AgentAction
from services.plans.models import (
    MAX_DESCRIPTION,
    MAX_NAME,
    MAX_OWNED_TEMPLATES,
    PlanTemplate,
    Sharing,
)
from services.plans.models import Kind as TemplateKind
from services.plans.serializers import TemplateWriteSerializer
from services.plans.validation import clean_template_milestones, task_count
from services.rules.models import Rule

from .. import builder
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

MILESTONE_LIMIT = 4
TASK_LIMIT = 12


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a template is workspace-level")
    if payload.get("kind") not in TemplateKind.values:
        raise Invalid("choose a template kind")
    milestones = payload.get("milestones")
    if not isinstance(milestones, list) or not 1 <= len(milestones) <= MILESTONE_LIMIT:
        raise Invalid("one to four milestones")
    try:
        clean = clean_template_milestones(milestones)
    except ValidationError as exc:
        raise Invalid("the milestones don't hold") from exc
    if task_count(clean) > TASK_LIMIT:
        raise Invalid("at most twelve tasks")
    return {
        "kind": payload["kind"],
        "name": builder.text(payload.get("name"), MAX_NAME),
        "description": builder.text(payload.get("description"), MAX_DESCRIPTION, required=False),
        "milestones": clean,
    }


def texts(payload):
    found = [payload.get("name"), payload.get("description")]
    for milestone in payload.get("milestones") or []:
        found.append(milestone.get("name"))
        found += [task.get("title") for task in milestone.get("tasks") or []]
    return found


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    milestones = payload.get("milestones") or []
    return {
        "template": {
            "kind": payload.get("kind", ""),
            "name": payload.get("name", ""),
            "milestones": len(milestones),
            "tasks": task_count(milestones),
        }
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person approves a template and owns it")
    payload = action.payload
    data = {
        "name": payload["name"],
        "kind": payload["kind"],
        "description": payload["description"],
        "milestones": payload["milestones"],
        "sharing": Sharing.WORKSPACE,
    }
    serializer = TemplateWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    if not serializer.is_valid():
        raise Stale("the template no longer holds")
    builder.lock_owner(actor)
    owned = PlanTemplate.objects.filter(owner=actor, is_builtin=False)
    builder.check_owner_limit(owned, MAX_OWNED_TEMPLATES, "plan templates")
    made = serializer.save(owner=actor, organisation_id=action.organisation_id, agent_action=action)
    for name, metadata in (
        (
            "plan_template.created",
            {
                "kind": made.kind,
                "milestones": len(made.milestones),
                "tasks": task_count(made.milestones),
                "agent_action": action.pk,
            },
        ),
        ("plan_template.shared", {"sharing": made.sharing, "shared_with": []}),
    ):
        audit.record(  # SOC2:LOG-01
            name, actor=actor, organisation=action.organisation, target=made, metadata=metadata
        )
    after = {"template_id": made.pk, "updated_at": builder.stamp(PlanTemplate, made.pk)}
    return after, {"template_id": made.pk}


def _in_use(template, organisation_id):
    """A rule's plan step names it, or a waiting plan.start does."""
    step = [{"action": "plan", "template": template.pk}]
    return (
        Rule.objects.filter(organisation_id=organisation_id, actions__contains=step).exists()
        or AgentAction.objects.filter(
            organisation_id=organisation_id,
            kind=AgentAction.Kind.PLAN_START,
            status=AgentAction.Status.PROPOSED,
            payload__template_id=template.pk,
        ).exists()
    )


def undo(action, actor):
    after = action.after or {}
    made = (
        PlanTemplate.objects.select_for_update(of=("self",))
        .filter(pk=after.get("template_id"))
        .first()
    )
    if made is None:
        raise ChangedSince("This plan template has been deleted.")
    if made.updated_at.isoformat() != after.get("updated_at"):
        raise ChangedSince("This plan template has been edited since.")
    if made.plans.exists():
        raise ChangedSince("Plans have been started from this template.")
    if _in_use(made, action.organisation_id):
        raise ChangedSince("A scenario or a plan start uses this template now.")
    audit.record(  # SOC2:LOG-01
        "plan_template.deleted",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"kind": made.kind},
    )
    made.delete()


WRITE = Kind(
    key=AgentAction.Kind.PLAN_TEMPLATE,
    label="Write a plan template",
    example="Write a save-plan template for at-risk renewals",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"template:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    texts=texts,
    outputs=("template_id",),
)
