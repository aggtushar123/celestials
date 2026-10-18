"""Channel tag to-dos (owner, 2026-10-18): a message in a synced channel that
tags colleagues and asks them to do something hands it to each tagged
colleague who could read it, as Send to Revenact would, from its author, on
the per-minute `deliver` tick. A casual tag makes nothing; the intake never
also plans for a handed-over message. Slack and the model are fakes."""

import json
import time
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.agents import intake
from services.agents.models import SignalThread
from services.agents.tests.slack_bundle_fixtures import SlackBundleFixture
from services.connectors import slack_interactivity, slack_tag_checks, sync
from services.connectors.models import SlackChannel, SlackTagCheck
from services.connectors.providers.base import RemoteThread
from services.connectors.providers.slack import message_url, ts_time
from services.connectors.tests.slack_events_fixtures import SIGNING, envelope, message, post
from services.connectors.tests.slack_fake import use_slack
from services.connectors.tests.test_slack_link_views import slack_link_for
from services.copilot.anthropic_client import BudgetExceeded
from services.customers.models import SlackConversation, Task
from services.notifications.models import Notification
from services.work.models import SlackSuggestion

MODEL = "services.copilot.anthropic_client.get_completion"
BUNDLE_MODEL = "services.agents.slack_bundles.get_completion"
ASK = "<@U0MONA> can you please check the most recent grievance from Pizza Hut?"
TODO = "Check the most recent grievance from Pizza Hut"


def fresh_ts(offset=0):
    return f"{int(time.time()) - 5 + offset}.000100"


