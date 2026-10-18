"""What moved materially since the last month-end, and what moved it.

One rule, read by the signals endpoint and by the management brief, so the
brief can never name a move the screen would not show.
"""

import hashlib
import json
from decimal import Decimal

from .models import MetricSnapshot
from .registry import DIMENSION_LABELS, METRICS, as_of, compute_all, compute_slices

#: What counts as a material move since the last month-end. Percent-unit
#: metrics move in points; money and counts move relative to where they were.
#: Deliberately blunt — the point is a short list a manager reads, not a
#: statistical test over one month of history.
SIGNAL_POINTS = 5.0
SIGNAL_RELATIVE = 0.10

#: How many drivers a signal names.
DRIVER_LIMIT = 5


def number(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


def digest(figures):
    """SHA-256 of `figures` as canonical JSON: what a stored brief or
    explanation was written from, so a later read can tell whether the
    numbers have moved since."""
    payload = json.dumps(figures, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def brief_digest(values):
    """Every metric's value, number-normalised."""
    return digest({key: number(value) for key, value in values.items()})


def explanation_digest(value, cuts):
    """One metric's value and each cut member's value — labels left out, so
    a renamed owner is not a move. `cuts` is `{dimension: [(member, label,
    value)]}`."""
    return digest(
        {
            "value": number(value),
            "cuts": {
                dimension: {member: number(v) for member, _label, v in members}
                for dimension, members in (cuts or {}).items()
            },
        }
    )


def describe(metric):
    return {
        "key": metric.key,
        "label": metric.label,
        "unit": metric.unit,
        "better": metric.better,
        "note": metric.note,
        # The cuts this metric has, so a screen can offer them without a
        # round of 404s.
        "dimensions": sorted(metric.slices),
    }


def material(metric, now, previous):
    if now is None or previous is None:
        return False
    if metric.unit == "percent":
        return abs(now - previous) >= SIGNAL_POINTS
    if previous == 0:
        return now != 0
    return abs(now - previous) / abs(previous) >= SIGNAL_RELATIVE


def latest_whole_org(organisation):
    """The most recent month-end row per metric, whole-org."""
    latest = {}
    for row in MetricSnapshot.objects.filter(
        organisation=organisation, dimension="", member=""
    ).order_by("metric", "-period_end"):
        latest.setdefault(row.metric, row)
    return latest


def latest_by_member(organisation, metric_key, dimension):
    """The most recent month-end row per member for one cut."""
    latest = {}
    for row in MetricSnapshot.objects.filter(
        organisation=organisation, metric=metric_key, dimension=dimension
    ).order_by("member", "-period_end"):
        latest.setdefault(row.member, row)
    return latest


def previous_from_snapshots(organisation):
    """The whole organisation's comparison point: `(baseline, previous,
    previous_slices)` from the latest month-end row per metric and per cut
    member — what Company's "What changed" reads."""
    latest = latest_whole_org(organisation)
    baseline = max((row.period_end for row in latest.values()), default=None)
    previous = {key: number(row.value) for key, row in latest.items()}
    cuts = {}
    rows = (
        MetricSnapshot.objects.filter(organisation=organisation)
        .exclude(dimension="")
        .order_by("metric", "dimension", "member", "-period_end")
    )
    for row in rows:
        members = cuts.setdefault(row.metric, {}).setdefault(row.dimension, {})
        members.setdefault(row.member, number(row.value))
    return baseline, previous, cuts


def signals_for(
    organisation,
    values=None,
    *,
    previous=None,
    previous_slices=None,
    slices=None,
    baseline=None,
):
    """The signals payload: `as_of`, `baseline`, `currency`, `signals`.

    `values` may be passed by a caller that has already run compute_all, so
    the brief doesn't pay for the rollups twice.

    With no `previous`, moves are measured from the whole organisation's
    latest month-end, as always. A Brain scope passes its own comparison
    point instead — `previous` `{key: number | None}`, `previous_slices`
    `{key: {dimension: {member: number | None}}}`, the `baseline` date they
    were taken on — together with its own current `slices`, so the same rule
    runs over the scope's book.
    """
    values = values if values is not None else compute_all(organisation)
    if previous is None:
        latest = latest_whole_org(organisation)
        baseline = max((row.period_end for row in latest.values()), default=None)
        previous = {key: number(row.value) for key, row in latest.items()}
        periods = {key: row.period_end for key, row in latest.items()}

        def member_values(key, dimension):
            rows = latest_by_member(organisation, key, dimension)
            return {member: number(row.value) for member, row in rows.items()}

    else:
        periods = {key: baseline for key in previous}

        def member_values(key, dimension):
            return (previous_slices or {}).get(key, {}).get(dimension, {})

    signals = []
    for metric in METRICS:
        now = number(values[metric.key])
        previous_value = previous.get(metric.key)
        if not material(metric, now, previous_value):
            continue
        change = round(now - previous_value, 4)
        improved = None if metric.better == "none" else (change > 0) == (metric.better == "up")

        drivers = []
        if metric.slices:
            if slices is None:
                slices = compute_slices(organisation)
            for dimension, members in slices.get(metric.key, {}).items():
                was_by_member = member_values(metric.key, dimension)
                for member, label, value in members:
                    was = was_by_member.get(member)
                    if value is None or was is None:
                        continue
                    move = round(number(value) - was, 4)
                    if move:
                        drivers.append(
                            {
                                "dimension": dimension,
                                "dimension_label": DIMENSION_LABELS[dimension],
                                "member": member,
                                "label": label,
                                "value": number(value),
                                "change": move,
                            }
                        )
            drivers.sort(key=lambda d: -abs(d["change"]))

        signals.append(
            {
                **describe(metric),
                "value": now,
                "previous": {
                    "period_end": periods[metric.key].isoformat(),
                    "value": previous_value,
                },
                "change": change,
                "improved": improved,
                "drivers": drivers[:DRIVER_LIMIT],
            }
        )

    # Bad news first, biggest relative move first within it.
    def rank(signal):
        rel = abs(signal["change"]) / abs(signal["previous"]["value"] or 1)
        return (signal["improved"] is not False, -rel)

    signals.sort(key=rank)
    return {
        "as_of": as_of().isoformat(),
        "baseline": baseline.isoformat() if baseline else None,
        "currency": organisation.currency,
        "signals": signals,
    }
