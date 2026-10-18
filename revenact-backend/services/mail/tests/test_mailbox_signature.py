"""The mailbox's signature (agent bundles round 2 D1 contract §4.3,
R2D1-15): an Outlook mailbox's owner writes it; Gmail's is read from Gmail;
IMAP has none. Only the caller's own mailbox."""

from django.test import override_settings

from services.mail import signing
from services.mail.models import MailboxConnection
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection

URL = "/api/v1/mail/connection/"


@override_settings(GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="sec")
class MailboxSignatureTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.carl)

    def patch(self, value):
        return self.client.patch(URL, {"signature": value}, format="json")

    def test_outlook_writes_reads_and_clears_it(self):
        connection = outlook_connection(self.carl)
        self.assertEqual(
            self.client.get(URL).data["connection"]["signature"],
            {"text": "", "editable": True, "source": "revenact"},
        )
        answer = self.patch("Carl CSM  \nAcme\n\n")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(answer.json()["connection"]["signature"]["text"], "Carl CSM\nAcme")
        connection.refresh_from_db()
        self.assertEqual(connection.signature_html, signing.stored("Carl CSM\nAcme"))
        self.assertEqual(self.patch("").json()["connection"]["signature"]["text"], "")

    def test_normalises_trailing_spaces_and_edge_blank_lines_only(self):
        outlook_connection(self.carl)
        answer = self.patch("\n\r\n  Carl  \r\n\r\nAcme   \n\n")
        self.assertEqual(answer.json()["connection"]["signature"]["text"], "Carl\n\nAcme")
        ten = "\n".join(["line"] * 10) + "\n\n\n"
        self.assertEqual(self.patch(ten).status_code, 200)

    def test_refusals_in_order(self):
        self.assertEqual(
            (self.patch("Hi").status_code, self.patch("Hi").json()),
            (404, {"detail": "Connect your mailbox first."}),
        )
        outlook_connection(self.carl)
        self.assertEqual(
            self.client.patch(URL, {"signature": 3}, format="json").json(),
            {"signature": ["Write a signature, or leave it empty."]},
        )
        self.assertEqual(
            self.patch("x" * 1001).json(),
            {"signature": ["Keep the signature under 1000 characters."]},
        )
        self.assertEqual(
            self.patch("\n".join(["line"] * 11)).json(),
            {"signature": ["Keep the signature to 10 lines."]},
        )

    def test_gmail_too_long_is_a_400_before_the_409(self):
        self.google(self.carl, signature_html="<div>Carl from Gmail</div>")
        answer = self.patch("x" * 1001)
        self.assertEqual(
            (answer.status_code, answer.json()),
            (400, {"signature": ["Keep the signature under 1000 characters."]}),
        )

    def test_gmail_is_read_only_here(self):
        self.google(self.carl, signature_html="<div>Carl from Gmail</div>")
        self.assertEqual(
            self.client.get(URL).data["connection"]["signature"],
            {"text": "Carl from Gmail", "editable": False, "source": "gmail"},
        )
        answer = self.patch("Mine")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (
                409,
                {
                    "code": "SIGNATURE_IN_GMAIL",
                    "detail": "Change your signature in Gmail. Revenact uses it from there.",
                },
            ),
        )

    def as_carl(self):
        """Carl again, with no mailbox cached on the instance."""
        self.client.force_authenticate(type(self.carl).objects.get(pk=self.carl.pk))

    def test_imap_has_none(self):
        connection = outlook_connection(self.carl)
        MailboxConnection.objects.filter(pk=connection.pk).update(
            provider=MailboxConnection.Provider.IMAP
        )
        self.as_carl()
        self.assertIsNone(self.client.get(URL).data["connection"]["signature"])
        self.assertEqual(self.patch("Mine").json()["code"], "NO_SIGNATURE")

    def test_signature_adds_no_query(self):
        """GET /mail/connection/ costs the same whatever the signature is:
        MAILBOX_QUERIES for an Outlook mailbox, GMAIL_QUERIES for a Gmail one."""
        outlook_connection(self.carl)
        self.as_carl()
        with self.assertNumQueries(MAILBOX_QUERIES):
            self.client.get(URL)
        self.patch("Carl CSM")
        self.as_carl()
        with self.assertNumQueries(MAILBOX_QUERIES):
            self.client.get(URL)
        MailboxConnection.objects.filter(user=self.carl).delete()
        self.google(self.carl, signature_html="<div>Carl from Gmail</div>")
        self.as_carl()
        with self.assertNumQueries(GMAIL_QUERIES):
            self.client.get(URL)


# the signature is built from the row already loaded: it adds no query
MAILBOX_QUERIES = 5
GMAIL_QUERIES = 9
