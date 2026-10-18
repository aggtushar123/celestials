"""The nightly step (spec §1.4): every active rule, once a night, as its owner.

`run_health_maintenance` calls `evaluate_rules` after the segments' own step
(so today's entries and exits exist and the scores are fresh) and before
the month-end metrics. Reviews waiting 7 days expire first. Then each
active rule runs in its own transaction:

1. lock the rule's row (the API's edits take the same lock), and, for a
   rule that starts plans, the workspace's; skip it if tonight's run
   exists: one run per rule per night;
2. switch it off, with a reason and one notice to the owner, if its segment
   is gone or no longer the owner's, or the owner is inactive;
3. select tonight's records as the owner sees them (`selection.select`);
4. run the internal actions, each record and action in its own savepoint
   (a failure is recorded on that record and the rest go on), send the
   digests, make the survey's review, and the campaign's review or
   (without review) its claim;
5. write the run and its records, store the scores and fired dates, and
   audit `rule.fired` with counts.

A rule's failure rolls back that rule's night only. It is logged by id and
never stops the rest. A record fires when at least one action did
something (`done`, `unchanged` or `queued`); one whose actions all failed
is skipped `failed`, and one whose actions were all skipped (nobody may be
told) is skipped `nobody`. Neither starts its cooldown.

After every rule has committed (`_finish_night`), tonight's surveys
"without review" not yet tried are claimed (`reviews.send_review`, which
emails nobody), and each owner with surveys
waiting that they have not been told about gets one `rule_review` notice
(`RuleReview.notified_at`). Both read what is stored, not what this run
made, so a re-run after a crash between the commits and these sends and
notices finishes them, once. Then every campaign send still `sending` that
nobody has finished is finished (`campaigns.sending.deliver_pending`),
then every survey send likewise (`surveys.sending.deliver_pending`), as
the every-minute `deliver_pending` command also does. Log lines carry
ids and exception class names only."""

import logging
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from core import audit
from services.accounts.models import Organisation, User
from services.campaigns.models import Campaign
from services.campaigns.sending import deliver_pending
from services.notifications.models import Notification
from services.notifications.realtime import notify
from services.plans.models import PlanTemplate
from services.surveys.audience import resolve as resolve_audience
from services.surveys.sending import deliver_pending as deliver_surveys
from services.work.standing import working_ids

from .actions import (
    DONE,
    FAILED,
    INTERNAL,
    NOBODY_TO_REACH,
    QUEUED,
    SKIPPED,
    UNCHANGED,
    campaign_statuses,
    failed,
    notify_statuses,
    result,
)
from .models import MAX_SKIPPED_ROWS, Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from .records import load
from .reviews import create_review, expire_reviews, send_review
from .selection import select

logger = logging.getLogger(__name__)

#: A record fired if at least one action did one of these.
ACTED = frozenset({DONE, UNCHANGED, QUEUED})
#: How many state rows one statement writes.
STATE_BATCH = 1000
UNIQUE_STATE = ["rule", "record_kind", "record_id"]

# My work's Approvals chip holds rule reviews (Work in one place, delivery 2).
REVIEWS_LINK = "/work/mine?kind=approval"


@dataclass
class RulesResult:
    ran: int = 0
    fired: int = 0
    reviews: int = 0
    paused: int = 0
    expired: int = 0
    failed: int = 0
    campaign_sends: int = 0
    survey_sends: int = 0


@dataclass(frozen=True)
class Outcome:
    ran: bool = False
    fired: int = 0
    paused: bool = False
    reviews: int = 0


def pause_reason(rule, working=None):
    """Why the rule may not run any more, or "" when it may. `working` is
    the workspace's active-for-work ids (`work.standing`), read here when
    not given."""
    if rule.segment_id is None:
        return Rule.Paused.SEGMENT_GONE
    if rule.segment.owner_id != rule.owner_id:
        return Rule.Paused.SEGMENT_NOT_OWNED
    if working is None:
        working = working_ids(rule.organisation_id)
    # SOC2:AUTH-02 an owner suspended or revoked here is treated as inactive
    if rule.owner_id not in working:
        return Rule.Paused.OWNER_INACTIVE
    templates = [action["template"] for action in rule.actions if action["action"] == "plan"]
    if templates and not PlanTemplate.objects.filter(pk__in=templates).exists():
        return Rule.Paused.TEMPLATE_GONE
    campaigns = [action["campaign"] for action in rule.actions if action["action"] == "campaign"]
    live = Campaign.objects.filter(pk__in=campaigns).exclude(status=Campaign.Status.ARCHIVED)
    if campaigns and not live.exists():
        return Rule.Paused.CAMPAIGN_GONE
    return ""


