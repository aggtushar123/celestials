"""One number, for one organisation, as a month ended.

The dashboards compute everything at request time from today's rows, which
answers "how is the book?" and cannot answer "how was it in March?". This is
the history that question needs — one row per metric per period, whole-org
in this first slice, with `dimension`/`member` reserved so a slice by owner
or product later is a row, not a migration.
"""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation

#: The scope key of the whole organisation's briefs and explanations — the
#: ones `/api/v1/metrics/` and the Slack delivery read. A Brain scope stores
#: `me:<user id>` or `team:<user id>` (services/brain/scope.py).
COMPANY_SCOPE = "company"


class MetricSnapshot(models.Model):
    organisation = models.ForeignKey(
        Organisation, related_name="metric_snapshots", on_delete=models.CASCADE
    )
    metric = models.CharField(max_length=64, help_text="A key from services.metrics.registry.")
    dimension = models.CharField(
        max_length=32,
        blank=True,
        help_text='Empty for the whole organisation; later "owner", "product", ...',
    )
    member = models.CharField(
        max_length=64,
        blank=True,
        help_text="The dimension member's id or value; empty for whole-org.",
    )
    period_end = models.DateField(help_text="The last day of the month this row describes.")
    value = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Null when the metric could not be measured that month — not zero.",
    )
    captured_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["metric", "period_end"]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "metric", "dimension", "member", "period_end"],
                name="metricsnapshot_one_per_metric_member_period",
            )
        ]
        indexes = [models.Index(fields=["organisation", "metric", "period_end"])]

    def __str__(self):
        return f"{self.metric} @ {self.period_end} = {self.value}"


class Brief(models.Model):
    """One management brief, written by the model from the metric layer.

    Stored rather than regenerated on view: a brief costs a real model call,
    and last week's brief is itself a record — what the figures said then,
    and what was worth watching. `evidence` is the exact data the prompt was
    built from, kept beside the text so any sentence can be checked against
    the numbers it was written from.
    """

    organisation = models.ForeignKey(Organisation, related_name="briefs", on_delete=models.CASCADE)
    as_of = models.DateField(help_text="The day the figures describe.")
    baseline = models.DateField(
        null=True, blank=True, help_text="The month-end the figures were compared against, if any."
    )
    headline = models.CharField(max_length=255)
    body = models.TextField(help_text="Paragraphs separated by blank lines.")
    watch = models.JSONField(default=list, blank=True, help_text="2-4 things to watch next month.")
    evidence = models.JSONField(help_text="What the model was given — the figures, verbatim.")
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    generated_at = models.DateTimeField()
    scope_key = models.CharField(
        max_length=32,
        default=COMPANY_SCOPE,
        help_text='Whose figures: "company", or a Brain scope "me:<id>" / "team:<id>".',
    )
    figures_digest = models.CharField(
        max_length=64,
        blank=True,
        help_text="SHA-256 of the figures the prompt carried; a different digest today "
        "means the numbers have moved since (stale).",
    )

    class Meta:
        ordering = ["-generated_at"]
        indexes = [
            models.Index(
                fields=["organisation", "scope_key", "-generated_at"],
                name="metrics_brief_scope_latest",
            )
        ]

    def __str__(self):
        return f"Brief for {self.organisation} as of {self.as_of}"


class Explanation(models.Model):
    """Why one metric is where it is, in the model's words, as of one day.

    The latest per metric is what the Brain shows beside the number; older
    ones stay as a record of what was said about the figure then. `inputs`
    is exactly what the prompt carried — the definition, the value and its
    month-end, the cuts, the accounts — so any sentence can be checked, and
    `evidence` the lines the model chose to cite.
    """

    organisation = models.ForeignKey(
        Organisation, related_name="explanations", on_delete=models.CASCADE
    )
    metric = models.CharField(max_length=64, help_text="A key in the metric registry.")
    as_of = models.DateField(help_text="The day the figures describe.")
    baseline = models.DateField(
        null=True, blank=True, help_text="The month-end the figures were compared against, if any."
    )
    value = models.DecimalField(max_digits=16, decimal_places=4, null=True, blank=True)
    previous_value = models.DecimalField(max_digits=16, decimal_places=4, null=True, blank=True)
    text = models.TextField()
    evidence = models.JSONField(default=list, blank=True, help_text="The figures cited.")
    inputs = models.JSONField(help_text="What the model was given — the figures, verbatim.")
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    generated_at = models.DateTimeField()
    scope_key = models.CharField(
        max_length=32,
        default=COMPANY_SCOPE,
        help_text='Whose figures: "company", or a Brain scope "me:<id>" / "team:<id>".',
    )
    figures_digest = models.CharField(
        max_length=64,
        blank=True,
        help_text="SHA-256 of the metric's value and cuts the prompt carried.",
    )

    class Meta:
        ordering = ["-generated_at"]
        indexes = [
            models.Index(fields=["organisation", "metric", "-generated_at"]),
            models.Index(
                fields=["organisation", "scope_key", "metric", "-generated_at"],
                name="metrics_expl_scope_latest",
            ),
        ]

    def __str__(self):
        return f"Why {self.metric} for {self.organisation} as of {self.as_of}"


