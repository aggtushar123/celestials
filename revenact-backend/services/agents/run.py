"""One agent's pass over its book (spec §1.2). Skip, build the evidence,
make one model call, keep what survives the drop rules (Decision 6), apply
Auto at once and leave Ask proposed, expire what a successful pass no longer
proposes (Decision 4). Each agent and each workspace fails on its own."""

import logging
import uuid
from dataclasses import dataclass, field

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from services.accounts.models import Organisation
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
    get_completion,
)
from services.metrics.models import AgentAction

from . import evidence as evidence_
from . import placeholders, prompt
from .bundles import routing_for, settle_stuck_all
from .deciding import WAIT, apply_action, expire, locked, settle_bundle_of, stale_reason
from .kinds import AUTO, NEVER, Invalid, Stale
from .models import MESSAGE_SOURCES, AgentBundle
from .outside.offered import offered
from .policy import AGENTS, level, policy_for, profiles_for, spent_this_month
from .registry import REGISTRY, kinds_for

logger = logging.getLogger(__name__)
S = AgentAction.Status
OUTPUT_TOKENS = 3000
#: The bundle key of a pass's workspace-level steps (contract D1).
WORKSPACE = "workspace"


def bundle_title(first_title, count):
    """Contract D1: the first step's title, plus how many more."""
    if count <= 1:
        return first_title
    return f"{first_title}, and {count - 1} more"[:255]


@dataclass
class RunResult:
    proposed: int = 0
    applied: int = 0
    dropped: int = 0
    skipped_reason: str | None = None
    failed: list = field(default_factory=list)
    #: nothing to act on (no records, no figures): the model was not called
    empty: bool = False
    #: ids of the actions this pass created (not re-proposed twins)
    created: list = field(default_factory=list)

    def as_dict(self):
        return {
            "proposed": self.proposed,
            "applied": self.applied,
            "dropped": self.dropped,
            "skipped_reason": self.skipped_reason,
        }

    def add(self, other):
        self.proposed += other.proposed
        self.applied += other.applied
        self.dropped += other.dropped


def skip_reason(organisation, profile, prefs, today):
    if not organisation.ai_agent_enabled:
        return "ai_off"
    if not profile.enabled:
        return "disabled"
    inside = [
        kind
        for kind in kinds_for(profile.kind)
        if not REGISTRY[kind].outside and not REGISTRY[kind].message_only
    ]
    if all(level(prefs, profile.kind, kind) == NEVER for kind in inside):
        return "no_actions"
    if spent_this_month(organisation, profile.kind, today=today) >= profile.monthly_credits:
        return "budget"
    return None


def _finish(profile, result, now):
    profile.last_run_at = now
    profile.last_run = result.as_dict()
    profile.save(update_fields=["last_run_at", "last_run", "updated_at"])
    return result


def _record_fields(ctx, item, spec):
    """{customer|account: instance} for the item's ref, or {} for a
    workspace-level kind; raises Invalid when they don't agree."""
    ref = item.get("record")
    if spec.workspace_level:
        if ref not in (None, "", "null"):
            raise Invalid("a workspace-level kind takes no record")
        return None, {}
    row = ctx.records.get(ref)
    if row is None:
        raise Invalid("record not in the evidence")
    instance = ctx.instance(ref)
    if instance is None:
        raise Invalid("record gone")
    return row, {row["kind"]: instance}


def _open_twin(organisation, fields, target):
    """The open action on the same record and target, of any kind: a redate
    and a snooze both move `task:<id>:due`, so one replaces the other."""
    pk = (
        AgentAction.objects.filter(
            organisation=organisation,
            status=S.PROPOSED,
            customer=fields.get("customer"),
            account=fields.get("account"),
            target=target,
        )
        .values_list("pk", flat=True)
        .first()
    )
    if pk is None:
        return None
    # The bundle before the step (`deciding.locked`); decided meanwhile: none open.
    twin = locked(pk)
    return twin if twin.status == S.PROPOSED else None


