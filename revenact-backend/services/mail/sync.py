"""Pull a mailbox: keep the person's copy, and file what belongs to a customer.

For every message the provider hands back, decide which side is the
counterpart (the other party, given the mailbox's own address), find
the organisation or account that party belongs to — a known contact's
address first, then the domain — and store it as that record's Email,
stamped with whose mailbox it came from and which way it went.

Every message, matched or not, is also kept as the owner's own
`MailMessage`, with the provider's folder, flags and category, so the
Communications page can show their inbox whole. The filed `Email` is the
team's view of a customer; the `MailMessage` is the person's view of
their mail. Where both exist they point at each other.
"""

import logging
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.customers.models import Account, Contact, Customer, Email

from . import internal, signing
from .categorise import FILED_FOLDERS, categorise, folder_of, is_archived
from .models import MailboxConnection, MailMessage
from .providers import get_provider
from .providers.base import Credentials, ProviderError

logger = logging.getLogger(__name__)

#: An RFC 5322 Message-ID, `<local@domain>`. IMAP keeps one as a message's
#: provider id; Gmail and Graph keep ids of their own instead.
MESSAGE_ID = re.compile(r"<[^<>\s@]+@[^<>\s@]+>")


def looks_like_message_id(value):
    return bool(value) and MESSAGE_ID.fullmatch(value) is not None


def sender_name(connection):
    """The From name (D3 decision 18): Gmail's send-as name, else the
    connection's display name, else the person's."""
    return connection.send_as_name or connection.display_name or connection.user.name


def answering_headers(connection, *, email=None, message=None):
    """(In-Reply-To, the original's References, Gmail threadId) for a send
    answering `message` (a MailMessage) or the filed `email` (D3 decision
    16). The original is found through Email.mail_message, so a Gmail id is
    never taken for a Message-ID; a filed email with no mailbox copy still
    answers by a Message-ID-shaped provider id (IMAP). The threadId only for
    a message in this very Google mailbox: Gmail thread ids are per mailbox."""
    original = message
    if original is None and email is not None:
        original = MailMessage.objects.filter(email=email).first()
    in_reply_to = original.rfc_message_id if original is not None else ""
    if not in_reply_to and email is not None and looks_like_message_id(email.provider_message_id):
        in_reply_to = email.provider_message_id
    references = original.references if original is not None and in_reply_to else ""
    same_mailbox = (
        original is not None and connection.is_google and original.connection_id == connection.pk
    )
    return in_reply_to, references, original.thread_id if same_mailbox else ""


def send_kwargs(connection, in_reply_to, references, thread_id):
    """What provider.send takes beyond the message: In-Reply-To for any
    provider; for Google also References, the threadId and the From name."""
    extra = {"in_reply_to": in_reply_to} if in_reply_to else {}
    if connection.is_google:
        extra["from_name"] = sender_name(connection)
        if references:
            extra["references"] = references
        if thread_id:
            extra["thread_id"] = thread_id
    return extra


PUBLIC_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "yahoo.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
}


def _credentials(connection):
    data = connection.get_credentials()
    return Credentials(address=connection.address, display_name=connection.display_name, data=data)


def _store(connection, creds):
    connection.address = creds.address or connection.address
    connection.set_credentials(creds.data)


def counterpart_addresses(message, own_address):
    """The addresses on the other side of `message`, and the direction. For
    something the person sent that is To and Cc (Gmail splits Cc out; the
    other providers merge it into `to`); Bcc is never a counterpart."""
    own = (own_address or "").lower()
    if message.from_address == own:
        recipients = [*message.to, *message.cc]
        return [
            address for _, address in recipients if address and address != own
        ], Email.Direction.SENT
    return [message.from_address] if message.from_address else [], Email.Direction.RECEIVED


def match_parent(organisation, addresses):
    """(customer, account) for the first address that belongs to a contact
    or to a customer/account domain in this organisation, else (None, None)."""
    for address in addresses:
        contact = (
            Contact.objects.filter(email__iexact=address)
            .filter(
                __import__("django.db.models", fromlist=["Q"]).Q(
                    customer__organisation=organisation
                )
                | __import__("django.db.models", fromlist=["Q"]).Q(
                    account__customers__organisation=organisation
                )
            )
            .select_related("customer", "account")
            .first()
        )
        if contact is not None:
            return contact.customer, contact.account
    for address in addresses:
        domain = address.rsplit("@", 1)[-1].lower() if "@" in address else ""
        if not domain or domain in PUBLIC_DOMAINS:
            continue
        account = (
            Account.objects.filter(domain__iexact=domain, customers__organisation=organisation)
            .distinct()
            .first()
        )
        if account is not None:
            return None, account
        customer = Customer.objects.filter(domain__iexact=domain, organisation=organisation).first()
        if customer is not None:
            return customer, None
    return None, None


