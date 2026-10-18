"""Starting a plan: the template copied with dates and people, one open
plan per record and template, the locks in order, the notices, the audit;
and `POST plans/` with its refusals in the UI's words."""

from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError, connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.plans import validation as say
from services.plans.copying import copy_template
from services.plans.starting import PlanOpen, TemplateGone, start_plan
from services.plans.tests.fixtures import PlanFixture, iso

URL = "/api/v1/plans/"


class CopyTests(PlanFixture):
    def test_a_template_is_copied_with_dates_and_people(self):
        steps = copy_template(
            self.builtin["save"], start_date=self.today, record_owner=self.csm, plan_owner=self.mona
        )
        self.assertEqual(
            [(step["name"], step["due_date"]) for step in steps],
            [
                ("Diagnose", self.today),
                ("Act", self.today + timedelta(days=14)),
                ("Confirm", self.today + timedelta(days=30)),
            ],
        )
        self.assertEqual(
            [(t["title"], t["priority"], t["due_date"], t["assignee"]) for t in steps[1]["tasks"]],
            [
                (
                    "Agree a recovery plan with the customer",
                    "high",
                    self.today + timedelta(days=10),
                    self.csm,
                ),
                (
                    "Bring in an executive sponsor",
                    "medium",
                    self.today + timedelta(days=14),
                    self.mona,
                ),
            ],
        )


class StartFixture(PlanFixture):
    def start(self, template=None, record=None, **kwargs):
        kwargs.setdefault("owner", self.csm)
        kwargs.setdefault("actor", self.csm)
        kwargs.setdefault("start_date", self.today)
        template = template or self.builtin["onboarding"]
        return start_plan(template.pk, record or self.pizza, **kwargs)


class StartTests(StartFixture):
    def test_starting_copies_the_template(self):
        plan = self.start()
        self.assertEqual(
            (plan.name, plan.kind, plan.status, plan.target_date, plan.started_by, plan.owner),
            (
                "Onboarding · Pizza Hut",
                "onboarding",
                "not_started",
                self.today + timedelta(days=60),
                self.csm,
                self.csm,
            ),
        )
        self.assertEqual(
            list(plan.milestones.values_list("name", "position")),
            [("Kick-off", 0), ("Set up", 1), ("First value", 2), ("Hand-off", 3)],
        )
        tasks = plan.tasks.order_by("due_date", "pk")
        self.assertEqual(tasks.count(), 7)
        self.assertEqual(
            {(t.customer_id, t.created_by_id, t.assignee_id, t.status) for t in tasks},
            {(self.pizza.pk, self.csm.pk, self.csm.pk, "pending")},
        )
        first = tasks.first()
        self.assertEqual(
            (
                first.title,
                first.priority,
                first.due_date,
                first.milestone.name,
                first.assignee_name,
            ),
            ("Hold the kick-off call", "high", self.today, "Kick-off", "Carl CSM"),
        )

    def test_record_owner_tasks_go_to_the_record_owner_the_rest_to_the_plan_owner(self):
        plan = self.start(owner=self.mona, actor=self.mona)
        assignees = dict(plan.tasks.values_list("title", "assignee_id"))
        self.assertEqual(assignees["Hold the kick-off call"], self.csm.pk)
        self.assertEqual(assignees["Hand over to the account owner"], self.mona.pk)

    def test_an_inactive_record_owner_hands_their_tasks_to_the_plan_owner(self):
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        plan = self.start(owner=self.mona, actor=self.mona)
        self.assertEqual(set(plan.tasks.values_list("assignee_id", flat=True)), {self.mona.pk})

    def test_an_account_plan_puts_its_tasks_on_the_account(self):
        plan = self.start(record=self.emea)
        self.assertEqual(plan.account, self.emea)
        self.assertEqual(
            set(plan.tasks.values_list("account_id", "customer_id")), {(self.emea.pk, None)}
        )

    def test_one_open_plan_per_record_and_template(self):
        first = self.start()
        with self.assertRaises(PlanOpen) as caught:
            self.start()
        self.assertEqual(caught.exception.plan_id, first.pk)
        self.start(self.builtin["save"])
        self.start(record=self.emea)

    def test_an_integrity_error_with_no_open_plan_is_not_hidden(self):
        """An `IntegrityError` unrelated to the one-open-plan constraint must
        surface as itself, not become a `PlanOpen` with nothing to point
        at. The pre-flight check is patched to miss nothing (`None`, as it
        would for a real, different error); the insert is forced to raise."""
        with (
            patch("services.plans.starting.open_plan_id", return_value=None),
            patch(
                "services.plans.starting.Plan.objects.create",
                side_effect=IntegrityError("boom"),
            ),
        ):
            with self.assertRaises(IntegrityError):
                self.start()

    def test_a_finished_plan_does_not_block_a_new_one(self):
        first = self.start()
        first.status = "cancelled"
        first.save(update_fields=["status"])
        self.assertNotEqual(self.start().pk, first.pk)

    def test_a_deleted_template_is_refused(self):
        template = self.make_template(name="Gone")
        pk = template.pk
        template.delete()
        with self.assertRaises(TemplateGone):
            start_plan(pk, self.pizza, owner=self.csm, actor=self.csm, start_date=self.today)

    def test_the_edited_copy_is_used_as_sent(self):
        steps = [
            {
                "name": "Only",
                "due_date": self.today + timedelta(days=5),
                "tasks": [
                    {
                        "title": "Do it",
                        "priority": "low",
                        "due_date": self.today + timedelta(days=3),
                        "assignee": self.mona,
                    }
                ],
            }
        ]
        plan = self.start(milestones=steps, name="Custom")
        self.assertEqual((plan.name, plan.target_date), ("Custom", self.today + timedelta(days=5)))
        (task,) = plan.tasks.all()
        self.assertEqual(
            (task.title, task.assignee, task.milestone.name), ("Do it", self.mona, "Only")
        )

    def test_started_and_audited_by_id(self):
        plan = self.start()
        event = AuditEvent.objects.get(action="plan.started")
        self.assertEqual(
            (event.actor, event.target_id, event.target_repr),
            (self.csm, str(plan.pk), f"Plan {plan.pk}"),
        )
        self.assertEqual(
            event.metadata,
            {
                "template": self.builtin["onboarding"].pk,
                "record_kind": "customer",
                "record_id": self.pizza.pk,
                "rule": None,
                "milestones": 4,
                "tasks": 7,
            },
        )

    def test_the_locks_come_in_order(self):
        with CaptureQueriesContext(connection) as ctx:
            self.start()
        locks = [q["sql"] for q in ctx.captured_queries if "FOR NO KEY UPDATE" in q["sql"]]
        tables = ['"accounts_organisation"', '"customers_customer"', '"plans_plantemplate"']
        order = [next(t for t in tables if f"FROM {t}" in sql) for sql in locks]
        self.assertEqual(order, tables)


