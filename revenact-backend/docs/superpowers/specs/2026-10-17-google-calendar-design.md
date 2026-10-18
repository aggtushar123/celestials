# Google Calendar: read meetings, book meetings (design, 2026-10-17)

Owner request: "connect Google Workspace end to end": Gmail two-way, Sign in
with Google, and Google Calendar (read + create meetings). Gmail and sign-in
already exist; Calendar is new. Workspace: Alfred on `tryalfred.onworkspace.com`.

## Owner decisions (2026-10-17)

1. **Read + create.** Sync each person's meetings, and book meetings from Revenact with a Meet link.
2. **Visibility.** A meeting with a customer's people is shown on that customer's timeline to anyone who can see the customer: title, time, organizer, attendee count, Meet link. Never the description or invite notes. Every other meeting stays visible only to its owner (their Scheduled card).
3. **Invites.** Booking picks contacts of the customer; Google Calendar emails them the invite (sendUpdates=all) from the booker's own calendar.

## Defaults chosen (no objection raised)

- **One Google consent.** `calendar.events` joins the scopes the Google connection asks for. It is *not* required for Gmail: a connection without it keeps working, and Calendar features check `granted_scopes`. People already connected see "Add Calendar", which reruns consent with `include_granted_scopes=true`.
- **Primary calendar only**, events from 30 days back to 90 days ahead.
- **Polling, no push channels yet.** Calendar syncs on the existing per-minute `mail` tick, each connection at most every `CALENDAR_SYNC_INTERVAL_SECONDS` (300). Incremental with Google's `syncToken`; a 410 restarts a full window sync. No Terraform change.

## Model: `services/calendar` (new app)

`Meeting`
- `organisation`, `owner` (user), `connection` (MailboxConnection, cascade)
- `google_event_id` (unique with connection), `ical_uid`, `etag`
- `title` (≤255), `description` (owner-only, ≤5000), `location` (≤255)
- `starts_at`, `ends_at` (tz-aware), `all_day`, `status` (confirmed / tentative / cancelled)
- `organizer_email`, `attendees` JSON: `[{email, name, response, organizer, self}]`
- `meet_url`, `html_link`
- `customer`, `account` (nullable, set by `services.mail.sync.match_parent` over external attendee addresses)
- `booked_in_revenact` (bool), timestamps

`CalendarSyncState` per connection: `sync_token`, `synced_at`, `error`.

Cancelled events are deleted locally. An event moves on or off a customer when its attendees change.

## Visibility (decision 2)

`services/calendar/visibility.py`, one function each, used by every read:
- **Owner** sees all their meetings, all fields.
- **Others** see a meeting only if it has a customer/account they can see (existing customer scoping) — and then only the shared fields. The description never leaves the owner.
- Copilot, search and Work do not read meetings in this round, so no AI path can reach one. When they do, they follow this rule and the cross-path privacy test gains a meeting canary.

## API (`/api/v1/calendar/`)

| Call | Who | What |
|---|---|---|
| `GET meetings/?from=&to=` | any member | Caller's own meetings in the window (Scheduled card) |
| `GET customers/<id>/meetings/` | can see the customer | Shared fields of meetings on that customer or its accounts, every owner |
| `POST meetings/` `{customer_id, contact_ids[], title, starts_at, ends_at, description?, meet: true}` | caller with `calendar.events` granted and a seat | Books on the caller's calendar via `events.insert` with `conferenceData.createRequest` and `sendUpdates=all`; contacts must belong to that customer; stores the Meeting at once. Audited `calendar.meeting_booked {customer, attendees: n}` — no title, no addresses |
| `GET status/` | any member | `{calendar: connected / needs_consent / not_connected, last_synced_at}` |

Errors: `CALENDAR_NOT_GRANTED`, `CONTACT_NOT_ON_CUSTOMER`, `INVALID_WINDOW` (end before start, longer than 8 h), `GOOGLE_REFUSED`. Booking is the person's own act (no approval), and it is idempotent on a client `request_id`.

## Frontend

- **Scheduled card** (Work, Communications, account settings): today and the next 7 days of the person's meetings, merged with dated tasks and to-dos, with a Meet "Join" link.
- **Customer timeline**: the existing Calendar Events filter reads real meetings, alongside seeded `CalendarEvent` rows.
- **Schedule meeting** on a customer and on a contact: title, date, start/end, contacts (the customer's), note → Google invites them.
- **Connections → Google card**: Calendar row with *Connected* / *Add Calendar*.

## Deliveries

1. **D1 backend: sync and read.** Scope, app, sync on the tick, matching, visibility, read endpoints, privacy test.
2. **D2 frontend: read.** Scheduled card, customer timeline, Connections row.
3. **D3 booking.** Backend `POST meetings/` + frontend Schedule meeting.

Owner console step (all deliveries): enable **Google Calendar API** in the OAuth client's project and add the `calendar.events` scope under Data access.

## Out of scope

Push channels (`events.watch`), other calendars, editing or cancelling from Revenact, room booking, Outlook calendars, agents booking meetings.
