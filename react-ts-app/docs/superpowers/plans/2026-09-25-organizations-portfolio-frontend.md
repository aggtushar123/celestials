# Organizations portfolio, frontend (delivery 1: portfolio data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 34-column Organizations table on `/organizations/list` with the portfolio page: grouped account rows, opened rows showing six panels, five clickable summary tiles, URL-based filters with chips, pinned field chips, selection mode with bulk actions, CSV export and phone layouts. All data comes from the new `GET /organizations/portfolio/`.

**Architecture:** A small `src/features/organizations/` module holds the §2 contract types, the API calls, the URL-state parser and the field registry. It adds no Redux slice: the list is page-local, like the dashboard's attention list, and the name `portfolio` is already taken by `features/portfolio/portfolioSlice.ts` (`/customers/overview/`). Presentational components live in `src/components/organizations/portfolio/`. `pages/organizations/List.tsx` is rewritten to compose them inside a new `OrganizationsFrame`. That frame copies the Dashboard/Communications body class for class and has a `rail` slot left empty. The Navbar gives `/organizations/list` the transparent top bar, with the nav-actions slot rendered but empty, so delivery 3 can portal the Ask pill in and pass the rail without changing the frame. `/organizations/board` is left exactly as it is.

**Tech Stack:** React 19, TypeScript, react-router 7 (`useSearchParams`), Redux Toolkit (only for the existing auth/customers slices the modals use), Tailwind v4 tokens, lucide-react, Vitest + Testing Library + user-event (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md`. This plan covers §1, the §2 contract (consumed verbatim), and the list-page parts of §5. The Board (§1 "Board", delivery 2) and Ask Revenact on Organizations (§3, delivery 3) are out of scope.

**Branch:** `feat/organizations-portfolio`, which already holds the spec commit. The backend PR (endpoint, export, bulk) merges and deploys first (spec §4).

## Global Constraints

- Endpoint: `GET /organizations/portfolio/` (via `apiFetch`, which prefixes `/api/v1`) takes `search, owner, lifecycle, health, product, renews_within, nps, ids, include_churned, sort, group, group_value, cursor, limit`. Comma lists are for `lifecycle`, `health`, `product` and `ids` (max 500). `limit` defaults to 50, max 100. `sort` defaults to `-arr`, and a `-` prefix means descending. Unknown values are ignored.
- Response: `{results, next_cursor, count, groups, summary, filters, currency}`. Each row is `{id, name, initials, owner, lifecycle, health{score,category,trend}, renewal{date,days}, arr, risk{score,direction}, pulse{csm,ai,ai_category,ai_label,reason,history,disagree}, last_touch_days, urgent_tickets, signal, is_archived, churned, details{commercial,contract,adoption,voice,profile,history}}`. This is the §2 contract as refined by the backend plan's API section (pre-flight 3 and 19–26). The exact TypeScript is in Task 1.
- Search covers name and Revenact ID only. The placeholder is "Search by name or Revenact ID". Churned accounts are hidden unless `include_churned=1` or `lifecycle` includes `churn`. `set_lifecycle` never sends `churn` (the backend returns 400).
- Export: `GET /organizations/portfolio/export.csv` takes the same params and returns every row with all 34 fields. Download it through `apiFetchBlob` (the session's token). Never use a plain link.
- Bulk: `POST /organizations/bulk/` with `{ids, action: "set_owner"|"set_lifecycle"|"archive", value}` returns `{updated: [...], failed: [{id, reason}]}`. Churn keeps `ChurnOrganizationModal`, run per account.
- House rules (spec §1): tokens only (no hex, `rgb(`, or named palette colours in `.tsx`). One monochrome primary; semantic colour only for status. Numbers in `font-mono-brand tabular-nums`. Type sizes **11/13/15/22 px only** inside `components/organizations/portfolio/`. No card-in-card. **No glass** (glass belongs to the Ask rail only, which is delivery 3). Loading skeletons shaped like rows and tiles. Designed empty and error states. Hover, focus-visible, active and disabled states throughout. 44px touch targets below `sm`. Reduced motion is respected (the global override in `src/index.css` covers `transition-*` and `animate-pulse`).
- Copy: sentence case, no em dashes in new UI copy, "organizations" (US spelling) in UI text, as the page already uses.
- Pins: at most 3, stored per user under `localStorage` key `revenact.organizations.pins.<userId>`. Every read and write goes through try/catch.
- Phones are `< 640px` (`SM = '(min-width: 640px)'` from `src/lib/useMediaQuery.ts`). jsdom has no `matchMedia`, so **`useMediaQuery` reads false (phone) in tests unless `setViewport(1440)` from `src/test/viewport.ts` is called first**. Controls that appear in only one layout are rendered conditionally on `isSm`. They are never only CSS-hidden, because jsdom ignores CSS and duplicates would collide in queries.
- Tests follow `.claude/skills/testing/SKILL.md`: unit, integration (real store and router, network mocked at `fetch` with §2-shaped bodies), and e2e in `src/e2e/`.
- Gates: `npm run lint` passes with 0 errors, `npx tsc -b --noEmit`, `npx vitest run --maxWorkers=2`, and `npm run build`.
- Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Pre-flight: where the spec meets the code

| # | Spec says | Code today | Resolution in this plan |
|---|---|---|---|
| 1 | Keep the Board working (delivery 2 moves it). | `Board.tsx` imports `components/organizations/MetricsPanel` and reads the `customers` slice. The Navbar's `isOrganizations` branch draws the list and board headers. | The Board is untouched. `MetricsPanel` (and its `RenewalPopover`) **stays** until delivery 2. The transparent top bar applies to `/organizations/list` only (`isOrgList`). `/organizations/board` keeps today's bordered header, so the two tabs differ in chrome until delivery 2. |
| 2 | Retire the table. | `OrganizationsTable`, `ActionBar` and `EditColumnsPopover` are imported only by `List.tsx` and each other. `RowActionsPopover` is imported only by `OrganizationsTable`/`ActionBar`. `HealthPopover`/`CsatPopover` are imported only by `OrganizationsTable` and their own tests. `components/accounts/{ActionBar,MetricsPanel}` are separate files and `/accounts` does not import the org ones (it imports only types from `tableData.ts`). | Task 17 deletes `OrganizationsTable`, `ActionBar`, `EditColumnsPopover` and `RowActionsPopover` after a grep shows no importers, and removes `DEFAULT_VISIBLE_COLUMNS`. `HealthPopover`/`CsatPopover` are **kept** (now unimported) for the detail-page spec, because the portfolio row carries no `health_breakdown`. `tableData.ts` stays: `ALL_COLUMNS`/`ColumnId` are the canonical field list, and `OrgRow`/`LifecycleCategory` are used by Details, Board, Lifecycle, Settings, Scenarios and Accounts. |
| 3 | `details` groups are `{…}` in §2. | The backend plan (`revenact-backend/docs/superpowers/plans/2026-09-25-organizations-portfolio-backend.md`, API section) fixes them. | Task 1's types copy that section **key for key**. `commercial` carries its own `currency` (the customer's contract currency). `adoption.products` is `{primary: {id, name} \| null, additional_count}`. `history` has `created_by`/`modified_by` as `{id, name} \| null`, `updated_at`, and `churn_reason` plus `churn_reason_label`. The field-to-panel mapping matches the backend's `fields.FIELDS`: Pulse is `pulse.history`, AI Pulse Score is `pulse.ai_label`, Churn Reason is `churn_reason_label`, Created is `created_by`+`created_at`, Modified is `modified_by`+`updated_at`, Name / Address is `profile.address`, and Products prints as "Core (+2)". **No mismatch.** |
| 4 | Sort by "any numeric field key". | The backend's list: `arr_billed_at_hq, implementation_fee, total_contract_value, total_forecasted_renewal_revenue, total_contracted_seats, total_active_seats, seat_utilization_percentage, total_hires, nps_score, csat_score, ces_percentage, ai_pulse_value, csm_pulse_score`. | `NUMERIC_SORT_KEYS` is exactly that list, with labels in `SORT_LABELS`. An unknown key would be ignored server-side and parsed away client-side. |
| 5 | `filters.{owners,lifecycles,products}` shape is `[…]`. | The backend returns `{value, name}` lists, and `owners` already includes `{value: "unassigned", name: "Unassigned"}`. | `Option = {value, name}`. The Filters owner select lists the server's options after "Everyone" and adds no Unassigned of its own. The selection bar's Change owner maps `unassigned` to `value: null` (the backend unassigns on null). |
| 6 | Grouped sections with count and ARR; rows paginated. | The row shape has no group key. | Sections come from `groups[]`. Each **expanded** section fetches its own rows with `group_value=<key>&limit=25` and has its own cursor ("Show more"). This is the per-column model the Board uses in delivery 2, so `usePagedPortfolio` is reused there. The frame request asks `limit=1` when grouped (it only needs `summary/groups/filters/count/currency`). A section starts expanded when there are at most 4 groups, otherwise only the first starts expanded. |
| 7 | "N of M organizations". | `count` is the filtered total, and nothing gives M. | When any filter is active, one extra probe `GET /organizations/portfolio/?limit=1` with no filters gives M. This is the same idea as today's unfiltered `/customers/` probe in `List.tsx`. The probe adds `include_churned=1` when the view includes churned accounts (`include_churned`, a `churn` lifecycle, or `ids`), so N never exceeds M. |
| 8 | Group default is health. Group "none" must be expressible. | `useDashboardFilters` treats absence as the default. | In the URL, `group` absent means `health`, and `group=none` means no grouping. `sort` is omitted from the URL when it equals `-arr`. |
| 9 | Fields "can be pinned, and used to sort, group or filter". | §1 lists fixed group/filter keys. The backend supports only those. | Every panel field (28) is pinnable. Sorting offers §1's six keys plus the numeric fields in row 4. Group and filter offer exactly §1's lists. |
| 10 | Opened row: every field exactly once. Churn fields only when churned. | — | Each rendered field carries `data-field="<ColumnId>"`. The coverage test (Task 7) renders a churned fixture and asserts exactly one element per `ALL_COLUMNS` id. Pinned chips use `data-pin`, so they never count twice. |
| 11 | Edit is not in the spec's row. | Today the only Edit entry point is the table's row menu/gear (`Details.tsx` has no edit modal). | The opened row keeps an **Edit details** button. It fetches `GET /customers/<id>/` and opens the existing `OrganizationFormModal`. Single-row Archive/Churn move to selection mode. |
| 12 | Account NPS panel: "promoter/passive/detractor bar". | The backend bands NPS by sign (`> 0` promoter, `0` passive, `< 0` detractor), matching `/customers/stats/`. | The panel draws the score on a −100…+100 track and names the band with `npsBand()`, which uses the same sign rule. The NPS tile uses the server's counts. |
| 13 | ✦ pill and rail on the page. | `AskControls` needs `AskProvider` context (delivery 3). | D1 renders the Navbar's `data-nav-actions-slot` on `/organizations/list` (empty), and `OrganizationsFrame` takes a `rail?: ReactNode` (null). There is no pill without grounding: an ungrounded pill would break the twice-filter rule. |
| 14 | Bulk results per account. | `ConfirmDialog`/`ChurnOrganizationModal` use `Promise.all` and all-or-nothing errors. | Bulk actions use `/organizations/bulk/`, and the bar lists each failure by name. Failed ids stay selected so the user can retry, and the list reloads. Churn stays per-account through its modal (spec). |
| 15 | Export all 34 fields. | Download helper `downloadAttachment` exists in `features/files/filesSlice.ts`. | It is reused, with `download_url` set to the export path and the name `organizations-YYYY-MM-DD.csv`. "Export (selected)" sends `ids=<selected>&include_churned=1`. |
| 16 | `?ids=` from the dashboard drill. | `DrillPanel` links `/organizations/list?ids=3,7`. `List.tsx` banners it with "Show all". | Parsed like any param (numeric, max 500) and sent as `ids`. It shows as the chip "Opened from the dashboard (N)". Removing the chip drops `ids` and returns focus to Search. |
| 17 | Row content "touched Nd ago". | `last_touch_days` is `null` when the account has never been contacted (no joined-date fallback). | `touchText`: "Never contacted", "Touched today", "Touched 33d ago". Each `·` segment is in sentence case, so the null case reads "Never contacted". |
| 18 | Page padding. | `DashboardLayout` pads `<main>` on every page but the dashboard/communications/settings. | `/organizations/list` joins the `p-0` set. `OrganizationsFrame` pads itself `px-4 pb-4` as `DashboardFrame` does. The existing layout test that used `/organizations/list` as its "padded page" moves to `/organizations/board`. |
| 19 | Search covers "name / Revenact ID / external ID". | `Customer` has no external ID. The backend searches name and the id as text. | The search placeholder and label read **"Search by name or Revenact ID"**. |
| 20 | Churned included only via `lifecycle=churn` or `include_churned=1`. | "Churned" means `churn_date` is set **or** the stage is Churn. Today's `/customers/` list shows churned rows, so this is a deliberate change. | Hidden by default. The Filters panel (popover and phone sheet) has an **Include churned** toggle, and the chip reads "Includes churned". The row's own `churned` flag, not the stage, decides whether History shows the churn fields. |
| 21 | Row `pulse: {csm, ai, reason}`. | The backend adds `risk {score, direction}`, `pulse.history`, `pulse.ai_category`, `pulse.ai_label`, `pulse.disagree`, `urgent_tickets`, `is_archived` and `churned`. | The Pulse cell shows "AI n · CSM n", the stored dots (`data-field="pulse"`) and the AI label (`data-field="aiPulseScore"`). "pulses disagree" is driven by the server's `pulse.disagree`, not recomputed client-side. |
| 22 | Signal "N open tickets". | The backend's kind is `tickets` (plus `renewal_overdue` and `risk`). Churned rows always carry `signal: null`. | `SignalKind = 'renewal_overdue' \| 'risk' \| 'tickets'`. `tickets` is warning-toned and the other two danger-toned. The label is the server's text. |
| 23 | Bulk actions include Churn. | The backend returns **400** for `set_lifecycle: "churn"`. Churn keeps its modal. | Chosen: the selection bar shows **Churn only when exactly one account is selected**. It opens `ChurnOrganizationModal` for that account. With two or more selected, Churn is hidden. There is no fan-out of one modal over many accounts, so every churn records its own date and reason. |
| 24 | Row health trend "6 months". | The trend is the last five month-end snapshots within six months plus today's score (6 points, ending at the ring's number). | `TrendLine` draws whatever points arrive and labels them "over N months" from the count. With fewer than two points it draws a dashed flat line labelled "Not enough health history for a trend". |
| 25 | Money. | Row `arr`, groups and summary are in the org `currency` (`null` without an FX rate, and `summary.unconverted_count` counts those). `details.commercial` is in the customer's own `currency`. | Row, section and tile money use the response `currency`. Panel money uses `details.commercial.currency`. A null row ARR prints "—". The Accounts · ARR tile adds "N without an exchange rate" when `unconverted_count > 0`. |
| 26 | Cursor. | `next_cursor` is opaque base64 and `null` on the last page. A malformed cursor returns page one. | Passed back verbatim as `cursor` (URL-encoded) and never parsed. The test stub uses its own opaque strings. |

## File map

Create:
- `src/features/organizations/portfolioTypes.ts`: §2 types.
- `src/features/organizations/portfolioApi.ts` (+ `.test.ts`): `fetchPortfolio`, `exportPortfolio`, `bulkUpdate`.
- `src/features/organizations/testPortfolio.ts`: fixtures (`pizzaHut`, `globex`, `initech`), `buildPortfolio`, `stubPortfolio`, `portfolioQueries`, `bulkBodies`.
- `src/features/organizations/portfolioParams.ts` (+ `.test.ts`): URL/API params.
- `src/features/organizations/portfolioFields.ts` (+ `.test.ts`): the 34-field registry, panels and sort options.
- `src/features/organizations/pinnedFields.ts` (+ `.test.ts`).
- `src/components/organizations/portfolio/`:
  - `usePortfolioParams.ts` (+ test)
  - `usePins.ts`
  - `usePortfolio.ts` (+ test)
  - `useSelection.ts` (+ test)
  - `rowParts.tsx` (+ test)
  - `AccountRow.tsx` (+ test)
  - `AccountDetails.tsx` (+ test)
  - `fieldCoverage.test.tsx`
  - `SummaryTiles.tsx` (+ test)
  - `PortfolioToolbar.tsx` (+ test)
  - `FiltersPanel.tsx` (+ test)
  - `PinFieldsMenu.tsx` (+ test)
  - `FilterChips.tsx` (+ test)
  - `SelectionBar.tsx` (+ test)
  - `PortfolioSections.tsx` (+ test)
  - `AccountSheet.tsx` (+ test)
  - `houseRules.test.ts`
- `src/pages/organizations/OrganizationsFrame.tsx`, `src/pages/organizations/testList.tsx`.
- `src/e2e/organizationsPortfolio.test.tsx`.

Modify:
- `src/pages/organizations/List.tsx` (rewrite) and `List.test.tsx` (rewrite).
- `src/components/layout/Navbar.tsx` and `Navbar.test.tsx`.
- `src/layouts/DashboardLayout.tsx` and `DashboardLayout.test.tsx`.
- `src/components/organizations/tableData.ts` (drop `DEFAULT_VISIBLE_COLUMNS`).
- Docs: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.agents/workflows/repo-architecture.md`.

Delete (Task 17): `src/components/organizations/{OrganizationsTable,ActionBar,EditColumnsPopover,RowActionsPopover}.tsx`.

---
### Task 1: Contract types, API module and test fixtures

**Files:**
- Create: `src/features/organizations/portfolioTypes.ts`
- Create: `src/features/organizations/portfolioApi.ts`
- Create: `src/features/organizations/testPortfolio.ts`
- Test: `src/features/organizations/portfolioApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (`src/lib/apiClient.ts`), `downloadAttachment({download_url, name})` (`src/features/files/filesSlice.ts`), `CurrencyCode` (`src/features/auth/authSlice.ts`).
- Produces:
  - Types: `HealthBand`, `LifecycleValue`, `NpsBand`, `GroupKey`, `SignalKind`, `RiskDirection`, `Option`, `PortfolioDetails`, `PortfolioRow`, `PortfolioGroup`, `PortfolioSummary`, `PortfolioResponse`, `BulkAction`, `BulkRequest`, `BulkResult`.
  - API functions:
    - `fetchPortfolio(query: string): Promise<PortfolioResponse>`
    - `exportPortfolio(query: string, today?: Date): Promise<void>`
    - `bulkUpdate(body: BulkRequest): Promise<BulkResult>`
  - Test helpers (`testPortfolio.ts`): `pizzaHut`, `globex`, `initech: PortfolioRow`, `ALL_ROWS`, `FILTER_OPTIONS`, `buildPortfolio(query: URLSearchParams, rows?: PortfolioRow[]): PortfolioResponse`, `stubPortfolio(stub?: PortfolioStub)`, `portfolioQueries(spy)`, `bulkBodies(spy)`, `customerFixture`.

- [ ] **Step 1: Write the types**

`src/features/organizations/portfolioTypes.ts`:
```ts
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's GET /api/v1/organizations/portfolio/ — see
// docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md §2 and,
// once merged, revenact-backend/docs/API_CONTRACTS.md -> organizations.
// The `details` group keys are the Customer field names (plan pre-flight #3).

export type HealthBand = 'good' | 'average' | 'poor';
export type LifecycleValue =
  | 'onboarding' | 'kickoff' | 'adoption' | 'live' | 'renewal' | 'churn' | 'expansion' | 'other';
export type NpsBand = 'promoter' | 'passive' | 'detractor';
export type GroupKey = 'health' | 'owner' | 'lifecycle' | 'product' | 'renewal';
export type SignalKind = 'renewal_overdue' | 'risk' | 'tickets';
export type RiskDirection = 'declining' | 'improving' | 'flat' | 'unknown';

/** A filter choice, shaped like every dashboard response's options. */
export interface Option {
  value: string;
  name: string;
}

export interface PortfolioDetails {
  commercial: {
    /** The account's own contract currency: these five figures are in it,
     *  exactly as the old table printed them. */
    currency: CurrencyCode;
    arr_billed_at_account: number | null;
    arr_billed_at_hq: number | null;
    total_contract_value: number | null;
    total_forecasted_renewal_revenue: number | null;
    implementation_fee: number | null;
  };
  contract: {
    joined_date: string | null;
    contract_start_date: string | null;
    renewal_date: string | null;
    contract_end_date: string | null;
  };
  adoption: {
    total_contracted_seats: number | null;
    total_active_seats: number | null;
    seat_utilization_percentage: number | null;
    total_hires: number | null;
    /** The single primary product (the product filter and group read it)
     *  and how many others, which nobody names. */
    products: { primary: { id: number; name: string } | null; additional_count: number | null };
    scope_web_app: string;
  };
  voice: {
    nps_score: number | null;
    csat_score: number | null;
    ces_percentage: number | null;
    ai_pulse_reason: string;
  };
  profile: {
    revenact_id: number;
    domain: string;
    address: string;
    top_source_channel: string;
  };
  history: {
    created_by: { id: number; name: string } | null;
    created_at: string;
    modified_by: { id: number; name: string } | null;
    updated_at: string;
    churn_date: string | null;
    /** The stored value; `churn_reason_label` is what to print. */
    churn_reason: string;
    churn_reason_label: string;
    churn_comment: string;
  };
}

export interface PortfolioRow {
  id: number;
  name: string;
  initials: string;
  owner: { id: number; name: string } | null;
  lifecycle: { value: LifecycleValue; label: string };
  health: { score: number | null; category: HealthBand; trend: number[] };
  renewal: { date: string | null; days: number | null };
  /** Converted into the response's `currency`, as the dashboard figures are;
   *  null when the contract currency has no exchange rate. */
  arr: number | null;
  /** The Triage score, equal to /customers/health/'s triage_score. */
  risk: { score: number; direction: RiskDirection };
  pulse: {
    csm: number | null;
    ai: number | null;
    ai_category: string;
    /** The old "AI Pulse Score" column. */
    ai_label: string;
    reason: string;
    /** The stored pulse dots: the old "Pulse" column (1 good, 2 poor, 3 mixed, 0 no signal). */
    history: number[];
    /** |csm − ai| ≥ 2, computed by the server. */
    disagree: boolean;
  };
  /** Null when the account has never been contacted. */
  last_touch_days: number | null;
  urgent_tickets: number;
  /** At most one; always null for a churned row. */
  signal: { kind: SignalKind; label: string } | null;
  is_archived: boolean;
  /** A churn_date is set or the stage is Churn. */
  churned: boolean;
  details: PortfolioDetails;
}

export interface PortfolioGroup {
  key: string;
  label: string;
  count: number;
  arr: number;
}

export interface BandFigures {
  good: number;
  average: number;
  poor: number;
}

export interface PortfolioSummary {
  health: BandFigures & { arr: BandFigures; mrr: BandFigures };
  nps: { score: number | null; promoters: number; passives: number; detractors: number };
  lifecycle: { value: LifecycleValue; label: string; count: number; arr: number }[];
  accounts: number;
  arr: number;
  /** Accounts left out of the money totals for want of an exchange rate. */
  unconverted_count: number;
  renewing: { '30': number; '90': number };
}

export interface PortfolioResponse {
  results: PortfolioRow[];
  next_cursor: string | null;
  count: number;
  groups: PortfolioGroup[];
  summary: PortfolioSummary;
  filters: { owners: Option[]; lifecycles: Option[]; products: Option[] };
  currency: CurrencyCode;
}

export type BulkAction = 'set_owner' | 'set_lifecycle' | 'archive';

export interface BulkRequest {
  ids: number[];
  action: BulkAction;
  /** A user id (or null to unassign) for set_owner, a stage other than
   *  churn for set_lifecycle, null for archive. */
  value: number | string | null;
}

export interface BulkResult {
  updated: number[];
  failed: { id: number; reason: string }[];
}
```

- [ ] **Step 2: Write the test fixtures and fetch stub**

`src/features/organizations/testPortfolio.ts`:
```ts
import { vi } from 'vitest';
import type {
  BulkRequest,
  BulkResult,
  HealthBand,
  LifecycleValue,
  Option,
  PortfolioResponse,
  PortfolioRow,
  PortfolioSummary,
} from './portfolioTypes';

// Test-only: §2-shaped rows and a fetch stub that answers the portfolio,
// export, bulk, customer and members endpoints the way the backend does.

export const pizzaHut: PortfolioRow = {
  id: 7,
  name: 'Pizza Hut',
  initials: 'PH',
  owner: { id: 2, name: 'Carl CSM' },
  lifecycle: { value: 'live', label: 'Live' },
  health: { score: 4.9, category: 'average', trend: [6.2, 5.8, 5.5, 5.1, 5.0, 4.9] },
  renewal: { date: '2026-08-09', days: -47 },
  arr: 69600,
  risk: { score: 73, direction: 'declining' },
  pulse: {
    csm: 3,
    ai: 1,
    ai_category: 'high_risk',
    ai_label: 'High Risk',
    reason: 'Usage fell after the admin left.',
    history: [1, 2, 2],
    disagree: true,
  },
  last_touch_days: 33,
  urgent_tickets: 0,
  signal: { kind: 'renewal_overdue', label: 'Renewal overdue' },
  is_archived: false,
  churned: false,
  details: {
    commercial: {
      currency: 'USD',
      arr_billed_at_account: 69600,
      arr_billed_at_hq: 72000,
      total_contract_value: 140000,
      total_forecasted_renewal_revenue: 73080,
      implementation_fee: 5000,
    },
    contract: {
      joined_date: '2024-08-01',
      contract_start_date: '2024-08-09',
      renewal_date: '2026-08-09',
      contract_end_date: '2026-08-09',
    },
    adoption: {
      total_contracted_seats: 100,
      total_active_seats: 16,
      seat_utilization_percentage: 16,
      total_hires: 4,
      products: { primary: { id: 1, name: 'Hiring' }, additional_count: 1 },
      scope_web_app: 'Full',
    },
    voice: { nps_score: -80, csat_score: 62, ces_percentage: 71, ai_pulse_reason: 'Usage fell after the admin left.' },
    profile: { revenact_id: 7, domain: 'pizzahut.example', address: 'Plano, TX', top_source_channel: 'Direct Sales' },
    history: {
      created_by: { id: 1, name: 'Alice Admin' },
      created_at: '2024-08-01T09:00:00Z',
      modified_by: { id: 2, name: 'Carl CSM' },
      updated_at: '2026-09-01T10:00:00Z',
      churn_date: null,
      churn_reason: '',
      churn_reason_label: '',
      churn_comment: '',
    },
  },
};

export const globex: PortfolioRow = {
  ...pizzaHut,
  id: 1,
  name: 'Globex',
  initials: 'GL',
  owner: { id: 3, name: 'Priya' },
  lifecycle: { value: 'adoption', label: 'Adoption' },
  health: { score: 8.2, category: 'good', trend: [7.9, 8.0, 8.1, 8.1, 8.2, 8.2] },
  renewal: { date: '2027-01-23', days: 120 },
  arr: 120000,
  risk: { score: 12, direction: 'flat' },
  pulse: { csm: 4, ai: 4, ai_category: 'satisfied', ai_label: 'Satisfied', reason: 'Steady usage.', history: [1, 1, 1], disagree: false },
  last_touch_days: 2,
  signal: null,
  details: {
    ...pizzaHut.details,
    profile: { revenact_id: 1, domain: 'globex.example', address: 'Chicago, IL', top_source_channel: 'Partner' },
  },
};

export const initech: PortfolioRow = {
  ...pizzaHut,
  id: 2,
  name: 'Initech',
  initials: 'IN',
  owner: null,
  lifecycle: { value: 'churn', label: 'Churn' },
  health: { score: 2.8, category: 'poor', trend: [4.0, 3.6, 3.1, 2.9, 2.8, 2.8] },
  renewal: { date: null, days: null },
  arr: 30000,
  risk: { score: 62, direction: 'declining' },
  pulse: { csm: 1, ai: 2, ai_category: 'moderate', ai_label: 'Moderate', reason: 'No logins in a month.', history: [2, 2, 0], disagree: false },
  last_touch_days: null,
  // Churned rows carry no signal (backend pre-flight #18).
  signal: null,
  churned: true,
  details: {
    ...pizzaHut.details,
    profile: { revenact_id: 2, domain: 'initech.example', address: 'Austin, TX', top_source_channel: 'Inbound' },
    history: {
      ...pizzaHut.details.history,
      churn_date: '2026-07-01',
      churn_reason: 'budget',
      churn_reason_label: 'Budget cuts',
      churn_comment: 'Lost the budget line.',
    },
  },
};

export const ALL_ROWS: PortfolioRow[] = [pizzaHut, globex, initech];

export const FILTER_OPTIONS: PortfolioResponse['filters'] = {
  owners: [
    { value: '2', name: 'Carl CSM' },
    { value: '3', name: 'Priya' },
    { value: 'unassigned', name: 'Unassigned' },
  ],
  lifecycles: [
    { value: 'adoption', name: 'Adoption' },
    { value: 'live', name: 'Live' },
    { value: 'churn', name: 'Churn' },
  ],
  products: [{ value: '1', name: 'Hiring' }] satisfies Option[],
};

const BAND_ORDER: HealthBand[] = ['poor', 'average', 'good'];
const BAND_LABEL: Record<HealthBand, string> = { poor: 'Poor', average: 'Average', good: 'Good' };
const sumArr = (rows: PortfolioRow[]) => rows.reduce((total, row) => total + (row.arr ?? 0), 0);

function summarise(rows: PortfolioRow[]): PortfolioSummary {
  const band = (b: HealthBand) => rows.filter((row) => row.health.category === b);
  const money = (divisor: number) => ({
    good: sumArr(band('good')) / divisor,
    average: sumArr(band('average')) / divisor,
    poor: sumArr(band('poor')) / divisor,
  });
  const stages = new Map<LifecycleValue, string>(rows.map((row) => [row.lifecycle.value, row.lifecycle.label]));
  const within = (days: number) => rows.filter((row) => row.renewal.days !== null && row.renewal.days <= days).length;
  return {
    health: { good: band('good').length, average: band('average').length, poor: band('poor').length, arr: money(1), mrr: money(12) },
    nps: { score: 44, promoters: 6, passives: 1, detractors: 2 },
    lifecycle: [...stages].map(([value, label]) => ({
      value,
      label,
      count: rows.filter((row) => row.lifecycle.value === value).length,
      arr: sumArr(rows.filter((row) => row.lifecycle.value === value)),
    })),
    accounts: rows.length,
    arr: sumArr(rows),
    unconverted_count: 0,
    renewing: { '30': within(30), '90': within(90) },
  };
}

/** What the backend answers for `query`, over `rows`: filters, health groups
 *  (Poor, Average, Good), whole-set summary, `group_value` scoping, and a
 *  cursor (opaque to the page; an offset here). */
export function buildPortfolio(query: URLSearchParams, rows: PortfolioRow[] = ALL_ROWS): PortfolioResponse {
  const list = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean);
  const ids = list('ids').map(Number);
  const health = list('health');
  const lifecycle = list('lifecycle');
  const owner = query.get('owner') ?? '';
  const search = (query.get('search') ?? '').toLowerCase();
  const churnIncluded = query.get('include_churned') === '1' || lifecycle.includes('churn') || ids.length > 0;
  const set = rows.filter(
    (row) =>
      (churnIncluded || !row.churned) &&
      (ids.length === 0 || ids.includes(row.id)) &&
      (health.length === 0 || health.includes(row.health.category)) &&
      (lifecycle.length === 0 || lifecycle.includes(row.lifecycle.value)) &&
      (!search || row.name.toLowerCase().includes(search)) &&
      (!owner || (owner === 'unassigned' ? row.owner === null : String(row.owner?.id) === owner)),
  );
  const group = query.get('group') ?? '';
  const groups =
    group === 'health'
      ? BAND_ORDER.map((band) => ({ band, rows: set.filter((row) => row.health.category === band) }))
          .filter((g) => g.rows.length > 0)
          .map((g) => ({ key: g.band, label: BAND_LABEL[g.band], count: g.rows.length, arr: sumArr(g.rows) }))
      : [];
  const groupValue = query.get('group_value');
  const scoped = groupValue && group === 'health' ? set.filter((row) => row.health.category === groupValue) : set;
  const limit = Number(query.get('limit') ?? 50);
  const start = Number(query.get('cursor') ?? 0);
  return {
    results: scoped.slice(start, start + limit),
    next_cursor: start + limit < scoped.length ? String(start + limit) : null,
    count: set.length,
    groups,
    summary: summarise(set),
    filters: FILTER_OPTIONS,
    currency: 'USD',
  };
}

/** A GET /customers/<id>/ body, enough for OrganizationFormModal's edit form. */
export const customerFixture = {
  id: 7,
  name: 'Pizza Hut',
  address: 'Plano, TX',
  domain: 'pizzahut.example',
  industry: '',
  email: '',
  phone: '',
  owner: null,
  created_by: null,
  modified_by: null,
  created_at: '2024-08-01T09:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  lifecycle_stage: 'live',
  currency: 'USD',
  joined_date: '2024-08-01',
  renewal_date: '2026-08-09',
  contract_start_date: '2024-08-09',
  contract_end_date: '2026-08-09',
  is_archived: false,
};

export interface PortfolioStub {
  /** Answer the portfolio endpoint. Return `{status, body}` for an error. */
  portfolio?: (query: URLSearchParams) => PortfolioResponse | { status: number; body: unknown };
  bulk?: (body: BulkRequest) => BulkResult;
  customer?: unknown;
}

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

export function stubPortfolio(stub: PortfolioStub = {}) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/organizations/portfolio/') {
      const out = (stub.portfolio ?? ((q: URLSearchParams) => buildPortfolio(q)))(url.searchParams);
      return 'results' in out ? json(200, out) : json(out.status, out.body);
    }
    if (path === '/organizations/portfolio/export.csv') {
      return {
        ok: true,
        status: 200,
        json: async () => null,
        blob: async () => new Blob(['id,name\n7,Pizza Hut\n'], { type: 'text/csv' }),
      };
    }
    if (path === '/organizations/bulk/' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as BulkRequest;
      return json(200, (stub.bulk ?? ((b: BulkRequest) => ({ updated: b.ids, failed: [] })))(body));
    }
    if (/^\/customers\/\d+\/$/.test(path) && stub.customer) return json(200, stub.customer);
    if (path === '/auth/members/') return json(200, []);
    return json(404, { detail: `Not stubbed: ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchSpy = ReturnType<typeof stubPortfolio>;

/** Every portfolio request so far, as parsed query strings, oldest first. */
export function portfolioQueries(spy: FetchSpy): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/organizations/portfolio/'))
    .map((url) => url.searchParams);
}

export function bulkBodies(spy: FetchSpy): BulkRequest[] {
  return spy.mock.calls
    .filter(([input, init]) => String(input).endsWith('/organizations/bulk/') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as BulkRequest);
}
```

- [ ] **Step 3: Write the failing API test**

`src/features/organizations/portfolioApi.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdate, exportPortfolio, fetchPortfolio } from './portfolioApi';
import { portfolioQueries, stubPortfolio } from './testPortfolio';

describe('portfolioApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the portfolio with the query it is given', async () => {
    const spy = stubPortfolio();
    const data = await fetchPortfolio('group=health&sort=-arr');
    const [query] = portfolioQueries(spy);
    expect(query.get('group')).toBe('health');
    expect(query.get('sort')).toBe('-arr');
    expect(data.currency).toBe('USD');
    // Churned customers stay out unless asked for, as on the backend.
    expect(data.results.map((row) => row.id)).toEqual([7, 1]);
    expect(data.groups.map((group) => group.key)).toEqual(['average', 'good']);
  });

  it('reads the bare path when there is no query', async () => {
    const spy = stubPortfolio();
    await fetchPortfolio('');
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/v1\/organizations\/portfolio\/$/);
  });

  it('posts a bulk edit and returns what was updated and what failed', async () => {
    const spy = stubPortfolio({
      bulk: (body) => ({ updated: [body.ids[0]], failed: [{ id: body.ids[1], reason: 'No permission.' }] }),
    });
    const result = await bulkUpdate({ ids: [7, 1], action: 'set_owner', value: 3 });
    expect(result).toEqual({ updated: [7], failed: [{ id: 1, reason: 'No permission.' }] });
    const call = spy.mock.calls.find(([input]) => String(input).endsWith('/organizations/bulk/'));
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ids: [7, 1], action: 'set_owner', value: 3 });
  });

  it('downloads the export through the session, named for the day', async () => {
    const spy = stubPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await exportPortfolio('health=poor&sort=-arr', new Date('2026-09-25T12:00:00Z'));

    const call = spy.mock.calls.find(([input]) => String(input).includes('/organizations/portfolio/export.csv'));
    expect(String(call?.[0])).toContain('export.csv?health=poor&sort=-arr');
    expect((call?.[1]?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('organizations-2026-09-25.csv');
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/features/organizations/portfolioApi.test.ts`
Expected: FAIL with `Failed to resolve import "./portfolioApi"`.

- [ ] **Step 5: Write the API module**

`src/features/organizations/portfolioApi.ts`:
```ts
// Thin apiFetch wrappers over revenact-backend's portfolio endpoints (spec §2).
import { apiFetch } from '../../lib/apiClient';
import { downloadAttachment } from '../files/filesSlice';
import type { BulkRequest, BulkResult, PortfolioResponse } from './portfolioTypes';

export const PORTFOLIO_PATH = '/organizations/portfolio/';

export function fetchPortfolio(query: string): Promise<PortfolioResponse> {
  return apiFetch<PortfolioResponse>(query ? `${PORTFOLIO_PATH}?${query}` : PORTFOLIO_PATH);
}

/** Every row of the query as CSV with all 34 fields, fetched with the
 *  session's token (the API never exposes a URL a plain link could open). */
export function exportPortfolio(query: string, today: Date = new Date()): Promise<void> {
  const path = query ? `${PORTFOLIO_PATH}export.csv?${query}` : `${PORTFOLIO_PATH}export.csv`;
  return downloadAttachment({ download_url: path, name: `organizations-${today.toISOString().slice(0, 10)}.csv` });
}

export function bulkUpdate(body: BulkRequest): Promise<BulkResult> {
  return apiFetch<BulkResult>('/organizations/bulk/', { method: 'POST', body });
}
```

The `Content-Type` assertion pins that the download goes through `rawFetch` (the session path: `apiFetchBlob`), whose default JSON header it always sends.

- [ ] **Step 6: Run it to see it pass**

Run: `npx vitest run src/features/organizations/portfolioApi.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/organizations
git commit -m "feat(organizations): portfolio contract types, API calls and test fixtures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: URL state for filters, sort and group

**Files:**
- Create: `src/features/organizations/portfolioParams.ts`
- Create: `src/components/organizations/portfolio/usePortfolioParams.ts`
- Test: `src/features/organizations/portfolioParams.test.ts`, `src/components/organizations/portfolio/usePortfolioParams.test.tsx`

**Interfaces:**
- Consumes: types from Task 1.
- Produces:
  - `PortfolioParams` (interface below)
  - Constants: `DEFAULT_SORT = '-arr'`, `DEFAULT_GROUP: GroupKey = 'health'`, `MAX_IDS = 500`, `BASE_SORT_KEYS`, `NUMERIC_SORT_KEYS`, `LIFECYCLE_VALUES`, `HEALTH_BANDS`, `GROUP_KEYS`
  - `parseParams(search: URLSearchParams): PortfolioParams`
  - `toUrlSearch(p: PortfolioParams): URLSearchParams`
  - `toApiQuery(p: PortfolioParams, extra?: Record<string, string>): string`
  - `filterQuery(p): string`
  - `hasFilters(p): boolean`
  - `EMPTY_FILTERS: Partial<PortfolioParams>`
  - `toggleIn<T>(list: T[], value: T): T[]`
  - `usePortfolioParams(): { params: PortfolioParams; update: (patch: Partial<PortfolioParams>) => void; clearFilters: () => void }`

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/portfolioParams.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUP,
  DEFAULT_SORT,
  filterQuery,
  hasFilters,
  parseParams,
  toApiQuery,
  toUrlSearch,
  toggleIn,
  type PortfolioParams,
} from './portfolioParams';

const full: PortfolioParams = {
  search: 'pizza',
  owner: '2',
  lifecycle: ['live', 'renewal'],
  health: ['poor', 'average'],
  product: ['1'],
  renews_within: '90',
  nps: 'detractor',
  ids: [7, 1],
  include_churned: true,
  sort: 'renewal',
  group: 'owner',
};

describe('portfolio params', () => {
  it('defaults to health groups sorted by ARR, with no filters', () => {
    const params = parseParams(new URLSearchParams());
    expect(params.group).toBe(DEFAULT_GROUP);
    expect(params.sort).toBe(DEFAULT_SORT);
    expect(hasFilters(params)).toBe(false);
  });

  it('round-trips every key through the URL', () => {
    expect(parseParams(toUrlSearch(full))).toEqual(full);
  });

  it('writes nothing for the defaults and "none" for no grouping', () => {
    expect(toUrlSearch(parseParams(new URLSearchParams())).toString()).toBe('');
    expect(toUrlSearch({ ...parseParams(new URLSearchParams()), group: '' }).get('group')).toBe('none');
    expect(parseParams(new URLSearchParams('group=none')).group).toBe('');
  });

  it('ignores unknown values, as the backend does', () => {
    const params = parseParams(
      new URLSearchParams('owner=bob&lifecycle=live,nope&health=great&product=x,3&renews_within=45&nps=fan&sort=-colour&group=city&ids=7,abc'),
    );
    expect(params).toMatchObject({
      owner: '',
      lifecycle: ['live'],
      health: [],
      product: ['3'],
      renews_within: '',
      nps: '',
      sort: DEFAULT_SORT,
      group: DEFAULT_GROUP,
      ids: [7],
    });
  });

  it('keeps an unassigned owner, a numeric sort key and descending sorts', () => {
    const params = parseParams(new URLSearchParams('owner=unassigned&sort=-total_contract_value'));
    expect(params.owner).toBe('unassigned');
    expect(params.sort).toBe('-total_contract_value');
  });

  it('caps ids at 500', () => {
    const ids = Array.from({ length: 600 }, (_, i) => i + 1).join(',');
    expect(parseParams(new URLSearchParams(`ids=${ids}`)).ids).toHaveLength(500);
  });

  it('builds the API query with sort and group always set, and extras last', () => {
    const query = new URLSearchParams(toApiQuery(full, { limit: '25', group_value: 'poor' }));
    expect(query.get('lifecycle')).toBe('live,renewal');
    expect(query.get('ids')).toBe('7,1');
    expect(query.get('include_churned')).toBe('1');
    expect(query.get('sort')).toBe('renewal');
    expect(query.get('group')).toBe('owner');
    expect(query.get('limit')).toBe('25');
    expect(query.get('group_value')).toBe('poor');
    expect(new URLSearchParams(toApiQuery({ ...full, group: '' })).has('group')).toBe(false);
  });

  it('filterQuery ignores sort and group, so only filters reset a selection', () => {
    expect(filterQuery({ ...full, sort: 'name', group: '' })).toBe(filterQuery(full));
    expect(filterQuery({ ...full, owner: '3' })).not.toBe(filterQuery(full));
  });

  it('toggleIn adds and removes', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});
```

`src/components/organizations/portfolio/usePortfolioParams.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { usePortfolioParams } from './usePortfolioParams';

function Probe() {
  const { params, update, clearFilters } = usePortfolioParams();
  const location = useLocation();
  return (
    <div>
      <p data-testid="where">{location.search}</p>
      <p data-testid="health">{params.health.join(',')}</p>
      <button type="button" onClick={() => update({ health: ['poor'] })}>Poor</button>
      <button type="button" onClick={() => update({ group: '' })}>No groups</button>
      <button type="button" onClick={clearFilters}>Clear</button>
    </div>
  );
}

describe('usePortfolioParams', () => {
  it('writes filters to the URL, keeps sort and group when clearing filters', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/list?sort=name&ids=7']}>
        <Probe />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Poor' }));
    expect(screen.getByTestId('health')).toHaveTextContent('poor');
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('health')).toBe('poor');

    await userEvent.click(screen.getByRole('button', { name: 'No groups' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const search = new URLSearchParams(screen.getByTestId('where').textContent!);
    expect(search.get('sort')).toBe('name');
    expect(search.get('group')).toBe('none');
    expect(search.has('health')).toBe(false);
    expect(search.has('ids')).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/organizations/portfolioParams.test.ts src/components/organizations/portfolio/usePortfolioParams.test.tsx`
Expected: FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write the params module**

`src/features/organizations/portfolioParams.ts`:
```ts
import type { GroupKey, HealthBand, LifecycleValue, NpsBand } from './portfolioTypes';

/** Everything the portfolio page reads from the URL. Every filter, sort and
 *  group lives there (spec §1), so a view can be linked and survives reload. */
export interface PortfolioParams {
  search: string;
  /** A user id, 'unassigned', or '' for everyone. */
  owner: string;
  lifecycle: LifecycleValue[];
  health: HealthBand[];
  product: string[];
  renews_within: '' | '30' | '90' | '180';
  nps: '' | NpsBand;
  ids: number[];
  include_churned: boolean;
  sort: string;
  /** '' is "no grouping" (URL `group=none`). */
  group: GroupKey | '';
}

export const DEFAULT_SORT = '-arr';
export const DEFAULT_GROUP: GroupKey = 'health';
export const MAX_IDS = 500;

export const LIFECYCLE_VALUES: LifecycleValue[] = [
  'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other',
];
export const HEALTH_BANDS: HealthBand[] = ['poor', 'average', 'good'];
export const GROUP_KEYS: GroupKey[] = ['health', 'owner', 'lifecycle', 'product', 'renewal'];
const WINDOWS = ['30', '90', '180'] as const;
const NPS_BANDS: NpsBand[] = ['promoter', 'passive', 'detractor'];

export const BASE_SORT_KEYS = ['arr', 'health', 'renewal', 'touch', 'risk', 'name'] as const;
/** The Customer field names the backend sorts on (plan pre-flight #4). */
export const NUMERIC_SORT_KEYS = [
  'arr_billed_at_hq', 'total_contract_value', 'total_forecasted_renewal_revenue', 'implementation_fee',
  'total_contracted_seats', 'total_active_seats', 'seat_utilization_percentage', 'total_hires',
  'nps_score', 'csat_score', 'ces_percentage', 'ai_pulse_value', 'csm_pulse_score',
] as const;
const SORT_KEYS: readonly string[] = [...BASE_SORT_KEYS, ...NUMERIC_SORT_KEYS];

export const EMPTY_FILTERS: Partial<PortfolioParams> = {
  search: '', owner: '', lifecycle: [], health: [], product: [], renews_within: '', nps: '', ids: [], include_churned: false,
};

const list = (raw: string | null) =>
  (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean);

function only<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

function parseSort(raw: string | null): string {
  if (!raw) return DEFAULT_SORT;
  return SORT_KEYS.includes(raw.replace(/^-/, '')) ? raw : DEFAULT_SORT;
}

export function parseParams(search: URLSearchParams): PortfolioParams {
  const owner = search.get('owner') ?? '';
  const renews = search.get('renews_within') ?? '';
  const nps = search.get('nps') ?? '';
  const group = search.get('group');
  return {
    search: (search.get('search') ?? '').trim(),
    owner: owner === 'unassigned' || /^\d+$/.test(owner) ? owner : '',
    lifecycle: only(list(search.get('lifecycle')), LIFECYCLE_VALUES),
    health: only(list(search.get('health')), HEALTH_BANDS),
    product: list(search.get('product')).filter((value) => /^\d+$/.test(value)),
    renews_within: only([renews], WINDOWS)[0] ?? '',
    nps: only([nps], NPS_BANDS)[0] ?? '',
    ids: list(search.get('ids')).filter((value) => /^\d+$/.test(value)).map(Number).slice(0, MAX_IDS),
    include_churned: search.get('include_churned') === '1',
    sort: parseSort(search.get('sort')),
    group: group === 'none' ? '' : (only([group ?? ''], GROUP_KEYS)[0] ?? DEFAULT_GROUP),
  };
}

function setFilters(query: URLSearchParams, p: PortfolioParams) {
  if (p.search) query.set('search', p.search);
  if (p.owner) query.set('owner', p.owner);
  if (p.lifecycle.length) query.set('lifecycle', p.lifecycle.join(','));
  if (p.health.length) query.set('health', p.health.join(','));
  if (p.product.length) query.set('product', p.product.join(','));
  if (p.renews_within) query.set('renews_within', p.renews_within);
  if (p.nps) query.set('nps', p.nps);
  if (p.ids.length) query.set('ids', p.ids.join(','));
  if (p.include_churned) query.set('include_churned', '1');
}

/** The page URL's query: defaults left out, "no grouping" written as none. */
export function toUrlSearch(p: PortfolioParams): URLSearchParams {
  const query = new URLSearchParams();
  setFilters(query, p);
  if (p.sort !== DEFAULT_SORT) query.set('sort', p.sort);
  if (p.group === '') query.set('group', 'none');
  else if (p.group !== DEFAULT_GROUP) query.set('group', p.group);
  return query;
}

/** The API's query: sort always, group when grouping, then `extra`
 *  (limit, cursor, group_value) as given. */
export function toApiQuery(p: PortfolioParams, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  setFilters(query, p);
  query.set('sort', p.sort);
  if (p.group) query.set('group', p.group);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

/** The filters alone: a change here clears a selection (spec §1). */
export function filterQuery(p: PortfolioParams): string {
  const query = new URLSearchParams();
  setFilters(query, p);
  return query.toString();
}

export function hasFilters(p: PortfolioParams): boolean {
  return filterQuery(p) !== '';
}

export function toggleIn<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
```

- [ ] **Step 4: Write the hook**

`src/components/organizations/portfolio/usePortfolioParams.ts`:
```ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMPTY_FILTERS, parseParams, toUrlSearch, type PortfolioParams } from '../../../features/organizations/portfolioParams';

/** The portfolio's URL state. Updates replace the history entry, like the
 *  dashboard's filters, so Back leaves the page rather than undoing a chip. */
export function usePortfolioParams() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseParams(search), [search]);

  const update = useCallback(
    (patch: Partial<PortfolioParams>) => {
      setSearch((prev) => toUrlSearch({ ...parseParams(prev), ...patch }), { replace: true });
    },
    [setSearch],
  );

  const clearFilters = useCallback(() => update(EMPTY_FILTERS), [update]);

  return { params, update, clearFilters };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/features/organizations/portfolioParams.test.ts src/components/organizations/portfolio/usePortfolioParams.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/organizations/portfolioParams.ts src/features/organizations/portfolioParams.test.ts src/components/organizations/portfolio
git commit -m "feat(organizations): portfolio filters, sort and group live in the URL

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: The field registry and pinned fields

**Files:**
- Create: `src/features/organizations/portfolioFields.ts`
- Create: `src/features/organizations/pinnedFields.ts`
- Create: `src/components/organizations/portfolio/usePins.ts`
- Test: `src/features/organizations/portfolioFields.test.ts`, `src/features/organizations/pinnedFields.test.ts`

**Interfaces:**
- Consumes: `ALL_COLUMNS`, `ColumnId` (`src/components/organizations/tableData.ts`); `formatDate`, `formatMoney` (`src/features/customers/formatters.ts`); `NUMERIC_SORT_KEYS`, `BASE_SORT_KEYS` (Task 2); `PortfolioRow` (Task 1).
- Produces:
  - `PanelKey`
  - `PANELS: {key: PanelKey; title: string}[]`
  - `PANEL_ORDER: Record<PanelKey, ColumnId[]>`
  - `FieldDef = {id; label; short; place: 'header' | PanelKey; value(row): string; sort?: string}`
  - `PORTFOLIO_FIELDS: Record<ColumnId, FieldDef>`
  - `HEADER_FIELDS: ColumnId[]`
  - `PINNABLE_FIELDS: FieldDef[]`
  - `SORT_OPTIONS: {value: string; label: string}[]`
  - `signed(n: number | null): string`
  - `PULSE_WORD: Record<number, string>`, `pulseWords(history: number[]): string`
  - `MAX_PINS = 3`
  - `readPins(userId: number | null): ColumnId[]`
  - `writePins(userId: number | null, pins: ColumnId[]): void`
  - `togglePin(pins: ColumnId[], id: ColumnId): ColumnId[]`
  - `usePins(): { pins: ColumnId[]; toggle: (id: ColumnId) => void }`

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/portfolioFields.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ALL_COLUMNS } from '../../components/organizations/tableData';
import { parseParams } from './portfolioParams';
import { HEADER_FIELDS, PANEL_ORDER, PINNABLE_FIELDS, PORTFOLIO_FIELDS, SORT_OPTIONS, signed } from './portfolioFields';
import { initech, pizzaHut } from './testPortfolio';

describe('portfolio field registry', () => {
  it('describes exactly the 34 fields of the old table', () => {
    expect(ALL_COLUMNS).toHaveLength(34);
    expect(Object.keys(PORTFOLIO_FIELDS).sort()).toEqual(ALL_COLUMNS.map((c) => c.id).sort());
    for (const [key, def] of Object.entries(PORTFOLIO_FIELDS)) expect(def.id).toBe(key);
  });

  it('puts the six header fields in the row and every other field in exactly one panel', () => {
    expect([...HEADER_FIELDS].sort()).toEqual(['aiPulseScore', 'health', 'lifecycleStage', 'organization', 'owner', 'pulse']);
    const inPanels = Object.values(PANEL_ORDER).flat();
    expect(new Set(inPanels).size).toBe(inPanels.length);
    expect(inPanels.length + HEADER_FIELDS.length).toBe(34);
    for (const [panel, ids] of Object.entries(PANEL_ORDER)) {
      for (const id of ids) expect(PORTFOLIO_FIELDS[id].place).toBe(panel);
    }
  });

  it('pins any panel field and no header field', () => {
    expect(PINNABLE_FIELDS).toHaveLength(28);
    expect(PINNABLE_FIELDS.some((f) => f.place === 'header')).toBe(false);
  });

  it('formats values the way the row and panels print them', () => {
    const v = (id: keyof typeof PORTFOLIO_FIELDS, row = pizzaHut) => PORTFOLIO_FIELDS[id].value(row);
    expect(v('nps')).toBe('−80');
    expect(v('totalSeatUtilization')).toBe('16%');
    expect(v('arrAccount')).toBe('$69,600.00');
    expect(v('productsUtilized')).toBe('Hiring (+1)');
    expect(v('pulse')).toBe('good, poor, poor');
    expect(v('aiPulseScore')).toBe('High Risk');
    expect(v('modifiedBy')).toBe('Carl CSM · 1 Sep 2026');
    expect(v('createdBy')).toBe('Alice Admin · 1 Aug 2024');
    expect(v('renewalDate')).toBe('9 Aug 2026');
    expect(v('owner', initech)).toBe('Unassigned');
    expect(v('churnReason', initech)).toBe('Budget cuts');
    expect(v('churnReason')).toBe('—');
  });

  it('signs NPS with a real minus and a plus', () => {
    expect(signed(-80)).toBe('−80');
    expect(signed(12)).toBe('+12');
    expect(signed(0)).toBe('0');
    expect(signed(null)).toBe('—');
  });

  it('offers only sort keys the URL parser accepts, each once', () => {
    const values = SORT_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.slice(0, 6)).toEqual(['arr', 'health', 'renewal', 'touch', 'risk', 'name']);
    for (const value of values) expect(parseParams(new URLSearchParams(`sort=${value}`)).sort).toBe(value);
    expect(values).toContain('total_contract_value');
    expect(values).toContain('csm_pulse_score');
    expect(SORT_OPTIONS.find((o) => o.value === 'ai_pulse_value')?.label).toBe('AI pulse');
  });
});
```

`src/features/organizations/pinnedFields.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PINS, readPins, togglePin, writePins } from './pinnedFields';

describe('pinned fields', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts empty and remembers pins per user', () => {
    expect(readPins(1)).toEqual([]);
    writePins(1, ['nps', 'totalSeatUtilization']);
    expect(readPins(1)).toEqual(['nps', 'totalSeatUtilization']);
    expect(readPins(2)).toEqual([]);
    expect(localStorage.getItem('revenact.organizations.pins.1')).toBe('["nps","totalSeatUtilization"]');
  });

  it('drops unknown and header fields and caps at three', () => {
    localStorage.setItem('revenact.organizations.pins.1', JSON.stringify(['nps', 'owner', 'bogus', 'tcv', 'domain', 'cesPercentage']));
    expect(readPins(1)).toEqual(['nps', 'tcv', 'domain']);
    localStorage.setItem('revenact.organizations.pins.1', '{not json');
    expect(readPins(1)).toEqual([]);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPins(1)).toEqual([]);
    expect(() => writePins(1, ['nps'])).not.toThrow();
  });

  it('toggles a pin, never past the cap', () => {
    expect(togglePin([], 'nps')).toEqual(['nps']);
    expect(togglePin(['nps'], 'nps')).toEqual([]);
    const full = ['nps', 'tcv', 'domain'] as const;
    expect(full).toHaveLength(MAX_PINS);
    expect(togglePin([...full], 'cesPercentage')).toEqual([...full]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/organizations/portfolioFields.test.ts src/features/organizations/pinnedFields.test.ts`
Expected: FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write the registry**

`src/features/organizations/portfolioFields.ts`:
```ts
import type { ColumnId } from '../../components/organizations/tableData';
import { formatDate, formatMoney } from '../customers/formatters';
import { BASE_SORT_KEYS, NUMERIC_SORT_KEYS } from './portfolioParams';
import type { PortfolioRow } from './portfolioTypes';

// Every field the old 34-column table showed, with the one place the
// portfolio shows it (spec §1 "Opened row"). The coverage test renders a
// row and asserts each id appears exactly once, so this is the checklist.

export type PanelKey = 'commercial' | 'contract' | 'adoption' | 'voice' | 'profile' | 'history';

export const PANELS: { key: PanelKey; title: string }[] = [
  { key: 'commercial', title: 'Commercial' },
  { key: 'contract', title: 'Contract timeline' },
  { key: 'adoption', title: 'Adoption' },
  { key: 'voice', title: 'Voice of the customer' },
  { key: 'profile', title: 'Profile' },
  { key: 'history', title: 'History' },
];

export const PANEL_ORDER: Record<PanelKey, ColumnId[]> = {
  commercial: ['arrAccount', 'arrHQ', 'tcv', 'tcvRenewal', 'implFee'],
  contract: ['joinedDate', 'contractStart', 'renewalDate', 'contractEnd'],
  adoption: ['totalContractedSeats', 'totalActiveSeats', 'totalSeatUtilization', 'totalHires', 'productsUtilized', 'scopeWebApp'],
  voice: ['nps', 'csatScore', 'cesPercentage', 'aiPulseReason'],
  profile: ['revenactId', 'domain', 'nameAddress', 'topSourceChannel'],
  history: ['createdBy', 'modifiedBy', 'churnDate', 'churnReason', 'churnComment'],
};

export interface FieldDef {
  id: ColumnId;
  /** Label in the opened row and the pin menu. */
  label: string;
  /** Label on a pinned chip ("NPS −80", "Seats 16%"). */
  short: string;
  place: 'header' | PanelKey;
  value: (row: PortfolioRow) => string;
  /** The backend sort key, for fields the list can sort by. */
  sort?: string;
}

const DASH = '—';
const count = (n: number | null) => (n == null ? DASH : n.toLocaleString('en-US'));
const pct = (n: number | null) => (n == null ? DASH : `${n}%`);
const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : DASH);
const text = (s: string) => s.trim() || DASH;
const money = (row: PortfolioRow, n: number | null) =>
  n == null ? DASH : formatMoney(n, row.details.commercial.currency);
const stamp = (by: string | null, at: string | null) => `${by ?? 'System'} · ${day(at)}`;

/** The stored pulse dots, in words: 1 good, 2 poor, 3 mixed, 0 no signal. */
export const PULSE_WORD: Record<number, string> = { 1: 'good', 2: 'poor', 3: 'mixed', 0: 'no signal' };
export function pulseWords(history: number[]): string {
  return history.length ? history.map((n) => PULSE_WORD[n] ?? 'no signal').join(', ') : DASH;
}

/** NPS-style signed number with a real minus sign. */
export function signed(n: number | null): string {
  if (n == null) return DASH;
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

type Def = Omit<FieldDef, 'id'>;
const defs: Record<ColumnId, Def> = {
  organization: { label: 'Organization', short: 'Name', place: 'header', value: (r) => r.name, sort: 'name' },
  owner: { label: 'Owner', short: 'Owner', place: 'header', value: (r) => r.owner?.name ?? 'Unassigned' },
  lifecycleStage: { label: 'Lifecycle stage', short: 'Lifecycle', place: 'header', value: (r) => r.lifecycle.label },
  health: {
    label: 'Health',
    short: 'Health',
    place: 'header',
    value: (r) => (r.health.score == null ? DASH : r.health.score.toFixed(1)),
    sort: 'health',
  },
  // The old "Pulse" column was the stored dots; "AI Pulse Score" was the AI
  // category label. Same mapping as the backend's fields.FIELDS.
  pulse: { label: 'Pulse', short: 'Pulse', place: 'header', value: (r) => pulseWords(r.pulse.history) },
  aiPulseScore: { label: 'AI pulse score', short: 'AI pulse', place: 'header', value: (r) => text(r.pulse.ai_label), sort: 'ai_pulse_value' },

  arrAccount: { label: 'ARR billed at account', short: 'ARR', place: 'commercial', value: (r) => money(r, r.details.commercial.arr_billed_at_account), sort: 'arr' },
  arrHQ: { label: 'ARR billed at HQ', short: 'ARR HQ', place: 'commercial', value: (r) => money(r, r.details.commercial.arr_billed_at_hq), sort: 'arr_billed_at_hq' },
  tcv: { label: 'Total contract value', short: 'TCV', place: 'commercial', value: (r) => money(r, r.details.commercial.total_contract_value), sort: 'total_contract_value' },
  tcvRenewal: { label: 'Forecasted renewal revenue', short: 'Renewal rev.', place: 'commercial', value: (r) => money(r, r.details.commercial.total_forecasted_renewal_revenue), sort: 'total_forecasted_renewal_revenue' },
  implFee: { label: 'Implementation fee', short: 'Impl. fee', place: 'commercial', value: (r) => money(r, r.details.commercial.implementation_fee), sort: 'implementation_fee' },

  joinedDate: { label: 'Joined', short: 'Joined', place: 'contract', value: (r) => day(r.details.contract.joined_date) },
  contractStart: { label: 'Contract start', short: 'Start', place: 'contract', value: (r) => day(r.details.contract.contract_start_date) },
  renewalDate: { label: 'Renewal', short: 'Renews', place: 'contract', value: (r) => day(r.details.contract.renewal_date), sort: 'renewal' },
  contractEnd: { label: 'Contract end', short: 'Ends', place: 'contract', value: (r) => day(r.details.contract.contract_end_date) },

  totalContractedSeats: { label: 'Contracted seats', short: 'Contracted', place: 'adoption', value: (r) => count(r.details.adoption.total_contracted_seats), sort: 'total_contracted_seats' },
  totalActiveSeats: { label: 'Active seats', short: 'Active', place: 'adoption', value: (r) => count(r.details.adoption.total_active_seats), sort: 'total_active_seats' },
  totalSeatUtilization: { label: 'Seat utilisation', short: 'Seats', place: 'adoption', value: (r) => pct(r.details.adoption.seat_utilization_percentage), sort: 'seat_utilization_percentage' },
  totalHires: { label: 'Total hires', short: 'Hires', place: 'adoption', value: (r) => count(r.details.adoption.total_hires), sort: 'total_hires' },
  productsUtilized: {
    label: 'Products',
    short: 'Products',
    place: 'adoption',
    // "Core (+2)", as the export prints it.
    value: (r) => {
      const { primary, additional_count } = r.details.adoption.products;
      if (!primary) return DASH;
      return additional_count ? `${primary.name} (+${additional_count})` : primary.name;
    },
  },
  scopeWebApp: { label: 'Scope web app', short: 'Web app', place: 'adoption', value: (r) => text(r.details.adoption.scope_web_app) },

  nps: { label: 'NPS', short: 'NPS', place: 'voice', value: (r) => signed(r.details.voice.nps_score), sort: 'nps_score' },
  csatScore: { label: 'CSAT', short: 'CSAT', place: 'voice', value: (r) => pct(r.details.voice.csat_score), sort: 'csat_score' },
  cesPercentage: { label: 'CES', short: 'CES', place: 'voice', value: (r) => pct(r.details.voice.ces_percentage), sort: 'ces_percentage' },
  aiPulseReason: { label: 'AI pulse reason', short: 'Why', place: 'voice', value: (r) => text(r.details.voice.ai_pulse_reason) },

  revenactId: { label: 'Revenact ID', short: 'ID', place: 'profile', value: (r) => String(r.details.profile.revenact_id) },
  domain: { label: 'Domain', short: 'Domain', place: 'profile', value: (r) => text(r.details.profile.domain) },
  nameAddress: { label: 'Address', short: 'Address', place: 'profile', value: (r) => text(r.details.profile.address) },
  topSourceChannel: { label: 'Top source channel', short: 'Source', place: 'profile', value: (r) => text(r.details.profile.top_source_channel) },

  createdBy: { label: 'Created', short: 'Created', place: 'history', value: (r) => stamp(r.details.history.created_by?.name ?? null, r.details.history.created_at) },
  modifiedBy: { label: 'Modified', short: 'Modified', place: 'history', value: (r) => stamp(r.details.history.modified_by?.name ?? null, r.details.history.updated_at) },
  churnDate: { label: 'Churn date', short: 'Churned', place: 'history', value: (r) => day(r.details.history.churn_date) },
  churnReason: { label: 'Churn reason', short: 'Churn reason', place: 'history', value: (r) => text(r.details.history.churn_reason_label) },
  churnComment: { label: 'Churn comment', short: 'Churn note', place: 'history', value: (r) => text(r.details.history.churn_comment) },
};

export const PORTFOLIO_FIELDS = Object.fromEntries(
  Object.entries(defs).map(([id, def]) => [id, { id: id as ColumnId, ...def }]),
) as Record<ColumnId, FieldDef>;

export const HEADER_FIELDS: ColumnId[] = Object.values(PORTFOLIO_FIELDS)
  .filter((f) => f.place === 'header')
  .map((f) => f.id);

/** Panel order, so the pin menu reads like the opened row. */
export const PINNABLE_FIELDS: FieldDef[] = Object.values(PANEL_ORDER)
  .flat()
  .map((id) => PORTFOLIO_FIELDS[id]);

const SORT_LABELS: Record<(typeof BASE_SORT_KEYS)[number] | (typeof NUMERIC_SORT_KEYS)[number], string> = {
  arr: 'ARR',
  health: 'Health score',
  renewal: 'Renewal date',
  touch: 'Last touch',
  risk: 'Risk',
  name: 'Name',
  arr_billed_at_hq: 'ARR billed at HQ',
  total_contract_value: 'Total contract value',
  total_forecasted_renewal_revenue: 'Forecasted renewal revenue',
  implementation_fee: 'Implementation fee',
  total_contracted_seats: 'Contracted seats',
  total_active_seats: 'Active seats',
  seat_utilization_percentage: 'Seat utilisation',
  total_hires: 'Total hires',
  nps_score: 'NPS',
  csat_score: 'CSAT',
  ces_percentage: 'CES',
  ai_pulse_value: 'AI pulse',
  csm_pulse_score: 'CSM pulse',
};

export const SORT_OPTIONS: { value: string; label: string }[] = [...BASE_SORT_KEYS, ...NUMERIC_SORT_KEYS].map(
  (key) => ({ value: key, label: SORT_LABELS[key] }),
);
```

- [ ] **Step 4: Write pinned-field storage and its hook**

`src/features/organizations/pinnedFields.ts`:
```ts
import type { ColumnId } from '../../components/organizations/tableData';
import { PINNABLE_FIELDS } from './portfolioFields';

/** Up to three fields shown as chips on every row, remembered per user in
 *  this browser (spec §1 "Pin a field"). Storage can be off (private
 *  windows, blocked site data): then pins last for the visit only. */
export const MAX_PINS = 3;

const PINNABLE = new Set<string>(PINNABLE_FIELDS.map((f) => f.id));
const key = (userId: number | null) => `revenact.organizations.pins.${userId ?? 'anon'}`;

export function readPins(userId: number | null): ColumnId[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is ColumnId => typeof id === 'string' && PINNABLE.has(id))
      .slice(0, MAX_PINS);
  } catch {
    return [];
  }
}

export function writePins(userId: number | null, pins: ColumnId[]): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(pins.slice(0, MAX_PINS)));
  } catch {
    // Storage is off: the pins still apply for this visit.
  }
}

export function togglePin(pins: ColumnId[], id: ColumnId): ColumnId[] {
  if (pins.includes(id)) return pins.filter((pin) => pin !== id);
  return pins.length < MAX_PINS ? [...pins, id] : pins;
}
```

`src/components/organizations/portfolio/usePins.ts`:
```ts
import { useCallback, useState } from 'react';
import type { ColumnId } from '../tableData';
import { readPins, togglePin, writePins } from '../../../features/organizations/pinnedFields';
import { useAppSelector } from '../../../hooks';

export function usePins() {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const [pins, setPins] = useState<ColumnId[]>(() => readPins(userId));

  const toggle = useCallback(
    (id: ColumnId) => {
      const next = togglePin(pins, id);
      writePins(userId, next);
      setPins(next);
    },
    [pins, userId],
  );

  return { pins, toggle };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/features/organizations/portfolioFields.test.ts src/features/organizations/pinnedFields.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/organizations src/components/organizations/portfolio/usePins.ts
git commit -m "feat(organizations): one registry for all 34 portfolio fields, and pinned fields per user

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Row visuals (ring, trend, runway, pulse, signal) and the house-rules scan

**Files:**
- Create: `src/components/organizations/portfolio/rowParts.tsx`
- Test: `src/components/organizations/portfolio/rowParts.test.tsx`
- Test: `src/components/organizations/portfolio/houseRules.test.ts`

**Interfaces:**
- Consumes: `HEALTH_COLORS` (`src/pages/dashboard/shared/chartPalette.ts`), `HealthBand`, `PortfolioRow` (Task 1).
- Produces:
  - Helpers: `BAND_LABEL: Record<HealthBand, 'Good'|'Average'|'Poor'>`, `trendLabel(trend: number[]): string`, `renewalText(days: number | null): string`, `touchText(days: number | null): string`. The disagreement marker reads the server's `pulse.disagree`.
  - `<HealthRing score category size?="md"|"lg" />`
  - `<TrendLine trend category className? />`
  - `<RenewalRunway renewal className? />`
  - `<PulsePair pulse className? />`
  - `<SignalTag signal />`

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/portfolio/rowParts.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  HealthRing,
  PulsePair,
  RenewalRunway,
  SignalTag,
  TrendLine,
  renewalText,
  touchText,
  trendLabel,
} from './rowParts';
import { pizzaHut } from '../../../features/organizations/testPortfolio';

describe('row parts', () => {
  it('names the ring by score and band, so colour is never the only signal', () => {
    render(<HealthRing score={4.9} category="average" />);
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByText('4.9')).toHaveClass('font-mono-brand', 'tabular-nums');
  });

  it('says so when there is no score', () => {
    render(<HealthRing score={null} category="poor" />);
    expect(screen.getByRole('img', { name: 'Health not scored' })).toBeInTheDocument();
  });

  it('labels the trend in words', () => {
    expect(trendLabel([6.2, 5.8, 5.5, 5.1, 5.0, 4.9])).toBe('Health falling from 6.2 to 4.9 over 6 months');
    expect(trendLabel([4, 5])).toBe('Health rising from 4.0 to 5.0 over 2 months');
    expect(trendLabel([5, 5])).toBe('Health steady at 5.0 over 2 months');
    expect(trendLabel([5])).toBe('Not enough health history for a trend');
    render(<TrendLine trend={[6.2, 4.9]} category="average" />);
    expect(screen.getByRole('img', { name: 'Health falling from 6.2 to 4.9 over 2 months' })).toBeInTheDocument();
  });

  it('writes the renewal runway and marks overdue in words and colour', () => {
    expect(renewalText(-47)).toBe('47d overdue');
    expect(renewalText(0)).toBe('Renews today');
    expect(renewalText(12)).toBe('in 12d');
    expect(renewalText(null)).toBe('No renewal date');
    render(<RenewalRunway renewal={{ date: '2026-08-09', days: -47 }} />);
    expect(screen.getByText('47d overdue')).toHaveClass('text-danger');
  });

  it('writes last touch, and says so when never contacted', () => {
    expect(touchText(null)).toBe('Never contacted');
    expect(touchText(0)).toBe('Touched today');
    expect(touchText(33)).toBe('Touched 33d ago');
  });

  it('shows both pulses, the stored dots and the AI label, and says in text when they disagree', () => {
    const { container, rerender } = render(<PulsePair pulse={pizzaHut.pulse} />);
    expect(container).toHaveTextContent('AI 1 · CSM 3');
    expect(screen.getByRole('img', { name: 'Pulse history: good, poor, poor' })).toBeInTheDocument();
    expect(screen.getByText('High Risk')).toBeInTheDocument();
    expect(screen.getByText('pulses disagree')).toBeInTheDocument();
    rerender(<PulsePair pulse={{ ...pizzaHut.pulse, disagree: false }} />);
    expect(screen.queryByText('pulses disagree')).not.toBeInTheDocument();
  });

  it('renders at most one signal, toned by kind', () => {
    const { rerender } = render(<SignalTag signal={{ kind: 'renewal_overdue', label: 'Renewal overdue' }} />);
    expect(screen.getByText('Renewal overdue')).toHaveClass('text-danger');
    rerender(<SignalTag signal={{ kind: 'tickets', label: '2 open tickets' }} />);
    expect(screen.getByText('2 open tickets')).toHaveClass('text-warning');
    rerender(<SignalTag signal={null} />);
    expect(screen.queryByText('2 open tickets')).not.toBeInTheDocument();
  });
});
```

`src/components/organizations/portfolio/houseRules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

// Spec §1 "House rules", enforced over every portfolio component so a
// regression fails here rather than at design review.
const sources = Object.entries(
  import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
).filter(([file]) => !file.includes('.test.'));

describe('portfolio house rules', () => {
  it('has sources to check', () => expect(sources.length).toBeGreaterThan(0));

  it('uses tokens only: no hex, rgb() or named palette colours', () => {
    const RAW = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(?:bg|text|border|fill|stroke)-(?:red|blue|green|amber|emerald|rose|purple|gray|slate|zinc|neutral)-\d/;
    expect(sources.filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('uses only the 11/13/15/22 px type sizes', () => {
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (!['11', '13', '15', '22'].includes(match[1])) offenders.push(`${file}: ${match[0]}`);
      }
      if (/\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/.test(source)) offenders.push(`${file}: named text size`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps glass off the list (the Ask rail is the only glass surface)', () => {
    expect(sources.filter(([, s]) => /rv-card-glass|rv-glass-inner|backdrop-blur/.test(s)).map(([f]) => f)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/rowParts.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: FAIL. `rowParts.test.tsx` fails with `Failed to resolve import "./rowParts"`. `houseRules.test.ts` fails on "has sources to check" (no `.tsx` yet).

- [ ] **Step 3: Write the row parts**

`src/components/organizations/portfolio/rowParts.tsx`:
```tsx
import { HEALTH_COLORS } from '../../../pages/dashboard/shared/chartPalette';
import { pulseWords } from '../../../features/organizations/portfolioFields';
import type { HealthBand, PortfolioRow } from '../../../features/organizations/portfolioTypes';

export const BAND_LABEL: Record<HealthBand, 'Good' | 'Average' | 'Poor'> = {
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
};

export function trendLabel(trend: number[]): string {
  if (trend.length < 2) return 'Not enough health history for a trend';
  const first = trend[0];
  const last = trend[trend.length - 1];
  if (first === last) return `Health steady at ${last.toFixed(1)} over ${trend.length} months`;
  const direction = last < first ? 'falling' : 'rising';
  return `Health ${direction} from ${first.toFixed(1)} to ${last.toFixed(1)} over ${trend.length} months`;
}

export function renewalText(days: number | null): string {
  if (days == null) return 'No renewal date';
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'Renews today';
  return `in ${days}d`;
}

/** `null` means never contacted (Activity Tracking's rule, no joined-date fallback). */
export function touchText(days: number | null): string {
  if (days == null) return 'Never contacted';
  if (days === 0) return 'Touched today';
  return `Touched ${days}d ago`;
}

/** Score out of 10 as a ring, coloured by band; the number carries the meaning. */
export function HealthRing({
  score,
  category,
  size = 'md',
}: {
  score: number | null;
  category: HealthBand;
  size?: 'md' | 'lg';
}) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const filled = score == null ? 0 : Math.max(0, Math.min(10, score)) / 10;
  const label = score == null ? 'Health not scored' : `Health ${score.toFixed(1)}, ${BAND_LABEL[category]}`;
  const box = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  return (
    <span role="img" aria-label={label} data-field="health" className={`relative inline-flex shrink-0 items-center justify-center ${box}`}>
      <svg viewBox="0 0 36 36" className={`absolute inset-0 -rotate-90 ${box}`} aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--border-default)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={HEALTH_COLORS[BAND_LABEL[category]]}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
        />
      </svg>
      <span aria-hidden="true" className="font-mono-brand tabular-nums text-[11px] font-semibold text-ink">
        {score == null ? '—' : score.toFixed(1)}
      </span>
    </span>
  );
}

