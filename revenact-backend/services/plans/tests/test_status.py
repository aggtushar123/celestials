"""How a plan moves: the first completed task puts it on track; a
milestone is done when its tasks are, and re-opens with them unless a person
closed it; the last milestone finishes the plan in the same transaction; a
finished plan moves no more. The existing task route goes through the same
rules, under the plan's row lock. The task payload names its plan."""

from unittest.mock import patch

from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext

from services.customers.models import Task
from services.plans import status as plan_status
from services.plans.models import Plan
from services.plans.status import lock_plan, set_status
from services.plans.tests.fixtures import PlanFixture


class StatusFixture(PlanFixture):
    def tick(self, task, status="completed", user=None):
        return self.api(user or self.csm).patch(
            f"/api/v1/tasks/{task.pk}/", {"status": status}, format="json"
        )

    def fresh(self, plan):
        return Plan.objects.get(pk=plan.pk)

    def before_the_lock(self, change):
        """`lock_plan` with `change()` run just before it: a concurrent
        request that got there first."""
        real = plan_status.lock_plan

        def first_change(pk):
            change()
            return real(pk)

        return patch.object(plan_status, "lock_plan", side_effect=first_change)


class TaskRouteTests(StatusFixture):
    def test_the_first_completed_task_puts_the_plan_on_track(self):
        plan = self.build_plan()
        response = self.tick(plan.tasks.get(title="Hold the call"))
        self.assertEqual(response.status_code, 200, response.content)
        plan = self.fresh(plan)
        self.assertEqual((plan.status, plan.status_set_by), ("on_track", "system"))
        kickoff = plan.milestones.get(name="Kick-off")
        self.assertIsNotNone(kickoff.done_at)
        self.assertIsNone(kickoff.done_by)
        self.assertEqual(
            self.events("plan.status_changed"),
            [(str(plan.pk), {"old": "not_started", "new": "on_track", "by": "system"})],
        )
        self.assertEqual(len(self.events("task.update")), 1)

    def test_reopening_a_task_reopens_the_milestone_its_tasks_completed(self):
        plan = self.build_plan()
        call = plan.tasks.get(title="Hold the call")
        self.tick(call)
        self.tick(call, "pending")
        self.assertIsNone(plan.milestones.get(name="Kick-off").done_at)
        self.assertEqual(self.fresh(plan).status, "on_track")

    def test_a_milestone_marked_done_by_hand_stays_done(self):
        plan = self.build_plan()
        kickoff = plan.milestones.get(name="Kick-off")
        kickoff.done_at, kickoff.done_by = self.now, self.csm
        kickoff.save()
        call = plan.tasks.get(title="Hold the call")
        self.tick(call)
        self.tick(call, "pending")
        self.assertIsNotNone(plan.milestones.get(name="Kick-off").done_at)

    def test_the_last_milestone_done_finishes_the_plan(self):
        plan = self.build_plan()
        for task in plan.tasks.all():
            self.tick(task)
        plan = self.fresh(plan)
        self.assertEqual((plan.status, plan.status_set_by), ("done", "system"))
        self.assertIsNotNone(plan.done_at)
        self.assertEqual(
            [meta for _, meta in self.events("plan.status_changed")],
            [
                {"old": "not_started", "new": "on_track", "by": "system"},
                {"old": "on_track", "new": "done", "by": "system"},
            ],
        )

    def test_a_finished_plan_only_changes_the_task(self):
        plan = self.build_plan(status="cancelled")
        call = plan.tasks.get(title="Hold the call")
        self.assertEqual(self.tick(call).status_code, 200)
        self.assertEqual(Task.objects.get(pk=call.pk).status, "completed")
        self.assertEqual(self.fresh(plan).status, "cancelled")
        self.assertIsNone(plan.milestones.get(name="Kick-off").done_at)

    def test_a_task_without_a_plan_is_as_before(self):
        task = Task.objects.create(
            customer=self.pizza,
            title="Plain",
            assignee=self.csm,
            assignee_name="Carl CSM",
            created_by=self.csm,
            due_date=self.today,
            priority="low",
        )
        self.assertEqual(self.tick(task).status_code, 200)
        self.assertEqual(Task.objects.get(pk=task.pk).status, "completed")

    def test_a_task_deleted_before_the_lock_is_the_routes_404(self):
        plan = self.build_plan()
        call = plan.tasks.get(title="Hold the call")
        with self.before_the_lock(lambda: Task.objects.filter(pk=call.pk).delete()):
            response = self.tick(call)
        self.assertEqual((response.status_code, response.data), (404, {"detail": "No such task."}))
        self.assertEqual(self.events("task.update"), [])
        self.assertEqual(self.fresh(plan).status, "not_started")

    def test_a_plan_deleted_before_the_lock_is_the_routes_404(self):
        plan = self.build_plan()
        call = plan.tasks.get(title="Hold the call")
        with self.before_the_lock(lambda: Plan.objects.filter(pk=plan.pk).delete()):
            response = self.tick(call)
        self.assertEqual((response.status_code, response.data), (404, {"detail": "No such task."}))

    def test_the_task_is_read_again_under_the_lock(self):
        """Moved to Review by someone else first: ticking it finishes Review
        (whose other task is done), not the Kick-off it left."""
        plan = self.build_plan()
        call = plan.tasks.get(title="Hold the call")
        review = plan.milestones.get(name="Review")
        plan.tasks.filter(title="Run the review").update(status="completed")
        with self.before_the_lock(lambda: Task.objects.filter(pk=call.pk).update(milestone=review)):
            self.assertEqual(self.tick(call).status_code, 200)
        self.assertIsNotNone(plan.milestones.get(name="Review").done_at)
        self.assertIsNone(plan.milestones.get(name="Kick-off").done_at)
        self.assertEqual(self.fresh(plan).status, "on_track")

    def test_the_plan_is_locked_before_the_task_is_written(self):
        plan = self.build_plan()
        with CaptureQueriesContext(connection) as ctx:
            self.tick(plan.tasks.get(title="Hold the call"))
        sqls = [q["sql"] for q in ctx.captured_queries]
        lock = next(
            i for i, sql in enumerate(sqls) if "FOR NO KEY UPDATE" in sql and '"plans_plan"' in sql
        )
        write = next(i for i, sql in enumerate(sqls) if sql.startswith('UPDATE "customers_task"'))
        self.assertLess(lock, write)


