"""One Gmail mailbox, brought up to date (contract §5).

The loop (services/mail/loop.py) claims a due mailbox and calls `tick`: the
outbox flush (services/mail/outbox_flush.py), the label list, the send-as entry once a
day (services/mail/send_as.py), history since `history_id` (or a 30-day re-list when Gmail
no longer has history that old), one page of the reconcile, one page of the 12-month import, the
draft reconcile when a draft changed (services/mail/draft_sync.py), and the
push watch. Every write to the connection names its fields: push and the
gate sweep write to the same row concurrently.

A tick's writes land only while its claim holds (`_save`): the row still
carries the lease_until stamp the claim set, and is not disconnected. A
disconnect or a reconnect clears the stamp, so a tick that was running
then stops quietly instead of writing old credentials, sync state or a
pause over the person's change.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from core import audit

from . import gmail_store
from .models import PENDING_DRAFT_PREFIX, MailboxConnection, MailDraft, MailMessage
from .providers.base import Credentials, ProviderError
from .providers.google import LOST_GRANT, GmailSession

logger = logging.getLogger(__name__)

#: The fields `start_import` sets.
IMPORT_FIELDS = [
    "import_after",
    "import_before",
    "import_total_estimate",
    "import_page_token",
    "import_done_at",
]


def start_import(connection, profile, now):
    """Begin the 12-month backfill: from MAIL_IMPORT_MONTHS ago up to now
    (anything newer arrives through history). The estimate is the whole
    mailbox's messagesTotal (decision 16). Does not save."""
    connection.import_before = now
    connection.import_after = now - timedelta(days=round(settings.MAIL_IMPORT_MONTHS * 365.25 / 12))
    connection.import_total_estimate = profile.get("messagesTotal")
    connection.import_page_token = ""
    connection.import_done_at = None


#: The watch is renewed once it lapses within this.
WATCH_RENEW_BEFORE = timedelta(hours=24)

REVOKED_MESSAGE = "Google access was revoked. Reconnect Google."
PERMISSION_MESSAGE = "Revenact is missing a Gmail permission. Reconnect Google."
RATE_LIMITED = "Gmail is rate-limiting this mailbox; retrying at {at} UTC"
UNAVAILABLE = "Gmail isn't answering; retrying at {at} UTC"


class Lost(Exception):
    """The tick's claim is gone: the row was disconnected or reconnected
    while it ran. Nothing more is written."""


#: `_claim` on a connection outside a tick: no lease to hold.
_UNCLAIMED = object()


def _claimed_rows(connection):
    """The connection's row while it is not disconnected and, inside a tick,
    still carries the tick's lease stamp."""
    rows = MailboxConnection.objects.filter(pk=connection.pk).exclude(
        status=MailboxConnection.Status.DISCONNECTED
    )
    claim = getattr(connection, "_claim", _UNCLAIMED)
    if claim is not _UNCLAIMED:
        rows = rows.filter(lease_until=claim)
    return rows


def ensure_claim(connection):
    """Before a Gmail write (the outbox flush): raises Lost when the claim is gone."""
    if not _claimed_rows(connection).exists():
        raise Lost


def keep_credentials(connection, session):
    """A token `session` refreshed outside a tick (an attachment fetch) is
    stored; nothing else on the row is written."""
    if session.creds.data != connection.get_credentials():
        connection.set_credentials(session.creds.data)
        _save(connection, ["credentials"])


def _save(connection, fields):
    """UPDATE `fields` from `connection` (never a full save), only on a row
    that is not disconnected and, inside a tick, still holds the tick's
    claim. Returns whether the row was written."""
    if "updated_at" in fields:
        connection.updated_at = timezone.now()
    rows = _claimed_rows(connection)
    return bool(rows.update(**{name: getattr(connection, name) for name in fields}))


def _write(connection, fields):
    """A tick's write on the way: raises Lost when the claim is gone."""
    if not _save(connection, fields):
        raise Lost


