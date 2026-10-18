"""A person's Gmail drafts, Revenact's side (D3 contract §1-§3).

A `MailDraft` is one Gmail draft, owner-only. Its `message` is the Drafts
folder's row: a placeholder (`pending-draft:<id>`) until Gmail has made the
draft, then the draft's own message. Every write here runs in the request's
transaction under §3's locks (the linked ReplyDraft, the draft, its message
and source, the mailbox row, then its outbox rows), changes the draft and
its Drafts row at once, and queues one draft row for the tick
(services/mail/draft_flush.py). A row carries no body: the MIME is built at
flush time from the content then (decision 6). `revision` counts content
changes from here or from Gmail; a write from a stale one is refused (409
DRAFT_CHANGED, decision 8). Drafts may be written while the mailbox is
paused (decision 14); they cannot be sent then.
"""

import uuid
from datetime import timedelta
from email.utils import parseaddr

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, Value
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core import audit
from services.customers.drafts import UNCONFIRMED_AFTER, stamp
from services.customers.files import InvalidUpload, validate_upload
from services.customers.models import ReplyDraft

from . import actions, compose, gates, html, outbox
from .actions import GMAIL_ONLY, IS_DRAFT, NO_MAILBOX, TWO_WAY_OFF, error
from .models import (
    PENDING_DRAFT_PREFIX,
    MailAttachment,
    MailboxConnection,
    MailDraft,
    MailMessage,
    MailOutbox,
)
from .send_as import signature_block
from .sync import sender_name

Kind = MailDraft.Kind
Status = MailDraft.Status
DISCONNECTED = MailboxConnection.Status.DISCONNECTED

CHOOSE_KIND = "Choose new, reply, reply_all or forward."
CHOOSE_SOURCE = "Choose a message to answer."

Op = MailOutbox.Op
State = MailDraft.GmailState
LIVE_ROWS = MailOutbox.LIVE
#: payload(): the recipients' record match is still to be made.
MATCH = object()
#: An uploaded part's part_id prefix (§3 "Attachments").
UPLOAD_PREFIX = "upload:"
#: The fields a create, PATCH or send may carry (§3).
CONTENT_FIELDS = ("to", "cc", "bcc", "subject", "html", "forwarded", "record")
#: Changes Gmail never sees: saved without a revision or a row (plan gap 2).
RECORD_FIELDS = frozenset({"customer", "account", "record_chosen"})
#: apply_content's name for a file added or removed (no model field).
ATTACHMENTS = "attachments"

ALREADY_SENT = "This draft has been sent."
DRAFT_CHANGED = "This draft changed in Gmail. Here is the newest version."
SEND_REVISION = "Send the revision you edited."
AGENT_RECORD = "An agent draft stays on its record."
CHOOSE_RECORD = "Choose a record you can open."
TOO_LONG = "This message is too long."
CHOOSE_FORWARDED = "Choose files from the message you are forwarding."
TOO_MANY_FILES = "A message can carry 25 files."
TOO_LARGE_DRAFT = "Attachments are limited to 25 MB in total."
CHOOSE_FILE = "Choose a file."
DRAFT_SAVING = "This draft is still saving. Try again in a moment."
TOO_MANY_PEOPLE = "A message can go to at most {limit} people."


def refusal(connection, *, sending=False):
    """Contract §3's connection checks, the first failing answering: 1 Outlook
    or IMAP, 2 Google disconnected (or no mailbox at all), 3 not two-way, 4
    (sending only) paused."""
    if connection is not None and not connection.is_google:
        return error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
    if connection is None or connection.status == DISCONNECTED:
        return error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    if not connection.two_way:
        return error("TWO_WAY_OFF", TWO_WAY_OFF, status.HTTP_409_CONFLICT, needs_reconnect=True)
    if sending:
        return gates.paused_response(connection)
    return None


def is_draft(message):
    """A live draft's message (decision 13); a joined `draft` costs nothing."""
    try:
        draft = message.draft
    except ObjectDoesNotExist:
        return False
    return draft.status in MailDraft.LIVE


def is_draft_answer():
    return error("IS_DRAFT", IS_DRAFT, status.HTTP_409_CONFLICT)


def own_message(user, pk):
    """One of the caller's own messages, its connection, filed record and draft
    joined; Http404 for anyone else's, however senior."""
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    message = (
        MailMessage.objects.filter(owner=user, pk=pk)
        .select_related("connection__user", "email__customer", "email__account", "draft")
        .first()
    )
    if message is None:
        raise Http404
    return message


def own_connection(user):
    """The caller's own mailbox row, read fresh (a kept, disconnected Google row included)."""
    # SOC2:AUTH-02 the caller's own mailbox only
    return MailboxConnection.objects.select_related("user").filter(user=user).first()


