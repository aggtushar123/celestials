"""The sales report's one-page printable HTML (sales review report spec §5):
the stored snapshot rendered by a Django template with autoescape on, so
every name and the summary are escaped. Nothing is read again here: the page
shows exactly what the step stored when it ran."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.template.loader import render_to_string

from services.work.clock import zone_for

from .actions.sales_report import stored

TEMPLATE = "agents/sales_report.html"


def _day(value):
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _moment(value, zone, pattern):
    try:
        return datetime.fromisoformat(str(value or "")).astimezone(zone).strftime(pattern)
    except ValueError:
        return ""


def _money(value, currency):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        amount = Decimal(0)
    return f"{currency} {amount:,.0f}"


def _rows(rows, currency, day_key):
    return [
        {
            "name": row.get("name", ""),
            "record": (row.get("record") or {}).get("name", ""),
            "amount": _money(row.get("amount"), currency),
            "stage": row.get("stage_label", ""),
            "day": _day(row.get(day_key)),
        }
        for row in rows or []
    ]


def render(bundle, step):
    """(html, YYYY-MM-DD of the period's end) for the stored report, or None
    when there is none (not run, or discarded)."""
    report = stored(step)
    if report is None:
        return None
    currency = report.get("currency") or bundle.organisation.currency
    totals = report.get("totals") or {}
    period = report.get("period") or {}
    payload = step.payload if isinstance(step.payload, dict) else {}
    zone = zone_for(bundle.organisation)
    # Formatted here, in the workspace's timezone: the template's date filter
    # would turn an aware time into the server's.
    generated = _moment(report.get("generated_at"), zone, "%d %b %Y, %H:%M")
    starts = _moment(payload.get("starts_at"), zone, "%a %d %b, %H:%M")
    end = _day(period.get("to"))
    context = {
        "workspace": bundle.organisation.name,
        "meeting": payload.get("title") or "",
        "starts": starts,
        "start": _day(period.get("from")),
        "end": end,
        "generated": generated,
        "summary": report.get("summary") or "",
        "won": _rows(report.get("won"), currency, "closed_on"),
        "lost": _rows(report.get("lost"), currency, "closed_on"),
        "closing": _rows(report.get("closing"), currency, "closes_on"),
        "stages": [
            {
                "label": row.get("label", ""),
                "count": row.get("count", 0),
                "amount": _money(row.get("amount"), currency),
                "moved_in": row.get("moved_in", 0),
            }
            for row in report.get("stages") or []
        ],
        "totals": {
            "won_count": totals.get("won_count", 0),
            "won_amount": _money(totals.get("won_amount"), currency),
            "lost_count": totals.get("lost_count", 0),
            "lost_amount": _money(totals.get("lost_amount"), currency),
            "closing_count": totals.get("closing_count", 0),
            "closing_amount": _money(totals.get("closing_amount"), currency),
            "open_count": totals.get("open_count", 0),
            "open_amount": _money(totals.get("open_amount"), currency),
            "win_rate": totals.get("win_rate"),
        },
        "rows_cut": 20,
    }
    html = render_to_string(TEMPLATE, context)
    return html, (end.isoformat() if end else "report")
