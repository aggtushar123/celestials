"""Running a bundle (Agent bundles, contract §5, §6.3, §9): the body is
checked before anything is locked; a short claim under the bundle's row lock
marks it running; each selected step then runs in order in its own
transaction; a short finish settles it. Retry and reject (Task 8) share the
conflicts and `run_step`."""

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from core import audit
from services.metrics.models import AgentAction
from services.work.clock import local_now

from . import failure_notice, guided, placeholders
from .bundle_payloads import (
    bundle_for,
    bundle_payload,
    editable_keys,
    irreversible_now,
    no_such_bundle,
)
from .bundles import expire_bundle, outcome, read_expired, settle_stuck
from .deciding import (
    REASONS,
    _audit,
    apply_action,
    decided_as,
    expire,
    locked,
    may_decide,
    stale_reason,
)
from .kinds import FieldErrors, OwnerLimit, Skipped, Stale, StepFailed
from .models import AgentBundle
from .outside import seats
from .registry import REGISTRY

logger = logging.getLogger(__name__)
S = AgentAction.Status
B = AgentBundle.Status
LIST_STEPS = "List every waiting step once."
CHOOSE_ONE = "Choose at least one step to run."
CANT_CHANGE = "This can't be changed here."
LOST_RIGHTS = "You can no longer run this step."
GENERIC = "Something went wrong running this step. Retry it."
CANT_RUN = "You can't run this bundle."
REFRESHED = "This bundle was updated with a newer message. Review it again."
SUPERSEDED = "A newer bundle replaced this one."
ERROR_LIMIT = 500


class Refused(Exception):
    """A refusal: the response's status and body."""

    def __init__(self, status, body):
        super().__init__(status)
        self.status = status
        self.body = body


def cant_run_step(step):
    """403 CANT_RUN_STEP: the reader may not decide this step (D13)."""
    return Refused(
        403,
        {
            "code": "CANT_RUN_STEP",
            "detail": f"You can't run step {step.position}.",
            "step": step.pk,
        },
    )


def _name(user):
    return "Revenact" if user is None else user.name


def ran_sentence(bundle, now):
    finished = local_now(bundle.organisation, bundle.run_finished_at or now)
    today = local_now(bundle.organisation, now).date()
    if finished.date() == today:
        return f"{_name(bundle.run_by)} ran this at {finished:%H:%M}."
    return f"{_name(bundle.run_by)} ran this on {finished.day} {finished:%b} at {finished:%H:%M}."


def conflict(bundle, reader, now):
    """The 409 for a bundle that isn't waiting (contract §9.2), else None. A
    waiting bundle past its 14 days is stored expired first."""
    if read_expired(bundle, now):
        expire_bundle(bundle, "waited")
    body = None
    if bundle.status == B.RUNNING:
        body = {"code": "BUNDLE_RUNNING", "detail": f"{_name(bundle.run_by)} is running this."}
    elif bundle.status in (B.DONE, B.PARTLY_DONE):
        body = {"code": "BUNDLE_RAN", "detail": ran_sentence(bundle, now)}
    elif bundle.status == B.REJECTED:
        rejecter = bundle.rejected_by.name if bundle.rejected_by_id else None
        if rejecter is None:
            rejecter = (
                bundle.steps.exclude(decided_by=None)
                .values_list("decided_by__name", flat=True)
                .first()
            )
        body = {"code": "BUNDLE_REJECTED", "detail": f"{rejecter or 'Revenact'} rejected this."}
    elif bundle.status == B.EXPIRED:
        reason = (
            bundle.steps.exclude(expired_reason="").values_list("expired_reason", flat=True).first()
        )
        sentence = REASONS.get(reason or "waited", "it expired")
        body = {"code": "BUNDLE_EXPIRED", "detail": f"This bundle expired: {sentence}."}
    elif bundle.status == B.SUPERSEDED:
        body = {"code": "BUNDLE_SUPERSEDED", "detail": SUPERSEDED}
    if body is None:
        return None
    return Refused(409, {**body, "bundle": bundle_payload(bundle, reader)})


