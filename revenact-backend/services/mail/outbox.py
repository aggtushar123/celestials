"""Actions back to Gmail, the writing half (contract §1, "Enqueueing").

An action changes the person's own row at once, so the screen never waits
for Gmail, and leaves one MailOutbox row per (message, label) change for
the tick to send (services/mail/outbox_flush.py). Every op in the spec's
table is a set of Gmail label changes (decision 1). Writing happens in the
request's transaction, with the messages and their pending rows locked, so
a flush never claims a row this request is collapsing.

- No pending row for the pair: a change already true locally queues nothing;
  otherwise a row records the target and the local presence before it.
- A pending row: a change back to its `previous` deletes it (read then
  unread sends nothing); any other takes the row over, uncounted again.
- A `sending` row is never touched: a new action queues beside it, and the
  flush hands over (decision 4).

Muted is Revenact's own (services/mail/actions.py): no row, ever.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from . import gmail_store
from .models import PENDING_LABEL_PREFIX, MailboxConnection, MailLabel, MailMessage, MailOutbox

Op = MailOutbox.Op
Status = MailOutbox.Status
State = MailMessage.State

#: Each op's label changes: (Gmail label id, present afterwards). Label ops
#: take theirs from the label (`changes_for`); label_create has none.
LABEL_CHANGES = {
    Op.READ: (("UNREAD", False),),
    Op.UNREAD: (("UNREAD", True),),
    Op.STAR: (("STARRED", True),),
    Op.UNSTAR: (("STARRED", False),),
    Op.ARCHIVE: (("INBOX", False),),
    Op.INBOX: (("INBOX", True),),
    Op.TRASH: (("TRASH", True),),
    Op.UNTRASH: (("TRASH", False),),
    Op.SPAM: (("SPAM", True), ("INBOX", False)),
    Op.NOT_SPAM: (("SPAM", False), ("INBOX", True)),
}
#: What an action changes on a Gmail row: the labels, and what they mean.
LOCAL_FIELDS = ["label_ids", "folder", "is_read", "is_starred", "is_important", "state"]


@dataclass(frozen=True)
class Change:
    op: str
    label_key: str
    add: bool
    #: A user label's name, kept on the row for the notice (label ops only).
    label_name: str = ""


def changes_for(op, label=None):
    """The label changes one op makes on one message."""
    if op in (Op.LABEL_ADD, Op.LABEL_REMOVE):
        return [Change(op, label.key, op == Op.LABEL_ADD, label.name)]
    return [Change(op, key, add) for key, add in LABEL_CHANGES[op]]


def set_presence(message, key, present):
    labels = [label for label in message.label_ids or [] if label != key]
    if present:
        labels.append(key)
    message.label_ids = labels


def _state(current, archived, ops):
    if current == State.MUTED:
        if Op.ARCHIVE in ops:
            return State.DONE
        if Op.INBOX in ops:
            return State.OPEN
        return State.MUTED
    return State.DONE if archived else State.OPEN


def rederive(connection, message, ops=frozenset()):
    """The folder, flags and state the labels now mean (contract §1 step 4).
    Muted stays muted, except that archive makes it done and inbox open."""
    derived = gmail_store.derive(
        message.label_ids, from_address=message.from_address, own_address=connection.address
    )
    archived = derived.pop("archived")
    for field, value in derived.items():
        setattr(message, field, value)
    message.state = _state(message.state, archived, ops)


def _snapshot(message):
    return (tuple(message.label_ids or []),) + tuple(
        getattr(message, field) for field in LOCAL_FIELDS[1:]
    )


def apply(connection, pairs, *, action_id=None, now=None):
    """Make each (message, Change) true on the person's row now, and queue it
    for Gmail. One read of the pending rows, then at most one delete, one
    update, one insert and one message update, whatever the number of
    messages (contract §8). Returns the pks whose local values changed."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("outbox.apply runs inside the request's transaction")
    now = now or timezone.now()
    action_id = action_id or uuid.uuid4()
    pairs = list(pairs)
    messages = {message.pk: message for message, _ in pairs}
    before = {pk: _snapshot(message) for pk, message in messages.items()}
    pending = {
        (row.message_id, row.label_key): row
        for row in MailOutbox.objects.select_for_update().filter(
            message_id__in=list(messages), status=Status.PENDING
        )
    }
    created, updated, collapsed = {}, {}, []
    ops = defaultdict(set)
    for message, change in pairs:
        ops[message.pk].add(change.op)
        key = (message.pk, change.label_key)
        present = change.label_key in (message.label_ids or [])
        row = pending.get(key)
        if row is None:
            if present == change.add:
                continue
            row = MailOutbox(
                connection=connection,
                action_id=action_id,
                op=change.op,
                message=message,
                label_key=change.label_key,
                add=change.add,
                previous={"present": present},
                payload={"label": change.label_name} if change.label_name else {},
                next_attempt_at=now,
            )
            pending[key] = created[key] = row
        elif change.add == row.previous.get("present"):
            # Back to what Gmail had: nothing to send (decision 2).
            del pending[key]
            if created.pop(key, None) is None:
                collapsed.append(row.pk)
                updated.pop(row.pk, None)
        else:
            row.add, row.op, row.action_id = change.add, change.op, action_id
            row.attempts, row.next_attempt_at, row.updated_at = 0, now, now
            if change.label_name:
                row.payload = {"label": change.label_name}
            if row.pk is not None:
                updated[row.pk] = row
        set_presence(message, change.label_key, change.add)
    dirty = []
    for pk, message in messages.items():
        rederive(connection, message, ops[pk])
        if _snapshot(message) != before[pk]:
            dirty.append(message)
    if collapsed:
        MailOutbox.objects.filter(pk__in=collapsed, status=Status.PENDING).delete()
    if updated:
        MailOutbox.objects.bulk_update(
            list(updated.values()),
            ["add", "op", "action_id", "attempts", "next_attempt_at", "payload", "updated_at"],
        )
    if created:
        MailOutbox.objects.bulk_create(list(created.values()))
    if dirty:
        MailMessage.objects.bulk_update(dirty, LOCAL_FIELDS)
    if created or updated:
        connection_id = connection.pk
        transaction.on_commit(lambda: wake(connection_id))
    return {message.pk for message in dirty}


