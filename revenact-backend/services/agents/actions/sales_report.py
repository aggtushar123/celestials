"""report.sales ("Prepare the sales report", sales review report spec §4):
the report for tomorrow's sales review, read from the Pipelines book as the
meeting's organiser (the bundle's only reader and runner) and stored on the
step. Workspace-level, made only by the daily check (`sales_review`), never
by the nightly pass or a message's read. Not irreversible: Undo discards the
stored report."""

from django.db import transaction

from core import audit
from services.metrics.models import AgentAction

from .. import sales_review
from ..kinds import ASK, Invalid, Kind, Stale

S = AgentAction.Status
REPORT_URL = "/api/v1/agents/bundles/{bundle}/steps/{step}/report/"


def validate(payload, row, ctx, evidence):
    # Only the daily check makes it (`sales_review.make_bundle`), never a model.
    raise Invalid("only the daily check prepares a sales report")


def target(payload):
    return sales_review.target_for(payload["meeting_key"])


def _meeting(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {"title": str(payload.get("title") or ""), "starts_at": payload.get("starts_at")}


def stored(action):
    """The stored report, or None (not run, or discarded by Undo)."""
    result = action.result if isinstance(action.result, dict) else {}
    report = result.get("report")
    return report if action.status == S.APPLIED and isinstance(report, dict) else None


def preview(action, reader):
    report = stored(action)
    if report is not None:
        own = (action.result or {}).get("ran_by") == reader.pk
        totals = report.get("totals") or {}
        return {
            "sales_report": {
                "meeting": _meeting(action),
                "period": report.get("period"),
                "counts": {
                    "won": totals.get("won_count", 0),
                    "lost": totals.get("lost_count", 0),
                    "closing": totals.get("closing_count", 0),
                    "open": totals.get("open_count", 0),
                },
                # SOC2:AUTH-02 the report was read as its runner: theirs alone
                "report": report if own else None,
                "download_url": REPORT_URL.format(bundle=action.bundle_id, step=action.pk)
                if own
                else None,
            }
        }
    start, end = sales_review.period_for(action.organisation)
    return {
        "sales_report": {
            "meeting": _meeting(action),
            "period": {"from": start.isoformat(), "to": end.isoformat()},
            "counts": sales_review.counts(reader, action.organisation),
            "report": None,
            "download_url": None,
        }
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person prepares the report")
    report = sales_review.prepare(action.organisation, actor)
    totals = report["totals"]
    with transaction.atomic():
        audit.record(  # SOC2:LOG-01 counts and ids only: never a deal, a figure or the summary
            "sales_report.prepared",
            actor=actor,
            organisation=action.organisation,
            target=action,
            target_repr=f"Action {action.pk}",
            metadata={
                "agent_step": action.pk,
                "bundle": action.bundle_id,
                "won": totals["won_count"],
                "lost": totals["lost_count"],
                "closing": totals["closing_count"],
                "summary": bool(report["summary"]),
            },
        )
    return {"prepared": True}, {"ran_by": actor.pk, "report": report}


def undo(action, actor):
    """Discard the stored report (the download is 404 afterwards)."""
    action.result = {"ran_by": (action.result or {}).get("ran_by"), "discarded": True}
    action.save(update_fields=["result"])


REPORT = Kind(
    key=AgentAction.Kind.REPORT_SALES,
    label="Prepare the sales report",
    example="Prepare the sales report for tomorrow's sales review",
    max_level=ASK,
    agents=(AgentAction.Agent.SALES,),
    validate=validate,
    target=target,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    per_reader=True,
    texts=lambda payload: [],
    # Never on the nightly pass or a message's read: the daily check makes it.
    message_only=True,
)
