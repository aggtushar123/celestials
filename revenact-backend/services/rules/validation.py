"""What a rule may say (spec §1.1-§1.3), checked against its segment's kind.

The serializer calls these. Each raises a DRF `ValidationError` keyed by the
field at fault, and `clean_actions` keys each action's errors by its place
in the list, so a 400 points at the exact field. Actions are normalised:
known keys only, text trimmed, defaults filled in. `kind` is None for a rule
whose segment was deleted; the kind's own checks then wait for a new one.
"""

from rest_framework.exceptions import ValidationError

from services.accounts.models import User
from services.campaigns.models import Campaign
from services.campaigns.validation import CHOOSE_CAMPAIGN
from services.customers.models import Contact, Customer, Survey
from services.plans.access import readable_templates
from services.surveys.serializers import NO_ROLES

from .models import (
    MAX_ACTIONS,
    MAX_DUE_DAYS,
    MAX_MESSAGE,
    MAX_SHARED,
    MAX_TITLE,
    MIN_ACTIONS,
    SCORE_RANGES,
    Rule,
)

#: The survey's subject and intro keep Surveys' own limits.
MAX_SUBJECT, MAX_INTRO = 120, 500
DEFAULT_DUE_DAYS = 7
TRIGGER_FIELDS = ("trigger", "score", "direction", "threshold", "cadence", "weekday")

CHOOSE_SEGMENT = "Choose a segment."
CHOOSE_TRIGGER = "Choose when the rule runs."
CHOOSE_SCORE = "Choose a score."
CHOOSE_DIRECTION = "Choose below or above."
CHOOSE_THRESHOLD = "Choose a value."
CHOOSE_CADENCE = "Choose weekly or monthly."
CHOOSE_WEEKDAY = "Choose a day of the week."
NO_CONTACT_SCORES = "Contacts have no scores; choose an organisation or account segment."
NO_ACCOUNT_CES = "Accounts have no CES; choose another score."
ACTION_COUNT = f"Choose {MIN_ACTIONS} to {MAX_ACTIONS} actions."
CHOOSE_ACTION = "Choose an action."
ONE_OF_EACH = "Each action can be used once per rule."
CHOOSE_RECIPIENTS = "Choose who to notify."
NO_PEOPLE = "Choose at least one teammate."
UNKNOWN_PEOPLE = "Notify only active teammates in your workspace."
TOO_MANY_PEOPLE = f"Notify at most {MAX_SHARED} people."
LONG_MESSAGE = f"Keep the message to {MAX_MESSAGE} characters."
NO_TITLE = "Give the task a title."
LONG_TITLE = f"Keep the title to {MAX_TITLE} characters."
CHOOSE_ASSIGNEE = "Choose the record's owner or yourself."
DUE_RANGE = f"Choose 0 to {MAX_DUE_DAYS} days."
NO_CONTACT_LIFECYCLE = (
    "Contacts have no lifecycle stage; choose an organisation or account segment."
)
CHOOSE_STAGE = "Choose a lifecycle stage."
CHOOSE_SURVEY_TYPE = "Choose NPS, CSAT or CES."
NO_SUBJECT = "Write a subject."
LONG_SUBJECT = f"Keep the subject to {MAX_SUBJECT} characters."
LONG_INTRO = f"Keep the intro to {MAX_INTRO} characters."
CHOOSE_ROLES = "Choose roles from the list."
YES_OR_NO = "Must be true or false."
CHOOSE_PLAN_TEMPLATE = "Choose a template you can use."


def threshold_range(score):
    low, high = SCORE_RANGES[score]
    return f"Choose a value from {low} to {high}."


def _integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _text(item, key, limit, too_long, missing=None):
    """`item[key]`, trimmed; `missing` makes it required."""
    value = item.get(key)
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError({key: [missing or too_long]})
    value = value.strip()
    if missing and not value:
        raise ValidationError({key: [missing]})
    if len(value) > limit:
        raise ValidationError({key: [too_long]})
    return value


