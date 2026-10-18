"""The slow catch-up (Slack escalations D3, contract SC3-6, SC3-26): what
Slack's events missed, read within an unlisted app's limits. Per connection
and pass, never within a minute of the last: ONE conversations.history page
(15) of one channel, and at most ONE conversations.replies page (15): a
thread an event could not file, else a stored thread whose replies moved.
No message text is logged."""

import logging
from datetime import timedelta

from django.db import IntegrityError, transaction

from services.customers.models import SlackConversation

from . import slack_channels
from .providers.base import ProviderError
from .providers.slack import Budget, is_top, ts_time

logger = logging.getLogger(__name__)

#: SC3-6: the catch-up never reads further back than this.
WINDOW = timedelta(days=7)


def _posted(raw):
    return ts_time(str(raw["ts"]))


def _refused(row, exc, now):
    """A read Slack refused (not a rate limit): the row says why and when
    (SC3-6, F1: READ_RETRY counts from `asked_at`). Removed from the channel,
    the bot is not joined again by itself (SC3-3); a channel Slack cannot find
    is no longer the bot's either, so it stops using history calls (F8)."""
    row.read_error, row.asked_at = (exc.code or "refused")[:64], now
    if exc.code == "not_in_channel":
        row.is_member, row.join_error = False, slack_channels.REMOVED
    elif exc.code == "channel_not_found":
        row.is_member = False
    row.save(update_fields=["read_error", "asked_at", "is_member", "join_error", "updated_at"])


def _file(connector, remote, names, *, now, row, linked, counts):
    """File one thread; its outcome, or None when an event filed it meanwhile."""
    from .sync import file_conversation

    try:
        with transaction.atomic():  # a savepoint: an event filing it at once wins
            outcome, _ = file_conversation(
                connector, remote, names, now=now, channel=row, linked=linked
            )
    except IntegrityError:
        logger.warning("slack catch-up: thread filed meanwhile")
        return None
    if outcome in counts:  # "unchanged" is not news
        counts[outcome] += 1
    return outcome


def _page(connector, provider, creds, row, *, now, names, linked, counts, people, looked):
    """SC3-6 (1): one history page of `row`; the moved stored threads ([]
    when Slack refused the read), or None on a rate limit, which ends the run.
    `people` and `looked` are the run's lookups (SE4-24)."""
    from .sync import resolved_people

    if row.walk_from is None:
        row.walk_from = now
    floor = now - WINDOW
    if row.read_at is not None:
        floor = max(floor, row.read_at - slack_channels.OVERLAP)
    try:
        tops, more, lowest = provider.read_page(
            connector.config,
            creds,
            channel=row.channel_id,
            oldest=f"{floor.timestamp():.6f}",
            latest=row.walk_before,
        )
    except ProviderError as exc:
        if exc.reauth:
            raise
        if slack_channels.rate_limited(exc):
            return None
        # SC3-6: only a rate limit ends the catch-up; the row says why and
        # pick ranks it last, so the missed queue and other channels go on
        _refused(row, exc, now)
        return []
    # The page's stored threads in one query: their marks (which moved) and
    # their people already known as members (D4's F11: not asked about again)
    stored = {
        ts: (latest, found)
        for ts, latest, found in SlackConversation.objects.filter(
            connector=connector,
            channel=row.channel_id,
            thread_ts__in=[str(raw["ts"]) for raw in tops],
        ).values_list("thread_ts", "latest_reply", "people")
    }
    created = set()
    for raw in tops:
        ts = str(raw["ts"])
        remote = provider.thread_of(creds, connector.config, row.channel_id, raw, people=people)
        known = resolved_people(stored[ts][1]) if ts in stored else set()
        # SE4-24: the poster and the people the top message mentions
        remote.people = provider._people_of(creds, remote, people, looked, known)
        outcome = _file(connector, remote, names, now=now, row=row, linked=linked, counts=counts)
        if outcome == "created":
            created.add(ts)
    if more and lowest:
        row.walk_before = lowest
    else:
        row.read_at, row.walk_before, row.walk_from = row.walk_from, "", None
    row.read_error = ""
    if tops:
        newest = max(_posted(raw) for raw in tops)
        row.last_message_at = max(row.last_message_at or newest, newest)
    row.save(
        update_fields=[
            "walk_before",
            "walk_from",
            "read_at",
            "read_error",
            "last_message_at",
            "updated_at",
        ]
    )
    # a thread filed just now is stored with no replies read yet
    marks = {ts: latest for ts, (latest, _found) in stored.items()}
    marks.update(dict.fromkeys(created, ""))
    return [
        str(raw["ts"])
        for raw in tops
        if str(raw["ts"]) in marks
        and raw.get("latest_reply")
        and str(raw["latest_reply"]) != marks[str(raw["ts"])]
    ]


