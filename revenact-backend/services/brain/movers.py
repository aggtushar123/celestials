"""The accounts behind a metric: for each metric whose figure is counted
over a set of customers, that set, by the rule the metric itself uses.

- Accounts / ARR going dark: `activity_tracking.dark_accounts`, the list the
  KPI sums.
- Customers in poor health: `health_category` reads Poor; Book in good
  health: those that don't read Good (the share's other side).
- Shelfware ARR / ARR at capacity: `usage.shelfware_rows` / `capacity_rows`.

ARR at risk is not here: its accounts are `exposure.exposure`, counted as
the reader (§1.6). Metrics with no account-level rule (ratios of the whole
book, tickets, questions) have no entry.

Every rule runs once over the scope's book (`filtered_customers(scope.actor)`,
the same live book each metric's source reads), whatever moved, so the cost
is the same for one move as for many. `split` then names only the customers
the **reader** may open (SOC2:AUTH-02) and counts the rest."""

from services.customers import activity_tracking, usage
from services.customers.contact import last_contact_by_customer
from services.customers.models import Customer
from services.customers.scoping import visible_customers
from services.fx_rates.conversion import rates_for

DARK = ("dark_accounts", "dark_arr")


def _entry(customer, arr, detail):
    return {
        "id": customer.id,
        "name": customer.name,
        "owner": customer.owner.name if customer.owner_id else "Unassigned",
        "arr": arr,
        "detail": detail,
    }


def _silence(days):
    return "no contact logged" if days is None else f"no contact in {days} days"


def accounts_by_metric(scope, today, money):
    """`{metric key: [entry]}`, each list in its rule's own order; an entry
    is `{id, name, owner, arr, detail}`. `money(value)` writes an amount."""
    organisation = scope.actor.organisation
    customers = list(activity_tracking.filtered_customers(scope.actor, {}))
    ids = [customer.pk for customer in customers]
    latest = last_contact_by_customer(ids) if ids else {}
    rows = usage.rows_for(customers, organisation)
    by_id = {row.customer.pk: row for row in rows}
    dark = [
        _entry(by_id[row["id"]].customer, row["arr"], _silence(row["days_since_contact"]))
        for row in activity_tracking.dark_accounts(
            customers, latest, today, organisation, rates_for(organisation)
        )
    ]

    def health(row):
        return _entry(row.customer, row.arr, f"health {row.customer.health_category}")

    by_arr = sorted(rows, key=lambda row: -(row.arr or 0))
    return {
        **dict.fromkeys(DARK, dark),
        "poor_health_count": [
            health(row)
            for row in by_arr
            if row.customer.health_category == Customer.HealthCategory.POOR
        ],
        "healthy_share": [
            health(row)
            for row in by_arr
            if row.customer.health_category != Customer.HealthCategory.GOOD
        ],
        "shelfware_arr": [
            _entry(
                row.customer,
                row.arr,
                f"{row.utilisation}% of seats used, shelfware {money(row.shelfware_arr)}",
            )
            for row in usage.shelfware_rows(rows)
        ],
        "at_capacity_arr": [
            _entry(row.customer, row.arr, f"{row.utilisation}% of seats used")
            for row in usage.capacity_rows(rows)
        ],
    }


def split(reader, by_metric, *, limit):
    """For each metric: `(named, more, hidden)` — the first `limit` entries
    the reader may open, how many more they may open past that, and how many
    they may not. One query for every metric, whatever moved."""
    wanted = {entry["id"] for entries in by_metric.values() for entry in entries}
    # SOC2:AUTH-02 a customer is named only if the reader may open it
    openable = set()
    if wanted:
        openable = set(visible_customers(reader).filter(id__in=wanted).values_list("id", flat=True))
    out = {}
    for key, entries in by_metric.items():
        readable = [entry for entry in entries if entry["id"] in openable]
        out[key] = (
            readable[:limit],
            len(readable) - len(readable[:limit]),
            len(entries) - len(readable),
        )
    return out
