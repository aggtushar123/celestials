"""Gmail mail into the person's own store (contract §4).

For a Google mailbox, Gmail's labels are the truth: the folder, read,
starred and important are derived from `label_ids` at every store and at
every label change, and an archived message (no INBOX, SENT, DRAFT, SPAM or
TRASH) is `done` until Gmail puts it back in a folder. `muted` is
Revenact's own and never touched; `locally_changed_at` does not freeze a
Google row. D1's decision 11 (Gmail always wins) is superseded for a label
with a pending or sending outbox row (D2 decision 3): its local presence is
kept, and the row's `previous` takes what Gmail reported, so a revert lands
on Gmail's last word. Once the row is sent, Gmail wins again. The category
is decided once, at first store. Only mail whose folder is inbox or sent at
first store is filed against a customer, and a filed `customers.Email` is
never moved or deleted by a later label change. Chats are never stored.
"""

from collections import defaultdict
from datetime import timedelta

from services.customers.files import safe_name
from services.customers.models import Email

from . import html
from .categorise import FILED_FOLDERS, categorise
from .models import MailAttachment, MailLabel, MailMessage, MailOutbox
from .providers.google import parse_gmail_message
from .sync import file_message

FOLDER_LABELS = frozenset({"INBOX", "SENT", "DRAFT", "SPAM", "TRASH"})
#: Filed mail newer than this is classified at store; older waits for the
#: nightly capped pass (decision 17).
CLASSIFY_WINDOW = timedelta(days=30)
#: The fields `relabel` writes.
LABEL_FIELDS = [
    "label_ids",
    "folder",
    "is_read",
    "is_starred",
    "is_important",
    "state",
    "refreshed_at",
]


def derive(label_ids, *, from_address, own_address):
    """The folder and flags Gmail's labels mean, and whether it is archived."""
    labels = set(label_ids or [])
    own = (own_address or "").lower()
    if "DRAFT" in labels:
        folder = MailMessage.Folder.DRAFTS
    elif "TRASH" in labels:
        folder = MailMessage.Folder.TRASH
    elif "SPAM" in labels:
        folder = MailMessage.Folder.SPAM
    elif "SENT" in labels or (from_address or "").lower() == own:
        folder = MailMessage.Folder.SENT
    else:
        folder = MailMessage.Folder.INBOX
    return {
        "folder": folder,
        "is_read": "UNREAD" not in labels,
        "is_starred": "STARRED" in labels,
        "is_important": "IMPORTANT" in labels,
        "archived": not labels & FOLDER_LABELS,
    }


def _state(current, archived):
    if current == MailMessage.State.MUTED:
        return current
    return MailMessage.State.DONE if archived else MailMessage.State.OPEN


def held_keys(message_ids):
    """For each message, the label keys with a pending or sending outbox row:
    what incoming Gmail changes leave alone (decision 3). One query."""
    held = defaultdict(set)
    rows = (
        MailOutbox.objects.filter(message_id__in=list(message_ids), status__in=MailOutbox.LIVE)
        .exclude(label_key="")
        .values_list("message_id", "label_key")
    )
    for message_id, key in rows:
        held[message_id].add(key)
    return held


def relabel(connection, row, label_ids, now, held=frozenset()):
    """Gmail changed this message's labels: take them and everything they
    mean, except the labels in `held`, which keep their local presence while
    their rows learn Gmail's (decision 3)."""
    label_ids = list(label_ids or [])
    if held:
        reported = set(label_ids)
        label_ids = [key for key in label_ids if key not in held]
        label_ids += [key for key in row.label_ids or [] if key in held]
        for key in held:
            MailOutbox.objects.filter(
                message=row, label_key=key, status__in=MailOutbox.LIVE
            ).update(previous={"present": key in reported})
    derived = derive(label_ids, from_address=row.from_address, own_address=connection.address)
    row.state = _state(row.state, derived.pop("archived"))
    for field, value in derived.items():
        setattr(row, field, value)
    row.label_ids = label_ids
    row.refreshed_at = now
    row.save(update_fields=LABEL_FIELDS)


