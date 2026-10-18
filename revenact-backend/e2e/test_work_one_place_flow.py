"""End-to-end tier: real server, real HTTP, real test DB.

Carl writes himself a to-do: it is on his My work, private, and his manager
Mona cannot open it. A task of his on Pizza Hut is overdue and an agent
proposes work there: the badge says two. He runs the proposal's bundle
through its own route, finishes the task and ticks the to-do; the badge drops to
nothing and the approved proposal's task waits in Later."""

import json
from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer
from services.work.tests.recommend_fixtures import task_proposal


class WorkOnePlaceFlowTests(LiveServerTestCase):
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

    @staticmethod
    def group(body, key):
        return next(g for g in body["groups"] if g["key"] == key)

    def test_full_flow(self):
        # 1. The workspace, Mona above Carl, Carl's Pizza Hut.
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
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        pizza = Customer.objects.create(
            organisation=carl.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl")}
        today = timezone.localdate()

        # 2. A private to-do.
        status, made = http_post(
            self.api("/work/todos/"), {"title": "Book the QBR room"}, token=tokens["carl"]
        )
        self.assertEqual(status, 201, made)
        todo_id = made["task"]["id"]
        self.assertEqual(
            (made["group"], made["item"]["kind"], made["item"]["private"]),
            ("no_date", "todo", True),
        )
        status, _body = http_get(self.api(f"/tasks/{todo_id}/"), token=tokens["mona"])
        self.assertEqual(status, 404)

        # 3. Work arrives: an overdue task on Pizza Hut and an agent's proposal there.
        status, made = http_post(
            self.api("/work/todos/"),
            {
                "title": "Call the sponsor",
                "customer_id": pizza.pk,
                "due_date": (today - timedelta(days=1)).isoformat(),
                "priority": "high",
            },
            token=tokens["carl"],
        )
        self.assertEqual((status, made["group"], made["item"]["kind"]), (201, "overdue", "task"))
        task_id = made["task"]["id"]
        action = task_proposal(carl.organisation, pizza)
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual(count, {"decide": 1, "overdue": 1, "badge": 2, "failed": []})

        # 4. One feed: the decision on top, the task overdue, the to-do undated.
        status, feed = http_get(self.api("/work/feed/"), token=tokens["carl"])
        self.assertEqual(status, 200, feed)
        (bundle,) = self.group(feed, "decide")["items"]
        self.assertEqual(
            (bundle["key"], bundle["actions"], bundle["detail"]["can_run"]),
            (f"bundle:{action.bundle_id}", ["open"], True),
        )
        self.assertEqual([i["id"] for i in self.group(feed, "overdue")["items"]], [task_id])
        self.assertEqual([i["id"] for i in self.group(feed, "no_date")["items"]], [todo_id])
        status, mona_feed = http_get(self.api("/work/feed/"), token=tokens["mona"])
        self.assertNotIn("Book the QBR room", json.dumps(mona_feed))

        # 5. Act through each item's own route.
        status, body = http_post(
            self.api(f"/agents/bundles/{action.bundle_id}/run/"),
            {"steps": [{"id": action.pk, "selected": True}]},
            token=tokens["carl"],
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["bundle"]["steps"][0]["status"], "applied")
        for pk in (task_id, todo_id):
            status, body = http_patch(
                self.api(f"/tasks/{pk}/"), {"status": "completed"}, token=tokens["carl"]
            )
            self.assertEqual((status, body["status"]), (200, "completed"))

        # 6. Nothing waits; the approved proposal's task is in Later.
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual(count, {"decide": 0, "overdue": 0, "badge": 0, "failed": []})
        status, feed = http_get(self.api("/work/feed/"), token=tokens["carl"])
        self.assertEqual(self.group(feed, "no_date")["count"], 0)
        self.assertEqual(
            [i["title"] for i in self.group(feed, "later")["items"]], ["Call the exec sponsor"]
        )
