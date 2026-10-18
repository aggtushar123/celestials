"""The fast lane (agent bundles round 2 D3, contract §5, R2D3-13 to
R2D3-19): rules only, never a model; off by default; a 2-minute quiet window
on a 5-minute tick; at most 10 calls an hour and 50 a day per workspace,
each an ordinary agent call (credits, budget)."""

import re
from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email

from services.metrics.models import AgentAction

SCOPE_KEY = "fast_lane"
QUIET = timedelta(minutes=2)
TICK = timedelta(minutes=5)
TICK_GRACE = timedelta(seconds=30)
MAX_PER_TICK = 10
PER_HOUR_MAX = 10
PER_DAY_MAX = 50
WORDS_MAX = 20
SENDERS_MAX = 50
TEXT_CHARS = 2000
AGENT_PURPOSES = tuple(f"agent_{agent}" for agent in AgentAction.Agent.values)

DEFAULT_RULES = {
    "jira_priority": True,
    "slack_connectors": [],
    "senders": [],
    "words": [],
    "poor_health": False,
}
DEFAULTS = {"on": False, "per_hour": PER_HOUR_MAX, "per_day": PER_DAY_MAX}

LANE_OBJECT = "Send the fast lane as one object."
UNKNOWN = "Unknown setting."
ON_OR_OFF = "Choose on or off."
TOO_MANY_WORDS = f"Add at most {WORDS_MAX} words."
WORD_SIZE = "Use 2 to 40 characters for each word."
TOO_MANY_SENDERS = f"Add at most {SENDERS_MAX} senders."
SENDER_SHAPE = "Use an email address or @domain for each sender."
SLACK_FROM_LIST = "Choose Slack connections from the list."
HOURLY = f"Choose a whole number from 0 to {PER_HOUR_MAX}."
DAILY = f"Choose a whole number from 0 to {PER_DAY_MAX}."
HOUR_OVER_DAY = "The hourly limit can't be more than the daily limit."
DOMAIN = re.compile(r"^@[a-z0-9-]+(\.[a-z0-9-]+)+$")


def settings(organisation):
    stored = organisation.ai_fast_lane if isinstance(organisation.ai_fast_lane, dict) else {}
    rules = {**DEFAULT_RULES, **(stored.get("rules") or {})}
    return {**DEFAULTS, **{k: stored[k] for k in DEFAULTS if k in stored}, "rules": rules}


def _whole(value, top):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= top


def _sender(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    if len(value) > 254:  # an email field's length; a longer @domain can never match
        return None
    if DOMAIN.match(value):
        return value
    try:
        validate_email(value)
    except DjangoValidationError:
        return None
    return value


def _clean_rules(organisation, asked, rules, errors):
    from services.connectors.models import Connector

    for key, value in asked.items():
        if key in ("jira_priority", "poor_health"):
            if isinstance(value, bool):
                rules[key] = value
            else:
                errors[key] = [ON_OR_OFF]
        elif key == "words":
            if not isinstance(value, list) or len(value) > WORDS_MAX:
                errors[key] = [TOO_MANY_WORDS]
                continue
            words = [w.strip().lower() if isinstance(w, str) else "" for w in value]
            if any(not 2 <= len(w) <= 40 for w in words):
                errors[key] = [WORD_SIZE]
            else:
                rules[key] = list(dict.fromkeys(words))
        elif key == "senders":
            if not isinstance(value, list) or len(value) > SENDERS_MAX:
                errors[key] = [TOO_MANY_SENDERS]
                continue
            senders = [_sender(v) for v in value]
            if None in senders:
                errors[key] = [SENDER_SHAPE]
            else:
                rules[key] = list(dict.fromkeys(senders))
        elif key == "slack_connectors":
            # SOC2:AUTH-02 only this workspace's own Slack connectors may be named
            mine = set(
                Connector.objects.filter(
                    organisation=organisation, provider=Connector.Provider.SLACK
                ).values_list("id", flat=True)
            )
            ok = isinstance(value, list) and all(
                isinstance(v, int) and not isinstance(v, bool) and v in mine for v in value
            )
            if ok:
                rules[key] = sorted(set(value))
            else:
                errors[key] = [SLACK_FROM_LIST]
        else:
            errors[key] = [UNKNOWN]


def clean(organisation, asked):
    """(the merged settings to store, {} ) or (None, the errors) (contract §5.2)."""
    if not isinstance(asked, dict):
        return None, [LANE_OBJECT]
    merged = settings(organisation)
    rules = dict(merged["rules"])
    errors = {}
    for key, value in asked.items():
        if key == "on":
            if isinstance(value, bool):
                merged["on"] = value
            else:
                errors["on"] = [ON_OR_OFF]
        elif key == "per_hour":
            if _whole(value, PER_HOUR_MAX):
                merged["per_hour"] = value
            else:
                errors["per_hour"] = [HOURLY]
        elif key == "per_day":
            if _whole(value, PER_DAY_MAX):
                merged["per_day"] = value
            else:
                errors["per_day"] = [DAILY]
        elif key == "rules":
            if not isinstance(value, dict):
                errors["rules"] = [LANE_OBJECT]
                continue
            wrong = {}
            _clean_rules(organisation, value, rules, wrong)
            if wrong:
                errors["rules"] = wrong
        else:
            errors[key] = [UNKNOWN]
    if not errors and merged["per_hour"] > merged["per_day"]:
        errors["per_hour"] = [HOUR_OVER_DAY]
    if errors:
        return None, errors
    merged["rules"] = rules
    return merged, {}


def used(organisation, now):
    """(fast-lane calls in the last hour, in the last 24 hours) (R2D3-18)."""
    from services.copilot.models import ModelCall

    rows = ModelCall.objects.filter(
        organisation=organisation,
        purpose__in=AGENT_PURPOSES,
        scope_key=SCOPE_KEY,
        outcome=ModelCall.Outcome.OK,
        created_at__gte=now - timedelta(hours=24),
    )
    return rows.filter(created_at__gte=now - timedelta(hours=1)).count(), rows.count()


def payload(organisation, now):
    from services.connectors.models import Connector

    current = settings(organisation)
    hour, day = used(organisation, now)
    slack = Connector.objects.filter(
        organisation=organisation, provider=Connector.Provider.SLACK, is_enabled=True
    ).order_by("name", "id")
    return {
        **current,
        "used_hour": hour,
        "used_day": day,
        "limits": {
            "per_hour": PER_HOUR_MAX,
            "per_day": PER_DAY_MAX,
            "senders": SENDERS_MAX,
            "words": WORDS_MAX,
        },
        "slack_choices": [{"id": c.pk, "name": c.name} for c in slack],
    }


def _word_in(term, text):
    return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text, re.IGNORECASE) is not None


