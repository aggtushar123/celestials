"""What the email agent makes of one internal message (spec §2).

Only a message its sender wrote, from a mailbox whose owner switched the
agent on (decision A), reaches here, in memory (services.emailagent.inbox:
internal mail is never stored, decision D). It is read once by RFC
Message-ID. Whatever it finds waits on the sender (decision B): a task they
confirm before the colleague gets it, a meeting request they send before the
person asked for hears of it. `confirm` and `dismiss` are the sender's.
"""

import logging
from datetime import date

from django.db import IntegrityError, transaction
from django.utils import timezone

from core import audit
from services.accounts.models import User
from services.customers.models import Account, Customer, Task
from services.customers.task_access import AssigneeCannotOpen, assignee_for
from services.customers.task_changes import add_task
from services.notifications.models import Notification
from services.notifications.realtime import notify
from services.work import clock
from services.work.standing import working_q

from . import detect, slots
from .models import EmailIntent, MeetingProposal

logger = logging.getLogger(__name__)


def key_of(connection, message):
    rfc = getattr(message, "rfc_message_id", "") or (message.headers or {}).get("Message-ID", "")
    return (rfc or f"{connection.pk}:{message.provider_id}")[:998]


def members_of(organisation_id):
    return {
        m.email.lower(): m
        for m in User.objects.filter(working_q(organisation_id), organisation_id=organisation_id)
        if m.email
    }


def _addresses(message):
    pairs = [("", message.from_address), *message.to, *message.cc]
    return {address.lower() for _, address in pairs if address}


def _claim(connection, message):
    try:
        with transaction.atomic():
            return EmailIntent.objects.create(
                organisation_id=connection.organisation_id,
                message_key=key_of(connection, message),
                sender=connection.user,
            )
    except IntegrityError:
        return None  # read already


def process(connection, message, *, now):
    intent = _claim(connection, message)
    if intent is None:
        return None
    organisation = connection.organisation
    sender = connection.user
    members = members_of(organisation.pk)
    today = clock.today_for(organisation, now)
    answer = detect.read(
        message, members=list(members.values()), organisation=organisation, today=today
    )
    if answer is None:
        intent.outcome = EmailIntent.Outcome.FAILED
        intent.save(update_fields=["outcome"])
        return intent
    intent.topic = " ".join(str(answer.get("topic") or "").split())[:200]
    intent.urgent = bool(answer.get("urgent"))
    record = _record(organisation, answer)
    intent.customer = record if isinstance(record, Customer) else None
    intent.account = record if isinstance(record, Account) else None
    kind = answer.get("intent")
    if kind == "task":
        intent.kind = EmailIntent.Kind.TASK
        _suggest_task(intent, sender, members, answer, record, today)
    elif kind == "meeting":
        intent.kind = EmailIntent.Kind.MEETING
        _suggest_meeting(intent, message, sender, members, answer, record, now=now)
    intent.save()
    return intent


def _record(organisation, answer):
    name = " ".join(str(answer.get("customer_name") or "").split())
    if not name:
        return None
    return (
        Customer.objects.filter(organisation=organisation, name__iexact=name).first()
        or Account.objects.filter(customers__organisation=organisation, name__iexact=name)
        .distinct()
        .first()
    )


def _due(answer, organisation, today):
    due = answer.get("due")
    if due in ("today", "tonight"):
        return today
    if due == "tomorrow_morning":
        return clock.add_working_days(today, 1, clock.working_days_for(organisation))
    if due == "date":
        try:
            return date.fromisoformat(str(answer.get("due_date") or ""))
        except ValueError:
            return None
    return None


def _may_assign(organisation_id, sender, assignee, record):
    if record is None:
        return True
    try:
        # SOC2:AUTH-02 the Work rule: the assignee and the asker must both open the record
        assignee_for(organisation_id, assignee.pk, record)
        assignee_for(organisation_id, sender.pk, record)
    except AssigneeCannotOpen:
        return False
    return True


def _suggest_task(intent, sender, members, answer, record, today):
    assignee = members.get(str(answer.get("assignee_email") or "").lower())
    title = " ".join(str(answer.get("task_title") or intent.topic).split())[:255]
    if assignee is None or not title:
        intent.outcome = EmailIntent.Outcome.NOTHING
        return
    if not _may_assign(intent.organisation_id, sender, assignee, record):
        intent.outcome = EmailIntent.Outcome.TASK_REFUSED
        return
    intent.assignee, intent.task_title = assignee, title
    intent.due_date = _due(answer, intent.organisation, today)
    intent.outcome = EmailIntent.Outcome.AWAITING  # decision B: the sender confirms first


