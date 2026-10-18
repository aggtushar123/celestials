"""Escalation happens once, until the task changes enough to deserve
another (spec §3.2, §5): reassigning, re-dating or re-opening it."""

from django.utils import timezone

from services.customers.models import Task, TaskEvent
from services.notifications.models import Notification
from services.work.tests.fixtures import WorkFixture


class RearmTests(WorkFixture):
    def setUp(self):
        Task.objects.filter(pk=self.overdue.pk).update(escalated_at=timezone.now())

    def url(self, task):
        return f"/api/v1/tasks/{task.pk}/"

    def patch(self, user, task, body):
        response = self.as_user(user).patch(self.url(task), body, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def escalated(self, task):
        return Task.objects.get(pk=task.pk).escalated_at

    def test_new_fields_default_to_null(self):
        self.assertIsNone(self.due_today.escalated_at)
        self.assertIsNone(self.due_today.last_nudged_at)

    def test_the_new_kinds_exist(self):
        self.assertEqual(Notification.Kind.TASK_OVERDUE, "task_overdue")
        self.assertEqual(Notification.Kind.TASK_ESCALATED, "task_escalated")

    def test_reassigning_rearms(self):
        self.patch(self.csm, self.overdue, {"assignee_id": self.mona.pk})
        self.assertIsNone(self.escalated(self.overdue))

    def test_changing_the_due_date_rearms(self):
        new = (self.today).isoformat()
        self.patch(self.csm, self.overdue, {"due_date": new})
        self.assertIsNone(self.escalated(self.overdue))

    def test_reopening_a_completed_task_rearms(self):
        Task.objects.filter(pk=self.done.pk).update(escalated_at=timezone.now())
        self.patch(self.csm, self.done, {"status": "pending"})
        self.assertIsNone(self.escalated(self.done))

    def test_other_edits_keep_it_escalated(self):
        self.patch(self.csm, self.overdue, {"title": "Call Pizza Hut today", "priority": "low"})
        self.patch(self.csm, self.overdue, {"status": "in-progress"})
        self.assertIsNotNone(self.escalated(self.overdue))

    def test_rearming_writes_no_event_of_its_own(self):
        before = TaskEvent.objects.filter(task=self.overdue).count()
        self.patch(self.csm, self.overdue, {"assignee_id": self.mona.pk})
        kinds = list(
            TaskEvent.objects.filter(task=self.overdue).values_list("kind", flat=True)[before:]
        )
        self.assertEqual(kinds, ["assigned"])

    def test_rearming_does_not_trust_a_stale_in_memory_value(self):
        from services.customers.task_changes import record_changes, snapshot

        task = Task.objects.get(pk=self.done.pk)
        before = snapshot(task)
        Task.objects.filter(pk=task.pk).update(escalated_at=timezone.now())
        task.status = Task.Status.PENDING
        record_changes(task, before, actor=self.csm)
        self.assertIsNone(self.escalated(self.done))
