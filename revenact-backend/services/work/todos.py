"""Making a to-do, or a task on a record, from Work's quick-add (Work in one
place, spec §3; contract §1.1). Without a record it is a to-do: the
caller's alone. With one it is the task the record's own Tasks route would
make, under that route's rules (a date, an assignee who can open it)."""

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from services.customers.models import Task
from services.customers.task_access import (
    RECORD_YOU_CAN_OPEN,
    TODO_ONLY_YOURS,
    assignee_for,
    record_for,
)
from services.customers.task_changes import add_task
from services.customers.task_payloads import DETAIL_RELATED, task_detail
from services.customers.task_views import (
    CHOOSE_ASSIGNEE,
    CHOOSE_DATE,
    CHOOSE_PRIORITY,
    LONG_TITLE,
    NO_TITLE,
)

from .feed_tasks import group_of, task_item

_record_id = {
    "required": False,
    "allow_null": True,
    "error_messages": {"invalid": RECORD_YOU_CAN_OPEN, "max_string_length": RECORD_YOU_CAN_OPEN},
}


class TextField(serializers.CharField):
    """A CharField that refuses a non-string instead of coercing it (`123` is not a title)."""

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class TodoSerializer(serializers.Serializer):
    title = TextField(
        max_length=255,
        error_messages={
            "required": NO_TITLE,
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    due_date = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={"invalid": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )
    customer_id = serializers.IntegerField(**_record_id)
    account_id = serializers.IntegerField(**_record_id)
    assignee_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={"invalid": CHOOSE_ASSIGNEE, "max_string_length": CHOOSE_ASSIGNEE},
    )


def create(reader, data):
    """The task `data` (TodoSerializer's) asks for, made by `reader`."""
    record = record_for(reader, data.get("customer_id"), data.get("account_id"))
    pk = data.get("assignee_id")
    if record is None:
        if pk is not None and pk != reader.pk:
            # SOC2:AUTH-02 a to-do is its creator's alone
            raise ValidationError({"assignee": [TODO_ONLY_YOURS]})
        assignee = reader
    else:
        if data.get("due_date") is None:
            raise ValidationError({"due_date": [CHOOSE_DATE]})
        # SOC2:AUTH-02 a task is given only to an active member who can open its record
        assignee = reader if pk is None else assignee_for(reader.organisation_id, pk, record)
    return add_task(
        parent=record,
        title=data["title"],
        due_date=data.get("due_date"),
        priority=data.get("priority") or Task.Priority.MEDIUM,
        assignee=assignee,
        created_by=reader,
        actor=reader,
        source=Task.Source.MANUAL,
    )


def created_payload(reader, task, *, today):
    """`{task, item, group}`: the panel's task, and the feed row and its
    group when the task is on the reader's own desk (else both None)."""
    task = Task.objects.select_related(*DETAIL_RELATED).get(pk=task.pk)
    mine = task.assignee_id == reader.pk
    return {
        "task": task_detail(task, reader),
        "item": task_item(task) if mine else None,
        "group": group_of(task, today) if mine else None,
    }
