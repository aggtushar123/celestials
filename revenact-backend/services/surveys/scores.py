"""Survey figures (spec Decisions, "Scores"; §1.5).

NPS = % promoters (9–10) − % detractors (0–6); CSAT = % answering 4–5;
CES = % answering 5–7. Percentages keep two decimals; where a field or a
tile wants an integer, `whole_percent` rounds straight from the counts to
it. Both round half up, once: 1 net promoter in 201 (0.4975 %) is 0, never
0.50 then 1.
"""

import logging
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from services.customers.models import Account, Customer, Survey

from .models import WINDOW_DAYS, SurveyInvite
from .questions import BANDS, CES, HIGH, LOW, NPS, band_of

logger = logging.getLogger(__name__)


def percent(part, total):
    return (Decimal(100) * part / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def whole_percent(part, total):
    return int((Decimal(100) * part / total).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _share(survey_type, scores):
    """`(part, total)` behind the type's figure, or None with no scores."""
    scores = list(scores)
    if not scores:
        return None
    high = sum(1 for score in scores if score >= HIGH[survey_type])
    if survey_type == NPS:
        low = sum(1 for score in scores if score <= LOW[survey_type])
        return high - low, len(scores)
    return high, len(scores)


def figure(survey_type, scores):
    """The type's figure over `scores` to two decimals, or None when there are none."""
    share = _share(survey_type, scores)
    return None if share is None else percent(*share)


def whole_figure(survey_type, scores):
    """The type's figure over `scores` as an integer, or None when there are none."""
    share = _share(survey_type, scores)
    return None if share is None else whole_percent(*share)


def bands(survey_type, scores):
    counts = dict.fromkeys(BANDS[survey_type], 0)
    for score in scores:
        counts[band_of(survey_type, score)] += 1
    return counts


#: The record field each type's figure is written to. `Account` has no CES field.
SCORE_FIELD = {"nps": "nps_score", "csat": "csat_score", "ces": "ces_percentage"}


def records_for(invite, survey_type):
    """The records one answer scores. An organisation contact's answer
    scores that organisation. An account contact's answer scores the
    account (NPS, CSAT) and every organisation the account belongs to,
    which is also where its CES goes."""
    if invite.customer_id:
        return [invite.customer]
    account = invite.account
    organisations = list(account.customers.all())
    return organisations if survey_type == CES else [account, *organisations]


def answers_for(record, survey_type):
    """Answered invites of `survey_type` that score `record`: an account's
    own, or an organisation's own and its accounts'. Subqueries, so no
    answer is counted twice."""
    answered = SurveyInvite.objects.filter(
        status=SurveyInvite.Status.ANSWERED, send__survey_type=survey_type
    )
    if isinstance(record, Account):
        return answered.filter(account=record)
    accounts = Account.objects.filter(customers=record).values("pk")
    return answered.filter(Q(customer=record) | Q(account__in=accounts))


def refresh(record, survey_type, *, now):
    """Writes the 90-day figure onto the record. False, and the score left
    as it is, when no answer is live."""
    since = now - timedelta(days=WINDOW_DAYS)
    scores = answers_for(record, survey_type).filter(answered_at__gte=since)
    # NPS is stored as an integer, CSAT and CES to two decimals
    measure = whole_figure if survey_type == NPS else figure
    value = measure(survey_type, scores.values_list("score", flat=True))
    if value is None:
        return False
    field = SCORE_FIELD[survey_type]
    setattr(record, field, value)
    record.save(update_fields=[field])
    return True


def upsert_log(send, record, *, now):
    """The send's own log row for `record`: this send's figure for it so
    far, every answer, with no 90-day window."""
    scores = answers_for(record, send.survey_type).filter(send=send)
    value = whole_figure(send.survey_type, scores.values_list("score", flat=True))
    if value is None:
        return None
    parent = {"account": record} if isinstance(record, Account) else {"customer": record}
    row, _created = Survey.objects.update_or_create(
        send=send,
        **parent,
        defaults={
            "survey_type": send.survey_type,
            "status": Survey.Status.RESPONDED,
            "score": value,
            "sent_at": timezone.localdate(send.sent_at or send.started_at or now),
            "responded_at": timezone.localdate(now),
        },
    )
    return row


def _lock_records(records):
    """Locks the Account and Customer rows `records` holds, accounts by id
    then customers by id — always that order — before any of them is
    recomputed. Two answers landing for the same organisation at the same
    moment then recompute in turn instead of each missing the other's
    write (READ COMMITTED), and the fixed order means they can never
    deadlock against each other.

    The locks are `FOR NO KEY UPDATE`: only score columns are written, never
    a key, so they never conflict with the `FOR KEY SHARE` lock every
    foreign-key insert takes on its parent (a claim's invites, a rule's
    tasks), which Postgres takes at commit in insertion order and which a
    plain `FOR UPDATE` could deadlock against."""
    account_ids = sorted({record.pk for record in records if isinstance(record, Account)})
    customer_ids = sorted({record.pk for record in records if isinstance(record, Customer)})
    if account_ids:
        list(
            Account.objects.select_for_update(no_key=True).filter(pk__in=account_ids).order_by("pk")
        )
    if customer_ids:
        list(
            Customer.objects.select_for_update(no_key=True)
            .filter(pk__in=customer_ids)
            .order_by("pk")
        )


def record_answer(invite, score, comment, *, now):
    """The invite becomes answered; each record it scores gets its 90-day
    figure again and its log row for this send. Run it inside the caller's
    transaction, with the invite locked — and, before any of them is
    recomputed, the records it scores locked too."""
    invite.status = SurveyInvite.Status.ANSWERED
    invite.score = score
    invite.comment = comment
    invite.answered_at = now
    invite.save(update_fields=["status", "score", "comment", "answered_at"])
    send = invite.send
    records = records_for(invite, send.survey_type)
    _lock_records(records)
    for record in records:
        refresh(record, send.survey_type, now=now)
        upsert_log(send, record, now=now)


#: How far past the 90-day edge the nightly step looks, so a missed night
#: or two is caught up. Re-reading a record is idempotent.
AGED_LOOKBACK_DAYS = 7


def refresh_aged(organisation=None, *, now):
    """Re-reads the figure of every record with an answer that has just
    aged past the 90-day window, so the score stops counting it. Returns
    how many records were re-read. A record with no live answer left keeps
    its score, as `refresh` does. One record's failure never stops the rest."""
    edge = now - timedelta(days=WINDOW_DAYS)
    aged = SurveyInvite.objects.filter(
        status=SurveyInvite.Status.ANSWERED,
        answered_at__lt=edge,
        answered_at__gte=edge - timedelta(days=AGED_LOOKBACK_DAYS),
    ).select_related("send", "customer", "account")
    if organisation is not None:
        aged = aged.filter(send__organisation=organisation)
    done = set()
    for invite in aged:
        survey_type = invite.send.survey_type
        for record in records_for(invite, survey_type):
            key = (type(record).__name__, record.pk, survey_type)
            if key not in done:
                try:
                    with transaction.atomic():
                        records = [record]
                        _lock_records(records)
                        refresh(record, survey_type, now=now)
                except Exception as exc:  # noqa: BLE001 - one record's failure never stops the rest
                    # never str(exc) or a traceback: a database error's DETAIL can quote a row
                    logger.error(
                        "%s %s: refresh_aged failed: %s",
                        type(record).__name__,
                        record.pk,
                        type(exc).__name__,
                    )
                    continue
                done.add(key)
    return len(done)
