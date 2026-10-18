"""Who a campaign reaches and why the rest are skipped (spec §1.3).

The people are Surveys' (`surveys.audience.candidates`), read as the
campaign's owner, so a campaign reaches only people its owner may open.
Each is then checked in order, first match wins: unsubscribed, no email,
already received this campaign, any campaign email in the last 3 days, and
the 500 limit. As in Surveys, the cap of three per organisation or account
applies after the skips, to who is left; people beyond it are not reached.

A `queued` delivery counts as "has it" as well as a `sent` one: a send cut
off mid-delivery keeps its people queued, and nobody else may claim them.
So does a delivery skipped with its token's hash still set (`MAYBE_SENT`):
it was taken and then cut off before it was marked, so its email may have
gone out (`sending.resume`). Only a known failure clears the hash. For the
3-day gap such a row counts from its send's start, having no `sent_at`.
The claim calls `build` under the workspace lock, so two sends cannot both
pass these checks. Nothing here writes."""

from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import Q

from services.surveys.audience import candidates
from services.surveys.models import PER_RECORD_CAP

from .models import GAP_DAYS, MAX_PEOPLE, CampaignDelivery, SkipReason

#: Delivery statuses that mean the person has it, or is about to.
HELD = (CampaignDelivery.Status.QUEUED, CampaignDelivery.Status.SENT)
#: A delivery taken, then cut off before it was marked and resumed as
#: stale: skipped, but its email may have gone out, so it counts as sent.
MAYBE_SENT = Q(status=CampaignDelivery.Status.SKIPPED) & ~Q(token_hash="")
#: How many people the audience endpoint names.
SAMPLE = 20


def valid_email(value):
    value = (value or "").strip()
    if not value:
        return False
    try:
        validate_email(value)
    except ValidationError:
        return False
    return True


@dataclass
class Reach:
    """Who a send would queue, in send order, and who it would skip and why."""

    queued: list = field(default_factory=list)
    skipped: list = field(default_factory=list)

    @property
    def reach(self):
        return len(self.queued)

    def tally(self):
        found = Counter(reason for _person, reason in self.skipped)
        return {reason: found[reason] for reason in SkipReason.values}

    def counts(self):
        return {"reached": len(self.queued) + len(self.skipped), "sent": 0, "skipped": self.tally()}

    def payload(self, sample=SAMPLE):
        return {
            "reach": self.reach,
            "skipped": self.tally(),
            "sample": [{"id": person.pk, "name": person.name} for person in self.queued[:sample]],
        }


def _received(campaign, ids):
    return set(
        CampaignDelivery.objects.filter(
            Q(status__in=HELD) | MAYBE_SENT, send__campaign_id=campaign.pk, contact_id__in=ids
        ).values_list("contact_id", flat=True)
    )


def _recent(campaign, ids, now):
    since = now - timedelta(days=GAP_DAYS)
    sent_lately = Q(status=CampaignDelivery.Status.SENT, sent_at__gte=since)
    maybe_lately = MAYBE_SENT & Q(send__started_at__gte=since)
    return set(
        CampaignDelivery.objects.filter(
            send__campaign__organisation_id=campaign.organisation_id, contact_id__in=ids
        )
        .filter(sent_lately | maybe_lately | Q(status=CampaignDelivery.Status.QUEUED))
        .values_list("contact_id", flat=True)
    )


def _reason(person, received, recent):
    if person.campaigns_unsubscribed_at is not None:
        return SkipReason.UNSUBSCRIBED
    if not valid_email(person.email):
        return SkipReason.NO_EMAIL
    if person.pk in received:
        return SkipReason.ALREADY_RECEIVED
    if person.pk in recent:
        return SkipReason.RECENT_CAMPAIGN
    return None


def build(campaign, *, today, now, records=None):
    """The campaign's reach now, as its owner sees it. `records` (a rule's
    fired records, ids of the segment's kind) replace the segment's members."""
    # SOC2:AUTH-02 read as the campaign's owner: only people they may open are reached
    people, _hidden, capped = candidates(
        campaign.segment, campaign.roles, campaign.owner, today=today, records=records
    )
    ids = [person.pk for person in people]
    received, recent = _received(campaign, ids), _recent(campaign, ids, now)
    reach, per_record = Reach(), Counter()
    for person in people:
        reason = _reason(person, received, recent)
        if reason is not None:
            reach.skipped.append((person, reason))
            continue
        record = (person.customer_id, person.account_id)
        if capped and per_record[record] >= PER_RECORD_CAP:
            continue
        if len(reach.queued) >= MAX_PEOPLE:
            reach.skipped.append((person, SkipReason.OVER_LIMIT))
            continue
        per_record[record] += 1
        reach.queued.append(person)
    return reach
