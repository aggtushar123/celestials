"""The flush (contract §1, "The flush"): step 1 of every Google tick. Label
changes go grouped by (add, remove) in batchModify calls of at most
MAIL_OUTBOX_BATCH_SIZE ids; a batch Gmail refuses with 400 or 404 is retried
one message at a time; trash and untrash are single calls, capped per tick;
a crashed tick's rows recover uncounted; a lost claim stops before Gmail.
The outcome classes: 404 fails at once, 5xx counts and backs off, another
refusal counts, a rate limit or a lost grant counts nothing."""

from datetime import timedelta

from django.db import connection, transaction
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.mail import gmail_store, gmail_sync, outbox
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


class FlushFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        for gmail_id in ("g1", "g2", "g3"):
            self.fake.add(gmail_message(gmail_id), quietly=True)
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.rows = {
            gmail_id: gmail_store.store_gmail(
                self.mailbox, self.fake.messages[gmail_id], now=self.now
            )[0]
            for gmail_id in ("g1", "g2", "g3")
        }

    def act(self, op, *gmail_ids, label=None):
        messages = [self.rows[gmail_id] for gmail_id in gmail_ids]
        pairs = [(m, change) for m in messages for change in outbox.changes_for(op, label)]
        with transaction.atomic():
            outbox.apply(self.mailbox, pairs, now=self.now)

    def tick(self, now=None, **fields):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        for name, value in fields.items():
            setattr(connection, name, value)
        result = gmail_sync.tick(connection, now=now or self.now)
        self.mailbox.refresh_from_db()
        return result

    def writes(self, route):
        return [body for where, body in self.fake.writes if where.endswith(route)]

    def statuses(self):
        return sorted(MailOutbox.objects.values_list("label_key", "status", "attempts"))


class BatchTests(FlushFixture):
    def test_one_batch_modify_per_change_set(self):
        self.act("archive", "g1", "g2")
        self.act("star", "g3")
        self.tick()
        self.assertEqual(
            self.writes("/batchModify"),
            [
                {"ids": ["g1", "g2"], "addLabelIds": [], "removeLabelIds": ["INBOX"]},
                {"ids": ["g3"], "addLabelIds": ["STARRED"], "removeLabelIds": []},
            ],
        )
        self.assertEqual(set(MailOutbox.objects.values_list("status", flat=True)), {"sent"})
        self.assertEqual(MailOutbox.objects.filter(sent_at=self.now).count(), 3)
        self.assertNotIn("INBOX", self.fake.messages["g1"]["labelIds"])

    def test_a_message_with_two_changes_goes_as_one_set(self):
        self.act("spam", "g1")
        self.tick()
        self.assertEqual(
            self.writes("/batchModify"),
            [{"ids": ["g1"], "addLabelIds": ["SPAM"], "removeLabelIds": ["INBOX"]}],
        )

    @override_settings(MAIL_OUTBOX_BATCH_SIZE=2)
    def test_a_batch_holds_at_most_the_batch_size(self):
        self.act("read", "g1", "g2", "g3")
        self.tick()
        self.assertEqual([len(body["ids"]) for body in self.writes("/batchModify")], [2, 1])

    def test_the_flush_runs_before_the_label_mirror_and_history(self):
        self.act("read", "g1")
        self.tick()
        paths = [where for _, where, _ in self.fake.calls]
        first_batch = next(i for i, p in enumerate(paths) if p.endswith("/batchModify"))
        first_labels = next(i for i, p in enumerate(paths) if p.endswith("/labels"))
        self.assertLess(first_batch, first_labels)

    def test_nothing_due_calls_nothing(self):
        self.act("read", "g1")
        MailOutbox.objects.update(next_attempt_at=self.now + timedelta(minutes=1))
        self.tick()
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])

    def test_a_label_row_waits_for_its_label(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.act("label_add", "g1", label=made)
        self.tick()
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(self.statuses(), [(f"pending:{made.pk}", "pending", 0)])


class SingleCallTests(FlushFixture):
    def test_a_batch_gmail_refuses_is_retried_one_message_at_a_time(self):
        self.act("archive", "g1", "g2")
        del self.fake.messages["g2"]  # gone from Gmail; history has not said so yet
        self.tick()
        self.assertEqual(len(self.writes("/batchModify")), 1)
        self.assertEqual(len(self.writes("/modify")), 2)
        g1, g2 = (MailOutbox.objects.get(message=self.rows[g]) for g in ("g1", "g2"))
        self.assertEqual((g1.status, g2.status, g2.reason), ("sent", "failed", "not_found"))
        self.assertEqual(g2.failed_at, self.now)

    @override_settings(MAIL_OUTBOX_SINGLE_CALLS_PER_TICK=1)
    def test_trash_is_one_call_a_message_and_capped(self):
        self.act("trash", "g1", "g2")
        self.tick()
        self.assertEqual(len(self.writes("/trash")), 1)
        self.assertEqual(
            sorted(MailOutbox.objects.values_list("status", "attempts")),
            [("pending", 0), ("sent", 0)],
        )
        self.tick()
        self.assertEqual(len(self.writes("/trash")), 2)

    def test_untrash(self):
        self.act("trash", "g1")
        self.tick()
        self.act("untrash", "g1")
        self.tick()
        self.assertEqual(len(self.writes("/untrash")), 1)
        self.assertNotIn("TRASH", self.fake.messages["g1"]["labelIds"])


class LeaseTests(FlushFixture):
    def test_a_crashed_ticks_rows_return_uncounted_and_go(self):
        self.act("read", "g1")
        MailOutbox.objects.update(status="sending", updated_at=self.now - timedelta(minutes=10))
        self.tick()
        self.assertEqual(self.statuses(), [("UNREAD", "sent", 0)])

    def test_a_recent_sending_row_is_left_to_its_tick(self):
        self.act("read", "g1")
        MailOutbox.objects.update(status="sending", updated_at=self.now)
        self.tick()
        self.assertEqual(self.statuses(), [("UNREAD", "sending", 0)])

    def test_a_recovered_row_hands_its_previous_to_a_newer_pending_row(self):
        self.act("read", "g1")
        old = MailOutbox.objects.get()
        MailOutbox.objects.update(status="sending", updated_at=self.now - timedelta(minutes=10))
        self.act("unread", "g1")  # queued beside the sending row (decision 4)
        newer = MailOutbox.objects.get(status="pending")
        from services.mail import outbox_flush

        with CaptureQueriesContext(connection) as queries:
            outbox_flush.Flush(self.mailbox, None, self.now).recover()
        self.assertEqual(list(MailOutbox.objects.values_list("pk", flat=True)), [newer.pk])
        newer.refresh_from_db()
        self.assertEqual((newer.status, newer.previous), ("pending", old.previous))
        # Ruling F2: the messages are locked first, as a request locks them (gap 8).
        locks = [q["sql"] for q in queries if "FOR UPDATE" in q["sql"]]
        self.assertTrue(locks)
        self.assertIn(MailMessage._meta.db_table, locks[0])

    def test_a_lost_claim_stops_before_gmail_and_lets_the_rows_go(self):
        self.act("read", "g1")
        result = self.tick(lease_until=self.now + timedelta(minutes=5))  # not the row's stamp
        self.assertEqual(result.outcome, "lost")
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])


