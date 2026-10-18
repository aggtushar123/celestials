"""The contract's AgentAction and AgentCard shapes, written for one reader:
evidence for view_all readers only, undo's state as far as it can be read."""

from django.utils import timezone
from rest_framework import serializers

from services.customers.models import Customer
from services.customers.scoping import sees_everything
from services.customers.task_changes import person
from services.metrics.models import AgentAction

from . import bulk
from .deciding import may_decide
from .evidence import shown
from .policy import LABELS, resets_on, spent_this_month
from .registry import REGISTRY
from .undo import undo_window

_stamp = serializers.DateTimeField().to_representation


def _link(record):
    if record is None:
        return None
    if isinstance(record, Customer):
        return f"/organizations/{record.pk}"
    return f"/accounts/{record.pk}"


def record_payload(action):
    record = action.record
    if record is None:
        return None
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def undo_block(action, reader):
    if action.status != AgentAction.Status.APPLIED:
        return None
    undoable_run = REGISTRY[action.kind].undoable_run
    if undoable_run is not None and not undoable_run(action):
        # A diagnosis that filed no note changed nothing: there is no undo to offer.
        return None
    if action.irreversible:
        return {"allowed": False, "until": None, "reason": "irreversible"}
    until = undo_window(action)
    reason = None
    if until is None or timezone.now() > until:
        reason = "expired"
    elif not may_decide(reader, action):
        reason = "cant_decide"
    else:
        spec = REGISTRY[action.kind]
        current = spec.current(action)
        unchanged = spec.unchanged or (lambda action, current: current == action.after)
        if current is not None and not unchanged(action, current):
            reason = "changed_since"
    return {
        "allowed": reason is None,
        "until": None if until is None else _stamp(until),
        "reason": reason,
    }


HIDDEN_TASK = "A task you can't see"


def _task_visible(reader, task_id):
    from services.customers.models import Task
    from services.customers.personal import visible_tasks

    page = bulk.active()
    if page is not None:
        return task_id in page.visible_task_ids(reader)
    # SOC2:AUTH-02 a task's title only for someone who may read the task
    return visible_tasks(reader, Task.objects.filter(pk=task_id)).exists()


def preview_for(action, reader):
    """The kind's preview, with an existing task kept to readers who may read
    it: a peer who opens the record may not read every task on it. A task
    the reader may not read, like one that is gone, has no id, so the page
    never links it."""
    spec = REGISTRY[action.kind]
    preview = spec.preview(action, reader) if spec.per_reader else spec.preview(action)
    task = preview.get("task") if isinstance(preview, dict) else None
    if isinstance(task, dict) and task.get("id") is not None:
        if not _task_visible(reader, task["id"]):
            preview = {**preview, "task": {**task, "id": None, "title": HIDDEN_TASK}}
    return preview


#: Every thing a kind can make, in the contract's order.
RESULT_KEYS = (
    "task_id",
    "note_id",
    "initiative_id",
    "draft_id",
    "plan_id",
    "segment_id",
    "rule_id",
    "campaign_id",
    "canvas_id",
    "template_id",
)


def _result(action):
    result = action.result or {}
    return {key: result.get(key) for key in RESULT_KEYS}


def action_payload(action, reader):
    link = _link(action.record)
    # SOC2:AUTH-02 evidence is written from the whole book: view_all_accounts only
    evidence = (
        [{"label": shown(line), "link": link} for line in action.evidence]
        if sees_everything(reader)
        else []
    )
    return {
        "id": action.pk,
        "bundle": action.bundle_id,
        "agent": action.agent,
        "kind": action.kind,
        "title": action.title,
        "status": action.status,
        "record": record_payload(action),
        "preview": preview_for(action, reader),
        "rationale": action.rationale,
        "evidence": evidence,
        "decided_by": person(action.decided_by),
        "decided_at": None if action.decided_at is None else _stamp(action.decided_at),
        "auto": action.auto,
        "applied_at": None if action.applied_at is None else _stamp(action.applied_at),
        "undo": undo_block(action, reader),
        "undone_by": person(action.undone_by),
        "undone_at": None if action.undone_at is None else _stamp(action.undone_at),
        "result": _result(action),
        "created_at": _stamp(action.created_at),
    }


def card(profile, organisation, today):
    from .threads import waiting_for

    last = profile.last_run or {}
    waiting, reason = waiting_for(organisation, profile.kind)
    return {
        "kind": profile.kind,
        "label": LABELS[profile.kind],
        "enabled": profile.enabled,
        "monthly_credits": profile.monthly_credits,
        "spent_this_month": spent_this_month(organisation, profile.kind, today=today),
        "resets_on": resets_on(today).isoformat(),
        "last_run": None
        if profile.last_run_at is None
        else {
            "at": _stamp(profile.last_run_at),
            "proposed": last.get("proposed", 0),
            "applied": last.get("applied", 0),
            "dropped": last.get("dropped", 0),
            "skipped_reason": last.get("skipped_reason"),
        },
        "waiting_threads": waiting,
        "waiting_reason": reason if waiting else None,
    }
