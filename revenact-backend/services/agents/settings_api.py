"""GET/PATCH /agents/settings/ (contract): the AI switch and tone, each
agent's switch and budget, and the grid. Every problem comes back at once;
a value equal to the stored one is not a change; setting a kind to never
expires its pending actions (Decision 4)."""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core import audit
from services.accounts.capabilities import Capability
from services.accounts.models import Organisation
from services.customers.scoping import sees_everything
from services.metrics.models import AgentAction

from . import fast_lane, policy
from .deciding import expire, locked
from .kinds import ASK, LEVELS, NEVER, RANK
from .models import AgentPolicy, AgentProfile
from .payloads import card
from .policy import AGENTS, grid, level, policy_for, profiles_for
from .registry import REGISTRY

ON_OR_OFF = "Choose on or off."
CHOOSE_TONE = "Choose professional, friendly or concise."
UNKNOWN_AGENT = "Unknown agent."
NOT_USED = "That agent doesn't use this action."
CHOOSE_LEVEL = "Choose auto, ask or never."
NO_AUTO = "This action can't be set to auto."
ALWAYS_ASKS = "This action always asks."
CHOOSE_INTERVAL = "Choose every 30 minutes, every hour, every 4 hours or once a day."
UNKNOWN_SOURCE = "Unknown source."
SOURCES_OBJECT = "Send the sources as one object."
TONES = tuple(Organisation.AgentTone.values)


def signals_payload(organisation):
    """Contract §4.8: the interval, its choices, each source and the last run."""
    from rest_framework import serializers

    from . import threads

    connected = threads.connected_sources(organisation)
    ran = organisation.ai_signals_ran_at
    return {
        "interval": organisation.ai_signal_interval,
        "intervals": [
            {"value": value, "label": label} for value, label in Organisation.SignalInterval.choices
        ],
        "sources": [
            {
                "key": key,
                "label": threads.SETTINGS_LABELS[key],
                "enabled": threads.source_on(organisation, key),
                "connected": key in connected,
            }
            for key in threads.SOURCES
        ],
        "last_run_at": None if ran is None else serializers.DateTimeField().to_representation(ran),
        "fast_lane": fast_lane.payload(organisation, timezone.now()),
    }


def payload(organisation, reader):
    from services.work.clock import today_for

    today = today_for(organisation)
    profiles = profiles_for(organisation)
    return {
        "ai_enabled": organisation.ai_agent_enabled,
        "tone": organisation.ai_agent_tone,
        "agents": [card(profiles[agent], organisation, today) for agent in AGENTS],
        "signals": signals_payload(organisation),
        "kinds": [
            {
                "kind": spec.key,
                "label": spec.label,
                "example": spec.example,
                "max_level": spec.max_level,
                "agents": list(spec.agents),
                "irreversible": spec.irreversible or spec.outside,
                "outside": spec.outside,
                "locked": spec.outside,
            }
            for spec in REGISTRY.values()
        ],
        "levels": grid(policy_for(organisation)),
        "plan_monthly_credits": policy.plan_credits(organisation),
        "can_edit": reader.has_capability(Capability.MANAGE_ORG_SETTINGS),
        # SOC2:AUTH-02 the Run now rule, so the page offers what the route allows
        "can_run": reader.has_capability(Capability.MANAGE_ORG_SETTINGS) or sees_everything(reader),
    }


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def changes_from(organisation, data):
    """{"organisation": {...}, "agents": {agent: {...}}, "levels": {...}}."""
    if not isinstance(data, dict):
        raise ValidationError({"non_field_errors": ["Send the fields as one object."]})
    errors = {}
    changes = {"organisation": {}, "agents": {}, "levels": {}}
    if "ai_enabled" in data:
        if isinstance(data["ai_enabled"], bool):
            if data["ai_enabled"] != organisation.ai_agent_enabled:
                changes["organisation"]["ai_agent_enabled"] = data["ai_enabled"]
        else:
            errors["ai_enabled"] = [ON_OR_OFF]
    if "tone" in data:
        if data["tone"] in TONES:
            if data["tone"] != organisation.ai_agent_tone:
                changes["organisation"]["ai_agent_tone"] = data["tone"]
        else:
            errors["tone"] = [CHOOSE_TONE]
    if "signal_interval" in data:
        value = data["signal_interval"]
        if value in Organisation.SignalInterval.values:
            if value != organisation.ai_signal_interval:
                changes["organisation"]["ai_signal_interval"] = value
        else:
            errors["signal_interval"] = [CHOOSE_INTERVAL]
    if "signal_sources" in data:
        wrong = _sources(organisation, data["signal_sources"], changes["organisation"])
        if wrong:
            errors["signal_sources"] = wrong
    if "fast_lane" in data:
        merged, wrong = fast_lane.clean(organisation, data["fast_lane"])
        if wrong:
            errors["fast_lane"] = wrong
        elif merged != fast_lane.settings(organisation):
            changes["organisation"]["ai_fast_lane"] = merged
    if "agents" in data:
        wrong = _agents(organisation, data["agents"], changes["agents"])
        if wrong:
            errors["agents"] = wrong
    if "levels" in data:
        wrong = _levels(organisation, data["levels"], changes["levels"])
        if wrong:
            errors["levels"] = wrong
    if errors:
        raise ValidationError(errors)
    return changes


