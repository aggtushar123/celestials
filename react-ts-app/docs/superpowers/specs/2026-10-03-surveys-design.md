# Surveys: an emailed one-time link to a hosted, scored form

Agreed with the owner on 2026-10-03. Delivery 2 of the Impact section (see
`2026-10-03-segments-design.md` §0 for the who → when → what loop and the
build order).

## 0. Why

Segments decide who. A survey is the first "what": ask the people at a
segment's organisations, accounts or contacts one standard question and feed
the answers straight into the scores the product already reads (NPS, CSAT,
CES on organisations and accounts, the Organisations Health tooltip, the
`/surveys` charts).

What exists today (2026-10-03):

- `services/customers` `Survey` (`models.py` ~2381) is a **logged outcome**:
  staff "Log Survey" with an aggregate score (NPS −100..100, CSAT/CES 0..100 %)
  against exactly one organisation or account. Saving one as `responded`
  overwrites that record's `nps_score` / `csat_score` / `ces_percentage`.
  `/surveys` (`pages/surveys/SurveysPage.tsx`) lists, charts and edits these.
- Nothing is ever sent. There is no question, no form, no token, no public
  page.
- The Review Queue (`services/metrics` `Proposal`, `/brain/review`) holds AI
  proposals only. No outbound send goes through approval.
- Email goes out through `services/email.py` (`send_mail`, one shared sender,
  `DEFAULT_FROM_EMAIL`).
- `services/segments/evaluate.py` `members_queryset(segment, user, today=)`
  resolves a segment's members for a viewer. Nothing sends to a segment yet.

## Decisions (agreed 2026-10-03)

| Topic | Decision |
|---|---|
| Content | One scored question, chosen by type, plus an optional "Anything to add?" comment. NPS 0–10, CSAT 1–5, CES 1–7. The wording is the standard one for the type, with the organisation's name in it; the builder writes only the email subject and an optional intro line. |
| Audience | Any of the builder's segments. A contact segment sends to its contacts. An organisation or account segment sends to the contacts at each member, filtered by the roles the builder ticks, at most 3 per organisation or account. |
| Review | A send started by hand is confirmed in the modal (who it reaches, the preview, then Send). The approval queue and "send without review" arrive with Scenarios v2, which triggers sends automatically. |
| Scores | An organisation's (and account's) score becomes a rolling 90-day figure over all live answers: NPS = % promoters (9–10) − % detractors (0–6); CSAT = % answering 4–5; CES = % answering 5–7. |
| Fatigue and expiry | A link works for 14 days and takes one answer. Anyone surveyed in the last 30 days, by any survey, is skipped. No reminder emails in this delivery. |
| Who builds | Anyone, on their own book: their own segments, and only people they may open. Sends are private or shared like segments. |

## 1. Backend: `services/surveys` (new app)

### 1.1 Models

**`SurveySend`**: one survey sent to one audience.

| Field | Notes |
|---|---|
| `organisation` | Tenant FK, as every model. |
| `owner` | The builder (FK User). Only the owner edits, sends or deletes. |
| `name` | ≤ 120 chars, required. |
| `survey_type` | `nps` / `csat` / `ces` (reuse `customers.Survey.SurveyType`). |
| `subject` | ≤ 120 chars, required. |
| `intro` | ≤ 500 chars, optional, plain text. |
| `segment` | FK `segments.Segment`, `SET_NULL` (the send keeps its invites if the segment is deleted). Required to send. |
| `roles` | JSON list of `Contact.Role` values; required (≥ 1) for organisation and account segments, ignored for contact segments. |
| `status` | `draft` / `sending` / `sent`. |
| `sharing`, `shared_with` | As `Segment`: `private` / `workspace` / `people` (≤ 50 active teammates). |
| `sent_at` | Set when the send finishes. |
| `counts` | JSON: `{audience, sent, failed, skipped_recent, skipped_no_email, skipped_cap}` frozen at send time. |

**`SurveyInvite`**: one person asked once.

| Field | Notes |
|---|---|
| `send` | FK `SurveySend`, `CASCADE`. |
| `contact` | FK `customers.Contact`, `SET_NULL` (a deleted contact keeps the answer, unnamed). |
| `customer`, `account` | Exactly one, copied from the contact at send time (the record the answer scores). |
| `email` | The address it went to. |
| `token_hash` | SHA-256 hex of the token, unique. The token itself is never stored. |
| `expires_at` | `sent_at + 14 days`. |
| `status` | `pending` / `failed` / `answered`. "Expired" is derived from `expires_at`, never stored. |
| `failure` | ≤ 200 chars, the send error for `failed`. |
| `score` | The raw answer (0–10, 1–5 or 1–7) once answered. |
| `comment` | ≤ 2000 chars, plain text, optional. |
| `answered_at` | Set once. |

