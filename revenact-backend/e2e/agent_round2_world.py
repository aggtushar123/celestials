"""The round 2 e2e journeys' shared world: Alice's workspace with Carl (CS)
owning Pizza Hut, a synced Slack support channel and a Jira connection, and
the agents reading a thread with a fake model. Mixed into a
LiveServerTestCase; Slack and Jira are fakes, nothing leaves the process."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone

from e2e.http import http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, routing
from services.agents.models import AgentBundle, SignalThread
from services.billing.models import BillingAccount
from services.connectors.models import SlackChannel
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer
from services.work.clock import today_for


class Round2World:
    def use_world_fakes(self, slack=None):
        """No model classifies; Slack (`slack`, or a new FakeSlackApi) holds
        a customer's message in #support; Jira is a fake."""
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        no_model.start()
        self.addCleanup(no_model.stop)
        self.slack = use_slack(self, slack or FakeSlackApi())
        self.ts = f"{int(timezone.now().timestamp()) - 3600}.000100"
        self.slack.channels["C0SUPPORT"] = [
            {"ts": self.ts, "user": "U1", "text": "Pizza Hut: nobody can log in since the reset."}
        ]
        self.jira = use_jira(self)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def workspace(self):
        """Alice's workspace; Carl (CS) owns Pizza Hut. (alice token, carl, pizza)"""
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "memberpass12"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        carl = User.objects.get(pk=body["id"])
        User.objects.filter(pk=carl.pk).update(function=User.Function.CS)
        pizza = Customer.objects.create(
            organisation=carl.organisation,
            name="Pizza Hut",
            owner=carl,
            domain="pizzahut.com",
            arr_billed_at_account=Decimal(300_000),
        )
        return alice, carl, pizza

    def connect_slack_and_jira(self, alice):
        """Alice connects Slack (CS; every public channel) and Jira's SUP project (engineering).
        (slack row, jira row, jira connect answer)"""
        status, slack = http_post(
            self.api("/connectors/"),
            {"provider": "slack", "name": "Support Slack", "department": "cs"},
            token=alice,
        )
        self.assertEqual(status, 201, slack)
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"),
            {"bot_token": "xoxb-e2e"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        # D3: the connection reads every public channel; #escalations is left
        # out (as an admin would), so the catch-up reads #support
        SlackChannel.objects.create(
            connector_id=slack["id"],
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            included=False,
        )
        status, jira = http_post(
            self.api("/connectors/"),
            {"provider": "jira", "name": "Jira", "department": "engineering"},
            token=alice,
        )
        self.assertEqual(status, 201, jira)
        status, connected = http_post(
            self.api(f"/connectors/{jira['id']}/connect/"),
            {"site": "acme", "email": "bot@acme.io", "api_token": "t", "project": "SUP"},
            token=alice,
        )
        self.assertEqual(status, 201, connected)
        return slack, jira, connected

    def read_thread(self, org, thread, prefix, actions, extra=None):
        """The agents read `thread` (quiet for 20 minutes); the model answers
        `actions`, each citing the thread's first line starting with `prefix`,
        with `extra`'s keys (say `function` and `decision`) added to the answer.
        The bundle made."""
        SignalThread.objects.filter(pk=thread.pk).update(
            last_message_at=timezone.now() - timedelta(minutes=20)
        )
        Organisation.objects.update(ai_signals_ran_at=None)
        thread.refresh_from_db()
        route, _ = routing.route(thread)
        ctx = evidence.build_for_thread(org, "cs", thread, route, today=today_for(org))
        line = next(
            x for x in sorted(evidence.record_lines(ctx, ctx.thread_ref)) if x.startswith(prefix)
        )
        answer = {
            "title": "Pizza Hut: login loop",
            "reason": "Ann can't log in since the reset.",
            "actions": [
                {**action, "record": ctx.thread_ref, "evidence": [line]} for action in actions
            ],
            **(extra or {}),
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.intake.get_completion", return_value=json.dumps(answer)),
        ):
            call_command("run_agent_signals")
        return AgentBundle.objects.get(thread=thread)
