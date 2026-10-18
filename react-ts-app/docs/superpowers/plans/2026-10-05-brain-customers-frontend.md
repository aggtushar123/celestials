# Brain, delivery 4: What customers are saying (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **What customers are saying** at `/brain/customers`, open to every member and scoped **Me · My team · Company** through delivery 1's scope switch: four sections for the scope's book (**Asks**, **Anomalies**, **Scores**, **Sentiment**), section links synced to `?section=`, **See all** carrying the scope to Feature Requests and Anomalies (which gain the switch and open to every member, curation still `view_all_accounts`), the **Knowledge graph** scoped, open to every member and linked from What changed (header and a driver's product or owner) and from here; Feature Requests and Anomalies leave the sidebar so the Brain group is the four questions.

**Architecture:**
- **`src/features/brain/` (pure, unit-tested):** §3's types join `brainTypes.ts`; what the page says goes in a new `customersText.ts`; `brainText.ts` gains `graphHref` and `driverFilter`; `brainApi.ts` gains `fetchCustomers` and `fetchBrainGraph`; a tiny `scopeQuery.ts` builds `?status=&scope=` for `requestsApi` and `anomaliesApi`; the stateful contract stub `stubBrain` (`testBrain.ts`) learns `customers/`, `graph/`, and scoped `/requests/` and `/anomalies/` (list and detail) from new fixtures in `testCustomersFixtures.ts`. No Redux, as deliveries 1–3.
- **`src/features/graph/`:** the graph types move to `graphTypes.ts`; `graphSlice.ts` is deleted (Task 7) and leaves the store.
- **`src/components/brain/` (new files):** `useScopedRead` (one scoped GET with delivery 3's kept-data rule), `Figured` (figures in DM Mono inside a sentence), `CustomerLists` (`AskList`, `AnomalyList`, `SeeAll`), `ScoresPanel`, `SentimentPanel`, `CustomersSkeleton`; `styles.ts` gains `LIST`, `NONE`, `FIGURES`. `MovesList` links a driver to the graph.
- **`src/pages/brain/`:** `Customers.tsx` (new), `BrainRoutes.tsx` (`customers`; the `view_all_accounts` gate goes), `FeatureRequests.tsx` and `Anomalies.tsx` (scope, switch, notice), `Graph.tsx` (scope, switch, off Redux, URL filters, states), `WhatChanged.tsx` (graph link for everyone, scoped).
- **Elsewhere (modify):** `Sidebar.tsx`, `Navbar.tsx`, `store.ts`.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-brain-customers-design.md`. This plan covers §0 (what exists), Decisions, §2 (frontend) and §3 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror.

**The API contract** is spec §3. The backend is built in parallel in `revenact-backend` (`docs/superpowers/plans/2026-10-05-brain-customers-backend.md`, whose Contract notes and Decisions are reconciled below), so every test here runs against `stubBrain`, never a live server. The stub answers in §3's shapes and checks in the backend's order: **400 `SCOPE_UNKNOWN` before 403 `SCOPE_NOT_ALLOWED`**. No §3 field is renamed or removed; additions are optional fields only.

**Builds on deliveries 1–3, already on this branch:** `features/brain/*` (`brainTypes`, `brainScope`, `brainText` with `SAY`, `dayOf`, `Tone`; `brainApi` with `isScopeRefusal`; `waitingText` with `recordPath`; `doingText` with `withSection`; `testBrain` `stubBrain`/`requests`/`bodies`; `testBrainFixtures`, `testWaitingFixtures` with `ALICE`, `CARL`), `components/brain/` (`ScopeSwitch`, `useBrainScope` (keeps other query parameters; the 403 fallback), `LostAccessNotice`, `useDoing` (the scope-gated kept-data pattern `useScopedRead` generalises), `DoingSkeleton`, `MovesList`, `styles.ts` `TONE_CLASS`, `houseRules.test.ts`), `pages/brain/*` (`WhatChanged`, `Waiting`, `Doing`, `Graph`, `FeatureRequests`, `Anomalies`, `BrainRoutes`, `testPages.tsx` `renderBrain` with `role`, `user`, `nav`), `Sidebar.tsx`, `src/e2e/brain.test.tsx`. Reuse them: the same switch, hook, states, `ErrorBlock`/`EmptyState` and focus rules.

**Branch:** `feat/brain-customers` in `react-ts-app`, already checked out (the spec, `1d3bec9`, is its only commit over `main`). Stay on it. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions reconciled with the backend plan)

1. **`?scope=` is always sent on `customers/` and `graph/`**; pages never read before the scope settles. On `/requests/`, `/requests/<id>/`, `/anomalies/`, `/anomalies/<id>/` the pages send it once settled, after `status`: `/requests/?status=planned&scope=team`. Without `scope` those lists behave as today (backend Decision 10: an empty `?scope=` is the same as none). The stub: no scope → today's list (Company's rows for a `view_all_accounts` reader, else Me's); unknown → 400 `SCOPE_UNKNOWN`; not offered → 403 `SCOPE_NOT_ALLOWED`. Curation calls (PATCH, gather, detect, merge, move, dismiss) carry no scope.
2. **`arr` types** (backend note 1): a **number** on `customers/` (`asks.top[].arr`, `anomalies.top[].arr`), a **decimal string** on `/requests/` and `/anomalies/` (unchanged). `CustomerAsk.arr`/`CustomerAnomaly.arr` are typed `number`; the list types keep `string`. Both go through `formatCompactMoney`, so See all shows the same figure. ARR is summed as stored, not FX-converted (backend note 2); `currency` is the workspace's.
3. **A PATCH on a request or anomaly answers with the unscoped detail** (backend Decision 10). The detail panes keep their scoped figures and take only `status` (and `owner` / `acknowledged_by`) from the PATCH answer, so a status change never swaps a CSM's book figures for the company's.
4. **Ask/anomaly `status`** reuse `RequestStatus` / `AnomalyStatus` and their `STATUS_LABELS`. `top` is at most 5, in the server's order (most ARR, then most interactions, then title; backend Decision 3); `total` is the scoped list's length, so See all shows the same rows. The client never re-sorts.
5. **Scores** (backend Decisions 4–6): windows are day-aligned ("now" from the start of `today − 90` days; "then" the 90 before); the under-5 rule applies **per window**, so `now` and `then` are `null` independently. NPS is an integer; CSAT and CES are floats to two decimals (`82.35`). **CES counts organisation-level answers only** (accounts carry no CES). The change is worked out client-side, rounded to one decimal.
6. **Comments** come from the **current 90-day window only**; `hidden` counts that window's non-empty comments on records the reader can't open. A comment's `record` is `{type, id, name}` (backend note 3, `type` not `kind`); it is always present on a shown comment, but typed `WaitingRecord | null` and shown without a link when null.
7. **Sentiment**: `previous` is the contact's previous value (`'positive' | 'neutral' | ''`, blank when none was set; typed `ContactSentiment`, which also admits `'negative'`). `tracking_since` is a date (`YYYY-MM-DD`), the earliest recorded change **among contacts the reader may open**, organisation-wide (backend Decision 8), or `null` before any; with `null`, `turned_negative` is empty. A contact opens at `/contacts/<id>` (`contacts/:id?` in `App.tsx`).
8. **`graph/` adds `hidden`** (backend note 7): the scope's live customers the reader can't open, non-zero only in Company for a reader without `view_all_accounts`. Typed `hidden?: number` on `GraphPayload` (absent on `/metrics/graph/`); shown as "N more customers in this view you can't open". The payload carries no `scope`, so `useScopedRead` keys answers by the scope it asked for.
9. **Graph node ids** are `owner:<user id>`, `product:<product id>` (as `/metrics/graph/` today). A What changed driver with `dimension` `owner` or `product` has `member` = that id, so it links to `/brain/graph?scope=<s>&owner=owner%3A<id>` / `&product=product%3A<id>`. Other dimensions (segment, size band, lifecycle stage) have no node and stay words.
10. **`anomalies.top[].last_seen_at`** is ISO 8601 (backend note 8); shown as "last seen 4 Oct".

## Global Constraints

Quoted text is verbatim from the caller's brief, the spec §2, or `.claude/skills/revenact-design/SKILL.md` §1 and §4.

- **Tokens only, no raw colours.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `border-line`, and `TONE_CLASS` (`text-success` / `text-danger` / `text-ink-muted`) for a score's change only ("Semantic colours carry meaning only (status, trend, severity), never decoration").
- **DM Mono tabular-nums for figures.** Every ARR, count, score, response count and date uses `MONO` (`font-mono-brand tabular-nums`) directly or through `Figured`, wrapping the figure only, not the words around it.
- **≤4 type sizes per surface.** Only `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` in the Brain folder and `Customers.tsx`.
- **No card in a card.** "Group with `border-line`, `divide-y`, or whitespace." Each list is one bordered surface (`LIST`, `divide-y`); each row is flat inside it. The score figures are one bordered surface (`FIGURES`) and the comments list a sibling surface below it, never nested.
- **No glass on these pages.** No `rv-card-glass`, `rv-glass-inner` or `backdrop-blur`.
- **44px touch targets or `min-h-9` dense desktop controls.** Every button, link and select gets `min-h-11 sm:min-h-9` (links in rows: `min-h-11 … sm:min-h-0`, as `WaitingRow`'s `LINK`), directly or through `BUTTON`, `QUIET`, or a style constant in the same file.
- **Empty / loading (skeleton) / error states.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states."
- **375 / 768 / 1024 / 1440 with no horizontal scroll.** Headers stack below `sm`; the switch is a select below `sm`; section links and row meta wrap (`flex-wrap`); the score figures stack below `sm` (`sm:grid-cols-3`); "`min-h-[100dvh]` never `h-screen`."
- **Focus is handled.** A section link moves focus to its heading (and landing on `?section=` does so once the data is in); a lost-access notice takes focus (`LostAccessNotice`); a scope switch keeps focus on the switch (it stays mounted).
- **No stale data across a scope switch.** A switch drops to the skeleton until the new scope's answer lands (`useScopedRead`, and the lists' keys include the scope); a retry on the same scope keeps the last payload.
- **Colour is never the only signal for scores or sentiment.** A change is a sentence ("down 7 pts from +25") beside its colour; sentiment is words ("was neutral", "4 contacts negative"), never colour.
- **localStorage** stays in `features/brain/brainScope.ts` only; nothing new touches storage.
- **Lucide only**, 16px inline, every icon `aria-hidden="true"`; no emoji. The sidebar item is `MessagesSquare`; See on the graph carries `Network`.
- **Copy.** Sentence case; no em dashes in UI copy; the spec's sentences exactly: "What customers are saying", "Asks", "Anomalies", "Scores", "Sentiment", "See all", "Not enough answers", "See on the graph", "N more comments on records you can't open", "N contacts negative", "since we started tracking changes", "You no longer have access to that view."
- **Commands.** `npx vitest run`, `npm run lint` and `npm run build` pass. Never run prettier. Type-check with `npx tsc -b --noEmit`; run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; `npm run lint` must end with **0 errors and 15 warnings** (the baseline; a lower count only if a warning lived in a deleted line, named in the commit body).
- **Commits** are conventional (`feat(brain): …`, `refactor(brain): …`, `test(e2e): …`, `docs(brain): …`) and every commit message ends with a blank line and exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never push.
- **Tests** follow the `testing` skill: unit tests per module; component tests with `fetch` stubbed by `stubBrain`; page tests on the real router (`renderBrain`); jsdom journeys in `src/e2e/brain.test.tsx`; the Brain house-rules suite. Every test must be able to fail, and its title claims only what it asserts.
- **Product documents** change in the same branch and describe only what ships: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 8).

## Decisions made while planning (the owner may overrule any)

1. **No Redux.** The page reads through `useScopedRead`. The Graph moves off Redux too (it now needs the scope): its types go to `features/graph/graphTypes.ts`, `graphSlice.ts` is deleted and leaves `store.ts`.
2. **One generic hook, `useScopedRead(scope, read, onRefused, fallback)`**, for `customers/` and `graph/`, with `useDoing`'s rules: read once the scope settles and again on Try again; a slower answer for another scope is dropped; a kept answer shows only for the scope it was read for (a switch drops to the skeleton); a 403 `SCOPE_NOT_ALLOWED` goes to `onRefused`. `useDoing` is left as it is.
3. **All four sections always render**, in the spec's order. Section links set `?section=` (replace, keeping `?scope=`) and move focus to the heading, as on What's being done; `withSection` (doingText) is widened to take any key.
4. **"See on the graph" sits in the page header** (quiet link, `Network`), beside the switch, as What changed's Knowledge graph link: the graph covers the whole scope, not only sentiment.
5. **Ask and anomaly rows** are a title (`h3`) and one meta line: "Planned · $182.0K · 3 companies · 12 asks, up from 7"; "Live · $90.0K · 2 companies · last seen 4 Oct". The title is text, not a link: the full pages open a request in place, with no per-request URL. The section header shows "Top 5 of 7" when there are more, and **See all** (`BUTTON`, accessible name "See all asks" / "See all anomalies") when `total > 0`.
6. **Scores** are three figures in one bordered surface: "NPS", the figure (`formatFigure`: "+18", "82.5%") at 22px, the change ("down 7 pts from +25", "unchanged from +30", or "Too few answers before to compare"), and "22 answers · 19 before". Under 5 answers now, the figure reads "Not enough answers" and no change shows. Higher is better for all three (CES counts answers 5–7, `FIGURE_HINT`). Below, "Latest comments": "NPS 4 · Uber · 3 Oct" then the comment; "No comments in the last 90 days."; the hidden line.
7. **Sentiment**: "4 contacts negative" (15px), then the list heading "Turned negative in the last 30 days", or "Turned negative since 20 Sep, when we started tracking changes" when tracking began under 30 days ago. Rows: the contact (to `/contacts/<id>`) on the record (to the record), then "was neutral · 2 Oct". Empty: "Nobody has turned negative since we started tracking changes." when `tracking_since` is null, else "Nobody turned negative in the last 30 days."
8. **Copy for what §2.1 leaves open:** "No asks from your customers yet." / "No asks from your team's customers yet." / "No asks from customers yet."; "Nothing unusual right now."; "Could not load what customers are saying."; "1 more comment on a record you can't open"; graph: "Could not load the graph.", "No customers in this view yet", "N more customers in this view you can't open".
9. **Errors read "Try again"** through `ErrorBlock`, as deliveries 1–3 (the spec says "Retry"). Feature Requests and Anomalies keep their own "Retry".
10. **Feature Requests, Anomalies and the Knowledge graph open to every member**: See all and See on the graph must work for a CSM, and the backend already filters per reader. The `RequireCapability` block in `BrainRoutes` goes; Gather asks, Look now and the status selects keep `useCapability('view_all_accounts')`. These pages gain the switch, the notice and the scope; their existing bodies are not restyled (not in the spec) and stay outside the Brain house-rules suite, like `KnowledgeByFunctionPanel`.
11. **The graph reads `?owner=` and `?product=`** to start on a filter; a filter naming no node in this scope's graph is ignored. It gains a skeleton, an empty state, `ErrorBlock`, and the `hidden` line; the "needs the view-all-accounts capability" warning goes.
12. **What changed**: the Knowledge graph link shows for every member, to `/brain/graph?scope=<scope>`; a driver that is a product or an owner is a link "Analytics Suite" (accessible name "Analytics Suite on the knowledge graph") to the graph on that node, in the same scope.
13. **The Navbar shows "Brain" as a paragraph on `/brain/customers`**, so "What customers are saying" is the page's only `h1`.
14. **The sidebar** has What customers are saying (`MessagesSquare`, `/brain/customers`) after What's being done, for every member; Feature Requests and Anomalies leave; `canSeeAll` leaves `Sidebar.tsx`.
15. **No writes on the page**, so no `useSubmitOnce` here; the full pages' curation is unchanged.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/brain/brainTypes.ts` (modify) | §3's types: `CustomerAsk`, `CustomerAnomaly`, `Ranked`, `ScoreFigure`, `ScoreComment`, `CustomerScores`, `ContactSentiment`, `TurnedNegative`, `CustomerSentiment`, `CustomersPayload` |
| `src/features/brain/customersText.ts` (+test) (new) | `CS` sentences, sections, row meta, See all, scores, comments, sentiment lines |
| `src/features/brain/brainText.ts` (+test) (modify) | `GraphFilter`, `driverFilter`, `graphHref`; graph copy in `SAY` (Task 7) |
| `src/features/brain/doingText.ts` (modify) | `withSection` takes any key |
| `src/features/brain/scopeQuery.ts` (new) | `withScope(path, scope?, status?)` |
| `src/features/brain/brainApi.ts` (modify) | `fetchCustomers`, `fetchBrainGraph` |
| `src/features/requests/requestsApi.ts`, `src/features/anomalies/anomaliesApi.ts` (+tests) (modify) | `scope` on list and detail reads |
| `src/features/graph/graphTypes.ts` (new), `graphSlice.ts` (Task 2 re-exports; Task 7 deletes), `filters.ts` (modify) | The graph types |
| `src/features/brain/testCustomersFixtures.ts` (new, test-only) | Payloads, list rows, graphs per scope; Carl's book |
| `src/features/brain/testBrain.ts` (+test) (modify) | `customers/`, `graph/`, scoped `/requests/` and `/anomalies/` |
| `src/components/brain/useScopedRead.ts` (+test) (new) | One scoped GET |
| `src/components/brain/Figured.tsx`, `CustomerLists.tsx` (+test), `styles.ts` (new/modify) | Figures in a sentence; asks, anomalies, See all; `LIST`, `NONE`, `FIGURES` |
| `src/components/brain/ScoresPanel.tsx`, `SentimentPanel.tsx` (+ `CustomerPanels.test.tsx`) (new) | Scores and comments; sentiment |
| `src/components/brain/CustomersSkeleton.tsx` (new), `src/pages/brain/Customers.tsx` (+test) (new) | The page |
| `src/pages/brain/BrainRoutes.tsx` (+test), `src/components/layout/Navbar.tsx` (+test) (modify) | The route, the gate gone; the title |
| `src/pages/brain/FeatureRequests.tsx`, `Anomalies.tsx` (+tests) (modify) | Scope, switch, notice |
| `src/pages/brain/Graph.tsx` (+test), `WhatChanged.tsx` (+test), `src/components/brain/MovesList.tsx` (+test), `src/store.ts` (modify) | Scoped graph; graph links |
| `src/components/layout/Sidebar.tsx` (+test), `src/components/brain/houseRules.test.ts`, `src/e2e/brain.test.tsx`, docs (modify) | Sidebar, house rules, journeys, documents |

---

### Task 1: The contract types and what the page says

Spec §3 (types), §2.1 (sections, rows, sentences); Decisions 1–5; Contract notes 2, 4–7, 9, 10; plan Decisions 3, 5–8, 12.

**Files:**
- Modify: `src/features/brain/brainTypes.ts` (append), `src/features/brain/brainText.ts` (append), `src/features/brain/doingText.ts:85`
- Create: `src/features/brain/customersText.ts`
- Test: `src/features/brain/customersText.test.ts`, `src/features/brain/brainText.test.ts`

**Interfaces:**
- Consumes: `ScopeKey`, `WaitingPerson`, `WaitingRecord`, `Driver` (`brainTypes`); `dayOf`, `Tone` (`brainText`); `formatCompactMoney`; `formatFigure`, `TYPE_LABEL` (`features/surveys/questions`); `SurveyType`; `RequestStatus`, `STATUS_LABELS` (`features/requests/types`); `AnomalyStatus`, `STATUS_LABELS` (`features/anomalies/anomaliesApi`); `CurrencyCode`.
- Produces:
  - `brainTypes.ts`: `CustomerAsk`, `CustomerAnomaly`, `Ranked<T>`, `ScoreFigure`, `ScoreComment`, `CustomerScores`, `ContactSentiment`, `TurnedNegative`, `CustomerSentiment`, `CustomersPayload`.
  - `brainText.ts`: `GraphFilter`, `driverFilter(driver) → GraphFilter | null`, `graphHref(scope, filter?) → string`.
  - `customersText.ts`: `CS`, `CustomerSectionKey`, `CUSTOMER_SECTIONS`, `customerSectionOf(param)`, `companiesText(n)`, `asksEmpty(scope)`, `askTrend(ask)`, `askMeta(ask, currency)`, `anomalyMeta(anomaly, currency)`, `seeAllHref(page, scope)`, `topText(shown, total)`, `SCORE_KINDS`, `scoreFigure(type, s)`, `scoreChange(type, s) → {text, tone} | null`, `responsesText(s)`, `commentLabel(c)`, `hiddenCommentsText(n)`, `negativeText(n)`, `wasText(previous)`, `contactPath(id)`, `turnedHeading(since, today)`, `turnedEmpty(since)`.
  - `doingText.ts`: `withSection(search: string, key: string)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/brain/customersText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CustomerAnomaly, CustomerAsk } from './brainTypes';
import {
  anomalyMeta,
  askMeta,
  asksEmpty,
  askTrend,
  commentLabel,
  contactPath,
  CS,
  customerSectionOf,
  hiddenCommentsText,
  negativeText,
  responsesText,
  scoreChange,
  scoreFigure,
  seeAllHref,
  topText,
  turnedEmpty,
  turnedHeading,
  wasText,
} from './customersText';

const SSO: CustomerAsk = { id: 2, title: 'SSO with Okta', status: 'planned', arr: 182000, companies: 3, last_90_days: 12, previous_90_days: 7 };
const SPIKE: CustomerAnomaly = { id: 4, title: 'Similar reports across 2 of your companies', status: 'live', arr: 90000, companies: 2, last_seen_at: '2026-10-04T10:00:00Z' };
const TODAY = new Date('2026-10-05T12:00:00Z');

describe('customersText (customers spec §2.1)', () => {
  it('reads a section from ?section=, and nothing else', () => {
    expect(customerSectionOf('scores')).toBe('scores');
    expect(customerSectionOf('plans')).toBeNull();
    expect(customerSectionOf(null)).toBeNull();
  });

  it('says there are no asks in the scope’s own words', () => {
    expect(asksEmpty('me')).toBe('No asks from your customers yet.');
    expect(asksEmpty('team')).toBe("No asks from your team's customers yet.");
    expect(asksEmpty('company')).toBe('No asks from customers yet.');
  });

  it('words the 90-day trend', () => {
    expect(askTrend({ last_90_days: 12, previous_90_days: 7 })).toBe('12 asks, up from 7');
    expect(askTrend({ last_90_days: 1, previous_90_days: 4 })).toBe('1 ask, down from 4');
    expect(askTrend({ last_90_days: 2, previous_90_days: 2 })).toBe('2 asks, steady');
    expect(askTrend({ last_90_days: 3, previous_90_days: 0 })).toBe('3 asks in 90 days');
    expect(askTrend({ last_90_days: 0, previous_90_days: 0 })).toBe('No asks in six months');
  });

  it('writes an ask’s and an anomaly’s meta line with the status in words', () => {
    expect(askMeta(SSO, 'USD')).toBe('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(askMeta({ ...SSO, status: 'open', arr: 40000, companies: 1, last_90_days: 2, previous_90_days: 2 }, 'USD')).toBe('Open · $40.0K · 1 company · 2 asks, steady');
    expect(anomalyMeta(SPIKE, 'USD')).toBe('Live · $90.0K · 2 companies · last seen 4 Oct');
  });

  it('opens See all in the same scope, and says Top N of M only when there are more', () => {
    expect(seeAllHref('requests', 'team')).toBe('/brain/requests?scope=team');
    expect(seeAllHref('anomalies', 'me')).toBe('/brain/anomalies?scope=me');
    expect(topText(5, 7)).toBe('Top 5 of 7');
    expect(topText(2, 2)).toBeNull();
  });

  it('shows a score, or Not enough answers under 5 (Contract note 5)', () => {
    expect(scoreFigure('nps', { now: 18, then: 25, responses: 22, previous_responses: 19 })).toBe('+18');
    expect(scoreFigure('csat', { now: 82.5, then: 80, responses: 40, previous_responses: 31 })).toBe('82.5%');
    expect(scoreFigure('ces', { now: null, then: null, responses: 3, previous_responses: 0 })).toBe(CS.NOT_ENOUGH);
  });

  it('words the change against the 90 days before, with a tone for its colour', () => {
    expect(scoreChange('nps', { now: 18, then: 25, responses: 22, previous_responses: 19 })).toEqual({ text: 'down 7 pts from +25', tone: 'bad' });
    expect(scoreChange('csat', { now: 82.5, then: 80, responses: 40, previous_responses: 31 })).toEqual({ text: 'up 2.5 pts from 80%', tone: 'good' });
    expect(scoreChange('csat', { now: 81, then: 80, responses: 9, previous_responses: 9 })).toEqual({ text: 'up 1 pt from 80%', tone: 'good' });
    expect(scoreChange('ces', { now: 72.35, then: 72.35, responses: 30, previous_responses: 25 })).toEqual({ text: 'unchanged from 72.35%', tone: 'neutral' });
    expect(scoreChange('nps', { now: 2, then: -4, responses: 6, previous_responses: 6 })).toEqual({ text: 'up 6 pts from −4', tone: 'good' });
    expect(scoreChange('nps', { now: 10, then: null, responses: 6, previous_responses: 2 })).toEqual({ text: CS.NOT_COMPARED, tone: 'neutral' });
    expect(scoreChange('nps', { now: null, then: 25, responses: 2, previous_responses: 19 })).toBeNull();
  });

  it('counts answers now and before', () => {
    expect(responsesText({ now: 18, then: 25, responses: 22, previous_responses: 19 })).toBe('22 answers · 19 before');
    expect(responsesText({ now: null, then: null, responses: 1, previous_responses: 0 })).toBe('1 answer · 0 before');
  });

  it('labels a comment and counts the hidden ones', () => {
    expect(commentLabel({ survey_type: 'nps', score: 4 })).toBe('NPS 4');
    expect(hiddenCommentsText(0)).toBeNull();
    expect(hiddenCommentsText(1)).toBe("1 more comment on a record you can't open");
    expect(hiddenCommentsText(3)).toBe("3 more comments on records you can't open");
  });

  it('words sentiment, never by colour alone', () => {
    expect(negativeText(1)).toBe('1 contact negative');
    expect(negativeText(4)).toBe('4 contacts negative');
    expect(wasText('neutral')).toBe('was neutral');
    expect(wasText('')).toBe('had no sentiment before');
    expect(contactPath(41)).toBe('/contacts/41');
  });

  it('heads the turned-negative list from when tracking started (Decision 4)', () => {
    expect(turnedHeading('2026-09-20', TODAY)).toBe('Turned negative since 20 Sep, when we started tracking changes');
    expect(turnedHeading('2026-08-01', TODAY)).toBe(CS.TURNED);
    expect(turnedHeading(null, TODAY)).toBe(CS.TURNED);
    expect(turnedEmpty(null)).toBe(CS.NOT_TRACKING);
    expect(turnedEmpty('2026-08-01')).toBe(CS.NOBODY_TURNED);
  });
});
```

Append to `src/features/brain/brainText.test.ts` (add `driverFilter, graphHref` to its existing import from `./brainText`):

```ts
describe('graph links (customers Decision 5, Contract note 9)', () => {
  it('opens the graph in a scope, on the owner or product a driver names', () => {
    expect(graphHref('me')).toBe('/brain/graph?scope=me');
    expect(graphHref('company', driverFilter({ dimension: 'product', member: '4' }))).toBe('/brain/graph?scope=company&product=product%3A4');
    expect(graphHref('team', driverFilter({ dimension: 'owner', member: '5' }))).toBe('/brain/graph?scope=team&owner=owner%3A5');
  });

  it('has no node for any other driver', () => {
    expect(driverFilter({ dimension: 'segment', member: 'enterprise' })).toBeNull();
    expect(driverFilter({ dimension: 'lifecycle', member: 'onboarding' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/brain/customersText.test.ts src/features/brain/brainText.test.ts`
Expected: FAIL — `Failed to resolve import "./customersText"` and `graphHref is not a function`.

- [ ] **Step 3: Write the types, the text and the links**

Append to `src/features/brain/brainTypes.ts` (add `import type { AnomalyStatus } from '../anomalies/anomaliesApi';`, `import type { RequestStatus } from '../requests/types';` and `import type { SurveyType } from '../surveys/surveyTypes';` to its imports):

```ts
// What customers are saying (spec 2026-10-05-brain-customers-design §3).
// Contract notes 2, 6 and 7: `arr` is a number here (a string on the lists),
// a comment's `record` and a change's `record` may be null.

export interface CustomerAsk {
  id: number;
  title: string;
  status: RequestStatus;
  /** The ARR behind it in this scope (Contract note 2). */
  arr: number;
  companies: number;
  last_90_days: number;
  previous_90_days: number;
}

