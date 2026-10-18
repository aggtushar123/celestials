"""Sending a draft (D3 contract §4 "POST mail/drafts/<id>/send/").

Sending is never retried by the outbox: drafts.send and messages.send are
not idempotent (decision 5). It runs inline, in this order: the carried
edit (kept whatever follows), the recipients, the record, the size, the
connection checks (paused included), the mailbox's backoff, every part
cached (decision 22), then the claim, committed before Gmail is called so a
draft is never sent twice. Every write after the claim is conditional on
its stamp. Gmail's refusals reopen the draft; no answer leaves it sending
for its owner to settle (confirm-sent, reopen). After a 2xx the draft's
own row becomes the sent copy and is filed (decision 23); its Message-ID
is read back, best effort (decision 24). A Gmail draft the send did not
take (a late flush answer stored it while the draft was sending) is
deleted by the outbox. No log line names a recipient, a subject or a file.
"""

import http.client
import logging
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from core import audit
from services.customers.drafts import UNCONFIRMED_AFTER, email_summary
from services.customers.models import Email, ReplyDraft

from . import actions, attachments, compose, drafts, gmail_sync, outbox, sending
from .actions import error
from .models import PENDING_DRAFT_PREFIX, MailboxConnection, MailDraft, MailMessage, MailOutbox
from .providers.base import RATE_LIMIT_REASONS, ProviderError
from .serializers import message_detail

logger = logging.getLogger(__name__)
Status = MailDraft.Status
State = MailDraft.GmailState
REPLIES = (MailDraft.Kind.REPLY, MailDraft.Kind.REPLY_ALL)

ADD_SOMEONE = "Add someone to send it to."
MESSAGE_TOO_LARGE = "This message is over Gmail's 25 MB limit. Remove an attachment."
DRAFT_GONE = "This draft was sent or discarded in Gmail. Check Sent before sending it again."
MAILBOX_REFUSED = "Your mailbox didn't accept the message. Try again."
SEND_UNCONFIRMED = "We couldn't confirm this was sent. Check your Sent folder."
SEND_SUPERSEDED = "This reply already went out."
NOT_UNCONFIRMED = "This draft isn't waiting for confirmation."
ATTACHMENT_GONE = "This file is no longer in Gmail."


@dataclass
class Sent:
    draft_id: int
    row: MailMessage
    email: Email | None
    #: False: the draft moved on while Gmail sent it (SEND_SUPERSEDED).
    marked: bool
    filed_now: bool


def send(request, pk, data):
    """Steps 1-12 for the caller's draft. Returns the refusing answer, or Sent."""
    user = request.user
    with transaction.atomic():
        draft = drafts.lock(user, pk)
        if draft.status != Status.OPEN:
            return error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
        if any(field in data for field in drafts.CONTENT_FIELDS):
            refused = drafts.edit(draft, data, user=user, now=timezone.now())
            if refused is not None:
                return refused
    # The edit is committed: kept whatever happens next (§4 step 3).
    return send_open(request, drafts.readable(user, pk))


