"""The plans' nightly step (spec §1.5).

`run_health_maintenance` calls `refresh_plans` after the segments and before
the rules, so a rule that fires tonight sees tonight's plan status. In one
workspace or all of them, each plan in its own savepoint under its row lock:

1. an open plan not yet at risk, with a milestone past its due date and not
   done, becomes `at_risk` (by the system). Once a person has cleared
   at-risk, only a milestone due on or after `at_risk_cleared_on` counts;
2. an open plan whose milestones are all done becomes `done`.

Running it twice in one day is safe: a plan only moves from one state to
another, and the second run finds nothing to move. Log lines carry ids and
exception class names only.
"""

import logging
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.http import Http404
from django.utils import timezone

from .models import OPEN, Milestone, Plan
from .status import finish_if_done, lock_plan, set_status

logger = logging.getLogger(__name__)

#: The statuses the step may move to at risk.
NOT_AT_RISK = (Plan.Status.NOT_STARTED, Plan.Status.ON_TRACK)


@dataclass
class PlansResult:
    at_risk: int = 0
    done: int = 0
    failed: int = 0
    #: plans deleted between the id list and their lock: nothing to do
    skipped: int = 0


def late_plans(scope, today):
    """Plans in `scope` that tonight's step moves to at risk."""
    late = Milestone.objects.filter(
        plan_id=OuterRef("pk"), done_at__isnull=True, due_date__lt=today
    )
    since = late.filter(due_date__gte=OuterRef("at_risk_cleared_on"))
    never_cleared = Plan.objects.filter(at_risk_cleared_on__isnull=True).filter(Exists(late))
    cleared = Plan.objects.filter(at_risk_cleared_on__isnull=False).filter(Exists(since))
    return scope.filter(status__in=NOT_AT_RISK).filter(
        Q(pk__in=never_cleared.values("pk")) | Q(pk__in=cleared.values("pk"))
    )


def finished_plans(scope):
    """Open plans in `scope` whose milestones are all done."""
    milestones = Milestone.objects.filter(plan_id=OuterRef("pk"))
    return (
        scope.filter(status__in=OPEN)
        .filter(Exists(milestones))
        .filter(~Exists(milestones.filter(done_at__isnull=True)))
    )


def _still_late(plan, today):
    if plan.status not in NOT_AT_RISK:
        return False
    late = plan.milestones.filter(done_at__isnull=True, due_date__lt=today)
    if plan.at_risk_cleared_on is not None:
        late = late.filter(due_date__gte=plan.at_risk_cleared_on)
    return late.exists()


def _each(ids, step, result, field):
    """`step(plan)` for each plan under its row lock, each in its own
    savepoint; one plan's failure is logged by id and counted, and the rest
    go on. A plan deleted since the ids were listed is skipped."""
    for pk in ids:
        try:
            with transaction.atomic():
                moved = step(lock_plan(pk))
        except (Http404, Plan.DoesNotExist):
            result.skipped += 1
            continue
        except Exception as exc:  # noqa: BLE001 - one plan's failure never stops the rest
            logger.error("Plan %s: nightly refresh failed: %s", pk, type(exc).__name__)
            result.failed += 1
            continue
        if moved:
            setattr(result, field, getattr(result, field) + 1)


def refresh_plans(organisation=None, *, today=None, now=None):
    """Tonight's moves in one workspace, or all of them."""
    today = today or timezone.localdate()
    now = now or timezone.now()
    scope = (
        Plan.objects.all()
        if organisation is None
        else Plan.objects.filter(organisation=organisation)
    )
    result = PlansResult()

    def to_at_risk(plan):
        return _still_late(plan, today) and set_status(
            plan, Plan.Status.AT_RISK, by=Plan.SetBy.SYSTEM, now=now, today=today
        )

    def to_done(plan):
        return finish_if_done(plan, now=now, today=today)

    late = list(late_plans(scope, today).order_by("pk").values_list("pk", flat=True))
    _each(late, to_at_risk, result, "at_risk")
    done = list(finished_plans(scope).order_by("pk").values_list("pk", flat=True))
    _each(done, to_done, result, "done")
    return result
