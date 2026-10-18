"""
Django settings for the Revenact backend.

Docs: https://docs.djangoproject.com/en/5.2/topics/settings/
"""

import sys
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# SOC2:SEC-06 secure defaults: DEBUG is off unless the environment says
# otherwise (.env.example turns it on for local dev).
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173"]),
    CSRF_TRUSTED_ORIGINS=(list, []),
)
# Reads .env if present; real environment variables always take precedence.
environ.Env.read_env(BASE_DIR / ".env")

# --- Core -------------------------------------------------------------------

DEBUG = env("DEBUG")
# True under `manage.py test`: swaps external services (Redis) for in-memory
# ones and disables auth rate limits so the suite isn't throttled.
TESTING = "test" in sys.argv

# SOC2:SEC-06 no default credentials in production. Dev gets a throwaway key
# when DEBUG is on; anything else must set SECRET_KEY explicitly.
SECRET_KEY = env("SECRET_KEY", default="")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-dev-key-change-in-production"  # soc2:ignore dev-only
    else:
        raise ImproperlyConfigured("SECRET_KEY must be set when DEBUG is off.")
elif SECRET_KEY.startswith("django-insecure") and not DEBUG:
    raise ImproperlyConfigured("SECRET_KEY is the insecure dev placeholder; set a real one.")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# --- Applications -------------------------------------------------------------

INSTALLED_APPS = [
    # Multiplayer Copilot Phase 2b's own real-time push (see
    # services/copilot/consumers.py) — "daphne" first is required by
    # Channels itself: it auto-patches `manage.py runserver` to serve
    # ASGI (HTTP + WebSocket both) instead of plain WSGI, so the exact
    # same dev command already in use keeps working, no new process to
    # start by hand.
    "daphne",
    "channels",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    # Local
    "core",
    "services.accounts",
    "services.customers",
    "services.scenarios",
    "services.webhooks",
    "services.fx_rates",
    "services.campaigns",
    "services.copilot",
    "services.notifications",
    "services.custom_objects",
    "services.connectors",
    "services.mail",
    "services.calendar",
    "services.emailagent",
    "services.metrics",
    "services.knowledge",
    "services.identity",
    "services.platform",
    "services.billing",
    "services.attributes",
    "services.attention",
    "services.requests",
    "services.anomalies",
    "services.translation",
    "services.mcp",
    "services.organizations",
    "services.accounts_portfolio",
    "services.account_story",
    "services.pipelines_portfolio",
    "services.segments",
    "services.surveys",
    "services.rules",
    "services.plans",
    "services.brain",
    "services.work",
    "services.agents",
]

# Custom user model — Organisation-scoped, email as USERNAME_FIELD. The app
# is named `accounts` (not `auth`) to avoid colliding with django.contrib.auth's
# app label, but it's mounted at /api/v1/auth/ to match the frontend's
# features/auth/ domain — see docs/API_CONTRACTS.md. Lives at
# services/accounts/ (see services/accounts/apps.py's explicit `label`),
# but the app label itself — and so AUTH_USER_MODEL, migration
# dependencies, and every ForeignKey("accounts.X")/("customers.X") string
# elsewhere — is unaffected by where the package physically lives.
AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "core.middleware.RequestIDMiddleware",  # SOC2:API-05 first, so every log line has the id
    "django.middleware.security.SecurityMiddleware",
    # Serves /static/ (the admin's and the API docs' assets) from Django
    # itself, so the Cloud Run ingress container only has to proxy.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # must sit above CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Multiplayer Copilot Phase 2b's own real-time push — config.asgi routes
# WebSocket connections through Channels (HTTP still goes through the
# exact same Django app WSGI_APPLICATION above does; nothing about REST
# changed). See services/copilot/consumers.py's own docstring.
ASGI_APPLICATION = "config.asgi.application"

