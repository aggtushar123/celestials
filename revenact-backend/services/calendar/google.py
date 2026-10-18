"""Google Calendar API v3, over the Gmail session's token handling."""

from services.mail.providers.google import GmailSession

API = "https://www.googleapis.com/calendar/v3/calendars/primary"
HOSTS = frozenset({"www.googleapis.com", "oauth2.googleapis.com"})


class CalendarSession(GmailSession):
    """The primary calendar of one connection. Refresh and retry are
    GmailSession's; only the base URL and the allowed hosts differ."""

    base = API
    hosts = HOSTS

    def events(self, **params):
        return self._call("GET", "/events", params=params)

    def insert(self, body, **params):
        return self._call("POST", "/events", params=params, data=body)

    def get(self, event_id):
        return self._call("GET", f"/events/{event_id}")
