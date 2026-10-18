"""End-to-end tier: real server, real HTTP, real test DB.

Carl reports to Mona and owns Pizza Hut, which renews in 10 days. Alice (the
admin) tunes Settings › Work and runs the recommender; Mona is told, finds
the recommendation in Recommended and assigns it to Carl with the suggested
date; a second decision is refused with her name; Carl is told, finds the
task on My work with why it was recommended, and marks it done; the next run
does not recommend the same renewal again. Dana, on another branch, sees
none of it."""

from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer


class WorkRecommendedFlowTests(LiveServerTestCase):
    @staticmethod
    def group(body, key):
        return next(g for g in body["groups"] if g["key"] == key)

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

    def notes(self, token, kind):
        status, body = http_get(self.api("/notifications/"), token=token)
        self.assertEqual(status, 200, body)
        return [n for n in body if n["kind"] == kind]

    def test_full_flow(self):
        # 1. The workspace, its people and Carl's book.
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
        self.member(alice, "Dana CSM", "dana@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        today = timezone.localdate()
        Customer.objects.create(
            organisation=mona.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
            renewal_date=today + timedelta(days=10),
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl", "dana")}

        # 2. Settings › Work: everyone reads them, only Alice changes them.
        status, body = http_get(self.api("/work/settings/"), token=tokens["carl"])
        self.assertEqual((status, body["can_edit"], body["recommend_to"]), (200, False, "manager"))
        change = {"sources": {"health_drop": {"enabled": False}}}
        status, _ = http_patch(self.api("/work/settings/"), change, token=tokens["carl"])
        self.assertEqual(status, 403)
        status, body = http_patch(self.api("/work/settings/"), change, token=alice)
        self.assertEqual((status, body["sources"]["health_drop"]["enabled"]), (200, False))

        # 3. Run now: one renewal, told to Mona.
        status, _ = http_post(self.api("/work/recommendations/refresh/"), {}, token=tokens["carl"])
        self.assertEqual(status, 403)
        status, body = http_post(self.api("/work/recommendations/refresh/"), {}, token=alice)
        self.assertEqual((status, body["created"], body["notified"]), (200, 1, 1))
        [note] = self.notes(tokens["mona"], "recommendations_waiting")
        self.assertEqual(
            (note["message"], note["link"]),
            ("Revenact recommends “Prepare Pizza Hut's renewal”.", "/work/mine?kind=suggestion"),
        )

        # 4. Mona's Recommended; Dana's is empty.
        status, body = http_get(self.api("/work/recommendations/"), token=tokens["mona"])
        self.assertEqual(
            (status, body["scope"], body["count"], body["hidden"]), (200, "team", 1, 0)
        )
        [item] = body["items"]
        self.assertEqual((item["kind"], item["suggested_assignee"]["id"]), ("renewal_due", carl.pk))
        self.assertTrue(item["suggested_assignee"]["can_open"])
        due = (today + timedelta(days=3)).isoformat()
        self.assertEqual(
            item["defaults"],
            {"title": "Prepare Pizza Hut's renewal", "due_date": due, "priority": "high"},
        )
        status, body = http_get(self.api("/work/recommendations/"), token=tokens["dana"])
        self.assertEqual((body["count"], body["hidden"]), (0, 0))

        # 5. Mona assigns it to Carl; Alice is too late.
        assign = self.api(f"/work/recommendations/{item['id']}/assign/")
        status, body = http_post(
            assign,
            {"assignee_id": carl.pk, "due_date": item["defaults"]["due_date"]},
            token=tokens["mona"],
        )
        self.assertEqual((status, body["recommendation"]["status"]), (201, "assigned"))
        task_id = body["task"]["id"]
        status, body = http_post(assign, {"assignee_id": carl.pk}, token=alice)
        self.assertEqual(
            (status, body["code"], body["detail"]),
            (409, "ALREADY_DECIDED", "Mona Manager already assigned this."),
        )

        # 6. Carl is told, finds it on My work, and reads why.
        [note] = self.notes(tokens["carl"], "task_assigned")
        self.assertEqual(note["link"], f"/work/mine?task={task_id}")
        status, body = http_get(self.api("/work/feed/?kind=task"), token=tokens["carl"])
        self.assertEqual([r["id"] for r in self.group(body, "week")["items"]], [task_id])
        status, body = http_get(self.api(f"/tasks/{task_id}/"), token=tokens["carl"])
        self.assertEqual(
            (body["source"], [e["kind"] for e in body["events"]]),
            ("recommendation", ["created", "recommended"]),
        )
        self.assertTrue(
            body["description"].startswith("Recommended by Revenact:\n- Renews in 10 days")
        )

        # 7. Carl finishes it; the next run does not recommend it again.
        status, _ = http_patch(
            self.api(f"/tasks/{task_id}/"), {"status": "completed"}, token=tokens["carl"]
        )
        self.assertEqual(status, 200)
        status, body = http_post(self.api("/work/recommendations/refresh/"), {}, token=alice)
        self.assertEqual((status, body["created"], body["expired"]), (200, 0, 0))
        status, body = http_get(self.api("/work/recommendations/"), token=tokens["mona"])
        self.assertEqual(body["count"], 0)
