"""Delivery 3's storage: the MailDraft row and its constraints, the outbox's
draft ops and their row shape, the send-as fields, Reply-To, the settings
and the throttles."""

import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import (
    DRAFT_OPS,
    PENDING_DRAFT_PREFIX,
    MailDraft,
    MailMessage,
    MailOutbox,
)

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture


class DraftStorageFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        self.row, _ = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=self.now
        )

    def draft(self, **fields):
        values = {
            "connection": self.mailbox,
            "owner": self.dana,
            "organisation": self.org,
            "kind": MailDraft.Kind.NEW,
        }
        values.update(fields)
        return MailDraft.objects.create(**values)

    def outbox(self, **fields):
        values = {
            "connection": self.mailbox,
            "action_id": uuid.uuid4(),
            "op": "draft_create",
            "next_attempt_at": self.now,
        }
        values.update(fields)
        return MailOutbox.objects.create(**values)


class MailDraftTests(DraftStorageFixture):
    def test_a_new_draft_is_open_local_at_revision_one_and_names_no_subject(self):
        draft = self.draft(subject="Renewal terms")
        self.assertEqual(
            (draft.status, draft.gmail_state, draft.revision, draft.record_chosen),
            ("open", "local", 1, False),
        )
        self.assertEqual((draft.to, draft.cc, draft.bcc, draft.forwarded), ([], [], [], []))
        self.assertEqual(str(draft), f"draft {draft.pk}")
        self.assertEqual(MailDraft.LIVE, ("open", "sending"))

    def test_a_gmail_draft_id_is_held_once_per_mailbox_and_blank_is_free(self):
        self.draft(gmail_draft_id="r-1")
        self.draft()
        self.draft()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.draft(gmail_draft_id="r-1")

    def test_a_draft_files_on_at_most_one_record(self):
        self.draft(customer=self.pizza)
        self.draft(account=self.apac)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.draft(customer=self.pizza, account=self.apac)

    def test_the_drafts_row_and_a_message_deleted_leave_the_draft(self):
        draft = self.draft(message=self.row, source=self.row)
        self.assertEqual(self.row.draft, draft)
        self.row.delete()
        draft.refresh_from_db()
        self.assertEqual((draft.message_id, draft.source_id), (None, None))

    def test_the_placeholder_prefix(self):
        self.assertEqual(PENDING_DRAFT_PREFIX, "pending-draft:")


class DraftOutboxTests(DraftStorageFixture):
    def test_the_draft_ops_and_the_size_reason(self):
        self.assertEqual(DRAFT_OPS, ("draft_create", "draft_update", "draft_delete"))
        self.assertEqual(MailOutbox.DRAFT_OPS, DRAFT_OPS)
        self.assertEqual(MailOutbox.Op.DRAFT_DELETE.label, "Delete the draft")
        self.assertEqual(MailOutbox.Reason.TOO_LARGE, "too_large")

    def test_a_draft_op_has_a_draft_and_no_message_or_label(self):
        draft = self.draft()
        first = self.outbox(draft=draft)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="draft_update", draft=None)
        # Settle the first row so the unique-pending constraint is not what fires.
        first.status = "sent"
        first.save(update_fields=["status"])
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="draft_update", draft=draft, message=self.row)

    def test_a_label_op_never_carries_a_draft(self):
        draft = self.draft()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="read", message=self.row, label_key="UNREAD", add=False, draft=draft)

    def test_one_pending_draft_row_per_draft(self):
        draft = self.draft()
        self.outbox(draft=draft)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="draft_update", draft=draft)
        MailOutbox.objects.update(status="sending")
        self.outbox(op="draft_update", draft=draft)
        self.assertEqual(MailOutbox.objects.filter(draft=draft).count(), 2)

    def test_deleting_the_draft_takes_its_rows(self):
        draft = self.draft()
        self.outbox(draft=draft)
        draft.delete()
        self.assertFalse(MailOutbox.objects.exists())


class FieldTests(DraftStorageFixture):
    def test_the_send_as_fields_start_empty(self):
        self.assertEqual(
            (
                self.mailbox.send_as_name,
                self.mailbox.signature_html,
                self.mailbox.send_as_synced_at,
            ),
            ("", "", None),
        )

    def test_reply_to_starts_empty(self):
        self.assertEqual(MailMessage.objects.get(pk=self.row.pk).reply_to, [])


class SettingsTests(SimpleTestCase):
    def test_the_contract_defaults(self):
        self.assertEqual(
            (
                settings.MAIL_SEND_MAX_BYTES,
                settings.MAIL_SEND_MAX_RECIPIENTS,
                settings.MAIL_DRAFT_MAX_ATTACHMENTS,
                settings.MAIL_SEND_AS_REFRESH_HOURS,
                settings.MAIL_OUTBOX_DRAFT_CALLS_PER_TICK,
                settings.MAIL_SEND_TIMEOUT_SECONDS,
                settings.MAIL_GMAIL_SEARCH_PAGE_SIZE,
                settings.MAIL_DRAFT_SENT_RETENTION_DAYS,
            ),
            (26_214_400, 100, 25, 24, 50, 120, 20, 7),
        )

    def test_the_throttles_are_off_under_test(self):
        from core.throttling import MailDraftUploadThrottle, MailGmailSearchThrottle

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertIsNone(rates["mail_gmail_search"])
        self.assertIsNone(rates["mail_draft_upload"])
        self.assertEqual(MailGmailSearchThrottle.scope, "mail_gmail_search")
        self.assertEqual(MailDraftUploadThrottle.scope, "mail_draft_upload")
