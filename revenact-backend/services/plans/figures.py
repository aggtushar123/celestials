"""A plan's record, in figures: its health score and ARR as the rest of the
app reads them (Brain delivery 3 spec §1.1). `start_plan` keeps them when a
plan starts; What's being done (`services/brain/doing.py`) reads them now.

A customer's ARR is the column the workspace's global-attribute mapping
names, converted into the workspace currency through the one conversion
hook (null when there is no rate, never an unconverted figure). An
account's ARR is `Account.arr`, already in the workspace currency (see
`accounts_portfolio.book`)."""

from decimal import Decimal

from services.customers.models import Customer
from services.fx_rates.conversion import convert_to_org_currency


def _number(value):
    return None if value is None else float(value)


def record_figures(record, organisation, rates=None):
    """`{"health_score", "arr"}` for a Customer or an Account. Pass `rates`
    (`fx_rates.conversion.rates_for`) when reading many customers."""
    if isinstance(record, Customer):
        column = organisation.effective_global_attributes()["arr"]
        arr = convert_to_org_currency(
            Decimal(getattr(record, column) or 0), record.currency, organisation, rates=rates
        )
    else:
        arr = record.arr
    return {"health_score": _number(record.health_score), "arr": _number(arr)}


def start_figures(record, organisation, today):
    """What `Plan.start_figures` keeps: the figures, the currency they are in
    and the day they were taken."""
    return {
        **record_figures(record, organisation),
        "currency": organisation.currency,
        "taken_on": today.isoformat(),
    }
