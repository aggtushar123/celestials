"""The task kinds (spec §1.3). A change goes through the task's own write
path (`snapshot` -> save -> `record_changes`), so its events, re-arming and
notices are a person's. Plan tasks never reach the evidence (Decision 3).
`actor` None is the agent acting on its own: events show Revenact."""

from datetime import date, timedelta

from rest_framework import serializers

from services.accounts.models import User
from services.customers.models import Task, TaskEvent
from services.customers.scoping import can_open
from services.customers.task_changes import (
    add_task,
    changed_fields,
    notify_assigned,
    record_changes,
    snapshot,
)
from services.customers.task_views import (
    CHOOSE_ASSIGNEE,
    CHOOSE_DATE,
    CHOOSE_PRIORITY,
    LONG_TITLE,
    NO_TITLE,
)
from services.metrics.models import AgentAction
from services.work.clock import today_for

from .. import bulk
from ..edits import PAST, checked
from ..kinds import ALL_AGENTS, ASK, AUTO, ChangedSince, FieldErrors, Invalid, Kind, Stale

K = AgentAction.Kind
PRIORITIES = tuple(Task.Priority.values)
STATUSES = dict(Task.Status.choices)
#: The furthest ahead an agent may move a due date.
MAX_DAYS = 120


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _label(action):
    return AgentAction.Agent(action.agent).label


def _evidence_task(payload, row, ctx):
    task_id = payload.get("task_id")
    task = ctx.tasks.get(task_id) if _whole(task_id) else None
    if task is None or task["record"] != row["ref"]:
        raise Invalid("task not in the evidence for this record")
    return task


def _task(action, *, lock=False):
    """The action's task as it is now, on the action's own record. `lock`
    holds the row as the person's PATCH does (the caller is in a transaction)."""
    page = bulk.active()
    if page is not None and not lock:
        found = page.tasks.get(action.payload["task_id"])
        same = found is not None and (found.customer_id, found.account_id) == (
            action.customer_id,
            action.account_id,
        )
        return found if same else None
    rows = Task.objects.select_related("assignee", "customer", "account").filter(
        pk=action.payload["task_id"],
        customer_id=action.customer_id,
        account_id=action.account_id,
    )
    if lock:
        rows = rows.select_for_update(no_key=True, of=("self",))
    return rows.first()


def _open(task):
    """Whether the task still exists and is not done (apply-time check)."""
    # A plan's tasks keep the plan's rules: no agent kind may touch them.
    return task is not None and task.plan_id is None and task.status != Task.Status.COMPLETED


def _not_past(day, action):
    """A date that passed while the action waited is stale (workspace's today)."""
    if day < today_for(action.organisation):
        raise Stale("that date has passed", reason="date_passed")


def _change(task, actor, **values):
    """Set `values` on `task` and write its events, as PATCH /tasks/ does."""
    before = snapshot(task)
    for name, value in values.items():
        setattr(task, name, value)
    names = changed_fields(task, before)
    if names:
        task.save(
            update_fields=[
                n
                for n in (*names, *values)
                if n in ("assignee", "assignee_name", "due_date", "status", "blocked_reason")
            ]
        )
        record_changes(task, before, actor=actor)
    return names


def _date(value, ctx):
    try:
        day = date.fromisoformat(str(value))
    except ValueError as exc:
        raise Invalid("not a date") from exc
    if not ctx.today <= day <= ctx.today + timedelta(days=MAX_DAYS):
        raise Invalid("date out of range")
    return day


def _person(organisation_id, pk):
    return User.objects.filter(pk=pk, organisation_id=organisation_id, is_active=True).first()


def _name_of(organisation_id, pk):
    if pk is None:
        return "Nobody"
    page = bulk.active()
    if page is not None:
        return page.names.get(pk) or "Someone no longer here"
    found = User.objects.filter(pk=pk, organisation_id=organisation_id).values_list(
        "name", flat=True
    )
    return found.first() or "Someone no longer here"


#: The title a preview shows for a task that is gone.
REMOVED_TASK = "A removed task"


def _task_preview(action, field, before, to):
    task = _task(action)
    return {
        # A task that is gone has no id: the page links a task only by its id.
        "task": {
            "id": None if task is None else task.pk,
            "title": REMOVED_TASK if task is None else task.title,
        },
        "field": field,
        "from": before,
        "to": to,
    }


# task.create


