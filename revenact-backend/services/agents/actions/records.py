"""The record kinds (spec §1.3): an organisation's or account's lifecycle
stage, owner, or AI attribute value. Each applies through a person's own
path, and undo restores the old value only while it is still the one the
action set."""

import math

from django.db import connection

from services.attributes.fill import coerce
from services.attributes.models import AIAttribute, AIAttributeValue
from services.customers.models import Customer
from services.customers.scoping import can_open
from services.metrics.models import AgentAction

from .. import bulk
from ..kinds import ASK, AUTO, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale

K = AgentAction.Kind
STAGES = dict(Customer.LifecycleStage.choices)


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _fresh(action):
    """The record as it is now: `action.record` may be cached on the action."""
    record = action.record
    if bulk.active() is not None:
        # Reading a page: the record the page already holds.
        return record
    rows = type(record).objects
    # Locked inside a transaction, so the stale check and the write are
    # serialised; a read outside one (a preview) is not.
    if connection.in_atomic_block:
        rows = rows.select_for_update(no_key=True)
    return rows.get(pk=record.pk)


def _stamp(record, actor):
    """Who made the edit, as a person's PATCH records it; the field names to save."""
    # Only Customer carries modified_by; an Account PATCH has no such field.
    if actor is None or not hasattr(record, "modified_by"):
        return []
    record.modified_by = actor
    return ["modified_by"]


def _parent(record):
    return {"customer": record} if isinstance(record, Customer) else {"account": record}


# record.lifecycle


def _stage(value):
    return STAGES.get(value, str(value))


def lifecycle_validate(payload, row, ctx, evidence):
    stage = str(payload.get("stage") or "").strip().lower()
    if stage not in STAGES:
        raise Invalid(f"unknown stage {stage!r}")
    if stage == row["lifecycle"]:
        raise Invalid("no change")
    return {"stage": stage}


def lifecycle_current(action):
    return _fresh(action).lifecycle_stage


def lifecycle_preview(action):
    return {
        "field": "Lifecycle stage",
        "from": _stage(action.before),
        "to": _stage(action.payload["stage"]),
    }


def lifecycle_apply(action, actor, **_):
    record = _fresh(action)
    record.lifecycle_stage = action.payload["stage"]
    fields = _stamp(record, actor)
    record.save(update_fields=["lifecycle_stage", "updated_at", *fields])
    return record.lifecycle_stage, {}


def lifecycle_undo(action, actor):
    record = _fresh(action)
    if record.lifecycle_stage != action.after:
        now = _stage(record.lifecycle_stage)
        raise ChangedSince(
            f"Lifecycle stage has changed since: it is now {now}.",
            current=now,
            applied=_stage(action.after),
        )
    record.lifecycle_stage = action.before
    fields = _stamp(record, actor)
    record.save(update_fields=["lifecycle_stage", "updated_at", *fields])


LIFECYCLE = Kind(
    key=K.RECORD_LIFECYCLE,
    label="Change lifecycle stage",
    example="Move Dough Co from Live to Renewal.",
    max_level=AUTO,
    agents=RECORD_AGENTS,
    validate=lifecycle_validate,
    target=lambda payload: "lifecycle",
    current=lifecycle_current,
    preview=lifecycle_preview,
    apply=lifecycle_apply,
    undo=lifecycle_undo,
)


# record.owner


def _name(organisation_id, pk):
    from services.accounts.models import User

    if pk is None:
        return "Nobody"
    page = bulk.active()
    if page is not None:
        return page.names.get(pk) or "Someone no longer here"
    found = User.objects.filter(pk=pk, organisation_id=organisation_id).values_list(
        "name", flat=True
    )
    return found.first() or "Someone no longer here"


def _owner_hook(record):
    from services.customers.views import after_account_update, after_customer_update

    return after_customer_update if isinstance(record, Customer) else after_account_update


def owner_validate(payload, row, ctx, evidence):
    owner_id = payload.get("owner_id")
    if not _whole(owner_id) or owner_id not in ctx.members:
        raise Invalid("owner not in the evidence")
    if row["owner"] is not None and row["owner"]["id"] == owner_id:
        raise Invalid("no change")
    instance = ctx.instance(row["ref"])
    if instance is None:
        raise Invalid("record not in this workspace")
    # SOC2:AUTH-02 a record is given only to someone who can open it
    if not can_open(ctx.member(owner_id), instance):
        raise Invalid("that person can't open this record")
    return {"owner_id": owner_id}


def owner_current(action):
    return _fresh(action).owner_id


def owner_preview(action):
    return {
        "field": "Owner",
        "from": _name(action.organisation_id, action.before),
        "to": _name(action.organisation_id, action.payload["owner_id"]),
    }


def _member(action, pk):
    from services.accounts.models import User

    return User.objects.filter(
        pk=pk, organisation_id=action.organisation_id, is_active=True
    ).first()


