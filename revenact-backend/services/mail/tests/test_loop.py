"""The mail loop (contract §5, decision 18): which mailboxes are due, a
claim that leases rather than holds a lock (a row locked elsewhere is
skipped, not waited on), Outlook and IMAP at their ten minutes with a
failed pass waiting the same, the gate sweep once a minute, one broken
mailbox never stopping the rest, and a clean stop."""

import io
import signal
import threading
import time
from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connections, transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.mail import loop
from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError

from .gmail_fixtures import GmailFixture, google_connection
from .test_mail import FakeProvider

CADENCE = dict(
    MAIL_SYNC_INTERVAL_SECONDS=60,
    MAIL_LEGACY_SYNC_INTERVAL_SECONDS=600,
    MAIL_LEASE_SECONDS=300,
    MAIL_SYNC_BATCH=10,
    MAIL_BACKOFF_MAX_SECONDS=900,
)
SECOND = timedelta(seconds=1)


@override_settings(**CADENCE)
class DueTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.now = timezone.now()

    def person(self, name):
        return User.objects.create_user(
            email=f"{name}@acme.io", password="x", name=name, organisation=self.org
        )

    def claimed(self, **kw):
        return {c.pk for c in loop.claim_due(now=self.now, **kw)}

    def test_a_google_mailbox_is_due_when_new_woken_or_a_minute_old(self):
        fresh = self.google(self.dana)
        self.google(self.carl, last_synced_at=self.now)
        woken = self.google(self.alice, last_synced_at=self.now, wake_at=self.now)
        stale = self.google(self.priya, last_synced_at=self.now - 61 * SECOND)
        self.assertEqual(self.claimed(), {fresh.pk, woken.pk, stale.pk})
        woken.refresh_from_db()
        self.assertIsNone(woken.wake_at)
        self.assertEqual(woken.lease_until, self.now + 300 * SECOND)
        # Leased: not claimed again until the lease runs out.
        self.assertEqual(self.claimed(), set())

    def test_paused_backing_off_leased_errored_or_disconnected_is_not_due(self):
        for name, fields in (
            ("paused", {"paused_reason": "no_seat"}),
            ("waiting", {"backoff_until": self.now + 60 * SECOND}),
            ("leased", {"lease_until": self.now + 60 * SECOND}),
            ("revoked", {"status": "error", "paused_reason": "token_revoked"}),
            ("gone", {"status": "disconnected"}),
        ):
            self.google(self.person(name), **fields)
        self.assertEqual(self.claimed(), set())

    def test_an_expired_lease_or_backoff_is_due_again(self):
        row = self.google(self.dana, lease_until=self.now - SECOND, backoff_until=self.now - SECOND)
        self.assertEqual(self.claimed(), {row.pk})

    def test_outlook_and_imap_keep_their_ten_minutes_errors_included(self):
        recent = self.connect(self.dana)
        MailboxConnection.objects.filter(pk=recent.pk).update(
            last_synced_at=self.now - 120 * SECOND
        )
        old = self.connect(self.carl)
        MailboxConnection.objects.filter(pk=old.pk).update(
            last_synced_at=self.now - 601 * SECOND, status="error"
        )
        never = self.connect(self.alice)
        self.assertEqual(self.claimed(), {old.pk, never.pk})

    def test_never_synced_first_then_oldest_and_at_most_a_batch(self):
        a = self.google(self.dana, last_synced_at=self.now - 300 * SECOND)
        b = self.google(self.carl)
        self.google(self.alice, last_synced_at=self.now - 100 * SECOND)
        self.assertEqual([c.pk for c in loop.claim_due(now=self.now, limit=2)], [b.pk, a.pk])


@override_settings(**CADENCE)
class SkipLockedTests(TransactionTestCase):
    def test_a_row_locked_elsewhere_is_skipped_not_waited_on(self):
        organisation = Organisation.objects.create(name="Lock Co")
        user = User.objects.create_user(
            email="l@lock.co", password="x", name="L", organisation=organisation
        )
        row = google_connection(user)
        locked, release = threading.Event(), threading.Event()

        def hold():
            try:
                with transaction.atomic():
                    MailboxConnection.objects.select_for_update().get(pk=row.pk)
                    locked.set()
                    release.wait(10)
            finally:
                connections.close_all()

        holder = threading.Thread(target=hold)
        holder.start()
        self.assertTrue(locked.wait(10))
        try:
            started = time.monotonic()
            self.assertEqual(loop.claim_due(), [])
            self.assertLess(time.monotonic() - started, 5)
        finally:
            release.set()
            holder.join()
        self.assertEqual([c.pk for c in loop.claim_due()], [row.pk])