class Initiative(models.Model):
    """A decision, with a number attached.

    Management's half of the brain. The metric layer says what the numbers
    are and what moved them; an initiative says what someone decided to do
    about one of them — a hypothesis, a target, a date, an owner — and is
    then judged against the same registry that everything else reads, so
    "did it work" is a fact rather than a memory.

    `baseline_value` is the starting line, captured when the initiative was
    written: the number as it stood on `baseline_as_of`. Stored rather than
    re-read, because the point is to measure movement since the decision, and
    the registry only knows "now".

    An initiative can target one cut of a metric — ARR at risk on Product B,
    coverage for one owner — through `dimension`/`member`, which must be a
    cut the registry actually has. `member_label` is kept as it read when the
    initiative was written, so the card still says "Product B" if the cut is
    later empty.
    """

    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        ACTIVE = "active", "Active"
        DONE = "done", "Done"
        ABANDONED = "abandoned", "Abandoned"

    organisation = models.ForeignKey(
        Organisation, related_name="initiatives", on_delete=models.CASCADE
    )
    title = models.CharField(max_length=200)
    hypothesis = models.TextField(
        blank=True,
        help_text='"If we …, then … because …". The reasoning, so the outcome can be '
        "judged against it.",
    )
    metric = models.CharField(max_length=64, help_text="A key from services.metrics.registry.")
    dimension = models.CharField(max_length=32, blank=True)
    member = models.CharField(max_length=64, blank=True)
    member_label = models.CharField(max_length=255, blank=True)
    target_value = models.DecimalField(max_digits=18, decimal_places=4)
    target_by = models.DateField()
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="owned_initiatives",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    outcome = models.TextField(blank=True, help_text="What happened, written when it is closed.")

    class BaselineScope(models.TextChoices):
        COMPANY = "company", "Company"
        BOOK = "book", "Book"

    baseline_value = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    baseline_as_of = models.DateField()
    baseline_scope = models.CharField(
        max_length=16,
        choices=BaselineScope.choices,
        default=BaselineScope.COMPANY,
        help_text="How the baseline was read: the organisation-wide registry (company), "
        "or the creator's own read of the cut person's book (book, started from the Brain).",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class AgentAction(models.Model):
    """Something an agent did or wants to do (Agents round §1.3). Formerly
    `Proposal`, renamed in place: the same rows and ids.

    Three agents propose actions: CS, Sales and Ops. The Ops agent was the
    one Brain asked and the session facilitator wrote for. Each action is
    one kind from `services.agents.registry`. It waits as `proposed` for a
    person, or is applied on its own when Actions & approvals allows it,
    and applying runs through the same paths a person uses.

    `before` is the value it would change, read when it was proposed; a
    decision on an action whose record has moved on since expires it
    instead. `after` is what applying set, which undo compares against.
    `target` is what one open action is kept per (Decision 5)."""

    class Agent(models.TextChoices):
        CS = "cs", "CS agent"
        SALES = "sales", "Sales agent"
        OPS = "ops", "Ops agent"

    class Kind(models.TextChoices):
        RECORD_LIFECYCLE = "record.lifecycle", "Change lifecycle stage"
        RECORD_OWNER = "record.owner", "Change owner"
        RECORD_ATTRIBUTE = "record.attribute", "Set an AI attribute"
        TASK_CREATE = "task.create", "Create a task"
        TASK_REASSIGN = "task.reassign", "Reassign a task"
        TASK_REDATE = "task.redate", "Change a task's due date"
        TASK_COMPLETE = "task.complete", "Mark a task done"
        TASK_SNOOZE = "task.snooze", "Snooze a task"
        NOTE_CREATE = "note.create", "File a note"
        DRAFT_REPLY = "draft.reply", "Draft a reply"
        PLAN_START = "plan.start", "Start a plan"
        SEGMENT_CREATE = "segment.create", "Build a segment"
        SCENARIO_CREATE = "scenario.create", "Build a scenario"
        CAMPAIGN_CREATE = "campaign.create", "Draft a campaign"
        CANVAS_CREATE = "canvas.create", "Map a record's people"
        PLAN_TEMPLATE = "plan.template", "Write a plan template"
        INITIATIVE_CREATE = "initiative.create", "Start an initiative"
        SURVEY_SEND = "survey.send", "Send a survey"
        CAMPAIGN_SEND = "campaign.send", "Send a campaign"
        # Agent bundles D3: outside actions, always Ask, never undone.
        MAIL_SEND_REPLY = "mail.send_reply", "Send an email reply"
        SLACK_REPLY = "slack.reply", "Reply in Slack"
        JIRA_CREATE = "jira.create", "Create a Jira issue"
        JIRA_ASSIGN = "jira.assign", "Assign a Jira issue"
        # Agent bundles round 2 D1: an internal Jira comment, always Ask.
        JIRA_COMMENT = "jira.comment", "Comment on a Jira issue"
        # Slack bundles (owner, 2026-10-17): on the one record a Slack message is about.
        SURVEY_RECORD = "survey.record", "Survey the record's people"
        SEGMENT_PIN = "segment.pin", "Pin to a segment"
        SCENARIO_RUN = "scenario.run", "Run a scenario"
        # Guided agent (2026-10-18): diagnose, write an email, send it.
        RECORD_DIAGNOSE = "record.diagnose", "Diagnose"
        MAIL_COMPOSE = "mail.compose", "Write an email"
        MAIL_SEND_DRAFT = "mail.send_draft", "Send it"
        # Sales review report (2026-10-18): tomorrow's sales review meeting.
        REPORT_SALES = "report.sales", "Prepare the sales report"

    class Status(models.TextChoices):
        PROPOSED = "proposed", "Proposed"
        APPLIED = "applied", "Applied"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        UNDONE = "undone", "Undone"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    organisation = models.ForeignKey(
        Organisation, related_name="proposals", on_delete=models.CASCADE
    )
    agent = models.CharField(max_length=8, choices=Agent.choices, default=Agent.OPS)
    batch = models.CharField(max_length=32, help_text="One run; its actions share it.")
    kind = models.CharField(max_length=24, choices=Kind.choices)
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="agent_actions",
    )
    account = models.ForeignKey(
        "customers.Account",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="agent_actions",
    )
    target = models.CharField(max_length=160, blank=True)
    title = models.CharField(max_length=255)
    rationale = models.TextField(help_text="Why, in the agent's words, citing the evidence.")
    evidence = models.JSONField(default=list, help_text="The figures cited, as given to the agent.")
    payload = models.JSONField(help_text="Exactly what applying does, validated when proposed.")
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    initiative = models.ForeignKey(
        Initiative,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="proposals",
        help_text="The open initiative this serves, if the agent linked one.",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROPOSED)
    auto = models.BooleanField(default=False)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    undone_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    undone_at = models.DateTimeField(null=True, blank=True)
    expired_reason = models.CharField(max_length=24, blank=True)
    result = models.JSONField(
        default=dict, blank=True, help_text="What applying created, e.g. a task id."
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    session = models.ForeignKey(
        "copilot.CopilotSession",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="proposals",
        help_text="Set when the facilitator wrote this from a multiplayer session's "
        "decisions rather than an agent from the figures alone.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    bundle = models.ForeignKey(
        "agents.AgentBundle",
        on_delete=models.CASCADE,
        related_name="steps",
        help_text="The bundle this step belongs to; a lone action is a bundle of one.",
    )
    position = models.PositiveSmallIntegerField(default=1)
    selected = models.BooleanField(default=True, help_text="The last run's tick.")
    outputs = models.JSONField(
        default=dict, blank=True, help_text="What the step produced, for later steps."
    )
    error = models.CharField(max_length=500, blank=True)
    irreversible = models.BooleanField(
        default=False, help_text="Whether it could not be undone when it ran."
    )
    edited_at = models.DateTimeField(
        null=True, blank=True, help_text="The last saved edit to this step (agent bundles D2-18)."
    )

    class Meta:
        # The legacy table is kept (contract, Compatibility): same rows, same ids.
        db_table = "metrics_proposal"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organisation", "status", "agent"], name="agent_action_queue"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "kind", "customer", "account", "target"],
                condition=models.Q(status="proposed"),
                nulls_distinct=False,
                name="agent_action_one_open",
            ),
            models.UniqueConstraint(
                fields=["bundle", "position"], name="agent_action_bundle_position"
            ),
        ]

    def __str__(self):
        # Not the title: an audit row records this, and the title names a record.
        return f"Agent action {self.pk} ({self.kind})"

    def save(self, *args, **kwargs):
        """A step saved without a bundle gets a bundle of one (contract D3):
        the facilitator's session proposals, scripts and tests."""
        if self.bundle_id is None:
            from services.agents.bundles import bundle_of_one

            self.bundle = bundle_of_one(self)
            self.position = 1
        super().save(*args, **kwargs)

    @property
    def record(self):
        if self.account_id is not None:
            return self.account
        return self.customer

    @property
    def workspace_level(self):
        """Whether the action's kind acts on no record: the registry's word."""
        from services.agents.registry import REGISTRY

        spec = REGISTRY.get(self.kind)
        return spec is not None and spec.workspace_level


