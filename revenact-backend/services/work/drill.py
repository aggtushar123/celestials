"""The Team drill-down (Work round §1.4): one person's open tasks in one
state, only those the reader may read. No hidden count here: the Team row the
reader opened already carries its scope's."""

from services.customers.task_access import openable_tasks
from services.customers.task_payloads import ROW_RELATED, task_row

from .states import open_tasks, state_q

LIMIT = 200


def build(reader, assignee_id, state, *, today):
    tasks = open_tasks().filter(assignee_id=assignee_id).filter(state_q(state, today))
    # SOC2:AUTH-02 only tasks the reader reads, on records they may open
    rows = openable_tasks(reader, tasks).select_related(*ROW_RELATED).order_by("due_date", "id")
    return {"tasks": [task_row(task) for task in rows[:LIMIT]]}
