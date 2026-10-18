# Scenarios v2: rules, backend (delivery 3 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `services/rules` app: simple "when → then" rules on the owner's own segments, one trigger and one to three actions, run nightly as the owner inside `run_health_maintenance`, with customer-facing surveys waiting for the owner's review unless the rule says "send without review".

**Architecture:**
- `Rule` is the owner's rule. `RuleState` remembers, per rule and record, last night's score (for `crossed`) and the last night it fired (the cooldown). `RuleRun` is one rule's night, `RuleRunRecord` one record it touched, and `RuleReview` one night's survey waiting for the owner.
- Reading what to act on is split from acting:
  - `triggers.matches` reads the matches (nothing is written);
  - `selection.select` applies the cooldown and the cap of 200;
  - the builder's test endpoint calls the same `select` with `preview=True` and writes nothing.
- `nightly.evaluate_rules` runs each active rule in its own transaction under the rule's row lock. Each record and action runs in its own savepoint. A rule's night is idempotent per `(rule, run_on)`. Surveys are sent through `services.surveys` (`audience.resolve` gains a `records` filter, `sending.claim` passes it on), so every Surveys rule holds. A survey's delivery stays outside any transaction.
- Every read follows the twice-filtered rule. A rule's runs name only records the reader may open now, and the rest are a count. Visibility is always an `id__in` subquery (`records.openable`, `records.visible_q`), never an outer `.distinct()` over the visibility joins.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL (`bulk_create(update_conflicts=True)`, `DISTINCT ON`), `django.core.mail` (locmem under test), `TestCase`/`APIClient`, `LiveServerTestCase` for e2e.

**Spec:** `react-ts-app/docs/superpowers/specs/2026-10-04-rules-design.md`, agreed with the owner on 2026-10-04. This plan covers its backend half: §1 (the app), §3 (privacy and safety), §4 "Backend" (testing) and §5 item 1 (the backend PR). §2 and §5 item 2 belong to the frontend plan.

**Branch:** `feat/rules` (already checked out). Stay on it and do not push. **Merge order:** this backend PR merges and deploys **before** the frontend PR. Nothing here removes or changes a field in an existing response:
- `services/scenarios` is not touched;
- `Notification.kind` gains two choices and `Notification.message` grows from 255 to 500 characters (a widening, so existing rows are unaffected);
- `surveys.audience.resolve` and `surveys.sending.claim` gain an optional keyword that defaults to today's behaviour.

## Global Constraints

These are copied from the spec. Quoted text is verbatim.

- **Shape.** "Simple rules: one trigger, one to three actions. The canvas stays as it is, untouched; nothing is migrated." `services/scenarios` is not modified.
- **Timing.** "Nightly, in `run_health_maintenance`, after survey scores and segment changes are fresh." The step goes "after `services.segments.nightly.evaluate_nightly` and before `record_period_end`". "`--dry-run` skips the step."
- **Approvals.** "Customer-facing actions (send a survey) become items in the existing Review Queue, unless the rule says "send without review". Internal actions run automatically."
- **Actions.** "Send a survey, notify people, create a task, change a field (lifecycle stage only)."
- **Triggers.** "Entered or left one of my segments; a score crossed a line (CSAT, NPS, CES, health) for a record in one of my segments; on a schedule (weekly on a day, or monthly on the 1st) for everyone in one of my segments."
- **Who builds.** "Anyone, on their own segments; a rule runs as its owner and touches only records its owner may open. Rules are shared like segments."
- **Model limits (§1.1).**
  - `name` "≤ 120 chars". `is_active` "Default `False`".
  - `segment` is "FK `segments.Segment`, `SET_NULL`; must be the owner's own".
  - `trigger` is "`entered` / `left` / `crossed` / `schedule`".
  - For `crossed`: "`score` in `csat` / `nps` / `ces` / `health`; `direction` `below` / `above`; `threshold` within the score's range (CSAT and CES 0–100, NPS −100–100, health 0–10)".
  - For `schedule`: "`weekly` (with `weekday` 0–6, Monday = 0) or `monthly` (the 1st)".
  - `actions` is a "JSON list of 1–3 action objects".
  - `cooldown_days` is "1–365, default 30".
  - `sharing`, `shared_with` are "As segments (`private` / `workspace` / `people`, ≤ 50)".
  - "Limit: 50 rules per owner."
- **`RuleState`.** "`(rule, record_kind, record_id)` → `last_value` (decimal, nullable) for `crossed`, and `last_fired_on` (date, nullable) for every trigger. Unique per (rule, record_kind, record_id)."
- **`RuleRun`.** "one per rule per night (unique `(rule, run_on)`): `matched`, `fired`, `skipped` (JSON counts by reason: `cooldown`, `cap`, `not_visible`, `failed`), `review` (FK to the review item if one was made), `started_at`, `finished_at`."
- **`RuleRunRecord`.** "`run`, `record_kind`, `record_id`, `outcome` (`fired` / `skipped`), `reason` (when skipped), `actions` (JSON list of `{action, status, detail}`; `detail` never holds personal data)."
- **`RuleReview`.** "`rule`, `run`, `action` (the survey action's settings, frozen), `records` (JSON list of `{kind, id}`), `status` (`waiting` / `approved` / `skipped` / `expired`), `decided_by`, `decided_at`, `result` (`{survey_send_id}` or an error detail). Waiting reviews expire after 7 days."
- **Triggers (§1.2).**
  - entered / left: "`SegmentChange` rows for the rule's segment with `changed_on = today` and the matching `change`."
  - crossed: "a record with no stored value stores it and does not fire, so turning a rule on never fires on old history". "`last_value` is updated for every member each night." Scores: "`csat_score`, `nps_score`, `ces_percentage` (organisations only), `health_score`". "a contact segment is not allowed for `crossed`".
  - schedule: "all the segment's members, on the rule's weekday (weekly) or on the 1st (monthly), in `settings.TIME_ZONE`."
- **Actions (§1.3).**
  - `notify`: "`to`: `me` / `record_owner` / `people` (ids); optional `message` ≤ 280". It runs "One notification per recipient per run (a digest …), new kind `rule_fired`".
  - `task`: "`title` ≤ 200, `assignee`: `record_owner` / `me`, `due_in_days` 0–90". It makes "one task per organisation or account (contacts: on the contact's organisation/account)".
  - `lifecycle`: "`stage`: a `lifecycle_stage` choice". It is "audited per record with old and new values (`rule.field_changed`). Not allowed on contact segments."
  - `survey`: "Surveys' fields: `survey_type`, `subject`, `intro`, `roles`; `without_review` (bool, default false)". "The night's fired records become one `RuleReview` (or, with `without_review`, a survey sent at once)."
  - The survey is "a `SurveySend` owned by the rule's owner, named "{rule name} · {date}", with the rule's segment and roles, and its audience **limited to the fired records**". It is "sent through `services.surveys.sending` so every Surveys rule holds: quiet period, caps, the daily limit, email-not-set-up refusal. Refusals are stored on the review's `result`".
- **Nightly (§1.4).**
  - "For each active rule, in its own transaction and try/except (one rule's failure never stops the rest)".
  - Pause "if its segment is gone, not the owner's any more, or the owner is inactive", "with `paused_reason` and a notice to the owner".
  - Drop records "the owner may not open (`not_visible`)". Drop records "fired within `cooldown_days` (`cooldown`); keep the first 200, counting the rest (`cap`)".
  - "each record and action in its own savepoint; a failure is recorded, the rest go on".
  - "Write `RuleRun` + `RuleRunRecord`s, update `RuleState`, audit `rule.fired` with counts."
  - "If any review is waiting, notify the owner once (kind `rule_review`)."
  - "Idempotent per night: a second run the same day finds the `RuleRun` and skips." "Expire reviews older than 7 days."
- **API (§1.5).**
  - "`GET/POST /api/v1/rules/`, `GET/PATCH/DELETE /api/v1/rules/<id>/` (owner writes; 404 for unreadable, 403 for a reader writing)."
  - "`POST /api/v1/rules/test/` (rule body, no save) → who would match tonight: `{count, records: first 10 {kind, id, name}, hidden_count, skipped}`; nothing is written."
  - "`GET /api/v1/rules/<id>/runs/?cursor=` → nightly runs, newest first; `GET /api/v1/rules/<id>/runs/<run_id>/` → its records, only those the viewer may open, plus `hidden_count`."
  - "`GET /api/v1/rules/reviews/?status=waiting` → the viewer's own waiting reviews (owner only); `POST /api/v1/rules/reviews/<id>/approve/` and `/skip/`. Approve returns `{survey_send_id}` or the Surveys refusal (400)."
  - "Errors: 400 at the fields named; 409 for a decided review; 429 when the owner has 50 rules (`{"detail": ...}`)."
- **Privacy and safety (§3).**
  - "A rule runs as its owner, on the owner's segment, through the owner's visibility at every step (match, act, survey audience); checks marked `# SOC2:AUTH-02`."
  - "Shared viewers see runs only for records they may open, plus a count. Only the owner decides reviews."
  - "Rules start off; "change a field" is lifecycle only; 200 per night; cooldown per record; auto-pause when the segment or owner goes away."
  - "Audit (`# SOC2:LOG-01`): `rule.created/updated/shared/deleted/activated/paused`, `rule.fired` (counts), `rule.field_changed` (per record), `rule.review_approved/skipped/expired`."
  - "Notifications name records only to people who may open them (a digest to `record_owner` lists that owner's records only)."
- **Out of scope (§6).** "Real-time triggers; hourly checks; Plans and Campaigns actions (later deliveries); changing fields other than lifecycle; migrating the canvas; reminders; "build from a sentence"".

House rules (every task):

- Tests come in three tiers (skill `backend-testing`):
  - unit (`TestCase`);
  - integration (`APIClient`);
  - e2e (`LiveServerTestCase` in `e2e/`).

  For privacy, use the segments fixture's Carl/Dana split: Carl can open Pizza Hut and Pizza EMEA but not Taco Bell or Taco West, and Alice (admin) sees everything.
- Commands:
  - one module: `venv/bin/python manage.py test services.rules.tests.test_<area> --noinput`;
  - the app: `venv/bin/python manage.py test services.rules --noinput`;
  - the full suite: `venv/bin/python manage.py test --parallel --noinput` (serial runs hit the 30-minute CI timeout);
  - migrations: `venv/bin/python manage.py makemigrations --check --dry-run`;
  - the CI shard check: `venv/bin/python scripts/ci_shard_labels.py --check 4`.

  A new app's tests are found by Django's own discovery, so the shards pick them up with no change, provided `services/rules/tests/__init__.py` exists.
- **The CI budget is tight** (about 27 minutes):
  - each test class builds its data once with `setUpTestData` and uses a handful of rows;
  - nothing sleeps;
  - dates and times are passed in (`today=`, `now=`), never waited for;
  - the 200 cap is tested by patching `NIGHTLY_CAP`, not by creating 201 records.
- `venv/bin/ruff check .` and `venv/bin/ruff format --check .` must pass (line length 100; rules E, F, I). Ruff also formats the Python fences inside Markdown, so run `venv/bin/ruff format <file.md>` on any doc you edit.
- Put `# SOC2:AUTH-02 <why>` on every access check and `# SOC2:LOG-01` on every `audit.record` call.
- Semgrep runs in CI. Return an opaque cursor string (`next`), never a built URL.
- **Lessons from the Surveys final review, applied here:**
  - `select_for_update` always runs inside `transaction.atomic()`, and locks are taken in one fixed order:
    - the API's edits and the nightly step: the rule's row, then a record's row (lifecycle);
    - a review: the review's row, then the surveys claim's own (workspace, owner, send).

    Nothing takes a rule's or a review's lock after those.
  - Nightly work is per item: each rule runs in its own `transaction.atomic()` inside a `try/except` that logs by id, and each record and action runs in its own savepoint.
  - Read endpoints pin their query counts. A test asserts that the count with one row equals the count with several, so an N+1 fails.
  - Never round twice. This app computes no percentages; if one is added, round once from the counts (as `surveys.scores.whole_percent` does), never `whole(percent())`.
  - Never log personal data or a raw token. Log lines carry ids and exception class names only, never `str(exc)`, a name or an address.
  - Failure text names the exception's class and a fixed phrase, never the server's text, which can carry an address or a row's values.
  - No `.distinct()` over a multi-join visibility filter. Use `pk__in=<visible>.values("pk")` subqueries (`records.openable`, `records.visible_q`, `access.readable_rules`).
- `docs/API_CONTRACTS.md` changes in the same PR (skill `api-contracts`). So do these, all in Task 12:
  - the product docs (`docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`);
  - `docs/audit-events.md`;
  - `docs/data-classification.md`.
- Commits are conventional (`feat(rules): …`, `test(e2e): …`, `docs(rules): …`). Each ends with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Decisions made while planning

The spec left these open. The owner may overrule any of them, and each is applied in the tasks below.

1. **`matches` returns a `Match`, not a bare list.** The signature is `matches(rule, viewer, *, today, preview=False, state_rule_id=None) -> Match`, where `Match` holds `kind`, `ids` (sorted, all openable by the viewer), `not_visible` (a count) and `values` (tonight's scores, for `crossed`). The cooldown and the cap live in `selection.select`, which both the nightly step and the test endpoint call.
2. **Which side of the line.** `below` means strictly less than the threshold and `above` means strictly more. A value equal to the threshold is not past the line. "The other side" means not on the rule's side.
3. **Stored scores.**
   - Every night a `crossed` rule first clears every stored value, then stores the score of every member that has one.
   - So a record with no score tonight, or no longer a member, has no stored value, and its next score is a first sight (no fire).
   - Only active rules are evaluated.
4. **Edits reset state.**
   - A new `segment` or `trigger` deletes all of the rule's `RuleState` rows, cooldowns included, because they no longer mean anything.
   - A new `score`, `direction` or `threshold`, or turning a rule on, clears the stored values and keeps the cooldowns, so the first night after never fires on old history.
5. **The cooldown applies to every trigger, schedule included.** A record is skipped while `last_fired_on > today − cooldown_days`. A record fired on 1 October with a 30-day cooldown fires again from 31 October. A weekly rule with the default 30 days therefore reaches a record about every five weeks (see spec gap 3).
6. **The cap and skipped rows.**
   - Records are taken lowest id first.
   - A record over the cap is counted (`skipped.cap`) and gets no row.
   - A record skipped for the cooldown gets a `skipped`/`cooldown` row, up to `MAX_SKIPPED_ROWS = 200` a night, and the rest are counted. A weekly rule on a 100,000-member segment must not write 100,000 rows a night.
   - A record the owner may not open is only counted (`not_visible`). It gets no row: nobody may be shown it.
7. **A record's outcome.**
   - A record is `fired` when at least one of its actions did not fail. Its `last_fired_on` is set, even if its survey is later skipped.
   - A record whose every action failed is `skipped` with reason `failed`, and its cooldown is not set, so it is tried again on its next match.
   - Action statuses: `done`, `unchanged` (the lifecycle was already that stage), `queued` (the survey went to the review), `skipped` (a notify whose recipients may open none of it) and `failed`.
8. **The action objects**, normalised on save (unknown keys are dropped). Each action type may appear at most once per rule.
   - `{"action": "notify", "to": "me" | "record_owner" | "people", "people": [ids], "message": ""}`. `people` holds 1–50 active teammates in the owner's workspace, and is `[]` unless `to` is `people`.
   - `{"action": "task", "title", "assignee": "record_owner" | "me", "due_in_days"}`. `assignee` defaults to `record_owner` and `due_in_days` to 7.
   - `{"action": "lifecycle", "stage"}`.
   - `{"action": "survey", "survey_type", "subject", "intro", "roles", "without_review"}`. `subject` is required and ≤ 120 and `intro` is ≤ 500 (the Surveys limits). `roles` is `[]` for a contact segment and must hold at least one role otherwise. `without_review` defaults to `false`.
9. **Tasks.**
   - A task has priority `medium` and is due on `run_on + due_in_days`. Its `created_by` is the rule's owner.
   - `record_owner` means the organisation's or account's own owner. With none, or an inactive one, the task goes to the rule's owner.
   - A contact's task lands on the contact's own organisation or account, once per parent per night.
10. **Lifecycle.** The stage is set under the record's row lock with `save(update_fields=["lifecycle_stage"])`, as `scenarios.engine` does. Choosing `churn` sets the stage only. It does not set `churn_date`, since changing other fields is out of scope (§6). A stage already in place is `unchanged` and is not audited.
11. **The digest's wording.** The notification is `"{rule name}: {who} {what}"`, cut to 200 characters, then `" · {message}"` when the owner wrote one.
    - `who` names up to three organisations or accounts, sorted, then "and N more". Contacts are only counted ("2 contacts"), since their names are personal data.
    - `what` is "entered {segment}", "left {segment}", "{CSAT|NPS|CES|Health} fell below/rose above {threshold}", or "came up on the weekly/monthly schedule".
    - A recipient who may read the rule gets the link `/scenarios/rules/<id>?run=<run_id>`. Anyone else gets no link, because that page would be a 404 for them.
    - `Notification.message` grows to 500 characters (spec gap 2).
12. **`RuleRun.review`** is the reverse side of `RuleReview.run` (`OneToOneField`, `related_name="review"`), not a second column pointing back.
13. **`RuleReview.counts`** (`{"people", "records"}`) is computed by `surveys.audience.resolve` when the review is made. It is the review item's "6 people at 4 organisations". Approving resolves the audience again.
14. **Without review is a review approved by nobody.**
    - The night's survey is still a `RuleReview`. Right after the rule's transaction commits, `reviews.send_review(actor=None)` approves it (`decided_by` null) and sends it, so the delivery stays outside every transaction.
    - If Surveys refuses, the review stays `waiting` with the refusal on `result`, and the owner gets the `rule_review` notice. Nothing is lost silently.
15. **A refusal leaves the review waiting.** The owner can approve again once it is fixed, or skip it. It still expires after 7 days. Every Surveys refusal is answered `400` with Surveys' own body, including its daily-limit (429) and segment-owner (403) refusals, as the spec says.
16. **No orphan drafts.** The survey's `SurveySend` draft is created inside the same savepoint as the claim, so a refusal rolls the draft back with it. No draft is left that could later be sent by hand to the whole segment.
17. **The survey's name** is `"{rule name} · 4 Oct 2026"` (the run's date). The rule's name is cut so the whole fits `SurveySend.name` (120).
18. **`resolve`'s `records` filter replaces the segment's members**, rather than narrowing them. The filter is ids of the segment's kind, read through `visible_records(kind, viewer)`. So a `left` record, which by definition is no longer a member, is still reached, and a record the owner can no longer open is not.
19. **The test endpoint** (`POST /rules/test/`) checks the body exactly as a save would. `name` is optional, and an optional `rule` (the id of one the caller owns) lends its stored scores and cooldowns. It answers what the nightly step would do tonight, as far as can be known before it runs:
    - **entered/left.** If the segment has already been evaluated today, today's change rows. Otherwise, the owner's members now compared with the segment's `last_members` baseline, which is exactly what tonight's segments step would record.
    - **crossed.** Members past the line now whose stored value (from `rule`, if given) was on the other side. A member with no stored value counts as a match here, because the builder wants to see who is past the line. The nightly step never fires on a first sight.
    - **schedule.** All members if tonight is a scheduled day, else none.
    - `count` is how many would fire (after the cooldown and cap). `hidden_count` equals `skipped.not_visible`. `records` names the first 10 by id.
20. **Pausing.**
    - `paused_reason` is a code with a fixed label, returned as `paused_reason` and `paused_message`:
      - `segment_gone`: "Its segment was deleted.";
      - `segment_not_owned`: "Its segment is no longer the owner's.";
      - `owner_inactive`: "Its owner is no longer active.".
    - The notice to the owner is one `rule_fired` notification: "{rule name} was switched off: {label}". Because the rule is now off, it is sent once.
    - Turning the rule on again clears `paused_reason`.
21. **The owner's review notice** is one `rule_review` notification per owner per night, however many rules made a review. It reads "A survey from your rules is waiting for your review." or "N surveys from your rules are waiting for your review.", and links to `/brain/review`.
22. **System audit rows** (`rule.fired`, `rule.field_changed`, `rule.paused` by the nightly step, `rule.review_expired`, and `rule.review_approved` and `survey.sent` without review) have no actor; the organisation is the rule's. A record's audit `target_repr` is `"Customer <id>"`, `"Account <id>"`, never a name. `rule.fired` is written only when the night matched something or hid something. An empty night writes its `RuleRun` but no audit row.
23. **Reading a rule's nights.**
    - The owner reads each night's stored `matched`, `fired`, `skipped` and `review`.
    - Anyone else reads `fired` as the fired records they may open now, with `matched`, `skipped` and `review` set to `null`.
    - Everyone gets `hidden_count`: the night's rows whose record they cannot open now, deleted records included.
    - Visibility is evaluated at read time, the owner's too.
    - A night's records are unpaginated (at most 400 rows: 200 fired or failed, plus 200 cooldown rows), ordered `fired` first, then by record id.
