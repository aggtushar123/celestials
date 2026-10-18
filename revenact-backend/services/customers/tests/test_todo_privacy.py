"""A to-do is its creator's alone (Work in one place §3): only
`readable_tasks` reads it, and only for its creator. Every other rule and
every existing list reads exactly what it read before the to-do existed."""

from datetime import timedelta

from services.accounts.models import User
from services.copilot.views import _task_rule
from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.customers.task_access import (
    is_todo,
    on_record_q,
    openable_tasks,
    readable_tasks,
    todo_q,
)
from services.work.tests.fixtures import WorkFixture


class TodoPrivacyTests(WorkFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.todo = Task.objects.create(
            title="Renew my passport",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            created_by=cls.csm,
            due_date=cls.today - timedelta(days=1),
            priority="high",
        )

    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def test_only_its_creator_reads_a_to_do(self):
        expected = {self.csm: True, self.mona: False, self.admin: False, self.lee: False}
        for reader, found in expected.items():
            rows = readable_tasks(self.fresh(reader), Task.objects.filter(pk=self.todo.pk))
            self.assertEqual(rows.exists(), found, reader.name)

    def test_every_other_task_is_read_as_the_twice_filter_reads_it(self):
        others = Task.objects.exclude(pk=self.todo.pk)
        for reader in (self.csm, self.mona, self.admin, self.lee):
            reader = self.fresh(reader)
            self.assertEqual(
                set(readable_tasks(reader, others)), set(openable_tasks(reader, others))
            )

    def test_no_other_rule_reads_a_to_do_not_even_for_its_creator(self):
        _model, copilot_rule = _task_rule()
        for reader in (self.csm, self.mona, self.admin, self.lee):
            reader = self.fresh(reader)
            for rule in (visible_tasks, openable_tasks, copilot_rule):
                self.assertNotIn(self.todo, rule(reader, Task.objects.all()), reader.name)

    def test_is_todo_and_todo_q(self):
        self.assertTrue(is_todo(self.todo))
        self.assertFalse(is_todo(self.overdue))
        self.assertEqual(list(Task.objects.filter(todo_q(self.csm))), [self.todo])
        self.assertFalse(Task.objects.filter(todo_q(self.mona)).exists())

    def test_on_record_q_is_every_task_but_a_to_do(self):
        on_record = set(Task.objects.filter(on_record_q()).values_list("pk", flat=True))
        self.assertNotIn(self.todo.pk, on_record)
        self.assertIn(self.overdue.pk, on_record)

    def test_no_existing_list_shows_or_counts_a_to_do(self):
        named = (
            "/api/v1/tasks/",
            "/api/v1/tasks/?mine=true",
            f"/api/v1/customers/{self.pizza.pk}/tasks/",
            "/api/v1/brain/graph/?scope=me",
        )
        # Lists whose counts would move with an overdue to-do: compared whole.
        counted = (
            "/api/v1/work/team/",
            f"/api/v1/work/tasks/?assignee={self.csm.pk}&state=overdue",
            "/api/v1/work/feed/team/?scope=team",
            "/api/v1/work/feed/team/?scope=company",
        )
        readers = (self.csm, self.mona, self.admin, self.lee)

        def read(urls):
            return {
                (r.pk, url): self.as_user(self.fresh(r)).get(url).content
                for r in readers
                for url in urls
            }

        with self.assertLogs("django.request", "WARNING"):
            with_todo = read(named + counted)
        for key, body in with_todo.items():
            self.assertNotIn(b"Renew my passport", body, key)
        Task.objects.filter(pk=self.todo.pk).delete()
        with self.assertLogs("django.request", "WARNING"):
            without = read(counted)
        for key, body in without.items():
            self.assertEqual(with_todo[key], body, key)
