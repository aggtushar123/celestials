from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework import serializers

from . import gates, outbox, scopes, signing
from .models import MailboxConnection, MailDraft, MailLabel, MailMessage


class MailboxConnectionSerializer(serializers.ModelSerializer):
    """What the person sees about their own connection. Never the credentials."""

    provider_display = serializers.CharField(source="get_provider_display", read_only=True)

    class Meta:
        model = MailboxConnection
        fields = [
            "id",
            "provider",
            "provider_display",
            "address",
            "display_name",
            "status",
            "error",
            "last_synced_at",
            "created_at",
            "agent_reads_mail",
        ]
        read_only_fields = fields


def import_block(connection):
    """The 12-month import's progress. `total_estimate` is the whole
    mailbox's messagesTotal (decision 16): `done` is final, the count is 'about'."""
    return {
        "state": "done" if connection.import_done_at else "importing",
        "imported": connection.messages.count(),
        "total_estimate": connection.import_total_estimate,
        "done_at": connection.import_done_at,
    }


def connection_payload(connection):
    """GET mail/connection/'s `connection` (contract §3). The pause is
    computed live, with the loop's own rule; Outlook and IMAP answer the new
    fields empty (§9). Never the credentials."""
    data = MailboxConnectionSerializer(connection).data
    google = connection.is_google
    paused = gates.paused_reason(connection)
    watching = (
        connection.watch_expires_at is not None and connection.watch_expires_at > timezone.now()
    )
    data.update(
        {
            "two_way": connection.two_way,
            "needs_reconnect": google
            and (not connection.two_way or paused == MailboxConnection.PausedReason.TOKEN_REVOKED),
            "granted_scopes": scopes.short_names(connection.granted_scopes) if google else [],
            "import": import_block(connection) if google else None,
            "push": bool(google and settings.GMAIL_PUBSUB_TOPIC and watching),
            "paused_reason": paused or None,
            "signature": signature_payload(connection),
        }
    )
    return data


def signature_payload(connection):
    """The mailbox's signature (round 2 D1 contract §4.3): Gmail's, read only;
    an Outlook one its owner writes; none for IMAP."""
    if connection.is_google:
        return {"text": signing.text(connection), "editable": False, "source": "gmail"}
    if connection.provider == MailboxConnection.Provider.MICROSOFT:
        return {"text": signing.text(connection), "editable": True, "source": "revenact"}
    return None


def disconnected_block(connection):
    """A Google row kept after a disconnect, and when the prune takes it."""
    return {
        "provider": connection.provider,
        "address": connection.address,
        "disconnected_at": connection.disconnected_at,
        "delete_after": connection.disconnected_at
        + timedelta(days=settings.MAIL_DISCONNECT_RETENTION_DAYS),
    }


class ComposeSerializer(serializers.Serializer):
    to = serializers.ListField(child=serializers.EmailField(), min_length=1, max_length=20)
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField(max_length=20000)


def label_payload(label):
    """A user label as the API shows it: Revenact's id, never Gmail's. A label
    made here that Gmail has not created yet is `pending` (decision 21)."""
    has_color = label.color_background or label.color_text
    color = {"background": label.color_background, "text": label.color_text} if has_color else None
    return {"id": label.pk, "name": label.name, "color": color, "pending": not label.gmail_id}


def labels_by_gmail_id(user):
    """The person's own user labels by `MailLabel.key` (the Gmail id, or
    `pending:<pk>`), in one query: the message serializers' `labels` context."""
    # SOC2:AUTH-02 a mailbox's labels are its owner's alone
    rows = MailLabel.objects.filter(connection__user=user, type=MailLabel.Type.USER)
    return {label.key: label_payload(label) for label in rows}


def account_of(message):
    """The filed copy's record ({id, name, type}), or None."""
    email = message.email
    if email is None:
        return None
    if email.customer_id is not None:
        return {"id": email.customer_id, "name": email.customer.name, "type": "customer"}
    if email.account_id is not None:
        return {"id": email.account_id, "name": email.account.name, "type": "account"}
    return None