class SetStatusTests(StatusFixture):
    def set(self, plan, new, by="person"):
        with transaction.atomic():
            return set_status(
                lock_plan(plan.pk), new, by=by, now=self.now, today=self.today, actor=self.csm
            )

    def test_clearing_at_risk_by_hand_records_the_day(self):
        plan = self.build_plan(status="at_risk")
        self.assertTrue(self.set(plan, "on_track"))
        plan = self.fresh(plan)
        self.assertEqual(
            (plan.status, plan.status_set_by, plan.at_risk_cleared_on),
            ("on_track", "person", self.today),
        )

    def test_the_same_status_is_no_change(self):
        plan = self.build_plan()
        self.assertFalse(self.set(plan, "not_started"))
        self.assertEqual(self.events("plan.status_changed"), [])

    def test_cancelling_is_audited_twice(self):
        plan = self.build_plan()
        self.set(plan, "cancelled")
        self.assertEqual(self.events("plan.cancelled"), [(str(plan.pk), {})])
        self.assertEqual(
            self.events("plan.status_changed"),
            [(str(plan.pk), {"old": "not_started", "new": "cancelled", "by": "person"})],
        )


class TaskPayloadTests(StatusFixture):
    def tasks(self, url):
        return {row["title"]: row for row in self.api(self.csm).get(url).data}

    def test_a_task_names_its_plan_and_milestone(self):
        plan = self.build_plan()
        Task.objects.create(
            customer=self.pizza,
            title="Plain",
            assignee_name="x",
            due_date=self.today,
            priority="low",
        )
        rows = self.tasks(f"/api/v1/customers/{self.pizza.pk}/tasks/")
        kickoff = plan.milestones.get(name="Kick-off")
        self.assertEqual(rows["Hold the call"]["plan"], {"id": plan.pk, "name": plan.name})
        self.assertEqual(rows["Hold the call"]["milestone"], {"id": kickoff.pk, "name": "Kick-off"})
        self.assertEqual((rows["Plain"]["plan"], rows["Plain"]["milestone"]), (None, None))

    def test_an_account_task_names_its_plan_too(self):
        plan = self.build_plan(self.emea)
        rows = self.tasks(f"/api/v1/customers/{self.pizza.pk}/accounts/{self.emea.pk}/tasks/")
        self.assertEqual(rows["Hold the call"]["plan"], {"id": plan.pk, "name": plan.name})

    def test_the_list_does_not_grow_with_plan_tasks(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/tasks/")
            return len(ctx.captured_queries)

        self.build_plan()
        one = count()
        self.build_plan(name="Second")
        self.build_plan(name="Third")
        self.assertEqual(count(), one)
