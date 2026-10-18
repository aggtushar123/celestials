# Dashboard attention list, frontend (PR 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Overview placeholder with the ranked "Needs attention" list (with Snooze 7 days / Done / Undo) and three headline cards, and make the Triage view read the server's Triage score.

**Architecture:** A small `features/attention` API module (no Redux slice — the list is page-local like Cockpit's tasks) feeds `Overview.tsx`. The Overview mounts the shared `DashboardToolbar` with the three shared filters, whose options come from the attention response. Headline cards read the existing `forecast`, `health` and `tickets` slices, dispatching their fetches with the same shared filters, so each card shows the same number as its area. Triage's `triage.ts` stops computing the score and uses `triageScore`/`triageFactors`/`triageDirection` from each Health row.

**Tech Stack:** React 19, TypeScript, react-router 7, Redux Toolkit, Tailwind v4 tokens, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-dashboard-redesign-design.md` §2 and its "Amendments (2026-09-24, before PR 3)". Backend contract: `revenact-backend/docs/superpowers/plans/2026-09-24-dashboard-attention-backend.md` (Global Constraints: item shape, endpoints, 25 cap).

**Branch:** `feat/dashboard-attention` off `main`. The backend PR 3a merges first.

## Global Constraints

- `GET /dashboard/attention/?owner=&lifecycle=&customer=` → `{items, currency, filters}`; `AttentionItem = {key, kind, title, reason, at_stake, urgency, score, customer_id, companies, fingerprint}`; kinds `renewal | risk | going_quiet | support | anomaly`.
- `POST /dashboard/attention/snooze/` `{key, days: 7}` or `{key, done: true}` → 201; `DELETE /dashboard/attention/snooze/<encoded key>/` → 204. Keys contain `:` — `encodeURIComponent` them in the path.
- Health rows gain `triage_score`, `triage_factors`, `triage_direction` (server-computed; the Pilot factor no longer exists).
- Ticket stats `kpis` gain `open_count` and `oldest_open_days` (nullable).
- House rules: tokens only; one monochrome primary; the at-stake figure is money at risk shown in `text-ink` (no colour), and kind tags are plain `bg-subtle` chips — severity is never colour-only; numbers `font-mono-brand tabular-nums`; at most four type sizes (11/13/15/22); no card-in-card; every interactive element has hover/focus-visible/disabled; loading skeleton shaped like the list, designed empty and error states.
- Tests per `.claude/skills/testing`; `npm run lint` 0 errors, `npx tsc -b --noEmit`, `npx vitest run`, `npm run build` pass.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Triage reads the server's score

**Files:** `src/features/health/types.ts`, `src/features/health/toHealthDataRow.ts`, `src/pages/dashboard/tabs/health-overview/triage.ts` (+ `triage.test.ts`), `testUtils.tsx` `healthRow` defaults, any test fixture building raw health payloads.

**Interfaces:**
- `HealthDataRow` gains `triageScore: number`, `triageFactors: { label: string; points: number }[]`, `triageDirection: 'declining' | 'improving' | 'flat' | 'unknown'`, mapped from `triage_score`, `triage_factors`, `triage_direction` (default 0 / [] / 'unknown' when absent so old fixtures don't crash, but tests set them).
- `triage.ts`: `scoreRow` no longer computes; it returns `{ score: row.triageScore, factors: row.triageFactors, direction: row.triageDirection, … }` keeping every other field it returns today (daysToRenewal, pulseGap, trail, etc.) so `triageDrillSets`, `summarise`, TriageQueue and the drill details are unchanged. Delete the now-unused `SEVERITY`/`WEIGHT` scoring code and constants that only served the score (keep `ACTION_THRESHOLD`, still used by the drill predicate, and anything else still referenced — check with grep).
- [ ] Step 1: update `triage.test.ts` so scoring tests become "reads the server's score and factors"; add a test that two rows ranked by server score sort correctly and ties break by name. Update fixtures (`healthRow`) to carry triage fields. Step 2: fail. Step 3: implement. Step 4: run `npx vitest run src/pages/dashboard/tabs/health-overview src/features/health` → pass (TriageView / drill tests must still pass with fixture scores). Step 5: commit `refactor(dashboard): Triage reads the score the server computes`.

---

### Task 2: The attention API module

**Files:** create `src/features/attention/attentionApi.ts`, `attentionApi.test.ts`.

**Interfaces:**
```ts
export type AttentionKind = 'renewal' | 'risk' | 'going_quiet' | 'support' | 'anomaly';
export interface AttentionItem {
  key: string; kind: AttentionKind; title: string; reason: string;
  at_stake: number; urgency: number; score: number;
  customer_id: number | null; companies: { id: number; name: string }[];
}
export interface AttentionResponse {
  items: AttentionItem[]; currency: CurrencyCode;
  filters: { owners: { value: string; name: string }[]; lifecycles: { value: string; name: string }[]; customers: { value: string; name: string }[] };
}
export function fetchAttention(query: string): Promise<AttentionResponse>;
export function snooze(key: string, choice: { days: number } | { done: true }): Promise<void>;
export function unsnooze(key: string): Promise<void>;
```
(Check the real `filters` shape returned by the backend's `forecast.filter_options` — mirror `features/forecast/forecastSlice.ts`'s filter option types.)
- [ ] Tests mock `../../lib/apiClient` (pattern: `features/requests/requestsApi.test.ts`): path with query, POST bodies for 7 days and done, DELETE path with an encoded key (`risk%3A12`). Implement, pass, commit `feat(attention): the attention API`.

---

### Task 3: The Overview page

**Files:** `src/pages/dashboard/Overview.tsx` (rewrite), `src/pages/dashboard/overview/AttentionList.tsx`, `src/pages/dashboard/overview/HeadlineCards.tsx`, tests `Overview.test.tsx` (rewrite), `overview/AttentionList.test.tsx`, `overview/HeadlineCards.test.tsx`.

**Layout and behaviour:**
- `Overview` reads the shared filters with `useDashboardFilters(SHARED_KEYS)`, builds `toQuery(values)`, fetches attention (local state: `{status:'loading'|'error'|'done', data}`; refetch on query change; keep the previous data visible while refetching). Renders `DashboardToolbar` with `subViews={[]}` and `bookFilters(data?.filters)`. Below: a two-column grid from `lg` (`lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]`), one column below.
- `AttentionList` (a `Panel` titled "Needs attention", count in the header in mono): an ordered list. Each row: kind tag (plain text chip on `bg-subtle`: Renewal / Risk / Going quiet / Support / Anomaly), title (company name → `Link` to `/organizations/<customer_id>`; anomaly → a `button` that opens the drill panel with `source: { kind: 'rows', rows: companies.map(c => ({ id: String(c.id), name: c.name })) }`, title "<anomaly title>", figure "<n> companies"), reason line (11px muted), at-stake money right-aligned (mono), and actions: "Snooze 7 days" and "Done" buttons (`min-h-9`, focus-visible). Acting removes the row optimistically and shows an inline "Snoozed · Undo" / "Marked done · Undo" line in its place for that session (Undo calls `unsnooze` and restores the row at its position); on API failure restore the row and show `role="alert"` text in the panel header area (pattern: `pages/copilot/CockpitView.tsx` handler ~L149-165).
- States: loading → 5 skeleton rows shaped like the row (no spinner); error → `ErrorState` "Could not load what needs attention." (keep showing stale items if any); empty → `Empty` "Nothing needs you right now."
- `HeadlineCards` (three `Panel`s stacked): each dispatches its area fetch with the shared filters on mount/query change — Revenue: `fetchForecast(toQuery({...values, horizon_days: '365'}))`, shows ARR today and "At risk" (`bridge.churn + bridge.contraction`) with a link "Open Revenue →" (`/dashboard/revenue` + `sharedSearch`); Health: `fetchHealthOverview()` + the shared-filter → `replaceHealthFilters` copy exactly as `HealthOverviewContainer` does (read it; clear on unmount), shows "Book at Good x/y" and "Needs action n" from `summarise(triage(rows, now))`, link "Open Health →"; Support: `fetchTicketStats(toQuery({owner, customer}))` (Tickets has no lifecycle filter), shows `open_count` and "oldest <d> days" (or "none open"), link "Open Support →". Figures use `Kpi` (no drill here). While a slice is loading show a skeleton line; on its error show "—".

- [ ] **Step 1: Failing tests:**
  - `AttentionList`: renders items in order with tag, reason and money; company title links to `/organizations/12`; anomaly title opens the drill dialog listing its companies (render inside `DrillProvider` + `DrillPanel`); "Snooze 7 days" calls `snooze(key, {days: 7})`, hides the row and shows Undo; Undo calls `unsnooze` and restores it in place; a failed snooze restores the row and shows an alert; empty and error states; skeleton while loading.
  - `HeadlineCards`: with stubbed fetches (use `src/pages/dashboard/drill/testDrill.ts` `mockFetchRouted` or a URL-routed stub), each card shows the area's figure, and the request URLs carry the shared filters (`owner=2`), Tickets without `lifecycle`.
  - `Overview`: at `/dashboard/overview?owner=2` the attention request carries `owner=2`; the toolbar renders the Primary Owner / Lifecycle / Account chips with options from the response; changing a filter refetches.
- [ ] Step 2: fail. Step 3: implement (tokens only; four type sizes; no card-in-card — rows are `divide-y` inside the one Panel). Step 4: `npx vitest run src/pages/dashboard src/features/attention` → pass. Step 5: commit `feat(dashboard): the Overview leads with what needs attention`.

---

### Task 4: Docs and verification

- [ ] Update `docs/04-app-flow.md` (Overview: the list, kinds, snooze/done/undo, headline cards, filters) and `docs/03-ui-ux-design.md` (the list row anatomy, states), and `.agents/workflows/repo-architecture.md` (`features/attention`, `pages/dashboard/overview/`).
- [ ] Full checks: `npm run lint` (0 errors), `npx tsc -b --noEmit`, `npx vitest run`, `npm run build`.
- [ ] In the running app (backend on `feat/dashboard-attention`): the list loads, a company link works, an anomaly opens the drill, Snooze and Undo work, a filter change refetches, the three cards match their areas' numbers.
- [ ] Commit docs; hand off to `finishing-a-development-branch` (backend PR 3a merges first).
