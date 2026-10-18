"""The Agents routes (contract): settings, Run now, Activity, and per-step
Undo; approve and reject answer 409 USE_BUNDLE (agent bundles D19). 404 for
an action outside the workspace or on a record the reader can't open, then
403, then the route's own refusals."""

import logging

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.utils.urls import replace_query_param
from rest_framework.views import APIView

from core import audit
from services.accounts.capabilities import Capability
from services.customers.scoping import sees_everything, visible_accounts, visible_customers
from services.metrics.models import AgentAction

from . import bulk, deciding, settings_api
from . import undo as undoing
from .bundles import (
    others_personal_bundle_ids,
    own_meeting_bundle_ids,
    unreadable_thread_bundle_ids,
)
from .kinds import ChangedSince, OwnerLimit
from .payloads import action_payload, card
from .policy import AGENTS, policy_for, profiles_for, resets_on
from .registry import REGISTRY
from .run import run, skip_reason
from .source_access import unreadable_draft_ids

logger = logging.getLogger(__name__)
PAGE = 50
CHOOSE_AGENT = "Choose cs, sales or ops."
CHOOSE_KIND = "Choose an action kind."
CHOOSE_STATUS = "Choose proposed, applied, rejected, expired, undone, failed or skipped."
CHOOSE_ID = "Choose a record id."
USE_BUNDLE = "Open the bundle to decide this."
VERB = {"applied": "applied", "rejected": "rejected", "undone": "undid", "expired": "expired"}


def readable(reader, queryset):
    """`queryset` cut to actions `reader` may read: on a record they may
    open, a draft reply only for a reader of its source; workspace-level
    ones for view_all readers only."""
    # SOC2:AUTH-02 a draft reply is read only by its source's readers (owner decision 2)
    queryset = queryset.exclude(id__in=unreadable_draft_ids(reader))
    # SOC2:AUTH-02 a message bundle's steps are read only by its source's readers (§5.1)
    queryset = queryset.exclude(bundle_id__in=unreadable_thread_bundle_ids(reader))
    # SOC2:AUTH-02 the twice-filter, as id IN subqueries
    if sees_everything(reader):
        return queryset
    # SOC2:AUTH-02 a meeting bundle's step (no record) is its organiser's alone
    return queryset.filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
        | Q(bundle_id__in=own_meeting_bundle_ids(reader))
    )


def _code(code, detail, http=status.HTTP_409_CONFLICT, **extra):
    return Response({"code": code, "detail": detail, **extra}, status=http)


class AgentSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(settings_api.payload(request.user.organisation, request.user))

    def patch(self, request):
        # SOC2:AUTH-02 changing the agents is a workspace setting's right
        if not request.user.has_capability(Capability.MANAGE_ORG_SETTINGS):
            raise PermissionDenied("Only admins can change the agents.")
        organisation = request.user.organisation
        changes = settings_api.changes_from(organisation, request.data)
        if any(changes.values()):
            settings_api.save(organisation, request.user, changes, request=request)
            organisation.refresh_from_db()
        return Response(settings_api.payload(organisation, request.user))


