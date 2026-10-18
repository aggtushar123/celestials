"""Deciding a meeting proposal, and undoing an email-born task (spec §2)."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core import audit
from services.calendar import booking
from services.mail import gates, scopes
from services.mail.models import MailboxConnection

from .models import EmailIntent, MeetingProposal

UNDO_WINDOW = timedelta(hours=24)


class Refused(Exception):
    def __init__(self, code, message, http_status=400):
        super().__init__(message)
        self.code, self.message, self.http_status = code, message, http_status


def mine(user):
    # SOC2:AUTH-02 a proposal is its approver's alone, and only once its sender sent it (decision B)
    return MeetingProposal.objects.filter(
        approver=user, organisation_id=user.organisation_id
    ).exclude(status=MeetingProposal.Status.AWAITING_SENDER)


def book(proposal, user, *, starts_at=None, length_minutes=None, request=None):
    """Book it on the approver's calendar with Meet; Google invites everyone."""
    if proposal.status != MeetingProposal.Status.OPEN:
        raise Refused("ALREADY_DECIDED", "This meeting has already been decided.", 409)
    start = starts_at or proposal.proposed_start
    if start is None:
        raise Refused("PICK_A_TIME", "Pick a time: nobody's week had a free slot.")
    length = length_minutes or proposal.length_minutes
    connection = gates.live_mailbox(user)
    if connection is None or connection.provider != MailboxConnection.Provider.GOOGLE:
        raise Refused("CALENDAR_NOT_GRANTED", "Connect Google with Calendar first.")
    if not scopes.has_calendar(connection.granted_scopes):
        raise Refused("CALENDAR_NOT_GRANTED", "Add Calendar to your Google connection first.")
    if gates.paused_reason(connection):
        raise Refused("MAILBOX_PAUSED", "Your Google connection is paused.", 409)
    others = [u for u in proposal.attendees.all() if u.pk != user.pk and u.email]
    asker = proposal.requester.name if proposal.requester else "a colleague"
    try:
        meeting = booking.book(
            connection=connection,
            user=user,
            customer=proposal.customer or proposal.account,
            contacts=others,
            title=proposal.topic,
            starts_at=start,
            ends_at=start + timedelta(minutes=length),
            description=f"Asked for by {asker} (Revenact).",
            request_id=f"proposal-{proposal.pk}",
            request=request,
        )
    except booking.BookingRefused as refused:
        raise Refused(refused.code, refused.message, refused.http_status) from refused
    with transaction.atomic():
        MeetingProposal.objects.filter(pk=proposal.pk).update(
            status=MeetingProposal.Status.BOOKED, meeting=meeting, decided_at=timezone.now()
        )
    proposal.refresh_from_db()
    return proposal


def dismiss(proposal, user, *, request=None):
    if proposal.status != MeetingProposal.Status.OPEN:
        raise Refused("ALREADY_DECIDED", "This meeting has already been decided.", 409)
    MeetingProposal.objects.filter(pk=proposal.pk).update(
        status=MeetingProposal.Status.DISMISSED, decided_at=timezone.now()
    )
    audit.record(  # SOC2:LOG-01
        "email_agent.meeting_dismissed",
        request=request,
        actor=user,
        organisation=proposal.organisation,
        target=proposal,
        metadata={},
    )
    proposal.refresh_from_db()
    return proposal


def undo_task(intent, user, *, now=None, request=None):
    """Take back a task the agent made: by the asker or the assignee, within a day."""
    now = now or timezone.now()
    task = intent.task
    # SOC2:AUTH-02 only the two people the task is between may undo it
    if task is None or user.pk not in (intent.sender_id, task.assignee_id):
        raise Refused("NOT_FOUND", "No such task.", 404)
    if intent.outcome != EmailIntent.Outcome.TASK_CREATED or now - task.created_at > UNDO_WINDOW:
        raise Refused("TOO_LATE", "It can only be undone within a day.", 409)
    title = task.title
    task.delete()
    EmailIntent.objects.filter(pk=intent.pk).update(outcome=EmailIntent.Outcome.TASK_UNDONE)
    audit.record(  # SOC2:LOG-01
        "email_agent.task_undone",
        request=request,
        actor=user,
        organisation=intent.organisation,
        target=intent,
        metadata={},
    )
    return title
