"""Undo (spec §1.5): an applied action, for 7 days, by anyone who could
have approved it. The kind restores exactly what it set, or refuses with
ChangedSince when someone changed it since. The approver, or the record's
owner for an Auto action, is told, unless they did the undo."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core import audit
from services.customers.models import Customer
from services.customers.scoping import can_open
from services.metrics.models import AgentAction

from .deciding import AlreadyDecided, CantDecide, _check_owner_right, decided_as, locked
from .kinds import ChangedSince
from .registry import REGISTRY

S = AgentAction.Status
UNDO_DAYS = 7
#: An irreversible step whose kind names no sentence of its own.
CANT_UNDO = "This can't be undone."
#: kind -> what the notice calls the change
CHANGE = {
    "record.lifecycle": "lifecycle change",
    "record.owner": "owner change",
    "record.attribute": "attribute change",
    "task.create": "new task",
    "task.reassign": "reassignment",
    "task.redate": "due date change",
    "task.complete": "completed task",
    "task.snooze": "snooze",
    "note.create": "note",
    "draft.reply": "draft reply",
    "plan.start": "plan",
    "segment.create": "segment",
    "scenario.create": "scenario",
    "campaign.create": "campaign",
    "canvas.create": "map",
    "plan.template": "plan template",
    "initiative.create": "initiative",
    "survey.send": "survey",
    "campaign.send": "campaign",
    "survey.record": "survey",
    "segment.pin": "segment pin",
    "scenario.run": "scenario run",
    "record.diagnose": "diagnosis note",
    "mail.compose": "draft email",
    "mail.send_draft": "email",
    "report.sales": "sales report",
}


class NotApplied(Exception):
    """Only an applied action can be undone."""


class UndoExpired(Exception):
    """More than 7 days since it applied."""


def undo_window(action):
    if action.applied_at is None:
        return None
    return action.applied_at + timedelta(days=UNDO_DAYS)


def undo(reader, pk):
    """Undo action `pk` as `reader`. The refusal order is: 403 (cannot
    decide), already undone, not applied, ran irreversibly (its kind's
    changed-since sentence, contract §3), expired, changed since. The 404
    for another workspace is the view's check, before this call."""
    with transaction.atomic():
        action = locked(pk)
        role = decided_as(reader, action)
        if role is None:
            raise CantDecide()
        # Undoing an owner change needs the owner-change right, as approving it did.
        _check_owner_right(reader, action)
        if action.status == S.UNDONE:
            raise AlreadyDecided(action)
        if action.status != S.APPLIED:
            raise NotApplied()
        if action.irreversible:
            raise ChangedSince(REGISTRY[action.kind].cant_undo or CANT_UNDO)
        until = undo_window(action)
        # An applied action with no applied_at can't prove it is inside the window.
        if until is None or timezone.now() > until:
            raise UndoExpired()
        REGISTRY[action.kind].undo(action, reader)
        action.status = S.UNDONE
        action.undone_by = reader
        action.undone_at = timezone.now()
        action.save(update_fields=["status", "undone_by", "undone_at"])
        audit.record(  # SOC2:LOG-01
            "agent_action.undone",
            actor=reader,
            organisation=action.organisation,
            target=action,
            target_repr=f"Action {action.pk}",
            metadata={
                "kind": action.kind,
                "agent": action.agent,
                "before": action.before,
                "after": action.after,
                "undone_as": role,
            },
        )
        _tell(action, reader)
    return action


def _tell(action, reader):
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    record = action.record
    if action.auto:
        recipient = getattr(record, "owner", None)
    else:
        recipient = action.decided_by
    if recipient is None or not recipient.is_active or recipient.pk == reader.pk:
        return
    agent = AgentAction.Agent(action.agent).label
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if record is not None and can_open(recipient, record):
        message = f"{reader.name} undid the {agent}'s {CHANGE[action.kind]} on {record.name}."
    elif record is None:
        message = f"{reader.name} undid the {agent}'s {CHANGE[action.kind]}."
    else:
        noun = "an organisation" if isinstance(record, Customer) else "an account"
        message = f"{reader.name} undid an agent action on {noun} you can't open."
    notify(
        recipient=recipient,
        actor=reader,
        kind=Notification.Kind.AGENT_ACTION_UNDONE,
        message=message[:500],
        link=f"/work?queue=history&bundle={action.bundle_id}",
        push_on_commit=True,
    )
