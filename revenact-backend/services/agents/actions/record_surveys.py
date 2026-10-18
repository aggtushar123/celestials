"""survey.record (Slack bundles, owner 2026-10-17): a survey of the people
at the one record a Slack message is about, sent as the runner. "now" sends
it on Run, with the Surveys page's "Send now" rules (`sending.claim`, its
audience the record's people with the ticked roles, as the runner sees
them). "after_jira" keeps it as a draft until the Jira issue the bundle's
earlier step made is resolved (`issue_waits`): Run writes the wait, and the
per-minute tick sends it then. Sent, it can't be undone; held back, Undo
cancels the wait and deletes the draft."""

from django.utils import timezone
from rest_framework import serializers

from core import audit
from services.customers.models import Account, Contact, Survey
from services.metrics.models import AgentAction
from services.surveys.models import SurveySend
from services.surveys.questions import question_for
from services.surveys.sending import EMAIL_NOT_SET_UP, Refusal, claim, email_is_set_up
from services.surveys.serializers import NO_ROLES, roles_field

from .. import builder, placeholders
from ..edits import checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed

SUBJECT_LIMIT = 120
INTRO_LIMIT = 500
NAME_LIMIT = 120
TYPES = tuple(Survey.SurveyType.values)
TIMINGS = ("now", "after_jira")
ROLE_LABELS = dict(Contact.Role.choices)
CHOOSE_TYPE = "Choose NPS, CSAT or CES."
NO_SUBJECT = "Write a subject."
CHOOSE_TIMING = "Choose now or after the Jira issue is resolved."
NO_ISSUE_STEP = "There's no Jira issue in this bundle to wait for."
NOT_THE_RUNNER = "Only the person who ran this step can retry it."
SENT = "This survey has been sent."
NOT_FOUND = "This survey has been deleted."
EDITED = "This survey has been edited since."


def waiting_note(issue):
    return f"Sends when {issue} is resolved."


def _roles(raw):
    if not isinstance(raw, list) or not raw or not all(role in ROLE_LABELS for role in raw):
        raise Invalid("roles from the contact roles")
    return list(dict.fromkeys(raw))


def _issue_fields(ctx):
    """The jira.create step this survey waits for, and its connector: set by
    the proposer once that step is placed. Invalid when there is none."""
    if ctx.issue_step is None or ctx.jira_connector is None:
        raise Invalid("after_jira needs the bundle's Jira issue")
    return {
        "issue": f"{{{{step {ctx.issue_step}.ticket_key}}}}",
        "connector_id": ctx.jira_connector["id"],
    }


def validate(payload, row, ctx, evidence):
    if ctx.slack_message is None:
        raise Invalid("a record survey answers a Slack message")
    if payload.get("survey_type") not in TYPES:
        raise Invalid("choose nps, csat or ces")
    timing = payload.get("timing") or "now"
    if timing not in TIMINGS:
        raise Invalid("now or after_jira")
    clean = {
        "survey_type": payload["survey_type"],
        "subject": builder.text(payload.get("subject"), SUBJECT_LIMIT),
        "intro": builder.text(payload.get("intro"), INTRO_LIMIT, required=False),
        "roles": _roles(payload.get("roles")),
        "timing": timing,
        "record": row["name"],
    }
    if timing == "after_jira":
        clean.update(_issue_fields(ctx))
    return clean


def target(payload):
    return f"survey:record:{payload['survey_type']}"


def texts(payload):
    return [payload.get("subject"), payload.get("intro")]


class _Edit(serializers.Serializer):
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
    timing = serializers.ChoiceField(
        required=False,
        choices=TIMINGS,
        error_messages={"invalid_choice": CHOOSE_TIMING, "null": CHOOSE_TIMING},
    )

    def validate_roles(self, value):
        roles = list(dict.fromkeys(value))
        if not roles:
            raise serializers.ValidationError(NO_ROLES)
        return roles


