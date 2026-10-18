"""End-to-end tier: real server, real HTTP, real test DB (Slack
escalations D2).

Alice runs the workspace. Faiz (Customer Success) owns Globex; Jesh and
Erin are engineers; Carl is a CSM. Carl reads the department heads but
cannot name one. Alice names Jesh Engineering head after a refusal for
Faiz; Globex's engineering escalation then goes to Jesh. Alice puts Erin
on Globex's account team: it goes to Erin; Erin is deactivated: back to
Jesh; Alice clears the head: nobody. Every change is in the audit log."""

from django.test import LiveServerTestCase

from core.models import AuditEvent
from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer
from services.knowledge.ownership import handler_for


class AccountTeamFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email, function):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12", "function": function},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def handler(self, customer, function):
        return handler_for(Customer.objects.get(pk=customer.pk), function)

    def test_full_flow(self):
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Alfiee QA",
                "name": "Alice Admin",
                "email": "alice@alfiee.example",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        BillingAccount.objects.filter(organisation__name="Alfiee QA").update(seats_limit=10)
        faiz = self.member(alice, "Faiz Jamal", "faiz@alfiee.example", "cs")
        jesh = self.member(alice, "Jesh Sanghvi", "jesh@alfiee.example", "engineering")
        erin = self.member(alice, "Erin Engineer", "erin@alfiee.example", "engineering")
        self.member(alice, "Carl CSM", "carl@alfiee.example", "cs")
        globex = Customer.objects.create(
            organisation=faiz.organisation, name="Globex (QA)", owner=faiz
        )
        carl = self.login("carl@alfiee.example")
        heads_url = self.api("/function-heads/")

        # 1. Carl reads the six functions, nobody heads any; he cannot name one.
        status, rows = http_get(heads_url, token=carl)
        self.assertEqual(status, 200)
        self.assertEqual([r["user"] for r in rows], [None] * 6)
        status, body = http_patch(
            heads_url, {"function": "engineering", "user_id": jesh.id}, token=carl
        )
        self.assertEqual(status, 403, body)

        # 2. Alice tries Faiz for Engineering: refused in plain words; then Jesh.
        status, body = http_patch(
            heads_url, {"function": "engineering", "user_id": faiz.id}, token=alice
        )
        self.assertEqual(status, 400)
        self.assertEqual(
            body,
            {
                "user_id": [
                    "Faiz Jamal is in Customer Success, not Engineering. "
                    "Pick someone from Engineering."
                ]
            },
        )
        status, rows = http_patch(
            heads_url, {"function": "engineering", "user_id": jesh.id}, token=alice
        )
        self.assertEqual(status, 200, rows)
        status, rows = http_get(heads_url, token=carl)
        self.assertEqual(rows[1]["user"], {"id": jesh.id, "name": "Jesh Sanghvi"})
        self.assertEqual(self.handler(globex, "engineering"), (jesh, "head"))
        self.assertEqual(self.handler(globex, "cs"), (faiz, "team"))

        # 3. Erin joins Globex's account team: the escalation is hers.
        status, body = http_patch(
            self.api(f"/customers/{globex.id}/responsible/"),
            {"function": "engineering", "user_id": erin.id},
            token=alice,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(self.handler(globex, "engineering"), (erin, "team"))

        # 4. Erin leaves: the head takes it again. The head is cleared: nobody.
        status, body = http_patch(
            self.api(f"/auth/users/{erin.id}/"), {"is_active": False}, token=alice
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(self.handler(globex, "engineering"), (jesh, "head"))
        status, rows = http_patch(
            heads_url, {"function": "engineering", "user_id": None}, token=alice
        )
        self.assertEqual(status, 200, rows)
        self.assertIsNone(rows[1]["user"])
        self.assertEqual(self.handler(globex, "engineering"), (None, "nobody"))

        # 5. Written down: two head changes, one account-team change, ids only.
        self.assertEqual(
            list(
                AuditEvent.objects.filter(action="function_head.changed")
                .order_by("id")
                .values_list("metadata", flat=True)
            ),
            [
                {"function": "engineering", "from": None, "to": jesh.id},
                {"function": "engineering", "from": jesh.id, "to": None},
            ],
        )
        self.assertEqual(
            AuditEvent.objects.get(action="function_owner.changed").metadata,
            {"function": "engineering", "from": None, "to": erin.id},
        )
