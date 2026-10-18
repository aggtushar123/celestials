"""Bundles (Agent bundles, contract §1): a bundle of one for a lone step,
who it is routed to, its status rules, the read rule and stuck runs. The
status rules are the only place a bundle's status is worked out from its
steps."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from services.customers.scoping import sees_everything, visible_accounts, visible_customers
from services.metrics.models import AgentAction

from .deciding import WAIT
from .models import AgentBundle

B = AgentBundle.Status
S = AgentAction.Status
#: A lone step's status -> its bundle's (contract §1.4).
STEP_TO_BUNDLE = {
    S.PROPOSED: B.WAITING,
    S.APPLIED: B.DONE,
    S.UNDONE: B.DONE,
    S.REJECTED: B.REJECTED,
    S.EXPIRED: B.EXPIRED,
    S.FAILED: B.PARTLY_DONE,
    S.SKIPPED: B.EXPIRED,
}


def routing_for(record):
    """(routed_to, routed_user) for a bundle on `record` (contract §1.1, D6)."""
    if record is None:
        return AgentBundle.RoutedTo.ADMINS, None
    return AgentBundle.RoutedTo.OWNER, record.owner


def bundle_of_one(action):
    """A saved bundle holding only `action`; the action itself is saved by the caller."""
    record = action.record
    routed_to, routed_user = routing_for(record)
    status = STEP_TO_BUNDLE.get(action.status, B.WAITING)
    if status == B.EXPIRED and action.expired_reason == "replaced":
        status = B.SUPERSEDED
    finished = action.decided_at if status in (B.DONE, B.PARTLY_DONE) else None
    return AgentBundle.objects.create(
        organisation_id=action.organisation_id,
        agent=action.agent,
        title=action.title,
        reason=action.rationale,
        customer_id=action.customer_id,
        account_id=action.account_id,
        routed_to=routed_to,
        routed_user=routed_user,
        status=status,
        run_by_id=action.decided_by_id if finished else None,
        run_started_at=finished,
        run_finished_at=finished,
        reject_note=(action.decision_note or "")[:255] if status == B.REJECTED else "",
    )


STUCK = timedelta(minutes=15)
STUCK_ERROR = "This step didn't finish. Retry it."
RAN = (S.APPLIED, S.UNDONE)


def outcome(steps):
    """What a run ends as (contract §1.3), from its steps after the run."""
    # A step skipped at run keeps `selected` (SE4-10): it is no failure, so it
    # counts as done. An unticked step is `selected=False` and not chosen.
    chosen = [step for step in steps if step.selected]
    statuses = {step.status for step in chosen}
    if chosen and statuses <= {*RAN, S.SKIPPED}:
        return B.DONE
    if chosen and statuses == {S.EXPIRED}:
        return B.EXPIRED
    return B.PARTLY_DONE


def settle(bundle):
    """A waiting bundle with no step left proposed: expired, or superseded when
    every step was replaced. Anything else is left as it is. Call with the
    bundle row locked or inside the caller's transaction."""
    if bundle.status != B.WAITING:
        return bundle
    steps = list(bundle.steps.values_list("status", "expired_reason"))
    if any(status == S.PROPOSED for status, _ in steps):
        return bundle
    if any(status in RAN for status, _ in steps):
        bundle.status = B.DONE
    elif steps and all(reason == "replaced" for _, reason in steps):
        bundle.status = B.SUPERSEDED
    elif all(status == S.REJECTED for status, _ in steps):
        bundle.status = B.REJECTED
    else:
        bundle.status = B.EXPIRED
    bundle.save(update_fields=["status", "updated_at"])
    return bundle


def live_waiting(queryset, now=None):
    """`queryset` cut to waiting bundles inside their 14 days (backend #113's rule)."""
    return queryset.filter(status=B.WAITING, created_at__gt=(now or timezone.now()) - WAIT)


def read_expired(bundle, now):
    return bundle.status == B.WAITING and bundle.created_at <= now - WAIT


def expire_bundle(bundle, reason, actor=None):
    """Store `expired`: every proposed step expires with `reason`. Call with the bundle locked."""
    from .deciding import expire

    for step in bundle.steps.select_for_update().filter(status=S.PROPOSED).order_by("position"):
        expire(step, reason, actor)
    bundle.status = B.EXPIRED
    bundle.save(update_fields=["status", "updated_at"])
    return bundle


