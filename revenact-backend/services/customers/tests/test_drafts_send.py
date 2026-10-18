"""POST /communications/drafts/<id>/send/ (contract): the owner sends an
email draft from their own connected mailbox, to its `to`, filed on its
record and threaded on its source; the errors in the contract's order."""

from unittest.mock import patch

from django.db import DatabaseError, connection

from core.models import AuditEvent
from services.agents.tests.drafts_fixtures import draft, inbound, mailbox, share, ticket
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Email, ReplyDraft
from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError
from services.mail.tests.test_mail import FakeProvider

URL = "/api/v1/communications/drafts/"


class Refusing(FakeProvider):
    def send(self, creds, *, to, subject, body, in_reply_to=""):
        raise ProviderError("the grant has expired", reauth=True)


class DraftSendTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.connection = mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.issue = ticket(cls.pizza)

    def setUp(self):
        FakeProvider.queued, FakeProvider.sent, FakeProvider.replied_to = [], [], []
        for target, options in (
            (
                "services.customers.classification.get_completion",
                {"side_effect": CopilotNotConfigured("no model in tests")},
            ),
            ("services.mail.sync.get_provider", {"return_value": FakeProvider()}),
        ):
            patcher = patch(target, **options)
            patcher.start()
            self.addCleanup(patcher.stop)

    def send(self, user, mine, body=None):
        return self.client_for(user).post(f"{URL}{mine.pk}/send/", body or {}, format="json")

    def test_the_owner_sends_it_from_their_mailbox_threaded_on_its_source(self):
        mine = draft(self.mail, self.csm)
        response = self.send(self.csm, mine, {"body": "Hi Ann, two years it is."})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["draft"]["status"], "sent")
        self.assertEqual(response.data["draft"]["sent_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertTrue(response.data["draft"]["edited"])
        sent = Email.objects.get(pk=response.data["email"]["id"])
        self.assertEqual(
            (sent.direction, sent.mailbox_owner, sent.customer, sent.body),
            ("sent", self.csm, self.pizza, "Hi Ann, two years it is."),
        )
        self.assertEqual(set(response.data["email"]), {"id", "subject", "sent_at", "thread_id"})
        self.assertEqual(
            FakeProvider.sent[-1][1:],
            (["ann@x.com"], "Re: Renewal terms", "Hi Ann, two years it is."),
        )
        self.assertEqual(FakeProvider.replied_to[-1], "<m1@x.com>")
        mine.refresh_from_db()
        self.assertEqual(mine.sent_email, sent)
        actions = list(AuditEvent.objects.order_by("pk").values_list("action", flat=True))
        self.assertEqual(
            [a for a in actions if a.startswith(("reply_draft", "mailbox"))],
            ["reply_draft.edited", "reply_draft.sent", "mailbox.reply"],
        )
        self.assertEqual(
            AuditEvent.objects.get(action="reply_draft.sent").metadata, {"email": sent.pk}
        )

    def test_errors_in_order(self):
        mine = draft(self.mail, self.csm)
        self.assertEqual(self.send(self.other, mine).status_code, 404)
        # Mail is owner-only (2026-10-17): Carl's manager can't read it either...
        self.assertEqual(self.send(self.mona, mine).status_code, 404)
        share(self.mail)  # ...nor once he adds it to Revenact: his unsent reply stays his.
        self.assertEqual(self.send(self.mona, mine).status_code, 404)
        response = self.send(self.csm, draft(self.issue, self.csm))
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {
                    "code": "WRONG_CHANNEL",
                    "detail": "Copy a ticket reply into its source and mark it sent.",
                },
            ),
        )
        response = self.send(self.csm, mine, {"body": " "})
        self.assertEqual(
            (response.status_code, response.data), (400, {"body": ["Write the reply."]})
        )
        MailboxConnection.objects.filter(pk=self.connection.pk).update(status="error")
        response = self.send(self.csm, mine)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "NO_MAILBOX", "detail": "Connect your mailbox to send this."}),
        )
        ReplyDraft.objects.filter(pk=mine.pk).update(status="sent")
        response = self.send(self.csm, mine)
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))
        self.assertEqual(FakeProvider.sent, [])

    def test_a_provider_refusal_is_502_and_a_lost_grant_flags_the_mailbox(self):
        mine = draft(self.mail, self.csm)
        with patch("services.mail.sync.get_provider", return_value=Refusing()):
            response = self.send(self.csm, mine, {"body": "Edited first."})
        self.assertEqual(
            (response.status_code, response.data),
            (502, {"detail": "Your mailbox didn't accept the message. Try again."}),
        )
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.status, "error")
        mine.refresh_from_db()
        # The edit was saved first; the draft is still open.
        self.assertEqual((mine.status, mine.body), ("open", "Edited first."))
        self.assertFalse(Email.objects.filter(direction="sent").exists())

    def test_the_claim_is_committed_before_the_provider_is_called(self):
        mine = draft(self.mail, self.csm)
        before = mine.updated_at
        seen, blocks = [], []

        class Watching(FakeProvider):
            def send(self, creds, **message):
                claimed = ReplyDraft.objects.get(pk=mine.pk)
                seen.append((claimed.status, claimed.updated_at > before))
                # No atomic block of the view's is open around the provider.
                blocks.append(len(connection.atomic_blocks))
                return super().send(creds, **message)

        baseline = len(connection.atomic_blocks)
        with patch("services.mail.sync.get_provider", return_value=Watching()):
            response = self.send(self.csm, mine)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(seen, [("sending", True)])
        self.assertEqual(blocks, [baseline])
        mine.refresh_from_db()
        self.assertEqual(mine.status, "sent")

    def test_a_refusal_puts_it_back_to_open(self):
        mine = draft(self.mail, self.csm)
        claimed = []

        class Busy(FakeProvider):
            # Not a lost grant: the mailbox stays connected, to send again.
            def send(self, creds, **message):
                claimed.append(ReplyDraft.objects.get(pk=mine.pk).updated_at)
                raise ProviderError("try later")

        with patch("services.mail.sync.get_provider", return_value=Busy()):
            self.assertEqual(self.send(self.csm, mine).status_code, 502)
        mine.refresh_from_db()
        self.assertEqual(mine.status, "open")
        # The reset stamps the row too.
        self.assertGreater(mine.updated_at, claimed[0])
        self.assertEqual(self.send(self.csm, mine).status_code, 200)

    def test_a_failure_after_the_provider_accepted_never_sends_twice(self):
        mine = draft(self.mail, self.csm)
        with (
            patch(
                "services.customers.drafts_views.send_email",
                side_effect=DatabaseError("filing failed"),
            ),
            self.assertRaises(DatabaseError),
        ):
            self.send(self.csm, mine)
        mine.refresh_from_db()
        self.assertEqual(mine.status, "sending")
        again = self.send(self.csm, mine)
        self.assertEqual((again.status_code, again.data["code"]), (409, "ALREADY_SENT"))
        self.assertEqual(FakeProvider.sent, [])
