"""The builder kinds' test helpers (Agents delivery 3): a segment definition
the fixture's workspace accepts, and actions of each builder kind stored as
the agent would store them."""

from services.customers.models import Account
from services.metrics.models import AgentAction

#: A workspace-figures line, as `metrics.proposals.build_prompt` writes one.
FIGURES = "- At risk ARR [at_risk_arr]: $300,000"


def definition(**fields):
    """Organisations with poor health: Dough Co and Taco Bell in AgentsFixture."""
    return {
        "kind": "customer",
        "name": "Poor health",
        "description": "Poor health puts renewals at risk.",
        "rules": {
            "match": "all",
            "conditions": [{"field": "health_category", "op": "is", "value": "poor"}],
        },
        **fields,
    }


def builder_action(organisation, kind, payload, *, record=None, agent="ops", target=None, **fields):
    """A `kind` action with `payload` as stored; on `record` for canvas.create."""
    on = {}
    if record is not None:
        on = {"account" if isinstance(record, Account) else "customer": record}
    name = str(payload.get("name") or kind)
    return AgentAction.objects.create(
        organisation=organisation,
        agent=agent,
        batch="b",
        kind=kind,
        target=target or f"{kind}:{name.casefold()}"[:160],
        title=f"Build {name}",
        rationale="The figures say so.",
        evidence=[FIGURES],
        payload=payload,
        **on,
        **fields,
    )


def add_builder_actions(fixture, number):
    """A fresh organisation of Carl's with a contact on it, and one waiting
    action of each builder kind, `number` in every name."""
    from services.surveys.tests.fixtures import contact

    record = fixture.customer(f"Built {number}", fixture.csm, 10_000, "2.0")
    contact(record, f"Pat{number}")
    task = {"action": "task", "title": "Call", "assignee": "record_owner", "due_in_days": 7}
    milestones = [{"name": "M", "offset_days": 0, "tasks": []}]
    payloads = {
        "segment.create": definition(name=f"Segment {number}"),
        "scenario.create": {
            "name": f"Scenario {number}",
            "segment": definition(),
            "trigger": {"trigger": "entered"},
            "actions": [task],
            "shown": {"trigger": "Entered the segment", "steps": ["Task the owner"]},
        },
        "campaign.create": {
            "name": f"Campaign {number}",
            "segment": definition(),
            "roles": ["champion"],
            "subject": "Hello",
            "body": "Hi {first_name}",
        },
        "plan.template": {
            "kind": "save",
            "name": f"Template {number}",
            "description": "",
            "milestones": milestones,
        },
    }
    made = [builder_action(fixture.org, kind, payload) for kind, payload in payloads.items()]
    made.append(
        builder_action(
            fixture.org,
            "canvas.create",
            {"name": f"Map {number}"},
            record=record,
            agent="cs",
            target="canvas",
        )
    )
    return record, made
