# Work, delivery 2: Recommended (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revenact reads every workspace once a day (and on "Run now"), turns each triggering signal (a renewal due, a health drop, urgent tickets, overdue tasks, unanswered questions, a live anomaly, an AI-agent task proposal) into one open recommendation routed to the right person's queue, tells them once a day, and lets them assign it (which makes the task, through the AI agent's own approval for its proposals) or dismiss it with a reason; a workspace tunes it in Work settings.

**Architecture:** The `services/work` app gets its first models, `Recommendation` and `WorkSettings`. Four engine modules do the work: `sources.py` (one rules-only function per kind over a `Book` read as the workspace itself), `routing.py` (function owner → record owner → manager → fallbacks, every candidate active and able to open the record), `recommend.py` (`refresh`: upsert, expire, cooldown, worsened re-raise, per-source failure isolation, the `recommendations_waiting` notice; `settle_for_proposal` keeps Brain in sync) and `deciding.py` (assign and dismiss under row locks). `rec_access.py` is the one rule for who decides and which a reader is shown; `recommendations.py` and `defaults.py` shape the list. `run_health_maintenance` calls `refresh_all` before the rules; `metrics.proposals.approve`/`reject` settle the recommendation of the proposal they decide.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL 16 (CI/prod; local 15), Channels (in-memory layer under test), Django test runner with `--parallel`, ruff 0.16.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-spec/docs/superpowers/specs/2026-10-07-work-round-design.md` (react-ts-app). This plan covers §2.1–§2.3 (all of delivery 2's backend), §0 and §4–§6 as they apply to it, and §1.2's owner decisions (view-all and Leadership read and edit every task on records they may open; plan tasks keep plan rules: neither changes here, and the tasks this delivery makes are ordinary tasks). §2.4 is the frontend plan's. Delivery 3 (nudges, escalation, timezone, working days, digest) is out of scope; `WorkSettings` is shaped so its fields are new columns beside these, `GET /work/settings/` clients ignore keys they do not know, and `clock.add_working_days` is the one place "working day" is decided (Monday to Friday until then).

## Global Constraints

- **Postgres 16.** Every visibility filter is an `id__in` subquery; never a join made unique with `.distinct()`, and never `COUNT(DISTINCT ...)` (count distinct ids in Python where needed, as `sources.anomaly` does). Task 8 extends `services/work/tests/test_queries.py` with a no-DISTINCT test over the recommender, the list, the settings and both decisions.
- **Twice-filter.** A recommendation is read only by someone who may decide it (`rec_access.decidable` / `decided_as`) AND who may open its record (`rec_access.openable`: `visible_customers` for an organisation's, `visible_accounts` for an account's). Anything outside it is counted (`hidden`), never named; its routes answer 404.
- **Counted, not named.** Facts name only the record itself and counts. Never copy another record's name, a ticket's, task's or question's text, or an anomaly's model-written title into `why`, a title or a notification. A notification names a record only to a recipient who may open it (`scoping.can_open`).
- **Routing.** Every suggested assignee and recipient is active and can open the record (`scoping.can_open`), checked when the recommendation is made and again on every refresh (it is re-routed). Assigning checks the assignee again (`task_access.assignee_for`, 400 `ASSIGNEE_CANNOT_OPEN`).
- **No AI in the engine.** Nothing under `services/work` imports `services.copilot` or calls a model. Reading the AI agent's stored proposals is fine.
- **Scheduled reads** use `SystemActor(organisation)` (`services/customers/scoping.py`), never a person.
- **Locks.** A decision runs under `select_for_update`. For an AI-agent recommendation the proposal's row is locked first, then the recommendation's: the order Brain's `ProposalDecisionView` takes (it locks the proposal, then `approve`/`reject` call `settle_for_proposal`, which locks the recommendation).
- **Notifications** use `push_on_commit=True` and never go to the person acting. `recommendations_waiting` goes at most once a day per recipient.
- **Migrations.** work `0001_recommended` (generated: `Recommendation`, `WorkSettings`) and notifications `0008_recommendations_waiting` (generated: one `AlterField` on `kind`'s choices). `venv/bin/python manage.py makemigrations --check --dry-run` must report no changes.
- **Tests.** Run exactly `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test <labels> --parallel --noinput`, in the foreground. Never run two Django test runs at once: they share the test database name.
- **Lint.** `venv/bin/ruff format <paths>` then `venv/bin/ruff check <paths>` in each task (line length 100, rules E, F, I); `venv/bin/ruff format --check .` and `venv/bin/ruff check .` before the last commit. Ruff formats the Python inside Markdown fences in `docs/` too, so run `venv/bin/ruff format docs/` after editing docs.
- **Shards.** `venv/bin/python scripts/ci_shard_labels.py --check 4` after adding test modules.
- **Semgrep.** Never return a URL built with an f-string from a DRF view; the evidence links and the notice's link are stored strings, never a response's own URL.
- **Docs.** `docs/API_CONTRACTS.md` and the four backend product docs (`docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`) change in this PR, plus `docs/audit-events.md` and `docs/data-classification.md` (Task 8).
- **Git.** Branch `feat/work-recommended` (worktree `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-rec-be`). `venv` and `.env` are symlinks: never commit them; always `git add <explicit paths>`. Never `git stash`. Every commit message ends with exactly this line:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

### API contract (binding for the frontend plan)

The same text is committed standalone as `docs/superpowers/plans/2026-10-07-work-recommended-api.md`; Task 8 copies it into `docs/API_CONTRACTS.md`.

Backend plan: `docs/superpowers/plans/2026-10-07-work-recommended-backend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md` §2. Every path is under `/api/v1/`,
every route is `IsAuthenticated`, every body is JSON. Dates are `YYYY-MM-DD`; timestamps are
ISO 8601 UTC as DRF writes them (`2026-10-07T09:30:00.123456Z`). "Today" is the server's date
(UTC) until delivery 3 moves it to the workspace timezone. Delivery 1's shapes (TaskRow, Event,
the task panel) are unchanged and referred to by name.

#### What a recommendation is

Revenact reads the workspace once a day (and on "Run now") and recommends a task wherever a
signal triggers: a renewal due, a health drop, urgent tickets, overdue tasks, unanswered
questions, a live anomaly, or a task the AI agent proposed. Each lands in one person's queue (the
**recipient**) with a **suggested assignee**. There is at most one open recommendation per kind
and record (per proposal for the AI agent's); a recommendation is open, assigned, dismissed or
expired (its signal stopped).

#### Who sees and decides one

- **Decides:** its recipient, anyone above its suggested assignee in the org chart, or a reader
  with `view_all_accounts`. Leadership without `view_all_accounts` has no extra right here.
- **Record rule:** only on an organisation or account the reader may open. A recommendation
  about anything else is counted in `hidden`, never named, and its routes answer 404.
- An AI-agent recommendation (`kind: "agent"`) is the same decision as the proposal in Brain ›
  Waiting on you: deciding it in either place settles both.

#### Shared shapes

**RecommendationRow** (`GET /work/recommendations/` items):

```json
{
  "id": 5,
  "kind": "renewal_due",
  "title": "Prepare Dough Co's renewal",
  "why": {
    "facts": ["Renews in 30 days", "Renewal date 6 Nov"],
    "evidence": [{"label": "Dough Co", "link": "/organizations/2"}]
  },
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "suggested_assignee": {"id": 3, "name": "Carl CSM", "active": true, "can_open": true},
  "recipient": {"id": 2, "name": "Mona Manager"},
  "defaults": {"title": "Prepare Dough Co's renewal", "due_date": "2026-10-30", "priority": "high"},
  "proposal": null,
  "created_at": "2026-10-07T00:05:00.123456Z"
}
```

- `kind`: `renewal_due | health_drop | urgent_tickets | overdue_tasks | open_questions | anomaly |
  agent`.
- `why.facts`: plain sentences, shown as a short list. `why.evidence`: links inside the app
  (`/organizations/<id>`, `/accounts/<id>`, `/brain/anomalies`), each `{label, link}`.
- `record.kind`: `customer` (an organisation, `/organizations/<id>`) or `account`
  (`/accounts/<id>`).
- `suggested_assignee`: `null` when nobody could be suggested (the item went to a fallback
  recipient). `can_open: false` or `active: false` means that person can no longer take it: do
  not prefill them (the Assign picker is `GET /work/assignees/?customer=|account=`, delivery 1).
- `defaults`: what Assign prefills. `due_date` is the renewal date minus 7 days for
  `renewal_due` (never before today), the proposal's date for `agent` (never before today),
  otherwise today plus 3 working days (Monday to Friday). `priority` is `high` for
  `renewal_due`, `health_drop`, `urgent_tickets` and `anomaly`, `medium` for `overdue_tasks` and
  `open_questions`, the proposal's own for `agent`.
- `proposal`: the AI-agent proposal's id for `kind: "agent"`, else `null`.

Sentences `facts` take, by kind:

| kind | title | facts |
|---|---|---|
| `renewal_due` | "Prepare <name>'s renewal" | "Renews in 9 days" / "Renews in 1 day" / "Renews today" / "Renewal is 3 days overdue"; "Renewal date 6 Nov" |
| `health_drop` | "Find out why <name>'s health fell" | "Health fell 5.6 → 4.9 since 30 Sep" |
| `urgent_tickets` | "Get <name>'s urgent tickets moving" | "3 urgent tickets open"; "Oldest opened 6 days ago" |
| `overdue_tasks` | "Catch up on <name>'s overdue tasks" | "2 tasks overdue by 2 days or more"; "Oldest was due 12 Sep" |
| `open_questions` | "Get <name>'s open questions answered" | "2 questions open for 3 days or more"; "Oldest asked 4 days ago" |
| `anomaly` | "Check <name> against a live anomaly" | "Named in 1 live anomaly"; "Last seen 2 days ago" |
| `agent` | the proposed task's title | "Proposed by the AI agent"; "The agent suggested Carl CSM" (when it named someone) |

No fact ever names another record, a ticket's, task's or question's text, or an anomaly's
model-written title: only the record itself and counts.

**DecidedRecommendation** (the decision routes, and the 409):

```json
{
  "id": 5,
  "status": "assigned",
  "decided_by": {"id": 2, "name": "Mona Manager"},
  "decided_at": "2026-10-07T09:30:00.123456Z",
  "task_id": 41,
  "dismiss_reason": "",
  "dismiss_note": ""
}
```

- `status`: `open | assigned | dismissed | expired`. `decided_by` and `decided_at` are `null`
  while open; an expired one has `decided_by: null` and `decided_at` when it expired.
- `task_id`: the task it became (assigned only), else `null`.
- `dismiss_reason`: `already_handled | not_relevant | wrong_person | other`, or `""`.
  `dismiss_note`: the reader's text for `other`, else `""`. An AI-agent recommendation
  rejected in Brain reads `other` with the Brain note (or "Rejected in Brain").

#### `GET /work/recommendations/?scope=me|team`

The open recommendations the caller may decide, newest first.

```json
{
  "scope": "team",
  "items": [RecommendationRow],
  "count": 3,
  "hidden": 1
}
```

- `me`: those in the caller's own queue (they are the recipient). `team`: everything the caller
  may decide (their queue, those suggesting anyone below them, and for a `view_all_accounts`
  caller every open one in the workspace).
- `scope` defaults to `team` for a caller with reports or `view_all_accounts`, else `me`.
- At most 100 `items`; `count` is the full total. `hidden`: open recommendations in the same set
  about records the caller cannot open ("N more about accounts you can't open"). Counted, never
  listed.
- The sidebar badge adds `count` (scope `team`) to Today's `counts.overdue`.
- Refusal: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose me or team."}`.

#### `POST /work/recommendations/<id>/assign/`

```json
{
  "assignee_id": 3,
  "due_date": "2026-10-30",
  "title": "Prepare Dough Co's renewal",
  "priority": "high"
}
```

- `assignee_id` is required; `due_date`, `title` and `priority` are optional and default to the
  row's `defaults`.
- `201`:

  ```json
  {"recommendation": DecidedRecommendation, "task": TaskRow}
  ```

- The task: on the recommendation's record, `source: "recommendation"` (`"agent"` for an
  AI-agent recommendation), `created_by` the caller, `description` built from the facts
  (`"Recommended by Revenact:\n- Renews in 30 days\n- Renewal date 6 Nov"`). Its trail starts
  with `created` (`data` carries `recommendation: <id>`, and `proposal: <id>` for an agent one)
  then `recommended` (`data: {facts: [...]}`). The assignee is told (`task_assigned`) unless they
  are the caller.
- An AI-agent recommendation approves its proposal (exactly one task, linked to both; the
  proposal reads approved in Brain). The caller's chosen person is used, not the agent's.
- Audited as `work.recommendation_assign` (`kind`, `decided_as`: `recipient`, `chain` or
  `company`, `task`).
- Refusals, in this order:
  - `404 {"detail": "No such recommendation."}`: another workspace, or a record the caller
    cannot open;
  - `403 {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}`;
  - `400` field errors: `{"assignee_id": ["Choose who does it."]}` (missing, `null`, not a
    number), `{"due_date": ["Choose a date."]}`, `{"title": ["Give the task a title."]}` or
    `{"title": ["Keep the title under 255 characters."]}`,
    `{"priority": ["Choose high, medium or low."]}`;
  - `409` when it is no longer open (someone decided first, or it expired):

    ```json
    {
      "code": "ALREADY_DECIDED",
      "detail": "Mona Manager already assigned this.",
      "recommendation": DecidedRecommendation
    }
    ```

    `detail` is "<name> already assigned this." / "<name> already dismissed this." /
    "This recommendation has expired.";
  - `400 {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}`
    (or `"... this account."`): the assignee is not an active member who can open the record.

#### `POST /work/recommendations/<id>/dismiss/`

```json
{"reason": "other", "note": "They are moving to annual billing"}
```

- `reason` is required: `already_handled | not_relevant | wrong_person | other`. `note` is
  required (non-blank, at most 255) with `other` and ignored otherwise.
- `200 {"recommendation": DecidedRecommendation}`.
- An AI-agent recommendation also rejects its proposal (its note is the reason's label, plus
  ": <note>" for `other`).
- A dismissed signal is not recommended again for the workspace's `dismiss_cooldown_days`
  unless it gets worse (a renewal becomes overdue; a health drop falls by another full `drop`;
  more tickets, tasks, questions or anomalies than when dismissed).
- Audited as `work.recommendation_dismiss` (`kind`, `decided_as`, `reason`).
- Refusals: as assign (404, 403, then 400, then 409), with the field errors
  `{"reason": ["Choose already handled, not relevant, wrong person or other."]}`,
  `{"note": ["Say why."]}`, `{"note": ["Keep the note under 255 characters."]}`.

#### `POST /work/recommendations/refresh/`

"Run now" in Settings › Work. `manage_org_settings` only. No body.

```json
{"created": 2, "updated": 5, "expired": 1, "unrouted": 0, "notified": 2, "failed": []}
```

- `created`: new open recommendations; `updated`: open ones refreshed in place; `expired`: open
  ones whose signal stopped (or whose source was turned off); `unrouted`: signals nobody could
  receive (no active member able to open the record); `notified`: recipients told;
  `failed`: the sources that failed this run (each fails on its own; the others still ran).
- Audited as `work.recommendations_refresh`.
- Refusal: `403 {"detail": "You don't have permission to change organisation settings."}`.

#### `GET /work/settings/`

Any member.

```json
{
  "recommend_to": "manager",
  "sources": {
    "renewal_due": {"enabled": true, "days": 30},
    "health_drop": {"enabled": true, "drop": 0.5, "window_days": 14},
    "urgent_tickets": {"enabled": true, "min": 1},
    "overdue_tasks": {"enabled": true, "days": 2},
    "open_questions": {"enabled": true, "days": 3},
    "anomaly": {"enabled": true},
    "agent": {"enabled": true}
  },
  "dismiss_cooldown_days": 14,
  "can_edit": false
}
```

- `recommend_to`: `manager` (the suggested person's manager receives it, when they have an
  active one who can open the record) or `owner` (the suggested person receives it).
- `sources`, per kind: `days` (renewal: within this many days, or overdue; overdue tasks: overdue
  by at least this many days; questions: open at least this many days), `drop` and
  `window_days` (health now at least `drop` below the latest reading from `window_days` ago or
  earlier), `min` (at least this many open critical or high tickets).
- `can_edit`: the caller holds `manage_org_settings`; everyone else sees the page read-only.
- Delivery 3 adds fields here (timezone, working days, escalation, digest, `email_ready`);
  clients ignore keys they do not know.

#### `PATCH /work/settings/`

`manage_org_settings` only. Any of the `GET` fields but `can_edit`; inside `sources`, any kind
and any of its fields (the rest keep their values):

```json
{
  "recommend_to": "owner",
  "sources": {"renewal_due": {"days": 45}, "health_drop": {"enabled": false}},
  "dismiss_cooldown_days": 7
}
```

- `200` with the `GET` shape. Unknown top-level keys are ignored; a body that changes nothing
  writes nothing. Audited as `work.settings_update` (`fields`).
- Limits: `days` and `window_days` whole numbers 1–120; `min` a whole number 1–50; `drop` a
  number 0.1–5 (kept to one decimal place); `dismiss_cooldown_days` a whole number 0–120;
  `enabled` `true` or `false`.
- Refusals (`400`, nothing saved):
  - `{"recommend_to": ["Choose manager or owner."]}`;
  - `{"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]}`;
  - `{"sources": {"renewal_due": {"days": ["Choose a whole number from 1 to 120."]}}}` (and the
    same for `window_days`, `overdue_tasks.days`, `open_questions.days`);
  - `{"sources": {"urgent_tickets": {"min": ["Choose a whole number from 1 to 50."]}}}`;
  - `{"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}}`;
  - `{"sources": {"<kind>": {"enabled": ["Choose on or off."]}}}`;
  - `{"sources": {"<kind>": {"<field>": ["Unknown setting."]}}}`;
  - `{"sources": {"<kind>": ["Unknown source."]}}`;
  - `{"sources": {"<kind>": ["Send each source's settings as one object."]}}`;
  - `{"sources": ["Send the sources as one object."]}`;
  - `{"non_field_errors": ["Send the fields as one object."]}`;
  - `403 {"detail": "You don't have permission to change organisation settings."}`.

#### Changed existing routes

**`POST /metrics/proposals/<id>/approve/`** and **`.../reject/`** (Brain › Waiting on you) also
settle the proposal's open recommendation: approve marks it assigned (linked to the task it made,
`decided_by` the approver); reject marks it dismissed (`dismiss_reason: "other"`, the note or
"Rejected in Brain"). Their responses are unchanged.

