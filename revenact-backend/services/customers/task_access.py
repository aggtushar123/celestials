"""Who may read, change and be given a task (Work round, spec §1.2, §4).

**Read** is the twice-filter: the task's own rule (`personal.visible_tasks`:
its creator, its assignee, anyone above either, or any reader with
`view_all_accounts` or the Leadership function; a task with neither creator
nor assignee is everyone's) AND a record the reader may open. Both are
`id IN` subqueries, never a join made unique with DISTINCT (Postgres 16; see
scoping.visible_customers).

**Change** is read, for an ordinary task: §1.2's edit rule (creator,
assignee, anyone above either, view-all) is exactly the read rule, so
whoever reads it may change and reassign it. A plan's task keeps the plan's
rules (`plans.access`): its status is moved by its assignee, its creator or
the plan's editors (`can_check`, the plan task route's rule); its other
fields are the plan's editors' while the plan is open. Any other reader
(view-all or Leadership included) may change nothing on it.

**Given**: an active member of the workspace who may open the task's
record, else 400 `ASSIGNEE_CANNOT_OPEN`.

**To-dos** (Work in one place §3): a task with no record is its creator's
alone. `visible_tasks` never returns one; `readable_tasks` is
`openable_tasks` plus the reader's own to-dos, and is what the task panel,
the feed and the digest read."""

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from services.accounts.models import User

from .models import Customer, Task
from .personal import visible_tasks
from .scoping import can_open, visible_accounts, visible_customers

ASSIGNEE_CANNOT_OPEN = "ASSIGNEE_CANNOT_OPEN"
SAY_WHY_BLOCKED = "Say what it's blocked on."
#: Every field `PATCH /tasks/<id>/` writes, in the API's names.
FIELDS = ("title", "description", "status", "due_date", "priority", "assignee")
STATUS_ONLY = ("status",)
TODO_ONLY_YOURS = "A to-do without a record can only be yours."
RECORD_YOU_CAN_OPEN = "Choose an organisation or account you can open."
ONE_RECORD = "Choose an organisation or an account, not both."
RECORD_FIXED = "A task's organisation or account can't be changed."


class AssigneeCannotOpen(ValidationError):
    """400 `{"code": "ASSIGNEE_CANNOT_OPEN", "detail": ...}`. Raise it from a
    view, never inside a serializer's `validate`: DRF would wrap each string
    in a list there."""

    def __init__(self, record):
        noun = "organisation" if isinstance(record, Customer) else "account"
        super().__init__(
            {"code": ASSIGNEE_CANNOT_OPEN, "detail": f"That person can't open this {noun}."}
        )


def record_of(task):
    return task.customer if task.customer_id is not None else task.account


def openable_tasks(user, queryset):
    """`queryset` cut to the tasks `user` may read."""
    # SOC2:AUTH-02 the twice-filter: the task's own rule, on a record the reader may open
    return visible_tasks(user, queryset).filter(
        Q(customer_id__in=visible_customers(user).values("id"))
        | Q(account_id__in=visible_accounts(user).values("id"))
    )


def todo_q(user):
    """`user`'s own to-dos: tasks with no record that they made."""
    return Q(customer__isnull=True, account__isnull=True, created_by_id=user.pk)


def on_record_q():
    """Tasks with a record (an organisation's or an account's): every task
    but a to-do (Work in one place §3)."""
    return Q(customer__isnull=False) | Q(account__isnull=False)


def is_todo(task):
    """Whether `task` is a to-do: a task with no record, its creator's alone."""
    return task.customer_id is None and task.account_id is None


def readable_tasks(user, queryset):
    """`queryset` cut to the tasks `user` may read: the twice-filter, plus
    their own to-dos. `id IN` subqueries, no DISTINCT (Postgres 16)."""
    openable = openable_tasks(user, Task.objects.all()).values("id")
    # SOC2:AUTH-02 a to-do is its creator's alone; every other task passes the twice-filter
    return queryset.filter(Q(id__in=openable) | todo_q(user))


def assignee_for(organisation_id, pk, record):
    """The member `pk` of the workspace, active for work (`work.standing`:
    an active user with an active membership), who may open `record`."""
    from services.work.standing import working_q

    user = None
    if isinstance(pk, int) and not isinstance(pk, bool):
        # SOC2:AUTH-02 a suspended or revoked member is refused like an inactive one
        user = User.objects.filter(
            working_q(organisation_id), pk=pk, organisation_id=organisation_id
        ).first()
    # SOC2:AUTH-02 a task is given only to someone who can open its record
    if user is None or not can_open(user, record):
        raise AssigneeCannotOpen(record)
    return user


def record_for(user, customer_id, account_id):
    """The organisation or account a body names, which `user` must be able
    to open; None when it names neither. A missing record and one the caller
    cannot open read the same."""
    if customer_id is not None and account_id is not None:
        raise ValidationError({"record": [ONE_RECORD]})
    if customer_id is not None:
        record = visible_customers(user).filter(pk=customer_id).first()
    elif account_id is not None:
        record = visible_accounts(user).filter(pk=account_id).first()
    else:
        return None
    # SOC2:AUTH-02 a task goes only on a record its maker may open
    if record is None:
        raise ValidationError({"record": [RECORD_YOU_CAN_OPEN]})
    return record


def editable_fields(user, task):
    """The fields `user` may change on a task they can read (see the module).
    A to-do also takes a record (attaching one); no other task does."""
    if is_todo(task):
        return [*FIELDS, "record"]
    if task.plan_id is None:
        return list(FIELDS)
    from services.plans.access import can_check, can_edit
    from services.plans.models import OPEN

    # SOC2:AUTH-02 a plan's task keeps the plan's rules: status for whoever
    # may tick it there, the rest for the plan's editors while it is open
    if task.plan.status in OPEN and can_edit(user, task.plan):
        return list(FIELDS)
    if can_check(user, task.plan, task):
        return list(STATUS_ONLY)
    return []
