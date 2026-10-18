"""The open-task states every Work list and count shares, so Today, Team and
the drill-down never disagree about what "overdue" means: past due and not
Blocked (a Blocked task waits on its reason, not its date)."""

from django.db.models import Q

from services.customers.models import Task

OPEN, OVERDUE, BLOCKED = "open", "overdue", "blocked"
STATES = (OPEN, OVERDUE, BLOCKED)


def open_tasks(queryset=None):
    rows = Task.objects.all() if queryset is None else queryset
    return rows.exclude(status=Task.Status.COMPLETED)


def overdue_q(today):
    return Q(due_date__lt=today) & ~Q(status=Task.Status.BLOCKED)


def state_q(state, today):
    if state == OVERDUE:
        return overdue_q(today)
    if state == BLOCKED:
        return Q(status=Task.Status.BLOCKED)
    return Q()
