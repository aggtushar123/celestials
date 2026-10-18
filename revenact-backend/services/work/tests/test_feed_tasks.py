"""The feed's tasks and to-dos (contract §2.1, §2.2): every open task the
reader may read and every to-do of theirs in exactly one of six groups,
ordered by date, priority and age; the rest counted in `hidden`."""

from datetime import timedelta

from rest_framework import serializers

from services.accounts.models import User
from services.customers.models import Task
from services.work.feed_shape import TASK, TODO
from services.work.feed_tasks import Tasks, group_of, source_of
from services.work.tests.feed_fixtures import FeedFixture

stamp = serializers.DateTimeField().to_representation


class FeedTasksTests(FeedFixture):
    def tasks(self, user, kinds=(TASK, TODO)):
        return Tasks(User.objects.get(pk=user.pk), self.today, frozenset(kinds))

    def ids(self, source, group):
        return [t.pk for t in source.tasks(group, None, 50)]

    def test_every_open_task_and_to_do_lands_in_one_group(self):
        late = self.due(self.csm, self.pizza, due_in=-2)
        now = self.due(self.csm, self.dough, due_in=0)
        soon = self.due(self.csm, self.emea, due_in=7)
        far = self.due(self.csm, self.pizza, due_in=8)
        stuck = self.due(self.csm, self.dough, due_in=-5, status="blocked", reason="Legal")
        loose = self.todo(self.csm)
        late_todo = self.todo(self.csm, title="Renew passport", due_in=-1)
        self.due(self.csm, self.pizza, due_in=-3, status="completed")
        source = self.tasks(self.csm)
        self.assertEqual(
            source.counts(),
            {"overdue": 2, "today": 1, "week": 1, "later": 1, "no_date": 1, "blocked": 1},
        )
        self.assertEqual(self.ids(source, "overdue"), [late.pk, late_todo.pk])
        self.assertEqual(self.ids(source, "today"), [now.pk])
        self.assertEqual(self.ids(source, "week"), [soon.pk])
        self.assertEqual(self.ids(source, "later"), [far.pk])
        self.assertEqual(self.ids(source, "no_date"), [loose.pk])
        self.assertEqual(self.ids(source, "blocked"), [stuck.pk])
        for task in (late, now, soon, far, stuck, loose, late_todo):
            self.assertIn(task.pk, self.ids(source, group_of(task, self.today)))

    def test_a_group_reads_by_date_then_priority_then_age(self):
        low = self.due(self.csm, self.pizza, due_in=-1, priority="low")
        high = self.due(self.csm, self.pizza, due_in=-1, priority="high")
        first_medium = self.due(self.csm, self.pizza, due_in=-1, priority="medium")
        second_medium = self.due(self.csm, self.pizza, due_in=-1, priority="medium")
        earlier = self.due(self.csm, self.pizza, due_in=-4, priority="low")
        self.assertEqual(
            self.ids(self.tasks(self.csm), "overdue"),
            [earlier.pk, high.pk, first_medium.pk, second_medium.pk, low.pk],
        )

    def test_blocked_puts_no_date_last(self):
        undated = self.todo(self.csm, status="blocked", reason="Waiting on HR", priority="high")
        dated = self.due(
            self.csm, self.pizza, due_in=10, status="blocked", reason="Legal", priority="low"
        )
        self.assertEqual(self.ids(self.tasks(self.csm), "blocked"), [dated.pk, undated.pk])

    def test_paging_after_a_position_never_skips_or_repeats(self):
        made = [self.todo(self.csm, title=f"To-do {i}") for i in range(5)]
        first = self.tasks(self.csm).page("no_date", None, 2)
        self.assertEqual([entry["id"] for _key, entry in first], [made[0].pk, made[1].pk])
        Task.objects.filter(pk=made[0].pk).update(status="completed")
        rest = self.tasks(self.csm).page("no_date", first[-1][0], 10)
        self.assertEqual([entry["id"] for _key, entry in rest], [m.pk for m in made[2:]])

    def test_only_the_creator_has_their_to_dos(self):
        self.todo(self.csm, due_in=-1)
        for reader in (self.mona, self.admin, self.lee, self.other):
            self.assertEqual(sum(self.tasks(reader).counts().values()), 0, reader.name)

    def test_hidden_counts_the_readers_tasks_on_records_they_cannot_open(self):
        self.due(self.csm, self.west, due_in=-1, created_by=self.other)
        source = self.tasks(self.csm)
        self.assertEqual((source.hidden(), sum(source.counts().values())), (1, 0))
        self.assertEqual(self.tasks(self.csm, kinds=(TODO,)).hidden(), 0)

    def test_the_kind_filter(self):
        task = self.due(self.csm, self.pizza, due_in=-1)
        todo = self.todo(self.csm, due_in=-1)
        self.assertEqual(self.ids(self.tasks(self.csm, kinds=(TASK,)), "overdue"), [task.pk])
        self.assertEqual(self.ids(self.tasks(self.csm, kinds=(TODO,)), "overdue"), [todo.pk])
        self.assertEqual(self.tasks(self.csm, kinds=(TODO,)).asked, [TODO])

    def test_a_to_do_item(self):
        todo = self.todo(self.csm, priority="high")
        ((key, entry),) = self.tasks(self.csm).page("no_date", None, 5)
        self.assertEqual(key[2:], (todo.created_at, todo.pk))
        detail = entry.pop("detail")
        self.assertEqual(
            entry,
            {
                "key": f"task:{todo.pk}",
                "kind": "todo",
                "id": todo.pk,
                "title": "Book the dentist",
                "record": None,
                "from": {"type": "person", "label": "Carl CSM"},
                "at": stamp(todo.created_at),
                "due_date": None,
                "priority": "high",
                "private": True,
                "actions": ["done", "open"],
            },
        )
        self.assertEqual((detail["id"], detail["parent"], detail["private"]), (todo.pk, None, True))

    def test_a_task_item_names_its_record(self):
        task = self.due(self.csm, self.emea, due_in=0, created_by=self.mona)
        ((_key, entry),) = self.tasks(self.csm).page("today", None, 5)
        self.assertEqual(entry["kind"], "task")
        self.assertEqual(
            entry["record"], {"type": "account", "id": self.emea.pk, "name": "Pizza EMEA"}
        )
        self.assertEqual(entry["from"], {"type": "person", "label": "Mona Manager"})
        self.assertEqual(entry["due_date"], self.today.isoformat())
        self.assertFalse(entry["private"])
        self.assertEqual(entry["key"], f"task:{task.pk}")

    def test_where_a_task_came_from(self):
        cases = {
            "agent": {"type": "agent", "label": "AI agent"},
            "rule": {"type": "rule", "label": "A rule"},
            "recommendation": {"type": "revenact", "label": "Revenact"},
        }
        for source, expected in cases.items():
            task = self.due(self.csm, self.pizza, due_in=1, source=source)
            self.assertEqual(source_of(task), expected)
        seeded = self.due(self.csm, self.pizza, due_in=1)
        seeded.created_by = None
        self.assertEqual(source_of(seeded), {"type": "revenact", "label": "Revenact"})

    def test_group_of_a_dateless_and_a_week_away_task(self):
        self.assertEqual(group_of(self.todo(self.csm), self.today), "no_date")
        week = self.due(self.csm, self.pizza, due_in=1)
        self.assertEqual(group_of(week, self.today), "week")
        self.assertEqual(group_of(week, self.today + timedelta(days=1)), "today")
