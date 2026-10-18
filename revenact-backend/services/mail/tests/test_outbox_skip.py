"""Decision 3: while a change is pending or sending, Gmail's reports for that
label on that message are skipped and land in the row's `previous`; every
other label is taken from Gmail; once the row is sent, Gmail is the truth.
Through history, the reconcile and a store of a held id. A label made here
keeps its pending key."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.mail import gmail_store, gmail_sync, outbox
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import gmail_message
from .gmail_fixtures import GmailFixture

LATER = timedelta(hours=1)


class SkipFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.fake.add(gmail_message("g1"), quietly=True)
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )
        self.row, _ = gmail_store.store_gmail(self.mailbox, self.fake.messages["g1"], now=self.now)

    def act(self, op, label=None):
        pairs = [(self.row, change) for change in outbox.changes_for(op, label)]
        with transaction.atomic():
            outbox.apply(self.mailbox, pairs, now=self.now)
        # Not due yet: the flush must leave it for this test.
        MailOutbox.objects.update(next_attempt_at=self.now + LATER)

    def tick(self):
        gmail_sync.tick(MailboxConnection.objects.get(pk=self.mailbox.pk), now=self.now)
        self.row.refresh_from_db()


class HeldTests(SkipFixture):
    def test_held_keys_are_the_pending_and_sending_rows(self):
        self.act("archive")
        self.act("star")
        MailOutbox.objects.filter(label_key="STARRED").update(status="sending")
        self.assertEqual(gmail_store.held_keys([self.row.pk])[self.row.pk], {"INBOX", "STARRED"})
        MailOutbox.objects.update(status="sent")
        self.assertEqual(gmail_store.held_keys([self.row.pk]), {})

    def test_history_keeps_a_pending_label_and_takes_the_rest(self):
        self.act("archive")
        self.fake.relabel("g1", ["INBOX", "UNREAD", "STARRED"])
        self.tick()
        self.assertNotIn("INBOX", self.row.label_ids)
        self.assertEqual(
            (self.row.state, self.row.is_starred, self.row.is_read), ("done", True, False)
        )
        self.assertEqual(MailOutbox.objects.get().previous, {"present": True})

    def test_gmails_value_becomes_the_rows_previous(self):
        self.act("read")
        self.fake.relabel("g1", ["INBOX"])  # read in Gmail too
        self.tick()
        self.assertTrue(self.row.is_read)
        self.assertEqual(MailOutbox.objects.get().previous, {"present": False})

    def test_once_sent_gmail_is_the_truth_again(self):
        self.act("archive")
        MailOutbox.objects.update(status="sent")
        self.fake.relabel("g1", ["INBOX", "UNREAD"])
        self.tick()
        self.assertEqual((self.row.state, "INBOX" in self.row.label_ids), ("open", True))

    def test_the_reconcile_skips_it_too(self):
        self.act("archive")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(reconcile_started_at=self.now)
        self.tick()
        self.assertNotIn("INBOX", self.row.label_ids)

    def test_a_store_of_a_held_id_skips_it_too(self):
        self.act("archive")
        gmail_store.store_gmail(self.mailbox, self.fake.messages["g1"], now=self.now)
        self.row.refresh_from_db()
        self.assertNotIn("INBOX", self.row.label_ids)

    def test_a_label_made_here_keeps_its_pending_key(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.act("label_add", label=made)
        self.fake.relabel("g1", ["INBOX"])
        self.tick()
        self.assertEqual(sorted(self.row.label_ids), ["INBOX", f"pending:{made.pk}"])
        self.assertEqual(MailMessage.objects.get().is_read, True)
