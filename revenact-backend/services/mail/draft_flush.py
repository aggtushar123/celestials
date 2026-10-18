"""Draft rows to Gmail: the flush's second step (D3 contract §5 "The
flush"), after label creations and before label rows (decision 7), oldest
first, at most MAIL_OUTBOX_DRAFT_CALLS_PER_TICK calls; the rest wait,
uncounted.

A create or update builds the MIME from the draft's content now (decision
6), after every part it carries is cached. An update waits while its
draft's create is in flight; one with no Gmail id and no create left runs
as a create (plan gap 5). On 2xx the Drafts row takes Gmail's message id;
a draft no longer open has its new Gmail draft deleted at once. Gmail's
404 on an update recreates the draft with no notice (decision 9); on a
delete it is done. 413 fails at once (too_large). Other answers follow D2:
refusals count, 5xx counts and backs off, rate limits and lost grants count
nothing. A failure never reverts the person's writing (decision 10): the
draft reads gmail_state failed and the owner is told once.
"""

import logging
import uuid

from django.conf import settings
from django.db import transaction
from django.db.models import F

from . import attachments, drafts, gmail_sync, outbox, sending
from .models import PENDING_DRAFT_PREFIX, MailboxConnection, MailDraft, MailMessage, MailOutbox
from .providers.base import ProviderError

logger = logging.getLogger(__name__)
Op = MailOutbox.Op
Reason = MailOutbox.Reason
Status = MailOutbox.Status
State = MailDraft.GmailState
DraftStatus = MailDraft.Status
PART_GONE = {"part": "gone"}


def run(flush):
    rows = flush._claim(flush._due().filter(op__in=MailOutbox.DRAFT_OPS))
    calls = 0
    for row in rows:
        draft = (
            MailDraft.objects.select_related("connection__user", "message", "source")
            .filter(pk=row.draft_id)
            .first()
        )
        if draft is None:  # gone meanwhile (a discard of a draft Gmail never had)
            flush._sent([row])
            continue
        if _waits(row, draft) or calls >= settings.MAIL_OUTBOX_DRAFT_CALLS_PER_TICK:
            back(flush, row)
            continue
        calls += 1
        try:
            _one(flush, row, draft)
        except ProviderError as exc:
            _failed_call(flush, row, draft, exc)


def _creating(row, draft):
    return (
        MailOutbox.objects.filter(draft_id=draft.pk, op=Op.DRAFT_CREATE, status__in=MailOutbox.LIVE)
        .exclude(pk=row.pk)
        .exists()
    )


def _waits(row, draft):
    """An update or delete waits for its draft's create in flight (§5)."""
    if row.op == Op.DRAFT_UPDATE and not draft.gmail_draft_id:
        return _creating(row, draft)
    if row.op == Op.DRAFT_DELETE and not (
        row.payload.get("gmail_draft_id") or draft.gmail_draft_id
    ):
        return _creating(row, draft)
    return False


def back(flush, row, **fields):
    """Pending again (with `fields`). A pending row made meanwhile for the
    same draft covers the content: an old create keeps its place and the
    newer update goes; otherwise the old row goes (plan gap 6). The draft is
    locked first, then its rows (the order a request takes)."""
    with transaction.atomic():
        list(MailDraft.objects.select_for_update().filter(pk=row.draft_id).values_list("pk"))
        newer = (
            MailOutbox.objects.select_for_update()
            .filter(draft_id=row.draft_id, status=Status.PENDING)
            .exclude(pk=row.pk)
            .first()
        )
        if newer is not None and not (row.op == Op.DRAFT_CREATE and newer.op == Op.DRAFT_UPDATE):
            MailOutbox.objects.filter(pk=row.pk).delete()
        else:
            if newer is not None:
                newer.delete()
            MailOutbox.objects.filter(pk=row.pk, status=Status.SENDING).update(
                status=Status.PENDING, updated_at=flush.now, **fields
            )
    flush._settled([row])


def _one(flush, row, draft):
    if row.op == Op.DRAFT_DELETE:
        gmail_id = row.payload.get("gmail_draft_id") or draft.gmail_draft_id
        if gmail_id:
            gmail_sync.ensure_claim(flush.connection)
            try:
                flush.session.delete_draft(gmail_id)
            except ProviderError as exc:
                if exc.status != 404:  # a 404 is done (§5)
                    raise
        flush._sent([row])
        # Only a discarded draft goes: a sent one keeps its row (plan gap 7).
        MailDraft.objects.filter(pk=draft.pk, status=DraftStatus.DISCARDED).delete()
        return
    try:
        raw = _mime(flush, row, draft)
    except attachments.Gone:
        _fail(flush, row, draft, Reason.NOT_FOUND, payload=PART_GONE)
        return
    gmail_sync.ensure_claim(flush.connection)
    if row.op == Op.DRAFT_CREATE or not draft.gmail_draft_id:
        answer = flush.session.create_draft(raw, draft.thread_id)
    else:
        try:
            answer = flush.session.update_draft(draft.gmail_draft_id, raw, draft.thread_id)
        except ProviderError as exc:
            if exc.status != 404:
                raise
            _recreate(flush, row, draft)
            return
    _saved(flush, row, draft, answer)


