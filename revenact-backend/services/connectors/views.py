import hashlib
import hmac
import json

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import DateField
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit, oauth_browser
from services.accounts.capabilities import Capability
from services.accounts.permissions import CanManageIntegrations

from . import agent_access, providers
from .models import Connector
from .providers.base import ProviderError
from .providers.webhook import parse_inbound
from .serializers import ConnectorSerializer
from .sync import classify_new, file_tickets, summary_line, sync_connector

STATE_SALT = "connectors.oauth"
STATE_MAX_AGE = 15 * 60
COOKIE = "revenact_connector_oauth"
COOKIE_PATH = "/api/v1/connectors/oauth/"
OTHER_BROWSER = "Open the link in the browser that started it."
INBOUND_MAX_BYTES = 512 * 1024
INBOUND_MAX_TICKETS = 200


#: What `connector.update` records (contract R2D3-22): settings, never config or secrets.
AUDITED = ("name", "is_enabled", "department")


def _snapshot(connector):
    return {
        **{name: getattr(connector, name) for name in AUDITED},
        "customer_ids": sorted(connector.customers.values_list("id", flat=True)),
        "account_ids": sorted(connector.accounts.values_list("id", flat=True)),
    }


def with_ingested(queryset):
    """Annotate what each connector has brought in. Separate Max
    annotations rather than one expression across the joins: a ticket's
    `opened_at` is a date and a call's `occurred_at` a datetime, and the
    serializer picks the newest once all are Python values. A Slack
    connection files conversations, not tickets (Slack escalations D1)."""
    from django.db.models import Count, DateTimeField, IntegerField, Max, OuterRef, Subquery
    from django.db.models.functions import Cast, Coalesce, TruncDate

    from .models import SlackChannel

    queryset = queryset.annotate(
        ticket_count=Count("tickets", distinct=True),
        call_count=Count("calls", distinct=True),
        last_ticket_at=Max("tickets__opened_at"),
        last_call_at=Cast(Max(TruncDate("calls__occurred_at")), output_field=DateField()),
        conversation_count=Count("slack_conversations", distinct=True),
        last_conversation_at=Cast(
            Max(TruncDate("slack_conversations__last_message_at")), output_field=DateField()
        ),
    )
    live = (
        SlackChannel.objects.filter(connector=OuterRef("pk"), is_archived=False, is_private=False)
        .order_by()
        .values("connector")
    )

    def count(rows):
        return Coalesce(
            Subquery(rows.annotate(n=Count("id")).values("n")[:1], output_field=IntegerField()),
            0,
        )

    last_event = (
        SlackChannel.objects.filter(connector=OuterRef("pk"), event_at__isnull=False)
        .order_by("-event_at")
        .values("event_at")[:1]
    )
    # Slack escalations D3 (SC3-17, SC3-30): subqueries, so no join multiplies the counts
    return queryset.annotate(
        channels_total=count(live),
        channels_synced=count(live.filter(included=True)),
        channels_events_at=Subquery(last_event, output_field=DateTimeField()),
    )


class ConnectorListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/connectors/ — every Connector the caller's own
    organisation has set up.

    Unlike Webhooks, which is admin-only both ways, **GET is open to
    any member**: the Ticket Overview dashboard's "Tickets By Origin"
    chart labels its bars with connector names, and its origin filter
    lists them, so a CSM has to be able to read them. There's nothing
    credential-adjacent to protect here — a Connector deliberately
    stores no secrets (see the model's own docstring).

    Writing still needs `manage_integrations`, the same capability
    Webhooks uses; connecting a system is org configuration, not
    everyday work."""

    serializer_class = ConnectorSerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanManageIntegrations()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return with_ingested(
            Connector.objects.filter(organisation=self.request.user.organisation)
            .select_related("agents_allowed_by")
            .prefetch_related("customers", "accounts")
            .distinct()
        )

    def perform_create(self, serializer):
        with transaction.atomic():  # the connector and its audit row land together
            connector = serializer.save(organisation=self.request.user.organisation)
            audit.record(  # SOC2:LOG-01 a ticket source was added (R2D3-22)
                "connector.create",
                request=self.request,
                organisation=connector.organisation,
                target=connector,
                metadata={"provider": connector.provider, "department": connector.department},
            )


class ConnectorDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/connectors/<id>/ — scoped to the
    caller's own organisation. Same read-open/write-gated split as the
    list view above.

    DELETE leaves the tickets that came from it intact: `Ticket.
    connector` is SET_NULL, so removing a connector makes its tickets
    look manually raised rather than deleting real support history."""

    serializer_class = ConnectorSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT", "DELETE"):
            return [CanManageIntegrations()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return with_ingested(
            Connector.objects.filter(organisation=self.request.user.organisation)
            .select_related("agents_allowed_by")
            .prefetch_related("customers", "accounts")
            .distinct()
        )

    def perform_update(self, serializer):
        before = _snapshot(serializer.instance)
        with transaction.atomic():  # the change and its audit row land together
            connector = serializer.save()
            after = _snapshot(connector)
            changes = {
                k: {"old": before[k], "new": after[k]} for k in after if before[k] != after[k]
            }
            if changes:
                audit.record(  # SOC2:LOG-01 who switched or re-scoped a ticket source (F2)
                    "connector.update",
                    request=self.request,
                    organisation=connector.organisation,
                    target=connector,
                    metadata={"changes": changes},
                )

    def perform_destroy(self, instance):
        with transaction.atomic():  # the audit row and the delete land together
            kept = instance.tickets.count()
            audit.record(  # SOC2:LOG-01 a ticket source was removed; its tickets stay (F3)
                "connector.delete",
                request=self.request,
                organisation=instance.organisation,
                target=instance,
                metadata={"provider": instance.provider, "tickets_kept": kept},
            )
            instance.delete()


def _own_connector(request, pk):
    return get_object_or_404(
        Connector.objects.filter(organisation=request.user.organisation), pk=pk
    )


def _ticket_provider(connector):
    try:
        return providers.get_provider(connector.provider)
    except ValueError:
        return None


def _redirect_uri(request, provider_key):
    base = settings.MAIL_OAUTH_REDIRECT_BASE or request.build_absolute_uri("/").rstrip("/")
    # A URL for the provider, not an HTTP response body (semgrep's Flask rule misreads it).
    return f"{base}/api/v1/connectors/oauth/{provider_key}/callback/"  # nosemgrep


def _back_to_integrations(outcome, detail=""):
    from urllib.parse import urlencode

    query = {"connector": outcome}
    if detail:
        query["detail"] = detail[:200]
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/integrations?{urlencode(query)}")


def _store(connector, config, creds):
    config = dict(config)
    connector.granted_scopes = list(config.pop("scopes", []))
    if connector.provider == Connector.Provider.SLACK:
        # SC3-11: a reconnect keeps the legacy single channel (key fallback, gates)
        old = connector.config or {}
        config = {**{k: old[k] for k in ("channel", "channel_name") if k in old}, **config}
    connector.config = config
    connector.set_credentials(creds)
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.sync_cursor = ""
    connector.last_sync_note = ""
    connector.save()


def start_oauth(request, connector, provider, form, *, purpose, act=False):
    """`{authorize_url}` with the browser cookie set (D3-22). `purpose`:
    "connect" (today's sign-in) or "agents" (the consent for chat:write)."""
    response = Response()
    browser = oauth_browser.bind(
        response, request, name=COOKIE, path=COOKIE_PATH, max_age=STATE_MAX_AGE
    )
    state = signing.dumps(
        {
            "connector": connector.id,
            "user": request.user.id,
            "form": form,
            "purpose": purpose,
            "browser": browser,
        },
        salt=STATE_SALT,
    )
    redirect_uri = _redirect_uri(request, provider.key)
    url = (
        provider.authorize_url(state, redirect_uri, act=True)
        if act
        else provider.authorize_url(state, redirect_uri)
    )
    response.data = {"authorize_url": url}
    return response


SCOPE_MISSING = (
    "This Slack token can't post. Add chat:write to the Slack app, reinstall it, then "
    "reconnect with the new token."
)
SLACK_RECONNECT = "Slack refused the token. Reconnect Slack, then try again."
JIRA_RECONNECT = "Jira refused the login. Reconnect Jira, then try again."
OTHER_WORKSPACE = "That's a different Slack workspace. Sign in to the one this connection reads."
NOT_GRANTED = "Slack didn't grant permission to post."


def _refusal(code, detail, status_code):
    return Response({"code": code, "detail": detail}, status=status_code)


def set_agents(actor, connector, on, *, request=None, consent=False):
    """The switch (D3-9). Returns the connector. The `connector.agent_access`
    audit row is written when the switch's value actually changes (contract
    §5.3: on every change), so off to off records nothing; a consent stores a
    new token, so it is always written, `token_replaced` when already on."""
    with transaction.atomic():
        fresh = Connector.objects.select_for_update().get(pk=connector.pk)
        was = fresh.agents_can_act
        fresh.agents_can_act = on
        fresh.agents_allowed_by = actor if on else None
        fresh.agents_allowed_at = timezone.now() if on else None
        fresh.granted_scopes = connector.granted_scopes
        fresh.save(
            update_fields=[
                "agents_can_act",
                "agents_allowed_by",
                "agents_allowed_at",
                "granted_scopes",
            ]
        )
        if was == on and not consent:
            return fresh
        metadata = {
            "provider": fresh.provider,
            "can_act": on,
            "was": was,
            "scopes": list(fresh.granted_scopes or []),
        }
        if consent and was:
            metadata["token_replaced"] = True
        audit.record(  # SOC2:LOG-01 who let agents act through an outside tool
            "connector.agent_access",
            request=request,
            actor=actor,
            organisation=fresh.organisation,
            target=fresh,
            metadata=metadata,
        )
    return fresh


class ConnectorAgentsView(APIView):
    """POST /api/v1/connectors/<id>/agents/ {"can_act": bool} (agent bundles
    D3 contract §5.3): Read only, or Can act after the tool's grant is
    checked (Slack's chat:write, Jira's create and assign permissions)."""

    # SOC2:AUTH-02 an integration manager decides what agents may do outside
    permission_classes = [CanManageIntegrations]

    def post(self, request, pk):
        connector = _own_connector(request, pk)
        value = request.data.get("can_act") if isinstance(request.data, dict) else None
        if not isinstance(value, bool):
            return Response({"can_act": ["Choose on or off."]}, status=status.HTTP_400_BAD_REQUEST)
        label = connector.get_provider_display().replace(" Software", "")
        if not agent_access.kinds(connector):
            return _refusal("NO_AGENT_KINDS", f"Agents can't act in {label} yet.", 400)
        if not value:
            return self._answer(
                request, set_agents(request.user, connector, False, request=request)
            )
        if not agent_access.usable(connector):
            return _refusal("NOT_CONNECTED", f"Connect {label} first.", 409)
        provider = _ticket_provider(connector)
        if connector.provider == Connector.Provider.SLACK:
            return self._slack(request, connector, provider)
        return self._jira(request, connector, provider)

    def _answer(self, request, connector):
        connector = with_ingested(
            Connector.objects.filter(pk=connector.pk).select_related("agents_allowed_by")
        ).get()
        return Response(ConnectorSerializer(connector, context={"request": request}).data)

    def _slack(self, request, connector, provider):
        try:
            connector.granted_scopes = provider.granted_scopes(connector.get_credentials())
        except ProviderError as exc:
            if exc.reauth or exc.status in (401, 403):
                return _refusal("RECONNECT", SLACK_RECONNECT, 409)
            return _refusal("TOOL_UNREACHABLE", "Couldn't reach Slack. Try again.", 502)
        if agent_access.SLACK_NEEDS in connector.granted_scopes:
            return self._answer(request, set_agents(request.user, connector, True, request=request))
        Connector.objects.filter(pk=connector.pk).update(granted_scopes=connector.granted_scopes)
        if agent_access.needs(connector) == "consent":
            return start_oauth(request, connector, provider, {}, purpose="agents", act=True)
        return _refusal("SLACK_SCOPE_MISSING", SCOPE_MISSING, 409)

    def _jira(self, request, connector, provider):
        try:
            held = provider.my_permissions(
                connector.config, connector.get_credentials(), agent_access.JIRA_CHECKED
            )
        except ProviderError as exc:
            if exc.status in (401, 403):
                return _refusal("RECONNECT", JIRA_RECONNECT, 409)
            return _refusal("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502)
        connector.granted_scopes = sorted(held)
        if set(agent_access.JIRA_NEEDS) <= held:
            return self._answer(request, set_agents(request.user, connector, True, request=request))
        Connector.objects.filter(pk=connector.pk).update(granted_scopes=connector.granted_scopes)
        where = (connector.config or {}).get("project") or "your projects"
        return _refusal(
            "JIRA_CANT_ACT",
            f"This Jira account can't create and assign issues in {where}. "
            "Give it those permissions in Jira, then try again.",
            409,
        )


#: What a consent's fresh connect refreshes on a stored connection's config.
KEPT_ON_GRANT = ("team_id", "bot_name", "bot_id", "bot_user_id", "via")


def _store_grant(connector, config, creds):
    """The consent's token and what Slack granted; the sync cursor is kept
    (a consent is not a new connection)."""
    config = dict(config)
    connector.granted_scopes = list(config.pop("scopes", []))
    kept = dict(connector.config or {})
    kept.update({k: config[k] for k in KEPT_ON_GRANT if k in config})
    connector.config = kept
    connector.set_credentials(creds)
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.save(update_fields=["config", "credentials", "granted_scopes", "status", "error"])


def agents_consented(request, user, connector, config, creds):
    """The agents consent came back (D3-22): the same Slack workspace, with
    chat:write, switches the connector on."""
    stored_team = (connector.config or {}).get("team_id")
    if stored_team and config.get("team_id") != stored_team:
        return _back_to_integrations("error", OTHER_WORKSPACE)
    if agent_access.SLACK_NEEDS not in (config.get("scopes") or []):
        return _back_to_integrations("error", NOT_GRANTED)
    # The token and the switch land together, or neither does.
    with transaction.atomic():
        _store_grant(connector, config, creds)
        set_agents(user, connector, True, request=request, consent=True)
    return _back_to_integrations("agents_on")


class ConnectorConnectView(APIView):
    """POST /api/v1/connectors/<id>/connect/ — hand the source its
    credentials. The body is the provider's own form (see `setup` on the
    connector); `{oauth: true, ...}` asks for `{authorize_url}` instead
    when the provider supports it. The webhook provider answers with the
    one-time `token` and the `inbound_url` to send tickets to."""

    permission_classes = [CanManageIntegrations]

    def post(self, request, pk):
        connector = _own_connector(request, pk)
        provider = _ticket_provider(connector)
        if provider is None:
            return Response(
                {"detail": f"{connector.get_provider_display()} does not sync tickets."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        form = request.data if isinstance(request.data, dict) else {}
        if form.get("oauth"):
            if not (provider.uses_oauth and provider.oauth_configured()):
                return Response(
                    {"detail": f"Sign-in with {provider.label} is not set up on this deployment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # SC3-13: approving the app again (channels:join) never drops chat:write
            act = connector.provider == Connector.Provider.SLACK and agent_access.granted(connector)
            return start_oauth(
                request,
                connector,
                provider,
                {k: v for k, v in form.items() if k != "oauth" and isinstance(v, str)},
                purpose="connect",
                act=act,
            )
        try:
            config, creds = provider.connect(form)
        except ProviderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        _store(connector, config, creds)
        audit.record(  # SOC2:LOG-01 a credential was added
            "connector.connect",
            request=request,
            target=connector,
            metadata={"provider": connector.provider, "department": connector.department},
        )
        data = ConnectorSerializer(connector, context={"request": request}).data
        if connector.provider == Connector.Provider.WEBHOOK:
            data["token"] = creds["token"]
            data["inbound_url"] = request.build_absolute_uri(
                f"/api/v1/connectors/{connector.id}/inbound/"
            )
        return Response(data, status=status.HTTP_201_CREATED)


class ConnectorOAuthCallbackView(APIView):
    """GET /api/v1/connectors/oauth/<provider>/callback/?code=&state= —
    public by necessity (the provider's redirect carries no bearer token);
    the signed state is trusted only alongside the starting browser's
    cookie, which every answer clears (D3-22)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, provider_key):
        response = self._finish(request, provider_key)
        oauth_browser.forget(response, request, name=COOKIE, path=COOKIE_PATH)
        return response

    def _finish(self, request, provider_key):
        from services.accounts.models import User

        if request.query_params.get("error"):
            return _back_to_integrations(
                "error", request.query_params.get("error_description", "denied")
            )
        try:
            state = signing.loads(
                request.query_params.get("state", ""), salt=STATE_SALT, max_age=STATE_MAX_AGE
            )
        except signing.BadSignature:
            return _back_to_integrations("error", "This connection link is invalid or has expired.")
        user = User.objects.filter(pk=state.get("user"), is_active=True).first()
        connector = Connector.objects.filter(
            pk=state.get("connector"), provider=provider_key
        ).first()
        if user is None or connector is None or connector.organisation_id != user.organisation_id:
            return _back_to_integrations("error", "Unknown connector.")
        # SOC2:AUTH-02 still an integration manager when the link comes back
        if not user.has_capability(Capability.MANAGE_INTEGRATIONS):
            audit.record(  # SOC2:LOG-01 a refused OAuth finish (R2D1-11)
                "connector.oauth_refused",
                request=request,
                actor=user,
                target=connector,
                outcome="failure",
                metadata={"provider": connector.provider, "reason": "not_allowed"},
            )
            return _back_to_integrations("error", "Unknown connector.")
        # SOC2:AUTH-01 before the code exchange: a forwarded link gets no token
        if not oauth_browser.same_browser(request, state, name=COOKIE, path=COOKIE_PATH):
            audit.record(  # SOC2:LOG-01 a refused OAuth finish
                "connector.oauth_refused",
                request=request,
                actor=user,
                target=connector,
                outcome="failure",
                metadata={"provider": connector.provider, "reason": "other_browser"},
            )
            return _back_to_integrations("error", OTHER_BROWSER)
        provider = _ticket_provider(connector)
        try:
            config, creds = provider.exchange_code(
                request.query_params.get("code", ""),
                _redirect_uri(request, provider_key),
                state.get("form") or {},
            )
        except ProviderError as exc:
            return _back_to_integrations("error", str(exc))
        if state.get("purpose") == "agents":
            return agents_consented(request, user, connector, config, creds)
        _store(connector, config, creds)
        audit.record(  # SOC2:LOG-01 a credential was added
            "connector.connect",
            request=request,
            actor=user,
            target=connector,
            metadata={"provider": connector.provider, "department": connector.department},
        )
        return _back_to_integrations("connected")


class ConnectorCredentialsView(APIView):
    """DELETE /api/v1/connectors/<id>/credentials/ — disconnect. The
    secret is destroyed; the tickets it brought in stay."""

    permission_classes = [CanManageIntegrations]

    def delete(self, request, pk):
        connector = _own_connector(request, pk)
        was_on = connector.agents_can_act
        with transaction.atomic():
            # SOC2:LOG-01 a credential is being removed
            audit.record(
                "connector.disconnect",
                request=request,
                target=connector,
                metadata={"provider": connector.provider},
            )
            connector.credentials = ""
            connector.config = {}
            connector.status = Connector.Status.NOT_CONNECTED
            connector.error = ""
            connector.sync_cursor = ""
            # A disconnected tool can't act: the switch goes off with its token.
            connector.agents_can_act = False
            connector.agents_allowed_by = None
            connector.agents_allowed_at = None
            connector.granted_scopes = []
            connector.save()
            if was_on:
                audit.record(  # SOC2:LOG-01 agents may no longer act through this tool
                    "connector.agent_access",
                    request=request,
                    target=connector,
                    metadata={
                        "provider": connector.provider,
                        "can_act": False,
                        "was": True,
                        "scopes": [],
                        "disconnect": True,
                    },
                )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConnectorSyncView(APIView):
    """POST /api/v1/connectors/<id>/sync/ — pull this source now."""

    permission_classes = [CanManageIntegrations]

    def post(self, request, pk):
        connector = _own_connector(request, pk)
        if _ticket_provider(connector) is None or not connector.has_credentials:
            return Response(
                {"detail": "Connect this source first."}, status=status.HTTP_400_BAD_REQUEST
            )
        counts = sync_connector(connector)
        connector = with_ingested(Connector.objects.filter(pk=connector.pk)).get()
        data = ConnectorSerializer(connector, context={"request": request}).data
        data.update(counts)
        return Response(data)


class ConnectorInboundView(APIView):
    """POST /api/v1/connectors/<id>/inbound/ — a source pushes tickets.

    Body: one ticket object or `{"tickets": [...]}`; each carries
    `external_id`, `title`, and optionally `description`, `status`,
    `priority`, `requester_email`, `requester_name`, `assignee_name`,
    `url`, `opened_at`, `resolved_at`. Authenticated by the connector's
    own secret: `X-Revenact-Token`, or `X-Revenact-Signature` (hex
    HMAC-SHA256 of the raw body). Unknown connectors and bad secrets both
    answer 404, so the endpoint confirms nothing."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, pk):
        connector = Connector.objects.filter(
            pk=pk, provider=Connector.Provider.WEBHOOK, is_enabled=True
        ).first()
        if connector is None or not connector.has_credentials:
            return Response(status=status.HTTP_404_NOT_FOUND)
        raw = request.body or b""
        if len(raw) > INBOUND_MAX_BYTES:
            return Response(
                {"detail": "Payload too large."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
        secret = connector.get_credentials().get("token", "")
        # SOC2:API-11 the source proves it holds this connector's secret
        if not self._authentic(request, raw, secret):
            audit.record(
                "connector.inbound_rejected",
                request=request,
                organisation=connector.organisation,
                target=connector,
                outcome="failure",
            )
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            payload = json.loads(raw.decode() or "{}")
        except (ValueError, UnicodeDecodeError):
            return Response({"detail": "Body must be JSON."}, status=status.HTTP_400_BAD_REQUEST)
        items = (
            payload.get("tickets")
            if isinstance(payload, dict) and "tickets" in payload
            else [payload]
        )
        if not isinstance(items, list) or len(items) > INBOUND_MAX_TICKETS:
            return Response(
                {"detail": f"Send one ticket or up to {INBOUND_MAX_TICKETS} in `tickets`."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            remotes = [parse_inbound(item) for item in items]  # SOC2:API-01 validated shape
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        counts, created = file_tickets(connector, remotes)
        from django.utils import timezone

        connector.status = Connector.Status.CONNECTED
        connector.last_synced_at = timezone.now()
        connector.last_sync_note = summary_line(counts)
        connector.save(update_fields=["status", "last_synced_at", "last_sync_note"])
        classify_new(connector, created)
        return Response(counts, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _authentic(request, raw, secret):
        if not secret:
            return False
        token = request.headers.get("X-Revenact-Token", "")
        if token and hmac.compare_digest(token, secret):
            return True
        signature = request.headers.get("X-Revenact-Signature", "").lower().removeprefix("sha256=")
        if signature:
            expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
            return hmac.compare_digest(signature, expected)
        return False
