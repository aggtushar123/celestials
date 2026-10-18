"""Who may read a send, who may change it, and which segment a survey may
go to."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.segments.access import get_readable as get_readable_segment

from .models import SurveySend

NOT_OWNER = "Only the survey's owner can change it."
NOT_SEGMENT_OWNER = "You can only survey your own segments."


def readable_sends(user):
    """Sends `user` may read: their own, those shared with the workspace,
    and those shared with them by name. Inside their own workspace only."""
    # SOC2:AUTH-02 a send is read by its owner and whoever it is shared with
    return (
        SurveySend.objects.filter(organisation_id=user.organisation_id)
        .filter(
            Q(owner=user)
            | Q(sharing=SurveySend.Sharing.WORKSPACE)
            | Q(sharing=SurveySend.Sharing.PEOPLE, shared_with=user)
        )
        .distinct()
    )


def readable_send_ids(user):
    """The ids of `readable_sends(user)` as a subquery for an `id IN`
    filter: one `id IN` per way in, so no DISTINCT (Postgres 16 plans the
    join-and-DISTINCT form badly; services.customers.scoping)."""
    # SOC2:AUTH-02 the same rule as readable_sends: owner, workspace, or shared by name
    shared = SurveySend.shared_with.through.objects.filter(user_id=user.pk).values("surveysend_id")
    return (
        SurveySend.objects.filter(organisation_id=user.organisation_id)
        .filter(
            Q(owner_id=user.pk)
            | Q(sharing=SurveySend.Sharing.WORKSPACE)
            | Q(sharing=SurveySend.Sharing.PEOPLE, id__in=shared)
        )
        .values("id")
    )


def get_readable(user, pk):
    """The send, or a 404 that reads the same for a missing send and one
    `user` may not read."""
    return get_object_or_404(readable_sends(user).select_related("owner", "segment"), pk=pk)


def get_owned(user, pk):
    send = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, sends or deletes
    if send.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return send


def owned_segment(user, segment_id):
    """The segment a survey goes to: one `user` may read (404 otherwise)
    and owns (403 otherwise), so the audience is always their own book."""
    segment = get_readable_segment(user, segment_id)
    # SOC2:AUTH-02 a survey goes only to the builder's own segment
    if segment.owner_id != user.pk:
        raise PermissionDenied(NOT_SEGMENT_OWNER)
    return segment