def _mark_drafts(connection):
    """This tick touched a Gmail draft: run the draft reconcile (D3 §5)."""
    connection._drafts_changed = True


@dataclass
class TickResult:
    #: ok, backoff, revoked or lost (services/mail/loop.py logs it).
    outcome: str = "ok"
    filed: int = 0


@dataclass
class Changes:
    """History folded so that the last event per message wins."""

    #: message id -> its labelIds, or None when the event left them out.
    labels: dict = field(default_factory=dict)
    deleted: set = field(default_factory=set)


def session_for(connection):
    return GmailSession(
        Credentials(
            address=connection.address,
            display_name=connection.display_name,
            data=connection.get_credentials(),
        )
    )


def import_query(after, before):
    return f"after:{int(after.timestamp())} before:{int(before.timestamp())} -in:chats"


def tick(connection, *, now=None):
    """One pass for one claimed Google mailbox. Bounded: history until done,
    at most one reconcile page and one import page. A failure never raises:
    it backs this mailbox off or pauses it, and the loop moves on."""
    now = now or timezone.now()
    result = TickResult()
    session = session_for(connection)
    # The stamp claim_due (or run_all) set; every write below requires it.
    connection._claim = connection.lease_until
    try:
        return _run(connection, session, result, now)
    except Lost:
        result.outcome = "lost"
        return result
    finally:
        del connection._claim
        connection.__dict__.pop("_drafts_changed", None)


def _run(connection, session, result, now):
    from . import draft_sync, outbox_flush, send_as

    try:
        # D2: the person's changes go to Gmail before Gmail's come back.
        outbox_flush.flush(connection, session, now)
        gmail_store.mirror_labels(connection, session.labels())
        if send_as.refresh(connection, session, now):
            _mark_drafts(connection)
        if connection.history_id is None:
            _initialise(connection, session, now)
        else:
            result.filed += _apply_history(connection, session, now)
        if connection.reconcile_started_at is not None:
            result.filed += _reconcile_page(connection, session, now)
        if connection.import_done_at is None and connection.import_after is not None:
            result.filed += _import_page(connection, session, now)
        if getattr(connection, "_drafts_changed", False):
            draft_sync.reconcile(connection, session, now)
        _renew_watch(connection, session, now)
    except ProviderError as exc:
        result.outcome = _failed(connection, session, exc, now)
        return result
    if not _succeeded(connection, session):
        result.outcome = "lost"
    return result


def _initialise(connection, session, now):
    """No history_id yet (a row from before D1): take Gmail's, and start the
    import unless it has started or finished."""
    profile = session.profile()
    connection.history_id = int(profile["historyId"])
    fields = ["history_id"]
    if connection.import_after is None and connection.import_done_at is None:
        start_import(connection, profile, now)
        fields += IMPORT_FIELDS
    _write(connection, fields)


def _read_history(connection, session):
    """Every page since history_id, folded. Returns (changes, newest historyId)."""
    changes, page, newest = Changes(), "", connection.history_id
    while True:
        body = session.history(connection.history_id, page)
        for record in body.get("history", []):
            for key in ("messagesAdded", "labelsAdded", "labelsRemoved"):
                for item in record.get(key, []):
                    message = item.get("message") or {}
                    if message.get("id"):
                        changes.deleted.discard(message["id"])
                        changes.labels[message["id"]] = message.get("labelIds")
            for item in record.get("messagesDeleted", []):
                message_id = (item.get("message") or {}).get("id")
                if message_id:
                    changes.labels.pop(message_id, None)
                    changes.deleted.add(message_id)
        newest = int(body.get("historyId") or newest)
        page = body.get("nextPageToken", "")
        if not page:
            return changes, newest


