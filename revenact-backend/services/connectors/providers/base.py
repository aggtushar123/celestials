"""What every ticket source looks like from the inside.

Zendesk, Jira, Slack and Freshdesk behind one small surface — plus the
inbound webhook for anything else — so the sync never knows which one
it talks to. Plain HTTPS through urllib, no vendor SDKs.
"""

import http.client
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timezone


class ProviderError(Exception):
    """The provider refused or failed; `reauth` says whether the admin
    must reconnect (revoked token) rather than retry. `status` is the HTTP
    status (None: no answer), `code` a vendor's own error code (Slack's
    `not_in_channel`), `body` a refusal's parsed JSON body."""

    def __init__(self, message, *, reauth=False, status=None, code="", body=None):
        super().__init__(message)
        self.reauth = reauth
        self.status = status
        self.code = code
        self.body = body


class NoAnswer(ProviderError):
    """A write went out and no answer came back: it may have happened
    (agent bundles D3-13). Never retried on its own; the next Retry looks first."""


@dataclass
class RemoteTicket:
    """One ticket as the source system reports it, already in this
    product's vocabulary (Ticket.Status / Ticket.Priority values)."""

    external_id: str
    title: str
    number: str = ""
    description: str = ""
    status: str = "open"
    priority: str = "medium"
    requester_email: str = ""
    requester_name: str = ""
    assignee_name: str = ""
    url: str = ""
    opened_at: date | None = None
    resolved_at: date | None = None
    extra: dict = field(default_factory=dict)


@dataclass
class RemoteThread:
    """One Slack thread as the provider reads it (Slack escalations D1,
    contract §2). `replies` is None when they were not fetched this pass:
    keep what is stored."""

    thread_ts: str
    channel: str
    text: str
    user_id: str
    user_name: str
    user_email: str
    posted_at: datetime
    latest_reply: str
    replies: list | None
    url: str
    #: Slack escalations D4 (SE4-24): {user id: {"name", "email"}} for the
    #: thread's posters and the people its messages mention, as Slack names
    #: them. The sync keeps the names and the members they are, never the email.
    people: dict = field(default_factory=dict)


@dataclass
class SetupField:
    """One input on the connect form. `secret` inputs are stored
    encrypted and never shown again."""

    name: str
    label: str
    secret: bool = False
    placeholder: str = ""
    required: bool = True

    def as_dict(self):
        return {
            "name": self.name,
            "label": self.label,
            "secret": self.secret,
            "placeholder": self.placeholder,
            "required": self.required,
        }


class TicketProvider:
    key = ""
    label = ""
    number_prefix = ""
    uses_oauth = False
    fields: list[SetupField] = []
    #: What the admin sees under the form.
    help = ""

    @classmethod
    def oauth_configured(cls) -> bool:
        return False

    def describe(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "fields": [f.as_dict() for f in self.fields],
            "uses_oauth": self.uses_oauth and self.oauth_configured(),
            "help": self.help,
        }

    def connect(self, form: dict) -> tuple[dict, dict]:
        """Verify the form against the provider and return
        (config, credentials): the non-secret setup and the secret."""
        raise NotImplementedError

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        raise NotImplementedError

    def exchange_code(self, code: str, redirect_uri: str, form: dict) -> tuple[dict, dict]:
        raise NotImplementedError

    def fetch_tickets(
        self, config: dict, creds: dict, cursor: str
    ) -> tuple[list[RemoteTicket], str, dict]:
        """Tickets new or changed since `cursor`, the new cursor, and the
        credentials (refreshed if the provider rotates them)."""
        raise NotImplementedError


#: Where a provider may send a request. Vendor tenants live on
#: subdomains, so those are matched by suffix; the rest exactly.
#: hooks.slack.com: a "Send to Revenact" answer through Slack's response_url.
ALLOWED_HOSTS = {"slack.com", "hooks.slack.com", "api.atlassian.com", "auth.atlassian.com"}
ALLOWED_HOST_SUFFIXES = (".zendesk.com", ".atlassian.net", ".freshdesk.com")

