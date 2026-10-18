"""Slack escalations D3, SC3-6 to SC3-12, SC3-26, SC3-27: a pass lists and
joins, then catches up at most one history page and one thread, never more
than once a minute; each thread is filed by its channel's own record or the
name it carries; replies merge; a ts per channel stays apart; excluded
channels are never read."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import naming, slack_channels, sync
from services.connectors.models import Connector, SlackChannel, UnmatchedItem
from services.connectors.providers.base import RemoteThread
from services.connectors.providers.slack import ts_time
from services.connectors.tests.slack_fake import use_slack
from services.customers.models import Customer, SlackConversation


class CatchUpTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.slack = self.connector("slack", "cs")
        self.slack.set_credentials({"bot_token": "xoxb-test-only"})
        self.slack.config = {"team_id": "T0ACME", "bot_name": "revenact"}
        self.slack.status = Connector.Status.CONNECTED
        self.slack.save()
        self.shack = Customer.objects.create(organisation=self.org, name="Taco Shack")

    def run_pass(self, *, fresh=True):
        if fresh:  # the 60-second guard: each pass in a test is a minute later
            SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
        return sync.sync_connector(self.slack)

    def history_calls(self, since=0):
        return [
            query.get("channel")
            for name, _b, query in self.slack_api.calls[since:]
            if name == "conversations.history"
        ]

    def test_one_channel_a_pass_and_never_twice_a_minute(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Taco Shack login broken")
        self.assertEqual(self.run_pass()["created"], 1)
        self.assertEqual(len(self.history_calls()), 1)
        before = len(self.slack_api.calls)
        self.run_pass(fresh=False)  # within the minute: no history, no replies
        self.assertEqual(self.history_calls(before), [])
        self.assertEqual(self.run_pass()["created"], 1)
        self.assertEqual(
            sorted(SlackConversation.objects.values_list("channel", "channel_name")),
            [("C0ESCALATE", "escalations"), ("C0SUPPORT", "support")],
        )
        self.assertEqual(SignalThread.objects.count(), 2)

    def test_a_page_with_more_walks_down_then_sets_the_watermark(self):
        for n in range(20):
            self.slack_api.say("C0SUPPORT", "U0FAIZ", f"Pizza Hut issue {n}")
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        SlackChannel.objects.create(
            connector=self.slack,
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            read_at=timezone.now(),
        )
        self.run_pass()
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        self.assertTrue(row.walk_before)
        self.assertIsNone(row.read_at)
        self.assertEqual(SlackConversation.objects.count(), 15)
        self.run_pass()  # the walk continues before any other channel
        row.refresh_from_db()
        self.assertEqual((row.walk_before, row.walk_from), ("", None))
        self.assertIsNotNone(row.read_at)
        self.assertEqual(SlackConversation.objects.count(), 20)

    def test_a_channel_set_to_a_customer_files_everything_there(self):
        self.run_pass()
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            customer=self.shack, read_at=None
        )
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=timezone.now())
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.shack, "channel"))

    def test_a_record_the_connection_no_longer_covers_is_not_used(self):
        self.run_pass()
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            customer=self.shack, read_at=None
        )
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=timezone.now())
        self.slack.customers.set([self.pizza])
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        self.assertEqual(SlackConversation.objects.get().customer, self.pizza)

    def test_an_excluded_channel_is_never_read(self):
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(included=False)
        before = len(self.slack_api.calls)
        for _ in range(3):
            self.run_pass()
        self.assertNotIn("C0ESCALATE", self.history_calls(before))

    def test_the_same_ts_in_two_channels_is_two_conversations(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.channels["C0ESCALATE"].append(
            {"ts": top, "user": "U0FAIZ", "text": "Pizza Hut login broken"}
        )
        self.run_pass()
        self.run_pass()
        self.assertEqual(SlackConversation.objects.filter(thread_ts=top).count(), 2)

    def test_a_shared_channel_s_conversation_says_so(self):
        self.slack_api.shared.add("C0ESCALATE")
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            included=True, chosen_at=self.slack.created_at, read_at=None
        )
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=timezone.now())
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        self.assertTrue(SlackConversation.objects.get().external_shared)
        self.slack.refresh_from_db()
        self.assertNotIn("external_shared", self.slack.config)

    def test_a_rate_limit_ends_the_catch_up_and_marks_only_that_it_asked(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.refuse_next("conversations.history", "ratelimited")
        counts = self.run_pass()
        self.assertEqual(counts["created"], 0)
        self.assertEqual(SlackChannel.objects.exclude(asked_at=None).count(), 1)
        self.assertFalse(SlackChannel.objects.exclude(read_error="").exists())
        self.assertFalse(SlackChannel.objects.exclude(read_at=None).exists())
        self.slack.refresh_from_db()
        self.assertEqual(self.slack.status, Connector.Status.CONNECTED)

    def test_a_channel_the_bot_was_removed_from_is_marked(self):
        self.slack_api.refuse_next("conversations.history", "not_in_channel")
        self.run_pass()
        marked = SlackChannel.objects.filter(read_error="not_in_channel")
        self.assertEqual(marked.count(), 1)
        self.assertFalse(marked.get().is_member)
        # R6: never joined again by itself (SC3-3)
        self.assertEqual(marked.get().join_error, slack_channels.REMOVED)

    def test_a_missed_thread_is_read_first_with_its_parent(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        self.run_pass()  # lists the channels and catches up #escalations (the first row)
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        row.missed = [top]
        row.save(update_fields=["missed"])
        self.run_pass()
        made = SlackConversation.objects.get(channel="C0SUPPORT", thread_ts=top)
        self.assertEqual(
            [m["text"] for m in made.messages], ["Pizza Hut exports fail", "Still failing"]
        )
        row.refresh_from_db()
        self.assertEqual(row.missed, [])

    def test_a_moved_thread_s_new_replies_merge_with_the_stored_ones(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        first = self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        SlackChannel.objects.create(
            connector=self.slack,
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            read_at=timezone.now(),
        )
        self.run_pass()  # files the top; the thread call reads its first reply
        made = SlackConversation.objects.get()
        self.assertEqual(made.latest_reply, first)
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Jesh, can you take this?", thread_ts=top)
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=None)
        self.run_pass()
        made.refresh_from_db()
        self.assertEqual(
            [m["text"] for m in made.messages],
            ["Pizza Hut exports fail", "Still failing", "Jesh, can you take this?"],
        )
        replies = [q for n, _b, q in self.slack_api.calls if n == "conversations.replies"]
        self.assertEqual(replies[-1]["oldest"], first)  # only what is new

    def test_a_thread_naming_no_one_waits_with_its_channel_in_its_key(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Anyone seeing slow dashboards?")
        self.run_pass()
        self.run_pass()
        row = UnmatchedItem.objects.get(connector=self.slack)
        self.assertEqual((row.external_id, row.number), (f"C0SUPPORT:{top}", "#support"))

    def test_a_missed_thread_slack_refuses_leaves_the_queue(self):
        """R6: any refusal but a rate limit is the row's read_error, and the
        thread leaves `missed`, so it never blocks the ones behind it."""
        self.run_pass()
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        row.missed = ["1792041400.000100", "1792041500.000100"]
        row.save(update_fields=["missed"])
        SlackChannel.objects.update(read_at=timezone.now())
        self.slack_api.refuse_next("conversations.replies", "missing_scope")
        self.run_pass()
        row.refresh_from_db()
        self.assertEqual((row.missed, row.read_error), (["1792041500.000100"], "missing_scope"))

    def test_a_refused_replies_read_stamps_when_the_row_was_asked(self):
        """F1: a replies refusal on a row the catch-up did not pick is timed,
        so the row's READ_RETRY counts from it."""
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(
            missed=["1792041400.000100"], read_at=timezone.now()
        )
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            read_at=timezone.now() - timedelta(hours=1)
        )
        self.slack_api.refuse_next("conversations.replies", "missing_scope")
        before = timezone.now()
        self.run_pass()
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        self.assertEqual(row.read_error, "missing_scope")
        self.assertGreaterEqual(row.asked_at, before)

    def test_a_channel_slack_cannot_find_stops_being_read(self):
        """F8: channel_not_found takes the bot out of the row (no longer ready,
        so it uses no history call), without marking it removed (SC3-3)."""
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0ESCALATE", name="escalations", is_member=True
        )
        self.slack_api.refuse_next("conversations.history", "channel_not_found")
        self.run_pass()
        row = SlackChannel.objects.get(channel_id="C0ESCALATE")
        self.assertEqual((row.read_error, row.is_member), ("channel_not_found", False))
        self.assertEqual(row.join_error, "")

    def test_a_page_re_reading_a_stored_top_locks_its_conversation(self):
        """F3: the catch-up files a thread we hold under its row's lock."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        self.assertEqual(SlackConversation.objects.count(), 1)
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=None)
        SlackChannel.objects.exclude(channel_id="C0SUPPORT").update(read_at=timezone.now())
        with CaptureQueriesContext(connection) as queries:
            self.run_pass()
        table = SlackConversation._meta.db_table
        locked = [
            q["sql"]
            for q in queries
            if q["sql"].startswith("SELECT") and table in q["sql"] and "FOR UPDATE" in q["sql"]
        ]
        self.assertEqual(len(locked), 1)

    def test_a_thread_an_event_filed_meanwhile_does_not_stop_the_pass(self):
        from unittest.mock import patch

        from django.db import IntegrityError

        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Taco Shack login broken")
        real = sync.file_conversation
        calls = []

        def racing(*args, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                raise IntegrityError("slack_conversation_once")
            return real(*args, **kwargs)

        with (
            patch.object(sync, "file_conversation", racing),
            self.assertLogs("services.connectors.slack_catchup", "WARNING"),
        ):
            counts = self.run_pass()
        self.assertEqual(counts["created"], 1)
        self.slack.refresh_from_db()
        self.assertEqual(self.slack.status, Connector.Status.CONNECTED)

    def test_a_channel_slack_keeps_refusing_never_stops_the_others(self):
        """SC3-6: only a rate limit ends a catch-up; a refused channel goes
        last, so the missed queue and the other channels are still read."""
        support_top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=support_top)
        escalate_top = self.slack_api.say("C0ESCALATE", "U0FAIZ", "Taco Shack login broken")
        self.slack_api.say("C0ESCALATE", "U0ANN", "Same here", thread_ts=escalate_top)
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0ESCALATE", name="escalations", is_member=True
        )
        SlackChannel.objects.create(
            connector=self.slack,
            channel_id="C0SUPPORT",
            name="support",
            is_member=True,
            missed=[support_top],
        )
        # pass 1: #escalations (first by pk) is refused (a code that keeps the
        # bot in the channel, F8); the missed thread is still read
        self.slack_api.refuse_next("conversations.history", "internal_error")
        self.run_pass()
        escalate = SlackChannel.objects.get(channel_id="C0ESCALATE")
        self.assertEqual((escalate.read_error, escalate.read_at), ("internal_error", None))
        made = SlackConversation.objects.get(channel="C0SUPPORT", thread_ts=support_top)
        self.assertEqual(len(made.messages), 2)
        self.assertEqual(SlackChannel.objects.get(channel_id="C0SUPPORT").missed, [])
        # pass 2: the refused row goes last, so #support is read
        self.run_pass()
        self.assertIsNotNone(SlackChannel.objects.get(channel_id="C0SUPPORT").read_at)
        # pass 3: #support excluded; #escalations refused again, its missed thread read
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(included=False)
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(missed=[escalate_top])
        self.slack_api.refuse_next("conversations.history", "internal_error")
        self.run_pass()
        self.assertEqual(
            SlackConversation.objects.get(channel="C0ESCALATE", thread_ts=escalate_top).customer,
            self.shack,
        )
        escalate.refresh_from_db()
        self.assertEqual((escalate.read_error, escalate.missed), ("internal_error", []))
        # a read that goes through clears the error
        self.run_pass()
        escalate.refresh_from_db()
        self.assertEqual(escalate.read_error, "")
        self.assertIsNotNone(escalate.read_at)

    def test_a_rate_limited_missed_thread_stays_queued(self):
        self.run_pass()
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        row.missed = ["1792041400.000100"]
        row.save(update_fields=["missed"])
        SlackChannel.objects.update(read_at=timezone.now())
        self.slack_api.refuse_next("conversations.replies", "ratelimited")
        self.run_pass()
        row.refresh_from_db()
        self.assertEqual((row.missed, row.read_error), (["1792041400.000100"], ""))


class MergedReplyTests(IntakeFixture):
    """SC3-24, SC3-25, SC3-27, R1: what events and the catch-up add to a
    stored conversation, through file_conversation and the two helpers."""

    def setUp(self):
        super().setUp()
        use_slack(self)
        self.slack = self.connector("slack", "cs")
        self.slack.config = {"team_id": "T0ACME", "bot_name": "revenact"}
        self.slack.save()
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        self.top = "1792041400.000100"
        remote = RemoteThread(
            thread_ts=self.top,
            channel="C0SUPPORT",
            text="Pizza Hut exports fail",
            user_id="U0FAIZ",
            user_name="Faiz Jamal",
            user_email="",
            posted_at=ts_time(self.top),
            latest_reply="",
            replies=None,
            url="",
        )
        names = naming.covered_names(self.slack)
        _, self.made = sync.file_conversation(self.slack, remote, names, now=timezone.now())
        SignalThread.objects.update(status="processed")

    def reply(self, ts, text, **extra):
        return {"ts": ts, "user_id": "U0ANN", "name": "Ann", "text": text, "bot": False, **extra}

    def add(self, *replies):
        remote = sync.stored_remote(self.made, list(replies))
        return sync.file_conversation(self.slack, remote, [], now=timezone.now())

    def test_a_reply_made_through_our_app_wakes_nothing(self):
        outcome, made = self.add(self.reply("1792041401.000100", "Logged.", via_app=True))
        self.assertEqual(outcome, "updated")
        self.assertTrue(made.messages[-1]["via_app"])
        self.assertEqual(SignalThread.objects.get().status, "processed")
        self.add(self.reply("1792041402.000100", "Still failing"))
        self.assertEqual(SignalThread.objects.get().status, "new")

    def test_a_known_ts_takes_the_new_text_and_latest_reply_only_moves_forward(self):
        self.add(self.reply("1792041402.000100", "Still failing"))
        self.made.refresh_from_db()
        self.add(self.reply("1792041401.000100", "Earlier"))
        self.made.refresh_from_db()
        self.assertEqual(
            [m["text"] for m in self.made.messages],
            ["Pizza Hut exports fail", "Earlier", "Still failing"],
        )
        self.assertEqual(self.made.latest_reply, "1792041402.000100")

    def test_edits_and_deletes_are_quiet(self):
        self.add(self.reply("1792041402.000100", "Still failing"))
        self.made.refresh_from_db()
        SignalThread.objects.update(status="processed")
        self.assertTrue(sync.edit_message(self.made, self.top, "Pizza Hut exports broken"))
        self.assertFalse(sync.edit_message(self.made, self.top, "Pizza Hut exports broken"))
        self.assertTrue(sync.delete_message(self.made, "1792041402.000100"))
        self.assertFalse(sync.delete_message(self.made, "1792041402.000100"))
        self.made.refresh_from_db()
        self.assertEqual(self.made.title, "Pizza Hut exports broken")
        self.assertEqual(len(self.made.messages), 1)
        self.assertTrue(sync.delete_message(self.made, self.top))
        self.made.refresh_from_db()
        self.assertEqual((self.made.title, self.made.messages[0]["text"]), (sync.DELETED,) * 2)
        self.assertEqual(SignalThread.objects.get().status, "processed")