def _sources(organisation, asked, out):
    """D2-23, D2-26: the switches, merged over what is stored; a change only
    when some source's on/off differs."""
    from . import threads

    if not isinstance(asked, dict):
        return [SOURCES_OBJECT]
    stored = dict(organisation.ai_signal_sources or {})
    merged = dict(stored)
    errors = {}
    for key, value in asked.items():
        if key not in threads.SOURCES:
            errors[key] = [UNKNOWN_SOURCE]
        elif not isinstance(value, bool):
            errors[key] = [ON_OR_OFF]
        else:
            merged[key] = value
    if errors:
        return errors

    def on(sources, key):
        return sources.get(key, True) is not False

    if any(on(merged, key) != on(stored, key) for key in threads.SOURCES):
        out["ai_signal_sources"] = merged
    return {}


def _agents(organisation, asked, out):
    if not isinstance(asked, dict):
        return [UNKNOWN_AGENT]
    profiles = profiles_for(organisation)
    ceiling = policy.plan_credits(organisation)
    errors = {}
    for agent, fields in asked.items():
        if agent not in AGENTS or not isinstance(fields, dict):
            errors[agent] = [UNKNOWN_AGENT]
            continue
        wrong = {}
        if "enabled" in fields:
            if isinstance(fields["enabled"], bool):
                if fields["enabled"] != profiles[agent].enabled:
                    out.setdefault(agent, {})["enabled"] = fields["enabled"]
            else:
                wrong["enabled"] = [ON_OR_OFF]
        if "monthly_credits" in fields:
            value = fields["monthly_credits"]
            if _whole(value) and 0 <= value <= ceiling:
                if value != profiles[agent].monthly_credits:
                    out.setdefault(agent, {})["monthly_credits"] = value
            else:
                wrong["monthly_credits"] = [f"Choose a whole number from 0 to {ceiling}."]
        if wrong:
            errors[agent] = wrong
    return errors


def _levels(organisation, asked, out):
    if not isinstance(asked, dict):
        return [UNKNOWN_AGENT]
    prefs = policy_for(organisation)
    errors = {}
    for agent, kinds in asked.items():
        if agent not in AGENTS or not isinstance(kinds, dict):
            errors[agent] = [UNKNOWN_AGENT]
            continue
        wrong = {}
        for kind, value in kinds.items():
            spec = REGISTRY.get(kind)
            if spec is None or agent not in spec.agents:
                wrong[kind] = [NOT_USED]
            elif value not in LEVELS:
                wrong[kind] = [CHOOSE_LEVEL]
            elif spec.outside and value != ASK:
                wrong[kind] = [ALWAYS_ASKS]
            elif RANK[value] < RANK[spec.max_level]:
                wrong[kind] = [NO_AUTO]
            elif value != level(prefs, agent, kind):
                out.setdefault(agent, {})[kind] = value
        if wrong:
            errors[agent] = wrong
    return errors


def _old_organisation_value(organisation, name):
    # The fast lane's stored JSON may be {}: the audit shows the defaults-filled settings.
    if name == "ai_fast_lane":
        return fast_lane.settings(organisation)
    return getattr(organisation, name)


def _old_and_new(organisation, changes):
    """{key: {"old", "new"}} for each changed key, for the audit entry."""
    profiles = profiles_for(organisation)
    prefs = policy_for(organisation)
    return {
        "organisation": {
            name: {"old": _old_organisation_value(organisation, name), "new": value}
            for name, value in changes["organisation"].items()
        },
        "agents": {
            agent: {
                name: {"old": getattr(profiles[agent], name), "new": value}
                for name, value in values.items()
            }
            for agent, values in changes["agents"].items()
        },
        "levels": {
            agent: {
                kind: {"old": level(prefs, agent, kind), "new": value}
                for kind, value in kinds.items()
            }
            for agent, kinds in changes["levels"].items()
        },
    }


def save(organisation, reader, changes, request=None):
    old_and_new = _old_and_new(organisation, changes)
    with transaction.atomic():
        for agent, values in changes["agents"].items():
            AgentProfile.objects.filter(organisation=organisation, kind=agent).update(
                updated_by=reader, **values
            )
        if changes["levels"]:
            prefs = AgentPolicy.objects.select_for_update().get(pk=policy_for(organisation).pk)
            levels = dict(prefs.levels or {})
            never = Q(pk__in=[])
            for agent, kinds in changes["levels"].items():
                levels[agent] = {**levels.get(agent, {}), **kinds}
                for kind, value in kinds.items():
                    if value == NEVER:
                        never |= Q(agent=agent, kind=kind)
            # Every lock is held to the end of this transaction, across bundles:
            # a locker of several bundles takes them in ascending id order (the
            # nightly pass locks a twin's older bundle before its new one), so
            # the two can never deadlock.
            pending = (
                AgentAction.objects.filter(never, organisation=organisation)
                .filter(status=AgentAction.Status.PROPOSED)
                .order_by("bundle_id", "pk")
                .values_list("pk", flat=True)
            )
            for pk in list(pending):
                with transaction.atomic():
                    action = locked(pk)
                    # Decided meanwhile: leave it.
                    if action.status == AgentAction.Status.PROPOSED:
                        expire(action, "never", reader)
            prefs.levels = levels
            prefs.updated_by = reader
            prefs.save(update_fields=["levels", "updated_by", "updated_at"])
        # After the Never sweep: a running send step holds its bundle, then the
        # workspace (a claim's lock), so the bundles are taken first here too.
        fields = changes["organisation"]
        if fields:
            Organisation.objects.filter(pk=organisation.pk).update(**fields)
        audit.record(  # SOC2:LOG-01
            "agents.settings_update",
            request=request,
            actor=reader,
            organisation=organisation,
            metadata={
                "fields": sorted(changes["organisation"]),
                "agents": sorted(changes["agents"]),
                "levels": {a: sorted(k) for a, k in changes["levels"].items()},
                # The changed keys' old and new values: switches, a tone,
                # budgets and levels, no personal data.
                "changes": old_and_new,
            },
        )
