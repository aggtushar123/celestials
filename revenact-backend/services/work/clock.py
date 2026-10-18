"""What "today" and "a working day" are for a workspace's Work lists (spec
§3.2 Timezone): the date in the workspace's own timezone, and its own
working days (`WorkSettings`). Every Work route, job and default asks here.
Brain and the other sections keep the server's date."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

#: Monday (0) to Friday (4).
WORKING_DAYS = (0, 1, 2, 3, 4)
UTC_ZONE = ZoneInfo("UTC")


def _prefs(organisation):
    from .prefs import settings_for

    return settings_for(organisation)


def zone(prefs):
    """The settings' timezone; UTC for a name this server does not know."""
    try:
        return ZoneInfo(prefs.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return UTC_ZONE


def zone_for(organisation):
    return zone(_prefs(organisation))


def local_now(organisation, now=None):
    return (now or timezone.now()).astimezone(zone_for(organisation))


def today_for(organisation, now=None):
    return local_now(organisation, now).date()


def working(prefs):
    """The settings' working days as a sorted tuple; the default if none."""
    days = prefs.working_days if isinstance(prefs.working_days, list) else []
    return tuple(sorted({d for d in days if isinstance(d, int) and 0 <= d <= 6})) or WORKING_DAYS


def working_days_for(organisation):
    return working(_prefs(organisation))


def start_of_day(organisation, day):
    """The instant `day` begins in the workspace's timezone."""
    return datetime.combine(day, time.min, tzinfo=zone_for(organisation))


def add_working_days(day, count, working_days=WORKING_DAYS):
    """`count` working days after `day`; `day` itself never counts."""
    days = working_days or WORKING_DAYS
    while count > 0:
        day += timedelta(days=1)
        if day.weekday() in days:
            count -= 1
    return day


def working_days_between(start, end, working_days=WORKING_DAYS):
    """How many working days `d` there are with `start < d <= end`."""
    days = working_days or WORKING_DAYS
    count, day = 0, start
    while day < end:
        day += timedelta(days=1)
        if day.weekday() in days:
            count += 1
    return count
