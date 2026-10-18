# Brain, delivery 1: scopes and "What changed"

Agreed with the owner on 2026-10-05. The first of four deliveries that
rethink the Brain. The Brain becomes something every member uses, scoped to
their own slice, and it answers four questions: **What changed**, **Waiting
on you**, **What's being done** and **What customers are saying**. This
delivery builds the scopes every later delivery uses, and the first
question.

## 0. Why, and what exists

- **Nine Brain pages**, all on real data since 2026-09-13: Overview
  (`/brain/dashboard`), Knowledge Graph, Initiatives, Feature Requests,
  Anomalies, Review Queue, Feedback Log, Agents and Skills
  (`src/pages/brain`, routes in `BrainRoutes.tsx`, sidebar entries in
  `src/components/layout/Sidebar.tsx`).
- **The Overview** (`src/pages/brain/Dashboard.tsx`) stacks `BriefPanel`,
  `SignalsPanel`, `QuestionsWaitingPanel`, `KnowledgeByFunctionPanel`,
  `MetricLayerPanel` and `DriversPanel` (`src/components/brain`).
- **The metric layer is whole-organisation only.**
  - `services/metrics/registry.py`: 15 metrics, each read from a source
    rollup (`SOURCES`). `compute_all`, `compute_slices` and `compute_slice`
    build a `SystemActor(organisation)` and pass it to every rollup.
  - Every rollup takes a "user" and asks `services/customers/scoping.py`
    (`visible_customers`, `visible_accounts`, `live_customers`) what that
    user may see. `SystemActor` sees everything because its
    `has_capability` returns True.
  - `MetricSnapshot` holds month-end values; `dimension`/`member` are blank
    for the whole organisation and set for cuts. `recording.record_period_end`
    writes them from `run_health_maintenance`.
  - `signals.signals_for(organisation, values)`: material = 5 points or 10%,
    bad news first, drivers from the cuts' month-end rows.
  - `Brief` (one text per write, whole organisation) and `Explanation` (one
    per metric per write) are written through `get_completion` with purposes
    `brief` and `explain`.
  - Every `/api/v1/metrics/` route is gated `CanViewAllAccounts`.
- **The org chart** (`services/accounts/hierarchy.py`): `subtree_ids(user)`
  gives everyone below a person. `sees_everything(user)` wraps
  `view_all_accounts`. Pipelines already treats `view_all_accounts` **or**
  `User.Function.LEADERSHIP` as "sees the whole company"
  (`scoping.pipeline_visible_q`).
- **Already per reader** (later deliveries reuse these): Rules and their
  runs, Plans (`visible_plans`), Feature Requests and Anomalies
  (`readable_q`, `title_for`), and `/dashboard/attention/`.
- **Percent metrics can't be added up.** Net revenue retention for a team is
  not the sum of its members' figures, so a team's numbers must be
  recomputed over the team's book.

## Decisions (agreed 2026-10-05)

1. Rethink the Brain, not just restyle it.
2. **Everyone, scoped**: Me / My team / Company.
3. The Brain explains **why and what to do**; the Dashboard stays "what is".
   No duplicate number tiles.
4. Nine pages become **four questions**. The Knowledge graph is linked from
   them, not listed in the sidebar. Agents, Skills and Feedback log move to
   Settings for admins.
5. **My team** = me plus everyone below me in the reporting line.
6. Briefs: moves and signals are computed and show instantly; **Write my
   brief** asks the AI on demand, and the brief is kept until the numbers
   move or a new month-end lands.
7. Build order: (1) scopes + What changed, (2) Waiting on you, (3) What's
   being done, (4) What customers are saying.

## 1. Backend

New app `services/brain` (scope resolver, scope snapshots, views). The
`Brief` and `Explanation` changes stay in `services/metrics`.

### 1.1 Scopes (`services/brain/scope.py`)

- **Keys**: `me`, `team`, `company`. A resolved scope has a stored key:
  `me:<user id>`, `team:<user id>` or `company`.
