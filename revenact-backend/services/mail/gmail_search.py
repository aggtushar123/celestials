"""Search older mail in Gmail (D3 contract §6, decision 28).

The person's own query runs live in their Gmail (messages.list, spam and
trash left out, chats excluded), MAIL_GMAIL_SEARCH_PAGE_SIZE a page with one
format=metadata read each: about 105 of Gmail's 250 quota units a second.
Nothing is stored: a result Revenact already holds names its stored copy.
Opening a result stores only that message, filed as the sync files it
(older than 30 days: classified by the nightly pass). A read-only Google
mailbox may search. The stored pause is read (the minute sweep keeps it,
plan gap 15). The query is never logged or audited.
"""

import logging
from datetime import UTC, datetime

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from services.customers.drafts import stamp

from . import draft_sync, gates, gmail_store, gmail_sync
from .actions import GMAIL_ONLY, NO_MAILBOX, error, gmail_busy
from .models import MailboxConnection, MailDraft, MailMessage
from .providers.base import ProviderError, parse_address, parse_address_list
from .providers.google import _header

logger = logging.getLogger(__name__)
HEADERS = ("From", "To", "Subject", "Date")
GMAIL_REFUSED = "Gmail couldn't run that search."
NOT_IN_GMAIL = "This message is no longer in Gmail."


def mailbox(user):
    """The caller's Google mailbox, or the refusal: 400 GMAIL_ONLY, 409
    NO_MAILBOX, 409 MAILBOX_PAUSED, 503 GMAIL_BUSY (its backoff)."""
    # SOC2:AUTH-02 only the caller's own mailbox is searched
    connection = MailboxConnection.objects.filter(user=user).first()
    if connection is not None and not connection.is_google:
        return None, error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
    if connection is None or connection.status == MailboxConnection.Status.DISCONNECTED:
        return None, error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    if connection.paused_reason:
        return None, _paused(connection.paused_reason)
    now = timezone.now()
    if connection.backoff_until and connection.backoff_until > now:
        return None, gmail_busy((connection.backoff_until - now).total_seconds())
    return connection, None


def _paused(reason):
    return Response(
        {
            "code": "MAILBOX_PAUSED",
            "detail": gates.PAUSED_MESSAGES[reason],
            "paused_reason": reason,
        },
        status=status.HTTP_409_CONFLICT,
    )


def _refused(connection, exc, *, bad_request):
    """Gmail's answer as §6 says: 400 (`bad_request`), a lost grant pauses
    the mailbox (409 MAILBOX_PAUSED), anything else is 503 GMAIL_BUSY with
    the mailbox's backoff unchanged. Logged without the query."""
    logger.warning(
        "gmail search failed for connection %s: %s %s", connection.pk, exc.status, exc.reason
    )
    if exc.status == 400:
        return bad_request
    if gmail_sync.classify_failure(exc) != "backoff":
        gmail_sync.pause_revoked(connection, exc)
        return _paused(MailboxConnection.PausedReason.TOKEN_REVOKED)
    return gmail_busy(exc.retry_after or 60)


def _has_file(part):
    if part.get("filename"):
        return True
    return any(_has_file(child) for child in part.get("parts") or [])


def _result(meta, held):
    payload = meta.get("payload") or {}
    name, address = parse_address(_header(payload, "From"))
    sent_at = datetime.fromtimestamp(int(meta.get("internalDate") or 0) / 1000, tz=UTC)
    return {
        "gmail_id": meta["id"],
        "thread_id": meta.get("threadId", ""),
        "subject": _header(payload, "Subject") or "(no subject)",
        "from": {"name": name, "address": address},
        "to": [[n, a] for n, a in parse_address_list(_header(payload, "To"))],
        "snippet": meta.get("snippet", ""),
        "sent_at": stamp(sent_at),
        "has_attachments": _has_file(payload),
        "message_id": held.get(meta["id"]),
    }


def search(connection, q, page_token):
    """One page of the person's query, live (§6). Nothing is stored."""
    session = gmail_sync.session_for(connection)
    bad = Response({"q": [GMAIL_REFUSED]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        body = session.search(f"({q}) -in:chats", page_token, settings.MAIL_GMAIL_SEARCH_PAGE_SIZE)
        metas = [
            session.metadata(stub["id"], HEADERS)
            for stub in body.get("messages") or []
            if stub.get("id")
        ]
    except ProviderError as exc:
        return _refused(connection, exc, bad_request=bad)
    finally:
        gmail_sync.keep_credentials(connection, session)
    metas = [meta for meta in metas if meta]
    # SOC2:AUTH-02 held only within the caller's own mailbox
    held = dict(
        MailMessage.objects.filter(
            connection=connection, provider_message_id__in=[meta["id"] for meta in metas]
        ).values_list("provider_message_id", "pk")
    )
    return Response(
        {
            "results": [_result(meta, held) for meta in metas],
            "next_page_token": body.get("nextPageToken") or None,
            "result_size_estimate": body.get("resultSizeEstimate", 0),
        }
    )


def _existing(row):
    row.stored_now = False
    return row


def open_message(connection, gmail_id):
    """§6 "open" for an id the caller's mailbox does not hold: stored (and
    filed) as the sync stores it. (row, None) or (None, the refusal)."""
    gone = error("NOT_IN_GMAIL", NOT_IN_GMAIL, status.HTTP_404_NOT_FOUND)
    session = gmail_sync.session_for(connection)
    try:
        full = session.get_message(gmail_id, "full")
    except ProviderError as exc:
        return None, _refused(connection, exc, bad_request=gone)
    finally:
        gmail_sync.keep_credentials(connection, session)
    if full is None:
        return None, gone
    now = timezone.now()
    # SOC2:AUTH-02 a live draft's own Gmail message is its Drafts row, never a second one
    if draft_sync.own_messages(connection, {gmail_id}, now):
        draft = MailDraft.objects.filter(
            connection=connection, status__in=MailDraft.LIVE, gmail_message_id=gmail_id
        ).exclude(message=None)
        return _existing(draft.first().message), None
    try:
        with transaction.atomic():
            row, filed = gmail_store.store_gmail(connection, full, now=now)
    except IntegrityError:
        # A sync tick or a second open stored it meanwhile: answer that copy.
        held = MailMessage.objects.filter(
            connection=connection, provider_message_id=gmail_id
        ).first()
        if held is None:
            raise
        return _existing(held), None
    if row is None:  # a chat
        return None, gone
    if filed is not None:
        gmail_sync._classify(connection, [filed], now=now, recent_only=True)
    row.stored_now = True
    return row, None
