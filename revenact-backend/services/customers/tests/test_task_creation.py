"""Every way a task is made stores the real assignee, writes `created` and
tells the assignee (Work round §1.3). PlanFixture's world: Carl (CSM) owns
Pizza Hut and its account Pizza EMEA and reports to Mona; Dana owns Taco Bell
and cannot open Pizza Hut; Alice is an admin."""

from datetime import timedelta

from services.customers.models import Task, TaskEvent
from services.notifications.models import Notification
from services.plans.tests.fixtures import PlanFixture
from services.plans.tests.test_starting import StartFixture
from services.rules.actions import create_task
from services.rules.records import load
from services.rules.tests.fixtures import TASK


def told(kind="task_assigned"):
    return list(
        Notification.objects.filter(kind=kind).values_list("recipient_id", "message", "link")
    )


def person(user):
    return {"id": user.pk, "name": user.name}


class ManualTests(PlanFixture):
    def post(self, url, user=None, **body):
        values = {
            "title": "Ship the deck",
            "due_date": (self.today + timedelta(days=3)).isoformat(),
            "priority": "high",
            **body,
        }
        return self.api(user or self.csm).post(url, values, format="json")

    def test_a_task_for_someone_else_is_theirs_recorded_and_told(self):
        response = self.post(
            f"/api/v1/customers/{self.pizza.pk}/tasks/",
            assignee_id=self.mona.pk,
            description="The renewal deck",
        )
        self.assertEqual(response.status_code, 201, response.data)
        task = Task.objects.get()
        self.assertEqual(
            (task.assignee, task.assignee_name, task.created_by, task.source, task.description),
            (self.mona, "Mona Manager", self.csm, "manual", "The renewal deck"),
        )
        self.assertEqual(
            (
                response.data["source"],
                response.data["description"],
                response.data["blocked_reason"],
            ),
            ("manual", "The renewal deck", ""),
        )
        event = task.events.get()
        self.assertEqual(
            (event.kind, event.actor, event.data),
            ("created", self.csm, {"source": "manual", "assignee": person(self.mona)}),
        )
        self.assertEqual(
            told(),
            [
                (
                    self.mona.pk,
                    "Carl CSM assigned you “Ship the deck” on Pizza Hut.",
                    f"/work/mine?task={task.pk}",
                )
            ],
        )

    def test_my_own_task_tells_nobody(self):
        response = self.post(f"/api/v1/customers/{self.pizza.pk}/tasks/")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Task.objects.get().assignee, self.csm)
        self.assertEqual(told(), [])

    def test_someone_who_cannot_open_the_record_is_refused(self):
        response = self.post(f"/api/v1/customers/{self.pizza.pk}/tasks/", assignee_id=self.other.pk)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."},
        )
        self.assertFalse(Task.objects.exists())

    def test_an_account_task_is_checked_against_the_account(self):
        response = self.post(f"/api/v1/accounts/{self.emea.pk}/tasks/", assignee_id=self.mona.pk)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Task.objects.get().account, self.emea)
        refused = self.post(f"/api/v1/accounts/{self.emea.pk}/tasks/", assignee_id=self.other.pk)
        self.assertEqual(refused.data["detail"], "That person can't open this account.")

    def test_blocked_at_creation_needs_its_reason(self):
        url = f"/api/v1/customers/{self.pizza.pk}/tasks/"
        refused = self.post(url, status="blocked")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data, {"blocked_reason": ["Say what it's blocked on."]})
        made = self.post(url, status="blocked", blocked_reason="  Waiting on legal ")
        self.assertEqual(made.status_code, 201, made.data)
        self.assertEqual(Task.objects.get().blocked_reason, "Waiting on legal")
        stray = self.post(url, blocked_reason="Ignored")
        self.assertEqual(stray.data["blocked_reason"], "")


class RuleTests(PlanFixture):
    def test_a_rule_task_is_revenacts_and_tells_its_assignee(self):
        rule = self.make_rule(actions=[TASK])
        [record] = load("customer", [self.pizza.pk])
        create_task(TASK, rule, record, "customer", today=self.today, made=set())

        task = Task.objects.get()
        self.assertEqual(
            (task.source, task.assignee, task.created_by), ("rule", self.csm, self.csm)
        )
        event = task.events.get()
        self.assertIsNone(event.actor)
        self.assertEqual(
            event.data, {"source": "rule", "assignee": person(self.csm), "rule": rule.pk}
        )
        self.assertEqual(
            told(),
            [
                (
                    self.csm.pk,
                    "Revenact assigned you “Call them” on Pizza Hut.",
                    f"/work/mine?task={task.pk}",
                )
            ],
        )


class PlanTests(PlanFixture):
    def test_a_task_added_to_a_plan_is_recorded_and_told_the_plans_way(self):
        plan = self.build_plan()
        milestone = plan.milestones.get(name="Kick-off")
        response = self.api(self.csm).post(
            f"/api/v1/plans/{plan.pk}/tasks/",
            {
                "milestone": milestone.pk,
                "title": "Send the deck",
                "priority": "high",
                "due_date": (self.today + timedelta(days=3)).isoformat(),
                "assignee": self.mona.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        task = plan.tasks.get(title="Send the deck")
        self.assertEqual(
            (task.source, task.assignee, task.created_by), ("plan", self.mona, self.csm)
        )
        self.assertEqual(
            task.events.get().data,
            {"source": "plan", "assignee": person(self.mona), "plan": plan.pk},
        )
        self.assertEqual(len(told("plan_task_assigned")), 1)
        self.assertEqual(told(), [])

    def test_the_plan_route_writes_an_event_per_change(self):
        plan = self.build_plan()
        task = plan.tasks.get(title="Hold the call")
        response = self.api(self.csm).patch(
            f"/api/v1/plans/{plan.pk}/tasks/{task.pk}/",
            {"title": "Hold the kick-off call", "priority": "high"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            list(task.events.values_list("kind", "data")),
            [
                (
                    "edited",
                    {"field": "title", "from": "Hold the call", "to": "Hold the kick-off call"},
                ),
                ("edited", {"field": "priority", "from": "medium", "to": "high"}),
            ],
        )

    def test_the_plan_route_does_not_offer_blocked_and_leaving_it_clears_the_reason(self):
        plan = self.build_plan()
        task = plan.tasks.get(title="Hold the call")
        url = f"/api/v1/plans/{plan.pk}/tasks/{task.pk}/"
        refused = self.api(self.csm).patch(url, {"status": "blocked"}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data, {"status": ["Choose pending, in progress or completed."]})
        Task.objects.filter(pk=task.pk).update(status="blocked", blocked_reason="Legal")
        moved = self.api(self.csm).patch(url, {"status": "in-progress"}, format="json")
        self.assertEqual(moved.status_code, 200, moved.content)
        task.refresh_from_db()
        self.assertEqual((task.status, task.blocked_reason), ("in-progress", ""))


class PlanStartTests(StartFixture):
    def test_every_task_of_a_started_plan_is_a_plan_task_with_its_event(self):
        plan = self.start()
        tasks = list(plan.tasks.all())
        self.assertEqual({t.source for t in tasks}, {"plan"})
        events = TaskEvent.objects.filter(task__plan=plan)
        self.assertEqual(events.count(), len(tasks))
        self.assertEqual(
            {(e.kind, e.actor_id, e.data["plan"]) for e in events},
            {("created", self.csm.pk, plan.pk)},
        )
