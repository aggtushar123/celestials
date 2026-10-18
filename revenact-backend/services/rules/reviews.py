"""A rule's survey (spec §1.3). The night's fired records become one review
for the owner to approve or skip, or a survey sent at once when the rule
says "without review" (`send_review(actor=None)`).

Either way the survey goes through services.surveys, so every Surveys rule
holds: the 30-day quiet period, three per record, 500 people, 20 sends a
day, and email set up. Its audience is only the night's fired records that
the owner may still open (`resolve(records=...)`), resolved again at
approval time.

Lock order. A survey's approval: the review's row, then the workspace,
then the owner, then the send — the order `surveys.sending.claim` takes,
taken again explicitly before the draft is inserted (`_lock_sender`). A
campaign's approval: the rule's row (`FOR NO KEY UPDATE`), then the
review's, then the workspace, then the campaign (`campaigns.sending.claim`).
The rule comes first there because the campaign send's insert takes
`FOR KEY SHARE` on the rule's row, and a rule edit holds that row while it
expires the rule's reviews (`expire_for_rule`): rule before review, as the
edit takes them.

A review whose rule now points at a segment of another kind, or none, is
refused at approval and expires (`RULE_CHANGED`); an edit to the rule's
segment or trigger expires its waiting reviews at once (`expire_for_rule`).

A refusal is stored on the review and leaves it waiting, so the owner can
try again once it is fixed, or skip it. The survey's draft is created in
the claim's savepoint, so a refusal leaves no draft behind that a later
send by hand could take to the whole segment."""

import logging
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404

from core import audit
from services.accounts.models import Organisation, User
from services.campaigns.models import Campaign, CampaignSend
from services.campaigns.sending import before_claim
from services.campaigns.sending import claim as claim_campaign
from services.campaigns.validation import CHOOSE_CAMPAIGN
from services.surveys.audience import resolve
from services.surveys.models import SurveySend
from services.surveys.sending import (
    EMAIL_NOT_SET_UP,
    Refusal,
    claim,
    email_is_set_up,
)

from .models import REVIEW_DAYS, Rule, RuleReview

logger = logging.getLogger(__name__)

ALREADY_DECIDED = "This review has already been decided."
RULE_CHANGED = (
    "This rule's segment or trigger has changed since this review was made, so it has expired."
)
#: `rule.review_expired`'s reason when the rule was edited, not aged out.
CHANGED_REASON = "rule_changed"
#: `SurveySend.name`'s length.
SEND_NAME = 120


class Decided(Exception):
    """The review is no longer waiting: the API answers 409."""


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict


def survey_name(rule, run_on):
    """ "Renewal watch · 4 Oct 2026": the rule's name, cut so the whole fits."""
    suffix = f" · {run_on.day} {run_on:%b %Y}"
    return f"{rule.name[: SEND_NAME - len(suffix)]}{suffix}"


def create_review(rule, run, record_ids, action, *, today):
    """The night's survey, waiting: the action frozen, the fired records,
    and how many people they reach as the owner sees them now (the review
    item's "6 people at 4 organisations")."""
    # SOC2:AUTH-02 counted as the owner: their segment, the fired records they may open
    audience = resolve(rule.segment, action["roles"], rule.owner, today=today, records=record_ids)
    return RuleReview.objects.create(
        rule=rule,
        run=run,
        action=dict(action),
        records=[{"kind": rule.segment.kind, "id": pk} for pk in record_ids],
        counts={"people": len(audience.people), "records": audience.organisations},
    )


GONE = "Its campaign was archived or deleted."


def create_campaign_review(rule, run, record_ids, action, reach):
    """The night's campaign, waiting: the action frozen, the fired records,
    and who they would reach and skip now, as the owner sees them."""
    return RuleReview.objects.create(
        rule=rule,
        run=run,
        kind=RuleReview.Kind.CAMPAIGN,
        action=dict(action),
        records=[{"kind": rule.segment.kind, "id": pk} for pk in record_ids],
        counts={"reach": reach.reach, "skipped": reach.tally()},
    )


