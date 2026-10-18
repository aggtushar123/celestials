"""campaign.create (Agents delivery 3): a campaign draft on its own new
segment, as the Ops agent writes the whole of it. A person approves it and
owns both; only its owner can send it. Undo deletes it while nothing has
been sent and it is unedited, and its segment with it unless that is used
or edited."""

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from services.campaigns import audit as campaign_audit
from services.campaigns.models import MAX_BODY, Campaign
from services.campaigns.models import MAX_OWNED as CAMPAIGN_LIMIT
from services.campaigns.serializers import (
    CampaignWriteSerializer,
    check_merge_fields,
)
from services.campaigns.validation import merge_field_errors
from services.customers.models import Contact
from services.metrics.models import AgentAction
from services.segments.models import Segment

from .. import builder
from .. import evidence as evidence_
from ..edits import NO_NAME, checked, text_field
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

SUBJECT_LIMIT = 150
#: The campaign page's own limit (D2-31).
BODY_LIMIT = MAX_BODY
#: How much of the body a preview shows.
EXCERPT = 280
ROLE_LABELS = dict(Contact.Role.choices)


def _roles(raw, kind):
    if not isinstance(raw, list) or not all(role in ROLE_LABELS for role in raw):
        raise Invalid("roles from the contact roles")
    roles = list(dict.fromkeys(raw))
    if kind == "contact":
        return []
    if not roles:
        raise Invalid("at least one role")
    return roles


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a campaign is workspace-level")
    segment = builder.check_definition(payload.get("segment"), ctx)
    subject = builder.text(payload.get("subject"), SUBJECT_LIMIT)
    body = builder.text(payload.get("body"), BODY_LIMIT)
    if merge_field_errors(subject) or merge_field_errors(body):
        raise Invalid("only {first_name}, {organisation} and {sender_name}")
    # SOC2:AUTH-02 a campaign goes to customers: it names no task, note or plan
    if evidence_.internal_mentions(ctx, None, [subject, body], "email"):
        raise Invalid("a campaign names something internal")
    return {
        "name": builder.text(payload.get("name"), builder.NAME_LIMIT),
        "segment": segment,
        "roles": _roles(payload.get("roles"), segment["kind"]),
        "subject": subject,
        "body": body,
    }


def texts(payload):
    found = [payload.get("name"), payload.get("subject"), payload.get("body")]
    return found + builder.definition_texts(payload.get("segment") or {})


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {
        "campaign": {
            "name": payload.get("name", ""),
            "segment": (payload.get("segment") or {}).get("name", ""),
            "roles": [ROLE_LABELS.get(role, role) for role in payload.get("roles", [])],
            "subject": payload.get("subject", ""),
            "excerpt": str(payload.get("body", ""))[:EXCERPT],
        }
    }


def apply(action, actor, **_):
    """The segment, then a draft on it, both the approver's."""
    if actor is None:
        raise Stale("a person approves a campaign and owns it")
    payload = action.payload
    segment = builder.create_segment(action, payload["segment"], actor)
    data = {
        "name": payload["name"],
        "subject": payload["subject"],
        "body": payload["body"],
        "segment": segment.pk,
        "roles": payload["roles"],
    }
    # SOC2:AUTH-02 a campaign goes only to its owner's own segment
    serializer = CampaignWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    try:
        serializer.is_valid(raise_exception=True)
    except ValidationError as exc:
        raise Stale("the campaign no longer holds for the approver") from exc
    builder.check_owner_limit(Campaign.objects.filter(owner=actor), CAMPAIGN_LIMIT, "campaigns")
    made = serializer.save(owner=actor, organisation_id=action.organisation_id, agent_action=action)
    campaign_audit.record(  # SOC2:LOG-01
        "created",
        made,
        actor=actor,
        metadata={"segment": segment.pk, "agent_action": action.pk},
    )
    after = {
        "campaign_id": made.pk,
        "campaign_updated_at": builder.stamp(Campaign, made.pk),
        "segment_id": segment.pk,
        "segment_updated_at": builder.stamp(Segment, segment.pk),
    }
    return after, {"campaign_id": made.pk, "segment_id": segment.pk}


def undo(action, actor):
    """The campaign (under a send's claim lock, taken after the action's),
    then its segment."""
    after = action.after or {}
    made = (
        Campaign.objects.select_for_update(of=("self",))
        .select_related("organisation")
        .filter(pk=after.get("campaign_id"))
        .first()
    )
    if made is not None:
        if made.sends.exists():
            raise ChangedSince("This campaign has been sent.")
        if made.updated_at.isoformat() != after.get("campaign_updated_at"):
            raise ChangedSince("This campaign has been edited since.")
        campaign_audit.record("deleted", made, actor=actor)  # SOC2:LOG-01
        made.delete()
    released = builder.release_segment(
        action, after.get("segment_id"), after.get("segment_updated_at"), actor
    )
    if made is None and not released:
        raise ChangedSince("This campaign has been deleted.")


class _CampaignEdit(serializers.Serializer):
    name = text_field(builder.NAME_LIMIT, NO_NAME, "Keep the name under 120 characters.")
    subject = text_field(
        SUBJECT_LIMIT, "Write a subject.", f"Keep the subject under {SUBJECT_LIMIT} characters."
    )
    body = text_field(
        BODY_LIMIT, "Write the message.", f"Keep the message under {BODY_LIMIT} characters."
    )

    def validate_subject(self, value):
        return check_merge_fields(value)

    def validate_body(self, value):
        return check_merge_fields(value)


def edit(action, fields, runner):
    clean = checked(_CampaignEdit, fields)
    return {**action.payload, **clean}


CREATE = Kind(
    key=AgentAction.Kind.CAMPAIGN_CREATE,
    label="Draft a campaign",
    example="Draft a check-in campaign to champions of at-risk organisations",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"campaign:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    texts=texts,
    editable=("name", "subject", "body"),
    edit=edit,
    outputs=("campaign_id", "campaign_url", "segment_id", "segment_url"),
    customer_facing=("subject", "body"),
)