# Real Redis-backed channel layer — required once more than one server
# process exists (a single `manage.py runserver` would work fine with
# the in-memory layer too, but that silently stops working the moment a
# second process joins, with no error — see services/copilot/realtime.py's
# own docstring). Runs via Docker locally (`docker compose up -d redis`,
# see docker-compose.yml), not installed on this machine directly — the
# user's own explicit choice.
#
# `manage.py test` swaps this for the in-memory backend instead — same
# "don't make the real test suite depend on a real external service"
# discipline as mocking the real Anthropic API call (see
# anthropic_client.py) or the real embedding model in most copilot
# tests: real Redis reachability isn't what these tests are about, and
# a broken/unreachable Redis would otherwise fail unrelated tests all
# over the suite (any view that calls
# services.copilot.realtime.broadcast_session_update), not just the
# ones actually exercising real-time push (see test_consumers.py, which
# re-overrides this to the exact same in-memory backend deliberately,
# self-documenting the choice for its own module rather than relying on
# this one).
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": (
            "channels.layers.InMemoryChannelLayer"
            if "test" in sys.argv
            else "channels_redis.core.RedisChannelLayer"
        ),
        "CONFIG": {}
        if "test" in sys.argv
        else {"hosts": [env("REDIS_URL", default="redis://localhost:6379/0")]},
    },
}

# --- Cache --------------------------------------------------------------------
# Only consumer today is the auth rate limiting (core/throttling.py). Redis in
# production (the same one the channel layer uses) so the counters survive a
# restart; in-memory under test and in DEBUG, so a local login doesn't need
# Redis to be up. Throttling still works in dev, per process.

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    if TESTING or DEBUG
    else {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}
}

# --- Database -----------------------------------------------------------------
# Defaults to the docker-compose Postgres instance; override via DATABASE_URL.

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://revenact:revenact@localhost:5432/revenact",  # soc2:ignore dev-only
    )
}

# --- Auth -----------------------------------------------------------------------

# SOC2:AUTH-04 password policy: 12+ characters, not a common password, not
# derived from the user's own name/email, no composition rules (NIST 800-63B).
# Enforced by services/accounts/serializers.py on signup, admin-set,
# self-service change and reset — not only by createsuperuser.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# SOC2:AUTH-04 / SEC-07 Argon2id for new hashes; PBKDF2 stays listed so
# existing hashes still verify and are upgraded on the user's next login.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
if TESTING:
    # Argon2 is deliberately slow; hundreds of test users made the suite take
    # 13+ minutes on CI. The one test that checks the production hasher
    # overrides this back (test_password_policy.test_new_hashes_use_argon2).
    PRODUCTION_PASSWORD_HASHERS = PASSWORD_HASHERS
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# --- i18n -----------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static -----------------------------------------------------------------------

STATIC_URL = "static/"
# Collected at image build (Dockerfile) and served by WhiteNoise (see
# MIDDLEWARE); the dev server serves the admin's assets itself.
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded files (Files tab, call transcripts). A private directory — the
# deployment mounts a volume here — served only through the authenticated
# download view (services/customers/files.py), never by Caddy or MEDIA_URL.
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))
# On Cloud Run there is no lasting disk: with GS_BUCKET_NAME set, uploads live
# in that private Cloud Storage bucket (uniform access, public access
# prevented — no per-object ACLs) and are still read only through the
# authenticated download view, via the storage API. file_overwrite off keeps
# the filesystem's never-overwrite naming; querystring_auth stays on so a
# stray .url() can only ever produce a signed, expiring link.
GS_BUCKET_NAME = env("GS_BUCKET_NAME", default="")
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.gcloud.GoogleCloudStorage",
        "OPTIONS": {
            "bucket_name": GS_BUCKET_NAME,
            "default_acl": None,
            "file_overwrite": False,
            "querystring_auth": True,
        },
    }
    if GS_BUCKET_NAME and not TESTING
    else {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        if TESTING
        else "whitenoise.storage.CompressedStaticFilesStorage"
    },
}
ATTACHMENT_MAX_BYTES = env.int("ATTACHMENT_MAX_BYTES", default=25 * 1024 * 1024)
FILE_UPLOAD_PERMISSIONS = 0o640
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- CORS -----------------------------------------------------------------------
# The Vite dev server (localhost:5173) is a different origin from the API.

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")

# Behind a TLS-terminating reverse proxy (the deployment's Caddy): trust its
# scheme header so Django builds https links and the admin's CSRF check
# accepts the public origin. Harmless in dev, where nothing sets the header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