def _recently_refused(organisation, kind, fields, target, now):
    """Rejected or undone within the last 14 days (counted from the decision,
    not from when it was proposed). Matches kind, record and target only: the
    target already carries a created thing's title."""
    since = now - WAIT
    return AgentAction.objects.filter(
        Q(status=S.REJECTED, decided_at__gte=since) | Q(status=S.UNDONE, undone_at__gte=since),
        organisation=organisation,
        kind=kind,
        customer=fields.get("customer"),
        account=fields.get("account"),
        target=target,
    ).exists()


def _consider(organisation, agent, item, ctx, prefs, batch, now, actor, kept, result):
    """One item of the answer: dropped, kept as an existing twin, proposed,
    or applied."""
    kind = str(item.get("kind") or "")
    spec = REGISTRY.get(kind)
    if spec is None or level(prefs, agent, kind) == NEVER:
        raise Invalid("kind not allowed")
    # A message-only kind never lands on the nightly pass; the guided agent's
    # (on_threads) may on a thread's read.
    if spec.message_only and not (spec.on_threads and ctx.thread_ref is not None):
        raise Invalid("kind not allowed")
    row, fields = _record_fields(ctx, item, spec)
    ref = None if spec.workspace_level else row["ref"]
    # Delivery 2: an item on the thread's own record is a message bundle's step.
    threaded = ctx.thread_ref is not None and ref == ctx.thread_ref
    # Contract D1: one bundle per record (or the workspace) per pass; `index`
    # is this item's place among the model's items for it.
    key_of_bundle = ref or WORKSPACE
    kept["seen"][key_of_bundle] = kept["seen"].get(key_of_bundle, 0) + 1
    index = kept["seen"][key_of_bundle]
    auto = (
        level(prefs, agent, kind) == AUTO and not threaded
    )  # D2-11: a message never applies on its own
    quoted = [e.strip() for e in (item.get("evidence") or []) if isinstance(e, str)]
    quoted = [e for e in quoted if e][:4]
    if not quoted:
        raise Invalid("no evidence")
    # Each quote must cite one of this action's own record's lines (or, for a
    # workspace-level kind, the workspace figures'): a line quoted from
    # another record never lands on this one. The matched line is kept.
    evidence = []
    for quote in quoted:
        line = evidence_.match_line(ctx, ref, quote)
        if line is None:
            raise Invalid("evidence is not this record's own")
        if line not in evidence:
            evidence.append(line)
    draft = kind == AgentAction.Kind.DRAFT_REPLY
    # SOC2:AUTH-02 an email or ticket line is cited only by a draft reply,
    # which only that source's readers may read (owner decision 2); a message
    # bundle's steps may cite their thread: the bundle is read only by its
    # source's readers (contract §5.1, D2-12)
    if not draft and not threaded and set(evidence) & evidence_.source_lines(ctx, ref):
        raise Invalid("only a draft reply cites mail or tickets")
    payload = spec.validate(
        item.get("payload") if isinstance(item.get("payload"), dict) else {},
        row,
        ctx,
        evidence,
    )
    # Placeholders name the model's earlier steps for this record. Each named
    # step was placed in one bundle: this pass's new one, or an earlier one
    # that holds it as a re-proposed twin (D4). They must all be in the same
    # bundle, and are renumbered to its positions. An Auto step runs alone
    # (D2): it may name none.
    placed = {} if auto else kept["placed"].get(key_of_bundle, {})
    named = {n for _field, n, _key in placeholders.find(payload)}
    homes = {placed[n][0] for n in named if n in placed}
    if len(homes) > 1:
        raise Invalid("a placeholder names steps of two bundles")
    home = next(iter(homes), None)
    payload = placeholders.renumber(
        payload, {n: pos for n, (bundle_id, pos) in placed.items() if bundle_id == home}
    )
    this_pass = kept["bundles"].get(key_of_bundle)
    # Named steps all in an earlier bundle: this step can only be its twin there.
    earlier = home is not None and (this_pass is None or home != this_pass.pk)
    kinds = {} if auto else kept["kinds"].get(key_of_bundle, {})
    # After every position in use: this pass's steps, and on a thread's
    # refresh the decided steps kept after them (intake_bundles._renumber).
    last = 0 if auto else kept.get("last", {}).get(key_of_bundle, 0)
    position = max([last, *kinds]) + 1
    if not earlier:
        opened = spec.open_keys(payload) if spec.open_keys else ()
        placeholders.check(payload, position, kinds, spec.customer_facing, open_keys=opened)
    title = str(item.get("title") or spec.label).strip()[:255]
    rationale = str(item.get("rationale") or "").strip()
    extra = (
        spec.texts(payload)
        if spec.texts is not None
        else [payload.get(k) for k in ("title", "body", "reason")]
    )
    texts = [title, rationale, *extra]
    # SOC2:AUTH-02 an action never names another record, or a task or note
    # from outside its own record's block: readers of this record may not
    # open those
    if evidence_.foreign_mentions(ctx, ref, texts):
        raise Invalid("names something outside its own record")
    # SOC2:AUTH-02 nor a task or note of its own record that some of the
    # record's readers may not read (owner decision 2026-10-08)
    if evidence_.withheld_mentions(ctx, ref, texts):
        raise Invalid("names a task or note some of its readers may not read")
    if draft or spec.outside:
        if draft:
            channel = "email" if "email_id" in payload else "ticket"
        else:
            # A message bundle's step may name its own source (D2-12); nothing else.
            channel = ctx.thread_channel if threaded else None
        # SOC2:AUTH-02 text that leaves Revenact (a draft reply, a sent reply, a Slack
        # message, a Jira issue) names no task, note, plan or other source (D3-19)
        if evidence_.internal_mentions(ctx, ref, texts, channel):
            raise Invalid("text that leaves Revenact names something internal")
    # SOC2:AUTH-02 and no other action names its record's mail or tickets
    # (a message bundle's steps may: D2-12)
    elif not threaded and evidence_.source_mentions(ctx, ref, texts):
        raise Invalid("names an email or ticket on its record")
    # SOC2:AUTH-02 an object a workspace builder makes is read by people who
    # may not open a record it would name: its own text names none. The
    # title and rationale never reach the object, and the action itself is
    # read by view-all only, so they may quote the figures' accounts.
    if spec.builder and spec.workspace_level and evidence_.record_mentions(ctx, extra):
        raise Invalid("a built object names a record")
    target = spec.target(payload)
    key = (ref, target)
    if key in kept["keys"]:
        raise Invalid("duplicate in this answer")
    if spec.builder and kept["builder"]:
        # One builder action a pass: the output budget holds one object.
        raise Invalid("one builder action per pass")
    with transaction.atomic():
        twin = _open_twin(organisation, fields, target)
        same = spec.same or (lambda a, b: a == b)
        matches = twin is not None and twin.kind == kind and same(twin.payload, payload)
        # A step naming others is the same step only in the bundle holding them.
        if matches and named and twin.bundle_id != home:
            matches = False
        if matches:
            # Re-proposed: it is still waiting on a person, in its own bundle,
            # where a later step of this pass may name it.
            if not auto and twin.bundle_id is not None:
                kept["placed"].setdefault(key_of_bundle, {})[index] = (
                    twin.bundle_id,
                    twin.position,
                )
            kept["keys"].add(key)
            kept["ids"].add(twin.pk)
            kept["builder"] = kept["builder"] or spec.builder
            result.proposed += 1
            return
        if earlier:
            # It can't join that earlier bundle, nor name it from a new one.
            raise Invalid("a placeholder names a step of an earlier bundle")
        if twin is not None and not matches:
            # D2-27: a person's edit, and a message bundle's step, are never
            # replaced by a different proposal: the new item is dropped.
            if twin.edited_at is not None:
                raise Invalid("a person edited the step this would replace")
            if AgentBundle.objects.filter(pk=twin.bundle_id, source__in=MESSAGE_SOURCES).exists():
                raise Invalid("a message bundle holds the step this would replace")
        if _recently_refused(organisation, kind, fields, target, now):
            raise Invalid("refused recently")
        if twin is not None:
            expire(twin, "replaced")
        # D2: an Auto step saves with no bundle, so it gets its own bundle of one.
        bundle = None if auto else kept["bundles"].get(key_of_bundle)
        # `.exists()` under select_for_update runs the FOR UPDATE: it takes the lock.
        if bundle is not None and not (
            AgentBundle.objects.select_for_update(of=("self",))
            .filter(pk=bundle.pk, status=AgentBundle.Status.WAITING)
            .exists()
        ):
            # Run or rejected by a person while this pass was still adding to it.
            raise Invalid("this pass's bundle was decided meanwhile")
        made_bundle = False
        if not auto and bundle is None:
            maker = kept.get("make_bundle")
            if maker is not None:
                # Delivery 2: the caller makes a message bundle (its thread and routing).
                bundle = maker(title, rationale)
            else:
                routed_to, routed_user = routing_for(
                    fields.get("account") or fields.get("customer")
                )
                bundle = AgentBundle.objects.create(
                    organisation=organisation,
                    agent=agent,
                    title=title,
                    reason=rationale,
                    routed_to=routed_to,
                    routed_user=routed_user,
                    **fields,
                )
            made_bundle = True
        action = AgentAction(
            organisation=organisation,
            agent=agent,
            batch=batch,
            kind=kind,
            target=target,
            title=title,
            rationale=rationale,
            evidence=evidence,
            payload=payload,
            generated_by=actor,
            bundle=bundle,
            position=1 if auto else position,
            **fields,
        )
        action.before = spec.current(action)
        action.save()
    if not auto:
        if made_bundle:
            kept["bundles"][key_of_bundle] = bundle
        kept["kinds"].setdefault(key_of_bundle, {})[position] = kind
        kept["placed"].setdefault(key_of_bundle, {})[index] = (bundle.pk, position)
    result.created.append(action.pk)
    kept["keys"].add(key)
    kept["ids"].add(action.pk)
    kept["builder"] = kept["builder"] or spec.builder
    if auto:
        outcome = _apply_auto(action, now, prefs)
        if outcome == "applied":
            result.applied += 1
            return
        if outcome == "expired":
            result.dropped += 1
            return
    result.proposed += 1


