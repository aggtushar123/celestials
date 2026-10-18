"""Slack for agent bundles D3 (contract §2.2, §5.3, D3-4, D3-11, D3-26):
what a token may do, a post with its key, finding it again. Slack is a fake."""

from django.test import SimpleTestCase, override_settings

from services.connectors.providers.base import NoAnswer, ProviderError
from services.connectors.providers.slack import (
    ACT_SCOPES,
    SlackProvider,
    message_url,
)
from services.connectors.tests.slack_fake import BASE_SCOPES, FakeSlackApi, use_slack

CREDS = {"bot_token": "xoxb-test"}


class SlackActionTests(SimpleTestCase):
    def setUp(self):
        self.api = use_slack(self, FakeSlackApi(scopes=[*BASE_SCOPES, "chat:write"]))
        self.slack = SlackProvider()

    def test_connect_records_the_team_the_bot_and_its_scopes(self):
        config, creds = self.slack.connect({"bot_token": "xoxb-test"})
        self.assertEqual(
            config,
            {
                "team_id": "T0ACME",
                "bot_name": "revenact",
                "bot_id": "B0BOT",
                "bot_user_id": "U0BOT",
                "via": "token",
                "scopes": [*BASE_SCOPES, "chat:write"],
            },
        )
        self.assertEqual(creds, CREDS)

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_sign_in_records_what_slack_granted(self):
        config, _ = self.slack.exchange_code("code", "https://x/cb", {"channel": "C0SUPPORT"})
        self.assertEqual((config["via"], "chat:write" in config["scopes"]), ("oauth", True))
        url = self.slack.authorize_url("state", "https://x/cb", act=True)
        self.assertIn("chat%3Awrite", url)
        self.assertNotIn("chat%3Awrite", self.slack.authorize_url("state", "https://x/cb"))
        self.assertTrue(ACT_SCOPES.endswith(",chat:write"))

    def test_a_post_carries_its_key_and_is_found_again(self):
        ts = self.slack.post_message(
            CREDS,
            channel="C0SUPPORT",
            text="We're on it.",
            thread_ts="1760339999.000100",
            key="b12-s41",
        )
        sent = self.api.channels["C0SUPPORT"][-1]
        self.assertEqual(sent["thread_ts"], "1760339999.000100")
        self.assertEqual(
            sent["metadata"], {"event_type": "revenact_step", "event_payload": {"key": "b12-s41"}}
        )
        name, body, _ = next(c for c in self.api.calls if c[0] == "chat.postMessage")
        self.assertEqual((body["unfurl_links"], body["unfurl_media"]), (False, False))
        found = self.slack.find_message(
            CREDS,
            channel="C0SUPPORT",
            key="b12-s41",
            thread_ts="1760339999.000100",
            oldest="1760300000",
        )
        self.assertEqual(found, ts)
        self.assertIsNone(
            self.slack.find_message(
                CREDS, channel="C0SUPPORT", key="b12-s99", thread_ts="1760339999.000100"
            )
        )

    def test_a_top_level_post_is_found_in_the_channel(self):
        ts = self.slack.post_message(CREDS, channel="C0ESCALATE", text="Heads up.", key="b12-s42")
        self.assertEqual(self.slack.find_message(CREDS, channel="C0ESCALATE", key="b12-s42"), ts)

    def bury(self, channel, count):
        """`count` people's messages in `channel`, newer than what was posted before
        (Slack's history answers newest first, so they come first)."""
        for n in range(count):
            self.api._ts += 1
            self.api.channels[channel].append({"ts": f"{self.api._ts}.000100", "text": f"m{n}"})

    def test_finding_a_post_follows_the_cursor(self):
        ts = self.slack.post_message(CREDS, channel="C0ESCALATE", text="Heads up.", key="b12-s42")
        self.bury("C0ESCALATE", 250)
        self.assertEqual(self.slack.find_message(CREDS, channel="C0ESCALATE", key="b12-s42"), ts)
        pages = [c for c in self.api.calls if c[0] == "conversations.history"]
        self.assertEqual(len(pages), 2)

    def test_finding_a_post_reads_at_most_five_pages(self):
        self.slack.post_message(CREDS, channel="C0ESCALATE", text="Heads up.", key="b12-s42")
        self.bury("C0ESCALATE", 1000)
        self.assertIsNone(self.slack.find_message(CREDS, channel="C0ESCALATE", key="b12-s42"))
        pages = [c for c in self.api.calls if c[0] == "conversations.history"]
        self.assertEqual(len(pages), 5)

    @override_settings(AGENT_TOOL_TIMEOUT_SECONDS=7)
    def test_finding_a_post_waits_the_tool_timeout(self):
        self.slack.find_message(CREDS, channel="C0ESCALATE", key="b12-s42")
        self.assertEqual(
            [t for name, t in self.api.timeouts if name == "conversations.history"], [7]
        )

    def test_a_posts_text_is_escaped_so_it_cant_ping(self):
        self.slack.post_message(
            CREDS, channel="C0SUPPORT", text="Hi <!channel> & <@U0BOSS>, ok?", key="k"
        )
        # Nobody allowed: a person reads "@someone", the channel ping stays escaped.
        self.assertEqual(
            self.api.channels["C0SUPPORT"][-1]["text"],
            "Hi &lt;!channel&gt; &amp; @someone, ok?",
        )

    def test_people_in_the_conversation_are_real_mentions(self):
        self.slack.post_message(
            CREDS,
            channel="C0SUPPORT",
            text="Hi <@U0JESH>, flagged for <@U0TUSHAR|tushar>. <@U0STRANGER> <!here> <https://x.io|x>",
            key="k",
            mentions={"U0JESH", "U0TUSHAR"},
        )
        self.assertEqual(
            self.api.channels["C0SUPPORT"][-1]["text"],
            "Hi <@U0JESH>, flagged for <@U0TUSHAR>. @someone &lt;!here&gt; &lt;https://x.io|x&gt;",
        )

    def test_slacks_refusal_keeps_its_code(self):
        self.api.refuse_next("chat.postMessage", "not_in_channel")
        with self.assertRaises(ProviderError) as caught:
            self.slack.post_message(CREDS, channel="C0SUPPORT", text="Hi", key="k")
        self.assertEqual(caught.exception.code, "not_in_channel")
        self.assertFalse(caught.exception.reauth)
        self.api.refuse_next("chat.postMessage", "token_revoked")
        with self.assertRaises(ProviderError) as caught:
            self.slack.post_message(CREDS, channel="C0SUPPORT", text="Hi", key="k")
        self.assertTrue(caught.exception.reauth)

    def test_a_lost_answer_is_no_answer_and_the_post_happened(self):
        self.api.drop_next("chat.postMessage")
        with self.assertRaises(NoAnswer):
            self.slack.post_message(CREDS, channel="C0SUPPORT", text="Hi", key="b1-s2")
        self.assertIsNotNone(self.slack.find_message(CREDS, channel="C0SUPPORT", key="b1-s2"))

    def test_the_tokens_scopes_are_read_live(self):
        self.assertIn("chat:write", self.slack.granted_scopes(CREDS))

    def test_links(self):
        self.assertEqual(
            message_url("C0SUPPORT", "1760340001.000100"),
            "https://slack.com/archives/C0SUPPORT/p1760340001000100",
        )
        self.assertEqual(
            message_url("C0SUPPORT", "1760340001.000100", "1760339999.000100"),
            "https://slack.com/archives/C0SUPPORT/p1760340001000100"
            "?thread_ts=1760339999.000100&cid=C0SUPPORT",
        )


class MemberChannelTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)

    def test_member_channels_pages_and_respects_private(self):
        self.slack.members.clear()
        for n in range(450):
            self.slack.names[f"C{n:04d}"] = f"room-{n}"
            self.slack.channels[f"C{n:04d}"] = []
            self.slack.members.add(f"C{n:04d}")
        self.slack.names["G0LEADS"] = "leads"
        self.slack.channels["G0LEADS"] = []
        self.slack.members.add("G0LEADS")
        self.slack.private.add("G0LEADS")
        rows = SlackProvider().member_channels({"bot_token": "xoxb"}, private=False)
        self.assertEqual(len(rows), 450)
        self.assertNotIn("G0LEADS", {r["id"] for r in rows})
        calls = [q for name, _, q in self.slack.calls if name == "users.conversations"]
        self.assertEqual(len(calls), 3)
        self.assertEqual(
            (calls[0]["types"], calls[0]["exclude_archived"], calls[0]["limit"]),
            ("public_channel", "true", "200"),
        )
        rows = SlackProvider().member_channels({"bot_token": "xoxb"}, private=True)
        self.assertIn({"id": "G0LEADS", "name": "leads", "private": True}, rows)

    def test_at_most_a_thousand(self):
        for n in range(1200):
            self.slack.names[f"C{n:04d}"] = f"r{n}"
            self.slack.channels[f"C{n:04d}"] = []
            self.slack.members.add(f"C{n:04d}")
        self.assertEqual(
            len(SlackProvider().member_channels({"bot_token": "x"}, private=False)), 1000
        )

    def test_a_refusal_carries_slacks_code_and_calls_are_bounded(self):
        self.slack.refuse_next("users.conversations", "missing_scope")
        with self.assertRaises(ProviderError) as caught:
            SlackProvider().member_channels({"bot_token": "x"}, private=True)
        self.assertEqual(caught.exception.code, "missing_scope")
        with override_settings(AGENT_TOOL_TIMEOUT_SECONDS=7):
            SlackProvider().member_channels({"bot_token": "x"}, private=False)
        self.assertEqual(self.slack.timeouts[-1], ("users.conversations", 7))
