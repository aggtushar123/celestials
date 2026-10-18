"""Placing a thread's answer (agent bundles D2, contract §2.3, D2-14 to
D2-17, D2-19): a new message bundle; the thread's waiting bundle's steps
replaced (the run) or refreshed (a person); superseded when nothing is left
to propose; flagged when a person edited it. Each answer item is checked by
the nightly pass's own `run._consider` in its thread mode, so every
twice-filter check carries over (§5.3). Steps that are replaced were never
decided: they are deleted, and the audit entry counts them."""

import logging
import uuid
from dataclasses import dataclass, field

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from core import audit
from services.metrics.models import AgentAction

from . import decision, escalation, guided, placeholders, prompt
from . import evidence as evidence_
from .bundles import live_waiting
from .deciding import expire, locked
from .kinds import Invalid
from .models import AgentBundle, BundleParticipant
from .registry import REGISTRY
from .run import RunResult, _consider, bundle_title

logger = logging.getLogger(__name__)
S = AgentAction.Status
B = AgentBundle.Status
TITLE_LIMIT = 120
REASON_LIMIT = 1000
#: Positions are unique per bundle: kept steps move out of the way first.
SHIFT = 1000


class Changed(Exception):
    """The bundle changed (run, edited, rejected) while its answer was made."""


class _Nothing(Exception):
    """Nothing left in the bundle: roll the replacement back and supersede it."""


@dataclass
class Placed:
    bundle: object = None
    made: bool = False
    refreshed: bool = False
    superseded: bool = False
    removed: int = 0
    kept: int = 0
    added: int = 0
    result: RunResult = field(default_factory=RunResult)


def waiting_bundle(thread, now=None):
    """The thread's waiting bundle inside its 14 days (newest), or None."""
    rows = live_waiting(AgentBundle.objects.filter(thread=thread), now)
    return rows.order_by("-created_at", "-id").first()


def keep_set(steps):
    """D2-19: every edited waiting step and every step it names with
    `{{step N}}`, transitively, in position order."""
    by_position = {step.position: step for step in steps}
    keep = {
        step.position for step in steps if step.status == S.PROPOSED and step.edited_at is not None
    }
    todo = list(keep)
    while todo:
        for _field, n, _key in placeholders.find(by_position[todo.pop()].payload):
            if n in by_position and n not in keep:
                keep.add(n)
                todo.append(n)
    return [by_position[n] for n in sorted(keep)]


def held(bundle):
    """A guided bundle a person has started answering (a step ran): a newer
    message flags it, as an edit does, and never replaces its steps."""
    return bundle.run_started_at is not None


def flag_newer(bundle):
    """D2-17: an edited bundle keeps its steps; its panel says a newer message came."""
    AgentBundle.objects.filter(pk=bundle.pk, status=B.WAITING).update(
        has_newer_message=True, updated_at=timezone.now()
    )


def _renumber(bundle, keep):
    """Delete the bundle's other waiting steps and number `keep` 1..k, their
    placeholders following (D2-19). A step that was ever decided (the Never
    sweep expires one and leaves the bundle waiting) is never deleted: it
    moves after the kept steps, in its old order. Returns (how many were
    removed, the highest position now in use): new steps start after it."""
    kept_ids = [step.pk for step in keep]
    gone = bundle.steps.filter(status=S.PROPOSED).exclude(pk__in=kept_ids)
    decided = list(
        bundle.steps.exclude(status=S.PROPOSED)
        .exclude(pk__in=kept_ids)
        .order_by("position", "id")
        .values_list("pk", flat=True)
    )
    mapping = {step.position: n for n, step in enumerate(keep, start=1)}
    removed = gone.count()
    gone.delete()
    moving = [*kept_ids, *decided]
    for pk in moving:
        # Past the unique index first, then into place.
        AgentAction.objects.filter(pk=pk).update(position=F("position") + SHIFT)
    for step in keep:
        AgentAction.objects.filter(pk=step.pk).update(
            position=mapping[step.position],
            payload=placeholders.renumber(step.payload, mapping),
        )
    for n, pk in enumerate(decided, start=len(keep) + 1):
        AgentAction.objects.filter(pk=pk).update(position=n)
    return removed, len(keep) + len(decided)


