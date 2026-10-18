"""A send as the API returns it: the full record and the list's row."""

from django.db.models import Count, Q

from services.customers.scoping import visible_children_q
from services.organizations.rows import iso, person
from services.segments.access import readable_segments

from .models import SurveyInvite
from .summary import rate, send_summary


def readable_segment_ids(viewer, segment_ids):
    """Which of `segment_ids` `viewer` may read; no query for none."""
    ids = {pk for pk in segment_ids if pk is not None}
    if not ids:
        return set()
    return set(readable_segments(viewer).filter(pk__in=ids).values_list("pk", flat=True))


def segment_ref(send, readable):
    """The send's segment by name and kind; its id only for a reader who
    may open it. None once the segment is deleted."""
    segment = send.segment
    if segment is None:
        return None
    return {
        "id": segment.pk if segment.pk in readable else None,
        "name": segment.name,
        "kind": segment.kind,
    }


def invite_tallies(send_ids, viewer):
    """`{send_id: {sent, answered, seen_sent, seen_answered}}` in one query.
    `seen_*` count only people `viewer` may open."""
    if not send_ids:
        return {}
    # SOC2:AUTH-02 a shared reader's counts cover only people they may open
    seen = visible_children_q(viewer)
    answered = Q(status=SurveyInvite.Status.ANSWERED)
    rows = (
        SurveyInvite.objects.filter(send_id__in=send_ids)
        .exclude(status=SurveyInvite.Status.FAILED)
        .order_by()
        .values("send_id")
        .annotate(
            sent=Count("id"),
            answered=Count("id", filter=answered),
            seen_sent=Count("id", filter=seen),
            seen_answered=Count("id", filter=seen & answered),
        )
    )
    return {row["send_id"]: row for row in rows}


def send_payload(send, viewer):
    is_owner = send.owner_id == viewer.pk
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = (
        send.shared_with.filter(organisation_id=viewer.organisation_id)
        .order_by("name", "pk")
        .values_list("pk", "name")
    )
    return {
        "id": send.pk,
        "name": send.name,
        "survey_type": send.survey_type,
        "subject": send.subject,
        "intro": send.intro,
        "segment": segment_ref(send, readable_segment_ids(viewer, [send.segment_id])),
        "roles": send.roles,
        "status": send.status,
        "sharing": send.sharing,
        "shared_with": [{"id": pk, "name": name} for pk, name in teammates],
        "owner": person(send.owner),
        "is_owner": is_owner,
        "started_at": iso(send.started_at),
        "sent_at": iso(send.sent_at),
        # Frozen from the owner's own audience: the owner's to read.
        "counts": send.counts if is_owner and send.counts else None,
        "summary": send_summary(send, viewer),
        "created_at": iso(send.created_at),
        "updated_at": iso(send.updated_at),
    }


def list_rows(sends, viewer):
    sends = list(sends)
    readable = readable_segment_ids(viewer, [send.segment_id for send in sends])
    tallies = invite_tallies([send.pk for send in sends], viewer)
    rows = []
    for send in sends:
        tally = tallies.get(send.pk, {})
        is_owner = send.owner_id == viewer.pk
        prefix = "" if is_owner else "seen_"
        sent, answered = tally.get(f"{prefix}sent", 0), tally.get(f"{prefix}answered", 0)
        rows.append(
            {
                "id": send.pk,
                "name": send.name,
                "survey_type": send.survey_type,
                "status": send.status,
                "segment": segment_ref(send, readable),
                "owner": person(send.owner),
                "is_owner": is_owner,
                "sharing": send.sharing,
                "sent_at": iso(send.sent_at),
                "sent": sent,
                "answered": answered,
                "rate": rate(answered, sent),
                "updated_at": iso(send.updated_at),
            }
        )
    return rows
