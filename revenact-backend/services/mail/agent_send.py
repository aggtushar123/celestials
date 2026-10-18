"""An agent step's reply, sent from the runner's own mailbox (agent bundles
D3 contract §2.1, D3-1 to D3-3, D3-11, D3-13).

Today's send path (`sync.send_email`: Gmail's MIME builder and threading
from Gmail D3, Graph's sendMail) carries the step's key in an
`X-Revenact-Step` header, the Gmail send-as signature, cc and the answering
headers. `find` looks the key up in the mailbox's sent mail since a time, so
a Retry never sends twice. IMAP can't be looked up reliably and never sends
for an agent. Every refusal is a plain sentence; no log line names a
recipient or a subject."""

import http.client
import logging
from dataclasses import dataclass

from django.db import transaction

from . import gmail_sync, signing
from . import html as html_mod
from .models import MailboxConnection, MailMessage
from .providers.base import RATE_LIMIT_REASONS, ProviderError, SendUnconfirmed
from .providers.microsoft import MicrosoftProvider
from .sync import _credentials, _store, file_sent, send_via_provider

logger = logging.getLogger(__name__)
C = MailboxConnection
MARKER = "X-Revenact-Step"
#: How many recent sent messages a Gmail lookup reads the headers of, at most.
LOOK_LIMIT = 100
#: Sent-mail stubs per Gmail list page.
LOOK_PAGE = 20

CONNECT = "Connect your mailbox to send this."
RECONNECT = "Reconnect your mailbox to send this."
IMAP = "Replies can't be sent from an IMAP mailbox yet."
GMAIL_EXPIRED = "Your Gmail connection expired. Reconnect it, then Retry."
OUTLOOK_EXPIRED = "Your Outlook connection expired. Reconnect it, then Retry."
REFUSED = "Your mailbox didn't accept the message. Retry it."
BUSY = "Your mailbox is busy. Retry in a minute."
UNCONFIRMED = "We couldn't confirm the email went out. Retry checks your Sent mail first."


class Refused(Exception):
    """Nothing was sent; `sentence` says why."""

    def __init__(self, sentence):
        super().__init__(sentence)
        self.sentence = sentence


class Unconfirmed(Exception):
    """It may have been sent: the next Retry looks first."""

    def __init__(self, sentence=UNCONFIRMED):
        super().__init__(sentence)
        self.sentence = sentence


@dataclass(frozen=True)
class SentReply:
    email_id: int | None
    message_id: int | None
    provider_id: str
    threaded: bool
    address: str
    provider: str


def blocked(connection):
    """Why this mailbox can't send an agent's reply, or None (contract §5.1;
    round 2 D2 R2D2-19: no credentials, no send, whichever provider)."""
    if connection is None or connection.status == C.Status.DISCONNECTED:
        return CONNECT
    if connection.provider == C.Provider.IMAP:
        return IMAP
    if not connection.credentials:
        return RECONNECT
    if connection.is_google and (not connection.two_way or connection.paused_reason):
        return RECONNECT
    if connection.status != C.Status.CONNECTED:
        return RECONNECT
    return None


def _bodies(connection, body):
    """(html, text): the runner's signature under the body (D3-3, R2D1-15)."""
    markup = html_mod.paragraphs(body) if connection.is_google else ""
    return signing.signed(connection, body, markup)


def _sentence(connection, exc):
    if connection.is_google:
        if gmail_sync.classify_failure(exc) != "backoff":
            gmail_sync.pause_revoked(connection, exc)
            return GMAIL_EXPIRED
        if exc.status == 429 or (exc.status == 403 and exc.reason in RATE_LIMIT_REASONS):
            return BUSY
        return REFUSED
    if exc.reauth:
        connection.status = C.Status.ERROR
        connection.error = str(exc)[:255]
        connection.save(update_fields=["status", "error", "updated_at"])
        return OUTLOOK_EXPIRED
    if exc.status == 429:
        return BUSY
    return REFUSED


def _home_thread(connection, source):
    """The thread of `connection`'s own copy of `source`, or ""."""
    if source is None:
        return ""
    return (
        MailMessage.objects.filter(connection=connection, email=source)
        .values_list("thread_id", flat=True)
        .first()
        or ""
    )


