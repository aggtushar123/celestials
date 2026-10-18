"""Deciding a recommendation (Work round §2.3): assign it, which makes the
task, or dismiss it with a reason. The caller has already checked who may
decide (`rec_access.decided_as`) and that they may open the record; the
right to decide is checked again on the locked row (a refresh may have
re-routed it since), and the role found there is the one returned.

Each decision runs under a row lock and re-reads the status there, so of two
deciders the first wins and the second gets `AlreadyDecided` (409, naming
who decided)."""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from services.customers.models import Task
from services.customers.task_access import assignee_for
from services.customers.task_changes import add_task

from .clock import working_days_for
from .defaults import default_due, default_priority, describe
from .models import Recommendation
from .rec_access import RELATED, decided_as

S = Recommendation.Status
REASON = Recommendation.DismissReason
NO_SUCH_RECOMMENDATION = "No such recommendation."
CANT_DECIDE = "You can't decide this recommendation."


class AlreadyDecided(Exception):
    """The recommendation is no longer open; `recommendation` says how."""

    def __init__(self, recommendation):
        super().__init__(recommendation.status)
        self.recommendation = recommendation


class CantDecide(Exception):
    """The reader may no longer decide it (re-routed since the route checked)."""


def _locked(pk):
    # `of=("self",)`: the related joins are nullable (LEFT OUTER), and
    # Postgres refuses FOR UPDATE on their side.
    rec = (
        Recommendation.objects.select_for_update(of=("self",))
        .select_related(*RELATED, "task")
        .filter(pk=pk)
        .first()
    )
    if rec is None:
        raise NotFound(NO_SUCH_RECOMMENDATION)
    return rec


def _role(reader, rec):
    """How `reader` decides the locked `rec`; CantDecide if they no longer may."""
    # SOC2:AUTH-02 the right to decide is checked again on the locked row
    role = decided_as(reader, rec)
    if role is None:
        raise CantDecide()
    return role


def assign(reader, pk, *, assignee_id, today, title=None, due_date=None, priority=None):
    """Make the recommendation's task for `assignee_id` and mark it
    assigned. Returns the recommendation, its `task` set, and how the reader
    decided it. Raises AlreadyDecided (after the lock is released) when it
    is not open, CantDecide when the reader may no longer decide it."""
    with transaction.atomic():
        rec = _locked(pk)
        if rec.status == S.OPEN:
            role = _role(reader, rec)
            return _assign(reader, rec, assignee_id, today, title, due_date, priority), role
    raise AlreadyDecided(rec)


def _assign(reader, rec, assignee_id, today, title, due_date, priority):
    record = rec.record
    # SOC2:AUTH-02 the task goes only to an active member who can open its record
    assignee = assignee_for(reader.organisation_id, assignee_id, record)
    facts = [str(fact) for fact in (rec.why or {}).get("facts", [])]
    title = title or rec.title
    due = due_date or default_due(rec, today, working_days_for(rec.organisation))
    priority = priority or default_priority(rec)
    task = add_task(
        parent=record,
        title=title,
        due_date=due,
        priority=priority,
        assignee=assignee,
        created_by=reader,
        actor=reader,
        source=Task.Source.RECOMMENDATION,
        description=describe(facts),
        facts=facts,
        event_data={"recommendation": rec.pk},
    )
    rec.status, rec.task = S.ASSIGNED, task
    rec.decided_by, rec.decided_at = reader, timezone.now()
    rec.save(update_fields=["status", "task", "decided_by", "decided_at"])
    return rec


def dismiss(reader, pk, *, reason, note=""):
    """Mark the recommendation dismissed with `reason` (and `note` for
    "other"). Returns it and how the reader decided it. Raises
    AlreadyDecided (after the lock is released) when it is not open,
    CantDecide when the reader may no longer decide it."""
    with transaction.atomic():
        rec = _locked(pk)
        if rec.status == S.OPEN:
            role = _role(reader, rec)
            rec.status = S.DISMISSED
            rec.dismiss_reason = reason
            rec.dismiss_note = note.strip() if reason == REASON.OTHER else ""
            rec.decided_by, rec.decided_at = reader, timezone.now()
            rec.save(
                update_fields=[
                    "status",
                    "dismiss_reason",
                    "dismiss_note",
                    "decided_by",
                    "decided_at",
                ]
            )
            return rec, role
    raise AlreadyDecided(rec)
