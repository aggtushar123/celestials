"""Slack escalations D3, SC3-3, SC3-5, SC3-6, SC3-13, SC3-24, SC3-28: the
provider connects without a channel, lists the public channels, joins one,
and reads within Slack's 2025 limits: one history page of 15, one replies
page of 15 after what is stored. One set of message rules serves the
catch-up and the events. Slack is a fake."""

from django.test import SimpleTestCase

from services.connectors.providers.base import ProviderError
from services.connectors.providers.slack import (
    CATCHUP_LIMIT,
    SCOPES,
    SlackProvider,
    is_ours,
    is_top,
)
from services.connectors.tests.slack_fake import use_slack

CONFIG = {"bot_name": "revenact", "bot_id": "B0BOT", "bot_user_id": "U0BOT"}
CREDS = {"bot_token": "xoxb-test-only"}


class ProviderChannelTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)
        self.provider = SlackProvider()

    def test_it_asks_for_channels_join(self):
        self.assertIn("channels:join", SCOPES.split(","))

    def test_connect_needs_only_the_token(self):
        config, creds = self.provider.connect({"bot_token": "xoxb-test-only"})
        self.assertNotIn("channel", config)
        self.assertEqual((config["team_id"], creds), ("T0ACME", CREDS))
        self.assertEqual([f.name for f in self.provider.fields], ["bot_token"])

    def test_it_lists_the_public_channels(self):
        self.slack.channels["C0RANDOM"] = []
        self.slack.names["C0RANDOM"] = "random"
        self.slack.shared.add("C0ESCALATE")
        self.slack.private.add("G0SECRET")
        self.slack.channels["G0SECRET"] = []
        self.assertEqual(
            self.provider.list_channels(CREDS),
            [
                {"id": "C0ESCALATE", "name": "escalations", "member": True, "shared": True},
                {"id": "C0RANDOM", "name": "random", "member": False, "shared": False},
                {"id": "C0SUPPORT", "name": "support", "member": True, "shared": False},
            ],
        )

    def test_it_joins_and_a_refusal_carries_slack_s_code(self):
        self.slack.channels["C0RANDOM"] = []
        self.provider.join_channel(CREDS, "C0RANDOM", timeout=2)
        self.assertIn("C0RANDOM", self.slack.members)
        self.assertIn(("conversations.join", 2), self.slack.timeouts)
        self.slack.channels["C0ODD"] = []
        self.slack.cant_join.add("C0ODD")
        with self.assertRaises(ProviderError) as caught:
            self.provider.join_channel(CREDS, "C0ODD")
        self.assertEqual(caught.exception.code, "method_not_supported_for_channel_type")

    def test_one_history_page_of_fifteen_newest_first_then_below_it(self):
        made = [self.slack.say("C0SUPPORT", "U0FAIZ", f"Pizza Hut issue {n}") for n in range(20)]
        tops, more, lowest = self.provider.read_page(CONFIG, CREDS, channel="C0SUPPORT", oldest="0")
        self.assertEqual(len(tops), CATCHUP_LIMIT)
        self.assertTrue(more)
        self.assertEqual([t["ts"] for t in tops], made[5:])  # oldest first, the newest 15
        self.assertEqual(lowest, made[5])
        rest, more, _ = self.provider.read_page(
            CONFIG, CREDS, channel="C0SUPPORT", oldest="0", latest=lowest
        )
        self.assertEqual(([t["ts"] for t in rest], more), (made[:5], False))
        [call] = [q for name, _b, q in self.slack.calls[-1:] if name == "conversations.history"]
        self.assertEqual(call["limit"], "15")

    def test_a_page_keeps_only_people_s_top_messages(self):
        self.slack.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack.channels["C0SUPPORT"].append(
            {"ts": "1999999998.000100", "bot_id": "B0OTHER", "text": "A bot"}
        )
        self.slack.channels["C0SUPPORT"].append(
            {"ts": "1999999999.000100", "user": "U0ANN", "text": "", "subtype": "channel_join"}
        )
        self.slack.channels["C0SUPPORT"].append(
            {
                "ts": "1999999999.000200",
                "user": "U0FAIZ",
                "text": "Logged as KAN-2.",
                "metadata": {"event_type": "revenact_step", "event_payload": {"key": "k"}},
            }
        )
        tops, _, _ = self.provider.read_page(CONFIG, CREDS, channel="C0SUPPORT", oldest="0")
        self.assertEqual([t["text"] for t in tops], ["Pizza Hut exports fail"])

    def test_a_thread_read_brings_its_parent_and_replies_after_since(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        first = self.slack.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        second = self.slack.say("C0SUPPORT", "U0FAIZ", "Jesh, can you take this?", thread_ts=top)
        parent, replies = self.provider.read_thread(
            CONFIG, CREDS, channel="C0SUPPORT", thread_ts=top, since=first
        )
        self.assertEqual(parent["ts"], top)
        self.assertEqual([r["ts"] for r in replies], [second])  # since is exclusive, as Slack
        _, replies = self.provider.read_thread(CONFIG, CREDS, channel="C0SUPPORT", thread_ts=top)
        self.assertEqual(
            [(r["name"], r["text"], r["bot"]) for r in replies],
            [
                ("Ann Lee", "Still failing", False),
                ("Faiz Jamal", "Jesh, can you take this?", False),
            ],
        )

    def test_rules_for_tops_replies_and_ours(self):
        self.assertTrue(is_top({"ts": "1.1", "user": "U0FAIZ", "text": "Hi"}))
        self.assertTrue(is_top({"ts": "1.1", "thread_ts": "1.1", "user": "U0FAIZ", "text": "Hi"}))
        self.assertFalse(is_top({"ts": "1.2", "thread_ts": "1.1", "user": "U0FAIZ", "text": "Hi"}))
        self.assertFalse(is_top({"ts": "1.1", "user": "U0FAIZ", "text": "Hi", "bot_id": "B0X"}))
        self.assertFalse(
            is_top({"ts": "1.1", "user": "U0FAIZ", "text": "x", "subtype": "file_share"})
        )
        self.assertTrue(is_ours({"bot_id": "B0BOT"}, CONFIG))
        self.assertTrue(is_ours({"user": "U0BOT"}, CONFIG))
        self.assertTrue(
            is_ours({"user": "U0FAIZ", "metadata": {"event_type": "revenact_step"}}, CONFIG)
        )
        self.assertTrue(is_ours({"user": "U0FAIZ", "app_id": "A0OURS"}, CONFIG, app_id="A0OURS"))
        self.assertFalse(is_ours({"user": "U0FAIZ", "app_id": "A0OTHER"}, CONFIG, app_id="A0OURS"))
        self.assertFalse(is_ours({"user": "U0FAIZ"}, CONFIG))
        reply = {"ts": "1.2", "thread_ts": "1.1", "user": "U0ANN", "text": "Still failing"}
        self.assertEqual(
            self.provider.reply_of(CREDS, CONFIG, reply, {}),
            {
                "ts": "1.2",
                "user_id": "U0ANN",
                "name": "Ann Lee",
                "text": "Still failing",
                "bot": False,
                "ours": False,
            },
        )
        mine = {"ts": "1.3", "thread_ts": "1.1", "bot_id": "B0BOT", "text": "Logged as KAN-2."}
        self.assertEqual((self.provider.reply_of(CREDS, CONFIG, mine, {})["ours"]), True)
        made_as_a_person = {**reply, "ts": "1.4", "metadata": {"event_type": "revenact_step"}}
        self.assertTrue(self.provider.reply_of(CREDS, CONFIG, made_as_a_person, {})["via_app"])
        self.assertIsNone(
            self.provider.reply_of(CREDS, CONFIG, {**reply, "subtype": "channel_join"}, {})
        )
        self.assertIsNone(self.provider.reply_of(CREDS, CONFIG, {**reply, "thread_ts": "1.2"}, {}))

    def test_a_known_person_is_not_looked_up_and_a_lookup_has_a_timeout(self):
        reply = {"ts": "1.2", "thread_ts": "1.1", "user": "U0ANN", "text": "Still failing"}
        people = {"U0ANN": {"name": "Ann Lee", "email": ""}}
        self.provider.reply_of(CREDS, CONFIG, reply, people, timeout=2)
        self.assertNotIn("users.info", [c[0] for c in self.slack.calls])
        self.provider.thread_of(
            CREDS, CONFIG, "C0SUPPORT", {"ts": "1.1", "user": "U0FAIZ", "text": "Hi"}, timeout=2
        )
        self.assertIn(("users.info", 2), self.slack.timeouts)