class OutcomeTests(FlushFixture):
    def test_a_5xx_counts_waits_30_seconds_and_backs_the_mailbox_off(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 503)
        result = self.tick()
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.attempts), ("pending", 1))
        self.assertEqual(row.next_attempt_at, self.now + timedelta(seconds=30))
        self.assertEqual(result.outcome, "backoff")
        self.assertIsNotNone(self.mailbox.backoff_until)

    def test_the_waits_and_the_fifth_failure(self):
        self.act("read", "g1")
        at = self.now
        for wait in (30, 120, 600, 3600):
            self.fake.fail("batchModify", 503)
            self.tick(now=at)
            row = MailOutbox.objects.get()
            self.assertEqual(row.next_attempt_at, at + timedelta(seconds=wait))
            at = row.next_attempt_at
        self.fake.fail("batchModify", 503)
        self.tick(now=at)
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.reason, row.attempts), ("failed", "exhausted", 5))

    def test_a_rate_limit_counts_nothing(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 429, retry_after=120)
        result = self.tick()
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])
        self.assertEqual(result.outcome, "backoff")
        self.assertGreaterEqual(self.mailbox.backoff_until, self.now + timedelta(seconds=120))

    def test_a_lost_permission_pauses_and_keeps_the_rows(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 403, "insufficientPermissions")
        self.assertEqual(self.tick().outcome, "revoked")
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])
        self.assertEqual(self.mailbox.paused_reason, "token_revoked")

    def test_another_refusal_counts_without_a_backoff(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 403, "domainPolicy")
        self.assertEqual(self.tick().outcome, "ok")
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 1)])
        self.assertIsNone(self.mailbox.backoff_until)

    def test_an_unknown_label_fails_as_gone(self):
        self.act("label_add", "g1", label=MailLabel.objects.get(gmail_id="Label_12"))
        self.fake.labels = [label for label in self.fake.labels if label["id"] != "Label_12"]
        self.tick()
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.reason), ("failed", "label_gone"))

    def test_a_label_deleted_here_fails_without_a_call(self):
        renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.act("label_add", "g1", label=renewals)
        renewals.delete()
        self.fake.labels = [label for label in self.fake.labels if label["id"] != "Label_12"]
        self.tick()
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(MailOutbox.objects.get().reason, "label_gone")
