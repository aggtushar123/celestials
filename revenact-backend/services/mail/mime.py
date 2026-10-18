"""Outgoing mail as MIME (D3 contract §4 "The message", decision 19).

One builder for every Gmail write that carries a message: drafts.create,
drafts.update, drafts.send and messages.send, and today's send routes on a
Google mailbox. The body is text/plain alone when there is no HTML (today's
routes), else multipart/alternative (text, then html); a forward's quoted
inline images ride in multipart/related around the html; files make the
whole multipart/mixed. No Message-ID: Gmail sets its own (decision 24).
Bcc stays in the owner's copy; Gmail strips it on delivery.
"""

from dataclasses import dataclass, field
from email.headerregistry import Address
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formatdate

#: References keeps the newest ids only (contract §4).
REFERENCES_KEPT = 20


@dataclass
class Part:
    filename: str
    mime_type: str
    data: bytes
    #: Set for an inline image the html references as cid:<content_id>.
    content_id: str = ""


@dataclass
class Outgoing:
    from_name: str
    from_address: str
    to: list = field(default_factory=list)
    cc: list = field(default_factory=list)
    bcc: list = field(default_factory=list)
    subject: str = ""
    text: str = ""
    html: str = ""
    in_reply_to: str = ""
    #: The source's own References header; `in_reply_to` is added to it.
    references: str = ""
    attachments: list = field(default_factory=list)
    related: list = field(default_factory=list)
    #: Extra headers written as given (agent bundles D3: X-Revenact-Step).
    headers: dict = field(default_factory=dict)


def references_header(references, in_reply_to):
    """`references` then `in_reply_to`, each id once, the newest REFERENCES_KEPT."""
    ids = [*(references or "").split(), *([in_reply_to] if in_reply_to else [])]
    return " ".join(list(dict.fromkeys(ids))[-REFERENCES_KEPT:])


def _split(mime_type):
    maintype, _, subtype = (mime_type or "").strip().lower().partition("/")
    if not maintype or not subtype or maintype == "multipart":
        return "application", "octet-stream"
    return maintype, subtype


def _addresses(pairs):
    return [Address(display_name=name or "", addr_spec=address) for name, address in pairs]


def build(out):
    """The message's bytes, CRLF line ends, ready for an upload."""
    message = EmailMessage(policy=SMTP)
    message["From"] = Address(display_name=out.from_name or "", addr_spec=out.from_address)
    for header, pairs in (("To", out.to), ("Cc", out.cc), ("Bcc", out.bcc)):
        if pairs:
            message[header] = _addresses(pairs)
    message["Subject"] = out.subject or ""
    message["Date"] = formatdate(usegmt=True)
    for name, value in (out.headers or {}).items():
        message[name] = value
    if out.in_reply_to:
        message["In-Reply-To"] = out.in_reply_to
        message["References"] = references_header(out.references, out.in_reply_to)
    message.set_content(out.text or "", subtype="plain", charset="utf-8")
    if out.html:
        message.add_alternative(
            f"<html><body>{out.html}</body></html>", subtype="html", charset="utf-8"
        )
        if out.related:
            html_part = message.get_payload()[1]
            for part in out.related:
                maintype, subtype = _split(part.mime_type)
                html_part.add_related(
                    part.data,
                    maintype=maintype,
                    subtype=subtype,
                    cid=f"<{part.content_id}>",
                    filename=part.filename,
                    disposition="inline",
                )
    for part in out.attachments:
        maintype, subtype = _split(part.mime_type)
        message.add_attachment(
            part.data, maintype=maintype, subtype=subtype, filename=part.filename
        )
    return message.as_bytes()
