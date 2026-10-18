"""An outside step's idempotency key and look-back window (agent bundles D3
contract D3-11). The key is the bundle and the step; a Retry looks for a
write carrying it since the step's first attempt, less a margin."""

from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from services.metrics.models import AgentAction

LOOKBACK = timedelta(minutes=10)


def key_for(step):
    # SOC2:API-08 one key per step, the same on every Retry
    return f"b{step.bundle_id}-s{step.pk}"


def jira_label(key):
    from services.connectors.providers.jira import LABEL_PREFIX

    return f"{LABEL_PREFIX}{key}"


def attempt(step, runner, now=None):
    """When the step was first tried and by whom; a later attempt keeps the first's."""
    result = step.result if isinstance(step.result, dict) else {}
    return {
        "attempted_at": result.get("attempted_at") or (now or timezone.now()).isoformat(),
        "attempted_by": result.get("attempted_by") or (runner.pk if runner is not None else None),
    }


def since(step):
    result = step.result if isinstance(step.result, dict) else {}
    first = parse_datetime(str(result.get("attempted_at") or ""))
    base = first or step.bundle.run_started_at or step.created_at
    return base - LOOKBACK


def retrying(step):
    """The step failed before: this run is a Retry, and it looks first."""
    return step.status == AgentAction.Status.FAILED