def _poor(record):
    if record is None:
        return False
    from services.customers.models import Customer, health_category_for

    score = getattr(record, "health_score", None)
    return score is not None and health_category_for(score) == Customer.HealthCategory.POOR


def rule_for(lane, *, source, connector_id, priority, sender, text, record):
    """The first rule the item matches, in the contract §5.3 order, else "".
    `record` is a zero-argument callable, called only if the poor_health rule is reached."""
    if not lane["on"]:
        return ""
    rules = lane["rules"]
    sender = (sender or "").lower()
    if source == "slack" and connector_id in rules["slack_connectors"]:
        return "slack_channel"
    if source == "jira" and rules["jira_priority"] and priority == "critical":
        return "jira_priority"
    domain = "@" + sender.rsplit("@", 1)[-1] if "@" in sender else ""
    if sender and any(s == sender or s == domain for s in rules["senders"]):
        return "sender"
    if any(_word_in(word, text) for word in rules["words"]):
        return "word"
    if rules["poor_health"] and _poor(record()):
        return "poor_health"
    return ""


def for_ticket(ticket):
    connector = ticket.connector
    lane = settings(connector.organisation)
    if not lane["on"]:
        return ""
    return rule_for(
        lane,
        source=connector.provider,
        connector_id=connector.pk,
        priority=ticket.priority,
        sender=ticket.requester_email,
        text=f"{ticket.title}\n{ticket.description[:TEXT_CHARS]}",
        record=lambda: ticket.account or ticket.customer,
    )


def for_conversation(conversation):
    """SE1-14: a Slack conversation's newest human message."""
    connector = conversation.connector
    lane = settings(connector.organisation)
    if not lane["on"]:
        return ""
    humans = [m for m in conversation.messages or [] if not m.get("bot")]
    newest = humans[-1]["text"] if humans else ""
    return rule_for(
        lane,
        source="slack",
        connector_id=connector.pk,
        priority="",
        sender=conversation.started_by_email,
        text=f"{conversation.title}\n{newest[:TEXT_CHARS]}",
        record=lambda: conversation.record,
    )


def for_email(email):
    lane = settings(email.mailbox.organisation)
    if not lane["on"]:
        return ""
    return rule_for(
        lane,
        source="mail",
        connector_id=None,
        priority="",
        sender=email.from_address,
        text=f"{email.subject}\n{email.body[:TEXT_CHARS]}",
        record=lambda: email.account or email.customer,
    )
