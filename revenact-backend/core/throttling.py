"""Brute-force protection for the public auth endpoints (SOC2:AUTH-06, API-04).

Rates come from REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] (set from
AUTH_THROTTLE_RATES in config/settings.py; `None` under `manage.py test`
so the suite is not rate-limited — the throttle tests set a rate
explicitly). Counters live in the default cache (Redis outside tests) so
they survive a restart and are shared if a second process ever appears.

Two keys for login on purpose: per source IP (a bot hammering many
accounts) and per account email (a distributed attack on one account).
The email key is hashed so the cache never holds the address in clear.
"""

import hashlib

from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class _PerIPThrottle(SimpleRateThrottle):
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LoginIPThrottle(_PerIPThrottle):
    scope = "login"


class LoginAccountThrottle(SimpleRateThrottle):
    scope = "login_account"
    rate = None

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "") or "").strip().lower()
        if not email:
            return None
        digest = hashlib.sha256(email.encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": digest}


class SignupThrottle(_PerIPThrottle):
    scope = "signup"


class PasswordResetThrottle(_PerIPThrottle):
    scope = "password_reset"


class TokenRefreshThrottle(_PerIPThrottle):
    scope = "token_refresh"


class SurveyLinkThrottle(_PerIPThrottle):
    """The public survey link (services/surveys/public_views.py): reads and
    answers together, per source IP. The token is a 32-byte secret, so this
    is about load and noise rather than guessing."""

    scope = "survey_link"


class CampaignUnsubscribeThrottle(_PerIPThrottle):
    """The public unsubscribe link (services/campaigns/public_views.py):
    reads and presses together, per source IP. The token is a 32-byte
    secret, so this is about load and noise rather than guessing."""

    scope = "campaign_unsubscribe"


class GmailPushThrottle(_PerIPThrottle):
    """Gmail's Pub/Sub push (services/mail/views.py GmailPushView), per
    source IP. Google pushes from its own addresses, so this caps noise and
    forged traffic, not Google; Pub/Sub retries a 429 later."""

    scope = "gmail_push"


class SlackInteractivityThrottle(_PerIPThrottle):
    """Slack's interactivity requests (services/connectors/slack_interactivity_views.py),
    per source IP: caps forged traffic at a public URL; a person's clicks are
    a few a minute."""

    scope = "slack_interactivity"


class SlackEventsThrottle(_PerIPThrottle):
    """Slack's Events API deliveries (services/connectors/slack_events_views.py),
    per source IP (SC3-29). DRF runs throttles before the view's handler, so
    this counts every request, signed or not, before the signature is checked:
    a forged flood stops here without costing an HMAC. Slack sends every
    workspace's events from few addresses (up to 30,000 an hour per
    workspace), so the rate is high."""

    scope = "slack_events"


class TickThrottle(_PerIPThrottle):
    """Cloud Scheduler's ticks (core/views.py TickView), per source IP: caps
    forged traffic at a public URL; Scheduler itself calls a few times a
    minute."""

    scope = "tick"


class MailAttachmentThrottle(UserRateThrottle):
    """Mail attachment downloads (services/mail/views.py), per user: a first
    open costs two Gmail calls through the owner's mailbox."""

    scope = "mail_attachment"
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this


class MailGmailSearchThrottle(UserRateThrottle):
    """Search older mail in Gmail and opening a result (services/mail/draft_views.py),
    per user and shared by both: a page costs about 105 of Gmail's 250 quota units
    a second."""

    scope = "mail_gmail_search"
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this


class MailDraftUploadThrottle(UserRateThrottle):
    """Files added to a Gmail draft (services/mail/draft_views.py), per user."""

    scope = "mail_draft_upload"
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this


class McpTokenThrottle(SimpleRateThrottle):
    """Per MCP token, not per IP: an agent is one key, wherever it runs
    from, and the thing worth limiting is how fast one key can spend the
    organisation's model budget."""

    scope = "mcp"

    def get_cache_key(self, request, view):
        header = request.headers.get("Authorization", "")
        raw = header[7:].strip() if header.lower().startswith("bearer ") else ""
        if not raw:
            return None
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": digest}
