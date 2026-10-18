"""Slack escalations D4, SE4-16, SE4-7: a reply we posted as a person reads as
ours, and a stored conversation follows its channel's shared flag. D3 holds
the tests of record for the rest of the rule (one implementation, `is_ours`):
a top message carrying our key is never a thread
(test_slack_channels_provider: a page keeps only people's top messages) and
our reply as a person is stored but never wakes the agent while a person's
own reply does (test_slack_catchup: a reply made through our app wakes
nothing)."""

from django.test import SimpleTestCase
from django.utils import timezone

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import sync
from services.connectors.models import SlackChannel
from services.connectors.providers.base import RemoteThread
from services.connectors.providers.slack import METADATA_TYPE
from services.connectors.tests.slack_fake import use_slack
from services.connectors.tests.test_slack_threads import fetch
from services.customers.models import SlackConversation
from services.customers.tests.slack_fixtures import conversation, msg

CONFIG = {"channel": "C0SUPPORT", "channel_name": "support", "bot_name": "revenact"}
CREDS = {"bot_token": "xoxb-test-only"}
OURS = {"event_type": METADATA_TYPE, "event_payload": {"key": "rv-b1-s4"}}


class ProviderTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)

    def test_a_reply_we_posted_as_a_person_reads_as_via_the_app(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Globex exports fail")
        mine = f"{float(top) + 0.5:.6f}"
        self.slack.channels["C0SUPPORT"].append(
            {
                "ts": mine,
                "user": "U0FAIZ",
                "text": "Logged as KAN-2.",
                "thread_ts": top,
                "metadata": OURS,
            }
        )
        self.slack.say("C0SUPPORT", "U0ANN", "Thanks!", thread_ts=top)
        (thread,), _, _ = fetch(CONFIG, CREDS)
        self.assertEqual(
            [(r["text"], r["bot"], r.get("via_app", False)) for r in thread.replies],
            [("Logged as KAN-2.", False, True), ("Thanks!", False, False)],
        )
        self.assertNotIn("via_app", thread.replies[1])


class SyncTests(OutsideFixture):
    def remote(self, made, replies):
        return RemoteThread(
            thread_ts=made.thread_ts,
            channel=made.channel,
            text=made.messages[0]["text"],
            user_id="U0FAIZ",
            user_name="Faiz Jamal",
            user_email="faiz@example.com",
            posted_at=timezone.now(),
            latest_reply=replies[-1]["ts"],
            replies=replies,
            url=made.url,
        )

    def test_a_stored_conversation_follows_its_channel_s_shared_flag(self):
        connector = self.slack_connector()
        # D3 (SC3-12): the flag is the channel row's, no longer the connection's
        SlackChannel.objects.filter(connector=connector, channel_id="C0SUPPORT").update(
            external_shared=True
        )
        made = conversation(
            self.pizza,
            connector,
            thread_ts="1792041400.000100",
            messages=[msg("1792041400.000100")],
        )
        self.assertFalse(made.external_shared)
        sync.file_conversation(
            connector, self.remote(made, [msg("1792041450.000100")]), [], now=timezone.now()
        )
        self.assertTrue(SlackConversation.objects.get(pk=made.pk).external_shared)
