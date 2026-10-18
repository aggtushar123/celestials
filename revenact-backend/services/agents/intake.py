"""Message intake (agent bundles D2, contract §2.2): every 5 minutes (round
2 D3, R2D3-16), each workspace whose interval is due reads its quiet threads,
at most 25, oldest first; then the fast lane reads urgent threads quiet for 2
minutes, within its caps, through the same `process`. Each thread is gated
(stale, off, answered, no reader, agent off, credits), routed, read in one
model call and placed. One thread or workspace failing never stops the
others (D2-25). No task queue: the command runs in a sleep loop (D2-21)."""

import logging
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import F, Q
from django.utils import timezone

from core import audit
from services.accounts.models import Organisation
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
    get_completion,
)
from services.customers.models import Email, SlackConversation, Ticket
from services.metrics.models import AgentAction

from . import evidence, fast_lane, intake_bundles, prompt, routing, threads
from .kinds import NEVER
from .models import SignalThread
from .policy import level, policy_for, profiles_for, spent_this_month
from .registry import REGISTRY, kinds_for

logger = logging.getLogger(__name__)
T = SignalThread.Status
#: The outcome counts a run reports and audits (contract §7).
COUNTED = (
    "threads",
    "made",
    "refreshed",
    "superseded",
    "flagged",
    "processed",
    "skipped",
    "waiting",
    "failed",
)
QUIET = timedelta(minutes=15)
GRACE = timedelta(minutes=2)
CLAIM = timedelta(minutes=15)
MAX_THREADS = 25
MAX_FAILURES = 3
OUTPUT_TOKENS = 3000
INTERVALS = {
    "30m": timedelta(minutes=30),
    "1h": timedelta(hours=1),
    "4h": timedelta(hours=4),
    "24h": timedelta(hours=24),
}


@dataclass
class IntakeResult:
    threads: int = 0
    made: int = 0
    refreshed: int = 0
    superseded: int = 0
    flagged: int = 0
    processed: int = 0
    skipped: int = 0
    waiting: int = 0
    failed: int = 0
    #: bundles made or re-dated this run (the notices, D2-24)
    bundles: list = field(default_factory=list)
    #: high-priority bundles made this run: told at once (guided agent)
    priority: list = field(default_factory=list)
    #: workspaces that failed as a whole
    errors: list = field(default_factory=list)

    def counts(self):
        return {name: getattr(self, name) for name in COUNTED}

    def add(self, other):
        for name in COUNTED:
            setattr(self, name, getattr(self, name) + getattr(other, name))
        self.bundles += other.bundles
        self.priority += other.priority
        self.errors += other.errors


def due(organisation, now):
    """D2-21: the last run started at least the interval (less GRACE) ago."""
    ran = organisation.ai_signals_ran_at
    every = INTERVALS.get(organisation.ai_signal_interval, INTERVALS["1h"])
    return ran is None or ran <= now - every + GRACE


def claim_workspace(organisation, now):
    """Compare-and-set on `ai_signals_ran_at`: only one run takes it."""
    rows = Organisation.objects.filter(pk=organisation.pk)
    seen = organisation.ai_signals_ran_at
    rows = (
        rows.filter(ai_signals_ran_at__isnull=True)
        if seen is None
        else rows.filter(ai_signals_ran_at=seen)
    )
    taken = rows.update(ai_signals_ran_at=now) == 1
    if taken:
        organisation.ai_signals_ran_at = now
    return taken


def _new_messages():
    return Q(processed_through__isnull=True) | Q(last_message_at__gt=F("processed_through"))


def _not_being_handed():
    """Channel tag to-dos: a Slack thread with a message still waiting for its
    tag check is left for a later run, so a message handed to the colleagues
    it tags (slack_tag_checks, which then marks it read) gets no second plan
    for the record's account team. Part of the same query."""
    return Q(conversation__tag_checks__isnull=False)


