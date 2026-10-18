from collections import defaultdict
from decimal import Decimal

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.permissions import CanViewAllAccounts
from services.brain import book as brain_book
from services.brain.http import ScopeRefusals, optional_scope
from services.copilot.anthropic_client import BudgetExceeded, CopilotNotConfigured
from services.customers.models import Account
from services.customers.personal import readable_evidence_q
from services.customers.scoping import sees_everything, visible_accounts, visible_customers

from .detect import DetectionStopped, detect
from .models import Anomaly, AnomalyEvidence


def _org_anomalies(request):
    return Anomaly.objects.filter(organisation=request.user.organisation)


def visible_evidence(organisation, viewer, *, anomaly=None, book=None):
    """Evidence this person may read: on an organisation or account they
    may open, and a record they may read (the shared rule in
    services.customers.personal). An account is its own rule: one under an
    organisation they may open can still be closed to them. `book`
    (services.brain.book.q) narrows to a Brain scope's book."""
    customer_ids = set(visible_customers(viewer).values_list("id", flat=True))
    # SOC2:AUTH-02 accounts by their own rule, not by their organisation's
    account_ids = set(visible_accounts(viewer).values_list("id", flat=True))
    rows = AnomalyEvidence.objects.filter(organisation=organisation)
    if anomaly is not None:
        rows = rows.filter(anomaly=anomaly)
    rows = rows.filter(Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids)).filter(
        readable_evidence_q(
            viewer,
            email=AnomalyEvidence.Kind.EMAIL,
            ticket=AnomalyEvidence.Kind.TICKET,
            call=AnomalyEvidence.Kind.CALL,
        )
    )
    if book is not None:
        rows = rows.filter(book)
    return rows.select_related("customer", "account")


def title_for(stored: str, companies: int, *, sees_all: bool) -> str:
    """The title one viewer may read.

    The stored title was written by a model from reports across the whole
    organisation, so it can describe companies outside this viewer's book
    (or count them). Only someone who sees every account gets it as
    written; everyone else gets one built from fields, counting only the
    companies they themselves can see behind it. The dashboard's attention
    list, Copilot's grounding, the MCP server and this API all read it
    through here, so they cannot drift apart."""
    if sees_all:
        return stored
    if companies == 0:
        # In-book evidence whose only company is outside the book (an
        # account owned here, under a customer owned elsewhere): there is
        # no company to count, so don't say "0 of your companies".
        return "Similar reports on your accounts"
    # "1 of your companies" is already singular-correct.
    return f"Similar reports across {companies} of your companies"


def summary_for(stored: str, *, sees_all: bool):
    """The summary one viewer may read: as written, or nothing."""
    return stored if sees_all else None


class Companies:
    """The companies behind a page of evidence, resolved once. `within`
    (services.brain.book.customers) keeps to a Brain scope's own customers."""

    def __init__(self, rows, organisation, viewer, *, within=None):
        self.field = organisation.effective_global_attributes()["arr"]
        openable = visible_customers(viewer)
        if within is not None:
            # SOC2:AUTH-02 in a scope, revenue counts the book's customers the reader may open
            openable = openable.filter(id__in=within)
        visible = {c.id: c for c in openable}
        self.customers = {
            row.customer_id: visible[row.customer_id] for row in rows if row.customer_id in visible
        }
        self.by_account = defaultdict(list)
        account_ids = {row.account_id for row in rows if row.account_id}
        if account_ids:
            for account in Account.objects.filter(id__in=account_ids).prefetch_related("customers"):
                for customer in account.customers.all():
                    if customer.id in visible:
                        self.by_account[account.id].append(visible[customer.id])

    def behind(self, rows) -> dict:
        out = {}
        for row in rows:
            if row.customer_id and row.customer_id in self.customers:
                out[row.customer_id] = self.customers[row.customer_id]
            elif row.account_id:
                for customer in self.by_account.get(row.account_id, []):
                    out[customer.id] = customer
        return out

    def arr_of(self, customer) -> Decimal:
        return Decimal(getattr(customer, self.field, 0) or 0)


def _row(anomaly, rows, companies, *, sees_all) -> dict:
    behind = companies.behind(rows)
    return {
        "id": anomaly.id,
        "title": title_for(anomaly.title, len(behind), sees_all=sees_all),
        "summary": summary_for(anomaly.summary, sees_all=sees_all),
        "status": anomaly.status,
        "arr": str(sum((companies.arr_of(c) for c in behind.values()), Decimal(0))),
        "companies": len(behind),
        "interactions": len(rows),
        "first_seen_at": anomaly.first_seen_at,
        "last_seen_at": anomaly.last_seen_at,
        "acknowledged_by": (
            {"id": anomaly.acknowledged_by.id, "name": anomaly.acknowledged_by.name}
            if anomaly.acknowledged_by_id
            else None
        ),
        "_behind": behind,
    }


def _evidence_row(row) -> dict:
    company = row.company
    return {
        "id": row.id,
        "kind": row.kind,
        "record_id": row.record_id,
        "snippet": row.snippet,
        "occurred_at": row.occurred_at,
        "company": {
            "type": "account" if row.account_id else "customer",
            "id": company.id,
            "name": company.name,
        },
    }


