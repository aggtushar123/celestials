"""The Brain over the API, for every member.

`IsAuthenticated` only: the reader's scope (services/brain/scope.py), not a
capability, decides which figures come back, and `resolve` refuses a scope
the reader may not use before anything is computed. The whole-organisation
`/api/v1/metrics/` routes stay gated on view_all_accounts and unchanged.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.metrics.brief import NothingToBrief
from services.metrics.explain import NothingToExplain
from services.metrics.models import Initiative
from services.metrics.registry import BY_KEY

from . import briefs, changed, customers, doing, explanations, graph, initiatives
from .http import ScopeRefusals
from .payloads import brief_payload, explanation_payload
from .scope import LABELS, ScopeNotAllowed, available, default_key, resolve

#: The AI refusals, as today's BriefGenerateView and MetricExplainView map them.
REFUSALS = (
    (NothingToBrief, status.HTTP_422_UNPROCESSABLE_ENTITY),
    (NothingToExplain, status.HTTP_422_UNPROCESSABLE_ENTITY),
    (BudgetExceeded, status.HTTP_429_TOO_MANY_REQUESTS),
    (CopilotNotConfigured, status.HTTP_503_SERVICE_UNAVAILABLE),
    (CopilotRequestFailed, status.HTTP_502_BAD_GATEWAY),
    (ValueError, status.HTTP_502_BAD_GATEWAY),
)
REFUSED = tuple(kind for kind, _code in REFUSALS)


def refusal(exc):
    for kind, code in REFUSALS:
        if isinstance(exc, kind):
            return Response({"detail": str(exc)}, status=code)
    raise exc


class BrainView(ScopeRefusals, views.APIView):
    permission_classes = [IsAuthenticated]

    def scope(self, request):
        # SOC2:AUTH-02 every Brain read resolves the reader's own scope
        key = request.query_params.get("scope") or default_key(request.user)
        return resolve(request.user, key)


class ScopesView(BrainView):
    """GET /api/v1/brain/scopes/ — the reader's scopes, narrowest first."""

    def get(self, request):
        keys = available(request.user)
        return Response(
            {"scopes": [{"key": key, "label": LABELS[key]} for key in keys], "default": keys[-1]}
        )


class ChangedView(BrainView):
    """GET /api/v1/brain/changed/?scope= — the scope's figures against its
    comparison point. The first view of a Me or My team scope writes its
    baseline."""

    def get(self, request):
        scope = self.scope(request)
        return Response(changed.build(scope, timezone.localdate(), request=request))


class BriefView(BrainView):
    """GET /api/v1/brain/brief/?scope= — the scope's kept brief, or null.
    POST — write one now (a paid model call): 201 with the new brief, 200
    with the one another request wrote while this one waited."""

    def get(self, request):
        scope = self.scope(request)
        return Response({"brief": briefs.read(scope, request.user, timezone.localdate())})

    def post(self, request):
        requested_at = timezone.now()
        scope = self.scope(request)
        try:
            row, created = briefs.write(
                scope, request, requested_at=requested_at, today=timezone.localdate()
            )
        except REFUSED as exc:
            return refusal(exc)
        return Response(
            {"brief": brief_payload(row, scope, stale=False)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ExplanationView(BrainView):
    """GET /api/v1/brain/explanations/<metric>/?scope= — the scope's kept
    explanation of one metric, or null. POST — write one now (a paid model
    call), 201 / 200 as for briefs. The scope is checked before the metric."""

    def unknown(self, metric):
        if metric not in BY_KEY:
            return Response({"detail": "No such metric."}, status=status.HTTP_404_NOT_FOUND)
        return None

    def get(self, request, metric):
        scope = self.scope(request)
        if missing := self.unknown(metric):
            return missing
        payload = explanations.read(scope, request.user, metric, timezone.localdate())
        return Response({"explanation": payload})

    def post(self, request, metric):
        requested_at = timezone.now()
        scope = self.scope(request)
        if missing := self.unknown(metric):
            return missing
        try:
            row, created = explanations.write(
                scope, request, metric, requested_at=requested_at, today=timezone.localdate()
            )
        except REFUSED as exc:
            return refusal(exc)
        return Response(
            {"explanation": explanation_payload(row, scope, stale=False)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DoingView(BrainView):
    """GET /api/v1/brain/doing/?scope= — what is being done about the
    scope's numbers: its initiatives, plans and rules at work, each naming
    only what the reader may open (plans they can't are counted in
    `hidden`)."""

    def get(self, request):
        scope = self.scope(request)
        return Response(doing.build(request.user, scope, timezone.localdate()))


class InitiativeCreateView(BrainView):
    """POST /api/v1/brain/initiatives/?scope=me|team — an initiative on one
    person's book (the reader's in Me; the reader's or a report's in My
    team), tracking the owner cut of a metric that has one. Company
    initiatives stay on /api/v1/metrics/initiatives/."""

    def post(self, request):
        scope = self.scope(request)
        if scope.is_company:
            return Response(
                {"code": ScopeNotAllowed.code, "detail": initiatives.COMPANY_ELSEWHERE},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            row = initiatives.start(request.user, scope, request.data, request=request)
        except initiatives.NotTrackable:
            return Response(
                {"detail": initiatives.NOT_TRACKABLE}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            doing.initiative_payload(request.user, row.pk, timezone.localdate()),
            status=status.HTTP_201_CREATED,
        )


class InitiativeDetailView(BrainView):
    """PATCH /api/v1/brain/initiatives/<id>/ — the initiative's owner, anyone
    above them, or view_all_accounts (`initiatives.edited_as`); anyone else
    in the organisation 403, another organisation's 404."""

    def patch(self, request, pk):
        initiative = get_object_or_404(
            Initiative.objects.filter(organisation_id=request.user.organisation_id), pk=pk
        )
        # SOC2:AUTH-02 the same rule every row's can_edit asks
        edited_as = initiatives.edited_as(request.user, initiative)
        if edited_as is None:
            return Response({"detail": initiatives.NOT_EDITOR}, status=status.HTTP_403_FORBIDDEN)
        initiatives.edit(initiative, request.data, edited_as=edited_as, request=request)
        return Response(doing.initiative_payload(request.user, initiative.pk, timezone.localdate()))


class CustomersView(BrainView):
    """GET /api/v1/brain/customers/?scope= — what the scope's customers are
    asking for, what is going wrong across them, how they score us and who
    turned negative: revenue and scores only over records the reader may
    open, comments on the rest counted in `hidden`."""

    def get(self, request):
        scope = self.scope(request)
        return Response(customers.build(request.user, scope, timezone.localdate()))


class GraphView(BrainView):
    """GET /api/v1/brain/graph/?scope= — the knowledge graph for the scope,
    for every member: the scope's customers the reader may open (the rest
    counted in `hidden`), its open initiatives and waiting proposals. The
    whole-organisation /api/v1/metrics/graph/ stays view_all_accounts."""

    def get(self, request):
        scope = self.scope(request)
        return Response(graph.build(request.user, scope, timezone.localdate()))
