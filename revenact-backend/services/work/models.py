"""The Work round's own rows (spec §2.1): a recommendation in someone's
queue, and a workspace's Work settings. Tasks themselves stay in
`customers` (`Task`, `TaskEvent`)."""

from copy import deepcopy

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation
from services.customers.models import Account, Customer, Task

#: Every source's settings when a workspace has saved none (spec §2.1).
DEFAULT_SOURCES = {
    "renewal_due": {"enabled": True, "days": 30},
    "health_drop": {"enabled": True, "drop": 0.5, "window_days": 14},
    "urgent_tickets": {"enabled": True, "min": 1},
    "anomaly": {"enabled": True},
}


def default_sources():
    return deepcopy(DEFAULT_SOURCES)


class Recommendation(models.Model):
    """A task Revenact recommends from a signal (services/work/recommend.py),
    waiting in one person's queue (`recipient`) with a suggested assignee.

    One open recommendation per kind and record: two partial unique
    constraints, one for an organisation's own (account null) and one for
    an account's. The agents' are kept per action instead (two pending
    actions can name one record). `signal_value` is how bad the
    signal was (days to renewal, the size of a drop, a count), so a
    dismissed signal comes back inside the cooldown only when it is worse.

    Read only by someone who may decide it AND open its record
    (`rec_access`); `why` names only the record itself and counts."""

    class Kind(models.TextChoices):
        RENEWAL_DUE = "renewal_due", "Renewal due"
        HEALTH_DROP = "health_drop", "Health drop"
        URGENT_TICKETS = "urgent_tickets", "Urgent tickets"
        OVERDUE_TASKS = "overdue_tasks", "Overdue tasks"
        OPEN_QUESTIONS = "open_questions", "Open questions"
        ANOMALY = "anomaly", "Anomaly"
        AGENT_ACTION = "agent_action", "AI agent"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ASSIGNED = "assigned", "Assigned"
        DISMISSED = "dismissed", "Dismissed"
        EXPIRED = "expired", "Expired"

    class DismissReason(models.TextChoices):
        ALREADY_HANDLED = "already_handled", "Already handled"
        NOT_RELEVANT = "not_relevant", "Not relevant"
        WRONG_PERSON = "wrong_person", "Wrong person"
        OTHER = "other", "Other"
        # Set only by the delivery 2 migration; never chosen by a person.
        RETIRED = "retired", "Retired"

    organisation = models.ForeignKey(
        Organisation, related_name="recommendations", on_delete=models.CASCADE
    )
    customer = models.ForeignKey(Customer, related_name="recommendations", on_delete=models.CASCADE)
    account = models.ForeignKey(
        Account,
        related_name="recommendations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Set for an account's own signal; `customer` is then its first organisation.",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=255)
    why = models.JSONField(
        default=dict, blank=True, help_text='{"facts": [str], "evidence": [{label, link}]}'
    )
    agent_action = models.ForeignKey(
        "metrics.AgentAction",
        related_name="recommendations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="The agent's action; set only when the kind is agent_action.",
    )
    suggested_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="recommendations_to_decide",
        on_delete=models.CASCADE,
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    dismiss_reason = models.CharField(max_length=16, choices=DismissReason.choices, blank=True)
    dismiss_note = models.CharField(max_length=255, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    task = models.OneToOneField(
        Task,
        related_name="recommendation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    signal_value = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "status", "recipient"], name="rec_queue"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "kind", "customer"],
                condition=Q(status="open", account__isnull=True) & ~Q(kind="agent_action"),
                name="rec_one_open_per_organisation",
            ),
            models.UniqueConstraint(
                fields=["organisation", "kind", "customer", "account"],
                condition=Q(status="open", account__isnull=False) & ~Q(kind="agent_action"),
                name="rec_one_open_per_account",
            ),
            models.UniqueConstraint(
                fields=["agent_action"],
                condition=Q(status="open", agent_action__isnull=False),
                name="rec_one_per_agent_action",
            ),
        ]

    def __str__(self):
        # Not the title: an audit row records this, and the title names a record.
        return f"Recommendation {self.pk} ({self.kind})"

    @property
    def record(self):
        return self.account if self.account_id is not None else self.customer


#: Kinds Revenact still recommends (Work in one place, delivery 2 §2).
LIVE_KINDS = ("renewal_due", "health_drop", "urgent_tickets", "anomaly")
#: Kinds kept only for history: an overdue task, a question and an agent
#: action are on Work as themselves, so their recommendations were retired.
RETIRED_KINDS = ("overdue_tasks", "open_questions", "agent_action")


