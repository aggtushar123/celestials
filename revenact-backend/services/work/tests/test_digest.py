"""The daily digest (spec §3.2 Digest, §4): once per person per local day,
after the workspace's digest hour on its working days, through the reader's
own visibility, skipped without SMTP, honouring opt-out."""

from datetime import UTC, datetime, time, timedelta
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.work import digest
from services.work.models import DigestSend, WorkSettings
from services.work.prefs import settings_for
from services.work.tests.fixtures import WorkFixture

EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
CONSOLE = "django.core.mail.backends.console.EmailBackend"


class DigestTests(WorkFixture):
    def setUp(self):
        self.prefer(working_days=EVERY_DAY, digest_hour=8)
        self.at_nine = datetime.combine(self.today, time(9, 0), tzinfo=UTC)

    def prefer(self, **fields):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(**fields)

    def sent_to(self):
        return sorted(address for message in mail.outbox for address in message.to)

    def message_for(self, email):
        return next(m for m in mail.outbox if m.to == [email])

    def test_carl_gets_his_own_work(self):
        digest.send_due(self.at_nine)
        message = self.message_for("carl@acme.io")
        day = f"{self.today:%a} {self.today.day} {self.today:%b}"
        self.assertEqual(message.subject, f"Your work for {day}: 1 overdue, 1 due today")
        self.assertIn("1 overdue\n1 due today\n1 blocked", message.body)
        due = self.overdue.due_date
        self.assertIn(f"- Call Pizza Hut (Pizza Hut), due {due.day} {due:%b}\n", message.body)
        self.assertIn("- Prep the Dough Co QBR (Dough Co)", message.body)
        self.assertIn("/work/mine", message.body)
        self.assertNotIn("/work/today", message.body)

    def test_it_never_names_what_the_reader_cannot_open(self):
        digest.send_due(self.at_nine)
        body = self.message_for("carl@acme.io").body
        self.assertNotIn("West handover", body)
        self.assertNotIn("Taco West", body)

    def test_nobody_with_nothing_to_report_gets_one(self):
        digest.send_due(self.at_nine)
        self.assertNotIn("gus@globex.io", self.sent_to())
        self.assertEqual(DigestSend.objects.get(user=self.lee).status, DigestSend.Status.EMPTY)

    def test_only_after_the_local_hour(self):
        result = digest.send_due(self.at_nine - timedelta(hours=2))
        self.assertEqual((result.sent, len(mail.outbox)), (0, 0))

    def test_the_hour_is_local(self):
        # 03:30 UTC is 09:00 in Kolkata.
        self.prefer(timezone="Asia/Kolkata")
        early = datetime.combine(self.today, time(3, 30), tzinfo=UTC)
        digest.send_due(early)
        self.assertIn("carl@acme.io", self.sent_to())

    def test_once_per_local_day(self):
        digest.send_due(self.at_nine)
        count = len(mail.outbox)
        again = digest.send_due(self.at_nine + timedelta(minutes=1))
        self.assertEqual((again.sent, len(mail.outbox)), (0, count))

    def test_not_on_a_non_working_day(self):
        self.prefer(working_days=[d for d in EVERY_DAY if d != self.today.weekday()])
        digest.send_due(self.at_nine)
        self.assertEqual(mail.outbox, [])

    def test_not_when_the_workspace_turned_it_off(self):
        self.prefer(digest_enabled=False)
        digest.send_due(self.at_nine)
        self.assertEqual(mail.outbox, [])

    def test_a_suspended_workspace_gets_no_digest(self):
        from services.accounts.models import Organisation

        Organisation.objects.filter(pk=self.org.pk).update(status=Organisation.Status.SUSPENDED)
        digest.send_due(self.at_nine)
        self.assertEqual(mail.outbox, [])
        self.assertFalse(DigestSend.objects.filter(user__organisation=self.org).exists())

    def test_not_to_someone_who_opted_out_or_left(self):
        User.objects.filter(pk=self.csm.pk).update(digest_opt_out=True)
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        digest.send_due(self.at_nine)
        self.assertNotIn("carl@acme.io", self.sent_to())
        self.assertNotIn("dana@acme.io", self.sent_to())

    def test_not_to_a_suspended_or_revoked_member(self):
        from services.identity.models import OrganizationMembership

        memberships = OrganizationMembership.objects.filter(organisation=self.org)
        memberships.filter(user=self.csm).update(status="suspended")
        memberships.filter(user=self.other).update(status="revoked")
        digest.send_due(self.at_nine)
        self.assertNotIn("carl@acme.io", self.sent_to())
        self.assertNotIn("dana@acme.io", self.sent_to())
        self.assertFalse(DigestSend.objects.filter(user__in=[self.csm, self.other]).exists())
        # An active member still gets theirs.
        self.assertTrue(DigestSend.objects.filter(user=self.lee).exists())

    def test_a_manager_hears_about_recommendations_waiting(self):
        from services.work.models import Recommendation

        Recommendation.objects.create(
            organisation=self.org,
            customer=self.pizza,
            kind="renewal_due",
            title="Prepare Pizza Hut's renewal",
            recipient=self.mona,
            suggested_assignee=self.csm,
        )
        digest.send_due(self.at_nine)
        message = self.message_for("mona@acme.io")
        self.assertIn("1 recommendation waiting", message.body)

    @override_settings(EMAIL_BACKEND=CONSOLE)
    def test_skipped_without_smtp_and_nothing_claimed(self):
        result = digest.send_due(self.at_nine)
        self.assertTrue(result.skipped)
        self.assertFalse(DigestSend.objects.filter(user__organisation=self.org).exists())

    def test_a_failed_send_is_marked_and_the_rest_carry_on(self):
        real = digest.send_work_digest

        def flaky(user, subject, body):
            if user.email == "carl@acme.io":
                raise OSError("smtp down")
            return real(user, subject, body)

        with patch.object(digest, "send_work_digest", side_effect=flaky):
            result = digest.send_due(self.at_nine)
        self.assertEqual(DigestSend.objects.get(user=self.csm).status, DigestSend.Status.FAILED)
        self.assertGreaterEqual(result.sent, 1)
        self.assertEqual(result.failed, 1)

    def test_deliver_pending_sends_digests(self):
        from io import StringIO

        from django.core.management import call_command

        with patch("django.utils.timezone.now", return_value=self.at_nine):
            call_command("deliver_pending", stdout=StringIO())
        self.assertIn("carl@acme.io", self.sent_to())


