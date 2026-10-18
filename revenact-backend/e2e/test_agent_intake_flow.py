"""End-to-end tier: real server, real HTTP, real test DB.

Alice's workspace has a webhook ticket source for Customer Success. A ticket
from Pizza Hut's support address arrives over HTTP (signed with the
connector's secret); the sync touches its thread and nothing else. Twenty
minutes later run_agent_signals reads it with a fake model: Carl, who owns
Pizza Hut, finds the bundle on Mine with its source. He saves an edit; the
ticket's description changes; the next run calls no model and flags the
bundle; Carl refreshes it (his edit stays), and runs it. A ticket on Loose
Ltd (no owner) lands in the Customer Success queue. No real model is
called and nothing is sent."""

import json
import urllib.request
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, routing
from services.agents.models import SignalThread
from services.billing.models import BillingAccount
from services.connectors.models import Connector
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer, Note
from services.work.clock import today_for


def ticket_line(ctx):
    return next(
        x for x in sorted(evidence.record_lines(ctx, ctx.thread_ref)) if x.startswith("ticket ")
    )


class AgentIntakeFlowTests(LiveServerTestCase):
    def setUp(self):
        # The webhook classifies new tickets with a model call: none in tests.
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        self.classify = no_model.start()
        self.addCleanup(no_model.stop)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def inbound(self, connector, token, payload):
        request = urllib.request.Request(
            self.api(f"/connectors/{connector.pk}/inbound/"),
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "X-Revenact-Token": token},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            return response.status

    def quiet(self):
        SignalThread.objects.update(last_message_at=timezone.now() - timedelta(minutes=20))
        Organisation.objects.update(ai_signals_ran_at=None)

    def run_intake(self, answer):
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.intake.get_completion", return_value=answer) as model,
        ):
            call_command("run_agent_signals")
        return model

    def test_full_flow(self):
        # 1. Alice's workspace, Carl (CS) owning Pizza Hut, a webhook source for CS.
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
        org = carl.organisation
        pizza = Customer.objects.create(
            organisation=org,
            name="Pizza Hut",
            owner=carl,
            domain="pizzahut.com",
            arr_billed_at_account=Decimal(300_000),
        )
        Customer.objects.create(
            organisation=org,
            name="Loose Ltd",
            domain="loose.io",
            arr_billed_at_account=Decimal(80_000),
        )
        connector = Connector.objects.create(
            organisation=org, provider="webhook", department="cs", name="Support form"
        )
        connector.set_credentials({"token": "e2e-secret"})
        connector.save(update_fields=["credentials"])
        token = self.login("carl@acme.io")

        # 2. A ticket arrives over HTTP: the thread is touched, nothing else.
        ticket = {
            "external_id": "T-1",
            "title": "Login loop",
            "description": "Nobody can log in since the reset.",
            "requester_email": "ann@pizzahut.com",
            "requester_name": "Ann Lee",
        }
        self.assertEqual(self.inbound(connector, "e2e-secret", ticket), 202)
        thread = SignalThread.objects.get()
        self.assertEqual(
            (thread.source_kind, thread.customer_id, thread.department), ("webhook", pizza.pk, "cs")
        )

        # 3. Quiet for 20 minutes: the run reads it and Carl finds the bundle on Mine.
        self.quiet()
        route, _ = routing.route(thread)
        ctx = evidence.build_for_thread(org, "cs", thread, route, today=today_for(org))
        line = ticket_line(ctx)
        note = {
            "kind": "note.create",
            "record": ctx.thread_ref,
            "title": "Log the login loop",
            "rationale": "Locked out.",
            "evidence": [line],
            "payload": {"title": "Login loop", "body": "Ann's team is locked out."},
        }
        model = self.run_intake(
            json.dumps(
                {
                    "title": "Pizza Hut: login loop",
                    "reason": "Ann's team is locked out.",
                    "actions": [note],
                }
            )
        )
        self.assertEqual(model.call_count, 1)
        self.classify.assert_called()
        status, feed = http_get(self.api("/work/feed/?kind=bundle"), token=token)
        (row,) = [i for g in feed["groups"] for i in g["items"]]
        self.assertEqual(
            (row["title"], row["detail"]["source"]["channel"]), ("Pizza Hut: login loop", "webhook")
        )
        status, bundle = http_get(self.api(f"/agents/bundles/{row['id']}/"), token=token)
        self.assertEqual(
            (bundle["source"]["label"], bundle["source"]["from"]), ("Webhook", "ann@pizzahut.com")
        )

        # 4. Carl saves an edit; the ticket's words change; the run flags it, no call.
        step = bundle["steps"][0]
        status, saved = http_patch(
            self.api(f"/agents/bundles/{row['id']}/steps/{step['id']}/"),
            {"fields": {"body": "Call Ann today."}},
            token=token,
        )
        self.assertEqual((status, saved["bundle"]["steps"][0]["edited"]), (200, True))
        self.assertEqual(
            self.inbound(
                connector, "e2e-secret", {**ticket, "description": "Still looping today."}
            ),
            202,
        )
        self.quiet()
        model = self.run_intake("{}")
        self.assertEqual(model.call_count, 0)
        status, bundle = http_get(self.api(f"/agents/bundles/{row['id']}/"), token=token)
        self.assertTrue(bundle["has_newer_message"])

        # 5. Refresh keeps his edit and adds the new suggestion; then he runs it.
        ctx = evidence.build_for_thread(
            org, "cs", SignalThread.objects.get(), route, today=today_for(org)
        )
        line = ticket_line(ctx)
        again = {
            **note,
            "title": "Log that it is still looping",
            "evidence": [line],
            "payload": {"title": "Still looping", "body": "Still broken."},
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch(
                "services.agents.intake.get_completion",
                return_value=json.dumps(
                    {
                        "title": "Pizza Hut: still looping",
                        "reason": "Still broken.",
                        "actions": [again],
                    }
                ),
            ) as refresh_model,
        ):
            status, refreshed = http_post(
                self.api(f"/agents/bundles/{row['id']}/refresh/"), {}, token=token
            )
        self.assertEqual(status, 200, refreshed)
        self.assertEqual(refresh_model.call_count, 1)
        steps = refreshed["bundle"]["steps"]
        self.assertEqual([s["edited"] for s in steps], [True, False])
        self.assertFalse(refreshed["bundle"]["has_newer_message"])
        self.assertEqual(steps[0]["fields"]["body"], "Call Ann today.")
        status, ran = http_post(
            self.api(f"/agents/bundles/{row['id']}/run/"),
            {"steps": [{"id": s["id"], "selected": True} for s in steps]},
            token=token,
        )
        self.assertEqual((status, ran["bundle"]["status"]), (200, "done"))
        self.assertEqual(
            sorted(Note.objects.filter(customer=pizza).values_list("body", flat=True)),
            ["Call Ann today.", "Still broken."],
        )

        # 6. A ticket on Loose Ltd (no owner) waits in the Customer Success queue.
        self.assertEqual(
            self.inbound(
                connector,
                "e2e-secret",
                {
                    "external_id": "T-2",
                    "title": "Billing",
                    "description": "Wrong invoice.",
                    "requester_email": "bo@loose.io",
                },
            ),
            202,
        )
        self.quiet()
        loose = SignalThread.objects.get(external_id__endswith=":T-2")
        route, _ = routing.route(loose)
        ctx = evidence.build_for_thread(org, "cs", loose, route, today=today_for(org))
        line = ticket_line(ctx)
        model = self.run_intake(
            json.dumps(
                {
                    "title": "Loose Ltd: invoice",
                    "reason": "Wrong invoice.",
                    "actions": [
                        {
                            **note,
                            "record": ctx.thread_ref,
                            "evidence": [line],
                            "payload": {"title": "Invoice", "body": "Check the invoice."},
                        }
                    ],
                }
            )
        )
        # The run reads both threads (Pizza Hut's bundle is done, so its thread is
        # eligible again); the fake's answer only fits Loose Ltd's evidence.
        self.assertEqual(model.call_count, 2)
        self.assertEqual(Note.objects.filter(customer=pizza).count(), 2)
        # P2: Mine never holds a department bundle.
        status, mine = http_get(self.api("/work/feed/?kind=bundle"), token=token)
        self.assertNotIn(
            "Loose Ltd: invoice", [i["title"] for g in mine["groups"] for i in g["items"]]
        )
        status, queues = http_get(self.api("/work/queues/"), token=token)
        self.assertIn(("department:cs", 1), [(q["key"], q["count"]) for q in queues["queues"]])
        status, queue = http_get(self.api("/work/feed/team/?scope=department:cs"), token=token)
        self.assertEqual(queue["groups"][0]["items"][0]["title"], "Loose Ltd: invoice")
