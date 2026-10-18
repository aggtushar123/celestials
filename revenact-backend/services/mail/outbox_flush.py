"""Sending the outbox to Gmail: step 1 of every Google tick (contract §1,
"The flush").

Under the tick's lease, after recovering the rows a crashed tick left
`sending`: every label change grouped by message into (add, remove) sets and
sent with messages.batchModify, at most MAIL_OUTBOX_BATCH_SIZE ids a call (a
batch Gmail refuses with 400 or 404 is retried one message at a time with
modify, so one bad id fails alone); then trash and untrash, one call each,
at most MAIL_OUTBOX_SINGLE_CALLS_PER_TICK single calls a tick. D3's draft
rows go after label creations and before label rows (services/mail/
draft_flush.py). A row whose label Gmail has not created yet, or on a draft
Gmail has not created yet, waits. Rows are `sending` during their call,
which runs outside any transaction; the claim is checked before every call.

What Gmail answers decides each row (decision 6): 2xx sent; a 404 on the
message fails it at once, as an unknown label does; a 5xx, no answer or
another refusal counts an attempt and waits MAIL_OUTBOX_RETRY_SECONDS
(a 5xx also stops the flush and backs the mailbox off); a rate limit or a
lost grant counts nothing, puts the rows back and stops, and the tick backs
the mailbox off or pauses it (gmail_sync._failed). No log line names a
message: the connection id, a status and a reason only.

Locks (plan gap 8, extended by ruling F2): a claim is an `UPDATE ... WHERE
status='pending'`, so it waits for a request's commit and never sends a
row the request is collapsing. Putting a row back (`_back`) runs in one
transaction that first locks the rows' messages `select_for_update`,
ordered by pk (the lock a request takes), and only then looks for a newer
pending row on each pair: a request cannot insert one between that look
and the update, which would break mail_outbox_one_pending_per_label.
Failing rows (`_fail`) likewise locks their messages, and those carrying a
label being unwound, before it marks a row.
"""

import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.db import transaction

from services.notifications.models import Notification
from services.notifications.realtime import notify

from . import draft_flush, gmail_sync, outbox, threads
from .models import PENDING_DRAFT_PREFIX, PENDING_LABEL_PREFIX, MailLabel, MailMessage, MailOutbox
from .providers.base import RATE_LIMIT_REASONS, ProviderError

logger = logging.getLogger(__name__)
Op = MailOutbox.Op
Reason = MailOutbox.Reason
Status = MailOutbox.Status
#: Gmail's own label ids: never "gone".
SYSTEM_KEYS = frozenset(
    {"INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT"}
)
#: Where a notice sends the owner (contract §5).
COMMUNICATIONS = "/communications?source=mailbox:google"


def classify(exc):
    """What a failed call means for its rows (decision 6)."""
    if gmail_sync.classify_failure(exc) != "backoff":
        return "revoked"  # a lost grant or insufficientPermissions: pause
    if exc.status == 429 or (exc.status == 403 and exc.reason in RATE_LIMIT_REASONS):
        return "rate_limited"
    if exc.status is None or exc.status >= 500:
        return "unavailable"
    if exc.status == 404:
        return "not_found"
    if exc.status == 400 and "Invalid label" in str(exc):
        return "label_gone"
    return "refused"


def retry_at(attempts, now):
    """When a row counted `attempts` times is due again."""
    waits = settings.MAIL_OUTBOX_RETRY_SECONDS
    return now + timedelta(seconds=waits[min(attempts, len(waits)) - 1])


def flush(connection, session, now):
    """Send this mailbox's due rows. Raises the ProviderError the tick must
    handle (a 5xx, a rate limit, a lost grant) or gmail_sync.Lost, after
    putting back every row it claimed and did not settle, and telling the
    owner about the ones that failed."""
    run = Flush(connection, session, now)
    try:
        run.recover()
        run.label_creates()
        draft_flush.run(run)  # D3 decision 7: drafts before label rows
        run.label_changes()
        run.trash_changes()
    finally:
        run.release()
        try:
            with transaction.atomic():
                run.notify()
        except Exception as exc:  # noqa: BLE001 a notice never hides the tick's own outcome
            logger.warning(
                "gmail outbox notice failed for connection %s: %s",
                connection.pk,
                type(exc).__name__,
            )