def _issue_step(action):
    """The position of the bundle's jira.create step before this one, or None."""
    return (
        AgentAction.objects.filter(
            bundle_id=action.bundle_id,
            kind=AgentAction.Kind.JIRA_CREATE,
            position__lt=action.position,
        )
        .order_by("position")
        .values_list("position", "payload")
        .first()
    )


def edit(action, fields, runner):
    clean = dict(checked(_Edit, fields))
    payload = {**action.payload, **clean}
    if clean.get("timing") == "after_jira" and not payload.get("issue"):
        found = _issue_step(action)
        if found is None:
            raise FieldErrors({"timing": [NO_ISSUE_STEP]})
        position, jira = found
        payload["issue"] = f"{{{{step {position}.ticket_key}}}}"
        payload["connector_id"] = (jira or {}).get("connector_id")
    elif clean.get("timing") == "now":
        payload.pop("issue", None)
        payload.pop("connector_id", None)
    return payload


def current(action):
    """The held-back survey's wait as it is now ("waiting", "sent", ...), or
    None before the step ran (or for a survey sent at once)."""
    from ..models import IssueWait

    return IssueWait.objects.filter(action_id=action.pk).values_list("status", flat=True).first()


def unchanged(action, now):
    """Undo's read-time hint: a held-back survey that went out can't be taken back."""
    from ..models import IssueWait

    return now != IssueWait.Status.SENT


def undoable(payload):
    return isinstance(payload, dict) and payload.get("timing") == "after_jira"


def _wait_label(wait):
    from ..models import IssueWait

    W = IssueWait.Status
    if wait.status in (W.WAITING, W.DUE):
        return f"Waiting for {wait.issue_key}"
    if wait.status == W.SENT:
        return "Sent"
    if wait.status == W.EXPIRED:
        return f"Not sent: {wait.issue_key} wasn't resolved within 90 days."
    if wait.status == W.CANCELLED:
        return "Not sent: cancelled."
    return f"Not sent: {wait.detail}" if wait.detail else "Not sent."


def preview(action, reader):
    from services.surveys.audience import resolve

    from ..models import IssueWait

    payload = action.payload if isinstance(action.payload, dict) else {}
    survey_type = payload.get("survey_type", "nps")
    audience = None
    record = action.record
    if action.status == AgentAction.Status.PROPOSED and record is not None and payload.get("roles"):
        kind = "account" if isinstance(record, Account) else "customer"
        from types import SimpleNamespace

        found = resolve(
            SimpleNamespace(kind=kind),
            payload["roles"],
            reader,
            today=timezone.localdate(),
            records=[record.pk],
        )
        audience = found.counts()
    wait = None
    if action.status == AgentAction.Status.APPLIED and payload.get("timing") == "after_jira":
        found_wait = IssueWait.objects.filter(action_id=action.pk).first()
        if found_wait is not None:
            wait = {"status": found_wait.status, "label": _wait_label(found_wait)}
    issue = payload.get("issue") or ""
    return {
        "record_survey": {
            "survey_type": survey_type,
            "question": question_for(survey_type, action.organisation.name),
            "subject": payload.get("subject", ""),
            "intro": payload.get("intro", ""),
            "roles": [ROLE_LABELS.get(role, role) for role in payload.get("roles", [])],
            "record": record.name if record is not None else payload.get("record", ""),
            "timing": payload.get("timing", "now"),
            # Before the run it names the issue step; after it, the issue's key.
            "issue": None if not issue or placeholders.find({"issue": issue}) else issue,
            "audience": audience,
            "wait": wait,
        }
    }


def _name(payload, record):
    kind = Survey.SurveyType(payload["survey_type"]).label
    return f"{kind} survey: {record.name}"[:NAME_LIMIT]


def _draft(action, actor):
    """The draft this step made before (a Retry), else a new one on the
    record, private to the runner."""
    made = SurveySend.objects.filter(
        pk=(action.result or {}).get("survey_id"), organisation_id=action.organisation_id
    ).first()
    if made is not None:
        if made.owner_id != actor.pk:
            raise StepFailed(NOT_THE_RUNNER, result={"survey_id": made.pk})
        return made
    record = action.record
    payload = action.payload
    on = {"account": record} if isinstance(record, Account) else {"customer": record}
    made = SurveySend.objects.create(
        organisation_id=action.organisation_id,
        owner=actor,
        name=_name(payload, record),
        survey_type=payload["survey_type"],
        subject=payload["subject"],
        intro=payload.get("intro", ""),
        roles=payload["roles"],
        **on,
    )
    audit.record(  # SOC2:LOG-01
        "survey.created",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"survey_type": made.survey_type, "agent_action": action.pk},
    )
    return made


