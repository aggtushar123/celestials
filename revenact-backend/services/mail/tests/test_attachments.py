"""Attachments (contract §6): fetched from Gmail through the owner's mailbox
on the first open (the message re-read for the current attachment id, or
the bytes inline in the payload), cached under the organisation, served
with the declared type only when the extension, the declared type and the
leading bytes agree, inline only for images and PDFs. 413 over the cap,
409 when the mailbox cannot fetch, 410 when Gmail no longer has it, 503
when Gmail is busy. The owner reads their own; a filed message's files are
read under the twice-filter, and every such read is audited."""

import re
from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from core.throttling import MailAttachmentThrottle
from services.billing.models import SeatAssignment
from services.customers.models import Email
from services.mail import attachments, gmail_store
from services.mail.models import MailAttachment, MailboxConnection

from .gmail_fake import _find_part, fixture, gmail_message
from .gmail_fixtures import GmailFixture

PDF = b"%PDF-1.4 renewal quote"
PNG = b"\x89PNG\r\n\x1a\n fake logo"


class AttachmentFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.mailbox = self.google(self.dana)
        full = fixture("message_full.json")  # from Pizza Hut: filed
        self.fake.add(full, quietly=True)
        self.row, self.filed = gmail_store.store_gmail(self.mailbox, full, now=self.now)
        self.pdf = self.row.attachments.get(part_id="1")
        self.logo = self.row.attachments.get(part_id="2")
        self.fake.attach_file(full["id"], "1", PDF)
        self.fake.attach_file(full["id"], "2", PNG, in_payload=True)
        self.client.force_authenticate(self.dana)

    def get(self, part, query=""):
        return self.client.get(f"/api/v1/mail/attachments/{part.pk}/download/{query}")

    def body(self, response):
        return b"".join(response.streaming_content)

    def gmail_reads(self):
        return [where for _, where, _ in self.fake.calls if "/messages/" in where]

    def unfiled(self, gmail_id, filename, mime_type, data):
        full = gmail_message(
            gmail_id,
            sender="Stranger <x@else.io>",
            attachments=[{"filename": filename, "mime_type": mime_type, "size": len(data)}],
        )
        self.fake.add(full, quietly=True)
        row, _ = gmail_store.store_gmail(self.mailbox, full, now=self.now)
        self.fake.attach_file(gmail_id, "1", data)
        return row.attachments.get()


class FirstOpenTests(AttachmentFixture):
    def test_the_first_open_fetches_it_once_and_serves_it_inline(self):
        response = self.get(self.pdf)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.body(response), PDF)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response["Content-Disposition"].startswith("inline"))
        self.assertEqual(response["Content-Length"], str(len(PDF)))
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Content-Security-Policy"], "default-src 'none'; sandbox")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        # Re-read for the current attachment id (Gmail rotates them), then the bytes.
        self.assertEqual(len(self.gmail_reads()), 2)
        self.pdf.refresh_from_db()
        self.assertRegex(
            self.pdf.file.name, rf"^mail_attachments/{self.org.pk}/[0-9a-f]{{32}}\.pdf$"
        )
        self.assertIsNotNone(self.pdf.fetched_at)
        self.assertEqual(self.body(self.get(self.pdf)), PDF)
        self.assertEqual(len(self.gmail_reads()), 2)  # cached: Gmail is not asked again

    def test_a_small_part_inline_in_the_payload_takes_one_call(self):
        response = self.get(self.logo)
        self.assertEqual((self.body(response), response["Content-Type"]), (PNG, "image/png"))
        self.assertEqual(len(self.gmail_reads()), 1)

    def test_download_forces_an_attachment(self):
        response = self.get(self.pdf, "?download=1")
        self.assertTrue(response["Content-Disposition"].startswith("attachment"))

    def test_bytes_that_are_not_their_type_and_unsafe_types_are_plain_downloads(self):
        for gmail_id, filename, mime_type, data in (
            ("u1", "quote.pdf", "application/pdf", b"<html><script>"),
            ("u2", "logo.svg", "image/svg+xml", b"<svg onload=x>"),
            ("u3", "files.zip", "application/zip", b"PK\x03\x04zip"),
        ):
            part = self.unfiled(gmail_id, filename, mime_type, data)
            response = self.get(part)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "application/octet-stream", filename)
            self.assertTrue(response["Content-Disposition"].startswith("attachment"), filename)

    def test_two_first_opens_at_once_keep_one_file(self):
        first = MailAttachment.objects.get(pk=self.pdf.pk)
        second = MailAttachment.objects.get(pk=self.pdf.pk)
        storage = MailAttachment._meta.get_field("file").storage
        self.assertTrue(attachments.cache(first, PDF, self.now))
        with patch.object(storage, "delete", wraps=storage.delete) as delete:
            self.assertFalse(attachments.cache(second, PDF, self.now))
        discarded = delete.call_args.args[0]
        self.assertEqual(second.file.name, first.file.name)
        self.assertNotEqual(discarded, first.file.name)
        self.assertTrue(storage.exists(first.file.name))
        self.assertFalse(storage.exists(discarded))