def revert(connection, rows):
    """Undo failed label changes here, in the caller's transaction (contract
    §1 "On failure"). Each label goes back to `previous`, then the folder and
    flags are re-derived. When a newer pending row stands on the same label,
    it takes over instead: it inherits `previous`, and goes when that is
    already its target (decision 4). The messages are locked first, ordered
    by pk, then their outbox rows (plan gap 8: the order requests and _back
    take)."""
    rows = [row for row in rows if row.message_id is not None]
    if not rows:
        return
    keys = {(row.message_id, row.label_key) for row in rows}
    message_ids = {message_id for message_id, _ in keys}
    messages = {
        message.pk: message
        for message in MailMessage.objects.select_for_update()
        .filter(pk__in=message_ids)
        .order_by("pk")
    }
    newer = {
        (other.message_id, other.label_key): other
        for other in MailOutbox.objects.select_for_update().filter(
            status=Status.PENDING, message_id__in=message_ids
        )
        if (other.message_id, other.label_key) in keys
    }
    dirty = {}
    for row in rows:
        present = bool(row.previous.get("present"))
        other = newer.get((row.message_id, row.label_key))
        if other is not None:
            if other.add == present:
                other.delete()
            else:
                MailOutbox.objects.filter(pk=other.pk).update(previous=row.previous)
            continue
        message = messages.get(row.message_id)
        if message is None:
            continue
        outbox.set_presence(message, row.label_key, present)
        dirty[message.pk] = message
    for message in dirty.values():
        outbox.rederive(connection, message)
    if dirty:
        MailMessage.objects.bulk_update(list(dirty.values()), outbox.LOCAL_FIELDS)


def notice(rows, reason):
    """The one notice for an action's rows that failed for `reason` (decision
    22): the sentence for one conversation, a count for more, and a link to
    the newest affected message still held. Never a subject or an address."""
    first = rows[0]
    if first.op in MailOutbox.DRAFT_OPS:
        link = f"{COMMUNICATIONS}&folder=drafts&draft={first.draft_id}"
        return outbox.draft_sentence(first, reason), link
    name = outbox.label_name(first)
    with_message = [row for row in rows if row.message_id is not None]
    conversations = len({threads.key_of(row.message) for row in with_message})
    if conversations <= 1:
        text = outbox.sentence(first.op, reason, name)
    else:
        text = (
            f"Couldn't {outbox.verb(first.op, name)} {conversations} conversations in Gmail: "
            f"{outbox.CLAUSES[reason]}."
        )
    newest = (
        MailMessage.objects.filter(pk__in=[row.message_id for row in with_message])
        .order_by("-sent_at", "-id")
        .values_list("pk", flat=True)
        .first()
    )
    return text, f"{COMMUNICATIONS}&message={newest}" if newest else COMMUNICATIONS