def owner_apply(action, actor, **_):
    # Owner is capped at Ask, so a person always decides it; the handover
    # note is written in their name.
    if actor is None:
        raise Stale("a change of owner needs a person to decide it")
    record = _fresh(action)
    new = _member(action, action.payload["owner_id"])
    # SOC2:AUTH-02 checked again when it applies: access may have changed since
    if new is None or not can_open(new, record):
        raise Stale("the new owner can't open this record now")
    previous = record.owner
    record.owner = new
    fields = _stamp(record, actor)
    record.save(update_fields=["owner", "updated_at", *fields])
    _owner_hook(record)(record, actor=actor, previous_owner=previous)
    return new.pk, {}


def owner_undo(action, actor):
    record = _fresh(action)
    if record.owner_id != action.after:
        now = _name(action.organisation_id, record.owner_id)
        raise ChangedSince(
            f"Owner has changed since: it is now {now}.",
            current=now,
            applied=_name(action.organisation_id, action.after),
        )
    previous = None if action.before is None else _member(action, action.before)
    # SOC2:AUTH-02 the old owner gets it back only if they can still open it
    if action.before is not None and (previous is None or not can_open(previous, record)):
        raise ChangedSince(
            "The previous owner can't take this record back now.",
            current=_name(action.organisation_id, record.owner_id),
            applied=_name(action.organisation_id, action.before),
        )
    current = record.owner
    record.owner = previous
    fields = _stamp(record, actor)
    record.save(update_fields=["owner", "updated_at", *fields])
    _owner_hook(record)(record, actor=actor, previous_owner=current)


OWNER = Kind(
    key=K.RECORD_OWNER,
    label="Change owner",
    example="Hand Taco East to Dana CSM.",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=owner_validate,
    target=lambda payload: "owner",
    current=owner_current,
    preview=owner_preview,
    apply=owner_apply,
    undo=owner_undo,
)


# record.attribute


def _show(value):
    if value is None:
        return "Empty"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    return str(value)


def _latest(action):
    attribute_id = action.payload["attribute_id"]
    page = bulk.active()
    if page is not None:
        kind = "customer" if action.account_id is None else "account"
        return page.latest_value(attribute_id, kind, action.account_id or action.customer_id)
    return (
        AIAttributeValue.objects.filter(attribute_id=attribute_id, **_parent(action.record))
        .order_by("-computed_at", "-id")
        .first()
    )


def attribute_validate(payload, row, ctx, evidence):
    attribute_id = payload.get("attribute_id")
    spec = ctx.attributes.get(attribute_id) if _whole(attribute_id) else None
    if spec is None or row["kind"] not in spec["applies_to"]:
        raise Invalid("attribute not in the evidence for this record")
    try:
        value = coerce(spec["type"], payload.get("value"), spec["options"])
    except ValueError as exc:
        raise Invalid(str(exc)) from exc
    if value is None:
        raise Invalid("no value")
    if isinstance(value, float) and not math.isfinite(value):
        raise Invalid("not a finite number")
    current = next((a["value"] for a in row["attributes"] if a["id"] == attribute_id), None)
    if value == current:
        raise Invalid("no change")
    return {"attribute_id": attribute_id, "value": value}


def attribute_current(action):
    latest = _latest(action)
    return None if latest is None else latest.value


def attribute_preview(action):
    from services.attributes.models import AIAttribute

    page = bulk.active()
    if page is not None:
        name = page.attributes.get(action.payload["attribute_id"])
    else:
        name = (
            AIAttribute.objects.filter(pk=action.payload["attribute_id"])
            .values_list("name", flat=True)
            .first()
        )
    return {
        "field": name or "AI attribute",
        "from": _show(action.before),
        "to": _show(action.payload["value"]),
    }


def attribute_apply(action, actor, **_):
    attribute = AIAttribute.objects.filter(
        pk=action.payload["attribute_id"], organisation_id=action.organisation_id
    ).first()
    if attribute is None or not attribute.applies_to(action.record):
        raise Stale("the attribute no longer applies to this record")
    row = AIAttributeValue.objects.create(
        attribute_id=action.payload["attribute_id"],
        value=action.payload["value"],
        reasoning=action.rationale,
        origin=AIAttributeValue.Origin.AI,
        status=AIAttributeValue.Status.FILLED,
        set_by=actor,
        **_parent(action.record),
    )
    return row.value, {"value_id": row.pk}


def attribute_undo(action, actor):
    latest = _latest(action)
    if latest is None or latest.pk != (action.result or {}).get("value_id"):
        now = _show(None if latest is None else latest.value)
        name = attribute_preview(action)["field"]
        raise ChangedSince(
            f"{name} has changed since: it is now {now}.",
            current=now,
            applied=_show(action.after),
        )
    latest.delete()


ATTRIBUTE = Kind(
    key=K.RECORD_ATTRIBUTE,
    label="Set an AI attribute",
    example="Set Renewal likelihood on Pizza Hut to 70.",
    max_level=AUTO,
    agents=RECORD_AGENTS,
    validate=attribute_validate,
    target=lambda payload: f"attribute:{payload['attribute_id']}",
    current=attribute_current,
    preview=attribute_preview,
    apply=attribute_apply,
    undo=attribute_undo,
)