def create_validate(payload, row, ctx, evidence):
    title = str(payload.get("title") or "").strip()[:255]
    if not title:
        raise Invalid("no title")
    assignee_id = payload.get("assignee_id")
    member = ctx.member(assignee_id) if _whole(assignee_id) else None
    # SOC2:AUTH-02 a task is suggested only for someone who can open its record
    record = ctx.instance(row["ref"])
    if record is None:
        raise Invalid("the record is not in this workspace")
    if member is not None and not can_open(member, record):
        member = None
    try:
        due_in = max(1, min(60, int(payload.get("due_in_days", 7))))
    except (TypeError, ValueError):
        due_in = 7
    priority = payload.get("priority") if payload.get("priority") in PRIORITIES else "medium"
    return {
        "title": title,
        "assignee_id": None if member is None else member.pk,
        "assignee_name": "" if member is None else member.name,
        "due_date": (ctx.today + timedelta(days=due_in)).isoformat(),
        "priority": priority,
    }


def _assignee(action, record, actor):
    """The named member if they can still open the record, else (an old
    proposal) the member its name matches, else the record's owner, else
    the person applying it."""
    from services.metrics.proposals import match_member

    payload = action.payload
    member = None
    if _whole(payload.get("assignee_id")):
        member = _person(action.organisation_id, payload["assignee_id"])
    elif payload.get("assignee_name"):
        member = match_member(action.organisation, payload["assignee_name"])
    # SOC2:AUTH-02 a task goes only to someone who can open its record
    if member is not None and can_open(member, record):
        return member
    owner = record.owner
    if owner is not None and can_open(owner, record):
        return owner
    return actor


def create_apply(
    action,
    actor,
    *,
    assignee=None,
    title=None,
    due_date=None,
    priority=None,
    description="",
    facts=None,
    event_data=None,
):
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    payload = action.payload
    due = due_date or date.fromisoformat(str(payload["due_date"]))
    if due_date is None:
        _not_past(due, action)
    task = add_task(
        parent=record,
        title=title or payload["title"],
        due_date=due,
        priority=priority or payload["priority"],
        assignee=assignee if assignee is not None else _assignee(action, record, actor),
        created_by=actor,
        actor=actor,
        source=Task.Source.AGENT,
        description=description,
        facts=facts,
        event_data={"agent_action": action.pk, **(event_data or {})},
        initiative=action.initiative,
    )
    return task.pk, {"task_id": task.pk, "customer_id": action.customer_id}


def create_undo(action, actor):
    task = (
        Task.objects.filter(pk=(action.result or {}).get("task_id"))
        .select_for_update(no_key=True)
        .first()
    )
    if task is None:
        return
    untouched = (
        TaskEvent.Kind.CREATED,
        TaskEvent.Kind.RECOMMENDED,
    )
    worked = (
        task.status == Task.Status.COMPLETED
        or TaskEvent.objects.filter(task=task).exclude(kind__in=untouched).exists()
    )
    if worked:
        raise ChangedSince("This task has been worked on since: it can't be removed.")
    task.delete()


def create_preview(action):
    # A malformed payload (not the dict generation validated) previews as
    # empty, never a 500 reading a list.
    payload = action.payload if isinstance(action.payload, dict) else {}
    name = payload.get("assignee_name") or ""
    assignee = (
        {"id": payload["assignee_id"], "name": name} if _whole(payload.get("assignee_id")) else None
    )
    return {
        "task": {
            "title": payload.get("title", action.title),
            "assignee": assignee,
            "due_date": payload.get("due_date"),
            "priority": payload.get("priority"),
        }
    }