def parse_body(steps, data, reader):
    """(selected step ids, {step id: edited payload}) or Refused(400)."""
    waiting = {step.pk: step for step in steps if step.status == S.PROPOSED}
    rows = data.get("steps") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise Refused(400, {"steps": [LIST_STEPS]})
    seen = {}
    for row in rows:
        pk = row.get("id") if isinstance(row, dict) else None
        if not isinstance(pk, int) or isinstance(pk, bool) or pk not in waiting or pk in seen:
            raise Refused(400, {"steps": [LIST_STEPS]})
        seen[pk] = row
    if set(seen) != set(waiting):
        raise Refused(400, {"steps": [LIST_STEPS]})
    selected = {pk for pk, row in seen.items() if row.get("selected") is True}
    if not selected:
        raise Refused(400, {"steps": [CHOOSE_ONE]})
    edits, errors = {}, {}
    for pk, row in seen.items():
        fields = row.get("fields") or {}
        if not fields:
            continue
        step = waiting[pk]
        allowed = set(editable_keys(step))
        if not isinstance(fields, dict):
            errors[str(pk)] = {"fields": [CANT_CHANGE]}
            continue
        wrong = {key: [CANT_CHANGE] for key in fields if pk not in selected or key not in allowed}
        if wrong:
            errors[str(pk)] = wrong
            continue
        try:
            edits[pk] = REGISTRY[step.kind].edit(step, fields, reader)
        except FieldErrors as exc:
            errors[str(pk)] = exc.errors
    if errors:
        raise Refused(400, {"steps": errors})
    return selected, edits


def _sentence(exc):
    if isinstance(exc, ValidationError):
        detail = exc.detail
        if isinstance(detail, dict) and "detail" in detail:
            detail = detail["detail"]
        while isinstance(detail, (list, dict)) and detail:
            detail = detail[0] if isinstance(detail, list) else next(iter(detail.values()))
        return str(detail)[:ERROR_LIMIT] or GENERIC
    if isinstance(exc, OwnerLimit):
        return exc.detail[:ERROR_LIMIT]
    logger.warning("agents: a bundle step failed: %s", type(exc).__name__)
    return GENERIC


def _skip(step, runner, exc):
    """SE4-10: the step ends skipped with its note; it made nothing."""
    step.status = S.SKIPPED
    step.result = {**(step.result or {}), **(exc.result or {}), "note": exc.note[:ERROR_LIMIT]}
    step.decided_by, step.decided_at = runner, timezone.now()
    step.error = ""
    step.save(update_fields=["status", "result", "decided_by", "decided_at", "error"])
    _audit("agent_action.skipped", step, runner, bundle=step.bundle_id)
    return step


def _fail(step_id, runner, detail, *, result=None, error_class=""):
    with transaction.atomic():
        step = locked(step_id)
        step.status = S.FAILED
        step.error = detail[:ERROR_LIMIT]
        if result:
            step.result = {**(step.result or {}), **result}
        step.save(update_fields=["status", "error", "result"])
        _audit(
            "agent_action.failed",
            step,
            runner,
            bundle=step.bundle_id,
            error=error_class or "StepFailed",
        )
    return step


def outputs_by_position(bundle):
    return {
        position: outputs or {}
        for position, outputs in bundle.steps.filter(status=S.APPLIED).values_list(
            "position", "outputs"
        )
    }


def _attempt_of(step_id, runner):
    """D3-12: an outside step that broke anywhere keeps when it was first
    tried and by whom, so the next Retry looks back far enough."""
    from .outside.keys import attempt

    step = AgentAction.objects.filter(pk=step_id).only("kind", "result").first()
    spec = REGISTRY.get(step.kind) if step is not None else None
    if spec is None or not spec.outside:
        return None
    return attempt(step, runner)