def file_message(connection, message):
    """Store one message as an Email if it belongs to someone in the book.
    Returns the Email, or None when nothing matched or it was seen already."""
    addresses, direction = counterpart_addresses(message, connection.address)
    customer, account = match_parent(connection.organisation, addresses)
    if customer is None and account is None:
        return None
    if (
        message.provider_id
        and Email.objects.filter(
            mailbox=connection, provider_message_id=message.provider_id
        ).exists()
    ):
        return None
    recipients = [*message.to, *message.cc]
    counterpart_name = (
        next((name for name, address in recipients if address in addresses and name), "")
        if direction == Email.Direction.SENT
        else message.from_name
    )
    own_name = connection.display_name or connection.user.name
    email = Email.objects.create(
        customer=customer,
        account=account,
        subject=message.subject[:255],
        sender_name=(
            own_name
            if direction == Email.Direction.SENT
            else counterpart_name or message.from_address
        )[:150],
        recipient_name=(
            counterpart_name or (addresses[0] if addresses else "")
            if direction == Email.Direction.SENT
            else own_name
        )[:150],
        body=message.body,
        sent_at=message.date,
        mailbox=connection,
        mailbox_owner=connection.user,
        direction=direction,
        from_address=message.from_address[:254],
        to_addresses=[address for _, address in recipients][:50],
        thread_id=message.thread_id[:255],
        provider_message_id=message.provider_id[:255],
        synced_at=timezone.now(),
    )
    # Agent bundles D2: the thread is touched; no agent work at sync time.
    from services.agents.threads import touch_mail

    touch_mail(email)
    return email


def store_message(connection, message, email=None):
    """Keep one message as the owner's own row. A message already there is
    handed back untouched: a re-sync never duplicates and never overwrites a
    flag the person changed here. Without a provider id there is nothing to
    key on, and None comes back."""
    if not message.provider_id:
        return None
    # SOC2:DATA-04 colleagues' mail is never kept, whoever asks to store it (decision D)
    if internal.is_internal(connection, message):
        return None
    labels = set(message.labels or [])
    _, direction = counterpart_addresses(message, connection.address)
    if "sent" in labels:
        # The provider says the person sent it, whatever address it left from
        # (a send-as alias is still them).
        direction = MailMessage.Direction.SENT
    existing = MailMessage.objects.filter(
        connection=connection, provider_message_id=message.provider_id
    ).first()
    if existing is None and "sent" in labels:
        existing = _placeholder_for(connection, message)
    if existing is not None:
        return _refresh(existing, message, labels, direction)
    if email is None:
        # Filed on an earlier pass (the provider re-listed it): keep the link.
        email = Email.objects.filter(
            mailbox=connection, provider_message_id=message.provider_id
        ).first()
    body = message.body or ""
    return MailMessage.objects.create(
        connection=connection,
        owner=connection.user,
        organisation=connection.organisation,
        provider_message_id=message.provider_id[:255],
        thread_id=(message.thread_id or "")[:255],
        direction=direction,
        from_name=(message.from_name or "")[:150],
        from_address=(message.from_address or "")[:254],
        to=[[name, address] for name, address in message.to][:50],
        subject=(message.subject or "(no subject)")[:255],
        snippet=" ".join(body.split())[:300],
        body=body,
        sent_at=message.date,
        folder=folder_of(message, direction),
        category=categorise(message),
        state=MailMessage.State.DONE if is_archived(message) else MailMessage.State.OPEN,
        is_read="unread" not in labels,
        is_starred="starred" in labels,
        is_important="important" in labels,
        email=email,
    )


#: How far apart the app's own record of a send and the provider's copy of
#: it may be and still be the same message.
SENT_MATCH_WINDOW = timedelta(minutes=10)


