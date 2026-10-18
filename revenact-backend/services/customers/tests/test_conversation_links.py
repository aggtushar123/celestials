"""SE4-17: the Slack thread's own route names its tickets under the same rule."""

from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Account, Ticket
from services.customers.tests.slack_fixtures import conversation

URL = "/api/v1/slack-conversations/{}/"


class ThreadTicketsTests(IntakeFixture):
    def test_the_thread_names_its_tickets_and_counts_the_rest(self):
        made = conversation(self.pizza, self.connector("slack", "cs"))
        mine = Ticket.objects.create(
            customer=self.pizza,
            title="Exports",
            ticket_number="KAN-2",
            assignee_name="Unassigned",
            priority="high",
            opened_at=self.today,
            department="cs",
            conversation=made,
            external_url="https://alfiee.atlassian.net/browse/KAN-2",
        )
        Ticket.objects.create(
            customer=self.pizza,
            title="Exports",
            ticket_number="ENG-9",
            assignee_name="Erin",
            priority="high",
            opened_at=self.today,
            department="engineering",
            conversation=made,
        )
        body = self.client_for(self.csm).get(URL.format(made.pk)).json()
        self.assertEqual(
            body["tickets"],
            [
                {
                    "id": mine.pk,
                    "number": "KAN-2",
                    "status": "open",
                    "assignee": None,
                    "url": "https://alfiee.atlassian.net/browse/KAN-2",
                }
            ],
        )
        self.assertEqual(body["hidden_links"], 1)

    def test_a_ticket_on_another_record_is_counted_never_named(self):
        # The thread on the organisation, its ticket on one of its accounts:
        # the same department, but another record.
        account = Account.objects.create(name="EMEA")
        account.customers.add(self.pizza)
        made = conversation(self.pizza, self.connector("slack", "cs"))
        Ticket.objects.create(
            account=account,
            title="Exports",
            ticket_number="KAN-3",
            assignee_name="Erin",
            priority="high",
            opened_at=self.today,
            department="cs",
            conversation=made,
        )
        body = self.client_for(self.csm).get(URL.format(made.pk)).json()
        self.assertEqual((body["tickets"], body["hidden_links"]), ([], 1))
