"""A campaign's send (spec §1.4): claim, deliver, finish.

1. Before anything is locked: email must be set up (else nothing is
   written), and the campaign not archived, with an active owner, a
   segment, a subject and a body (`before_claim`).
2. The claim is one short transaction. The workspace's row is locked first
   (`FOR NO KEY UPDATE`, as Surveys' claim), then the campaign's, so every
   claim in the workspace queues behind any other: that is what makes the
   3-day gap and "once per campaign" hold. The audience is built again here
   as the owner (`audience.build`); the send and one delivery per person
   checked, queued or skipped, are written; the campaign becomes `active`.
3. Delivery runs outside any transaction, one person at a time over one
   mail connection. Each queued person is taken by one conditional UPDATE
   that writes their token's hash and re-checks they have not unsubscribed
   since the claim, so a resumed or concurrent delivery never emails
   anyone twice, and nobody who opted out in the meantime (through another
   campaign's link) is emailed; the take missing for that reason skips
   the row `unsubscribed` instead of leaving it to a worker. The token
   lives only in memory and in the email. A failure composing or sending
   marks that delivery skipped `failed`, clearing its hash (nothing went
   out, so no link is live), and carries on; once the email
   itself is gone, nothing after it may undo that — a failure filing the
   `Email` row is logged and the delivery still counts `sent`. Five send
   failures in a row (a dead connection, not one bad address) stop the
   loop early, leaving whoever is left queued for a later resume rather
   than failing the whole remaining audience; a server that never connects
   leaves everyone queued the same way. `deliver` refuses to run
   inside a transaction: it sends real mail and must never do that while
   anything is locked.
4. The finish freezes the counts once nobody is left queued.

Send now only claims: the send is `sending` with its people queued, and
`deliver_pending` (the `deliver_pending` management command, every
minute, and the nightly rules step) delivers it. A crash leaves the send
`sending` the same way; `resume` (through `deliver_pending`, or the
admin) finishes it. Whoever
was taken but never marked may have been emailed, so `resume` skips them
`failed` with their hash kept: their link keeps working and no later send
emails them again (`audience.MAYBE_SENT`).
There is no task queue: the minute runner is the sender. Log lines carry ids and
exception class names only, never an address, a subject or a body.

The campaign's owner going inactive is not spelled out in spec §1.4; it is
handled here the way Rules and Segments already handle an inactive owner
(`Rule.pause_reason`, `services.segments.nightly`): a plain refusal before
anything is written, since a send with nobody left to answer for it or be
named as its sender should not go out. For a rule's action this is almost
always caught earlier, when the rule itself is paused for the same reason
(`rules.nightly.pause_reason`); this is the backstop for every other path
into `claim` (the API, a review's approval, a race between the two)."""

import logging
from contextlib import suppress

from django.core.mail import get_connection
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from services.accounts.models import Organisation
from services.customers.models import Contact, Email
from services.email import send_campaign_email
from services.notifications.models import Notification
from services.notifications.realtime import notify
from services.surveys.sending import Refusal, email_is_set_up, stuck
from services.surveys.tokens import new_token

from . import audit
from .audience import build
from .models import (
    STALE_MINUTES,
    Campaign,
    CampaignDelivery,
    CampaignSend,
    SkipReason,
    empty_counts,
)
from .rendering import compose, link, render
from .validation import (
    ARCHIVED,
    CHOOSE_CAMPAIGN,
    CHOOSE_SEGMENT,
    EMAIL_NOT_SET_UP,
    NEEDS_WORDS,
    NOBODY,
    OWNER_INACTIVE,
)

logger = logging.getLogger(__name__)

__all__ = ["Refusal", "before_claim", "claim", "deliver", "finish", "resume", "deliver_pending"]

#: Deliveries written per statement at the claim.
BATCH = 1000
#: Consecutive send failures (a dead connection, not one bad address) that
#: stop `deliver` early, leaving the rest queued for a later resume.
MAX_CONSECUTIVE_FAILURES = 5
QUEUED = CampaignDelivery.Status.QUEUED
SENT = CampaignDelivery.Status.SENT
SKIPPED = CampaignDelivery.Status.SKIPPED


def _refusal(campaign):
    if campaign.status == Campaign.Status.ARCHIVED:
        return {"detail": ARCHIVED}
    if campaign.owner_id is None or not campaign.owner.is_active:
        return {"detail": OWNER_INACTIVE}
    if campaign.segment_id is None:
        return {"detail": CHOOSE_SEGMENT}
    if not campaign.subject.strip() or not campaign.body.strip():
        return {"detail": NEEDS_WORDS}
    return None