def run_step(step_id, runner, outputs, *, retry=False):
    """One step in its own transaction (contract §5.1.4): applied, expired
    (D14) or failed (§9.3). A failure never raises. A kind that stops with
    `StepFailed` keeps what it made so far (a survey's draft and segment):
    its inner savepoint commits, the outer transaction ends normally, and the
    step is then marked failed in a transaction of its own."""
    runnable = (S.PROPOSED, S.FAILED) if retry else (S.PROPOSED,)
    kept = skipped = None
    try:
        with transaction.atomic():
            step = locked(step_id)
            if step.status not in runnable:
                return step
            # SOC2:AUTH-02 re-checked at the step: rights can change mid-run
            if not may_decide(runner, step):
                raise StepFailed(LOST_RIGHTS)
            spec = REGISTRY[step.kind]
            opened = spec.open_keys(step.payload, live=True) if spec.open_keys else ()
            try:
                payload = placeholders.fill(
                    step.payload, outputs, skip=spec.customer_facing, open_keys=opened
                )
            except placeholders.NeedsStep as exc:
                raise StepFailed(placeholders.needs_sentence(exc.position)) from None
            reason = stale_reason(step, timezone.now())
            if reason is None:
                if payload != step.payload:
                    step.payload = payload
                    step.save(update_fields=["payload"])
                # What it is as it runs (§3), read before apply marks it applied.
                irreversible = irreversible_now(step)
                try:
                    with transaction.atomic():
                        try:
                            apply_action(step, runner)
                        except StepFailed as exc:
                            kept = exc
                except Stale as exc:
                    reason = exc.reason
                except Skipped as exc:
                    skipped = exc
            if skipped is not None:
                return _skip(step, runner, skipped)
            if reason is not None:
                expire(step, reason, runner)
                return step
            if kept is None:
                step.outputs = placeholders.outputs_for(step.result)
                step.irreversible = irreversible
                step.error = ""
                step.save(update_fields=["outputs", "irreversible", "error"])
                _audit(
                    "agent_action.approved",
                    step,
                    runner,
                    decided_as=decided_as(runner, step),
                    auto=False,
                    bundle=step.bundle_id,
                )
                return step
    except StepFailed as exc:
        return _fail(step_id, runner, exc.detail, result=exc.result)
    except Exception as exc:  # noqa: BLE001 - one step never stops the others (§5.1)
        return _fail(
            step_id,
            runner,
            _sentence(exc),
            error_class=type(exc).__name__,
            result=_attempt_of(step_id, runner),
        )
    return _fail(step_id, runner, kept.detail, result=kept.result)


def _claim(reader, pk, selected, edits, now):
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            return bundle, refused
        steps = list(bundle.steps.select_for_update().order_by("position"))
        for step in steps:
            if step.pk in selected and step.status == S.PROPOSED and not may_decide(reader, step):
                # SOC2:AUTH-02 a step the runner may not decide refuses the whole run (D13)
                return bundle, cant_run_step(step)
        edited = False
        for step in steps:
            fields = ["selected"]
            if step.status != S.PROPOSED:
                # A selected step that left `proposed` since the body was read
                # (expired, say) stays selected, so `outcome` counts it (§1.3).
                step.selected = step.pk in selected
            elif step.pk in selected:
                step.selected = True
                if step.pk in edits and edits[step.pk] != step.payload:
                    step.payload = edits[step.pk]
                    step.edited_at = now
                    fields += ["payload", "edited_at"]
                    edited = True
            else:
                step.selected = False
                step.status = S.SKIPPED
                fields.append("status")
            step.save(update_fields=fields)
        bundle.status = B.RUNNING
        bundle.run_by = reader
        bundle.run_started_at = now
        bundle.run_finished_at = None
        update = ["status", "run_by", "run_started_at", "run_finished_at", "updated_at"]
        if edited:
            bundle.edited_at, bundle.edited_by = now, reader
            update += ["edited_at", "edited_by"]
        bundle.save(update_fields=update)
        audit.record(  # SOC2:LOG-01
            "agent_bundle.run_started",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"steps": sorted(selected), "edited": edited},
        )
    return bundle, None


def finish(bundle_id, reader, *, event="agent_bundle.run_finished", ran=()):
    with transaction.atomic():
        bundle = AgentBundle.objects.select_for_update(of=("self",)).get(pk=bundle_id)
        steps = list(bundle.steps.all())
        if guided.is_guided(steps) and any(step.status == S.PROPOSED for step in steps):
            # Guided agent: the bundle stays open while a question is still to ask.
            bundle.status = B.WAITING
        else:
            bundle.status = outcome(steps)
        bundle.run_finished_at = timezone.now()
        bundle.save(update_fields=["status", "run_finished_at", "updated_at"])
        counts = {}
        for step in steps:
            counts[step.status] = counts.get(step.status, 0) + 1
        audit.record(  # SOC2:LOG-01
            event,
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"status": bundle.status, "steps": counts},
        )
    # Contract §7: the notice goes to the run's runner as stored (a retry does
    # not claim the bundle, so that stays whoever ran it; none for Auto).
    failure_notice.tell(bundle.pk, bundle.run_by_id, ran)
    return bundle


