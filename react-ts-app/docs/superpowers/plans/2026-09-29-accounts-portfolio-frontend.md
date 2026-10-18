# Accounts portfolio (frontend, delivery 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/accounts/list` and `/accounts/board` into the Organizations-style portfolio (rows, not a table; tiles, URL filters, selection, a Board with moves) on the Organizations portfolio components, made kind-agnostic, and retire `AccountsTable`, `MetricsPanel` and `ActionBar`.

**Architecture:**
- The shared components under `src/components/organizations/portfolio/` read a **portfolio kind** from React context (`PortfolioKindContext`), not Organizations' own constants.
- A kind (`PortfolioKind`) is one object: its endpoint, its URL parameters, words, links, row line, details panels, sorts, groups, filters and how a Board move saves.
- `ORGANIZATION_KIND` is the context's default. So the Organizations pages, and every component rendered on its own in a test, behave exactly as today; no Organizations test changes.
- The Accounts pages wrap themselves in `ACCOUNT_KIND` and use the same components against `GET /api/v1/accounts/portfolio/`, `export.csv` and `POST /api/v1/accounts/bulk/`. Accounts' four panels are a new `AccountPanels`.
- Board moves save through the single-account `PATCH /customers/<cid>/accounts/<id>/`.
- Organisation-only parts stay on the Organizations side: churn and archive, products, the contract timeline, pins.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-accounts-redesign-design.md`: §1 (all but its "Backend" subsection), the Decisions table, §4 (delivery notes) and §5 (frontend testing). Delivery 3 (Ask) is out of scope; the frame's rail slot is kept. The backend contract is backend PR #74 (`revenact-backend` branch `feat/accounts-portfolio`, `docs/API_CONTRACTS.md` → `accounts_portfolio`), merged and deployed before this frontend.

## Global Constraints

- **The owner's standing rules (spec §0):** "app-ready (phones included), never spreadsheet-like, and no information lost."
- **Spec Decisions, Frontend:** "The Organizations portfolio components (row, opened row, board, tiles, toolbar, selection) become kind-agnostic. Each page supplies its own fields, filters and actions."
- **No archive or churn:** "Accounts have neither, so there is no Archive, Churn or churned filter on Accounts."
- **Opened row:** "Every account field appears exactly once."
- **Phones (< 640px):** "Two-line cards, the opened row as a bottom sheet, and 44px targets. Layouts for phones and desktop are rendered conditionally."
- **Currency:** "ARR in the workspace's currency (`Organisation.currency`), as on Organizations."
- **Retired:** "`AccountsTable`, `MetricsPanel`, `ActionBar`, and the old `/accounts/stats/` use on this page."
- **Testing (spec §5):** "The Organizations pages' existing tests still pass on the kind-agnostic components."
- **Backend contract** (backend #74, `accounts_portfolio`):
  - `GET /accounts/portfolio/` params: `search, organisation, owner, lifecycle, health, renews_within (30|90|180), nps, ids, sort (risk|arr|renewal|health|name, "-" descending, default -arr), group (health|lifecycle|owner|renewal), group_value, cursor, limit`. There is no `include_churned` and no `product`.
  - The response is `{results, next_cursor, count, groups, summary, filters: {organisations, owners, lifecycles}, currency}`. A row is the Organizations row's header fields, plus `organisation: {id, name} | null`, `extra_organisations`, and `details: {commercial: {arr, renewal_date}, voice: {nps_score, csat_score, ai_pulse_reason}, profile: {revenact_id, domain, industry, email, phone, address, organisations}, history: {created_at, updated_at, pulse_recorded_on, csm_pulse_modified_at}}`.
  - `groups` lists only non-empty groups.
  - `GET /accounts/portfolio/export.csv` takes the same params and returns `accounts-<date>.csv`.
  - `POST /accounts/bulk/ {ids, action: "set_owner" | "set_lifecycle", value}` returns `{updated, failed: [{id, reason}]}`. Churn is an ordinary stage there.
- **House rules** (`.claude/skills/revenact-design/SKILL.md` §1, §4):
  - tokens only (no hex, rgb or palette colours)
  - type sizes 11/13/15/22 px; numbers in DM Mono (`font-mono-brand tabular-nums`)
  - Lucide icons with `aria-hidden` beside text
  - no card in a card
  - 44px targets below `sm` (`min-h-11 sm:min-h-9`)
  - designed empty, loading and error states
  - sentence-case copy, both themes, no motion added
  - glass only on the Ask rail (none here)
- **Tests** per the `testing` skill:
  - unit tests for the pure modules and components
  - integration through the real store and router, with `fetch` stubbed in contract shapes
  - a jsdom end-to-end journey in `src/e2e/`
  - the house-rules suite over the new component files
- Run Vitest as `npx vitest run <paths> --maxWorkers=2`, one process at a time. No new dependencies.
- Work on `feat/accounts-portfolio` in `react-ts-app`. Commits are conventional (`refactor(portfolio): …`, `feat(accounts): …`, `test(accounts): …`, `docs(accounts): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

## Decisions this plan makes where the spec is silent

1. **The kind-agnostic seam is a context, and names stay.**
   - `PortfolioKindContext` holds a `PortfolioKind`. It defaults to `ORGANIZATION_KIND`, and the Accounts pages provide `ACCOUNT_KIND` around themselves.
   - The components keep their names (`AccountRow`, `AccountSheet`, `AccountSidePanel`, `BoardCard`, …; on Organizations "account" already meant an organisation's row), so no Organizations import or test changes.
   - Kind members are methods, so an account kind can stand where `PortfolioKind<PortfolioRowBase>` is expected (method parameters are bivariant).
2. **One parameter model, per-kind parsing.**
   - `PortfolioParams` gains an optional `organisation?: string[]`.
   - `parseParams` takes a `ParamSpec` (sorts, groups, and which of `product` / `organisation` / `include_churned` the kind reads).
   - Organizations' parse is unchanged: its output has no `organisation` key, so `toEqual` tests hold.
3. **The account page link carries its row.** `/accounts/:id` (`Details.tsx`, delivery 2) still shows real data only with `location.state.account`.
   - The row's name link, the sheet's and panel's "Open account page" and the Board card all pass `{account: accountNavRow(row)}`.
   - `accountNavRow(row)` is built from the portfolio row, as `mapAccountToAccountRow` was from `/accounts/`, but with no Clearbit logo (a house rule); the page's avatar falls back to initials.
4. **An account whose organisations the viewer cannot open** (`organisation: null`) has no Edit details and cannot be moved on the Board. Both need a linked customer id for `/customers/<cid>/accounts/<id>/`. It can still be bulk-edited, since bulk checks each id itself.
5. **Edit and Add reuse `AccountFormModal`.**
   - Edit first reads the full `Account` from `GET /customers/<organisation.id>/accounts/<id>/`. The page then reloads when the modal closes.
   - Add loads the organisation picker with `fetchCustomers()` when Add opens, not on page load. A column's "+" presets its stage.
6. **No Pin fields on Accounts.** The spec's toolbar does not list it, and every field is already in the four panels. Accounts pass `pins={[]}` and no `onTogglePin`.
7. **The Renewing tile opens on 90 days on Accounts** (the spec's tile is "Renewing within 90 days"); Organizations keeps 30. The count tile keeps its title, "Accounts · ARR", which on Accounts is literal.
8. **Profile links open the organisation with this account chosen:** `/organizations/<id>?account=<account id>`. This matches the spec's §2 "Part of" behaviour.
9. **`csm_pulse_modified_at` shows in History as "CSM pulse set".** The backend puts it there. The spec's History list omits it, but every field must appear once.
10. **Copy spelling.** The UI says "Organization" (the product's nav and pages do); the URL and API parameter stays `organisation` (the backend's). The Filters panel's "Organization" checklist sits right after Owner.
11. **The rail slot.** The Accounts pages use `OrganizationsFrame` with `rail` left empty (null). No blank 320px column is drawn before delivery 3; the slot and the Navbar's actions slot (where the pill will portal) are there.
12. **Group options.** The List offers None, Health, Owner, Lifecycle and Renewal window (None gives the flat list, as on Organizations). The Board offers the same without None.
13. **`mapToAccountRow.ts` stays.** Only the retired pages used it. `Details.tsx` still describes its shape, and delivery 2 retires both together.
14. **Field ids are the backend's** (`services/accounts_portfolio/fields.py`), so the coverage test and the CSV name the same 24 fields. "AI n · CSM n" carries both `aiPulseValue` and `csmPulseScore` (`data-field="aiPulseValue csmPulseScore"`, matched with `~=`).

## File structure

| File | Responsibility |
|---|---|
| `src/features/organizations/portfolioTypes.ts` | + `PortfolioRowBase`, `FilterOptions`, `OrganizationFilters`, `PortfolioPage<R, F>`; `PortfolioResponse` becomes `PortfolioPage<PortfolioRow, OrganizationFilters>` |
| `src/features/organizations/portfolioParams.ts` | + `organisation?`, `ParamSpec`, `ORGANIZATION_PARAMS`; `parseParams(search, defaultGroup, spec)` |
| `src/features/organizations/portfolioLabels.ts` | + `PortfolioNoun`, `ORGANIZATION_NOUN`, `capitalise` |
| `src/features/organizations/portfolioGroups.ts` (new) | `GroupOption`, `GROUP_OPTIONS`, `BOARD_GROUP_OPTIONS` (moved out of `FiltersPanel.tsx`, which re-exports them) |
| `src/features/organizations/filterChips.ts` | Organisation chips; `countText(…, noun)` |
| `src/components/organizations/portfolio/portfolioKind.ts` (new) | `PortfolioKind`, `DetailsProps`, `SubtitlePart`, `PortfolioKindContext`, `usePortfolioKind`, `subtitleText` |
| `src/components/organizations/portfolio/organizationKind.ts` (new) | `ORGANIZATION_KIND` |
| `src/components/organizations/portfolio/testKind.ts` (new, test only) | `WIDGET_KIND`, a made-up third kind that proves a component reads the kind |
| `src/components/organizations/portfolio/{usePortfolio,usePortfolioParams,useBoardMove}.ts`, `boardMove.ts` | Generic over the row; read the kind (endpoint, words, M probe, params, save, churn modal) |
| `src/components/organizations/portfolio/{rowParts,AccountRow,AccountSheet,AccountSidePanel,PortfolioSections,BoardCard,BoardColumn,PortfolioBoard,PortfolioToolbar,FiltersPanel,FilterChips,SelectionBar,SummaryTiles}.tsx` | Read the kind; generic over the row where they hold one |
| `src/features/accounts/portfolioTypes.ts`, `portfolioApi.ts`, `portfolioParams.ts` (new) | The accounts contract, `fetchAccountPortfolio`, `exportAccountPortfolio`, `bulkUpdateAccounts`, `ACCOUNT_PARAMS` |
| `src/features/accounts/accountFields.ts` (new) | The 24-field registry, panels, sorts, groups, lifecycle targets, `ACCOUNT_NOUN`, `organisationText` |
| `src/features/accounts/accountNavState.ts` (new) | `accountNavRow(row)`: the `AccountRow` `/accounts/:id` reads from `location.state` |
| `src/features/accounts/testPortfolio.ts` (new, test only) | Fixtures, `buildAccountPortfolio`, `stubAccountsPortfolio`, request helpers |
| `src/components/accounts/portfolio/AccountPanels.tsx`, `accountKind.ts` (new) | The four panels; `ACCOUNT_KIND` |
| `src/pages/accounts/List.tsx`, `Board.tsx` (rewritten), `useAccountEditing.ts`, `testList.tsx` (new) | The two pages; edit/add wiring; the test harness |
| `src/components/layout/Navbar.tsx` | The framed Accounts bar (title, List \| Board keeping the query, actions slot, no avatar) |
| `src/components/accounts/{AccountsTable,ActionBar,MetricsPanel}.tsx`, `MetricsPanel.test.tsx` | Deleted |
| `src/e2e/accountsPortfolio.test.tsx` (new) | The end-to-end journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

---

### Task 1: Types, URL parameters, words and chips for more than one kind

**Files:**
- Modify: `src/features/organizations/portfolioTypes.ts`
- Modify: `src/features/organizations/portfolioParams.ts`
- Modify: `src/features/organizations/portfolioLabels.ts`
- Modify: `src/features/organizations/filterChips.ts`
- Create: `src/features/organizations/portfolioGroups.ts`
- Modify: `src/components/organizations/portfolio/FiltersPanel.tsx:17-32`
- Test: `src/features/organizations/portfolioKinds.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:

```ts
// portfolioTypes.ts
export interface PortfolioRowBase { id; name; initials; owner; lifecycle; health; renewal; arr; risk; pulse; last_touch_days; urgent_tickets; signal } // exact shape in Step 3
export interface FilterOptions { owners: Option[]; lifecycles: Option[]; products?: Option[]; organisations?: Option[] }
export interface OrganizationFilters { owners: Option[]; lifecycles: Option[]; products: Option[] }
export interface PortfolioPage<R extends PortfolioRowBase = PortfolioRowBase, F extends FilterOptions = FilterOptions> { results: R[]; next_cursor: string | null; count: number; groups: PortfolioGroup[]; summary: PortfolioSummary; filters: F; currency: CurrencyCode }
export type PortfolioResponse = PortfolioPage<PortfolioRow, OrganizationFilters>;
// portfolioParams.ts
export interface ParamSpec { sortKeys: readonly string[]; groupKeys: readonly GroupKey[]; product: boolean; churned: boolean; organisation: boolean }
export const ORGANIZATION_PARAMS: ParamSpec;
export function parseParams(search: URLSearchParams, defaultGroup?: GroupKey, spec?: ParamSpec): PortfolioParams; // PortfolioParams gains organisation?: string[]
// portfolioLabels.ts
export interface PortfolioNoun { one: string; many: string }
export const ORGANIZATION_NOUN: PortfolioNoun;
export const capitalise: (word: string) => string;
// portfolioGroups.ts
export interface GroupOption { value: GroupKey | 'none'; label: string }
export const GROUP_OPTIONS: GroupOption[]; export const BOARD_GROUP_OPTIONS: GroupOption[];
// filterChips.ts
export function filterChips(p: PortfolioParams, options: FilterOptions | null): Chip[];
export function countText(count: number | null, total: number | null, filtered: boolean, failed?: boolean, noun?: PortfolioNoun): string;
```

- [ ] **Step 1: Write the failing test**

Create `src/features/organizations/portfolioKinds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countText, filterChips } from './filterChips';
import { BOARD_GROUP_OPTIONS, GROUP_OPTIONS } from './portfolioGroups';
import { ORGANIZATION_NOUN, capitalise } from './portfolioLabels';
import {
  EMPTY_FILTERS,
  ORGANIZATION_PARAMS,
  filterQuery,
  hasFilters,
  parseParams,
  toApiQuery,
  toUrlSearch,
  type ParamSpec,
} from './portfolioParams';
import type { FilterOptions, PortfolioPage, PortfolioResponse, PortfolioRowBase } from './portfolioTypes';
import { pizzaHut } from './testPortfolio';

// A second kind's parameters (Accounts, by shape): organisation instead of
// product, no churned switch, five sorts and four groups.
const OTHER: ParamSpec = {
  sortKeys: ['risk', 'arr', 'renewal', 'health', 'name'],
  groupKeys: ['health', 'lifecycle', 'owner', 'renewal'],
  product: false,
  churned: false,
  organisation: true,
};

describe('portfolio params for more than one kind', () => {
  it('reads organisation ids for a kind that has them, and drops product and churned', () => {
    const p = parseParams(
      new URLSearchParams('organisation=7,x,1&product=3&include_churned=1&sort=-risk&group=renewal'),
      'health',
      OTHER,
    );
    expect(p.organisation).toEqual(['7', '1']);
    expect(p.product).toEqual([]);
    expect(p.include_churned).toBe(false);
    expect(p.sort).toBe('-risk');
    expect(p.group).toBe('renewal');
  });

  it('falls back to the defaults for a sort or group the kind does not offer', () => {
    const p = parseParams(new URLSearchParams('sort=touch&group=product'), 'health', OTHER);
    expect(p.sort).toBe('-arr');
    expect(p.group).toBe('health');
  });

  it('leaves Organizations exactly as it was: no organisation key, product and churned kept', () => {
    const p = parseParams(new URLSearchParams('organisation=7&product=3&include_churned=1'));
    expect('organisation' in p).toBe(false);
    expect(p.product).toEqual(['3']);
    expect(p.include_churned).toBe(true);
    expect(parseParams(new URLSearchParams(), 'health', ORGANIZATION_PARAMS)).toEqual(parseParams(new URLSearchParams()));
  });

  it('writes organisation to the URL and the API query, and counts it as a filter', () => {
    const p = parseParams(new URLSearchParams('organisation=7,1'), 'health', OTHER);
    expect(toUrlSearch(p).get('organisation')).toBe('7,1');
    expect(new URLSearchParams(toApiQuery(p)).get('organisation')).toBe('7,1');
    expect(filterQuery(p)).toBe('organisation=7%2C1');
    expect(hasFilters(p)).toBe(true);
    expect(hasFilters({ ...p, ...EMPTY_FILTERS })).toBe(false);
  });
});

describe('filter chips and the count for more than one kind', () => {
  const options: FilterOptions = {
    owners: [{ value: '2', name: 'Carl CSM' }],
    lifecycles: [],
    organisations: [{ value: '7', name: 'Pizza Hut' }],
  };

  it('names an organisation chip from the options, and removing it drops only that id', () => {
    const p = parseParams(new URLSearchParams('organisation=7,1&owner=2'), 'health', OTHER);
    const chips = filterChips(p, options);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Owner: Carl CSM',
      'Organization: Pizza Hut',
      'Organization: Organization 1',
    ]);
    expect(chips[1].patch).toEqual({ organisation: ['1'] });
  });

  it("counts in the kind's own words", () => {
    const accounts = { one: 'account', many: 'accounts' };
    expect(countText(1, null, false, false, accounts)).toBe('1 account');
    expect(countText(2, 5, true, false, accounts)).toBe('2 of 5 accounts');
    expect(countText(null, null, false, false, accounts)).toBe('Loading accounts…');
    expect(countText(null, null, false, true, accounts)).toBe('Accounts unavailable');
    expect(countText(3, null, false)).toBe('3 organizations');
    expect(capitalise(ORGANIZATION_NOUN.many)).toBe('Organizations');
  });
});

describe('group options', () => {
  it('moved out of the filters panel unchanged', () => {
    expect(GROUP_OPTIONS.map((option) => option.value)).toEqual(['none', 'health', 'owner', 'lifecycle', 'product', 'renewal']);
    expect(BOARD_GROUP_OPTIONS.map((option) => option.value)).toEqual(['health', 'owner', 'lifecycle', 'product', 'renewal']);
  });
});

describe('portfolio types', () => {
  it('an organisation row is a portfolio row, and its response a portfolio page', () => {
    const row: PortfolioRowBase = pizzaHut;
    const page: PortfolioPage | null = null as PortfolioResponse | null;
    expect(row.id).toBe(7);
    expect(page).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/organizations/portfolioKinds.test.ts --maxWorkers=2`
Expected: FAIL. The file does not load: `Failed to resolve import "./portfolioGroups"`.

- [ ] **Step 3: Implement**

`src/features/organizations/portfolioTypes.ts`. Replace

```ts
export interface Option {
  value: string;
  name: string;
}
```

with

```ts
export interface Option {
  value: string;
  name: string;
}

/** The header fields every portfolio row carries, organisation or account:
 *  what the kind-agnostic row, card, sheet and board read. */
export interface PortfolioRowBase {
  id: number;
  name: string;
  initials: string;
  owner: { id: number; name: string } | null;
  lifecycle: { value: LifecycleValue; label: string };
  health: { score: number; category: HealthBand; trend: number[] };
  renewal: { date: string | null; days: number | null };
  arr: number | null;
  risk: { score: number; direction: RiskDirection };
  pulse: {
    csm: number | null;
    ai: number | null;
    /** An account with no AI pulse carries null here; an organisation ''. */
    ai_category: string | null;
    ai_label: string;
    reason: string;
    history: number[];
    disagree: boolean;
  };
  last_touch_days: number | null;
  urgent_tickets: number;
  signal: { kind: SignalKind; label: string } | null;
}

/** A portfolio's filter choices. Organizations list products, Accounts
 *  organisations; both list owners and stages. */
export interface FilterOptions {
  owners: Option[];
  lifecycles: Option[];
  products?: Option[];
  organisations?: Option[];
}

export interface OrganizationFilters {
  owners: Option[];
  lifecycles: Option[];
  products: Option[];
}
```

Then replace

```ts
export interface PortfolioResponse {
  results: PortfolioRow[];
  next_cursor: string | null;
  count: number;
  groups: PortfolioGroup[];
  summary: PortfolioSummary;
  filters: { owners: Option[]; lifecycles: Option[]; products: Option[] };
  currency: CurrencyCode;
}
```

with

```ts
/** One read of a portfolio endpoint (`/organizations/portfolio/` or
 *  `/accounts/portfolio/`): one envelope, each kind's own rows and filters. */
export interface PortfolioPage<R extends PortfolioRowBase = PortfolioRowBase, F extends FilterOptions = FilterOptions> {
  results: R[];
  next_cursor: string | null;
  count: number;
  groups: PortfolioGroup[];
  summary: PortfolioSummary;
  filters: F;
  currency: CurrencyCode;
}

export type PortfolioResponse = PortfolioPage<PortfolioRow, OrganizationFilters>;
```

`src/features/organizations/portfolioLabels.ts`. Append:

```ts

/** What a portfolio lists, in its own words ("organization", "account"). */
export interface PortfolioNoun {
  one: string;
  many: string;
}

export const ORGANIZATION_NOUN: PortfolioNoun = { one: 'organization', many: 'organizations' };

/** "organizations" → "Organizations". */
export const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
```

Create `src/features/organizations/portfolioGroups.ts`:

```ts
import type { GroupKey } from './portfolioTypes';

// The Group choices, moved here from FiltersPanel.tsx so a portfolio kind
// (a plain module) can name them without importing a component.

export interface GroupOption {
  value: GroupKey | 'none';
  label: string;
}

export const GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: 'None' },
  { value: 'health', label: 'Health' },
  { value: 'owner', label: 'Owner' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'product', label: 'Product' },
  { value: 'renewal', label: 'Renewal window' },
];

/** The Board always has columns, so it offers no "None". */
export const BOARD_GROUP_OPTIONS: GroupOption[] = GROUP_OPTIONS.filter((option) => option.value !== 'none');
```

`src/components/organizations/portfolio/FiltersPanel.tsx`. Replace

```ts
export interface GroupOption {
  value: GroupKey | 'none';
  label: string;
}

export const GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: 'None' },
  { value: 'health', label: 'Health' },
  { value: 'owner', label: 'Owner' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'product', label: 'Product' },
  { value: 'renewal', label: 'Renewal window' },
];

/** The Board always has columns, so it offers no "None". */
export const BOARD_GROUP_OPTIONS: GroupOption[] = GROUP_OPTIONS.filter((option) => option.value !== 'none');
```

with

```ts
// Kept importable from here, where the pages and tests already find them.
export { BOARD_GROUP_OPTIONS, GROUP_OPTIONS, type GroupOption } from '../../../features/organizations/portfolioGroups';
```

and replace `import { FOCUS } from './styles';` with

```ts
import { GROUP_OPTIONS, type GroupOption } from '../../../features/organizations/portfolioGroups';
import { FOCUS } from './styles';
```

`src/features/organizations/portfolioParams.ts`, five edits:

(a) Replace

```ts
  product: string[];
  renews_within: '' | RenewalWindow;
```

with

```ts
  product: string[];
  /** Accounts only: linked organisation ids (`organisation` in the URL and
   *  the API). Absent on Organizations, whose URL never carries it. */
  organisation?: string[];
  renews_within: '' | RenewalWindow;
```

(b) Replace

```ts
const SORT_KEYS: readonly string[] = [...BASE_SORT_KEYS, ...NUMERIC_SORT_KEYS];
```

with

```ts
const SORT_KEYS: readonly string[] = [...BASE_SORT_KEYS, ...NUMERIC_SORT_KEYS];

/** Which parameters a kind of portfolio reads from its URL: its own sorts
 *  and groups, and the filters only some kinds have. A value outside them
 *  is dropped, as each backend drops it. */
export interface ParamSpec {
  sortKeys: readonly string[];
  groupKeys: readonly GroupKey[];
  product: boolean;
  churned: boolean;
  organisation: boolean;
}

export const ORGANIZATION_PARAMS: ParamSpec = {
  sortKeys: SORT_KEYS,
  groupKeys: GROUP_KEYS,
  product: true,
  churned: true,
  organisation: false,
};
```

(c) Replace

```ts
  search: '', owner: '', lifecycle: [], health: [], product: [], renews_within: '', nps: '', ids: [], include_churned: false,
```

with

```ts
  search: '', owner: '', lifecycle: [], health: [], product: [], organisation: [], renews_within: '', nps: '', ids: [], include_churned: false,
```

(d) Replace the whole of `parseSort` and `parseParams`, from `function parseSort(raw: string | null): string {` through the closing `}` of `parseParams`, with

```ts
function parseSort(raw: string | null, keys: readonly string[]): string {
  if (!raw) return DEFAULT_SORT;
  return keys.includes(raw.replace(/^-/, '')) ? raw : DEFAULT_SORT;
}

export function parseParams(
  search: URLSearchParams,
  defaultGroup: GroupKey = DEFAULT_GROUP,
  spec: ParamSpec = ORGANIZATION_PARAMS,
): PortfolioParams {
  const owner = search.get('owner') ?? '';
  const renews = search.get('renews_within') ?? '';
  const nps = search.get('nps') ?? '';
  const group = search.get('group');
  const digits = (key: string) => list(search.get(key)).filter((value) => /^\d+$/.test(value));
  return {
    search: (search.get('search') ?? '').trim(),
    owner: owner === 'unassigned' || /^\d+$/.test(owner) ? owner : '',
    lifecycle: only(list(search.get('lifecycle')), LIFECYCLE_VALUES),
    health: only(list(search.get('health')), HEALTH_BANDS),
    product: spec.product ? digits('product') : [],
    // Only a kind that has the filter gets the key, so Organizations' params
    // stay exactly the object they were.
    ...(spec.organisation ? { organisation: digits('organisation') } : {}),
    renews_within: only([renews], RENEWAL_WINDOWS)[0] ?? '',
    nps: only([nps], NPS_BANDS)[0] ?? '',
    ids: digits('ids').map(Number).slice(0, MAX_IDS),
    include_churned: spec.churned && search.get('include_churned') === '1',
    sort: parseSort(search.get('sort'), spec.sortKeys),
    group: group === 'none' ? '' : (only([group ?? ''], spec.groupKeys)[0] ?? defaultGroup),
  };
}
```

(e) Replace

```ts
  if (p.product.length) query.set('product', p.product.join(','));
```

with

```ts
  if (p.product.length) query.set('product', p.product.join(','));
  if (p.organisation?.length) query.set('organisation', p.organisation.join(','));
```

`src/features/organizations/filterChips.ts`. Replace the whole file with:

```ts
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { PortfolioParams } from './portfolioParams';
import { HEALTH_LABEL, NPS_LABEL, ORGANIZATION_NOUN, capitalise, type PortfolioNoun } from './portfolioLabels';
import type { FilterOptions, Option } from './portfolioTypes';

export interface Chip {
  key: string;
  label: string;
  /** What removing this chip writes to the URL. */
  patch: Partial<PortfolioParams>;
}

const nameIn = (list: Option[] | undefined, value: string) => list?.find((o) => o.value === value)?.name;

/** One removable chip per active filter (spec §1), in a fixed order. */
export function filterChips(p: PortfolioParams, options: FilterOptions | null): Chip[] {
  const chips: Chip[] = [];
  if (p.ids.length) chips.push({ key: 'ids', label: `Opened from the dashboard (${p.ids.length})`, patch: { ids: [] } });
  if (p.search) chips.push({ key: 'search', label: `Search: ${p.search}`, patch: { search: '' } });
  if (p.owner) {
    const name = p.owner === 'unassigned' ? 'Unassigned' : (nameIn(options?.owners, p.owner) ?? `User ${p.owner}`);
    chips.push({ key: 'owner', label: `Owner: ${name}`, patch: { owner: '' } });
  }
  const organisations = p.organisation ?? [];
  for (const id of organisations) {
    const name = nameIn(options?.organisations, id) ?? `Organization ${id}`;
    chips.push({ key: `organisation:${id}`, label: `Organization: ${name}`, patch: { organisation: organisations.filter((v) => v !== id) } });
  }
  for (const stage of p.lifecycle) {
    const name = nameIn(options?.lifecycles, stage) ?? LIFECYCLE_LABELS[stage];
    chips.push({ key: `lifecycle:${stage}`, label: `Lifecycle: ${name}`, patch: { lifecycle: p.lifecycle.filter((s) => s !== stage) } });
  }
  for (const band of p.health) {
    chips.push({ key: `health:${band}`, label: `Health: ${HEALTH_LABEL[band]}`, patch: { health: p.health.filter((b) => b !== band) } });
  }
  for (const product of p.product) {
    const name = nameIn(options?.products, product) ?? `Product ${product}`;
    chips.push({ key: `product:${product}`, label: `Product: ${name}`, patch: { product: p.product.filter((v) => v !== product) } });
  }
  if (p.renews_within) chips.push({ key: 'renews', label: `Renews within ${p.renews_within} days`, patch: { renews_within: '' } });
  if (p.nps) chips.push({ key: 'nps', label: `NPS: ${NPS_LABEL[p.nps]}`, patch: { nps: '' } });
  if (p.include_churned) chips.push({ key: 'churned', label: 'Includes churned', patch: { include_churned: false } });
  return chips;
}

