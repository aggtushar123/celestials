# Work, delivery 3 ("tracking that pushes"): API contract

Backend plan: `docs/superpowers/plans/2026-10-08-work-tracking-backend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md` §3 (with §4 to §6 as they apply).
Every path is under `/api/v1/`, every route is `IsAuthenticated`, every body is JSON. Dates are
`YYYY-MM-DD`; timestamps are ISO 8601 UTC as DRF writes them. Delivery 1's and delivery 2's
shapes (TaskRow, Event, RecommendationRow, WorkSettings) are unchanged except where this file
says so.

## "Today" moves to the workspace

Every Work route's "today" (and so "overdue", "due today", "this week", the defaults Assign
prefills, and the Recommended badge) is now the date **in the workspace's timezone**
(`WorkSettings.timezone`, default `UTC`), and "working day" is one of the workspace's
`working_days` (default Monday to Friday). `GET /work/today/`'s `today` field already says which
date the server used; the frontend never computes "today" itself.

Brain, Organizations and every other section keep the server's date (UTC). Only Work moves.

## `GET /work/settings/` (any member) gains

Every member reads every field, `email_ready` included; only `can_edit` differs.

```json
{
  "recommend_to": "manager",
  "sources": {"...": "unchanged"},
  "dismiss_cooldown_days": 14,
  "timezone": "Asia/Kolkata",
  "working_days": [0, 1, 2, 3, 4],
  "escalate_after_days": 2,
  "digest_enabled": true,
  "digest_hour": 8,
  "email_ready": false,
  "can_edit": true
}
```

- `timezone`: an IANA name (`zoneinfo.available_timezones()`), default `"UTC"`. `"UTC"` is
  always accepted (a browser's own list may leave it out; the server may refuse a name the
  browser offers, with the message below).
- `working_days`: weekday numbers, Monday `0` to Sunday `6`, ascending, no repeats, at least one.
- `escalate_after_days`: whole number, 1 to 30, default 2. Counted in working days overdue.
- `digest_enabled`: boolean, default `true`.
- `digest_hour`: whole number, 0 to 23, default 8. Local hour in `timezone`.
- `email_ready`: read only. `false` when the server cannot send email (its `EMAIL_BACKEND` is
  the console or dummy backend): digests are skipped. Show "Email isn't set up on this server
  yet: digests are skipped" beside the digest switch when it is `false`.

## `PATCH /work/settings/` (manage_org_settings) accepts

Any subset of the fields above except `email_ready` and `can_edit` (ignored if sent, like every
unknown key). As before: 403 without `manage_org_settings`, 400 with every problem at once,
a value equal to what is stored is not a change, and the response is the GET shape.

| field | refused with (400, `{field: [message]}`) |
|---|---|
| `timezone` | `"Choose a timezone from the list."` (not a string, or not an IANA name) |
| `working_days` | `"Choose at least one working day."` (not a list, empty, or any item not a whole number 0 to 6) |
| `escalate_after_days` | `"Choose a whole number from 1 to 30."` |
| `digest_enabled` | `"Choose on or off."` |
| `digest_hour` | `"Choose a whole number from 0 to 23."` |

`working_days` is stored sorted with repeats removed: `[4, 0, 0]` saves as `[0, 4]`.

## `GET /auth/me/` and `PATCH /auth/me/` gain `digest_opt_out`

```json
{"...": "the existing profile", "digest_opt_out": false}
```

A person's own switch: `true` means no daily digest for them, whatever the workspace says.
Writable by the person on their own profile only. Nothing in the UI sets it yet (account
settings are a later round); the field exists so it can.

## Notifications: two new kinds

`Notification.kind` gains `task_overdue` and `task_escalated`. Both link to the task panel:
`/work/today?task=<id>` (the same link as `task_assigned`).

**`task_overdue`**, to the task's assignee, at most once per task per day (the workspace's local
date), on the
workspace's working days only, while the task is open, past due and not Blocked:

- Can open the record: `“Call Pizza Hut” on Pizza Hut is 2 days overdue.` (`1 day overdue`
  for one day).
- Cannot: `A task on an organisation you can't open is overdue.` /
  `A task on an account you can't open is overdue.`

**`task_escalated`**, once per task, to the assignee's active manager (`reports_to`), else the
workspace's owner, once the task is `escalate_after_days` working days overdue (straight away
when its assignee is deactivated):

- Can open the record: `“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days
  overdue.`
- Cannot: `A task assigned to Carl CSM on an organisation you can't open is overdue.` /
  `... on an account you can't open is overdue.`

`actor` is `null` for both (Revenact). The existing `task_assigned` and
`recommendations_waiting` are unchanged, except that "told already today" for
`recommendations_waiting` is now today in the workspace's timezone.

## Task events: `nudged` and `escalated` get written

Delivery 1 already defines both kinds; delivery 3 is the first to write them. `actor` is
`null` (Revenact).

```json
{"id": 41, "kind": "nudged", "actor": null, "data": {"days_overdue": 2, "to": {"id": 3, "name": "Carl CSM"}}, "body": "", "created_at": "..."}
{"id": 42, "kind": "escalated", "actor": null, "data": {"working_days_overdue": 2, "to": {"id": 2, "name": "Mona Manager"}}, "body": "", "created_at": "..."}
```

Trail sentences: `Revenact reminded Carl CSM: 2 days overdue.` and
`Revenact told Mona Manager: 2 working days overdue.` (one day: `1 day overdue`,
`1 working day overdue`).

An escalation happens once. Reassigning the task, changing its due date or re-opening a
completed task makes it eligible to escalate again (no event is written for that).

## The daily digest (email, no API)

Once a day per person, after `digest_hour` in the workspace's timezone, on its working days, to
every active member with an email who has not set `digest_opt_out`, while the workspace has
`digest_enabled` and the server is `email_ready`. Only when there is something to report.
Plain text:

```
Subject: Your work for Thu 8 Oct: 2 overdue, 1 due today

2 overdue
1 due today
3 recommendations waiting
1 blocked

Overdue
- Call Pizza Hut (Pizza Hut), due 6 Oct
- Taco Bell review (Taco Bell), due 5 Oct
Due today
- Prep the Dough Co QBR (Dough Co)

Open Work: https://<FRONTEND_URL>/work/today

You get this because daily digests are on for your workspace.
```

Counts and items come from the reader's own `GET /work/today/` and
`GET /work/recommendations/` (their default scope), so they never name what the reader cannot
open. At most 5 items are named (overdue first, then due today). Zero lines are left out; the
subject lists only the non-zero overdue and due-today counts, or `"3 recommendations waiting"`
when only those exist.

No route changes for the digest.