def pick(organisation, now):
    """D2-22: quiet for 15 minutes, unclaimed, oldest first, at most 25."""
    return list(
        SignalThread.objects.filter(organisation=organisation)
        .filter(_new_messages(), last_message_at__lte=now - QUIET)
        .exclude(_not_being_handed())
        .filter(Q(claimed_at__isnull=True) | Q(claimed_at__lte=now - CLAIM))
        .select_related(
            "customer__owner",
            "account__owner",
            "ticket__connector",
            "conversation__connector",
            "conversation__started_by",
            "organisation",
        )
        .order_by("last_message_at", "id")[:MAX_THREADS]
    )


def _claim(thread, now):
    free = Q(claimed_at__isnull=True) | Q(claimed_at__lte=now - CLAIM)
    return SignalThread.objects.filter(free, pk=thread.pk).update(claimed_at=now) == 1


def answered(thread):
    """D2-15: our reply is the newest message (mail or Slack), or the ticket
    is resolved or closed."""
    if thread.source_kind == SignalThread.SourceKind.MAIL:
        newest = (
            Email.objects.filter(mailbox_id=thread.mailbox_id, thread_id=thread.mail_thread)
            .order_by("-sent_at", "-id")
            .values_list("direction", flat=True)
            .first()
        )
        return "answered" if newest == Email.Direction.SENT else None
    if thread.source_kind == SignalThread.SourceKind.SLACK:
        from services.connectors.providers.slack import ours

        messages, config = (
            SlackConversation.objects.filter(pk=thread.conversation_id)
            .values_list("messages", "connector__config")
            .first()
        ) or ([], None)
        # I3: only our own bot's post answers it, never another app's; SE4-16:
        # or our reply posted as a person
        last = messages[-1] if messages else None
        return "answered" if last and (ours(last, config) or last.get("via_app")) else None
    status = Ticket.objects.filter(pk=thread.ticket_id).values_list("status", flat=True).first()
    return "resolved" if status in Ticket.RESOLVED_STATUSES else None


def allowed_kinds(prefs, agent, ctx):
    """The agent's record-level kinds not on Never; a draft reply only where
    the context has a source it may answer (D2-14); an outside kind only
    where the context offers it (D3-18)."""
    from .outside.offered import offered

    can = offered(ctx)
    allowed = []
    for kind in kinds_for(agent):
        spec = REGISTRY[kind]
        if spec.workspace_level or level(prefs, agent, kind) == NEVER:
            continue
        # A Slack message's own kinds, but for the guided agent's (on_threads).
        if spec.message_only and not spec.on_threads:
            continue
        # The guided agent's send goes with its trio on any thread (not a tool's offer).
        if spec.outside and kind not in can and not spec.on_threads:
            continue
        if kind == AgentAction.Kind.DRAFT_REPLY and not (ctx.emails or ctx.tickets):
            continue
        allowed.append(kind)
    # D3-28: outside kinds are always Ask; an agent with every other kind on Never is off.
    return allowed if any(not REGISTRY[kind].outside for kind in allowed) else []


@dataclass(frozen=True)
class Gate:
    """What the gates decided for one thread: its route and agent when it
    may be read; else the status it ends in (skipped or waiting on credits)
    and why. `agent` is set once the agent is chosen."""

    route: object = None
    agent: str = ""
    status: str = ""
    reason: str = ""


