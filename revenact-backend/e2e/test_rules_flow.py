"""End-to-end tier: real server, real HTTP, real test DB.

Carl builds a weekly rule on his segment of one organisation: send a survey
(for review) and notify him. The test endpoint shows who it would reach. He
turns it on; the nightly step runs (in-process, as cron would); the review
waits in his queue and his bell rings; he approves it and the minute runner sends the survey to
the organisation's champion only. The rule's page shows the night."""

from io import StringIO

from django.core import mail
from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.rules.nightly import evaluate_rules


class RulesFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. An organisation signs up; its admin adds Carl.
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
        admin = body["access"]
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]

        # 2. Carl's organisation, a champion and a finance manager.
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]
        for name, role in (("Sam Pizza", "champion"), ("Fin Pizza", "finance_manager")):
            email = f"{name.split()[0].lower()}@pizza.io"
            self.created(
                f"/customers/{pizza}/contacts/", {"name": name, "role": role, "email": email}, carl
            )

        # 3. A segment of that one organisation.
        segment = self.created("/segments/", {"name": "Pizza", "kind": "customer"}, carl)["id"]
        status, body = http_patch(
            self.api(f"/segments/{segment}/members/{pizza}/"), {"state": "pinned"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 4. The rule: weekly, today; a survey for champions, and notify me.
        today = timezone.localdate()
        rule_body = {
            "name": "Weekly pulse",
            "segment": segment,
            "trigger": "schedule",
            "cadence": "weekly",
            "weekday": today.weekday(),
            "actions": [
                {
                    "action": "survey",
                    "survey_type": "nps",
                    "subject": "A quick question",
                    "roles": ["champion"],
                },
                {"action": "notify", "to": "me"},
            ],
        }
        status, body = http_post(self.api("/rules/test/"), rule_body, token=carl)
        self.assertEqual(
            (status, body["count"], body["records"]),
            (200, 1, [{"kind": "customer", "id": pizza, "name": "Pizza Hut"}]),
        )
        rule = self.created("/rules/", rule_body, carl)
        self.assertFalse(rule["is_active"])

        # 5. Turned on.
        status, body = http_patch(
            self.api(f"/rules/{rule['id']}/"), {"is_active": True}, token=carl
        )
        self.assertEqual((status, body["is_active"]), (200, True), body)

        # 6. The night.
        night = evaluate_rules(today=today)
        self.assertEqual((night.ran, night.fired, night.reviews, night.failed), (1, 1, 1, 0))

        # 7. Carl's queue and bell.
        status, reviews = http_get(self.api("/rules/reviews/"), token=carl)
        self.assertEqual(status, 200, reviews)
        (review,) = reviews
        self.assertEqual(
            (review["counts"], review["organisation_name"], review["action"]["survey_type"]),
            ({"people": 1, "records": 1}, "Acme Inc", "nps"),
        )
        status, notes = http_get(self.api("/notifications/"), token=carl)
        self.assertLessEqual({"rule_fired", "rule_review"}, {note["kind"] for note in notes})

        # 8. Approve: the survey goes to Sam only; a second decision is 409.
        status, body = http_post(
            self.api(f"/rules/reviews/{review['id']}/approve/"), {}, token=carl
        )
        self.assertEqual(status, 200, body)
        send_id = body["survey_send_id"]
        status, body = http_post(
            self.api(f"/rules/reviews/{review['id']}/approve/"), {}, token=carl
        )
        self.assertEqual(status, 409, body)
        # Approval only claims: the send reads `sending` until the
        # every-minute runner emails it.
        self.assertEqual(mail.outbox, [])
        status, body = http_get(self.api(f"/surveys/sends/{send_id}/"), token=carl)
        self.assertEqual((status, body["status"]), (200, "sending"))
        call_command("deliver_pending", stdout=StringIO())
        (message,) = mail.outbox
        self.assertEqual(message.to, ["sam@pizza.io"])
        status, body = http_get(self.api(f"/surveys/sends/{send_id}/"), token=carl)
        self.assertEqual((status, body["status"]), (200, "sent"))
        self.assertTrue(body["name"].startswith("Weekly pulse · "))

        # 9. The rule's page: the night and its record.
        status, body = http_get(self.api(f"/rules/{rule['id']}/runs/"), token=carl)
        (run,) = body["results"]
        self.assertEqual(
            (run["fired"], run["review"]["status"], run["hidden_count"]), (1, "approved", 0)
        )
        status, body = http_get(self.api(f"/rules/{rule['id']}/runs/{run['id']}/"), token=carl)
        (record,) = body["records"]
        self.assertEqual(
            (record["name"], record["outcome"], [action["status"] for action in record["actions"]]),
            ("Pizza Hut", "fired", ["queued", "done"]),
        )