def before_claim(campaign):
    """The refusal a send meets before anything is locked or written, or None."""
    if not email_is_set_up():
        return {"detail": EMAIL_NOT_SET_UP}
    return _refusal(campaign)


def _lock(campaign_id):
    """The workspace, then the campaign, both `FOR NO KEY UPDATE`. None when
    the campaign is gone. Call inside a transaction."""
    organisation_id = (
        Campaign.objects.filter(pk=campaign_id).values_list("organisation_id", flat=True).first()
    )
    if organisation_id is None:
        return None
    list(
        Organisation.objects.select_for_update(no_key=True)
        .filter(pk=organisation_id)
        .values_list("pk", flat=True)
    )
    return (
        Campaign.objects.select_for_update(no_key=True, of=("self",))
        .select_related("owner", "segment", "organisation")
        .filter(pk=campaign_id)
        .first()
    )


def claim(
    campaign_id,
    *,
    kind,
    by,
    rule=None,
    review=None,
    records=None,
    expect_kind=None,
    expect_owner=None,
    today,
    now,
    request=None,
):
    """Locks, checks, builds the audience as the owner and writes the send
    and its deliveries. Raises `Refusal` (nothing written); returns the send,
    `sending`. `records` (a rule's fired records) limit the audience.
    `expect_kind` (the records' segment kind) and `expect_owner` (a user id:
    the rule's owner) are checked again here under the campaign's lock, so
    an edit landing between a caller's own unlocked check and this lock
    cannot have the records read as another kind's ids, or the audience
    built as someone else; a mismatch refuses with `CHOOSE_CAMPAIGN`."""
    if not email_is_set_up():
        raise Refusal(400, {"detail": EMAIL_NOT_SET_UP})
    with transaction.atomic():
        campaign = _lock(campaign_id)
        if campaign is None:
            raise Refusal(404, {"detail": "Not found."})
        if (expect_owner is not None and campaign.owner_id != expect_owner) or (
            expect_kind is not None
            and (campaign.segment is None or campaign.segment.kind != expect_kind)
        ):
            raise Refusal(400, {"detail": CHOOSE_CAMPAIGN})
        refusal = _refusal(campaign)
        if refusal:
            raise Refusal(400, refusal)
        # SOC2:AUTH-02 built as the campaign's owner, from their own segment
        reach = build(campaign, today=today, now=now, records=records)
        if not reach.queued:
            raise Refusal(400, {"detail": NOBODY})
        send = CampaignSend.objects.create(
            campaign=campaign,
            kind=kind,
            rule=rule,
            review=review,
            sent_by=by,
            started_at=now,
            subject=campaign.subject,
            body=campaign.body,
            counts=reach.counts(),
        )
        CampaignDelivery.objects.bulk_create(
            [CampaignDelivery(send=send, contact=person) for person in reach.queued]
            + [
                CampaignDelivery(send=send, contact=person, status=SKIPPED, reason=reason)
                for person, reason in reach.skipped
            ],
            batch_size=BATCH,
        )
        if campaign.status != Campaign.Status.ACTIVE:
            campaign.status = Campaign.Status.ACTIVE
            campaign.save(update_fields=["status", "updated_at"])
        audit.record(
            "send_started",
            campaign,
            request=request,
            actor=by,
            metadata={"send": send.pk, "kind": kind, "counts": send.counts},
        )
    return send


def _reconnect(connection):
    """After a failure the SMTP session may be dead; start a fresh one so the
    people after it are not failed with it."""
    with suppress(Exception):
        connection.close()
        connection.open()


def _subscribed():
    """Contacts who have not unsubscribed, as an uncorrelated subquery on
    Contact alone: `contact_id IN (...)`, never a join of the delivery
    table to Contact. A join there (`contact__campaigns_unsubscribed_at=`)
    forces Django to rewrite the take UPDATE as `WHERE "id" IN (SELECT ...
    JOIN customers_contact ...)`, moving `status` and `token_hash` into
    that subquery along with it, since an UPDATE can only target one
    table. Postgres's concurrent-update recheck (EvalPlanQual) re-applies
    the outer WHERE to the winner's committed row, but does not re-run a
    subquery that way — so a second taker blocked on the row lock can
    still "win" and overwrite the hash, and both workers end up emailing
    the same person (reproduced on PG15; see task-6-report.md fix round
    2). Scoping the subquery to Contact alone keeps `status` and
    `token_hash` as plain columns of campaigns_campaigndelivery in the
    UPDATE's own WHERE, which the recheck does see."""
    return Contact.objects.filter(campaigns_unsubscribed_at__isnull=True).values("pk")


