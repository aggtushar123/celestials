"""Slack escalations D3, contract §3.3, SC3-7, SC3-22 to SC3-30: Slack's
signed Events API deliveries. url_verification; a forged, stale or unsigned
request is refused; every verified delivery answers 200; a message in an
included channel is filed before the answer (the agent's thread touched for
its tick), once however often Slack retries; replies merge; our own posts
never wake the agent; edits and deletes are honoured quietly; an excluded
channel stores nothing; what can't be filed waits for the catch-up; a new
channel is joined at once. Slack is a fake; the secret is per run."""

import json
from unittest.mock import patch

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import slack_events, sync
from services.connectors.models import Connector, SlackChannel, UnmatchedItem
from services.connectors.tests.slack_events_fixtures import (
    SIGNING,
    envelope,
    message,
    post,
)
from services.connectors.tests.slack_fake import use_slack
from services.customers.models import SlackConversation

TOP = "1792041400.000100"
#: Contract §6, measured: the team's connections; the channel row and its
#: `event_at`; the stored conversation; a savepoint, its lock and the read inside
#: `file_conversation`; the save; the waiting row's delete; the connection and its
#: organisation (the fast lane) for the touch; the agent thread's lookup and touch;
#: the savepoint's release. Rebased onto D4 (measured, 15): +1, the members who
#: linked Slack, read to resolve the thread's people (SE4-24).
SLACK_EVENT_REPLY_QUERIES = 15


