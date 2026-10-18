"""The Google scopes Revenact asks for, and what they allow.

`gmail.modify` reads and changes mail but cannot delete it permanently
(no `https://mail.google.com/`); with `gmail.send` and `gmail.compose` it is
everything two-way Gmail needs. Google's per-method tables (checked
2026-10-10) accept gmail.modify for history.list, labels.list, watch,
getProfile, messages.list/get and settings.sendAs.list.
"""

GMAIL = "https://www.googleapis.com/auth/gmail."
MODIFY = GMAIL + "modify"
SEND = GMAIL + "send"
COMPOSE = GMAIL + "compose"
#: All three, or the connection is refused (contract decision 7).
TWO_WAY = (MODIFY, SEND, COMPOSE)
#: Read and write events (services/calendar). Asked for with Gmail, never
#: required for it: a connection without it keeps Gmail and has no Calendar.
CALENDAR_EVENTS = "https://www.googleapis.com/auth/calendar.events"
#: What the consent screen asks for.
REQUESTED = (*TWO_WAY, CALENDAR_EVENTS, "openid", "email", "profile")


def short_names(scopes):
    """The Gmail scopes among `scopes`, by short name ('gmail.modify'), in order."""
    return [scope.rsplit("/", 1)[-1] for scope in scopes or [] if scope.startswith(GMAIL)]


def is_two_way(scopes):
    return set(TWO_WAY) <= set(scopes or [])


def has_calendar(scopes):
    return CALENDAR_EVENTS in (scopes or [])
