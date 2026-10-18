"""A workspace's Work settings (spec §2.1): made the first time anyone asks,
with the defaults in `models.DEFAULT_SOURCES`. Every reader goes through
`effective_sources`, so a stored value missing a kind or a field reads as
its default."""

from functools import cache
from zoneinfo import available_timezones

from django.conf import settings as django_settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from services.accounts.capabilities import Capability

from .clock import working
from .models import DEFAULT_SOURCES, WorkSettings


def settings_for(organisation):
    """The workspace's settings, made with the defaults the first time."""
    found = WorkSettings.objects.filter(organisation=organisation).first()
    if found is not None:
        return found
    try:
        with transaction.atomic():
            return WorkSettings.objects.create(organisation=organisation)
    except IntegrityError:
        # Someone else made them first.
        return WorkSettings.objects.get(organisation=organisation)


def effective_sources(prefs):
    """Every kind and every field: the stored value where there is one,
    else the default. Unknown stored kinds and fields are dropped."""
    stored = prefs.sources if isinstance(prefs.sources, dict) else {}
    merged = {}
    for kind, defaults in DEFAULT_SOURCES.items():
        mine = stored.get(kind)
        mine = mine if isinstance(mine, dict) else {}
        merged[kind] = {name: mine.get(name, value) for name, value in defaults.items()}
    return merged


SEND_AN_OBJECT = "Send the fields as one object."
CHOOSE_RECIPIENT = "Choose manager or owner."
SEND_SOURCES_OBJECT = "Send the sources as one object."
SEND_SOURCE_OBJECT = "Send each source's settings as one object."
UNKNOWN_SOURCE = "Unknown source."
UNKNOWN_SETTING = "Unknown setting."
ON_OR_OFF = "Choose on or off."
#: (lowest, highest) for each number a source takes; `drop` is a decimal.
LIMITS = {"days": (1, 120), "window_days": (1, 120), "min": (1, 50), "drop": (0.1, 5)}
COOLDOWN_LIMITS = (0, 120)
CHOOSE_TIMEZONE = "Choose a timezone from the list."
CHOOSE_WORKING_DAYS = "Choose at least one working day."
ESCALATE_LIMITS = (1, 30)
HOUR_LIMITS = (0, 23)
#: Mail backends that send nothing: the digest is skipped (spec §3.2).
NOT_SENDING = {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
}


@cache
def timezones():
    return frozenset(available_timezones()) | {"UTC"}


def email_ready():
    """Whether this server can send email at all (spec §3.3 `email_ready`)."""
    return django_settings.EMAIL_BACKEND not in NOT_SENDING


def whole_number(low, high):
    return f"Choose a whole number from {low} to {high}."


def payload(prefs, reader):
    """`GET /work/settings/`."""
    return {
        "recommend_to": prefs.recommend_to,
        "sources": effective_sources(prefs),
        "dismiss_cooldown_days": prefs.dismiss_cooldown_days,
        "timezone": prefs.timezone,
        "working_days": list(working(prefs)),
        "escalate_after_days": prefs.escalate_after_days,
        "digest_enabled": prefs.digest_enabled,
        "digest_hour": prefs.digest_hour,
        "email_ready": email_ready(),
        "can_edit": reader.has_capability(Capability.MANAGE_ORG_SETTINGS),
    }


def _is_whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _number(name, value):
    """`value` for the setting `name`, or the message saying why not."""
    low, high = LIMITS[name]
    if name == "drop":
        if isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high:
            return round(float(value), 1), None
        return None, f"Choose a number from {low} to {high}."
    if _is_whole(value) and low <= value <= high:
        return value, None
    return None, whole_number(low, high)


def _sources(prefs, asked):
    """The workspace's sources with `asked` applied, and the errors."""
    if not isinstance(asked, dict):
        return None, [SEND_SOURCES_OBJECT]
    merged = effective_sources(prefs)
    errors = {}
    for kind, fields in asked.items():
        if kind not in DEFAULT_SOURCES:
            errors[kind] = [UNKNOWN_SOURCE]
            continue
        if not isinstance(fields, dict):
            errors[kind] = [SEND_SOURCE_OBJECT]
            continue
        wrong = {}
        for name, value in fields.items():
            if name not in DEFAULT_SOURCES[kind]:
                wrong[name] = [UNKNOWN_SETTING]
            elif name == "enabled":
                if isinstance(value, bool):
                    merged[kind]["enabled"] = value
                else:
                    wrong[name] = [ON_OR_OFF]
            else:
                number, message = _number(name, value)
                if message is None:
                    merged[kind][name] = number
                else:
                    wrong[name] = [message]
        if wrong:
            errors[kind] = wrong
    return merged, errors


def _working_days(value):
    if isinstance(value, list) and value and all(_is_whole(d) and 0 <= d <= 6 for d in value):
        return sorted(set(value))
    return None


def _tracking(prefs, data, changes, errors):
    """The delivery 3 fields of `data`, into `changes` and `errors`."""
    if "timezone" in data:
        value = data["timezone"]
        if isinstance(value, str) and value in timezones():
            if value != prefs.timezone:
                changes["timezone"] = value
        else:
            errors["timezone"] = [CHOOSE_TIMEZONE]
    if "working_days" in data:
        days = _working_days(data["working_days"])
        if days is None:
            errors["working_days"] = [CHOOSE_WORKING_DAYS]
        elif days != list(working(prefs)):
            changes["working_days"] = days
    for name, (low, high) in (
        ("escalate_after_days", ESCALATE_LIMITS),
        ("digest_hour", HOUR_LIMITS),
    ):
        if name in data:
            value = data[name]
            if _is_whole(value) and low <= value <= high:
                if value != getattr(prefs, name):
                    changes[name] = value
            else:
                errors[name] = [whole_number(low, high)]
    if "digest_enabled" in data:
        if isinstance(data["digest_enabled"], bool):
            if data["digest_enabled"] != prefs.digest_enabled:
                changes["digest_enabled"] = data["digest_enabled"]
        else:
            errors["digest_enabled"] = [ON_OR_OFF]


def changes_from(prefs, data):
    """The fields `data` sets, validated, as {field: new value}. Raises a
    400 with every problem at once; unknown top-level keys are ignored."""
    if not isinstance(data, dict):
        raise ValidationError({"non_field_errors": [SEND_AN_OBJECT]})
    errors, changes = {}, {}
    if "recommend_to" in data:
        if data["recommend_to"] in WorkSettings.RecommendTo.values:
            # A value that matches what's already stored is not a change:
            # nothing is written, and no audit event is recorded for it.
            if data["recommend_to"] != prefs.recommend_to:
                changes["recommend_to"] = data["recommend_to"]
        else:
            errors["recommend_to"] = [CHOOSE_RECIPIENT]
    if "dismiss_cooldown_days" in data:
        value, (low, high) = data["dismiss_cooldown_days"], COOLDOWN_LIMITS
        if _is_whole(value) and low <= value <= high:
            if value != prefs.dismiss_cooldown_days:
                changes["dismiss_cooldown_days"] = value
        else:
            errors["dismiss_cooldown_days"] = [whole_number(low, high)]
    if "sources" in data:
        sources, wrong = _sources(prefs, data["sources"])
        if wrong:
            errors["sources"] = wrong
        elif sources != effective_sources(prefs):
            changes["sources"] = sources
    _tracking(prefs, data, changes, errors)
    if errors:
        raise ValidationError(errors)
    return changes