def _apply_history(connection, session, now):
    try:
        changes, newest = _read_history(connection, session)
    except ProviderError as exc:
        if exc.status != 404:
            raise
        _start_recovery(connection, session, now)
        return 0
    if changes.deleted and (
        MailMessage.objects.filter(
            connection=connection,
            provider_message_id__in=changes.deleted,
            label_ids__contains=["DRAFT"],
        ).exists()
        or MailDraft.objects.filter(
            connection=connection, gmail_message_id__in=changes.deleted
        ).exists()
    ):
        _mark_drafts(connection)
    if any("DRAFT" in (label_ids or []) for label_ids in changes.labels.values()):
        _mark_drafts(connection)
    if changes.deleted:
        # The personal copy goes; a filed Email is the company's and stays. A
        # live draft's row stays (D3 decision 8, plan gap 8): the reconcile
        # moves it onto Gmail's new message or deletes it with the draft, and
        # a Revenact edit's flush moves it onto its answer (final review 1).
        MailMessage.objects.filter(
            connection=connection, provider_message_id__in=changes.deleted
        ).exclude(draft__status__in=MailDraft.LIVE).delete()
    held = {
        row.provider_message_id: row
        for row in MailMessage.objects.filter(
            connection=connection, provider_message_id__in=list(changes.labels)
        )
    }
    holds = gmail_store.held_keys([row.pk for row in held.values()])
    unknown = []
    for message_id, label_ids in changes.labels.items():
        row = held.get(message_id)
        if row is None:
            unknown.append(message_id)
            continue
        if "DRAFT" in (row.label_ids or []):
            _mark_drafts(connection)
        if label_ids is None:
            minimal = session.get_message(message_id, "minimal")
            if minimal is None:
                continue
            label_ids = minimal.get("labelIds", [])
        gmail_store.relabel(connection, row, label_ids, now, held=holds.get(row.pk, set()))
    filed = _fetch_and_store(connection, session, unknown, now)
    connection.history_id = newest
    _write(connection, ["history_id"])
    # New mail is classified at once, as before D1.
    _classify(connection, filed, now=now, recent_only=False)
    return len(filed)


def _start_recovery(connection, session, now):
    """Gmail no longer has history that old (about a week). The fresh
    history_id comes first, so nothing changed during the re-list is lost;
    then the last MAIL_RECONCILE_DAYS are re-listed, a page per tick."""
    profile = session.profile()
    connection.history_id = int(profile["historyId"])
    connection.reconcile_started_at = now
    connection.reconcile_page_token = ""
    _write(connection, ["history_id", "reconcile_started_at", "reconcile_page_token"])


def _reconcile_page(connection, session, now):
    """One page of the 30-day re-list: unknown ids stored whole, known ones'
    labels refreshed. The window is anchored on reconcile_started_at, so
    every page asks the identical query. On the last page, rows in the
    window that were neither seen nor made since the reconcile began are
    gone from Gmail, and deleted here (a filed Email stays, and so do a
    draft's placeholder and a live draft's row: the draft reconcile settles
    those)."""
    started = connection.reconcile_started_at
    since = started - timedelta(days=settings.MAIL_RECONCILE_DAYS)
    page = _list_page(
        connection, session, f"after:{int(since.timestamp())} -in:chats", "reconcile_page_token"
    )
    if page is None:
        return 0
    ids, token = page
    held = {
        row.provider_message_id: row
        for row in MailMessage.objects.filter(connection=connection, provider_message_id__in=ids)
    }
    holds = gmail_store.held_keys([row.pk for row in held.values()])
    for message_id, row in held.items():
        minimal = session.get_message(message_id, "minimal")
        if minimal is not None:
            gmail_store.relabel(
                connection, row, minimal.get("labelIds", []), now, held=holds.get(row.pk, set())
            )
    filed = _fetch_and_store(connection, session, [i for i in ids if i not in held], now)
    if token:
        connection.reconcile_page_token = token[:512]
    else:
        MailMessage.objects.filter(
            connection=connection, sent_at__gte=since, synced_at__lt=started
        ).filter(Q(refreshed_at__isnull=True) | Q(refreshed_at__lt=started)).exclude(
            provider_message_id__startswith=PENDING_DRAFT_PREFIX
        ).exclude(draft__status__in=MailDraft.LIVE).delete()
        connection.reconcile_started_at = None
        connection.reconcile_page_token = ""
    _write(connection, ["reconcile_started_at", "reconcile_page_token"])
    _classify(connection, filed, now=now, recent_only=True)
    return len(filed)


