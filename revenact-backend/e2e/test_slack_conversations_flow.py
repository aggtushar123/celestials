"""End-to-end tier: real server, real HTTP, real test DB; Slack is a fake (its
API in memory), the model is a fake. Nothing leaves the process.

Journey (Slack escalations D1, LC-D1a to LC-D1c; D3 reads every public
channel, so Alice connects the workspace and the bot is already in
#support). A colleague posts "Pizza Hut
exports fail" and a reply; the sync files one Slack conversation under Pizza
Hut, shown in the story's conversations (never its tickets) and readable
whole at its own route; a colleague's later reply lands in it. A message
naming no customer waits under "Needs a customer" with nothing mentioned;
Carl matches it to Pizza Hut and the story shows two. The agents read the
first conversation and propose a bundle whose slack.reply names it; Carl
runs it, it is posted in the thread, and the next sync stores our reply, so
the thread reads answered."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_post
from services.agents import intake
from services.agents.models import AgentAction, AgentBundle, SignalThread
from services.connectors.models import SlackChannel
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import SlackConversation, Ticket


class SlackConversationsFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        no_model.start()
        self.addCleanup(no_model.stop)
        self.slack = use_slack(self, FakeSlackApi())
        # D3: every public channel syncs; this world has #support only
        del self.slack.channels["C0ESCALATE"], self.slack.names["C0ESCALATE"]
        self.slack.members.discard("C0ESCALATE")

    def sync(self, passes=3):
        """D3: one channel a pass, at least a minute apart; a few passes read
        the page, then the threads it found."""
        for _ in range(passes):
            SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
            call_command("sync_tickets", stdout=StringIO(), stderr=StringIO())

    def test_the_whole_journey(self):
        alice, carl, pizza = self.workspace()
        org = carl.organisation

        # 1. Alice connects the workspace: no channel to name.
        status, slack = http_post(
            self.api("/connectors/"),
            {"provider": "slack", "name": "Support Slack", "department": "cs"},
            token=alice,
        )
        self.assertEqual(status, 201, slack)
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"), {"bot_token": "xoxb-e2e"}, token=alice
        )
        self.assertEqual(status, 201, body)

        # 2. A colleague's message and reply become one conversation under Pizza Hut.
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack.say("C0SUPPORT", "U0FAIZ", "Still failing.", thread_ts=top)
        self.sync()
        carl_token = self.login("carl@acme.io")
        story = self.api(f"/organizations/{pizza.pk}/story/")
        status, body = http_get(f"{story}?group=conversations", carl_token)
        self.assertEqual(status, 200, body)
        [item] = [i for i in body["items"] if i["kind"] == "slack"]
        self.assertIn("1 reply", item["summary"])
        status, body = http_get(f"{story}?group=tickets", carl_token)
        self.assertEqual(status, 200, body)
        self.assertEqual([i for i in body["items"] if i["kind"] == "slack"], [])
        status, detail = http_get(self.api(f"/slack-conversations/{item['id']}/"), carl_token)
        self.assertEqual(status, 200, detail)
        self.assertEqual(
            [m["text"] for m in detail["messages"]], ["Pizza Hut exports fail", "Still failing."]
        )
        conversation = SlackConversation.objects.get(pk=item["id"])

        # 2b. A colleague's later reply lands in the same conversation (LC-D1b).
        self.slack.users["U0DANA"] = {"real_name": "Dana CSM", "profile": {"email": "d@acme.io"}}
        self.slack.say("C0SUPPORT", "U0DANA", "Looking now.", thread_ts=top)
        self.sync()
        status, detail = http_get(self.api(f"/slack-conversations/{item['id']}/"), carl_token)
        self.assertEqual(status, 200, detail)
        self.assertEqual(
            [(m["name"], m["text"]) for m in detail["messages"]][1:],
            [("Faiz Jamal", "Still failing."), ("Dana CSM", "Looking now.")],
        )
        self.assertEqual(SlackConversation.objects.count(), 1)

        # 3. A message naming no customer waits; matching it files a second conversation.
        self.slack.say("C0SUPPORT", "U0FAIZ", "Anyone seen the new dashboard?")
        self.sync()
        status, listed = http_get(self.api("/work/unmatched/?queue=department:cs"), carl_token)
        self.assertEqual(status, 200, listed)
        [row] = listed["items"]
        self.assertEqual(row["mentioned"], [])
        status, matched = http_post(
            self.api(f"/work/unmatched/{row['id']}/match/"),
            {"customer_id": pizza.pk},
            token=carl_token,
        )
        self.assertEqual(status, 200, matched)
        self.assertIn("conversation", matched)
        status, body = http_get(f"{story}?group=conversations", carl_token)
        self.assertEqual(len([i for i in body["items"] if i["kind"] == "slack"]), 2)

        # 4. The agents read the first conversation: a bundle whose reply names it.
        thread = SignalThread.objects.get(conversation=conversation)
        SignalThread.objects.filter(pk=thread.pk).update(
            last_message_at=timezone.now() - timedelta(minutes=20)
        )
        bundle = self.read_thread(
            org,
            thread,
            "message ",
            [
                {
                    "kind": "slack.reply",
                    "title": "Tell the team we are on it",
                    "rationale": "Exports have failed all morning.",
                    "payload": {"text": "We are on it."},
                }
            ],
        )
        step = AgentAction.objects.get(bundle=bundle, kind="slack.reply")
        self.assertEqual(step.payload["conversation_id"], conversation.pk)
        self.assertNotIn("ticket_id", step.payload)

        # 5. Alice lets agents post; Carl runs it: one bot message in the thread.
        self.slack.scopes.append("chat:write")
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True), body)
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertEqual(status, 200, detail)
        rows = [{"id": s["id"], "selected": True} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=carl_token
        )
        self.assertEqual(status, 200, body)
        [post] = self.slack.posts("C0SUPPORT")
        self.assertEqual(post["thread_ts"], conversation.thread_ts)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "done")

        # 6. The next sync stores our reply; the thread reads answered.
        self.sync()
        conversation.refresh_from_db()
        self.assertTrue(conversation.messages[-1]["bot"])
        thread.refresh_from_db()
        self.assertEqual(intake.answered(thread), "answered")
        self.assertFalse(Ticket.objects.exists())