# --- Content (§3 "Writes: shared rules") ---------------------------------


def _recipient(item):
    """[name, address] from a pair or a bare address; ValueError otherwise."""
    if isinstance(item, str):
        name, address = parseaddr(item)
    elif (
        isinstance(item, (list, tuple))
        and len(item) == 2
        and all(isinstance(part, str) for part in item)
    ):
        name, address = item
    else:
        raise ValueError("not a recipient")
    address = address.strip().lower()
    validate_email(address)
    return [name.strip()[:150], address]


class RecipientsField(serializers.Field):
    default_error_messages = {
        "not_a_list": 'Expected a list of items but got type "{input_type}".',
        "invalid": "Enter a valid email address.",
    }

    def to_internal_value(self, data):
        if not isinstance(data, list):
            self.fail("not_a_list", input_type=type(data).__name__)
        try:
            return [_recipient(item) for item in data]
        except (ValueError, DjangoValidationError):
            self.fail("invalid")

    def to_representation(self, value):
        return value


class RecordField(serializers.Field):
    default_error_messages = {"invalid": CHOOSE_RECORD}

    def to_internal_value(self, data):
        if not isinstance(data, dict) or data.get("kind") not in ("customer", "account"):
            self.fail("invalid")
        pk = data.get("id")
        if not isinstance(pk, int) or isinstance(pk, bool) or pk < 1:
            self.fail("invalid")
        return compose.Record(data["kind"], pk, "")

    def to_representation(self, value):
        return value


class ContentSerializer(serializers.Serializer):
    to = RecipientsField(required=False)
    cc = RecipientsField(required=False)
    bcc = RecipientsField(required=False)
    subject = serializers.CharField(
        max_length=255, allow_blank=True, required=False, trim_whitespace=False
    )
    html = serializers.CharField(allow_blank=True, required=False, trim_whitespace=False)
    forwarded = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=100
    )
    record = RecordField(required=False, allow_null=True)


def check_shape(data):
    """DRF's field errors for the content fields (400), before the connection checks."""
    ContentSerializer(data=data).is_valid(raise_exception=True)


def dedupe(to, cc, bcc):
    """Each address once across the three, To then Cc then Bcc (§3)."""
    seen, kept = set(), []
    for pairs in (to, cc, bcc):
        field = []
        for name, address in pairs:
            if address not in seen:
                seen.add(address)
                field.append([name, address])
        kept.append(field)
    return tuple(kept)


def clean(data, *, user, kind, source_id, base, linked=False, connection=None):
    """The content fields `data` carries, checked (§3): DRF's field errors,
    then the HTML's size, the forwarded files, the record and the recipient
    limit, every problem at once as a 400. `base` holds the to, cc and bcc
    the sent ones are de-duplicated against. Returns the fields sent."""
    serializer = ContentSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    valid = dict(serializer.validated_data)
    errors = {}
    if "html" in valid:
        safe = html.clean(valid["html"])
        if connection is not None and connection.is_google:
            # R2D1-16: the editor keeps the block's place; Gmail's signature fills it.
            safe = html.restore_signature(safe, signature_block(connection))
        if len(safe.encode()) > settings.MAIL_HTML_MAX_BYTES:
            errors["html"] = [TOO_LONG]
        valid["html"] = safe
    if "forwarded" in valid:
        ids = list(dict.fromkeys(valid["forwarded"]))
        allowed = set()
        if ids and kind == Kind.FORWARD and source_id:
            allowed = set(
                MailAttachment.objects.filter(
                    message_id=source_id, is_inline=False, pk__in=ids
                ).values_list("pk", flat=True)
            )
        if set(ids) - allowed:
            errors["forwarded"] = [CHOOSE_FORWARDED]
        valid["forwarded"] = ids
    if "record" in valid:
        if linked:
            errors["record"] = [AGENT_RECORD]
        elif valid["record"] is not None:
            # SOC2:AUTH-02 a draft files only on a record its owner may open
            found = compose.lookup(user, valid["record"])
            if found is None:
                errors["record"] = [CHOOSE_RECORD]
            valid["record"] = found
    if any(field in valid for field in ("to", "cc", "bcc")):
        to, cc, bcc = dedupe(*(valid.get(field, base[field]) for field in ("to", "cc", "bcc")))
        limit = settings.MAIL_SEND_MAX_RECIPIENTS
        if len(to) + len(cc) + len(bcc) > limit:
            errors["non_field_errors"] = [TOO_MANY_PEOPLE.format(limit=limit)]
        valid.update(to=to, cc=cc, bcc=bcc)
    if errors:
        raise ValidationError(errors)
    return valid