Indexes: `(contact, created_at)` for the 30-day quiet period;
`(customer, answered_at)` and `(account, answered_at)` for the 90-day figure.

### 1.2 Audience resolution (`audience.py`)

`resolve(send, viewer, today) -> Audience` is the single function behind the
preview count and the send itself (the send calls it again; it never trusts
the client's list):

1. The segment's members for the viewer: `members_queryset(segment, viewer,
   today=today)`. The segment must be the viewer's own (403 otherwise; 404 if
   they cannot read it).
2. People: a contact segment's members are the people. An organisation or
   account segment's people are its members' **active** contacts whose `role`
   is in `roles`, at most 3 per organisation or account (ordered by role in
   the order ticked, then name), each filtered through the viewer's own
   contact visibility (`visible_children_q`).
3. Skips, counted and never named: no email; surveyed in the last 30 days (a
   `SurveyInvite` for the contact created in the last 30 days, any status but
   `failed`); over the per-record cap.
4. Returns the people, the counts, `organisations` (distinct records reached)
   and `hidden_count` (segment members the viewer cannot open, as Segments).

### 1.3 Send

`POST /api/v1/surveys/sends/<id>/send/`, owner only:

- Claim under `select_for_update`: `draft` → `sending` (a second request gets
  409). Resolve the audience; 400 if it is empty or over **500 people**.
- Per person: create the invite with a fresh `secrets.token_urlsafe(32)`,
  email it through a new `send_survey_email(invite, token)` in
  `services/email.py` (link `{FRONTEND_URL}/s/<token>`), mark `failed` with
  the reason on an exception; one failure never stops the batch.
- Then `sent`, `sent_at`, frozen `counts`. Audit `survey.sent` with counts.
- Limit: 20 sends per owner per day (429 with a message).

### 1.4 The public link (no login)

- `GET /api/v1/public/surveys/<token>/` → `{survey_type, question, intro,
  organisation_name}` for a live link; **one** 404 body
  `{"detail": "This link has expired."}` for unknown, expired, answered or
  failed alike (no oracle).
- `POST /api/v1/public/surveys/<token>/` `{score, comment?}` → 204. Validates
  the range for the type; `comment` ≤ 2000. A second answer (race included,
  `select_for_update` on the invite) gets the same 404.
- `AllowAny`, `authentication_classes = []`, a new `SurveyLinkThrottle`
  (per IP, 30 requests a minute, built like `PasswordResetThrottle`). Look-ups by
  `token_hash` only. Nothing about the person or other answers is returned.
  Audit `survey.answered` (invite id, never the token).

### 1.5 Scores

On each answer, in the same transaction:

1. The invite becomes `answered`.
2. `scores.refresh(record)` recomputes the 90-day figure for the invite's
   organisation **and**, for an account contact, its account (CES: the
   organisation only, as `Account` has no CES field; an account contact's CES
   answer scores its organisation). Figures: NPS = round(% promoters −
   % detractors); CSAT = % answering 4–5; CES = % answering 5–7, over
   `answered` invites with `answered_at` in the last 90 days. A record with no
   live answers keeps its current score.
3. Upserts one `customers.Survey` log row per (send, record): `status =
   responded`, `score` = that send's figure for that record so far,
   `sent_at` / `responded_at`. The log keeps its aggregate meaning, and
   `/surveys`' existing charts and `csat_breakdown` keep working.
   `SurveySend` ↔ log row via a nullable FK `Survey.send` (migration in
   `customers`).

The nightly `run_health_maintenance` also refreshes figures for records whose
oldest live answer just aged past 90 days.

### 1.6 Reading sends and answers

- `GET/POST /api/v1/surveys/sends/` (list mine + shared with me; create a
  draft), `GET/PATCH/DELETE /sends/<id>/` (owner writes; a sent send accepts
  only `name` and sharing), `POST /sends/audience/` (`{segment, roles}` →
  counts for the modal, nothing created), `POST /sends/<id>/send/`.
- `GET /sends/<id>/answers/?filter=all|detractors|comments&cursor=` → rows
  `{contact {id, name} | null, record {kind, id, name}, score, comment,
  answered_at}`, **only for contacts the viewer may open**, plus
  `hidden_count`. `GET /sends/<id>/pending/` → not-answered people the viewer
  may open, with `expires_at` and failures.
- Summary on the detail: `sent`, `answered`, `rate`, `figure` (the type's
  figure over this send's answers), `bands` (detractors/passives/promoters or
  low/mid/high). For the owner these cover every invite (the audience was
  resolved from the owner's own view). For anyone else they cover only the
  invites whose contact the viewer may open, so a shared send never leaks a
  figure about people the viewer cannot see.
- Visibility: a send the viewer neither owns nor has shared with them is 404;
  a non-owner writing is 403. Checks marked `# SOC2:AUTH-02`, audit calls
  `# SOC2:LOG-01`.

