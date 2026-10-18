"""The feed's tasks and to-dos (Work in one place, spec §4.1): open tasks
with a record assigned to the reader that they may read (`task`, as
Today did), and the reader's own to-dos (`todo`), in six groups by due
date. One source, so the two interleave in date order and fail together.

A Blocked task is only in `blocked`, whatever its date (`work.states`).
Tasks on records the reader can no longer open are counted in `hidden`."""

from datetime import date, timedelta

from django.db.models import Case, Count, DateField, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce

from services.customers.models import Task
from services.customers.task_access import is_todo, on_record_q, openable_tasks, record_of, todo_q
from services.customers.task_payloads import ROW_RELATED, task_row

from .feed_shape import TASK, TASK_GROUPS, TODO, after_q, item, record_ref
from .states import open_tasks

WEEK = timedelta(days=7)
#: Where a task with no date sorts: after every dated one.
NO_DATE = date.max
ORDER = ("due_key", "prio", "created_at", "id")
PRIORITY_RANK = Case(
    When(priority=Task.Priority.HIGH, then=Value(0)),
    When(priority=Task.Priority.MEDIUM, then=Value(1)),
    default=Value(2),
    output_field=IntegerField(),
)
FROM_SOURCE = {
    Task.Source.AGENT: {"type": "agent", "label": "AI agent"},
    Task.Source.RULE: {"type": "rule", "label": "A rule"},
    Task.Source.RECOMMENDATION: {"type": "revenact", "label": "Revenact"},
}
REVENACT = {"type": "revenact", "label": "Revenact"}
#: The line `connectors.slack_handover` writes into a handed task's description.
HANDED_LINE = "Sent from Slack by "


def group_q(group, today):
    blocked = Q(status=Task.Status.BLOCKED)
    if group == "blocked":
        return blocked
    dated = {
        "overdue": Q(due_date__lt=today),
        "today": Q(due_date=today),
        "week": Q(due_date__gt=today, due_date__lte=today + WEEK),
        "later": Q(due_date__gt=today + WEEK),
        "no_date": Q(due_date__isnull=True),
    }
    return ~blocked & dated[group]


def group_of(task, today):
    """`group_q` for one task in hand."""
    if task.status == Task.Status.BLOCKED:
        return "blocked"
    if task.due_date is None:
        return "no_date"
    if task.due_date < today:
        return "overdue"
    if task.due_date == today:
        return "today"
    if task.due_date <= today + WEEK:
        return "week"
    return "later"


def source_of(task):
    if task.source in FROM_SOURCE:
        return FROM_SOURCE[task.source]
    if task.created_by_id is None:
        return REVENACT
    return {"type": "person", "label": task.created_by.name}


def from_emails(tasks):
    """{task pk: {by, undo_until}} for tasks the email agent made from
    someone's email, still undoable (2026-10-17). One query for a page."""
    from datetime import timedelta

    from services.emailagent.models import EmailIntent

    agent_made = [t.pk for t in tasks if t.source == Task.Source.AGENT]
    if not agent_made:
        return {}
    rows = EmailIntent.objects.filter(
        task_id__in=agent_made, outcome=EmailIntent.Outcome.TASK_CREATED
    ).select_related("sender", "task")
    return {
        row.task_id: {
            "by": row.sender.name if row.sender_id else "",
            "undo_until": row.task.created_at + timedelta(hours=24),
        }
        for row in rows
    }


def from_slack(tasks, reader):
    """{task pk: {by, permalink}} for tasks a colleague handed `reader` from
    Slack (Slack handover, 2026-10-18), from the reader's own copy of the
    message. One query for a page."""
    from .models import SlackSuggestion

    # Only a task whose description carries the handover line can be one: no
    # query for a page without any (the feed's query ceiling).
    ids = [t.pk for t in tasks if HANDED_LINE in (t.description or "")]
    if not ids:
        return {}
    # SOC2:AUTH-02 only the reader's own copy of a message handed to them
    rows = SlackSuggestion.objects.filter(
        task_id__in=ids,
        owner_id=reader.pk,
        organisation_id=reader.organisation_id,
        handed_from__isnull=False,
    ).select_related("handed_from")
    return {
        row.task_id: {"by": row.handed_from.name, "permalink": row.permalink or None}
        for row in rows
    }


def task_item(task, from_email=None, slack=None):
    """The FeedItem for a task the reader reads (Every task on the desk is
    assigned to the reader, who may always move its status: contract
    Decision 12). `from_email` names the colleague whose email it came from;
    `slack` the colleague who handed it over from Slack."""
    todo = is_todo(task)
    detail = task_row(task)
    if from_email:
        detail = {**detail, "from_email": from_email}
    if slack:
        detail = {**detail, "from_slack": slack}
    source = source_of(task)
    if slack:
        source = {"type": "slack", "label": f"From Slack by {slack['by']}"}
    elif from_email:
        source = {"type": "email", "label": f"From an email by {from_email['by']}"}
    return item(
        key=f"task:{task.pk}",
        kind=TODO if todo else TASK,
        pk=task.pk,
        title=task.title,
        record=None if todo else record_ref(record_of(task)),
        source=source,
        at=task.created_at,
        due_date=task.due_date,
        priority=task.priority,
        private=todo,
        actions=["done", "open"],
        detail=detail,
    )


class Tasks:
    KINDS = (TASK, TODO)

    def __init__(self, reader, today, kinds):
        self.reader, self.today = reader, today
        self.asked = [kind for kind in self.KINDS if kind in kinds]
        self.assigned = open_tasks().filter(assignee_id=reader.pk).filter(on_record_q())
        parts = []
        if TASK in kinds:
            # SOC2:AUTH-02 the twice-filter: the task's own rule, on a record the reader may open
            # assignee_id on the outer query too, so Postgres can use its index (no seq scan).
            parts.append(
                Q(
                    assignee_id=reader.pk,
                    id__in=openable_tasks(reader, self.assigned).values("id"),
                )
            )
        if TODO in kinds:
            # SOC2:AUTH-02 a to-do is its creator's alone
            parts.append(todo_q(reader))
        wanted = parts[0]
        for part in parts[1:]:
            wanted |= part
        self.rows = open_tasks().filter(wanted)

    def counts(self):
        """Every group's full total, in one query."""
        return self.rows.aggregate(
            **{key: Count("id", filter=group_q(key, self.today)) for key in TASK_GROUPS}
        )

    def hidden(self):
        """Open tasks assigned to the reader on records they can no longer open."""
        if TASK not in self.asked:
            return 0
        return self.assigned.count() - openable_tasks(self.reader, self.assigned).count()

    def tasks(self, group, after, limit):
        rows = (
            self.rows.filter(group_q(group, self.today))
            .annotate(
                due_key=Coalesce("due_date", Value(NO_DATE), output_field=DateField()),
                prio=PRIORITY_RANK,
            )
            .select_related(*ROW_RELATED, "created_by")
        )
        if after is not None:
            rows = rows.filter(after_q(ORDER, after))
        return list(rows.order_by(*ORDER)[:limit])

    def page(self, group, after, limit):
        tasks = list(self.tasks(group, after, limit))
        emails = from_emails(tasks)
        slack = from_slack(tasks, self.reader)
        return [
            (
                (task.due_key, task.prio, task.created_at, task.pk),
                task_item(task, emails.get(task.pk), slack.get(task.pk)),
            )
            for task in tasks
        ]
