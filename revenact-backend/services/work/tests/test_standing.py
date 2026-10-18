"""Suspended and revoked members get no work (cleanup batch, fix round 1):
a person counts as active for work only when the user is active and their
membership in the workspace is `active` (services/work/standing.py). One
test per place the rule is applied beyond tracking, fallbacks and digests;
each checks suspended and revoked are excluded and active is included."""

from datetime import date
from unittest.mock import patch

from services.customers.models import Customer, Task
from services.customers.task_changes import notify_assigned
from services.identity.models import OrganizationMembership
from services.notifications.models import Notification
from services.work.recommend import notify_waiting
from services.work.routing import Route, Router
from services.work.sources import Signal
from services.work.tests.recommend_fixtures import RecommendFixture

LEFT = ("suspended", "revoked")
URL = "/api/v1/work/recommendations/"


class StandingFixture(RecommendFixture):
    def standing(self, user, status):
        OrganizationMembership.objects.filter(organisation=self.org, user=user).update(
            status=status
        )


class RoutingOpensTests(StandingFixture):
    def route(self, record):
        fresh = Customer.objects.select_related("owner").get(pk=record.pk)
        signal = Signal("renewal_due", fresh, None, "t", (), (), 1.0)
        return Router(self.org, "manager").route(signal)

    def test_a_suspended_or_revoked_record_owner_is_passed_over(self):
        self.assertEqual(self.route(self.dough), Route(self.csm, self.mona))
        for status in LEFT:
            with self.subTest(status=status):
                self.standing(self.csm, status)
                self.assertEqual(self.route(self.dough), Route(None, self.admin))

    def test_a_suspended_or_revoked_manager_is_skipped(self):
        for status in LEFT:
            with self.subTest(status=status):
                self.standing(self.mona, status)
                self.assertEqual(self.route(self.dough), Route(self.csm, self.csm))


class NotifyWaitingTests(StandingFixture):
    def told(self):
        rec = self.make_rec(on=self.pizza, recipient=self.mona, suggested=self.csm)
        try:
            return notify_waiting([rec], today=date(2026, 10, 8))
        finally:
            rec.delete()
            Notification.objects.all().delete()

    def test_only_an_active_recipient_is_told(self):
        self.assertEqual(self.told(), 1)
        for status in LEFT:
            with self.subTest(status=status):
                self.standing(self.mona, status)
                self.assertEqual(self.told(), 0)


class RecommendedListTests(StandingFixture):
    def suggested(self):
        body = self.ok(self.admin, f"{URL}?scope=team")
        row = next(i for i in body["items"] if i["id"] == self.rec.pk)
        s = row["suggested_assignee"]
        return s["active"], s["can_open"]

    def setUp(self):
        self.rec = self.make_rec(on=self.dough, recipient=self.mona, suggested=self.csm)

    def test_a_suspended_or_revoked_suggested_person_reads_inactive(self):
        self.assertEqual(self.suggested(), (True, True))
        for status in LEFT:
            with self.subTest(status=status):
                self.standing(self.csm, status)
                self.assertEqual(self.suggested(), (False, False))


class AssigneePickerTests(StandingFixture):
    def names(self):
        body = self.ok(self.csm, f"/api/v1/work/assignees/?customer={self.pizza.pk}")
        return {p["name"] for p in body["people"]}

    def test_a_suspended_or_revoked_member_is_not_offered(self):
        self.assertIn("Mona Manager", self.names())
        for status in LEFT:
            with self.subTest(status=status):
                self.standing(self.mona, status)
                self.assertNotIn("Mona Manager", self.names())


class TaskAssignedTests(StandingFixture):
    def told(self):
        task = Task.objects.create(
            customer=self.pizza, title="Call them", assignee=self.mona, due_date=self.today
        )
        with patch("services.notifications.realtime.notify") as notify:
            notify_assigned(task, actor=self.csm)
        return notify.call_count

    def test_a_suspended_or_revoked_assignee_is_not_told(self):
        self.assertEqual(self.told(), 1)
        for status in LEFT:
            with self.subTest(status=status):
                self.standing(self.mona, status)
                self.assertEqual(self.told(), 0)