class RefusalTests(AttachmentFixture):
    def assertCode(self, response, status_code, code):
        self.assertEqual((response.status_code, response.data["code"]), (status_code, code))

    @override_settings(MAIL_ATTACHMENT_MAX_BYTES=10)
    def test_over_the_cap_declared_or_real(self):
        self.assertCode(self.get(self.pdf), 413, "ATTACHMENT_TOO_LARGE")
        self.assertEqual(self.gmail_reads(), [])
        MailAttachment.objects.filter(pk=self.pdf.pk).update(
            size=5
        )  # declared small, really 22 bytes
        self.assertCode(self.get(self.pdf), 413, "ATTACHMENT_TOO_LARGE")
        self.pdf.refresh_from_db()
        self.assertEqual(self.pdf.file.name, "")

    def test_a_mailbox_that_cannot_fetch(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.get(self.pdf)
        self.assertEqual(
            (response.status_code, response.data),
            (
                409,
                {
                    "code": "ATTACHMENT_UNAVAILABLE",
                    "detail": (
                        "This file hasn't been fetched from Gmail yet, "
                        "and its mailbox isn't connected."
                    ),
                },
            ),
        )

    def test_a_paused_mailbox_cannot_fetch_but_a_cached_file_is_still_served(self):
        self.get(self.pdf)
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertCode(self.get(self.logo), 409, "ATTACHMENT_UNAVAILABLE")
        self.assertEqual(self.get(self.pdf).status_code, 200)

    def test_gone_from_gmail(self):
        del self.fake.messages[self.row.provider_message_id]["payload"]["parts"][1]
        self.assertCode(self.get(self.pdf), 410, "ATTACHMENT_GONE")
        del self.fake.messages[self.row.provider_message_id]
        self.assertCode(self.get(self.logo), 410, "ATTACHMENT_GONE")

    def test_bytes_gmail_sends_that_are_not_base64_are_gone(self):
        payload = self.fake.messages[self.row.provider_message_id]["payload"]
        _find_part(payload, "2")["body"]["data"] = "A"  # one character short of any byte
        self.assertCode(self.get(self.logo), 410, "ATTACHMENT_GONE")

    def test_gmail_busy(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            backoff_until=self.now + timedelta(seconds=90)
        )
        response = self.get(self.pdf)
        self.assertCode(response, 503, "GMAIL_BUSY")
        self.assertEqual(response.data["detail"], "Gmail is busy. Try again in a minute.")
        self.assertLessEqual(int(response["Retry-After"]), 90)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(backoff_until=None)
        self.fake.fail(r"/attachments/", 503)
        self.assertCode(self.get(self.pdf), 503, "GMAIL_BUSY")
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.backoff_until)  # a fetch never backs the mailbox off

    def test_a_lost_grant_pauses_the_mailbox(self):
        self.fake.fail(r"/messages/", 403, "insufficientPermissions")
        self.assertCode(self.get(self.pdf), 409, "ATTACHMENT_UNAVAILABLE")
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.paused_reason, "token_revoked")

    def test_it_is_throttled_per_user(self):
        with patch.object(MailAttachmentThrottle, "rate", "2/min"):
            codes = [self.get(self.pdf).status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])


class WhoReadsTests(AttachmentFixture):
    def test_the_owners_read_of_filed_mail_is_audited(self):
        self.get(self.pdf)
        event = AuditEvent.objects.get(action="mailbox.attachment_downloaded")
        self.assertEqual(
            (event.actor, event.target_type, event.target_id, event.target_repr),
            (self.dana, "mail.mailattachment", str(self.pdf.pk), f"attachment {self.pdf.pk}"),
        )
        self.assertEqual(
            event.metadata,
            {
                "email": self.filed.pk,
                "attachment": self.pdf.pk,
                "content_type": "application/pdf",
                "size": 182311,
                "fetched": True,
                "owner": True,
            },
        )

    def test_unfiled_mail_is_the_owners_alone_and_not_audited(self):
        part = self.unfiled("u1", "notes.txt", "text/plain", b"hello")
        self.assertEqual(self.get(part).status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.attachment_downloaded").exists())
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.get(part).status_code, 404)

    def test_filed_mail_is_read_under_the_twice_filter(self):
        # Mail is owner-only (2026-10-17): her manager, who may open Pizza Hut,
        # reads none of Dana's private mail, nor does Priya (view-all).
        for person in (self.carl, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.get(self.pdf).status_code, 404)
        # Dana adds it to Revenact: anyone who may open Pizza Hut reads its files.
        Email.objects.filter(pk=self.filed.pk).update(shared_at=self.now)
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.body(self.get(self.pdf)), PDF)
        event = AuditEvent.objects.get(action="mailbox.attachment_downloaded")
        self.assertEqual((event.actor, event.metadata["owner"]), (self.carl, False))
        self.client.force_authenticate(self.priya)
        self.assertEqual(self.body(self.get(self.pdf)), PDF)


class DetailFieldTests(AttachmentFixture):
    def parts(self):
        return self.client.get(f"/api/v1/mail/messages/{self.row.pk}/").data["attachments"]

    def test_available_preview_and_the_url(self):
        pdf, logo = self.parts()
        self.assertEqual(
            {k: pdf[k] for k in ("available", "preview", "download_url")},
            {
                "available": True,
                "preview": True,
                "download_url": f"/api/v1/mail/attachments/{self.pdf.pk}/download/",
            },
        )
        self.assertTrue(logo["preview"])

    def test_not_available_from_a_mailbox_that_cannot_fetch_unless_cached(self):
        self.get(self.pdf)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        pdf, logo = self.parts()
        self.assertEqual(
            (pdf["available"], logo["available"], logo["download_url"]), (True, False, None)
        )
        self.assertTrue(re.match(r"^/api/v1/mail/attachments/\d+/download/$", pdf["download_url"]))