24. **Paging the nights.** 20 a page, newest first by `(run_on, id)`, under an opaque base64 cursor. A malformed cursor reads as the first page.
25. **Reviews.**
    - The list shows the caller's own reviews, filtered by `status` (`waiting` by default; an unknown value reads as `waiting`), newest first, at most 100.
    - Approve and skip answer 404 to anyone but the rule's owner, the same as for a missing review.
    - Each item carries `organisation_name` (the workspace's name), so the frontend's `SurveyPreview` can show the question as Surveys words it.
26. **The 51st rule is `429 {"detail": "You can own at most 50 rules."}`**, as the spec says, unlike segments' 400. The count runs under the owner's `User` row lock, so two creates at once cannot both pass it (as `segments.views._limit_reached`).
27. **A rule needs a segment to be created or to be on.** A body that would save a rule with no segment while `is_active` is true is `400 {"segment": ["Choose a segment."]}`. A rule whose segment was deleted can still be renamed, re-shared or deleted while it is off.
28. **The list** is ordered by name, with `?scope=mine|shared|all` as segments. A row has no `shared_with` (the detail has it) and carries `last_run` `{run_on, fired, waiting}`, where `fired` is `null` and `waiting` is false for anyone but the owner.
29. **`readable_rules`** never uses `.distinct()`. Sharing by name is `pk__in` over the `shared_with` through table.
30. **Audit metadata.**
    - `rule.created` {`trigger`, `actions`: the action types};
    - `rule.updated` {`fields`: changed names, minus `is_active`};
    - `rule.activated` {};
    - `rule.paused` {`reason`: `owner` when switched off by hand, else the pause code};
    - `rule.shared` {`sharing`, `shared_with`};
    - `rule.deleted` {`trigger`};
    - `rule.fired` {`run`, `matched`, `fired`, `skipped`};
    - `rule.field_changed` {`rule`, `field`, `old`, `new`};
    - `rule.review_approved` {`rule`, `survey_send`, `without_review`};
    - `rule.review_skipped` / `rule.review_expired` {`rule`};
    - and `survey.sent` gains `rule` when a rule sent it.

## Reuse map

Each helper below was read in the current code before this plan relied on it.

| Need | Source | Use |
|---|---|---|
| Segment members as a viewer sees them | `segments.evaluate.members_queryset(segment, user, *, today)`, `member_ids(...)` | `triggers` (crossed, schedule, preview) |
| Records a viewer may open, by kind | `segments.evaluate.visible_records(kind, user)`, `MODELS` | `records.openable`, `surveys.audience.resolve(records=)` |
| Entries and exits | `segments.models.SegmentChange` (`segment`, `record_id`, `change`, `changed_on`), written by `segments.nightly.evaluate_nightly` | `triggers` |
| Segment read access | `segments.access.get_readable(user, pk)` (404), `readable_segments(user)` | `access.owned_segment`, `payloads.readable_segment_ids` |
| Visibility | `customers.scoping.visible_customers`, `visible_accounts`, `visible_children_q` | `records.visible_q` |
| Survey audience | `surveys.audience.resolve(segment, roles, viewer, *, today, now=None)` → `Audience` (`people`, `organisations`) | `reviews.create_review` |
| Survey send | `surveys.sending.claim(pk, user, *, today, now)`, `deliver`, `finish`, `Refusal`, `email_is_set_up`, `EMAIL_NOT_SET_UP` | `reviews.send_review` |
| Survey roles message | `surveys.serializers.NO_ROLES` | `validation._survey` |
| Score columns | `Customer.csat_score`, `nps_score`, `ces_percentage`, `health_score`; `Account.csat_score`, `nps_score`, `health_score` (no CES) | `triggers.SCORE_FIELDS` |
| Lifecycle | `Customer.LifecycleStage` (shared by `Account.lifecycle_stage`) | `validation._lifecycle`, `actions.change_lifecycle` |
| Tasks | `customers.models.Task` (`customer`/`account`, `title`, `assignee`, `assignee_name`, `created_by`, `due_date`, `priority`) | `actions.create_task` |
| Notifications | `notifications.realtime.notify(*, recipient, actor, kind, message, link, push_on_commit)`, `Notification.Kind` | `actions.send_digests`, `nightly` |
| Audit | `core.audit.record(action, *, request, actor, organisation, target, target_repr, metadata)` | views, actions, reviews, nightly |
| Owner row lock for the limit | `segments.views._limit_reached` | `views._limit_reached` |
| Payload helpers | `organizations.rows.iso`, `number`, `person` | `payloads` |
| Test world | `surveys.tests.fixtures.SurveyFixture` (`pinned`, `make_send`, `make_invite`, `contact`), itself `segments.tests.fixtures.SegmentFixture` | `rules.tests.fixtures.RuleFixture` |
| Nightly pattern | `run_health_maintenance`'s `if not options["dry_run"]: try … except Exception: WARNING` steps; `segments.nightly.evaluate_nightly(organisation=None, *, today=None)` | Task 9 |
| e2e HTTP | `e2e/http.py` `http_get`, `http_post`, `http_patch` | Task 11 |

## File Structure

| File | Responsibility |
|---|---|
| `services/rules/__init__.py`, `apps.py` (new) | App config (`RulesConfig`) |
| `services/rules/models.py` (new) | `Rule`, `RuleState`, `RuleRun`, `RuleRunRecord`, `RuleReview`; the limits (`MAX_OWNED`, `MIN_ACTIONS`, `MAX_ACTIONS`, `MIN_COOLDOWN`, `MAX_COOLDOWN`, `DEFAULT_COOLDOWN`, `NIGHTLY_CAP`, `MAX_SKIPPED_ROWS`, `REVIEW_DAYS`, `MAX_SHARED`, `MAX_NAME`, `MAX_MESSAGE`, `MAX_TITLE`, `MAX_DUE_DAYS`, `SCORE_RANGES`) |
| `services/rules/migrations/0001_initial.py` (new, generated) | The five tables |
| `services/notifications/models.py` (modify), `migrations/0004_rule_kinds.py` (new, generated) | `rule_fired`, `rule_review`; `message` up to 500 |
| `services/surveys/audience.py`, `sending.py` (modify) | `resolve(..., records=None)`, `claim(..., records=None)` |
| `services/rules/access.py` (new) | `readable_rules`, `get_readable`, `get_owned`, `owned_segment`, `NOT_OWNER`, `NOT_SEGMENT_OWNER` |
| `services/rules/validation.py` (new) | `TRIGGER_FIELDS`, `clean_trigger`, `clean_actions` and their messages |
| `services/rules/serializers.py` (new) | `RuleWriteSerializer`, `RuleTestSerializer` |
| `services/rules/records.py` (new) | `openable`, `load`, `visible_q`, `names` |
| `services/rules/triggers.py` (new) | `SCORE_FIELDS`, `Match`, `on_side`, `is_due`, `matches` |
| `services/rules/selection.py` (new) | `Selection`, `recently_fired`, `select` |
| `services/rules/actions.py` (new) | Statuses, `create_task`, `change_lifecycle`, `INTERNAL`, `digest_message`, `plan_digests`, `send_digests`, `notify_statuses` |
| `services/rules/reviews.py` (new) | `Decided`, `Answer`, `survey_name`, `create_review`, `get_owned_review`, `send_review`, `skip_review`, `expire_reviews` |
| `services/rules/nightly.py` (new) | `RulesResult`, `Outcome`, `pause_reason`, `run_rule`, `evaluate_rules`, `waiting_message` |
| `services/rules/payloads.py` (new) | `rule_payload`, `list_rows`, `last_runs`, `preview_payload`, `runs_page`, `run_detail`, `review_payload`, cursors |
| `services/rules/views.py`, `urls.py` (new) | `/api/v1/rules/…` |
| `config/settings.py`, `config/urls.py` (modify) | App registration, the mount |
| `services/customers/management/commands/run_health_maintenance.py` (modify) | The nightly step |
| `services/rules/tests/` (new) | `__init__.py`, `fixtures.py`, `test_models.py`, `test_validation.py`, `test_views.py`, `test_triggers.py`, `test_selection.py`, `test_actions.py`, `test_reviews.py`, `test_nightly.py`, `test_reading.py` |
| `services/surveys/tests/test_records_filter.py` (new) | The audience's `records` filter |
| `e2e/test_rules_flow.py` (new) | Build, test, turn on, the night, approve, the rule's page |
| docs (modify) | `API_CONTRACTS.md`, `audit-events.md`, `data-classification.md`, `product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md` |

---

### Task 1: The app, its five tables and the two notification kinds

Spec §1.1, and §1.3/§1.4 for the kinds `rule_fired` and `rule_review`. Decisions 11, 12, 13 and 20.

**Files:**
- Create:
  - `services/rules/__init__.py` (empty)
  - `services/rules/apps.py`
  - `services/rules/models.py`
  - `services/rules/migrations/__init__.py` (empty)
  - `services/rules/migrations/0001_initial.py` (generated)
  - `services/notifications/migrations/0004_rule_kinds.py` (generated)
- Modify:
  - `services/notifications/models.py` (`Kind`, `message`)
  - `config/settings.py` (`INSTALLED_APPS`)
- Test:
  - `services/rules/tests/__init__.py` (empty)
  - `services/rules/tests/fixtures.py`
  - `services/rules/tests/test_models.py`

**Interfaces:**
- Consumes:
  - `segments.models.Segment`, `SegmentChange`;
  - `surveys.tests.fixtures.SurveyFixture` (`cls.org`, `admin`, `csm` (Carl), `other` (Dana), `stranger`, `other_org`, `pizza`, `taco`, `globex`, `emea`, `west`, `today`, `now`, contacts `ann` (Pizza Hut, champion), `ben` (Pizza EMEA, decision maker), `tia`, `tom`; classmethods `pinned(kind, records, *, owner=None, **fields)`, `make_send`, `make_invite`) and `surveys.tests.fixtures.contact(parent, name, role=CHAMPION, **fields)`.
- Produces:
  - `Rule`:
    - choices `Trigger` (`ENTERED`, `LEFT`, `CROSSED`, `SCHEDULE`), `Score` (`CSAT`, `NPS`, `CES`, `HEALTH`), `Direction` (`BELOW`, `ABOVE`), `Cadence` (`WEEKLY`, `MONTHLY`), `Sharing` (`PRIVATE`, `WORKSPACE`, `PEOPLE`) and `Paused` (`SEGMENT_GONE`, `SEGMENT_NOT_OWNED`, `OWNER_INACTIVE`);
    - fields `organisation, owner, name, is_active, segment, trigger, score, direction, threshold, cadence, weekday, actions, cooldown_days, sharing, shared_with, paused_reason, created_at, updated_at`;
    - related names `states`, `runs`, `reviews`;
    - `str(rule) == f"Rule {pk}"`.
  - `RuleState`: fields `rule, record_kind, record_id, last_value, last_fired_on`.
  - `RuleRun`:
    - fields `rule, run_on, matched, fired, skipped, started_at, finished_at`, with related names `records` and `review` (one-to-one, from `RuleReview.run`);
    - `empty_skips() -> {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0}`;
    - `str(run) == f"Rule run {pk}"`.
  - `RuleRunRecord`: `Outcome` (`FIRED`, `SKIPPED`); fields `run, record_kind, record_id, outcome, reason, actions`.
  - `RuleReview`:
    - `Status` (`WAITING`, `APPROVED`, `SKIPPED`, `EXPIRED`);
    - fields `rule, run, action, records, counts, status, decided_by, decided_at, result, created_at`;
    - property `expires_at`;
    - `str(review) == f"Rule review {pk}"`.
  - Constants: `MAX_OWNED = 50`, `MIN_ACTIONS = 1`, `MAX_ACTIONS = 3`, `MIN_COOLDOWN = 1`, `MAX_COOLDOWN = 365`, `DEFAULT_COOLDOWN = 30`, `NIGHTLY_CAP = 200`, `MAX_SKIPPED_ROWS = 200`, `REVIEW_DAYS = 7`, `MAX_SHARED = 50`, `MAX_NAME = 120`, `MAX_MESSAGE = 280`, `MAX_TITLE = 200`, `MAX_DUE_DAYS = 90`, `SCORE_RANGES = {"csat": (0, 100), "nps": (-100, 100), "ces": (0, 100), "health": (0, 10)}`.
  - `Notification.Kind.RULE_FIRED = "rule_fired"`, `Notification.Kind.RULE_REVIEW = "rule_review"`; `Notification.message` max 500.
  - Test helpers in `services/rules/tests/fixtures.py`:
    - `NOTIFY_ME`, `TASK`, `LIFECYCLE`, `SURVEY` (normalised action dicts);
    - `RuleFixture(SurveyFixture)` adds `cls.dough` (Carl's "Dough Co", health 6.0), `cls.dot` (its champion) and `cls.book` (Carl's customer segment "My book" pinning Pizza Hut and Dough Co);
    - classmethods `make_rule(*, owner=None, segment=None, actions=None, **fields) -> Rule` (active, `entered`, notify me, on `cls.book` by default) and `changed(segment, records, change="entered", *, day=None)`.

- [ ] **Step 1: Write the fixture and the failing tests**

Create `services/rules/tests/__init__.py` (empty) and `services/rules/tests/fixtures.py`:

```python
"""The rules tests' shared world, built once per test class
(`setUpTestData`): the surveys fixture (Alice the admin sees everything;
Carl owns Pizza Hut and Pizza EMEA, Dana owns Taco Bell and Taco West, and
neither CSM can open the other's; Ann, Ben, Tia and Tom are their contacts),
plus Dough Co, a second organisation of Carl's with Dot as its champion, and
Carl's segment "My book" pinning Pizza Hut and Dough Co."""

from decimal import Decimal

from services.customers.models import Customer
from services.rules.models import Rule
from services.segments.models import SegmentChange
from services.surveys.tests.fixtures import SurveyFixture, contact

NOTIFY_ME = {"action": "notify", "to": "me", "people": [], "message": ""}
TASK = {"action": "task", "title": "Call them", "assignee": "me", "due_in_days": 3}
LIFECYCLE = {"action": "lifecycle", "stage": "renewal"}
SURVEY = {
    "action": "survey",
    "survey_type": "nps",
    "subject": "A quick question",
    "intro": "",
    "roles": ["champion", "decision_maker"],
    "without_review": False,
}


class RuleFixture(SurveyFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough = Customer.objects.create(
            organisation=cls.org, name="Dough Co", owner=cls.csm, health_score=Decimal("6.0")
        )
        cls.dot = contact(cls.dough, "Dot")
        cls.book = cls.pinned("customer", [cls.pizza, cls.dough], name="My book")

    @classmethod
    def make_rule(cls, *, owner=None, segment=None, actions=None, **fields):
        """An active rule, Carl's by default, on "My book", that notifies its
        owner when a record enters, unless told otherwise."""
        values = {"name": "Renewal watch", "trigger": "entered", "is_active": True, **fields}
        return Rule.objects.create(
            organisation=cls.org,
            owner=owner or cls.csm,
            segment=segment or cls.book,
            actions=actions or [dict(NOTIFY_ME)],
            **values,
        )

    @classmethod
    def changed(cls, segment, records, change="entered", *, day=None):
        """Change rows, as the segments' nightly step writes them."""
        SegmentChange.objects.bulk_create(
            [
                SegmentChange(
                    segment=segment,
                    record_id=record.pk,
                    change=change,
                    changed_on=day or cls.today,
                )
                for record in records
            ]
        )
```

Create `services/rules/tests/test_models.py`:

```python
"""The rule tables, their limits and constraints, and the two new
notification kinds."""

from datetime import timedelta

from django.db import IntegrityError, transaction

from services.notifications.models import Notification
from services.rules import models as limits
from services.rules.models import Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from services.rules.tests.fixtures import SURVEY, RuleFixture


class RuleModelTests(RuleFixture):
    def test_a_new_rule_is_off_private_and_waits_30_days(self):
        rule = Rule.objects.create(
            organisation=self.org, owner=self.csm, name="Watch", trigger="entered", actions=[]
        )
        self.assertEqual(
            (rule.is_active, rule.sharing, rule.cooldown_days, rule.paused_reason),
            (False, "private", 30, ""),
        )
        self.assertEqual(str(rule), f"Rule {rule.pk}")

    def test_the_limits_are_the_specs(self):
        self.assertEqual(
            (
                limits.MAX_OWNED,
                limits.MIN_ACTIONS,
                limits.MAX_ACTIONS,
                limits.MIN_COOLDOWN,
                limits.MAX_COOLDOWN,
                limits.DEFAULT_COOLDOWN,
                limits.NIGHTLY_CAP,
                limits.REVIEW_DAYS,
                limits.MAX_SHARED,
                limits.MAX_NAME,
                limits.MAX_MESSAGE,
                limits.MAX_TITLE,
                limits.MAX_DUE_DAYS,
            ),
            (50, 1, 3, 1, 365, 30, 200, 7, 50, 120, 280, 200, 90),
        )
        self.assertEqual(
            limits.SCORE_RANGES,
            {"csat": (0, 100), "nps": (-100, 100), "ces": (0, 100), "health": (0, 10)},
        )

    def test_the_cooldown_is_1_to_365_days(self):
        for days in (0, 366):
            with self.assertRaises(IntegrityError), transaction.atomic():
                self.make_rule(cooldown_days=days)

    def test_a_weekday_is_0_to_6(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rule(trigger="schedule", cadence="weekly", weekday=7)

    def test_deleting_the_segment_keeps_the_rule(self):
        rule = self.make_rule(segment=self.pinned("customer", [self.pizza]))
        rule.segment.delete()
        rule.refresh_from_db()
        self.assertIsNone(rule.segment)

    def test_deleting_a_rule_deletes_its_states_runs_records_and_reviews(self):
        rule = self.make_rule()
        run = RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        RuleState.objects.create(rule=rule, record_kind="customer", record_id=self.pizza.pk)
        RuleRunRecord.objects.create(
            run=run, record_kind="customer", record_id=self.pizza.pk, outcome="fired"
        )
        RuleReview.objects.create(rule=rule, run=run, action=SURVEY, records=[])
        rule.delete()
        for model in (RuleRun, RuleState, RuleRunRecord, RuleReview):
            self.assertFalse(model.objects.exists(), model.__name__)


class StateRunAndReviewTests(RuleFixture):
    def test_one_state_per_rule_and_record(self):
        rule = self.make_rule()
        RuleState.objects.create(rule=rule, record_kind="customer", record_id=self.pizza.pk)
        RuleState.objects.create(rule=rule, record_kind="account", record_id=self.pizza.pk)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleState.objects.create(rule=rule, record_kind="customer", record_id=self.pizza.pk)

    def test_one_run_per_rule_per_night(self):
        rule = self.make_rule()
        RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        RuleRun.objects.create(
            rule=rule, run_on=self.today - timedelta(days=1), started_at=self.now
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)

    def test_a_new_run_counts_nothing_yet(self):
        run = RuleRun.objects.create(rule=self.make_rule(), run_on=self.today, started_at=self.now)
        self.assertEqual(
            (run.matched, run.fired, run.skipped, run.finished_at),
            (0, 0, {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0}, None),
        )
        self.assertEqual(str(run), f"Rule run {run.pk}")

    def test_one_record_row_per_run_and_record(self):
        run = RuleRun.objects.create(rule=self.make_rule(), run_on=self.today, started_at=self.now)
        RuleRunRecord.objects.create(
            run=run, record_kind="customer", record_id=self.pizza.pk, outcome="fired"
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleRunRecord.objects.create(
                run=run, record_kind="customer", record_id=self.pizza.pk, outcome="skipped"
            )

    def test_one_review_per_run_waiting_seven_days(self):
        rule = self.make_rule()
        run = RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        review = RuleReview.objects.create(
            rule=rule, run=run, action=SURVEY, records=[{"kind": "customer", "id": self.pizza.pk}]
        )
        self.assertEqual((review.status, review.result, review.counts), ("waiting", {}, {}))
        self.assertEqual(review.expires_at, review.created_at + timedelta(days=7))
        self.assertEqual(run.review, review)
        self.assertEqual(str(review), f"Rule review {review.pk}")
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleReview.objects.create(rule=rule, run=run, action=SURVEY, records=[])


class NotificationKindTests(RuleFixture):
    def test_rule_fired_and_rule_review_are_real_kinds(self):
        choices = dict(Notification.Kind.choices)
        self.assertEqual(
            (choices["rule_fired"], choices["rule_review"]), ("Rule fired", "Rule review waiting")
        )

    def test_a_message_holds_a_digest_with_the_owners_note(self):
        note = Notification.objects.create(recipient=self.csm, kind="rule_fired", message="x" * 500)
        note.refresh_from_db()
        self.assertEqual(len(note.message), 500)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_models --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.rules'`.

- [ ] **Step 3: Write the app, the models and the notification changes**

`services/rules/apps.py`:

```python
from django.apps import AppConfig


class RulesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.rules"
    verbose_name = "Rules"
```

`services/rules/models.py`:

```python
"""Rules: when something happens in one of my segments, do one to three
things.

Spec: react-ts-app docs/superpowers/specs/2026-10-04-rules-design.md. A
`Rule` belongs to its owner and runs nightly as them (`nightly.py`), on
their own segment, through their visibility at every step. `RuleState`
remembers, per rule and record, last night's score (for `crossed`) and the
last night it fired (the cooldown). `RuleRun` is one rule's night and
`RuleRunRecord` one record it touched. `RuleReview` is one night's survey
waiting for the owner, or sent at once "without review".

Unrelated to `services/scenarios`, the canvas, which stays as it is.
"""

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation

#: How many rules one person may own.
MAX_OWNED = 50
#: How many actions one rule holds.
MIN_ACTIONS, MAX_ACTIONS = 1, 3
#: Once per record every N days.
MIN_COOLDOWN, MAX_COOLDOWN, DEFAULT_COOLDOWN = 1, 365, 30
#: At most this many records fire per rule per night; the rest are counted.
NIGHTLY_CAP = 200
#: Records skipped for the cooldown keep a row up to this many a night; the rest are counted.
MAX_SKIPPED_ROWS = 200
#: A waiting review expires after this many days.
REVIEW_DAYS = 7
#: A rule is shared by name with, and a notify action names, at most this many teammates.
MAX_SHARED = 50
MAX_NAME = 120
MAX_MESSAGE = 280
MAX_TITLE = 200
MAX_DUE_DAYS = 90
#: Each score's range, inclusive: a threshold must lie within it.
SCORE_RANGES = {"csat": (0, 100), "nps": (-100, 100), "ces": (0, 100), "health": (0, 10)}

KINDS = [("customer", "Organisations"), ("account", "Accounts"), ("contact", "Contacts")]


def empty_skips():
    return {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0}


class Rule(models.Model):
    class Trigger(models.TextChoices):
        ENTERED = "entered", "Entered the segment"
        LEFT = "left", "Left the segment"
        CROSSED = "crossed", "A score crossed a line"
        SCHEDULE = "schedule", "On a schedule"

    class Score(models.TextChoices):
        CSAT = "csat", "CSAT"
        NPS = "nps", "NPS"
        CES = "ces", "CES"
        HEALTH = "health", "Health"

    class Direction(models.TextChoices):
        BELOW = "below", "Falls below"
        ABOVE = "above", "Rises above"

    class Cadence(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly, on the 1st"

    class Sharing(models.TextChoices):
        PRIVATE = "private", "Only me"
        WORKSPACE = "workspace", "Everyone in the workspace"
        PEOPLE = "people", "Chosen teammates"

    class Paused(models.TextChoices):
        SEGMENT_GONE = "segment_gone", "Its segment was deleted."
        SEGMENT_NOT_OWNED = "segment_not_owned", "Its segment is no longer the owner's."
        OWNER_INACTIVE = "owner_inactive", "Its owner is no longer active."

    organisation = models.ForeignKey(Organisation, related_name="rules", on_delete=models.CASCADE)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="rules", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=MAX_NAME)
    is_active = models.BooleanField(default=False)
    segment = models.ForeignKey(
        "segments.Segment",
        related_name="rules",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The owner's own segment. A rule whose segment is deleted pauses itself.",
    )
    trigger = models.CharField(max_length=16, choices=Trigger.choices)
    score = models.CharField(max_length=8, choices=Score.choices, blank=True, default="")
    direction = models.CharField(max_length=8, choices=Direction.choices, blank=True, default="")
    threshold = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    cadence = models.CharField(max_length=8, choices=Cadence.choices, blank=True, default="")
    weekday = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="0-6, Monday = 0, for a weekly schedule."
    )
    actions = models.JSONField(
        default=list, blank=True, help_text="1-3 action objects; see services/rules/validation.py."
    )
    cooldown_days = models.PositiveSmallIntegerField(default=DEFAULT_COOLDOWN)
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_rules", blank=True
    )
    paused_reason = models.CharField(
        max_length=24,
        choices=Paused.choices,
        blank=True,
        default="",
        help_text="Set when the rule switched itself off; cleared when it is turned on.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["organisation", "sharing"]),
            models.Index(fields=["is_active"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(cooldown_days__gte=MIN_COOLDOWN, cooldown_days__lte=MAX_COOLDOWN),
                name="rule_cooldown_1_to_365",
            ),
            models.CheckConstraint(
                condition=Q(weekday__isnull=True) | Q(weekday__lte=6),
                name="rule_weekday_0_to_6",
            ),
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Rule {self.pk}"


class RuleState(models.Model):
    """What a rule remembers about one record: last night's score (for
    `crossed`) and the last night it fired (the cooldown). Ids only."""

    rule = models.ForeignKey(Rule, related_name="states", on_delete=models.CASCADE)
    record_kind = models.CharField(max_length=8, choices=KINDS)
    record_id = models.PositiveBigIntegerField()
    last_value = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    last_fired_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["rule", "record_kind", "record_id"], name="one_rule_state_per_record"
            )
        ]

    def __str__(self):
        return f"Rule {self.rule_id}: {self.record_kind} {self.record_id}"


class RuleRun(models.Model):
    """One rule's night. Its counts come from the owner's book."""

    rule = models.ForeignKey(Rule, related_name="runs", on_delete=models.CASCADE)
    run_on = models.DateField()
    matched = models.PositiveIntegerField(default=0)
    fired = models.PositiveIntegerField(default=0)
    skipped = models.JSONField(default=empty_skips, blank=True)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-run_on", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["rule", "run_on"], name="one_rule_run_per_night")
        ]

    def __str__(self):
        return f"Rule run {self.pk}"


class RuleRunRecord(models.Model):
    """One record a night touched: what each action did, or why it was
    skipped. `actions` is `[{action, status, detail}]`; `detail` never holds
    personal data or an exception's text."""

    class Outcome(models.TextChoices):
        FIRED = "fired", "Fired"
        SKIPPED = "skipped", "Skipped"

    run = models.ForeignKey(RuleRun, related_name="records", on_delete=models.CASCADE)
    record_kind = models.CharField(max_length=8, choices=KINDS)
    record_id = models.PositiveBigIntegerField()
    outcome = models.CharField(max_length=8, choices=Outcome.choices)
    reason = models.CharField(max_length=16, blank=True, default="")
    actions = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["outcome", "record_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["run", "record_kind", "record_id"], name="one_rule_run_record_per_record"
            )
        ]

    def __str__(self):
        return f"Rule run {self.run_id}: {self.record_kind} {self.record_id} {self.outcome}"


class RuleReview(models.Model):
    """One night's survey waiting for the rule's owner. Approving sends it
    through services.surveys to the fired records (`reviews.py`)."""

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        APPROVED = "approved", "Approved"
        SKIPPED = "skipped", "Skipped"
        EXPIRED = "expired", "Expired"

    rule = models.ForeignKey(Rule, related_name="reviews", on_delete=models.CASCADE)
    run = models.OneToOneField(RuleRun, related_name="review", on_delete=models.CASCADE)
    action = models.JSONField(help_text="The survey action's settings, frozen.")
    records = models.JSONField(default=list, help_text="The fired records: [{kind, id}].")
    counts = models.JSONField(
        default=dict, blank=True, help_text="{people, records} the survey reached when made."
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.WAITING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null for a survey a rule sent without review, and for an expiry.",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    result = models.JSONField(
        default=dict, blank=True, help_text='{"survey_send_id"} or {"error": <the refusal>}.'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "created_at"])]

    @property
    def expires_at(self):
        return self.created_at + timedelta(days=REVIEW_DAYS)

    def __str__(self):
        return f"Rule review {self.pk}"
```

In `services/notifications/models.py`, add two members to `Notification.Kind` after `SEGMENT_CHANGES` and widen `message`:

```python
        SEGMENT_CHANGES = "segment_changes", "Segment changes"
        RULE_FIRED = "rule_fired", "Rule fired"
        RULE_REVIEW = "rule_review", "Rule review waiting"
```

```python
    # 500: a rule's digest is up to 200 characters of its own plus the
    # owner's note (up to 280).
    message = models.CharField(max_length=500)
```

In `config/settings.py`, add `"services.rules",` to `INSTALLED_APPS` directly after `"services.surveys",`.

Generate the migrations:

```bash
venv/bin/python manage.py makemigrations rules
venv/bin/python manage.py makemigrations notifications -n rule_kinds
```

Expected: `services/rules/migrations/0001_initial.py` (five models, the constraints and indexes) and `services/notifications/migrations/0004_rule_kinds.py` (two `AlterField`s, `kind` and `message`).

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
venv/bin/python manage.py test services.rules.tests.test_models services.notifications services.segments.tests.test_models --noinput
venv/bin/python manage.py makemigrations --check --dry-run
```
Expected: PASS, and `No changes detected`.

- [ ] **Step 5: Commit**

```bash
git add services/rules config/settings.py services/notifications/models.py services/notifications/migrations/0004_rule_kinds.py
git commit -m "feat(rules): rule, state, run, run record and review tables; rule notification kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A survey limited to chosen records

Spec §1.3: "`audience.resolve` gains an optional `records` filter". Decisions 16 and 18.

**Files:**
- Modify:
  - `services/surveys/audience.py` (`resolve`)
  - `services/surveys/sending.py` (`claim`)
- Test: `services/surveys/tests/test_records_filter.py`

**Interfaces:**
- Consumes: `segments.evaluate.visible_records(kind, user)`.
- Produces:
  - `surveys.audience.resolve(segment, roles, viewer, *, today, now=None, records=None) -> Audience`. `records` is a list of ids of `segment.kind`. When given, those records replace the segment's members, still read through the viewer's own visibility.
  - `surveys.sending.claim(pk, user, *, today, now, records=None)`, which passes `records` to `resolve`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_records_filter.py`:

```python
"""A rule's survey reaches only the records it fired on (rules spec §1.3):
`resolve` and `claim` take an optional `records` filter that replaces the
segment's members, still read through the sender's own visibility, with
every skip still applied."""

from services.customers.models import Customer
from services.surveys.audience import resolve
from services.surveys.models import SurveyInvite
from services.surveys.sending import claim
from services.surveys.tests.fixtures import SurveyFixture, contact


class RecordsFilterTests(SurveyFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough = Customer.objects.create(organisation=cls.org, name="Dough Co", owner=cls.csm)
        cls.dot = contact(cls.dough, "Dot")
        cls.segment = cls.pinned("customer", [cls.pizza, cls.dough])

    def names(self, audience):
        return [person.name for person in audience.people]

    def resolve(self, segment=None, roles=("champion",), **kwargs):
        return resolve(segment or self.segment, list(roles), self.csm, today=self.today, **kwargs)

    def test_without_records_the_segment_is_the_audience(self):
        self.assertEqual(self.names(self.resolve()), ["Ann", "Dot"])

    def test_records_limit_the_audience(self):
        self.assertEqual(self.names(self.resolve(records=[self.dough.pk])), ["Dot"])

    def test_no_records_is_nobody(self):
        self.assertEqual(self.resolve(records=[]).people, [])

    def test_a_record_the_sender_may_not_open_is_never_reached(self):
        audience = self.resolve(records=[self.taco.pk, self.dough.pk])
        self.assertEqual(self.names(audience), ["Dot"])

    def test_a_record_that_has_left_the_segment_is_still_reached(self):
        only_pizza = self.pinned("customer", [self.pizza], name="Pizza only")
        self.assertEqual(self.names(self.resolve(only_pizza, records=[self.dough.pk])), ["Dot"])

    def test_the_skips_still_apply(self):
        self.make_invite(self.make_send(), self.dot, created_at=self.now)
        audience = self.resolve(records=[self.dough.pk], now=self.now)
        self.assertEqual((audience.people, audience.skipped_recent), ([], 1))

    def test_a_contact_segment_is_limited_to_its_records(self):
        people = self.pinned("contact", [self.ann, self.dot], name="People")
        self.assertEqual(self.names(self.resolve(people, roles=(), records=[self.ann.pk])), ["Ann"])

    def test_the_claim_writes_invites_only_for_the_records(self):
        send = self.make_send(segment=self.segment, roles=["champion"])
        send, audience, deliveries = claim(
            send.pk, self.csm, today=self.today, now=self.now, records=[self.dough.pk]
        )
        invited = SurveyInvite.objects.filter(send=send).values_list("contact__name", flat=True)
        self.assertEqual((list(invited), len(deliveries)), (["Dot"], 1))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_records_filter --noinput`
Expected: FAIL. Several tests error with `TypeError: resolve() got an unexpected keyword argument 'records'`. `test_without_records_the_segment_is_the_audience` passes.

- [ ] **Step 3: Add the filter**

In `services/surveys/audience.py`, change the import line and `resolve`:

```python
from services.segments.evaluate import members_queryset, visible_records
```

```python
def resolve(segment, roles, viewer, *, today, now=None, records=None):
    """The people `segment` reaches for `viewer` with `roles` ticked. The
    no-email and 30-day skips come first; the cap of three per record then
    applies to who is left.

    `records`, when given, are ids of the segment's kind that replace its
    members: a rule's survey goes to the records it fired on, including one
    that has since left the segment, and still only to those the viewer may
    open."""
    now = now or timezone.now()
    if records is None:
        members = members_queryset(segment, viewer, today=today)
    else:
        # SOC2:AUTH-02 a rule's fired records, read through the viewer's own visibility
        members = visible_records(segment.kind, viewer).filter(pk__in=list(records))
    candidates, hidden, capped = _candidates(segment, roles, viewer, members)
```

The rest of the function is unchanged.

In `services/surveys/sending.py`, change `claim`'s signature and its `resolve` call:

```python
def claim(pk, user, *, today, now, records=None):
```

```python
        audience = resolve(segment, send.roles, user, today=today, now=now, records=records)
```

Add one sentence at the end of `claim`'s docstring: `` `records` (a rule's fired records) limits the audience; see `audience.resolve`. ``

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys --noinput`
Expected: PASS. The existing surveys tests are unaffected, because `records` defaults to `None`.

- [ ] **Step 5: Commit**

```bash
git add services/surveys/audience.py services/surveys/sending.py services/surveys/tests/test_records_filter.py
git commit -m "feat(surveys): limit a send's audience to chosen records, for rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: What a rule may say, and who may read or write it

Spec §1.1 (limits), §1.2 (which triggers suit which segments) and §1.3 (action settings), plus the access rules from §1.5 and §3. Decisions 8, 19, 26, 27 and 29.

**Files:**
- Create:
  - `services/rules/access.py`
  - `services/rules/validation.py`
  - `services/rules/serializers.py`
- Test: `services/rules/tests/test_validation.py`

**Interfaces:**
- Consumes:
  - `segments.access.get_readable(user, pk)`;
  - `surveys.serializers.NO_ROLES`;
  - `Customer.LifecycleStage`, `Survey.SurveyType`, `Contact.Role`;
  - the limits from Task 1.
- Produces:
  - `access`:
    - `readable_rules(user) -> QuerySet[Rule]`;
    - `get_readable(user, pk) -> Rule` (404);
    - `get_owned(user, pk) -> Rule` (403 for a reader);
    - `owned_segment(user, segment_id) -> Segment` (404 unreadable, 403 not theirs);
    - `NOT_OWNER = "Only the rule's owner can change it."`, `NOT_SEGMENT_OWNER = "A rule can only use your own segments."`.
  - `validation`:
    - `TRIGGER_FIELDS`;
    - `clean_trigger(values: dict, kind: str | None) -> dict` (all six trigger fields, the ones not used cleared);
    - `clean_actions(actions, kind: str | None, owner) -> list[dict]`;
    - message constants: `CHOOSE_SEGMENT`, `CHOOSE_TRIGGER`, `CHOOSE_SCORE`, `CHOOSE_DIRECTION`, `CHOOSE_THRESHOLD`, `CHOOSE_CADENCE`, `CHOOSE_WEEKDAY`, `NO_CONTACT_SCORES`, `NO_ACCOUNT_CES`, `ACTION_COUNT`, `CHOOSE_ACTION`, `ONE_OF_EACH`, `CHOOSE_RECIPIENTS`, `NO_PEOPLE`, `UNKNOWN_PEOPLE`, `TOO_MANY_PEOPLE`, `LONG_MESSAGE`, `NO_TITLE`, `LONG_TITLE`, `CHOOSE_ASSIGNEE`, `DUE_RANGE`, `NO_CONTACT_LIFECYCLE`, `CHOOSE_STAGE`, `CHOOSE_SURVEY_TYPE`, `NO_SUBJECT`, `LONG_SUBJECT`, `LONG_INTRO`, `CHOOSE_ROLES`, `YES_OR_NO`, `threshold_range(score)`.
  - `serializers`:
    - `RuleWriteSerializer` (context `request`), fields `name, is_active, segment, trigger, score, direction, threshold, cadence, weekday, actions, cooldown_days, sharing, shared_with`;
    - `RuleTestSerializer` (the same, `name` optional, plus `rule`, which validates to a `Rule` the caller owns or `None`);
    - `NO_TEAMMATES`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_validation.py`:

```python
"""What a rule may say: the trigger's own fields, one to three actions, each
checked against the segment's kind, with the 400 at the field named. A
segment must be the owner's own; a rule lent to the test endpoint too."""

from types import SimpleNamespace

from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from services.accounts.models import User
from services.rules import validation as say
from services.rules.serializers import NO_TEAMMATES, RuleTestSerializer, RuleWriteSerializer
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, SURVEY, TASK, RuleFixture
from services.surveys.serializers import NO_ROLES


class Validation(RuleFixture):
    serializer = RuleWriteSerializer

    def check(self, *, user=None, instance=None, **body):
        """(validated data or None, errors) for a create, or for a PATCH of
        `instance` with only `body`."""
        if instance is None:
            body = {
                "name": "Watch",
                "segment": self.book.pk,
                "trigger": "entered",
                "actions": [NOTIFY_ME],
                **body,
            }
        serializer = self.serializer(
            instance,
            data=body,
            partial=instance is not None,
            context={"request": SimpleNamespace(user=user or self.csm)},
        )
        valid = serializer.is_valid()
        return (serializer.validated_data if valid else None), serializer.errors

    def crossing(self, **fields):
        return {
            "trigger": "crossed",
            "score": "csat",
            "direction": "below",
            "threshold": 60,
            **fields,
        }


class TriggerTests(Validation):
    def test_a_simple_rule_is_valid_and_normalised(self):
        data, errors = self.check(score="csat", cadence="weekly", weekday=2)
        self.assertEqual(errors, {})
        self.assertEqual(
            {key: data[key] for key in say.TRIGGER_FIELDS},
            {
                "trigger": "entered",
                "score": "",
                "direction": "",
                "threshold": None,
                "cadence": "",
                "weekday": None,
            },
        )
        self.assertEqual((data["segment"], data["actions"]), (self.book, [NOTIFY_ME]))

    def test_crossed_needs_a_score_a_direction_and_a_threshold(self):
        _data, errors = self.check(trigger="crossed")
        self.assertEqual(
            errors,
            {
                "score": [say.CHOOSE_SCORE],
                "direction": [say.CHOOSE_DIRECTION],
                "threshold": [say.CHOOSE_THRESHOLD],
            },
        )

    def test_each_score_has_its_range(self):
        cases = [
            ("csat", 0, True),
            ("csat", 100, True),
            ("csat", 101, False),
            ("ces", -1, False),
            ("nps", -100, True),
            ("nps", -101, False),
            ("health", 10, True),
            ("health", "10.5", False),
        ]
        for score, threshold, ok in cases:
            with self.subTest(score=score, threshold=threshold):
                _data, errors = self.check(**self.crossing(score=score, threshold=threshold))
                expected = {} if ok else {"threshold": [say.threshold_range(score)]}
                self.assertEqual(errors, expected)

    def test_contacts_have_no_scores(self):
        people = self.pinned("contact", [self.ann], name="People")
        _data, errors = self.check(segment=people.pk, **self.crossing())
        self.assertEqual(errors, {"trigger": [say.NO_CONTACT_SCORES]})

    def test_accounts_have_no_ces(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        _data, errors = self.check(segment=accounts.pk, **self.crossing(score="ces"))
        self.assertEqual(errors, {"score": [say.NO_ACCOUNT_CES]})
        _data, errors = self.check(segment=accounts.pk, **self.crossing(score="nps", threshold=0))
        self.assertEqual(errors, {})

    def test_weekly_needs_a_weekday_and_monthly_drops_it(self):
        _data, errors = self.check(trigger="schedule", cadence="weekly")
        self.assertEqual(errors, {"weekday": [say.CHOOSE_WEEKDAY]})
        _data, errors = self.check(trigger="schedule", cadence="weekly", weekday=7)
        self.assertEqual(errors, {"weekday": [say.CHOOSE_WEEKDAY]})
        _data, errors = self.check(trigger="schedule")
        self.assertEqual(errors, {"cadence": [say.CHOOSE_CADENCE]})
        data, _errors = self.check(trigger="schedule", cadence="monthly", weekday=3)
        self.assertEqual((data["cadence"], data["weekday"]), ("monthly", None))

    def test_the_cooldown_is_1_to_365_days(self):
        for days, ok in ((0, False), (1, True), (365, True), (366, False)):
            with self.subTest(days=days):
                _data, errors = self.check(cooldown_days=days)
                self.assertEqual("cooldown_days" in errors, not ok)

    def test_a_segment_is_required(self):
        _data, errors = self.check(segment=None)
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})

    def test_the_segment_must_be_the_owners_own(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        with self.assertRaises(PermissionDenied):
            self.check(segment=danas.pk)
        private = self.pinned("customer", [self.taco], owner=self.other, name="Private")
        with self.assertRaises(Http404):
            self.check(segment=private.pk)

    def test_a_name_is_at_most_120_characters(self):
        _data, errors = self.check(name="x" * 121)
        self.assertIn("name", errors)


class ActionTests(Validation):
    def actions(self, *actions, segment=None):
        extra = {} if segment is None else {"segment": segment.pk}
        return self.check(actions=list(actions), **extra)

    def test_one_to_three_actions(self):
        for actions in ([], [NOTIFY_ME, TASK, LIFECYCLE, SURVEY], "notify", {"action": "notify"}):
            with self.subTest(actions=actions):
                _data, errors = self.check(actions=actions)
                self.assertEqual(errors, {"actions": [say.ACTION_COUNT]})

    def test_all_four_together_minus_one_are_fine(self):
        data, errors = self.actions(TASK, LIFECYCLE, SURVEY)
        self.assertEqual(errors, {})
        self.assertEqual(data["actions"], [TASK, LIFECYCLE, SURVEY])

    def test_each_action_once(self):
        _data, errors = self.actions(NOTIFY_ME, NOTIFY_ME)
        self.assertEqual(errors, {"actions": [{}, {"action": [say.ONE_OF_EACH]}]})

    def test_errors_point_at_the_action_and_its_field(self):
        _data, errors = self.actions(NOTIFY_ME, {**TASK, "title": "  "})
        self.assertEqual(errors, {"actions": [{}, {"title": [say.NO_TITLE]}]})
        _data, errors = self.actions({"action": "email"}, ["notify"])
        self.assertEqual(
            errors,
            {"actions": [{"action": [say.CHOOSE_ACTION]}, {"action": [say.CHOOSE_ACTION]}]},
        )

    def test_unknown_keys_are_dropped_and_text_trimmed(self):
        data, _errors = self.actions({**TASK, "title": "  Call them ", "colour": "red"})
        self.assertEqual(data["actions"], [TASK])

    def test_notify_settings(self):
        cases = [
            ({"to": "everyone"}, {"to": [say.CHOOSE_RECIPIENTS]}),
            ({"message": "x" * 281}, {"message": [say.LONG_MESSAGE]}),
            ({"to": "people", "people": []}, {"people": [say.NO_PEOPLE]}),
            ({"to": "people", "people": ["3"]}, {"people": [say.NO_PEOPLE]}),
            ({"to": "people", "people": list(range(1, 52))}, {"people": [say.TOO_MANY_PEOPLE]}),
            ({"to": "people", "people": [self.stranger.pk]}, {"people": [say.UNKNOWN_PEOPLE]}),
        ]
        for change, error in cases:
            with self.subTest(change=change):
                _data, errors = self.actions({**NOTIFY_ME, **change})
                self.assertEqual(errors, {"actions": [error]})

    def test_notify_people_are_active_teammates_once_each(self):
        data, _errors = self.actions(
            {**NOTIFY_ME, "to": "people", "people": [self.other.pk, self.other.pk]}
        )
        self.assertEqual(data["actions"][0]["people"], [self.other.pk])
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        _data, errors = self.actions({**NOTIFY_ME, "to": "people", "people": [self.other.pk]})
        self.assertEqual(errors, {"actions": [{"people": [say.UNKNOWN_PEOPLE]}]})

    def test_people_are_kept_only_for_people(self):
        data, _errors = self.actions({**NOTIFY_ME, "people": [self.other.pk]})
        self.assertEqual(data["actions"][0]["people"], [])

    def test_task_settings(self):
        cases = [
            ({"title": "x" * 201}, {"title": [say.LONG_TITLE]}),
            ({"title": None}, {"title": [say.NO_TITLE]}),
            ({"assignee": "dana"}, {"assignee": [say.CHOOSE_ASSIGNEE]}),
            ({"due_in_days": 91}, {"due_in_days": [say.DUE_RANGE]}),
            ({"due_in_days": -1}, {"due_in_days": [say.DUE_RANGE]}),
            ({"due_in_days": True}, {"due_in_days": [say.DUE_RANGE]}),
        ]
        for change, error in cases:
            with self.subTest(change=change):
                _data, errors = self.actions({**TASK, **change})
                self.assertEqual(errors, {"actions": [error]})

    def test_a_task_defaults_to_the_record_owner_in_a_week(self):
        data, _errors = self.actions({"action": "task", "title": "Call them"})
        self.assertEqual(
            data["actions"],
            [
                {
                    "action": "task",
                    "title": "Call them",
                    "assignee": "record_owner",
                    "due_in_days": 7,
                }
            ],
        )

    def test_lifecycle_settings(self):
        _data, errors = self.actions({**LIFECYCLE, "stage": "dormant"})
        self.assertEqual(errors, {"actions": [{"stage": [say.CHOOSE_STAGE]}]})
        people = self.pinned("contact", [self.ann], name="People")
        _data, errors = self.actions(LIFECYCLE, segment=people)
        self.assertEqual(errors, {"actions": [{"action": [say.NO_CONTACT_LIFECYCLE]}]})

    def test_survey_settings(self):
        cases = [
            ({"survey_type": "poll"}, {"survey_type": [say.CHOOSE_SURVEY_TYPE]}),
            ({"subject": ""}, {"subject": [say.NO_SUBJECT]}),
            ({"subject": "x" * 121}, {"subject": [say.LONG_SUBJECT]}),
            ({"intro": "x" * 501}, {"intro": [say.LONG_INTRO]}),
            ({"roles": ["boss"]}, {"roles": [say.CHOOSE_ROLES]}),
            ({"roles": []}, {"roles": [NO_ROLES]}),
            ({"without_review": "yes"}, {"without_review": [say.YES_OR_NO]}),
        ]
        for change, error in cases:
            with self.subTest(change=change):
                _data, errors = self.actions({**SURVEY, **change})
                self.assertEqual(errors, {"actions": [error]})

    def test_a_survey_defaults_to_review_and_a_contact_segment_needs_no_roles(self):
        bare = {"action": "survey", "survey_type": "csat", "subject": "Hi", "roles": ["champion"]}
        data, _errors = self.actions(bare)
        self.assertEqual(
            data["actions"],
            [{**bare, "intro": "", "without_review": False}],
        )
        people = self.pinned("contact", [self.ann], name="People")
        data, _errors = self.actions(SURVEY, segment=people)
        self.assertEqual(data["actions"][0]["roles"], [])


class EditTests(Validation):
    def test_an_edit_checks_the_merged_rule(self):
        rule = self.make_rule(**self.crossing())
        _data, errors = self.check(instance=rule, threshold=101)
        self.assertEqual(errors, {"threshold": [say.threshold_range("csat")]})
        people = self.pinned("contact", [self.ann], name="People")
        _data, errors = self.check(instance=rule, segment=people.pk)
        self.assertEqual(errors, {"trigger": [say.NO_CONTACT_SCORES]})

    def test_a_rename_leaves_the_trigger_and_actions_alone(self):
        data, errors = self.check(instance=self.make_rule(), name="Renamed")
        self.assertEqual((errors, dict(data)), ({}, {"name": "Renamed"}))

    def test_a_rule_without_its_segment_may_be_renamed_but_not_turned_on(self):
        rule = self.make_rule(is_active=False)
        rule.segment = None
        _data, errors = self.check(instance=rule, name="Renamed")
        self.assertEqual(errors, {})
        _data, errors = self.check(instance=rule, is_active=True)
        self.assertEqual(errors, {"segment": [say.CHOOSE_SEGMENT]})

    def test_sharing_by_name_needs_teammates_and_workspace_clears_them(self):
        _data, errors = self.check(sharing="people", shared_with=[])
        self.assertEqual(errors, {"shared_with": [NO_TEAMMATES]})
        data, _errors = self.check(sharing="workspace", shared_with=[self.other.pk])
        self.assertEqual(data["shared_with"], [])
        _data, errors = self.check(sharing="people", shared_with=[self.stranger.pk])
        self.assertIn("shared_with", errors)


class TestSerializerTests(Validation):
    serializer = RuleTestSerializer

    def test_a_name_is_not_needed(self):
        data, errors = self.check(name="")
        self.assertEqual((errors, data["name"]), ({}, ""))

    def test_a_saved_rule_of_the_callers_lends_itself(self):
        rule = self.make_rule()
        data, _errors = self.check(rule=rule.pk)
        self.assertEqual(data["rule"], rule)

    def test_anyone_elses_rule_is_403_or_404(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, name="Dana's")
        shared = self.make_rule(owner=self.other, segment=danas, sharing="workspace")
        with self.assertRaises(PermissionDenied):
            self.check(rule=shared.pk)
        private = self.make_rule(owner=self.other, segment=danas)
        with self.assertRaises(Http404):
            self.check(rule=private.pk)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_validation --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.rules.validation'`.

- [ ] **Step 3: Write `access.py`, `validation.py` and `serializers.py`**

`services/rules/access.py`:

```python
"""Who may read a rule, who may change it, and which segment a rule may
use. Sharing works as segments' does. Sharing by name is a `pk__in` over
the through table, never a `.distinct()` over a join."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.segments.access import get_readable as get_readable_segment

from .models import Rule

NOT_OWNER = "Only the rule's owner can change it."
NOT_SEGMENT_OWNER = "A rule can only use your own segments."


def readable_rules(user):
    """Rules `user` may read: their own, those shared with the workspace,
    and those shared with them by name. Inside their own workspace only."""
    named = Rule.shared_with.through.objects.filter(user_id=user.pk).values("rule_id")
    # SOC2:AUTH-02 a rule is read by its owner and whoever it is shared with
    return Rule.objects.filter(organisation_id=user.organisation_id).filter(
        Q(owner=user)
        | Q(sharing=Rule.Sharing.WORKSPACE)
        | Q(sharing=Rule.Sharing.PEOPLE, pk__in=named)
    )


def get_readable(user, pk):
    """The rule, or a 404 that reads the same for a missing rule and one
    `user` may not read."""
    return get_object_or_404(readable_rules(user).select_related("owner", "segment"), pk=pk)


def get_owned(user, pk):
    rule = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, switches, deletes or tests with a rule
    if rule.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return rule


def owned_segment(user, segment_id):
    """The segment a rule runs on: one `user` may read (404 otherwise) and
    owns (403 otherwise), so a rule only ever reads its owner's own book."""
    segment = get_readable_segment(user, segment_id)
    # SOC2:AUTH-02 a rule runs only on its owner's own segment
    if segment.owner_id != user.pk:
        raise PermissionDenied(NOT_SEGMENT_OWNER)
    return segment
```

`services/rules/validation.py`:

```python
"""What a rule may say (spec §1.1–§1.3), checked against its segment's kind.

The serializer calls these. Each raises a DRF `ValidationError` keyed by the
field at fault, and `clean_actions` keys each action's errors by its place
in the list, so a 400 points at the exact field. Actions are normalised:
known keys only, text trimmed, defaults filled in. `kind` is None for a rule
whose segment was deleted; the kind's own checks then wait for a new one.
"""

from rest_framework.exceptions import ValidationError

from services.accounts.models import User
from services.customers.models import Contact, Customer, Survey
from services.surveys.serializers import NO_ROLES

from .models import (
    MAX_ACTIONS,
    MAX_DUE_DAYS,
    MAX_MESSAGE,
    MAX_SHARED,
    MAX_TITLE,
    MIN_ACTIONS,
    SCORE_RANGES,
    Rule,
)

#: The survey's subject and intro keep Surveys' own limits.
MAX_SUBJECT, MAX_INTRO = 120, 500
DEFAULT_DUE_DAYS = 7
TRIGGER_FIELDS = ("trigger", "score", "direction", "threshold", "cadence", "weekday")

CHOOSE_SEGMENT = "Choose a segment."
CHOOSE_TRIGGER = "Choose when the rule runs."
CHOOSE_SCORE = "Choose a score."
CHOOSE_DIRECTION = "Choose below or above."
CHOOSE_THRESHOLD = "Choose a value."
CHOOSE_CADENCE = "Choose weekly or monthly."
CHOOSE_WEEKDAY = "Choose a day of the week."
NO_CONTACT_SCORES = "Contacts have no scores; choose an organisation or account segment."
NO_ACCOUNT_CES = "Accounts have no CES; choose another score."
ACTION_COUNT = f"Choose {MIN_ACTIONS} to {MAX_ACTIONS} actions."
CHOOSE_ACTION = "Choose an action."
ONE_OF_EACH = "Each action can be used once per rule."
CHOOSE_RECIPIENTS = "Choose who to notify."
NO_PEOPLE = "Choose at least one teammate."
UNKNOWN_PEOPLE = "Notify only active teammates in your workspace."
TOO_MANY_PEOPLE = f"Notify at most {MAX_SHARED} people."
LONG_MESSAGE = f"Keep the message to {MAX_MESSAGE} characters."
NO_TITLE = "Give the task a title."
LONG_TITLE = f"Keep the title to {MAX_TITLE} characters."
CHOOSE_ASSIGNEE = "Choose the record's owner or yourself."
DUE_RANGE = f"Choose 0 to {MAX_DUE_DAYS} days."
NO_CONTACT_LIFECYCLE = (
    "Contacts have no lifecycle stage; choose an organisation or account segment."
)
CHOOSE_STAGE = "Choose a lifecycle stage."
CHOOSE_SURVEY_TYPE = "Choose NPS, CSAT or CES."
NO_SUBJECT = "Write a subject."
LONG_SUBJECT = f"Keep the subject to {MAX_SUBJECT} characters."
LONG_INTRO = f"Keep the intro to {MAX_INTRO} characters."
CHOOSE_ROLES = "Choose roles from the list."
YES_OR_NO = "Must be true or false."


def threshold_range(score):
    low, high = SCORE_RANGES[score]
    return f"Choose a value from {low} to {high}."


def _integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _text(item, key, limit, too_long, missing=None):
    """`item[key]`, trimmed; `missing` makes it required."""
    value = item.get(key)
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError({key: [missing or too_long]})
    value = value.strip()
    if missing and not value:
        raise ValidationError({key: [missing]})
    if len(value) > limit:
        raise ValidationError({key: [too_long]})
    return value


def clean_trigger(values, kind):
    """The six trigger fields: `score`, `direction` and `threshold` kept for
    `crossed`, `cadence` and `weekday` for `schedule`, the rest cleared."""
    trigger = values.get("trigger") or ""
    if trigger not in Rule.Trigger.values:
        raise ValidationError({"trigger": [CHOOSE_TRIGGER]})
    clean = {
        "trigger": trigger,
        "score": "",
        "direction": "",
        "threshold": None,
        "cadence": "",
        "weekday": None,
    }
    if trigger == Rule.Trigger.CROSSED:
        clean.update(_crossing(values, kind))
    elif trigger == Rule.Trigger.SCHEDULE:
        clean.update(_schedule(values))
    return clean


def _crossing(values, kind):
    if kind == "contact":
        raise ValidationError({"trigger": [NO_CONTACT_SCORES]})
    score = values.get("score") or ""
    direction = values.get("direction") or ""
    threshold = values.get("threshold")
    errors = {}
    if score not in SCORE_RANGES:
        errors["score"] = [CHOOSE_SCORE]
    elif kind == "account" and score == Rule.Score.CES:
        errors["score"] = [NO_ACCOUNT_CES]
    if direction not in Rule.Direction.values:
        errors["direction"] = [CHOOSE_DIRECTION]
    if threshold is None:
        errors["threshold"] = [CHOOSE_THRESHOLD]
    elif score in SCORE_RANGES:
        low, high = SCORE_RANGES[score]
        if not low <= threshold <= high:
            errors["threshold"] = [threshold_range(score)]
    if errors:
        raise ValidationError(errors)
    return {"score": score, "direction": direction, "threshold": threshold}


def _schedule(values):
    cadence = values.get("cadence") or ""
    if cadence not in Rule.Cadence.values:
        raise ValidationError({"cadence": [CHOOSE_CADENCE]})
    if cadence == Rule.Cadence.MONTHLY:
        return {"cadence": cadence, "weekday": None}
    weekday = values.get("weekday")
    if not _integer(weekday) or not 0 <= weekday <= 6:
        raise ValidationError({"weekday": [CHOOSE_WEEKDAY]})
    return {"cadence": cadence, "weekday": weekday}


def _notify(item, kind, owner):
    to = item.get("to")
    if to not in ("me", "record_owner", "people"):
        raise ValidationError({"to": [CHOOSE_RECIPIENTS]})
    message = _text(item, "message", MAX_MESSAGE, LONG_MESSAGE)
    people = []
    if to == "people":
        people = item.get("people")
        if not isinstance(people, list) or not people or not all(map(_integer, people)):
            raise ValidationError({"people": [NO_PEOPLE]})
        people = list(dict.fromkeys(people))
        if len(people) > MAX_SHARED:
            raise ValidationError({"people": [TOO_MANY_PEOPLE]})
        # SOC2:AUTH-02 only active teammates in the owner's own workspace are told anything
        found = User.objects.filter(
            pk__in=people, organisation_id=owner.organisation_id, is_active=True
        ).count()
        if found != len(people):
            raise ValidationError({"people": [UNKNOWN_PEOPLE]})
    return {"action": "notify", "to": to, "people": people, "message": message}


def _task(item, kind, owner):
    title = _text(item, "title", MAX_TITLE, LONG_TITLE, missing=NO_TITLE)
    assignee = item.get("assignee", "record_owner")
    if assignee not in ("record_owner", "me"):
        raise ValidationError({"assignee": [CHOOSE_ASSIGNEE]})
    due = item.get("due_in_days", DEFAULT_DUE_DAYS)
    if not _integer(due) or not 0 <= due <= MAX_DUE_DAYS:
        raise ValidationError({"due_in_days": [DUE_RANGE]})
    return {"action": "task", "title": title, "assignee": assignee, "due_in_days": due}


def _lifecycle(item, kind, owner):
    if kind == "contact":
        raise ValidationError({"action": [NO_CONTACT_LIFECYCLE]})
    stage = item.get("stage")
    if stage not in Customer.LifecycleStage.values:
        raise ValidationError({"stage": [CHOOSE_STAGE]})
    return {"action": "lifecycle", "stage": stage}


def _survey(item, kind, owner):
    survey_type = item.get("survey_type")
    if survey_type not in Survey.SurveyType.values:
        raise ValidationError({"survey_type": [CHOOSE_SURVEY_TYPE]})
    subject = _text(item, "subject", MAX_SUBJECT, LONG_SUBJECT, missing=NO_SUBJECT)
    intro = _text(item, "intro", MAX_INTRO, LONG_INTRO)
    roles = item.get("roles", [])
    if not isinstance(roles, list) or not all(role in Contact.Role.values for role in roles):
        raise ValidationError({"roles": [CHOOSE_ROLES]})
    roles = list(dict.fromkeys(roles))
    if kind == "contact":
        roles = []
    elif kind is not None and not roles:
        raise ValidationError({"roles": [NO_ROLES]})
    without_review = item.get("without_review", False)
    if not isinstance(without_review, bool):
        raise ValidationError({"without_review": [YES_OR_NO]})
    return {
        "action": "survey",
        "survey_type": survey_type,
        "subject": subject,
        "intro": intro,
        "roles": roles,
        "without_review": without_review,
    }


CLEANERS = {"notify": _notify, "task": _task, "lifecycle": _lifecycle, "survey": _survey}


def clean_actions(actions, kind, owner):
    """One to three actions, each type once, each normalised. Errors are a
    list aligned with the actions: `{}` for a good one."""
    if not isinstance(actions, list) or not MIN_ACTIONS <= len(actions) <= MAX_ACTIONS:
        raise ValidationError({"actions": [ACTION_COUNT]})
    cleaned, errors, seen = [], [], set()
    for item in actions:
        try:
            name = item.get("action") if isinstance(item, dict) else None
            if not isinstance(name, str) or name not in CLEANERS:
                raise ValidationError({"action": [CHOOSE_ACTION]})
            if name in seen:
                raise ValidationError({"action": [ONE_OF_EACH]})
            seen.add(name)
            cleaned.append(CLEANERS[name](item, kind, owner))
            errors.append({})
        except ValidationError as exc:
            errors.append(exc.detail)
    if any(errors):
        raise ValidationError({"actions": errors})
    return cleaned
```

`services/rules/serializers.py`:

```python
"""What a rule's owner writes. The owner and workspace come from the
request, never the body. A segment is resolved through `owned_segment`, so
one the caller cannot read is a 404 and someone else's a 403. Every save
checks the merged rule (what is stored plus what is sent) against its
segment's kind."""

from rest_framework import serializers

from services.accounts.models import User

from .access import get_owned, owned_segment
from .models import MAX_COOLDOWN, MAX_NAME, MAX_SHARED, MIN_COOLDOWN, Rule
from .validation import CHOOSE_SEGMENT, TRIGGER_FIELDS, clean_actions, clean_trigger

NO_TEAMMATES = "Choose at least one teammate."


class RuleWriteSerializer(serializers.ModelSerializer):
    segment = serializers.IntegerField(required=False, allow_null=True)
    score = serializers.ChoiceField(choices=Rule.Score.choices, required=False, allow_blank=True)
    direction = serializers.ChoiceField(
        choices=Rule.Direction.choices, required=False, allow_blank=True
    )
    threshold = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    cadence = serializers.ChoiceField(
        choices=Rule.Cadence.choices, required=False, allow_blank=True
    )
    weekday = serializers.IntegerField(required=False, allow_null=True)
    actions = serializers.JSONField(required=False)
    cooldown_days = serializers.IntegerField(
        required=False, min_value=MIN_COOLDOWN, max_value=MAX_COOLDOWN
    )
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = Rule
        fields = [
            "name",
            "is_active",
            "segment",
            "trigger",
            "score",
            "direction",
            "threshold",
            "cadence",
            "weekday",
            "actions",
            "cooldown_days",
            "sharing",
            "shared_with",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate_segment(self, value):
        if value is None:
            return None
        return owned_segment(self.context["request"].user, value)

    def _current(self, attrs, name, default=None):
        """What `name` will be once saved: sent, else stored, else `default`."""
        if name in attrs:
            return attrs[name]
        return getattr(self.instance, name, default) if self.instance is not None else default

    def validate(self, attrs):
        user = self.context["request"].user
        creating = self.instance is None
        segment = self._current(attrs, "segment")
        if segment is None and (
            creating or "segment" in attrs or self._current(attrs, "is_active", False)
        ):
            raise serializers.ValidationError({"segment": [CHOOSE_SEGMENT]})
        kind = None if segment is None else segment.kind
        if creating or set(attrs) & {*TRIGGER_FIELDS, "segment"}:
            values = {name: self._current(attrs, name) for name in TRIGGER_FIELDS}
            attrs.update(clean_trigger(values, kind))
        if creating or "actions" in attrs or "segment" in attrs:
            attrs["actions"] = clean_actions(self._current(attrs, "actions"), kind, user)
        self._check_sharing(attrs)
        return attrs

    def _check_sharing(self, attrs):
        instance = self.instance
        default_sharing = instance.sharing if instance is not None else Rule.Sharing.PRIVATE
        if attrs.get("sharing", default_sharing) == Rule.Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError(
                    {"shared_with": [f"Share with at most {MAX_SHARED} teammates."]}
                )
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`), so an
        edit never writes back `paused_reason` or anything else it did not
        send."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class RuleTestSerializer(RuleWriteSerializer):
    """An unsaved rule for the builder's test, checked as a save would check
    it. `name` is not needed. `rule`, the id of a rule the caller owns,
    lends its stored scores and cooldowns. Nothing is saved."""

    name = serializers.CharField(required=False, allow_blank=True, default="", max_length=MAX_NAME)
    rule = serializers.IntegerField(required=False, allow_null=True)

    class Meta(RuleWriteSerializer.Meta):
        fields = [*RuleWriteSerializer.Meta.fields, "rule"]

    def validate_rule(self, value):
        if value is None:
            return None
        return get_owned(self.context["request"].user, value)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules.tests.test_validation --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/access.py services/rules/validation.py services/rules/serializers.py services/rules/tests/test_validation.py
git commit -m "feat(rules): what a rule may say, checked at the field named; who may read and write it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The rule endpoints: list, create, read, edit, delete

Spec §1.5 (the first two routes and the errors), §3 (audit and sharing). Decisions 4, 20, 26, 27, 28 and 30.

**Files:**
- Create:
  - `services/rules/payloads.py`
  - `services/rules/views.py`
  - `services/rules/urls.py`
- Modify: `config/urls.py`
- Test: `services/rules/tests/test_views.py`

**Interfaces:**
- Consumes:
  - `access.readable_rules`, `get_readable`, `get_owned`;
  - `serializers.RuleWriteSerializer`;
  - `segments.access.readable_segments`;
  - `organizations.rows.iso`, `number`, `person`.
- Produces:
  - `payloads`:
    - `readable_segment_ids(viewer, segment_ids) -> set[int]`;
    - `segment_ref(rule, readable) -> dict | None`;
    - `review_of(run) -> RuleReview | None`;
    - `last_runs(rule_ids) -> dict[int, RuleRun]`;
    - `rule_payload(rule, viewer) -> dict` (the detail);
    - `list_rows(rules, viewer) -> list[dict]`.
  - Routes:
    - `GET/POST /api/v1/rules/` (`rule-list`);
    - `GET/PATCH/DELETE /api/v1/rules/<id>/` (`rule-detail`).
  - `views.LIMIT_REACHED = "You can own at most 50 rules."`.
  - Row keys: `id, name, is_active, paused_reason, paused_message, segment, trigger, score, direction, threshold, cadence, weekday, actions, cooldown_days, sharing, owner, is_owner, last_run, updated_at`. The detail adds `shared_with` and `created_at`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_views.py`:

```python
"""The rule endpoints: list, create, read, edit and delete. Sharing works as
segments' does; only the owner writes; missing and hidden read the same
404; at most 50 rules each; every write is audited by field name, never
value."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.rules.models import Rule, RuleRun, RuleState
from services.rules.tests.fixtures import NOTIFY_ME, TASK, RuleFixture

URL = "/api/v1/rules/"
NOT_OWNER = {"detail": "Only the rule's owner can change it."}
NOT_SEGMENT_OWNER = {"detail": "A rule can only use your own segments."}
ROW_KEYS = {
    "id", "name", "is_active", "paused_reason", "paused_message", "segment", "trigger", "score",
    "direction", "threshold", "cadence", "weekday", "actions", "cooldown_days", "sharing",
    "owner", "is_owner", "last_run", "updated_at",
}  # fmt: skip
DETAIL_KEYS = ROW_KEYS | {"shared_with", "created_at"}


class Endpoint(RuleFixture):
    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def fresh(self, user):
        """A client for the user loaded anew, as each real request loads it."""
        return self.api(User.objects.get(pk=user.pk))

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))

    def body(self, **fields):
        return {
            "name": "Renewal watch",
            "segment": self.book.pk,
            "trigger": "entered",
            "actions": [NOTIFY_ME],
            **fields,
        }


class CreateTests(Endpoint):
    def post(self, user=None, **fields):
        return self.api(user or self.csm).post(URL, self.body(**fields), format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().post(URL, self.body(), format="json").status_code, 401)

    def test_a_rule_is_created_off_for_its_owner(self):
        response = self.post(actions=[NOTIFY_ME, TASK])
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(set(data), DETAIL_KEYS)
        self.assertEqual(
            (data["is_active"], data["owner"], data["is_owner"], data["last_run"]),
            (False, {"id": self.csm.pk, "name": "Carl CSM"}, True, None),
        )
        self.assertEqual(
            data["segment"], {"id": self.book.pk, "name": "My book", "kind": "customer"}
        )
        self.assertEqual(data["actions"], [NOTIFY_ME, TASK])
        self.assertEqual(
            self.events("rule.created"),
            [(str(data["id"]), {"trigger": "entered", "actions": ["notify", "task"]})],
        )
        self.assertEqual(self.events("rule.activated"), [])

    def test_a_rule_created_on_is_audited_as_turned_on(self):
        rule_id = self.post(is_active=True).data["id"]
        self.assertEqual(self.events("rule.activated"), [(str(rule_id), {})])

    def test_the_owner_and_workspace_come_from_the_request(self):
        response = self.post(owner=self.other.pk, organisation=self.other_org.pk)
        rule = Rule.objects.get(pk=response.data["id"])
        self.assertEqual((rule.owner, rule.organisation), (self.csm, self.org))

    def test_400_at_the_field_named(self):
        response = self.post(actions=[NOTIFY_ME, {**TASK, "title": ""}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"actions": [{}, {"title": ["Give the task a title."]}]})

    def test_someone_elses_segment_is_403_and_an_unreadable_one_404(self):
        shared = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        response = self.post(segment=shared.pk)
        self.assertEqual((response.status_code, response.data), (403, NOT_SEGMENT_OWNER))
        private = self.pinned("customer", [self.taco], owner=self.other, name="Private")
        self.assertEqual(self.post(segment=private.pk).status_code, 404)

    def test_the_51st_rule_is_429(self):
        Rule.objects.bulk_create(
            [
                Rule(
                    organisation=self.org,
                    owner=self.csm,
                    name=f"Rule {i}",
                    trigger="entered",
                    actions=[NOTIFY_ME],
                )
                for i in range(50)
            ]
        )
        response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (429, {"detail": "You can own at most 50 rules."}),
        )
        danas = self.pinned("customer", [self.taco], owner=self.other, name="Dana's")
        self.assertEqual(self.post(self.other, segment=danas.pk).status_code, 201)

    def test_sharing_on_create_is_audited(self):
        rule_id = self.post(sharing="people", shared_with=[self.other.pk]).data["id"]
        self.assertEqual(
            self.events("rule.shared"),
            [(str(rule_id), {"sharing": "people", "shared_with": [self.other.pk]})],
        )


class ReadTests(Endpoint):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.mine = cls.make_rule(name="Carl's watch")
        everyone = cls.pinned("customer", [cls.pizza, cls.taco], owner=cls.admin, name="Everyone")
        cls.team = cls.make_rule(
            owner=cls.admin, segment=everyone, name="Team watch", sharing="workspace"
        )
        danas = cls.pinned("customer", [cls.taco], owner=cls.other, name="Dana's")
        cls.hidden = cls.make_rule(owner=cls.other, segment=danas, name="Dana's watch")

    def names(self, user, **query):
        return [row["name"] for row in self.api(user).get(URL, query).data]

    def test_the_list_is_mine_and_what_is_shared_with_me(self):
        self.assertEqual(self.names(self.csm), ["Carl's watch", "Team watch"])
        self.assertEqual(self.names(self.csm, scope="mine"), ["Carl's watch"])
        self.assertEqual(self.names(self.csm, scope="shared"), ["Team watch"])
        self.assertEqual(set(self.api(self.csm).get(URL).data[0]), ROW_KEYS)

    def test_a_rule_shared_by_name_is_read_only_by_those_named(self):
        Rule.objects.filter(pk=self.hidden.pk).update(sharing="people")
        self.hidden.shared_with.set([self.csm])
        self.assertIn("Dana's watch", self.names(self.csm))
        self.assertNotIn("Dana's watch", self.names(self.admin))

    def test_another_workspace_never_sees_a_rule(self):
        self.assertEqual(self.names(self.stranger), [])

    def test_a_reader_sees_the_segment_by_name_only_if_they_cannot_open_it(self):
        data = self.api(self.csm).get(f"{URL}{self.team.pk}/").data
        self.assertEqual(set(data), DETAIL_KEYS)
        self.assertEqual(
            (data["segment"], data["is_owner"]),
            ({"id": None, "name": "Everyone", "kind": "customer"}, False),
        )

    def test_missing_and_hidden_read_the_same_404(self):
        hidden = self.api(self.csm).get(f"{URL}{self.hidden.pk}/")
        missing = self.api(self.csm).get(f"{URL}999999/")
        self.assertEqual((hidden.status_code, missing.status_code), (404, 404))
        self.assertEqual(hidden.data, missing.data)

    def test_the_last_run_is_the_owners_to_read(self):
        RuleRun.objects.create(rule=self.team, run_on=self.today, started_at=self.now, fired=3)
        owner_row = self.api(self.admin).get(URL, {"scope": "mine"}).data[0]
        reader_row = self.api(self.csm).get(URL, {"scope": "shared"}).data[0]
        self.assertEqual(
            owner_row["last_run"], {"run_on": self.today.isoformat(), "fired": 3, "waiting": False}
        )
        self.assertEqual(
            reader_row["last_run"],
            {"run_on": self.today.isoformat(), "fired": None, "waiting": False},
        )

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as before:
            self.fresh(self.csm).get(URL)
        for i in range(4):
            rule = self.make_rule(owner=self.admin, name=f"More {i}", sharing="workspace")
            RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        with CaptureQueriesContext(connection) as after:
            rows = self.fresh(self.csm).get(URL).data
        self.assertEqual(len(rows), 6)
        self.assertEqual(len(after.captured_queries), len(before.captured_queries))


class EditTests(Endpoint):
    def setUp(self):
        self.rule = self.make_rule(is_active=False, sharing="workspace")

    def patch(self, user=None, **body):
        return self.api(user or self.csm).patch(f"{URL}{self.rule.pk}/", body, format="json")

    def remember(self, value=70):
        return RuleState.objects.create(
            rule=self.rule,
            record_kind="customer",
            record_id=self.pizza.pk,
            last_value=value,
            last_fired_on=self.today,
        )

    def test_only_the_owner_edits(self):
        response = self.patch(self.other, name="Mine now")
        self.assertEqual((response.status_code, response.data), (403, NOT_OWNER))
        self.assertEqual(self.patch(self.stranger, name="x").status_code, 404)

    def test_an_edit_records_the_fields_changed_never_their_values(self):
        response = self.patch(name="Renamed", cooldown_days=14)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["name"], "Renamed")
        self.patch(name="Renamed")
        self.assertEqual(
            self.events("rule.updated"),
            [(str(self.rule.pk), {"fields": ["cooldown_days", "name"]})],
        )

    def test_turning_on_and_off_is_audited_on_its_own(self):
        self.patch(is_active=True)
        self.patch(is_active=False)
        self.assertEqual(self.events("rule.activated"), [(str(self.rule.pk), {})])
        self.assertEqual(self.events("rule.paused"), [(str(self.rule.pk), {"reason": "owner"})])
        self.assertEqual(self.events("rule.updated"), [])

    def test_turning_on_clears_a_pause_and_forgets_last_scores(self):
        Rule.objects.filter(pk=self.rule.pk).update(paused_reason="owner_inactive")
        state = self.remember()
        data = self.patch(is_active=True).data
        state.refresh_from_db()
        self.assertEqual((data["paused_reason"], data["paused_message"]), ("", ""))
        self.assertEqual((state.last_value, state.last_fired_on), (None, self.today))

    def test_a_new_segment_or_trigger_starts_afresh(self):
        self.remember()
        self.assertEqual(self.patch(trigger="left").status_code, 200)
        self.assertFalse(RuleState.objects.exists())

    def test_a_new_line_forgets_last_scores_but_keeps_the_cooldown(self):
        Rule.objects.filter(pk=self.rule.pk).update(
            trigger="crossed", score="csat", direction="below", threshold=60
        )
        state = self.remember()
        self.assertEqual(self.patch(threshold=50).status_code, 200)
        state.refresh_from_db()
        self.assertEqual((state.last_value, state.last_fired_on), (None, self.today))

    def test_turning_on_needs_a_segment(self):
        Rule.objects.filter(pk=self.rule.pk).update(segment=None)
        response = self.patch(is_active=True)
        self.assertEqual(
            (response.status_code, response.data), (400, {"segment": ["Choose a segment."]})
        )

    def test_sharing_changes_are_audited(self):
        self.patch(sharing="private")
        self.assertEqual(
            self.events("rule.shared"),
            [(str(self.rule.pk), {"sharing": "private", "shared_with": []})],
        )


class DeleteTests(Endpoint):
    def test_the_owner_deletes_and_it_is_audited(self):
        rule = self.make_rule(sharing="workspace")
        self.assertEqual(self.api(self.other).delete(f"{URL}{rule.pk}/").status_code, 403)
        self.assertEqual(self.api(self.stranger).delete(f"{URL}{rule.pk}/").status_code, 404)
        self.assertEqual(self.api(self.csm).delete(f"{URL}{rule.pk}/").status_code, 204)
        self.assertFalse(Rule.objects.filter(pk=rule.pk).exists())
        self.assertEqual(self.events("rule.deleted"), [(str(rule.pk), {"trigger": "entered"})])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_views --noinput`
Expected: FAIL. Every request gets a 404, because `/api/v1/rules/` is not routed yet.

- [ ] **Step 3: Write the payloads, the views and the routes**

`services/rules/payloads.py`:

```python
"""A rule as the API returns it: the detail and the list's row. A night's
counts are the owner's: they came from the owner's book (spec §3)."""

from services.organizations.rows import iso, number, person
from services.segments.access import readable_segments

from .models import Rule, RuleReview, RuleRun


def readable_segment_ids(viewer, segment_ids):
    """Which of `segment_ids` `viewer` may read; no query for none."""
    ids = {pk for pk in segment_ids if pk is not None}
    if not ids:
        return set()
    return set(readable_segments(viewer).filter(pk__in=ids).values_list("pk", flat=True))


def segment_ref(rule, readable):
    """The rule's segment by name and kind; its id only for a reader who may
    open it. None once the segment is deleted."""
    segment = rule.segment
    if segment is None:
        return None
    return {
        "id": segment.pk if segment.pk in readable else None,
        "name": segment.name,
        "kind": segment.kind,
    }


def review_of(run):
    """The night's review, or None. Reads the `select_related` cache."""
    try:
        return run.review
    except RuleReview.DoesNotExist:
        return None


def last_runs(rule_ids):
    """`{rule_id: its latest night}`, one query (none for no ids)."""
    if not rule_ids:
        return {}
    runs = (
        RuleRun.objects.filter(rule_id__in=rule_ids)
        .select_related("review")
        .order_by("rule_id", "-run_on", "-pk")
        .distinct("rule_id")
    )
    return {run.rule_id: run for run in runs}


def last_run_ref(run, is_owner):
    if run is None:
        return None
    review = review_of(run) if is_owner else None
    return {
        "run_on": iso(run.run_on),
        "fired": run.fired if is_owner else None,
        "waiting": review is not None and review.status == RuleReview.Status.WAITING,
    }


def _row(rule, viewer, readable, run):
    is_owner = rule.owner_id == viewer.pk
    return {
        "id": rule.pk,
        "name": rule.name,
        "is_active": rule.is_active,
        "paused_reason": rule.paused_reason,
        "paused_message": Rule.Paused(rule.paused_reason).label if rule.paused_reason else "",
        "segment": segment_ref(rule, readable),
        "trigger": rule.trigger,
        "score": rule.score,
        "direction": rule.direction,
        "threshold": number(rule.threshold),
        "cadence": rule.cadence,
        "weekday": rule.weekday,
        "actions": rule.actions,
        "cooldown_days": rule.cooldown_days,
        "sharing": rule.sharing,
        "owner": person(rule.owner),
        "is_owner": is_owner,
        "last_run": last_run_ref(run, is_owner),
        "updated_at": iso(rule.updated_at),
    }


def rule_payload(rule, viewer):
    body = _row(
        rule,
        viewer,
        readable_segment_ids(viewer, [rule.segment_id]),
        last_runs([rule.pk]).get(rule.pk),
    )
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = (
        rule.shared_with.filter(organisation_id=viewer.organisation_id)
        .order_by("name", "pk")
        .values_list("pk", "name")
    )
    body["shared_with"] = [{"id": pk, "name": name} for pk, name in teammates]
    body["created_at"] = iso(rule.created_at)
    return body


def list_rows(rules, viewer):
    """The list's rows: three queries whatever their number (the rules,
    the readable segments, the last nights)."""
    rules = list(rules)
    readable = readable_segment_ids(viewer, [rule.segment_id for rule in rules])
    runs = last_runs([rule.pk for rule in rules])
    return [_row(rule, viewer, readable, runs.get(rule.pk)) for rule in rules]
```

`services/rules/views.py`:

```python
"""The rule endpoints. Only the owner writes; every read is filtered by
what the reader may open. See docs/API_CONTRACTS.md, `rules`."""

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.models import User

from .access import get_owned, get_readable, readable_rules
from .models import MAX_OWNED, Rule
from .payloads import list_rows, rule_payload
from .serializers import RuleWriteSerializer

LIMIT_REACHED = f"You can own at most {MAX_OWNED} rules."
SHARING_FIELDS = frozenset({"sharing", "shared_with"})
#: A rule on another segment or trigger starts afresh: its stored scores and
#: cooldowns no longer mean anything.
RESET_FIELDS = frozenset({"segment", "trigger"})
#: A new line forgets last night's scores (keeping the cooldowns), so the
#: first night after never fires on old history. So does turning it on.
LINE_FIELDS = frozenset({"score", "direction", "threshold"})


def _limit_reached(user):
    """Whether `user` already owns the most rules allowed. Call inside the
    transaction that creates the new one: the owner's row is locked first,
    so two creates at once queue instead of both passing the count."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))
    return Rule.objects.filter(owner=user).count() >= MAX_OWNED


def _changed(rule, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(rule.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(rule, name) != value:
            changed.append(name)
    return sorted(changed)


def _record(request, action, rule, **metadata):
    audit.record(action, request=request, target=rule, metadata=metadata)  # SOC2:LOG-01


def _record_shared(request, rule):
    _record(
        request,
        "rule.shared",
        rule,
        sharing=rule.sharing,
        shared_with=sorted(rule.shared_with.values_list("pk", flat=True)),
    )


class RuleListCreateView(APIView):
    """GET /api/v1/rules/?scope=mine|shared|all, the rules the caller may
    read, by name. POST creates one owned by the caller (429 past 50)."""

    # SOC2:AUTH-02 authentication here; `readable_rules` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rules = readable_rules(request.user)
        scope = request.query_params.get("scope")
        if scope == "mine":
            rules = rules.filter(owner=request.user)
        elif scope == "shared":
            rules = rules.exclude(owner=request.user)
        rules = rules.select_related("owner", "segment").order_by("name", "pk")
        return Response(list_rows(rules, request.user))

    def post(self, request):
        serializer = RuleWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _limit_reached(request.user):
                return Response({"detail": LIMIT_REACHED}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            rule = serializer.save(owner=request.user, organisation_id=request.user.organisation_id)
            _record(
                request,
                "rule.created",
                rule,
                trigger=rule.trigger,
                actions=[action["action"] for action in rule.actions],
            )
            if rule.is_active:
                _record(request, "rule.activated", rule)
            if rule.sharing != Rule.Sharing.PRIVATE:
                _record_shared(request, rule)
        return Response(rule_payload(rule, request.user), status=status.HTTP_201_CREATED)


class RuleDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/rules/<id>/. Readers read; only the owner
    writes (403 for another reader, 404 for anyone who may not read it)."""

    # SOC2:AUTH-02 authentication here; `get_readable`/`get_owned` check the rule
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(rule_payload(get_readable(request.user, pk), request.user))

    def patch(self, request, pk):
        rule = get_owned(request.user, pk)
        with transaction.atomic():
            # Under the row lock the nightly step takes, so an edit never races
            # tonight's run of this rule.
            rule = (
                Rule.objects.select_for_update(of=("self",))
                .select_related("owner", "segment")
                .get(pk=rule.pk)
            )
            serializer = RuleWriteSerializer(
                rule, data=request.data, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            was_active = rule.is_active
            changed = set(_changed(rule, serializer.validated_data))
            rule = serializer.save()
            turned_on = rule.is_active and not was_active
            if turned_on and rule.paused_reason:
                rule.paused_reason = ""
                rule.save(update_fields=["paused_reason"])
            if RESET_FIELDS & changed:
                rule.states.all().delete()
            elif LINE_FIELDS & changed or turned_on:
                rule.states.update(last_value=None)
            edited = sorted(changed - {"is_active"})
            if edited:
                _record(request, "rule.updated", rule, fields=edited)
            if "is_active" in changed:
                if rule.is_active:
                    _record(request, "rule.activated", rule)
                else:
                    _record(request, "rule.paused", rule, reason="owner")
            if SHARING_FIELDS & changed:
                _record_shared(request, rule)
        return Response(rule_payload(rule, request.user))

    def delete(self, request, pk):
        rule = get_owned(request.user, pk)
        with transaction.atomic():
            # The nightly step's row lock first: a delete during tonight's run
            # of this rule waits for it.
            rule = Rule.objects.select_for_update(of=("self",)).get(pk=rule.pk)
            _record(request, "rule.deleted", rule, trigger=rule.trigger)
            rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

`services/rules/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.RuleListCreateView.as_view(), name="rule-list"),
    path("<int:pk>/", views.RuleDetailView.as_view(), name="rule-detail"),
]
```

In `config/urls.py`, directly after `path("api/v1/segments/", include("services.segments.urls")),`, add:

```python
# Rules (services/rules): "when → then" on the owner's own segments, run
# nightly as the owner. The canvas above (`scenarios`) is unrelated.
(path("api/v1/rules/", include("services.rules.urls")),)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/payloads.py services/rules/views.py services/rules/urls.py config/urls.py services/rules/tests/test_views.py
git commit -m "feat(rules): list, create, read, edit and delete rules, shared like segments

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Triggers: who a rule matches tonight

Spec §1.2. Decisions 1, 2, 3 and 19 (the preview).

**Files:**
- Create:
  - `services/rules/records.py`
  - `services/rules/triggers.py`
- Test: `services/rules/tests/test_triggers.py`

**Interfaces:**
- Consumes:
  - `segments.evaluate.MODELS`, `visible_records`, `members_queryset`, `member_ids`;
  - `segments.models.SegmentChange`;
  - `customers.scoping.visible_customers`, `visible_accounts`, `visible_children_q`;
  - `RuleState`.
- Produces:
  - `records`:
    - `RELATED`;
    - `openable(kind, viewer, ids) -> QuerySet` (`ids` is a list or a subquery of ids);
    - `load(kind, ids) -> list[record]` (in id order, owners joined);
    - `visible_q(viewer) -> Q` (for rows with `record_kind`/`record_id`);
    - `names(kind, ids) -> dict[int, str]`.
  - `triggers`:
    - `SCORE_FIELDS`;
    - `Match(kind, ids=[], not_visible=0, values={})`;
    - `on_side(rule, value) -> bool`;
    - `is_due(rule, today) -> bool`;
    - `matches(rule, viewer, *, today, preview=False, state_rule_id=None) -> Match`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_triggers.py`:

```python
"""Each trigger, read as the owner sees their book: entries and exits from
the segments' change rows, a score crossing its line (both directions, and
never on the first night), and the schedule's days. Nothing here writes."""

from datetime import date, timedelta
from decimal import Decimal

from services.customers.models import Account, Customer
from services.rules.models import RuleState
from services.rules.records import load, names, openable
from services.rules.tests.fixtures import RuleFixture
from services.rules.triggers import is_due, matches
from services.segments.baseline import rebaseline
from services.segments.models import Segment


class RecordsTests(RuleFixture):
    def test_openable_keeps_only_what_the_viewer_may_open(self):
        ids = [self.pizza.pk, self.taco.pk]
        mine = openable("customer", self.csm, ids).values_list("pk", flat=True)
        everyone = openable("customer", self.admin, ids).values_list("pk", flat=True)
        self.assertEqual((sorted(mine), sorted(everyone)), ([self.pizza.pk], sorted(ids)))

    def test_load_and_names(self):
        self.assertEqual([record.name for record in load("contact", [self.dot.pk])], ["Dot"])
        self.assertEqual(names("account", [self.emea.pk]), {self.emea.pk: "Pizza EMEA"})
        with self.assertNumQueries(0):
            self.assertEqual(names("customer", []), {})


class MovedTests(RuleFixture):
    def test_entered_reads_todays_entries(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza])
        self.changed(self.book, [self.dough], "left")
        self.changed(self.book, [self.dough], day=self.today - timedelta(days=1))
        match = matches(rule, self.csm, today=self.today)
        self.assertEqual(
            (match.kind, match.ids, match.not_visible), ("customer", [self.pizza.pk], 0)
        )

    def test_left_reads_todays_exits(self):
        rule = self.make_rule(trigger="left")
        self.changed(self.book, [self.dough], "left")
        self.assertEqual(matches(rule, self.csm, today=self.today).ids, [self.dough.pk])

    def test_a_record_the_owner_may_not_open_is_counted_never_matched(self):
        self.changed(self.book, [self.pizza, self.taco])
        match = matches(self.make_rule(), self.csm, today=self.today)
        self.assertEqual((match.ids, match.not_visible), ([self.pizza.pk], 1))

    def test_a_deleted_record_is_counted_too(self):
        gone = Customer.objects.create(organisation=self.org, name="Gone", owner=self.csm)
        self.changed(self.book, [gone])
        gone.delete()
        match = matches(self.make_rule(), self.csm, today=self.today)
        self.assertEqual((match.ids, match.not_visible), ([], 1))

    def test_the_preview_reads_what_tonight_would_record(self):
        segment = self.pinned("customer", [self.pizza], name="Preview")
        rebaseline(segment, today=self.today - timedelta(days=1))
        Segment.objects.filter(pk=segment.pk).update(pinned_ids=[self.dough.pk])
        segment.refresh_from_db()
        entered = self.make_rule(segment=segment)
        left = self.make_rule(segment=segment, trigger="left")
        self.assertEqual(
            matches(entered, self.csm, today=self.today, preview=True).ids, [self.dough.pk]
        )
        self.assertEqual(
            matches(left, self.csm, today=self.today, preview=True).ids, [self.pizza.pk]
        )
        self.assertEqual(matches(entered, self.csm, today=self.today).ids, [])

    def test_the_preview_reads_todays_rows_once_the_segment_has_run(self):
        rebaseline(self.book, today=self.today)
        self.changed(self.book, [self.dough])
        # This test's own copy of the segment, which the rebaseline just marked as run today.
        rule = self.make_rule(segment=self.book)
        self.assertEqual(
            matches(rule, self.csm, today=self.today, preview=True).ids, [self.dough.pk]
        )

    def test_the_preview_of_a_segment_with_no_baseline_is_empty(self):
        self.assertEqual(
            matches(self.make_rule(), self.csm, today=self.today, preview=True).ids, []
        )


class CrossedTests(RuleFixture):
    def rule(self, **fields):
        values = {
            "trigger": "crossed",
            "score": "csat",
            "direction": "below",
            "threshold": Decimal("60"),
        }
        return self.make_rule(**{**values, **fields})

    def set_csat(self, pizza=None, dough=None):
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=pizza)
        Customer.objects.filter(pk=self.dough.pk).update(csat_score=dough)

    def remember(self, rule, record, value, kind="customer"):
        RuleState.objects.create(
            rule=rule, record_kind=kind, record_id=record.pk, last_value=Decimal(value)
        )

    def fired(self, rule, **kwargs):
        return matches(rule, self.csm, today=self.today, state_rule_id=rule.pk, **kwargs).ids

    def test_the_first_night_stores_and_never_fires(self):
        rule = self.rule()
        self.set_csat(pizza=50, dough=70)
        match = matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assertEqual(match.ids, [])
        self.assertEqual(match.values, {self.pizza.pk: Decimal(50), self.dough.pk: Decimal(70)})

    def test_falling_below_the_line_fires(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.remember(rule, self.dough, 50)
        self.set_csat(pizza=55, dough=40)
        self.assertEqual(self.fired(rule), [self.pizza.pk])  # Dough Co was already below

    def test_rising_above_the_line_fires(self):
        rule = self.rule(direction="above", threshold=Decimal("80"))
        self.remember(rule, self.pizza, 70)
        self.remember(rule, self.dough, 90)
        self.set_csat(pizza=85, dough=95)
        self.assertEqual(self.fired(rule), [self.pizza.pk])

    def test_the_line_itself_is_not_past_it(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.set_csat(pizza=60)
        self.assertEqual(self.fired(rule), [])

    def test_a_record_with_no_score_is_left_out(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.set_csat(pizza=None, dough=None)
        match = matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assertEqual((match.ids, match.values), ([], {}))

    def test_without_a_saved_rule_nothing_is_remembered(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.set_csat(pizza=50)
        self.assertEqual(matches(rule, self.csm, today=self.today).ids, [])

    def test_the_preview_shows_who_is_past_the_line_now(self):
        rule = self.rule()
        self.set_csat(pizza=50, dough=70)
        match = matches(rule, self.csm, today=self.today, preview=True)
        self.assertEqual(match.ids, [self.pizza.pk])

    def test_the_preview_still_honours_a_stored_value(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 40)
        self.set_csat(pizza=50, dough=70)
        self.assertEqual(self.fired(rule, preview=True), [])

    def test_an_account_segment_reads_the_accounts_own_score(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        rule = self.rule(segment=accounts, score="nps", threshold=Decimal("0"))
        self.remember(rule, self.emea, 10, kind="account")
        Account.objects.filter(pk=self.emea.pk).update(nps_score=-20)
        self.assertEqual(self.fired(rule), [self.emea.pk])

    def test_health_and_ces_read_their_own_columns(self):
        health = self.rule(score="health", threshold=Decimal("4"))
        self.remember(health, self.pizza, 8)
        Customer.objects.filter(pk=self.pizza.pk).update(health_score=Decimal("3.0"))
        self.assertEqual(self.fired(health), [self.pizza.pk])
        ces = self.rule(score="ces", name="CES watch")
        self.remember(ces, self.dough, 70)
        Customer.objects.filter(pk=self.dough.pk).update(ces_percentage=Decimal("50.00"))
        self.assertEqual(self.fired(ces), [self.dough.pk])

    def test_only_members_the_owner_may_open(self):
        everyone = self.pinned("customer", [self.pizza, self.taco], name="Everyone")
        rule = self.rule(segment=everyone)
        self.remember(rule, self.taco, 70)
        Customer.objects.filter(pk=self.taco.pk).update(csat_score=10)
        match = matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assertEqual(match.ids, [])
        self.assertNotIn(self.taco.pk, match.values)


class ScheduleTests(RuleFixture):
    MONDAY = date(2026, 10, 5)
    FIRST = date(2026, 11, 1)

    def weekly(self, **fields):
        return self.make_rule(
            trigger="schedule", cadence="weekly", weekday=self.MONDAY.weekday(), **fields
        )

    def test_a_weekly_rule_is_due_on_its_weekday(self):
        rule = self.weekly()
        self.assertTrue(is_due(rule, self.MONDAY))
        self.assertFalse(is_due(rule, self.MONDAY + timedelta(days=1)))
        self.assertTrue(is_due(rule, self.MONDAY + timedelta(days=7)))

    def test_a_monthly_rule_is_due_on_the_first(self):
        rule = self.make_rule(trigger="schedule", cadence="monthly")
        self.assertTrue(is_due(rule, self.FIRST))
        self.assertFalse(is_due(rule, self.FIRST + timedelta(days=1)))

    def test_a_due_rule_matches_every_member(self):
        rule = self.weekly()
        self.assertEqual(
            matches(rule, self.csm, today=self.MONDAY).ids, sorted([self.pizza.pk, self.dough.pk])
        )
        self.assertEqual(matches(rule, self.csm, today=self.MONDAY + timedelta(days=1)).ids, [])

    def test_members_are_only_records_the_owner_may_open(self):
        everyone = self.pinned("customer", [self.pizza, self.taco], name="Everyone")
        self.assertEqual(
            matches(self.weekly(segment=everyone), self.csm, today=self.MONDAY).ids,
            [self.pizza.pk],
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_triggers --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.rules.records'`.

- [ ] **Step 3: Write `records.py` and `triggers.py`**

`services/rules/records.py`:

```python
"""The records a rule acts on (organisations, accounts or contacts), always
read through someone's visibility.

Visibility is an `id__in` subquery over `visible_records`, never a
`.distinct()` over the visibility joins on the outer query, which Postgres
16 plans badly over a large book."""

from django.db.models import Q

from services.customers.models import Contact
from services.customers.scoping import visible_accounts, visible_children_q, visible_customers
from services.segments.evaluate import MODELS, visible_records

#: What a night's actions read from each kind, joined in the one query that loads them.
RELATED = {
    "customer": ("owner",),
    "account": ("owner",),
    "contact": ("customer__owner", "account__owner"),
}


def openable(kind, viewer, ids):
    """The records among `ids` (a list, or a subquery of ids) that `viewer` may open."""
    # SOC2:AUTH-02 a rule matches, acts on, names or counts only records its viewer may open
    visible = visible_records(kind, viewer).values("pk")
    return MODELS[kind].objects.filter(pk__in=ids).filter(pk__in=visible).order_by()


def load(kind, ids):
    """The records with what the actions read, in id order."""
    rows = MODELS[kind].objects.filter(pk__in=list(ids)).select_related(*RELATED[kind])
    return list(rows.order_by("pk"))


def visible_q(viewer):
    """For rows that point at a record by `record_kind` and `record_id` (a
    night's records): those whose record `viewer` may open now."""
    contacts = Contact.objects.filter(visible_children_q(viewer)).values("pk")
    # SOC2:AUTH-02 a night's record is shown only to someone who may open it today
    return (
        Q(record_kind="customer", record_id__in=visible_customers(viewer).values("pk"))
        | Q(record_kind="account", record_id__in=visible_accounts(viewer).values("pk"))
        | Q(record_kind="contact", record_id__in=contacts)
    )


def names(kind, ids):
    """`{id: name}` for `ids`, in one query; none for no ids."""
    if not ids:
        return {}
    return dict(MODELS[kind].objects.filter(pk__in=list(ids)).values_list("pk", "name"))
```

`services/rules/triggers.py`:

```python
"""Which records a rule matches tonight (spec §1.2), as its owner sees
their book. Nothing here writes: the nightly step stores `Match.values`
itself, and the builder's test reads the same answer with `preview=True`.

- entered / left: today's `SegmentChange` rows for the rule's segment.
- crossed: members whose score is past the line tonight and whose stored
  value was not. A member with no stored value is a first sight: stored by
  the nightly step, never fired on.
- schedule: every member, on the rule's weekday or on the 1st.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from services.segments.evaluate import member_ids, members_queryset
from services.segments.models import SegmentChange

from .models import Rule, RuleState
from .records import openable

#: The column each score reads, by segment kind. Accounts have no CES and
#: contacts no scores; validation refuses both.
SCORE_FIELDS = {
    ("customer", "csat"): "csat_score",
    ("customer", "nps"): "nps_score",
    ("customer", "ces"): "ces_percentage",
    ("customer", "health"): "health_score",
    ("account", "csat"): "csat_score",
    ("account", "nps"): "nps_score",
    ("account", "health"): "health_score",
}


@dataclass
class Match:
    """Tonight's matches: `ids` (sorted) the viewer may open, how many they
    may not (`not_visible`, never named), and for `crossed` every member's
    score tonight (`values`)."""

    kind: str
    ids: list = field(default_factory=list)
    not_visible: int = 0
    values: dict = field(default_factory=dict)


def on_side(rule, value):
    """Whether `value` is past the rule's line: strictly below or strictly above."""
    if rule.direction == Rule.Direction.BELOW:
        return value < rule.threshold
    return value > rule.threshold


def is_due(rule, today):
    """A weekly rule runs on its weekday (Monday = 0), a monthly one on the
    1st. `today` is the date in settings.TIME_ZONE."""
    if rule.cadence == Rule.Cadence.WEEKLY:
        return today.weekday() == rule.weekday
    return today.day == 1


def _moved(rule, viewer, *, today, preview):
    segment = rule.segment
    if preview and segment.last_evaluated_on != today:
        # Not evaluated yet today: tonight's segments step will compare the
        # owner's members now with the last baseline. So does the preview.
        if segment.last_members is None:
            return Match(segment.kind)
        now = set(member_ids(segment, viewer, today=today))
        before = set(segment.last_members)
        moved = sorted(now - before if rule.trigger == Rule.Trigger.ENTERED else before - now)
        total = len(moved)
    else:
        moved = SegmentChange.objects.filter(
            segment=segment, changed_on=today, change=rule.trigger
        ).values("record_id")
        total = moved.count()
    seen = sorted(openable(segment.kind, viewer, moved).values_list("pk", flat=True))
    return Match(segment.kind, seen, total - len(seen))


def _crossed(rule, viewer, *, today, preview, state_rule_id):
    kind = rule.segment.kind
    column = SCORE_FIELDS[(kind, rule.score)]
    members = members_queryset(rule.segment, viewer, today=today).order_by()
    values = {
        pk: Decimal(value) for pk, value in members.values_list("pk", column) if value is not None
    }
    last = {}
    if state_rule_id is not None:
        stored = RuleState.objects.filter(
            rule_id=state_rule_id, record_kind=kind, last_value__isnull=False
        )
        last = dict(stored.values_list("record_id", "last_value"))
    fired = []
    for pk, value in values.items():
        if not on_side(rule, value):
            continue
        before = last.get(pk)
        if before is None:
            # A first sight: tonight it is stored, and it fires from tomorrow.
            # The builder's test shows who is past the line now.
            if preview:
                fired.append(pk)
        elif not on_side(rule, before):
            fired.append(pk)
    return Match(kind, sorted(fired), 0, values)


def _scheduled(rule, viewer, *, today):
    kind = rule.segment.kind
    if not is_due(rule, today):
        return Match(kind)
    return Match(kind, member_ids(rule.segment, viewer, today=today))


def matches(rule, viewer, *, today, preview=False, state_rule_id=None):
    """The records `rule` matches on `today` that `viewer` (its owner) may
    open. `state_rule_id` names the rule whose stored scores to compare
    with (None: nothing stored). `preview` answers the builder's test
    before tonight's run (see Decision 19)."""
    if rule.trigger in (Rule.Trigger.ENTERED, Rule.Trigger.LEFT):
        return _moved(rule, viewer, today=today, preview=preview)
    if rule.trigger == Rule.Trigger.CROSSED:
        return _crossed(rule, viewer, today=today, preview=preview, state_rule_id=state_rule_id)
    return _scheduled(rule, viewer, today=today)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules.tests.test_triggers --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/records.py services/rules/triggers.py services/rules/tests/test_triggers.py
git commit -m "feat(rules): entered, left, crossed and schedule triggers, read as the owner

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tonight's records (cooldown and cap) and the builder's test

Spec §1.4 steps 2–3, and §1.5 `POST /api/v1/rules/test/` ("nothing is written"). Decisions 5, 6 and 19.

**Files:**
- Create: `services/rules/selection.py`
- Modify:
  - `services/rules/payloads.py` (add `preview_payload`)
  - `services/rules/views.py` (add `RuleTestView`)
  - `services/rules/urls.py`
- Test: `services/rules/tests/test_selection.py`

**Interfaces:**
- Consumes:
  - `triggers.matches`, `Match`;
  - `records.names`;
  - `RuleState`, `NIGHTLY_CAP`;
  - `serializers.RuleTestSerializer`.
- Produces:
  - `selection.Selection(kind, fire=[], cooldown=[], cap=0, not_visible=0, values={})`, with:
    - `fire`: at most `NIGHTLY_CAP` ids, lowest first;
    - `cooldown`: ids skipped for the cooldown;
    - property `matched`;
    - method `skipped(failed=0) -> {"cooldown", "cap", "not_visible", "failed"}`.
  - `selection.recently_fired(state_rule_id, kind, cooldown_days, *, today) -> set[int]`.
  - `selection.select(rule, owner, *, today, preview=False, state_rule_id=None) -> Selection`.
  - `payloads.TEST_NAMED = 10`.
  - `payloads.preview_payload(selection) -> {"count", "records", "hidden_count", "skipped"}`.
  - Route: `POST /api/v1/rules/test/` (`rule-test`).

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_selection.py`:

```python
"""Tonight's records: the matches, less those fired within the cooldown,
at most 200 lowest id first. Then the builder's test: the same selection,
answered without writing a thing."""

from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.customers.models import Customer, Task
from services.notifications.models import Notification
from services.rules.models import Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from services.rules.selection import select
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, SURVEY, TASK, RuleFixture
from services.segments.models import Segment
from services.surveys.models import SurveySend

URL = "/api/v1/rules/test/"


class SelectTests(RuleFixture):
    def fired_on(self, rule, record, days_ago, kind="customer"):
        RuleState.objects.create(
            rule=rule,
            record_kind=kind,
            record_id=record.pk,
            last_fired_on=self.today - timedelta(days=days_ago),
        )

    def select(self, rule, **kwargs):
        return select(rule, self.csm, today=self.today, state_rule_id=rule.pk, **kwargs)

    def test_a_record_fired_within_the_cooldown_is_skipped(self):
        rule = self.make_rule(cooldown_days=30)
        self.changed(self.book, [self.pizza, self.dough])
        self.fired_on(rule, self.pizza, 29)
        selection = self.select(rule)
        self.assertEqual((selection.fire, selection.cooldown), ([self.dough.pk], [self.pizza.pk]))

    def test_the_cooldown_ends_after_its_days(self):
        rule = self.make_rule(cooldown_days=30)
        self.changed(self.book, [self.pizza])
        self.fired_on(rule, self.pizza, 30)
        self.assertEqual(self.select(rule).fire, [self.pizza.pk])

    def test_another_kinds_state_is_another_record(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza])
        self.fired_on(rule, self.pizza, 1, kind="account")
        self.assertEqual(self.select(rule).fire, [self.pizza.pk])

    def test_at_most_the_cap_a_night_lowest_id_first(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough])
        with patch("services.rules.selection.NIGHTLY_CAP", 1):
            selection = self.select(rule)
        self.assertEqual((selection.fire, selection.cap), ([self.pizza.pk], 1))

    def test_matched_counts_every_record_the_owner_may_open(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough, self.taco])
        self.fired_on(rule, self.pizza, 1)
        with patch("services.rules.selection.NIGHTLY_CAP", 0):
            selection = self.select(rule)
        self.assertEqual(selection.matched, 2)
        self.assertEqual(
            selection.skipped(failed=0), {"cooldown": 1, "cap": 1, "not_visible": 1, "failed": 0}
        )

    def test_without_a_saved_rule_nothing_is_cooling_down(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza])
        self.fired_on(rule, self.pizza, 1)
        self.assertEqual(select(rule, self.csm, today=self.today).fire, [self.pizza.pk])


class TestEndpointTests(RuleFixture):
    def post(self, user=None, **fields):
        client = APIClient()
        client.force_authenticate(user or self.csm)
        body = {
            "segment": self.book.pk,
            "trigger": "schedule",
            "cadence": "weekly",
            "weekday": self.today.weekday(),
            "actions": [NOTIFY_ME],
            **fields,
        }
        return client.post(URL, body, format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().post(URL, {}, format="json").status_code, 401)

    def test_it_names_who_would_be_acted_on_tonight(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.data,
            {
                "count": 2,
                "records": [
                    {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                    {"kind": "customer", "id": self.dough.pk, "name": "Dough Co"},
                ],
                "hidden_count": 0,
                "skipped": {"cooldown": 0, "cap": 0, "not_visible": 0},
            },
        )

    def test_it_names_ten_at_most(self):
        with patch("services.rules.payloads.TEST_NAMED", 1):
            data = self.post().data
        self.assertEqual((data["count"], len(data["records"])), (2, 1))

    def test_a_saved_rule_lends_its_cooldown(self):
        rule = self.make_rule()
        RuleState.objects.create(
            rule=rule, record_kind="customer", record_id=self.pizza.pk, last_fired_on=self.today
        )
        data = self.post(rule=rule.pk).data
        self.assertEqual((data["count"], data["skipped"]["cooldown"]), (1, 1))

    def test_records_the_owner_cannot_open_are_a_count(self):
        Segment.objects.filter(pk=self.book.pk).update(last_evaluated_on=self.today)
        self.changed(self.book, [self.pizza, self.taco])
        data = self.post(trigger="entered").data
        self.assertEqual(
            (data["count"], data["hidden_count"], data["skipped"]["not_visible"]), (1, 1, 1)
        )
        self.assertEqual([record["name"] for record in data["records"]], ["Pizza Hut"])

    def test_it_is_checked_as_a_save_would_be(self):
        response = self.post(actions=[])
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"actions": ["Choose 1 to 3 actions."]}),
        )
        danas = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        self.assertEqual(self.post(segment=danas.pk).status_code, 403)

    def test_someone_elses_rule_cannot_be_lent(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, name="Dana's")
        shared = self.make_rule(owner=self.other, segment=danas, sharing="workspace")
        self.assertEqual(self.post(rule=shared.pk).status_code, 403)
        private = self.make_rule(owner=self.other, segment=danas)
        self.assertEqual(self.post(rule=private.pk).status_code, 404)

    def test_it_writes_nothing(self):
        models = (
            Rule, RuleState, RuleRun, RuleRunRecord, RuleReview, Notification, AuditEvent,
            Task, SurveySend,
        )  # fmt: skip
        before = [model.objects.count() for model in models]
        with CaptureQueriesContext(connection) as ctx:
            response = self.post(actions=[TASK, LIFECYCLE, SURVEY])
        self.assertEqual(response.status_code, 200, response.content)
        writes = [
            query["sql"]
            for query in ctx.captured_queries
            if query["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
        ]
        self.assertEqual(writes, [])
        self.assertEqual([model.objects.count() for model in models], before)

    def test_it_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as small:
            self.post()
        extra = Customer.objects.create(organisation=self.org, name="Extra", owner=self.csm)
        bigger = self.pinned("customer", [self.pizza, self.dough, extra], name="Bigger")
        with CaptureQueriesContext(connection) as large:
            self.post(segment=bigger.pk)
        self.assertEqual(len(large.captured_queries), len(small.captured_queries))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_selection --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.rules.selection'`.

- [ ] **Step 3: Write `selection.py`, the payload and the view**

`services/rules/selection.py`:

```python
"""Tonight's records for one rule (spec §1.4, steps 2–3): its matches as
the owner may open them, less those fired within the cooldown, then at most
200, lowest id first. Read only: the nightly step and the builder's test
call the same function."""

from dataclasses import dataclass, field
from datetime import timedelta

from .models import NIGHTLY_CAP, RuleState
from .triggers import matches


@dataclass
class Selection:
    kind: str
    fire: list = field(default_factory=list)
    cooldown: list = field(default_factory=list)
    cap: int = 0
    not_visible: int = 0
    values: dict = field(default_factory=dict)

    @property
    def matched(self):
        """Every match the owner may open, whatever became of it."""
        return len(self.fire) + len(self.cooldown) + self.cap

    def skipped(self, failed=0):
        return {
            "cooldown": len(self.cooldown),
            "cap": self.cap,
            "not_visible": self.not_visible,
            "failed": failed,
        }


def recently_fired(state_rule_id, kind, cooldown_days, *, today):
    """Records the rule fired on within its cooldown: on a date after
    `today - cooldown_days`. Fired on 1 October with 30 days, a record fires
    again from 31 October."""
    since = today - timedelta(days=cooldown_days)
    rows = RuleState.objects.filter(
        rule_id=state_rule_id, record_kind=kind, last_fired_on__gt=since
    )
    return set(rows.values_list("record_id", flat=True))


def select(rule, owner, *, today, preview=False, state_rule_id=None):
    """`state_rule_id` is the saved rule whose stored scores and fired dates
    apply (None for an unsaved rule: nothing stored, nothing cooling down)."""
    match = matches(rule, owner, today=today, preview=preview, state_rule_id=state_rule_id)
    recent = set()
    if state_rule_id is not None and match.ids:
        recent = recently_fired(state_rule_id, match.kind, rule.cooldown_days, today=today)
    eligible = [pk for pk in match.ids if pk not in recent]
    return Selection(
        kind=match.kind,
        fire=eligible[:NIGHTLY_CAP],
        cooldown=[pk for pk in match.ids if pk in recent],
        cap=max(len(eligible) - NIGHTLY_CAP, 0),
        not_visible=match.not_visible,
        values=match.values,
    )
```

Append to `services/rules/payloads.py` (and add `from .records import names` to its imports):

```python
#: How many records the builder's test names; the rest are in `count`.
TEST_NAMED = 10


def preview_payload(selection):
    """The builder's test: how many would be acted on tonight, the first
    `TEST_NAMED` by name (all openable by the caller, who is the owner), the
    count they may not open, and what the cooldown and cap would skip."""
    first = selection.fire[:TEST_NAMED]
    found = names(selection.kind, first)
    skipped = selection.skipped()
    del skipped["failed"]
    return {
        "count": len(selection.fire),
        "records": [
            {"kind": selection.kind, "id": pk, "name": found[pk]} for pk in first if pk in found
        ],
        "hidden_count": selection.not_visible,
        "skipped": skipped,
    }
```

Add to `services/rules/views.py`. The imports become:

```python
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.models import User

from .access import get_owned, get_readable, readable_rules
from .models import MAX_OWNED, Rule
from .payloads import list_rows, preview_payload, rule_payload
from .selection import select
from .serializers import RuleTestSerializer, RuleWriteSerializer
```

Then append the view:

```python
class RuleTestView(APIView):
    """POST /api/v1/rules/test/: an unsaved rule, checked as a save would
    check it, and who it would act on tonight from the caller's own book.
    `rule` (optional) lends a saved rule's stored scores and cooldowns.
    Nothing is written."""

    # SOC2:AUTH-02 authentication here; `owned_segment`, `get_owned` and `select` check the rest
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RuleTestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        lent = data.pop("rule", None)
        data.pop("shared_with", None)
        rule = Rule(organisation_id=request.user.organisation_id, owner=request.user, **data)
        selection = select(
            rule,
            request.user,
            today=timezone.localdate(),
            preview=True,
            state_rule_id=None if lent is None else lent.pk,
        )
        return Response(preview_payload(selection))
```

`services/rules/urls.py` becomes:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.RuleListCreateView.as_view(), name="rule-list"),
    path("test/", views.RuleTestView.as_view(), name="rule-test"),
    path("<int:pk>/", views.RuleDetailView.as_view(), name="rule-detail"),
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/selection.py services/rules/payloads.py services/rules/views.py services/rules/urls.py services/rules/tests/test_selection.py
git commit -m "feat(rules): cooldown and nightly cap; the builder's test endpoint, which writes nothing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The internal actions: tasks, lifecycle and notification digests

Spec §1.3 (notify, task, lifecycle) and §3 ("Notifications name records only to people who may open them"). Decisions 7, 9, 10, 11 and 22.

**Files:**
- Create: `services/rules/actions.py`
- Test: `services/rules/tests/test_actions.py`

**Interfaces:**
- Consumes:
  - `records.openable`, `load`;
  - `access.readable_rules`;
  - `notifications.realtime.notify`, `Notification.Kind.RULE_FIRED`;
  - `customers.models.Customer`, `Task`;
  - `core.audit.record`.
- Produces:
  - Statuses `DONE = "done"`, `UNCHANGED = "unchanged"`, `QUEUED = "queued"`, `SKIPPED = "skipped"`, `FAILED = "failed"`.
  - `result(action, status, detail="") -> {"action", "status", "detail"}`.
  - `failed(action, exc) -> dict`, whose detail is `"<ExceptionClass>: could not be done"`.
  - `parent_of(kind, record)`.
  - `create_task(action, rule, record, kind, *, today, made) -> dict` and `change_lifecycle(action, rule, record, kind, *, today, made) -> dict`. `made` is a `set` of parents already given a task tonight.
  - `INTERNAL = {"task": create_task, "lifecycle": change_lifecycle}`.
  - `digest_message(rule, kind, records, note) -> str`.
  - `plan_digests(action, rule, records, kind) -> dict[User, list[record]]`.
  - `send_digests(rule, run, plan, kind, note) -> tuple[set[int], set[int]]`: the record ids told, and those every digest failed.
  - `notify_statuses(action, rule, run, records, kind) -> dict[int, dict]`.
  - Each needs `rule.owner`, `rule.organisation` and `rule.segment` loaded.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_actions.py`:

```python
"""What a rule does to each record, as its owner: one task per organisation
or account, a lifecycle stage audited with old and new values, and one
digest per recipient naming only what that recipient may open."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Account, Customer, Task
from services.notifications.models import Notification
from services.rules import actions
from services.rules.actions import (
    change_lifecycle,
    create_task,
    digest_message,
    notify_statuses,
    plan_digests,
    send_digests,
)
from services.rules.models import RuleRun
from services.rules.records import load
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, TASK, RuleFixture
from services.surveys.tests.fixtures import contact


class ActionFixture(RuleFixture):
    def run_for(self, rule):
        return RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)

    def everyone(self):
        """Alice's segment of Pizza Hut (Carl's) and Taco Bell (Dana's)."""
        return self.pinned("customer", [self.pizza, self.taco], owner=self.admin, name="Everyone")


class TaskTests(ActionFixture):
    def make(self, rule, records, kind="customer", action=TASK):
        made = set()
        return [
            create_task(action, rule, record, kind, today=self.today, made=made)
            for record in records
        ]

    def test_a_task_on_the_record_for_the_rules_owner(self):
        rule = self.make_rule(actions=[TASK])
        statuses = self.make(rule, load("customer", [self.pizza.pk]))
        self.assertEqual(statuses, [{"action": "task", "status": "done", "detail": ""}])
        task = Task.objects.get()
        self.assertEqual(
            (task.customer, task.title, task.assignee, task.assignee_name, task.created_by),
            (self.pizza, "Call them", self.csm, "Carl CSM", self.csm),
        )
        self.assertEqual(
            (task.due_date, task.priority, task.status),
            (self.today + timedelta(days=3), "medium", "pending"),
        )

    def test_record_owner_is_the_records_own_owner(self):
        action = {**TASK, "assignee": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        self.make(rule, load("customer", [self.pizza.pk, self.taco.pk]), action=action)
        assignees = dict(Task.objects.values_list("customer_id", "assignee_id"))
        self.assertEqual(assignees, {self.pizza.pk: self.csm.pk, self.taco.pk: self.other.pk})

    def test_no_owner_or_an_inactive_one_falls_back_to_the_rules_owner(self):
        action = {**TASK, "assignee": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        Customer.objects.filter(pk=self.pizza.pk).update(owner=None)
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.make(rule, load("customer", [self.pizza.pk, self.taco.pk]), action=action)
        self.assertEqual(set(Task.objects.values_list("assignee_id", flat=True)), {self.admin.pk})

    def test_contacts_get_one_task_on_their_own_organisation_or_account(self):
        people = self.pinned("contact", [self.ann, self.ben], name="People")
        rule = self.make_rule(segment=people, actions=[TASK])
        pia = contact(self.pizza, "Pia")
        self.make(rule, load("contact", [self.ann.pk, pia.pk, self.ben.pk]), kind="contact")
        self.assertEqual(
            sorted(Task.objects.values_list("customer_id", "account_id")),
            sorted([(self.pizza.pk, None), (None, self.emea.pk)]),
        )


class LifecycleTests(ActionFixture):
    def change(self, rule, record, kind="customer"):
        return change_lifecycle(LIFECYCLE, rule, record, kind, today=self.today, made=set())

    def test_the_stage_changes_and_is_audited_with_old_and_new(self):
        rule = self.make_rule(actions=[LIFECYCLE])
        status = self.change(rule, self.pizza)
        self.assertEqual(
            status, {"action": "lifecycle", "status": "done", "detail": "onboarding → renewal"}
        )
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")
        event = AuditEvent.objects.get(action="rule.field_changed")
        self.assertEqual(
            (event.actor, event.organisation, event.target_type, event.target_id),
            (None, self.org, "customers.customer", str(self.pizza.pk)),
        )
        self.assertEqual(event.target_repr, f"Customer {self.pizza.pk}")
        self.assertEqual(
            event.metadata,
            {"rule": rule.pk, "field": "lifecycle_stage", "old": "onboarding", "new": "renewal"},
        )

    def test_an_account_changes_too(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        rule = self.make_rule(segment=accounts, actions=[LIFECYCLE])
        self.change(rule, self.emea, kind="account")
        self.assertEqual(Account.objects.get(pk=self.emea.pk).lifecycle_stage, "renewal")
        self.assertEqual(
            AuditEvent.objects.get(action="rule.field_changed").target_repr,
            f"Account {self.emea.pk}",
        )

    def test_a_stage_already_in_place_is_unchanged_and_not_audited(self):
        Customer.objects.filter(pk=self.pizza.pk).update(lifecycle_stage="renewal")
        status = self.change(self.make_rule(actions=[LIFECYCLE]), self.pizza)
        self.assertEqual(
            status, {"action": "lifecycle", "status": "unchanged", "detail": "renewal"}
        )
        self.assertFalse(AuditEvent.objects.filter(action="rule.field_changed").exists())


class DigestMessageTests(ActionFixture):
    def test_names_three_organisations_then_counts(self):
        rule = self.make_rule()
        extra = [
            Customer.objects.create(organisation=self.org, name=name, owner=self.csm)
            for name in ("Apex", "Bolt")
        ]
        records = [self.pizza, self.dough, *extra]
        self.assertEqual(
            digest_message(rule, "customer", records, ""),
            "Renewal watch: Apex, Bolt, Dough Co and 1 more entered My book",
        )

    def test_contacts_are_counted_never_named(self):
        rule = self.make_rule(trigger="left")
        self.assertEqual(
            digest_message(rule, "contact", [self.ann], ""), "Renewal watch: 1 contact left My book"
        )
        self.assertEqual(
            digest_message(rule, "contact", [self.ann, self.dot], ""),
            "Renewal watch: 2 contacts left My book",
        )

    def test_crossed_and_schedule_wording(self):
        crossed = self.make_rule(
            trigger="crossed", score="csat", direction="below", threshold=Decimal("60.00")
        )
        self.assertEqual(
            digest_message(crossed, "customer", [self.pizza], ""),
            "Renewal watch: Pizza Hut CSAT fell below 60",
        )
        weekly = self.make_rule(trigger="schedule", cadence="weekly", weekday=0)
        self.assertEqual(
            digest_message(weekly, "customer", [self.pizza], ""),
            "Renewal watch: Pizza Hut came up on the weekly schedule",
        )

    def test_the_owners_note_follows_and_the_head_is_cut_to_200(self):
        rule = self.make_rule(name="x" * 120)
        long_names = [
            Customer.objects.create(organisation=self.org, name=f"{letter}" * 60, owner=self.csm)
            for letter in "abc"
        ]
        message = digest_message(rule, "customer", long_names, "Call them today")
        head, note = message.split(" · ")
        self.assertEqual((len(head), note), (200, "Call them today"))


class PlanTests(ActionFixture):
    def plan(self, action, rule, ids, kind="customer"):
        planned = plan_digests(action, rule, load(kind, ids), kind)
        return {user.pk: [record.pk for record in records] for user, records in planned.items()}

    def test_me_is_the_rules_owner(self):
        rule = self.make_rule()
        self.assertEqual(
            self.plan(NOTIFY_ME, rule, [self.pizza.pk, self.dough.pk]),
            {self.csm.pk: [self.pizza.pk, self.dough.pk]},
        )

    def test_a_record_owner_hears_only_about_their_own(self):
        action = {**NOTIFY_ME, "to": "record_owner"}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        self.assertEqual(
            self.plan(action, rule, [self.pizza.pk, self.taco.pk]),
            {self.csm.pk: [self.pizza.pk], self.other.pk: [self.taco.pk]},
        )

    def test_people_hear_only_about_records_they_may_open(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        self.assertEqual(
            self.plan(action, rule, [self.pizza.pk, self.taco.pk]),
            {self.csm.pk: [self.pizza.pk], self.other.pk: [self.taco.pk]},
        )

    def test_someone_who_may_open_none_of_it_hears_nothing(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.other.pk]}
        rule = self.make_rule(actions=[action])
        self.assertEqual(self.plan(action, rule, [self.pizza.pk]), {})

    def test_inactive_people_and_other_workspaces_hear_nothing(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.other.pk, self.stranger.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.assertEqual(self.plan(action, rule, [self.taco.pk]), {})


class SendTests(ActionFixture):
    def test_one_digest_per_recipient_linked_only_for_readers_of_the_rule(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        rule.shared_with.set([self.csm])
        rule.sharing = "people"
        rule.save(update_fields=["sharing"])
        run = self.run_for(rule)
        records = load("customer", [self.pizza.pk, self.taco.pk])
        statuses = notify_statuses(action, rule, run, records, "customer")
        self.assertEqual({status["status"] for status in statuses.values()}, {"done"})
        rows = Notification.objects.filter(kind="rule_fired").order_by("recipient_id")
        self.assertEqual(
            [(row.recipient_id, row.message, row.link) for row in rows],
            [
                (
                    self.csm.pk,
                    "Renewal watch: Pizza Hut entered Everyone",
                    f"/scenarios/rules/{rule.pk}?run={run.pk}",
                ),
                (self.other.pk, "Renewal watch: Taco Bell entered Everyone", ""),
            ],
        )

    def test_a_record_nobody_may_be_told_about_is_skipped(self):
        action = {**NOTIFY_ME, "to": "record_owner"}
        rule = self.make_rule(actions=[action])
        Customer.objects.filter(pk=self.dough.pk).update(owner=None)
        run = self.run_for(rule)
        statuses = notify_statuses(
            action, rule, run, load("customer", [self.pizza.pk, self.dough.pk]), "customer"
        )
        self.assertEqual(
            (statuses[self.pizza.pk]["status"], statuses[self.dough.pk]),
            ("done", {"action": "notify", "status": "skipped", "detail": actions.NOBODY}),
        )

    def test_one_failed_digest_never_stops_the_others(self):
        action = {**NOTIFY_ME, "to": "people", "people": [self.csm.pk, self.other.pk]}
        rule = self.make_rule(owner=self.admin, segment=self.everyone(), actions=[action])
        run = self.run_for(rule)
        real = actions.notify

        def flaky(**kwargs):
            if kwargs["recipient"].pk == self.other.pk:
                raise RuntimeError("down")
            return real(**kwargs)

        records = load("customer", [self.pizza.pk, self.taco.pk])
        plan = plan_digests(action, rule, records, "customer")
        with patch.object(actions, "notify", side_effect=flaky):
            with self.assertLogs("services.rules.actions", "WARNING") as logs:
                told, lost = send_digests(rule, run, plan, "customer", "")
        self.assertEqual((told, lost), ({self.pizza.pk}, {self.taco.pk}))
        self.assertEqual(Notification.objects.filter(kind="rule_fired").count(), 1)
        self.assertIn("RuntimeError", logs.output[0])
        self.assertNotIn("down", logs.output[0])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_actions --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.rules.actions'`.

- [ ] **Step 3: Write `actions.py`**

`services/rules/actions.py`:

```python
"""What a rule does to the records it fires on (spec §1.3), as its owner.

The internal actions run at once. The caller runs each record and action
in its own savepoint:
- a task per organisation or account (a contact's lands on its own);
- a lifecycle stage, set under the record's row lock and audited per record
  with the old and new values;
- one notification digest per recipient, naming only records that recipient
  may open.

The survey is customer-facing and goes through `reviews.py`. A status's
`detail` never holds personal data or an exception's text, which can quote
a row's values. Log lines carry ids and exception class names only."""

import logging
from datetime import timedelta

from django.db import transaction

from core import audit
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.notifications.models import Notification
from services.notifications.realtime import notify

from .access import readable_rules
from .models import Rule
from .records import openable

logger = logging.getLogger(__name__)

DONE, UNCHANGED, QUEUED, SKIPPED, FAILED = "done", "unchanged", "queued", "skipped", "failed"
NOUNS = {
    "customer": ("organisation", "organisations"),
    "account": ("account", "accounts"),
    "contact": ("contact", "contacts"),
}
#: A digest names this many organisations or accounts, then counts the rest.
#: Contacts are only counted: their names are personal data.
NAMED = 3
#: The digest's own words are cut to this before the owner's note.
DIGEST_HEAD = 200
NOBODY = "nobody to notify may open it"
NOT_DONE = "could not be done"


def result(action, status, detail=""):
    return {"action": action, "status": status, "detail": detail}


def failed(action, exc):
    """A failure by its class name and a fixed phrase, never its text."""
    return result(action, FAILED, f"{type(exc).__name__}: {NOT_DONE}"[:200])


def parent_of(kind, record):
    """Where a record's task lands: the record itself, or a contact's own
    organisation or account."""
    if kind != "contact":
        return record
    return record.customer if record.customer_id else record.account


def create_task(action, rule, record, kind, *, today, made):
    """One task per organisation or account per night: `made` holds the
    parents already given one. `record_owner` is the parent's own owner,
    falling back to the rule's owner when there is none or they are
    inactive."""
    parent = parent_of(kind, record)
    key = (type(parent).__name__, parent.pk)
    if key in made:
        return result("task", DONE)
    assignee = parent.owner if action["assignee"] == "record_owner" else rule.owner
    if assignee is None or not assignee.is_active:
        assignee = rule.owner
    on = {"customer": parent} if isinstance(parent, Customer) else {"account": parent}
    Task.objects.create(
        **on,
        title=action["title"],
        assignee=assignee,
        assignee_name=assignee.name[:150],
        created_by=rule.owner,
        due_date=today + timedelta(days=action["due_in_days"]),
        priority=Task.Priority.MEDIUM,
    )
    made.add(key)
    return result("task", DONE)


def change_lifecycle(action, rule, record, kind, *, today, made):
    """The stage on an organisation or account, read and written under its
    row lock, audited with the old and new values. The same stage is
    `unchanged` and not audited."""
    model = type(record)
    row = (
        model.objects.select_for_update(of=("self",))
        .only("pk", "lifecycle_stage")
        .get(pk=record.pk)
    )
    old, new = row.lifecycle_stage, action["stage"]
    if old == new:
        return result("lifecycle", UNCHANGED, old)
    row.lifecycle_stage = new
    row.save(update_fields=["lifecycle_stage"])
    audit.record(  # SOC2:LOG-01
        "rule.field_changed",
        organisation=rule.organisation,
        target=row,
        target_repr=f"{model.__name__} {row.pk}",
        metadata={"rule": rule.pk, "field": "lifecycle_stage", "old": old, "new": new},
    )
    return result("lifecycle", DONE, f"{old} → {new}")


#: The actions run per record, in the caller's savepoint.
INTERNAL = {"task": create_task, "lifecycle": change_lifecycle}


def _what(rule):
    segment = rule.segment.name if rule.segment is not None else "the segment"
    if rule.trigger == Rule.Trigger.ENTERED:
        return f"entered {segment}"
    if rule.trigger == Rule.Trigger.LEFT:
        return f"left {segment}"
    if rule.trigger == Rule.Trigger.CROSSED:
        verb = "fell below" if rule.direction == Rule.Direction.BELOW else "rose above"
        line = format(rule.threshold.normalize(), "f")
        return f"{Rule.Score(rule.score).label} {verb} {line}"
    cadence = "weekly" if rule.cadence == Rule.Cadence.WEEKLY else "monthly"
    return f"came up on the {cadence} schedule"


def digest_message(rule, kind, records, note):
    """ "Renewal watch: Pizza Hut, Initech and 1 more entered At risk ·
    <note>". Organisations and accounts by name, contacts by count."""
    singular, plural = NOUNS[kind]
    count = len(records)
    if kind == "contact":
        who = f"{count} {singular if count == 1 else plural}"
    else:
        shown = sorted(record.name for record in records)
        who = ", ".join(shown[:NAMED])
        if count > NAMED:
            who += f" and {count - NAMED} more"
    head = f"{rule.name}: {who} {_what(rule)}"[:DIGEST_HEAD]
    return f"{head} · {note}" if note else head


def plan_digests(action, rule, records, kind):
    """`{recipient: [records]}` for one notify action: each active person in
    the rule's workspace, told only about records they may open. `me` is the
    rule's owner; `record_owner` groups records by their own owner."""
    if action["to"] == "me":
        wanted = {rule.owner_id: list(records)}
    elif action["to"] == "record_owner":
        wanted = {}
        for record in records:
            owner_id = parent_of(kind, record).owner_id
            if owner_id is not None:
                wanted.setdefault(owner_id, []).append(record)
    else:
        wanted = {pk: list(records) for pk in action["people"]}
    if not wanted:
        return {}
    # SOC2:AUTH-02 only active people in the rule's own workspace are told anything
    people = User.objects.filter(
        pk__in=list(wanted), organisation_id=rule.organisation_id, is_active=True
    ).order_by("pk")
    plan = {}
    for user in people:
        group = wanted[user.pk]
        ids = [record.pk for record in group]
        allowed = set(openable(kind, user, ids).values_list("pk", flat=True))
        mine = [record for record in group if record.pk in allowed]
        if mine:
            plan[user] = mine
    return plan


def send_digests(rule, run, plan, kind, note):
    """One `rule_fired` notification per recipient, each in its own
    savepoint. A recipient who may read the rule gets a link to tonight's
    run; anyone else gets none (that page would be a 404 for them).
    Returns `(told, lost)`: the record ids at least one digest reached, and
    those every digest failed."""
    told, lost = set(), set()
    for user, records in plan.items():
        ids = {record.pk for record in records}
        # SOC2:AUTH-02 the run's link only for someone who may read the rule
        reads = readable_rules(user).filter(pk=rule.pk).exists()
        try:
            with transaction.atomic():
                notify(
                    recipient=user,
                    actor=None,
                    kind=Notification.Kind.RULE_FIRED,
                    message=digest_message(rule, kind, records, note),
                    link=f"/scenarios/rules/{rule.pk}?run={run.pk}" if reads else "",
                    push_on_commit=True,
                )
            told |= ids
        except Exception as exc:  # noqa: BLE001 - one digest's failure never stops the others
            logger.warning(
                "rule %s: digest to user %s not sent: %s", rule.pk, user.pk, type(exc).__name__
            )
            lost |= ids
    return told, lost - told


def notify_statuses(action, rule, run, records, kind):
    """Plans and sends one notify action's digests: `{record_id: status}`."""
    plan = plan_digests(action, rule, records, kind)
    told, lost = send_digests(rule, run, plan, kind, action["message"])
    statuses = {}
    for record in records:
        if record.pk in told:
            statuses[record.pk] = result("notify", DONE)
        elif record.pk in lost:
            statuses[record.pk] = result("notify", FAILED, NOT_DONE)
        else:
            statuses[record.pk] = result("notify", SKIPPED, NOBODY)
    return statuses
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules.tests.test_actions --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/actions.py services/rules/tests/test_actions.py
git commit -m "feat(rules): tasks, audited lifecycle changes and per-recipient digests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reviews: approve, skip, expire, and sending through Surveys

Spec §1.1 (`RuleReview`), §1.3 (survey) and §1.5 (approve returns `{survey_send_id}` or the refusal). Decisions 13–17, 22 and 25.

**Files:**
- Create: `services/rules/reviews.py`
- Test: `services/rules/tests/test_reviews.py`

**Interfaces:**
- Consumes:
  - `surveys.audience.resolve(..., records=)`;
  - `surveys.sending.claim(..., records=)`, `deliver`, `finish`, `Refusal`, `email_is_set_up`, `EMAIL_NOT_SET_UP`;
  - `SurveySend`;
  - `RuleReview`, `REVIEW_DAYS`.
- Produces:
  - `ALREADY_DECIDED = "This review has already been decided."`;
  - `class Decided(Exception)` (a 409);
  - `Answer(status: int, body: dict)`;
  - `survey_name(rule, run_on) -> str`;
  - `create_review(rule, run, record_ids, action, *, today) -> RuleReview`;
  - `get_owned_review(user, pk) -> RuleReview` (404 for anyone but the rule's owner);
  - `send_review(review_id, *, actor, today, now, request=None) -> Answer` (raises `Decided`);
  - `skip_review(review_id, user, *, now, request=None) -> RuleReview` (raises `Decided`);
  - `expire_reviews(organisation=None, *, now) -> int`.
  - A review returned by `skip_review` has `rule__owner`, `rule__segment`, `rule__organisation` and `run` loaded.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_reviews.py`:

```python
"""A night's survey: one review the owner approves or skips, or a survey
sent at once without review. It goes through services.surveys to the fired
records only, so every Surveys rule holds; a refusal is stored and the
review waits; waiting reviews expire after 7 days."""

from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.http import Http404
from django.test import override_settings

from core.models import AuditEvent
from services.rules import reviews
from services.rules.models import RuleReview, RuleRun
from services.rules.reviews import (
    ALREADY_DECIDED,
    Answer,
    Decided,
    create_review,
    expire_reviews,
    get_owned_review,
    send_review,
    skip_review,
    survey_name,
)
from services.rules.tests.fixtures import SURVEY, RuleFixture
from services.surveys.models import DAILY_SENDS, SurveyInvite, SurveySend
from services.surveys.sending import CONSOLE_BACKEND, DAILY_LIMIT, EMAIL_NOT_SET_UP


class ReviewFixture(RuleFixture):
    def setUp(self):
        self.rule = self.make_rule(actions=[SURVEY])
        self.run = RuleRun.objects.create(rule=self.rule, run_on=self.today, started_at=self.now)

    def review(self, records):
        return create_review(
            self.rule, self.run, [record.pk for record in records], SURVEY, today=self.today
        )

    def approve(self, review, actor="owner"):
        return send_review(
            review.pk,
            actor=self.csm if actor == "owner" else actor,
            today=self.today,
            now=self.now,
        )

    def events(self, action):
        return list(AuditEvent.objects.filter(action=action).values_list("actor_id", "metadata"))


class CreateTests(ReviewFixture):
    def test_a_review_freezes_the_action_and_counts_who_it_reaches(self):
        review = self.review([self.pizza, self.dough])
        self.assertEqual(
            (review.status, review.action, review.run, review.rule),
            ("waiting", SURVEY, self.run, self.rule),
        )
        self.assertEqual(
            review.records,
            [{"kind": "customer", "id": self.pizza.pk}, {"kind": "customer", "id": self.dough.pk}],
        )
        # Ann (Pizza Hut), Ben (on Pizza EMEA, an account of Pizza Hut's) and Dot (Dough Co)
        self.assertEqual(review.counts, {"people": 3, "records": 3})

    def test_the_surveys_name_carries_the_nights_date_and_fits(self):
        self.assertEqual(survey_name(self.rule, self.today).split(" · ")[0], "Renewal watch")
        self.rule.name = "x" * 120
        self.assertEqual(len(survey_name(self.rule, self.today)), 120)


class ApproveTests(ReviewFixture):
    def test_approving_sends_a_survey_to_the_fired_records_only(self):
        review = self.review([self.dough])
        answer = self.approve(review)
        send = SurveySend.objects.get()
        self.assertEqual(answer, Answer(200, {"survey_send_id": send.pk}))
        self.assertEqual(
            (send.owner, send.name, send.survey_type, send.status, send.segment),
            (self.csm, survey_name(self.rule, self.today), "nps", "sent", self.book),
        )
        invited = SurveyInvite.objects.filter(send=send).values_list("contact__name", flat=True)
        self.assertEqual(list(invited), ["Dot"])
        self.assertEqual([message.to for message in mail.outbox], [["dot@example.com"]])
        review.refresh_from_db()
        self.assertEqual(
            (review.status, review.decided_by, review.decided_at, review.result),
            ("approved", self.csm, self.now, {"survey_send_id": send.pk}),
        )
        self.assertEqual(
            self.events("rule.review_approved"),
            [
                (
                    self.csm.pk,
                    {"rule": self.rule.pk, "survey_send": send.pk, "without_review": False},
                )
            ],
        )
        (sent,) = self.events("survey.sent")
        self.assertEqual((sent[1]["rule"], sent[1]["sent"]), (self.rule.pk, 1))

    def test_without_review_is_approved_by_nobody(self):
        review = self.review([self.dough])
        self.approve(review, actor=None)
        review.refresh_from_db()
        self.assertEqual((review.status, review.decided_by), ("approved", None))
        (event,) = self.events("rule.review_approved")
        self.assertEqual((event[0], event[1]["without_review"]), (None, True))

    def test_a_record_the_owner_cannot_open_is_never_surveyed(self):
        review = create_review(
            self.rule, self.run, [self.dough.pk, self.taco.pk], SURVEY, today=self.today
        )
        self.approve(review)
        self.assertEqual(
            list(SurveyInvite.objects.values_list("contact__name", flat=True)), ["Dot"]
        )

    def test_a_decided_review_is_409(self):
        review = self.review([self.dough])
        self.approve(review)
        with self.assertRaises(Decided):
            self.approve(review)
        with self.assertRaises(Decided):
            skip_review(review.pk, self.csm, now=self.now)
        self.assertEqual(ALREADY_DECIDED, "This review has already been decided.")


class RefusalTests(ReviewFixture):
    def assert_waits_with(self, review, body):
        review.refresh_from_db()
        self.assertEqual((review.status, review.result), ("waiting", {"error": body}))

    def test_nobody_to_ask_is_stored_and_the_review_waits(self):
        self.make_invite(self.make_send(), self.dot, created_at=self.now)  # surveyed recently
        sends = SurveySend.objects.count()
        review = self.review([self.dough])
        answer = self.approve(review)
        self.assertEqual(answer, Answer(400, {"segment": ["Nobody to send to."]}))
        self.assert_waits_with(review, {"segment": ["Nobody to send to."]})
        self.assertEqual(SurveySend.objects.count(), sends)  # the draft rolled back

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_email_not_set_up_is_a_refusal(self):
        review = self.review([self.dough])
        self.assertEqual(self.approve(review), Answer(400, {"detail": EMAIL_NOT_SET_UP}))
        self.assert_waits_with(review, {"detail": EMAIL_NOT_SET_UP})

    def test_the_daily_limit_holds(self):
        SurveySend.objects.bulk_create(
            [
                SurveySend(
                    organisation=self.org,
                    owner=self.csm,
                    name=f"Send {i}",
                    survey_type="nps",
                    subject="s",
                    status="sent",
                    started_at=self.now,
                )
                for i in range(DAILY_SENDS)
            ]
        )
        review = self.review([self.dough])
        self.assertEqual(self.approve(review), Answer(400, {"detail": DAILY_LIMIT}))
        self.assert_waits_with(review, {"detail": DAILY_LIMIT})

    def test_a_refused_review_can_be_approved_once_fixed(self):
        review = self.review([self.dough])
        with override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND):
            self.approve(review)
        self.assertEqual(self.approve(review).status, 200)


class SkipAndExpireTests(ReviewFixture):
    def test_skipping(self):
        review = skip_review(self.review([self.dough]).pk, self.csm, now=self.now)
        self.assertEqual((review.status, review.decided_by), ("skipped", self.csm))
        self.assertEqual(
            self.events("rule.review_skipped"), [(self.csm.pk, {"rule": self.rule.pk})]
        )
        self.assertFalse(SurveySend.objects.exists())

    def age(self, review, days):
        RuleReview.objects.filter(pk=review.pk).update(created_at=self.now - timedelta(days=days))

    def other_night(self, days_ago):
        run = RuleRun.objects.create(
            rule=self.rule, run_on=self.today - timedelta(days=days_ago), started_at=self.now
        )
        return create_review(self.rule, run, [self.dough.pk], SURVEY, today=self.today)

    def test_waiting_reviews_expire_after_seven_days(self):
        old, young = self.review([self.dough]), self.other_night(1)
        self.age(old, 7)
        self.age(young, 6)
        self.assertEqual(expire_reviews(now=self.now), 1)
        old.refresh_from_db()
        young.refresh_from_db()
        self.assertEqual(
            (old.status, old.decided_at, young.status), ("expired", self.now, "waiting")
        )
        self.assertEqual(self.events("rule.review_expired"), [(None, {"rule": self.rule.pk})])

    def test_a_decided_review_never_expires(self):
        review = self.review([self.dough])
        skip_review(review.pk, self.csm, now=self.now)
        self.age(review, 30)
        self.assertEqual(expire_reviews(now=self.now), 0)

    def test_one_workspace_at_a_time(self):
        self.age(self.review([self.dough]), 8)
        self.assertEqual(expire_reviews(self.other_org, now=self.now), 0)
        self.assertEqual(expire_reviews(self.org, now=self.now), 1)

    def test_one_expiry_failure_never_stops_the_rest(self):
        first, second = self.review([self.dough]), self.other_night(1)
        self.age(first, 8)
        self.age(second, 8)
        real = reviews.audit.record
        calls = []

        def flaky(action, **kwargs):
            calls.append(action)
            if len(calls) == 1:
                raise RuntimeError("audit down")
            return real(action, **kwargs)

        with patch.object(reviews.audit, "record", side_effect=flaky):
            with self.assertLogs("services.rules.reviews", "ERROR"):
                self.assertEqual(expire_reviews(now=self.now), 1)
        statuses = sorted(RuleReview.objects.values_list("status", flat=True))
        self.assertEqual(statuses, ["expired", "waiting"])


class OwnedReviewTests(ReviewFixture):
    def test_only_the_rules_owner_may_open_a_review(self):
        review = self.review([self.dough])
        self.assertEqual(get_owned_review(self.csm, review.pk), review)
        for user in (self.admin, self.other, self.stranger):
            with self.assertRaises(Http404):
                get_owned_review(user, review.pk)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_reviews --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.rules.reviews'`.

- [ ] **Step 3: Write `reviews.py`**

`services/rules/reviews.py`:

```python
"""A rule's survey (spec §1.3). The night's fired records become one review
for the owner to approve or skip, or a survey sent at once when the rule
says "without review" (`send_review(actor=None)`).

Either way the survey goes through services.surveys, so every Surveys rule
holds: the 30-day quiet period, three per record, 500 people, 20 sends a
day, and email set up. Its audience is only the night's fired records that
the owner may still open (`resolve(records=...)`), resolved again at
approval time.

Lock order, everywhere: the review's row, then the surveys claim's own
(workspace, owner, send). Nothing takes a review's lock after those.

A refusal is stored on the review and leaves it waiting, so the owner can
try again once it is fixed, or skip it. The survey's draft is created in
the claim's savepoint, so a refusal leaves no draft behind that a later
send by hand could take to the whole segment."""

import logging
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core import audit
from services.surveys.audience import resolve
from services.surveys.models import SurveySend
from services.surveys.sending import (
    EMAIL_NOT_SET_UP,
    Refusal,
    claim,
    deliver,
    email_is_set_up,
    finish,
)

from .models import REVIEW_DAYS, RuleReview

logger = logging.getLogger(__name__)

ALREADY_DECIDED = "This review has already been decided."
#: `SurveySend.name`'s length.
SEND_NAME = 120


class Decided(Exception):
    """The review is no longer waiting: the API answers 409."""


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict


def survey_name(rule, run_on):
    """ "Renewal watch · 4 Oct 2026": the rule's name, cut so the whole fits."""
    suffix = f" · {run_on.day} {run_on:%b %Y}"
    return f"{rule.name[: SEND_NAME - len(suffix)]}{suffix}"


def create_review(rule, run, record_ids, action, *, today):
    """The night's survey, waiting: the action frozen, the fired records,
    and how many people they reach as the owner sees them now (the review
    item's "6 people at 4 organisations")."""
    # SOC2:AUTH-02 counted as the owner: their segment, the fired records they may open
    audience = resolve(rule.segment, action["roles"], rule.owner, today=today, records=record_ids)
    return RuleReview.objects.create(
        rule=rule,
        run=run,
        action=dict(action),
        records=[{"kind": rule.segment.kind, "id": pk} for pk in record_ids],
        counts={"people": len(audience.people), "records": audience.organisations},
    )


def get_owned_review(user, pk):
    """A review of one of `user`'s rules, or a 404 that reads the same for a
    missing one and anyone else's."""
    # SOC2:AUTH-02 only the rule's owner reads or decides its reviews
    reviews = RuleReview.objects.filter(
        rule__owner=user, rule__organisation_id=user.organisation_id
    )
    return get_object_or_404(reviews, pk=pk)


def _locked(review_id):
    """The review under its row lock, with what deciding it reads. Raises
    `Decided` unless it is waiting. Call inside a transaction."""
    review = (
        RuleReview.objects.select_for_update(of=("self",))
        .select_related("rule__owner", "rule__segment", "rule__organisation", "run")
        .get(pk=review_id)
    )
    if review.status != RuleReview.Status.WAITING:
        raise Decided
    return review


def _refused(review, refusal):
    review.result = {"error": refusal.body}
    review.save(update_fields=["result"])
    return Answer(400, refusal.body)


def send_review(review_id, *, actor, today, now, request=None):
    """Approves a waiting review and sends its survey as the rule's owner.
    `actor` is the owner approving, or None for a rule that sends without
    review. Returns `Answer(200, {"survey_send_id"})`, or `Answer(400,
    <Surveys' refusal>)`, which is stored on the review while it stays
    waiting. Raises `Decided` once it is no longer waiting. The emails go
    out after the commit, outside any transaction, as Surveys' own send."""
    with transaction.atomic():
        review = _locked(review_id)
        rule, action = review.rule, review.action
        if not email_is_set_up():
            return _refused(review, Refusal(400, {"detail": EMAIL_NOT_SET_UP}))
        try:
            with transaction.atomic():
                draft = SurveySend.objects.create(
                    organisation_id=rule.organisation_id,
                    owner=rule.owner,
                    name=survey_name(rule, review.run.run_on),
                    survey_type=action["survey_type"],
                    subject=action["subject"],
                    intro=action["intro"],
                    segment=rule.segment,
                    roles=action["roles"],
                )
                # SOC2:AUTH-02 the claim resolves the audience again as the owner,
                # from the fired records they may still open
                send, audience, deliveries = claim(
                    draft.pk,
                    rule.owner,
                    today=today,
                    now=now,
                    records=[item["id"] for item in review.records],
                )
        except Refusal as refusal:
            return _refused(review, refusal)
        review.status = RuleReview.Status.APPROVED
        review.decided_by, review.decided_at = actor, now
        review.result = {"survey_send_id": send.pk}
        review.save(update_fields=["status", "decided_by", "decided_at", "result"])
        audit.record(  # SOC2:LOG-01
            "rule.review_approved",
            request=request,
            actor=actor,
            organisation=rule.organisation,
            target=review,
            metadata={"rule": rule.pk, "survey_send": send.pk, "without_review": actor is None},
        )
    try:
        deliver(deliveries)
    finally:
        # a delivery cut off mid-batch still ends `sent`, counted and audited
        finish(send, audience, now=timezone.now())
        audit.record(  # SOC2:LOG-01
            "survey.sent",
            request=request,
            actor=actor,
            organisation=rule.organisation,
            target=send,
            metadata={**send.counts, "rule": rule.pk},
        )
    return Answer(200, {"survey_send_id": send.pk})


def skip_review(review_id, user, *, now, request=None):
    """The owner skips a waiting review: no survey. Raises `Decided` once it
    is no longer waiting."""
    with transaction.atomic():
        review = _locked(review_id)
        review.status = RuleReview.Status.SKIPPED
        review.decided_by, review.decided_at = user, now
        review.save(update_fields=["status", "decided_by", "decided_at"])
        audit.record(  # SOC2:LOG-01
            "rule.review_skipped",
            request=request,
            actor=user,
            organisation=review.rule.organisation,
            target=review,
            metadata={"rule": review.rule_id},
        )
    return review


def expire_reviews(organisation=None, *, now):
    """Every review waiting `REVIEW_DAYS` or more becomes `expired`, each in
    its own transaction under its row lock. One failure is logged by id and
    never stops the rest. Returns how many expired."""
    due = RuleReview.objects.filter(
        status=RuleReview.Status.WAITING, created_at__lte=now - timedelta(days=REVIEW_DAYS)
    )
    if organisation is not None:
        due = due.filter(rule__organisation=organisation)
    expired = 0
    for review_id in list(due.order_by("pk").values_list("pk", flat=True)):
        try:
            with transaction.atomic():
                review = _locked(review_id)
                review.status = RuleReview.Status.EXPIRED
                review.decided_at = now
                review.save(update_fields=["status", "decided_at"])
                audit.record(  # SOC2:LOG-01
                    "rule.review_expired",
                    organisation=review.rule.organisation,
                    target=review,
                    metadata={"rule": review.rule_id},
                )
            expired += 1
        except Decided:
            continue
        except Exception:  # noqa: BLE001 - one review's failure never stops the rest
            logger.exception("Rule review %s: expiry failed", review_id)
    return expired
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules.tests.test_reviews services.surveys --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/reviews.py services/rules/tests/test_reviews.py
git commit -m "feat(rules): approve, skip and expire a rule's survey; sent through Surveys to the fired records

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The nightly step

Spec §1.4, and §1.1's "`last_value` is updated for every member each night". Decisions 3, 6, 7, 14, 20, 21 and 22.

**Files:**
- Create: `services/rules/nightly.py`
- Modify: `services/customers/management/commands/run_health_maintenance.py`
- Test: `services/rules/tests/test_nightly.py`

**Interfaces:**
- Consumes:
  - `selection.select`;
  - `records.load`;
  - `actions.INTERNAL`, `notify_statuses`, `result`, `failed`, `FAILED`, `QUEUED`;
  - `reviews.create_review`, `send_review`, `expire_reviews`;
  - `notifications.realtime.notify`.
- Produces:
  - `RulesResult(ran, fired, reviews, paused, expired, failed)`;
  - `Outcome(ran, fired, paused, review_id, send_now, owner_id)`;
  - `pause_reason(rule) -> str` (a `Rule.Paused` value or `""`);
  - `run_rule(rule_id, *, today, now) -> Outcome` (call inside a transaction);
  - `waiting_message(count) -> str`;
  - `evaluate_rules(organisation=None, *, today=None, now=None) -> RulesResult`;
  - the command line `ran N rule(s): F record(s) fired, R review(s), P paused, E expired, X failed`, or the warning `rules skipped: <error>`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_nightly.py`:

```python
"""The nightly step: each active rule once a night, as its owner, in its own
transaction; each record and action in its own savepoint; the scores and
fired dates stored; a rule whose segment or owner went away switched off;
one review notice per owner; and its place in run_health_maintenance."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.test import override_settings

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.metrics import recording
from services.notifications.models import Notification
from services.rules import actions, nightly
from services.rules.models import Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from services.rules.nightly import RulesResult, evaluate_rules
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, SURVEY, TASK, RuleFixture
from services.segments import nightly as segments_nightly
from services.segments.models import Segment
from services.surveys.models import SurveySend
from services.surveys.sending import CONSOLE_BACKEND

DONE = {"status": "done", "detail": ""}


class NightlyFixture(RuleFixture):
    def night(self, days=0, organisation=None):
        return evaluate_rules(organisation, today=self.today + timedelta(days=days), now=self.now)

    def records(self, rule):
        rows = RuleRunRecord.objects.filter(run__rule=rule).order_by("record_id")
        return list(rows.values_list("record_id", "outcome", "reason"))

    def notes(self, kind="rule_fired"):
        rows = Notification.objects.filter(kind=kind).order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))


class RunTests(NightlyFixture):
    def test_an_entered_rule_acts_on_todays_entries(self):
        rule = self.make_rule(actions=[NOTIFY_ME, TASK])
        self.changed(self.book, [self.pizza])
        result = self.night()
        self.assertEqual((result.ran, result.fired, result.reviews, result.failed), (1, 1, 0, 0))
        run = RuleRun.objects.get(rule=rule)
        self.assertEqual(
            (run.run_on, run.matched, run.fired, run.skipped),
            (self.today, 1, 1, {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0}),
        )
        self.assertIsNotNone(run.finished_at)
        record = RuleRunRecord.objects.get(run=run)
        self.assertEqual(record.actions, [{"action": "notify", **DONE}, {"action": "task", **DONE}])
        self.assertEqual(Task.objects.get().customer, self.pizza)
        self.assertEqual(
            self.notes(),
            [
                (
                    self.csm.pk,
                    "Renewal watch: Pizza Hut entered My book",
                    f"/scenarios/rules/{rule.pk}?run={run.pk}",
                )
            ],
        )
        state = RuleState.objects.get(rule=rule)
        self.assertEqual((state.record_id, state.last_fired_on), (self.pizza.pk, self.today))
        event = AuditEvent.objects.get(action="rule.fired")
        self.assertEqual((event.actor, event.target_id), (None, str(rule.pk)))
        self.assertEqual(
            event.metadata,
            {"run": run.pk, "matched": 1, "fired": 1, "skipped": run.skipped},
        )

    def test_a_quiet_night_writes_its_run_and_no_audit(self):
        rule = self.make_rule()
        self.assertEqual(self.night().ran, 1)
        self.assertTrue(RuleRun.objects.filter(rule=rule, matched=0).exists())
        self.assertFalse(AuditEvent.objects.filter(action="rule.fired").exists())

    def test_one_run_per_rule_per_night(self):
        self.make_rule(actions=[TASK])
        self.changed(self.book, [self.pizza])
        self.night()
        again = self.night()
        self.assertEqual((again.ran, again.fired), (0, 0))
        self.assertEqual(Task.objects.count(), 1)

    def test_rules_that_are_off_are_left_alone(self):
        self.make_rule(is_active=False)
        self.changed(self.book, [self.pizza])
        self.assertEqual(self.night().ran, 0)
        self.assertFalse(RuleRun.objects.exists())

    def test_one_workspace_at_a_time(self):
        mine = self.make_rule()
        Rule.objects.create(
            organisation=self.other_org,
            owner=self.stranger,
            name="Globex",
            trigger="entered",
            is_active=True,
            actions=[NOTIFY_ME],
            segment=self.pinned("customer", [self.globex], owner=self.stranger, name="G"),
        )
        self.assertEqual(self.night(organisation=self.org).ran, 1)
        self.assertEqual(list(RuleRun.objects.values_list("rule_id", flat=True)), [mine.pk])


class CrossedNightTests(NightlyFixture):
    def test_the_first_night_stores_and_the_next_fires(self):
        rule = self.make_rule(
            trigger="crossed", score="csat", direction="below", threshold=Decimal("60")
        )
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=70)
        Customer.objects.filter(pk=self.dough.pk).update(csat_score=50)
        self.assertEqual(self.night().fired, 0)
        stored = dict(RuleState.objects.values_list("record_id", "last_value"))
        self.assertEqual(stored, {self.pizza.pk: Decimal(70), self.dough.pk: Decimal(50)})
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=55)
        self.assertEqual(self.night(days=1).fired, 1)
        state = RuleState.objects.get(rule=rule, record_id=self.pizza.pk)
        self.assertEqual(
            (state.last_value, state.last_fired_on),
            (Decimal(55), self.today + timedelta(days=1)),
        )

    def test_a_member_without_a_score_tonight_forgets_its_last(self):
        self.make_rule(trigger="crossed", score="csat", direction="below", threshold=Decimal("60"))
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=70)
        self.night()
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=None)
        self.night(days=1)
        self.assertIsNone(RuleState.objects.get(record_id=self.pizza.pk).last_value)


class SkipTests(NightlyFixture):
    def test_the_cooldown_is_recorded_on_the_night(self):
        rule = self.make_rule()
        RuleState.objects.create(
            rule=rule,
            record_kind="customer",
            record_id=self.pizza.pk,
            last_fired_on=self.today - timedelta(days=1),
        )
        self.changed(self.book, [self.pizza, self.dough])
        self.night()
        self.assertEqual(
            self.records(rule),
            [(self.pizza.pk, "skipped", "cooldown"), (self.dough.pk, "fired", "")],
        )
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped["cooldown"], 1)

    def test_the_cap_is_counted_with_no_row(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough])
        with patch("services.rules.selection.NIGHTLY_CAP", 1):
            self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "fired", "")])
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped["cap"], 1)

    def test_a_record_the_owner_cannot_open_is_counted_and_never_touched(self):
        rule = self.make_rule(actions=[TASK])
        self.changed(self.book, [self.pizza, self.taco])
        self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "fired", "")])
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped["not_visible"], 1)
        self.assertFalse(Task.objects.filter(customer=self.taco).exists())


class FailureTests(NightlyFixture):
    def flaky_on(self, record):
        def flaky(action, rule, target, kind, *, today, made):
            if target.pk == record.pk:
                raise RuntimeError("Pizza Hut's row said no")
            return actions.change_lifecycle(action, rule, target, kind, today=today, made=made)

        return patch.dict(actions.INTERNAL, {"lifecycle": flaky})

    def test_one_records_failure_is_recorded_and_the_rest_go_on(self):
        rule = self.make_rule(actions=[TASK, LIFECYCLE])
        self.changed(self.book, [self.pizza, self.dough])
        with (
            self.flaky_on(self.pizza),
            self.assertLogs("services.rules.nightly", "WARNING") as logs,
        ):
            self.night()
        pizza = RuleRunRecord.objects.get(run__rule=rule, record_id=self.pizza.pk)
        self.assertEqual(pizza.outcome, "fired")
        self.assertEqual(
            pizza.actions,
            [
                {"action": "task", **DONE},
                {
                    "action": "lifecycle",
                    "status": "failed",
                    "detail": "RuntimeError: could not be done",
                },
            ],
        )
        self.assertEqual(Customer.objects.get(pk=self.dough.pk).lifecycle_stage, "renewal")
        self.assertNotIn("Pizza Hut", logs.output[0])

    def test_a_record_whose_every_action_failed_is_skipped_and_not_cooled_down(self):
        rule = self.make_rule(actions=[LIFECYCLE])
        self.changed(self.book, [self.pizza])
        with self.flaky_on(self.pizza), self.assertLogs("services.rules.nightly", "WARNING"):
            self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "skipped", "failed")])
        run = RuleRun.objects.get(rule=rule)
        self.assertEqual((run.fired, run.skipped["failed"]), (0, 1))
        self.assertFalse(RuleState.objects.filter(last_fired_on__isnull=False).exists())

    def test_one_rules_failure_never_stops_the_rest(self):
        broken = self.make_rule(name="Broken")
        fine = self.make_rule(name="Fine")
        real = nightly.select

        def flaky(rule, owner, **kwargs):
            if rule.pk == broken.pk:
                raise RuntimeError("boom")
            return real(rule, owner, **kwargs)

        with patch.object(nightly, "select", side_effect=flaky):
            with self.assertLogs("services.rules.nightly", "ERROR") as logs:
                result = self.night()
        self.assertEqual((result.ran, result.failed), (1, 1))
        self.assertEqual(list(RuleRun.objects.values_list("rule_id", flat=True)), [fine.pk])
        self.assertIn(f"Rule {broken.pk}: nightly run failed", logs.output[0])


class PauseTests(NightlyFixture):
    def assert_paused(self, rule, reason, label):
        result = self.night()
        rule.refresh_from_db()
        self.assertEqual((result.paused, rule.is_active, rule.paused_reason), (1, False, reason))
        self.assertEqual(
            self.notes(),
            [
                (
                    rule.owner_id,
                    f"Renewal watch was switched off: {label}",
                    f"/scenarios/rules/{rule.pk}",
                )
            ],
        )
        self.assertEqual(
            list(
                AuditEvent.objects.filter(action="rule.paused").values_list("metadata", flat=True)
            ),
            [{"reason": reason}],
        )
        self.night(days=1)
        self.assertEqual(len(self.notes()), 1)  # told once
        self.assertFalse(RuleRun.objects.exists())

    def test_a_rule_whose_segment_is_gone_switches_off(self):
        rule = self.make_rule(segment=self.pinned("customer", [self.pizza], name="Gone"))
        Segment.objects.filter(pk=rule.segment_id).delete()
        self.assert_paused(rule, "segment_gone", "Its segment was deleted.")

    def test_a_segment_no_longer_the_owners_switches_it_off(self):
        rule = self.make_rule(segment=self.pinned("customer", [self.pizza], name="Moved"))
        Segment.objects.filter(pk=rule.segment_id).update(owner=self.other)
        self.assert_paused(rule, "segment_not_owned", "Its segment is no longer the owner's.")

    def test_an_inactive_owner_switches_it_off(self):
        rule = self.make_rule()
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        self.assert_paused(rule, "owner_inactive", "Its owner is no longer active.")


class SurveyNightTests(NightlyFixture):
    def test_each_survey_rule_makes_a_review_and_the_owner_hears_once(self):
        first = self.make_rule(name="First", actions=[SURVEY])
        self.make_rule(name="Second", actions=[SURVEY, NOTIFY_ME])
        self.changed(self.book, [self.dough])
        result = self.night()
        self.assertEqual(result.reviews, 2)
        review = RuleRun.objects.get(rule=first).review
        self.assertEqual(
            (review.status, review.records),
            ("waiting", [{"kind": "customer", "id": self.dough.pk}]),
        )
        self.assertEqual(
            RuleRunRecord.objects.get(run__rule=first).actions,
            [{"action": "survey", "status": "queued", "detail": ""}],
        )
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "2 surveys from your rules are waiting for your review.",
                    "/brain/review",
                )
            ],
        )
        self.assertFalse(SurveySend.objects.exists())

    def test_without_review_sends_at_once(self):
        self.make_rule(actions=[{**SURVEY, "without_review": True}])
        self.changed(self.book, [self.dough])
        self.night()
        review = RuleReview.objects.get()
        self.assertEqual((review.status, review.decided_by), ("approved", None))
        self.assertEqual(SurveySend.objects.get().status, "sent")
        self.assertEqual([message.to for message in mail.outbox], [["dot@example.com"]])
        self.assertEqual(self.notes("rule_review"), [])

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_without_review_refused_waits_and_the_owner_is_told(self):
        self.make_rule(actions=[{**SURVEY, "without_review": True}])
        self.changed(self.book, [self.dough])
        self.night()
        review = RuleReview.objects.get()
        self.assertEqual(review.status, "waiting")
        self.assertIn("error", review.result)
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "A survey from your rules is waiting for your review.",
                    "/brain/review",
                )
            ],
        )

    def test_waiting_reviews_expire_first(self):
        rule = self.make_rule(actions=[SURVEY])
        run = RuleRun.objects.create(
            rule=rule, run_on=self.today - timedelta(days=8), started_at=self.now
        )
        review = RuleReview.objects.create(rule=rule, run=run, action=SURVEY, records=[])
        RuleReview.objects.filter(pk=review.pk).update(created_at=self.now - timedelta(days=8))
        self.assertEqual(self.night().expired, 1)


class MaintenanceStepTests(NightlyFixture):
    def run_job(self, *args):
        out = StringIO()
        call_command("run_health_maintenance", *args, org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_rules_run_after_segments_and_before_the_month_end(self):
        calls = []

        def step(name, value):
            return lambda *args, **kwargs: calls.append(name) or value

        with (
            patch.object(
                segments_nightly,
                "evaluate_nightly",
                side_effect=step("segments", segments_nightly.NightlyResult()),
            ),
            patch.object(
                nightly, "evaluate_rules", side_effect=step("rules", RulesResult(ran=2))
            ) as rules,
            patch.object(recording, "record_period_end", side_effect=step("metrics", (0, 0))),
        ):
            output = self.run_job()
        self.assertEqual(calls, ["segments", "rules", "metrics"])
        self.assertEqual(rules.call_args.args, (self.org,))
        self.assertIn(
            "ran 2 rule(s): 0 record(s) fired, 0 review(s), 0 paused, 0 expired, 0 failed", output
        )

    def test_a_dry_run_skips_it(self):
        with patch.object(nightly, "evaluate_rules") as rules:
            self.run_job("--dry-run")
        rules.assert_not_called()

    def test_a_failure_is_reported_and_the_job_goes_on(self):
        with patch.object(nightly, "evaluate_rules", side_effect=RuntimeError("boom")):
            output = self.run_job()
        self.assertIn("rules skipped: boom", output)
        self.assertIn("metric snapshot(s)", output)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_nightly --noinput`
Expected: ERROR, `ImportError: cannot import name 'nightly' from 'services.rules'`.

- [ ] **Step 3: Write `nightly.py` and the step**

`services/rules/nightly.py`:

```python
"""The nightly step (spec §1.4): every active rule, once a night, as its owner.

`run_health_maintenance` calls `evaluate_rules` after the segments' own step
(so today's entries and exits exist and the scores are fresh) and before
the month-end metrics. Reviews waiting 7 days expire first. Then each
active rule runs in its own transaction:

1. lock the rule's row (the API's edits take the same lock), and skip it if
   tonight's run exists: one run per rule per night;
2. switch it off, with a reason and one notice to the owner, if its segment
   is gone or no longer the owner's, or the owner is inactive;
3. select tonight's records as the owner sees them (`selection.select`);
4. run the internal actions, each record and action in its own savepoint
   (a failure is recorded on that record and the rest go on), send the
   digests, and make the survey's review;
5. write the run and its records, store the scores and fired dates, and
   audit `rule.fired` with counts.

A rule's failure rolls back that rule's night only. It is logged by id and
never stops the rest. After a rule commits, a survey "without review" is
sent (`reviews.send_review`), so delivery stays outside any transaction.
Last, each owner with a survey waiting gets one `rule_review` notice.
Log lines carry ids and exception class names only."""

import logging
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from core import audit
from services.accounts.models import User
from services.notifications.models import Notification
from services.notifications.realtime import notify

from .actions import FAILED, INTERNAL, QUEUED, failed, notify_statuses, result
from .models import MAX_SKIPPED_ROWS, Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from .records import load
from .reviews import create_review, expire_reviews, send_review
from .selection import select

logger = logging.getLogger(__name__)

#: How many state rows one statement writes.
STATE_BATCH = 1000
UNIQUE_STATE = ["rule", "record_kind", "record_id"]


@dataclass
class RulesResult:
    ran: int = 0
    fired: int = 0
    reviews: int = 0
    paused: int = 0
    expired: int = 0
    failed: int = 0


@dataclass(frozen=True)
class Outcome:
    ran: bool = False
    fired: int = 0
    paused: bool = False
    review_id: int | None = None
    send_now: bool = False
    owner_id: int | None = None


def pause_reason(rule):
    """Why the rule may not run any more, or "" when it may."""
    if rule.segment_id is None:
        return Rule.Paused.SEGMENT_GONE
    if rule.segment.owner_id != rule.owner_id:
        return Rule.Paused.SEGMENT_NOT_OWNED
    if not rule.owner.is_active:
        return Rule.Paused.OWNER_INACTIVE
    return ""


def _pause(rule, reason):
    rule.is_active, rule.paused_reason = False, reason
    rule.save(update_fields=["is_active", "paused_reason", "updated_at"])
    audit.record(  # SOC2:LOG-01
        "rule.paused", organisation=rule.organisation, target=rule, metadata={"reason": reason}
    )
    notify(
        recipient=rule.owner,
        actor=None,
        kind=Notification.Kind.RULE_FIRED,
        message=f"{rule.name} was switched off: {Rule.Paused(reason).label}",
        link=f"/scenarios/rules/{rule.pk}",
        push_on_commit=True,
    )


def _act(rule, run, records, kind, *, today):
    """Every action on every record: `{record_id: [status, ...]}` in the
    rule's action order. Tasks and lifecycle run per record, each in its own
    savepoint; the digests go once per recipient; the survey is queued for
    the review."""
    statuses = {record.pk: {} for record in records}
    made = set()
    for record in records:
        for index, action in enumerate(rule.actions):
            run_action = INTERNAL.get(action["action"])
            if run_action is None:
                continue
            try:
                with transaction.atomic():
                    statuses[record.pk][index] = run_action(
                        action, rule, record, kind, today=today, made=made
                    )
            except Exception as exc:  # noqa: BLE001 - one record's failure never stops the rest
                logger.warning(
                    "rule %s: %s on %s %s failed: %s",
                    rule.pk,
                    action["action"],
                    kind,
                    record.pk,
                    type(exc).__name__,
                )
                statuses[record.pk][index] = failed(action["action"], exc)
    for index, action in enumerate(rule.actions):
        if action["action"] == "notify":
            for pk, status in notify_statuses(action, rule, run, records, kind).items():
                statuses[pk][index] = status
        elif action["action"] == "survey":
            for record in records:
                statuses[record.pk][index] = result("survey", QUEUED)
    return {pk: [by_index[i] for i in sorted(by_index)] for pk, by_index in statuses.items()}


def _store_states(rule, kind, selection, fired_ids, *, today):
    """Tonight's score for every member that has one (`crossed`), after
    clearing the rest, and tonight's date on every record that fired."""
    if rule.trigger == Rule.Trigger.CROSSED:
        rule.states.filter(last_value__isnull=False).update(last_value=None)
        RuleState.objects.bulk_create(
            [
                RuleState(rule=rule, record_kind=kind, record_id=pk, last_value=value)
                for pk, value in selection.values.items()
            ],
            update_conflicts=True,
            unique_fields=UNIQUE_STATE,
            update_fields=["last_value"],
            batch_size=STATE_BATCH,
        )
    RuleState.objects.bulk_create(
        [
            RuleState(rule=rule, record_kind=kind, record_id=pk, last_fired_on=today)
            for pk in fired_ids
        ],
        update_conflicts=True,
        unique_fields=UNIQUE_STATE,
        update_fields=["last_fired_on"],
        batch_size=STATE_BATCH,
    )


def run_rule(rule_id, *, today, now):
    """One rule's night, under its row lock. Call inside a transaction. A
    rule switched off or deleted since the list was read is skipped."""
    locked = Rule.objects.select_for_update(of=("self",)).select_related(
        "owner", "segment", "organisation"
    )
    rule = locked.filter(pk=rule_id, is_active=True).first()
    if rule is None or RuleRun.objects.filter(rule=rule, run_on=today).exists():
        return Outcome()
    reason = pause_reason(rule)
    if reason:
        _pause(rule, reason)
        return Outcome(paused=True)
    # SOC2:AUTH-02 everything below reads and acts as the owner: `select` matches only
    # records they may open, and the survey's audience is resolved as them again
    selection = select(rule, rule.owner, today=today, state_rule_id=rule.pk)
    kind = selection.kind
    run = RuleRun.objects.create(rule=rule, run_on=today, started_at=now)
    records = load(kind, selection.fire)
    statuses = _act(rule, run, records, kind, today=today)
    fired = [
        record.pk
        for record in records
        if any(status["status"] != FAILED for status in statuses[record.pk])
    ]
    fired_set = set(fired)
    survey = next((action for action in rule.actions if action["action"] == "survey"), None)
    review = create_review(rule, run, fired, survey, today=today) if survey and fired else None
    RuleRunRecord.objects.bulk_create(
        [
            RuleRunRecord(
                run=run,
                record_kind=kind,
                record_id=record.pk,
                outcome=(
                    RuleRunRecord.Outcome.FIRED
                    if record.pk in fired_set
                    else RuleRunRecord.Outcome.SKIPPED
                ),
                reason="" if record.pk in fired_set else "failed",
                actions=statuses[record.pk],
            )
            for record in records
        ]
        + [
            RuleRunRecord(
                run=run,
                record_kind=kind,
                record_id=pk,
                outcome=RuleRunRecord.Outcome.SKIPPED,
                reason="cooldown",
            )
            for pk in selection.cooldown[:MAX_SKIPPED_ROWS]
        ]
    )
    _store_states(rule, kind, selection, fired, today=today)
    run.matched, run.fired = selection.matched, len(fired)
    run.skipped = selection.skipped(failed=len(records) - len(fired))
    run.finished_at = timezone.now()
    run.save(update_fields=["matched", "fired", "skipped", "finished_at"])
    if selection.matched or selection.not_visible:
        audit.record(  # SOC2:LOG-01
            "rule.fired",
            organisation=rule.organisation,
            target=rule,
            metadata={
                "run": run.pk,
                "matched": run.matched,
                "fired": run.fired,
                "skipped": run.skipped,
            },
        )
    return Outcome(
        ran=True,
        fired=run.fired,
        review_id=None if review is None else review.pk,
        send_now=bool(review is not None and survey["without_review"]),
        owner_id=rule.owner_id,
    )


def waiting_message(count):
    if count == 1:
        return "A survey from your rules is waiting for your review."
    return f"{count} surveys from your rules are waiting for your review."


def _send_now(review_id, *, today, now):
    try:
        send_review(review_id, actor=None, today=today, now=now)
    except Exception:  # noqa: BLE001 - the review stays waiting for its owner
        logger.exception("Rule review %s: sending without review failed", review_id)


def _tell_owners(waiting):
    """One `rule_review` notice per owner per night, however many rules
    made a review."""
    for owner_id, count in sorted(waiting.items()):
        try:
            with transaction.atomic():
                notify(
                    recipient=User.objects.get(pk=owner_id),
                    actor=None,
                    kind=Notification.Kind.RULE_REVIEW,
                    message=waiting_message(count),
                    link="/brain/review",
                    push_on_commit=True,
                )
        except Exception:  # noqa: BLE001 - one notice's failure never stops the rest
            logger.exception("Rules: review notice to user %s failed", owner_id)


def evaluate_rules(organisation=None, *, today=None, now=None):
    """Every active rule's night, in one workspace or all of them."""
    today = today or timezone.localdate()
    now = now or timezone.now()
    result = RulesResult(expired=expire_reviews(organisation, now=now))
    due = Rule.objects.filter(is_active=True)
    if organisation is not None:
        due = due.filter(organisation=organisation)
    waiting = {}
    for rule_id in list(due.order_by("pk").values_list("pk", flat=True)):
        try:
            with transaction.atomic():
                outcome = run_rule(rule_id, today=today, now=now)
        except Exception:  # noqa: BLE001 - one rule's failure never stops the rest
            logger.exception("Rule %s: nightly run failed", rule_id)
            result.failed += 1
            continue
        result.ran += outcome.ran
        result.fired += outcome.fired
        result.paused += outcome.paused
        if outcome.review_id is None:
            continue
        result.reviews += 1
        if outcome.send_now:
            _send_now(outcome.review_id, today=today, now=now)
        still_waiting = RuleReview.objects.filter(
            pk=outcome.review_id, status=RuleReview.Status.WAITING
        ).exists()
        if still_waiting:
            waiting[outcome.owner_id] = waiting.get(outcome.owner_id, 0) + 1
    _tell_owners(waiting)
    return result
```

In `services/customers/management/commands/run_health_maintenance.py`, insert this block directly after the segments block (the one ending `self.stdout.write(self.style.WARNING(f"segments skipped: {exc}"))`) and before the comment `# The metric layer's month-end, after the health scores it reads are`:

```python
        # Rules: "when → then" on each owner's own segments, run as the
        # owner, after the segments' entries and exits and the scores they
        # read are fresh. Once per rule per night (services.rules.nightly).
        if not options["dry_run"]:
            from services.rules.nightly import evaluate_rules

            try:
                night = evaluate_rules(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"ran {night.ran} rule(s): {night.fired} record(s) fired, "
                        f"{night.reviews} review(s), {night.paused} paused, "
                        f"{night.expired} expired, {night.failed} failed"
                    )
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                self.stdout.write(self.style.WARNING(f"rules skipped: {exc}"))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
venv/bin/python manage.py test services.rules.tests.test_nightly services.surveys.tests.test_nightly services.segments.tests.test_nightly --noinput
```
Expected: PASS. The existing maintenance and nightly tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add services/rules/nightly.py services/rules/tests/test_nightly.py services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(rules): the nightly step, per rule and per record, after the segments' changes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Reading a rule's nights, and the review endpoints

Spec §1.5 (runs, run records, reviews, approve and skip, 409/400) and §3 ("Shared viewers see runs only for records they may open, plus a count. Only the owner decides reviews."). Decisions 15, 23, 24 and 25.

**Files:**
- Modify:
  - `services/rules/payloads.py` (cursors, `runs_page`, `run_detail`, `review_payload`)
  - `services/rules/views.py` (five views)
  - `services/rules/urls.py`
- Test: `services/rules/tests/test_reading.py`

**Interfaces:**
- Consumes:
  - `records.visible_q`, `names`;
  - `reviews.get_owned_review`, `send_review`, `skip_review`, `Decided`, `ALREADY_DECIDED`;
  - `access.get_readable`.
- Produces:
  - `payloads`:
    - `PAGE_SIZE = 20`;
    - `encode_cursor(run) -> str`, `decode_cursor(cursor) -> tuple[date, int] | None`;
    - `runs_page(rule, viewer, params) -> {"results", "next"}`;
    - `run_detail(run, viewer) -> {"id", "run_on", "records", "hidden_count"}`;
    - `review_payload(review) -> dict`.
  - `views.REVIEW_LIMIT = 100`.
  - Routes:
    - `GET /api/v1/rules/<id>/runs/` (`rule-runs`);
    - `GET /api/v1/rules/<id>/runs/<run_id>/` (`rule-run-detail`);
    - `GET /api/v1/rules/reviews/` (`rule-review-list`);
    - `POST /api/v1/rules/reviews/<id>/approve/` (`rule-review-approve`);
    - `POST /api/v1/rules/reviews/<id>/skip/` (`rule-review-skip`).
  - A run row has the keys `id, run_on, matched, fired, skipped, review, hidden_count, started_at, finished_at`.
  - A record row has the keys `kind, id, name, outcome, reason, actions`.
  - A review has the keys `id, rule {id, name, trigger, score, direction, threshold, cadence, weekday, segment}, run_on, action, counts, organisation_name, status, result, created_at, expires_at, decided_at`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_reading.py`:

```python
"""Reading a rule's nights twice filtered: the owner reads each night's own
counts, anyone else only the records they may open now plus a count; a
night's records likewise. Then the owner's reviews: list, approve (the
survey or Surveys' refusal), skip, and 409 once decided."""

from datetime import timedelta

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.accounts.models import User
from services.customers.models import Customer
from services.rules.models import RuleReview, RuleRun, RuleRunRecord
from services.rules.reviews import create_review
from services.rules.tests.fixtures import NOTIFY_ME, SURVEY, RuleFixture
from services.surveys.models import SurveySend
from services.surveys.sending import CONSOLE_BACKEND, EMAIL_NOT_SET_UP

URL = "/api/v1/rules/"
SKIPS = {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0}
DONE = [{"action": "notify", "status": "done", "detail": ""}]


class ReadingFixture(RuleFixture):
    """Alice's shared rule on Pizza Hut (Carl's) and Taco Bell (Dana's), and
    last night's run, which fired on both."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        everyone = cls.pinned("customer", [cls.pizza, cls.taco], owner=cls.admin, name="Everyone")
        cls.rule = cls.make_rule(owner=cls.admin, segment=everyone, sharing="workspace")
        cls.run = cls.night(cls.rule, cls.today, [cls.pizza, cls.taco])

    @classmethod
    def night(cls, rule, day, records):
        run = RuleRun.objects.create(
            rule=rule, run_on=day, started_at=cls.now, matched=len(records), fired=len(records)
        )
        RuleRunRecord.objects.bulk_create(
            [
                RuleRunRecord(
                    run=run,
                    record_kind="customer",
                    record_id=record.pk,
                    outcome="fired",
                    actions=DONE,
                )
                for record in records
            ]
        )
        return run

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client


class RunsTests(ReadingFixture):
    def runs(self, user, **query):
        return self.api(user).get(f"{URL}{self.rule.pk}/runs/", query)

    def test_the_owner_reads_each_nights_own_counts(self):
        data = self.runs(self.admin).data
        self.assertEqual(
            data,
            {
                "results": [
                    {
                        "id": self.run.pk,
                        "run_on": self.today.isoformat(),
                        "matched": 2,
                        "fired": 2,
                        "skipped": SKIPS,
                        "review": None,
                        "hidden_count": 0,
                        "started_at": self.now.isoformat(),
                        "finished_at": None,
                    }
                ],
                "next": None,
            },
        )

    def test_a_reader_reads_only_what_they_may_open_plus_a_count(self):
        (row,) = self.runs(self.csm).data["results"]
        self.assertEqual(
            (row["matched"], row["fired"], row["skipped"], row["review"], row["hidden_count"]),
            (None, 1, None, None, 1),
        )

    def test_unreadable_is_404(self):
        self.assertEqual(self.runs(self.stranger).status_code, 404)

    def test_the_owner_sees_the_nights_review(self):
        review = RuleReview.objects.create(rule=self.rule, run=self.run, action=SURVEY, records=[])
        (row,) = self.runs(self.admin).data["results"]
        self.assertEqual(row["review"], {"id": review.pk, "status": "waiting"})
        (row,) = self.runs(self.csm).data["results"]
        self.assertIsNone(row["review"])

    def test_newest_first_twenty_a_page_under_a_cursor(self):
        for days in range(1, 25):
            self.night(self.rule, self.today - timedelta(days=days), [self.pizza])
        first = self.runs(self.admin).data
        self.assertEqual(len(first["results"]), 20)
        self.assertEqual(first["results"][0]["run_on"], self.today.isoformat())
        second = self.runs(self.admin, cursor=first["next"]).data
        self.assertEqual((len(second["results"]), second["next"]), (5, None))
        days = [row["run_on"] for row in first["results"] + second["results"]]
        self.assertEqual(days, sorted(days, reverse=True))
        self.assertEqual(len(set(days)), 25)

    def test_a_malformed_cursor_reads_the_first_page(self):
        for cursor in ("nonsense", "W10=", "WyJ4IiwgMV0="):
            with self.subTest(cursor=cursor):
                data = self.runs(self.admin, cursor=cursor).data
                self.assertEqual(data["results"][0]["id"], self.run.pk)

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as one:
            self.runs(self.csm)
        for days in range(1, 4):
            self.night(self.rule, self.today - timedelta(days=days), [self.pizza, self.taco])
        with CaptureQueriesContext(connection) as four:
            self.runs(self.csm)
        self.assertEqual(len(four.captured_queries), len(one.captured_queries))


class RunDetailTests(ReadingFixture):
    def detail(self, user, run=None):
        run = run or self.run
        return self.api(user).get(f"{URL}{self.rule.pk}/runs/{run.pk}/")

    def test_the_owner_reads_every_record_by_name(self):
        data = self.detail(self.admin).data
        self.assertEqual(
            data,
            {
                "id": self.run.pk,
                "run_on": self.today.isoformat(),
                "records": [
                    {
                        "kind": "customer",
                        "id": self.pizza.pk,
                        "name": "Pizza Hut",
                        "outcome": "fired",
                        "reason": "",
                        "actions": DONE,
                    },
                    {
                        "kind": "customer",
                        "id": self.taco.pk,
                        "name": "Taco Bell",
                        "outcome": "fired",
                        "reason": "",
                        "actions": DONE,
                    },
                ],
                "hidden_count": 0,
            },
        )

    def test_a_reader_reads_only_records_they_may_open_plus_a_count(self):
        data = self.detail(self.csm).data
        self.assertEqual(
            ([record["name"] for record in data["records"]], data["hidden_count"]),
            (["Pizza Hut"], 1),
        )

    def test_a_deleted_record_is_a_count(self):
        Customer.objects.filter(pk=self.taco.pk).delete()
        data = self.detail(self.admin).data
        self.assertEqual((len(data["records"]), data["hidden_count"]), (1, 1))

    def test_a_run_of_another_rule_is_404(self):
        other = self.make_rule(owner=self.admin, name="Other", sharing="workspace")
        theirs = self.night(other, self.today, [self.pizza])
        self.assertEqual(self.detail(self.admin, theirs).status_code, 404)

    def test_it_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as two:
            self.detail(self.csm)
        bigger = self.night(
            self.rule, self.today - timedelta(days=1), [self.pizza, self.taco, self.dough]
        )
        with CaptureQueriesContext(connection) as three:
            self.detail(self.csm, bigger)
        self.assertEqual(len(three.captured_queries), len(two.captured_queries))


class ReviewTests(RuleFixture):
    def setUp(self):
        self.rule = self.make_rule(actions=[SURVEY, NOTIFY_ME])
        self.run = RuleRun.objects.create(rule=self.rule, run_on=self.today, started_at=self.now)
        self.review = create_review(self.rule, self.run, [self.dough.pk], SURVEY, today=self.today)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client

    def decide(self, verb, user=None):
        return self.api(user or self.csm).post(f"{URL}reviews/{self.review.pk}/{verb}/")

    def test_the_owner_lists_their_waiting_reviews(self):
        data = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(
            data,
            [
                {
                    "id": self.review.pk,
                    "rule": {
                        "id": self.rule.pk,
                        "name": "Renewal watch",
                        "trigger": "entered",
                        "score": "",
                        "direction": "",
                        "threshold": None,
                        "cadence": "",
                        "weekday": None,
                        "segment": {"id": self.book.pk, "name": "My book", "kind": "customer"},
                    },
                    "run_on": self.today.isoformat(),
                    "action": SURVEY,
                    "counts": {"people": 1, "records": 1},
                    "organisation_name": "Acme Inc",
                    "status": "waiting",
                    "result": {},
                    "created_at": self.review.created_at.isoformat(),
                    "expires_at": self.review.expires_at.isoformat(),
                    "decided_at": None,
                }
            ],
        )

    def test_nobody_else_sees_them(self):
        for user in (self.admin, self.other, self.stranger):
            self.assertEqual(self.api(user).get(f"{URL}reviews/").data, [])

    def test_a_status_filter_and_an_unknown_one_reads_waiting(self):
        self.assertEqual(self.api(self.csm).get(f"{URL}reviews/", {"status": "approved"}).data, [])
        self.assertEqual(len(self.api(self.csm).get(f"{URL}reviews/", {"status": "x"}).data), 1)

    def test_approve_sends_the_survey_and_a_second_decision_is_409(self):
        response = self.decide("approve")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data, {"survey_send_id": SurveySend.objects.get().pk})
        for verb in ("approve", "skip"):
            again = self.decide(verb)
            self.assertEqual(
                (again.status_code, again.data),
                (409, {"detail": "This review has already been decided."}),
            )

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_a_refusal_is_400_and_stored_on_the_item(self):
        response = self.decide("approve")
        self.assertEqual((response.status_code, response.data), (400, {"detail": EMAIL_NOT_SET_UP}))
        (item,) = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(item["result"], {"error": {"detail": EMAIL_NOT_SET_UP}})

    def test_skip(self):
        response = self.decide("skip")
        self.assertEqual((response.status_code, response.data["status"]), (200, "skipped"))
        self.assertFalse(SurveySend.objects.exists())

    def test_only_the_owner_decides(self):
        for user in (self.admin, self.other, self.stranger):
            for verb in ("approve", "skip"):
                self.assertEqual(self.decide(verb, user).status_code, 404)
        self.assertEqual(APIClient().post(f"{URL}reviews/{self.review.pk}/skip/").status_code, 401)

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        with CaptureQueriesContext(connection) as one:
            self.api(self.csm).get(f"{URL}reviews/")
        for days in range(1, 4):
            run = RuleRun.objects.create(
                rule=self.rule, run_on=self.today - timedelta(days=days), started_at=self.now
            )
            create_review(self.rule, run, [self.dough.pk], SURVEY, today=self.today)
        with CaptureQueriesContext(connection) as four:
            rows = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(len(rows), 4)
        self.assertEqual(len(four.captured_queries), len(one.captured_queries))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_reading --noinput`
Expected: FAIL. Every request gets a 404, because the routes do not exist yet.

- [ ] **Step 3: Write the payloads, views and routes**

Add to the imports of `services/rules/payloads.py`, so they read:

```python
import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import date

from django.db.models import Count, Q

from services.organizations.rows import iso, number, person
from services.segments.access import readable_segments

from .models import Rule, RuleReview, RuleRun, RuleRunRecord
from .records import names, visible_q
```

Append to `services/rules/payloads.py`:

```python
#: A rule's nights, a page at a time.
PAGE_SIZE = 20


def encode_cursor(run):
    raw = json.dumps([run.run_on.isoformat(), run.pk])
    return urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor):
    """(run_on, id) after which the next page starts, or None (the first
    page) for a missing, malformed or tampered cursor."""
    if not cursor:
        return None
    try:
        day, pk = json.loads(urlsafe_b64decode(cursor.encode()))
        return date.fromisoformat(day), int(pk)
    except (ValueError, TypeError):
        return None


def _tallies(run_ids, viewer):
    """`{run_id: {total, seen, seen_fired}}` in one query: every record row,
    those whose record the viewer may open now, and those of them that fired."""
    if not run_ids:
        return {}
    seen = visible_q(viewer)
    rows = (
        RuleRunRecord.objects.filter(run_id__in=run_ids)
        .order_by()
        .values("run_id")
        .annotate(
            total=Count("id"),
            seen=Count("id", filter=seen),
            seen_fired=Count("id", filter=seen & Q(outcome=RuleRunRecord.Outcome.FIRED)),
        )
    )
    return {row["run_id"]: row for row in rows}


def runs_page(rule, viewer, params):
    """`?cursor=`: the rule's nights, newest first, `PAGE_SIZE` a page. The
    owner reads each night's own counts and review. Anyone else reads how
    many fired among the records they may open now, and of the rest only
    `hidden_count`."""
    is_owner = rule.owner_id == viewer.pk
    runs = rule.runs.select_related("review").order_by("-run_on", "-pk")
    after = decode_cursor(params.get("cursor"))
    if after is not None:
        day, pk = after
        runs = runs.filter(Q(run_on__lt=day) | Q(run_on=day, pk__lt=pk))
    page = list(runs[: PAGE_SIZE + 1])
    more = len(page) > PAGE_SIZE
    page = page[:PAGE_SIZE]
    # SOC2:AUTH-02 a reader's figures cover only the records they may open now
    tallies = _tallies([run.pk for run in page], viewer)
    results = []
    for run in page:
        tally = tallies.get(run.pk, {"total": 0, "seen": 0, "seen_fired": 0})
        review = review_of(run) if is_owner else None
        results.append(
            {
                "id": run.pk,
                "run_on": iso(run.run_on),
                "matched": run.matched if is_owner else None,
                "fired": run.fired if is_owner else tally["seen_fired"],
                "skipped": run.skipped if is_owner else None,
                "review": None if review is None else {"id": review.pk, "status": review.status},
                "hidden_count": tally["total"] - tally["seen"],
                "started_at": iso(run.started_at),
                "finished_at": iso(run.finished_at),
            }
        )
    return {"results": results, "next": encode_cursor(page[-1]) if more else None}


def run_detail(run, viewer):
    """A night's records the viewer may open now, fired first, by name; the
    rest (deleted ones included) are `hidden_count`. At most 400 rows (200
    fired or failed, 200 for the cooldown), so unpaginated."""
    # SOC2:AUTH-02 a night's record is named only to someone who may open it today
    rows = list(run.records.filter(visible_q(viewer)).order_by("outcome", "record_id"))
    hidden = run.records.count() - len(rows)
    found = {}
    for kind in sorted({row.record_kind for row in rows}):
        ids = [row.record_id for row in rows if row.record_kind == kind]
        found.update({(kind, pk): name for pk, name in names(kind, ids).items()})
    return {
        "id": run.pk,
        "run_on": iso(run.run_on),
        "records": [
            {
                "kind": row.record_kind,
                "id": row.record_id,
                "name": found.get((row.record_kind, row.record_id)),
                "outcome": row.outcome,
                "reason": row.reason,
                "actions": row.actions,
            }
            for row in rows
        ],
        "hidden_count": hidden,
    }


def review_payload(review):
    """A review as its owner reads it: the rule's sentence, the night, the
    frozen survey, how many it reaches, and the workspace's name for the
    survey's preview. Records are counted, never named. Needs
    `rule__segment`, `rule__organisation` and `run` loaded."""
    rule, segment = review.rule, review.rule.segment
    return {
        "id": review.pk,
        "rule": {
            "id": rule.pk,
            "name": rule.name,
            "trigger": rule.trigger,
            "score": rule.score,
            "direction": rule.direction,
            "threshold": number(rule.threshold),
            "cadence": rule.cadence,
            "weekday": rule.weekday,
            "segment": None
            if segment is None
            else {"id": segment.pk, "name": segment.name, "kind": segment.kind},
        },
        "run_on": iso(review.run.run_on),
        "action": review.action,
        "counts": review.counts,
        "organisation_name": rule.organisation.name,
        "status": review.status,
        "result": review.result,
        "created_at": iso(review.created_at),
        "expires_at": iso(review.expires_at),
        "decided_at": iso(review.decided_at),
    }
```

Add to `services/rules/views.py`. The imports become:

```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.models import User

from .access import get_owned, get_readable, readable_rules
from .models import MAX_OWNED, Rule, RuleReview
from .payloads import (
    list_rows,
    preview_payload,
    review_payload,
    rule_payload,
    run_detail,
    runs_page,
)
from .reviews import ALREADY_DECIDED, Decided, get_owned_review, send_review, skip_review
from .selection import select
from .serializers import RuleTestSerializer, RuleWriteSerializer
```

Below `SHARING_FIELDS`, add:

```python
#: The review list shows at most this many, newest first.
REVIEW_LIMIT = 100
```

Append the views:

```python
class RuleRunsView(APIView):
    """GET /api/v1/rules/<id>/runs/?cursor=, the rule's nights, newest first."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the rule, `runs_page` each count
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        rule = get_readable(request.user, pk)
        return Response(runs_page(rule, request.user, request.query_params))


class RuleRunDetailView(APIView):
    """GET /api/v1/rules/<id>/runs/<run_id>/, one night's records the caller
    may open, plus `hidden_count`."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the rule, `run_detail` each record
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, run_id):
        rule = get_readable(request.user, pk)
        run = get_object_or_404(rule.runs, pk=run_id)
        return Response(run_detail(run, request.user))


class ReviewListView(APIView):
    """GET /api/v1/rules/reviews/?status=waiting|approved|skipped|expired,
    the caller's own reviews (unknown reads as waiting), newest first."""

    # SOC2:AUTH-02 authentication here; the filter below is the owner check
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wanted = request.query_params.get("status")
        if wanted not in RuleReview.Status.values:
            wanted = RuleReview.Status.WAITING
        # SOC2:AUTH-02 a review is read only by its rule's owner
        reviews = (
            RuleReview.objects.filter(
                rule__owner=request.user,
                rule__organisation_id=request.user.organisation_id,
                status=wanted,
            )
            .select_related("rule__segment", "rule__organisation", "run")
            .order_by("-created_at", "-pk")[:REVIEW_LIMIT]
        )
        return Response([review_payload(review) for review in reviews])


class ReviewApproveView(APIView):
    """POST /api/v1/rules/reviews/<id>/approve/: sends the survey as the
    rule's owner and returns `{survey_send_id}`, or Surveys' refusal (400,
    stored on the review, which stays waiting). 409 once decided."""

    # SOC2:AUTH-02 authentication here; `get_owned_review` is the owner check
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        review = get_owned_review(request.user, pk)
        try:
            answer = send_review(
                review.pk,
                actor=request.user,
                today=timezone.localdate(),
                now=timezone.now(),
                request=request,
            )
        except Decided:
            return Response({"detail": ALREADY_DECIDED}, status=status.HTTP_409_CONFLICT)
        return Response(answer.body, status=answer.status)


class ReviewSkipView(APIView):
    """POST /api/v1/rules/reviews/<id>/skip/: no survey. Returns the review;
    409 once decided."""

    # SOC2:AUTH-02 authentication here; `get_owned_review` is the owner check
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        review = get_owned_review(request.user, pk)
        try:
            review = skip_review(review.pk, request.user, now=timezone.now(), request=request)
        except Decided:
            return Response({"detail": ALREADY_DECIDED}, status=status.HTTP_409_CONFLICT)
        return Response(review_payload(review))
```

`services/rules/urls.py` becomes:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.RuleListCreateView.as_view(), name="rule-list"),
    path("test/", views.RuleTestView.as_view(), name="rule-test"),
    path("reviews/", views.ReviewListView.as_view(), name="rule-review-list"),
    path(
        "reviews/<int:pk>/approve/",
        views.ReviewApproveView.as_view(),
        name="rule-review-approve",
    ),
    path("reviews/<int:pk>/skip/", views.ReviewSkipView.as_view(), name="rule-review-skip"),
    path("<int:pk>/", views.RuleDetailView.as_view(), name="rule-detail"),
    path("<int:pk>/runs/", views.RuleRunsView.as_view(), name="rule-runs"),
    path(
        "<int:pk>/runs/<int:run_id>/",
        views.RuleRunDetailView.as_view(),
        name="rule-run-detail",
    ),
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/payloads.py services/rules/views.py services/rules/urls.py services/rules/tests/test_reading.py
git commit -m "feat(rules): a rule's nights and records twice filtered; review list, approve and skip

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: End to end

Spec §4 ("one e2e: build a rule → the stub's nightly run → a review → approve → a survey is created"), backend half.

**Files:**
- Test: `e2e/test_rules_flow.py`

**Interfaces:**
- Consumes:
  - every route from Tasks 4, 6 and 10;
  - `/auth/signup/`, `/auth/users/`, `/auth/login/`;
  - `/customers/`, `/customers/<id>/contacts/`;
  - `/segments/`, `/segments/<id>/members/<id>/`;
  - `/notifications/`, `/surveys/sends/<id>/`;
  - `rules.nightly.evaluate_rules`, called in-process, as cron would call it.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `e2e/test_rules_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl builds a weekly rule on his segment of one organisation: send a survey
(for review) and notify him. The test endpoint shows who it would reach. He
turns it on; the nightly step runs (in-process, as cron would); the review
waits in his queue and his bell rings; he approves it and the survey goes to
the organisation's champion only. The rule's page shows the night."""

from django.core import mail
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.rules.nightly import evaluate_rules


class RulesFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. An organisation signs up; its admin adds Carl.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        admin = body["access"]
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]

        # 2. Carl's organisation, a champion and a finance manager.
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]
        for name, role in (("Sam Pizza", "champion"), ("Fin Pizza", "finance_manager")):
            email = f"{name.split()[0].lower()}@pizza.io"
            self.created(
                f"/customers/{pizza}/contacts/", {"name": name, "role": role, "email": email}, carl
            )

        # 3. A segment of that one organisation.
        segment = self.created("/segments/", {"name": "Pizza", "kind": "customer"}, carl)["id"]
        status, body = http_patch(
            self.api(f"/segments/{segment}/members/{pizza}/"), {"state": "pinned"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 4. The rule: weekly, today; a survey for champions, and notify me.
        today = timezone.localdate()
        rule_body = {
            "name": "Weekly pulse",
            "segment": segment,
            "trigger": "schedule",
            "cadence": "weekly",
            "weekday": today.weekday(),
            "actions": [
                {
                    "action": "survey",
                    "survey_type": "nps",
                    "subject": "A quick question",
                    "roles": ["champion"],
                },
                {"action": "notify", "to": "me"},
            ],
        }
        status, body = http_post(self.api("/rules/test/"), rule_body, token=carl)
        self.assertEqual(
            (status, body["count"], body["records"]),
            (200, 1, [{"kind": "customer", "id": pizza, "name": "Pizza Hut"}]),
        )
        rule = self.created("/rules/", rule_body, carl)
        self.assertFalse(rule["is_active"])

        # 5. Turned on.
        status, body = http_patch(
            self.api(f"/rules/{rule['id']}/"), {"is_active": True}, token=carl
        )
        self.assertEqual((status, body["is_active"]), (200, True), body)

        # 6. The night.
        night = evaluate_rules(today=today)
        self.assertEqual((night.ran, night.fired, night.reviews, night.failed), (1, 1, 1, 0))

        # 7. Carl's queue and bell.
        status, reviews = http_get(self.api("/rules/reviews/"), token=carl)
        self.assertEqual(status, 200, reviews)
        (review,) = reviews
        self.assertEqual(
            (review["counts"], review["organisation_name"], review["action"]["survey_type"]),
            ({"people": 1, "records": 1}, "Acme Inc", "nps"),
        )
        status, notes = http_get(self.api("/notifications/"), token=carl)
        self.assertLessEqual({"rule_fired", "rule_review"}, {note["kind"] for note in notes})

        # 8. Approve: the survey goes to Sam only; a second decision is 409.
        status, body = http_post(
            self.api(f"/rules/reviews/{review['id']}/approve/"), {}, token=carl
        )
        self.assertEqual(status, 200, body)
        send_id = body["survey_send_id"]
        status, body = http_post(
            self.api(f"/rules/reviews/{review['id']}/approve/"), {}, token=carl
        )
        self.assertEqual(status, 409, body)
        (message,) = mail.outbox
        self.assertEqual(message.to, ["sam@pizza.io"])
        status, body = http_get(self.api(f"/surveys/sends/{send_id}/"), token=carl)
        self.assertEqual((status, body["status"]), (200, "sent"))
        self.assertTrue(body["name"].startswith("Weekly pulse · "))

        # 9. The rule's page: the night and its record.
        status, body = http_get(self.api(f"/rules/{rule['id']}/runs/"), token=carl)
        (run,) = body["results"]
        self.assertEqual(
            (run["fired"], run["review"]["status"], run["hidden_count"]), (1, "approved", 0)
        )
        status, body = http_get(self.api(f"/rules/{rule['id']}/runs/{run['id']}/"), token=carl)
        (record,) = body["records"]
        self.assertEqual(
            (record["name"], record["outcome"], [action["status"] for action in record["actions"]]),
            ("Pizza Hut", "fired", ["queued", "done"]),
        )
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_rules_flow --noinput`
Expected: PASS. Tasks 1–10 already built everything it reaches. If it fails, the failure is a real integration bug: fix it in the task's own module, not here.

- [ ] **Step 3: Run the app's suite and the checks**

Run:
```bash
venv/bin/python manage.py test services.rules services.surveys services.segments services.notifications e2e.test_rules_flow --noinput
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/ruff check . && venv/bin/ruff format --check .
```
Expected:
- every test passes;
- `No changes detected`;
- the shard check prints four shards whose union is the full suite;
- ruff is clean.

- [ ] **Step 4: Commit**

```bash
git add e2e/test_rules_flow.py
git commit -m "test(e2e): build a rule, the night, a review, approve; the survey and the rule's page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The docs

Skill `api-contracts`; the house rule that the product documents change in the same PR.

**Files:**
- Modify:
  - `docs/API_CONTRACTS.md`
  - `docs/audit-events.md`
  - `docs/data-classification.md`
  - `docs/product/01-prd.md`
  - `docs/product/02-trd.md`
  - `docs/product/05-backend-schema.md`
  - `docs/product/06-implementation-plan.md`

**Interfaces:**
- Consumes: the routes, bodies, events and models from Tasks 1–10, exactly as named there.
- Produces: nothing in code.

- [ ] **Step 1: `docs/API_CONTRACTS.md`**

Insert this whole section directly above `## \`scenarios\` — Automation builder`:

````markdown
## `rules` — Rules (`/scenarios?tab=rules`, the Review Queue's "From your rules")

Built for the Impact section's third delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-04-rules-design.md` §1, §3). A rule is "when → then" on one of the owner's own segments: one trigger, one to three actions, run nightly as the owner. The canvas (`scenarios` below) is unrelated and unchanged.

**Models.**
- `Rule`:
  - `owner`, `name` (≤ 120), `is_active` (default false);
  - `segment` (the owner's own; null once deleted);
  - `trigger` (`entered`/`left`/`crossed`/`schedule`), with `score` (`csat`/`nps`/`ces`/`health`), `direction` (`below`/`above`) and `threshold` for `crossed`, or `cadence` (`weekly`/`monthly`) and `weekday` (0–6, Monday = 0) for `schedule`;
  - `actions` (1–3), `cooldown_days` (1–365, default 30), `sharing` with `shared_with` (≤ 50), `paused_reason`.

  An owner has at most 50 rules.
- `RuleState`: per rule and record, `last_value` (last night's score, `crossed`) and `last_fired_on`.
- `RuleRun`: one per rule per night. `matched`, `fired`, `skipped` (`{cooldown, cap, not_visible, failed}`), `started_at`, `finished_at`.
- `RuleRunRecord`: one record a night touched. `outcome` (`fired`/`skipped`), `reason` (`cooldown`/`failed`), `actions` (`[{action, status, detail}]`; `status` is `done`, `unchanged`, `queued`, `skipped` or `failed`, and `detail` never holds personal data).
- `RuleReview`: one night's survey waiting for the owner. `action` (frozen), `records` (`[{kind, id}]`), `counts` (`{people, records}`), `status` (`waiting`/`approved`/`skipped`/`expired`), `decided_by`, `decided_at`, `result` (`{survey_send_id}` or `{error}`). It expires after 7 days.

**Actions.** Each type appears at most once in a rule.

| Action | Body | Runs |
|---|---|---|
| `notify` | `{"action": "notify", "to": "me"\|"record_owner"\|"people", "people": [ids], "message": ""}`; `people` is 1–50 active teammates, used only with `to: "people"`; `message` ≤ 280 | At once. One `rule_fired` notification per recipient per night, naming up to three organisations or accounts that recipient may open (contacts are counted), linked to the night when they may read the rule |
| `task` | `{"action": "task", "title", "assignee": "record_owner"\|"me", "due_in_days"}`; `title` ≤ 200; `assignee` defaults to `record_owner`; `due_in_days` 0–90, default 7 | At once. One task per organisation or account per night (a contact's on its own organisation or account), priority medium. A record with no active owner goes to the rule's owner |
| `lifecycle` | `{"action": "lifecycle", "stage"}`; a lifecycle stage; not on contact segments | At once, under the record's row lock; audited `rule.field_changed` with old and new |
| `survey` | `{"action": "survey", "survey_type", "subject", "intro", "roles", "without_review"}`; Surveys' limits; `roles` empty for a contact segment; `without_review` default false | The night's fired records become one review, or with `without_review` a survey sent at once. Either way it goes through Surveys (30-day quiet period, 3 per record, 500 people, 20 sends a day, email set up) to the fired records only |

**Triggers.**
- `entered`/`left`: that day's entries or exits from the segments' nightly step.
- `crossed`: a member whose score is past the line tonight (strictly) and whose stored score last night was not. The first night after a rule is created, turned on or given a new line only stores the scores. Contact segments and accounts' CES are refused.
- `schedule`: every member on the weekday (`weekly`) or on the 1st (`monthly`), in the server's time zone (UTC).

Then:
- records the owner may not open are counted (`not_visible`);
- records fired within `cooldown_days` are skipped (`cooldown`);
- at most 200 a night, lowest id first, and the rest are counted (`cap`).

**The night.** `run_health_maintenance` runs the rules after the segments' step:
- each active rule once a night, in its own transaction;
- each record and action in its own savepoint;
- a rule whose segment is gone or no longer the owner's, or whose owner is inactive, switches itself off (`paused_reason`) and tells its owner once;
- each owner with a survey waiting gets one `rule_review` notification linking to `/brain/review`.

**Access.**
- A rule is read by its owner, by the workspace (`workspace`), or by the chosen teammates (`people`). Anyone else gets a 404 identical to a missing rule.
- Writes are owner only: another reader gets `403 {"detail": "Only the rule's owner can change it."}`.
- The segment must be the caller's own: `403 {"detail": "A rule can only use your own segments."}`, or 404 if they cannot read it.
- Reviews are the owner's alone: anyone else gets 404.

### `GET/POST /api/v1/rules/`

Auth: `IsAuthenticated`. GET takes `scope=mine|shared|all` (default all) and returns an unpaginated list by name:

```json
[
  {
    "id": 5, "name": "Renewal watch", "is_active": true, "paused_reason": "",
    "paused_message": "", "segment": {"id": 7, "name": "At risk", "kind": "customer"},
    "trigger": "crossed", "score": "csat", "direction": "below", "threshold": 60.0,
    "cadence": "", "weekday": null,
    "actions": [{"action": "notify", "to": "me", "people": [], "message": ""}],
    "cooldown_days": 30, "sharing": "private", "owner": {"id": 4, "name": "Carl CSM"},
    "is_owner": true, "last_run": {"run_on": "2026-10-04", "fired": 3, "waiting": false},
    "updated_at": "2026-10-04T09:12:00+00:00"
  }
]
```

- `segment.id` is `null` for a reader who may not read the segment, and `segment` is `null` once it is deleted.
- `last_run` is `null` before the first night. Its `fired` is `null`, and `waiting` false, for anyone but the owner.
- `paused_reason` is `""`, `segment_gone`, `segment_not_owned` or `owner_inactive`. `paused_message` is its sentence.

POST `{name, segment, trigger, score?, direction?, threshold?, cadence?, weekday?, actions, cooldown_days?, is_active?, sharing?, shared_with?}` creates a rule owned by the caller and returns 201 with the detail body.
- Fields not used by the trigger are cleared.
- Errors are 400 at the field named. Action errors are a list aligned with `actions`, for example `{"actions": [{}, {"title": ["Give the task a title."]}]}`.
- The 51st rule is `429 {"detail": "You can own at most 50 rules."}`.

### `GET/PATCH/DELETE /api/v1/rules/<id>/`

GET returns the row plus `shared_with` (`[{id, name}]`, teammates in the reader's workspace) and `created_at`.

PATCH (owner) takes any POST field.
- The merged rule is checked again.
- A rule with no segment cannot be turned on: `400 {"segment": ["Choose a segment."]}`.
- Turning a rule on clears `paused_reason`.
- A new segment or trigger forgets the rule's stored scores and cooldowns. A new score, direction or threshold, or turning it on, forgets the stored scores only.

DELETE (owner) returns 204.

### `POST /api/v1/rules/test/`

The builder's "Test this rule". It takes a rule body (`name` optional), plus an optional `rule` (the id of a rule the caller owns), which lends its stored scores and cooldowns. The body is checked as a save would check it. Nothing is written.

```json
{"count": 4, "records": [{"kind": "customer", "id": 12, "name": "Pizza Hut"}],
 "hidden_count": 1, "skipped": {"cooldown": 0, "cap": 0, "not_visible": 1}}
```

- `count` is how many would be acted on tonight. `records` names the first 10 by id.
- For `entered`/`left` before tonight's segments step, the answer compares the owner's members now with the segment's last baseline.
- For `crossed`, a member past the line with no stored score counts here, though the night itself never fires on a first sight.

### `GET /api/v1/rules/<id>/runs/?cursor=`

The rule's nights, newest first, 20 a page:

```json
{"results": [{"id": 9, "run_on": "2026-10-04", "matched": 5, "fired": 3,
  "skipped": {"cooldown": 1, "cap": 0, "not_visible": 1, "failed": 0},
  "review": {"id": 2, "status": "waiting"}, "hidden_count": 0,
  "started_at": "…", "finished_at": "…"}],
 "next": "<opaque cursor or null>"}
```

For anyone but the owner, `matched`, `skipped` and `review` are `null`, and `fired` counts only the records they may open now. For everyone, `hidden_count` counts the night's records they cannot open now (or that were deleted). A malformed cursor reads as the first page.

### `GET /api/v1/rules/<id>/runs/<run_id>/`

```json
{"id": 9, "run_on": "2026-10-04", "hidden_count": 1,
 "records": [{"kind": "customer", "id": 12, "name": "Pizza Hut", "outcome": "fired",
   "reason": "", "actions": [{"action": "task", "status": "done", "detail": ""}]}]}
```

The response lists only the records the caller may open now, fired first, unpaginated (at most 400). A night of another rule is a 404.

### `GET /api/v1/rules/reviews/?status=waiting`

The caller's own reviews (`waiting` by default, or `approved`, `skipped` or `expired`), newest first, at most 100:

```json
[{"id": 2,
  "rule": {"id": 5, "name": "Renewal watch", "trigger": "entered", "score": "",
           "direction": "", "threshold": null, "cadence": "", "weekday": null,
           "segment": {"id": 7, "name": "At risk", "kind": "customer"}},
  "run_on": "2026-10-04",
  "action": {"action": "survey", "survey_type": "nps", "subject": "A quick question",
             "intro": "", "roles": ["champion"], "without_review": false},
  "counts": {"people": 6, "records": 4}, "organisation_name": "Acme Inc",
  "status": "waiting", "result": {}, "created_at": "…", "expires_at": "…",
  "decided_at": null}]
```

`result` holds `{"error": <Surveys' refusal>}` after a refused approval. The review then stays waiting.

### `POST /api/v1/rules/reviews/<id>/approve/` and `/skip/`

Owner only (404 otherwise).
- **Approve** sends the survey as the rule's owner and returns `200 {"survey_send_id": 31}`.
  - The survey is named "{rule name} · 4 Oct 2026" and limited to the night's fired records that the owner may still open.
  - If Surveys refuses (nobody to ask, over 500 people, the daily limit, email not set up), the answer is 400 with Surveys' own body, which is also stored on `result`. No draft is left behind.
- **Skip** returns the review with `status: "skipped"`.
- A review no longer waiting is `409 {"detail": "This review has already been decided."}`.
````

In the `### Models` notes for `Notification` (search the file for `segment_changes`), add `rule_fired` and `rule_review` to the list of kinds, and note that `message` holds up to 500 characters.

- [ ] **Step 2: `docs/audit-events.md`**

Add these rows directly after the last `survey.*` row:

```markdown
| `rule.created` | `services.rules.views.RuleListCreateView` | user | Rule (`target_repr` is "Rule <id>", never the name) | `trigger`, `actions`: the action types |
| `rule.updated` | `services.rules.views.RuleDetailView` (PATCH) | user | Rule | `fields`: the changed field names only, without `is_active`; a PATCH that changes nothing records nothing |
| `rule.activated` | `RuleListCreateView` (created on) and `RuleDetailView` (PATCH turning it on) | user | Rule | — |
| `rule.paused` | `RuleDetailView` (PATCH turning it off) and `services.rules.nightly` (switched itself off) | user, or — for the nightly step | Rule | `reason`: `owner`, or `segment_gone` / `segment_not_owned` / `owner_inactive` |
| `rule.shared` | `RuleListCreateView` (a non-private create) and `RuleDetailView` (PATCH changing `sharing` or `shared_with`) | user | Rule | `sharing`, `shared_with` (user ids) |
| `rule.deleted` | `RuleDetailView` (DELETE) | user | Rule | `trigger` |
| `rule.fired` | `services.rules.nightly.run_rule` | — (the nightly step; organisation is the rule's) | Rule | `run` id, `matched`, `fired`, `skipped` (`cooldown`, `cap`, `not_visible`, `failed`); only for a night that matched or hid something |
| `rule.field_changed` | `services.rules.actions.change_lifecycle` | — (the nightly step) | Customer or Account (`target_repr` "Customer <id>" / "Account <id>", never the name) | `rule`, `field` (`lifecycle_stage`), `old`, `new` (stage values) |
| `rule.review_approved` | `services.rules.reviews.send_review` (approve, or a rule sending without review) | user, or — without review | RuleReview ("Rule review <id>") | `rule`, `survey_send`, `without_review` |
| `rule.review_skipped` | `services.rules.reviews.skip_review` | user | RuleReview | `rule` |
| `rule.review_expired` | `services.rules.reviews.expire_reviews` (nightly) | — | RuleReview | `rule` |
```

In the existing `survey.sent` row, append to its metadata cell: `; plus `rule` (the rule's id) when a rule sent it, from `services.rules.reviews.send_review`, with no actor when sent without review`.

- [ ] **Step 3: `docs/data-classification.md`**

Add after the `surveys.SurveySend, surveys.SurveyInvite` row in the models table:

```markdown
| `rules.Rule`, `rules.RuleState`, `rules.RuleRun`, `rules.RuleRunRecord`, `rules.RuleReview` | confidential | — (ids only: `RuleState`, `RuleRunRecord` and `RuleReview.records` reference organisations, accounts or contacts by id; `actions.people`, `shared_with` and `decided_by` reference users) | a rule's name and the owner's words in its actions (task title, notify message, survey subject and intro); trigger fields, thresholds, stage and choice values; per night counts and per record action statuses whose `detail` is a fixed phrase or an exception's class name, never personal data or an exception's text. Rules run as their owner over records the owner may open (AUTH-02); runs are read per reader over what they may open now, the rest a count; reviews are the owner's alone; writes owner-only and audited (LOG-01) |
```

Add after the `Segment alert` row in the flows table:

```markdown
| Rule digest (in-app `Notification`, kind `rule_fired`) | the rule's name, the segment's name, up to three organisation or account names the recipient may open (contacts only counted), the trigger in words, the owner's note | confidential | one per recipient per night; each recipient told only about records they may open (AUTH-02); linked to the night only for someone who may read the rule; also the one-off notice that a rule switched itself off (its name and the reason) |
| Rule review notice (in-app `Notification`, kind `rule_review`) | how many surveys from the owner's rules are waiting | internal | the owner only, once a night; names no record |
| A rule's survey (`services.rules.reviews.send_review` → `services/surveys`) | as the survey email above | confidential | sent only on the owner's approval, or at once for a rule marked "without review"; the audience is the night's fired records the owner may still open, through every Surveys rule; audited `rule.review_approved` and `survey.sent` |
```

- [ ] **Step 4: The product documents**

`docs/product/01-prd.md`:
- In the features table, add after the `Surveys (NPS, CSAT, CES)` row: `| Rules (when → then) | Built (backend) | One trigger (entered or left one of my segments; CSAT, NPS, CES or health crossed a line; weekly or monthly) and one to three actions (notify, create a task, change the lifecycle stage, send a survey) on the owner's own segment, run nightly as the owner over records they may open. Once per record per cooldown (default 30 days), at most 200 a night; surveys wait in the owner's review unless sent without review, and go through every Surveys rule; a rule switches itself off when its segment or owner goes away. Shared like segments; readers see only records they may open, plus a count |`.
- In the `Scenarios (visual automation)` row, append: ` The simpler rules (Rules, above) sit beside it; the canvas is unchanged.`
- Change open item 4 to: `4. **Survey reminders.** Sends start by hand or from a rule (approved in the Review Queue, or sent without review); reminder emails are a later delivery.`
- In the changelog, add `| 2026-10-04 | Rules (backend): rules on the owner's segments, nightly as the owner, tasks, lifecycle, digests, survey reviews through Surveys |`.

`docs/product/02-trd.md`:
- In the services table, add after `services/surveys/`: `| \`services/rules/\` | Rules: when → then. \`triggers.py\` reads a night's matches as the owner (entries and exits from \`SegmentChange\`, scores crossing a line against \`RuleState\`, the schedule); \`selection.py\` applies the cooldown and the 200 cap and serves the builder's test, which writes nothing; \`actions.py\` makes tasks, sets the lifecycle under the record's row lock (audited per record) and sends one digest per recipient naming only what they may open; \`reviews.py\` sends a rule's survey through \`surveys.sending.claim\` with the fired records as its audience, locking the review then the claim's own rows; \`nightly.py\` runs in \`run_health_maintenance\` after the segments, each rule in its own transaction and each record and action in its own savepoint, idempotent per rule and night |`.
- In the known limits list, replace `- Scenario "Schedule" trigger has no scheduler behind it.` with `- Scenario "Schedule" trigger has no scheduler behind it; rules (\`services/rules\`) have weekly and monthly schedules, run nightly.`

`docs/product/05-backend-schema.md`:
- In the `Notification` row, add `rule_fired, rule_review` to the kinds, and change "message" to "message (≤ 500)".
- Add after the `### \`surveys\`` section:

```markdown
### `rules`

| Model | Purpose |
|---|---|
| `Rule` | A "when → then" rule: `owner`, `name`, `is_active` (default off), `segment` (the owner's own, SET_NULL), `trigger` (`entered`, `left`, `crossed`, `schedule`) with `score`/`direction`/`threshold` or `cadence`/`weekday`, `actions` (1–3 JSON objects: notify, task, lifecycle, survey), `cooldown_days` (1–365, default 30), `sharing` with `shared_with`, `paused_reason`. At most 50 per owner |
| `RuleState` | Per rule and record (`record_kind`, `record_id`, unique): `last_value` (last night's score, for `crossed`) and `last_fired_on` (the cooldown) |
| `RuleRun` | One rule's night (unique per rule and `run_on`): `matched`, `fired`, `skipped` (`cooldown`, `cap`, `not_visible`, `failed`), `started_at`, `finished_at` |
| `RuleRunRecord` | One record a night touched (unique per run and record): `outcome`, `reason`, `actions` (`[{action, status, detail}]`) |
| `RuleReview` | One night's survey for the owner (one-to-one with the run): `action` (frozen), `records`, `counts`, `status` (`waiting`, `approved`, `skipped`, `expired` after 7 days), `decided_by`, `decided_at`, `result` |
```

- In the access table, add after the `Survey sends` row: `| Rules | Read by the owner, the workspace or chosen teammates; written by the owner only, on their own segment. A rule runs as its owner over records they may open; a night's records are listed only where the reader may open them now, the rest a count; reviews are the owner's alone | \`services/rules/access.py\`, \`records.py\`, \`payloads.py\`, \`reviews.py\` |`.

`docs/product/06-implementation-plan.md`, in `### C5. Survey delivery`, replace `reminders, the approval queue and automatic sends follow with Scenarios v2.` with `automatic sends and the approval queue arrived with rules on 2026-10-04 (backend, \`services/rules\`; spec: react-ts-app \`docs/superpowers/specs/2026-10-04-rules-design.md\`); reminders follow later.`

- [ ] **Step 5: Format and check the docs**

Run:
```bash
venv/bin/ruff format docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md
venv/bin/ruff check . && venv/bin/ruff format --check .
venv/bin/python manage.py test --parallel --noinput
```
Expected: ruff is clean, and the full suite passes.

- [ ] **Step 6: Commit**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product
git commit -m "docs(rules): API contracts, audit events, data classification, product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** (backend scope: §1, §3, §4 backend, §5.1):

| Spec | Where |
|---|---|
| §1.1 `Rule` fields and limits, 50 per owner | Task 1 (model, constraints), Task 3 (validation), Task 4 (429) |
| §1.1 `RuleState`, `RuleRun`, `RuleRunRecord`, `RuleReview` (7-day expiry) | Task 1; expiry in Task 8 |
| §1.2 entered/left from `SegmentChange` | Task 5 |
| §1.2 crossed: stored values, first-night no-fire, both directions, `last_value` every night, columns, contacts refused | Task 5 (match), Task 9 (storage, two nights), Task 3 (refusals) |
| §1.2 schedule weekly/monthly in `settings.TIME_ZONE` | Task 5 (`is_due` on `timezone.localdate()`) |
| §1.3 notify digest per recipient, kind `rule_fired` | Task 1 (kind), Task 7 |
| §1.3 task per organisation/account, contacts on their parent | Task 7 |
| §1.3 lifecycle, audited per record, not on contacts | Task 3, Task 7 |
| §1.3 survey: review or without review, `SurveySend` owned by the owner, named, segment and roles, limited to fired records, every Surveys rule, refusals stored | Task 2 (`records`), Task 8, Task 9 (without review) |
| §1.4 order in `run_health_maintenance`, `--dry-run` | Task 9 |
| §1.4 per-rule transaction and try/except, pause with reason and notice, not_visible, cooldown, cap 200, per record/action savepoints, run and records, states, `rule.fired`, `rule_review` once, idempotent, expiry | Task 6 (selection), Task 9 |
| §1.5 CRUD, 404/403 | Task 4 |
| §1.5 test endpoint, writes nothing | Task 6 |
| §1.5 runs (cursor) and run records, twice filtered | Task 10 |
| §1.5 reviews list, approve/skip, 409, refusal 400 | Task 10 |
| §1.5 errors 400 at field, 409, 429 | Tasks 3, 4, 10 |
| §3 running as the owner at match, act and audience (`# SOC2:AUTH-02`) | Tasks 5, 7, 8, 9 |
| §3 audit events (`# SOC2:LOG-01`) | Tasks 4, 7, 8, 9; catalogue in Task 12 |
| §3 notifications name records only to those who may open them | Task 7 |
| §4 backend tests (each listed case) | Tasks 1–10, e2e Task 11 |
| §5.1 backend PR | Tasks 1–12 on `feat/rules`; merge before the frontend |

**Placeholder scan:** no "TBD", "TODO", "similar to", or steps without code. Every test and implementation is written out, and the doc text is given verbatim.

**Type consistency, checked across tasks:**
- `matches(rule, viewer, *, today, preview=False, state_rule_id=None) -> Match` (Task 5) is used by `select` (Task 6).
- `select(...) -> Selection` with `fire`, `cooldown`, `cap`, `not_visible`, `values`, `matched`, `skipped(failed=)` (Task 6) is used by `run_rule` (Task 9) and `preview_payload` (Task 6).
- `INTERNAL[name](action, rule, record, kind, *, today, made)` (Task 7) is called by `_act` and patched by the nightly tests (Task 9).
- `notify_statuses(action, rule, run, records, kind)` (Task 7) is called by `_act` (Task 9).
- `create_review(rule, run, record_ids, action, *, today)` and `send_review(review_id, *, actor, today, now, request=None) -> Answer` (Task 8) are used by Tasks 9 and 10.
- `skip_review(review_id, user, *, now, request=None)` and `get_owned_review(user, pk)` (Task 8) are used by Task 10.
- `review_of(run)` (Task 4) is used by `runs_page` (Task 10).
- `names`, `visible_q`, `openable`, `load` (Task 5) are used by Tasks 6, 7, 9 and 10.
- `resolve(..., records=)` and `claim(..., records=)` (Task 2) are used by Task 8.
- The URL names `rule-list`, `rule-test`, `rule-detail`, `rule-runs`, `rule-run-detail`, `rule-review-list`, `rule-review-approve` and `rule-review-skip` are consistent between Tasks 4, 6 and 10.

## Spec gaps and conflicts found while planning

1. **The Review Queue is admin-only in the frontend.** `/brain/*` sits behind `RequireCapability capability="view_all_accounts"` (react-ts-app `src/App.tsx`), so a CSM, who builds rules on their own segments, cannot open `/brain/review` to see "From your rules". The backend serves `/api/v1/rules/reviews/` to every owner, and the `rule_review` notification links to `/brain/review`. The frontend plan must open that section or route to everyone, or the link should point somewhere a CSM can reach.
2. **The notify `message` (≤ 280) does not fit a notification (255).** `Notification.message` was `max_length=255`. This plan widens it to 500 (Decision 11). If the owner prefers not to touch notifications, the alternative is cutting the owner's note, which loses their words.
3. **Cooldown versus schedule.** The spec applies the cooldown "for every trigger", default 30 days, and offers weekly schedules. A weekly rule with the default cooldown reaches each record only about every five weeks. This plan follows the spec (Decision 5). The builder should suggest a cooldown of at most 7 days for weekly rules and at most 28 for monthly ones, or the spec should exempt schedules.
4. **200 records can exceed Surveys' 500 people.** At up to three people per organisation or account, a night of 200 records can reach 600 people. Surveys then refuses the whole send ("would reach N people; the most is 500"), and the review waits with that refusal. A lower cap for survey rules, or splitting the send, would need a spec decision.
5. **"Who would match tonight" cannot be exact before tonight.** The segments step that writes tonight's entries and exits has not run, and a `crossed` rule never fires on a first sight. Decision 19 defines what the test answers. The builder's copy should say "would match if tonight's run happened now".
6. **`RuleRun.review` and `RuleReview.run` point at each other.** The spec gives both columns. This plan keeps one one-to-one link, reachable both ways (Decision 12).
7. **The review item's "6 people at 4 organisations" needs data the spec's `RuleReview` lacks.** This plan adds `RuleReview.counts` (Decision 13).
8. **"Send without review" refusals are not addressed.** The spec does not say what happens when an automatic send is refused. This plan leaves it waiting in the owner's queue with the refusal, and tells the owner (Decision 14).
9. **The kind of the "switched itself off" notice is not named.** The spec adds only `rule_fired` and `rule_review`. This plan uses `rule_fired` for it (Decision 20).
10. **The owner limit's status differs from segments.** The spec says 429; segments answer 400 for the same kind of limit. This plan follows the spec.
11. **Lifecycle `churn` and `churn_date`.** The canvas's "Churn entity" sets `churn_date`. A rule's lifecycle action sets the stage only (Decision 10), since the spec limits rules to that one field. The Organisations list's churned filter reads the Churn stage too (`organizations.book.CHURNED`), so such records still read as churned there.
12. **A record that left the segment is surveyed.** For a `left` rule, the fired records are by definition no longer members. The spec's "audience limited to the fired records" is read as replacing the members rather than narrowing them (Decision 18). Otherwise a `left` rule's survey would always be empty.