def clean_trigger(values, kind):
    """The six trigger fields: `score`, `direction` and `threshold` kept for
    `crossed`, `cadence` and `weekday` for `schedule`, the rest cleared."""
    trigger = values.get("trigger") or ""
    if trigger not in Rule.Trigger.values:
        raise ValidationError({"trigger": [CHOOSE_TRIGGER]})
    clean = {
        "trigger": trigger,
        "score": "",
        "direction": "",
        "threshold": None,
        "cadence": "",
        "weekday": None,
    }
    if trigger == Rule.Trigger.CROSSED:
        clean.update(_crossing(values, kind))
    elif trigger == Rule.Trigger.SCHEDULE:
        clean.update(_schedule(values))
    return clean


def _crossing(values, kind):
    if kind == "contact":
        raise ValidationError({"trigger": [NO_CONTACT_SCORES]})
    score = values.get("score") or ""
    direction = values.get("direction") or ""
    threshold = values.get("threshold")
    errors = {}
    if score not in SCORE_RANGES:
        errors["score"] = [CHOOSE_SCORE]
    elif kind == "account" and score == Rule.Score.CES:
        errors["score"] = [NO_ACCOUNT_CES]
    if direction not in Rule.Direction.values:
        errors["direction"] = [CHOOSE_DIRECTION]
    if threshold is None:
        errors["threshold"] = [CHOOSE_THRESHOLD]
    elif score in SCORE_RANGES:
        low, high = SCORE_RANGES[score]
        if not low <= threshold <= high:
            errors["threshold"] = [threshold_range(score)]
    if errors:
        raise ValidationError(errors)
    return {"score": score, "direction": direction, "threshold": threshold}


def _schedule(values):
    cadence = values.get("cadence") or ""
    if cadence not in Rule.Cadence.values:
        raise ValidationError({"cadence": [CHOOSE_CADENCE]})
    if cadence == Rule.Cadence.MONTHLY:
        return {"cadence": cadence, "weekday": None}
    weekday = values.get("weekday")
    if not _integer(weekday) or not 0 <= weekday <= 6:
        raise ValidationError({"weekday": [CHOOSE_WEEKDAY]})
    return {"cadence": cadence, "weekday": weekday}


def _notify(item, kind, owner):
    to = item.get("to")
    if to not in ("me", "record_owner", "people"):
        raise ValidationError({"to": [CHOOSE_RECIPIENTS]})
    message = _text(item, "message", MAX_MESSAGE, LONG_MESSAGE)
    people = []
    if to == "people":
        people = item.get("people")
        if not isinstance(people, list) or not people or not all(map(_integer, people)):
            raise ValidationError({"people": [NO_PEOPLE]})
        people = list(dict.fromkeys(people))
        if len(people) > MAX_SHARED:
            raise ValidationError({"people": [TOO_MANY_PEOPLE]})
        # SOC2:AUTH-02 only active teammates in the owner's own workspace are told anything
        found = User.objects.filter(
            pk__in=people, organisation_id=owner.organisation_id, is_active=True
        ).count()
        if found != len(people):
            raise ValidationError({"people": [UNKNOWN_PEOPLE]})
    return {"action": "notify", "to": to, "people": people, "message": message}


def _task(item, kind, owner):
    title = _text(item, "title", MAX_TITLE, LONG_TITLE, missing=NO_TITLE)
    assignee = item.get("assignee", "record_owner")
    if assignee not in ("record_owner", "me"):
        raise ValidationError({"assignee": [CHOOSE_ASSIGNEE]})
    due = item.get("due_in_days", DEFAULT_DUE_DAYS)
    if not _integer(due) or not 0 <= due <= MAX_DUE_DAYS:
        raise ValidationError({"due_in_days": [DUE_RANGE]})
    return {"action": "task", "title": title, "assignee": assignee, "due_in_days": due}


def _lifecycle(item, kind, owner):
    if kind == "contact":
        raise ValidationError({"action": [NO_CONTACT_LIFECYCLE]})
    stage = item.get("stage")
    if stage not in Customer.LifecycleStage.values:
        raise ValidationError({"stage": [CHOOSE_STAGE]})
    return {"action": "lifecycle", "stage": stage}