def wake(connection_id, now=None):
    """Due within one tick (decision 24): wake_at = LEAST(COALESCE(wake_at,
    now), now). An earlier wake is kept."""
    now = now or timezone.now()
    MailboxConnection.objects.filter(pk=connection_id).filter(
        Q(wake_at__isnull=True) | Q(wake_at__gt=now)
    ).update(wake_at=now)


Reason = MailOutbox.Reason

#: The notice's verb for each op (contract §5). Label ops name their label.
VERBS = {
    Op.READ: "mark as read",
    Op.UNREAD: "mark as unread",
    Op.STAR: "star",
    Op.UNSTAR: "unstar",
    Op.ARCHIVE: "archive",
    Op.INBOX: "move to the Inbox",
    Op.TRASH: "delete",
    Op.UNTRASH: "restore",
    Op.SPAM: "report spam",
    Op.NOT_SPAM: "mark as not spam",
    Op.DRAFT_CREATE: "save the draft",
    Op.DRAFT_UPDATE: "save the draft",
    Op.DRAFT_DELETE: "delete the draft",
}
#: The notice's clause for each failure reason.
CLAUSES = {
    Reason.NOT_FOUND: "the message no longer exists",
    Reason.LABEL_GONE: "the label no longer exists",
    Reason.REFUSED: "Gmail refused the change",
    Reason.EXHAUSTED: "Gmail didn't answer after several tries",
    Reason.NAME_REFUSED: "Gmail refused the name",
    Reason.TOO_LARGE: "it is over Gmail's size limit",
}


def verb(op, name=""):
    if op == Op.LABEL_ADD:
        return f'label "{name}"'
    if op == Op.LABEL_REMOVE:
        return f'remove the label "{name}"'
    if op == Op.LABEL_CREATE:
        return f'create the label "{name}"'
    return VERBS[op]


def label_name(row):
    """The owner's own label name a row carries (plan gap 6); "" otherwise."""
    return row.payload.get("label") or row.payload.get("name") or ""


def sentence(op, reason, name=""):
    """ "Couldn't <verb> in Gmail: <clause>.": no subject, no address."""
    return f"Couldn't {verb(op, name)} in Gmail: {CLAUSES[reason]}."


#: D3 §5: a part Gmail no longer has.
PART_GONE = "Couldn't save this draft to Gmail: an attachment is no longer in Gmail."


def draft_sentence(row, reason):
    """A draft row's notice and sync_issue: "Couldn't save the draft in
    Gmail: ...", or the part-gone sentence (contract §5)."""
    if (row.payload or {}).get("part") == "gone":
        return PART_GONE
    return sentence(row.op, reason)


def create_label(connection, name, *, now=None):
    """A label made here (decision 20): local at once, with no Gmail id, and a
    label_create row for the tick. In the caller's transaction."""
    now = now or timezone.now()
    label = MailLabel.objects.create(
        connection=connection, gmail_id="", name=name, type=MailLabel.Type.USER
    )
    MailOutbox.objects.create(
        connection=connection,
        action_id=uuid.uuid4(),
        op=Op.LABEL_CREATE,
        label=label,
        payload={"name": name},
        next_attempt_at=now,
    )
    connection_id = connection.pk
    transaction.on_commit(lambda: wake(connection_id))
    return label


