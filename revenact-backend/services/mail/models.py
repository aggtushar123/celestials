"""A person's own mailbox, connected to the company brain.

Every email this product shows or sends comes from *someone's* mailbox:
the CSM's, the engineer's, the CEO's. `MailboxConnection` is that link —
one per person, to whatever provider their company runs on (Google,
Microsoft, or any IMAP/SMTP server). The credentials are theirs, encrypted
at rest, and the emails synced through it are theirs too: visible to them
and to their management chain, never to peers or to people below them
(see visibility.py). The Copilot reads under the same rule.
"""

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models, transaction
from django.db.models import Q
from django.db.models.signals import post_delete
from django.dispatch import receiver

from services.accounts.models import Organisation

from . import crypto, scopes

#: How a label made in Revenact sits in `label_ids` until Gmail creates it
#: (contract decision 21).
PENDING_LABEL_PREFIX = "pending:"
#: How a draft written in Revenact sits in Drafts until Gmail creates it
#: (D3 decision 2): its MailMessage's provider_message_id.
PENDING_DRAFT_PREFIX = "pending-draft:"
#: The outbox ops that carry a draft, not a message (D3 contract §1).
DRAFT_OPS = ("draft_create", "draft_update", "draft_delete")


class MailboxConnection(models.Model):
    class Provider(models.TextChoices):
        GOOGLE = "google", "Google Workspace / Gmail"
        MICROSOFT = "microsoft", "Microsoft 365 / Outlook"
        IMAP = "imap", "IMAP / SMTP"

    class Status(models.TextChoices):
        CONNECTED = "connected", "Connected"
        ERROR = "error", "Needs attention"
        #: Google only: disconnected, credentials wiped, the person's copies kept
        #: for MAIL_DISCONNECT_RETENTION_DAYS (contract decision 9).
        DISCONNECTED = "disconnected", "Disconnected"

    class PausedReason(models.TextChoices):
        """Why a Google mailbox is not synced or used, in precedence order
        (contract decision 23). Blank: not paused."""

        TOKEN_REVOKED = "token_revoked", "Google access revoked"
        WORKSPACE_OFF = "workspace_off", "Workspace not enabled"
        SUSPENDED = "suspended", "Member suspended"
        NO_SEAT = "no_seat", "No seat"

    organisation = models.ForeignKey(
        Organisation, related_name="mailboxes", on_delete=models.CASCADE
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, related_name="mailbox", on_delete=models.CASCADE
    )
    provider = models.CharField(max_length=16, choices=Provider.choices)
    address = models.EmailField(help_text="The mailbox's own address, as the provider reports it.")
    display_name = models.CharField(max_length=150, blank=True)
    #: Fernet-encrypted JSON: OAuth tokens, or IMAP/SMTP host + login. Restricted.
    credentials = models.TextField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CONNECTED)
    error = models.CharField(max_length=255, blank=True)
    #: Provider-specific: where the last sync stopped (an epoch, a delta link, a UID).
    sync_cursor = models.CharField(max_length=512, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    # --- Two-way Gmail (Google only; Outlook and IMAP leave these empty) ---
    #: Full scope URLs Google granted. [] for connections made before D1.
    granted_scopes = models.JSONField(default=list, blank=True)
    #: Gmail's last applied historyId. Null: initialise on the next tick.
    history_id = models.PositiveBigIntegerField(null=True, blank=True)
    #: The import's two bounds; page tokens need the identical query.
    import_after = models.DateTimeField(null=True, blank=True)
    import_before = models.DateTimeField(null=True, blank=True)
    import_page_token = models.CharField(max_length=512, blank=True)
    #: users.getProfile.messagesTotal at connect: the whole mailbox, not the window.
    import_total_estimate = models.PositiveIntegerField(null=True, blank=True)
    import_done_at = models.DateTimeField(null=True, blank=True)
    #: A 30-day re-list is running (history too old, or a reconnect).
    reconcile_started_at = models.DateTimeField(null=True, blank=True)
    reconcile_page_token = models.CharField(max_length=512, blank=True)
    watch_expires_at = models.DateTimeField(null=True, blank=True)
    #: Set by push, Sync now and connect; cleared when the loop claims the row.
    wake_at = models.DateTimeField(null=True, blank=True)
    #: The loop's claim (decision 18).
    lease_until = models.DateTimeField(null=True, blank=True)
    backoff_until = models.DateTimeField(null=True, blank=True)
    consecutive_failures = models.PositiveSmallIntegerField(default=0)
    paused_reason = models.CharField(max_length=16, choices=PausedReason.choices, blank=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)
    # --- Gmail's send-as entry (D3 decision 18), refreshed by the tick ---
    send_as_name = models.CharField(max_length=150, blank=True)
    #: Gmail's signature, sanitised with services.mail.html (nh3).
    signature_html = models.TextField(blank=True)
    send_as_synced_at = models.DateTimeField(null=True, blank=True)
    #: Owner decision A (2026-10-17): the email agent reads this person's
    #: internal mail only when they switch it on. Off by default.
    agent_reads_mail = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # The push webhook finds a mailbox by address (decision 6).
            models.UniqueConstraint(
                fields=["provider", "address"],
                condition=Q(provider="google") & ~Q(status="disconnected"),
                name="one_live_google_connection_per_address",
            )
        ]
        indexes = [models.Index(fields=["provider", "status", "wake_at"], name="mail_conn_due_idx")]

    def __str__(self):
        return f"{self.address} ({self.get_provider_display()})"

    @property
    def is_google(self):
        return self.provider == self.Provider.GOOGLE

    @property
    def two_way(self):
        """Google, and every one of the three Gmail scopes granted."""
        return self.is_google and scopes.is_two_way(self.granted_scopes)

    # Credentials never leave this pair of methods in clear.
    def set_credentials(self, data: dict):
        import json

        self.credentials = crypto.encrypt(json.dumps(data))

    def get_credentials(self) -> dict:
        import json

        return json.loads(crypto.decrypt(self.credentials))