def record_ids(record):
    """(customer_id, account_id) for a compose.Record or None."""
    if record is None:
        return None, None
    return (record.id, None) if record.kind == "customer" else (None, record.id)


def record_of(draft):
    """The record the draft files on, with its name (joined), or None."""
    if draft.customer_id is not None:
        return compose.Record("customer", draft.customer_id, draft.customer.name)
    if draft.account_id is not None:
        return compose.Record("account", draft.account_id, draft.account.name)
    return None


# --- Writing it ----------------------------------------------------------


def snippet(text):
    """A message row's one-line preview of a body (300 characters)."""
    return " ".join(text.split())[:300]


def lock_rows(message_ids):
    """Lock messages in pk order (§3 lock 3)."""
    ids = sorted({pk for pk in message_ids if pk})
    if ids:
        list(
            MailMessage.objects.select_for_update()
            .filter(pk__in=ids)
            .order_by("pk")
            .values_list("pk", flat=True)
        )


def enqueue(draft, *, now):
    """§3 "Enqueueing", in the caller's transaction once the mailbox row is
    locked. A pending create builds from the content at flush time and needs
    nothing more; a pending update is made due again under a new action id;
    otherwise an update when Gmail has the draft or a create is in flight
    (plan gap 4), else a create. Sets gmail_state (unsaved) and wakes the
    mailbox on commit."""
    rows = list(
        MailOutbox.objects.select_for_update()
        .filter(draft=draft, status__in=LIVE_ROWS)
        .order_by("pk")
    )
    pending = next((row for row in rows if row.status == MailOutbox.Status.PENDING), None)
    if pending is not None and pending.op == Op.DRAFT_UPDATE:
        MailOutbox.objects.filter(pk=pending.pk).update(
            action_id=uuid.uuid4(), next_attempt_at=now, attempts=0, updated_at=now
        )
    elif pending is None:
        creating = any(row.op == Op.DRAFT_CREATE for row in rows)
        MailOutbox.objects.create(
            connection_id=draft.connection_id,
            action_id=uuid.uuid4(),
            op=Op.DRAFT_UPDATE if draft.gmail_draft_id or creating else Op.DRAFT_CREATE,
            draft=draft,
            next_attempt_at=now,
        )
    draft.gmail_state = State.SAVING
    connection_id = draft.connection_id
    transaction.on_commit(lambda: outbox.wake(connection_id))


def create(connection, user, *, kind, source, content, now, record_chosen=False, reply_draft=None):
    """A new open draft, its placeholder in Drafts (decision 2) and its
    draft_create row (§3 POST). `content` is complete: to, cc, bcc, subject,
    html, forwarded and record."""
    markup = html.clean(content["html"])
    customer_id, account_id = record_ids(content.get("record"))
    draft = MailDraft.objects.create(
        connection=connection,
        owner=user,
        organisation_id=connection.organisation_id,
        kind=kind,
        source=source,
        thread_id=source.thread_id if source is not None else "",
        in_reply_to=source.rfc_message_id if source is not None else "",
        references=source.references if source is not None else "",
        to=content["to"],
        cc=content["cc"],
        bcc=content["bcc"],
        subject=content["subject"][:255],
        html=markup,
        text=html.to_text(markup),
        forwarded=content["forwarded"],
        customer_id=customer_id,
        account_id=account_id,
        record_chosen=record_chosen,
        reply_draft=reply_draft,
    )
    draft.message = drafts_row(draft, f"{PENDING_DRAFT_PREFIX}{draft.pk}", now=now)
    enqueue(draft, now=now)
    draft.save(update_fields=["message", "gmail_state"])
    return draft


def drafts_row(draft, provider_message_id, *, now):
    """A new Drafts row showing the draft's content (decision 2)."""
    connection = draft.connection
    return MailMessage.objects.create(
        connection=connection,
        owner_id=draft.owner_id,
        organisation_id=draft.organisation_id,
        provider_message_id=provider_message_id,
        thread_id=draft.thread_id,
        direction=MailMessage.Direction.SENT,
        from_name=sender_name(connection)[:150],
        from_address=connection.address,
        to=draft.to,
        cc=draft.cc,
        bcc=draft.bcc,
        subject=draft.subject,
        snippet=snippet(draft.text),
        body=draft.text,
        html_body=draft.html,
        label_ids=["DRAFT"],
        folder=MailMessage.Folder.DRAFTS,
        state=MailMessage.State.OPEN,
        is_read=True,
        has_attachments=bool(draft.forwarded),
        sent_at=now,
        refreshed_at=now,
    )