- **Me**: customers whose `owner` is the reader, and accounts whose `owner`
  is the reader or that sit under one of those customers. Strict "my book",
  not everything the reader may open.
- **My team**: the same rule with owners = the reader plus
  `subtree_ids(reader)`. Offered only when `subtree_ids(reader)` is not
  empty.
- **Company**: the whole organisation, unassigned customers included.
  Offered only when `sees_everything(reader)` or
  `reader.function == User.Function.LEADERSHIP`.
- **Default**: the widest scope the reader has (Company, then My team, then
  Me).
- `resolve(reader, key) -> Scope` is the only constructor. It raises
  `ScopeNotAllowed` for a scope the reader can't use; views answer **403**
  with `{"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}`.
  An unknown key is **400** `{"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}`.
- `Scope` carries `key`, `stored_key`, `owner_ids` (a frozenset; `None` for
  Company), `label` ("Me", "My team", "Company") and `actor`.
- **`ScopeActor(organisation, owner_ids)`** in `services/customers/scoping.py`,
  next to `SystemActor` and built the same way (only `organisation`,
  `has_capability`, `owner_scope`). When `visible_customers` or
  `visible_accounts` receive a user with `owner_scope` set, they return the
  organisation's customers with `owner_id IN owner_scope`, and accounts with
  `owner_id IN owner_scope` or linked to one of those customers. One
  `id IN (subquery)` per way in; never a join plus `.distinct()` (#86).
- A Company scope's actor is `SystemActor(organisation)`, unchanged.
- **No view builds a `ScopeActor` itself.** A test greps the services for
  `ScopeActor(` outside `brain/scope.py` and the tests.

### 1.2 Scoped metrics

- `registry.compute_all`, `compute_slices` and `compute_slice` gain an
  optional `actor` argument; with none they build `SystemActor` as today, so
  every existing caller is unchanged.
- `brain.metrics.figures(scope)` returns `{key: value}` and the cuts for the
  scope, from one pass over the sources.
- A metric whose source has nothing to measure for the scope (for example
  usage when no customer in the book reports usage) reads `None` and shows
  "Not measured". A source that raises still raises.

### 1.3 Scope history (`services/brain/models.py`)

```
ScopeSnapshot
  organisation   FK Organisation
  scope_key      CharField(32)        "me:12" / "team:12"
  user           FK User, null, SET_NULL   the person the scope belongs to
  taken_on       DateField
  kind           CharField: month_end | baseline
  owner_ids      JSON list[int]       owners covered at that moment
  customer_ids   JSON list[int]       customers in the book at that moment
  values         JSON {metric key: number | null}
  slices         JSON {metric key: {dimension: {member: number | null}}}
  created_at     DateTimeField(auto_now_add)
  unique (organisation, scope_key, taken_on)
  index  (organisation, scope_key, -taken_on)
```

- Company keeps using `MetricSnapshot`; nothing already recorded changes.
- **Month-end**: `run_health_maintenance`, after `record_period_end`, calls
  `brain.history.record_month_end(organisation, period_end)`. It writes Me
  for every active member who owns at least one customer or account, and My
  team for every active member with reports. Existing rows for that day are
  kept, not overwritten (same rule as `MetricSnapshot`). The command prints
  the counts and the time taken.
- **Baseline on first view**: when `changed/` is asked for a Me or My team
  scope that has no row, it writes a `baseline` row for today. It runs under
  the unique constraint, so two first views at once write one row.
- **Team changed**: if the latest row's `owner_ids` differ from the scope's
  current owners, moves are not compared across the change. The response
  carries `team_changed_on` (today) and a new `baseline` row is written.
- **Deactivated members** get no new rows; their old rows stay.

### 1.4 What changed (`brain.changed.build(scope, today)`)

- **Compared against**: the scope's latest `ScopeSnapshot` (Company: the
  latest whole-organisation `MetricSnapshot` month-end, as today).
- **Signals**: `signals.signals_for` gains an optional `previous` mapping and
  `previous_slices`, so the same rule runs for a scope. Material = 5 points
  or 10%, bad news first, drivers from the cuts.