def _unsubscribed():
    """The same shape as `_subscribed`, for the opposite case."""
    return Contact.objects.filter(campaigns_unsubscribed_at__isnull=False).values("pk")


def _deliver_one(send, delivery, sender, workspace, connection):
    """Takes `delivery` for this worker with one conditional UPDATE, then
    sends and files its email. Returns "sent", "failed" (composing or
    sending itself did not go out) or "skipped" (another worker already
    had this person, or they unsubscribed since the claim). Can still
    raise if the database itself is down while marking an outcome (not
    while sending) — not caught, since there is nothing useful to do with
    a dead connection here; the row stays queued with its hash and a
    later `resume` treats it exactly like any other crash mid-delivery."""
    token, token_hash = new_token()
    taken = CampaignDelivery.objects.filter(
        pk=delivery.pk,
        status=QUEUED,
        token_hash="",
        contact_id__in=_subscribed(),
    ).update(token_hash=token_hash, taken_at=timezone.now())
    if not taken:
        # Either another worker already took this person, or they
        # unsubscribed since the claim (through another campaign's link);
        # either way nobody is emailed. The second UPDATE is a no-op
        # unless it is genuinely the unsubscribe case.
        CampaignDelivery.objects.filter(
            pk=delivery.pk,
            status=QUEUED,
            token_hash="",
            contact_id__in=_unsubscribed(),
        ).update(status=SKIPPED, reason=SkipReason.UNSUBSCRIBED)
        return "skipped"
    mine = CampaignDelivery.objects.filter(pk=delivery.pk, token_hash=token_hash)
    contact = delivery.contact
    try:
        subject, body = compose(
            send, contact, sender_name=sender, workspace=workspace, url=link(token)
        )
        send_campaign_email(contact.email.strip(), subject, body, connection=connection)
    except Exception as exc:  # noqa: BLE001 - one failure never stops the send
        # never str(exc): an SMTP refusal spells out the recipient's address
        logger.warning("campaign delivery %s not sent: %s", delivery.pk, type(exc).__name__)
        # a known failure: nothing went out, so no link is live for it
        mine.update(status=SKIPPED, reason=SkipReason.FAILED, token_hash="")
        _reconnect(connection)
        return "failed"
    # The email is gone: nothing past this point may undo that. Filing it
    # is a courtesy; its own failure is logged and never un-sends or fails
    # a delivery that really went out.
    now = timezone.now()
    try:
        _subject, plain = render(send, contact, sender_name=sender)
        with transaction.atomic():
            email = Email.objects.create(
                customer_id=contact.customer_id,
                account_id=contact.account_id,
                subject=subject[:255],
                body=plain,
                sender_name=sender[:150],
                recipient_name=contact.name[:150],
                sent_at=now,
                campaign_id=send.campaign_id,
            )
            mine.update(status=SENT, reason="", sent_at=now, email=email)
    except Exception as exc:  # noqa: BLE001 - the email already went out
        logger.error("campaign delivery %s: filing failed: %s", delivery.pk, type(exc).__name__)
        mine.update(status=SENT, reason="", sent_at=now)
    return "sent"


def _refuse_if_locked():
    """`deliver` sends real mail and must never run while anything is
    locked. A no-op durable atomic block raises when it detects it is
    nested inside a real transaction (Django's own guard for exactly this);
    Django exempts a TestCase's own wrapping of each test in one (it marks
    that block `_from_testcase`), so the test suite is unaffected."""
    try:
        with transaction.atomic(durable=True):
            pass
    except RuntimeError as exc:
        raise RuntimeError(
            "campaigns.sending.deliver sends real mail and must not run inside a transaction"
        ) from exc


