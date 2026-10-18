# Brain, delivery 3: What's being done

Delivery 3 of the Brain rethink agreed with the owner on 2026-10-05 (see
`2026-10-05-brain-what-changed-design.md` for the decisions and scopes).
Builds on deliveries 1 and 2.

The third question: **what is being done about the numbers in my scope,
and is it moving them?**

## 0. What exists

- **Initiatives** (`services/metrics` `Initiative`): `title`,
  `hypothesis`, `metric`, optional cut (`dimension`, `member`,
  `member_label`), `target_value`, `target_by`, `owner`, `status`
  planned/active/done/abandoned, `outcome`, `baseline_value`,
  `baseline_as_of` (captured at creation), `created_by`, `closed_at`.
  - `initiatives.progress()` gives `{baseline, current, target,
    progress_pct, days_left, direction, unit, better}`.
  - The serializer's `work` gives `{open, done, tasks[]}` from
    `Task.initiative`.
  - `/metrics/initiatives/` list/create/edit is `CanViewAllAccounts`.
  - Page `/brain/initiatives`.
- **Plans** (`services/plans`): `Plan` on one customer or account,
  `owner`, `status` not_started/on_track/at_risk/done/cancelled,
  `target_date`, `started_by_rule`, milestones with `done_at`. Visible
  through `visible_plans(user)`. **No starting figures are kept.**
- **Rules** (`services/rules`): `Rule.owner`, `is_active`,
  `paused_reason`, `segment`, `actions`. `RuleRun` per night (`matched`,
  `fired`, `skipped`). `payloads.runs_page()` shows the owner the full
  counts and other readers `seen_fired` only. Reading is
  `get_readable(user, pk)` (owner or shared).
- **Tasks** (`customers.Task`): `initiative`, `plan`, `milestone`,
  `assignee`, `status`, `due_date`.
- **Knowledge by function** (`KnowledgeByFunctionPanel`), Company-only,
  shown on What changed until delivery 2.

## Decisions (made for this spec; for the owner's review)

1. The page has three sections, each filtered to the scope's book:
   **Initiatives**, **Plans**, **Rules at work**.
2. **Initiatives in a scope**:
   - Me: initiatives I own, plus those cut to me (`dimension=owner`,
     `member=<me>`).
   - My team: the same for anyone on my desk.
   - Company: all of them.
3. **Anyone may start an initiative on their own book.** In Me, a new
   initiative is created with `dimension=owner`, `member=<me>` and
   `owner=<me>`; it tracks the owner cut of the chosen metric (only
   metrics with an owner cut are offered). In My team, the form asks
   which person's book it is for (me or someone below me). Company
   initiatives (whole-company or any cut) stay `view_all_accounts`. An
   initiative's owner, anyone above them, and `view_all_accounts` may
   edit it or close it.
4. **Plans keep their starting figures.** When a plan starts, it records
   the record's `health_score` and ARR (`start_figures`). The page shows
   then → now. Plans started before this delivery show "Started before
   starting figures were kept".
5. **Rules at work**: rules owned by people on the desk. Non-owners see
   the rule's name, segment, status and last night's fired count, never
   the record names (as `runs_page` already does).
6. **Knowledge by function** moves here, in the Company scope, under the
   three sections.
7. `/brain/initiatives` redirects to `/brain/doing?section=initiatives`;
   the Initiatives sidebar entry goes.

## 1. Backend

### 1.1 Models

- `Plan.start_figures` JSONField, null: `{"health_score": number|null,
  "arr": number|null, "currency": "USD", "taken_on": "2026-10-06"}`.
  Written in `plans.starting` when a plan is created (by a person or a
  rule), from the record's current health score and ARR (the ARR the
  rest of the app reads for that record). Never updated afterwards.
  Existing plans keep `null`.

### 1.2 Collecting the work (`services/brain/doing.py`)

`build(reader, scope, today) -> {initiatives, plans, rules, hidden}`.

- **Initiatives**: as in decision 2, each with `progress()` and the
  `work` counts. An initiative cut to a person shows that person's name.
- **Plans**: `visible_plans(reader)` restricted to records in the scope's
  book (Me and My team: customers/accounts owned by the desk; Company:
  all the reader can see). Status, milestones done/total, owner, target
  date, `start_figures` and the record's figures now. Open plans first
  (at_risk, on_track, not_started), then the last 30 days' done and
  cancelled.
- **Rules**: rules whose owner is on the desk, with the latest `RuleRun`.
  Full counts for the reader's own rules; `fired` only for others.
- `hidden`: plans in the scope the reader can't open (possible for
  Leadership without `view_all_accounts`) are counted, not named.
- No joins plus DISTINCT.

### 1.3 Initiatives for everyone (`services/brain/initiatives.py`)

- `POST /brain/initiatives/?scope=me|team`: body as
  `/metrics/initiatives/` minus `dimension`/`member`, plus `for_user` (My
  team only; must be the reader or in `subtree_ids(reader)`). The metric
  must have an owner cut (400 `{"detail": "That number can't be tracked
  for one person's book."}`). Creates through
  `initiatives.create_initiative`, so the baseline is captured the same
  way.