/** Six months of health score from snapshots, as one line. */
export function TrendLine({ trend, category, className = '' }: { trend: number[]; category: HealthBand; className?: string }) {
  const width = 64;
  const height = 20;
  const points =
    trend.length < 2
      ? ''
      : trend
          .map((value, i) => {
            const x = (i / (trend.length - 1)) * width;
            const y = height - 2 - (Math.max(0, Math.min(10, value)) / 10) * (height - 4);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
  return (
    <span role="img" aria-label={trendLabel(trend)} className={`inline-flex shrink-0 ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-16 h-5" aria-hidden="true">
        {points ? (
          <polyline points={points} fill="none" stroke={HEALTH_COLORS[BAND_LABEL[category]]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-default)" strokeDasharray="2 3" />
        )}
      </svg>
    </span>
  );
}

/** A bar filling toward the renewal date over a year's runway. */
export function RenewalRunway({ renewal, className = '' }: { renewal: PortfolioRow['renewal']; className?: string }) {
  const overdue = renewal.days != null && renewal.days < 0;
  const fill = renewal.days == null ? 0 : overdue ? 1 : Math.max(0, 1 - renewal.days / 365);
  return (
    <span className={`flex-col gap-1 w-28 shrink-0 ${className}`}>
      <span className="block h-1 w-full rounded-full bg-line overflow-hidden" aria-hidden="true">
        <span className={`block h-full rounded-full ${overdue ? 'bg-danger' : 'bg-ink-muted'}`} style={{ width: `${fill * 100}%` }} />
      </span>
      <span className={`text-[11px] ${overdue ? 'text-danger font-semibold' : 'text-ink-muted'}`}>{renewalText(renewal.days)}</span>
    </span>
  );
}

const DOT: Record<number, string> = { 1: 'bg-success', 2: 'bg-danger', 3: 'bg-warning', 0: 'bg-line-strong' };

/** "AI n · CSM n", the stored pulse dots (the old Pulse column), the AI
 *  label (the old AI Pulse Score column) and, when the server says the two
 *  pulses differ by 2 or more, a marker in words. */
export function PulsePair({ pulse, className = '' }: { pulse: PortfolioRow['pulse']; className?: string }) {
  const show = (n: number | null) => (n == null ? '—' : String(n));
  return (
    <span className={`flex-col w-36 shrink-0 ${className}`}>
      <span className="font-mono-brand tabular-nums text-[13px] text-ink">
        AI {show(pulse.ai)} · CSM {show(pulse.csm)}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
        <span data-field="pulse" role="img" aria-label={`Pulse history: ${pulseWords(pulse.history)}`} className="flex gap-[3px]">
          {pulse.history.map((n, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${DOT[n] ?? DOT[0]}`} />
          ))}
        </span>
        <span data-field="aiPulseScore" className="truncate text-ink-muted">{pulse.ai_label || '—'}</span>
      </span>
      {pulse.disagree ? <span className="text-[11px] text-warning">pulses disagree</span> : null}
    </span>
  );
}