class MailMessage(models.Model):
    """One message in a person's own mailbox, as the provider holds it.

    `customers.Email` is the company's view: mail filed against an account so
    the whole team's picture of that customer includes it. This is the
    person's view: every message the provider handed back, matched or not,
    so the Communications page can be their inbox rather than a subset of it.
    Where a message did match, `email` points at the filed copy and the row
    carries the account context with it.

    It belongs to the connection and dies with it: disconnecting Outlook or
    IMAP takes the personal copy away at once, and a Google disconnect keeps
    it for MAIL_DISCONNECT_RETENTION_DAYS (services/mail/prune.py), while
    the filed `Email` rows stay on the customer as before. Visible to the
    owner only (views scope on `owner`); the management chain
    reads the filed copies, not someone's whole inbox.

    `folder`, `is_read`, `is_starred` and `is_important` come from the
    provider. For Gmail they are derived from `label_ids` at every store and
    label change (services/mail/gmail_store.py), and Gmail is the truth,
    except for a label with a pending or sending outbox row: a change made
    here goes back to Gmail through the outbox (services/mail/outbox.py) and
    the person's value holds until Gmail has it. Outlook and IMAP keep
    `locally_changed_at`: what the person did here wins, and nothing is
    written back. `state` is this product's
    own triage — done and muted leave the inbox without touching the mailbox.
    A Gmail draft's row (folder drafts) belongs to a `MailDraft` (`draft`): a
    placeholder `pending-draft:<id>` until Gmail has made it, and, once sent,
    the sent copy.
    `category` is decided once at sync by `categorise()`: the provider's own
    tab when it has one, else a small honest heuristic.
    """

    class Folder(models.TextChoices):
        INBOX = "inbox", "Inbox"
        SENT = "sent", "Sent"
        DRAFTS = "drafts", "Drafts"
        SPAM = "spam", "Spam"
        TRASH = "trash", "Trash"

    class Category(models.TextChoices):
        GENERAL = "general", "General"
        FINANCIAL = "financial", "Financial"
        NEWSLETTERS = "newsletters", "Newsletters"
        NOTIFICATIONS = "notifications", "Notifications"
        PROMOTIONS = "promotions", "Promotions"
        SOCIAL = "social", "Social"

    class State(models.TextChoices):
        OPEN = "open", "Open"
        DONE = "done", "Done"
        MUTED = "muted", "Muted"

    class Direction(models.TextChoices):
        SENT = "sent", "Sent"
        RECEIVED = "received", "Received"

    connection = models.ForeignKey(
        MailboxConnection, related_name="messages", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="mail_messages", on_delete=models.CASCADE
    )
    organisation = models.ForeignKey(
        Organisation, related_name="mail_messages", on_delete=models.CASCADE
    )
    provider_message_id = models.CharField(max_length=255)
    thread_id = models.CharField(max_length=255, blank=True)
    direction = models.CharField(max_length=8, choices=Direction.choices)
    from_name = models.CharField(max_length=150, blank=True)
    from_address = models.EmailField(blank=True)
    to = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    #: Gmail rows from D1 on split Cc and Bcc out of `to`; every other row keeps
    #: To + Cc merged in `to` and leaves these empty.
    cc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    bcc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    #: The Reply-To header, [[name, address]]; Gmail rows from D3 on.
    reply_to = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    subject = models.CharField(max_length=255)
    snippet = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    #: Sanitised once at store (services/mail/html.py); "" when none, or too large.
    html_body = models.TextField(blank=True)
    #: The Message-ID header verbatim; blank rather than truncated when longer.
    rfc_message_id = models.CharField(max_length=998, blank=True)
    references = models.TextField(blank=True)
    #: Gmail's label ids, all of them. Folder and flags are derived from these.
    label_ids = models.JSONField(default=list, blank=True)
    #: At least one non-inline attachment part.
    has_attachments = models.BooleanField(default=False)
    #: Every store or label refresh from Gmail; the reconcile finds deletions by it.
    refreshed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField()
    folder = models.CharField(max_length=8, choices=Folder.choices, default=Folder.INBOX)
    category = models.CharField(max_length=16, choices=Category.choices, default=Category.GENERAL)
    state = models.CharField(max_length=8, choices=State.choices, default=State.OPEN)
    is_read = models.BooleanField(default=True)
    is_starred = models.BooleanField(default=False)
    is_important = models.BooleanField(default=False)
    #: Set when the person changed a flag or the state here. From then on a
    #: re-sync leaves the provider's flags alone: what they did here wins.
    locally_changed_at = models.DateTimeField(null=True, blank=True)
    email = models.OneToOneField(
        "customers.Email",
        related_name="mail_message",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The filed copy, when the message matched someone in the book.",
    )
    synced_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "provider_message_id"], name="mail_message_once_per_mailbox"
            )
        ]
        indexes = [
            models.Index(fields=["owner", "folder", "state", "-sent_at"]),
            models.Index(fields=["owner", "category"]),
            # `label_ids @> '["Label_12"]'`: the label views (contract decision 18).
            GinIndex(
                fields=["label_ids"], name="mail_msg_label_ids_gin", opclasses=["jsonb_path_ops"]
            ),
        ]

    def __str__(self):
        return f"{self.subject} ({self.from_address})"

    @property
    def priority(self) -> bool:
        """Provider-important, or from someone in the book."""
        return self.is_important or self.email_id is not None