export interface CustomerAnomaly {
  id: number;
  /** Gated for readers without view_all_accounts, as on /anomalies/. */
  title: string;
  status: AnomalyStatus;
  arr: number;
  companies: number;
  last_seen_at: string;
}

export interface Ranked<T> {
  total: number;
  top: T[];
}

/** `now`/`then` are null under 5 answers in their own window (Contract note 5). */
export interface ScoreFigure {
  now: number | null;
  then: number | null;
  responses: number;
  previous_responses: number;
}

export interface ScoreComment {
  survey_type: SurveyType;
  score: number;
  comment: string;
  record: WaitingRecord | null;
  answered_at: string;
}

export interface CustomerScores {
  nps: ScoreFigure;
  csat: ScoreFigure;
  ces: ScoreFigure;
  comments: ScoreComment[];
  /** This window's comments on records the reader can't open. */
  hidden: number;
}

export type ContactSentiment = 'positive' | 'neutral' | 'negative' | '';

export interface TurnedNegative {
  contact: WaitingPerson;
  record: WaitingRecord | null;
  previous: ContactSentiment;
  changed_at: string;
}

export interface CustomerSentiment {
  negative: number;
  /** The first recorded change among contacts the reader may open, or null. */
  tracking_since: string | null;
  turned_negative: TurnedNegative[];
}

/** GET customers/?scope= */
export interface CustomersPayload {
  scope: ScopeKey;
  currency: CurrencyCode;
  asks: Ranked<CustomerAsk>;
  anomalies: Ranked<CustomerAnomaly>;
  scores: CustomerScores;
  sentiment: CustomerSentiment;
}
```

Append to `src/features/brain/brainText.ts`:

```ts
/** A graph filter a link can carry (Contract note 9): one owner's or one product's node. */
export type GraphFilter = { owner: string } | { product: string };

export function driverFilter(driver: Pick<Driver, 'dimension' | 'member'>): GraphFilter | null {
  if (driver.dimension === 'owner') return { owner: `owner:${driver.member}` };
  if (driver.dimension === 'product') return { product: `product:${driver.member}` };
  return null;
}

