"""People's Google Calendar meetings (design 2026-10-17-google-calendar-design.md).

A Meeting is one event on a person's primary calendar, synced through their
Google connection when it holds calendar.events. `customer`/`account` are set
when an attendee belongs to one (services.mail.sync.match_parent), and only
then do colleagues see it, and never its description (services/calendar/views.py).
"""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation
from services.customers.models import Account, Customer
from services.mail.models import MailboxConnection


class Meeting(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        TENTATIVE = "tentative", "Tentative"

    organisation = models.ForeignKey(
        Organisation, related_name="meetings", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="meetings", on_delete=models.CASCADE
    )
    connection = models.ForeignKey(
        MailboxConnection, related_name="meetings", on_delete=models.CASCADE
    )
    google_event_id = models.CharField(max_length=1024)
    ical_uid = models.CharField(max_length=1024, blank=True)
    etag = models.CharField(max_length=128, blank=True)
    title = models.CharField(max_length=255, blank=True)
    # SOC2:DATA-01 confidential: the owner's own notes; never serialised for anyone else.
    description = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CONFIRMED)
    organizer_email = models.EmailField(blank=True)
    attendees = models.JSONField(
        default=list, blank=True, help_text="[{email, name, response, organizer, self}]"
    )
    meet_url = models.URLField(max_length=512, blank=True)
    html_link = models.URLField(max_length=1024, blank=True)
    customer = models.ForeignKey(
        Customer, related_name="meetings", null=True, blank=True, on_delete=models.SET_NULL
    )
    account = models.ForeignKey(
        Account, related_name="meetings", null=True, blank=True, on_delete=models.SET_NULL
    )
    booked_in_revenact = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "google_event_id"], name="meeting_unique_per_connection"
            )
        ]
        indexes = [models.Index(fields=["owner", "starts_at"])]

    def __str__(self):
        return f"{self.title or 'Meeting'} ({self.starts_at:%Y-%m-%d %H:%M})"


class CalendarSyncState(models.Model):
    """Where a connection's calendar sync stands: Google's sync token, when it
    last finished, and the last failure (a message, never event content)."""

    connection = models.OneToOneField(
        MailboxConnection, related_name="calendar_state", on_delete=models.CASCADE
    )
    sync_token = models.CharField(max_length=1024, blank=True)
    synced_at = models.DateTimeField(null=True, blank=True)
    error = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