# --- Transport security headers (SOC2:API-06, DATA-03, AUTH-05) ------------------
# Applied whenever DEBUG is off. TLS itself terminates at Caddy, which is why
# SECURE_SSL_REDIRECT stays off (the container health check speaks plain
# HTTP to 127.0.0.1). The API is bearer-token based; the cookie settings
# protect the session the Django admin uses.

if not DEBUG:
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = False
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 30 * 60  # admin idle timeout, 30 min
SESSION_SAVE_EVERY_REQUEST = True  # ...measured from the last request, not login
X_FRAME_OPTIONS = "DENY"

# SOC2:API-04 request body ceiling (Django default made explicit).
DATA_UPLOAD_MAX_MEMORY_SIZE = 2_621_440  # 2.5 MB

# --- Django REST Framework -------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    # Auth landed (accounts app) — endpoints require a valid JWT by default
    # now. Views that must stay public (signup, login) set AllowAny
    # explicitly; see accounts/views.py.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    # Behind Caddy the client address is the last X-Forwarded-For hop it
    # appended; 0 means "no proxy, trust REMOTE_ADDR". Used by the auth
    # throttles and audit log to identify the caller.
    "NUM_PROXIES": env.int("NUM_PROXIES", default=1),
    "DEFAULT_THROTTLE_RATES": {},  # filled in below from AUTH_THROTTLE_RATES
}

# SOC2:AUTH-06 rate limits on the public auth endpoints (core/throttling.py,
# applied per view in services/accounts/views.py). None under test.
#: An MCP key can spend the organisation's model budget, so how fast one
#: key may ask is worth a ceiling of its own (core/throttling.py).
MCP_THROTTLE_RATE = env("THROTTLE_MCP", default="60/min")

AUTH_THROTTLE_RATES = {
    "login": env("THROTTLE_LOGIN", default="10/min"),  # per source IP
    "login_account": env("THROTTLE_LOGIN_ACCOUNT", default="5/min"),  # per email
    "signup": env("THROTTLE_SIGNUP", default="5/hour"),
    "password_reset": env("THROTTLE_PASSWORD_RESET", default="5/hour"),
    "token_refresh": env("THROTTLE_TOKEN_REFRESH", default="30/min"),
    # per source IP: the public survey link, reads and answers together
    "survey_link": env("THROTTLE_SURVEY_LINK", default="30/min"),
    # per source IP: the public campaign unsubscribe link, reads and presses together
    "campaign_unsubscribe": env("THROTTLE_CAMPAIGN_UNSUBSCRIBE", default="30/min"),
}
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    scope: (None if TESTING else rate) for scope, rate in AUTH_THROTTLE_RATES.items()
}
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mcp"] = None if TESTING else MCP_THROTTLE_RATE

if DEBUG:
    # Browsable API is convenient in dev only.
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"].append(
        "rest_framework.renderers.BrowsableAPIRenderer"
    )

# --- JWT (djangorestframework-simplejwt) -----------------------------------------

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "UPDATE_LAST_LOGIN": True,
    # SOC2:AUTH-05 every refresh issues a new refresh token and blacklists
    # the one just used, so a stolen refresh token is only good once (the
    # frontend stores the replacement — see authSlice.refreshSession).
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# --- Email (forgot/reset password) -----------------------------------------------
# SMTP creds are optional: with none set, mail falls back to Django's console
# backend (prints to the runserver terminal instead of sending) so local dev
# still works without real credentials. Set EMAIL_HOST_USER/EMAIL_HOST_PASSWORD
# in .env to send for real — see .env.example for the Gmail app-password setup.

EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST_USER
    else "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
# Seconds before a silent SMTP socket gives up: the minute runner
# (`deliver_pending`) sends every workspace's mail in one loop, so a server
# that accepts the connection and then hangs must not stall it.
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=30)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER or "noreply@revenact.local")

# Origin the emailed reset link points at (a frontend route, not this API).
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