def lock_messages(connection, message_ids=(), keys=()):
    """Lock, in pk order, the messages `message_ids` names (a list or a
    `values("message_id")` subquery) and, for each label key in `keys`, every
    message of this mailbox carrying it or named by one of its outbox rows.
    The first lock every writer takes (plan gap 8): messages, then the
    mailbox row, then outbox rows. Returns the locked pks."""
    where = Q(pk__in=message_ids)
    keys = list(keys)
    if keys:
        where |= Q(
            pk__in=MailOutbox.objects.filter(connection=connection, label_key__in=keys).values(
                "message_id"
            )
        )
        for key in keys:
            # One containment per key: the GIN index's @> (jsonb has no overlap).
            where |= Q(connection=connection, label_ids__contains=[key])
    return list(
        MailMessage.objects.select_for_update()
        .filter(where)
        .order_by("pk")
        .values_list("pk", flat=True)
    )


def label_created(connection, label, gmail_id):
    """Gmail made (or already had) the label: `pending:<pk>` becomes its id on
    every message and every queued row, in one transaction (decision 21).
    When the mirror already holds a label with that id, ours merges into it
    (plan gap 12). Returns the label that stays."""
    key = f"{PENDING_LABEL_PREFIX}{label.pk}"
    with transaction.atomic():
        messages = list(
            MailMessage.objects.select_for_update().filter(
                connection=connection, label_ids__contains=[key]
            )
        )
        for message in messages:
            message.label_ids = list(
                dict.fromkeys(gmail_id if item == key else item for item in message.label_ids)
            )
        MailMessage.objects.bulk_update(messages, ["label_ids"])
        # A message already queued for the real id keeps that row.
        taken = MailOutbox.objects.filter(
            connection=connection, label_key=gmail_id, status=Status.PENDING
        ).values("message_id")
        MailOutbox.objects.filter(
            connection=connection, label_key=key, status=Status.PENDING, message_id__in=taken
        ).delete()
        MailOutbox.objects.filter(connection=connection, label_key=key).update(label_key=gmail_id)
        mirrored = (
            MailLabel.objects.filter(connection=connection, gmail_id=gmail_id)
            .exclude(pk=label.pk)
            .first()
        )
        if mirrored is not None:
            label.delete()
            return mirrored
        # A queryset update: a disconnect may have deleted the label meanwhile.
        MailLabel.objects.filter(pk=label.pk).update(gmail_id=gmail_id)
        label.gmail_id = gmail_id
        return label


def unwind_label(connection, label):
    """A label Gmail will never make (decision 21): off every message, its
    queued rows deleted (they never reached Gmail), and the label gone (its
    label_create row with it). In the caller's transaction, messages locked
    before any outbox row (plan gap 8)."""
    key = f"{PENDING_LABEL_PREFIX}{label.pk}"
    lock_messages(connection, keys=[key])
    MailOutbox.objects.filter(connection=connection, label_key=key).delete()
    messages = list(
        MailMessage.objects.select_for_update().filter(
            connection=connection, label_ids__contains=[key]
        )
    )
    for message in messages:
        set_presence(message, key, False)
    MailMessage.objects.bulk_update(messages, ["label_ids"])
    label.delete()


def sync_issues(message_ids, *, now=None):
    """Each message's `sync_issue` (decision 23): the newest failed row on it
    within MAIL_OUTBOX_ISSUE_DAYS, unless a row of another action was made on
    it since. One query; {} without ids."""
    ids = list(message_ids)
    if not ids:
        return {}
    now = now or timezone.now()
    cutoff = now - timedelta(days=settings.MAIL_OUTBOX_ISSUE_DAYS)
    rows = (
        MailOutbox.objects.filter(message_id__in=ids)
        .exclude(status=Status.FAILED, failed_at__lt=cutoff)
        .only(
            "message_id",
            "action_id",
            "op",
            "status",
            "reason",
            "payload",
            "created_at",
            "failed_at",
        )
    )
    by_message = defaultdict(list)
    for row in rows:
        by_message[row.message_id].append(row)
    issues = {}
    for message_id, group in by_message.items():
        failed = [row for row in group if row.status == Status.FAILED]
        if not failed:
            continue
        newest = max(failed, key=lambda row: (row.failed_at, row.pk))
        # plan gap 23: only a later row of another action clears it; rows of one
        # action are bulk-inserted with distinct created_at, so siblings must not.
        later = any(
            row.created_at > newest.created_at and row.action_id != newest.action_id
            for row in group
        )
        if not later:
            issues[message_id] = {
                "text": sentence(newest.op, newest.reason, label_name(newest)),
                "at": newest.failed_at,
            }
    return issues