const SIGNAL_TONE = {
  renewal_overdue: 'bg-danger-dim text-danger',
  risk: 'bg-danger-dim text-danger',
  tickets: 'bg-warning-dim text-warning',
} as const;

export function SignalTag({ signal }: { signal: PortfolioRow['signal'] }) {
  if (!signal) return null;
  return (
    <span className={`inline-flex max-w-[9rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${SIGNAL_TONE[signal.kind]}`}>
      {signal.label}
    </span>
  );
}
```

`RenewalRunway` and `PulsePair` take their `display` from `className` (the row passes `hidden sm:flex`, the sheet passes `flex`). That way one component serves both the desktop row and the phone sheet.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/components/organizations/portfolio/rowParts.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (7 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/rowParts.tsx src/components/organizations/portfolio/rowParts.test.tsx src/components/organizations/portfolio/houseRules.test.ts
git commit -m "feat(organizations): health ring, trend line, renewal runway, pulse and signal for portfolio rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: `AccountRow`

**Files:**
- Create: `src/components/organizations/portfolio/AccountRow.tsx`
- Test: `src/components/organizations/portfolio/AccountRow.test.tsx`

**Interfaces:**
- Consumes: Task 4 parts, `PORTFOLIO_FIELDS` (Task 3), `formatCompactMoney`.
- Produces:
  - `LONG_PRESS_MS = 500`
  - `AccountRowProps`:
    - `row: PortfolioRow`
    - `currency: CurrencyCode`
    - `pins: ColumnId[]`
    - `selecting: boolean`
    - `selected: boolean`
    - `open: boolean`
    - `onToggleSelect(id: number)`
    - `onLongPress(id: number)`
    - `onToggleOpen(row: PortfolioRow)`
    - `children?: ReactNode` (the inline opened row, desktop only)
  - `<AccountRow {...AccountRowProps} />` renders an `<li>` whose header carries `data-part="header"`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/AccountRow.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountRow, LONG_PRESS_MS, type AccountRowProps } from './AccountRow';
import { pizzaHut } from '../../../features/organizations/testPortfolio';

function renderRow(overrides: Partial<AccountRowProps> = {}) {
  const props: AccountRowProps = {
    row: pizzaHut,
    currency: 'USD',
    pins: [],
    selecting: false,
    selected: false,
    open: false,
    onToggleSelect: vi.fn(),
    onLongPress: vi.fn(),
    onToggleOpen: vi.fn(),
    ...overrides,
  };
  const view = render(
    <MemoryRouter>
      <ul>
        <AccountRow {...props} />
      </ul>
    </MemoryRouter>,
  );
  return { ...view, props, header: view.container.querySelector('[data-part="header"]') as HTMLElement };
}

describe('AccountRow', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the eight row elements', () => {
    const { container } = renderRow();
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(container).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Health falling from 6.2 to 4.9 over 6 months' })).toBeInTheDocument();
    expect(screen.getByText('47d overdue')).toBeInTheDocument();
    expect(screen.getByText('$69.6K')).toHaveClass('font-mono-brand', 'tabular-nums');
    expect(container).toHaveTextContent('AI 1 · CSM 3');
    expect(screen.getByText('High Risk')).toBeInTheDocument();
    expect(screen.getByText('pulses disagree')).toBeInTheDocument();
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
  });

  it('opens from the row or the chevron, and the name navigates instead', async () => {
    const { props, header } = renderRow();
    await userEvent.click(header);
    expect(props.onToggleOpen).toHaveBeenCalledWith(pizzaHut);
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(2);
  });

  it('reports its open state on the chevron', () => {
    renderRow({ open: true, children: <div id="account-7-details">details</div> });
    const chevron = screen.getByRole('button', { name: 'Close Pizza Hut' });
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(chevron).toHaveAttribute('aria-controls', 'account-7-details');
    expect(screen.getByText('details')).toBeInTheDocument();
  });

  it('selects from its checkbox, and a tap selects while in selection mode', async () => {
    const { props, header } = renderRow({ selecting: true });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }));
    expect(props.onToggleSelect).toHaveBeenCalledWith(7);
    await userEvent.click(header);
    expect(props.onToggleSelect).toHaveBeenCalledTimes(2);
    expect(props.onToggleOpen).not.toHaveBeenCalled();
  });

  it('shows pinned fields as chips', () => {
    const { container } = renderRow({ pins: ['nps', 'totalSeatUtilization'] });
    expect(container.querySelector('[data-pin="nps"]')).toHaveTextContent('NPS −80');
    expect(container.querySelector('[data-pin="totalSeatUtilization"]')).toHaveTextContent('Seats 16%');
  });

  it('starts selection on a long press and swallows the click that follows', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(props.onLongPress).toHaveBeenCalledWith(7);
    fireEvent.pointerUp(header);
    fireEvent.click(header);
    expect(props.onToggleOpen).not.toHaveBeenCalled();
  });

  it('treats a short press as a tap', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS - 300);
    fireEvent.pointerUp(header);
    fireEvent.click(header);
    expect(props.onLongPress).not.toHaveBeenCalled();
    expect(props.onToggleOpen).toHaveBeenCalledWith(pizzaHut);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/organizations/portfolio/AccountRow.test.tsx`