_TENANT = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


def tenant(value: str, suffix: str) -> str:
    """'acme', 'acme.zendesk.com' or a pasted 'https://acme.zendesk.com/any/path'
    → 'acme.zendesk.com': only the host is kept, and it must be one tenant
    name under `suffix` (no other hosts, no user info: the SSRF guard)."""
    value = (value or "").strip().lower()
    name = re.sub(r"^https?://", "", value).rstrip("/")
    url = value if "://" in value else f"https://{value}"
    try:
        parts = urllib.parse.urlsplit(url)
        host = parts.hostname or ""
    except ValueError:  # an unbalanced "[" in the host
        parts, host = None, ""
    pasted = parts and parts.scheme in ("http", "https") and "@" not in parts.netloc
    if pasted and host.endswith(suffix):
        # A URL pasted from the address bar: its path, query and port go.
        name = host
    if name.endswith(suffix):
        name = name[: -len(suffix)]
    if not _TENANT.match(name):
        raise ProviderError(f"'{name[:80]}' is not a valid {suffix.lstrip('.')} tenant.")
    return name + suffix


def _host_allowed(hostname: str) -> bool:
    return hostname in ALLOWED_HOSTS or hostname.endswith(ALLOWED_HOST_SUFFIXES)


def http_call(method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
    """One JSON round-trip: (body, lower-cased response headers). Raises
    ProviderError with the body's message; for a `write`, a timeout or a
    dropped connection after the request went out raises NoAnswer."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or not _host_allowed(parts.hostname):
        raise ProviderError(f"refusing to call {parts.hostname or url!r}: not a ticket source host")
    body = None
    headers = dict(headers or {})
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        body = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    headers.setdefault("Accept", "application/json")
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        # https only, host allow-listed above (semgrep: dynamic-urllib-use)
        with urllib.request.urlopen(request, timeout=timeout) as response:  # nosemgrep
            raw = response.read()
            answered = {str(k).lower(): v for k, v in response.headers.items()}
            return (json.loads(raw) if raw else {}), answered
    except urllib.error.HTTPError as exc:
        try:
            text = exc.read().decode(errors="replace")
        except (OSError, http.client.HTTPException, ValueError):
            # The tool answered with a status; only its body was lost (R2D1-8).
            text = ""
        try:
            parsed = json.loads(text) if text else None
        except ValueError:
            parsed = None
        raise ProviderError(
            f"{exc.code} from {parts.netloc}: {text[:300]}",
            reauth=exc.code in (401, 403),
            status=exc.code,
            body=parsed if isinstance(parsed, dict) else None,
        ) from exc
    except urllib.error.URLError as exc:
        # Raised before the request was sent (no route, refused, DNS): nothing happened.
        raise ProviderError(f"could not reach {parts.netloc}: {exc.reason}") from exc
    except (TimeoutError, ConnectionError, http.client.HTTPException) as exc:
        if write:
            raise NoAnswer(f"{parts.netloc} did not answer: {type(exc).__name__}") from exc
        raise ProviderError(f"{parts.netloc} did not answer: {type(exc).__name__}") from exc
    except json.JSONDecodeError as exc:
        raise ProviderError(f"{parts.netloc} did not answer with JSON") from exc


def http_json(method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
    """One JSON round-trip; the body only (see http_call)."""
    return http_call(
        method, url, headers=headers, data=data, form=form, timeout=timeout, write=write
    )[0]


def basic_auth(user: str, password: str) -> dict:
    import base64

    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def parse_datetime(value) -> datetime | None:
    """ISO 8601 (with Z or an offset) or an epoch → aware datetime, else None."""
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    # Jira writes +0000 without the colon.
    text = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", text)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def as_date(value) -> date | None:
    parsed = parse_datetime(value)
    return parsed.date() if parsed else None


def first_line(text: str, limit: int = 255) -> str:
    line = next((ln.strip() for ln in (text or "").splitlines() if ln.strip()), "")
    return line[:limit]
