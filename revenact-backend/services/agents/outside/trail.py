"""`agent_outside.call` (agent bundles D3 contract D3-14): who called which
tool for which step, where, what came back. Never text, names or recipients."""

from core import audit

from .keys import key_for


def call(step, actor, *, tool, op, outcome, where="", returned="", as_=""):
    metadata = {
        "kind": step.kind,
        "bundle": step.bundle_id,
        "tool": tool,
        "op": op,
        "outcome": outcome,
        "where": where,
        "returned": returned,
        "key": key_for(step),
    }
    if as_:
        # A Jira call: "person" (the runner's own link) or "connection" (R2D2-14).
        metadata["as"] = as_
    audit.record(  # SOC2:LOG-01 an agent step's call to a tool outside Revenact
        "agent_outside.call",
        actor=actor,
        organisation=step.organisation,
        target=step,
        target_repr=f"Action {step.pk}",
        metadata=metadata,
    )
