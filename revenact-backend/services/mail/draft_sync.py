"""Gmail's drafts back into Revenact (D3 contract §5 "Incoming drafts",
decisions 8, 26, 27).

History names messages, not drafts, and every Gmail edit replaces a draft's
message, so drafts are mapped by drafts.list: on a tick whose history,
reconcile or import touched a draft (a DRAFT label before or after, or a
deleted id that was a draft's), on the first tick after the import, and
with every send-as refresh (plan gap 12). It runs after history, so the
rows it points at are stored. A draft with a live draft row is skipped:
Revenact's unsent edit wins, and the flush overwrites Gmail's (decision 8).
A `sending` draft is never settled here: its owner confirms or reopens it.
A sent or discarded one keeps its Gmail id (a draft_delete may be on its
way) and is never touched. Before a vanished draft is taken as discarded,
Gmail is asked about its last message (it may have been sent after history
was read): SENT settles it as sent, still there waits a tick, gone discards.
Every settle re-reads the draft under lock and acts only if it is as the
reconcile saw it.

A late flush answer on a draft that was sending stores the Gmail ids while
its Drafts row stays where it was (Task 10). Gmail's message for it is the
draft's own: it is never stored as a second row (`own_messages`), and an
open draft's row is moved onto it (`_repoint`).
"""

from django.db import transaction

from core import audit
from services.customers.models import ReplyDraft

from . import compose, drafts, gmail_store, sending
from .models import MailDraft, MailMessage, MailOutbox

Status = MailDraft.Status
Kind = MailDraft.Kind


def listed(session):
    """{Gmail draft id: its message id}, every page of drafts.list."""
    found, page = {}, ""
    while True:
        body = session.list_drafts(page)
        for item in body.get("drafts") or []:
            draft_id = str(item.get("id") or "")
            if draft_id:
                found[draft_id] = str((item.get("message") or {}).get("id") or "")
        page = body.get("nextPageToken", "")
        if not page:
            return found


def _has_draft(row):
    try:
        return row.draft is not None
    except MailDraft.DoesNotExist:
        return False


def _live_rows(draft_ids):
    return MailOutbox.objects.filter(
        draft_id__in=draft_ids, op__in=MailOutbox.DRAFT_OPS, status__in=MailOutbox.LIVE
    )


def own_messages(connection, ids, now):
    """Of `ids` (message ids not held), those that are a live draft's Gmail
    message while its Drafts row holds another id, or while it has no row: a
    store skips them. An open draft's row takes the id now (one with no row
    gets one); a sending one's is left, as it may become the sent copy."""
    if not ids:
        return set()
    found = list(
        MailDraft.objects.filter(
            connection=connection, status__in=MailDraft.LIVE, gmail_message_id__in=ids
        )
    )
    for draft in found:
        if draft.status == Status.OPEN:
            _repoint(draft, now)
    return {draft.gmail_message_id for draft in found}


def reconcile(connection, session, now):
    gmail = listed(session)
    known = {
        draft.gmail_draft_id: draft
        for draft in MailDraft.objects.filter(connection=connection)
        .exclude(gmail_draft_id="")
        .select_related("message")
    }
    live = set(
        MailOutbox.objects.filter(
            connection=connection, op__in=MailOutbox.DRAFT_OPS, status__in=MailOutbox.LIVE
        ).values_list("draft_id", flat=True)
    )
    held = {
        row.provider_message_id: row
        for row in MailMessage.objects.filter(
            connection=connection, provider_message_id__in=[m for m in gmail.values() if m]
        ).select_related("draft")
    }
    for gmail_id, message_id in gmail.items():
        draft, row = known.get(gmail_id), held.get(message_id)
        if draft is None:
            if row is not None and not _has_draft(row):
                _adopt(connection, gmail_id, row)
        elif draft.status != Status.OPEN or draft.pk in live or not message_id:
            continue  # sent, discarded or sending; or a Revenact edit on its way
        elif draft.gmail_message_id == message_id:
            if draft.message is None or draft.message.provider_message_id != message_id:
                _repoint(draft, now)
        elif row is not None and (not _has_draft(row) or row.draft.pk == draft.pk):
            _take(draft, row, now)  # a row another draft holds is left alone
    for gmail_id, draft in known.items():
        if gmail_id not in gmail and draft.status == Status.OPEN and draft.pk not in live:
            _vanished(connection, session, draft, now)