# --- Copilot (Anthropic Claude, direct or via AWS Bedrock) --------------------
# The first real LLM integration in this codebase (services.copilot). No real
# credentials for whichever provider is selected means no fake fallback —
# SendMessageView returns a clear 503 instead of pretending to work. Never set
# any of these to a real value here or commit one — see .env.example.
#
# COPILOT_LLM_PROVIDER picks which real backend services.copilot.anthropic_client
# calls: "anthropic" (default) hits Anthropic's own API directly with
# ANTHROPIC_API_KEY (get one at https://console.anthropic.com/); "bedrock" calls
# the exact same Claude model through AWS Bedrock instead, using real AWS
# credentials — requires Bedrock model access to have already been requested/
# approved for that model in your own AWS account and region (a one-time
# AWS Console step this app can't do for you) and BEDROCK_MODEL_ID to be the
# real model id from that same console, not the "anthropic"-provider one above
# (they use different id formats).
COPILOT_LLM_PROVIDER = env("COPILOT_LLM_PROVIDER", default="anthropic")
# Tokens (input + output) any one purpose may spend per organisation per
# calendar month before get_completion refuses the call, unless a
# copilot.ModelBudget row says otherwise. Generous by default — the point is
# that a runaway agent stops, not that a busy team is throttled.
MODEL_BUDGET_DEFAULT_TOKENS = env.int("MODEL_BUDGET_DEFAULT_TOKENS", default=2_000_000)
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", default="claude-sonnet-5")
AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
AWS_REGION = env("AWS_REGION", default="")
BEDROCK_MODEL_ID = env("BEDROCK_MODEL_ID", default="")
# "gemini": Gemini on Vertex AI with the runtime's own Google credentials
# (Application Default Credentials — Cloud Run's service account, or
# `gcloud auth application-default login` locally), no API key. Each call is
# routed by its `purpose` to a tier: lite for background work nobody waits on,
# flash for anything a person is waiting for, pro only for work written ahead
# of time. Pro is served from the global endpoint only, not asia-south1.
# thinking_level is MINIMAL on the interactive tiers: measured on Vertex in
# asia-south1, gemini-3.5-flash answered a short CSM question in ~1.6 s at
# MINIMAL against ~5 s at LOW. thinking_headroom is added to each call's
# answer budget because thinking tokens share Gemini's output budget.
GOOGLE_CLOUD_PROJECT = env("GOOGLE_CLOUD_PROJECT", default="")
# Plain Copilot sends on Gemini may call search tools while answering
# (services/copilot/agentic.py). Off: single-shot, as before.
COPILOT_AGENTIC = env.bool("COPILOT_AGENTIC", default=True)
# Load the Copilot's embedding model as the ASGI app starts (config/asgi.py)
# rather than at the first Copilot send; on for Cloud Run's web service.
EMBEDDINGS_PRELOAD = env.bool("EMBEDDINGS_PRELOAD", default=False)
# Text embeddings (services/copilot/embeddings.py), stored with pgvector.
# "gemini": Vertex AI with the runtime's Google credentials (Cloud Run);
# "local": sentence-transformers from requirements-dev.txt (development).
EMBEDDINGS_PROVIDER = env("EMBEDDINGS_PROVIDER", default="local")
EMBEDDINGS_MODEL = env("EMBEDDINGS_MODEL", default="gemini-embedding-001")
EMBEDDINGS_DIMENSIONS = env.int("EMBEDDINGS_DIMENSIONS", default=768)
EMBEDDINGS_LOCATION = env("EMBEDDINGS_LOCATION", default="asia-south1")
# Stored vectors unused this long are pruned nightly. SOC2:DATA-04
EMBEDDING_RETENTION_DAYS = env.int("EMBEDDING_RETENTION_DAYS", default=30)
GEMINI_TIERS = {
    "lite": {
        "model": env("GEMINI_LITE_MODEL", default="gemini-3.5-flash-lite"),
        "location": env("GEMINI_LITE_LOCATION", default="asia-south1"),
        "thinking_level": env("GEMINI_LITE_THINKING", default="MINIMAL"),
        "thinking_headroom": 512,
    },
    "flash": {
        "model": env("GEMINI_FLASH_MODEL", default="gemini-3.5-flash"),
        "location": env("GEMINI_FLASH_LOCATION", default="asia-south1"),
        "thinking_level": env("GEMINI_FLASH_THINKING", default="MINIMAL"),
        "thinking_headroom": 2048,
    },
    "pro": {
        "model": env("GEMINI_PRO_MODEL", default="gemini-3.1-pro-preview"),
        "location": env("GEMINI_PRO_LOCATION", default="global"),
        "thinking_level": env("GEMINI_PRO_THINKING", default=""),
        "thinking_headroom": 8192,
    },
}
# Purposes not listed here run on flash (Copilot, Ask, MCP, explanations,
# anomalies, call summaries, feature-request gathering, the facilitator,
# draft replies and every agent_* purpose). Briefs run on pro, but they are
# still generated on request (Regenerate, first open), so the reader waits
# several seconds; GEMINI_PURPOSE_TIERS="brief=flash,account_brief=flash"
# moves them to flash without a code change.
GEMINI_PURPOSE_TIERS = env.dict(
    "GEMINI_PURPOSE_TIERS",
    default={
        "classification": "lite",
        "translate": "lite",
        "headlines": "lite",
        "attribute": "lite",
        # Send to Revenact answers Slack inside its 3-second window.
        "slack_triage": "lite",
        # Reads internal mail for a task or a meeting (email agent).
        "email_agent": "lite",
        # Slack bundles: the steps for one Slack message, on the per-minute tick.
        "slack_bundle": "lite",
        # Channel tag to-dos: does a synced message's tag ask for something.
        "slack_tag_request": "lite",
        # Guided agent: a record's diagnosis and the email that saves it.
        "agent_diagnose": "flash",
        "agent_compose": "flash",
        # Sales review report: the short summary of the last 30 days.
        "sales_report": "flash",
        "brief": "pro",
        "account_brief": "pro",
        # The golden set's judge: a stronger model than the one it grades.
        "evaluation": "pro",
    },
)
#: Workspaces the nightly job runs Copilot's golden set for (by name).
COPILOT_EVAL_ORGS = env.list("COPILOT_EVAL_ORGS", default=[])
if TESTING:
    import tempfile

    # Uploads from the test suite land in a scratch directory, never in the
    # developer's media folder.
    MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="revenact-test-media-"))
    # WhiteNoise scans STATIC_ROOT when the middleware loads and warns when it
    # is missing (nothing is collected outside the image); tests that assert
    # "never warns" would fail on that, so point it at an empty directory.
    STATIC_ROOT = Path(tempfile.mkdtemp(prefix="revenact-test-static-"))
    # Never a live model call from the test suite: filing mail and the daily
    # job classify records, and a developer's key must not be spent by tests.
    # Tests that need an answer patch get_completion.
    ANTHROPIC_API_KEY = ""
    AWS_ACCESS_KEY_ID = ""
    AWS_SECRET_ACCESS_KEY = ""
    GOOGLE_CLOUD_PROJECT = ""
    # Tests never call Vertex for embeddings; they patch embed() or use the local model.
    EMBEDDINGS_PROVIDER = "local"

