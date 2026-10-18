"""A draft being sent (contract, delivery 2 follow-up): `sending` is internal;
it reads as sent, takes no edit, is drafted no second time, and holds its
source as an open draft does."""

from django.db import IntegrityError, transaction

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import drafts as draft_kind
from services.agents.kinds import ChangedSince
from services.agents.tests.drafts_fixtures import draft, draft_action, inbound, mailbox
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import ReplyDraft

URL = "/api/v1/communications/drafts/"


class SendingDraftTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)

    def setUp(self):
        self.mine = draft(self.mail, self.csm, status=ReplyDraft.Status.SENDING)

    def test_it_reads_as_sent_with_no_sent_at(self):
        client = self.client_for(self.csm)
        body = client.get(f"{URL}{self.mine.pk}/").data
        self.assertEqual((body["status"], body["sent_at"], body["can_edit"]), ("sent", None, False))
        sent = client.get(URL, {"status": "sent"}).data["results"]
        self.assertEqual([row["id"] for row in sent], [self.mine.pk])
        self.assertEqual(client.get(URL).data["results"], [])
        refused = client.get(URL, {"status": "sending"})
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data, {"status": ["Choose open or sent."]})

    def test_no_write_touches_it(self):
        client = self.client_for(self.csm)
        for response in (
            client.patch(f"{URL}{self.mine.pk}/", {"body": "Changed"}, format="json"),
            client.delete(f"{URL}{self.mine.pk}/"),
            client.post(f"{URL}{self.mine.pk}/send/", {}, format="json"),
        ):
            self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.status, "sending")

    def test_its_source_is_held_and_not_drafted_again(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        self.assertNotIn(self.mail.pk, ctx.emails)
        with self.assertRaises(IntegrityError), transaction.atomic():
            draft(self.mail, self.csm)

    def test_an_agents_undo_calls_it_sent(self):
        action = draft_action(
            self.org, self.mail, status="applied", result={"draft_id": self.mine.pk}
        )
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            draft_kind.REPLY.undo(action, self.csm)
        self.assertEqual(caught.exception.detail, "This draft has been sent.")
