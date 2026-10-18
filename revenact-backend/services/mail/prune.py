"""The 30-day retention after a Google disconnect (contract decision 9).

A disconnected Google row is kept, credentials wiped, so its owner can still
read their copies or reconnect the same address and keep them. After
MAIL_DISCONNECT_RETENTION_DAYS the nightly job deletes it: its MailMessage,
MailLabel and MailAttachment rows cascade, and a filed customers.Email keeps
its record with `mailbox` set null, as an Outlook or IMAP disconnect does at
once. Each deletion is audited as evidence.

The outbox keeps a failed row for MAIL_OUTBOX_ISSUE_DAYS (it is the message's
sync_issue) and a sent row for MAIL_OUTBOX_SENT_RETENTION_HOURS, longer while
its message still shows a failed row's issue; `prune_outbox` deletes the rest
nightly. Not audited: these rows are the person's own working state, not a
record anyone reads.

A sent `MailDraft` is kept MAIL_DRAFT_SENT_RETENTION_DAYS, then `prune_drafts`
deletes it; its sent message stays. A discarded one left behind (no live
outbox row) goes after the same days.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone

from core import audit

from .models import MailboxConnection, MailDraft, MailOutbox


def prune(organisation=None, *, now=None, dry_run=False):
    """Delete the disconnected mailboxes past their retention (one
    organisation, or all). Returns how many it deleted, or would delete."""
    now = now or timezone.now()
    rows = MailboxConnection.objects.filter(
        status=MailboxConnection.Status.DISCONNECTED,
        disconnected_at__lt=now - timedelta(days=settings.MAIL_DISCONNECT_RETENTION_DAYS),
    )
    if organisation is not None:
        rows = rows.filter(organisation=organisation)
    pruned = 0
    for row in rows.select_related("organisation").annotate(held=Count("messages")):
        pruned += 1
        if dry_run:
            continue
        audit.record(  # SOC2:LOG-01 SOC2:DATA-04 personal mail deleted at the end of its retention
            "mailbox.pruned",
            organisation=row.organisation,
            target=row,
            metadata={"provider": row.provider, "address": row.address, "messages": row.held},
        )
        row.delete()
    return pruned


def prune_outbox(*, now=None, dry_run=False):
    """Delete outbox rows nothing reads any more (decision 23): failed ones
    past MAIL_OUTBOX_ISSUE_DAYS, sent ones past
    MAIL_OUTBOX_SENT_RETENTION_HOURS unless their message still shows a
    failed row's issue (plan gap 10). Returns how many it deleted, or would."""
    now = now or timezone.now()
    issue_since = now - timedelta(days=settings.MAIL_OUTBOX_ISSUE_DAYS)
    failed = MailOutbox.objects.filter(status=MailOutbox.Status.FAILED, failed_at__lt=issue_since)
    still_shown = MailOutbox.objects.filter(
        message=OuterRef("message"), status=MailOutbox.Status.FAILED, failed_at__gte=issue_since
    )
    sent = MailOutbox.objects.filter(
        status=MailOutbox.Status.SENT,
        sent_at__lt=now - timedelta(hours=settings.MAIL_OUTBOX_SENT_RETENTION_HOURS),
    ).exclude(Exists(still_shown))
    if dry_run:
        return failed.count() + sent.count()
    # SOC2:DATA-04 the outbox keeps nothing past its use
    return failed.delete()[0] + sent.delete()[0]


def prune_drafts(*, now=None, dry_run=False):
    """Delete sent MailDraft rows past MAIL_DRAFT_SENT_RETENTION_DAYS (D3
    contract §9): the draft goes, the sent message (its own row) stays.
    Discarded drafts go after the same days since they were discarded
    (`updated_at`): one is left behind when a disconnect deleted its pending
    draft_delete, and would otherwise keep its content (final review 4). A
    draft whose outbox rows are still live stays: deleting it would cascade
    away a draft_delete Gmail has not run yet. Returns how many drafts it
    deleted, or would."""
    now = now or timezone.now()
    before = now - timedelta(days=settings.MAIL_DRAFT_SENT_RETENTION_DAYS)
    rows = MailDraft.objects.filter(
        Q(status=MailDraft.Status.SENT, sent_at__lt=before)
        | Q(status=MailDraft.Status.DISCARDED, updated_at__lt=before)
    ).exclude(Exists(MailOutbox.objects.filter(draft=OuterRef("pk"), status__in=MailOutbox.LIVE)))
    if dry_run:
        return rows.count()
    # SOC2:DATA-04 a sent or discarded draft's working copy is kept a week
    return rows.delete()[1].get("mail.MailDraft", 0)
