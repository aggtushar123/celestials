"""The queue rail (Agent bundles, contract §10.3): Mine, My team, Rest of
company and History, those the reader may use, each counting what needs
action (decide plus overdue, D8). Delivery 2's department and Unassigned
rows come from `queue_bundles.listed`."""

import logging
from collections import namedtuple

from django.db import transaction

from services.brain.scope import COMPANY, TEAM, available
from services.connectors import unmatched

from . import feed, feed_team, queue_bundles
from .team_scope import resolve_team

logger = logging.getLogger(__name__)
Queue = namedtuple("Queue", "key label may_use count")


class PartlyFailed(Exception):
    """A queue some of whose sources failed: its count would be wrong."""


def _mine(reader, today):
    counted = feed.count(reader, today=today)
    if counted["failed"]:
        raise PartlyFailed
    return counted["badge"]


def _team(key):
    def count(reader, today):
        total, failed = feed_team.counts(reader, resolve_team(reader, key), today=today)
        if failed:
            raise PartlyFailed
        return total

    return count


MAKERS = (
    Queue("mine", "Mine", lambda reader: True, _mine),
    Queue("team", "My team", lambda reader: TEAM in available(reader), _team(TEAM)),
    Queue(
        "company", "Rest of company", lambda reader: COMPANY in available(reader), _team(COMPANY)
    ),
    Queue("history", "History", lambda reader: True, None),
)


def _queue_count(key):
    def count(reader, today):
        return queue_bundles.count(reader, key)

    return count


def rows_for(reader):
    """The rail's rows for `reader`, in order (contract §4.5, D2-7)."""
    rows = list(MAKERS[:3])
    try:
        listed = queue_bundles.listed(reader)
    except Exception as exc:  # noqa: BLE001 - a failing connector read never fails the rail
        logger.warning("work queues: department queues failed: %s", type(exc).__name__)
        listed = []
    for key in listed:
        rows.append(Queue(key, queue_bundles.label(key), lambda reader: True, _queue_count(key)))
    rows.append(MAKERS[3])
    return rows


def build(reader, *, today):
    queues, failed = [], []
    for queue in rows_for(reader):
        # SOC2:AUTH-02 a queue the reader may not use is neither listed nor counted
        if not queue.may_use(reader):
            continue
        count = None
        if queue.count is not None:
            try:
                with transaction.atomic():
                    count = queue.count(reader, today)
            except Exception as exc:  # noqa: BLE001 - one queue never stops the rail
                logger.warning("work queues: %s failed: %s", queue.key, type(exc).__name__)
                failed.append(queue.key)
        needs = None
        if queue_bundles.is_queue_key(queue.key):
            try:
                with transaction.atomic():
                    needs = unmatched.count(reader, queue.key)
            except Exception as exc:  # noqa: BLE001 - R2D3-12: the rail never fails for it
                logger.warning("work queues: %s items failed: %s", queue.key, type(exc).__name__)
        queues.append(
            {"key": queue.key, "label": queue.label, "count": count, "needs_customer": needs}
        )
    return {"queues": queues, "failed": failed}
