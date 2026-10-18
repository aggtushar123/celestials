"""One Gmail mailbox's tick (contract §5): initialise from getProfile, the
12-month import a page at a time skipping what is held, history applied with
the last event per message winning, only recent imported mail classified at
once, labels mirrored, the watch renewed within a day of lapsing, and the
refreshed token stored."""

from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from services.customers.models import Email
from services.mail import gmail_store, gmail_sync, sync
from services.mail.models import MailboxConnection, MailLabel, MailMessage

from .gmail_fake import gmail_message
from .gmail_fixtures import CREDENTIALS, GmailFixture

DAY = timedelta(days=1)
TOPIC = "projects/revenact/topics/gmail"


class TickFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()

    def mailbox(self, **fields):
        return self.google(self.dana, **fields)

    def synced(self, **fields):
        """Past its import, at Gmail's current history."""
        return self.mailbox(
            history_id=self.fake.history_id,
            import_after=self.now - 365 * DAY,
            import_before=self.now,
            import_done_at=self.now,
            **fields,
        )

    def tick(self, connection, now=None):
        result = gmail_sync.tick(
            MailboxConnection.objects.get(pk=connection.pk), now=now or self.now
        )
        connection.refresh_from_db()
        return result

    def ago(self, days, gid, **kw):
        return gmail_message(gid, sent_at=self.now - days * DAY, **kw)

    def held(self, connection, gid, at=None):
        """Stored already, as an earlier tick would have (at `at`)."""
        gmail_store.store_gmail(connection, self.fake.messages[gid], now=at or self.now)

    def fetched(self, fmt="full"):
        return sorted(
            where.rsplit("/", 1)[-1]
            for _, where, query in self.fake.calls
            if "/messages/" in where and query.get("format") == fmt
        )


class InitialiseAndImportTests(TickFixture):
    def test_a_connection_without_history_starts_and_imports_its_window(self):
        for days, gid in ((1, "d1"), (40, "d40"), (200, "d200"), (400, "d400")):
            self.fake.add(self.ago(days, gid), quietly=True)
        self.fake.add(self.ago(3, "chat", labels=["CHAT"]), quietly=True)
        connection = self.mailbox()
        result = self.tick(connection)
        self.assertEqual(result.outcome, "ok")
        self.assertEqual(connection.history_id, self.fake.history_id)
        self.assertEqual(connection.import_total_estimate, 5)
        self.assertIsNotNone(connection.import_done_at)
        self.assertEqual(
            set(MailMessage.objects.values_list("provider_message_id", flat=True)),
            {"d1", "d40", "d200"},
        )
        self.assertEqual(MailLabel.objects.filter(connection=connection).count(), 12)
        self.assertIsNotNone(connection.last_synced_at)
        self.assertEqual((connection.consecutive_failures, connection.error), (0, ""))

    @override_settings(MAIL_IMPORT_PAGE_SIZE=2)
    def test_one_page_a_tick_and_what_is_held_is_not_fetched_again(self):
        for days, gid in ((1, "n1"), (2, "n2"), (3, "n3")):
            self.fake.add(self.ago(days, gid, sender="news@elsewhere.io"), quietly=True)
        connection = self.mailbox()
        self.held(connection, "n1")
        self.tick(connection)
        self.assertEqual((connection.import_page_token, connection.import_done_at), ("p2", None))
        self.tick(connection)
        self.assertEqual(connection.import_page_token, "")
        self.assertIsNotNone(connection.import_done_at)
        self.assertEqual(MailMessage.objects.count(), 3)
        self.assertEqual(self.fetched(), ["n2", "n3"])

    def test_only_recent_imported_mail_is_classified_at_once(self):
        self.fake.add(self.ago(5, "recent"), quietly=True)
        self.fake.add(self.ago(90, "old"), quietly=True)
        with patch("services.customers.classification.classify_records") as classify:
            result = self.tick(self.mailbox())
        self.assertEqual(result.filed, 2)
        self.assertEqual(Email.objects.count(), 2)
        classify.assert_called_once()
        self.assertEqual([e.provider_message_id for e in classify.call_args.args[0]], ["recent"])

    def test_an_expired_page_token_restarts_the_import(self):
        self.fake.add(self.ago(1, "i1", sender="x@elsewhere.io"), quietly=True)
        connection = self.mailbox(
            history_id=self.fake.history_id,
            import_after=self.now - 365 * DAY,
            import_before=self.now,
            import_page_token="stale",
        )
        self.tick(connection)
        self.assertEqual((connection.import_page_token, MailMessage.objects.count()), ("", 0))
        self.tick(connection)
        self.assertEqual(MailMessage.objects.count(), 1)
        self.assertIsNotNone(connection.import_done_at)


