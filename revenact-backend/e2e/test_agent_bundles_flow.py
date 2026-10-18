"""End-to-end tier: real server, real HTTP, real test DB.

Carl owns Pizza Hut. The CS agent's nightly pass proposes two steps for it
(a note, then a lifecycle move), so Carl's Mine shows one bundle. Carl edits
the note, unticks the move and runs it: done. A second bundle's note step
fails (its record changed under a lifecycle step), Carl retries after
fixing nothing that needed fixing, and rejects a third with a reason. History
lists all three; the old approve route points at the bundle; Mona sees
Carl's bundle on My team; the queue rail counts it."""

import json
from decimal import Decimal
from unittest.mock import patch

from django.test import LiveServerTestCase

from e2e.http import http_get, http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, run
from services.billing.models import BillingAccount
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.work.clock import today_for


class AgentBundlesFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def nightly(self, org, *items):
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
        ):
            return run.run(Organisation.objects.get(pk=org.pk), "cs")

    def test_full_flow(self):
        # 1. Alice's workspace; Mona above Carl; Carl's Pizza Hut.
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
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona, function=User.Function.CS)
        org = carl.organisation
        pizza = Customer.objects.create(
            organisation=org, name="Pizza Hut", owner=carl, arr_billed_at_account=Decimal(300_000)
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl")}

        # 2. The nightly pass: one bundle of two steps for Pizza Hut.
        ref = f"customer:{pizza.pk}"
        ctx = evidence.build(Organisation.objects.get(pk=org.pk), "cs", today=today_for(org))
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))

        def item(kind, payload, title):
            return {
                "kind": kind,
                "record": ref,
                "title": title,
                "rationale": "Renews soon.",
                "evidence": [line],
                "payload": payload,
            }

        result = self.nightly(
            org,
            item(
                "note.create",
                {"title": "Sponsor left", "body": "Find a new sponsor."},
                "File the news",
            ),
            item("record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"),
        )
        self.assertEqual(result.proposed, 2)
        status, feed = http_get(self.api("/work/feed/?kind=bundle"), token=tokens["carl"])
        (row,) = next(g for g in feed["groups"] if g["key"] == "decide")["items"]
        self.assertEqual(
            (row["kind"], row["title"], row["detail"]["step_count"]),
            ("bundle", "File the news, and 1 more", 2),
        )
        status, queues = http_get(self.api("/work/queues/"), token=tokens["mona"])
        self.assertEqual(
            [(q["key"], q["count"]) for q in queues["queues"]],
            [("mine", 0), ("team", 1), ("history", None)],
        )

        # 3. Carl edits the note, unticks the move, runs: done.
        status, bundle = http_get(self.api(f"/agents/bundles/{row['id']}/"), token=tokens["carl"])
        note_step, move_step = bundle["steps"]
        status, ran = http_post(
            self.api(f"/agents/bundles/{row['id']}/run/"),
            {
                "steps": [
                    {
                        "id": note_step["id"],
                        "selected": True,
                        "fields": {"body": "Call the CFO instead."},
                    },
                    {"id": move_step["id"], "selected": False},
                ]
            },
            token=tokens["carl"],
        )
        self.assertEqual(status, 200, ran)
        self.assertEqual(ran["bundle"]["status"], "done")
        self.assertEqual([s["status"] for s in ran["bundle"]["steps"]], ["applied", "skipped"])
        status, again = http_post(
            self.api(f"/agents/bundles/{row['id']}/run/"), {"steps": []}, token=tokens["mona"]
        )
        self.assertEqual((status, again["code"]), (409, "BUNDLE_RAN"))

        # 4. A failing step: partly done, then Retry.
        failing = AgentAction.objects.create(
            organisation=org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=pizza,
            target="note:x",
            title="Log it",
            rationale="Why.",
            evidence=[line],
            payload={"title": "Log it", "body": "See {{step 2.task_url}}"},
        )
        status, ran = http_post(
            self.api(f"/agents/bundles/{failing.bundle_id}/run/"),
            {"steps": [{"id": failing.pk, "selected": True}]},
            token=tokens["carl"],
        )
        self.assertEqual(ran["bundle"]["status"], "partly_done")
        self.assertEqual(ran["bundle"]["steps"][0]["error"], "Needs step 2, which didn't run.")
        AgentAction.objects.filter(pk=failing.pk).update(
            payload={"title": "Log it", "body": "Done."}
        )
        status, retried = http_post(
            self.api(f"/agents/bundles/{failing.bundle_id}/steps/{failing.pk}/retry/"),
            {},
            token=tokens["carl"],
        )
        self.assertEqual((status, retried["bundle"]["status"]), (200, "done"))

        # 5. Reject a third with a reason.
        third = AgentAction.objects.create(
            organisation=org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=pizza,
            target="lifecycle",
            title="Move to churn",
            rationale="Why.",
            evidence=[line],
            payload={"stage": "churn"},
            before=pizza.lifecycle_stage,
        )
        status, rejected = http_post(
            self.api(f"/agents/bundles/{third.bundle_id}/reject/"),
            {"reason": "not_relevant", "note": "They are renewing."},
            token=tokens["carl"],
        )
        self.assertEqual((status, rejected["bundle"]["status"]), (200, "rejected"))

        # 6. History lists all three, newest change first; the old route points at a bundle.
        status, history = http_get(self.api("/agents/bundles/history/"), token=tokens["carl"])
        self.assertEqual([b["status"] for b in history["results"]], ["rejected", "done", "done"])
        status, old = http_post(
            self.api(f"/agents/actions/{third.pk}/approve/"), {}, token=tokens["carl"]
        )
        self.assertEqual((status, old["code"], old["bundle"]), (409, "USE_BUNDLE", third.bundle_id))
