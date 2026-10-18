"""Why one number is where it is, per scope (§1.6).

Same prompt as the metric layer's, built from the scope's figures and cuts.
The accounts it names are those carrying the scope's downside that the
**reader** may open; the rest are a count. A stored explanation is shown
only to a reader who may open every customer it names.
"""

from core import audit
from services.customers.scoping import live_customers
from services.metrics import explain as metrics_explain
from services.metrics.explain import EXPOSURE_LIMIT, NothingToExplain, account_line
from services.metrics.models import Explanation
from services.metrics.signals import explanation_digest

from . import changed, locks
from .exposure import exposure
from .metrics import figures
from .payloads import READ_DEPTH, explanation_payload, first_readable, is_stale


def lock_key(scope, metric):
    return f"explanation:{scope.stored_key}:{metric}"


def latest(scope, reader, metric):
    rows = list(
        Explanation.objects.filter(
            organisation=scope.actor.organisation, scope_key=scope.stored_key, metric=metric
        ).select_related("generated_by")[:READ_DEPTH]
    )
    # None for a row written before the named ids were recorded.
    return first_readable(rows, reader, lambda row: row.inputs.get("customer_ids"))


def _digest(figs, metric):
    return explanation_digest(figs.values[metric], figs.slices.get(metric, {}))


def stale(row, figs, since):
    """The scope's figures for the row's metric moved since it was written,
    or a newer comparison point exists — read only, nothing is written."""
    return is_stale(row, _digest(figs, row.metric), since)


def read(scope, reader, metric, today):
    row = latest(scope, reader, metric)
    if row is None:
        return None
    figs = figures(scope)
    since = changed.compare(scope, figs, today, record=False).since
    return explanation_payload(row, scope, stale=stale(row, figs, since))


def evidence(scope, reader, metric, figs, comparison):
    if not live_customers(scope.actor).exists():
        raise NothingToExplain("There are no live customers here, so there is nothing to explain.")
    named, hidden = exposure(scope, reader, limit=EXPOSURE_LIMIT)
    compared = comparison.since is not None
    return metrics_explain.evidence_from(
        scope.actor.organisation,
        metric,
        value=figs.values[metric],
        previous_value=comparison.previous.get(metric) if compared else None,
        baseline=comparison.since,
        cuts=figs.slices.get(metric, {}),
        previous_cuts=comparison.previous_slices.get(metric, {}) if compared else {},
        accounts=[account_line(row) for row in named],
        hidden=hidden,
        customer_ids=[row["id"] for row in named],
    )


def write(scope, request, metric, *, requested_at, today):
    """Write the scope's explanation of `metric` under its lock. Returns
    `(explanation, created)`: a request that waited for another one's write
    gets that explanation back (`created=False`) instead of paying for a
    second — but only if this *reader* may open every customer that row
    names; Company exposure differs per reader (§1.6), so a row a wider
    reader's write just produced may still be unreadable by this one, and
    this reader pays for its own write instead. NothingToExplain and the
    model failures propagate; the previous explanation stays either way.

    The lock (`locks.held`) is a session-level advisory lock, not a
    transaction: `explain`'s own writes — the ModelCall row, any credit
    charge or refund, the Explanation itself — each commit on their own as
    they happen, so the real model call this holds the lock across never
    also holds open a database transaction (and the row locks inside it,
    notably the organisation's BillingAccount) for its whole duration."""
    reader = request.user
    organisation = scope.actor.organisation
    with locks.held(organisation.id, lock_key(scope, metric)):
        # SOC2:AUTH-02 a row written while this request waited is only
        # handed back if *this* reader may open every customer it names —
        # Company exposure differs per reader, so the row another, wider
        # reader's write just produced may still be unreadable by this one.
        candidates = list(
            Explanation.objects.filter(
                organisation=organisation,
                scope_key=scope.stored_key,
                metric=metric,
                generated_at__gt=requested_at,
            ).select_related("generated_by")[:READ_DEPTH]
        )
        waited = first_readable(candidates, reader, lambda row: row.inputs.get("customer_ids"))
        if waited is not None:
            return waited, False
        figs = figures(scope)
        comparison = changed.compare(scope, figs, today, request=request)
        prompt_evidence = evidence(scope, reader, metric, figs, comparison)
        row = metrics_explain.explain(
            organisation,
            metric,
            generated_by=reader,
            evidence=prompt_evidence,
            scope_key=scope.stored_key,
            figures_digest=_digest(figs, metric),
        )
        # SOC2:LOG-01 ids, the scope key and the metric key only
        audit.record(
            "brain.explanation_written",
            request=request,
            target=row,
            metadata={"scope": scope.stored_key, "metric": metric},
        )
    return row, True
