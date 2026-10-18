"""The person's Gmail send-as name and signature (D3 decisions 17, 18).

Read from settings.sendAs.list's primary entry (else the one for the
mailbox's own address) when send_as_synced_at is empty or older than
MAIL_SEND_AS_REFRESH_HOURS: on the first tick after a connect or reconnect
(which clears the stamp) and then once a day. The signature is Gmail's HTML,
sanitised like any mail. It is placed into a draft's body when the draft is
made (services/mail/compose.py), never appended at send; today's routes add
none. There is no signature endpoint: the compose prefill carries it.
"""

from datetime import timedelta

from django.conf import settings

from . import gmail_sync, html


def due(connection, now):
    synced = connection.send_as_synced_at
    return synced is None or synced < now - timedelta(hours=settings.MAIL_SEND_AS_REFRESH_HOURS)


def primary(entries, address):
    """The primary entry, else the one for `address`, else {}."""
    entries = [entry for entry in entries or [] if isinstance(entry, dict)]
    found = next((entry for entry in entries if entry.get("isPrimary")), None)
    if found is None:
        wanted = (address or "").lower()
        found = next(
            (entry for entry in entries if str(entry.get("sendAsEmail", "")).lower() == wanted),
            None,
        )
    return found or {}


def refresh(connection, session, now):
    """One sendAs.list when due, stored under the tick's claim. A
    ProviderError is the tick's failure (D1 backoff). Returns whether it ran."""
    if not due(connection, now):
        return False
    entry = primary(session.send_as(), connection.address)
    connection.send_as_name = str(entry.get("displayName") or "").strip()[:150]
    connection.signature_html = html.sanitise(str(entry.get("signature") or ""))
    connection.send_as_synced_at = now
    gmail_sync._write(connection, ["send_as_name", "signature_html", "send_as_synced_at"])
    return True


def signature_block(connection):
    """The signature as a draft carries it, below the person's text and above
    any quote (decision 17); "" without one."""
    if not connection.signature_html:
        return ""
    return f"<div {html.SIGNATURE_ATTR}>{connection.signature_html}</div>"
