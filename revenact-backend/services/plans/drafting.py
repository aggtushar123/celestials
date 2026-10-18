"""A plan an agent started goes back to Draft on undo, and a Draft starts
again from the tasks it kept (Agents round §2, owner decision 3).

`return_to_draft` keeps the plan, its milestones and its history, writes
its tasks into `draft_tasks` and deletes them. `start_from_draft` makes
them again, every date moved by however long the plan sat in Draft.

Locks: the caller of `return_to_draft` holds the plan's row lock (the
agent's undo locks the action's row first, then the plan's).
`start_from_draft` takes the workspace's, the record's, then the plan's,
in `starting.start_plan`'s order."""

from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404

from core import audit
from services.accounts.models import User
from services.customers.models import Task
from services.customers.scoping import can_open
from services.customers.task_changes import created_events

from .access import record_of, require_editor
from .models import Milestone, Plan
from .notices import tell_assignees
from .starting import PlanOpen, _lock, on_record, open_plan_id
from .status import COMPLETED, lock_plan

START_DRAFT = "Start a draft plan with Start plan."
NOT_DRAFT = "Only a draft plan can be started."


class HasDoneWork(Exception):
    """A task on the plan is completed: it can't go back to Draft."""


def return_to_draft(plan, *, actor, agent_action):
    """Open, locked `plan` back to Draft: its tasks kept as data and
    deleted, its milestones kept and un-done. `agent_action` is the id of
    the action whose undo did it."""
    if plan.tasks.filter(status=COMPLETED).exists():
        raise HasDoneWork()
    rows = list(
        plan.tasks.order_by("due_date", "pk").values(
            "milestone_id", "title", "priority", "due_date", "assignee_id", "description"
        )
    )
    plan.draft_tasks = [
        {
            "milestone": row["milestone_id"],
            "title": row["title"],
            "priority": row["priority"],
            "due_date": row["due_date"].isoformat(),
            "assignee": row["assignee_id"],
            "description": row["description"],
        }
        for row in rows
    ]
    Task.objects.filter(plan_id=plan.pk).delete()
    Milestone.objects.filter(plan_id=plan.pk).update(done_at=None, done_by=None)
    plan.status, plan.status_set_by, plan.done_at = Plan.Status.DRAFT, Plan.SetBy.PERSON, None
    plan.save(update_fields=["draft_tasks", "status", "status_set_by", "done_at", "updated_at"])
    audit.record(  # SOC2:LOG-01
        "plan.returned_to_draft",
        actor=actor,
        organisation=plan.organisation,
        target=plan,
        metadata={"tasks": len(rows), "agent_action": agent_action},
    )
    return plan


class NotDraft(Exception):
    """Only a Draft plan is started again."""


def _assignees(plan, record):
    """Who takes each kept task: its own assignee while they are active in
    the workspace and may open the record, else the record's owner, then the
    plan's owner. Each person is looked up once."""
    seen = {}

    def assignee_for(user_id):
        for candidate in (user_id, record.owner_id):
            if candidate is None:
                continue
            if candidate not in seen:
                person = User.objects.filter(
                    pk=candidate, organisation_id=plan.organisation_id, is_active=True
                ).first()
                # SOC2:AUTH-02 a task goes only to someone who may open its record
                seen[candidate] = person if person and can_open(person, record) else None
            if seen[candidate] is not None:
                return seen[candidate]
        return plan.owner

    return assignee_for


def start_from_draft(plan_id, *, actor, today, request=None):
    """Draft plan `plan_id` starts again today: its milestones' and tasks'
    dates move by the days since it last started, its kept tasks are made
    again (`plan` source, created by `actor`), and it is `not_started`."""
    plan = get_object_or_404(Plan.objects.select_related("customer", "account"), pk=plan_id)
    record = record_of(plan)
    with transaction.atomic():
        _lock(plan.organisation_id, record)
        plan = lock_plan(plan_id)
        # SOC2:AUTH-02 checked again under the lock: the owner may just have changed
        require_editor(actor, plan)
        if plan.status != Plan.Status.DRAFT:
            raise NotDraft()
        if plan.template_id is not None:
            existing = open_plan_id(record, plan.template_id)
            if existing is not None:
                raise PlanOpen(existing)
        shift = timedelta(days=(today - plan.start_date).days)
        milestones = {milestone.pk: milestone for milestone in plan.milestones.all()}
        for milestone in milestones.values():
            milestone.due_date += shift
        Milestone.objects.bulk_update(list(milestones.values()), ["due_date"])
        kept = list(plan.draft_tasks)
        plan.status, plan.status_set_by = Plan.Status.NOT_STARTED, Plan.SetBy.SYSTEM
        plan.start_date = today
        plan.target_date = max((m.due_date for m in milestones.values()), default=today)
        plan.draft_tasks = []
        try:
            with transaction.atomic():
                plan.save(
                    update_fields=[
                        "status",
                        "status_set_by",
                        "start_date",
                        "target_date",
                        "draft_tasks",
                        "updated_at",
                    ]
                )
        except IntegrityError:
            # The one-open-plan constraint: someone started one meanwhile.
            existing = open_plan_id(record, plan.template_id)
            if existing is None:
                raise
            raise PlanOpen(existing) from None
        assignee_for = _assignees(plan, record)
        rows = []
        for item in kept:
            milestone = milestones.get(item.get("milestone"))
            if milestone is None:
                continue
            person = assignee_for(item.get("assignee"))
            rows.append(
                Task(
                    **on_record(record),
                    plan=plan,
                    milestone=milestone,
                    title=item["title"],
                    priority=item["priority"],
                    due_date=date.fromisoformat(item["due_date"]) + shift,
                    description=item.get("description", ""),
                    assignee=person,
                    assignee_name=person.name[:150],
                    created_by=actor,
                    source=Task.Source.PLAN,
                )
            )
        tasks = Task.objects.bulk_create(rows)
        created_events(tasks, actor=actor, plan=plan.pk)
        audit.record(  # SOC2:LOG-01
            "plan.started_from_draft",
            request=request,
            actor=actor,
            organisation=plan.organisation,
            target=plan,
            metadata={"tasks": len(tasks)},
        )
        tell_assignees(plan, tasks, actor=actor)
    return plan
