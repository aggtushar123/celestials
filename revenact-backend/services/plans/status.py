"""How a plan's milestones and status move (spec §1.2).

Every function here runs inside a transaction holding the plan's row lock
(`lock_plan`, `FOR NO KEY UPDATE`: only non-key columns change). The API's
edits, the existing task route (`set_task_status`) and the nightly step all
come through here, so the rules hold the same way everywhere:

- a milestone is done when all of its tasks are completed (`done_by` null),
  and re-opens when one of them re-opens, unless a person marked it done
  (`done_by` set);
- the first completed task, or a milestone marked done, moves a plan from
  `not_started` to `on_track`;
- the last milestone done finishes the plan, in the same transaction;
- a finished plan (`done`, `cancelled`) moves no more: its tasks may still be
  ticked, and nothing else follows.
"""

from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core import audit
from services.customers.models import Task

from .models import OPEN, Milestone, Plan

COMPLETED = Task.Status.COMPLETED


def lock_plan(pk):
    """The plan under its `FOR NO KEY UPDATE` row lock; 404 once deleted.
    Call inside a transaction."""
    plans = Plan.objects.select_for_update(no_key=True, of=("self",)).select_related(
        "organisation", "customer", "account", "owner"
    )
    return get_object_or_404(plans, pk=pk)


def set_status(plan, new, *, by, now, today, request=None, actor=None):
    """Moves the plan to `new` and audits it. False when it is there already."""
    old = plan.status
    if old == new:
        return False
    plan.status, plan.status_set_by = new, by
    fields = ["status", "status_set_by", "updated_at"]
    if new == Plan.Status.DONE:
        plan.done_at = now
        fields.append("done_at")
    if old == Plan.Status.AT_RISK and new == Plan.Status.ON_TRACK and by == Plan.SetBy.PERSON:
        plan.at_risk_cleared_on = today
        fields.append("at_risk_cleared_on")
    plan.save(update_fields=fields)
    audit.record(  # SOC2:LOG-01
        "plan.status_changed",
        request=request,
        actor=actor,
        organisation=plan.organisation,
        target=plan,
        metadata={"old": old, "new": new, "by": by},
    )
    if new == Plan.Status.CANCELLED:
        audit.record(  # SOC2:LOG-01
            "plan.cancelled",
            request=request,
            actor=actor,
            organisation=plan.organisation,
            target=plan,
            metadata={},
        )
    return True


def milestones_done(plan):
    """(done, total) over the plan's milestones."""
    found = plan.milestones.aggregate(
        total=Count("id"), done=Count("id", filter=Q(done_at__isnull=False))
    )
    return found["done"], found["total"]


def sync_milestones(milestone_ids, *, now):
    """Each milestone as its tasks say: done (by nobody) once it has tasks
    and all are completed; re-opened when they are not, unless a person
    marked it done. Returns the ids it newly marked done."""
    ids = sorted({pk for pk in milestone_ids if pk is not None})
    newly_done = []
    if not ids:
        return newly_done
    rows = Milestone.objects.filter(pk__in=ids).annotate(
        total=Count("tasks"), unfinished=Count("tasks", filter=~Q(tasks__status=COMPLETED))
    )
    for milestone in rows:
        complete = milestone.total > 0 and milestone.unfinished == 0
        if complete and milestone.done_at is None:
            milestone.done_at, milestone.done_by = now, None
            milestone.save(update_fields=["done_at", "done_by"])
            newly_done.append(milestone.pk)
        elif not complete and milestone.done_at is not None and milestone.done_by_id is None:
            milestone.done_at = None
            milestone.save(update_fields=["done_at"])
    return newly_done


def advance(plan, *, now, today, request=None, actor=None):
    """`not_started` → `on_track`: the first work done."""
    if plan.status == Plan.Status.NOT_STARTED:
        set_status(
            plan,
            Plan.Status.ON_TRACK,
            by=Plan.SetBy.SYSTEM,
            now=now,
            today=today,
            request=request,
            actor=actor,
        )


def finish_if_done(plan, *, now, today, request=None, actor=None):
    """An open plan whose milestones are all done becomes `done`."""
    if plan.status not in OPEN:
        return False
    done, total = milestones_done(plan)
    if not total or done < total:
        return False
    return set_status(
        plan,
        Plan.Status.DONE,
        by=Plan.SetBy.SYSTEM,
        now=now,
        today=today,
        request=request,
        actor=actor,
    )


def after_work(plan, milestone_ids, *, progressed, now, today, request=None, actor=None):
    """After tasks changed under `milestone_ids`: those milestones, then the
    plan. `progressed` when a task became completed; a milestone this marks
    done progresses the plan too, whatever finished it (a task's move or
    removal included, spec §1.2). Nothing moves on a finished plan."""
    if plan.status not in OPEN:
        return
    newly_done = sync_milestones(milestone_ids, now=now)
    if progressed or newly_done:
        advance(plan, now=now, today=today, request=request, actor=actor)
    finish_if_done(plan, now=now, today=today, request=request, actor=actor)


def refresh_target(plan):
    """The target date is the latest milestone due date."""
    latest = plan.milestones.aggregate(latest=Max("due_date"))["latest"]
    if latest is not None and latest != plan.target_date:
        plan.target_date = latest
        plan.save(update_fields=["target_date", "updated_at"])


def set_task_status(
    task, new_status, *, blocked_reason="", request=None, actor=None, now=None, today=None
):
    """A plan task ticked through the existing task route: the plan's row
    lock first, then the task (read again under it: it may have moved or
    gone since the caller fetched it), then its milestone and the plan move
    on. `Task.DoesNotExist` when the task or its plan is gone."""
    now = now or timezone.now()
    today = today or timezone.localdate()
    with transaction.atomic():
        try:
            plan = lock_plan(task.plan_id)
        except Http404:
            raise Task.DoesNotExist from None
        row = (
            Task.objects.select_for_update(no_key=True)
            .filter(pk=task.pk, plan_id=plan.pk)
            .values("status", "milestone_id")
            .first()
        )
        if row is None:
            raise Task.DoesNotExist
        task.milestone_id = row["milestone_id"]
        task.status = new_status
        task.blocked_reason = blocked_reason if new_status == Task.Status.BLOCKED else ""
        task.save(update_fields=["status", "blocked_reason"])
        after_work(
            plan,
            [row["milestone_id"]],
            progressed=new_status == COMPLETED and row["status"] != COMPLETED,
            now=now,
            today=today,
            request=request,
            actor=actor,
        )
