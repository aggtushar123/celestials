"""Slack escalations D3, SC3-10: matching a waiting Slack row makes its
conversation in the row's own channel, named and flagged as that channel."""

from django.utils import timezone

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import unmatched
from services.connectors.models import SlackChannel, UnmatchedItem
from services.customers.models import SlackConversation

MATCH = "/api/v1/work/unmatched/{}/match/"


class UnmatchedChannelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        SlackChannel.objects.create(
            connector=self.support,
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            external_shared=True,
        )

    def row(self, external_id):
        now = timezone.now()
        return UnmatchedItem.objects.create(
            organisation=self.org,
            connector=self.support,
            provider="slack",
            department=self.support.department,
            external_id=external_id,
            number="#escalations",
            title="Exports fail",
            excerpt="Exports fail",
            requester_name="Faiz Jamal",
            opened_on=now.date(),
            first_seen_at=now,
            last_seen_at=now,
        )

    def test_the_key_says_which_channel(self):
        self.assertEqual(
            unmatched.split_slack_key(self.row("C0ESCALATE:1792041400.000100")),
            ("C0ESCALATE", "1792041400.000100"),
        )
        # a row kept before D3: its connection's one channel
        self.assertEqual(
            unmatched.split_slack_key(self.row("1792041401.000100")),
            ("C0SUPPORT", "1792041401.000100"),
        )

    def test_a_match_makes_the_conversation_in_that_channel(self):
        row = self.row("C0ESCALATE:1792041400.000100")
        answer = self.client_for(self.csm).post(
            MATCH.format(row.pk), {"customer_id": self.pizza.pk}, format="json"
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        made = SlackConversation.objects.get()
        self.assertEqual(
            (made.channel, made.channel_name, made.thread_ts, made.external_shared),
            ("C0ESCALATE", "escalations", "1792041400.000100", True),
        )
        self.assertIn("/archives/C0ESCALATE/", made.url)
