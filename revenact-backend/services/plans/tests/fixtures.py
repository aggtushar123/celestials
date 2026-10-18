"""The plans tests' shared world, built once per test class
(`setUpTestData`): the rules fixture (Alice the admin opens everything and
is nobody's manager; Carl owns Pizza Hut, Pizza EMEA and Dough Co, Dana
owns Taco Bell and Taco West, and neither CSM can open the other's; Gus is
another tenant), plus Mona, Carl's manager, who may open Carl's records and
edit Carl's plans. The four built-in templates come from the data
migration (Task 2)."""

from copy import deepcopy
from datetime import timedelta

from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.notifications.models import Notification
from services.plans.models import Milestone, Plan, PlanTemplate
from services.rules.tests.fixtures import RuleFixture
from services.segments.tests.fixtures import person

STEPS = [
    {
        "name": "Kick-off",
        "offset_days": 0,
        "tasks": [
            {
                "title": "Hold the call",
                "priority": "high",
                "offset_days": 0,
                "assignee_role": "record_owner",
            }
        ],
    },
    {
        "name": "Review",
        "offset_days": 14,
        "tasks": [
            {
                "title": "Run the review",
                "priority": "medium",
                "offset_days": 14,
                "assignee_role": "plan_owner",
            }
        ],
    },
]


def iso(day):
    return day.isoformat()


class PlanFixture(RuleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.mona = person("mona@acme.io", "Mona Manager", cls.org)
        User.objects.filter(pk=cls.csm.pk).update(reports_to=cls.mona)
        cls.csm.refresh_from_db()
        cls.builtin = {t.kind: t for t in PlanTemplate.objects.filter(is_builtin=True)}
        cls.mine = cls.make_template(name="Carl's kick-off")

    @classmethod
    def make_template(cls, *, owner=None, milestones=None, **fields):
        """Carl's private two-milestone template unless told otherwise."""
        values = {"name": "Kick-off", "kind": "other", **fields}
        return PlanTemplate.objects.create(
            organisation=cls.org,
            owner=owner or cls.csm,
            milestones=deepcopy(STEPS) if milestones is None else milestones,
            **values,
        )

    @classmethod
    def build_plan(
        cls,
        record=None,
        *,
        owner=None,
        template=None,
        steps=None,
        status="not_started",
        created_by=None,
        start=None,
        **fields,
    ):
        """A plan made row by row (not through `starting.start_plan`), on
        Pizza Hut and owned by Carl unless told otherwise. `steps` is
        `[(name, due_in_days, [(title, assignee, status[, creator]), ...])]`;
        a task's creator defaults to `created_by`, then to the owner."""
        record = record or cls.pizza
        owner = owner or cls.csm
        start = start or cls.today
        if steps is None:
            steps = [
                ("Kick-off", 7, [("Hold the call", owner, "pending")]),
                ("Review", 14, [("Run the review", owner, "pending")]),
            ]
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        fields.setdefault("started_by", owner)
        plan = Plan.objects.create(
            organisation=cls.org,
            template=template,
            name=fields.pop("name", "Kick-off · Pizza Hut"),
            kind=fields.pop("kind", "other"),
            owner=owner,
            start_date=start,
            target_date=start + timedelta(days=max((step[1] for step in steps), default=0)),
            status=status,
            **on,
            **fields,
        )
        for position, (name, due_in, tasks) in enumerate(steps):
            milestone = Milestone.objects.create(
                plan=plan, name=name, position=position, due_date=start + timedelta(days=due_in)
            )
            for title, assignee, task_status, *creator in tasks:
                Task.objects.create(
                    **on,
                    plan=plan,
                    milestone=milestone,
                    title=title,
                    assignee=assignee,
                    assignee_name=assignee.name if assignee else "",
                    created_by=creator[0] if creator else (created_by or owner),
                    due_date=milestone.due_date,
                    priority="medium",
                    status=task_status,
                )
        return plan

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))

    def notes(self, kind):
        rows = Notification.objects.filter(kind=kind).order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))