def _pause(rule, reason):
    rule.is_active, rule.paused_reason = False, reason
    rule.save(update_fields=["is_active", "paused_reason", "updated_at"])
    audit.record(  # SOC2:LOG-01
        "rule.paused", organisation=rule.organisation, target=rule, metadata={"reason": reason}
    )
    notify(
        recipient=rule.owner,
        actor=None,
        kind=Notification.Kind.RULE_FIRED,
        message=f"{rule.name} was switched off: {Rule.Paused(reason).label}",
        link=f"/scenarios/rules/{rule.pk}",
        push_on_commit=True,
    )


def _act(rule, run, records, kind, *, today, now, working):
    """Every action on every record: `{record_id: [status, ...]}` in the
    rule's action order. Tasks and lifecycle run per record, each in its own
    savepoint; the digests go once per recipient; the survey's audience is
    resolved once for the whole night's records and, when it reaches
    nobody, every record's survey is skipped instead of queued; the
    campaign's status is written once for all the night's records too."""
    statuses = {record.pk: {} for record in records}
    made = set()
    for record in records:
        for index, action in enumerate(rule.actions):
            run_action = INTERNAL.get(action["action"])
            if run_action is None:
                continue
            # A task is given only to someone active for work: the run's ids.
            extra = {"working": working} if action["action"] == "task" else {}
            try:
                with transaction.atomic():
                    statuses[record.pk][index] = run_action(
                        action, rule, record, kind, today=today, made=made, **extra
                    )
            except Exception as exc:  # noqa: BLE001 - one record's failure never stops the rest
                logger.warning(
                    "rule %s: %s on %s %s failed: %s",
                    rule.pk,
                    action["action"],
                    kind,
                    record.pk,
                    type(exc).__name__,
                )
                statuses[record.pk][index] = failed(action["action"], exc)
    for index, action in enumerate(rule.actions):
        if action["action"] == "notify":
            for pk, status in notify_statuses(action, rule, run, records, kind).items():
                statuses[pk][index] = status
        elif action["action"] == "survey" and records:
            # SOC2:AUTH-02 the audience is resolved once, as the owner, for the
            # whole night's records — the same reach `create_review` resolves
            # again, not a per-record check
            audience = resolve_audience(
                rule.segment,
                action["roles"],
                rule.owner,
                today=today,
                records=[record.pk for record in records],
            )
            status = (
                result("survey", SKIPPED, NOBODY_TO_REACH)
                if not audience.people
                else result("survey", QUEUED)
            )
            for record in records:
                statuses[record.pk][index] = status
        elif action["action"] == "campaign" and records:
            try:
                with transaction.atomic():
                    found = campaign_statuses(
                        action, rule, run, records, kind, today=today, now=now
                    )
            except Exception as exc:  # noqa: BLE001 - the campaign's failure never stops the rest
                logger.warning("rule %s: campaign failed: %s", rule.pk, type(exc).__name__)
                found = {record.pk: failed("campaign", exc) for record in records}
            for pk, status in found.items():
                statuses[pk][index] = status
    return {pk: [by_index[i] for i in sorted(by_index)] for pk, by_index in statuses.items()}


def _store_states(rule, kind, selection, fired_ids, *, today):
    """Tonight's score for every member that has one (`crossed`), after
    clearing the rest, and tonight's date on every record that fired."""
    if rule.trigger == Rule.Trigger.CROSSED:
        rule.states.filter(last_value__isnull=False).update(last_value=None)
        RuleState.objects.bulk_create(
            [
                RuleState(rule=rule, record_kind=kind, record_id=pk, last_value=value)
                for pk, value in selection.values.items()
            ],
            update_conflicts=True,
            unique_fields=UNIQUE_STATE,
            update_fields=["last_value"],
            batch_size=STATE_BATCH,
        )
    RuleState.objects.bulk_create(
        [
            RuleState(rule=rule, record_kind=kind, record_id=pk, last_fired_on=today)
            for pk in fired_ids
        ],
        update_conflicts=True,
        unique_fields=UNIQUE_STATE,
        update_fields=["last_fired_on"],
        batch_size=STATE_BATCH,
    )


