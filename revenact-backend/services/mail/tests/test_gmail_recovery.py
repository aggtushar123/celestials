"""When Gmail no longer has the history (contract decision 19) the fresh
history_id is taken first, then the last 30 days are re-listed a page a
tick, and what the re-list did not see is deleted. Errors (decisions 20,
21): rate limits, 5xx and network back off this mailbox only; a lost grant
or a missing permission pauses it until the person reconnects."""

import json
import re
from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Email
from services.mail import gmail_sync, loop
from services.mail.models import MailboxConnection, MailMessage
from services.mail.providers.base import Credentials, ProviderError
from services.mail.views import _disconnect_google, _save_google

from .gmail_fixtures import CREDENTIALS, GRANTED, GmailFixture
from .test_gmail_sync import TickFixture


class RecoveryTests(TickFixture):
    @override_settings(MAIL_IMPORT_PAGE_SIZE=2)
    def test_a_404_takes_a_fresh_history_id_first_then_relists_30_days(self):
        for days, gid in ((2, "k2"), (3, "k_old"), (4, "gone"), (40, "o40")):
            self.fake.add(self.ago(days, gid), quietly=True)
        connection = self.synced()
        for gid in ("k2", "k_old", "gone", "o40"):
            self.held(connection, gid)
        filed_gone = Email.objects.get(provider_message_id="gone")
        # A week with the VM off: new mail, a star, a deletion, and Gmail forgets.
        self.fake.add(self.ago(1, "new1"))
        self.fake.relabel("k_old", ["INBOX", "STARRED"])
        del self.fake.messages["gone"]
        self.fake.forget_history()

        first = timezone.now()
        self.assertEqual(self.tick(connection, now=first).outcome, "ok")
        self.assertEqual(connection.history_id, self.fake.history_id)
        self.assertEqual(
            (connection.reconcile_started_at, connection.reconcile_page_token), (first, "p2")
        )
        order = [where.rsplit("/", 1)[-1] for _, where, _ in self.fake.calls]
        self.assertLess(order.index("profile"), order.index("messages"))
        self.assertTrue(MailMessage.objects.filter(provider_message_id="new1").exists())
        # Sent from Revenact after the reconcile began: never mistaken for a deletion.
        MailMessage.objects.create(
            connection=connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="sent:abc",
            direction="sent",
            folder="sent",
            subject="Re: Renewal",
            sent_at=timezone.now(),
        )

        self.tick(connection, now=timezone.now())
        self.assertIsNone(connection.reconcile_started_at)
        self.assertEqual(connection.reconcile_page_token, "")
        self.assertTrue(MailMessage.objects.get(provider_message_id="k_old").is_starred)
        held = set(MailMessage.objects.values_list("provider_message_id", flat=True))
        self.assertEqual(held, {"new1", "k2", "k_old", "o40", "sent:abc"})
        self.assertTrue(Email.objects.filter(pk=filed_gone.pk).exists())


