"""When Gmail will not take a change (contract §1 "On failure", §5): the
change is undone here unless a newer action on the same label stands (it
takes the failed row's previous, or goes when that is its own target);
then one notice per action and reason, counted in conversations, linked to
the newest affected message, and never twice for one action and reason."""

from datetime import timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from services.mail import gmail_store, outbox, outbox_flush
from services.mail.models import MailLabel, MailMessage, MailOutbox
from services.notifications.models import Notification

from .gmail_fake import gmail_message
from .test_outbox_flush import FlushFixture

LINK = "/communications?source=mailbox:google"


class SentenceTests(SimpleTestCase):
    def test_every_verb_and_clause(self):
        cases = [
            (
                ("read", "not_found"),
                "Couldn't mark as read in Gmail: the message no longer exists.",
            ),
            (
                ("unread", "exhausted"),
                "Couldn't mark as unread in Gmail: Gmail didn't answer after several tries.",
            ),
            (("star", "refused"), "Couldn't star in Gmail: Gmail refused the change."),
            (("unstar", "refused"), "Couldn't unstar in Gmail: Gmail refused the change."),
            (("archive", "not_found"), "Couldn't archive in Gmail: the message no longer exists."),
            (
                ("inbox", "refused"),
                "Couldn't move to the Inbox in Gmail: Gmail refused the change.",
            ),
            (("trash", "refused"), "Couldn't delete in Gmail: Gmail refused the change."),
            (("untrash", "refused"), "Couldn't restore in Gmail: Gmail refused the change."),
            (("spam", "refused"), "Couldn't report spam in Gmail: Gmail refused the change."),
            (
                ("not_spam", "refused"),
                "Couldn't mark as not spam in Gmail: Gmail refused the change.",
            ),
            (
                ("label_add", "label_gone", "Renewals"),
                'Couldn\'t label "Renewals" in Gmail: the label no longer exists.',
            ),
            (
                ("label_remove", "refused", "Renewals"),
                'Couldn\'t remove the label "Renewals" in Gmail: Gmail refused the change.',
            ),
            (
                ("label_create", "name_refused", "Pilot"),
                'Couldn\'t create the label "Pilot" in Gmail: Gmail refused the name.',
            ),
        ]
        for args, expected in cases:
            self.assertEqual(outbox.sentence(*args), expected)


class RevertTests(FlushFixture):
    def message(self, gmail_id):
        return MailMessage.objects.get(pk=self.rows[gmail_id].pk)

    def test_a_message_gone_from_gmail_fails_at_once_and_is_put_back(self):
        self.act("archive", "g1")
        del self.fake.messages["g1"]
        self.tick()
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.reason, row.attempts), ("failed", "not_found", 0))
        g1 = self.message("g1")
        self.assertEqual(("INBOX" in g1.label_ids, g1.state), (True, "open"))

    def test_a_gone_label_comes_off_the_message(self):
        renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.act("label_add", "g1", label=renewals)
        renewals.delete()
        self.tick()
        self.assertNotIn("Label_12", self.message("g1").label_ids)

    def test_a_newer_action_on_a_sending_row_stands_when_it_fails(self):
        self.act("archive", "g1")
        MailOutbox.objects.update(status="sending")
        self.act("inbox", "g1")  # back to the Inbox while the archive is on its way
        sending = MailOutbox.objects.select_related("message").get(status="sending")
        outbox_flush.Flush(self.mailbox, None, self.now)._fail([sending], "not_found")
        # The newer row's target is what Gmail still has: nothing left to send.
        self.assertEqual(list(MailOutbox.objects.values_list("status", flat=True)), ["failed"])
        g1 = self.message("g1")
        self.assertEqual(("INBOX" in g1.label_ids, g1.state), (True, "open"))


class NoticeTests(FlushFixture):
    def store_thread(self, *gmail_ids):
        for gmail_id in gmail_ids:
            self.fake.add(gmail_message(gmail_id, thread_id="t-1"), quietly=True)
            self.rows[gmail_id] = gmail_store.store_gmail(
                self.mailbox, self.fake.messages[gmail_id], now=self.now
            )[0]

    def test_one_notice_with_the_sentence_and_a_link(self):
        self.act("archive", "g1")
        del self.fake.messages["g1"]
        self.tick()
        note = Notification.objects.get()
        self.assertEqual(
            (note.recipient, note.actor, note.kind, note.message, note.link),
            (
                self.dana,
                None,
                "mail_action_failed",
                "Couldn't archive in Gmail: the message no longer exists.",
                f"{LINK}&message={self.rows['g1'].pk}",
            ),
        )

    def test_a_bulk_failure_is_one_notice_counting_conversations(self):
        self.act("archive", "g1", "g2", "g3")
        for gmail_id in ("g1", "g2", "g3"):
            del self.fake.messages[gmail_id]
        self.tick()
        note = Notification.objects.get()
        self.assertEqual(
            note.message,
            "Couldn't archive 3 conversations in Gmail: the message no longer exists.",
        )
        self.assertEqual(note.link, f"{LINK}&message={self.rows['g3'].pk}")

    def test_messages_of_one_thread_are_one_conversation(self):
        self.store_thread("t1", "t2")
        self.act("archive", "t1", "t2")
        for gmail_id in ("t1", "t2"):
            del self.fake.messages[gmail_id]
        self.tick()
        self.assertEqual(
            Notification.objects.get().message,
            "Couldn't archive in Gmail: the message no longer exists.",
        )

    @override_settings(MAIL_OUTBOX_SINGLE_CALLS_PER_TICK=1)
    def test_told_once_per_action_and_reason_across_ticks(self):
        self.act("trash", "g1", "g2")
        for gmail_id in ("g1", "g2"):
            del self.fake.messages[gmail_id]
        self.tick()
        self.tick(now=self.now + timedelta(seconds=5))
        self.assertEqual(MailOutbox.objects.filter(status="failed").count(), 2)
        self.assertEqual(Notification.objects.count(), 1)

    @override_settings(MAIL_OUTBOX_MAX_ATTEMPTS=1)
    def test_each_reason_is_its_own_notice(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 503)
        self.tick()
        self.act("star", "g2")
        self.fake.fail("batchModify", 403, "domainPolicy")
        self.tick(now=self.now + timedelta(seconds=5))
        self.assertEqual(
            list(Notification.objects.order_by("pk").values_list("message", flat=True)),
            [
                "Couldn't mark as read in Gmail: Gmail didn't answer after several tries.",
                "Couldn't star in Gmail: Gmail refused the change.",
            ],
        )


class NotifyFailureTests(FlushFixture):
    def test_a_notice_that_fails_is_logged_and_never_hides_the_ticks_error(self):
        self.act("archive", "g1")
        self.fake.fail("batchModify", 503)
        with (
            patch.object(outbox_flush.Flush, "notify", side_effect=RuntimeError("boom")),
            self.assertLogs("services.mail.outbox_flush", "WARNING") as logs,
        ):
            result = self.tick()
        self.assertEqual(result.outcome, "backoff")
        line = next(entry for entry in logs.output if "notice" in entry)
        self.assertIn(f"connection {self.mailbox.pk}", line)
        self.assertIn("RuntimeError", line)
        self.assertNotIn("boom", line)

    def test_a_notice_that_fails_after_a_clean_flush_is_logged_not_raised(self):
        self.act("archive", "g1")
        del self.fake.messages["g1"]
        with patch.object(outbox_flush, "notify", side_effect=RuntimeError("boom")):
            self.tick()
        self.assertEqual(MailOutbox.objects.get().status, "failed")