def give_row(draft, provider_message_id, *, now):
    """A live draft found with no Drafts row (final review 1): it takes the
    row held for its Gmail message when no other draft holds it, else a new
    one showing its content, in the caller's transaction with the draft
    locked. Returns the row, or None when another draft holds that id."""
    held = (
        MailMessage.objects.select_for_update()
        .filter(connection_id=draft.connection_id, provider_message_id=provider_message_id)
        .first()
    )
    if held is not None and MailDraft.objects.filter(message=held).exists():
        return None
    row = held or drafts_row(draft, provider_message_id, now=now)
    MailDraft.objects.filter(pk=draft.pk).update(message=row)
    draft.message = row
    return row


def create_from_request(connection, user, kind, source, data, *, now):
    """POST mail/drafts/ (§3), in the caller's transaction with the source and
    the mailbox row locked: the prefill with the person's fields over it."""
    base = compose.prefill(connection, user, kind, source)
    valid = clean(
        data,
        user=user,
        kind=kind,
        source_id=source.pk if source is not None else None,
        base={"to": base.to, "cc": base.cc, "bcc": base.bcc},
        connection=connection,
    )
    chosen = "record" in valid
    content = {
        "to": valid.get("to", base.to),
        "cc": valid.get("cc", base.cc),
        "bcc": valid.get("bcc", base.bcc),
        "subject": valid.get("subject", base.subject),
        "html": valid.get("html", base.html),
        "forwarded": valid.get("forwarded", [part.pk for part in base.forwarded]),
        "record": valid["record"] if chosen else base.record,
    }
    if "to" in valid or "cc" in valid:
        suggested = compose.suggest(connection, [*content["to"], *content["cc"]])
    else:
        suggested = base.suggested
    if not chosen and kind in (Kind.NEW, Kind.FORWARD):
        # A new message or a forward follows the people it now goes to; a
        # reply keeps its source's filed record (plan gap 3).
        content["record"] = compose.visible(user, suggested)[0]
    draft = create(
        connection, user, kind=kind, source=source, content=content, now=now, record_chosen=chosen
    )
    # The 201's payload reuses it rather than matching the recipients again.
    draft.suggestion = suggested
    return draft


# --- Reading it (§2) ----------------------------------------------------

#: What every read of a draft joins.
RELATED = ("connection__user", "message", "source", "customer", "account", "reply_draft")


def readable(user, pk):
    """The caller's draft, unless discarded; Http404 for anyone else's."""
    # SOC2:AUTH-02 a draft is its owner's alone, however senior the reader
    draft = (
        MailDraft.objects.filter(owner=user, pk=pk)
        .exclude(status=Status.DISCARDED)
        .select_related(*RELATED)
        .first()
    )
    if draft is None:
        raise Http404
    return draft


def attachments_of(draft):
    """The draft's own parts and its forwarded files, in one query."""
    where = []
    if draft.message_id:
        where.append(Q(message_id=draft.message_id))
    if draft.forwarded and draft.source_id:
        where.append(Q(pk__in=draft.forwarded, message_id=draft.source_id))
    if not where:
        return []
    query = where[0]
    for more in where[1:]:
        query |= more
    return list(MailAttachment.objects.filter(query).order_by("pk"))


def _own(draft, part):
    return draft.message_id is not None and part.message_id == draft.message_id


def _forwarded(draft, part):
    return part.pk in set(draft.forwarded) and part.message_id == draft.source_id


def total_of(draft, parts):
    """Decision 20's total: the files' declared sizes plus both bodies."""
    files = sum(part.size for part in parts if _own(draft, part) or _forwarded(draft, part))
    return files + len(draft.html.encode()) + len(draft.text.encode())


def total_bytes(draft):
    return total_of(draft, attachments_of(draft))


def sending_state(draft, now=None):
    """None, "pending", or "unconfirmed" once UNCONFIRMED_AFTER has passed since the claim."""
    if draft.status != Status.SENDING:
        return None
    waited = (now or timezone.now()) - draft.updated_at
    return "unconfirmed" if waited >= UNCONFIRMED_AFTER else "pending"


def sync_issue(draft, now=None):
    """The draft's newest row's failure, when it is the newest row and within
    MAIL_OUTBOX_ISSUE_DAYS (§2); else None. One query."""
    now = now or timezone.now()
    row = MailOutbox.objects.filter(draft=draft).order_by("-created_at", "-pk").first()
    if row is None or row.status != MailOutbox.Status.FAILED:
        return None
    if row.failed_at < now - timedelta(days=settings.MAIL_OUTBOX_ISSUE_DAYS):
        return None
    return {"text": outbox.draft_sentence(row, row.reason), "at": row.failed_at}


