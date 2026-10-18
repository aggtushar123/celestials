"""initiative.create (spec §1.3): the Ops agent's decision on a number,
validated exactly as the old proposals were. Undo closes it while no work
hangs off it."""

import math

from django.utils import timezone

from services.metrics import initiatives as initiative_rules
from services.metrics.models import AgentAction, Initiative

from ..kinds import ASK, ChangedSince, Invalid, Kind


def validate(payload, row, ctx, evidence):
    from services.metrics.proposals import _validate

    if row is not None or ctx.figures is None:
        raise Invalid("an initiative is workspace-level and needs the figures")
    item = {"kind": "initiative", "title": "initiative", "action": payload}
    action = _validate(ctx.organisation, ctx.figures, item)
    if action is None:
        raise Invalid("the initiative names something outside the figures")
    # A nan or inf target would reach the database and every chart reading it.
    if not math.isfinite(action["target_value"]):
        raise Invalid("the target is not a finite number")
    return action


def apply(action, actor, **_):
    payload = action.payload
    initiative = initiative_rules.create_initiative(
        action.organisation,
        actor,
        title=action.title,
        hypothesis=action.rationale,
        metric=payload["metric"],
        dimension=payload["dimension"],
        member=payload["member"],
        member_label=payload["member_label"],
        target_value=initiative_rules.as_decimal(payload["target_value"]),
        target_by=payload["target_by"],
    )
    return initiative.pk, {"initiative_id": initiative.pk}


def undo(action, actor):
    initiative = (
        Initiative.objects.filter(pk=(action.result or {}).get("initiative_id"))
        .select_for_update()
        .first()
    )
    if initiative is None:
        return
    if initiative.status not in (Initiative.Status.PLANNED, Initiative.Status.ACTIVE):
        raise ChangedSince("This initiative has been closed since.")
    live = (AgentAction.Status.PROPOSED, AgentAction.Status.APPLIED)
    linked = (
        initiative.tasks.exists()
        or AgentAction.objects.filter(initiative=initiative, status__in=live)
        .exclude(pk=action.pk)
        .exists()
    )
    if linked:
        raise ChangedSince("Work is linked to this initiative now.")
    initiative.status = Initiative.Status.ABANDONED
    initiative.closed_at = timezone.now()
    initiative.save(update_fields=["status", "closed_at", "updated_at"])


def preview(action):
    payload = action.payload
    label = payload.get("metric_label") or payload.get("metric")
    return {
        "initiative": {
            "metric": label,
            "target": f"{payload.get('target_value')} by {payload.get('target_by')}",
        }
    }


CREATE = Kind(
    key=AgentAction.Kind.INITIATIVE_CREATE,
    label="Start an initiative",
    example="Start 'Halve ARR at risk on Product B' by the end of the quarter.",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: (
        f"initiative:{payload['metric']}:{payload['dimension']}:{payload['member']}"
    )[:160],
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    outputs=("initiative_id",),
)
