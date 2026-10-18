"""End-to-end tier: real server, real HTTP, real test DB; Slack is the fake
(its API in memory) and its events are signed with a per-run secret.
Nothing leaves the process.

Journey (Slack escalations D3, LC-D3a to LC-D3d): Alice connects Slack with a
token that can't join channels yet: the pass lists every public channel;
an event from #support naming Pizza Hut is filed at once and Settings says
events arrive. She approves the app again (channels:join): Slack announces
#globex-escalations and it is joined at once; an event there naming Globex
is filed under Globex. She excludes #random and sets #globex-escalations to
Globex: an event naming no one there is filed under Globex; #random stores
nothing. A message whose event never came is filed by the catch-up."""

import json
import urllib.request
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_patch, http_post
from services.connectors.models import SlackChannel
from services.connectors.tests.slack_events_fixtures import (
    SIGNING,
    URL,
    envelope,
    headers_for,
    message,
)
from services.customers.models import Customer, SlackConversation


@override_settings(SLACK_SIGNING_SECRET=SIGNING)
class SlackChannelsFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        self.use_world_fakes()

    def push(self, event):
        """Slack's delivery: the signed body over real HTTP, no token."""
        body = json.dumps(envelope(event)).encode()
        request = urllib.request.Request(  # noqa: S310 - the test server
            self.live_server_url + URL,
            data=body,
            headers={"Content-Type": "application/json", **headers_for(body)},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as answer:  # noqa: S310 - the test server
            self.assertEqual(answer.status, 200)

    def sync(self):
        """One pass (D3: one channel a pass, at least a minute apart)."""
        SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
        call_command("sync_tickets", stdout=StringIO(), stderr=StringIO())

    def channels(self, alice, connector_id):
        status, body = http_get(self.api(f"/connectors/{connector_id}/slack-channels/"), alice)
        self.assertEqual(status, 200, body)
        return body, {c["name"]: c for c in body["channels"]}

    def test_the_whole_journey(self):
        alice, carl, pizza = self.workspace()
        globex = Customer.objects.create(organisation=carl.organisation, name="Globex (QA)")
        self.slack.channels["C0RANDOM"] = []
        self.slack.names["C0RANDOM"] = "random"
        self.slack.scopes.remove("channels:join")
        slack, _jira, _ = self.connect_slack_and_jira(alice)

        # 1. Listed, not joined; an event is filed at once (LC-D3a, LC-D3b).
        self.sync()
        body, rows = self.channels(alice, slack["id"])
        self.assertFalse(body["can_join"])
        self.assertIsNone(body["events_at"])
        self.assertEqual(sorted(rows), ["escalations", "random", "support"])
        self.assertFalse(rows["random"]["member"])
        self.push(message("C0SUPPORT", "1792041400.000100", "Pizza Hut exports fail"))
        pushed = SlackConversation.objects.get(channel="C0SUPPORT", thread_ts="1792041400.000100")
        self.assertEqual(pushed.customer, pizza)
        body, _ = self.channels(alice, slack["id"])
        self.assertIsNotNone(body["events_at"])

        # 2. Approved again: a new channel is joined at once (LC-D3c).
        self.slack.scopes.append("channels:join")
        status, answer = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"),
            {"bot_token": "xoxb-e2e-2"},
            token=alice,
        )
        self.assertEqual(status, 201, answer)
        self.slack.channels["C0GLOBEX"] = []
        self.slack.names["C0GLOBEX"] = "globex-escalations"
        self.push(
            {"type": "channel_created", "channel": {"id": "C0GLOBEX", "name": "globex-escalations"}}
        )
        body, rows = self.channels(alice, slack["id"])
        self.assertTrue(body["can_join"])
        self.assertTrue(rows["globex-escalations"]["member"])  # joined on the event, no pass
        self.sync()  # the pass joins the rest
        _, rows = self.channels(alice, slack["id"])
        self.assertTrue(rows["random"]["member"])
        self.push(message("C0GLOBEX", "1792041500.000100", "Globex (QA) invoices look off"))
        self.assertEqual(SlackConversation.objects.get(channel="C0GLOBEX").customer, globex)

        # 3. Exclude #random; set #globex-escalations to Globex (LC-D3d).
        for channel, change in (
            ("C0RANDOM", {"included": False}),
            ("C0GLOBEX", {"record": {"type": "customer", "id": globex.pk}}),
            # the world left #escalations out; Alice takes it back in
            ("C0ESCALATE", {"included": True}),
        ):
            status, row = http_patch(
                self.api(f"/connectors/{slack['id']}/slack-channels/{channel}/"),
                change,
                token=alice,
            )
            self.assertEqual(status, 200, row)
        self.push(message("C0GLOBEX", "1792041600.000100", "Can someone look at the exports?"))
        self.push(message("C0RANDOM", "1792041700.000100", "Pizza Hut lunch is here"))
        made = SlackConversation.objects.get(channel="C0GLOBEX", thread_ts="1792041600.000100")
        self.assertEqual((made.customer, made.matched_by), (globex, "channel"))
        self.assertFalse(SlackConversation.objects.filter(channel="C0RANDOM").exists())

        # 4. A message whose event never came: the catch-up files it.
        missed = self.slack.say("C0ESCALATE", "U0FAIZ", "Pizza Hut SSO is down")
        for _ in range(4):
            self.sync()
        self.assertTrue(
            SlackConversation.objects.filter(channel="C0ESCALATE", thread_ts=missed).exists()
        )