def payload(draft, user):
    """GET mail/drafts/<id>/ (§2), for its owner. Needs RELATED joined."""
    parts = attachments_of(draft)
    rows = [
        compose.attachment_row(
            part, "upload" if part.part_id.startswith(UPLOAD_PREFIX) else "gmail"
        )
        for part in parts
        if _own(draft, part)
    ]
    rows += [compose.attachment_row(part, "forward") for part in parts if _forwarded(draft, part)]
    suggested = getattr(draft, "suggestion", MATCH)
    if suggested is MATCH:
        suggested = compose.suggest(draft.connection, [*draft.to, *draft.cc])
    record, suggested = compose.visible(user, record_of(draft), suggested)
    sending = sending_state(draft)
    source = draft.source
    reply = draft.reply_draft
    return {
        "id": draft.pk,
        "kind": draft.kind,
        # `sending` is internal: a draft being sent reads as sent, sent_at null.
        "status": "open" if draft.status == Status.OPEN else "sent",
        "sending": sending,
        "revision": draft.revision,
        "message_id": draft.message_id,
        "thread_id": draft.thread_id,
        "source": None
        if source is None
        else {
            "message_id": source.pk,
            "subject": source.subject,
            "from": {"name": source.from_name, "address": source.from_address},
            "sent_at": stamp(source.sent_at),
        },
        "from": {"name": sender_name(draft.connection), "address": draft.connection.address},
        "to": draft.to,
        "cc": draft.cc,
        "bcc": draft.bcc,
        "subject": draft.subject,
        "html": draft.html,
        "text": draft.text,
        "attachments": rows,
        "total_bytes": total_of(draft, parts),
        "max_bytes": settings.MAIL_SEND_MAX_BYTES,
        "record": compose.as_payload(record),
        "suggested_record": compose.as_payload(suggested),
        "record_chosen": draft.record_chosen,
        "gmail": {"state": draft.gmail_state},
        "sync_issue": sync_issue(draft),
        "agent": reply.agent if reply is not None else None,
        "reply_draft_id": draft.reply_draft_id,
        "created_at": stamp(draft.created_at),
        "updated_at": stamp(draft.updated_at),
        "sent_at": None if draft.sent_at is None else stamp(draft.sent_at),
        "can_resolve": sending == "unconfirmed",
    }


# --- Editing it (§3 PATCH) ------------------------------------------------


def lock(user, pk):
    """The caller's draft (not discarded), locked in §3's order: the linked
    ReplyDraft, the draft, then its message and source. Http404 for anyone
    else's draft, however senior."""
    # SOC2:AUTH-02 a draft is its owner's alone
    mine = MailDraft.objects.filter(owner=user).exclude(status=Status.DISCARDED)
    found = mine.filter(pk=pk).values("reply_draft_id").first()
    if found is None:
        raise Http404
    if found["reply_draft_id"] is not None:
        list(
            ReplyDraft.objects.select_for_update()
            .filter(pk=found["reply_draft_id"])
            .values_list("pk", flat=True)
        )
    draft = mine.select_for_update(of=("self",)).select_related(*RELATED).filter(pk=pk).first()
    if draft is None:
        raise Http404
    lock_rows([draft.message_id, draft.source_id])
    return draft


def apply_content(draft, valid, *, user):
    """Set clean()'s fields on `draft`, unsaved; the names that changed. A
    new message's or forward's record follows the suggestion as recipients
    change, until the person chose one (decision 25, plan gap 3)."""
    changed = set()
    for field in ("to", "cc", "bcc", "subject", "forwarded"):
        if field in valid and getattr(draft, field) != valid[field]:
            setattr(draft, field, valid[field])
            changed.add(field)
    if "html" in valid and valid["html"] != draft.html:
        draft.html = valid["html"]
        draft.text = html.to_text(valid["html"])
        changed |= {"html", "text"}
    if "record" in valid:
        ids = record_ids(valid["record"])
        if ids != (draft.customer_id, draft.account_id) or not draft.record_chosen:
            draft.customer_id, draft.account_id = ids
            draft.record_chosen = True
            changed |= RECORD_FIELDS
    elif (
        changed & {"to", "cc"}
        and not draft.record_chosen
        and draft.reply_draft_id is None
        and draft.kind in (Kind.NEW, Kind.FORWARD)
    ):
        [suggested] = compose.visible(
            user, compose.suggest(draft.connection, [*draft.to, *draft.cc])
        )
        ids = record_ids(suggested)
        if ids != (draft.customer_id, draft.account_id):
            draft.customer_id, draft.account_id = ids
            changed |= {"customer", "account"}
    return changed


