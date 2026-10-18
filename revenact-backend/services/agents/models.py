"""The agents' own rows (Agents round §1.1, §1.6): one profile per
workspace and agent, and the workspace's Actions & approvals grid. What an
agent did is `metrics.AgentAction`."""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation
from services.metrics.models import AgentAction


class AgentProfile(models.Model):
    """One agent in one workspace: on or off, its monthly credit budget,
    and how its last pass went (`last_run`: proposed, applied, dropped,
    skipped_reason)."""

    organisation = models.ForeignKey(
        Organisation, related_name="agent_profiles", on_delete=models.CASCADE
    )
    kind = models.CharField(max_length=8, choices=AgentAction.Agent.choices)
    enabled = models.BooleanField(default=True)
    monthly_credits = models.PositiveIntegerField(default=0)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_run = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "kind"], name="agent_profile_one_per_kind"
            )
        ]

    def __str__(self):
        return f"{self.kind} agent ({self.organisation_id})"


class AgentPolicy(models.Model):
    """The workspace's Actions & approvals grid: `levels` is
    {agent: {kind: "auto"|"ask"|"never"}}; a missing entry reads as ask
    (`policy.level`)."""

    organisation = models.OneToOneField(
        Organisation, related_name="agent_policy", on_delete=models.CASCADE
    )
    levels = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Agent policy ({self.organisation_id})"


class SignalThread(models.Model):
    """One conversation agents may read (agent bundles D2, contract §1.1): a
    filed mail thread of one mailbox, one ticket of a connector, or one Slack
    conversation. The sync touches it (`threads.touch_mail`,
    `threads.touch_ticket`, `threads.touch_conversation`); the intake run
    reads it (`intake`). No message text is stored here: the run reads the
    filed Email and Ticket rows."""

    class SourceKind(models.TextChoices):
        MAIL = "mail", "Email"
        SLACK = "slack", "Slack"
        ZENDESK = "zendesk", "Zendesk"
        FRESHDESK = "freshdesk", "Freshdesk"
        JIRA = "jira", "Jira"
        WEBHOOK = "webhook", "Webhook"

    class Status(models.TextChoices):
        NEW = "new", "New"
        WAITING_QUIET = "waiting_quiet", "Waiting for quiet"
        WAITING_CREDITS = "waiting_credits", "Waiting for credits"
        PROCESSED = "processed", "Processed"
        SKIPPED = "skipped", "Skipped"

    organisation = models.ForeignKey(
        Organisation, related_name="signal_threads", on_delete=models.CASCADE
    )
    source_kind = models.CharField(max_length=16, choices=SourceKind.choices)
    external_id = models.CharField(max_length=320)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    account = models.ForeignKey(
        "customers.Account", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    department = models.CharField(max_length=16, blank=True, default="")
    mailbox = models.ForeignKey(
        "mail.MailboxConnection",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
    )
    # CASCADE, never SET_NULL: a mail thread with no owner would read as
    # everyone's under the chain rule (SOC2:AUTH-02).
    mailbox_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    mail_thread = models.CharField(max_length=255, blank=True, default="")
    ticket = models.ForeignKey(
        "customers.Ticket", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    #: Slack escalations D1 (SE1-13): a Slack thread's conversation (a Slack
    #: thread has no ticket any more).
    conversation = models.ForeignKey(
        "customers.SlackConversation",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
    )
    last_message_at = models.DateTimeField()
    #: Round 2 D3 (R2D3-15): the fast-lane rule its newest item matched at
    #: sync, or "" (never a model's judgement).
    urgent_rule = models.CharField(max_length=16, blank=True, default="")
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_through = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    skip_reason = models.CharField(max_length=24, blank=True, default="")
    agent = models.CharField(max_length=8, choices=AgentAction.Agent.choices, blank=True)
    failures = models.PositiveSmallIntegerField(default=0)
    claimed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "source_kind", "external_id"], name="signal_thread_once"
            )
        ]
        indexes = [
            models.Index(
                fields=["organisation", "status", "last_message_at"], name="signal_thread_due"
            ),
            models.Index(
                fields=["organisation", "urgent_rule", "last_message_at"],
                name="signal_thread_urgent",
            ),
        ]

    def __str__(self):
        # Not the record: an audit row may record this.
        return f"Signal thread {self.pk}"

    @property
    def record(self):
        if self.account_id is not None:
            return self.account
        return self.customer


