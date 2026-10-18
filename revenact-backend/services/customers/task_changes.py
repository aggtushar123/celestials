"""Every write to a task's people and history (Work round, spec §1.3, §1.4).

`add_task` is how a task is made, whatever made it: the real assignee (and
`assignee_name` with it), where it came from, a `created` event (and a
`recommended` one for a recommendation), and the assignee told unless they
are the one acting. A plan starts its tasks in one insert and tells
assignees its own way (`plans.notices`), so it calls `created_events`.

`snapshot` before an edit and `record_changes` after it turn the edit into
one event per changed field, for `PATCH /tasks/<id>/` and the plan's own
task route alike. `record_changes` also re-arms a task's one escalation when
it is reassigned, re-dated or re-opened (it writes no event for that)."""

from .models import Customer, Task, TaskEvent
from .scoping import can_open
from .task_access import record_of


def link(task):
    """The task panel, opened over My work (Work in one place, delivery 2)."""
    return f"/work/mine?task={task.pk}"


def person(user):
    return None if user is None else {"id": user.pk, "name": user.name}


def notify_assigned(task, *, actor, working=None):
    """`task_assigned` to the task's assignee, unless they are `actor` or
    not active for work (`work.standing`). `actor` None is Revenact. The
    record and the title are named only to an assignee who may open the
    record (spec §4). `working`, when given, is the caller's active-for-work
    ids read once for many tasks (a rule's run), so none reads them again."""
    from services.notifications.models import Notification
    from services.notifications.realtime import notify
    from services.work.standing import is_working

    assignee = task.assignee
    if actor is not None and assignee is not None and actor.pk == assignee.pk:
        return None
    # SOC2:AUTH-02 a suspended or revoked member is not told of work
    # (An account has no organisation of its own: the assignee's workspace,
    # which assignee_for already held to the task's.)
    if assignee is None:
        return None
    if working is not None:
        active = assignee.is_active and assignee.pk in working
    else:
        active = is_working(assignee, assignee.organisation_id)
    if not active:
        return None
    record = record_of(task)
    if record is None:
        # A to-do is always its maker's own: nobody to tell.
        return None
    who = "Revenact" if actor is None else actor.name
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if can_open(assignee, record):
        message = f"{who} assigned you “{task.title}” on {record.name}."
    else:
        noun = "an organisation" if isinstance(record, Customer) else "an account"
        message = f"{who} assigned you a task on {noun} you can't open."
    return notify(
        recipient=assignee,
        actor=actor,
        kind=Notification.Kind.TASK_ASSIGNED,
        message=message[:500],
        link=link(task),
        push_on_commit=True,
    )


def created_event(task, *, actor, **data):
    """The `created` event, unsaved: where the task came from and who has it."""
    return TaskEvent(
        task=task,
        actor=actor,
        kind=TaskEvent.Kind.CREATED,
        data={"source": task.source, "assignee": person(task.assignee), **data},
    )


def created_events(tasks, *, actor, **data):
    """One `created` event per task, in one insert."""
    return TaskEvent.objects.bulk_create([created_event(t, actor=actor, **data) for t in tasks])


def add_task(
    *,
    parent,
    title,
    due_date,
    priority,
    assignee,
    created_by,
    actor,
    source,
    description="",
    status=Task.Status.PENDING,
    blocked_reason="",
    facts=None,
    notify_assignee=True,
    event_data=None,
    working=None,
    **links,
):
    """A task on `parent` (a Customer or an Account), or a to-do when
    `parent` is None. `links` are `plan`, `milestone` or `initiative`.
    `facts` (a recommendation's) writes a `recommended` event. The caller
    has already checked the assignee. `working` is passed on to
    `notify_assigned`."""
    if parent is None:
        on = {}
    else:
        on = {"customer": parent} if isinstance(parent, Customer) else {"account": parent}
    task = Task.objects.create(
        **on,
        title=title,
        description=description,
        due_date=due_date,
        priority=priority,
        status=status,
        blocked_reason=blocked_reason,
        assignee=assignee,
        assignee_name="" if assignee is None else assignee.name[:150],
        created_by=created_by,
        source=source,
        **links,
    )
    created_event(task, actor=actor, **(event_data or {})).save()
    if facts is not None:
        TaskEvent.objects.create(
            task=task,
            actor=actor,
            kind=TaskEvent.Kind.RECOMMENDED,
            data={"facts": [str(fact) for fact in facts]},
        )
    if notify_assignee:
        notify_assigned(task, actor=actor, working=working)
    return task


TRACKED = (
    "title",
    "description",
    "priority",
    "due_date",
    "assignee_id",
    "status",
    "blocked_reason",
    "customer_id",
    "account_id",
)


def snapshot(task):
    """The tracked values of `task` now, for `record_changes` after an edit."""
    return {**{name: getattr(task, name) for name in TRACKED}, "assignee": person(task.assignee)}


def changed_fields(task, before):
    """The API names of what changed since `before`, in a fixed order."""
    names = [
        n for n in ("title", "description", "priority", "due_date") if getattr(task, n) != before[n]
    ]
    if task.assignee_id != before["assignee_id"]:
        names.append("assignee")
    if task.status != before["status"]:
        names.append("status")
    if task.blocked_reason != before["blocked_reason"]:
        names.append("blocked_reason")
    if (task.customer_id, task.account_id) != (before["customer_id"], before["account_id"]):
        names.append("record")
    return names


def _event(task, actor, kind, data):
    return TaskEvent(task=task, actor=actor, kind=kind, data=data)


#: A change to any of these makes an escalated task eligible again (spec §3.2).
REARMING = frozenset({"assignee", "due_date"})


def rearms(task, before, names):
    """Whether this change re-arms the task's one escalation."""
    reopened = before["status"] == Task.Status.COMPLETED and task.status != Task.Status.COMPLETED
    return reopened or bool(REARMING & set(names))


def _day(value):
    return None if value is None else value.isoformat()


def _record(task):
    record = record_of(task)
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def record_changes(task, before, *, actor):
    """One event per changed field since `before`; returns `changed_fields`.
    A description's text is not copied into its event."""
    names = changed_fields(task, before)
    kind = TaskEvent.Kind
    events = [
        _event(task, actor, kind.EDITED, {"field": n, "from": before[n], "to": getattr(task, n)})
        for n in ("title", "priority")
        if n in names
    ]
    if "description" in names:
        events.append(_event(task, actor, kind.EDITED, {"field": "description"}))
    if "due_date" in names:
        dates = {"from": _day(before["due_date"]), "to": _day(task.due_date)}
        events.append(_event(task, actor, kind.DUE_CHANGED, dates))
    if "record" in names:
        # Only a to-do takes a record, once: there is never one to come from.
        events.append(
            _event(task, actor, kind.EDITED, {"field": "record", "from": None, "to": _record(task)})
        )
    if "assignee" in names:
        people = {"from": before["assignee"], "to": person(task.assignee)}
        events.append(_event(task, actor, kind.ASSIGNED, people))
    if "status" in names or "blocked_reason" in names:
        data = {"from": before["status"], "to": task.status}
        if task.status == Task.Status.BLOCKED:
            data["reason"] = task.blocked_reason
        events.append(_event(task, actor, kind.STATUS, data))
    TaskEvent.objects.bulk_create(events)
    if rearms(task, before, names):
        # Not gated on the in-memory value: a run may have escalated it since it was read.
        Task.objects.filter(pk=task.pk, escalated_at__isnull=False).update(escalated_at=None)
        task.escalated_at = None
    return names
