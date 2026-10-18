# Dashboard redesign: structure, drill-down and the attention list

Date: 2026-09-23. Status: approved in brainstorming, awaiting spec review.
Covers projects B (how data pages connect) and C (visual redesign). Project A,
Ask Revenact on the Dashboard grounded in what is on screen, gets its own
spec once this lands; this design keeps the right-hand slot free for it.

## Why

Findings from the current Dashboard (`/dashboard/advance/*`) and the code:

1. Three stacked navigation rows before any data: section pills (Advance /
   Custom, where Custom is a placeholder div), eight tabs with leftover
   "(TT)" labels, then sub-tabs and filters.
2. Every number is a dead end. No tile, chart or row under
   `src/pages/dashboard/**` navigates anywhere.
3. The same metric lives in several places with different sources: health
   on the Health tab (`/customers/health/`), on `/health`
   (`/customers/stats/`, `/accounts/stats/`) and in the organisation metrics
   strip; ARR/NRR on both Revenue Forecast and Brain Overview.
4. Each tab is an island: its own filters in local state (reset on leaving),
   no shared period, the filter bar copy-pasted in 8 containers, a local
   `Tile` duplicated in 6 files, three separate `chartTheme.ts` files.
5. It breaks the house design rules (`.claude/skills/revenact-design`):
   saturated blue bars on the ARR bridge against a monochrome primary,
   whole tiles tinted red for decoration, per-tab chart colours.

## Decisions

| Question | Decision |
|---|---|
| Order | B + C first, then A |
| Structure | Overview + three areas: Revenue, Health, Support |
| Duplicates | One home per metric: `/health` folds into Dashboard › Health; Brain Overview keeps Brain-only panels and links its ARR/NRR to Revenue |
| Click on a number | Drill-down side panel listing the rows behind it, then "Open as a list" |
| Overview lead | "What needs attention first": ranked list, slim headline column |
| Ranking | Money at stake × urgency |
| Clearing items | Snooze per person; returns early if it worsens |
| Sub-views | Sub-tabs, one view at a time |
| Build approach | Restructure in place; keep each view's data logic and tests |

## 1. Structure and navigation

Routes (`src/App.tsx`):

- `/dashboard` → Overview.
- `/dashboard/revenue/{forecast|customers|products}`
- `/dashboard/health/{triage|divergence|movement|renewals|usage|activity|distribution}`
  (Distribution is today's `/health` page: organisations/accounts ×
  count/MRR, with its table.)
- `/dashboard/support/{tickets|topics}`
- Redirects: every `/dashboard/advance/...` path (including old filter-chip
  paths the current catch-alls handle) → its new home; `/health` →
  `/dashboard/health/distribution`; `/dashboard/custom` → `/dashboard`.

Mapping of today's tabs:

