"""Plans and templates as the API returns them (spec §4). Every count of a
plan's tasks is over the tasks the reader can see; the rest are
`hidden_tasks`."""

from collections import defaultdict

from django.db.models import Count, Min, Q
from django.utils import timezone

from services.agents.made_by import made_by
from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.organizations.rows import iso, person
from services.rules.access import readable_rules

from .access import editor_ids
from .models import OPEN, Milestone, Plan
from .validation import task_count

COMPLETED = Task.Status.COMPLETED


def length_days(milestones):
    """A template's length: its largest offset, over milestones and tasks."""
    offsets = [m["offset_days"] for m in milestones]
    offsets += [t["offset_days"] for m in milestones for t in m["tasks"]]
    return max(offsets, default=0)


def template_payload(template, viewer):
    """Needs `owner` and `agent_action__decided_by` loaded and `shared_with` prefetched."""
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = sorted(
        (u for u in template.shared_with.all() if u.organisation_id == viewer.organisation_id),
        key=lambda user: (user.name, user.pk),
    )
    milestones = template.milestones
    return {
        "id": template.pk,
        "name": template.name,
        "kind": template.kind,
        "description": template.description,
        "is_builtin": template.is_builtin,
        "is_owner": template.owner_id is not None and template.owner_id == viewer.pk,
        "owner": person(template.owner),
        "sharing": template.sharing,
        "shared_with": [person(user) for user in teammates],
        "milestones": milestones,
        "milestone_count": len(milestones),
        "task_count": task_count(milestones),
        "length_days": length_days(milestones),
        "updated_at": iso(template.updated_at),
        "made_by": made_by(template),
    }


def record_ref(plan):
    """Needs `customer` and `account` loaded."""
    if plan.customer_id is not None:
        return {"kind": "organization", "id": plan.customer_id, "name": plan.customer.name}
    return {"kind": "account", "id": plan.account_id, "name": plan.account.name}


def started_by_agents(plans):
    """{agent action id: agent} for the plans an agent started, one query,
    and none when no plan here was."""
    from services.metrics.models import AgentAction

    ids = {plan.agent_action_id for plan in plans if plan.agent_action_id is not None}
    if not ids:
        return {}
    return dict(AgentAction.objects.filter(pk__in=ids).values_list("pk", "agent"))


def _row(
    plan,
    *,
    editable,
    milestones_done,
    milestones_total,
    tasks_done,
    tasks_total,
    next_due,
    today,
    started_by_agent=None,
):
    is_open = plan.status in OPEN
    return {
        "id": plan.pk,
        "name": plan.name,
        "kind": plan.kind,
        "status": plan.status,
        "record": record_ref(plan),
        "owner": person(plan.owner),
        "start_date": iso(plan.start_date),
        "target_date": iso(plan.target_date),
        "milestones_done": milestones_done,
        "milestones_total": milestones_total,
        "tasks_done": tasks_done,
        "tasks_total": tasks_total,
        "next_due": iso(next_due),
        "is_overdue": is_open and next_due is not None and next_due < today,
        "can_edit": editable,
        "pending_tasks": len(plan.draft_tasks) if plan.status == Plan.Status.DRAFT else 0,
        "started_by_agent": started_by_agent,
    }


def plan_rows(plans, viewer, *, today=None):
    """The list's, the board's and a record section's rows, in a fixed number
    of queries whatever their number: the plans, their milestones' counts,
    the visible tasks' counts. Needs `customer`, `account` and `owner` loaded."""
    plans = list(plans)
    if not plans:
        return []
    today = today or timezone.localdate()
    ids = [plan.pk for plan in plans]
    milestone_rows = (
        Milestone.objects.filter(plan_id__in=ids)
        .order_by()
        .values("plan_id")
        .annotate(
            total=Count("id"),
            done=Count("id", filter=Q(done_at__isnull=False)),
            next_due=Min("due_date", filter=Q(done_at__isnull=True)),
        )
    )
    milestones = {row["plan_id"]: row for row in milestone_rows}
    # SOC2:AUTH-02 progress counts only the tasks the viewer may read
    task_rows = (
        visible_tasks(viewer, Task.objects.filter(plan_id__in=ids))
        .order_by()
        .values("plan_id")
        .annotate(total=Count("id"), done=Count("id", filter=Q(status=COMPLETED)))
    )
    tasks = {row["plan_id"]: row for row in task_rows}
    editors = editor_ids(viewer)
    agents = started_by_agents(plans)
    rows = []
    for plan in plans:
        found = milestones.get(plan.pk, {"total": 0, "done": 0, "next_due": None})
        seen = tasks.get(plan.pk, {"total": 0, "done": 0})
        rows.append(
            _row(
                plan,
                editable=plan.owner_id in editors,
                milestones_done=found["done"],
                milestones_total=found["total"],
                tasks_done=seen["done"],
                tasks_total=seen["total"],
                next_due=found["next_due"],
                today=today,
                started_by_agent=agents.get(plan.agent_action_id),
            )
        )
    return rows