def send_open(request, draft):
    """Steps 4-12 on an open draft whose edit is already committed."""
    user = request.user
    if not (draft.to or draft.cc or draft.bcc):
        return Response({"to": [ADD_SOMEONE]}, status=status.HTTP_400_BAD_REQUEST)
    record = drafts.record_of(draft)
    # SOC2:AUTH-02 filed only on a record the owner may still open
    if record is not None and compose.visible(user, record)[0] is None:
        return Response({"record": [drafts.CHOOSE_RECORD]}, status=status.HTTP_400_BAD_REQUEST)
    if drafts.total_bytes(draft) > settings.MAIL_SEND_MAX_BYTES:
        return error(
            "MESSAGE_TOO_LARGE", MESSAGE_TOO_LARGE, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    connection = MailboxConnection.objects.select_related("user").get(pk=draft.connection_id)
    refused = drafts.refusal(connection, sending=True)
    if refused is not None:
        return refused
    now = timezone.now()
    if connection.backoff_until and connection.backoff_until > now:
        return actions.gmail_busy((connection.backoff_until - now).total_seconds())
    files, related = sending.parts_of(draft)
    for part in [*files, *related]:
        if part.file:
            continue
        try:
            attachments.cache(part, attachments.fetch(part, connection), timezone.now())
        except attachments.Gone:
            return error(
                "ATTACHMENT_GONE", ATTACHMENT_GONE, status.HTTP_410_GONE, attachment_id=part.pk
            )
        except (attachments.Unavailable, attachments.Busy):
            return error(
                "ATTACHMENT_UNAVAILABLE",
                f"Couldn't get {part.filename} from Gmail. Remove it or try again.",
                status.HTTP_409_CONFLICT,
                attachment_id=part.pk,
            )
    claimed_at, claimed = _claim(user, draft)
    if claimed_at is None:
        return claimed  # the refusing answer
    claimed.connection = connection
    try:
        raw = sending.build(claimed, files, related)
        session = gmail_sync.session_for(connection)
    except Exception as exc:
        # Nothing reached Gmail: reopened, as a call never made is (§4).
        logger.warning(
            "gmail send not started for connection %s: %s", connection.pk, type(exc).__name__
        )
        reopen(claimed, claimed_at)
        return error("MAILBOX_REFUSED", MAILBOX_REFUSED, status.HTTP_502_BAD_GATEWAY)
    sent_gmail_id = claimed.gmail_draft_id
    try:
        if sent_gmail_id:
            answer = session.send_draft(sent_gmail_id, raw, claimed.thread_id)
        else:
            answer = session.send_message(raw, claimed.thread_id)
    except ProviderError as exc:
        return _refused(claimed, connection, exc, claimed_at)
    except (TimeoutError, ConnectionError, http.client.HTTPException):
        # It may have gone: left sending, never reopened here.
        return error("SEND_UNCONFIRMED", SEND_UNCONFIRMED, status.HTTP_504_GATEWAY_TIMEOUT)
    finally:
        gmail_sync.keep_credentials(connection, session)
    sent = _settle(request, claimed, connection, answer, files, claimed_at, sent_gmail_id)
    _read_back(connection, session, sent.row)
    if sent.email is not None and sent.filed_now:
        from services.customers.classification import classify_records

        classify_records([sent.email], organisation=connection.organisation, user=connection.user)
    return sent


def _claim(user, draft):
    """Step 10, in one transaction under §3's locks: open → sending with the
    claim's stamp, a linked ReplyDraft alike (refused alike), and the
    draft's pending rows deleted (the send carries the content). A row in
    flight is left: its late answer meets a draft no longer open. The
    mailbox is checked again on its locked row (a disconnect that committed
    first refuses), and content changed since the checks refuses as a stale
    edit would. Returns (stamp, the draft as locked) or (None, the refusing
    answer)."""
    with transaction.atomic():
        fresh = drafts.lock(user, draft.pk)
        if fresh.status != Status.OPEN:
            return None, error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
        if fresh.revision != draft.revision:
            return None, error(
                "DRAFT_CHANGED",
                drafts.DRAFT_CHANGED,
                status.HTTP_409_CONFLICT,
                draft=drafts.payload(fresh, user),
            )
        refused = drafts.refusal(actions.lock_connection(fresh.connection))
        if refused is not None:
            return None, refused
        claimed_at = timezone.now()
        MailDraft.objects.filter(pk=fresh.pk, status=Status.OPEN).update(
            status=Status.SENDING, updated_at=claimed_at
        )
        if fresh.reply_draft_id is not None and not ReplyDraft.objects.filter(
            pk=fresh.reply_draft_id, status=ReplyDraft.Status.OPEN
        ).update(status=ReplyDraft.Status.SENDING, updated_at=claimed_at):
            transaction.set_rollback(True)
            return None, error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
        MailOutbox.objects.filter(draft_id=fresh.pk, status=MailOutbox.Status.PENDING).delete()
    return claimed_at, fresh


# --- Settling a sending draft ---------------------------------------------


def _reopened_state(draft):
    """gmail_state for a draft open again (it may have been left `saving` by
    the rows the claim deleted, or by a late flush answer): saving while a
    row of it is live; else a failure stays failed; else saved when Gmail
    holds it, local when not."""
    if MailOutbox.objects.filter(draft_id=draft.pk, status__in=MailOutbox.LIVE).exists():
        return State.SAVING
    if draft.gmail_state == State.FAILED:
        return State.FAILED
    return State.SAVED if draft.gmail_draft_id else State.LOCAL


def _delete_gmail_copy(draft, connection_id, now):
    """A draft_delete for `draft.gmail_draft_id`, a Gmail draft no send took
    (§5's delete; a 404 there is done). Locks the mailbox row first (§3)."""
    from . import draft_flush

    actions.lock_connection(MailboxConnection(pk=connection_id))
    draft_flush._delete_later(draft, now)
    transaction.on_commit(lambda: outbox.wake(connection_id))


def _drop_pending_writes(draft, now):
    """A sent draft's pending draft_create and draft_update rows go (the
    flush may have put one back while it was sending): Gmail is never asked
    to save a draft that already went. Locks the mailbox row first (§3)."""
    actions.lock_connection(MailboxConnection(pk=draft.connection_id))
    MailOutbox.objects.filter(
        draft_id=draft.pk,
        status=MailOutbox.Status.PENDING,
        op__in=(MailOutbox.Op.DRAFT_CREATE, MailOutbox.Op.DRAFT_UPDATE),
    ).delete()


def _requeue(draft, now):
    """A reopened draft's content queued for Gmail again (the claim may have
    deleted its pending rows; an identical update is harmless), unless its
    mailbox was disconnected since."""
    connection = actions.lock_connection(MailboxConnection(pk=draft.connection_id))
    if connection.status != MailboxConnection.Status.DISCONNECTED:
        drafts.enqueue(draft, now=now)


def _settle_mail_draft(rows, *, confirm, now, forget_gmail=False):
    """confirm-sent or reopen (§4) on the sending MailDraft among `rows`,
    in the caller's transaction with its linked ReplyDraft already locked:
    one conditional UPDATE. Confirmed: sent, its Drafts row deleted (the real
    sent message arrives by history) and any Gmail draft it holds deleted
    (gone already when that was the one sent). Reopened: open, its Gmail id
    kept (cleared with `forget_gmail`), its content queued again on a
    connected mailbox unless `forget_gmail` (the draft stays local then) and
    its gmail_state read again. Returns the settled draft, or None."""
    draft = rows.select_for_update(of=("self",)).filter(status=Status.SENDING).first()
    if draft is None:
        return None
    fields = {"updated_at": now}
    if confirm:
        fields.update(status=Status.SENT, sent_at=now)
    else:
        if forget_gmail:
            draft.gmail_draft_id, draft.gmail_message_id = "", ""
            draft.gmail_state = State.LOCAL
            fields.update(gmail_draft_id="", gmail_message_id="")
        fields["status"] = Status.OPEN
    MailDraft.objects.filter(pk=draft.pk, status=Status.SENDING).update(**fields)
    if confirm and draft.message_id:
        MailMessage.objects.filter(pk=draft.message_id).delete()
    if forget_gmail and draft.message_id:
        # Back on its placeholder, so history's delete of Gmail's copy misses it.
        MailMessage.objects.filter(pk=draft.message_id).update(
            provider_message_id=f"{PENDING_DRAFT_PREFIX}{draft.pk}"
        )
    if confirm:
        _drop_pending_writes(draft, now)
        if draft.gmail_draft_id:
            _delete_gmail_copy(draft, draft.connection_id, now)
        return draft
    if not forget_gmail:
        _requeue(draft, now)
    # After the requeue: its rows decide the state (§3 locks: draft, then outbox).
    MailDraft.objects.filter(pk=draft.pk).update(gmail_state=_reopened_state(draft))
    return draft


def _lock_linked(draft):
    """§3 lock 1: the linked ReplyDraft, before the MailDraft."""
    if draft.reply_draft_id is not None:
        list(
            ReplyDraft.objects.select_for_update()
            .filter(pk=draft.reply_draft_id)
            .values_list("pk", flat=True)
        )


def reopen(draft, claimed_at, *, forget_gmail=False):
    """The conditional sending → open on the claim's stamp, for both linked
    rows. `forget_gmail`: Gmail no longer has the draft (DRAFT_GONE), so its
    id is cleared and the Drafts row goes back on its placeholder id, and
    the draft stays local; otherwise its content is queued for Gmail again."""
    now = timezone.now()
    with transaction.atomic():
        _lock_linked(draft)
        reopened = _settle_mail_draft(
            MailDraft.objects.filter(pk=draft.pk, updated_at=claimed_at),
            confirm=False,
            now=now,
            forget_gmail=forget_gmail,
        )
        if reopened is not None and draft.reply_draft_id is not None:
            ReplyDraft.objects.filter(
                pk=draft.reply_draft_id, status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            ).update(status=ReplyDraft.Status.OPEN, updated_at=now)


def _refused(draft, connection, exc, claimed_at):
    """§4 "Settling" for an answer that was a refusal: reopened, and the code."""
    logger.warning(
        "gmail send refused for connection %s: %s %s", connection.pk, exc.status, exc.reason
    )
    gone = bool(draft.gmail_draft_id) and exc.status == 404
    reopen(draft, claimed_at, forget_gmail=gone)
    if gone:
        return error("DRAFT_GONE", DRAFT_GONE, status.HTTP_409_CONFLICT)
    if exc.status == 413:
        return error(
            "MESSAGE_TOO_LARGE", MESSAGE_TOO_LARGE, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    if exc.status == 429 or (exc.status == 403 and exc.reason in RATE_LIMIT_REASONS):
        # The mailbox's own backoff is unchanged.
        return actions.gmail_busy(exc.retry_after or 60)
    if gmail_sync.classify_failure(exc) != "backoff":
        gmail_sync.pause_revoked(connection, exc)
    return error("MAILBOX_REFUSED", MAILBOX_REFUSED, status.HTTP_502_BAD_GATEWAY)


def _settle(request, draft, connection, answer, files, claimed_at, sent_gmail_id):
    """§4 "After a 2xx", in one transaction under §3's locks: the sent copy,
    the forwarded copies, the filing, the draft (and a linked ReplyDraft)
    sent on the claim's stamp, a Gmail draft the send did not take deleted,
    and the audit, written even when the draft moved on."""
    now = timezone.now()
    with transaction.atomic():
        _lock_linked(draft)
        fresh = MailDraft.objects.select_for_update().filter(pk=draft.pk).first()
        drafts.lock_rows([draft.message_id, draft.source_id])
        marked = bool(
            MailDraft.objects.filter(
                pk=draft.pk, status=Status.SENDING, updated_at=claimed_at
            ).update(status=Status.SENT, sent_at=now, updated_at=now)
        )
        row = sending.sent_copy(
            draft, connection, answer, now=now, take_draft_row=marked, has_files=bool(files)
        )
        sending.copy_forwarded(
            row, [part for part in files if part.message_id == draft.source_id], now=now
        )
        email, filed_now = sending.file_sent(
            connection, row, customer_id=draft.customer_id, account_id=draft.account_id
        )
        if marked:
            MailDraft.objects.filter(pk=draft.pk).update(message=row, sent_email=email)
            _drop_pending_writes(draft, now)
            # A late flush answer stored a Gmail draft this send did not take.
            if fresh.gmail_draft_id and fresh.gmail_draft_id != sent_gmail_id:
                _delete_gmail_copy(fresh, connection.pk, now)
            if draft.reply_draft_id is not None and ReplyDraft.objects.filter(
                pk=draft.reply_draft_id, status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            ).update(
                status=ReplyDraft.Status.SENT,
                sent_at=now,
                sent_by=request.user,
                sent_email=email,
                updated_at=now,
            ):
                audit.record(  # SOC2:LOG-01
                    "reply_draft.sent",
                    request=request,
                    target=draft.reply_draft,
                    metadata={"email": email.pk if email is not None else None},
                )
        metadata = {
            "to": [address for _, address in draft.to],
            "cc": [address for _, address in draft.cc],
            "bcc_count": len(draft.bcc),
            "subject": draft.subject,
            "attachments": len(files),
            "bytes": drafts.total_of(draft, files),
        }
        # SOC2:LOG-01 mail left the building through a credential we hold
        if draft.kind in REPLIES:
            audit.record(
                "mailbox.reply", request=request, target=draft.source or row, metadata=metadata
            )
        else:
            audit.record(
                "mailbox.sent",
                request=request,
                target=row,
                metadata={
                    "kind": draft.kind,
                    **metadata,
                    "draft": draft.pk,
                    "email": email.pk if email is not None else None,
                },
            )
    return Sent(draft.pk, row, email, marked, filed_now)


def _read_back(connection, session, row):
    """Decision 24, best effort: Gmail's own Message-ID, for a later reply."""
    try:
        meta = session.metadata(row.provider_message_id, ["Message-ID"])
    except ProviderError as exc:
        logger.info("gmail message-id read failed for connection %s: %s", connection.pk, exc.status)
        return
    headers = ((meta or {}).get("payload") or {}).get("headers") or []
    value = next(
        (h.get("value", "") for h in headers if str(h.get("name", "")).lower() == "message-id"),
        "",
    )
    if value and len(value) <= 998:
        MailMessage.objects.filter(pk=row.pk, rfc_message_id="").update(rfc_message_id=value)


def answer(request, sent):
    """The 200 body: {draft, message, email}."""
    # SOC2:AUTH-02 the sender's own sent copy
    row = MailMessage.objects.select_related("connection", "email__customer", "email__account").get(
        owner=request.user, pk=sent.row.pk
    )
    return {
        "draft": drafts.payload(drafts.readable(request.user, sent.draft_id), request.user),
        "message": message_detail(request.user, row),
        "email": email_summary(sent.email),
    }


def settle_linked(reply_id, *, confirm, now):
    """A Communications confirm-sent or reopen settles the linked MailDraft
    (§4), in the caller's transaction with the ReplyDraft locked:
    confirm-sent deletes its Drafts row (the real sent message arrives by
    history); reopen keeps its Gmail id and queues its content again."""
    _settle_mail_draft(MailDraft.objects.filter(reply_draft_id=reply_id), confirm=confirm, now=now)


def settle_unconfirmed(request, pk, *, confirm):
    """POST .../confirm-sent/ and .../reopen/ (§4): today's rule on a
    MailDraft, through one conditional UPDATE: only `sending` claimed at
    least UNCONFIRMED_AFTER ago. A linked ReplyDraft is settled with it and
    audited as today. Returns 409 NOT_UNCONFIRMED, or None."""
    with transaction.atomic():
        draft = drafts.lock(request.user, pk)
        now = timezone.now()
        settled = _settle_mail_draft(
            MailDraft.objects.filter(pk=draft.pk, updated_at__lte=now - UNCONFIRMED_AFTER),
            confirm=confirm,
            now=now,
        )
        if settled is None:
            return error("NOT_UNCONFIRMED", NOT_UNCONFIRMED, status.HTTP_409_CONFLICT)
        if draft.reply_draft_id is not None:
            fields = (
                {"status": ReplyDraft.Status.SENT, "sent_at": now, "sent_by": request.user}
                if confirm
                else {"status": ReplyDraft.Status.OPEN}
            )
            if ReplyDraft.objects.filter(
                pk=draft.reply_draft_id, status=ReplyDraft.Status.SENDING
            ).update(updated_at=now, **fields):
                audit.record(  # SOC2:LOG-01
                    "reply_draft.confirmed_sent" if confirm else "reply_draft.reopened",
                    request=request,
                    target=draft.reply_draft,
                )
    return None