class SlackSuggestion(models.Model):
    """One Slack message a person sent to their own Work with the Slack
    message shortcut "Send to Revenact" (Connections spec §3, option A).
    Visible to `owner` alone: never in a Team queue, never to their manager,
    an admin or the account team. Keeps that one message's text and nothing
    else from Slack; deleted when dismissed, or SUGGESTION_KEEP_DAYS after it
    was sent (SOC2:DATA-04)."""

    TEXT_CHARS = 3000

    class BundleState(models.TextChoices):
        """Slack bundles (owner, 2026-10-17): the agent bundle proposed for
        it on the per-minute tick. "" for a row from before."""

        PENDING = "pending", "Pending"
        MADE = "made", "Made"
        NONE = "none", "None"
        FAILED = "failed", "Failed"

    organisation = models.ForeignKey(
        Organisation, related_name="slack_suggestions", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="slack_suggestions", on_delete=models.CASCADE
    )
    customer = models.ForeignKey(
        Customer, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    account = models.ForeignKey(
        Account, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    summary = models.CharField(max_length=255)
    #: SOC2:DATA-06 the one message's text, at most 3,000 characters; never
    #: logged, never audited.
    text = models.TextField(blank=True, default="")
    sender_name = models.CharField(max_length=150, blank=True, default="")
    sender_slack_id = models.CharField(max_length=32, blank=True, default="")
    team_id = models.CharField(max_length=32)
    channel = models.CharField(max_length=32)
    message_ts = models.CharField(max_length=32)
    permalink = models.URLField(max_length=500, blank=True, default="")
    #: An agent step kind (metrics.AgentAction.Kind) the model suggests, or "".
    suggested_kind = models.CharField(max_length=32, blank=True, default="")
    #: The model's drafts (owner, 2026-10-16: one item, a Jira issue and a
    #: reply, each one click). The reply's `with_issue` form carries "{issue}",
    #: filled with the issue's key and link once it exists.
    jira_summary = models.CharField(max_length=255, blank=True, default="")
    jira_description = models.TextField(blank=True, default="")
    reply_draft = models.TextField(blank=True, default="")
    reply_with_issue = models.TextField(blank=True, default="")
    #: The issue made from it, once (its key and link).
    jira_key = models.CharField(max_length=32, blank=True, default="")
    jira_url = models.URLField(max_length=500, blank=True, default="")
    #: A create was sent and Jira's answer may not have come back: the next
    #: click looks the issue up by its label before making another.
    jira_attempted_at = models.DateTimeField(null=True, blank=True)
    #: The reply posted, once.
    replied_at = models.DateTimeField(null=True, blank=True)
    reply_url = models.URLField(max_length=500, blank=True, default="")
    bundle_state = models.CharField(
        max_length=8, choices=BundleState.choices, blank=True, default=""
    )
    #: Slack handover (owner, 2026-10-18): a message that tags colleagues is
    #: handed to each tagged member who could read it in Slack. Their copy
    #: names who handed it (`handed_from`) and the to-do made for them
    #: (`task`), and shows no card (the task stands for it); the clicker's
    #: copy lists whom it went to (`handed_to`, [{id, name}]) and gets no plan.
    handed_from = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    task = models.ForeignKey(
        "customers.Task", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    handed_to = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "channel", "message_ts"], name="slack_suggestion_once"
            )
        ]
        indexes = [
            models.Index(fields=["owner", "created_at"], name="slack_suggestion_feed"),
            models.Index(fields=["bundle_state", "created_at"], name="slack_suggestion_bundle"),
        ]

    def __str__(self):
        # Never the text or the sender: an audit row records this.
        return f"Slack suggestion {self.pk}"

    @property
    def record(self):
        return self.account if self.account_id is not None else self.customer


def default_working_days():
    """Monday (0) to Friday (4)."""
    return [0, 1, 2, 3, 4]


class WorkSettings(models.Model):
    """A workspace's Work settings, made the first time anyone asks
    (`prefs.settings_for`). `sources` may lack a kind or a field (saved
    before it existed); `prefs.effective_sources` fills the defaults in.
    `timezone` (an IANA name) and `working_days` (weekday numbers,
    Monday 0) are what "today" and "a working day" mean for every Work list
    (`clock`); `escalate_after_days` is how many working days overdue a task
    escalates (`tracking`); `digest_enabled` and `digest_hour` (local) are
    the daily email (`digest`)."""

    class RecommendTo(models.TextChoices):
        MANAGER = "manager", "The suggested person's manager"
        OWNER = "owner", "The suggested person"

    organisation = models.OneToOneField(
        Organisation, related_name="work_settings", on_delete=models.CASCADE
    )
    recommend_to = models.CharField(
        max_length=8, choices=RecommendTo.choices, default=RecommendTo.MANAGER
    )
    sources = models.JSONField(default=default_sources, blank=True)
    dismiss_cooldown_days = models.PositiveSmallIntegerField(default=14)
    timezone = models.CharField(max_length=64, default="UTC")
    working_days = models.JSONField(default=default_working_days, blank=True)
    escalate_after_days = models.PositiveSmallIntegerField(default=2)
    digest_enabled = models.BooleanField(default=True)
    digest_hour = models.PositiveSmallIntegerField(default=8)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Work settings ({self.organisation_id})"


class DigestSend(models.Model):
    """One person's daily digest for one local date (spec §3.2 Digest):
    claimed (inserted, `pending`) before it is built or sent, so nobody gets
    two even when two runners overlap; `sent` is set after the send, so a
    crash in between leaves `pending`. `empty`: nothing to report; `failed`: the send
    raised (not retried that day)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        EMPTY = "empty", "Nothing to report"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", on_delete=models.CASCADE)
    local_date = models.DateField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["local_date", "user"], name="digest_once_per_day")
        ]

    def __str__(self):
        return f"Digest {self.local_date} -> {self.user_id} ({self.status})"
