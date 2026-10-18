"""Book a meeting from Revenact (design §API, delivery 3).

On the booker's own primary calendar, through their Google connection, with
a Meet link (conferenceData.createRequest) and Google emailing the invites
(sendUpdates=all, owner decision 3). The invitees are contacts of the
customer or of its accounts, never a free-typed address.

Exactly once: the Google event id is derived from the booker and the
client's request_id, so a retry finds the stored meeting, or, when Google
kept the first insert but its answer was lost, gets Google's 409 duplicate
and stores the event Google holds.
"""

import hashlib
from datetime import timedelta

from django.db.models import Q

from core import audit
from services.customers.models import Contact
from services.mail.providers.base import ProviderError
from services.mail.sync import _credentials, _store

from .google import CalendarSession
from .models import Meeting
from .sync import apply_event

MAX_LENGTH = timedelta(hours=8)


class BookingRefused(Exception):
    def __init__(self, code, message, http_status=400):
        super().__init__(message)
        self.code, self.message, self.http_status = code, message, http_status


def event_id(user, request_id):
    """Google accepts lowercase base32hex ids of 5-1024 characters; hex is a subset."""
    return hashlib.sha256(f"revenact:{user.pk}:{request_id}".encode()).hexdigest()[:40]


def invitees(customer, contact_ids):
    """The customer's (or its accounts') contacts named, with an address."""
    contacts = list(
        Contact.objects.filter(pk__in=contact_ids)
        .filter(Q(customer=customer) | Q(account__customers=customer))
        .exclude(email="")
        .distinct()
    )
    if len(contacts) != len(set(contact_ids)):
        raise BookingRefused("CONTACT_NOT_ON_CUSTOMER", "Invite only this customer's contacts.")
    return contacts


def book(
    *,
    connection,
    user,
    customer,
    contacts,
    title,
    starts_at,
    ends_at,
    description,
    request_id,
    request=None,
):
    """The stored Meeting, booked once. Raises BookingRefused. `contacts` are
    anyone with `email` and `name`: a customer's contacts, or colleagues for a
    meeting the email agent proposed (then `customer` may be None, or an
    Account)."""
    if ends_at <= starts_at or ends_at - starts_at > MAX_LENGTH:
        raise BookingRefused("INVALID_WINDOW", "End after the start, at most 8 hours later.")
    google_id = event_id(user, request_id)
    existing = Meeting.objects.filter(connection=connection, google_event_id=google_id).first()
    if existing is not None:
        return existing

    body = {
        "id": google_id,
        "summary": title,
        "description": description,
        "start": {"dateTime": starts_at.isoformat()},
        "end": {"dateTime": ends_at.isoformat()},
        "attendees": [{"email": c.email, "displayName": c.name} for c in contacts],
        "conferenceData": {
            "createRequest": {
                "requestId": google_id,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    session = CalendarSession(_credentials(connection))
    try:
        try:
            created = session.insert(body, conferenceDataVersion=1, sendUpdates="all")
        except ProviderError as exc:
            if exc.status != 409:
                raise
            created = session.get(google_id)  # Google kept the first attempt.
    except ProviderError as exc:
        raise BookingRefused(
            "GOOGLE_REFUSED", f"Google Calendar refused the booking: {exc}"[:300], 502
        ) from exc
    finally:
        _store(connection, session.creds)
        connection.save(update_fields=["credentials", "address"])

    apply_event(connection, created)
    meeting = Meeting.objects.get(connection=connection, google_event_id=google_id)
    # Booked on this record, whichever contact the matcher reached first.
    if customer is not None:
        from services.customers.models import Account

        is_account = isinstance(customer, Account)
        meeting.customer = None if is_account else customer
        meeting.account = customer if is_account else None
    meeting.booked_in_revenact = True
    meeting.save(update_fields=["customer", "account", "booked_in_revenact", "updated_at"])
    audit.record(  # SOC2:LOG-01 counts only: no title, no addresses
        "calendar.meeting_booked",
        request=request,
        actor=user,
        organisation=connection.organisation,
        target=meeting,
        metadata={"customer": getattr(customer, "id", None), "attendees": len(contacts)},
    )
    return meeting
