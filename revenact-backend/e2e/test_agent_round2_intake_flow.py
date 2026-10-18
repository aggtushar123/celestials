"""End-to-end tier: real server, real HTTP, real test DB; Slack is a fake
(its API in memory), the model is a fake. Nothing leaves the process.

Journey (round 2 D3): Ann, whom no customer knows, writes in Alfee's synced
Slack support channel. The sync keeps her message; Carl (CS) sees it under
"Needs a customer" in the CS queue with a count on the rail (a colleague's
message waits there too), matches it to Pizza Hut (a Slack message is from
no contact, so adding one is refused) and the interval run reads the
conversation it makes and proposes a bundle. Alice switches the fast lane on
with the word "outage"; Ann writes again naming Pizza Hut ("Total outage"),
filed there by the name, and the fast tick reads it two quiet minutes later,
its call marked fast_lane. A second unknown message is dismissed and its
text is gone."""

import json
from datetime import timedelta
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_patch, http_post
from services.accounts.models import Organisation
from services.agents import evidence, routing
from services.agents.models import AgentBundle, SignalThread
from services.connectors.models import SlackChannel, UnmatchedItem
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Contact, SlackConversation, Ticket
from services.work.clock import today_for


class PeopleSlackApi(FakeSlackApi):
    """FakeSlackApi whose users.info answers each user's own profile."""

    def __init__(self):
        super().__init__()
        self.users = {}

    def _route(self, name, query, body):
        if name == "users.info":
            real_name, email = self.users[query["user"]]
            return {"ok": True, "user": {"real_name": real_name, "profile": {"email": email}}}, {}
        return super()._route(name, query, body)


class WiderIntakeFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        no_model.start()
        self.addCleanup(no_model.stop)
        self.slack = use_slack(self, PeopleSlackApi())
        # D3: the connection reads every public channel; this world has one
        del self.slack.channels["C0ESCALATE"]
        self.slack.members.discard("C0ESCALATE")
        self.next_ts = int(timezone.now().timestamp()) - 3600
        self.model_calls_marked_fast = False

    def world(self):
        """Alice's workspace: Carl (CS) owns Pizza Hut, Dana is a colleague,
        a CS Slack connector syncs C0SUPPORT."""
        alice, carl, pizza = self.workspace()
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": "Dana CSM", "email": "dana@acme.io", "password": "memberpass12"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        status, slack = http_post(
            self.api("/connectors/"),
            {"provider": "slack", "name": "Support Slack", "department": "cs"},
            token=alice,
        )
        self.assertEqual(status, 201, slack)
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"),
            {"channel": "C0SUPPORT", "bot_token": "xoxb-e2e"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        return SimpleNamespace(org=carl.organisation, carl=carl, pizza=pizza)

    def say(self, user, email, name, text):
        """`user` (with `email`) posts `text` in #support, newest message."""
        self.next_ts += 60
        self.slack.users[user] = (name, email)
        self.slack.channels["C0SUPPORT"].append(
            {"ts": f"{self.next_ts}.000100", "user": user, "text": text}
        )

    def sync(self):
        # D3 (SC3-6): the catch-up reads at most once a minute and from where it
        # last read; this world's messages are stamped an hour back, so read afresh
        SlackChannel.objects.update(asked_at=None, read_at=None)
        call_command("sync_tickets", stdout=StringIO(), stderr=StringIO())

    def read_after_quiet(self, thread, lane, minutes=20):
        """`thread` has been quiet `minutes`; the `lane` run reads it with a
        model that answers a note citing the thread's message (a note of its
        own per lane: the same note again would be the waiting one's twin)."""
        SignalThread.objects.filter(pk=thread.pk).update(
            last_message_at=timezone.now() - timedelta(minutes=minutes)
        )
        Organisation.objects.update(ai_signals_ran_at=None, ai_fast_ran_at=None)
        thread.refresh_from_db()
        org = thread.organisation
        route, _ = routing.route(thread)
        ctx = evidence.build_for_thread(org, "cs", thread, route, today=today_for(org))
        line = next(
            x
            for x in sorted(evidence.record_lines(ctx, ctx.thread_ref))
            if x.startswith("message ")
        )
        answer = {
            "title": "Pizza Hut: exports fail",
            "reason": "Ann's exports fail.",
            "actions": [
                {
                    "kind": "note.create",
                    "record": ctx.thread_ref,
                    "title": "Log the export failure",
                    "rationale": "Exports fail since the update.",
                    "evidence": [line],
                    "payload": {"title": f"Read in the {lane} lane", "body": "Since the update."},
                }
            ],
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch(
                "services.agents.intake.get_completion", return_value=json.dumps(answer)
            ) as model,
        ):
            call_command("run_agent_signals", "--lane", lane, stdout=StringIO(), stderr=StringIO())
        self.assertEqual(model.call_count, 1)
        self.model_calls_marked_fast = model.call_args.kwargs.get("scope_key") == "fast_lane"

    def test_a_stranger_is_matched_then_read_fast(self):
        world = self.world()
        self.say("U9", "ann@newco.io", "Ann Lee", "Our exports fail since the update.")
        self.say("U2", "dana@acme.io", "Dana CSM", "I'll look at it.")  # a colleague
        self.sync()
        self.assertFalse(SignalThread.objects.exists())  # no model ever reads an unmatched item
        carl = self.login("carl@acme.io")

        # Carl sees both messages under "Needs a customer" (Slack keeps a
        # colleague's too) and matches Ann's to Pizza Hut.
        status, rail = http_get(self.api("/work/queues/"), carl)
        self.assertEqual(status, 200, rail)
        cs = next(row for row in rail["queues"] if row["key"] == "department:cs")
        self.assertEqual(cs["needs_customer"], 2)
        status, listed = http_get(self.api("/work/unmatched/?queue=department:cs"), carl)
        self.assertEqual(status, 200, listed)
        self.assertEqual({row["number"] for row in listed["items"]}, {"#support"})
        self.assertFalse(any(row["can_add_contact"] for row in listed["items"]))
        self.assertEqual(
            sorted(row["from"]["name"] for row in listed["items"]), ["Ann Lee", "Dana CSM"]
        )
        ann = next(row for row in listed["items"] if row["from"]["name"] == "Ann Lee")
        status, body = http_post(
            self.api(f"/work/unmatched/{ann['id']}/match/"),
            {"customer_id": world.pizza.pk, "add_contact": True},
            token=carl,
        )
        self.assertEqual(status, 400, body)
        self.assertTrue(UnmatchedItem.objects.filter(pk=ann["id"], status="waiting").exists())
        status, body = http_post(
            self.api(f"/work/unmatched/{ann['id']}/match/"),
            {"customer_id": world.pizza.pk},
            token=carl,
        )
        self.assertEqual(status, 200, body)
        self.assertIsNone(body["ticket"])
        self.assertFalse(body["contact_added"])
        self.assertFalse(Contact.objects.filter(email="ann@newco.io").exists())
        status, rail = http_get(self.api("/work/queues/"), carl)
        cs = next(row for row in rail["queues"] if row["key"] == "department:cs")
        self.assertEqual(cs["needs_customer"], 1)

        # The interval run reads the matched thread and proposes a bundle.
        thread = SignalThread.objects.get(conversation_id=body["conversation"]["id"])
        self.assertEqual(thread.conversation.customer_id, world.pizza.pk)
        self.assertEqual(thread.urgent_rule, "")
        self.read_after_quiet(thread, lane="interval")
        self.assertTrue(AgentBundle.objects.filter(thread=thread).exists())
        self.assertFalse(self.model_calls_marked_fast)

        # Alice switches the fast lane on for "outage"; Ann's new message names
        # Pizza Hut, so it is filed there and is urgent.
        alice = self.login("alice@acme.io", "supersecret1")
        status, body = http_patch(
            self.api("/agents/settings/"),
            {"fast_lane": {"on": True, "rules": {"words": ["outage"]}}},
            token=alice,
        )
        self.assertEqual(status, 200, body)
        self.say("U9", "ann@newco.io", "Ann Lee", "Pizza Hut: total outage now, nobody can log in.")
        self.sync()
        urgent = SignalThread.objects.exclude(urgent_rule="").get()
        self.assertEqual((urgent.urgent_rule, urgent.customer_id), ("word", world.pizza.pk))
        self.assertEqual(urgent.conversation.matched_by, SlackConversation.MatchedBy.NAME)
        self.assertNotEqual(urgent.pk, thread.pk)
        self.read_after_quiet(urgent, lane="fast", minutes=3)
        self.assertTrue(self.model_calls_marked_fast)
        self.assertTrue(AgentBundle.objects.filter(thread=urgent).exists())

        # A second stranger is dismissed: the text is gone at once.
        self.say("U8", "bob@unknown.io", "Bob", "Spam spam spam.")
        self.sync()
        bob = UnmatchedItem.objects.get(requester_name="Bob")
        status, body = http_post(self.api(f"/work/unmatched/{bob.pk}/dismiss/"), {}, token=carl)
        self.assertEqual(status, 200, body)
        bob.refresh_from_db()
        self.assertEqual(
            (bob.status, bob.title, bob.excerpt, bob.requester_name, bob.requester_email),
            ("dismissed", "", "", "", ""),
        )

        # No Slack message made a ticket; the steps are audited.
        self.assertFalse(Ticket.objects.exists())
        actions = set(AuditEvent.objects.values_list("action", flat=True))
        self.assertLessEqual(
            {"conversation.matched", "unmatched.dismissed", "agents.settings_update"}, actions
        )
        self.assertNotIn("ticket.matched", actions)
