"""scenario.create (Agents delivery 3): a rule on its own new segment, as
the Ops agent writes the whole of it. A person approves it and owns both;
the rule is made switched off, so only its owner can switch it on. Undo
deletes it while it has never been switched on and is unedited, and its
segment with it unless that is used or edited."""

import math

from rest_framework.exceptions import ValidationError

from core import audit
from core.models import AuditEvent
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.rules.models import MAX_ACTIONS, Rule
from services.rules.models import MAX_OWNED as RULE_LIMIT
from services.rules.serializers import RuleWriteSerializer
from services.rules.validation import CLEANERS, TRIGGER_FIELDS, clean_trigger
from services.segments.models import Segment

from .. import builder
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

#: What a scenario may do: never a campaign (owner decision 4).
STEPS = ("notify", "task", "lifecycle", "plan", "survey")
SCORES = {"csat": "CSAT", "nps": "NPS", "ces": "CES", "health": "Health"}
SURVEYS = {"nps": "NPS", "csat": "CSAT", "ces": "CES"}
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def clean_trigger_for(raw, kind):
    """The six trigger fields, checked against the segment's kind as a rule's
    own save checks them (`clean_trigger`)."""
    if not isinstance(raw, dict):
        raise Invalid("a trigger is an object")
    values = {name: raw.get(name) for name in TRIGGER_FIELDS}
    threshold = values["threshold"]
    if threshold is not None:
        number = isinstance(threshold, int | float) and not isinstance(threshold, bool)
        if not number or not math.isfinite(threshold) or round(threshold, 2) != threshold:
            raise Invalid("a threshold is a number with at most two decimals")
    try:
        clean = clean_trigger(values, kind)
    except ValidationError as exc:
        raise Invalid("the trigger doesn't hold") from exc
    if clean["threshold"] is not None:
        clean["threshold"] = float(clean["threshold"])
    return clean


def clean_steps(actions, kind, ctx):
    """One to three steps, each once, each as a rule's save cleans it, as the
    workspace writes it. A plan step names a template under Plan templates;
    a survey is always reviewed before it is sent."""
    if not isinstance(actions, list) or not 1 <= len(actions) <= MAX_ACTIONS:
        raise Invalid("one to three steps")
    writer = builder.WorkspaceWriter(ctx.organisation)
    cleaned, seen = [], set()
    for item in actions:
        name = item.get("action") if isinstance(item, dict) else None
        if name not in STEPS or name in seen:
            raise Invalid("each step once, from notify, task, lifecycle, plan and survey")
        seen.add(name)
        if name == "plan":
            template = item.get("template")
            # SOC2:AUTH-02 only a template every member may read
            if not _whole(template) or template not in ctx.templates:
                raise Invalid("not a listed template")
            cleaned.append({"action": "plan", "template": template})
            continue
        if name == "survey":
            item = {**item, "without_review": False}
        try:
            cleaned.append(CLEANERS[name](item, kind, writer))
        except ValidationError as exc:
            raise Invalid("the step doesn't hold") from exc
    return cleaned


def trigger_sentence(trigger):
    when = trigger["trigger"]
    if when == "entered":
        return "Entered the segment"
    if when == "left":
        return "Left the segment"
    if when == "crossed":
        return f"{SCORES[trigger['score']]} goes {trigger['direction']} {trigger['threshold']:g}"
    if trigger["cadence"] == "monthly":
        return "On the 1st of each month"
    return f"Every {WEEKDAYS[trigger['weekday']]}"


def step_sentence(step, templates):
    name = step["action"]
    if name == "notify":
        if step["to"] == "me":
            return "Notify me"
        if step["to"] == "record_owner":
            return "Notify the owner"
        # Counted, never named.
        count = len(step["people"])
        return f"Notify {count} {'person' if count == 1 else 'people'}"
    if name == "task":
        return "Task the owner" if step["assignee"] == "record_owner" else "Task me"
    if name == "lifecycle":
        return f"Move to {Customer.LifecycleStage(step['stage']).label}"
    if name == "plan":
        return f"Start a plan from {templates[step['template']]['name']}"
    article = "an" if step["survey_type"] == "nps" else "a"
    return f"Send {article} {SURVEYS[step['survey_type']]} survey, reviewed first"


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a scenario is workspace-level")
    segment = builder.check_definition(payload.get("segment"), ctx)
    name = builder.text(payload.get("name"), builder.NAME_LIMIT)
    trigger = clean_trigger_for(payload.get("trigger"), segment["kind"])
    steps = clean_steps(payload.get("actions"), segment["kind"], ctx)
    return {
        "name": name,
        "segment": segment,
        "trigger": trigger,
        "actions": steps,
        # Display sentences, worked out once: a preview reads no row.
        "shown": {
            "trigger": trigger_sentence(trigger),
            "steps": [step_sentence(step, ctx.templates) for step in steps],
        },
    }


