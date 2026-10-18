"""Slack escalations D1 SE1-8, SE1-13, SE1-14: a conversation's thread follows
its newest human message; the bot's own reply never wakes it."""

from datetime import timedelta

from django.utils import timezone

from services.agents import threads
from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.tests.slack_fixtures import conversation, msg

T = SignalThread.Status


def ts_ago(delta):
    return f"{(timezone.now() - delta).timestamp():.6f}"


class TouchConversationTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack = self.connector("slack", "cs")

    def test_a_new_conversation_makes_its_thread(self):
        ts = ts_ago(timedelta(minutes=20))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        thread = threads.touch_conversation(made)
        self.assertEqual(
            (thread.source_kind, thread.external_id, thread.conversation_id, thread.ticket_id),
            ("slack", f"{self.slack.pk}:C0SUPPORT:{ts}", made.pk, None),
        )
        self.assertEqual(thread.status, T.NEW)
        self.assertEqual(thread.department, "cs")

    def test_its_time_is_the_newest_human_message(self):
        top, reply, ours = (ts_ago(timedelta(minutes=m)) for m in (40, 30, 20))
        made = conversation(
            self.pizza,
            self.slack,
            thread_ts=top,
            messages=[msg(top), msg(reply, "Ann"), msg(ours, "revenact", bot=True)],
        )
        thread = threads.touch_conversation(made)
        self.assertAlmostEqual(thread.last_message_at.timestamp(), float(reply), places=3)

    def test_an_old_thread_is_skipped_as_stale(self):
        ts = ts_ago(timedelta(days=8))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        thread = threads.touch_conversation(made)
        self.assertEqual((thread.status, thread.skip_reason), (T.SKIPPED, "stale"))

    def test_a_match_touches_it_now_whatever_its_age(self):
        ts = ts_ago(timedelta(days=8))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        now = timezone.now()
        thread = threads.touch_conversation(made, now, at=now)
        self.assertEqual(thread.status, T.NEW)

    def test_only_the_bot_spoke_is_no_thread(self):
        ts = ts_ago(timedelta(minutes=5))
        made = conversation(
            self.pizza, self.slack, thread_ts=ts, messages=[msg(ts, "revenact", bot=True)]
        )
        self.assertIsNone(threads.touch_conversation(made))

    def test_the_fast_lane_reads_the_slack_channel_rule(self):
        self.org.ai_fast_lane = {"on": True, "rules": {"slack_connectors": [self.slack.pk]}}
        self.org.save(update_fields=["ai_fast_lane"])
        ts = ts_ago(timedelta(minutes=5))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        made.connector.organisation.refresh_from_db()
        self.assertEqual(threads.touch_conversation(made).urgent_rule, "slack_channel")