def send_campaign_review(review_id, *, actor, today, now, request=None):
    """Approves a waiting campaign review and sends the campaign to the
    review's records, as the rule's owner, through `campaigns.sending`.
    Returns `Answer(200, {"campaign_send_id"})` or `Answer(400, <refusal>)`,
    which is stored on the review while it stays waiting. Raises `Decided`
    once it is no longer waiting. Nothing is emailed here: the send is
    committed `sending` with everyone queued, for the every-minute
    `deliver_pending` runner."""
    rule_id = RuleReview.objects.filter(pk=review_id).values_list("rule_id", flat=True).get()
    with transaction.atomic():
        # Lock order: rule, review, workspace, campaign (see the module docstring).
        list(
            Rule.objects.select_for_update(no_key=True)
            .filter(pk=rule_id)
            .values_list("pk", flat=True)
        )
        review = _locked(review_id)
        rule, action = review.rule, review.action
        if _changed_since(review):
            _expire(review, now=now, reason=CHANGED_REASON, actor=actor, request=request)
            return Answer(400, {"detail": RULE_CHANGED})
        campaign = Campaign.objects.select_related("segment").filter(pk=action["campaign"]).first()
        if campaign is None or campaign.status == Campaign.Status.ARCHIVED:
            return _refused(review, Refusal(400, {"detail": GONE}))
        if (
            campaign.owner_id != rule.owner_id
            or campaign.segment is None
            or any(item["kind"] != campaign.segment.kind for item in review.records)
        ):
            return _refused(review, Refusal(400, {"detail": CHOOSE_CAMPAIGN}))
        refusal = before_claim(campaign)
        if refusal:
            return _refused(review, Refusal(400, refusal))
        try:
            with transaction.atomic():
                # SOC2:AUTH-02 the claim builds the audience as the campaign's owner,
                # from the fired records they may still open
                send = claim_campaign(
                    campaign.pk,
                    kind=CampaignSend.Kind.RULE,
                    by=actor,
                    rule=rule,
                    review=review,
                    records=[item["id"] for item in review.records],
                    # checked again under the campaign's lock
                    expect_kind=rule.segment.kind,
                    expect_owner=rule.owner_id,
                    today=today,
                    now=now,
                    request=request,
                )
        except Refusal as refusal:
            return _refused(review, refusal)
        review.status = RuleReview.Status.APPROVED
        review.decided_by, review.decided_at = actor, now
        review.result = {"campaign_send_id": send.pk}
        review.save(update_fields=["status", "decided_by", "decided_at", "result"])
        audit.record(  # SOC2:LOG-01
            "rule.review_approved",
            request=request,
            actor=actor,
            organisation=rule.organisation,
            target=review,
            metadata={
                "rule": rule.pk,
                "kind": review.kind,
                "campaign_send": send.pk,
                "without_review": False,
            },
        )
    # Committed `sending` with everyone queued: the every-minute
    # `deliver_pending` runner emails them, so approving answers at once.
    return Answer(200, {"campaign_send_id": send.pk})


def get_owned_review(user, pk):
    """A review of one of `user`'s rules, or a 404 that reads the same for a
    missing one and anyone else's."""
    # SOC2:AUTH-02 only the rule's owner reads or decides its reviews
    reviews = RuleReview.objects.filter(
        rule__owner=user, rule__organisation_id=user.organisation_id
    )
    return get_object_or_404(reviews, pk=pk)


def _locked(review_id):
    """The review under its row lock, with what deciding it reads. Raises
    `Decided` unless it is waiting. Call inside a transaction."""
    review = (
        RuleReview.objects.select_for_update(of=("self",))
        .select_related("rule__owner", "rule__segment", "rule__organisation", "run")
        .get(pk=review_id)
    )
    if review.status != RuleReview.Status.WAITING:
        raise Decided
    return review


def _expire(review, *, now, reason=None, actor=None, request=None):
    """The locked, waiting `review` becomes `expired`, audited. `reason` is
    set only when the rule was edited under it."""
    review.status = RuleReview.Status.EXPIRED
    review.decided_at = now
    review.save(update_fields=["status", "decided_at"])
    metadata = {"rule": review.rule_id, "kind": review.kind}
    if reason:
        metadata["reason"] = reason
    audit.record(  # SOC2:LOG-01
        "rule.review_expired",
        request=request,
        actor=actor,
        organisation=review.rule.organisation,
        target=review,
        metadata=metadata,
    )


def expire_for_rule(rule, *, now, request=None):
    """Every review of `rule` still waiting becomes `expired` (reason
    `rule_changed`): its records were fired on another segment or trigger.
    Call inside the transaction that holds the rule's row lock; nothing
    takes a rule's lock after a review's, so this order cannot deadlock."""
    waiting = (
        RuleReview.objects.select_for_update(of=("self",))
        .select_related("rule__organisation")
        .filter(rule=rule, status=RuleReview.Status.WAITING)
        .order_by("pk")
    )
    expired = 0
    for review in waiting:
        _expire(review, now=now, reason=CHANGED_REASON, request=request)
        expired += 1
    return expired


def _changed_since(review):
    """Whether the rule no longer points at a segment of the kind the
    review's records were fired as: approving would read their ids as
    other records."""
    segment = review.rule.segment
    return segment is None or any(item["kind"] != segment.kind for item in review.records)


def _refused(review, refusal):
    review.result = {"error": refusal.body}
    review.save(update_fields=["result"])
    return Answer(400, refusal.body)


