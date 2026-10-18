"""What a draft's message carries, shared by the flush (services/mail/
draft_flush.py), the send (draft_send.py) and the reconcile (D3 contract
§4). Its own parts (uploads and Gmail's) and its forwarded files go as
files; the inline images its HTML references by cid: (its own, and a
forward's source's) go in multipart/related. Every part is in the cache
before the MIME is built (decision 22)."""

import re

from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import Email

from . import attachments, drafts, gmail_store, mime
from .models import MailAttachment, MailDraft, MailMessage, mail_attachment_path
from .sync import sender_name

CID = re.compile(r"""cid:([^"'\s>)]+)""", re.IGNORECASE)


def parts_of(draft):
    """(files, related) MailAttachment rows, each with its message joined."""
    own = []
    if draft.message_id:
        own = list(
            MailAttachment.objects.filter(message_id=draft.message_id)
            .select_related("message")
            .order_by("pk")
        )
    source = []
    if draft.source_id and (draft.forwarded or draft.kind == MailDraft.Kind.FORWARD):
        source = list(
            MailAttachment.objects.filter(message_id=draft.source_id)
            .select_related("message")
            .order_by("pk")
        )
    kept = set(draft.forwarded)
    cids = set(CID.findall(draft.html or ""))
    forwarded = [part for part in source if part.pk in kept and not part.is_inline]
    related = [
        part
        for part in [*own, *source]
        if part.is_inline and part.content_id and part.content_id in cids
    ]
    files = [part for part in own if not part.is_inline] + forwarded
    return files, related


def ensure_cached(parts, connection):
    """Fetch every part not cached yet (D2's attachments.fetch). Raises
    attachments.Gone, Unavailable or Busy."""
    for part in parts:
        if not part.file:
            attachments.cache(part, attachments.fetch(part, connection), timezone.now())


def read(part):
    with part.file.open("rb") as handle:
        return handle.read()


def build(draft, files, related):
    """The draft's message, as its content stands now (decision 6)."""
    connection = draft.connection
    return mime.build(
        mime.Outgoing(
            from_name=sender_name(connection),
            from_address=connection.address,
            to=draft.to,
            cc=draft.cc,
            bcc=draft.bcc,
            subject=draft.subject,
            text=draft.text,
            html=draft.html,
            in_reply_to=draft.in_reply_to,
            references=draft.references,
            attachments=[mime.Part(p.filename, p.mime_type, read(p)) for p in files],
            related=[mime.Part(p.filename, p.mime_type, read(p), p.content_id) for p in related],
        )
    )


# --- After a send (§4 "After a 2xx") ----------------------------------------


def sent_copy(draft, connection, answer, *, now, take_draft_row, has_files):
    """§4 "After a 2xx" step 1 (decision 23), in the caller's transaction:
    the draft's own row becomes the sent copy; when history already stored
    the returned id, the draft's row goes and that row is used; a draft
    that moved on keeps its row and the copy is a new one. History storing
    the id between the read and the save is met in a savepoint: the row it
    stored is used then (final review 2). Returns the row."""
    gmail_id = str(answer.get("id") or "")[:255]
    held = _held(connection, gmail_id)
    own = None
    if take_draft_row and draft.message_id:
        own = MailMessage.objects.select_for_update().filter(pk=draft.message_id).first()
    if held is None:
        row = own or MailMessage(
            connection=connection,
            owner_id=draft.owner_id,
            organisation_id=draft.organisation_id,
        )
        _fill_sent(row, draft, connection, answer, gmail_id, now=now, has_files=has_files)
        try:
            with transaction.atomic():
                row.save()
            return row
        except IntegrityError:
            held = _held(connection, gmail_id)
            if held is None:
                raise
    if own is not None and held.pk != own.pk:
        own.delete()
    _fill_sent(held, draft, connection, answer, gmail_id, now=now, has_files=has_files)
    held.save()
    return held


def _held(connection, gmail_id):
    return (
        MailMessage.objects.select_for_update()
        .filter(connection=connection, provider_message_id=gmail_id)
        .first()
    )


def _fill_sent(row, draft, connection, answer, gmail_id, *, now, has_files):
    labels = [str(label) for label in answer.get("labelIds") or ["SENT"]]
    derived = gmail_store.derive(
        labels, from_address=connection.address, own_address=connection.address
    )
    row.provider_message_id = gmail_id
    row.thread_id = str(answer.get("threadId") or draft.thread_id)[:255]
    row.label_ids = labels
    row.folder = derived["folder"]
    row.is_read = derived["is_read"]
    row.is_starred = derived["is_starred"]
    row.is_important = derived["is_important"]
    row.state = MailMessage.State.DONE if derived["archived"] else MailMessage.State.OPEN
    row.direction = MailMessage.Direction.SENT
    row.from_name = sender_name(connection)[:150]
    row.from_address = connection.address
    row.to, row.cc, row.bcc, row.reply_to = draft.to, draft.cc, draft.bcc, []
    row.subject = draft.subject
    row.snippet = drafts.snippet(draft.text)
    row.body = draft.text
    row.html_body = draft.html
    row.has_attachments = has_files
    row.sent_at = now
    row.refreshed_at = now


def copy_forwarded(row, parts, *, now):
    """Each forwarded file stored again on the sent copy (part_id sent:<n>),
    so the copy never needs Gmail (decision 22). No Gmail call."""
    storage = MailAttachment._meta.get_field("file").storage
    made = []
    for n, part in enumerate(parts, start=1):
        copy = MailAttachment(
            message=row,
            part_id=f"sent:{n}",
            filename=part.filename,
            mime_type=part.mime_type,
            size=part.size,
            is_inline=False,
            fetched_at=now,
        )
        copy.file.name = storage.save(
            mail_attachment_path(copy, part.filename), ContentFile(read(part))
        )
        made.append(copy)
    if made:
        MailAttachment.objects.bulk_create(made, ignore_conflicts=True)


def file_sent(connection, row, *, customer_id, account_id):
    """§4 step 3: filed on the draft's record, get_or_create on (mailbox,
    provider_message_id), so a send and a history pass never file twice.
    To + Cc, never Bcc. (None, False) without a record. Returns (Email,
    whether it was made now)."""
    if customer_id is None and account_id is None:
        return None, False
    recipients = [*row.to, *row.cc]
    name, address = (list(recipients[0]) + ["", ""])[:2] if recipients else ("", "")
    email, created = Email.objects.get_or_create(
        mailbox=connection,
        provider_message_id=row.provider_message_id,
        defaults={
            "customer_id": customer_id,
            "account_id": account_id,
            "subject": row.subject[:255],
            "sender_name": sender_name(connection)[:150],
            "recipient_name": (name or address)[:150],
            "body": row.body,
            "sent_at": row.sent_at,
            "mailbox_owner_id": connection.user_id,
            "direction": Email.Direction.SENT,
            "from_address": connection.address[:254],
            "to_addresses": [pair[1] for pair in recipients][:50],
            "thread_id": row.thread_id[:255],
            "synced_at": timezone.now(),
        },
    )
    if row.email_id != email.pk:
        MailMessage.objects.filter(pk=row.pk).update(email=email)
        row.email = email
    return email, created