def _placeholder_for(connection, message):
    """The row this app made when it sent the message, before the provider
    had a name for it (Graph and SMTP return none). Matched on subject and
    time; on a match the row takes the provider's id so the copy the
    provider lists later is recognised rather than duplicated."""
    row = (
        MailMessage.objects.filter(
            connection=connection,
            folder=MailMessage.Folder.SENT,
            provider_message_id__startswith="sent:",
            subject=(message.subject or "")[:255],
            sent_at__gte=message.date - SENT_MATCH_WINDOW,
            sent_at__lte=message.date + SENT_MATCH_WINDOW,
        )
        .order_by("-sent_at")
        .first()
    )
    if row is None:
        return None
    row.provider_message_id = message.provider_id[:255]
    if not row.thread_id and message.thread_id:
        row.thread_id = message.thread_id[:255]
    row.save(update_fields=["provider_message_id", "thread_id"])
    return row


def _refresh(row, message, labels, direction):
    """A message seen again: take the provider's current flags and folder,
    unless the person changed something here, in which case what they did
    here wins and the provider's view is left alone."""
    if row.locally_changed_at is not None:
        return row
    row.is_read = "unread" not in labels
    row.is_starred = "starred" in labels
    row.is_important = "important" in labels
    row.folder = folder_of(message, direction)
    row.direction = direction
    if is_archived(message) and row.state == MailMessage.State.OPEN:
        row.state = MailMessage.State.DONE
    row.save(
        update_fields=["is_read", "is_starred", "is_important", "folder", "direction", "state"]
    )
    return row


def sync_mailbox(connection):
    """One pass for one mailbox. Returns how many emails were filed. Marks
    the connection when the provider needs the person to reconnect."""
    if connection.provider == MailboxConnection.Provider.GOOGLE:
        # Every Google mailbox runs the history engine (decision 8).
        from .gmail_sync import tick

        return tick(connection).filed
    provider = get_provider(connection.provider)
    try:
        creds = _credentials(connection)
        messages, cursor, creds = provider.fetch_messages(creds, connection.sync_cursor)
    except ProviderError as exc:
        connection.status = MailboxConnection.Status.ERROR
        connection.error = str(exc)[:255]
        connection.save(update_fields=["status", "error", "updated_at"])
        logger.warning("mailbox %s: %s", connection.address, exc)
        return 0
    filed = []
    with transaction.atomic():
        for message in sorted(messages, key=lambda m: m.date):
            if internal.is_internal(connection, message):
                # SOC2:DATA-04 colleagues' mail is never kept (owner decision D)
                from services.emailagent import inbox

                inbox.offer(connection, message, sent="sent" in set(message.labels or []))
                continue
            _, direction = counterpart_addresses(message, connection.address)
            email = None
            # Only real mail reaches the customer's timeline: never spam,
            # trash or a draft. The person's own copy keeps everything.
            if folder_of(message, direction) in FILED_FOLDERS:
                email = file_message(connection, message)
                if email is not None:
                    filed.append(email)
            store_message(connection, message, email)
        _store(connection, creds)
        connection.sync_cursor = cursor[:512]
        connection.status = MailboxConnection.Status.CONNECTED
        connection.error = ""
        connection.last_synced_at = timezone.now()
        # Named fields only: the loop runs this, and a concurrent wake_at or
        # backoff must survive the pass.
        connection.save(
            update_fields=[
                "address",
                "credentials",
                "sync_cursor",
                "status",
                "error",
                "last_synced_at",
                "updated_at",
            ]
        )
    # Sentiment now, not at the next scheduled pass: the pulse counts only
    # classified conversations (services/customers/pulse.py).
    if filed:
        from services.customers.classification import classify_records

        classify_records(filed, organisation=connection.organisation, user=connection.user)
    return len(filed)


def send_via_provider(
    connection, *, to, subject, body, cc=(), html="", headers=None, answering=None, sign=False
):
    """The provider's send alone: the Message it names, its credentials
    stored back. `send_email` files the copy after it; the agent path files
    it best effort (agent bundles D3-12). `sign` adds the person's signature:
    for sends that skip a draft, which carries its own (R2D1-17)."""
    if sign:
        html, body = signing.signed(connection, body, html)
    provider = get_provider(connection.provider)
    creds = _credentials(connection)
    in_reply_to, references, thread_id = answering_headers(connection, email=answering)
    extra = send_kwargs(connection, in_reply_to, references, thread_id)
    sender = (getattr(answering, "from_address", "") or "").lower()
    if (
        connection.provider == MailboxConnection.Provider.MICROSOFT
        and in_reply_to
        and sender
        and [a.lower() for a in to] == [sender]
    ):
        extra["in_thread"] = True
    if cc:
        extra["cc"] = list(cc)
    if html and connection.is_google:
        extra["html"] = html
    if headers:
        extra["headers"] = dict(headers)
    message = provider.send(creds, to=to, subject=subject, body=body, **extra)
    if answering is not None and not message.thread_id:
        message.thread_id = answering.thread_id
    _store(connection, creds)
    connection.save(update_fields=["credentials", "address", "updated_at"])
    return message


