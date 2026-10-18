"""The task rules every Work route uses: the twice-filter, who may be given a
task, how a task is made (its event and its notification) and how an edit
becomes one event per field.

BrainFixture's world: Carl owns Pizza Hut, Dough Co, Pizza EMEA and Taco
East and reports to Mona; Dana owns Taco Bell and Taco West; Alice (admin)
sees every account; Lee (Leadership, no view-all) opens only Loose Ltd."""

from datetime import timedelta

from services.accounts.models import Organisation, User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Task, TaskEvent
from services.customers.scoping import can_open
from services.customers.task_access import (
    AssigneeCannotOpen,
    assignee_for,
    editable_fields,
    openable_tasks,
)
from services.customers.task_changes import (
    add_task,
    changed_fields,
    record_changes,
    snapshot,
)
from services.notifications.models import Notification


class TaskChangesFixture(BrainFixture):
    def make(self, title="Call them", *, on=None, assignee=None, actor=None, **extra):
        values = {
            "parent": on or self.pizza,
            "title": title,
            "due_date": self.today + timedelta(days=2),
            "priority": "medium",
            "assignee": assignee or self.csm,
            "created_by": actor,
            "actor": actor,
            "source": Task.Source.MANUAL,
            **extra,
        }
        return add_task(**values)

    def fresh(self, user):
        return User.objects.get(pk=user.pk)


class OpenableTests(TaskChangesFixture):
    def test_the_task_rule_and_the_record_rule_both_apply(self):
        mine = self.make("On Pizza Hut", actor=self.csm)
        west = self.make("On Taco West", on=self.west, actor=self.other)
        everything = Task.objects.all()

        def readable(user):
            return set(openable_tasks(self.fresh(user), everything).values_list("title", flat=True))

        self.assertEqual(readable(self.csm), {"On Pizza Hut"})  # assigned, but can't open West
        self.assertEqual(readable(self.mona), {"On Pizza Hut"})  # above Carl; West is Dana's
        self.assertEqual(readable(self.other), {"On Taco West"})  # she made it
        # view-all reads every task, on every record it opens (owner decision 2026-10-07)
        self.assertEqual(readable(self.admin), {"On Pizza Hut", "On Taco West"})
        # Leadership reads every task too, but Lee opens neither record
        self.assertEqual(readable(self.lee), set())
        self.assertEqual(readable(self.stranger), set())
        self.assertEqual({mine.source, west.source}, {"manual"})

    def test_leadership_reads_any_task_on_a_record_it_opens(self):
        self.make("On Loose Ltd", on=self.loose, actor=self.csm)
        rows = openable_tasks(self.fresh(self.lee), Task.objects.all())
        self.assertEqual(list(rows.values_list("title", flat=True)), ["On Loose Ltd"])
        # Dana opens Loose Ltd too (nobody owns it), but the task is Carl's
        rows = openable_tasks(self.fresh(self.other), Task.objects.all())
        self.assertEqual(list(rows.values_list("title", flat=True)), [])


class VisibleTasksTests(TaskChangesFixture):
    """`personal.visible_tasks` alone (the task rule, before the record rule)."""

    def test_view_all_and_leadership_read_every_task_others_their_chain(self):
        from services.customers.personal import visible_tasks

        self.make("Carl's", actor=self.csm)
        self.make("Dana's", on=self.taco, assignee=self.other, actor=self.other)
        everything = Task.objects.all()

        def titles(user):
            return set(visible_tasks(self.fresh(user), everything).values_list("title", flat=True))

        self.assertEqual(titles(self.admin), {"Carl's", "Dana's"})  # view_all_accounts
        self.assertEqual(titles(self.lee), {"Carl's", "Dana's"})  # Leadership function
        self.assertEqual(titles(self.mona), {"Carl's"})  # above Carl only
        self.assertEqual(titles(self.other), {"Dana's"})


