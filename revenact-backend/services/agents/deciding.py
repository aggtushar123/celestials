"""Deciding an agent action (spec §1.4, Decisions 4, 7 and 10). Who may:
the record's owner, anyone above them, or view_all_accounts; a
workspace-level action, view_all only. Each decision runs under the action's
row lock and re-reads its status there, so the first decider wins. An
action whose record moved on, that waited 14 days, or whose kind is now
Never expires instead of applying. Every caller runs inside
`transaction.atomic()`; `approve` and `reject` open it themselves."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from core import audit
from services.accounts.hierarchy import subtree_ids
from services.customers.scoping import sees_everything
from services.metrics import feedback as feedback_log
from services.metrics.models import AgentAction

from .kinds import NEVER, Stale
from .policy import level, policy_for
from .registry import REGISTRY
from .source_access import may_read_source

S = AgentAction.Status
OWNER, CHAIN, COMPANY, QUEUE, PARTICIPANT = "owner", "chain", "company", "queue", "participant"
#: Slack bundles (owner, 2026-10-17): the person who sent the Slack message.
SENDER = "sender"
#: Sales review report (2026-10-18): the meeting's organiser.
ORGANISER = "organiser"
WAIT = timedelta(days=14)
NO_SUCH_ACTION = "No such action."


def no_such_action():
    return NotFound({"code": "NO_SUCH_ACTION", "detail": NO_SUCH_ACTION})


#: expired_reason -> the contract's sentence
REASONS = {
    "changed": "the record changed since",
    "not_reproposed": "the agent no longer proposes it",
    "replaced": "the agent no longer proposes it",
    "never": "this action is now set to never",
    "waited": "it waited 14 days",
    "date_passed": "its date has passed",
}


class AlreadyDecided(Exception):
    def __init__(self, action):
        super().__init__(action.status)
        self.action = action


class Expired(Exception):
    def __init__(self, action):
        super().__init__(action.expired_reason)
        self.action = action


class CantDecide(Exception):
    """The reader may not decide this action."""


def _queue_role(reader, action):
    """D2-6: on a record nobody owns, a department bundle's steps are run by
    that department's people and Leadership, an Unassigned bundle's by admins."""
    from services.accounts.capabilities import Capability
    from services.customers.personal import reads_every_ticket_department

    from .models import AgentBundle

    bundle = action.bundle
    if bundle is None or bundle.source != AgentBundle.Source.THREAD:
        return None
    if bundle.routed_to == AgentBundle.RoutedTo.DEPARTMENT and bundle.department:
        if reader.function == bundle.department or reads_every_ticket_department(reader):
            return QUEUE
    elif bundle.routed_to == AgentBundle.RoutedTo.ADMINS:
        if reader.has_capability(Capability.MANAGE_ORG_SETTINGS):
            return QUEUE
    return None


def _by_record(reader, action):
    """`decided_as`'s rights from the record, the source and the queue."""
    # SOC2:AUTH-02 a draft reply is decided only by a reader of its source
    if not may_read_source(reader, action):
        return None
    # SOC2:AUTH-02 an action on a record: its owner, anyone above them, or
    # view_all_accounts; a workspace-level action: view_all_accounts only
    if not REGISTRY[action.kind].workspace_level:
        record = action.record
        owner_id = None if record is None else record.owner_id
        if owner_id is not None:
            if owner_id == reader.pk:
                return OWNER
            if owner_id in subtree_ids(reader):
                return CHAIN
    if sees_everything(reader):
        return COMPANY
    # SOC2:AUTH-02 D2-6: a queue's own people run its steps on a record nobody owns
    if not REGISTRY[action.kind].workspace_level:
        record = action.record
        if record is not None and record.owner_id is None:
            return _queue_role(reader, action)
    return None


def participates(reader, action):
    """SE4-25: `reader` took part in the Slack thread `action`'s bundle was made from."""
    from . import bulk
    from .models import BundleParticipant

    if action.bundle_id is None:
        return False
    page = bulk.active()
    if page is not None and action.bundle_id in page.bundle_ids:
        return action.bundle_id in page.participating(reader)
    return BundleParticipant.objects.filter(bundle_id=action.bundle_id, user=reader).exists()


def _personal_bundle(action):
    """(source, routed user id) of `action`'s bundle when it is a personal
    bundle (a Slack message's, a meeting's), else None: the select_related
    bundle, else one query."""
    from .models import PERSONAL_SOURCES, AgentBundle

    if action.bundle_id is None:
        return None
    cached = action._state.fields_cache.get("bundle")
    if cached is not None:
        row = (cached.source, cached.routed_user_id)
    else:
        row = (
            AgentBundle.objects.filter(pk=action.bundle_id)
            .values_list("source", "routed_user_id")
            .first()
        )
    return row if row and row[0] in PERSONAL_SOURCES else None


