"""What the person does to their own mail (contract §3, §4).

Every route that changes mail runs the same checks, in order, and answers
the first that fails: the messages are the caller's (404), the body is
valid (400), a Gmail-only field or op on Outlook or IMAP (400 GMAIL_ONLY),
then for Google, when the request writes to Gmail: disconnected (409
NO_MAILBOX), paused (409 MAILBOX_PAUSED), read-only (409 TWO_WAY_OFF).
Mute and unmute are Revenact's own and always pass. A live draft's row is never
acted on here (D3 decision 13): thread expansion leaves it out, and naming it
is 409 IS_DRAFT. Owner-only throughout.
"""

import math

from django.conf import settings
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response

from . import gates, gmail_store, outbox
from .models import MailboxConnection, MailDraft, MailLabel, MailMessage, MailOutbox
from .threads import key_of

Op = MailOutbox.Op
State = MailMessage.State
MUTE, UNMUTE = "mute", "unmute"
#: Never reach Gmail; allowed paused, read-only or disconnected.
LOCAL_OPS = frozenset({MUTE, UNMUTE})
#: Only a Gmail mailbox has these.
GMAIL_ONLY_OPS = frozenset(
    {
        Op.TRASH,
        Op.UNTRASH,
        Op.SPAM,
        Op.NOT_SPAM,
        Op.LABEL_ADD,
        Op.LABEL_REMOVE,
        Op.LABEL_CREATE,
    }
)

NO_MAILBOX = "This message's mailbox is no longer connected."
TWO_WAY_OFF = "Reconnect Google to turn on two-way: changes here can't reach Gmail yet."
GMAIL_ONLY = "Only Gmail mailboxes have this."
CHOOSE_LABEL = "Choose one of your labels."
IS_DRAFT = "This message is a draft."


def error(code, detail, http_status, **extra):
    return Response({"code": code, "detail": detail, **extra}, status=http_status)


def gmail_busy(seconds):
    """503 GMAIL_BUSY with Retry-After (D2 §6, D3 §4 and §6)."""
    answer = error(
        "GMAIL_BUSY", "Gmail is busy. Try again in a minute.", status.HTTP_503_SERVICE_UNAVAILABLE
    )
    answer["Retry-After"] = str(max(math.ceil(seconds), 1))
    return answer


def refusal(connection, steps):
    """Checks 3 to 6 of contract §3 for `steps` ([(op, label)]) on this
    mailbox, or None when the action may go ahead."""
    ops = {op for op, _ in steps}
    if not connection.is_google:
        if ops & GMAIL_ONLY_OPS:
            return error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
        return None
    if ops <= LOCAL_OPS:
        return None
    if connection.status == MailboxConnection.Status.DISCONNECTED:
        return error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    paused = gates.paused_response(connection)
    if paused is not None:
        return paused
    if not connection.two_way:
        return error("TWO_WAY_OFF", TWO_WAY_OFF, status.HTTP_409_CONFLICT, needs_reconnect=True)
    return None


def too_many():
    limit = settings.MAIL_ACTION_MAX_MESSAGES
    return error(
        "TOO_MANY",
        f"Select fewer conversations: at most {limit:,} messages at a time.",
        status.HTTP_400_BAD_REQUEST,
    )


def _once(value):
    if len(set(value)) != len(value):
        raise serializers.ValidationError("Name each label once.")
    return value


class ChangeSerializer(serializers.Serializer):
    """A PATCH on a message or a thread (contract §3): partial, at least one
    field, at most one of state, trashed and spam."""

    is_read = serializers.BooleanField(required=False)
    is_starred = serializers.BooleanField(required=False)
    state = serializers.ChoiceField(choices=MailMessage.State.choices, required=False)
    trashed = serializers.BooleanField(required=False)
    spam = serializers.BooleanField(required=False)
    add_labels = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=20
    )
    remove_labels = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=20
    )

    def validate_add_labels(self, value):
        return _once(value)

    def validate_remove_labels(self, value):
        return _once(value)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Change at least one thing.")
        if sum(field in attrs for field in ("state", "trashed", "spam")) > 1:
            raise serializers.ValidationError("Change one of state, trashed or spam at a time.")
        if set(attrs.get("add_labels", [])) & set(attrs.get("remove_labels", [])):
            raise serializers.ValidationError("A label can't be added and removed at once.")
        return attrs


STATE_OPS = {State.OPEN: Op.INBOX, State.DONE: Op.ARCHIVE, State.MUTED: MUTE}


