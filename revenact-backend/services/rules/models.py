"""Rules: when something happens in one of my segments, do one to three
things.

Spec: react-ts-app docs/superpowers/specs/2026-10-04-rules-design.md. A
`Rule` belongs to its owner and runs nightly as them (`nightly.py`), on
their own segment, through their visibility at every step. `RuleState`
remembers, per rule and record, last night's score (for `crossed`) and the
last night it fired (the cooldown). `RuleRun` is one rule's night and
`RuleRunRecord` one record it touched. `RuleReview` is one night's survey
or campaign waiting for the owner, or sent at once "without review"; a
night holds at most one of each kind.

Unrelated to `services/scenarios`, the canvas, which stays as it is.
"""

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation

#: How many rules one person may own.
MAX_OWNED = 50
#: How many actions one rule holds.
MIN_ACTIONS, MAX_ACTIONS = 1, 3
#: Once per record every N days.
MIN_COOLDOWN, MAX_COOLDOWN, DEFAULT_COOLDOWN = 1, 365, 30
#: At most this many records fire per rule per night; the rest are counted.
NIGHTLY_CAP = 200
#: Records skipped for the cooldown keep a row up to this many a night; the rest are counted.
MAX_SKIPPED_ROWS = 200
#: A waiting review expires after this many days.
REVIEW_DAYS = 7
#: A rule is shared by name with, and a notify action names, at most this many teammates.
MAX_SHARED = 50
MAX_NAME = 120
MAX_MESSAGE = 280
MAX_TITLE = 200
MAX_DUE_DAYS = 90
#: Each score's range, inclusive: a threshold must lie within it.
SCORE_RANGES = {"csat": (0, 100), "nps": (-100, 100), "ces": (0, 100), "health": (0, 10)}

KINDS = [("customer", "Organisations"), ("account", "Accounts"), ("contact", "Contacts")]


def empty_skips():
    return {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0, "nobody": 0}


class Rule(models.Model):
    class Trigger(models.TextChoices):
        ENTERED = "entered", "Entered the segment"
        LEFT = "left", "Left the segment"
        CROSSED = "crossed", "A score crossed a line"
        SCHEDULE = "schedule", "On a schedule"

    class Score(models.TextChoices):
        CSAT = "csat", "CSAT"
        NPS = "nps", "NPS"
        CES = "ces", "CES"
        HEALTH = "health", "Health"

    class Direction(models.TextChoices):
        BELOW = "below", "Falls below"
        ABOVE = "above", "Rises above"

    class Cadence(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly, on the 1st"

    class Sharing(models.TextChoices):
        PRIVATE = "private", "Only me"
        WORKSPACE = "workspace", "Everyone in the workspace"
        PEOPLE = "people", "Chosen teammates"

    class Paused(models.TextChoices):
        SEGMENT_GONE = "segment_gone", "Its segment was deleted."
        SEGMENT_NOT_OWNED = "segment_not_owned", "Its segment is no longer the owner's."
        OWNER_INACTIVE = "owner_inactive", "Its owner is no longer active."
        TEMPLATE_GONE = "template_gone", "Its plan template was deleted."
        CAMPAIGN_GONE = "campaign_gone", "Its campaign was archived or deleted."

    organisation = models.ForeignKey(Organisation, related_name="rules", on_delete=models.CASCADE)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="rules", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=MAX_NAME)
    is_active = models.BooleanField(default=False)
    segment = models.ForeignKey(
        "segments.Segment",
        related_name="triggered_rules",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The owner's own segment. A rule whose segment is deleted pauses itself.",
    )
    trigger = models.CharField(max_length=16, choices=Trigger.choices)
    score = models.CharField(max_length=8, choices=Score.choices, blank=True, default="")
    direction = models.CharField(max_length=8, choices=Direction.choices, blank=True, default="")
    threshold = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    cadence = models.CharField(max_length=8, choices=Cadence.choices, blank=True, default="")
    weekday = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="0-6, Monday = 0, for a weekly schedule."
    )
    actions = models.JSONField(
        default=list, blank=True, help_text="1-3 action objects; see services/rules/validation.py."
    )
    cooldown_days = models.PositiveSmallIntegerField(default=DEFAULT_COOLDOWN)
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_rules", blank=True
    )
    paused_reason = models.CharField(
        max_length=24,
        choices=Paused.choices,
        blank=True,
        default="",
        help_text="Set when the rule switched itself off; cleared when it is turned on.",
    )
    agent_action = models.ForeignKey(
        "metrics.AgentAction",
        related_name="rules",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The agent action that made this scenario, if one did.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["organisation", "sharing"]),
            models.Index(fields=["is_active"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(cooldown_days__gte=MIN_COOLDOWN, cooldown_days__lte=MAX_COOLDOWN),
                name="rule_cooldown_1_to_365",
            ),
            models.CheckConstraint(
                condition=Q(weekday__isnull=True) | Q(weekday__lte=6),
                name="rule_weekday_0_to_6",
            ),
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Rule {self.pk}"


class RuleState(models.Model):
    """What a rule remembers about one record: last night's score (for
    `crossed`) and the last night it fired (the cooldown). Ids only."""

    rule = models.ForeignKey(Rule, related_name="states", on_delete=models.CASCADE)
    record_kind = models.CharField(max_length=8, choices=KINDS)
    record_id = models.PositiveBigIntegerField()
    last_value = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    last_fired_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["rule", "record_kind", "record_id"], name="one_rule_state_per_record"
            )
        ]

    def __str__(self):
        return f"Rule {self.rule_id}: {self.record_kind} {self.record_id}"