def _survey(item, kind, owner):
    survey_type = item.get("survey_type")
    if survey_type not in Survey.SurveyType.values:
        raise ValidationError({"survey_type": [CHOOSE_SURVEY_TYPE]})
    subject = _text(item, "subject", MAX_SUBJECT, LONG_SUBJECT, missing=NO_SUBJECT)
    intro = _text(item, "intro", MAX_INTRO, LONG_INTRO)
    roles = item.get("roles", [])
    if not isinstance(roles, list) or not all(role in Contact.Role.values for role in roles):
        raise ValidationError({"roles": [CHOOSE_ROLES]})
    roles = list(dict.fromkeys(roles))
    if kind == "contact":
        roles = []
    elif kind is not None and not roles:
        raise ValidationError({"roles": [NO_ROLES]})
    without_review = item.get("without_review", False)
    if not isinstance(without_review, bool):
        raise ValidationError({"without_review": [YES_OR_NO]})
    return {
        "action": "survey",
        "survey_type": survey_type,
        "subject": subject,
        "intro": intro,
        "roles": roles,
        "without_review": without_review,
    }


def _plan(item, kind, owner):
    """`{"action": "plan", "template": <id>}`. The template may be sent as an
    id or as the `{id, name}` the rule's payload shows."""
    template = item.get("template")
    if isinstance(template, dict):
        template = template.get("id")
    # SOC2:AUTH-02 a rule starts plans only from templates its owner may read
    if not _integer(template) or not readable_templates(owner).filter(pk=template).exists():
        raise ValidationError({"template": [CHOOSE_PLAN_TEMPLATE]})
    return {"action": "plan", "template": template}


def _campaign(item, kind, owner):
    """`{"action": "campaign", "campaign": <id>, "without_review": <bool>}`.
    The campaign may be sent as an id or as the `{id, name}` the rule's
    payload shows. It must be the owner's own, not archived, with a segment
    of the rule's kind (any kind while the rule has no segment)."""
    campaign = item.get("campaign")
    if isinstance(campaign, dict):
        campaign = campaign.get("id")
    usable = False
    if _integer(campaign):
        # SOC2:AUTH-02 a rule sends only its owner's own campaigns
        found = Campaign.objects.filter(
            pk=campaign,
            owner=owner,
            organisation_id=owner.organisation_id,
            segment__isnull=False,
        ).exclude(status=Campaign.Status.ARCHIVED)
        if kind is not None:
            found = found.filter(segment__kind=kind)
        usable = found.exists()
    if not usable:
        raise ValidationError({"campaign": [CHOOSE_CAMPAIGN]})
    without_review = item.get("without_review", False)
    if not isinstance(without_review, bool):
        raise ValidationError({"without_review": [YES_OR_NO]})
    return {"action": "campaign", "campaign": campaign, "without_review": without_review}


CLEANERS = {
    "notify": _notify,
    "task": _task,
    "lifecycle": _lifecycle,
    "survey": _survey,
    "plan": _plan,
    "campaign": _campaign,
}


def clean_actions(actions, kind, owner):
    """One to three actions, each type once, each normalised. Errors are a
    list aligned with the actions: `{}` for a good one."""
    if not isinstance(actions, list) or not MIN_ACTIONS <= len(actions) <= MAX_ACTIONS:
        raise ValidationError({"actions": [ACTION_COUNT]})
    cleaned, errors, seen = [], [], set()
    for item in actions:
        try:
            name = item.get("action") if isinstance(item, dict) else None
            if not isinstance(name, str) or name not in CLEANERS:
                raise ValidationError({"action": [CHOOSE_ACTION]})
            if name in seen:
                raise ValidationError({"action": [ONE_OF_EACH]})
            seen.add(name)
            cleaned.append(CLEANERS[name](item, kind, owner))
            errors.append({})
        except ValidationError as exc:
            errors.append(exc.detail)
    if any(errors):
        raise ValidationError({"actions": errors})
    return cleaned
