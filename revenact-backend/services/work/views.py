"""The Work routes (spec §1.4, §2.3). Every list is the twice-filter
(`task_access.openable_tasks` for tasks, `rec_access.openable` for
recommendations); what the reader may not read is counted, never named.
See docs/API_CONTRACTS.md, `work`."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.capabilities import Capability
from services.accounts.permissions import CanManageOrgSettings
from services.brain.http import ScopeRefusals
from services.brain.scope import default_key, resolve
from services.customers.models import Task
from services.customers.scoping import visible_accounts, visible_customers
from services.customers.task_payloads import ROW_RELATED, task_row
from services.customers.task_views import (
    CHOOSE_ASSIGNEE,
    CHOOSE_DATE,
    CHOOSE_PRIORITY,
    LONG_TITLE,
    NO_TITLE,
)

from . import (
    assignees,
    deciding,
    drill,
    feed,
    feed_team,
    prefs,
    queue_bundles,
    queues,
    recommendations,
    team,
    todos,
)
from .clock import today_for
from .feed_shape import CHOOSE_GROUP, CURSOR_NEEDS_GROUP, GROUPS, BadQuery, parse_kinds
from .feed_team import CHOOSE_TEAM_GROUP, TEAM_GROUPS, parse_team_kinds
from .models import Recommendation, WorkSettings
from .rec_access import SCOPES, decided_as, default_scope, openable
from .recommend import refresh
from .states import OPEN, STATES
from .team_scope import resolve_team

CHOOSE_PERSON = "Choose a person."
CHOOSE_STATE = "Choose open, overdue or blocked."
NAME_ONE_RECORD = "Name one organisation or account."
CHOOSE_REC_SCOPE = "Choose me or team."


class TodoCreateView(APIView):
    """POST /api/v1/work/todos/ — a private to-do, or a task on a record."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        body = todos.TodoSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        task = todos.create(request.user, body.validated_data)
        on = today_for(request.user.organisation)
        return Response(
            todos.created_payload(request.user, task, today=on), status=status.HTTP_201_CREATED
        )


class FeedView(APIView):
    """GET /api/v1/work/feed/?kind=&group=&cursor= — the caller's desk in
    eight groups, or (with `group`) one group's page."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        group_key, cursor = params.get("group"), params.get("cursor")
        try:
            kinds = parse_kinds(params.get("kind"))
            if group_key is None and cursor is not None:
                raise BadQuery("cursor", CURSOR_NEEDS_GROUP)
            if group_key is not None and group_key not in GROUPS:
                raise BadQuery("group", CHOOSE_GROUP)
            on = today_for(request.user.organisation)
            if group_key is None:
                return Response(feed.build(request.user, today=on, kinds=kinds))
            return Response(
                feed.page(request.user, today=on, kinds=kinds, group_key=group_key, cursor=cursor)
            )
        except BadQuery as exc:
            raise ValidationError({exc.field: [exc.message]}) from None


class FeedCountView(APIView):
    """GET /api/v1/work/feed/count/ — the Work badge."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        on = today_for(request.user.organisation)
        return Response(feed.count(request.user, today=on, own_queue=True))


class QueuesView(APIView):
    """GET /api/v1/work/queues/ — the queue rail (Agent bundles contract §10.3)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(queues.build(request.user, today=today_for(request.user.organisation)))


class TeamQueueView(ScopeRefusals, APIView):
    """GET /api/v1/work/feed/team/?scope=team|company&kind=&group=&cursor= — what
    waits on the reader's team (delivery 2 contract §1)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        key = params.get("scope")
        if queue_bundles.is_queue_key(key):
            return self.queue(request, key)
        # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
        scope = resolve_team(request.user, key)
        group_key, cursor = params.get("group"), params.get("cursor")
        try:
            kinds = parse_team_kinds(params.get("kind"))
            if group_key is None and cursor is not None:
                raise BadQuery("cursor", CURSOR_NEEDS_GROUP)
            if group_key is not None and group_key not in TEAM_GROUPS:
                raise BadQuery("group", CHOOSE_TEAM_GROUP)
            on = today_for(request.user.organisation)
            if group_key is None:
                return Response(feed_team.build(request.user, scope, today=on, kinds=kinds))
            return Response(
                feed_team.page(
                    request.user, scope, today=on, group_key=group_key, cursor=cursor, kinds=kinds
                )
            )
        except BadQuery as exc:
            raise ValidationError({exc.field: [exc.message]}) from None

    def queue(self, request, key):
        """A department or Unassigned queue: bundles only (agent bundles D2-7)."""
        params = request.query_params
        # SOC2:AUTH-02 a queue the reader may not use is refused before anything is read
        queue_bundles.resolve(request.user, key)
        group_key, cursor = params.get("group"), params.get("cursor")
        try:
            parse_team_kinds(params.get("kind"))  # accepted and ignored (D2-7)
            if group_key is None and cursor is not None:
                raise BadQuery("cursor", CURSOR_NEEDS_GROUP)
            if group_key is not None and group_key not in TEAM_GROUPS:
                raise BadQuery("group", CHOOSE_TEAM_GROUP)
            if group_key is None:
                return Response(queue_bundles.build(request.user, key))
            return Response(
                queue_bundles.page(request.user, key, group_key=group_key, cursor=cursor)
            )
        except BadQuery as exc:
            raise ValidationError({exc.field: [exc.message]}) from None


