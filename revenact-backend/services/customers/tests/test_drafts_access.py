"""Who may read a reply draft (contract): its owner, and anyone who may
open its record and read its source (a reply to mail: its mailbox owner
alone, shared or not; a ticket's: its department). Everyone else: 404.
And the ReplyDraft shape."""

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from services.agents.tests.drafts_fixtures import draft, inbound, mailbox, ticket
from services.agents.tests.fixtures import AgentsFixture
from services.customers.drafts import clean_edits, draft_payload, readable_drafts


class DraftAccessTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.email_draft = draft(cls.mail, cls.csm)
        cls.issue = ticket(cls.pizza, department="engineering")
        cls.ticket_draft = draft(cls.issue, cls.csm)

    def ids(self, user):
        return set(readable_drafts(user).values_list("id", flat=True))

    def test_who_reads_which(self):
        # Carl owns both, even the Engineering ticket's.
        self.assertEqual(self.ids(self.csm), {self.email_draft.pk, self.ticket_draft.pk})
        # Mona is above Carl, but mail is owner-only (2026-10-17); and she is
        # in CS (not Engineering's tickets).
        self.assertEqual(self.ids(self.mona), set())
        # Alice reads every department (Leadership) but not Carl's mail.
        self.assertEqual(self.ids(self.admin), {self.ticket_draft.pk})
        # Dana can't open Pizza Hut; Gus is another workspace.
        self.assertEqual(self.ids(self.other), set())
        self.assertEqual(self.ids(self.stranger), set())
        # Carl adds the email to Revenact: the conversation is shared, his
        # unsent reply is still his alone.
        type(self.mail).objects.filter(pk=self.mail.pk).update(shared_at=timezone.now())
        self.assertEqual(self.ids(self.mona), set())
        self.assertEqual(self.ids(self.admin), {self.ticket_draft.pk})

    def test_another_workspaces_tickets_do_not_matter(self):
        # Alice reads every department, but only her own workspace's tickets.
        foreign = ticket(self.globex, number="G-1")
        stray = draft(ticket(self.pizza, number="TKT-2"), self.csm)
        type(stray).objects.filter(pk=stray.pk).update(ticket=foreign)
        self.assertEqual(self.ids(self.admin), {self.ticket_draft.pk})
        self.assertIn(stray.pk, self.ids(self.csm))

    def test_no_distinct_in_the_rule(self):
        self.assertNotIn("DISTINCT", str(readable_drafts(self.mona).query).upper())

    def test_the_email_draft_payload(self):
        data = draft_payload(self.email_draft, self.csm)
        self.assertEqual(
            set(data),
            {
                "id",
                "channel",
                "status",
                "sending",
                "record",
                "source",
                "to",
                "subject",
                "body",
                "agent",
                "agent_action_id",
                "mail_draft_id",
                "owner",
                "edited",
                "created_at",
                "updated_at",
                "sent_at",
                "sent_by",
                "can_edit",
                "can_resolve",
            },
        )
        self.assertEqual(
            data["record"], {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(
            {k: v for k, v in data["source"].items() if k != "sent_at"},
            {
                "kind": "email",
                "id": self.mail.pk,
                "subject": "Renewal terms",
                "from": {"name": "Ann Lee", "address": "ann@x.com"},
            },
        )
        self.assertEqual(data["to"], [["Ann Lee", "ann@x.com"]])
        self.assertEqual(
            (data["subject"], data["status"], data["edited"]), ("Re: Renewal terms", "open", False)
        )
        self.assertEqual(data["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertTrue(data["can_edit"])
        self.assertFalse(draft_payload(self.email_draft, self.mona)["can_edit"])
        self.assertTrue(data["created_at"].endswith("Z"))

    def test_the_ticket_draft_payload(self):
        data = draft_payload(self.ticket_draft, self.csm)
        self.assertEqual(
            data["source"],
            {
                "kind": "ticket",
                "id": self.issue.pk,
                "number": "TKT-1042",
                "title": "Export fails",
                "external_url": None,
                "source_name": None,
            },
        )
        self.assertEqual((data["to"], data["subject"]), (None, None))

    def test_edits_are_checked_all_at_once(self):
        with self.assertRaises(ValidationError) as caught:
            clean_edits(self.email_draft, {"body": " ", "subject": "x" * 256})
        self.assertEqual(
            caught.exception.detail,
            {
                "body": ["Write the reply."],
                "subject": ["Keep the subject under 255 characters."],
            },
        )
        with self.assertRaises(ValidationError) as caught:
            clean_edits(self.ticket_draft, {"body": "x" * 20_001, "subject": "Re"})
        self.assertEqual(
            caught.exception.detail,
            {
                "body": ["Keep the reply under 20,000 characters."],
                "subject": ["A ticket reply has no subject."],
            },
        )
        with self.assertRaises(ValidationError) as caught:
            clean_edits(self.email_draft, ["body"])
        self.assertEqual(
            caught.exception.detail, {"non_field_errors": ["Send the fields as one object."]}
        )
        self.assertEqual(clean_edits(self.email_draft, {"body": "Hi"}), {"body": "Hi"})
