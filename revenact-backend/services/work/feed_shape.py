"""The feed's fixed words and shapes (Work in one place, spec §4.1;
contract docs/superpowers/plans/2026-10-12-work-one-place-api.md §2): its
kinds and groups, the page size, the kind filter, the item shape and the
paging cursor. No queries here.

The cursor is a keyset position ("after this row"), not an offset, so rows
acted on between pages never make another row skip or repeat. It is bound to
its group and to that group's sort key shape."""

import base64
import binascii
import json
from datetime import date, datetime

from django.db.models import Q
from rest_framework import serializers

from services.customers.models import Customer

PAGE = 50

BUNDLE = "bundle"
APPROVAL = "approval"
RULE_REVIEW = "rule_review"
QUESTION = "question"
DRAFT = "draft"
TASK = "task"
TODO = "todo"
SUGGESTION = "suggestion"
#: A Slack message the reader sent to their own Work (Connections spec §3).
SLACK_MESSAGE = "slack_message"
#: A meeting the email agent proposed, waiting on its approver (2026-10-17).
MEETING_PROPOSAL = "meeting_proposal"
#: A task or meeting the agent read in the reader's own sent mail, waiting on their yes.
EMAIL_SUGGESTION = "email_suggestion"
#: Every kind, in the order `failed` lists them.
KINDS = (
    BUNDLE,
    RULE_REVIEW,
    QUESTION,
    DRAFT,
    TASK,
    TODO,
    SUGGESTION,
    SLACK_MESSAGE,
    MEETING_PROPOSAL,
    EMAIL_SUGGESTION,
)
#: The decide group's kinds, in the order a tie on `at` is broken.
DECIDE_KINDS = (RULE_REVIEW, BUNDLE, QUESTION, DRAFT)
#: Old kind words read as their new ones (Agent bundles D9).
ALIASES = {APPROVAL: BUNDLE}

DECIDE = "decide"
TASK_GROUPS = ("overdue", "today", "week", "later", "no_date", "blocked")
SUGGESTED = "suggested"
GROUPS = (DECIDE, *TASK_GROUPS, SUGGESTED)

CHOOSE_KIND = (
    "Choose bundle, rule_review, question, draft, task, todo, suggestion, slack_message,"
    " meeting_proposal or email_suggestion."
)
CHOOSE_GROUP = "Choose decide, overdue, today, week, later, no_date, blocked or suggested."
CURSOR_NEEDS_GROUP = "Say which group to page."
STALE_CURSOR = "That list has changed. Reload Work."

#: Each group's sort key, as cursor tags: t datetime, d date, i integer.
SHAPES = {
    DECIDE: ("t", "i", "i"),
    SUGGESTED: ("t", "i"),
    **{key: ("d", "i", "t", "i") for key in TASK_GROUPS},
}

_stamp = serializers.DateTimeField().to_representation


class BadQuery(Exception):
    """A query parameter the feed refuses: 400 `{field: [message]}`."""

    def __init__(self, field, message):
        super().__init__(message)
        self.field = field
        self.message = message


def parse_kinds(raw, allowed=KINDS, message=CHOOSE_KIND):
    """`?kind=` as a set of `allowed` kinds; every one when it is absent."""
    if raw is None:
        return frozenset(allowed)
    asked = {ALIASES.get(part.strip(), part.strip()) for part in raw.split(",") if part.strip()}
    if not asked or not asked <= set(allowed):
        raise BadQuery("kind", message)
    return frozenset(asked)


def record_ref(record):
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"type": kind, "id": record.pk, "name": record.name}


def item(
    *,
    key,
    kind,
    pk,
    title,
    record,
    source,
    at,
    actions,
    detail,
    due_date=None,
    priority=None,
    private=False,
):
    """One FeedItem (contract §2.2)."""
    return {
        "key": key,
        "kind": kind,
        "id": pk,
        "title": title,
        "record": record,
        "from": source,
        "at": _stamp(at),
        "due_date": None if due_date is None else due_date.isoformat(),
        "priority": priority,
        "private": private,
        "actions": list(actions),
        "detail": detail,
    }


def group(key, count, rows):
    """A group's payload from `(sort key, item)` rows already in order. More
    than PAGE rows means another page: its cursor is the last shown row's key."""
    shown = rows[:PAGE]
    more = len(rows) > PAGE
    return {
        "key": key,
        "count": count,
        "items": [entry for _key, entry in shown],
        "next": encode(key, shown[-1][0]) if more else None,
    }


def _dump(value):
    if isinstance(value, datetime):
        return ["t", value.isoformat()]
    if isinstance(value, date):
        return ["d", value.isoformat()]
    if isinstance(value, int) and not isinstance(value, bool):
        return ["i", value]
    raise TypeError(type(value).__name__)


def _load(pair, tag):
    found, raw = pair
    if found != tag:
        raise ValueError(found)
    if tag == "t":
        stamp = datetime.fromisoformat(raw)
        if stamp.utcoffset() is None:
            raise ValueError(raw)
        return stamp
    if tag == "d":
        return date.fromisoformat(raw)
    if isinstance(raw, int) and not isinstance(raw, bool) and -(2**63) <= raw < 2**63:
        return raw
    raise ValueError(raw)


def encode(group_key, values):
    text = json.dumps([group_key, [_dump(v) for v in values]], separators=(",", ":"))
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def decode(group_key, token):
    """The position `encode` wrote for `group_key`; BadQuery when it is not one."""
    try:
        padded = token + "=" * (-len(token) % 4)
        found, values = json.loads(base64.urlsafe_b64decode(padded.encode()))
        tags = SHAPES[group_key]
        if found != group_key or len(values) != len(tags):
            raise ValueError(found)
        return tuple(_load(pair, tag) for pair, tag in zip(values, tags, strict=True))
    except (ValueError, TypeError, KeyError, binascii.Error, UnicodeDecodeError):
        raise BadQuery("cursor", STALE_CURSOR) from None


def after_q(fields, values, *, descending=False):
    """Rows strictly after `values` in the order of `fields` (a keyset)."""
    op = "lt" if descending else "gt"
    found = None
    for i, name in enumerate(fields):
        step = Q(**dict(zip(fields[:i], values[:i], strict=True)), **{f"{name}__{op}": values[i]})
        found = step if found is None else found | step
    return found
