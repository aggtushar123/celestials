# Scenarios v2: rules (when → then)

Agreed with the owner on 2026-10-04. Delivery 3 of the Impact section (see
`2026-10-03-segments-design.md` §0 for the who → when → what loop). Segments
decide who, Surveys are the first customer-facing "what"; rules decide when.

## 0. Why, and what exists

The owner deferred Scenarios on 2026-09-29. What exists (both repos):

- `services/scenarios`: a React Flow canvas (`nodes`/`edges` JSON), workspace
  wide with no owner, run synchronously in a request by `engine.run_scenario`
  for organisations only. Real triggers: a new organisation, an interaction
  classified (Django signals). Real actions: email, task, lifecycle, churn,
  assign owner, notify (reusing the `customer_assigned` notification kind).
  Send Survey and Schedule exist only on the canvas. `ScenarioRun` keeps a log
  that no screen shows. 52 backend and 30 frontend tests.
- Segments record entries and exits nightly (`SegmentChange`, written by
  `services.segments.nightly.evaluate_nightly` inside `run_health_maintenance`,
  after scores).
- Surveys can be sent to a segment's people (`services/surveys`).
- The Review Queue (`/brain/review`, `services/metrics` `Proposal`) holds AI
  proposals the user approves or rejects.

## Decisions (agreed 2026-10-04)

| Topic | Decision |
|---|---|
| Shape | Simple rules: one trigger, one to three actions. The canvas stays as it is, untouched; nothing is migrated. |
| Timing | Nightly, in `run_health_maintenance`, after survey scores and segment changes are fresh. |
| Approvals | Customer-facing actions (send a survey) become items in the existing Review Queue, unless the rule says "send without review". Internal actions run automatically. |
| Actions | Send a survey, notify people, create a task, change a field (lifecycle stage only). |
| Triggers | Entered or left one of my segments; a score crossed a line (CSAT, NPS, CES, health) for a record in one of my segments; on a schedule (weekly on a day, or monthly on the 1st) for everyone in one of my segments. |
| Who builds | Anyone, on their own segments; a rule runs as its owner and touches only records its owner may open. Rules are shared like segments. |

## 1. Backend: `services/rules` (new app)

### 1.1 Models

**`Rule`**

| Field | Notes |
|---|---|
| `organisation`, `owner` | As segments. Only the owner edits, switches, deletes or decides reviews. |
| `name` | ≤ 120 chars. |
| `is_active` | Default `False`. |
| `segment` | FK `segments.Segment`, `SET_NULL`; must be the owner's own. |
| `trigger` | `entered` / `left` / `crossed` / `schedule`. |
| `score`, `direction`, `threshold` | For `crossed`: `score` in `csat` / `nps` / `ces` / `health`; `direction` `below` / `above`; `threshold` within the score's range (CSAT and CES 0–100, NPS −100–100, health 0–10). |
| `cadence`, `weekday` | For `schedule`: `weekly` (with `weekday` 0–6, Monday = 0) or `monthly` (the 1st). |
| `actions` | JSON list of 1–3 action objects (§1.3). |
| `cooldown_days` | 1–365, default 30. |
| `sharing`, `shared_with` | As segments (`private` / `workspace` / `people`, ≤ 50). |
| `paused_reason` | Set when the rule switched itself off (§3). |

Limit: 50 rules per owner.

**`RuleState`**: `(rule, record_kind, record_id)` → `last_value` (decimal,
nullable) for `crossed`, and `last_fired_on` (date, nullable) for every trigger.
Unique per (rule, record_kind, record_id). This is what makes "crossed" mean
"was on the other side last night" and what enforces the cooldown.

**`RuleRun`**: one per rule per night (unique `(rule, run_on)`):
`matched`, `fired`, `skipped` (JSON counts by reason: `cooldown`, `cap`,
`not_visible`, `failed`), `review` (FK to the review item if one was made),
`started_at`, `finished_at`.

**`RuleRunRecord`**: per record touched: `run`, `record_kind`, `record_id`,
`outcome` (`fired` / `skipped`), `reason` (when skipped), `actions` (JSON list of
`{action, status, detail}`; `detail` never holds personal data).