def _mime(flush, row, draft):
    files, related = sending.parts_of(draft)
    try:
        sending.ensure_cached([*files, *related], flush.connection)
    except attachments.Busy as exc:
        raise exc.__cause__ from exc  # the ProviderError: D2's classes decide
    except attachments.Unavailable as exc:
        # The fetch already paused the mailbox; nothing more is written.
        back(flush, row)
        raise gmail_sync.Lost from exc
    return sending.build(draft, files, related)


def _delete_later(draft, now):
    """The draft moved on while its create or update was out: delete the
    Gmail draft that call made (§5)."""
    payload = {"gmail_draft_id": draft.gmail_draft_id}
    pending = MailOutbox.objects.filter(draft_id=draft.pk, status=Status.PENDING).first()
    if pending is not None:
        MailOutbox.objects.filter(pk=pending.pk).update(
            op=Op.DRAFT_DELETE, payload=payload, next_attempt_at=now, updated_at=now
        )
        return
    MailOutbox.objects.create(
        connection_id=draft.connection_id,
        action_id=uuid.uuid4(),
        op=Op.DRAFT_DELETE,
        draft=draft,
        payload=payload,
        next_attempt_at=now,
    )


def _disconnected(flush):
    """The mailbox was disconnected while the call was out. Read under the
    draft's lock: a disconnect locks its drafts first, so it has committed or
    will settle after this transaction."""
    return MailboxConnection.objects.filter(
        pk=flush.connection.pk, status=MailboxConnection.Status.DISCONNECTED
    ).exists()


def _saved(flush, row, draft, answer):
    """2xx on a create or update: the ids stored, the Drafts row on Gmail's
    message id (history then finds it held), the state saved unless another
    row is live. A draft no longer open keeps only the Gmail draft's id (a
    sending one its message id too, on the draft alone): a sent or
    discarded one has it deleted; a sending one leaves it to the send's
    settle (a refused send reopens the draft with it). On a mailbox
    disconnected meanwhile the id is kept and the draft reads failed, as the
    disconnect's settle has it (plan gap 9)."""
    gmail_id = str(answer.get("id") or "")[:255]
    message = answer.get("message") or {}
    message_id = str(message.get("id") or "")[:255]
    thread_id = str(message.get("threadId") or "")[:255]
    with transaction.atomic():
        fresh = MailDraft.objects.select_for_update().filter(pk=draft.pk).first()
        if fresh is None:
            flush._sent([row])
            return
        fresh.gmail_draft_id = gmail_id or fresh.gmail_draft_id
        if _disconnected(flush):
            fresh.gmail_state = State.FAILED
            fresh.save(update_fields=["gmail_draft_id", "gmail_state"])
            flush._sent([row])  # the disconnect deleted it; this only settles
            return
        if fresh.status != DraftStatus.OPEN:
            # Ruling F3: a late answer never takes a sent copy's ids. A
            # sending draft learns its Gmail message (its row stays put), so
            # history never stores it as a second row (draft_sync).
            fields = ["gmail_draft_id"]
            if fresh.status == DraftStatus.SENDING and message_id:
                fresh.gmail_message_id = message_id
                fields.append("gmail_message_id")
            fresh.save(update_fields=fields)
            flush._sent([row])
            if fresh.status in (DraftStatus.SENT, DraftStatus.DISCARDED):
                _delete_later(fresh, flush.now)
            return
        if fresh.message_id and message_id:
            MailMessage.objects.filter(
                connection=flush.connection, provider_message_id=message_id
            ).exclude(pk=fresh.message_id).delete()
            MailMessage.objects.filter(pk=fresh.message_id).update(
                provider_message_id=message_id,
                thread_id=thread_id or F("thread_id"),
                refreshed_at=flush.now,
            )
        fresh.gmail_message_id = message_id
        fresh.thread_id = thread_id or fresh.thread_id
        if fresh.message_id is None and message_id:
            # It lost its Drafts row (final review 1): it takes one again.
            drafts.give_row(fresh, message_id, now=flush.now)
        others = (
            MailOutbox.objects.filter(draft_id=fresh.pk, status__in=MailOutbox.LIVE)
            .exclude(pk=row.pk)
            .exists()
        )
        fresh.gmail_state = State.SAVING if others else State.SAVED
        # Named fields only: updated_at is the claim's stamp while sending.
        fresh.save(update_fields=["gmail_draft_id", "gmail_message_id", "thread_id", "gmail_state"])
        flush._sent([row])


