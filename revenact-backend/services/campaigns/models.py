"""Campaigns: one owner's plain-text email to the people one of their
segments reaches.

Spec: react-ts-app docs/superpowers/specs/2026-10-04-campaigns-design.md. A
`Campaign` is reusable and owned, shared like a segment. Each send is a
`CampaignSend` with its subject, body and counts frozen, and one
`CampaignDelivery` per person checked: queued, sent, or skipped with its
reason. Only the hash of a delivery's unsubscribe token is stored. There is
no task queue: a send is claimed in one short transaction and delivered in
the request (`sending.py`).

`recipients` is the hand-picked list from before segments, kept as read-only
history for migrated drafts (migration 0004)."""

from django.conf import settings
from django.db import models
from django.db.models import Q

#: One owner may own at most this many campaigns, archived ones included.
MAX_OWNED = 50
#: A campaign is shared by name with at most this many teammates.
MAX_SHARED = 50
MAX_NAME, MAX_SUBJECT, MAX_BODY = 120, 150, 5000
#: A contact gets at most one campaign email from the workspace in this many days.
GAP_DAYS = 3
#: One send queues at most this many people; the rest are skipped `over_limit`.
MAX_PEOPLE = 500
#: An unsubscribe link works for this many days after its email went out.
LINK_DAYS = 365
#: A send still `sending` this long after it started is finished by the night or the admin.
STALE_MINUTES = 10
#: Ticked for organisation and account segments unless the owner says otherwise.
DEFAULT_ROLES = ("champion", "decision_maker")


class SkipReason(models.TextChoices):
    UNSUBSCRIBED = "unsubscribed", "Unsubscribed"
    NO_EMAIL = "no_email", "No email address"
    ALREADY_RECEIVED = "already_received", "Already received it"
    RECENT_CAMPAIGN = "recent_campaign", "Emailed in the last 3 days"
    OVER_LIMIT = "over_limit", "Over the 500-person limit"
    FAILED = "failed", "The email could not be sent"


def default_roles():
    return list(DEFAULT_ROLES)


def empty_counts():
    return {"reached": 0, "sent": 0, "skipped": {reason: 0 for reason in SkipReason.values}}


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    class Sharing(models.TextChoices):
        PRIVATE = "private", "Only me"
        WORKSPACE = "workspace", "Everyone in the workspace"
        PEOPLE = "people", "Chosen teammates"

    organisation = models.ForeignKey(
        "accounts.Organisation", related_name="campaigns", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="campaigns",
        on_delete=models.PROTECT,
    )
    name = models.CharField(max_length=MAX_NAME, default="Untitled Campaign")
    subject = models.CharField(max_length=MAX_SUBJECT, blank=True)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    segment = models.ForeignKey(
        "segments.Segment",
        related_name="campaigns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who it goes to: one of the owner's own segments.",
    )
    roles = models.JSONField(
        default=default_roles,
        blank=True,
        help_text="Contact.Role values, in the order ticked. Empty for a contact segment.",
    )
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_campaigns", blank=True
    )
    recipients = models.ManyToManyField(
        "customers.Contact",
        related_name="campaigns",
        blank=True,
        help_text="Hand-picked before segments. Read-only history; nothing writes to it.",
    )
    agent_action = models.ForeignKey(
        "metrics.AgentAction",
        related_name="campaigns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The agent action that made this campaign, if one did.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "sharing"]),
            models.Index(fields=["owner", "status"]),
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Campaign {self.pk}"


class CampaignSend(models.Model):
    """One send of a campaign, with what went out frozen."""

    class Kind(models.TextChoices):
        MANUAL = "manual", "Sent by hand"
        RULE = "rule", "From a rule"

    class Status(models.TextChoices):
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"

    campaign = models.ForeignKey(Campaign, related_name="sends", on_delete=models.CASCADE)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    rule = models.ForeignKey(
        "rules.Rule",
        related_name="campaign_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    review = models.ForeignKey(
        "rules.RuleReview",
        related_name="campaign_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who pressed Send now or approved the review; null for a send without review.",
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.SENDING)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    # 255, not MAX_SUBJECT: a send migrated from before segments keeps its full subject.
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    counts = models.JSONField(
        default=empty_counts,
        blank=True,
        help_text="{reached, sent, skipped: {<reason>: n}}, frozen at the claim and the finish.",
    )
    migrated = models.BooleanField(
        default=False, help_text="Built by migration 0004 from a send before segments."
    )

    class Meta:
        ordering = ["-started_at", "-id"]
        indexes = [
            models.Index(fields=["campaign", "started_at"]),
            models.Index(fields=["status", "started_at"]),
        ]

    def __str__(self):
        return f"Campaign send {self.pk}"


class CampaignDelivery(models.Model):
    """One person on one send: queued, sent, or skipped with its reason."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        SKIPPED = "skipped", "Skipped"

    send = models.ForeignKey(CampaignSend, related_name="deliveries", on_delete=models.CASCADE)
    contact = models.ForeignKey(
        "customers.Contact", related_name="campaign_deliveries", on_delete=models.CASCADE
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.QUEUED)
    reason = models.CharField(max_length=16, choices=SkipReason.choices, blank=True, default="")
    email = models.ForeignKey(
        "customers.Email", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    token_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="SHA-256 of the unsubscribe token; the token itself is never stored.",
    )
    taken_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When a worker took it to email; `resume` judges a stuck take by this.",
    )
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["send", "contact"], name="one_campaign_delivery_per_contact"
            ),
            models.UniqueConstraint(
                fields=["token_hash"],
                condition=~Q(token_hash=""),
                name="campaign_delivery_token_unique",
            ),
            models.CheckConstraint(
                condition=Q(status="skipped") | Q(reason=""),
                name="campaign_delivery_reason_only_when_skipped",
            ),
        ]
        indexes = [
            models.Index(fields=["contact", "sent_at"]),
            models.Index(fields=["send", "status"]),
        ]

    def __str__(self):
        return f"Campaign delivery {self.pk}"