**`RuleReview`**: a customer-facing action waiting for the owner:
`rule`, `run`, `action` (the survey action's settings, frozen), `records`
(JSON list of `{kind, id}`), `status` (`waiting` / `approved` / `skipped` /
`expired`), `decided_by`, `decided_at`, `result` (`{survey_send_id}` or an error
detail). Waiting reviews expire after 7 days.

### 1.2 Triggers (`triggers.py`)

`matches(rule, viewer, today) -> list[(kind, id)]`, records the owner may open:

- **entered / left**: `SegmentChange` rows for the rule's segment with
  `changed_on = today` and the matching `change`.
- **crossed**: the segment's members (`members_queryset(segment, owner,
  today=)`) whose current score is on the rule's side of the line and whose
  `RuleState.last_value` was on the other side (a record with no stored value
  stores it and does not fire, so turning a rule on never fires on old
  history). `last_value` is updated for every member each night. Scores:
  `csat_score`, `nps_score`, `ces_percentage` (organisations only), `health_score`.
  An account segment reads the account's own fields; a contact segment is not
  allowed for `crossed` (contacts have no scores).
- **schedule**: all the segment's members, on the rule's weekday (weekly) or
  on the 1st (monthly), in `settings.TIME_ZONE`.

### 1.3 Actions (`actions.py`)

| Action | Settings | Runs |
|---|---|---|
| `notify` | `to`: `me` / `record_owner` / `people` (ids); optional `message` ≤ 280 | Automatically. One notification per recipient per run (a digest: "3 organisations entered *At risk*"), new kind `rule_fired`. |
| `task` | `title` ≤ 200, `assignee`: `record_owner` / `me`, `due_in_days` 0–90 | Automatically, one task per organisation or account (contacts: on the contact's organisation/account). |
| `lifecycle` | `stage`: a `lifecycle_stage` choice | Automatically on organisations and accounts; audited per record with old and new values (`rule.field_changed`). Not allowed on contact segments. |
| `survey` | Surveys' fields: `survey_type`, `subject`, `intro`, `roles`; `without_review` (bool, default false) | Customer-facing. The night's fired records become one `RuleReview` (or, with `without_review`, a survey sent at once). |

A survey (on approve, or without review) is created as a `SurveySend` owned by
the rule's owner, named "{rule name} · {date}", with the rule's segment and
roles, and its audience **limited to the fired records**
(`audience.resolve` gains an optional `records` filter). It is sent through
`services.surveys.sending` so every Surveys rule holds: quiet period, caps,
the daily limit, email-not-set-up refusal. Refusals are stored on the review's
`result` and shown on the item.

### 1.4 The nightly step (`nightly.py`)

`evaluate_rules(today, now)` runs at the end of `run_health_maintenance`,
after `services.segments.nightly.evaluate_nightly` and before
`record_period_end`. For each active rule, in its own transaction and
try/except (one rule's failure never stops the rest):

1. Pause the rule (with `paused_reason` and a notice to the owner) if its
   segment is gone, not the owner's any more, or the owner is inactive.
2. `matches(...)`; drop records the owner may not open (`not_visible`).
3. Drop records fired within `cooldown_days` (`cooldown`); keep the first 200,
   counting the rest (`cap`).
4. Run the internal actions per record (each record and action in its own
   savepoint; a failure is recorded, the rest go on); make the survey review
   or send.
5. Write `RuleRun` + `RuleRunRecord`s, update `RuleState`, audit
   `rule.fired` with counts.
6. If any review is waiting, notify the owner once (kind `rule_review`).

Idempotent per night: a second run the same day finds the `RuleRun` and skips.
`--dry-run` skips the step. Expire reviews older than 7 days.

### 1.5 API

- `GET/POST /api/v1/rules/`, `GET/PATCH/DELETE /api/v1/rules/<id>/`
  (owner writes; 404 for unreadable, 403 for a reader writing).
- `POST /api/v1/rules/test/` (rule body, no save) → who would match tonight:
  `{count, records: first 10 {kind, id, name}, hidden_count, skipped}`; nothing
  is written.
- `GET /api/v1/rules/<id>/runs/?cursor=` → nightly runs, newest first;
  `GET /api/v1/rules/<id>/runs/<run_id>/` → its records, only those the viewer
  may open, plus `hidden_count`.
- `GET /api/v1/rules/reviews/?status=waiting` → the viewer's own waiting
  reviews (owner only); `POST /api/v1/rules/reviews/<id>/approve/` and
  `/skip/`. Approve returns `{survey_send_id}` or the Surveys refusal (400).
- Errors: 400 at the fields named; 409 for a decided review; 429 when the
  owner has 50 rules (`{"detail": ...}`).

## 2. Frontend

### 2.1 `/scenarios`

Two tabs, `?tab=rules|canvas`, Rules first:

- **Rules**: a row per rule: its sentence ("When CSAT falls below 60 in *My
  book* → survey, notify me"), an on/off switch (owner only), the last run
  ("4 Oct · fired 3"), sharing. New rule. Empty state explains rules.
- **Canvas**: today's `ScenariosList` and canvas, unchanged.

### 2.2 Rule builder (modal; `/scenarios/rules/new`, `/scenarios/rules/:id/edit`)

`BuilderDialog`, the sentence form:

- **When** [entered / left / score crosses / on a schedule] **in** [one of my
  segments]; then the score, direction and value, or the weekday / monthly.
- **Then** one to three action cards: Notify (who, message), Create task (title,
  assignee, due in N days), Change lifecycle (stage), Send survey (type, roles,
  subject, intro, **Send without review** switch, off by default, with a warning).
- **Limits**: once per record every N days (default 30); up to 200 records a night.
- **Test this rule**: the server's dry run ("4 organisations would match
  tonight: Pizza Hut, Initech…", hidden count, cooldown skips).
- **Sharing**; Save. Rules are saved off; turning on (here or on the row) and
  ticking "Send without review" each confirm first.

### 2.3 Rule page (`/scenarios/rules/:id`)

Header sentence, on/off, Edit, a paused notice when it switched itself off;
nightly runs as rows ("4 Oct · fired 3 · skipped 2 · 1 waiting for review"),
each opening its records (name, what each action did, why skipped), hidden
count for shared viewers; cursor Show more.

### 2.4 Review Queue (`/brain/review`)

A **From your rules** section above the AI proposals: each waiting review shows
the rule, the trigger sentence, "6 people at 4 organisations" (the server's
count), the survey preview (`SurveyPreview`), and Approve / Skip. Approve opens
the new survey; a refusal shows on the item.

### 2.5 From a segment

A segment's page gets **Automate** beside Survey these (owner only), opening the
rule builder with that segment chosen (`/segments/:id/rule`).

## 3. Privacy and safety

- A rule runs as its owner, on the owner's segment, through the owner's
  visibility at every step (match, act, survey audience); checks marked
  `# SOC2:AUTH-02`. Shared viewers see runs only for records they may open,
  plus a count. Only the owner decides reviews.
