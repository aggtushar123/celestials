"""Opening a Gmail attachment (contract §6).

A part is fetched on its first open, through its owner's mailbox, whoever
asks: the message is re-read with format=full because Gmail rotates
attachment ids, the part matched on `part_id`, and its bytes taken from the
payload when Gmail put them there, else from attachments.get. The file is
cached under its organisation and served from there afterwards. Two first
opens at once both fetch; the first to store keeps its file.

What is served (SOC2:API-10): the declared type only when the extension is
on files.ALLOWED_TYPES, the declared type is one of that extension's and the
leading bytes match where files.MAGIC knows them; otherwise
application/octet-stream. Inline only for images and PDFs. Mail files are
never refused for their type (the person needs their own zip): they are
only made a download. No log line names a file.
"""

import base64
import logging

from django.core.files.base import ContentFile
from django.db.models import Q
from django.http import FileResponse, Http404
from rest_framework import serializers

from services.customers.files import ALLOWED_TYPES, MAGIC, extension_of, file_headers

from .models import MailAttachment, MailboxConnection, mail_attachment_path
from .providers.base import ProviderError

logger = logging.getLogger(__name__)
OCTET = "application/octet-stream"
#: Served inline (unless ?download=1); SVG never is.
INLINE_TYPES = frozenset({"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"})


class Gone(Exception):
    """Gmail no longer has the message, or the part (410)."""


class Unavailable(Exception):
    """The mailbox cannot fetch: a lost grant or a missing permission (409)."""


class Busy(Exception):
    """Gmail is rate-limiting or failing (503)."""

    def __init__(self, retry_after=None):
        super().__init__("gmail busy")
        self.retry_after = retry_after or 60


def _declared(part):
    extension = extension_of(part.filename)
    declared = (part.mime_type or "").split(";")[0].strip().lower()
    return extension, declared, extension in ALLOWED_TYPES and declared in ALLOWED_TYPES[extension]


def preview(part):
    """Served inline: judged on the declared type and extension, before any fetch."""
    _, declared, agreed = _declared(part)
    return agreed and declared in INLINE_TYPES


def available(part, connection):
    """Cached, or its mailbox can fetch it: Google, not disconnected, not
    paused (the pause the sweep stored, plan gap 11)."""
    return bool(part.file) or (
        connection.is_google
        and connection.status != MailboxConnection.Status.DISCONNECTED
        and not connection.paused_reason
    )


def served_type(part, head):
    """The type the bytes go out as (decision 27)."""
    extension, declared, agreed = _declared(part)
    if not agreed:
        return OCTET
    if extension in MAGIC and not any(head.startswith(magic) for magic in MAGIC[extension]):
        return OCTET
    return declared


def _find(part, part_id):
    if part.get("partId") == part_id:
        return part
    for child in part.get("parts") or []:
        found = _find(child, part_id)
        if found is not None:
            return found
    return None


def _decode(data):
    """Gmail's base64url bytes. Anything that does not decode is Gone."""
    try:
        return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    except (ValueError, TypeError) as exc:  # binascii.Error is a ValueError
        raise Gone from exc


def fetch(part, connection):
    """The part's bytes from Gmail (decision 26). Raises Gone, Unavailable (the
    mailbox is paused first) or Busy (the mailbox's backoff is not touched)."""
    from . import gmail_sync

    session = gmail_sync.session_for(connection)
    gmail_id = part.message.provider_message_id
    try:
        full = session.get_message(gmail_id, "full")
        found = _find((full or {}).get("payload") or {}, part.part_id) if full else None
        if found is None:
            raise Gone
        body = found.get("body") or {}
        if body.get("data"):
            return _decode(body["data"])
        if not body.get("attachmentId"):
            raise Gone
        answer = session.attachment(gmail_id, body["attachmentId"])
        if answer is None:
            raise Gone
        return _decode(answer.get("data", ""))
    except ProviderError as exc:
        logger.warning(
            "gmail attachment fetch failed for connection %s: %s %s",
            connection.pk,
            exc.status,
            exc.reason,
        )
        if gmail_sync.classify_failure(exc) != "backoff":
            gmail_sync.pause_revoked(connection, exc)
            raise Unavailable from exc
        raise Busy(exc.retry_after) from exc
    finally:
        gmail_sync.keep_credentials(connection, session)


