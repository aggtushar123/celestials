"""Plans: a run of work, set out over weeks, on one customer.

Spec: react-ts-app docs/superpowers/specs/2026-10-04-plans-design.md. A
`Plan` sits on exactly one organisation or one account and holds ordered
`Milestone`s. Its work is ordinary `customers.Task` rows linked by
`Task.plan` and `Task.milestone`, so every existing task surface keeps
working. A `PlanTemplate` is copied when a plan starts (`starting.py`):
later edits to it never change a running plan. The four built-in templates
have no workspace and no owner, and every workspace reads them
(`builtins.py`).

Unrelated to `billing.Plan`, a workspace's subscription.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation

MAX_MILESTONES = 12
#: Tasks in one plan, and in one template in all.
MAX_TASKS = 50
#: Personal templates one person may own.
MAX_OWNED_TEMPLATES = 50
#: A template is shared by name with at most this many teammates.
MAX_SHARED = 50
MAX_NAME = 120
MAX_DESCRIPTION = 500
#: `customers.Task.title`'s own limit.
MAX_TASK_TITLE = 255
#: A template's offsets, and a plan's dates after its start, in days.
MAX_OFFSET = 365
#: The open statuses: the board's first three columns.
OPEN = ("not_started", "on_track", "at_risk")


class Kind(models.TextChoices):
    ONBOARDING = "onboarding", "Onboarding"
    SUCCESS = "success", "Success plan"
    SAVE = "save", "Save plan"
    QBR = "qbr", "QBR"
    OTHER = "other", "Other"


class Sharing(models.TextChoices):
    PRIVATE = "private", "Only me"
    WORKSPACE = "workspace", "Everyone in the workspace"
    PEOPLE = "people", "Chosen teammates"


class PlanTemplate(models.Model):
    class AssigneeRole(models.TextChoices):
        PLAN_OWNER = "plan_owner", "The plan's owner"
        RECORD_OWNER = "record_owner", "The record's owner"

    organisation = models.ForeignKey(
        Organisation,
        related_name="plan_templates",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Null for a built-in template, which every workspace reads.",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="plan_templates",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=MAX_NAME)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    description = models.CharField(max_length=MAX_DESCRIPTION, blank=True, default="")
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_plan_templates", blank=True
    )
    milestones = models.JSONField(
        default=list,
        blank=True,
        help_text="1-12 milestones with their tasks; see services/plans/validation.py.",
    )
    is_builtin = models.BooleanField(default=False)
    agent_action = models.ForeignKey(
        "metrics.AgentAction",
        related_name="plan_templates",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The agent action that wrote this template, if one did.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        indexes = [models.Index(fields=["organisation", "sharing"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(is_builtin=True, organisation__isnull=True, owner__isnull=True)
                | Q(is_builtin=False, organisation__isnull=False, owner__isnull=False),
                name="plan_template_builtin_has_no_owner",
            )
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Plan template {self.pk}"


class Plan(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        ON_TRACK = "on_track", "On track"
        AT_RISK = "at_risk", "At risk"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"
        #: Not open: an agent's plan that was undone, kept with its tasks as data
        #: (`draft_tasks`) until someone starts it again (`plans.drafting`).
        DRAFT = "draft", "Draft"

    class SetBy(models.TextChoices):
        PERSON = "person", "A person"
        SYSTEM = "system", "The system"

    organisation = models.ForeignKey(Organisation, related_name="plans", on_delete=models.CASCADE)
    customer = models.ForeignKey(
        "customers.Customer",
        related_name="plans",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    account = models.ForeignKey(
        "customers.Account",
        related_name="plans",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    template = models.ForeignKey(
        PlanTemplate,
        related_name="plans",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Kept for reference and the one-open-plan rule; the plan is a copy.",
    )
    name = models.CharField(max_length=MAX_NAME)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="plans_owned", on_delete=models.PROTECT
    )
    start_date = models.DateField()
    target_date = models.DateField(help_text="The latest milestone due date.")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NOT_STARTED)
    status_set_by = models.CharField(max_length=8, choices=SetBy.choices, default=SetBy.SYSTEM)
    at_risk_cleared_on = models.DateField(
        null=True,
        blank=True,
        help_text="When a person last moved the plan from at risk to on track.",
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null when a rule started the plan.",
    )
    started_by_rule = models.ForeignKey(
        "rules.Rule",
        related_name="plans",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    done_at = models.DateTimeField(null=True, blank=True)
    start_figures = models.JSONField(
        null=True,
        blank=True,
        help_text="The record's health score and ARR when the plan started "
        "({health_score, arr, currency, taken_on}); null for plans started before "
        "these were kept. Written once, by plans.starting.",
    )
    draft_tasks = models.JSONField(
        default=list,
        blank=True,
        help_text="A draft plan's tasks, as Start plan makes them again: "
        "[{milestone, title, priority, due_date, assignee, description}]. Empty otherwise.",
    )
    agent_action = models.ForeignKey(
        "metrics.AgentAction",
        related_name="plans",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The agent action that started this plan, if one did.",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["organisation", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(customer__isnull=False, account__isnull=True)
                | Q(customer__isnull=True, account__isnull=False),
                name="plan_belongs_to_exactly_one_record",
            ),
            models.UniqueConstraint(
                fields=["customer", "template"],
                condition=Q(status__in=OPEN, template__isnull=False, customer__isnull=False),
                name="one_open_plan_per_customer_template",
            ),
            models.UniqueConstraint(
                fields=["account", "template"],
                condition=Q(status__in=OPEN, template__isnull=False, account__isnull=False),
                name="one_open_plan_per_account_template",
            ),
        ]

    def __str__(self):
        return f"Plan {self.pk}"


class Milestone(models.Model):
    plan = models.ForeignKey(Plan, related_name="milestones", on_delete=models.CASCADE)
    name = models.CharField(max_length=MAX_NAME)
    position = models.PositiveSmallIntegerField()
    due_date = models.DateField()
    done_at = models.DateTimeField(null=True, blank=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who marked it done by hand; null when its tasks completed it.",
    )

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"Milestone {self.pk}"