- `PATCH /brain/initiatives/<id>/`: the initiative's owner, anyone above
  them, or `view_all_accounts`; same fields and validation as today.
  Otherwise 403 `{"detail": "You can't change this initiative."}`.
- `/metrics/initiatives/` is unchanged (Company).

### 1.4 API (`/api/v1/brain/`)

- `GET doing/?scope=` (shapes in §3)
- `POST initiatives/?scope=` · `PATCH initiatives/<id>/`

### 1.5 Audit, docs

- `initiative.created` / `initiative.updated` already exist; add `scope`
  to their metadata for the new routes.
- `plan.started` gains nothing new; `start_figures` holds figures, not
  personal data.
- Docs: API_CONTRACTS, schema (`Plan.start_figures`), PRD, TRD.

## 2. Frontend

### 2.1 What's being done (`/brain/doing`, `src/pages/brain/Doing.tsx`)

- Header: `h1` "What's being done", the scope switch, section links
  (Initiatives · Plans · Rules at work), synced to `?section=`.
- **Initiatives**: one row each: title, metric (and whose book), baseline →
  now → target as a progress bar with the figures in DM Mono, days left,
  status, owner, open/done tasks. Expanding a row shows the hypothesis and
  its tasks. **New initiative** (Me and My team; Company for
  `view_all_accounts`) opens the existing initiative form, limited to
  metrics with an owner cut outside Company. Edit and close for those
  allowed.
- **Plans**: one row each: record (linked), plan name, status, milestones
  "3 of 5", target date, owner, and health and ARR then → now ("Health
  62 → 71 · ARR $40K → $44K"). Opens the plan on its record page.
- **Rules at work**: one row each: rule name (linked if readable), segment,
  status (on / paused with the reason), last night "fired 4" (and
  "matched 12 · skipped 2" for my own rules).
- Company only: **Knowledge by function** (the existing panel).
- Empty states per section ("No initiatives on your book yet." with New
  initiative; "No open plans."; "No rules running."). Skeleton, error with
  Retry, 375px, house rules.

### 2.2 Sidebar and routes

- **What's being done** (`/brain/doing`, icon `Flag`) after Waiting on
  you. Initiatives leaves the sidebar; `/brain/initiatives` redirects.
- What changed drops the Company-only `KnowledgeByFunctionPanel`.

### 2.3 Tests

- Each section in each scope, whose book an initiative is for, create in
  Me and My team (owner-cut metrics only), edit permission, plan then →
  now and the "before starting figures" line, rules counts for owner vs
  others, hidden count, the redirect, house rules, a contract stub and
  an e2e: a CSM starts an initiative on their own ARR at risk and sees it
  in their manager's My team.

## 3. API contract

### `GET doing/?scope=`

```json
{
  "scope": "me",
  "currency": "USD",
  "hidden": 0,
  "initiatives": [
    {"id": 3, "title": "Halve ARR at risk on Analytics Suite",
     "metric": "arr_at_risk", "metric_label": "ARR at risk",
     "for": {"dimension": "owner", "member": "5", "label": "Carl CSM"},
     "status": "active", "owner": {"id": 5, "name": "Carl CSM"},
     "target_by": "2026-11-30",
     "progress": {"baseline": 64100, "current": 52000, "target": 32000,
                  "progress_pct": 37.7, "days_left": 56,
                  "direction": "down", "unit": "money", "better": "down"},
     "work": {"open": 2, "done": 1},
     "can_edit": true}
  ],
  "plans": [
    {"id": 8, "name": "Renewal save play", "status": "at_risk",
     "record": {"type": "customer", "id": 6, "name": "Pizza Hut"},
     "owner": {"id": 5, "name": "Carl CSM"}, "target_date": "2026-11-01",
     "milestones": {"done": 1, "total": 4},
     "then": {"health_score": 48, "arr": 69600, "taken_on": "2026-10-06"},
     "now": {"health_score": 55, "arr": 69600}}
  ],
  "rules": [
    {"id": 3, "name": "Detractor follow-up", "segment": "Detractors",
     "is_active": true, "paused_reason": null, "mine": true,
     "last_run": {"run_on": "2026-10-05", "fired": 4,
                  "matched": 12, "skipped": 2}}
  ]
}
```

- `for` is `null` for an initiative on the whole company.
- `then` is `null` for plans started before starting figures were kept.
- `last_run.matched` and `skipped` are present only when `mine` is true;
  `last_run` is `null` before a rule's first night.

### `POST initiatives/?scope=me|team`

Body: `title`, `hypothesis`, `metric`, `target_value`, `target_by`,
`status`, and in My team `for_user`. 201 with the initiative as in
`doing/`. 400 field errors; 403 `SCOPE_NOT_ALLOWED` for Company (use
`/metrics/initiatives/`).

### `PATCH initiatives/<id>/`

The editable fields as today. 200 with the initiative; 403 as in §1.3.

## 4. Out of scope

- Linking a plan to an initiative.
- Plan figures over time (only start and now).