class ErrorTests(TickFixture):
    def test_the_delay_doubles_to_its_ceiling_or_follows_retry_after(self):
        self.assertEqual(
            [gmail_sync.backoff_seconds(n) for n in (1, 2, 3, 6, 7, 40)],
            [30, 60, 120, 900, 900, 900],
        )
        self.assertEqual(gmail_sync.backoff_seconds(1, retry_after=300), 300)
        self.assertEqual(gmail_sync.backoff_seconds(5, retry_after=10), 480)

    def test_a_rate_limit_backs_off_this_mailbox_and_keeps_it_connected(self):
        connection = self.synced()
        self.fake.fail(r"/labels$", 429, retry_after=120)
        result = self.tick(connection)
        self.assertEqual(result.outcome, "backoff")
        self.assertEqual(
            (connection.status, connection.consecutive_failures, connection.paused_reason),
            ("connected", 1, ""),
        )
        self.assertEqual(connection.backoff_until, self.now + timedelta(seconds=120))
        self.assertTrue(
            connection.error.startswith("Gmail is rate-limiting this mailbox; retrying at ")
        )
        self.assertIsNone(connection.lease_until)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.paused").exists())

    def test_5xx_network_and_quota_403s_back_off(self):
        connection = self.synced()
        for status, reason in (
            (503, ""),
            (None, ""),
            (403, "userRateLimitExceeded"),
            (403, "rateLimitExceeded"),
            (403, "domainPolicy"),
        ):
            with self.subTest(status=status, reason=reason):
                MailboxConnection.objects.filter(pk=connection.pk).update(consecutive_failures=0)
                self.fake.fail(r"/labels$", status, reason)
                self.assertEqual(self.tick(connection).outcome, "backoff")
                self.assertEqual(
                    (connection.status, connection.consecutive_failures), ("connected", 1)
                )
        # The next success clears the transient state.
        self.tick(connection)
        self.assertEqual(
            (connection.consecutive_failures, connection.error, connection.backoff_until),
            (0, "", None),
        )

    def test_a_timeout_or_a_broken_answer_backs_off_and_never_raises(self):
        """http_json wraps only HTTP and URL errors; the rest of a broken
        exchange must still back off (decision 20), for a Gmail call and for
        the token refresh."""
        connection = self.synced()
        broken = (TimeoutError("read timed out"), json.JSONDecodeError("Expecting value", "<", 0))
        for path in (r"/labels$", r"/token$"):
            for error in broken:
                with self.subTest(path=path, error=type(error).__name__):
                    MailboxConnection.objects.filter(pk=connection.pk).update(
                        consecutive_failures=0,
                        backoff_until=None,
                        lease_until=self.now + timedelta(minutes=5),
                    )
                    if path == r"/token$":
                        connection.set_credentials({**CREDENTIALS, "expires_at": 0})
                        connection.save(update_fields=["credentials"])

                    def failing(method, url, *args, error=error, path=path, **kwargs):
                        if re.search(path, url):
                            raise error
                        return self.fake(method, url, *args, **kwargs)

                    with patch("services.mail.providers.google.http_json", failing):
                        self.assertEqual(self.tick(connection).outcome, "backoff")
                    self.assertEqual(
                        (connection.status, connection.consecutive_failures),
                        ("connected", 1),
                    )
                    self.assertEqual(connection.backoff_until, self.now + timedelta(seconds=30))
                    self.assertIsNone(connection.lease_until)
                    self.assertTrue(connection.error.startswith("Gmail isn't answering"))

    def test_a_lost_grant_pauses_the_mailbox_until_a_reconnect(self):
        connection = self.synced()
        connection.set_credentials({**CREDENTIALS, "expires_at": 0})
        connection.save(update_fields=["credentials"])
        self.fake.refresh_reason = "invalid_grant"
        self.assertEqual(self.tick(connection).outcome, "revoked")
        self.assertEqual(
            (connection.status, connection.paused_reason, connection.error),
            ("error", "token_revoked", "Google access was revoked. Reconnect Google."),
        )
        event = AuditEvent.objects.get(action="mailbox.paused")
        self.assertEqual((event.actor, event.metadata), (None, {"reason": "token_revoked"}))

    def test_one_401_is_retried_and_a_second_is_a_lost_grant(self):
        connection = self.synced()
        self.fake.fail(r"/labels$", 401)
        self.assertEqual(self.tick(connection).outcome, "ok")
        self.fake.fail(r"/labels$", 401, times=2)
        self.assertEqual(self.tick(connection).outcome, "revoked")

    def test_a_missing_permission_asks_for_a_reconnect(self):
        connection = self.synced()
        self.fake.fail(r"/history$", 403, "insufficientPermissions")
        self.assertEqual(self.tick(connection).outcome, "revoked")
        self.assertEqual(
            (connection.status, connection.paused_reason, connection.error),
            ("error", "token_revoked", "Revenact is missing a Gmail permission. Reconnect Google."),
        )

    def test_a_message_gone_between_list_and_get_is_skipped(self):
        self.fake.add(self.ago(1, "g1"), quietly=True)
        self.fake.add(self.ago(2, "g2"), quietly=True)
        connection = self.mailbox()
        self.fake.fail(r"/messages/g1$", 404, "notFound")
        self.assertEqual(self.tick(connection).outcome, "ok")
        self.assertEqual(
            list(MailMessage.objects.values_list("provider_message_id", flat=True)), ["g2"]
        )


