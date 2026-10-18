"""Sync each connection's primary calendar (design §Defaults).

Runs on the per-minute `mail` tick (core.ticks): every connection whose
Google grant holds calendar.events, that is live and unpaused, at most every
CALENDAR_SYNC_INTERVAL_SECONDS. The first pass reads 30 days back to 90 ahead
and keeps Google's nextSyncToken; later passes send only that token. A 410
means the token expired: the local copy is dropped and the window read again.
"""

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from services.mail import scopes
from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError
from services.mail.sync import _credentials, _store, match_parent

from .google import CalendarSession
from .models import CalendarSyncState, Meeting

logger = logging.getLogger(__name__)

BACK = timedelta(days=30)
AHEAD = timedelta(days=90)


def _interval():
    return timedelta(seconds=getattr(settings, "CALENDAR_SYNC_INTERVAL_SECONDS", 300))


def due(*, now=None):
    """Connections whose calendar should sync now."""
    now = now or timezone.now()
    rows = (
        MailboxConnection.objects.filter(
            provider=MailboxConnection.Provider.GOOGLE,
            granted_scopes__contains=[scopes.CALENDAR_EVENTS],
            paused_reason="",
        )
        .exclude(status=MailboxConnection.Status.DISCONNECTED)
        .filter(
            Q(calendar_state__isnull=True)
            | Q(calendar_state__synced_at__isnull=True)
            | Q(calendar_state__synced_at__lte=now - _interval())
        )
        .select_related("user", "organisation")
        .order_by("pk")
    )
    return rows


def sync_due(*, now=None):
    """Sync every due calendar. Returns how many synced cleanly."""
    now = now or timezone.now()
    return sum(1 for connection in list(due(now=now)) if sync_connection(connection, now=now))


def sync_connection(connection, *, now=None):
    """One pass. True on success; a failure is kept on the state, not raised."""
    now = now or timezone.now()
    state, _ = CalendarSyncState.objects.get_or_create(connection=connection)
    session = CalendarSession(_credentials(connection))
    try:
        try:
            token = _pass(connection, session, state.sync_token, now)
        except ProviderError as exc:
            if exc.status != 410 or not state.sync_token:
                raise
            Meeting.objects.filter(connection=connection).delete()
            token = _pass(connection, session, "", now)
    except ProviderError as exc:
        logger.warning("calendar sync failed for connection %s: %s", connection.pk, exc)
        state.error = str(exc)[:255]
        state.save(update_fields=["error", "updated_at"])
        return False
    finally:
        _store(connection, session.creds)
        connection.save(update_fields=["credentials", "address"])
    state.sync_token, state.synced_at, state.error = token, now, ""
    state.save(update_fields=["sync_token", "synced_at", "error", "updated_at"])
    return True


def _pass(connection, session, sync_token, now):
    """Read every page; apply each event. Returns the next sync token."""
    if sync_token:
        params = {"syncToken": sync_token}
    else:
        params = {
            "timeMin": (now - BACK).isoformat(),
            "timeMax": (now + AHEAD).isoformat(),
            "singleEvents": "true",
            "maxResults": "250",
        }
    while True:
        page = session.events(**params)
        with transaction.atomic():
            for item in page.get("items", []):
                apply_event(connection, item)
        if page.get("nextPageToken"):
            params = {**params, "pageToken": page["nextPageToken"]}
            continue
        return page.get("nextSyncToken", "")


def _when(value):
    """(aware datetime, all_day) from Google's {dateTime} or {date}."""
    value = value or {}
    if value.get("dateTime"):
        return parse_datetime(value["dateTime"]), False
    day = parse_date(value.get("date", ""))
    if day is None:
        return None, False
    return timezone.make_aware(datetime.combine(day, datetime.min.time())), True


def apply_event(connection, item):
    """Store, update or remove one event from Google's events.list."""
    event_id = item.get("id", "")
    if not event_id:
        return
    if item.get("status") == "cancelled":
        Meeting.objects.filter(connection=connection, google_event_id=event_id).delete()
        return
    starts_at, all_day = _when(item.get("start"))
    ends_at, _ = _when(item.get("end"))
    if starts_at is None:
        return
    own = connection.address.lower()
    attendees = [
        {
            "email": (a.get("email") or "").lower(),
            "name": a.get("displayName", ""),
            "response": a.get("responseStatus", ""),
            "organizer": bool(a.get("organizer")),
            "self": bool(a.get("self")) or (a.get("email") or "").lower() == own,
        }
        for a in item.get("attendees", [])
        if a.get("email")
    ]
    external = [a["email"] for a in attendees if not a["self"]]
    customer, account = match_parent(connection.organisation, external)
    Meeting.objects.update_or_create(
        connection=connection,
        google_event_id=event_id,
        defaults={
            "organisation": connection.organisation,
            "owner": connection.user,
            "ical_uid": item.get("iCalUID", "")[:1024],
            "etag": item.get("etag", "")[:128],
            "title": (item.get("summary") or "")[:255],
            "description": (item.get("description") or "")[:5000],
            "location": (item.get("location") or "")[:255],
            "starts_at": starts_at,
            "ends_at": ends_at or starts_at,
            "all_day": all_day,
            "status": item.get("status") if item.get("status") == "tentative" else "confirmed",
            "organizer_email": ((item.get("organizer") or {}).get("email") or "")[:254],
            "attendees": attendees,
            "meet_url": _meet_url(item)[:512],
            "html_link": (item.get("htmlLink") or "")[:1024],
            "customer": customer,
            "account": account,
        },
    )


def _meet_url(item):
    if item.get("hangoutLink"):
        return item["hangoutLink"]
    for point in (item.get("conferenceData") or {}).get("entryPoints", []):
        if point.get("entryPointType") == "video" and point.get("uri"):
            return point["uri"]
    return ""
