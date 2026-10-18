"""Slack escalations D1 contract §4: one thread, under the story's two rules."""

from services.accounts.models import Organisation
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Customer
from services.customers.tests.slack_fixtures import conversation, msg
from services.customers.tests.test_views import create_account

URL = "/api/v1/slack-conversations/{}/"

# SE1-19: the conversation (with its record and starter) in one read, the
# sign-in's four (organisation, memberships, role, reports) and the record-
# openable check. Pinned so a lazy lookup per message cannot creep in.
# + SE4-17: its tickets, one read.
SLACK_CONVERSATION_QUERIES = 7


class SlackConversationViewTests(IntakeFixture):
    def test_the_thread_oldest_first(self):
        made = conversation(
            self.pizza,
            self.connector("slack", "cs"),
            channel_name="all-alfiee",
            messages=[
                msg("1792041415.357099"),
                msg("1792041500.000100", "revenact", "On it.", bot=True),
            ],
        )
        body = self.client_for(self.csm).get(URL.format(made.pk)).json()
        self.assertEqual(
            body["record"], {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(body["channel"], "#all-alfiee")
        self.assertEqual([m["bot"] for m in body["messages"]], [False, True])
        self.assertEqual(body["messages"][1]["at"], "2026-10-15T05:18:20Z")
        self.assertEqual(set(body["messages"][1]), {"ts", "name", "at", "text", "bot"})
        self.assertNotIn("started_by_email", body)
        self.assertEqual(body["matched_by"], "name")

    def test_mentions_read_as_the_people_they_name(self):
        """CC-14: <@U...> reads "@<name>" from the conversation's people; an
        unknown one stays as written. Nothing stored changes."""
        made = conversation(
            self.pizza,
            self.connector("slack", "cs"),
            title="<@U0FAIZ> exports fail",
            messages=[msg("1792041415.357099", text="<@U0FAIZ> can you take this? <@U0WHO>")],
            people={"U0FAIZ": {"name": "Faiz Jamal", "member": None}},
        )
        body = self.client_for(self.csm).get(URL.format(made.pk)).json()
        self.assertEqual(body["title"], "@Faiz Jamal exports fail")
        self.assertEqual(body["messages"][0]["text"], "@Faiz Jamal can you take this? <@U0WHO>")
        made.refresh_from_db()
        self.assertEqual(made.messages[0]["text"], "<@U0FAIZ> can you take this? <@U0WHO>")

    def test_another_department_reads_it_as_missing(self):
        made = conversation(self.pizza, self.connector("slack", "engineering"))
        response = self.client_for(self.csm).get(URL.format(made.pk))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Not found."})

    def test_a_record_the_reader_cannot_open_reads_as_missing(self):
        made = conversation(self.soup, self.connector("slack", "cs"))  # Mona's Soup Co
        self.assertEqual(self.client_for(self.csm).get(URL.format(made.pk)).status_code, 404)
        self.assertEqual(self.client_for(self.mona).get(URL.format(made.pk)).status_code, 200)

    def test_another_workspace_reads_as_missing(self):
        elsewhere = Customer.objects.create(
            organisation=Organisation.objects.create(name="Elsewhere"), name="Theirs"
        )
        made = conversation(elsewhere)
        response = self.client_for(self.admin).get(URL.format(made.pk))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Not found."})

    def test_the_workspace_is_checked_even_before_the_record(self):
        """M3: defence in depth; the lookup itself stays inside the reader's
        workspace, whatever the record check says."""
        from unittest.mock import patch

        org = Organisation.objects.create(name="Elsewhere")
        theirs = Customer.objects.create(organisation=org, name="Theirs")
        account = create_account(theirs, name="Theirs EMEA")
        client = self.client_for(self.admin)
        with patch("services.customers.slack_views.can_open", return_value=True):
            for parent in (theirs, account):
                with self.subTest(parent=parent):
                    made = conversation(parent)
                    self.assertEqual(client.get(URL.format(made.pk)).status_code, 404)
            ours = conversation(create_account(self.pizza, name="Pizza EMEA"))
            self.assertEqual(client.get(URL.format(ours.pk)).status_code, 200)

    def test_a_long_thread_costs_the_same_queries(self):
        made = conversation(
            self.pizza,
            self.connector("slack", "cs"),
            messages=[msg(f"17920414{i:02d}.000100") for i in range(30)],
        )
        client = self.client_for(self.csm)
        with self.assertNumQueries(SLACK_CONVERSATION_QUERIES):
            self.assertEqual(client.get(URL.format(made.pk)).status_code, 200)
