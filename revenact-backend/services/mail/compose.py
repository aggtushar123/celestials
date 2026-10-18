"""The editor's prefill and the customer suggestion (D3 contract §2
"GET mail/compose/", decision 25). Nothing here is stored, and nothing goes
to Gmail.

Recipients follow §2's table: a reply goes to the original's Reply-To, else
its sender, or to the same people when the person sent it; reply all adds
its To and Cc; the person's own address goes, and each address is kept
once, To before Cc. The body is an empty paragraph, the signature, then the
quote or the forward block, as Gmail lays it out. The suggestion is
match_parent's rule (a contact's address, then an account's domain, then an
organisation's) in two queries whatever the number of recipients, and a
record is named only when the owner may open it.
"""

import re
from collections import namedtuple
from dataclasses import dataclass, field
from html import escape

from django.conf import settings
from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Concat, Lower

from services.customers.models import Account, Contact, Customer
from services.customers.scoping import visible_accounts, visible_customers

from . import html
from .models import MailDraft
from .send_as import signature_block
from .sync import PUBLIC_DOMAINS, sender_name

Kind = MailDraft.Kind
REPLIES = (Kind.REPLY, Kind.REPLY_ALL)
RE = re.compile(r"^\s*re:", re.IGNORECASE)
FWD = re.compile(r"^\s*fwd?:", re.IGNORECASE)
#: A record a draft files on.
Record = namedtuple("Record", ["kind", "id", "name"])


def subject_for(kind, subject):
    subject = subject or ""
    if kind in REPLIES:
        return subject if RE.match(subject) else f"Re: {subject}"[:255]
    if kind == Kind.FORWARD:
        return subject if FWD.match(subject) else f"Fwd: {subject}"[:255]
    return ""


def _people(pairs, own, seen):
    found = []
    for pair in pairs or []:
        name, address = (list(pair) + ["", ""])[:2]
        address = (address or "").strip().lower()
        if not address or address in own or address in seen:
            continue
        seen.add(address)
        found.append([name or "", address])
    return found


def recipients_for(kind, source, connection):
    """(to, cc) for `kind` answering `source` (§2's table)."""
    if kind not in REPLIES:
        return [], []
    own = {connection.address.lower()}
    mine = (source.from_address or "").lower() in own
    if mine:
        to = list(source.to)
    else:
        to = list(source.reply_to) or [[source.from_name, source.from_address]]
    cc = []
    if kind == Kind.REPLY_ALL:
        to += list(source.to)
        cc = list(source.cc)
    seen = set()
    return _people(to, own, seen), _people(cc, own, seen)


def _when(moment):
    return f"{moment.day} {moment:%b %Y}"


def _who(name, address):
    shown = f"&lt;{escape(address or '')}&gt;"
    return f"{escape(name)} {shown}" if name else shown


def _people_line(pairs):
    return ", ".join(_who(name, address) for name, address in pairs)


def _quoted_body(source):
    return source.html_body or html.paragraphs(source.body)


def quote_html(source):
    """Gmail's quote: who wrote, when, and the original in a blockquote."""
    return (
        f'<div class="gmail_quote">On {_when(source.sent_at)}, '
        f"{_who(source.from_name, source.from_address)} wrote:"
        f"<blockquote>{_quoted_body(source)}</blockquote></div>"
    )


def forward_html(source):
    """Gmail's forward block: From, Date, Subject, To and Cc, then the original."""
    lines = [
        "---------- Forwarded message ---------",
        f"From: {_who(source.from_name, source.from_address)}",
        f"Date: {_when(source.sent_at)}",
        f"Subject: {escape(source.subject)}",
        f"To: {_people_line(source.to)}",
    ]
    if source.cc:
        lines.append(f"Cc: {_people_line(source.cc)}")
    return f'<div class="gmail_quote">{"<br>".join(lines)}<br><br>{_quoted_body(source)}</div>'


def attachment_row(part, origin):
    """A draft's attachment as §2 shows it: `upload`, `gmail` or `forward`."""
    return {
        "id": part.pk,
        "filename": part.filename,
        "mime_type": part.mime_type,
        "size": part.size,
        "origin": origin,
        "download_url": f"/api/v1/mail/attachments/{part.pk}/download/",
    }


def filed_record(message):
    """The record `message`'s filed copy is on, or None."""
    email = message.email if message is not None and message.email_id else None
    if email is None:
        return None
    if email.customer_id is not None:
        return Record("customer", email.customer_id, email.customer.name)
    if email.account_id is not None:
        return Record("account", email.account_id, email.account.name)
    return None


