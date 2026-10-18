"""Nudges and escalations (spec §3.2, §4, §5). WorkFixture's open overdue
work: Carl's "Call Pizza Hut" (2 days), his "West handover" (1 day, on Taco
West, which Carl cannot open), and Dana's "Taco Bell review" (3 days).
"Send the contract" is Blocked and "Old call" completed: never tracked.
Carl reports to Mona; Dana has no manager; Alice owns the workspace."""

from datetime import UTC, date, datetime, time, timedelta

from services.accounts.models import Organisation, User
from services.customers.models import Task, TaskEvent
from services.identity.models import OrganizationMembership
from services.notifications.models import Notification
from services.work import tracking
from services.work.models import WorkSettings
from services.work.prefs import settings_for
from services.work.tests.fixtures import WorkFixture

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
#: A repeat pass over the fixture's three tracked tasks: settings (read
#: twice), the active-for-work ids (`standing`), the owner, the overdue list,
#: then a savepoint, the nudge claim and its release per task.
PINNED = 5 + 3 * 3
K = Notification.Kind


class TrackingTests(WorkFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        OrganizationMembership.objects.update_or_create(
            organisation=cls.org, user=cls.admin, defaults={"is_owner": True, "status": "active"}
        )

    def setUp(self):
        # Every day a working day unless a test says otherwise, so the
        # fixture's dates (relative to the real today) behave the same any day.
        self.prefer(working_days=EVERY_DAY, escalate_after_days=2)
        self.now = datetime.combine(self.today, time(10, 0), tzinfo=UTC)

    def prefer(self, **fields):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(**fields)

    def run_pass(self, now=None):
        return tracking.run(Organisation.objects.get(pk=self.org.pk), now=now or self.now)

    def told(self, kind, recipient):
        return list(
            Notification.objects.filter(kind=kind, recipient=recipient).values_list(
                "message", flat=True
            )
        )

    # Nudges

    def test_each_overdue_task_nudges_its_assignee_once(self):
        result = self.run_pass()
        self.assertEqual(result.nudged, 3)
        self.assertCountEqual(
            self.told(K.TASK_OVERDUE, self.csm),
            [
                "“Call Pizza Hut” on Pizza Hut is 2 days overdue.",
                "A task on an account you can't open is overdue.",
            ],
        )
        self.assertEqual(
            self.told(K.TASK_OVERDUE, self.other),
            ["“Taco Bell review” on Taco Bell is 3 days overdue."],
        )
        note = Notification.objects.filter(kind=K.TASK_OVERDUE, recipient=self.other).get()
        self.assertEqual(note.link, f"/work/mine?task={self.danas.pk}")
        self.assertIsNone(note.actor)

    def test_a_nudge_writes_a_nudged_event(self):
        self.run_pass()
        event = TaskEvent.objects.get(task=self.overdue, kind=TaskEvent.Kind.NUDGED)
        self.assertIsNone(event.actor)
        self.assertEqual(
            event.data, {"days_overdue": 2, "to": {"id": self.csm.pk, "name": "Carl CSM"}}
        )

    def test_one_day_is_singular(self):
        Task.objects.filter(pk=self.overdue.pk).update(due_date=self.today - timedelta(days=1))
        self.run_pass()
        self.assertIn(
            "“Call Pizza Hut” on Pizza Hut is 1 day overdue.", self.told(K.TASK_OVERDUE, self.csm)
        )

    def test_once_per_local_day(self):
        # Tomorrow "Prep the Dough Co QBR" is overdue too: keep it out.
        Task.objects.filter(pk=self.due_today.pk).update(status="completed")
        self.run_pass()
        same_day = self.run_pass(self.now + timedelta(hours=13))
        self.assertEqual(same_day.nudged, 0)
        next_day = self.run_pass(self.now + timedelta(days=1))
        self.assertEqual(next_day.nudged, 3)

    def test_a_run_the_next_day_under_24_hours_later_still_nudges(self):
        Task.objects.filter(pk=self.due_today.pk).update(status="completed")
        self.run_pass()
        next_morning = self.run_pass(self.now + timedelta(hours=23))
        self.assertEqual(next_morning.nudged, 3)

    def test_blocked_completed_and_not_yet_due_are_never_nudged(self):
        self.run_pass()
        nudged = set(
            TaskEvent.objects.filter(kind=TaskEvent.Kind.NUDGED).values_list("task_id", flat=True)
        )
        self.assertEqual(nudged, {self.overdue.pk, self.handed.pk, self.danas.pk})

    def test_a_task_with_no_assignee_is_left_alone(self):
        Task.objects.filter(pk=self.danas.pk).update(assignee=None)
        result = self.run_pass()
        self.assertEqual(result.nudged, 2)
        self.assertIsNone(Task.objects.get(pk=self.danas.pk).escalated_at)

    def test_a_deactivated_assignee_is_not_nudged(self):
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.run_pass()
        self.assertEqual(self.told(K.TASK_OVERDUE, self.other), [])

    # Escalations

    def test_escalates_once_overdue_by_enough_working_days(self):
        self.run_pass()
        # Carl's 2-day task reaches 2; his 1-day handover does not; Dana's 3-day one does.
        self.assertEqual(
            self.told(K.TASK_ESCALATED, self.mona),
            ["“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue."],
        )
        self.assertEqual(
            self.told(K.TASK_ESCALATED, self.admin),
            ["“Taco Bell review” on Taco Bell, assigned to Dana CSM, is 3 working days overdue."],
        )
        self.assertIsNone(Task.objects.get(pk=self.handed.pk).escalated_at)

    def test_an_escalation_writes_an_escalated_event(self):
        self.run_pass()
        event = TaskEvent.objects.get(task=self.overdue, kind=TaskEvent.Kind.ESCALATED)
        self.assertEqual(
            event.data,
            {"working_days_overdue": 2, "to": {"id": self.mona.pk, "name": "Mona Manager"}},
        )

    def test_escalates_only_once(self):
        # The handover would reach 2 working days tomorrow: keep it out.
        Task.objects.filter(pk=self.handed.pk).update(status="completed", blocked_reason="")
        first = self.run_pass()
        second = self.run_pass(self.now + timedelta(days=1))
        self.assertEqual((first.escalated, second.escalated), (2, 0))
        self.assertEqual(len(self.told(K.TASK_ESCALATED, self.mona)), 1)

    def test_a_reassigned_task_escalates_again(self):
        Task.objects.filter(pk=self.handed.pk).update(status="completed", blocked_reason="")
        self.run_pass()
        self.assertEqual(len(self.told(K.TASK_ESCALATED, self.mona)), 1)
        response = self.as_user(self.mona).patch(
            f"/api/v1/tasks/{self.overdue.pk}/", {"assignee_id": self.mona.pk}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(Task.objects.get(pk=self.overdue.pk).escalated_at)
        self.run_pass(self.now + timedelta(days=1))
        # Mona now holds it and has no manager: the owner is told.
        self.assertEqual(
            self.told(K.TASK_ESCALATED, self.admin)[0],
            "“Call Pizza Hut” on Pizza Hut, assigned to Mona Manager, is 3 working days overdue.",
        )

    def test_a_reopened_task_escalates_again(self):
        Task.objects.filter(pk=self.handed.pk).update(status="completed", blocked_reason="")
        self.run_pass()
        Task.objects.filter(pk=self.overdue.pk).update(status="completed")
        response = self.as_user(self.mona).patch(
            f"/api/v1/tasks/{self.overdue.pk}/", {"status": "pending"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(Task.objects.get(pk=self.overdue.pk).escalated_at)
        self.run_pass(self.now + timedelta(days=1))
        self.assertEqual(len(self.told(K.TASK_ESCALATED, self.mona)), 2)

    def test_the_manager_is_told_generically_about_a_record_they_cannot_open(self):
        Task.objects.filter(pk=self.handed.pk).update(due_date=self.today - timedelta(days=4))
        self.run_pass()
        self.assertIn(
            "A task assigned to Carl CSM on an account you can't open is overdue.",
            self.told(K.TASK_ESCALATED, self.mona),
        )

    def test_an_inactive_manager_falls_back_to_the_owner(self):
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        self.run_pass()
        self.assertIn(
            "“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue.",
            self.told(K.TASK_ESCALATED, self.admin),
        )

    def test_a_deactivated_assignee_escalates_straight_away(self):
        self.prefer(escalate_after_days=30)
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        self.run_pass()
        escalated = set(
            Task.objects.filter(escalated_at__isnull=False).values_list("id", flat=True)
        )
        self.assertEqual(escalated, {self.overdue.pk, self.handed.pk})

    def standing(self, user, status):
        OrganizationMembership.objects.filter(organisation=self.org, user=user).update(
            status=status
        )

    def test_a_suspended_or_revoked_manager_falls_back_to_the_owner(self):
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                Notification.objects.all().delete()
                Task.objects.update(escalated_at=None, last_nudged_at=None)
                self.standing(self.mona, status)
                self.run_pass()
                self.assertEqual(self.told(K.TASK_ESCALATED, self.mona), [])
                self.assertIn(
                    "“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days "
                    "overdue.",
                    self.told(K.TASK_ESCALATED, self.admin),
                )

    def test_an_active_manager_is_told(self):
        self.standing(self.mona, "active")
        self.run_pass()
        self.assertEqual(len(self.told(K.TASK_ESCALATED, self.mona)), 1)

    def test_a_suspended_or_revoked_owner_is_not_told(self):
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                Notification.objects.all().delete()
                Task.objects.update(escalated_at=None, last_nudged_at=None)
                self.standing(self.admin, status)
                self.run_pass()
                self.assertEqual(self.told(K.TASK_ESCALATED, self.admin), [])

    def test_a_suspended_or_revoked_assignee_escalates_straight_away(self):
        self.prefer(escalate_after_days=30)
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                Notification.objects.all().delete()
                Task.objects.update(escalated_at=None, last_nudged_at=None)
                self.standing(self.csm, status)
                result = self.run_pass()
                escalated = set(
                    Task.objects.filter(escalated_at__isnull=False).values_list("id", flat=True)
                )
                self.assertEqual(escalated, {self.overdue.pk, self.handed.pk})
                # Not reminded either: they are no longer working here.
                self.assertEqual(self.told(K.TASK_OVERDUE, self.csm), [])
                self.assertEqual(result.nudged, 1)

    def test_a_repeat_pass_costs_a_fixed_number_of_queries(self):
        """`PINNED`: the active-for-work ids are one query per pass, never
        one per task (the claims are already taken today, so nobody is
        told again)."""
        self.run_pass()
        organisation = Organisation.objects.get(pk=self.org.pk)
        with self.assertNumQueries(PINNED):
            tracking.run(organisation, now=self.now)

    def test_nobody_above_marks_it_escalated_without_telling_anyone(self):
        OrganizationMembership.objects.filter(organisation=self.org).update(is_owner=False)
        OrganizationMembership.objects.update_or_create(
            organisation=self.org, user=self.other, defaults={"is_owner": True, "status": "active"}
        )
        self.run_pass()
        self.assertIsNotNone(Task.objects.get(pk=self.danas.pk).escalated_at)
        self.assertEqual(self.told(K.TASK_ESCALATED, self.other), [])
        self.assertFalse(
            TaskEvent.objects.filter(task=self.danas, kind=TaskEvent.Kind.ESCALATED).exists()
        )

    # Working days and timezones

    def test_nothing_happens_on_a_non_working_day(self):
        self.prefer(working_days=[d for d in EVERY_DAY if d != self.today.weekday()])
        result = self.run_pass()
        self.assertTrue(result.quiet)
        self.assertFalse(
            Notification.objects.filter(kind__in=[K.TASK_OVERDUE, K.TASK_ESCALATED]).exists()
        )

    def test_weekends_do_not_count_toward_escalation(self):
        # Due Friday 9 Oct 2026; Monday the 12th is 1 working day overdue, Tuesday 2.
        self.prefer(working_days=[0, 1, 2, 3, 4])
        friday = date(2026, 10, 9)
        Task.objects.exclude(pk=self.overdue.pk).update(status="completed", blocked_reason="")
        Task.objects.filter(pk=self.overdue.pk).update(due_date=friday)
        monday = datetime(2026, 10, 12, 10, 0, tzinfo=UTC)
        self.assertEqual(self.run_pass(monday).escalated, 0)
        self.assertEqual(self.run_pass(monday + timedelta(days=1)).escalated, 1)

    def test_the_workspace_date_decides_what_is_overdue(self):
        # 20:00 UTC on the due date is already the next day in Kolkata.
        self.prefer(timezone="Asia/Kolkata")
        Task.objects.exclude(pk=self.due_today.pk).update(status="completed", blocked_reason="")
        late = datetime.combine(self.today, time(20, 0), tzinfo=UTC)
        self.assertEqual(self.run_pass(late).nudged, 1)
        self.prefer(timezone="UTC")
        Task.objects.filter(pk=self.due_today.pk).update(last_nudged_at=None)
        self.assertEqual(self.run_pass(late).nudged, 0)

    def test_one_tasks_failure_does_not_stop_another(self):
        from unittest.mock import patch

        real = tracking._nudge

        def flaky(task, *args):
            if task.pk == self.overdue.pk:
                raise RuntimeError("Pizza Hut")
            return real(task, *args)

        with patch.object(tracking, "_nudge", side_effect=flaky):
            result = self.run_pass()
        self.assertEqual(result.failed, [f"task {self.overdue.pk}"])
        self.assertGreaterEqual(result.nudged, 1)
        self.assertTrue(
            TaskEvent.objects.filter(task=self.danas, kind=TaskEvent.Kind.NUDGED).exists()
        )

    def test_a_suspended_workspace_gets_no_nudges(self):
        Organisation.objects.filter(pk=self.org.pk).update(status=Organisation.Status.SUSPENDED)
        result = tracking.run_all(now=self.now)
        self.assertEqual(result.nudged, 0)
        self.assertFalse(Notification.objects.filter(kind=K.TASK_OVERDUE).exists())

    # The nightly entry point

    def test_run_all_keeps_going_when_one_workspace_fails(self):
        from unittest.mock import patch

        real = tracking.run

        def flaky(organisation, *, now=None):
            if organisation.pk == self.org.pk:
                raise RuntimeError("Pizza Hut")
            return real(organisation, now=now)

        # A second workspace with an overdue task for an active member.
        WorkSettings.objects.filter(pk=settings_for(self.other_org).pk).update(
            working_days=EVERY_DAY
        )
        theirs = self.make_task("Globex call", on=self.globex, assignee=self.stranger, due_in=-2)
        with patch.object(tracking, "run", side_effect=flaky):
            result = tracking.run_all(now=self.now)
        self.assertEqual(result.failed, [f"organisation {self.org.pk}"])
        self.assertEqual(result.nudged, 1)
        self.assertTrue(TaskEvent.objects.filter(task=theirs, kind=TaskEvent.Kind.NUDGED).exists())


class NightlyCommandTests(WorkFixture):
    def test_run_health_maintenance_nudges(self):
        from io import StringIO

        from django.core.management import call_command

        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(working_days=EVERY_DAY)
        out = StringIO()
        call_command("run_health_maintenance", stdout=out)
        self.assertIn("nudged 3 overdue task(s)", out.getvalue())
