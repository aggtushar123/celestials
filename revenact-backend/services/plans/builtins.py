"""The four built-in templates (spec §1.6), read by every workspace.

Data only, plus `seed_builtins(model)`, which takes the model so the data
migration can pass its historical one. It is idempotent by kind: an e2e
test re-seeds after another `LiveServerTestCase` has flushed the tables.
"""

RECORD_OWNER, PLAN_OWNER = "record_owner", "plan_owner"


def _task(title, priority, offset_days, assignee_role=RECORD_OWNER):
    return {
        "title": title,
        "priority": priority,
        "offset_days": offset_days,
        "assignee_role": assignee_role,
    }


def _milestone(name, offset_days, *tasks):
    return {"name": name, "offset_days": offset_days, "tasks": list(tasks)}


BUILTINS = [
    {
        "kind": "onboarding",
        "name": "Onboarding",
        "milestones": [
            _milestone(
                "Kick-off",
                0,
                _task("Hold the kick-off call", "high", 0),
                _task("Confirm goals and success criteria", "high", 3),
            ),
            _milestone(
                "Set up",
                14,
                _task("Connect data sources", "high", 10),
                _task("Invite the customer's team", "medium", 14),
            ),
            _milestone(
                "First value", 30, _task("Review first results with the champion", "high", 28)
            ),
            _milestone(
                "Hand-off",
                60,
                _task("Run the onboarding review", "medium", 55),
                _task("Hand over to the account owner", "medium", 60, PLAN_OWNER),
            ),
        ],
    },
    {
        "kind": "success",
        "name": "Success plan",
        "milestones": [
            _milestone(
                "Agree outcomes", 0, _task("Write the success plan with the customer", "high", 7)
            ),
            _milestone("Check-in", 30, _task("Review progress against outcomes", "medium", 30)),
            _milestone(
                "Expand adoption", 60, _task("Find the next team or use case", "medium", 60)
            ),
            _milestone("Review", 90, _task("Run the quarterly success review", "high", 90)),
        ],
    },
    {
        "kind": "save",
        "name": "Save plan",
        "milestones": [
            _milestone(
                "Diagnose",
                0,
                _task("Talk to the champion about the risk", "high", 2),
                _task("Write down the root cause", "high", 5),
            ),
            _milestone(
                "Act",
                14,
                _task("Agree a recovery plan with the customer", "high", 10),
                _task("Bring in an executive sponsor", "medium", 14, PLAN_OWNER),
            ),
            _milestone("Confirm", 30, _task("Check health and usage have recovered", "high", 30)),
        ],
    },
    {
        "kind": "qbr",
        "name": "QBR",
        "milestones": [
            _milestone(
                "Prepare",
                0,
                _task("Pull the quarter's usage and outcomes", "medium", 0),
                _task("Draft the deck", "medium", 5),
            ),
            _milestone("Meet", 10, _task("Hold the business review", "high", 10)),
            _milestone(
                "Follow up",
                14,
                _task("Send notes and next steps", "high", 12),
                _task("Log decisions on the account", "medium", 14),
            ),
        ],
    },
]


def seed_builtins(model):
    """Creates each built-in template whose kind is missing; returns how many."""
    have = set(model.objects.filter(is_builtin=True).values_list("kind", flat=True))
    made = 0
    for template in BUILTINS:
        if template["kind"] in have:
            continue
        model.objects.create(
            is_builtin=True,
            organisation=None,
            owner=None,
            sharing="workspace",
            description="",
            kind=template["kind"],
            name=template["name"],
            milestones=template["milestones"],
        )
        made += 1
    return made