- **Handovers** (Me and My team): customers in the current book but not in
  the latest row's `customer_ids`, and the reverse. Each signal on a money
  metric (ARR, ARR at risk, expansion, churned ARR) carries
  `handover: {in: n, out: n, people: ["Dana CSM"]}` when any customer moved,
  so the page reads "includes 2 customers handed to Dana".
- **Names**: driver labels and handover names are owners, products,
  segments and lifecycle stages, never customer names. Explanations may name
  accounts (1.6).

### 1.5 Briefs per scope

- `Brief` gains `scope_key` (CharField(32), default `company`; existing rows
  become `company`) and `figures_digest` (CharField(64), blank; a SHA-256 of
  the sorted figures the prompt carried). Staleness also uses the existing
  `baseline` field.
- **Reading** `GET brief/?scope=`: the latest brief for that `scope_key` in
  the organisation. It is **stale** when the scope's current figures digest
  differs, or a newer month-end exists than its `baseline`. Stale briefs are
  still returned, with `stale: true`.
- **Writing** `POST brief/?scope=`: anyone who can use the scope.
  - Builds the prompt from the scope's figures, signals and cuts.
    - Me and My team prompts may include the scope's customers by name
      (the reader can open every one of them).
    - The Company prompt stays figures, cuts and member names only, as
      today, so one Company brief is safe for every Company reader.
  - Calls `get_completion` with purpose `brief`, recording the scope key on
    the `ModelCall`. Budget and credit accounting are unchanged. Refusals
    are today's `BriefGenerateView` ones, with the exception's own message
    as `detail`: 422 `NothingToBrief`, 429 `BudgetExceeded`, 503
    `CopilotNotConfigured`, 502 `CopilotRequestFailed` or an unusable
    answer (`ValueError`).
  - **Once at a time**: a `select_for_update` on a per-organisation lock row
    (`brain.BriefLock(organisation, scope_key)`) is held while writing. A
    second request that waited returns the brief the first one wrote if it
    is newer than the request (answer 200, not 201), rather than writing
    again.
  - On failure the previous brief stays.

### 1.6 Explanations per scope

- `Explanation` gains `scope_key` (default `company`) and `figures_digest`
  (the metric's figures and cuts the prompt carried). It is stale on the
  same two rules as a brief.
- `GET explanations/<metric>/?scope=` and `POST explanations/<metric>/?scope=`.
  Same prompt as today, built from the scope's figures, cuts and exposure
  list. The exposure list is built as the **reader** (not the scope actor)
  so it names only accounts the reader can open, plus
  `hidden: <count>` for the rest.
- Purpose `explain`, scope key on the `ModelCall`.

### 1.7 API (`/api/v1/brain/`, all `IsAuthenticated`; scope through `resolve`)

See §4 for the exact shapes.

- `GET scopes/`
- `GET changed/?scope=`
- `GET brief/?scope=` · `POST brief/?scope=`
- `GET explanations/<metric>/?scope=` · `POST explanations/<metric>/?scope=`

The `/api/v1/metrics/` routes are unchanged and stay Company-only
(`CanViewAllAccounts`); the scheduled Slack brief, the MCP server and
Initiatives use them.

### 1.8 Audit, logs, docs

- Audit (`core/audit.py`), ids and scope key only, never figures or text:
  - `brain.brief_written` (target Brief; `scope`, `stale_before` bool)
  - `brain.explanation_written` (target Explanation; `scope`, `metric`)
  - `brain.scope_baseline_recorded` (target ScopeSnapshot; `scope`,
    `reason`: `first_view` or `team_changed`)
- Logs: month-end recording counts and duration; never figures.
- Docs: API_CONTRACTS (new `brain` section), audit-events, schema
  (ScopeSnapshot, BriefLock, the two new fields), PRD, TRD, data
  classification (ScopeSnapshot holds aggregate figures and record ids:
  internal).

## 2. Frontend

### 2.1 Sidebar and routes

- The Brain group in `Sidebar.tsx` starts with **What changed**
  (`/brain`, icon `Brain`). Initiatives, Feature Requests, Anomalies and
  Review Queue keep their entries until deliveries 2–4 replace them.
- **Knowledge Graph** leaves the sidebar; `/brain/graph` still works.
- `/brain/dashboard` redirects to `/brain`.
- **Settings > AI**: three tabs join the Settings tab strip in
  `Navbar.tsx` after Agent Access: **AI usage** (`/settings/ai-usage`, the
  Agents page), **AI skills** (`/settings/ai-skills`), **AI feedback**
  (`/settings/ai-feedback`). Same pages and permissions as today
  (view-all-accounts to read; manage-org-settings to change budgets).
  `/brain/agents`, `/brain/skills` and `/brain/feedback` redirect there.
- The sidebar's Brain group is shown to every member now (today it is
  gated with the rest of the Brain). Initiatives, Feature Requests,
  Anomalies keep their current gating until replaced.

