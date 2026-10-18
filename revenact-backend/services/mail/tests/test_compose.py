"""GET mail/compose/ (D3 contract §2): the editor's prefill, nothing stored
and nothing sent. Recipients by the table (Reply-To, the person's own sent
mail, reply all, the owner's address out, each address once, To over Cc);
Re:/Fwd: once; the signature above the quote or the forward block; a
forward's files; the record and the suggestion, only records the owner may
open; the checks (400, 404, IS_DRAFT, GMAIL_ONLY, NO_MAILBOX, TWO_WAY_OFF;
paused does not refuse); owner-only; six queries."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation, User
from services.customers.models import Contact
from services.mail import compose, gmail_store
from services.mail.models import MailAttachment, MailDraft, MailMessage

from .draft_fixtures import SIGNATURE, URL, DraftFixture
from .gmail_fake import gmail_message

SIGNED = f"<p></p><div data-revenact-signature>{SIGNATURE}</div>"


class PrefillTests(DraftFixture):
    def test_a_new_message_carries_the_signature_and_nothing_else(self):
        response = self.compose("new")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data,
            {
                "kind": "new",
                "source_message_id": None,
                "from": {"name": "Dana Ruiz", "address": "dana@acme.io"},
                "to": [],
                "cc": [],
                "bcc": [],
                "subject": "",
                "html": SIGNED,
                "signature_html": SIGNATURE,
                "forwarded": [],
                "record": None,
                "suggested_record": None,
                "total_bytes": len(SIGNED.encode()) + len("-- \nDana Ruiz\nAcme".encode()),
                "max_bytes": 26_214_400,
            },
        )
        self.assertFalse(MailDraft.objects.exists())

    def test_a_reply_goes_to_the_sender_under_re_with_the_quote_below_the_signature(self):
        data = self.compose("reply", self.quote).data
        self.assertEqual(data["source_message_id"], self.quote.pk)
        self.assertEqual((data["to"], data["cc"]), ([["Ann Lee", "ann@pizzahut.com"]], []))
        self.assertEqual(data["subject"], "Re: Renewal quote")
        self.assertTrue(data["html"].startswith(SIGNED + '<div class="gmail_quote">On '))
        self.assertIn("Ann Lee &lt;ann@pizzahut.com&gt; wrote:<blockquote>", data["html"])
        pizza = {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        self.assertEqual((data["record"], data["suggested_record"]), (pizza, pizza))

    def test_reply_to_wins_over_the_sender(self):
        MailMessage.objects.filter(pk=self.quote.pk).update(
            reply_to=[["Renewals", "renewals@pizzahut.com"]]
        )
        self.assertEqual(
            self.compose("reply", self.quote).data["to"], [["Renewals", "renewals@pizzahut.com"]]
        )

    def test_reply_all_adds_everyone_else_once_to_over_cc_and_never_me(self):
        MailMessage.objects.filter(pk=self.quote.pk).update(
            to=[["Dana Ruiz", "dana@acme.io"], ["Ops", "OPS@pizzahut.com"]],
            cc=[["", "ops@pizzahut.com"], ["Sam Pizza", "sam@pizzahut.com"]],
        )
        data = self.compose("reply_all", self.quote).data
        self.assertEqual(data["to"], [["Ann Lee", "ann@pizzahut.com"], ["Ops", "ops@pizzahut.com"]])
        self.assertEqual(data["cc"], [["Sam Pizza", "sam@pizzahut.com"]])

    def test_replying_to_my_own_message_goes_to_its_recipients(self):
        mine, _ = gmail_store.store_gmail(
            self.mailbox,
            gmail_message(
                "me1",
                labels=["SENT"],
                sender="Dana Ruiz <dana@acme.io>",
                to="Ann Lee <ann@pizzahut.com>",
                subject="RE: Renewal quote",
            ),
            now=self.now,
        )
        data = self.compose("reply", mine).data
        self.assertEqual(data["to"], [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual(data["subject"], "RE: Renewal quote")

    def test_a_forward_keeps_the_files_and_names_the_original(self):
        data = self.compose("forward", self.quote).data
        self.assertEqual((data["to"], data["cc"], data["subject"]), ([], [], "Fwd: Renewal quote"))
        for line in (
            "---------- Forwarded message ---------",
            "From: Ann Lee &lt;ann@pizzahut.com&gt;",
            "Subject: Renewal quote",
            "To: Dana Ruiz &lt;dana@acme.io&gt;",
            "Cc: Sam Pizza &lt;sam@pizzahut.com&gt;",
        ):
            self.assertIn(line, data["html"])
        pdf = MailAttachment.objects.get(message=self.quote, part_id="1")
        self.assertEqual(
            data["forwarded"],
            [
                {
                    "id": pdf.pk,
                    "filename": "Renewal quote.pdf",
                    "mime_type": "application/pdf",
                    "size": 182311,
                    "origin": "forward",
                    "download_url": f"/api/v1/mail/attachments/{pdf.pk}/download/",
                }
            ],
        )
        self.assertIsNone(data["record"])
        self.assertGreater(data["total_bytes"], 182311)
        self.assertEqual(data["max_bytes"], 26_214_400)
        # The forwarded original is wrapped like a reply's quote, so the editor folds it.
        self.assertIn('<div class="gmail_quote">---------- Forwarded message', data["html"])

    def test_the_subject_prefixes(self):
        for kind, subject, expected in (
            ("reply", "re: Terms", "re: Terms"),
            ("reply_all", "Terms", "Re: Terms"),
            ("forward", "FW: Terms", "FW: Terms"),
            ("forward", "Fwd: Terms", "Fwd: Terms"),
            ("forward", "Re: Terms", "Fwd: Re: Terms"),
            ("new", "Terms", ""),
        ):
            with self.subTest(kind=kind, subject=subject):
                self.assertEqual(compose.subject_for(kind, subject), expected)

    def test_six_queries_for_a_forward(self):
        self.compose("forward", self.quote)
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.compose("forward", self.quote).status_code, 200)
        self.assertLessEqual(len(queries), 6)


class RefusalTests(DraftFixture):
    def test_kind_and_message_are_checked_first(self):
        response = self.client.get(f"{URL}compose/?kind=answer")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"kind": ["Choose new, reply, reply_all or forward."]}),
        )
        response = self.client.get(f"{URL}compose/?kind=reply")
        self.assertEqual(response.data, {"message": ["Choose a message to answer."]})

    def test_someone_elses_message_is_missing_even_for_their_manager(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.compose("reply", self.quote).status_code, 404)

    def test_a_drafts_message_cannot_be_answered(self):
        MailDraft.objects.create(
            connection=self.mailbox,
            owner=self.dana,
            organisation=self.org,
            kind="new",
            message=self.quote,
        )
        response = self.compose("reply", self.quote)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "IS_DRAFT", "detail": "This message is a draft."}),
        )

    def test_the_connection_checks(self):
        self.mailbox.granted_scopes = ["https://www.googleapis.com/auth/gmail.readonly"]
        self.mailbox.save(update_fields=["granted_scopes"])
        response = self.compose("reply", self.quote)
        self.assertEqual((response.status_code, response.data["code"]), (409, "TWO_WAY_OFF"))
        self.assertTrue(response.data["needs_reconnect"])
        self.mailbox.provider = "imap"
        self.mailbox.save(update_fields=["provider"])
        response = self.compose("new")
        self.assertEqual((response.status_code, response.data["code"]), (400, "GMAIL_ONLY"))
        self.mailbox.delete()
        response = self.compose("new")
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))

    def test_a_paused_mailbox_still_prefills(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(self.compose("reply", self.quote).status_code, 200)


class SuggestionTests(DraftFixture):
    def test_a_contact_then_an_account_domain_then_an_organisation_domain(self):
        org = self.org.pk
        Contact.objects.create(customer=self.pizza, name="Kim", email="kim@else.io")
        self.assertEqual(
            compose.match(org, ["KIM@else.io"]),
            compose.Record("customer", self.pizza.pk, "Pizza Hut"),
        )
        self.assertEqual(
            compose.match(org, ["x@apac.pizzahut.com"]),
            compose.Record("account", self.apac.pk, "APAC"),
        )
        self.assertEqual(compose.match(org, ["x@nowhere.io", "y@pizzahut.com"]).id, self.pizza.pk)
        self.assertIsNone(compose.match(org, ["x@gmail.com"]))
        self.assertIsNone(compose.match(org, []))

    def test_two_queries_whatever_the_number_of_recipients(self):
        org = self.org.pk
        with CaptureQueriesContext(db) as one:
            compose.match(org, ["a@else.io"])
        with CaptureQueriesContext(db) as many:
            compose.match(org, [f"p{n}@else{n}.io" for n in range(30)])
        self.assertEqual(len(one), len(many))
        self.assertLessEqual(len(many), 2)

    def test_a_record_the_owner_may_not_open_is_never_named(self):
        ed = User.objects.create_user(
            email="ed@acme.io", password=None, name="Ed", organisation=self.org
        )
        pizza = compose.Record("customer", self.pizza.pk, "Pizza Hut")
        self.assertEqual(compose.visible(ed, pizza, None), [None, None])
        self.assertEqual(compose.visible(self.dana, pizza), [pizza])
        self.assertIsNone(compose.lookup(ed, pizza))
        self.assertEqual(
            compose.lookup(self.dana, compose.Record("customer", self.pizza.pk, "")), pizza
        )
