"""Threading for every Gmail send (D3 decision 16), the old routes included:
a send answering a message in the sender's own Google mailbox carries its
threadId, In-Reply-To and References; one answering someone else's filed
mail (a manager in the chain) the headers only. Today's routes build their
text through the MIME builder and send through the upload endpoint. The
original is found through Email.mail_message, which also gives IMAP its
In-Reply-To. Reply-To is stored. mailbox.reply gains cc, bcc_count,
attachments and bytes (zero on today's routes)."""

from unittest.mock import patch

from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Email
from services.mail import gmail_store, sync
from services.mail.models import MailMessage

from .gmail_fake import gmail_message
from .gmail_fixtures import GmailFixture
from .test_mail import NOW, FakeProvider, Fixture


class GmailThreadingTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.mailbox = self.google(self.dana, send_as_name="Dana Ruiz")
        self.now = timezone.now()
        quote = gmail_message(
            "g1",
            sender="Ann Lee <ann@pizzahut.com>",
            subject="Renewal terms",
            references="<first@pizzahut.com>",
            thread_id="t-g1",
            reply_to="Renewals <renewals@pizzahut.com>",
        )
        self.row, self.filed = gmail_store.store_gmail(self.mailbox, quote, now=self.now)
        self.client.force_authenticate(self.dana)

    def last_upload(self):
        method, route, metadata, message = self.fake.uploads[-1]
        return route, metadata, message

    def test_reply_to_is_stored(self):
        self.assertEqual(self.row.reply_to, [["Renewals", "renewals@pizzahut.com"]])
        self.assertIsNotNone(self.filed)

    def test_a_reply_in_the_mailbox_threads_in_gmail(self):
        response = self.client.post(
            f"/api/v1/mail/messages/{self.row.pk}/reply/", {"body": "Yes."}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual((route, metadata), ("/messages/send", {"threadId": "t-g1"}))
        self.assertEqual(message["In-Reply-To"], "<g1@mail.gmail.com>")
        self.assertEqual(str(message["References"]), "<first@pizzahut.com> <g1@mail.gmail.com>")
        self.assertEqual(message.get_content_type(), "text/plain")
        self.assertEqual(message.get_content().strip(), "Yes.")
        self.assertEqual(message["From"].addresses[0].display_name, "Dana Ruiz")
        self.assertEqual(str(message["Subject"]), "Re: Renewal terms")
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual(
            {key: event.metadata[key] for key in ("cc", "bcc_count", "attachments", "bytes")},
            {"cc": [], "bcc_count": 0, "attachments": 0, "bytes": 0},
        )

    def test_an_unfiled_reply_threads_too(self):
        stranger, _ = gmail_store.store_gmail(
            self.mailbox,
            gmail_message("g2", sender="Stranger <x@else.io>", thread_id="t-g2"),
            now=self.now,
        )
        response = self.client.post(
            f"/api/v1/mail/messages/{stranger.pk}/reply/", {"body": "Hello."}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual(metadata, {"threadId": "t-g2"})
        self.assertEqual(message["In-Reply-To"], "<g2@mail.gmail.com>")

    def test_a_new_message_on_a_record_carries_no_thread(self):
        response = self.client.post(
            f"/api/v1/customers/{self.pizza.pk}/emails/send/",
            {"to": ["ann@pizzahut.com"], "subject": "Hello", "body": "First note."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual((route, metadata), ("/messages/send", {}))
        self.assertIsNone(message["In-Reply-To"])

    def test_a_colleague_answering_shared_mail_gets_the_headers_but_not_the_thread(self):
        self.google(self.carl)
        self.client.force_authenticate(self.carl)
        url = f"/api/v1/communications/emails/{self.filed.pk}/reply/"
        # Mail is owner-only (2026-10-17): Dana's manager can't answer her private mail.
        response = self.client.post(url, {"body": "Carl here."}, format="json")
        self.assertEqual(response.status_code, 404)
        # Once Dana adds it to Revenact, Carl answers from his own mailbox.
        Email.objects.filter(pk=self.filed.pk).update(shared_at=timezone.now())
        response = self.client.post(url, {"body": "Carl here."}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual(metadata, {})
        self.assertEqual(message["In-Reply-To"], "<g1@mail.gmail.com>")
        self.assertEqual(message["From"].addresses[0].addr_spec, "carl@acme.io")
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual((event.metadata["bcc_count"], event.metadata["bytes"]), (0, 0))

    def test_answering_headers(self):
        self.assertEqual(
            sync.answering_headers(self.mailbox, message=self.row),
            ("<g1@mail.gmail.com>", "<first@pizzahut.com>", "t-g1"),
        )
        self.assertEqual(
            sync.answering_headers(self.mailbox, email=self.filed),
            ("<g1@mail.gmail.com>", "<first@pizzahut.com>", "t-g1"),
        )
        carls = self.google(self.carl)
        self.assertEqual(sync.answering_headers(carls, email=self.filed)[2], "")
        self.assertEqual(sync.answering_headers(self.mailbox), ("", "", ""))

    def test_the_from_name(self):
        self.assertEqual(sync.sender_name(self.mailbox), "Dana Ruiz")
        self.mailbox.send_as_name = ""
        self.assertEqual(sync.sender_name(self.mailbox), "Dana")


class ImapThreadingTests(Fixture):
    def setUp(self):
        super().setUp()
        self.connection = self.connect(self.dana)
        self.original = self.email(
            self.dana,
            subject="Renewal terms",
            from_address="sam@pizzahut.com",
            mailbox=self.connection,
            provider_message_id="17",
        )
        MailMessage.objects.create(
            connection=self.connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="17",
            direction=MailMessage.Direction.RECEIVED,
            from_address="sam@pizzahut.com",
            subject="Renewal terms",
            sent_at=NOW,
            rfc_message_id="<orig@pizzahut.com>",
            email=self.original,
        )

    def test_imap_finds_the_message_id_through_the_mailbox_copy(self):
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            sync.send_email(
                self.connection,
                to=["sam@pizzahut.com"],
                subject="Re: Renewal terms",
                body="Yes.",
                customer=self.pizza,
                answering=self.original,
            )
        self.assertEqual(FakeProvider.replied_to[-1], "<orig@pizzahut.com>")
        self.assertEqual(FakeProvider.extra[-1], {})
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)