def _list_page(connection, session, query, token_field):
    """One page of a message list (the import's or the reconcile's), from the
    page token in `token_field`. Returns (ids, next page token), or None when
    Gmail refused an expired token: it is cleared, and the next tick starts
    from the first page."""
    try:
        body = session.list_messages(
            query, getattr(connection, token_field), settings.MAIL_IMPORT_PAGE_SIZE
        )
    except ProviderError as exc:
        if exc.status == 400 and getattr(connection, token_field):
            setattr(connection, token_field, "")
            _write(connection, [token_field])
            return None
        raise
    ids = [stub["id"] for stub in body.get("messages", []) if stub.get("id")]
    return ids, body.get("nextPageToken", "")


def _fetch_and_store(connection, session, ids, now):
    """Fetch each id in full and store it; one Gmail no longer has is
    skipped, and so is a live draft's own message (draft_sync.own_messages).
    Returns the Emails this filed."""
    from . import draft_sync

    own = draft_sync.own_messages(connection, ids, now)
    filed = []
    for message_id in ids:
        if message_id in own:
            continue
        full = session.get_message(message_id)
        if full is None:
            continue
        if "DRAFT" in (full.get("labelIds") or []):
            _mark_drafts(connection)
        _, email = gmail_store.store_gmail(connection, full, now=now)
        if email is not None:
            filed.append(email)
    return filed


def _import_page(connection, session, now):
    """One page of the 12-month backfill. Ids already held cost nothing
    (decision 29); an expired page token restarts from the first page."""
    query = import_query(connection.import_after, connection.import_before)
    page = _list_page(connection, session, query, "import_page_token")
    if page is None:
        return 0
    ids, token = page
    filed = _fetch_and_store(connection, session, _not_held(connection, ids), now)
    connection.import_page_token = token[:512]
    fields = ["import_page_token"]
    if not token:
        connection.import_done_at = now
        fields.append("import_done_at")
        _mark_drafts(connection)  # the first tick after the import maps Gmail's drafts
    _write(connection, fields)
    _classify(connection, filed, now=now, recent_only=True)
    return len(filed)


def _not_held(connection, ids):
    held = set(
        MailMessage.objects.filter(connection=connection, provider_message_id__in=ids).values_list(
            "provider_message_id", flat=True
        )
    )
    return [message_id for message_id in ids if message_id not in held]


def _classify(connection, emails, *, now, recent_only):
    """Sentiment now for filed mail the pulse will count. Imported mail older
    than CLASSIFY_WINDOW waits for the nightly, capped, oldest-first
    classify_interactions pass (decision 17)."""
    if recent_only:
        emails = [e for e in emails if e.sent_at >= now - gmail_store.CLASSIFY_WINDOW]
    if emails:
        from services.customers.classification import classify_records

        classify_records(emails, organisation=connection.organisation, user=connection.user)


def _renew_watch(connection, session, now):
    """Point Gmail's push at the topic when it lapses within a day. A failure
    is logged without content and retried next tick; never a mailbox error."""
    topic = settings.GMAIL_PUBSUB_TOPIC
    if not topic:
        return
    if connection.watch_expires_at and connection.watch_expires_at > now + WATCH_RENEW_BEFORE:
        return
    try:
        body = session.watch(topic)
    except ProviderError as exc:
        logger.warning("gmail watch failed for connection %s: %s", connection.pk, exc.status)
        return
    expiration = body.get("expiration")
    connection.watch_expires_at = (
        datetime.fromtimestamp(int(expiration) / 1000, tz=UTC) if expiration else None
    )
    _write(connection, ["watch_expires_at"])