def gate(organisation, thread, *, now, today, profiles, agent=None):
    """Contract §2.2 step 4, before any call: stale, source off, AI off,
    answered or resolved, no reader, agent off, the agent's budget used.
    `agent`: a Refresh (D2-19) names its bundle's agent and is gated in
    §4.2's order (AI off, agent off, source off, budget, no reader); it is
    never stale or answered: a person asked for it."""
    if agent is not None:
        return _refresh_gate(organisation, thread, today, profiles, agent)
    if thread.last_message_at < now - threads.STALE:
        return Gate(status=T.SKIPPED, reason="stale")
    if not threads.source_on(organisation, thread.source_kind):
        return Gate(status=T.SKIPPED, reason="source_off")
    if not organisation.ai_agent_enabled:
        return Gate(status=T.SKIPPED, reason="ai_off")
    done = answered(thread)
    if done:
        return Gate(status=T.SKIPPED, reason=done)
    route, reason = routing.route(thread)
    if route is None:
        return Gate(status=T.SKIPPED, reason=reason)
    agent = routing.choose_agent(thread)
    profile = profiles[agent]
    if not profile.enabled:
        return Gate(agent=agent, status=T.SKIPPED, reason="agent_off")
    if spent_this_month(organisation, agent, today=today) >= profile.monthly_credits:
        return Gate(agent=agent, status=T.WAITING_CREDITS, reason="budget")
    return Gate(route=route, agent=agent)


def _refresh_gate(organisation, thread, today, profiles, agent):
    if not organisation.ai_agent_enabled:
        return Gate(agent=agent, status=T.SKIPPED, reason="ai_off")
    profile = profiles[agent]
    if not profile.enabled:
        return Gate(agent=agent, status=T.SKIPPED, reason="agent_off")
    if not threads.source_on(organisation, thread.source_kind):
        return Gate(agent=agent, status=T.SKIPPED, reason="source_off")
    if spent_this_month(organisation, agent, today=today) >= profile.monthly_credits:
        return Gate(agent=agent, status=T.WAITING_CREDITS, reason="budget")
    route, reason = routing.route(thread)
    if route is None:
        return Gate(agent=agent, status=T.SKIPPED, reason=reason)
    return Gate(route=route, agent=agent)


def read_thread(organisation, agent, allowed, ctx, *, user=None, scope_key=""):
    """One model call for one thread (D2-13, D2-14): its answer. A fast-lane
    call is marked `scope_key="fast_lane"` (R2D3-18, counted by
    `fast_lane.used`); it is an ordinary agent call all the same. Raises
    BudgetExceeded, CopilotNotConfigured, CopilotRequestFailed or
    ValueError (an answer that is not one)."""
    slack = ctx.thread_channel == "slack" and ctx.thread_slack is not None
    raw = get_completion(
        system=prompt.thread_system(
            agent,
            allowed,
            organisation.ai_agent_tone,
            ctx.thread_ref,
            slack=slack,
            shared=slack and bool(ctx.thread_slack.get("external_shared")),
        ),
        messages=[{"role": "user", "content": prompt.render(ctx)}],
        max_tokens=OUTPUT_TOKENS,
        purpose=f"agent_{agent}",
        organisation=organisation,
        user=user,
        scope_key=scope_key,
    )
    return prompt.parse_thread(raw)


def _finish(thread, seen, now, status, reason, result, *, agent=""):
    SignalThread.objects.filter(pk=thread.pk).update(
        status=status,
        skip_reason=reason,
        processed_through=seen,
        processed_at=now,
        claimed_at=None,
        failures=0,
        agent=agent or thread.agent,
        updated_at=now,
    )
    if status == T.SKIPPED:
        result.skipped += 1
    else:
        result.processed += 1


def _wait(thread, agent, reason, now, result):
    """D2-23: out of credits, the thread waits (its messages stay unread)."""
    SignalThread.objects.filter(pk=thread.pk).update(
        status=T.WAITING_CREDITS, skip_reason=reason, agent=agent, claimed_at=None, updated_at=now
    )
    result.waiting += 1


def _failed(thread, seen, now, result, exc):
    """D2-25: due again next run; skipped after MAX_FAILURES."""
    logger.warning("intake: thread %s failed: %s", thread.pk, type(exc).__name__)
    result.failed += 1
    failures = (
        SignalThread.objects.filter(pk=thread.pk).values_list("failures", flat=True).first() or 0
    ) + 1
    if failures >= MAX_FAILURES:
        SignalThread.objects.filter(pk=thread.pk).update(
            status=T.SKIPPED,
            skip_reason="failed",
            processed_through=seen,
            processed_at=now,
            claimed_at=None,
            failures=failures,
            updated_at=now,
        )
        return
    SignalThread.objects.filter(pk=thread.pk).update(
        failures=failures, claimed_at=None, updated_at=now
    )


