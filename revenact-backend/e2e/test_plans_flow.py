"""End-to-end tier: real server, real HTTP, real test DB.

Alice (admin) starts an Onboarding plan on Carl's organisation, for Carl.
Carl is told, sees it on the board as Not started, ticks a task through the
existing task route and marks the first milestone done; the board card moves
to On track. A second start from the same template is refused with the open
plan's id. The organisation's task list names the plan."""

from django.test import LiveServerTestCase

from e2e.http import http_get, http_patch, http_post
from services.plans.builtins import seed_builtins
from services.plans.models import PlanTemplate


class PlansFlowTests(LiveServerTestCase):
    def setUp(self):
        # Another LiveServerTestCase may have flushed the seeded built-ins.
        seed_builtins(PlanTemplate)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. A workspace signs up; its admin adds Carl; Carl adds his organisation.
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
        carl_id = self.created(
            "/auth/users/",
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            alice,
        )["id"]
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]

        # 2. The built-in templates.
        status, templates = http_get(self.api("/plans/templates/"), token=alice)
        self.assertEqual(status, 200, templates)
        onboarding = next(t for t in templates["builtin"] if t["kind"] == "onboarding")
        self.assertEqual((onboarding["milestone_count"], onboarding["task_count"]), (4, 7))

        # 3. Alice starts it for Carl; a second start is refused.
        plan = self.created(
            "/plans/", {"template": onboarding["id"], "customer": pizza, "owner": carl_id}, alice
        )
        self.assertEqual(
            (plan["status"], plan["owner"]["id"], plan["can_edit"]), ("not_started", carl_id, False)
        )
        status, body = http_post(
            self.api("/plans/"), {"template": onboarding["id"], "customer": pizza}, token=alice
        )
        self.assertEqual((status, body["code"], body["plan_id"]), (409, "PLAN_OPEN", plan["id"]))

        # 4. Carl is told, and sees it on the board.
        status, notes = http_get(self.api("/notifications/"), token=carl)
        self.assertLessEqual({"plan_started", "plan_task_assigned"}, {n["kind"] for n in notes})
        status, board = http_get(self.api("/plans/?owner=me"), token=carl)
        self.assertEqual(
            ([r["id"] for r in board["results"]], board["counts"]["not_started"]), ([plan["id"]], 1)
        )

        # 5. Carl ticks the first task through the existing task route.
        status, page = http_get(self.api(f"/plans/{plan['id']}/"), token=carl)
        kickoff = page["milestones"][0]
        first = kickoff["tasks"][0]
        status, body = http_patch(
            self.api(f"/tasks/{first['id']}/"), {"status": "completed"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 6. He marks the Kick-off milestone done.
        status, page = http_patch(
            self.api(f"/plans/{plan['id']}/milestones/{kickoff['id']}/"), {"done": True}, token=carl
        )
        self.assertEqual(status, 200, page)
        self.assertIsNotNone(page["milestones"][0]["done_at"])

        # 7. The board card has moved to On track.
        status, board = http_get(self.api("/plans/"), token=carl)
        self.assertEqual(board["counts"]["on_track"], 1)
        (row,) = board["results"]
        self.assertEqual(
            (row["status"], row["milestones_done"], row["tasks_done"]), ("on_track", 1, 1)
        )

        # 8. The organisation's tasks name the plan and the milestone.
        status, tasks = http_get(self.api(f"/customers/{pizza}/tasks/"), token=carl)
        ticked = next(t for t in tasks if t["id"] == first["id"])
        self.assertEqual(
            (ticked["plan"]["id"], ticked["milestone"]["name"]), (plan["id"], "Kick-off")
        )
