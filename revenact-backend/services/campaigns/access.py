"""Who may read a campaign and who may change it (spec §1.7). Sharing works
as segments' does; sharing by name is a `pk__in` over the through table,
never a `.distinct()` over a join (PostgreSQL 16 planned that at about a
second a call, #86)."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.segments.models import Segment

from .models import Campaign
from .validation import NOT_OWNER


def readable_campaigns(user):
    """Campaigns `user` may read: their own, those shared with the
    workspace, and those shared with them by name. Inside their own
    workspace only."""
    named = Campaign.shared_with.through.objects.filter(user_id=user.pk).values("campaign_id")
    # SOC2:AUTH-02 a campaign is read by its owner and whoever it is shared with
    return Campaign.objects.filter(organisation_id=user.organisation_id).filter(
        Q(owner=user)
        | Q(sharing=Campaign.Sharing.WORKSPACE)
        | Q(sharing=Campaign.Sharing.PEOPLE, pk__in=named)
    )


def get_readable(user, pk):
    """The campaign, or a 404 that reads the same for a missing campaign and
    one `user` may not read."""
    campaigns = readable_campaigns(user).select_related("owner", "segment", "organisation")
    return get_object_or_404(campaigns, pk=pk)


def get_owned(user, pk):
    campaign = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, previews, counts, sends, archives or deletes
    if campaign.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return campaign


def owned_segment(user, segment_id):
    """The segment a campaign goes to: one of `user`'s own, or None. A
    missing segment and someone else's read the same, so the refusal never
    says whether it exists."""
    # SOC2:AUTH-02 a campaign goes only to its owner's own segment
    return Segment.objects.filter(
        pk=segment_id, owner=user, organisation_id=user.organisation_id
    ).first()