class AssigneeTests(TaskChangesFixture):
    def test_an_active_member_who_can_open_the_record(self):
        self.assertEqual(assignee_for(self.org.pk, self.mona.pk, self.pizza), self.mona)
        self.assertTrue(can_open(self.mona, self.pizza))

    def test_everyone_else_is_refused_with_one_code(self):
        gone = User.objects.create_user(
            email="gone@acme.io", password="x", name="Gone", organisation=self.org
        )
        User.objects.filter(pk=gone.pk).update(is_active=False)
        for pk in (self.other.pk, gone.pk, self.stranger.pk, 999_999, True, "3"):
            with self.subTest(pk=pk), self.assertRaises(AssigneeCannotOpen) as refused:
                assignee_for(self.org.pk, pk, self.pizza)
            self.assertEqual(
                refused.exception.detail,
                {
                    "code": "ASSIGNEE_CANNOT_OPEN",
                    "detail": "That person can't open this organisation.",
                },
            )

    def test_a_suspended_or_revoked_member_is_refused_like_an_inactive_one(self):
        from services.identity.models import OrganizationMembership

        memberships = OrganizationMembership.objects.filter(organisation=self.org, user=self.mona)
        self.assertEqual(assignee_for(self.org.pk, self.mona.pk, self.pizza), self.mona)
        for status in ("suspended", "revoked"):
            memberships.update(status=status)
            with self.subTest(status=status), self.assertRaises(AssigneeCannotOpen) as refused:
                assignee_for(self.org.pk, self.mona.pk, self.pizza)
            self.assertEqual(refused.exception.detail["code"], "ASSIGNEE_CANNOT_OPEN")
        memberships.update(status="active")
        self.assertEqual(assignee_for(self.org.pk, self.mona.pk, self.pizza), self.mona)

    def test_an_account_is_named_as_one(self):
        with self.assertRaises(AssigneeCannotOpen) as refused:
            assignee_for(self.org.pk, self.csm.pk, self.west)
        self.assertEqual(refused.exception.detail["detail"], "That person can't open this account.")

    def test_can_open_is_false_for_nobody_and_for_the_inactive(self):
        self.assertFalse(can_open(None, self.pizza))
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        self.assertFalse(can_open(self.fresh(self.csm), self.pizza))

    def test_an_ordinary_task_is_editable_in_every_field(self):
        task = self.make(actor=self.csm)
        self.assertEqual(
            editable_fields(self.csm, task),
            ["title", "description", "status", "due_date", "priority", "assignee"],
        )


class AddTaskTests(TaskChangesFixture):
    def notes(self):
        return list(
            Notification.objects.filter(kind="task_assigned").values_list(
                "recipient_id", "actor_id", "message", "link"
            )
        )

    def test_it_stores_the_person_writes_created_and_tells_the_assignee(self):
        task = self.make("Ship the deck", assignee=self.mona, actor=self.csm, description="Slides")
        self.assertEqual(
            (task.assignee, task.assignee_name, task.created_by, task.description),
            (self.mona, "Mona Manager", self.csm, "Slides"),
        )
        [event] = task.events.all()
        self.assertEqual((event.kind, event.actor), ("created", self.csm))
        self.assertEqual(
            event.data,
            {"source": "manual", "assignee": {"id": self.mona.pk, "name": "Mona Manager"}},
        )
        self.assertEqual(
            self.notes(),
            [
                (
                    self.mona.pk,
                    self.csm.pk,
                    "Carl CSM assigned you “Ship the deck” on Pizza Hut.",
                    f"/work/mine?task={task.pk}",
                )
            ],
        )

    def test_nobody_is_told_about_their_own_task(self):
        self.make(assignee=self.csm, actor=self.csm)
        self.assertEqual(self.notes(), [])

    def test_revenact_tells_everyone_including_the_rule_owner(self):
        task = self.make(
            actor=None, created_by=self.csm, source=Task.Source.RULE, event_data={"rule": 7}
        )
        self.assertEqual(task.events.get().data["rule"], 7)
        self.assertIsNone(task.events.get().actor)
        [(recipient, actor, message, _)] = self.notes()
        self.assertEqual((recipient, actor), (self.csm.pk, None))
        self.assertEqual(message, "Revenact assigned you “Call them” on Pizza Hut.")

    def test_a_record_the_assignee_cannot_open_is_not_named(self):
        self.make("West handover", on=self.west, assignee=self.csm, actor=self.other)
        [(_, _, message, _)] = self.notes()
        self.assertEqual(message, "Dana CSM assigned you a task on an account you can't open.")

    def test_an_inactive_assignee_is_not_told(self):
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        self.make(assignee=self.fresh(self.mona), actor=self.csm)
        self.assertEqual(self.notes(), [])

    def test_a_recommendation_writes_its_facts(self):
        task = self.make(
            actor=None,
            source=Task.Source.RECOMMENDATION,
            facts=["Renews in 9 days", "Health fell 5.6 → 4.9 in 14 days"],
        )
        self.assertEqual(
            list(task.events.values_list("kind", "data")),
            [
                (
                    "created",
                    {
                        "source": "recommendation",
                        "assignee": {"id": self.csm.pk, "name": "Carl CSM"},
                    },
                ),
                (
                    "recommended",
                    {"facts": ["Renews in 9 days", "Health fell 5.6 → 4.9 in 14 days"]},
                ),
            ],
        )

    def test_notify_assignee_false_writes_the_event_only(self):
        task = self.make(assignee=self.mona, actor=self.csm, notify_assignee=False)
        self.assertEqual(task.events.count(), 1)
        self.assertEqual(self.notes(), [])


