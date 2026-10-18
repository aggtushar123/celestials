"""scenario.run (Slack bundles, owner 2026-10-17): run one of the workspace's
Organisations scenarios on the organisation a Slack message is about, as the
builder's "Run Now" does (`ScenarioRunView`: the runner must be able to open
the organisation). The engine logs each node and never raises: a run that
failed a node is kept as it went, not a failed step, so a Retry never sends
its emails again. A scenario that ran can't be undone."""

from services.customers.models import Customer
from services.customers.scoping import visible_customers
from services.metrics.models import AgentAction
from services.scenarios.engine import run_scenario
from services.scenarios.models import Scenario, ScenarioRun

from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale, StepFailed

RAN = "This scenario has run."
CANT_OPEN = "You can no longer open this organisation."
RAN_OK = "The scenario ran."
RAN_FAILED = "The scenario ran, but a step failed. Its run log says which."


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate(payload, row, ctx, evidence):
    if row["kind"] != "customer":
        raise Invalid("only an organisation runs a scenario")
    pk = payload.get("scenario_id")
    scenario = ctx.scenarios.get(pk) if _whole(pk) else None
    if scenario is None:
        raise Invalid("not a listed scenario")
    return {"scenario_id": pk, "scenario": scenario["name"]}


def target(payload):
    return f"scenario:{payload['scenario_id']}:run"


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    result = action.result if isinstance(action.result, dict) else {}
    run = None
    if result.get("scenario_run_id"):
        run = {
            "id": result["scenario_run_id"],
            "status": result.get("status", ""),
            "note": result.get("note", ""),
        }
    record = action.record
    return {
        "scenario_run": {
            "scenario": {"id": payload.get("scenario_id"), "name": payload.get("scenario", "")},
            "record": record.name if record is not None else "",
            "run": run,
        }
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person runs a scenario")
    record = action.record
    if not isinstance(record, Customer):
        raise Stale("only an organisation runs a scenario")
    # SOC2:AUTH-02 only the workspace's own Organisations scenario, as Run Now allows
    scenario = Scenario.objects.filter(
        pk=action.payload["scenario_id"],
        organisation_id=action.organisation_id,
        apply_to=Scenario.ApplyTo.ORGANIZATIONS,
    ).first()
    if scenario is None:
        raise Stale("the scenario is gone or no longer runs on organisations")
    # SOC2:AUTH-02 the runner must be able to open the organisation (ScenarioRunView's rule)
    if not visible_customers(actor).filter(pk=record.pk).exists():
        raise StepFailed(CANT_OPEN)
    run = run_scenario(scenario, record, triggered_by=ScenarioRun.TriggeredBy.AGENT)
    ok = run.status == ScenarioRun.Status.SUCCESS
    return {"scenario_run_id": run.pk}, {
        "scenario_run_id": run.pk,
        "status": run.status,
        "note": RAN_OK if ok else RAN_FAILED,
    }


def undo(action, actor):
    raise ChangedSince(RAN)


RUN = Kind(
    key=AgentAction.Kind.SCENARIO_RUN,
    label="Run a scenario",
    example="Run the Escalation playbook on Pizza Hut",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    texts=lambda payload: [],
    irreversible=True,
    cant_undo=RAN,
    message_only=True,
)
