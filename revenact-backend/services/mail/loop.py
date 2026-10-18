"""The mail loop (contract §5): every MAIL_SYNC_TICK_SECONDS, claim the
mailboxes that are due and sync them; once a minute, sweep the Gmail gates.

A claim is a lease, not a held lock (decision 18). One short transaction
takes due rows with SELECT ... FOR UPDATE SKIP LOCKED, stamps lease_until,
clears wake_at and commits. The provider work then runs outside any
transaction, so a push's UPDATE of wake_at never waits on a tick, and a
second process would only ever take other rows. Google is due every
MAIL_SYNC_INTERVAL_SECONDS or when woken; Outlook and IMAP every
MAIL_LEGACY_SYNC_INTERVAL_SECONDS, through today's sync_mailbox. Run as
`python manage.py sync_mail --loop` (revenact-infra's `mailsync`).
"""

import logging
import signal
import time
from datetime import timedelta

from django.conf import settings
from django.db import close_old_connections, transaction
from django.db.models import F, Q
from django.utils import timezone

from . import gates, gmail_sync
from .models import MailboxConnection
from .sync import sync_mailbox

logger = logging.getLogger(__name__)
GOOGLE = MailboxConnection.Provider.GOOGLE
Status = MailboxConnection.Status


def _seconds(name):
    return timedelta(seconds=getattr(settings, name))


def _unleased(now):
    return Q(lease_until__isnull=True) | Q(lease_until__lte=now)


def due_q(now):
    """Due: not leased, not backing off, and by provider (contract §5 step 2)."""
    google = Q(provider=GOOGLE, status=Status.CONNECTED, paused_reason="") & (
        Q(wake_at__lte=now)
        | Q(last_synced_at__isnull=True)
        | Q(last_synced_at__lt=now - _seconds("MAIL_SYNC_INTERVAL_SECONDS"))
    )
    legacy = (
        ~Q(provider=GOOGLE)
        & Q(status__in=[Status.CONNECTED, Status.ERROR])
        & (
            Q(last_synced_at__isnull=True)
            | Q(last_synced_at__lt=now - _seconds("MAIL_LEGACY_SYNC_INTERVAL_SECONDS"))
        )
    )
    not_waiting = Q(backoff_until__isnull=True) | Q(backoff_until__lte=now)
    return _unleased(now) & not_waiting & (google | legacy)


def claim_due(*, now=None, limit=None):
    """Lease up to MAIL_SYNC_BATCH due mailboxes, never synced first, then the
    oldest. A row another process has locked is skipped, never waited on."""
    now = now or timezone.now()
    with transaction.atomic():
        ids = list(
            MailboxConnection.objects.select_for_update(skip_locked=True)
            .filter(due_q(now))
            .order_by(F("last_synced_at").asc(nulls_first=True), "pk")
            .values_list("pk", flat=True)[: limit or settings.MAIL_SYNC_BATCH]
        )
        if ids:
            MailboxConnection.objects.filter(pk__in=ids).update(
                lease_until=now + _seconds("MAIL_LEASE_SECONDS"), wake_at=None
            )
    rows = MailboxConnection.objects.filter(pk__in=ids).select_related("user", "organisation")
    by_pk = {row.pk: row for row in rows}
    return [by_pk[pk] for pk in ids if pk in by_pk]


def sync_one(connection, *, now=None):
    """One claimed mailbox. Google: a tick (it clears its own lease). Outlook
    and IMAP: today's pass, and a failed pass waits the legacy interval."""
    now = now or timezone.now()
    from services.emailagent import inbox

    if connection.provider == GOOGLE:
        result = gmail_sync.tick(connection, now=now)
        if result.outcome != "ok":
            logger.info("gmail connection %s: %s", connection.pk, result.outcome)
        # After the pass's transactions: the agent's model call holds no lock.
        inbox.drain(connection, now=now)
        return result.filed
    filed = sync_mailbox(connection)
    inbox.drain(connection, now=now)
    failed = connection.status == Status.ERROR
    MailboxConnection.objects.filter(pk=connection.pk).update(
        lease_until=None,
        backoff_until=now + _seconds("MAIL_LEGACY_SYNC_INTERVAL_SECONDS") if failed else None,
    )
    return filed


def _safely(connection):
    """sync_one, never raising: a mailbox that breaks unexpectedly (unreadable
    credentials, a bug) is released and backed off, and the loop moves on."""
    try:
        return sync_one(connection)
    except Exception as exc:  # noqa: BLE001 - one mailbox never stops the rest
        # the class name only: an exception's text can quote mail
        logger.error("mail sync failed for connection %s: %s", connection.pk, type(exc).__name__)
        # Only while this claim holds: a row disconnected or reconnected
        # meanwhile is left as its owner made it.
        MailboxConnection.objects.filter(
            pk=connection.pk, lease_until=connection.lease_until
        ).exclude(status=Status.DISCONNECTED).update(
            lease_until=None, backoff_until=timezone.now() + _seconds("MAIL_BACKOFF_MAX_SECONDS")
        )
        return 0


def run_all(*, user_email=None, now=None):
    """`sync_mail` without --loop: one pass over every live mailbox, ignoring
    the due rules. Paused, disconnected and leased ones are skipped. Returns
    (mailboxes synced, emails filed)."""
    now = now or timezone.now()
    gates.sweep(now=now)
    rows = MailboxConnection.objects.exclude(status=Status.DISCONNECTED).filter(paused_reason="")
    if user_email:
        rows = rows.filter(user__email=user_email)
    synced = filed = 0
    for pk in list(rows.values_list("pk", flat=True)):
        # Re-checked at the lease: a row paused since the listing is skipped.
        leased = (
            MailboxConnection.objects.filter(_unleased(now), pk=pk, paused_reason="")
            .exclude(status=Status.DISCONNECTED)
            .update(lease_until=now + _seconds("MAIL_LEASE_SECONDS"))
        )
        if not leased:
            continue
        connection = MailboxConnection.objects.select_related("user", "organisation").get(pk=pk)
        filed += _safely(connection)
        synced += 1
    return synced, filed


class Loop:
    """`sync_mail --loop`. SIGTERM or SIGINT stop it between mailboxes; the
    ones it had claimed and not reached are released."""

    def __init__(self):
        self.stopping = False
        self._swept_at = None

    def stop(self, *_):
        self.stopping = True

    def run_once(self, now=None):
        now = now or timezone.now()
        if self._swept_at is None or now - self._swept_at >= _seconds("MAIL_SYNC_INTERVAL_SECONDS"):
            gates.sweep(now=now)
            self._swept_at = now
        claimed = claim_due(now=now)
        done = 0
        for connection in claimed:
            if self.stopping:
                break
            _safely(connection)
            done += 1
        left = [connection.pk for connection in claimed[done:]]
        if left:
            MailboxConnection.objects.filter(pk__in=left).update(lease_until=None)
        return done

    def forever(self):
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        while not self.stopping:
            started = time.monotonic()
            close_old_connections()
            try:
                self.run_once()
            except Exception as exc:  # noqa: BLE001 - the loop outlives a bad tick
                logger.error("mail loop tick failed: %s", type(exc).__name__)
            wait = settings.MAIL_SYNC_TICK_SECONDS - (time.monotonic() - started)
            while wait > 0 and not self.stopping:
                time.sleep(min(wait, 1))
                wait -= 1