class AgentRunView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, kind):
        from services.work import proposal_notice
        from services.work.clock import today_for

        if kind not in AGENTS:
            raise NotFound("No such agent.")
        user = request.user
        # SOC2:AUTH-02 running an agent: admins or view_all readers
        if not (user.has_capability(Capability.MANAGE_ORG_SETTINGS) or sees_everything(user)):
            raise PermissionDenied(
                "Only admins and people who can see every account can run an agent."
            )
        organisation = user.organisation
        today = today_for(organisation)
        profile = profiles_for(organisation)[kind]
        reason = skip_reason(organisation, profile, policy_for(organisation), today)
        if reason == "ai_off":
            return self._refused(request, kind, "AI_OFF", "AI is switched off for this workspace.")
        if reason == "disabled":
            return self._refused(request, kind, "AGENT_OFF", "This agent is switched off.")
        if reason == "no_actions":
            return self._refused(
                request, kind, "NO_ACTIONS", "Every action is set to never for this agent."
            )
        if reason == "budget":
            day = resets_on(today)
            return self._refused(
                request,
                kind,
                "BUDGET_USED",
                f"This agent's budget is used up: it resumes on {day.day} {day:%b}.",
                resets_on=day.isoformat(),
            )
        try:
            result = run(organisation, kind, actor=user)
        except Exception as exc:
            # The failure is on the record before the 500.
            audit.record(  # SOC2:LOG-01
                "agents.run",
                request=request,
                outcome=audit.AuditEvent.Outcome.FAILURE,
                metadata={"agent": kind, "skipped_reason": "failed", "error": type(exc).__name__},
            )
            raise
        if result.skipped_reason == "credits":
            # A model call was attempted, so the refusal is on the record too.
            self._audit_refusal(request, kind, "CREDITS")
            return Response(
                {"detail": "The workspace has no credits left."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        audit.record(  # SOC2:LOG-01
            "agents.run", request=request, metadata={"agent": kind, **result.as_dict()}
        )
        try:
            with transaction.atomic():
                proposal_notice.notify_proposals(organisation, today=today, actor=user)
        except Exception as exc:  # noqa: BLE001 - the run is committed either way
            logger.warning(
                "agents: the proposal notice after Run now failed: %s", type(exc).__name__
            )
        profile.refresh_from_db()
        return Response(card(profile, organisation, today))

    def _audit_refusal(self, request, kind, code):
        audit.record(  # SOC2:LOG-01
            "agents.run",
            request=request,
            outcome=audit.AuditEvent.Outcome.FAILURE,
            metadata={"agent": kind, "refused": code},
        )

    def _refused(self, request, kind, code, detail, **extra):
        self._audit_refusal(request, kind, code)
        return _code(code, detail, **extra)


class ActionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        rows = AgentAction.objects.filter(organisation_id=request.user.organisation_id)
        errors = {}
        for name, allowed, message in (
            ("agent", AGENTS, CHOOSE_AGENT),
            ("kind", tuple(REGISTRY), CHOOSE_KIND),
            ("status", tuple(AgentAction.Status.values), CHOOSE_STATUS),
        ):
            if name in params:
                if params[name] in allowed:
                    rows = rows.filter(**{name: params[name]})
                else:
                    errors[name] = [message]
        for name in ("customer", "account"):
            if name in params:
                if params[name].isdigit():
                    rows = rows.filter(**{f"{name}_id": int(params[name])})
                else:
                    errors[name] = [CHOOSE_ID]
        if errors:
            raise ValidationError(errors)
        # SOC2:AUTH-02 someone else's Slack or meeting bundle is neither shown nor counted
        rows = rows.exclude(bundle_id__in=others_personal_bundle_ids(request.user))
        if not self._may_filter_by(request.user, params):
            # SOC2:AUTH-02 a filter can't be used to probe a record the reader can't open
            return Response(
                {"count": 0, "next": None, "previous": None, "results": [], "hidden": 0}
            )
        shown = readable(request.user, rows)
        count = shown.count()
        number = int(params["page"]) if str(params.get("page", "")).isdigit() else 1
        number = max(number, 1)
        start = (number - 1) * PAGE
        page = list(
            shown.select_related(
                "customer", "account", "decided_by", "undone_by", "bundle"
            ).order_by("-created_at", "-id")[start : start + PAGE]
        )
        url = request.build_absolute_uri()
        # The previews' reads are done once for the page, not once per row.
        with bulk.using(page):
            results = [action_payload(a, request.user) for a in page]
        return Response(
            {
                "count": count,
                "next": replace_query_param(url, "page", number + 1)
                if start + PAGE < count
                else None,
                "previous": replace_query_param(url, "page", number - 1) if number > 1 else None,
                "results": results,
                "hidden": self._hidden(request.user, rows, count),
            }
        )

    def _may_filter_by(self, reader, params):
        if (
            "customer" in params
            and not visible_customers(reader).filter(pk=int(params["customer"])).exists()
        ):
            return False
        return not (
            "account" in params
            and not visible_accounts(reader).filter(pk=int(params["account"])).exists()
        )

    def _hidden(self, reader, rows, count):
        """Actions the reader may not read: on records they can't open, or
        draft replies whose source they can't read. A workspace-level action a
        reader isn't shown is not counted (the contract)."""
        if sees_everything(reader):
            # Everything is theirs to read but a draft reply's source.
            return rows.count() - count
        on_records = rows.filter(Q(customer__isnull=False) | Q(account__isnull=False))
        return on_records.count() - count


class ActionDetailView(APIView):
    """GET /agents/actions/<id>/: one action for the reader (the undo
    notice's link). 404 outside the workspace, on a record the reader
    can't open, or workspace-level without view-all."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        rows = AgentAction.objects.filter(organisation_id=request.user.organisation_id, pk=pk)
        # SOC2:AUTH-02 the twice-filter: an action the reader can't read is missing
        action = readable(request.user, rows).first()
        if action is None:
            raise deciding.no_such_action()
        return Response(action_payload(action, request.user))


def _visible_action(request, pk):
    rows = AgentAction.objects.filter(organisation_id=request.user.organisation_id, pk=pk)
    # SOC2:AUTH-02 an action on a record the caller can't open reads as missing
    action = readable(request.user, rows).first()
    if action is None:
        raise deciding.no_such_action()
    if deciding.decided_as(request.user, action) is None:
        raise PermissionDenied({"code": "CANT_DECIDE", "detail": "You can't decide this action."})
    return action


def _already(action):
    who = action.undone_by if action.status == "undone" else action.decided_by
    name = who.name if who is not None else "Revenact"
    return _code(
        "ALREADY_DECIDED",
        f"{name} already {VERB.get(action.status, action.status)} this.",
        action=None,
    )


class ActionDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, decision):
        if decision not in ("approve", "reject", "undo"):
            raise NotFound()
        action = _visible_action(request, pk)
        if decision in ("approve", "reject"):
            # Agent bundles D19: a step is decided by running or rejecting its bundle.
            return _code("USE_BUNDLE", USE_BUNDLE, bundle=action.bundle_id)
        try:
            done = undoing.undo(request.user, pk)
        except deciding.CantDecide:
            raise PermissionDenied(
                {"code": "CANT_DECIDE", "detail": "You can't decide this action."}
            ) from None
        except deciding.AlreadyDecided as exc:
            # undo raises this only for an action already undone
            response = _already(exc.action)
            response.data["action"] = action_payload(exc.action, request.user)
            return response
        except undoing.NotApplied:
            return _code("NOT_APPLIED", "Only an applied action can be undone.")
        except undoing.UndoExpired:
            return _code(
                "UNDO_EXPIRED",
                "Undo is available for 7 days after an action applies.",
                http=status.HTTP_410_GONE,
            )
        except ChangedSince as exc:
            return _code("CHANGED_SINCE", exc.detail, current=exc.current, applied=exc.applied)
        except OwnerLimit as exc:
            # The undo's transaction rolled back: the action is still applied.
            return _code("OWNER_LIMIT", exc.detail)
        return Response({"action": action_payload(done, request.user)})