def process(organisation, thread, *, now, today, prefs, profiles, result, lane="interval"):
    """One thread (contract §2.2, step 4), from either lane (R2D3-17)."""
    seen = thread.last_message_at
    gated = gate(organisation, thread, now=now, today=today, profiles=profiles)
    agent = gated.agent
    if gated.status == T.WAITING_CREDITS:
        return _wait(thread, agent, gated.reason, now, result)
    if gated.status:
        return _finish(thread, seen, now, gated.status, gated.reason, result, agent=agent)
    current = intake_bundles.waiting_bundle(thread, now)
    if current is not None and (current.edited_at is not None or intake_bundles.held(current)):
        # D2-17: a person's edits stand; no call until they ask for a Refresh.
        intake_bundles.flag_newer(current)
        result.flagged += 1
        return _finish(thread, seen, now, T.PROCESSED, "", result, agent=agent)
    ctx = evidence.build_for_thread(organisation, agent, thread, gated.route, today=today)
    allowed = allowed_kinds(prefs, agent, ctx)
    if not allowed:
        # Every kind is on Never for this agent: as good as switched off.
        return _finish(thread, seen, now, T.SKIPPED, "agent_off", result, agent=agent)
    try:
        scope_key = fast_lane.SCOPE_KEY if lane == "fast" else ""
        answer = read_thread(organisation, agent, allowed, ctx, scope_key=scope_key)
    except BudgetExceeded:
        return _wait(thread, agent, "credits", now, result)
    except (CopilotNotConfigured, CopilotRequestFailed, ValueError) as exc:
        return _failed(thread, seen, now, result, exc)
    try:
        placed = intake_bundles.place(
            organisation, thread, gated.route, agent, answer, ctx, prefs, now, into=current
        )
    except intake_bundles.Changed:
        # Run or edited by a person while the call ran: their version stands.
        if current is not None:
            intake_bundles.flag_newer(current)
        result.flagged += 1
        return _finish(thread, seen, now, T.PROCESSED, "", result, agent=agent)
    if placed.superseded:
        result.superseded += 1
    elif placed.made:
        result.made += 1
        result.bundles.append(placed.bundle.pk)
        if placed.bundle.priority == placed.bundle.Priority.HIGH:
            result.priority.append(placed.bundle.pk)
    elif placed.refreshed:
        result.refreshed += 1
        result.bundles.append(placed.bundle.pk)
    return _finish(thread, seen, now, T.PROCESSED, "", result, agent=agent)


def _quiet(organisation, now):
    """D2-22: threads with a message in the last 15 minutes wait."""
    SignalThread.objects.filter(organisation=organisation, last_message_at__gt=now - QUIET).filter(
        _new_messages()
    ).exclude(status=T.WAITING_QUIET).update(status=T.WAITING_QUIET)


def _notify(organisation, result, *, today, now):
    """Contract §6: after the run commits; a failure is logged and never
    undoes the run."""
    if not result.bundles:
        return
    from django.db import transaction

    from services.work import proposal_notice

    from . import guided

    # Guided agent: a high-priority bundle is told at once, beside the daily notice.
    guided.tell_priority(result.priority)

    # Each notice in its own transaction: a queue notice that fails never
    # undoes the Mine notices, nor the other way round.
    notices = (
        ("mine", lambda: proposal_notice.notify_proposals(organisation, today=today, now=now)),
        (
            "queue",
            lambda: proposal_notice.notify_queues(
                organisation, result.bundles, today=today, now=now
            ),
        ),
    )
    for name, send in notices:
        try:
            with transaction.atomic():
                send()
        except Exception as exc:  # noqa: BLE001 - the run is committed either way
            logger.warning("intake: the %s notice failed: %s", name, type(exc).__name__)