**Event `created`** (delivery 1's trail) carries `recommendation: <id>` for a task made from a
recommendation.

#### Notifications

New kind `recommendations_waiting` on `GET /notifications/`:

```json
{
  "id": 30,
  "kind": "recommendations_waiting",
  "message": "3 tasks recommended for your team.",
  "link": "/work/recommended",
  "actor": null,
  "is_read": false,
  "created_at": "2026-10-07T00:05:00.123456Z"
}
```

- After each run, every recipient with new open recommendations is told once, and at most once
  a day.
- One new item, to a recipient who may open its record: "Revenact recommends “Prepare Dough
  Co's renewal”." Otherwise counted: "N tasks recommended for you." when every new item suggests
  the recipient themselves, else "N tasks recommended for your team." Never names a record the
  recipient cannot open.
- Assigned, dismissed and expired recommendations are never notified about again.

---

## Decisions (where the spec is silent or the code forces a detail)

1. **The AI agent's are one per proposal.** Two pending proposals can name the same organisation, so the spec's two partial unique constraints (one open per organisation, kind and customer, account null / not null) exclude `kind = agent`, and a third, `rec_one_per_proposal`, keeps one recommendation (of any status) per proposal.
2. **`dismiss_note`.** `dismiss_reason` holds the reason's code (`already_handled`, `not_relevant`, `wrong_person`, `other`); "Other"'s text goes in a second field, `dismiss_note` (CharField 255).
3. **An account's recommendation** carries `customer` = the account's lowest-id live organisation (an account may sit under several). Renewals, health drops, urgent tickets, overdue tasks and anomalies are read per organisation and per account; questions and the AI agent's proposals name only an organisation.
4. **Health drop's earlier reading** is the latest `HealthSnapshot` captured on or before `today − window_days` (the job writes month-ends, so it may be older than the window); with none, there is no signal. The fact names its date.
5. **Urgent tickets** are open tickets (not resolved or closed) at the support priorities, critical and high (`attention.rules.SUPPORT_PRIORITIES`); the signal is their count ≥ `min`.
6. **Overdue tasks** use Work's meaning of overdue (past due and not Blocked, `states.overdue_q`), due on or before `today − days`.
7. **Every source skips churned, archived and other workspaces' records** (`live_customers` without the Churn stage; accounts in the Churn stage too).
8. **"Worse" (re-raising inside the cooldown):** a renewal that has become overdue (`now < 0 <= then`); a health drop deeper by another full `drop`; more tickets, tasks, questions or anomalies than at the decision. The AI agent's never worsen (each proposal is its own key).
9. **An assignment holds back too.** While the task a recommendation became is open, the same signal is not recommended again; once it is done, the cooldown runs from the decision, like a dismissal. Without this the daily job would re-recommend every renewal the day after it was assigned.
10. **An open recommendation is re-routed on every refresh** (its suggested person and recipient can change when an owner or manager changes, or someone loses access); the move notifies nobody.
11. **Expiry** sets `status = expired` and `decided_at` (when it stopped), `decided_by` null. Turning a source off expires its open recommendations.
12. **Fallbacks need access too.** With nobody suggested, the recipient is the first active member (by join date) with `view_all_accounts`, else the workspace's owner (`identity.ownership.owner_membership`), each only if they can open the record. If nobody can, the signal is counted as `unrouted` and retried next run.
13. **Who decides.** The recipient, anyone above the suggested assignee (`subtree_ids`), or `view_all_accounts` (`rec_access.decided_as`). Leadership without view-all has no extra right here (§1.2's widening is about tasks). The suggested person decides only when they are the recipient. Brain keeps its own rule for proposals (`brain.waiting.decided_as`); either place settles both.
14. **Scopes.** `me` = the caller's own queue; `team` = everything they may decide. The default is `team` for a caller with reports or view-all, else `me`. Unlike Team, `team` is open to everyone (it only adds what they may decide), so there is no 403.
15. **Refusal order** on a decision: 404 (another workspace or a record the caller cannot open), 403 `CANT_DECIDE`, 400 field errors, 409 `ALREADY_DECIDED`, 400 `ASSIGNEE_CANNOT_OPEN`. Someone who may not decide cannot learn a recommendation's state.
16. **An AI-agent recommendation's task** goes through `metrics.proposals.approve`, which gains optional overrides (`assignee`, `title`, `due_date`, `priority`, `description`, `facts`, `event_data`): the decider's person wins over the agent's (no `suggested`/`fallback` note then), the task keeps `source = agent` (it is the agent's task; the `recommended` event and `created`'s `recommendation` id say how it came), and the recommendation links the one task approval made.
17. **Default due date:** `max(today, renewal − 7 days)` for a renewal; `max(today, the proposal's date)` for the AI agent's; otherwise today plus 3 working days (Monday to Friday, `clock.add_working_days`). **Default priority:** high for renewals, health drops, urgent tickets and anomalies; medium for overdue tasks and questions; the proposal's own for the AI agent's.
18. **The task's description** is `"Recommended by Revenact:\n- <fact>\n- <fact>"`.
19. **The notice.** One new item to a recipient who may open its record names it ("Revenact recommends “<title>”."); otherwise it counts ("N tasks recommended for you." when every new item suggests the recipient, else "... for your team."). "Once a day" is any `recommendations_waiting` notification to them created on `today`'s date. A deactivated recipient is not told.
20. **Settings limits.** `days`/`window_days` 1–120, `min` 1–50, `drop` 0.1–5 kept to one decimal place, `dismiss_cooldown_days` 0–120 (0 = no cooldown). Inside `sources`, an unknown kind or field is a 400 (the client sends only what `GET` returned); unknown top-level keys are ignored, as on `PATCH /tasks/<id>/`.
21. **Brain's reject** settles an AI-agent recommendation as dismissed with `dismiss_reason = other` and the Brain note (or "Rejected in Brain").
22. **Evidence links** are app routes: the record's page (`/organizations/<id>`, `/accounts/<id>`) and, for an anomaly, `/brain/anomalies`.
23. **Audit actions:** `work.recommendation_assign`, `work.recommendation_dismiss`, `work.recommendations_refresh`, `work.settings_update`.
24. **`RecommendFixture`'s refresh helper is `refresh_now`, not `run`:** a method named `run` on a `TestCase` shadows `unittest.TestCase.run`, which the test runner calls positionally on every instance, crashing the whole class — the same gotcha already documented at `services/rules/tests/test_reading.py:35-38` and `test_review_kinds.py:27-29`. Every `self.run(...)` call site in this plan (Tasks 1–8) is `self.refresh_now(...)`.

## File Structure

- Create `services/work/models.py`: `DEFAULT_SOURCES`, `default_sources`, `Recommendation` (kinds, statuses, dismiss reasons, three constraints, `record`), `WorkSettings`.
- Create `services/work/migrations/__init__.py` and `services/work/migrations/0001_recommended.py` (generated).
- Create `services/work/prefs.py`: `settings_for`, `effective_sources`, then (Task 6) `payload`, `changes_from`.
- Create `services/work/sources.py`: `Signal`, `Book`, `load_book`, `record_link`, `plural`, `day`, `ago`, the seven sources, `SOURCES`.
- Create `services/work/routing.py`: `FUNCTION_FOR`, `Route`, `Router`.
- Create `services/work/recommend.py`: `RefreshResult`, `worse`, `held_back`, `refresh`, `refresh_all`, `waiting_message`, `notify_waiting`, then (Task 7) `settle_for_proposal`.
- Create `services/work/rec_access.py`: scopes, `default_scope`, `decided_as`, `decidable`, `openable`, `RELATED`.
- Create `services/work/defaults.py`: `default_due`, `default_priority`, `defaults`, `describe`.
- Create `services/work/recommendations.py`: `build`, `row_payload`, `decided_payload`, `already_decided`.
- Create `services/work/deciding.py`: `AlreadyDecided`, `assign`, `dismiss`.
- Modify `services/work/clock.py` (`add_working_days`), `services/work/views.py`, `services/work/urls.py`.
- Modify `services/notifications/models.py` (`RECOMMENDATIONS_WAITING`) and create `services/notifications/migrations/0008_recommendations_waiting.py` (generated).
- Modify `services/metrics/proposals.py` (`approve` overrides; `approve`/`reject` settle the recommendation).
- Modify `services/customers/management/commands/run_health_maintenance.py` (the recommender step, before the rules).
- Create tests: `services/work/tests/recommend_fixtures.py`, `test_recommend_models.py`, `test_sources_records.py`, `test_sources_work.py`, `test_routing.py`, `test_refresh.py`, `test_recommendations_api.py`, `test_settings_api.py`, `test_deciding.py`, `test_deciding_race.py`, `test_recommend_privacy.py`; modify `test_queries.py`; create `e2e/test_work_recommended_flow.py`.
- Update `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`.

---
### Task 1: The models — `Recommendation`, `WorkSettings`, the notice kind and the test world

**Files:**
- Create: `services/work/models.py`
- Create: `services/work/migrations/__init__.py` (empty) and `services/work/migrations/0001_recommended.py` (generated)
- Create: `services/work/prefs.py`
- Modify: `services/notifications/models.py`
- Create: `services/notifications/migrations/0008_recommendations_waiting.py` (generated)
- Create: `services/work/tests/recommend_fixtures.py`
- Test: `services/work/tests/test_recommend_models.py`

**Interfaces:**
- Produces `services.work.models.DEFAULT_SOURCES` (dict, exactly the spec's §2.1 defaults) and `default_sources()` (a deep copy).
- Produces `Recommendation` with `Kind` (`RENEWAL_DUE="renewal_due"`, `HEALTH_DROP="health_drop"`, `URGENT_TICKETS="urgent_tickets"`, `OVERDUE_TASKS="overdue_tasks"`, `OPEN_QUESTIONS="open_questions"`, `ANOMALY="anomaly"`, `AGENT="agent"`, in that order), `Status` (`OPEN`, `ASSIGNED`, `DISMISSED`, `EXPIRED`), `DismissReason` (`ALREADY_HANDLED`, `NOT_RELEVANT`, `WRONG_PERSON`, `OTHER`); fields `organisation`, `customer`, `account`, `kind`, `title`, `why`, `proposal`, `suggested_assignee`, `recipient`, `status`, `dismiss_reason`, `dismiss_note`, `decided_by`, `decided_at`, `task` (OneToOne, `task.recommendation`), `signal_value`, `created_at`; property `record` (the account when set, else the customer).
- Produces `WorkSettings` with `RecommendTo` (`MANAGER="manager"`, `OWNER="owner"`), fields `organisation` (OneToOne, `organisation.work_settings`), `recommend_to`, `sources`, `dismiss_cooldown_days`, `updated_by`, `updated_at`.
- Produces `services.work.prefs.settings_for(organisation) -> WorkSettings` and `effective_sources(prefs) -> dict` (every kind and field, stored values over defaults).
- Produces `Notification.Kind.RECOMMENDATIONS_WAITING = "recommendations_waiting"`.
- Produces the test world `RecommendFixture` (BrainFixture plus `make_rec`, `only`, `prefer`, `signals`, `refresh_now`, `recs`, `get`, `ok`, `post`, `patch`), `record_link(record)` and `task_proposal(organisation, customer, ...)`; later tasks' tests use them.

- [ ] **Step 1: Write the test world**

Create `services/work/tests/recommend_fixtures.py`:

```python
"""The recommender's tests' world: BrainFixture's people and book. Carl owns
Pizza Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns
Taco Bell and Taco West and has no manager; Alice is an admin with
view_all_accounts (Leadership); Lee is Leadership without it; Soup Co is
Mona's; Loose Ltd has no owner; Gus is Globex's. Dough Co and Taco Bell
renew in 30 days; nothing else renews.

`make_rec` writes a recommendation directly. `only(kind, **params)` turns
every source off but one; `prefer(**fields)` sets other Work settings;
`signals(kind, **params)` reads one source; `refresh_now()` is one refresh."""

from datetime import timedelta

from django.utils import timezone

from services.accounts.models import Organisation, User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.metrics.models import Proposal
from services.work.models import DEFAULT_SOURCES, Recommendation, WorkSettings
from services.work.prefs import settings_for


def record_link(record):
    kind = "organizations" if isinstance(record, Customer) else "accounts"
    return f"/{kind}/{record.pk}"


def task_proposal(
    organisation,
    customer,
    *,
    assignee_name="Carl CSM",
    due_in=10,
    priority="high",
    status=Proposal.Status.PROPOSED,
    title="Call the exec sponsor",
):
    """A task proposal from the AI agent, as `metrics.proposals` stores one."""
    return Proposal.objects.create(
        organisation=organisation,
        batch="b1",
        kind=Proposal.Kind.TASK,
        title=title,
        rationale="Written from the whole workspace's figures.",
        evidence=["Pizza Hut: USD 100,000 ARR, renews in 30 days"],
        status=status,
        action={
            "customer_id": customer.pk,
            "customer_name": customer.name,
            "title": title,
            "assignee_name": assignee_name,
            "due_date": (timezone.localdate() + timedelta(days=due_in)).isoformat(),
            "priority": priority,
        },
    )


class RecommendFixture(BrainFixture):
    @classmethod
    def make_rec(
        cls,
        kind="renewal_due",
        *,
        on,
        recipient,
        suggested=None,
        status="open",
        value=None,
        title=None,
        facts=("Renews in 30 days",),
        proposal=None,
        decided_by=None,
        decided_at=None,
        task=None,
    ):
        if isinstance(on, Customer):
            customer, account = on, None
        else:
            customer, account = on.customers.order_by("id").first(), on
        return Recommendation.objects.create(
            organisation=cls.org,
            customer=customer,
            account=account,
            kind=kind,
            title=title or f"Prepare {on.name}'s renewal",
            why={
                "facts": list(facts),
                "evidence": [{"label": on.name, "link": record_link(on)}],
            },
            suggested_assignee=suggested,
            recipient=recipient,
            status=status,
            signal_value=value,
            proposal=proposal,
            decided_by=decided_by,
            decided_at=decided_at,
            task=task,
        )

    def only(self, kind, **params):
        """Every source off but `kind`, with `params` over its defaults."""
        sources = {
            name: {**values, "enabled": name == kind} for name, values in DEFAULT_SOURCES.items()
        }
        sources[kind].update(params)
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(sources=sources)

    def prefer(self, **fields):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(**fields)

    def signals(self, kind, *, today=None, now=None, **params):
        from services.work.sources import SOURCES, load_book

        book = load_book(
            Organisation.objects.get(pk=self.org.pk),
            today=today or self.today,
            now=now or timezone.now(),
        )
        return SOURCES[kind](book, {**DEFAULT_SOURCES[kind], **params})

    def refresh_now(self, *, today=None, now=None):
        """One refresh. Not `run`: that shadows `unittest.TestCase.run` and
        crashes every test in the class (see services/rules/tests/
        test_reading.py and test_review_kinds.py for the same gotcha)."""
        from services.work.recommend import refresh

        return refresh(Organisation.objects.get(pk=self.org.pk), today=today or self.today, now=now)

    def recs(self, **filters):
        return Recommendation.objects.filter(organisation=self.org, **filters)

    def client_for(self, user):
        """A client for a fresh copy of `user` (no memoised org chart)."""
        return self.as_user(User.objects.get(pk=user.pk))

    def get(self, user, url):
        return self.client_for(user).get(url)

    def ok(self, user, url):
        response = self.get(user, url)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def post(self, user, url, body=None):
        return self.client_for(user).post(url, body if body is not None else {}, format="json")

    def patch(self, user, url, body):
        return self.client_for(user).patch(url, body, format="json")
```

- [ ] **Step 2: Write the failing tests**

Create `services/work/tests/test_recommend_models.py`:

```python
"""One open recommendation per kind and record (the AI agent's: one per
proposal instead), and a workspace's Work settings, made the first time
anyone asks with the spec's defaults (§2.1)."""

from django.db import IntegrityError, transaction

from services.notifications.models import Notification
from services.work.models import DEFAULT_SOURCES, WorkSettings
from services.work.prefs import effective_sources, settings_for
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal


class RecommendationModelTests(RecommendFixture):
    def test_one_open_per_organisation_and_kind(self):
        self.make_rec(on=self.dough, recipient=self.mona)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rec(on=self.dough, recipient=self.mona)
        self.make_rec("health_drop", on=self.dough, recipient=self.mona)
        self.make_rec(on=self.dough, recipient=self.mona, status="dismissed")
        self.make_rec(on=self.dough, recipient=self.mona, status="expired")

    def test_one_open_per_account_beside_its_organisations(self):
        self.make_rec(on=self.taco, recipient=self.other)
        self.make_rec(on=self.west, recipient=self.other)
        self.make_rec(on=self.east, recipient=self.mona)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rec(on=self.west, recipient=self.other)

    def test_the_agents_are_one_per_proposal_not_one_per_record(self):
        first = task_proposal(self.org, self.dough)
        second = task_proposal(self.org, self.dough)
        self.make_rec("agent", on=self.dough, recipient=self.mona, proposal=first)
        self.make_rec("agent", on=self.dough, recipient=self.mona, proposal=second)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rec(
                "agent", on=self.dough, recipient=self.mona, proposal=first, status="dismissed"
            )

    def test_its_record_is_the_account_when_there_is_one(self):
        self.assertEqual(self.make_rec(on=self.west, recipient=self.other).record, self.west)
        self.assertEqual(self.make_rec(on=self.dough, recipient=self.mona).record, self.dough)

    def test_recommendations_waiting_is_a_notification_kind(self):
        self.assertEqual(Notification.Kind.RECOMMENDATIONS_WAITING, "recommendations_waiting")


class WorkSettingsTests(RecommendFixture):
    def test_made_once_with_the_spec_defaults(self):
        WorkSettings.objects.filter(organisation=self.org).delete()
        prefs = settings_for(self.org)
        self.assertEqual(settings_for(self.org).pk, prefs.pk)
        self.assertEqual((prefs.recommend_to, prefs.dismiss_cooldown_days), ("manager", 14))
        self.assertEqual(effective_sources(prefs), DEFAULT_SOURCES)
        self.assertEqual(
            DEFAULT_SOURCES,
            {
                "renewal_due": {"enabled": True, "days": 30},
                "health_drop": {"enabled": True, "drop": 0.5, "window_days": 14},
                "urgent_tickets": {"enabled": True, "min": 1},
                "overdue_tasks": {"enabled": True, "days": 2},
                "open_questions": {"enabled": True, "days": 3},
                "anomaly": {"enabled": True},
                "agent": {"enabled": True},
            },
        )
        self.assertEqual(WorkSettings.objects.filter(organisation=self.org).count(), 1)

    def test_a_missing_source_or_field_reads_as_its_default(self):
        WorkSettings.objects.filter(pk=settings_for(self.org).pk).update(
            sources={"renewal_due": {"days": 45}, "bogus": {}, "anomaly": "on"}
        )
        merged = effective_sources(WorkSettings.objects.get(organisation=self.org))
        self.assertEqual(merged["renewal_due"], {"enabled": True, "days": 45})
        self.assertEqual(merged["health_drop"], DEFAULT_SOURCES["health_drop"])
        self.assertEqual(merged["anomaly"], {"enabled": True})
        self.assertNotIn("bogus", merged)

    def test_a_workspaces_stored_defaults_are_its_own_copy(self):
        prefs = settings_for(self.org)
        prefs.sources["renewal_due"]["days"] = 99
        self.assertEqual(DEFAULT_SOURCES["renewal_due"]["days"], 30)
```

- [ ] **Step 3: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_recommend_models --parallel --noinput`
Expected: an import error (`No module named 'services.work.models'`).

- [ ] **Step 4: Write the models**

Create `services/work/models.py`:

```python
"""The Work round's own rows (spec §2.1): a recommendation in someone's
queue, and a workspace's Work settings. Tasks themselves stay in
`customers` (`Task`, `TaskEvent`)."""

from copy import deepcopy

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation
from services.customers.models import Account, Customer, Task

#: Every source's settings when a workspace has saved none (spec §2.1).
DEFAULT_SOURCES = {
    "renewal_due": {"enabled": True, "days": 30},
    "health_drop": {"enabled": True, "drop": 0.5, "window_days": 14},
    "urgent_tickets": {"enabled": True, "min": 1},
    "overdue_tasks": {"enabled": True, "days": 2},
    "open_questions": {"enabled": True, "days": 3},
    "anomaly": {"enabled": True},
    "agent": {"enabled": True},
}


def default_sources():
    return deepcopy(DEFAULT_SOURCES)


class Recommendation(models.Model):
    """A task Revenact recommends from a signal (services/work/recommend.py),
    waiting in one person's queue (`recipient`) with a suggested assignee.

    One open recommendation per kind and record: two partial unique
    constraints, one for an organisation's own (account null) and one for
    an account's. The AI agent's are kept per proposal instead (two pending
    proposals can name one organisation). `signal_value` is how bad the
    signal was (days to renewal, the size of a drop, a count), so a
    dismissed signal comes back inside the cooldown only when it is worse.

    Read only by someone who may decide it AND open its record
    (`rec_access`); `why` names only the record itself and counts."""

    class Kind(models.TextChoices):
        RENEWAL_DUE = "renewal_due", "Renewal due"
        HEALTH_DROP = "health_drop", "Health drop"
        URGENT_TICKETS = "urgent_tickets", "Urgent tickets"
        OVERDUE_TASKS = "overdue_tasks", "Overdue tasks"
        OPEN_QUESTIONS = "open_questions", "Open questions"
        ANOMALY = "anomaly", "Anomaly"
        AGENT = "agent", "AI agent"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ASSIGNED = "assigned", "Assigned"
        DISMISSED = "dismissed", "Dismissed"
        EXPIRED = "expired", "Expired"

    class DismissReason(models.TextChoices):
        ALREADY_HANDLED = "already_handled", "Already handled"
        NOT_RELEVANT = "not_relevant", "Not relevant"
        WRONG_PERSON = "wrong_person", "Wrong person"
        OTHER = "other", "Other"

    organisation = models.ForeignKey(
        Organisation, related_name="recommendations", on_delete=models.CASCADE
    )
    customer = models.ForeignKey(Customer, related_name="recommendations", on_delete=models.CASCADE)
    account = models.ForeignKey(
        Account,
        related_name="recommendations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Set for an account's own signal; `customer` is then its first organisation.",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=255)
    why = models.JSONField(
        default=dict, blank=True, help_text='{"facts": [str], "evidence": [{label, link}]}'
    )
    proposal = models.ForeignKey(
        "metrics.Proposal",
        related_name="recommendations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="The AI agent's proposal; set only when the kind is agent.",
    )
    suggested_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="recommendations_to_decide",
        on_delete=models.CASCADE,
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    dismiss_reason = models.CharField(max_length=16, choices=DismissReason.choices, blank=True)
    dismiss_note = models.CharField(max_length=255, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    task = models.OneToOneField(
        Task,
        related_name="recommendation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    signal_value = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "status", "recipient"], name="rec_queue"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "kind", "customer"],
                condition=Q(status="open", account__isnull=True) & ~Q(kind="agent"),
                name="rec_one_open_per_organisation",
            ),
            models.UniqueConstraint(
                fields=["organisation", "kind", "customer", "account"],
                condition=Q(status="open", account__isnull=False) & ~Q(kind="agent"),
                name="rec_one_open_per_account",
            ),
            models.UniqueConstraint(
                fields=["proposal"],
                condition=Q(proposal__isnull=False),
                name="rec_one_per_proposal",
            ),
        ]

    def __str__(self):
        # Not the title: an audit row records this, and the title names a record.
        return f"Recommendation {self.pk} ({self.kind})"

    @property
    def record(self):
        return self.account if self.account_id is not None else self.customer


class WorkSettings(models.Model):
    """A workspace's Work settings, made the first time anyone asks
    (`prefs.settings_for`). `sources` may lack a kind or a field (saved
    before it existed); `prefs.effective_sources` fills the defaults in.
    Delivery 3 adds its own columns here (timezone, working days,
    escalation, digest)."""

    class RecommendTo(models.TextChoices):
        MANAGER = "manager", "The suggested person's manager"
        OWNER = "owner", "The suggested person"

    organisation = models.OneToOneField(
        Organisation, related_name="work_settings", on_delete=models.CASCADE
    )
    recommend_to = models.CharField(
        max_length=8, choices=RecommendTo.choices, default=RecommendTo.MANAGER
    )
    sources = models.JSONField(default=default_sources, blank=True)
    dismiss_cooldown_days = models.PositiveSmallIntegerField(default=14)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Work settings ({self.organisation_id})"
```

Create `services/work/migrations/__init__.py` as an empty file.

- [ ] **Step 5: Write `prefs.py`**

Create `services/work/prefs.py`:

```python
"""A workspace's Work settings (spec §2.1): made the first time anyone asks,
with the defaults in `models.DEFAULT_SOURCES`. Every reader goes through
`effective_sources`, so a stored value missing a kind or a field reads as
its default."""

from django.db import IntegrityError, transaction

from .models import DEFAULT_SOURCES, WorkSettings


def settings_for(organisation):
    """The workspace's settings, made with the defaults the first time."""
    found = WorkSettings.objects.filter(organisation=organisation).first()
    if found is not None:
        return found
    try:
        with transaction.atomic():
            return WorkSettings.objects.create(organisation=organisation)
    except IntegrityError:
        # Someone else made them first.
        return WorkSettings.objects.get(organisation=organisation)


def effective_sources(prefs):
    """Every kind and every field: the stored value where there is one,
    else the default. Unknown stored kinds and fields are dropped."""
    stored = prefs.sources if isinstance(prefs.sources, dict) else {}
    merged = {}
    for kind, defaults in DEFAULT_SOURCES.items():
        mine = stored.get(kind)
        mine = mine if isinstance(mine, dict) else {}
        merged[kind] = {name: mine.get(name, value) for name, value in defaults.items()}
    return merged
```

- [ ] **Step 6: Add the notice kind**

In `services/notifications/models.py`, add to `Kind` after `TASK_ASSIGNED`:

```python
        RECOMMENDATIONS_WAITING = "recommendations_waiting", "Recommendations waiting"
```

and in the docstring's first paragraph replace `and tasks
    assigned to someone (`task_assigned`, services/customers/task_changes.py;
    a task's assignee is a real `User` since customers migration 0041).` with:

```text
    and tasks
    assigned to someone (`task_assigned`, services/customers/task_changes.py;
    a task's assignee is a real `User` since customers migration 0041), and
    recommended tasks waiting to be assigned (`recommendations_waiting`,
    services/work/recommend.py).
```

- [ ] **Step 7: Generate the migrations**

Run: `venv/bin/python manage.py makemigrations work --name recommended && venv/bin/python manage.py makemigrations notifications --name recommendations_waiting`
Expected: `services/work/migrations/0001_recommended.py` with `CreateModel` `Recommendation` (with index `rec_queue` and constraints `rec_one_open_per_organisation`, `rec_one_open_per_account`, `rec_one_per_proposal`) and `CreateModel` `WorkSettings`, depending on accounts, customers, metrics and the user model; and `services/notifications/migrations/0008_recommendations_waiting.py` with one `AlterField` on `notification.kind` (fourteen choices, `max_length=32`). If anything else appears, the model edits differ from the plan: fix them, delete the files, regenerate.

- [ ] **Step 8: Run the tests to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_recommend_models --parallel --noinput`
Expected: PASS (8 tests).

- [ ] **Step 9: Lint and the migration check**

Run: `venv/bin/ruff format services/work services/notifications && venv/bin/ruff check services/work services/notifications && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: no errors; `No changes detected`.

- [ ] **Step 10: Commit**

```bash
git add services/work/models.py services/work/prefs.py services/work/migrations/__init__.py services/work/migrations/0001_recommended.py services/notifications/models.py services/notifications/migrations/0008_recommendations_waiting.py services/work/tests/recommend_fixtures.py services/work/tests/test_recommend_models.py
git commit -m "feat(work): Recommendation and WorkSettings, and the recommendations_waiting kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sources over the book — renewals, health drops and urgent tickets

**Files:**
- Create: `services/work/sources.py`
- Test: `services/work/tests/test_sources_records.py`

**Interfaces:**
- Consumes `Recommendation.Kind` (Task 1), `states.overdue_q` (delivery 1, used in Task 3), `scoping.SystemActor`, `scoping.live_customers`, `attention.rules.SUPPORT_PRIORITIES`.
- Produces `Signal(kind, customer, account, title, facts, evidence, value, proposal=None)` (frozen dataclass) with properties `record` (account when set, else customer) and `key` (`(customer_id, account_id_or_None)`, or `("proposal", proposal_id)`).
- Produces `Book(organisation, today, now, customers, accounts, parent_of)` and `load_book(organisation, *, today, now) -> Book`: `customers` = id → live, unchurned Customer (owner loaded); `accounts` = id → unchurned Account under one of them (owner loaded); `parent_of` = account id → its lowest-id live Customer.
- Produces `record_link(record) -> str`, `plural(count, word, words=None) -> str`, `day(date) -> "6 Nov"`, `ago(days) -> "today" | "1 day ago" | "N days ago"`.
- Produces the sources, each `fn(book, params) -> list[Signal]`: `renewal_due`, `health_drop`, `urgent_tickets`, and `SOURCES` (kind → function; Task 3 completes it).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_sources_records.py`:

```python
"""Three of the recommender's sources, each at its threshold, one below and
one above (spec §6): renewals, health drops and urgent tickets, on
organisations and on accounts. Facts name only the record and counts."""

from datetime import timedelta
from decimal import Decimal

from services.customers.models import Account, Customer, HealthSnapshot, Ticket
from services.work.tests.recommend_fixtures import RecommendFixture


def named(signals):
    return {(s.record.name, s.value) for s in signals}


def short(value):
    return f"{value.day} {value:%b}"


class RenewalDueTests(RecommendFixture):
    def test_within_the_window_is_due_and_beyond_it_is_not(self):
        # Dough Co and Taco Bell renew in 30 days.
        self.assertEqual(
            named(self.signals("renewal_due", days=30)), {("Dough Co", 30.0), ("Taco Bell", 30.0)}
        )
        self.assertEqual(self.signals("renewal_due", days=29), [])
        self.assertEqual(len(self.signals("renewal_due", days=31)), 2)

    def test_its_title_facts_and_evidence(self):
        [dough] = [s for s in self.signals("renewal_due") if s.customer == self.dough]
        renews = self.today + timedelta(days=30)
        self.assertEqual(dough.title, "Prepare Dough Co's renewal")
        self.assertEqual(dough.facts, ("Renews in 30 days", f"Renewal date {short(renews)}"))
        self.assertEqual(
            dough.evidence, ({"label": "Dough Co", "link": f"/organizations/{self.dough.pk}"},)
        )
        self.assertEqual((dough.account, dough.key), (None, (self.dough.pk, None)))

    def test_an_overdue_renewal_is_due_and_says_so(self):
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today - timedelta(days=3)
        )
        [dough] = [s for s in self.signals("renewal_due", days=30) if s.customer == self.dough]
        self.assertEqual((dough.value, dough.facts[0]), (-3.0, "Renewal is 3 days overdue"))

    def test_one_day_and_today_read_as_sentences(self):
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=1)
        )
        Customer.objects.filter(pk=self.taco.pk).update(renewal_date=self.today)
        facts = {s.customer.name: s.facts[0] for s in self.signals("renewal_due")}
        self.assertEqual(facts, {"Dough Co": "Renews in 1 day", "Taco Bell": "Renews today"})

    def test_an_account_renews_on_its_own_under_its_first_organisation(self):
        Account.objects.filter(pk=self.west.pk).update(renewal_date=self.today + timedelta(days=9))
        [west] = [s for s in self.signals("renewal_due") if s.account is not None]
        self.assertEqual((west.account, west.customer, west.value), (self.west, self.taco, 9.0))
        self.assertEqual(west.key, (self.taco.pk, self.west.pk))
        self.assertEqual(
            west.evidence[0], {"label": "Taco West", "link": f"/accounts/{self.west.pk}"}
        )

    def test_churned_archived_and_other_workspaces_are_left_out(self):
        Customer.objects.filter(pk=self.dough.pk).update(
            lifecycle_stage=Customer.LifecycleStage.CHURN
        )
        Customer.objects.filter(pk=self.taco.pk).update(is_archived=True)
        Account.objects.filter(pk=self.west.pk).update(renewal_date=self.today)
        Customer.objects.filter(pk=self.globex.pk).update(renewal_date=self.today)
        # Taco West's only organisation is archived, so it goes too.
        self.assertEqual(self.signals("renewal_due"), [])


class HealthDropTests(RecommendFixture):
    def snapshot(self, on, score, days_ago):
        key = "customer" if isinstance(on, Customer) else "account"
        return HealthSnapshot.objects.create(
            **{key: on},
            captured_on=self.today - timedelta(days=days_ago),
            health_score=Decimal(score),
        )

    def test_a_fall_of_exactly_the_drop_is_a_signal(self):
        self.snapshot(self.pizza, "8.5", 14)  # Pizza Hut is 8.0 now
        [pizza] = self.signals("health_drop", drop=0.5, window_days=14)
        self.assertEqual((pizza.customer, pizza.value), (self.pizza, 0.5))
        self.assertEqual(pizza.title, "Find out why Pizza Hut's health fell")
        then = self.today - timedelta(days=14)
        self.assertEqual(pizza.facts, (f"Health fell 8.5 → 8.0 since {short(then)}",))
        self.assertEqual(self.signals("health_drop", drop=0.6, window_days=14), [])
        self.assertEqual(len(self.signals("health_drop", drop=0.4, window_days=14)), 1)

    def test_the_reading_compared_is_the_latest_on_or_before_the_window(self):
        self.snapshot(self.pizza, "9.5", 40)
        self.snapshot(self.pizza, "8.2", 20)
        self.snapshot(self.pizza, "9.9", 5)  # inside the window: not compared
        [pizza] = self.signals("health_drop", drop=0.1, window_days=14)
        self.assertAlmostEqual(pizza.value, 0.2)
        # A longer window reaches back past the 20-day reading to the 40-day one.
        [older] = self.signals("health_drop", drop=0.1, window_days=21)
        self.assertAlmostEqual(older.value, 1.5)

    def test_no_earlier_reading_or_a_rise_is_no_signal(self):
        self.snapshot(self.dough, "1.0", 30)  # Dough Co is 2.0 now: it rose
        self.assertEqual(self.signals("health_drop"), [])

    def test_an_account_falls_on_its_own(self):
        Account.objects.filter(pk=self.emea.pk).update(health_score=Decimal("4.0"))
        self.snapshot(self.emea, "6.0", 15)
        [emea] = self.signals("health_drop")
        self.assertEqual((emea.account, emea.customer, emea.value), (self.emea, self.pizza, 2.0))


class UrgentTicketsTests(RecommendFixture):
    def ticket(self, on, priority="high", status="open", days_ago=0):
        key = "customer" if isinstance(on, Customer) else "account"
        number = Ticket.objects.count() + 1
        return Ticket.objects.create(
            **{key: on},
            ticket_number=f"TKT-{number}",
            title="Login fails for every admin",
            assignee_name="Support",
            priority=priority,
            status=status,
            opened_at=self.today - timedelta(days=days_ago),
        )

    def test_open_urgent_tickets_at_the_minimum_are_a_signal(self):
        self.ticket(self.taco, "critical", days_ago=6)
        self.ticket(self.taco, "high")
        self.ticket(self.taco, "medium")
        self.ticket(self.taco, "high", status="resolved")
        self.ticket(self.taco, "critical", status="closed")
        [taco] = self.signals("urgent_tickets", min=2)
        self.assertEqual((taco.customer, taco.value), (self.taco, 2.0))
        self.assertEqual(taco.facts, ("2 urgent tickets open", "Oldest opened 6 days ago"))
        self.assertEqual(taco.title, "Get Taco Bell's urgent tickets moving")
        self.assertEqual(self.signals("urgent_tickets", min=3), [])
        self.assertEqual(len(self.signals("urgent_tickets", min=1)), 1)

    def test_an_accounts_tickets_are_its_own_and_never_quoted(self):
        self.ticket(self.west)
        [west] = self.signals("urgent_tickets")
        self.assertEqual((west.account, west.value), (self.west, 1.0))
        self.assertEqual(west.facts, ("1 urgent ticket open", "Oldest opened today"))
        self.assertNotIn("Login fails", repr(west))
```

- [ ] **Step 2: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_sources_records --parallel --noinput`
Expected: an import error (`No module named 'services.work.sources'`).

- [ ] **Step 3: Write `sources.py` with its first three sources**

Create `services/work/sources.py`:

```python
"""What Revenact recommends from (Work round §2.2): one function per kind,
each reading the workspace as the workspace itself (`SystemActor`) and
returning a `Signal` for every record whose signal triggers. Rules over
data, no AI.

The facts are sentences about the record itself and counts: never another
record's name, a ticket's, task's or question's text, or an anomaly's
model-written title. A recommendation is shown only to people who may open
its record (spec §4).

Every query is a plain filter or an `id IN` list, never a join made unique
with DISTINCT (Postgres 16; tests/test_queries.py)."""

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Min, OuterRef, Subquery

from services.attention.rules import SUPPORT_PRIORITIES
from services.customers.models import Account, Customer, HealthSnapshot, Ticket
from services.customers.scoping import SystemActor, live_customers

from .models import Recommendation

K = Recommendation.Kind


@dataclass(frozen=True)
class Signal:
    """One record whose signal triggers: what a recommendation is made from.
    `account` is set for an account's own signal, with `customer` its first
    organisation; `proposal` only for the AI agent's."""

    kind: str
    customer: object
    account: object
    title: str
    facts: tuple
    evidence: tuple
    value: float | None
    proposal: object = None

    @property
    def record(self):
        return self.customer if self.account is None else self.account

    @property
    def key(self):
        """What one open recommendation is kept per: the record, or the proposal."""
        if self.proposal is not None:
            return ("proposal", self.proposal.pk)
        return (self.customer.pk, None if self.account is None else self.account.pk)


@dataclass(frozen=True)
class Book:
    """The workspace as one refresh reads it, loaded once for every source."""

    organisation: object
    today: object
    now: object
    customers: dict
    accounts: dict
    parent_of: dict


def load_book(organisation, *, today, now):
    """Live, unchurned organisations, their unchurned accounts, and each
    account's first (lowest-id) live organisation."""
    # SOC2:AUTH-02 a scheduled job reads as the workspace itself, never as a person
    live = live_customers(SystemActor(organisation)).exclude(
        lifecycle_stage=Customer.LifecycleStage.CHURN
    )
    customers = {customer.pk: customer for customer in live.select_related("owner")}
    links = (
        Account.customers.through.objects.filter(customer_id__in=live.values("id"))
        .order_by("account_id", "customer_id")
        .values_list("account_id", "customer_id")
    )
    parent_of = {}
    for account_id, customer_id in links:
        if customer_id in customers:
            parent_of.setdefault(account_id, customers[customer_id])
    accounts = {
        account.pk: account
        for account in Account.objects.filter(id__in=sorted(parent_of))
        .exclude(lifecycle_stage=Customer.LifecycleStage.CHURN)
        .select_related("owner")
    }
    parent_of = {pk: parent for pk, parent in parent_of.items() if pk in accounts}
    return Book(organisation, today, now, customers, accounts, parent_of)


def record_link(record):
    if isinstance(record, Customer):
        return f"/organizations/{record.pk}"
    return f"/accounts/{record.pk}"


def plural(count, word, words=None):
    return f"{count} {word if count == 1 else (words or word + 's')}"


def day(value):
    return f"{value.day} {value:%b}"


def ago(days):
    return "today" if days <= 0 else f"{plural(days, 'day')} ago"


def _signal(book, record, *, kind, title, facts, value, evidence=()):
    if isinstance(record, Account):
        customer, account = book.parent_of[record.pk], record
    else:
        customer, account = record, None
    return Signal(
        kind=kind,
        customer=customer,
        account=account,
        title=title[:255],
        facts=tuple(facts),
        evidence=({"label": record.name, "link": record_link(record)}, *evidence),
        value=None if value is None else float(value),
    )


def _counted(book, queryset, oldest):
    """(record, count, oldest value) for every organisation and account
    `queryset` has rows on: one GROUP BY each, no DISTINCT."""
    for field, rows in (("customer_id", book.customers), ("account_id", book.accounts)):
        counted = (
            queryset.filter(**{f"{field}__in": sorted(rows)})
            .order_by()
            .values(field)
            .annotate(count=Count("id"), oldest=Min(oldest))
        )
        for row in counted:
            yield rows[row[field]], row["count"], row["oldest"]


def _renews(days):
    if days > 0:
        return f"Renews in {plural(days, 'day')}"
    if days == 0:
        return "Renews today"
    return f"Renewal is {plural(-days, 'day')} overdue"


def renewal_due(book, params):
    """A renewal within `days`, or already overdue."""
    horizon = book.today + timedelta(days=params["days"])
    found = []
    for record in [*book.customers.values(), *book.accounts.values()]:
        renews = record.renewal_date
        if renews is None or renews > horizon:
            continue
        days = (renews - book.today).days
        found.append(
            _signal(
                book,
                record,
                kind=K.RENEWAL_DUE,
                title=f"Prepare {record.name}'s renewal",
                facts=(_renews(days), f"Renewal date {day(renews)}"),
                value=days,
            )
        )
    return found


def health_drop(book, params):
    """Health now at least `drop` below the latest reading captured on or
    before `window_days` ago (the job writes month-ends, so it may be
    older). No earlier reading, no signal."""
    cutoff = book.today - timedelta(days=params["window_days"])
    drop = Decimal(str(params["drop"]))
    found = []
    for model, field, rows in (
        (Customer, "customer", book.customers),
        (Account, "account", book.accounts),
    ):
        earlier = HealthSnapshot.objects.filter(
            **{field: OuterRef("pk")}, captured_on__lte=cutoff
        ).order_by("-captured_on", "-id")
        readings = (
            model.objects.filter(id__in=sorted(rows))
            .annotate(
                then=Subquery(earlier.values("health_score")[:1]),
                then_on=Subquery(earlier.values("captured_on")[:1]),
            )
            .values_list("id", "then", "then_on")
        )
        for pk, then, then_on in readings:
            record = rows[pk]
            if then is None or then - record.health_score < drop:
                continue
            found.append(
                _signal(
                    book,
                    record,
                    kind=K.HEALTH_DROP,
                    title=f"Find out why {record.name}'s health fell",
                    facts=(f"Health fell {then} → {record.health_score} since {day(then_on)}",),
                    value=then - record.health_score,
                )
            )
    return found


def urgent_tickets(book, params):
    """At least `min` open tickets at the support priorities (critical and
    high: attention.rules). Counted; a ticket's own words are never copied."""
    urgent = Ticket.objects.filter(priority__in=SUPPORT_PRIORITIES).exclude(
        status__in=Ticket.RESOLVED_STATUSES
    )
    found = []
    for record, count, oldest in _counted(book, urgent, "opened_at"):
        if count < params["min"]:
            continue
        found.append(
            _signal(
                book,
                record,
                kind=K.URGENT_TICKETS,
                title=f"Get {record.name}'s urgent tickets moving",
                facts=(
                    f"{plural(count, 'urgent ticket')} open",
                    f"Oldest opened {ago((book.today - oldest).days)}",
                ),
                value=count,
            )
        )
    return found


#: kind -> source. Task 3 adds the rest.
SOURCES = {
    K.RENEWAL_DUE: renewal_due,
    K.HEALTH_DROP: health_drop,
    K.URGENT_TICKETS: urgent_tickets,
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_sources_records --parallel --noinput`
Expected: PASS (12 tests).

- [ ] **Step 5: Lint**

Run: `venv/bin/ruff format services/work && venv/bin/ruff check services/work`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add services/work/sources.py services/work/tests/test_sources_records.py
git commit -m "feat(work): renewal, health-drop and urgent-ticket signals over the workspace

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sources over the work — overdue tasks, open questions, anomalies and the AI agent

**Files:**
- Modify: `services/work/sources.py`
- Test: `services/work/tests/test_sources_work.py`

**Interfaces:**
- Consumes `Book`, `Signal`, `_signal`, `_counted`, `plural`, `day`, `ago`, `record_link` (Task 2); `states.overdue_q(today)` (delivery 1); `knowledge.models.Question`; `anomalies.models.Anomaly`, `AnomalyEvidence`; `metrics.models.Proposal`.
- Produces `overdue_tasks`, `open_questions`, `anomaly`, `agent` (each `fn(book, params) -> list[Signal]`) and the complete `SOURCES` (all seven kinds, in `Recommendation.Kind` order). An agent signal has `account=None`, `value=None` and `proposal` set.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_sources_work.py`:

```python
"""The rest of the recommender's sources (spec §2.2, §6): overdue tasks and
questions at their thresholds, one below and one above; anomalies naming a
record; the AI agent's pending task proposals. No fact quotes a task's,
question's or anomaly's own words."""

from datetime import timedelta

from django.utils import timezone

from services.anomalies.models import Anomaly, AnomalyEvidence
from services.customers.models import Customer, Task
from services.knowledge.models import Question
from services.metrics.models import Proposal
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal


def short(value):
    return f"{value.day} {value:%b}"


class OverdueTasksTests(RecommendFixture):
    def task(self, on, due_in, status="pending", reason=""):
        parent = {"customer": on} if isinstance(on, Customer) else {"account": on}
        return Task.objects.create(
            **parent,
            title="Chase the signed order form",
            assignee=self.mona,
            created_by=self.mona,
            due_date=self.today + timedelta(days=due_in),
            status=status,
            blocked_reason=reason,
            priority="medium",
        )

    def test_overdue_by_at_least_the_days_is_a_signal(self):
        self.task(self.soup, -3)
        self.task(self.soup, -1)
        self.task(self.soup, -9, status="completed")
        self.task(self.soup, -9, status="blocked", reason="Waiting on legal")
        [soup] = self.signals("overdue_tasks", days=3)
        self.assertEqual((soup.customer, soup.value), (self.soup, 1.0))
        due = self.today - timedelta(days=3)
        self.assertEqual(
            soup.facts, ("1 task overdue by 3 days or more", f"Oldest was due {short(due)}")
        )
        self.assertEqual(soup.title, "Catch up on Soup Co's overdue tasks")
        self.assertEqual(self.signals("overdue_tasks", days=4), [])
        self.assertEqual(self.signals("overdue_tasks", days=2)[0].value, 1.0)
        self.assertEqual(self.signals("overdue_tasks", days=1)[0].value, 2.0)
        self.assertNotIn("signed order form", repr(self.signals("overdue_tasks", days=1)))

    def test_an_accounts_tasks_are_its_own(self):
        self.task(self.east, -2)
        [east] = self.signals("overdue_tasks", days=2)
        self.assertEqual((east.account, east.customer), (self.east, self.taco))


class OpenQuestionsTests(RecommendFixture):
    def setUp(self):
        self.now = timezone.now()

    def question(self, on, *, days_old, status="open"):
        question = Question.objects.create(
            organisation=self.org,
            customer=on,
            asked_by=self.admin,
            assignee=self.csm,
            text="Why did their usage halve in September?",
            status=status,
        )
        Question.objects.filter(pk=question.pk).update(
            created_at=self.now - timedelta(days=days_old, minutes=1)
        )
        return question

    def test_open_for_at_least_the_days_is_a_signal(self):
        self.question(self.pizza, days_old=3)
        self.question(self.pizza, days_old=1)
        self.question(None, days_old=9)
        self.question(self.pizza, days_old=9, status="answered")
        [pizza] = self.signals("open_questions", days=3, now=self.now)
        self.assertEqual((pizza.customer, pizza.account, pizza.value), (self.pizza, None, 1.0))
        self.assertEqual(
            pizza.facts, ("1 question open for 3 days or more", "Oldest asked 3 days ago")
        )
        self.assertEqual(pizza.title, "Get Pizza Hut's open questions answered")
        self.assertEqual(self.signals("open_questions", days=4, now=self.now), [])
        self.assertEqual(self.signals("open_questions", days=1, now=self.now)[0].value, 2.0)
        self.assertNotIn("usage halve", repr(self.signals("open_questions", days=1, now=self.now)))


class AnomalyTests(RecommendFixture):
    def anomaly(self, *, on, status="live", seen_days_ago=2):
        now = timezone.now()
        found = Anomaly.objects.create(
            organisation=self.org,
            title="Pizza Hut and 7 others report login failures",
            status=status,
            first_seen_at=now - timedelta(days=9),
            last_seen_at=now - timedelta(days=seen_days_ago),
        )
        key = "customer" if isinstance(on, Customer) else "account"
        AnomalyEvidence.objects.create(
            anomaly=found,
            organisation=self.org,
            kind=AnomalyEvidence.Kind.TICKET,
            record_id=AnomalyEvidence.objects.count() + 1,
            **{key: on},
            snippet="Can't log in since the update",
            occurred_at=now,
        )
        return found

    def test_a_live_anomaly_naming_the_record_is_a_signal(self):
        self.anomaly(on=self.pizza)
        self.anomaly(on=self.dough, status="acknowledged")
        self.anomaly(on=self.west)
        found = {(s.record.name, s.value) for s in self.signals("anomaly")}
        self.assertEqual(found, {("Pizza Hut", 1.0), ("Taco West", 1.0)})
        [pizza] = [s for s in self.signals("anomaly") if s.account is None]
        self.assertEqual(pizza.facts, ("Named in 1 live anomaly", "Last seen 2 days ago"))
        self.assertEqual(pizza.title, "Check Pizza Hut against a live anomaly")
        self.assertEqual(pizza.evidence[1], {"label": "Anomalies", "link": "/brain/anomalies"})

    def test_two_anomalies_count_two(self):
        self.anomaly(on=self.pizza)
        self.anomaly(on=self.pizza, seen_days_ago=0)
        [pizza] = self.signals("anomaly")
        self.assertEqual(pizza.value, 2.0)
        self.assertEqual(pizza.facts, ("Named in 2 live anomalies", "Last seen today"))

    def test_the_anomalys_own_words_are_never_copied(self):
        self.anomaly(on=self.pizza)
        text = repr(self.signals("anomaly"))
        self.assertNotIn("login failures", text)
        self.assertNotIn("since the update", text)


class AgentTests(RecommendFixture):
    def test_every_pending_task_proposal_not_already_decided_here(self):
        pending = task_proposal(self.org, self.dough)
        task_proposal(self.org, self.dough, status=Proposal.Status.APPROVED)
        decided = task_proposal(self.org, self.pizza)
        self.make_rec(
            "agent", on=self.pizza, recipient=self.mona, proposal=decided, status="dismissed"
        )
        still_open = task_proposal(self.org, self.soup)
        self.make_rec("agent", on=self.soup, recipient=self.mona, proposal=still_open)
        Proposal.objects.create(
            organisation=self.org,
            batch="b1",
            kind=Proposal.Kind.INITIATIVE,
            title="Halve ARR at risk",
            rationale="Org-wide.",
            evidence=[],
            action={},
        )
        task_proposal(self.other_org, self.globex)
        self.assertEqual({s.proposal for s in self.signals("agent")}, {pending, still_open})

    def test_its_title_is_the_tasks_and_its_facts_quote_no_figures(self):
        proposal = task_proposal(self.org, self.dough, assignee_name="Dana CSM")
        [dough] = self.signals("agent")
        self.assertEqual((dough.customer, dough.account, dough.value), (self.dough, None, None))
        self.assertEqual(dough.key, ("proposal", proposal.pk))
        self.assertEqual(dough.title, "Call the exec sponsor")
        self.assertEqual(dough.facts, ("Proposed by the AI agent", "The agent suggested Dana CSM"))
        self.assertNotIn("USD", repr((dough.title, dough.facts, dough.evidence)))
        self.assertNotIn("whole workspace", repr((dough.title, dough.facts, dough.evidence)))

    def test_a_proposal_on_a_gone_or_churned_customer_is_skipped(self):
        gone = task_proposal(self.org, self.dough)
        Proposal.objects.filter(pk=gone.pk).update(action={**gone.action, "customer_id": 999_999})
        task_proposal(self.org, self.taco)
        Customer.objects.filter(pk=self.taco.pk).update(churn_date=self.today)
        self.assertEqual(self.signals("agent"), [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_sources_work --parallel --noinput`
Expected: FAIL with `KeyError: 'overdue_tasks'` (and the other three kinds) from `SOURCES[kind]`.

- [ ] **Step 3: Add the four sources**

In `services/work/sources.py`, change the customers import to:

```python
from services.customers.models import Account, Customer, HealthSnapshot, Task, Ticket
```

add below `from .models import Recommendation`:

```python
from .states import overdue_q
```

and replace the `SOURCES` block at the end of the file with:

```python
def overdue_tasks(book, params):
    """Tasks overdue by at least `days`, as Work counts overdue (past due
    and not Blocked: states.overdue_q). Counted; titles are never copied."""
    days = params["days"]
    late = (
        Task.objects.exclude(status=Task.Status.COMPLETED)
        .filter(overdue_q(book.today))
        .filter(due_date__lte=book.today - timedelta(days=days))
    )
    return [
        _signal(
            book,
            record,
            kind=K.OVERDUE_TASKS,
            title=f"Catch up on {record.name}'s overdue tasks",
            facts=(
                f"{plural(count, 'task')} overdue by {plural(days, 'day')} or more",
                f"Oldest was due {day(oldest)}",
            ),
            value=count,
        )
        for record, count, oldest in _counted(book, late, "due_date")
    ]


def open_questions(book, params):
    """Knowledge questions about the organisation open at least `days`
    (knowledge.aging's idea of stale). A question names no account."""
    from services.knowledge.models import Question

    days = params["days"]
    counted = (
        Question.objects.filter(
            organisation=book.organisation,
            status=Question.Status.OPEN,
            customer_id__in=sorted(book.customers),
            created_at__lte=book.now - timedelta(days=days),
        )
        .order_by()
        .values("customer_id")
        .annotate(count=Count("id"), oldest=Min("created_at"))
    )
    found = []
    for row in counted:
        record = book.customers[row["customer_id"]]
        found.append(
            _signal(
                book,
                record,
                kind=K.OPEN_QUESTIONS,
                title=f"Get {record.name}'s open questions answered",
                facts=(
                    f"{plural(row['count'], 'question')} open for {plural(days, 'day')} or more",
                    f"Oldest asked {ago((book.now - row['oldest']).days)}",
                ),
                value=row["count"],
            )
        )
    return found


def anomaly(book, params):
    """A live anomaly whose evidence names the record. The anomaly's title
    is model-written from the whole workspace's reports
    (anomalies.views.title_for), so it is never copied; distinct anomalies
    are counted here, not with COUNT(DISTINCT)."""
    from services.anomalies.models import Anomaly, AnomalyEvidence

    rows = AnomalyEvidence.objects.filter(
        organisation=book.organisation, anomaly__status=Anomaly.Status.LIVE
    ).values_list("customer_id", "account_id", "anomaly_id", "anomaly__last_seen_at")
    named = {}
    for customer_id, account_id, anomaly_id, last_seen in rows:
        if account_id is None:
            record = book.customers.get(customer_id)
        else:
            record = book.accounts.get(account_id)
        if record is None:
            continue
        entry = named.setdefault(
            (type(record).__name__, record.pk), {"record": record, "ids": set(), "last": last_seen}
        )
        entry["ids"].add(anomaly_id)
        entry["last"] = max(entry["last"], last_seen)
    return [
        _signal(
            book,
            entry["record"],
            kind=K.ANOMALY,
            title=f"Check {entry['record'].name} against a live anomaly",
            facts=(
                f"Named in {plural(len(entry['ids']), 'live anomaly', 'live anomalies')}",
                f"Last seen {ago((book.now - entry['last']).days)}",
            ),
            value=len(entry["ids"]),
            evidence=({"label": "Anomalies", "link": "/brain/anomalies"},),
        )
        for entry in named.values()
    ]


def agent(book, params):
    """Every pending task proposal of the AI agent on a live organisation,
    unless a recommendation for it was already decided. Its rationale and
    evidence are written from the whole workspace's figures, so only the
    task's title and the person it names are used."""
    from services.metrics.models import Proposal

    decided = (
        Recommendation.objects.filter(proposal__isnull=False)
        .exclude(status=Recommendation.Status.OPEN)
        .values("proposal_id")
    )
    pending = (
        Proposal.objects.filter(
            organisation=book.organisation,
            kind=Proposal.Kind.TASK,
            status=Proposal.Status.PROPOSED,
        )
        .exclude(id__in=decided)
        .order_by("created_at", "id")
    )
    found = []
    for proposal in pending:
        customer_id = proposal.action.get("customer_id")
        customer = book.customers.get(customer_id) if isinstance(customer_id, int) else None
        if customer is None:
            continue
        name = str(proposal.action.get("assignee_name") or "").strip()
        facts = ("Proposed by the AI agent", *((f"The agent suggested {name}",) if name else ()))
        found.append(
            Signal(
                kind=K.AGENT,
                customer=customer,
                account=None,
                title=str(proposal.action.get("title") or proposal.title)[:255],
                facts=facts,
                evidence=({"label": customer.name, "link": record_link(customer)},),
                value=None,
                proposal=proposal,
            )
        )
    return found


#: kind -> source, in `Recommendation.Kind` order.
SOURCES = {
    K.RENEWAL_DUE: renewal_due,
    K.HEALTH_DROP: health_drop,
    K.URGENT_TICKETS: urgent_tickets,
    K.OVERDUE_TASKS: overdue_tasks,
    K.OPEN_QUESTIONS: open_questions,
    K.ANOMALY: anomaly,
    K.AGENT: agent,
}
```

- [ ] **Step 4: Run both source suites to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_sources_work services.work.tests.test_sources_records --parallel --noinput`
Expected: PASS (21 tests).

- [ ] **Step 5: Lint**

Run: `venv/bin/ruff format services/work && venv/bin/ruff check services/work`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add services/work/sources.py services/work/tests/test_sources_work.py
git commit -m "feat(work): overdue-task, question, anomaly and AI-agent signals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Routing — who it is suggested for and whose queue it lands in

**Files:**
- Create: `services/work/routing.py`
- Test: `services/work/tests/test_routing.py`

**Interfaces:**
- Consumes `Signal` (Task 2/3), `WorkSettings.RecommendTo` (Task 1), `scoping.can_open(user, record)`, `knowledge.models.FunctionOwner`, `metrics.proposals.match_member(organisation, name)`, `identity.ownership.owner_membership(organisation)`, `Capability.VIEW_ALL_ACCOUNTS`.
- Produces `FUNCTION_FOR` (kind → `User.Function`: CS for renewal_due, health_drop, urgent_tickets, open_questions, anomaly; none for overdue_tasks and agent).
- Produces `Route(suggested, recipient)` (frozen dataclass; `suggested` may be None) and `Router(organisation, recommend_to)` with `route(signal) -> Route | None` and `opens(user, record) -> bool` (cached `can_open`). One `Router` serves one refresh: it caches function owners, fallbacks and every `can_open` answer.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_routing.py`:

```python
"""Who a recommendation is for (spec §2.2 Routing, §6 "the routing
ladder"): the function owner, else the record owner (each only if active and
able to open the record); their manager in manager mode when that manager
is active and can open it too; with nobody suggested, the first active
view-all member, else the workspace's owner."""

from services.accounts.models import User
from services.customers.models import Account, Customer
from services.identity import ownership
from services.knowledge.models import FunctionOwner
from services.work.routing import Route, Router
from services.work.sources import Signal
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal


class RoutingTests(RecommendFixture):
    def route(self, kind, record, *, to="manager", proposal=None):
        """Route a signal on a fresh copy of `record` (fresh owners, so a
        deactivation in the test is seen)."""
        fresh = type(record).objects.select_related("owner").get(pk=record.pk)
        if isinstance(fresh, Account):
            customer, account = fresh.customers.order_by("id").first(), fresh
        else:
            customer, account = fresh, None
        signal = Signal(
            kind=kind,
            customer=customer,
            account=account,
            title="t",
            facts=(),
            evidence=(),
            value=1.0,
            proposal=proposal,
        )
        return Router(self.org, to).route(signal)

    def deactivate(self, *people):
        User.objects.filter(pk__in=[p.pk for p in people]).update(is_active=False)

    def answers_for(self, customer, user):
        FunctionOwner.objects.create(customer=customer, function=User.Function.CS, user=user)

    def test_the_record_owner_suggested_to_their_manager(self):
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.csm, self.mona))

    def test_someone_with_no_manager_receives_their_own(self):
        self.assertEqual(self.route("renewal_due", self.taco), Route(self.other, self.other))

    def test_owner_mode_sends_it_straight_to_the_suggested_person(self):
        self.assertEqual(
            self.route("renewal_due", self.dough, to="owner"), Route(self.csm, self.csm)
        )

    def test_the_cs_function_owner_comes_before_the_record_owner(self):
        self.answers_for(self.dough, self.other)
        for kind in ("renewal_due", "health_drop", "urgent_tickets", "open_questions", "anomaly"):
            with self.subTest(kind=kind):
                self.assertEqual(self.route(kind, self.dough), Route(self.other, self.other))

    def test_overdue_tasks_go_straight_to_the_record_owner(self):
        self.answers_for(self.dough, self.other)
        self.assertEqual(self.route("overdue_tasks", self.dough), Route(self.csm, self.mona))

    def test_an_account_signal_goes_to_the_account_owner(self):
        # Carl owns Taco East under Dana's Taco Bell; Mona can open it through him.
        self.assertEqual(self.route("renewal_due", self.east), Route(self.csm, self.mona))

    def test_a_candidate_who_cannot_open_the_record_is_passed_over(self):
        # Carl answers for Taco Bell, which lets him open it, but not Dana's Taco West.
        self.answers_for(self.taco, self.csm)
        self.assertEqual(self.route("renewal_due", self.west), Route(self.other, self.other))

    def test_an_inactive_candidate_is_passed_over(self):
        self.answers_for(self.dough, self.other)
        self.deactivate(self.other)
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.csm, self.mona))

    def test_an_inactive_manager_is_skipped(self):
        self.deactivate(self.mona)
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.csm, self.csm))

    def test_a_manager_who_cannot_open_the_record_is_skipped(self):
        # Dana answers for Dough Co; her manager Lee cannot open it.
        self.answers_for(self.dough, self.other)
        User.objects.filter(pk=self.other.pk).update(reports_to=self.lee)
        self.assertEqual(self.route("renewal_due", self.dough), Route(self.other, self.other))

    def test_nobody_suggested_goes_to_the_first_active_view_all_member(self):
        self.assertEqual(self.route("renewal_due", self.loose), Route(None, self.admin))

    def test_an_inactive_owner_falls_through_to_the_fallbacks(self):
        self.deactivate(self.csm)
        self.assertEqual(self.route("renewal_due", self.dough), Route(None, self.admin))

    def test_then_to_the_workspaces_owner(self):
        self.deactivate(self.admin)
        ownership.claim(self.mona, self.org)
        self.assertEqual(self.route("renewal_due", self.loose), Route(None, self.mona))

    def test_with_nobody_able_to_receive_it_it_is_not_routed(self):
        self.deactivate(self.admin)
        self.assertIsNone(self.route("renewal_due", self.loose))

    def test_the_agent_suggests_the_member_its_proposal_names(self):
        proposal = task_proposal(self.org, self.taco, assignee_name="carl csm")
        self.assertEqual(
            self.route("agent", self.taco, proposal=proposal), Route(self.csm, self.mona)
        )

    def test_an_agent_name_that_is_no_member_falls_to_the_owner(self):
        proposal = task_proposal(self.org, self.taco, assignee_name="Nobody Here")
        self.assertEqual(
            self.route("agent", self.taco, proposal=proposal), Route(self.other, self.other)
        )

    def test_can_open_is_asked_once_per_person_and_record(self):
        router = Router(self.org, "manager")
        dough = Customer.objects.select_related("owner").get(pk=self.dough.pk)
        signal = Signal("renewal_due", dough, None, "t", (), (), 1.0)
        router.route(signal)
        with self.assertNumQueries(0):
            router.route(signal)
```

- [ ] **Step 2: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_routing --parallel --noinput`
Expected: an import error (`No module named 'services.work.routing'`).

- [ ] **Step 3: Write `routing.py`**

Create `services/work/routing.py`:

```python
"""Who a recommendation is for (Work round §2.2 Routing).

**Suggested assignee.** The person whose job it is: the organisation's CS
function owner (knowledge.FunctionOwner) for renewals, health drops,
tickets, questions and anomalies; the record owner (the account's for an
account's signal, else the organisation's) after that, and straight away
for overdue tasks; for the AI agent's proposal, the member it names
(metrics.proposals.match_member), then the organisation's owner.

**Recipient.** In manager mode, the suggested person's manager; otherwise,
or without a manager who qualifies, the suggested person. With nobody
suggested: the first active member with view_all_accounts, else the
workspace's owner.

**Everyone qualifies the same way:** active, and able to open the record
(scoping.can_open). A candidate who does not is passed over. `None` means
nobody can receive it; the caller counts it and tries again next run."""

from dataclasses import dataclass

from services.accounts.capabilities import Capability
from services.accounts.models import User
from services.customers.scoping import can_open

from .models import Recommendation, WorkSettings

K = Recommendation.Kind
CS = User.Function.CS

#: The function whose owner a kind is suggested to first; absent means the
#: record owner straight away (overdue tasks) or the proposal's person (agent).
FUNCTION_FOR = {
    K.RENEWAL_DUE: CS,
    K.HEALTH_DROP: CS,
    K.URGENT_TICKETS: CS,
    K.OPEN_QUESTIONS: CS,
    K.ANOMALY: CS,
}


@dataclass(frozen=True)
class Route:
    suggested: object
    recipient: object


class Router:
    """Routes one refresh's signals for one workspace, remembering function
    owners, fallbacks and every (person, record) `can_open` answer."""

    def __init__(self, organisation, recommend_to):
        self.organisation = organisation
        self.recommend_to = recommend_to
        self._opens = {}
        self._function_owners = None
        self._fallbacks = None

    def opens(self, user, record):
        if user is None or not user.is_active:
            return False
        key = (user.pk, type(record).__name__, record.pk)
        if key not in self._opens:
            # SOC2:AUTH-02 work is routed only to people who can open its record
            self._opens[key] = can_open(user, record)
        return self._opens[key]

    def function_owner(self, customer, function):
        if self._function_owners is None:
            from services.knowledge.models import FunctionOwner

            self._function_owners = {
                (owner.customer_id, owner.function): owner.user
                for owner in FunctionOwner.objects.filter(
                    customer__organisation=self.organisation
                ).select_related("user")
            }
        return self._function_owners.get((customer.pk, function))

    def candidates(self, signal):
        if signal.proposal is not None:
            from services.metrics.proposals import match_member

            yield match_member(self.organisation, signal.proposal.action.get("assignee_name", ""))
            yield signal.customer.owner
            return
        function = FUNCTION_FOR.get(signal.kind)
        if function is not None:
            yield self.function_owner(signal.customer, function)
        yield signal.record.owner

    def suggested(self, signal):
        for person in self.candidates(signal):
            if self.opens(person, signal.record):
                return person
        return None

    def fallbacks(self):
        """Active view-all members by join date, then the workspace's owner."""
        if self._fallbacks is None:
            from services.identity.ownership import owner_membership

            members = User.objects.filter(organisation=self.organisation, is_active=True).order_by(
                "date_joined", "id"
            )
            people = [m for m in members if m.has_capability(Capability.VIEW_ALL_ACCOUNTS)]
            owner = owner_membership(self.organisation)
            if owner is not None and owner.user.is_active:
                people.append(owner.user)
            self._fallbacks = people
        return self._fallbacks

    def route(self, signal):
        record = signal.record
        suggested = self.suggested(signal)
        if suggested is not None:
            manager = suggested.reports_to
            if self.recommend_to == WorkSettings.RecommendTo.MANAGER and self.opens(
                manager, record
            ):
                return Route(suggested, manager)
            return Route(suggested, suggested)
        for person in self.fallbacks():
            if self.opens(person, record):
                return Route(None, person)
        return None
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_routing --parallel --noinput`
Expected: PASS (17 tests). If `test_can_open_is_asked_once_per_person_and_record` counts queries, the second `route` is reading `reports_to` or `owner` afresh: the first call must leave both loaded on the same instances (it does: `suggested` is the `dough.owner` instance the signal carries, and Django caches `reports_to` on it).

- [ ] **Step 5: Lint**

Run: `venv/bin/ruff format services/work && venv/bin/ruff check services/work`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add services/work/routing.py services/work/tests/test_routing.py
git commit -m "feat(work): route a recommendation to the right person and their manager

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The refresh — upsert, expire, cooldown, the daily notice and the nightly step

**Files:**
- Create: `services/work/recommend.py`
- Modify: `services/customers/management/commands/run_health_maintenance.py` (a new step directly above the `# Rules: "when → then" ...` block)
- Test: `services/work/tests/test_refresh.py`

**Interfaces:**
- Consumes `load_book`, `SOURCES`, `plural` (Tasks 2–3, called through the module as `signal_sources.load_book` / `signal_sources.SOURCES` so tests can patch them), `Router`, `Route` (Task 4), `settings_for`, `effective_sources` (Task 1), `notifications.realtime.notify`, `scoping.can_open`.
- Produces `RefreshResult(created=0, updated=0, expired=0, unrouted=0, notified=0, failed=[])` with `as_dict()` and `add(other)`.
- Produces `worse(kind, now, then, params) -> bool`, `held_back(organisation, signal, params, cooldown_days, now) -> bool`.
- Produces `refresh(organisation, *, today, now=None) -> RefreshResult` (`failed` lists the kinds that failed) and `refresh_all(organisation=None, *, today) -> RefreshResult` (`failed` lists `"organisation <id>"` and `"<kind> in organisation <id>"`).
- Produces `waiting_message(recipient, recs) -> str`, `notify_waiting(created, *, today) -> int`, `RECOMMENDED_LINK = "/work/recommended"`.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_refresh.py`:

```python
"""One pass of the recommender (spec §2.2, §5, §6): one open recommendation
per triggering record, routed; refreshed in place; expired when its signal
stops; held back by a recent decision unless the signal got worse; one
source failing never stops the others; each recipient told once a day; and
the nightly job runs it before the rules."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone

from services.customers.models import Customer, Task, Ticket
from services.notifications.models import Notification
from services.rules import nightly as rules_nightly
from services.rules.nightly import RulesResult
from services.work import recommend, sources
from services.work.recommend import RefreshResult, refresh_all, waiting_message
from services.work.tests.recommend_fixtures import RecommendFixture, record_link


def short(value):
    return f"{value.day} {value:%b}"


class RefreshTests(RecommendFixture):
    def test_each_triggering_record_gets_one_open_recommendation_routed(self):
        self.only("renewal_due", days=30)
        result = self.refresh_now()
        self.assertEqual(
            (result.created, result.updated, result.expired, result.failed), (2, 0, 0, [])
        )
        dough = self.recs(customer=self.dough).get()
        self.assertEqual(
            (dough.kind, dough.status, dough.title, dough.account),
            ("renewal_due", "open", "Prepare Dough Co's renewal", None),
        )
        self.assertEqual(
            (dough.suggested_assignee, dough.recipient, dough.signal_value),
            (self.csm, self.mona, 30.0),
        )
        renews = self.today + timedelta(days=30)
        self.assertEqual(
            dough.why,
            {
                "facts": ["Renews in 30 days", f"Renewal date {short(renews)}"],
                "evidence": [{"label": "Dough Co", "link": record_link(self.dough)}],
            },
        )
        taco = self.recs(customer=self.taco).get()
        self.assertEqual((taco.suggested_assignee, taco.recipient), (self.other, self.other))

    def test_running_twice_changes_nothing(self):
        self.only("renewal_due")
        self.refresh_now()
        before = sorted(self.recs().values_list("id", "status", "signal_value", "recipient"))
        result = self.refresh_now()
        self.assertEqual((result.created, result.updated, result.expired), (0, 2, 0))
        after = sorted(self.recs().values_list("id", "status", "signal_value", "recipient"))
        self.assertEqual(after, before)

    def test_an_open_one_is_refreshed_in_place_and_rerouted(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=9), owner=self.mona
        )
        self.refresh_now()
        dough = self.recs(customer=self.dough).get()
        self.assertEqual((dough.signal_value, dough.why["facts"][0]), (9.0, "Renews in 9 days"))
        self.assertEqual((dough.suggested_assignee, dough.recipient), (self.mona, self.mona))

    def test_a_signal_that_stops_expires_its_recommendation(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=90)
        )
        self.assertEqual(self.refresh_now().expired, 1)
        dough = self.recs(customer=self.dough).get()
        self.assertEqual((dough.status, dough.decided_by), ("expired", None))
        self.assertIsNotNone(dough.decided_at)

    def test_turning_a_source_off_expires_its_open_ones(self):
        self.only("renewal_due")
        self.refresh_now()
        self.only("urgent_tickets")
        self.assertEqual(self.refresh_now().expired, 2)
        self.assertFalse(self.recs(status="open").exists())

    def test_nobody_able_to_receive_it_is_counted_and_retried(self):
        self.only("renewal_due")
        Customer.objects.filter(pk=self.loose.pk).update(renewal_date=self.today)
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        result = self.refresh_now()
        self.assertEqual((result.created, result.unrouted), (2, 1))
        self.assertFalse(self.recs(customer=self.loose).exists())


class HeldBackTests(RecommendFixture):
    def decided(self, on, *, value, days_ago, status="dismissed", kind="renewal_due", task=None):
        return self.make_rec(
            kind,
            on=on,
            recipient=self.mona,
            status=status,
            value=value,
            decided_by=self.mona,
            decided_at=timezone.now() - timedelta(days=days_ago),
            task=task,
        )

    def opened(self, on):
        return self.recs(customer=on, status="open").exists()

    def test_a_dismissal_holds_the_same_signal_back_for_the_cooldown(self):
        self.only("renewal_due")
        self.decided(self.dough, value=31, days_ago=13)
        self.refresh_now()
        self.assertFalse(self.opened(self.dough))
        self.recs(customer=self.dough).update(decided_at=timezone.now() - timedelta(days=15))
        self.refresh_now()
        self.assertTrue(self.opened(self.dough))

    def test_a_renewal_that_becomes_overdue_comes_back_inside_the_cooldown(self):
        self.only("renewal_due")
        self.decided(self.dough, value=3, days_ago=1)
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today - timedelta(days=1)
        )
        self.refresh_now()
        self.assertEqual(self.recs(customer=self.dough, status="open").get().signal_value, -1.0)

    def test_more_tickets_than_when_dismissed_comes_back(self):
        self.only("urgent_tickets")
        for number in (1, 2):
            Ticket.objects.create(
                customer=self.taco,
                ticket_number=f"TKT-{number}",
                title="Down",
                assignee_name="Support",
                priority="high",
                opened_at=self.today,
            )
        self.decided(self.taco, value=2, days_ago=1, kind="urgent_tickets")
        self.refresh_now()
        self.assertFalse(self.opened(self.taco))
        Ticket.objects.create(
            customer=self.taco,
            ticket_number="TKT-3",
            title="Down",
            assignee_name="Support",
            priority="critical",
            opened_at=self.today,
        )
        self.refresh_now()
        self.assertEqual(self.recs(customer=self.taco, status="open").get().signal_value, 3.0)

    def test_a_cooldown_of_zero_holds_nothing_back(self):
        self.only("renewal_due")
        self.prefer(dismiss_cooldown_days=0)
        self.decided(self.dough, value=30, days_ago=0)
        self.refresh_now()
        self.assertTrue(self.opened(self.dough))

    def test_an_assignment_holds_back_while_its_task_is_open(self):
        self.only("renewal_due")
        task = Task.objects.create(
            customer=self.dough,
            title="Prepare Dough Co's renewal",
            assignee=self.csm,
            created_by=self.mona,
            due_date=self.today,
            priority="high",
        )
        self.decided(self.dough, value=30, days_ago=30, status="assigned", task=task)
        self.refresh_now()
        self.assertFalse(self.opened(self.dough))
        Task.objects.filter(pk=task.pk).update(status="completed")
        self.refresh_now()
        self.assertTrue(self.opened(self.dough))

    def test_worse_by_kind(self):
        params = {"drop": 0.5}
        self.assertTrue(recommend.worse("renewal_due", -1, 3, params))
        self.assertFalse(recommend.worse("renewal_due", 2, 30, params))
        self.assertFalse(recommend.worse("renewal_due", -5, -1, params))
        self.assertTrue(recommend.worse("health_drop", 1.1, 0.6, params))
        self.assertFalse(recommend.worse("health_drop", 1.0, 0.6, params))
        self.assertTrue(recommend.worse("overdue_tasks", 3, 2, params))
        self.assertFalse(recommend.worse("open_questions", 2, 2, params))
        self.assertFalse(recommend.worse("agent", None, None, params))


class FailureTests(RecommendFixture):
    def test_one_source_failing_never_stops_the_others(self):
        Ticket.objects.create(
            customer=self.taco,
            ticket_number="TKT-1",
            title="Down",
            assignee_name="Support",
            priority="high",
            opened_at=self.today,
        )

        def boom(book, params):
            raise RuntimeError("Dough Co exploded")

        with (
            patch.dict(sources.SOURCES, {"renewal_due": boom}),
            self.assertLogs("services.work.recommend", "WARNING") as logs,
        ):
            result = self.refresh_now()
        self.assertEqual(result.failed, ["renewal_due"])
        self.assertEqual(list(self.recs().values_list("kind", flat=True)), ["urgent_tickets"])
        self.assertNotIn("Dough Co", "\n".join(logs.output))

    def test_a_failing_source_writes_nothing_of_its_own(self):
        self.only("renewal_due")
        real = sources.SOURCES["renewal_due"]

        def half(book, params):
            found = real(book, params)
            return [*found, None]  # the second write fails after the first

        with (
            patch.dict(sources.SOURCES, {"renewal_due": half}),
            self.assertLogs("services.work.recommend", "WARNING"),
        ):
            result = self.refresh_now()
        self.assertEqual((result.failed, result.created), (["renewal_due"], 0))
        self.assertFalse(self.recs().exists())

    def test_every_workspace_and_one_failing_never_stops_the_next(self):
        Customer.objects.filter(pk=self.globex.pk).update(renewal_date=self.today)
        real = sources.load_book

        def flaky(organisation, **kwargs):
            if organisation.pk == self.org.pk:
                raise RuntimeError("Acme")
            return real(organisation, **kwargs)

        with (
            patch.object(sources, "load_book", side_effect=flaky),
            self.assertLogs("services.work.recommend", "WARNING"),
        ):
            result = refresh_all(today=self.today)
        self.assertEqual(result.failed, [f"organisation {self.org.pk}"])
        [only] = recommend.Recommendation.objects.all()
        self.assertEqual((only.customer, only.recipient), (self.globex, self.stranger))


class WaitingNoticeTests(RecommendFixture):
    def notices(self, who):
        return list(
            Notification.objects.filter(recipient=who, kind="recommendations_waiting").values_list(
                "message", "link", "actor"
            )
        )

    def test_each_recipient_is_told_once_about_their_new_items(self):
        self.only("renewal_due")
        Customer.objects.filter(pk=self.pizza.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        result = self.refresh_now()
        self.assertEqual(result.notified, 2)
        # Mona receives Carl's Dough Co and Pizza Hut; Dana her own Taco Bell.
        self.assertEqual(
            self.notices(self.mona),
            [("2 tasks recommended for your team.", "/work/recommended", None)],
        )
        self.assertEqual(
            self.notices(self.other),
            [("Revenact recommends “Prepare Taco Bell's renewal”.", "/work/recommended", None)],
        )
        self.assertEqual(self.notices(self.csm), [])

    def test_in_owner_mode_they_are_for_you(self):
        self.only("renewal_due")
        self.prefer(recommend_to="owner")
        Customer.objects.filter(pk=self.pizza.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        self.refresh_now()
        self.assertEqual(self.notices(self.csm)[0][0], "2 tasks recommended for you.")

    def test_at_most_once_a_day(self):
        self.only("renewal_due")
        self.refresh_now()
        Customer.objects.filter(pk=self.pizza.pk).update(
            renewal_date=self.today + timedelta(days=5)
        )
        self.refresh_now()
        self.assertEqual(self.recs(customer=self.pizza).count(), 1)
        self.assertEqual(len(self.notices(self.mona)), 1)
        Customer.objects.filter(pk=self.soup.pk).update(renewal_date=self.today + timedelta(days=5))
        self.refresh_now(today=self.today + timedelta(days=1))
        self.assertEqual(len(self.notices(self.mona)), 2)

    def test_nothing_new_tells_nobody(self):
        self.only("renewal_due")
        self.refresh_now()
        Notification.objects.all().delete()
        self.refresh_now(today=self.today + timedelta(days=1))
        self.assertFalse(Notification.objects.exists())

    def test_a_record_is_named_only_to_someone_who_may_open_it(self):
        west = self.make_rec(on=self.west, recipient=self.csm, title="Prepare Taco West's renewal")
        self.assertEqual(waiting_message(self.csm, [west]), "1 task recommended for your team.")
        mine = self.make_rec(on=self.pizza, recipient=self.csm, suggested=self.csm)
        self.assertEqual(
            waiting_message(self.csm, [mine]), "Revenact recommends “Prepare Pizza Hut's renewal”."
        )


class MaintenanceStepTests(RecommendFixture):
    def run_job(self):
        out = StringIO()
        call_command("run_health_maintenance", org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_recommendations_run_before_the_rules(self):
        calls = []

        def step(name, value):
            return lambda *args, **kwargs: calls.append(name) or value

        with (
            patch.object(
                recommend, "refresh_all", side_effect=step("work", RefreshResult(created=3))
            ) as work,
            patch.object(rules_nightly, "evaluate_rules", side_effect=step("rules", RulesResult())),
        ):
            output = self.run_job()
        self.assertEqual(calls, ["work", "rules"])
        self.assertEqual(work.call_args.args, (self.org,))
        self.assertIn("recommended 3 task(s): 0 refreshed, 0 expired, 0 told, 0 failure(s)", output)

    def test_a_failure_is_reported_never_fatal(self):
        with (
            patch.object(recommend, "refresh_all", side_effect=RuntimeError("Dough Co")),
            patch.object(rules_nightly, "evaluate_rules", return_value=RulesResult()) as rules,
        ):
            output = self.run_job()
        # the class name only: an exception's text can quote a row's values
        self.assertIn("recommendations skipped: RuntimeError\n", output)
        rules.assert_called_once()
```

- [ ] **Step 2: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_refresh --parallel --noinput`
Expected: an import error (`cannot import name 'recommend' from 'services.work'`).

- [ ] **Step 3: Write `recommend.py`**

Create `services/work/recommend.py`:

```python
"""The recommender's pass over one workspace (Work round §2.2): each enabled
source's signals become open recommendations routed to a person; open ones
whose signal stopped expire; each recipient with something new is told,
once a day. Rules only, no model call.

**Upsert.** One open recommendation per kind and record (per proposal for
the AI agent's), held by the partial unique constraints. An open one is
refreshed in place (title, facts, severity) and re-routed; a new one is made
unless an earlier decision on the same record holds it back (`held_back`).

**Safe to re-run.** Running twice changes nothing; a concurrent run's insert
loses to a constraint and is skipped. Each source runs in its own
transaction and fails on its own, logged with the exception's class name
only (its text can quote a row's values)."""

import logging
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import Task
from services.customers.scoping import can_open

from . import sources as signal_sources
from .models import Recommendation
from .prefs import effective_sources, settings_for
from .routing import Router

logger = logging.getLogger(__name__)

K, S = Recommendation.Kind, Recommendation.Status
RECOMMENDED_LINK = "/work/recommended"
COUNTERS = ("created", "updated", "expired", "unrouted", "notified")


@dataclass
class RefreshResult:
    created: int = 0
    updated: int = 0
    expired: int = 0
    unrouted: int = 0
    notified: int = 0
    failed: list = field(default_factory=list)

    def as_dict(self):
        return asdict(self)

    def add(self, other):
        for name in COUNTERS:
            setattr(self, name, getattr(self, name) + getattr(other, name))


def worse(kind, now, then, params):
    """Whether a signal at `now` is worse than it was at `then` (a
    decision's): a renewal that has become overdue; a health drop deeper by
    another full `drop`; more tickets, tasks, questions or anomalies. The AI
    agent's never worsen: each proposal is its own."""
    if now is None or then is None:
        return False
    if kind == K.RENEWAL_DUE:
        return now < 0 <= then
    if kind == K.HEALTH_DROP:
        return Decimal(str(now)) - Decimal(str(then)) >= Decimal(str(params["drop"]))
    return now > then


def held_back(organisation, signal, params, cooldown_days, now):
    """An earlier decision on the same record holds a new recommendation
    back: an assignment while its task is open; then any assignment or
    dismissal for `cooldown_days`, unless the signal has since got worse."""
    if signal.proposal is not None:
        return False
    last = (
        Recommendation.objects.filter(
            organisation=organisation,
            kind=signal.kind,
            customer=signal.customer,
            account=signal.account,
            status__in=[S.ASSIGNED, S.DISMISSED],
        )
        .select_related("task")
        .order_by("-decided_at", "-id")
        .first()
    )
    if last is None:
        return False
    if (
        last.status == S.ASSIGNED
        and last.task is not None
        and last.task.status != Task.Status.COMPLETED
    ):
        return True
    if last.decided_at is None or last.decided_at < now - timedelta(days=cooldown_days):
        return False
    return not worse(signal.kind, signal.value, last.signal_value, params)


def _key(rec):
    if rec.proposal_id is not None:
        return ("proposal", rec.proposal_id)
    return (rec.customer_id, rec.account_id)


def _apply(organisation, kind, signals, params, prefs, router, now, result):
    """Upsert `kind`'s signals and expire its open ones that stopped.
    Returns the recommendations it made."""
    open_now = {
        _key(rec): rec
        for rec in Recommendation.objects.filter(
            organisation=organisation, kind=kind, status=S.OPEN
        )
    }
    seen, created = set(), []
    for signal in signals:
        seen.add(signal.key)
        route = router.route(signal)
        if route is None:
            result.unrouted += 1
            continue
        why = {"facts": list(signal.facts), "evidence": list(signal.evidence)}
        current = open_now.get(signal.key)
        if current is not None:
            current.title, current.why, current.signal_value = signal.title, why, signal.value
            current.suggested_assignee, current.recipient = route.suggested, route.recipient
            current.save(
                update_fields=["title", "why", "signal_value", "suggested_assignee", "recipient"]
            )
            result.updated += 1
            continue
        if held_back(organisation, signal, params, prefs.dismiss_cooldown_days, now):
            continue
        try:
            with transaction.atomic():
                rec = Recommendation.objects.create(
                    organisation=organisation,
                    customer=signal.customer,
                    account=signal.account,
                    kind=kind,
                    title=signal.title,
                    why=why,
                    proposal=signal.proposal,
                    suggested_assignee=route.suggested,
                    recipient=route.recipient,
                    signal_value=signal.value,
                )
        except IntegrityError:
            continue  # a concurrent run made it first
        created.append(rec)
        result.created += 1
    stale = [rec.pk for key, rec in open_now.items() if key not in seen]
    if stale:
        Recommendation.objects.filter(pk__in=stale, status=S.OPEN).update(
            status=S.EXPIRED, decided_at=now
        )
    result.expired += len(stale)
    return created


def refresh(organisation, *, today, now=None):
    """One pass over `organisation`. See the module."""
    now = now or timezone.now()
    prefs = settings_for(organisation)
    params = effective_sources(prefs)
    book = signal_sources.load_book(organisation, today=today, now=now)
    router = Router(organisation, prefs.recommend_to)
    result, created = RefreshResult(), []
    for kind in K.values:
        part = RefreshResult()
        try:
            with transaction.atomic():
                found = []
                if params[kind]["enabled"]:
                    found = signal_sources.SOURCES[kind](book, params[kind])
                made = _apply(organisation, kind, found, params[kind], prefs, router, now, part)
        except Exception as exc:  # noqa: BLE001 - one source never stops the others
            logger.warning(
                "work recommendations: %s failed for organisation %s: %s",
                kind,
                organisation.pk,
                type(exc).__name__,
            )
            result.failed.append(kind)
            continue
        result.add(part)
        created += made
    result.notified = notify_waiting(created, today=today)
    return result


def refresh_all(organisation=None, *, today):
    """Every workspace with organisations (or just `organisation`), each on
    its own: one failing never stops the next."""
    from services.accounts.models import Organisation
    from services.customers.models import Customer

    if organisation is not None:
        workspaces = [organisation]
    else:
        workspaces = Organisation.objects.filter(
            id__in=Customer.objects.values("organisation_id")
        ).order_by("id")
    total = RefreshResult()
    for workspace in workspaces:
        try:
            part = refresh(workspace, today=today)
        except Exception as exc:  # noqa: BLE001 - reported, never fatal
            logger.warning(
                "work recommendations: organisation %s failed: %s",
                workspace.pk,
                type(exc).__name__,
            )
            total.failed.append(f"organisation {workspace.pk}")
            continue
        total.add(part)
        total.failed.extend(f"{kind} in organisation {workspace.pk}" for kind in part.failed)
    return total


def waiting_message(recipient, recs):
    """The notice's text for `recipient`'s new recommendations: one is
    named, to someone who may open its record; otherwise they are counted."""
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if len(recs) == 1 and can_open(recipient, recs[0].record):
        return f"Revenact recommends “{recs[0].title}”."[:500]
    whose = "you" if all(r.suggested_assignee_id == recipient.pk for r in recs) else "your team"
    return f"{signal_sources.plural(len(recs), 'task')} recommended for {whose}."


def notify_waiting(created, *, today):
    """One `recommendations_waiting` per recipient of `created`, unless they
    were told already on `today`'s date or are no longer active. Returns how
    many were told."""
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    kind = Notification.Kind.RECOMMENDATIONS_WAITING
    by_recipient = defaultdict(list)
    for rec in created:
        by_recipient[rec.recipient_id].append(rec)
    told = 0
    for recs in by_recipient.values():
        recipient = recs[0].recipient
        if not recipient.is_active:
            continue
        if Notification.objects.filter(
            recipient=recipient, kind=kind, created_at__date=today
        ).exists():
            continue
        notify(
            recipient=recipient,
            actor=None,
            kind=kind,
            message=waiting_message(recipient, recs),
            link=RECOMMENDED_LINK,
            push_on_commit=True,
        )
        told += 1
    return told
```

- [ ] **Step 4: Add the nightly step**

In `services/customers/management/commands/run_health_maintenance.py`, directly above the comment `# Rules: "when → then" on each owner's own segments, run as the`, insert:

```python
# Recommended work: today's signals become recommendations in the
# right person's queue, after the scores, tickets and plans they read
# are fresh and before the rules run. Rules only, no model call; each
# source and each workspace fails on its own (services.work.recommend).
if not options["dry_run"]:
    from services.work import recommend

    try:
        night = recommend.refresh_all(organisation, today=timezone.localdate())
        self.stdout.write(
            self.style.SUCCESS(
                f"recommended {night.created} task(s): {night.updated} refreshed, "
                f"{night.expired} expired, {night.notified} told, "
                f"{len(night.failed)} failure(s)"
            )
        )
    except Exception as exc:  # noqa: BLE001 - reported, never fatal
        # the class name only: an exception's text can quote a row's values
        self.stdout.write(self.style.WARNING(f"recommendations skipped: {type(exc).__name__}"))
```

(`recommend.refresh_all`, through the module, so the test's `patch.object(recommend, "refresh_all", ...)` is what runs.)

- [ ] **Step 5: Run the tests to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_refresh --parallel --noinput`
Expected: PASS (22 tests).

- [ ] **Step 6: Run the other nightly-step suites (the job gained a step)**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.customers.tests.test_health_maintenance services.plans.tests.test_nightly services.rules.tests.test_nightly services.segments.tests.test_nightly services.surveys.tests.test_nightly services.brain.tests.test_history --parallel --noinput`
Expected: PASS.

- [ ] **Step 7: Lint**

Run: `venv/bin/ruff format services/work services/customers/management && venv/bin/ruff check services/work services/customers/management`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add services/work/recommend.py services/work/tests/test_refresh.py services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(work): the daily recommender pass, its notice and its nightly step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Reading — `GET /work/recommendations/`, `GET`/`PATCH /work/settings/` and "Run now"

**Files:**
- Modify: `services/work/clock.py` (`add_working_days`)
- Create: `services/work/rec_access.py`
- Create: `services/work/defaults.py`
- Create: `services/work/recommendations.py`
- Modify: `services/work/prefs.py` (`payload`, `changes_from`)
- Modify: `services/work/views.py` (whole file below), `services/work/urls.py`
- Test: `services/work/tests/test_recommendations_api.py`, `services/work/tests/test_settings_api.py`

**Interfaces:**
- Consumes `Recommendation`, `WorkSettings`, `settings_for`, `effective_sources` (Task 1), `refresh` (Task 5), `task_changes.person(user)` (delivery 1), `scoping.can_open`, `visible_customers`, `visible_accounts`, `sees_everything`, `hierarchy.subtree_ids`.
- Produces `clock.add_working_days(day, count) -> date` (Monday to Friday) and `clock.WORKING_DAYS`.
- Produces `rec_access`: `ME = "me"`, `TEAM = "team"`, `SCOPES`, `RECIPIENT = "recipient"`, `CHAIN = "chain"`, `COMPANY = "company"`, `RELATED` (the select_related tuple every recommendation read uses), `default_scope(reader) -> str`, `decided_as(reader, rec) -> str | None`, `decidable(reader, scope) -> QuerySet`, `openable(reader, rows) -> QuerySet`.
- Produces `defaults`: `default_due(rec, today) -> date`, `default_priority(rec) -> str`, `defaults(rec, today) -> {"title", "due_date", "priority"}`, `describe(facts) -> str`.
- Produces `recommendations`: `LIMIT = 100`, `Opens` (a per-response `can_open` cache), `record_payload(rec)`, `row_payload(rec, *, today, opens)`, `build(reader, scope, *, today) -> {"scope", "items", "count", "hidden"}`; Task 7 adds `decided_payload` and `already_decided` here.
- Produces `prefs.payload(prefs, reader) -> dict` and `prefs.changes_from(prefs, data) -> dict` (raises DRF `ValidationError` with the contract's messages).
- Produces the routes `work-recommendations`, `work-recommendations-refresh`, `work-settings`.

- [ ] **Step 1: Write the failing list tests**

Create `services/work/tests/test_recommendations_api.py`:

```python
"""Recommended (spec §2.3 Read, §4): the open recommendations a reader may
decide, newest first, each with what its card shows; those about records
they cannot open counted in `hidden`, never named. And what Assign
prefills."""

import json
from datetime import date, timedelta

from services.customers.models import Customer
from services.work.clock import add_working_days
from services.work.defaults import default_due, default_priority, describe
from services.work.models import Recommendation
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal

URL = "/api/v1/work/recommendations/"


class RecommendedListTests(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough_rec = cls.make_rec(on=cls.dough, recipient=cls.mona, suggested=cls.csm, value=30)
        cls.taco_rec = cls.make_rec(on=cls.taco, recipient=cls.other, suggested=cls.other)
        cls.loose_rec = cls.make_rec(on=cls.loose, recipient=cls.admin)
        cls.done = cls.make_rec(
            "health_drop", on=cls.dough, recipient=cls.mona, suggested=cls.csm, status="dismissed"
        )
        cls.pizza_rec = cls.make_rec(on=cls.pizza, recipient=cls.csm, suggested=cls.csm)

    def ids(self, user, scope=None):
        body = self.ok(user, URL if scope is None else f"{URL}?scope={scope}")
        return [item["id"] for item in body["items"]]

    def test_a_managers_team_is_everything_they_may_decide_newest_first(self):
        body = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual(body["scope"], "team")
        self.assertEqual([i["id"] for i in body["items"]], [self.pizza_rec.pk, self.dough_rec.pk])
        self.assertEqual((body["count"], body["hidden"]), (2, 0))

    def test_me_is_the_callers_own_queue(self):
        self.assertEqual(self.ids(self.mona, "me"), [self.dough_rec.pk])
        self.assertEqual(self.ids(self.csm, "me"), [self.pizza_rec.pk])
        self.assertEqual(self.ids(self.other, "me"), [self.taco_rec.pk])
        self.assertEqual(self.ids(self.admin, "me"), [self.loose_rec.pk])

    def test_the_default_scope_is_team_for_managers_and_view_all(self):
        self.assertEqual(self.ok(self.mona, URL)["scope"], "team")
        self.assertEqual(self.ok(self.admin, URL)["scope"], "team")
        self.assertEqual(self.ok(self.csm, URL)["scope"], "me")
        self.assertEqual(self.ok(self.lee, URL)["scope"], "me")

    def test_view_all_decides_every_open_one(self):
        self.assertEqual(
            self.ids(self.admin, "team"),
            [self.pizza_rec.pk, self.loose_rec.pk, self.taco_rec.pk, self.dough_rec.pk],
        )

    def test_a_row_carries_what_the_card_shows(self):
        [row] = self.ok(self.mona, f"{URL}?scope=me")["items"]
        self.assertEqual(
            row,
            {
                "id": self.dough_rec.pk,
                "kind": "renewal_due",
                "title": "Prepare Dough Co's renewal",
                "why": {
                    "facts": ["Renews in 30 days"],
                    "evidence": [{"label": "Dough Co", "link": f"/organizations/{self.dough.pk}"}],
                },
                "record": {"kind": "customer", "id": self.dough.pk, "name": "Dough Co"},
                "suggested_assignee": {
                    "id": self.csm.pk,
                    "name": "Carl CSM",
                    "active": True,
                    "can_open": True,
                },
                "recipient": {"id": self.mona.pk, "name": "Mona Manager"},
                "defaults": {
                    "title": "Prepare Dough Co's renewal",
                    "due_date": (self.today + timedelta(days=23)).isoformat(),
                    "priority": "high",
                },
                "proposal": None,
                "created_at": row["created_at"],
            },
        )

    def test_an_accounts_row_names_the_account(self):
        east = self.make_rec(on=self.east, recipient=self.mona, suggested=self.csm)
        row = next(i for i in self.ok(self.mona, f"{URL}?scope=me")["items"] if i["id"] == east.pk)
        self.assertEqual(
            row["record"], {"kind": "account", "id": self.east.pk, "name": "Taco East"}
        )

    def test_a_record_the_reader_cannot_open_is_counted_not_named(self):
        self.make_rec(on=self.west, recipient=self.mona, title="Prepare Taco West's renewal")
        body = self.ok(self.mona, f"{URL}?scope=me")
        self.assertEqual((body["count"], body["hidden"]), (1, 1))
        self.assertNotIn("Taco West", json.dumps(body))

    def test_a_suggested_person_who_lost_access_is_flagged(self):
        Customer.objects.filter(pk=self.dough.pk).update(owner=self.other)
        body = self.ok(self.admin, f"{URL}?scope=team")
        row = next(i for i in body["items"] if i["id"] == self.dough_rec.pk)
        self.assertFalse(row["suggested_assignee"]["can_open"])

    def test_the_agents_row_defaults_from_its_proposal(self):
        proposal = task_proposal(self.org, self.soup, due_in=10, priority="medium")
        rec = self.make_rec(
            "agent", on=self.soup, recipient=self.mona, suggested=self.mona, proposal=proposal
        )
        row = next(i for i in self.ok(self.mona, f"{URL}?scope=me")["items"] if i["id"] == rec.pk)
        self.assertEqual(row["proposal"], proposal.pk)
        self.assertEqual(
            (row["defaults"]["due_date"], row["defaults"]["priority"]),
            ((self.today + timedelta(days=10)).isoformat(), "medium"),
        )

    def test_an_unknown_scope_is_refused(self):
        response = self.get(self.mona, f"{URL}?scope=company")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"code": "SCOPE_UNKNOWN", "detail": "Choose me or team."}),
        )

    def test_leadership_and_other_workspaces_decide_nothing_here(self):
        for reader in (self.lee, self.stranger):
            for scope in ("me", "team"):
                with self.subTest(reader=reader.name, scope=scope):
                    body = self.ok(reader, f"{URL}?scope={scope}")
                    self.assertEqual((body["items"], body["count"], body["hidden"]), ([], 0, 0))


class DefaultsTests(RecommendFixture):
    def test_working_days_skip_the_weekend(self):
        self.assertEqual(add_working_days(date(2026, 10, 5), 3), date(2026, 10, 8))  # Mon -> Thu
        self.assertEqual(add_working_days(date(2026, 10, 9), 3), date(2026, 10, 14))  # Fri -> Wed
        self.assertEqual(add_working_days(date(2026, 10, 10), 3), date(2026, 10, 14))  # Sat -> Wed

    def test_a_renewal_is_due_a_week_before_and_never_in_the_past(self):
        rec = self.make_rec(on=self.dough, recipient=self.mona)
        self.assertEqual(default_due(rec, self.today), self.today + timedelta(days=23))
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=3)
        )
        self.assertEqual(default_due(Recommendation.objects.get(pk=rec.pk), self.today), self.today)

    def test_anything_else_is_three_working_days_away(self):
        rec = self.make_rec("urgent_tickets", on=self.taco, recipient=self.other)
        self.assertEqual(default_due(rec, date(2026, 10, 9)), date(2026, 10, 14))

    def test_priority_by_kind(self):
        expected = {
            "renewal_due": "high",
            "health_drop": "high",
            "urgent_tickets": "high",
            "anomaly": "high",
            "overdue_tasks": "medium",
            "open_questions": "medium",
        }
        for kind, priority in expected.items():
            with self.subTest(kind=kind):
                self.assertEqual(default_priority(Recommendation(kind=kind)), priority)

    def test_the_description_lists_the_facts(self):
        self.assertEqual(
            describe(["Renews in 9 days", "Renewal date 6 Nov"]),
            "Recommended by Revenact:\n- Renews in 9 days\n- Renewal date 6 Nov",
        )
        self.assertEqual(describe([]), "")
```

- [ ] **Step 2: Write the failing settings and "Run now" tests**

Create `services/work/tests/test_settings_api.py`:

```python
"""Settings › Work (spec §2.3 Settings): any member reads them; only
manage_org_settings changes them, inside the limits; "Run now" runs the
recommender for the workspace."""

from core.models import AuditEvent
from services.work.models import DEFAULT_SOURCES, Recommendation
from services.work.prefs import effective_sources, settings_for
from services.work.tests.recommend_fixtures import RecommendFixture

URL = "/api/v1/work/settings/"
RUN_NOW = "/api/v1/work/recommendations/refresh/"
WHOLE = "Choose a whole number from 1 to 120."


class WorkSettingsApiTests(RecommendFixture):
    def test_any_member_reads_them_and_whether_they_may_change_them(self):
        self.assertEqual(
            self.ok(self.csm, URL),
            {
                "recommend_to": "manager",
                "sources": DEFAULT_SOURCES,
                "dismiss_cooldown_days": 14,
                "can_edit": False,
            },
        )
        self.assertTrue(self.ok(self.admin, URL)["can_edit"])

    def test_an_admin_changes_some_and_keeps_the_rest(self):
        response = self.patch(
            self.admin,
            URL,
            {
                "recommend_to": "owner",
                "sources": {
                    "renewal_due": {"days": 45},
                    "health_drop": {"enabled": False, "drop": 1.5},
                },
                "dismiss_cooldown_days": 0,
                "can_edit": False,
                "colour": "blue",
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        sources = response.data["sources"]
        self.assertEqual(sources["renewal_due"], {"enabled": True, "days": 45})
        self.assertEqual(sources["health_drop"], {"enabled": False, "drop": 1.5, "window_days": 14})
        self.assertEqual(sources["anomaly"], {"enabled": True})
        self.assertEqual(
            (response.data["recommend_to"], response.data["dismiss_cooldown_days"]), ("owner", 0)
        )
        stored = settings_for(self.org)
        self.assertEqual((stored.recommend_to, stored.updated_by), ("owner", self.admin))
        event = AuditEvent.objects.get(action="work.settings_update")
        self.assertEqual(
            event.metadata, {"fields": ["dismiss_cooldown_days", "recommend_to", "sources"]}
        )

    def test_the_edges_are_allowed_and_drop_keeps_one_decimal(self):
        response = self.patch(
            self.admin,
            URL,
            {
                "sources": {
                    "renewal_due": {"days": 120},
                    "overdue_tasks": {"days": 1},
                    "urgent_tickets": {"min": 50},
                    "health_drop": {"drop": 0.1, "window_days": 120},
                    "open_questions": {"days": 1},
                },
                "dismiss_cooldown_days": 120,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        response = self.patch(self.admin, URL, {"sources": {"health_drop": {"drop": 4.96}}})
        self.assertEqual(response.data["sources"]["health_drop"]["drop"], 5.0)

    def test_a_member_may_not_change_them(self):
        response = self.patch(self.csm, URL, {"recommend_to": "owner"})
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"detail": "You don't have permission to change organisation settings."}),
        )
        self.assertEqual(settings_for(self.org).recommend_to, "manager")

    def test_nothing_changed_writes_nothing(self):
        response = self.patch(self.admin, URL, {})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="work.settings_update").exists())

    def test_the_values_are_checked_and_nothing_is_saved(self):
        cases = [
            ({"recommend_to": "boss"}, {"recommend_to": ["Choose manager or owner."]}),
            (
                {"dismiss_cooldown_days": 121},
                {"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]},
            ),
            (
                {"dismiss_cooldown_days": -1},
                {"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]},
            ),
            (
                {"sources": {"renewal_due": {"days": 0}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"renewal_due": {"days": 121}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"renewal_due": {"days": 30.5}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"renewal_due": {"days": True}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            (
                {"sources": {"health_drop": {"window_days": 0}}},
                {"sources": {"health_drop": {"window_days": [WHOLE]}}},
            ),
            (
                {"sources": {"health_drop": {"drop": 0.05}}},
                {"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}},
            ),
            (
                {"sources": {"health_drop": {"drop": 5.1}}},
                {"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}},
            ),
            (
                {"sources": {"urgent_tickets": {"min": 51}}},
                {"sources": {"urgent_tickets": {"min": ["Choose a whole number from 1 to 50."]}}},
            ),
            (
                {"sources": {"anomaly": {"enabled": "yes"}}},
                {"sources": {"anomaly": {"enabled": ["Choose on or off."]}}},
            ),
            (
                {"sources": {"anomaly": {"days": 3}}},
                {"sources": {"anomaly": {"days": ["Unknown setting."]}}},
            ),
            ({"sources": {"weather": {}}}, {"sources": {"weather": ["Unknown source."]}}),
            ({"sources": []}, {"sources": ["Send the sources as one object."]}),
            (
                {"sources": {"agent": True}},
                {"sources": {"agent": ["Send each source's settings as one object."]}},
            ),
            (
                {"recommend_to": "owner", "sources": {"renewal_due": {"days": 0}}},
                {"sources": {"renewal_due": {"days": [WHOLE]}}},
            ),
            ([1, 2], {"non_field_errors": ["Send the fields as one object."]}),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.patch(self.admin, URL, body)
                self.assertEqual((response.status_code, response.data), (400, errors))
        stored = settings_for(self.org)
        self.assertEqual((stored.recommend_to, stored.dismiss_cooldown_days), ("manager", 14))
        self.assertEqual(effective_sources(stored), DEFAULT_SOURCES)


class RunNowTests(RecommendFixture):
    def test_an_admin_runs_the_recommender_now(self):
        self.only("renewal_due")
        response = self.post(self.admin, RUN_NOW)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data,
            {"created": 2, "updated": 0, "expired": 0, "unrouted": 0, "notified": 2, "failed": []},
        )
        self.assertEqual(self.recs(status="open").count(), 2)
        event = AuditEvent.objects.get(action="work.recommendations_refresh")
        self.assertEqual(event.metadata, {"created": 2, "expired": 0, "failed": []})

    def test_a_member_may_not(self):
        response = self.post(self.csm, RUN_NOW)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Recommendation.objects.exists())
```

- [ ] **Step 3: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_recommendations_api services.work.tests.test_settings_api --parallel --noinput`
Expected: an import error (`cannot import name 'add_working_days'`).

- [ ] **Step 4: Working days**

Replace `services/work/clock.py` with:

```python
"""What "today" and "a working day" are for a workspace's Work lists.
Today is the server's date (UTC, TIME_ZONE) and working days are Monday to
Friday until delivery 3 adds the workspace's own timezone and working days.
Every Work route asks here, so that change is these two functions."""

from datetime import timedelta

from django.utils import timezone

#: Monday (0) to Friday (4).
WORKING_DAYS = (0, 1, 2, 3, 4)


def today_for(organisation):
    return timezone.localdate()


def add_working_days(day, count):
    """`count` working days after `day`; `day` itself never counts."""
    while count > 0:
        day += timedelta(days=1)
        if day.weekday() in WORKING_DAYS:
            count -= 1
    return day
```

- [ ] **Step 5: Who decides, and which a reader is shown**

Create `services/work/rec_access.py`:

```python
"""Who decides a recommendation, and which a reader is shown (Work round
§2.3, §4). `decided_as` is the decision routes' rule and `decidable` is the
same rule as a queryset, so the page offers exactly what the routes allow.
Both are always cut by the record rule (`openable`). `id IN` subqueries,
no DISTINCT (Postgres 16)."""

from django.db.models import Q

from services.accounts.hierarchy import subtree_ids
from services.customers.scoping import sees_everything, visible_accounts, visible_customers

from .models import Recommendation

ME, TEAM = "me", "team"
SCOPES = (ME, TEAM)
RECIPIENT, CHAIN, COMPANY = "recipient", "chain", "company"
#: What every read of a recommendation loads with it.
RELATED = ("customer", "account", "suggested_assignee", "recipient", "proposal", "decided_by")


def default_scope(reader):
    """Team for someone with reports or view_all_accounts, else Me."""
    return TEAM if sees_everything(reader) or subtree_ids(reader) else ME


def decided_as(reader, rec):
    """How `reader` may decide `rec`: "recipient", "chain" (above its
    suggested assignee), "company" (view_all_accounts), or None."""
    # SOC2:AUTH-02 its recipient, anyone above the person it suggests, or view_all_accounts
    if rec.recipient_id == reader.pk:
        return RECIPIENT
    if rec.suggested_assignee_id is not None and rec.suggested_assignee_id in subtree_ids(reader):
        return CHAIN
    if sees_everything(reader):
        return COMPANY
    return None


def decidable(reader, scope):
    """The open recommendations in the reader's workspace that `scope` puts
    in front of them: Me is their queue; Team is all they may decide."""
    rows = Recommendation.objects.filter(
        organisation_id=reader.organisation_id, status=Recommendation.Status.OPEN
    )
    if scope == ME:
        return rows.filter(recipient_id=reader.pk)
    if sees_everything(reader):
        return rows
    below = sorted(subtree_ids(reader))
    return rows.filter(Q(recipient_id=reader.pk) | Q(suggested_assignee_id__in=below))


def openable(reader, rows):
    """`rows` cut to recommendations about records `reader` may open."""
    # SOC2:AUTH-02 the record rule: an organisation's own, or an account's own
    return rows.filter(
        Q(account__isnull=True, customer_id__in=visible_customers(reader).values("id"))
        | Q(account__isnull=False, account_id__in=visible_accounts(reader).values("id"))
    )
```

- [ ] **Step 6: What Assign prefills**

Create `services/work/defaults.py`:

```python
"""What Assign prefills (Work round §2.3 Assign): the title, a due date and
a priority, from the recommendation's kind and record."""

from datetime import date, timedelta

from .clock import add_working_days
from .models import Recommendation

K = Recommendation.Kind
RENEWAL_LEAD = timedelta(days=7)
WORKING_DAYS_TO_DO = 3
PRIORITIES = ("high", "medium", "low")
PRIORITY = {
    K.RENEWAL_DUE: "high",
    K.HEALTH_DROP: "high",
    K.URGENT_TICKETS: "high",
    K.ANOMALY: "high",
    K.OVERDUE_TASKS: "medium",
    K.OPEN_QUESTIONS: "medium",
}


def default_due(rec, today):
    """A week before the renewal; the AI agent's own date; otherwise three
    working days away. Never before today."""
    if rec.kind == K.RENEWAL_DUE and rec.record.renewal_date is not None:
        return max(today, rec.record.renewal_date - RENEWAL_LEAD)
    if rec.proposal_id is not None:
        try:
            return max(today, date.fromisoformat(str(rec.proposal.action.get("due_date"))))
        except ValueError:
            pass
    return add_working_days(today, WORKING_DAYS_TO_DO)


def default_priority(rec):
    if rec.proposal_id is not None and rec.proposal.action.get("priority") in PRIORITIES:
        return rec.proposal.action["priority"]
    return PRIORITY.get(rec.kind, "medium")


def defaults(rec, today):
    return {
        "title": rec.title,
        "due_date": default_due(rec, today).isoformat(),
        "priority": default_priority(rec),
    }


def describe(facts):
    """The task's description: why it was recommended."""
    if not facts:
        return ""
    return "Recommended by Revenact:\n" + "\n".join(f"- {fact}" for fact in facts)
```

- [ ] **Step 7: The list**

Create `services/work/recommendations.py`:

```python
"""Recommended (Work round §2.3 Read): the open recommendations a reader may
decide, newest first, with what each card shows. Those about records the
reader cannot open are counted in `hidden`, never named."""

from rest_framework import serializers

from services.customers.scoping import can_open
from services.customers.task_changes import person

from .defaults import defaults
from .rec_access import RELATED, decidable, openable

LIMIT = 100
_stamp = serializers.DateTimeField().to_representation


class Opens:
    """`can_open`, asked once per (person, record) in one response."""

    def __init__(self):
        self._seen = {}

    def __call__(self, user, record):
        key = (user.pk, type(record).__name__, record.pk)
        if key not in self._seen:
            self._seen[key] = can_open(user, record)
        return self._seen[key]


def record_payload(rec):
    record = rec.record
    kind = "customer" if rec.account_id is None else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def row_payload(rec, *, today, opens):
    suggested = rec.suggested_assignee
    why = rec.why if isinstance(rec.why, dict) else {}
    return {
        "id": rec.pk,
        "kind": rec.kind,
        "title": rec.title,
        "why": {"facts": list(why.get("facts", [])), "evidence": list(why.get("evidence", []))},
        "record": record_payload(rec),
        "suggested_assignee": None
        if suggested is None
        else {
            "id": suggested.pk,
            "name": suggested.name,
            "active": suggested.is_active,
            # SOC2:AUTH-02 someone who lost access is flagged, never prefilled
            "can_open": opens(suggested, rec.record),
        },
        "recipient": person(rec.recipient),
        "defaults": defaults(rec, today),
        "proposal": rec.proposal_id,
        "created_at": _stamp(rec.created_at),
    }


def build(reader, scope, *, today):
    waiting = decidable(reader, scope)
    # SOC2:AUTH-02 named only on records the reader may open; the rest counted
    readable = openable(reader, waiting)
    count = readable.count()
    rows = readable.select_related(*RELATED).order_by("-created_at", "-id")[:LIMIT]
    opens = Opens()
    return {
        "scope": scope,
        "items": [row_payload(rec, today=today, opens=opens) for rec in rows],
        "count": count,
        "hidden": waiting.count() - count,
    }
```

- [ ] **Step 8: The settings' payload and validation**

Append to `services/work/prefs.py` (and add `from rest_framework.exceptions import ValidationError` and `from services.accounts.capabilities import Capability` to its imports):

```python
SEND_AN_OBJECT = "Send the fields as one object."
CHOOSE_RECIPIENT = "Choose manager or owner."
SEND_SOURCES_OBJECT = "Send the sources as one object."
SEND_SOURCE_OBJECT = "Send each source's settings as one object."
UNKNOWN_SOURCE = "Unknown source."
UNKNOWN_SETTING = "Unknown setting."
ON_OR_OFF = "Choose on or off."
#: (lowest, highest) for each number a source takes; `drop` is a decimal.
LIMITS = {"days": (1, 120), "window_days": (1, 120), "min": (1, 50), "drop": (0.1, 5)}
COOLDOWN_LIMITS = (0, 120)


def whole_number(low, high):
    return f"Choose a whole number from {low} to {high}."


def payload(prefs, reader):
    """`GET /work/settings/`."""
    return {
        "recommend_to": prefs.recommend_to,
        "sources": effective_sources(prefs),
        "dismiss_cooldown_days": prefs.dismiss_cooldown_days,
        "can_edit": reader.has_capability(Capability.MANAGE_ORG_SETTINGS),
    }


def _is_whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _number(name, value):
    """`value` for the setting `name`, or the message saying why not."""
    low, high = LIMITS[name]
    if name == "drop":
        if isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high:
            return round(float(value), 1), None
        return None, f"Choose a number from {low} to {high}."
    if _is_whole(value) and low <= value <= high:
        return value, None
    return None, whole_number(low, high)


def _sources(prefs, asked):
    """The workspace's sources with `asked` applied, and the errors."""
    if not isinstance(asked, dict):
        return None, [SEND_SOURCES_OBJECT]
    merged = effective_sources(prefs)
    errors = {}
    for kind, fields in asked.items():
        if kind not in DEFAULT_SOURCES:
            errors[kind] = [UNKNOWN_SOURCE]
            continue
        if not isinstance(fields, dict):
            errors[kind] = [SEND_SOURCE_OBJECT]
            continue
        wrong = {}
        for name, value in fields.items():
            if name not in DEFAULT_SOURCES[kind]:
                wrong[name] = [UNKNOWN_SETTING]
            elif name == "enabled":
                if isinstance(value, bool):
                    merged[kind]["enabled"] = value
                else:
                    wrong[name] = [ON_OR_OFF]
            else:
                number, message = _number(name, value)
                if message is None:
                    merged[kind][name] = number
                else:
                    wrong[name] = [message]
        if wrong:
            errors[kind] = wrong
    return merged, errors


def changes_from(prefs, data):
    """The fields `data` sets, validated, as {field: new value}. Raises a
    400 with every problem at once; unknown top-level keys are ignored."""
    if not isinstance(data, dict):
        raise ValidationError({"non_field_errors": [SEND_AN_OBJECT]})
    errors, changes = {}, {}
    if "recommend_to" in data:
        if data["recommend_to"] in WorkSettings.RecommendTo.values:
            changes["recommend_to"] = data["recommend_to"]
        else:
            errors["recommend_to"] = [CHOOSE_RECIPIENT]
    if "dismiss_cooldown_days" in data:
        value, (low, high) = data["dismiss_cooldown_days"], COOLDOWN_LIMITS
        if _is_whole(value) and low <= value <= high:
            changes["dismiss_cooldown_days"] = value
        else:
            errors["dismiss_cooldown_days"] = [whole_number(low, high)]
    if "sources" in data:
        sources, wrong = _sources(prefs, data["sources"])
        if wrong:
            errors["sources"] = wrong
        else:
            changes["sources"] = sources
    if errors:
        raise ValidationError(errors)
    return changes
```

- [ ] **Step 9: The routes**

Replace `services/work/views.py` with:

```python
"""The Work routes (spec §1.4, §2.3). Every list is the twice-filter
(`task_access.openable_tasks` for tasks, `rec_access.openable` for
recommendations); what the reader may not read is counted, never named.
See docs/API_CONTRACTS.md, `work`."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.capabilities import Capability
from services.accounts.permissions import CanManageOrgSettings
from services.brain.http import ScopeRefusals
from services.brain.scope import default_key, resolve
from services.customers.scoping import visible_accounts, visible_customers

from . import assignees, drill, prefs, recommendations, team, today
from .clock import today_for
from .models import WorkSettings
from .rec_access import SCOPES, default_scope
from .recommend import refresh
from .states import OPEN, STATES

CHOOSE_PERSON = "Choose a person."
CHOOSE_STATE = "Choose open, overdue or blocked."
NAME_ONE_RECORD = "Name one organisation or account."
CHOOSE_REC_SCOPE = "Choose me or team."


class TodayView(APIView):
    """GET /api/v1/work/today/ — the caller's open tasks, grouped."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(today.build(request.user, today=today_for(request.user.organisation)))


class TaskDrillView(APIView):
    """GET /api/v1/work/tasks/?assignee=<id>&state=open|overdue|blocked."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignee = request.query_params.get("assignee", "")
        state = request.query_params.get("state") or OPEN
        if not assignee.isdigit():
            raise ValidationError({"assignee": [CHOOSE_PERSON]})
        if state not in STATES:
            raise ValidationError({"state": [CHOOSE_STATE]})
        on = today_for(request.user.organisation)
        return Response(drill.build(request.user, int(assignee), state, today=on))


class AssigneesView(APIView):
    """GET /api/v1/work/assignees/?customer=<id> | ?account=<id>."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = request.query_params.get("customer", "")
        account = request.query_params.get("account", "")
        if bool(customer) == bool(account) or not (customer or account).isdigit():
            raise ValidationError({"detail": NAME_ONE_RECORD})
        # SOC2:AUTH-02 a record the caller cannot open reads as missing
        if customer:
            record = get_object_or_404(visible_customers(request.user), pk=int(customer))
        else:
            record = get_object_or_404(visible_accounts(request.user), pk=int(account))
        return Response(assignees.build(request.user, record))


class TeamView(ScopeRefusals, APIView):
    """GET /api/v1/work/team/?scope=me|team|company (default: the widest)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        key = request.query_params.get("scope") or default_key(request.user)
        # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
        scope = resolve(request.user, key)
        on = today_for(request.user.organisation)
        return Response(team.build(request.user, scope, today=on))


class RecommendationListView(APIView):
    """GET /api/v1/work/recommendations/?scope=me|team — what the caller may
    decide (default: team for someone with reports or view-all, else me)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = request.query_params.get("scope") or default_scope(request.user)
        if scope not in SCOPES:
            return Response(
                {"code": "SCOPE_UNKNOWN", "detail": CHOOSE_REC_SCOPE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        on = today_for(request.user.organisation)
        return Response(recommendations.build(request.user, scope, today=on))


class RecommendationRefreshView(APIView):
    """POST /api/v1/work/recommendations/refresh/ — Settings › Work's "Run
    now": the recommender's pass for the caller's workspace."""

    # SOC2:AUTH-02 running the recommender is a workspace setting's right
    permission_classes = [CanManageOrgSettings]

    def post(self, request):
        organisation = request.user.organisation
        result = refresh(organisation, today=today_for(organisation))
        audit.record(
            "work.recommendations_refresh",
            request=request,
            metadata={
                "created": result.created,
                "expired": result.expired,
                "failed": result.failed,
            },
        )
        return Response(result.as_dict())


class WorkSettingsView(APIView):
    """GET (any member) and PATCH (manage_org_settings) /api/v1/work/settings/."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        current = prefs.settings_for(request.user.organisation)
        return Response(prefs.payload(current, request.user))

    def patch(self, request):
        # SOC2:AUTH-02 changing the workspace's Work settings needs manage_org_settings
        if not request.user.has_capability(Capability.MANAGE_ORG_SETTINGS):
            raise PermissionDenied(CanManageOrgSettings.message)
        made = prefs.settings_for(request.user.organisation)
        with transaction.atomic():
            current = WorkSettings.objects.select_for_update().get(pk=made.pk)
            changes = prefs.changes_from(current, request.data)
            if changes:
                for name, value in changes.items():
                    setattr(current, name, value)
                current.updated_by = request.user
                current.save(update_fields=[*changes, "updated_by", "updated_at"])
                audit.record(
                    "work.settings_update",
                    request=request,
                    target=current,
                    target_repr=f"Work settings {current.pk}",
                    metadata={"fields": sorted(changes)},
                )
        return Response(prefs.payload(current, request.user))
```

In `services/work/urls.py`, add to `urlpatterns`:

```python
(path("recommendations/", views.RecommendationListView.as_view(), name="work-recommendations"),)
(
    path(
        "recommendations/refresh/",
        views.RecommendationRefreshView.as_view(),
        name="work-recommendations-refresh",
    ),
)
(path("settings/", views.WorkSettingsView.as_view(), name="work-settings"),)
```

- [ ] **Step 10: Run the tests to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work --parallel --noinput`
Expected: PASS (the whole app: delivery 1's suites, Tasks 1–5 and the 24 new tests here).

- [ ] **Step 11: Lint**

Run: `venv/bin/ruff format services/work && venv/bin/ruff check services/work`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add services/work/clock.py services/work/rec_access.py services/work/defaults.py services/work/recommendations.py services/work/prefs.py services/work/views.py services/work/urls.py services/work/tests/test_recommendations_api.py services/work/tests/test_settings_api.py
git commit -m "feat(work): the Recommended list, Work settings and Run now

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Deciding — assign and dismiss, the AI agent's proposals, and Brain kept in step

**Files:**
- Create: `services/work/deciding.py`
- Modify: `services/work/recommend.py` (`settle_for_proposal`)
- Modify: `services/work/recommendations.py` (`decided_payload`, `already_decided`)
- Modify: `services/work/views.py`, `services/work/urls.py`
- Modify: `services/metrics/proposals.py` (`approve` overrides; `approve` and `reject` settle the recommendation)
- Test: `services/work/tests/test_deciding.py`, `services/work/tests/test_deciding_race.py`

**Interfaces:**
- Consumes `rec_access.openable`, `decided_as`, `RELATED` and `defaults.default_due`, `default_priority`, `describe` (Task 6); `task_access.assignee_for(organisation_id, pk, record)` and `task_changes.add_task(...)`, `person` (delivery 1); `task_payloads.ROW_RELATED`, `task_row` (delivery 1); `metrics.proposals.approve`, `reject`, `AlreadyDecided`.
- Produces `deciding.AlreadyDecided(recommendation)` (attribute `recommendation`), `deciding.assign(reader, pk, *, assignee_id, today, title=None, due_date=None, priority=None) -> Recommendation` (assigned, `task` set) and `deciding.dismiss(reader, pk, *, reason, note="") -> Recommendation`.
- Produces `recommend.settle_for_proposal(proposal, user) -> Recommendation | None`.
- Produces `recommendations.decided_payload(rec) -> dict` and `recommendations.already_decided(rec) -> dict` (the 409 body).
- Changes `metrics.proposals.approve(proposal, user, note="", *, assignee=None, title=None, due_date=None, priority=None, description="", facts=None, event_data=None)`; existing callers (positional `proposal, user, note`) are unchanged.
- Produces the routes `work-recommendation-assign` and `work-recommendation-dismiss`.

- [ ] **Step 1: Write the failing decision tests**

Create `services/work/tests/test_deciding.py`:

```python
"""Deciding a recommendation (spec §2.3, §4, §5): who may, assign (the task,
its why, its defaults, the assignee told) and dismiss (with a reason); one
decision only, the second told who decided; the AI agent's go through its
proposal, so Brain and Work always agree."""

from datetime import timedelta

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.metrics.models import Proposal
from services.notifications.models import Notification
from services.work.models import Recommendation
from services.work.rec_access import decided_as
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal

FACTS = ("Renews in 30 days", "Renewal date 6 Nov")


class DecideFixture(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.rec = cls.make_rec(
            on=cls.dough, recipient=cls.mona, suggested=cls.csm, value=30, facts=FACTS
        )

    def assign(self, user, body=None, rec=None):
        url = f"/api/v1/work/recommendations/{(rec or self.rec).pk}/assign/"
        return self.post(user, url, {"assignee_id": self.csm.pk} if body is None else body)

    def dismiss(self, user, body, rec=None):
        return self.post(
            user, f"/api/v1/work/recommendations/{(rec or self.rec).pk}/dismiss/", body
        )

    def fresh(self, rec=None):
        return Recommendation.objects.get(pk=(rec or self.rec).pk)


class WhoDecidesTests(DecideFixture):
    def test_the_recipient_anyone_above_the_suggested_person_and_view_all(self):
        self.assertEqual(decided_as(self.mona, self.rec), "recipient")
        self.assertEqual(decided_as(self.admin, self.rec), "company")
        self.assertIsNone(decided_as(self.csm, self.rec))
        self.assertIsNone(decided_as(self.other, self.rec))
        self.assertIsNone(decided_as(self.lee, self.rec))
        User.objects.filter(pk=self.mona.pk).update(reports_to=self.lee)
        self.assertEqual(decided_as(User.objects.get(pk=self.lee.pk), self.rec), "chain")

    def test_404_then_403_then_400_then_409(self):
        # Gus is another workspace; Dana cannot open Dough Co; Lee cannot either.
        for outsider in (self.stranger, self.other, self.lee):
            with self.subTest(reader=outsider.name):
                response = self.assign(outsider)
                self.assertEqual(
                    (response.status_code, response.data),
                    (404, {"detail": "No such recommendation."}),
                )
        response = self.assign(self.csm)
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}),
        )
        Recommendation.objects.filter(pk=self.rec.pk).update(status="expired")
        self.assertEqual(self.assign(self.csm).status_code, 403)
        self.assertEqual(self.assign(self.mona, {}).status_code, 400)
        self.assertEqual(self.assign(self.mona).status_code, 409)


class AssignTests(DecideFixture):
    def test_assigning_makes_the_task_with_its_why_and_tells_the_assignee(self):
        response = self.assign(self.mona)
        self.assertEqual(response.status_code, 201, response.data)
        task = Task.objects.get(pk=response.data["task"]["id"])
        self.assertEqual(
            (task.customer, task.assignee, task.created_by, task.source),
            (self.dough, self.csm, self.mona, "recommendation"),
        )
        self.assertEqual(
            (task.title, task.priority, task.due_date),
            ("Prepare Dough Co's renewal", "high", self.today + timedelta(days=23)),
        )
        self.assertEqual(
            task.description, "Recommended by Revenact:\n- Renews in 30 days\n- Renewal date 6 Nov"
        )
        self.assertEqual(
            list(task.events.values_list("kind", "actor", "data")),
            [
                (
                    "created",
                    self.mona.pk,
                    {
                        "source": "recommendation",
                        "assignee": {"id": self.csm.pk, "name": "Carl CSM"},
                        "recommendation": self.rec.pk,
                    },
                ),
                ("recommended", self.mona.pk, {"facts": list(FACTS)}),
            ],
        )
        note = Notification.objects.get(recipient=self.csm, kind="task_assigned")
        self.assertEqual(
            note.message, "Mona Manager assigned you “Prepare Dough Co's renewal” on Dough Co."
        )
        rec = self.fresh()
        self.assertEqual((rec.status, rec.task, rec.decided_by), ("assigned", task, self.mona))
        self.assertEqual(
            response.data["recommendation"],
            {
                "id": self.rec.pk,
                "status": "assigned",
                "decided_by": {"id": self.mona.pk, "name": "Mona Manager"},
                "decided_at": response.data["recommendation"]["decided_at"],
                "task_id": task.pk,
                "dismiss_reason": "",
                "dismiss_note": "",
            },
        )
        self.assertIsNotNone(response.data["recommendation"]["decided_at"])
        self.assertEqual(
            (response.data["task"]["id"], response.data["task"]["source"]),
            (task.pk, "recommendation"),
        )
        event = AuditEvent.objects.get(action="work.recommendation_assign")
        self.assertEqual(
            event.metadata, {"kind": "renewal_due", "decided_as": "recipient", "task": task.pk}
        )

    def test_the_decider_may_change_the_title_date_and_priority(self):
        due = self.today + timedelta(days=4)
        response = self.assign(
            self.mona,
            {
                "assignee_id": self.csm.pk,
                "title": "Call Dough Co",
                "due_date": due.isoformat(),
                "priority": "low",
            },
        )
        task = Task.objects.get(pk=response.data["task"]["id"])
        self.assertEqual((task.title, task.due_date, task.priority), ("Call Dough Co", due, "low"))

    def test_view_all_decides_as_company(self):
        response = self.assign(self.admin)
        self.assertEqual(response.status_code, 201, response.data)
        event = AuditEvent.objects.get(action="work.recommendation_assign")
        self.assertEqual(event.metadata["decided_as"], "company")

    def test_assigning_to_yourself_tells_nobody(self):
        response = self.assign(self.mona, {"assignee_id": self.mona.pk})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(Notification.objects.filter(kind="task_assigned").exists())

    def test_the_assignee_must_be_able_to_open_the_record(self):
        response = self.assign(self.mona, {"assignee_id": self.other.pk})
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {
                    "code": "ASSIGNEE_CANNOT_OPEN",
                    "detail": "That person can't open this organisation.",
                },
            ),
        )
        self.assertEqual(self.fresh().status, "open")
        self.assertFalse(Task.objects.filter(source="recommendation").exists())

    def test_an_account_recommendation_makes_the_accounts_task(self):
        east = self.make_rec(on=self.east, recipient=self.mona, suggested=self.csm)
        response = self.assign(self.mona, rec=east)
        self.assertEqual(response.status_code, 201, response.data)
        task = Task.objects.get(pk=response.data["task"]["id"])
        self.assertEqual((task.account, task.customer), (self.east, None))
        response = self.assign(self.mona, {"assignee_id": self.other.pk}, rec=east)
        self.assertEqual(response.status_code, 409)

    def test_the_body_is_checked(self):
        cases = [
            ({}, {"assignee_id": ["Choose who does it."]}),
            ({"assignee_id": None}, {"assignee_id": ["Choose who does it."]}),
            ({"assignee_id": "carl"}, {"assignee_id": ["Choose who does it."]}),
            ({"assignee_id": self.csm.pk, "due_date": "soon"}, {"due_date": ["Choose a date."]}),
            (
                {"assignee_id": self.csm.pk, "priority": "urgent"},
                {"priority": ["Choose high, medium or low."]},
            ),
            ({"assignee_id": self.csm.pk, "title": ""}, {"title": ["Give the task a title."]}),
            (
                {"assignee_id": self.csm.pk, "title": "x" * 256},
                {"title": ["Keep the title under 255 characters."]},
            ),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.assign(self.mona, body)
                self.assertEqual((response.status_code, response.data), (400, errors))
        self.assertEqual(self.fresh().status, "open")

    def test_a_second_decision_is_told_who_decided(self):
        self.assign(self.mona)
        response = self.assign(self.admin)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            (response.data["code"], response.data["detail"]),
            ("ALREADY_DECIDED", "Mona Manager already assigned this."),
        )
        self.assertEqual(response.data["recommendation"]["status"], "assigned")
        self.assertEqual(Task.objects.filter(source="recommendation").count(), 1)

    def test_an_expired_one_says_so(self):
        Recommendation.objects.filter(pk=self.rec.pk).update(status="expired")
        response = self.assign(self.mona)
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "This recommendation has expired."),
        )


class DismissTests(DecideFixture):
    def test_dismissing_keeps_its_reason(self):
        response = self.dismiss(self.mona, {"reason": "already_handled", "note": "ignored"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            {
                k: response.data["recommendation"][k]
                for k in ("status", "dismiss_reason", "dismiss_note")
            },
            {"status": "dismissed", "dismiss_reason": "already_handled", "dismiss_note": ""},
        )
        rec = self.fresh()
        self.assertEqual((rec.status, rec.decided_by, rec.task), ("dismissed", self.mona, None))
        event = AuditEvent.objects.get(action="work.recommendation_dismiss")
        self.assertEqual(
            event.metadata,
            {"kind": "renewal_due", "decided_as": "recipient", "reason": "already_handled"},
        )

    def test_other_needs_its_text(self):
        response = self.dismiss(self.mona, {"reason": "other", "note": "  "})
        self.assertEqual((response.status_code, response.data), (400, {"note": ["Say why."]}))
        response = self.dismiss(self.mona, {"reason": "other", "note": "Moving to annual billing"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.fresh().dismiss_note, "Moving to annual billing")

    def test_the_reason_is_one_of_the_list(self):
        message = "Choose already handled, not relevant, wrong person or other."
        for body in ({}, {"reason": "bored"}, {"reason": None}):
            with self.subTest(body=body):
                response = self.dismiss(self.mona, body)
                self.assertEqual(
                    (response.status_code, response.data), (400, {"reason": [message]})
                )
        response = self.dismiss(self.mona, {"reason": "other", "note": "x" * 256})
        self.assertEqual(response.data, {"note": ["Keep the note under 255 characters."]})

    def test_dismissed_then_assigned_is_409_naming_the_decider(self):
        self.dismiss(self.mona, {"reason": "wrong_person"})
        response = self.assign(self.admin)
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "Mona Manager already dismissed this."),
        )

    def test_outsiders_cannot_dismiss(self):
        self.assertEqual(self.dismiss(self.other, {"reason": "not_relevant"}).status_code, 404)
        self.assertEqual(self.dismiss(self.csm, {"reason": "not_relevant"}).status_code, 403)
        self.assertEqual(self.fresh().status, "open")


class AgentDecisionTests(DecideFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.proposal = task_proposal(cls.org, cls.dough, due_in=10, priority="medium")
        cls.agent_rec = cls.make_rec(
            "agent",
            on=cls.dough,
            recipient=cls.mona,
            suggested=cls.csm,
            proposal=cls.proposal,
            title="Call the exec sponsor",
            facts=("Proposed by the AI agent", "The agent suggested Carl CSM"),
        )

    def test_assigning_approves_the_proposal_and_links_its_one_task(self):
        response = self.assign(self.mona, rec=self.agent_rec)
        self.assertEqual(response.status_code, 201, response.data)
        [task] = Task.objects.filter(customer=self.dough)
        proposal = Proposal.objects.get(pk=self.proposal.pk)
        self.assertEqual(
            (proposal.status, proposal.result["task_id"], proposal.decided_by),
            ("approved", task.pk, self.mona),
        )
        rec = self.fresh(self.agent_rec)
        self.assertEqual((rec.status, rec.task, rec.decided_by), ("assigned", task, self.mona))
        self.assertEqual(
            (task.source, task.title, task.priority, task.due_date, task.assignee),
            ("agent", "Call the exec sponsor", "medium", self.today + timedelta(days=10), self.csm),
        )
        self.assertTrue(task.description.startswith("Recommended by Revenact:\n"))
        created, recommended = task.events.all()
        self.assertEqual(
            (created.kind, created.data["proposal"], created.data["recommendation"]),
            ("created", self.proposal.pk, self.agent_rec.pk),
        )
        self.assertNotIn("fallback", created.data)
        self.assertEqual(recommended.kind, "recommended")
        self.assertEqual(response.data["task"]["id"], task.pk)

    def test_the_deciders_person_wins_over_the_agents(self):
        response = self.assign(self.mona, {"assignee_id": self.mona.pk}, rec=self.agent_rec)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Task.objects.get(customer=self.dough).assignee, self.mona)

    def test_dismissing_rejects_the_proposal(self):
        response = self.dismiss(self.mona, {"reason": "not_relevant"}, rec=self.agent_rec)
        self.assertEqual(response.status_code, 200, response.data)
        proposal = Proposal.objects.get(pk=self.proposal.pk)
        self.assertEqual((proposal.status, proposal.decision_note), ("rejected", "Not relevant"))
        self.assertEqual(self.fresh(self.agent_rec).dismiss_reason, "not_relevant")
        self.assertFalse(Task.objects.filter(customer=self.dough).exists())

    def test_other_reaches_the_proposals_note(self):
        self.dismiss(self.mona, {"reason": "other", "note": "Done by phone"}, rec=self.agent_rec)
        self.assertEqual(
            Proposal.objects.get(pk=self.proposal.pk).decision_note, "Other: Done by phone"
        )

    def test_approving_in_brain_settles_it(self):
        url = f"/api/v1/metrics/proposals/{self.proposal.pk}/approve/"
        self.assertEqual(self.post(self.csm, url).status_code, 200)
        [task] = Task.objects.filter(customer=self.dough)
        rec = self.fresh(self.agent_rec)
        self.assertEqual((rec.status, rec.task, rec.decided_by), ("assigned", task, self.csm))
        response = self.assign(self.mona, rec=self.agent_rec)
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "Carl CSM already assigned this."),
        )
        self.assertEqual(Task.objects.filter(customer=self.dough).count(), 1)

    def test_rejecting_in_brain_dismisses_it(self):
        url = f"/api/v1/metrics/proposals/{self.proposal.pk}/reject/"
        self.assertEqual(self.post(self.mona, url, {"note": "Done already"}).status_code, 200)
        rec = self.fresh(self.agent_rec)
        self.assertEqual(
            (rec.status, rec.dismiss_reason, rec.dismiss_note, rec.decided_by),
            ("dismissed", "other", "Done already", self.mona),
        )

    def test_a_proposal_decided_elsewhere_while_still_open_here_is_409(self):
        Proposal.objects.filter(pk=self.proposal.pk).update(
            status=Proposal.Status.REJECTED, decided_by=self.admin
        )
        response = self.assign(self.mona, rec=self.agent_rec)
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "Alice Admin already dismissed this."),
        )
        self.assertFalse(Task.objects.filter(customer=self.dough).exists())
        # the settle is kept though the decision was refused
        self.assertEqual(self.fresh(self.agent_rec).status, "dismissed")

    def test_a_gone_organisation_takes_its_recommendations_with_it(self):
        Customer.objects.filter(pk=self.dough.pk).delete()
        self.assertFalse(Recommendation.objects.filter(pk=self.agent_rec.pk).exists())
```

- [ ] **Step 2: Write the failing race tests**

Create `services/work/tests/test_deciding_race.py`:

```python
"""Two deciders at once (spec §5, §6 "the race between two deciders (two
connections)"): a row lock serialises them, so exactly one task is made and
the other is told who decided. And Brain's approval racing Work's assign on
the same AI-agent proposal: both lock the proposal first, so neither
deadlocks and exactly one task is made.

`TransactionTestCase`: each thread needs its own real connection, and
`setUpTestData` is not supported. `patch.object` is entered and left once,
in the main thread, around starting and joining the threads (mock.patch is
not thread-safe); see services/brain/tests/test_deciding.py."""

import threading
import time
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.customers.models import Customer, Task
from services.segments.tests.fixtures import person
from services.work.models import Recommendation
from services.work.tests.recommend_fixtures import task_proposal


class RaceTests(TransactionTestCase):
    WAIT_TIMEOUT = 10

    def setUp(self):
        self.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        self.admin = person("alice@acme.io", "Alice Admin", self.org, role=User.Role.ADMIN)
        self.mona = person("mona@acme.io", "Mona Manager", self.org)
        self.csm = person("carl@acme.io", "Carl CSM", self.org, reports_to=self.mona)
        self.dough = Customer.objects.create(
            organisation=self.org,
            name="Dough Co",
            owner=self.csm,
            arr_billed_at_account=Decimal("100000"),
            renewal_date=timezone.localdate() + timedelta(days=30),
        )

    def race(self, requests):
        """Run each (user, url, body) at once; the first to make a Task holds
        it open long enough for the other to arrive. Returns the statuses."""
        started = threading.Event()
        original_create = Task.objects.create

        def slow_create(*args, **kwargs):
            if not started.is_set():
                started.set()
                time.sleep(0.5)
            return original_create(*args, **kwargs)

        outcomes = {}

        def run(label, user, url, body, wait_for_start):
            if wait_for_start:
                started.wait(timeout=self.WAIT_TIMEOUT)
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=user.pk))
            try:
                outcomes[label] = client.post(url, body, format="json").status_code
            finally:
                connection.close()

        threads = [
            threading.Thread(target=run, args=(i, *request, i > 0))
            for i, request in enumerate(requests)
        ]
        with patch.object(Task.objects, "create", side_effect=slow_create):
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=self.WAIT_TIMEOUT)
        self.assertFalse([t for t in threads if t.is_alive()], "a thread did not finish in time")
        return sorted(outcomes.values())

    def test_two_deciders_at_once_make_exactly_one_task(self):
        rec = Recommendation.objects.create(
            organisation=self.org,
            customer=self.dough,
            kind="renewal_due",
            title="Prepare Dough Co's renewal",
            why={"facts": ["Renews in 30 days"], "evidence": []},
            suggested_assignee=self.csm,
            recipient=self.mona,
        )
        url = f"/api/v1/work/recommendations/{rec.pk}/assign/"
        body = {"assignee_id": self.csm.pk}
        statuses = self.race([(self.mona, url, body), (self.admin, url, body)])
        self.assertEqual(statuses, [201, 409])
        self.assertEqual(Task.objects.filter(customer=self.dough).count(), 1)

    def test_brain_and_work_at_once_on_one_proposal_make_exactly_one_task(self):
        proposal = task_proposal(self.org, self.dough)
        rec = Recommendation.objects.create(
            organisation=self.org,
            customer=self.dough,
            kind="agent",
            title="Call the exec sponsor",
            why={"facts": ["Proposed by the AI agent"], "evidence": []},
            proposal=proposal,
            suggested_assignee=self.csm,
            recipient=self.mona,
        )
        statuses = self.race(
            [
                (
                    self.mona,
                    f"/api/v1/work/recommendations/{rec.pk}/assign/",
                    {"assignee_id": self.csm.pk},
                ),
                (self.csm, f"/api/v1/metrics/proposals/{proposal.pk}/approve/", {}),
            ]
        )
        self.assertIn(statuses, ([200, 409], [201, 409]))
        self.assertEqual(Task.objects.filter(customer=self.dough).count(), 1)
        rec.refresh_from_db()
        self.assertEqual(rec.status, "assigned")
        self.assertEqual(rec.task, Task.objects.get(customer=self.dough))
```

- [ ] **Step 3: Run them to see them fail**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_deciding services.work.tests.test_deciding_race --parallel --noinput`
Expected: FAIL: the assign and dismiss routes are 404 (no route yet), and `test_approving_in_brain_settles_it` / `test_rejecting_in_brain_dismisses_it` find the recommendation still open.

- [ ] **Step 4: Brain's decisions settle the recommendation, and approval takes the decider's choices**

In `services/work/recommend.py`, append:

```python
def settle_for_proposal(proposal, user):
    """A proposal decided anywhere settles its open recommendation the same
    way, so Brain's Waiting on you and Work's Recommended never disagree
    (spec §2.4). Approved: assigned, linked to the task approval made.
    Rejected: dismissed as "other" with the decision's note. Called by
    `metrics.proposals.approve`/`reject` while the proposal's row is locked;
    the recommendation's row is locked second (Global Constraints, Locks)."""
    with transaction.atomic():
        rec = (
            Recommendation.objects.select_for_update()
            .filter(proposal=proposal, status=S.OPEN)
            .first()
        )
        if rec is None:
            return None
        rec.decided_by = user
        rec.decided_at = proposal.decided_at or timezone.now()
        if proposal.status == proposal.Status.APPROVED:
            rec.status = S.ASSIGNED
            rec.task_id = (proposal.result or {}).get("task_id")
        else:
            rec.status = S.DISMISSED
            rec.dismiss_reason = Recommendation.DismissReason.OTHER
            rec.dismiss_note = (proposal.decision_note or "Rejected in Brain")[:255]
        rec.save(
            update_fields=[
                "status",
                "decided_by",
                "decided_at",
                "task",
                "dismiss_reason",
                "dismiss_note",
            ]
        )
        return rec
```

In `services/metrics/proposals.py`, replace the whole `approve` function with:

```python
def approve(
    proposal,
    user,
    note="",
    *,
    assignee=None,
    title=None,
    due_date=None,
    priority=None,
    description="",
    facts=None,
    event_data=None,
):
    """Execute the action through the same path a person would use, and
    record what it created. A task goes to a real member (`_assignee`), with
    its `created` event and its assignee told.

    Work's Recommended decides a task proposal through here too (services/
    work/deciding.py): it passes the decider's `assignee` (already checked,
    so the agent's suggestion and its fallback note are skipped) and the
    decider's `title`, `due_date` and `priority`, plus the recommendation's
    `description`, `facts` (a `recommended` event) and `event_data`.
    Approving settles the proposal's recommendation either way."""
    if proposal.status != Proposal.Status.PROPOSED:
        raise AlreadyDecided(f"This proposal was already {proposal.get_status_display().lower()}.")
    action = proposal.action
    if proposal.kind == Proposal.Kind.TASK:
        customer = Customer.objects.get(
            organisation=proposal.organisation, pk=action["customer_id"]
        )
        from services.customers.task_changes import add_task

        if assignee is None:
            assignee, note_data = _assignee(proposal, customer, user)
        else:
            note_data = {}
        task = add_task(
            parent=customer,
            title=title or action["title"],
            due_date=due_date or date.fromisoformat(str(action["due_date"])),
            priority=priority or action["priority"],
            assignee=assignee,
            created_by=user,
            actor=user,
            source=Task.Source.AGENT,
            description=description,
            facts=facts,
            event_data={"proposal": proposal.pk, **note_data, **(event_data or {})},
            # The decision this work serves, so the initiative shows it.
            initiative=proposal.initiative,
        )
        result = {"task_id": task.id, "customer_id": customer.id}
    else:
        initiative = initiative_rules.create_initiative(
            proposal.organisation,
            user,
            title=proposal.title,
            hypothesis=proposal.rationale,
            metric=action["metric"],
            dimension=action["dimension"],
            member=action["member"],
            member_label=action["member_label"],
            target_value=initiative_rules.as_decimal(action["target_value"]),
            target_by=action["target_by"],
        )
        result = {"initiative_id": initiative.id}
    proposal.status = Proposal.Status.APPROVED
    proposal.decided_by = user
    proposal.decided_at = timezone.now()
    proposal.decision_note = note
    proposal.result = result
    proposal.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "result"])
    feedback_log.record_proposal_decision(proposal, "approved", note, user)
    _settle(proposal, user)
    return proposal


def _settle(proposal, user):
    # Imported here: services.work imports this module's models.
    from services.work.recommend import settle_for_proposal

    settle_for_proposal(proposal, user)
```

and in `reject`, directly after `feedback_log.record_proposal_decision(proposal, "rejected", note, user)` add:

```python
    _settle(proposal, user)
```

- [ ] **Step 5: The decisions**

Create `services/work/deciding.py`:

```python
"""Deciding a recommendation (Work round §2.3): assign it, which makes the
task, or dismiss it with a reason. The caller has already checked who may
decide (`rec_access.decided_as`) and that they may open the record.

Each decision runs under row locks and re-reads the status there, so of two
deciders the first wins and the second gets `AlreadyDecided` (409, naming
who decided). An AI-agent recommendation is decided through its proposal
(`metrics.proposals.approve`/`reject`): exactly one task, and Brain's
Waiting on you agrees. Its proposal's row is locked before the
recommendation's, the order Brain's decision route takes."""

from django.db import transaction
from django.utils import timezone

from services.customers.models import Task
from services.customers.task_access import assignee_for
from services.customers.task_changes import add_task

from .defaults import default_due, default_priority, describe
from .models import Recommendation
from .rec_access import RELATED

S = Recommendation.Status
REASON = Recommendation.DismissReason


class AlreadyDecided(Exception):
    """The recommendation is no longer open; `recommendation` says how."""

    def __init__(self, recommendation):
        super().__init__(recommendation.status)
        self.recommendation = recommendation


def _locked(pk):
    proposal_id = Recommendation.objects.filter(pk=pk).values_list("proposal_id", flat=True).first()
    if proposal_id is not None:
        from services.metrics.models import Proposal

        # the proposal's row first: the order Brain's ProposalDecisionView takes
        list(Proposal.objects.select_for_update().filter(pk=proposal_id))
    # `of=("self",)`: the related joins are nullable (LEFT OUTER), and
    # Postgres refuses FOR UPDATE on their side.
    return (
        Recommendation.objects.select_for_update(of=("self",))
        .select_related(*RELATED, "task")
        .get(pk=pk)
    )


def _settled(rec):
    """`rec`, settled first if it is an AI agent's whose proposal was decided
    elsewhere while it stayed open here (that settle is kept even though
    this decision then refuses)."""
    if rec.status == S.OPEN and rec.proposal_id is not None:
        proposal = rec.proposal
        if proposal.status != proposal.Status.PROPOSED:
            from .recommend import settle_for_proposal

            settle_for_proposal(proposal, proposal.decided_by)
            rec = Recommendation.objects.select_related(*RELATED, "task").get(pk=rec.pk)
    return rec


def assign(reader, pk, *, assignee_id, today, title=None, due_date=None, priority=None):
    """Make the recommendation's task for `assignee_id` and mark it
    assigned. Returns the recommendation, its `task` set. Raises
    AlreadyDecided (after the lock is released) when it is not open."""
    with transaction.atomic():
        rec = _settled(_locked(pk))
        if rec.status == S.OPEN:
            return _assign(reader, rec, assignee_id, today, title, due_date, priority)
    raise AlreadyDecided(rec)


def _assign(reader, rec, assignee_id, today, title, due_date, priority):
    record = rec.record
    # SOC2:AUTH-02 the task goes only to an active member who can open its record
    assignee = assignee_for(reader.organisation_id, assignee_id, record)
    facts = [str(fact) for fact in (rec.why or {}).get("facts", [])]
    title = title or rec.title
    due = due_date or default_due(rec, today)
    priority = priority or default_priority(rec)
    if rec.proposal_id is not None:
        from services.metrics.proposals import approve

        # approve() makes the one task and settles this recommendation
        approve(
            rec.proposal,
            reader,
            assignee=assignee,
            title=title,
            due_date=due,
            priority=priority,
            description=describe(facts),
            facts=facts,
            event_data={"recommendation": rec.pk},
        )
        return Recommendation.objects.select_related(*RELATED, "task").get(pk=rec.pk)
    task = add_task(
        parent=record,
        title=title,
        due_date=due,
        priority=priority,
        assignee=assignee,
        created_by=reader,
        actor=reader,
        source=Task.Source.RECOMMENDATION,
        description=describe(facts),
        facts=facts,
        event_data={"recommendation": rec.pk},
    )
    rec.status, rec.task = S.ASSIGNED, task
    rec.decided_by, rec.decided_at = reader, timezone.now()
    rec.save(update_fields=["status", "task", "decided_by", "decided_at"])
    return rec


def dismiss(reader, pk, *, reason, note=""):
    """Mark the recommendation dismissed with `reason` (and `note` for
    "other"); an AI agent's also rejects its proposal. Raises AlreadyDecided
    (after the lock is released) when it is not open."""
    with transaction.atomic():
        rec = _settled(_locked(pk))
        if rec.status == S.OPEN:
            rec.status = S.DISMISSED
            rec.dismiss_reason = reason
            rec.dismiss_note = note.strip() if reason == REASON.OTHER else ""
            rec.decided_by, rec.decided_at = reader, timezone.now()
            rec.save(
                update_fields=[
                    "status",
                    "dismiss_reason",
                    "dismiss_note",
                    "decided_by",
                    "decided_at",
                ]
            )
            if rec.proposal_id is not None:
                from services.metrics.proposals import reject

                label = REASON(reason).label
                note_for_brain = f"{label}: {rec.dismiss_note}" if rec.dismiss_note else label
                # Already dismissed here, so reject's own settle finds nothing open.
                reject(rec.proposal, reader, note_for_brain)
            return rec
    raise AlreadyDecided(rec)
```

In `services/work/recommendations.py`, add `from .models import Recommendation` to the imports and append:

```python
def decided_payload(rec):
    return {
        "id": rec.pk,
        "status": rec.status,
        "decided_by": person(rec.decided_by),
        "decided_at": None if rec.decided_at is None else _stamp(rec.decided_at),
        "task_id": rec.task_id,
        "dismiss_reason": rec.dismiss_reason,
        "dismiss_note": rec.dismiss_note,
    }


def already_decided(rec):
    """The 409 body: who decided first, or that it expired."""
    if rec.status == Recommendation.Status.EXPIRED:
        detail = "This recommendation has expired."
    elif rec.decided_by is None:
        detail = f"This recommendation was already {rec.status}."
    else:
        detail = f"{rec.decided_by.name} already {rec.status} this."
    return {"code": "ALREADY_DECIDED", "detail": detail, "recommendation": decided_payload(rec)}
```

- [ ] **Step 6: The decision routes**

In `services/work/views.py`, change the imports: add `from rest_framework import serializers, status` (replacing `from rest_framework import status`), `from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError`, `from services.customers.models import Task`, `from services.customers.task_payloads import ROW_RELATED, task_row`, `from services.customers.task_views import CHOOSE_ASSIGNEE, CHOOSE_DATE, CHOOSE_PRIORITY, LONG_TITLE, NO_TITLE`, add `deciding` to `from . import ...`, change `from .models import WorkSettings` to `from .models import Recommendation, WorkSettings`, and `from .rec_access import SCOPES, decided_as, default_scope, openable`. Then append:

```python
NO_SUCH_RECOMMENDATION = "No such recommendation."
CANT_DECIDE = "You can't decide this recommendation."
CHOOSE_REASON = "Choose already handled, not relevant, wrong person or other."
SAY_WHY = "Say why."
LONG_NOTE = "Keep the note under 255 characters."


class AssignSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_ASSIGNEE,
            "invalid": CHOOSE_ASSIGNEE,
            "null": CHOOSE_ASSIGNEE,
            "max_string_length": CHOOSE_ASSIGNEE,
        }
    )
    title = serializers.CharField(
        required=False,
        max_length=255,
        error_messages={
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    due_date = serializers.DateField(
        required=False,
        error_messages={"invalid": CHOOSE_DATE, "null": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )


class DismissSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(
        choices=Recommendation.DismissReason.choices,
        error_messages={
            "required": CHOOSE_REASON,
            "invalid_choice": CHOOSE_REASON,
            "null": CHOOSE_REASON,
        },
    )
    note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
        error_messages={"max_length": LONG_NOTE},
    )

    def validate(self, data):
        if (
            data["reason"] == Recommendation.DismissReason.OTHER
            and not data.get("note", "").strip()
        ):
            raise ValidationError({"note": [SAY_WHY]})
        return data


def _decider(request, pk):
    """404 for a recommendation outside the workspace or about a record the
    caller cannot open, then 403 for one they may not decide: before
    anything about it is read or changed. Returns how they decide it."""
    rows = Recommendation.objects.filter(organisation_id=request.user.organisation_id, pk=pk)
    # SOC2:AUTH-02 a recommendation about a record the caller can't open reads as missing
    rec = openable(request.user, rows).first()
    if rec is None:
        raise NotFound(NO_SUCH_RECOMMENDATION)
    role = decided_as(request.user, rec)
    if role is None:
        raise PermissionDenied({"code": "CANT_DECIDE", "detail": CANT_DECIDE})
    return role


class RecommendationAssignView(APIView):
    """POST /api/v1/work/recommendations/<id>/assign/ — make its task."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        role = _decider(request, pk)
        body = AssignSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            rec = deciding.assign(
                request.user,
                pk,
                assignee_id=data["assignee_id"],
                today=today_for(request.user.organisation),
                title=data.get("title"),
                due_date=data.get("due_date"),
                priority=data.get("priority"),
            )
        except deciding.AlreadyDecided as exc:
            return Response(
                recommendations.already_decided(exc.recommendation),
                status=status.HTTP_409_CONFLICT,
            )
        audit.record(
            "work.recommendation_assign",
            request=request,
            target=rec,
            target_repr=f"Recommendation {rec.pk}",
            metadata={"kind": rec.kind, "decided_as": role, "task": rec.task_id},
        )
        task = Task.objects.select_related(*ROW_RELATED).get(pk=rec.task_id)
        return Response(
            {"recommendation": recommendations.decided_payload(rec), "task": task_row(task)},
            status=status.HTTP_201_CREATED,
        )


class RecommendationDismissView(APIView):
    """POST /api/v1/work/recommendations/<id>/dismiss/ — with a reason."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        role = _decider(request, pk)
        body = DismissSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            rec = deciding.dismiss(
                request.user, pk, reason=data["reason"], note=data.get("note", "")
            )
        except deciding.AlreadyDecided as exc:
            return Response(
                recommendations.already_decided(exc.recommendation),
                status=status.HTTP_409_CONFLICT,
            )
        audit.record(
            "work.recommendation_dismiss",
            request=request,
            target=rec,
            target_repr=f"Recommendation {rec.pk}",
            metadata={"kind": rec.kind, "decided_as": role, "reason": rec.dismiss_reason},
        )
        return Response({"recommendation": recommendations.decided_payload(rec)})
```

In `services/work/urls.py`, add to `urlpatterns`:

```python
(
    path(
        "recommendations/<int:pk>/assign/",
        views.RecommendationAssignView.as_view(),
        name="work-recommendation-assign",
    ),
)
(
    path(
        "recommendations/<int:pk>/dismiss/",
        views.RecommendationDismissView.as_view(),
        name="work-recommendation-dismiss",
    ),
)
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_deciding services.work.tests.test_deciding_race --parallel --noinput`
Expected: PASS (26 tests).

- [ ] **Step 8: Run the proposals' and Brain's suites (`approve` and `reject` changed)**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.metrics services.brain services.work --parallel --noinput`
Expected: PASS.

- [ ] **Step 9: Lint**

Run: `venv/bin/ruff format services/work services/metrics && venv/bin/ruff check services/work services/metrics`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add services/work/deciding.py services/work/recommend.py services/work/recommendations.py services/work/views.py services/work/urls.py services/metrics/proposals.py services/work/tests/test_deciding.py services/work/tests/test_deciding_race.py
git commit -m "feat(work): assign or dismiss a recommendation; the AI agent's through its proposal

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Privacy, the query-shape guard, end to end over HTTP, and the docs

**Files:**
- Create: `services/work/tests/test_recommend_privacy.py`
- Modify: `services/work/tests/test_queries.py`
- Create: `e2e/test_work_recommended_flow.py`
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`

**Interfaces:**
- Consumes every route and module above; the e2e test uses real HTTP only (`e2e.http`).

- [ ] **Step 1: Write the privacy tests**

Create `services/work/tests/test_recommend_privacy.py`:

```python
"""Counted, not named (spec §4, §6): for a member, a manager, a view-all
reader, a Leadership reader, someone suggested but not deciding, and someone
from another workspace, no Recommended response names a record they cannot
open, and the decision routes treat such a recommendation as missing.

Mona was made the recipient of a recommendation about Dana's Taco West
(routed before she lost access): she sees it counted, never named. Only
Alice (view-all) may open and decide it."""

import json

from services.work.tests.recommend_fixtures import RecommendFixture

URL = "/api/v1/work/recommendations/"
SECRET = "Taco West"


class RecommendPrivacyTests(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough_rec = cls.make_rec(on=cls.dough, recipient=cls.mona, suggested=cls.csm)
        cls.pizza_rec = cls.make_rec(on=cls.pizza, recipient=cls.csm, suggested=cls.csm)
        cls.west_rec = cls.make_rec(
            on=cls.west,
            recipient=cls.mona,
            suggested=cls.other,
            title="Prepare Taco West's renewal",
        )
        cls.loose_rec = cls.make_rec(on=cls.loose, recipient=cls.admin)

    def read(self, reader, scope):
        body = self.ok(reader, f"{URL}?scope={scope}")
        return body["count"], body["hidden"], json.dumps(body)

    def test_each_reader_sees_what_they_may_decide_and_open(self):
        expected = [
            # reader, (me: count, hidden), (team: count, hidden)
            (self.csm, (1, 0), (1, 0)),
            (self.mona, (1, 1), (2, 1)),
            (self.admin, (1, 0), (4, 0)),
            (self.lee, (0, 0), (0, 0)),
            (self.other, (0, 0), (0, 0)),
            (self.stranger, (0, 0), (0, 0)),
        ]
        for reader, me, team in expected:
            with self.subTest(reader=reader.name):
                self.assertEqual(self.read(reader, "me")[:2], me)
                self.assertEqual(self.read(reader, "team")[:2], team)

    def test_nobody_who_cannot_open_taco_west_reads_its_name(self):
        for reader in (self.csm, self.mona, self.lee, self.other, self.stranger):
            for scope in ("me", "team"):
                with self.subTest(reader=reader.name, scope=scope):
                    self.assertNotIn(SECRET, self.read(reader, scope)[2])
        self.assertIn(SECRET, self.read(self.admin, "team")[2])

    def test_the_decision_routes_treat_it_as_missing(self):
        actions = (
            ("assign", {"assignee_id": self.other.pk}),
            ("dismiss", {"reason": "not_relevant"}),
        )
        for reader in (self.mona, self.csm, self.lee, self.stranger):
            for action, body in actions:
                with self.subTest(reader=reader.name, action=action):
                    response = self.post(reader, f"{URL}{self.west_rec.pk}/{action}/", body)
                    self.assertEqual(
                        (response.status_code, response.data),
                        (404, {"detail": "No such recommendation."}),
                    )
        response = self.post(
            self.admin, f"{URL}{self.west_rec.pk}/assign/", {"assignee_id": self.other.pk}
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_dana_cannot_decide_what_only_suggests_her(self):
        # Dana can open Taco West (she owns it) but is neither its recipient nor above anyone.
        response = self.post(
            self.other, f"{URL}{self.west_rec.pk}/dismiss/", {"reason": "other", "note": "x"}
        )
        self.assertEqual(response.status_code, 403)

    def test_another_workspace_reads_nothing_of_this_one(self):
        for scope in ("me", "team"):
            text = self.read(self.stranger, scope)[2]
            for name in ("Pizza Hut", "Dough Co", "Carl CSM", "Mona Manager"):
                with self.subTest(scope=scope, name=name):
                    self.assertNotIn(name, text)
        response = self.post(self.stranger, f"{URL}{self.dough_rec.pk}/assign/", {"assignee_id": 1})
        self.assertEqual(response.status_code, 404)
        # Gus's own workspace's settings, never Acme's
        self.assertEqual(
            self.ok(self.stranger, "/api/v1/work/settings/")["recommend_to"], "manager"
        )
        self.prefer(recommend_to="owner")
        self.assertEqual(
            self.ok(self.stranger, "/api/v1/work/settings/")["recommend_to"], "manager"
        )
```

- [ ] **Step 2: Extend the query-shape guard**

In `services/work/tests/test_queries.py`, add these imports (keeping the file's import order: standard library, Django, then `services`):

```python
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from services.accounts.models import Organisation
from services.anomalies.models import Anomaly, AnomalyEvidence
from services.customers.models import HealthSnapshot, Ticket
from services.knowledge.models import Question
from services.work import prefs, recommendations
from services.work.models import Recommendation
from services.work.rec_access import SCOPES
from services.work.recommend import refresh
from services.work.tests.recommend_fixtures import task_proposal
```

(`Task` and `User` are already imported.) Then append to `QueryShapeTests`:

```python
    def test_no_distinct_in_any_recommendation_query(self):
        """Every source, the routing, the list, the settings and both
        decisions (the AI agent's included), with data behind every source."""
        now = timezone.now()
        Ticket.objects.create(
            customer=self.taco,
            ticket_number="TKT-1",
            title="Down",
            assignee_name="Support",
            priority="high",
            opened_at=self.today,
        )
        HealthSnapshot.objects.create(
            customer=self.pizza,
            captured_on=self.today - timedelta(days=20),
            health_score=Decimal("9.0"),
        )
        question = Question.objects.create(
            organisation=self.org,
            customer=self.pizza,
            asked_by=self.admin,
            assignee=self.csm,
            text="Why?",
        )
        Question.objects.filter(pk=question.pk).update(created_at=now - timedelta(days=4))
        anomaly = Anomaly.objects.create(
            organisation=self.org, title="Logins", first_seen_at=now, last_seen_at=now
        )
        AnomalyEvidence.objects.create(
            anomaly=anomaly,
            organisation=self.org,
            kind="ticket",
            record_id=1,
            customer=self.pizza,
            snippet="x",
            occurred_at=now,
        )
        task_proposal(self.org, self.dough)
        organisation = Organisation.objects.get(pk=self.org.pk)
        admin = self.as_user(User.objects.get(pk=self.admin.pk))
        with CaptureQueriesContext(connection) as queries:
            result = refresh(organisation, today=self.today)
            for reader in (self.csm, self.mona, self.admin, self.lee):
                reader = User.objects.get(pk=reader.pk)
                for scope in SCOPES:
                    recommendations.build(reader, scope, today=self.today)
                prefs.payload(prefs.settings_for(organisation), reader)
            plain = Recommendation.objects.filter(status="open", proposal__isnull=True)
            first, second = plain.order_by("id")[:2]
            assigned = admin.post(
                f"/api/v1/work/recommendations/{first.pk}/assign/",
                {"assignee_id": first.suggested_assignee_id or self.admin.pk},
                format="json",
            )
            dismissed = admin.post(
                f"/api/v1/work/recommendations/{second.pk}/dismiss/",
                {"reason": "not_relevant"},
                format="json",
            )
            agent = Recommendation.objects.get(kind="agent")
            approved = admin.post(
                f"/api/v1/work/recommendations/{agent.pk}/assign/",
                {"assignee_id": self.csm.pk},
                format="json",
            )
        self.assertEqual(result.failed, [])
        self.assertEqual(
            set(Recommendation.objects.values_list("kind", flat=True)),
            {
                "renewal_due",
                "health_drop",
                "urgent_tickets",
                "overdue_tasks",
                "open_questions",
                "anomaly",
                "agent",
            },
        )
        self.assertEqual(
            (assigned.status_code, dismissed.status_code, approved.status_code), (201, 200, 201)
        )
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
```

- [ ] **Step 3: Run the privacy and query-shape tests**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work.tests.test_recommend_privacy services.work.tests.test_queries --parallel --noinput`
Expected: PASS (5 privacy tests; 3 query-shape tests). These are guards over Tasks 1–7: if one fails, the fault is in the module the failing query or body comes from, not in the test.

- [ ] **Step 4: Write the end-to-end test**

Create `e2e/test_work_recommended_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl reports to Mona and owns Pizza Hut, which renews in 10 days. Alice (the
admin) tunes Settings › Work and runs the recommender; Mona is told, finds
the recommendation in Recommended and assigns it to Carl with the suggested
date; a second decision is refused with her name; Carl is told, finds the
task in Today with why it was recommended, and marks it done; the next run
does not recommend the same renewal again. Dana, on another branch, sees
none of it."""

from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer


class WorkRecommendedFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def notes(self, token, kind):
        status, body = http_get(self.api("/notifications/"), token=token)
        self.assertEqual(status, 200, body)
        return [n for n in body if n["kind"] == kind]

    def test_full_flow(self):
        # 1. The workspace, its people and Carl's book.
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
        alice = body["access"]
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        self.member(alice, "Dana CSM", "dana@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        today = timezone.localdate()
        Customer.objects.create(
            organisation=mona.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
            renewal_date=today + timedelta(days=10),
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl", "dana")}

        # 2. Settings › Work: everyone reads them, only Alice changes them.
        status, body = http_get(self.api("/work/settings/"), token=tokens["carl"])
        self.assertEqual((status, body["can_edit"], body["recommend_to"]), (200, False, "manager"))
        change = {"sources": {"health_drop": {"enabled": False}}}
        status, _ = http_patch(self.api("/work/settings/"), change, token=tokens["carl"])
        self.assertEqual(status, 403)
        status, body = http_patch(self.api("/work/settings/"), change, token=alice)
        self.assertEqual((status, body["sources"]["health_drop"]["enabled"]), (200, False))

        # 3. Run now: one renewal, told to Mona.
        status, _ = http_post(self.api("/work/recommendations/refresh/"), {}, token=tokens["carl"])
        self.assertEqual(status, 403)
        status, body = http_post(self.api("/work/recommendations/refresh/"), {}, token=alice)
        self.assertEqual((status, body["created"], body["notified"]), (200, 1, 1))
        [note] = self.notes(tokens["mona"], "recommendations_waiting")
        self.assertEqual(
            (note["message"], note["link"]),
            ("Revenact recommends “Prepare Pizza Hut's renewal”.", "/work/recommended"),
        )

        # 4. Mona's Recommended; Dana's is empty.
        status, body = http_get(self.api("/work/recommendations/"), token=tokens["mona"])
        self.assertEqual(
            (status, body["scope"], body["count"], body["hidden"]), (200, "team", 1, 0)
        )
        [item] = body["items"]
        self.assertEqual((item["kind"], item["suggested_assignee"]["id"]), ("renewal_due", carl.pk))
        self.assertTrue(item["suggested_assignee"]["can_open"])
        due = (today + timedelta(days=3)).isoformat()
        self.assertEqual(
            item["defaults"],
            {"title": "Prepare Pizza Hut's renewal", "due_date": due, "priority": "high"},
        )
        status, body = http_get(self.api("/work/recommendations/"), token=tokens["dana"])
        self.assertEqual((body["count"], body["hidden"]), (0, 0))

        # 5. Mona assigns it to Carl; Alice is too late.
        assign = self.api(f"/work/recommendations/{item['id']}/assign/")
        status, body = http_post(
            assign,
            {"assignee_id": carl.pk, "due_date": item["defaults"]["due_date"]},
            token=tokens["mona"],
        )
        self.assertEqual((status, body["recommendation"]["status"]), (201, "assigned"))
        task_id = body["task"]["id"]
        status, body = http_post(assign, {"assignee_id": carl.pk}, token=alice)
        self.assertEqual(
            (status, body["code"], body["detail"]),
            (409, "ALREADY_DECIDED", "Mona Manager already assigned this."),
        )

        # 6. Carl is told, finds it in Today, and reads why.
        [note] = self.notes(tokens["carl"], "task_assigned")
        self.assertEqual(note["link"], f"/work/today?task={task_id}")
        status, body = http_get(self.api("/work/today/"), token=tokens["carl"])
        self.assertEqual([r["id"] for r in body["groups"]["week"]], [task_id])
        status, body = http_get(self.api(f"/tasks/{task_id}/"), token=tokens["carl"])
        self.assertEqual(
            (body["source"], [e["kind"] for e in body["events"]]),
            ("recommendation", ["created", "recommended"]),
        )
        self.assertTrue(
            body["description"].startswith("Recommended by Revenact:\n- Renews in 10 days")
        )

        # 7. Carl finishes it; the next run does not recommend it again.
        status, _ = http_patch(
            self.api(f"/tasks/{task_id}/"), {"status": "completed"}, token=tokens["carl"]
        )
        self.assertEqual(status, 200)
        status, body = http_post(self.api("/work/recommendations/refresh/"), {}, token=alice)
        self.assertEqual((status, body["created"], body["expired"]), (200, 0, 0))
        status, body = http_get(self.api("/work/recommendations/"), token=tokens["mona"])
        self.assertEqual(body["count"], 0)
```

- [ ] **Step 5: Run it**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test e2e.test_work_recommended_flow --parallel --noinput`
Expected: PASS.

- [ ] **Step 6: API contracts**

In `docs/API_CONTRACTS.md`:

1. Replace the heading `## `work` — Work (`/work/today`, `/work/team`, the task panel)` with `## `work` — Work (`/work/today`, `/work/team`, `/work/recommended`, the task panel)`, and the line under it with `Built for the Work round's first and second deliveries (spec: react-ts-app `docs/superpowers/specs/2026-10-07-work-round-design.md` §1, §2).`
2. In that section's Event table, in the `created` row replace `` `proposal: <id>` (agent), `` with `` `proposal: <id>` (agent), `recommendation: <id>` (a task made from a recommendation), ``; in the `recommended` row replace `(delivery 2 writes these)` with `(a task made from a recommendation: its facts)`.
3. In the Segments paragraph, replace `and `task_assigned`, from tasks (see `work`);` with `` `task_assigned`, from tasks, and `recommendations_waiting`, from Work's recommender (see `work`); ``.
4. In `### `GET /api/v1/metrics/proposals/`, ...`, after `A proposal is decided once: a second decision
is a `409`.` append: ` Deciding a task proposal also settles its open recommendation in Work's Recommended (approve: assigned, linked to the task; reject: dismissed as `other` with the note, or "Rejected in Brain"), and Work's assign and dismiss on an AI-agent recommendation decide its proposal through the same `approve`/`reject` (see `work`).`
5. Insert, directly above the template heading `## `<app_name>` — <Frontend feature name>`:

````text
### Models — `Recommendation`, `WorkSettings`

`Recommendation` (`services/work/models.py`): `organisation`, `customer` (CASCADE), `account` (null; set for an account's own signal, `customer` then being its first organisation), `kind` (`renewal_due`, `health_drop`, `urgent_tickets`, `overdue_tasks`, `open_questions`, `anomaly`, `agent`), `title`, `why` (`{facts, evidence}`), `proposal` (the AI agent's; CASCADE), `suggested_assignee`, `recipient`, `status` (`open`, `assigned`, `dismissed`, `expired`), `dismiss_reason`, `dismiss_note`, `decided_by`, `decided_at`, `task` (OneToOne, SET_NULL), `signal_value`, `created_at`. One open per organisation, kind and customer when the account is null, and per organisation, kind, customer and account otherwise (both partial unique constraints leave `agent` out); one per proposal. Made, refreshed and expired by `services/work/recommend.refresh`: daily from `run_health_maintenance` (before the rules) and on `POST /work/recommendations/refresh/`.

`WorkSettings` (OneToOne `Organisation`, made the first time anyone asks): `recommend_to` (`manager`, `owner`), `sources` (per kind, see `GET /work/settings/`), `dismiss_cooldown_days` (default 14), `updated_by`, `updated_at`.
````

   and directly below it the whole body of `docs/superpowers/plans/2026-10-07-work-recommended-api.md` from `## What a recommendation is` to the end, with every `## ` heading turned into `### `, and the two headings `## Changed existing routes` and `## Notifications` turned into `### Changed existing routes (delivery 2)` and `### Notifications (delivery 2)`.

- [ ] **Step 7: Audit and data classification**

In `docs/audit-events.md`, directly below the `| `task.update` | ...` row add:

```text
| `work.recommendation_assign` | `services.work.views.RecommendationAssignView` | user | Recommendation (`target_repr` is "Recommendation <id>", never its title) | `kind`, `decided_as` (`recipient`, `chain` above the suggested person, or `company` for `view_all_accounts`), `task` |
| `work.recommendation_dismiss` | `services.work.views.RecommendationDismissView` | user | Recommendation | `kind`, `decided_as`, `reason` (`already_handled`, `not_relevant`, `wrong_person`, `other`; never the note) |
| `work.recommendations_refresh` | `services.work.views.RecommendationRefreshView` (Settings › Work › Run now) | user | — | `created`, `expired`, `failed` (source kinds) |
| `work.settings_update` | `services.work.views.WorkSettingsView` (PATCH) | user | WorkSettings | `fields` that changed |
```

In `docs/data-classification.md`, directly below the `| `customers.Task`, `customers.CalendarEvent`, `customers.Activity` | ...` row add:

```text
| `work.Recommendation`, `work.WorkSettings` | internal | recipient, suggested_assignee, decided_by | a recommendation's `title` and `why` name only its own organisation or account and counts (never another record, a ticket's, task's or question's text, or an anomaly's model-written title); read only by people who may decide it and open its record (`services/work/rec_access.py`), the rest counted. `dismiss_note` is a person's free text: treat it as confidential. The settings hold no personal data |
```

and directly below the `| Task assigned (in-app `Notification`, kind `task_assigned`) | ...` row add:

```text
| Recommendations waiting (in-app `Notification`, kind `recommendations_waiting`) | one recommendation's title (only when the recipient may open its record), else a count | internal | at most once a day, to a recommendation's recipient; links to `/work/recommended` |
```

- [ ] **Step 8: PRD, TRD, schema and implementation plan**

`docs/product/01-prd.md`: directly below the `| Work: tasks you can work | Built (backend) | ...` row add:

```text
| Work: Recommended | Built (backend) | Every day (and on Settings › Work › Run now) Revenact recommends tasks from signals across the company: renewals due, health drops, urgent tickets, overdue tasks, unanswered questions, live anomalies and the AI agent's proposals. Each lands in the suggested person's manager's queue (or theirs, by setting) with its reasons in plain sentences, and the recipient is told once a day. Assigning makes the task (its why in the description, a sensible due date, the assignee told); dismissing needs a reason and holds the signal back for a cooldown unless it gets worse. Only records the reader may open (the rest counted). Deciding an AI-agent proposal here or in Brain settles both. Settings › Work turns each source on or off and sets its threshold |
```

and add as the last row of §9 Release history:

```text
| 2026-10-07 | Work delivery 2: Recommended (backend) |
```

`docs/product/02-trd.md`: replace the `| `services/work/` | ...` row with:

```text
| `services/work/` | Work: Today, Team (Brain's scopes), the drill-down and the assignee picker, all over `openable_tasks` as `id IN` subqueries; `clock` is the one place "today" and "a working day" are decided. Recommended: `sources.py` (one rules-only function per signal over a `Book` read as `SystemActor`; no model call), `routing.py` (CS function owner → record owner → their manager in manager mode → first view-all member → workspace owner; everyone active and able to open the record), `recommend.py` (`refresh`: upsert, expire, cooldown and worsened re-raise, each source in its own transaction and failing on its own; the once-a-day `recommendations_waiting`; `settle_for_proposal`), `rec_access.py` (who decides, which a reader is shown), `deciding.py` (assign and dismiss under row locks, the proposal's before the recommendation's; an AI agent's through `metrics.proposals.approve`/`reject`). `run_health_maintenance` runs `recommend.refresh_all` before the rules |
```

`docs/product/05-backend-schema.md`: directly above `## 11. Visibility rules` (after the `### `mcp`` table and its `---`), add:

```text
### `work`

| Model | Purpose |
|---|---|
| `Recommendation` | A task Revenact recommends from a signal (renewal_due, health_drop, urgent_tickets, overdue_tasks, open_questions, anomaly, agent): `organisation`, `customer`, `account` (null), `title`, `why` JSON (facts, evidence), `proposal` (agent only), `suggested_assignee`, `recipient`, `status` (open, assigned, dismissed, expired), `dismiss_reason`, `dismiss_note`, `decided_by`, `decided_at`, `task` (OneToOne), `signal_value`. Partial uniques: one open per organisation, kind and customer (account null), one open per organisation, kind, customer and account (account set), neither for agent; one per proposal |
| `WorkSettings` | One per organisation, made lazily: `recommend_to` (manager, owner), `sources` JSON (per kind: on or off and its threshold), `dismiss_cooldown_days` |

---
```

in §11 Visibility rules, directly below the `| Tasks | ...` row add:

```text
| Recommendations | Decided by the recipient, anyone above the suggested assignee, or `view_all_accounts`; read only by them and only on a record they may open (the rest counted); routes answer 404 otherwise | `services/work/rec_access.py` |
```

and in the `Notification` row replace `task_assigned (kind ≤ 32 characters)` with `task_assigned, recommendations_waiting (kind ≤ 32 characters)`.

`docs/product/06-implementation-plan.md`: in `### C6. Notifications for the rest of the assignees`, replace `Work deliveries 2 and 3 (recommendations, nudges,
escalations, the daily digest) follow: react-ts-app` with `Work delivery 2 (2026-10-07) added Recommended and its once-a-day
`recommendations_waiting`; delivery 3 (nudges, escalations, the daily digest) follows: react-ts-app`. At the end of `### C4. Move the Ops agent's assignee rule into code`, append:

```text
On Work's Recommended (delivery 2, 2026-10-07) an AI-agent proposal is routed like any
recommendation and the decider picks the person; the agent's name only prefills it.
```

- [ ] **Step 9: Format the docs, lint, check the shards and the migrations**

Run: `venv/bin/ruff format docs/ && venv/bin/ruff format . && venv/bin/ruff format --check . && venv/bin/ruff check . && venv/bin/python scripts/ci_shard_labels.py --check 4 && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: no errors; `No changes detected`.

- [ ] **Step 10: Run the affected apps, then the whole suite, one run at a time in the foreground**

Run: `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test services.work services.customers services.metrics services.brain services.notifications services.plans services.rules e2e.test_work_recommended_flow e2e.test_work_flow --parallel --noinput`
Expected: PASS.

Run (timeout 600000 ms): `PYTHONPATH=/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/94e991f6-6b26-46ae-abdf-aa6b063dcc55/scratchpad/pylib venv/bin/python manage.py test --parallel --noinput`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add services/work/tests/test_recommend_privacy.py services/work/tests/test_queries.py e2e/test_work_recommended_flow.py docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md
git commit -m "test(work): Recommended's privacy, query shape and end to end; document it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

If `ruff format .` in Step 9 reformatted any file committed in Tasks 1–7, add those paths to this commit too (by name).

---

## Self-review

**Spec coverage:**
- §2.1 `Recommendation` (every field, the two partial unique constraints where open, plus the AI agent's per-proposal rule, Decision 1; `dismiss_note`, Decision 2) and `WorkSettings` (lazy, the exact defaults, `dismiss_cooldown_days` 14) — Task 1.
- §2.2 sources: renewal_due (within `days` or overdue), health_drop (`drop` below the reading `window_days` ago, Decision 4), urgent_tickets (support priority, ≥ `min`, Decision 5), overdue_tasks (≥ `days`, Decision 6), open_questions (≥ `days`), anomaly (live, evidence names the record), agent (pending task proposals without a decided recommendation); SystemActor reads; attention's helpers reused where the shape fits (`SUPPORT_PRIORITIES`, `RESOLVED_STATUSES`, `overdue_q`, `live_customers`) — Tasks 2–3.
- §2.2 rules: upsert (refresh facts and `signal_value`, re-route, Decision 10), create unless the cooldown and no-worse hold it back (plus open assignments, Decision 9), expire (and on a source turned off, Decision 11), idempotent, per-source failure isolation, `run_health_maintenance` before `evaluate_rules`, `POST /work/recommendations/refresh` (`manage_org_settings`), `recommendations_waiting` once a day per recipient with "3 tasks recommended for your team" — Tasks 5 and 6.
- §2.2 routing: function per kind (CS; overdue_tasks straight to the record owner; agent's named member, matched as §1.3), FunctionOwner then record owner (account owner for an account), active and can open, manager in manager mode if active and can open, else the suggested person; no suggested person → first active view-all member, else the workspace owner (Decision 12) — Task 4.
- §2.3 deciding: who (recipient, above the suggested assignee, view-all; Decision 13), `select_for_update`, 409 `ALREADY_DECIDED` naming the decider; assign (the §1.2 assignee check, source `recommendation`, description from the facts, due-date defaults, a `recommended` event with the facts, `task_assigned`), the AI agent's through `approve` with exactly one task linked (Decision 16); dismiss with the four reasons and Other's text, rejecting the proposal; the read with `hidden`; settings GET for any member, PATCH for `manage_org_settings` with validated numbers (Decision 20) — Tasks 6 and 7.
- §2.4 (backend half): Brain › Waiting on you and Recommended settle each other (`settle_for_proposal` from `approve`/`reject`) — Task 7. The rest of §2.4 is the frontend plan's, against the API contract above.
- §4 privacy: the twice-filter on the list and both routes (404), counted not named, recipient and suggested person checked at creation and on every refresh, the Assign picker's people re-checked at decision (`assignee_for`) and flagged in the list (`can_open`), the notice naming a record only to someone who may open it — Tasks 4–8.
- §5 edge cases: no owner and no manager (fallbacks; never silently dropped, `unrouted` counted and retried), two deciders at once (race tests), assigned/dismissed/expired never notified again (only new items are), daily job run twice (idempotent; constraint plus upsert) — Tasks 4, 5 and 7.
- §6 backend tests: each source at its threshold, one below and one above; open-unique, expiry, cooldown, worsened re-raise; the routing ladder and can-open checks; who decides and the two-connection race; the AI agent's exactly one task; privacy with a member, a manager, view-all, Leadership and another workspace; the no-DISTINCT test over `services/work`; an end-to-end flow — Tasks 1–8. Docs in the same PR — Task 8.
- Out of scope, by design: delivery 3's timezone, working days (`clock.add_working_days` is the seam), nudges, escalation, digest and `email_ready`; `WorkSettings` takes its fields as new columns and clients ignore unknown keys.

**Placeholder scan:** no TBD or TODO; every code step shows its code, every test step its tests; the generated migrations list the operations they must contain.

**Type and name consistency:**
- `Signal(kind, customer, account, title, facts, evidence, value, proposal=None)`, `.record`, `.key` (Task 2) are used by `routing.Router.route` (Task 4) and `recommend._apply` (Task 5); `load_book(organisation, *, today, now)` and `SOURCES` are called through `signal_sources.` in Task 5 and patched that way in its tests.
- `Router(organisation, recommend_to).route(signal) -> Route(suggested, recipient) | None` (Task 4) is used in Task 5.
- `settings_for`, `effective_sources` (Task 1) are used in Tasks 5 and 6; `payload`, `changes_from` (Task 6) only in Task 6's view.
- `refresh(organisation, *, today, now=None)`, `refresh_all(organisation=None, *, today)`, `RefreshResult.as_dict()` (Task 5) are used by Task 6's Run now and the nightly step; `settle_for_proposal(proposal, user)` (Task 7) is called from `metrics.proposals._settle` and `deciding._settled`.
- `rec_access.RELATED`, `decided_as`, `decidable`, `openable`, `SCOPES`, `default_scope` (Task 6) are used in Tasks 6–7; `defaults.default_due`, `default_priority`, `describe` (Task 6) in Task 7.
- `approve(proposal, user, note="", *, assignee, title, due_date, priority, description, facts, event_data)` (Task 7) is called positionally by `ProposalDecisionView` and by keyword from `deciding._assign`; `add_task(..., description=, facts=, event_data=)` matches delivery 1's signature.
- API names match the contract: `items`, `count`, `hidden`, `defaults`, `can_open`, `DecidedRecommendation` keys, `ALREADY_DECIDED`, `CANT_DECIDE`, `SCOPE_UNKNOWN`, the refresh counters and the settings' messages.

**Execution handoff:** Subagent-driven is recommended: one fresh subagent per task, with a review between tasks. Tasks are sequential (1 → 2 → 3 → 4 → 5 → 6 → 7 → 8); each consumes the previous names.
