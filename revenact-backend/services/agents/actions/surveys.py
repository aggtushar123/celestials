"""survey.send (Agent bundles, contract §7.1): a survey on its own new
segment, as the Ops agent writes it. On Run the runner owns the segment and
the survey and it is sent with the "Send now" button's own rules; "Save as
draft only" stops at the draft. A refused send keeps the draft so Retry
sends that same draft. Sent, it can't be undone; a draft is undone while
unsent and unedited, with its segment."""

from django.utils import timezone
from rest_framework import serializers

from core import audit
from services.accounts.models import Organisation, User
from services.customers.models import Contact, Survey
from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.surveys.models import MAX_PEOPLE, SurveySend
from services.surveys.questions import question_for
from services.surveys.sending import EMAIL_NOT_SET_UP, Refusal, claim, email_is_set_up
from services.surveys.serializers import NO_ROLES, SendWriteSerializer, roles_field

from .. import builder
from ..edits import NO_NAME, checked, text_field
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale, StepFailed

SUBJECT_LIMIT = 120
INTRO_LIMIT = 500
TYPES = tuple(Survey.SurveyType.values)
ROLE_LABELS = dict(Contact.Role.choices)
CHOOSE_TYPE = "Choose NPS, CSAT or CES."
NO_SUBJECT = "Write a subject."


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
        raise Invalid("a survey is workspace-level")
    if payload.get("survey_type") not in TYPES:
        raise Invalid("choose nps, csat or ces")
    segment = builder.check_definition(payload.get("segment"), ctx)
    return {
        "name": builder.text(payload.get("name"), builder.NAME_LIMIT),
        "survey_type": payload["survey_type"],
        "subject": builder.text(payload.get("subject"), SUBJECT_LIMIT),
        "intro": builder.text(payload.get("intro"), INTRO_LIMIT, required=False),
        "segment": segment,
        "roles": _roles(payload.get("roles"), segment["kind"]),
        # D2-29: a new send step starts as "Save as draft only"; a person turns it off to send.
        "draft_only": True,
    }


def texts(payload):
    found = [payload.get("name"), payload.get("subject"), payload.get("intro")]
    return found + builder.definition_texts(payload.get("segment") or {})


class _Edit(serializers.Serializer):
    name = text_field(builder.NAME_LIMIT, NO_NAME, "Keep the name under 120 characters.")
    survey_type = serializers.ChoiceField(
        required=False,
        choices=TYPES,
        error_messages={"invalid_choice": CHOOSE_TYPE, "null": CHOOSE_TYPE},
    )
    subject = text_field(SUBJECT_LIMIT, NO_SUBJECT, "Keep the subject under 120 characters.")
    intro = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=INTRO_LIMIT,
        error_messages={"max_length": "Keep the intro under 500 characters."},
    )
    roles = roles_field(required=False)
    draft_only = serializers.BooleanField(required=False)

    def validate_roles(self, value):
        """The builder's rule (`clean_roles`): each role once; none for a
        contact segment, at least one otherwise."""
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
    payload = action.payload if isinstance(action.payload, dict) else {}
    definition = payload.get("segment") or {}
    audience = None
    # Counted only while the step waits: History's rows pay nothing (null).
    if definition.get("rules") and action.status == AgentAction.Status.PROPOSED:
        audience = builder.audience_counts(
            reader, definition, payload.get("roles", []), today=timezone.localdate()
        )
    survey_type = payload.get("survey_type", "nps")
    return {
        "survey": {
            "name": payload.get("name", ""),
            "survey_type": survey_type,
            "question": question_for(survey_type, action.organisation.name),
            "subject": payload.get("subject", ""),
            "intro": payload.get("intro", ""),
            "segment": definition.get("name", ""),
            "roles": [ROLE_LABELS.get(role, role) for role in payload.get("roles", [])],
            "audience": audience,
            "limit": MAX_PEOPLE,
        }
    }


NOT_THE_RUNNER = "Only the person who ran this step can retry it."
#: What a Retry's edits may change on the kept draft.
SYNCED = ("name", "survey_type", "subject", "intro", "roles")


