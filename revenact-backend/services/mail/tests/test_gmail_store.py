"""Gmail mail into the person's store (contract §4): the folder and flags
come from the labels at every store and every change, archive is done and
the Inbox reopens it, muted is never touched, chats are never stored, only
inbox and sent mail is filed, and the label list is mirrored."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Email
from services.mail import gmail_store
from services.mail.models import MailAttachment, MailLabel, MailMessage

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


class DeriveTests(GmailFixture):
    def derive(self, labels, sender="sam@pizzahut.com"):
        return gmail_store.derive(labels, from_address=sender, own_address="dana@acme.io")

    def test_the_folder_rules_in_order(self):
        for labels, folder in (
            (["DRAFT", "TRASH"], "drafts"),
            (["TRASH", "SPAM"], "trash"),
            (["SPAM", "INBOX"], "spam"),
            (["SENT", "INBOX"], "sent"),
            (["INBOX"], "inbox"),
            ([], "inbox"),
        ):
            with self.subTest(labels=labels):
                self.assertEqual(self.derive(labels)["folder"], folder)
        self.assertEqual(self.derive([], sender="Dana@Acme.io")["folder"], "sent")

    def test_flags_and_archive(self):
        self.assertEqual(
            self.derive(["UNREAD", "STARRED", "IMPORTANT", "Label_12"]),
            {
                "folder": "inbox",
                "is_read": False,
                "is_starred": True,
                "is_important": True,
                "archived": True,
            },
        )
        self.assertFalse(self.derive(["INBOX"])["archived"])


class StoreTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.connection = self.google(self.dana)
        self.now = timezone.now()

    def store(self, full):
        return gmail_store.store_gmail(self.connection, full, now=self.now)

    def test_the_recorded_message_is_stored_whole_and_filed(self):
        row, filed = self.store(fixture("message_full.json"))
        self.assertEqual(filed, Email.objects.get())
        self.assertEqual(row.email, filed)
        self.assertEqual(filed.customer, self.pizza)
        self.assertEqual(row.to, [["Dana Ruiz", "dana@acme.io"]])
        self.assertEqual(row.cc, [["Sam Pizza", "sam@pizzahut.com"]])
        self.assertEqual(row.label_ids, ["INBOX", "UNREAD", "IMPORTANT", "Label_12"])
        self.assertEqual((row.folder, row.is_read, row.is_important), ("inbox", False, True))
        self.assertEqual(row.rfc_message_id, "<CAF=quote@mail.gmail.com>")
        self.assertEqual(row.references, "<CAF=first@mail.gmail.com>")
        self.assertIn('src="cid:logo@pizzahut.com"', row.html_body)
        self.assertNotIn("<script", row.html_body)
        self.assertEqual(row.refreshed_at, self.now)
        # The inline logo is recorded for cid: but does not make it "has attachments".
        self.assertTrue(row.has_attachments)
        parts = list(
            row.attachments.order_by("part_id").values_list("part_id", "filename", "is_inline")
        )
        self.assertEqual(parts, [("1", "Renewal quote.pdf", False), ("2", "logo.png", True)])
        self.assertFalse(MailAttachment.objects.get(part_id="1").file)

    def test_only_inline_parts_is_not_has_attachments(self):
        row, _ = self.store(
            gmail_message(
                "i1",
                attachments=[
                    {
                        "filename": "logo.png",
                        "mime_type": "image/png",
                        "size": 9,
                        "inline": True,
                        "content_id": "logo",
                    }
                ],
            )
        )
        self.assertFalse(row.has_attachments)
        self.assertEqual(row.attachments.count(), 1)

    def test_a_filename_is_cleaned_like_an_upload(self):
        row, _ = self.store(
            gmail_message(
                "f1",
                attachments=[
                    {"filename": "../../etc/pass?wd.pdf", "mime_type": "application/pdf", "size": 1}
                ],
            )
        )
        self.assertEqual(row.attachments.get().filename, "passwd.pdf")

    def test_chats_are_never_stored(self):
        self.assertEqual(self.store(gmail_message("c1", labels=["CHAT"])), (None, None))
        self.assertFalse(MailMessage.objects.exists())

    def test_spam_trash_and_drafts_are_kept_but_never_filed(self):
        for gid, labels in (("s1", ["SPAM"]), ("t1", ["TRASH"]), ("d1", ["DRAFT"])):
            row, filed = self.store(gmail_message(gid, labels=labels))
            self.assertIsNone(filed)
            self.assertIsNone(row.email)
        self.assertFalse(Email.objects.exists())

    def test_archived_mail_is_done(self):
        row, _ = self.store(gmail_message("a1", labels=["UNREAD"]))
        self.assertEqual((row.folder, row.state), ("inbox", "done"))

    def test_a_message_id_too_long_to_hold_is_left_blank(self):
        full = gmail_message("l1")
        for header in full["payload"]["headers"]:
            if header["name"] == "Message-ID":
                header["value"] = "<" + "x" * 1000 + "@mail.gmail.com>"
        row, _ = self.store(full)
        self.assertEqual(row.rfc_message_id, "")

    def test_a_held_id_is_relabelled_not_duplicated(self):
        self.store(gmail_message("h1", labels=["INBOX", "UNREAD"]))
        row, filed = self.store(gmail_message("h1", labels=["INBOX"]))
        self.assertIsNone(filed)
        self.assertEqual(MailMessage.objects.count(), 1)
        self.assertTrue(row.is_read)

    def test_mail_filed_on_an_earlier_connection_pass_is_linked_not_filed_again(self):
        first, filed = self.store(gmail_message("r1"))
        first.delete()
        row, again = self.store(gmail_message("r1"))
        self.assertIsNone(again)
        self.assertEqual(row.email, filed)
        self.assertEqual(Email.objects.count(), 1)


class RelabelTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.connection = self.google(self.dana)
        self.now = timezone.now()
        self.row, _ = gmail_store.store_gmail(
            self.connection, gmail_message("m1", labels=["INBOX", "UNREAD"]), now=self.now
        )

    def relabel(self, labels):
        later = self.now + timedelta(minutes=1)
        gmail_store.relabel(self.connection, self.row, labels, later)
        self.row.refresh_from_db()
        return later

    def test_archive_then_back_to_the_inbox_reopens(self):
        self.relabel([])
        self.assertEqual(self.row.state, "done")
        later = self.relabel(["INBOX", "STARRED"])
        self.assertEqual(
            (self.row.state, self.row.is_read, self.row.is_starred), ("open", True, True)
        )
        self.assertEqual((self.row.label_ids, self.row.refreshed_at), (["INBOX", "STARRED"], later))

    def test_muted_is_never_touched(self):
        MailMessage.objects.filter(pk=self.row.pk).update(state="muted")
        self.row.refresh_from_db()
        self.relabel([])
        self.assertEqual(self.row.state, "muted")

    def test_a_change_made_here_does_not_freeze_a_gmail_row(self):
        MailMessage.objects.filter(pk=self.row.pk).update(
            is_starred=True, locally_changed_at=self.now
        )
        self.row.refresh_from_db()
        self.relabel(["INBOX"])
        self.assertFalse(self.row.is_starred)

    def test_a_filed_email_is_never_moved_by_a_later_label(self):
        row, filed = gmail_store.store_gmail(self.connection, gmail_message("f9"), now=self.now)
        gmail_store.relabel(self.connection, row, ["TRASH"], self.now)
        filed.refresh_from_db()
        self.assertEqual(filed.customer, self.pizza)


class MirrorTests(GmailFixture):
    def test_labels_are_created_updated_and_removed(self):
        connection = self.google(self.dana)
        labels = fixture("labels_list.json")["labels"]
        gmail_store.mirror_labels(connection, labels)
        renewals = MailLabel.objects.get(connection=connection, gmail_id="Label_12")
        self.assertEqual(
            (renewals.name, renewals.type, renewals.color_background, renewals.color_text),
            ("Renewals", "user", "#16a766", "#ffffff"),
        )
        self.assertEqual(MailLabel.objects.get(gmail_id="INBOX").type, "system")
        renamed = [
            {**label, "name": "Renewals 2027"} if label["id"] == "Label_12" else label
            for label in labels
            if label["id"] != "Label_19"
        ]
        gmail_store.mirror_labels(connection, renamed)
        self.assertEqual(MailLabel.objects.get(gmail_id="Label_12").name, "Renewals 2027")
        self.assertFalse(MailLabel.objects.filter(gmail_id="Label_19").exists())
        self.assertEqual(MailLabel.objects.filter(connection=connection).count(), len(renamed))