/** The knowledge graph in a scope (customers Decision 5), optionally on one node. */
export function graphHref(scope: ScopeKey, filter: GraphFilter | null = null): string {
  return `/brain/graph?${new URLSearchParams({ scope, ...filter }).toString()}`;
}
```

In `src/features/brain/doingText.ts`, change the signature of `withSection` (line 85) to `export function withSection(search: string, key: string): string {` (the body is unchanged; plan Decision 3).

Create `src/features/brain/customersText.ts`:

```ts
// What "What customers are saying" says (spec 2026-10-05-brain-customers-design
// §2.1), in one place so the tests and the page share it.
import { STATUS_LABELS as ANOMALY_STATUS } from '../anomalies/anomaliesApi';
import type { CurrencyCode } from '../auth/authSlice';
import { formatCompactMoney } from '../customers/formatters';
import { STATUS_LABELS as REQUEST_STATUS } from '../requests/types';
import { formatFigure, TYPE_LABEL } from '../surveys/questions';
import type { SurveyType } from '../surveys/surveyTypes';
import { dayOf, type Tone } from './brainText';
import type { ContactSentiment, CustomerAnomaly, CustomerAsk, ScoreComment, ScoreFigure, ScopeKey } from './brainTypes';

export const CS = {
  TITLE: 'What customers are saying',
  SECTIONS: 'Sections',
  ASKS: 'Asks',
  ANOMALIES: 'Anomalies',
  SCORES: 'Scores',
  SENTIMENT: 'Sentiment',
  LOAD: 'Could not load what customers are saying.',
  LOADING: 'Loading what customers are saying',
  GRAPH: 'See on the graph',
  SEE_ALL: 'See all',
  SEE_ALL_ASKS: 'See all asks',
  SEE_ALL_ANOMALIES: 'See all anomalies',
  NO_ANOMALIES: 'Nothing unusual right now.',
  NOT_ENOUGH: 'Not enough answers',
  NOT_COMPARED: 'Too few answers before to compare',
  COMMENTS: 'Latest comments',
  NO_COMMENTS: 'No comments in the last 90 days.',
  TURNED: 'Turned negative in the last 30 days',
  TURNED_LIST: 'Turned negative',
  NOBODY_TURNED: 'Nobody turned negative in the last 30 days.',
  NOT_TRACKING: 'Nobody has turned negative since we started tracking changes.',
} as const;

export type CustomerSectionKey = 'asks' | 'anomalies' | 'scores' | 'sentiment';
export const CUSTOMER_SECTIONS: readonly { key: CustomerSectionKey; label: string }[] = [
  { key: 'asks', label: CS.ASKS },
  { key: 'anomalies', label: CS.ANOMALIES },
  { key: 'scores', label: CS.SCORES },
  { key: 'sentiment', label: CS.SENTIMENT },
];

export function customerSectionOf(param: string | null): CustomerSectionKey | null {
  return CUSTOMER_SECTIONS.some((s) => s.key === param) ? (param as CustomerSectionKey) : null;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const companiesText = (n: number) => count(n, 'company', 'companies');

export function asksEmpty(scope: ScopeKey): string {
  if (scope === 'me') return 'No asks from your customers yet.';
  if (scope === 'team') return "No asks from your team's customers yet.";
  return 'No asks from customers yet.';
}

/** "12 asks, up from 7" (spec §2.1). */
export function askTrend(ask: Pick<CustomerAsk, 'last_90_days' | 'previous_90_days'>): string {
  const { last_90_days: now, previous_90_days: before } = ask;
  if (now === 0 && before === 0) return 'No asks in six months';
  const asks = count(now, 'ask', 'asks');
  if (before === 0) return `${asks} in 90 days`;
  if (now === before) return `${asks}, steady`;
  return `${asks}, ${now > before ? 'up' : 'down'} from ${before}`;
}

export function askMeta(ask: CustomerAsk, currency: CurrencyCode): string {
  return [REQUEST_STATUS[ask.status], formatCompactMoney(ask.arr, currency), companiesText(ask.companies), askTrend(ask)].join(' · ');
}

export function anomalyMeta(anomaly: CustomerAnomaly, currency: CurrencyCode): string {
  return [ANOMALY_STATUS[anomaly.status], formatCompactMoney(anomaly.arr, currency), companiesText(anomaly.companies), `last seen ${dayOf(anomaly.last_seen_at)}`].join(' · ');
}

/** Decision 2: See all opens the full page in the same scope. */
export function seeAllHref(page: 'requests' | 'anomalies', scope: ScopeKey): string {
  return `/brain/${page}?scope=${scope}`;
}

export function topText(shown: number, total: number): string | null {
  return total > shown ? `Top ${shown} of ${total}` : null;
}

export const SCORE_KINDS: readonly SurveyType[] = ['nps', 'csat', 'ces'];

export function scoreFigure(type: SurveyType, s: ScoreFigure): string {
  return s.now === null ? CS.NOT_ENOUGH : formatFigure(type, s.now);
}

/** The change against the 90 days before, in words; higher is better for all three. */
export function scoreChange(type: SurveyType, s: ScoreFigure): { text: string; tone: Tone } | null {
  if (s.now === null) return null;
  if (s.then === null) return { text: CS.NOT_COMPARED, tone: 'neutral' };
  const change = Math.round((s.now - s.then) * 10) / 10;
  const from = `from ${formatFigure(type, s.then)}`;
  if (change === 0) return { text: `unchanged ${from}`, tone: 'neutral' };
  const size = Math.abs(change);
  return { text: `${change > 0 ? 'up' : 'down'} ${size} ${size === 1 ? 'pt' : 'pts'} ${from}`, tone: change > 0 ? 'good' : 'bad' };
}

export function responsesText(s: ScoreFigure): string {
  return `${count(s.responses, 'answer', 'answers')} · ${s.previous_responses} before`;
}

export function commentLabel(c: Pick<ScoreComment, 'survey_type' | 'score'>): string {
  return `${TYPE_LABEL[c.survey_type]} ${c.score}`;
}

export function hiddenCommentsText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more comment on a record you can't open" : `${n} more comments on records you can't open`;
}

export function negativeText(n: number): string {
  return `${count(n, 'contact', 'contacts')} negative`;
}

export function wasText(previous: ContactSentiment): string {
  return previous ? `was ${previous}` : 'had no sentiment before';
}

export function contactPath(id: number): string {
  return `/contacts/${id}`;
}

const DAY = 86_400_000;

/** Decision 4: until 30 days of changes are on record, the list says since when. */
export function turnedHeading(since: string | null, today: Date): string {
  if (since && today.getTime() - Date.parse(since) < 30 * DAY) return `Turned negative since ${dayOf(since)}, when we started tracking changes`;
  return CS.TURNED;
}

export function turnedEmpty(since: string | null): string {
  return since === null ? CS.NOT_TRACKING : CS.NOBODY_TURNED;
}
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run --maxWorkers=2 src/features/brain/customersText.test.ts src/features/brain/brainText.test.ts src/features/brain/doingText.test.ts && npx tsc -b --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/brain/brainTypes.ts src/features/brain/brainText.ts src/features/brain/brainText.test.ts src/features/brain/doingText.ts src/features/brain/customersText.ts src/features/brain/customersText.test.ts
git commit -m "feat(brain): What customers are saying contract types, copy and graph links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The API, the graph types and the stateful contract stub

Spec §1.2, §1.5, §3; Contract notes 1–8; plan Decision 1.

**Files:**
- Create: `src/features/brain/scopeQuery.ts`, `src/features/graph/graphTypes.ts`, `src/features/brain/testCustomersFixtures.ts`
- Modify: `src/features/brain/brainApi.ts`, `src/features/requests/requestsApi.ts`, `src/features/anomalies/anomaliesApi.ts`, `src/features/graph/graphSlice.ts`, `src/features/graph/filters.ts:1`, `src/features/brain/testBrain.ts`
- Test: `src/features/brain/testBrain.test.ts`, `src/features/requests/requestsApi.test.ts`, `src/features/anomalies/anomaliesApi.test.ts`

**Interfaces:**
- Consumes: Task 1's `CustomersPayload`; `requestRow` (`src/test/requestsFixtures`); `FeatureRequestRow`; `AnomalyRow`.
- Produces:
  - `withScope(path: string, scope?: ScopeKey, status?: string): string`.
  - `fetchCustomers(scope) → Promise<CustomersPayload>`; `fetchBrainGraph(scope) → Promise<GraphPayload>`.
  - `fetchRequests(status?, scope?)`, `fetchRequest(id, scope?)`, `fetchAnomalies(status?, scope?)`, `fetchAnomaly(id, scope?)`.
  - `graphTypes.ts`: `NodeKind`, `CustomerNode`, `GroupNode`, `InitiativeNode`, `ProposalNode`, `GraphNode`, `GraphEdge`, `GraphPayload` (with `hidden?: number`).
  - Fixtures: `ME_CUSTOMERS`, `TEAM_CUSTOMERS`, `COMPANY_CUSTOMERS`, `CARL_CUSTOMERS`, `CUSTOMERS`, `TRACKING_SINCE`, `REQUEST_ROWS`, `CARL_REQUEST_ROWS`, `anomalyRow`, `ANOMALY_ROWS`, `CARL_GRAPH`, `ME_GRAPH`, `TEAM_GRAPH`, `COMPANY_GRAPH`, `GRAPHS`, `EMPTY_GRAPH`.
  - `BrainStub` options: `customers`, `failCustomers`, `graphs`, `failGraph`, `requestRows`, `anomalyRows`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/requests/requestsApi.test.ts` inside its `describe`:

```ts
  it('names the scope after the status (customers spec §1.5)', async () => {
    await fetchRequests('all', 'team');
    expect(mocked).toHaveBeenLastCalledWith('/requests/?scope=team');
    await fetchRequests('planned', 'me');
    expect(mocked).toHaveBeenLastCalledWith('/requests/?status=planned&scope=me');
    await fetchRequest(4, 'company');
    expect(mocked).toHaveBeenLastCalledWith('/requests/4/?scope=company');
  });
```

Append to `src/features/anomalies/anomaliesApi.test.ts` inside its `describe`:

```ts
  it('names the scope after the status (customers spec §1.5)', async () => {
    await fetchAnomalies('all', 'team');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/?scope=team');
    await fetchAnomalies('live', 'me');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/?status=live&scope=me');
    await fetchAnomaly(3, 'company');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/3/?scope=company');
  });
```

Append to `src/features/brain/testBrain.test.ts` (add `fetchBrainGraph, fetchCustomers` to the `./brainApi` import, and these imports):

```ts
import { fetchAnomalies } from '../anomalies/anomaliesApi';
import { fetchRequest, fetchRequests } from '../requests/requestsApi';
import type { ScopeKey } from './brainTypes';
import { ME_GRAPH, REQUEST_ROWS, TEAM_CUSTOMERS } from './testCustomersFixtures';

describe('What customers are saying on the contract stub (customers spec §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the section data and the graph for a scope', async () => {
    const { spy } = stubBrain();
    expect(await fetchCustomers('team')).toEqual(TEAM_CUSTOMERS);
    expect(await fetchBrainGraph('me')).toEqual(ME_GRAPH);
    expect(requests(spy, 'GET', '/brain/')).toEqual(['/brain/customers/?scope=team', '/brain/graph/?scope=me']);
  });

  it('refuses an unknown scope with 400 before a scope not offered with 403', async () => {
    stubBrain({ offered: ['me'] });
    expect((await refusal(fetchRequests('all', 'galaxy' as ScopeKey)))?.status).toBe(400);
    expect((await refusal(fetchRequests('all', 'team')))?.status).toBe(403);
    expect(isScopeRefusal(await refusal(fetchAnomalies('all', 'company')))).toBe(true);
    expect(isScopeRefusal(await refusal(fetchCustomers('team')))).toBe(true);
    expect((await refusal(fetchBrainGraph('galaxy' as ScopeKey)))?.body).toEqual({ code: 'SCOPE_UNKNOWN', detail: 'Choose me, team or company.' });
  });

  it('narrows /requests/ and /anomalies/ to the scope, keeps today’s list without one, and 404s a request outside it', async () => {
    stubBrain();
    expect((await fetchRequests('all', 'team')).map((r) => r.title)).toEqual(['SSO with Okta', 'Slack alerts']);
    expect((await fetchRequests('planned', 'company')).map((r) => r.id)).toEqual([2]);
    expect(await fetchRequests()).toHaveLength(REQUEST_ROWS.company.length);
    expect((await fetchRequests('all', 'team'))[0].arr).toBe('182000');
    expect((await fetchAnomalies('all', 'team'))[0].title).toBe('Similar reports across 2 of your companies');
    expect((await fetchRequest(5, 'company')).companies_asking).toEqual([]);
    expect((await refusal(fetchRequest(5, 'team')))?.status).toBe(404);
  });

  it('fails a read on request so pages can show Try again', async () => {
    stubBrain({ failCustomers: 1, failGraph: 1 });
    expect((await refusal(fetchCustomers('me')))?.status).toBe(500);
    expect((await refusal(fetchBrainGraph('me')))?.status).toBe(500);
    expect((await fetchCustomers('me')).scope).toBe('me');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/brain/testBrain.test.ts src/features/requests/requestsApi.test.ts src/features/anomalies/anomaliesApi.test.ts`
Expected: FAIL — `Failed to resolve import "./testCustomersFixtures"` and the scope assertions (`'/requests/'` received for `'/requests/?scope=team'`).

- [ ] **Step 3: Write the query helper and the API**

Create `src/features/brain/scopeQuery.ts`:

```ts
// The query the Brain's scoped list reads end in (customers spec §1.5,
// Contract note 1). Kept free of apiClient so the API unit tests can mock it.
import type { ScopeKey } from './brainTypes';

/** "/requests/?status=planned&scope=team": the filter, then the scope; nothing when neither. */
export function withScope(path: string, scope?: ScopeKey, status?: string): string {
  const query = new URLSearchParams();
  if (status && status !== 'all') query.set('status', status);
  if (scope) query.set('scope', scope);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
```

In `src/features/requests/requestsApi.ts`, add `import type { ScopeKey } from '../brain/brainTypes';` and `import { withScope } from '../brain/scopeQuery';`, and replace `fetchRequests` and `fetchRequest` with:

```ts
export function fetchRequests(status?: RequestStatus | 'all', scope?: ScopeKey): Promise<FeatureRequestRow[]> {
  return apiFetch<FeatureRequestRow[]>(withScope('/requests/', scope, status));
}

export function fetchRequest(id: number, scope?: ScopeKey): Promise<FeatureRequestFull> {
  return apiFetch<FeatureRequestFull>(withScope(`/requests/${id}/`, scope));
}
```

In `src/features/anomalies/anomaliesApi.ts`, add the same two imports and replace `fetchAnomalies` and `fetchAnomaly` with:

```ts
export function fetchAnomalies(status?: AnomalyStatus | 'all', scope?: ScopeKey): Promise<AnomalyRow[]> {
  return apiFetch<AnomalyRow[]>(withScope('/anomalies/', scope, status));
}

export function fetchAnomaly(id: number, scope?: ScopeKey): Promise<AnomalyDetail> {
  return apiFetch<AnomalyDetail>(withScope(`/anomalies/${id}/`, scope));
}
```

Create `src/features/graph/graphTypes.ts` by moving every type out of `graphSlice.ts` verbatim (`NodeKind`, `BaseNode`, `CustomerNode`, `GroupNode`, `InitiativeNode`, `ProposalNode`, `GraphNode`, `GraphEdge`), with this header and `GraphPayload` gaining `hidden`:

```ts
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors /api/v1/brain/graph/?scope= (customers spec §3) and
// /api/v1/metrics/graph/: real relations, the dashboards' own figures.
```

```ts
export interface GraphPayload {
  as_of: string;
  currency: CurrencyCode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** brain/graph/ only: the scope's customers the reader can't open (Contract note 8). */
  hidden?: number;
}
```

In `src/features/graph/graphSlice.ts`, delete the moved types and the `CurrencyCode` import, and add at the top (Task 7 deletes the file):

```ts
import type { GraphPayload } from './graphTypes';
export type { CustomerNode, GraphEdge, GraphNode, GraphPayload, GroupNode, InitiativeNode, NodeKind, ProposalNode } from './graphTypes';
```

In `src/features/graph/filters.ts` line 1, import from `./graphTypes`: `import type { GraphPayload } from './graphTypes';`.

Append to `src/features/brain/brainApi.ts` (add `CustomersPayload` to the `./brainTypes` import and `import type { GraphPayload } from '../graph/graphTypes';`):

```ts
// What customers are saying (customers spec §3; Contract notes 1, 8).
export const fetchCustomers = (scope: ScopeKey) => apiFetch<CustomersPayload>(scoped('customers/', scope));
export const fetchBrainGraph = (scope: ScopeKey) => apiFetch<GraphPayload>(scoped('graph/', scope));
```

- [ ] **Step 4: Write the fixtures**

Create `src/features/brain/testCustomersFixtures.ts`:

```ts
// Test-only: §3-shaped "What customers are saying" on 5 Oct 2026, by scope:
// Alice's own book (Me: nothing yet), her desk with Carl (My team), the
// company; and Carl's own book for the CSM journeys. /requests/ and
// /anomalies/ answer per scope from the same names (their `arr` a string,
// Contract note 2), and the graph per scope (Contract note 8). Names are
// companies and people, never personal data.
import { requestRow } from '../../test/requestsFixtures';
import type { AnomalyRow } from '../anomalies/anomaliesApi';
import type { GraphPayload } from '../graph/graphTypes';
import type { FeatureRequestRow } from '../requests/types';
import type { CustomerAsk, CustomersPayload, ScopeKey, TurnedNegative } from './brainTypes';

export const TRACKING_SINCE = '2026-08-01';
const UBER = { type: 'customer' as const, id: 3, name: 'Uber' };
const APPLE = { type: 'customer' as const, id: 6, name: 'Apple Inc' };
const PIZZA_HUT = { type: 'customer' as const, id: 7, name: 'Pizza Hut' };
const GLOBEX = { type: 'account' as const, id: 9, name: 'Globex EMEA' };

const OLIVIA: TurnedNegative = { contact: { id: 41, name: 'Olivia Park' }, record: APPLE, previous: 'neutral', changed_at: '2026-10-02T07:00:00Z' };
const SAM: TurnedNegative = { contact: { id: 52, name: 'Sam Lee' }, record: GLOBEX, previous: 'positive', changed_at: '2026-09-28T09:00:00Z' };

const ask = (id: number, title: string, status: CustomerAsk['status'], arr: number, companies: number, last: number, previous: number): CustomerAsk => ({
  id, title, status, arr, companies, last_90_days: last, previous_90_days: previous,
});
const SSO_TEAM = ask(2, 'SSO with Okta', 'planned', 182000, 3, 12, 7);
const SSO_CARL = ask(2, 'SSO with Okta', 'planned', 120000, 2, 8, 5);
const SLACK = ask(4, 'Slack alerts', 'open', 40000, 1, 2, 2);
const CSV = ask(5, 'CSV export', 'open', 150000, 2, 3, 0);
const AUDIT = ask(8, 'Audit log', 'shipped', 90000, 2, 0, 0);
const DARK = ask(11, 'Dark mode', 'declined', 20000, 1, 1, 4);
const USAGE = ask(13, 'Usage export', 'open', 10000, 1, 1, 0);
const SAML = ask(14, 'SAML', 'open', 5000, 1, 0, 1);

const GATED = { id: 4, title: 'Similar reports across 2 of your companies', status: 'live' as const, arr: 90000, companies: 2, last_seen_at: '2026-10-04T10:00:00Z' };
const SSO_FAILURES = { id: 4, title: 'SSO login failures', status: 'live' as const, arr: 300000, companies: 6, last_seen_at: '2026-10-04T10:00:00Z' };
const SLOW_SUPPORT = { survey_type: 'nps' as const, score: 4, comment: 'Support is slow lately.', record: UBER, answered_at: '2026-10-03T08:00:00Z' };

/** Alice's own book: nothing yet, every empty state. */
export const ME_CUSTOMERS: CustomersPayload = {
  scope: 'me', currency: 'USD',
  asks: { total: 0, top: [] },
  anomalies: { total: 0, top: [] },
  scores: {
    nps: { now: null, then: null, responses: 2, previous_responses: 1 },
    csat: { now: null, then: null, responses: 3, previous_responses: 0 },
    ces: { now: null, then: null, responses: 0, previous_responses: 0 },
    comments: [], hidden: 0,
  },
  sentiment: { negative: 0, tracking_since: TRACKING_SINCE, turned_negative: [] },
};

export const TEAM_CUSTOMERS: CustomersPayload = {
  scope: 'team', currency: 'USD',
  asks: { total: 2, top: [SSO_TEAM, SLACK] },
  anomalies: { total: 1, top: [GATED] },
  scores: {
    nps: { now: 18, then: 25, responses: 22, previous_responses: 19 },
    csat: { now: 82.5, then: 80, responses: 40, previous_responses: 31 },
    // CES counts organisation-level answers only (Contract note 5).
    ces: { now: null, then: null, responses: 3, previous_responses: 0 },
    comments: [SLOW_SUPPORT], hidden: 1,
  },
  sentiment: { negative: 4, tracking_since: TRACKING_SINCE, turned_negative: [OLIVIA] },
};

export const COMPANY_CUSTOMERS: CustomersPayload = {
  scope: 'company', currency: 'USD',
  asks: { total: 7, top: [SSO_TEAM, CSV, AUDIT, SLACK, DARK] },
  anomalies: { total: 1, top: [SSO_FAILURES] },
  scores: {
    nps: { now: 30, then: 30, responses: 80, previous_responses: 70 },
    csat: { now: 84, then: 86, responses: 120, previous_responses: 100 },
    ces: { now: 72.35, then: 65, responses: 30, previous_responses: 25 },
    comments: [{ survey_type: 'ces', score: 6, comment: 'Setup took one call.', record: GLOBEX, answered_at: '2026-10-04T08:00:00Z' }, SLOW_SUPPORT],
    hidden: 0,
  },
  sentiment: { negative: 9, tracking_since: TRACKING_SINCE, turned_negative: [OLIVIA, SAM] },
};

/** Carl's Me: his own book, smaller than his manager's My team. */
export const CARL_CUSTOMERS: CustomersPayload = {
  scope: 'me', currency: 'USD',
  asks: { total: 2, top: [SSO_CARL, SLACK] },
  anomalies: { total: 1, top: [GATED] },
  scores: {
    nps: { now: 10, then: null, responses: 6, previous_responses: 2 },
    csat: { now: 90, then: 85, responses: 8, previous_responses: 6 },
    ces: { now: null, then: null, responses: 0, previous_responses: 0 },
    comments: [{ survey_type: 'csat', score: 5, comment: 'Onboarding was quick.', record: PIZZA_HUT, answered_at: '2026-10-02T09:00:00Z' }],
    hidden: 0,
  },
  sentiment: { negative: 1, tracking_since: TRACKING_SINCE, turned_negative: [OLIVIA] },
};

export const CUSTOMERS: Record<ScopeKey, CustomersPayload> = { me: ME_CUSTOMERS, team: TEAM_CUSTOMERS, company: COMPANY_CUSTOMERS };

/** The same asks as /requests/ rows: `arr` a decimal string (Contract note 2). */
const row = (a: CustomerAsk): FeatureRequestRow =>
  requestRow({ id: a.id, title: a.title, status: a.status, arr: String(a.arr), companies: a.companies, interactions: a.last_90_days + a.previous_90_days, last_90_days: a.last_90_days, previous_90_days: a.previous_90_days, summary: '' });

export const REQUEST_ROWS: Record<ScopeKey, FeatureRequestRow[]> = {
  me: [],
  team: [row(SSO_TEAM), row(SLACK)],
  company: [SSO_TEAM, CSV, AUDIT, SLACK, DARK, USAGE, SAML].map(row),
};
export const CARL_REQUEST_ROWS: FeatureRequestRow[] = [row(SSO_CARL), row(SLACK)];

export function anomalyRow(overrides: Partial<AnomalyRow> = {}): AnomalyRow {
  return {
    id: 4, title: 'SSO login failures', summary: '', status: 'live', arr: '300000', companies: 6, interactions: 11,
    first_seen_at: '2026-09-28T09:00:00Z', last_seen_at: '2026-10-04T10:00:00Z', acknowledged_by: null, ...overrides,
  };
}

export const ANOMALY_ROWS: Record<ScopeKey, AnomalyRow[]> = {
  me: [],
  team: [anomalyRow({ title: GATED.title, arr: '90000', companies: 2, interactions: 3 })],
  company: [anomalyRow()],
};

/** Carl's book: 6 nodes, 6 relations (owner:5 is Carl, Contract note 9). */
export const CARL_GRAPH: GraphPayload = {
  as_of: '2026-10-05', currency: 'USD', hidden: 0,
  nodes: [
    { id: 'owner:5', kind: 'owner', label: 'Carl CSM', customers: 2, arr: 169_600, downside: 17_400 },
    { id: 'customer:7', kind: 'customer', label: 'Pizza Hut', arr: 69_600, downside: 17_400, risk: 0.25, health_category: 'average', health_score: 5.1, days_to_renewal: -34, open_tasks: 1 },
    { id: 'customer:8', kind: 'customer', label: 'Fine', arr: 100_000, downside: 0, risk: 0.05, health_category: 'good', health_score: 8.5, days_to_renewal: 200, open_tasks: 0 },
    { id: 'product:4', kind: 'product', label: 'Analytics Suite', customers: 2, arr: 169_600, downside: 17_400 },
    { id: 'initiative:1', kind: 'initiative', label: 'Halve the ARR at risk on Analytics Suite', status: 'active', metric: 'at_risk_arr', metric_label: 'ARR at risk', member_label: 'Analytics Suite', target_value: 32_000, target_by: '2026-11-30', owner: 'Carl CSM' },
    { id: 'proposal:5', kind: 'proposal', label: 'Save play on Pizza Hut', proposal_kind: 'task', from_session: 'Why this account is at risk?' },
  ],
  edges: [
    { from: 'owner:5', to: 'customer:7', kind: 'owns' },
    { from: 'owner:5', to: 'customer:8', kind: 'owns' },
    { from: 'customer:7', to: 'product:4', kind: 'runs_on' },
    { from: 'customer:8', to: 'product:4', kind: 'runs_on' },
    { from: 'initiative:1', to: 'product:4', kind: 'targets' },
    { from: 'proposal:5', to: 'customer:7', kind: 'acts_on' },
  ],
};

const ALICE_OWNER = { id: 'owner:1', kind: 'owner' as const, label: 'Alice Admin', customers: 1, arr: 50_000, downside: 0 };
const UBER_NODE = { id: 'customer:3', kind: 'customer' as const, label: 'Uber', arr: 50_000, downside: 0, risk: 0.05, health_category: 'good' as const, health_score: 8, days_to_renewal: 120, open_tasks: 0 };

/** Alice's own book: 3 nodes, 2 relations. */
export const ME_GRAPH: GraphPayload = {
  as_of: '2026-10-05', currency: 'USD', hidden: 0,
  nodes: [ALICE_OWNER, UBER_NODE, { id: 'product:4', kind: 'product', label: 'Analytics Suite', customers: 1, arr: 50_000, downside: 0 }],
  edges: [{ from: 'owner:1', to: 'customer:3', kind: 'owns' }, { from: 'customer:3', to: 'product:4', kind: 'runs_on' }],
};

/** Alice and Carl: 8 nodes, 8 relations. */
export const TEAM_GRAPH: GraphPayload = {
  ...CARL_GRAPH,
  nodes: [...CARL_GRAPH.nodes, ALICE_OWNER, UBER_NODE],
  edges: [...CARL_GRAPH.edges, ...ME_GRAPH.edges],
};

/** The company: 10 nodes, 10 relations; 2 customers this reader can't open. */
export const COMPANY_GRAPH: GraphPayload = {
  ...TEAM_GRAPH,
  hidden: 2,
  nodes: [
    ...TEAM_GRAPH.nodes,
    { id: 'owner:7', kind: 'owner', label: 'Dana CSM', customers: 1, arr: 40_000, downside: 0 },
    { id: 'customer:12', kind: 'customer', label: 'Globex', arr: 40_000, downside: 0, risk: 0.1, health_category: 'good', health_score: 7.4, days_to_renewal: 300, open_tasks: 0 },
  ],
  edges: [...TEAM_GRAPH.edges, { from: 'owner:7', to: 'customer:12', kind: 'owns' }, { from: 'customer:12', to: 'product:4', kind: 'runs_on' }],
};

export const EMPTY_GRAPH: GraphPayload = { as_of: '2026-10-05', currency: 'USD', hidden: 0, nodes: [], edges: [] };
export const GRAPHS: Record<ScopeKey, GraphPayload> = { me: ME_GRAPH, team: TEAM_GRAPH, company: COMPANY_GRAPH };
```

- [ ] **Step 5: Teach the stub**

In `src/features/brain/testBrain.ts`:

1. Add to the header comment: `What customers are saying (customers §3): customers/ and graph/, and /requests/ and /anomalies/ narrowed by ?scope= (list and detail; no scope is today's list).`
2. Add imports: `type CustomersPayload` to the `./brainTypes` import; `import type { AnomalyRow } from '../anomalies/anomaliesApi';`, `import type { GraphPayload } from '../graph/graphTypes';`, `import type { FeatureRequestRow } from '../requests/types';`, `import { ANOMALY_ROWS, CUSTOMERS, GRAPHS, REQUEST_ROWS } from './testCustomersFixtures';`.
3. Add to `BrainStub`:

```ts
  /** customers/ by scope. Default CUSTOMERS. */
  customers?: Partial<Record<ScopeKey, CustomersPayload>>;
  /** How many customers/ reads fail (500) first. */
  failCustomers?: number;
  /** graph/ by scope. Default GRAPHS. */
  graphs?: Partial<Record<ScopeKey, GraphPayload>>;
  /** How many graph/ reads fail (500) first. */
  failGraph?: number;
  /** /requests/ rows by scope. Default REQUEST_ROWS. */
  requestRows?: Partial<Record<ScopeKey, FeatureRequestRow[]>>;
  /** /anomalies/ rows by scope. Default ANOMALY_ROWS. */
  anomalyRows?: Partial<Record<ScopeKey, AnomalyRow[]>>;
```

4. Inside `stubBrain`, after `let initiativeRefusal = …;` add:

```ts
  const customers: Record<ScopeKey, CustomersPayload> = { ...CUSTOMERS, ...stub.customers };
  const graphs: Record<ScopeKey, GraphPayload> = { ...GRAPHS, ...stub.graphs };
  const requestRows: Record<ScopeKey, FeatureRequestRow[]> = { ...REQUEST_ROWS, ...stub.requestRows };
  const anomalyRows: Record<ScopeKey, AnomalyRow[]> = { ...ANOMALY_ROWS, ...stub.anomalyRows };
  let failCustomers = stub.failCustomers ?? 0;
  let failGraph = stub.failGraph ?? 0;

  /** /requests/ and /anomalies/ (customers §1.2, Contract note 1): no scope is
   *  today's list (the reader's reach); unknown 400 before not offered 403;
   *  a row outside the scope 404s on its detail. */
  function scopedList<T extends { id: number; status: string }>(url: URL, rows: Record<ScopeKey, T[]>, id: string | undefined, detail: (row: T) => unknown) {
    const raw = url.searchParams.get('scope');
    if (raw && !SCOPE_KEYS.includes(raw as ScopeKey)) return json(400, SCOPE_UNKNOWN);
    if (raw && !offered.has(raw as ScopeKey)) return json(403, SCOPE_NOT_ALLOWED);
    const inScope = rows[raw ? (raw as ScopeKey) : viewAll ? 'company' : 'me'];
    if (id !== undefined) {
      const found = inScope.find((r) => r.id === Number(id));
      return found ? json(200, detail(found)) : json(404, { detail: 'Not found.' });
    }
    const status = url.searchParams.get('status');
    return json(200, status ? inScope.filter((r) => r.status === status) : inScope);
  }
```

5. In `spy`, right after the `stub.passThrough` line, add:

```ts
    const listed = /^\/(requests|anomalies)\/(?:(\d+)\/)?$/.exec(full);
    if (listed && method === 'GET') {
      return listed[1] === 'requests'
        ? scopedList(url, requestRows, listed[2], (r) => ({ ...r, companies_asking: [], evidence: [] }))
        : scopedList(url, anomalyRows, listed[2], (r) => ({ ...r, companies_hit: [], evidence: [] }));
    }
```

6. Widen the `route` regex to `/^\/(changed|brief|waiting|doing|customers|graph|initiatives|explanations\/([^/]+))\/$/`, and after the `doing` handler add:

```ts
    if (route[1] === 'customers' && method === 'GET') {
      if (failCustomers > 0) { failCustomers -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, customers[scope]);
    }

    if (route[1] === 'graph' && method === 'GET') {
      if (failGraph > 0) { failGraph -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, graphs[scope]);
    }
```

- [ ] **Step 6: Run the tests and the type-check**

Run: `npx vitest run --maxWorkers=2 src/features/brain src/features/requests src/features/anomalies src/features/graph src/pages/brain/Graph.test.tsx && npx tsc -b --noEmit`
Expected: PASS (the Graph page still reads its types through `graphSlice`'s re-export), no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/brain/scopeQuery.ts src/features/brain/brainApi.ts src/features/brain/testBrain.ts src/features/brain/testBrain.test.ts src/features/brain/testCustomersFixtures.ts src/features/requests src/features/anomalies src/features/graph
git commit -m "feat(brain): scoped customers, graph, requests and anomalies reads, with the contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: One scoped read, figures in a sentence, and the asks and anomalies lists

Spec §2.1 (Asks, Anomalies, See all); Decision 2; Contract notes 2, 4; plan Decisions 2, 5, 8.

**Files:**
- Create: `src/components/brain/useScopedRead.ts`, `src/components/brain/Figured.tsx`, `src/components/brain/CustomerLists.tsx`
- Modify: `src/components/brain/styles.ts` (append)
- Test: `src/components/brain/useScopedRead.test.tsx`, `src/components/brain/CustomerLists.test.tsx`

**Interfaces:**
- Consumes: Task 1's `CS`, `askMeta`, `anomalyMeta`, `asksEmpty`, `seeAllHref`, `topText`; Task 2's `COMPANY_CUSTOMERS`, `TEAM_CUSTOMERS`; `MONO`, `BUTTON` (`components/organizations/portfolio/styles`).
- Produces:
  - `useScopedRead<T>(scope: ScopeKey | null, read: (scope: ScopeKey) => Promise<T>, onRefused: (err: unknown) => boolean, fallback: string) → { data: T | null; error: string | null; retry: () => void }`.
  - `Figured({ text })`.
  - `AskList({ asks, scope, currency })`, `AnomalyList({ anomalies, currency })`, `SeeAll({ page, scope, shown, total })`.
  - `styles.ts`: `LIST`, `NONE`, `FIGURES`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/brain/useScopedRead.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { useScopedRead } from './useScopedRead';

type Data = { label: string };
function deferred() {
  let resolve!: (v: Data) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Data>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(onRefused: (err: unknown) => boolean = () => false) {
  const pending: { scope: ScopeKey; d: ReturnType<typeof deferred> }[] = [];
  const read = vi.fn((scope: ScopeKey) => {
    const d = deferred();
    pending.push({ scope, d });
    return d.promise;
  });
  const hook = renderHook(({ scope }: { scope: ScopeKey | null }) => useScopedRead(scope, read, onRefused, 'Could not load.'), {
    initialProps: { scope: null as ScopeKey | null },
  });
  return { read, pending, hook };
}

describe('useScopedRead (customers plan Decision 2)', () => {
  it('reads nothing until the scope settles, then reads it once', async () => {
    const { read, pending, hook } = setup();
    expect(read).not.toHaveBeenCalled();
    hook.rerender({ scope: 'me' });
    expect(read).toHaveBeenCalledWith('me');
    await act(async () => pending[0].d.resolve({ label: 'me' }));
    expect(hook.result.current.data).toEqual({ label: 'me' });
  });

  it('drops to nothing on a switch, and drops a slower answer for the old scope', async () => {
    const { pending, hook } = setup();
    hook.rerender({ scope: 'me' });
    await act(async () => pending[0].d.resolve({ label: 'me' }));
    hook.rerender({ scope: 'team' });
    expect(hook.result.current.data).toBeNull();
    hook.rerender({ scope: 'company' });
    await act(async () => pending[1].d.resolve({ label: 'team' }));
    expect(hook.result.current.data).toBeNull();
    await act(async () => pending[2].d.resolve({ label: 'company' }));
    expect(hook.result.current.data).toEqual({ label: 'company' });
  });

  it('keeps the last answer on screen while a retry for the same scope is in flight', async () => {
    const { read, pending, hook } = setup();
    hook.rerender({ scope: 'me' });
    await act(async () => pending[0].d.resolve({ label: 'me' }));
    act(() => hook.result.current.retry());
    expect(read).toHaveBeenCalledTimes(2);
    expect(hook.result.current.data).toEqual({ label: 'me' });
    await act(async () => pending[1].d.resolve({ label: 'me again' }));
    expect(hook.result.current.data).toEqual({ label: 'me again' });
  });

  it('says the fallback on a failure, and hands a refusal to onRefused without an error', async () => {
    const failing = setup();
    failing.hook.rerender({ scope: 'me' });
    await act(async () => failing.pending[0].d.reject(new Error('boom')));
    expect(failing.hook.result.current.error).toBe('Could not load.');

    const onRefused = vi.fn(() => true);
    const refused = setup(onRefused);
    refused.hook.rerender({ scope: 'team' });
    await act(async () => refused.pending[0].d.reject(new Error('403')));
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(refused.hook.result.current.error).toBeNull();
  });
});
```

Create `src/components/brain/CustomerLists.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CS } from '../../features/brain/customersText';
import { COMPANY_CUSTOMERS, TEAM_CUSTOMERS } from '../../features/brain/testCustomersFixtures';
import { AnomalyList, AskList, SeeAll } from './CustomerLists';
import { Figured } from './Figured';

const renderIn = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const monos = (el: Element) => [...el.querySelectorAll('.font-mono-brand')].map((s) => s.textContent);

describe('Asks and Anomalies (customers spec §2.1)', () => {
  it('sets every figure in a sentence in DM Mono and leaves the words alone', () => {
    const { container } = render(<Figured text="Planned · $182.0K · 3 companies · 12 asks, up from −7%" />);
    expect(container).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from −7%');
    expect(monos(container)).toEqual(['$182.0K', '3', '12', '−7%']);
  });

  it('lists the top asks in the server’s order with status, ARR, companies and the trend in words', () => {
    renderIn(<AskList asks={COMPANY_CUSTOMERS.asks.top} scope="company" currency="USD" />);
    const rows = within(screen.getByRole('list', { name: CS.ASKS })).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('h3')?.textContent)).toEqual(['SSO with Okta', 'CSV export', 'Audit log', 'Slack alerts', 'Dark mode']);
    const meta = rows[0].querySelector('[data-part="meta"]')!;
    expect(meta).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(monos(meta)).toEqual(['$182.0K', '3', '12', '7']);
  });

  it.each([
    ['me', 'No asks from your customers yet.'],
    ['team', "No asks from your team's customers yet."],
    ['company', 'No asks from customers yet.'],
  ] as const)('says there are no asks in %s', (scope, text) => {
    renderIn(<AskList asks={[]} scope={scope} currency="USD" />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists anomalies under the title the server sent, and says nothing unusual when there are none', () => {
    const { unmount } = renderIn(<AnomalyList anomalies={TEAM_CUSTOMERS.anomalies.top} currency="USD" />);
    const row = within(screen.getByRole('list', { name: CS.ANOMALIES })).getByRole('listitem');
    expect(row).toHaveTextContent('Similar reports across 2 of your companies');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('Live · $90.0K · 2 companies · last seen 4 Oct');
    unmount();
    renderIn(<AnomalyList anomalies={[]} currency="USD" />);
    expect(screen.getByText(CS.NO_ANOMALIES)).toBeInTheDocument();
  });

  it('says Top 5 of 7 and opens See all on the full page in the same scope', () => {
    renderIn(<SeeAll page="requests" scope="team" shown={5} total={7} />);
    expect(screen.getByText(/Top/)).toHaveTextContent('Top 5 of 7');
    const link = screen.getByRole('link', { name: CS.SEE_ALL_ASKS });
    expect(link).toHaveTextContent(CS.SEE_ALL);
    expect(link).toHaveAttribute('href', '/brain/requests?scope=team');
  });

  it('drops Top N of M when everything shows, and See all when there is nothing', () => {
    const { container, unmount } = renderIn(<SeeAll page="anomalies" scope="me" shown={0} total={0} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderIn(<SeeAll page="anomalies" scope="me" shown={1} total={1} />);
    expect(screen.queryByText(/Top/)).toBeNull();
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ANOMALIES })).toHaveAttribute('href', '/brain/anomalies?scope=me');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/brain/useScopedRead.test.tsx src/components/brain/CustomerLists.test.tsx`
Expected: FAIL — `Failed to resolve import "./useScopedRead"` / `"./CustomerLists"`.

- [ ] **Step 3: Write the hook, `Figured`, the styles and the lists**

Create `src/components/brain/useScopedRead.ts`:

```ts
import { useEffect, useState } from 'react';
import type { ScopeKey } from '../../features/brain/brainTypes';

type Answer<T> = { scope: ScopeKey; key: string; data: T | null; error: string | null };

/** One scoped GET (customers/, graph/; customers plan Decision 2), with
 *  useDoing's rules: read once the scope settles and again on Try again; a
 *  slower answer for another scope is dropped; a kept answer shows only for
 *  the scope it was read for, so a switch drops to the skeleton (no stale
 *  rows) while a retry on the same scope keeps the last one on screen. A 403
 *  SCOPE_NOT_ALLOWED goes to `onRefused` and shows no error of its own. The
 *  answer is keyed by the scope asked for, since graph/ carries no `scope`. */
export function useScopedRead<T>(scope: ScopeKey | null, read: (scope: ScopeKey) => Promise<T>, onRefused: (err: unknown) => boolean, fallback: string) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    read(scope).then(
      (data) => alive && setAnswer({ scope, key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ scope, key, data: null, error: fallback });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `read`, `onRefused` and `fallback` are stable for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const data = answer?.data && answer.scope === scope ? answer.data : null;
  return { data, error: key && answer?.key === key ? answer.error : null, retry: () => setAttempt((n) => n + 1) };
}
```

Create `src/components/brain/Figured.tsx`:

```tsx
import { MONO } from '../organizations/portfolio/styles';

/** A figure: an optional sign, an optional currency mark, digits, then K/M/B/T or %. */
const FIGURE = /([+−-]?[$€£₹]?\d[\d.,]*[KMBT%]?)/;

/** A sentence with every figure in it (money, counts, scores, dates) set in
 *  DM Mono with tabular figures, and the words around them left alone. */
export function Figured({ text }: { text: string }) {
  return (
    <>
      {text.split(FIGURE).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={MONO}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
```

Append to `src/components/brain/styles.ts`:

```ts
/** One bordered list; its rows are flat inside it (no card in a card). */
export const LIST = 'divide-y divide-line rounded-xl border border-line bg-surface';
/** A section's one-line empty state, on the same surface its list would use. */
export const NONE = 'rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-muted';
/** The three score figures: one bordered surface, stacked below sm. */
export const FIGURES = 'grid divide-y divide-line rounded-xl border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0';
```

Create `src/components/brain/CustomerLists.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { CurrencyCode } from '../../features/auth/authSlice';
import type { CustomerAnomaly, CustomerAsk, ScopeKey } from '../../features/brain/brainTypes';
import { anomalyMeta, askMeta, asksEmpty, CS, seeAllHref, topText } from '../../features/brain/customersText';
import { BUTTON } from '../organizations/portfolio/styles';
import { Figured } from './Figured';
import { LIST, NONE } from './styles';

function Row({ kind, id, title, meta }: { kind: 'ask' | 'anomaly'; id: number; title: string; meta: string }) {
  return (
    <li data-row={`${kind}-${id}`} className="flex flex-col gap-1 px-4 py-3">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <p data-part="meta" className="text-[13px] text-ink-muted">
        <Figured text={meta} />
      </p>
    </li>
  );
}

/** Asks (spec §2.1): the top requests by the ARR behind them in this scope, in the server's order. */
export function AskList({ asks, scope, currency }: { asks: CustomerAsk[]; scope: ScopeKey; currency: CurrencyCode }) {
  if (asks.length === 0) {
    return (
      <p data-part="none" className={NONE}>
        {asksEmpty(scope)}
      </p>
    );
  }
  return (
    <ul aria-label={CS.ASKS} className={LIST}>
      {asks.map((ask) => (
        <Row key={ask.id} kind="ask" id={ask.id} title={ask.title} meta={askMeta(ask, currency)} />
      ))}
    </ul>
  );
}

/** Anomalies (spec §2.1): titles as the server gated them. */
export function AnomalyList({ anomalies, currency }: { anomalies: CustomerAnomaly[]; currency: CurrencyCode }) {
  if (anomalies.length === 0) {
    return (
      <p data-part="none" className={NONE}>
        {CS.NO_ANOMALIES}
      </p>
    );
  }
  return (
    <ul aria-label={CS.ANOMALIES} className={LIST}>
      {anomalies.map((anomaly) => (
        <Row key={anomaly.id} kind="anomaly" id={anomaly.id} title={anomaly.title} meta={anomalyMeta(anomaly, currency)} />
      ))}
    </ul>
  );
}

/** "Top 5 of 7" and See all, which opens the full page in the same scope (Decision 2). */
export function SeeAll({ page, scope, shown, total }: { page: 'requests' | 'anomalies'; scope: ScopeKey; shown: number; total: number }) {
  if (total === 0) return null;
  const top = topText(shown, total);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {top ? (
        <span className="text-[13px] text-ink-muted">
          <Figured text={top} />
        </span>
      ) : null}
      <Link to={seeAllHref(page, scope)} aria-label={page === 'requests' ? CS.SEE_ALL_ASKS : CS.SEE_ALL_ANOMALIES} className={BUTTON}>
        {CS.SEE_ALL}
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/brain/useScopedRead.test.tsx src/components/brain/CustomerLists.test.tsx && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/useScopedRead.ts src/components/brain/useScopedRead.test.tsx src/components/brain/Figured.tsx src/components/brain/CustomerLists.tsx src/components/brain/CustomerLists.test.tsx src/components/brain/styles.ts
git commit -m "feat(brain): one scoped read, figures in a sentence, and the asks and anomalies lists

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Scores, comments and sentiment

Spec §2.1 (Scores, Sentiment); Decisions 3, 4; Contract notes 5–7; plan Decisions 6–8.

**Files:**
- Create: `src/components/brain/ScoresPanel.tsx`, `src/components/brain/SentimentPanel.tsx`
- Test: `src/components/brain/CustomerPanels.test.tsx`

**Interfaces:**
- Consumes: Task 1's `CS`, `SCORE_KINDS`, `scoreFigure`, `scoreChange`, `responsesText`, `commentLabel`, `hiddenCommentsText`, `negativeText`, `wasText`, `contactPath`, `turnedHeading`, `turnedEmpty`; Task 3's `Figured`, `LIST`, `NONE`, `FIGURES`; `TONE_CLASS` (`./styles`); `recordPath` (`features/brain/waitingText`); `dayOf`; `TYPE_LABEL`; `MONO`, `FOCUS`.
- Produces: `ScoresPanel({ scores })`, `SentimentPanel({ sentiment, today })`.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/CustomerPanels.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CS } from '../../features/brain/customersText';
import { CARL_CUSTOMERS, COMPANY_CUSTOMERS, ME_CUSTOMERS, TEAM_CUSTOMERS } from '../../features/brain/testCustomersFixtures';
import { ScoresPanel } from './ScoresPanel';
import { SentimentPanel } from './SentimentPanel';

const renderIn = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const part = (kind: string, name: string) => document.querySelector(`[data-score="${kind}"] [data-part="${name}"]`);
const TODAY = new Date('2026-10-05T12:00:00Z');

describe('Scores (customers spec §2.1, Decision 3)', () => {
  it('shows NPS, CSAT and CES against the 90 days before, the change in words beside its colour', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    expect(part('nps', 'figure')).toHaveTextContent('+18');
    expect(part('nps', 'figure')).toHaveClass('font-mono-brand', 'tabular-nums');
    expect(part('nps', 'change')).toHaveTextContent('down 7 pts from +25');
    expect(part('nps', 'change')).toHaveClass('text-danger');
    expect(part('nps', 'responses')).toHaveTextContent('22 answers · 19 before');
    expect(part('csat', 'figure')).toHaveTextContent('82.5%');
    expect(part('csat', 'change')).toHaveTextContent('up 2.5 pts from 80%');
    expect(part('csat', 'change')).toHaveClass('text-success');
  });

  it('says Not enough answers under 5 in the window and shows no change (Contract note 5)', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    expect(part('ces', 'figure')).toHaveTextContent(CS.NOT_ENOUGH);
    expect(part('ces', 'change')).toBeNull();
    expect(part('ces', 'responses')).toHaveTextContent('3 answers · 0 before');
  });

  it('says it can’t compare when only the earlier window is under 5', () => {
    renderIn(<ScoresPanel scores={CARL_CUSTOMERS.scores} />);
    expect(part('nps', 'figure')).toHaveTextContent('+10');
    expect(part('nps', 'change')).toHaveTextContent(CS.NOT_COMPARED);
    expect(part('nps', 'change')).toHaveClass('text-ink-muted');
  });

  it('lists the latest comments with score, record (linked) and date, and counts the hidden ones', () => {
    renderIn(<ScoresPanel scores={TEAM_CUSTOMERS.scores} />);
    const row = within(screen.getByRole('list', { name: CS.COMMENTS })).getByRole('listitem');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('NPS 4 · Uber · 3 Oct');
    expect(within(row).getByRole('link', { name: 'Uber' })).toHaveAttribute('href', '/organizations/3');
    expect(row).toHaveTextContent('Support is slow lately.');
    expect(screen.getByText("1 more comment on a record you can't open")).toBeInTheDocument();
  });

  it('links an account’s comment to the account, and shows a comment with no record unlinked', () => {
    const scores = { ...COMPANY_CUSTOMERS.scores, comments: [...COMPANY_CUSTOMERS.scores.comments, { ...COMPANY_CUSTOMERS.scores.comments[0], record: null, comment: 'No record here.' }] };
    renderIn(<ScoresPanel scores={scores} />);
    const rows = within(screen.getByRole('list', { name: CS.COMMENTS })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Globex EMEA' })).toHaveAttribute('href', '/accounts/9');
    expect(within(rows[2]).queryByRole('link')).toBeNull();
    expect(rows[2]).toHaveTextContent('No record here.');
  });

  it('says there are no comments, and no hidden line, when there are none', () => {
    renderIn(<ScoresPanel scores={ME_CUSTOMERS.scores} />);
    expect(screen.getByText(CS.NO_COMMENTS)).toBeInTheDocument();
    expect(document.querySelector('[data-part="hidden"]')).toBeNull();
  });
});

describe('Sentiment (customers spec §2.1, Decision 4)', () => {
  it('counts the negative contacts and lists who turned negative, newest first, in words', () => {
    renderIn(<SentimentPanel sentiment={COMPANY_CUSTOMERS.sentiment} today={TODAY} />);
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('9 contacts negative');
    expect(screen.getByRole('heading', { name: CS.TURNED })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: CS.TURNED_LIST })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Olivia Park' })).toHaveAttribute('href', '/contacts/41');
    expect(within(rows[0]).getByRole('link', { name: 'Apple Inc' })).toHaveAttribute('href', '/organizations/6');
    expect(rows[0].querySelector('[data-part="meta"]')).toHaveTextContent('was neutral · 2 Oct');
    expect(within(rows[1]).getByRole('link', { name: 'Globex EMEA' })).toHaveAttribute('href', '/accounts/9');
    expect(rows[1].querySelector('[data-part="meta"]')).toHaveTextContent('was positive · 28 Sep');
  });

  it('says since when while tracking is under 30 days old', () => {
    renderIn(<SentimentPanel sentiment={{ ...TEAM_CUSTOMERS.sentiment, tracking_since: '2026-09-20' }} today={TODAY} />);
    expect(screen.getByRole('heading', { name: 'Turned negative since 20 Sep, when we started tracking changes' })).toBeInTheDocument();
  });

  it('says nobody has turned negative since tracking started, before any change is recorded', () => {
    renderIn(<SentimentPanel sentiment={{ negative: 4, tracking_since: null, turned_negative: [] }} today={TODAY} />);
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('4 contacts negative');
    expect(screen.getByText(CS.NOT_TRACKING)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('says nobody turned negative in the last 30 days once tracking has started', () => {
    renderIn(<SentimentPanel sentiment={ME_CUSTOMERS.sentiment} today={TODAY} />);
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('0 contacts negative');
    expect(screen.getByText(CS.NOBODY_TURNED)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/brain/CustomerPanels.test.tsx`
Expected: FAIL — `Failed to resolve import "./ScoresPanel"`.

- [ ] **Step 3: Write the two panels**

Create `src/components/brain/ScoresPanel.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { dayOf } from '../../features/brain/brainText';
import type { CustomerScores, ScoreComment } from '../../features/brain/brainTypes';
import { commentLabel, CS, hiddenCommentsText, responsesText, SCORE_KINDS, scoreChange, scoreFigure } from '../../features/brain/customersText';
import { recordPath } from '../../features/brain/waitingText';
import { TYPE_LABEL } from '../../features/surveys/questions';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { Figured } from './Figured';
import { FIGURES, LIST, NONE, TONE_CLASS } from './styles';

const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

function CommentRow({ comment }: { comment: ScoreComment }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <p data-part="meta" className="flex flex-wrap items-center gap-x-1 text-[13px] text-ink-muted">
        <span>
          <Figured text={commentLabel(comment)} />
        </span>
        {comment.record ? (
          <>
            <span aria-hidden="true">·</span>
            <Link to={recordPath(comment.record)} className={LINK}>
              {comment.record.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span className={MONO}>{dayOf(comment.answered_at)}</span>
      </p>
      <p className="max-w-[70ch] text-[13px] text-ink">{comment.comment}</p>
    </li>
  );
}

/** Scores (spec §2.1, Decision 3): NPS, CSAT and CES for the scope's last 90
 *  days against the 90 before, then this window's latest comments. A change
 *  is always a sentence beside its colour. */
export function ScoresPanel({ scores }: { scores: CustomerScores }) {
  const hidden = hiddenCommentsText(scores.hidden);
  return (
    <div className="flex flex-col gap-3">
      <dl className={FIGURES}>
        {SCORE_KINDS.map((kind) => {
          const figure = scores[kind];
          const change = scoreChange(kind, figure);
          return (
            <div key={kind} data-score={kind} className="flex flex-col gap-1 px-4 py-3">
              <dt className="text-[13px] font-semibold text-ink-muted">{TYPE_LABEL[kind]}</dt>
              <dd className="flex flex-col gap-1">
                <span data-part="figure" className={figure.now === null ? 'text-[13px] text-ink-muted' : `${MONO} text-[22px] text-ink`}>
                  {scoreFigure(kind, figure)}
                </span>
                {change ? (
                  <span data-part="change" className={`text-[13px] font-semibold ${TONE_CLASS[change.tone]}`}>
                    <Figured text={change.text} />
                  </span>
                ) : null}
                <span data-part="responses" className="text-[11px] text-ink-muted">
                  <Figured text={responsesText(figure)} />
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <h3 className="text-[13px] font-semibold text-ink">{CS.COMMENTS}</h3>
      {scores.comments.length === 0 ? (
        <p data-part="none" className={NONE}>
          {CS.NO_COMMENTS}
        </p>
      ) : (
        <ul aria-label={CS.COMMENTS} className={LIST}>
          {scores.comments.map((comment, i) => (
            <CommentRow key={`${comment.answered_at}-${i}`} comment={comment} />
          ))}
        </ul>
      )}
      {hidden ? (
        <p data-part="hidden" className="text-[13px] text-ink-muted">
          {hidden}
        </p>
      ) : null}
    </div>
  );
}
```

Create `src/components/brain/SentimentPanel.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { dayOf } from '../../features/brain/brainText';
import type { CustomerSentiment } from '../../features/brain/brainTypes';
import { contactPath, CS, negativeText, turnedEmpty, turnedHeading, wasText } from '../../features/brain/customersText';
import { recordPath } from '../../features/brain/waitingText';
import { FOCUS } from '../organizations/portfolio/styles';
import { Figured } from './Figured';
import { LIST, NONE } from './styles';

const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** Sentiment (spec §2.1, Decision 4): the scope's negative contacts, and who
 *  turned negative in the last 30 days, in words, never by colour alone. */
export function SentimentPanel({ sentiment, today }: { sentiment: CustomerSentiment; today: Date }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-part="negative" className="text-[15px] font-semibold text-ink">
        <Figured text={negativeText(sentiment.negative)} />
      </p>
      <h3 className="text-[13px] font-semibold text-ink">{turnedHeading(sentiment.tracking_since, today)}</h3>
      {sentiment.turned_negative.length === 0 ? (
        <p data-part="none" className={NONE}>
          {turnedEmpty(sentiment.tracking_since)}
        </p>
      ) : (
        <ul aria-label={CS.TURNED_LIST} className={LIST}>
          {sentiment.turned_negative.map((turned) => (
            <li key={turned.contact.id} data-contact={turned.contact.id} className="flex flex-col gap-1 px-4 py-3">
              <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-ink-muted">
                <Link to={contactPath(turned.contact.id)} className={LINK}>
                  {turned.contact.name}
                </Link>
                {turned.record ? (
                  <>
                    <span>on</span>
                    <Link to={recordPath(turned.record)} className={LINK}>
                      {turned.record.name}
                    </Link>
                  </>
                ) : null}
              </p>
              <p data-part="meta" className="text-[13px] text-ink-muted">
                <Figured text={`${wasText(turned.previous)} · ${dayOf(turned.changed_at)}`} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/brain/CustomerPanels.test.tsx && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/ScoresPanel.tsx src/components/brain/SentimentPanel.tsx src/components/brain/CustomerPanels.test.tsx
git commit -m "feat(brain): scores against the window before, comments, and who turned negative

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The What customers are saying page at `/brain/customers`

Spec §2.1 (header, sections, states, 375px); Decisions 1, 2, 5; plan Decisions 3, 4, 9, 13.

**Files:**
- Create: `src/components/brain/CustomersSkeleton.tsx`, `src/pages/brain/Customers.tsx`
- Modify: `src/pages/brain/BrainRoutes.tsx`, `src/components/layout/Navbar.tsx:97-99`
- Test: `src/pages/brain/Customers.test.tsx`, `src/pages/brain/BrainRoutes.test.tsx`, `src/components/layout/Navbar.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4; `useBrainScope`, `ScopeSwitch`, `LostAccessNotice`, `ErrorBlock`, `QUIET`, `FOCUS`; `withSection` (doingText); `graphHref`; `fetchCustomers`.
- Produces: `CustomersPage`; route `/brain/customers`; `CustomersSkeleton`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/brain/Customers.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { CS } from '../../features/brain/customersText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const askTitles = () => within(screen.getByRole('list', { name: CS.ASKS })).getAllByRole('listitem').map((r) => r.querySelector('h3')?.textContent);

describe('What customers are saying (spec §2.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the skeleton until the scope and the data land, then the four sections in order', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/customers?scope=team');
    expect(screen.getByRole('status', { name: CS.LOADING })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: CS.ASKS })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: CS.LOADING })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([CS.ASKS, CS.ANOMALIES, CS.SCORES, CS.SENTIMENT]);
    expect(requests(spy, 'GET', '/customers/')).toEqual(['/brain/customers/?scope=team']);
  });

  it('reads each section for the scope, with See all and See on the graph carrying it', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    expect(await screen.findByText('Planned · $182.0K · 3 companies · 12 asks, up from 7')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ASKS })).toHaveAttribute('href', '/brain/requests?scope=team');
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ANOMALIES })).toHaveAttribute('href', '/brain/anomalies?scope=team');
    expect(screen.getByRole('link', { name: CS.GRAPH })).toHaveAttribute('href', '/brain/graph?scope=team');
    expect(screen.getByText('down 7 pts from +25')).toBeInTheDocument();
    expect(screen.getByText('4 contacts negative', { exact: false })).toBeInTheDocument();
  });

  it('says Top 5 of 7 in Company', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=company');
    expect(await screen.findByText(/Top/)).toHaveTextContent('Top 5 of 7');
    expect(askTitles()).toHaveLength(5);
  });

  it('shows every section’s empty state on an empty book', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=me');
    expect(await screen.findByText('No asks from your customers yet.')).toBeInTheDocument();
    expect(screen.getByText(CS.NO_ANOMALIES)).toBeInTheDocument();
    expect(screen.getAllByText(CS.NOT_ENOUGH)).toHaveLength(3);
    expect(screen.getByText(CS.NO_COMMENTS)).toBeInTheDocument();
    expect(screen.getByText(CS.NOBODY_TURNED)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: CS.SEE_ALL_ASKS })).toBeNull();
  });

  it('shows the skeleton, not the previous scope’s rows, while a switch is in flight', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/customers?scope=team');
    expect(await screen.findByRole('list', { name: CS.ASKS })).toBeInTheDocument();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/customers/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByRole('status', { name: CS.LOADING })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: CS.ASKS })).toBeNull();
    release();
    await waitFor(() => expect(askTitles()).toEqual(['SSO with Okta', 'CSV export', 'Audit log', 'Slack alerts', 'Dark mode']));
  });

  it('says it could not load, and reads again on Try again', async () => {
    stubBrain({ failCustomers: 1 });
    renderBrain('/brain/customers?scope=team');
    expect(await screen.findByText(CS.LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: CS.ASKS })).toBeInTheDocument();
  });

  it('drops back to the default view with the notice on a 403', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain/customers?scope=team');
    revoke('team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toHaveFocus();
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=company'));
  });

  it('moves focus to the section the URL names once the data is in, and a section link keeps ?scope=', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team&section=scores');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: CS.SCORES })).toHaveFocus());
    await userEvent.click(within(screen.getByRole('navigation', { name: CS.SECTIONS })).getByRole('link', { name: CS.SENTIMENT }));
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=team&section=sentiment'));
  });

  it('is open to a member without view_all_accounts, with one scope as a label', async () => {
    stubBrain({ offered: ['me'], viewAll: false });
    renderBrain('/brain/customers', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=me'));
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('stacks at 375px with the switch as a select and wrapping section links', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team', { width: 375 });
    expect(await screen.findByRole('combobox', { name: 'View' })).toHaveValue('team');
    expect(screen.getByRole('heading', { level: 1, name: CS.TITLE }).closest('header')).toHaveClass('flex-col', 'sm:flex-row');
    expect(screen.getByRole('navigation', { name: CS.SECTIONS })).toHaveClass('flex-wrap');
  });
});
```

In `src/pages/brain/BrainRoutes.test.tsx`, add `vi.mock('./Customers', () => ({ CustomersPage: () => <h1>What customers are saying</h1> }));` beside the other mocks, and add:

```tsx
  it('opens What customers are saying to everyone (customers spec §2.1)', () => {
    renderAt('/brain/customers', 'csm');
    expect(screen.getByRole('heading', { name: 'What customers are saying' })).toBeInTheDocument();
    expect(where()).toBe('/brain/customers');
  });
```

In `src/components/layout/Navbar.test.tsx`, after the `/brain/doing` test, add:

```tsx
  it('titles /brain/customers without a heading, so "What customers are saying" is the only h1 (customers plan Decision 13)', () => {
    renderNavbar('/brain/customers');
    expect(screen.getByText('Brain')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/Customers.test.tsx src/pages/brain/BrainRoutes.test.tsx src/components/layout/Navbar.test.tsx`
Expected: FAIL — `Failed to resolve import "./Customers"`, and the Navbar test finds an `h1`.

- [ ] **Step 3: Write the skeleton, the page, the route and the title**

Create `src/components/brain/CustomersSkeleton.tsx`:

```tsx
import { CS } from '../../features/brain/customersText';
import { LIST } from './styles';

const BAR = 'block animate-pulse rounded bg-subtle';

/** The page's shape while it loads: four sections of two rows. */
export function CustomersSkeleton() {
  return (
    <div role="status" aria-label={CS.LOADING} className="flex flex-col gap-6">
      {[0, 1, 2, 3].map((section) => (
        <div key={section} aria-hidden="true" className="flex flex-col gap-3">
          <span className={`${BAR} h-4 w-32`} />
          <ul className={LIST}>
            {[0, 1].map((row) => (
              <li key={row} className="flex flex-col gap-2 px-4 py-3">
                <span className={`${BAR} h-4 w-2/3`} />
                <span className={`${BAR} h-3 w-48`} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

Create `src/pages/brain/Customers.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Network } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AnomalyList, AskList, SeeAll } from '../../components/brain/CustomerLists';
import { CustomersSkeleton } from '../../components/brain/CustomersSkeleton';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { ScoresPanel } from '../../components/brain/ScoresPanel';
import { SentimentPanel } from '../../components/brain/SentimentPanel';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useScopedRead } from '../../components/brain/useScopedRead';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../../components/organizations/portfolio/styles';
import { fetchCustomers } from '../../features/brain/brainApi';
import { graphHref } from '../../features/brain/brainText';
import { CS, CUSTOMER_SECTIONS, customerSectionOf, type CustomerSectionKey } from '../../features/brain/customersText';
import { withSection } from '../../features/brain/doingText';

const headingId = (key: CustomerSectionKey) => `customers-${key}`;

function Section({ id, title, action, children }: { id: CustomerSectionKey; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={headingId(id)} data-section={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId(id)} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** /brain/customers: What customers are saying (spec
 *  2026-10-05-brain-customers-design §2.1), for every member, scoped Me · My
 *  team · Company: what the scope's customers ask for, what is going wrong,
 *  how they score us, and how they feel. Reads only. */
export function CustomersPage() {
  const brain = useBrainScope();
  const scope = brain.scope;
  const read = useScopedRead(scope, fetchCustomers, brain.refused, CS.LOAD);
  const data = read.data;
  const [params] = useSearchParams();
  const { search } = useLocation();
  const section = customerSectionOf(params.get('section'));
  const landed = useRef<CustomerSectionKey | null>(null);
  const [today] = useState(() => new Date());

  // Plan Decision 3: a section named in the URL takes focus once the data is here.
  useEffect(() => {
    if (!data || !section || landed.current === section) return;
    landed.current = section;
    const heading = document.getElementById(headingId(section));
    heading?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  }, [data, section]);

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (read.error) body = <ErrorBlock message={read.error} onRetry={read.retry} />;
  else if (!scope || !data) body = <CustomersSkeleton />;
  else
    body = (
      <>
        <Section id="asks" title={CS.ASKS} action={<SeeAll page="requests" scope={scope} shown={data.asks.top.length} total={data.asks.total} />}>
          <AskList asks={data.asks.top} scope={scope} currency={data.currency} />
        </Section>
        <Section
          id="anomalies"
          title={CS.ANOMALIES}
          action={<SeeAll page="anomalies" scope={scope} shown={data.anomalies.top.length} total={data.anomalies.total} />}
        >
          <AnomalyList anomalies={data.anomalies.top} currency={data.currency} />
        </Section>
        <Section id="scores" title={CS.SCORES}>
          <ScoresPanel scores={data.scores} />
        </Section>
        <Section id="sentiment" title={CS.SENTIMENT}>
          <SentimentPanel sentiment={data.sentiment} today={today} />
        </Section>
      </>
    );

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-2 py-4 sm:px-4 lg:py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="font-display text-[22px] text-ink">{CS.TITLE}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {scope ? (
              <Link to={graphHref(scope)} className={`${QUIET} gap-1.5`}>
                <Network className="h-4 w-4" aria-hidden="true" />
                {CS.GRAPH}
              </Link>
            ) : null}
            {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
          </div>
        </header>
        <nav aria-label={CS.SECTIONS} className="-mt-3 flex flex-wrap gap-1">
          {CUSTOMER_SECTIONS.map((s) => (
            <Link
              key={s.key}
              to={{ search: withSection(search, s.key) }}
              replace
              aria-current={section === s.key ? 'location' : undefined}
              onClick={() => {
                if (section === s.key) document.getElementById(headingId(s.key))?.focus();
              }}
              className={`${QUIET} ${section === s.key ? 'bg-subtle' : 'text-ink-muted'}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
        {body}
      </div>
    </div>
  );
}
```

Note: landing on `?section=` uses the same once-per-section ref as `Doing.tsx`; a section link changes `section`, so the effect focuses the new heading.

In `src/pages/brain/BrainRoutes.tsx`, add `import { CustomersPage } from './Customers';` and `<Route path="customers" element={<CustomersPage />} />` after the `doing` route; add "What customers are saying (customers spec §2.1)" to the doc comment's list of pages open to every member.

In `src/components/layout/Navbar.tsx`, change the comment to name `/brain/customers` (customers plan Decision 13) and the test to:

```ts
  const isBrainHome = /^\/brain(\/waiting|\/doing|\/customers)?\/?$/.test(location.pathname);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/brain src/components/layout/Navbar.test.tsx && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/CustomersSkeleton.tsx src/pages/brain/Customers.tsx src/pages/brain/Customers.test.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx
git commit -m "feat(brain): What customers are saying at /brain/customers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Feature Requests and Anomalies read the scope and open to every member

Spec §2.2, Decision 2; Contract notes 1–3; plan Decisions 9, 10.

**Files:**
- Modify: `src/pages/brain/FeatureRequests.tsx`, `src/pages/brain/Anomalies.tsx`, `src/pages/brain/BrainRoutes.tsx`
- Test: `src/pages/brain/FeatureRequests.test.tsx`, `src/pages/brain/Anomalies.test.tsx`, `src/pages/brain/BrainRoutes.test.tsx`

**Interfaces:**
- Consumes: Task 2's `fetchRequests(status, scope)`, `fetchRequest(id, scope)`, `fetchAnomalies(status, scope)`, `fetchAnomaly(id, scope)`, stub options `requestRows`, `anomalyRows`, fixtures `CARL_REQUEST_ROWS`; `useBrainScope`, `ScopeSwitch`, `LostAccessNotice`; `renderBrain`.
- Produces: `/brain/requests`, `/brain/anomalies` (and `/brain/graph`) routed for every member; both pages scoped.

- [ ] **Step 1: Move the existing page tests onto the stub, and write the failing scope tests**

In both `src/pages/brain/FeatureRequests.test.tsx` and `src/pages/brain/Anomalies.test.tsx`:

1. Delete the module-level `vi.stubGlobal('fetch', fetchMock);`, and update the header comment: "The Brain's scope reads go to the contract stub (customers spec §2.2); every other call passes through to `fetchMock`."
2. Add imports: `afterEach` (vitest), `waitFor` (testing-library), `import { SAY } from '../../features/brain/brainText';`, `import { requests, stubBrain } from '../../features/brain/testBrain';`, `import { CARL } from '../../features/brain/testWaitingFixtures';`, `import { renderBrain } from './testPages';` (FeatureRequests also `import { CARL_REQUEST_ROWS } from '../../features/brain/testCustomersFixtures';`).
3. First line of `renderPage`: `stubBrain(role === 'admin' ? { passThrough: fetchMock } : { passThrough: fetchMock, offered: ['me'], viewAll: false });`
4. Add `afterEach(() => vi.unstubAllGlobals());` to the existing `describe`.
5. In "filters by status", the URL now carries the scope (the default for an admin is Company): FeatureRequests `toMatch(/\/requests\/\?status=planned&scope=company$/)`; Anomalies `toMatch(/\/anomalies\/\?status=resolved&scope=company$/)`.

Append to `src/pages/brain/FeatureRequests.test.tsx`:

```tsx
describe('Feature Requests in a scope (customers spec §2.2)', () => {
  const where = () => screen.getByTestId('where').textContent;
  afterEach(() => vi.unstubAllGlobals());

  it('reads the scope in the URL, and reads again on a switch', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    expect(await screen.findByText('SSO with Okta')).toBeInTheDocument();
    expect(screen.queryByText('CSV export')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(await screen.findByText('CSV export')).toBeInTheDocument();
    expect(requests(spy, 'GET', '/requests/')).toEqual(['/requests/?scope=team', '/requests/?scope=company']);
  });

  it('drops to the skeleton, not the last view’s rows, while a switch is in flight', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    await screen.findByText('SSO with Okta');
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/requests/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByRole('status', { name: 'Loading feature requests' })).toBeInTheDocument();
    expect(screen.queryByText('SSO with Okta')).toBeNull();
    release();
    expect(await screen.findByText('CSV export')).toBeInTheDocument();
  });

  it('opens to a member without view_all_accounts, on their own book, with no curation', async () => {
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, requestRows: { me: CARL_REQUEST_ROWS } });
    renderBrain('/brain/requests', { role: 'csm', user: CARL });
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=me'));
    expect(await screen.findByText('$120.0K')).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gather asks' })).toBeNull();
    expect(requests(spy, 'GET', '/requests/')).toEqual(['/requests/?scope=me']);
  });

  it('opens a request in the same scope', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    await userEvent.click(await screen.findByRole('button', { name: 'Open SSO with Okta' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'SSO with Okta' })).toBeInTheDocument();
    expect(requests(spy, 'GET', '/requests/2/')).toEqual(['/requests/2/?scope=team']);
  });

  it('drops back to the default view with the notice on a 403', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    revoke('team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=company'));
  });
});
```

Also add to the existing `describe('FeatureRequestsPage')` (Contract note 3):

```tsx
  it('keeps the scoped figures when a status change answers with the unscoped detail', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]))
      .mockResolvedValueOnce(jsonResponse(200, requestFull()))
      .mockResolvedValueOnce(jsonResponse(200, requestFull({ status: 'planned', arr: '900000' })))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow({ status: 'planned' })]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Slack alerts' }));
    await screen.findByRole('list', { name: 'Evidence' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'planned');
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('planned'));
    expect(screen.getByText('$200,000.00')).toBeInTheDocument();
    expect(screen.queryByText('$900,000.00')).toBeNull();
  });
```

Append to `src/pages/brain/Anomalies.test.tsx`:

```tsx
describe('Anomalies in a scope (customers spec §2.2)', () => {
  const where = () => screen.getByTestId('where').textContent;
  afterEach(() => vi.unstubAllGlobals());

  it('reads the scope in the URL with the title the server gated, and reads again on a switch', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    expect(await screen.findByText('Similar reports across 2 of your companies')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
    expect(requests(spy, 'GET', '/anomalies/')).toEqual(['/anomalies/?scope=team', '/anomalies/?scope=company']);
  });

  it('opens to a member without view_all_accounts, with no Look now', async () => {
    stubBrain({ reader: CARL, offered: ['me'], viewAll: false });
    renderBrain('/brain/anomalies', { role: 'csm', user: CARL });
    await waitFor(() => expect(where()).toBe('/brain/anomalies?scope=me'));
    expect(await screen.findByText(/Nothing unusual/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Look now' })).toBeNull();
  });

  it('drops back to the default view with the notice on a 403', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    revoke('team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/anomalies?scope=company'));
  });
});
```

In `src/pages/brain/BrainRoutes.test.tsx`, replace the `keeps %s behind view_all_accounts` test and the `routes %s for view_all_accounts as before` test with:

```tsx
  it.each([
    ['/brain/graph', 'Knowledge graph'],
    ['/brain/requests', 'Feature requests'],
    ['/brain/anomalies', 'Anomalies'],
  ])('opens %s to everyone (customers plan Decision 10)', (url, heading) => {
    renderAt(url, 'csm');
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(where()).toBe(url);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/FeatureRequests.test.tsx src/pages/brain/Anomalies.test.tsx src/pages/brain/BrainRoutes.test.tsx`
Expected: FAIL — no `scope=` on the list URLs, no switch, `/brain/requests` redirects a CSM to `/dashboard`, and the PATCH answer's `$900,000.00` replaces the scoped figure.

- [ ] **Step 3: Scope Feature Requests**

In `src/pages/brain/FeatureRequests.tsx`:

1. Imports: add `import { LostAccessNotice } from '../../components/brain/LostAccessNotice';`, `import { ScopeSwitch } from '../../components/brain/ScopeSwitch';`, `import { useBrainScope } from '../../components/brain/useBrainScope';`, `import type { ScopeKey } from '../../features/brain/brainTypes';`.
2. In `FeatureRequestsPage`, after `const mayCurate = …`, add:

```tsx
  const brain = useBrainScope();
  const scope = brain.scope;
  const { refused } = brain;
```

3. Replace the `key` / `rows` / `error` lines and the list `useEffect` with:

```tsx
  // Customers spec §2.2: read only once ?scope= settles, keyed by scope so a
  // switch drops to the skeleton rather than showing the last view's rows.
  const key = scope ? `${scope}:${filter}#${attempt}` : null;
  const rows = key !== null && loaded?.key === key ? loaded.rows : null;
  const error = key !== null && failed?.key === key ? failed.message : null;
  const shownError = brain.error ?? error;

  useEffect(() => {
    if (!scope || key === null) return;
    let cancelled = false;
    fetchRequests(filter, scope)
      .then((next) => {
        if (cancelled) return;
        if (!Array.isArray(next)) throw new Error('unexpected response');
        setLoaded({ key, rows: next });
      })
      .catch((err) => {
        if (cancelled || refused(err)) return;
        setFailed({ key, message: errorText(err, 'Could not load feature requests.') });
      });
    return () => {
      cancelled = true;
    };
  }, [filter, key, scope, refused]);

  const refusedDetail = useCallback(
    (err: unknown) => {
      if (!refused(err)) return false;
      setOpenId(null);
      return true;
    },
    [refused],
  );
```

4. Change `if (openId !== null) {` to `if (openId !== null && scope) {` and pass `scope={scope}` and `onRefused={refusedDetail}` to `RequestDetail`.
5. Replace the header `<div className="flex items-start justify-between gap-4">` with `<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">`, and wrap the Gather button with the switch:

```tsx
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
          {mayCurate && ( /* the existing Gather asks button, unchanged */ )}
        </div>
      </div>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
```

6. Replace the list's `{error ? (` error paragraph with:

```tsx
      {shownError ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {shownError}{' '}
          <button type="button" onClick={brain.error ? brain.retry : () => setAttempt((n) => n + 1)} className={`underline rounded-sm ${FOCUS}`}>
            Retry
          </button>
        </p>
      ) : rows === null ? (
```

7. `RequestDetail` gains `scope: ScopeKey` and `onRefused: (err: unknown) => boolean` in its props; its `load` reads the scoped detail and hands a refusal back:

```tsx
  const load = useCallback(() => {
    let cancelled = false;
    fetchRequest(id, scope)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled || onRefused(err)) return;
        setError(errorText(err, 'Could not load this request.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, scope, onRefused]);
```

8. In `setStatus`, keep the scoped figures (Contract note 3): replace `setDetail(await updateRequest(id, { status }));` with:

```tsx
      const saved = await updateRequest(id, { status });
      // The PATCH answers unscoped (Contract note 3): take its status and
      // owner, keep this scope's figures.
      setDetail((last) => (last ? { ...last, status: saved.status, owner: saved.owner } : saved));
```

- [ ] **Step 4: Scope Anomalies the same way**

In `src/pages/brain/Anomalies.tsx`, apply steps 1–6 above with these names: `fetchAnomalies(filter, scope)`, fallback `'Could not load anomalies.'`, the detail component `AnomalyPane`, the header's button Look now. Then in `AnomalyPane` (props gain `scope: ScopeKey` and `onRefused: (err: unknown) => boolean`):

```tsx
  useEffect(() => {
    alive.current = true;
    fetchAnomaly(id, scope)
      .then((next) => {
        if (alive.current) {
          setDetail(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!alive.current || onRefused(err)) return;
        setError(errorText(err, 'Could not load this cluster.'));
      });
    return () => {
      alive.current = false;
    };
  }, [id, scope, onRefused]);
```

and in `change`, replace `if (alive.current) setDetail(next);` with:

```tsx
      if (alive.current) setDetail((last) => (last ? { ...last, status: next.status, acknowledged_by: next.acknowledged_by } : next));
```

- [ ] **Step 5: Open the three pages to every member**

In `src/pages/brain/BrainRoutes.tsx`, delete the `RequireCapability` / `Outlet` block and its two imports, and route the three pages plainly after `customers`:

```tsx
      <Route path="graph" element={<GraphPage />} />
      <Route path="requests" element={<FeatureRequestsPage />} />
      <Route path="anomalies" element={<AnomaliesPage />} />
```

Update the doc comment: every Brain page is open to every signed-in member; curation on Feature Requests and Anomalies stays `view_all_accounts` (customers plan Decision 10).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/brain && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/brain/FeatureRequests.tsx src/pages/brain/FeatureRequests.test.tsx src/pages/brain/Anomalies.tsx src/pages/brain/Anomalies.test.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx
git commit -m "feat(brain): Feature Requests and Anomalies read the scope and open to every member

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The Knowledge graph scoped and open; What changed links to it

Spec §2.2, Decision 5; Contract notes 8, 9; plan Decisions 1, 11, 12.

**Files:**
- Modify: `src/pages/brain/Graph.tsx`, `src/pages/brain/WhatChanged.tsx`, `src/components/brain/MovesList.tsx`, `src/features/brain/brainText.ts` (`SAY`), `src/store.ts:24,60`
- Delete: `src/features/graph/graphSlice.ts`
- Test: `src/pages/brain/Graph.test.tsx` (rewrite), `src/pages/brain/WhatChanged.test.tsx`, `src/components/brain/MovesList.test.tsx`

**Interfaces:**
- Consumes: Task 1's `graphHref`, `driverFilter`; Task 2's `fetchBrainGraph`, `graphTypes`, `CARL_GRAPH`, `ME_GRAPH`, `EMPTY_GRAPH`, stub `graphs`, `failGraph`; Task 3's `useScopedRead`.
- Produces: `SAY.GRAPH_LOAD`, `SAY.GRAPH_LOADING`, `SAY.GRAPH_EMPTY`, `SAY.GRAPH_EMPTY_DETAIL`, `graphHiddenText(n)` (brainText); the scoped `GraphPage`.

- [ ] **Step 1: Write the failing tests**

Replace `src/pages/brain/Graph.test.tsx` with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { CARL_GRAPH, EMPTY_GRAPH } from '../../features/brain/testCustomersFixtures';
import { CARL } from '../../features/brain/testWaitingFixtures';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;

describe('Knowledge graph (customers spec §2.2, Decision 5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the scope’s nodes and relations, and opens a node into its figures and neighbours', async () => {
    const user = userEvent.setup();
    const { spy } = stubBrain();
    renderBrain('/brain/graph?scope=team');
    const pizzaHut = await screen.findByRole('button', { name: 'customer Pizza Hut' });
    expect(screen.getAllByRole('button', { name: /^(owner|customer|product|initiative|proposal) / })).toHaveLength(8);
    expect(document.querySelectorAll('path[data-kind]')).toHaveLength(8);
    expect(screen.getByText(/8 nodes, 8 relations/)).toBeInTheDocument();
    expect(requests(spy, 'GET', 'graph/')).toEqual(['/brain/graph/?scope=team']);

    await user.click(pizzaHut);
    const detail = screen.getByRole('complementary', { name: 'Details for Pizza Hut' });
    expect(within(detail).getByText('$69.6K')).toBeInTheDocument();
    expect(within(detail).getByText('overdue by 34 days')).toBeInTheDocument();
    expect(within(detail).getByText('Carl CSM')).toBeInTheDocument();
    expect(within(detail).getByText('Analytics Suite')).toBeInTheDocument();
    expect(within(detail).getByText('Save play on Pizza Hut')).toBeInTheDocument();
    expect(within(detail).queryByText('Fine')).not.toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: /Open the organization/ })).toHaveAttribute('href', '/organizations/7');
    await user.click(within(detail).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('filters to the accounts carrying downside and everything they connect to', async () => {
    const user = userEvent.setup();
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await screen.findByRole('button', { name: 'customer Pizza Hut' });
    await user.click(screen.getByLabelText('Only accounts carrying downside'));
    expect(screen.queryByRole('button', { name: 'customer Fine' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 5 of 8 nodes and 4 of 8 relations/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText(/8 nodes, 8 relations/)).toBeInTheDocument();
  });

  it('opens to a member without view_all_accounts, on their own book', async () => {
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, graphs: { me: CARL_GRAPH } });
    renderBrain('/brain/graph', { role: 'csm', user: CARL });
    await waitFor(() => expect(where()).toBe('/brain/graph?scope=me'));
    expect(await screen.findByText(/6 nodes, 6 relations/)).toBeInTheDocument();
    expect(screen.queryByText(/view-all-accounts/)).toBeNull();
    expect(requests(spy, 'GET', 'graph/')).toEqual(['/brain/graph/?scope=me']);
  });

  it('reads again on a switch and draws only the new scope', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await screen.findByRole('button', { name: 'customer Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    expect(await screen.findByText(/3 nodes, 2 relations/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'customer Pizza Hut' })).toBeNull();
  });

  it('starts on the owner a link names (What changed’s drivers), and ignores one not in this scope', async () => {
    stubBrain();
    const first = renderBrain('/brain/graph?scope=team&owner=owner%3A1');
    expect(await screen.findByText(/Showing 4 of 8 nodes and 3 of 8 relations/)).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toHaveValue('owner:1');
    first.unmount();
    renderBrain('/brain/graph?scope=team&owner=owner%3A99');
    expect(await screen.findByText(/8 nodes, 8 relations/)).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toHaveValue('');
  });

  it('counts the customers in this view the reader can’t open (Contract note 8)', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=company');
    expect(await screen.findByText("2 more customers in this view you can't open")).toBeInTheDocument();
  });

  it('shows the skeleton, then Try again on a failed read', async () => {
    stubBrain({ failGraph: 1 });
    renderBrain('/brain/graph?scope=team');
    expect(screen.getByRole('status', { name: SAY.GRAPH_LOADING })).toBeInTheDocument();
    expect(await screen.findByText(SAY.GRAPH_LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/8 nodes, 8 relations/)).toBeInTheDocument();
  });

  it('says when the view has no customers', async () => {
    stubBrain({ graphs: { me: EMPTY_GRAPH } });
    renderBrain('/brain/graph?scope=me');
    expect(await screen.findByText(SAY.GRAPH_EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Knowledge graph' })).toBeNull();
  });
});
```

In `src/components/brain/MovesList.test.tsx`, add `import type { ChangedPayload } from '../../features/brain/brainTypes';` and `import { MemoryRouter } from 'react-router-dom';`, add the helper

```tsx
const renderList = (changed: ChangedPayload, onRefused: (err: unknown) => boolean = () => false) =>
  render(
    <MemoryRouter>
      <MovesList changed={changed} onRefused={onRefused} />
    </MemoryRouter>,
  );
```

replace every `render(<MovesList changed={X} onRefused={Y} />)` with `renderList(X, Y)` (a driver is now a router `Link`), and add:

```tsx
  it('links a product or owner driver to the graph in the same scope, and leaves other drivers as words (customers Decision 5)', () => {
    stubBrain();
    renderList(COMPANY);
    const link = within(rows()[0]).getByRole('link', { name: 'Analytics Suite on the knowledge graph' });
    expect(link).toHaveAttribute('href', '/brain/graph?scope=company&product=product%3A4');
    expect(rows()[0]).toHaveTextContent('most of it: Analytics Suite');
    expect(within(rows()[1]).queryByRole('link')).toBeNull();
    expect(rows()[1]).toHaveTextContent('most of it: Enterprise');
  });
```

In `src/pages/brain/WhatChanged.test.tsx`, replace the two "(I2)" Knowledge graph tests with:

```tsx
  it('links every member to the knowledge graph in the scope they are reading (customers Decision 5)', async () => {
    stubBrain({ offered: ['me'] });
    renderBrain('/brain', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
    expect(screen.getByRole('link', { name: SAY.KNOWLEDGE_GRAPH })).toHaveAttribute('href', '/brain/graph?scope=me');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/Graph.test.tsx src/pages/brain/WhatChanged.test.tsx src/components/brain/MovesList.test.tsx`
Expected: FAIL — the graph reads `/metrics/graph/`, no driver link, the What changed link is hidden from a CSM.

- [ ] **Step 3: Add the graph copy**

In `src/features/brain/brainText.ts`, add to `SAY`:

```ts
  GRAPH_LOAD: 'Could not load the graph.',
  GRAPH_LOADING: 'Loading the graph',
  GRAPH_EMPTY: 'No customers in this view yet',
  GRAPH_EMPTY_DETAIL: 'The graph draws the customers in this view, who owns them and what they run on.',
```

and append:

```ts
/** graph/'s `hidden` (Contract note 8). */
export function graphHiddenText(n: number | undefined): string | null {
  if (!n) return null;
  return n === 1 ? "1 more customer in this view you can't open" : `${n} more customers in this view you can't open`;
}
```

- [ ] **Step 4: Scope the graph and take it off Redux**

In `src/pages/brain/Graph.tsx`, replace the imports with:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Network, X } from 'lucide-react';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useScopedRead } from '../../components/brain/useScopedRead';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { fetchBrainGraph } from '../../features/brain/brainApi';
import { graphHiddenText, SAY } from '../../features/brain/brainText';
import type { GraphNode, GraphPayload, NodeKind } from '../../features/graph/graphTypes';
import { applyFilters } from '../../features/graph/filters';
import type { GraphFilters } from '../../features/graph/filters';
import { formatCompactMoney, formatDate } from '../../features/customers/formatters';
import type { CurrencyCode } from '../../features/auth/authSlice';
```

Leave `COLUMNS`, `FILL`, `fillFor`, `radiusFor`, `layout` and `Detail` unchanged. Replace `export function GraphPage() { … }` with:

```tsx
export function GraphPage() {
  const brain = useBrainScope();
  const scope = brain.scope;
  const graph = useScopedRead(scope, fetchBrainGraph, brain.refused, SAY.GRAPH_LOAD);
  const data = graph.data;
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  // Plan Decision 11: a link from What changed names an owner or a product.
  const [filters, setFilters] = useState<GraphFilters>(() => ({ onlyDownside: false, owner: params.get('owner'), product: params.get('product') }));
  const owners = useMemo(() => (data?.nodes ?? []).filter((n) => n.kind === 'owner'), [data]);
  const products = useMemo(() => (data?.nodes ?? []).filter((n) => n.kind === 'product'), [data]);
  // A filter naming no node in this scope's graph is dropped, not drawn as an empty picture.
  const active = useMemo<GraphFilters>(
    () => ({
      onlyDownside: filters.onlyDownside,
      owner: owners.some((o) => o.id === filters.owner) ? filters.owner : null,
      product: products.some((p) => p.id === filters.product) ? filters.product : null,
    }),
    [filters, owners, products],
  );
  const shown = useMemo(() => (data ? applyFilters(data, active) : null), [data, active]);
  const { placed, height } = useMemo(() => (shown ? layout(shown) : { placed: [], height: 160 }), [shown]);
  const filtering = active.onlyDownside || active.owner !== null || active.product !== null;
  const selectClass = 'px-2 py-1 bg-surface border border-line rounded-lg text-[12px] text-ink focus:outline-none focus:border-accent';
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const neighbourIds = useMemo(() => {
    if (!shown || !selected) return new Set<string>();
    const ids = new Set<string>();
    shown.edges.forEach((e) => {
      if (e.from === selected) ids.add(e.to);
      if (e.to === selected) ids.add(e.from);
    });
    return ids;
  }, [shown, selected]);
  const selectedNode = selected ? byId.get(selected)?.node ?? null : null;
  const dim = (id: string) => selected !== null && id !== selected && !neighbourIds.has(id);

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (graph.error) body = <ErrorBlock message={graph.error} onRetry={graph.retry} />;
  else if (!scope || !data || !shown) body = <div role="status" aria-label={SAY.GRAPH_LOADING} className="h-64 w-full animate-pulse rounded-lg bg-subtle" />;
  else if (data.nodes.length === 0) body = <EmptyState title={SAY.GRAPH_EMPTY} detail={SAY.GRAPH_EMPTY_DETAIL} action={null} />;
  else {
    const hidden = graphHiddenText(data.hidden);
    body = (
      <>
        {/* The existing filter row, unchanged except that it reads `active`:
            checked={active.onlyDownside}, value={active.owner ?? ''},
            value={active.product ?? ''}; its onChange handlers still call
            setFilters({ ...filters, … }); Clear filters still calls
            setFilters({ onlyDownside: false, owner: null, product: null }) and setSelected(null). */}
        {/* The existing svg + Detail block, unchanged (drop its `data && shown &&` guard and the `!` on `shown!.edges`). */}
        <p className="text-[11px] text-ink-faint">
          Customers are coloured by health; node size follows ARR.{' '}
          {filtering ? `Showing ${shown.nodes.length} of ${data.nodes.length} nodes and ${shown.edges.length} of ${data.edges.length} relations` : `${data.nodes.length} nodes, ${data.edges.length} relations`}, as of {formatDate(data.as_of)}.
        </p>
        {hidden ? <p className="text-[12px] text-ink-muted">{hidden}</p> : null}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* The existing title block (Company Brain label, h1 "Knowledge graph", description), unchanged. */}
        {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
      </header>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {body}
    </div>
  );
}
```

The three `{/* … */}` markers stand for the page's existing JSX moved verbatim into place (filter row, svg/Detail block, title block) with only the edits named in them; nothing else in them changes. The `!canSeeAll` warning, the `isLoading` line, the `error` paragraph, `useAppDispatch`/`useAppSelector`/`useCapability`, `ShieldAlert` and `fetchGraph` are gone.

In `src/store.ts`, delete `import graphReducer from './features/graph/graphSlice';` (line 24) and `graph: graphReducer,` (line 60). Delete `src/features/graph/graphSlice.ts` (`git rm`). Check nothing else imports it: `grep -rn "graphSlice" src` must print nothing.

- [ ] **Step 5: Link What changed to the graph**

In `src/pages/brain/WhatChanged.tsx`: drop `useCapability` and `canSeeAll`; import `graphHref` from `brainText`; the header link becomes:

```tsx
            {scope ? (
              <Link to={graphHref(scope)} className={`${QUIET} gap-1.5`}>
                <Network className="h-4 w-4" aria-hidden="true" />
                {SAY.KNOWLEDGE_GRAPH}
              </Link>
            ) : null}
```

In `src/components/brain/MovesList.tsx`: import `Link` from `react-router-dom`, `driverFilter, graphHref` from `brainText`, and `FOCUS` from `../organizations/portfolio/styles`; add

```tsx
const DRIVER_LINK = `inline-flex min-h-11 items-center font-semibold text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`;
```

and in `MoveRow` replace the `context` line and its `<p>` with:

```tsx
  const driver = signal.drivers[0] ?? null;
  const filter = driver ? driverFilter(driver) : null;
  const handover = handoverText(signal.handover);
```

```tsx
          {driver || handover ? (
            <p className="text-[11px] text-ink-muted">
              {driver ? (
                <>
                  most of it:{' '}
                  {filter ? (
                    <Link to={graphHref(changed.scope, filter)} aria-label={`${driver.label} on the knowledge graph`} className={DRIVER_LINK}>
                      {driver.label}
                    </Link>
                  ) : (
                    driver.label
                  )}
                </>
              ) : null}
              {driver && handover ? ' · ' : null}
              {handover}
            </p>
          ) : null}
```

(`driverText` stays exported in `brainText` and keeps its own tests; `MovesList` no longer imports it.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/brain src/components/brain src/features && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/pages/brain/Graph.tsx src/pages/brain/Graph.test.tsx src/pages/brain/WhatChanged.tsx src/pages/brain/WhatChanged.test.tsx src/components/brain/MovesList.tsx src/components/brain/MovesList.test.tsx src/features/brain/brainText.ts src/features/graph src/store.ts
git commit -m "feat(brain): the knowledge graph scoped and open to every member, linked from What changed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The sidebar, house rules, the journeys, the documents and the full run

Spec §2.3, §2.4; Decision 6; plan Decisions 14, 15.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/layout/Sidebar.test.tsx`, `src/components/brain/houseRules.test.ts`, `src/e2e/brain.test.tsx`, `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the Brain group as the four questions; the house-rules and journey coverage; the documents.

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Sidebar.test.tsx`, replace the test `"adds Feature Requests and Anomalies for view_all_accounts after What's being done; Initiatives is gone (Doing §2.2)"` with:

```tsx
  it.each(['csm', 'admin'] as const)('gives %s the four questions in order and nothing else of the Brain (customers spec §2.3)', async (role) => {
    renderSidebar(role);
    await screen.findByRole('link', { name: 'What changed' });
    const brain = ['What changed', 'Waiting on you', "What's being done", 'What customers are saying'].map((name) => screen.getByRole('link', { name }));
    for (let i = 1; i < brain.length; i++) {
      expect(brain[i - 1].compareDocumentPosition(brain[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(brain[3]).toHaveAttribute('href', '/brain/customers');
    for (const name of ['Feature Requests', 'Anomalies', 'Initiatives', 'Review Queue', 'Knowledge Graph', 'Brain Overview', 'Feedback Log', 'Agents', 'Skills']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('lights What customers are saying on /brain/customers, and not What changed', async () => {
    renderSidebar('csm', '/brain/customers');
    expect(await screen.findByRole('link', { name: 'What customers are saying' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'What changed' })).not.toHaveAttribute('aria-current');
  });
```

In `src/components/brain/houseRules.test.ts`:

1. Add `...raw(import.meta.glob('../../pages/brain/Customers.tsx', { query: '?raw', eager: true, import: 'default' })),` to `all`, and update the comment to name What customers are saying (Feature Requests, Anomalies and the Graph keep their own styling and stay outside, plan Decision 10).
2. Add to the coverage list: `'../../pages/brain/Customers.tsx'`, `'./CustomerLists.tsx'`, `'./ScoresPanel.tsx'`, `'./SentimentPanel.tsx'`, `'./CustomersSkeleton.tsx'`, `'./Figured.tsx'`.
3. Add `'./ScoresPanel.tsx'` and `'./Figured.tsx'` to the `MONO` list.
4. Append inside the `describe`:

```ts
  it('sets What customers are saying’s figures through Figured or MONO', () => {
    for (const file of ['./CustomerLists.tsx', './ScoresPanel.tsx', './SentimentPanel.tsx']) expect(files[file]).toMatch(/<Figured /);
  });

  it('designs What customers are saying’s loading, empty and error states', () => {
    const page = files['../../pages/brain/Customers.tsx'];
    expect(page).toMatch(/<CustomersSkeleton \/>/);
    expect(page).toMatch(/<ErrorBlock /);
    expect(files['./CustomerLists.tsx']).toMatch(/asksEmpty\(/);
    expect(files['./CustomerLists.tsx']).toMatch(/CS\.NO_ANOMALIES/);
    expect(files['./ScoresPanel.tsx']).toMatch(/CS\.NO_COMMENTS/);
    expect(files['./SentimentPanel.tsx']).toMatch(/turnedEmpty\(/);
    expect(files['./CustomersSkeleton.tsx']).toMatch(/animate-pulse/);
  });

  it('nests no card in a card: asks, anomalies, comments and sentiment rows are flat inside one bordered list', () => {
    for (const file of ['./CustomerLists.tsx', './ScoresPanel.tsx', './SentimentPanel.tsx']) {
      expect(files[file]).not.toMatch(/rounded-xl|border border-line|shadow/);
      expect(files[file]).toMatch(/\bLIST\b/);
    }
  });

  it('keeps What customers are saying free of a primary button: it only reads', () => {
    for (const file of ['../../pages/brain/Customers.tsx', './CustomerLists.tsx', './ScoresPanel.tsx', './SentimentPanel.tsx']) {
      expect(files[file]).not.toMatch(/\bPRIMARY\b/);
    }
  });
```

In `src/e2e/brain.test.tsx`, extend the header comment ("customers spec §2.4: a CSM sees only their book's asks and scores and See all carries the scope; their manager sees the team's; a CSM opens the scoped graph; a manager follows a driver from What changed to the graph"), add the imports `import { CS } from '../features/brain/customersText';` and `import { CARL_CUSTOMERS, CARL_GRAPH, CARL_REQUEST_ROWS } from '../features/brain/testCustomersFixtures';`, and append:

```tsx
describe('Brain: What customers are saying', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a CSM sees only their book’s asks and scores, See all carries the scope, and their manager sees the team’s', { timeout: 30000 }, async () => {
    const carl = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, customers: { me: CARL_CUSTOMERS }, requestRows: { me: CARL_REQUEST_ROWS } });
    const first = renderBrain('/brain/customers', { role: 'csm', user: CARL, nav: true });

    // 1. Carl's Me: his book's asks and scores only.
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=me'));
    const asks = await screen.findByRole('list', { name: CS.ASKS });
    expect(within(asks).getAllByRole('listitem').map((r) => r.querySelector('h3')?.textContent)).toEqual(['SSO with Okta', 'Slack alerts']);
    expect(within(asks).getAllByRole('listitem')[0]).toHaveTextContent('Planned · $120.0K · 2 companies · 8 asks, up from 5');
    expect(screen.queryByText('CSV export')).toBeNull();
    expect(document.querySelector('[data-score="nps"] [data-part="figure"]')).toHaveTextContent('+10');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([CS.TITLE]);

    // 2. See all opens Feature Requests on the same book.
    await userEvent.click(screen.getByRole('link', { name: CS.SEE_ALL_ASKS }));
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=me'));
    expect(await screen.findByText('$120.0K')).toBeInTheDocument();
    expect(requests(carl.spy, 'GET', '/requests/')).toEqual(['/requests/?scope=me']);
    first.unmount();
    vi.unstubAllGlobals();

    // 3. Alice, his manager, in My team: the team's figures.
    stubBrain({ reader: ALICE, offered: ['me', 'team'], viewAll: false });
    renderBrain('/brain/customers?scope=team', { role: 'csm', nav: true });
    const team = await screen.findByRole('list', { name: CS.ASKS });
    expect(within(team).getAllByRole('listitem')[0]).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(document.querySelector('[data-score="nps"] [data-part="change"]')).toHaveTextContent('down 7 pts from +25');
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ASKS })).toHaveAttribute('href', '/brain/requests?scope=team');
  });

  it('a CSM opens the graph from the page, scoped to their book, and nothing reads the organisation-wide graph', { timeout: 30000 }, async () => {
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, customers: { me: CARL_CUSTOMERS }, graphs: { me: CARL_GRAPH } });
    renderBrain('/brain/customers', { role: 'csm', user: CARL, nav: true });
    await userEvent.click(await screen.findByRole('link', { name: CS.GRAPH }));
    await waitFor(() => expect(where()).toBe('/brain/graph?scope=me'));
    expect(await screen.findByRole('button', { name: 'customer Pizza Hut' })).toBeInTheDocument();
    expect(requests(spy, 'GET', 'graph/')).toEqual(['/brain/graph/?scope=me']);
  });

  it('a manager follows a product driver from What changed to the graph, on that product', { timeout: 30000 }, async () => {
    stubBrain();
    renderBrain('/brain?scope=company', { nav: true });
    await userEvent.click(await screen.findByRole('link', { name: 'Analytics Suite on the knowledge graph' }));
    await waitFor(() => expect(where()).toBe('/brain/graph?scope=company&product=product%3A4'));
    await waitFor(() => expect(screen.getByLabelText('Product')).toHaveValue('product:4'));
    expect(screen.getByText(/Showing 10 of 10 nodes/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/layout/Sidebar.test.tsx src/components/brain/houseRules.test.ts src/e2e/brain.test.tsx`
Expected: FAIL — no "What customers are saying" link, Feature Requests and Anomalies still listed for an admin. (The house rules and journeys should already pass; if one fails, fix the component, not the rule.)

- [ ] **Step 3: The sidebar**

In `src/components/layout/Sidebar.tsx`: add `MessagesSquare` to the lucide import and remove `Lightbulb` and `Radar` (no other use in the file); delete `const canSeeAll = useCapability('view_all_accounts');` (`useCapability` stays imported for `canManageUsers`); replace the `{canSeeAll ? (<>…Feature Requests…Anomalies…</>) : null}` block with:

```tsx
        <NavItem to="/brain/customers" icon={<MessagesSquare className="w-5 h-5" />} label="What customers are saying" />
```

and rewrite the group's comment: "KNOWLEDGE BRAIN (spec 2026-10-05 §2.1; Waiting §2.2; Doing §2.2; customers §2.3): the four questions, for every member: What changed, Waiting on you (with the reader's Me count), What's being done, What customers are saying. Feature Requests and Anomalies open from What customers are saying's See all; the Knowledge graph from What changed and What customers are saying; Agents, Skills and Feedback Log live in Settings > AI."

- [ ] **Step 4: The documents**

`docs/03-ui-ux-design.md`, after "### Brain: What's being done", add:

```markdown
### Brain: What customers are saying

Spec `docs/superpowers/specs/2026-10-05-brain-customers-design.md` §2. Same
folder and house-rules suite as What changed.

- **Header.** An `h1` at 22px in DM Serif Display ("What customers are
  saying"), a quiet "See on the graph" link (Lucide `Network`) to the graph in
  the same scope, the same scope switch, and section links (Asks · Anomalies ·
  Scores · Sentiment) that set `?section=` and move focus to that heading.
- **Asks and Anomalies.** One bordered list each, `divide-y`, rows flat: the
  title, then "Planned · $182.0K · 3 companies · 12 asks, up from 7" /
  "Live · $90.0K · 2 companies · last seen 4 Oct", figures in DM Mono, status in
  words. The header says "Top 5 of 7" when there are more, and See all (the
  bordered button) opens the full page in the same scope.
- **Scores.** NPS, CSAT and CES side by side from `sm` (stacked below), one
  bordered surface: the figure at 22px in DM Mono, the change as a sentence
  ("down 7 pts from +25") in its trend colour, never colour alone, and "22
  answers · 19 before"; "Not enough answers" under 5. Latest comments below as
  a sibling list: "NPS 4 · Uber · 3 Oct", the record linked, then the comment;
  "N more comments on records you can't open".
- **Sentiment.** "4 contacts negative", then who turned negative in the last
  30 days (or "since 20 Sep, when we started tracking changes"): the contact
  and the record linked, "was neutral · 2 Oct".
- **States.** A skeleton of four sections, "Try again" on error, an empty line
  per section. No primary button: the page only reads.
- **Sidebar.** What customers are saying (Lucide `MessagesSquare`) after
  What's being done, for every member. Feature Requests and Anomalies have
  left the sidebar: the Brain group is the four questions.
```

In the same file, change "on `/brain`, `/brain/waiting` and `/brain/doing`" to "on `/brain`, `/brain/waiting`, `/brain/doing` and `/brain/customers`".

`docs/04-app-flow.md`:
- Route table: add `| /brain/customers | CustomersPage: What customers are saying, scoped Me / My team / Company (?scope=), sections in ?section= | auth |`; change the `/brain/{graph,requests,anomalies}` row to "one page each, scoped by `?scope=` with the same switch (curation on requests and anomalies stays `view_all_accounts`) | auth".
- §4.5b step 1 and §4.5d step 1: add "It reads `?scope=` (Me, My team, Company) through the Brain's scope switch, sends it on the list and on each detail, and is open to every member; See all on What customers are saying lands here in the same scope. A status change keeps the scope's figures (the PATCH answers unscoped)."
- §4.11: replace the sentences from "A quiet "Knowledge graph" link" to "still behind `view_all_accounts`." with: "A quiet "Knowledge graph" link (Lucide `Network`) sits in the header for every member, to `/brain/graph?scope=<scope>`; a driver that is a product or an owner links to the graph on that node. The graph reads `GET /brain/graph/?scope=` for every member, starts on `?owner=` / `?product=` when a link names one, and counts the scope's customers the reader can't open." Then add a paragraph: "What customers are saying (`/brain/customers`, spec 2026-10-05 customers §2) is open to every member, on the same scope switch: `GET /brain/customers/?scope=` gives the top 5 asks and anomalies in the scope (ranked by the ARR in it, with totals; See all opens `/brain/requests?scope=` or `/brain/anomalies?scope=`), NPS, CSAT and CES for the last 90 days against the 90 before (null under 5 answers in a window; CES on organisations only) with this window's latest comments the reader may open and a count of the rest, and the scope's negative contacts with who turned negative in the last 30 days (`tracking_since` null until the first recorded change). Reads only."

`.agents/workflows/repo-architecture.md`:
- Line 53 (`features/brain/`): append "; What customers are saying's copy (`customersText.ts`) and types; `scopeQuery.ts`; testCustomersFixtures.ts".
- Line 72 (`components/brain/`): add "useScopedRead, Figured, CustomerLists, ScoresPanel, SentimentPanel, CustomersSkeleton" to the list.
- Line 90 (`pages/brain/`): "BrainRoutes; WhatChangedPage, WaitingPage, DoingPage, CustomersPage (/brain/customers), Graph, FeatureRequests, Anomalies, every member (the last three scoped; curation `view_all_accounts`); testPages.tsx (renderBrain)".
- Line 147: "BrainRoutes (every page open to all; `/brain/review` and `/brain/initiatives` redirect)".
- If a `features/graph/` line exists, it reads "graphTypes.ts, filters.ts (no slice)"; add one beside `features/brain/` if none does.

- [ ] **Step 5: The full run**

Run, one at a time:
- `npx vitest run` → all pass.
- `npm run lint` → 0 errors, 15 warnings (the baseline).
- `npm run build` → succeeds.
- `grep -rn "graphSlice\|RequireCapability" src/pages/brain src/store.ts` → nothing.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/brain/houseRules.test.ts src/e2e/brain.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): What customers are saying journeys, house rules, sidebar and product documents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage.** §2.1 header, switch, section links → Task 5; Asks/Anomalies with See all → Tasks 3, 5; Scores with the previous window, under-5 rule, comments, hidden → Tasks 1, 4; Sentiment with "since we started tracking changes" → Tasks 1, 4; See on the graph → Task 5; states and 375px → Tasks 3–5. §2.2 Feature Requests and Anomalies scoped with curation unchanged → Task 6; the graph scoped and open → Task 7. §2.3 sidebar → Task 8. §2.4 tests: each section in each scope (Tasks 3–5), scores against the previous window and the under-5 rule (Tasks 1, 4), comment gating and hidden count (Task 4), turned-negative and tracking state (Tasks 1, 4), See all carrying the scope (Tasks 3, 5, 8), the graph scoped and open to a member (Tasks 7, 8), house rules (Task 8), a contract stub (Task 2), the e2e (Task 8). Decisions 5–6 (graph links, sidebar) → Tasks 7, 8. §3 shapes → Task 1 types, Task 2 fixtures. Backend reconciliation → Contract notes 1–10, fixtures (`arr` number vs string, `type` on records, `hidden` on graph, CES org-only, per-window nulls, PATCH unscoped → Task 6 step 3.8).
- **Placeholders.** None; the three `{/* … */}` markers in Task 7 name existing JSX moved verbatim with the exact edits.
- **Type consistency.** `useScopedRead(scope, read, onRefused, fallback)` in Tasks 3, 5, 7; `SeeAll({ page, scope, shown, total })` in Tasks 3, 5; `CS.SEE_ALL_ASKS` / `CS.TURNED_LIST` defined in Task 1 and used in Tasks 3, 4, 8; `withScope(path, scope?, status?)` in Task 2 only; `graphHref(scope, filter?)` / `driverFilter` in Tasks 1, 5, 7; `GraphPayload.hidden?` in Tasks 2, 7; fixtures' names match their uses.
