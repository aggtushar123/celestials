"""End-to-end tier: real server, real HTTP, real test DB; Slack and Jira are
fakes (their APIs in memory), the model is a fake. Nothing leaves the process.

Journey (Slack escalations D4, LC-D4a to LC-D4d): Alice connects #support and
Jira (SUP). Carl (who owns Pizza Hut) posts "Pizza Hut CSV exports fail";
Jesh (Engineering, who can't open Pizza Hut) replies "<@U0FAIZ> can you take
this?". The sync learns who everyone is by their Slack emails; the agents
read the decision: one bundle for Faiz, the reply last. Jesh, a participant,
sees it in his Work in the participant view and runs it: the issue is made
with the thread's link and a remote link, filed under Pizza Hut at once and
linked both ways; the Jira assignment is skipped with its note (Faiz has no
Jira account); the to-do goes to Carl (Faiz can't open Pizza Hut); the reply
in the thread carries the real key and link. "cc <@U0FAIZ>" decides nothing;
"Thanks, all good" makes no bundle."""

import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_post
from services.accounts.models import User
from services.agents.models import AgentBundle, SignalThread
from services.connectors.models import Connector, SlackChannel, SlackTagCheck
from services.customers.models import SlackConversation, Task, Ticket
from services.knowledge.models import FunctionOwner

ISSUE = {
    "kind": "jira.create",
    "title": "Log the export failure",
    "rationale": "Exports fail.",
    "payload": {
        "summary": "CSV exports fail",
        "description": "Every export fails.",
        "priority": "high",
    },
}


class SlackEscalationFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        self.use_world_fakes()

    def member(self, org, email, name, function):
        return User.objects.create_user(
            email=email, password="memberpass12", name=name, organisation=org, function=function
        )

    def sync(self, passes=3):
        """D3 (SC3-6): one channel a pass, at least a minute apart; a few passes
        read the page, then the threads it found."""
        for _ in range(passes):
            SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
            call_command("sync_tickets", stdout=StringIO(), stderr=StringIO())
        # Channel tag to-dos: a tag waits for its check on the deliver tick (the intake
        # leaves the thread meanwhile). Here no check finds a request, so the decision
        # stays the intake's, as before; a request would be handed to the one tagged.
        with patch(
            "services.copilot.anthropic_client.get_completion",
            return_value=json.dumps({"request": False, "todo": ""}),
        ):
            call_command("deliver_pending", stdout=StringIO())
        self.assertFalse(SlackTagCheck.objects.exists())

    def test_the_whole_journey(self):
        alice, carl, pizza = self.workspace()
        org = carl.organisation
        self.slack.scopes.append("chat:write")
        slack, jira, _ = self.connect_slack_and_jira(alice)
        for row in (slack, jira):
            status, body = http_post(
                self.api(f"/connectors/{row['id']}/agents/"), {"can_act": True}, token=alice
            )
            self.assertEqual(status, 200, body)
        # Owner answer: the Jira connection's department stays blank, so everyone reads its tickets.
        Connector.objects.filter(pk=jira["id"]).update(department="")
        self.member(org, "jesh@acme.io", "Jesh Sanghvi", User.Function.ENGINEERING)
        faiz = self.member(org, "faiz@acme.io", "Faiz Jamal", User.Function.CS)
        self.slack.users["U0JESH"] = {
            "real_name": "Jesh Sanghvi",
            "profile": {"email": "jesh@acme.io"},
        }
        # Pizza Hut's engineer on the account team is Ivy, not Jesh: Jesh can't open Pizza Hut.
        ivy = self.member(org, "ivy@acme.io", "Ivy Eng", User.Function.ENGINEERING)
        FunctionOwner.objects.create(customer=pizza, function="engineering", user=ivy)

        # 1. Carl's message and Jesh's decision become one conversation (LC-D4a).
        self.slack.channels["C0SUPPORT"] = []
        top = self.slack.say("C0SUPPORT", "U0CARL", "Pizza Hut CSV exports fail, urgent")
        self.slack.say("C0SUPPORT", "U0JESH", "<@U0FAIZ> can you take this?", thread_ts=top)
        self.sync()
        conversation = SlackConversation.objects.get()
        self.assertEqual(conversation.people["U0FAIZ"], {"name": "Faiz Jamal", "member": faiz.pk})
        thread = SignalThread.objects.get(conversation=conversation)
        said = {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "<@U0FAIZ>"}
        bundle = self.read_thread(
            org, thread, "message ", [ISSUE], extra={"function": "engineering", "decision": said}
        )

        # 2. Jesh took part: it is in his Work, in the participant view.
        jesh_token = self.login("jesh@acme.io")
        status, feed = http_get(self.api("/work/feed/?kind=bundle"), jesh_token)
        self.assertEqual(status, 200, feed)
        decide = next(g for g in feed["groups"] if g["key"] == "decide")
        self.assertIn(bundle.pk, [i["id"] for i in decide["items"] if i["kind"] == "bundle"])
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), jesh_token)
        self.assertEqual(status, 200, detail)
        self.assertEqual(
            [s["kind"] for s in detail["steps"]],
            ["jira.create", "jira.assign", "task.create", "slack.reply"],
        )
        self.assertEqual((detail["participant_view"], detail["reason"]), (True, ""))
        self.assertEqual(detail["escalation"]["handler"]["name"], "Faiz Jamal")
        self.assertEqual(
            detail["escalation"]["decision"],
            {
                "by": "Jesh Sanghvi",
                "quote": "@Faiz Jamal can you take this?",
                "named": "Faiz Jamal",
            },
        )

        # 3. Jesh runs it (LC-D4b).
        rows = [{"id": s["id"], "selected": True} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=jesh_token
        )
        self.assertEqual(status, 200, body)
        create, assign, todo, reply = body["bundle"]["steps"]
        self.assertEqual(create["status"], "applied", create["error"])
        key = create["outputs"]["ticket_key"]
        self.assertEqual(self.jira.remote_links[0][0], key)
        self.assertIn(conversation.url, str(self.jira.issues[key]["fields"]["description"]))
        self.assertEqual(
            (assign["status"], assign["note"]),
            (
                "skipped",
                "Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work.",
            ),
        )
        self.assertEqual(todo["status"], "applied", todo["error"])
        self.assertEqual(reply["status"], "applied", reply["error"])
        # Faiz can't open Pizza Hut: the to-do goes to its owner (SE4-4).
        self.assertEqual(Task.objects.get(customer=pizza).assignee_id, carl.pk)
        [post] = [p for p in self.slack.posts("C0SUPPORT") if p.get("thread_ts")]
        self.assertIn(f"{key} (https://acme.atlassian.net/browse/{key})", post["text"])
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "done")

        # 4. Under Pizza Hut at once, linked both ways (as Carl, who owns it).
        carl_token = self.login("carl@acme.io")
        ticket = Ticket.objects.get(external_id=key)
        self.assertEqual((ticket.customer_id, ticket.conversation_id), (pizza.pk, conversation.pk))
        story = self.api(f"/organizations/{pizza.pk}/story/")
        status, tickets = http_get(f"{story}?group=tickets", carl_token)
        self.assertEqual(status, 200, tickets)
        [item] = [i for i in tickets["items"] if i["kind"] == "ticket"]
        self.assertEqual(item["from_slack"]["id"], conversation.pk)
        status, talk = http_get(f"{story}?group=conversations", carl_token)
        self.assertEqual(status, 200, talk)
        [item] = [i for i in talk["items"] if i["kind"] == "slack"]
        self.assertEqual([t["number"] for t in item["tickets"]], [key])

        # 5. A bare mention decides nothing: the account team has it (LC-D4c).
        cc = self.slack.say("C0SUPPORT", "U0CARL", "Pizza Hut invoices look off")
        self.slack.say("C0SUPPORT", "U0JESH", "cc <@U0FAIZ>", thread_ts=cc)
        self.sync()
        second = SignalThread.objects.exclude(pk=thread.pk).get()
        bare = {"message": 2, "quote": "cc <@U0FAIZ>", "assignee": "<@U0FAIZ>"}
        made = self.read_thread(
            org, second, "message ", [ISSUE], extra={"function": "engineering", "decision": bare}
        )
        self.assertEqual(
            (made.escalation["via"], made.escalation["user_id"], made.escalation["decision"]),
            ("team", ivy.pk, None),
        )

        # 6. Small talk makes no bundle (LC-D4d).
        self.slack.say("C0SUPPORT", "U0CARL", "Pizza Hut thanks, all good now")
        self.sync()
        third = SignalThread.objects.exclude(pk__in=[thread.pk, second.pk]).get()
        with self.assertRaises(AgentBundle.DoesNotExist):
            self.read_thread(org, third, "message ", [], extra={"function": None})
