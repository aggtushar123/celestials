"""End-to-end tier: real server, real HTTP, real test DB.

Carl builds a campaign on his segment of one organisation, counts who it
reaches, previews it and sends it. Sam unsubscribes on the public link with
no sign-in. A new champion joins; the second send emails only her and shows
Sam skipped as unsubscribed. A sent campaign cannot be deleted. Alice
re-subscribes Sam on his contact page."""

import re
from io import StringIO

from django.core import mail
from django.core.management import call_command
from django.test import LiveServerTestCase

from e2e.http import http_delete, http_get, http_patch, http_post

LINK = re.compile(r"/u/([A-Za-z0-9_-]+)$")


class CampaignsFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. A workspace signs up; its admin adds Carl.
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
        self.created(
            "/auth/users/",
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            alice,
        )
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]

        # 2. Carl's organisation, its champion and its finance manager, and a segment of it.
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]
        sam = self.created(
            f"/customers/{pizza}/contacts/",
            {"name": "Sam Pizza", "role": "champion", "email": "sam@pizza.io"},
            carl,
        )["id"]
        self.created(
            f"/customers/{pizza}/contacts/",
            {"name": "Fin Pizza", "role": "finance_manager", "email": "fin@pizza.io"},
            carl,
        )
        segment = self.created("/segments/", {"name": "Pizza", "kind": "customer"}, carl)["id"]
        status, body = http_patch(
            self.api(f"/segments/{segment}/members/{pizza}/"), {"state": "pinned"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 3. The campaign: champions and decision makers by default, so Sam.
        campaign = self.created(
            "/campaigns/",
            {
                "name": "Win-back",
                "segment": segment,
                "subject": "Hi {first_name}",
                "body": "We miss you at {organisation}. {sender_name}",
            },
            carl,
        )
        self.assertEqual(
            (campaign["status"], campaign["roles"]), ("draft", ["champion", "decision_maker"])
        )
        path = f"/campaigns/{campaign['id']}"
        status, body = http_get(self.api(f"{path}/audience/"), token=carl)
        self.assertEqual(
            (status, body["reach"], body["sample"]), (200, 1, [{"id": sam, "name": "Sam Pizza"}])
        )

        # 4. The preview, with a placeholder link; nothing is sent.
        status, body = http_post(self.api(f"{path}/preview/"), {}, token=carl)
        self.assertEqual((status, body["subject"]), (200, "Hi Sam"))
        self.assertTrue(
            body["body"].startswith("We miss you at Pizza Hut. Carl CSM\n\n—\nCarl CSM, Acme Inc\n")
        )
        self.assertTrue(body["body"].endswith("/u/preview"))
        self.assertEqual(mail.outbox, [])

        # 5. Send now answers at once, still sending; the minute runner emails.
        status, first = http_post(self.api(f"{path}/sends/"), {}, token=carl)
        self.assertEqual(
            (status, first["status"], first["counts"]["sent"]), (201, "sending", 0), first
        )
        self.assertEqual(mail.outbox, [])
        call_command("deliver_pending", stdout=StringIO())
        status, body = http_get(self.api(f"{path}/sends/{first['id']}/"), token=carl)
        self.assertEqual((body["status"], body["counts"]["sent"]), ("sent", 1), body)
        (message,) = mail.outbox
        self.assertEqual((message.to, message.subject), (["sam@pizza.io"], "Hi Sam"))
        status, body = http_get(self.api(f"{path}/sends/{first['id']}/deliveries/"), token=carl)
        self.assertEqual(
            [(row["contact"]["name"], row["status"]) for row in body["results"]],
            [("Sam Pizza", "sent")],
        )

        # 6. Sam unsubscribes on the public link, no sign-in.
        token = LINK.search(message.body).group(1)
        status, body = http_get(self.api(f"/campaigns/unsubscribe/{token}/"))
        self.assertEqual((status, body), (200, {"workspace": "Acme Inc"}))
        status, _ = http_post(self.api(f"/campaigns/unsubscribe/{token}/"), {})
        self.assertEqual(status, 204)
        status, body = http_get(self.api("/campaigns/unsubscribe/not-a-token/"))
        self.assertEqual((status, body), (404, {"detail": "This link has expired."}))

        # 7. A new champion; the second send emails only her, Sam is skipped as unsubscribed.
        self.created(
            f"/customers/{pizza}/contacts/",
            {"name": "Dee Pizza", "role": "champion", "email": "dee@pizza.io"},
            carl,
        )
        status, second = http_post(self.api(f"{path}/sends/"), {}, token=carl)
        self.assertEqual(status, 201, second)
        call_command("deliver_pending", stdout=StringIO())
        self.assertEqual([m.to for m in mail.outbox[1:]], [["dee@pizza.io"]])
        self.assertEqual(second["counts"]["skipped"]["unsubscribed"], 1)
        status, body = http_get(
            self.api(f"{path}/sends/{second['id']}/deliveries/?status=skipped"), token=carl
        )
        self.assertEqual(
            [(row["contact"]["name"], row["reason"]) for row in body["results"]],
            [("Sam Pizza", "unsubscribed")],
        )
        status, body = http_get(self.api(f"{path}/sends/"), token=carl)
        self.assertEqual([row["id"] for row in body["results"]], [second["id"], first["id"]])

        # 8. A sent campaign is archived, not deleted.
        status, body = http_delete(self.api(f"{path}/"), token=carl)
        self.assertEqual((status, body["code"]), (409, "CAMPAIGN_SENT"))
        status, body = http_patch(self.api(f"{path}/"), {"status": "archived"}, token=carl)
        self.assertEqual((status, body["status"]), (200, "archived"))

        # 9. Alice re-subscribes Sam on his contact page.
        status, body = http_get(self.api(f"/contacts/{sam}/"), token=alice)
        self.assertIsNotNone(body["campaigns_unsubscribed_at"])
        status, body = http_patch(
            self.api(f"/contacts/{sam}/"), {"campaigns_unsubscribed": False}, token=alice
        )
        self.assertEqual((status, body["campaigns_unsubscribed_at"]), (200, None))