### 1.7 Limits and errors

| Case | Answer |
|---|---|
| Empty audience | 400 `{"segment": ["Nobody to send to."]}` |
| > 500 people | 400 with the count |
| Segment not the owner's | 403; unreadable 404 |
| Organisation/account segment, no roles | 400 `{"roles": [...]}` |
| Two sends at once | 409 |
| 21st send today | 429 |
| Email failure | invite `failed`, batch continues, `counts.failed` |

## 2. Frontend

### 2.1 `/surveys`

Two tabs, `?tab=sends|logged`, Sends first:

- **Sends**: rows (not a table) of name, type chip, segment, sent date, and
  "31 of 42 answered · 74%" in DM Mono; drafts marked Draft. **New survey**
  opens the modal (`/surveys/new`, a child route as the segment builder).
  Empty state explains a survey and offers New survey.
- **Logged scores**: today's page unchanged (Log Survey, charts, list).

### 2.2 New survey modal (`/surveys/new`, `/surveys/:id/edit` for drafts)

The segment builder's modal (`BuilderDialog`):

- **Left:** name; type as three `RadioTile`s (NPS, CSAT, CES); subject; intro
  (optional); **Audience**: the owner's segments in a select grouped by kind,
  and, for organisation and account segments, role checkboxes (Champion and
  Decision Maker ticked by default) with "up to 3 people per organisation";
  **Sharing** (`SharingFields`, as segments).
- **Right:** a preview of the email and of the hosted form as the customer
  will see them; under it the audience from `POST /sends/audience/` (400 ms
  after the last change, latest wins): "42 people at 18 organisations · 6
  skipped (surveyed in the last 30 days) · 2 without an email", and "N in the
  segment you can't open aren't included".
- **Footer:** Cancel, Save draft, **Send to 42 people…** → a confirm step
  repeating the count from the server, then send. 0 people disables Send with
  the reason. Server errors show at their fields.

### 2.3 Send page (`/surveys/:id`)

Header (name, type, segment, sent date, sender; for the owner, Edit opens the
modal with only the name and sharing editable, as the server allows); tiles
(sent, answered, response rate, the figure, the bands); **Answers** (person,
organisation, score chip, comment, date, newest first; All / Detractors /
With comments) with "N more answers from people you can't open"; **Not
answered** (collapsed; expiry; failed with reason).

### 2.4 Hosted form (`/s/:token`)

A route outside the app frame and outside the signed-in guard in `App.tsx`
(it never reads the session): Revenact mark, the question with the
organisation's name, the score buttons in one row (44px targets, wrapping on
phones; NPS labelled "Not likely" … "Very likely"), "Anything to add?"
(optional), Submit. Then "Thanks, your answer was recorded." The expired
page reads the same for every bad link. Light mode only; tokens only.

### 2.5 From a segment

A segment's page gets **Survey these** beside Export; it opens the New survey
modal with that segment chosen (owner only, as the send needs their segment).

## 3. Privacy

- The audience is resolved on the server from the owner's own view, at
  preview and again at send.
- Answers are read through the viewer's visibility; the rest are a count.
- The public link reveals the organisation's name and the question only.
  Tokens are 32 random bytes, stored hashed, looked up by hash, rate-limited,
  one answer, 14 days, one error body for every failure.
- The comment is stored and shown as plain text (React escapes; the email is
  plain text).

## 4. Testing

Backend: models and constraints; audience (roles, cap, quiet period, no
email, inactive contacts, visibility, hidden count); send (claim, 409 race,
failure isolation, limits, audit); public views (live, expired, answered,
unknown all one body, throttle, range validation, double submit); scores
(NPS/CSAT/CES maths, 90-day window, account CES to organisation, log row
upsert, nightly ageing); reading (owner, shared, hidden answers, 404/403).

Frontend: the tabs; the modal (type, audience counts, roles, confirm, errors,
0 people); the send page (tiles, filters, hidden count, not answered); the
hosted form (each type, validation, thanks, expired); Survey these; house
rules; one e2e: build → send → answer on the hosted form → the send page and
the organisation's score move.

## 5. Delivery

1. Backend PR (`revenact-backend` `feat/surveys`): the app, the public link,
   scores, the nightly refresh, docs. Merge and deploy first.
2. Frontend PR (`react-ts-app` `feat/surveys`): the tabs, the modal, the send
   page, the hosted form, Survey these, docs. Browser check in both themes
   (the hosted form in light), at 1440 and 375px.

## 6. Out of scope (later deliveries)

- The approval queue and "send without review" (Scenarios v2).
- Automatic sends (CSAT below X, segment entry) — Scenarios v2.
- Reminder emails; custom questions; sending from a personal mailbox;
  translations.