def show(draft, *, now):
    """The Drafts row shows the content at once (§3 "Enqueueing")."""
    if draft.message_id is None:
        return
    files = MailAttachment.objects.filter(message_id=OuterRef("pk"), is_inline=False)
    MailMessage.objects.filter(pk=draft.message_id).update(
        to=draft.to,
        cc=draft.cc,
        bcc=draft.bcc,
        subject=draft.subject,
        snippet=snippet(draft.text),
        body=draft.text,
        html_body=draft.html,
        sent_at=now,
        has_attachments=Value(True) if draft.forwarded else Exists(files),
    )


def mirror(draft, *, now):
    """A linked agent draft is the same message (decisions 3, 31): its
    subject, body (the text, at most 20,000 characters) and to follow."""
    if draft.reply_draft_id is None:
        return
    ReplyDraft.objects.filter(pk=draft.reply_draft_id).update(
        subject=draft.subject[:255], body=draft.text[:20_000], to=draft.to, updated_at=now
    )


def commit(draft, changed, *, now, mirror_back=True):
    """Save apply_content's `changed`. A content change (anything but the
    record) also bumps the revision, queues it for Gmail, shows it in Drafts
    and mirrors a linked ReplyDraft. Returns whether anything changed; a
    write that changes nothing queues nothing (§3 PATCH)."""
    if not changed:
        return False
    fields = set(changed) - {ATTACHMENTS}
    content = set(changed) - RECORD_FIELDS
    if content:
        draft.revision += 1
        enqueue(draft, now=now)
        fields |= {"revision", "gmail_state"}
    draft.save(update_fields=sorted(fields | {"updated_at"}))
    if content:
        show(draft, now=now)
        if mirror_back:
            mirror(draft, now=now)
    return True


def edit(draft, data, *, user, now):
    """PATCH's rules on a locked draft (§3), shared by the send's step 3: 409
    ALREADY_SENT, the content's 400s, the revision, 409 DRAFT_CHANGED, the
    connection checks 1-3 on the locked mailbox row, then the change.
    Returns the refusing answer, or None."""
    if draft.status != Status.OPEN:
        return error("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
    valid = clean(
        data,
        user=user,
        kind=draft.kind,
        source_id=draft.source_id,
        base={"to": draft.to, "cc": draft.cc, "bcc": draft.bcc},
        linked=draft.reply_draft_id is not None,
        connection=draft.connection,
    )
    revision = data.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool):
        raise ValidationError({"revision": [SEND_REVISION]})
    if revision != draft.revision:
        return error(
            "DRAFT_CHANGED", DRAFT_CHANGED, status.HTTP_409_CONFLICT, draft=payload(draft, user)
        )
    refused = refusal(actions.lock_connection(draft.connection))
    if refused is not None:
        return refused
    commit(draft, apply_content(draft, valid, user=user), now=now)
    return None


# --- Attachments (§3 "Attachments") ----------------------------------------