class _TaskEdit(serializers.Serializer):
    """Today's Approve overrides (`work.views.AssignSerializer`), every field optional."""

    title = serializers.CharField(
        required=False,
        max_length=255,
        error_messages={
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    assignee_id = serializers.IntegerField(
        required=False,
        error_messages={"invalid": CHOOSE_ASSIGNEE, "null": CHOOSE_ASSIGNEE},
    )
    due_date = serializers.DateField(
        required=False,
        error_messages={"invalid": CHOOSE_DATE, "null": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )


def create_edit(action, fields, runner):
    from services.customers.task_access import AssigneeCannotOpen, assignee_for

    clean = checked(_TaskEdit, fields)
    payload = dict(action.payload)
    if "title" in clean:
        payload["title"] = clean["title"].strip()
    if "priority" in clean:
        payload["priority"] = clean["priority"]
    if "due_date" in clean:
        if clean["due_date"] < today_for(action.organisation):
            raise FieldErrors({"due_date": [PAST]})
        payload["due_date"] = clean["due_date"].isoformat()
    if "assignee_id" in clean:
        try:
            # SOC2:AUTH-02 the task goes only to an active member who can open its record
            member = assignee_for(action.organisation_id, clean["assignee_id"], action.record)
        except AssigneeCannotOpen as exc:
            raise FieldErrors({"assignee_id": [str(exc.detail["detail"])]}) from None
        payload["assignee_id"], payload["assignee_name"] = member.pk, member.name
    return payload


CREATE = Kind(
    key=K.TASK_CREATE,
    label="Create a task",
    example="Ask Carl CSM to book Dough Co's renewal call by Friday.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=create_validate,
    target=lambda payload: f"task:{payload['title'].casefold()}"[:160],
    # The due date is absolute and moves every night: not part of "the same".
    same=lambda a, b: (
        a["title"].casefold() == b["title"].casefold()
        and a.get("assignee_id") == b.get("assignee_id")
        and a.get("priority") == b.get("priority")
    ),
    current=lambda action: None,
    preview=create_preview,
    apply=create_apply,
    undo=create_undo,
    editable=("title", "assignee_id", "due_date", "priority"),
    edit=create_edit,
    outputs=("task_id", "task_url"),
)


# task.reassign


def reassign_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    assignee_id = payload.get("assignee_id")
    member = ctx.member(assignee_id) if _whole(assignee_id) else None
    if member is None or member.pk == task["assignee_id"]:
        raise Invalid("no such person, or no change")
    # SOC2:AUTH-02 a task goes only to someone who can open its record
    record = ctx.instance(row["ref"])
    if record is None:
        raise Invalid("the record is not in this workspace")
    if not can_open(member, record):
        raise Invalid("that person can't open this record")
    return {"task_id": task["id"], "assignee_id": member.pk}


def reassign_current(action):
    task = _task(action)
    return None if task is None else task.assignee_id


def reassign_apply(action, actor, **_):
    task = _task(action, lock=True)
    person = _person(action.organisation_id, action.payload["assignee_id"])
    # SOC2:AUTH-02 checked again when it applies
    if not _open(task) or person is None or not can_open(person, action.record):
        raise Stale("the task or the person changed")
    _change(task, actor, assignee=person)
    notify_assigned(task, actor=actor)
    return person.pk, {}


def reassign_undo(action, actor):
    task = _task(action, lock=True)
    if task is not None and task.plan_id is not None:
        raise ChangedSince("This task belongs to a plan now.")
    if task is None or task.assignee_id != action.after:
        now = _name_of(action.organisation_id, None if task is None else task.assignee_id)
        raise ChangedSince(
            f"This task has been reassigned since: it is now {now}'s.",
            current=now,
            applied=_name_of(action.organisation_id, action.after),
        )
    previous = None if action.before is None else _person(action.organisation_id, action.before)
    # SOC2:AUTH-02 the old assignee gets it back only if they can still open it
    if action.before is not None and (previous is None or not can_open(previous, action.record)):
        raise ChangedSince(
            "The previous assignee can't take this task back now.",
            current=_name_of(action.organisation_id, task.assignee_id),
            applied=_name_of(action.organisation_id, action.after),
        )
    _change(task, actor, assignee=previous, **({} if previous else {"assignee_name": ""}))
    if previous is not None:
        notify_assigned(task, actor=actor)


REASSIGN = Kind(
    key=K.TASK_REASSIGN,
    label="Reassign a task",
    example="Give Taco East's onboarding call to Dana CSM.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=reassign_validate,
    target=lambda payload: f"task:{payload['task_id']}:assignee",
    current=reassign_current,
    preview=lambda action: _task_preview(
        action,
        "Assignee",
        _name_of(action.organisation_id, action.before),
        _name_of(action.organisation_id, action.payload["assignee_id"]),
    ),
    apply=reassign_apply,
    undo=reassign_undo,
)


# task.redate and task.snooze share the due date


def _due_current(action):
    task = _task(action)
    return None if task is None else task.due_date.isoformat()


def _due_undo(action, actor):
    task = _task(action, lock=True)
    if task is not None and task.plan_id is not None:
        raise ChangedSince("This task belongs to a plan now.")
    if task is None or task.due_date.isoformat() != action.after:
        now = "removed" if task is None else task.due_date.isoformat()
        raise ChangedSince(
            f"This task's due date has changed since: it is now {now}.",
            current=now,
            applied=action.after,
        )
    _change(task, actor, due_date=date.fromisoformat(action.before))


def redate_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    day = _date(payload.get("due_date"), ctx)
    if day.isoformat() == task["due_date"]:
        raise Invalid("no change")
    return {"task_id": task["id"], "due_date": day.isoformat()}


def redate_apply(action, actor, **_):
    task = _task(action, lock=True)
    if not _open(task):
        raise Stale("the task is gone or already done")
    _not_past(date.fromisoformat(action.payload["due_date"]), action)
    _change(task, actor, due_date=date.fromisoformat(action.payload["due_date"]))
    return action.payload["due_date"], {}


REDATE = Kind(
    key=K.TASK_REDATE,
    label="Change a task's due date",
    example="Move Pizza Hut's QBR prep to next Tuesday.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=redate_validate,
    target=lambda payload: f"task:{payload['task_id']}:due",
    current=_due_current,
    preview=lambda action: _task_preview(
        action, "Due date", action.before, action.payload["due_date"]
    ),
    apply=redate_apply,
    undo=_due_undo,
)


def snooze_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    day = _date(payload.get("until"), ctx)
    if day.isoformat() <= task["due_date"]:
        raise Invalid("a snooze moves the date later")
    reason = str(payload.get("reason") or "").strip()[:140]
    if not reason:
        raise Invalid("a snooze says why")
    return {"task_id": task["id"], "until": day.isoformat(), "reason": reason}


def snooze_apply(action, actor, **_):
    task = _task(action, lock=True)
    if not _open(task):
        raise Stale("the task is gone or already done")
    _not_past(date.fromisoformat(action.payload["until"]), action)
    _change(task, actor, due_date=date.fromisoformat(action.payload["until"]))
    TaskEvent.objects.create(
        task=task,
        actor=None,
        kind=TaskEvent.Kind.COMMENT,
        body=f"Snoozed by the {_label(action)}: {action.payload['reason']}",
    )
    return action.payload["until"], {}


SNOOZE = Kind(
    key=K.TASK_SNOOZE,
    label="Snooze a task",
    example="Snooze Dough Co's contract chase until the 20th: waiting on legal.",
    max_level=AUTO,
    agents=ALL_AGENTS,
    validate=snooze_validate,
    target=lambda payload: f"task:{payload['task_id']}:due",
    current=_due_current,
    preview=lambda action: _task_preview(
        action,
        "Due date",
        action.before,
        f"{action.payload['until']} (snoozed: {action.payload['reason']})",
    ),
    apply=snooze_apply,
    undo=_due_undo,
)


# task.complete


def complete_validate(payload, row, ctx, evidence):
    task = _evidence_task(payload, row, ctx)
    from ..evidence import FRAGMENT, normalise

    # `evidence` is the action's own matched lines; `because` cites one of
    # them, whole or as a fragment, as the evidence quotes may.
    wanted = normalise(payload.get("because") or "")
    quoted = [
        line
        for line in evidence
        if wanted
        and (normalise(line) == wanted or (len(wanted) >= FRAGMENT and wanted in normalise(line)))
    ]
    if not quoted:
        raise Invalid("a completion must quote its evidence")
    return {"task_id": task["id"], "because": quoted[0]}


def complete_current(action):
    task = _task(action)
    return None if task is None else {"status": task.status, "blocked_reason": task.blocked_reason}


def complete_apply(action, actor, **_):
    task = _task(action, lock=True)
    if not _open(task):
        raise Stale("the task is gone or already done")
    _change(task, actor, status=Task.Status.COMPLETED)
    return Task.Status.COMPLETED, {}


def complete_undo(action, actor):
    task = _task(action, lock=True)
    if task is None:
        raise ChangedSince("This task has been removed since.")
    if task.plan_id is not None:
        raise ChangedSince("This task belongs to a plan now.")
    if task.status != Task.Status.COMPLETED:
        raise ChangedSince("This task has been reopened since.")
    before = action.before or {}
    _change(
        task,
        actor,
        status=before.get("status", Task.Status.PENDING),
        blocked_reason=before.get("blocked_reason", ""),
    )


COMPLETE = Kind(
    key=K.TASK_COMPLETE,
    label="Mark a task done",
    example="Close 'Send the deck' on Pizza Hut: the deck was emailed on 6 Oct.",
    max_level=ASK,
    agents=ALL_AGENTS,
    validate=complete_validate,
    target=lambda payload: f"task:{payload['task_id']}:status",
    current=complete_current,
    # `current` is {status, blocked_reason}; `after` is the status it set.
    unchanged=lambda action, current: current.get("status") == action.after,
    preview=lambda action: _task_preview(
        action,
        "Status",
        STATUSES.get((action.before or {}).get("status"), "Open"),
        "Completed",
    ),
    apply=complete_apply,
    undo=complete_undo,
)