def run_bundle(reader, pk, data):
    """Run `pk` as `reader` (contract §5.1). Raises Refused or 404."""
    bundle = settle_stuck(bundle_for(reader, pk))
    steps = list(
        bundle.steps.select_related("customer", "account", "organisation", "bundle").order_by(
            "position"
        )
    )
    waiting = [step for step in steps if step.status == S.PROPOSED]
    if bundle.status == B.WAITING and waiting and not any(may_decide(reader, s) for s in waiting):
        raise Refused(403, {"code": "CANT_RUN", "detail": CANT_RUN})
    now = timezone.now()
    if bundle.status == B.WAITING and bundle.refreshed_at is not None:
        rows = data.get("steps") if isinstance(data, dict) else None
        # Only whole numbers are step ids; anything else is parse_body's 400.
        named = {
            row["id"]
            for row in (rows if isinstance(rows, list) else [])
            if isinstance(row, dict)
            and isinstance(row.get("id"), int)
            and not isinstance(row.get("id"), bool)
        }
        if named - {step.pk for step in steps}:
            # D2-20: the panel was read before the steps were replaced.
            raise Refused(
                409,
                {
                    "code": "BUNDLE_REFRESHED",
                    "detail": REFRESHED,
                    "bundle": bundle_payload(bundle, reader),
                },
            )
    if bundle.status == B.WAITING and not read_expired(bundle, now):
        selected, edits = parse_body(steps, data, reader)
    else:
        selected, edits = set(), {}
    if any(s.kind in seats.JIRA_KINDS for s in steps):
        seats.warm(reader)  # R2D2-8: refreshed before any step's transaction opens
    bundle, refused = _claim(reader, pk, selected, edits, now)
    if refused is not None:
        raise refused
    outputs, ran = {}, []
    for step in bundle.steps.filter(selected=True, status=S.PROPOSED).order_by("position"):
        done = run_step(step.pk, reader, outputs)
        ran.append(done.pk)
        if done.status == S.APPLIED:
            outputs[done.position] = done.outputs
    return finish(bundle.pk, reader, ran=ran)


NOT_FAILED = "Only a failed step can be retried."
CANT_REJECT = "You can't reject this bundle."
CHOOSE_REASON = "Choose already handled, not relevant, wrong person or other."
LONG_NOTE = "Keep the note under 255 characters."
NOTE_LIMIT = 255


def _not_failed(bundle, reader):
    return Refused(
        409, {"code": "NOT_FAILED", "detail": NOT_FAILED, "bundle": bundle_payload(bundle, reader)}
    )


def retry_step(reader, pk, step_pk, data):
    """Retry one failed step under the bundle's lock (contract §5.2): 404,
    403 CANT_RUN_STEP, 409 NOT_FAILED, then 409 BUNDLE_RUNNING."""
    bundle = settle_stuck(bundle_for(reader, pk))
    step = (
        bundle.steps.select_related("customer", "account", "organisation")
        .filter(pk=step_pk)
        .first()
    )
    if step is None:
        # The same 404 as an unreadable bundle: a step elsewhere is never named.
        raise no_such_bundle()
    # SOC2:AUTH-02 only a reader who may decide the step retries it (D13)
    if not may_decide(reader, step):
        raise cant_run_step(step)
    if step.status != S.FAILED:
        raise _not_failed(bundle, reader)
    fields = (data.get("fields") if isinstance(data, dict) else None) or {}
    edited = None
    if fields:
        if not isinstance(fields, dict):
            raise Refused(400, {"steps": {str(step.pk): {"fields": [CANT_CHANGE]}}})
        allowed = set(editable_keys(step))
        wrong = {key: [CANT_CHANGE] for key in fields if key not in allowed}
        if wrong:
            raise Refused(400, {"steps": {str(step.pk): wrong}})
        try:
            edited = REGISTRY[step.kind].edit(step, fields, reader)
        except FieldErrors as exc:
            raise Refused(400, {"steps": {str(step.pk): exc.errors}}) from None
    if step.kind in seats.JIRA_KINDS:
        seats.warm(reader)  # R2D2-8: outside the retry's transaction, so the new pair commits
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        if bundle.status == B.RUNNING:
            raise Refused(
                409,
                {
                    "code": "BUNDLE_RUNNING",
                    "detail": f"{_name(bundle.run_by)} is running this.",
                    "bundle": bundle_payload(bundle, reader),
                },
            )
        fresh = locked(step.pk)
        if fresh.status != S.FAILED:
            # Another retry settled it between the read and the lock.
            raise _not_failed(bundle, reader)
        update = ["error"]
        fresh.error = ""
        if edited is not None and edited != fresh.payload:
            fresh.payload = edited
            fresh.edited_at = timezone.now()
            update += ["payload", "edited_at"]
            bundle.edited_at, bundle.edited_by = fresh.edited_at, reader
            bundle.save(update_fields=["edited_at", "edited_by", "updated_at"])
        fresh.save(update_fields=update)
        run_step(fresh.pk, reader, outputs_by_position(bundle), retry=True)
        audit.record(  # SOC2:LOG-01
            "agent_bundle.retried",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"step": step.pk},
        )
    return finish(bundle.pk, reader, event="agent_bundle.run_finished", ran=[step.pk])


