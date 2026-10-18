"""GET /api/v1/agents/bundles/<id>/steps/<step_id>/options/<list>/ (agent
bundles D3 contract §5.2): 404 for a bundle the reader may not read, 403
for a step they may not run, 409 unless the step can still be edited."""

from django.db import transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.metrics.models import AgentAction

from .actions.jira_issues import DEFAULT_TYPE
from .bundle_payloads import bundle_for, bundle_payload, no_such_bundle
from .bundle_run import CANT_CHANGE, STEP_NOT_WAITING, Refused, cant_run_step, conflict
from .bundles import settle_stuck
from .deciding import locked, may_decide
from .kinds import StepFailed
from .models import AgentBundle
from .outside import gates, jira_projects, options, seats, tools

S = AgentAction.Status
K = AgentAction.Kind


class StepOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, step_pk, name):
        bundle = settle_stuck(bundle_for(request.user, pk))
        step = (
            bundle.steps.select_related("organisation", "customer", "account", "bundle")
            .filter(pk=step_pk)
            .first()
        )
        if step is None:
            raise no_such_bundle()
        # SOC2:AUTH-02 only a reader who may run the step reads the tool's lists for it
        if not may_decide(request.user, step):
            refused = cant_run_step(step)
            return Response(refused.body, status=refused.status)
        editable = step.status == S.PROPOSED or (
            step.status == S.FAILED and bundle.status != AgentBundle.Status.RUNNING
        )
        if not editable:
            return Response({"code": "STEP_NOT_WAITING", "detail": STEP_NOT_WAITING}, status=409)
        try:
            body = options.options(
                step,
                request.user,
                name,
                project=request.query_params.get("project", ""),
                query=request.query_params.get("query", ""),
                live=request.query_params.get("live") == "1",
                issue_type=request.query_params.get("issue_type", ""),
            )
        except options.Refusal as refused:
            return Response(refused.body, status=refused.status)
        return Response(body)


class StepJiraProjectView(APIView):
    """POST /api/v1/agents/bundles/<id>/steps/<step_id>/jira-project/: a new
    Jira Software project, made in Jira as the runner (their link or the
    connection), becomes the `jira.create` step's project. Body `{name, key}`;
    201 `{"bundle": Bundle}`. 404, 403 CANT_RUN_STEP, the bundle's 409s,
    409 STEP_NOT_WAITING, 409 TOOL_BLOCKED, 400, 403 CANT_CREATE_PROJECT,
    502 JIRA_REFUSED / JIRA_UNCONFIRMED."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            "StepJiraProject",
            {"name": serializers.CharField(), "key": serializers.CharField()},
        ),
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, pk, step_pk):
        try:
            bundle = create_project(request.user, pk, step_pk, request.data)
        except Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)}, status=201)


NAME_NEEDED = "Name the project, under 80 characters."
KEY_NEEDED = "Use 2 to 10 capital letters or digits, starting with a letter."
FIELDS = {"name", "key"}


def _body(data):
    """(name, key) or Refused(400). SOC2:API-01 only `name` and `key`, checked."""
    data = data if isinstance(data, dict) else {}
    errors = {field: [CANT_CHANGE] for field in data if field not in FIELDS}
    name = data.get("name")
    name = name.strip() if isinstance(name, str) else ""
    if not name or len(name) > jira_projects.NAME_LIMIT:
        errors["name"] = [NAME_NEEDED]
    key = data.get("key")
    if not isinstance(key, str) or not jira_projects.KEY.match(key):
        errors["key"] = [KEY_NEEDED]
    if errors:
        raise Refused(400, errors)
    return name, key


def create_project(reader, pk, step_pk, data):
    bundle = settle_stuck(bundle_for(reader, pk))
    step = (
        bundle.steps.select_related("organisation", "customer", "account", "bundle")
        .filter(pk=step_pk, kind=K.JIRA_CREATE)
        .first()
    )
    if step is None:
        raise no_such_bundle()
    # SOC2:AUTH-02 only a reader who may run the step makes its project
    if not may_decide(reader, step):
        raise cant_run_step(step)
    if step.status != S.FAILED:
        refused = conflict(bundle, reader, timezone.now())
        if refused is not None:
            raise refused
    editable = step.status == S.PROPOSED or (
        step.status == S.FAILED and bundle.status != AgentBundle.Status.RUNNING
    )
    if not editable:
        raise Refused(409, {"code": "STEP_NOT_WAITING", "detail": STEP_NOT_WAITING})
    # SOC2:AUTH-02 the tool's gate: a read-only or unusable connection makes nothing
    stop = gates.blocked(step, reader)
    if stop is not None:
        raise Refused(409, {"code": "TOOL_BLOCKED", "detail": stop.sentence, "link": stop.link})
    name, key = _body(data)
    connector = gates.connector_of(step)
    try:
        seat = seats.for_step(connector, reader)
    except StepFailed as exc:
        raise Refused(409, {"code": "TOOL_BLOCKED", "detail": exc.detail}) from None
    try:
        made = tools.current().jira.create_project(connector, key=key, name=name, seat=seat)
    except tools.CantCreateProject as exc:
        raise Refused(403, {"code": "CANT_CREATE_PROJECT", "detail": exc.sentence}) from None
    except tools.ProjectTaken as exc:
        raise Refused(400, {exc.field: [exc.sentence]}) from None
    except tools.Unconfirmed as exc:
        raise Refused(502, {"code": "JIRA_UNCONFIRMED", "detail": exc.sentence}) from None
    except tools.Refused as exc:
        raise Refused(502, {"code": "JIRA_REFUSED", "detail": exc.sentence}) from None
    jira_projects.forget(connector, seat)
    now = timezone.now()
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        fresh = locked(step.pk)
        payload = fresh.payload if isinstance(fresh.payload, dict) else {}
        kept = payload.get("issue_type") or {}
        # Another project: its type is resolved again by name (D3-6).
        fresh.payload = {
            **payload,
            "project": made,
            "issue_type": {"id": "", "name": kept.get("name") or DEFAULT_TYPE},
        }
        fresh.edited_at = now
        fresh.save(update_fields=["payload", "edited_at"])
        bundle.edited_at, bundle.edited_by = now, reader
        bundle.save(update_fields=["edited_at", "edited_by", "updated_at"])
        audit.record(  # SOC2:LOG-01 ids and the key only, never the name
            "jira.project_created",
            actor=reader,
            organisation=bundle.organisation,
            target=fresh,
            target_repr=f"Action {fresh.pk}",
            metadata={
                "bundle": bundle.pk,
                "step": fresh.pk,
                "connector": connector.pk,
                "key": made,
                "as": seats.as_of(seat),
            },
        )
    return bundle
