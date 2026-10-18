"""Connect, sync and send through a person's own mailbox.

The OAuth dance: `connect/<provider>/` hands the browser an authorization
URL carrying a signed state (who is connecting, and a hash of a nonce the
starting browser keeps in an HttpOnly cookie); the provider sends the
browser to `oauth/<provider>/callback/`, which is the one public route
here — it trusts the signed state only in the browser that holds the
matching cookie (a forwarded link cannot connect someone else's mailbox),
swaps the code for tokens, stores them encrypted and bounces the browser
back to Settings. IMAP takes a form instead. Every connect and disconnect is an
audit event: a mailbox is a credential.
"""

import json
import logging
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.db import connection as db
from django.db.models import Count, Q
from django.db.models.functions import Lower
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit, oauth_browser
from core.models import AuditEvent
from core.throttling import GmailPushThrottle, MailAttachmentThrottle
from services.customers.models import ReplyDraft
from services.customers.scoping import get_visible_account, get_visible_customer
from services.customers.serializers import EmailSerializer

from . import actions, attachments, gates, gmail_sync, outbox, providers, push, scopes, threads
from . import signing as mail_signing
from .models import MailboxConnection, MailDraft, MailLabel, MailMessage, MailOutbox
from .providers.base import Credentials, ProviderError
from .providers.google import GmailSession, revoke
from .serializers import (
    ComposeSerializer,
    MailMessageDetailSerializer,
    MailMessageSerializer,
    ReplySerializer,
    connection_payload,
    disconnected_block,
    import_block,
    label_payload,
    labels_by_gmail_id,
    message_detail,
)
from .sync import NothingToReplyTo, reply_to, send_email, sync_mailbox

logger = logging.getLogger(__name__)

STATE_SALT = "mail.oauth"
STATE_MAX_AGE = 15 * 60
#: Binds an OAuth connect to the browser that started it (contract decision 33).
#: Over https the `__Host-` name: browsers accept it only Secure, Path=/
#: and without Domain, so a sibling subdomain (every *.sslip.io site) cannot
#: plant one. Plain-http dev keeps the unprefixed name, scoped to the callback.
BROWSER_COOKIE = "revenact_mail_oauth"
BROWSER_COOKIE_PATH = "/api/v1/mail/oauth/"
BROWSER_COOKIE_SECURE = f"__Host-{BROWSER_COOKIE}"  # what core.oauth_browser sets over https


GOOGLE = MailboxConnection.Provider.GOOGLE
CONNECTED = MailboxConnection.Status.CONNECTED
DISCONNECTED = MailboxConnection.Status.DISCONNECTED


def _redirect_uri(request, provider_key):
    base = settings.MAIL_OAUTH_REDIRECT_BASE or request.build_absolute_uri("/").rstrip("/")
    # A URL for the provider, not an HTTP response body (semgrep's Flask rule misreads it).
    return f"{base}/api/v1/mail/oauth/{provider_key}/callback/"  # nosemgrep


def _back_to_settings(outcome, detail="", code=""):
    """The browser's way back to Integrations: `?mailbox=connected|refused|
    error`, a refusal's `code`, and at most 200 characters of `detail`."""
    from urllib.parse import urlencode

    query = {"mailbox": outcome}
    if code:
        query["code"] = code
    if detail:
        query["detail"] = detail[:200]
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/integrations?{urlencode(query)}")


