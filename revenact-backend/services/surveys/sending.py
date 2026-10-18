"""The send (spec §1.3): claim, deliver, finish.

1. The claim is one short transaction. The workspace's row is locked
   first, so every claim in the workspace queues behind any other; then the
   owner's row, then the send's, and anything but a draft is a 409. The
   audience is resolved again here, on the server, from the owner's own
   view, and one `queued` invite per person is written before the
   transaction commits, with no token yet. A second send claimed while
   this one is still delivering therefore sees these people as asked and
   skips them (the 30-day quiet period). A refusal rolls back and leaves
   the draft as it was. The view answers at once: the send is `sending`.
2. Delivery runs outside any transaction, in `deliver_pending` (the
   `deliver_pending` management command, every minute), or straight after
   a rule review's approval. Each queued invite is taken by one
   conditional UPDATE that writes a fresh token's hash where none is yet,
   on the invite's own columns, so a resumed or concurrent delivery never
   emails anyone twice. The token lives only in memory and in the email.
   A failed email marks its own invite failed (its hash cleared: nothing
   went out), the connection is reopened and the batch carries on.
3. The finish, once nobody is left queued, sets `sent`, `sent_at` and the
   frozen counts and audits `survey.sent`, once.

A worker killed mid-batch leaves the send `sending` with its people
queued; the next run emails whoever was never taken, and anyone taken
`STALE_MINUTES` ago or more but never marked is counted as emailed
(`pending`, hash kept): their email may have gone out, so their link keeps
working and nobody emails them again.
"""

import logging
from contextlib import suppress
from datetime import datetime, time, timedelta
from types import SimpleNamespace

from django.conf import settings
from django.core.mail import get_connection
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core import audit
from services.accounts.models import Organisation, User
from services.email import send_survey_email

from .access import NOT_OWNER, NOT_SEGMENT_OWNER
from .audience import resolve
from .models import (
    DAILY_SENDS,
    LINK_DAYS,
    MAX_PEOPLE,
    STALE_MINUTES,
    SurveyInvite,
    SurveySend,
)
from .serializers import NO_ROLES
from .tokens import new_token

logger = logging.getLogger(__name__)

ALREADY_SENT = "This survey has already been sent."
BEING_SENT = "This survey is being sent."
DAILY_LIMIT = f"You can send at most {DAILY_SENDS} surveys a day. Try again tomorrow."
CHOOSE_SEGMENT = "Choose a segment."
NOBODY = "Nobody to send to."
EMAIL_NOT_SET_UP = "Email isn't set up for this workspace yet, so surveys can't be sent."
NOT_SENT = "the email could not be sent."
CONSOLE_BACKEND = "django.core.mail.backends.console.EmailBackend"


class Refusal(Exception):
    """A send that may not go: the response's status and body."""

    def __init__(self, status, body):
        super().__init__(status)
        self.status = status
        self.body = body


def too_many(count):
    return f"This survey would reach {count} people; the most is {MAX_PEOPLE}."


def email_is_set_up():
    """False outside DEBUG when mail would only be printed (the console
    backend, the fallback with no SMTP credentials): that would print every
    live link to the process log and report people as sent who got nothing."""
    return settings.DEBUG or settings.EMAIL_BACKEND != CONSOLE_BACKEND


def _start_of(day):
    """Midnight starting `day` in settings.TIME_ZONE, which is UTC: the daily
    limit resets at midnight UTC (the server's time zone)."""
    return timezone.make_aware(datetime.combine(day, time.min))


def _invite(send, person, expires_at):
    """An unsaved, queued invite for `person`: its token is made by whoever
    emails it."""
    return SurveyInvite(
        send=send,
        contact=person,
        customer_id=person.customer_id,
        account_id=person.account_id,
        email=person.email.strip(),
        status=SurveyInvite.Status.QUEUED,
        expires_at=expires_at,
    )


def one_record(send):
    """("customer" | "account", pk) of a send made for one record's people
    (Slack bundles' `survey.record`), else None."""
    if send.account_id is not None:
        return "account", send.account_id
    if send.customer_id is not None:
        return "customer", send.customer_id
    return None


