"""Team (Work round §1.4): for each person in the reader's scope (Brain's Me,
My team, Company), their open, overdue and blocked counts and oldest overdue
date, over the open tasks the reader may read. The scope's other open tasks
are `hidden`: counted, never named.

The scope chooses whose tasks; the reader's own rights choose which are
counted (never the scope's actor: Company's is the whole organisation). A
view-all or Leadership reader reads every task, so their `hidden` is only
tasks on records they cannot open. One GROUP BY over `id IN` subqueries, no
DISTINCT."""

from django.db.models import Count, Min, Q

from services.accounts.models import User
from services.customers.models import Task
from services.customers.task_access import on_record_q, openable_tasks

from .states import open_tasks, overdue_q


def _members(reader, scope):
    members = User.objects.filter(organisation_id=reader.organisation_id)
    if scope.is_company:
        return members
    return members.filter(id__in=sorted(scope.owner_ids))


def build(reader, scope, *, today):
    members = _members(reader, scope)
    # SOC2:AUTH-02 a to-do is its creator's alone: never counted here, not even as hidden
    waiting = open_tasks().filter(assignee_id__in=members.values("id")).filter(on_record_q())
    # SOC2:AUTH-02 counted only over tasks the reader reads, on records they may open
    readable = openable_tasks(reader, waiting)
    late = overdue_q(today)
    counted = {
        row["assignee_id"]: row
        for row in readable.order_by()
        .values("assignee_id")
        .annotate(
            open=Count("id"),
            overdue=Count("id", filter=late),
            blocked=Count("id", filter=Q(status=Task.Status.BLOCKED)),
            oldest_overdue=Min("due_date", filter=late),
        )
    }
    people = []
    for member in members.order_by("name", "id"):
        row = counted.get(member.pk)
        if row is None and not member.is_active:
            continue
        oldest = row["oldest_overdue"] if row else None
        people.append(
            {
                "person": {"id": member.pk, "name": member.name, "active": member.is_active},
                "open": row["open"] if row else 0,
                "overdue": row["overdue"] if row else 0,
                "blocked": row["blocked"] if row else 0,
                "oldest_overdue": None if oldest is None else oldest.isoformat(),
            }
        )
    people.sort(
        key=lambda p: (-p["overdue"], -p["open"], p["person"]["name"].lower(), p["person"]["id"])
    )
    return {
        "scope": scope.key,
        "today": today.isoformat(),
        "people": people,
        "hidden": waiting.count() - sum(p["open"] for p in people),
    }
