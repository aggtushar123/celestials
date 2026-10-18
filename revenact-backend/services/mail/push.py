"""Gmail's Pub/Sub push, verified and turned into a wake-up (contract §7).

The subscription pushes with an OIDC token Google signs for the configured
service account. It is verified here with PyJWT against Google's JWKS (no
Google SDK, as providers/base.py asks), failing closed when the audience or
the service account is not configured. A verified push only sets `wake_at`
on the live, unpaused mailbox whose address it names, when it reports newer
history than that mailbox holds; the loop's next tick does the work. Nothing
is logged from the push's data.
"""

import base64
import binascii
import json

import jwt
from django.conf import settings
from django.db.models import DateTimeField, F, Q, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import MailboxConnection

GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
MAX_BODY = 64 * 1024

_jwks = None


class Rejected(Exception):
    def __init__(self, reason, status):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def _signing_key(token):
    """Google's public key for this token. The JWKS is fetched over HTTPS
    from a fixed Google URL and its keys are cached for an hour. An answer
    that is not JSON (PyJWT does not wrap json.load) is a JWKS failure."""
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(GOOGLE_CERTS, cache_keys=True, lifespan=3600, timeout=10)
    try:
        return _jwks.get_signing_key_from_jwt(token).key
    except ValueError as exc:
        raise jwt.PyJWKClientError("Google's JWKS answer was not JSON") from exc


def verify(authorization, *, audience=None, service_account=None):
    """The verified claims, or Rejected(reason, 401 | 403). The audience and
    service account default to the Gmail push's; core.ticks passes its own."""
    if audience is None:
        audience = settings.GMAIL_PUBSUB_AUDIENCE
    if service_account is None:
        service_account = settings.GMAIL_PUBSUB_SERVICE_ACCOUNT
    if not audience:
        raise Rejected("not_configured_audience", 401)
    if not service_account:
        raise Rejected("not_configured_service_account", 401)
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise Rejected("missing", 401)
    token = token.strip()
    try:
        claims = jwt.decode(
            token,
            _signing_key(token),
            algorithms=["RS256"],
            audience=audience,
            issuer=ISSUERS,
            options={"require": ["exp", "iss", "aud"]},
        )
    except jwt.InvalidAudienceError as exc:
        raise Rejected("audience", 401) from exc
    except jwt.InvalidIssuerError as exc:
        raise Rejected("issuer", 401) from exc
    except jwt.PyJWTError as exc:
        # Malformed, badly signed, expired, or the JWKS unreachable: fail closed.
        raise Rejected("invalid", 401) from exc
    if claims.get("email") != service_account or claims.get("email_verified") is not True:
        raise Rejected("service_account", 403)
    return claims


def wake(data_b64, *, now=None):
    """One UPDATE: wake_at = COALESCE(wake_at, now) on the live, unpaused
    Google mailbox the push names, when its historyId is newer than ours.
    Returns the rows woken; a malformed push wakes nothing."""
    try:
        decoded = json.loads(base64.b64decode(data_b64 or ""))
        address = str(decoded["emailAddress"]).strip().lower()
        history_id = int(decoded["historyId"])
    except (ValueError, KeyError, TypeError, binascii.Error):
        return 0
    now = now or timezone.now()
    return (
        MailboxConnection.objects.filter(
            provider=MailboxConnection.Provider.GOOGLE, address=address, paused_reason=""
        )
        .exclude(status=MailboxConnection.Status.DISCONNECTED)
        .filter(Q(history_id__isnull=True) | Q(history_id__lt=history_id))
        .update(wake_at=Coalesce(F("wake_at"), Value(now, output_field=DateTimeField())))
    )
