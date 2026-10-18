"""Personal records on a customer: notes and tasks, like mail, are the writer's;
tickets are their department's.

Readable by the author and their management chain — never by peers or
seniors — in the Notes tab and in the Copilot alike. Rows with no author
(seeded, or logged before authorship existed) stay visible as before.
"""

from services.accounts.hierarchy import chain_visible_q


def visible_notes(user, queryset):
    # SOC2:AUTH-02 object-level rule for personal notes
    return queryset.filter(chain_visible_q(user, "author"))


def visible_tasks(user, queryset):
    """A task is the creator's and the assignee's: either of them, or anyone
    above either, may read it. A reader with view_all_accounts or the
    Leadership function reads every task (owner decision 2026-10-07). A task
    with neither creator nor assignee (seeded) is everyone's. Callers always
    add the record rule: nobody reads a task on a record they cannot open.

    A to-do (no record) is never read through this rule, not even by its
    creator: only `task_access.readable_tasks` reads it, for its creator
    alone (Work in one place §3). So no record list, Brain, Copilot, agent
    or export that reads tasks through here can show one."""
    from django.db.models import Q

    from services.accounts.hierarchy import subtree_ids
    from services.accounts.models import User

    from .scoping import sees_everything
    from .task_access import on_record_q

    # SOC2:AUTH-02 a to-do is its creator's alone, read only through task_access.readable_tasks
    queryset = queryset.filter(on_record_q())
    # SOC2:AUTH-02 view-all and Leadership read every task; the record rule still applies
    if sees_everything(user) or getattr(user, "function", None) == User.Function.LEADERSHIP:
        return queryset
    mine = {user.id, *subtree_ids(user)}
    # SOC2:AUTH-02 object-level rule for personal tasks
    return queryset.filter(
        Q(created_by__isnull=True, assignee__isnull=True)
        | Q(created_by_id__in=mine)
        | Q(assignee_id__in=mine)
    )


def visible_tickets(user, queryset):
    """Tickets are read department-wise: the department a connector belongs
    to sees what came through it. Leadership sees every department. A ticket
    with no department (raised here, or from a connector with none) is
    everyone's."""
    from django.db.models import Q

    from services.accounts.models import User

    if user.function == User.Function.LEADERSHIP:
        return queryset
    # SOC2:AUTH-02 object-level rule for departmental tickets
    return queryset.filter(Q(department="") | Q(department=user.function))


def visible_conversations(user, queryset):
    """Slack conversations are read like the tickets of their connection
    (Slack escalations D1, SE1-15): their department's people and Leadership;
    a conversation with no department is everyone's."""
    # SOC2:AUTH-02 object-level rule for departmental Slack conversations
    return visible_tickets(user, queryset)


def ticket_snapshot(*querysets):
    """`{account_ids, departments}` of the tickets in these querysets — ids
    and department codes only, fixed on a Copilot reply whose figures
    counted them (`copilot.Message.grounded_tickets`)."""
    accounts, departments = set(), set()
    for rows in querysets:
        for account_id, department in rows.values_list("account_id", "department"):
            if account_id is not None:
                accounts.add(account_id)
            departments.add(department)
    return {"account_ids": sorted(accounts), "departments": sorted(departments)}


def reads_every_ticket_department(user):
    """`visible_tickets`' exemption: Leadership only. Holding
    view-all-accounts does not grant it."""
    from services.accounts.models import User

    return user.function == User.Function.LEADERSHIP


def ticket_departments_readable(user, departments):
    """Whether `user` may read tickets in every one of these departments —
    `visible_tickets`' own rule: Leadership reads all, anyone else their own
    department's and the undeparted."""
    if reads_every_ticket_department(user):
        return True
    return all(d in ("", user.function) for d in departments)


def readable_evidence_q(viewer, *, email="email", ticket="ticket", call="call"):
    """Rows that *copy* a record's text — a feature request's evidence, an
    anomaly's — read under the rule the record itself lives by.

    Any model with a `kind` and copies of `mailbox_owner` and `department`
    can use this: mail is its mailbox owner's alone (2026-10-17), a ticket
    is its department's, and a call belongs to no one person. Kept here,
    beside the rules it mirrors, because a second copy of a security rule
    is a second place for it to go wrong — and two apps already need it.
    """
    from django.db.models import Q

    from services.accounts.models import User
    from services.mail.visibility import own_mail_q

    mail = Q(kind=email) & own_mail_q(viewer)
    if getattr(viewer, "function", None) == User.Function.LEADERSHIP:
        tickets = Q(kind=ticket)
    else:
        tickets = Q(kind=ticket) & (
            Q(department="") | Q(department=getattr(viewer, "function", "") or "")
        )
    return mail | tickets | Q(kind=call)
