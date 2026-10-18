"""ReplyDraft (contract, `/communications/drafts/`): one open draft per
source, its source matches its channel, `edited` is the agent's text
changed, and it never names its text when written down (`str`)."""

from django.db import IntegrityError, transaction

from services.agents.tests.drafts_fixtures import draft, inbound, mailbox, ticket
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import ReplyDraft


class ReplyDraftModelTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.issue = ticket(cls.pizza)

    def test_edited_is_the_agents_text_changed(self):
        mine = draft(self.mail, self.csm)
        self.assertFalse(mine.edited)
        mine.subject = "Re: Renewal terms (two years)"
        self.assertTrue(mine.edited)
        mine.subject, mine.body = mine.written_subject, "Hi Ann, call me."
        self.assertTrue(mine.edited)

    def test_one_open_draft_per_email_and_per_ticket(self):
        draft(self.mail, self.csm)
        draft(self.issue, self.csm)
        for source in (self.mail, self.issue):
            with self.assertRaises(IntegrityError), transaction.atomic():
                draft(source, self.csm)

    def test_a_sent_draft_leaves_room_for_a_new_one(self):
        draft(self.mail, self.csm, status=ReplyDraft.Status.SENT)
        self.assertEqual(draft(self.mail, self.csm).status, "open")

    def test_the_source_matches_the_channel(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ReplyDraft.objects.create(
                organisation=self.org,
                owner=self.csm,
                channel=ReplyDraft.Channel.TICKET,
                customer=self.pizza,
                email=self.mail,
                body="b",
                written_body="b",
                agent="cs",
            )

    def test_its_text_never_reaches_str(self):
        mine = draft(self.mail, self.csm)
        self.assertEqual(str(mine), f"Reply draft {mine.pk}")
        self.assertEqual(mine.record, self.pizza)
