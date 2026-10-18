"""Work's clock (spec §3.2 Timezone): "today" and working days are the
workspace's own."""

from datetime import UTC, date, datetime
from unittest.mock import patch

from services.accounts.models import Organisation
from services.customers.models import Task
from services.notifications.models import Notification
from services.work import clock
from services.work.models import WorkSettings
from services.work.prefs import settings_for
from services.work.recommend import notify_waiting
from services.work.tests.recommend_fixtures import RecommendFixture

# Wednesday 7 Oct 2026, 20:00 UTC: already Thursday 8 Oct in Kolkata (UTC+5:30).
LATE_WEDNESDAY = datetime(2026, 10, 7, 20, 0, tzinfo=UTC)
FRI, SAT, SUN, MON, TUE = (date(2026, 10, d) for d in (9, 10, 11, 12, 13))


class ClockTests(RecommendFixture):
    def fresh(self):
        return Organisation.objects.get(pk=self.org.pk)

    def test_today_is_utc_by_default(self):
        self.assertEqual(clock.today_for(self.fresh(), LATE_WEDNESDAY), date(2026, 10, 7))

    def test_today_follows_the_workspace_timezone(self):
        self.prefer(timezone="Asia/Kolkata")
        self.assertEqual(clock.today_for(self.fresh(), LATE_WEDNESDAY), date(2026, 10, 8))

    def test_an_unknown_stored_timezone_reads_as_utc(self):
        self.prefer(timezone="Mars/Olympus")
        self.assertEqual(clock.today_for(self.fresh(), LATE_WEDNESDAY), date(2026, 10, 7))

    def test_start_of_day_is_local_midnight(self):
        self.prefer(timezone="Asia/Kolkata")
        start = clock.start_of_day(self.fresh(), date(2026, 10, 8))
        self.assertEqual(start.astimezone(UTC), datetime(2026, 10, 7, 18, 30, tzinfo=UTC))

    def test_working_days_default_to_monday_to_friday(self):
        self.assertEqual(clock.working_days_for(self.fresh()), (0, 1, 2, 3, 4))
        self.prefer(working_days=[6, 0, 1, 2, 3])
        self.assertEqual(clock.working_days_for(self.fresh()), (0, 1, 2, 3, 6))

    def test_add_working_days_skips_the_weekend(self):
        self.assertEqual(clock.add_working_days(FRI, 1), MON)
        self.assertEqual(clock.add_working_days(FRI, 2), TUE)
        self.assertEqual(clock.add_working_days(FRI, 1, (0, 1, 2, 3, 4, 5, 6)), SAT)

    def test_add_working_days_with_no_working_days_uses_the_default(self):
        self.assertEqual(clock.add_working_days(FRI, 1, ()), MON)

    def test_working_days_between_counts_after_start_up_to_end(self):
        self.assertEqual(clock.working_days_between(FRI, SAT), 0)
        self.assertEqual(clock.working_days_between(FRI, MON), 1)
        self.assertEqual(clock.working_days_between(FRI, TUE), 2)
        self.assertEqual(clock.working_days_between(SUN, MON), 1)
        self.assertEqual(clock.working_days_between(MON, MON), 0)
        self.assertEqual(clock.working_days_between(FRI, SUN, (5, 6)), 2)

    def test_the_feed_uses_the_workspace_date(self):
        self.prefer(timezone="Asia/Kolkata")
        task = Task.objects.create(
            customer=self.pizza,
            title="Call Pizza Hut",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=date(2026, 10, 8),
        )
        with patch("django.utils.timezone.now", return_value=LATE_WEDNESDAY):
            data = self.ok(self.csm, "/api/v1/work/feed/?kind=task")
        today = next(g for g in data["groups"] if g["key"] == "today")
        self.assertIn(task.pk, [i["id"] for i in today["items"]])

    def test_assign_defaults_use_the_workspace_working_days(self):
        self.prefer(working_days=[0, 1, 2, 3, 4, 5, 6])
        self.make_rec("overdue_tasks", on=self.pizza, recipient=self.mona, suggested=self.csm)
        today = clock.today_for(self.fresh())
        data = self.ok(self.mona, "/api/v1/work/recommendations/?scope=me")
        due = data["items"][0]["defaults"]["due_date"]
        self.assertEqual(due, clock.add_working_days(today, 3, (0, 1, 2, 3, 4, 5, 6)).isoformat())

    def test_told_today_is_the_workspace_day(self):
        """A notice sent yesterday (local) does not count as today's, even
        on the same UTC date."""
        self.prefer(timezone="Asia/Kolkata")
        rec = self.make_rec(on=self.pizza, recipient=self.mona, suggested=self.csm)
        earlier = Notification.objects.create(
            recipient=self.mona, kind=Notification.Kind.RECOMMENDATIONS_WAITING, message="x"
        )
        # 7 Oct 10:00 UTC is still 7 Oct in Kolkata; LATE_WEDNESDAY is 8 Oct there.
        Notification.objects.filter(pk=earlier.pk).update(
            created_at=datetime(2026, 10, 7, 10, 0, tzinfo=UTC)
        )
        told = notify_waiting([rec], today=date(2026, 10, 8))
        self.assertEqual(told, 1)

    def test_told_today_still_holds_within_the_local_day(self):
        self.prefer(timezone="Asia/Kolkata")
        rec = self.make_rec(on=self.pizza, recipient=self.mona, suggested=self.csm)
        earlier = Notification.objects.create(
            recipient=self.mona, kind=Notification.Kind.RECOMMENDATIONS_WAITING, message="x"
        )
        Notification.objects.filter(pk=earlier.pk).update(
            created_at=datetime(2026, 10, 7, 19, 0, tzinfo=UTC)
        )
        self.assertEqual(notify_waiting([rec], today=date(2026, 10, 8)), 0)

    def test_settings_rows_get_the_defaults(self):
        prefs = settings_for(self.fresh())
        self.assertEqual(
            (prefs.timezone, prefs.working_days, prefs.escalate_after_days),
            ("UTC", [0, 1, 2, 3, 4], 2),
        )
        self.assertEqual((prefs.digest_enabled, prefs.digest_hour), (True, 8))
        self.assertIsInstance(WorkSettings._meta.get_field("working_days").default(), list)
