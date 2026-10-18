"""A Slack connection's channels (Slack escalations D3, contract SC3-2 to
SC3-6, SC3-12, SC3-26). Each pass lists the workspace's public channels
(new ones become rows: included, unless Slack Connect), joins up to
MAX_JOINS the bot isn't in yet (only with channels:join), and, at most once
a minute, the catch-up picks one channel to read. Threads that events could
not file wait in a row's `missed` list. Names and ids only: no message text."""

import logging
from datetime import timedelta

from django.db import transaction

from .models import SlackChannel
from .providers.base import ProviderError

logger = logging.getLogger(__name__)

MAX_JOINS = 5
RATE_GAP = timedelta(seconds=60)
OVERLAP = timedelta(minutes=2)
#: F1 (owner): a channel whose read Slack refused is tried again this long after.
READ_RETRY = timedelta(minutes=15)
JOIN_SCOPE = "channels:join"
#: SC3-3: somebody removed the bot; it is not joined again until an admin says so.
REMOVED = "removed"
#: What a pass writes back. Never `included`: that is an admin's (SC3-15), or
#: SC3-4's conditional update, so a change made during the listing is kept (F5).
_FIELDS = (
    "name",
    "external_shared",
    "is_member",
    "is_archived",
    "join_error",
    "updated_at",
)


def can_join(connector):
    return JOIN_SCOPE in (connector.granted_scopes or [])


def rate_limited(exc):
    return exc.code == "ratelimited" or exc.status == 429


def refresh(connector, provider, creds, *, now):
    """SC3-3, SC3-4: the connection's rows (not archived) after this pass's
    listing. A failed listing keeps the rows as they are; a revoked token raises."""
    rows = {row.channel_id: row for row in SlackChannel.objects.filter(connector=connector)}
    try:
        listed = provider.list_channels(creds)
    except ProviderError as exc:
        if exc.reauth:
            raise
        logger.warning("slack channel list skipped: %s", type(exc).__name__)
        return [row for row in rows.values() if not row.is_archived]
    new, changed, seen, excluding = [], [], set(), []
    for found in listed:
        if not found["id"]:
            continue
        seen.add(found["id"])
        row = rows.get(found["id"])
        if row is None:
            new.append(
                SlackChannel(
                    connector=connector,
                    channel_id=found["id"][:32],
                    name=found["name"],
                    external_shared=found["shared"],
                    is_member=found["member"],
                    # SC3-12: Slack Connect starts excluded
                    included=not found["shared"],
                )
            )
            continue
        before = [getattr(row, field) for field in _FIELDS[:-1]]
        became_shared = found["shared"] and not row.external_shared
        if row.is_member and not found["member"] and not row.is_archived:
            row.join_error = REMOVED  # SC3-3: somebody took the bot out
        elif found["member"] and row.join_error == REMOVED:
            row.join_error = ""  # somebody added the bot back: nothing to join
        row.name, row.external_shared = found["name"], found["shared"]
        row.is_member, row.is_archived = found["member"], False
        if became_shared and row.chosen_at is None:
            # SC3-4: a channel nobody chose that turns shared stops syncing
            excluding.append(row.pk)
        if [getattr(row, field) for field in _FIELDS[:-1]] != before:
            row.updated_at = now
            changed.append(row)
    for row in rows.values():
        # a private channel is never listed: it stays as the migration made it
        if row.channel_id not in seen and not row.is_private and not row.is_archived:
            row.is_archived, row.updated_at = True, now
            changed.append(row)
    # F6: an event may have made a new channel's row meanwhile (SC3-22)
    SlackChannel.objects.bulk_create(new, ignore_conflicts=True)
    if changed:
        SlackChannel.objects.bulk_update(changed, list(_FIELDS))
    if excluding:
        # SC3-4, F5: unless an admin chose the channel meanwhile
        SlackChannel.objects.filter(pk__in=excluding, chosen_at__isnull=True).update(
            included=False, updated_at=now
        )
    if new or excluding:
        # the rows as stored: new ones with their pks (join_missing needs them)
        return list(SlackChannel.objects.filter(connector=connector, is_archived=False))
    return [row for row in rows.values() if not row.is_archived]


def join_missing(connector, provider, creds, rows, *, timeout=30):
    """SC3-5: join up to MAX_JOINS included public channels the bot isn't in;
    how many it joined."""
    if not can_join(connector):
        return 0
    wanted = [
        row
        for row in rows
        if row.included
        and not row.is_member
        and not row.is_private
        and not row.is_archived
        and not row.join_error
        and (not row.external_shared or row.chosen_at is not None)
    ]
    wanted.sort(key=lambda row: row.pk)
    joined = 0
    for row in wanted[:MAX_JOINS]:
        try:
            provider.join_channel(creds, row.channel_id, timeout=timeout)
        except ProviderError as exc:
            if exc.reauth:
                raise
            if rate_limited(exc):
                break
            row.join_error = (exc.code or "refused")[:64]
            row.save(update_fields=["join_error", "updated_at"])
            continue
        row.is_member, row.join_error = True, ""
        row.save(update_fields=["is_member", "join_error", "updated_at"])
        joined += 1
    return joined


def history_due(connector, now):
    """SC3-6: no catch-up call on this connection in the last minute."""
    return not SlackChannel.objects.filter(
        connector=connector, asked_at__gt=now - RATE_GAP
    ).exists()


def _ready(row):
    return row.included and row.is_member and not row.is_archived


def _resting(row, now):
    """A row whose read Slack refused less than READ_RETRY ago."""
    return bool(row.read_error) and row.asked_at is not None and row.asked_at > now - READ_RETRY


def pick(rows, now):
    """SC3-6: the channel the catch-up reads: a walk in progress, then never
    caught up (oldest row first), then the longest since `read_at`; a row
    whose last read Slack refused comes after every other for READ_RETRY
    after that try, then ranks as any other (F1)."""
    ready = [row for row in rows if _ready(row)]
    if not ready:
        return None
    return min(
        ready,
        key=lambda row: (
            _resting(row, now),
            not row.walk_before,
            row.read_at is not None,
            row.read_at.timestamp() if row.read_at else 0,
            row.pk,
        ),
    )


def remember_missed(row, ts):
    """SC3-26: a thread an event could not file, read by a later catch-up."""
    if not ts:
        return
    with transaction.atomic():
        locked = SlackChannel.objects.select_for_update().get(pk=row.pk)
        if ts in locked.missed:
            return
        locked.missed = [*locked.missed, str(ts)[:32]][-SlackChannel.MAX_MISSED :]
        locked.save(update_fields=["missed", "updated_at"])
    row.missed = locked.missed


def forget_missed(row, ts):
    with transaction.atomic():
        locked = SlackChannel.objects.select_for_update().get(pk=row.pk)
        locked.missed = [one for one in locked.missed if one != ts]
        locked.save(update_fields=["missed", "updated_at"])
    row.missed = locked.missed


def next_missed(rows):
    """SC3-6 step 2: the oldest missed thread of a ready row (rows by pk)."""
    for row in sorted(rows, key=lambda row: row.pk):
        if _ready(row) and row.missed:
            return row, row.missed[0]
    return None
