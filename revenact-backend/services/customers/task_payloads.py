"""What the Work routes and the task panel return for a task (Work round,
spec §1.4): one row for every list (`task_row`) and the panel's whole task
with its trail (`task_detail`). Only ever built for tasks the reader already
reads (`task_access.openable_tasks`)."""

from rest_framework import serializers

from .models import Customer
from .task_access import editable_fields, is_todo, record_of
from .task_changes import person

ROW_RELATED = ("customer", "account", "assignee", "plan")
DETAIL_RELATED = (*ROW_RELATED, "created_by", "milestone", "initiative")

_stamp = serializers.DateTimeField().to_representation


def parent_payload(task):
    record = record_of(task)
    if record is None:
        return None
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def assignee_payload(user):
    return None if user is None else {"id": user.pk, "name": user.name, "active": user.is_active}


def task_row(task):
    return {
        "id": task.pk,
        "title": task.title,
        "due_date": None if task.due_date is None else task.due_date.isoformat(),
        "priority": task.priority,
        "status": task.status,
        "blocked_reason": task.blocked_reason,
        "source": task.source,
        "parent": parent_payload(task),
        "assignee": assignee_payload(task.assignee),
        "plan": None if task.plan_id is None else {"id": task.plan_id, "name": task.plan.name},
        # A to-do: its creator's alone ("Only you").
        "private": is_todo(task),
    }


def event_payload(event):
    return {
        "id": event.pk,
        "kind": event.kind,
        "actor": person(event.actor),
        "data": event.data,
        "body": event.body,
        "created_at": _stamp(event.created_at),
    }


def task_detail(task, reader):
    row = task_row(task)
    milestone = task.milestone
    initiative = task.initiative
    return {
        **row,
        "description": task.description,
        "status_display": task.get_status_display(),
        "priority_display": task.get_priority_display(),
        "assignee_name": task.assignee_name,
        "created_by": person(task.created_by),
        "created_at": _stamp(task.created_at),
        "parent_name": None if row["parent"] is None else row["parent"]["name"],
        "parent_type": None if row["parent"] is None else row["parent"]["kind"],
        "milestone": None if milestone is None else {"id": milestone.pk, "name": milestone.name},
        "initiative": None
        if initiative is None
        else {"id": initiative.pk, "title": initiative.title},
        "editable": editable_fields(reader, task),
        "events": [event_payload(e) for e in task.events.select_related("actor")],
    }
