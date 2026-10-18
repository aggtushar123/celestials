"""campaign.send (Agent bundles, contract §7.2): campaign.create, then sent
on Run as the runner with the campaign page's own rules, unless "Save as
draft only". A refusal keeps the campaign so Retry claims the same one.
Sent, it can't be undone (§3); a draft is undone as campaign.create's."""

from django.utils import timezone
from rest_framework import serializers

from services.campaigns import audit as campaign_audit
from services.campaigns.models import Campaign, CampaignSend
from services.campaigns.sending import Refusal, before_claim, claim
from services.campaigns.sending import _lock as lock_for_claim
from services.campaigns.serializers import CampaignWriteSerializer
from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.surveys.serializers import NO_ROLES, roles_field

from .. import builder
from ..edits import checked
from ..kinds import ASK, Kind, Stale, StepFailed
from . import campaigns
from .surveys import NOT_THE_RUNNER

SENT = "This campaign has been sent."


def validate(payload, row, ctx, evidence):
    # D2-29: a new send step starts as "Save as draft only"; a person turns it off to send.
    return {**campaigns.validate(payload, row, ctx, evidence), "draft_only": True}


class _Edit(campaigns._CampaignEdit):
    roles = roles_field(required=False)
    draft_only = serializers.BooleanField(required=False)

    def validate_roles(self, value):
        """The builder's rule: each role once; none for a contact segment,
        at least one otherwise."""
        if self.context["kind"] == "contact":
            return []
        roles = list(dict.fromkeys(value))
        if not roles:
            raise serializers.ValidationError(NO_ROLES)
        return roles


def edit(action, fields, runner):
    kind = (action.payload.get("segment") or {}).get("kind")
    return {**action.payload, **checked(_Edit, fields, kind=kind)}


def preview(action, reader):
    shown = campaigns.preview(action)
    payload = action.payload if isinstance(action.payload, dict) else {}
    definition = payload.get("segment") or {}
    audience = None
    # Counted only while the step waits: History's rows pay nothing (null).
    if definition.get("rules") and action.status == AgentAction.Status.PROPOSED:
        audience = builder.audience_counts(
            reader, definition, payload.get("roles", []), today=timezone.localdate()
        )
    shown["campaign"]["audience"] = audience
    shown["campaign"]["limit"] = None
    return shown


def _refresh(made, payload, actor):
    """Writes a Retry's edits to the kept draft as the campaign page's own
    edit does: its write serializer, as the runner, its `updated` event."""
    result = {"campaign_id": made.pk, "segment_id": made.segment_id}
    data = {
        name: payload[name]
        for name in ("name", "subject", "body", "roles")
        if name in payload and getattr(made, name) != payload[name]
    }
    if not data:
        return made
    # SOC2:AUTH-02 the runner owns the campaign (checked by the caller)
    serializer = CampaignWriteSerializer(
        made, data=data, partial=True, context={"request": builder.as_request(actor)}
    )
    if not serializer.is_valid():
        raise StepFailed(builder.refusal_detail(serializer.errors), result=result)
    fields = campaign_audit.changed_fields(made, serializer.validated_data)
    made = serializer.save()
    campaign_audit.record(  # SOC2:LOG-01
        "updated", made, actor=actor, metadata={"fields": fields}
    )
    return made


def _campaign(action, actor):
    """The campaign this step made before (a Retry): someone else's fails the
    step, as does one sent since (a campaign may be sent again, so a Retry
    never claims it twice); else it is locked in claim's own order
    (workspace, then campaign: a concurrent "Send now" can't deadlock with
    it) and brought up to the step's edits. A new one (campaign.create's) is
    made only when the kept one is gone."""
    made = Campaign.objects.filter(
        pk=(action.result or {}).get("campaign_id"), organisation_id=action.organisation_id
    ).first()
    if made is not None:
        if made.owner_id != actor.pk:
            raise StepFailed(
                NOT_THE_RUNNER, result={"campaign_id": made.pk, "segment_id": made.segment_id}
            )
        made = lock_for_claim(made.pk)
    if made is None:
        _, result = campaigns.apply(action, actor)
        return Campaign.objects.get(pk=result["campaign_id"])
    result = {"campaign_id": made.pk, "segment_id": made.segment_id}
    if made.owner_id != actor.pk:
        raise StepFailed(NOT_THE_RUNNER, result=result)
    if made.sends.exists():
        raise StepFailed(SENT, result=result)
    return _refresh(made, action.payload, actor)


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person runs a campaign and owns it")
    made = _campaign(action, actor)
    result = {"campaign_id": made.pk, "segment_id": made.segment_id}
    if not action.payload.get("draft_only"):
        # The campaign page's "Send now": its pre-lock refusal, then the claim's own.
        refusal = before_claim(made)
        if refusal:
            raise StepFailed(builder.refusal_detail(refusal), result=result)
        try:
            sent = claim(
                made.pk,
                kind=CampaignSend.Kind.MANUAL,
                by=actor,
                today=timezone.localdate(),
                now=timezone.now(),
            )
        except Refusal as refused:
            raise StepFailed(builder.refusal_detail(refused.body), result=result) from None
        result["send_id"] = sent.pk
    after = {
        "campaign_id": made.pk,
        "campaign_updated_at": builder.stamp(Campaign, made.pk),
        "segment_id": made.segment_id,
        "segment_updated_at": builder.stamp(Segment, made.segment_id),
    }
    return after, result


SEND = Kind(
    key=AgentAction.Kind.CAMPAIGN_SEND,
    label="Send a campaign",
    example="Send a check-in campaign to champions of at-risk organisations",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"campaign:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=campaigns.undo,
    workspace_level=True,
    builder=True,
    per_reader=True,
    texts=campaigns.texts,
    irreversible=True,
    editable=("name", "subject", "body", "roles", "draft_only"),
    edit=edit,
    outputs=("campaign_id", "campaign_url", "segment_id", "segment_url", "send_id"),
    customer_facing=("subject", "body"),
    cant_undo="This campaign has been sent.",
)