def _apply_auto(action, now, prefs):
    """Apply an Auto action in its own savepoint, under its row lock, so one
    failing apply never stops the others. False leaves it proposed for a
    person (Decision 7)."""
    try:
        with transaction.atomic():
            fresh = locked(action.pk)
            if fresh.status != S.PROPOSED:
                return "proposed"
            reason = stale_reason(fresh, now, prefs)
            if reason is not None:
                expire(fresh, reason)
                return "expired"
            apply_action(fresh, None, auto=True)
            # D2: its bundle of one is done, run by nobody.
            settle_bundle_of(fresh)
        return "applied"
    except Stale:
        return "proposed"
    except Exception as exc:  # noqa: BLE001 - one action never stops the others
        logger.warning("agent %s: an auto apply failed: %s", action.agent, type(exc).__name__)
        return "proposed"


def run(organisation, agent, *, now=None, actor=None):
    """One pass of `agent` over `organisation`. See the module."""
    from services.work.clock import today_for

    now = now or timezone.now()
    today = today_for(organisation, now)
    profile = profiles_for(organisation)[agent]
    prefs = policy_for(organisation)
    result = RunResult()
    try:
        # D15: stuck runs settle whether or not this pass goes on.
        settle_stuck_all(organisation, now)
        reason = skip_reason(organisation, profile, prefs, today)
        if reason is not None:
            result.skipped_reason = reason
            return _finish(profile, result, now)
        ctx = evidence_.build(organisation, agent, today=today)
        can = offered(ctx)
        allowed = [
            kind
            for kind in kinds_for(agent)
            if level(prefs, agent, kind) != NEVER
            and not REGISTRY[kind].message_only
            and (not REGISTRY[kind].outside or kind in can)
        ]
        if not ctx.records and ctx.figures is None:
            # An empty book: no model call, nothing charged. Open actions
            # still age out (nothing was proposed again).
            result.empty = True
            _expire_unproposed(organisation, agent, set(), now)
            return _finish(profile, result, now)
        try:
            raw = get_completion(
                system=prompt.system(agent, allowed, organisation.ai_agent_tone),
                messages=[{"role": "user", "content": prompt.render(ctx)}],
                max_tokens=OUTPUT_TOKENS,
                purpose=f"agent_{agent}",
                organisation=organisation,
                user=actor,
            )
            items = prompt.parse(raw)
        except BudgetExceeded:
            result.skipped_reason = "credits"
            return _finish(profile, result, now)
        except (CopilotNotConfigured, CopilotRequestFailed, ValueError):
            result.skipped_reason = "failed"
            return _finish(profile, result, now)
        batch = uuid.uuid4().hex
        kept = {
            "keys": set(),
            "ids": set(),
            "builder": False,
            # bundle key (a record ref, or WORKSPACE) -> this pass's bundle
            "bundles": {},
            # bundle key -> {position: kind}
            "kinds": {},
            # bundle key -> how many items the answer gave for it so far
            "seen": {},
            # bundle key -> {the model's index: (bundle id, position)}, for
            # this pass's new steps and its re-proposed twins alike
            "placed": {},
        }
        for item in items:
            if len(kept["keys"]) >= prompt.MAX_ACTIONS:
                result.dropped += 1
                continue
            try:
                _consider(organisation, agent, item, ctx, prefs, batch, now, actor, kept, result)
            except (Invalid, IntegrityError, KeyError, TypeError, AttributeError) as exc:
                logger.info("agent %s dropped an action: %s", agent, type(exc).__name__)
                result.dropped += 1
        for key, bundle in kept["bundles"].items():
            count = len(kept["kinds"][key])
            if count > 1:
                bundle.title = bundle_title(bundle.title, count)
                bundle.save(update_fields=["title", "updated_at"])
        _expire_unproposed(organisation, agent, kept["ids"], now)
        return _finish(profile, result, now)
    except Exception:
        # Reported by run_all; the profile still says what happened.
        result.skipped_reason = "failed"
        _finish(profile, result, now)
        raise