class AgentBundle(models.Model):
    """One proposal of ready-to-run steps (Agent bundles, contract §1.1).
    Its steps are `metrics.AgentAction` rows (`steps`), run in `position`
    order. `thread`, `department` and the flags are delivery 2's (contract §1.2)."""

    class Source(models.TextChoices):
        NIGHTLY = "nightly", "Nightly review"
        THREAD = "thread", "Message"
        #: Slack bundles (owner, 2026-10-17): one Slack message a person sent
        #: to their own Work with "Send to Revenact". Read and run by that
        #: person alone (`routed_user`), never their manager or an admin.
        SLACK_MESSAGE = "slack_message", "Slack message"
        #: Sales review report (2026-10-18): tomorrow's "sales review" meeting.
        #: Read and run by its organiser alone (`routed_user`), as a Slack bundle.
        MEETING = "meeting", "Meeting"

    class RoutedTo(models.TextChoices):
        OWNER = "owner", "Record owner"
        DEPARTMENT = "department", "Department"
        ADMINS = "admins", "Admins"
        #: A Slack message's bundle: the person who sent it to Revenact; a
        #: meeting's: its organiser.
        PERSON = "person", "Person"

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        RUNNING = "running", "Running"
        DONE = "done", "Done"
        PARTLY_DONE = "partly_done", "Partly done"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        SUPERSEDED = "superseded", "Superseded"

    class Priority(models.TextChoices):
        HIGH = "high", "High"
        NORMAL = "normal", "Normal"

    class RejectReason(models.TextChoices):
        ALREADY_HANDLED = "already_handled", "Already handled"
        NOT_RELEVANT = "not_relevant", "Not relevant"
        WRONG_PERSON = "wrong_person", "Wrong person"
        OTHER = "other", "Other"

    organisation = models.ForeignKey(
        Organisation, related_name="agent_bundles", on_delete=models.CASCADE
    )
    agent = models.CharField(max_length=8, choices=AgentAction.Agent.choices)
    title = models.CharField(max_length=255)
    reason = models.TextField(blank=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.NIGHTLY)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    account = models.ForeignKey(
        "customers.Account", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    routed_to = models.CharField(max_length=16, choices=RoutedTo.choices, default=RoutedTo.OWNER)
    routed_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    #: Delivery 2 (contract §1.2): the thread a `thread` bundle answers, the
    #: department it was routed to, whether a newer message arrived after a
    #: person edited it, when its steps were last replaced, and who rejected it.
    thread = models.ForeignKey(
        SignalThread, null=True, blank=True, on_delete=models.SET_NULL, related_name="bundles"
    )
    #: Slack bundles: the Slack message (its Work card) a `slack_message`
    #: bundle was made from. The card is deleted when dismissed or after 30
    #: days (SOC2:DATA-04); the bundle keeps its steps.
    slack_suggestion = models.ForeignKey(
        "work.SlackSuggestion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bundles",
    )
    department = models.CharField(max_length=16, blank=True, default="")
    has_newer_message = models.BooleanField(default=False)
    refreshed_at = models.DateTimeField(null=True, blank=True)
    #: Slack escalations D4 (contract §1.2): {} for every other bundle; for an
    #: escalation its function, its person (`user_id`, `via`), the thread's
    #: decision, the issue step, whether the channel was shared, the thread
    #: starter's first name and the template reply the platform wrote ("" when
    #: the model's was kept).
    escalation = models.JSONField(default=dict, blank=True)
    #: Guided agent (2026-10-18): `high` when the message asked urgently, or
    #: a guided bundle's record is in poor health (`guided.priority_for`).
    #: A high bundle is told at once (`guided.notify_priority`).
    priority = models.CharField(max_length=8, choices=Priority.choices, default=Priority.NORMAL)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.WAITING)
    edited_at = models.DateTimeField(null=True, blank=True)
    edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    run_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    run_started_at = models.DateTimeField(null=True, blank=True)
    run_finished_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.CharField(max_length=16, choices=RejectReason.choices, blank=True)
    reject_note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "status"], name="agent_bundle_status"),
            models.Index(fields=["organisation", "updated_at"], name="agent_bundle_updated"),
        ]

    def __str__(self):
        # Not the title: an audit row records this, and the title names a record.
        return f"Agent bundle {self.pk}"

    @property
    def record(self):
        if self.account_id is not None:
            return self.account
        return self.customer