def _wait(action, actor, made):
    """Hold the draft until the bundle's Jira issue is resolved (`issue_waits`)."""
    from services.connectors.models import Connector

    from ..models import IssueWait

    payload = action.payload
    issue = str(payload.get("issue") or "")
    result = {"survey_id": made.pk}
    if not issue or placeholders.find({"issue": issue}):
        raise StepFailed(NO_ISSUE_STEP, result=result)
    # SOC2:AUTH-02 only this workspace's Jira connection is read for the issue
    connector = Connector.objects.filter(
        pk=payload.get("connector_id"), organisation_id=action.organisation_id
    ).first()
    if connector is None:
        raise StepFailed("The Jira connection this waits on is gone.", result=result)
    IssueWait.objects.get_or_create(
        action=action,
        defaults={
            "organisation_id": action.organisation_id,
            "survey_send": made,
            "connector": connector,
            "issue_key": issue[:64],
            "owner": actor,
        },
    )
    return {**result, "issue": issue, "note": waiting_note(issue)}


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person runs a survey and owns it")
    if action.record is None:
        raise Stale("the record no longer exists")
    made = _draft(action, actor)
    result = {"survey_id": made.pk}
    if action.payload.get("timing") == "after_jira":
        result = _wait(action, actor, made)
    else:
        if not email_is_set_up():
            raise StepFailed(EMAIL_NOT_SET_UP, result=result)
        try:
            claim(made.pk, actor, today=timezone.localdate(), now=timezone.now(), actor=actor)
        except Refusal as refused:
            raise StepFailed(builder.refusal_detail(refused.body), result=result) from None
    after = {"survey_id": made.pk, "survey_updated_at": builder.stamp(SurveySend, made.pk)}
    return after, result


def undo(action, actor):
    """A survey held back for its Jira issue: the wait is cancelled and the
    draft deleted while it is unsent and unedited."""
    from ..models import IssueWait

    wait = IssueWait.objects.select_for_update().filter(action_id=action.pk).first()
    if wait is not None and wait.status == IssueWait.Status.SENT:
        raise ChangedSince(SENT)
    after = action.after or {}
    made = (
        SurveySend.objects.select_for_update(of=("self",)).filter(pk=after.get("survey_id")).first()
    )
    if made is not None and made.status != SurveySend.Status.DRAFT:
        raise ChangedSince(SENT)
    if made is not None and made.updated_at.isoformat() != after.get("survey_updated_at"):
        raise ChangedSince(EDITED)
    if wait is not None and wait.status in (IssueWait.Status.WAITING, IssueWait.Status.DUE):
        wait.status = IssueWait.Status.CANCELLED
        wait.detail = "undone"
        wait.save(update_fields=["status", "detail"])
    if made is None:
        if wait is None:
            raise ChangedSince(NOT_FOUND)
        return
    audit.record(  # SOC2:LOG-01
        "survey.deleted",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"survey_type": made.survey_type},
    )
    made.delete()


RECORD = Kind(
    key=AgentAction.Kind.SURVEY_RECORD,
    label="Survey the record's people",
    example="Ask Pizza Hut's admins for a CSAT score once the SSO fix ships",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=current,
    unchanged=unchanged,
    preview=preview,
    per_reader=True,
    apply=apply,
    undo=undo,
    texts=texts,
    irreversible=True,
    editable=("survey_type", "subject", "intro", "roles", "timing"),
    edit=edit,
    outputs=("survey_id", "survey_url"),
    customer_facing=("subject", "intro"),
    cant_undo=SENT,
    message_only=True,
    undoable_for=undoable,
)
