"""segment.pin (Slack bundles, owner 2026-10-17): pin the one record a Slack
message is about into a segment the runner owns, through the member PATCH's
own write (`segments.members.set_state`). Only a segment of the record's
kind, owned by the person who sent the message and not paused, is offered;
Run checks the owner and the record again. Undo puts the record back where
it was (pinned, kept out or neither), unless its place changed since."""

from services.metrics.models import AgentAction
from services.segments.evaluate import visible_records
from services.segments.members import PinLimit, set_state, state_of
from services.segments.models import Segment

from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale, StepFailed

NOT_YOURS = "This segment isn't yours any more."
CANT_OPEN = "You can no longer open this record."
GONE = "This segment has been deleted."
MOVED = "This record's place in the segment has changed since."
STATE_LABELS = {"pinned": "Pinned", "excluded": "Kept out", "none": "Not pinned"}


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate(payload, row, ctx, evidence):
    pk = payload.get("segment_id")
    segment = ctx.editable_segments.get(pk) if _whole(pk) else None
    if segment is None:
        raise Invalid("not one of the sender's own segments")
    if segment["kind"] != row["kind"]:
        raise Invalid("a segment of another kind")
    if segment["state"] == "pinned":
        raise Invalid("already pinned")
    return {"segment_id": pk, "segment": segment["name"], "kind": segment["kind"]}


def target(payload):
    return f"segment:{payload['segment_id']}:pin"


def _record_id(action):
    return action.account_id if action.account_id is not None else action.customer_id


def current(action):
    """The record's place in the segment now; None once the segment is gone."""
    lists = (
        Segment.objects.filter(
            pk=(action.payload or {}).get("segment_id"), organisation_id=action.organisation_id
        )
        .values_list("pinned_ids", "excluded_ids")
        .first()
    )
    if lists is None:
        return None
    pinned, excluded = lists
    return state_of(Segment(pinned_ids=pinned, excluded_ids=excluded), _record_id(action))


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    segment = (
        Segment.objects.filter(pk=payload.get("segment_id"), organisation_id=action.organisation_id)
        .values("pk", "name", "owner_id", "member_count")
        .first()
    )
    record = action.record
    before = action.before if isinstance(action.before, str) else "none"
    return {
        "segment_pin": {
            "segment": {
                # SOC2:AUTH-02 a segment's link only for its owner (a segment is private)
                "id": segment["pk"] if segment and segment["owner_id"] == reader.pk else None,
                "name": segment["name"] if segment else payload.get("segment", ""),
                "members": segment["member_count"] if segment else None,
            },
            "record": record.name if record is not None else "",
            "from": STATE_LABELS.get(before, STATE_LABELS["none"]),
            "to": STATE_LABELS["pinned"],
        }
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person pins a record into their own segment")
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    segment = Segment.objects.filter(
        pk=action.payload["segment_id"], organisation_id=action.organisation_id
    ).first()
    if segment is None:
        raise Stale("the segment is gone")
    # SOC2:AUTH-02 only the runner's own segment, as the member PATCH allows (`get_owned`)
    if segment.owner_id != actor.pk:
        raise StepFailed(NOT_YOURS)
    if segment.kind != action.payload.get("kind"):
        raise Stale("the segment's kind changed")
    # SOC2:AUTH-02 only a record the runner may open, as the member PATCH checks
    if not visible_records(segment.kind, actor).filter(pk=record.pk).exists():
        raise StepFailed(CANT_OPEN)
    earlier = state_of(segment, record.pk)
    try:
        segment = set_state(segment, record.pk, "pinned", actor=actor)
    except PinLimit as exc:
        raise StepFailed(exc.detail) from None
    return "pinned", {"segment_id": segment.pk, "earlier": earlier}


def undo(action, actor):
    record_id = _record_id(action)
    segment = (
        Segment.objects.select_for_update()
        .filter(pk=(action.payload or {}).get("segment_id"), organisation_id=action.organisation_id)
        .first()
    )
    if segment is None:
        raise ChangedSince(GONE)
    # SOC2:AUTH-02 only the segment's owner changes its lists
    if segment.owner_id != actor.pk:
        raise ChangedSince(NOT_YOURS)
    if state_of(segment, record_id) != "pinned":
        raise ChangedSince(MOVED)
    earlier = (action.result or {}).get("earlier") or "none"
    try:
        set_state(segment, record_id, earlier if earlier in STATE_LABELS else "none", actor=actor)
    except PinLimit as exc:
        raise ChangedSince(exc.detail) from None


PIN = Kind(
    key=AgentAction.Kind.SEGMENT_PIN,
    label="Pin to a segment",
    example="Pin Pizza Hut into your At-risk renewals segment",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=current,
    unchanged=lambda action, now: now == "pinned",
    preview=preview,
    per_reader=True,
    apply=apply,
    undo=undo,
    texts=lambda payload: [],
    outputs=("segment_id", "segment_url"),
    message_only=True,
)