def claim(pk, user, *, today, now, records=None, actor=None, request=None):
    """Locks, checks, resolves the audience, writes one queued invite per
    person and marks the send `sending`, with the audience's counts (`sent`
    and `failed` are filled in by `finish`). Raises `Refusal`; returns the
    send. Nobody is emailed here: see `deliver`. Audited
    `survey.send_started` with `request` (actor: `actor`, else the
    request's user) and the send's rule, if any.

    `records` (a rule's fired records) limits the audience; see
    `audience.resolve`. A send with no segment but one record (`one_record`)
    goes to that record's people with the ticked roles, as its owner sees them."""
    with transaction.atomic():
        # Lock order: workspace, owner, send. The workspace lock makes the
        # 30-day check and the invites it guards one step for everyone in it.
        # NO KEY UPDATE: claims queue behind each other, while rows that only
        # reference the workspace (FOR KEY SHARE) are written as usual.
        list(
            Organisation.objects.select_for_update(no_key=True)
            .filter(pk=user.organisation_id)
            .values_list("pk", flat=True)
        )
        list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))
        send = (
            SurveySend.objects.select_for_update(of=("self",))
            .select_related("segment", "organisation")
            .get(pk=pk)
        )
        if send.status == SurveySend.Status.SENT:
            raise Refusal(409, {"detail": ALREADY_SENT})
        if send.status == SurveySend.Status.SENDING:
            raise Refusal(409, {"detail": BEING_SENT})
        started = SurveySend.objects.filter(owner=user, started_at__gte=_start_of(today)).count()
        if started >= DAILY_SENDS:
            raise Refusal(429, {"detail": DAILY_LIMIT})
        segment = send.segment
        one = one_record(send)
        if segment is None and one is None:
            raise Refusal(400, {"segment": [CHOOSE_SEGMENT]})
        if segment is not None:
            # SOC2:AUTH-02 a survey goes only to the sender's own segment
            if segment.owner_id != user.pk:
                raise Refusal(403, {"detail": NOT_SEGMENT_OWNER})
            if segment.kind != "contact" and not send.roles:
                raise Refusal(400, {"roles": [NO_ROLES]})
            audience = resolve(segment, send.roles, user, today=today, now=now, records=records)
        else:
            # SOC2:AUTH-02 a one-record survey is sent by its owner alone, to the
            # people of that record, read through their own visibility (`resolve`)
            if send.owner_id != user.pk:
                raise Refusal(403, {"detail": NOT_OWNER})
            if not send.roles:
                raise Refusal(400, {"roles": [NO_ROLES]})
            kind, pk = one
            audience = resolve(
                SimpleNamespace(kind=kind), send.roles, user, today=today, now=now, records=[pk]
            )
        if not audience.people:
            raise Refusal(400, {"segment": [NOBODY]})
        if len(audience.people) > MAX_PEOPLE:
            raise Refusal(400, {"segment": [too_many(len(audience.people))]})
        send.status = SurveySend.Status.SENDING
        send.started_at = now
        send.counts = {
            "audience": len(audience.people),
            "sent": 0,
            "failed": 0,
            "skipped_recent": audience.skipped_recent,
            "skipped_no_email": audience.skipped_no_email,
            "skipped_cap": audience.skipped_cap,
        }
        send.save(update_fields=["status", "started_at", "counts", "updated_at"])
        expires_at = now + timedelta(days=LINK_DAYS)
        SurveyInvite.objects.bulk_create(
            [_invite(send, person, expires_at) for person in audience.people]
        )
        audit.record(  # SOC2:LOG-01
            "survey.send_started",
            request=request,
            actor=actor,
            organisation=send.organisation,
            target=send,
            metadata=_audit_metadata(send),
        )
    return send


def _audit_metadata(send):
    """The counts, plus the rule when a rule's review sent it."""
    rule = {"rule": send.rule_id} if send.rule_id is not None else {}
    return {**send.counts, **rule}


def _reconnect(connection):
    """After a failure the connection may be dead (a dropped SMTP session);
    start a fresh one so the people after it are not failed with it."""
    with suppress(Exception):
        connection.close()
        connection.open()


QUEUED = SurveyInvite.Status.QUEUED


def _deliver_one(invite, connection):
    """Takes `invite` for this worker with one conditional UPDATE on its own
    columns (status and hash, which Postgres re-checks against a racing
    taker's committed row), then emails it. Returns False when another
    worker already had it."""
    token, token_hash = new_token()
    taken = SurveyInvite.objects.filter(
        pk=invite.pk, status=QUEUED, token_hash__isnull=True
    ).update(token_hash=token_hash, taken_at=timezone.now())
    if not taken:
        return False
    invite.token_hash = token_hash
    mine = SurveyInvite.objects.filter(pk=invite.pk, token_hash=token_hash)
    try:
        send_survey_email(invite, token, connection=connection)
    except Exception as exc:  # noqa: BLE001 - one failure never stops the batch
        logger.warning("survey invite %s not sent: %s", invite.pk, type(exc).__name__)
        # never str(exc): an SMTP refusal spells out the recipient's address;
        # nothing went out, so no link is live for it
        failure = f"{type(exc).__name__}: {NOT_SENT}"[:200]
        mine.update(status=SurveyInvite.Status.FAILED, failure=failure, token_hash=None)
        _reconnect(connection)
        return True
    mine.update(status=SurveyInvite.Status.PENDING)
    return True