def _succeeded(connection, session):
    connection.set_credentials(session.creds.data)
    connection.last_synced_at = timezone.now()
    connection.consecutive_failures = 0
    connection.error = ""
    connection.backoff_until = None
    connection.lease_until = None
    return _save(
        connection,
        [
            "credentials",
            "last_synced_at",
            "consecutive_failures",
            "error",
            "backoff_until",
            "lease_until",
            "updated_at",
        ],
    )


def classify_failure(exc):
    """Decision 20: a lost grant, a missing permission, or something to wait out."""
    if exc.reason in LOST_GRANT or exc.status == 401:
        return "revoked"
    if exc.status == 403 and exc.reason == "insufficientPermissions":
        return "permission"
    # 429, 5xx, no answer, a 403 rate limit, and any other refusal.
    return "backoff"


def backoff_seconds(failures, retry_after=None):
    """min(30 s × 2^(n−1), MAIL_BACKOFF_MAX_SECONDS), or Retry-After if longer."""
    delay = min(30 * 2 ** (min(failures, 20) - 1), settings.MAIL_BACKOFF_MAX_SECONDS)
    return max(delay, retry_after or 0)


def pause_revoked(connection, exc):
    """A lost grant or a missing Gmail permission (classify_failure is not
    "backoff"): status error, paused token_revoked with its fixed sentence,
    audited, until the person reconnects. Used by the tick and by the send
    paths, so a refused send never leaves the provider's words in `error`.
    A row disconnected meanwhile (or, in a tick, reconnected) is left as it
    is and nothing is audited; returns whether the pause happened."""
    kind = classify_failure(exc)
    connection.status = MailboxConnection.Status.ERROR
    connection.error = PERMISSION_MESSAGE if kind == "permission" else REVOKED_MESSAGE
    connection.paused_reason = MailboxConnection.PausedReason.TOKEN_REVOKED
    connection.lease_until = None
    if not _save(connection, ["status", "error", "paused_reason", "lease_until", "updated_at"]):
        return False
    audit.record(  # SOC2:LOG-01 sync and sending stop until the person reconnects
        "mailbox.paused",
        organisation=connection.organisation,
        target=connection,
        metadata={"reason": MailboxConnection.PausedReason.TOKEN_REVOKED},
    )
    logger.warning("gmail connection %s paused: %s %s", connection.pk, exc.status, exc.reason)
    return True


def _failed(connection, session, exc, now):
    """Record what went wrong without a word of mail content. Returns the
    outcome: revoked (status error, paused until a reconnect), backoff
    (still connected, due again after the delay), or lost (the claim went
    meanwhile, and nothing was written)."""
    if classify_failure(exc) != "backoff":
        return "revoked" if pause_revoked(connection, exc) else "lost"
    connection.consecutive_failures += 1
    delay = backoff_seconds(connection.consecutive_failures, exc.retry_after)
    connection.backoff_until = now + timedelta(seconds=delay)
    limited = exc.status in (403, 429)
    connection.error = (RATE_LIMITED if limited else UNAVAILABLE).format(
        at=connection.backoff_until.strftime("%H:%M")
    )
    connection.lease_until = None
    # A token refreshed before the failure is still worth keeping.
    connection.set_credentials(session.creds.data)
    if not _save(
        connection,
        [
            "consecutive_failures",
            "backoff_until",
            "error",
            "lease_until",
            "credentials",
            "updated_at",
        ],
    ):
        return "lost"
    logger.warning(
        "gmail connection %s backing off %ss: %s %s", connection.pk, delay, exc.status, exc.reason
    )
    return "backoff"