def steps_from_change(data, labels):
    """The ops a PATCH body means. A label id missing from `labels` (Outlook
    and IMAP resolve none) stays (op, None): check 3 refuses it."""
    steps = []
    if "is_read" in data:
        steps.append((Op.READ if data["is_read"] else Op.UNREAD, None))
    if "is_starred" in data:
        steps.append((Op.STAR if data["is_starred"] else Op.UNSTAR, None))
    if "state" in data:
        steps.append((STATE_OPS[data["state"]], None))
    if "trashed" in data:
        steps.append((Op.TRASH if data["trashed"] else Op.UNTRASH, None))
    if "spam" in data:
        steps.append((Op.SPAM if data["spam"] else Op.NOT_SPAM, None))
    steps += [(Op.LABEL_ADD, labels.get(pk)) for pk in data.get("add_labels", [])]
    steps += [(Op.LABEL_REMOVE, labels.get(pk)) for pk in data.get("remove_labels", [])]
    return steps


def resolve_labels(connection, ids):
    """{id: MailLabel} when every id is a user label of this mailbox; None
    otherwise."""
    wanted = set(ids)
    if not wanted:
        return {}
    # SOC2:AUTH-02 the caller's own user labels only
    found = {
        label.pk: label
        for label in MailLabel.objects.filter(
            connection=connection, type=MailLabel.Type.USER, pk__in=wanted
        )
    }
    return found if set(found) == wanted else None


def lockable(user):
    """The caller's own messages, locked for an action (check 1), each with
    `is_draft` (a live draft's row, D3 decision 13). A manager, view-all
    holder or admin finds none of someone else's: 404."""
    live = MailDraft.objects.filter(message=OuterRef("pk"), status__in=MailDraft.LIVE)
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    return (
        MailMessage.objects.filter(owner=user)
        .annotate(is_draft=Exists(live))
        .select_related("connection__user")
        .select_for_update(of=("self",))
        .order_by("pk")
    )


def drafts_refused(messages):
    """409 IS_DRAFT when any of `messages` is a live draft's row (D3 decision
    13: drafts change through mail/drafts/, never these actions)."""
    if any(getattr(message, "is_draft", False) for message in messages):
        return error("IS_DRAFT", IS_DRAFT, status.HTTP_409_CONFLICT)
    return None


def without_drafts(messages):
    """Thread expansion leaves a live draft's row out (D3 decision 13)."""
    return [message for message in messages if not getattr(message, "is_draft", False)]


def lock_connection(connection):
    """The mailbox row, freshly read and locked, once the request holds its
    messages (messages, then connection: the order a disconnect takes). The
    refusal checks run against this row, never the joined copy, so a
    disconnect that committed first refuses the request and one that waits
    deletes the rows it queues."""
    return MailboxConnection.objects.select_for_update(no_key=True).get(pk=connection.pk)


def newest_per_thread(messages):
    """Starring a conversation stars its newest message, as Gmail does
    (decision 10)."""
    newest = {}
    for message in messages:
        key = key_of(message)
        if key not in newest or (message.sent_at, message.pk) > (
            newest[key].sent_at,
            newest[key].pk,
        ):
            newest[key] = message
    return list(newest.values())


#: Outlook and IMAP: what each op sets here (D1's local rule).
LOCAL_VALUES = {
    Op.READ: ("is_read", True),
    Op.UNREAD: ("is_read", False),
    Op.STAR: ("is_starred", True),
    Op.UNSTAR: ("is_starred", False),
    Op.ARCHIVE: ("state", State.DONE),
    Op.INBOX: ("state", State.OPEN),
    MUTE: ("state", State.MUTED),
    UNMUTE: ("state", State.OPEN),
}


def _local(messages, steps, *, star_newest, now):
    """Outlook and IMAP (decision 14): here only, stamped locally_changed_at."""
    changed = {}
    for op, _ in steps:
        field, value = LOCAL_VALUES[op]
        targets = newest_per_thread(messages) if op == Op.STAR and star_newest else messages
        for message in targets:
            if op == UNMUTE and message.state != State.MUTED:
                continue
            if getattr(message, field) != value:
                setattr(message, field, value)
                changed[message.pk] = message
    for message in changed.values():
        message.locally_changed_at = now
    if changed:
        MailMessage.objects.bulk_update(
            list(changed.values()), ["is_read", "is_starred", "state", "locally_changed_at"]
        )
    return set(changed)


def _mute(connection, messages, *, muted):
    """Mute and unmute on Gmail rows: Revenact's own, never an outbox row.
    Unmute re-derives the state from the labels."""
    changed = []
    for message in messages:
        if muted:
            state = State.MUTED
        elif message.state != State.MUTED:
            continue
        else:
            archived = gmail_store.derive(
                message.label_ids,
                from_address=message.from_address,
                own_address=connection.address,
            )["archived"]
            state = State.DONE if archived else State.OPEN
        if message.state != state:
            message.state = state
            changed.append(message)
    if changed:
        MailMessage.objects.bulk_update(changed, ["state"])
    return {message.pk for message in changed}