@override_settings(**CADENCE)
class RunTests(GmailFixture):
    def test_a_failed_imap_pass_waits_the_legacy_interval(self):
        connection = self.connect(self.dana)

        class Broken(FakeProvider):
            def fetch_messages(self, creds, cursor):
                raise ProviderError("imap.acme.io did not answer")

        now = timezone.now()
        with patch("services.mail.sync.get_provider", return_value=Broken()):
            loop.sync_one(connection, now=now)
        connection.refresh_from_db()
        self.assertEqual((connection.status, connection.lease_until), ("error", None))
        self.assertEqual(connection.backoff_until, now + 600 * SECOND)
        self.assertEqual(loop.claim_due(now=now + 599 * SECOND), [])
        self.assertEqual(len(loop.claim_due(now=now + 601 * SECOND)), 1)

    def test_a_legacy_pass_never_overwrites_a_concurrent_write(self):
        connection = self.connect(self.dana)
        woken = timezone.now()

        class Meanwhile(FakeProvider):
            def fetch_messages(self, creds, cursor):
                MailboxConnection.objects.filter(pk=connection.pk).update(wake_at=woken)
                return super().fetch_messages(creds, cursor)

        with patch("services.mail.sync.get_provider", return_value=Meanwhile()):
            loop.sync_one(connection)
        connection.refresh_from_db()
        self.assertEqual((connection.status, connection.wake_at), ("connected", woken))
        self.assertIsNotNone(connection.last_synced_at)

    def test_the_sweep_runs_once_a_minute_and_a_paused_mailbox_is_never_claimed(self):
        fake = self.use_gmail()
        connection = self.google(self.dana)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        runner = loop.Loop()
        self.assertEqual(runner.run_once(), 0)
        connection.refresh_from_db()
        self.assertEqual(connection.paused_reason, "workspace_off")
        self.assertEqual(fake.calls, [])
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        self.assertEqual(runner.run_once(), 0)
        self.assertEqual(runner.run_once(now=timezone.now() + 61 * SECOND), 1)
        connection.refresh_from_db()
        self.assertEqual(connection.paused_reason, "")
        self.assertIsNotNone(connection.last_synced_at)

    def test_one_broken_mailbox_never_stops_the_rest(self):
        self.use_gmail()
        broken = self.google(self.dana)
        MailboxConnection.objects.filter(pk=broken.pk).update(credentials="not-a-fernet-token")
        fine = self.connect(self.carl)
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            self.assertEqual(loop.Loop().run_once(), 2)
        broken.refresh_from_db()
        self.assertIsNone(broken.lease_until)
        self.assertIsNotNone(broken.backoff_until)
        fine.refresh_from_db()
        self.assertIsNotNone(fine.last_synced_at)

    def test_a_stop_between_mailboxes_releases_the_rest(self):
        self.connect(self.dana)
        self.connect(self.carl)
        runner = loop.Loop()

        def stop_after_this(connection, **kw):
            runner.stop(signal.SIGTERM, None)
            return 0

        with patch("services.mail.loop.sync_one", side_effect=stop_after_this):
            self.assertEqual(runner.run_once(), 1)
        self.assertEqual(MailboxConnection.objects.filter(lease_until__isnull=False).count(), 1)

    def test_forever_stops_on_sigterm(self):
        runner = loop.Loop()
        with (
            patch.object(
                loop.Loop, "run_once", side_effect=lambda: runner.stop(signal.SIGTERM, None)
            ) as tick,
            patch("services.mail.loop.signal.signal"),
            # Inside the test's transaction it would close the test's connection.
            patch("services.mail.loop.close_old_connections"),
        ):
            runner.forever()
        tick.assert_called_once()


@override_settings(**CADENCE)
class CommandTests(GmailFixture):
    def test_one_pass_syncs_every_live_mailbox_and_skips_paused_ones(self):
        self.use_gmail()
        dana = self.google(self.dana)
        carl = self.google(self.carl, status="error", paused_reason="token_revoked")
        self.connect(self.priya)
        out, err = io.StringIO(), io.StringIO()
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            call_command("sync_mail", stdout=out, stderr=err)
        self.assertIn("synced 2 mailbox(es)", out.getvalue())
        self.assertIn("1 need attention", out.getvalue())
        dana.refresh_from_db()
        carl.refresh_from_db()
        self.assertIsNotNone(dana.history_id)
        self.assertIsNone(carl.history_id)

    def test_a_mailbox_paused_after_the_listing_is_not_leased_or_synced(self):
        rows = {self.google(self.dana).pk, self.google(self.carl).pk}
        synced = []

        def revoke_the_other(connection, **kw):
            synced.append(connection.pk)
            MailboxConnection.objects.filter(pk__in=rows - {connection.pk}).update(
                status="error", paused_reason="token_revoked"
            )
            return 0

        with patch("services.mail.loop.sync_one", side_effect=revoke_the_other):
            self.assertEqual(loop.run_all(), (1, 0))
        self.assertEqual(len(synced), 1)
        other = MailboxConnection.objects.get(pk__in=rows - set(synced))
        self.assertEqual((other.paused_reason, other.lease_until), ("token_revoked", None))

    def test_loop_and_user_do_not_mix(self):
        with self.assertRaises(CommandError):
            call_command("sync_mail", "--loop", "--user", "dana@acme.io")

    def test_loop_runs_the_loop(self):
        with patch("services.mail.management.commands.sync_mail.Loop") as runner:
            call_command("sync_mail", "--loop", stdout=io.StringIO())
        runner.return_value.forever.assert_called_once()