class PruneSentTests(TestCase):
    """`prune_sent`: DigestSend rows whose day is over 30 days back go."""

    def setUp(self):
        org = Organisation.objects.create(name="Prune Co")
        self.user = User.objects.create_user(
            email="pru@prune.io", password="supersecret1", name="Pru", organisation=org
        )
        self.now = timezone.make_aware(datetime(2026, 10, 9, 12, 0))
        self.today = timezone.localdate(self.now)

    def row(self, days_ago):
        return DigestSend.objects.create(
            user=self.user,
            local_date=self.today - timedelta(days=days_ago),
            status=DigestSend.Status.SENT,
        )

    def test_only_rows_more_than_30_days_back_go(self):
        self.assertEqual(digest.PRUNE_AFTER, timedelta(days=30))
        old, older = self.row(31), self.row(90)
        kept = [self.row(30), self.row(1), self.row(0)]
        self.assertEqual(digest.prune_sent(now=self.now), 2)
        self.assertFalse(DigestSend.objects.filter(pk__in=[old.pk, older.pk]).exists())
        self.assertEqual(DigestSend.objects.filter(pk__in=[r.pk for r in kept]).count(), 3)

    def test_dry_run_counts_and_keeps(self):
        self.row(31)
        self.assertEqual(digest.prune_sent(now=self.now, dry_run=True), 1)
        self.assertEqual(DigestSend.objects.count(), 1)