| Today | New home |
|---|---|
| Health Overview: Triage, Divergence, Movement, Controls, Renewal Date | Health › Triage, Divergence, Movement, Renewals (Controls folds into Triage's filters; the donut and by-owner bar move to Distribution) |
| Usage Overview | Health › Usage |
| Activity Tracking | Health › Activity |
| Revenue Forecast | Revenue › Forecast |
| Customer Overview | Revenue › Customers |
| Product Usage | Revenue › Products |
| Ticket Overview | Support › Tickets |
| AI Trending Topics Analysis | Support › Topics |

Header: one row with the page title and the four tabs. The row below holds
the sub-view switch (segmented control) on the left and the filter bar on the
right. The Navbar's Advance/Custom pills are removed.

Filters: Owner, Lifecycle and Account are shared and live in the URL query
string, so they survive tab switches and links are shareable. There is no
single date range, because periods differ in meaning: Forecast looks ahead
(horizon), Activity looks back (window), Tickets filters by ticket date. Each
sub-view keeps its own period control, rendered with the same component.
Tab-specific filters (Priority on Tickets; Type, Sentiment, AI Area,
Category, Subcategory, Revenue Bracket on Topics; Product on Products) stay
on their sub-view and also live in the URL.

Sidebar: Health leaves the Setup group. Brain Overview keeps the brief,
signals, questions waiting and knowledge panels; its ARR/NRR tiles link to
`/dashboard/revenue/forecast` instead of computing their own.

## 2. Overview and the attention list

Layout: a ranked "Needs attention" list (left, about 60%) and a slim column
of three headline cards (Revenue, Health, Support) linking to their areas.
The cards read the endpoints the areas use, so the Overview never disagrees
with the area it links to.

### Backend: `GET /api/v1/dashboard/attention/`

Query: `owner`, `lifecycle`, `account` (same values as the area filters).
Response: `{ items: AttentionItem[], currency }`, where

```
AttentionItem {
  key: string            // stable: "<kind>:<subject id>"
  kind: "renewal" | "risk" | "going_quiet" | "support" | "anomaly"
  title: string          // company name, or anomaly title
  reason: string         // built from fields, never model-written
  at_stake: number       // ARR in the org currency
  urgency: number        // 0.25..1.0
  score: number          // at_stake × urgency
  href: string           // where the row links (company page or anomaly)
}
```

Sorted by `score` descending, snoozed items removed, capped at 25.

| Kind | Appears when | At stake | Urgency from |
|---|---|---|---|
| renewal | renewal date within 90 days or overdue, and health below Good | account ARR | days to (or past) renewal |
| risk | Triage risk score ≥ 40 (the "Needs action now" rule) | account ARR | days to renewal, else 0.5 |
| going_quiet | no touch in 30 days (the Activity "going dark" rule) | account ARR | days since last touch |
| support | unresolved High/Urgent tickets on a company | company ARR | age of the oldest such ticket |
| anomaly | an open anomaly with evidence the viewer may read | summed ARR of its visible companies | days since first seen (fresher is more urgent) |

Urgency is 1.0 when overdue or within 14 days, falling linearly to 0.25 at
90 days. A company that qualifies for several kinds appears once per kind;
the reason line says which rule fired, e.g. "renewal 45 days overdue ·
health Average".

The rules reuse the functions the areas already use (triage risk, going
dark) rather than re-deriving them, so a company in the list is always
visible in the matching area.

Scoping (twice-filtered, per the house rule for anything that surfaces
records): companies through `visible_customers`; tickets through the
department-scoped ticket visibility; anomalies through the anomaly
`visible_evidence` helper, counting only the companies the viewer can see.
No model call is made, so there is no credit cost and no record text can
reach the reason line.

### Snooze: `AttentionSnooze`

Fields: `user`, `organisation`, `key`, `until` (null for Done),
`fingerprint` (JSON of the facts at snooze time: renewal date, health band,
ticket count, ARR, anomaly company count), `created_at`. Unique on
(`user`, `key`).

- `POST /api/v1/dashboard/attention/snooze/` `{key, days: 7}` or
  `{key, done: true}`; `DELETE .../snooze/<key>/` to undo.
- An item is hidden while snoozed, and returns early when its current facts
  are worse than the fingerprint (renewal later overdue, health band lower,
  more tickets, more ARR at stake, more companies). A Done item returns only
  when its facts change for the worse.
- Per person only. Audit event `attention.snoozed` (actor, key, days or
  done), listed in `docs/audit-events.md`. The table is classified
  **internal** in `docs/data-classification.md` (keys and fingerprints
  hold ids and numbers, no record text).

States: loading renders skeleton rows shaped like the list; empty says
"Nothing needs you right now"; an error says the list failed to load and
never renders as an empty list.

### Amendments (2026-09-24, before PR 3)

Mapping the code before planning PR 3 changed these details; where they
differ from the text above, these win.

- **One Triage score, computed on the backend.** The "Needs action now"
  score (risk ≥ 40) used to exist only in the frontend (`triage.ts`). It
  moves to `services/customers/triage.py`, is served on every
  `/customers/health/` row (`triage_score`, `triage_factors`,
  `triage_direction`), and the Triage view reads it. The attention list's
  `risk` kind uses the same function, so the tile and the list can never
  disagree.
- **Going quiet is 60 days** (the Activity rule, `GOING_DARK_DAYS =
  CONTACT_COLD_DAYS`), not 30. Never-contacted accounts count.
- **Support means unresolved High or Critical tickets** (there is no
  "Urgent" priority). Unresolved = not in `Ticket.RESOLVED_STATUSES`.
- **Anomalies are `live` ones** with evidence the viewer may read. There is
  no per-anomaly page (the Anomalies page is leadership-only), so an anomaly
  item opens the drill panel listing its visible companies instead of
  linking. Its ARR is converted to the organisation currency.
- **Urgency per kind** (1.0 = act now, 0.25 = floor):
  - renewal and risk: days to renewal; overdue or ≤ 14 days → 1.0,
    linear to 0.25 at 90 days; risk with no renewal date → 0.5; risk
    renewing after 90 days → 0.25.
  - going_quiet: never contacted → 1.0; otherwise 0.25 at 60 days,
    linear to 1.0 at 120 days.
  - support: age of the oldest matching ticket; 0.25 at 0 days, linear to
    1.0 at 14 days.
  - anomaly: days since first seen; ≤ 7 days → 1.0, linear to 0.25 at
    90 days.
- **Filters.** The attention endpoint takes the same `owner`, `lifecycle`
  and `customer` params as the areas and returns the same `filters`
  options, so the Overview renders the shared filter bar.
- **Support headline card** needs `open_count` and `oldest_open_days`,
  which `/tickets/stats/` gains in its `kpis`.

## 3. Area pages, visual system and drill-down

Shared components (under `src/pages/dashboard/shared/`):

- `DashboardFrame`: tab row, sub-view switch, filter bar, outlet, and the
  reserved right slot (used by `DrillPanel` now, by Ask Revenact in project A).
- `FilterBar`: URL-synced via `useSearchParams`; replaces 8 copies.
- `Kpi` / `KpiStrip`: four per row, hairline dividers, DM Mono with
  `tabular-nums`; semantic colour only on a number that means loss or gain.
  Replaces the 6 local `Tile`s.
- `Panel`: `bg-surface border border-line rounded-xl`; never nested.
- `DataState`: generalised from `HealthDataState` (loading, error, empty,
  truncated) and used by every sub-view.
- `chartTheme`: one file replacing three. Series in ink; danger only for
  loss, success only for gain; categorical series use ink tints plus direct
  labels, never colour alone. Tokens only, so dark mode follows.

Existing views move into their areas and are restyled with the above; their
selectors, derivations (`triage.ts`, `movement.ts`, ...) and tests stay. Fix
order per the design rules: typography (max four sizes), spacing, colour
discipline, states.

### Drill-down

Every KPI and every chart segment is a button with an accessible name
(e.g. "At risk $114.5K, show accounts"). Activating it opens `DrillPanel`:
360px on the right at ≥1024px, a full-height sheet below that; Escape
closes it and focus returns to the trigger. It lists the rows behind the
number, each linking to its company page, headed by "Open as a list".

Amended 2026-09-24 after mapping every view: a panel only opens where it
can show **the complete list** behind the number. A capped list (Forecast
`swing` and Activity `going_dark` hold the top 15, Customers
`concentration` the top 10) is never used as a drill source, because a
list shorter than its number undermines the number.

Where complete rows come from:

- **Already in the page:** Health (Triage, Divergence, Movement, Renewals,
  Distribution; `HealthDataRow`, the whole book up to 500) and Usage
  (`scatter`, every measured account). Filtered client-side.
- **From the server (`?drill=<segment>`):** Tickets (`/tickets/stats/`),
  Topics (`/interactions/stats/`), Forecast (`/customers/forecast/`: at
  risk, churn, contraction, expansion), Activity (`/customers/activity/`:
  gone quiet) and Customers (`/customers/overview/`: churned in 12
  months). Each computes the list from the same filtered set as its totals
  and intersects it with the viewer's customers; the response is
  `{drill: {segment, value_label, count, truncated, companies: [{id, name,
  owner, arr, value}]}, currency}`. A bad drill returns the normal stats.
- **Not drillable in PR 2:** pure rates and totals with no account meaning
  (touches logged, coverage, NRR, ARR today, resolution rate, average
  ticket lifetime, overdue tasks), and Products, whose payload is
  aggregate-only (its own pass later).

"Open as a list" opens the Organizations list with `?ids=` (the backend
customers list gains `ids`). Communications' `company` filter is dropped
from PR 2: every drill lists companies, so the Organizations list is the
natural destination.

The "Accounts by Last Touch" chart on Distribution drew a hard-coded curve,
not data; it is removed in PR 2.

Responsive: layouts declared for 375 / 768 / 1024 / 1440; KPI strips wrap
to 2×2; no horizontal scroll.

## 4. Delivery

Four PR pairs, backend merged before frontend:

1. Frame and restructure (frontend only): routes and redirects,
   `DashboardFrame`, `FilterBar`, shared `Kpi`/`Panel`/`DataState`/
   `chartTheme`, views moved and restyled, Distribution from `/health`,
   Sidebar and Brain Overview links.
2. Drill-down: backend `drill=` on ticket and interaction stats; frontend
   `DrillPanel` and the URL filters on Organizations and Communications.
3. Overview and attention: backend endpoint, `AttentionSnooze`, migration,
   audit event; frontend Overview page.
4. Project A, under its own spec.

Testing:

- Frontend: every old URL redirects to the right sub-view; filters survive
  tab switches and reloads; each KPI opens the right rows; the panel's focus
  and Escape behaviour; loading/empty/error per sub-view; existing view tests
  still pass after the move.
- Backend: each attention kind's rule and score; scoping (another team's
  companies, another department's tickets, unreadable anomaly evidence never
  appear); snooze is per person; an item returns when it worsens; `drill=`
  never returns a company outside the totals.
- Before/after screenshots at desktop and 375px in each PR.

Docs updated in the same PRs: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`
(frontend); PRD, schema, `docs/API_CONTRACTS.md`, `docs/audit-events.md`,
`docs/data-classification.md` (backend).

## Out of scope

Ask Revenact on the Dashboard (project A); moving body text to Lato; new
chart types; a custom dashboard builder; assigning attention items to
teammates; a single global date range.