# How long a password-reset link stays valid. Consumed by
# django.contrib.auth.tokens.default_token_generator, which accounts/serializers.py
# uses directly — see ForgotPasswordSerializer/ResetPasswordSerializer.
PASSWORD_RESET_TIMEOUT = 60 * 60  # 1 hour

# --- drf-spectacular (OpenAPI schema + Swagger/Redoc UI) -------------------------

SPECTACULAR_SETTINGS = {
    "TITLE": "Revenact API",
    "DESCRIPTION": (
        "Backend API for Revenact, a customer-success intelligence platform. "
        "Built feature-by-feature to mirror the react-ts-app frontend; see "
        "docs/API_CONTRACTS.md in this repo for the running log of decisions."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    # A Slack channel's record (Slack escalations D3) names its own enum.
    "ENUM_NAME_OVERRIDES": {"RecordTypeEnum": ["customer", "account"]},
}

# --- Logging (SOC2:LOG-03, LOG-04) ---------------------------------------------
# JSON lines on stdout in production (shipped by whatever collects container
# logs), plain text in dev. Every record passes core.logging.RedactFilter
# first. The audit trail (core.audit) has its own table; the `core.audit`
# logger is its second copy in the log stream.

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"redact": {"()": "core.logging.RedactFilter"}},
    "formatters": {
        "json": {"()": "core.logging.JSONFormatter"},
        "plain": {"format": "%(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "plain" if DEBUG else "json",
            "filters": ["redact"],
        }
    },
    "root": {
        "handlers": ["console"],
        "level": "WARNING" if TESTING else env("LOG_LEVEL", default="INFO"),
    },
    "loggers": {
        "django.request": {"level": "WARNING"},
        "django.server": {"level": "INFO"},
        "core.audit": {"level": "INFO"},
        "daphne": {"level": "WARNING"},
        # The Gemini SDK logs every model request at INFO (its full URL); the
        # ModelCall row is already the per-call record.
        "httpx": {"level": "WARNING"},
        "google_genai": {"level": "WARNING"},
    },
}

