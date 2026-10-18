"""Starting a plan (spec §1.4, §1.8): the one way a plan is made, by the API
and by a rule's "Start a plan" action alike.

It locks, in order, the workspace `Organisation`, the record, then the
template, each `FOR NO KEY UPDATE`: nothing here writes a key, so the
`FOR KEY SHARE` locks that foreign-key inserts take on the same rows never
wait on them. Then it checks for an open plan from that template on that
record. The partial unique constraint is the backstop, and its
`IntegrityError` becomes `PlanOpen` too. The template is copied (or the
modal's edited copy is used): later edits to the template never change the
plan. It opens its own transaction, nested in the caller's if there is one.

The record's health score and ARR are kept on the plan as it starts
(`start_figures`) and never written again.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from core import audit
from services.accounts.models import Organisation, User
from services.customers.models import Customer, Task
from services.customers.scoping import can_open
from services.customers.task_changes import created_events

from .copying import copy_template
from .figures import start_figures
from .models import MAX_NAME, OPEN, Milestone, Plan, PlanTemplate
from .notices import tell_assignees, tell_owner_started


class PlanOpen(Exception):
    """The record already has an open plan from the template."""

    def __init__(self, plan_id):
        super().__init__(plan_id)
        self.plan_id = plan_id


class TemplateGone(Exception):
    """The template was deleted."""


def on_record(record):
    return {"customer": record} if isinstance(record, Customer) else {"account": record}


def record_meta(record):
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"record_kind": kind, "record_id": record.pk}


def open_plan_id(record, template_id):
    plans = Plan.objects.filter(**on_record(record), template_id=template_id, status__in=OPEN)
    return plans.values_list("pk", flat=True).first()


def owner_for(record, fallback):
    """The record's own owner when they are an active member of `fallback`'s
    workspace who can open it; otherwise `fallback`. The owner is read
    afresh, never from a cached relation, so a deactivation is seen."""
    owner = None if record.owner_id is None else User.objects.filter(pk=record.owner_id).first()
    if (
        owner is not None
        and owner.organisation_id == fallback.organisation_id
        and can_open(owner, record)
    ):
        return owner
    return fallback


def default_name(template, record):
    return f"{template.name} · {record.name}"[:MAX_NAME]


def _lock(organisation_id, record):
    list(
        Organisation.objects.select_for_update(no_key=True)
        .filter(pk=organisation_id)
        .values_list("pk", flat=True)
    )
    list(
        type(record)
        .objects.select_for_update(no_key=True, of=("self",))
        .filter(pk=record.pk)
        .values_list("pk", flat=True)
    )


def start_plan(
    template_id,
    record,
    *,
    owner,
    start_date,
    actor=None,
    rule=None,
    name="",
    milestones=None,
    request=None,
):
    """Starts a plan from template `template_id` on `record` (a Customer or
    an Account), owned by `owner`, and returns it.

    - `actor` is the person starting it; for a rule it is None and `rule` is
      set. The plan's tasks are created by the actor, or the rule's owner.
    - `milestones` is the modal's edited copy (the shape
      `validation.clean_plan_milestones` returns). Without it the template
      is copied: `record_owner` tasks go to `owner_for(record, owner)`,
      `plan_owner` tasks to `owner`.

    Raises `PlanOpen` or `TemplateGone`."""
    creator = actor if actor is not None else rule.owner
    with transaction.atomic():
        _lock(owner.organisation_id, record)
        locked = PlanTemplate.objects.select_for_update(no_key=True, of=("self",))
        template = locked.filter(pk=template_id).first()
        if template is None:
            raise TemplateGone(template_id)
        existing = open_plan_id(record, template.pk)
        if existing is not None:
            raise PlanOpen(existing)
        steps = milestones
        if steps is None:
            steps = copy_template(
                template,
                start_date=start_date,
                record_owner=owner_for(record, owner),
                plan_owner=owner,
            )
        try:
            with transaction.atomic():
                plan = Plan.objects.create(
                    organisation_id=owner.organisation_id,
                    **on_record(record),
                    template=template,
                    name=name or default_name(template, record),
                    kind=template.kind,
                    owner=owner,
                    start_date=start_date,
                    target_date=max(step["due_date"] for step in steps),
                    started_by=actor,
                    started_by_rule=rule,
                    start_figures=start_figures(record, owner.organisation, timezone.localdate()),
                )
        except IntegrityError:
            existing = open_plan_id(record, template.pk)
            if existing is None:
                # Not the one-open-plan constraint: don't hide it behind a PlanOpen with
                # nothing to point at.
                raise
            raise PlanOpen(existing) from None
        rows = Milestone.objects.bulk_create(
            [
                Milestone(
                    plan=plan, name=step["name"], position=position, due_date=step["due_date"]
                )
                for position, step in enumerate(steps)
            ]
        )
        tasks = Task.objects.bulk_create(
            [
                Task(
                    **on_record(record),
                    plan=plan,
                    milestone=milestone,
                    title=item["title"],
                    priority=item["priority"],
                    due_date=item["due_date"],
                    assignee=item["assignee"],
                    assignee_name=item["assignee"].name[:150],
                    created_by=creator,
                    source=Task.Source.PLAN,
                )
                for milestone, step in zip(rows, steps)
                for item in step["tasks"]
            ]
        )
        created_events(tasks, actor=actor, plan=plan.pk)
        audit.record(  # SOC2:LOG-01
            "plan.started",
            request=request,
            actor=actor,
            organisation=plan.organisation,
            target=plan,
            metadata={
                "template": template.pk,
                **record_meta(record),
                "rule": None if rule is None else rule.pk,
                "milestones": len(rows),
                "tasks": len(tasks),
            },
        )
        tell_owner_started(plan, actor=actor, rule=rule)
        tell_assignees(plan, tasks, actor=actor)
    return plan
