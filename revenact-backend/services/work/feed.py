"""Work's one feed (Work in one place, spec §4.1, §4.2; contract §2): what
waits on the reader, in eight groups. Each source is built in its own
savepoint, so one failing (even with a database error) only adds its kinds
to `failed`; the response is still complete for the rest.

`build` is the whole feed, `page` one group's page after a cursor, `count`
the badge (counts only)."""

import logging

from django.db import transaction

from . import feed_decide, feed_slack, feed_suggest, feed_tasks
from .feed_shape import (
    BUNDLE,
    DECIDE,
    DECIDE_KINDS,
    EMAIL_SUGGESTION,
    KINDS,
    MEETING_PROPOSAL,
    PAGE,
    SLACK_MESSAGE,
    SUGGESTED,
    SUGGESTION,
    TASK_GROUPS,
    decode,
    group,
)

logger = logging.getLogger(__name__)


def ordered(failed):
    return [kind for kind in KINDS if kind in failed]


def attempt(kinds, failed, run):
    """`run()` (which returns a tuple) in a savepoint; None, with `kinds`
    added to `failed`, when it raises."""
    try:
        with transaction.atomic():
            return run()
    except Exception as exc:  # noqa: BLE001 - one source never stops the feed
        logger.warning("work feed: %s failed: %s", ",".join(kinds), type(exc).__name__)
        failed.extend(kinds)
        return None


def _decide(reader, kinds, after, failed):
    """The decide group's payload and its sources' hidden total."""
    count = hidden = 0
    rows = []
    for kind in DECIDE_KINDS:
        if kind not in kinds:
            continue

        def run(kind=kind):
            source = feed_decide.MAKERS[kind](reader)
            return source.count(), source.hidden(), source.page(after, PAGE + 1)

        got = attempt([kind], failed, run)
        if got is not None:
            count += got[0]
            hidden += got[1]
            rows += got[2]
    rows.sort(key=lambda row: row[0])
    return group(DECIDE, count, rows), hidden


def _tasks(reader, today, kinds, failed, *, only=None, after=None):
    """`{group key: payload}` for the task groups (all, or `only`) and the hidden total."""
    wanted = TASK_GROUPS if only is None else (only,)
    groups = {key: group(key, 0, []) for key in wanted}
    asked = [kind for kind in feed_tasks.Tasks.KINDS if kind in kinds]
    if not asked:
        return groups, 0

    def run():
        source = feed_tasks.Tasks(reader, today, kinds)
        counts = source.counts()
        built = {
            key: group(key, counts[key], source.page(key, after, PAGE + 1) if counts[key] else [])
            for key in wanted
        }
        return built, source.hidden() if only is None else 0

    got = attempt(asked, failed, run)
    if got is None:
        return groups, 0
    groups.update(got[0])
    return groups, got[1]


def _suggested(reader, today, kinds, after, failed):
    """The suggested group: Revenact's recommendations and the Slack messages
    the reader sent to their own Work, newest first in one keyset order."""
    count, hidden, rows = 0, 0, []
    if SUGGESTION in kinds:

        def run():
            source = feed_suggest.Suggestions(reader, today)
            return source.count(), source.hidden(), source.page(after, PAGE + 1)

        got = attempt([SUGGESTION], failed, run)
        if got is not None:
            count, hidden, rows = got[0], got[1], list(got[2])
    if SLACK_MESSAGE in kinds:

        def run_slack():
            source = feed_slack.SlackMessages(reader)
            return source.count(), source.page(after, PAGE + 1)

        got = attempt([SLACK_MESSAGE], failed, run_slack)
        if got is not None:
            count += got[0]
            rows += got[1]
    if MEETING_PROPOSAL in kinds:

        def run_proposals():
            from services.emailagent.feed import MeetingProposals

            source = MeetingProposals(reader)
            return source.count(), source.page(after, PAGE + 1)

        got = attempt([MEETING_PROPOSAL], failed, run_proposals)
        if got is not None:
            count += got[0]
            rows += got[1]
    if EMAIL_SUGGESTION in kinds:

        def run_own():
            from services.emailagent.feed import SenderSuggestions

            source = SenderSuggestions(reader)
            return source.count(), source.page(after, PAGE + 1)

        got = attempt([EMAIL_SUGGESTION], failed, run_own)
        if got is not None:
            count += got[0]
            rows += got[1]
    rows.sort(key=lambda row: row[0], reverse=True)
    return group(SUGGESTED, count, rows), hidden


def build(reader, *, today, kinds):
    failed = []
    decide, decide_hidden = _decide(reader, kinds, None, failed)
    tasks, tasks_hidden = _tasks(reader, today, kinds, failed)
    suggested, suggested_hidden = _suggested(reader, today, kinds, None, failed)
    return {
        "groups": [decide, *(tasks[key] for key in TASK_GROUPS), suggested],
        "hidden": decide_hidden + tasks_hidden + suggested_hidden,
        "failed": ordered(failed),
    }


def page(reader, *, today, kinds, group_key, cursor):
    """One group's page after `cursor` (None: its first page)."""
    after = None if cursor is None else decode(group_key, cursor)
    failed = []
    if group_key == DECIDE:
        payload, _hidden = _decide(reader, kinds, after, failed)
    elif group_key == SUGGESTED:
        payload, _hidden = _suggested(reader, today, kinds, after, failed)
    else:
        groups, _hidden = _tasks(reader, today, kinds, failed, only=group_key, after=after)
        payload = groups[group_key]
    return {"group": payload, "failed": ordered(failed)}


def count(reader, *, today, own_queue=False):
    """The badge: the decide group's and the overdue group's full counts;
    `own_queue` adds the reader's own department's queue (agent bundles D2-9),
    which the badge counts and Mine's rail row does not."""
    failed = []
    decide = 0
    for kind in DECIDE_KINDS:
        got = attempt([kind], failed, lambda kind=kind: (feed_decide.MAKERS[kind](reader).count(),))
        if got is not None:
            decide += got[0]
    if own_queue:
        from . import queue_bundles

        # SOC2:AUTH-02 the reader's own department queue needs no may_use:
        # D2-7 gives a department's queue to its own people, and the reader's
        # function is that department. A function that is no queue counts none.
        if reader.function in queue_bundles.LABELS:
            own = f"{queue_bundles.DEPARTMENT}{reader.function}"
            got = attempt([BUNDLE], failed, lambda: (queue_bundles.count(reader, own),))
            if got is not None:
                decide += got[0]
    every = frozenset(KINDS)
    got = attempt(
        list(feed_tasks.Tasks.KINDS),
        failed,
        lambda: (feed_tasks.Tasks(reader, today, every).counts()["overdue"],),
    )
    overdue = 0 if got is None else got[0]
    return {
        "decide": decide,
        "overdue": overdue,
        "badge": decide + overdue,
        "failed": ordered(failed),
    }
