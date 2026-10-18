"""The guided agent (2026-10-18, docs/superpowers/specs/2026-10-18-guided-agent-design.md):
a message bundle holding `record.diagnose -> mail.compose -> mail.send_draft`
is run one question at a time. This module holds what is shared by the
three kinds, the proposers, the bundle payload and the step-at-a-time run:
the trio rule, the record's main contact, its health change, the bundle's
priority and its notice, and the server-written questions (names from the
record, never model text)."""

import logging
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from services.customers.models import Contact, Customer, HealthSnapshot
from services.metrics.models import AgentAction

logger = logging.getLogger(__name__)
K = AgentAction.Kind
S = AgentAction.Status
TRIO = (K.RECORD_DIAGNOSE, K.MAIL_COMPOSE, K.MAIL_SEND_DRAFT)
#: A fall of at least this much over WINDOW reads as poor health (with the
#: `poor` category itself): the demo's 7.8 -> 6.1 is still "average".
DROP = Decimal("1.0")
WINDOW = timedelta(days=30)
#: Earlier steps that let a later one run in a guided bundle.
CLEARED = (S.APPLIED, S.SKIPPED)
#: The main contact, in this order of roles; then the most recently contacted.
ROLES = (
    Contact.Role.CHAMPION,
    Contact.Role.EXECUTIVE_SPONSOR,
    Contact.Role.DECISION_MAKER,
    Contact.Role.ECONOMIC_BUYER,
    Contact.Role.TECHNICAL_LEAD,
)


#: The steps that make a bundle guided: a diagnosis, or a sales review's
#: report (2026-10-18, docs/superpowers/specs/2026-10-18-sales-review-report-design.md).
LEADS = (K.RECORD_DIAGNOSE, K.REPORT_SALES)


def is_guided(steps):
    """Whether these steps (a bundle's) make a guided bundle."""
    return any(step.kind in LEADS for step in steps)


def guided(bundle):
    return bundle.steps.filter(kind__in=LEADS).exists()


def whole_trio(items, ref):
    """A proposer's items with the trio kept only when it is whole and in
    order: exactly one of each, all on `ref`, diagnose before compose before
    send. Otherwise all three are dropped (the other items stand). A compose
    or send with no evidence of its own cites the diagnosis's."""
    trio = [item for item in items if str(item.get("kind") or "") in TRIO]
    if not trio:
        return list(items)
    kinds = [str(item.get("kind")) for item in trio]
    if kinds != list(TRIO) or any(item.get("record") != ref for item in trio):
        return [item for item in items if str(item.get("kind") or "") not in TRIO]
    evidence = trio[0].get("evidence")
    out = []
    for item in items:
        if str(item.get("kind") or "") in TRIO[1:] and not item.get("evidence") and evidence:
            item = {**item, "evidence": evidence}
        out.append(item)
    return out


def drop_partial(bundle_id, created_ids):
    """After a pass placed its items: the trio steps it made in `bundle_id`
    stand only when all three landed, in order; otherwise they are deleted
    (they were never decided). Returns how many were removed."""
    rows = list(
        AgentAction.objects.filter(pk__in=list(created_ids), bundle_id=bundle_id, kind__in=TRIO)
        .order_by("position")
        .values_list("pk", "kind")
    )
    if not rows or [kind for _, kind in rows] == list(TRIO):
        return 0
    AgentAction.objects.filter(pk__in=[pk for pk, _ in rows]).delete()
    return len(rows)


def _field(record):
    return "customer" if isinstance(record, Customer) else "account"


def record_path(record):
    if record is None:
        return None
    return f"/{'organizations' if isinstance(record, Customer) else 'accounts'}/{record.pk}"


def health_change(record, today=None):
    """(from, to) when `record`'s health fell by DROP or more over the last
    30 days (its oldest snapshot in that window against today's score), else None."""
    if record is None or record.health_score is None:
        return None
    today = today or timezone.localdate()
    first = (
        HealthSnapshot.objects.filter(
            **{_field(record): record}, captured_on__gte=today - WINDOW, captured_on__lt=today
        )
        .order_by("captured_on", "id")
        .values_list("health_score", flat=True)
        .first()
    )
    if first is None:
        return None
    now = Decimal(record.health_score)
    return (Decimal(first), now) if Decimal(first) - now >= DROP else None


def poor_health(record):
    if record is None:
        return False
    return record.health_category == Customer.HealthCategory.POOR or (
        health_change(record) is not None
    )


def priority_for(record, *, urgent, guided):
    """`high` when the message asked urgently (any message bundle), or a
    guided bundle's record is in poor health; else `normal`."""
    from .models import AgentBundle

    if urgent or (guided and poor_health(record)):
        return AgentBundle.Priority.HIGH
    return AgentBundle.Priority.NORMAL


def contacts_of(record, reader):
    """`record`'s active contacts with an address, as `reader` may see them."""
    from services.customers.scoping import visible_children_q

    # SOC2:AUTH-02 only contacts on a record the reader may open
    return (
        Contact.objects.filter(visible_children_q(reader))
        .filter(**{_field(record): record}, status=Contact.Status.ACTIVE)
        .exclude(email="")
    )


