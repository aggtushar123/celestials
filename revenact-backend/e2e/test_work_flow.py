"""End-to-end tier: real server, real HTTP, real test DB.

Mona manages Carl. She gives him a task on his Pizza Hut; he is told, finds
it on My work, opens the panel, blocks it with a reason; Mona's Team shows it
blocked and she comments; Carl marks it done and it leaves My work. Dana, on
another branch, can neither open it nor be given it."""

from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer


class WorkFlowTests(LiveServerTestCase):
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
        # Seats are services/billing's concern, not this flow's.
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        dana = self.member(alice, "Dana CSM", "dana@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        pizza = Customer.objects.create(
            organisation=mona.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
        )
        Customer.objects.create(organisation=mona.organisation, name="Taco Bell", owner=dana)
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl", "dana")}
        today = timezone.localdate()

        # 2. Mona gives Carl a task due today; Dana cannot be given it.
        tasks_url = self.api(f"/customers/{pizza.pk}/tasks/")
        new = {"title": "Prep the QBR", "due_date": today.isoformat(), "priority": "high"}
        status, body = http_post(tasks_url, {**new, "assignee_id": dana.pk}, token=tokens["mona"])
        self.assertEqual((status, body["code"]), (400, "ASSIGNEE_CANNOT_OPEN"))
        status, body = http_post(tasks_url, {**new, "assignee_id": carl.pk}, token=tokens["mona"])
        self.assertEqual(status, 201, body)
        task_id = body["id"]

        # 3. Carl is told, and finds it on My work.
        status, notes = http_get(self.api("/notifications/"), token=tokens["carl"])
        self.assertEqual(status, 200, notes)
        [note] = [n for n in notes if n["kind"] == "task_assigned"]
        self.assertEqual(note["link"], f"/work/mine?task={task_id}")
        self.assertEqual(note["message"], "Mona Manager assigned you “Prep the QBR” on Pizza Hut.")
        status, body = http_get(self.api("/work/feed/?kind=task"), token=tokens["carl"])
        self.assertEqual([r["id"] for r in self.group(body, "today")["items"]], [task_id])
        self.assertEqual(self.group(body, "overdue")["count"], 0)

        # 4. The panel: Carl blocks it, with a reason.
        task_url = self.api(f"/tasks/{task_id}/")
        status, body = http_get(task_url, token=tokens["carl"])
        self.assertEqual((status, [e["kind"] for e in body["events"]]), (200, ["created"]))
        status, body = http_patch(task_url, {"status": "blocked"}, token=tokens["carl"])
        self.assertEqual((status, body), (400, {"blocked_reason": ["Say what it's blocked on."]}))
        status, body = http_patch(
            task_url,
            {"status": "blocked", "blocked_reason": "Waiting on the deck"},
            token=tokens["carl"],
        )
        self.assertEqual((status, body["status"]), (200, "blocked"))

        # 5. Mona's Team shows it blocked; she comments. Dana can't open it.
        status, body = http_get(self.api("/work/team/?scope=team"), token=tokens["mona"])
        self.assertEqual(status, 200, body)
        row = next(p for p in body["people"] if p["person"]["id"] == carl.pk)
        self.assertEqual((row["open"], row["blocked"], body["hidden"]), (1, 1, 0))
        status, body = http_post(
            f"{task_url}comments/", {"body": "Deck is in your inbox."}, token=tokens["mona"]
        )
        self.assertEqual(status, 201, body)
        status, _ = http_get(task_url, token=tokens["dana"])
        self.assertEqual(status, 404)

        # 6. Carl moves the date, then marks it done; it leaves My work.
        later = (today + timedelta(days=1)).isoformat()
        status, body = http_patch(task_url, {"due_date": later}, token=tokens["carl"])
        self.assertEqual(status, 200, body)
        status, body = http_patch(task_url, {"status": "completed"}, token=tokens["carl"])
        self.assertEqual((status, body["blocked_reason"]), (200, ""))
        self.assertEqual(
            [e["kind"] for e in body["events"]],
            ["created", "status", "comment", "due_changed", "status"],
        )
        status, body = http_get(self.api("/work/feed/?kind=task"), token=tokens["carl"])
        self.assertEqual(sum(g["count"] for g in body["groups"]), 0)
