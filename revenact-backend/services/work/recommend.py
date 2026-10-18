"""The recommender's pass over one workspace (Work round §2.2): each enabled
source's signals become open recommendations routed to a person; open ones
whose signal stopped expire; each recipient with something new (made, or
re-routed to them) is told, once a day. Rules only, no model call.

**Upsert.** One open recommendation per kind and record, held by the
partial unique constraints. An open one is
refreshed in place (title, facts, severity) and re-routed; a new one is made
unless an earlier decision on the same record holds it back (`held_back`).

**Safe to re-run.** Running twice changes nothing; a concurrent run's insert
loses to a constraint and is skipped. Each source runs in its own
transaction and fails on its own, logged with the exception's class name
only (its text can quote a row's values)."""

import logging
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import Task
from services.customers.scoping import can_open

from . import proposal_notice
from . import sources as signal_sources
from .clock import start_of_day, today_for
from .models import LIVE_KINDS, Recommendation
from .prefs import effective_sources, settings_for
from .routing import Router
from .standing import working_ids

logger = logging.getLogger(__name__)

K, S = Recommendation.Kind, Recommendation.Status
SUGGESTED_LINK = "/work/mine?kind=suggestion"
WAITING = "recommendations_waiting"  # how a failed notice is listed in `failed`
ONE_OPEN = {"rec_one_open_per_organisation", "rec_one_open_per_account", "rec_one_per_agent_action"}
COUNTERS = ("created", "updated", "expired", "unrouted", "notified")


@dataclass
class RefreshResult:
    created: int = 0
    updated: int = 0
    expired: int = 0
    unrouted: int = 0
    notified: int = 0
    failed: list = field(default_factory=list)

    def as_dict(self):
        return asdict(self)

    def add(self, other):
        for name in COUNTERS:
            setattr(self, name, getattr(self, name) + getattr(other, name))


def worse(kind, now, then, params):
    """Whether a signal at `now` is worse than it was at `then` (a
    decision's): a renewal that has become overdue; a health drop deeper by
    another full `drop`; more tickets or anomalies."""
    if now is None or then is None:
        return False
    if kind == K.RENEWAL_DUE:
        return now < 0 <= then
    if kind == K.HEALTH_DROP:
        return Decimal(str(now)) - Decimal(str(then)) >= Decimal(str(params["drop"]))
    return now > then


def held_back(last, signal, params, cooldown_days, now):
    """An earlier decision on the same record (`last`, its latest assignment
    or dismissal, from `last_decisions`) holds a new recommendation back: an
    assignment while its task is open; then any assignment or dismissal for
    `cooldown_days`, unless the signal has since got worse."""
    if last is None:
        return False
    if (
        last.status == S.ASSIGNED
        and last.task is not None
        and last.task.status != Task.Status.COMPLETED
    ):
        return True
    if last.decided_at is None or last.decided_at < now - timedelta(days=cooldown_days):
        return False
    return not worse(signal.kind, signal.value, last.signal_value, params)


def _key(rec):
    return (rec.customer_id, rec.account_id)


def last_decisions(organisation, kind, signals):
    """The latest assignment or dismissal per record among `signals`, read
    in one query whatever their number."""
    customer_ids = sorted({s.customer.pk for s in signals})
    if not customer_ids:
        return {}
    decisions = (
        Recommendation.objects.filter(
            organisation=organisation,
            kind=kind,
            customer_id__in=customer_ids,
            status__in=[S.ASSIGNED, S.DISMISSED],
        )
        .select_related("task")
        .order_by("-decided_at", "-id")
    )
    latest = {}
    for decision in decisions:
        latest.setdefault(_key(decision), decision)
    return latest


def _lost_the_insert(exc):
    """Whether an insert failed only because a concurrent run made the same
    recommendation first (one of the partial unique constraints)."""
    diag = getattr(exc.__cause__, "diag", None)
    return getattr(diag, "constraint_name", None) in ONE_OPEN


def _apply(organisation, kind, signals, params, prefs, router, now, result):
    """Upsert `kind`'s signals and expire its open ones that stopped.
    Returns what is news to its recipient: the recommendations it made and
    the open ones it re-routed to someone new."""
    open_now = {
        _key(rec): rec
        for rec in Recommendation.objects.filter(
            organisation=organisation, kind=kind, status=S.OPEN
        )
    }
    decisions = last_decisions(organisation, kind, signals)
    seen, news = set(), []
    for signal in signals:
        route = router.route(signal)
        if route is None:
            # Left unseen, so an open one routed to someone who can no
            # longer open its record expires below; the next run makes a
            # fresh one once someone can take it.
            result.unrouted += 1
            continue
        seen.add(signal.key)
        why = {"facts": list(signal.facts), "evidence": list(signal.evidence)}
        current = open_now.get(signal.key)
        if current is not None:
            fresh = {
                "title": signal.title,
                "why": why,
                "signal_value": signal.value,
                "suggested_assignee_id": getattr(route.suggested, "pk", None),
                "recipient_id": route.recipient.pk,
            }
            if any(getattr(current, name) != value for name, value in fresh.items()):
                # Only while still open: a decision made since the read stands.
                changed = Recommendation.objects.filter(pk=current.pk, status=S.OPEN).update(
                    **fresh
                )
                result.updated += changed
                if changed and current.recipient_id != route.recipient.pk:
                    # Re-routed: news to its new recipient, as a new one is.
                    current.title, current.why = signal.title, why
                    current.suggested_assignee = route.suggested
                    current.recipient = route.recipient
                    news.append(current)
            continue
        last = decisions.get(signal.key)
        if held_back(last, signal, params, prefs.dismiss_cooldown_days, now):
            continue
        try:
            with transaction.atomic():
                rec = Recommendation.objects.create(
                    organisation=organisation,
                    customer=signal.customer,
                    account=signal.account,
                    kind=kind,
                    title=signal.title,
                    why=why,
                    suggested_assignee=route.suggested,
                    recipient=route.recipient,
                    signal_value=signal.value,
                )
        except IntegrityError as exc:
            if _lost_the_insert(exc):
                continue  # a concurrent run made it first
            raise
        news.append(rec)
        result.created += 1
    stale = [rec.pk for key, rec in open_now.items() if key not in seen]
    if stale:
        result.expired += Recommendation.objects.filter(pk__in=stale, status=S.OPEN).update(
            status=S.EXPIRED, decided_at=now
        )
    return news


