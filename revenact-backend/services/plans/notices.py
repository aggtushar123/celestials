"""The two plan notifications (spec §1.7). Both link to the plan, push only
once the surrounding transaction commits, and go only to active members of
the plan's workspace."""

from collections import Counter

from services.accounts.models import User
from services.notifications.models import Notification
from services.notifications.realtime import notify
from services.rules.access import readable_rules


def link(plan):
    return f"/projects/{plan.pk}"


def tell_owner_started(plan, *, actor, rule=None):
    """`plan_started` to the plan's owner when a rule, or someone else,
    started it for them. A rule's name is confidential: the owner reads it
    only when they may read the rule, else "A rule" (as the plan page)."""
    if actor is not None and actor.pk == plan.owner_id:
        return
    if not plan.owner.is_active:
        return
    if actor is not None:
        who = actor.name
    # SOC2:AUTH-02 a rule is named only to someone who may read it
    elif readable_rules(plan.owner).filter(pk=rule.pk).exists():
        who = rule.name
    else:
        who = "A rule"
    notify(
        recipient=plan.owner,
        actor=actor,
        kind=Notification.Kind.PLAN_STARTED,
        message=f"{who} started the plan {plan.name} for you.",
        link=link(plan),
        push_on_commit=True,
    )


def assigned_message(plan, count):
    if count == 1:
        return f"1 task on {plan.name} was assigned to you."
    return f"{count} tasks on {plan.name} were assigned to you."


def tell_assignees(plan, tasks, *, actor):
    """One `plan_task_assigned` per person for this action, naming how many
    of `tasks` are theirs; never to the person acting."""
    counts = Counter(task.assignee_id for task in tasks if task.assignee_id is not None)
    if actor is not None:
        counts.pop(actor.pk, None)
    if not counts:
        return
    people = User.objects.filter(
        pk__in=list(counts), organisation_id=plan.organisation_id, is_active=True
    ).order_by("pk")
    for user in people:
        notify(
            recipient=user,
            actor=actor,
            kind=Notification.Kind.PLAN_TASK_ASSIGNED,
            message=assigned_message(plan, counts[user.pk]),
            link=link(plan),
            push_on_commit=True,
        )