class StartNoticeTests(StartFixture):
    def test_someone_else_starting_tells_the_owner_and_the_assignees(self):
        plan = self.start(owner=self.csm, actor=self.mona)
        link = f"/projects/{plan.pk}"
        self.assertEqual(
            self.notes("plan_started"),
            [(self.csm.pk, "Mona Manager started the plan Onboarding · Pizza Hut for you.", link)],
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [(self.csm.pk, "7 tasks on Onboarding · Pizza Hut were assigned to you.", link)],
        )

    def test_starting_your_own_plan_tells_nobody(self):
        self.start()
        self.assertEqual(self.notes("plan_started") + self.notes("plan_task_assigned"), [])

    def test_one_notice_per_person_never_to_the_person_acting(self):
        plan = self.start(owner=self.mona, actor=self.csm)
        link = f"/projects/{plan.pk}"
        self.assertEqual(
            self.notes("plan_started"),
            [(self.mona.pk, "Carl CSM started the plan Onboarding · Pizza Hut for you.", link)],
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [(self.mona.pk, "1 task on Onboarding · Pizza Hut was assigned to you.", link)],
        )

    def test_a_rule_tells_the_owner_by_the_rules_name(self):
        """Owner (Mona), record owner (Carl) and rule owner (Carl) are three
        different roles here, so a notice sent to the wrong one, or the rule
        owner silently skipped as if they were "the actor", would fail
        this."""
        rule = self.make_rule(name="Onboard new", sharing="workspace")
        plan = self.start(owner=self.mona, actor=None, rule=rule)
        self.assertEqual((plan.started_by, plan.started_by_rule), (None, rule))
        link = f"/projects/{plan.pk}"
        self.assertEqual(
            self.notes("plan_started"),
            [(self.mona.pk, "Onboard new started the plan Onboarding · Pizza Hut for you.", link)],
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [
                (self.csm.pk, "6 tasks on Onboarding · Pizza Hut were assigned to you.", link),
                (self.mona.pk, "1 task on Onboarding · Pizza Hut was assigned to you.", link),
            ],
        )
        self.assertEqual(set(plan.tasks.values_list("created_by_id", flat=True)), {self.csm.pk})

    def test_a_rule_the_owner_cannot_read_is_not_named(self):
        """Carl's private rule starts Mona's plan: a rule's name is
        confidential, so Mona reads "A rule", as the plan page shows her."""
        rule = self.make_rule(name="Onboard new")
        plan = self.start(owner=self.mona, actor=None, rule=rule)
        self.assertEqual(
            self.notes("plan_started"),
            [
                (
                    self.mona.pk,
                    "A rule started the plan Onboarding · Pizza Hut for you.",
                    f"/projects/{plan.pk}",
                )
            ],
        )