class Flush:
    """One flush of one mailbox's outbox."""

    def __init__(self, connection, session, now):
        self.connection, self.session, self.now = connection, session, now
        self.claimed = set()
        self.single_calls = 0
        #: (row, reason) failed by this flush, for the notices.
        self.failed = []

    # --- claiming and settling -----------------------------------------
    def _due(self):
        return MailOutbox.objects.filter(
            connection=self.connection, status=Status.PENDING, next_attempt_at__lte=self.now
        )

    def _claim(self, rows, limit=None):
        """Mark `rows` sending (oldest first) and return them, message and label
        joined. A row a request changed meanwhile is re-read; one it deleted
        or another flush took is skipped."""
        ids = list(rows.order_by("created_at", "pk").values_list("pk", flat=True)[:limit])
        if not ids:
            return []
        MailOutbox.objects.filter(pk__in=ids, status=Status.PENDING).update(
            status=Status.SENDING, updated_at=self.now
        )
        claimed = list(
            MailOutbox.objects.filter(pk__in=ids, status=Status.SENDING)
            .select_related("message", "label", "draft")
            .order_by("created_at", "pk")
        )
        self.claimed.update(row.pk for row in claimed)
        return claimed

    def _settled(self, rows):
        self.claimed.difference_update(row.pk for row in rows)

    def _newer(self, rows):
        """The pending row now on each (message, label) of `rows`, if any: an
        action made while they were sending (decision 4)."""
        keys = {(row.message_id, row.label_key) for row in rows if row.message_id is not None}
        if not keys:
            return {}
        found = MailOutbox.objects.filter(
            status=Status.PENDING, message_id__in={message_id for message_id, _ in keys}
        ).exclude(pk__in=[row.pk for row in rows])
        return {
            (row.message_id, row.label_key): row
            for row in found
            if (row.message_id, row.label_key) in keys
        }

    def _back(self, rows, **fields):
        """Pending again (with `fields`). A row whose pair has a newer pending
        row gives it its `previous` and goes (plan gap 7). Draft rows go
        to draft_flush.back (D3 plan gap 6)."""
        drafts = [row for row in rows if row.op in MailOutbox.DRAFT_OPS]
        for row in drafts:
            draft_flush.back(self, row, **fields)
        rows = [row for row in rows if row.op not in MailOutbox.DRAFT_OPS]
        if not rows:
            return
        with transaction.atomic():
            # Ruling F2: the requests' lock first (gap 8), so no pending row
            # lands on a pair between _newer and the update.
            message_ids = sorted({row.message_id for row in rows if row.message_id is not None})
            if message_ids:
                list(
                    MailMessage.objects.select_for_update()
                    .filter(pk__in=message_ids)
                    .order_by("pk")
                    .values_list("pk", flat=True)
                )
            newer = self._newer(rows)
            back = []
            for row in rows:
                other = newer.get((row.message_id, row.label_key))
                if other is None:
                    back.append(row.pk)
                    continue
                MailOutbox.objects.filter(pk=other.pk).update(previous=row.previous)
                row.delete()
            MailOutbox.objects.filter(pk__in=back).update(
                status=Status.PENDING, updated_at=self.now, **fields
            )
        self._settled(rows)

    def release(self):
        """Everything this flush claimed and did not settle: pending, uncounted."""
        self._back(list(MailOutbox.objects.filter(pk__in=self.claimed, status=Status.SENDING)))

    def recover(self):
        """Rows a crashed tick left sending past the lease: pending, uncounted."""
        stale = self.now - timedelta(seconds=settings.MAIL_LEASE_SECONDS)
        self._back(
            list(
                MailOutbox.objects.filter(
                    connection=self.connection, status=Status.SENDING, updated_at__lt=stale
                )
            )
        )

    def _sent(self, rows):
        MailOutbox.objects.filter(pk__in=[row.pk for row in rows]).update(
            status=Status.SENT, sent_at=self.now, updated_at=self.now
        )
        self._settled(rows)

    def _fail(self, rows, reason):
        """Failed now: marked and undone here in one transaction (a label
        creation unwinds its label); the notice waits for the end of the
        flush."""
        if not rows:
            return
        changes = [row for row in rows if row.op != Op.LABEL_CREATE]
        made = [row.label for row in rows if row.op == Op.LABEL_CREATE and row.label is not None]
        with transaction.atomic():
            # Messages first (plan gap 8), then the rows: the order a request
            # and a disconnect take.
            outbox.lock_messages(
                self.connection,
                sorted({row.message_id for row in changes if row.message_id is not None}),
                [label.key for label in made],
            )
            MailOutbox.objects.filter(pk__in=[row.pk for row in changes]).update(
                status=Status.FAILED, reason=reason, failed_at=self.now, updated_at=self.now
            )
            revert(self.connection, changes)
            for row in rows:
                if row.op == Op.LABEL_CREATE:
                    outbox.unwind_label(self.connection, row.label)
        self._settled(rows)
        self.failed.extend((row, reason) for row in rows)

    def notify(self):
        """One mail_action_failed per (action, reason) failed in this flush,
        unless an earlier flush already failed that action for that reason
        (plan gap 9). To the mailbox owner, from nobody."""
        groups = defaultdict(list)
        for row, reason in self.failed:
            groups[(row.action_id, reason)].append(row)
        for (action_id, reason), rows in groups.items():
            told = MailOutbox.objects.filter(
                action_id=action_id, reason=reason, status=Status.FAILED, failed_at__lt=self.now
            ).exists()
            if told:
                continue
            text, link = notice(rows, reason)
            notify(
                recipient=self.connection.user,
                actor=None,
                kind=Notification.Kind.MAIL_ACTION_FAILED,
                message=text,
                link=link,
                push_on_commit=True,
            )

    def _count(self, rows, reason):
        """One counted attempt each: failed at MAIL_OUTBOX_MAX_ATTEMPTS with
        `reason`, else pending after the wait for that attempt."""
        spent, waiting = [], defaultdict(list)
        for row in rows:
            attempts = row.attempts + 1
            if attempts >= settings.MAIL_OUTBOX_MAX_ATTEMPTS:
                row.attempts = attempts
                spent.append(row)
            else:
                waiting[attempts].append(row)
        MailOutbox.objects.filter(pk__in=[row.pk for row in spent]).update(
            attempts=settings.MAIL_OUTBOX_MAX_ATTEMPTS
        )
        self._fail(spent, reason)
        for attempts, group in waiting.items():
            self._back(group, attempts=attempts, next_attempt_at=retry_at(attempts, self.now))

    def _call_failed(self, rows, exc):
        """A Gmail call for `rows` failed: settle them by its class, and
        re-raise what the tick handles."""
        kind = classify(exc)
        logger.warning(
            "gmail outbox call failed for connection %s: %s %s",
            self.connection.pk,
            exc.status,
            exc.reason,
        )
        if kind == "not_found":
            self._fail(rows, Reason.NOT_FOUND)
        elif kind == "label_gone":
            self._fail(rows, Reason.LABEL_GONE)
        elif kind == "refused":
            self._count(rows, Reason.REFUSED)
        elif kind == "unavailable":
            self._count(rows, Reason.EXHAUSTED)
            raise exc
        else:  # a rate limit or a lost grant: not the rows' fault
            self._back(rows)
            raise exc

    # --- label creations ------------------------------------------------
    def label_creates(self):
        """labels.create for each label made here. A 409 adopts Gmail's label
        of that name; another refusal fails the row with name_refused, which
        unwinds the label (`_fail`)."""
        for row in self._claim(self._due().filter(op=Op.LABEL_CREATE)):
            name = outbox.label_name(row) or row.label.name
            gmail_sync.ensure_claim(self.connection)
            try:
                made = self.session.create_label(name)
            except ProviderError as exc:
                kind = classify(exc)
                if exc.status == 409:
                    made = self._named(name)
                elif kind in ("not_found", "label_gone", "refused"):
                    made = None
                else:
                    self._call_failed([row], exc)
                    continue
                if made is None:
                    self._fail([row], Reason.NAME_REFUSED)
                    continue
            gmail_id = str(made.get("id") or "").strip() if isinstance(made, dict) else ""
            if not gmail_id:  # a 200 without an id: nothing to key the label on
                self._fail([row], Reason.NAME_REFUSED)
                continue
            outbox.label_created(self.connection, row.label, gmail_id)
            self._sent([row])

    def _named(self, name):
        """Gmail's own label called `name`, any case (one labels.list)."""
        gmail_sync.ensure_claim(self.connection)
        wanted = name.lower()
        return next(
            (item for item in self.session.labels() if str(item.get("name", "")).lower() == wanted),
            None,
        )

    # --- label changes --------------------------------------------------
    def label_changes(self):
        rows = self._claim(
            self._due()
            .exclude(op=Op.LABEL_CREATE)
            .exclude(label_key="TRASH")
            .exclude(label_key__startswith=PENDING_LABEL_PREFIX)
            .exclude(op__in=MailOutbox.DRAFT_OPS)
            # A label row on a placeholder waits for its draft's create (D3 decision 7).
            .exclude(message__provider_message_id__startswith=PENDING_DRAFT_PREFIX)
        )
        if not rows:
            return
        wanted = {row.label_key for row in rows} - SYSTEM_KEYS
        known = set(
            MailLabel.objects.filter(connection=self.connection, gmail_id__in=wanted).values_list(
                "gmail_id", flat=True
            )
        )
        gone = [row for row in rows if row.label_key in wanted and row.label_key not in known]
        self._fail(gone, Reason.LABEL_GONE)
        gone_ids = {row.pk for row in gone}
        by_message = defaultdict(list)
        for row in rows:
            if row.pk not in gone_ids:
                by_message[row.message_id].append(row)
        groups = defaultdict(list)
        for members in by_message.values():
            add = tuple(sorted(row.label_key for row in members if row.add))
            remove = tuple(sorted(row.label_key for row in members if not row.add))
            groups[(add, remove)].append(members)
        size = settings.MAIL_OUTBOX_BATCH_SIZE
        for (add, remove), messages in groups.items():
            for start in range(0, len(messages), size):
                self._batch(list(add), list(remove), messages[start : start + size])

    def _batch(self, add, remove, messages):
        rows = [row for members in messages for row in members]
        gmail_sync.ensure_claim(self.connection)
        try:
            self.session.batch_modify(
                [members[0].message.provider_message_id for members in messages], add, remove
            )
        except ProviderError as exc:
            if exc.status not in (400, 404):
                self._call_failed(rows, exc)
                return
            for members in messages:
                self._single(add, remove, members)
            return
        self._sent(rows)

    def _single(self, add, remove, members):
        if self.single_calls >= settings.MAIL_OUTBOX_SINGLE_CALLS_PER_TICK:
            self._back(members)
            return
        self.single_calls += 1
        gmail_sync.ensure_claim(self.connection)
        try:
            self.session.modify(members[0].message.provider_message_id, add, remove)
        except ProviderError as exc:
            self._call_failed(members, exc)
            return
        self._sent(members)

    # --- trash and untrash ------------------------------------------------
    def trash_changes(self):
        room = settings.MAIL_OUTBOX_SINGLE_CALLS_PER_TICK - self.single_calls
        if room <= 0:
            return
        for row in self._claim(
            self._due()
            .filter(label_key="TRASH")
            .exclude(message__provider_message_id__startswith=PENDING_DRAFT_PREFIX),
            limit=room,
        ):
            self.single_calls += 1
            gmail_sync.ensure_claim(self.connection)
            call = self.session.trash if row.add else self.session.untrash
            try:
                call(row.message.provider_message_id)
            except ProviderError as exc:
                self._call_failed([row], exc)
                continue
            self._sent([row])