class Feedback(models.Model):
    """A person correcting something the system said.

    The feedback log. Three kinds so far: a classification the model got
    wrong, fixed by hand; a proposal the Ops agent made, approved or
    rejected with a note; a health score overridden by a CSM who knows
    better than the rubric. Each row keeps what the system said (`before`)
    and what the person said (`after`), so the log is the training data the
    next prompt, taxonomy or rubric change should be read against.
    """

    class Kind(models.TextChoices):
        CLASSIFICATION = "classification", "Classification corrected"
        PROPOSAL = "proposal", "Proposal decided"
        HEALTH_OVERRIDE = "health_override", "Health score overridden"

    organisation = models.ForeignKey(
        Organisation, related_name="feedback", on_delete=models.CASCADE
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    subject_type = models.CharField(
        max_length=32, help_text='"ticket", "email", "call", "customer", "proposal".'
    )
    subject_id = models.PositiveIntegerField()
    subject_label = models.CharField(
        max_length=255, help_text="What the row was about, as it read then."
    )
    before = models.JSONField(default=dict, help_text="What the system said.")
    after = models.JSONField(default=dict, help_text="What the person said.")
    note = models.TextField(blank=True)
    made_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["organisation", "kind", "created_at"])]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.subject_label}"


class BriefSchedule(models.Model):
    """Where the management brief goes, and when.

    One per organisation: a brief is the company's own summary, and two
    schedules would be two answers to the same question. `destination` is
    a Slack incoming webhook, which is a credential — anyone holding it
    can post to that channel — so it is never sent back to a client; the
    API returns `destination_hint` instead.

    Nothing is generated on a schedule. The pass posts the brief that
    exists; if nobody has written one for the period, it says so rather
    than spending a model call nobody asked for.

    There is no hour to choose. The job that posts this runs once a night
    (`run_health_maintenance`), so a brief goes out on its day when that
    job runs, and offering an hour the job could never honour would be a
    promise the product cannot keep."""

    class Cadence(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"

    organisation = models.OneToOneField(
        Organisation, related_name="brief_schedule", on_delete=models.CASCADE
    )
    destination = models.URLField(max_length=500)
    cadence = models.CharField(max_length=16, choices=Cadence.choices, default=Cadence.WEEKLY)
    #: Monday is 0, matching Python's own weekday(). Weekly schedules only.
    weekday = models.PositiveSmallIntegerField(default=0)
    #: Day of the month, for monthly schedules. A month too short for it
    #: sends on its last day rather than skipping the month.
    day = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def destination_hint(self) -> str:
        """Enough of the URL to recognise it, never enough to use it."""
        return f"…{self.destination[-4:]}" if self.destination else ""

    def __str__(self):
        return f"{self.organisation} brief → Slack ({self.cadence})"