def match(organisation_id, addresses):
    """match_parent's answer in at most two queries (§8): a contact's address
    first, in the addresses' order; then, by the first address whose domain
    is known, an account's domain before an organisation's."""
    wanted = list(dict.fromkeys(address.lower() for address in addresses if address))
    if not wanted:
        return None
    contacts = {}
    rows = (
        Contact.objects.annotate(lowered=Lower("email"))
        .filter(lowered__in=wanted)
        .filter(
            Q(customer__organisation_id=organisation_id)
            | Q(account__customers__organisation_id=organisation_id)
        )
        .select_related("customer", "account")
    )
    for contact in rows:
        contacts.setdefault(contact.lowered, contact)
    for address in wanted:
        contact = contacts.get(address)
        if contact is not None and contact.customer_id is not None:
            return Record("customer", contact.customer_id, contact.customer.name)
        if contact is not None and contact.account_id is not None:
            return Record("account", contact.account_id, contact.account.name)
    domains = [
        domain
        for domain in dict.fromkeys(a.rsplit("@", 1)[-1] for a in wanted if "@" in a)
        if domain not in PUBLIC_DOMAINS
    ]
    if not domains:
        return None
    accounts = (
        Account.objects.annotate(lowered=Lower("domain"))
        .filter(lowered__in=domains, customers__organisation_id=organisation_id)
        .annotate(tag=Concat(Value("account:"), F("lowered"), output_field=CharField()))
        .values_list("pk", "name", "tag")
    )
    customers = (
        Customer.objects.annotate(lowered=Lower("domain"))
        .filter(lowered__in=domains, organisation_id=organisation_id)
        .annotate(tag=Concat(Value("customer:"), F("lowered"), output_field=CharField()))
        .values_list("pk", "name", "tag")
    )
    found = {}
    for pk, name, tag in accounts.union(customers, all=True):
        kind, _, domain = tag.partition(":")
        found.setdefault((kind, domain), Record(kind, pk, name))
    for domain in domains:
        for kind in ("account", "customer"):
            if (kind, domain) in found:
                return found[(kind, domain)]
    return None


def suggest(connection, pairs):
    """The record the recipients suggest (decision 25), the owner's own
    address left out; None when nothing matches."""
    own = connection.address.lower()
    addresses = [address for _, address in pairs or [] if address and address.lower() != own]
    return match(connection.organisation_id, addresses)


def visible(user, *records):
    """Each record, or None where `user` may not open it: at most one query per kind."""
    wanted = {"customer": set(), "account": set()}
    for record in records:
        if record is not None:
            wanted[record.kind].add(record.id)
    ok = set()
    # SOC2:AUTH-02 a draft names only records its owner may open
    if wanted["customer"]:
        ok |= {
            ("customer", pk)
            for pk in visible_customers(user)
            .filter(pk__in=wanted["customer"])
            .values_list("pk", flat=True)
        }
    if wanted["account"]:
        ok |= {
            ("account", pk)
            for pk in visible_accounts(user)
            .filter(pk__in=wanted["account"])
            .values_list("pk", flat=True)
        }
    return [
        record if record is not None and (record.kind, record.id) in ok else None
        for record in records
    ]


def lookup(user, record):
    """`record` (its kind and id) with its name, when `user` may open it; else None."""
    # SOC2:AUTH-02 only a record the owner may open
    rows = visible_customers(user) if record.kind == "customer" else visible_accounts(user)
    name = rows.filter(pk=record.id).values_list("name", flat=True).first()
    return None if name is None else Record(record.kind, record.id, name)


def as_payload(record):
    return None if record is None else dict(record._asdict())


@dataclass
class Prefill:
    kind: str
    source: object
    sender: dict
    to: list
    cc: list
    subject: str
    html: str
    signature_html: str
    forwarded: list = field(default_factory=list)
    record: Record | None = None
    suggested: Record | None = None
    bcc: list = field(default_factory=list)

    def payload(self):
        return {
            "kind": self.kind,
            "source_message_id": self.source.pk if self.source is not None else None,
            "from": self.sender,
            "to": self.to,
            "cc": self.cc,
            "bcc": self.bcc,
            "subject": self.subject,
            "html": self.html,
            "signature_html": self.signature_html,
            "forwarded": [attachment_row(part, "forward") for part in self.forwarded],
            "record": as_payload(self.record),
            "suggested_record": as_payload(self.suggested),
            # Controller amendment: the limit and the running total before a draft exists.
            "total_bytes": self.total_bytes(),
            "max_bytes": settings.MAIL_SEND_MAX_BYTES,
        }

    def total_bytes(self):
        """Decision 20's total for this prefill: the forwarded files' declared
        sizes plus the html and the text it derives (0 files for a fresh compose)."""
        files = sum(part.size for part in self.forwarded)
        return files + len(self.html.encode()) + len(html.to_text(self.html).encode())


def prefill(connection, user, kind, source=None):
    """What an editor that has not saved yet starts from (§2)."""
    to, cc = recipients_for(kind, source, connection) if source is not None else ([], [])
    if kind in REPLIES:
        tail = quote_html(source)
    elif kind == Kind.FORWARD:
        tail = forward_html(source)
    else:
        tail = ""
    forwarded = (
        list(source.attachments.filter(is_inline=False).order_by("part_id", "pk"))
        if kind == Kind.FORWARD
        else []
    )
    filed = filed_record(source) if kind in REPLIES else None
    record, suggested = visible(user, filed, suggest(connection, [*to, *cc]))
    return Prefill(
        kind=kind,
        source=source,
        sender={"name": sender_name(connection), "address": connection.address},
        to=to,
        cc=cc,
        subject=subject_for(kind, source.subject if source is not None else ""),
        html="<p></p>" + signature_block(connection) + tail,
        signature_html=connection.signature_html,
        forwarded=forwarded,
        record=record if kind in REPLIES else suggested,
        suggested=suggested,
    )
