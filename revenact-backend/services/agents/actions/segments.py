"""segment.create (Agents delivery 3): the Ops agent proposes a whole
segment; a view-all reader approves it and owns it, private, its baseline
set. Undo deletes it while it is unedited and nothing uses it."""

from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.segments.rules import leaves

from .. import builder
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

OPS = (AgentAction.Agent.OPS,)


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a segment is workspace-level")
    return builder.check_definition(payload, ctx)


def target(payload):
    return f"segment:{payload['kind']}:{payload['name'].casefold()}"[:160]


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {
        "segment": {
            "kind": payload.get("kind", ""),
            "name": payload.get("name", ""),
            "conditions": len(list(leaves(payload.get("rules") or {}))),
            "members": builder.members_for(reader, action),
        }
    }


def apply(action, actor, **_):
    # Ask only: the approver owns what it makes.
    if actor is None:
        raise Stale("a person approves a segment and owns it")
    segment = builder.create_segment(action, action.payload, actor)
    after = {"segment_id": segment.pk, "updated_at": builder.stamp(Segment, segment.pk)}
    return after, {"segment_id": segment.pk}


def undo(action, actor):
    after = action.after or {}
    segment = builder.locked_segment(after.get("segment_id"))
    if segment is None:
        raise ChangedSince("This segment has been deleted.")
    if segment.updated_at.isoformat() != after.get("updated_at"):
        raise ChangedSince("This segment has been edited since.")
    if builder.segment_in_use(segment):
        raise ChangedSince("A scenario, campaign or survey uses this segment now.")
    builder.delete_segment(segment, action, actor)


CREATE = Kind(
    key=AgentAction.Kind.SEGMENT_CREATE,
    label="Build a segment",
    example="Build a segment of organisations renewing in 60 days with poor health",
    max_level=ASK,
    agents=OPS,
    validate=validate,
    target=target,
    # A re-proposed segment of the same kind and name is the same proposal.
    same=lambda a, b: True,
    # It makes a thing: nothing to compare when deciding it.
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    per_reader=True,
    texts=builder.definition_texts,
    outputs=("segment_id", "segment_url"),
)