def _sync(made, payload, actor, action):
    """A Retry's edits, written to the kept draft as the Surveys page writes
    them (its serializer, its `survey.updated` event), under claim's own lock
    order: workspace, owner, send."""
    changed = {
        name: payload.get(name, "")
        for name in SYNCED
        if payload.get(name, "") != getattr(made, name)
    }
    if not changed:
        return made
    list(
        Organisation.objects.select_for_update(no_key=True)
        .filter(pk=actor.organisation_id)
        .values_list("pk", flat=True)
    )
    list(User.objects.select_for_update().filter(pk=actor.pk).values_list("pk", flat=True))
    made = (
        SurveySend.objects.select_for_update(of=("self",)).select_related("segment").get(pk=made.pk)
    )
    # SOC2:AUTH-02 the runner's own draft, through the page's own write rules
    serializer = SendWriteSerializer(
        made, data=changed, partial=True, context={"request": builder.as_request(actor)}
    )
    if not serializer.is_valid():
        raise StepFailed(
            builder.refusal_detail(serializer.errors),
            result={"survey_id": made.pk, "segment_id": made.segment_id},
        )
    made = serializer.save()
    audit.record(  # SOC2:LOG-01
        "survey.updated",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"fields": sorted(changed)},
    )
    return made


def _draft(action, actor):
    """The survey this step made before (a Retry), else a new draft on a new
    segment, made only when the kept one is gone. A kept survey is reused
    whatever its status (a sent one is refused by `claim` with its own
    sentence), with the Retry's edits written to it while it is a draft;
    one kept for someone else fails the step."""
    made = (
        SurveySend.objects.filter(
            pk=(action.result or {}).get("survey_id"), organisation_id=action.organisation_id
        )
        .select_related("segment")
        .first()
    )
    if made is not None:
        if made.owner_id != actor.pk:
            raise StepFailed(
                NOT_THE_RUNNER, result={"survey_id": made.pk, "segment_id": made.segment_id}
            )
        if made.status == SurveySend.Status.DRAFT:
            made = _sync(made, action.payload, actor, action)
        return made
    payload = action.payload
    segment = builder.create_segment(action, payload["segment"], actor)
    data = {
        "name": payload["name"],
        "survey_type": payload["survey_type"],
        "subject": payload["subject"],
        "intro": payload.get("intro", ""),
        "segment": segment.pk,
        "roles": payload["roles"],
    }
    # SOC2:AUTH-02 a survey goes only to its owner's own segment
    serializer = SendWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    if not serializer.is_valid():
        raise Stale("the survey no longer holds for the runner")
    made = serializer.save(owner=actor, organisation_id=action.organisation_id)
    audit.record(  # SOC2:LOG-01
        "survey.created",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"survey_type": made.survey_type, "agent_action": action.pk},
    )
    return made


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person runs a survey and owns it")
    made = _draft(action, actor)
    result = {"survey_id": made.pk, "segment_id": made.segment_id}
    if not action.payload.get("draft_only"):
        # The "Send now" button's rules: email set up, then the claim's own.
        if not email_is_set_up():
            raise StepFailed(EMAIL_NOT_SET_UP, result=result)
        try:
            claim(made.pk, actor, today=timezone.localdate(), now=timezone.now(), actor=actor)
        except Refusal as refused:
            raise StepFailed(builder.refusal_detail(refused.body), result=result) from None
    after = {
        "survey_id": made.pk,
        "survey_updated_at": builder.stamp(SurveySend, made.pk),
        "segment_id": made.segment_id,
        "segment_updated_at": builder.stamp(Segment, made.segment_id),
    }
    return after, result


def undo(action, actor):
    """A draft-only run: the draft (while unsent and unedited), then its segment."""
    after = action.after or {}
    made = (
        SurveySend.objects.select_for_update(of=("self",)).filter(pk=after.get("survey_id")).first()
    )
    if made is not None:
        if made.status != SurveySend.Status.DRAFT:
            raise ChangedSince("This survey has been sent.")
        if made.updated_at.isoformat() != after.get("survey_updated_at"):
            raise ChangedSince("This survey has been edited since.")
        audit.record(  # SOC2:LOG-01
            "survey.deleted",
            actor=actor,
            organisation=action.organisation,
            target=made,
            metadata={"survey_type": made.survey_type},
        )
        made.delete()
    released = builder.release_segment(
        action, after.get("segment_id"), after.get("segment_updated_at"), actor
    )
    if made is None and not released:
        raise ChangedSince("This survey has been deleted.")


SEND = Kind(
    key=AgentAction.Kind.SURVEY_SEND,
    label="Send a survey",
    example="Ask champions of at-risk organisations for an NPS score",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"survey:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    per_reader=True,
    texts=texts,
    irreversible=True,
    editable=("name", "survey_type", "subject", "intro", "roles", "draft_only"),
    edit=edit,
    outputs=("survey_id", "survey_url", "segment_id", "segment_url"),
    customer_facing=("subject", "intro"),
    cant_undo="This survey has been sent.",
)