def decided_as(reader, action):
    """How `reader` may decide or undo `action`, or None. A Slack bundle's
    step: its sender alone, while they may open its record. A meeting
    bundle's step (no record): its organiser alone."""
    from services.customers.scoping import can_open

    from .models import AgentBundle

    personal = _personal_bundle(action)
    if personal is not None:
        if personal[0] == AgentBundle.Source.MEETING:
            # SOC2:AUTH-02 a meeting's bundle is its organiser's alone (not view-all)
            return ORGANISER if personal[1] == reader.pk else None
        record = action.record
        # SOC2:AUTH-02 a Slack message's bundle is its sender's alone (not the record's
        # owner, their chain or view-all), and only on a record they may still open
        if personal[1] == reader.pk and record is not None and can_open(reader, record):
            return SENDER
        return None
    role = _by_record(reader, action)
    if role is None and participates(reader, action):
        # SOC2:AUTH-02 SE4-25: a member who wrote in the Slack thread decides
        # that thread's bundle, and only it (they read the thread in Slack)
        return PARTICIPANT
    return role


def locked(pk):
    """The action `pk` under its row lock, its bundle's row locked first.

    Lock order rule (Agent bundles): a bundle's row is always locked before
    any of its steps' rows, everywhere: a run's claim locks the bundle then
    its steps, and settling a step's bundle (`settle_bundle_of`) locks the
    bundle after the step. Taking the bundle here first keeps every step
    lock in that one order, so the two can never deadlock; the later
    re-lock of the same bundle in the same transaction is a no-op. Never
    lock an AgentAction row without going through this."""
    from .models import AgentBundle

    bundle_id = AgentAction.objects.filter(pk=pk).values_list("bundle_id", flat=True).first()
    if bundle_id is not None:
        list(
            AgentBundle.objects.select_for_update(of=("self",))
            .filter(pk=bundle_id)
            .values_list("pk", flat=True)
        )
    action = (
        AgentAction.objects.select_for_update(of=("self",))
        .select_related("customer", "account", "organisation")
        .filter(pk=pk)
        .first()
    )
    if action is None:
        raise no_such_action()
    return action


def stale_reason(action, now, prefs=None):
    """Why a proposed action can no longer apply, or None (Decision 4)."""
    if action.created_at <= now - WAIT:
        return "waited"
    prefs = prefs or policy_for(action.organisation)
    if level(prefs, action.agent, action.kind) == NEVER:
        return "never"
    if not REGISTRY[action.kind].workspace_level and action.record is None:
        return "changed"
    if REGISTRY[action.kind].current(action) != action.before:
        return "changed"
    return None


def proposed(queryset, now=None):
    """The proposed actions in `queryset` still inside their wait: one that
    waited `WAIT` expires as soon as it is decided (`stale_reason`), so it is
    never offered, even before a decision or an agent run marks it."""
    return queryset.filter(status=S.PROPOSED, created_at__gt=(now or timezone.now()) - WAIT)


def expire(action, reason, actor=None):
    action.status = S.EXPIRED
    action.expired_reason = reason
    action.save(update_fields=["status", "expired_reason"])
    _audit("agent_action.expired", action, actor, reason=reason)
    settle_bundle_of(action)


def settle_bundle_of(action, actor=None):
    """After a decision outside a bundle run (a legacy path, Auto, a pass's
    expiry): the step's bundle follows (contract §1.3). A lone applied step's
    bundle is run by whoever decided it. Runs inside the caller's transaction."""
    from .bundles import settle
    from .models import AgentBundle

    bundle = AgentBundle.objects.select_for_update(of=("self",)).get(pk=action.bundle_id)
    was = bundle.status
    settle(bundle)
    if was != bundle.status and bundle.status == AgentBundle.Status.DONE:
        bundle.run_by = actor
        bundle.run_started_at = bundle.run_finished_at = action.decided_at
        bundle.save(update_fields=["run_by", "run_started_at", "run_finished_at", "updated_at"])
    return bundle


def _audit(name, action, actor, **extra):
    audit.record(  # SOC2:LOG-01
        name,
        actor=actor,
        organisation=action.organisation,
        target=action,
        target_repr=f"Action {action.pk}",
        metadata={
            "kind": action.kind,
            "agent": action.agent,
            "before": action.before,
            "after": action.after,
            **extra,
        },
    )


