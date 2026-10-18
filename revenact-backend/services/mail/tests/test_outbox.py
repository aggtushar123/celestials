"""Writing the outbox (contract §1, "Enqueueing"): an action changes the row
at once and queues one row per label change; a change that undoes a pending
one collapses it; a change already true locally queues nothing; muted
messages follow the archive and inbox rules; a label made here is keyed
pending; the mailbox is woken on commit, never later than it already was."""

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.mail import gmail_store, outbox
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


class WriterFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.row = self.store("g1")
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")

    def store(self, gmail_id, labels=("INBOX", "UNREAD")):
        row, _ = gmail_store.store_gmail(
            self.mailbox, gmail_message(gmail_id, labels=labels), now=self.now
        )
        return row

    def act(self, op, *messages, label=None, action_id=None):
        targets = messages or (self.row,)
        pairs = [(m, change) for m in targets for change in outbox.changes_for(op, label)]
        with self.captureOnCommitCallbacks(execute=True), transaction.atomic():
            changed = outbox.apply(self.mailbox, pairs, action_id=action_id, now=self.now)
        for message in targets:
            message.refresh_from_db()
        return changed

    def pending(self):
        return list(
            MailOutbox.objects.filter(status="pending")
            .order_by("pk")
            .values_list("op", "label_key", "add", "previous")
        )


class EnqueueTests(WriterFixture):
    def test_read_changes_the_row_at_once_and_queues_one_label(self):
        self.assertEqual(self.act("read"), {self.row.pk})
        self.assertEqual((self.row.is_read, self.row.label_ids), (True, ["INBOX"]))
        self.assertEqual(self.pending(), [("read", "UNREAD", False, {"present": True})])
        row = MailOutbox.objects.get()
        self.assertEqual((row.connection, row.message, row.attempts), (self.mailbox, self.row, 0))
        self.assertEqual(row.next_attempt_at, self.now)

    def test_a_change_already_true_queues_nothing(self):
        self.assertEqual(self.act("unstar"), set())
        self.assertEqual(self.pending(), [])

    def test_read_then_unread_sends_nothing(self):
        self.act("read")
        self.assertEqual(self.act("unread"), {self.row.pk})
        self.assertEqual(self.pending(), [])
        self.assertFalse(self.row.is_read)

    def test_the_same_change_again_takes_the_new_action_and_starts_over(self):
        first, second = uuid.uuid4(), uuid.uuid4()
        self.act("read", action_id=first)
        MailOutbox.objects.update(attempts=3)
        self.assertEqual(self.act("read", action_id=second), set())
        row = MailOutbox.objects.get()
        self.assertEqual((row.action_id, row.attempts, row.add), (second, 0, False))

    def test_a_sending_row_is_not_collapsed_into(self):
        self.act("read")
        MailOutbox.objects.update(status="sending")
        self.act("unread")
        self.assertEqual(self.pending(), [("unread", "UNREAD", True, {"present": False})])

    def test_spam_is_two_rows_and_the_folder_follows(self):
        self.act("spam")
        self.assertEqual(self.row.folder, "spam")
        self.assertEqual(
            self.pending(),
            [
                ("spam", "SPAM", True, {"present": False}),
                ("spam", "INBOX", False, {"present": True}),
            ],
        )

    def test_archive_is_done_and_inbox_reopens(self):
        self.act("archive")
        self.assertEqual((self.row.state, self.row.folder), ("done", "inbox"))
        self.act("inbox")
        self.assertEqual(self.row.state, "open")
        self.assertEqual(self.pending(), [])

    def test_trash_moves_it_to_trash(self):
        self.act("trash")
        self.assertEqual(self.row.folder, "trash")
        self.assertEqual(self.pending(), [("trash", "TRASH", True, {"present": False})])

    def test_one_action_over_many_messages_shares_its_id(self):
        other = self.store("g2")
        self.act("archive", self.row, other)
        self.assertEqual(MailOutbox.objects.values("action_id").distinct().count(), 1)
        self.assertEqual(MailOutbox.objects.count(), 2)


class MutedTests(WriterFixture):
    def setUp(self):
        super().setUp()
        MailMessage.objects.filter(pk=self.row.pk).update(state="muted")
        self.row.refresh_from_db()

    def test_read_leaves_muted_alone(self):
        self.act("read")
        self.assertEqual(self.row.state, "muted")

    def test_archive_on_a_muted_message_is_done_and_inbox_is_open(self):
        self.act("archive")
        self.assertEqual(self.row.state, "done")
        MailMessage.objects.filter(pk=self.row.pk).update(state="muted")
        self.row.refresh_from_db()
        self.act("inbox")
        self.assertEqual(self.row.state, "open")


class LabelTests(WriterFixture):
    def test_a_user_label_is_its_gmail_id_and_the_row_keeps_its_name(self):
        self.act("label_add", label=self.renewals)
        self.assertIn("Label_12", self.row.label_ids)
        row = MailOutbox.objects.get()
        self.assertEqual(
            (row.label_key, row.add, row.payload), ("Label_12", True, {"label": "Renewals"})
        )

    def test_a_label_made_here_is_keyed_pending(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.act("label_add", label=made)
        self.assertIn(f"pending:{made.pk}", self.row.label_ids)
        self.assertEqual(MailOutbox.objects.get().label_key, f"pending:{made.pk}")


class WakeTests(WriterFixture):
    def test_a_queued_change_wakes_the_mailbox_on_commit(self):
        self.act("read")
        self.mailbox.refresh_from_db()
        self.assertLessEqual(self.mailbox.wake_at, timezone.now())

    def test_an_earlier_wake_is_kept(self):
        earlier = self.now - timedelta(hours=1)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(wake_at=earlier)
        self.act("read")
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.wake_at, earlier)

    def test_a_collapse_alone_wakes_nothing(self):
        self.act("read")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(wake_at=None)
        self.act("unread")
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.wake_at)
