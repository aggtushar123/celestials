"""Google Calendar (design 2026-10-17-google-calendar-design.md, D1).

Defended: a connection syncs its primary calendar only when calendar.events
was granted; the first pass reads the window and keeps Google's sync token,
later passes are incremental, and a 410 starts the window again; cancelled
events go; a meeting with a customer's people lands on that customer, by
the mail matcher. The owner sees all their meetings; anyone else sees a
meeting only on a customer they can open, and never its description.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from unittest.mock import patch

from django.test import override_settings
from rest_framework import status

from services.accounts.models import User
from services.calendar import sync
from services.calendar.models import CalendarSyncState, Meeting
from services.customers.models import Contact, Customer
from services.mail import scopes
from services.mail.providers.base import ProviderError
from services.mail.tests.gmail_fixtures import GRANTED, GmailFixture

NOW = datetime(2026, 10, 17, 9, 0, tzinfo=dt_timezone.utc)
WITH_CALENDAR = [*GRANTED, scopes.CALENDAR_EVENTS]


def event(event_id, *, attendees=(), status_="confirmed", title="QBR", start=None, **extra):
    start = start or NOW + timedelta(days=1)
    body = {
        "id": event_id,
        "iCalUID": f"{event_id}@google.com",
        "etag": '"1"',
        "status": status_,
        "summary": title,
        "description": "Private prep notes",
        "start": {"dateTime": start.isoformat()},
        "end": {"dateTime": (start + timedelta(minutes=30)).isoformat()},
        "organizer": {"email": "dana@acme.io"},
        "attendees": [{"email": a, "responseStatus": "accepted"} for a in attendees],
        "hangoutLink": "https://meet.google.com/abc-defg-hij",
        "htmlLink": "https://calendar.google.com/event?eid=x",
    }
    body.update(extra)
    return body


class FakeCalendar:
    """Stands in for CalendarSession: pages queued per call, calls recorded."""

    def __init__(self):
        self.pages = []
        self.calls = []

    def __call__(self, creds):
        self.creds = creds
        return self

    def events(self, **params):
        self.calls.append(params)
        page = self.pages.pop(0)
        if isinstance(page, Exception):
            raise page
        return page


class CalendarFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = FakeCalendar()
        patcher = patch("services.calendar.sync.CalendarSession", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        Contact.objects.create(customer=self.pizza, name="Pat", email="pat@pizzahut.com")
        self.connection = self.google(self.dana, granted_scopes=list(WITH_CALENDAR))

    def run_sync(self, *pages, connection=None):
        self.fake.pages.extend(pages)
        return sync.sync_connection(connection or self.connection, now=NOW)


class SyncTests(CalendarFixture):
    def test_first_pass_reads_the_window_and_keeps_the_sync_token(self):
        self.run_sync(
            {
                "items": [event("e1", attendees=["pat@pizzahut.com", "dana@acme.io"])],
                "nextPageToken": "p2",
            },
            {"items": [event("e2", attendees=["carl@acme.io"])], "nextSyncToken": "tok-1"},
        )
        first = self.fake.calls[0]
        self.assertEqual(first["timeMin"], (NOW - timedelta(days=30)).isoformat())
        self.assertEqual(first["timeMax"], (NOW + timedelta(days=90)).isoformat())
        self.assertEqual(first["singleEvents"], "true")
        self.assertEqual(self.fake.calls[1]["pageToken"], "p2")
        qbr = Meeting.objects.get(google_event_id="e1")
        self.assertEqual((qbr.owner, qbr.customer, qbr.account), (self.dana, self.pizza, None))
        self.assertEqual(qbr.meet_url, "https://meet.google.com/abc-defg-hij")
        self.assertEqual(qbr.description, "Private prep notes")
        self.assertIsNone(Meeting.objects.get(google_event_id="e2").customer)
        state = CalendarSyncState.objects.get(connection=self.connection)
        self.assertEqual((state.sync_token, state.synced_at), ("tok-1", NOW))

    def test_later_passes_are_incremental_and_cancelled_events_go(self):
        self.run_sync(
            {"items": [event("e1", attendees=["pat@pizzahut.com"])], "nextSyncToken": "tok-1"}
        )
        self.run_sync(
            {
                "items": [
                    event("e1", status_="cancelled"),
                    event("e3", attendees=["x@apac.pizzahut.com"]),
                ],
                "nextSyncToken": "tok-2",
            }
        )
        self.assertEqual(self.fake.calls[1], {"syncToken": "tok-1"})
        self.assertFalse(Meeting.objects.filter(google_event_id="e1").exists())
        self.assertEqual(Meeting.objects.get(google_event_id="e3").account, self.apac)

    def test_a_410_starts_the_window_again(self):
        self.run_sync({"items": [event("e1")], "nextSyncToken": "tok-1"})
        self.run_sync(
            ProviderError("Sync token is no longer valid", status=410),
            {"items": [event("e9")], "nextSyncToken": "tok-9"},
        )
        self.assertIn("timeMin", self.fake.calls[2])
        self.assertEqual(set(Meeting.objects.values_list("google_event_id", flat=True)), {"e9"})

    def test_attendees_changing_moves_the_meeting(self):
        self.run_sync(
            {"items": [event("e1", attendees=["pat@pizzahut.com"])], "nextSyncToken": "t1"}
        )
        self.run_sync({"items": [event("e1", attendees=["carl@acme.io"])], "nextSyncToken": "t2"})
        self.assertIsNone(Meeting.objects.get(google_event_id="e1").customer)

    def test_all_day_events_keep_their_dates(self):
        body = event("e1")
        body["start"], body["end"] = {"date": "2026-10-20"}, {"date": "2026-10-21"}
        self.run_sync({"items": [body], "nextSyncToken": "t1"})
        meeting = Meeting.objects.get(google_event_id="e1")
        self.assertTrue(meeting.all_day)
        self.assertEqual(meeting.starts_at.date().isoformat(), "2026-10-20")

    def test_a_failure_is_kept_on_the_state_and_raises_nothing(self):
        self.run_sync(ProviderError("Calendar did not answer"))
        state = CalendarSyncState.objects.get(connection=self.connection)
        self.assertIn("did not answer", state.error)
        self.assertIsNone(state.synced_at)


@override_settings(CALENDAR_SYNC_INTERVAL_SECONDS=300)
class DueTests(CalendarFixture):
    def test_only_granted_live_connections_that_are_due(self):
        without = self.google(self.carl)  # Gmail only: no calendar scope
        paused = self.google(
            self.priya, granted_scopes=list(WITH_CALENDAR), paused_reason="no_seat"
        )
        self.assertEqual(list(sync.due(now=NOW)), [self.connection])
        CalendarSyncState.objects.create(
            connection=self.connection, synced_at=NOW - timedelta(seconds=60)
        )
        self.assertEqual(list(sync.due(now=NOW)), [])
        self.assertEqual(list(sync.due(now=NOW + timedelta(seconds=300))), [self.connection])
        del without, paused

    def test_the_mail_tick_syncs_due_calendars(self):
        from core import ticks

        self.fake.pages.append({"items": [event("e1")], "nextSyncToken": "t"})
        with (
            patch("services.mail.loop.Loop.run_once", return_value=0),
            patch("services.calendar.sync.timezone.now", return_value=NOW),
        ):
            summary = ticks.TASKS["mail"]()
        self.assertIn("1 calendar(s) synced", summary)
        self.assertTrue(Meeting.objects.filter(google_event_id="e1").exists())


class ApiTests(CalendarFixture):
    def setUp(self):
        super().setUp()
        self.run_sync(
            {
                "items": [
                    event("cust", attendees=["pat@pizzahut.com"], title="Pizza Hut QBR"),
                    event("mine", attendees=["carl@acme.io"], title="1:1 with Carl"),
                    event("old", start=NOW - timedelta(days=20), attendees=["pat@pizzahut.com"]),
                ],
                "nextSyncToken": "t",
            }
        )

    def test_the_owner_lists_their_meetings_in_a_window(self):
        self.client.force_authenticate(self.dana)
        response = self.client.get(
            "/api/v1/calendar/meetings/",
            {"from": NOW.isoformat(), "to": (NOW + timedelta(days=7)).isoformat()},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        titles = [m["title"] for m in response.data["meetings"]]
        self.assertEqual(sorted(titles), ["1:1 with Carl", "Pizza Hut QBR"])
        mine = next(m for m in response.data["meetings"] if m["title"] == "Pizza Hut QBR")
        self.assertEqual(mine["description"], "Private prep notes")
        self.assertEqual(mine["customer"], {"id": self.pizza.id, "name": "Pizza Hut"})

    def test_a_window_is_required_and_bounded(self):
        self.client.force_authenticate(self.dana)
        for params in (
            {},
            {"from": "nope", "to": NOW.isoformat()},
            {"from": NOW.isoformat(), "to": (NOW + timedelta(days=120)).isoformat()},
        ):
            with self.subTest(params=params):
                response = self.client.get("/api/v1/calendar/meetings/", params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data["error"]["code"], "INVALID_WINDOW")

    def test_colleagues_see_customer_meetings_without_the_description(self):
        self.client.force_authenticate(self.carl)
        response = self.client.get(f"/api/v1/calendar/customers/{self.pizza.id}/meetings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        titles = {m["title"] for m in response.data["meetings"]}
        self.assertEqual(titles, {"Pizza Hut QBR", "QBR"})
        self.assertNotIn("1:1 with Carl", titles)
        for meeting in response.data["meetings"]:
            self.assertNotIn("description", meeting)
            self.assertEqual(meeting["owner"], {"id": self.dana.id, "name": "Dana"})
        own = self.client.get(
            "/api/v1/calendar/meetings/",
            {"from": NOW.isoformat(), "to": (NOW + timedelta(days=7)).isoformat()},
        )
        self.assertEqual(own.data["meetings"], [])

    def test_someone_who_cannot_open_the_customer_gets_nothing(self):
        eve = User.objects.create_user(
            email="eve@acme.io", password="x", name="Eve", organisation=self.org
        )
        other = Customer.objects.create(organisation=self.org, name="Other", owner=eve)
        self.client.force_authenticate(eve)
        response = self.client.get(f"/api/v1/calendar/customers/{self.pizza.id}/meetings/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.get(f"/api/v1/calendar/customers/{other.id}/meetings/").data["meetings"], []
        )

    def test_status_says_whether_calendar_is_granted(self):
        self.client.force_authenticate(self.dana)
        self.assertEqual(self.client.get("/api/v1/calendar/status/").data["calendar"], "connected")
        carl = self.google(self.carl)
        self.client.force_authenticate(self.carl)
        self.assertEqual(
            self.client.get("/api/v1/calendar/status/").data["calendar"], "needs_consent"
        )
        carl.delete()
        self.assertEqual(
            self.client.get("/api/v1/calendar/status/").data["calendar"], "not_connected"
        )


class ScopeTests(GmailFixture):
    def test_calendar_is_asked_for_but_never_required_for_gmail(self):
        self.assertIn(scopes.CALENDAR_EVENTS, scopes.REQUESTED)
        self.assertNotIn(scopes.CALENDAR_EVENTS, scopes.TWO_WAY)
        self.assertTrue(scopes.is_two_way(GRANTED))
        self.assertFalse(scopes.has_calendar(GRANTED))
        self.assertTrue(scopes.has_calendar(WITH_CALENDAR))

    def test_consent_keeps_earlier_grants(self):
        from services.mail.providers.google import GoogleProvider

        with override_settings(GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="s"):
            url = GoogleProvider().authorize_url("st", "https://x/cb/")
        self.assertIn("include_granted_scopes=true", url)
        self.assertIn("calendar.events", url)


class FakeBooking(FakeCalendar):
    """Also answers events.insert (and events.get after a duplicate)."""

    def __init__(self):
        super().__init__()
        self.inserted = []
        self.answer = None
        self.existing = {}

    def insert(self, body, **params):
        self.inserted.append((body, params))
        if isinstance(self.answer, Exception):
            raise self.answer
        created = {
            **body,
            "status": "confirmed",
            "etag": '"9"',
            "iCalUID": f"{body['id']}@google.com",
            "organizer": {"email": "dana@acme.io", "self": True},
            "hangoutLink": "https://meet.google.com/new-meet-ing",
            "htmlLink": "https://calendar.google.com/event?eid=new",
        }
        self.existing[body["id"]] = created
        return created

    def get(self, event_id):
        return self.existing[event_id]


START = (NOW + timedelta(days=1)).isoformat()
END = (NOW + timedelta(days=1, minutes=30)).isoformat()


class BookingTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = FakeBooking()
        patcher = patch("services.calendar.booking.CalendarSession", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.pat = Contact.objects.create(customer=self.pizza, name="Pat", email="pat@pizzahut.com")
        self.kim = Contact.objects.create(
            account=self.apac, name="Kim", email="kim@apac.pizzahut.com"
        )
        self.connection = self.google(self.dana, granted_scopes=list(WITH_CALENDAR))
        self.client.force_authenticate(self.dana)

    def book(self, **overrides):
        body = {
            "customer_id": self.pizza.id,
            "contact_ids": [self.pat.id, self.kim.id],
            "title": "Pizza Hut renewal",
            "starts_at": START,
            "ends_at": END,
            "description": "Agenda: renewal terms",
            "request_id": "req-1",
        }
        body.update(overrides)
        return self.client.post("/api/v1/calendar/meetings/", body, format="json")

    def test_books_on_my_calendar_with_meet_and_google_invites_the_contacts(self):
        from core.models import AuditEvent

        response = self.book()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        body, params = self.fake.inserted[0]
        self.assertEqual(params, {"conferenceDataVersion": 1, "sendUpdates": "all"})
        self.assertEqual(
            sorted(a["email"] for a in body["attendees"]),
            ["kim@apac.pizzahut.com", "pat@pizzahut.com"],
        )
        self.assertEqual(body["summary"], "Pizza Hut renewal")
        self.assertEqual(body["description"], "Agenda: renewal terms")
        self.assertEqual(body["start"], {"dateTime": START})
        self.assertEqual(
            body["conferenceData"]["createRequest"]["conferenceSolutionKey"],
            {"type": "hangoutsMeet"},
        )
        meeting = Meeting.objects.get(owner=self.dana)
        self.assertTrue(meeting.booked_in_revenact)
        self.assertEqual(meeting.customer, self.pizza)
        self.assertEqual(meeting.meet_url, "https://meet.google.com/new-meet-ing")
        self.assertEqual(response.data["meeting"]["id"], meeting.id)
        self.assertEqual(response.data["meeting"]["meet_url"], meeting.meet_url)
        event = AuditEvent.objects.get(action="calendar.meeting_booked")
        self.assertEqual(event.metadata, {"customer": self.pizza.id, "attendees": 2})

    def test_the_same_request_twice_books_once(self):
        first = self.book()
        second = self.book()
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["meeting"]["id"], second.data["meeting"]["id"])
        self.assertEqual(len(self.fake.inserted), 1)
        self.assertEqual(Meeting.objects.count(), 1)

    def test_a_retry_after_google_kept_the_first_reuses_it(self):
        """Google created the event but the answer was lost: the retry's insert
        is a 409 duplicate, and the event Google holds is stored."""
        self.book()
        Meeting.objects.all().delete()
        self.fake.answer = ProviderError("The requested identifier already exists.", status=409)
        response = self.book()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Meeting.objects.count(), 1)

    def test_contacts_must_be_the_customers_and_the_window_sane(self):
        other = Customer.objects.create(organisation=self.org, name="Other", owner=self.dana)
        stranger = Contact.objects.create(customer=other, name="Sam", email="sam@other.com")
        for overrides, code in (
            ({"contact_ids": [stranger.id]}, "CONTACT_NOT_ON_CUSTOMER"),
            ({"ends_at": START}, "INVALID_WINDOW"),
            ({"ends_at": (NOW + timedelta(days=1, hours=9)).isoformat()}, "INVALID_WINDOW"),
            ({"title": " "}, "INVALID"),
            ({"request_id": ""}, "INVALID"),
        ):
            with self.subTest(code=code, overrides=overrides):
                response = self.book(**overrides)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
                self.assertEqual(response.data["error"]["code"], code)
        self.assertEqual(self.fake.inserted, [])

    def test_needs_calendar_granted_a_live_mailbox_and_a_customer_i_can_open(self):
        self.connection.granted_scopes = list(GRANTED)
        self.connection.save(update_fields=["granted_scopes"])
        self.assertEqual(self.book().data["error"]["code"], "CALENDAR_NOT_GRANTED")
        self.connection.granted_scopes = list(WITH_CALENDAR)
        self.connection.save(update_fields=["granted_scopes"])
        self.org.gmail_two_way_enabled = False  # pauses every Google mailbox, live
        self.org.save(update_fields=["gmail_two_way_enabled"])
        paused = self.book()
        self.assertEqual((paused.status_code, paused.data["code"]), (409, "MAILBOX_PAUSED"))
        self.org.gmail_two_way_enabled = True
        self.org.save(update_fields=["gmail_two_way_enabled"])
        eve = User.objects.create_user(
            email="eve@acme.io", password="x", name="Eve", organisation=self.org
        )
        self.google(eve, granted_scopes=list(WITH_CALENDAR))
        self.client.force_authenticate(eve)
        self.assertEqual(self.book().status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.fake.inserted, [])

    def test_google_refusing_is_a_502_and_nothing_is_stored(self):
        self.fake.answer = ProviderError("Calendar usage limits exceeded", status=403)
        response = self.book()
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data["error"]["code"], "GOOGLE_REFUSED")
        self.assertFalse(Meeting.objects.exists())
