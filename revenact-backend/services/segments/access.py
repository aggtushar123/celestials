"""Who may read a segment, and who may change it."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.agents.made_by import RELATED

from .models import Segment

NOT_OWNER = "Only the segment's owner can change it."


def readable_segments(user):
    """Segments `user` may read: their own, those shared with the workspace,
    and those shared with them by name. Inside their own workspace only."""
    # SOC2:AUTH-02 a segment is read by its owner and whoever it is shared with
    # Shared by name is an id subquery, never a join plus DISTINCT (which
    # Postgres 16 plans badly, and which a row shared with several people
    # would otherwise need).
    shared_by_name = Segment.objects.filter(
        sharing=Segment.Sharing.PEOPLE, shared_with=user
    ).values("pk")
    return Segment.objects.filter(organisation_id=user.organisation_id).filter(
        Q(owner=user) | Q(sharing=Segment.Sharing.WORKSPACE) | Q(pk__in=shared_by_name)
    )


def get_readable(user, pk):
    """The segment, or a 404 that reads the same for a missing segment and
    for one `user` may not read. Read without `last_members` (up to 100,000
    ids no endpoint returns); a writer that needs it re-reads the segment
    under the row lock."""
    segments = readable_segments(user).select_related("owner", RELATED).defer("last_members")
    return get_object_or_404(segments, pk=pk)


def get_owned(user, pk):
    segment = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, deletes, pins or keeps out
    if segment.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return segment
