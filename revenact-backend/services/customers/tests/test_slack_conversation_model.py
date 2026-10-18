"""Slack escalations D1 contract §1.1, SE1-2, SE1-15: one row per thread,
on exactly one record, read department-wise."""

from django.db import IntegrityError, transaction

from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import SlackConversation
from services.customers.personal import visible_conversations
from services.customers.tests.slack_fixtures import conversation


class SlackConversationModelTests(IntakeFixture):
    def test_one_row_per_thread_of_a_connection(self):
        slack = self.connector("slack", "cs")
        conversation(self.pizza, slack, thread_ts="1.1")
        with self.assertRaises(IntegrityError), transaction.atomic():
            conversation(self.pizza, slack, thread_ts="1.1")
        # A removed connection keeps its history: two rows with no connector may share a ts.
        conversation(self.pizza, None, thread_ts="2.1")
        conversation(self.pizza, None, thread_ts="2.1")

    def test_exactly_one_parent(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            SlackConversation.objects.create(
                channel="C1", thread_ts="3.1", title="x", last_message_at=self.pizza.created_at
            )

    def test_the_record_is_the_account_when_set(self):
        on_account = conversation(self.emea)
        self.assertEqual(on_account.record, self.emea)
        on_customer = conversation(self.pizza)
        self.assertEqual(on_customer.record, self.pizza)

    def test_read_by_its_department_and_leadership(self):
        cs = conversation(self.pizza, self.connector("slack", "cs"))
        engineering = conversation(self.pizza, self.connector("slack", "engineering"))
        everyone = conversation(self.pizza, self.connector("slack", ""))
        rows = SlackConversation.objects.all()
        self.assertEqual(set(visible_conversations(self.csm, rows)), {cs, everyone})  # Carl is CS
        self.assertEqual(set(visible_conversations(self.erin, rows)), {engineering, everyone})
        self.assertEqual(set(visible_conversations(self.admin, rows)), {cs, engineering, everyone})
