"""Whether an agent made an object (contract, "Made by the agent"): a
segment, scenario, campaign, map or plan template page names the agent and
the person who approved it. Lists load `RELATED` with the object, so this
reads no row."""

#: What a queryset loads so `made_by` reads nothing more.
RELATED = "agent_action__decided_by"


def made_by(obj):
    """`{"agent", "approved_by": {"id", "name"} | None}`, or None when no
    agent action made `obj`."""
    if obj.agent_action_id is None:
        return None
    action = obj.agent_action
    decider = action.decided_by
    return {
        "agent": action.agent,
        "approved_by": None if decider is None else {"id": decider.pk, "name": decider.name},
    }