class TaskDrillView(APIView):
    """GET /api/v1/work/tasks/?assignee=<id>&state=open|overdue|blocked."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignee = request.query_params.get("assignee", "")
        state = request.query_params.get("state") or OPEN
        if not assignee.isdigit():
            raise ValidationError({"assignee": [CHOOSE_PERSON]})
        if state not in STATES:
            raise ValidationError({"state": [CHOOSE_STATE]})
        on = today_for(request.user.organisation)
        return Response(drill.build(request.user, int(assignee), state, today=on))


class AssigneesView(APIView):
    """GET /api/v1/work/assignees/?customer=<id> | ?account=<id>."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = request.query_params.get("customer", "")
        account = request.query_params.get("account", "")
        if bool(customer) == bool(account) or not (customer or account).isdigit():
            raise ValidationError({"detail": NAME_ONE_RECORD})
        # SOC2:AUTH-02 a record the caller cannot open reads as missing
        if customer:
            record = get_object_or_404(visible_customers(request.user), pk=int(customer))
        else:
            record = get_object_or_404(visible_accounts(request.user), pk=int(account))
        return Response(assignees.build(request.user, record))


class TeamView(ScopeRefusals, APIView):
    """GET /api/v1/work/team/?scope=me|team|company (default: the widest)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        key = request.query_params.get("scope") or default_key(request.user)
        # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
        scope = resolve(request.user, key)
        on = today_for(request.user.organisation)
        return Response(team.build(request.user, scope, today=on))


class RecommendationListView(APIView):
    """GET /api/v1/work/recommendations/?scope=me|team — what the caller may
    decide (default: team for someone with reports or view-all, else me)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = request.query_params.get("scope") or default_scope(request.user)
        if scope not in SCOPES:
            return Response(
                {"code": "SCOPE_UNKNOWN", "detail": CHOOSE_REC_SCOPE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        on = today_for(request.user.organisation)
        return Response(recommendations.build(request.user, scope, today=on))


class RecommendationRefreshView(APIView):
    """POST /api/v1/work/recommendations/refresh/ — Settings › Work's "Run
    now": the recommender's pass for the caller's workspace."""

    # SOC2:AUTH-02 running the recommender is a workspace setting's right
    permission_classes = [CanManageOrgSettings]

    def post(self, request):
        organisation = request.user.organisation
        # The admin who clicks "Run now" is never told about what it finds.
        result = refresh(organisation, today=today_for(organisation), actor=request.user)
        audit.record(
            "work.recommendations_refresh",
            request=request,
            metadata={
                "created": result.created,
                "expired": result.expired,
                "failed": result.failed,
            },
        )
        return Response(result.as_dict())


class WorkSettingsView(APIView):
    """GET (any member) and PATCH (manage_org_settings) /api/v1/work/settings/."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        current = prefs.settings_for(request.user.organisation)
        return Response(prefs.payload(current, request.user))

    def patch(self, request):
        # SOC2:AUTH-02 changing the workspace's Work settings needs manage_org_settings
        if not request.user.has_capability(Capability.MANAGE_ORG_SETTINGS):
            raise PermissionDenied(CanManageOrgSettings.message)
        made = prefs.settings_for(request.user.organisation)
        with transaction.atomic():
            current = WorkSettings.objects.select_for_update().get(pk=made.pk)
            changes = prefs.changes_from(current, request.data)
            if changes:
                for name, value in changes.items():
                    setattr(current, name, value)
                current.updated_by = request.user
                current.save(update_fields=[*changes, "updated_by", "updated_at"])
                audit.record(
                    "work.settings_update",
                    request=request,
                    target=current,
                    target_repr=f"Work settings {current.pk}",
                    metadata={"fields": sorted(changes)},
                )
        return Response(prefs.payload(current, request.user))


NO_SUCH_RECOMMENDATION = deciding.NO_SUCH_RECOMMENDATION
CANT_DECIDE = deciding.CANT_DECIDE
CHOOSE_REASON = "Choose already handled, not relevant, wrong person or other."
SAY_WHY = "Say why."
LONG_NOTE = "Keep the note under 255 characters."


class AssignSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_ASSIGNEE,
            "invalid": CHOOSE_ASSIGNEE,
            "null": CHOOSE_ASSIGNEE,
            "max_string_length": CHOOSE_ASSIGNEE,
        }
    )
    title = serializers.CharField(
        required=False,
        max_length=255,
        error_messages={
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    due_date = serializers.DateField(
        required=False,
        error_messages={"invalid": CHOOSE_DATE, "null": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )


#: The reasons a person may choose; `retired` is the delivery 2 migration's own.
CHOOSABLE_REASONS = [
    (value, label)
    for value, label in Recommendation.DismissReason.choices
    if value != Recommendation.DismissReason.RETIRED
]


class DismissSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(
        choices=CHOOSABLE_REASONS,
        error_messages={
            "required": CHOOSE_REASON,
            "invalid_choice": CHOOSE_REASON,
            "null": CHOOSE_REASON,
        },
    )
    note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        """The note is "other"'s reason, checked only then; any other
        reason ignores it."""
        if data["reason"] != Recommendation.DismissReason.OTHER:
            return {**data, "note": ""}
        note = data.get("note", "").strip()
        if not note:
            raise ValidationError({"note": [SAY_WHY]})
        if len(note) > 255:
            raise ValidationError({"note": [LONG_NOTE]})
        return {**data, "note": note}


def _decider(request, pk):
    """404 for a recommendation outside the workspace or about a record the
    caller cannot open, then 403 for one they may not decide: before
    anything about it is read or changed. Returns how they decide it."""
    rows = Recommendation.objects.filter(organisation_id=request.user.organisation_id, pk=pk)
    # SOC2:AUTH-02 a recommendation about a record the caller can't open reads as missing
    rec = openable(request.user, rows).first()
    if rec is None:
        raise NotFound(NO_SUCH_RECOMMENDATION)
    role = decided_as(request.user, rec)
    if role is None:
        raise _cant_decide()
    return role


def _cant_decide():
    return PermissionDenied({"code": "CANT_DECIDE", "detail": CANT_DECIDE})


class RecommendationAssignView(APIView):
    """POST /api/v1/work/recommendations/<id>/assign/ — make its task."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        _decider(request, pk)
        body = AssignSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            rec, role = deciding.assign(
                request.user,
                pk,
                assignee_id=data["assignee_id"],
                today=today_for(request.user.organisation),
                title=data.get("title"),
                due_date=data.get("due_date"),
                priority=data.get("priority"),
            )
        except deciding.AlreadyDecided as exc:
            return Response(
                recommendations.already_decided(exc.recommendation),
                status=status.HTTP_409_CONFLICT,
            )
        except deciding.CantDecide:
            raise _cant_decide() from None
        audit.record(
            "work.recommendation_assign",
            request=request,
            target=rec,
            target_repr=f"Recommendation {rec.pk}",
            metadata={"kind": rec.kind, "decided_as": role, "task": rec.task_id},
        )
        task = Task.objects.select_related(*ROW_RELATED).get(pk=rec.task_id)
        return Response(
            {"recommendation": recommendations.decided_payload(rec), "task": task_row(task)},
            status=status.HTTP_201_CREATED,
        )


class RecommendationDismissView(APIView):
    """POST /api/v1/work/recommendations/<id>/dismiss/ — with a reason."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        _decider(request, pk)
        body = DismissSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            rec, role = deciding.dismiss(
                request.user, pk, reason=data["reason"], note=data.get("note", "")
            )
        except deciding.AlreadyDecided as exc:
            return Response(
                recommendations.already_decided(exc.recommendation),
                status=status.HTTP_409_CONFLICT,
            )
        except deciding.CantDecide:
            raise _cant_decide() from None
        audit.record(
            "work.recommendation_dismiss",
            request=request,
            target=rec,
            target_repr=f"Recommendation {rec.pk}",
            metadata={"kind": rec.kind, "decided_as": role, "reason": rec.dismiss_reason},
        )
        return Response({"recommendation": recommendations.decided_payload(rec)})
