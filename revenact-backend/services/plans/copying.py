"""A template and a plan, one into the other. `copy_template` dates a
template's milestones and tasks from a start date and names their people:
the shape `starting.start_plan` takes. `template_steps` is the reverse: a
plan read back as a template's milestones."""

from collections import defaultdict
from datetime import timedelta

from services.customers.personal import visible_tasks

from .access import record_of
from .models import MAX_OFFSET

RECORD_OWNER, PLAN_OWNER = "record_owner", "plan_owner"


def copy_template(template, *, start_date, record_owner, plan_owner):
    """`[{name, due_date, tasks: [{title, priority, due_date, assignee}]}]`."""
    people = {"record_owner": record_owner, "plan_owner": plan_owner}

    def day(offset):
        return start_date + timedelta(days=offset)

    return [
        {
            "name": milestone["name"],
            "due_date": day(milestone["offset_days"]),
            "tasks": [
                {
                    "title": task["title"],
                    "priority": task["priority"],
                    "due_date": day(task["offset_days"]),
                    "assignee": people[task["assignee_role"]],
                }
                for task in milestone["tasks"]
            ],
        }
        for milestone in template.milestones
    ]


def template_steps(plan, viewer):
    """The plan read back as a template's milestones: every milestone in
    order, with the tasks `viewer` may read. Offsets are days from the
    plan's start, clamped to 0-365. A task assigned to the record's owner is
    `record_owner`; every other is `plan_owner`. Needs `customer`/`account`
    loaded."""
    record_owner_id = record_of(plan).owner_id

    def offset(day):
        return min(max((day - plan.start_date).days, 0), MAX_OFFSET)

    tasks = defaultdict(list)
    # SOC2:AUTH-02 only tasks the caller may read become a template's steps
    for task in visible_tasks(viewer, plan.tasks.all()).order_by("due_date", "pk"):
        tasks[task.milestone_id].append(task)
    return [
        {
            "name": milestone.name,
            "offset_days": offset(milestone.due_date),
            "tasks": [
                {
                    "title": task.title,
                    "priority": task.priority,
                    "offset_days": offset(task.due_date),
                    "assignee_role": RECORD_OWNER
                    if task.assignee_id is not None and task.assignee_id == record_owner_id
                    else PLAN_OWNER,
                }
                for task in tasks[milestone.pk]
            ],
        }
        for milestone in plan.milestones.order_by("position", "pk")
    ]