Expected: FAIL with `Failed to resolve import "./AccountRow"`.

- [ ] **Step 3: Write the row**

`src/components/organizations/portfolio/AccountRow.tsx`:
```tsx
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { ColumnId } from '../tableData';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine, touchText } from './rowParts';

export const LONG_PRESS_MS = 500;

export interface AccountRowProps {
  row: PortfolioRow;
  currency: CurrencyCode;
  pins: ColumnId[];
  /** Any row is selected: taps select instead of opening. */
  selecting: boolean;
  selected: boolean;
  open: boolean;
  onToggleSelect: (id: number) => void;
  onLongPress: (id: number) => void;
  onToggleOpen: (row: PortfolioRow) => void;
  /** The opened row, inline (desktop). Phones open a sheet instead. */
  children?: ReactNode;
}

/** One account as a rounded item on the page (spec §1 "Account row").
 *  From `sm` it is a single line. Below `sm` the same elements wrap into a
 *  two-line card: ring, name and owner on top, then ARR, signal and trend
 *  (an `order-*` break element does the wrapping, so nothing renders twice). */
export function AccountRow({
  row,
  currency,
  pins,
  selecting,
  selected,
  open,
  onToggleSelect,
  onLongPress,
  onToggleOpen,
  children,
}: AccountRowProps) {
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const detailsId = `account-${row.id}-details`;
  const arr = row.arr == null ? '—' : formatCompactMoney(row.arr, currency);

  const cancelPress = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const startPress = (event: PointerEvent) => {
    // A mouse selects with the checkbox; long-press is for touch and pen.
    if (event.pointerType === 'mouse') return;
    longPressed.current = false;
    cancelPress();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      longPressed.current = true;
      onLongPress(row.id);
    }, LONG_PRESS_MS);
  };

  const onRowClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (selecting) onToggleSelect(row.id);
    else onToggleOpen(row);
  };

  return (
    <li
      data-row-id={row.id}
      className={`group rounded-xl bg-surface transition-shadow duration-[var(--dur-fast)] hover:shadow-sm ${selected ? 'ring-1 ring-accent' : ''}`}
    >
      <div
        data-part="header"
        onClick={onRowClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 cursor-pointer select-none sm:select-auto"
      >
        <label
          onClick={(event) => event.stopPropagation()}
          className={`shrink-0 items-center justify-center w-11 h-11 -m-2 sm:w-6 sm:h-6 sm:m-0 ${
            selecting ? 'flex' : 'hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.id)}
            aria-label={`Select ${row.name}`}
            className="w-4 h-4 cursor-pointer accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>

        <HealthRing score={row.health.score} category={row.health.category} />

        <div className="min-w-0 flex-1 sm:flex-none sm:w-56">
          <Link
            to={`/organizations/${row.id}`}
            onClick={(event) => event.stopPropagation()}
            data-field="organization"
            className="block truncate rounded-sm text-[13px] font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {row.name}
          </Link>
          <p className="truncate text-[11px] text-ink-muted">
            <span data-field="owner">{PORTFOLIO_FIELDS.owner.value(row)}</span> ·{' '}
            <span data-field="lifecycleStage">{row.lifecycle.label}</span> · {touchText(row.last_touch_days)}
          </p>
        </div>

        <TrendLine trend={row.health.trend} category={row.health.category} className="order-4 sm:order-none" />
        <RenewalRunway renewal={row.renewal} className="hidden sm:flex" />

        <span className="hidden sm:flex flex-1 min-w-0 flex-wrap gap-1">
          {pins.map((id) => {
            const field = PORTFOLIO_FIELDS[id];
            return (
              <span key={id} data-pin={id} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-muted">
                {field.short} <span className="font-mono-brand tabular-nums text-ink">{field.value(row)}</span>
              </span>
            );
          })}
        </span>

        <span className="order-2 sm:order-none sm:w-20 sm:text-right font-mono-brand tabular-nums text-[13px] text-ink">
          {arr}
        </span>

        <PulsePair pulse={row.pulse} className="hidden sm:flex" />

        <span className="order-3 sm:order-none sm:w-36 flex sm:justify-end min-w-0">
          <SignalTag signal={row.signal} />
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleOpen(row);
          }}
          aria-expanded={open}
          aria-controls={open && children ? detailsId : undefined}
          aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
          className="shrink-0 w-11 h-11 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {/* Phones: everything after this break wraps onto the card's second line. */}
        <span aria-hidden="true" className="order-1 basis-full h-0 sm:hidden" />
      </div>
      {children}
    </li>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/organizations/portfolio/AccountRow.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (7 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/AccountRow.tsx src/components/organizations/portfolio/AccountRow.test.tsx
git commit -m "feat(organizations): portfolio account row with pinned chips, selection and long-press

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `AccountDetails` (the opened row's six panels)

**Files:**
- Create: `src/components/organizations/portfolio/AccountDetails.tsx`
- Test: `src/components/organizations/portfolio/AccountDetails.test.tsx`

**Interfaces:**
- Consumes: `PANELS`, `PANEL_ORDER`, `PORTFOLIO_FIELDS` (Task 3), `PortfolioRow`.
- Produces:
  - `timelinePositions(dates: (string | null)[], today: string): { marks: (number | null)[]; today: number | null }`, with positions as percentages 0–100.
  - `npsBand(score: number | null): string`, using the backend's sign rule.
  - `<AccountDetails row id? today? onEdit? />`, where `onEdit(id: number)`. The churn fields show when `row.churned`. Every field renders with `data-field`, and every panel is a `<section data-panel>`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/AccountDetails.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountDetails, npsBand, timelinePositions } from './AccountDetails';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';

describe('AccountDetails', () => {
  it('shows the six panels in the spec order', () => {
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Commercial',
      'Contract timeline',
      'Adoption',
      'Voice of the customer',
      'Profile',
      'History',
    ]);
  });

  it('prints commercial money in the account currency and numbers in mono', () => {
    const { container } = render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    const tcv = container.querySelector('[data-field="tcv"]');
    expect(tcv).toHaveTextContent('$140,000.00');
    expect(tcv).toHaveClass('font-mono-brand', 'tabular-nums');
  });

  it('colours an overdue renewal danger, in the timeline and the date', () => {
    const { container } = render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(container.querySelector('[data-field="renewalDate"]')).toHaveClass('text-danger');
    expect(container.querySelector('[data-mark="renewalDate"]')).toHaveClass('bg-danger');
  });

  it('names the NPS band by the backend sign rule', () => {
    expect(npsBand(-80)).toBe('Detractor');
    expect(npsBand(0)).toBe('Passive');
    expect(npsBand(12)).toBe('Promoter');
    expect(npsBand(null)).toBe('No NPS yet');
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(screen.getByText('Detractor')).toBeInTheDocument();
  });

  it('meters active of contracted seats and quotes the AI pulse reason', () => {
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    const meter = screen.getByRole('meter', { name: 'Active of contracted seats' });
    expect(meter).toHaveAttribute('aria-valuenow', '16');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('Usage fell after the admin left.').tagName).toBe('BLOCKQUOTE');
  });

  it('shows the churn fields only for a churned account', () => {
    const { container, rerender } = render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(container.querySelector('[data-field="churnReason"]')).toBeNull();
    rerender(<AccountDetails row={initech} today="2026-09-25" />);
    const history = container.querySelector('[data-panel="history"]') as HTMLElement;
    expect(within(history).getByText('Budget cuts')).toBeInTheDocument();
    expect(within(history).getByText('Lost the budget line.')).toBeInTheDocument();
  });

  it('offers Edit details when given a handler', async () => {
    const onEdit = vi.fn();
    render(<AccountDetails row={pizzaHut} today="2026-09-25" onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledWith(7);
  });

  it('places timeline marks and today between the earliest and latest date', () => {
    const { marks, today } = timelinePositions(['2024-01-01', null, '2026-01-01'], '2025-01-01');
    expect(marks[0]).toBe(0);
    expect(marks[1]).toBeNull();
    expect(marks[2]).toBe(100);
    expect(today).toBeCloseTo(50, 0);
    expect(timelinePositions([null, null], '2025-01-01')).toEqual({ marks: [null, null], today: null });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/organizations/portfolio/AccountDetails.test.tsx`
Expected: FAIL with `Failed to resolve import "./AccountDetails"`.

- [ ] **Step 3: Write the panels**

`src/components/organizations/portfolio/AccountDetails.tsx`:
```tsx
import { Fragment, useId, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type { ColumnId } from '../tableData';
import { PANELS, PANEL_ORDER, PORTFOLIO_FIELDS, type PanelKey } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';

const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Where each date (and today) sits on a line from the earliest to the latest
 *  of them, as a percentage. Missing dates have no mark. */
export function timelinePositions(
  dates: (string | null)[],
  today: string,
): { marks: (number | null)[]; today: number | null } {
  const known = dates.filter((d): d is string => Boolean(d)).map(utc);
  if (known.length === 0) return { marks: dates.map(() => null), today: null };
  const now = utc(today);
  const lo = Math.min(...known, now);
  const hi = Math.max(...known, now);
  const span = hi - lo || 1;
  const at = (value: number) => Math.round(((value - lo) / span) * 1000) / 10;
  return { marks: dates.map((d) => (d ? at(utc(d)) : null)), today: at(now) };
}

function Panel({ panel, children }: { panel: PanelKey; children: ReactNode }) {
  const headingId = useId();
  const title = PANELS.find((p) => p.key === panel)?.title ?? panel;
  return (
    <section aria-labelledby={headingId} data-panel={panel} className="min-w-0">
      <h3 id={headingId} className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Pairs({
  row,
  ids,
  mono = true,
  tone = {},
}: {
  row: PortfolioRow;
  ids: ColumnId[];
  mono?: boolean;
  tone?: Partial<Record<ColumnId, string>>;
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
      {ids.map((id) => {
        const field = PORTFOLIO_FIELDS[id];
        return (
          <Fragment key={id}>
            <dt className="truncate text-ink-muted">{field.label}</dt>
            <dd
              data-field={id}
              className={`text-right break-words ${mono ? 'font-mono-brand tabular-nums' : ''} ${tone[id] ?? 'text-ink'}`}
            >
              {field.value(row)}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

function ContractPanel({ row, today }: { row: PortfolioRow; today: string }) {
  const ids = PANEL_ORDER.contract;
  const c = row.details.contract;
  const { marks, today: todayAt } = timelinePositions(
    [c.joined_date, c.contract_start_date, c.renewal_date, c.contract_end_date],
    today,
  );
  const overdue = row.renewal.days != null && row.renewal.days < 0;
  return (
    <Panel panel="contract">
      <div className="relative h-6" aria-hidden="true">
        <span className="absolute left-0 right-0 top-1/2 h-px bg-line" />
        {marks.map((at, i) =>
          at == null ? null : (
            <span
              key={ids[i]}
              data-mark={ids[i]}
              className={`absolute top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                ids[i] === 'renewalDate' && overdue ? 'bg-danger' : 'bg-ink-muted'
              }`}
              style={{ left: `${at}%` }}
            />
          ),
        )}
        {todayAt == null ? null : (
          <span className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-ink" style={{ left: `${todayAt}%` }} />
        )}
      </div>
      <p className="mb-2 text-[11px] text-ink-muted">Dots mark the dates below. The line marks today.</p>
      <Pairs row={row} ids={ids} tone={overdue ? { renewalDate: 'text-danger font-semibold' } : {}} />
    </Panel>
  );
}

function AdoptionPanel({ row }: { row: PortfolioRow }) {
  const a = row.details.adoption;
  const contracted = a.total_contracted_seats ?? 0;
  const active = a.total_active_seats ?? 0;
  const ratio = contracted > 0 ? Math.min(1, active / contracted) : 0;
  const { primary, additional_count } = a.products;
  return (
    <Panel panel="adoption">
      <div
        role="meter"
        aria-label="Active of contracted seats"
        aria-valuemin={0}
        aria-valuemax={contracted}
        aria-valuenow={active}
        className="h-1.5 overflow-hidden rounded-full bg-line"
      >
        <span className="block h-full bg-ink" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1 mb-2 text-[11px] text-ink-muted">
        <span className="font-mono-brand tabular-nums">
          {active.toLocaleString('en-US')} of {contracted.toLocaleString('en-US')}
        </span>{' '}
        seats active
      </p>
      <Pairs row={row} ids={['totalContractedSeats', 'totalActiveSeats', 'totalSeatUtilization', 'totalHires', 'scopeWebApp']} />
      <p className="mt-2 text-[13px] text-ink-muted">Products</p>
      <div data-field="productsUtilized" className="mt-1 flex flex-wrap gap-1">
        {primary ? (
          <>
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink">{primary.name}</span>
            {additional_count ? (
              <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-muted">(+{additional_count})</span>
            ) : null}
          </>
        ) : (
          <span className="text-[13px] text-ink-muted">—</span>
        )}
      </div>
    </Panel>
  );
}

/** The backend's sign rule (/customers/stats/): above 0 promoter, 0 passive, below 0 detractor. */
export function npsBand(score: number | null): string {
  if (score == null) return 'No NPS yet';
  if (score > 0) return 'Promoter';
  if (score < 0) return 'Detractor';
  return 'Passive';
}

function VoicePanel({ row }: { row: PortfolioRow }) {
  const nps = row.details.voice.nps_score;
  const at = nps == null ? null : (Math.max(-100, Math.min(100, nps)) + 100) / 2;
  return (
    <Panel panel="voice">
      <p className="mb-1 text-[11px] font-semibold text-ink">{npsBand(nps)}</p>
      <div className="relative h-1.5 rounded-full bg-line" aria-hidden="true">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-ink-muted" />
        {at == null ? null : (
          <span
            className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
            style={{ left: `${at}%` }}
          />
        )}
      </div>
      <p className="mt-1 mb-2 flex justify-between font-mono-brand tabular-nums text-[11px] text-ink-muted" aria-hidden="true">
        <span>−100</span>
        <span>0</span>
        <span>+100</span>
      </p>
      <Pairs row={row} ids={['nps', 'csatScore', 'cesPercentage']} />
      <p className="mt-3 text-[11px] text-ink-muted">AI pulse reason</p>
      <blockquote data-field="aiPulseReason" className="mt-1 border-l-2 border-line pl-3 text-[13px] text-ink">
        {PORTFOLIO_FIELDS.aiPulseReason.value(row)}
      </blockquote>
    </Panel>
  );
}

/** Every field the row header does not show, in six panels (spec §1
 *  "Opened row"). It is part of its row: panels are grouped by whitespace,
 *  never boxed, so there is no card in a card. */
export function AccountDetails({
  row,
  id,
  today = new Date().toISOString().slice(0, 10),
  onEdit,
}: {
  row: PortfolioRow;
  id?: string;
  today?: string;
  onEdit?: (id: number) => void;
}) {
  const churned = row.churned;
  return (
    <div id={id} className="grid gap-x-8 gap-y-5 border-t border-line-subtle px-3 pt-3 pb-4 md:grid-cols-2 xl:grid-cols-3">
      <Panel panel="commercial">
        <Pairs row={row} ids={PANEL_ORDER.commercial} />
      </Panel>
      <ContractPanel row={row} today={today} />
      <AdoptionPanel row={row} />
      <VoicePanel row={row} />
      <Panel panel="profile">
        <Pairs row={row} ids={PANEL_ORDER.profile} mono={false} tone={{ revenactId: 'text-ink font-mono-brand tabular-nums' }} />
      </Panel>
      <Panel panel="history">
        <Pairs row={row} ids={churned ? PANEL_ORDER.history : ['createdBy', 'modifiedBy']} mono={false} />
      </Panel>
      {onEdit ? (
        <div className="flex justify-end md:col-span-2 xl:col-span-3">
          <button
            type="button"
            onClick={() => onEdit(row.id)}
            className="inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
            Edit details
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/organizations/portfolio/AccountDetails.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (8 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/AccountDetails.tsx src/components/organizations/portfolio/AccountDetails.test.tsx
git commit -m "feat(organizations): opened row with commercial, contract, adoption, voice, profile and history panels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Every one of the 34 fields renders once (test over the field list)

**Files:**
- Test: `src/components/organizations/portfolio/fieldCoverage.test.tsx`

**Interfaces:**
- Consumes: `ALL_COLUMNS` (`tableData.ts`), `AccountRow` (Task 5), `AccountDetails` (Task 6), `PORTFOLIO_FIELDS`, `HEADER_FIELDS`, `PANEL_ORDER` (Task 3), `initech`/`pizzaHut` fixtures.
- Produces: no production code. This is the spec §5 guarantee that "Every one of the 34 fields is rendered in either the row header or the opened row".

- [ ] **Step 1: Write the test**

`src/components/organizations/portfolio/fieldCoverage.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ALL_COLUMNS } from '../tableData';
import { AccountRow } from './AccountRow';
import { AccountDetails } from './AccountDetails';
import { HEADER_FIELDS, PANEL_ORDER, PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';

// The spec's promise: nothing the old table showed is lost. The churned
// fixture is used because the churn fields only show when churned.
function renderOpened(row: PortfolioRow) {
  return render(
    <MemoryRouter>
      <ul>
        <AccountRow
          row={row}
          currency="USD"
          pins={['nps', 'tcv', 'domain']}
          selecting={false}
          selected={false}
          open
          onToggleSelect={() => {}}
          onLongPress={() => {}}
          onToggleOpen={() => {}}
        >
          <AccountDetails row={row} today="2026-09-25" />
        </AccountRow>
      </ul>
    </MemoryRouter>,
  ).container;
}

describe('the 34 table fields', () => {
  it('are the list this test walks', () => {
    expect(ALL_COLUMNS).toHaveLength(34);
  });

  it.each(ALL_COLUMNS.map((column) => [column.id, column.label] as const))(
    '%s (%s) renders exactly once, in the header or the opened row',
    (id) => {
      const container = renderOpened(initech);
      const found = container.querySelectorAll(`[data-field="${id}"]`);
      expect(found).toHaveLength(1);
      expect(found[0].textContent?.trim()).not.toBe('');
      const place = PORTFOLIO_FIELDS[id].place;
      if (place === 'header') {
        expect(found[0].closest('[data-part="header"]')).not.toBeNull();
      } else {
        expect(found[0].closest(`[data-panel="${place}"]`)).not.toBeNull();
      }
    },
  );

  it('header fields sit in the header and panel fields in their panel', () => {
    const container = renderOpened(initech);
    const header = container.querySelector('[data-part="header"]') as HTMLElement;
    for (const id of HEADER_FIELDS) expect(header.querySelector(`[data-field="${id}"]`)).not.toBeNull();
    for (const [panel, ids] of Object.entries(PANEL_ORDER)) {
      const section = container.querySelector(`[data-panel="${panel}"]`) as HTMLElement;
      for (const id of ids) expect(section.querySelector(`[data-field="${id}"]`)).not.toBeNull();
    }
  });

  it('an account that has not churned shows the other 31', () => {
    const container = renderOpened(pizzaHut);
    const shown = ALL_COLUMNS.filter((c) => container.querySelector(`[data-field="${c.id}"]`));
    expect(shown).toHaveLength(31);
    expect(shown.map((c) => c.id)).not.toContain('churnReason');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/organizations/portfolio/fieldCoverage.test.tsx`
Expected: PASS (37 tests). If an id fails, the registry, row or panel is missing that field, so fix it in the component that owns the field (Task 5 or 6), not in this test.

- [ ] **Step 3: Prove the test bites**

Temporarily delete `data-field="domain"` in `AccountDetails.tsx`'s `Pairs` by changing `data-field={id}` to `data-field={id === 'domain' ? undefined : id}`. Run the test and expect `domain (Domain) renders exactly once` to FAIL. Revert the change and run again: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/organizations/portfolio/fieldCoverage.test.tsx
git commit -m "test(organizations): every one of the 34 table fields renders once in the row or its panels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Data hooks (paged portfolio, the frame with its M probe, selection)

**Files:**
- Create: `src/components/organizations/portfolio/usePortfolio.ts`
- Create: `src/components/organizations/portfolio/useSelection.ts`
- Test: `src/components/organizations/portfolio/usePortfolio.test.tsx`, `src/components/organizations/portfolio/useSelection.test.tsx`

**Interfaces:**
- Consumes: `fetchPortfolio` (Task 1), `toApiQuery`, `hasFilters`, `PortfolioParams` (Task 2), `ApiError`.
- Produces:
  - Constants: `PAGE_SIZE = 50`, `SECTION_PAGE_SIZE = 25`
  - `errorMessage(err: unknown, fallback: string): string`
  - `PagedState = { data: PortfolioResponse | null; rows: PortfolioRow[]; next: string | null; loading: boolean; error: string | null; loadingMore: boolean; moreError: string | null; loadMore(): Promise<void>; retry(): void }`
  - `usePagedPortfolio(query: string, enabled: boolean, version: number, onLoaded?: (rows: PortfolioRow[]) => void): PagedState`, where `query` already carries `limit`.
  - `PortfolioState = PagedState & { total: number | null }`
  - `usePortfolio(params: PortfolioParams, version: number, onLoaded?): PortfolioState`. The frame request is `limit=1` when grouped, `limit=50` otherwise, and `total` is M from the probe (null when unfiltered or unknown).
  - `useSelection(resetKey: string): { selected: Set<number>; selecting: boolean; toggle(id): void; replace(ids: number[]): void; clear(): void }`

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/portfolio/usePortfolio.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePagedPortfolio, usePortfolio } from './usePortfolio';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio, portfolioQueries, stubPortfolio } from '../../../features/organizations/testPortfolio';

const params = (search = '') => parseParams(new URLSearchParams(search));

describe('usePortfolio', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the frame only (limit 1) when grouped', async () => {
    const spy = stubPortfolio();
    const { result } = renderHook(() => usePortfolio(params(), 0));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const [frame] = portfolioQueries(spy);
    expect(frame.get('limit')).toBe('1');
    expect(frame.get('group')).toBe('health');
    expect(result.current.rows).toEqual([]);
    expect(result.current.data?.groups.map((g) => g.key)).toEqual(['average', 'good']);
    expect(result.current.total).toBeNull();
  });

  it('pages an ungrouped list with the cursor and reports each page', async () => {
    const spy = stubPortfolio({
      portfolio: (q) => {
        const two = new URLSearchParams(q);
        two.set('limit', '2');
        return buildPortfolio(two);
      },
    });
    const onLoaded = vi.fn();
    const { result } = renderHook(() => usePortfolio(params('group=none&include_churned=1'), 0, onLoaded));
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual([7, 1]));
    expect(portfolioQueries(spy)[0].get('limit')).toBe('50');
    expect(result.current.next).toBe('2');
    await act(() => result.current.loadMore());
    expect(result.current.rows.map((r) => r.id)).toEqual([7, 1, 2]);
    expect(result.current.next).toBeNull();
    expect(portfolioQueries(spy).at(-1)?.get('cursor')).toBe('2');
    expect(onLoaded).toHaveBeenCalledTimes(2);
  });

  it('probes the unfiltered book for M when filtered, keeping the churn scope', async () => {
    const spy = stubPortfolio();
    const { result } = renderHook(() => usePortfolio(params('health=average'), 0));
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.data?.count).toBe(1);
    const probe = portfolioQueries(spy).find((q) => q.toString() === 'limit=1');
    expect(probe).toBeDefined();

    const churn = renderHook(() => usePortfolio(params('include_churned=1&owner=2'), 0));
    await waitFor(() => expect(churn.result.current.total).toBe(3));
  });

  it('reports an error and retries', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Boom' } } : buildPortfolio(q)) });
    const { result } = renderHook(() => usePortfolio(params(), 0));
    await waitFor(() => expect(result.current.error).toBe('Boom'));
    expect(result.current.data).toBeNull();
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('refetches when the version changes', async () => {
    const spy = stubPortfolio();
    const { result, rerender } = renderHook(({ version }) => usePortfolio(params(), version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ version: 1 });
    await waitFor(() => expect(portfolioQueries(spy)).toHaveLength(2));
  });

  it('does not fetch while disabled', async () => {
    const spy = stubPortfolio();
    const { result } = renderHook(() => usePagedPortfolio('group=health&group_value=poor&limit=25', false, 0));
    expect(result.current.loading).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

`src/components/organizations/portfolio/useSelection.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelection } from './useSelection';

describe('useSelection', () => {
  it('toggles, replaces and clears', () => {
    const { result } = renderHook(() => useSelection('a'));
    expect(result.current.selecting).toBe(false);
    act(() => result.current.toggle(7));
    act(() => result.current.toggle(1));
    expect([...result.current.selected]).toEqual([7, 1]);
    expect(result.current.selecting).toBe(true);
    act(() => result.current.toggle(7));
    expect([...result.current.selected]).toEqual([1]);
    act(() => result.current.replace([2, 3]));
    expect([...result.current.selected]).toEqual([2, 3]);
    act(() => result.current.clear());
    expect(result.current.selecting).toBe(false);
  });

  it('clears when the filters change', () => {
    const { result, rerender } = renderHook(({ key }) => useSelection(key), { initialProps: { key: 'owner=2' } });
    act(() => result.current.toggle(7));
    rerender({ key: 'owner=3' });
    expect(result.current.selected.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/usePortfolio.test.tsx src/components/organizations/portfolio/useSelection.test.tsx`
Expected: FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write the hooks**

`src/components/organizations/portfolio/usePortfolio.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { fetchPortfolio } from '../../../features/organizations/portfolioApi';
import { hasFilters, toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioResponse, PortfolioRow } from '../../../features/organizations/portfolioTypes';

export const PAGE_SIZE = 50;
export const SECTION_PAGE_SIZE = 25;

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

type Loaded =
  | { key: string; data: PortfolioResponse; rows: PortfolioRow[]; next: string | null }
  | { key: string; error: string };

export interface PagedState {
  /** The latest response. While a new query loads, the previous one stays so
   *  the list does not flash empty. `loading` says it is stale. */
  data: PortfolioResponse | null;
  rows: PortfolioRow[];
  next: string | null;
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: () => Promise<void>;
  retry: () => void;
}

/** One cursor-paged read of the portfolio endpoint. The frame, each grouped
 *  section and (delivery 2) each board column is one of these. Loading is
 *  derived from which query the stored answer belongs to, so no state is
 *  set synchronously inside the effect. */
export function usePagedPortfolio(
  query: string,
  enabled: boolean,
  version: number,
  onLoaded?: (rows: PortfolioRow[]) => void,
): PagedState {
  const [attempt, setAttempt] = useState(0);
  const key = `${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // The latest callback, so a caller passing an inline function does not
  // refetch on every render.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPortfolio(query).then(
      (data) => {
        if (cancelled) return;
        setLoaded({ key, data, rows: data.results, next: data.next_cursor });
        onLoadedRef.current?.(data.results);
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ key, error: errorMessage(err, 'Could not load organizations.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, key, query]);

  const current = loaded && 'data' in loaded ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current || current.key !== key || !current.next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchPortfolio(`${query}&cursor=${encodeURIComponent(current.next)}`);
      setLoaded((prev) =>
        prev && 'data' in prev && prev.key === key
          ? { ...prev, rows: [...prev.rows, ...page.results], next: page.next_cursor }
          : prev,
      );
      onLoadedRef.current?.(page.results);
    } catch (err) {
      setMoreError(errorMessage(err, 'Could not load more organizations.'));
    } finally {
      setLoadingMore(false);
    }
  }, [current, key, query]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    data: current?.data ?? null,
    rows: current?.rows ?? [],
    next: current?.next ?? null,
    loading: enabled && loaded?.key !== key,
    error: loaded && 'error' in loaded && loaded.key === key ? loaded.error : null,
    loadingMore,
    moreError,
    loadMore,
    retry,
  };
}

export interface PortfolioState extends PagedState {
  /** M in "N of M": the whole visible book, in the view's churn scope.
   *  Null when no filter is active (the page then says "N organizations"). */
  total: number | null;
}

export function usePortfolio(
  params: PortfolioParams,
  version: number,
  onLoaded?: (rows: PortfolioRow[]) => void,
): PortfolioState {
  const grouped = params.group !== '';
  // Grouped, the frame only needs summary, groups, filters, count and
  // currency; each section reads its own rows (plan pre-flight #6).
  const frame = usePagedPortfolio(
    toApiQuery(params, { limit: String(grouped ? 1 : PAGE_SIZE) }),
    true,
    version,
    grouped ? undefined : onLoaded,
  );

  const withChurn = params.include_churned || params.lifecycle.includes('churn') || params.ids.length > 0;
  const probeQuery = hasFilters(params) ? (withChurn ? 'include_churned=1&limit=1' : 'limit=1') : null;
  const probeKey = probeQuery ? `${probeQuery}#${version}` : null;
  const [probe, setProbe] = useState<{ key: string; count: number } | null>(null);

  useEffect(() => {
    if (!probeQuery || !probeKey) return;
    let cancelled = false;
    fetchPortfolio(probeQuery).then(
      (data) => {
        if (!cancelled) setProbe({ key: probeKey, count: data.count });
      },
      () => {
        // M stays unknown; the page says "N organizations" instead of a guess.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [probeQuery, probeKey]);

  return {
    ...frame,
    rows: grouped ? [] : frame.rows,
    total: probeKey && probe?.key === probeKey ? probe.count : null,
  };
}
```

`src/components/organizations/portfolio/useSelection.ts`:
```ts
import { useCallback, useState } from 'react';

/** Selected account ids. Cleared when `resetKey` (the filters) changes,
 *  as the spec's selection mode requires. The reset happens during render
 *  (React's "adjust state when a value changes" pattern), not in an effect. */
export function useSelection(resetKey: string) {
  const [state, setState] = useState({ key: resetKey, ids: new Set<number>() });
  let current = state;
  if (state.key !== resetKey) {
    current = { key: resetKey, ids: new Set<number>() };
    setState(current);
  }

  const toggle = useCallback((id: number) => {
    setState((prev) => {
      const ids = new Set(prev.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...prev, ids };
    });
  }, []);

  const replace = useCallback((ids: number[]) => setState((prev) => ({ ...prev, ids: new Set(ids) })), []);
  const clear = useCallback(() => setState((prev) => ({ ...prev, ids: new Set<number>() })), []);

  return { selected: current.ids, selecting: current.ids.size > 0, toggle, replace, clear };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/components/organizations/portfolio/usePortfolio.test.tsx src/components/organizations/portfolio/useSelection.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint the hooks**

Run: `npx eslint src/components/organizations/portfolio/usePortfolio.ts src/components/organizations/portfolio/useSelection.ts`
Expected: no output (no `set-state-in-effect` warning, because every `setState` in an effect runs in a promise callback).

- [ ] **Step 6: Commit**

```bash
git add src/components/organizations/portfolio/usePortfolio.ts src/components/organizations/portfolio/usePortfolio.test.tsx src/components/organizations/portfolio/useSelection.ts src/components/organizations/portfolio/useSelection.test.tsx
git commit -m "feat(organizations): paged portfolio reads, the N-of-M probe and selection state

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `SummaryTiles`

**Files:**
- Create: `src/components/organizations/portfolio/SummaryTiles.tsx`
- Test: `src/components/organizations/portfolio/SummaryTiles.test.tsx`

**Interfaces:**
- Consumes: `PortfolioSummary`, `PortfolioParams`, `formatCompactMoney`, `signed` (Task 3), `BAND_LABEL` (Task 4).
- Produces: `<SummaryTiles summary: PortfolioSummary | null; currency: CurrencyCode; params: PortfolioParams; onFilter(patch: Partial<PortfolioParams>) />`. The five tiles are regions named `Health`, `NPS`, `Lifecycle`, `Accounts · ARR`, `Renewing`. A null summary renders the skeleton (`role="status"` "Loading summary").

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/SummaryTiles.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummaryTiles } from './SummaryTiles';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio } from '../../../features/organizations/testPortfolio';

const summary = buildPortfolio(new URLSearchParams()).summary;

function renderTiles(search = '') {
  const onFilter = vi.fn();
  render(<SummaryTiles summary={summary} currency="USD" params={parseParams(new URLSearchParams(search))} onFilter={onFilter} />);
  return onFilter;
}

describe('SummaryTiles', () => {
  it('shows the five tiles', () => {
    renderTiles();
    for (const name of ['Health', 'NPS', 'Lifecycle', 'Accounts · ARR', 'Renewing']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    const accounts = screen.getByRole('region', { name: 'Accounts · ARR' });
    expect(accounts).toHaveTextContent('2');
    expect(accounts).toHaveTextContent('$189.6K ARR');
    expect(accounts).not.toHaveTextContent('exchange rate');
  });

  it('says how many accounts have no exchange rate', () => {
    render(<SummaryTiles summary={{ ...summary, unconverted_count: 2 }} currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Accounts · ARR' })).toHaveTextContent('2 without an exchange rate, left out of ARR');
  });

  it('filters to a health band on click, and clears it on a second click', async () => {
    const onFilter = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ health: ['average'] });

    const again = vi.fn();
    render(<SummaryTiles summary={summary} currency="USD" params={parseParams(new URLSearchParams('health=average'))} onFilter={again} />);
    const pressed = screen.getAllByRole('button', { name: 'Average 1' }).find((b) => b.getAttribute('aria-pressed') === 'true')!;
    await userEvent.click(pressed);
    expect(again).toHaveBeenCalledWith({ health: [] });
  });

  it('switches health between count, MRR and ARR', async () => {
    renderTiles();
    const health = screen.getByRole('region', { name: 'Health' });
    await userEvent.click(within(health).getByRole('button', { name: 'ARR' }));
    expect(within(health).getByRole('button', { name: 'Average $69.6K' })).toBeInTheDocument();
    await userEvent.click(within(health).getByRole('button', { name: 'MRR' }));
    expect(within(health).getByRole('button', { name: 'Average $5.8K' })).toBeInTheDocument();
  });

  it('filters by NPS band and lifecycle stage', async () => {
    const onFilter = renderTiles();
    expect(screen.getByRole('region', { name: 'NPS' })).toHaveTextContent('+44');
    await userEvent.click(screen.getByRole('button', { name: 'Detractors 2' }));
    expect(onFilter).toHaveBeenLastCalledWith({ nps: 'detractor' });
    await userEvent.click(screen.getByRole('button', { name: 'Live 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ lifecycle: ['live'] });
  });

  it('counts renewals in 30 or 90 days and filters to that window', async () => {
    const onFilter = renderTiles();
    const renewing = screen.getByRole('region', { name: 'Renewing' });
    await userEvent.click(within(renewing).getByRole('button', { name: '90d' }));
    await userEvent.click(within(renewing).getByRole('button', { name: 'Renewing within 90 days: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ renews_within: '90' });
  });

  it('shows tile-shaped skeletons while loading', () => {
    render(<SummaryTiles summary={null} currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    expect(screen.getByRole('status', { name: 'Loading summary' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/organizations/portfolio/SummaryTiles.test.tsx`
Expected: FAIL with `Failed to resolve import "./SummaryTiles"`.

- [ ] **Step 3: Write the tiles**

`src/components/organizations/portfolio/SummaryTiles.tsx`:
```tsx
import { useState, type ReactNode } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { signed } from '../../../features/organizations/portfolioFields';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { HealthBand, NpsBand, PortfolioSummary } from '../../../features/organizations/portfolioTypes';
import { BAND_LABEL } from './rowParts';

const BANDS: HealthBand[] = ['good', 'average', 'poor'];
const BAND_DOT: Record<HealthBand, string> = { good: 'bg-success', average: 'bg-warning', poor: 'bg-danger' };
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

function Tile({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-[15rem] shrink-0 snap-start rounded-xl bg-surface p-3 sm:min-w-0">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Switch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md bg-subtle p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 sm:min-h-6 rounded px-1.5 text-[11px] font-semibold ${FOCUS} ${
            value === option.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FilterButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full min-h-11 sm:min-h-7 items-center justify-between gap-2 rounded-md px-1.5 text-[11px] hover:bg-subtle active:bg-line-subtle ${FOCUS} ${
        pressed ? 'bg-subtle font-semibold text-ink' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

const only = <T,>(values: T[], value: T) => values.length === 1 && values[0] === value;
const mono = 'font-mono-brand tabular-nums';

function Skeleton() {
  return (
    <div role="status" aria-label="Loading summary" className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} aria-hidden="true" className="min-w-[15rem] shrink-0 rounded-xl bg-surface p-3 sm:min-w-0">
          <span className="block h-2.5 w-16 animate-pulse rounded bg-subtle" />
          <span className="mt-3 block h-5 w-20 animate-pulse rounded bg-subtle" />
          <span className="mt-3 block h-2 w-full animate-pulse rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}

/** The five summary tiles (spec §1). Numbers come from the server for the
 *  current filters, and every segment filters the list on click. On phones
 *  the row swipes sideways; the page itself never scrolls horizontally. */
export function SummaryTiles({
  summary,
  currency,
  params,
  onFilter,
}: {
  summary: PortfolioSummary | null;
  currency: CurrencyCode;
  params: PortfolioParams;
  onFilter: (patch: Partial<PortfolioParams>) => void;
}) {
  const [mode, setMode] = useState<'count' | 'mrr' | 'arr'>('count');
  const [span, setSpan] = useState<'30' | '90'>('30');
  if (!summary) return <Skeleton />;

  const health = summary.health;
  const bandValue = (band: HealthBand) => (mode === 'count' ? health[band] : health[mode][band]);
  const bandTotal = BANDS.reduce((total, band) => total + bandValue(band), 0);
  const show = (n: number) => (mode === 'count' ? String(n) : formatCompactMoney(n, currency));

  const nps = summary.nps;
  const npsBands: { band: NpsBand; label: string; count: number; bar: string }[] = [
    { band: 'promoter', label: 'Promoters', count: nps.promoters, bar: 'bg-success' },
    { band: 'passive', label: 'Passives', count: nps.passives, bar: 'bg-line-strong' },
    { band: 'detractor', label: 'Detractors', count: nps.detractors, bar: 'bg-danger' },
  ];
  const npsTotal = nps.promoters + nps.passives + nps.detractors;
  const stageMax = Math.max(1, ...summary.lifecycle.map((s) => s.count));
  const renewing = summary.renewing[span];

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
      <Tile
        title="Health"
        action={
          <Switch
            label="Health measure"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'count', label: 'Count' },
              { value: 'mrr', label: 'MRR' },
              { value: 'arr', label: 'ARR' },
            ]}
          />
        }
      >
        <div aria-hidden="true" className="mb-2 flex h-2 overflow-hidden rounded-full bg-line">
          {bandTotal > 0
            ? BANDS.map((band) => (
                <span key={band} className={BAND_DOT[band]} style={{ width: `${(bandValue(band) / bandTotal) * 100}%` }} />
              ))
            : null}
        </div>
        {BANDS.map((band) => (
          <FilterButton
            key={band}
            pressed={only(params.health, band)}
            onClick={() => onFilter({ health: only(params.health, band) ? [] : [band] })}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${BAND_DOT[band]}`} />
              {BAND_LABEL[band]}
            </span>
            <span className={`${mono} text-ink`}>{show(bandValue(band))}</span>
          </FilterButton>
        ))}
      </Tile>

      <Tile title="NPS">
        <p className={`${mono} text-[22px] leading-tight text-ink`}>{signed(nps.score)}</p>
        <div aria-hidden="true" className="my-2 flex h-2 overflow-hidden rounded-full bg-line">
          {npsTotal > 0
            ? npsBands.map((b) => <span key={b.band} className={b.bar} style={{ width: `${(b.count / npsTotal) * 100}%` }} />)
            : null}
        </div>
        {npsBands.map((b) => (
          <FilterButton key={b.band} pressed={params.nps === b.band} onClick={() => onFilter({ nps: params.nps === b.band ? '' : b.band })}>
            <span>{b.label}</span>
            <span className={`${mono} text-ink`}>{b.count}</span>
          </FilterButton>
        ))}
      </Tile>

      <Tile title="Lifecycle">
        <div className="max-h-36 overflow-y-auto">
          {summary.lifecycle.map((stage) => (
            <FilterButton
              key={stage.value}
              pressed={only(params.lifecycle, stage.value)}
              onClick={() => onFilter({ lifecycle: only(params.lifecycle, stage.value) ? [] : [stage.value] })}
            >
              <span className="w-20 truncate text-left">{stage.label}</span>
              <span aria-hidden="true" className="mx-1 h-1 flex-1 rounded-full bg-line">
                <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${(stage.count / stageMax) * 100}%` }} />
              </span>
              <span className={`${mono} text-ink`}>{stage.count}</span>
            </FilterButton>
          ))}
        </div>
      </Tile>

      <Tile title="Accounts · ARR">
        <p className={`${mono} text-[22px] leading-tight text-ink`}>{summary.accounts}</p>
        <p className={`${mono} mt-1 text-[13px] text-ink-muted`}>{formatCompactMoney(summary.arr, currency)} ARR</p>
        {summary.unconverted_count > 0 ? (
          <p className="mt-1 text-[11px] text-ink-muted">
            <span className={mono}>{summary.unconverted_count}</span> without an exchange rate, left out of ARR
          </p>
        ) : null}
      </Tile>

      <Tile
        title="Renewing"
        action={
          <Switch
            label="Renewal window"
            value={span}
            onChange={setSpan}
            options={[
              { value: '30', label: '30d' },
              { value: '90', label: '90d' },
            ]}
          />
        }
      >
        <button
          type="button"
          aria-pressed={params.renews_within === span}
          aria-label={`Renewing within ${span} days: ${renewing}`}
          onClick={() => onFilter({ renews_within: params.renews_within === span ? '' : span })}
          className={`-m-1 block w-full rounded-lg p-1 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS} ${
            params.renews_within === span ? 'bg-subtle' : ''
          }`}
        >
          <span className={`${mono} block text-[22px] leading-tight text-ink`}>{renewing}</span>
          <span className="block text-[11px] text-ink-muted">within {span} days, overdue included</span>
        </button>
      </Tile>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/organizations/portfolio/SummaryTiles.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (7 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/SummaryTiles.tsx src/components/organizations/portfolio/SummaryTiles.test.tsx
git commit -m "feat(organizations): five summary tiles that filter the portfolio on click

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: Toolbar, Filters panel and the Pin fields menu

**Files:**
- Create: `src/components/organizations/portfolio/FiltersPanel.tsx`
- Create: `src/components/organizations/portfolio/PinFieldsMenu.tsx`
- Create: `src/components/organizations/portfolio/PortfolioToolbar.tsx`
- Test: `src/components/organizations/portfolio/FiltersPanel.test.tsx`, `src/components/organizations/portfolio/PinFieldsMenu.test.tsx`, `src/components/organizations/portfolio/PortfolioToolbar.test.tsx`

**Interfaces:**
- Consumes: `PortfolioParams`, `toggleIn`, `HEALTH_BANDS` (Task 2); `SORT_OPTIONS`, `PANELS`, `PANEL_ORDER`, `PORTFOLIO_FIELDS` (Task 3); `MAX_PINS`; `trapTab` (`src/lib/focusTrap.ts`); `BAND_LABEL` (Task 4).
- Produces:
  - `GROUP_OPTIONS`, `<GroupSortControls params update />` (in `FiltersPanel.tsx`)
  - `<FiltersPanel params update options isSm onClose onExport exporting onAdd />`, which is `role="dialog"` named "Filters" (a popover from `sm`, a modal bottom sheet below)
  - `<PinFieldsMenu pins onToggle onClose />`, which is `role="dialog"` named "Pin fields"
  - `<PortfolioToolbar params update options isSm pins onTogglePin onExport exporting onAdd searchRef />`

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/portfolio/FiltersPanel.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersPanel } from './FiltersPanel';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

function renderPanel(search = '', isSm = true) {
  const props = {
    params: parseParams(new URLSearchParams(search)),
    update: vi.fn(),
    options: FILTER_OPTIONS,
    isSm,
    onClose: vi.fn(),
    onExport: vi.fn(),
    exporting: false,
    onAdd: vi.fn(),
  };
  render(<FiltersPanel {...props} />);
  return props;
}

describe('FiltersPanel', () => {
  it('filters by health, lifecycle and product with checkboxes', async () => {
    const { update } = renderPanel('health=average');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Poor' }));
    expect(update).toHaveBeenLastCalledWith({ health: ['average', 'poor'] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Average' }));
    expect(update).toHaveBeenLastCalledWith({ health: [] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Live' }));
    expect(update).toHaveBeenLastCalledWith({ lifecycle: ['live'] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hiring' }));
    expect(update).toHaveBeenLastCalledWith({ product: ['1'] });
  });

  it('filters by owner from the server options, Unassigned included once', async () => {
    const { update } = renderPanel();
    const owner = screen.getByRole('combobox', { name: 'Owner' });
    expect(screen.getAllByRole('option', { name: 'Unassigned' })).toHaveLength(1);
    await userEvent.selectOptions(owner, 'unassigned');
    expect(update).toHaveBeenLastCalledWith({ owner: 'unassigned' });
  });

  it('filters by renewal window, NPS band and churned', async () => {
    const { update } = renderPanel();
    await userEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(update).toHaveBeenLastCalledWith({ renews_within: '90' });
    await userEvent.click(screen.getByRole('radio', { name: 'Detractors' }));
    expect(update).toHaveBeenLastCalledWith({ nps: 'detractor' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include churned' }));
    expect(update).toHaveBeenLastCalledWith({ include_churned: true });
  });

  it('closes on Escape', async () => {
    const { onClose } = renderPanel();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('is a modal bottom sheet on phones, holding group, sort, export and add', async () => {
    const { update, onExport, onAdd } = renderPanel('', false);
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'owner');
    expect(update).toHaveBeenLastCalledWith({ group: 'owner' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name');
    expect(update).toHaveBeenLastCalledWith({ sort: '-name' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('keeps group and sort out of the desktop popover (the toolbar has them)', () => {
    renderPanel('', true);
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Filters' })).not.toHaveAttribute('aria-modal');
  });
});
```

`src/components/organizations/portfolio/PinFieldsMenu.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinFieldsMenu } from './PinFieldsMenu';

describe('PinFieldsMenu', () => {
  it('lists the 28 panel fields and toggles one', async () => {
    const onToggle = vi.fn();
    render(<PinFieldsMenu pins={[]} onToggle={onToggle} onClose={vi.fn()} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(28);
    await userEvent.click(screen.getByRole('checkbox', { name: 'NPS' }));
    expect(onToggle).toHaveBeenCalledWith('nps');
  });

  it('stops at three pins', () => {
    render(<PinFieldsMenu pins={['nps', 'tcv', 'domain']} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('3 of 3 pinned')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'CES' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'NPS' })).toBeEnabled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<PinFieldsMenu pins={[]} onToggle={vi.fn()} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
```

`src/components/organizations/portfolio/PortfolioToolbar.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioToolbar } from './PortfolioToolbar';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

function renderToolbar(search = '', isSm = true) {
  const props = {
    params: parseParams(new URLSearchParams(search)),
    update: vi.fn(),
    options: FILTER_OPTIONS,
    isSm,
    pins: [],
    onTogglePin: vi.fn(),
    onExport: vi.fn(),
    exporting: false,
    onAdd: vi.fn(),
    searchRef: createRef<HTMLInputElement>(),
  };
  render(<PortfolioToolbar {...props} />);
  return props;
}

describe('PortfolioToolbar', () => {
  it('debounces search into one update', async () => {
    const { update } = renderToolbar();
    const input = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    expect(input).toHaveAttribute('placeholder', 'Search by name or Revenact ID');
    await userEvent.type(input, 'pizza');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ search: 'pizza' }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('groups and sorts', async () => {
    const { update } = renderToolbar();
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(group).toHaveValue('health');
    await userEvent.selectOptions(group, 'none');
    expect(update).toHaveBeenLastCalledWith({ group: '' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'renewal');
    expect(update).toHaveBeenLastCalledWith({ sort: '-renewal' });
    await userEvent.click(screen.getByRole('button', { name: 'Descending' }));
    expect(update).toHaveBeenLastCalledWith({ sort: 'arr' });
  });

  it('counts active filters on the Filters button and opens the panel', async () => {
    renderToolbar('health=poor&owner=2');
    const button = screen.getByRole('button', { name: /^Filters/ });
    expect(button).toHaveTextContent('2');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  it('exports, adds and opens the pin menu', async () => {
    const { onExport, onAdd } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    expect(onAdd).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Pin fields' }));
    expect(screen.getByRole('dialog', { name: 'Pin fields' })).toBeInTheDocument();
  });

  it('collapses to Search and Filters on phones', () => {
    renderToolbar('', false);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
    for (const name of ['Export', 'Add organization', 'Pin fields']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/FiltersPanel.test.tsx src/components/organizations/portfolio/PinFieldsMenu.test.tsx src/components/organizations/portfolio/PortfolioToolbar.test.tsx`
Expected: FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write the Filters panel**

`src/components/organizations/portfolio/FiltersPanel.tsx`:
```tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, Plus, X } from 'lucide-react';
import { trapTab } from '../../../lib/focusTrap';
import { SORT_OPTIONS } from '../../../features/organizations/portfolioFields';
import { HEALTH_BANDS, toggleIn, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { GroupKey, LifecycleValue, NpsBand, PortfolioResponse } from '../../../features/organizations/portfolioTypes';
import { BAND_LABEL } from './rowParts';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const SELECT = `min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink hover:border-line-strong disabled:opacity-50 ${FOCUS}`;

export const GROUP_OPTIONS: { value: GroupKey | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'health', label: 'Health' },
  { value: 'owner', label: 'Owner' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'product', label: 'Product' },
  { value: 'renewal', label: 'Renewal window' },
];

/** Group and sort: in the toolbar from `sm`, inside the Filters sheet below. */
export function GroupSortControls({
  params,
  update,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
}) {
  const descending = params.sort.startsWith('-');
  const field = params.sort.replace(/^-/, '');
  const groupId = useId();
  const sortId = useId();
  // Labels point at their selects by id rather than wrapping them, so each
  // select's accessible name is the label alone.
  return (
    <>
      <span className="flex items-center gap-1.5">
        <label htmlFor={groupId} className="text-[13px] text-ink-muted">
          Group
        </label>
        <select
          id={groupId}
          className={SELECT}
          value={params.group || 'none'}
          onChange={(event) => update({ group: event.target.value === 'none' ? '' : (event.target.value as GroupKey) })}
        >
          {GROUP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
      <span className="flex items-center gap-1.5">
        <label htmlFor={sortId} className="text-[13px] text-ink-muted">
          Sort by
        </label>
        <select
          id={sortId}
          className={SELECT}
          value={field}
          onChange={(event) => update({ sort: `${descending ? '-' : ''}${event.target.value}` })}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={descending}
          aria-label={descending ? 'Descending' : 'Ascending'}
          title={descending ? 'High to low' : 'Low to high'}
          onClick={() => update({ sort: descending ? field : `-${field}` })}
          className={`inline-flex w-11 h-11 sm:w-9 sm:h-9 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
        >
          {descending ? <ArrowDown className="w-4 h-4" aria-hidden="true" /> : <ArrowUp className="w-4 h-4" aria-hidden="true" />}
        </button>
      </span>
    </>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className={`w-4 h-4 accent-accent ${FOCUS}`} />
      {label}
    </label>
  );
}

function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] text-ink">
      <input type="radio" name={name} checked={checked} onChange={onChange} className={`w-4 h-4 accent-accent ${FOCUS}`} />
      {label}
    </label>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}

const WINDOWS: { value: PortfolioParams['renews_within']; label: string }[] = [
  { value: '', label: 'Any time' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
];
const NPS: { value: '' | NpsBand; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'promoter', label: 'Promoters' },
  { value: 'passive', label: 'Passives' },
  { value: 'detractor', label: 'Detractors' },
];

/** Every filter from spec §1. Changes apply at once (they write the URL).
 *  From `sm` it is a popover under the toolbar. Below `sm` it is a modal
 *  bottom sheet that also holds group, sort, Export and Add, because the
 *  phone toolbar is only Search and Filters. */
export function FiltersPanel({
  params,
  update,
  options,
  isSm,
  onClose,
  onExport,
  exporting,
  onAdd,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  options: PortfolioResponse['filters'] | null;
  isSm: boolean;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ownerId = useId();

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, select, input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (!isSm && event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSm, onClose]);

  const body = (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Filters</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className={`inline-flex w-11 h-11 sm:w-8 sm:h-8 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle ${FOCUS}`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </header>

      {!isSm ? (
        <div className="flex flex-wrap items-center gap-3">
          <GroupSortControls params={params} update={update} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={ownerId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Owner
        </label>
        {/* The server's options already include Unassigned. */}
        <select id={ownerId} className={SELECT} value={params.owner} onChange={(event) => update({ owner: event.target.value })}>
          <option value="">Everyone</option>
          {(options?.owners ?? []).map((owner) => (
            <option key={owner.value} value={owner.value}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>

      <Group legend="Health">
        {HEALTH_BANDS.map((band) => (
          <Check key={band} label={BAND_LABEL[band]} checked={params.health.includes(band)} onChange={() => update({ health: toggleIn(params.health, band) })} />
        ))}
      </Group>

      <Group legend="Lifecycle">
        {(options?.lifecycles ?? []).map((stage) => (
          <Check
            key={stage.value}
            label={stage.name}
            checked={params.lifecycle.includes(stage.value as LifecycleValue)}
            onChange={() => update({ lifecycle: toggleIn(params.lifecycle, stage.value as LifecycleValue) })}
          />
        ))}
      </Group>

      <Group legend="Product">
        {options?.products.length ? (
          options.products.map((product) => (
            <Check key={product.value} label={product.name} checked={params.product.includes(product.value)} onChange={() => update({ product: toggleIn(params.product, product.value) })} />
          ))
        ) : (
          <p className="text-[13px] text-ink-muted">No products in the catalogue yet.</p>
        )}
      </Group>

      <Group legend="Renews within">
        {WINDOWS.map((w) => (
          <Radio key={w.label} name="renews_within" label={w.label} checked={params.renews_within === w.value} onChange={() => update({ renews_within: w.value })} />
        ))}
      </Group>

      <Group legend="NPS">
        {NPS.map((n) => (
          <Radio key={n.label} name="nps" label={n.label} checked={params.nps === n.value} onChange={() => update({ nps: n.value })} />
        ))}
      </Group>

      <Group legend="Churned">
        <Check label="Include churned" checked={params.include_churned} onChange={() => update({ include_churned: !params.include_churned })} />
      </Group>

      {!isSm ? (
        <div className="flex flex-col gap-2 border-t border-line-subtle pt-4">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line text-[13px] font-semibold text-ink hover:bg-subtle disabled:opacity-50 ${FOCUS}`}
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-hover ${FOCUS}`}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add organization
          </button>
        </div>
      ) : null}
    </div>
  );

  if (isSm) {
    return (
      <div ref={ref} role="dialog" aria-label="Filters" className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[22rem] overflow-y-auto rounded-xl border border-line bg-elevated p-4 shadow-md">
        {body}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Filters" className="relative max-h-[85dvh] overflow-y-auto rounded-t-xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the Pin fields menu**

`src/components/organizations/portfolio/PinFieldsMenu.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import type { ColumnId } from '../tableData';
import { MAX_PINS } from '../../../features/organizations/pinnedFields';
import { PANELS, PANEL_ORDER, PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';

/** Replaces the old "Edit columns" popover: pick up to three fields to show
 *  as chips on every row (spec §1 "Pin a field"). */
export function PinFieldsMenu({
  pins,
  onToggle,
  onClose,
}: {
  pins: ColumnId[];
  onToggle: (id: ColumnId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const full = pins.length >= MAX_PINS;
  return (
    <div ref={ref} role="dialog" aria-label="Pin fields" className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[20rem] overflow-y-auto rounded-xl border border-line bg-elevated p-4 shadow-md">
      <h2 className="text-[15px] font-semibold text-ink">Pin fields</h2>
      <p className="mt-1 text-[11px] text-ink-muted">Up to {MAX_PINS} fields show on every row.</p>
      <p className="font-mono-brand tabular-nums text-[11px] text-ink-muted">{`${pins.length} of ${MAX_PINS} pinned`}</p>
      <div className="mt-3 flex flex-col gap-3">
        {PANELS.map((panel) => (
          <fieldset key={panel.key}>
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{panel.title}</legend>
            {PANEL_ORDER[panel.key].map((id) => {
              const checked = pins.includes(id);
              return (
                <label key={id} className={`flex min-h-8 items-center gap-2 text-[13px] ${!checked && full ? 'text-ink-faint' : 'text-ink'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() => onToggle(id)}
                    className="w-4 h-4 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                  />
                  {PORTFOLIO_FIELDS[id].label}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the toolbar**

`src/components/organizations/portfolio/PortfolioToolbar.tsx`:
```tsx
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { Download, Pin, Plus, Search, SlidersHorizontal } from 'lucide-react';
import type { ColumnId } from '../tableData';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';
import { FiltersPanel, GroupSortControls } from './FiltersPanel';
import { PinFieldsMenu } from './PinFieldsMenu';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const QUIET = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:opacity-50 ${FOCUS}`;
const LABEL = 'Search by name or Revenact ID';

function activeFilters(p: PortfolioParams): number {
  return (
    [p.owner !== '', p.renews_within !== '', p.nps !== '', p.include_churned, p.ids.length > 0].filter(Boolean).length +
    p.lifecycle.length +
    p.health.length +
    p.product.length
  );
}

export function PortfolioToolbar({
  params,
  update,
  options,
  isSm,
  pins,
  onTogglePin,
  onExport,
  exporting,
  onAdd,
  searchRef,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  options: PortfolioResponse['filters'] | null;
  isSm: boolean;
  pins: ColumnId[];
  onTogglePin: (id: ColumnId) => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  // The box shows what is typed; the URL gets it 300ms after typing stops.
  // A chip or "Clear all" changing the URL resets the box (adjusted during
  // render, not in an effect).
  const [text, setText] = useState(params.search);
  const [synced, setSynced] = useState(params.search);
  if (params.search !== synced) {
    setSynced(params.search);
    setText(params.search);
  }
  useEffect(() => {
    if (text.trim() === params.search) return;
    const timeout = window.setTimeout(() => update({ search: text.trim() }), 300);
    return () => window.clearTimeout(timeout);
  }, [text, params.search, update]);

  const [open, setOpen] = useState<'filters' | 'pins' | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const count = activeFilters(params);

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 sm:max-w-sm">
        <span className="sr-only">{LABEL}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={LABEL}
          className={`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong ${FOCUS}`}
        />
      </label>

      {isSm ? <GroupSortControls params={params} update={update} /> : null}

      <button
        type="button"
        aria-expanded={open === 'filters'}
        aria-haspopup="dialog"
        onClick={() => setOpen(open === 'filters' ? null : 'filters')}
        className={QUIET}
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        Filters
        {count > 0 ? (
          <span className="rounded-full bg-accent px-1.5 font-mono-brand tabular-nums text-[11px] text-on-accent">{count}</span>
        ) : null}
      </button>

      {isSm ? (
        <>
          <button type="button" aria-expanded={open === 'pins'} aria-haspopup="dialog" onClick={() => setOpen(open === 'pins' ? null : 'pins')} className={QUIET}>
            <Pin className="w-4 h-4" aria-hidden="true" />
            Pin fields
          </button>
          <button type="button" onClick={onExport} disabled={exporting} className={QUIET}>
            <Download className="w-4 h-4" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover active:opacity-90 ${FOCUS}`}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add organization
          </button>
        </>
      ) : null}

      {open === 'filters' ? (
        <FiltersPanel
          params={params}
          update={update}
          options={options}
          isSm={isSm}
          onClose={close}
          onExport={() => {
            close();
            onExport();
          }}
          exporting={exporting}
          onAdd={() => {
            close();
            onAdd();
          }}
        />
      ) : null}
      {open === 'pins' ? <PinFieldsMenu pins={pins} onToggle={onTogglePin} onClose={close} /> : null}
    </div>
  );
}
```

`FiltersPanel` renders Export and Add only in its phone sheet (`!isSm`), because from `sm` the toolbar already carries them.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/components/organizations/portfolio/FiltersPanel.test.tsx src/components/organizations/portfolio/PinFieldsMenu.test.tsx src/components/organizations/portfolio/PortfolioToolbar.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (6 + 3 + 5 + 4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/organizations/portfolio/FiltersPanel.tsx src/components/organizations/portfolio/FiltersPanel.test.tsx src/components/organizations/portfolio/PinFieldsMenu.tsx src/components/organizations/portfolio/PinFieldsMenu.test.tsx src/components/organizations/portfolio/PortfolioToolbar.tsx src/components/organizations/portfolio/PortfolioToolbar.test.tsx
git commit -m "feat(organizations): portfolio toolbar with real filters, group, sort, pins and export

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: Filter chips and the "N of M organizations" count

**Files:**
- Create: `src/features/organizations/filterChips.ts`
- Create: `src/components/organizations/portfolio/FilterChips.tsx`
- Test: `src/features/organizations/filterChips.test.ts`, `src/components/organizations/portfolio/FilterChips.test.tsx`

**Interfaces:**
- Consumes: `PortfolioParams` (Task 2), `LIFECYCLE_LABELS` (`src/features/customers/formatters.ts`), `Option`.
- Produces:
  - `Chip = { key: string; label: string; patch: Partial<PortfolioParams> }`
  - `filterChips(p: PortfolioParams, options: PortfolioResponse['filters'] | null): Chip[]`
  - `countText(count: number | null, total: number | null, filtered: boolean): string`
  - `<FilterChips params options count total onChange(patch) onClearAll />`. Each chip is a button named `Remove <label>`, plus a "Clear all" button.

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/filterChips.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { countText, filterChips } from './filterChips';
import { parseParams } from './portfolioParams';
import { FILTER_OPTIONS } from './testPortfolio';

describe('filterChips', () => {
  it('names every active filter, dashboard ids first', () => {
    const params = parseParams(
      new URLSearchParams('ids=7,2&search=piz&owner=2&lifecycle=live&health=poor&product=1&renews_within=90&nps=detractor&include_churned=1'),
    );
    expect(filterChips(params, FILTER_OPTIONS).map((c) => c.label)).toEqual([
      'Opened from the dashboard (2)',
      'Search: piz',
      'Owner: Carl CSM',
      'Lifecycle: Live',
      'Health: Poor',
      'Product: Hiring',
      'Renews within 90 days',
      'NPS: Detractors',
      'Includes churned',
    ]);
  });

  it('removes one value from a multi filter', () => {
    const params = parseParams(new URLSearchParams('health=poor,average'));
    const poor = filterChips(params, FILTER_OPTIONS).find((c) => c.label === 'Health: Poor')!;
    expect(poor.patch).toEqual({ health: ['average'] });
  });

  it('falls back to known labels before the options load', () => {
    const params = parseParams(new URLSearchParams('owner=unassigned&lifecycle=renewal'));
    expect(filterChips(params, null).map((c) => c.label)).toEqual(['Owner: Unassigned', 'Lifecycle: Renewal']);
  });

  it('writes the count', () => {
    expect(countText(3, 12, true)).toBe('3 of 12 organizations');
    expect(countText(1, null, false)).toBe('1 organization');
    expect(countText(12, null, false)).toBe('12 organizations');
    expect(countText(null, null, true)).toBe('Loading organizations…');
  });
});
```

`src/components/organizations/portfolio/FilterChips.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips } from './FilterChips';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

describe('FilterChips', () => {
  it('removes a chip, clears all, and says N of M', async () => {
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(
      <FilterChips
        params={parseParams(new URLSearchParams('owner=2&ids=7'))}
        options={FILTER_OPTIONS}
        count={1}
        total={2}
        onChange={onChange}
        onClearAll={onClearAll}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 organizations');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Opened from the dashboard (1)' }));
    expect(onChange).toHaveBeenCalledWith({ ids: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('shows only the count with no filters', () => {
    render(<FilterChips params={parseParams(new URLSearchParams())} options={null} count={2} total={null} onChange={vi.fn()} onClearAll={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('2 organizations');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/organizations/filterChips.test.ts src/components/organizations/portfolio/FilterChips.test.tsx`
Expected: FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write the builder and the component**

`src/features/organizations/filterChips.ts`:
```ts
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { PortfolioParams } from './portfolioParams';
import type { HealthBand, NpsBand, Option, PortfolioResponse } from './portfolioTypes';

export interface Chip {
  key: string;
  label: string;
  /** What removing this chip writes to the URL. */
  patch: Partial<PortfolioParams>;
}

const HEALTH: Record<HealthBand, string> = { good: 'Good', average: 'Average', poor: 'Poor' };
const NPS: Record<NpsBand, string> = { promoter: 'Promoters', passive: 'Passives', detractor: 'Detractors' };

const nameIn = (list: Option[] | undefined, value: string) => list?.find((o) => o.value === value)?.name;

/** One removable chip per active filter (spec §1), in a fixed order. */
export function filterChips(p: PortfolioParams, options: PortfolioResponse['filters'] | null): Chip[] {
  const chips: Chip[] = [];
  if (p.ids.length) chips.push({ key: 'ids', label: `Opened from the dashboard (${p.ids.length})`, patch: { ids: [] } });
  if (p.search) chips.push({ key: 'search', label: `Search: ${p.search}`, patch: { search: '' } });
  if (p.owner) {
    const name = p.owner === 'unassigned' ? 'Unassigned' : (nameIn(options?.owners, p.owner) ?? `User ${p.owner}`);
    chips.push({ key: 'owner', label: `Owner: ${name}`, patch: { owner: '' } });
  }
  for (const stage of p.lifecycle) {
    const name = nameIn(options?.lifecycles, stage) ?? LIFECYCLE_LABELS[stage];
    chips.push({ key: `lifecycle:${stage}`, label: `Lifecycle: ${name}`, patch: { lifecycle: p.lifecycle.filter((s) => s !== stage) } });
  }
  for (const band of p.health) {
    chips.push({ key: `health:${band}`, label: `Health: ${HEALTH[band]}`, patch: { health: p.health.filter((b) => b !== band) } });
  }
  for (const product of p.product) {
    const name = nameIn(options?.products, product) ?? `Product ${product}`;
    chips.push({ key: `product:${product}`, label: `Product: ${name}`, patch: { product: p.product.filter((v) => v !== product) } });
  }
  if (p.renews_within) chips.push({ key: 'renews', label: `Renews within ${p.renews_within} days`, patch: { renews_within: '' } });
  if (p.nps) chips.push({ key: 'nps', label: `NPS: ${NPS[p.nps]}`, patch: { nps: '' } });
  if (p.include_churned) chips.push({ key: 'churned', label: 'Includes churned', patch: { include_churned: false } });
  return chips;
}

export function countText(count: number | null, total: number | null, filtered: boolean): string {
  if (count == null) return 'Loading organizations…';
  if (filtered && total != null) return `${count} of ${total} organizations`;
  return `${count} organization${count === 1 ? '' : 's'}`;
}
```

`src/components/organizations/portfolio/FilterChips.tsx`:
```tsx
import { X } from 'lucide-react';
import { countText, filterChips } from '../../../features/organizations/filterChips';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export function FilterChips({
  params,
  options,
  count,
  total,
  onChange,
  onClearAll,
}: {
  params: PortfolioParams;
  options: PortfolioResponse['filters'] | null;
  count: number | null;
  total: number | null;
  onChange: (patch: Partial<PortfolioParams>) => void;
  onClearAll: () => void;
}) {
  const chips = filterChips(params, options);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.patch)}
          aria-label={`Remove ${chip.label}`}
          className={`inline-flex min-h-11 sm:min-h-8 items-center gap-1 rounded-full bg-subtle px-3 text-[13px] text-ink hover:bg-line-subtle active:bg-line ${FOCUS}`}
        >
          {chip.label}
          <X className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 0 ? (
        <button
          type="button"
          onClick={onClearAll}
          className={`min-h-11 sm:min-h-8 rounded-lg px-2 text-[13px] font-semibold text-ink underline-offset-2 hover:underline ${FOCUS}`}
        >
          Clear all
        </button>
      ) : null}
      <p role="status" aria-live="polite" className="ml-auto font-mono-brand tabular-nums text-[13px] text-ink-muted">
        {countText(count, total, chips.length > 0)}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/features/organizations/filterChips.test.ts src/components/organizations/portfolio/FilterChips.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/filterChips.ts src/features/organizations/filterChips.test.ts src/components/organizations/portfolio/FilterChips.tsx src/components/organizations/portfolio/FilterChips.test.tsx
git commit -m "feat(organizations): removable filter chips with an N of M count

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `SelectionBar`

**Files:**
- Create: `src/components/organizations/portfolio/SelectionBar.tsx`
- Test: `src/components/organizations/portfolio/SelectionBar.test.tsx`

**Interfaces:**
- Consumes: `Option` (Task 1).
- Produces:
  - `BulkReport = { updated: number; failed: { id: number; name: string; reason: string }[]; error?: string }`
  - `<SelectionBar count owners lifecycles busy report onSetOwner(id: number | null) onSetLifecycle(stage: string) onExport onArchive onChurn onClose />`. It renders nothing when `count === 0 && !report`. **Churn shows only when `count === 1`** (pre-flight 23).

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/SelectionBar.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionBar, type BulkReport } from './SelectionBar';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

function renderBar(count: number, report: BulkReport | null = null, busy = false) {
  const props = {
    count,
    owners: FILTER_OPTIONS.owners,
    lifecycles: FILTER_OPTIONS.lifecycles,
    busy,
    report,
    onSetOwner: vi.fn(),
    onSetLifecycle: vi.fn(),
    onExport: vi.fn(),
    onArchive: vi.fn(),
    onChurn: vi.fn(),
    onClose: vi.fn(),
  };
  const view = render(<SelectionBar {...props} />);
  return { ...props, ...view };
}

describe('SelectionBar', () => {
  it('renders nothing with no selection and no report', () => {
    const { container } = renderBar(0);
    expect(container).toBeEmptyDOMElement();
  });

  it('changes owner (Unassigned sends null) and lifecycle (never churn)', async () => {
    const { onSetOwner, onSetLifecycle } = renderBar(2);
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('2 selected');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), '3');
    expect(onSetOwner).toHaveBeenLastCalledWith(3);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), 'unassigned');
    expect(onSetOwner).toHaveBeenLastCalledWith(null);
    const stage = screen.getByRole('combobox', { name: 'Set lifecycle' });
    expect(within(stage).queryByRole('option', { name: 'Churn' })).not.toBeInTheDocument();
    await userEvent.selectOptions(stage, 'live');
    expect(onSetLifecycle).toHaveBeenCalledWith('live');
  });

  it('exports and archives; churn only for one account', async () => {
    const two = renderBar(2);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(two.onExport).toHaveBeenCalled();
    expect(two.onArchive).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
    two.unmount();

    const one = renderBar(1);
    await userEvent.click(screen.getByRole('button', { name: 'Churn' }));
    expect(one.onChurn).toHaveBeenCalled();
  });

  it('reports partial failures per account', () => {
    renderBar(1, { updated: 1, failed: [{ id: 1, name: 'Globex', reason: 'Not found.' }] });
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(bar).toHaveTextContent('Updated 1 organization. 1 failed:');
    expect(bar).toHaveTextContent('Globex: Not found.');
  });

  it('keeps the report after the selection empties, with a Dismiss', async () => {
    const { onClose } = renderBar(0, { updated: 2, failed: [] });
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('Updated 2 organizations.');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables actions while applying', () => {
    renderBar(2, null, true);
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Change owner' })).toBeDisabled();
    expect(screen.getByText('Applying…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/organizations/portfolio/SelectionBar.test.tsx`
Expected: FAIL with `Failed to resolve import "./SelectionBar"`.

- [ ] **Step 3: Write the bar**

`src/components/organizations/portfolio/SelectionBar.tsx`:
```tsx
import { Archive, Download, UserX, X } from 'lucide-react';
import type { Option } from '../../../features/organizations/portfolioTypes';

export interface BulkReport {
  updated: number;
  failed: { id: number; name: string; reason: string }[];
  /** The request itself failed; nothing was applied. */
  error?: string;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const CONTROL = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:opacity-50 ${FOCUS}`;

/** Selection mode's action bar (spec §1). It sticks to the bottom of the
 *  content column. Churn is offered for one account at a time: the backend
 *  refuses churn in bulk, and each churn records its own date and reason
 *  in the existing modal. */
export function SelectionBar({
  count,
  owners,
  lifecycles,
  busy,
  report,
  onSetOwner,
  onSetLifecycle,
  onExport,
  onArchive,
  onChurn,
  onClose,
}: {
  count: number;
  owners: Option[];
  lifecycles: Option[];
  busy: boolean;
  report: BulkReport | null;
  onSetOwner: (userId: number | null) => void;
  onSetLifecycle: (stage: string) => void;
  onExport: () => void;
  onArchive: () => void;
  onChurn: () => void;
  onClose: () => void;
}) {
  if (count === 0 && !report) return null;
  return (
    <div role="region" aria-label="Selection" className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-xl border border-line bg-elevated px-3 py-2 shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        {count > 0 ? (
          <>
            <p className="text-[13px] font-semibold text-ink">
              <span className="font-mono-brand tabular-nums">{count}</span> selected
            </p>
            <select
              aria-label="Change owner"
              value=""
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;
                if (value) onSetOwner(value === 'unassigned' ? null : Number(value));
              }}
              className={CONTROL}
            >
              <option value="">Change owner</option>
              {owners.map((owner) => (
                <option key={owner.value} value={owner.value}>
                  {owner.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Set lifecycle"
              value=""
              disabled={busy}
              onChange={(event) => {
                if (event.target.value) onSetLifecycle(event.target.value);
              }}
              className={CONTROL}
            >
              <option value="">Set lifecycle</option>
              {lifecycles
                .filter((stage) => stage.value !== 'churn')
                .map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.name}
                  </option>
                ))}
            </select>
            <button type="button" onClick={onExport} disabled={busy} className={CONTROL}>
              <Download className="w-4 h-4" aria-hidden="true" />
              Export
            </button>
            <button type="button" onClick={onArchive} disabled={busy} className={CONTROL}>
              <Archive className="w-4 h-4" aria-hidden="true" />
              Archive
            </button>
            {count === 1 ? (
              <button type="button" onClick={onChurn} disabled={busy} className={`${CONTROL} text-danger`}>
                <UserX className="w-4 h-4" aria-hidden="true" />
                Churn
              </button>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={count > 0 ? 'Clear selection' : 'Dismiss'}
          className={`ml-auto inline-flex w-11 h-11 sm:w-9 sm:h-9 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle ${FOCUS}`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {busy ? <p className="text-[11px] text-ink-muted">Applying…</p> : null}
      {report ? (
        <div role="status" className="text-[13px]">
          {report.error ? (
            <p className="text-danger">{report.error}</p>
          ) : (
            <p className="text-ink">
              {`Updated ${report.updated} organization${report.updated === 1 ? '' : 's'}.`}
              {report.failed.length ? ` ${report.failed.length} failed:` : ''}
            </p>
          )}
          {report.failed.length ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {report.failed.map((failure) => (
                <li key={failure.id} className="text-[11px] text-danger">
                  <span className="font-semibold">{failure.name}</span>: {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/organizations/portfolio/SelectionBar.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (6 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/SelectionBar.tsx src/components/organizations/portfolio/SelectionBar.test.tsx
git commit -m "feat(organizations): selection bar with bulk owner, lifecycle, export, archive and per-account results

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Grouped sections, the phone bottom sheet, and loading, empty and error states

**Files:**
- Create: `src/components/organizations/portfolio/PortfolioSections.tsx`
- Create: `src/components/organizations/portfolio/AccountSheet.tsx`
- Test: `src/components/organizations/portfolio/PortfolioSections.test.tsx`, `src/components/organizations/portfolio/AccountSheet.test.tsx`

**Interfaces:**
- Consumes: `usePagedPortfolio`, `PortfolioState`, `SECTION_PAGE_SIZE` (Task 8); `toApiQuery` (Task 2); `ErrorState` (`src/pages/dashboard/shared/DataState.tsx`); `AccountDetails` (Task 6); Task 4 parts; `trapTab`.
- Produces:
  - `sectionStartsOpen(index: number, total: number): boolean`
  - `<RowSkeleton count />`
  - `<PortfolioSections params version portfolio currency filtered renderRow onRowsLoaded onClearFilters onAdd />`
  - `<AccountSheet row currency onClose onEdit? />`, which is `role="dialog"` named by the account and returns focus to its opener on close.

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/portfolio/PortfolioSections.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioSections, sectionStartsOpen } from './PortfolioSections';
import { usePortfolio } from './usePortfolio';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio, portfolioQueries, stubPortfolio } from '../../../features/organizations/testPortfolio';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';

function Harness({ search = '', onClearFilters = vi.fn(), onAdd = vi.fn() }: { search?: string; onClearFilters?: () => void; onAdd?: () => void }) {
  const params = parseParams(new URLSearchParams(search));
  const portfolio = usePortfolio(params, 0);
  return (
    <PortfolioSections
      params={params}
      version={0}
      portfolio={portfolio}
      currency="USD"
      filtered={search !== '' && !search.startsWith('group')}
      renderRow={(row: PortfolioRow) => <li key={row.id}>{row.name}</li>}
      onRowsLoaded={() => {}}
      onClearFilters={onClearFilters}
      onAdd={onAdd}
    />
  );
}

describe('PortfolioSections', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows row-shaped skeletons first', () => {
    stubPortfolio();
    render(<Harness />);
    expect(screen.getByRole('status', { name: 'Loading organizations' })).toBeInTheDocument();
  });

  it('groups by health in the server order, each section reading its own rows', async () => {
    const spy = stubPortfolio();
    render(<Harness search="include_churned=1" />);
    const poor = await screen.findByRole('button', { name: /^Poor · 1 · \$30K/ });
    expect(poor).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(await screen.findByText('Pizza Hut')).toBeInTheDocument();
    const sectionQueries = portfolioQueries(spy).filter((q) => q.has('group_value'));
    expect(sectionQueries.map((q) => q.get('group_value')).sort()).toEqual(['average', 'good', 'poor']);
    expect(sectionQueries.every((q) => q.get('limit') === '25')).toBe(true);

    await userEvent.click(poor);
    expect(poor).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Initech')).not.toBeInTheDocument();
  });

  it('opens every section when there are four or fewer, else only the first', () => {
    expect(sectionStartsOpen(3, 4)).toBe(true);
    expect(sectionStartsOpen(0, 5)).toBe(true);
    expect(sectionStartsOpen(1, 5)).toBe(false);
  });

  it('lists ungrouped rows with Show more', async () => {
    stubPortfolio({
      portfolio: (q) => {
        const two = new URLSearchParams(q);
        two.set('limit', '2');
        return buildPortfolio(two);
      },
    });
    render(<Harness search="group=none&include_churned=1" />);
    expect(await screen.findByText('Globex')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show more organizations' }));
    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more organizations' })).not.toBeInTheDocument();
  });

  it('designs the empty states', async () => {
    stubPortfolio();
    const onClearFilters = vi.fn();
    const { unmount } = render(<Harness search="search=zzz" onClearFilters={onClearFilters} />);
    expect(await screen.findByText('No organizations match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalled();
    unmount();

    stubPortfolio({ portfolio: (q) => buildPortfolio(q, []) });
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    expect(await screen.findByText('No organizations yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('shows an error with Try again', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Boom' } } : buildPortfolio(q)) });
    render(<Harness />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('Pizza Hut')).toBeInTheDocument();
  });
});
```

`src/components/organizations/portfolio/AccountSheet.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountSheet } from './AccountSheet';
import { pizzaHut } from '../../../features/organizations/testPortfolio';

describe('AccountSheet', () => {
  it('opens as a modal sheet with the header signals and the panels', () => {
    render(
      <MemoryRouter>
        <AccountSheet row={pizzaHut} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} />
      </MemoryRouter>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Pizza Hut' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(sheet).toHaveTextContent('AI 1 · CSM 3');
    expect(sheet).toHaveTextContent('47d overdue');
    expect(within(sheet).getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open organization page' })).toHaveAttribute('href', '/organizations/7');
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn();
    function Page({ open }: { open: boolean }) {
      return (
        <MemoryRouter>
          <button type="button">Open Pizza Hut</button>
          {open ? <AccountSheet row={pizzaHut} currency="USD" onClose={onClose} /> : null}
        </MemoryRouter>
      );
    }
    const { rerender } = render(<Page open={false} />);
    screen.getByRole('button', { name: 'Open Pizza Hut' }).focus();
    rerender(<Page open />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    rerender(<Page open={false} />);
    expect(screen.getByRole('button', { name: 'Open Pizza Hut' })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioSections.test.tsx src/components/organizations/portfolio/AccountSheet.test.tsx`
Expected: FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write the sections**

`src/components/organizations/portfolio/PortfolioSections.tsx`:
```tsx
import { useId, useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioGroup, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { ErrorState } from '../../../pages/dashboard/shared/DataState';
import { SECTION_PAGE_SIZE, usePagedPortfolio, type PortfolioState } from './usePortfolio';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const QUIET = `inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:opacity-50 ${FOCUS}`;

export function sectionStartsOpen(index: number, total: number): boolean {
  return total <= 4 || index === 0;
}

export function RowSkeleton({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Loading organizations">
      <ul aria-hidden="true" className="flex flex-col gap-1.5">
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
            <span className="h-10 w-10 animate-pulse rounded-full bg-subtle" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="block h-3 w-40 animate-pulse rounded bg-subtle" />
              <span className="block h-2.5 w-28 animate-pulse rounded bg-subtle" />
            </span>
            <span className="hidden h-3 w-16 animate-pulse rounded bg-subtle sm:block" />
            <span className="hidden h-3 w-20 animate-pulse rounded bg-subtle sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-surface">
      <ErrorState message={message} detail="Nothing is shown rather than a partial list." />
      <div className="flex justify-center pb-6">
        <button type="button" onClick={onRetry} className={`${QUIET} border border-line`}>
          Try again
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-surface px-4 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="text-[13px] text-ink-muted">{detail}</p>
      {action}
    </div>
  );
}

function MoreButton({
  next,
  loading,
  error,
  label,
  onClick,
}: {
  next: string | null;
  loading: boolean;
  error: string | null;
  label: string;
  onClick: () => void;
}) {
  if (!next) return null;
  return (
    <div className="mt-1.5 flex flex-col items-center gap-1">
      <button type="button" onClick={onClick} disabled={loading} className={`${QUIET} w-full`}>
        {loading ? 'Loading…' : label}
      </button>
      {error ? <p role="alert" className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}

function Section({
  group,
  params,
  version,
  currency,
  defaultOpen,
  renderRow,
  onRowsLoaded,
}: {
  group: PortfolioGroup;
  params: PortfolioParams;
  version: number;
  currency: CurrencyCode;
  defaultOpen: boolean;
  renderRow: (row: PortfolioRow) => ReactNode;
  onRowsLoaded: (rows: PortfolioRow[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const page = usePagedPortfolio(
    toApiQuery(params, { group_value: group.key, limit: String(SECTION_PAGE_SIZE) }),
    open,
    version,
    onRowsLoaded,
  );
  return (
    <section>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
          className={`flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-lg px-1 text-left text-[13px] font-semibold text-ink hover:bg-subtle ${FOCUS}`}
        >
          <ChevronRight
            className={`w-4 h-4 text-ink-muted transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          {group.label}
          <span className="font-normal text-ink-muted">
            {' · '}
            <span className="font-mono-brand tabular-nums">{group.count}</span>
            {' · '}
            <span className="font-mono-brand tabular-nums">{formatCompactMoney(group.arr, currency)}</span>
          </span>
        </button>
      </h2>
      {open ? (
        <div id={bodyId} className="mt-1.5">
          {page.error && page.rows.length === 0 ? (
            <p role="alert" className="flex items-center gap-2 px-1 text-[13px] text-danger">
              {page.error}
              <button type="button" onClick={page.retry} className={QUIET}>
                Try again
              </button>
            </p>
          ) : page.loading && page.rows.length === 0 ? (
            <RowSkeleton count={Math.min(3, group.count)} />
          ) : (
            <ul className="flex flex-col gap-1.5" aria-busy={page.loading}>
              {page.rows.map(renderRow)}
            </ul>
          )}
          <MoreButton
            next={page.next}
            loading={page.loadingMore}
            error={page.moreError}
            label={`Show more ${group.label}`}
            onClick={() => void page.loadMore()}
          />
        </div>
      ) : null}
    </section>
  );
}

/** The list body: grouped sections (each with its own pages) or one flat
 *  list, plus the loading, empty and error states spec §1 asks for. */
export function PortfolioSections({
  params,
  version,
  portfolio,
  currency,
  filtered,
  renderRow,
  onRowsLoaded,
  onClearFilters,
  onAdd,
}: {
  params: PortfolioParams;
  version: number;
  portfolio: PortfolioState;
  currency: CurrencyCode;
  filtered: boolean;
  renderRow: (row: PortfolioRow) => ReactNode;
  onRowsLoaded: (rows: PortfolioRow[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  const { data, error } = portfolio;
  if (!data && error) return <ErrorBlock message={error} onRetry={portfolio.retry} />;
  if (!data) return <RowSkeleton count={6} />;

  if (data.count === 0) {
    return filtered ? (
      <EmptyState
        title="No organizations match these filters"
        detail="Remove a filter, or clear them all."
        action={
          <button type="button" onClick={onClearFilters} className={`${QUIET} border border-line`}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState
        title="No organizations yet"
        detail="Add an organization to start your portfolio."
        action={
          <button type="button" onClick={onAdd} className={`${QUIET} bg-accent text-on-accent hover:bg-accent-hover`}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add organization
          </button>
        }
      />
    );
  }

  const staleError = error ? (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
      {error}. Showing the last result.
      <button type="button" onClick={portfolio.retry} className={QUIET}>
        Try again
      </button>
    </p>
  ) : null;

  if (params.group === '') {
    return (
      <div aria-busy={portfolio.loading}>
        {staleError}
        <ul className="flex flex-col gap-1.5">{portfolio.rows.map(renderRow)}</ul>
        <MoreButton
          next={portfolio.next}
          loading={portfolio.loadingMore}
          error={portfolio.moreError}
          label="Show more organizations"
          onClick={() => void portfolio.loadMore()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={portfolio.loading}>
      {staleError}
      {data.groups.map((group, index) => (
        <Section
          key={group.key}
          group={group}
          params={params}
          version={version}
          currency={currency}
          defaultOpen={sectionStartsOpen(index, data.groups.length)}
          renderRow={renderRow}
          onRowsLoaded={onRowsLoaded}
        />
      ))}
    </div>
  );
}
```

`ErrorState` uses `role="alert"`, so the test's `findByRole('alert')` finds "Boom".

- [ ] **Step 4: Write the sheet**

`src/components/organizations/portfolio/AccountSheet.tsx`:
```tsx
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { trapTab } from '../../../lib/focusTrap';
import { AccountDetails } from './AccountDetails';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine, touchText } from './rowParts';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** The opened row on phones (spec §1 "Phones"): a modal bottom sheet with
 *  the row's signals on top and the six panels below. Focus moves in, Tab
 *  is trapped, and Escape or Close returns focus to whatever opened it. */
export function AccountSheet({
  row,
  currency,
  onClose,
  onEdit,
}: {
  row: PortfolioRow;
  currency: CurrencyCode;
  onClose: () => void;
  onEdit?: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[85dvh] overflow-y-auto rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line-subtle bg-surface px-3 py-3">
          <HealthRing score={row.health.score} category={row.health.category} />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-ink">
              {row.name}
            </h2>
            <p className="truncate text-[11px] text-ink-muted">
              {PORTFOLIO_FIELDS.owner.value(row)} · {row.lifecycle.label} · {touchText(row.last_touch_days)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`inline-flex w-11 h-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle ${FOCUS}`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
          <span className="font-mono-brand tabular-nums text-[15px] text-ink">
            {row.arr == null ? '—' : formatCompactMoney(row.arr, currency)}
          </span>
          <SignalTag signal={row.signal} />
          <TrendLine trend={row.health.trend} category={row.health.category} />
          <RenewalRunway renewal={row.renewal} className="flex" />
          <PulsePair pulse={row.pulse} className="flex" />
        </div>
        <AccountDetails row={row} onEdit={onEdit} />
        <div className="px-3 pb-4">
          <Link
            to={`/organizations/${row.id}`}
            className={`flex min-h-11 items-center justify-center rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-hover ${FOCUS}`}
          >
            Open organization page
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioSections.test.tsx src/components/organizations/portfolio/AccountSheet.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (6 + 2 + 4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/organizations/portfolio/PortfolioSections.tsx src/components/organizations/portfolio/PortfolioSections.test.tsx src/components/organizations/portfolio/AccountSheet.tsx src/components/organizations/portfolio/AccountSheet.test.tsx
git commit -m "feat(organizations): grouped portfolio sections with their own pages, the phone sheet, and designed states

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: The frame: `OrganizationsFrame`, the transparent top bar and the nav-actions slot

**Files:**
- Create: `src/pages/organizations/OrganizationsFrame.tsx`
- Test: `src/pages/organizations/OrganizationsFrame.test.tsx`
- Modify: `src/components/layout/Navbar.tsx` (lines 125, 215, 282, 410, 413, 416, 490 as of the spec commit)
- Modify: `src/components/layout/Navbar.test.tsx`
- Modify: `src/layouts/DashboardLayout.tsx:29,65`, `src/layouts/DashboardLayout.test.tsx`

**Interfaces:**
- Consumes: `NavActionsSlotContext` (unchanged).
- Produces:
  - `<OrganizationsFrame rail?: ReactNode>{children}</OrganizationsFrame>`. Delivery 3 passes `rail={<AskRail />}` and portals `AskControls` into the slot.
  - The Navbar renders the transparent top bar, the "Organizations views" nav and `[data-nav-actions-slot]` on `/organizations/list` only.

- [ ] **Step 1: Write the failing tests**

`src/pages/organizations/OrganizationsFrame.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganizationsFrame } from './OrganizationsFrame';

describe('OrganizationsFrame', () => {
  it('is the dashboard body, class for class, with the content owning its scroll', () => {
    const { container } = render(<OrganizationsFrame><p>List</p></OrganizationsFrame>);
    expect(container.firstChild).toHaveClass('relative', 'flex-1', 'min-h-0', 'w-full', 'flex', 'gap-3', 'px-4', 'pb-4');
    expect(screen.getByText('List').parentElement).toHaveClass('flex-1', 'min-w-0', 'min-h-0', 'overflow-y-auto');
  });

  it('puts a rail beside the content when given one', () => {
    render(<OrganizationsFrame rail={<aside aria-label="Ask Revenact" />}><p>List</p></OrganizationsFrame>);
    const rail = screen.getByRole('complementary', { name: 'Ask Revenact' });
    expect(screen.getByText('List').parentElement!.nextElementSibling).toBe(rail);
  });
});
```

In `src/layouts/DashboardLayout.test.tsx`:
- change `it.each(['/dashboard/overview', '/communications'])` to `it.each(['/dashboard/overview', '/communications', '/organizations/list'])`
- change `const main = renderAt('/organizations/list');` in "keeps the padding on other pages" to `const main = renderAt('/organizations/board');`

In `src/components/layout/Navbar.test.tsx`:
- In the routes inside `renderNavbar`, add after the `/organizations/list` route:
  ```tsx
            <Route path="/organizations/board" element={<div>Organizations Marker</div>} />
  ```
- In `describe('Navbar account menu', …)` and in the test `'keeps the other pages as they were, with no slot'`, replace every `renderNavbar('/organizations/list'` with `renderNavbar('/organizations/board'` (the list now has no avatar):
  ```bash
  sed -i '' "s#renderNavbar('/organizations/list'#renderNavbar('/organizations/board'#g" src/components/layout/Navbar.test.tsx
  ```
- Append:
  ```tsx
  describe('Navbar on the Organizations list', () => {
    it('wears the dashboard frame on /organizations/list: transparent bar, views nav, the actions slot, no avatar', () => {
      const setSlot = vi.fn();
      renderNavbar('/organizations/list', null, null, [], setSlot);
      const header = document.querySelector('header');
      expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
      for (const cls of ['bg-surface', 'border-b', 'shadow-sm']) expect(header).not.toHaveClass(cls);
      expect(screen.getByRole('heading', { name: 'Organizations' })).toBeInTheDocument();
      const views = screen.getByRole('navigation', { name: 'Organizations views' });
      expect(within(views).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/organizations/list');
      expect(within(views).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board');
      expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
      expect(header!.querySelector('[data-nav-actions-slot]')).not.toBeNull();
      expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
    });

    it('leaves the board header as it was', () => {
      renderNavbar('/organizations/board');
      expect(document.querySelector('header')).toHaveClass('h-[64px]', 'border-b', 'bg-surface');
      expect(screen.queryByRole('navigation', { name: 'Organizations views' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board');
    });
  });
  ```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/organizations/OrganizationsFrame.test.tsx src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx`
Expected: FAIL. The frame import is missing, `/organizations/list` still gets padding, and the Navbar has no "Organizations views" nav.

- [ ] **Step 3: Write the frame**

`src/pages/organizations/OrganizationsFrame.tsx`:
```tsx
import type { ReactNode } from 'react';

/** The Organizations list's frame: DashboardFrame's body, class for class
 *  (px-4 pb-4, gap-3, no top padding because the transparent top bar above
 *  gives it), with a content column that owns its scroll and a slot for the
 *  Ask rail beside it. Delivery 3 passes the rail and portals the pill into
 *  the Navbar's actions slot, which this route already renders. Until then
 *  the slot is empty and the content takes the full width. */
export function OrganizationsFrame({ rail = null, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex-1 min-h-0 w-full flex gap-3 px-4 pb-4">
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</div>
      {rail}
    </div>
  );
}
```

- [ ] **Step 4: Give `/organizations/list` the frame in the layout and the Navbar**

`src/layouts/DashboardLayout.tsx`, after line 29 (`const isDashboard = …`):
```tsx
  // The Organizations list pads itself the same way (OrganizationsFrame).
  const isOrgList = location.pathname === '/organizations/list';
```
and in the `<main>` className condition, change `|| isDashboard)` to `|| isDashboard || isOrgList)`.

`src/components/layout/Navbar.tsx`:

1. After line 125 (`const isDashboard = location.pathname.startsWith('/dashboard');`) add:
```tsx
  // The Organizations list wears the dashboard's frame (portfolio spec §1):
  // the transparent top bar, the actions slot (empty until Ask Revenact
  // lands on Organizations), and no avatar. The board keeps today's header
  // until it moves onto the portfolio (delivery 2).
  const isOrgList = location.pathname === '/organizations/list';
  const isFramed = isDashboard || isOrgList;
```
2. In the `<header className={…}>` expression (line 215), change `isDashboard` to `isFramed`.
3. Directly before `) : isOrganizations ? (` (line 282), insert this branch:
```tsx
        ) : isOrgList ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Organizations</h1>
            <nav aria-label="Organizations views" className="flex items-center gap-4 h-full">
              {[
                { to: '/organizations/list', label: 'List' },
                { to: '/organizations/board', label: 'Board' },
              ].map((view) => (
                <NavLink
                  key={view.to}
                  to={view.to}
                  className={({ isActive }) =>
                    `h-full inline-flex items-center text-[13px] font-semibold border-b-2 transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      isActive ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                    }`
                  }
                >
                  {view.label}
                </NavLink>
              ))}
            </nav>
          </div>
```
4. On lines 410, 413, 416 and 490 (the right-side wrapper, the icons wrapper, the slot-or-icons choice, and the avatar menu), change `isDashboard` to `isFramed`. Leave line 380 (`) : isDashboard ? (`, the dashboard's own title and area tabs) as it is.

The Navbar keeps its `text-[17px]` title, the same as the dashboard's. The 11/13/15/22 rule is for the page body (`components/organizations/portfolio/`), and the shell is shared with every page.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/pages/organizations/OrganizationsFrame.test.tsx src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx`
Expected: PASS (the whole files, including the account-menu tests, now on `/organizations/board`).

- [ ] **Step 6: Commit**

```bash
git add src/pages/organizations/OrganizationsFrame.tsx src/pages/organizations/OrganizationsFrame.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat(organizations): the list gets the dashboard frame, with an empty slot for the Ask rail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The page: rewrite `List.tsx` on the portfolio (integration tests, phones included)

**Files:**
- Modify (rewrite): `src/pages/organizations/List.tsx`
- Modify (rewrite): `src/pages/organizations/List.test.tsx`
- Create: `src/pages/organizations/testList.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–14; `OrganizationFormModal`, `ChurnOrganizationModal`, `ConfirmDialog` (unchanged); `apiFetch`; `useOrgCurrency`, `useAppSelector`; `SM`, `useMediaQuery`.
- Produces:
  - `List` (same export name, so the route in `App.tsx` is unchanged)
  - Test helpers `renderList(url?: string, opts?: { width?: number })` and `Where` (`data-testid="where"`, pathname plus search)

- [ ] **Step 1: Write the test helper**

`src/pages/organizations/testList.tsx`:
```tsx
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { List } from './List';

// Test-only. The real auth and customers slices (the modals dispatch into
// customers); only fetch is stubbed, by the caller, with stubPortfolio().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

export function renderList(url = '/organizations/list', { width = 1440 }: { width?: number } = {}) {
  setViewport(width);
  const store = configureStore({
    reducer: { customers: customersReducer, auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'admin' as const,
          role_id: 1,
          role_name: 'Admin',
          permissions: ALL_CAPABILITIES,
          function: 'cs' as const,
          function_display: 'Customer Success',
          reports_to: null,
          organisation: {
            id: 1,
            name: 'Acme Inc',
            slug: 'acme-inc',
            currency: 'USD' as const,
            currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '',
            ai_agent_enabled: true,
            ai_agent_tone: 'professional' as const,
            ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token',
        refreshToken: 'refresh',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/organizations/list"
            element={
              <>
                <List />
                <Where />
              </>
            }
          />
          <Route path="/organizations/:id" element={<p>Organization page</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

The `auth` object is the one today's `List.test.tsx` preloads, key for key.

- [ ] **Step 2: Rewrite the integration test (it fails against today's table)**

Replace the whole of `src/pages/organizations/List.test.tsx` with:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderList } from './testList';
import { resetViewport } from '../../test/viewport';
import {
  buildPortfolio,
  customerFixture,
  portfolioQueries,
  stubPortfolio,
} from '../../features/organizations/testPortfolio';

// Integration tier: the real page, store and router; fetch stubbed with
// §2-shaped bodies (features/organizations/testPortfolio.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);

describe('Organizations list (portfolio)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('loads tiles, health sections and rows from the portfolio endpoint', async () => {
    const spy = stubPortfolio();
    renderList();
    expect(await screen.findByRole('button', { name: /^Average · 1/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(screen.getByRole('region', { name: 'Health' })).toBeInTheDocument();
    const [frame] = portfolioQueries(spy);
    expect(frame.get('group')).toBe('health');
    expect(frame.get('sort')).toBe('-arr');
    expect(frame.get('limit')).toBe('1');
    expect(portfolioQueries(spy).some((q) => q.get('group_value') === 'average' && q.get('limit') === '25')).toBe(true);
    expect(screen.getByText('2 organizations')).toBeInTheDocument();
  });

  it('lands a dashboard drill as a chip; removing it drops ids and returns focus to Search', async () => {
    const spy = stubPortfolio();
    renderList('/organizations/list?ids=7,2');
    const chip = await screen.findByRole('button', { name: 'Remove Opened from the dashboard (2)' });
    expect(portfolioQueries(spy)[0].get('ids')).toBe('7,2');
    await userEvent.click(chip);
    expect(where().searchParams.has('ids')).toBe(false);
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toHaveFocus();
  });

  it('filters from a tile, shows N of M, and clears the selection when filters change', async () => {
    stubPortfolio();
    renderList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');

    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    expect(where().searchParams.get('health')).toBe('average');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
  });

  it('shows the designed empty state and clears filters from it', async () => {
    stubPortfolio();
    renderList('/organizations/list?search=zzz');
    expect(await screen.findByText('No organizations match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(where().searchParams.has('search')).toBe(false);
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('shows an error and recovers on Try again', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Boom' } } : buildPortfolio(q)) });
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('exports the current query through the session', async () => {
    const spy = stubPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderList('/organizations/list?health=average');
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const call = spy.mock.calls.find(([input]) => String(input).includes('export.csv'));
    expect(new URL(String(call?.[0])).searchParams.get('health')).toBe('average');
  });

  it('opens a row inline and edits it with the existing form', async () => {
    stubPortfolio({ customer: customerFixture });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('button', { name: 'Close Pizza Hut' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Pizza Hut' })).toBeInTheDocument();
  });

  it('adds an organization with the existing form', async () => {
    stubPortfolio();
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Add organization' }));
    expect(screen.getByRole('heading', { name: 'Add Organization' })).toBeInTheDocument();
  });

  describe('on a phone (375px)', () => {
    it('collapses the toolbar and keeps group, sort, export and add in the Filters sheet', async () => {
      stubPortfolio();
      renderList('/organizations/list', { width: 375 });
      await screen.findByRole('link', { name: 'Pizza Hut' });
      expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
      const sheet = screen.getByRole('dialog', { name: 'Filters' });
      expect(sheet).toHaveAttribute('aria-modal', 'true');
      for (const name of ['Group', 'Sort by']) expect(within(sheet).getByRole('combobox', { name })).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: 'Add organization' })).toBeInTheDocument();
      expect(within(sheet).getByRole('checkbox', { name: 'Include churned' })).toBeInTheDocument();
    });

    it('opens a row as a bottom sheet, and Escape closes it', async () => {
      stubPortfolio();
      renderList('/organizations/list', { width: 375 });
      await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
      const sheet = screen.getByRole('dialog', { name: 'Pizza Hut' });
      expect(within(sheet).getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
      expect(document.querySelectorAll('[data-panel="commercial"]')).toHaveLength(1);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/pages/organizations/List.test.tsx`
Expected: FAIL (for example, `Unable to find role="button" and name /^Average · 1/`), because the page still renders `OrganizationsTable`.

- [ ] **Step 4: Rewrite the page**

Replace the whole of `src/pages/organizations/List.tsx` with:
```tsx
import { useCallback, useRef, useState } from 'react';
import { useAppSelector, useOrgCurrency } from '../../hooks';
import { apiFetch } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import type { Customer } from '../../features/customers/customersSlice';
import { bulkUpdate, exportPortfolio } from '../../features/organizations/portfolioApi';
import { filterQuery, hasFilters, toApiQuery, type PortfolioParams } from '../../features/organizations/portfolioParams';
import type { BulkAction, PortfolioRow } from '../../features/organizations/portfolioTypes';
import { OrganizationFormModal } from '../../components/organizations/OrganizationFormModal';
import { ChurnOrganizationModal } from '../../components/organizations/ChurnOrganizationModal';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { AccountDetails } from '../../components/organizations/portfolio/AccountDetails';
import { AccountRow } from '../../components/organizations/portfolio/AccountRow';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioSections } from '../../components/organizations/portfolio/PortfolioSections';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { SelectionBar, type BulkReport } from '../../components/organizations/portfolio/SelectionBar';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { usePins } from '../../components/organizations/portfolio/usePins';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { useSelection } from '../../components/organizations/portfolio/useSelection';
import { OrganizationsFrame } from './OrganizationsFrame';

type Targets = { ids: number[]; names: string[] };

/** /organizations/list: the portfolio (spec 2026-09-25 §1). Every filter,
 *  sort and group is URL state. Rows, groups, tiles and totals come from
 *  GET /organizations/portfolio/. Bulk edits go to /organizations/bulk/.
 *  Churn keeps its own modal, one account at a time. */
export function List() {
  const { params, update, clearFilters } = usePortfolioParams();
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();
  const defaultLifecycleStage = useAppSelector(
    (state) => state.auth.user?.organisation.default_lifecycle_stage || undefined,
  ) as Customer['lifecycle_stage'] | undefined;

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Names of every row loaded so far, for bulk results and the churn and
  // archive dialogs. Written in fetch callbacks, read in event handlers.
  const names = useRef(new Map<number, string>());
  const rememberNames = useCallback((rows: PortfolioRow[]) => {
    for (const row of rows) names.current.set(row.id, row.name);
  }, []);
  const nameOf = useCallback((id: number) => names.current.get(id) ?? `Organization ${id}`, []);

  const portfolio = usePortfolio(params, version, rememberNames);
  const { pins, toggle: togglePin } = usePins();
  const selection = useSelection(filterQuery(params));
  const searchRef = useRef<HTMLInputElement>(null);

  const [openRow, setOpenRow] = useState<PortfolioRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [churning, setChurning] = useState<Targets | null>(null);
  const [archiving, setArchiving] = useState<Targets | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BulkReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;

  const toggleOpen = useCallback((row: PortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)), []);
  const closeSheet = useCallback(() => setOpenRow(null), []);

  const openEdit = useCallback(async (id: number) => {
    setNotice(null);
    try {
      setEditing(await apiFetch<Customer>(`/customers/${id}/`));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not open this organization for editing.'));
    }
  }, []);

  const runExport = async (query: string) => {
    setExporting(true);
    setNotice(null);
    try {
      await exportPortfolio(query);
    } catch (err) {
      setNotice(errorMessage(err, 'Could not export organizations.'));
    } finally {
      setExporting(false);
    }
  };

  const runBulk = async (action: BulkAction, value: number | string | null) => {
    const ids = [...selection.selected];
    setBusy(true);
    setReport(null);
    try {
      const result = await bulkUpdate({ ids, action, value });
      setReport({
        updated: result.updated.length,
        failed: result.failed.map((failure) => ({ ...failure, name: nameOf(failure.id) })),
      });
      // Failures stay selected, so they can be retried.
      selection.replace(result.failed.map((failure) => failure.id));
    } catch (err) {
      setReport({ updated: 0, failed: [], error: errorMessage(err, 'Could not update these organizations.') });
    } finally {
      setBusy(false);
      reload();
    }
  };

  const targets = (): Targets => {
    const ids = [...selection.selected];
    return { ids, names: ids.map(nameOf) };
  };

  const applyFilter = (patch: Partial<PortfolioParams>) => {
    update(patch);
    searchRef.current?.focus();
  };

  const renderRow = (row: PortfolioRow) => {
    const open = openRow?.id === row.id;
    return (
      <AccountRow
        key={row.id}
        row={row}
        currency={currency}
        pins={pins}
        selecting={selection.selecting}
        selected={selection.selected.has(row.id)}
        open={open}
        onToggleSelect={selection.toggle}
        onLongPress={selection.toggle}
        onToggleOpen={toggleOpen}
      >
        {open && isSm ? <AccountDetails id={`account-${row.id}-details`} row={row} onEdit={openEdit} /> : null}
      </AccountRow>
    );
  };

  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <SummaryTiles summary={portfolio.data?.summary ?? null} currency={currency} params={params} onFilter={update} />
        <PortfolioToolbar
          params={params}
          update={update}
          options={options}
          isSm={isSm}
          pins={pins}
          onTogglePin={togglePin}
          onExport={() => void runExport(toApiQuery(params))}
          exporting={exporting}
          onAdd={() => setAdding(true)}
          searchRef={searchRef}
        />
        <FilterChips
          params={params}
          options={options}
          count={portfolio.data?.count ?? null}
          total={portfolio.total}
          onChange={applyFilter}
          onClearAll={() => {
            clearFilters();
            searchRef.current?.focus();
          }}
        />
        {notice ? (
          <p role="alert" className="text-[13px] text-danger">
            {notice}
          </p>
        ) : null}
        <PortfolioSections
          params={params}
          version={version}
          portfolio={portfolio}
          currency={currency}
          filtered={hasFilters(params)}
          renderRow={renderRow}
          onRowsLoaded={rememberNames}
          onClearFilters={clearFilters}
          onAdd={() => setAdding(true)}
        />
        <SelectionBar
          count={selection.selected.size}
          owners={options?.owners ?? []}
          lifecycles={options?.lifecycles ?? []}
          busy={busy}
          report={report}
          onSetOwner={(id) => void runBulk('set_owner', id)}
          onSetLifecycle={(stage) => void runBulk('set_lifecycle', stage)}
          onExport={() =>
            void runExport(new URLSearchParams({ ids: [...selection.selected].join(','), include_churned: '1' }).toString())
          }
          onArchive={() => setArchiving(targets())}
          onChurn={() => setChurning(targets())}
          onClose={() => {
            selection.clear();
            setReport(null);
          }}
        />
      </div>

      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeSheet} onEdit={openEdit} /> : null}

      {adding ? (
        <OrganizationFormModal
          defaultLifecycleStage={defaultLifecycleStage}
          onClose={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      {editing ? (
        <OrganizationFormModal
          customer={editing}
          onClose={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      {churning ? (
        <ChurnOrganizationModal
          customerIds={churning.ids}
          customerNames={churning.names}
          onClose={() => {
            setChurning(null);
            selection.clear();
            reload();
          }}
        />
      ) : null}
      {archiving ? (
        <ConfirmDialog
          title={archiving.ids.length === 1 ? `Archive ${archiving.names[0]}?` : `Archive ${archiving.ids.length} organizations?`}
          message="Hidden from this list and the summary, but not deleted. You can unarchive later."
          confirmLabel="Archive"
          danger
          onConfirm={() => runBulk('archive', null)}
          onClose={() => setArchiving(null)}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Run the page tests and the Board's, to see them pass**

Run: `npx vitest run src/pages/organizations/List.test.tsx src/pages/organizations/Board.test.tsx`
Expected: PASS. `Board.test.tsx` is unchanged and still green, which confirms the board route is untouched.

- [ ] **Step 6: Commit**

```bash
git add src/pages/organizations/List.tsx src/pages/organizations/List.test.tsx src/pages/organizations/testList.tsx
git commit -m "feat(organizations): the list becomes the portfolio: rows, panels, tiles, filters, pins, selection and phones

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 16: End-to-end (jsdom): filter → open → pin → select → bulk

**Files:**
- Create: `src/e2e/organizationsPortfolio.test.tsx`

**Interfaces:**
- Consumes: `renderList` (Task 15), `stubPortfolio`, `bulkBodies`, `portfolioQueries` (Task 1), `LONG_PRESS_MS` (Task 5).
- Produces: no production code. This is the list-page part of the spec §5 e2e flow. "Board" and "ask" join the flow in deliveries 2 and 3.

- [ ] **Step 1: Write the flow**

`src/e2e/organizationsPortfolio.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderList } from '../pages/organizations/testList';
import { LONG_PRESS_MS } from '../components/organizations/portfolio/AccountRow';
import { bulkBodies, portfolioQueries, stubPortfolio } from '../features/organizations/testPortfolio';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real page, store, router and
// every portfolio component. Only fetch is stubbed, with §2-shaped bodies.
// Setting lifecycle fails for Globex (id 1) with the backend's own reason.

describe('Organizations portfolio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters, opens a row, pins a field, selects and bulk-edits, reporting failures per account', { timeout: 30000 }, async () => {
    const spy = stubPortfolio({
      bulk: (body) =>
        body.action === 'set_lifecycle'
          ? { updated: body.ids.filter((id) => id !== 1), failed: body.ids.includes(1) ? [{ id: 1, reason: 'Not found.' }] : [] }
          : { updated: body.ids, failed: [] },
    });
    renderList();
    expect(await screen.findByRole('link', { name: 'Globex' })).toBeInTheDocument();

    // 1. Filter: owner Carl CSM, from the Filters popover.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Owner: Carl CSM' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());

    // 2. Open Pizza Hut inline: its panels show.
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    const details = document.getElementById('account-7-details') as HTMLElement;
    expect(within(details).getByText('Detractor')).toBeInTheDocument();
    expect(within(details).getByText('$140,000.00')).toBeInTheDocument();

    // 3. Pin NPS: it shows on the row and is remembered for this user.
    await userEvent.click(screen.getByRole('button', { name: 'Pin fields' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'NPS' }));
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('[data-row-id="7"] [data-pin="nps"]')).toHaveTextContent('NPS −80');
    expect(localStorage.getItem('revenact.organizations.pins.1')).toBe('["nps"]');

    // 4. Select Pizza Hut.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }));
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');

    // 5. Bulk: change owner to Priya. The list reloads.
    const before = portfolioQueries(spy).length;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), '3');
    await waitFor(() => expect(bulkBodies(spy)).toEqual([{ ids: [7], action: 'set_owner', value: 3 }]));
    expect(await screen.findByText('Updated 1 organization.')).toBeInTheDocument();
    await waitFor(() => expect(portfolioQueries(spy).length).toBeGreaterThan(before));

    // 6. Clear the filter (the selection clears with it), select both, set a
    //    lifecycle: Globex fails by name and stays selected for a retry.
    await userEvent.click(screen.getByRole('button', { name: 'Remove Owner: Carl CSM' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Globex' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Set lifecycle' }), 'live');
    await waitFor(() => expect(bulkBodies(spy).at(-1)).toEqual({ ids: [1, 7], action: 'set_lifecycle', value: 'live' }));
    const bar = await screen.findByRole('region', { name: 'Selection' });
    expect(await within(bar).findByText('Globex')).toBeInTheDocument();
    expect(bar).toHaveTextContent('Updated 1 organization. 1 failed:');
    expect(bar).toHaveTextContent('Globex: Not found.');
    expect(bar).toHaveTextContent('1 selected');
    expect(screen.getByRole('checkbox', { name: 'Select Globex' })).toBeChecked();
  });

  it('starts selection with a long press on a phone', { timeout: 15000 }, async () => {
    stubPortfolio();
    renderList('/organizations/list', { width: 375 });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    const header = document.querySelector('[data-row-id="7"] [data-part="header"]') as HTMLElement;
    fireEvent.pointerDown(header);
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 50));
    fireEvent.pointerUp(header);
    expect(await screen.findByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/organizationsPortfolio.test.tsx`
Expected: PASS (2 tests). A failure here means a wiring bug in Task 15 (for example, a prop not passed through). Fix it in `List.tsx` rather than weakening the test.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/organizationsPortfolio.test.tsx
git commit -m "test(organizations): e2e portfolio flow: filter, open, pin, select, bulk, long-press

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Retire the table components once nothing imports them

**Files:**
- Delete: `src/components/organizations/OrganizationsTable.tsx`, `ActionBar.tsx`, `EditColumnsPopover.tsx`, `RowActionsPopover.tsx`
- Modify: `src/components/organizations/tableData.ts` (remove `DEFAULT_VISIBLE_COLUMNS`)
- **Keep:**
  - `MetricsPanel.tsx` (+ test) and `RenewalPopover.tsx`: `pages/organizations/Board.tsx` still imports them. Delivery 2 retires them with the Board.
  - `HealthPopover.tsx`/`CsatPopover.tsx` (+ tests): unimported after this task, kept for the detail-page spec. The portfolio row carries no `health_breakdown`, and the real breakdown is still on `GET /customers/:id/`.
  - `OrganizationFormModal`, `ChurnOrganizationModal`, `ConfirmDialog`: used by the new page.
  - `tableData.ts` (`ALL_COLUMNS`, `ColumnId`, `OrgRow`, `LifecycleCategory`, `HealthCategory`): used by Details, Board, Lifecycle, Health distribution, Settings, Scenarios, Navbar and `components/accounts/MetricsPanel.tsx`.
  - `/accounts` has its **own** `components/accounts/ActionBar.tsx` and `MetricsPanel.tsx`, which are untouched. They import only types from `organizations/tableData.ts`.

- [ ] **Step 1: Prove nothing imports the four**

Run:
```bash
grep -rnE "components/organizations/(OrganizationsTable|ActionBar|EditColumnsPopover|RowActionsPopover)|from '\./(OrganizationsTable|ActionBar|EditColumnsPopover|RowActionsPopover)'|DEFAULT_VISIBLE_COLUMNS" src
```
Expected: hits only inside the four files themselves (`OrganizationsTable.tsx` importing `./EditColumnsPopover`/`./RowActionsPopover`/`DEFAULT_VISIBLE_COLUMNS`, and `ActionBar.tsx` importing `./RowActionsPopover`) plus the definition in `tableData.ts`. If any other file appears, stop. That file still depends on the table, so move it onto the portfolio first.

- [ ] **Step 2: Delete them and the unused default**

```bash
git rm src/components/organizations/OrganizationsTable.tsx src/components/organizations/ActionBar.tsx src/components/organizations/EditColumnsPopover.tsx src/components/organizations/RowActionsPopover.tsx
```
In `src/components/organizations/tableData.ts`, delete the whole `export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [ … ];` block at the end of the file.

- [ ] **Step 3: Check nothing broke**

Run: `npx tsc -b --noEmit && npx vitest run --maxWorkers=2 src/components/organizations src/pages/organizations src/pages/accounts src/components/accounts src/e2e`
Expected: no type errors, all pass.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/organizations
git commit -m "refactor(organizations): remove the retired table, action bar and column editor

MetricsPanel stays until the Board moves to the portfolio (delivery 2);
HealthPopover and CsatPopover stay for the detail-page spec.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Docs: `04-app-flow`, `03-ui-ux-design`, repo architecture

**Files:**
- Modify: `docs/04-app-flow.md` (§4.2)
- Modify: `docs/03-ui-ux-design.md` (§6 "Data display", a new "Portfolio rows" subsection, §10)
- Modify: `.agents/workflows/repo-architecture.md` (component tree, route tree, the drill paragraph, "### 3. Organizations")

**Interfaces:** docs only. They describe what Tasks 1–17 built, in the same PR (product-docs rule).

- [ ] **Step 1: `docs/04-app-flow.md` §4.2**

Replace steps 1–3 (from "1. `/organizations/list` dispatches `fetchCustomers`…" through "…show the **real** health breakdown and CSAT bands.") with:
```markdown
1. `/organizations/list` reads its state from the URL (`search, owner, lifecycle,
   health, product, renews_within, nps, ids, include_churned, sort, group`;
   `group` defaults to health and `group=none` turns grouping off) and calls
   `GET /organizations/portfolio/`. Grouped, that first call asks `limit=1`
   for the summary, groups, filter options and count; each expanded section
   then reads its own rows with `group_value=<key>&limit=25` and a "Show more"
   cursor. Ungrouped, the list pages 50 at a time. With any filter active, a
   second `?limit=1` call (with `include_churned=1` when the view includes
   churned accounts) gives M for "N of M organizations".
2. Five summary tiles (Health with Count/MRR/ARR, NPS, Lifecycle, Accounts · ARR,
   Renewing 30/90) show the server's figures for the current filters; clicking a
   segment writes that filter to the URL.
3. The toolbar has search (300ms debounce, name or Revenact ID), Group, Sort
   (with direction), Filters (a popover; a bottom sheet on phones holding group,
   sort, Export and Add too), Pin fields (up to three row chips per user, in
   `localStorage`), Export (`export.csv` of the current query via the session)
   and Add organization. Active filters are removable chips.
   Each account is a row: health ring, name (links to the detail page), owner ·
   lifecycle · last touch, trend, renewal runway, pinned chips, ARR, AI/CSM pulse
   with the stored dots and a "pulses disagree" marker, and one signal. Opening a
   row shows six panels (Commercial, Contract timeline, Adoption, Voice of the
   customer, Profile, History) inline, or in a bottom sheet on phones, with
   **Edit details** opening `OrganizationFormModal`.
   Selecting rows (a checkbox, or a long press on phones) shows the selection
   bar: Change owner, Set lifecycle, Export, Archive (`POST /organizations/bulk/`,
   failures listed per account and left selected) and, for one account, Churn
   (the existing `ChurnOrganizationModal`). Selection clears when filters change.
```
Replace the paragraph "Add, edit, churn and archive all run through …" with:
```markdown
Add and edit run through `OrganizationFormModal`; churn through
`ChurnOrganizationModal`, one account at a time; archive, owner and lifecycle
changes through `POST /organizations/bulk/`.
```
Replace the whole drill paragraph ("A dashboard drill's "Open as a list" (§4.7) lands here as `?ids=3,7`: …" through "…while the `ids` fetch is loading.") with:
```markdown
A dashboard drill's "Open as a list" (§4.7) lands here as `?ids=3,7`: the
portfolio call carries `ids` (archived and churned accounts named there are
included), the chip "Opened from the dashboard (2)" shows, and removing it
drops the param and returns focus to the search box. The count reads "N of M"
against the whole book.

`/organizations/board` is unchanged in this release: it still reads
`/customers/` and `MetricsPanel`, and keeps its old header.
```

- [ ] **Step 2: `docs/03-ui-ux-design.md`**

In §6 "Data display", replace the `OrganizationsTable` row with:
```markdown
| Portfolio rows (`components/organizations/portfolio/`) | `/organizations/list`: `AccountRow` (a rounded item, not a table row; a two-line card below `sm`), `AccountDetails` (six panels, part of the row), `SummaryTiles`, `PortfolioToolbar`/`FiltersPanel`/`PinFieldsMenu`, `FilterChips`, `SelectionBar`, `PortfolioSections`, `AccountSheet`. See "Portfolio rows" below |
```
and change the `MetricsPanel` row's "Where" to: `Organizations Board (until it moves to the portfolio), Accounts, Contacts: count, health donut with COUNT/MRR/ARR toggle, NPS, lifecycle donut, renewal window`.

Add this subsection after "### Ask rail" (before "### Overlays"):
```markdown
### Portfolio rows (Organizations list)

The list is Operate mode without a spreadsheet: one rounded `bg-surface` item
per account on the canvas, grouped into sections whose headers show count and
ARR. Rules specific to it, enforced by
`components/organizations/portfolio/houseRules.test.ts`:

- Type sizes 11/13/15/22 px only; numbers in `font-mono-brand tabular-nums`.
- Health is a ring coloured by `HEALTH_COLORS` with the score as text; the trend
  line, runway and signal all carry words (the trend's label, "47d overdue",
  "Renewal overdue"), never colour alone. `renewal_overdue` and `risk` signals are
  danger-toned, `tickets` warning-toned.
- No card in a card: the opened row's panels are separated by whitespace; the
  summary tiles sit on the canvas. No glass anywhere on the list.
- Skeletons are row- and tile-shaped; the empty state is "No organizations match
  these filters" with Clear filters (or "No organizations yet" with Add).
- Every field of the old 34-column table renders exactly once in the row header
  or a panel (`fieldCoverage.test.tsx`); any panel field can be pinned as a chip.
- Frame: the Navbar on `/organizations/list` is the dashboard's transparent top
  bar ("Organizations", List/Board, the actions slot, the bell, no avatar);
  `OrganizationsFrame` is `DashboardFrame`'s body with an empty `rail` slot that
  Ask Revenact on Organizations fills later.
```

In §10 "Responsive", append:
```markdown
The Organizations list below `sm`: rows become two-line cards, the toolbar is
Search plus a Filters bottom sheet (group, sort, Export and Add inside), the
summary tiles swipe sideways in their own strip, an opened row is a bottom sheet
with a focus trap, and a long press starts selection. Every control is 44px.
```

- [ ] **Step 3: `.agents/workflows/repo-architecture.md`**

- Component tree: change `│   │   └── organizations/      ← Rich org domain components (see below)` to `│   │   └── organizations/      ← Org domain components; portfolio/ holds the list page's (see below)`.
- Route tree: change `│   ├── list                   → OrganizationsTable (main list view)` to `│   ├── list                   → Portfolio (List.tsx on GET /organizations/portfolio/)`, and `│   ├── board                  → Board view (stub)` to `│   ├── board                  → Board (KanbanBoard on /customers/, unchanged)`.
- Replace the drill paragraph ("Organisations' own list (`pages/organizations/List.tsx`) reads a drill's … rather than the filtered page's.") with:
  ```markdown
  Organisations' own list (`pages/organizations/List.tsx`) reads a drill's
  "Open as a list" as `?ids=3,7`, passes it to the portfolio endpoint, and shows
  it as the removable chip "Opened from the dashboard (N)".
  ```
- Replace "#### List View" and "#### Board View" under "### 3. Organizations" (through "Currently a stub placeholder.") with:
  ```markdown
  #### List View (`pages/organizations/List.tsx`)
  The portfolio (spec `docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md`),
  inside `OrganizationsFrame` (the dashboard's body, with an empty Ask rail slot).

  | Where | What |
  |---|---|
  | `features/organizations/portfolioTypes.ts`, `portfolioApi.ts` | The endpoint's contract; `fetchPortfolio`, `exportPortfolio` (CSV via the session), `bulkUpdate` |
  | `features/organizations/portfolioParams.ts` | URL state ↔ API query (`parseParams`, `toUrlSearch`, `toApiQuery`, `filterQuery`) |
  | `features/organizations/portfolioFields.ts` | The 34-field registry: label, place (header or one of six panels), formatter, sort key |
  | `features/organizations/pinnedFields.ts`, `filterChips.ts` | Pins per user (localStorage, try/catch); chip labels and N-of-M text |
  | `components/organizations/portfolio/usePortfolio.ts` | `usePagedPortfolio` (one cursor-paged read: the frame, each section, later each board column) and `usePortfolio` (frame + M probe) |
  | `components/organizations/portfolio/*` | `AccountRow`, `rowParts`, `AccountDetails`, `AccountSheet`, `SummaryTiles`, `PortfolioToolbar`, `FiltersPanel`, `PinFieldsMenu`, `FilterChips`, `SelectionBar`, `PortfolioSections`, `useSelection`, `usePins`, `usePortfolioParams` |
  | `features/organizations/testPortfolio.ts`, `pages/organizations/testList.tsx` | Fixtures, `buildPortfolio`, `stubPortfolio`; `renderList(url, {width})` |

  #### Board View (`pages/organizations/Board.tsx`)
  `KanbanBoard` grouped by lifecycle on `/customers/`, with `MetricsPanel`.
  Unchanged until delivery 2 moves it onto `usePagedPortfolio` per column.
  ```

- [ ] **Step 4: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md
git commit -m "docs(organizations): app flow, UI/UX and architecture for the portfolio list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Full checks

**Files:** none, unless a check fails. A fix goes back into the task that owns the behaviour and gets its own commit.

- [ ] **Step 1: Static and test gates**

Run each and read the output:
```bash
npm run lint                              # expected: 0 errors; no new warnings in files this plan touched
npx tsc -b --noEmit                       # expected: no output
npx vitest run --maxWorkers=2             # expected: every file passes, including src/e2e/organizationsPortfolio.test.tsx
npm run build                             # expected: vite build completes
```
To check the warnings: `npx eslint $(git diff --name-only main -- 'src/**/*.ts' 'src/**/*.tsx')` should report none. The accepted exceptions are `react-refresh/only-export-components` in the test helpers `testList.tsx` (it exports `renderList` next to `Where`, the same as `testAsk.tsx` does).

- [ ] **Step 2: House anti-slop scan on the touched files**

```bash
git diff main --name-only -- 'src/**/*.tsx' | xargs grep -nE '#[0-9a-fA-F]{3,6}\b|rgba?\(|text-(blue|rose|purple|amber|emerald|red|green)-' || echo "no raw colours"
```
Expected: `no raw colours`. `houseRules.test.ts` already enforces this for `components/organizations/portfolio/`. This scan covers `List.tsx`, the Navbar and the frame too.

---

### Task 20: Browser check at desktop and 375px, both themes

**Files:** none, unless a check fails (then fix in the owning task, with a commit).

- [ ] **Step 1: Run both apps**

- Backend: in `../revenact-backend`, on `feat/organizations-portfolio`, run it as that plan's final task describes (API on `http://localhost:8000`, seeded with a book that has health snapshots, one overdue renewal, one churned account and a product).
- Frontend: `npm run dev` (Vite on `http://localhost:5173`), and sign in as a CSM with `view_all_accounts`.

- [ ] **Step 2: Desktop, 1440×900, light theme**

Drive it with `npm run pw` (playwright-cli) or Claude in Chrome. On `/organizations/list`:
1. The top bar is transparent, reading "Organizations" with List/Board, then the bell. There is no avatar and no horizontal scroll. The content scrolls on its own below the bar.
2. The tiles' numbers match `/dashboard/overview`'s figures for the same book. Clicking "Poor" writes `?health=poor`, shows the chip and "N of M organizations", and the tiles follow the filter.
3. Sections read Poor, Average, Good with count · ARR. Collapse one, then expand it. "Show more" appears only when a section has more than 25.
4. Open a row. The six panels show, the renewal is danger-coloured when overdue, and **Edit details** opens the form. Save, and the row updates.
5. Pin NPS, reload the page, and the chip is still on every row.
6. Select two rows and Set lifecycle. The bar reports "Updated 2 organizations." Select one and Churn, and the modal opens for that account only.
7. Export downloads `organizations-<today>.csv` with 35 columns (34 plus Currency).
8. Board still works exactly as before: drag a card between stages, and drop one into Churn to open the modal.
9. Open `/organizations/list?ids=<two ids>` from a dashboard drill's "Open as a list". The chip "Opened from the dashboard (2)" shows. Removing it returns focus to Search.
10. Tab through the page. Every control shows a focus ring, and the chevron announces expanded or collapsed.

- [ ] **Step 3: Phone, 375×812, light theme**

1. Rows are two-line cards (ring, name and owner on top; ARR, signal and trend below). There is no horizontal page scroll, and the tiles strip swipes on its own.
2. The toolbar is Search plus Filters. The Filters sheet holds Group, Sort, Include churned, Export and Add organization. Focus is trapped in it, and Escape closes it.
3. Tap a row: a bottom sheet opens with focus on Close. Escape returns focus to the row's chevron.
4. Long-press a row: selection starts. Tap other rows to add them. The bar's controls are at least 44px.

- [ ] **Step 4: Dark theme, both widths**

Switch the theme in Settings > Personalization. Repeat steps 2.1–2.4 and 3.1–3.3, and check that the rings, runway, chips, skeletons, sheet and selection bar all use tokens (nothing stays light). Also check that the danger, warning and success tones stay readable on `bg-surface`.

- [ ] **Step 5: Record and stop**

Save screenshots at 1440 and 375 in both themes for the PR description. Then the branch is ready for `superpowers:finishing-a-development-branch`. Do not push, and do not open the PR until the backend PR has merged and deployed (spec §4).

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| §1 frame: transparent top bar, List/Board, pill slot, content scrolls, 320px rail slot | 14 (rail and pill: delivery 3, slot ready) |
| §1 Account row, elements 1–10 (checkbox, ring, name + owner · lifecycle · touched, trend with label, runway, pinned chips, ARR, pulse with the text marker, one signal, open control; name navigates, row opens) | 4, 5 |
| §1 Opened row: six panels, 3/2/1 columns, every field once, churn fields only when churned | 6, 7 |
| §1 Selection mode: checkbox or long-press, bar actions, partial failures, clears on filter change | 5, 8, 12, 15, 16 |
| §1 Summary tiles (5), click filters, numbers follow filters, Count/MRR/ARR, 30/90 | 9, 15 |
| §1 Toolbar: search, group (default health, Poor→Good), sort (six keys and numeric fields), filters (owner incl. Unassigned, lifecycle, health, product, renews, NPS, churned), URL state, `?ids=` chip, pin (≤3, per user, try/catch), export (34 fields), Add | 2, 3, 10, 11, 15 |
| §1 Phones: two-line cards, Search + Filters sheet, swipeable tiles, bottom sheet, long-press, 44px | 5, 9, 10, 13, 15, 16, 20 |
| §1 House rules: tokens, monochrome primary, mono numbers, 11/13/15/22, no card-in-card, no glass, skeletons, empty/error, states, reduced motion | 4 (`houseRules.test.ts`), 9, 13, 19, 20 |
| §2 contract (as refined by the backend plan) | 1 (types and stub), pre-flight 3–5, 19–26 |
| §4 delivery 1 only; Board unchanged | 14, 15 (`Board.test.tsx` green), 17 (MetricsPanel kept) |
| §5 unit and integration per component | 1–15 |
| §5 34 fields asserted over the field list | 7 |
| §5 filters round-trip through the URL | 2 |
| §5 tiles filter on click | 9, 15 |
| §5 selection mode and bulk results | 12, 15, 16 |
| §5 phone layouts (cards, bottom sheet, filters sheet) | 10, 13, 15, 16 |
| §5 e2e: filter → open → pin → select → bulk (board and ask join in deliveries 2 and 3) | 16 |
| §5 browser check, desktop and 375, both themes | 20 |
| Docs: app flow, UI/UX, repo architecture | 18 |
| Full checks: lint, tsc, vitest `--maxWorkers=2`, build | 19 |
| Retire table components when unimported; where they are used elsewhere | 17 |

**Placeholder scan:** no step says "TBD", "handle edge cases" or "similar to Task N". Every code step carries its code, and every test step carries its test.

**Type consistency, checked across tasks:**
- `PortfolioRow`, `PortfolioResponse`, `BulkRequest` and `BulkResult` (Task 1) are used unchanged in Tasks 3–16.
- `PortfolioParams`, `toApiQuery(p, extra)`, `filterQuery` and `hasFilters` (Task 2) are used in Tasks 8, 11, 13 and 15.
- `PORTFOLIO_FIELDS`, `PANEL_ORDER`, `PANELS`, `SORT_OPTIONS`, `signed` and `pulseWords` (Task 3) are used in Tasks 4–7, 9 and 10.
- `usePagedPortfolio(query, enabled, version, onLoaded)` and `PortfolioState` (`next`, `loadMore`, `retry`, `total`) (Task 8) are used in Tasks 13 and 15.
- `BulkReport` (Task 12) is used in Task 15.
- `AccountRowProps.onToggleOpen(row)` is used in Task 15.
- `onSetOwner(id: number | null)` (Task 12) maps to `runBulk('set_owner', id)` in Task 15.
- `LONG_PRESS_MS` (Task 5) is used in Task 16.