def run_workspace(organisation, *, now):
    from services.work.clock import today_for

    result = IntakeResult()
    today = today_for(organisation, now)
    prefs = policy_for(organisation)
    profiles = profiles_for(organisation)
    _quiet(organisation, now)
    for thread in pick(organisation, now):
        if not _claim(thread, now):
            continue
        result.threads += 1
        try:
            process(
                organisation,
                thread,
                now=now,
                today=today,
                prefs=prefs,
                profiles=profiles,
                result=result,
            )
        except Exception as exc:  # noqa: BLE001 - one thread never stops the others (D2-25)
            _failed(thread, thread.last_message_at, now, result, exc)
    _notify(organisation, result, today=today, now=now)
    audit.record(  # SOC2:LOG-01 counts only, no actor: the schedule ran it (R2D3-20)
        "agent_signals.run",
        actor=None,
        organisation=organisation,
        metadata={**result.counts(), "lane": "interval"},
    )
    return result


def run_all(*, now=None, organisation=None):
    """Every active workspace with threads (or just `organisation`) whose
    interval is due, each on its own."""
    now = now or timezone.now()
    total = IntakeResult()
    if organisation is not None:
        workspaces = [Organisation.objects.get(pk=organisation.pk)]
    else:
        workspaces = Organisation.objects.filter(
            status=Organisation.Status.ACTIVE,
            id__in=SignalThread.objects.values("organisation_id"),
        ).order_by("id")
    for workspace in workspaces:
        if not due(workspace, now) or not claim_workspace(workspace, now):
            continue
        try:
            total.add(run_workspace(workspace, now=now))
        except Exception as exc:  # noqa: BLE001 - one workspace never stops the others
            logger.warning("intake: organisation %s failed: %s", workspace.pk, type(exc).__name__)
            total.errors.append(f"organisation {workspace.pk}")
    return total


@dataclass
class FastResult(IntakeResult):
    #: workspaces whose cap stopped urgent threads this tick
    capped: int = 0
    #: workspaces the tick ran in
    workspaces: int = 0


def fast_due(organisation, now):
    """R2D3-16: the last fast tick started at least 4.5 minutes ago."""
    ran = organisation.ai_fast_ran_at
    return ran is None or ran <= now - fast_lane.TICK + fast_lane.TICK_GRACE


def claim_fast(organisation, now):
    """Compare-and-set on `ai_fast_ran_at` (R2D3-16); never `ai_signals_ran_at`."""
    rows = Organisation.objects.filter(pk=organisation.pk)
    seen = organisation.ai_fast_ran_at
    rows = (
        rows.filter(ai_fast_ran_at__isnull=True)
        if seen is None
        else rows.filter(ai_fast_ran_at=seen)
    )
    taken = rows.update(ai_fast_ran_at=now) == 1
    if taken:
        organisation.ai_fast_ran_at = now
    return taken


def _urgent(organisation, now):
    """Threads a fast-lane rule matched, with new messages, not stale,
    unclaimed. A thread waiting on credits, or one whose read failed, is left
    to the interval run (its retries and its wait, as D2)."""
    return (
        SignalThread.objects.filter(organisation=organisation, failures=0)
        .exclude(urgent_rule="")
        .exclude(status=T.WAITING_CREDITS)
        .exclude(_not_being_handed())
        .filter(_new_messages(), last_message_at__gt=now - threads.STALE)
        .filter(Q(claimed_at__isnull=True) | Q(claimed_at__lte=now - CLAIM))
    )