### 2.2 Scope switch (`src/components/brain/ScopeSwitch.tsx`)

- A segmented control **Me · My team · Company** with only the scopes
  `scopes/` returned; a single scope shows as a label, not a control.
  Below `sm` it is a select.
- The scope lives in the URL (`?scope=`). With no `?scope=`, the page uses
  the person's last choice (localStorage `revenact_brain_scope`, wrapped in
  try/catch), else the server's default. A stored scope the server no longer
  offers is dropped.
- A 403 `SCOPE_NOT_ALLOWED` on any Brain call drops the stored scope, moves
  to the default and shows "You no longer have access to that view."
- Every later Brain page uses this component.

### 2.3 What changed (`/brain`, `src/pages/brain/WhatChanged.tsx`)

Top to bottom:

1. **Header**: `h1` "What changed", the scope switch, and one line:
   - "Since 30 Sep month-end", or
   - "Since 5 Oct, when your view started" (baseline), or
   - "Your team changed on 12 Oct; moves start from then".
2. **Brief** (`ScopeBriefCard`):
   - A kept brief: headline, body, "Watch next", "Written 5 Oct by Alice
     Admin for My team".
   - Stale: a quiet line "The numbers have moved since this brief" and
     **Write again**.
   - None yet: **Write my brief** and "Uses AI credits." For Company:
     **Write the company brief**.
   - Writing: the button shows "Writing…" and is disabled; one request
     however fast it is clicked (`useSubmitOnce`). Errors show under the
     button with the server's text; the old brief stays.
3. **What moved** (`MovesList`): one row per signal, bad news first.
   - Metric label, then → now (DM Mono, tabular), the change with a
     direction word ("down", "up") as well as colour, and the top driver
     ("most of it: Analytics Suite").
   - Handover context: "includes 2 customers handed to Dana CSM".
   - **Why?** opens the explanation inline under the row (one open at a
     time). It shows the kept explanation if one exists for this scope,
     else **Explain this** (AI credits). "2 more accounts you can't open"
     when `hidden > 0`.
   - Empty: "Nothing moved materially since 30 Sep."
4. **Everything we measure** (`MeasureTable`): one compact table of every
   metric: name, then, now, change. `null` shows "Not measured". Small
   moves appear here even when nothing is material. On phones each row
   stacks.
5. **Company knowledge** (Company scope only, until delivery 2 moves
   questions to Waiting on you): the existing `QuestionsWaitingPanel` and
   `KnowledgeByFunctionPanel`, unchanged.

States: a skeleton matching the layout while loading; an error with
**Retry**; "You don't own any customers yet" for an empty Me, with the
switch still offering the reader's other scopes.

`MetricLayerPanel`, `SignalsPanel`, `DriversPanel` and the old
`Dashboard.tsx` are removed once nothing imports them; `BriefPanel` and
`ExplanationCard` are replaced by the scoped versions.

### 2.4 Look, house rules and tests