@override_settings(SLACK_SIGNING_SECRET=SIGNING)
class SlackEventsTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.slack = self.connector("slack", "cs")
        self.slack.set_credentials({"bot_token": "xoxb-test-only"})
        self.slack.config = {
            "team_id": "T0ACME",
            "bot_name": "revenact",
            "bot_id": "B0BOT",
            "bot_user_id": "U0BOT",
        }
        self.slack.status = Connector.Status.CONNECTED
        self.slack.granted_scopes = ["channels:history", "channels:read"]
        self.slack.save()
        self.support = SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        self.client = APIClient()

    def send(self, event, **kwargs):
        answer = post(self.client, envelope(event, shared=kwargs.pop("shared", False)), **kwargs)
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer

    def filed(self, ts=TOP, channel="C0SUPPORT"):
        return SlackConversation.objects.get(connector=self.slack, channel=channel, thread_ts=ts)

    def thread_of(self, conversation):
        return SignalThread.objects.get(
            external_id=f"{self.slack.pk}:{conversation.channel}:{conversation.thread_ts}"
        )

    def test_url_verification_answers_the_challenge(self):
        answer = post(
            self.client, {"type": "url_verification", "challenge": "3eZbrw1aBm2rZgRNFdxV"}
        )
        self.assertEqual(
            (answer.status_code, answer.json()), (200, {"challenge": "3eZbrw1aBm2rZgRNFdxV"})
        )

    def test_a_forged_stale_or_unsigned_delivery_is_refused_and_files_nothing(self):
        event = envelope(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.assertEqual(post(self.client, event, secret="not-the-secret").status_code, 401)
        self.assertEqual(post(self.client, event, at=0).status_code, 401)
        unsigned = self.client.post(
            "/api/v1/connectors/slack/events/",
            data=json.dumps(event),
            content_type="application/json",
        )
        self.assertEqual(unsigned.status_code, 401)
        with override_settings(SLACK_SIGNING_SECRET=""):
            self.assertEqual(post(self.client, event).status_code, 401)
        self.assertFalse(SlackConversation.objects.exists())

    def test_the_public_url_is_throttled_per_ip(self):
        from django.core.cache import cache

        from core.throttling import SlackEventsThrottle

        cache.clear()
        verify = {"type": "url_verification", "challenge": "abc"}
        with patch.object(SlackEventsThrottle, "rate", "1/min"):
            self.assertEqual(post(self.client, verify).status_code, 200)
            self.assertEqual(post(self.client, verify).status_code, 429)
        cache.clear()

    def test_a_body_over_django_s_limit_is_refused_before_it_is_read(self):
        event = envelope(message("C0SUPPORT", TOP, "Pizza Hut exports fail " * 20))
        with override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=256):
            self.assertEqual(post(self.client, event).status_code, 400)
        self.assertFalse(SlackConversation.objects.exists())

    def test_get_is_not_allowed(self):
        self.assertEqual(self.client.get("/api/v1/connectors/slack/events/").status_code, 405)

    def test_a_body_that_is_not_an_object_is_refused(self):
        self.assertEqual(post(self.client, None, raw=b"not json").status_code, 400)
        self.assertEqual(post(self.client, None, raw=b"[1, 2]").status_code, 400)

    def test_a_top_message_is_filed_before_the_answer_and_its_thread_touched(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        made = self.filed()
        self.assertEqual(
            (made.customer, made.channel_name, made.started_by_name, made.matched_by),
            (self.pizza, "support", "Faiz Jamal", "name"),
        )
        self.assertTrue(self.thread_of(made))
        self.support.refresh_from_db()
        self.assertIsNotNone(self.support.event_at)

    def test_slack_s_retries_file_once(self):
        event = message("C0SUPPORT", TOP, "Pizza Hut exports fail")
        self.send(event)
        self.send(event, retry=1)
        self.send(event, retry=2)
        self.assertEqual(SlackConversation.objects.count(), 1)
        self.assertEqual(len(self.filed().messages), 1)

    def test_a_reply_is_merged_once_and_wakes_the_thread(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        before = self.thread_of(self.filed()).last_message_at
        reply = message("C0SUPPORT", "1792041460.000100", "Jesh, can you take this?", thread_ts=TOP)
        self.send(reply)
        self.send(reply, retry=1)
        made = self.filed()
        self.assertEqual(
            [m["text"] for m in made.messages],
            ["Pizza Hut exports fail", "Jesh, can you take this?"],
        )
        self.assertEqual(made.latest_reply, "1792041460.000100")
        self.assertGreater(self.thread_of(made).last_message_at, before)

    def test_our_bot_s_reply_is_kept_but_never_wakes_the_agent(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        before = self.thread_of(self.filed()).last_message_at
        mine = message(
            "C0SUPPORT",
            "1792041470.000100",
            "Logged as KAN-2.",
            user="",
            thread_ts=TOP,
            bot_id="B0BOT",
        )
        self.send(mine)
        made = self.filed()
        self.assertEqual((made.messages[-1]["bot"], made.messages[-1]["ours"]), (True, True))
        self.assertEqual(self.thread_of(made).last_message_at, before)

    def test_a_person_s_post_made_through_our_app_is_marked(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        before = self.thread_of(self.filed()).last_message_at
        self.send(
            message(
                "C0SUPPORT", "1792041480.000100", "Logged as KAN-2.", thread_ts=TOP, app_id="A0OURS"
            )
        )
        self.assertTrue(self.filed().messages[-1]["via_app"])
        # R1, SC3-24: stored, but the agent is not woken
        self.assertEqual(self.thread_of(self.filed()).last_message_at, before)
        # and a top message made through our app never starts a conversation
        self.send(message("C0SUPPORT", "1792041490.000100", "Pizza Hut: logged.", app_id="A0OURS"))
        self.assertEqual(SlackConversation.objects.count(), 1)

    def test_bots_joins_and_file_shares_never_start_a_conversation(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut bot alert", user="", bot_id="B0OTHER"))
        self.send(message("C0SUPPORT", "1792041401.000100", "joined", subtype="channel_join"))
        self.send(message("C0SUPPORT", "1792041402.000100", "Pizza Hut", subtype="file_share"))
        self.assertFalse(SlackConversation.objects.exists())

    def test_a_reply_to_an_unknown_thread_waits_for_the_catch_up(self):
        self.send(message("C0SUPPORT", "1792041460.000100", "Still failing", thread_ts=TOP))
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [TOP])

    def test_a_reply_the_catch_up_would_not_keep_is_not_queued_for_an_unknown_thread(self):
        """F2 (owner), refining SC3-26: a bot's reply, a file share, an empty
        message or our own post to a thread we don't hold is ignored, so it
        never costs the catch-up a replies call. A person's reply still waits."""
        replies = [
            message(
                "C0SUPPORT",
                "1792041461.000100",
                "Build failed",
                user="",
                thread_ts=TOP,
                subtype="bot_message",
                bot_id="B0OTHER",
            ),
            message(
                "C0SUPPORT",
                "1792041462.000100",
                "Deploy done",
                user="",
                thread_ts=TOP,
                bot_id="B0OTHER",
            ),
            message(
                "C0SUPPORT", "1792041463.000100", "log.txt", thread_ts=TOP, subtype="file_share"
            ),
            message("C0SUPPORT", "1792041464.000100", "", thread_ts=TOP),
            message(
                "C0SUPPORT",
                "1792041465.000100",
                "Logged as KAN-2.",
                user="",
                thread_ts=TOP,
                bot_id="B0BOT",
            ),
            message("C0SUPPORT", "1792041466.000100", "Logged.", thread_ts=TOP, app_id="A0OURS"),
        ]
        for reply in replies:
            self.assertEqual(slack_events.handle(envelope(reply)), [slack_events.IGNORED])
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [])
        person = message("C0SUPPORT", "1792041467.000100", "Still failing", thread_ts=TOP)
        self.assertEqual(slack_events.handle(envelope(person)), [slack_events.MISSED])
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [TOP])

    def test_a_reply_to_a_waiting_thread_is_left_to_the_catch_up(self):
        self.send(message("C0SUPPORT", TOP, "Anyone seeing slow dashboards?"))
        self.assertTrue(UnmatchedItem.objects.filter(external_id=f"C0SUPPORT:{TOP}").exists())
        self.send(message("C0SUPPORT", "1792041460.000100", "Yes, me too", thread_ts=TOP))
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [])

    def test_an_excluded_channel_stores_nothing(self):
        SlackChannel.objects.filter(pk=self.support.pk).update(included=False)
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.assertFalse(SlackConversation.objects.exists())
        self.support.refresh_from_db()
        self.assertIsNone(self.support.event_at)

    def test_an_unknown_public_channel_becomes_a_row_and_a_shared_one_starts_excluded(self):
        self.send(message("C0NEW", TOP, "Pizza Hut exports fail"))
        self.assertTrue(SlackChannel.objects.get(channel_id="C0NEW").included)
        self.assertEqual(self.filed(channel="C0NEW").customer, self.pizza)
        self.send(message("C0GLOBEX", TOP, "Pizza Hut exports fail"), shared=True)
        row = SlackChannel.objects.get(channel_id="C0GLOBEX")
        self.assertEqual((row.included, row.external_shared), (False, True))
        self.assertFalse(SlackConversation.objects.filter(channel="C0GLOBEX").exists())

    def test_an_unknown_team_or_event_kind_answers_200_and_stores_nothing(self):
        answer = post(self.client, envelope(message("C0SUPPORT", TOP, "Pizza Hut"), team="T0OTHER"))
        self.assertEqual(answer.status_code, 200)
        reaction = {"type": "reaction_added", "user": "U0FAIZ", "reaction": "eyes"}
        self.assertEqual(post(self.client, envelope(reaction)).status_code, 200)
        limited = {"type": "app_rate_limited", "team_id": "T0ACME", "minute_rate_limited": 1}
        self.assertEqual(post(self.client, limited).status_code, 200)
        self.assertFalse(SlackConversation.objects.exists())

    def test_an_edit_changes_the_text_quietly(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply_ts = "1792041460.000100"
        self.send(message("C0SUPPORT", reply_ts, "Jesh can take this", thread_ts=TOP))
        before = self.thread_of(self.filed()).last_message_at
        edited = {
            "type": "message",
            "subtype": "message_changed",
            "channel": "C0SUPPORT",
            "channel_type": "channel",
            "hidden": True,
            "ts": "1792041500.000100",
            "message": {
                "user": "U0FAIZ",
                "text": "Faiz can take this",
                "ts": reply_ts,
                "thread_ts": TOP,
                "edited": {"user": "U0FAIZ", "ts": "1792041500.000000"},
            },
        }
        self.send(edited)
        made = self.filed()
        self.assertEqual(made.messages[-1]["text"], "Faiz can take this")
        self.assertEqual(self.thread_of(made).last_message_at, before)

    # D4 (SE4-24) on the events path: the thread's people, or no decisions and no participants

    def test_a_top_message_s_poster_is_among_the_thread_s_people(self):
        self.slack_api.users["U0ERIN"] = {
            "real_name": "Erin Eng",
            "profile": {"email": "erin@acme.io"},
        }
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail", user="U0ERIN"))
        self.assertEqual(
            self.filed().people, {"U0ERIN": {"name": "Erin Eng", "member": self.erin.pk}}
        )
        self.assertNotIn("@", str(self.filed().people))

    def test_a_mentioned_person_is_looked_up_for_the_thread_s_people(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.send(
            message("C0SUPPORT", "1792041460.000100", "<@U0CARL> can you take this?", thread_ts=TOP)
        )
        self.assertEqual(self.filed().people["U0CARL"]["name"], "Carl Lee")
        self.assertEqual(set(self.filed().people), {"U0FAIZ", "U0CARL"})

    def test_an_event_looks_up_at_most_event_lookups_mentioned_people(self):
        text = " ".join(f"<@U0P{n:03d}>" for n in range(slack_events.EVENT_LOOKUPS + 2))
        self.send(message("C0SUPPORT", TOP, f"Pizza Hut exports fail {text}"))
        asked = [q["user"] for name, _body, q in self.slack_api.calls if name == "users.info"]
        # the poster, then EVENT_LOOKUPS mentioned people within Slack's 3 seconds
        self.assertEqual(len(asked), 1 + slack_events.EVENT_LOOKUPS)
        self.assertIn(("users.info", 2), self.slack_api.timeouts)

    def test_an_event_stops_looking_people_up_once_its_time_is_spent(self):
        """SC3-23: Slack waits 3 seconds; past EVENT_ASK_UNTIL no one more is
        asked about, and the message is still filed (the catch-up asks later)."""
        clock = iter([0.0, 0.5, slack_events.EVENT_ASK_UNTIL + 0.1])
        last = [0.0]

        def monotonic():
            last[0] = next(clock, last[0])
            return last[0]

        with patch("services.connectors.slack_events.monotonic", monotonic):
            self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail <@U0CARL> <@U0ANN>"))
        asked = [q["user"] for name, _body, q in self.slack_api.calls if name == "users.info"]
        self.assertEqual(asked, ["U0FAIZ", "U0CARL"])  # the poster, then one mention in time
        self.assertEqual(set(self.filed().people), {"U0FAIZ", "U0CARL"})
        # each lookup's timeout never runs past the event's time (EVENT_SPEND)
        self.assertTrue(all(t <= 2 for name, t in self.slack_api.timeouts if name == "users.info"))

    def test_a_reply_never_asks_about_someone_the_thread_already_resolved(self):
        self.slack_api.users["U0ERIN"] = {
            "real_name": "Erin Eng",
            "profile": {"email": "erin@acme.io"},
        }
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail <@U0ERIN>"))
        self.assertEqual(self.filed().people["U0ERIN"]["member"], self.erin.pk)
        self.slack_api.calls.clear()
        self.send(message("C0SUPPORT", "1792041460.000100", "<@U0ERIN> any news?", thread_ts=TOP))
        self.assertNotIn("users.info", [name for name, _b, _q in self.slack_api.calls])
        self.assertEqual(len(self.filed().messages), 2)

    def test_an_edit_that_mentions_someone_new_adds_them_to_the_people(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply_ts = "1792041460.000100"
        self.send(message("C0SUPPORT", reply_ts, "Who can take this?", thread_ts=TOP))
        before = self.thread_of(self.filed()).last_message_at
        edited = {
            "type": "message",
            "subtype": "message_changed",
            "channel": "C0SUPPORT",
            "channel_type": "channel",
            "hidden": True,
            "ts": "1792041500.000100",
            "message": {
                "user": "U0FAIZ",
                "text": "<@U0CARL> can you take this?",
                "ts": reply_ts,
                "thread_ts": TOP,
            },
        }
        self.send(edited)
        made = self.filed()
        self.assertEqual(made.people["U0CARL"]["name"], "Carl Lee")
        self.assertEqual(self.thread_of(made).last_message_at, before)  # still quiet (SC3-25)
        self.slack_api.calls.clear()
        self.send(edited, retry=1)
        self.assertNotIn("users.info", [name for name, _b, _q in self.slack_api.calls])

    def test_deletes_remove_a_reply_mark_a_top_and_forget_a_waiting_one(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply_ts = "1792041460.000100"
        self.send(message("C0SUPPORT", reply_ts, "Still failing", thread_ts=TOP))

        def deleted(ts, thread=None):
            return {
                "type": "message",
                "subtype": "message_deleted",
                "channel": "C0SUPPORT",
                "channel_type": "channel",
                "hidden": True,
                "ts": "1792041600.000100",
                "deleted_ts": ts,
                "previous_message": {"ts": ts, "thread_ts": thread or ts, "user": "U0FAIZ"},
            }

        self.send(deleted(reply_ts, TOP))
        self.assertEqual(len(self.filed().messages), 1)
        self.send(deleted(TOP))
        self.assertEqual(self.filed().messages[0]["text"], sync.DELETED)
        waiting = "1792041700.000100"
        self.send(message("C0SUPPORT", waiting, "Anyone seeing slow dashboards?"))
        self.send(deleted(waiting))
        self.assertFalse(UnmatchedItem.objects.filter(external_id=f"C0SUPPORT:{waiting}").exists())

    def test_a_new_channel_is_joined_at_once_with_the_scope(self):
        self.slack_api.channels["C0FRESH"] = []
        self.slack_api.names["C0FRESH"] = "alfiee-escalations"
        created = {
            "type": "channel_created",
            "channel": {"id": "C0FRESH", "name": "alfiee-escalations", "creator": "U0FAIZ"},
        }
        self.send(created)
        row = SlackChannel.objects.get(channel_id="C0FRESH")
        self.assertEqual((row.name, row.is_member), ("alfiee-escalations", False))
        self.slack.granted_scopes = [*self.slack.granted_scopes, "channels:join"]
        self.slack.save(update_fields=["granted_scopes"])
        self.slack_api.channels["C0FRESH2"] = []
        self.send({**created, "channel": {"id": "C0FRESH2", "name": "fresh-two"}})
        self.assertTrue(SlackChannel.objects.get(channel_id="C0FRESH2").is_member)
        self.assertIn(("conversations.join", 2), self.slack_api.timeouts)

    def test_a_failure_while_filing_answers_200_and_queues_the_thread(self):
        with patch.object(sync, "file_conversation", side_effect=RuntimeError("boom")):
            self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [TOP])

    def test_one_connection_s_failure_never_drops_the_event_for_the_team_s_others(self):
        """F7: each connection of the team files on its own."""
        from django.db import DatabaseError

        other = self.connector("slack", "ops")
        other.set_credentials({"bot_token": "xoxb-test-only"})
        other.config = dict(self.slack.config)
        other.status = Connector.Status.CONNECTED
        other.save()
        SlackChannel.objects.create(
            connector=other, channel_id="C0SUPPORT", name="support", is_member=True
        )
        real = slack_events._row

        def failing(connector, *args, **kwargs):
            if connector.pk == self.slack.pk:
                raise DatabaseError("lost")
            return real(connector, *args, **kwargs)

        with (
            patch.object(slack_events, "_row", failing),
            self.assertLogs("services.connectors.slack_events", "WARNING") as logs,
        ):
            self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.assertTrue(SlackConversation.objects.filter(connector=other, thread_ts=TOP).exists())
        self.assertFalse(SlackConversation.objects.filter(connector=self.slack).exists())
        self.assertNotIn("lost", " ".join(logs.output))

    def test_a_redelivered_top_locks_the_stored_conversation(self):
        """F3: filing a thread we hold locks its row, so a catch-up and an
        event filing it at once never overwrite each other."""
        event = message("C0SUPPORT", TOP, "Pizza Hut exports fail")
        self.send(event)
        with CaptureQueriesContext(connection) as queries:
            self.send(event, retry=1)
        table = SlackConversation._meta.db_table
        reads = [q["sql"] for q in queries if q["sql"].startswith("SELECT") and table in q["sql"]]
        self.assertTrue(reads)
        self.assertTrue(all("FOR UPDATE" in sql for sql in reads), reads)

    def test_a_reply_event_costs_a_fixed_number_of_queries(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply = message("C0SUPPORT", "1792041460.000100", "Still failing", thread_ts=TOP)
        with CaptureQueriesContext(connection) as queries:
            self.send(reply)
        self.assertEqual(len(queries), SLACK_EVENT_REPLY_QUERIES)