def run_fast_workspace(organisation, *, now):
    """One workspace's fast tick (R2D3-16 to R2D3-18): at most the caps' calls
    left, on urgent threads quiet for 2 minutes, oldest first, each through
    `process` (every D2 gate and the waiting-bundle rule). A capped thread
    waits for the interval run."""
    from services.work.clock import today_for

    result = FastResult(workspaces=1)
    lane = fast_lane.settings(organisation)
    hour, day = fast_lane.used(organisation, now)
    by_caps = min(lane["per_hour"] - hour, lane["per_day"] - day)
    left = min(by_caps, fast_lane.MAX_PER_TICK)
    quiet = _urgent(organisation, now).filter(last_message_at__lte=now - fast_lane.QUIET)
    if left <= 0:
        if quiet.exists():
            result.capped = 1
    else:
        today = today_for(organisation, now)
        prefs, profiles = policy_for(organisation), profiles_for(organisation)
        picked = quiet.select_related(
            "customer__owner",
            "account__owner",
            "ticket__connector",
            "conversation__connector",
            "conversation__started_by",
            "organisation",
        ).order_by("last_message_at", "id")[: left + 1]
        picked = list(picked)
        if len(picked) > left and by_caps <= fast_lane.MAX_PER_TICK:
            # More urgent threads wait than the hourly or daily cap lets this tick read.
            result.capped = 1
        for thread in picked[:left]:
            if not _claim(thread, now):
                continue
            result.threads += 1
            try:
                process(
                    organisation,
                    thread,
                    now=now,
                    today=today,
                    prefs=prefs,
                    profiles=profiles,
                    result=result,
                    lane="fast",
                )
            except Exception as exc:  # noqa: BLE001 - one thread never stops the others (D2-25)
                _failed(thread, thread.last_message_at, now, result, exc)
        _notify(organisation, result, today=today, now=now)
    if result.threads or result.capped:
        audit.record(  # SOC2:LOG-01 counts only, no actor: the schedule ran it (R2D3-20)
            "agent_signals.run",
            actor=None,
            organisation=organisation,
            metadata={**result.counts(), "lane": "fast", "capped": bool(result.capped)},
        )
    return result


def run_fast(*, now=None, organisation=None):
    """The fast tick: every active workspace with AI and the fast lane on (or
    just `organisation`) whose tick is due, each on its own (D2-25)."""
    now = now or timezone.now()
    total = FastResult()
    # SOC2:AUTH-02 only workspaces that switched AI and the fast lane on are read
    workspaces = Organisation.objects.filter(
        status=Organisation.Status.ACTIVE, ai_agent_enabled=True, ai_fast_lane__on=True
    ).order_by("id")
    if organisation is not None:
        workspaces = workspaces.filter(pk=organisation.pk)
    for workspace in workspaces:
        if not fast_due(workspace, now) or not claim_fast(workspace, now):
            continue
        try:
            one = run_fast_workspace(workspace, now=now)
        except Exception as exc:  # noqa: BLE001 - one workspace never stops the others
            logger.warning(
                "fast lane: organisation %s failed: %s", workspace.pk, type(exc).__name__
            )
            total.errors.append(f"organisation {workspace.pk}")
            continue
        total.add(one)
        total.capped += one.capped
        total.workspaces += one.workspaces
    return total


NOT_A_THREAD = "Only a bundle made from a message can be refreshed."
SOURCE_OFF = "Agents don't read {label} messages in this workspace."
NO_READER = "Nobody this bundle is for may read its message any more."
REFRESH_FAILED = "Couldn't refresh the suggestions. Try again."
BUNDLE_CHANGED = "This bundle changed while it refreshed. Review it again."
NO_CREDITS = "The workspace has no credits left."
_OFF = {
    "ai_off": ("AI_OFF", "AI is switched off for this workspace."),
    "agent_off": ("AGENT_OFF", "This agent is switched off."),
}