- House tokens only, no raw colours; DM Mono with `tabular-nums` for
  figures; at most four type sizes; no card in a card; no glass (the Ask
  rail isn't part of this round). Layout declared for 375 / 768 / 1024 /
  1440 with no horizontal scroll.
- A Brain house-rules suite (tokens, type sizes, touch targets, empty and
  error states).
- Unit and integration tests:
  - the switch, the URL and the remembered scope;
  - the 403 fallback;
  - each state: baseline, month-end, team changed, nothing moved, stale
    brief, empty Me, error;
  - Write my brief and Explain this sending once;
  - the redirects to Settings.
- A stateful contract stub for `/brain/` and an e2e journey: a manager
  switches Me → My team → Company, writes a brief, opens Why?.
- `03-ui-ux-design` and `04-app-flow` describe only what ships.

## 3. Out of scope (later deliveries)

- Waiting on you (delivery 2): rule reviews, scoped proposals, session
  decisions, questions waiting.
- What's being done (delivery 3): initiatives, plans with a start baseline,
  rules at work, tasks from proposals.
- What customers are saying (delivery 4): requests, anomalies, survey and
  sentiment rollups, the scoped Knowledge graph.
- Scoping the Slack brief and MCP server.

## 4. API contract (binding for both plans)

All under `/api/v1/brain/`, authenticated. Money values are numbers in the
organisation's currency; `currency` is given once per response.

### `GET scopes/`

```json
{
  "scopes": [
    {"key": "me", "label": "Me"},
    {"key": "team", "label": "My team"},
    {"key": "company", "label": "Company"}
  ],
  "default": "company"
}
```

Only the scopes the reader may use, narrowest first.

### `GET changed/?scope=me|team|company`

```json
{
  "scope": "team",
  "as_of": "2026-10-05",
  "since": "2026-09-30",
  "since_kind": "month_end",
  "team_changed_on": null,
  "currency": "USD",
  "empty": false,
  "metrics": [
    {"key": "arr", "label": "ARR", "unit": "money", "better": "up",
     "now": 688600, "then": 702000, "change": -13400, "material": false}
  ],
  "signals": [
    {"key": "arr_at_risk", "label": "ARR at risk", "unit": "money",
     "better": "down", "now": 114540, "then": 64090, "change": 50450,
     "improved": false,
     "drivers": [{"dimension": "product", "member": "4",
                  "label": "Analytics Suite", "change": 50450}],
     "handover": {"in": 0, "out": 2, "people": ["Dana CSM"]}}
  ]
}
```

- `since_kind`: `month_end` or `baseline`. `since` is `null` only when
  Company has no month-end yet; then every `then` is `null` and `signals` is
  empty.
- `team_changed_on`: a date when the team changed (the baseline was just
  reset), else `null`.
- `empty`: true when a Me or My team scope covers no customers.
- `handover` is present only on money metrics in Me and My team, and only
  when a customer moved.
- 400 `SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED`.

### `GET brief/?scope=`

```json
{
  "brief": {
    "id": 9, "scope": "team", "as_of": "2026-10-05",
    "baseline": "2026-09-30", "headline": "…", "body": "…",
    "watch": ["…"], "generated_at": "2026-10-05T09:12:00Z",
    "generated_by": "Alice Admin", "stale": false
  }
}
```

`brief` is `null` when none has been written for this scope.

### `POST brief/?scope=`

- 201 with the same `{"brief": …}` when it wrote one; 200 with the brief
  another request just wrote.
- 422, 429, 503 and 502 as `{"detail": "<message>"}`, with the same
  exceptions and messages as today's `POST /metrics/brief/generate/`, plus
  the scope errors. The page shows `detail` as given.

### `GET explanations/<metric>/?scope=`

```json
{
  "explanation": {
    "id": 4, "metric": "arr_at_risk", "scope": "team",
    "as_of": "2026-10-05", "text": "…",
    "evidence": ["…"], "hidden": 2,
    "generated_at": "2026-10-05T09:20:00Z", "generated_by": "Alice Admin",
    "stale": false
  }
}
```

`explanation` is `null` when none exists for this scope and metric. Unknown
metric: 404 `{"detail": "No such metric."}`.

### `POST explanations/<metric>/?scope=`

201 / 200 as for briefs; the same refusals as today's
`POST /metrics/<key>/explain/`.
