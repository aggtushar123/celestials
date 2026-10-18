"""The nightly prune (contract decision 9): a Google mailbox disconnected
more than 30 days ago goes, its copies, labels and attachment details with
it; the filed Email stays with its mailbox nulled; each deletion is
audited; a dry run only counts."""

import io
import uuid
from datetime import timedelta

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.customers.models import Email
from services.mail import gmail_store, prune
from services.mail.models import (
    MailAttachment,
    MailboxConnection,
    MailLabel,
    MailMessage,
    MailOutbox,
)

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


@override_settings(MAIL_DISCONNECT_RETENTION_DAYS=30)
class PruneTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.now = timezone.now()
        self.old = self.google(self.dana)
        gmail_store.mirror_labels(self.old, fixture("labels_list.json")["labels"])
        _, self.filed = gmail_store.store_gmail(
            self.old, fixture("message_full.json"), now=self.now
        )
        MailboxConnection.objects.filter(pk=self.old.pk).update(
            status="disconnected", credentials="", disconnected_at=self.now - timedelta(days=31)
        )
        self.recent = self.google(
            self.carl, status="disconnected", disconnected_at=self.now - timedelta(days=29)
        )
        self.live = self.google(self.alice)

    def test_only_rows_past_their_30_days_go_with_everything_personal(self):
        self.assertEqual(prune.prune(now=self.now), 1)
        self.assertEqual(
            set(MailboxConnection.objects.values_list("pk", flat=True)),
            {self.recent.pk, self.live.pk},
        )
        for model in (MailMessage, MailLabel, MailAttachment):
            self.assertFalse(model.objects.exists(), model.__name__)
        self.filed.refresh_from_db()
        self.assertIsNone(self.filed.mailbox)
        event = AuditEvent.objects.get(action="mailbox.pruned")
        self.assertEqual(
            (event.actor, event.organisation, event.metadata),
            (None, self.org, {"provider": "google", "address": "dana@acme.io", "messages": 1}),
        )

    def test_a_dry_run_only_counts_and_another_workspace_is_left_alone(self):
        self.assertEqual(prune.prune(now=self.now, dry_run=True), 1)
        self.assertTrue(MailboxConnection.objects.filter(pk=self.old.pk).exists())
        other = Organisation.objects.create(name="Other Co")
        self.assertEqual(prune.prune(other, now=self.now), 0)
        self.assertTrue(MailboxConnection.objects.filter(pk=self.old.pk).exists())
        self.assertEqual(Email.objects.count(), 1)

    def test_the_nightly_job_runs_it(self):
        out = io.StringIO()
        call_command("run_health_maintenance", "--dry-run", stdout=out)
        self.assertIn("would delete 1 disconnected mailbox(es)", out.getvalue())
        self.assertTrue(MailboxConnection.objects.filter(pk=self.old.pk).exists())


class OutboxPruneTests(GmailFixture):
    """Decision 23: failed rows go after MAIL_OUTBOX_ISSUE_DAYS, sent rows after
    MAIL_OUTBOX_SENT_RETENTION_HOURS, unless the message still shows a failed
    row's issue (plan gap 10). Pending rows are never pruned."""

    def setUp(self):
        super().setUp()
        self.now = timezone.now()
        mailbox = self.google(self.dana)
        self.mailbox = mailbox
        self.fresh_issue, _ = gmail_store.store_gmail(
            mailbox, fixture("message_full.json"), now=self.now
        )
        self.other, _ = gmail_store.store_gmail(mailbox, gmail_message("p2"), now=self.now)

    def row(self, message, label_key, status, **fields):
        return MailOutbox.objects.create(
            connection=self.mailbox,
            action_id=uuid.uuid4(),
            op="read",
            message=message,
            label_key=label_key,
            add=False,
            previous={"present": True},
            status=status,
            next_attempt_at=self.now,
            **fields,
        )

    def make(self):
        day, hour = timedelta(days=1), timedelta(hours=1)
        return {
            "old_failed": self.row(self.other, "UNREAD", "failed", failed_at=self.now - 8 * day),
            "fresh_failed": self.row(
                self.fresh_issue, "UNREAD", "failed", failed_at=self.now - 6 * day
            ),
            "sent_beside_an_issue": self.row(
                self.fresh_issue, "STARRED", "sent", sent_at=self.now - 25 * hour
            ),
            "old_sent": self.row(self.other, "STARRED", "sent", sent_at=self.now - 25 * hour),
            "new_sent": self.row(self.other, "INBOX", "sent", sent_at=self.now - hour),
            "pending": self.row(self.other, "TRASH", "pending"),
        }

    def test_what_nothing_reads_any_more_goes(self):
        rows = self.make()
        self.assertEqual(prune.prune_outbox(now=self.now, dry_run=True), 2)
        self.assertEqual(MailOutbox.objects.count(), 6)
        self.assertEqual(prune.prune_outbox(now=self.now), 2)
        kept = set(MailOutbox.objects.values_list("pk", flat=True))
        self.assertEqual(
            kept,
            {
                rows[name].pk
                for name in ("fresh_failed", "sent_beside_an_issue", "new_sent", "pending")
            },
        )

    def test_the_nightly_job_runs_it(self):
        self.make()
        out = io.StringIO()
        call_command("run_health_maintenance", "--dry-run", stdout=out)
        self.assertIn("would clear 2 old mail outbox row(s).", out.getvalue())
        self.assertEqual(MailOutbox.objects.count(), 6)