def perform(connection, messages, steps, *, star_newest=False, now=None):
    """Make `steps` true on `messages`: through the outbox for Google, here
    only for Outlook and IMAP. Returns the pks whose local values changed.
    In the caller's transaction, after the checks."""
    now = now or timezone.now()
    if not connection.is_google:
        return _local(messages, steps, star_newest=star_newest, now=now)
    pairs = []
    for op, label in steps:
        if op in LOCAL_OPS:
            continue
        targets = newest_per_thread(messages) if op == Op.STAR and star_newest else messages
        pairs += [
            (message, change) for message in targets for change in outbox.changes_for(op, label)
        ]
    changed = outbox.apply(connection, pairs, now=now) if pairs else set()
    ops = {op for op, _ in steps}
    if ops & LOCAL_OPS:
        changed |= _mute(connection, messages, muted=MUTE in ops)
    return changed


def run(messages, plan, *, star_newest=False):
    """Checks 3 to 6 and the change itself, once the request holds its
    messages: lock the mailbox row, let `plan(connection)` turn the body
    into steps (or an answer that refuses it), refuse, perform. Returns
    (answer or None, pks changed)."""
    connection = messages[0].connection
    if connection.is_google:
        connection = lock_connection(connection)
    steps = plan(connection)
    if isinstance(steps, Response):
        return steps, set()
    refused = refusal(connection, steps)
    if refused is not None:
        return refused, set()
    return None, perform(connection, messages, steps, star_newest=star_newest)


def labels_for(connection, **fields):
    """({id: MailLabel}, None) for the label ids each body field names on a
    Google mailbox, or (None, the 400) naming the first field that has one
    that is not the caller's."""
    labels = {}
    if connection.is_google:
        for field, ids in fields.items():
            found = resolve_labels(connection, ids)
            if found is None:
                return None, Response({field: [CHOOSE_LABEL]}, status=status.HTTP_400_BAD_REQUEST)
            labels.update(found)
    return labels, None


def change(messages, data, *, star_newest=False):
    """A PATCH on one message or a thread, after check 1, inside the
    request's transaction: checks 2 to 6, then the change. Returns the
    answer that refused it, or None once it is done."""
    serializer = ChangeSerializer(data=data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    if len(messages) > settings.MAIL_ACTION_MAX_MESSAGES:
        return too_many()
    valid = serializer.validated_data
    refused = drafts_refused(messages)
    if refused is not None:
        return refused

    def plan(connection):
        labels, refused = labels_for(
            connection,
            add_labels=valid.get("add_labels", []),
            remove_labels=valid.get("remove_labels", []),
        )
        return refused or steps_from_change(valid, labels)

    return run(messages, plan, star_newest=star_newest)[0]


#: What POST mail/actions/ takes (contract §3).
BULK_OPS = (
    Op.READ,
    Op.UNREAD,
    Op.STAR,
    Op.UNSTAR,
    Op.ARCHIVE,
    Op.INBOX,
    Op.TRASH,
    Op.UNTRASH,
    Op.SPAM,
    Op.NOT_SPAM,
    Op.LABEL_ADD,
    Op.LABEL_REMOVE,
    MUTE,
    UNMUTE,
)
LABEL_OPS = frozenset({Op.LABEL_ADD, Op.LABEL_REMOVE})
#: Ids per request (decision 34): the body's own cap.
MAX_IDS = 1000


class BulkActionSerializer(serializers.Serializer):
    op = serializers.CharField()
    message_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        min_length=1,
        max_length=MAX_IDS,
    )
    thread_of = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        min_length=1,
        max_length=MAX_IDS,
    )
    label_id = serializers.IntegerField(required=False)

    def validate_op(self, value):
        if value not in BULK_OPS:
            raise serializers.ValidationError("Choose a known action.")
        return value

    def validate(self, attrs):
        if ("message_ids" in attrs) == ("thread_of" in attrs):
            raise serializers.ValidationError("Send message_ids or thread_of, not both.")
        label_op = attrs["op"] in LABEL_OPS
        if label_op and "label_id" not in attrs:
            raise serializers.ValidationError({"label_id": [CHOOSE_LABEL]})
        if not label_op and "label_id" in attrs:
            raise serializers.ValidationError({"label_id": ["Only label actions take a label."]})
        return attrs


def requested_ids(data):
    """The ids a bulk body names, for check 1, which comes before the body's
    own checks; None when they cannot be read (the serializer answers)."""
    if not isinstance(data, dict):
        return None
    raw = data.get("message_ids", data.get("thread_of"))
    if not isinstance(raw, list) or not 0 < len(raw) <= MAX_IDS:
        return None
    if not all(isinstance(item, int) and not isinstance(item, bool) for item in raw):
        return None
    return set(raw)


def expand(user, ids, *, threads):
    """The caller's messages with these ids, locked; with `threads`, every
    message of their threads too (decision 9). One query."""
    rows = lockable(user)
    if not threads:
        return list(rows.filter(pk__in=ids))
    named = (
        MailMessage.objects.filter(owner=user, pk__in=ids).exclude(thread_id="").values("thread_id")
    )
    return list(rows.filter(Q(pk__in=ids) | Q(thread_id__in=named)))
