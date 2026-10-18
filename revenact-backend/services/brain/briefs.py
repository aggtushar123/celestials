"""A brief per scope (§1.5): kept until the numbers move or a newer
comparison point lands, written on demand, once at a time.

Me and My team briefs may name the scope's customers: only their owner reads
them (`team:<id>` resolves for that person alone). The Company brief is
today's prompt — figures, cuts and member names — so one Company brief is
safe for every Company reader.
"""

from core import audit
from services.metrics import brief as metrics_brief
from services.metrics.models import Brief
from services.metrics.signals import brief_digest

from . import changed, locks
from .exposure import customer_line, exposure
from .metrics import figures
from .payloads import READ_DEPTH, brief_payload, first_readable, is_stale

CUSTOMER_LIMIT = 6


def latest(scope, reader):
    rows = list(
        Brief.objects.filter(
            organisation=scope.actor.organisation, scope_key=scope.stored_key
        ).select_related("generated_by")[:READ_DEPTH]
    )
    # A brief that never named customers (every Company brief) is readable by
    # anyone who may use the scope.
    return first_readable(rows, reader, lambda row: row.evidence.get("customer_ids", []))


def read(scope, reader, today):
    row = latest(scope, reader)
    if row is None:
        return None
    figs = figures(scope)
    since = changed.compare(scope, figs, today, record=False).since
    return brief_payload(row, scope, stale=is_stale(row, brief_digest(figs.values), since))


def evidence(scope, reader, figs, comparison):
    customers = None
    if not scope.is_company:
        named, _hidden = exposure(scope, reader, limit=CUSTOMER_LIMIT)
        customers = [customer_line(row) for row in named]
    return metrics_brief.evidence_from(
        scope.actor.organisation,
        values=figs.values,
        slices=figs.slices,
        previous=comparison.previous if comparison.since else {},
        baseline=comparison.since,
        signals=changed.moves(scope, figs, comparison),
        scope_label=None if scope.is_company else scope.label,
        customers=customers,
    )


def write(scope, request, *, requested_at, today):
    """Write the scope's brief under its lock. Returns `(brief, created)`:
    a request that waited for another one's write gets that brief back
    (`created=False`) instead of paying for a second. NothingToBrief and the
    model failures propagate; the previous brief stays either way.

    The lock (`locks.held`) is a session-level advisory lock, not a
    transaction: `generate_brief`'s own writes — the ModelCall row, any
    credit charge or refund, the Brief itself — each commit on their own as
    they happen, so the real model call this holds the lock across never
    also holds open a database transaction (and the row locks inside it,
    notably the organisation's BillingAccount) for its whole duration."""
    reader = request.user
    organisation = scope.actor.organisation
    with locks.held(organisation.id, f"brief:{scope.stored_key}"):
        newest = (
            Brief.objects.filter(organisation=organisation, scope_key=scope.stored_key)
            .select_related("generated_by")
            .first()
        )
        if newest is not None and newest.generated_at > requested_at:
            return newest, False
        figs = figures(scope)
        comparison = changed.compare(scope, figs, today, request=request)
        current = brief_digest(figs.values)
        stale_before = newest is not None and is_stale(newest, current, comparison.since)
        prompt_evidence = evidence(scope, reader, figs, comparison)
        row = metrics_brief.generate_brief(
            organisation,
            generated_by=reader,
            evidence=prompt_evidence,
            scope_key=scope.stored_key,
            figures_digest=current,
        )
        # SOC2:LOG-01 ids and the scope key only, never figures or text
        audit.record(
            "brain.brief_written",
            request=request,
            target=row,
            metadata={"scope": scope.stored_key, "stale_before": stale_before},
        )
    return row, True