def _expire_unproposed(organisation, agent, kept_ids, now):
    """Decision 4: a successful pass expires its agent's earlier proposals it
    did not propose again (not the facilitator's, not migrated ones), and
    anything that has waited 14 days."""
    waiting = AgentAction.objects.filter(organisation=organisation, agent=agent, status=S.PROPOSED)
    old = list(waiting.filter(created_at__lte=now - WAIT).values_list("pk", flat=True))
    # Only what existed before this pass began: a concurrent pass's fresh
    # proposals are not this pass's to expire.
    unproposed = list(
        waiting.filter(session__isnull=True, created_at__lt=now)
        .exclude(target__startswith="legacy:")
        .exclude(pk__in=kept_ids)
        # D2-27: a message bundle's steps (a thread's or a Slack message's) and a
        # person's edits wait their 14 days
        .exclude(edited_at__isnull=False)
        .exclude(
            bundle_id__in=AgentBundle.objects.filter(
                organisation=organisation, source__in=MESSAGE_SOURCES
            ).values("id")
        )
        .values_list("pk", flat=True)
    )
    for reason, pks in (("waited", old), ("not_reproposed", unproposed)):
        for pk in pks:
            with transaction.atomic():
                action = locked(pk)
                # Decided meanwhile (a person, or another pass): leave it.
                if action.status == S.PROPOSED:
                    expire(action, reason)


def run_all(organisation=None, *, now=None):
    """Every active workspace with organisations (or just `organisation`),
    every agent, each on its own."""
    from services.customers.models import Customer

    if organisation is not None:
        workspaces = [organisation]
    else:
        workspaces = Organisation.objects.filter(
            status=Organisation.Status.ACTIVE,
            id__in=Customer.objects.values("organisation_id"),
        ).order_by("id")
    total = RunResult()
    for workspace in workspaces:
        for agent in AGENTS:
            try:
                total.add(run(workspace, agent, now=now))
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                logger.warning(
                    "agents: %s in organisation %s failed: %s",
                    agent,
                    workspace.pk,
                    type(exc).__name__,
                )
                total.failed.append(f"{agent} in organisation {workspace.pk}")
    return total