class SendFailureTests(GmailFixture):
    """A refused send (decisions 20, 21, 23): a Google mailbox that lost its
    grant or a permission is paused with the fixed sentence, never left in
    error with the provider's words; a rate limit leaves it as it was.
    Outlook and IMAP behave as before D1."""

    REVOKED = ProviderError("401 from gmail.googleapis.com: ", reauth=True, status=401)
    PERMISSION = ProviderError(
        "403 from gmail.googleapis.com: insufficientPermissions",
        reauth=True,
        status=403,
        reason="insufficientPermissions",
    )
    LIMITED = ProviderError(
        "429 from gmail.googleapis.com: ", status=429, reason="", retry_after=60
    )

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.dana)

    def refusing(self, exc):
        class Refusing:
            def send(self, creds, **kwargs):
                raise exc

        return patch("services.mail.sync.get_provider", return_value=Refusing())

    def compose(self):
        return self.client.post(
            f"/api/v1/customers/{self.pizza.id}/emails/send/",
            {"to": ["sam@pizzahut.com"], "subject": "Hi", "body": "x"},
            format="json",
        )

    def draft_send(self, connection):
        from services.agents.tests.drafts_fixtures import draft

        source = self.email(
            self.dana,
            from_address="sam@pizzahut.com",
            mailbox=connection,
            provider_message_id="<m1@pizzahut.com>",
        )
        mine = draft(source, self.dana)
        return self.client.post(f"/api/v1/communications/drafts/{mine.pk}/send/", {}, format="json")

    def sends(self):
        return (("compose", lambda c: self.compose()), ("draft", self.draft_send))

    def assertPausedRevoked(self, connection, sentence):
        connection.refresh_from_db()
        self.assertEqual(
            (connection.status, connection.paused_reason, connection.error),
            ("error", "token_revoked", sentence),
        )
        event = AuditEvent.objects.filter(action="mailbox.paused").latest("pk")
        self.assertEqual((event.actor, event.metadata), (None, {"reason": "token_revoked"}))

    def test_a_lost_grant_or_permission_on_send_pauses_the_google_mailbox(self):
        for name, send in self.sends():
            for exc, sentence in (
                (self.REVOKED, gmail_sync.REVOKED_MESSAGE),
                (self.PERMISSION, gmail_sync.PERMISSION_MESSAGE),
            ):
                with self.subTest(send=name, status=exc.status):
                    MailboxConnection.objects.filter(user=self.dana).delete()
                    connection = self.google(self.dana)
                    with self.refusing(exc):
                        response = send(connection)
                    self.assertEqual(response.status_code, 502)
                    self.assertPausedRevoked(connection, sentence)

    def test_a_rate_limited_send_leaves_the_google_mailbox_as_it_was(self):
        # A domain policy's 403 is reauth to http_json, but backs off (gap 12).
        policy = ProviderError(
            "403 from gmail.googleapis.com: domainPolicy",
            reauth=True,
            status=403,
            reason="domainPolicy",
        )
        for name, send in self.sends():
            for exc in (self.LIMITED, policy):
                with self.subTest(send=name, status=exc.status, reason=exc.reason):
                    MailboxConnection.objects.filter(user=self.dana).delete()
                    connection = self.google(self.dana)
                    with self.refusing(exc):
                        self.assertEqual(send(connection).status_code, 502)
                    connection.refresh_from_db()
                    self.assertEqual(
                        (connection.status, connection.paused_reason, connection.error),
                        ("connected", "", ""),
                    )
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.paused").exists())

    def test_outlook_send_failures_are_unchanged(self):
        for name, send in self.sends():
            with self.subTest(send=name):
                MailboxConnection.objects.filter(user=self.dana).delete()
                connection = MailboxConnection.objects.create(
                    organisation=self.org,
                    user=self.dana,
                    provider=MailboxConnection.Provider.MICROSOFT,
                    address="dana@acme.io",
                    credentials="",
                )
                connection.set_credentials({})
                connection.save(update_fields=["credentials"])
                exc = ProviderError("Microsoft refused the token", reauth=True, status=401)
                with self.refusing(exc):
                    self.assertEqual(send(connection).status_code, 502)
                connection.refresh_from_db()
                self.assertEqual(
                    (connection.status, connection.paused_reason, connection.error),
                    ("error", "", "Microsoft refused the token"),
                )
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.paused").exists())