class RecordChangesTests(TaskChangesFixture):
    def test_one_event_per_changed_field(self):
        task = self.make(actor=self.csm)
        before = snapshot(task)
        task.title = "Call them again"
        task.description = "Ask about seats"
        task.priority = "high"
        task.due_date = self.today + timedelta(days=5)
        task.assignee = self.mona
        task.status, task.blocked_reason = "blocked", "Waiting on legal"
        task.save()

        names = record_changes(task, before, actor=self.csm)

        self.assertEqual(
            names,
            [
                "title",
                "description",
                "priority",
                "due_date",
                "assignee",
                "status",
                "blocked_reason",
            ],
        )
        rows = list(task.events.exclude(kind="created").values_list("kind", "data"))
        self.assertEqual(
            rows,
            [
                ("edited", {"field": "title", "from": "Call them", "to": "Call them again"}),
                ("edited", {"field": "priority", "from": "medium", "to": "high"}),
                ("edited", {"field": "description"}),
                (
                    "due_changed",
                    {
                        "from": (self.today + timedelta(days=2)).isoformat(),
                        "to": (self.today + timedelta(days=5)).isoformat(),
                    },
                ),
                (
                    "assigned",
                    {
                        "from": {"id": self.csm.pk, "name": "Carl CSM"},
                        "to": {"id": self.mona.pk, "name": "Mona Manager"},
                    },
                ),
                ("status", {"from": "pending", "to": "blocked", "reason": "Waiting on legal"}),
            ],
        )
        self.assertEqual(
            set(TaskEvent.objects.exclude(kind="created").values_list("actor", flat=True)),
            {self.csm.pk},
        )

    def test_a_new_reason_alone_is_a_status_event(self):
        task = self.make(actor=self.csm, status="blocked", blocked_reason="Legal")
        before = snapshot(task)
        task.blocked_reason = "Legal, then finance"
        self.assertEqual(changed_fields(task, before), ["blocked_reason"])
        record_changes(task, before, actor=self.csm)
        self.assertEqual(
            task.events.get(kind="status").data,
            {"from": "blocked", "to": "blocked", "reason": "Legal, then finance"},
        )

    def test_nothing_changed_writes_nothing(self):
        task = self.make(actor=self.csm)
        self.assertEqual(record_changes(task, snapshot(task), actor=self.csm), [])
        self.assertEqual(task.events.count(), 1)


class OtherWorkspaceTests(TaskChangesFixture):
    def test_a_stranger_is_never_assignable(self):
        other = Organisation.objects.get(pk=self.other_org.pk)
        with self.assertRaises(AssigneeCannotOpen):
            assignee_for(other.pk, self.csm.pk, self.pizza)
