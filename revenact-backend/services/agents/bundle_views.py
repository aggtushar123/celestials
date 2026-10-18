"""The bundle routes (Agent bundles, contract §5, §10.5): detail, run,
retry, reject and History. 404 for a bundle the reader may not read (§8),
then 403, then the run's own refusals."""

from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.utils.urls import replace_query_param
from rest_framework.views import APIView

from core import audit
from services.customers.scoping import sees_everything
from services.metrics.models import AgentAction

from . import bundle_run
from .bundle_payloads import bundle_for, bundle_payload, bundle_payloads, no_such_bundle
from .bundles import others_personal_bundle_ids, readable
from .models import FINISHED, AgentBundle
from .policy import AGENTS
from .registry import REGISTRY
from .views import CHOOSE_AGENT, CHOOSE_KIND

HISTORY_PAGE = 50
CHOOSE_BUNDLE_STATUS = "Choose done, partly done, rejected, expired or superseded."


class BundleDetailView(APIView):
    """GET /api/v1/agents/bundles/<id>/."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(bundle_payload(bundle_for(request.user, pk), request.user))


class BundleRunView(APIView):
    """POST /api/v1/agents/bundles/<id>/run/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            bundle = bundle_run.run_bundle(request.user, pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleRetryView(APIView):
    """POST /api/v1/agents/bundles/<id>/steps/<step_id>/retry/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, step_pk):
        try:
            bundle = bundle_run.retry_step(request.user, pk, step_pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleStepRunView(APIView):
    """POST /api/v1/agents/bundles/<id>/steps/<step_id>/run/ (guided agent):
    one step of a guided bundle; body `{"fields": {...}}` optional."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, step_pk):
        try:
            bundle = bundle_run.run_guided_step(request.user, pk, step_pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleStopView(APIView):
    """POST /api/v1/agents/bundles/<id>/stop/ (guided agent: Not now)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            bundle = bundle_run.stop_bundle(request.user, pk)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleRejectView(APIView):
    """POST /api/v1/agents/bundles/<id>/reject/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            bundle = bundle_run.reject_bundle(request.user, pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleRefreshView(APIView):
    """POST /api/v1/agents/bundles/<id>/refresh/ (D2 contract §4.2)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from . import intake

        try:
            bundle = intake.refresh(request.user, pk)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleHandlerView(APIView):
    """PATCH /api/v1/agents/bundles/<id>/handler/ (Slack escalations D4, contract §4):
    the escalation panel's Change. Body `{"user_id": n}` or
    `{"user_id": null, "function": f}`; 200 `{"bundle": Bundle}`."""

    permission_classes = [IsAuthenticated]

    # Schema only: change_handler checks the body itself, in the contract's order.
    @extend_schema(
        request=inline_serializer(
            "BundleHandlerChange",
            {
                "user_id": serializers.IntegerField(allow_null=True),
                "function": serializers.CharField(required=False),
            },
        ),
        responses=OpenApiTypes.OBJECT,
    )
    def patch(self, request, pk):
        from .escalation import change_handler

        try:
            bundle = change_handler(request.user, pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleHistoryView(APIView):
    """GET /api/v1/agents/bundles/history/?agent=&step_kind=&status=&page=."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        rows = AgentBundle.objects.filter(
            organisation_id=request.user.organisation_id, status__in=FINISHED
        )
        errors = {}
        if "agent" in params:
            if params["agent"] in AGENTS:
                rows = rows.filter(agent=params["agent"])
            else:
                errors["agent"] = [CHOOSE_AGENT]
        if "step_kind" in params:
            if params["step_kind"] in REGISTRY:
                rows = rows.filter(
                    id__in=AgentAction.objects.filter(kind=params["step_kind"]).values("bundle_id")
                )
            else:
                errors["step_kind"] = [CHOOSE_KIND]
        if "status" in params:
            if params["status"] in FINISHED:
                rows = rows.filter(status=params["status"])
            else:
                errors["status"] = [CHOOSE_BUNDLE_STATUS]
        if errors:
            raise ValidationError(errors)
        # SOC2:AUTH-02 someone else's Slack or meeting bundle is neither shown nor counted
        rows = rows.exclude(id__in=others_personal_bundle_ids(request.user))
        # SOC2:AUTH-02 the bundle read rule; the rest counted, never named
        shown = readable(request.user, rows)
        count = shown.count()
        number = max(int(params["page"]) if str(params.get("page", "")).isdigit() else 1, 1)
        start = (number - 1) * HISTORY_PAGE
        page = list(
            shown.select_related(
                "customer", "account", "run_by", "edited_by", "routed_user", "rejected_by"
            ).order_by("-updated_at", "-id")[start : start + HISTORY_PAGE]
        )
        url = request.build_absolute_uri()
        return Response(
            {
                "count": count,
                "next": replace_query_param(url, "page", number + 1)
                if start + HISTORY_PAGE < count
                else None,
                "previous": replace_query_param(url, "page", number - 1) if number > 1 else None,
                "results": bundle_payloads(page, request.user, history=True),
                "hidden": self._hidden(request.user, rows, count),
            }
        )

    def _hidden(self, reader, rows, count):
        """Finished bundles the reader may not read: on records they can't
        open, or quoting a source they can't read (each counted once). A
        workspace-level bundle a reader isn't shown is not counted (as Activity)."""
        if sees_everything(reader):
            return rows.count() - count
        return rows.filter(Q(customer__isnull=False) | Q(account__isnull=False)).count() - count


class BundleStepView(APIView):
    """PATCH /api/v1/agents/bundles/<id>/steps/<step_id>/ (D2 contract §4.1)."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, step_pk):
        try:
            bundle = bundle_run.save_step(request.user, pk, step_pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class SalesReportView(APIView):
    """GET /api/v1/agents/bundles/<id>/steps/<step_id>/report/ (sales review
    report spec §5): the stored report as a one-page printable HTML page.
    Only the bundle's person; anything else is 404."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={(200, "text/html"): OpenApiTypes.STR})
    def get(self, request, pk, step_pk):
        from django.http import HttpResponse

        from . import report_page

        bundle = bundle_for(request.user, pk)
        step = (
            bundle.steps.select_related("organisation")
            .filter(pk=step_pk, kind=AgentAction.Kind.REPORT_SALES)
            .first()
        )
        # SOC2:AUTH-02 the report was read as the meeting's organiser: theirs alone
        if (
            step is None
            or bundle.source != AgentBundle.Source.MEETING
            or bundle.routed_user_id != request.user.pk
        ):
            raise no_such_bundle()
        page = report_page.render(bundle, step)
        if page is None:
            raise no_such_bundle()
        html, day = page
        audit.record(  # SOC2:LOG-01 ids only: never a deal, a figure or the summary
            "report.downloaded",
            actor=request.user,
            organisation=bundle.organisation,
            target=step,
            target_repr=f"Action {step.pk}",
            metadata={"bundle": bundle.pk, "agent_step": step.pk},
            request=request,
        )
        response = HttpResponse(html, content_type="text/html; charset=utf-8")
        response["Content-Disposition"] = f'inline; filename="sales-report-{day}.html"'
        # SOC2:DATA-01 a page of the organiser's deals: never cached, no script may run
        response["Cache-Control"] = "no-store"
        response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
        return response