class MailLabel(models.Model):
    """A Gmail label, mirrored from labels.list on every Google tick. Read by
    its mailbox's owner only. `gmail_id` is blank only for a label made in
    Revenact that the outbox has not created in Gmail yet; until then it sits
    in `label_ids` as `pending:<pk>` (`key`)."""

    class Type(models.TextChoices):
        SYSTEM = "system", "System"
        USER = "user", "User"

    connection = models.ForeignKey(
        MailboxConnection, related_name="labels", on_delete=models.CASCADE
    )
    gmail_id = models.CharField(max_length=255, blank=True)
    name = models.CharField(max_length=225, help_text="Gmail's full name, '/' nesting included.")
    type = models.CharField(max_length=8, choices=Type.choices)
    color_background = models.CharField(max_length=7, blank=True)
    color_text = models.CharField(max_length=7, blank=True)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "gmail_id"],
                condition=~Q(gmail_id=""),
                name="mail_label_once_per_mailbox",
            )
        ]

    def __str__(self):
        return f"label {self.pk}"

    @property
    def key(self):
        """How this label appears in a message's `label_ids`."""
        return self.gmail_id or f"{PENDING_LABEL_PREFIX}{self.pk}"


def mail_attachment_path(instance, filename):
    """Where a fetched part lands: under its organisation, named by a random
    id, as customers.attachment_path. The name stays on the row, never in
    the path."""
    import uuid

    from services.customers.files import extension_of

    organisation_id = instance.message.organisation_id
    return f"mail_attachments/{organisation_id}/{uuid.uuid4().hex}{extension_of(filename)}"


class MailAttachment(models.Model):
    """One file part of a Gmail message. `file` is fetched from Gmail on the
    first open (services/mail/attachments.py) and kept; it is deleted with the
    row (`_delete_cached_file`). Gmail rotates attachment ids between fetches,
    so `part_id` is what a fetch matches on. Owner-only, or the twice-filter
    when its message is filed."""

    message = models.ForeignKey(MailMessage, related_name="attachments", on_delete=models.CASCADE)
    part_id = models.CharField(max_length=64)
    gmail_attachment_id = models.TextField(blank=True)
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    content_id = models.CharField(max_length=255, blank=True)
    is_inline = models.BooleanField(default=False)
    file = models.FileField(upload_to=mail_attachment_path, blank=True)
    #: When `file` was fetched from Gmail.
    fetched_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["message", "part_id"], name="mail_attachment_part_once")
        ]

    def __str__(self):
        return f"attachment {self.pk}"