# --- Sign-in with an external provider (services.identity) -----------------
# Off by default. While it is off the endpoints answer as though the feature
# does not exist, so a half-configured deployment never shows a button that
# cannot work. Password sign-in is unaffected either way.
AUTH_V2_ENABLED = env.bool("AUTH_V2_ENABLED", default=False)

# Free and consumer mail providers, which can never establish or join a tenant
# by domain alone — an address there identifies a person, not a company. The
# default list lives in services/identity/domains.py; this only extends or
# replaces it without a release.
PERSONAL_EMAIL_DOMAINS = env.list("PERSONAL_EMAIL_DOMAINS", default=[])

# --- Billing (services.billing) -----------------------------------------------
# What a brand-new workspace gets before anyone pays, as decided in review:
# three seats and a fortnight of AI credits. Seats stay at three until a plan
# is bought, which is what keeps a self-made workspace small.
BILLING_TRIAL_SEATS = env.int("BILLING_TRIAL_SEATS", default=3)
BILLING_TRIAL_CREDITS = env.int("BILLING_TRIAL_CREDITS", default=200)
BILLING_TRIAL_DAYS = env.int("BILLING_TRIAL_DAYS", default=14)
# One model call costs this many credits. Charged before the call, refunded
# if the call fails.
BILLING_CREDITS_PER_MODEL_CALL = env.int("BILLING_CREDITS_PER_MODEL_CALL", default=1)
# Off, seats and credits are still recorded but never refuse anything: the
# ledger shows what would have been billed. For a beta, or an incident.
BILLING_ENFORCED = env.bool("BILLING_ENFORCED", default=True)