def skip_reason(statuses):
    """ "" for a record that fired, else why not: `failed` if any action
    failed, `nobody` if every action was skipped."""
    found = {status["status"] for status in statuses}
    if found & ACTED:
        return ""
    return "failed" if FAILED in found else "nobody"


def run_rule(rule_id, *, today, now=None):
    """One rule's night, under its row lock. Call inside a transaction. A
    rule switched off or deleted since the list was read is skipped."""
    now = now or timezone.now()
    started = timezone.now()
    locked = Rule.objects.select_for_update(of=("self",)).select_related(
        "owner", "segment", "organisation"
    )
    rule = locked.filter(pk=rule_id, is_active=True).first()
    if rule is None or RuleRun.objects.filter(rule=rule, run_on=today).exists():
        return Outcome()
    # Read once for the run: the pause check and every task's assignee.
    working = working_ids(rule.organisation_id)
    reason = pause_reason(rule, working)
    if reason:
        _pause(rule, reason)
        return Outcome(paused=True)
    if any(action["action"] in ("plan", "campaign") for action in rule.actions):
        # Lock order: rule, workspace, then the record locks of the lifecycle
        # action, Plans' locks, and the campaign's. `start_plan` and
        # `campaigns.sending.claim` take the workspace lock too; taking it
        # here first keeps a record lock from coming before it.
        list(
            Organisation.objects.select_for_update(no_key=True)
            .filter(pk=rule.organisation_id)
            .values_list("pk", flat=True)
        )
    # SOC2:AUTH-02 everything below reads and acts as the owner: `select` matches only
    # records they may open, and the survey's audience is resolved as them again
    selection = select(rule, rule.owner, today=today, state_rule_id=rule.pk)
    kind = selection.kind
    run = RuleRun.objects.create(rule=rule, run_on=today, started_at=started)
    records = load(kind, selection.fire)
    statuses = _act(rule, run, records, kind, today=today, now=now, working=working)
    reasons = {record.pk: skip_reason(statuses[record.pk]) for record in records}
    fired = [record.pk for record in records if not reasons[record.pk]]
    survey = next((action for action in rule.actions if action["action"] == "survey"), None)
    queued = any(
        status["action"] == "survey" and status["status"] == QUEUED
        for record in records
        for status in statuses[record.pk]
    )
    if queued:
        create_review(rule, run, fired, survey, today=today)
    RuleRunRecord.objects.bulk_create(
        [
            RuleRunRecord(
                run=run,
                record_kind=kind,
                record_id=record.pk,
                outcome=(
                    RuleRunRecord.Outcome.SKIPPED
                    if reasons[record.pk]
                    else RuleRunRecord.Outcome.FIRED
                ),
                reason=reasons[record.pk],
                actions=statuses[record.pk],
            )
            for record in records
        ]
        + [
            RuleRunRecord(
                run=run,
                record_kind=kind,
                record_id=pk,
                outcome=RuleRunRecord.Outcome.SKIPPED,
                reason="cooldown",
            )
            for pk in selection.cooldown[:MAX_SKIPPED_ROWS]
        ]
    )
    _store_states(rule, kind, selection, fired, today=today)
    run.matched, run.fired = selection.matched, len(fired)
    counted = list(reasons.values())
    run.skipped = selection.skipped(failed=counted.count("failed"), nobody=counted.count("nobody"))
    run.finished_at = timezone.now()
    run.save(update_fields=["matched", "fired", "skipped", "finished_at"])
    if selection.matched or selection.not_visible:
        audit.record(  # SOC2:LOG-01
            "rule.fired",
            organisation=rule.organisation,
            target=rule,
            metadata={
                "run": run.pk,
                "matched": run.matched,
                "fired": run.fired,
                "skipped": run.skipped,
            },
        )
    made = RuleReview.objects.filter(run=run).count()
    return Outcome(ran=True, fired=run.fired, reviews=made)


def waiting_message(surveys, campaigns=0):
    count = surveys + campaigns
    if not campaigns:
        one, many = "A survey", "surveys"
    elif not surveys:
        one, many = "A campaign", "campaigns"
    else:
        one, many = "An email", "emails"
    if count == 1:
        return f"{one} from your rules is waiting for your review."
    return f"{count} {many} from your rules are waiting for your review."