def _suggest_meeting(intent, message, sender, members, answer, record, *, now):
    on_mail = _addresses(message)
    asked = [members[a.lower()] for a in answer.get("asked_for") or [] if str(a).lower() in members]
    outside = [u for u in asked if u.email.lower() not in on_mail]
    approver = outside[0] if outside else sender  # decision 4
    people = {members[a].pk: members[a] for a in on_mail if a in members}
    for u in [*asked, approver]:
        people[u.pk] = u
    attendees = list(people.values())
    length = answer.get("length_minutes")
    length = length if isinstance(length, int) and 15 <= length <= 240 else 30
    start, unknown = slots.free_slot(
        intent.organisation, attendees, length_minutes=length, urgent=intent.urgent, now=now
    )
    mine = approver.pk == sender.pk
    proposal = MeetingProposal.objects.create(
        organisation=intent.organisation,
        intent=intent,
        approver=approver,
        requester=sender,
        topic=intent.topic or "A meeting",
        customer=intent.customer,
        account=intent.account,
        urgent=intent.urgent,
        proposed_start=start,
        length_minutes=length,
        # Nobody else is told anything until the sender sends it (decision B).
        status=MeetingProposal.Status.OPEN if mine else MeetingProposal.Status.AWAITING_SENDER,
    )
    proposal.attendees.set(attendees)
    proposal.unknown_free.set(unknown)
    intent.outcome = EmailIntent.Outcome.PROPOSED if mine else EmailIntent.Outcome.AWAITING


class Refused(Exception):
    def __init__(self, code, message, http_status=400):
        super().__init__(message)
        self.code, self.message, self.http_status = code, message, http_status


def waiting_on(user):
    # SOC2:AUTH-02 a suggestion is its sender's alone
    return EmailIntent.objects.filter(
        sender=user, organisation_id=user.organisation_id, outcome=EmailIntent.Outcome.AWAITING
    )


def confirm(intent, user, *, request=None):
    """The sender says yes: the task is given, or the request goes to its approver."""
    if intent.outcome != EmailIntent.Outcome.AWAITING:
        raise Refused("ALREADY_DECIDED", "This has already been decided.", 409)
    now = timezone.now()
    if intent.kind == EmailIntent.Kind.TASK:
        assignee = intent.assignee
        if assignee is None or not _may_assign(
            intent.organisation_id, user, assignee, intent.record
        ):
            raise Refused("ASSIGNEE_CANNOT_OPEN", "They can't open this customer any more.")
        task = add_task(
            parent=intent.record,
            title=intent.task_title,
            due_date=intent.due_date,
            priority=Task.Priority.HIGH if intent.urgent else Task.Priority.MEDIUM,
            assignee=assignee,
            created_by=user,
            actor=user,
            source=Task.Source.AGENT,
            description=f"From an email by {user.name}.",
        )
        EmailIntent.objects.filter(pk=intent.pk).update(
            task=task, outcome=EmailIntent.Outcome.TASK_CREATED, decided_at=now
        )
        audit.record(  # SOC2:LOG-01 no email content
            "email_agent.task_created",
            request=request,
            actor=user,
            organisation=intent.organisation,
            target=task,
            metadata={"assignee": assignee.pk},
        )
        return task
    proposal = intent.proposal
    MeetingProposal.objects.filter(pk=proposal.pk).update(status=MeetingProposal.Status.OPEN)
    EmailIntent.objects.filter(pk=intent.pk).update(
        outcome=EmailIntent.Outcome.PROPOSED, decided_at=now
    )
    # SOC2:AUTH-02 owner decision 5: the approver sees a topic and who asked, never the mail
    notify(
        recipient=proposal.approver,
        actor=user,
        kind=Notification.Kind.MEETING_PROPOSED,
        message=f"{user.name} asked for a meeting: {proposal.topic}",
        link="/work?queue=mine",
    )
    audit.record(  # SOC2:LOG-01 counts only
        "email_agent.meeting_proposed",
        request=request,
        actor=user,
        organisation=intent.organisation,
        target=proposal,
        metadata={"attendees": proposal.attendees.count(), "approver": proposal.approver_id},
    )
    return proposal


def dismiss(intent, user, *, request=None):
    if intent.outcome != EmailIntent.Outcome.AWAITING:
        raise Refused("ALREADY_DECIDED", "This has already been decided.", 409)
    EmailIntent.objects.filter(pk=intent.pk).update(
        outcome=EmailIntent.Outcome.DISMISSED, decided_at=timezone.now()
    )
    MeetingProposal.objects.filter(intent=intent).update(status=MeetingProposal.Status.DISMISSED)