def draft_of(message):
    """§2's `draft` for a live draft's row ({id, agent, reply_draft_id}), else
    None. Read through a joined `draft__reply_draft` (no query)."""
    try:
        draft = message.draft
    except ObjectDoesNotExist:
        return None
    if draft is None or draft.status not in MailDraft.LIVE:
        return None
    reply = draft.reply_draft
    return {
        "id": draft.pk,
        "agent": reply.agent if reply is not None else None,
        "reply_draft_id": draft.reply_draft_id,
    }


class MailMessageSerializer(serializers.ModelSerializer):
    """One row of the person's inbox. `account` is the filed copy's parent,
    when the message matched someone in the book; `priority` is that or the
    provider's own importance flag. `labels` are the message's user labels,
    resolved through the `labels` context (labels_by_gmail_id), sorted by
    name; system and category labels are already the folder, flags and
    category, and ids Gmail no longer has are ignored. `sync_issue` is the
    newest failed Gmail change on it (the `issues` context,
    `outbox.sync_issues`), or null. `draft` names the live draft a Drafts row
    belongs to (D3 §2)."""

    priority = serializers.BooleanField(read_only=True)
    account = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()
    sync_issue = serializers.SerializerMethodField()
    draft = serializers.SerializerMethodField()

    class Meta:
        model = MailMessage
        fields = [
            "id",
            "thread_id",
            "direction",
            "from_name",
            "from_address",
            "to",
            "cc",
            "bcc",
            "subject",
            "snippet",
            "sent_at",
            "folder",
            "category",
            "state",
            "is_read",
            "is_starred",
            "is_important",
            "priority",
            "account",
            "labels",
            "has_attachments",
            "sync_issue",
            "draft",
        ]

    def get_account(self, message):
        return account_of(message)

    def get_draft(self, message):
        return draft_of(message)

    def get_sync_issue(self, message):
        return (self.context.get("issues") or {}).get(message.pk)

    def get_labels(self, message):
        by_id = self.context.get("labels") or {}
        found = [by_id[gmail_id] for gmail_id in message.label_ids or [] if gmail_id in by_id]
        return sorted(found, key=lambda label: label["name"].lower())


class MailMessageDetailSerializer(MailMessageSerializer):
    """The whole message: the text body, the sanitised HTML ("" when there is
    none, or it was too large), and every file part, inline ones included so
    the frontend can resolve cid: images. `available` (cached, or the
    mailbox can fetch it), `preview` (served inline) and `download_url` come
    from services/mail/attachments.py. rfc_message_id, references and raw
    label ids are never exposed."""

    attachments = serializers.SerializerMethodField()
    shared = serializers.SerializerMethodField()

    class Meta(MailMessageSerializer.Meta):
        fields = MailMessageSerializer.Meta.fields + ["body", "html_body", "attachments", "shared"]

    def get_shared(self, message):
        """Added to Revenact: its filed copy is shared on the customer (2026-10-17)."""
        return message.email_id is not None and message.email.shared_at is not None

    def get_attachments(self, message):
        from .attachments import available, preview

        rows = []
        for part in sorted(message.attachments.all(), key=lambda part: part.part_id):
            ok = available(part, message.connection)
            rows.append(
                {
                    "id": part.pk,
                    "filename": part.filename,
                    "mime_type": part.mime_type,
                    "size": part.size,
                    "is_inline": part.is_inline,
                    "content_id": part.content_id,
                    "available": ok,
                    "preview": preview(part),
                    "download_url": f"/api/v1/mail/attachments/{part.pk}/download/" if ok else None,
                }
            )
        return rows


class ReplySerializer(serializers.Serializer):
    body = serializers.CharField(max_length=20000)


def message_detail(user, message):
    """One of `user`'s own messages as the detail route shows it (also a
    send's `message`): its labels and sync issue read alongside. Needs the
    connection and the filed record joined."""
    context = {"labels": labels_by_gmail_id(user), "issues": outbox.sync_issues([message.pk])}
    return MailMessageDetailSerializer(message, context=context).data
