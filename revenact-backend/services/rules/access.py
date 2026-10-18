"""Who may read a rule, who may change it, and which segment a rule may
use. Sharing works as segments' does. Sharing by name is a `pk__in` over
the through table, never a `.distinct()` over a join."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.agents.made_by import RELATED
from services.segments.access import get_readable as get_readable_segment

from .models import Rule

NOT_OWNER = "Only the rule's owner can change it."
NOT_SEGMENT_OWNER = "A rule can only use your own segments."


def readable_rules(user):
    """Rules `user` may read: their own, those shared with the workspace,
    and those shared with them by name. Inside their own workspace only."""
    named = Rule.shared_with.through.objects.filter(user_id=user.pk).values("rule_id")
    # SOC2:AUTH-02 a rule is read by its owner and whoever it is shared with
    return Rule.objects.filter(organisation_id=user.organisation_id).filter(
        Q(owner=user)
        | Q(sharing=Rule.Sharing.WORKSPACE)
        | Q(sharing=Rule.Sharing.PEOPLE, pk__in=named)
    )


def get_readable(user, pk):
    """The rule, or a 404 that reads the same for a missing rule and one
    `user` may not read."""
    return get_object_or_404(
        readable_rules(user).select_related("owner", "segment", RELATED), pk=pk
    )


def get_owned(user, pk):
    rule = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, switches, deletes or tests with a rule
    if rule.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return rule


def owned_segment(user, segment_id):
    """The segment a rule runs on: one `user` may read (404 otherwise) and
    owns (403 otherwise), so a rule only ever reads its owner's own book."""
    segment = get_readable_segment(user, segment_id)
    # SOC2:AUTH-02 a rule runs only on its owner's own segment
    if segment.owner_id != user.pk:
        raise PermissionDenied(NOT_SEGMENT_OWNER)
    return segment
