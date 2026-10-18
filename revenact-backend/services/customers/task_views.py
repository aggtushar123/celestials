"""`GET`/`PATCH /api/v1/tasks/<id>/` and `POST /api/v1/tasks/<id>/comments/`:
the Work task panel (spec §1.4). A task the reader may not read (another
workspace, a record they can't open, outside its chain) is a 404, never a
403. A to-do is read only by its creator (task_access.readable_tasks). See
docs/API_CONTRACTS.md, `work`."""

from django.db import transaction
from django.http import Http404
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from .models import Customer, Task, TaskEvent
from .task_access import (
    RECORD_FIXED,
    RECORD_YOU_CAN_OPEN,
    SAY_WHY_BLOCKED,
    TODO_ONLY_YOURS,
    assignee_for,
    editable_fields,
    is_todo,
    readable_tasks,
    record_for,
    record_of,
)
from .task_changes import changed_fields, notify_assigned, record_changes, snapshot
from .task_payloads import DETAIL_RELATED, event_payload, task_detail

NO_SUCH_TASK = "No such task."
SEND_AN_OBJECT = "Send the fields as one object."
CHOOSE_STATUS = "Choose pending, in progress, blocked or completed."
NO_TITLE = "Give the task a title."
LONG_TITLE = "Keep the title under 255 characters."
LONG_DESCRIPTION = "Keep the description under 10,000 characters."
LONG_REASON = "Keep the reason under 255 characters."
CHOOSE_PRIORITY = "Choose high, medium or low."
CHOOSE_DATE = "Choose a date."
CHOOSE_ASSIGNEE = "Choose who does it."
WRITE_A_COMMENT = "Write a comment."
LONG_COMMENT = "Keep a comment under 5,000 characters."


class TaskPatchSerializer(serializers.Serializer):
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
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10_000,
        error_messages={"max_length": LONG_DESCRIPTION},
    )
    status = serializers.ChoiceField(
        required=False,
        choices=Task.Status.choices,
        error_messages={"invalid_choice": CHOOSE_STATUS, "null": CHOOSE_STATUS},
    )
    blocked_reason = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        error_messages={"max_length": LONG_REASON},
    )
    due_date = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={"invalid": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    customer_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={"invalid": RECORD_YOU_CAN_OPEN, "max_string_length": RECORD_YOU_CAN_OPEN},
    )
    account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={"invalid": RECORD_YOU_CAN_OPEN, "max_string_length": RECORD_YOU_CAN_OPEN},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )
    assignee_id = serializers.IntegerField(
        required=False,
        error_messages={
            "invalid": CHOOSE_ASSIGNEE,
            "null": CHOOSE_ASSIGNEE,
            "max_string_length": CHOOSE_ASSIGNEE,
        },
    )


class CommentSerializer(serializers.Serializer):
    body = serializers.CharField(
        max_length=5000,
        error_messages={
            "required": WRITE_A_COMMENT,
            "blank": WRITE_A_COMMENT,
            "null": WRITE_A_COMMENT,
            "invalid": WRITE_A_COMMENT,
            "max_length": LONG_COMMENT,
        },
    )


def _readable(user, pk, *, lock=False):
    rows = Task.objects.all()
    if lock:
        # `of=("self",)`: the parent and people joins are nullable (LEFT
        # OUTER), and Postgres refuses FOR UPDATE on their side.
        rows = rows.select_for_update(no_key=True, of=("self",))
    # SOC2:AUTH-02 the twice-filter, or the reader's own to-do; anything else reads as missing
    task = readable_tasks(user, rows).select_related(*DETAIL_RELATED).filter(pk=pk).first()
    if task is None:
        raise NotFound(NO_SUCH_TASK)
    return task


def _locked(user, pk):
    """The task again under its row lock. A plan's task takes its plan's lock
    first, the order every plan write uses (services/plans/status.py)."""
    task = _readable(user, pk)
    if task.plan_id is not None:
        from services.plans.status import lock_plan

        try:
            lock_plan(task.plan_id)
        except Http404:
            raise NotFound(NO_SUCH_TASK) from None
    return _readable(user, pk, lock=True)


def _as_saved(user, pk):
    """The panel's shape for the task as just saved. A change may take the
    caller's read away (a task handed outside their chain): they still see
    what they saved, with nothing left to edit; their next GET is a 404."""
    try:
        task = Task.objects.select_related(*DETAIL_RELATED).get(pk=pk)
    except Task.DoesNotExist:
        # deleted by someone else since the write committed
        raise NotFound(NO_SUCH_TASK) from None
    payload = task_detail(task, user)
    if not readable_tasks(user, Task.objects.filter(pk=pk)).exists():
        payload["editable"] = []
    return payload


def _asked(task, data):
    """The fields the body changes, in `editable_fields`' names. A field sent
    with its current value is not asked for: a client may send the whole
    form. `blocked_reason` rides with `status`: a new reason on a Blocked
    task is a status change."""
    asked = {
        n
        for n in ("title", "description", "priority", "due_date")
        if n in data and data[n] != getattr(task, n)
    }
    if "assignee_id" in data and data["assignee_id"] != task.assignee_id:
        asked.add("assignee")
    if any(
        data.get(name) is not None and data[name] != getattr(task, name)
        for name in ("customer_id", "account_id")
    ):
        asked.add("record")
    new_status = data.get("status", task.status)
    if new_status != task.status or (
        new_status == Task.Status.BLOCKED
        and "blocked_reason" in data
        and (data["blocked_reason"] or "").strip() != task.blocked_reason
    ):
        asked.add("status")
    return asked