def deliver(send):
    """Emails every queued person on `send` nobody has taken, then finishes
    it if nobody is left. Stops after `MAX_CONSECUTIVE_FAILURES` send
    failures in a row — a dead connection, not a bad address here and
    there — leaving whoever is left queued for a later resume instead of
    failing the whole remaining audience. A mail server that will not
    connect at all is logged and leaves everyone queued: the send stays
    `sending` and is returned, never raised, for a later resume. Refuses
    to run inside a transaction (`_refuse_if_locked`); otherwise outside
    any transaction itself. Safe to run again."""
    _refuse_if_locked()
    send = CampaignSend.objects.select_related("campaign__owner", "campaign__organisation").get(
        pk=send.pk
    )
    campaign = send.campaign
    waiting = (
        send.deliveries.filter(status=QUEUED, token_hash="")
        .select_related("contact__customer", "contact__account")
        .order_by("pk")
    )
    try:
        connection = get_connection()
        connection.open()
    except Exception as exc:  # noqa: BLE001 - the mail server is down: everyone stays queued
        # never str(exc): an SMTP error can quote the server's reply
        logger.error("campaign send %s: no mail connection: %s", send.pk, type(exc).__name__)
        return finish(send, now=timezone.now())
    failures = 0
    try:
        for delivery in list(waiting):
            outcome = _deliver_one(
                send, delivery, campaign.owner.name, campaign.organisation.name, connection
            )
            if outcome == "sent":
                failures = 0
            elif outcome == "failed":
                failures += 1
                if failures >= MAX_CONSECUTIVE_FAILURES:
                    logger.error(
                        "campaign send %s: stopped after %s consecutive failures",
                        send.pk,
                        failures,
                    )
                    break
    finally:
        with suppress(Exception):
            connection.close()
    return finish(send, now=timezone.now())


def tally(send):
    """The send's counts from its deliveries now."""
    counts = empty_counts()
    rows = send.deliveries.order_by().values("status", "reason").annotate(n=Count("id"))
    for row in rows:
        counts["reached"] += row["n"]
        if row["status"] == SENT:
            counts["sent"] += row["n"]
        elif row["status"] == SKIPPED:
            counts["skipped"][row["reason"]] += row["n"]
    return counts


def sent_message(campaign, counts):
    """ "Win-back emailed 42 people · 6 skipped." """
    sent, skipped = counts["sent"], sum(counts["skipped"].values())
    people = "1 person" if sent == 1 else f"{sent} people"
    text = f"{campaign.name} emailed {people}"
    return f"{text} · {skipped} skipped." if skipped else f"{text}."


def finish(send, *, now):
    """Marks the send `sent` with its counts frozen, once nobody on it is
    still queued; otherwise leaves it `sending` for whoever holds them."""
    with transaction.atomic():
        send = (
            CampaignSend.objects.select_for_update(no_key=True, of=("self",))
            .select_related("campaign__owner", "campaign__organisation")
            .get(pk=send.pk)
        )
        if (
            send.status == CampaignSend.Status.SENT
            or send.deliveries.filter(status=QUEUED).exists()
        ):
            return send
        send.counts = tally(send)
        send.status, send.finished_at = CampaignSend.Status.SENT, now
        send.save(update_fields=["counts", "status", "finished_at"])
        campaign = send.campaign
        audit.record("send_finished", campaign, metadata={"send": send.pk, "counts": send.counts})
        if send.kind == CampaignSend.Kind.RULE and send.review_id is None:
            notify(
                recipient=campaign.owner,
                actor=None,
                kind=Notification.Kind.CAMPAIGN_SENT,
                message=sent_message(campaign, send.counts),
                link=f"/campaigns/{campaign.pk}",
                push_on_commit=True,
            )
    return send


def resume(send, *, now):
    """Finishes a send cut off mid-delivery. Anyone it was emailing when it
    stopped (taken `STALE_MINUTES` ago or more, never marked:
    `surveys.sending.stuck`) is
    skipped `failed` rather than emailed again; then the rest are delivered. Their
    email may still have gone out (the worker died between SMTP and the
    mark), so each keeps its token's hash: the link in that email keeps
    working, and the audience counts them as having had this campaign
    (`audience.MAYBE_SENT`) so no later send emails them again."""
    taken = send.deliveries.filter(status=QUEUED).exclude(token_hash="")
    stuck(taken, send, now=now, minutes=STALE_MINUTES).update(
        status=SKIPPED, reason=SkipReason.FAILED
    )
    return deliver(send)


def deliver_pending(organisation=None, *, now):
    """Every `sending` send, at once: no send is delivered inside a request
    any more, so there is nothing young to leave alone (a concurrent
    deliverer's people are taken one conditional UPDATE at a time, so two
    runs never email anyone twice). Each on its own; a failure is logged
    by id and class and counted. Returns (finished, failed)."""
    due = CampaignSend.objects.filter(status=CampaignSend.Status.SENDING)
    if organisation is not None:
        due = due.filter(campaign__organisation=organisation)
    finished = failed = 0
    for send in list(due.order_by("pk")):
        try:
            send = resume(send, now=now)
        except Exception as exc:  # noqa: BLE001 - one send's failure never stops the rest
            logger.error("campaign send %s: finishing failed: %s", send.pk, type(exc).__name__)
            failed += 1
            continue
        finished += send.status == CampaignSend.Status.SENT
    return finished, failed
