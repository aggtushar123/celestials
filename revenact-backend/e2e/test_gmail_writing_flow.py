"""End-to-end tier for two-way Gmail delivery 3: a real server, real HTTP
and a real test database; Gmail is the in-memory FakeGmail, patched in this
process (both transports), which the live server shares.

Dana's Gmail is imported with Ann's quote and her signature is read. She
starts a reply all from the prefill, saves it, attaches a PDF over multipart,
and the loop saves the draft in Gmail with the file. She edits it in Gmail;
the loop brings the edit back, so her editor's old revision is refused with
the newest draft. She edits from that and sends: it goes as the Gmail
draft, threaded, filed on Pizza Hut and audited. Carl, her manager, cannot
read her draft. She searches older mail in Gmail and opens a result."""

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
from services.customers.models import Customer, Email
from services.identity.models import OrganizationDomain
from services.mail.loop import Loop
from services.mail.models import MailboxConnection
from services.mail.tests.gmail_fake import FakeGmail, fixture, gmail_message
from services.mail.tests.gmail_fixtures import google_connection

PDF = b"%PDF-1.4 quote v2"
#: Made at import: no credential-looking literal in the code (CI's semgrep).
PASSWORD = secrets.token_urlsafe(18)


def upload(url, token, name, data, content_type):
    """One multipart POST with a `file` field, over the wire."""
    boundary = secrets.token_hex(12)
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
            f'filename="{name}"\r\nContent-Type: {content_type}\r\n\r\n'
        ).encode()
        + data
        + f"\r\n--{boundary}--\r\n".encode()
    )
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


class GmailWritingFlowTests(LiveServerTestCase):
    def tick(self):
        """Gmail changed with no push in this test: wake the mailbox, then run the loop."""
        MailboxConnection.objects.update(wake_at=timezone.now())
        Loop().run_once()

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
        lead = Role.objects.create(
            organisation=org, name="Lead", slug="lead", permissions=[Capability.VIEW_ALL_ACCOUNTS]
        )
        User.objects.filter(pk__in=[carl.pk, dana.pk]).update(role=lead)
        pizza = Customer.objects.create(
            organisation=org, name="Pizza Hut", domain="pizzahut.com", owner=carl
        )
        google_connection(User.objects.get(pk=dana.pk))
        return pizza

    def test_full_flow(self):
        fake = FakeGmail("dana@acme.io")
        quote = fixture("message_full.json")
        quote["internalDate"] = str(int((timezone.now() - timedelta(hours=3)).timestamp() * 1000))
        fake.add(quote, quietly=True)
        fake.add(
            gmail_message(
                "old1",
                subject="2023 renewal",
                sender="Ann Lee <ann@pizzahut.com>",
                sent_at=timezone.now() - timedelta(days=700),
            ),
            quietly=True,
        )
        with (
            patch("services.mail.providers.google.http_json", fake),
            patch("services.mail.providers.google.http_upload", fake.upload),
            patch(
                "services.customers.classification.get_completion",
                side_effect=CopilotNotConfigured("no model in tests"),
            ),
        ):
            self.flow(fake, quote)

    def flow(self, fake, quote):
        pizza = self.world()
        tokens = {who: self.login(f"{who}@acme.io") for who in ("dana", "carl")}
        dana = tokens["dana"]

        # 1. The loop imports her mailbox and reads her signature.
        Loop().run_once()
        status, page = http_get(self.api("/mail/messages/"), token=dana)
        [inbox] = [item for item in page["results"] if item["subject"] == "Renewal quote"]

        # 2. Reply all from the prefill: Ann to, Sam cc, the signature above the quote.
        status, prefill = http_get(
            self.api(f"/mail/compose/?kind=reply_all&message={inbox['id']}"), token=dana
        )
        self.assertEqual(status, 200, prefill)
        self.assertEqual(prefill["to"], [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual(prefill["cc"], [["Sam Pizza", "sam@pizzahut.com"]])
        self.assertIn("data-revenact-signature", prefill["html"])
        status, draft = http_post(
            self.api("/mail/drafts/"),
            {"kind": "reply_all", "source_message_id": inbox["id"], "html": "<p>Two years.</p>"},
            token=dana,
        )
        self.assertEqual((status, draft["revision"]), (201, 1), draft)

        # 3. A file over multipart, then the loop saves the draft in Gmail with it.
        url = self.api(f"/mail/drafts/{draft['id']}/attachments/")
        self.assertEqual(upload(url, dana, "Quote v2.pdf", PDF, "application/pdf"), 201)
        Loop().run_once()
        status, saved = http_get(self.api(f"/mail/drafts/{draft['id']}/"), token=dana)
        self.assertEqual((saved["gmail"], saved["revision"]), ({"state": "saved"}, 2))
        [gmail_id] = fake.drafts
        in_gmail = fake.messages[fake.drafts[gmail_id]]
        self.assertTrue(
            any(p.get("filename") == "Quote v2.pdf" for p in in_gmail["payload"]["parts"])
        )

        # 4. Edited in Gmail: the loop brings it back; the old revision is refused.
        fake.edit_draft(
            gmail_id,
            gmail_message(
                "edited1",
                sender="Dana Ruiz <dana@acme.io>",
                to="Ann Lee <ann@pizzahut.com>",
                cc="Sam Pizza <sam@pizzahut.com>",
                subject="Re: Renewal quote",
                text="Two years, from March.",
                thread_id=quote["threadId"],
            ),
        )
        self.tick()
        status, body = http_patch(
            self.api(f"/mail/drafts/{draft['id']}/"), {"subject": "x", "revision": 2}, token=dana
        )
        self.assertEqual((status, body["code"]), (409, "DRAFT_CHANGED"))
        newest = body["draft"]
        self.assertEqual((newest["revision"], newest["text"]), (3, "Two years, from March."))

        # 5. Carl, her manager, cannot read it.
        status, _ = http_get(self.api(f"/mail/drafts/{draft['id']}/"), token=tokens["carl"])
        self.assertEqual(status, 404)

        # 6. She sends from the newest revision: the Gmail draft goes, threaded and filed.
        status, sent = http_post(
            self.api(f"/mail/drafts/{draft['id']}/send/"),
            {"html": "<p>Two years, from March. Thanks!</p>", "revision": 3},
            token=dana,
        )
        self.assertEqual(status, 200, sent)
        self.assertEqual(fake.uploads[-1][1], "/drafts/send")
        self.assertEqual(fake.uploads[-1][2]["message"], {"threadId": quote["threadId"]})
        self.assertEqual(sent["message"]["folder"], "sent")
        filed = Email.objects.get(pk=sent["email"]["id"])
        self.assertEqual((filed.customer, filed.direction), (pizza, "sent"))
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reply").exists())
        self.assertEqual(fake.drafts, {})
        self.tick()
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)

        # 7. Search older mail in Gmail, then open a result.
        status, found = http_get(self.api("/mail/gmail/search/?q=renewal"), token=dana)
        old = next(item for item in found["results"] if item["gmail_id"] == "old1")
        self.assertIsNone(old["message_id"])
        status, opened = http_post(
            self.api("/mail/gmail/search/open/"), {"gmail_id": "old1"}, token=dana
        )
        self.assertEqual((status, opened["subject"]), (201, "2023 renewal"))
