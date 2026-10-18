"""What every mailbox provider looks like from the inside.

Three implementations (google, microsoft, imap) behind one small surface,
so the sync and the compose endpoint never know which one they talk to.
Plain HTTP through urllib and the standard library's imaplib/smtplib —
no vendor SDKs to pin, patch or explain to an auditor.
"""

import http.client
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime


class ProviderError(Exception):
    """The provider refused or failed. `reauth` says whether the person must
    reconnect (expired or revoked grant) rather than retry. `status` is the
    HTTP status (None: no answer), `reason` the provider's machine reason
    (`invalid_grant`, `rateLimitExceeded`, ...), `retry_after` the seconds a
    Retry-After header asked for."""

    def __init__(self, message, *, reauth=False, status=None, reason="", retry_after=None):
        super().__init__(message)
        self.reauth = reauth
        self.status = status
        self.reason = reason
        self.retry_after = retry_after


#: Google's 403 reasons that mean "slow down", not "you may not".
RATE_LIMIT_REASONS = frozenset({"rateLimitExceeded", "userRateLimitExceeded"})


def error_reason(raw):
    """The machine reason in an error body: OAuth's `error` string, else
    Google's `error.errors[0].reason`, else `error.status`; '' otherwise."""
    try:
        body = json.loads(raw)
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        for item in error.get("errors") or []:
            if isinstance(item, dict) and item.get("reason"):
                return str(item["reason"])
        return str(error.get("status") or "")
    return ""


def _retry_after(headers):
    try:
        return max(int(headers.get("Retry-After")), 0) if headers is not None else None
    except (TypeError, ValueError):
        return None


class SendUnconfirmed(TimeoutError):
    """The message was handed to the provider and no answer came back (a
    dropped connection, a timeout): it may have been sent. Deliberately not
    a ProviderError, so a reply draft is left claimed (504
    SEND_UNCONFIRMED), never reopened to go out twice."""


@dataclass
class Message:
    provider_id: str
    thread_id: str
    subject: str
    from_address: str
    from_name: str
    to: list[tuple[str, str]]  # (name, address)
    date: datetime
    body: str
    headers: dict = field(default_factory=dict)
    #: Provider state, normalised to one vocabulary so the store never has to
    #: know Gmail from Graph from IMAP: any of LABELS below.
    labels: list[str] = field(default_factory=list)
    #: Gmail splits these out of `to`; Graph and IMAP merge Cc into `to` and
    #: leave both empty. Filing counts to + cc; bcc is never filed.
    cc: list[tuple[str, str]] = field(default_factory=list)
    bcc: list[tuple[str, str]] = field(default_factory=list)
    #: The raw text/html part. services.mail.html sanitises it before it is stored.
    html: str = ""
    rfc_message_id: str = ""
    references: str = ""
    #: Gmail's own label ids, every one (system and user). Empty elsewhere.
    label_ids: list[str] = field(default_factory=list)
    #: The provider placed it in the original's own conversation (Gmail's
    #: threadId; Graph's reply). Round 2 D1 R2D1-12, R2D1-13.
    threaded: bool = False
    #: File parts: part_id, attachment_id, filename, mime_type, size,
    #: content_id, is_inline.
    attachments: list[dict] = field(default_factory=list)
    #: The Reply-To header (Gmail only).
    reply_to: list[tuple[str, str]] = field(default_factory=list)


#: The only labels a provider may hand back. Folder ones say where the message
#: sits, flag ones how the person left it, category ones what the provider
#: thinks it is.
LABELS = frozenset(
    {
        "inbox",
        "sent",
        "draft",
        "spam",
        "trash",
        "unread",
        "starred",
        "important",
        "promotions",
        "social",
        "updates",
        "forums",
        "personal",
        # Neither in the inbox nor in any other folder: archived. The store
        # shows it as done rather than pretending it is still waiting.
        "archive",
    }
)


@dataclass
class Credentials:
    """Whatever the provider needs, plus the mailbox's own address."""

    address: str
    display_name: str = ""
    data: dict = field(default_factory=dict)
    #: The scopes the provider granted, as it named them (Google's token answer).
    scopes: list[str] = field(default_factory=list)