export function countText(
  count: number | null,
  total: number | null,
  filtered: boolean,
  failed = false,
  noun: PortfolioNoun = ORGANIZATION_NOUN,
): string {
  if (count == null) return failed ? `${capitalise(noun.many)} unavailable` : `Loading ${noun.many}…`;
  if (filtered && total != null) return `${count} of ${total} ${noun.many}`;
  return `${count} ${count === 1 ? noun.one : noun.many}`;
}
```

- [ ] **Step 4: Run the new test, then every Organizations test, then the types**

Run: `npx vitest run src/features/organizations/portfolioKinds.test.ts --maxWorkers=2`
Expected: PASS (8 tests).

Run: `npx vitest run src/features/organizations src/components/organizations src/pages/organizations src/e2e --maxWorkers=2`
Expected: every file passes, 0 failed.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/portfolioTypes.ts src/features/organizations/portfolioParams.ts src/features/organizations/portfolioLabels.ts src/features/organizations/portfolioGroups.ts src/features/organizations/filterChips.ts src/features/organizations/portfolioKinds.test.ts src/components/organizations/portfolio/FiltersPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(portfolio): params, chips and types for more than one kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The portfolio kind, and the data hooks that read it

**Files:**
- Create: `src/components/organizations/portfolio/portfolioKind.ts`
- Create: `src/components/organizations/portfolio/organizationKind.ts`
- Create: `src/components/organizations/portfolio/testKind.ts` (test only)
- Modify: `src/components/organizations/portfolio/usePortfolio.ts` (whole file)
- Modify: `src/components/organizations/portfolio/usePortfolioParams.ts` (whole file)
- Test: `src/components/organizations/portfolio/portfolioKind.test.tsx`

**Interfaces:**
- Consumes (Task 1): `PortfolioRowBase`, `FilterOptions`, `OrganizationFilters`, `PortfolioPage`, `ParamSpec`, `ORGANIZATION_PARAMS`, `PortfolioNoun`, `ORGANIZATION_NOUN`, `GroupOption`, `GROUP_OPTIONS`, `BOARD_GROUP_OPTIONS`.
- Produces:

```ts
// portfolioKind.ts
export interface DetailsProps<R extends PortfolioRowBase = PortfolioRowBase> {
  row: R; currency: CurrencyCode; id?: string; today?: string; onEdit?: (id: number) => void; stacked?: boolean;
}
export interface SubtitlePart { text: string; field?: string }
export interface PortfolioKind<R extends PortfolioRowBase = PortfolioRowBase> {
  noun: PortfolioNoun; nameField: string; params: ParamSpec;
  sortOptions: { value: string; label: string }[]; groupOptions: GroupOption[]; boardGroupOptions: GroupOption[];
  filters: { product: boolean; organisation: boolean; churned: boolean };
  renewalWindow: RenewalWindow; pulseValueField?: string; churnByModal: boolean;
  fetch(query: string): Promise<PortfolioPage<R>>;
  totalQuery(params: PortfolioParams): string | null;
  churnVisible(params: PortfolioParams): boolean;
  saveStage(row: R, to: LifecycleValue, dispatch: AppDispatch): Promise<unknown>;
  addsTo(stage: LifecycleValue): boolean;
  editable(row: R): boolean;
  href(row: R): string;
  linkState(row: R): unknown;
  subtitle(row: R): SubtitlePart[];
  cardSubtitle(row: R): string;
  status(row: R): string | null;
  renderDetails(props: DetailsProps<R>): ReactNode;
}
export const PortfolioKindContext: React.Context<PortfolioKind>;
export function usePortfolioKind(): PortfolioKind;
export function subtitleText(parts: SubtitlePart[]): string;
// organizationKind.ts
export const ORGANIZATION_KIND: PortfolioKind<PortfolioRow>;
// testKind.ts (test only)
export const WIDGET_KIND: PortfolioKind<PortfolioRow>;
// usePortfolio.ts
export interface PagedState<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters> { data: PortfolioPage<R, F> | null; rows: R[]; … as before }
export function usePagedPortfolio<R, F>(query: string, enabled: boolean, version: number, onLoaded?: (rows: R[]) => void): PagedState<R, F>;
export interface PortfolioState<R = PortfolioRow, F = OrganizationFilters> extends PagedState<R, F> { total: number | null }
export function usePortfolio<R, F>(params: PortfolioParams, version: number, onLoaded?: (rows: R[]) => void, totalVersion?: number): PortfolioState<R, F>;
// usePortfolioParams.ts — unchanged signature; parses with usePortfolioKind().params
```

- [ ] **Step 1: Write the failing test**

Create `src/components/organizations/portfolio/portfolioKind.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { buildPortfolio, initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { ORGANIZATION_KIND } from './organizationKind';
import { PortfolioKindContext, subtitleText, usePortfolioKind, type PortfolioKind } from './portfolioKind';
import { WIDGET_KIND } from './testKind';
import { usePortfolio } from './usePortfolio';
import { usePortfolioParams } from './usePortfolioParams';

const withKind =
  (kind: PortfolioKind, url = '/') =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <PortfolioKindContext.Provider value={kind}>{children}</PortfolioKindContext.Provider>
    </MemoryRouter>
  );