class StartEndpointTests(PlanFixture):
    def post(self, user=None, **body):
        body.setdefault("template", self.builtin["onboarding"].pk)
        if "account" not in body:
            body.setdefault("customer", self.pizza.pk)
        return self.api(user or self.csm).post(URL, body, format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().post(URL, {}, format="json").status_code, 401)

    def test_201_with_the_plan(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(
            (data["name"], data["start_date"], data["owner"]["id"], len(data["milestones"])),
            ("Onboarding · Pizza Hut", iso(self.today), self.csm.pk, 4),
        )
        self.assertEqual(
            (data["tasks_total"], data["hidden_tasks"], data["can_edit"]), (7, 0, True)
        )

    def test_409_when_one_is_open(self):
        first = self.post().data
        response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "PLAN_OPEN", "plan_id": first["id"], "detail": say.PLAN_OPEN}),
        )

    def test_409_from_the_integrity_error_backstop(self):
        """The pre-flight check is patched to miss the open plan, so the
        insert hits the partial unique constraint; the `IntegrityError`
        backstop still finds the real open plan and reports it."""
        first = self.post().data
        with patch("services.plans.starting.open_plan_id", side_effect=[None, first["id"]]):
            response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "PLAN_OPEN", "plan_id": first["id"], "detail": say.PLAN_OPEN}),
        )

    def test_exactly_one_record(self):
        both = self.post(account=self.emea.pk, customer=self.pizza.pk)
        neither = self.api(self.csm).post(URL, {"template": self.builtin["qbr"].pk}, format="json")
        for response in (both, neither):
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"non_field_errors": [say.CHOOSE_RECORD]}),
            )

    def test_a_record_you_cannot_open_reads_like_a_missing_one(self):
        for customer in (self.pizza.pk, 999999):
            response = self.post(user=self.other, customer=customer)
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"customer": [say.CANT_OPEN_ORGANISATION]}),
            )
        response = self.post(user=self.other, account=self.emea.pk)
        self.assertEqual(response.data, {"account": [say.CANT_OPEN_ACCOUNT]})

    def test_a_template_you_cannot_read_is_refused(self):
        danas = self.make_template(owner=self.other, name="Dana's")
        response = self.post(template=danas.pk)
        self.assertEqual(
            (response.status_code, response.data), (400, {"template": [say.CHOOSE_TEMPLATE]})
        )

    def test_the_owner_must_be_able_to_open_the_record(self):
        for owner in (self.other.pk, self.stranger.pk, 999999):
            response = self.post(owner=owner)
            self.assertEqual(
                (response.status_code, response.data), (400, {"owner": [say.CANT_OPEN]})
            )
        response = self.post(owner=self.mona.pk)
        self.assertEqual((response.status_code, response.data["owner"]["id"]), (201, self.mona.pk))

    def test_an_edited_copy(self):
        due = iso(self.today + timedelta(days=3))
        steps = [
            {
                "name": "Only",
                "due_date": due,
                "tasks": [
                    {"title": "Do it", "priority": "low", "due_date": due, "assignee": self.mona.pk}
                ],
            }
        ]
        response = self.post(milestones=steps, name="Custom")
        self.assertEqual(response.status_code, 201, response.content)
        (milestone,) = response.data["milestones"]
        self.assertEqual(
            (response.data["name"], milestone["name"], milestone["tasks"][0]["assignee"]["id"]),
            ("Custom", "Only", self.mona.pk),
        )

    def test_an_edited_copy_is_checked_where_it_is_wrong(self):
        due = iso(self.today + timedelta(days=3))
        task = {"title": "Do it", "priority": "low", "due_date": due, "assignee": self.other.pk}
        response = self.post(milestones=[{"name": "M", "due_date": due, "tasks": [task]}])
        self.assertEqual(
            response.data, {"milestones": [{"tasks": [{"assignee": [say.CANT_OPEN]}]}]}
        )
        early = iso(self.today - timedelta(days=1))
        response = self.post(milestones=[{"name": "M", "due_date": early, "tasks": []}])
        self.assertEqual(response.data, {"milestones": [{"due_date": [say.DATE_RANGE]}]})
        late = iso(self.today + timedelta(days=366))
        response = self.post(milestones=[{"name": "M", "due_date": late, "tasks": []}])
        self.assertEqual(response.data, {"milestones": [{"due_date": [say.DATE_RANGE]}]})
        response = self.post(milestones=[{"name": "M", "due_date": "soon", "tasks": []}])
        self.assertEqual(response.data, {"milestones": [{"due_date": [say.CHOOSE_DATE]}]})

    def test_a_null_milestones_reads_like_a_malformed_one(self):
        response = self.post(milestones=None)
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"milestones": [say.MILESTONE_COUNT]}),
        )