STEP_NOT_WAITING = "Only a waiting step can be changed."
SEND_SOMETHING = "Send fields or selected."
ON_OR_OFF = "Choose on or off."


def _step_not_waiting(bundle, reader):
    return Refused(
        409,
        {
            "code": "STEP_NOT_WAITING",
            "detail": STEP_NOT_WAITING,
            "bundle": bundle_payload(bundle, reader),
        },
    )


def _edit(step, fields, reader):
    """`fields` checked against `step` as given: (errors, the edited payload)."""
    allowed = set(editable_keys(step))
    wrong = {key: [CANT_CHANGE] for key in fields if key not in allowed}
    if wrong:
        return wrong, None
    try:
        return {}, REGISTRY[step.kind].edit(step, fields, reader)
    except FieldErrors as exc:
        return exc.errors, None


def save_step(reader, pk, step_pk, data):
    """Save a waiting step's fields and tick (contract §4.1, D2-18). Order:
    404, 403 CANT_RUN_STEP, the 409s of §9.2, 409 STEP_NOT_WAITING, 400."""
    data = data if isinstance(data, dict) else {}
    bundle = settle_stuck(bundle_for(reader, pk))
    step = (
        bundle.steps.select_related("customer", "account", "organisation", "bundle")
        .filter(pk=step_pk)
        .first()
    )
    if step is None:
        raise no_such_bundle()
    # SOC2:AUTH-02 only a reader who may run the step changes it
    if not may_decide(reader, step):
        raise cant_run_step(step)
    now = timezone.now()
    refused = conflict(bundle, reader, now)
    if refused is not None:
        raise refused
    if step.status != S.PROPOSED:
        raise _step_not_waiting(bundle, reader)
    fields = data.get("fields")
    has_selected = "selected" in data
    if not has_selected and not (isinstance(fields, dict) and fields):
        raise Refused(400, {"steps": [SEND_SOMETHING]})
    errors, edited = {}, None
    if has_selected and not isinstance(data["selected"], bool):
        errors["selected"] = [ON_OR_OFF]
    if fields is not None and not isinstance(fields, dict):
        errors["fields"] = [CANT_CHANGE]
    elif fields:
        # A fast path: the edit is worked out again under the lock.
        wrong, edited = _edit(step, fields, reader)
        errors.update(wrong)
    if errors:
        raise Refused(400, {"steps": {str(step.pk): errors}})
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            raise refused
        try:
            fresh = locked(step.pk)
        except NotFound:
            # A Refresh removed the step after it was read (D2-20).
            raise _step_not_waiting(bundle, reader) from None
        if fresh.status != S.PROPOSED:
            raise _step_not_waiting(bundle, reader)
        if fields:
            # The step as it is now: another save or a Refresh's renumbering
            # between the read and the lock is kept, never written over.
            wrong, edited = _edit(fresh, fields, reader)
            if wrong:
                raise Refused(400, {"steps": {str(fresh.pk): wrong}})
        update = ["edited_at"]
        if edited is not None and edited != fresh.payload:
            fresh.payload = edited
            update.append("payload")
        if has_selected:
            fresh.selected = data["selected"]
            update.append("selected")
        fresh.edited_at = now
        fresh.save(update_fields=update)
        bundle.edited_at, bundle.edited_by = now, reader
        bundle.save(update_fields=["edited_at", "edited_by", "updated_at"])
        audit.record(  # SOC2:LOG-01 the keys only, never their text
            "agent_bundle.step_edited",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={
                "step": fresh.pk,
                "fields": sorted(fields or {}),
                "selected": data["selected"] if has_selected else None,
            },
        )
    return bundle


