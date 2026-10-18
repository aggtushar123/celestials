"""After-Jira surveys (Slack bundles, owner 2026-10-17): a `survey.record`
step that runs with `timing` `after_jira` keeps its survey as a draft and
writes an `IssueWait` on the Jira issue the bundle's earlier step made.

The wait becomes due when the issue is resolved: the ticket sync marks it
as it files the issue (`seen`, one indexed UPDATE, nothing else in the
sync's transaction), and a poll asks Jira for the ones the sync doesn't
read (the Slack project may be one no connection syncs; `poll`, each wait
at most every 15 minutes; a 404 cancels it). The per-minute `deliver` tick
then sends what is due as its owner (`send_due`), with Send now's rules:
the wait's row lock (skip locked), the step still applied, the draft still
a draft, the owner still a working member. A daily limit waits for
tomorrow; any other refusal ends it, and its owner is told. A wait no
issue resolved in 90 days expires (`expire_old`). Each wait moves on only
once (waiting -> due -> sent or refused), so a repeat or a racing Undo
sends nothing twice."""

import logging
from datetime import datetime, time, timedelta

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from core import audit
from services.customers.models import Ticket
from services.customers.scoping import can_open
from services.metrics.models import AgentAction

from .models import IssueWait

logger = logging.getLogger(__name__)
W = IssueWait.Status
POLL_EVERY = timedelta(minutes=15)
EXPIRE_AFTER = timedelta(days=90)
#: The most waits one tick polls, sends or expires.
PER_TICK = 20
#: `detail` of a wait that hit the owner's daily survey limit: tried again tomorrow.
DAILY_LIMIT = "daily_limit"
LINK = "/work?queue=history&bundle={}"


def seen(connector, remote):
    """The sync filed `remote` from `connector`: a resolved Jira issue makes
    its waits due. One indexed UPDATE; returns how many."""
    from services.connectors.models import Connector

    if connector.provider != Connector.Provider.JIRA:
        return 0
    if remote.status not in Ticket.RESOLVED_STATUSES:
        return 0
    return IssueWait.objects.filter(
        connector=connector, issue_key=remote.external_id, status=W.WAITING
    ).update(status=W.DUE, resolved_at=timezone.now())


def _record_of(wait):
    action = AgentAction.objects.select_related("customer", "account").filter(pk=wait.action_id)
    found = action.first()
    return (found.record if found is not None else None), found


def _tell(wait, sentence_for):
    """The wait's owner is told what came of it; a record is named only to
    an owner who may still open it."""
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    owner = wait.owner
    if owner is None or not owner.is_active:
        return
    record, action = _record_of(wait)
    # SOC2:AUTH-02 a record is named only to someone who may open it
    name = record.name if record is not None and can_open(owner, record) else None
    subject = f"Your survey to {name}" if name else "Your survey"
    notify(
        recipient=owner,
        actor=None,
        kind=Notification.Kind.AGENT_SURVEY_WAIT,
        message=sentence_for(subject)[:500],
        link=LINK.format(action.bundle_id) if action is not None else "",
        push_on_commit=True,
    )


def _audit(wait, event, **metadata):
    audit.record(  # SOC2:LOG-01 the issue's key and a short code only, never the survey's text
        event,
        actor=None,
        organisation=wait.organisation,
        target=wait,
        target_repr=str(wait),
        metadata={"issue": wait.issue_key, "action": wait.action_id, **metadata},
    )


def _end(wait, status, detail, *, now):
    wait.status, wait.detail, wait.checked_at = status, str(detail)[:255], now
    wait.save(update_fields=["status", "detail", "checked_at"])


def poll(*, now, limit=PER_TICK):
    """Ask Jira about the waits nobody checked for 15 minutes, oldest check
    first. Resolved: due. Gone (404): cancelled, its owner told. Jira
    refusing: tried again next time. Returns how many it asked about."""
    from .outside import tools

    stale = Q(checked_at__isnull=True) | Q(checked_at__lte=now - POLL_EVERY)
    waits = list(
        IssueWait.objects.filter(status=W.WAITING)
        .filter(stale)
        .select_related("connector", "owner", "organisation")
        .order_by(F("checked_at").asc(nulls_first=True), "id")[:limit]
    )
    for wait in waits:
        mine = IssueWait.objects.filter(pk=wait.pk, status=W.WAITING)
        connector = wait.connector
        if not connector.is_enabled or not connector.credentials:
            mine.update(checked_at=now)
            continue
        try:
            state = tools.current().jira.status(connector, issue=wait.issue_key)
        except tools.Refused:
            mine.update(checked_at=now)
            continue
        if state in Ticket.RESOLVED_STATUSES:
            mine.update(status=W.DUE, resolved_at=now, checked_at=now)
        elif state is None:
            with transaction.atomic():
                if mine.update(status=W.CANCELLED, detail="issue_gone", checked_at=now):
                    _audit(wait, "issue_wait.cancelled", reason="issue_gone")
                    _tell(
                        wait,
                        lambda subject, key=wait.issue_key: (
                            f"{subject} wasn't sent: {key} is no longer in Jira."
                        ),
                    )
        else:
            mine.update(checked_at=now)
    return len(waits)


