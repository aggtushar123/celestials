"""The old Proposal words, for the routes and rows that still speak them.

`Proposal` became `AgentAction` in place (Agents round Decision 1). Copilot's
session decisions, the feedback log and the Brain graph keep answering in the
old `task`/`initiative` kinds, the `approved` status and the nested `action`
dict, so none of their callers change. One home for the maps keeps `graph`, `feedback` and
`proposal_access` from importing each other.
"""

from .models import AgentAction

LEGACY_KIND = {
    AgentAction.Kind.TASK_CREATE: "task",
    AgentAction.Kind.INITIATIVE_CREATE: "initiative",
}

LEGACY_STATUS = {
    AgentAction.Status.PROPOSED: ("proposed", "Proposed"),
    AgentAction.Status.APPLIED: ("approved", "Approved"),
    AgentAction.Status.UNDONE: ("approved", "Approved"),
    AgentAction.Status.REJECTED: ("rejected", "Rejected"),
    AgentAction.Status.EXPIRED: ("rejected", "Rejected"),
}


def legacy_action(action):
    """The `action` dict the old API showed: a task carried its organisation
    inside it, which is now the `customer` column."""
    if action.kind != AgentAction.Kind.TASK_CREATE:
        return action.payload
    customer = action.customer
    return {
        "customer_id": action.customer_id,
        "customer_name": customer.name if customer is not None else "",
        **{k: v for k, v in action.payload.items() if k != "assignee_id"},
    }