def started_by_rule_ref(plan, viewer):
    """The rule that started the plan: by name for someone who may read the
    rule, else only that a rule did. None when a person started it."""
    rule = plan.started_by_rule
    if rule is None:
        return None
    # SOC2:AUTH-02 a rule's name is its owner's words, shown only to its readers
    if readable_rules(viewer).filter(pk=rule.pk).exists():
        return {"id": rule.pk, "name": rule.name}
    return {"id": None, "name": "a rule"}


def _task(task, viewer, editable):
    return {
        "id": task.pk,
        "title": task.title,
        "priority": task.priority,
        "status": task.status,
        "due_date": iso(task.due_date),
        "assignee": person(task.assignee),
        "can_check": editable or viewer.pk in (task.assignee_id, task.created_by_id),
    }


def plan_payload(plan, viewer, *, today=None):
    """The plan page. Needs what `access.get_visible_plan` loads."""
    today = today or timezone.localdate()
    editable = plan.owner_id in editor_ids(viewer)
    is_open = plan.status in OPEN
    milestones = list(plan.milestones.order_by("position", "pk"))
    # SOC2:AUTH-02 a plan's task is shown only to someone who may read it; the rest are
    # counted, never loaded — `totals` below is one aggregate over every task on the plan.
    visible = list(
        visible_tasks(viewer, plan.tasks.select_related("assignee")).order_by("due_date", "pk")
    )
    shown = defaultdict(list)
    for task in visible:
        shown[task.milestone_id].append(task)
    totals = (
        plan.tasks.order_by()
        .values("milestone_id")
        .annotate(total=Count("id"), done=Count("id", filter=Q(status=COMPLETED)))
    )
    by_milestone = {row["milestone_id"]: row for row in totals}
    hidden = {
        milestone_id: row["total"] - len(shown.get(milestone_id, []))
        for milestone_id, row in by_milestone.items()
    }
    tasks_all = sum(row["total"] for row in by_milestone.values())
    any_completed = any(row["done"] for row in by_milestone.values())
    body = _row(
        plan,
        editable=editable,
        milestones_done=sum(m.done_at is not None for m in milestones),
        milestones_total=len(milestones),
        tasks_done=sum(task.status == COMPLETED for task in visible),
        tasks_total=len(visible),
        next_due=min((m.due_date for m in milestones if m.done_at is None), default=None),
        today=today,
        started_by_agent=started_by_agents([plan]).get(plan.agent_action_id),
    )
    body.update(
        {
            "template": None
            if plan.template is None
            else {"id": plan.template_id, "name": plan.template.name},
            "started_by": person(plan.started_by),
            "started_by_rule": started_by_rule_ref(plan, viewer),
            "status_set_by": plan.status_set_by,
            "done_at": iso(plan.done_at),
            "created_at": iso(plan.created_at),
            "milestones": [
                {
                    "id": m.pk,
                    "name": m.name,
                    "position": m.position,
                    "due_date": iso(m.due_date),
                    "done_at": iso(m.done_at),
                    "is_overdue": is_open and m.done_at is None and m.due_date < today,
                    "tasks": [_task(task, viewer, editable) for task in shown[m.pk]],
                    "hidden_tasks": hidden.get(m.pk, 0),
                    "tasks_done": sum(task.status == COMPLETED for task in shown[m.pk]),
                    "tasks_total": len(shown[m.pk]),
                }
                for m in milestones
            ],
            "hidden_tasks": tasks_all - len(visible),
            # Counts every task, visible or not (Decision 6): an editor who cannot see a
            # private task can tell when it was completed, because this turns false. The
            # DELETE itself would refuse anyway, so this is not a new leak.
            "can_delete": editable and not any_completed,
        }
    )
    return body
