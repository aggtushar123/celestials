"""Conversations (contract §2).

A thread is the owner's messages with the same `thread_id`, or one message
when it has none (IMAP, and anything without a provider thread). A thread is
in a view when any of its messages matches the view's filters, and it is
ordered and shown by its newest matching message (the anchor), found with a
window function: no DISTINCT over a join (the Postgres 16 rule). Counts and
flags leave trash and spam out, except in the trash and spam views, as Gmail
does. A thread is addressed by any of its messages' ids (decision 16).
Owner-only: every query here scopes on the owner.
"""

from collections import defaultdict

from django.conf import settings
from django.db.models import Case, CharField, F, Q, Value, When, Window
from django.db.models.functions import Cast, Concat, RowNumber

from . import outbox
from .models import MailMessage
from .serializers import (
    MailMessageDetailSerializer,
    account_of,
    draft_of,
    labels_by_gmail_id,
)

HIDDEN = (MailMessage.Folder.TRASH, MailMessage.Folder.SPAM)
#: The thread a row belongs to, in SQL: its thread_id, or "m<id>" alone.
THREAD_KEY = Case(
    When(thread_id="", then=Concat(Value("m"), Cast("id", output_field=CharField()))),
    default=F("thread_id"),
    output_field=CharField(),
)


def key_of(message):
    """A message's conversation: its Gmail thread, or itself when it has none."""
    return message.thread_id or f"m{message.pk}"


def thread_q(message):
    """The messages of `message`'s thread (apply to an owner-scoped queryset)."""
    return Q(thread_id=message.thread_id) if message.thread_id else Q(pk=message.pk)


def anchors(matching):
    """The newest matching message of each thread, newest thread first
    (decision 17)."""
    return (
        matching.annotate(
            newest_first=Window(
                RowNumber(),
                partition_by=[THREAD_KEY],
                order_by=[F("sent_at").desc(), F("id").desc()],
            )
        )
        .filter(newest_first=1)
        .order_by("-sent_at", "-id")
    )


def union_labels(messages, by_key):
    """The user labels on any of `messages`, by name."""
    found = {}
    for message in messages:
        for key in message.label_ids or []:
            if key in by_key:
                found[by_key[key]["id"]] = by_key[key]
    return sorted(found.values(), key=lambda label: label["name"].lower())


def newest_account(messages):
    """The newest filed message's record, else None (`messages` oldest first)."""
    for message in reversed(messages):
        account = account_of(message)
        if account is not None:
            return account
    return None


def newest_issue(messages, issues):
    found = [issues[message.pk] for message in messages if message.pk in issues]
    return max(found, key=lambda issue: issue["at"]) if found else None


def _participants(messages):
    seen, people = set(), []
    for message in messages:
        address = (message.from_address or "").lower()
        if address in seen:
            continue
        seen.add(address)
        people.append({"name": message.from_name, "address": message.from_address})
    return people


def _row(anchor, members, *, view, labels, issues):
    shown = members if view in HIDDEN else [m for m in members if m.folder not in HIDDEN]
    shown = shown or [anchor]
    people = _participants(shown)
    return {
        "id": anchor.pk,
        "thread_id": anchor.thread_id,
        "subject": anchor.subject,
        "snippet": anchor.snippet,
        "last_sent_at": anchor.sent_at,
        "message_count": len(shown),
        "unread_count": sum(not message.is_read for message in shown),
        "participants": people[:3],
        "more_participants": max(len(people) - 3, 0),
        "is_read": all(message.is_read for message in shown),
        "is_starred": any(message.is_starred for message in shown),
        "is_important": any(message.is_important for message in shown),
        "priority": any(message.priority for message in shown),
        "state": anchor.state,
        "folder": anchor.folder,
        "has_attachments": any(message.has_attachments for message in shown),
        "labels": union_labels(shown, labels),
        "account": newest_account(members),
        "sync_issue": newest_issue(members, issues),
        "draft": draft_of(anchor),
    }


def thread_rows(user, page, *, view):
    """One page of anchors as thread rows: their threads' messages in one
    query (filed record joined), then the labels and the sync issues."""
    if not page:
        return []
    threaded = [anchor.thread_id for anchor in page if anchor.thread_id]
    alone = [anchor.pk for anchor in page if not anchor.thread_id]
    members = defaultdict(list)
    # SOC2:AUTH-02 the owner's own messages only
    rows = (
        MailMessage.objects.filter(owner=user)
        .filter(Q(thread_id__in=threaded) | Q(pk__in=alone))
        .select_related("email__customer", "email__account")
        .order_by("sent_at", "id")
    )
    for message in rows:
        members[key_of(message)].append(message)
    labels = labels_by_gmail_id(user)
    issues = outbox.sync_issues([m.pk for group in members.values() for m in group])
    return [
        _row(anchor, members[key_of(anchor)], view=view, labels=labels, issues=issues)
        for anchor in page
    ]


def thread_payload(user, anchor):
    """GET mail/messages/<id>/thread/: every message oldest first, at most
    MAIL_THREAD_MAX_MESSAGES (the newest), trash and spam included."""
    limit = settings.MAIL_THREAD_MAX_MESSAGES
    # SOC2:AUTH-02 the owner's own messages only
    newest = list(
        MailMessage.objects.filter(owner=user)
        .filter(thread_q(anchor))
        .select_related("connection", "email__customer", "email__account", "draft__reply_draft")
        .prefetch_related("attachments")
        .order_by("-sent_at", "-id")[: limit + 1]
    )
    truncated = len(newest) > limit
    messages = newest[:limit][::-1]
    labels = labels_by_gmail_id(user)
    issues = outbox.sync_issues([message.pk for message in messages])
    shown = [message for message in messages if message.folder not in HIDDEN] or messages
    return {
        "thread_id": anchor.thread_id,
        "subject": messages[0].subject,
        "labels": union_labels(shown, labels),
        "account": newest_account(messages),
        "sync_issue": newest_issue(messages, issues),
        "truncated": truncated,
        "messages": MailMessageDetailSerializer(
            messages, many=True, context={"labels": labels, "issues": issues}
        ).data,
    }