def add_upload(draft, uploaded, *, now):
    """§3 "POST .../attachments/" on a locked open draft whose connection
    passed the checks: validate_upload's rules (SOC2:API-10), at most
    MAIL_DRAFT_MAX_ATTACHMENTS, the total within MAIL_SEND_MAX_BYTES; then
    the file is stored cached on the draft's row and the change queued.
    Returns (the part, the new total in bytes, None) or (None, None, the
    refusing answer)."""
    if uploaded is None:
        return None, None, Response({"file": [CHOOSE_FILE]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        # SOC2:API-10 the Files tab's closed list, magic bytes and size cap
        name, _, content_type = validate_upload(uploaded)
    except InvalidUpload as exc:
        return None, None, Response({"file": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
    if draft.message_id is None:
        # No Drafts row to hold the file until the next tick gives it one.
        return None, None, error("DRAFT_SAVING", DRAFT_SAVING, status.HTTP_409_CONFLICT)
    parts = attachments_of(draft)
    count = sum(1 for part in parts if _own(draft, part) or _forwarded(draft, part))
    if count >= settings.MAIL_DRAFT_MAX_ATTACHMENTS:
        return (
            None,
            None,
            error("TOO_MANY_ATTACHMENTS", TOO_MANY_FILES, status.HTTP_400_BAD_REQUEST),
        )
    total = total_of(draft, parts) + uploaded.size
    if total > settings.MAIL_SEND_MAX_BYTES:
        return (
            None,
            None,
            error("DRAFT_TOO_LARGE", TOO_LARGE_DRAFT, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE),
        )
    part = MailAttachment(
        message=draft.message,
        part_id=f"{UPLOAD_PREFIX}{uuid.uuid4().hex}",
        filename=name,
        mime_type=content_type,
        size=uploaded.size,
        is_inline=False,
        fetched_at=now,
    )
    part.file.save(name, uploaded, save=False)
    part.save()
    commit(draft, {ATTACHMENTS}, now=now)
    return part, total, None


def remove_part(draft, attachment_id, *, now):
    """§3 "DELETE .../attachments/<id>/": an upload or Gmail part of the
    draft's row is deleted (its file on commit); a forwarded file is only
    left out of `forwarded`. Http404 for a part not on this draft."""
    if attachment_id in draft.forwarded:
        draft.forwarded = [pk for pk in draft.forwarded if pk != attachment_id]
        commit(draft, {"forwarded"}, now=now)
        return
    part = MailAttachment.objects.filter(pk=attachment_id, message_id=draft.message_id).first()
    if part is None or draft.message_id is None:
        raise Http404
    part.delete()
    commit(draft, {ATTACHMENTS}, now=now)


# --- Discarding (§3 DELETE, bulk discard) ---------------------------------


def lock_many(user, ids):
    """The caller's open drafts among `ids`, locked in §3's order (their
    ReplyDrafts, the drafts, their messages and sources)."""
    # SOC2:AUTH-02 only the caller's own open drafts
    mine = MailDraft.objects.filter(owner=user, status=Status.OPEN, pk__in=list(ids))
    linked = [pk for pk in mine.values_list("reply_draft_id", flat=True) if pk is not None]
    if linked:
        list(
            ReplyDraft.objects.select_for_update()
            .filter(pk__in=linked)
            .order_by("pk")
            .values_list("pk", flat=True)
        )
    found = list(mine.select_for_update(of=("self",)).select_related(*RELATED).order_by("pk"))
    lock_rows([pk for draft in found for pk in (draft.message_id, draft.source_id)])
    return found


def _creating(found):
    """The ids among `found` whose draft_create is in flight."""
    return set(
        MailOutbox.objects.filter(
            draft_id__in=[draft.pk for draft in found],
            op=Op.DRAFT_CREATE,
            status=MailOutbox.Status.SENDING,
        ).values_list("draft_id", flat=True)
    )


def by_mailbox(found):
    """`found` grouped by mailbox, in mailbox pk order (the order bulk locks)."""
    groups = {}
    for draft in found:
        groups.setdefault(draft.connection_id, []).append(draft)
    return [groups[pk] for pk in sorted(groups)]


def discard_refusal(found):
    """§3 DELETE's refusals after the 404, per mailbox (each locked in pk
    order): 409 ALREADY_SENT; 400 GMAIL_ONLY; 409 NO_MAILBOX only when a
    disconnected mailbox's Gmail holds one of its drafts (a local-only draft
    is discarded anyway). Paused may discard. One refused mailbox refuses
    the whole request."""
    if any(draft.status != Status.OPEN for draft in found):
        return error("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
    for group in by_mailbox(found):
        connection = actions.lock_connection(group[0].connection)
        if not connection.is_google:
            return error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
        if connection.status == DISCONNECTED and (
            any(draft.gmail_draft_id for draft in group) or _creating(group)
        ):
            return error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    return None


def discard(found, *, request, now, reply_drafts=True):
    """Decision 11 for locked open drafts, one mailbox at a time (each is
    woken): each is discarded
    and its Drafts row deleted at once; pending rows go (a pending create
    never reached Gmail, pending updates collapse); a draft Gmail never had
    is deleted now, and one Gmail holds (or whose create is in flight) gets
    one draft_delete. A linked ReplyDraft is unlinked first, so deleting it
    never takes a draft still owed a Gmail delete; with `reply_drafts` it is
    deleted here, audited reply_draft.discarded."""
    for group in by_mailbox(found):
        _discard_mailbox(group, request=request, now=now, reply_drafts=reply_drafts)


def _discard_mailbox(found, *, request, now, reply_drafts):
    ids = [draft.pk for draft in found]
    creating = _creating(found)
    in_gmail = [draft for draft in found if draft.gmail_draft_id or draft.pk in creating]
    held = {draft.pk for draft in in_gmail}
    linked = [draft.reply_draft for draft in found if draft.reply_draft_id is not None]
    if reply_drafts:
        for reply in linked:
            audit.record("reply_draft.discarded", request=request, target=reply)  # SOC2:LOG-01
    MailDraft.objects.filter(pk__in=ids).update(
        status=Status.DISCARDED, message=None, reply_draft=None, updated_at=now
    )
    MailMessage.objects.filter(pk__in=[d.message_id for d in found if d.message_id]).delete()
    if reply_drafts and linked:
        ReplyDraft.objects.filter(pk__in=[reply.pk for reply in linked]).delete()
    MailOutbox.objects.filter(draft_id__in=ids, status=MailOutbox.Status.PENDING).delete()
    MailDraft.objects.filter(pk__in=[pk for pk in ids if pk not in held]).delete()
    if in_gmail:
        action_id = uuid.uuid4()
        MailOutbox.objects.bulk_create(
            [
                MailOutbox(
                    connection_id=draft.connection_id,
                    action_id=action_id,
                    op=Op.DRAFT_DELETE,
                    draft_id=draft.pk,
                    payload={"gmail_draft_id": draft.gmail_draft_id}
                    if draft.gmail_draft_id
                    else {},
                    next_attempt_at=now,
                )
                for draft in in_gmail
            ]
        )
        connection_id = in_gmail[0].connection_id
        transaction.on_commit(lambda: outbox.wake(connection_id))


# --- Agent drafts (§3 "ReplyDraft changes", decisions 3, 31) ---------------


def link_agent_draft(reply, *, now):
    """Decision 3: an applied email draft is also a Gmail draft when its
    source is in its owner's own two-way, live, unpaused Google mailbox; its
    HTML is the text in paragraphs plus the signature, its record fixed.
    Otherwise it stays Revenact-only for life. Returns the MailDraft or None."""
    if reply.channel != ReplyDraft.Channel.EMAIL or reply.email_id is None:
        return None
    # SOC2:AUTH-02 only the owner's own copy of the source, in their own mailbox
    source = (
        MailMessage.objects.select_related("connection__user")
        .filter(email_id=reply.email_id, owner_id=reply.owner_id)
        .order_by("pk")
        .first()
    )
    connection = source.connection if source is not None else None
    if (
        connection is None
        or not connection.two_way
        or connection.status != MailboxConnection.Status.CONNECTED
        or gates.paused_reason(connection)
    ):
        return None
    record = (
        compose.Record("customer", reply.customer_id, "")
        if reply.customer_id is not None
        else compose.Record("account", reply.account_id, "")
    )
    with transaction.atomic():
        lock_rows([source.pk])
        connection = actions.lock_connection(connection)
        return create(
            connection,
            reply.owner,
            kind=Kind.REPLY,
            source=source,
            content={
                "to": reply.to,
                "cc": [],
                "bcc": [],
                "subject": reply.subject,
                "html": html.paragraphs(reply.body) + signature_block(connection),
                "forwarded": [],
                "record": record,
            },
            now=now,
            record_chosen=True,
            reply_draft=reply,
        )


def linked_open(reply):
    """The id of the open MailDraft linked to `reply`, or None."""
    return (
        MailDraft.objects.filter(reply_draft_id=reply.pk, status=Status.OPEN)
        .values_list("pk", flat=True)
        .first()
    )


def _locked_linked(reply):
    """The open MailDraft linked to `reply` (its ReplyDraft already locked),
    locked in §3's order: the draft, its message and source, its mailbox."""
    found = list(
        MailDraft.objects.select_for_update(of=("self",))
        .select_related(*RELATED)
        .filter(reply_draft_id=reply.pk, status=Status.OPEN)
    )
    for draft in found:
        lock_rows([draft.message_id, draft.source_id])
        actions.lock_connection(draft.connection)
    return found


def discard_linked(reply, *, request, now):
    """A Communications DELETE or an undo of a linked draft: the MailDraft is
    discarded (and unlinked, so the ReplyDraft's deletion never cascades to
    it); the caller deletes and audits the ReplyDraft. The caller holds the
    ReplyDraft's lock (§3 lock 1)."""
    found = _locked_linked(reply)
    if found:
        discard(found, request=request, now=now, reply_drafts=False)


def follow_reply_edit(reply, changed, *, now):
    """Decision 31: a Communications edit (`changed` holds body and/or
    subject) rewrites the linked open MailDraft: the subject, and the HTML
    from the text in paragraphs with the signature block kept. Whatever
    follows the first "-- " line is the signature text the mirror wrote and
    is dropped (plan gap 11). Not mirrored back: the text stays as typed."""
    found = _locked_linked(reply)
    if not found:
        return
    draft = found[0]
    fields = set()
    if "subject" in changed and draft.subject != reply.subject:
        draft.subject = reply.subject
        fields.add("subject")
    if "body" in changed:
        text = reply.body.split("\n-- \n", 1)[0]
        if text.startswith("-- \n"):
            text = ""
        keep = signature_block(draft.connection) if html.SIGNATURE_ATTR in draft.html else ""
        markup = html.clean(html.paragraphs(text) + keep)
        if markup != draft.html:
            draft.html, draft.text = markup, html.to_text(markup)
            fields |= {"html", "text"}
    commit(draft, fields, now=now, mirror_back=False)
