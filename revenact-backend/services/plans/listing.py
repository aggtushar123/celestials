"""`GET plans/`: the filters, the board's counts and the cursor (spec §4).

Every filter narrows the plans the reader may open (`access.visible_plans`).
`counts` covers the same filters ignoring `status`. Pages are newest first
under an opaque cursor; a malformed one reads as the first page."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime

from django.db.models import Count, Q

from services.customers.models import Task

from .models import OPEN, Kind, Plan

PAGE_SIZE = 50
#: A search is cut to this many characters.
MAX_QUERY = 120


def statuses(params):
    """The `status` values asked for (`open` for the first three); open by default."""
    wanted = set()
    for value in params.getlist("status"):
        if value == "open":
            wanted.update(OPEN)
        elif value in Plan.Status.values:
            wanted.add(value)
    return wanted or set(OPEN)


def _id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def filtered(plans, viewer, params):
    """Every filter but `status`; unknown values are ignored."""
    kind = params.get("kind")
    if kind in Kind.values:
        plans = plans.filter(kind=kind)
    owner = params.get("owner")
    if owner == "me":
        plans = plans.filter(owner=viewer)
    elif _id(owner) is not None:
        plans = plans.filter(owner_id=_id(owner))
    if params.get("mine") == "tasks":
        mine = Task.objects.filter(assignee=viewer, plan__isnull=False).values("plan_id")
        plans = plans.filter(pk__in=mine)
    for field in ("customer", "account"):
        pk = _id(params.get(field))
        if pk is not None:
            plans = plans.filter(**{f"{field}_id": pk})
    q = (params.get("q") or "").strip()[:MAX_QUERY]
    if q:
        plans = plans.filter(
            Q(name__icontains=q) | Q(customer__name__icontains=q) | Q(account__name__icontains=q)
        )
    return plans


def counts(plans):
    """`{status: n}` for all five statuses."""
    found = dict(plans.order_by().values_list("status").annotate(n=Count("id")))
    return {status: found.get(status, 0) for status in Plan.Status.values}


def encode_cursor(plan):
    raw = json.dumps([plan.created_at.isoformat(), plan.pk])
    return urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor):
    """(created_at, id) after which the next page starts, or None for a
    malformed one: bad base64/JSON, the wrong shape, a number too large to
    be an id (`OverflowError`, e.g. from a float like `1e999`), or a naive
    datetime (no offset) that would otherwise warn when compared against
    `created_at`."""
    if not cursor:
        return None
    try:
        at, pk = json.loads(urlsafe_b64decode(cursor.encode()))
        at = datetime.fromisoformat(at)
        pk = int(pk)
    except (OverflowError, ValueError, TypeError):
        return None
    if at.tzinfo is None:
        return None
    return at, pk


def page(plans, cursor):
    """One page, newest first, and the cursor for the next (None at the end)."""
    plans = plans.order_by("-created_at", "-pk")
    after = decode_cursor(cursor)
    if after is not None:
        at, pk = after
        plans = plans.filter(Q(created_at__lt=at) | Q(created_at=at, pk__lt=pk))
    rows = list(plans[: PAGE_SIZE + 1])
    more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    return rows, encode_cursor(rows[-1]) if more else None