def store_gmail(connection, full, *, now):
    """Store one `messages.get?format=full` body as the owner's row, filing it
    against a customer when it belongs to one. Returns (row, the Email this
    call filed or None). A chat is never stored; a held id is relabelled."""
    label_ids = list(full.get("labelIds") or [])
    if "CHAT" in label_ids:
        return None, None
    held = MailMessage.objects.filter(
        connection=connection, provider_message_id=full.get("id", "")
    ).first()
    if held is not None:
        relabel(connection, held, label_ids, now, held=held_keys([held.pk]).get(held.pk, set()))
        return held, None
    message = parse_gmail_message(full)
    if not message.provider_id:
        return None, None
    from . import internal

    if internal.is_internal(connection, message):
        # SOC2:DATA-04 colleagues' mail is never kept (owner decision D): the
        # agent may read it once, in memory, for someone who switched it on.
        from services.emailagent import inbox

        inbox.offer(connection, message, sent="SENT" in label_ids)
        return None, None
    own = connection.address.lower()
    derived = derive(label_ids, from_address=message.from_address, own_address=own)
    sent = "SENT" in label_ids or message.from_address == own
    filed = file_message(connection, message) if derived["folder"] in FILED_FOLDERS else None
    # Filed on an earlier pass (a reconnect re-imports): keep the link.
    email = (
        filed
        or Email.objects.filter(
            mailbox=connection, provider_message_id=message.provider_id[:255]
        ).first()
    )
    body = message.body or ""
    row = MailMessage.objects.create(
        connection=connection,
        owner=connection.user,
        organisation=connection.organisation,
        provider_message_id=message.provider_id[:255],
        thread_id=(message.thread_id or "")[:255],
        direction=MailMessage.Direction.SENT if sent else MailMessage.Direction.RECEIVED,
        from_name=(message.from_name or "")[:150],
        from_address=(message.from_address or "")[:254],
        to=[[name, address] for name, address in message.to][:50],
        cc=[[name, address] for name, address in message.cc][:50],
        bcc=[[name, address] for name, address in message.bcc][:50],
        reply_to=[[name, address] for name, address in message.reply_to][:50],
        subject=(message.subject or "(no subject)")[:255],
        snippet=" ".join(body.split())[:300],
        body=body,
        html_body=html.sanitise(message.html),
        sent_at=message.date,
        folder=derived["folder"],
        category=categorise(message),
        state=_state(MailMessage.State.OPEN, derived["archived"]),
        is_read=derived["is_read"],
        is_starred=derived["is_starred"],
        is_important=derived["is_important"],
        rfc_message_id=message.rfc_message_id if len(message.rfc_message_id) <= 998 else "",
        references=message.references,
        label_ids=label_ids,
        has_attachments=any(not part["is_inline"] for part in message.attachments),
        refreshed_at=now,
        email=email,
    )
    MailAttachment.objects.bulk_create(
        [
            MailAttachment(
                message=row,
                part_id=part["part_id"][:64],
                gmail_attachment_id=part["attachment_id"],
                filename=safe_name(part["filename"]),
                mime_type=part["mime_type"][:255],
                size=part["size"],
                content_id=part["content_id"][:255],
                is_inline=part["is_inline"],
            )
            for part in message.attachments
        ],
        ignore_conflicts=True,
    )
    return row, filed


def mirror_labels(connection, labels):
    """Make MailLabel match a full `labels.list` (decision 30): new ones are
    created, changed ones updated, and ones Gmail no longer has deleted.
    Labels made here and not yet in Gmail (blank id) are left alone."""
    held = {
        label.gmail_id: label
        for label in MailLabel.objects.filter(connection=connection).exclude(gmail_id="")
    }
    seen, new = set(), []
    for item in labels:
        gmail_id = str(item.get("id", ""))[:255]
        if not gmail_id:
            continue
        seen.add(gmail_id)
        color = item.get("color") or {}
        values = {
            "name": str(item.get("name", ""))[:225],
            "type": MailLabel.Type.SYSTEM if item.get("type") == "system" else MailLabel.Type.USER,
            "color_background": str(color.get("backgroundColor") or "")[:7],
            "color_text": str(color.get("textColor") or "")[:7],
        }
        label = held.get(gmail_id)
        if label is None:
            new.append(MailLabel(connection=connection, gmail_id=gmail_id, **values))
        elif any(getattr(label, field) != value for field, value in values.items()):
            for field, value in values.items():
                setattr(label, field, value)
            label.save()
    MailLabel.objects.bulk_create(new, ignore_conflicts=True)
    gone = set(held) - seen
    if gone:
        MailLabel.objects.filter(connection=connection, gmail_id__in=gone).delete()