def _refuse(user, task, asked):
    """Only a plan's task has fields its reader may not change: refused in
    the plan task route's words."""
    from services.plans.access import NOT_CHECKER, NOT_EDITOR, can_check, can_edit
    from services.plans.validation import PLAN_FINISHED

    # SOC2:AUTH-02 a plan's task: its fields are the plan's editors', while the
    # plan is open; its status is its assignee's, its creator's and the editors'
    if asked - {"status"} and not can_edit(user, task.plan):
        raise PermissionDenied(NOT_EDITOR)
    if "status" in asked and not can_check(user, task.plan, task):
        raise PermissionDenied(NOT_CHECKER)
    raise ValidationError({"non_field_errors": [PLAN_FINISHED]})


def _values(user, task, data, asked):
    """The validated body as the values to write: the record looked up and
    checked (a to-do's only), the assignee looked up and checked, and the
    status with its reason (required for Blocked, cleared otherwise). A task
    with a record always keeps a date."""
    values = {n: data[n] for n in ("title", "description", "priority", "due_date") if n in data}
    record = None
    if "record" in asked:
        record = record_for(user, data.get("customer_id"), data.get("account_id"))
        values["record"] = record
    target = record if record is not None else record_of(task)
    if target is not None and values.get("due_date", task.due_date) is None:
        raise ValidationError({"due_date": [CHOOSE_DATE]})
    if "assignee_id" in data and data["assignee_id"] != task.assignee_id:
        if target is None:
            # SOC2:AUTH-02 a to-do is its creator's alone
            raise ValidationError({"assignee": [TODO_ONLY_YOURS]})
        values["assignee"] = assignee_for(user.organisation_id, data["assignee_id"], target)
    new_status = data.get("status", task.status)
    if new_status == Task.Status.BLOCKED:
        sent = "blocked_reason" in data
        reason = (data["blocked_reason"] or "").strip() if sent else task.blocked_reason
        if not reason:
            raise ValidationError({"blocked_reason": [SAY_WHY_BLOCKED]})
    else:
        reason = ""
    values["status"], values["blocked_reason"] = new_status, reason
    return values


class TaskDetailView(APIView):
    """GET the task panel; PATCH any of title, description, status (with
    blocked_reason), due_date, priority, assignee_id; on a to-do also
    customer_id or account_id (attach a record). Each changed field
    writes its event; a new assignee is told; changes are audited as
    `task.update`."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(task_detail(_readable(request.user, pk), request.user))

    def patch(self, request, pk):
        _readable(request.user, pk)
        if not isinstance(request.data, dict):
            raise ValidationError({"non_field_errors": [SEND_AN_OBJECT]})
        serializer = TaskPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            task = _locked(request.user, pk)
            asked = _asked(task, data)
            if "record" in asked and not is_todo(task):
                raise ValidationError({"record": [RECORD_FIXED]})
            if not asked <= set(editable_fields(request.user, task)):
                _refuse(request.user, task, asked)
            self._write(request, task, _values(request.user, task, data, asked))
        return Response(_as_saved(request.user, pk))

    def _write(self, request, task, values):
        before = snapshot(task)
        # A to-do's title is private: the audit log (read by platform staff)
        # names it by id. Judged before the write, so attaching a record counts.
        private = is_todo(task)
        for name in ("title", "description", "priority", "due_date", "assignee"):
            if name in values:
                setattr(task, name, values[name])
        if "record" in values:
            record = values["record"]
            if isinstance(record, Customer):
                task.customer, task.account = record, None
            else:
                task.customer, task.account = None, record
        moved = (values["status"], values["blocked_reason"]) != (task.status, task.blocked_reason)
        if moved and task.plan_id is not None:
            from services.plans.status import set_task_status

            # A plan's task moves its milestone and plan too, under the plan's lock.
            try:
                set_task_status(
                    task, values["status"], blocked_reason=values["blocked_reason"], request=request
                )
            except Task.DoesNotExist:
                raise NotFound(NO_SUCH_TASK) from None
        elif moved:
            task.status, task.blocked_reason = values["status"], values["blocked_reason"]
        names = changed_fields(task, before)
        if not names:
            return
        kept = [n for n in names if task.plan_id is None or n not in ("status", "blocked_reason")]
        # "record" is the API's name for the two parent columns.
        saved = [f for n in kept for f in (("customer", "account") if n == "record" else (n,))]
        if saved:
            task.save(update_fields=saved)
        record_changes(task, before, actor=request.user)
        metadata = {"fields": names}
        if "status" in names:
            metadata.update({"from": before["status"], "to": task.status})
        audit.record(  # SOC2:LOG-01
            "task.update",
            request=request,
            target=task,
            target_repr=f"Task {task.pk}" if private else None,
            metadata=metadata,
        )
        if task.plan_id is None:
            if "assignee" in names:
                notify_assigned(task, actor=request.user)
            return
        from services.plans.notices import tell_assignees

        # A plan's task is audited and its new assignee told as the plan's own task route does.
        audit.record(  # SOC2:LOG-01
            "plan.task_changed",
            request=request,
            target=task.plan,
            metadata={"task": task.pk, "change": "edited", "fields": sorted(names)},
        )
        if "assignee" in names:
            tell_assignees(task.plan, [task], actor=request.user)


class TaskCommentView(APIView):
    """POST `{body}`: a `comment` event on a task the caller reads."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        task = _readable(request.user, pk)
        serializer = CommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = TaskEvent.objects.create(
            task=task,
            actor=request.user,
            kind=TaskEvent.Kind.COMMENT,
            body=serializer.validated_data["body"],
        )
        return Response(event_payload(event), status=status.HTTP_201_CREATED)
