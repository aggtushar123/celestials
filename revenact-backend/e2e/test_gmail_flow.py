"""End-to-end tier: real server, real HTTP, real test DB; Gmail itself is
the in-memory FakeGmail (patched in this process, which the live server
shares), and Google's JWKS key is a local one.

Staff switch Acme on for Gmail. Dana sees no gate, starts the connect,
comes back from Google and is connected. The loop imports her mailbox, and
her inbox shows the labels, the CC, the safe HTML and the attachment
details. A push wakes the mailbox. Carl, her manager, reads none of it.
She disconnects, and her copies are kept for 30 days."""

import base64
import json
import time
import urllib.error
import urllib.request
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from e2e.http import http_delete, http_get, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer
from services.identity.models import OrganizationDomain
from services.mail.loop import Loop
from services.mail.models import MailboxConnection
from services.mail.tests.gmail_fake import FakeGmail, fixture, gmail_message

AUDIENCE = "https://revenact.test/api/v1/mail/google/push/"
ACCOUNT = "gmail-push@revenact-test.iam.gserviceaccount.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid",
    GOOGLE_OAUTH_CLIENT_SECRET="sec",
    FRONTEND_URL="https://app.test",
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE=AUDIENCE,
    GMAIL_PUBSUB_SERVICE_ACCOUNT=ACCOUNT,
)
class GmailFlowTests(LiveServerTestCase):
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

    def start_connect(self, token):
        """POST connect/google/ as a browser would: the authorize URL's
        state, and the cookie the answer set for this browser."""
        request = urllib.request.Request(
            self.api("/mail/connect/google/"),
            data=b"{}",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read())
            set_cookie = response.headers["Set-Cookie"]
        self.assertIn("gmail.modify", body["authorize_url"])
        self.assertIn("HttpOnly", set_cookie)
        self.assertIn("Path=/api/v1/mail/oauth/", set_cookie)
        state = parse_qs(urlsplit(body["authorize_url"]).query)["state"][0]
        return state, set_cookie.split(";", 1)[0]

    def landing(self, url, cookie=None):
        """Where the callback sends the browser, without following it."""
        opener = urllib.request.build_opener(_NoRedirect)
        if cookie:
            opener.addheaders.append(("Cookie", cookie))
        try:
            opener.open(url)
        except urllib.error.HTTPError as redirect:
            self.assertEqual(redirect.code, 302)
            location = redirect.headers["Location"]
            self.assertTrue(location.startswith("https://app.test/integrations?"))
            return {k: v[0] for k, v in parse_qs(urlsplit(location).query).items()}
        self.fail("the callback did not redirect")

    def push(self):
        now = int(time.time())
        claims = {
            "aud": AUDIENCE,
            "iss": "https://accounts.google.com",
            "iat": now,
            "exp": now + 300,
            "email": ACCOUNT,
            "email_verified": True,
        }
        data = base64.b64encode(
            json.dumps({"emailAddress": "dana@acme.io", "historyId": 99999}).encode()
        ).decode()
        request = urllib.request.Request(
            self.api("/mail/google/push/"),
            data=json.dumps({"message": {"data": data, "messageId": "1"}}).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {jwt.encode(claims, KEY, algorithm='RS256')}",
            },
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            return response.status

    def test_full_flow(self):
        fake = FakeGmail("dana@acme.io")
        quote = fixture("message_full.json")
        # Inside the 12-month window whenever this runs.
        yesterday = timezone.now() - timedelta(days=1)
        quote["internalDate"] = str(int(yesterday.timestamp() * 1000))
        fake.add(quote, quietly=True)
        fake.add(gmail_message("older", sent_at=timezone.now() - timedelta(days=200)), quietly=True)
        with (
            patch("services.mail.providers.google.http_json", fake),
            patch("services.mail.push._signing_key", return_value=KEY.public_key()),
            patch(
                "services.customers.classification.get_completion",
                side_effect=CopilotNotConfigured("no model in tests"),
            ),
        ):
            self.flow(fake)

    def flow(self, fake):
        # 1. The workspace, its people and its book.
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
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        dana = self.member(alice, "Dana CSM", "dana@acme.io")
        User.objects.filter(pk=dana.pk).update(reports_to=carl)
        acme = dana.organisation
        OrganizationDomain.objects.create(
            organisation=acme, domain="acme.io", verification_status="verified"
        )
        Customer.objects.create(
            organisation=acme, name="Pizza Hut", domain="pizzahut.com", owner=carl
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("carl", "dana")}

        # 2. Not switched on: the Connect button is a gate.
        status, body = http_get(self.api("/mail/connection/"), token=tokens["dana"])
        google = next(p for p in body["providers"] if p["key"] == "google")
        self.assertEqual(google["gate"], "GMAIL_NOT_ENABLED")

        # 3. Staff switch Acme on, with a reason.
        staff = User.objects.create_superuser(
            email="staff@revenact.io", password="supersecret-pw-1", name="Staff"
        )
        staff_token = AccessToken.for_user(staff)
        staff_token["mfa"] = True
        status, body = http_post(
            self.api(f"/platform/organisations/{acme.id}/gmail/"),
            {"enabled": True, "reason": "Pilot approved"},
            token=str(staff_token),
        )
        self.assertEqual((status, body["gmail"]["enabled"]), (200, True))

        # 4. Dana connects.
        #    Her link, opened in a browser that didn't start it, connects nobody.
        state, cookie = self.start_connect(tokens["dana"])
        callback = self.api(f"/mail/oauth/google/callback/?code=xyz&state={state}")
        landed = self.landing(callback)
        self.assertEqual((landed["mailbox"], landed["code"]), ("refused", "BROWSER_MISMATCH"))
        self.assertFalse(MailboxConnection.objects.filter(user=dana).exists())
        self.assertEqual(fake.calls, [])
        landed = self.landing(callback, cookie=cookie)
        self.assertEqual(landed, {"mailbox": "connected"})

        # 5. The loop imports her mailbox.
        Loop().run_once()
        status, body = http_get(self.api("/mail/connection/"), token=tokens["dana"])
        self.assertEqual(body["connection"]["import"]["state"], "done")
        self.assertEqual(body["connection"]["import"]["imported"], 2)
        self.assertTrue(body["connection"]["two_way"])

        # 6. Her inbox shows the labels, the CC, the safe HTML and the parts.
        status, page = http_get(self.api("/mail/messages/"), token=tokens["dana"])
        quote = next(r for r in page["results"] if r["subject"] == "Renewal quote")
        self.assertEqual([label["name"] for label in quote["labels"]], ["Renewals"])
        self.assertEqual(quote["cc"], [["Sam Pizza", "sam@pizzahut.com"]])
        status, detail = http_get(self.api(f"/mail/messages/{quote['id']}/"), token=tokens["dana"])
        self.assertNotIn("<script", detail["html_body"])
        self.assertEqual(len(detail["attachments"]), 2)

        # 7. A push wakes the mailbox; Gmail is not called inline.
        calls = len(fake.calls)
        self.assertEqual(self.push(), 204)
        self.assertIsNotNone(MailboxConnection.objects.get(user=dana).wake_at)
        self.assertEqual(len(fake.calls), calls)

        # 8. Carl, her manager, reads none of it.
        status, body = http_get(self.api("/mail/messages/"), token=tokens["carl"])
        self.assertEqual(body["count"], 0)
        status, _ = http_get(self.api(f"/mail/messages/{quote['id']}/"), token=tokens["carl"])
        self.assertEqual(status, 404)

        # 9. She disconnects; the copies stay for 30 days.
        status, _ = http_delete(self.api("/mail/connection/"), token=tokens["dana"])
        self.assertEqual(status, 204)
        self.assertEqual(fake.revoked, ["fake-refresh"])
        status, body = http_get(self.api("/mail/connection/"), token=tokens["dana"])
        self.assertIsNone(body["connection"])
        self.assertEqual(body["disconnected"]["address"], "dana@acme.io")
        status, body = http_get(self.api("/mail/messages/?folder=done"), token=tokens["dana"])
        status, inbox = http_get(self.api("/mail/messages/"), token=tokens["dana"])
        self.assertEqual(inbox["count"] + body["count"], 2)
