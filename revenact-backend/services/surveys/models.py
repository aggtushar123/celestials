"""Surveys: one scored question emailed to the people at a segment's
records, answered once through a one-time link.

Spec: react-ts-app docs/superpowers/specs/2026-10-03-surveys-design.md.
`SurveySend` is one survey sent to one audience; `SurveyInvite` is one
person asked once. The token in the link is never stored, only its SHA-256
(`tokens.py`). Answers feed the organisation's and account's NPS, CSAT and
CES as a rolling 90-day figure, and one `customers.Survey` log row per send
and record (`scores.py`).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation
from services.customers.models import Account, Contact, Customer, Survey

#: A link works for this many days after the send starts, and takes one answer.
LINK_DAYS = 14
#: Anyone asked in this many days, by any survey, is skipped.
QUIET_DAYS = 30
#: A record's score is the figure over its answers in this many days.
WINDOW_DAYS = 90
#: An organisation or account segment asks at most this many people per record.
PER_RECORD_CAP = 3
#: One send reaches at most this many people.
MAX_PEOPLE = 500
#: One owner may start at most this many sends a day.
DAILY_SENDS = 20
#: A send is shared by name with at most this many teammates.
MAX_SHARED = 50
#: An invite taken but never marked this long after its send started is
#: taken to be from a worker that died (`sending.resume`).
STALE_MINUTES = 10


class SurveySend(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"

    class Sharing(models.TextChoices):
        PRIVATE = "private", "Only me"
        WORKSPACE = "workspace", "Everyone in the workspace"
        PEOPLE = "people", "Chosen teammates"

    organisation = models.ForeignKey(
        Organisation, related_name="survey_sends", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="survey_sends", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=120)
    survey_type = models.CharField(max_length=8, choices=Survey.SurveyType.choices)
    subject = models.CharField(max_length=120)
    intro = models.CharField(max_length=500, blank=True, default="")
    segment = models.ForeignKey(
        "segments.Segment",
        related_name="survey_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who it goes to. The send keeps its invites if the segment is deleted.",
    )
    roles = models.JSONField(
        default=list,
        blank=True,
        help_text="Contact.Role values, in the order ticked. Empty for a contact segment.",
    )
    #: Slack bundles (`survey.record`): a survey of one record's people, with
    #: no segment. Both empty for every segment survey.
    customer = models.ForeignKey(
        Customer, related_name="survey_sends", on_delete=models.CASCADE, null=True, blank=True
    )
    account = models.ForeignKey(
        Account, related_name="survey_sends", on_delete=models.CASCADE, null=True, blank=True
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    rule = models.ForeignKey(
        "rules.Rule",
        related_name="survey_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The rule whose review sent it, if any: carried on its audit rows.",
    )
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_survey_sends", blank=True
    )
    started_at = models.DateTimeField(
        null=True, blank=True, help_text="When the send was claimed; links expire from here."
    )
    sent_at = models.DateTimeField(null=True, blank=True, help_text="When the batch finished.")
    counts = models.JSONField(
        default=dict,
        blank=True,
        help_text="{audience, sent, failed, skipped_recent, skipped_no_email, skipped_cap}, "
        "frozen when the batch finishes.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "sharing"]),
            models.Index(fields=["owner", "started_at"]),
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Survey send {self.pk}"


class SurveyInvite(models.Model):
    """One person asked once. "Expired" is derived from `expires_at`, never
    stored. `customer`/`account` are copied from the contact at send time:
    the record the answer scores, and the record whose visibility rule the
    answer follows, even after the contact is deleted."""

    class Status(models.TextChoices):
        #: Claimed, not emailed yet: `deliver_pending` emails it.
        QUEUED = "queued", "Queued"
        PENDING = "pending", "Pending"
        FAILED = "failed", "Failed"
        ANSWERED = "answered", "Answered"

    send = models.ForeignKey(SurveySend, related_name="invites", on_delete=models.CASCADE)
    contact = models.ForeignKey(
        Contact, related_name="survey_invites", on_delete=models.SET_NULL, null=True, blank=True
    )
    customer = models.ForeignKey(
        Customer, related_name="survey_invites", on_delete=models.CASCADE, null=True, blank=True
    )
    account = models.ForeignKey(
        Account, related_name="survey_invites", on_delete=models.CASCADE, null=True, blank=True
    )
    email = models.EmailField()
    token_hash = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        help_text="Null while queued and not yet taken; written by the worker that emails it.",
    )
    taken_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When a worker took it to email; `resume` judges a stuck take by this.",
    )
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    failure = models.CharField(max_length=200, blank=True, default="")
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(max_length=2000, blank=True, default="")
    answered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(customer__isnull=False, account__isnull=True)
                | Q(customer__isnull=True, account__isnull=False),
                name="survey_invite_belongs_to_exactly_one_parent",
            ),
            models.CheckConstraint(
                condition=Q(score__isnull=True) | Q(score__gte=0, score__lte=10),
                name="survey_invite_score_0_to_10",
            ),
            models.CheckConstraint(
                condition=~Q(status="answered") | Q(score__isnull=False, answered_at__isnull=False),
                name="survey_invite_answer_has_score_and_time",
            ),
        ]
        indexes = [
            models.Index(fields=["contact", "created_at"]),
            models.Index(fields=["customer", "answered_at"]),
            models.Index(fields=["account", "answered_at"]),
        ]

    def __str__(self):
        return f"Survey invite {self.pk}"
