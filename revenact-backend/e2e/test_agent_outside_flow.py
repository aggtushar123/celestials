"""End-to-end tier: real server, real HTTP, real test DB; Slack and Jira are
fakes (their APIs in memory), the model is a fake. Nothing leaves the process.

Alice connects Slack (a pasted bot token) and Jira for Customer Success. A
customer's Slack message is synced; twenty minutes later run_agent_signals
reads it: Carl, who owns Pizza Hut, finds an escalation bundle (Slack
escalations D4) of a Jira issue, its assignment to Priya (the account team's
engineer), her to-do and a Slack reply, last; the outside steps are disabled
until an admin lets agents act. Alice allows both (Slack needs chat:write
first). Carl runs it: Jira's answer to the create is lost, so the create
fails "couldn't confirm" and the assignment and the reply wait on it, and
Carl is told. His Retry finds the issue by its label and makes no second;
the assignment then runs and the reply goes out with the issue's key.
History shows the links; every call is in the audit log."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.http import http_get, http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, routing
from services.agents.models import AgentBundle, SignalThread
from services.billing.models import BillingAccount
from services.connectors.models import Connector
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer
from services.knowledge.models import FunctionOwner
from services.notifications.models import Notification
from services.work.clock import today_for


class AgentOutsideFlowTests(LiveServerTestCase):
    def setUp(self):
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        no_model.start()
        self.addCleanup(no_model.stop)
        self.slack = use_slack(self, FakeSlackApi())
        # D3: the connection reads every public channel; this world has one
        del self.slack.channels["C0ESCALATE"]
        self.slack.members.discard("C0ESCALATE")
        # An hour ago: a first import older than 7 days would be skipped as stale (D2-22).
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

    def test_full_flow(self):
        # 1. Alice's workspace; Carl (CS) owns Pizza Hut; Priya is in Engineering.
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
        people = {}
        for name, email in (("Carl CSM", "carl@acme.io"), ("Priya Shah", "priya@acme.io")):
            status, body = http_post(
                self.api("/auth/users/"),
                {"name": name, "email": email, "password": "memberpass12"},
                token=alice,
            )
            self.assertEqual(status, 201, body)
            people[email] = User.objects.get(pk=body["id"])
        carl, priya = people["carl@acme.io"], people["priya@acme.io"]
        User.objects.filter(pk=carl.pk).update(function=User.Function.CS)
        User.objects.filter(pk=priya.pk).update(function=User.Function.ENGINEERING)
        priya.refresh_from_db()
        org = carl.organisation
        pizza = Customer.objects.create(
            organisation=org,
            name="Pizza Hut",
            owner=carl,
            domain="pizzahut.com",
            arr_billed_at_account=Decimal(300_000),
        )
        # Priya handles Engineering on Pizza Hut's account team (Slack escalations D4).
        FunctionOwner.objects.create(customer=pizza, function="engineering", user=priya)

        # 2. Alice connects Slack with a pasted token and Jira with an API token.
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
        status, jira = http_post(
            self.api("/connectors/"),
            {"provider": "jira", "name": "Jira", "department": "engineering"},
            token=alice,
        )
        self.assertEqual(status, 201, jira)
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/connect/"),
            {"site": "acme", "email": "bot@acme.io", "api_token": "t", "project": "SUP"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        self.assertEqual(
            body["agents"],
            {
                "kinds": ["jira.create", "jira.assign", "jira.comment"],
                "can_act": False,
                "needs": "permission",
                "allowed_by": None,
                "allowed_at": None,
            },
        )

        # 3. The Slack message is synced; quiet for 20 minutes; the agents read it.
        status, _ = http_post(self.api(f"/connectors/{slack['id']}/sync/"), {}, token=alice)
        self.assertEqual(status, 200)
        thread = SignalThread.objects.get()
        SignalThread.objects.update(last_message_at=timezone.now() - timedelta(minutes=20))
        Organisation.objects.update(ai_signals_ran_at=None)
        route, _ = routing.route(thread)
        ctx = evidence.build_for_thread(org, "cs", thread, route, today=today_for(org))
        line = next(
            x
            for x in sorted(evidence.record_lines(ctx, ctx.thread_ref))
            if x.startswith("message ")
        )
        ref = ctx.thread_ref
        answer = {
            "title": "Pizza Hut: login loop",
            "reason": "Ann can't log in since the reset.",
            # A Slack thread's issue is an escalation (Slack escalations D4): the
            # platform assigns it to the account team's engineer, adds her to-do
            # and puts the reply last; the model's own assignment is dropped.
            "function": "engineering",
            "actions": [
                {
                    "kind": "slack.reply",
                    "record": ref,
                    "title": "Tell Ann we're on it",
                    "rationale": "She is locked out.",
                    "evidence": [line],
                    "payload": {"text": "Thanks Ann, we're on it."},
                },
                {
                    "kind": "jira.create",
                    "record": ref,
                    "title": "Log the login loop",
                    "rationale": "Engineering must fix it.",
                    "evidence": [line],
                    "payload": {
                        "summary": "Login loop after password reset",
                        "description": "Nobody can log in since the reset.",
                        "priority": "high",
                        "assignee_id": None,
                    },
                },
                {
                    "kind": "jira.assign",
                    "record": ref,
                    "title": "Give it to Priya",
                    "rationale": "She owns login.",
                    "evidence": [line],
                    "payload": {"issue": "{{step 2.ticket_key}}", "assignee_id": priya.pk},
                },
            ],
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.intake.get_completion", return_value=json.dumps(answer)),
        ):
            call_command("run_agent_signals")
        bundle = AgentBundle.objects.get(thread=thread)
        carl_token = self.login("carl@acme.io")

        # 4. Carl sees every outside step disabled until an admin lets agents act.
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertEqual(status, 200, detail)
        self.assertEqual(
            [
                (s["kind"], s["can_run"], s["disabled_reason"], s["disabled_link"])
                for s in detail["steps"]
            ],
            [
                (
                    "jira.create",
                    False,
                    "Ask an admin to allow agents to act in Jira.",
                    "/settings/connections",
                ),
                (
                    "jira.assign",
                    False,
                    "Ask an admin to allow agents to act in Jira.",
                    "/settings/connections",
                ),
                ("task.create", True, None, None),
                (
                    "slack.reply",
                    False,
                    "Ask an admin to allow Revenact to post in Slack.",
                    "/settings/connections",
                ),
            ],
        )
        self.assertTrue(detail["can_reject"])

        # 5. Alice allows Jira; Slack needs chat:write on the token first.
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True))
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["code"]), (409, "SLACK_SCOPE_MISSING"))
        self.slack.scopes.append("chat:write")
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True))

        # 6. Carl runs it; Jira's answer to the create is lost.
        self.jira.drop_next(r"POST /rest/api/3/issue$")
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertTrue(all(s["can_run"] for s in detail["steps"]))
        rows = [{"id": s["id"], "selected": True} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=carl_token
        )
        self.assertEqual(status, 200, body)
        steps = body["bundle"]["steps"]
        self.assertEqual(
            [(s["status"], s["error"]) for s in steps],
            [
                ("failed", "We couldn't confirm Jira made the issue. Retry checks Jira first."),
                ("failed", "Needs step 1, which didn't run."),
                ("applied", ""),
                ("failed", "Needs step 1, which didn't run."),
            ],
        )
        self.assertEqual(body["bundle"]["status"], "partly_done")
        self.assertEqual(self.slack.posts(), [])
        self.assertEqual(len(self.jira.created), 1)
        notice = Notification.objects.get(recipient=carl, kind=Notification.Kind.AGENT_STEP_FAILED)
        self.assertEqual(notice.message, "3 steps failed in “Pizza Hut: login loop”.")

        # 7. Retry finds the issue by its label: no second; then the assignment
        # runs and the reply, last, carries the issue's key and link.
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{steps[0]['id']}/retry/"),
            {},
            token=carl_token,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(len(self.jira.created), 1)
        for step in (steps[1], steps[3]):
            status, body = http_post(
                self.api(f"/agents/bundles/{bundle.pk}/steps/{step['id']}/retry/"),
                {},
                token=carl_token,
            )
            self.assertEqual(status, 200, body)
        self.assertEqual(body["bundle"]["status"], "done")
        [key] = self.jira.created
        self.assertEqual(self.jira.assigned, [(key, "acc-priya")])
        self.assertEqual(len(self.slack.posts()), 1)
        self.assertEqual(self.slack.posts()[0]["thread_ts"], self.ts)
        self.assertIn(f"Logged as {key} (", self.slack.posts()[0]["text"])

        # 8. History shows the result links; the audit log has every call.
        status, history = http_get(self.api("/agents/bundles/history/"), carl_token)
        self.assertEqual(status, 200)
        links = [link["label"] for step in history["results"][0]["steps"] for link in step["links"]]
        self.assertEqual(
            links,
            [f"Open {key} in Jira", f"Open {key} in Jira", "Open task", "Open the Slack message"],
        )
        calls = list(
            AuditEvent.objects.filter(action="agent_outside.call").values_list(
                "metadata__op", "metadata__outcome"
            )
        )
        self.assertIn(("create", "unconfirmed"), calls)
        self.assertIn(("lookup", "found"), calls)
        self.assertIn(("post", "ok"), calls)
        self.assertTrue(AuditEvent.objects.filter(action="connector.agent_access").count() >= 2)
        self.assertFalse(
            Connector.objects.filter(
                organisation=org, agents_can_act=False, provider__in=["slack", "jira"]
            ).exists()
        )
        self.assertEqual(pizza.pk, thread.customer_id)