def _reply(connection, email, provider_id, thread_id="", source=None):
    """A reply found again (D3-11): its filed copy, the owner's own copy, and
    whether it sits in the source's thread in this mailbox (R2D1-12)."""
    message = (
        MailMessage.objects.filter(connection=connection, provider_message_id=provider_id)
        .values_list("pk", flat=True)
        .first()
    )
    home = _home_thread(connection, source)
    return SentReply(
        email_id=email.pk if email is not None else None,
        message_id=message,
        provider_id=provider_id,
        threaded=bool(thread_id) and thread_id == home,
        address=connection.address,
        provider=connection.provider,
    )


def send(connection, *, source, to, cc, subject, body, key):
    """Send `body` from `connection` answering `source` (a filed Email).
    Raises Refused or Unconfirmed."""
    markup, text = _bodies(connection, body)
    name = MARKER if connection.is_google else MARKER.lower()
    try:
        message = send_via_provider(
            connection,
            to=list(to),
            cc=list(cc),
            subject=subject,
            body=text,
            html=markup,
            # SOC2:API-08 the step's idempotency key travels with the message
            headers={name: key},
            answering=source,
        )
    except (SendUnconfirmed, TimeoutError, ConnectionError, http.client.HTTPException):
        logger.warning("agent reply unconfirmed for connection %s", connection.pk)
        raise Unconfirmed() from None
    except ProviderError as exc:
        logger.warning("agent reply refused for connection %s: %s", connection.pk, exc.status)
        raise Refused(_sentence(connection, exc)) from None
    # The email has gone: filing its copy is best effort (D3-12), in a savepoint.
    email = None
    try:
        with transaction.atomic():
            email = file_sent(
                connection,
                message,
                to=list(to),
                cc=list(cc),
                subject=subject,
                body=text,
                customer=source.customer,
                account=source.account,
            )
    except Exception as exc:  # noqa: BLE001 - the email has gone; the step stands
        logger.warning(
            "filing the sent agent reply failed for connection %s: %s",
            connection.pk,
            type(exc).__name__,
        )
    mail_message = (
        MailMessage.objects.filter(email=email).values_list("pk", flat=True).first()
        if email is not None
        else None
    )
    return SentReply(
        email_id=email.pk if email is not None else None,
        message_id=mail_message,
        provider_id=email.provider_message_id if email is not None else message.provider_id,
        threaded=message.threaded,
        address=connection.address,
        provider=connection.provider,
    )


def _marked(meta, key):
    headers = ((meta or {}).get("payload") or {}).get("headers") or []
    return any(
        str(h.get("name", "")).lower() == MARKER.lower() and h.get("value") == key for h in headers
    )


def find(connection, *, key, since, source=None):
    """The reply carrying `key` sent since `since`, or None (D3-11). Raises
    Refused when the mailbox can't be read."""
    from services.customers.models import Email

    if connection.is_google:
        session = gmail_sync.session_for(connection)
        query, token, read = f"in:sent after:{int(since.timestamp())}", "", 0
        try:
            while read < LOOK_LIMIT:
                page = session.list_messages(
                    query, page_token=token, max_results=min(LOOK_PAGE, LOOK_LIMIT - read)
                )
                stubs = page.get("messages") or []
                for stub in stubs:
                    if _marked(session.metadata(stub["id"], [MARKER]), key):
                        email = Email.objects.filter(
                            mailbox=connection, provider_message_id=stub["id"]
                        ).first()
                        return _reply(
                            connection, email, stub["id"], stub.get("threadId", ""), source
                        )
                read += len(stubs)
                token = page.get("nextPageToken") or ""
                if not stubs or not token:
                    break
        except ProviderError as exc:
            raise Refused(_sentence(connection, exc)) from None
        finally:
            gmail_sync.keep_credentials(connection, session)
        return None
    creds = _credentials(connection)
    try:
        found, creds = MicrosoftProvider().find_sent(
            creds, header=MARKER.lower(), value=key, since=since
        )
    except ProviderError as exc:
        raise Refused(_sentence(connection, exc)) from None
    _store(connection, creds)
    connection.save(update_fields=["credentials", "address", "updated_at"])
    if found is None:
        return None
    email = Email.objects.filter(mailbox=connection, provider_message_id=found["id"]).first()
    return _reply(connection, email, found["id"], found.get("conversationId", ""), source)