def settle_stuck(bundle, now=None):
    """A run left `running` for 15 minutes (a crashed worker, D15): its selected
    steps still proposed fail, retryable, and the bundle is partly done. No
    person does this: the audit entries have no actor."""
    from core import audit

    from .deciding import _audit

    now = now or timezone.now()
    if bundle.status != B.RUNNING or bundle.run_started_at is None:
        return bundle
    if bundle.run_started_at > now - STUCK:
        return bundle
    with transaction.atomic():
        # The bundle's row before its steps' (`deciding.locked`).
        fresh = AgentBundle.objects.select_for_update(of=("self",)).get(pk=bundle.pk)
        if fresh.status != B.RUNNING or fresh.run_started_at > now - STUCK:
            return fresh
        failed_ids = []
        stuck = fresh.steps.select_for_update(of=("self",)).filter(status=S.PROPOSED, selected=True)
        for step in stuck.select_related("organisation").order_by("position", "pk"):
            step.status = S.FAILED
            step.error = STUCK_ERROR
            step.save(update_fields=["status", "error"])
            failed_ids.append(step.pk)
            # SOC2:LOG-01 a step the sweep fails is audited like a run's failure
            _audit("agent_action.failed", step, None, bundle=fresh.pk, error="StuckRun")
        fresh.status = B.PARTLY_DONE
        fresh.run_finished_at = now
        fresh.save(update_fields=["status", "run_finished_at", "updated_at"])
        counts = {}
        for status in fresh.steps.values_list("status", flat=True):
            counts[status] = counts.get(status, 0) + 1
        audit.record(  # SOC2:LOG-01 the run's end, settled by the sweep
            "agent_bundle.run_finished",
            actor=None,
            organisation=fresh.organisation,
            target=fresh,
            target_repr=str(fresh),
            metadata={"status": fresh.status, "steps": counts, "stuck": True},
        )
    from .failure_notice import tell

    tell(fresh.pk, fresh.run_by_id, failed_ids)
    return fresh


def settle_stuck_all(organisation, now=None):
    """The nightly sweep: every stuck run in the workspace. Returns how many."""
    now = now or timezone.now()
    stuck = AgentBundle.objects.filter(
        organisation=organisation, status=B.RUNNING, run_started_at__lte=now - STUCK
    )
    count = 0
    for bundle in stuck:
        if settle_stuck(bundle, now).status == B.PARTLY_DONE:
            count += 1
    return count


def unreadable_bundle_ids(reader):
    """Bundles holding a draft reply whose source `reader` may not read, as
    an `id IN` subquery over `bundle_id`."""
    from .source_access import unreadable_draft_ids

    return AgentAction.objects.filter(id__in=unreadable_draft_ids(reader)).values("bundle_id")


def others_personal_bundle_ids(reader):
    """Personal bundles (a Slack message's, a meeting's) that aren't
    `reader`'s, as an `id IN` subquery: their person's alone to know of, so a
    list leaves them out before it counts `hidden`. One with no person (they
    left) is nobody's."""
    from .models import PERSONAL_SOURCES

    # SOC2:AUTH-02 a personal bundle is its person's alone, never counted for anyone else
    return (
        AgentBundle.objects.filter(
            organisation_id=reader.organisation_id, source__in=PERSONAL_SOURCES
        )
        .filter(Q(routed_user__isnull=True) | ~Q(routed_user_id=reader.pk))
        .values("id")
    )


def own_meeting_bundle_ids(reader):
    """The meeting bundles routed to `reader` (sales review report), as an
    `id IN` subquery: workspace-level, yet theirs to read without view-all."""
    return AgentBundle.objects.filter(
        organisation_id=reader.organisation_id,
        source=AgentBundle.Source.MEETING,
        routed_user_id=reader.pk,
    ).values("id")


def unreadable_thread_bundle_ids(reader):
    """Message bundles whose source `reader` may not read (a gone thread
    included), and personal bundles (Slack, meeting) that are someone else's,
    as an `id IN` subquery over bundle ids."""
    from .threads import readable_threads

    # SOC2:AUTH-02 a message bundle is read only by its source's readers (contract §5.1);
    # a Slack message's bundle only by the person who sent the message to Revenact
    return (
        AgentBundle.objects.filter(organisation_id=reader.organisation_id)
        .filter(
            Q(source=AgentBundle.Source.THREAD)
            & ~Q(thread_id__in=readable_threads(reader).values("id"))
            | Q(id__in=others_personal_bundle_ids(reader))
        )
        .values("id")
    )


def fully_readable(reader, queryset):
    """`queryset` cut to the bundles `reader` may read (contract §8): its
    record is one they may open (workspace-level: view-all only), and no step
    quotes a source they may not read."""
    # SOC2:AUTH-02 a bundle is read only by its record's readers and its sources' readers
    queryset = queryset.filter(organisation_id=reader.organisation_id).exclude(
        id__in=unreadable_bundle_ids(reader)
    )
    # SOC2:AUTH-02 a message bundle is read only by its source's readers (contract §5.1)
    queryset = queryset.exclude(id__in=unreadable_thread_bundle_ids(reader))
    if sees_everything(reader):
        return queryset
    # SOC2:AUTH-02 the twice-filter, as id IN subqueries (no join, no DISTINCT);
    # a meeting's bundle (no record) is read by its organiser alone
    return queryset.filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
        | Q(id__in=own_meeting_bundle_ids(reader))
    )


def readable(reader, queryset):
    """`fully_readable`, plus (Slack escalations D4, SE4-25) the bundles made
    from a Slack thread the reader took part in. `bundle_payloads` gives the
    second kind the participant view (SE4-26)."""
    from .models import BundleParticipant

    queryset = queryset.filter(organisation_id=reader.organisation_id)
    # Built from the model, not from `queryset` (which may hold a row lock).
    whole = fully_readable(reader, AgentBundle.objects.all()).values("id")
    # SOC2:AUTH-02 SE4-25: a participant reads the bundle of their own thread, and only it
    joined = BundleParticipant.objects.filter(user=reader).values("bundle_id")
    return queryset.filter(Q(id__in=whole) | Q(id__in=joined))