def _start_of(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def _send_one(pk, now):
    """One due wait under its row lock (a busy one is left to the next tick)."""
    from services.agents.builder import refusal_detail
    from services.surveys.models import SurveySend
    from services.surveys.sending import EMAIL_NOT_SET_UP, Refusal, claim, email_is_set_up

    wait = (
        IssueWait.objects.select_for_update(skip_locked=True, of=("self",))
        .select_related("owner", "survey_send", "organisation")
        .filter(pk=pk, status=W.DUE)
        .first()
    )
    if wait is None:
        return None
    step = AgentAction.objects.filter(pk=wait.action_id).values_list("status", flat=True).first()
    if step != AgentAction.Status.APPLIED:
        # Undone (or gone) after it became due: nothing is sent.
        _end(wait, W.CANCELLED, "undone", now=now)
        _audit(wait, "issue_wait.cancelled", reason="undone")
        return W.CANCELLED
    send = wait.survey_send
    if send is None:
        _end(wait, W.CANCELLED, "deleted", now=now)
        _audit(wait, "issue_wait.cancelled", reason="deleted")
        return W.CANCELLED
    if send.status != SurveySend.Status.DRAFT:
        # Its owner sent it from Surveys meanwhile.
        _end(wait, W.SENT, "sent_by_owner", now=now)
        return W.SENT
    owner = wait.owner
    # SOC2:AUTH-02 sent only as its owner, while they are a working member of the workspace
    if not owner.is_active or owner.organisation_id != wait.organisation_id:
        _end(wait, W.REFUSED, "owner_inactive", now=now)
        _audit(wait, "issue_wait.refused", reason="owner_inactive")
        return W.REFUSED
    sentence = None
    if not email_is_set_up():
        sentence = EMAIL_NOT_SET_UP
    else:
        try:
            # SOC2:AUTH-02 Send now's own rules, as the owner: their audience, their daily limit
            claim(send.pk, owner, today=now.date(), now=now, actor=owner)
        except Refusal as refused:
            if refused.status == 429:
                wait.detail, wait.checked_at = DAILY_LIMIT, now
                wait.save(update_fields=["detail", "checked_at"])
                return W.DUE
            sentence = refusal_detail(refused.body)
    if sentence is not None:
        _end(wait, W.REFUSED, sentence, now=now)
        _audit(wait, "issue_wait.refused", reason="refused")
        _tell(wait, lambda subject: f"{subject} wasn't sent: {sentence}")
        return W.REFUSED
    wait.status, wait.sent_at, wait.detail, wait.checked_at = W.SENT, now, "", now
    wait.save(update_fields=["status", "sent_at", "detail", "checked_at"])
    _audit(wait, "issue_wait.sent")
    _tell(wait, lambda subject: f"{subject} was sent: {wait.issue_key} is resolved.")
    return W.SENT


def send_due(*, now, limit=PER_TICK):
    """Send every due wait (one that hit the daily limit only once a new
    day began), each in its own transaction; one failing never stops the
    others. Returns {status: how many}."""
    retry = ~Q(detail=DAILY_LIMIT) | Q(checked_at__lt=_start_of(now.date()))
    ids = list(
        IssueWait.objects.filter(status=W.DUE)
        .filter(retry)
        .order_by("resolved_at", "id")
        .values_list("pk", flat=True)[:limit]
    )
    counts = {}
    for pk in ids:
        try:
            with transaction.atomic():
                status = _send_one(pk, now)
        except Exception as exc:  # noqa: BLE001 - one wait never stops the others
            logger.warning("issue wait %s: sending failed: %s", pk, type(exc).__name__)
            status = "failed"
        if status:
            counts[str(status)] = counts.get(str(status), 0) + 1
    return counts


def expire_old(*, now, limit=PER_TICK):
    """A wait whose issue wasn't resolved within 90 days expires, its owner told."""
    old = list(
        IssueWait.objects.filter(
            status__in=(W.WAITING, W.DUE), created_at__lte=now - EXPIRE_AFTER
        ).select_related("owner", "organisation")[:limit]
    )
    for wait in old:
        with transaction.atomic():
            ended = IssueWait.objects.filter(pk=wait.pk, status__in=(W.WAITING, W.DUE)).update(
                status=W.EXPIRED, checked_at=now
            )
            if ended:
                _audit(wait, "issue_wait.expired")
                _tell(
                    wait,
                    lambda subject, key=wait.issue_key: (
                        f"{subject} wasn't sent: {key} wasn't resolved within 90 days."
                    ),
                )
    return len(old)


def run_due(*, now=None):
    """The tick's pass: expire, poll, then send; each part fails on its own."""
    now = now or timezone.now()
    counts = {"expired": 0, "polled": 0, "sent": {}}
    for name, part in (
        ("expired", lambda: expire_old(now=now)),
        ("polled", lambda: poll(now=now)),
        ("sent", lambda: send_due(now=now)),
    ):
        try:
            counts[name] = part()
        except Exception as exc:  # noqa: BLE001 - the other parts and the sends run either way
            logger.warning("issue waits: %s failed: %s", name, type(exc).__name__)
    return counts
