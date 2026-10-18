"""Tracking that pushes (Work round §3.2): once a day, on the workspace's
working days, each open overdue task (past due, not Blocked, with an
assignee) reminds its assignee at most once a day, in the workspace's own date
(`task_overdue`, a
`nudged` event) and, once it is `escalate_after_days` working days overdue,
tells their manager once (`task_escalated`, an `escalated` event). An
assignee no longer active for work (deactivated, or their membership
suspended or revoked: `standing`) is not reminded and escalates straight
away.

Once only, under overlap: each nudge and escalation first claims the task
with a conditional UPDATE, and only a claim that changed a row notifies.
Reassigning, re-dating or re-opening re-arms the escalation
(customers.task_changes.record_changes).

A notice names the record only to a recipient who may open it (spec §4).

A to-do (no record) is never on a workspace's books (`workspace_tasks`), and a
task with no date is never overdue: neither is tracked."""

import logging
from dataclasses import dataclass, field
from datetime import datetime, time

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from services.customers.models import Account, Customer, Task, TaskEvent
from services.customers.scoping import can_open
from services.customers.task_access import record_of
from services.customers.task_changes import link, person

from .clock import local_now, working, working_days_between, zone
from .prefs import settings_for
from .standing import working_ids
from .states import open_tasks, overdue_q

logger = logging.getLogger(__name__)


@dataclass
class TrackResult:
    nudged: int = 0
    escalated: int = 0
    #: True when today is not one of the workspace's working days.
    quiet: bool = False
    failed: list = field(default_factory=list)

    def add(self, other):
        self.nudged += other.nudged
        self.escalated += other.escalated


def plural(count, word):
    return f"{count} {word}" + ("" if count == 1 else "s")


def _noun(record):
    return "an organisation" if isinstance(record, Customer) else "an account"


def overdue_message(recipient, task, days):
    record = record_of(task)
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if can_open(recipient, record):
        return f"“{task.title}” on {record.name} is {plural(days, 'day')} overdue."[:500]
    return f"A task on {_noun(record)} you can't open is overdue."


def escalated_message(recipient, task, late):
    record = record_of(task)
    name = task.assignee.name
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if can_open(recipient, record):
        return (
            f"“{task.title}” on {record.name}, assigned to {name}, "
            f"is {plural(late, 'working day')} overdue."
        )[:500]
    return f"A task assigned to {name} on {_noun(record)} you can't open is overdue."[:500]


def workspace_tasks(organisation):
    """Every task on the workspace's organisations and accounts (id IN, no join)."""
    customers = Customer.objects.filter(organisation=organisation).values("id")
    return Task.objects.filter(
        Q(customer_id__in=customers)
        | Q(
            account_id__in=Account.customers.through.objects.filter(
                customer_id__in=customers
            ).values("account_id")
        )
    )


def _owner(organisation, active_ids):
    from services.identity.ownership import owner_membership

    membership = owner_membership(organisation)
    if membership is None or membership.user_id not in active_ids:
        return None
    return membership.user


def _above(task, owner, active_ids):
    """Who an escalation goes to: the assignee's manager when active for work
    in this workspace (`standing`), else the workspace's owner; None when
    that is nobody or the assignee themself."""
    manager = task.assignee.reports_to
    if manager is not None and manager.pk in active_ids:
        return manager
    if owner is not None and owner.pk != task.assignee_id:
        return owner
    return None


def _notify(**kwargs):
    from services.notifications.realtime import notify

    return notify(actor=None, push_on_commit=True, **kwargs)


def _nudge(task, today, now, day_start):
    from services.notifications.models import Notification

    with transaction.atomic():
        claimed = (
            Task.objects.filter(pk=task.pk)
            .filter(Q(last_nudged_at__isnull=True) | Q(last_nudged_at__lt=day_start))
            .update(last_nudged_at=now)
        )
        if not claimed:
            return False
        days = (today - task.due_date).days
        _notify(
            recipient=task.assignee,
            kind=Notification.Kind.TASK_OVERDUE,
            message=overdue_message(task.assignee, task, days),
            link=link(task),
        )
        TaskEvent.objects.create(
            task=task,
            actor=None,
            kind=TaskEvent.Kind.NUDGED,
            data={"days_overdue": days, "to": person(task.assignee)},
        )
    return True


def _escalate(task, late, now, owner, active_ids):
    from services.notifications.models import Notification

    with transaction.atomic():
        claimed = Task.objects.filter(pk=task.pk, escalated_at__isnull=True).update(
            escalated_at=now
        )
        if not claimed:
            return False
        above = _above(task, owner, active_ids)
        if above is None:
            return False
        _notify(
            recipient=above,
            kind=Notification.Kind.TASK_ESCALATED,
            message=escalated_message(above, task, late),
            link=link(task),
        )
        TaskEvent.objects.create(
            task=task,
            actor=None,
            kind=TaskEvent.Kind.ESCALATED,
            data={"working_days_overdue": late, "to": person(above)},
        )
    return True


def run(organisation, *, now=None):
    """One pass over `organisation`. See the module."""
    now = now or timezone.now()
    prefs = settings_for(organisation)
    today = local_now(organisation, now).date()
    days = working(prefs)
    result = TrackResult()
    if today.weekday() not in days:
        result.quiet = True
        return result
    active_ids = working_ids(organisation)
    owner = _owner(organisation, active_ids)
    day_start = datetime.combine(today, time.min, tzinfo=zone(prefs))
    overdue = (
        open_tasks(workspace_tasks(organisation))
        .filter(overdue_q(today), assignee__isnull=False, due_date__isnull=False)
        .select_related("assignee", "assignee__reports_to", "customer", "account")
        .order_by("due_date", "id")
    )
    for task in overdue:
        try:
            _track(task, today, now, day_start, days, prefs, owner, active_ids, result)
        except Exception as exc:  # noqa: BLE001 - one task never stops the rest
            logger.warning("work tracking: task %s failed: %s", task.pk, type(exc).__name__)
            result.failed.append(f"task {task.pk}")
    return result


def _track(task, today, now, day_start, days, prefs, owner, active_ids, result):
    # A suspended or revoked assignee is treated as a deactivated one.
    active = task.assignee_id in active_ids
    if active and _nudge(task, today, now, day_start):
        result.nudged += 1
    if task.escalated_at is not None:
        return
    late = working_days_between(task.due_date, today, days)
    if (not active or late >= prefs.escalate_after_days) and _escalate(
        task, late, now, owner, active_ids
    ):
        result.escalated += 1


def run_all(organisation=None, *, now=None):
    """Every workspace with organisations (or just `organisation`), each on
    its own: one failing never stops the next."""
    from services.accounts.models import Organisation

    if organisation is not None:
        workspaces = [organisation]
    else:
        # SOC2:AUTH-02 a suspended or archived workspace is not nudged
        workspaces = Organisation.objects.filter(
            id__in=Customer.objects.values("organisation_id"),
            status=Organisation.Status.ACTIVE,
        ).order_by("id")
    total = TrackResult()
    for workspace in workspaces:
        try:
            total.add(run(workspace, now=now))
        except Exception as exc:  # noqa: BLE001 - reported, never fatal
            logger.warning(
                "work tracking: organisation %s failed: %s", workspace.pk, type(exc).__name__
            )
            total.failed.append(f"organisation {workspace.pk}")
    return total
