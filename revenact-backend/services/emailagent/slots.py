"""The earliest time everyone asked is free (owner decision 4).

From the attendees' synced Google Calendar meetings (services/calendar): the
next 5 working days, 09:00-18:00 in the workspace's own time zone, on the
half hour, the first `length` minutes nobody is busy. Urgent looks from now;
otherwise from the next working morning. Attendees without Calendar count as
free, and are named so the approver knows.
"""

from datetime import datetime, time, timedelta

from services.calendar.models import Meeting
from services.mail import scopes
from services.mail.models import MailboxConnection
from services.work import clock

DAY_START, DAY_END = time(9, 0), time(18, 0)
DAYS = 5
STEP = timedelta(minutes=30)


def calendar_people(users):
    """The attendees whose Google connection holds Calendar."""
    ids = set(
        MailboxConnection.objects.filter(
            user__in=users,
            provider=MailboxConnection.Provider.GOOGLE,
            granted_scopes__contains=[scopes.CALENDAR_EVENTS],
        )
        .exclude(status=MailboxConnection.Status.DISCONNECTED)
        .values_list("user_id", flat=True)
    )
    return [u for u in users if u.pk in ids]


def _ceil(moment):
    """Up to the next half hour."""
    floor = moment.replace(minute=0, second=0, microsecond=0)
    while floor < moment:
        floor += STEP
    return floor


def free_slot(organisation, users, *, length_minutes=30, urgent=False, now):
    """(start, [attendees with no Calendar]) — start is None when the week is full."""
    zone = clock.zone_for(organisation)
    working = clock.working_days_for(organisation)
    known = calendar_people(users)
    unknown = [u for u in users if u not in known]
    length = timedelta(minutes=length_minutes)
    local = now.astimezone(zone)
    if urgent:
        day, earliest = local.date(), _ceil(local + timedelta(minutes=15))
    else:
        day = clock.add_working_days(local.date(), 1, working)
        earliest = datetime.combine(day, DAY_START, tzinfo=zone)
    end_of_search = datetime.combine(
        clock.add_working_days(day, DAYS, working), DAY_END, tzinfo=zone
    )
    busy = list(
        Meeting.objects.filter(owner__in=known, starts_at__lt=end_of_search, ends_at__gt=earliest)
        .exclude(all_day=True)
        .values_list("starts_at", "ends_at")
    )
    checked = 0
    while day and checked <= DAYS:
        if day.weekday() in working:
            start = max(earliest, datetime.combine(day, DAY_START, tzinfo=zone))
            close = datetime.combine(day, DAY_END, tzinfo=zone)
            while start + length <= close:
                if not any(s < start + length and e > start for s, e in busy):
                    return start, unknown
                start += STEP
            checked += 1
        day = day + timedelta(days=1)
    return None, unknown