# --- Personal mailboxes (services.mail) ------------------------------------
# OAuth clients for the providers a company can connect. A provider is offered
# only when its client is configured; IMAP/SMTP needs nothing. Tokens and
# passwords are encrypted at rest with MAIL_TOKEN_KEY (a Fernet key:
# `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`);
# unset, the key is derived from SECRET_KEY. SOC2:DATA-02
MAIL_TOKEN_KEY = env("MAIL_TOKEN_KEY", default="")
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
MICROSOFT_OAUTH_CLIENT_ID = env("MICROSOFT_OAUTH_CLIENT_ID", default="")
MICROSOFT_OAUTH_CLIENT_SECRET = env("MICROSOFT_OAUTH_CLIENT_SECRET", default="")
MICROSOFT_OAUTH_TENANT = env("MICROSOFT_OAUTH_TENANT", default="common")
# Slack app for ticket connectors (services/connectors/providers/slack.py).
# Optional: a pasted bot token works without it.
SLACK_OAUTH_CLIENT_ID = env("SLACK_OAUTH_CLIENT_ID", default="")
SLACK_OAUTH_CLIENT_SECRET = env("SLACK_OAUTH_CLIENT_SECRET", default="")
# The Slack app's signing secret: proves an interactivity request (the "Send
# to Revenact" shortcut) came from Slack. Empty fails every request closed (401).
# SOC2:SEC-01 from the environment (Secret Manager `slack-signing-secret`).
SLACK_SIGNING_SECRET = env("SLACK_SIGNING_SECRET", default="")
#: The Jira project a Slack message sent to Work files its issue in; blank:
#: the Jira connection's own project.
SLACK_JIRA_PROJECT = env("SLACK_JIRA_PROJECT", default="")
# Per source IP on Slack's public interactivity URL.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["slack_interactivity"] = (
    None if TESTING else env("THROTTLE_SLACK_INTERACTIVITY", default="120/min")
)
# Per source IP on Slack's public Events API URL (Slack escalations D3, SC3-29).
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["slack_events"] = (
    None if TESTING else env("THROTTLE_SLACK_EVENTS", default="1200/min")
)
# Atlassian OAuth 2.0 (3LO) app: a person links their own Jira account so the
# Jira steps they run act as them (agent bundles round 2 D2). Both empty: off.
ATLASSIAN_OAUTH_CLIENT_ID = env("ATLASSIAN_OAUTH_CLIENT_ID", default="")
ATLASSIAN_OAUTH_CLIENT_SECRET = env("ATLASSIAN_OAUTH_CLIENT_SECRET", default="")
#: Agent bundles D3 (D3-21): how long a Slack or Jira call by an agent step waits.
AGENT_TOOL_TIMEOUT_SECONDS = env.int("AGENT_TOOL_TIMEOUT_SECONDS", default=15)
# Where a provider sends the browser back after consent; the API's own
# public origin (Caddy fronts it), e.g. https://revenact.example.com.
MAIL_OAUTH_REDIRECT_BASE = env("MAIL_OAUTH_REDIRECT_BASE", default="")
# services/calendar: a connection's calendar syncs at most this often (on the mail tick).
CALENDAR_SYNC_INTERVAL_SECONDS = env.int("CALENDAR_SYNC_INTERVAL_SECONDS", default=300)
# --- Two-way Gmail (services.mail; contract docs/superpowers/plans/2026-10-10-gmail-sync-api.md)
# `sync_mail --loop` ticks every MAIL_SYNC_TICK_SECONDS. A Google mailbox is due every
# MAIL_SYNC_INTERVAL_SECONDS or on a push; Outlook and IMAP every
# MAIL_LEGACY_SYNC_INTERVAL_SECONDS (today's cadence).
MAIL_SYNC_TICK_SECONDS = env.int("MAIL_SYNC_TICK_SECONDS", default=5)
MAIL_SYNC_INTERVAL_SECONDS = env.int("MAIL_SYNC_INTERVAL_SECONDS", default=60)
MAIL_LEGACY_SYNC_INTERVAL_SECONDS = env.int("MAIL_LEGACY_SYNC_INTERVAL_SECONDS", default=600)
MAIL_SYNC_BATCH = env.int("MAIL_SYNC_BATCH", default=10)
MAIL_LEASE_SECONDS = env.int("MAIL_LEASE_SECONDS", default=300)
MAIL_BACKOFF_MAX_SECONDS = env.int("MAIL_BACKOFF_MAX_SECONDS", default=900)
MAIL_IMPORT_MONTHS = env.int("MAIL_IMPORT_MONTHS", default=12)
MAIL_IMPORT_PAGE_SIZE = env.int("MAIL_IMPORT_PAGE_SIZE", default=100)
MAIL_RECONCILE_DAYS = env.int("MAIL_RECONCILE_DAYS", default=30)
# Personal copies kept after a Google disconnect, then pruned nightly. SOC2:DATA-04
MAIL_DISCONNECT_RETENTION_DAYS = env.int("MAIL_DISCONNECT_RETENTION_DAYS", default=30)
MAIL_HTML_MAX_BYTES = env.int("MAIL_HTML_MAX_BYTES", default=1_000_000)
# Pub/Sub push (optional). Empty topic: push off, the 60-second check alone.
# With a topic, an empty audience or service account fails every push closed (401).
GMAIL_PUBSUB_TOPIC = env("GMAIL_PUBSUB_TOPIC", default="")
GMAIL_PUBSUB_AUDIENCE = env("GMAIL_PUBSUB_AUDIENCE", default="")
GMAIL_PUBSUB_SERVICE_ACCOUNT = env("GMAIL_PUBSUB_SERVICE_ACCOUNT", default="")
# Sync the woken mailbox inside the push request instead of waiting for the
# next mail tick (Cloud Run, where nothing runs between requests).
MAIL_SYNC_ON_PUSH = env.bool("MAIL_SYNC_ON_PUSH", default=False)
# Scheduled ticks (core/ticks.py): Cloud Scheduler's OIDC token must carry this
# audience and service account; either unset fails every tick closed (401).
TICK_AUDIENCE = env("TICK_AUDIENCE", default="")
TICK_SERVICE_ACCOUNT = env("TICK_SERVICE_ACCOUNT", default="")
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["tick"] = (
    None if TESTING else env("THROTTLE_TICK", default="60/min")
)
# Google's limit on test users while the app is unverified; shown in the portal.
GMAIL_TEST_USER_CAP = env.int("GMAIL_TEST_USER_CAP", default=100)
# Per source IP on the public push webhook.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["gmail_push"] = (
    None if TESTING else env("THROTTLE_GMAIL_PUSH", default="600/min")
)
# Two-way Gmail delivery 2: the outbox (services/mail/outbox.py, outbox_flush.py).
# The fifth counted failure fails a row; the waits after failures 1 to 4 follow.
MAIL_OUTBOX_MAX_ATTEMPTS = env.int("MAIL_OUTBOX_MAX_ATTEMPTS", default=5)
MAIL_OUTBOX_RETRY_SECONDS = [
    int(seconds)
    for seconds in env.list("MAIL_OUTBOX_RETRY_SECONDS", default=["30", "120", "600", "3600"])
]
MAIL_OUTBOX_BATCH_SIZE = env.int("MAIL_OUTBOX_BATCH_SIZE", default=1000)
MAIL_OUTBOX_SINGLE_CALLS_PER_TICK = env.int("MAIL_OUTBOX_SINGLE_CALLS_PER_TICK", default=200)
# sync_issue's window; failed rows are pruned after it. SOC2:DATA-04
MAIL_OUTBOX_ISSUE_DAYS = env.int("MAIL_OUTBOX_ISSUE_DAYS", default=7)
MAIL_OUTBOX_SENT_RETENTION_HOURS = env.int("MAIL_OUTBOX_SENT_RETENTION_HOURS", default=24)
MAIL_ACTION_MAX_MESSAGES = env.int("MAIL_ACTION_MAX_MESSAGES", default=1000)
MAIL_THREAD_MAX_MESSAGES = env.int("MAIL_THREAD_MAX_MESSAGES", default=100)
# Gmail's receiving limit; larger attachments open in Gmail only.
MAIL_ATTACHMENT_MAX_BYTES = env.int("MAIL_ATTACHMENT_MAX_BYTES", default=50 * 1024 * 1024)
# Per user on attachment downloads (a first open costs two Gmail calls).
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_attachment"] = (
    None if TESTING else env("THROTTLE_MAIL_ATTACHMENT", default="120/min")
)