class MailOutbox(models.Model):
    """One change on its way to Gmail (contract §1): a single label's target
    presence on one message, (`label_create`) one label to make, or (D3) one
    draft to create, update or delete. A draft row carries no body: the flush
    builds the MIME from the draft's content (D3 decision 6). Written
    in the request by services/mail/outbox.py, which also changes the
    message at once; sent by the tick (services/mail/outbox_flush.py).

    `previous` is what a failure restores (`{"present": bool}`), and while a
    row is pending or sending, incoming Gmail changes leave that label alone
    and update `previous` instead (decision 3). `sending` is internal: the
    API never shows it. Owner-only, like the mailbox."""

    class Op(models.TextChoices):
        READ = "read", "Mark as read"
        UNREAD = "unread", "Mark as unread"
        STAR = "star", "Star"
        UNSTAR = "unstar", "Unstar"
        ARCHIVE = "archive", "Archive"
        INBOX = "inbox", "Move to the Inbox"
        TRASH = "trash", "Delete"
        UNTRASH = "untrash", "Restore"
        SPAM = "spam", "Report spam"
        NOT_SPAM = "not_spam", "Not spam"
        LABEL_ADD = "label_add", "Add a label"
        LABEL_REMOVE = "label_remove", "Remove a label"
        LABEL_CREATE = "label_create", "Create a label"
        DRAFT_CREATE = "draft_create", "Save the draft"
        DRAFT_UPDATE = "draft_update", "Save the draft"
        DRAFT_DELETE = "draft_delete", "Delete the draft"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        #: Claimed by a flush, its Gmail call under way (decision 4).
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    class Reason(models.TextChoices):
        NOT_FOUND = "not_found", "The message no longer exists"
        LABEL_GONE = "label_gone", "The label no longer exists"
        REFUSED = "refused", "Gmail refused the change"
        EXHAUSTED = "exhausted", "Gmail didn't answer"
        NAME_REFUSED = "name_refused", "Gmail refused the name"
        TOO_LARGE = "too_large", "Gmail refused the size"

    #: A row Gmail has not settled yet: incoming changes skip its label.
    LIVE = ("pending", "sending")
    DRAFT_OPS = DRAFT_OPS

    connection = models.ForeignKey(
        MailboxConnection, related_name="outbox", on_delete=models.CASCADE
    )
    #: Shared by every row one request made; one notice per action and reason.
    action_id = models.UUIDField()
    op = models.CharField(max_length=24, choices=Op.choices)
    message = models.ForeignKey(
        MailMessage, related_name="outbox", on_delete=models.CASCADE, null=True, blank=True
    )
    label = models.ForeignKey(
        MailLabel, related_name="outbox", on_delete=models.CASCADE, null=True, blank=True
    )
    draft = models.ForeignKey(
        "MailDraft", related_name="outbox", on_delete=models.CASCADE, null=True, blank=True
    )
    #: The Gmail label id changed (UNREAD, INBOX, Label_12) or pending:<MailLabel id>.
    label_key = models.CharField(max_length=255, blank=True)
    #: The target: the label present (True) or absent (False). Null for label_create.
    add = models.BooleanField(null=True, blank=True)
    previous = models.JSONField(default=dict, blank=True)
    #: label_create: {"name"}; label_add / label_remove: {"label"};
    #: draft_delete: {"gmail_draft_id"}.
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField()
    reason = models.CharField(max_length=16, choices=Reason.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    #: auto_now, which queryset update() skips: every status update sets it.
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            # The collapse (decision 2).
            models.UniqueConstraint(
                fields=["message", "label_key"],
                condition=Q(status="pending"),
                name="mail_outbox_one_pending_per_label",
            ),
            models.UniqueConstraint(
                fields=["label"],
                condition=Q(op="label_create") & Q(status__in=["pending", "sending"]),
                name="mail_outbox_one_label_create",
            ),
            models.CheckConstraint(
                condition=Q(
                    op="label_create",
                    label__isnull=False,
                    message__isnull=True,
                    draft__isnull=True,
                )
                | Q(op__in=DRAFT_OPS, draft__isnull=False, message__isnull=True, label__isnull=True)
                | (
                    ~Q(op__in=["label_create", *DRAFT_OPS])
                    & Q(message__isnull=False, draft__isnull=True)
                ),
                name="mail_outbox_row_shape",
            ),
            # Decision 6: a draft row carries no body, so one pending row per draft.
            models.UniqueConstraint(
                fields=["draft"],
                condition=Q(status="pending") & Q(op__in=DRAFT_OPS),
                name="mail_outbox_one_pending_per_draft",
            ),
        ]
        indexes = [
            models.Index(
                fields=["connection", "status", "next_attempt_at"], name="mail_outbox_due_idx"
            ),
            models.Index(fields=["message", "status"], name="mail_outbox_message_idx"),
        ]

    def __str__(self):
        return f"outbox {self.pk} {self.op}"