def _heading(bundle, ctx, answer, now, *, redate):
    """The answer's title and reason when they pass the twice-filter checks
    (contract §5.3), else the first step's (D2-14)."""
    steps = list(bundle.steps.order_by("position"))
    title, reason = answer.title[:TITLE_LIMIT], answer.reason[:REASON_LIMIT]
    texts = [title, reason]
    # SOC2:AUTH-02 the bundle's own words pass the same checks as its steps'
    if (
        not title
        or evidence_.foreign_mentions(ctx, ctx.thread_ref, texts)
        or evidence_.withheld_mentions(ctx, ctx.thread_ref, texts)
    ):
        first = steps[0] if steps else None
        title = bundle_title(first.title, len(steps)) if first else bundle.title
        reason = first.rationale if first else bundle.reason
    fields = {"title": title, "reason": reason, "updated_at": now}
    if redate:
        # D2-17: the run's replacement starts the 14 days again.
        fields["created_at"] = now
    AgentBundle.objects.filter(pk=bundle.pk).update(**fields)


def place(
    organisation,
    thread,
    route,
    agent,
    answer,
    ctx,
    prefs,
    now,
    *,
    into=None,
    keep=(),
    expect=None,
    by=None,
):
    """Store `answer` for `thread` (contract §2.3). `into`: the thread's
    waiting bundle, whose steps other than `keep` are replaced (D2-17,
    D2-19). `expect`: the `updated_at` `into` must still have (a person's
    Refresh); without it the run requires `into` unedited. `by`: who
    refreshes (None for the run). Raises Changed."""
    placed = Placed()
    ref = ctx.thread_ref
    record = thread.record
    on = {"account": record} if thread.account_id else {"customer": record}

    def make_bundle(title, rationale):
        bundle = AgentBundle.objects.create(
            organisation=organisation,
            agent=agent,
            title=title,
            reason=rationale,
            source=AgentBundle.Source.THREAD,
            thread=thread,
            routed_to=route.routed_to,
            routed_user=route.user,
            department=route.department,
            **on,
        )
        placed.bundle, placed.made = bundle, True
        return bundle

    kept = {
        "keys": set(),
        "ids": set(),
        "builder": False,
        "bundles": {},
        "kinds": {},
        "seen": {},
        "placed": {},
        "make_bundle": make_bundle,
    }
    with transaction.atomic():
        if into is not None:
            into = AgentBundle.objects.select_for_update(of=("self",)).get(pk=into.pk)
            stale = into.updated_at != expect if expect is not None else into.edited_at is not None
            # Guided agent: a bundle a person has started answering keeps its steps.
            if into.status != B.WAITING or stale or held(into):
                raise Changed()
        try:
            with transaction.atomic():
                if into is not None:
                    placed.removed, last = _renumber(into, list(keep))
                    kept["bundles"][ref] = into
                    kept["kinds"][ref] = {n: step.kind for n, step in enumerate(keep, start=1)}
                    # A decided step sits after the kept ones: new steps follow it.
                    kept["last"] = {ref: last}
                    kept["keys"] |= {(ref, step.target) for step in keep}
                    kept["ids"] |= {step.pk for step in keep}
                batch = uuid.uuid4().hex
                esc = escalation.read(answer, ctx, record)
                if into is not None:
                    # Fix round 1: a person's Change (via "chosen") stands on a refresh
                    escalation.chosen(esc, into.escalation, ctx)
                # Slack escalations D4: the kinds read it to shape the escalation's steps.
                ctx.escalation = esc

                def consider(item):
                    """One answer item through `_consider`; its index when it
                    landed in this pass's bundle, else None."""
                    if len(kept["keys"]) >= prompt.MAX_ACTIONS:
                        placed.result.dropped += 1
                        return None
                    # SOC2:AUTH-02 the thread's bundle is read only by its source's
                    # readers: only items on the thread's own record land in it, never
                    # a workspace-level kind or another record's.
                    spec = REGISTRY.get(str(item.get("kind") or ""))
                    if spec is None or spec.workspace_level or item.get("record") != ref:
                        placed.result.dropped += 1
                        return None
                    index = kept["seen"].get(ref, 0) + 1
                    try:
                        _consider(
                            organisation,
                            agent,
                            item,
                            ctx,
                            prefs,
                            batch,
                            now,
                            by,
                            kept,
                            placed.result,
                        )
                    except (Invalid, IntegrityError, KeyError, TypeError, AttributeError) as exc:
                        logger.info("intake: dropped an item: %s", type(exc).__name__)
                        placed.result.dropped += 1
                        return None
                    home = kept["placed"].get(ref, {}).get(index)
                    mine = kept["bundles"].get(ref)
                    # A twin waiting in another bundle is not this bundle's step.
                    return index if home and mine and home[0] == mine.pk else None

                def kept_issue():
                    """A waiting jira.create a person kept (refresh), registered
                    as this pass's next item: (its index, its payload), else None."""
                    for position, step in enumerate(keep, start=1):
                        if step.kind == AgentAction.Kind.JIRA_CREATE and step.status == S.PROPOSED:
                            index = kept["seen"].get(ref, 0) + 1
                            kept["seen"][ref] = index
                            kept["placed"].setdefault(ref, {})[index] = (into.pk, position)
                            return index, step.payload
                    return None

                # Guided agent: the trio stands whole and in order, or not at all.
                answer.items = guided.whole_trio(answer.items, ref)
                issue_at, wrote = None, False
                if esc is None:
                    for item in answer.items:
                        consider(item)
                else:
                    dropped, issue, wrote = escalation.place(
                        esc,
                        answer,
                        ctx,
                        record,
                        consider,
                        kept_issue=kept_issue if into is not None else None,
                        taken=len(kept["keys"]),
                    )
                    placed.result.dropped += dropped
                    if issue is not None:
                        issue_at = kept["placed"][ref][issue]
                home = kept["bundles"].get(ref)
                trio = any(str(item.get("kind") or "") in guided.TRIO for item in answer.items)
                if home is not None and trio:
                    gone = guided.drop_partial(home.pk, placed.result.created)
                    if gone:
                        placed.result.created = [
                            pk
                            for pk in placed.result.created
                            if AgentAction.objects.filter(pk=pk).exists()
                        ]
                        placed.result.proposed -= gone
                        placed.result.dropped += gone
                placed.added, placed.kept = len(placed.result.created), len(keep)
                if into is not None and not placed.added and not keep:
                    raise _Nothing()
                if into is None and placed.bundle is not None and not placed.added:
                    # Only a broken trio was made: no bundle at all.
                    placed.bundle.delete()
                    placed.bundle, placed.made = None, False
        except _Nothing:
            # D2-16: the agent re-read the thread and proposes nothing new.
            # The renumbering and the items were rolled back: the audit counts
            # nothing removed, and only the items dropped stand.
            placed.removed, placed.kept, placed.added = 0, 0, 0
            placed.result = RunResult(dropped=placed.result.dropped)
            for pk in (
                into.steps.filter(status=S.PROPOSED)
                .order_by("position")
                .values_list("pk", flat=True)
            ):
                expire(locked(pk), "replaced", by)
            placed.bundle, placed.superseded = AgentBundle.objects.get(pk=into.pk), True
            _audit(placed, by)
            return placed
        bundle = into or placed.bundle
        if bundle is None:
            return placed
        _heading(bundle, ctx, answer, now, redate=into is not None and by is None)
        # Guided agent: urgent when the message asks for it (the model's word or
        # a fast-lane rule), or when a guided bundle's record is in poor health.
        priority = guided.priority_for(
            record,
            urgent=answer.priority == AgentBundle.Priority.HIGH or bool(thread.urgent_rule),
            guided=trio and guided.guided(bundle),
        )
        if priority != bundle.priority:
            AgentBundle.objects.filter(pk=bundle.pk).update(priority=priority)
        # A refreshed bundle that was an escalation (only those have participants, CC-1).
        was = into is not None and bool(into.escalation)
        if esc is not None or was:
            # Contract §1.2: what the panel's handler line and Change read.
            # The issue's position only when it is a step of this bundle.
            home, position = issue_at or (None, None)
            AgentBundle.objects.filter(pk=bundle.pk).update(
                escalation=escalation.stored(
                    esc, bundle, position if home == bundle.pk else None, wrote
                )
                if esc
                else {}
            )
        if was:
            # CC-2: a refresh replaces the participants with the thread's as it is now
            BundleParticipant.objects.filter(bundle=bundle).delete()
        if esc is not None:
            # SOC2:AUTH-02 SE4-25, CC-1: the thread's own members may decide this
            # escalation bundle, and only it
            BundleParticipant.objects.bulk_create(
                [BundleParticipant(bundle=bundle, user_id=pk) for pk in decision.participants(ctx)],
                ignore_conflicts=True,
            )
        if into is not None:
            AgentBundle.objects.filter(pk=bundle.pk).update(
                refreshed_at=now, has_newer_message=False
            )
        placed.bundle = AgentBundle.objects.get(pk=bundle.pk)
        placed.refreshed = into is not None
        _audit(placed, by)
    return placed


def _audit(placed, by):
    bundle = placed.bundle
    audit.record(  # SOC2:LOG-01 never message text: counts only
        "agent_bundle.made" if placed.made else "agent_bundle.refreshed",
        actor=by,
        organisation=bundle.organisation,
        target=bundle,
        target_repr=str(bundle),
        metadata={
            "by_run": by is None,
            "removed": placed.removed,
            "kept": placed.kept,
            "added": placed.added,
            "superseded": placed.superseded,
        },
    )
