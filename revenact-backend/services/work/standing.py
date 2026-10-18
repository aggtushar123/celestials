"""Who counts as active for work (cleanup batch, owner decision 2026-10-09):
an active user whose membership in that workspace is `active`. A suspended
or revoked member gets no work: no nudge, no escalation, no routed
recommendation, no digest. Set-based: one query per workspace pass."""

from django.db.models import Q

from services.identity.models import OrganizationMembership


def _active_memberships(organisation):
    return OrganizationMembership.objects.filter(
        organisation=organisation, status=OrganizationMembership.Status.ACTIVE
    )


def working_ids(organisation):
    """The ids of the people active for work in `organisation`; one query."""
    # SOC2:AUTH-02 a suspended or revoked member is given no work
    return frozenset(
        _active_memberships(organisation)
        .filter(user__is_active=True)
        .order_by()  # the model's ordering would join two tables for nothing
        .values_list("user_id", flat=True)
    )


def is_working(user, organisation):
    """Whether one person is active for work in `organisation`: one query,
    for a single check (a task's assignee); a pass over many uses
    `working_ids`."""
    if user is None or not user.is_active:
        return False
    # SOC2:AUTH-02 a suspended or revoked member is given no work
    return _active_memberships(organisation).filter(user_id=user.pk).exists()


def working_q(organisation):
    """The same rule as a `User` filter: an `id IN` subquery, no join."""
    # SOC2:AUTH-02 a suspended or revoked member is given no work
    return Q(is_active=True, id__in=_active_memberships(organisation).values("user_id"))
