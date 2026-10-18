"""A person's signature on a send (agent bundles round 2 D1 contract R2D1-15
to R2D1-17). Gmail's is read from Gmail (send_as) and goes out in HTML and
text; an Outlook mailbox's is written by its owner in Revenact (Graph has no
signature API) and goes out in text; IMAP has none in round 2. A text that
already carries a "-- " signature (a mirrored draft) is never signed twice.
send_email signs every send that carries no Revenact draft signature,
including an unlinked ReplyDraft sent through it (R2D1-17): that is intended,
not a double-sign to fix. A draft carries its own signature block from when
it was made (Gmail D3 decision 17): only sends that skip a draft come through
here."""

from . import html
from .models import MailboxConnection

LIMIT = 1000
LINES = 10
SEPARATOR = "\n-- \n"


def text(connection):
    """The signature as text, "" when there is none."""
    return html.to_text(connection.signature_html).strip() if connection.signature_html else ""


def stored(value):
    """An Outlook signature's text as the HTML kept in `signature_html`."""
    return html.paragraphs(value)


def _already(body):
    return body.startswith("-- \n") or SEPARATOR in body


def signed(connection, body, markup=""):
    """(html, text) for sending `body` from `connection`. `markup` is the
    HTML the caller already built ("" for a text-only send)."""
    if not connection.signature_html or _already(body):
        return markup, body
    signature = text(connection)
    plain = f"{body}\n\n-- \n{signature}" if signature else body
    if connection.is_google:
        # Here, not at the top: sync imports this module, and send_as's
        # gmail_sync -> gmail_store import sync back (a cycle at startup).
        from . import send_as

        return (markup or html.paragraphs(body)) + send_as.signature_block(connection), plain
    if connection.provider == MailboxConnection.Provider.MICROSOFT:
        return markup, plain
    return markup, body