def _recreate(flush, row, draft):
    """Decision 9: Gmail lost the draft; the newest writing is saved again as
    a new one, with no notice. The Drafts row goes back on its placeholder
    id, so history's delete of the old message misses it (plan gap 8)."""
    with transaction.atomic():
        fresh = MailDraft.objects.select_for_update().filter(pk=draft.pk).first()
        if fresh is None or fresh.status != DraftStatus.OPEN or _disconnected(flush):
            flush._sent([row])
            return
        # §3's order: the draft, its message, then the outbox.
        if fresh.message_id:
            MailMessage.objects.filter(pk=fresh.message_id).update(
                provider_message_id=f"{PENDING_DRAFT_PREFIX}{fresh.pk}"
            )
        flush._sent([row])
        MailOutbox.objects.filter(draft_id=fresh.pk, status=Status.PENDING).delete()
        fresh.gmail_draft_id, fresh.gmail_message_id = "", ""
        fresh.gmail_state = State.SAVING
        fresh.save(update_fields=["gmail_draft_id", "gmail_message_id", "gmail_state"])
        MailOutbox.objects.create(
            connection_id=fresh.connection_id,
            action_id=row.action_id,
            op=Op.DRAFT_CREATE,
            draft=fresh,
            next_attempt_at=flush.now,
        )
        connection_id = fresh.connection_id
        transaction.on_commit(lambda: outbox.wake(connection_id))


def _fail(flush, row, draft, reason, *, payload=None):
    """Failed now, with no content revert (decision 10). A failed create also
    fails, uncounted, the label rows waiting on its placeholder (D2 decision
    8); a failed delete lets a discarded draft go anyway, leaving Gmail's
    copy. The notice waits for the end of the flush."""
    waiting = []
    with transaction.atomic():
        # Ruling F4: the draft before its outbox row (§3, the order a request takes).
        list(MailDraft.objects.select_for_update().filter(pk=draft.pk).values_list("pk"))
        fields = {
            "status": Status.FAILED,
            "reason": reason,
            "failed_at": flush.now,
            "updated_at": flush.now,
        }
        if payload:
            row.payload = {**row.payload, **payload}
            fields["payload"] = row.payload
        MailOutbox.objects.filter(pk=row.pk).update(**fields)
        if row.op == Op.DRAFT_DELETE:
            MailDraft.objects.filter(pk=draft.pk, status=DraftStatus.DISCARDED).delete()
        else:
            MailDraft.objects.filter(pk=draft.pk).update(gmail_state=State.FAILED)
            if row.op == Op.DRAFT_CREATE and draft.message_id:
                waiting = list(
                    MailOutbox.objects.filter(message_id=draft.message_id, status=Status.PENDING)
                )
    flush._settled([row])
    flush.failed.append((row, reason))
    if waiting:
        flush._fail(waiting, reason)


def _count(flush, row, draft, reason):
    from .outbox_flush import retry_at

    attempts = row.attempts + 1
    if attempts >= settings.MAIL_OUTBOX_MAX_ATTEMPTS:
        MailOutbox.objects.filter(pk=row.pk).update(attempts=attempts)
        _fail(flush, row, draft, reason)
        return
    back(flush, row, attempts=attempts, next_attempt_at=retry_at(attempts, flush.now))


def _failed_call(flush, row, draft, exc):
    """D2's outcome classes for a draft row, plus 413 (§5 "Outcomes")."""
    from .outbox_flush import classify

    logger.warning(
        "gmail draft call failed for connection %s: %s %s",
        flush.connection.pk,
        exc.status,
        exc.reason,
    )
    if exc.status == 413:
        _fail(flush, row, draft, Reason.TOO_LARGE)
        return
    kind = classify(exc)
    if kind == "not_found":
        _fail(flush, row, draft, Reason.NOT_FOUND)
    elif kind in ("refused", "label_gone"):
        _count(flush, row, draft, Reason.REFUSED)
    elif kind == "unavailable":
        _count(flush, row, draft, Reason.EXHAUSTED)
        raise exc
    else:  # a rate limit or a lost grant: not the row's fault
        back(flush, row)
        raise exc
