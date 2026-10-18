"""connectors.0010_slack_channels_from_config (SC3-11): a one-channel Slack
connection becomes a connection with that channel, caught up as of the
migration; its single record moves onto the channel; its agent threads and
waiting rows take the new keys."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

BEFORE = [
    ("connectors", "0009_slackchannel"),
    ("customers", "0064_slackconversation_channel_once"),
    ("agents", "0008_slack_tickets_to_conversations"),
]
AFTER = [("connectors", "0010_slack_channels_from_config")]


class SlackChannelsMigrationTests(TransactionTestCase):
    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def world(self, apps, **config):
        Organisation = apps.get_model("accounts", "Organisation")
        Customer = apps.get_model("customers", "Customer")
        Connector = apps.get_model("connectors", "Connector")
        org = Organisation.objects.create(name="Alfiee", currency="USD")
        globex = Customer.objects.create(organisation=org, name="Globex (QA)")
        slack = Connector.objects.create(
            organisation=org,
            provider="slack",
            name="Slack",
            config={"channel": "C0CA7PPRP7A", "channel_name": "all-alfiee", **config},
        )
        return org, globex, slack

    def test_connection_7_keeps_its_channel_threads_and_waiting_rows(self):
        apps = self.migrate(BEFORE)
        org, globex, slack = self.world(apps)
        Conversation = apps.get_model("customers", "SlackConversation")
        Thread = apps.get_model("agents", "SignalThread")
        Unmatched = apps.get_model("connectors", "UnmatchedItem")
        made = Conversation.objects.create(
            customer=globex,
            connector=slack,
            channel="C0CA7PPRP7A",
            channel_name="all-alfiee",
            thread_ts="1792041415.357099",
            title="CSV exports failing",
            last_message_at=timezone.now(),
            matched_by="earlier",
        )
        thread = Thread.objects.create(
            organisation=org,
            source_kind="slack",
            external_id=f"{slack.pk}:1792041415.357099",
            customer=globex,
            conversation=made,
            last_message_at=timezone.now(),
        )
        waiting = Unmatched.objects.create(
            organisation=org,
            connector=slack,
            provider="slack",
            external_id="1792041500.000100",
            number="#all-alfiee",
            opened_on=timezone.localdate(),
            first_seen_at=timezone.now(),
            last_seen_at=timezone.now(),
        )
        before = timezone.now()
        apps = self.migrate(AFTER)
        Channel = apps.get_model("connectors", "SlackChannel")
        row = Channel.objects.get(connector_id=slack.pk)
        self.assertEqual(
            (
                row.channel_id,
                row.name,
                row.included,
                row.is_member,
                row.is_private,
                row.customer_id,
            ),
            ("C0CA7PPRP7A", "all-alfiee", True, True, False, None),
        )
        # SC3-11: the poll already read these 7 days; the catch-up starts from now
        self.assertGreaterEqual(row.read_at, before)
        Thread = apps.get_model("agents", "SignalThread")
        Unmatched = apps.get_model("connectors", "UnmatchedItem")
        self.assertEqual(
            Thread.objects.get(pk=thread.pk).external_id,
            f"{slack.pk}:C0CA7PPRP7A:1792041415.357099",
        )
        self.assertEqual(
            Unmatched.objects.get(pk=waiting.pk).external_id, "C0CA7PPRP7A:1792041500.000100"
        )

    def test_a_connection_set_to_one_customer_hands_it_to_its_channel(self):
        apps = self.migrate(BEFORE)
        org, globex, slack = self.world(apps, external_shared=True)
        slack.customers.add(globex)
        apps = self.migrate(AFTER)
        Channel = apps.get_model("connectors", "SlackChannel")
        Connector = apps.get_model("connectors", "Connector")
        row = Channel.objects.get(connector_id=slack.pk)
        self.assertEqual((row.customer_id, row.external_shared), (globex.pk, True))
        self.assertFalse(Connector.objects.get(pk=slack.pk).customers.exists())

    def test_a_private_channel_stays_and_a_connection_without_one_is_left(self):
        apps = self.migrate(BEFORE)
        org, _, slack = self.world(apps, channel="G0PRIVATE", channel_name="secret")
        Connector = apps.get_model("connectors", "Connector")
        bare = Connector.objects.create(organisation=org, provider="slack", name="New")
        apps = self.migrate(AFTER)
        Channel = apps.get_model("connectors", "SlackChannel")
        self.assertTrue(Channel.objects.get(connector_id=slack.pk).is_private)
        self.assertFalse(Channel.objects.filter(connector_id=bare.pk).exists())
