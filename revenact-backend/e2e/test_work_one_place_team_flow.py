"""End-to-end tier: real server, real HTTP, real test DB.

Carl works for Mona. An agent proposes work on Carl's Pizza Hut, a task of
his is overdue and he has a private to-do. Mona's Team queue shows the
proposal and the task for Carl, never the to-do; she runs the proposal's
bundle from the queue; it leaves her queue and Carl's badge drops. Alice (view-all)
reads Company; Carl may not read Team at all. The old routes are gone."""

import urllib.error
import urllib.request
from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer, Task
from services.work.tests.recommend_fixtures import task_proposal


class WorkTeamQueueFlowTests(LiveServerTestCase):
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
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        pizza = Customer.objects.create(
            organisation=carl.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl")}
        today = timezone.localdate()

        # 2. Carl's private to-do, an overdue task, and a proposal on Pizza Hut.
        status, made = http_post(
            self.api("/work/todos/"),
            {"title": "Renew my passport", "due_date": (today - timedelta(days=2)).isoformat()},
            token=tokens["carl"],
        )
        self.assertEqual(status, 201, made)
        late = Task.objects.create(
            customer=pizza,
            title="Chase the sponsor",
            assignee=carl,
            assignee_name=carl.name,
            created_by=carl,
            due_date=today - timedelta(days=1),
            priority="high",
        )
        action = task_proposal(carl.organisation, pizza)
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual((count["decide"], count["overdue"]), (1, 2))

        # 3. Mona's queue: the proposal and the task, for Carl; never the to-do.
        status, body = http_get(self.api("/work/feed/team/"), token=tokens["mona"])
        self.assertEqual((status, body["scope"], body["hidden"]), (200, "team", 0))
        (bundle,) = self.group(body, "decide")["items"]
        self.assertEqual((bundle["kind"], bundle["id"]), ("bundle", action.bundle_id))
        self.assertEqual((bundle["actions"], bundle["detail"]["can_run"]), (["open"], True))
        self.assertEqual(bundle["for"], {"id": carl.pk, "name": "Carl CSM"})
        (task,) = self.group(body, "overdue")["items"]
        self.assertEqual((task["id"], task["actions"]), (late.pk, ["open"]))
        self.assertNotIn("Renew my passport", str(body))

        # 4. Mona runs it from the queue: it leaves, and Carl's badge drops.
        status, decided = http_post(
            self.api(f"/agents/bundles/{action.bundle_id}/run/"),
            {"steps": [{"id": action.pk, "selected": True}]},
            token=tokens["mona"],
        )
        self.assertEqual((status, decided["bundle"]["steps"][0]["status"]), (200, "applied"))
        status, body = http_get(self.api("/work/feed/team/?scope=team"), token=tokens["mona"])
        self.assertEqual(self.group(body, "decide")["items"], [])
        status, count = http_get(self.api("/work/feed/count/"), token=tokens["carl"])
        self.assertEqual(count["decide"], 0)

        # 5. Alice reads Company; Carl may not read Team; Mona may not read Company.
        status, body = http_get(self.api("/work/feed/team/"), token=alice)
        self.assertEqual((status, body["scope"]), (200, "company"))
        self.assertIn(late.pk, [i["id"] for i in self.group(body, "overdue")["items"]])
        status, body = http_get(self.api("/work/feed/team/"), token=tokens["carl"])
        self.assertEqual((status, body["code"]), (403, "SCOPE_NOT_ALLOWED"))
        status, body = http_get(self.api("/work/feed/team/?scope=company"), token=tokens["mona"])
        self.assertEqual(status, 403)

        # 6. The removed routes.
        for path in ("/work/today/", "/brain/waiting/?scope=me", "/brain/waiting/count/"):
            request = urllib.request.Request(
                self.api(path), headers={"Authorization": f"Bearer {tokens['carl']}"}
            )
            with self.assertRaises(urllib.error.HTTPError, msg=path) as raised:
                urllib.request.urlopen(request)
            self.assertEqual(raised.exception.code, 404, path)
            raised.exception.close()
