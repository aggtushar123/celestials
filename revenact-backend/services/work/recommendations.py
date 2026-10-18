"""Recommended (Work round §2.3 Read): the open recommendations a reader may
decide, newest first, with what each card shows. Those about records the
reader cannot open are counted in `hidden`, never named."""

from collections import defaultdict

from rest_framework import serializers

from services.customers.scoping import visible_accounts, visible_customers
from services.customers.task_changes import person

from .clock import working_days_for
from .defaults import defaults
from .models import Recommendation
from .rec_access import decidable, openable
from .standing import working_ids

LIMIT = 100
#: The list never shows a decision, so it select_relates less than
#: `rec_access.RELATED` — `decided_by` is Task 7's (the decided view's).
LIST_RELATED = (
    "customer",
    "account",
    "suggested_assignee",
    "recipient",
    "agent_action",
    "agent_action__customer",
    "agent_action__account",
)
_stamp = serializers.DateTimeField().to_representation


class Opens:
    """Whether a page's suggested assignees may open their row's record —
    batched per distinct assignee, not per row, so the list stays one or
    two queries per assignee on the page rather than one per row (this
    route is hot: the sidebar badge polls it on every route change).

    `rows` must be the whole page, read upfront, before any is checked."""

    def __init__(self, rows):
        # One canonical User instance per assignee id — select_related
        # gives each row its own fetched instance, and asking the same
        # person's visibility twice (once per instance) would waste both
        # the query and `subtree_ids`'s per-instance memo.
        assignees = {}
        customer_ids = defaultdict(set)
        account_ids = defaultdict(set)
        for rec in rows:
            user = rec.suggested_assignee
            if user is None:
                continue
            assignees.setdefault(user.pk, user)
            if rec.account_id is None:
                customer_ids[user.pk].add(rec.customer_id)
            else:
                account_ids[user.pk].add(rec.account_id)
        self._can = {}
        # SOC2:AUTH-02 a suspended or revoked member opens nothing here
        self._working = working_ids(rows[0].organisation_id) if assignees else frozenset()
        for pk, user in assignees.items():
            if pk not in self._working:
                continue
            cids = customer_ids.get(pk)
            if cids:
                openable_ids = set(
                    visible_customers(user).filter(pk__in=cids).values_list("pk", flat=True)
                )
                for cid in cids:
                    self._can[(pk, "Customer", cid)] = cid in openable_ids
            aids = account_ids.get(pk)
            if aids:
                openable_ids = set(
                    visible_accounts(user).filter(pk__in=aids).values_list("pk", flat=True)
                )
                for aid in aids:
                    self._can[(pk, "Account", aid)] = aid in openable_ids

    def active(self, user):
        """Whether `user` is active for work (`standing`)."""
        return user is not None and user.pk in self._working

    def __call__(self, user, record):
        if not self.active(user):
            return False
        return self._can.get((user.pk, type(record).__name__, record.pk), False)


def record_payload(rec):
    record = rec.record
    kind = "customer" if rec.account_id is None else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def row_payload(rec, *, today, opens, working_days, reader):
    from services.agents.payloads import action_payload

    suggested = rec.suggested_assignee
    why = rec.why if isinstance(rec.why, dict) else {}
    return {
        "id": rec.pk,
        "kind": rec.kind,
        "title": rec.title,
        # An agent action's card shows the action's own rationale and evidence:
        # `why` is empty whatever an older row stored (contract).
        "why": {"facts": [], "evidence": []}
        if rec.agent_action_id
        else {"facts": list(why.get("facts", [])), "evidence": list(why.get("evidence", []))},
        "record": record_payload(rec),
        "suggested_assignee": None
        if suggested is None
        else {
            "id": suggested.pk,
            "name": suggested.name,
            "active": opens.active(suggested),
            # SOC2:AUTH-02 someone who lost access is flagged, never prefilled
            "can_open": opens(suggested, rec.record),
        },
        "recipient": person(rec.recipient),
        # A non-task action is decided by Apply, not by Assign: no form defaults.
        "defaults": None
        if rec.agent_action_id and rec.agent_action.kind != "task.create"
        else defaults(rec, today, working_days),
        "agent_action": action_payload(rec.agent_action, reader) if rec.agent_action_id else None,
        "created_at": _stamp(rec.created_at),
    }


def build(reader, scope, *, today):
    waiting = decidable(reader, scope)
    # SOC2:AUTH-02 named only on records the reader may open; the rest counted
    readable = openable(reader, waiting)
    count = readable.count()
    rows = list(readable.select_related(*LIST_RELATED).order_by("-created_at", "-id")[:LIMIT])
    opens = Opens(rows)
    days = working_days_for(reader.organisation)
    from services.agents import bulk

    # The previews' reads are done once for the page, not once per row.
    with bulk.using([rec.agent_action for rec in rows if rec.agent_action_id]):
        items = [
            row_payload(rec, today=today, opens=opens, working_days=days, reader=reader)
            for rec in rows
        ]
    return {
        "scope": scope,
        "items": items,
        "count": count,
        "hidden": waiting.count() - count,
    }


def decided_payload(rec):
    return {
        "id": rec.pk,
        "status": rec.status,
        "decided_by": person(rec.decided_by),
        "decided_at": None if rec.decided_at is None else _stamp(rec.decided_at),
        "task_id": rec.task_id,
        "dismiss_reason": rec.dismiss_reason,
        "dismiss_note": rec.dismiss_note,
    }


def already_decided(rec):
    """The 409 body: who decided first, or that it expired."""
    if rec.status == Recommendation.Status.EXPIRED:
        detail = "This recommendation has expired."
    elif rec.decided_by is None:
        detail = f"This recommendation was already {rec.status}."
    else:
        detail = f"{rec.decided_by.name} already {rec.status} this."
    return {"code": "ALREADY_DECIDED", "detail": detail, "recommendation": decided_payload(rec)}
