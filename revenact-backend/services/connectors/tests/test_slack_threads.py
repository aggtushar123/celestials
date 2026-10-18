"""Slack escalations D1 contract §2, SE1-4: the rules for what is a thread
and a reply, through D3's small reads (a thread's replies only when it moved)."""

from django.test import SimpleTestCase

from services.connectors.providers.slack import SlackProvider
from services.connectors.tests.slack_fake import use_slack

CONFIG = {"channel": "C0SUPPORT", "channel_name": "support", "bot_name": "revenact"}
CREDS = {"bot_token": "xoxb-test-only"}


def fetch(config, creds, known=None):
    """D1's cases through D3's reads: one history page, then each moved
    thread's replies (the catch-up reads one a pass; a test reads them all)."""
    provider = SlackProvider()
    channel = config["channel"]
    known = known or {}
    tops, _more, _lowest = provider.read_page(config, creds, channel=channel, oldest="0")
    threads, people = [], {}
    for raw in tops:
        ts, latest = str(raw["ts"]), str(raw.get("latest_reply") or "")
        replies = [] if not latest else None  # no replies: an empty list
        if latest and latest != known.get(ts):
            _parent, replies = provider.read_thread(
                config, creds, channel=channel, thread_ts=ts, people=people
            )
        threads.append(
            provider.thread_of(
                creds,
                config,
                channel,
                raw,
                replies=replies,
                latest=latest if replies is not None else known.get(ts, ""),
                people=people,
            )
        )
    return threads, (threads[-1].thread_ts if threads else ""), False


class FetchThreadsTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)

    def fetch(self, known=None):
        return fetch(CONFIG, CREDS, known)

    def test_a_thread_with_its_replies_and_our_own_reply(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Globex exports fail\nsince 9am")
        ann = self.slack.say("C0SUPPORT", "U0ANN", "Same for me", thread_ts=top)
        self.slack.channels["C0SUPPORT"].append(
            {"ts": f"{float(ann) + 0.5:.6f}", "text": "On it.", "bot_id": "B0BOT", "thread_ts": top}
        )
        threads, newest, shared = self.fetch()
        (thread,) = threads
        self.assertEqual(
            (thread.thread_ts, thread.text, thread.user_name, thread.user_email),
            (top, "Globex exports fail\nsince 9am", "Faiz Jamal", "faiz@acme.io"),
        )
        self.assertEqual(
            [(r["name"], r["text"], r["bot"]) for r in thread.replies],
            [("Ann Lee", "Same for me", False), ("revenact", "On it.", True)],
        )
        self.assertEqual(thread.latest_reply, thread.replies[-1]["ts"])
        self.assertEqual(
            thread.url, f"https://slack.com/archives/C0SUPPORT/p{top.replace('.', '')}"
        )
        self.assertEqual((newest, shared), (top, False))

    def test_replies_are_fetched_only_when_the_thread_moved(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
        reply = self.slack.say("C0SUPPORT", "U0ANN", "Same", thread_ts=top)
        (thread,), _, _ = self.fetch(known={top: reply})
        self.assertIsNone(thread.replies)  # unchanged: keep what is stored
        self.assertNotIn("conversations.replies", [c[0] for c in self.slack.calls])

    def test_a_thread_with_no_replies_has_none(self):
        self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
        (thread,), _, _ = self.fetch()
        self.assertEqual((thread.replies, thread.latest_reply), ([], ""))

    def test_joins_bots_and_empty_messages_are_not_threads(self):
        channel = self.slack.channels["C0SUPPORT"]
        channel.append({"ts": "1792000001.000100", "subtype": "channel_join", "user": "U1"})
        channel.append({"ts": "1792000002.000100", "bot_id": "B0BOT", "text": "Brief"})
        channel.append({"ts": "1792000003.000100", "user": "U1", "text": ""})
        threads, _, _ = fetch(CONFIG, CREDS)
        self.assertEqual(threads, [])

    def test_a_bots_post_is_never_a_thread_but_a_person_is(self):
        channel = self.slack.channels["C0SUPPORT"]
        channel.append({"ts": "1792000001.000100", "user": "U0FAIZ", "text": "Login is broken"})
        channel.append(
            {"ts": "1792000002.000100", "user": "U0BOT", "bot_id": "B0BOT", "text": "On it"}
        )
        threads, _, _ = fetch(CONFIG, CREDS)
        self.assertEqual([t.thread_ts for t in threads], ["1792000001.000100"])

    def test_a_reply_with_no_user_id_asks_nobody_who_wrote_it(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
        self.slack.channels["C0SUPPORT"].append(
            {"ts": f"{float(top) + 0.5:.6f}", "text": "Huh", "thread_ts": top}
        )
        self.fetch()
        asked = [q.get("user") for n, _b, q in self.slack.calls if n == "users.info"]
        self.assertEqual(asked, ["U0FAIZ"])


OURS = {**CONFIG, "bot_id": "B0BOT", "bot_user_id": "U0BOT"}


class WhoWroteItTests(SimpleTestCase):
    """I3: only our own bot's posts are ours; another app's reply keeps its
    own name. M5: a reply also sent to the channel is a reply."""

    def setUp(self):
        self.slack = use_slack(self)
        self.top = self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
        channel = self.slack.channels["C0SUPPORT"]
        at = float(self.top)
        channel.append(
            {
                "ts": f"{at + 0.1:.6f}",
                "text": "On it.",
                "user": "U0BOT",
                "bot_id": "B0BOT",
                "thread_ts": self.top,
            }
        )
        channel.append(
            {
                "ts": f"{at + 0.2:.6f}",
                "text": "SUP-12 created",
                "user": "U0JIRA",
                "bot_id": "B0JIRA",
                "bot_profile": {"name": "Jira Cloud"},
                "thread_ts": self.top,
            }
        )
        channel.append(
            {
                "ts": f"{at + 0.3:.6f}",
                "text": "Also for everyone",
                "user": "U0ANN",
                "subtype": "thread_broadcast",
                "thread_ts": self.top,
            }
        )

    def replies(self, config):
        (thread,), _, _ = fetch(config, CREDS)
        return [(r["name"], r["text"], r["bot"], r.get("ours")) for r in thread.replies]

    def test_with_our_bots_identity_only_its_posts_are_ours(self):
        self.assertEqual(
            self.replies(OURS),
            [
                ("revenact", "On it.", True, True),
                ("Jira Cloud", "SUP-12 created", True, False),
                ("Ann Lee", "Also for everyone", False, False),
            ],
        )

    def test_without_an_identity_every_bot_is_ours_as_before(self):
        self.assertEqual(
            [r[3] for r in self.replies(CONFIG)],
            [True, True, False],
        )

    def test_a_thread_broadcast_is_never_a_top_message(self):
        (thread,), _, _ = fetch(OURS, CREDS)
        self.assertEqual(thread.thread_ts, self.top)