class MailDraft(models.Model):
    """A Gmail draft, Revenact's side of it (D3 contract §1, decision 1).

    Owner-only, like the mailbox. `message` is the draft's row in Drafts: a
    placeholder (`pending-draft:<id>`) until Gmail has made the draft, then
    the draft's own message, and after a send the sent copy. Its content is
    sanitised HTML with the text derived from it; the MIME is built from it
    when the outbox or a send needs it (services/mail/sending.py).
    `revision` counts content changes from here or from Gmail, and a write
    from a stale one is refused (decision 8). `sending` and `discarded` are
    internal. A linked agent draft (`reply_draft`) is the same message seen
    twice (decision 3)."""

    class Kind(models.TextChoices):
        NEW = "new", "New message"
        REPLY = "reply", "Reply"
        REPLY_ALL = "reply_all", "Reply all"
        FORWARD = "forward", "Forward"

    class GmailState(models.TextChoices):
        LOCAL = "local", "Not in Gmail"
        SAVING = "saving", "Saving"
        SAVED = "saved", "Saved"
        FAILED = "failed", "Failed"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        #: Claimed by a send, Gmail not yet answered. Reads as sent.
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        #: Gone from Drafts, its draft_delete still on its way to Gmail.
        DISCARDED = "discarded", "Discarded"

    #: A draft the person still has: shown on its message row (§2).
    LIVE = ("open", "sending")

    connection = models.ForeignKey(
        MailboxConnection, related_name="drafts", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="mail_drafts", on_delete=models.CASCADE
    )
    organisation = models.ForeignKey(
        Organisation, related_name="mail_drafts", on_delete=models.CASCADE
    )
    message = models.OneToOneField(
        MailMessage, related_name="draft", on_delete=models.SET_NULL, null=True, blank=True
    )
    kind = models.CharField(max_length=9, choices=Kind.choices)
    #: What a reply or forward answers; null for a new message.
    source = models.ForeignKey(
        MailMessage, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    #: Gmail's threadId, sent with every create, update and send.
    thread_id = models.CharField(max_length=255, blank=True)
    in_reply_to = models.CharField(max_length=998, blank=True)
    references = models.TextField(blank=True)
    to = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    cc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    bcc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    subject = models.CharField(max_length=255, blank=True)
    #: Sanitised at every write (services/mail/html.py).
    html = models.TextField(blank=True)
    #: Derived from `html` at every write; never taken from the client.
    text = models.TextField(blank=True)
    #: MailAttachment ids on `source` kept for a forward.
    forwarded = models.JSONField(default=list, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    account = models.ForeignKey(
        "customers.Account", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    #: The person set the record: it stops following the suggestion.
    record_chosen = models.BooleanField(default=False)
    reply_draft = models.OneToOneField(
        "customers.ReplyDraft",
        related_name="mail_draft",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    gmail_draft_id = models.CharField(max_length=255, blank=True)
    #: The draft's message in Gmail, as last known (Gmail replaces it on every update).
    gmail_message_id = models.CharField(max_length=255, blank=True)
    gmail_state = models.CharField(
        max_length=8, choices=GmailState.choices, default=GmailState.LOCAL
    )
    revision = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.OPEN)
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_email = models.ForeignKey(
        "customers.Email", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    #: The claim's stamp while sending: never saved in full then.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "gmail_draft_id"],
                condition=~Q(gmail_draft_id=""),
                name="mail_draft_once_per_mailbox",
            ),
            models.CheckConstraint(
                condition=Q(customer__isnull=True) | Q(account__isnull=True),
                name="mail_draft_on_at_most_one_record",
            ),
        ]
        indexes = [models.Index(fields=["owner", "status"], name="mail_draft_owner_idx")]

    def __str__(self):
        return f"draft {self.pk}"


@receiver(post_delete, sender=MailAttachment, dispatch_uid="mail.attachment_file_cleanup")
def _delete_cached_file(sender, instance, **kwargs):
    """A fetched file goes with its row, cascades included (history
    deletions, the prune, a replaced connection): contract decision 32.
    Deferred to the commit, so a rolled-back delete keeps its file."""
    name = instance.file.name
    if name:
        storage = instance.file.storage
        transaction.on_commit(lambda: storage.delete(name))
