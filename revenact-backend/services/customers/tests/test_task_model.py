"""The Work round's Task: a description, Blocked with its reason, where it
came from, its activity trail, and `assignee_name` kept equal to the
assignee's name. The backfill reads each existing task's source from its
links."""

from datetime import timedelta
from importlib import import_module

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import Task, TaskEvent
from services.metrics.models import Initiative
from services.notifications.models import Notification
from services.plans.tests.fixtures import PlanFixture

# A migration module's name is not an identifier; the backfill lives in the
# migration and is imported, not copied (see test_churn_reason_migration).
backfill = import_module("services.customers.migrations.0056_task_source_backfill").backfill


class TaskModelTests(PlanFixture):
    def task(self, **fields):
        values = {
            "customer": self.pizza,
            "title": "Call them",
            "due_date": self.today + timedelta(days=2),
            "priority": "medium",
            "assignee": self.csm,
            **fields,
        }
        return Task.objects.create(**values)

    def test_a_new_task_is_manual_pending_and_unblocked_with_no_description(self):
        task = self.task()
        self.assertEqual(
            (task.source, task.status, task.blocked_reason, task.description),
            ("manual", "pending", "", ""),
        )

    def test_assignee_name_follows_the_assignee_on_every_save(self):
        task = self.task(assignee_name="Someone else")
        self.assertEqual(Task.objects.get(pk=task.pk).assignee_name, "Carl CSM")
        task.assignee = self.other
        task.save(update_fields=["assignee"])
        self.assertEqual(Task.objects.get(pk=task.pk).assignee_name, "Dana CSM")

    def test_a_task_with_no_assignee_keeps_its_text_name(self):
        task = self.task(assignee=None, assignee_name="Edgar Holmes")
        self.assertEqual(Task.objects.get(pk=task.pk).assignee_name, "Edgar Holmes")

    def test_leaving_blocked_clears_the_reason_even_on_a_status_only_save(self):
        task = self.task(status="blocked", blocked_reason="Waiting on legal")
        task.status = "in-progress"
        task.save(update_fields=["status"])
        self.assertEqual(Task.objects.get(pk=task.pk).blocked_reason, "")

    def test_blocked_needs_a_reason_and_only_blocked_has_one(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.task(status="blocked", blocked_reason="")
        task = self.task()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Task.objects.filter(pk=task.pk).update(blocked_reason="Stray")

    def test_events_read_oldest_first_and_go_with_their_task(self):
        task = self.task()
        first = TaskEvent.objects.create(task=task, kind="created", actor=self.csm)
        second = TaskEvent.objects.create(task=task, kind="comment", body="Called, no answer")
        self.assertEqual(list(task.events.all()), [first, second])
        self.assertIsNone(second.actor)
        self.assertEqual(second.data, {})
        task.delete()
        self.assertFalse(TaskEvent.objects.exists())

    def test_the_backfill_reads_plan_then_initiative_then_manual(self):
        plan = self.build_plan()
        initiative = Initiative.objects.create(
            organisation=self.org,
            title="Halve ARR at risk",
            metric="at_risk_arr",
            target_value=1,
            target_by=timezone.localdate() + timedelta(days=30),
            baseline_as_of=timezone.localdate(),
        )
        agent = self.task(title="Save play", initiative=initiative)
        both = plan.tasks.first()
        Task.objects.filter(pk=both.pk).update(initiative=initiative)
        manual = self.task(title="Plain")
        Task.objects.update(source="recommendation")

        backfill(Task)

        sources = dict(Task.objects.values_list("pk", "source"))
        self.assertEqual(sources[agent.pk], "agent")
        self.assertEqual(sources[both.pk], "plan")
        self.assertEqual(sources[manual.pk], "manual")
        self.assertEqual({sources[t.pk] for t in plan.tasks.all()}, {"plan"})

    def test_task_assigned_is_a_kind_with_room_for_delivery_twos(self):
        self.assertEqual(Notification.Kind.TASK_ASSIGNED, "task_assigned")
        width = Notification._meta.get_field("kind").max_length
        self.assertGreaterEqual(width, len("recommendations_waiting"))