def deliver(send):
    """Emails every queued invite on `send` nobody has taken, over one mail
    connection, then finishes it if nobody is left. A mail server that will
    not connect is logged and leaves everyone queued for a later run. Safe
    to run again, and at the same time as another run."""
    send = SurveySend.objects.select_related("organisation", "owner").get(pk=send.pk)
    waiting = list(
        send.invites.filter(status=QUEUED, token_hash__isnull=True)
        .select_related("send__organisation")
        .order_by("pk")
    )
    if waiting:
        try:
            connection = get_connection()
            connection.open()
        except Exception as exc:  # noqa: BLE001 - the mail server is down: everyone stays queued
            # never str(exc): an SMTP error can quote the server's reply
            logger.error("survey send %s: no mail connection: %s", send.pk, type(exc).__name__)
            return send
        try:
            for invite in waiting:
                _deliver_one(invite, connection)
        finally:
            with suppress(Exception):
                connection.close()
    return finish(send, now=timezone.now())


def finish(send, *, now):
    """Once nobody on `send` is still queued, marks it `sent` with its counts
    frozen from its invites (every one not failed went out; some may be
    answered already) and audits `survey.sent`, once. Whoever finishes it
    (the runner, the night, a review's approval), the row reads the same:
    the send's owner as actor, and its rule when there is one. Otherwise
    leaves it `sending` for whoever holds the rest."""
    with transaction.atomic():
        send = (
            SurveySend.objects.select_for_update(of=("self",))
            .select_related("organisation", "owner")
            .get(pk=send.pk)
        )
        if send.status != SurveySend.Status.SENDING or send.invites.filter(status=QUEUED).exists():
            return send
        failed = send.invites.filter(status=SurveyInvite.Status.FAILED).count()
        audience = send.counts.get("audience", send.invites.count())
        send.status = SurveySend.Status.SENT
        send.sent_at = now
        send.counts = {**send.counts, "sent": audience - failed, "failed": failed}
        send.save(update_fields=["status", "sent_at", "counts", "updated_at"])
        audit.record(  # SOC2:LOG-01
            "survey.sent",
            actor=send.owner,
            organisation=send.organisation,
            target=send,
            metadata=_audit_metadata(send),
        )
    return send


def stuck(rows, send, *, now, minutes=STALE_MINUTES):
    """Of `rows` (taken, never marked), those a dead worker left: taken
    `minutes` ago or more, so a live worker's person in flight on an old
    send is never marked under it. A take from before `taken_at` existed
    is judged by the send's own age. Shared with campaigns.sending."""
    stale = now - timedelta(minutes=minutes)
    if send.started_at > stale:
        return rows.none()
    return rows.filter(Q(taken_at__lte=stale) | Q(taken_at__isnull=True))


def resume(send, *, now):
    """Finishes a send cut off mid-delivery. Anyone taken `STALE_MINUTES`
    ago or more and never marked (the worker died between taking and
    marking them; `stuck`) is counted as emailed rather than emailed again: their
    email may have gone out, so they keep their hash and a working link.
    Then the rest are delivered."""
    taken = send.invites.filter(status=QUEUED, token_hash__isnull=False)
    stuck(taken, send, now=now).update(status=SurveyInvite.Status.PENDING)
    return deliver(send)


def deliver_pending(organisation=None, *, now):
    """Every survey send still `sending` (in one workspace, or all), each on
    its own; a failure is logged by id and class and counted. Returns
    (finished, failed)."""
    finished = failed = 0
    due = SurveySend.objects.filter(status=SurveySend.Status.SENDING).order_by("pk")
    if organisation is not None:
        due = due.filter(organisation=organisation)
    for send in list(due.only("pk", "started_at")):
        try:
            send = resume(send, now=now)
        except Exception as exc:  # noqa: BLE001 - one send's failure never stops the rest
            logger.error("survey send %s: finishing failed: %s", send.pk, type(exc).__name__)
            failed += 1
            continue
        finished += send.status == SurveySend.Status.SENT
    return finished, failed