#: The bundles that are one person's alone (`routed_user`): a Slack message's
#: (its sender) and a meeting's (its organiser). Nobody else reads, counts or
#: decides them, view-all included.
PERSONAL_SOURCES = (AgentBundle.Source.SLACK_MESSAGE, AgentBundle.Source.MEETING)

#: The bundle sources made from something a person may not share with
#: everyone who opens the record: a thread's (read by its source's readers),
#: a Slack message's and a meeting's (read by their person alone). The nightly
#: pass never expires, replaces or names their steps.
MESSAGE_SOURCES = (AgentBundle.Source.THREAD, *PERSONAL_SOURCES)

#: The statuses History lists (contract §10.5).
FINISHED = (
    AgentBundle.Status.DONE,
    AgentBundle.Status.PARTLY_DONE,
    AgentBundle.Status.REJECTED,
    AgentBundle.Status.EXPIRED,
    AgentBundle.Status.SUPERSEDED,
)


class BundleParticipant(models.Model):
    """A member who took part in the Slack thread a bundle was made from
    (Slack escalations D4, contract §1.4, SE4-25): they may read and decide
    that bundle, and only that one. Stored when the bundle is made."""

    bundle = models.ForeignKey(AgentBundle, related_name="participants", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["bundle", "user"], name="bundle_participant_once")
        ]
        indexes = [models.Index(fields=["user", "bundle"], name="bundle_participant_user")]

    def __str__(self):
        return f"Participant {self.user_id} of bundle {self.bundle_id}"


class IssueWait(models.Model):
    """A survey a Slack bundle's `survey.record` step holds back until the
    Jira issue an earlier step made is resolved (Slack bundles, owner
    2026-10-17). The ticket sync marks it due when it files the issue as
    resolved (`issue_waits.seen`); a poll asks Jira for the ones the sync
    doesn't read; the per-minute tick sends what is due as its owner
    (`issue_waits.send_due`). One per step; `detail` is a plain sentence or
    a short code, never the survey's text."""

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        DUE = "due", "Due"
        SENT = "sent", "Sent"
        REFUSED = "refused", "Refused"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    organisation = models.ForeignKey(
        Organisation, related_name="issue_waits", on_delete=models.CASCADE
    )
    action = models.OneToOneField(AgentAction, related_name="issue_wait", on_delete=models.CASCADE)
    survey_send = models.ForeignKey(
        "surveys.SurveySend",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="issue_waits",
    )
    connector = models.ForeignKey(
        "connectors.Connector", related_name="issue_waits", on_delete=models.CASCADE
    )
    issue_key = models.CharField(max_length=64)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="issue_waits", on_delete=models.CASCADE
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.WAITING)
    resolved_at = models.DateTimeField(null=True, blank=True)
    checked_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    detail = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["connector", "issue_key", "status"], name="issue_wait_issue"),
            models.Index(fields=["status", "checked_at"], name="issue_wait_due"),
        ]

    def __str__(self):
        return f"Issue wait {self.pk}"