@override_settings(SLACK_SIGNING_SECRET=SIGNING)
class SlackTagCheckTests(SlackBundleFixture):
    def setUp(self):
        super().setUp()
        self.channel = self.slack_connector()
        # A synced channel set to Pizza Hut (Carl owns it, as Jesh owns Spotify).
        SlackChannel.objects.filter(connector=self.channel).update(customer=self.pizza)
        self.api = use_slack(self)
        self.api.users.update(
            {
                "U0MONA": {"real_name": "Mona Manager", "profile": {"email": "mona@acme.io"}},
                "U0DANA": {"real_name": "Dana CSM", "profile": {"email": "dana@acme.io"}},
                "U0OUT": {"real_name": "Out Sider", "profile": {"email": "out@else.io"}},
            }
        )
        slack_link_for(self.csm)  # Carl is U0CARL
        self.calls = []
        self.answer = {"request": True, "todo": TODO}
        model = patch(MODEL, side_effect=self._model)
        model.start()
        self.addCleanup(model.stop)
        # The handed copy's plan is proposed on the same tick: no step, no bundle.
        bundles = patch(BUNDLE_MODEL, return_value=json.dumps({"title": "x", "reason": "y"}))
        bundles.start()
        self.addCleanup(bundles.stop)

    def _model(self, system, messages, **kwargs):
        self.calls.append((kwargs.get("purpose"), messages[0]["content"]))
        if isinstance(self.answer, Exception):
            raise self.answer
        return json.dumps(self.answer)

    def tag_calls(self):
        return [c for c in self.calls if c[0] == "slack_tag_request"]

    def post_message(self, text=ASK, *, ts=None, user="U0CARL", channel="C0SUPPORT", **extra):
        ts = ts or fresh_ts()
        event = message(channel, ts, text, user=user, **extra)
        answer = post(APIClient(), envelope(event))
        self.assertEqual(answer.status_code, 200, answer.content)
        return ts

    def tick(self):
        call_command("deliver_pending", stdout=StringIO())

    # --- a request ----------------------------------------------------------
    def test_a_request_tag_gives_the_colleague_a_task_from_the_author(self):
        ts = self.post_message()
        check = SlackTagCheck.objects.get()
        self.assertEqual((check.author, check.message_ts, check.state), (self.csm, ts, "pending"))
        self.assertEqual(self.tag_calls(), [])  # nothing asked while Slack waits
        self.tick()
        task = Task.objects.get()
        self.assertEqual(
            (task.title, task.assignee, task.created_by, task.customer),
            (TODO, self.mona, self.csm, self.pizza),
        )
        self.assertIsNotNone(task.due_date)
        self.assertIn("Sent from Slack by Carl", task.description)
        note = Notification.objects.get(recipient=self.mona)
        self.assertEqual((note.kind, note.actor), ("task_assigned", self.csm))
        theirs = SlackSuggestion.objects.get(owner=self.mona)
        self.assertEqual(
            (theirs.handed_from, theirs.task, theirs.customer, theirs.message_ts),
            (self.csm, task, self.pizza, ts),
        )
        self.assertEqual(theirs.permalink, message_url("C0SUPPORT", ts))
        # Its plan was proposed on the same tick (no step here), theirs alone.
        self.assertEqual(theirs.bundle_state, "none")
        # No copy for the author: nobody clicked.
        self.assertFalse(SlackSuggestion.objects.filter(owner=self.csm).exists())
        self.assertEqual(self.items(self.mona, "slack_message"), [])  # the card is hidden
        self.assertFalse(SlackTagCheck.objects.exists())  # purged once handled
        [(_, content)] = self.tag_calls()
        self.assertIn('"@Mona Manager can you please check', content)  # quoted as data
        event = AuditEvent.objects.get(action="slack.tag_handed_over")
        self.assertEqual(event.actor, self.csm)
        self.assertEqual(
            event.metadata,
            {
                "connector": self.channel.pk,
                "handed_to": [self.mona.pk],
                "handed": 1,
                "tasks": [task.pk],
                "not_in_channel": 0,
            },
        )
        self.assertNotIn("Pizza", json.dumps(event.metadata))

    def items(self, user, kind):
        body = self.client_for(user).get("/api/v1/work/feed/").json()
        return [i for g in body["groups"] for i in g["items"] if i["kind"] == kind]

    def test_a_colleague_who_cannot_open_the_record_gets_a_plain_to_do(self):
        self.post_message("<@U0DANA> please check the most recent grievance from Pizza Hut")
        self.tick()
        task = Task.objects.get()
        self.assertEqual((task.assignee, task.customer, task.due_date), (self.other, None, None))
        self.assertIsNone(SlackSuggestion.objects.get(owner=self.other).customer)
        note = Notification.objects.get(recipient=self.other)
        self.assertEqual(note.message, f"Carl CSM sent you “{TODO}” from Slack.")

    def test_a_reply_in_a_thread_that_asks_counts_too(self):
        top = self.post_message("Pizza Hut raised a grievance this morning")
        self.assertFalse(SlackTagCheck.objects.exists())
        reply = self.post_message(ASK, ts=fresh_ts(1), thread_ts=top)
        self.tick()
        theirs = SlackSuggestion.objects.get(owner=self.mona)
        self.assertEqual(theirs.message_ts, reply)
        self.assertEqual(theirs.permalink, message_url("C0SUPPORT", reply, top))

    def test_the_catch_up_queues_a_check_too(self):
        ts = fresh_ts()
        remote = RemoteThread(
            thread_ts=ts,
            channel="C0SUPPORT",
            text=ASK,
            user_id="U0CARL",
            user_name="Carl CSM",
            user_email="carl@acme.io",
            posted_at=ts_time(ts),
            latest_reply="",
            replies=[],
            url=message_url("C0SUPPORT", ts),
            people={"U0CARL": {"name": "Carl CSM", "email": "carl@acme.io"}},
        )
        with self.captureOnCommitCallbacks(execute=True):
            sync.file_conversation(self.channel, remote, [], now=timezone.now())
        self.assertEqual(SlackTagCheck.objects.get().message_ts, ts)
        self.tick()
        self.assertEqual(Task.objects.get().assignee, self.mona)

    # --- nothing --------------------------------------------------------------
    def test_a_casual_tag_makes_nothing(self):
        self.answer = {"request": False, "todo": ""}
        self.post_message("Thanks <@U0MONA> for the help on Pizza Hut!")
        self.tick()
        self.assertEqual(len(self.tag_calls()), 1)
        self.assertFalse(Task.objects.exists())
        self.assertFalse(SlackSuggestion.objects.exists())
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_no_tag_or_a_self_tag_queues_nothing(self):
        self.post_message("Pizza Hut raised a grievance")
        self.post_message("<@U0CARL> note to self: check Pizza Hut", ts=fresh_ts(1))
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_an_author_who_is_not_a_member_queues_nothing(self):
        self.post_message(ASK, user="U0OUT")
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_a_tagged_non_member_gets_nothing_and_costs_no_call(self):
        self.post_message("<@U0OUT> can you check the Pizza Hut grievance?")
        self.tick()
        self.assertEqual(self.tag_calls(), [])
        self.assertFalse(Task.objects.exists())

    def test_a_private_channel_hands_it_only_to_its_members(self):
        self.api.channels["G0PRIV"] = []
        self.api.names["G0PRIV"] = "private-cs"
        self.api.private.add("G0PRIV")
        self.api.channel_members["G0PRIV"] = ["U0CARL", "U0MONA"]
        SlackChannel.objects.create(
            connector=self.channel, channel_id="G0PRIV", is_private=True, customer=self.pizza
        )
        event = message(
            "G0PRIV",
            fresh_ts(),
            "<@U0MONA> <@U0DANA> please look at Pizza Hut's grievance",
            user="U0CARL",
        )
        event["channel_type"] = "group"
        post(APIClient(), envelope(event))
        self.tick()
        self.assertEqual(list(Task.objects.values_list("assignee", flat=True)), [self.mona.pk])
        self.assertFalse(SlackSuggestion.objects.filter(owner=self.other).exists())
        event = AuditEvent.objects.get(action="slack.tag_handed_over")
        self.assertEqual(event.metadata["not_in_channel"], 1)

    def test_an_edit_does_not_queue_again(self):
        ts = self.post_message()
        self.tick()
        edit = {
            "type": "message",
            "subtype": "message_changed",
            "channel": "C0SUPPORT",
            "channel_type": "channel",
            "message": {"ts": ts, "user": "U0CARL", "text": ASK + " Thanks!"},
        }
        post(APIClient(), envelope(edit))
        self.assertFalse(SlackTagCheck.objects.exists())
        self.assertEqual(Task.objects.count(), 1)

    # --- with Send to Revenact ------------------------------------------------
    def test_a_later_send_to_revenact_click_adds_no_second_task(self):
        ts = self.post_message()
        self.tick()
        payload = {
            "type": "message_action",
            "callback_id": "send_to_revenact",
            "team": {"id": "T0ACME"},
            "user": {"id": "U0CARL"},
            "channel": {"id": "C0SUPPORT"},
            "message_ts": ts,
            "message": {"type": "message", "user": "U0CARL", "ts": ts, "text": ASK},
            "response_url": "https://hooks.slack.com/actions/T/1/x",
        }
        with patch.object(slack_interactivity, "reply"):
            slack_interactivity.send_to_work(payload)
        self.assertEqual(Task.objects.filter(assignee=self.mona).count(), 1)
        self.assertEqual(SlackSuggestion.objects.filter(owner=self.mona).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.mona).count(), 1)

    # --- the intake -------------------------------------------------------------
    def test_the_intake_never_also_plans_for_a_handed_over_message(self):
        self.post_message()
        conversation = SlackConversation.objects.get()
        thread = SignalThread.objects.get(conversation=conversation)
        later = timezone.now() + timedelta(minutes=20)
        # Waiting for its check: the intake leaves it.
        self.assertNotIn(thread.pk, [t.pk for t in intake.pick(self.org, later)])
        self.tick()
        thread.refresh_from_db()
        self.assertEqual(
            (thread.status, thread.skip_reason, thread.processed_through),
            ("skipped", "handed_over", thread.last_message_at),
        )
        self.assertNotIn(thread.pk, [t.pk for t in intake.pick(self.org, later)])
        # A newer message wakes the thread as usual.
        self.post_message("Any news on Pizza Hut?", ts=fresh_ts(2), thread_ts=thread_ts(thread))
        self.assertIn(thread.pk, [t.pk for t in intake.pick(self.org, later)])

    def test_a_casual_tag_leaves_the_thread_to_the_intake(self):
        self.answer = {"request": False, "todo": ""}
        self.post_message("Thanks <@U0MONA>!")
        self.tick()
        later = timezone.now() + timedelta(minutes=20)
        thread = SignalThread.objects.get()
        self.assertIn(thread.pk, [t.pk for t in intake.pick(self.org, later)])

    # --- gates and failures -------------------------------------------------------
    def test_ai_off_makes_no_call_and_nothing(self):
        self.org.ai_agent_enabled = False
        self.org.save(update_fields=["ai_agent_enabled"])
        self.post_message()
        self.tick()
        self.assertEqual(self.tag_calls(), [])
        self.assertFalse(Task.objects.exists())
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_a_read_only_connection_makes_no_call_and_nothing(self):
        self.channel.agents_can_act = False
        self.channel.save(update_fields=["agents_can_act"])
        self.post_message()
        self.tick()
        self.assertEqual(self.tag_calls(), [])
        self.assertFalse(Task.objects.exists())

    def test_a_model_failure_is_retried_once_then_dropped(self):
        self.answer = BudgetExceeded("over")
        self.post_message()
        self.tick()
        check = SlackTagCheck.objects.get()
        self.assertEqual((check.state, check.attempts), ("pending", 1))
        self.tick()
        self.assertFalse(SlackTagCheck.objects.exists())
        self.assertEqual(len(self.tag_calls()), 2)
        self.assertFalse(Task.objects.exists())

    def test_a_retry_that_answers_hands_it_over(self):
        self.answer = BudgetExceeded("over")
        self.post_message()
        self.tick()
        self.answer = {"request": True, "todo": TODO}
        self.tick()
        self.assertEqual(Task.objects.get().assignee, self.mona)

    def test_an_old_check_expires_without_a_call(self):
        self.post_message()
        SlackTagCheck.objects.update(created_at=timezone.now() - timedelta(hours=2))
        counts = slack_tag_checks.run_pending()
        self.assertEqual(counts["expired"], 1)
        self.assertEqual(self.tag_calls(), [])
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_an_old_message_is_never_queued(self):
        self.post_message(ts=f"{int(time.time()) - 7200}.000100")
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_one_query_when_nothing_waits(self):
        with self.assertNumQueries(1):
            slack_tag_checks.run_pending()


def thread_ts(thread):
    return thread.external_id.rsplit(":", 1)[1]