def _lock_sender(organisation_id, owner_id):
    """The workspace, then the owner: the same two locks `claim` takes, in
    the same order, taken again here before the draft is inserted. The
    draft's own foreign keys would otherwise take a `FOR KEY SHARE` lock on
    the owner's row before `claim`'s workspace lock, which can deadlock
    against another send by the same owner. Re-taking a lock already held
    is harmless within one transaction. Call inside a transaction."""
    list(
        Organisation.objects.select_for_update(no_key=True)
        .filter(pk=organisation_id)
        .values_list("pk", flat=True)
    )
    list(User.objects.select_for_update().filter(pk=owner_id).values_list("pk", flat=True))


def send_review(review_id, *, actor, today, now, request=None):
    """Approves a waiting review and sends its survey as the rule's owner.
    `actor` is the owner approving, or None for a rule that sends without
    review. Returns `Answer(200, {"survey_send_id"})`, or `Answer(400,
    <Surveys' refusal>)`, which is stored on the review while it stays
    waiting. Raises `Decided` once it is no longer waiting. Nothing is
    emailed here: the send is committed `sending` with everyone queued, for
    the every-minute `deliver_pending` runner."""
    kind = RuleReview.objects.filter(pk=review_id).values_list("kind", flat=True).first()
    if kind == RuleReview.Kind.CAMPAIGN:
        return send_campaign_review(review_id, actor=actor, today=today, now=now, request=request)
    with transaction.atomic():
        review = _locked(review_id)
        rule, action = review.rule, review.action
        if _changed_since(review):
            _expire(review, now=now, reason=CHANGED_REASON, actor=actor, request=request)
            return Answer(400, {"detail": RULE_CHANGED})
        if not email_is_set_up():
            return _refused(review, Refusal(400, {"detail": EMAIL_NOT_SET_UP}))
        try:
            with transaction.atomic():
                # lock order: workspace, then owner, exactly as `claim` takes them,
                # and before the draft's own FK lock on the owner's row
                _lock_sender(rule.organisation_id, rule.owner_id)
                draft = SurveySend.objects.create(
                    organisation_id=rule.organisation_id,
                    owner=rule.owner,
                    name=survey_name(rule, review.run.run_on),
                    survey_type=action["survey_type"],
                    subject=action["subject"],
                    intro=action["intro"],
                    segment=rule.segment,
                    roles=action["roles"],
                    rule=rule,
                )
                # SOC2:AUTH-02 the claim resolves the audience again as the owner,
                # from the fired records they may still open
                send = claim(
                    draft.pk,
                    rule.owner,
                    today=today,
                    now=now,
                    records=[item["id"] for item in review.records],
                    actor=actor,
                    request=request,
                )
        except Refusal as refusal:
            return _refused(review, refusal)
        review.status = RuleReview.Status.APPROVED
        review.decided_by, review.decided_at = actor, now
        review.result = {"survey_send_id": send.pk}
        review.save(update_fields=["status", "decided_by", "decided_at", "result"])
        audit.record(  # SOC2:LOG-01
            "rule.review_approved",
            request=request,
            actor=actor,
            organisation=rule.organisation,
            target=review,
            metadata={
                "rule": rule.pk,
                "kind": review.kind,
                "survey_send": send.pk,
                "without_review": actor is None,
            },
        )
    # Committed `sending` with everyone queued: the every-minute
    # `deliver_pending` runner emails them, finishes the send and audits
    # `survey.sent`, so approving answers at once.
    return Answer(200, {"survey_send_id": send.pk})


def skip_review(review_id, user, *, now, request=None):
    """The owner skips a waiting review: no survey. Raises `Decided` once it
    is no longer waiting."""
    with transaction.atomic():
        review = _locked(review_id)
        review.status = RuleReview.Status.SKIPPED
        review.decided_by, review.decided_at = user, now
        review.save(update_fields=["status", "decided_by", "decided_at"])
        audit.record(  # SOC2:LOG-01
            "rule.review_skipped",
            request=request,
            actor=user,
            organisation=review.rule.organisation,
            target=review,
            metadata={"rule": review.rule_id, "kind": review.kind},
        )
    return review


def expire_reviews(organisation=None, *, now):
    """Every review waiting `REVIEW_DAYS` or more becomes `expired`, each in
    its own transaction under its row lock. One failure is logged by id and
    never stops the rest. Returns how many expired."""
    due = RuleReview.objects.filter(
        status=RuleReview.Status.WAITING, created_at__lte=now - timedelta(days=REVIEW_DAYS)
    )
    if organisation is not None:
        due = due.filter(rule__organisation=organisation)
    expired = 0
    for review_id in list(due.order_by("pk").values_list("pk", flat=True)):
        try:
            with transaction.atomic():
                _expire(_locked(review_id), now=now)
            expired += 1
        except Decided:
            continue
        except Exception as exc:  # noqa: BLE001 - one review's failure never stops the rest
            # never str(exc): a database error's DETAIL can quote a row's values
            logger.error("rule review %s: expiry failed: %s", review_id, type(exc).__name__)
    return expired
