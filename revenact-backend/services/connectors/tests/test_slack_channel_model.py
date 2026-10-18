"""Slack escalations D3, contract §1, SC3-2, SC3-10: a connection's channels,
one row each, at most one record; two channels may hold the same ts; an
agent thread's key carries its channel."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.agents import threads
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel
from services.customers.models import Account
from services.customers.tests.slack_fixtures import conversation


class SlackChannelModelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector(channel_row=False)

    def test_one_row_per_channel_of_a_connection(self):
        SlackChannel.objects.create(connector=self.support, channel_id="C0SUPPORT", name="support")
        with self.assertRaises(IntegrityError), transaction.atomic():
            SlackChannel.objects.create(
                connector=self.support, channel_id="C0SUPPORT", name="again"
            )
        self.assertEqual(self.support.slack_channels.count(), 1)

    def test_defaults_and_its_record(self):
        row = SlackChannel.objects.create(connector=self.support, channel_id="C0NEW", name="new")
        self.assertEqual(
            (
                row.included,
                row.is_member,
                row.external_shared,
                row.is_archived,
                row.record,
                row.missed,
                row.walk_before,
                row.read_at,
                row.event_at,
            ),
            (True, False, False, False, None, [], "", None, None),
        )
        row.customer = self.pizza
        row.save()
        self.assertEqual(row.record, self.pizza)

    def test_never_both_a_customer_and_an_account(self):
        account = Account.objects.create(name="Pizza EMEA")
        account.customers.add(self.pizza)
        with self.assertRaises(IntegrityError), transaction.atomic():
            SlackChannel.objects.create(
                connector=self.support,
                channel_id="C0BOTH",
                name="both",
                customer=self.pizza,
                account=account,
            )

    def test_two_channels_may_hold_the_same_ts(self):
        conversation(self.pizza, self.support, thread_ts="1792041400.000100", channel="C0SUPPORT")
        conversation(self.pizza, self.support, thread_ts="1792041400.000100", channel="C0OTHER")
        with self.assertRaises(IntegrityError), transaction.atomic():
            conversation(
                self.pizza, self.support, thread_ts="1792041400.000100", channel="C0SUPPORT"
            )

    def test_an_agent_thread_s_key_carries_its_channel(self):
        made = conversation(
            self.pizza, self.support, thread_ts="1792041400.000100", channel="C0SUPPORT"
        )
        thread = threads.touch_conversation(made, timezone.now())
        self.assertEqual(thread.external_id, f"{self.support.pk}:C0SUPPORT:1792041400.000100")
