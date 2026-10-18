"""To-dos stay where they belong (contract §1): never nudged or escalated,
and counted in their creator's own digest only."""

from datetime import UTC, datetime, time

from services.accounts.models import Organisation
from services.notifications.models import Notification
from services.work import digest, tracking
from services.work.models import WorkSettings
from services.work.prefs import settings_for
from services.work.tests.feed_fixtures import FeedFixture

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]


class TodoGuardTests(FeedFixture):
    def setUp(self):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(working_days=EVERY_DAY)

    def test_a_to_do_is_never_nudged_or_escalated(self):
        self.todo(self.csm, title="Renew passport", due_in=-9)
        self.todo(self.csm, title="Someday")
        now = datetime.combine(self.today, time(10, 0), tzinfo=UTC)
        result = tracking.run(Organisation.objects.get(pk=self.org.pk), now=now)
        self.assertEqual((result.nudged, result.escalated, result.failed), (0, 0, []))
        self.assertFalse(Notification.objects.exists())

    def test_the_digest_counts_and_names_the_readers_own_to_dos(self):
        self.due(self.csm, self.pizza, due_in=-2, title="Call Pizza Hut", priority="high")
        self.todo(self.csm, title="Renew passport", due_in=-1)
        self.todo(self.csm, title="Pay the invoice", due_in=0)
        self.todo(self.csm, title="Someday")
        subject, body = digest.contents(self.csm, today=self.today)
        self.assertIn("2 overdue\n1 due today", body)
        self.assertIn("- Call Pizza Hut (Pizza Hut), due", body)
        self.assertIn("- Renew passport, due", body)
        self.assertIn("- Pay the invoice\n", body)
        self.assertNotIn("Someday", body)
        self.assertIn("2 overdue, 1 due today", subject)

    def test_nobody_elses_digest_counts_them(self):
        self.todo(self.csm, title="Renew passport", due_in=-1)
        for reader in (self.mona, self.admin, self.lee):
            self.assertIsNone(digest.contents(reader, today=self.today), reader.name)
