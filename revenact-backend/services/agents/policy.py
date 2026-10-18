"""Each workspace's three agents and its Actions & approvals grid (spec
§1.1, §1.6, §1.7). Profiles and the grid are made the first time anyone
asks, with the defaults: every agent on, every action on ask, and a budget
of a fifth of the plan's monthly credits, split evenly."""

from datetime import date

from django.conf import settings
from django.db import IntegrityError, transaction

from services.metrics.models import AgentAction

from .kinds import ASK, LEVELS, NEVER, RANK
from .models import AgentPolicy, AgentProfile

AGENTS = tuple(AgentAction.Agent.values)
LABELS = dict(AgentAction.Agent.choices)
#: The share of the plan's monthly credits the agents get by default.
SHARE = 0.2


def plan_credits(organisation):
    from services.billing.accounts import ensure

    return ensure(organisation).plan.monthly_credits


def default_budget(organisation):
    return round(plan_credits(organisation) * SHARE / len(AGENTS))


def profiles_for(organisation):
    """{agent: AgentProfile} in cs, sales, ops order, made when missing."""
    found = {p.kind: p for p in AgentProfile.objects.filter(organisation=organisation)}
    missing = [agent for agent in AGENTS if agent not in found]
    if missing:
        budget = default_budget(organisation)
        for agent in missing:
            try:
                with transaction.atomic():
                    found[agent] = AgentProfile.objects.create(
                        organisation=organisation, kind=agent, monthly_credits=budget
                    )
            except IntegrityError:
                # Someone else made it first.
                found[agent] = AgentProfile.objects.get(organisation=organisation, kind=agent)
    return {agent: found[agent] for agent in AGENTS}


def policy_for(organisation):
    found = AgentPolicy.objects.filter(organisation=organisation).first()
    if found is not None:
        return found
    try:
        with transaction.atomic():
            return AgentPolicy.objects.create(organisation=organisation)
    except IntegrityError:
        return AgentPolicy.objects.get(organisation=organisation)


def level(prefs, agent, kind):
    """The level `agent` acts on `kind` at: never for a kind the agent does
    not use, else the stored value (ask when missing), never above the
    kind's cap."""
    from .registry import REGISTRY

    spec = REGISTRY.get(kind)
    if spec is None or agent not in spec.agents:
        return NEVER
    if spec.outside:
        # An outside kind is always Ask, whatever is stored (D21).
        return ASK
    levels = prefs.levels if isinstance(prefs.levels, dict) else {}
    mine = levels.get(agent) if isinstance(levels.get(agent), dict) else {}
    value = mine.get(kind, ASK)
    if value not in LEVELS:
        value = ASK
    if RANK[value] < RANK[spec.max_level]:
        return spec.max_level
    return value


def grid(prefs):
    """{agent: {kind: level}} for the kinds each agent uses, in registry order."""
    from .registry import REGISTRY

    return {
        agent: {
            key: level(prefs, agent, key) for key, spec in REGISTRY.items() if agent in spec.agents
        }
        for agent in AGENTS
    }


def month_start_instant(organisation, today):
    from services.work.clock import start_of_day

    return start_of_day(organisation, today.replace(day=1))


def spent_this_month(organisation, agent, *, today):
    """Credits the agent's calls cost this month: its successful model
    calls since the 1st (the workspace's midnight), as billing charges them
    (Decision 8)."""
    from services.copilot.models import ModelCall

    calls = ModelCall.objects.filter(
        organisation=organisation,
        purpose=f"agent_{agent}",
        outcome=ModelCall.Outcome.OK,
        created_at__gte=month_start_instant(organisation, today),
    ).count()
    return calls * settings.BILLING_CREDITS_PER_MODEL_CALL


def resets_on(today):
    if today.month == 12:
        return date(today.year + 1, 1, 1)
    return date(today.year, today.month + 1, 1)
