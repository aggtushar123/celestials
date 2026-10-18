"""What Assign prefills (Work round §2.3 Assign): the title, a due date and
a priority, from the recommendation's kind and record."""

from datetime import date, timedelta

from .clock import WORKING_DAYS, add_working_days
from .models import Recommendation

K = Recommendation.Kind
RENEWAL_LEAD = timedelta(days=7)
WORKING_DAYS_TO_DO = 3
PRIORITIES = ("high", "medium", "low")
PRIORITY = {
    K.RENEWAL_DUE: "high",
    K.HEALTH_DROP: "high",
    K.URGENT_TICKETS: "high",
    K.ANOMALY: "high",
}


def default_due(rec, today, working_days=WORKING_DAYS):
    """A week before the renewal; the AI agent's own date; otherwise three
    working days away (the workspace's working days). Never before today."""
    if rec.kind == K.RENEWAL_DUE and rec.record.renewal_date is not None:
        return max(today, rec.record.renewal_date - RENEWAL_LEAD)
    if rec.agent_action_id is not None:
        action = rec.agent_action.payload
        # A malformed proposal action (not the dict generation validated) is
        # treated as having no date, never a 500 reading the list.
        if isinstance(action, dict):
            try:
                return max(today, date.fromisoformat(str(action.get("due_date"))))
            except ValueError:
                pass
    return add_working_days(today, WORKING_DAYS_TO_DO, working_days)


def default_priority(rec):
    if rec.agent_action_id is not None:
        action = rec.agent_action.payload
        if isinstance(action, dict) and action.get("priority") in PRIORITIES:
            return action["priority"]
    return PRIORITY.get(rec.kind, "medium")


def defaults(rec, today, working_days=WORKING_DAYS):
    return {
        "title": rec.title,
        "due_date": default_due(rec, today, working_days).isoformat(),
        "priority": default_priority(rec),
    }


def describe(facts):
    """The task's description: why it was recommended."""
    if not facts:
        return ""
    return "Recommended by Revenact:\n" + "\n".join(f"- {fact}" for fact in facts)