def file_sent(connection, message, *, to, cc=(), subject, body, customer=None, account=None):
    """File the sent copy: the Email, its mailbox copy, its classification."""
    email = Email.objects.create(
        customer=customer,
        account=account,
        subject=subject[:255],
        sender_name=(connection.display_name or connection.user.name)[:150],
        recipient_name=", ".join(to)[:150],
        body=body,
        sent_at=message.date,
        mailbox=connection,
        mailbox_owner=connection.user,
        direction=Email.Direction.SENT,
        from_address=connection.address[:254],
        to_addresses=[a.lower() for a in [*to, *cc]][:50],
        thread_id=message.thread_id[:255],
        provider_message_id=message.provider_id[:255],
        synced_at=timezone.now(),
    )
    _sendable(message)
    store_message(connection, message, email)
    from services.customers.classification import classify_records

    classify_records([email], organisation=connection.organisation, user=connection.user)
    email.refresh_from_db()
    return email


def send_email(
    connection,
    *,
    to,
    subject,
    body,
    cc=(),
    html="",
    headers=None,
    customer=None,
    account=None,
    answering=None,
):
    """Send through the person's own mailbox and file the copy. `answering`
    is the filed email this replies to: the copy takes its thread when the
    provider names none (Graph and SMTP never do), so the reply clears it
    from the queue, a Message-ID original goes out as In-Reply-To (D3 decision 16:
    found through the mailbox copy, with Gmail's threadId when it is this mailbox's)."""
    message = send_via_provider(
        connection,
        to=to,
        subject=subject,
        body=body,
        cc=cc,
        html=html,
        headers=headers,
        answering=answering,
        sign=True,
    )
    return file_sent(
        connection,
        message,
        to=to,
        cc=cc,
        subject=subject,
        body=message.body or body,
        customer=customer,
        account=account,
    )


class NothingToReplyTo(ValueError):
    """The message names no address a reply could go to. The caller's
    problem, not the provider's."""


def reply_to(original, body):
    """Answer a message from the mailbox it arrived in.

    Goes back to whoever wrote it (or, for something the person sent, to the
    same people), under the same subject. If the original was filed against
    a customer the reply is filed there too, so the team's picture of that
    account gains the answer; otherwise it is the person's own sent mail.
    Returns the stored `MailMessage`."""
    connection = original.connection
    if original.direction == MailMessage.Direction.SENT:
        to = [address for _, address in original.to if address]
    else:
        to = [original.from_address] if original.from_address else []
    if not to:
        raise NothingToReplyTo("this message has nobody to reply to")
    subject = original.subject
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"[:255]
    if original.email_id is not None:
        email = send_email(
            connection,
            to=to,
            subject=subject,
            body=body,
            customer=original.email.customer,
            account=original.email.account,
            answering=original.email,
        )
        return MailMessage.objects.filter(email=email).first()
    provider = get_provider(connection.provider)
    creds = _credentials(connection)
    in_reply_to, references, thread_id = answering_headers(connection, message=original)
    extra = send_kwargs(connection, in_reply_to, references, thread_id)
    if (
        connection.provider == MailboxConnection.Provider.MICROSOFT
        and in_reply_to
        and to == [original.from_address]
    ):
        extra["in_thread"] = True
    markup, body = signing.signed(connection, body)
    if markup and connection.is_google:
        extra["html"] = markup
    message = provider.send(creds, to=to, subject=subject, body=body, **extra)
    _store(connection, creds)
    connection.save(update_fields=["credentials", "address", "updated_at"])
    if not message.thread_id:
        message.thread_id = original.thread_id
    _sendable(message)
    return store_message(connection, message)


def _sendable(message):
    """A provider that names nothing it sent (Graph, SMTP) still gets a row:
    the send happened, and the person should see it in Sent."""
    if not message.provider_id:
        import uuid

        message.provider_id = f"sent:{uuid.uuid4().hex}"
    message.labels = ["sent"]
    return message