def refresh(organisation, *, today, now=None, actor=None, kinds=None):
    """One pass over `organisation`. See the module. `actor`, the person who
    ran it (Run now), is never told about it."""
    now = now or timezone.now()
    prefs = settings_for(organisation)
    params = effective_sources(prefs)
    book = signal_sources.load_book(organisation, today=today, now=now)
    router = Router.for_book(book, prefs.recommend_to)
    result, news = RefreshResult(), []
    for kind in kinds or LIVE_KINDS:
        part = RefreshResult()
        try:
            with transaction.atomic():
                found = []
                if params[kind]["enabled"]:
                    found = signal_sources.SOURCES[kind](book, params[kind])
                made = _apply(organisation, kind, found, params[kind], prefs, router, now, part)
        except Exception as exc:  # noqa: BLE001 - one source never stops the others
            logger.warning(
                "work recommendations: %s failed for organisation %s: %s",
                kind,
                organisation.pk,
                type(exc).__name__,
            )
            result.failed.append(kind)
            continue
        result.add(part)
        news += made
    try:
        result.notified = notify_waiting(news, today=today, actor=actor)
    except Exception as exc:  # noqa: BLE001 - the recommendations are made either way
        logger.warning(
            "work recommendations: the notice failed for organisation %s: %s",
            organisation.pk,
            type(exc).__name__,
        )
        result.failed.append(WAITING)
    try:
        with transaction.atomic():
            proposal_notice.notify_proposals(organisation, today=today, now=now, actor=actor)
    except Exception as exc:  # noqa: BLE001 - the recommendations are made either way
        logger.warning(
            "work recommendations: the proposal notice failed for organisation %s: %s",
            organisation.pk,
            type(exc).__name__,
        )
    return result


def refresh_all(organisation=None, *, today=None, actor=None):
    """Every workspace with organisations (or just `organisation`), each on
    its own: one failing never stops the next. `today` None is each
    workspace's own date (`clock.today_for`)."""
    from services.accounts.models import Organisation
    from services.customers.models import Customer

    if organisation is not None:
        workspaces = [organisation]
    else:
        workspaces = Organisation.objects.filter(
            id__in=Customer.objects.values("organisation_id")
        ).order_by("id")
    total = RefreshResult()
    for workspace in workspaces:
        try:
            part = refresh(workspace, today=today or today_for(workspace), actor=actor)
        except Exception as exc:  # noqa: BLE001 - reported, never fatal
            logger.warning(
                "work recommendations: organisation %s failed: %s",
                workspace.pk,
                type(exc).__name__,
            )
            total.failed.append(f"organisation {workspace.pk}")
            continue
        total.add(part)
        total.failed.extend(f"{kind} in organisation {workspace.pk}" for kind in part.failed)
    return total


def waiting_message(recipient, recs):
    """The notice's text for `recipient`'s new recommendations: one is
    named, to someone who may open its record (and read its draft reply's
    source); otherwise they are counted."""
    from services.agents.source_access import may_read_source

    # SOC2:AUTH-02 a record is named only to someone who may open it, a
    # draft reply only to a reader of its source
    if (
        len(recs) == 1
        and can_open(recipient, recs[0].record)
        and (recs[0].agent_action_id is None or may_read_source(recipient, recs[0].agent_action))
    ):
        return f"Revenact recommends “{recs[0].title}”."[:500]
    whose = "you" if all(r.suggested_assignee_id == recipient.pk for r in recs) else "your team"
    return f"{signal_sources.plural(len(recs), 'task')} recommended for {whose}."


def notify_waiting(news, *, today, actor=None):
    """One `recommendations_waiting` per recipient of `news` (made, or
    re-routed to them), unless they were told already on `today`'s date,
    are no longer active for work (`standing`), or are `actor` (the person who ran it). Returns
    how many were told."""
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    kind = Notification.Kind.RECOMMENDATIONS_WAITING
    by_recipient = defaultdict(list)
    for rec in news:
        by_recipient[rec.recipient_id].append(rec)
    told = 0
    working = {}
    for recs in by_recipient.values():
        recipient = recs[0].recipient
        organisation_id = recs[0].organisation_id
        if organisation_id not in working:
            working[organisation_id] = working_ids(organisation_id)
        # SOC2:AUTH-02 a suspended or revoked member is not told of work
        if recipient.pk not in working[organisation_id] or (
            actor is not None and recipient.pk == actor.pk
        ):
            continue
        # "Today" is the workspace's own date (clock): from its local midnight.
        if Notification.objects.filter(
            recipient=recipient,
            kind=kind,
            created_at__gte=start_of_day(recipient.organisation, today),
        ).exists():
            continue
        notify(
            recipient=recipient,
            actor=None,
            kind=kind,
            message=waiting_message(recipient, recs),
            link=SUGGESTED_LINK,
            push_on_commit=True,
        )
        told += 1
    return told
