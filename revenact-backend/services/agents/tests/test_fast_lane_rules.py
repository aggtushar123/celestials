"""Round 2 D3 contract §5.3, R2D3-13 to R2D3-15: which rule makes a thread
urgent, decided at sync, never by a model; nothing while the lane is off."""

from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents import fast_lane, threads
from services.agents.tests.drafts_fixtures import inbound, mailbox
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Customer, Ticket


class RuleTests(IntakeFixture):
    def lane(self, **rules):
        self.org.ai_fast_lane = {"on": True, "rules": rules}
        self.org.save(update_fields=["ai_fast_lane"])

    def ticket(
        self, connector, *, title="Hello", priority="medium", email="ann@pizzahut.com", record=None
    ):
        return Ticket.objects.create(
            customer=record or self.pizza,
            connector=connector,
            department=connector.department,
            external_id=f"T-{Ticket.objects.count() + 1}",
            ticket_number="T-1",
            title=title,
            description="",
            priority=priority,
            assignee_name="Unassigned",
            requester_email=email,
            opened_at=self.today,
        )

    def touched(self, ticket):
        ticket.connector.refresh_from_db()
        return threads.touch_ticket(ticket).urgent_rule

    def test_off_means_never_urgent(self):
        jira = self.connector("jira", "cs")
        self.assertEqual(self.touched(self.ticket(jira, priority="critical")), "")

    def test_jira_top_priority(self):
        self.lane()
        jira = self.connector("jira", "cs")
        self.assertEqual(self.touched(self.ticket(jira, priority="critical")), "jira_priority")
        self.assertEqual(self.touched(self.ticket(jira, priority="high")), "")

    def test_a_named_slack_channel_a_sender_and_a_word(self):
        slack = self.connector("slack", "cs")
        jira = self.connector("jira", "cs")
        self.lane(
            slack_connectors=[slack.pk],
            senders=["@bigco.com"],
            words=["outage"],
            jira_priority=False,
        )
        self.assertEqual(self.touched(self.ticket(slack)), "slack_channel")
        self.assertEqual(self.touched(self.ticket(jira, email="ceo@bigco.com")), "sender")
        self.assertEqual(self.touched(self.ticket(jira, title="Total OUTAGE now")), "word")
        self.assertEqual(self.touched(self.ticket(jira, title="outages report")), "")

    def test_a_customer_in_poor_health(self):
        self.lane(poor_health=True, jira_priority=False)
        Customer.objects.filter(pk=self.deals.pk).update(health_score=Decimal("2.0"))
        self.deals.refresh_from_db()
        jira = self.connector("jira", "cs")
        self.assertEqual(self.touched(self.ticket(jira, record=self.deals)), "poor_health")
        self.assertEqual(self.touched(self.ticket(jira)), "")

    def test_a_quieter_message_clears_it(self):
        self.lane(words=["outage"])
        jira = self.connector("jira", "cs")
        ticket = self.ticket(jira, title="outage")
        self.assertEqual(self.touched(ticket), "word")
        Ticket.objects.filter(pk=ticket.pk).update(title="All fine now")
        ticket.refresh_from_db()
        self.assertEqual(self.touched(ticket), "")

    def test_a_filed_email_from_a_named_sender(self):
        self.lane(senders=["ann@x.com"])
        mailbox(self.pizza.owner)
        email = inbound(self.pizza, self.pizza.owner)
        self.assertEqual(threads.touch_mail(email).urgent_rule, "sender")
        self.assertEqual(fast_lane.for_email(email), "sender")

    def test_an_older_backfilled_email_neither_sets_nor_clears_it(self):
        """R2D3-15: urgent_rule follows the thread's newest message."""
        self.lane(senders=["boss@x.com"])
        mailbox(self.pizza.owner)
        newest = inbound(self.pizza, self.pizza.owner, hours=1, message_id="<m2@x.com>")
        self.assertEqual(threads.touch_mail(newest).urgent_rule, "")
        older = inbound(self.pizza, self.pizza.owner, hours=5, sender=("Boss", "boss@x.com"))
        self.assertEqual(threads.touch_mail(older).urgent_rule, "")
        urgent = inbound(
            self.pizza,
            self.pizza.owner,
            hours=0,
            sender=("Boss", "boss@x.com"),
            message_id="<m3@x.com>",
        )
        self.assertEqual(threads.touch_mail(urgent).urgent_rule, "sender")
        quiet_older = inbound(self.pizza, self.pizza.owner, hours=6, message_id="<m4@x.com>")
        self.assertEqual(threads.touch_mail(quiet_older).urgent_rule, "sender")

    def test_a_filed_email_with_the_lane_off(self):
        mailbox(self.pizza.owner)
        email = inbound(self.pizza, self.pizza.owner)
        self.assertEqual(threads.touch_mail(email).urgent_rule, "")

    def test_jira_priority_is_jira_only(self):
        self.lane()
        slack = self.connector("slack", "cs")
        self.assertEqual(self.touched(self.ticket(slack, priority="critical")), "")

    def test_the_record_is_read_only_when_poor_health_needs_it(self):
        self.lane(words=["outage"])
        jira = self.connector("jira", "cs")
        ticket = Ticket.objects.get(pk=self.ticket(jira, title="outage").pk)
        ticket.connector.organisation  # loaded before counting
        with CaptureQueriesContext(connection) as queries:
            fast_lane.for_ticket(ticket)
        self.assertFalse(
            [
                q
                for q in queries
                if "customers_customer" in q["sql"] or "customers_account" in q["sql"]
            ]
        )