# Two-way Gmail delivery 3: drafts and sending (services/mail/drafts.py, draft_send.py).
# Decision 20: every attachment's bytes plus the html and text bodies, decoded.
MAIL_SEND_MAX_BYTES = env.int("MAIL_SEND_MAX_BYTES", default=26_214_400)
MAIL_SEND_MAX_RECIPIENTS = env.int("MAIL_SEND_MAX_RECIPIENTS", default=100)
MAIL_DRAFT_MAX_ATTACHMENTS = env.int("MAIL_DRAFT_MAX_ATTACHMENTS", default=25)
MAIL_SEND_AS_REFRESH_HOURS = env.int("MAIL_SEND_AS_REFRESH_HOURS", default=24)
MAIL_OUTBOX_DRAFT_CALLS_PER_TICK = env.int("MAIL_OUTBOX_DRAFT_CALLS_PER_TICK", default=50)
# The upload calls carry up to about 34 MB.
MAIL_SEND_TIMEOUT_SECONDS = env.int("MAIL_SEND_TIMEOUT_SECONDS", default=120)
MAIL_GMAIL_SEARCH_PAGE_SIZE = env.int("MAIL_GMAIL_SEARCH_PAGE_SIZE", default=20)
# Sent MailDraft rows are pruned nightly; the sent message stays. SOC2:DATA-04
MAIL_DRAFT_SENT_RETENTION_DAYS = env.int("MAIL_DRAFT_SENT_RETENTION_DAYS", default=7)
# Per user: a search page costs about 105 of Gmail's 250 quota units a second.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_gmail_search"] = (
    None if TESTING else env("THROTTLE_MAIL_GMAIL_SEARCH", default="30/min")
)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_draft_upload"] = (
    None if TESTING else env("THROTTLE_MAIL_DRAFT_UPLOAD", default="60/min")
)
