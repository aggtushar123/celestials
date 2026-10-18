"""Two-way Gmail storage: the new connection state, one live connection per
Google address, labels and attachment details, and the workspace switch's
default."""

from django.db import IntegrityError, transaction

from services.accounts.models import Organisation
from services.mail import scopes
from services.mail.models import MailAttachment, MailboxConnection, MailLabel, MailMessage

from .gmail_fixtures import GmailFixture
from .test_mail import NOW


class ConnectionStateTests(GmailFixture):
    def test_a_new_connection_starts_with_nothing_to_resume(self):
        imap = self.connect(self.carl)
        self.assertEqual(
            (imap.granted_scopes, imap.paused_reason, imap.consecutive_failures), ([], "", 0)
        )
        self.assertIsNone(imap.history_id)
        self.assertFalse(imap.two_way)
        self.assertFalse(imap.is_google)

    def test_two_way_needs_all_three_gmail_scopes(self):
        full = self.google(self.dana)
        self.assertTrue(full.two_way)
        full.granted_scopes = [scopes.MODIFY, scopes.SEND]
        self.assertFalse(full.two_way)
        self.assertEqual(
            scopes.short_names([scopes.MODIFY, "openid", scopes.SEND]),
            ["gmail.modify", "gmail.send"],
        )

    def test_one_live_google_connection_per_address(self):
        dana = self.google(self.dana, "shared@acme.io")
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.google(self.carl, "shared@acme.io")
        dana.status = MailboxConnection.Status.DISCONNECTED
        dana.save(update_fields=["status"])
        self.assertEqual(self.google(self.carl, "shared@acme.io").address, "shared@acme.io")

    def test_the_workspace_switch_starts_off(self):
        self.assertFalse(Organisation.objects.create(name="New Co").gmail_two_way_enabled)


class LabelAndAttachmentTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.connection = self.google(self.dana)
        self.message = MailMessage.objects.create(
            connection=self.connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="g1",
            direction="received",
            subject="Hi",
            sent_at=NOW,
        )

    def test_a_gmail_label_is_held_once_per_mailbox(self):
        MailLabel.objects.create(
            connection=self.connection, gmail_id="Label_1", name="Renewals", type="user"
        )
        with transaction.atomic(), self.assertRaises(IntegrityError):
            MailLabel.objects.create(
                connection=self.connection, gmail_id="Label_1", name="Again", type="user"
            )
        # A label made here (D2) has no Gmail id yet; several may wait at once.
        MailLabel.objects.create(connection=self.connection, gmail_id="", name="A", type="user")
        MailLabel.objects.create(connection=self.connection, gmail_id="", name="B", type="user")
        self.assertEqual(
            MailLabel.objects.filter(connection=self.connection, gmail_id="").count(), 2
        )

    def test_an_attachment_part_is_held_once_and_new_message_fields_start_empty(self):
        MailAttachment.objects.create(
            message=self.message,
            part_id="1",
            filename="q.pdf",
            mime_type="application/pdf",
            size=10,
        )
        with transaction.atomic(), self.assertRaises(IntegrityError):
            MailAttachment.objects.create(
                message=self.message, part_id="1", filename="x.pdf", mime_type="x", size=1
            )
        m = self.message
        self.assertEqual(
            (m.cc, m.bcc, m.label_ids, m.html_body, m.has_attachments, m.refreshed_at),
            ([], [], [], "", False, None),
        )