def _thread(
    connector, provider, creds, row, ts, *, now, names, linked, counts, missed, people, looked
):
    """SC3-6 (2), SC3-26: one replies page of one thread, merged and filed."""
    from .sync import resolved_people, stored_remote

    existing = SlackConversation.objects.filter(
        connector=connector, channel=row.channel_id, thread_ts=ts
    ).first()
    since = existing.latest_reply if existing is not None else ""
    try:
        parent, replies = provider.read_thread(
            connector.config,
            creds,
            channel=row.channel_id,
            thread_ts=ts,
            since=since,
            people=people,
        )
    except ProviderError as exc:
        if exc.reauth:
            raise
        if slack_channels.rate_limited(exc):
            return  # SC3-6: the thread waits for the next catch-up
        # R6: any other refusal is the row's, and a missed thread leaves the
        # queue (thread_not_found and channel_not_found among them, SC3-26)
        _refused(row, exc, now)
        if missed:
            slack_channels.forget_missed(row, ts)
        return
    if existing is not None:
        remote = stored_remote(existing, replies)
    elif parent is not None and is_top(parent):
        latest = max((m["ts"] for m in replies), key=float, default="")
        remote = provider.thread_of(
            creds,
            connector.config,
            row.channel_id,
            parent,
            replies=replies,
            latest=latest,
            people=people,
        )
    else:
        remote = None  # not a conversation's thread (a bot's post, a join)
    if remote is not None:
        # SE4-24: the thread's posters and the people they mention
        known = resolved_people(existing.people) if existing is not None else set()
        remote.people = provider._people_of(creds, remote, people, looked, known)
        _file(connector, remote, names, now=now, row=row, linked=linked, counts=counts)
    if missed:
        slack_channels.forget_missed(row, ts)


def run(connector, provider, creds, rows, *, now, counts, names, linked):
    """One catch-up (SC3-6), when slack_channels.history_due said so."""
    budget = Budget()
    # SE4-24: one lookup cache and one MAX_PEOPLE count for the whole catch-up
    people, looked = {}, [0]
    row = slack_channels.pick(rows, now)
    moved = []
    if row is not None:
        row.asked_at = now
        row.save(update_fields=["asked_at", "updated_at"])
        moved = _page(
            connector,
            provider,
            creds,
            row,
            now=now,
            names=names,
            linked=linked,
            counts=counts,
            people=people,
            looked=looked,
        )
        if moved is None:
            return
    waiting = slack_channels.next_missed(rows)
    if waiting is not None and budget.replies > 0:
        budget.replies -= 1
        missed_row, ts = waiting
        _thread(
            connector,
            provider,
            creds,
            missed_row,
            ts,
            now=now,
            names=names,
            linked=linked,
            counts=counts,
            missed=True,
            people=people,
            looked=looked,
        )
    elif moved and budget.replies > 0:
        budget.replies -= 1
        _thread(
            connector,
            provider,
            creds,
            row,
            moved[0],
            now=now,
            names=names,
            linked=linked,
            counts=counts,
            missed=False,
            people=people,
            looked=looked,
        )