class MyMailboxView(APIView):
    """GET /api/v1/mail/connection/ — my connection (or null), a kept Google
    row's `disconnected` block, and the providers this deployment can
    connect, Google's with the first failing gate. DELETE disconnects:
    Outlook and IMAP are deleted at once (their copies with them); Google is
    revoked and wiped, and its copies kept for MAIL_DISCONNECT_RETENTION_DAYS.
    Filed emails stay on the record either way. PATCH writes an Outlook
    mailbox's signature ({signature}; round 2 D1 contract §4.3)."""

    permission_classes = [IsAuthenticated]

    NO_MAILBOX = "Connect your mailbox first."
    WRITE_ONE = "Write a signature, or leave it empty."
    TOO_LONG = "Keep the signature under 1000 characters."
    TOO_MANY_LINES = "Keep the signature to 10 lines."

    def get(self, request):
        row = getattr(request.user, "mailbox", None)
        live = gates.live_mailbox(request.user)
        offered = providers.available()
        gate = (
            gates.connect_gate(request.user) if any(p["key"] == GOOGLE for p in offered) else None
        )
        return Response(
            {
                "connection": connection_payload(live) if live else None,
                "disconnected": disconnected_block(row)
                if row is not None and live is None
                else None,
                "providers": [{**p, "gate": gate if p["key"] == GOOGLE else None} for p in offered],
            }
        )

    def patch(self, request):
        """PATCH /api/v1/mail/connection/ {signature}: an Outlook mailbox's
        signature, written by its owner (round 2 D1 contract §4.3). Or
        {agent_reads_mail}: whether the email agent may read this person's
        internal mail (owner decision A, 2026-10-17; off by default)."""
        # SOC2:AUTH-02 only the caller's own mailbox
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response({"detail": self.NO_MAILBOX}, status=status.HTTP_404_NOT_FOUND)
        data = request.data if isinstance(request.data, dict) else {}
        if "agent_reads_mail" in data and "signature" not in data:
            choice = data["agent_reads_mail"]
            if not isinstance(choice, bool):
                return Response(
                    {"agent_reads_mail": ["Say true or false."]}, status=status.HTTP_400_BAD_REQUEST
                )
            if connection.agent_reads_mail != choice:
                connection.agent_reads_mail = choice
                connection.save(update_fields=["agent_reads_mail", "updated_at"])
                audit.record(  # SOC2:LOG-01 a person's consent to the agent reading their mail
                    "mailbox.agent_reads_mail",
                    request=request,
                    actor=request.user,
                    organisation=connection.organisation,
                    target=connection,
                    metadata={"to": choice},
                )
            return Response({"connection": connection_payload(connection)})
        value = data.get("signature")
        if not isinstance(value, str):
            return Response({"signature": [self.WRITE_ONE]}, status=status.HTTP_400_BAD_REQUEST)
        # trailing spaces on each line and blank lines at both ends only
        lines = [line.rstrip() for line in value.replace("\r\n", "\n").split("\n")]
        while lines and not lines[0]:
            lines.pop(0)
        while lines and not lines[-1]:
            lines.pop()
        text = "\n".join(lines)
        if len(text) > mail_signing.LIMIT:
            return Response({"signature": [self.TOO_LONG]}, status=status.HTTP_400_BAD_REQUEST)
        if len(lines) > mail_signing.LINES:
            return Response(
                {"signature": [self.TOO_MANY_LINES]}, status=status.HTTP_400_BAD_REQUEST
            )
        if connection.is_google:
            return Response(
                {
                    "code": "SIGNATURE_IN_GMAIL",
                    "detail": "Change your signature in Gmail. Revenact uses it from there.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if connection.provider != MailboxConnection.Provider.MICROSOFT:
            return Response(
                {"code": "NO_SIGNATURE", "detail": "Signatures are for Outlook mailboxes here."},
                status=status.HTTP_409_CONFLICT,
            )
        connection.signature_html = mail_signing.stored(text) if text else ""
        connection.save(update_fields=["signature_html", "updated_at"])
        return Response({"connection": connection_payload(connection)})

    def delete(self, request):
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if connection.is_google:
            _disconnect_google(request, connection)
            return Response(status=status.HTTP_204_NO_CONTENT)
        # SOC2:LOG-01 a credential is being removed
        audit.record(
            "mailbox.disconnect",
            request=request,
            target=connection,
            metadata={
                "provider": connection.provider,
                "address": connection.address,
                "revoked": False,
                "delete_after": None,
            },
        )
        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _stored_credentials(connection):
    """The decrypted credentials, or {} when there are none or they can't be read."""
    try:
        return connection.get_credentials()
    except ValueError:
        return {}


def _refresh_token(data):
    return data.get("refresh_token", "")


def _disconnect_google(request, connection):
    """Contract §3 DELETE: stop the watch and revoke the grant (both best
    effort), wipe the credentials and the sync state, keep the row and the
    person's copies until the nightly prune (decision 9)."""
    now = timezone.now()
    data = _stored_credentials(connection)
    revoked = False
    if data:
        if connection.watch_expires_at and connection.watch_expires_at > now:
            try:
                GmailSession(Credentials(address=connection.address, data=data)).stop()
            except ProviderError as exc:
                logger.info("gmail stop failed for connection %s: %s", connection.pk, exc.status)
        revoked = revoke(_refresh_token(data))
        if not revoked:
            logger.warning("gmail grant revoke failed for connection %s", connection.pk)
    # What was on its way never reaches Gmail now; the copies keep their local
    # values, and a reconnect's reconcile re-derives them (decision 13). Labels
    # made here and never created in Gmail go with it (plan gap 13). One
    # transaction, messages locked in pk order before any outbox row (the
    # order requests and the flush use), so no PATCH slips a row in after.
    # Drafts come first (D3 §3, ruling F4): the live ones' ReplyDrafts, then
    # in pk order every draft the settle below touches (live or saving, in any
    # status), since a draft's outbox rows name no message.
    with transaction.atomic():
        mine = MailDraft.objects.filter(connection=connection)
        live = mine.filter(status__in=MailDraft.LIVE)
        linked = [pk for pk in live.values_list("reply_draft_id", flat=True) if pk is not None]
        if linked:
            list(
                ReplyDraft.objects.select_for_update()
                .filter(pk__in=linked)
                .order_by("pk")
                .values_list("pk", flat=True)
            )
        locked = list(
            mine.filter(Q(status__in=MailDraft.LIVE) | Q(gmail_state=MailDraft.GmailState.SAVING))
            .select_for_update()
            .order_by("pk")
            .values_list("pk", flat=True)
        )
        made_here = list(MailLabel.objects.filter(connection=connection, gmail_id=""))
        keys = [label.key for label in made_here]
        outbox.lock_messages(
            connection,
            MailOutbox.objects.filter(connection=connection, status__in=MailOutbox.LIVE).values(
                "message_id"
            ),
            keys,
        )
        MailboxConnection.objects.filter(pk=connection.pk).update(
            credentials="",
            status=DISCONNECTED,
            disconnected_at=now,
            history_id=None,
            wake_at=None,
            lease_until=None,
            backoff_until=None,
            watch_expires_at=None,
            paused_reason="",
            import_page_token="",
            reconcile_started_at=None,
            reconcile_page_token="",
            updated_at=now,
        )
        MailOutbox.objects.filter(connection=connection, status__in=MailOutbox.LIVE).delete()
        # Their rows went with the outbox: a saving draft is local again, or
        # failed when Gmail holds an older copy (plan gap 9).
        saving = MailDraft.objects.filter(pk__in=locked, gmail_state=MailDraft.GmailState.SAVING)
        saving.filter(gmail_draft_id="").update(gmail_state=MailDraft.GmailState.LOCAL)
        saving.exclude(gmail_draft_id="").update(gmail_state=MailDraft.GmailState.FAILED)
        for label in made_here:
            outbox.unwind_label(connection, label)
    delete_after = now + timedelta(days=settings.MAIL_DISCONNECT_RETENTION_DAYS)
    audit.record(  # SOC2:LOG-01 a credential was revoked and destroyed
        "mailbox.disconnect",
        request=request,
        target=connection,
        metadata={
            "provider": GOOGLE,
            "address": connection.address,
            "revoked": revoked,
            "delete_after": delete_after.isoformat(),
        },
    )


class ConnectView(APIView):
    """POST /api/v1/mail/connect/<provider>/ — for an OAuth provider,
    `{authorize_url}` to send the browser to; for IMAP, the form
    `{address, password, imap_host, imap_port?, smtp_host, smtp_port?,
    username?, display_name?}` is verified by logging in and saved."""

    permission_classes = [IsAuthenticated]

    def post(self, request, provider_key):
        try:
            provider = providers.get_provider(provider_key)
        except ValueError:
            return Response({"detail": "Unknown provider."}, status=status.HTTP_400_BAD_REQUEST)
        if not provider.configured():
            return Response(
                {"detail": f"{provider.label} is not configured for this deployment."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if provider_key == GOOGLE:
            code = gates.connect_gate(request.user)
            if code is not None:
                # Not audited: no credential was touched.
                return Response(
                    {"code": code, "detail": gates.MESSAGES[code]}, status=status.HTTP_403_FORBIDDEN
                )
        if provider.uses_oauth:
            # SOC2:AUTH-01 the callback finishes only in this browser
            response = Response()
            browser = oauth_browser.bind(
                response,
                request,
                name=BROWSER_COOKIE,
                path=BROWSER_COOKIE_PATH,
                max_age=STATE_MAX_AGE,
            )
            state = signing.dumps(
                {"user": request.user.id, "provider": provider_key, "browser": browser},
                salt=STATE_SALT,
            )
            response.data = {
                "authorize_url": provider.authorize_url(state, _redirect_uri(request, provider_key))
            }
            return response
        try:
            creds = provider.connect_with_password(request.data)
        except ProviderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        connection = _save_connection(request, request.user, provider_key, creds)
        audit.record(  # SOC2:LOG-01 a credential was added
            "mailbox.connect",
            request=request,
            target=connection,
            metadata={
                "provider": provider_key,
                "address": connection.address,
                "scopes": [],
                "two_way": False,
            },
        )
        return Response(connection_payload(connection), status=status.HTTP_201_CREATED)


def _replace(request, user, existing):
    """Delete the person's current row before a different one takes its
    place: its personal copies go with it, the filed Email rows stay with
    their mailbox nulled. A Google grant still held is revoked."""
    revoked = False
    if existing.is_google and existing.credentials:
        revoked = revoke(_refresh_token(_stored_credentials(existing)))
    audit.record(  # SOC2:LOG-01 a credential is being removed
        "mailbox.disconnect",
        request=request,
        actor=user,
        target=existing,
        metadata={
            "provider": existing.provider,
            "address": existing.address,
            "revoked": revoked,
            "delete_after": None,
        },
    )
    existing.delete()


def _save_connection(request, user, provider_key, creds):
    """Outlook and IMAP: the person's row updated in place, as today, unless
    it is a different provider's or address's, or a disconnected Google row:
    that one is replaced (contract decision 9)."""
    existing = MailboxConnection.objects.filter(user=user).first()
    if existing is not None and (
        existing.status == DISCONNECTED
        or existing.provider != provider_key
        or existing.address != creds.address
    ):
        _replace(request, user, existing)
    connection, _ = MailboxConnection.objects.update_or_create(
        user=user,
        defaults={
            "organisation": user.organisation,
            "provider": provider_key,
            "address": creds.address,
            "display_name": creds.display_name or user.name,
            "status": CONNECTED,
            "error": "",
            "sync_cursor": "",
        },
    )
    connection.set_credentials(creds.data)
    connection.save(update_fields=["credentials"])
    return connection


class OAuthCallbackView(APIView):
    """GET /api/v1/mail/oauth/<provider>/callback/?code=&state= — public by
    necessity (the provider's redirect carries no bearer token); the
    signed state is trusted only alongside the starting browser's cookie,
    which every answer clears."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, provider_key):
        response = self._finish(request, provider_key)
        oauth_browser.forget(response, request, name=BROWSER_COOKIE, path=BROWSER_COOKIE_PATH)
        return response

    def _finish(self, request, provider_key):
        from services.accounts.models import User

        error = request.query_params.get("error")
        if error:
            if provider_key == GOOGLE and error == "access_denied":
                return _back_to_settings(
                    "refused", gates.MESSAGES[gates.GOOGLE_DENIED], code=gates.GOOGLE_DENIED
                )
            return _back_to_settings(
                "error", request.query_params.get("error_description", "denied")
            )
        try:
            state = signing.loads(
                request.query_params.get("state", ""), salt=STATE_SALT, max_age=STATE_MAX_AGE
            )
        except signing.BadSignature:
            return _back_to_settings("error", "This connection link is invalid or has expired.")
        if state.get("provider") != provider_key:
            return _back_to_settings("error", "Provider mismatch.")
        user = User.objects.filter(pk=state.get("user"), is_active=True).first()
        if user is None:
            return _back_to_settings("error", "Unknown user.")
        if not oauth_browser.same_browser(
            request, state, name=BROWSER_COOKIE, path=BROWSER_COOKIE_PATH
        ):
            # Before the code exchange: no token is ever issued to us for
            # whoever opened a forwarded link.
            return _refuse(request, user, gates.BROWSER_MISMATCH, provider=provider_key)
        if provider_key == GOOGLE:
            return _google_callback(request, user)
        provider = providers.get_provider(provider_key)
        try:
            creds = provider.exchange_code(
                request.query_params.get("code", ""), _redirect_uri(request, provider_key)
            )
        except ProviderError as exc:
            return _back_to_settings("error", str(exc))
        connection = _save_connection(request, user, provider_key, creds)
        audit.record(  # SOC2:LOG-01 a credential was added
            "mailbox.connect",
            request=request,
            actor=user,
            target=connection,
            metadata={
                "provider": provider_key,
                "address": connection.address,
                "scopes": [],
                "two_way": False,
            },
        )
        return _back_to_settings("connected")


def _refuse(request, user, code, *, detail="", domain="", token="", provider=GOOGLE):
    """The callback refuses (a gate, a grant or a browser check, for Google
    or Microsoft): revoke `token` when the provider already issued one,
    store nothing, audit the refusal and say why."""
    if token:
        revoke(token)
    metadata = {"provider": provider, "code": code}
    if domain:
        metadata["domain"] = domain
    audit.record(  # SOC2:LOG-01 the domain only, never the full address
        "mailbox.connect_refused",
        request=request,
        actor=user,
        outcome=AuditEvent.Outcome.FAILURE,
        metadata=metadata,
    )
    return _back_to_settings("refused", detail or gates.MESSAGES[code], code=code)


def _google_callback(request, user):
    """Contract §1 "The order of the work", steps 2-7."""
    code = gates.early_gate(user)
    if code is not None:
        return _refuse(request, user, code)
    try:
        creds = providers.get_provider(GOOGLE).exchange_code(
            request.query_params.get("code", ""), _redirect_uri(request, GOOGLE)
        )
    except ProviderError as exc:
        return _back_to_settings("error", str(exc))
    token = creds.data.get("refresh_token", "")
    if not scopes.is_two_way(creds.scopes):
        return _refuse(request, user, gates.SCOPES_MISSING, token=token)
    session = GmailSession(creds)
    try:
        profile = session.profile()
    except ProviderError:
        revoke(token)
        return _back_to_settings("error", "Google didn't share the mailbox's address. Try again.")
    address = str(profile.get("emailAddress", "")).strip().lower()
    domain = address.rsplit("@", 1)[-1] if "@" in address else ""
    refusal = gates.address_gate(user.organisation, address)
    if refusal is not None:
        code, message = refusal
        return _refuse(request, user, code, detail=message, domain=domain, token=token)
    taken = (
        MailboxConnection.objects.filter(provider=GOOGLE, address=address)
        .exclude(status=DISCONNECTED)
        .exclude(user=user)
        .exists()
    )
    if taken:
        return _refuse(request, user, gates.ADDRESS_IN_USE, domain=domain, token=token)
    session.creds.address = address
    try:
        _save_google(request, user, session.creds, profile)
    except IntegrityError:
        # Someone else connected the same address in the same instant.
        return _refuse(request, user, gates.ADDRESS_IN_USE, domain=domain, token=token)
    return _back_to_settings("connected")


def _save_google(request, user, creds, profile):
    """Save the connection and start its sync (contract §1 steps 6-7). The
    same address resumes the person's row and keeps its copies; a different
    address or provider replaces it."""
    now = timezone.now()
    granted = list(creds.scopes)
    with transaction.atomic():
        existing = MailboxConnection.objects.select_for_update().filter(user=user).first()
        if existing is not None and (not existing.is_google or existing.address != creds.address):
            _replace(request, user, existing)
            existing = None
        # Changes made while it was away are unknown: re-list 30 days.
        away = existing is not None and existing.status != CONNECTED
        before = list(existing.granted_scopes) if existing is not None else []
        connection = existing or MailboxConnection(
            user=user, provider=GOOGLE, address=creds.address
        )
        connection.organisation = user.organisation
        connection.display_name = connection.display_name or user.name
        connection.status = CONNECTED
        connection.error = ""
        connection.paused_reason = ""
        connection.disconnected_at = None
        connection.consecutive_failures = 0
        connection.backoff_until = None
        connection.lease_until = None
        connection.granted_scopes = granted
        connection.set_credentials(creds.data)
        connection.history_id = int(profile["historyId"])
        gmail_sync.start_import(connection, profile, now)
        connection.reconcile_started_at = now if away else None
        connection.reconcile_page_token = ""
        connection.wake_at = now
        # The send-as name and signature are read again on the first tick (D3 §5).
        connection.send_as_synced_at = None
        connection.save()
        short = scopes.short_names(granted)
        if existing is None:
            audit.record(  # SOC2:LOG-01 a credential was added
                "mailbox.connect",
                request=request,
                actor=user,
                target=connection,
                metadata={
                    "provider": GOOGLE,
                    "address": connection.address,
                    "scopes": short,
                    "two_way": connection.two_way,
                },
            )
        else:
            audit.record(  # SOC2:LOG-01
                "mailbox.reconnect",
                request=request,
                actor=user,
                target=connection,
                metadata={"provider": GOOGLE, "address": connection.address},
            )
            if set(before) != set(granted):
                audit.record(  # SOC2:LOG-01
                    "mailbox.scopes_changed",
                    request=request,
                    actor=user,
                    target=connection,
                    metadata={"from": scopes.short_names(before), "to": short},
                )
    return connection


class GmailPushView(APIView):
    """POST /api/v1/mail/google/push/ — Gmail's Pub/Sub push. Public by
    necessity (Pub/Sub sends no session); its OIDC token is the only thing
    trusted. A DRF view is already CSRF-exempt and builds no URL from input.
    A verified push is always 204, whatever it says (decision 27)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [GmailPushThrottle]

    def post(self, request):
        raw = request.body or b""
        if len(raw) > push.MAX_BODY:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        if not settings.GMAIL_PUBSUB_TOPIC:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            # SOC2:API-11 a Google-signed token for our audience and service account
            push.verify(request.headers.get("Authorization", ""))
        except push.Rejected as exc:
            audit.record(  # SOC2:LOG-01
                "mailbox.push_rejected",
                request=request,
                anonymous=True,
                outcome=AuditEvent.Outcome.FAILURE,
                metadata={"reason": exc.reason},
            )
            return Response(status=exc.status)
        try:
            data = json.loads(raw.decode() or "{}").get("message", {}).get("data", "")
        except (ValueError, UnicodeDecodeError, AttributeError):
            data = ""
        if push.wake(data) and settings.MAIL_SYNC_ON_PUSH:
            # Cloud Run: sync now, inside this request, under the mail tick's
            # own lock (a tick already running takes the woken row next).
            from core import ticks

            try:
                ticks.run("mail")
            except Exception as exc:  # noqa: BLE001 - a push is always acknowledged
                logger.error("mail sync on push failed: %s", type(exc).__name__)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SyncNowView(APIView):
    """POST /api/v1/mail/sync/ — pull my mailbox now. Google is queued for the
    loop (202): an import page can take tens of seconds, and an inline tick
    would race the loop's lease (decision 25). Outlook and IMAP sync inline."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response({"detail": "No mailbox connected."}, status=status.HTTP_400_BAD_REQUEST)
        if connection.is_google:
            refused = gates.paused_response(connection)
            if refused is not None:
                return refused
            MailboxConnection.objects.filter(pk=connection.pk).update(wake_at=timezone.now())
            return Response(
                {**connection_payload(connection), "filed": None, "queued": True},
                status=status.HTTP_202_ACCEPTED,
            )
        filed = sync_mailbox(connection)
        connection.refresh_from_db()
        return Response({**connection_payload(connection), "filed": filed})


class _ComposeView(APIView):
    permission_classes = [IsAuthenticated]

    def _parent(self, request, **kwargs):
        raise NotImplementedError

    def post(self, request, **kwargs):
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response(
                {"detail": "Connect your mailbox in Settings › Integrations to send email."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        refused = gates.paused_response(connection)
        if refused is not None:
            return refused
        form = ComposeSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        customer, account = self._parent(request, **kwargs)
        try:
            email = send_email(
                connection,
                to=form.validated_data["to"],
                subject=form.validated_data["subject"],
                body=form.validated_data["body"],
                customer=customer,
                account=account,
            )
        except ProviderError as exc:
            if connection.provider == MailboxConnection.Provider.GOOGLE:
                # Decisions 20/21/23: a lost grant or permission pauses it with a
                # fixed sentence; anything to wait out leaves it as it was.
                if gmail_sync.classify_failure(exc) != "backoff":
                    gmail_sync.pause_revoked(connection, exc)
            elif exc.reauth:
                connection.status = MailboxConnection.Status.ERROR
                connection.error = str(exc)[:255]
                connection.save(update_fields=["status", "error", "updated_at"])
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(EmailSerializer(email).data, status=status.HTTP_201_CREATED)


class CustomerComposeView(_ComposeView):
    """POST /api/v1/customers/<id>/emails/send/ — {to[], subject, body}."""

    def _parent(self, request, customer_id):
        return get_visible_customer(request, customer_id), None


class AccountComposeView(_ComposeView):
    """POST /api/v1/customers/<id>/accounts/<id>/emails/send/."""

    def _parent(self, request, customer_id, account_id):
        return None, get_visible_account(request, customer_id, account_id)


__all__ = ["timezone"]


# --- The person's own inbox --------------------------------------------------
#
# Every view below scopes on `owner=request.user`: a mailbox's whole contents
# are the person's, and nobody else's, however senior. The team reads the
# filed copies (`customers.Email`, under services.mail.visibility), not this.

#: What `?folder=` may ask for. The five real folders, this product's two
#: triage states, and two of the provider's flags, so one control on the
#: page covers every list the person can want.
FOLDERS = {
    "inbox": Q(folder=MailMessage.Folder.INBOX, state=MailMessage.State.OPEN),
    # Gmail's All Mail: everything outside trash and spam (decision 18).
    "all": ~Q(folder__in=[MailMessage.Folder.TRASH, MailMessage.Folder.SPAM]),
    "drafts": Q(folder=MailMessage.Folder.DRAFTS),
    "sent": Q(folder=MailMessage.Folder.SENT),
    "done": Q(state=MailMessage.State.DONE),
    "muted": Q(state=MailMessage.State.MUTED),
    "spam": Q(folder=MailMessage.Folder.SPAM),
    "trash": Q(folder=MailMessage.Folder.TRASH),
    "starred": Q(is_starred=True),
    "important": Q(is_important=True),
}

CATEGORIES = [c for c in MailMessage.Category if c != MailMessage.Category.GENERAL]


def _truthy(raw):
    return str(raw).lower() in ("1", "true", "yes")


def _own_messages(request):
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    return MailMessage.objects.filter(owner=request.user).select_related(
        "connection", "email__customer", "email__account", "draft__reply_draft"
    )


def _label_pk(raw):
    """`label` as a pk: ASCII digits only, short enough for a bigint; 0 (no
    label) for anything else, so every bad value gets the same 400."""
    if raw.isascii() and raw.isdigit() and len(raw) <= 18:
        return int(raw)
    return 0


def filter_messages(request, rows):
    """The filters mail/messages/ and mail/threads/ share (contract §2):
    `folder`, `label`, `category`, `unread`, `priority`, `q`. Returns
    (rows, None), or (None, the 400 answer)."""
    params = request.query_params
    folder = params.get("folder", "inbox")
    if folder not in FOLDERS:
        return None, Response(
            {"detail": f"folder must be one of {', '.join(FOLDERS)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    rows = rows.filter(FOLDERS[folder])
    raw_label = params.get("label")
    if raw_label:
        # SOC2:AUTH-02 one of the caller's own user labels, nobody else's
        label = MailLabel.objects.filter(
            pk=_label_pk(raw_label),
            connection__user=request.user,
            type=MailLabel.Type.USER,
        ).first()
        if label is None:
            return None, Response(
                {"label": [actions.CHOOSE_LABEL]}, status=status.HTTP_400_BAD_REQUEST
            )
        rows = rows.filter(label_ids__contains=[label.key])
    category = params.get("category")
    if category:
        if category not in MailMessage.Category.values:
            return None, Response(
                {"detail": f"category must be one of {', '.join(MailMessage.Category.values)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rows = rows.filter(category=category)
    if _truthy(params.get("unread")):
        rows = rows.filter(is_read=False)
    if _truthy(params.get("priority")):
        rows = rows.filter(Q(is_important=True) | Q(email__isnull=False))
    q = params.get("q", "").strip()
    if q:
        rows = rows.filter(
            Q(subject__icontains=q)
            | Q(from_name__icontains=q)
            | Q(from_address__icontains=q)
            | Q(snippet__icontains=q)
        )
    return rows, None


class MailMessageListView(APIView):
    """GET /api/v1/mail/messages/ — the person's own mail, one folder at a
    time, newest first (filter_messages). Each row carries its sync_issue."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows, refused = filter_messages(request, _own_messages(request))
        if refused is not None:
            return refused
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        context = {
            "labels": labels_by_gmail_id(request.user),
            "issues": outbox.sync_issues([message.pk for message in page]),
        }
        return paginator.get_paginated_response(
            MailMessageSerializer(page, many=True, context=context).data
        )


class MailSummaryView(APIView):
    """GET /api/v1/mail/messages/summary/ — the numbers beside the folders
    and the Categories block at the top of the inbox: for each category with
    unread mail waiting, how many, the latest subjects and who they are from."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        connection = gates.live_mailbox(request.user)
        google = connection is not None and connection.is_google
        mine = MailMessage.objects.filter(owner=request.user)
        folders = {
            name: mine.filter(FOLDERS[name]).count()
            for name in ("inbox", "drafts", "sent", "done", "muted")
        }
        unread = mine.filter(FOLDERS["inbox"], is_read=False)
        categories = []
        counted = {
            row["category"]: row["n"] for row in unread.values("category").annotate(n=Count("id"))
        }
        for category in CATEGORIES:
            if not counted.get(category):
                continue
            latest = list(
                unread.filter(category=category)
                .order_by("-sent_at")
                .values_list("subject", "from_name", "from_address")[:12]
            )
            subjects = list(dict.fromkeys(subject for subject, _, _ in latest))
            senders = list(
                dict.fromkeys(name or address for _, name, address in latest if name or address)
            )
            categories.append(
                {
                    "category": category,
                    "label": MailMessage.Category(category).label,
                    "count": counted[category],
                    "subjects": subjects[:2],
                    "senders": senders[:1],
                    "more_senders": max(len(senders) - 1, 0),
                }
            )
        return Response(
            {
                "has_mailbox": connection is not None,
                "address": connection.address if connection else "",
                "last_synced_at": connection.last_synced_at if connection else None,
                "import": import_block(connection) if google else None,
                "paused_reason": (gates.paused_reason(connection) or None) if google else None,
                "folders": folders,
                "unread": unread.count(),
                "categories": categories,
            }
        )


class MailMessageDetailView(APIView):
    """GET /api/v1/mail/messages/<id>/ — the whole message. PATCH (contract
    §3) takes is_read, is_starred, state, trashed, spam, add_labels and
    remove_labels: the row changes at once and, for a two-way Google
    mailbox, the change is queued for Gmail (services/mail/outbox.py).
    Outlook and IMAP stay local. Owner only."""

    permission_classes = [IsAuthenticated]

    def _detail(self, request, message):
        return Response(message_detail(request.user, message))

    def get(self, request, pk):
        return self._detail(request, get_object_or_404(_own_messages(request), pk=pk))

    def patch(self, request, pk):
        with transaction.atomic():
            message = get_object_or_404(actions.lockable(request.user), pk=pk)
            refused = actions.change([message], request.data)
            if refused is not None:
                return refused
        return self._detail(request, get_object_or_404(_own_messages(request), pk=pk))


class MailMessageShareView(APIView):
    """POST /api/v1/mail/messages/<id>/share/ — Add to Revenact from the
    mailbox: file the message on its customer if it isn't yet, and share
    its thread (services.mail.sharing). Owner only."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from . import sharing

        row = get_object_or_404(_own_messages(request).select_related("connection"), pk=pk)
        try:
            email = sharing.share_message(request.user, row, request=request)
        except sharing.ShareRefused as refused:
            return Response(
                {"code": refused.code, "detail": refused.message}, status=refused.http_status
            )
        return Response({"shared": True, "email_id": email.pk})

    def delete(self, request, pk):
        from . import sharing

        row = get_object_or_404(_own_messages(request).select_related("email"), pk=pk)
        if row.email_id is None:
            return Response({"shared": False, "email_id": None})
        try:
            sharing.set_shared(request.user, row.email, False, request=request)
        except sharing.ShareRefused as refused:
            return Response(
                {"code": refused.code, "detail": refused.message}, status=refused.http_status
            )
        return Response({"shared": False, "email_id": row.email_id})


class MailThreadListView(APIView):
    """GET /api/v1/mail/threads/ — the person's own mail as conversations,
    with the message list's filters (filter_messages), newest first."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # SOC2:AUTH-02 the caller's own mail only
        rows, refused = filter_messages(
            request,
            MailMessage.objects.filter(owner=request.user).select_related("draft__reply_draft"),
        )
        if refused is not None:
            return refused
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(threads.anchors(rows), request, view=self)
        view = request.query_params.get("folder", "inbox")
        return paginator.get_paginated_response(threads.thread_rows(request.user, page, view=view))


class MailThreadView(APIView):
    """GET /api/v1/mail/messages/<id>/thread/ — the conversation holding
    message <id>. PATCH changes every message Revenact holds in it (contract
    §3; starring stars the newest only). Owner only: 404 for anyone else."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        anchor = get_object_or_404(MailMessage.objects.filter(owner=request.user), pk=pk)
        return Response(threads.thread_payload(request.user, anchor))

    def patch(self, request, pk):
        with transaction.atomic():
            anchor = get_object_or_404(MailMessage.objects.filter(owner=request.user), pk=pk)
            messages = actions.without_drafts(
                actions.lockable(request.user).filter(threads.thread_q(anchor))
            )
            if not messages:  # every message of it is a live draft's (plan gap 26)
                return actions.error("IS_DRAFT", actions.IS_DRAFT, status.HTTP_409_CONFLICT)
            refused = actions.change(messages, request.data, star_newest=True)
            if refused is not None:
                return refused
        return Response(threads.thread_payload(request.user, anchor))


#: Gmail keeps these names for itself (any case), and every CATEGORY_* one.
RESERVED_LABELS = frozenset(
    {"INBOX", "SENT", "DRAFT", "DRAFTS", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT", "CHAT"}
)

#: Unread conversations per label key, outside trash and spam (decision 19).
#: A constant statement with one parameter: the ORM cannot group by a
#: set-returning function.
UNREAD_BY_LABEL = """
SELECT label.key,
       COUNT(DISTINCT CASE WHEN m.thread_id = '' THEN 'm' || m.id::text ELSE m.thread_id END)
FROM mail_mailmessage AS m
CROSS JOIN LATERAL jsonb_array_elements_text(m.label_ids) AS label(key)
WHERE m.connection_id = %s AND NOT m.is_read AND m.folder NOT IN ('trash', 'spam')
GROUP BY label.key
"""


class MailActionsView(APIView):
    """POST /api/v1/mail/actions/ — one op on many messages (`message_ids`)
    or whole conversations (`thread_of`), contract §3. All or nothing: an id
    that is not the caller's makes the whole request 404, naming none."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        ids = actions.requested_ids(data)
        threaded = isinstance(data, dict) and "thread_of" in data
        serializer = actions.BulkActionSerializer(data=data)
        valid = serializer.validated_data if serializer.is_valid() else None
        if valid is not None:
            ids = set(valid.get("message_ids", valid.get("thread_of", [])))
            threaded = "thread_of" in valid
        with transaction.atomic():
            messages = actions.expand(request.user, ids, threads=threaded) if ids else []
            # SOC2:AUTH-02 every id must be the caller's own
            if ids and not ids <= {message.pk for message in messages}:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            if valid is None:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            if not messages:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            if len(messages) > settings.MAIL_ACTION_MAX_MESSAGES:
                return actions.too_many()
            if threaded:
                messages = actions.without_drafts(messages)
                if not messages:
                    return actions.error("IS_DRAFT", actions.IS_DRAFT, status.HTTP_409_CONFLICT)
            else:
                refused = actions.drafts_refused(messages)
                if refused is not None:
                    return refused
            op = valid["op"]

            def plan(connection):
                labels, refused = actions.labels_for(
                    connection, label_id=[valid["label_id"]] if op in actions.LABEL_OPS else []
                )
                return refused or [(op, labels.get(valid.get("label_id")))]

            refused, changed = actions.run(messages, plan, star_newest=threaded)
            if refused is not None:
                return refused
        return Response(
            {
                "op": op,
                "messages": len(changed),
                "threads": len({threads.key_of(message) for message in messages}),
                "unchanged": len(messages) - len(changed),
            }
        )


def unread_by_label(connection):
    """{label key: unread conversations} for one mailbox, in one query."""
    with db.cursor() as cursor:
        cursor.execute(UNREAD_BY_LABEL, [connection.pk])
        return dict(cursor.fetchall())


def _label_row(label, unread):
    return {
        "id": label.pk,
        "gmail_id": label.gmail_id or None,
        "name": label.name,
        "color": label_payload(label)["color"],
        "unread": unread.get(label.key, 0),
        "pending": not label.gmail_id,
    }


def _label_name_error(name):
    if not name:
        return "Name the label."
    if len(name) > 225:
        return "Keep the name under 225 characters."
    upper = name.upper()
    if upper in RESERVED_LABELS or upper.startswith("CATEGORY_"):
        return "Gmail keeps that name for itself."
    return None


class MailLabelListView(APIView):
    """GET /api/v1/mail/labels/ — my own live Google mailbox's user labels, by
    name, with unread conversations, labels made here included (`pending`).
    [] without one. POST {name} makes one here and queues it for Gmail."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # SOC2:AUTH-02 the caller's own connection only
        connection = gates.live_mailbox(request.user)
        if connection is None or not connection.is_google:
            return Response([])
        rows = MailLabel.objects.filter(connection=connection, type=MailLabel.Type.USER).order_by(
            Lower("name"), "pk"
        )
        unread = unread_by_label(connection)
        return Response([_label_row(label, unread) for label in rows])

    def post(self, request):
        raw = request.data.get("name", "") if isinstance(request.data, dict) else ""
        name = raw.strip() if isinstance(raw, str) else ""
        problem = _label_name_error(name)
        if problem:
            return Response({"name": [problem]}, status=status.HTTP_400_BAD_REQUEST)
        # SOC2:AUTH-02 the caller's own mailbox, kept copies included
        connection = getattr(request.user, "mailbox", None)
        if connection is None:
            return actions.error("NO_MAILBOX", actions.NO_MAILBOX, status.HTTP_409_CONFLICT)
        with transaction.atomic():
            # Checked against the locked row, as every write is (a disconnect
            # that committed first refuses; one that waits deletes the row).
            connection = actions.lock_connection(connection)
            refused = actions.refusal(connection, [(MailOutbox.Op.LABEL_CREATE, None)])
            if refused is not None:
                return refused
            existing = MailLabel.objects.filter(connection=connection, name__iexact=name).first()
            if existing is not None:
                return actions.error(
                    "LABEL_EXISTS",
                    f"You already have a label called {existing.name}.",
                    status.HTTP_409_CONFLICT,
                    label_id=existing.pk,
                )
            label = outbox.create_label(connection, name)
        return Response(_label_row(label, {}), status=status.HTTP_201_CREATED)


class MailReplyView(APIView):
    """POST /api/v1/mail/messages/<id>/reply/ {body} — answer from the
    mailbox the message arrived in. Filed against the customer too when the
    original was. Returns the sent message as it now sits in Sent."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        message = get_object_or_404(_own_messages(request), pk=pk)
        serializer = ReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        connection = gates.live_mailbox(request.user)
        if connection is None or connection.id != message.connection_id:
            return Response(
                {"detail": "This message's mailbox is no longer connected."},
                status=status.HTTP_409_CONFLICT,
            )
        refused = gates.paused_response(connection)
        if refused is not None:
            return refused
        try:
            sent = reply_to(message, serializer.validated_data["body"])
        except NothingToReplyTo as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ProviderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        # SOC2:LOG-01 mail left the building through a credential we hold
        audit.record(
            "mailbox.reply",
            request=request,
            target=message,
            metadata={
                "to": sent.to if sent else [],
                "subject": sent.subject if sent else "",
                "cc": [],
                "bcc_count": 0,
                "attachments": 0,
                "bytes": 0,
            },
        )
        if not message.is_read:
            if connection.two_way:
                # Through the outbox, so Gmail hears of it (decision 25).
                with transaction.atomic():
                    locked = get_object_or_404(actions.lockable(request.user), pk=message.pk)
                    fresh = actions.lock_connection(connection)
                    steps = [(MailOutbox.Op.READ, None)]
                    if actions.refusal(fresh, steps) is None:
                        outbox.apply(
                            fresh,
                            [(locked, c) for c in outbox.changes_for(MailOutbox.Op.READ)],
                        )
                    else:  # went away while replying: Revenact's copy only
                        locked.is_read = True
                        locked.save(update_fields=["is_read"])
            else:
                message.is_read = True
                message.save(update_fields=["is_read"])
        context = {"labels": labels_by_gmail_id(request.user)}
        return Response(
            MailMessageDetailSerializer(sent, context=context).data if sent else {},
            status=status.HTTP_201_CREATED,
        )


#: The download route's refusals (contract §6), the same text for everyone.
ATTACHMENT_ERRORS = {
    "ATTACHMENT_UNAVAILABLE": (
        status.HTTP_409_CONFLICT,
        "This file hasn't been fetched from Gmail yet, and its mailbox isn't connected.",
    ),
    "ATTACHMENT_GONE": (status.HTTP_410_GONE, "This file is no longer in Gmail."),
    "ATTACHMENT_TOO_LARGE": (
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        "This file is too large to open here. Open it in Gmail.",
    ),
}


def _attachment_error(code):
    http_status, detail = ATTACHMENT_ERRORS[code]
    return actions.error(code, detail, http_status)


def _gmail_busy(seconds):
    return actions.gmail_busy(seconds)


class MailAttachmentDownloadView(APIView):
    """GET /api/v1/mail/attachments/<id>/download/ — one file part (contract
    §6): the owner's, or a filed message's under the twice-filter. Fetched
    from Gmail on the first open and cached; ?download=1 forces a download.
    Every read of a filed message's file is audited."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailAttachmentThrottle]

    def get(self, request, pk):
        part = attachments.readable(request.user, pk)
        message = part.message
        connection = message.connection
        fetched = False
        if not part.file:
            limit = settings.MAIL_ATTACHMENT_MAX_BYTES
            if part.size > limit:
                return _attachment_error("ATTACHMENT_TOO_LARGE")
            if (
                not connection.is_google
                or connection.status == DISCONNECTED
                or gates.paused_reason(connection)
            ):
                return _attachment_error("ATTACHMENT_UNAVAILABLE")
            now = timezone.now()
            if connection.backoff_until and connection.backoff_until > now:
                return _gmail_busy((connection.backoff_until - now).total_seconds())
            try:
                data = attachments.fetch(part, connection)
            except attachments.Gone:
                return _attachment_error("ATTACHMENT_GONE")
            except attachments.Unavailable:
                return _attachment_error("ATTACHMENT_UNAVAILABLE")
            except attachments.Busy as busy:
                return _gmail_busy(busy.retry_after)
            if len(data) > limit:
                return _attachment_error("ATTACHMENT_TOO_LARGE")
            attachments.cache(part, data, now)
            fetched = True
        if message.email_id is not None:
            audit.record(  # SOC2:LOG-01 a file from someone's mailbox was read through a record
                "mailbox.attachment_downloaded",
                request=request,
                target=part,
                metadata={
                    "email": message.email_id,
                    "attachment": part.pk,
                    "content_type": part.mime_type,
                    "size": part.size,
                    "fetched": fetched,
                    "owner": message.owner_id == request.user.pk,
                },
            )
        return attachments.response(part, download=_truthy(request.query_params.get("download")))
