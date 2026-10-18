"""End-to-end tier: real server, real HTTP, real test DB.

Carl builds a survey for his segment of one organisation, checks who it
reaches, and sends it. Sam answers on the public link with no sign-in; a
second answer reads like an expired link. Carl's send page, the
organisation's NPS and the surveys log all move."""

import re
from io import StringIO

from django.core import mail
from django.core.management import call_command
from django.test import LiveServerTestCase

from e2e.http import http_get, http_patch, http_post

LINK = re.compile(r"/s/([A-Za-z0-9_-]+)")


class SurveysFlowTests(LiveServerTestCase):
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

        # 4. Who it reaches: champions only, so Sam.
        status, body = http_post(
            self.api("/surveys/sends/audience/"),
            {"segment": segment, "roles": ["champion"]},
            token=carl,
        )
        self.assertEqual(
            (status, body["audience"], body["organisations"], body["limit"]), (200, 1, 1, 500)
        )

        # 5. A draft, then the send; a second send is refused.
        send = self.created(
            "/surveys/sends/",
            {
                "name": "Q3 NPS",
                "survey_type": "nps",
                "subject": "A quick question",
                "segment": segment,
                "roles": ["champion"],
            },
            carl,
        )
        status, body = http_post(self.api(f"/surveys/sends/{send['id']}/send/"), {}, token=carl)
        # answered at once, still sending; the minute runner emails
        self.assertEqual(
            (status, body["status"], body["counts"]["sent"]), (200, "sending", 0), body
        )
        status, body = http_post(self.api(f"/surveys/sends/{send['id']}/send/"), {}, token=carl)
        self.assertEqual(status, 409, body)
        self.assertEqual(mail.outbox, [])
        call_command("deliver_pending", stdout=StringIO())
        status, body = http_get(self.api(f"/surveys/sends/{send['id']}/"), token=carl)
        self.assertEqual((body["status"], body["counts"]["sent"]), ("sent", 1), body)

        # 6. Sam's email, and the public form with no sign-in.
        (message,) = mail.outbox
        self.assertEqual(message.to, ["sam@pizza.io"])
        token = LINK.search(message.body).group(1)
        status, body = http_get(self.api(f"/public/surveys/{token}/"))
        self.assertEqual((status, body["organisation_name"]), (200, "Acme Inc"))
        status, body = http_post(
            self.api(f"/public/surveys/{token}/"), {"score": 10, "comment": "Great"}
        )
        self.assertEqual(status, 204, body)
        status, body = http_post(self.api(f"/public/surveys/{token}/"), {"score": 0})
        self.assertEqual((status, body), (404, {"detail": "This link has expired."}))

        # 7. The send page, the organisation's score and the surveys log.
        status, body = http_get(self.api(f"/surveys/sends/{send['id']}/"), token=carl)
        self.assertEqual(
            {key: body["summary"][key] for key in ("sent", "answered", "rate", "figure")},
            {"sent": 1, "answered": 1, "rate": 100, "figure": 100},
        )
        status, body = http_get(self.api(f"/surveys/sends/{send['id']}/answers/"), token=carl)
        self.assertEqual(
            [(row["contact"]["name"], row["score"], row["comment"]) for row in body["results"]],
            [("Sam Pizza", 10, "Great")],
        )
        status, body = http_get(self.api(f"/customers/{pizza}/"), token=carl)
        self.assertEqual(body["nps_score"], 100)
        status, body = http_get(self.api(f"/surveys/?customer={pizza}"), token=carl)
        self.assertEqual(
            [(row["score"], row["status"], row["send_id"]) for row in body],
            [(100, "responded", send["id"])],
        )
