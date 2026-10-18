"""End-to-end tier for two-way Gmail delivery 2: a real server, real HTTP and
a real test database; Gmail is the in-memory FakeGmail, patched in this
process, which the live server shares.

Dana's Gmail is imported. In her conversations she makes a label, puts the
renewal conversation under it and archives it; it leaves her inbox at once,
and the loop sends both to Gmail, creating the label first. She opens the
quote's PDF, fetched from Gmail once. Carl, her manager, cannot open her
conversation, but reads the filed PDF from Pizza Hut's Files tab, audited.
Priya, who may open Pizza Hut but is outside Dana's chain, cannot."""

import secrets
import urllib.error
import urllib.request
from datetime import timedelta
from unittest.mock import patch

from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.http import http_get, http_patch, http_post
from services.accounts.capabilities import Capability
from services.accounts.models import Organisation, Role, User
from services.billing.models import BillingAccount
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer
from services.identity.models import OrganizationDomain
from services.mail.loop import Loop
from services.mail.tests.gmail_fake import FakeGmail, fixture, gmail_message
from services.mail.tests.gmail_fixtures import google_connection

PDF = b"%PDF-1.4 renewal quote"
#: Made at import: no credential-looking literal in the code (CI's semgrep).
PASSWORD = secrets.token_urlsafe(18)


def download(url, token):
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.headers.get("Content-Type"), response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("Content-Type"), error.read()


class GmailActionsFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": PASSWORD})
        self.assertEqual(status, 200, body)
        return body["access"]

    def world(self):
        org = Organisation.objects.create(name="Acme Inc", gmail_two_way_enabled=True)
        BillingAccount.objects.filter(organisation=org).update(seats_limit=10)
        OrganizationDomain.objects.create(
            organisation=org, domain="acme.io", verification_status="verified"
        )

        def make(email, name, **fields):
            return User.objects.create_user(
                email=email, password=PASSWORD, name=name, organisation=org, **fields
            )

        alice = make("alice@acme.io", "Alice", role=User.Role.ADMIN)
        carl = make("carl@acme.io", "Carl", reports_to=alice)
        dana = make("dana@acme.io", "Dana", reports_to=carl)
        priya = make("priya@acme.io", "Priya", reports_to=alice)
        lead = Role.objects.create(
            organisation=org, name="Lead", slug="lead", permissions=[Capability.VIEW_ALL_ACCOUNTS]
        )
        User.objects.filter(pk__in=[carl.pk, dana.pk, priya.pk]).update(role=lead)
        pizza = Customer.objects.create(
            organisation=org, name="Pizza Hut", domain="pizzahut.com", owner=carl
        )
        google_connection(User.objects.get(pk=dana.pk))
        return pizza

    def test_full_flow(self):
        fake = FakeGmail("dana@acme.io")
        quote = fixture("message_full.json")  # from Ann at Pizza Hut, a PDF and an inline logo
        yesterday = timezone.now() - timedelta(days=1)
        quote["internalDate"] = str(int(yesterday.timestamp() * 1000))
        fake.add(quote, quietly=True)
        fake.add(
            gmail_message(
                "reply1",
                thread_id=quote["threadId"],
                labels=["SENT"],
                sender="Dana Ruiz <dana@acme.io>",
                to="ann@pizzahut.com",
                subject="Re: Renewal quote",
                sent_at=yesterday + timedelta(hours=1),
            ),
            quietly=True,
        )
        fake.attach_file(quote["id"], "1", PDF)
        with (
            patch("services.mail.providers.google.http_json", fake),
            patch(
                "services.customers.classification.get_completion",
                side_effect=CopilotNotConfigured("no model in tests"),
            ),
        ):
            self.flow(fake, quote)

    def flow(self, fake, quote):
        pizza = self.world()
        tokens = {who: self.login(f"{who}@acme.io") for who in ("dana", "carl", "priya")}

        # 1. The loop imports her mailbox: one conversation, two messages.
        Loop().run_once()
        status, page = http_get(self.api("/mail/threads/"), token=tokens["dana"])
        self.assertEqual(status, 200, page)
        [thread] = page["results"]
        self.assertEqual(
            (thread["thread_id"], thread["message_count"], thread["unread_count"]),
            (quote["threadId"], 2, 1),
        )
        anchor = thread["id"]

        # 2. A new label on the whole conversation, then Done: off her inbox at once.
        status, label = http_post(
            self.api("/mail/labels/"), {"name": "Pilot"}, token=tokens["dana"]
        )
        self.assertEqual((status, label["pending"]), (201, True))
        status, body = http_post(
            self.api("/mail/actions/"),
            {"op": "label_add", "label_id": label["id"], "thread_of": [anchor]},
            token=tokens["dana"],
        )
        self.assertEqual(body, {"op": "label_add", "messages": 2, "threads": 1, "unchanged": 0})
        status, body = http_patch(
            self.api(f"/mail/messages/{anchor}/thread/"), {"state": "done"}, token=tokens["dana"]
        )
        self.assertEqual(status, 200, body)
        status, page = http_get(self.api("/mail/threads/"), token=tokens["dana"])
        self.assertEqual(page["count"], 0)

        # 3. The loop sends both: the label is made in Gmail first, then applied.
        Loop().run_once()
        made = next(item for item in fake.labels if item["name"] == "Pilot")
        self.assertIn(made["id"], fake.messages[quote["id"]]["labelIds"])
        self.assertIn(made["id"], fake.messages["reply1"]["labelIds"])
        self.assertNotIn("INBOX", fake.messages[quote["id"]]["labelIds"])
        status, labels = http_get(self.api("/mail/labels/"), token=tokens["dana"])
        pilot = next(item for item in labels if item["name"] == "Pilot")
        self.assertEqual((pilot["gmail_id"], pilot["pending"]), (made["id"], False))

        # 4. She opens the quote's PDF: fetched from Gmail once, then cached.
        status, detail = http_get(self.api(f"/mail/messages/{anchor}/"), token=tokens["dana"])
        pdf = next(
            part for part in detail["attachments"] if part["filename"] == "Renewal quote.pdf"
        )
        self.assertEqual((pdf["available"], pdf["preview"]), (True, True))
        url = f"{self.live_server_url}{pdf['download_url']}"
        self.assertEqual(download(url, tokens["dana"]), (200, "application/pdf", PDF))
        self.assertEqual(download(url, tokens["dana"])[0], 200)
        fetches = [where for _, where, _ in fake.calls if "/attachments/" in where]
        self.assertEqual(len(fetches), 1)

        # 5. Carl, her manager: mail is owner-only (2026-10-17), so neither her
        # conversation nor its filed PDF, until she adds it to Revenact.
        status, _ = http_get(self.api(f"/mail/messages/{anchor}/thread/"), token=tokens["carl"])
        self.assertEqual(status, 404)
        status, files = http_get(self.api(f"/customers/{pizza.pk}/files/"), token=tokens["carl"])
        self.assertEqual([item for item in files if item["source"] == "email"], [])
        self.assertEqual(download(url, tokens["carl"])[0], 404)

        # 6. Dana adds the conversation to Revenact: whoever opens Pizza Hut
        # (Carl, and Priya too) now reads the filed PDF, and the download is audited.
        status, shared = http_post(
            self.api(f"/mail/messages/{anchor}/share/"), {}, token=tokens["dana"]
        )
        self.assertEqual((status, shared["shared"]), (200, True))
        for person in ("carl", "priya"):
            status, files = http_get(
                self.api(f"/customers/{pizza.pk}/files/"), token=tokens[person]
            )
            [row] = [item for item in files if item["source"] == "email"]
            self.assertEqual((row["id"], row["name"]), (pdf["id"], "Renewal quote.pdf"))
        self.assertEqual(download(url, tokens["carl"])[2], PDF)
        event = AuditEvent.objects.filter(
            action="mailbox.attachment_downloaded", actor__email="carl@acme.io"
        ).get()
        self.assertFalse(event.metadata["owner"])