def texts(payload):
    found = [payload.get("name"), *builder.definition_texts(payload.get("segment") or {})]
    for step in payload.get("actions") or []:
        found += [step.get(key) for key in ("title", "message", "subject", "intro")]
    return found


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    shown = payload.get("shown") or {}
    return {
        "scenario": {
            "name": payload.get("name", ""),
            "segment": (payload.get("segment") or {}).get("name", ""),
            "trigger": shown.get("trigger", ""),
            "steps": list(shown.get("steps", [])),
        }
    }


def apply(action, actor, **_):
    """The segment, then the rule on it, both the approver's; the rule is
    off. Checked again as the approver, in the decision's transaction."""
    if actor is None:
        raise Stale("a person approves a scenario and owns it")
    payload = action.payload
    # Never sends on its own: no campaign step, every survey reviewed.
    steps = payload["actions"]
    if any(s["action"] == "campaign" or s.get("without_review") for s in steps):
        raise Stale("a scenario only ever waits on a person")
    segment = builder.create_segment(action, payload["segment"], actor)
    data = {
        "name": payload["name"],
        "segment": segment.pk,
        "is_active": False,
        "actions": steps,
        **payload["trigger"],
    }
    # SOC2:AUTH-02 the steps are checked as their owner (templates, teammates)
    serializer = RuleWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    if not serializer.is_valid():
        raise Stale("the scenario no longer holds for the approver")
    builder.check_owner_limit(Rule.objects.filter(owner=actor), RULE_LIMIT, "scenarios")
    rule = serializer.save(owner=actor, organisation_id=action.organisation_id, agent_action=action)
    audit.record(  # SOC2:LOG-01
        "rule.created",
        actor=actor,
        organisation=action.organisation,
        target=rule,
        metadata={
            "trigger": rule.trigger,
            "actions": [step["action"] for step in rule.actions],
            "agent_action": action.pk,
        },
    )
    after = {
        "rule_id": rule.pk,
        "rule_updated_at": builder.stamp(Rule, rule.pk),
        "segment_id": segment.pk,
        "segment_updated_at": builder.stamp(Segment, segment.pk),
    }
    return after, {"rule_id": rule.pk, "segment_id": segment.pk}


def _ever_switched_on(rule):
    """Any `rule.activated` row counts, even if it was switched off again."""
    return AuditEvent.objects.filter(
        action="rule.activated", target_type=Rule._meta.label_lower, target_id=str(rule.pk)
    ).exists()


def undo(action, actor):
    """The rule (lock taken after the action's), then its segment."""
    after = action.after or {}
    rule = Rule.objects.select_for_update(of=("self",)).filter(pk=after.get("rule_id")).first()
    if rule is not None:
        if rule.is_active or _ever_switched_on(rule):
            raise ChangedSince("This scenario has been switched on.")
        if rule.updated_at.isoformat() != after.get("rule_updated_at"):
            raise ChangedSince("This scenario has been edited since.")
        audit.record(  # SOC2:LOG-01
            "rule.deleted",
            actor=actor,
            organisation=action.organisation,
            target=rule,
            metadata={"trigger": rule.trigger},
        )
        rule.delete()
    segment_deleted = builder.release_segment(
        action, after.get("segment_id"), after.get("segment_updated_at"), actor
    )
    if rule is None and not segment_deleted:
        raise ChangedSince("This scenario has been deleted.")


CREATE = Kind(
    key=AgentAction.Kind.SCENARIO_CREATE,
    label="Build a scenario",
    example="Build a scenario that tasks the owner when health drops below 4",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"scenario:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    texts=texts,
    outputs=("rule_id", "rule_url", "segment_id", "segment_url"),
)
