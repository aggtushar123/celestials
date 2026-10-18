"""Reading a Gmail message whole: To, Cc and Bcc apart, the threading
headers, every label id, the raw HTML part, and each file part's details;
filing still counts Cc as a counterpart and never Bcc."""

from django.test import SimpleTestCase

from services.customers.models import Email
from services.mail import sync
from services.mail.providers.google import parse_gmail_message

from .gmail_fake import fixture, gmail_message
from .test_mail import Fixture, message


class GmailParseTests(SimpleTestCase):
    def test_the_recorded_message(self):
        m = parse_gmail_message(fixture("message_full.json"))
        self.assertEqual(m.to, [("Dana Ruiz", "dana@acme.io")])
        self.assertEqual(m.cc, [("Sam Pizza", "sam@pizzahut.com")])
        self.assertEqual(m.bcc, [])
        self.assertEqual(
            (m.rfc_message_id, m.references),
            ("<CAF=quote@mail.gmail.com>", "<CAF=first@mail.gmail.com>"),
        )
        self.assertEqual(m.label_ids, ["INBOX", "UNREAD", "IMPORTANT", "Label_12"])
        self.assertEqual(m.labels, ["inbox", "unread", "important"])
        self.assertTrue(m.body.startswith("Hi Dana,"))
        # Raw until it is stored: services.mail.html sanitises at store.
        self.assertIn("<script>", m.html)
        self.assertEqual(
            m.attachments,
            [
                {
                    "part_id": "1",
                    "attachment_id": "ANGjdJ8quote",
                    "filename": "Renewal quote.pdf",
                    "mime_type": "application/pdf",
                    "size": 182311,
                    "content_id": "",
                    "is_inline": False,
                },
                {
                    "part_id": "2",
                    "attachment_id": "ANGjdJ8logo",
                    "filename": "logo.png",
                    "mime_type": "image/png",
                    "size": 4210,
                    "content_id": "logo@pizzahut.com",
                    "is_inline": True,
                },
            ],
        )

    def test_bcc_on_the_owners_own_sent_mail(self):
        m = parse_gmail_message(
            gmail_message("s1", labels=["SENT"], sender="dana@acme.io", bcc="boss@acme.io")
        )
        self.assertEqual(m.bcc, [("", "boss@acme.io")])
        self.assertEqual((m.html, m.attachments), ("", []))


class FilingCountsCcTests(Fixture):
    def test_a_customer_on_cc_files_the_mail_and_bcc_never_does(self):
        connection = self.connect(self.dana)
        cc = message(
            provider_id="c1",
            from_address="dana@acme.io",
            to=[("Carl", "carl@acme.io")],
            cc=[("Sam Pizza", "sam@pizzahut.com")],
        )
        filed = sync.file_message(connection, cc)
        self.assertEqual(filed.customer, self.pizza)
        self.assertEqual(filed.to_addresses, ["carl@acme.io", "sam@pizzahut.com"])
        bcc = message(
            provider_id="b1",
            from_address="dana@acme.io",
            to=[("Carl", "carl@acme.io")],
            bcc=[("Sam Pizza", "sam@pizzahut.com")],
        )
        self.assertIsNone(sync.file_message(connection, bcc))
        self.assertEqual(Email.objects.count(), 1)