def reject_bundle(reader, pk, data):
    """Reject every waiting step with a reason (contract §5.3, D16). The note
    is stored on the bundle and each step, and never reaches the agent."""
    from .deciding import reject_locked

    data = data if isinstance(data, dict) else {}
    bundle = settle_stuck(bundle_for(reader, pk))
    waiting = list(
        bundle.steps.filter(status=S.PROPOSED).select_related("customer", "account", "organisation")
    )
    # SOC2:AUTH-02 rejecting a bundle needs the right to decide every waiting step (D16)
    if bundle.status == B.WAITING and waiting and not all(may_decide(reader, s) for s in waiting):
        raise Refused(403, {"code": "CANT_REJECT", "detail": CANT_REJECT})
    reason = data.get("reason")
    if reason not in AgentBundle.RejectReason.values:
        raise Refused(400, {"reason": [CHOOSE_REASON]})
    note = str(data.get("note") or "")
    if len(note) > NOTE_LIMIT:
        raise Refused(400, {"note": [LONG_NOTE]})
    now = timezone.now()
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            raise refused
        proposed = [
            locked(pk)
            for pk in bundle.steps.filter(status=S.PROPOSED)
            .order_by("position")
            .values_list("pk", flat=True)
        ]
        # SOC2:AUTH-02 re-checked under the lock: rights can change after the first read
        if not all(may_decide(reader, step) for step in proposed):
            raise Refused(403, {"code": "CANT_REJECT", "detail": CANT_REJECT})
        for step in proposed:
            reject_locked(step, reader, note)
        bundle.refresh_from_db()
        bundle.status = B.REJECTED
        bundle.reject_reason = reason
        bundle.reject_note = note
        bundle.rejected_by = reader
        bundle.save(
            update_fields=["status", "reject_reason", "reject_note", "rejected_by", "updated_at"]
        )
        audit.record(  # SOC2:LOG-01
            "agent_bundle.rejected",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            # The reason only: the note is a person's free text.
            metadata={"reason": reason},
        )
    return bundle


NOT_GUIDED = "Only a guided bundle is run one step at a time."
STOPPED = "Stopped by {name}."
CANT_STOP = "You can't stop this bundle."


def _not_guided(bundle, reader):
    return Refused(
        409, {"code": "NOT_GUIDED", "detail": NOT_GUIDED, "bundle": bundle_payload(bundle, reader)}
    )


def _not_next(bundle, reader, blocking):
    if blocking.status == S.FAILED:
        detail = f"Step {blocking.position} didn't run. Retry it first."
    else:
        detail = f"Answer step {blocking.position} first."
    return Refused(
        409,
        {
            "code": "NOT_NEXT",
            "detail": detail,
            "step": blocking.pk,
            "bundle": bundle_payload(bundle, reader),
        },
    )