def _refused_by(gated, organisation, thread, today):
    """The 409 for what the gates decided (the run's own sentences), or None."""
    from .bundle_run import Refused
    from .policy import resets_on

    if gated.status == T.WAITING_CREDITS:
        day = resets_on(today)
        return Refused(
            409,
            {
                "code": "BUDGET_USED",
                "detail": f"This agent's budget is used up: it resumes on {day.day} {day:%b}.",
                "resets_on": day.isoformat(),
            },
        )
    if not gated.status:
        return None
    if gated.reason == "source_off":
        label = SignalThread.SourceKind(thread.source_kind).label
        return Refused(409, {"code": "SOURCE_OFF", "detail": SOURCE_OFF.format(label=label)})
    if gated.reason in _OFF:
        code, detail = _OFF[gated.reason]
        return Refused(409, {"code": code, "detail": detail})
    return Refused(409, {"code": "NO_READER", "detail": NO_READER})


def refresh(reader, pk):
    """POST /agents/bundles/<id>/refresh/ (contract §4.2, D2-19): one model
    call with no lock held, placed only if the bundle is as it was read."""
    from services.work.clock import today_for

    from .bundle_payloads import bundle_for, bundle_payload
    from .bundle_run import CANT_RUN, Refused, conflict
    from .bundles import settle_stuck
    from .deciding import may_decide
    from .models import AgentBundle

    bundle = settle_stuck(bundle_for(reader, pk))
    if bundle.source != AgentBundle.Source.THREAD or bundle.thread_id is None:
        raise Refused(409, {"code": "NOT_A_THREAD", "detail": NOT_A_THREAD})
    waiting = list(
        bundle.steps.filter(status=AgentAction.Status.PROPOSED).select_related(
            "customer", "account", "organisation", "bundle"
        )
    )
    # SOC2:AUTH-02 a refresh is a run's kind of change: someone who may run a step
    if bundle.status == AgentBundle.Status.WAITING and not any(
        may_decide(reader, step) for step in waiting
    ):
        raise Refused(403, {"code": "CANT_RUN", "detail": CANT_RUN})
    now = timezone.now()
    refused = conflict(bundle, reader, now)
    if refused is not None:
        raise refused
    organisation = Organisation.objects.get(pk=bundle.organisation_id)
    thread = SignalThread.objects.select_related(
        "customer__owner",
        "account__owner",
        "ticket__connector",
        "conversation__connector",
        "conversation__started_by",
        "organisation",
    ).get(pk=bundle.thread_id)
    today = today_for(organisation, now)
    gated = gate(
        organisation,
        thread,
        now=now,
        today=today,
        profiles=profiles_for(organisation),
        agent=bundle.agent,
    )
    refused = _refused_by(gated, organisation, thread, today)
    if refused is not None:
        raise refused
    expect = bundle.updated_at
    keep = intake_bundles.keep_set(list(bundle.steps.order_by("position")))
    prefs = policy_for(organisation)
    ctx = evidence.build_for_thread(organisation, bundle.agent, thread, gated.route, today=today)
    allowed = allowed_kinds(prefs, bundle.agent, ctx)
    try:
        answer = read_thread(organisation, bundle.agent, allowed, ctx, user=reader)
    except BudgetExceeded:
        raise Refused(429, {"detail": NO_CREDITS}) from None
    except (CopilotNotConfigured, CopilotRequestFailed, ValueError):
        raise Refused(503, {"code": "REFRESH_FAILED", "detail": REFRESH_FAILED}) from None
    try:
        placed = intake_bundles.place(
            organisation,
            thread,
            gated.route,
            bundle.agent,
            answer,
            ctx,
            prefs,
            now,
            into=bundle,
            keep=keep,
            expect=expect,
            by=reader,
        )
    except intake_bundles.Changed:
        fresh = AgentBundle.objects.get(pk=bundle.pk)
        raise Refused(
            409,
            {
                "code": "BUNDLE_CHANGED",
                "detail": BUNDLE_CHANGED,
                "bundle": bundle_payload(fresh, reader),
            },
        ) from None
    # The thread's messages so far are read; a newer one leaves it due.
    SignalThread.objects.filter(pk=thread.pk).filter(
        Q(processed_through__isnull=True) | Q(processed_through__lt=thread.last_message_at)
    ).update(processed_through=thread.last_message_at, processed_at=now)
    return placed.bundle
