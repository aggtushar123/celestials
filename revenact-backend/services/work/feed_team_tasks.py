"""The Team queue's overdue group (Work in one place, delivery 2 contract
§1.4): open tasks with a record, past due and not Blocked (`work.states`),
assigned to the scope's people other than the reader, that the reader may
read. A row only opens the task panel (Decision D4). To-dos never: they
have no record, so they are not even counted."""

from django.db.models import DateField, Value
from django.db.models.functions import Coalesce

from services.customers.task_access import on_record_q, openable_tasks
from services.customers.task_payloads import ROW_RELATED

from .feed_shape import TASK, after_q
from .feed_tasks import NO_DATE, ORDER, PRIORITY_RANK, task_item
from .states import open_tasks, overdue_q
from .team_scope import named, people


class TeamOverdue:
    kind = TASK

    def __init__(self, reader, scope, today):
        self.reader = reader
        # SOC2:AUTH-02 a to-do is its creator's alone: never here, not even as hidden
        self.waiting = (
            open_tasks()
            .filter(assignee_id__in=people(reader, scope))
            .filter(on_record_q())
            .filter(overdue_q(today))
        )
        # SOC2:AUTH-02 the twice-filter: the task's own rule, on a record the reader may open
        self.readable = openable_tasks(reader, self.waiting)

    def count(self):
        return self.readable.count()

    def hidden(self):
        return self.waiting.count() - self.count()

    def page(self, after, limit):
        rows = self.readable.annotate(
            due_key=Coalesce("due_date", Value(NO_DATE), output_field=DateField()),
            prio=PRIORITY_RANK,
        ).select_related(*ROW_RELATED, "created_by", "assignee")
        if after is not None:
            rows = rows.filter(after_q(ORDER, after))
        return [
            (
                (task.due_key, task.prio, task.created_at, task.pk),
                {**task_item(task), "actions": ["open"], "for": named(task.assignee)},
            )
            for task in rows.order_by(*ORDER)[:limit]
        ]