class MailProvider:
    key = ""
    label = ""
    uses_oauth = True

    @classmethod
    def configured(cls) -> bool:
        return True

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        raise NotImplementedError

    def exchange_code(self, code: str, redirect_uri: str) -> Credentials:
        raise NotImplementedError

    def connect_with_password(self, form: dict) -> Credentials:
        raise NotImplementedError

    def fetch_messages(
        self, creds: Credentials, cursor: str
    ) -> tuple[list[Message], str, Credentials]:
        """Messages newer than `cursor` (provider-specific), the new cursor,
        and the credentials (refreshed tokens included)."""
        raise NotImplementedError

    def send(
        self, creds: Credentials, *, to: list[str], subject: str, body: str, in_reply_to: str = ""
    ) -> Message:
        """Send as the mailbox. `in_reply_to` is the Message-ID of the mail
        this answers, sent as `In-Reply-To` and `References` where the
        provider lets a sender set headers."""
        raise NotImplementedError


#: The only hosts a provider may talk to. Every URL — including the paging
#: links a provider hands back — is checked against this before a request.
ALLOWED_HOSTS = {
    "accounts.google.com",
    "oauth2.googleapis.com",
    "gmail.googleapis.com",
    "login.microsoftonline.com",
    "graph.microsoft.com",
}


def _checked(url, allowed_hosts=None):
    """Refuses any URL that is not https on an allowed host."""
    permitted = allowed_hosts if allowed_hosts is not None else ALLOWED_HOSTS
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in permitted:
        raise ProviderError(f"refusing to call {parts.hostname or url!r}: host not allowed")


def _open(request, url, timeout):
    """One round-trip; the JSON answer, or ProviderError with the body's message."""
    try:
        # https only, host allow-listed by _checked (semgrep: dynamic-urllib-use)
        with urllib.request.urlopen(request, timeout=timeout) as response:  # nosemgrep
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read().decode(errors="replace")
        except (OSError, http.client.HTTPException, ValueError):
            # The provider answered with a status; only its body was lost (R2D1-8).
            raw = ""
        reason = error_reason(raw)
        raise ProviderError(
            f"{exc.code} from {urllib.parse.urlsplit(url).netloc}: {raw[:500]}",
            # A rate limit is not a lost grant (Google answers some with 403).
            reauth=exc.code == 401 or (exc.code == 403 and reason not in RATE_LIMIT_REASONS),
            status=exc.code,
            reason=reason,
            retry_after=_retry_after(exc.headers),
        ) from exc
    except urllib.error.URLError as exc:
        raise ProviderError(
            f"could not reach {urllib.parse.urlsplit(url).netloc}: {exc.reason}"
        ) from exc


def http_json(method, url, *, headers=None, data=None, form=None, timeout=30, allowed_hosts=None):
    """One JSON round-trip. `form` posts urlencoded (OAuth token endpoints),
    `data` posts JSON. Raises ProviderError with the body's message.

    `allowed_hosts` lets another caller supply its own allow-list rather than
    widening this module's: `services.identity.domains` resolves DNS over
    HTTPS through here, and a resolver is not a mail provider host. The check
    itself is never optional — omitting the argument keeps the mail list."""
    _checked(url, allowed_hosts)
    body = None
    headers = dict(headers or {})
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        body = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    return _open(request, url, timeout)


def http_upload(method, url, *, headers=None, metadata=None, payload=b"", timeout=30):
    """One Gmail upload (`uploadType=multipart`, D3 decision 19): `metadata`
    as the JSON part, `payload` (a whole RFC 822 message) as the media part.
    The same host allow-list and errors as http_json. A timeout or a dropped
    connection once the body went out is raised as it is: for a send, the
    caller treats it as possibly sent."""
    _checked(url)
    boundary = f"revenact{secrets.token_hex(16)}"
    body = b"".join(
        [
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode(),
            json.dumps(metadata or {}).encode(),
            f"\r\n--{boundary}\r\nContent-Type: message/rfc822\r\n\r\n".encode(),
            payload,
            f"\r\n--{boundary}--".encode(),
        ]
    )
    headers = {**(headers or {}), "Content-Type": f'multipart/related; boundary="{boundary}"'}
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    return _open(request, url, timeout)


def parse_address(value: str) -> tuple[str, str]:
    """'Ada Lovelace <ada@example.com>' → ('Ada Lovelace', 'ada@example.com')."""
    from email.utils import parseaddr

    name, address = parseaddr(value or "")
    return name.strip(), address.strip().lower()


def parse_address_list(value: str) -> list[tuple[str, str]]:
    from email.utils import getaddresses

    return [
        (name.strip(), address.strip().lower())
        for name, address in getaddresses([value or ""])
        if address
    ]
