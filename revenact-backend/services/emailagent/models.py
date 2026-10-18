"""The email agent (spec 2026-10-17-private-mail-and-email-agent-design §2).

`EmailIntent` is the ledger: one row per internal message the agent read
(by RFC Message-ID: read once), and, while it waits on its sender (owner
decision B), the task it would give. `MeetingProposal` is a meeting someone
asked for: first waiting on its sender, then, once they send it, on the
person asked to be there. Internal mail itself is never stored (decision
D): what is kept is the agent's own one-line topic and the fields it read.
"""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation
from services.customers.models import Account, Customer, Task


class EmailIntent(models.Model):
    class Kind(models.TextChoices):
        NONE = "none", "Nothing to do"
        TASK = "task", "Task"
        MEETING = "meeting", "Meeting"

    class Outcome(models.TextChoices):
        NOTHING = "nothing", "Nothing done"
        AWAITING = "awaiting", "Waiting on its sender"
        DISMISSED = "dismissed", "Dismissed by its sender"
        TASK_CREATED = "task_created", "Task created"
        TASK_REFUSED = "task_refused", "Asker may not assign it"
        TASK_UNDONE = "task_undone", "Task undone"
        PROPOSED = "proposed", "Meeting sent to its approver"
        FAILED = "failed", "Could not be read"

    organisation = models.ForeignKey(
        Organisation, related_name="email_intents", on_delete=models.CASCADE
    )
    message_key = models.CharField(
        max_length=998, help_text="RFC Message-ID, or the mailbox and provider id."
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="email_intents", null=True, on_delete=models.SET_NULL
    )
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.NONE)
    outcome = models.CharField(max_length=16, choices=Outcome.choices, default=Outcome.NOTHING)
    topic = models.CharField(max_length=200, blank=True, help_text="The agent's own line.")
    task = models.ForeignKey(
        Task, related_name="email_intents", null=True, blank=True, on_delete=models.SET_NULL
    )
    # The task it would give, while it waits on its sender (decision B).
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    task_title = models.CharField(max_length=255, blank=True)
    due_date = models.DateField(null=True, blank=True)
    customer = models.ForeignKey(
        Customer, related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    account = models.ForeignKey(
        Account, related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    urgent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "message_key"], name="email_intent_once"
            )
        ]
        indexes = [models.Index(fields=["sender", "outcome", "created_at"])]

    @property
    def record(self):
        return self.customer or self.account


class MeetingProposal(models.Model):
    class Status(models.TextChoices):
        AWAITING_SENDER = "awaiting_sender", "Waiting on its sender"
        OPEN = "open", "Waiting on its approver"
        BOOKED = "booked", "Booked"
        DISMISSED = "dismissed", "Dismissed"

    organisation = models.ForeignKey(
        Organisation, related_name="meeting_proposals", on_delete=models.CASCADE
    )
    intent = models.OneToOneField(EmailIntent, related_name="proposal", on_delete=models.CASCADE)
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="meeting_proposals", on_delete=models.CASCADE
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", null=True, on_delete=models.SET_NULL
    )
    attendees = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="+")
    topic = models.CharField(max_length=200)
    customer = models.ForeignKey(
        Customer, related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    account = models.ForeignKey(
        Account, related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    urgent = models.BooleanField(default=False)
    proposed_start = models.DateTimeField(null=True, blank=True)
    length_minutes = models.PositiveSmallIntegerField(default=30)
    #: Attendees with no Calendar connected, counted as free.
    unknown_free = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="+", blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.AWAITING_SENDER)
    meeting = models.ForeignKey(
        "calendar_sync.Meeting", related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["approver", "status", "created_at"])]
