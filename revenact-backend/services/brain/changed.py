"""What changed: a scope's figures now, against its comparison point.

Company compares with the whole organisation's latest month-end, as the
metric layer always has. Me and My team compare with their own latest
ScopeSnapshot (services/brain/history.py), and say when customers have been
handed in or out of the book since — by count and by the people they went
to, never by customer name.
"""

from dataclasses import dataclass
from datetime import date

from services.customers.models import Customer
from services.metrics.registry import METRICS, MONEY
from services.metrics.signals import material, previous_from_snapshots, signals_for

from . import history
from .metrics import figures
from .payloads import iso


@dataclass(frozen=True)
class Comparison:
    since: date | None
    since_kind: str
    team_changed_on: date | None
    #: {metric key: number | None}
    previous: dict
    #: {metric key: {dimension: {member: number | None}}}
    previous_slices: dict
    #: {"in", "out", "people"} when a customer moved; else None
    handover: dict | None


def _handover(scope, figs, row):
    was, now = set(row.customer_ids), set(figs.book)
    moved_in, moved_out = now - was, was - now
    if not moved_in and not moved_out:
        return None
    left = Customer.objects.filter(
        organisation=scope.actor.organisation, id__in=moved_out
    ).select_related("owner")
    people = sorted({c.owner.name if c.owner_id else "Unassigned" for c in left})
    return {"in": len(moved_in), "out": len(moved_out), "people": people}


def compare(scope, figs, today, *, record=True, request=None):
    """The scope's comparison point. `record=False` reads without writing a
    baseline (a GET of a stored brief only asks how old it is)."""
    if scope.is_company:
        baseline, previous, previous_slices = previous_from_snapshots(scope.actor.organisation)
        return Comparison(baseline, "month_end", None, previous, previous_slices, None)
    if record:
        row = history.comparison_point(scope, figs, today, request=request)
    else:
        row = history.latest(scope)
    if row is None:
        return Comparison(None, "baseline", None, {}, {}, None)
    return Comparison(
        since=row.taken_on,
        since_kind=row.kind,
        team_changed_on=history.team_changed_on(row),
        previous=row.values,
        previous_slices=row.slices,
        handover=_handover(scope, figs, row),
    )


def moves(scope, figs, comparison):
    """The material moves, in `signals_for`'s own shape — the same rule the
    metric layer runs, over the scope's book."""
    if comparison.since is None:
        return []
    return signals_for(
        scope.actor.organisation,
        figs.values,
        previous=comparison.previous,
        previous_slices=comparison.previous_slices,
        slices=figs.slices,
        baseline=comparison.since,
    )["signals"]


def _metric_row(metric, now, then):
    both = now is not None and then is not None
    return {
        "key": metric.key,
        "label": metric.label,
        "unit": metric.unit,
        "better": metric.better,
        "now": now,
        "then": then,
        "change": round(now - then, 4) if both else None,
        "material": material(metric, now, then),
    }


def _signal_row(signal, handover):
    row = {
        "key": signal["key"],
        "label": signal["label"],
        "unit": signal["unit"],
        "better": signal["better"],
        "now": signal["value"],
        "then": signal["previous"]["value"],
        "change": signal["change"],
        "improved": signal["improved"],
        "drivers": [
            {
                "dimension": d["dimension"],
                "member": d["member"],
                "label": d["label"],
                "change": d["change"],
            }
            for d in signal["drivers"]
        ],
    }
    if handover and signal["unit"] == MONEY:
        row["handover"] = handover
    return row


def build(scope, today, *, request=None, record=True):
    """The `changed/` body (§4). `record=False` (Ask on the Brain) reads the
    comparison point without writing a first-view baseline (`compare`)."""
    figs = figures(scope)
    comparison = compare(scope, figs, today, record=record, request=request)
    return payload(scope, today, figs, comparison)


def payload(scope, today, figs, comparison):
    """The `changed/` body from figures and a comparison already in hand, so
    a caller that also reads the cuts (Ask on the Brain) computes them once."""
    then = comparison.previous if comparison.since else {}
    return {
        "scope": scope.key,
        "as_of": today.isoformat(),
        "since": iso(comparison.since),
        "since_kind": comparison.since_kind,
        "team_changed_on": iso(comparison.team_changed_on),
        "currency": scope.actor.organisation.currency,
        "empty": figs.book is not None and not figs.book,
        "metrics": [
            _metric_row(metric, figs.values[metric.key], then.get(metric.key)) for metric in METRICS
        ],
        "signals": [_signal_row(s, comparison.handover) for s in moves(scope, figs, comparison)],
    }