def _adopt(connection, gmail_id, row):
    """A Gmail draft Revenact does not know: an open draft on its stored row,
    a reply when its References name a held message in its thread (plan gap
    25), filed on the suggestion."""
    source = None
    references = (row.references or "").split()
    if references and row.thread_id:
        source = (
            MailMessage.objects.filter(
                connection=connection, thread_id=row.thread_id, rfc_message_id__in=references
            )
            .exclude(pk=row.pk)
            .order_by("-sent_at", "-pk")
            .first()
        )
    [record] = compose.visible(connection.user, compose.suggest(connection, [*row.to, *row.cc]))
    customer_id, account_id = drafts.record_ids(record)
    MailDraft.objects.create(
        connection=connection,
        owner_id=connection.user_id,
        organisation_id=connection.organisation_id,
        message=row,
        kind=Kind.REPLY if source is not None else Kind.NEW,
        source=source,
        thread_id=row.thread_id,
        in_reply_to=source.rfc_message_id if source is not None else "",
        references=source.references if source is not None else "",
        to=row.to,
        cc=row.cc,
        bcc=row.bcc,
        subject=row.subject,
        html=row.html_body,
        text=row.body,
        customer_id=customer_id,
        account_id=account_id,
        gmail_draft_id=gmail_id,
        gmail_message_id=row.provider_message_id,
        gmail_state=MailDraft.GmailState.SAVED,
    )


def _lock(draft):
    """The linked ReplyDraft, then the draft (§3's order); the draft while it
    is open with no live row and still as `draft` (the snapshot the
    reconcile decided on) had it: its Gmail ids and its linked ReplyDraft.
    Else None: a request changed it meanwhile (a send's DRAFT_GONE reopen
    clears its Gmail ids), and the next reconcile decides again."""
    if draft.reply_draft_id is not None:
        list(ReplyDraft.objects.select_for_update().filter(pk=draft.reply_draft_id).values("pk"))
    fresh = (
        MailDraft.objects.select_for_update(of=("self",))
        .select_related("reply_draft")
        .filter(
            pk=draft.pk,
            status=Status.OPEN,
            gmail_draft_id=draft.gmail_draft_id,
            gmail_message_id=draft.gmail_message_id,
            reply_draft_id=draft.reply_draft_id,
        )
        .first()
    )
    if fresh is None or _live_rows([fresh.pk]).exists():
        return None
    return fresh


def _repoint(draft, now):
    """The open draft's Drafts row takes its Gmail message id (as the
    flush's 2xx does); a row stored for that id meanwhile goes. The content
    is the draft's own: no new revision. A draft with no row takes the one
    held for that id, or a new one (final review 1)."""
    with transaction.atomic():
        fresh = _lock(draft)
        if fresh is None or not fresh.gmail_message_id:
            return
        if fresh.message_id is None:
            drafts.give_row(fresh, fresh.gmail_message_id, now=now)
            return
        MailMessage.objects.filter(
            connection_id=fresh.connection_id, provider_message_id=fresh.gmail_message_id
        ).exclude(pk=fresh.message_id).delete()
        MailMessage.objects.filter(pk=fresh.message_id).update(
            provider_message_id=fresh.gmail_message_id, refreshed_at=now
        )


def _take(draft, row, now):
    """Edited in Gmail, no Revenact edit on its way: Gmail's version is the
    draft's, at a new revision, mirrored to a linked ReplyDraft. Its
    forwarded files are Gmail's own parts now (plan gap 13)."""
    with transaction.atomic():
        fresh = _lock(draft)
        if fresh is None:
            return
        old = fresh.message_id
        fresh.message = row
        fresh.gmail_message_id = row.provider_message_id
        fresh.to, fresh.cc, fresh.bcc = row.to, row.cc, row.bcc
        fresh.subject = row.subject[:255]
        fresh.html, fresh.text = row.html_body, row.body
        fresh.references = row.references
        fresh.forwarded = []
        fresh.revision += 1
        fresh.gmail_state = MailDraft.GmailState.SAVED
        fresh.save(
            update_fields=[
                "message",
                "gmail_message_id",
                "to",
                "cc",
                "bcc",
                "subject",
                "html",
                "text",
                "references",
                "forwarded",
                "revision",
                "gmail_state",
                "updated_at",
            ]
        )
        if old and old != row.pk:
            MailMessage.objects.filter(pk=old).delete()
        drafts.mirror(fresh, now=now)