- Rules start off; "change a field" is lifecycle only; 200 per night; cooldown
  per record; auto-pause when the segment or owner goes away.
- Audit (`# SOC2:LOG-01`): `rule.created/updated/shared/deleted/activated/
  paused`, `rule.fired` (counts), `rule.field_changed` (per record),
  `rule.review_approved/skipped/expired`.
- Notifications name records only to people who may open them (a digest to
  `record_owner` lists that owner's records only).

## 4. Testing

Backend: models and limits; each trigger (entry/exit from change rows, crossing
with stored values both directions and the first-night no-fire, schedule days);
cooldown, cap, visibility, running as the owner; each action (notify digests,
tasks, lifecycle with audit, survey review and without review limited to the
fired records); approve/skip/expire and Surveys refusals; the nightly order,
idempotency per night, one failure never stopping the rest, auto-pause; the test
endpoint writes nothing; reading runs twice-filtered.

Frontend: the tabs; the builder sentence, actions, limits, Test this rule,
confirms; the rule page runs and records; the Review Queue section;
Automate from a segment; house rules; one e2e (build a rule → the stub's nightly
run → a review → approve → a survey is created).

## 5. Delivery

1. Backend PR (`revenact-backend` `feat/rules`), then frontend PR
   (`react-ts-app` `feat/rules`), built in parallel against the plan's contract.
2. Browser check against the local backend with a forced nightly run.

## 6. Out of scope

Real-time triggers; hourly checks; Plans and Campaigns actions (later
deliveries); changing fields other than lifecycle; migrating the canvas;
reminders; "build from a sentence" (could sit on top later).