describe('the portfolio kind', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is Organizations unless a page provides another', () => {
    const { result } = renderHook(() => usePortfolioKind());
    expect(result.current).toBe(ORGANIZATION_KIND);
  });

  it('describes an organisation row as the Organizations pages always have', () => {
    expect(ORGANIZATION_KIND.href(pizzaHut)).toBe('/organizations/7');
    expect(ORGANIZATION_KIND.linkState(pizzaHut)).toBeUndefined();
    expect(subtitleText(ORGANIZATION_KIND.subtitle(pizzaHut))).toBe('Carl CSM · Live · Touched 33d ago');
    expect(ORGANIZATION_KIND.subtitle(pizzaHut).map((part) => part.field)).toEqual(['owner', 'lifecycleStage', undefined]);
    expect(ORGANIZATION_KIND.cardSubtitle(pizzaHut)).toBe('Carl CSM');
    expect(ORGANIZATION_KIND.status(pizzaHut)).toBeNull();
    expect(ORGANIZATION_KIND.status(initech)).toBe('Churned');
    expect(ORGANIZATION_KIND.addsTo('churn')).toBe(false);
    expect(ORGANIZATION_KIND.addsTo('live')).toBe(true);
    expect(ORGANIZATION_KIND.churnByModal).toBe(true);
    expect(ORGANIZATION_KIND.renewalWindow).toBe('30');
    expect(ORGANIZATION_KIND.totalQuery(parseParams(new URLSearchParams()))).toBeNull();
    expect(ORGANIZATION_KIND.totalQuery(parseParams(new URLSearchParams('owner=2')))).toBe('limit=1');
    expect(ORGANIZATION_KIND.totalQuery(parseParams(new URLSearchParams('owner=2&include_churned=1')))).toBe(
      'include_churned=1&limit=1',
    );
    expect(ORGANIZATION_KIND.churnVisible(parseParams(new URLSearchParams('lifecycle=churn')))).toBe(true);
    expect(ORGANIZATION_KIND.churnVisible(parseParams(new URLSearchParams()))).toBe(false);
  });

  it('reads through the provided kind: its endpoint and its M probe', async () => {
    const fetchPage = vi.fn(async (query: string) => buildPortfolio(new URLSearchParams(query)));
    const kind: PortfolioKind<PortfolioRow> = { ...WIDGET_KIND, fetch: fetchPage };
    const params = parseParams(new URLSearchParams('search=pizza&group=none'));
    const { result } = renderHook(() => usePortfolio(params, 0), { wrapper: withKind(kind) });
    await waitFor(() => expect(result.current.data?.count).toBe(1));
    expect(fetchPage.mock.calls.map(([query]) => query)).toEqual(
      expect.arrayContaining(['search=pizza&sort=-arr&limit=50', 'limit=1']),
    );
    // M is the book the probe counts (the stub leaves churned Initech out).
    await waitFor(() => expect(result.current.total).toBe(2));
  });

  it("says what failed in the kind's own words", async () => {
    const kind: PortfolioKind<PortfolioRow> = {
      ...WIDGET_KIND,
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const { result } = renderHook(() => usePortfolio(parseParams(new URLSearchParams()), 0), { wrapper: withKind(kind) });
    await waitFor(() => expect(result.current.error).toBe('Could not load widgets.'));
  });

  it("parses the URL with the kind's own parameters", () => {
    const { result } = renderHook(() => usePortfolioParams(), {
      wrapper: withKind(WIDGET_KIND, '/?organisation=7&product=3'),
    });
    expect(result.current.params.organisation).toEqual(['7']);
    expect(result.current.params.product).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/portfolioKind.test.tsx --maxWorkers=2`
Expected: FAIL. `Failed to resolve import "./organizationKind"`.

- [ ] **Step 3: Implement**

Create `src/components/organizations/portfolio/portfolioKind.ts`:

```ts
import { createContext, useContext, type ReactNode } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { GroupOption } from '../../../features/organizations/portfolioGroups';
import type { PortfolioNoun, RenewalWindow } from '../../../features/organizations/portfolioLabels';
import type { ParamSpec, PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioPage, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import type { AppDispatch } from '../../../store';
import { ORGANIZATION_KIND } from './organizationKind';

/** What a kind's opened-row panels are given (Organizations' six, Accounts' four). */
export interface DetailsProps<R extends PortfolioRowBase = PortfolioRowBase> {
  row: R;
  /** The response's currency (the workspace's). */
  currency: CurrencyCode;
  id?: string;
  today?: string;
  onEdit?: (id: number) => void;
  /** One column at every width (the Board's side panel). */
  stacked?: boolean;
}

/** One part of the line under a row's name. `field` marks it for the
 *  kind's field-coverage test. */
export interface SubtitlePart {
  text: string;
  field?: string;
}

/** What one page's portfolio is (spec 2026-09-29, Decisions: "Each page
 *  supplies its own fields, filters and actions"): the endpoint, the URL's
 *  parameters, its words, links and row line, its panels, how a Board move
 *  saves. Members are methods on purpose: method parameters are bivariant,
 *  so an account kind can stand where PortfolioKind<PortfolioRowBase> is
 *  expected. */
export interface PortfolioKind<R extends PortfolioRowBase = PortfolioRowBase> {
  noun: PortfolioNoun;
  /** data-field on a row's name link (the coverage test's id). */
  nameField: string;
  params: ParamSpec;
  sortOptions: { value: string; label: string }[];
  /** The List's Group choices. */
  groupOptions: GroupOption[];
  /** The Board's (no "None"). */
  boardGroupOptions: GroupOption[];
  /** The Filters panel's kind-only sections. */
  filters: { product: boolean; organisation: boolean; churned: boolean };
  /** The Renewing tile's window before one is picked. */
  renewalWindow: RenewalWindow;
  /** data-field on "AI n · CSM n", when the kind's registry names it. */
  pulseValueField?: string;
  /** A move to Churn opens the kind's churn form instead of saving
   *  (Organizations' ChurnOrganizationModal). */
  churnByModal: boolean;
  fetch(query: string): Promise<PortfolioPage<R>>;
  /** The query for M in "N of M", or null with no filter active. */
  totalQuery(params: PortfolioParams): string | null;
  /** Whether this view lists churned records (else the Board's Churn
   *  column is drop-only). */
  churnVisible(params: PortfolioParams): boolean;
  /** Saves one record's stage (a Board move). Rejects with the reason. */
  saveStage(row: R, to: LifecycleValue, dispatch: AppDispatch): Promise<unknown>;
  /** Whether a Board column's "+" adds to this stage. */
  addsTo(stage: LifecycleValue): boolean;
  /** Whether this page can edit or move the record (Edit details, Move to…). */
  editable(row: R): boolean;
  href(row: R): string;
  /** Router state the record's page reads, if any. */
  linkState(row: R): unknown;
  subtitle(row: R): SubtitlePart[];
  /** The Board card's line under the name. */
  cardSubtitle(row: R): string;
  /** A badge beside the name ("Archived", "Churned"), or null. */
  status(row: R): string | null;
  renderDetails(props: DetailsProps<R>): ReactNode;
}

/** The kind the portfolio components show. Organizations is the default,
 *  so its pages and every component rendered on its own read as before; the
 *  Accounts pages provide ACCOUNT_KIND around themselves. */
export const PortfolioKindContext = createContext<PortfolioKind>(ORGANIZATION_KIND);

export function usePortfolioKind(): PortfolioKind {
  return useContext(PortfolioKindContext);
}

/** "Carl CSM · Live · Touched 33d ago": the parts as one line of text. */
export function subtitleText(parts: SubtitlePart[]): string {
  return parts.map((part) => part.text).join(' · ');
}
```

Create `src/components/organizations/portfolio/organizationKind.ts`:

```ts
import { createElement } from 'react';
import { updateCustomer } from '../../../features/customers/customersSlice';
import { fetchPortfolio } from '../../../features/organizations/portfolioApi';
import { PORTFOLIO_FIELDS, SORT_OPTIONS } from '../../../features/organizations/portfolioFields';
import { BOARD_GROUP_OPTIONS, GROUP_OPTIONS } from '../../../features/organizations/portfolioGroups';
import { ORGANIZATION_NOUN } from '../../../features/organizations/portfolioLabels';
import { ORGANIZATION_PARAMS, hasFilters, includesChurned } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { AccountDetails } from './AccountDetails';
import type { PortfolioKind } from './portfolioKind';
import { touchText } from './rowParts';

/** Organizations' portfolio, exactly as its pages have always behaved:
 *  GET /organizations/portfolio/, churned hidden unless asked for, Churn
 *  through its own modal, the six panels, the organization page. */
export const ORGANIZATION_KIND: PortfolioKind<PortfolioRow> = {
  noun: ORGANIZATION_NOUN,
  nameField: 'organization',
  params: ORGANIZATION_PARAMS,
  sortOptions: SORT_OPTIONS,
  groupOptions: GROUP_OPTIONS,
  boardGroupOptions: BOARD_GROUP_OPTIONS,
  filters: { product: true, organisation: false, churned: true },
  renewalWindow: '30',
  churnByModal: true,
  fetch: (query) => fetchPortfolio(query),
  totalQuery: (params) => (hasFilters(params) ? (includesChurned(params) ? 'include_churned=1&limit=1' : 'limit=1') : null),
  churnVisible: (params) => includesChurned(params),
  saveStage: (row, to, dispatch) => dispatch(updateCustomer({ id: row.id, lifecycle_stage: to })).unwrap(),
  // Churn has its own modal, one organisation at a time (ruling R2).
  addsTo: (stage) => stage !== 'churn',
  editable: () => true,
  href: (row) => `/organizations/${row.id}`,
  linkState: () => undefined,
  subtitle: (row) => [
    { text: PORTFOLIO_FIELDS.owner.value(row), field: 'owner' },
    { text: row.lifecycle.label, field: 'lifecycleStage' },
    { text: touchText(row.last_touch_days) },
  ],
  cardSubtitle: (row) => PORTFOLIO_FIELDS.owner.value(row),
  status: (row) => (row.is_archived ? 'Archived' : row.churned ? 'Churned' : null),
  renderDetails: ({ row, id, today, onEdit, stacked }) => createElement(AccountDetails, { row, id, today, onEdit, stacked }),
};
```

Create `src/components/organizations/portfolio/testKind.ts`:

```ts
// Test-only: a made-up third kind ("widgets") over Organizations' rows and
// endpoint, so a test can prove a shared component reads the kind it is
// given rather than anything Organizations-specific.
import { createElement } from 'react';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { ORGANIZATION_KIND } from './organizationKind';
import type { PortfolioKind } from './portfolioKind';

export const WIDGET_KIND: PortfolioKind<PortfolioRow> = {
  ...ORGANIZATION_KIND,
  noun: { one: 'widget', many: 'widgets' },
  nameField: 'widget',
  params: { ...ORGANIZATION_KIND.params, product: false, churned: false, organisation: true },
  sortOptions: [
    { value: 'arr', label: 'ARR' },
    { value: 'name', label: 'Name' },
  ],
  filters: { product: false, organisation: true, churned: false },
  renewalWindow: '90',
  pulseValueField: 'aiPulseValue csmPulseScore',
  churnByModal: false,
  totalQuery: (params) => (params.search || params.organisation?.length ? 'limit=1' : null),
  churnVisible: () => true,
  addsTo: () => true,
  // Initech (id 2) stands in for a record this page cannot save.
  editable: (row) => row.id !== 2,
  href: (row) => `/widgets/${row.id}`,
  linkState: (row) => ({ widget: row.id }),
  subtitle: (row) => [{ text: `Shelf ${row.id}` }, { text: row.lifecycle.label, field: 'lifecycleStage' }],
  cardSubtitle: (row) => `Shelf ${row.id}`,
  status: () => null,
  renderDetails: ({ row, currency, onEdit, stacked }) =>
    createElement(
      'div',
      { 'data-testid': 'widget-details' },
      `Widget ${row.name} in ${currency}${stacked ? ', stacked' : ''}`,
      onEdit ? createElement('button', { type: 'button', onClick: () => onEdit(row.id) }, 'Edit widget') : null,
    ),
};
```

Replace the whole of `src/components/organizations/portfolio/usePortfolio.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type {
  FilterOptions,
  OrganizationFilters,
  PortfolioPage,
  PortfolioRow,
  PortfolioRowBase,
} from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';

export const PAGE_SIZE = 50;
export const SECTION_PAGE_SIZE = 25;

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

type Loaded<R extends PortfolioRowBase, F extends FilterOptions> =
  | { key: string; query: string; data: PortfolioPage<R, F>; rows: R[]; next: string | null }
  | { key: string; error: string };

type MoreState = { key: string; token: number; loading: boolean; error: string | null };

export interface PagedState<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters> {
  /** The latest response. While a new query loads, the previous one stays so
   *  the list does not flash empty. `loading` says it is stale. */
  data: PortfolioPage<R, F> | null;
  rows: R[];
  next: string | null;
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: () => Promise<void>;
  retry: () => void;
  /** The key of the data currently shown (null before any page has landed).
   *  Unlike `rows`, it does not change on a `loadMore` append — only when a
   *  fresh page one lands, including a reload of the same query. */
  loadedKey: string | null;
  /** The query of the data currently shown (null before any page has
   *  landed). Unlike `loadedKey` it ignores the version and retry counters,
   *  so a reload of the same query leaves it unchanged: the signal for
   *  "a different list landed" (the page clears or prunes the selection on it). */
  loadedQuery: string | null;
}

/** One cursor-paged read of the kind's portfolio endpoint (`kind.fetch`).
 *  The frame, each grouped section and each board column is one of these.
 *  Loading is derived from which query the stored answer belongs to, so no
 *  state is set synchronously inside the effect. */
export function usePagedPortfolio<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>(
  query: string,
  enabled: boolean,
  version: number,
  onLoaded?: (rows: R[]) => void,
): PagedState<R, F> {
  const kind = usePortfolioKind();
  const [attempt, setAttempt] = useState(0);
  const key = `${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded<R, F> | null>(null);
  const [moreState, setMoreState] = useState<MoreState | null>(null);
  // A generation counter, bumped every time the fetch effect's cleanup runs
  // (a params/version change, or unmount) — never reset, so it never repeats.
  // The `key` string, by contrast, CAN repeat (a filter changed away and back
  // reproduces the same string) — guarding a `loadMore` by key alone lets an
  // answer abandoned under the first occurrence of that key be mistaken for
  // current when the key recurs (an ABA race). `loadMoreCallRef` holds the
  // generation a `loadMore` call was issued under, or null when none is in
  // flight: a second concurrent call sees it already set and backs off, and
  // a call whose generation no longer matches `generationRef` knows its
  // answer is stale and drops it — never appended, never surfaced as an
  // error, and never able to clear a different (later) call's own guard.
  const generationRef = useRef(0);
  const loadMoreCallRef = useRef<number | null>(null);
  // The latest callback, so a caller passing an inline function does not
  // refetch on every render.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (kind.fetch(query) as Promise<PortfolioPage<R, F>>).then(
      (data) => {
        if (cancelled) return;
        setLoaded({ key, query, data, rows: data.results, next: data.next_cursor });
        onLoadedRef.current?.(data.results);
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ key, error: errorMessage(err, `Could not load ${kind.noun.many}.`) });
      },
    );
    return () => {
      cancelled = true;
      generationRef.current += 1;
      loadMoreCallRef.current = null;
      // Any in-flight (or just-finished) load-more belonged to the
      // generation that's ending — its answer, whenever it lands, is
      // dropped anyway (below), but the spinner must not wait for that to
      // clear it: nothing about the new generation has asked for a page two
      // yet.
      setMoreState(null);
    };
  }, [enabled, key, query, kind]);

  const current = loaded && 'data' in loaded ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current || current.key !== key || !current.next || loadMoreCallRef.current !== null) return;
    const token = generationRef.current;
    loadMoreCallRef.current = token;
    const cursor = current.next;
    setMoreState({ key, token, loading: true, error: null });
    try {
      const page = (await kind.fetch(`${query}&cursor=${encodeURIComponent(cursor)}`)) as PortfolioPage<R, F>;
      if (generationRef.current !== token) {
        // Superseded — drop the answer. Never clear a newer call's own
        // moreState; only clear if it's still (somehow) this stale one's.
        setMoreState((prev) => (prev && prev.token === token ? null : prev));
        return;
      }
      setLoaded((prev) =>
        prev && 'data' in prev && prev.key === key
          ? { ...prev, rows: [...prev.rows, ...page.results], next: page.next_cursor }
          : prev,
      );
      onLoadedRef.current?.(page.results);
      setMoreState({ key, token, loading: false, error: null });
    } catch (err) {
      if (generationRef.current !== token) {
        // Superseded — never surface a stale error.
        setMoreState((prev) => (prev && prev.token === token ? null : prev));
        return;
      }
      setMoreState({ key, token, loading: false, error: errorMessage(err, `Could not load more ${kind.noun.many}.`) });
    } finally {
      if (loadMoreCallRef.current === token) loadMoreCallRef.current = null;
    }
  }, [current, key, query, kind]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    data: current?.data ?? null,
    rows: current?.rows ?? [],
    next: current?.next ?? null,
    loading: enabled && loaded?.key !== key,
    error: loaded && 'error' in loaded && loaded.key === key ? loaded.error : null,
    loadingMore: moreState?.key === key ? moreState.loading : false,
    moreError: moreState?.key === key ? moreState.error : null,
    loadMore,
    retry,
    loadedKey: current?.key ?? null,
    loadedQuery: current?.query ?? null,
  };
}

export interface PortfolioState<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>
  extends PagedState<R, F> {
  /** M in "N of M": the whole visible book, in the view's scope (the kind's
   *  `totalQuery`). Null when no filter is active (the page then says
   *  "N organizations"). Never less than N (the frame's own filtered count)
   *  even if the probe's answer is momentarily stale. */
  total: number | null;
}

/** `totalVersion` reloads the M probe (default: `version`). The Board passes
 *  a smaller one that skips its lifecycle moves, which can't change M. */
export function usePortfolio<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>(
  params: PortfolioParams,
  version: number,
  onLoaded?: (rows: R[]) => void,
  totalVersion: number = version,
): PortfolioState<R, F> {
  const kind = usePortfolioKind();
  const grouped = params.group !== '';
  // Grouped, the frame only needs summary, groups, filters, count and
  // currency; each section reads its own rows (plan pre-flight #6). Its own
  // limit=1 read is never paged from here — grouped paging happens per
  // section — so `next`/`loadMore` are suppressed below regardless of what
  // the frame response implies.
  const frame = usePagedPortfolio<R, F>(
    toApiQuery(params, { limit: String(grouped ? 1 : PAGE_SIZE) }),
    true,
    version,
    grouped ? undefined : onLoaded,
  );
  const noopLoadMore = useCallback(async () => {}, []);

  const probeQuery = kind.totalQuery(params);
  const probeKey = probeQuery ? `${probeQuery}#${totalVersion}` : null;
  const [probe, setProbe] = useState<{ key: string; count: number } | null>(null);

  useEffect(() => {
    if (!probeQuery || !probeKey) return;
    let cancelled = false;
    kind.fetch(probeQuery).then(
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
  }, [probeQuery, probeKey, kind]);

  const rawTotal = probeKey && probe?.key === probeKey ? probe.count : null;

  return {
    ...frame,
    rows: grouped ? [] : frame.rows,
    next: grouped ? null : frame.next,
    loadMore: grouped ? noopLoadMore : frame.loadMore,
    total: rawTotal === null ? null : Math.max(rawTotal, frame.data?.count ?? 0),
  };
}
```

Replace the whole of `src/components/organizations/portfolio/usePortfolioParams.ts` with:

```ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_GROUP,
  EMPTY_FILTERS,
  parseParams,
  toUrlSearch,
  type PortfolioParams,
} from '../../../features/organizations/portfolioParams';
import type { GroupKey } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';

/** The portfolio's URL state, shared by the List and the Board, parsed with
 *  the kind's own parameters (its sorts, groups and filters). An absent
 *  `group` is the route's `defaultGroup` (health on the List, lifecycle on
 *  the Board). A group the URL already names stays in it, even the route's
 *  own default, so a pick carries across the tabs. Updates replace the
 *  history entry, like the dashboard's filters, so Back leaves the page
 *  rather than undoing a chip. */
export function usePortfolioParams(defaultGroup: GroupKey = DEFAULT_GROUP) {
  const [search, setSearch] = useSearchParams();
  const spec = usePortfolioKind().params;
  const params = useMemo(() => parseParams(search, defaultGroup, spec), [search, defaultGroup, spec]);

  const update = useCallback(
    (patch: Partial<PortfolioParams>) => {
      setSearch(
        (prev) => toUrlSearch({ ...parseParams(prev, defaultGroup, spec), ...patch }, defaultGroup, prev),
        { replace: true },
      );
    },
    [setSearch, defaultGroup, spec],
  );

  const clearFilters = useCallback(() => update(EMPTY_FILTERS), [update]);

  return { params, update, clearFilters };
}
```

- [ ] **Step 4: Run the new test, every Organizations test, and the types**

Run: `npx vitest run src/components/organizations/portfolio/portfolioKind.test.tsx --maxWorkers=2`
Expected: PASS (5 tests).

Run: `npx vitest run src/features/organizations src/components/organizations src/pages/organizations src/e2e --maxWorkers=2`
Expected: every file passes, 0 failed.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/portfolioKind.ts src/components/organizations/portfolio/organizationKind.ts src/components/organizations/portfolio/testKind.ts src/components/organizations/portfolio/usePortfolio.ts src/components/organizations/portfolio/usePortfolioParams.ts src/components/organizations/portfolio/portfolioKind.test.tsx
git commit -m "$(cat <<'EOF'
refactor(portfolio): a portfolio kind the shared hooks read, Organizations by default

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The row, the sheet, the side panel and the sections read the kind

**Files:**
- Modify: `src/components/organizations/portfolio/rowParts.tsx`
- Modify: `src/components/organizations/portfolio/AccountRow.tsx`
- Modify: `src/components/organizations/portfolio/AccountSheet.tsx` (whole file)
- Modify: `src/components/organizations/portfolio/AccountSidePanel.tsx` (whole file)
- Modify: `src/components/organizations/portfolio/PortfolioSections.tsx`
- Test: `src/components/organizations/portfolio/kindRows.test.tsx`

**Interfaces:**
- Consumes (Task 2): `usePortfolioKind`, `subtitleText`, `PortfolioKindContext`, `WIDGET_KIND`, `PortfolioState<R, F>`, `usePagedPortfolio<R, F>`.
- Produces:

```ts
// rowParts.tsx
export function SubtitleLine(props: { parts: { text: string; field?: string }[] }): JSX.Element;
export function PulsePair(props: { pulse: PortfolioRowBase['pulse']; className?: string; valueField?: string }): JSX.Element;
// AccountRow.tsx
export interface AccountRowProps<R extends PortfolioRowBase = PortfolioRow> { row: R; …; onToggleOpen: (row: R) => void }
export function AccountRow<R extends PortfolioRowBase>(props: AccountRowProps<R>): JSX.Element;
// AccountSheet.tsx / AccountSidePanel.tsx
export function AccountSheet<R extends PortfolioRowBase>(props: { row: R; currency: CurrencyCode; onClose: () => void; onEdit?: (id: number) => void }): JSX.Element;
export function AccountSidePanel<R extends PortfolioRowBase>(props: same): JSX.Element;
// PortfolioSections.tsx
export type PortfolioRowRenderer<R extends PortfolioRowBase = PortfolioRow> = (row: R, state: { loading: boolean }) => ReactNode;
export function PortfolioSections<R extends PortfolioRowBase>(props: { …; portfolio: PortfolioState<R, FilterOptions>; renderRow: PortfolioRowRenderer<R>; onRowsLoaded: (rows: R[]) => void; … }): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `src/components/organizations/portfolio/kindRows.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio, initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { AccountRow } from './AccountRow';
import { AccountSheet } from './AccountSheet';
import { AccountSidePanel } from './AccountSidePanel';
import { PortfolioKindContext } from './portfolioKind';
import { PortfolioSections } from './PortfolioSections';
import { WIDGET_KIND } from './testKind';
import type { PortfolioState } from './usePortfolio';

function State() {
  const location = useLocation();
  return <p data-testid="state">{JSON.stringify(location.state)}</p>;
}

function inWidgets(node: ReactNode) {
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={WIDGET_KIND}>
        <Routes>
          <Route path="/" element={node} />
          <Route path="/widgets/:id" element={<State />} />
        </Routes>
      </PortfolioKindContext.Provider>
    </MemoryRouter>,
  );
}

function state(data: PortfolioState['data'], rows: PortfolioState['rows'] = [], next: string | null = null): PortfolioState {
  return {
    data,
    rows,
    next,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: async () => {},
    retry: vi.fn(),
    loadedKey: 'k',
    loadedQuery: 'q',
    total: null,
  };
}

const rowProps = {
  currency: 'USD' as const,
  pins: [],
  isSm: true,
  selecting: false,
  selected: false,
  open: false,
  onToggleSelect: vi.fn(),
  onLongPress: vi.fn(),
  onToggleOpen: vi.fn(),
};

describe('the row, sheet, side panel and sections read the kind', () => {
  it("links the row to the kind's page with its state, and shows the kind's line and no status", async () => {
    inWidgets(
      <ul>
        <AccountRow row={initech} {...rowProps} />
      </ul>,
    );
    const link = screen.getByRole('link', { name: 'Initech' });
    expect(link).toHaveAttribute('href', '/widgets/2');
    expect(link).toHaveAttribute('data-field', 'widget');
    expect(document.querySelector('[data-row-id="2"] p')).toHaveTextContent('Shelf 2 · Churn');
    expect(document.querySelector('[data-row-id="2"] [data-field="lifecycleStage"]')).toHaveTextContent('Churn');
    expect(screen.queryByText('Churned')).not.toBeInTheDocument();
    expect(document.querySelector('[data-field~="aiPulseValue"]')).toHaveTextContent('AI 2 · CSM 1');
    await userEvent.click(link);
    expect(screen.getByTestId('state')).toHaveTextContent('{"widget":2}');
  });

  it("shows the kind's details in the sheet, links to the kind's page, and offers Edit where the kind allows", () => {
    inWidgets(<AccountSheet row={pizzaHut} currency="EUR" onClose={vi.fn()} onEdit={vi.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'Pizza Hut' });
    expect(sheet).toHaveTextContent('Shelf 7 · Live');
    expect(within(sheet).getByTestId('widget-details')).toHaveTextContent('Widget Pizza Hut in EUR');
    expect(within(sheet).getByRole('button', { name: 'Edit widget' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open widget page' })).toHaveAttribute('href', '/widgets/7');
  });

  it('stacks the side panel and hides Edit where the kind does not allow it', () => {
    inWidgets(<AccountSidePanel row={initech} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} />);
    const panel = screen.getByRole('complementary', { name: 'Initech' });
    expect(panel).toHaveTextContent('Shelf 2 · Churn');
    expect(within(panel).getByTestId('widget-details')).toHaveTextContent('Widget Initech in USD, stacked');
    expect(within(panel).queryByRole('button', { name: 'Edit widget' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open widget page' })).toHaveAttribute('href', '/widgets/2');
  });

  it("speaks in the kind's words when the list is empty, loading or has more", () => {
    const params = parseParams(new URLSearchParams('group=none'));
    const common = {
      params,
      version: 0,
      currency: 'USD' as const,
      filtered: false,
      onRowsLoaded: vi.fn(),
      onClearFilters: vi.fn(),
      onAdd: vi.fn(),
      renderRow: (row: typeof pizzaHut) => <li key={row.id}>{row.name}</li>,
    };
    const empty = inWidgets(<PortfolioSections {...common} portfolio={state(buildPortfolio(new URLSearchParams('search=zzz')))} />);
    expect(screen.getByText('No widgets yet')).toBeInTheDocument();
    expect(screen.getByText('Add an widget to start your portfolio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    empty.unmount();

    const loading = inWidgets(<PortfolioSections {...common} portfolio={state(null)} />);
    expect(screen.getByRole('status', { name: 'Loading widgets' })).toBeInTheDocument();
    loading.unmount();

    inWidgets(
      <PortfolioSections
        {...common}
        portfolio={state(buildPortfolio(new URLSearchParams('search=pizza')), [pizzaHut], 'next')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Widgets list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more widgets' })).toBeInTheDocument();
  });
});
```

(The empty state's "Add an widget" is the fake kind's grammar, not a typo to fix: both real nouns, "organization" and "account", take "an".)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/kindRows.test.tsx --maxWorkers=2`
Expected: FAIL. The first test finds `href="/organizations/2"`, not `/widgets/2`.

- [ ] **Step 3: Implement**

`rowParts.tsx`, five edits:

(a) Replace

```ts
import { HEALTH_COLORS } from '../../../pages/dashboard/shared/chartPalette';
```

with

```ts
import { Fragment } from 'react';
import { HEALTH_COLORS } from '../../../pages/dashboard/shared/chartPalette';
```

(b) Replace `import type { HealthBand, PortfolioRow } from '../../../features/organizations/portfolioTypes';` with `import type { HealthBand, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';`

(c) Replace `export function RenewalRunway({ renewal, className = '' }: { renewal: PortfolioRow['renewal']; className?: string }) {` with `export function RenewalRunway({ renewal, className = '' }: { renewal: PortfolioRowBase['renewal']; className?: string }) {`

(d) Replace

```tsx
export function PulsePair({ pulse, className = '' }: { pulse: PortfolioRow['pulse']; className?: string }) {
  const show = (n: number | null) => (n == null ? '—' : String(n));
  return (
    <span className={`flex-col w-36 shrink-0 ${className}`}>
      <span className="font-mono-brand tabular-nums text-[13px] text-ink">
```

with

```tsx
export function PulsePair({
  pulse,
  className = '',
  valueField,
}: {
  pulse: PortfolioRowBase['pulse'];
  className?: string;
  /** Marks "AI n · CSM n" for a kind whose registry names those two values
   *  (Accounts: "aiPulseValue csmPulseScore"). */
  valueField?: string;
}) {
  const show = (n: number | null) => (n == null ? '—' : String(n));
  return (
    <span className={`flex-col w-36 shrink-0 ${className}`}>
      <span data-field={valueField} className="font-mono-brand tabular-nums text-[13px] text-ink">
```

(e) Replace `export function SignalTag({ signal }: { signal: PortfolioRow['signal'] }) {` with `export function SignalTag({ signal }: { signal: PortfolioRowBase['signal'] }) {`, then append to the end of the file:

```tsx

/** The line under a name: the kind's parts joined by " · ", each part that
 *  names a field marked for the kind's field-coverage test. */
export function SubtitleLine({ parts }: { parts: { text: string; field?: string }[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ' · ' : null}
          {part.field ? <span data-field={part.field}>{part.text}</span> : part.text}
        </Fragment>
      ))}
    </>
  );
}
```

`AccountRow.tsx`, nine edits:

(a) Replace

```ts
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine, touchText } from './rowParts';
```

with

```ts
import type { PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, SubtitleLine, TrendLine } from './rowParts';
```

(b) Replace

```ts
export interface AccountRowProps {
  row: PortfolioRow;
```

with

```ts
export interface AccountRowProps<R extends PortfolioRowBase = PortfolioRow> {
  row: R;
```

(c) Replace `  onToggleOpen: (row: PortfolioRow) => void;` with `  onToggleOpen: (row: R) => void;`

(d) Replace `export function AccountRow({` with `export function AccountRow<R extends PortfolioRowBase>({`

(e) Replace

```ts
}: AccountRowProps) {
  const timer = useRef<number | null>(null);
```

with

```ts
}: AccountRowProps<R>) {
  const kind = usePortfolioKind();
  const timer = useRef<number | null>(null);
```

(f) Replace `  const status = row.is_archived ? 'Archived' : row.churned ? 'Churned' : null;` with `  const status = kind.status(row);`

(g) Replace

```tsx
            <Link
              to={`/organizations/${row.id}`}
              onClick={(event) => event.stopPropagation()}
              data-field="organization"
```

with

```tsx
            <Link
              to={kind.href(row)}
              state={kind.linkState(row)}
              onClick={(event) => event.stopPropagation()}
              data-field={kind.nameField}
```

(h) Replace

```tsx
          <p className="truncate text-[11px] text-ink-muted">
            <span data-field="owner">{PORTFOLIO_FIELDS.owner.value(row)}</span> ·{' '}
            <span data-field="lifecycleStage">{row.lifecycle.label}</span> · {touchText(row.last_touch_days)}
          </p>
```

with

```tsx
          <p className="truncate text-[11px] text-ink-muted">
            <SubtitleLine parts={kind.subtitle(row)} />
          </p>
```

(i) Replace

```tsx
              const field = PORTFOLIO_FIELDS[id];
              return (
                <span key={id} data-pin={id} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-muted">
                  {field.short} <span className="font-mono-brand tabular-nums text-ink">{field.value(row)}</span>
```

with

```tsx
              // Pins are Organizations' own (the Accounts pages pass none),
              // so a pinned row is an organisation.
              const field = PORTFOLIO_FIELDS[id];
              return (
                <span key={id} data-pin={id} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-muted">
                  {field.short} <span className="font-mono-brand tabular-nums text-ink">{field.value(row as unknown as PortfolioRow)}</span>
```

and replace `        {isSm ? <PulsePair pulse={row.pulse} /> : null}` with `        {isSm ? <PulsePair pulse={row.pulse} valueField={kind.pulseValueField} /> : null}`.

Replace the whole of `AccountSheet.tsx` with:

```tsx
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { trapTab } from '../../../lib/focusTrap';
import { subtitleText, usePortfolioKind } from './portfolioKind';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine } from './rowParts';
import { FOCUS } from './styles';

/** The opened row on phones (spec §1 "Phones"): a modal bottom sheet with
 *  the row's signals on top and the kind's panels below (Organizations' six,
 *  Accounts' four). Focus moves in, Tab is trapped, and Escape or Close
 *  returns focus to whatever opened it. */
export function AccountSheet<R extends PortfolioRowBase>({
  row,
  currency,
  onClose,
  onEdit,
}: {
  row: R;
  currency: CurrencyCode;
  onClose: () => void;
  onEdit?: (id: number) => void;
}) {
  const kind = usePortfolioKind();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // A caller re-rendering with a brand new inline `onClose` (the common
  // case) must not re-run the effect below — that would re-focus Close and
  // steal focus back from wherever the visitor has since tabbed to. Kept in
  // a ref so Escape always calls whatever `onClose` is current.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    // A background body scrolling under a fixed sheet is the one thing that
    // makes a bottom sheet feel broken on a phone — lock it while open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      // Escape belongs to whatever is on top: a modal opened from the sheet
      // (Edit details) holds focus outside it, or a handler already took it.
      if (event.key === 'Escape' && !event.defaultPrevented) {
        const target = event.target as Node | null;
        if (target === document.body || (target && ref.current?.contains(target))) onCloseRef.current();
      }
      if (event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
    // Deliberately once on mount (see onCloseRef above) — not keyed on
    // `onClose`.
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
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
            <p className="truncate text-[11px] text-ink-muted">{subtitleText(kind.subtitle(row))}</p>
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
        {kind.renderDetails({ row, currency, onEdit: kind.editable(row) ? onEdit : undefined })}
        <div className="px-3 pb-4">
          <Link
            to={kind.href(row)}
            state={kind.linkState(row)}
            className={`flex min-h-11 items-center justify-center rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-hover ${FOCUS}`}
          >
            {`Open ${kind.noun.one} page`}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

Replace the whole of `AccountSidePanel.tsx` with:

```tsx
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { DETAILS_PANEL_ID } from './BoardCard';
import { subtitleText, usePortfolioKind } from './portfolioKind';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine } from './rowParts';
import { FOCUS } from './styles';

/** The Board's opened card from `sm` (owner decision 2026-09-26): the
 *  row's signals and the kind's panels in a column beside the board, which
 *  stays in place and usable. It is not modal. Focus moves to Close on open
 *  and back to the opener on close, and Escape inside the panel closes it.
 *  A `bg-surface` item on the canvas, beside the columns, never inside one. */
export function AccountSidePanel<R extends PortfolioRowBase>({
  row,
  currency,
  onClose,
  onEdit,
}: {
  row: R;
  currency: CurrencyCode;
  onClose: () => void;
  onEdit?: (id: number) => void;
}) {
  const kind = usePortfolioKind();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Once on mount: switching to another card keeps the panel mounted and
  // must not steal focus again.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape inside the panel closes it. Only keys pressed inside the aside
  // reach this handler (the DOM scopes it), which is what keeps a card's
  // Move to… menu, outside the panel, from closing it too.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <aside
      id={DETAILS_PANEL_ID}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="flex w-[26rem] shrink-0 flex-col overflow-y-auto rounded-xl bg-surface"
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line-subtle bg-surface px-3 py-3">
        <HealthRing score={row.health.score} category={row.health.category} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-[15px] font-semibold text-ink">
            {row.name}
          </h2>
          <p className="truncate text-[11px] text-ink-muted">{subtitleText(kind.subtitle(row))}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className={`inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
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
      {kind.renderDetails({ row, currency, onEdit: kind.editable(row) ? onEdit : undefined, stacked: true })}
      <div className="px-3 pb-4">
        <Link
          to={kind.href(row)}
          state={kind.linkState(row)}
          className={`flex min-h-9 items-center justify-center rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-hover ${FOCUS}`}
        >
          {`Open ${kind.noun.one} page`}
        </Link>
      </div>
    </aside>
  );
}
```

`PortfolioSections.tsx`, eleven edits:

(a) Replace

```ts
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioGroup, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { ErrorState } from '../../../pages/dashboard/shared/DataState';
import { SECTION_PAGE_SIZE, usePagedPortfolio, type PortfolioState } from './usePortfolio';
```

with

```ts
import { capitalise } from '../../../features/organizations/portfolioLabels';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions, PortfolioGroup, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { ErrorState } from '../../../pages/dashboard/shared/DataState';
import { usePortfolioKind } from './portfolioKind';
import { SECTION_PAGE_SIZE, usePagedPortfolio, type PortfolioState } from './usePortfolio';
```

(b) Replace `export type PortfolioRowRenderer = (row: PortfolioRow, state: { loading: boolean }) => ReactNode;` with `export type PortfolioRowRenderer<R extends PortfolioRowBase = PortfolioRow> = (row: R, state: { loading: boolean }) => ReactNode;`

(c) Replace

```tsx
export function RowSkeleton({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Loading organizations">
```

with

```tsx
export function RowSkeleton({ count }: { count: number }) {
  const kind = usePortfolioKind();
  return (
    <div role="status" aria-label={`Loading ${kind.noun.many}`}>
```

(d) Replace `function Section({` with `function Section<R extends PortfolioRowBase>({`

(e) Replace

```ts
  renderRow: PortfolioRowRenderer;
  onRowsLoaded: (rows: PortfolioRow[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
```

with

```ts
  renderRow: PortfolioRowRenderer<R>;
  onRowsLoaded: (rows: R[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
```

(f) Replace

```ts
  const page = usePagedPortfolio(
    toApiQuery(params, { group_value: group.key, limit: String(SECTION_PAGE_SIZE) }),
```

with

```ts
  const page = usePagedPortfolio<R, FilterOptions>(
    toApiQuery(params, { group_value: group.key, limit: String(SECTION_PAGE_SIZE) }),
```

(g) Replace `export function PortfolioSections({` with `export function PortfolioSections<R extends PortfolioRowBase>({`

(h) Replace

```ts
  portfolio: PortfolioState;
  currency: CurrencyCode;
  filtered: boolean;
  renderRow: PortfolioRowRenderer;
```

with

```ts
  portfolio: PortfolioState<R, FilterOptions>;
  currency: CurrencyCode;
  filtered: boolean;
  renderRow: PortfolioRowRenderer<R>;
```

(i) Replace

```ts
  onRowsLoaded: (rows: PortfolioRow[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  const { data, error } = portfolio;
```

with

```ts
  onRowsLoaded: (rows: R[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  const kind = usePortfolioKind();
  const { data, error } = portfolio;
```

(j) Replace

```tsx
        title="No organizations match these filters"
```

with

```tsx
        title={`No ${kind.noun.many} match these filters`}
```

and replace

```tsx
        title="No organizations yet"
        detail="Add an organization to start your portfolio."
```

with

```tsx
        title={`No ${kind.noun.many} yet`}
        detail={`Add an ${kind.noun.one} to start your portfolio.`}
```

and replace the line `            Add organization` with `            {`Add ${kind.noun.one}`}`.

(k) Replace `        <h2 className="sr-only">Organizations list</h2>` with `        <h2 className="sr-only">{`${capitalise(kind.noun.many)} list`}</h2>`, and replace `          label="Show more organizations"` with ``          label={`Show more ${kind.noun.many}`}``.

- [ ] **Step 4: Run the new test, every Organizations test, and the types**

Run: `npx vitest run src/components/organizations/portfolio/kindRows.test.tsx --maxWorkers=2`
Expected: PASS (4 tests).

Run: `npx vitest run src/features/organizations src/components/organizations src/pages/organizations src/e2e --maxWorkers=2`
Expected: every file passes, 0 failed. In particular `fieldCoverage.test.tsx` still finds `organization`, `owner`, `lifecycleStage`, `pulse` and `aiPulseScore` once each, and `AccountSidePanel.test.tsx` still finds "Carl CSM · Live · Touched 33d ago" as one text.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/rowParts.tsx src/components/organizations/portfolio/AccountRow.tsx src/components/organizations/portfolio/AccountSheet.tsx src/components/organizations/portfolio/AccountSidePanel.tsx src/components/organizations/portfolio/PortfolioSections.tsx src/components/organizations/portfolio/kindRows.test.tsx
git commit -m "$(cat <<'EOF'
refactor(portfolio): the row, sheet, side panel and sections read the kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The Board reads the kind

**Files:**
- Modify: `src/components/organizations/portfolio/boardMove.ts`
- Modify: `src/components/organizations/portfolio/useBoardMove.ts` (whole file)
- Modify: `src/components/organizations/portfolio/BoardCard.tsx`
- Modify: `src/components/organizations/portfolio/BoardColumn.tsx`
- Modify: `src/components/organizations/portfolio/PortfolioBoard.tsx`
- Test: `src/components/organizations/portfolio/kindBoard.test.tsx`

**Interfaces:**
- Consumes (Tasks 2–3): `usePortfolioKind`, `PortfolioKindContext`, `WIDGET_KIND`, `PortfolioState<R, F>`, `usePagedPortfolio<R, F>`.
- Produces:

```ts
// boardMove.ts
export interface BoardMove<R extends PortfolioRowBase = PortfolioRow> { token: number; row: R; from: LifecycleValue; to: LifecycleValue; saved?: boolean }
export function withMovedRow<R extends PortfolioRowBase>(rows: R[], key: string, move: BoardMove<R> | null): R[];
// useBoardMove.ts
export interface BoardMoveState<R extends PortfolioRowBase = PortfolioRow> { move: BoardMove<R> | null; saving; busy; notice; error; moveTo: (row: R, to: LifecycleValue) => void; dismissError; settle; reset }
export function useBoardMove<R extends PortfolioRowBase = PortfolioRow>(args: { onSaved: (move: BoardMove<R>) => void; onChurn?: (row: R) => void }): BoardMoveState<R>;
// BoardCard.tsx, BoardColumn.tsx, PortfolioBoard.tsx: props generic over R (default PortfolioRow);
// PortfolioBoardProps<R>.onShowChurned and BoardColumnProps<R>.onShowChurned become optional.
```

- [ ] **Step 1: Write the failing test**

Create `src/components/organizations/portfolio/kindBoard.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../../features/customers/customersSlice';
import { BOARD_GROUP, boardParams, parseParams, toApiQuery } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { buildPortfolio, globex, initech, pizzaHut, stubPortfolio } from '../../../features/organizations/testPortfolio';
import { PortfolioBoard, type PortfolioBoardProps } from './PortfolioBoard';
import { PortfolioKindContext, type PortfolioKind } from './portfolioKind';
import { WIDGET_KIND } from './testKind';
import { useBoardMove } from './useBoardMove';
import type { PortfolioState } from './usePortfolio';

// Initech sits in Churn but is not churned, so the stub lists it as the
// accounts backend would list any Churn-stage record.
const initechInChurn: PortfolioRow = { ...initech, churned: false };
const ROWS = [pizzaHut, globex, initechInChurn];
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

function renderWidgetBoard(rows: PortfolioRow[], overrides: Partial<PortfolioBoardProps> = {}) {
  const params = boardParams(parseParams(new URLSearchParams(), BOARD_GROUP, WIDGET_KIND.params));
  const query = toApiQuery(params, { limit: '1' });
  const portfolio: PortfolioState = {
    data: buildPortfolio(new URLSearchParams(query), rows),
    rows: [],
    next: null,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: async () => {},
    retry: vi.fn(),
    loadedKey: `${query}#0#0`,
    loadedQuery: query,
    total: null,
  };
  const props: PortfolioBoardProps = {
    params,
    portfolio,
    version: 0,
    columnBumps: {},
    currency: 'USD',
    isSm: true,
    filtered: false,
    move: null,
    saving: false,
    openId: null,
    onOpen: vi.fn(),
    onMove: vi.fn(),
    onRowsLoaded: vi.fn(),
    onClearFilters: vi.fn(),
    onAdd: vi.fn(),
    onMoveSettled: vi.fn(),
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={WIDGET_KIND}>
        <PortfolioBoard {...props} />
      </PortfolioKindContext.Provider>
    </MemoryRouter>,
  );
}

function setupMove(saveStage: PortfolioKind<PortfolioRow>['saveStage']) {
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onSaved = vi.fn();
  const onChurn = vi.fn();
  const kind: PortfolioKind<PortfolioRow> = { ...WIDGET_KIND, saveStage };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <PortfolioKindContext.Provider value={kind}>{children}</PortfolioKindContext.Provider>
    </Provider>
  );
  const hook = renderHook(() => useBoardMove({ onSaved, onChurn }), { wrapper });
  return { ...hook, onSaved, onChurn };
}

describe('the Board reads the kind', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists Churn like any stage when the kind shows it, with a "+" in its words', async () => {
    stubPortfolio({ rows: ROWS });
    renderWidgetBoard(ROWS);
    expect(await within(column('churn')).findByRole('link', { name: 'Initech' })).toHaveAttribute('href', '/widgets/2');
    expect(within(column('churn')).getByRole('button', { name: 'Add widget to Churn' })).toBeInTheDocument();
    expect(screen.queryByText('Churned accounts are hidden.')).not.toBeInTheDocument();
    expect(within(column('onboarding')).getByText('No widgets in Onboarding.')).toBeInTheDocument();
  });

  it("shows the kind's card line, and no Move to… on a record the kind cannot save", async () => {
    stubPortfolio({ rows: ROWS });
    renderWidgetBoard(ROWS);
    await within(column('live')).findByRole('link', { name: 'Pizza Hut' });
    expect(within(card(7)).getByText('Shelf 7')).toBeInTheDocument();
    expect(within(card(7)).getByRole('button', { name: 'Move Pizza Hut to…' })).toBeInTheDocument();
    await within(column('churn')).findByRole('link', { name: 'Initech' });
    expect(within(card(2)).queryByRole('button', { name: 'Move Initech to…' })).not.toBeInTheDocument();
    expect(card(2)).toHaveAttribute('draggable', 'false');
  });

  it("says there is nothing yet in the kind's words", () => {
    stubPortfolio({ rows: [] });
    renderWidgetBoard([]);
    expect(screen.getByText('No widgets yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
  });

  it('saves a move to Churn like any other stage when the kind has no churn form', async () => {
    const saveStage = vi.fn(async () => undefined);
    const { result, onChurn, onSaved } = setupMove(saveStage);
    act(() => result.current.moveTo(pizzaHut, 'churn'));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(saveStage).toHaveBeenCalledWith(pizzaHut, 'churn', expect.any(Function));
    expect(onChurn).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ from: 'live', to: 'churn' }));
    expect(result.current.notice).toBe('Moved Pizza Hut to Churn.');
  });

  it("rolls back in the kind's words when the save fails without a reason", async () => {
    const { result } = setupMove(
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    await waitFor(() => expect(result.current.error).toBe("Couldn't move Pizza Hut to Adoption. Could not update widget."));
    expect(result.current.move).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/kindBoard.test.tsx --maxWorkers=2`
Expected: FAIL. The churn column is drop-only ("Churned accounts are hidden."), the links point at `/organizations/…`, and the move to Churn calls `onChurn`.

- [ ] **Step 3: Implement**

`boardMove.ts`, four edits:

(a) Replace

```ts
import type {
  GroupKey,
  LifecycleValue,
  PortfolioGroup,
  PortfolioRow,
} from '../../../features/organizations/portfolioTypes';
```

with

```ts
import type {
  GroupKey,
  LifecycleValue,
  PortfolioGroup,
  PortfolioRow,
  PortfolioRowBase,
} from '../../../features/organizations/portfolioTypes';
```

(b) Replace

```ts
export interface BoardMove {
  token: number;
  row: PortfolioRow;
```

with

```ts
export interface BoardMove<R extends PortfolioRowBase = PortfolioRow> {
  token: number;
  row: R;
```

(c) Replace `export function withMove(spec: BoardColumnSpec, move: BoardMove | null): BoardColumnSpec {` with `export function withMove(spec: BoardColumnSpec, move: BoardMove<PortfolioRowBase> | null): BoardColumnSpec {`

(d) Replace `export function withMovedRow(rows: PortfolioRow[], key: string, move: BoardMove | null): PortfolioRow[] {` with `export function withMovedRow<R extends PortfolioRowBase>(rows: R[], key: string, move: BoardMove<R> | null): R[] {`

Replace the whole of `useBoardMove.ts` with:

```ts
import { useCallback, useRef, useState } from 'react';
import { useAppDispatch } from '../../../hooks';
import { LIFECYCLE_LABELS } from '../../../features/customers/formatters';
import type { LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import type { BoardMove } from './boardMove';
import { usePortfolioKind } from './portfolioKind';

export interface BoardMoveState<R extends PortfolioRowBase = PortfolioRow> {
  /** The current move. It shows at once, is marked `saved` when the save
   *  succeeds, and stays until the board reports that every reload it
   *  triggered has landed (`settle`), so a column that remounts later never
   *  replays it. Null after a failure, so the card goes back. */
  move: BoardMove<R> | null;
  /** The save is in flight. */
  saving: boolean;
  /** A move is saving or settling. Moving is off until it clears: one at a
   *  time, so a second move can't drop the first card's guess before its
   *  fresh pages land. */
  busy: boolean;
  /** "Moved Pizza Hut to Adoption.", for a polite live region. */
  notice: string | null;
  /** The failure, ending with the server's reason. */
  error: string | null;
  moveTo: (row: R, to: LifecycleValue) => void;
  dismissError: () => void;
  /** The move `token`'s reloads have all landed: forget it. */
  settle: (token: number) => void;
  /** Forget the move whatever it is (a different list landed). */
  reset: () => void;
}

/** Moving one record between lifecycle columns (owner decisions
 *  2026-09-26). The move is optimistic and one at a time. It saves through
 *  the kind's single-record update (`kind.saveStage`: the customer PATCH on
 *  Organizations, which applies the archive gate, the inactive-owner rule
 *  and every other update rule; the account PATCH on Accounts), and it rolls
 *  back with the server's reason. A kind whose churn has its own form
 *  (Organizations) never saves Churn from here: the row goes to `onChurn`,
 *  whose ChurnOrganizationModal records the date and reason. */
export function useBoardMove<R extends PortfolioRowBase = PortfolioRow>({
  onSaved,
  onChurn,
}: {
  onSaved: (move: BoardMove<R>) => void;
  onChurn?: (row: R) => void;
}): BoardMoveState<R> {
  const dispatch = useAppDispatch();
  const kind = usePortfolioKind();
  const [move, setMove] = useState<BoardMove<R> | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const moveTo = useCallback(
    (row: R, to: LifecycleValue) => {
      const from = row.lifecycle.value;
      if (to === from || saving || move !== null) return;
      setError(null);
      setNotice(null);
      if (to === 'churn' && kind.churnByModal && onChurn) {
        onChurn(row);
        return;
      }
      tokenRef.current += 1;
      const next: BoardMove<R> = { token: tokenRef.current, row, from, to };
      setMove(next);
      setSaving(true);
      kind
        .saveStage(row, to, dispatch)
        .then(
          () => {
            // Guarded by token only because a list change may have reset
            // the move meanwhile; a second move can't start while this one
            // is saving or settling.
            setMove((current) => (current?.token === next.token ? { ...current, saved: true } : current));
            setNotice(`Moved ${row.name} to ${LIFECYCLE_LABELS[to]}.`);
            onSaved(next);
          },
          (reason: unknown) => {
            setMove((current) => (current?.token === next.token ? null : current));
            const why = typeof reason === 'string' ? reason : `Could not update ${kind.noun.one}.`;
            setError(`Couldn't move ${row.name} to ${LIFECYCLE_LABELS[to]}. ${why}`);
          },
        )
        .finally(() => setSaving(false));
    },
    [dispatch, kind, move, onChurn, onSaved, saving],
  );

  const dismissError = useCallback(() => setError(null), []);
  const settle = useCallback((token: number) => setMove((current) => (current?.token === token ? null : current)), []);
  const reset = useCallback(() => setMove(null), []);

  return { move, saving, busy: saving || move !== null, notice, error, moveTo, dismissError, settle, reset };
}
```

`BoardCard.tsx`, ten edits:

(a) Replace

```ts
import { LIFECYCLE_LABELS, formatCompactMoney } from '../../../features/customers/formatters';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import { LIFECYCLE_VALUES } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { HealthRing, SignalTag, TrendLine } from './rowParts';
```

with

```ts
import { LIFECYCLE_LABELS, formatCompactMoney } from '../../../features/customers/formatters';
import { LIFECYCLE_VALUES } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { HealthRing, SignalTag, TrendLine } from './rowParts';
```

(b) Replace

```ts
export interface BoardCardProps {
  row: PortfolioRow;
```

with

```ts
export interface BoardCardProps<R extends PortfolioRowBase = PortfolioRow> {
  row: R;
```

(c) Replace

```ts
  onOpen: (row: PortfolioRow) => void;
  /** `fromMenu` is true for a Move to… choice (keyboard or touch), whose
   *  card should keep focus in its new column; a drag leaves focus alone. */
  onMove: (row: PortfolioRow, to: LifecycleValue, fromMenu?: boolean) => void;
  onDragStart: (row: PortfolioRow) => void;
```

with

```ts
  onOpen: (row: R) => void;
  /** `fromMenu` is true for a Move to… choice (keyboard or touch), whose
   *  card should keep focus in its new column; a drag leaves focus alone. */
  onMove: (row: R, to: LifecycleValue, fromMenu?: boolean) => void;
  onDragStart: (row: R) => void;
```

(d) Replace

```ts
function MoveToMenu({
  row,
  disabled,
  note,
  targets,
  onMove,
}: {
  row: PortfolioRow;
  disabled: boolean;
  note: string | null;
  targets: LifecycleValue[];
  onMove: (row: PortfolioRow, to: LifecycleValue, fromMenu?: boolean) => void;
}) {
```

with

```ts
function MoveToMenu<R extends PortfolioRowBase>({
  row,
  disabled,
  note,
  targets,
  onMove,
}: {
  row: R;
  disabled: boolean;
  note: string | null;
  targets: LifecycleValue[];
  onMove: (row: R, to: LifecycleValue, fromMenu?: boolean) => void;
}) {
```

(e) Replace `export const BoardCard = memo(function BoardCard({` with `function BoardCardView<R extends PortfolioRowBase>({`

(f) Replace

```ts
}: BoardCardProps) {
  const draggable = isSm && canMove && !moveDisabled;
```

with

```ts
}: BoardCardProps<R>) {
  const kind = usePortfolioKind();
  // A record the kind cannot save from here (an account none of whose
  // organisations the viewer may open) neither drags nor has Move to….
  const movable = canMove && kind.editable(row);
  const draggable = isSm && movable && !moveDisabled;
```

(g) Replace

```tsx
          <Link
            to={`/organizations/${row.id}`}
            draggable={false}
```

with

```tsx
          <Link
            to={kind.href(row)}
            state={kind.linkState(row)}
            draggable={false}
```

(h) Replace `          <p className="truncate text-[11px] text-ink-muted">{PORTFOLIO_FIELDS.owner.value(row)}</p>` with `          <p className="truncate text-[11px] text-ink-muted">{kind.cardSubtitle(row)}</p>`

(i) Replace `        {canMove ? <MoveToMenu row={row} disabled={moveDisabled} note={moveNote} targets={targets} onMove={onMove} /> : null}` with `        {movable ? <MoveToMenu row={row} disabled={moveDisabled} note={moveNote} targets={targets} onMove={onMove} /> : null}`

(j) Replace the file's last four lines

```tsx
      </div>
    </li>
  );
});
```

with

```tsx
      </div>
    </li>
  );
}

/** Memoised (see above). `memo` drops the row's type parameter; the cast
 *  gives it back. */
export const BoardCard = memo(BoardCardView) as typeof BoardCardView;
```

`BoardColumn.tsx`, twelve edits:

(a) Replace

```ts
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { BoardCard } from './BoardCard';
```

with

```ts
import type { FilterOptions, LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { BoardCard } from './BoardCard';
import { usePortfolioKind } from './portfolioKind';
```

(b) Replace `export interface BoardColumnProps {` with `export interface BoardColumnProps<R extends PortfolioRowBase = PortfolioRow> {`

(c) Replace `  move: BoardMove | null;` with `  move: BoardMove<R> | null;`

(d) Replace

```ts
  dragging: PortfolioRow | null;
  onOpen: (row: PortfolioRow) => void;
  onMove: (row: PortfolioRow, to: LifecycleValue, fromMenu?: boolean) => void;
  onDragStart: (row: PortfolioRow) => void;
```

with

```ts
  dragging: R | null;
  onOpen: (row: R) => void;
  onMove: (row: R, to: LifecycleValue, fromMenu?: boolean) => void;
  onDragStart: (row: R) => void;
```

(e) Replace

```ts
  onRowsLoaded: (rows: PortfolioRow[]) => void;
  onShowChurned: () => void;
  /** Lifecycle columns other than Churn (ruling R2): the header's "+" adds
   *  an organization already in this stage. Absent, there is no "+". */
```

with

```ts
  onRowsLoaded: (rows: R[]) => void;
  /** The drop-only Churn column's "Show churned" (Organizations only). */
  onShowChurned?: () => void;
  /** Lifecycle columns the kind adds to (Organizations: not Churn, ruling
   *  R2): the header's "+" adds a record already in this stage. Absent,
   *  there is no "+". */
```

(f) Replace `export function BoardColumn({` with `export function BoardColumn<R extends PortfolioRowBase>({`

(g) Replace

```ts
}: BoardColumnProps) {
  const headingId = useId();
```

with

```ts
}: BoardColumnProps<R>) {
  const kind = usePortfolioKind();
  const headingId = useId();
```

(h) Replace `  const page = usePagedPortfolio(query, enabled, version, onRowsLoaded);` with `  const page = usePagedPortfolio<R, FilterOptions>(query, enabled, version, onRowsLoaded);`

(i) Replace ``        {filtered ? 'None match these filters.' : `No organizations in ${spec.label}.`}`` with ``        {filtered ? 'None match these filters.' : `No ${kind.noun.many} in ${spec.label}.`}``

(j) Replace `        {onAdd && spec.key !== 'churn' ? (` with `        {onAdd && kind.addsTo(spec.key as LifecycleValue) ? (`

(k) Replace ``            aria-label={`Add organization to ${spec.label}`}`` with ``            aria-label={`Add ${kind.noun.one} to ${spec.label}`}``

`PortfolioBoard.tsx`, eleven edits:

(a) Replace

```ts
import { includesChurned, toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { BoardColumn } from './BoardColumn';
import { boardColumns, useOverlayActive, withMove, type BoardMove } from './boardMove';
```

with

```ts
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions, LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { BoardColumn } from './BoardColumn';
import { boardColumns, useOverlayActive, withMove, type BoardMove } from './boardMove';
import { usePortfolioKind } from './portfolioKind';
```

(b) Replace `export interface PortfolioBoardProps {` with `export interface PortfolioBoardProps<R extends PortfolioRowBase = PortfolioRow> {`

(c) Replace `  portfolio: PortfolioState;` with `  portfolio: PortfolioState<R, FilterOptions>;`

(d) Replace `  move: BoardMove | null;` with `  move: BoardMove<R> | null;`

(e) Replace

```ts
  onOpen: (row: PortfolioRow) => void;
  onMove: (row: PortfolioRow, to: LifecycleValue) => void;
  onRowsLoaded: (rows: PortfolioRow[]) => void;
```

with

```ts
  onOpen: (row: R) => void;
  onMove: (row: R, to: LifecycleValue) => void;
  onRowsLoaded: (rows: R[]) => void;
```

(f) Replace

```ts
  onAdd: (stage?: LifecycleValue) => void;
  onShowChurned: () => void;
```

with

```ts
  onAdd: (stage?: LifecycleValue) => void;
  /** The drop-only Churn column's "Show churned" (Organizations only). */
  onShowChurned?: () => void;
```

(g) Replace `export function PortfolioBoard({` with `export function PortfolioBoard<R extends PortfolioRowBase>({`

(h) Replace

```ts
}: PortfolioBoardProps) {
  const [dragging, setDragging] = useState<PortfolioRow | null>(null);
```

with

```ts
}: PortfolioBoardProps<R>) {
  const kind = usePortfolioKind();
  const [dragging, setDragging] = useState<R | null>(null);
```

(i) Replace `  const columns = data ? boardColumns(group, data.groups, includesChurned(inputs.params)) : [];` with `  const columns = data ? boardColumns(group, data.groups, kind.churnVisible(inputs.params)) : [];`

(j) Replace

```ts
    (row: PortfolioRow, to: LifecycleValue, fromMenu = false) => {
      setDragging(null);
      // A Move to… choice (keyboard or touch): the card remounts in its new
      // column and focus follows it there. A mouse drag leaves focus alone,
      // and Churn opens a modal that takes focus itself.
      if (fromMenu && to !== 'churn') setFocusId(row.id);
      onMove(row, to);
    },
    [onMove],
```

with

```ts
    (row: R, to: LifecycleValue, fromMenu = false) => {
      setDragging(null);
      // A Move to… choice (keyboard or touch): the card remounts in its new
      // column and focus follows it there. A mouse drag leaves focus alone,
      // and a kind's churn form (Organizations) takes focus itself.
      if (fromMenu && !(to === 'churn' && kind.churnByModal)) setFocusId(row.id);
      onMove(row, to);
    },
    [onMove, kind],
```

(k) Replace `        title="No organizations match these filters"` with ``        title={`No ${kind.noun.many} match these filters`}``; replace

```tsx
        title="No organizations yet"
        detail="Add an organization to start your portfolio."
```

with

```tsx
        title={`No ${kind.noun.many} yet`}
        detail={`Add an ${kind.noun.one} to start your portfolio.`}
```

and replace the line `            Add organization` with `            {`Add ${kind.noun.one}`}`.

- [ ] **Step 4: Run the new test, every Organizations test, and the types**

Run: `npx vitest run src/components/organizations/portfolio/kindBoard.test.tsx --maxWorkers=2`
Expected: PASS (5 tests).

Run: `npx vitest run src/features/organizations src/components/organizations src/pages/organizations src/e2e --maxWorkers=2`
Expected: every file passes, 0 failed (the Organizations board still hides churned rows behind "Show churned" and hands Churn to its modal).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/boardMove.ts src/components/organizations/portfolio/useBoardMove.ts src/components/organizations/portfolio/BoardCard.tsx src/components/organizations/portfolio/BoardColumn.tsx src/components/organizations/portfolio/PortfolioBoard.tsx src/components/organizations/portfolio/kindBoard.test.tsx
git commit -m "$(cat <<'EOF'
refactor(portfolio): the board, its cards and moves read the kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Toolbar, filters, chips, selection bar and tiles read the kind

**Files:**
- Modify: `src/components/organizations/portfolio/PortfolioToolbar.tsx`
- Modify: `src/components/organizations/portfolio/FiltersPanel.tsx`
- Modify: `src/components/organizations/portfolio/FilterChips.tsx`
- Modify: `src/components/organizations/portfolio/SelectionBar.tsx`
- Modify: `src/components/organizations/portfolio/SummaryTiles.tsx`
- Test: `src/components/organizations/portfolio/kindControls.test.tsx`

**Interfaces:**
- Consumes (Tasks 1–2): `FilterOptions`, `PortfolioNoun`, `usePortfolioKind`, `WIDGET_KIND`, `countText(…, noun)`.
- Produces:
  - `PortfolioToolbar`, `FiltersPanel` and `FilterChips` take `options: FilterOptions | null`.
  - `GroupSortControls({ params, update, groupOptions? })` defaults to the kind's `groupOptions` and lists the kind's `sortOptions`.
  - `SelectionBar` takes `onArchive?: () => void`, `onChurn?: () => void` and `keepChurn?: boolean`.
  - `SummaryTiles` opens the Renewing tile on `kind.renewalWindow`.

- [ ] **Step 1: Write the failing test**

Create `src/components/organizations/portfolio/kindControls.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { buildPortfolio } from '../../../features/organizations/testPortfolio';
import { FilterChips } from './FilterChips';
import { FiltersPanel } from './FiltersPanel';
import { PortfolioKindContext } from './portfolioKind';
import { PortfolioToolbar } from './PortfolioToolbar';
import { SelectionBar } from './SelectionBar';
import { SummaryTiles } from './SummaryTiles';
import { WIDGET_KIND } from './testKind';

const OPTIONS: FilterOptions = {
  owners: [{ value: '2', name: 'Carl CSM' }],
  lifecycles: [{ value: 'live', name: 'Live' }],
  organisations: [
    { value: '7', name: 'Pizza Hut' },
    { value: '1', name: 'Globex' },
  ],
};
const widgetParams = (search: string) => parseParams(new URLSearchParams(search), 'health', WIDGET_KIND.params);

function inWidgets(node: ReactNode) {
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={WIDGET_KIND}>{node}</PortfolioKindContext.Provider>
    </MemoryRouter>,
  );
}

describe('the toolbar, filters, chips, selection and tiles read the kind', () => {
  it("counts an organisation filter, lists the kind's sorts and adds in its words", () => {
    inWidgets(
      <PortfolioToolbar
        params={widgetParams('organisation=7')}
        update={vi.fn()}
        options={OPTIONS}
        isSm
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
        searchRef={createRef<HTMLInputElement>()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('Filters1');
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin fields' })).not.toBeInTheDocument();
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(within(sort).getAllByRole('option').map((option) => option.textContent)).toEqual(['ARR', 'Name']);
  });

  it("shows the kind's own filters: Organization, and no Product or Churned", async () => {
    const update = vi.fn();
    inWidgets(
      <FiltersPanel
        params={widgetParams('organisation=7')}
        update={update}
        options={OPTIONS}
        isSm
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('group', { name: 'Organization' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('group', { name: 'Product' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Include churned' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Pizza Hut' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Globex' }));
    expect(update).toHaveBeenCalledWith({ organisation: ['7', '1'] });
  });

  it("adds in the kind's words from the phone sheet", () => {
    inWidgets(
      <FiltersPanel
        params={widgetParams('')}
        update={vi.fn()}
        options={OPTIONS}
        isSm={false}
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
  });

  it("names an organisation chip and counts in the kind's words", () => {
    inWidgets(
      <FilterChips params={widgetParams('organisation=7')} options={OPTIONS} count={1} total={3} onChange={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Remove Organization: Pizza Hut' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 widgets')).toBeInTheDocument();
  });

  it('offers only the actions it is given, and keeps Churn as a stage when asked', () => {
    inWidgets(
      <SelectionBar
        count={2}
        owners={[]}
        lifecycles={[
          { value: 'live', name: 'Live' },
          { value: 'churn', name: 'Churn' },
        ]}
        activity={null}
        report={null}
        onSetOwner={vi.fn()}
        onSetLifecycle={vi.fn()}
        onExport={vi.fn()}
        onClose={vi.fn()}
        keepChurn
      />,
    );
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'Set lifecycle' })).getByRole('option', { name: 'Churn' })).toBeInTheDocument();
  });

  it("reports a bulk edit in the kind's words", () => {
    inWidgets(
      <SelectionBar
        count={0}
        owners={[]}
        lifecycles={[]}
        activity={null}
        report={{ updated: 2, failed: [] }}
        onSetOwner={vi.fn()}
        onSetLifecycle={vi.fn()}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Updated 2 widgets.')).toBeInTheDocument();
  });

  it("opens the Renewing tile on the kind's window", () => {
    const data = buildPortfolio(new URLSearchParams());
    inWidgets(<SummaryTiles summary={data.summary} currency="USD" params={widgetParams('')} onFilter={vi.fn()} />);
    expect(screen.getByText('within 90 days, overdue included')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/kindControls.test.tsx --maxWorkers=2`
Expected: FAIL. The toolbar reads "Add organization", the sort lists every Organizations sort, and the panel shows Product and Churned.

- [ ] **Step 3: Implement**

`PortfolioToolbar.tsx`, five edits:

(a) Replace `import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';` with `import type { FilterOptions } from '../../../features/organizations/portfolioTypes';`

(b) Replace `import { PinFieldsMenu } from './PinFieldsMenu';` with

```ts
import { PinFieldsMenu } from './PinFieldsMenu';
import { usePortfolioKind } from './portfolioKind';
```

(c) Replace

```ts
    p.health.length +
    p.product.length
```

with

```ts
    p.health.length +
    p.product.length +
    (p.organisation?.length ?? 0)
```

(d) Replace `  options: PortfolioResponse['filters'] | null;` with `  options: FilterOptions | null;`, and replace `  // The box shows what is typed; the URL gets it 300ms after typing stops.` with

```ts
  const kind = usePortfolioKind();
  // The box shows what is typed; the URL gets it 300ms after typing stops.
```

(e) Replace the line `            Add organization` with `            {`Add ${kind.noun.one}`}`.

`FiltersPanel.tsx`, nine edits:

(a) Delete the line `import { SORT_OPTIONS } from '../../../features/organizations/portfolioFields';`

(b) Replace `import type { GroupKey, LifecycleValue, NpsBand, PortfolioResponse } from '../../../features/organizations/portfolioTypes';` with `import type { FilterOptions, GroupKey, LifecycleValue, NpsBand } from '../../../features/organizations/portfolioTypes';`

(c) Replace

```ts
import { GROUP_OPTIONS, type GroupOption } from '../../../features/organizations/portfolioGroups';
import { FOCUS } from './styles';
```

with

```ts
import type { GroupOption } from '../../../features/organizations/portfolioGroups';
import { usePortfolioKind } from './portfolioKind';
import { FOCUS } from './styles';
```

(d) Replace

```ts
  groupOptions = GROUP_OPTIONS,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  /** The Board passes BOARD_GROUP_OPTIONS. */
  groupOptions?: GroupOption[];
}) {
  const descending = params.sort.startsWith('-');
```

with

```ts
  groupOptions,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  /** The Board passes its kind's board options; absent, the kind's List options. */
  groupOptions?: GroupOption[];
}) {
  const kind = usePortfolioKind();
  const groups = groupOptions ?? kind.groupOptions;
  const descending = params.sort.startsWith('-');
```

(e) Replace `          {groupOptions.map((option) => (` with `          {groups.map((option) => (`, and replace `          {SORT_OPTIONS.map((option) => (` with `          {kind.sortOptions.map((option) => (`

(f) Replace `  options: PortfolioResponse['filters'] | null;` with `  options: FilterOptions | null;`, and replace

```ts
  const ref = useRef<HTMLDivElement>(null);
  const ownerRef = useRef<HTMLSelectElement>(null);
```

with

```ts
  const kind = usePortfolioKind();
  const ref = useRef<HTMLDivElement>(null);
  const ownerRef = useRef<HTMLSelectElement>(null);
```

(g) Replace

```tsx
        </select>
      </div>

      <Group legend="Health">
```

with

```tsx
        </select>
      </div>

      {kind.filters.organisation ? (
        <Group legend="Organization">
          {options?.organisations?.length ? (
            options.organisations.map((organisation) => (
              <Check
                key={organisation.value}
                label={organisation.name}
                checked={(params.organisation ?? []).includes(organisation.value)}
                onChange={() => update({ organisation: toggleIn(params.organisation ?? [], organisation.value) })}
              />
            ))
          ) : (
            <p className="text-[13px] text-ink-muted">No organizations to filter by yet.</p>
          )}
        </Group>
      ) : null}

      <Group legend="Health">
```

(h) Replace

```tsx
      <Group legend="Product">
        {options?.products.length ? (
          options.products.map((product) => (
            <Check key={product.value} label={product.name} checked={params.product.includes(product.value)} onChange={() => update({ product: toggleIn(params.product, product.value) })} />
          ))
        ) : (
          <p className="text-[13px] text-ink-muted">No products in the catalogue yet.</p>
        )}
      </Group>
```

with

```tsx
      {kind.filters.product ? (
        <Group legend="Product">
          {options?.products?.length ? (
            options.products.map((product) => (
              <Check key={product.value} label={product.name} checked={params.product.includes(product.value)} onChange={() => update({ product: toggleIn(params.product, product.value) })} />
            ))
          ) : (
            <p className="text-[13px] text-ink-muted">No products in the catalogue yet.</p>
          )}
        </Group>
      ) : null}
```

and replace

```tsx
      <Group legend="Churned">
        <Check label="Include churned" checked={params.include_churned} onChange={() => update({ include_churned: !params.include_churned })} />
      </Group>
```

with

```tsx
      {kind.filters.churned ? (
        <Group legend="Churned">
          <Check label="Include churned" checked={params.include_churned} onChange={() => update({ include_churned: !params.include_churned })} />
        </Group>
      ) : null}
```

(i) Replace the line `            Add organization` with `            {`Add ${kind.noun.one}`}`.

`FilterChips.tsx`, four edits:

(a) Replace

```ts
import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';
import { FOCUS } from './styles';
```

with

```ts
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { FOCUS } from './styles';
```

(b) Replace `  options: PortfolioResponse['filters'] | null;` with `  options: FilterOptions | null;`

(c) Replace `  const chips = filterChips(params, options);` with

```ts
  const kind = usePortfolioKind();
  const chips = filterChips(params, options);
```

(d) Replace `        {countText(count, total, chips.length > 0, failed)}` with `        {countText(count, total, chips.length > 0, failed, kind.noun)}`

`SelectionBar.tsx`, eight edits:

(a) Replace `import type { Option } from '../../../features/organizations/portfolioTypes';` with

```ts
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';
import type { Option } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
```

(b) Replace

```ts
function reportText(report: BulkReport): string {
  return `Updated ${report.updated} organization${report.updated === 1 ? '' : 's'}.${report.failed.length ? ` ${report.failed.length} failed:` : ''}`;
}
```

with

```ts
function reportText(report: BulkReport, noun: PortfolioNoun): string {
  return `Updated ${report.updated} ${report.updated === 1 ? noun.one : noun.many}.${report.failed.length ? ` ${report.failed.length} failed:` : ''}`;
}
```

(c) Replace

```ts
  onArchive,
  onChurn,
  onClose,
}: {
```

with

```ts
  onArchive,
  onChurn,
  keepChurn = false,
  onClose,
}: {
```

(d) Replace

```ts
  onArchive: () => void;
  onChurn: () => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
```

with

```ts
  /** Absent (Accounts): no Archive button. */
  onArchive?: () => void;
  /** Absent (Accounts): no Churn button. */
  onChurn?: () => void;
  /** Offer Churn among the stages (Accounts, where it is only a stage). */
  keepChurn?: boolean;
  onClose: () => void;
}) {
  const kind = usePortfolioKind();
  const [pending, setPending] = useState<Pending | null>(null);
```

(e) Replace `                    .filter((stage) => stage.value !== 'churn')` with `                    .filter((stage) => keepChurn || stage.value !== 'churn')`

(f) Replace

```tsx
                <button type="button" onClick={onArchive} disabled={disabled} className={BUTTON}>
                  <Archive className="w-4 h-4" aria-hidden="true" />
                  Archive
                </button>
                {count === 1 ? (
```

with

```tsx
                {onArchive ? (
                  <button type="button" onClick={onArchive} disabled={disabled} className={BUTTON}>
                    <Archive className="w-4 h-4" aria-hidden="true" />
                    Archive
                  </button>
                ) : null}
                {count === 1 && onChurn ? (
```

(g) Replace `{report.error ? <p className="text-danger">{report.error}</p> : <p className="text-ink">{reportText(report)}</p>}` with `{report.error ? <p className="text-danger">{report.error}</p> : <p className="text-ink">{reportText(report, kind.noun)}</p>}`

`SummaryTiles.tsx`, three edits:

(a) Replace `import { FOCUS } from './styles';` with

```ts
import { usePortfolioKind } from './portfolioKind';
import { FOCUS } from './styles';
```

(b) Replace

```ts
  const [mode, setMode] = useState<'count' | 'mrr' | 'arr'>('count');
```

with

```ts
  const kind = usePortfolioKind();
  const [mode, setMode] = useState<'count' | 'mrr' | 'arr'>('count');
```

(c) Replace `  const [span, setSpan] = useState<RenewalWindow>(params.renews_within || '30');` with `  const [span, setSpan] = useState<RenewalWindow>(params.renews_within || kind.renewalWindow);`, and replace `    else if (span === '180') setSpan('30');` with `    else if (span === '180') setSpan(kind.renewalWindow);`

- [ ] **Step 4: Run the new test, every Organizations test, and the types**

Run: `npx vitest run src/components/organizations/portfolio/kindControls.test.tsx --maxWorkers=2`
Expected: PASS (7 tests).

Run: `npx vitest run src/features/organizations src/components/organizations src/pages/organizations src/e2e --maxWorkers=2`
Expected: every file passes, 0 failed (Organizations still shows Product, Include churned, Archive, Churn, "Add organization" and the 30-day Renewing tile).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/PortfolioToolbar.tsx src/components/organizations/portfolio/FiltersPanel.tsx src/components/organizations/portfolio/FilterChips.tsx src/components/organizations/portfolio/SelectionBar.tsx src/components/organizations/portfolio/SummaryTiles.tsx src/components/organizations/portfolio/kindControls.test.tsx
git commit -m "$(cat <<'EOF'
refactor(portfolio): toolbar, filters, chips, selection and tiles read the kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The Accounts contract, fields, link state and test stub (pure modules)

**Files:**
- Create: `src/features/accounts/portfolioTypes.ts`
- Create: `src/features/accounts/portfolioApi.ts`
- Create: `src/features/accounts/portfolioParams.ts`
- Create: `src/features/accounts/accountFields.ts`
- Create: `src/features/accounts/accountNavState.ts`
- Create: `src/features/accounts/testPortfolio.ts` (test only)
- Test: `src/features/accounts/accountFields.test.ts`, `src/features/accounts/portfolioApi.test.ts`

**Interfaces:**
- Consumes (Task 1): `PortfolioRowBase`, `PortfolioPage`, `Option`, `BulkResult`, `ParamSpec`, `GroupOption`, `PortfolioNoun`, `LIFECYCLE_VALUES`, `pulseWords`, `signed`.
- Produces:

```ts
// portfolioTypes.ts
export interface AccountPortfolioDetails { commercial: { arr: number | null; renewal_date: string | null }; voice: { nps_score: number | null; csat_score: number | null; ai_pulse_reason: string }; profile: { revenact_id: number; domain: string; industry: string; email: string; phone: string; address: string; organisations: { id: number; name: string }[] }; history: { created_at: string; updated_at: string; pulse_recorded_on: string | null; csm_pulse_modified_at: string | null } }
export interface AccountPortfolioRow extends PortfolioRowBase { organisation: { id: number; name: string } | null; extra_organisations: number; details: AccountPortfolioDetails }
export interface AccountFilterOptions { organisations: Option[]; owners: Option[]; lifecycles: Option[] }
export type AccountPortfolioResponse = PortfolioPage<AccountPortfolioRow, AccountFilterOptions>;
export type AccountBulkAction = 'set_owner' | 'set_lifecycle';
export interface AccountBulkRequest { ids: number[]; action: AccountBulkAction; value: number | string | null }
// portfolioApi.ts
export const ACCOUNTS_PORTFOLIO_PATH = '/accounts/portfolio/';
export function fetchAccountPortfolio(query: string): Promise<AccountPortfolioResponse>;
export function exportAccountPortfolio(query: string, today?: Date): Promise<void>;
export function bulkUpdateAccounts(body: AccountBulkRequest): Promise<BulkResult>;
// portfolioParams.ts
export const ACCOUNT_PARAMS: ParamSpec;
// accountFields.ts
export type AccountPanelKey = 'commercial' | 'voice' | 'profile' | 'history';
export type AccountFieldId = 'account' | 'owner' | … (24 ids);
export interface AccountFieldDef { id: AccountFieldId; label: string; place: 'header' | AccountPanelKey; value: (row: AccountPortfolioRow, currency: CurrencyCode) => string }
export const ACCOUNT_FIELDS: Record<AccountFieldId, AccountFieldDef>;
export const ACCOUNT_PANELS: { key: AccountPanelKey; title: string }[];
export const ACCOUNT_PANEL_ORDER: Record<AccountPanelKey, AccountFieldId[]>;
export const ACCOUNT_HEADER_FIELDS: AccountFieldId[];
export const ACCOUNT_SORT_OPTIONS: { value: string; label: string }[];
export const ACCOUNT_GROUP_OPTIONS: GroupOption[]; export const ACCOUNT_BOARD_GROUP_OPTIONS: GroupOption[];
export const ACCOUNT_LIFECYCLE_TARGETS: Option[];
export const ACCOUNT_NOUN: PortfolioNoun;
export function organisationText(row: Pick<AccountPortfolioRow, 'organisation' | 'extra_organisations'>): string | null;
// accountNavState.ts
export function accountNavRow(row: AccountPortfolioRow): AccountRow;
// testPortfolio.ts (test only)
export const pizzaEmea, globexNa, initechApac: AccountPortfolioRow; export const ACCOUNT_ROWS; export const ACCOUNT_FILTER_OPTIONS;
export function buildAccountPortfolio(query: URLSearchParams, rows?: AccountPortfolioRow[]): AccountPortfolioResponse;
export function accountFixture(row: AccountPortfolioRow): Account;
export function stubAccountsPortfolio(stub?: AccountsStub): FetchSpy;
export function accountPortfolioQueries(spy): URLSearchParams[];
export function accountBulkBodies(spy): AccountBulkRequest[];
export function accountPatches(spy): { customerId: number; id: number; body: Record<string, unknown> }[];
```

- [ ] **Step 1: Write the test stub module (the tests below import it)**

Create `src/features/accounts/testPortfolio.ts`:

```ts
import { vi } from 'vitest';
import type { Account } from '../customers/customersSlice';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import { LIFECYCLE_VALUES } from '../organizations/portfolioParams';
import type { BulkResult, HealthBand, LifecycleValue, PortfolioGroup, PortfolioSummary } from '../organizations/portfolioTypes';
import type { AccountBulkRequest, AccountFilterOptions, AccountPortfolioResponse, AccountPortfolioRow } from './portfolioTypes';

// Test-only: rows shaped like backend #74's GET /accounts/portfolio/ and a
// fetch stub that answers the portfolio, export, bulk, single-account read,
// update and create, organisation list and members endpoints the way the
// backend does. A PATCH writes into the stub's copy of the book, so a reload
// after a move or an edit sees it.

export const pizzaEmea: AccountPortfolioRow = {
  id: 12,
  name: 'Pizza EMEA',
  initials: 'PE',
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
  organisation: { id: 7, name: 'Pizza Hut' },
  extra_organisations: 1,
  details: {
    commercial: { arr: 69600, renewal_date: '2026-08-09' },
    voice: { nps_score: -80, csat_score: 62, ai_pulse_reason: 'Usage fell after the admin left.' },
    profile: {
      revenact_id: 12,
      domain: 'emea.pizzahut.example',
      industry: 'Restaurants',
      email: 'emea@pizzahut.example',
      phone: '+1 555 0100',
      address: 'London, UK',
      organisations: [
        { id: 7, name: 'Pizza Hut' },
        { id: 9, name: 'Yum Brands' },
      ],
    },
    history: {
      created_at: '2024-08-01T09:00:00+00:00',
      updated_at: '2026-09-01T10:00:00+00:00',
      pulse_recorded_on: '2026-09-20',
      csm_pulse_modified_at: '2026-09-18T08:00:00+00:00',
    },
  },
};

export const globexNa: AccountPortfolioRow = {
  ...pizzaEmea,
  id: 13,
  name: 'Globex NA',
  initials: 'GN',
  owner: { id: 3, name: 'Priya' },
  lifecycle: { value: 'adoption', label: 'Adoption' },
  health: { score: 8.2, category: 'good', trend: [7.9, 8.0, 8.1, 8.1, 8.2, 8.2] },
  renewal: { date: '2027-01-23', days: 120 },
  arr: 120000,
  risk: { score: 12, direction: 'flat' },
  pulse: { csm: 4, ai: 4, ai_category: 'satisfied', ai_label: 'Satisfied', reason: 'Steady usage.', history: [1, 1, 1], disagree: false },
  last_touch_days: 2,
  signal: null,
  organisation: { id: 1, name: 'Globex' },
  extra_organisations: 0,
  details: {
    commercial: { arr: 120000, renewal_date: '2027-01-23' },
    voice: { nps_score: 40, csat_score: 88, ai_pulse_reason: 'Steady usage.' },
    profile: { revenact_id: 13, domain: '', industry: '', email: '', phone: '', address: '', organisations: [{ id: 1, name: 'Globex' }] },
    history: {
      created_at: '2025-01-10T09:00:00+00:00',
      updated_at: '2026-09-20T10:00:00+00:00',
      pulse_recorded_on: null,
      csm_pulse_modified_at: null,
    },
  },
};

/** An account the viewer may open (they own it) under organisations they
 *  may not: `organisation` is null and none are named. */
export const initechApac: AccountPortfolioRow = {
  ...pizzaEmea,
  id: 14,
  name: 'Initech APAC',
  initials: 'IA',
  owner: null,
  lifecycle: { value: 'churn', label: 'Churn' },
  health: { score: 2.8, category: 'poor', trend: [4.0, 3.6, 3.1, 2.9, 2.8, 2.8] },
  renewal: { date: null, days: null },
  arr: 30000,
  risk: { score: 62, direction: 'declining' },
  pulse: { csm: null, ai: null, ai_category: null, ai_label: '', reason: '', history: [], disagree: false },
  last_touch_days: null,
  signal: null,
  organisation: null,
  extra_organisations: 0,
  details: {
    commercial: { arr: 30000, renewal_date: null },
    voice: { nps_score: null, csat_score: null, ai_pulse_reason: '' },
    profile: { revenact_id: 14, domain: '', industry: '', email: '', phone: '', address: '', organisations: [] },
    history: {
      created_at: '2023-03-01T09:00:00+00:00',
      updated_at: '2026-06-01T10:00:00+00:00',
      pulse_recorded_on: null,
      csm_pulse_modified_at: null,
    },
  },
};

export const ACCOUNT_ROWS: AccountPortfolioRow[] = [pizzaEmea, globexNa, initechApac];

export const ACCOUNT_FILTER_OPTIONS: AccountFilterOptions = {
  organisations: [
    { value: '1', name: 'Globex' },
    { value: '7', name: 'Pizza Hut' },
    { value: '9', name: 'Yum Brands' },
  ],
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
};

const BAND_ORDER: HealthBand[] = ['poor', 'average', 'good'];
const BAND_LABEL: Record<HealthBand, string> = { poor: 'Poor', average: 'Average', good: 'Good' };
const sumArr = (rows: AccountPortfolioRow[]) => rows.reduce((total, row) => total + (row.arr ?? 0), 0);
const ownerKey = (row: AccountPortfolioRow) => (row.owner ? String(row.owner.id) : 'unassigned');

function summarise(rows: AccountPortfolioRow[]): PortfolioSummary {
  const band = (b: HealthBand) => rows.filter((row) => row.health.category === b);
  const money = (divisor: number) => ({
    good: sumArr(band('good')) / divisor,
    average: sumArr(band('average')) / divisor,
    poor: sumArr(band('poor')) / divisor,
  });
  const within = (days: number) => rows.filter((row) => row.renewal.days !== null && row.renewal.days <= days).length;
  return {
    health: { good: band('good').length, average: band('average').length, poor: band('poor').length, arr: money(1), mrr: money(12) },
    nps: { score: 20, promoters: 1, passives: 0, detractors: 1 },
    lifecycle: LIFECYCLE_VALUES.map((value) => {
      const stage = rows.filter((row) => row.lifecycle.value === value);
      return { value, label: LIFECYCLE_LABELS[value], count: stage.length, arr: sumArr(stage) };
    }),
    accounts: rows.length,
    arr: sumArr(rows),
    unconverted_count: 0,
    renewing: { '30': within(30), '90': within(90) },
  };
}

function inGroup(group: string, key: string, row: AccountPortfolioRow): boolean {
  if (group === 'health') return row.health.category === key;
  if (group === 'lifecycle') return row.lifecycle.value === key;
  if (group === 'owner') return ownerKey(row) === key;
  return true;
}

function groupLabel(group: string, key: string, row: AccountPortfolioRow): string {
  if (group === 'health') return BAND_LABEL[key as HealthBand];
  if (group === 'lifecycle') return row.lifecycle.label;
  return row.owner?.name ?? 'Unassigned';
}

/** What the backend answers for `query` over `rows`: filters (organisation
 *  included; nothing hidden for churn), non-empty groups only, the whole-set
 *  summary, `group_value` scoping of results and count, and a cursor (an
 *  offset here). */
export function buildAccountPortfolio(query: URLSearchParams, rows: AccountPortfolioRow[] = ACCOUNT_ROWS): AccountPortfolioResponse {
  const list = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean);
  const ids = list('ids').map(Number);
  const organisations = list('organisation').map(Number);
  const health = list('health');
  const lifecycle = list('lifecycle');
  const owner = query.get('owner') ?? '';
  const search = (query.get('search') ?? '').toLowerCase();
  const set = rows.filter(
    (row) =>
      (ids.length === 0 || ids.includes(row.id)) &&
      (organisations.length === 0 || row.details.profile.organisations.some((org) => organisations.includes(org.id))) &&
      (health.length === 0 || health.includes(row.health.category)) &&
      (lifecycle.length === 0 || lifecycle.includes(row.lifecycle.value)) &&
      (!search || row.name.toLowerCase().includes(search)) &&
      (!owner || (owner === 'unassigned' ? row.owner === null : String(row.owner?.id) === owner)),
  );
  const group = query.get('group') ?? '';
  const keys: string[] =
    group === 'health' ? BAND_ORDER : group === 'lifecycle' ? LIFECYCLE_VALUES : group === 'owner' ? [...new Set(set.map(ownerKey))] : [];
  const groups: PortfolioGroup[] = keys
    .map((key) => ({ key, rows: set.filter((row) => inGroup(group, key, row)) }))
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ key: g.key, label: groupLabel(group, g.key, g.rows[0]), count: g.rows.length, arr: sumArr(g.rows) }));
  const groupValue = query.get('group_value');
  const scoped = groupValue && group ? set.filter((row) => inGroup(group, groupValue, row)) : set;
  const limit = Number(query.get('limit') ?? 50);
  const start = Number(query.get('cursor') ?? 0);
  return {
    results: scoped.slice(start, start + limit),
    next_cursor: start + limit < scoped.length ? String(start + limit) : null,
    count: scoped.length,
    groups,
    summary: summarise(set),
    filters: ACCOUNT_FILTER_OPTIONS,
    currency: 'USD',
  };
}

/** GET /customers/<cid>/accounts/<id>/ for a row: the Account the edit form reads. */
export function accountFixture(row: AccountPortfolioRow): Account {
  const profile = row.details.profile;
  return {
    id: row.id,
    customers: profile.organisations,
    name: row.name,
    domain: profile.domain,
    industry: profile.industry,
    address: profile.address,
    email: profile.email,
    phone: profile.phone,
    owner: null,
    created_at: row.details.history.created_at,
    updated_at: row.details.history.updated_at,
    lifecycle_stage: row.lifecycle.value,
    health_score: row.health.score.toFixed(1),
    health_category: row.health.category,
    pulse: row.pulse.history,
    ai_pulse_score: '',
    ai_pulse_reason: row.details.voice.ai_pulse_reason,
    account_pulse: { value: null, label: 'No signal', category: 0, breakdown: [] },
    nps_score: row.details.voice.nps_score,
    csat_score: row.details.voice.csat_score == null ? null : String(row.details.voice.csat_score),
    renewal_date: row.details.commercial.renewal_date,
    arr: String(row.details.commercial.arr ?? 0),
  };
}

export interface AccountsStub {
  /** Answer the portfolio endpoint. Return `{status, body}` for an error. */
  portfolio?: (query: URLSearchParams) => AccountPortfolioResponse | { status: number; body: unknown };
  bulk?: (body: AccountBulkRequest) => BulkResult;
  /** GET /auth/members/ (the bulk owner targets and the form's owners). */
  members?: unknown[];
  /** The book the default portfolio answer reads (default ACCOUNT_ROWS), copied. */
  rows?: AccountPortfolioRow[];
  /** Answer PATCH /customers/<cid>/accounts/<id>/ yourself (for a failure, say). */
  patch?: (customerId: number, id: number, body: Record<string, unknown>) => { status: number; body: unknown };
}

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

function applyPatch(book: AccountPortfolioRow[], id: number, body: Record<string, unknown>) {
  const index = book.findIndex((row) => row.id === id);
  if (index < 0) return { status: 404, body: { detail: 'Not found.' } };
  const stage = body.lifecycle_stage as LifecycleValue | undefined;
  if (stage) book[index] = { ...book[index], lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] } };
  if (typeof body.name === 'string') book[index] = { ...book[index], name: body.name };
  return { status: 200, body: accountFixture(book[index]) };
}

function applyCreate(book: AccountPortfolioRow[], customerId: number, body: Record<string, unknown>) {
  const id = Math.max(0, ...book.map((row) => row.id)) + 1;
  const name = ACCOUNT_FILTER_OPTIONS.organisations.find((org) => Number(org.value) === customerId)?.name ?? `Organization ${customerId}`;
  const organisation = { id: customerId, name };
  const stage = (body.lifecycle_stage as LifecycleValue | undefined) ?? 'onboarding';
  const row: AccountPortfolioRow = {
    ...globexNa,
    id,
    name: String(body.name ?? 'New account'),
    lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] },
    organisation,
    extra_organisations: 0,
    details: { ...globexNa.details, profile: { ...globexNa.details.profile, revenact_id: id, organisations: [organisation] } },
  };
  book.push(row);
  return { status: 201, body: accountFixture(row) };
}

export function stubAccountsPortfolio(stub: AccountsStub = {}) {
  const book = [...(stub.rows ?? ACCOUNT_ROWS)];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (path === '/accounts/portfolio/') {
      const out = (stub.portfolio ?? ((q: URLSearchParams) => buildAccountPortfolio(q, book)))(url.searchParams);
      return 'results' in out ? json(200, out) : json(out.status, out.body);
    }
    if (path === '/accounts/portfolio/export.csv') {
      return {
        ok: true,
        status: 200,
        json: async () => null,
        blob: async () => new Blob(['Account,Revenact ID\nPizza EMEA,12\n'], { type: 'text/csv' }),
      };
    }
    if (path === '/accounts/bulk/' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as AccountBulkRequest;
      return json(200, (stub.bulk ?? ((b: AccountBulkRequest) => ({ updated: b.ids, failed: [] })))(body));
    }
    const account = /^\/customers\/(\d+)\/accounts\/(\d+)\/$/.exec(path);
    if (account && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const out = stub.patch ? stub.patch(Number(account[1]), Number(account[2]), body) : applyPatch(book, Number(account[2]), body);
      return json(out.status, out.body);
    }
    if (account) {
      const row = book.find((r) => r.id === Number(account[2]));
      return row ? json(200, accountFixture(row)) : json(404, { detail: 'Not found.' });
    }
    const accounts = /^\/customers\/(\d+)\/accounts\/$/.exec(path);
    if (accounts && method === 'POST') {
      const out = applyCreate(book, Number(accounts[1]), JSON.parse(String(init?.body)) as Record<string, unknown>);
      return json(out.status, out.body);
    }
    if (path === '/customers/') {
      return json(200, { count: 2, next: null, previous: null, results: [{ id: 7, name: 'Pizza Hut' }, { id: 1, name: 'Globex' }] });
    }
    if (path === '/auth/members/') return json(200, stub.members ?? []);
    return json(404, { detail: `Not stubbed: ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchSpy = ReturnType<typeof stubAccountsPortfolio>;

/** Every GET /accounts/portfolio/ so far, as parsed query strings, oldest first. */
export function accountPortfolioQueries(spy: FetchSpy): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/accounts/portfolio/'))
    .map((url) => url.searchParams);
}

export function accountBulkBodies(spy: FetchSpy): AccountBulkRequest[] {
  return spy.mock.calls
    .filter(([input, init]) => String(input).endsWith('/accounts/bulk/') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as AccountBulkRequest);
}

/** Every PATCH /customers/<cid>/accounts/<id>/ so far, oldest first. */
export function accountPatches(spy: FetchSpy): { customerId: number; id: number; body: Record<string, unknown> }[] {
  return spy.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input)).pathname, init }))
    .filter(({ path, init }) => init?.method === 'PATCH' && /\/customers\/\d+\/accounts\/\d+\/$/.test(path))
    .map(({ path, init }) => {
      const [, customerId, id] = /\/customers\/(\d+)\/accounts\/(\d+)\/$/.exec(path)!;
      return { customerId: Number(customerId), id: Number(id), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
    });
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/features/accounts/accountFields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseParams } from '../organizations/portfolioParams';
import {
  ACCOUNT_BOARD_GROUP_OPTIONS,
  ACCOUNT_FIELDS,
  ACCOUNT_GROUP_OPTIONS,
  ACCOUNT_HEADER_FIELDS,
  ACCOUNT_LIFECYCLE_TARGETS,
  ACCOUNT_PANEL_ORDER,
  ACCOUNT_SORT_OPTIONS,
  organisationText,
  type AccountFieldId,
} from './accountFields';
import { accountNavRow } from './accountNavState';
import { ACCOUNT_PARAMS } from './portfolioParams';
import { globexNa, initechApac, pizzaEmea } from './testPortfolio';

/** services/accounts_portfolio/fields.py, in its order. */
const BACKEND_IDS: AccountFieldId[] = [
  'account', 'revenactId', 'organizations', 'owner', 'lifecycleStage', 'health', 'pulse', 'aiPulseScore',
  'aiPulseValue', 'csmPulseScore', 'csmPulseModifiedAt', 'aiPulseReason', 'nps', 'csatScore', 'renewalDate',
  'arr', 'domain', 'industry', 'email', 'phone', 'address', 'createdDate', 'modifiedDate', 'pulseRecordedOn',
];

const value = (id: AccountFieldId, row = pizzaEmea) => ACCOUNT_FIELDS[id].value(row, 'USD');

describe('the account field registry', () => {
  it("names the backend's 24 fields, each in the header or one panel", () => {
    expect(Object.keys(ACCOUNT_FIELDS).sort()).toEqual([...BACKEND_IDS].sort());
    const placed = [...ACCOUNT_HEADER_FIELDS, ...Object.values(ACCOUNT_PANEL_ORDER).flat()];
    expect(placed.sort()).toEqual([...BACKEND_IDS].sort());
    expect(ACCOUNT_HEADER_FIELDS).toEqual(['account', 'owner', 'lifecycleStage', 'health', 'pulse', 'aiPulseScore', 'aiPulseValue', 'csmPulseScore']);
    expect(ACCOUNT_PANEL_ORDER).toEqual({
      commercial: ['arr', 'renewalDate'],
      voice: ['nps', 'csatScore', 'aiPulseReason'],
      profile: ['revenactId', 'organizations', 'domain', 'industry', 'email', 'phone', 'address'],
      history: ['createdDate', 'modifiedDate', 'pulseRecordedOn', 'csmPulseModifiedAt'],
    });
  });

  it('formats each value as the panels print it', () => {
    expect(value('arr')).toBe('$69,600.00');
    expect(ACCOUNT_FIELDS.arr.value(pizzaEmea, 'EUR')).toBe('€69,600.00');
    expect(value('renewalDate')).toBe('9 Aug 2026');
    expect(value('nps')).toBe('−80');
    expect(value('csatScore')).toBe('62%');
    expect(value('organizations')).toBe('Pizza Hut, Yum Brands');
    expect(value('createdDate')).toBe('1 Aug 2024');
    expect(value('pulseRecordedOn')).toBe('20 Sep 2026');
    expect(value('csmPulseModifiedAt')).toBe('18 Sep 2026');
    expect(value('aiPulseValue')).toBe('1');
    expect(value('csmPulseScore')).toBe('3');
    expect(value('pulse')).toBe('good, poor, poor');
  });

  it('shows a dash for what is not known', () => {
    for (const id of ['aiPulseValue', 'csmPulseScore', 'aiPulseScore', 'domain', 'organizations', 'renewalDate', 'nps', 'csatScore', 'pulse', 'pulseRecordedOn'] as const) {
      expect(value(id, initechApac)).toBe('—');
    }
    expect(value('owner', initechApac)).toBe('Unassigned');
  });

  it('offers the five sorts, the groups, and every stage (Churn included) as a bulk target', () => {
    expect(ACCOUNT_SORT_OPTIONS.map((o) => o.value)).toEqual(['risk', 'arr', 'renewal', 'health', 'name']);
    expect(ACCOUNT_GROUP_OPTIONS.map((o) => o.value)).toEqual(['none', 'health', 'owner', 'lifecycle', 'renewal']);
    expect(ACCOUNT_BOARD_GROUP_OPTIONS.map((o) => o.value)).toEqual(['health', 'owner', 'lifecycle', 'renewal']);
    expect(ACCOUNT_LIFECYCLE_TARGETS.map((o) => o.value)).toEqual(['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other']);
  });

  it('names the organisation line: the first one the viewer may open, then +N', () => {
    expect(organisationText(pizzaEmea)).toBe('Pizza Hut +1');
    expect(organisationText(globexNa)).toBe('Globex');
    expect(organisationText(initechApac)).toBeNull();
  });
});

describe('the account parameters', () => {
  it('read organisation, drop product and churned, and keep only the five sorts and four groups', () => {
    const p = parseParams(new URLSearchParams('organisation=7&product=1&include_churned=1&sort=-touch&group=product'), 'health', ACCOUNT_PARAMS);
    expect(p.organisation).toEqual(['7']);
    expect(p.product).toEqual([]);
    expect(p.include_churned).toBe(false);
    expect(p.sort).toBe('-arr');
    expect(p.group).toBe('health');
    expect(parseParams(new URLSearchParams('sort=risk&group=renewal'), 'health', ACCOUNT_PARAMS)).toMatchObject({ sort: 'risk', group: 'renewal' });
  });
});

describe('the row the account page reads', () => {
  it('carries the real account, its first openable organisation and every linked one', () => {
    const row = accountNavRow(pizzaEmea);
    expect(row).toMatchObject({
      id: '12',
      revenactId: 12,
      name: 'Pizza EMEA',
      orgId: 7,
      orgName: 'Pizza Hut',
      orgs: [
        { id: 7, name: 'Pizza Hut' },
        { id: 9, name: 'Yum Brands' },
      ],
      owner: 'Carl CSM',
      ownerId: 2,
      lifecycleStage: 'Live',
      healthCategory: 'average',
      nps: '-80',
      npsValue: -80,
      csat: '62%',
      csatValue: 62,
      arr: 69600,
      mrr: 5800,
      renewal: '9 Aug 2026',
      domain: 'emea.pizzahut.example',
      industry: 'Restaurants',
      aiPulseScore: 'High Risk',
      aiPulseReason: 'Usage fell after the admin left.',
      pulse: [1, 2, 2],
    });
    expect(row.health.val).toBe(4.9);
  });

  it('reads as the old mapper did when nothing is known', () => {
    expect(accountNavRow(initechApac)).toMatchObject({
      orgId: 0,
      orgName: '',
      orgs: [],
      owner: 'Unassigned',
      ownerId: null,
      avatar: '—',
      nps: '0',
      csat: 'N/A',
      aiPulseScore: '—',
      aiPulseReason: '-',
      renewal: '-',
      domain: undefined,
      logo: '',
    });
  });
});
```

Create `src/features/accounts/portfolioApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdateAccounts, exportAccountPortfolio, fetchAccountPortfolio } from './portfolioApi';
import { accountPortfolioQueries, stubAccountsPortfolio } from './testPortfolio';

describe('the Accounts portfolio API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads GET /accounts/portfolio/ with the query it is given', async () => {
    const spy = stubAccountsPortfolio();
    const data = await fetchAccountPortfolio('group=lifecycle&sort=-risk');
    const [query] = accountPortfolioQueries(spy);
    expect(query.get('group')).toBe('lifecycle');
    expect(query.get('sort')).toBe('-risk');
    // Nothing is hidden for churn: Initech APAC (Churn) is in the book.
    expect(data.results.map((row) => row.id)).toEqual([12, 13, 14]);
    expect(data.filters.organisations.map((option) => option.name)).toEqual(['Globex', 'Pizza Hut', 'Yum Brands']);
  });

  it('reads the bare path when there is no query', async () => {
    const spy = stubAccountsPortfolio();
    await fetchAccountPortfolio('');
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/v1\/accounts\/portfolio\/$/);
  });

  it('posts a bulk edit and returns what was updated and what failed', async () => {
    const spy = stubAccountsPortfolio({
      bulk: (body) => ({ updated: [body.ids[0]], failed: [{ id: body.ids[1], reason: 'Not found.' }] }),
    });
    const result = await bulkUpdateAccounts({ ids: [12, 13], action: 'set_lifecycle', value: 'churn' });
    expect(result).toEqual({ updated: [12], failed: [{ id: 13, reason: 'Not found.' }] });
    const call = spy.mock.calls.find(([input]) => String(input).endsWith('/accounts/bulk/'));
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ids: [12, 13], action: 'set_lifecycle', value: 'churn' });
  });

  it('downloads the export through the session, named for the day', async () => {
    const spy = stubAccountsPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await exportAccountPortfolio('organisation=7&sort=-arr', new Date('2026-09-29T12:00:00Z'));

    const call = spy.mock.calls.find(([input]) => String(input).includes('/accounts/portfolio/export.csv'));
    expect(String(call?.[0])).toContain('export.csv?organisation=7&sort=-arr');
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('accounts-2026-09-29.csv');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/features/accounts --maxWorkers=2`
Expected: FAIL. `Failed to resolve import "./portfolioTypes"` (and `./accountFields`, `./portfolioApi`).

- [ ] **Step 4: Implement**

Create `src/features/accounts/portfolioTypes.ts`:

```ts
import type { Option, PortfolioPage, PortfolioRowBase } from '../organizations/portfolioTypes';

// Mirrors revenact-backend's GET /api/v1/accounts/portfolio/ (backend #74,
// docs/API_CONTRACTS.md -> accounts_portfolio). Money is Account.arr as
// stored, already in the workspace's currency.

export interface AccountPortfolioDetails {
  commercial: { arr: number | null; renewal_date: string | null };
  voice: { nps_score: number | null; csat_score: number | null; ai_pulse_reason: string };
  profile: {
    revenact_id: number;
    domain: string;
    industry: string;
    email: string;
    phone: string;
    address: string;
    /** The linked organisations the viewer may open, lowest id first. */
    organisations: { id: number; name: string }[];
  };
  history: {
    created_at: string;
    updated_at: string;
    pulse_recorded_on: string | null;
    csm_pulse_modified_at: string | null;
  };
}

export interface AccountPortfolioRow extends PortfolioRowBase {
  /** The first linked organisation the viewer may open, or null when they
   *  may open none (a hidden one is never named or counted). */
  organisation: { id: number; name: string } | null;
  /** How many more openable organisations it is linked to ("+N"). */
  extra_organisations: number;
  details: AccountPortfolioDetails;
}

export interface AccountFilterOptions {
  organisations: Option[];
  owners: Option[];
  lifecycles: Option[];
}

export type AccountPortfolioResponse = PortfolioPage<AccountPortfolioRow, AccountFilterOptions>;

/** No archive: accounts have neither archive nor churn fields. */
export type AccountBulkAction = 'set_owner' | 'set_lifecycle';

export interface AccountBulkRequest {
  ids: number[];
  action: AccountBulkAction;
  /** A user id, or null to unassign, for set_owner; any stage (Churn
   *  included) for set_lifecycle. */
  value: number | string | null;
}
```

Create `src/features/accounts/portfolioApi.ts`:

```ts
// Thin apiFetch wrappers over revenact-backend's Accounts portfolio endpoints (backend #74).
import { apiFetch } from '../../lib/apiClient';
import { downloadAttachment } from '../files/filesSlice';
import type { BulkResult } from '../organizations/portfolioTypes';
import type { AccountBulkRequest, AccountPortfolioResponse } from './portfolioTypes';

export const ACCOUNTS_PORTFOLIO_PATH = '/accounts/portfolio/';

export function fetchAccountPortfolio(query: string): Promise<AccountPortfolioResponse> {
  return apiFetch<AccountPortfolioResponse>(query ? `${ACCOUNTS_PORTFOLIO_PATH}?${query}` : ACCOUNTS_PORTFOLIO_PATH);
}

/** Every row of the query as CSV with every Account field, fetched with
 *  the session's token (the API never exposes a URL a plain link could open). */
export function exportAccountPortfolio(query: string, today: Date = new Date()): Promise<void> {
  const path = query ? `${ACCOUNTS_PORTFOLIO_PATH}export.csv?${query}` : `${ACCOUNTS_PORTFOLIO_PATH}export.csv`;
  return downloadAttachment({ download_url: path, name: `accounts-${today.toISOString().slice(0, 10)}.csv` });
}

export function bulkUpdateAccounts(body: AccountBulkRequest): Promise<BulkResult> {
  return apiFetch<BulkResult>('/accounts/bulk/', { method: 'POST', body });
}
```

Create `src/features/accounts/portfolioParams.ts`:

```ts
import type { ParamSpec } from '../organizations/portfolioParams';

/** The Accounts portfolio's URL parameters (backend #74): organisation
 *  instead of product, no churned switch, five sorts and four groups. */
export const ACCOUNT_PARAMS: ParamSpec = {
  sortKeys: ['risk', 'arr', 'renewal', 'health', 'name'],
  groupKeys: ['health', 'lifecycle', 'owner', 'renewal'],
  product: false,
  churned: false,
  organisation: true,
};
```

Create `src/features/accounts/accountFields.ts`:

```ts
import type { CurrencyCode } from '../auth/authSlice';
import { LIFECYCLE_LABELS, formatDate, formatMoney } from '../customers/formatters';
import { pulseWords, signed } from '../organizations/portfolioFields';
import type { GroupOption } from '../organizations/portfolioGroups';
import type { PortfolioNoun } from '../organizations/portfolioLabels';
import { LIFECYCLE_VALUES } from '../organizations/portfolioParams';
import type { Option } from '../organizations/portfolioTypes';
import type { AccountPortfolioRow } from './portfolioTypes';

// Every Account field, with the one place the portfolio shows it (spec
// 2026-09-29 §1 "Opened row"). The ids are the backend's own
// (services/accounts_portfolio/fields.py), so the CSV and this registry name
// the same 24; the coverage test renders an opened row and finds each once.

export const ACCOUNT_NOUN: PortfolioNoun = { one: 'account', many: 'accounts' };

export type AccountPanelKey = 'commercial' | 'voice' | 'profile' | 'history';

export type AccountFieldId =
  | 'account'
  | 'owner'
  | 'lifecycleStage'
  | 'health'
  | 'pulse'
  | 'aiPulseScore'
  | 'aiPulseValue'
  | 'csmPulseScore'
  | 'arr'
  | 'renewalDate'
  | 'nps'
  | 'csatScore'
  | 'aiPulseReason'
  | 'revenactId'
  | 'organizations'
  | 'domain'
  | 'industry'
  | 'email'
  | 'phone'
  | 'address'
  | 'createdDate'
  | 'modifiedDate'
  | 'pulseRecordedOn'
  | 'csmPulseModifiedAt';

export const ACCOUNT_PANELS: { key: AccountPanelKey; title: string }[] = [
  { key: 'commercial', title: 'Commercial' },
  { key: 'voice', title: 'Voice of the customer' },
  { key: 'profile', title: 'Profile' },
  { key: 'history', title: 'History' },
];

export const ACCOUNT_PANEL_ORDER: Record<AccountPanelKey, AccountFieldId[]> = {
  commercial: ['arr', 'renewalDate'],
  voice: ['nps', 'csatScore', 'aiPulseReason'],
  profile: ['revenactId', 'organizations', 'domain', 'industry', 'email', 'phone', 'address'],
  history: ['createdDate', 'modifiedDate', 'pulseRecordedOn', 'csmPulseModifiedAt'],
};

export interface AccountFieldDef {
  id: AccountFieldId;
  label: string;
  place: 'header' | AccountPanelKey;
  value: (row: AccountPortfolioRow, currency: CurrencyCode) => string;
}

const DASH = '—';
const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : DASH);
const text = (s: string) => s.trim() || DASH;
const whole = (n: number | null) => (n == null ? DASH : String(n));
const pct = (n: number | null) => (n == null ? DASH : `${n}%`);

type Def = Omit<AccountFieldDef, 'id'>;
const defs: Record<AccountFieldId, Def> = {
  account: { label: 'Account', place: 'header', value: (r) => r.name },
  owner: { label: 'Owner', place: 'header', value: (r) => r.owner?.name ?? 'Unassigned' },
  lifecycleStage: { label: 'Lifecycle stage', place: 'header', value: (r) => r.lifecycle.label },
  health: { label: 'Health', place: 'header', value: (r) => r.health.score.toFixed(1) },
  pulse: { label: 'Pulse', place: 'header', value: (r) => pulseWords(r.pulse.history) },
  aiPulseScore: { label: 'AI pulse score', place: 'header', value: (r) => text(r.pulse.ai_label) },
  aiPulseValue: { label: 'AI pulse', place: 'header', value: (r) => whole(r.pulse.ai) },
  csmPulseScore: { label: 'CSM pulse', place: 'header', value: (r) => whole(r.pulse.csm) },

  arr: {
    label: 'ARR',
    place: 'commercial',
    value: (r, currency) => (r.details.commercial.arr == null ? DASH : formatMoney(r.details.commercial.arr, currency)),
  },
  renewalDate: { label: 'Renewal', place: 'commercial', value: (r) => day(r.details.commercial.renewal_date) },

  nps: { label: 'NPS', place: 'voice', value: (r) => signed(r.details.voice.nps_score) },
  csatScore: { label: 'CSAT', place: 'voice', value: (r) => pct(r.details.voice.csat_score) },
  aiPulseReason: { label: 'AI pulse reason', place: 'voice', value: (r) => text(r.details.voice.ai_pulse_reason) },

  revenactId: { label: 'Revenact ID', place: 'profile', value: (r) => String(r.details.profile.revenact_id) },
  organizations: {
    label: 'Organizations',
    place: 'profile',
    value: (r) => r.details.profile.organisations.map((org) => org.name).join(', ') || DASH,
  },
  domain: { label: 'Domain', place: 'profile', value: (r) => text(r.details.profile.domain) },
  industry: { label: 'Industry', place: 'profile', value: (r) => text(r.details.profile.industry) },
  email: { label: 'Email', place: 'profile', value: (r) => text(r.details.profile.email) },
  phone: { label: 'Phone', place: 'profile', value: (r) => text(r.details.profile.phone) },
  address: { label: 'Address', place: 'profile', value: (r) => text(r.details.profile.address) },

  createdDate: { label: 'Created', place: 'history', value: (r) => day(r.details.history.created_at) },
  modifiedDate: { label: 'Updated', place: 'history', value: (r) => day(r.details.history.updated_at) },
  pulseRecordedOn: { label: 'Pulse recorded on', place: 'history', value: (r) => day(r.details.history.pulse_recorded_on) },
  csmPulseModifiedAt: { label: 'CSM pulse set', place: 'history', value: (r) => day(r.details.history.csm_pulse_modified_at) },
};

export const ACCOUNT_FIELDS = Object.fromEntries(
  Object.entries(defs).map(([id, def]) => [id, { id: id as AccountFieldId, ...def }]),
) as Record<AccountFieldId, AccountFieldDef>;

export const ACCOUNT_HEADER_FIELDS: AccountFieldId[] = Object.values(ACCOUNT_FIELDS)
  .filter((field) => field.place === 'header')
  .map((field) => field.id);

/** The backend's five sorts (risk, ARR, renewal, health, name). */
export const ACCOUNT_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'risk', label: 'Risk' },
  { value: 'arr', label: 'ARR' },
  { value: 'renewal', label: 'Renewal date' },
  { value: 'health', label: 'Health score' },
  { value: 'name', label: 'Name' },
];

export const ACCOUNT_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: 'None' },
  { value: 'health', label: 'Health' },
  { value: 'owner', label: 'Owner' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'renewal', label: 'Renewal window' },
];

/** The Board always has columns, so it offers no "None". */
export const ACCOUNT_BOARD_GROUP_OPTIONS: GroupOption[] = ACCOUNT_GROUP_OPTIONS.filter((option) => option.value !== 'none');

/** Every stage, Churn included: an account has no churn flow of its own,
 *  so Churn is only a stage (the backend's bulk edit accepts it). */
export const ACCOUNT_LIFECYCLE_TARGETS: Option[] = LIFECYCLE_VALUES.map((value) => ({ value, name: LIFECYCLE_LABELS[value] }));

/** "Pizza Hut", "Pizza Hut +1", or null when the viewer may open none of
 *  the account's organisations. */
export function organisationText(row: Pick<AccountPortfolioRow, 'organisation' | 'extra_organisations'>): string | null {
  if (!row.organisation) return null;
  return row.extra_organisations > 0 ? `${row.organisation.name} +${row.extra_organisations}` : row.organisation.name;
}
```

Create `src/features/accounts/accountNavState.ts`:

```ts
import type { AccountRow } from '../../components/organizations/accountsData';
import { HEALTH_COLORS, LIFECYCLE_LABELS, formatDate, initials } from '../customers/formatters';
import type { AccountPortfolioRow } from './portfolioTypes';

/** The row `/accounts/:id` (pages/accounts/Details.tsx, until delivery 2)
 *  reads from `location.state.account`, built from a portfolio row as
 *  mapAccountToAccountRow built it from GET /accounts/. The first openable
 *  organisation stands in for the parent the old mapper was given; with
 *  none, the page's organisation-scoped reads have no id (0), as before for
 *  an unknown parent. */
export function accountNavRow(row: AccountPortfolioRow): AccountRow {
  const profile = row.details.profile;
  const nps = row.details.voice.nps_score;
  const csat = row.details.voice.csat_score;
  const arr = row.arr ?? 0;
  return {
    orgId: row.organisation?.id ?? 0,
    id: String(row.id),
    name: row.name,
    orgName: row.organisation?.name ?? '',
    orgs: profile.organisations,
    // No third-party logo (house rule): the page's avatar falls back to initials.
    logo: '',
    revenactId: row.id,
    domain: profile.domain || undefined,
    location: profile.address || undefined,
    email: profile.email || undefined,
    phone: profile.phone || undefined,
    industry: profile.industry || undefined,
    pulse: row.pulse.history,
    // The server's label for the AI category ("High Risk"), as AI_PULSE_LABELS printed it.
    aiPulseScore: row.pulse.ai_label || '—',
    aiPulseReason: row.pulse.reason || '-',
    owner: row.owner?.name ?? 'Unassigned',
    ownerId: row.owner?.id ?? null,
    ownerFunction: null,
    accountPulse: null,
    avatar: row.owner ? initials(row.owner.name) : '—',
    health: { val: row.health.score, clr: HEALTH_COLORS[row.health.category] },
    healthCategory: row.health.category,
    nps: nps === null ? '0' : `${nps > 0 ? '+' : ''}${nps}`,
    npsValue: nps ?? 0,
    csat: csat === null ? 'N/A' : `${csat}%`,
    csatValue: csat ?? 0,
    lifecycleStage: LIFECYCLE_LABELS[row.lifecycle.value] ?? 'Other',
    mrr: Math.round(arr / 12),
    arr,
    renewal: formatDate(row.renewal.date),
  };
}
```


- [ ] **Step 5: Run the tests and the types**

Run: `npx vitest run src/features/accounts --maxWorkers=2`
Expected: PASS (12 tests in 2 files).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts
git commit -m "$(cat <<'EOF'
feat(accounts): the portfolio contract, field registry, link state and test stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The account's four panels and the account kind

**Files:**
- Create: `src/components/accounts/portfolio/AccountPanels.tsx`
- Create: `src/components/accounts/portfolio/accountKind.ts`
- Test: `src/components/accounts/portfolio/AccountPanels.test.tsx`, `src/components/accounts/portfolio/accountKind.test.tsx`, `src/components/accounts/portfolio/fieldCoverage.test.tsx`, `src/components/accounts/portfolio/houseRules.test.ts`

**Interfaces:**
- Consumes (Tasks 2–6): `PortfolioKind`, `DetailsProps`, `PortfolioKindContext`, `subtitleText`, `touchText` (rowParts), `timelinePositions` and `npsBand` (`organizations/portfolio/AccountDetails`), `BUTTON` and `FOCUS` (styles), `ACCOUNT_FIELDS`, `ACCOUNT_PANELS`, `ACCOUNT_PANEL_ORDER`, `ACCOUNT_NOUN`, `ACCOUNT_SORT_OPTIONS`, `ACCOUNT_GROUP_OPTIONS`, `ACCOUNT_BOARD_GROUP_OPTIONS`, `organisationText`, `accountNavRow`, `ACCOUNT_PARAMS`, `fetchAccountPortfolio`, `updateAccount` (customersSlice), and the Task 6 fixtures and stub.
- Produces:

```ts
export function AccountPanels(props: DetailsProps<AccountPortfolioRow>): JSX.Element; // row, currency, id?, today?, onEdit?, stacked?
export const ACCOUNT_KIND: PortfolioKind<AccountPortfolioRow>;
```

- [ ] **Step 1: Write the failing tests**

Create `src/components/accounts/portfolio/AccountPanels.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DetailsProps } from '../../organizations/portfolio/portfolioKind';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { globexNa, initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountPanels } from './AccountPanels';

function renderPanels(props: Partial<DetailsProps<AccountPortfolioRow>> & { row: AccountPortfolioRow }) {
  return render(
    <MemoryRouter>
      <AccountPanels currency="USD" today="2026-09-29" {...props} />
    </MemoryRouter>,
  );
}
const panel = (key: string) => document.querySelector(`[data-panel="${key}"]`) as HTMLElement;

describe('AccountPanels', () => {
  it('shows the four panels, money in the workspace currency and an overdue renewal on its timeline', () => {
    renderPanels({ row: pizzaEmea });
    for (const title of ['Commercial', 'Voice of the customer', 'Profile', 'History']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(panel('commercial').querySelector('[data-field="arr"]')).toHaveTextContent('$69,600.00');
    const renewal = panel('commercial').querySelector('[data-field="renewalDate"]');
    expect(renewal).toHaveTextContent('9 Aug 2026');
    expect(renewal).toHaveClass('text-danger');
    expect(panel('commercial').querySelector('[data-mark="renewalDate"]')).toHaveClass('bg-danger');
    expect(panel('commercial').querySelector('[data-mark="today"]')).not.toBeNull();
    expect(within(panel('voice')).getByText('Detractor')).toBeInTheDocument();
    expect(panel('voice').querySelector('[data-field="nps"]')).toHaveTextContent('−80');
    expect(panel('voice').querySelector('[data-field="csatScore"]')).toHaveTextContent('62%');
    expect(panel('voice').querySelector('blockquote')).toHaveTextContent('Usage fell after the admin left.');
    expect(panel('history').querySelector('[data-field="csmPulseModifiedAt"]')).toHaveTextContent('18 Sep 2026');
  });

  it('links each organisation the viewer may open, with this account chosen there', () => {
    renderPanels({ row: pizzaEmea });
    expect(within(panel('profile')).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7?account=12');
    expect(within(panel('profile')).getByRole('link', { name: 'Yum Brands' })).toHaveAttribute('href', '/organizations/9?account=12');
    expect(panel('profile').querySelector('[data-field="revenactId"]')).toHaveTextContent('12');
    expect(panel('profile').querySelector('[data-field="industry"]')).toHaveTextContent('Restaurants');
  });

  it('shows a dash for what is not known, and no timeline without a renewal date', () => {
    renderPanels({ row: initechApac });
    expect(panel('commercial').querySelector('[data-mark]')).toBeNull();
    expect(panel('commercial').querySelector('[data-field="renewalDate"]')).toHaveTextContent('—');
    expect(panel('profile').querySelector('[data-field="organizations"]')).toHaveTextContent('—');
    expect(panel('profile').querySelector('[data-field="domain"]')).toHaveTextContent('—');
    expect(within(panel('voice')).getByText('No NPS yet')).toBeInTheDocument();
  });

  it('offers Edit details only when given onEdit, and stacks in one column when asked', async () => {
    const onEdit = vi.fn();
    const { container } = renderPanels({ row: globexNa, onEdit, stacked: true, id: 'details-13' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledWith(13);
    expect(container.querySelector('#details-13')).not.toHaveClass('md:grid-cols-2');
  });

  it('has no Edit details without onEdit', () => {
    renderPanels({ row: globexNa });
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});
```

Create `src/components/accounts/portfolio/accountKind.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../../features/customers/customersSlice';
import { accountNavRow } from '../../../features/accounts/accountNavState';
import { accountPatches, accountPortfolioQueries, globexNa, initechApac, pizzaEmea, stubAccountsPortfolio } from '../../../features/accounts/testPortfolio';
import { parseParams } from '../../../features/organizations/portfolioParams';
import type { AppDispatch } from '../../../store';
import { BoardCard } from '../../organizations/portfolio/BoardCard';
import { PortfolioKindContext, subtitleText } from '../../organizations/portfolio/portfolioKind';
import { ACCOUNT_KIND } from './accountKind';

const cardProps = {
  currency: 'USD' as const,
  isSm: true,
  open: false,
  canMove: true,
  moveDisabled: false,
  onOpen: vi.fn(),
  onMove: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
};

describe('ACCOUNT_KIND', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names an account by its organisation, owner, stage and last touch', () => {
    expect(subtitleText(ACCOUNT_KIND.subtitle(pizzaEmea))).toBe('Pizza Hut +1 · Carl CSM · Live · Touched 33d ago');
    expect(subtitleText(ACCOUNT_KIND.subtitle(globexNa))).toBe('Globex · Priya · Adoption · Touched 2d ago');
    expect(subtitleText(ACCOUNT_KIND.subtitle(initechApac))).toBe('Unassigned · Churn · Never contacted');
    expect(ACCOUNT_KIND.subtitle(pizzaEmea).map((part) => part.field)).toEqual([undefined, 'owner', 'lifecycleStage', undefined]);
    expect(ACCOUNT_KIND.cardSubtitle(pizzaEmea)).toBe('Pizza Hut +1');
    expect(ACCOUNT_KIND.cardSubtitle(initechApac)).toBe('Unassigned');
  });

  it('links to the account page with the row that page reads', () => {
    expect(ACCOUNT_KIND.href(pizzaEmea)).toBe('/accounts/12');
    expect(ACCOUNT_KIND.linkState(pizzaEmea)).toEqual({ account: accountNavRow(pizzaEmea) });
  });

  it('has no archive, no churn form and nothing hidden for churn', () => {
    const filtered = parseParams(new URLSearchParams('owner=2'), 'health', ACCOUNT_KIND.params);
    const bare = parseParams(new URLSearchParams(), 'health', ACCOUNT_KIND.params);
    expect(ACCOUNT_KIND.status(pizzaEmea)).toBeNull();
    expect(ACCOUNT_KIND.churnVisible(bare)).toBe(true);
    expect(ACCOUNT_KIND.churnByModal).toBe(false);
    expect(ACCOUNT_KIND.addsTo('churn')).toBe(true);
    expect(ACCOUNT_KIND.totalQuery(filtered)).toBe('limit=1');
    expect(ACCOUNT_KIND.totalQuery(bare)).toBeNull();
    expect(ACCOUNT_KIND.renewalWindow).toBe('90');
    expect(ACCOUNT_KIND.filters).toEqual({ product: false, organisation: true, churned: false });
  });

  it('edits and moves only an account with an organisation the viewer may open', () => {
    expect(ACCOUNT_KIND.editable(pizzaEmea)).toBe(true);
    expect(ACCOUNT_KIND.editable(initechApac)).toBe(false);
  });

  it('reads GET /accounts/portfolio/, and saves a stage through the account update on its first openable organisation', async () => {
    const spy = stubAccountsPortfolio();
    const data = await ACCOUNT_KIND.fetch('sort=-arr');
    expect(data.count).toBe(3);
    expect(accountPortfolioQueries(spy)).toHaveLength(1);
    const store = configureStore({ reducer: { customers: customersReducer } });
    await ACCOUNT_KIND.saveStage(pizzaEmea, 'churn', store.dispatch as unknown as AppDispatch);
    expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: { lifecycle_stage: 'churn' } }]);
  });

  it('draws a Board card with the organisation, and Move to… only for an account it can save', () => {
    render(
      <MemoryRouter>
        <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
          <ul>
            <BoardCard row={pizzaEmea} {...cardProps} />
            <BoardCard row={initechApac} {...cardProps} />
          </ul>
        </PortfolioKindContext.Provider>
      </MemoryRouter>,
    );
    const pizza = document.querySelector('[data-card-id="12"]') as HTMLElement;
    expect(within(pizza).getByText('Pizza Hut +1')).toBeInTheDocument();
    expect(within(pizza).getByRole('button', { name: 'Move Pizza EMEA to…' })).toBeInTheDocument();
    expect(within(pizza).getByRole('link', { name: 'Pizza EMEA' })).toHaveAttribute('href', '/accounts/12');
    const initech = document.querySelector('[data-card-id="14"]') as HTMLElement;
    expect(within(initech).queryByRole('button', { name: 'Move Initech APAC to…' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Initech APAC' })).toHaveAttribute('href', '/accounts/14');
  });
});
```

Create `src/components/accounts/portfolio/fieldCoverage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNT_FIELDS, type AccountFieldId } from '../../../features/accounts/accountFields';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountRow } from '../../organizations/portfolio/AccountRow';
import { PortfolioKindContext } from '../../organizations/portfolio/portfolioKind';
import { AccountPanels } from './AccountPanels';
import { ACCOUNT_KIND } from './accountKind';

// The spec's promise (§1 "Opened row"): every account field appears exactly
// once, in the row's header or one of the four panels.
function renderOpened(row: AccountPortfolioRow) {
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
        <ul>
          <AccountRow
            row={row}
            currency="USD"
            pins={[]}
            isSm
            selecting={false}
            selected={false}
            open
            onToggleSelect={() => {}}
            onLongPress={() => {}}
            onToggleOpen={() => {}}
          >
            <AccountPanels row={row} currency="USD" today="2026-09-29" />
          </AccountRow>
        </ul>
      </PortfolioKindContext.Provider>
    </MemoryRouter>,
  ).container;
}

const IDS = Object.keys(ACCOUNT_FIELDS) as AccountFieldId[];

describe('the 24 account fields', () => {
  it('are the list this test walks', () => {
    expect(IDS).toHaveLength(24);
  });

  it.each(IDS.map((id) => [id, ACCOUNT_FIELDS[id].label] as const))(
    '%s (%s) renders exactly once, in the header or its panel',
    (id) => {
      const container = renderOpened(pizzaEmea);
      const found = container.querySelectorAll(`[data-field~="${id}"]`);
      expect(found).toHaveLength(1);
      // A field shows text, or (the ring, the pulse dots) is an image with a spoken name.
      const said = found[0].textContent?.trim() || found[0].getAttribute('aria-label')?.trim();
      expect(said ?? '').not.toBe('');
      const place = ACCOUNT_FIELDS[id].place;
      if (place === 'header') {
        expect(found[0].closest('[data-part="header"]')).not.toBeNull();
      } else {
        expect(found[0].closest(`[data-panel="${place}"]`)).not.toBeNull();
      }
    },
  );
});
```

Create `src/components/accounts/portfolio/houseRules.test.ts`:

```ts
import { houseRuleSuite } from '../../../test/houseRules';

// The portfolio's house rules over the Accounts panels (the scanners live in
// src/test/houseRules.ts).
houseRuleSuite(
  'accounts portfolio house rules',
  import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/accounts/portfolio --maxWorkers=2`
Expected: FAIL. `Failed to resolve import "./AccountPanels"` (and `./accountKind`). The house-rules suite's "has sources to check" fails: it has no source files yet, only tests.

- [ ] **Step 3: Implement**

Create `src/components/accounts/portfolio/AccountPanels.tsx`:

```tsx
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { ACCOUNT_FIELDS, ACCOUNT_PANELS, type AccountFieldId, type AccountPanelKey } from '../../../features/accounts/accountFields';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { npsBand, timelinePositions } from '../../organizations/portfolio/AccountDetails';
import type { DetailsProps } from '../../organizations/portfolio/portfolioKind';
import { BUTTON, FOCUS } from '../../organizations/portfolio/styles';

type Row = AccountPortfolioRow;

function Panel({ panel, children }: { panel: AccountPanelKey; children: ReactNode }) {
  const title = ACCOUNT_PANELS.find((p) => p.key === panel)?.title ?? panel;
  // A headed section with no accessible name: four per opened row would
  // otherwise each be a region landmark.
  return (
    <section data-panel={panel} className="min-w-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function Pairs({
  row,
  currency,
  ids,
  mono = true,
  tone = {},
}: {
  row: Row;
  currency: CurrencyCode;
  ids: AccountFieldId[];
  mono?: boolean;
  tone?: Partial<Record<AccountFieldId, string>>;
}) {
  return (
    // The label column fits its longest label (up to 60%), and a long value
    // wraps in the rest: a label is never cut short by its value.
    <dl className="grid grid-cols-[fit-content(60%)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
      {ids.map((id) => (
        <Fragment key={id}>
          <dt className="break-words text-ink-muted">{ACCOUNT_FIELDS[id].label}</dt>
          <dd
            data-field={id}
            className={`text-right break-words ${mono ? 'font-mono-brand tabular-nums' : ''} ${tone[id] ?? 'text-ink'}`}
          >
            {ACCOUNT_FIELDS[id].value(row, currency)}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** ARR, and the renewal date on a line with today marked (danger when overdue). */
function CommercialPanel({ row, currency, today }: { row: Row; currency: CurrencyCode; today: string }) {
  const renewal = row.details.commercial.renewal_date;
  const { marks, today: todayAt } = timelinePositions([renewal], today);
  const overdue = row.renewal.days != null && row.renewal.days < 0;
  return (
    <Panel panel="commercial">
      {renewal ? (
        <>
          <div className="relative h-6" aria-hidden="true">
            <span className="absolute left-0 right-0 top-1/2 h-px bg-line" />
            {marks[0] == null ? null : (
              <span
                data-mark="renewalDate"
                className={`absolute top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${overdue ? 'bg-danger' : 'bg-ink-muted'}`}
                style={{ left: `${marks[0]}%` }}
              />
            )}
            {todayAt == null ? null : (
              <span data-mark="today" className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-ink" style={{ left: `${todayAt}%` }} />
            )}
          </div>
          <p className="mb-2 text-[11px] text-ink-muted">The dot marks the renewal date. The line marks today.</p>
        </>
      ) : null}
      <Pairs row={row} currency={currency} ids={['arr', 'renewalDate']} tone={overdue ? { renewalDate: 'text-danger font-semibold' } : {}} />
    </Panel>
  );
}

/** NPS on its −100…+100 bar with its band in words, CSAT, and the AI pulse reason as a quote. */
function VoicePanel({ row, currency }: { row: Row; currency: CurrencyCode }) {
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
      <Pairs row={row} currency={currency} ids={['nps', 'csatScore']} />
      <p className="mt-3 text-[11px] text-ink-muted">{ACCOUNT_FIELDS.aiPulseReason.label}</p>
      <blockquote data-field="aiPulseReason" className="mt-1 border-l-2 border-line pl-3 text-[13px] text-ink">
        {ACCOUNT_FIELDS.aiPulseReason.value(row, currency)}
      </blockquote>
    </Panel>
  );
}

/** The Revenact ID, the organisations as links (each opens with this
 *  account's chip chosen), then contact details. */
function ProfilePanel({ row, currency }: { row: Row; currency: CurrencyCode }) {
  const organisations = row.details.profile.organisations;
  return (
    <Panel panel="profile">
      <Pairs row={row} currency={currency} ids={['revenactId']} />
      <p className="mt-2 text-[13px] text-ink-muted">{ACCOUNT_FIELDS.organizations.label}</p>
      <div data-field="organizations" className="mt-1 flex flex-wrap gap-x-3 text-[13px]">
        {organisations.length ? (
          organisations.map((organisation) => (
            <Link
              key={organisation.id}
              to={`/organizations/${organisation.id}?account=${row.id}`}
              className={`inline-flex min-h-11 items-center rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`}
            >
              {organisation.name}
            </Link>
          ))
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </div>
      <div className="mt-2">
        <Pairs row={row} currency={currency} ids={['domain', 'industry', 'email', 'phone', 'address']} mono={false} />
      </div>
    </Panel>
  );
}

/** Every account field the row header does not show, in four panels (spec
 *  2026-09-29 §1 "Opened row"). Part of its row: grouped by whitespace, never
 *  boxed, so there is no card in a card. */
export function AccountPanels({
  row,
  currency,
  id,
  today = new Date().toISOString().slice(0, 10),
  onEdit,
  stacked = false,
}: DetailsProps<AccountPortfolioRow>) {
  return (
    <div
      id={id}
      className={`grid gap-x-8 gap-y-5 border-t border-line-subtle px-3 pt-3 pb-4 ${stacked ? '' : 'md:grid-cols-2 xl:grid-cols-4'}`}
    >
      <CommercialPanel row={row} currency={currency} today={today} />
      <VoicePanel row={row} currency={currency} />
      <ProfilePanel row={row} currency={currency} />
      <Panel panel="history">
        <Pairs row={row} currency={currency} ids={['createdDate', 'modifiedDate', 'pulseRecordedOn', 'csmPulseModifiedAt']} mono={false} />
      </Panel>
      {onEdit ? (
        <div className={`flex justify-end ${stacked ? '' : 'md:col-span-2 xl:col-span-4'}`}>
          <button type="button" onClick={() => onEdit(row.id)} className={BUTTON}>
            <Pencil className="w-4 h-4" aria-hidden="true" />
            Edit details
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

Create `src/components/accounts/portfolio/accountKind.ts`:

```ts
import { createElement } from 'react';
import { updateAccount } from '../../../features/customers/customersSlice';
import {
  ACCOUNT_BOARD_GROUP_OPTIONS,
  ACCOUNT_GROUP_OPTIONS,
  ACCOUNT_NOUN,
  ACCOUNT_SORT_OPTIONS,
  organisationText,
} from '../../../features/accounts/accountFields';
import { accountNavRow } from '../../../features/accounts/accountNavState';
import { fetchAccountPortfolio } from '../../../features/accounts/portfolioApi';
import { ACCOUNT_PARAMS } from '../../../features/accounts/portfolioParams';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { hasFilters } from '../../../features/organizations/portfolioParams';
import type { PortfolioKind } from '../../organizations/portfolio/portfolioKind';
import { touchText } from '../../organizations/portfolio/rowParts';
import { AccountPanels } from './AccountPanels';

/** The Accounts portfolio (spec 2026-09-29 §1): GET /accounts/portfolio/,
 *  nothing hidden for churn (Churn is an ordinary stage, with no form of its
 *  own), organisation as a filter, four panels, and the account page with
 *  its row in the link. A move saves through the single-account PATCH on
 *  the first linked organisation the viewer may open. */
export const ACCOUNT_KIND: PortfolioKind<AccountPortfolioRow> = {
  noun: ACCOUNT_NOUN,
  nameField: 'account',
  params: ACCOUNT_PARAMS,
  sortOptions: ACCOUNT_SORT_OPTIONS,
  groupOptions: ACCOUNT_GROUP_OPTIONS,
  boardGroupOptions: ACCOUNT_BOARD_GROUP_OPTIONS,
  filters: { product: false, organisation: true, churned: false },
  renewalWindow: '90',
  pulseValueField: 'aiPulseValue csmPulseScore',
  churnByModal: false,
  fetch: (query) => fetchAccountPortfolio(query),
  // No churn to scope: M is the whole visible book.
  totalQuery: (params) => (hasFilters(params) ? 'limit=1' : null),
  churnVisible: () => true,
  saveStage: (row, to, dispatch) => {
    // `editable` keeps Move to… off such a row; this only guards the type.
    if (!row.organisation) return Promise.reject(`${row.name} has no organization you can open.`);
    return dispatch(updateAccount({ customerId: row.organisation.id, id: row.id, lifecycle_stage: to })).unwrap();
  },
  addsTo: () => true,
  // Editing and moving address /customers/<cid>/accounts/<id>/, which needs
  // a linked organisation the viewer may open.
  editable: (row) => row.organisation !== null,
  href: (row) => `/accounts/${row.id}`,
  linkState: (row) => ({ account: accountNavRow(row) }),
  subtitle: (row) => {
    const organisation = organisationText(row);
    return [
      ...(organisation ? [{ text: organisation }] : []),
      { text: row.owner?.name ?? 'Unassigned', field: 'owner' },
      { text: row.lifecycle.label, field: 'lifecycleStage' },
      { text: touchText(row.last_touch_days) },
    ];
  },
  cardSubtitle: (row) => organisationText(row) ?? row.owner?.name ?? 'Unassigned',
  status: () => null,
  renderDetails: (props) => createElement(AccountPanels, props),
};
```

- [ ] **Step 4: Run the tests, the Organizations portfolio tests and the types**

Run: `npx vitest run src/components/accounts/portfolio --maxWorkers=2`
Expected: PASS: AccountPanels 5, accountKind 6, fieldCoverage 25, house rules (every check green).

Run: `npx vitest run src/components/organizations/portfolio --maxWorkers=2`
Expected: every file passes.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/accounts/portfolio
git commit -m "$(cat <<'EOF'
feat(accounts): the four panels and the account portfolio kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The Accounts list, and the framed Accounts top bar

**Files:**
- Modify: `src/pages/accounts/List.tsx` (whole file)
- Create: `src/pages/accounts/useAccountEditing.ts`
- Create: `src/pages/accounts/testList.tsx` (test only)
- Modify: `src/pages/accounts/List.test.tsx` (whole file)
- Modify: `src/components/layout/Navbar.tsx`
- Modify: `src/components/layout/Navbar.test.tsx` (append)

**Interfaces:**
- Consumes (Tasks 2–7): `ACCOUNT_KIND`, `AccountPanels`, `PortfolioKindContext`, `usePortfolio<R, F>`, `usePortfolioParams`, `useSelection`, `AccountRow`, `AccountSheet`, `PortfolioSections`, `PortfolioToolbar`, `FilterChips`, `SelectionBar` (`keepChurn`), `SummaryTiles`, `ownerTargets`, `ACCOUNT_LIFECYCLE_TARGETS`, `bulkUpdateAccounts`, `exportAccountPortfolio`, `AccountFormModal` (unchanged), `OrganizationsFrame` (unchanged), and the Task 6 stub.
- Produces:

```ts
// pages/accounts/List.tsx
export function List(): JSX.Element; // App.tsx already routes /accounts/list to it as AccountsList
// pages/accounts/useAccountEditing.ts
export function useAccountEditing(onError: (message: string) => void): {
  remember: (rows: AccountPortfolioRow[]) => void; nameOf: (id: number) => string;
  editing: Account | null; openEdit: (id: number) => Promise<void>; closeEdit: () => void;
  adding: { stage?: LifecycleValue } | null; openAdd: (stage?: LifecycleValue) => void; closeAdd: () => void;
  companies: { id: number; name: string }[];
};
// pages/accounts/testList.tsx (test only)
export function Where(): JSX.Element;
export function renderAccounts(url: string, options?: { width?: number; nav?: boolean }): { store };
```

- [ ] **Step 1: Write the test harness**

Create `src/pages/accounts/testList.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import customersReducer from '../../features/customers/customersSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Board } from './Board';
import { List } from './List';

// Test-only. Both Accounts routes on the real auth, customers and
// notifications slices and the real router, as App.tsx routes them. Only
// fetch is stubbed, by the caller, with stubAccountsPortfolio().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

/** Stands in for /accounts/:id (Details.tsx), saying which row it was handed. */
function AccountPage() {
  const location = useLocation();
  const account = (location.state as { account?: { name: string; orgId: number } } | null)?.account;
  return <p data-testid="account-page">{account ? `${account.name} · organization ${account.orgId}` : 'No account state'}</p>;
}

function makeStore() {
  return configureStore({
    reducer: { customers: customersReducer, auth: authReducer, notifications: notificationsReducer },
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
}

/** Both Accounts views (and the pages they link to) on the real store and
 *  router. `nav` adds the real Navbar, whose List/Board tabs switch views
 *  carrying the query. */
export function renderAccounts(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              path="/accounts/list"
              element={
                <>
                  <List />
                  <Where />
                </>
              }
            />
            <Route
              path="/accounts/board"
              element={
                <>
                  <Board />
                  <Where />
                </>
              }
            />
            <Route
              path="/accounts/:id"
              element={
                <>
                  <AccountPage />
                  <Where />
                </>
              }
            />
            <Route path="/organizations/:id" element={<p>Organization page</p>} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

(`Board` is still the old page until Task 9; it renders and is not exercised by this task's tests.)

- [ ] **Step 2: Write the failing tests**

Replace the whole of `src/pages/accounts/List.test.tsx` with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  accountBulkBodies,
  accountPatches,
  accountPortfolioQueries,
  stubAccountsPortfolio,
} from '../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderAccounts } from './testList';

// Integration tier: the real page, store and router; fetch stubbed with
// backend #74's shapes (features/accounts/testPortfolio.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
type Spy = ReturnType<typeof stubAccountsPortfolio>;
const paths = (spy: Spy) => spy.mock.calls.map(([input]) => new URL(String(input)).pathname.replace(/^\/api\/v1/, ''));
const exports = (spy: Spy) =>
  spy.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith('/accounts/portfolio/export.csv'));

describe('Accounts list (portfolio)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('shows accounts as rows under the tiles, reading only the portfolio', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    const pizza = await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(pizza.closest('li')).toHaveTextContent('Pizza Hut +1 · Carl CSM · Live · Touched 33d ago');
    expect(await screen.findByRole('link', { name: 'Globex NA' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Initech APAC' })).toBeInTheDocument();
    expect(screen.getByText('3 accounts')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByText('within 90 days, overdue included')).toBeInTheDocument();
    expect([...new Set(paths(spy).filter((path) => path.startsWith('/accounts')))]).toEqual(['/accounts/portfolio/']);
  });

  it('keeps the filters, sort and group in the URL, with chips and "N of M accounts"', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(within(sort).getAllByRole('option').map((option) => option.textContent)).toEqual(['Risk', 'ARR', 'Renewal date', 'Health score', 'Name']);
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual(['None', 'Health', 'Owner', 'Lifecycle', 'Renewal window']);
    await userEvent.selectOptions(sort, 'risk');
    await waitFor(() => expect(where().searchParams.get('sort')).toBe('-risk'));

    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).queryByRole('group', { name: 'Product' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Include churned' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Pizza Hut' }));
    await waitFor(() => expect(where().searchParams.get('organisation')).toBe('7'));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 3 accounts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Organization: Pizza Hut' })).toBeInTheDocument();
    expect(accountPortfolioQueries(spy).some((query) => query.get('organisation') === '7' && query.get('sort') === '-risk')).toBe(true);
  });

  it("opens an account's page from its name, carrying the row that page reads", async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    expect(await screen.findByTestId('account-page')).toHaveTextContent('Pizza EMEA · organization 7');
    expect(where().pathname).toBe('/accounts/12');
  });

  it('opens a row inline with its four panels, and edits it with the account form', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    const details = document.getElementById('account-12-details') as HTMLElement;
    expect(within(details).getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7?account=12');
    const before = accountPortfolioQueries(spy).length;
    await userEvent.click(within(details).getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Pizza EMEA' })).toBeInTheDocument();
    expect(paths(spy)).toContain('/customers/7/accounts/12/');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: expect.objectContaining({ name: 'Pizza EMEA' }) }]),
    );
    await waitFor(() => expect(accountPortfolioQueries(spy).length).toBeGreaterThan(before));
  });

  it('offers no Edit details on an account none of whose organizations the viewer may open', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Open Initech APAC' }));
    const details = document.getElementById('account-14-details') as HTMLElement;
    expect(within(details).getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-row-id="14"]')).toHaveTextContent('Unassigned · Churn · Never contacted');
  });

  it('bulk-edits the lifecycle, Churn included, reporting failures by name, with no Archive or Churn button', async () => {
    const spy = stubAccountsPortfolio({
      members: [
        { id: 2, name: 'Carl CSM', is_active: true },
        { id: 3, name: 'Priya', is_active: true },
      ],
      bulk: (body) => ({
        updated: body.ids.filter((id) => id !== 13),
        failed: body.ids.includes(13) ? [{ id: 13, reason: 'Not found.' }] : [],
      }),
    });
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza EMEA' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex NA' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(bar).toHaveTextContent('2 selected');
    expect(within(bar).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set lifecycle' }), 'churn');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(accountBulkBodies(spy)).toEqual([{ ids: [12, 13], action: 'set_lifecycle', value: 'churn' }]));
    expect(await within(bar).findByText('Globex NA')).toBeInTheDocument();
    expect(bar).toHaveTextContent('Updated 1 account. 1 failed:');
    expect(bar).toHaveTextContent('Globex NA: Not found.');
    expect(bar).toHaveTextContent('1 selected');
  });

  it('exports the view, and the selection alone', async () => {
    const spy = stubAccountsPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAccounts('/accounts/list?health=poor');
    await screen.findByRole('link', { name: 'Initech APAC' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exports(spy)).toHaveLength(1));
    expect(exports(spy)[0].searchParams.get('health')).toBe('poor');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Initech APAC' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exports(spy)).toHaveLength(2));
    expect(exports(spy)[1].search).toBe('?ids=14');
  });

  it('adds an account to an organization with the account form', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(paths(spy)).not.toContain('/customers/');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByRole('heading', { name: 'Add Account' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(paths(spy)).toContain('/customers/');
  });

  it('opens a row as a bottom sheet on phones', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list', { width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    const sheet = screen.getByRole('dialog', { name: 'Pizza EMEA' });
    expect(within(sheet).getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open account page' })).toHaveAttribute('href', '/accounts/12');
  });

  it('says so when there are no accounts yet', async () => {
    stubAccountsPortfolio({ rows: [] });
    renderAccounts('/accounts/list');
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getByText('Add an account to start your portfolio.')).toBeInTheDocument();
  });

  it('keeps nothing on screen when the first read fails, and offers Try again', async () => {
    stubAccountsPortfolio({ portfolio: () => ({ status: 500, body: { detail: 'Server error.' } }) });
    renderAccounts('/accounts/list');
    expect(await screen.findByText('Accounts unavailable')).toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  });
});
```

Append to the end of `src/components/layout/Navbar.test.tsx`:

```tsx

describe('Navbar on the Accounts list and board (accounts spec 2026-09-29 §1)', () => {
  it('wears the framed bar on /accounts/list: "Accounts", List | Board, the actions slot, no avatar', () => {
    const setSlot = vi.fn();
    renderNavbar('/accounts/list', null, null, [], setSlot);
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    for (const cls of ['bg-surface', 'border-b', 'shadow-sm']) expect(header).not.toHaveClass(cls);
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    const views = screen.getByRole('navigation', { name: 'Accounts views' });
    expect(within(views).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/accounts/list');
    expect(within(views).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/accounts/board');
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(header!.querySelector('[data-nav-actions-slot]')).not.toBeNull();
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it('carries the query across List and Board on /accounts/board', () => {
    renderNavbar('/accounts/board?organisation=7&health=poor', null, null, [], vi.fn());
    const views = screen.getByRole('navigation', { name: 'Accounts views' });
    expect(within(views).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/accounts/list?organisation=7&health=poor');
    const board = within(views).getByRole('link', { name: 'Board' });
    expect(board).toHaveAttribute('href', '/accounts/board?organisation=7&health=poor');
    expect(board).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/pages/accounts/List.test.tsx src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: FAIL. The list is the old table (no "Pizza EMEA" link row, `/accounts/` and `/accounts/stats/` requested), and the Navbar has no "Accounts views" navigation.

- [ ] **Step 4: Implement**

Create `src/pages/accounts/useAccountEditing.ts`:

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { apiFetch } from '../../lib/apiClient';
import { fetchCustomers, type Account } from '../../features/customers/customersSlice';
import type { AccountPortfolioRow } from '../../features/accounts/portfolioTypes';
import type { LifecycleValue } from '../../features/organizations/portfolioTypes';
import { errorMessage } from '../../components/organizations/portfolio/usePortfolio';

/** What both Accounts pages need to add and edit with the existing
 *  AccountFormModal: every loaded row remembered by id (its name for a bulk
 *  report, its organisation for the edit read), the Account that Edit
 *  details reads from GET /customers/<organisation>/accounts/<id>/, and the
 *  organisations Add picks from (read when Add opens). */
export function useAccountEditing(onError: (message: string) => void) {
  const dispatch = useAppDispatch();
  // Written in fetch callbacks, read in event handlers.
  const rows = useRef(new Map<number, AccountPortfolioRow>());
  const remember = useCallback((list: AccountPortfolioRow[]) => {
    for (const row of list) rows.current.set(row.id, row);
  }, []);
  const nameOf = useCallback((id: number) => rows.current.get(id)?.name ?? `Account ${id}`, []);

  const [editing, setEditing] = useState<Account | null>(null);
  const openEdit = useCallback(
    async (id: number) => {
      const organisation = rows.current.get(id)?.organisation;
      // The kind offers Edit details only on an account with one (`editable`).
      if (!organisation) return;
      try {
        setEditing(await apiFetch<Account>(`/customers/${organisation.id}/accounts/${id}/`));
      } catch (err) {
        onError(errorMessage(err, 'Could not open this account for editing.'));
      }
    },
    [onError],
  );
  const closeEdit = useCallback(() => setEditing(null), []);

  const customers = useAppSelector((state) => state.customers.customers);
  const companies = useMemo(() => customers.map((customer) => ({ id: customer.id, name: customer.name })), [customers]);
  const [adding, setAdding] = useState<{ stage?: LifecycleValue } | null>(null);
  const openAdd = useCallback(
    (stage?: LifecycleValue) => {
      void dispatch(fetchCustomers());
      setAdding({ stage });
    },
    [dispatch],
  );
  const closeAdd = useCallback(() => setAdding(null), []);

  return { remember, nameOf, editing, openEdit, closeEdit, adding, openAdd, closeAdd, companies };
}
```

Replace the whole of `src/pages/accounts/List.tsx` with:

```tsx
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ACCOUNT_LIFECYCLE_TARGETS } from '../../features/accounts/accountFields';
import { bulkUpdateAccounts, exportAccountPortfolio } from '../../features/accounts/portfolioApi';
import type { AccountBulkAction, AccountFilterOptions, AccountPortfolioRow } from '../../features/accounts/portfolioTypes';
import { useMembers } from '../../features/knowledge/useMembers';
import { ownerTargets } from '../../features/organizations/bulkTargets';
import { hasFilters, toApiQuery, type PortfolioParams } from '../../features/organizations/portfolioParams';
import { AccountPanels } from '../../components/accounts/portfolio/AccountPanels';
import { ACCOUNT_KIND } from '../../components/accounts/portfolio/accountKind';
import { AccountRow } from '../../components/organizations/portfolio/AccountRow';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioKindContext } from '../../components/organizations/portfolio/portfolioKind';
import { PortfolioSections, type PortfolioRowRenderer } from '../../components/organizations/portfolio/PortfolioSections';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { SelectionBar, type BulkReport } from '../../components/organizations/portfolio/SelectionBar';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { useSelection } from '../../components/organizations/portfolio/useSelection';
import { AccountFormModal } from '../organizations/AccountFormModal';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { useAccountEditing } from './useAccountEditing';

/** /accounts/list: the Accounts portfolio (spec 2026-09-29 §1), the
 *  Organizations list's components with ACCOUNT_KIND. Rows, groups, tiles
 *  and totals come from GET /accounts/portfolio/; every filter, sort and
 *  group is URL state; bulk owner and lifecycle go to POST /accounts/bulk/.
 *  No archive or churn: Churn is an ordinary stage. */
export function List() {
  return (
    <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
      <AccountsList />
    </PortfolioKindContext.Provider>
  );
}

function AccountsList() {
  const { params, update, clearFilters } = usePortfolioParams();
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = useAccountEditing(setNotice);
  const { remember, nameOf } = forms;

  const [openRow, setOpenRow] = useState<AccountPortfolioRow | null>(null);
  // Every page that lands (the flat list's, or any section's): remember the
  // rows, and swap the opened row for its fresh copy.
  const onRowsLoaded = useCallback(
    (rows: AccountPortfolioRow[]) => {
      remember(rows);
      setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
    },
    [remember],
  );

  const portfolio = usePortfolio<AccountPortfolioRow, AccountFilterOptions>(params, version, onRowsLoaded);
  const members = useMembers();
  const selection = useSelection();
  const { prune, clear: clearSelection } = selection;
  const searchRef = useRef<HTMLInputElement>(null);
  const grouped = params.group !== '';

  // The Organizations list's selection rule: a different list landing
  // (`loadedQuery` changed) clears it when grouped and prunes it to page one
  // when flat; a reload of the same query keeps it, so failed ids stay
  // selected for a retry. Adjusted during render, not in an effect.
  const { loadedQuery } = portfolio;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  const [report, setReport] = useState<BulkReport | null>(null);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    if (grouped) clearSelection();
    else prune(portfolio.rows.map((row) => row.id));
    setReport(null);
  }
  // Read by runBulk after its await: the query that is loaded by then.
  const loadedQueryRef = useRef(loadedQuery);
  useLayoutEffect(() => {
    loadedQueryRef.current = loadedQuery;
  });

  const [exporting, setExporting] = useState(false);
  const [actionRunning, setActionRunning] = useState(false);
  // Phones: the toolbar's Select toggle shows the checkboxes without a long press.
  const [selectMode, setSelectMode] = useState(false);
  const selecting = selection.selecting || (selectMode && !isSm);
  const endSelection = () => {
    selection.clear();
    setReport(null);
    setSelectMode(false);
  };
  const toggleSelectMode = () => {
    if (selecting) endSelection();
    else setSelectMode(true);
  };

  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;

  const toggleOpen = useCallback(
    (row: AccountPortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)),
    [],
  );
  const closeSheet = useCallback(() => setOpenRow(null), []);

  const runExport = async (query: string) => {
    setExporting(true);
    setNotice(null);
    try {
      await exportAccountPortfolio(query);
    } catch (err) {
      setNotice(errorMessage(err, 'Could not export accounts.'));
    } finally {
      setExporting(false);
    }
  };

  const runBulk = async (action: AccountBulkAction, value: number | string | null) => {
    const ids = [...selection.selected];
    const startQuery = loadedQueryRef.current;
    setActionRunning(true);
    setReport(null);
    try {
      const result = await bulkUpdateAccounts({ ids, action, value });
      setReport({
        updated: result.updated.length,
        failed: result.failed.map((failure) => ({ ...failure, name: nameOf(failure.id) })),
      });
      // Failures stay selected for a retry, unless a different list landed meanwhile.
      if (loadedQueryRef.current === startQuery) selection.replace(result.failed.map((failure) => failure.id));
      else selection.clear();
    } catch (err) {
      setReport({ updated: 0, failed: [], error: errorMessage(err, 'Could not update these accounts.') });
    } finally {
      setActionRunning(false);
      reload();
    }
  };

  const applyFilter = (patch: Partial<PortfolioParams>) => {
    update(patch);
    searchRef.current?.focus();
  };

  const renderRow: PortfolioRowRenderer<AccountPortfolioRow> = (row, { loading }) => {
    const open = openRow?.id === row.id;
    return (
      <AccountRow
        key={row.id}
        row={row}
        currency={currency}
        pins={[]}
        isSm={isSm}
        selecting={selecting}
        selected={selection.selected.has(row.id)}
        selectDisabled={loading || portfolio.loading || actionRunning}
        atLimit={selection.atLimit}
        open={open}
        onToggleSelect={selection.toggle}
        onLongPress={selection.toggle}
        onToggleOpen={toggleOpen}
      >
        {open && isSm ? (
          <AccountPanels
            id={`account-${row.id}-details`}
            row={row}
            currency={currency}
            onEdit={ACCOUNT_KIND.editable(row) ? forms.openEdit : undefined}
          />
        ) : null}
      </AccountRow>
    );
  };

  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        {/* Containers: the tiles and rows follow this column, which the Ask
            rail (delivery 3) will narrow, not the window. */}
        <div className="@container">
          <SummaryTiles
            summary={portfolio.data?.summary ?? null}
            failed={failed}
            currency={currency}
            params={params}
            onFilter={update}
          />
        </div>
        <PortfolioToolbar
          params={params}
          update={update}
          options={options}
          isSm={isSm}
          onExport={() => void runExport(toApiQuery(params))}
          exporting={exporting}
          onAdd={() => forms.openAdd()}
          searchRef={searchRef}
          selectMode={selecting}
          onToggleSelectMode={toggleSelectMode}
        />
        <FilterChips
          params={params}
          options={options}
          count={portfolio.data?.count ?? null}
          total={portfolio.total}
          failed={failed}
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
        <div className="@container">
          <PortfolioSections
            params={params}
            version={version}
            portfolio={portfolio}
            currency={currency}
            filtered={hasFilters(params)}
            renderRow={renderRow}
            onRowsLoaded={onRowsLoaded}
            onClearFilters={clearFilters}
            onAdd={() => forms.openAdd()}
          />
        </div>
        <SelectionBar
          count={selection.selected.size}
          owners={ownerTargets(members)}
          lifecycles={ACCOUNT_LIFECYCLE_TARGETS}
          keepChurn
          activity={actionRunning ? 'applying' : exporting ? 'exporting' : null}
          loading={portfolio.loading}
          report={report}
          onSetOwner={(id) => void runBulk('set_owner', id)}
          onSetLifecycle={(stage) => void runBulk('set_lifecycle', stage)}
          onExport={() => void runExport(new URLSearchParams({ ids: [...selection.selected].join(',') }).toString())}
          onClose={endSelection}
        />
      </div>

      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeSheet} onEdit={forms.openEdit} /> : null}

      {forms.adding ? (
        <AccountFormModal
          companies={forms.companies}
          defaultLifecycleStage={forms.adding.stage}
          onSaved={reload}
          onClose={forms.closeAdd}
        />
      ) : null}
      {forms.editing ? (
        <AccountFormModal
          account={forms.editing}
          onClose={() => {
            forms.closeEdit();
            reload();
          }}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
```

`src/components/layout/Navbar.tsx`, three edits:

(a) Replace

```ts
  // Only /accounts/list and /accounts/board — never /accounts/:id,
  // which the `account` branch above already claims first (checked
  // earlier in the render chain below), same "detail page own header
  // wins" ordering as isOrganizations vs. the `organization` branch.
  const isAccountsList = location.pathname.startsWith('/accounts');
```

with

```ts
  // The Accounts list and board wear the Organizations frame (accounts spec
  // 2026-09-29 §1): the transparent bar, "Accounts", List | Board carrying
  // the query, the actions slot (the Ask pill lands there in delivery 3),
  // no avatar. /accounts/:id is claimed by the `account` branch first.
  const isAccountsView = /^\/accounts\/(list|board)\/?$/.test(location.pathname);
```

(b) Replace `  const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts;` with `  const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView;`

(c) Replace the whole `isAccountsList` branch, from

```tsx
        ) : isAccountsList ? (
          <>
            <div className="flex items-center gap-1.5 cursor-pointer hover:bg-subtle py-1.5 px-2 -ml-2 rounded-md transition-colors">
              <h1 className="text-[17px] font-bold text-ink tracking-tight">Accounts</h1>
```

through the `</>` that closes it (just before `        ) : isPipelines ? (`), with

```tsx
        ) : isAccountsView ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Accounts</h1>
            <nav aria-label="Accounts views" className="flex items-center gap-4 h-full">
              {[
                { to: '/accounts/list', label: 'List' },
                { to: '/accounts/board', label: 'Board' },
              ].map((view) => (
                <NavLink
                  key={view.to}
                  // The two views share their URL state (filters, sort,
                  // group), so switching tabs keeps it.
                  to={{ pathname: view.to, search: location.search }}
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

- [ ] **Step 5: Run the tests, the Organizations tests and the types**

Run: `npx vitest run src/pages/accounts/List.test.tsx src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: PASS (11 list tests; every Navbar test, the two new ones included).

Run: `npx vitest run src/features/organizations src/components/organizations src/pages/organizations src/e2e --maxWorkers=2`
Expected: every file passes.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/accounts/List.tsx src/pages/accounts/List.test.tsx src/pages/accounts/useAccountEditing.ts src/pages/accounts/testList.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): the Accounts list as a portfolio, in the framed top bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The Accounts board

**Files:**
- Modify: `src/pages/accounts/Board.tsx` (whole file)
- Modify: `src/pages/accounts/Board.test.tsx` (whole file)
- Create: `src/pages/accounts/houseRules.test.ts`

**Interfaces:**
- Consumes (Tasks 4–8): `PortfolioBoard<R>`, `useBoardMove<R>({ onSaved })`, `BoardMove<R>`, `AccountSidePanel`, `AccountSheet`, `usePortfolio<R, F>`, `usePortfolioParams(BOARD_GROUP)`, `boardParams`, `ACCOUNT_KIND` (`boardGroupOptions`), `useAccountEditing`, `fetchAccountPortfolio`, `exportAccountPortfolio`, `renderAccounts`, and the Task 6 stub.
- Produces: `export function Board(): JSX.Element` (App.tsx already routes `/accounts/board` to it as `AccountsBoard`).

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/pages/accounts/Board.test.tsx` with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountPatches, stubAccountsPortfolio } from '../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderAccounts } from './testList';

// Integration tier: the real page, store and router; fetch stubbed with
// backend #74's shapes, and PATCH /customers/<cid>/accounts/<id>/ writing
// into the stub's book.
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
/** Move to… is a button opening a menu; nothing moves until a stage is chosen. */
const chooseMove = async (id: number, name: string, stage: string) => {
  await userEvent.click(within(card(id)).getByRole('button', { name: `Move ${name} to…` }));
  await userEvent.click(within(screen.getByRole('menu', { name: `Move ${name} to` })).getByRole('menuitem', { name: stage }));
};

describe('Accounts board (portfolio)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('has a column for every stage, empty ones included, each with its count and ARR', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect([...document.querySelectorAll('[data-column]')].map((el) => el.getAttribute('data-column'))).toEqual([
      'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other',
    ]);
    expect(within(column('live')).getByRole('heading')).toHaveTextContent('Live · 1 · $69.6K');
    expect(within(column('onboarding')).getByRole('heading')).toHaveTextContent('Onboarding · 0 · $0');
    expect(within(column('onboarding')).getByText('No accounts in Onboarding.')).toBeInTheDocument();
  });

  it('lists Churn like any other stage: its accounts show, and it takes a "+"', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    expect(await within(column('churn')).findByRole('link', { name: 'Initech APAC' })).toHaveAttribute('href', '/accounts/14');
    expect(within(column('churn')).getByRole('button', { name: 'Add account to Churn' })).toBeInTheDocument();
    expect(screen.queryByText('Churned accounts are hidden.')).not.toBeInTheDocument();
  });

  it('moves a card with Move to…, saving it through the account update', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(within(card(12)).getByText('Pizza Hut +1')).toBeInTheDocument();
    await chooseMove(12, 'Pizza EMEA', 'Adoption');
    await waitFor(() => expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: { lifecycle_stage: 'adoption' } }]));
    await waitFor(() => expect(column('adoption').querySelector('[data-card-id="12"]')).not.toBeNull());
    expect(screen.getByText('Moved Pizza EMEA to Adoption.')).toBeInTheDocument();
    await waitFor(() => expect(within(column('adoption')).getByRole('heading')).toHaveTextContent('Adoption · 2'));
  });

  it('moves a card to Churn with no churn form: Churn is only a stage', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Globex NA' });
    await chooseMove(13, 'Globex NA', 'Churn');
    await waitFor(() => expect(accountPatches(spy)).toEqual([{ customerId: 1, id: 13, body: { lifecycle_stage: 'churn' } }]));
    await waitFor(() => expect(column('churn').querySelector('[data-card-id="13"]')).not.toBeNull());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("puts a card back, with the server's reason, when the save fails", async () => {
    stubAccountsPortfolio({
      patch: () => ({ status: 400, body: { detail: 'Owner must be an active member of your organisation.' } }),
    });
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await chooseMove(12, 'Pizza EMEA', 'Adoption');
    expect(
      await screen.findByText("Couldn't move Pizza EMEA to Adoption. Owner must be an active member of your organisation."),
    ).toBeInTheDocument();
    await waitFor(() => expect(column('live').querySelector('[data-card-id="12"]')).not.toBeNull());
    expect(column('adoption').querySelector('[data-card-id="12"]')).toBeNull();
  });

  it('does not offer to move an account none of whose organizations the viewer may open', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await within(column('churn')).findByRole('link', { name: 'Initech APAC' });
    expect(within(card(14)).queryByRole('button', { name: 'Move Initech APAC to…' })).not.toBeInTheDocument();
    expect(card(14)).toHaveAttribute('draggable', 'false');
  });

  it('opens a card in the side panel with its panels, and the account page from there', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(within(card(12)).getByRole('button', { name: 'Open Pizza EMEA' }));
    const panel = screen.getByRole('complementary', { name: 'Pizza EMEA' });
    expect(panel).toHaveTextContent('Pizza Hut +1 · Carl CSM · Live · Touched 33d ago');
    expect(within(panel).getByRole('heading', { name: 'Voice of the customer' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('link', { name: 'Open account page' }));
    expect(await screen.findByTestId('account-page')).toHaveTextContent('Pizza EMEA · organization 7');
  });

  it('turns moving off when grouped by owner', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board?group=owner');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(screen.queryAllByRole('button', { name: /^Move .+ to…$/ })).toHaveLength(0);
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual(['Health', 'Owner', 'Lifecycle', 'Renewal window']);
  });

  it("adds from a column with that column's stage chosen", async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(within(column('renewal')).getByRole('button', { name: 'Add account to Renewal' }));
    expect(await screen.findByRole('heading', { name: 'Add Account' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Renewal')).toBeInTheDocument();
  });

  it('shows full-width columns with stage tabs on phones, and opens a card as a sheet', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board', { width: 375 });
    const tabs = await screen.findByRole('navigation', { name: 'Board columns' });
    expect(within(tabs).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Onboarding 0', 'Kickoff 0', 'Adoption 1', 'Live 1', 'Renewal 0', 'Churn 1', 'Expansion 0', 'Other 0',
    ]);
    await userEvent.click(await within(card(12)).findByRole('button', { name: 'Open Pizza EMEA' }));
    expect(screen.getByRole('dialog', { name: 'Pizza EMEA' })).toBeInTheDocument();
  });
});
```

Create `src/pages/accounts/houseRules.test.ts`:

```ts
import { houseRuleSuite } from '../../test/houseRules';

// The two portfolio pages. Details.tsx is the old account page, redesigned
// in delivery 2, and is not held to these rules yet.
houseRuleSuite(
  'accounts pages house rules',
  import.meta.glob(['./List.tsx', './Board.tsx'], { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/accounts/Board.test.tsx src/pages/accounts/houseRules.test.ts --maxWorkers=2`
Expected: FAIL. The old board has no `[data-column]` columns, and the house rules find `text-[12.5px]` and `text-[10.5px]` in `Board.tsx`.

- [ ] **Step 3: Implement**

Replace the whole of `src/pages/accounts/Board.tsx` with:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { exportAccountPortfolio, fetchAccountPortfolio } from '../../features/accounts/portfolioApi';
import type { AccountFilterOptions, AccountPortfolioRow } from '../../features/accounts/portfolioTypes';
import { BOARD_GROUP, boardParams, hasFilters, toApiQuery } from '../../features/organizations/portfolioParams';
import { ACCOUNT_KIND } from '../../components/accounts/portfolio/accountKind';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { AccountSidePanel } from '../../components/organizations/portfolio/AccountSidePanel';
import type { BoardMove } from '../../components/organizations/portfolio/boardMove';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioBoard } from '../../components/organizations/portfolio/PortfolioBoard';
import { PortfolioKindContext } from '../../components/organizations/portfolio/portfolioKind';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { FOCUS } from '../../components/organizations/portfolio/styles';
import { useBoardMove } from '../../components/organizations/portfolio/useBoardMove';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { AccountFormModal } from '../organizations/AccountFormModal';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { useAccountEditing } from './useAccountEditing';

const DISMISS = `inline-flex w-11 h-11 sm:w-8 sm:h-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

/** /accounts/board: the Accounts portfolio as columns (spec 2026-09-29 §1
 *  "Board"), the Organizations board's components with ACCOUNT_KIND. The
 *  tiles, toolbar and chips are the List's, on the same URL params; group
 *  defaults to lifecycle, and every stage is a column (Churn included, as
 *  an ordinary stage). A card moves by drag or Move to…, saved through the
 *  single-account PATCH. No selection mode: bulk work stays on the List. */
export function Board() {
  return (
    <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
      <AccountsBoard />
    </PortfolioKindContext.Provider>
  );
}

function AccountsBoard() {
  const { params: urlParams, update, clearFilters } = usePortfolioParams(BOARD_GROUP);
  const params = useMemo(() => boardParams(urlParams), [urlParams]);
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  // `version` reloads everything (Add, Edit details). A saved move reloads
  // only the frame and the two columns it touched.
  const [version, setVersion] = useState(0);
  const [frameBump, setFrameBump] = useState(0);
  const [columnBumps, setColumnBumps] = useState<Record<string, number>>({});
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = useAccountEditing(setNotice);
  const { remember } = forms;

  // A move's frame reload skips the M probe: a lifecycle move can't change M.
  const portfolio = usePortfolio<AccountPortfolioRow, AccountFilterOptions>(params, version + frameBump, undefined, version);

  const [openRow, setOpenRow] = useState<AccountPortfolioRow | null>(null);
  // Any column's page landing: remember its rows, and swap the opened card
  // for its fresh copy.
  const onRowsLoaded = useCallback(
    (rows: AccountPortfolioRow[]) => {
      remember(rows);
      setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
    },
    [remember],
  );

  const onSaved = useCallback((move: BoardMove<AccountPortfolioRow>) => {
    setFrameBump((n) => n + 1);
    setColumnBumps((bumps) => ({
      ...bumps,
      [move.from]: (bumps[move.from] ?? 0) + 1,
      [move.to]: (bumps[move.to] ?? 0) + 1,
    }));
  }, []);
  const board = useBoardMove<AccountPortfolioRow>({ onSaved });

  // A different list landing (a filter, sort or group change) forgets a
  // move at once. Adjusted during render, not in an effect.
  const { loadedQuery } = portfolio;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    board.reset();
  }

  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;

  const toggleOpen = useCallback(
    (row: AccountPortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)),
    [],
  );
  const closeOpen = useCallback(() => setOpenRow(null), []);

  // When a fresh frame lands (a filter, a move, an edit) the opened card may
  // have left the view. Ask for that one account under the view's filters;
  // if it no longer matches, close its panel or sheet.
  const openId = openRow?.id ?? null;
  const lastKey = useRef(portfolio.loadedKey);
  useEffect(() => {
    const landed = lastKey.current !== portfolio.loadedKey;
    lastKey.current = portfolio.loadedKey;
    if (!landed || openId === null || portfolio.loadedKey === null) return;
    const close = () => setOpenRow((current) => (current?.id === openId ? null : current));
    if (params.ids.length > 0 && !params.ids.includes(openId)) {
      close();
      return;
    }
    let cancelled = false;
    fetchAccountPortfolio(toApiQuery({ ...params, group: '', ids: [openId] }, { limit: '1' })).then(
      (data) => {
        if (cancelled) return;
        const row = data.results.find((r) => r.id === openId);
        if (!row) close();
        else setOpenRow((current) => (current?.id === openId ? row : current));
      },
      () => {
        // Unknown: keep the panel rather than close it on a network blip.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [portfolio.loadedKey, openId, params]);

  const runExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      await exportAccountPortfolio(toApiQuery(params));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not export accounts.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <OrganizationsFrame>
      {/* From sm the page fills the frame, so the page doesn't scroll and
          the columns do. Phones scroll the page. */}
      <div data-part="board-page" className={`flex flex-col gap-4 pb-4 ${isSm ? 'min-h-0 flex-1' : ''}`}>
        <div className="flex shrink-0 flex-col gap-4">
          <div className="@container">
            <SummaryTiles
              summary={portfolio.data?.summary ?? null}
              failed={failed}
              currency={currency}
              params={params}
              onFilter={update}
            />
          </div>
          <PortfolioToolbar
            params={params}
            update={update}
            options={options}
            isSm={isSm}
            onExport={() => void runExport()}
            exporting={exporting}
            onAdd={() => forms.openAdd()}
            searchRef={searchRef}
            groupOptions={ACCOUNT_KIND.boardGroupOptions}
          />
          <FilterChips
            params={params}
            options={options}
            count={portfolio.data?.count ?? null}
            total={portfolio.total}
            failed={failed}
            onChange={(patch) => {
              update(patch);
              searchRef.current?.focus();
            }}
            onClearAll={() => {
              clearFilters();
              searchRef.current?.focus();
            }}
          />
          {notice ? (
            <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
              {notice}
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={DISMISS}>
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </p>
          ) : null}
          {board.error ? (
            <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
              {board.error}
              <button type="button" onClick={board.dismissError} aria-label="Dismiss" className={DISMISS}>
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="sr-only">
            {board.notice ?? ''}
          </p>
        </div>
        <div data-part="board-area" className={`flex gap-3 ${isSm ? 'min-h-[360px] flex-1' : ''}`}>
          <PortfolioBoard
            params={params}
            portfolio={portfolio}
            version={version}
            columnBumps={columnBumps}
            currency={currency}
            isSm={isSm}
            filtered={hasFilters(params)}
            move={board.move}
            saving={board.busy}
            openId={openRow?.id ?? null}
            onOpen={toggleOpen}
            onMove={board.moveTo}
            onRowsLoaded={onRowsLoaded}
            onClearFilters={clearFilters}
            onAdd={forms.openAdd}
            onMoveSettled={board.settle}
          />
          {isSm && openRow ? (
            <AccountSidePanel row={openRow} currency={currency} onClose={closeOpen} onEdit={forms.openEdit} />
          ) : null}
        </div>
      </div>

      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeOpen} onEdit={forms.openEdit} /> : null}

      {forms.adding ? (
        <AccountFormModal
          companies={forms.companies}
          defaultLifecycleStage={forms.adding.stage}
          onSaved={reload}
          onClose={forms.closeAdd}
        />
      ) : null}
      {forms.editing ? (
        <AccountFormModal
          account={forms.editing}
          onClose={() => {
            forms.closeEdit();
            reload();
          }}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 4: Run the tests and the types**

Run: `npx vitest run src/pages/accounts --maxWorkers=2`
Expected: PASS: Board 10, List 11, house rules green, and `Details.test.tsx` unchanged and passing.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/accounts/Board.tsx src/pages/accounts/Board.test.tsx src/pages/accounts/houseRules.test.ts
git commit -m "$(cat <<'EOF'
feat(accounts): the Accounts board: every stage a column, moves saved per account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Retire the table, the stat cards and the action bar

**Files:**
- Delete: `src/components/accounts/AccountsTable.tsx`
- Delete: `src/components/accounts/ActionBar.tsx`
- Delete: `src/components/accounts/MetricsPanel.tsx`
- Delete: `src/components/accounts/MetricsPanel.test.tsx`

**Interfaces:**
- Consumes: Tasks 8–9. The two pages no longer import these files.
- Produces: nothing. `fetchAccountStats` / `accountStats` stay in `customersSlice.ts`, because `/health` (`HealthDistribution`) and `/lifecycle` (`LifecyclePage`) still read `/accounts/stats/`. `fetchAllAccounts` and `mapToAccountRow.ts` stay too, for the slice's other consumers and for `Details.tsx` until delivery 2.

- [ ] **Step 1: Prove nothing else imports them**

Run: `grep -rnE "from '[^']*(components/accounts/|\./)(AccountsTable|ActionBar|MetricsPanel)'" src`
Expected: only `src/components/accounts/MetricsPanel.test.tsx` (importing `./MetricsPanel`, deleted with it). Comments that mention these names in `customersSlice.ts`, `HealthDistribution.tsx`, `LifecyclePage.tsx`, `PipelinesPage.tsx` and `DrillPanel.test.tsx` are prose, not imports, and stay.

- [ ] **Step 2: Delete**

```bash
git rm src/components/accounts/AccountsTable.tsx src/components/accounts/ActionBar.tsx src/components/accounts/MetricsPanel.tsx src/components/accounts/MetricsPanel.test.tsx
```

- [ ] **Step 3: Types, lint and the affected suites**

Run: `npx tsc -b`
Expected: exit 0.

Run: `npx vitest run src/pages/accounts src/pages/health src/pages/lifecycle src/components/accounts --maxWorkers=2`
Expected: every file passes (`/health` and `/lifecycle` still read `/accounts/stats/` through the slice).

Run: `npx eslint src/pages/accounts src/components/accounts src/features/accounts src/components/organizations/portfolio src/features/organizations src/components/layout/Navbar.tsx`
Expected: exit 0 with no errors and no warnings.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(accounts): retire AccountsTable, MetricsPanel and ActionBar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: End to end in jsdom, and the product documents

**Files:**
- Create: `src/e2e/accountsPortfolio.test.tsx`
- Modify: `docs/03-ui-ux-design.md`
- Modify: `docs/04-app-flow.md`
- Modify: `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: `renderAccounts(url, { nav: true })` (Task 8), `stubAccountsPortfolio`, `accountBulkBodies`, `accountPatches` (Task 6).
- Produces: nothing new.

- [ ] **Step 1: Write the end-to-end test**

Create `src/e2e/accountsPortfolio.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountBulkBodies, accountPatches, stubAccountsPortfolio } from '../features/accounts/testPortfolio';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { renderAccounts } from '../pages/accounts/testList';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, pages, store, router
// and every portfolio component. Only fetch is stubbed, with backend #74's
// shapes.
const where = () => screen.getByTestId('where').textContent;
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;

describe('Accounts portfolio', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters, opens, bulk-edits, carries the filters to the Board, moves a card and opens the account', { timeout: 30000 }, async () => {
    const spy = stubAccountsPortfolio({
      members: [
        { id: 2, name: 'Carl CSM', is_active: true },
        { id: 3, name: 'Priya', is_active: true },
      ],
    });
    renderAccounts('/accounts/list', { nav: true });
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(await screen.findByText('3 accounts')).toBeInTheDocument();

    // 1. Filter to Pizza Hut's accounts.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('checkbox', { name: 'Pizza Hut' }));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 3 accounts')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex NA' })).not.toBeInTheDocument());

    // 2. Open Pizza EMEA inline: its organisations link with it chosen.
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    const details = document.getElementById('account-12-details') as HTMLElement;
    expect(within(details).getByRole('link', { name: 'Yum Brands' })).toHaveAttribute('href', '/organizations/9?account=12');

    // 3. Reassign it to Priya.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza EMEA' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Change owner' }), '3');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(accountBulkBodies(spy)).toEqual([{ ids: [12], action: 'set_owner', value: 3 }]));
    expect(await within(bar).findByText('Updated 1 account.')).toBeInTheDocument();

    // 4. The Board tab keeps the filter.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Accounts views' })).getByRole('link', { name: 'Board' }));
    await waitFor(() => expect(where()).toBe('/accounts/board?organisation=7'));
    expect(await within(column('live')).findByRole('link', { name: 'Pizza EMEA' })).toBeInTheDocument();

    // 5. Move it to Churn: saved on the account, with no churn form.
    await userEvent.click(screen.getByRole('button', { name: 'Move Pizza EMEA to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move Pizza EMEA to' })).getByRole('menuitem', { name: 'Churn' }));
    await waitFor(() => expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: { lifecycle_stage: 'churn' } }]));
    expect(await within(column('churn')).findByRole('link', { name: 'Pizza EMEA' })).toBeInTheDocument();

    // 6. Its name opens the account page with the row that page reads.
    await userEvent.click(within(column('churn')).getByRole('link', { name: 'Pizza EMEA' }));
    expect(await screen.findByTestId('account-page')).toHaveTextContent('Pizza EMEA · organization 7');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/accountsPortfolio.test.tsx --maxWorkers=2`
Expected: PASS (1 test). If a step fails, the failing assertion names the step; fix the page or component (not the test) with superpowers:systematic-debugging.

- [ ] **Step 3: Update `docs/03-ui-ux-design.md`**

(a) In the "Data display" table, replace

```
`/organizations/board`: `PortfolioBoard`, `BoardColumn`, `BoardCard`, `AccountSidePanel`. See "Portfolio rows and board" below |
```

with

```
`/organizations/board`: `PortfolioBoard`, `BoardColumn`, `BoardCard`, `AccountSidePanel`. They read a portfolio kind (`PortfolioKindContext`, Organizations by default), so `/accounts/list` and `/accounts/board` use them too, with `ACCOUNT_KIND` and `components/accounts/portfolio/AccountPanels`. See "Portfolio rows and board" below |
```

(b) Delete the row `| `AccountsTable` | Same shape, no bulk actions |` and the row `| `MetricsPanel` | Accounts: count, health donut with COUNT/MRR/ARR toggle, NPS, lifecycle donut, renewal window |`.

(c) Replace `| `KanbanBoard` | Generic over stage and item; HTML5 drag events; used by Pipelines and the Accounts board |` with `| `KanbanBoard` | Generic over stage and item; HTML5 drag events; used by Pipelines |`.

(d) Insert immediately before the line `### Organization page (`/organizations/:id`)`:

```markdown
### Portfolio rows and board (Accounts)

`/accounts/list` and `/accounts/board` are the Organizations portfolio with
the account kind (`ACCOUNT_KIND`, `components/accounts/portfolio/accountKind.ts`),
which each page provides around itself through `PortfolioKindContext`.
Everything in the section above holds, with these differences:

- The line under a name reads "Organisation · owner · lifecycle · touched Nd
  ago". The organisation is the first linked one the viewer may open, then
  "+N" for the rest; a hidden one is never named or counted. A Board card's
  line is the organisation.
- The opened row is `AccountPanels`:
  - Commercial: ARR in the workspace's currency, and the renewal date on a
    line with today marked, danger when overdue.
  - Voice of the customer: the NPS bar and band, CSAT, and the AI pulse
    reason as a quote.
  - Profile: the Revenact ID, each organisation as a link to
    `/organizations/:id?account=<id>`, then domain, industry, email, phone and
    address.
  - History: created, updated, pulse recorded on, and CSM pulse set.

  Every one of the 24 Account fields shows exactly once
  (`components/accounts/portfolio/fieldCoverage.test.tsx`).
- No archive and no churn: there is no Archive or Churn button and no
  "Include churned". Churn is an ordinary Board column with a "+", and a move
  there saves like any other. The bulk Set lifecycle offers Churn.
- The filters are organisation (checkboxes, after Owner), owner, lifecycle,
  health, renews within and NPS. The sorts are risk, ARR, renewal, health and
  name. There are no Pin fields.
- The Renewing tile opens on 90 days.
- An account none of whose organisations the viewer may open shows no Edit
  details and no Move to…, since both need its organisation's id. Bulk edits
  still reach it.
- The name, and the sheet's and side panel's "Open account page", pass the
  row to `/accounts/:id` in `location.state`, where the account page (to be
  redesigned in delivery 2) reads it.
- The top bar is the framed one: "Accounts", List | Board keeping the query,
  the actions slot, and no avatar. The rail slot stays empty until Ask
  (delivery 3).
```

- [ ] **Step 4: Update `docs/04-app-flow.md`**

(a) Replace the route map row `| `/accounts/{list,board,:id}` | `AccountsList`, `AccountsBoard`, `AccountDetails` | auth |` with `| `/accounts/{list,board,:id}` | `AccountsList`, `AccountsBoard` (the Accounts portfolio), `AccountDetails` | auth |`.

(b) In §4.3, replace

```
Reached from the Accounts tab of an organisation or from `/accounts/list`, in
both cases passing the mapped row through `location.state.account`. Tabs mirror
the organisation page and add Organizations.
```

with

```
1. `/accounts/list` works like the Organizations list, on
   `GET /accounts/portfolio/`:
   - Its state is in the URL: `search, organisation, owner, lifecycle,
     health, renews_within, nps, ids, sort, group`. `group` defaults to
     health, and `group=none` turns grouping off.
   - A `limit=1` frame read gives the tiles, groups, filter options and count.
   - Each open section reads its own rows with `group_value`.
   - With a filter active, a `limit=1` probe gives M for "N of M accounts".
   - Nothing is hidden for churn.
2. Selecting rows offers Change owner and Set lifecycle (Churn included).
   - Each is applied with "Apply to N" through `POST /accounts/bulk/`, and a
     failure is named per account.
   - Export selected sends `ids`. Export CSV sends the view's query to
     `GET /accounts/portfolio/export.csv`.
3. `/accounts/board` uses the same state, with `group` defaulting to
   lifecycle, and every stage is a column.
   - A move saves through `PATCH /customers/<organisation>/accounts/<id>/`, on
     the first linked organisation the viewer may open.
   - It then reloads the frame and the two columns it touched.
4. Edit details reads `GET /customers/<organisation>/accounts/<id>/` and opens
   `AccountFormModal`. Add reads `GET /customers/` for its organisation picker.
   The page reloads after either.
5. An account's name opens `/accounts/:id` and passes the row (`accountNavRow`)
   through `location.state.account`. The account page's tabs mirror the
   organisation page and add Organizations.
```

- [ ] **Step 5: Update `.agents/workflows/repo-architecture.md`**

(a) Replace `│       ├── accounts/           ← Account Details page` with `│       ├── accounts/           ← List and Board (the Accounts portfolio), Details (the account page)`.

(b) Replace `│   │   ├── contacts/           ← ContactsToolbar, ContactList(Item), ContactProfile, HistoryItems, ContactFormModal` with

```
│   │   ├── accounts/portfolio/ ← AccountPanels, accountKind (ACCOUNT_KIND) for the Accounts list and board
│   │   ├── contacts/           ← ContactsToolbar, ContactList(Item), ContactProfile, HistoryItems, ContactFormModal
```

(c) Replace `├── accounts/:id               → Account Details page` with

```
├── accounts/
│   ├── (index)                → Redirects to /accounts/list
│   ├── list                   → Portfolio (List.tsx on GET /accounts/portfolio/, ACCOUNT_KIND)
│   ├── board                  → Board (Board.tsx: PortfolioBoard on GET /accounts/portfolio/)
│   └── :id                    → Account Details page
```

(d) After the table row that starts `| `features/organizations/testPortfolio.ts`, `pages/organizations/testList.tsx` |`, insert:

```
| `components/organizations/portfolio/portfolioKind.ts`, `organizationKind.ts` | The portfolio kind the shared components read from `PortfolioKindContext` (endpoint, params, words, links, row line, panels, how a move saves); `ORGANIZATION_KIND` is the default |
| `features/accounts/*`, `components/accounts/portfolio/*` | The Accounts kind: `portfolioTypes`, `portfolioApi`, `ACCOUNT_PARAMS`, the 24-field `accountFields`, `accountNavRow`, `AccountPanels`, `ACCOUNT_KIND`; `features/accounts/testPortfolio.ts` and `pages/accounts/testList.tsx` (`renderAccounts`) for tests |
```

(e) Replace

```
over snapping panels. `KanbanBoard` is no longer used here (Pipelines and the
Accounts board keep it).
```

with

```
over snapping panels. `KanbanBoard` is no longer used here (Pipelines keeps
it). The Accounts board is this board with `ACCOUNT_KIND` (`pages/accounts/Board.tsx`).
```

(f) Insert immediately before the line `  ├── pages/copilot/Index.tsx`:

```
  ├── pages/accounts/List.tsx, Board.tsx  (GET /accounts/portfolio/, POST /accounts/bulk/, PATCH /customers/<cid>/accounts/<id>/)
  │     ├── PortfolioKindContext = ACCOUNT_KIND around the page; OrganizationsFrame (rail slot empty until delivery 3)
  │     └── the Organizations portfolio components + accounts/portfolio/AccountPanels; AccountFormModal (edit, add)
  │
```

(g) Delete the dead-ends row `| `/accounts` (list) | No list route, only `/accounts/:id` |`.

- [ ] **Step 6: Check the documents' formatting**

Run: `git diff --check -- docs .agents`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/e2e/accountsPortfolio.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "$(cat <<'EOF'
test(accounts): the portfolio end to end; docs for the Accounts list and board

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Final verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Whole test suite, one process**

Run: `npx vitest run --maxWorkers=2`
Expected: every file passes, 0 failed.

- [ ] **Step 2: No existing Organizations test was touched**

Run: `git diff --diff-filter=M --name-only bd20d9e -- 'src/**/*.test.ts' 'src/**/*.test.tsx'`
Expected: exactly these three files: `src/components/layout/Navbar.test.tsx` (tests added), `src/pages/accounts/Board.test.tsx` and `src/pages/accounts/List.test.tsx` (rewritten). No file under `organizations/` and no `src/e2e/organizations*` file.

- [ ] **Step 3: Types**

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors and 16 warnings, the count before this branch (all `react-hooks/set-state-in-effect`, in older files). No new file appears in the output.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `tsc -b && vite build` completes and writes `dist/` (the existing chunk-size warning is not new).

- [ ] **Step 6: The retired pieces are gone**

Run: `ls src/components/accounts && grep -rn "accounts/stats" src/pages/accounts`
Expected: `ls` prints only `portfolio`; `grep` prints nothing.

- [ ] **Step 7: If anything failed**

Fix it with superpowers:systematic-debugging, and commit the fix as `fix(accounts): <what>` (or `fix(portfolio): <what>`) with the Co-Authored-By line. Repeat Steps 1–6 until all pass, and use superpowers:verification-before-completion before reporting.

---

### Task 13: Controller browser check at 1440px and 375px, both themes

The controller runs this, not a subagent, once backend #74 is merged and running locally (`revenact-backend` on `feat/accounts-portfolio` or `main`, on its usual port) and `npm run dev` is up. Use the claude-in-chrome tools, loaded in one ToolSearch call that includes `resize_window`. Take a screenshot at each checkpoint.

- [ ] **Step 1: Pick the data.** Sign in as an admin, and find:
  - an account linked to two organisations
  - an account with an overdue renewal
  - an account in Churn
  - if possible, a user who owns an account whose organisation they cannot open

- [ ] **Step 2: 1440px, light theme, `/accounts/list`.**
  - The top bar reads "Accounts" with List | Board, is transparent and has no avatar.
  - There is no table and there are no stat cards; the five tiles are Health, NPS, Lifecycle, Accounts · ARR and Renewing, the last on 90 days.
  - Each row: ring with the score in DM Mono, the name, "Organisation +N · owner · lifecycle · touched Nd ago", trend, runway ("Nd overdue" in danger), ARR, "AI n · CSM n" and at most one signal tag.
  - Grouped by health, each section header shows count and ARR.

- [ ] **Step 3: Toolbar and URL.**
  - Search, then Group (owner, renewal window) and Sort (risk, ARR, renewal, health, name).
  - Filters: Organization, Owner (with Unassigned), Health, Lifecycle, Renews within and NPS; no Product, and no Include churned.
  - Every choice lands in the URL, and chips and "N of M accounts" follow. Reload restores it all; List → Board keeps it.

- [ ] **Step 4: Opened row.**
  - Click a row: the four panels open inline.
  - Commercial shows the timeline with today, danger when overdue. Voice shows the NPS bar and band. Profile's organisation links open `/organizations/<id>?account=<id>` with the chip chosen.
  - Edit details opens the account form, and saving reloads the row.
  - The name opens `/accounts/<id>` showing that account's real data, not the mock.

- [ ] **Step 5: Selection.**
  - Tick two rows. The bar shows "2 selected", Change owner and Set lifecycle (each with "Apply to N", Churn offered) and Export selected; there is no Archive or Churn button.
  - Apply a lifecycle and read the per-account report. Change a filter and the selection clears.

- [ ] **Step 6: `/accounts/board`, 1440px.**
  - There are eight columns, empty ones included, each headed "Stage · N · $ARR".
  - Churn lists its accounts and has a "+".
  - Drag a card to another column, and use Move to… with the keyboard; both save and settle, and a failure puts the card back with the reason.
  - Grouping by owner turns moving off.
  - A card opens the side panel with the four panels and "Open account page".
  - An account whose organisation the viewer cannot open has no Move to… (check as the Step 1 user, if found).

- [ ] **Step 7: Dark theme at 1440px.** Repeat Steps 2, 4 and 6 visually. Every surface, ring, tag, bar, chip and focus ring is legible, with no raw white or black.

- [ ] **Step 8: 375px, light and dark.**
  - Rows are two-line cards and there is no horizontal page scroll.
  - Tapping a row opens the bottom sheet; a long press starts selection.
  - Every control is at least 44px.
  - The Board shows full-width columns with a strip of stage tabs, and a card opens as a sheet.

- [ ] **Step 9: Other routes unchanged.**
  - `/organizations/list` and `/organizations/board` look and behave as before: Product filter, Include churned, Archive, Churn modal, Pin fields, a 30-day Renewing tile.
  - `/health` and `/lifecycle` still show their Accounts tabs from `/accounts/stats/`.

- [ ] **Step 10: Record.** Note anything off as a follow-up, or fix it on this branch (with a test) before the PR.

---

## Self-review

**Spec coverage.**
- §1 Frame:
  - The transparent top bar with "Accounts" and List | Board keeping the query, and the actions slot for the delivery 3 pill and the bell: Task 8 (Navbar).
  - The content column that scrolls on its own: `OrganizationsFrame` in Tasks 8 and 9.
  - The rail slot kept empty: decision 11.
- §1 Summary tiles, clickable filters: `SummaryTiles`, unchanged in behaviour, with the 90-day window (Task 5, decision 7) and the tests in Task 8.
- §1 Toolbar and URL state:
  - Search; Group (health on the List, lifecycle on the Board, owner and renewal window offered) and Sort (risk, ARR, renewal, health, name): Tasks 1, 6 and 8.
  - Filters (organisation, owner with Unassigned, lifecycle, health, renews within, NPS band): Tasks 1, 5 and 6.
  - Export CSV and + Add: Tasks 6 and 8.
  - Everything in the URL, and kept across List/Board: Tasks 2 and 8, and the e2e in Task 11.
  - Chips and "N of M accounts": Tasks 1, 5 and 8.
- §1 Row (`PortfolioRow`, kind-agnostic):
  - Checkbox, ring, name, trend, runway, ARR, pulse and signal: the shared `AccountRow` (Task 3).
  - The "Organisation · owner · lifecycle · touched" line, with "+N": `ACCOUNT_KIND.subtitle` (Task 7).
  - The name link to `/accounts/:id`: Task 7, decision 3.
  - Inline on desktop and a sheet on phones: Task 8.
- §1 Opened row (`AccountPanels`): Commercial, Voice, Profile and History with every field once (Task 7 coverage test); the header fields in the row (Task 7 registry).
- §1 Board:
  - Every stage a column, each a paged `group_value` read with count and ARR: Tasks 4 and 9.
  - Cards with ring, name, organisation, ARR, signal and trend: Tasks 4 and 7.
  - The side panel or sheet: Tasks 3 and 9.
  - Drag and Move to…, optimistic, saved through the single-account update, rolled back with the reason: Tasks 4, 7 and 9.
  - Moving off when grouped otherwise: Task 9.
  - Phones with the tab strip: Task 9.
- §1 Selection mode: the checkbox and long press, "N selected", Change owner and Set lifecycle with "Apply to N", Export selected, ✕, per-account failures, and clearing on a filter change (Tasks 5 and 8).
- §1 Phones: two-line cards, the sheet, 44px targets and conditional layouts (the shared components, with tests at 375 in Tasks 8 and 9).
- §1 Retired: `AccountsTable`, `MetricsPanel`, `ActionBar` and `/accounts/stats/` on this page (Task 10; Task 8 asserts only `/accounts/portfolio/` is read).
- Decisions:
  - Kind-agnostic components, each page supplying its own fields, filters and actions: Tasks 2–7 and decision 1.
  - No archive or churn: Tasks 5, 7, 8 and 9.
- §4: one frontend PR after backend #74; subagent-driven with a review per task (plan header); the controller browser check is Task 13.
- §5 frontend testing:
  - unit tests for the row, the panels and the Board card (Tasks 3, 4 and 7)
  - integration through the real store and router with contract-shaped fetch (Tasks 8 and 9)
  - the jsdom e2e (Task 11)
  - house rules over the new files (Tasks 7 and 9)
  - Organizations' existing tests unchanged and passing (every task's Step 4, and Task 12 Step 2)

**Placeholder scan.** There is no TBD or TODO, and no "similar to Task N". Every code step carries complete file contents or an exact find and replace, and every command gives its expected result.

**Type consistency.**
- `PortfolioRowBase`, `FilterOptions`, `OrganizationFilters`, `PortfolioPage<R, F>`, `ParamSpec` and `ORGANIZATION_PARAMS` (Task 1) are used with the same names and parameters in Tasks 2–9.
- `PortfolioKind` has the same members wherever it is used: `noun, nameField, params, sortOptions, groupOptions, boardGroupOptions, filters, renewalWindow, pulseValueField, churnByModal, fetch, totalQuery, churnVisible, saveStage, addsTo, editable, href, linkState, subtitle, cardSubtitle, status, renderDetails`. That covers Task 2's definition, `ORGANIZATION_KIND`, `WIDGET_KIND` and `ACCOUNT_KIND` (Task 7), and every component that reads it (Tasks 3–5).
- The generic signatures match between their definitions and their callers: `usePagedPortfolio<R, F>`, `usePortfolio<R, F>`, `PortfolioState<R, F>`, `BoardMove<R>`, `useBoardMove<R>({ onSaved, onChurn? })` and `PortfolioRowRenderer<R>`.
- `AccountPortfolioRow` fields (`organisation`, `extra_organisations`, `details.{commercial, voice, profile, history}`) are the same in Task 6's types, fixtures, registry and `accountNavRow`, and in Task 7's panels and kind.
- `useAccountEditing` returns `{ remember, nameOf, editing, openEdit, closeEdit, adding, openAdd, closeAdd, companies }`, which is exactly what Tasks 8 and 9 use.
- The stub helpers (`stubAccountsPortfolio`, `accountPortfolioQueries`, `accountBulkBodies`, `accountPatches` returning `{ customerId, id, body }`) have the same names in Tasks 6–11.