def rows_for(reader, *, status=None, scope=None):
    """The list's rows as `reader` reads them, most revenue first; with a
    Brain scope, over that scope's book. Titles are gated by `title_for`
    either way."""
    organisation = reader.organisation
    anomalies = Anomaly.objects.filter(organisation=organisation).select_related("acknowledged_by")
    if status:
        anomalies = anomalies.filter(status=status)
    evidence = list(visible_evidence(organisation, reader, book=brain_book.q(scope)))
    companies = Companies(evidence, organisation, reader, within=brain_book.customers(scope))
    by_anomaly = defaultdict(list)
    for row in evidence:
        by_anomaly[row.anomaly_id].append(row)
    sees_all = sees_everything(reader)
    out = []
    for anomaly in anomalies:
        mine = by_anomaly.get(anomaly.id)
        if not mine:
            continue
        row = _row(anomaly, mine, companies, sees_all=sees_all)
        row.pop("_behind")
        out.append(row)
    out.sort(key=lambda r: (-float(r["arr"]), -r["interactions"], r["title"]))
    return out


def detail_for(reader, anomaly, *, scope=None):
    """The detail body as `reader` reads it, or None when they can read no
    report on it (in the scope, with one)."""
    organisation = reader.organisation
    rows = list(visible_evidence(organisation, reader, anomaly=anomaly, book=brain_book.q(scope)))
    if not rows:
        return None
    companies = Companies(rows, organisation, reader, within=brain_book.customers(scope))
    row = _row(anomaly, rows, companies, sees_all=sees_everything(reader))
    behind = row.pop("_behind")
    hit = sorted(
        ({"id": c.id, "name": c.name, "arr": str(companies.arr_of(c))} for c in behind.values()),
        key=lambda c: -float(c["arr"]),
    )
    return {**row, "companies_hit": hit, "evidence": [_evidence_row(r) for r in rows]}


class AnomalyListView(ScopeRefusals, APIView):
    """GET /api/v1/anomalies/?status=&scope= — what is going wrong at several
    companies at once, most revenue first. `?scope=me|team|company` narrows
    the evidence to that Brain scope's book first; without it, as before.

    Open to any member, but every figure is their own: the revenue, the
    counts and the evidence cover the companies they may open and the
    records they may read. A cluster they can see nothing of is left out
    rather than shown as a zero, since its title was written from reports
    they may not read."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = optional_scope(request)
        wanted = request.query_params.get("status")
        if wanted and wanted not in Anomaly.Status.values:
            return Response({"detail": f"Unknown status {wanted!r}."}, status=400)
        return Response(rows_for(request.user, status=wanted, scope=scope))


class AnomalyDetailView(ScopeRefusals, APIView):
    """GET /api/v1/anomalies/<id>/?scope= — the cluster with the companies
    hit and the reports, as this reader may see them (in the scope's book,
    with one). PATCH its status, which is a leadership decision because it
    speaks for the whole company; it answers with the unscoped detail."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        scope = optional_scope(request)
        anomaly = get_object_or_404(_org_anomalies(request), pk=pk)
        payload = detail_for(request.user, anomaly, scope=scope)
        if payload is None:
            return Response({"detail": "No reports you can read."}, status=404)
        return Response(payload)

    def patch(self, request, pk):
        if not CanViewAllAccounts().has_permission(request, self):
            return Response({"detail": "Only leadership sets this."}, status=403)
        anomaly = get_object_or_404(_org_anomalies(request), pk=pk)
        wanted = request.data.get("status")
        if wanted not in Anomaly.Status.values:
            return Response({"detail": f"Unknown status {wanted!r}."}, status=400)
        anomaly.status = wanted
        anomaly.acknowledged_by = request.user
        anomaly.save(update_fields=["status", "acknowledged_by"])
        audit.record(
            "anomaly.update",
            request=request,
            target=anomaly,
            metadata={"status": wanted},
        )
        payload = detail_for(request.user, anomaly)
        if payload is None:
            return Response({"detail": "No reports you can read."}, status=404)
        return Response(payload)


class DetectView(APIView):
    """POST /api/v1/anomalies/detect/ — look now rather than tonight.
    Leadership only: naming a new cluster is a model call."""

    permission_classes = [IsAuthenticated, CanViewAllAccounts]

    def post(self, request):
        organisation = request.user.organisation
        if not organisation.ai_agent_enabled:
            return Response({"detail": "AI Copilot is disabled for your organisation."}, status=403)
        try:
            return Response(detect(organisation, actor=request.user, request=request))
        except DetectionStopped as stopped:
            code = (
                status.HTTP_429_TOO_MANY_REQUESTS
                if isinstance(stopped.cause, BudgetExceeded)
                else status.HTTP_503_SERVICE_UNAVAILABLE
                if isinstance(stopped.cause, CopilotNotConfigured)
                else status.HTTP_502_BAD_GATEWAY
            )
            return Response({**stopped.result, "detail": str(stopped.cause)}, status=code)
