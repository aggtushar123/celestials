"""canvas.create (Agents delivery 3, owner decision 2): a map of the record's
people, laid out by role, with no links (links would be guesses). Record-
level: decided like any record action. Applied as the approver, from the
people they may open; undo deletes it while nobody has saved it since."""

from rest_framework.exceptions import ValidationError

from core import audit
from services.customers.canvas import MAX_NAME, clean_name, people_nodes
from services.customers.models import Canvas
from services.customers.scoping import visible_accounts, visible_customers
from services.metrics.models import AgentAction

from .. import builder, bulk
from ..kinds import ALL_AGENTS, ASK, ChangedSince, Invalid, Kind, Stale
from ..people import ref_of, visible_people


def validate(payload, row, ctx, evidence):
    if row is None:
        raise Invalid("a map is on a record")
    if not row.get("people") or row["people"] not in evidence:
        raise Invalid("a map cites its record's people line")
    return {"name": builder.text(payload.get("name"), MAX_NAME)}


def _people(reader, action):
    page = bulk.active()
    if page is not None:
        found = page.people_count(reader, action.pk)
        if found is not None:
            return found
    ref = ref_of(action)
    return visible_people(reader, [ref])[ref]


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {"canvas": {"name": payload.get("name", ""), "people": _people(reader, action)}}


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person approves a map")
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    if action.account_id is not None:
        on, visible = {"account_id": action.account_id}, visible_accounts
    else:
        on, visible = {"customer_id": action.customer_id}, visible_customers
    # SOC2:AUTH-02 a map is made only on a record the approver may open, from
    # the people they may open
    if not visible(actor).filter(pk=record.pk).exists():
        raise Stale("the approver may not open the record")
    try:
        name = clean_name(action.payload.get("name"))
    except ValidationError as exc:
        raise Stale("the name no longer holds") from exc
    nodes = people_nodes(actor, **on)
    if not nodes:
        raise Stale("nobody on the record the approver may open")
    canvas = Canvas.objects.create(
        name=name,
        nodes=nodes,
        edges=[],
        created_by=actor,
        updated_by=actor,
        agent_action=action,
        **on,
    )
    audit.record(  # SOC2:LOG-01
        "canvas.created",
        actor=actor,
        organisation=action.organisation,
        target=canvas,
        target_repr=f"Canvas {canvas.pk}",
        metadata={"start": "people", "nodes": len(nodes), "agent_action": action.pk},
    )
    return {"canvas_id": canvas.pk, "version": canvas.version}, {"canvas_id": canvas.pk}


def undo(action, actor):
    after = action.after or {}
    canvas = (
        Canvas.objects.select_for_update(of=("self",)).filter(pk=after.get("canvas_id")).first()
    )
    if canvas is None:
        raise ChangedSince("This map has been deleted.")
    if canvas.version != after.get("version"):
        raise ChangedSince("This map has been edited since.")
    audit.record(  # SOC2:LOG-01
        "canvas.deleted",
        actor=actor,
        organisation=action.organisation,
        target=canvas,
        target_repr=f"Canvas {canvas.pk}",
    )
    canvas.delete()


CREATE = Kind(
    key=AgentAction.Kind.CANVAS_CREATE,
    label="Map a record's people",
    example="Map the people at Dough Co",
    max_level=ASK,
    agents=ALL_AGENTS,
    validate=validate,
    # One open map proposal per record, whatever its name.
    target=lambda payload: "canvas",
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    builder=True,
    per_reader=True,
    texts=lambda payload: [payload.get("name")],
    outputs=("canvas_id", "canvas_url"),
)
