"""Signatures (agent bundles round 2 D1 contract R2D1-15, R2D1-17): Gmail's
send-as signature in HTML and text, an Outlook signature written in Revenact
in text, nothing for IMAP, nothing twice. Gmail and Graph are fakes."""

import subprocess
import sys
from datetime import timedelta

from django.conf import settings
from django.test import SimpleTestCase
from django.utils import timezone

from services.customers.models import Email
from services.mail import agent_send, send_as, signing, sync
from services.mail.models import MailboxConnection, MailMessage
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection, use_graph

GMAIL_SIGNATURE = '<div>Carl CSM<br><img src="https://acme.io/logo.png" alt="Acme"></div>'


class ImportOrderTests(SimpleTestCase):
    def test_sync_imports_first_in_a_fresh_process(self):
        # The URLconf imports services.mail.sync before any other mail module
        # (communications_views); signing must not close a cycle through
        # send_as, gmail_sync and gmail_store back to sync.
        code = "import django; django.setup(); import services.mail.sync; import config.urls"
        done = subprocess.run(
            [sys.executable, "-c", code],
            cwd=settings.BASE_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(done.returncode, 0, done.stderr[-2000:])


class SignedTests(GmailFixture):
    def outlook(self, text="Carl CSM\nAcme"):
        connection = outlook_connection(self.carl)
        connection.signature_html = signing.stored(text)
        connection.save(update_fields=["signature_html"])
        return connection

    def test_gmail_signs_in_html_and_text(self):
        connection = self.google(self.carl, signature_html=GMAIL_SIGNATURE)
        markup, text = signing.signed(connection, "Thanks Ann.")
        self.assertEqual(markup, "<p>Thanks Ann.</p>" + send_as.signature_block(connection))
        self.assertEqual(text, "Thanks Ann.\n\n-- \nCarl CSM")

    def test_outlook_signs_in_text(self):
        connection = self.outlook()
        self.assertEqual(signing.text(connection), "Carl CSM\nAcme")
        self.assertEqual(signing.signed(connection, "Hi"), ("", "Hi\n\n-- \nCarl CSM\nAcme"))

    def test_nothing_without_a_signature_or_twice_or_for_imap(self):
        bare = outlook_connection(self.dana)
        self.assertEqual(signing.signed(bare, "Hi"), ("", "Hi"))
        signed = self.outlook()
        self.assertEqual(signing.signed(signed, "Hi\n\n-- \nOld"), ("", "Hi\n\n-- \nOld"))
        signed.provider = MailboxConnection.Provider.IMAP
        self.assertEqual(signing.signed(signed, "Hi"), ("", "Hi"))

    def test_an_agents_outlook_reply_is_signed(self):
        graph = use_graph(self)
        connection = self.outlook()
        source = Email.objects.create(
            customer=self.pizza,
            subject="Login loop",
            sender_name="Ann Lee",
            body="We can't log in.",
            sent_at=timezone.now() - timedelta(hours=1),
            mailbox=connection,
            mailbox_owner=self.carl,
            direction=Email.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            to_addresses=[connection.address],
            thread_id="conv-1",
            provider_message_id="graph-orig",
        )
        agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="We're on it.",
            key="b12-s41",
        )
        self.assertEqual(graph.posted[-1]["body"]["content"], "We're on it.\n\n-- \nCarl CSM\nAcme")

    def test_a_persons_gmail_send_without_a_draft_is_signed_and_filed_as_sent(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl, signature_html=GMAIL_SIGNATURE)
        email = sync.send_email(
            connection,
            to=["ann@pizzahut.com"],
            subject="Hello",
            body="Thanks Ann.",
            customer=self.pizza,
        )
        message = gmail.uploads[-1][3]
        html = message.get_body(("html",)).get_content()
        self.assertIn("data-revenact-signature", html)
        self.assertIn('src="https://acme.io/logo.png"', html)
        self.assertTrue(message.get_body(("plain",)).get_content().rstrip().endswith("Carl CSM"))
        self.assertEqual(email.body, "Thanks Ann.\n\n-- \nCarl CSM")

    def test_a_persons_gmail_reply_from_the_inbox_is_signed_in_html_and_text(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl, signature_html=GMAIL_SIGNATURE)
        original = MailMessage.objects.create(
            connection=connection,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="gmail-x",
            direction=MailMessage.Direction.RECEIVED,
            from_address="sam@unknown.io",
            subject="Hello",
            sent_at=timezone.now(),
        )
        sync.reply_to(original, "Thanks Sam.")
        message = gmail.uploads[-1][3]
        self.assertIn("data-revenact-signature", message.get_body(("html",)).get_content())
        self.assertTrue(
            message.get_body(("plain",))
            .get_content()
            .replace("\r\n", "\n")
            .rstrip()
            .endswith("-- \nCarl CSM")
        )

    def test_a_persons_outlook_reply_from_the_inbox_is_signed(self):
        graph = use_graph(self)
        connection = self.outlook()
        original = MailMessage.objects.create(
            connection=connection,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="graph-x",
            direction=MailMessage.Direction.RECEIVED,
            from_address="sam@unknown.io",
            subject="Hello",
            sent_at=timezone.now(),
        )
        sync.reply_to(original, "Thanks Sam.")
        self.assertEqual(graph.posted[-1]["body"]["content"], "Thanks Sam.\n\n-- \nCarl CSM\nAcme")
