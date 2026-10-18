"""The Brain's own records: each scope's history.

Company's history is `metrics.MetricSnapshot`, unchanged. A Me or My team
scope's figures are recomputed over its own book (services/brain/metrics.py),
so they cannot be read off the whole organisation's rows: they are kept
here, one row per scope per day — at each month-end, and as a baseline the
first time a scope is viewed or after its team changed.

What writes one brief or explanation at a time per scope is no longer a
row here: it is a session-level Postgres advisory lock
(services/brain/locks.py), taken and released outside any transaction so
holding it across a real model call never also holds open a database
transaction.
"""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation


class ScopeSnapshot(models.Model):
    class Kind(models.TextChoices):
        MONTH_END = "month_end", "Month end"
        BASELINE = "baseline", "Baseline"

    organisation = models.ForeignKey(
        Organisation, related_name="scope_snapshots", on_delete=models.CASCADE
    )
    scope_key = models.CharField(max_length=32, help_text='"me:12" or "team:12".')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="The person the scope belongs to.",
    )
    taken_on = models.DateField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    reason = models.CharField(
        max_length=16,
        blank=True,
        help_text='Why a baseline was written: "first_view" or "team_changed". Blank on a '
        "month-end.",
    )
    owner_ids = models.JSONField(default=list, help_text="The owners the scope covered.")
    customer_ids = models.JSONField(
        default=list, help_text="Every customer in the book then, archived and churned too."
    )
    values = models.JSONField(default=dict, help_text="{metric key: number | null}")
    slices = models.JSONField(
        default=dict, help_text="{metric key: {dimension: {member: number | null}}}"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "scope_key", "taken_on"],
                name="scopesnapshot_one_per_scope_day",
            )
        ]
        indexes = [
            models.Index(
                fields=["organisation", "scope_key", "-taken_on"], name="brain_scope_latest"
            )
        ]

    def __str__(self):
        return f"ScopeSnapshot {self.scope_key} @ {self.taken_on}"
