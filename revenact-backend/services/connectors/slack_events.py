"""Slack's Events API (Slack escalations D3, contract §3.3, SC3-7, SC3-22 to
SC3-30). Slack pushes each message of the channels the bot is in; we file it
before we answer, through the same message rules and the same filing as the
catch-up. The agent is not run here: filing touches its thread, and the
`agents` tick runs it (SC3-23: no task queue, and Cloud Run gives a request
CPU only until it answers). The envelope is data, never instructions.
Nothing here logs message text, a channel name or a Slack user id."""

import functools
import logging
from time import monotonic

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import SlackConversation

from . import naming, slack_channels, sync, unmatched
from .models import SlackChannel, UnmatchedItem
from .providers import get_provider
from .providers.base import ProviderError
from .providers.slack import (
    EVENT_TIMEOUT,
    REPLY_SUBTYPES,
    TEXT_CHARS,
    is_ours,
    is_top,
    mentions,
)
from .slack_interactivity import _team_connectors

logger = logging.getLogger(__name__)

FILED = "filed"
UNCHANGED = "unchanged"
WAITING = "waiting"
MISSED = "missed"
IGNORED = "ignored"
EXCLUDED = "excluded"
EDITED = "edited"
#: an event kind, not sync.DELETED (the sentence a deleted top reads as)
REMOVED_EVENT = "deleted"
LISTED = "listed"
JOINED = "joined"
#: SE4-24 within SC3-23's time budget: mentioned people one event may look up
EVENT_LOOKUPS = 3
#: SC3-23: seconds after the event's handling began past which no one more is
#: asked about, and by which every lookup has its answer (Slack waits 3 seconds)
EVENT_ASK_UNTIL = 1.5
EVENT_SPEND = 2.5


def _dict(value):
    return value if isinstance(value, dict) else {}


def _event_people(provider, creds, texts, people, *, started, known=()):
    """D4's people for one event (SE4-24): `people` (the poster or replier,
    already looked up) plus at most EVENT_LOOKUPS mentioned people not seen
    before (nor in `known`). SC3-23: none is asked about once EVENT_ASK_UNTIL
    seconds have passed since `started` (the poster's lookup counts), and
    each lookup's timeout ends by EVENT_SPEND. The rest wait for the catch-up."""
    asked = 0
    for user_id in dict.fromkeys(uid for text in texts for uid in mentions(text)):
        if user_id in people or user_id in known:
            continue
        spent = monotonic() - started
        if asked >= EVENT_LOOKUPS or spent >= EVENT_ASK_UNTIL:
            break
        provider._person(creds, user_id, people, timeout=min(EVENT_TIMEOUT, EVENT_SPEND - spent))
        asked += 1
    return people


def handle(envelope, *, now=None):
    """One event_callback: an outcome per Slack connection of its team."""
    now = now or timezone.now()
    started = monotonic()  # SC3-23: one time budget for the event, all connections
    event = _dict(envelope.get("event"))
    kind = event.get("type")
    if kind not in ("message", "channel_created"):
        return []
    outcomes = []
    for connector in _team_connectors(str(envelope.get("team_id") or "")):
        # F7: one connection's failure never drops the event for the team's others
        try:
            if kind == "channel_created":
                outcomes.append(_channel_created(connector, event, now))
            else:
                outcomes.append(_message(connector, event, envelope, now, started))
        except Exception as exc:  # noqa: BLE001 - only the type is logged
            logger.warning("slack event skipped for a connection: %s", type(exc).__name__)
            outcomes.append(MISSED)
    return outcomes


def _row(connector, event, envelope, now):
    """The included row the event belongs to, or None (SC3-22, SC3-24)."""
    channel = str(event.get("channel") or "")[:32]
    kind = event.get("channel_type")
    if not channel or kind not in ("channel", "group"):
        return None
    row = SlackChannel.objects.filter(connector=connector, channel_id=channel).first()
    if row is None:
        if kind != "channel":
            return None  # SC3-2: a private channel syncs only when the migration made its row
        shared = bool(envelope.get("is_ext_shared_channel"))
        row, _ = SlackChannel.objects.get_or_create(
            connector=connector,
            channel_id=channel,
            # SC3-12: Slack Connect starts excluded
            defaults={"is_member": True, "external_shared": shared, "included": not shared},
        )
    if not row.included or row.is_archived:
        return None
    # SC3-30: events arrive; Slack only sends them for channels the bot is in
    SlackChannel.objects.filter(pk=row.pk).update(event_at=now, is_member=True)
    row.event_at, row.is_member = now, True
    return row


def _thread_ts(event):
    inner = _dict(event.get("message")) or _dict(event.get("previous_message")) or event
    return str(inner.get("thread_ts") or inner.get("ts") or event.get("deleted_ts") or "")


def _message(connector, event, envelope, now, started):
    row = _row(connector, event, envelope, now)
    if row is None:
        return EXCLUDED
    subtype = event.get("subtype") or ""
    try:
        if subtype == "message_changed":
            return _edited(connector, row, event, started)
        if subtype == "message_deleted":
            return _deleted(connector, row, event)
        return _posted(connector, row, event, envelope, now, started)
    except Exception as exc:  # noqa: BLE001 - Slack gets its 200; the catch-up reads it (SC3-26)
        logger.warning("slack event not filed: %s", type(exc).__name__)
        slack_channels.remember_missed(row, _thread_ts(event))
        return MISSED