def _send_now(review_id, *, today, now):
    """Sends one survey without review. Returns False if it raised (a
    refusal is not a failure: it is stored on the review, which waits)."""
    try:
        send_review(review_id, actor=None, today=today, now=now)
    except Exception as exc:  # noqa: BLE001 - the review stays waiting for its owner
        # never str(exc) or a traceback: a database error's DETAIL can quote a row's values
        logger.error(
            "Rule review %s: sending without review failed: %s", review_id, type(exc).__name__
        )
        return False
    return True


def _in(organisation, reviews):
    return reviews if organisation is None else reviews.filter(rule__organisation=organisation)


def _unsent(organisation, *, today):
    """Tonight's surveys without review still waiting and never tried (a
    refusal stores `result.error` and is left for the owner)."""
    reviews = RuleReview.objects.filter(
        status=RuleReview.Status.WAITING,
        kind=RuleReview.Kind.SURVEY,
        result={},
        action__without_review=True,
        run__run_on=today,
        rule__is_active=True,
    )
    return list(_in(organisation, reviews).order_by("pk").values_list("pk", flat=True))


def _tell_owners(organisation, *, now):
    """One `rule_review` notice per owner for the waiting reviews they have
    not been told about, however many rules made them; each owner's in its
    own savepoint, marking those reviews `notified_at`. Returns how many
    notices failed (they are tried again on the next run)."""
    untold = _in(
        organisation,
        RuleReview.objects.filter(status=RuleReview.Status.WAITING, notified_at__isnull=True),
    )
    by_owner = {}
    for pk, owner_id, kind in untold.order_by("pk").values_list("pk", "rule__owner_id", "kind"):
        by_owner.setdefault(owner_id, []).append((pk, kind))
    lost = 0
    for owner_id, found in sorted(by_owner.items()):
        ids = [pk for pk, _kind in found]
        campaigns = sum(1 for _pk, kind in found if kind == RuleReview.Kind.CAMPAIGN)
        try:
            with transaction.atomic():
                notify(
                    recipient=User.objects.get(pk=owner_id),
                    actor=None,
                    kind=Notification.Kind.RULE_REVIEW,
                    message=waiting_message(len(ids) - campaigns, campaigns),
                    link=REVIEWS_LINK,
                    push_on_commit=True,
                )
                RuleReview.objects.filter(pk__in=ids).update(notified_at=now)
        except Exception as exc:  # noqa: BLE001 - one notice's failure never stops the rest
            logger.error("Rules: review notice to user %s failed: %s", owner_id, type(exc).__name__)
            lost += 1
    return lost


def _finish_night(organisation, *, today, now, result):
    """What follows the rules' commits, from what is stored: the unsent
    surveys without review, then the owners' notices, then every campaign
    send still `sending` that nobody is delivering. A failure of either of
    the first two is counted in `result.failed`."""
    for review_id in _unsent(organisation, today=today):
        if not _send_now(review_id, today=today, now=now):
            result.failed += 1
    result.failed += _tell_owners(organisation, now=now)
    finished, lost = deliver_pending(organisation, now=now)
    result.campaign_sends += finished
    result.failed += lost
    # the backstop for survey sends a runner has not finished
    finished, lost = deliver_surveys(organisation, now=now)
    result.survey_sends += finished
    result.failed += lost


def evaluate_rules(organisation=None, *, today=None, now=None):
    """Every active rule's night, in one workspace or all of them."""
    today = today or timezone.localdate()
    now = now or timezone.now()
    result = RulesResult(expired=expire_reviews(organisation, now=now))
    due = Rule.objects.filter(is_active=True)
    if organisation is not None:
        due = due.filter(organisation=organisation)
    for rule_id in list(due.order_by("pk").values_list("pk", flat=True)):
        try:
            with transaction.atomic():
                outcome = run_rule(rule_id, today=today, now=now)
        except Exception as exc:  # noqa: BLE001 - one rule's failure never stops the rest
            logger.error("Rule %s: nightly run failed: %s", rule_id, type(exc).__name__)
            result.failed += 1
            continue
        result.ran += outcome.ran
        result.fired += outcome.fired
        result.paused += outcome.paused
        result.reviews += outcome.reviews
    _finish_night(organisation, today=today, now=now, result=result)
    return result
