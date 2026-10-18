"""Delivery 2's storage: the outbox row and its constraints, the cached
attachment's path and its clean-up, the label index, the label key, the new
notification kind and the settings."""

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import MailLabel, MailMessage, MailOutbox, mail_attachment_path
from services.notifications.models import Notification

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture


class OutboxFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        self.row, _ = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=self.now
        )

    def outbox(self, **fields):
        values = {
            "connection": self.mailbox,
            "action_id": uuid.uuid4(),
            "op": "read",
            "message": self.row,
            "label_key": "UNREAD",
            "add": False,
            "previous": {"present": True},
            "next_attempt_at": self.now,
        }
        values.update(fields)
        return MailOutbox.objects.create(**values)


class OutboxRowTests(OutboxFixture):
    def test_a_new_row_is_pending_uncounted_and_names_no_subject(self):
        row = self.outbox()
        self.assertEqual((row.status, row.attempts, row.reason), ("pending", 0, ""))
        self.assertEqual(str(row), f"outbox {row.pk} read")

    def test_one_pending_row_per_message_and_label(self):
        self.outbox()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox()
        # A row on its way to Gmail does not count: a new action queues beside it.
        MailOutbox.objects.update(status="sending")
        self.outbox()
        self.assertEqual(MailOutbox.objects.count(), 2)

    def test_one_live_label_create_per_label(self):
        label = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        create = {
            "op": "label_create",
            "message": None,
            "label": label,
            "label_key": "",
            "add": None,
            "previous": {},
            "payload": {"name": "Pilot"},
        }
        self.outbox(**create)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(**create)

    def test_label_create_has_a_label_and_no_message_and_the_rest_a_message(self):
        label = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="label_create", label=label, label_key="")
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(message=None)

    def test_a_message_gmail_deletes_takes_its_rows(self):
        self.outbox()
        self.row.delete()
        self.assertFalse(MailOutbox.objects.exists())


class LabelKeyTests(OutboxFixture):
    def test_a_label_is_keyed_by_its_gmail_id_or_pending(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.assertEqual(made.key, f"pending:{made.pk}")
        made.gmail_id = "Label_40"
        self.assertEqual(made.key, "Label_40")

    def test_a_label_filter_is_a_containment_on_the_gin_index(self):
        rows = MailMessage.objects.filter(label_ids__contains=["Label_12"])
        self.assertIn("@>", str(rows.query))
        self.assertEqual(list(rows), [self.row])
        self.assertIn("mail_msg_label_ids_gin", {index.name for index in MailMessage._meta.indexes})


class CachedFileTests(OutboxFixture):
    def test_the_path_is_the_organisation_and_a_random_name(self):
        part = self.row.attachments.get(part_id="1")
        self.assertRegex(
            mail_attachment_path(part, "Renewal quote.pdf"),
            rf"^mail_attachments/{self.org.pk}/[0-9a-f]{{32}}\.pdf$",
        )

    def test_deleting_the_row_deletes_the_file_on_commit(self):
        part = self.row.attachments.get(part_id="1")
        part.file.save("q.pdf", ContentFile(b"%PDF-1.4"), save=True)
        storage, name = part.file.storage, part.file.name
        self.assertTrue(storage.exists(name))
        with self.captureOnCommitCallbacks(execute=True):
            self.row.delete()  # the cascade, as a history deletion or the prune does
        self.assertFalse(storage.exists(name))


class SettingsTests(SimpleTestCase):
    def test_the_contract_defaults(self):
        self.assertEqual(
            (
                settings.MAIL_OUTBOX_MAX_ATTEMPTS,
                settings.MAIL_OUTBOX_RETRY_SECONDS,
                settings.MAIL_OUTBOX_BATCH_SIZE,
                settings.MAIL_OUTBOX_SINGLE_CALLS_PER_TICK,
                settings.MAIL_OUTBOX_ISSUE_DAYS,
                settings.MAIL_OUTBOX_SENT_RETENTION_HOURS,
                settings.MAIL_ACTION_MAX_MESSAGES,
                settings.MAIL_THREAD_MAX_MESSAGES,
                settings.MAIL_ATTACHMENT_MAX_BYTES,
            ),
            (5, [30, 120, 600, 3600], 1000, 200, 7, 24, 1000, 100, 52428800),
        )
        self.assertIsNone(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_attachment"])

    def test_the_notification_kind(self):
        self.assertEqual(Notification.Kind.MAIL_ACTION_FAILED, "mail_action_failed")
        self.assertEqual(Notification.Kind.MAIL_ACTION_FAILED.label, "Mail action failed")