class HistoryTests(TickFixture):
    def test_adds_relabels_and_deletes_with_every_page_read(self):
        self.fake.add(self.ago(2, "keep"), quietly=True)
        self.fake.add(self.ago(2, "drop"), quietly=True)
        connection = self.synced()
        self.held(connection, "keep")
        self.held(connection, "drop")
        filed_drop = Email.objects.get(provider_message_id="drop")
        self.fake.add(self.ago(0, "new1"))
        self.fake.relabel("keep", [])
        self.fake.remove("drop")
        with patch("services.customers.classification.classify_records") as classify:
            result = self.tick(connection)
        self.assertEqual(result.filed, 1)
        self.assertEqual([e.provider_message_id for e in classify.call_args.args[0]], ["new1"])
        self.assertEqual(MailMessage.objects.get(provider_message_id="keep").state, "done")
        self.assertFalse(MailMessage.objects.filter(provider_message_id="drop").exists())
        # The filed copy is the company's record: a Gmail deletion never removes it.
        self.assertTrue(Email.objects.filter(pk=filed_drop.pk).exists())
        self.assertEqual(connection.history_id, self.fake.history_id)
        pages = [where for _, where, _ in self.fake.calls if where.endswith("/history")]
        self.assertEqual(len(pages), 2)

    def test_a_label_change_on_a_message_not_held_stores_it_whole(self):
        self.fake.add(self.ago(1, "u1"), quietly=True)
        connection = self.synced()
        self.fake.relabel("u1", ["INBOX", "STARRED"])
        self.tick(connection)
        self.assertTrue(MailMessage.objects.get(provider_message_id="u1").is_starred)

    def test_an_event_without_label_ids_reads_them_minimally(self):
        self.fake.add(self.ago(1, "k1"), quietly=True)
        connection = self.synced()
        self.held(connection, "k1")
        self.fake.messages["k1"]["labelIds"] = ["INBOX"]
        self.fake._record(
            labelsRemoved=[{"message": {"id": "k1", "threadId": "k1"}, "labelIds": ["UNREAD"]}]
        )
        self.tick(connection)
        self.assertTrue(MailMessage.objects.get(provider_message_id="k1").is_read)
        self.assertEqual(self.fetched("minimal"), ["k1"])

    def test_sync_mailbox_hands_a_google_mailbox_to_the_tick(self):
        connection = self.mailbox()
        self.assertEqual(sync.sync_mailbox(connection), 0)
        connection.refresh_from_db()
        self.assertEqual(connection.history_id, self.fake.history_id)


class WatchAndTokenTests(TickFixture):
    @override_settings(GMAIL_PUBSUB_TOPIC=TOPIC)
    def test_the_watch_is_renewed_only_when_it_lapses_within_a_day(self):
        connection = self.synced()
        self.tick(connection)
        self.assertEqual(self.fake.watched, [TOPIC])
        self.assertGreater(connection.watch_expires_at, self.now + 6 * DAY)
        self.tick(connection)
        self.assertEqual(len(self.fake.watched), 1)
        MailboxConnection.objects.filter(pk=connection.pk).update(
            watch_expires_at=self.now + timedelta(hours=2)
        )
        self.tick(connection)
        self.assertEqual(len(self.fake.watched), 2)

    @override_settings(GMAIL_PUBSUB_TOPIC=TOPIC)
    def test_a_failed_watch_is_never_a_mailbox_error(self):
        connection = self.synced()
        self.fake.fail(r"/watch$", 403, "forbidden")
        with self.assertLogs("services.mail.gmail_sync", "WARNING") as logs:
            result = self.tick(connection)
        # Named by connection id and status only: no mail content in logs.
        self.assertEqual(logs.output[0].rsplit(":", 1)[-1], " 403")
        self.assertIn(f"connection {connection.pk}", logs.output[0])
        self.assertEqual(
            (result.outcome, connection.watch_expires_at, connection.error), ("ok", None, "")
        )
        self.assertIsNotNone(connection.last_synced_at)

    @override_settings(GMAIL_PUBSUB_TOPIC="")
    def test_no_topic_no_watch(self):
        self.tick(self.synced())
        self.assertEqual(self.fake.watched, [])

    def test_a_refreshed_token_is_stored(self):
        connection = self.synced()
        connection.set_credentials({**CREDENTIALS, "expires_at": 0})
        connection.save(update_fields=["credentials"])
        self.tick(connection)
        self.assertTrue(connection.get_credentials()["access_token"].startswith("fake-access-"))