def _posted(connector, row, event, envelope, now, started):
    """SC3-24: a new top message, or a reply to a stored thread."""
    config = connector.config or {}
    app = str(envelope.get("api_app_id") or "")
    ts = str(event.get("ts") or "")
    thread = str(event.get("thread_ts") or "")
    provider = get_provider(connector.provider)
    creds = connector.get_credentials()
    if not thread or thread == ts:
        if not is_top(event) or is_ours(event, config, app):
            return IGNORED
        lookups = {}
        remote = provider.thread_of(
            creds, config, row.channel_id, event, people=lookups, timeout=EVENT_TIMEOUT
        )
        # SE4-24: the poster and the people the message mentions
        remote.people = _event_people(provider, creds, [remote.text], lookups, started=started)
        names = naming.covered_names(connector)
        linked = functools.cache(lambda: sync.linked_members(connector))
        try:
            with transaction.atomic():
                outcome, _ = sync.file_conversation(
                    connector, remote, names, now=now, channel=row, linked=linked
                )
        except IntegrityError:
            return UNCHANGED  # SC3-7: a delivery of the same event filed it a moment ago
        return {"created": FILED, "updated": FILED, "unmatched": WAITING}.get(outcome, UNCHANGED)
    stored = SlackConversation.objects.filter(
        connector=connector, channel=row.channel_id, thread_ts=thread
    ).first()
    if stored is None:
        key = unmatched.slack_key(row.channel_id, thread)
        if UnmatchedItem.objects.filter(connector=connector, external_id=key).exists():
            return WAITING  # the catch-up re-reads its top message
        # F2, refining SC3-26: only a person's reply queues the thread; what the
        # catch-up would not keep never costs it a replies call
        subtype = event.get("subtype") or ""
        if (
            subtype not in REPLY_SUBTYPES
            or not event.get("text")
            or event.get("bot_id")
            or subtype == "bot_message"
            or is_ours(event, config, app)
        ):
            return IGNORED
        slack_channels.remember_missed(row, thread)
        return MISSED
    people = {
        m["user_id"]: {"name": m.get("name", ""), "email": ""}
        for m in stored.messages or []
        if m.get("user_id") and not m.get("bot")
    }
    reply = provider.reply_of(creds, config, event, people, timeout=EVENT_TIMEOUT, app_id=app)
    if reply is None:
        return IGNORED
    # SE4-24: the thread's people with the replier and whoever the reply mentions
    # F11: someone the thread already knows as a member is not asked about again
    found = _event_people(
        provider,
        creds,
        [reply["text"]],
        people,
        started=started,
        known=sync.resolved_people(stored.people),
    )
    with transaction.atomic():
        # SC3-7: two replies of one thread arriving at once never overwrite each other
        locked = SlackConversation.objects.select_for_update().get(pk=stored.pk)
        remote = sync.stored_remote(locked, [reply])
        remote.people = found
        outcome, _ = sync.file_conversation(connector, remote, [], now=now, channel=row)
    return FILED if outcome == "updated" else UNCHANGED


def _locked(connector, row, thread):
    return (
        SlackConversation.objects.select_for_update()
        .filter(connector=connector, channel=row.channel_id, thread_ts=thread)
        .first()
    )


def _edit_people(connector, row, thread, text, started):
    """SE4-24 on an edit: the people the new text mentions that the stored
    thread doesn't know yet, looked up before its lock is taken ({} for none)."""
    if not mentions(text):
        return {}
    known = (
        SlackConversation.objects.filter(
            connector=connector, channel=row.channel_id, thread_ts=thread
        )
        .values_list("people", flat=True)
        .first()
    )
    if known is None:
        return {}
    provider = get_provider(connector.provider)
    creds = connector.get_credentials()
    return _event_people(provider, creds, [text], {}, started=started, known=known or {})


def _edited(connector, row, event, started):
    """SC3-25: the new text, quietly; SE4-24: a person it newly mentions joins
    the thread's people."""
    message = _dict(event.get("message"))
    ts = str(message.get("ts") or "")
    text = str(message.get("text") or "")[:TEXT_CHARS]
    if not ts or not text:
        return IGNORED
    thread = str(message.get("thread_ts") or ts)
    found = _edit_people(connector, row, thread, text, started)
    with transaction.atomic():
        stored = _locked(connector, row, thread)
        if stored is None:
            return IGNORED
        edited = sync.edit_message(stored, ts, text)
        people = sync.merge_people(connector, found, None, stored.people) if found else None
        if people is not None and people != stored.people:
            stored.people = people
            stored.save(update_fields=["people"])
        return EDITED if edited else UNCHANGED


def _deleted(connector, row, event):
    """SC3-25: a reply goes, a top reads as deleted, a waiting top is forgotten."""
    ts = str(event.get("deleted_ts") or "")
    if not ts:
        return IGNORED
    thread = str(_dict(event.get("previous_message")).get("thread_ts") or ts)
    with transaction.atomic():
        stored = _locked(connector, row, thread)
        if stored is None:
            if thread == ts:
                unmatched.forget(connector, unmatched.slack_key(row.channel_id, ts))
            return REMOVED_EVENT
        return REMOVED_EVENT if sync.delete_message(stored, ts) else UNCHANGED


def _channel_created(connector, event, now):
    """SC3-5 (a): a new public channel becomes a row and is joined at once."""
    raw = _dict(event.get("channel"))
    channel = str(raw.get("id") or "")[:32]
    if not channel:
        return IGNORED
    row, made = SlackChannel.objects.get_or_create(
        connector=connector,
        channel_id=channel,
        defaults={"name": str(raw.get("name") or "")[:80], "event_at": now},
    )
    if not made:
        return UNCHANGED
    provider = get_provider(connector.provider)
    try:
        joined = slack_channels.join_missing(
            connector, provider, connector.get_credentials(), [row], timeout=EVENT_TIMEOUT
        )
    except ProviderError as exc:  # the next pass joins it
        logger.warning("slack join on create skipped: %s", type(exc).__name__)
        return LISTED
    return JOINED if joined else LISTED
