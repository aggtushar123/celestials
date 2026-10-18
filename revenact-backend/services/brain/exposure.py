"""The customers carrying a scope's downside, as the reader may name them.

Ranked by the forecast's own rule (`forecast.exposure_list`) over the
scope's book; then split by what the **reader** may open (§1.6): those are
named, the rest are only counted. Each customer's downside is counted as
the reader — the reader's pipeline departments, and account-level risks only
on accounts the reader may open — for Me, My team and Company alike, never
as the organisation (`SystemActor`)."""

from services.customers import forecast
from services.customers.scoping import visible_customers


def exposure(scope, reader, *, limit):
    named, _more, hidden = exposure_split(scope, reader, limit=limit)
    return named, hidden


def exposure_split(scope, reader, *, limit):
    """`(named, more, hidden)`: the first `limit` customers the reader may
    open, how many more they may open past those, and how many they may
    not."""
    organisation = scope.actor.organisation
    customers = list(forecast.filtered_customers(scope.actor, {}))
    # SOC2:AUTH-02 the downside a prompt names is what the reader may read
    rows = forecast.build_rows(
        customers, organisation, viewer=reader, horizon=forecast.horizon_days({})
    )
    ranked = forecast.exposure_list(rows, limit=len(rows))
    ids = [row["id"] for row in ranked]
    # SOC2:AUTH-02 a customer reaches the prompt only if the reader may open it
    openable = set(visible_customers(reader).filter(id__in=ids).values_list("id", flat=True))
    readable = [row for row in ranked if row["id"] in openable]
    return readable[:limit], len(readable[limit:]), len(ranked) - len(readable)


def customer_line(row):
    """One exposure row as the brief's customer entry."""
    return {
        "id": row["id"],
        "name": row["name"],
        "owner": row["owner"],
        "arr": row["arr"],
        "downside": row["downside"],
        "days_to_renewal": row["days_to_renewal"],
        "health": row["health_category"],
    }