def _sent_row(connection, draft):
    """Decision 27: its last known message, now SENT; else a SENT message of
    the owner's stored in its thread since its last change, that no other
    draft holds."""
    if draft.gmail_message_id:
        found = MailMessage.objects.filter(
            connection=connection,
            provider_message_id=draft.gmail_message_id,
            label_ids__contains=["SENT"],
        ).first()
        if found is not None:
            return found
    if not draft.thread_id:
        return None
    return (
        MailMessage.objects.filter(
            connection=connection,
            thread_id=draft.thread_id,
            label_ids__contains=["SENT"],
            from_address__iexact=connection.address,
            synced_at__gte=draft.updated_at,
            draft__isnull=True,
        )
        .exclude(label_ids__contains=["DRAFT"])
        .order_by("-sent_at", "-pk")
        .first()
    )


def _confirmed(connection, session, draft, now):
    """No SENT row held: Gmail's own word on the draft's last message (it
    may have been sent there after history was read). Returns ("sent", the
    row, relabelled or stored), ("wait", None) while it is still there
    unsent, or ("gone", None). A row stored here is filed as any store files
    it; the Email that made is classified with the settle's."""
    if not draft.gmail_message_id:
        return "gone", None
    minimal = session.get_message(draft.gmail_message_id, "minimal")
    if minimal is None:
        return "gone", None
    labels = minimal.get("labelIds") or []
    if "SENT" not in labels:
        return "wait", None
    row = MailMessage.objects.filter(
        connection=connection, provider_message_id=draft.gmail_message_id
    ).first()
    if row is not None:
        gmail_store.relabel(
            connection, row, labels, now, held=gmail_store.held_keys([row.pk]).get(row.pk, set())
        )
        return "sent", row
    full = session.get_message(draft.gmail_message_id)
    if full is None:
        return "gone", None
    row, filed = gmail_store.store_gmail(connection, full, now=now)
    if row is None:
        return "gone", None
    row.filed_by_store = filed
    return "sent", row


def _vanished(connection, session, draft, now):
    sent = _sent_row(connection, draft)
    if sent is None:
        answer, sent = _confirmed(connection, session, draft, now)
        if answer == "wait":
            return
    filed = None
    with transaction.atomic():
        fresh = _lock(draft)
        if fresh is None:
            return
        reply = fresh.reply_draft
        if sent is not None:
            email, created = sending.file_sent(
                connection, sent, customer_id=fresh.customer_id, account_id=fresh.account_id
            )
            filed = email if created else getattr(sent, "filed_by_store", None)
            old = fresh.message_id
            MailDraft.objects.filter(pk=fresh.pk).update(
                status=Status.SENT, sent_at=now, message=sent, sent_email=email, updated_at=now
            )
            if old and old != sent.pk:
                MailMessage.objects.filter(pk=old).delete()
            if reply is not None:
                ReplyDraft.objects.filter(pk=reply.pk).update(
                    status=ReplyDraft.Status.SENT,
                    sent_at=now,
                    sent_by_id=connection.user_id,
                    sent_email=email,
                    updated_at=now,
                )
                audit.record(  # SOC2:LOG-01 sent from Gmail itself
                    "reply_draft.sent",
                    organisation=connection.organisation,
                    target=reply,
                    metadata={"email": email.pk if email is not None else None, "in": "gmail"},
                )
        else:
            message_id = fresh.message_id
            if reply is not None:
                audit.record(  # SOC2:LOG-01 discarded in Gmail itself
                    "reply_draft.discarded",
                    organisation=connection.organisation,
                    target=reply,
                    metadata={"in": "gmail"},
                )
                reply.delete()  # its MailDraft goes with it (CASCADE)
            else:
                fresh.delete()
            if message_id:
                MailMessage.objects.filter(pk=message_id).delete()
    if filed is not None:
        from services.customers.classification import classify_records

        classify_records([filed], organisation=connection.organisation, user=connection.user)