@override_settings(MAIL_LEASE_SECONDS=300, MAIL_SYNC_BATCH=10)
class StaleTickTests(TickFixture):
    """A tick holds a claim (its lease_until stamp). A disconnect or a
    reconnect while it runs clears that claim, and the tick then writes
    nothing more to the row: no status, no credentials, no sync state."""

    NEW = {"access_token": "new-access", "refresh_token": "new-refresh", "expires_at": 9e12}

    def claimed(self, **fields):
        connection = self.synced(**fields)
        (claimed,) = loop.claim_due(now=self.now)
        self.assertEqual(claimed.pk, connection.pk)
        self.assertIsNotNone(claimed.lease_until)
        return claimed

    def disconnect(self, connection):
        _disconnect_google(None, MailboxConnection.objects.get(pk=connection.pk))

    def reconnect(self, connection):
        _save_google(
            None,
            self.dana,
            Credentials(address=connection.address, data=dict(self.NEW), scopes=list(GRANTED)),
            {"historyId": str(self.fake.history_id + 50), "messagesTotal": 9},
        )

    def assert_disconnected(self, connection):
        connection.refresh_from_db()
        self.assertEqual(
            (connection.status, connection.credentials, connection.paused_reason),
            ("disconnected", "", ""),
        )
        self.assertEqual((connection.error, connection.history_id), ("", None))
        self.assertIsNone(connection.lease_until)
        self.assertIsNone(connection.backoff_until)
        self.assertIsNone(connection.watch_expires_at)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.paused").exists())

    def test_a_lost_grant_after_a_disconnect_leaves_the_row_disconnected(self):
        stale = self.claimed()
        stale.set_credentials({**CREDENTIALS, "expires_at": 0})
        self.disconnect(stale)
        self.fake.refresh_reason = "invalid_grant"
        gmail_sync.tick(stale, now=self.now)
        self.assert_disconnected(stale)

    def test_a_backoff_after_a_disconnect_leaves_the_row_disconnected(self):
        stale = self.claimed()
        self.disconnect(stale)
        self.fake.fail(r"/labels$", 503)
        gmail_sync.tick(stale, now=self.now)
        self.assert_disconnected(stale)
        self.assertEqual(MailboxConnection.objects.get(pk=stale.pk).consecutive_failures, 0)

    def test_a_tick_that_succeeds_after_a_disconnect_leaves_it_disconnected(self):
        self.fake.add(self.ago(1, "fresh"))
        stale = self.claimed()
        self.disconnect(stale)
        gmail_sync.tick(stale, now=self.now)
        self.assert_disconnected(stale)
        self.assertIsNone(MailboxConnection.objects.get(pk=stale.pk).last_synced_at)

    @override_settings(GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail")
    def test_a_disconnect_at_the_end_of_a_tick_wins_over_its_success(self):
        stale = self.claimed()
        with patch.object(gmail_sync, "_renew_watch", lambda *a: self.disconnect(stale)):
            gmail_sync.tick(stale, now=self.now)
        self.assert_disconnected(stale)
        self.assertIsNone(MailboxConnection.objects.get(pk=stale.pk).last_synced_at)

    def test_a_reconnect_at_the_end_of_a_tick_keeps_the_new_grant(self):
        stale = self.claimed()
        with patch.object(gmail_sync, "_renew_watch", lambda *a: self.reconnect(stale)):
            gmail_sync.tick(stale, now=self.now)
        row = MailboxConnection.objects.get(pk=stale.pk)
        self.assertEqual(row.get_credentials(), self.NEW)
        self.assertEqual((row.status, row.history_id), ("connected", self.fake.history_id + 50))
        self.assertIsNone(row.last_synced_at)

    def test_a_tick_claimed_before_a_reconnect_writes_nothing_after_it(self):
        self.fake.add(self.ago(1, "fresh"))
        stale = self.claimed()
        self.reconnect(stale)
        gmail_sync.tick(stale, now=self.now)
        row = MailboxConnection.objects.get(pk=stale.pk)
        self.assertEqual(row.get_credentials(), self.NEW)
        self.assertEqual(row.history_id, self.fake.history_id + 50)
        self.assertEqual((row.import_total_estimate, row.import_page_token), (9, ""))
        self.assertIsNone(row.import_done_at)
        self.assertIsNone(row.last_synced_at)

    def test_a_lost_grant_after_a_reconnect_does_not_pause_the_new_grant(self):
        stale = self.claimed()
        stale.set_credentials({**CREDENTIALS, "expires_at": 0})
        self.reconnect(stale)
        self.fake.refresh_reason = "invalid_grant"
        gmail_sync.tick(stale, now=self.now)
        row = MailboxConnection.objects.get(pk=stale.pk)
        self.assertEqual((row.status, row.paused_reason, row.error), ("connected", "", ""))
        self.assertEqual(row.get_credentials(), self.NEW)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.paused").exists())

    def test_a_send_refused_after_a_disconnect_does_not_pause_it(self):
        connection = self.synced()
        self.disconnect(connection)
        gmail_sync.pause_revoked(
            MailboxConnection.objects.get(pk=connection.pk),
            ProviderError("revoked", reauth=True, status=401),
        )
        self.assert_disconnected(connection)

    def test_a_broken_tick_after_a_disconnect_is_not_backed_off(self):
        stale = self.claimed()
        self.disconnect(stale)
        with (
            patch.object(gmail_sync, "tick", side_effect=RuntimeError("boom")),
            self.assertLogs("services.mail.loop", "ERROR"),
        ):
            loop._safely(stale)
        self.assert_disconnected(stale)