def main_contact(record, reader):
    """The contact an email to save `record` goes to: its champion first,
    then the sponsor and the other buying roles, then whoever was contacted
    last. None when `reader` sees none. Never the model's choice."""
    if record is None:
        return None
    rows = list(contacts_of(record, reader))
    if not rows:
        return None
    rank = {role: n for n, role in enumerate(ROLES)}
    return min(
        rows,
        key=lambda c: (
            rank.get(c.role, len(ROLES)),
            -(c.last_contacted_at.timestamp() if c.last_contacted_at else 0),
            c.pk,
        ),
    )


def _score(value):
    return f"{Decimal(value):.1f}"


def question(step, record, reader):
    """The question a guided bundle asks before `step` (spec §3)."""
    name = record.name if record is not None else "this customer"
    if step.kind == K.RECORD_DIAGNOSE:
        change = health_change(record)
        if change is not None:
            return (
                f"{name}'s health dropped from {_score(change[0])} to {_score(change[1])}. "
                "Should I diagnose?"
            )
        if record is not None and record.health_category == Customer.HealthCategory.POOR:
            score = _score(record.health_score)
            return f"{name}'s health is {score}, which is poor. Should I diagnose?"
        return f"Should I diagnose what is going on with {name}?"
    if step.kind == K.REPORT_SALES:
        from .sales_review import question as report_question

        return report_question(step)
    if step.kind == K.MAIL_COMPOSE:
        return f"Should I write an email to save {name}?"
    if step.kind == K.MAIL_SEND_DRAFT:
        payload = step.payload if isinstance(step.payload, dict) else {}
        to = payload.get("to_name")
        if not to and record is not None:
            found = main_contact(record, reader)
            to = found.name if found is not None else ""
        return f"Should I send it to {to}?" if to else "Should I send it?"
    return f"Next: {step.title}. Should I go ahead?"


def blocker(step, steps):
    """The first earlier step (by position) that is neither applied nor
    skipped, or None: a guided step runs only once every earlier one is."""
    for other in sorted(steps, key=lambda s: s.position):
        if other.position >= step.position:
            return None
        if other.status not in CLEARED:
            return other
    return None


def next_step(steps):
    """The id of the step a guided bundle asks about now, or None."""
    for step in sorted(steps, key=lambda s: s.position):
        if step.status == S.PROPOSED:
            return step.pk if blocker(step, steps) is None else None
    return None


PRIORITY_MESSAGE = "Priority: {title}"


def _recipients(bundle):
    from services.work.proposal_notice import queue_candidates
    from services.work.queue_bundles import queue_key

    from .models import AgentBundle

    R = AgentBundle.RoutedTo
    if bundle.routed_to in (R.DEPARTMENT, R.ADMINS):
        key = queue_key(bundle)
        return queue_candidates(bundle.organisation, [key]), key
    return ({bundle.routed_user_id} if bundle.routed_user_id else set()), None


def notify_priority(bundle):
    """Tell the people who may read and run a new high-priority bundle at
    once (not in the daily notice). Returns how many were told."""
    from services.accounts.models import User
    from services.notifications.models import Notification
    from services.notifications.realtime import notify
    from services.work.standing import working_ids

    from .bundles import readable
    from .deciding import may_decide
    from .models import AgentBundle

    if bundle.priority != AgentBundle.Priority.HIGH or bundle.status != AgentBundle.Status.WAITING:
        return 0
    people, key = _recipients(bundle)
    # SOC2:AUTH-02 a suspended or revoked member is not told of work
    people = set(people) & working_ids(bundle.organisation)
    link = (
        f"/work?queue={key}&kind=bundle&bundle={bundle.pk}"
        if key
        else f"/work?queue=mine&kind=bundle&bundle={bundle.pk}"
    )
    steps = list(
        bundle.steps.filter(status=S.PROPOSED).select_related(
            "customer__owner", "account__owner", "organisation", "bundle"
        )
    )
    told = 0
    for user in User.objects.filter(pk__in=sorted(people)).order_by("pk"):
        # SOC2:AUTH-02 only someone who may read the bundle and run one of its steps
        if not readable(user, AgentBundle.objects.filter(pk=bundle.pk)).exists():
            continue
        if not any(may_decide(user, step) for step in steps):
            continue
        notify(
            recipient=user,
            actor=None,
            kind=Notification.Kind.AGENT_BUNDLE_PRIORITY,
            message=PRIORITY_MESSAGE.format(title=bundle.title)[:500],
            link=link,
            push_on_commit=True,
        )
        told += 1
    return told


def tell_priority(bundle_ids):
    """`notify_priority` for each bundle, each on its own: a failure is
    logged and never undoes the run that made them."""
    from django.db import transaction

    from .models import AgentBundle

    for bundle in AgentBundle.objects.filter(pk__in=sorted(bundle_ids)).select_related(
        "organisation"
    ):
        try:
            with transaction.atomic():
                notify_priority(bundle)
        except Exception as exc:  # noqa: BLE001 - the bundle stands either way
            logger.warning("guided: the priority notice failed: %s", type(exc).__name__)
