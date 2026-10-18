from django.db import transaction
from django.http import Http404
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

from .gather import Companies, GatherStopped, gather, recentre, summarise, visible_evidence
from .models import FeatureRequest, RequestEvidence
from .serializers import FeatureRequestWriteSerializer, evidence_row, request_row


def _org_requests(request):
    return FeatureRequest.objects.filter(organisation=request.user.organisation).select_related(
        "owner"
    )


def rows_for(reader, *, status=None, scope=None):
    """The list's rows as `reader` reads them, most revenue first. With a
    Brain scope, evidence is narrowed to the scope's book before revenue
    and counts are worked out, and a request with none left is dropped."""
    organisation = reader.organisation
    features = FeatureRequest.objects.filter(organisation=organisation).select_related("owner")
    if status:
        features = features.filter(status=status)
    evidence = list(visible_evidence(organisation, reader, book=brain_book.q(scope)))
    companies = Companies(evidence, organisation, reader, within=brain_book.customers(scope))
    by_request = {}
    for row in evidence:
        by_request.setdefault(row.request_id, []).append(row)
    out = [
        request_row(feature, summarise(by_request[feature.id], companies))
        for feature in features
        if feature.id in by_request
    ]
    out.sort(key=lambda r: (-float(r["arr"]), -r["interactions"], r["title"]))
    return out


def detail_for(reader, feature, *, scope=None):
    """The detail body as `reader` reads it, or None when they have no
    evidence for it (in the scope, with one)."""
    organisation = reader.organisation
    rows = list(visible_evidence(organisation, reader, request=feature, book=brain_book.q(scope)))
    if not rows:
        return None
    companies = Companies(rows, organisation, reader, within=brain_book.customers(scope))
    summary = summarise(rows, companies)
    asking = sorted(
        (
            {"id": c.id, "name": c.name, "arr": str(companies.arr_of(c))}
            for c in summary["customers"].values()
        ),
        key=lambda c: -float(c["arr"]),
    )
    return {
        **request_row(feature, summary),
        # `companies` stays the count from request_row; the list is
        # its own field so one name never means two shapes.
        "companies_asking": asking,
        "evidence": [evidence_row(r) for r in rows],
    }


class FeatureRequestListView(ScopeRefusals, APIView):
    """GET /api/v1/requests/?status=&scope= — every request the reader has
    evidence for, with the revenue and counts computed over the companies
    they may open, most revenue first. `?scope=me|team|company` narrows the
    evidence to that Brain scope's book first; without it, as before.

    A request whose evidence is all outside their book is left out entirely
    rather than shown with a zero: its title and summary were written from
    records they may not read."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = optional_scope(request)
        wanted = request.query_params.get("status")
        if wanted and wanted not in FeatureRequest.Status.values:
            return Response({"detail": f"Unknown status {wanted!r}."}, status=400)
        return Response(rows_for(request.user, status=wanted, scope=scope))


class FeatureRequestDetailView(ScopeRefusals, APIView):
    """GET /api/v1/requests/<id>/?scope= — the request with the evidence and
    the companies asking that this reader may see (in the scope's book,
    with one). A request they have no evidence for is a 404, the same "404,
    not an empty page" rule the customer-scoped views use.

    PATCH title, summary, status, owner — leadership only, audited; it
    answers with the unscoped detail."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        scope = optional_scope(request)
        feature = get_object_or_404(_org_requests(request), pk=pk)
        payload = detail_for(request.user, feature, scope=scope)
        if payload is None:
            raise Http404("No evidence you can read.")
        return Response(payload)

    def patch(self, request, pk):
        if not CanViewAllAccounts().has_permission(request, self):
            return Response({"detail": "Only leadership curates requests."}, status=403)
        feature = get_object_or_404(_org_requests(request), pk=pk)
        serializer = FeatureRequestWriteSerializer(
            feature, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit.record(
            "request.update",
            request=request,
            target=feature,
            # Only what the serializer accepted: a client may send anything.
            metadata={key: str(value) for key, value in serializer.validated_data.items()},
        )
        payload = detail_for(request.user, feature)
        if payload is None:
            raise Http404("No evidence you can read.")
        return Response(payload)


class GatherView(APIView):
    """POST /api/v1/requests/gather/ — file every unfiled classified ask:
    into an existing request when one is close, else into new titled
    requests (one model call each). Leadership only: it spends credits."""

    permission_classes = [IsAuthenticated, CanViewAllAccounts]

    def post(self, request):
        organisation = request.user.organisation
        if not organisation.ai_agent_enabled:
            return Response({"detail": "AI Copilot is disabled for your organisation."}, status=403)
        try:
            return Response(gather(organisation, actor=request.user, request=request))
        except GatherStopped as stopped:
            code = (
                status.HTTP_429_TOO_MANY_REQUESTS
                if isinstance(stopped.cause, BudgetExceeded)
                else status.HTTP_503_SERVICE_UNAVAILABLE
                if isinstance(stopped.cause, CopilotNotConfigured)
                else status.HTTP_502_BAD_GATEWAY
            )
            return Response({**stopped.result, "detail": str(stopped.cause)}, status=code)


class MergeView(APIView):
    """POST /api/v1/requests/<id>/merge/ {into} — move every piece of
    evidence to `into` and delete this request. Leadership only."""

    permission_classes = [IsAuthenticated, CanViewAllAccounts]

    def post(self, request, pk):
        source = get_object_or_404(_org_requests(request), pk=pk)
        target = get_object_or_404(_org_requests(request), pk=request.data.get("into") or 0)
        if source.id == target.id:
            return Response({"detail": "A request cannot be merged into itself."}, status=400)
        with transaction.atomic():
            moved = source.evidence.update(request=target)
            audit.record(
                "request.merge",
                request=request,
                target=target,
                metadata={"from": source.title, "into": target.title, "evidence": moved},
            )
            source.delete()
            # Without this the merge would undo itself: the survivor's
            # centroid would still not match the asks folded into it.
            recentre(target)
        return Response({"id": target.id, "moved": moved})


class EvidenceMoveView(APIView):
    """POST /api/v1/requests/evidence/<id>/move/ {request} — refile one ask."""

    permission_classes = [IsAuthenticated, CanViewAllAccounts]

    def post(self, request, pk):
        row = get_object_or_404(
            RequestEvidence.objects.filter(organisation=request.user.organisation), pk=pk
        )
        target = get_object_or_404(_org_requests(request), pk=request.data.get("request") or 0)
        was = row.request
        row.request, row.dismissed = target, False
        row.save(update_fields=["request", "dismissed"])
        audit.record(
            "request.evidence_move",
            request=request,
            target=target,
            metadata={"evidence": row.id, "from": was.title if was else None, "into": target.title},
        )
        recentre(target)
        if was and was.id != target.id:
            recentre(was)
        return Response(evidence_row(row))


class EvidenceDismissView(APIView):
    """POST /api/v1/requests/evidence/<id>/dismiss/ — not a feature request
    after all; it stays filed as dismissed so gather leaves it alone."""

    permission_classes = [IsAuthenticated, CanViewAllAccounts]

    def post(self, request, pk):
        row = get_object_or_404(
            RequestEvidence.objects.filter(organisation=request.user.organisation), pk=pk
        )
        was = row.request
        row.request, row.dismissed = None, True
        row.save(update_fields=["request", "dismissed"])
        audit.record(
            "request.evidence_dismiss",
            request=request,
            target=was,
            metadata={"evidence": row.id, "kind": row.kind, "from": was.title if was else None},
        )
        if was:
            recentre(was)
        return Response({"id": row.id, "dismissed": True})