def run_guided_step(reader, pk, step_pk, data):
    """Run one step of a guided bundle (guided agent spec §3,
    `POST /agents/bundles/<id>/steps/<step_id>/run/`): the next one, once
    every earlier step is applied or skipped. Order: 404, 403 CANT_RUN_STEP,
    the 409s of §9.2, 409 NOT_GUIDED, 409 STEP_NOT_WAITING, 409 NOT_NEXT,
    400. The bundle is open again afterwards while steps are still waiting."""
    data = data if isinstance(data, dict) else {}
    bundle = settle_stuck(bundle_for(reader, pk))
    step = (
        bundle.steps.select_related("customer", "account", "organisation", "bundle")
        .filter(pk=step_pk)
        .first()
    )
    if step is None:
        raise no_such_bundle()
    # SOC2:AUTH-02 only a reader who may decide the step runs it (D13)
    if not may_decide(reader, step):
        raise cant_run_step(step)
    now = timezone.now()
    refused = conflict(bundle, reader, now)
    if refused is not None:
        raise refused
    steps = list(bundle.steps.order_by("position"))
    if not guided.is_guided(steps):
        raise _not_guided(bundle, reader)
    if step.status != S.PROPOSED:
        raise _step_not_waiting(bundle, reader)
    blocking = guided.blocker(step, steps)
    if blocking is not None:
        raise _not_next(bundle, reader, blocking)
    fields = data.get("fields") or {}
    if not isinstance(fields, dict):
        raise Refused(400, {"steps": {str(step.pk): {"fields": [CANT_CHANGE]}}})
    if fields:
        # A fast path: the edit is worked out again under the lock.
        wrong, _edited = _edit(step, fields, reader)
        if wrong:
            raise Refused(400, {"steps": {str(step.pk): wrong}})
    if step.kind in seats.JIRA_KINDS:
        seats.warm(reader)  # R2D2-8: before any step's transaction opens
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            raise refused
        try:
            fresh = locked(step.pk)
        except NotFound:
            raise _step_not_waiting(bundle, reader) from None
        if fresh.status != S.PROPOSED:
            raise _step_not_waiting(bundle, reader)
        # SOC2:AUTH-02 re-checked under the lock: rights can change after the first read
        if not may_decide(reader, fresh):
            raise cant_run_step(fresh)
        blocking = guided.blocker(fresh, list(bundle.steps.order_by("position")))
        if blocking is not None:
            raise _not_next(bundle, reader, blocking)
        update, edited = ["selected"], False
        fresh.selected = True
        if fields:
            wrong, payload = _edit(fresh, fields, reader)
            if wrong:
                raise Refused(400, {"steps": {str(fresh.pk): wrong}})
            if payload != fresh.payload:
                fresh.payload, fresh.edited_at, edited = payload, now, True
                update += ["payload", "edited_at"]
        fresh.save(update_fields=update)
        bundle.status = B.RUNNING
        bundle.run_by = reader
        bundle.run_started_at = now
        bundle.run_finished_at = None
        changed = ["status", "run_by", "run_started_at", "run_finished_at", "updated_at"]
        if edited:
            bundle.edited_at, bundle.edited_by = now, reader
            changed += ["edited_at", "edited_by"]
        bundle.save(update_fields=changed)
        audit.record(  # SOC2:LOG-01
            "agent_bundle.run_started",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"steps": [fresh.pk], "edited": edited, "guided": True},
        )
    run_step(step.pk, reader, outputs_by_position(bundle))
    return finish(bundle.pk, reader, ran=[step.pk])


def stop_bundle(reader, pk):
    """Not now (guided agent spec §3, `POST /agents/bundles/<id>/stop/`):
    every waiting step is skipped ("Stopped by <name>.") and the bundle
    finishes. Order: 404, 403 CANT_STOP (the right to decide every waiting
    step, as Reject), the 409s of §9.2, 409 NOT_GUIDED."""
    bundle = settle_stuck(bundle_for(reader, pk))
    waiting = list(
        bundle.steps.filter(status=S.PROPOSED).select_related(
            "customer", "account", "organisation", "bundle"
        )
    )
    # SOC2:AUTH-02 stopping a bundle needs the right to decide every waiting step
    if bundle.status == B.WAITING and waiting and not all(may_decide(reader, s) for s in waiting):
        raise Refused(403, {"code": "CANT_STOP", "detail": CANT_STOP})
    now = timezone.now()
    refused = conflict(bundle, reader, now)
    if refused is not None:
        raise refused
    if not guided.guided(bundle):
        raise _not_guided(bundle, reader)
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            raise refused
        proposed = [
            locked(step_pk)
            for step_pk in bundle.steps.filter(status=S.PROPOSED)
            .order_by("position")
            .values_list("pk", flat=True)
        ]
        # SOC2:AUTH-02 re-checked under the lock: rights can change after the first read
        if not all(may_decide(reader, step) for step in proposed):
            raise Refused(403, {"code": "CANT_STOP", "detail": CANT_STOP})
        note = STOPPED.format(name=reader.name)
        for step in proposed:
            _skip(step, reader, Skipped(note))
        steps = list(bundle.steps.all())
        bundle.status = outcome(steps)
        if bundle.run_by_id is None:
            bundle.run_by = reader
            bundle.run_started_at = now
        bundle.run_finished_at = now
        bundle.save(
            update_fields=["status", "run_by", "run_started_at", "run_finished_at", "updated_at"]
        )
        counts = {}
        for row in steps:
            counts[row.status] = counts.get(row.status, 0) + 1
        audit.record(  # SOC2:LOG-01 counts only
            "agent_bundle.stopped",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"status": bundle.status, "skipped": len(proposed), "steps": counts},
        )
    return bundle
