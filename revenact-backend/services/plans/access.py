"""Who may read or change plans and templates (spec §1.3).

A template is read when it is built in, or inside the reader's own
workspace when it is theirs, shared with the workspace, or shared with them
by name. Only its owner changes it, and nobody changes a built-in. Sharing
by name is a `pk__in` over the through table, never a `.distinct()` over a
join."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.accounts.hierarchy import subtree_ids
from services.customers.scoping import visible_accounts, visible_customers

from .models import Plan, PlanTemplate, Sharing

NOT_TEMPLATE_OWNER = "Only the template's owner can change it."
BUILTIN_READ_ONLY = "Built-in templates can't be changed."
NOT_EDITOR = "Only the plan's owner or their managers can change it."
NOT_CHECKER = "Only the task's assignee, its creator or the plan's editors can tick it."


def readable_templates(user):
    named = PlanTemplate.shared_with.through.objects.filter(user_id=user.pk).values(
        "plantemplate_id"
    )
    shared = Q(owner=user) | Q(sharing=Sharing.WORKSPACE) | Q(sharing=Sharing.PEOPLE, pk__in=named)
    # SOC2:AUTH-02 a template is read when built in, owned, or shared with the reader
    return PlanTemplate.objects.filter(
        Q(is_builtin=True) | (Q(organisation_id=user.organisation_id) & shared)
    )


def get_readable_template(user, pk):
    """The template, or a 404 that reads the same for a missing one and one
    `user` may not read."""
    return get_object_or_404(readable_templates(user).select_related("owner"), pk=pk)


def get_owned_template(user, pk):
    template = get_readable_template(user, pk)
    # SOC2:AUTH-02 built-ins are read-only, and only the owner changes their own
    if template.is_builtin:
        raise PermissionDenied(BUILTIN_READ_ONLY)
    if template.owner_id != user.pk:
        raise PermissionDenied(NOT_TEMPLATE_OWNER)
    return template


def visible_plans(user):
    """Plans on records `user` may open, in their own workspace. Two `id IN`
    subqueries: never joins de-duplicated with DISTINCT, which PostgreSQL
    16 planned at about a second a call (#86)."""
    # SOC2:AUTH-02 a plan is read by whoever may open its record
    return Plan.objects.filter(organisation_id=user.organisation_id).filter(
        Q(customer_id__in=visible_customers(user).values("pk"))
        | Q(account_id__in=visible_accounts(user).values("pk"))
    )


def get_visible_plan(user, pk):
    """The plan, or a 404 that reads the same for a missing plan and one on
    a record `user` may not open."""
    plans = visible_plans(user).select_related(
        "customer", "account", "owner", "template", "started_by", "started_by_rule"
    )
    return get_object_or_404(plans, pk=pk)


def editor_ids(user):
    """The owners whose plans `user` edits: themselves and everyone below them."""
    return {user.pk, *subtree_ids(user)}


def can_edit(user, plan):
    return plan.owner_id in editor_ids(user)


def can_check(user, plan, task):
    """May `user` move `task`'s status: its assignee, its creator or the
    plan's editors, on any plan (the plan task route's rule)."""
    return can_edit(user, plan) or user.pk in (task.assignee_id, task.created_by_id)


def require_editor(user, plan):
    # SOC2:AUTH-02 a plan is changed by its owner and anyone above them in the chart
    if not can_edit(user, plan):
        raise PermissionDenied(NOT_EDITOR)


def record_of(plan):
    return plan.customer if plan.customer_id is not None else plan.account