class RuleRun(models.Model):
    """One rule's night. Its counts come from the owner's book."""

    rule = models.ForeignKey(Rule, related_name="runs", on_delete=models.CASCADE)
    run_on = models.DateField()
    matched = models.PositiveIntegerField(default=0)
    fired = models.PositiveIntegerField(default=0)
    skipped = models.JSONField(default=empty_skips, blank=True)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-run_on", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["rule", "run_on"], name="one_rule_run_per_night")
        ]

    def __str__(self):
        return f"Rule run {self.pk}"


class RuleRunRecord(models.Model):
    """One record a night touched: what each action did, or why it was
    skipped. `actions` is `[{action, status, detail}]`; `detail` never holds
    personal data or an exception's text."""

    class Outcome(models.TextChoices):
        FIRED = "fired", "Fired"
        SKIPPED = "skipped", "Skipped"

    run = models.ForeignKey(RuleRun, related_name="records", on_delete=models.CASCADE)
    record_kind = models.CharField(max_length=8, choices=KINDS)
    record_id = models.PositiveBigIntegerField()
    outcome = models.CharField(max_length=8, choices=Outcome.choices)
    reason = models.CharField(max_length=16, blank=True, default="")
    actions = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["outcome", "record_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["run", "record_kind", "record_id"], name="one_rule_run_record_per_record"
            )
        ]

    def __str__(self):
        return f"Rule run {self.run_id}: {self.record_kind} {self.record_id} {self.outcome}"


class RuleReview(models.Model):
    """One night's customer-facing email waiting for the rule's owner: a
    survey (sent through services.surveys) or a campaign (through
    services.campaigns). Approving sends it to the fired records
    (`reviews.py`). A night holds at most one review of each kind."""

    class Kind(models.TextChoices):
        SURVEY = "survey", "Survey"
        CAMPAIGN = "campaign", "Campaign"

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        APPROVED = "approved", "Approved"
        SKIPPED = "skipped", "Skipped"
        EXPIRED = "expired", "Expired"

    rule = models.ForeignKey(Rule, related_name="reviews", on_delete=models.CASCADE)
    run = models.ForeignKey(RuleRun, related_name="reviews", on_delete=models.CASCADE)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.SURVEY)
    action = models.JSONField(help_text="The survey or campaign action's settings, frozen.")
    records = models.JSONField(default=list, help_text="The fired records: [{kind, id}].")
    counts = models.JSONField(
        default=dict,
        blank=True,
        help_text="A survey's {people, records}; a campaign's {reach, skipped}, when made.",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.WAITING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null for a survey a rule sent without review, and for an expiry.",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    result = models.JSONField(
        default=dict,
        blank=True,
        help_text='{"survey_send_id"}, {"campaign_send_id"} or {"error": <the refusal>}.',
    )
    notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the owner got the `rule_review` notice; null until then.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "created_at"])]
        constraints = [
            models.UniqueConstraint(fields=["run", "kind"], name="one_rule_review_per_run_and_kind")
        ]

    @property
    def expires_at(self):
        return self.created_at + timedelta(days=REVIEW_DAYS)

    def __str__(self):
        return f"Rule review {self.pk}"