def cache(part, data, now):
    """Store the fetched bytes once. The first fetch to finish keeps its file,
    a second deletes its own copy and takes the first's. Returns whether this
    call's file was kept."""
    storage = MailAttachment._meta.get_field("file").storage
    name = storage.save(mail_attachment_path(part, part.filename), ContentFile(data))
    if MailAttachment.objects.filter(pk=part.pk, file="").update(file=name, fetched_at=now):
        part.file, part.fetched_at = name, now
        return True
    storage.delete(name)
    part.refresh_from_db(fields=["file", "fetched_at"])
    return False


def response(part, *, download):
    """The cached file, typed and disposed by decision 27, with the Files
    tab's headers (files.file_headers)."""
    handle = part.file.open("rb")
    head = handle.read(8)
    handle.seek(0)
    content_type = served_type(part, head)
    inline = not download and content_type in INLINE_TYPES
    # SOC2:API-10 someone's mail is a file, never a page of this site
    return file_headers(
        FileResponse(
            handle, as_attachment=not inline, filename=part.filename, content_type=content_type
        )
    )


def readable(user, pk):
    """The attachment, when `user` may read it (decision 29): its mailbox's
    owner; or, for a filed message, whoever may open that record and read
    that email. Http404 for anyone else."""
    from services.customers.models import Email
    from services.customers.scoping import visible_children_q

    from .visibility import visible_emails_q

    part = MailAttachment.objects.select_related("message__connection__user").filter(pk=pk).first()
    if part is None:
        raise Http404
    message = part.message
    if message.owner_id == user.pk:
        return part
    # SOC2:AUTH-02 filed mail: the record's rule and the mailbox chain, both
    if (
        message.email_id is not None
        and Email.objects.filter(pk=message.email_id)
        .filter(visible_children_q(user))
        .filter(visible_emails_q(user))
        .exists()
    ):
        return part
    raise Http404


def file_row(part):
    """A filed message's attachment as a Files tab row (decision 30): its id
    is the MailAttachment's, so the frontend tells rows apart by `source`."""
    email = part.message.email
    return {
        "id": part.pk,
        "account_id": email.account_id,
        "account_name": email.account.name if email.account_id else None,
        "name": part.filename,
        "content_type": part.mime_type,
        "size": part.size,
        "description": "",
        "source": "email",
        "uploaded_by": None,
        "download_url": f"/api/v1/mail/attachments/{part.pk}/download/",
        "created_at": serializers.DateTimeField().to_representation(email.sent_at),
        "email": {"id": email.pk, "subject": email.subject, "from": email.sender_name},
    }


def filed_rows(user, *, customer=None, account=None):
    """The non-inline attachments of mail filed on this organisation (and on
    its accounts the caller may open) or on this account, each one only where
    the caller may also read the email (the twice-filter, decision 29). One
    query. Returns (sent_at, id, row) for merging with the uploads."""
    from services.customers.models import Email
    from services.customers.scoping import customer_rollup_q, visible_children_q

    from .visibility import visible_emails_q

    where = customer_rollup_q(user, customer) if customer is not None else Q(account=account)
    # SOC2:AUTH-02 the record's rule and the mailbox chain, both
    emails = (
        Email.objects.filter(where).filter(visible_children_q(user)).filter(visible_emails_q(user))
    )
    parts = MailAttachment.objects.filter(
        is_inline=False, message__email__in=emails
    ).select_related("message__email__account")
    return [(part.message.email.sent_at, part.pk, file_row(part)) for part in parts]
