"""The Communications queue names the reader's own open draft on its email
and ticket rows (contract), and nobody else's."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.tests.drafts_fixtures import draft, inbound, mailbox, ticket
from services.agents.tests.fixtures import AgentsFixture

URL = "/api/v1/communications/"


class QueueDraftTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.issue = ticket(cls.pizza)

    def rows(self, user, **params):
        data = self.client_for(user).get(URL, params).data
        return {row["id"]: row for row in data["results"]}

    def test_the_owner_sees_their_open_draft_on_the_row(self):
        mine = draft(self.mail, self.csm)
        on_ticket = draft(self.issue, self.csm)
        rows = self.rows(self.csm)
        self.assertEqual(rows[f"email:{self.mail.pk}"]["draft"]["id"], mine.pk)
        self.assertEqual(rows[f"email:{self.mail.pk}"]["draft"]["agent"], "cs")
        self.assertEqual(rows[f"ticket:{self.issue.pk}"]["draft"]["id"], on_ticket.pk)

    def test_no_draft_for_someone_else_or_once_sent(self):
        draft(self.mail, self.csm, status="sent")
        draft(self.issue, self.csm)
        self.assertIsNone(self.rows(self.csm)[f"email:{self.mail.pk}"]["draft"])
        # Mail is owner-only (2026-10-17): the manager's Team queue doesn't list
        # the report's mail at all, let alone its draft.
        team = self.rows(self.mona, scope="team")
        self.assertNotIn(f"email:{self.mail.pk}", team)
        self.assertIsNone(self.rows(self.mona)[f"ticket:{self.issue.pk}"]["draft"])

    def test_one_query_per_kind_whatever_the_rows(self):
        draft(self.mail, self.csm)

        def count():
            with CaptureQueriesContext(connection) as queries:
                self.client_for(self.csm).get(URL, {"kind": "email"})
            return sum(1 for q in queries if "customers_replydraft" in q["sql"])

        few = count()
        self.assertEqual(few, 1)
        for i in range(4):
            draft(
                inbound(self.pizza, self.csm, thread=f"q{i}", message_id=f"<q{i}@x.com>"), self.csm
            )
        self.assertEqual(count(), few)