def apply_action(action, actor, *, auto=False, note="", **overrides):
    """Apply a proposed action through its kind and record what it set.
    Raises Stale (from the kind) untouched. An Auto apply (no request, no
    person) writes its own audit entry; a person's decision is audited by
    `approve` (or by the legacy route)."""
    spec = REGISTRY[action.kind]
    after, result = spec.apply(action, actor, **overrides)
    now = timezone.now()
    action.after = after
    action.result = result
    action.status = S.APPLIED
    action.auto = auto
    action.applied_at = now
    action.decided_at = now
    action.decided_by = None if auto else actor
    action.decision_note = note
    action.save(
        update_fields=[
            "after",
            "result",
            "status",
            "auto",
            "applied_at",
            "decided_at",
            "decided_by",
            "decision_note",
        ]
    )
    if auto:
        _audit("agent_action.approved", action, None, decided_as="auto", auto=True)
    else:
        feedback_log.record_proposal_decision(action, "approved", note, actor)
    return action


def _decide(reader, pk, run, check=None):
    """Lock, check, and `run(action, role)`; an expiry is kept and raised
    after the lock is released. Anything else `run` raises (an OwnerLimit)
    leaves the whole transaction, so nothing the apply wrote is kept and the
    action stays proposed."""
    with transaction.atomic():
        action = locked(pk)
        if action.organisation_id != reader.organisation_id:
            raise no_such_action()
        role = decided_as(reader, action)
        if role is None:
            raise CantDecide()
        if check is not None:
            check(action)
        if action.status != S.PROPOSED:
            raise AlreadyDecided(action)
        reason = stale_reason(action, timezone.now())
        if reason is None:
            try:
                with transaction.atomic():
                    return run(action, role), role
            except Stale as exc:
                reason = exc.reason
        expire(action, reason, reader)
    raise Expired(action)


def _check_owner_right(reader, action):
    from services.knowledge.ownership import may_change_owner

    # SOC2:AUTH-02 approving an owner change needs the right a person's own
    # PATCH of the owner needs
    record = action.record
    # A record that is gone is left to `stale_reason`, which expires the action.
    if record is None:
        return
    if action.kind == AgentAction.Kind.RECORD_OWNER and not may_change_owner(reader, record):
        raise CantDecide()


def may_decide(reader, action):
    """Whether `reader` may approve or undo `action`: `decided_as`, and for
    an owner change the right a person's own PATCH of the owner needs. What
    the pages offer (Waiting's `can_decide`, undo's `cant_decide`) asks this,
    so they never offer what the routes refuse."""
    role = decided_as(reader, action)
    if role is None:
        return False
    if role in (OWNER, CHAIN, SENDER, ORGANISER):
        # The owner, or someone above them: the owner-change right holds. A
        # Slack or meeting bundle holds no owner change.
        return True
    try:
        _check_owner_right(reader, action)
    except CantDecide:
        return False
    return True


def approve(reader, pk, *, note="", audit_event=True, **overrides):
    """`audit_event=False` is for the legacy route, which writes its own
    `proposal.approved` instead (one event per decision, never two)."""

    def run(action, role):
        apply_action(action, reader, note=note, **overrides)
        settle_bundle_of(action, reader)
        if audit_event:
            _audit("agent_action.approved", action, reader, decided_as=role, auto=False)
        return action

    return _decide(reader, pk, run, lambda action: _check_owner_right(reader, action))


def reject_locked(action, reader, note="", role=None, audit_event=True):
    """Reject a proposed `action` the caller already holds the lock on.
    `role` is how the reader decided, in this module's words (owner, chain,
    company); when not given it is worked out here."""
    action.status = S.REJECTED
    action.decided_by = reader
    action.decided_at = timezone.now()
    action.decision_note = note
    action.save(update_fields=["status", "decided_by", "decided_at", "decision_note"])
    if audit_event:
        _audit(
            "agent_action.rejected", action, reader, decided_as=role or decided_as(reader, action)
        )
    feedback_log.record_proposal_decision(action, "rejected", note, reader)
    settle_bundle_of(action, reader)
    return action


def reject(reader, pk, *, note="", audit_event=True):
    def run(action, role):
        return reject_locked(action, reader, note, role, audit_event)

    # The same owner-change right as approve and undo, so the route matches
    # Work's Dismiss and Waiting's `can_decide`.
    return _decide(reader, pk, run, lambda action: _check_owner_right(reader, action))
