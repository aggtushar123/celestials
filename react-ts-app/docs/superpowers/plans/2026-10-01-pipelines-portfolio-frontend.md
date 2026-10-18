# Pipelines portfolio (frontend, delivery 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/pipelines/list` and `/pipelines/board` with one book of opportunities or risks across organisations and accounts, in the portfolio design (tiles with a stage strip, URL filters, list items with a Part-of line and a date line, a stage Board, selection with bulk edits, export), on `GET /api/v1/pipelines/{opportunities,risks}/`; give the forms the date and Closed Lost, and the Deals & risks tabs the date line and the Overdue signal.

**Architecture:**
- Pipelines is its **own portfolio module** (`src/features/pipelines/`, `src/components/pipelines/portfolio/`, `src/pages/pipelines/{List,Board}.tsx`) with two kind configs, `OPPORTUNITIES_KIND` and `RISKS_KIND` (a `PipelineKind`, not a `PortfolioKind`: see Decision 1).
- It reuses the Organizations/Accounts portfolio wherever the shapes allow. Tasks 1–3 first extract the shape-agnostic parts of `src/components/organizations/portfolio/` without changing their behaviour: the cursor-paged read (`usePagedRead`), the tile, filter-sheet, group/sort, chip-row, Move-to menu, search-box and selection-bar primitives. Organizations and Accounts keep their DOM and their tests.
- The page reads `?kind=` (default opportunities, omitted) and remounts per kind. The List and the Board share every other URL parameter; both group by stage by default.
- An item or card opens the existing `OpportunityFormModal` / `RiskFormModal`, built from the row (no extra read). A Board move is the existing `PATCH /opportunities/<id>/` or `/risks/<id>/` (the slice's `updateOpportunity` / `updateRisk`).
- The page wears the framed layout (transparent bar with Pipelines, List | Board, Opportunities | Risks, the actions slot, no avatar) in `OrganizationsFrame` with its rail slot left empty (Ask is delivery 2).

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md` §1 (the list and Board), §4 (delivery), §5 (frontend testing), with three rulings made during the backend build that amend it (below). The backend contract is the `revenact-backend` branch `feat/pipelines-portfolio` (`docs/API_CONTRACTS.md` → `pipelines_portfolio`, and the Opportunity / Risk sections; `services/pipelines_portfolio/{params,book,shape,rows,views,serializers}.py`). It merges and deploys **before** this frontend.

## Global Constraints

- **The owner's standing rules (spec §0):** "app-ready (phones included), never spreadsheet-like, and no information lost."
- **Shape (spec Decisions):** "One book of opportunities or risks across organisations **and** accounts. Each item names its organisation or account. The Deals & risks tabs on the organisation and account pages stay as they are, gaining the date."
- **Frame (spec §1):** "a transparent top bar with **Pipelines**, the **List | Board** switch, an **Opportunities | Risks** switch, the (delivery 2) Ask button and the bell; the content column scrolls on its own; an empty rail slot for delivery 2. Routes stay `/pipelines/list` and `/pipelines/board`; the kind is `?kind=opportunities|risks` (default opportunities, omitted)."
- **Tiles (spec §1):** "Opportunities: Open pipeline (count · MRR) · Closing in 30 / 90 days · Overdue · Won this quarter (count · MRR) · a stage strip (count per open stage). Risks: MRR at risk (open count · MRR) · Due in 30 / 90 days · Overdue · Mitigated this quarter · a stage strip." "A tile sets its filter; tapping it again clears it. Totals cover every filtered row, not the page."
- **Ruling (backend build):** "The tiles ignore only the stage filter; every other filter applies. The server's `summary.stages` lists every stage (Board column headers incl. Closed Won/Lost); the page's stage strip shows OPEN stages only from that list."
- **Toolbar (spec §1):** Search "title, and the organisation or account name"; Group "stage (Board and List default), close month (`2026-10`, …, *Overdue*, *No date*), organisation or account, owner (with Unassigned), department, priority, or none"; Sort "MRR, close date, priority, stage, title; missing values last"; Filters "organisation, account, owner (with Unassigned), stage (open stages by default; closed stages opt-in), priority, department, closes or is due within 30/90/180 days, overdue, no date"; "**Export CSV**, **+ Add** and selection with bulk **Set stage / priority / department / date**, as on Accounts. Everything lives in the URL."
- **Ruling (backend build):** "Close-month groups order: Overdue first, months ascending, No date last."
- **Ruling (backend build):** "Owner filter values: a user id, `unassigned`, `outside` ("Not in your book"); row/group owners outside the viewer's organisation read "Not in your book"; group=owner has an "outside" section after named people and before Unassigned."
- **List items (spec §1):** "never a table"; "the title; beneath it **Part of** the organisation or account (a link…)"; "MRR in the workspace currency, the stage tag, priority, department"; "the date: "Closes in 12d", "Overdue 5d", or "No date" (risks: "Due in …")"; "a signal tag at most: *Overdue* first, then *High priority* on an open item." "Clicking an item opens it (the existing Opportunity / Risk form, with the new date and Closed Lost). Phones: one column, the item's facts wrap under the title, 44px targets."
- **Board (spec §1):** "Columns by stage (Closed Lost shown for opportunities, collapsed by default), the same item content as cards; dragging a card sets its stage."
- **Add (spec §1):** "Pick where it belongs: an organisation or an account (only ones the viewer may open), then title, MRR, stage, priority, department and the date."
- **Removed (spec §1):** "The Count/MRR toggle, the stat-card banner, the page's `<table>` list views, the client-side filter popover and client totals, and the unused `components/shared/PipelinesTab.tsx` (with its tests)."
- **Deals & risks (spec §1):** "Their **Deals & risks** tabs keep their layout; each item gains the date line and the Overdue signal; the forms gain the date and Closed Lost."
- **Testing (spec §5):** "unit tests for rows, tiles and params; integration through the real store and router with `fetch` stubbed in contract shapes; a jsdom journey per delivery; the house-rules suite over the new files; the Organizations, Accounts and Deals & risks tests still pass."
- **Backend contract** (`pipelines_portfolio`):
  - `GET /pipelines/{opportunities,risks}/` params: `search, organisation, account, owner (id|unassigned|outside), stage (default: open stages; "the Board sends every stage"), priority, department (none = undeparted), date (30|90|180|overdue|none), changed (quarter), ids, sort (mrr|date|priority|stage|title, "-" descending, default -mrr), group (stage|month|parent|owner|department|priority), group_value, cursor, limit`.
  - Response `{kind, results, next_cursor, count, groups: [{key,label,count,mrr}], summary: {items, mrr, open, within: {"30","90"}, overdue, done_this_quarter: {stage,count,mrr}, stages: [{value,label,count,mrr}]}, filters: {organisations, accounts, owners, stages, priorities, departments}, currency}`.
  - A row: `{id, kind, title, parent: {type: "organisation"|"account", id, name}, companies, owner: {id|null, name}|null, mrr (float), stage {value,label}, priority {value,label}, department {value,label}, date {value, days}, open, overdue, signal {kind: "overdue"|"high_priority", label}|null, stage_changed_at, created_at}`.
  - `GET …/export.csv` (same params) → `<kind>-<date>.csv`; `POST …/bulk/ {ids, action: set_stage|set_priority|set_department|set_date, value}` → `{updated, failed: [{id, reason}]}`; `set_department` takes `""` for everyone's; `set_date` takes `YYYY-MM-DD` or `null` (the key must be present).
  - `/opportunities/` and `/risks/` (list, nested, detail) read and write `expected_close` / `due_by`, return `stage_changed_at`; Opportunity gains stage `closed_lost`.
- **House rules** (`.claude/skills/revenact-design/SKILL.md` §1, §4): tokens only; type sizes 11/13/15/22 px; numbers in `font-mono-brand tabular-nums`; Lucide icons with `aria-hidden` beside text; no card in a card; 44px targets below `sm` (`min-h-11 sm:min-h-9`); designed empty, loading and error states; sentence-case copy; both themes; no motion added; no glass (the Ask rail is delivery 2).
- **Tests** per the `testing` skill: unit, integration (real store and router, `fetch` stubbed in contract shapes), a jsdom journey in `src/e2e/`, the house-rules suite. Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time. No new dependencies.
- Work on `feat/pipelines-redesign` in `react-ts-app`. Conventional commits (`refactor(portfolio): …`, `feat(pipelines): …`, `test(pipelines): …`, `docs(pipelines): …`) ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

## Decisions this plan makes where the spec is silent

1. **Pipelines is its own portfolio module, not a third `PortfolioKind`.** `PortfolioKind`, `PortfolioRowBase` and `PortfolioParams` are organisation-shaped end to end (health ring, lifecycle, ARR, pulse, renewal runway, churn, `LifecycleValue` board columns); a pipeline row has none of them. Forcing it in would mean re-typing the row, the params, the board and the tiles for a third consumer.
   - **Reused unchanged:** `styles.ts`, `useSelection`, `useEndSentinel`, `useDismiss`, `useOverlayActive`, `EmptyState` / `ErrorBlock` / `MoreButton` / `sectionStartsOpen`, `countText`, `OrganizationsFrame`, `ConfirmDialog`, the two forms, `PRIORITY_COLORS`, `TITLE_BUTTON`, the test helpers (`setViewport`, `SlotHost`, `houseRuleSuite`).
   - **Extracted, behaviour-preserving (Tasks 1–3), then reused:** `usePagedRead` (the ABA-safe cursor read under `usePagedPortfolio`), `tileParts.tsx` (`Tile`, `Switch`, `FilterButton`, `TileButton`, `TilesSkeleton`), `filterParts.tsx` (`FilterSheet`, `Check`, `Radio`, `FilterGroup`, `GroupSortFields`, `FILTER_SELECT`), `ChipRow`, `MoveToMenu`, `useSearchText`, `SelectionActionsBar` (generic choices plus a date choice), `RowSkeleton`'s `label`, `BoardSkeleton`, `CardSkeleton`.
   - **Pipelines' own:** the kind configs and words (`pipelineKinds.ts`), params and chips, the item and its parts (Part-of line, date line, stage and priority tags, signal), the tiles with the stage strip, the filters panel's sections, the sections list, and the stage Board (columns per stage with Closed Lost collapsed, a card that opens the form, `usePipelineMove`). The Board mirrors `PortfolioBoard`'s settle protocol rather than sharing it; the owner may prefer a later refactor that makes `PortfolioBoard` stage-generic.
2. **An item or card opens the form, built from the row.** `opportunityRecord(row)` / `riskRecord(row)` give the form everything it reads (title, MRR, stage, priority, department, companies, account, date), so no `GET /opportunities/<id>/` is needed. There is no side panel or sheet.
3. **The Open pipeline / MRR at risk tile is a figure, not a button.** It is exactly the List's default view, so as a filter it could only ever clear nothing. The other four tiles filter and toggle.
4. **A closed item past its date** reads "Expected 5 Sep 2026" (opportunity) or "Was due 5 Sep 2026" (risk): the spec's three strings are for open items, and "Overdue" would be false on a closed one. "Closes today" / "Due today" at 0 days.
5. **The kind switch** sits in the top bar from `sm` and as the first row of the page below `sm` (the phone bar has no room beside List | Board and the bell). Switching keeps the shared filters (search, organisation, account, owner, priority, department, date, sort, group) and drops `stage`, `changed` and `ids`, which belong to one kind. Each page is keyed on the kind, so a selection, a move or an open form never crosses kinds.
6. **Stages on the Board.** With no `stage` in the URL the Board asks for every stage; the Filters panel's Stage checkboxes show the view's default checked (List: the open stages, Board: all). Closed Lost starts collapsed ("Show Closed Lost"), stays a drop target, and its open state lasts for the visit, not in the URL. Moves are allowed only when grouped by stage.
7. **Add** uses the existing form's picker: an organisation from the first page of `GET /customers/` (as Accounts' Add), then an optional account under it. An account the viewer can open only without any openable organisation cannot be picked here; its own page's Deals & risks tab adds to it.
8. **The forms call `onSaved` after every successful save** (edits and board-wide adds too, not only scoped adds), so the page reloads its book. Every existing caller passes `onSaved` only where it already wanted it.
9. **`expected_close`, `due_by` and `stage_changed_at` are optional in the TypeScript types.** The API always sends them; the older fixtures (`testStory.ts`, `testAccountPage.ts`) do not, and a missing one reads "No date".
10. **The global `fetchOpportunities` / `fetchRisks` thunks and the `opportunities` / `risks` slice state stay.** Nothing reads them after this delivery, but the Navbar test preloads that state and the create/update reducers write it; removing them is a separate cleanup.
11. **Selection is on the List only**, as on Accounts. Phones select with the toolbar's Select toggle; there is no long-press on pipeline items.
12. **The item does not show the owner.** The spec's item lists title, Part of, MRR, stage, priority, department, date and signal; the owner is the organisation's or account's, and it drives the Owner filter and grouping. For an account-level item the Part-of line adds the first organisation it belongs to that the viewer may open ("Part of Pizza Hut EMEA · Pizza Hut").
13. **Bulk edits:** Set department offers "Whole company" (sent as `""`); Set date is a date input plus a "Clear date" button (sent as `null`), each armed and applied with "Apply to N" like the other choices.
14. **The Navbar and DashboardLayout tests that used `/pipelines/board` as their example of an unframed, padded page** move to `/users`, with the same assertions; `/pipelines/list` and `/pipelines/board` join the DashboardLayout test's unpadded list.
15. **"Framed" means Accounts' List/Board frame:** `DashboardLayout` gives `<main>` no padding, the Navbar is the transparent bar, and `OrganizationsFrame` draws its own `px-4` gutter; the organisation page's `bleed` variant is not used.
16. **Settings → Pipeline attributes** (`pages/settings/pipelineAttributes.ts`) does not gain the new fields in this delivery; the spec does not list it.
17. **No doubled "High priority".** When an item's one signal is High priority, its priority tag is left out (the signal says the same thing); a closed high-priority item, which has no signal, shows the tag.

## File structure

| File | Responsibility |
|---|---|
| `src/components/organizations/portfolio/usePagedRead.ts` (new) | `usePagedRead`, `errorMessage`: the cursor-paged read, given a reader and a noun |
| `src/components/organizations/portfolio/usePortfolio.ts` | `usePagedPortfolio` wraps `usePagedRead`; re-exports `errorMessage` |
| `src/components/organizations/portfolio/tileParts.tsx` (new) | `Tile`, `Switch`, `FilterButton`, `TileButton`, `TilesSkeleton` (moved out of `SummaryTiles.tsx`) |
| `src/components/organizations/portfolio/filterParts.tsx` (new) | `FilterSheet`, `Check`, `Radio`, `FilterGroup`, `GroupSortFields`, `FILTER_SELECT` (moved out of `FiltersPanel.tsx`) |
| `src/components/organizations/portfolio/MoveToMenu.tsx` (new) | The Move to… menu (moved out of `BoardCard.tsx`) |
| `src/components/organizations/portfolio/useSearchText.ts` (new) | The debounced search box state (moved out of `PortfolioToolbar.tsx`) |
| `src/components/organizations/portfolio/SelectionActionsBar.tsx` (new) | The selection bar with generic choices and a date choice; `BulkReport`, `CLEAR_DATE` |
| `src/components/organizations/portfolio/{SummaryTiles,FiltersPanel,FilterChips,BoardCard,PortfolioToolbar,SelectionBar,PortfolioSections,PortfolioBoard,BoardColumn}.tsx`, `styles.ts` | Use the extracted parts; `ChipRow`; `RowSkeleton` `label`; `BoardSkeleton`, `CardSkeleton` exported; `MONO` |
| `src/features/customers/customersSlice.ts` | `Opportunity`: `closed_lost`, `expected_close?`, `stage_changed_at?`; `Risk`: `due_by?`, `stage_changed_at?`; write payloads |
| `src/features/pipelines/pipelineTypes.ts` (new) | The contract's types |
| `src/features/pipelines/pipelineApi.ts` (new) | `fetchPipeline`, `exportPipeline`, `bulkUpdatePipeline` |
| `src/features/pipelines/pipelineKinds.ts` (new) | `OPPORTUNITIES_KIND`, `RISKS_KIND`, stages, choices, sort and group options, `dateText`, `daysFrom`, `rowWithStage`, `opportunityRecord`, `riskRecord`, `dealDateLine`, `parentHref` |
| `src/features/pipelines/pipelineParams.ts` (new) | `PipelineParams`, parse, URL and API queries, `withKind`, `boardPipelineParams` |
| `src/features/pipelines/pipelineChips.ts` (new) | The chips and their labels |
| `src/features/pipelines/testPipelines.ts` (new, test only) | Fixtures, `buildPipelinePage`, `stubPipelines`, request helpers |
| `src/components/pipelines/portfolio/*` (new) | `itemParts`, `PipelineItem`, `PipelineSections`, `PipelineTiles`, `PipelineToolbar`, `PipelineFilters`, `PipelineKindSwitch`, `PipelineModals`, `PipelineCard`, `PipelineColumn`, `PipelineBoard`, `pipelineMove.ts`, `usePipelineParams`, `usePipelineBook`, `usePipelineForms`, `usePipelineMove`, `houseRules.test.ts` |
| `src/components/pipelines/{OpportunityFormModal,RiskFormModal}.tsx`, `kanbanConfig.ts` | The date field, Closed Lost, `onSaved` after every save; stage columns from the kinds |
| `src/components/organizations/detail/DealItem.tsx` | The date line and the Overdue signal |
| `src/pages/pipelines/List.tsx`, `Board.tsx`, `testPages.tsx` (new) | The two pages and their test harness |
| `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/layouts/DashboardLayout.tsx` | Routes; the framed Pipelines bar with both switches; no `<main>` padding |
| `src/pages/pipelines/PipelinesPage.tsx`, `PipelinesPage.test.tsx`, `src/components/shared/PipelinesTab.tsx`, `PipelinesTab.test.tsx` | Deleted |
| `src/e2e/pipelines.test.tsx` (new) | The end-to-end journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

---
### Task 1: The cursor-paged read, given a reader and a noun

**Files:**
- Create: `src/components/organizations/portfolio/usePagedRead.ts`
- Modify: `src/components/organizations/portfolio/usePortfolio.ts` (the `errorMessage`, `Loaded`, `MoreState`, `PagedState` and `usePagedPortfolio` definitions, lines 1–150)
- Test: `src/components/organizations/portfolio/usePagedRead.test.tsx`

**Interfaces:**
- Consumes: `PortfolioNoun` (`features/organizations/portfolioLabels.ts`), `ApiError` (`lib/apiClient`).
- Produces:

```ts
// usePagedRead.ts
export function errorMessage(err: unknown, fallback: string): string;
export interface Paged<R> { results: R[]; next_cursor: string | null }
export interface PagedRead<R, P extends Paged<R>> {
  data: P | null; rows: R[]; next: string | null; loading: boolean; error: string | null;
  loadingMore: boolean; moreError: string | null; loadMore: () => Promise<void>; retry: () => void;
  loadedKey: string | null; loadedQuery: string | null;
}
export function usePagedRead<R, P extends Paged<R>>(
  read: (query: string) => Promise<P>, noun: PortfolioNoun,
  query: string, enabled: boolean, version: number, onLoaded?: (rows: R[]) => void,
): PagedRead<R, P>;
// usePortfolio.ts (unchanged names)
export { errorMessage } from './usePagedRead';
export type PagedState<R, F> = PagedRead<R, PortfolioPage<R, F>>;
export function usePagedPortfolio<R, F>(query, enabled, version, onLoaded?): PagedState<R, F>;
```

`read` and `noun` must be stable (a module-level function and object); they are effect dependencies.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/organizations/portfolio/usePagedRead.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePagedRead } from './usePagedRead';

const NOUN = { one: 'widget', many: 'widgets' };
type Row = { id: number };
type Page = { results: Row[]; next_cursor: string | null; count: number };

describe('usePagedRead', () => {
  it('reads page one, appends the next page and reports what landed', async () => {
    const read = vi.fn(
      async (query: string): Promise<Page> =>
        query.includes('cursor=2')
          ? { results: [{ id: 3 }], next_cursor: null, count: 3 }
          : { results: [{ id: 1 }, { id: 2 }], next_cursor: '2', count: 3 },
    );
    const onLoaded = vi.fn();
    const { result } = renderHook(() => usePagedRead<Row, Page>(read, NOUN, 'limit=2', true, 0, onLoaded));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([1, 2]));
    expect(result.current.data?.count).toBe(3);
    expect(result.current.loadedQuery).toBe('limit=2');
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.rows.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(read).toHaveBeenLastCalledWith('limit=2&cursor=2');
    expect(onLoaded).toHaveBeenCalledTimes(2);
  });

  it('reads nothing while disabled, and names its noun when a read fails', async () => {
    const read = vi.fn(async (): Promise<Page> => {
      throw new Error('boom');
    });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePagedRead<Row, Page>(read, NOUN, 'q', enabled, 0),
      { initialProps: { enabled: false } },
    );
    expect(read).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.error).toBe('Could not load widgets.'));
    expect(result.current.data).toBeNull();
  });

  it('reads again on retry and on a new version', async () => {
    const read = vi.fn(async (): Promise<Page> => ({ results: [], next_cursor: null, count: 0 }));
    const { result, rerender } = renderHook(({ version }: { version: number }) => usePagedRead<Row, Page>(read, NOUN, 'q', true, version), {
      initialProps: { version: 0 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.retry());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    rerender({ version: 1 });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio/usePagedRead.test.tsx`
Expected: FAIL — `Failed to resolve import "./usePagedRead"`.

- [ ] **Step 3: Write the hook**

```ts
// src/components/organizations/portfolio/usePagedRead.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** What a cursor-paged endpoint returns, at least. */
export interface Paged<R> {
  results: R[];
  next_cursor: string | null;
}

type Loaded<R, P extends Paged<R>> =
  | { key: string; query: string; data: P; rows: R[]; next: string | null }
  | { key: string; error: string };

type MoreState = { key: string; token: number; loading: boolean; error: string | null };

export interface PagedRead<R, P extends Paged<R>> {
  /** The latest response. While a new query loads, the previous one stays so
   *  the list does not flash empty. `loading` says it is stale. */
  data: P | null;
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

/** One cursor-paged read through `read` (a portfolio kind's endpoint, or a
 *  Pipelines kind's). A frame, a grouped section and a board column are each
 *  one of these. Loading is derived from which query the stored answer
 *  belongs to, so no state is set synchronously inside the effect. `read`
 *  and `noun` must be stable: they are effect dependencies. */
export function usePagedRead<R, P extends Paged<R>>(
  read: (query: string) => Promise<P>,
  noun: PortfolioNoun,
  query: string,
  enabled: boolean,
  version: number,
  onLoaded?: (rows: R[]) => void,
): PagedRead<R, P> {
  const [attempt, setAttempt] = useState(0);
  const key = `${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded<R, P> | null>(null);
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
    read(query).then(
      (data) => {
        if (cancelled) return;
        setLoaded({ key, query, data, rows: data.results, next: data.next_cursor });
        onLoadedRef.current?.(data.results);
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ key, error: errorMessage(err, `Could not load ${noun.many}.`) });
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
  }, [enabled, key, query, read, noun]);

  const current = loaded && 'data' in loaded ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current || current.key !== key || !current.next || loadMoreCallRef.current !== null) return;
    const token = generationRef.current;
    loadMoreCallRef.current = token;
    const cursor = current.next;
    setMoreState({ key, token, loading: true, error: null });
    try {
      const page = await read(`${query}&cursor=${encodeURIComponent(cursor)}`);
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
      setMoreState({ key, token, loading: false, error: errorMessage(err, `Could not load more ${noun.many}.`) });
    } finally {
      if (loadMoreCallRef.current === token) loadMoreCallRef.current = null;
    }
  }, [current, key, query, read, noun]);

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
```

- [ ] **Step 4: Make `usePagedPortfolio` a wrapper**

In `src/components/organizations/portfolio/usePortfolio.ts`, replace everything from the first line down to the end of `usePagedPortfolio` (the line before `export interface PortfolioState`) with:

```ts
import { useCallback, useEffect, useState } from 'react';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type {
  FilterOptions,
  OrganizationFilters,
  PortfolioPage,
  PortfolioRow,
  PortfolioRowBase,
} from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { usePagedRead, type PagedRead } from './usePagedRead';

export { errorMessage } from './usePagedRead';

export const PAGE_SIZE = 50;
export const SECTION_PAGE_SIZE = 25;

export type PagedState<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters> = PagedRead<
  R,
  PortfolioPage<R, F>
>;

/** One cursor-paged read of the kind's portfolio endpoint (`kind.fetch`):
 *  `usePagedRead` with the kind's reader and noun. */
export function usePagedPortfolio<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>(
  query: string,
  enabled: boolean,
  version: number,
  onLoaded?: (rows: R[]) => void,
): PagedState<R, F> {
  const kind = usePortfolioKind();
  const read = useCallback((q: string) => kind.fetch(q) as Promise<PortfolioPage<R, F>>, [kind]);
  return usePagedRead<R, PortfolioPage<R, F>>(read, kind.noun, query, enabled, version, onLoaded);
}
```

Leave `PortfolioState` and `usePortfolio` below it as they are (`PortfolioState` still `extends PagedState<R, F>`). `useRef` is no longer imported: `usePortfolio` does not use it.

- [ ] **Step 5: Run the new and the existing tests**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio/usePagedRead.test.tsx src/components/organizations/portfolio/usePortfolio.test.tsx src/pages/organizations/List.test.tsx src/pages/accounts/List.test.tsx`
Expected: PASS, no existing assertion changed.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/components/organizations/portfolio/usePagedRead.ts src/components/organizations/portfolio/usePagedRead.test.tsx src/components/organizations/portfolio/usePortfolio.ts
git commit -m "refactor(portfolio): the cursor-paged read takes its reader and noun

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The tile, filter, chip, menu and search primitives, shared

Every move here is a cut and paste: the Organizations and Accounts pages must render the same DOM afterwards, which their existing tests pin.

**Files:**
- Create: `src/components/organizations/portfolio/tileParts.tsx`, `filterParts.tsx`, `MoveToMenu.tsx`, `useSearchText.ts`
- Modify: `src/components/organizations/portfolio/SummaryTiles.tsx` (imports; lines 15–102; the Renewing tile's button)
- Modify: `src/components/organizations/portfolio/FiltersPanel.tsx` (whole file)
- Modify: `src/components/organizations/portfolio/FilterChips.tsx` (whole file)
- Modify: `src/components/organizations/portfolio/BoardCard.tsx` (whole file)
- Modify: `src/components/organizations/portfolio/PortfolioToolbar.tsx` (imports; the search state block)
- Modify: `src/components/organizations/portfolio/PortfolioSections.tsx` (`RowSkeleton`)
- Modify: `src/components/organizations/portfolio/PortfolioBoard.tsx` (`function BoardSkeleton` → exported), `BoardColumn.tsx` (`function CardSkeleton` → exported)
- Modify: `src/components/organizations/portfolio/styles.ts` (add `MONO`)
- Test: `src/components/organizations/portfolio/sharedParts.test.tsx`

**Interfaces:**
- Consumes: `FOCUS`, `useDismiss`, `trapTab` (existing).
- Produces:

```ts
// tileParts.tsx
export function Tile(props: { title: string; action?: ReactNode; children: ReactNode }): JSX.Element;
export function Switch<T extends string>(props: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }): JSX.Element;
export function FilterButton(props: { pressed: boolean; onClick: () => void; compact?: boolean; children: ReactNode }): JSX.Element;
export function TileButton(props: { pressed: boolean; label: string; onClick: () => void; children: ReactNode }): JSX.Element;
export function TilesSkeleton(props: { count?: number }): JSX.Element; // role=status "Loading summary"
// filterParts.tsx
export const FILTER_SELECT: string;
export function Check(props: { label: string; checked: boolean; onChange: () => void }): JSX.Element;
export function Radio(props: { name: string; label: string; checked: boolean; onChange: () => void }): JSX.Element;
export function FilterGroup(props: { legend: string; children: ReactNode }): JSX.Element;
export function GroupSortFields(props: { group: string; sort: string; groupOptions: { value: string; label: string }[]; sortOptions: { value: string; label: string }[]; onGroup: (value: string) => void; onSort: (sort: string) => void }): JSX.Element;
export function FilterSheet(props: { isSm: boolean; onClose: () => void; triggerRef?: RefObject<HTMLElement | null>; initialFocusRef?: RefObject<HTMLElement | null>; children: ReactNode }): JSX.Element;
// FilterChips.tsx
export interface RemovableChip<P> { key: string; label: string; patch: Partial<P> }
export function ChipRow<P>(props: { chips: RemovableChip<P>[]; status: string; onChange: (patch: Partial<P>) => void; onClearAll: () => void }): JSX.Element;
// MoveToMenu.tsx
export function MoveToMenu(props: { name: string; disabled: boolean; note: string | null; targets: { value: string; label: string }[]; onChoose: (to: string) => void }): JSX.Element;
// useSearchText.ts
export function useSearchText(committed: string, commit: (text: string) => void): [string, (text: string) => void];
// PortfolioSections.tsx
export function RowSkeleton(props: { count: number; label?: string }): JSX.Element;
// PortfolioBoard.tsx / BoardColumn.tsx
export function BoardSkeleton(props: { isSm: boolean; narrow: boolean }): JSX.Element;
export function CardSkeleton(props: { label: string; count: number }): JSX.Element;
// styles.ts
export const MONO = 'font-mono-brand tabular-nums';
```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/organizations/portfolio/sharedParts.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCallback, useRef, useState } from 'react';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipRow } from './FilterChips';
import { FilterSheet, GroupSortFields } from './filterParts';
import { MoveToMenu } from './MoveToMenu';
import { RowSkeleton } from './PortfolioSections';
import { TileButton, TilesSkeleton } from './tileParts';
import { useSearchText } from './useSearchText';

function SheetHarness({ isSm }: { isSm: boolean }) {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  return (
    <>
      <button ref={trigger} type="button">
        Open filters
      </button>
      {open ? (
        <FilterSheet isSm={isSm} onClose={close} triggerRef={trigger} initialFocusRef={first}>
          <select ref={first} aria-label="Owner">
            <option>Everyone</option>
          </select>
        </FilterSheet>
      ) : null}
    </>
  );
}

describe('the shared portfolio parts', () => {
  afterEach(() => vi.useRealTimers());

  it('TileButton is a pressed toggle named by its label; TilesSkeleton draws one placeholder per tile', async () => {
    const onClick = vi.fn();
    render(
      <>
        <TileButton pressed label="Overdue: 2" onClick={onClick}>
          <span>2</span>
        </TileButton>
        <TilesSkeleton count={3} />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Overdue: 2' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass('bg-subtle');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('status', { name: 'Loading summary' }).children).toHaveLength(3);
  });

  it('FilterSheet focuses its first control, closes on Escape and hands focus back to the trigger', async () => {
    render(<SheetHarness isSm />);
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(screen.getByRole('combobox', { name: 'Owner' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open filters' })).toHaveFocus();
  });

  it('FilterSheet is a modal bottom sheet below sm, closed by its button', async () => {
    render(<SheetHarness isSm={false} />);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveAttribute('aria-modal', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('GroupSortFields reports a group, a sort field kept in its direction, and a direction flip', async () => {
    const onGroup = vi.fn();
    const onSort = vi.fn();
    render(
      <GroupSortFields
        group="stage"
        sort="-mrr"
        groupOptions={[
          { value: 'none', label: 'None' },
          { value: 'stage', label: 'Stage' },
        ]}
        sortOptions={[
          { value: 'mrr', label: 'MRR' },
          { value: 'title', label: 'Title' },
        ]}
        onGroup={onGroup}
        onSort={onSort}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'none');
    expect(onGroup).toHaveBeenCalledWith('none');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'title');
    expect(onSort).toHaveBeenCalledWith('-title');
    await userEvent.click(screen.getByRole('button', { name: 'Descending' }));
    expect(onSort).toHaveBeenLastCalledWith('mrr');
  });

  it('ChipRow removes a chip with its patch, clears all, and says the count', async () => {
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(
      <ChipRow<{ q: string }>
        chips={[{ key: 'q', label: 'Search: emea', patch: { q: '' } }]}
        status="1 of 3 things"
        onChange={onChange}
        onClearAll={onClearAll}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Search: emea' }));
    expect(onChange).toHaveBeenCalledWith({ q: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 things');
  });

  it('MoveToMenu lists the targets, chooses one and hands focus back to its button', async () => {
    const onChoose = vi.fn();
    render(
      <MoveToMenu
        name="EMEA seats"
        disabled={false}
        note={null}
        targets={[
          { value: 'closed_won', label: 'Closed Won' },
          { value: 'closed_lost', label: 'Closed Lost' },
        ]}
        onChoose={onChoose}
      />,
    );
    const button = screen.getByRole('button', { name: 'Move EMEA seats to…' });
    await userEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Move EMEA seats to' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Closed Won', 'Closed Lost']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Closed Lost' }));
    expect(onChoose).toHaveBeenCalledWith('closed_lost');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('useSearchText commits 300ms after typing stops, and follows a new committed value', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ committed }: { committed: string }) => useSearchText(committed, commit), {
      initialProps: { committed: '' },
    });
    act(() => result.current[1]('emea '));
    expect(result.current[0]).toBe('emea ');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(commit).toHaveBeenCalledWith('emea');
    rerender({ committed: 'globex' });
    expect(result.current[0]).toBe('globex');
  });

  it('RowSkeleton takes the label a caller gives it', () => {
    render(<RowSkeleton count={2} label="Loading risks" />);
    expect(screen.getByRole('status', { name: 'Loading risks' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio/sharedParts.test.tsx`
Expected: FAIL — `Failed to resolve import "./filterParts"`.

- [ ] **Step 3: Create `tileParts.tsx`** (moved from `SummaryTiles.tsx`, markup unchanged)

```tsx
// src/components/organizations/portfolio/tileParts.tsx
import { useId, type ReactNode } from 'react';
import { FOCUS } from './styles';

/** A group named by its heading, not a region: five tiles as landmarks
 *  would crowd a screen reader's landmark list. */
export function Tile({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="min-w-[15rem] shrink-0 snap-start rounded-xl bg-surface p-3 sm:min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Switch<T extends string>({
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

export function FilterButton({
  pressed,
  onClick,
  compact = false,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full min-w-0 min-h-11 ${compact ? 'sm:min-h-6' : 'sm:min-h-7'} items-center justify-between gap-2 rounded-md px-1.5 text-[11px] hover:bg-subtle active:bg-line-subtle ${FOCUS} ${
        pressed ? 'bg-subtle font-semibold text-ink' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** A whole tile body as one filter toggle (Renewing, Closing, Overdue, …). */
export function TileButton({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`-m-1 block w-full rounded-lg p-1 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS} ${pressed ? 'bg-subtle' : ''}`}
    >
      {children}
    </button>
  );
}

export function TilesSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading summary" className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-2 @min-[50rem]:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" className="min-w-[15rem] shrink-0 rounded-xl bg-surface p-3 sm:min-w-0">
          <span className="block h-2.5 w-16 animate-pulse rounded bg-subtle" />
          <span className="mt-3 block h-5 w-20 animate-pulse rounded bg-subtle" />
          <span className="mt-3 block h-2 w-full animate-pulse rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `SummaryTiles.tsx` reads them**

1. Replace the first line `import { useId, useState, type ReactNode } from 'react';` with `import { useState } from 'react';`.
2. Delete the line `import { FOCUS } from './styles';` and add `import { FilterButton, Switch, Tile, TileButton, TilesSkeleton } from './tileParts';` after the `usePortfolioKind` import.
3. Delete the definitions of `Tile` (with its doc comment), `Switch`, `FilterButton` and `Skeleton` (lines 15–102). Keep the two constants between them: `const only = …` and `const mono = …`.
4. Replace `if (!failed) return <Skeleton />;` with `if (!failed) return <TilesSkeleton />;`.
5. In the Renewing tile, replace the `<button type="button" aria-pressed={params.renews_within === span} … >` element (through its closing `</button>`) with:

```tsx
        <TileButton
          pressed={params.renews_within === span}
          label={`Renewing within ${span} days: ${renewing}`}
          onClick={() => onFilter({ renews_within: params.renews_within === span ? '' : span })}
        >
          <span className={`${mono} block text-[22px] leading-tight text-ink`}>{renewing}</span>
          <span className="block text-[11px] text-ink-muted">within {span} days, overdue included</span>
        </TileButton>
```

- [ ] **Step 5: Create `filterParts.tsx`** (moved from `FiltersPanel.tsx`, markup unchanged)

```tsx
// src/components/organizations/portfolio/filterParts.tsx
// The Filters sheet's frame and fields, shared by every portfolio's panel
// (Organizations, Accounts, Pipelines). Exports a class string beside the
// components, as rowParts.tsx does.
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { trapTab } from '../../../lib/focusTrap';
import { FOCUS } from './styles';

export const FILTER_SELECT = `min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink hover:border-line-strong disabled:opacity-50 ${FOCUS}`;

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className={`w-4 h-4 accent-accent ${FOCUS}`} />
      {label}
    </label>
  );
}

export function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 sm:min-h-8 items-center gap-2 text-[13px] text-ink">
      <input type="radio" name={name} checked={checked} onChange={onChange} className={`w-4 h-4 accent-accent ${FOCUS}`} />
      {label}
    </label>
  );
}

export function FilterGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** Group and sort as two labelled selects and a direction toggle. `group`
 *  is an option value ('none' for no grouping); `sort` is a sort key with a
 *  '-' prefix when descending. */
export function GroupSortFields({
  group,
  sort,
  groupOptions,
  sortOptions,
  onGroup,
  onSort,
}: {
  group: string;
  sort: string;
  groupOptions: { value: string; label: string }[];
  sortOptions: { value: string; label: string }[];
  onGroup: (value: string) => void;
  onSort: (sort: string) => void;
}) {
  const descending = sort.startsWith('-');
  const field = sort.replace(/^-/, '');
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
        <select id={groupId} className={FILTER_SELECT} value={group} onChange={(event) => onGroup(event.target.value)}>
          {groupOptions.map((option) => (
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
          className={FILTER_SELECT}
          value={field}
          onChange={(event) => onSort(`${descending ? '-' : ''}${event.target.value}`)}
        >
          {sortOptions.map((option) => (
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
          onClick={() => onSort(descending ? field : `-${field}`)}
          className={`inline-flex w-11 h-11 sm:w-9 sm:h-9 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
        >
          {descending ? <ArrowDown className="w-4 h-4" aria-hidden="true" /> : <ArrowUp className="w-4 h-4" aria-hidden="true" />}
        </button>
      </span>
    </>
  );
}

/** The Filters frame: from `sm` a popover under the toolbar, below `sm` a
 *  modal bottom sheet. Its first field takes focus (`initialFocusRef`).
 *  Escape, the close button and applying a choice hand focus back to the
 *  trigger; an outside click doesn't (the user moved focus on purpose). */
export function FilterSheet({
  isSm,
  onClose,
  triggerRef,
  initialFocusRef,
  children,
}: {
  isSm: boolean;
  onClose: () => void;
  /** The toolbar's "Filters" button. Excluded from the "click outside"
   *  close check entirely — not just from where the popover itself sits —
   *  so a click that reopens it (its own onClick toggle) never races a
   *  mousedown that would otherwise close it first. Also where focus goes
   *  back to on close. */
  triggerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);

  useEffect(() => {
    restoreFocus.current = true;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const trigger = triggerRef?.current ?? null;
    initialFocusRef?.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (!isSm && event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (trigger?.contains(target)) return;
      restoreFocus.current = false;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    if (isSm) document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (isSm) document.removeEventListener('mousedown', onPointerDown);
      if (restoreFocus.current) (trigger ?? previouslyFocused)?.focus();
    };
  }, [isSm, onClose, triggerRef, initialFocusRef]);

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
      {children}
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
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Filters" className="relative max-h-[85dvh] overflow-y-auto rounded-t-xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `FiltersPanel.tsx` on those parts**

```tsx
// src/components/organizations/portfolio/FiltersPanel.tsx
import { useId, useRef, type RefObject } from 'react';
import { Download, Plus } from 'lucide-react';
import { HEALTH_BANDS, toggleIn, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import { HEALTH_LABEL, NPS_BANDS, NPS_LABEL, RENEWAL_WINDOWS, windowLabel } from '../../../features/organizations/portfolioLabels';
import type { FilterOptions, GroupKey, LifecycleValue, NpsBand } from '../../../features/organizations/portfolioTypes';
import type { GroupOption } from '../../../features/organizations/portfolioGroups';
import { Check, FILTER_SELECT, FilterGroup, FilterSheet, GroupSortFields, Radio } from './filterParts';
import { usePortfolioKind } from './portfolioKind';
import { FOCUS } from './styles';

// Kept importable from here, where the pages and tests already find them.
export { BOARD_GROUP_OPTIONS, GROUP_OPTIONS, type GroupOption } from '../../../features/organizations/portfolioGroups';

/** Group and sort: in the toolbar from `sm`, inside the Filters sheet below. */
export function GroupSortControls({
  params,
  update,
  groupOptions,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  /** The Board passes its kind's board options; absent, the kind's List options. */
  groupOptions?: GroupOption[];
}) {
  const kind = usePortfolioKind();
  return (
    <GroupSortFields
      group={params.group || 'none'}
      sort={params.sort}
      groupOptions={groupOptions ?? kind.groupOptions}
      sortOptions={kind.sortOptions}
      onGroup={(value) => update({ group: value === 'none' ? '' : (value as GroupKey) })}
      onSort={(sort) => update({ sort })}
    />
  );
}

const WINDOWS: { value: PortfolioParams['renews_within']; label: string }[] = [
  { value: '', label: 'Any time' },
  ...RENEWAL_WINDOWS.map((days) => ({ value: days, label: windowLabel(days) })),
];
const NPS: { value: '' | NpsBand; label: string }[] = [
  { value: '', label: 'Any' },
  ...NPS_BANDS.map((band) => ({ value: band, label: NPS_LABEL[band] })),
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
  triggerRef,
  groupOptions,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  options: FilterOptions | null;
  isSm: boolean;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  /** The phone sheet's Group choices (the Board passes BOARD_GROUP_OPTIONS). */
  groupOptions?: GroupOption[];
}) {
  const kind = usePortfolioKind();
  const ownerRef = useRef<HTMLSelectElement>(null);
  const ownerId = useId();

  return (
    <FilterSheet isSm={isSm} onClose={onClose} triggerRef={triggerRef} initialFocusRef={ownerRef}>
      {!isSm ? (
        <div className="flex flex-wrap items-center gap-3">
          <GroupSortControls params={params} update={update} groupOptions={groupOptions} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={ownerId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Owner
        </label>
        {/* The server's options already include Unassigned. */}
        <select ref={ownerRef} id={ownerId} className={FILTER_SELECT} value={params.owner} onChange={(event) => update({ owner: event.target.value })}>
          <option value="">Everyone</option>
          {(options?.owners ?? []).map((owner) => (
            <option key={owner.value} value={owner.value}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>

      {kind.filters.organisation ? (
        <FilterGroup legend="Organization">
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
        </FilterGroup>
      ) : null}

      <FilterGroup legend="Health">
        {HEALTH_BANDS.map((band) => (
          <Check key={band} label={HEALTH_LABEL[band]} checked={params.health.includes(band)} onChange={() => update({ health: toggleIn(params.health, band) })} />
        ))}
      </FilterGroup>

      <FilterGroup legend="Lifecycle">
        {(options?.lifecycles ?? []).map((stage) => (
          <Check
            key={stage.value}
            label={stage.name}
            checked={params.lifecycle.includes(stage.value as LifecycleValue)}
            onChange={() => update({ lifecycle: toggleIn(params.lifecycle, stage.value as LifecycleValue) })}
          />
        ))}
      </FilterGroup>

      {kind.filters.product ? (
        <FilterGroup legend="Product">
          {options?.products?.length ? (
            options.products.map((product) => (
              <Check key={product.value} label={product.name} checked={params.product.includes(product.value)} onChange={() => update({ product: toggleIn(params.product, product.value) })} />
            ))
          ) : (
            <p className="text-[13px] text-ink-muted">No products in the catalogue yet.</p>
          )}
        </FilterGroup>
      ) : null}

      <FilterGroup legend="Renews within">
        {WINDOWS.map((w) => (
          <Radio key={w.label} name="renews_within" label={w.label} checked={params.renews_within === w.value} onChange={() => update({ renews_within: w.value })} />
        ))}
      </FilterGroup>

      <FilterGroup legend="NPS">
        {NPS.map((n) => (
          <Radio key={n.label} name="nps" label={n.label} checked={params.nps === n.value} onChange={() => update({ nps: n.value })} />
        ))}
      </FilterGroup>

      {kind.filters.churned ? (
        <FilterGroup legend="Churned">
          <Check label="Include churned" checked={params.include_churned} onChange={() => update({ include_churned: !params.include_churned })} />
        </FilterGroup>
      ) : null}

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
            {`Add ${kind.noun.one}`}
          </button>
        </div>
      ) : null}
    </FilterSheet>
  );
}
```

- [ ] **Step 7: Rewrite `FilterChips.tsx` around a generic `ChipRow`**

```tsx
// src/components/organizations/portfolio/FilterChips.tsx
import { X } from 'lucide-react';
import { countText, filterChips } from '../../../features/organizations/filterChips';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { FOCUS } from './styles';

/** One active filter as a chip: removing it writes `patch` to the URL. */
export interface RemovableChip<P> {
  key: string;
  label: string;
  patch: Partial<P>;
}

/** The row under a portfolio's toolbar, for any params shape: one
 *  removable chip per active filter, "Clear all", and a live count. */
export function ChipRow<P>({
  chips,
  status,
  onChange,
  onClearAll,
}: {
  chips: RemovableChip<P>[];
  status: string;
  onChange: (patch: Partial<P>) => void;
  onClearAll: () => void;
}) {
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
        {status}
      </p>
    </div>
  );
}

export function FilterChips({
  params,
  options,
  count,
  total,
  failed = false,
  onChange,
  onClearAll,
}: {
  params: PortfolioParams;
  options: FilterOptions | null;
  count: number | null;
  total: number | null;
  /** The first load failed: there is no count to wait for. */
  failed?: boolean;
  onChange: (patch: Partial<PortfolioParams>) => void;
  onClearAll: () => void;
}) {
  const kind = usePortfolioKind();
  const chips = filterChips(params, options);
  return (
    <ChipRow
      chips={chips}
      status={countText(count, total, chips.length > 0, failed, kind.noun)}
      onChange={onChange}
      onClearAll={onClearAll}
    />
  );
}
```

- [ ] **Step 8: Create `MoveToMenu.tsx` and rewrite `BoardCard.tsx` on it**

```tsx
// src/components/organizations/portfolio/MoveToMenu.tsx
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { FOCUS } from './styles';
import { useDismiss } from './useDismiss';

/** The menu's tallest height (seven 32px items plus `py-1`) and its gap. */
const MENU_MAX = 224;
const MENU_GAP = 4;
/** Never squeeze the menu below two items: it scrolls instead. */
const MENU_MIN = 88;

/** The part of the screen `el` can actually be seen in: the window,
 *  intersected with every ancestor that clips its overflow (a desktop
 *  column's scroller, the phone panel strip, the page frame). A column that
 *  runs past the bottom of the window only counts down to the window. */
function visibleBox(el: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = window.getComputedStyle(node);
    if (/auto|scroll|hidden|clip/.test(`${overflowX} ${overflowY}`)) {
      const bounds = node.getBoundingClientRect();
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  return { top, bottom };
}

/** Where the menu goes. It hangs off the button (absolutely positioned, no
 *  portal), so it opens on whichever side of the button has room inside the
 *  visible box, preferring below, and its height is capped to that room (it
 *  scrolls) so no stage is ever cut off. */
function placeMenu(button: HTMLElement): { upward: boolean; maxHeight: number } {
  const box = visibleBox(button);
  const rect = button.getBoundingClientRect();
  const below = box.bottom - rect.bottom - MENU_GAP;
  const above = rect.top - box.top - MENU_GAP;
  const upward = below < MENU_MAX && above > below;
  const room = upward ? above : below;
  return { upward, maxHeight: Math.max(MENU_MIN, Math.min(MENU_MAX, room)) };
}

/** A card's "Move to…" control (controller ruling R1, browser finding B1):
 *  a compact icon button that opens a real menu of the other stages, so
 *  nothing moves until one is chosen. Arrow Up/Down, Home and End move
 *  between items. Escape and choosing an item close the menu and return
 *  focus to the button. A press outside closes it and leaves focus where the
 *  user put it, and Tab closes it as focus moves on. Opening another card's
 *  menu closes this one (the press is outside it). `name` is the record's
 *  own ("Pizza Hut", "EMEA seats"). */
export function MoveToMenu({
  name,
  disabled,
  note,
  targets,
  onChoose,
}: {
  name: string;
  disabled: boolean;
  note: string | null;
  targets: { value: string; label: string }[];
  onChoose: (to: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState({ upward: false, maxHeight: MENU_MAX });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const closeMenu = () => {
    setOpenMenu(false);
    buttonRef.current?.focus();
  };

  useDismiss([menuRef, buttonRef], (reason) => (reason === 'escape' ? closeMenu() : setOpenMenu(false)), openMenu);

  useEffect(() => {
    if (openMenu) itemRefs.current[activeIndex]?.focus();
  }, [openMenu, activeIndex]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = targets.length - 1;
    const to: Record<string, (i: number) => number> = {
      ArrowDown: (i) => (i + 1) % targets.length,
      ArrowUp: (i) => (i - 1 + targets.length) % targets.length,
      Home: () => 0,
      End: () => last,
    };
    if (to[event.key]) {
      event.preventDefault();
      setActiveIndex(to[event.key]);
    } else if (event.key === 'Tab') {
      // Let the browser move focus on first, then close: unmounting the
      // focused item inside the keydown would leave the Tab nowhere to go.
      window.setTimeout(() => setOpenMenu(false), 0);
    }
  };

  return (
    <span className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={openMenu}
        aria-label={`Move ${name} to…`}
        title={disabled && note ? note : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setActiveIndex(0);
          if (!openMenu && buttonRef.current) setPlacement(placeMenu(buttonRef.current));
          setOpenMenu((was) => !was);
        }}
        className={`inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle disabled:opacity-50 ${FOCUS}`}
      >
        <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      {openMenu ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Move ${name} to`}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute right-0 z-20 flex w-44 ${placement.upward ? 'bottom-full mb-1' : 'top-full mt-1'} flex-col overflow-y-auto rounded-lg border border-line bg-elevated py-1 shadow-md`}
        >
          {targets.map((target, index) => (
            <button
              key={target.value}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                onChoose(target.value);
                closeMenu();
              }}
              className={`flex min-h-11 sm:min-h-8 shrink-0 items-center px-3 text-left text-[13px] text-ink hover:bg-subtle focus-visible:bg-subtle ${FOCUS}`}
            >
              {target.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
```

```tsx
// src/components/organizations/portfolio/BoardCard.tsx
import { memo, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { PanelRight } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { LIFECYCLE_LABELS, formatCompactMoney } from '../../../features/customers/formatters';
import { LIFECYCLE_VALUES } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { MoveToMenu } from './MoveToMenu';
import { usePortfolioKind } from './portfolioKind';
import { HealthRing, SignalTag, TrendLine } from './rowParts';
import { FOCUS } from './styles';

/** The id of the Board's side panel (AccountSidePanel), which an open card controls. */
export const DETAILS_PANEL_ID = 'board-account-details';

export interface BoardCardProps<R extends PortfolioRowBase = PortfolioRow> {
  row: R;
  currency: CurrencyCode;
  /** From `sm`. HTML5 drag has no touch support, so phones move with the menu only. */
  isSm: boolean;
  /** Its details are showing (side panel from `sm`, bottom sheet below). */
  open: boolean;
  /** Grouped by lifecycle: the card drags and has a Move to… menu. */
  canMove: boolean;
  /** A move is saving or settling (one at a time). */
  moveDisabled: boolean;
  /** Why moving is off, shown on the Move to… button when it is stuck. */
  moveNote?: string | null;
  onOpen: (row: R) => void;
  /** `fromMenu` is true for a Move to… choice (keyboard or touch), whose
   *  card should keep focus in its new column; a drag leaves focus alone. */
  onMove: (row: R, to: LifecycleValue, fromMenu?: boolean) => void;
  onDragStart: (row: R) => void;
  onDragEnd: () => void;
}

/** One account on the Board (spec §1 "Board"): AccountRow's phone-card
 *  content (ring, name, owner, then ARR, signal and trend) as a compact
 *  card. A click opens its details beside the board. The name links to the
 *  card's kind (Organizations: the organization page; Accounts: its own
 *  page). The header's Move to… icon button is the keyboard and
 *  touch path for a move; after one, the board keeps focus on this card's
 *  Open button (`data-part="open"`) in its new column. Memoised: dragging re-renders the board, and only
 *  the cards whose props change should follow. */
function BoardCardView<R extends PortfolioRowBase>({
  row,
  currency,
  isSm,
  open,
  canMove,
  moveDisabled,
  moveNote = null,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: BoardCardProps<R>) {
  const kind = usePortfolioKind();
  // A record the kind cannot save from here (an account none of whose
  // organisations the viewer may open) neither drags nor has Move to….
  const movable = canMove && kind.editable(row);
  const draggable = isSm && movable && !moveDisabled;
  const arr = row.arr == null ? '—' : formatCompactMoney(row.arr, currency);
  const targets = LIFECYCLE_VALUES.filter((value) => value !== row.lifecycle.value).map((value) => ({
    value,
    label: LIFECYCLE_LABELS[value],
  }));

  const startDrag = (event: DragEvent<HTMLLIElement>) => {
    // jsdom has no DataTransfer. Browsers get the id so Firefox starts the drag.
    event.dataTransfer?.setData('text/plain', String(row.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    onDragStart(row);
  };

  return (
    <li
      data-card-id={row.id}
      draggable={draggable}
      onDragStart={draggable ? startDrag : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onOpen(row)}
      className={`cursor-pointer rounded-xl bg-surface p-3 transition-shadow duration-[var(--dur-fast)] hover:shadow-sm ${
        open ? 'ring-1 ring-accent' : ''
      } ${draggable ? 'active:cursor-grabbing' : ''}`}
    >
      <div data-part="card-header" className="flex items-start gap-2.5">
        <HealthRing score={row.health.score} category={row.health.category} />
        <div className="min-w-0 flex-1">
          <Link
            to={kind.href(row)}
            state={kind.linkState(row)}
            draggable={false}
            onClick={(event) => event.stopPropagation()}
            className={`flex min-h-11 min-w-0 items-center truncate rounded-sm text-[13px] font-semibold text-ink hover:underline sm:block sm:min-h-0 ${FOCUS}`}
          >
            <span className="truncate">{row.name}</span>
          </Link>
          <p className="truncate text-[11px] text-ink-muted">{kind.cardSubtitle(row)}</p>
        </div>
        {movable ? (
          <MoveToMenu
            name={row.name}
            disabled={moveDisabled}
            note={moveNote}
            targets={targets}
            onChoose={(to) => onMove(row, to as LifecycleValue, true)}
          />
        ) : null}
        <button
          data-part="open"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row);
          }}
          aria-expanded={open}
          aria-controls={open && isSm ? DETAILS_PANEL_ID : undefined}
          aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
          className={`inline-flex w-11 h-11 sm:w-9 sm:h-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
        >
          <PanelRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span className="font-mono-brand tabular-nums text-[13px] text-ink">{arr}</span>
        <SignalTag signal={row.signal} />
        <TrendLine trend={row.health.trend} category={row.health.category} className="ml-auto" />
      </div>
    </li>
  );
}

/** Memoised (see above). `memo` drops the row's type parameter; the cast
 *  gives it back. */
export const BoardCard = memo(BoardCardView) as typeof BoardCardView;
```

- [ ] **Step 9: Create `useSearchText.ts` and use it in `PortfolioToolbar.tsx`**

```ts
// src/components/organizations/portfolio/useSearchText.ts
import { useEffect, useState } from 'react';

/** A search box's text: what is typed shows at once, and `commit` gets it
 *  (trimmed) 300ms after typing stops. When `committed` changes from outside
 *  (a chip, "Clear all"), the box follows it (adjusted during render, not
 *  in an effect). `commit` should be stable. */
export function useSearchText(committed: string, commit: (text: string) => void): [string, (text: string) => void] {
  const [text, setText] = useState(committed);
  const [synced, setSynced] = useState(committed);
  if (committed !== synced) {
    setSynced(committed);
    setText(committed);
  }
  useEffect(() => {
    if (text.trim() === committed) return;
    const timeout = window.setTimeout(() => commit(text.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [text, committed, commit]);
  return [text, setText];
}
```

In `PortfolioToolbar.tsx`:
1. Replace the first import with `import { useCallback, useRef, useState, type RefObject } from 'react';` and add `import { useSearchText } from './useSearchText';` after the `./styles` import.
2. Replace the block from `// The box shows what is typed; …` down to the end of the `useEffect(() => { if (text.trim() === params.search) return; … }, [text, params.search, update]);` with:

```ts
  // The box shows what is typed; the URL gets it 300ms after typing stops.
  const commitSearch = useCallback((search: string) => update({ search }), [update]);
  const [text, setText] = useSearchText(params.search, commitSearch);
```

- [ ] **Step 10: The small edits**

- `PortfolioSections.tsx`: change `export function RowSkeleton({ count }: { count: number }) {` to `export function RowSkeleton({ count, label }: { count: number; label?: string }) {` and its `aria-label={`Loading ${kind.noun.many}`}` to `aria-label={label ?? `Loading ${kind.noun.many}`}`.
- `PortfolioBoard.tsx`: `function BoardSkeleton(` → `export function BoardSkeleton(`.
- `BoardColumn.tsx`: `function CardSkeleton(` → `export function CardSkeleton(`.
- `styles.ts`: append

```ts
/** Numbers and ids: DM Mono with tabular figures. */
export const MONO = 'font-mono-brand tabular-nums';
```

- [ ] **Step 11: Run the new test and every test of the files touched**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio src/pages/organizations src/pages/accounts src/components/accounts/portfolio`
Expected: PASS. No existing assertion is edited.

- [ ] **Step 12: Typecheck, lint and commit**

Run: `npx tsc -b && npx eslint src/components/organizations/portfolio`
Expected: no errors.

```bash
git add src/components/organizations/portfolio
git commit -m "refactor(portfolio): share the tile, filter sheet, chip row, move menu and search box

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A selection bar with any choices and a date

**Files:**
- Create: `src/components/organizations/portfolio/SelectionActionsBar.tsx`
- Modify: `src/components/organizations/portfolio/SelectionBar.tsx` (whole file: becomes a wrapper)
- Test: `src/components/organizations/portfolio/SelectionActionsBar.test.tsx`

**Interfaces:**
- Consumes: `BUTTON`, `FOCUS` (styles), `Option` (portfolioTypes), `PortfolioNoun`.
- Produces:

```ts
export interface BulkReport { updated: number; failed: { id: number; name: string; reason: string }[]; error?: string }
export interface BulkChoice { key: string; label: string; options: Option[] }
export interface BulkDateChoice { key: string; label: string; clearLabel: string }
export const CLEAR_DATE = 'clear';
export function SelectionActionsBar(props: {
  count: number; noun: PortfolioNoun; choices: BulkChoice[]; dateChoice?: BulkDateChoice;
  activity: 'applying' | 'exporting' | null; loading?: boolean; report: BulkReport | null;
  onApply: (key: string, value: string) => void; onExport: () => void;
  extra?: (disabled: boolean) => ReactNode; onClose: () => void;
}): JSX.Element;
// SelectionBar.tsx keeps its props and re-exports `type BulkReport`.
```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/organizations/portfolio/SelectionActionsBar.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLEAR_DATE, SelectionActionsBar, type BulkReport } from './SelectionActionsBar';

const NOUN = { one: 'opportunity', many: 'opportunities' };
const CHOICES = [
  {
    key: 'set_stage',
    label: 'Set stage',
    options: [
      { value: 'negotiation', name: 'Negotiation' },
      { value: 'closed_lost', name: 'Closed Lost' },
    ],
  },
  { key: 'set_priority', label: 'Set priority', options: [{ value: 'high', name: 'High' }] },
];
const DATE = { key: 'set_date', label: 'Set date', clearLabel: 'Clear date' };

function renderBar(report: BulkReport | null = null, count = 2) {
  const onApply = vi.fn();
  render(
    <SelectionActionsBar
      count={count}
      noun={NOUN}
      choices={CHOICES}
      dateChoice={DATE}
      activity={null}
      report={report}
      onApply={onApply}
      onExport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onApply;
}

describe('SelectionActionsBar', () => {
  it('arms one choice at a time and applies it with "Apply to N"', async () => {
    const onApply = renderBar();
    const bar = screen.getByRole('region', { name: 'Selection' });
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set stage' }), 'closed_lost');
    expect(within(bar).getAllByRole('button', { name: 'Apply to 2' })).toHaveLength(1);
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set priority' }), 'high');
    expect(within(bar).getByRole('combobox', { name: 'Set stage' })).toHaveValue('');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    expect(onApply).toHaveBeenCalledWith('set_priority', 'high');
    expect(bar).toHaveFocus();
  });

  it('sets a date, or clears it with its own button', async () => {
    const onApply = renderBar();
    const bar = screen.getByRole('region', { name: 'Selection' });
    // user-event cannot type into a date input in jsdom; a change event is what the browser sends.
    fireEvent.change(within(bar).getByLabelText('Set date'), { target: { value: '2026-11-15' } });
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    expect(onApply).toHaveBeenLastCalledWith('set_date', '2026-11-15');
    await userEvent.click(within(bar).getByRole('button', { name: 'Clear date' }));
    expect(within(bar).getByRole('button', { name: 'Clear date' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    expect(onApply).toHaveBeenLastCalledWith('set_date', CLEAR_DATE);
  });

  it('reports in the noun, naming each failure', () => {
    renderBar({ updated: 1, failed: [{ id: 42, name: 'Analytics add-on', reason: 'Not found.' }] }, 1);
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByText('Updated 1 opportunity. 1 failed:')).toBeInTheDocument();
    expect(within(bar).getByText('Analytics add-on')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio/SelectionActionsBar.test.tsx`
Expected: FAIL — `Failed to resolve import "./SelectionActionsBar"`.

- [ ] **Step 3: Write `SelectionActionsBar.tsx`**

```tsx
// src/components/organizations/portfolio/SelectionActionsBar.tsx
// Exports the bar and the value its date choice's "Clear" arms.
/* eslint-disable react-refresh/only-export-components */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, X } from 'lucide-react';
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';
import type { Option } from '../../../features/organizations/portfolioTypes';
import { BUTTON, FOCUS } from './styles';

export interface BulkReport {
  updated: number;
  failed: { id: number; name: string; reason: string }[];
  /** The request itself failed; nothing was applied. */
  error?: string;
}

/** One bulk edit offered as a select: its label is the select's name and
 *  its empty option ("Change owner", "Set stage"). */
export interface BulkChoice {
  key: string;
  label: string;
  options: Option[];
}

/** A bulk date: a date input, and a button that arms clearing it. */
export interface BulkDateChoice {
  key: string;
  label: string;
  clearLabel: string;
}

/** What a date choice's clear button arms (a date input never produces it). */
export const CLEAR_DATE = 'clear';

type Pending = { key: string; value: string };

function reportText(report: BulkReport, noun: PortfolioNoun): string {
  return `Updated ${report.updated} ${report.updated === 1 ? noun.one : noun.many}.${report.failed.length ? ` ${report.failed.length} failed:` : ''}`;
}

/** Selection mode's action bar (Organizations spec §1), for any portfolio:
 *  it sticks to the bottom of the content column. No choice acts on its
 *  control's own change (a closed select fires one per arrow key on Windows
 *  and Firefox): a choice arms "Apply to N" beside it, and that button runs
 *  it. One choice is armed at a time. The live regions stay mounted whether
 *  or not the bar shows, so only their text changes. */
export function SelectionActionsBar({
  count,
  noun,
  choices,
  dateChoice,
  activity,
  loading = false,
  report,
  onApply,
  onExport,
  extra,
  onClose,
}: {
  count: number;
  noun: PortfolioNoun;
  choices: BulkChoice[];
  dateChoice?: BulkDateChoice;
  /** What is running: controls disable and the bar says so. */
  activity: 'applying' | 'exporting' | null;
  /** The list is reloading: controls disable, with nothing claimed. */
  loading?: boolean;
  report: BulkReport | null;
  /** A choice's key and the armed value (`CLEAR_DATE` for a cleared date). */
  onApply: (key: string, value: string) => void;
  onExport: () => void;
  /** More buttons after Export (Organizations' Archive and Churn). */
  extra?: (disabled: boolean) => ReactNode;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  // An armed choice never outlives the selection it was armed for.
  if (count === 0 && pending) setPending(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // A finished action lands focus on its report (or the bar), never on the
  // page body: the control was disabled and Apply unmounted meanwhile.
  useEffect(() => {
    if (report) (reportRef.current ?? regionRef.current)?.focus();
  }, [report]);

  const disabled = activity !== null || loading;
  const busyText = activity === 'applying' ? 'Applying…' : activity === 'exporting' ? 'Exporting…' : '';
  const announcement = busyText || (count > 0 ? `${count} selected` : '');

  const apply = () => {
    if (!pending) return;
    onApply(pending.key, pending.value);
    setPending(null);
    regionRef.current?.focus();
  };

  const choose = (key: string) => (event: { target: { value: string } }) =>
    setPending(event.target.value ? { key, value: event.target.value } : null);

  const applyButton = (key: string) =>
    pending?.key === key ? (
      <button type="button" onClick={apply} disabled={disabled} className={`${BUTTON} bg-accent text-on-accent border-accent hover:bg-accent-hover`}>
        Apply to <span className="font-mono-brand tabular-nums">{count}</span>
      </button>
    ) : null;

  const visible = count > 0 || report !== null;
  const clearing = dateChoice !== undefined && pending?.key === dateChoice.key && pending.value === CLEAR_DATE;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p role="alert" className="sr-only">
        {report?.error ?? ''}
      </p>
      {visible ? (
        <div
          ref={regionRef}
          tabIndex={-1}
          role="region"
          aria-label="Selection"
          className={`sticky bottom-3 z-20 flex flex-col gap-2 rounded-xl border border-line bg-elevated px-3 py-2 shadow-md ${FOCUS}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {count > 0 ? (
              <>
                <p className="text-[13px] font-semibold text-ink">
                  <span className="font-mono-brand tabular-nums">{count}</span> selected
                </p>
                {choices.map((choice) => (
                  <Fragment key={choice.key}>
                    <select
                      aria-label={choice.label}
                      value={pending?.key === choice.key ? pending.value : ''}
                      disabled={disabled}
                      onChange={choose(choice.key)}
                      className={BUTTON}
                    >
                      <option value="">{choice.label}</option>
                      {choice.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {applyButton(choice.key)}
                  </Fragment>
                ))}
                {dateChoice ? (
                  <>
                    <input
                      type="date"
                      aria-label={dateChoice.label}
                      value={pending?.key === dateChoice.key && !clearing ? pending.value : ''}
                      disabled={disabled}
                      onChange={choose(dateChoice.key)}
                      className={BUTTON}
                    />
                    <button
                      type="button"
                      aria-pressed={clearing}
                      disabled={disabled}
                      onClick={() => setPending({ key: dateChoice.key, value: CLEAR_DATE })}
                      className={`${BUTTON} ${clearing ? 'bg-accent-dim' : ''}`}
                    >
                      {dateChoice.clearLabel}
                    </button>
                    {applyButton(dateChoice.key)}
                  </>
                ) : null}
                <button type="button" onClick={onExport} disabled={disabled} className={BUTTON}>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Export
                </button>
                {extra?.(disabled)}
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
          {busyText ? (
            <p aria-hidden="true" className="text-[11px] text-ink-muted">
              {busyText}
            </p>
          ) : null}
          {report ? (
            <div ref={reportRef} tabIndex={-1} className={`rounded-md text-[13px] ${FOCUS}`}>
              {report.error ? <p className="text-danger">{report.error}</p> : <p className="text-ink">{reportText(report, noun)}</p>}
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
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Rewrite `SelectionBar.tsx` as the owner/lifecycle bar on top of it**

```tsx
// src/components/organizations/portfolio/SelectionBar.tsx
import { Archive, UserX } from 'lucide-react';
import type { Option } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { SelectionActionsBar, type BulkReport } from './SelectionActionsBar';
import { BUTTON } from './styles';

export type { BulkReport } from './SelectionActionsBar';

/** The Organizations and Accounts selection bar (spec §1): Change owner and
 *  Set lifecycle, Export, and Organizations' Archive and Churn. Churn is
 *  offered for one account at a time: the backend refuses churn in bulk,
 *  and each churn records its own date and reason in the existing modal. */
export function SelectionBar({
  count,
  owners,
  lifecycles,
  activity,
  loading = false,
  report,
  onSetOwner,
  onSetLifecycle,
  onExport,
  onArchive,
  onChurn,
  keepChurn = false,
  onClose,
}: {
  count: number;
  /** Who the selection can be given to; `unassigned` is sent as null. */
  owners: Option[];
  /** Stages the selection can be moved to (churn is never offered). */
  lifecycles: Option[];
  activity: 'applying' | 'exporting' | null;
  loading?: boolean;
  report: BulkReport | null;
  onSetOwner: (userId: number | null) => void;
  onSetLifecycle: (stage: string) => void;
  onExport: () => void;
  /** Absent (Accounts): no Archive button. */
  onArchive?: () => void;
  /** Absent (Accounts): no Churn button. */
  onChurn?: () => void;
  /** Offer Churn among the stages (Accounts, where it is only a stage). */
  keepChurn?: boolean;
  onClose: () => void;
}) {
  const kind = usePortfolioKind();
  return (
    <SelectionActionsBar
      count={count}
      noun={kind.noun}
      choices={[
        { key: 'owner', label: 'Change owner', options: owners },
        { key: 'lifecycle', label: 'Set lifecycle', options: lifecycles.filter((stage) => keepChurn || stage.value !== 'churn') },
      ]}
      activity={activity}
      loading={loading}
      report={report}
      onApply={(key, value) => {
        if (key === 'owner') onSetOwner(value === 'unassigned' ? null : Number(value));
        else onSetLifecycle(value);
      }}
      onExport={onExport}
      extra={(disabled) => (
        <>
          {onArchive ? (
            <button type="button" onClick={onArchive} disabled={disabled} className={BUTTON}>
              <Archive className="w-4 h-4" aria-hidden="true" />
              Archive
            </button>
          ) : null}
          {count === 1 && onChurn ? (
            <button type="button" onClick={onChurn} disabled={disabled} className={`${BUTTON} text-danger`}>
              <UserX className="w-4 h-4" aria-hidden="true" />
              Churn
            </button>
          ) : null}
        </>
      )}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 5: Run the new and the existing selection tests**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio/SelectionActionsBar.test.tsx src/components/organizations/portfolio/SelectionBar.test.tsx src/components/organizations/portfolio/kindControls.test.tsx src/pages/organizations/List.test.tsx src/pages/accounts/List.test.tsx src/e2e/organizationsPortfolio.test.tsx src/e2e/accountsPortfolio.test.tsx`
Expected: PASS, no existing assertion changed.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npx tsc -b && npx eslint src/components/organizations/portfolio`

```bash
git add src/components/organizations/portfolio/SelectionActionsBar.tsx src/components/organizations/portfolio/SelectionActionsBar.test.tsx src/components/organizations/portfolio/SelectionBar.tsx
git commit -m "refactor(portfolio): a selection bar with any choices and a date

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Pipelines contract, the two kinds, the API and the test stub

**Files:**
- Modify: `src/features/customers/customersSlice.ts` (`Opportunity`, `OpportunityWritePayload`, `Risk`, `RiskWritePayload`, lines 484–556)
- Create: `src/features/pipelines/pipelineTypes.ts`, `pipelineApi.ts`, `pipelineKinds.ts`
- Create (test only): `src/features/pipelines/testPipelines.ts`
- Test: `src/features/pipelines/pipelineKinds.test.ts`, `pipelineApi.test.ts`, `testPipelines.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `downloadAttachment`, `BulkResult`, `Option`, `PortfolioNoun`, `FUNCTION_LABELS`, `formatDate`.
- Produces:

```ts
// pipelineTypes.ts
export type PipelineKindKey = 'opportunities' | 'risks';
export interface PipelineRow { id; kind: 'opportunity' | 'risk'; title; parent: { type: 'organisation' | 'account'; id: number; name: string }; companies: { id: number; name: string }[]; owner: { id: number | null; name: string } | null; mrr: number; stage: { value: string; label: string }; priority: { value: 'high' | 'medium' | 'low'; label: string }; department: { value: UserFunction | ''; label: string }; date: { value: string | null; days: number | null }; open: boolean; overdue: boolean; signal: { kind: 'overdue' | 'high_priority'; label: string } | null; stage_changed_at: string; created_at: string }
export interface PipelineTotal { count: number; mrr: number }
export interface PipelineGroup extends PipelineTotal { key: string; label: string }
export interface PipelineSummary { items: number; mrr: number; open: PipelineTotal; within: { '30': PipelineTotal; '90': PipelineTotal }; overdue: PipelineTotal; done_this_quarter: PipelineTotal & { stage: string }; stages: (PipelineTotal & { value: string; label: string })[] }
export interface PipelineFilterOptions { organisations: Option[]; accounts: Option[]; owners: Option[]; stages: Option[]; priorities: Option[]; departments: Option[] }
export interface PipelinePage { kind: PipelineKindKey; results: PipelineRow[]; next_cursor: string | null; count: number; groups: PipelineGroup[]; summary: PipelineSummary; filters: PipelineFilterOptions; currency: CurrencyCode }
export type PipelineBulkAction = 'set_stage' | 'set_priority' | 'set_department' | 'set_date';
export interface PipelineBulkRequest { ids: number[]; action: PipelineBulkAction; value: string | null }
// pipelineApi.ts
export function fetchPipeline(kind: PipelineKindKey, query: string): Promise<PipelinePage>;
export function exportPipeline(kind: PipelineKindKey, query: string, today?: Date): Promise<void>;
export function bulkUpdatePipeline(kind: PipelineKindKey, body: PipelineBulkRequest): Promise<BulkResult>;
// pipelineKinds.ts
export interface Choice { value: string; label: string }
export interface PipelineKind { key; item; noun: PortfolioNoun; title: string; stages: Choice[]; openStages: string[]; doneStage: string; collapsedStages: string[]; dateLabel: string; dateVerb: string; pastLabel: string; sortDateLabel: string; monthLabel: string; tiles: { open: string; within: string; done: string }; fetch: (query: string) => Promise<PipelinePage> }
export const OPPORTUNITY_STAGES, RISK_STAGES, OPPORTUNITIES_KIND, RISKS_KIND, PIPELINE_KINDS, PRIORITY_CHOICES, DEPARTMENT_CHOICES, NO_DEPARTMENT;
export function stageLabel(kind, value): string; export function stageTargets(kind): Option[]; export function withArticle(word: string): string;
export function pipelineSortOptions(kind): Choice[]; export function pipelineGroupOptions(kind, board: boolean): Choice[];
export function parentHref(parent: PipelineRow['parent']): string;
export function dateText(kind, date: PipelineRow['date'], open: boolean): string;
export function daysFrom(iso: string, today: string): number;
export function rowWithStage(row: PipelineRow, to: string, kind: PipelineKind): PipelineRow;
export function opportunityRecord(row: PipelineRow): Opportunity; export function riskRecord(row: PipelineRow): Risk;
export function dealDateLine(deal: Opportunity | Risk, today: string): { text: string; overdue: boolean };
// testPipelines.ts (test only)
export const STUB_TODAY = '2026-09-30', QUARTER_START = '2026-07-01';
export const emeaSeats, analyticsAddOn, globexUplift, initechWin, hooliPilot, adminLeft, budgetFreeze, championMitigated: PipelineRow;
export const OPPORTUNITY_ROWS, RISK_ROWS: PipelineRow[];
export function buildPipelinePage(kind: PipelineKindKey, query: URLSearchParams, rows: PipelineRow[]): PipelinePage;
export function stubPipelines(stub?: PipelinesStub): Spy;
export function pipelineQueries(spy, kind): URLSearchParams[];
export function pipelineBulkBodies(spy, kind): PipelineBulkRequest[];
export function recordWrites(spy): { method: string; path: string; body: Record<string, unknown> | null }[];
```

- [ ] **Step 1: The new fields on the existing types**

In `src/features/customers/customersSlice.ts`:

1. In `Opportunity`, replace the `stage` union with

```ts
  stage: 'discovery' | 'qualification' | 'solution_validation' | 'proposal_price_review' |
    'negotiation' | 'closed_won' | 'closed_lost';
```

and add after `account_id?: number | null;`:

```ts
  /** Expected close, YYYY-MM-DD, or null ("No date"). The API always sends
   *  it (since 2026-09-30); optional because older fixtures omit it. */
  expected_close?: string | null;
  /** When the stage last changed (creation included). Read-only. */
  stage_changed_at?: string;
```

2. In `OpportunityWritePayload`, add `expected_close?: string | null;`.
3. In `Risk`, add after `account_id?: number | null;`:

```ts
  /** Due by, YYYY-MM-DD, or null ("No date"). The API always sends it
   *  (since 2026-09-30); optional because older fixtures omit it. */
  due_by?: string | null;
  /** When the stage last changed (creation included). Read-only. */
  stage_changed_at?: string;
```

4. In `RiskWritePayload`, add `due_by?: string | null;`.

- [ ] **Step 2: Write the contract types and the API**

```ts
// src/features/pipelines/pipelineTypes.ts
import type { CurrencyCode, UserFunction } from '../auth/authSlice';
import type { Option } from '../organizations/portfolioTypes';

// Mirrors revenact-backend's GET /api/v1/pipelines/{opportunities,risks}/
// (branch feat/pipelines-portfolio, docs/API_CONTRACTS.md -> pipelines_portfolio;
// services/pipelines_portfolio/rows.py and shape.py).

export type PipelineKindKey = 'opportunities' | 'risks';

export interface PipelineRow {
  id: number;
  kind: 'opportunity' | 'risk';
  title: string;
  /** "Part of": always an organisation or account the viewer may open. */
  parent: { type: 'organisation' | 'account'; id: number; name: string };
  /** The parent organisations the viewer may open, lowest id first. */
  companies: { id: number; name: string }[];
  /** The parent's owner; `{id: null, name: "Not in your book"}` when that
   *  person is outside the viewer's organisation; null when unassigned. */
  owner: { id: number | null; name: string } | null;
  /** In the workspace's currency (the response's `currency`). */
  mrr: number;
  stage: { value: string; label: string };
  priority: { value: 'high' | 'medium' | 'low'; label: string };
  /** `label` is '' for the whole company (no department). */
  department: { value: UserFunction | ''; label: string };
  /** Expected close or due by; `days` from today, negative once passed. */
  date: { value: string | null; days: number | null };
  open: boolean;
  /** Open, with its date in the past (due today is not overdue). */
  overdue: boolean;
  signal: { kind: 'overdue' | 'high_priority'; label: string } | null;
  stage_changed_at: string;
  created_at: string;
}

export interface PipelineTotal {
  count: number;
  mrr: number;
}

export interface PipelineGroup extends PipelineTotal {
  key: string;
  label: string;
}

/** The tiles, over every stage of the filtered set (the stage filter is the
 *  only one they ignore). */
export interface PipelineSummary {
  items: number;
  mrr: number;
  open: PipelineTotal;
  within: { '30': PipelineTotal; '90': PipelineTotal };
  overdue: PipelineTotal;
  /** Closed Won (risks: Mitigated) whose stage changed this quarter. */
  done_this_quarter: PipelineTotal & { stage: string };
  /** Every stage, empty ones included: the Board's column headers. */
  stages: (PipelineTotal & { value: string; label: string })[];
}

export interface PipelineFilterOptions {
  organisations: Option[];
  accounts: Option[];
  /** Named people, then `outside` ("Not in your book"), then `unassigned`. */
  owners: Option[];
  stages: Option[];
  priorities: Option[];
  /** `none` is the whole company. */
  departments: Option[];
}

export interface PipelinePage {
  kind: PipelineKindKey;
  results: PipelineRow[];
  next_cursor: string | null;
  count: number;
  groups: PipelineGroup[];
  summary: PipelineSummary;
  filters: PipelineFilterOptions;
  currency: CurrencyCode;
}

export type PipelineBulkAction = 'set_stage' | 'set_priority' | 'set_department' | 'set_date';

export interface PipelineBulkRequest {
  ids: number[];
  action: PipelineBulkAction;
  /** A stage, priority, department ('' = whole company), or a date
   *  (YYYY-MM-DD, null to clear). */
  value: string | null;
}
```

```ts
// src/features/pipelines/pipelineApi.ts
// Thin apiFetch wrappers over revenact-backend's Pipelines endpoints.
import { apiFetch } from '../../lib/apiClient';
import { downloadAttachment } from '../files/filesSlice';
import type { BulkResult } from '../organizations/portfolioTypes';
import type { PipelineBulkRequest, PipelineKindKey, PipelinePage } from './pipelineTypes';

export const pipelinePath = (kind: PipelineKindKey) => `/pipelines/${kind}/`;

export function fetchPipeline(kind: PipelineKindKey, query: string): Promise<PipelinePage> {
  const path = pipelinePath(kind);
  return apiFetch<PipelinePage>(query ? `${path}?${query}` : path);
}

/** Every row of the query as CSV with every field, fetched with the
 *  session's token (the API never exposes a URL a plain link could open). */
export function exportPipeline(kind: PipelineKindKey, query: string, today: Date = new Date()): Promise<void> {
  const path = `${pipelinePath(kind)}export.csv`;
  return downloadAttachment({ download_url: query ? `${path}?${query}` : path, name: `${kind}-${today.toISOString().slice(0, 10)}.csv` });
}

export function bulkUpdatePipeline(kind: PipelineKindKey, body: PipelineBulkRequest): Promise<BulkResult> {
  return apiFetch<BulkResult>(`${pipelinePath(kind)}bulk/`, { method: 'POST', body });
}
```

- [ ] **Step 3: Write the two kinds and their pure helpers**

```ts
// src/features/pipelines/pipelineKinds.ts
import { FUNCTION_LABELS, type UserFunction } from '../auth/authSlice';
import type { Opportunity, Risk } from '../customers/customersSlice';
import { formatDate } from '../customers/formatters';
import type { PortfolioNoun } from '../organizations/portfolioLabels';
import type { Option } from '../organizations/portfolioTypes';
import { fetchPipeline } from './pipelineApi';
import type { PipelineKindKey, PipelinePage, PipelineRow } from './pipelineTypes';

// What differs between the two kinds the Pipelines page lists, named once
// (as the backend's services/pipelines_portfolio/kinds.py does): the stages,
// which are open, the "…this quarter" stage, the date's words, the tiles'
// titles and the endpoint. Components take a PipelineKind and never branch
// on which one it is.

export interface Choice {
  value: string;
  label: string;
}

/** Opportunity.Stage on the backend, in board order. */
export const OPPORTUNITY_STAGES: { value: Opportunity['stage']; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'solution_validation', label: 'Solution Validation' },
  { value: 'proposal_price_review', label: 'Proposal / Price Review' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
];

/** Risk.Stage on the backend, in board order. */
export const RISK_STAGES: { value: Risk['stage']; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mitigated', label: 'Mitigated' },
  { value: 'realised', label: 'Realised' },
  { value: 'abandoned', label: 'Abandoned' },
];

export interface PipelineKind {
  key: PipelineKindKey;
  /** A row's `kind`. */
  item: 'opportunity' | 'risk';
  noun: PortfolioNoun;
  /** The switch's word: "Opportunities". */
  title: string;
  stages: Choice[];
  /** Open: opportunities not Closed Won or Lost; risks Open. */
  openStages: string[];
  /** The "…this quarter" tile's stage. */
  doneStage: string;
  /** Board columns that start collapsed (Closed Lost). */
  collapsedStages: string[];
  /** The form's date label. */
  dateLabel: string;
  /** "Closes in 12d" / "Due in 12d". */
  dateVerb: string;
  /** A closed item past its date: "Expected 5 Sep 2026" / "Was due 5 Sep 2026". */
  pastLabel: string;
  sortDateLabel: string;
  monthLabel: string;
  tiles: { open: string; within: string; done: string };
  /** GET /pipelines/<kind>/. A property (not a method): it is passed around
   *  as a stable reader. */
  fetch: (query: string) => Promise<PipelinePage>;
}

export const OPPORTUNITIES_KIND: PipelineKind = {
  key: 'opportunities',
  item: 'opportunity',
  noun: { one: 'opportunity', many: 'opportunities' },
  title: 'Opportunities',
  stages: OPPORTUNITY_STAGES,
  openStages: ['discovery', 'qualification', 'solution_validation', 'proposal_price_review', 'negotiation'],
  doneStage: 'closed_won',
  collapsedStages: ['closed_lost'],
  dateLabel: 'Expected close',
  dateVerb: 'Closes',
  pastLabel: 'Expected',
  sortDateLabel: 'Close date',
  monthLabel: 'Close month',
  tiles: { open: 'Open pipeline', within: 'Closing', done: 'Won this quarter' },
  fetch: (query) => fetchPipeline('opportunities', query),
};

export const RISKS_KIND: PipelineKind = {
  key: 'risks',
  item: 'risk',
  noun: { one: 'risk', many: 'risks' },
  title: 'Risks',
  stages: RISK_STAGES,
  openStages: ['open'],
  doneStage: 'mitigated',
  collapsedStages: [],
  dateLabel: 'Due by',
  dateVerb: 'Due',
  pastLabel: 'Was due',
  sortDateLabel: 'Due date',
  monthLabel: 'Due month',
  tiles: { open: 'MRR at risk', within: 'Due', done: 'Mitigated this quarter' },
  fetch: (query) => fetchPipeline('risks', query),
};

export const PIPELINE_KINDS: Record<PipelineKindKey, PipelineKind> = {
  opportunities: OPPORTUNITIES_KIND,
  risks: RISKS_KIND,
};

export const PRIORITY_CHOICES: Option[] = [
  { value: 'high', name: 'High' },
  { value: 'medium', name: 'Medium' },
  { value: 'low', name: 'Low' },
];

/** The department value that stands for the whole company (a blank
 *  department) in the URL, the filter and a bulk choice. */
export const NO_DEPARTMENT = 'none';

export const DEPARTMENT_CHOICES: Option[] = [
  ...(Object.entries(FUNCTION_LABELS) as [UserFunction, string][]).map(([value, name]) => ({ value, name })),
  { value: NO_DEPARTMENT, name: 'Whole company' },
];

export const stageLabel = (kind: PipelineKind, value: string): string =>
  kind.stages.find((stage) => stage.value === value)?.label ?? value;

/** Every stage of the kind, as a bulk choice. */
export const stageTargets = (kind: PipelineKind): Option[] => kind.stages.map((stage) => ({ value: stage.value, name: stage.label }));

/** "an opportunity", "a risk": for empty-state copy. */
export const withArticle = (word: string): string => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;

export function pipelineSortOptions(kind: PipelineKind): Choice[] {
  return [
    { value: 'mrr', label: 'MRR' },
    { value: 'date', label: kind.sortDateLabel },
    { value: 'priority', label: 'Priority' },
    { value: 'stage', label: 'Stage' },
    { value: 'title', label: 'Title' },
  ];
}

/** The Group choices; the Board has no "None" (a board always has columns). */
export function pipelineGroupOptions(kind: PipelineKind, board: boolean): Choice[] {
  const options = [
    { value: 'none', label: 'None' },
    { value: 'stage', label: 'Stage' },
    { value: 'month', label: kind.monthLabel },
    { value: 'parent', label: 'Organization or account' },
    { value: 'owner', label: 'Owner' },
    { value: 'department', label: 'Department' },
    { value: 'priority', label: 'Priority' },
  ];
  return board ? options.filter((option) => option.value !== 'none') : options;
}

export function parentHref(parent: PipelineRow['parent']): string {
  return parent.type === 'organisation' ? `/organizations/${parent.id}` : `/accounts/${parent.id}`;
}

/** The date line (spec §1): "Closes in 12d", "Overdue 5d", "No date"
 *  (risks "Due in 12d"); "Closes today" at 0; a closed item past its date
 *  says when it was expected (plan Decision 4). */
export function dateText(kind: PipelineKind, date: PipelineRow['date'], open: boolean): string {
  if (date.value === null || date.days === null) return 'No date';
  if (date.days < 0) return open ? `Overdue ${-date.days}d` : `${kind.pastLabel} ${formatDate(date.value)}`;
  if (date.days === 0) return `${kind.dateVerb} today`;
  return `${kind.dateVerb} in ${date.days}d`;
}

/** Whole days from `today` to `iso` (both YYYY-MM-DD), negative once passed.
 *  Counted in UTC so a daylight-saving change never makes a day 23 hours. */
export function daysFrom(iso: string, today: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(iso) - utc(today)) / 86_400_000);
}

/** A row as it reads once moved to `to` (a Board move's guess): the stage,
 *  whether it is open, overdue, and its one signal (Overdue first, then
 *  High priority on an open item), as the server computes them. */
export function rowWithStage(row: PipelineRow, to: string, kind: PipelineKind): PipelineRow {
  const open = kind.openStages.includes(to);
  const overdue = open && row.date.days !== null && row.date.days < 0;
  const signal: PipelineRow['signal'] = overdue
    ? { kind: 'overdue', label: 'Overdue' }
    : open && row.priority.value === 'high'
      ? { kind: 'high_priority', label: 'High priority' }
      : null;
  return { ...row, stage: { value: to, label: stageLabel(kind, to) }, open, overdue, signal };
}

function recordBase(row: PipelineRow) {
  const onAccount = row.parent.type === 'account';
  return {
    id: row.id,
    title: row.title,
    mrr: row.mrr.toFixed(2),
    stage_display: row.stage.label,
    priority: row.priority.value,
    priority_display: row.priority.label,
    department: row.department.value,
    department_display: row.department.label,
    companies: row.companies,
    account_id: onAccount ? row.parent.id : null,
    account_name: onAccount ? row.parent.name : null,
    stage_changed_at: row.stage_changed_at,
  };
}

/** The Opportunity the edit form reads, from a Pipelines row (plan Decision 2). */
export function opportunityRecord(row: PipelineRow): Opportunity {
  return { ...recordBase(row), stage: row.stage.value as Opportunity['stage'], expected_close: row.date.value };
}

/** The Risk the edit form reads, from a Pipelines row. */
export function riskRecord(row: PipelineRow): Risk {
  return { ...recordBase(row), stage: row.stage.value as Risk['stage'], due_by: row.date.value };
}

const RISK_STAGE_VALUES: string[] = RISK_STAGES.map((stage) => stage.value);

/** A Deals & risks item's date line and whether it is overdue, from its own
 *  record (the stages of the two kinds do not overlap). */
export function dealDateLine(deal: Opportunity | Risk, today: string): { text: string; overdue: boolean } {
  const isRisk = RISK_STAGE_VALUES.includes(deal.stage);
  const kind = isRisk ? RISKS_KIND : OPPORTUNITIES_KIND;
  const value = (isRisk ? (deal as Risk).due_by : (deal as Opportunity).expected_close) ?? null;
  const days = value === null ? null : daysFrom(value, today);
  const open = kind.openStages.includes(deal.stage);
  return { text: dateText(kind, { value, days }, open), overdue: open && days !== null && days < 0 };
}
```

- [ ] **Step 4: Write the test stub**

```ts
// src/features/pipelines/testPipelines.ts
import { vi } from 'vitest';
import { FUNCTION_LABELS, type UserFunction } from '../auth/authSlice';
import type { BulkResult } from '../organizations/portfolioTypes';
import { PIPELINE_KINDS, daysFrom, opportunityRecord, riskRecord, rowWithStage, type PipelineKind } from './pipelineKinds';
import type {
  PipelineBulkRequest,
  PipelineFilterOptions,
  PipelineGroup,
  PipelineKindKey,
  PipelinePage,
  PipelineRow,
  PipelineSummary,
  PipelineTotal,
} from './pipelineTypes';

// Test-only: rows shaped like the backend's GET /pipelines/{kind}/ (branch
// feat/pipelines-portfolio) and a fetch stub that answers the book, export,
// bulk, the per-item PATCH/POST/DELETE and the form's organisation and
// account pickers the way the backend does. Writes change the stub's copy of
// the book, so a reload after a move or an edit sees them. Its "today" is
// 2026-09-30; its quarter began 2026-07-01.

export const STUB_TODAY = '2026-09-30';
export const QUARTER_START = '2026-07-01';
const THIS_QUARTER = '2026-09-02T10:00:00+00:00';
const LAST_QUARTER = '2026-05-02T10:00:00+00:00';

export const emeaSeats: PipelineRow = {
  id: 41,
  kind: 'opportunity',
  title: 'EMEA seats',
  parent: { type: 'account', id: 12, name: 'Pizza Hut EMEA' },
  companies: [{ id: 7, name: 'Pizza Hut' }],
  owner: { id: 2, name: 'Carl CSM' },
  mrr: 2000,
  stage: { value: 'negotiation', label: 'Negotiation' },
  priority: { value: 'high', label: 'High' },
  department: { value: 'cs', label: 'Customer Success' },
  date: { value: '2026-10-07', days: 7 },
  open: true,
  overdue: false,
  signal: { kind: 'high_priority', label: 'High priority' },
  stage_changed_at: LAST_QUARTER,
  created_at: '2026-09-01T09:00:00+00:00',
};

export const analyticsAddOn: PipelineRow = {
  ...emeaSeats,
  id: 42,
  title: 'Analytics add-on',
  parent: { type: 'organisation', id: 7, name: 'Pizza Hut' },
  mrr: 300,
  stage: { value: 'discovery', label: 'Discovery' },
  priority: { value: 'medium', label: 'Medium' },
  department: { value: '', label: '' },
  date: { value: null, days: null },
  signal: null,
};

export const globexUplift: PipelineRow = {
  ...emeaSeats,
  id: 43,
  title: 'Globex uplift',
  parent: { type: 'organisation', id: 1, name: 'Globex' },
  companies: [{ id: 1, name: 'Globex' }],
  owner: { id: 3, name: 'Priya' },
  mrr: 5000,
  stage: { value: 'proposal_price_review', label: 'Proposal / Price Review' },
  priority: { value: 'low', label: 'Low' },
  department: { value: 'sales', label: 'Sales' },
  date: { value: '2026-09-25', days: -5 },
  overdue: true,
  signal: { kind: 'overdue', label: 'Overdue' },
};

/** Won this quarter, on an account whose owner is outside the viewer's
 *  organisation and none of whose organisations the viewer may open. */
export const initechWin: PipelineRow = {
  ...emeaSeats,
  id: 44,
  title: 'Initech expansion',
  parent: { type: 'account', id: 14, name: 'Initech APAC' },
  companies: [],
  owner: { id: null, name: 'Not in your book' },
  mrr: 1500,
  stage: { value: 'closed_won', label: 'Closed Won' },
  priority: { value: 'medium', label: 'Medium' },
  date: { value: '2026-09-10', days: -20 },
  open: false,
  overdue: false,
  signal: null,
  stage_changed_at: THIS_QUARTER,
};

export const hooliPilot: PipelineRow = {
  ...emeaSeats,
  id: 45,
  title: 'Hooli pilot',
  parent: { type: 'organisation', id: 5, name: 'Hooli' },
  companies: [{ id: 5, name: 'Hooli' }],
  owner: null,
  mrr: 800,
  stage: { value: 'closed_lost', label: 'Closed Lost' },
  priority: { value: 'low', label: 'Low' },
  department: { value: '', label: '' },
  date: { value: null, days: null },
  open: false,
  overdue: false,
  signal: null,
};

export const OPPORTUNITY_ROWS: PipelineRow[] = [emeaSeats, analyticsAddOn, globexUplift, initechWin, hooliPilot];

export const adminLeft: PipelineRow = {
  ...emeaSeats,
  id: 71,
  kind: 'risk',
  title: 'Admin left',
  mrr: 800,
  stage: { value: 'open', label: 'Open' },
  date: { value: '2026-10-20', days: 20 },
};

export const budgetFreeze: PipelineRow = {
  ...adminLeft,
  id: 72,
  title: 'Budget freeze',
  parent: { type: 'organisation', id: 1, name: 'Globex' },
  companies: [{ id: 1, name: 'Globex' }],
  owner: { id: 3, name: 'Priya' },
  mrr: 1200,
  priority: { value: 'medium', label: 'Medium' },
  department: { value: '', label: '' },
  date: { value: '2026-09-28', days: -2 },
  overdue: true,
  signal: { kind: 'overdue', label: 'Overdue' },
};

export const championMitigated: PipelineRow = {
  ...adminLeft,
  id: 73,
  title: 'Champion churned',
  parent: { type: 'organisation', id: 7, name: 'Pizza Hut' },
  mrr: 600,
  stage: { value: 'mitigated', label: 'Mitigated' },
  priority: { value: 'low', label: 'Low' },
  date: { value: null, days: null },
  open: false,
  overdue: false,
  signal: null,
  stage_changed_at: THIS_QUARTER,
};

export const RISK_ROWS: PipelineRow[] = [adminLeft, budgetFreeze, championMitigated];

export const PIPELINE_FILTER_OPTIONS: Omit<PipelineFilterOptions, 'stages'> = {
  organisations: [
    { value: '1', name: 'Globex' },
    { value: '5', name: 'Hooli' },
    { value: '7', name: 'Pizza Hut' },
  ],
  accounts: [
    { value: '14', name: 'Initech APAC' },
    { value: '12', name: 'Pizza Hut EMEA' },
  ],
  owners: [
    { value: '2', name: 'Carl CSM' },
    { value: '3', name: 'Priya' },
    { value: 'outside', name: 'Not in your book' },
    { value: 'unassigned', name: 'Unassigned' },
  ],
  priorities: [
    { value: 'high', name: 'High' },
    { value: 'medium', name: 'Medium' },
    { value: 'low', name: 'Low' },
  ],
  departments: [
    { value: 'cs', name: 'Customer Success' },
    { value: 'sales', name: 'Sales' },
    { value: 'none', name: 'No department' },
  ],
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const ownerKey = (row: PipelineRow) => (row.owner === null ? 'unassigned' : row.owner.id === null ? 'outside' : String(row.owner.id));

function groupKey(row: PipelineRow, group: string): [string, string] {
  if (group === 'stage') return [row.stage.value, row.stage.label];
  if (group === 'month') {
    if (row.overdue) return ['overdue', 'Overdue'];
    if (!row.date.value) return ['none', 'No date'];
    const [year, month] = row.date.value.split('-');
    return [`${year}-${month}`, `${MONTHS[Number(month) - 1]} ${year}`];
  }
  if (group === 'parent') return [`${row.parent.type}:${row.parent.id}`, row.parent.name];
  if (group === 'owner') return [ownerKey(row), row.owner?.name ?? 'Unassigned'];
  if (group === 'department') return row.department.value ? [row.department.value, row.department.label] : ['none', 'No department'];
  return [row.priority.value, row.priority.label];
}

/** The backend's section order (shape.section_rank). */
function rank(group: PipelineGroup, by: string, kind: PipelineKind): [number, string] {
  if (by === 'stage') return [kind.stages.findIndex((stage) => stage.value === group.key), ''];
  if (by === 'priority') return [['high', 'medium', 'low'].indexOf(group.key), ''];
  if (by === 'month') return group.key === 'overdue' ? [0, ''] : group.key === 'none' ? [2, ''] : [1, group.key];
  if (by === 'owner') return group.key === 'outside' ? [1, ''] : group.key === 'unassigned' ? [2, ''] : [0, group.label];
  return group.key === 'none' ? [1, ''] : [0, group.label];
}

function groupsOf(rows: PipelineRow[], by: string, kind: PipelineKind): PipelineGroup[] {
  const found = new Map<string, PipelineGroup>();
  for (const row of rows) {
    const [key, label] = groupKey(row, by);
    const current = found.get(key) ?? { key, label, count: 0, mrr: 0 };
    found.set(key, { ...current, count: current.count + 1, mrr: current.mrr + row.mrr });
  }
  return [...found.values()].sort((a, b) => {
    const [bucketA, textA] = rank(a, by, kind);
    const [bucketB, textB] = rank(b, by, kind);
    return bucketA - bucketB || textA.localeCompare(textB);
  });
}

const total = (rows: PipelineRow[]): PipelineTotal => ({ count: rows.length, mrr: rows.reduce((sum, row) => sum + row.mrr, 0) });
const within = (rows: PipelineRow[], days: number) => rows.filter((row) => row.date.days !== null && row.date.days >= 0 && row.date.days <= days);

function summarise(book: PipelineRow[], kind: PipelineKind): PipelineSummary {
  const open = book.filter((row) => row.open);
  return {
    items: book.length,
    mrr: total(book).mrr,
    open: total(open),
    within: { '30': total(within(open, 30)), '90': total(within(open, 90)) },
    overdue: total(open.filter((row) => row.overdue)),
    done_this_quarter: {
      stage: kind.doneStage,
      ...total(book.filter((row) => row.stage.value === kind.doneStage && row.stage_changed_at >= QUARTER_START)),
    },
    stages: kind.stages.map((stage) => ({ value: stage.value, label: stage.label, ...total(book.filter((row) => row.stage.value === stage.value)) })),
  };
}

/** What the backend answers for `query` over `rows`: every filter but
 *  `stage` narrows the tiles' set; `stage` (default: the open stages; every
 *  stage with `ids`) narrows the rows and groups; `group_value` narrows
 *  results and count only; the cursor is an offset here. Sort is ignored
 *  (rows keep their order). */
export function buildPipelinePage(kindKey: PipelineKindKey, query: URLSearchParams, rows: PipelineRow[]): PipelinePage {
  const kind = PIPELINE_KINDS[kindKey];
  const list = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean);
  const idsGiven = query.has('ids');
  const ids = list('ids').map(Number);
  const organisations = list('organisation').map(Number);
  const accounts = list('account').map(Number);
  const priorities = list('priority');
  const departments = list('department');
  const owner = query.get('owner') ?? '';
  const date = query.get('date') ?? '';
  const changed = query.get('changed') === 'quarter';
  const search = (query.get('search') ?? '').toLowerCase();
  const allStages = kind.stages.map((stage) => stage.value);
  const chosen = list('stage').length ? list('stage') : idsGiven ? allStages : kind.openStages;
  const matchesDate = (row: PipelineRow) => {
    if (!date) return true;
    if (date === 'overdue') return row.overdue;
    if (date === 'none') return row.date.value === null;
    return row.open && within([row], Number(date)).length === 1;
  };
  const book = rows.filter(
    (row) =>
      (!idsGiven || ids.includes(row.id)) &&
      (organisations.length === 0 ||
        (row.parent.type === 'organisation' ? organisations.includes(row.parent.id) : row.companies.some((c) => organisations.includes(c.id)))) &&
      (accounts.length === 0 || (row.parent.type === 'account' && accounts.includes(row.parent.id))) &&
      (!owner || ownerKey(row) === owner) &&
      (priorities.length === 0 || priorities.includes(row.priority.value)) &&
      (departments.length === 0 || departments.includes(row.department.value || 'none')) &&
      matchesDate(row) &&
      (!changed || row.stage_changed_at >= QUARTER_START) &&
      (!search || row.title.toLowerCase().includes(search) || row.parent.name.toLowerCase().includes(search)),
  );
  const set = book.filter((row) => chosen.includes(row.stage.value));
  const group = query.get('group') ?? '';
  const groupValue = query.get('group_value');
  const scoped = group && groupValue !== null ? set.filter((row) => groupKey(row, group)[0] === groupValue) : set;
  const limit = Number(query.get('limit') ?? 50);
  const start = Number(query.get('cursor') ?? 0);
  return {
    kind: kindKey,
    results: scoped.slice(start, start + limit),
    next_cursor: start + limit < scoped.length ? String(start + limit) : null,
    count: scoped.length,
    groups: group ? groupsOf(set, group, kind) : [],
    summary: summarise(book, kind),
    filters: { ...PIPELINE_FILTER_OPTIONS, stages: kind.stages.map((stage) => ({ value: stage.value, name: stage.label })) },
    currency: 'USD',
  };
}

export interface PipelinesStub {
  /** The books the default answers read, copied (default OPPORTUNITY_ROWS / RISK_ROWS). */
  opportunities?: PipelineRow[];
  risks?: PipelineRow[];
  /** Answer GET /pipelines/<kind>/ yourself; return `{status, body}` for an error. */
  pipeline?: (kind: PipelineKindKey, query: URLSearchParams) => PipelinePage | { status: number; body: unknown };
  bulk?: (kind: PipelineKindKey, body: PipelineBulkRequest) => BulkResult;
  /** Answer PATCH /opportunities/<id>/ or /risks/<id>/ yourself (a failure, say). */
  patch?: (kind: PipelineKindKey, id: number, body: Record<string, unknown>) => { status: number; body: unknown };
}

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

const dateKey = (kind: PipelineKindKey) => (kind === 'opportunities' ? 'expected_close' : 'due_by');
const record = (kind: PipelineKindKey, row: PipelineRow) => (kind === 'opportunities' ? opportunityRecord(row) : riskRecord(row));

/** A PATCH or bulk write applied to a row, as the backend would store it. */
function applyEdit(row: PipelineRow, kindKey: PipelineKindKey, body: Record<string, unknown>): PipelineRow {
  const kind = PIPELINE_KINDS[kindKey];
  let next = row;
  if (typeof body.title === 'string') next = { ...next, title: body.title };
  if (typeof body.mrr === 'string') next = { ...next, mrr: Number(body.mrr) };
  if (typeof body.priority === 'string') {
    const priority = body.priority as PipelineRow['priority']['value'];
    next = { ...next, priority: { value: priority, label: PRIORITY_LABEL[priority] } };
  }
  if (typeof body.department === 'string') {
    const department = body.department as UserFunction | '';
    next = { ...next, department: { value: department, label: department ? FUNCTION_LABELS[department] : '' } };
  }
  if (dateKey(kindKey) in body) {
    const value = (body[dateKey(kindKey)] as string | null) ?? null;
    next = { ...next, date: { value, days: value === null ? null : daysFrom(value, STUB_TODAY) } };
  }
  return rowWithStage(next, typeof body.stage === 'string' ? body.stage : next.stage.value, kind);
}

const BULK_FIELD: Record<PipelineBulkRequest['action'], (kind: PipelineKindKey) => string> = {
  set_stage: () => 'stage',
  set_priority: () => 'priority',
  set_department: () => 'department',
  set_date: dateKey,
};

export function stubPipelines(stub: PipelinesStub = {}) {
  const books: Record<PipelineKindKey, PipelineRow[]> = {
    opportunities: [...(stub.opportunities ?? OPPORTUNITY_ROWS)],
    risks: [...(stub.risks ?? RISK_ROWS)],
  };
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    const book = /^\/pipelines\/(opportunities|risks)\/$/.exec(path);
    if (book) {
      const kind = book[1] as PipelineKindKey;
      const out = (stub.pipeline ?? ((k: PipelineKindKey, q: URLSearchParams) => buildPipelinePage(k, q, books[k])))(kind, url.searchParams);
      return 'results' in out ? json(200, out) : json(out.status, out.body);
    }
    if (/^\/pipelines\/(opportunities|risks)\/export\.csv$/.test(path)) {
      return { ok: true, status: 200, json: async () => null, blob: async () => new Blob(['Title,Revenact ID\nEMEA seats,41\n'], { type: 'text/csv' }) };
    }
    const bulk = /^\/pipelines\/(opportunities|risks)\/bulk\/$/.exec(path);
    if (bulk && method === 'POST') {
      const kind = bulk[1] as PipelineKindKey;
      const request = body as unknown as PipelineBulkRequest;
      if (stub.bulk) return json(200, stub.bulk(kind, request));
      const result: BulkResult = { updated: [], failed: [] };
      for (const id of request.ids) {
        const index = books[kind].findIndex((row) => row.id === id);
        if (index < 0) result.failed.push({ id, reason: 'Not found.' });
        else {
          books[kind][index] = applyEdit(books[kind][index], kind, { [BULK_FIELD[request.action](kind)]: request.value });
          result.updated.push(id);
        }
      }
      return json(200, result);
    }
    const item = /^\/(opportunities|risks)\/(\d+)\/$/.exec(path);
    if (item) {
      const kind = item[1] as PipelineKindKey;
      const id = Number(item[2]);
      const index = books[kind].findIndex((row) => row.id === id);
      if (method === 'PATCH' && stub.patch) {
        const out = stub.patch(kind, id, body);
        return json(out.status, out.body);
      }
      if (index < 0) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        books[kind].splice(index, 1);
        return json(204, null);
      }
      if (method === 'PATCH') books[kind][index] = applyEdit(books[kind][index], kind, body);
      return json(200, record(kind, books[kind][index]));
    }
    const create = /^\/(opportunities|risks)\/$/.exec(path);
    if (create && method === 'POST') {
      const kind = create[1] as PipelineKindKey;
      const id = Math.max(0, ...books[kind].map((row) => row.id)) + 1;
      const customerId = Number(body.customer_id);
      const accountId = body.account_id === undefined ? null : Number(body.account_id);
      const organisation = [{ id: 7, name: 'Pizza Hut' }, { id: 1, name: 'Globex' }].find((org) => org.id === customerId);
      const base = kind === 'opportunities' ? analyticsAddOn : adminLeft;
      const row = applyEdit(
        {
          ...base,
          id,
          parent: accountId === null ? { type: 'organisation', id: customerId, name: organisation?.name ?? `Organization ${customerId}` } : { type: 'account', id: accountId, name: `Account ${accountId}` },
          companies: organisation ? [organisation] : [],
          date: { value: null, days: null },
          stage_changed_at: '2026-09-30T12:00:00+00:00',
        },
        kind,
        body,
      );
      books[kind].push(row);
      return json(201, record(kind, row));
    }
    if (path === '/customers/') {
      return json(200, { count: 2, next: null, previous: null, results: [{ id: 7, name: 'Pizza Hut' }, { id: 1, name: 'Globex' }] });
    }
    if (/^\/customers\/\d+\/accounts\/$/.test(path)) return json(200, []);
    return json(404, { detail: `Not stubbed: ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchSpy = ReturnType<typeof stubPipelines>;

/** Every GET /pipelines/<kind>/ so far, as parsed query strings, oldest first. */
export function pipelineQueries(spy: FetchSpy, kind: PipelineKindKey): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith(`/pipelines/${kind}/`))
    .map((url) => url.searchParams);
}

export function pipelineBulkBodies(spy: FetchSpy, kind: PipelineKindKey): PipelineBulkRequest[] {
  return spy.mock.calls
    .filter(([input, init]) => String(input).endsWith(`/pipelines/${kind}/bulk/`) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as PipelineBulkRequest);
}

/** Every POST, PATCH or DELETE to /opportunities/ or /risks/ so far, oldest first. */
export function recordWrites(spy: FetchSpy): { method: string; path: string; body: Record<string, unknown> | null }[] {
  return spy.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input)).pathname.replace(/^\/api\/v1/, ''), init }))
    .filter(({ path, init }) => init?.method !== undefined && init.method !== 'GET' && /^\/(opportunities|risks)\//.test(path))
    .map(({ path, init }) => ({
      method: String(init?.method),
      path,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    }));
}
```

- [ ] **Step 5: Write the tests**

```ts
// src/features/pipelines/pipelineKinds.test.ts
import { describe, expect, it } from 'vitest';
import {
  OPPORTUNITIES_KIND,
  PIPELINE_KINDS,
  RISKS_KIND,
  dateText,
  daysFrom,
  dealDateLine,
  opportunityRecord,
  parentHref,
  pipelineGroupOptions,
  pipelineSortOptions,
  riskRecord,
  rowWithStage,
  withArticle,
} from './pipelineKinds';
import { adminLeft, analyticsAddOn, budgetFreeze, emeaSeats, globexUplift } from './testPipelines';

describe('the two Pipelines kinds', () => {
  it("name each kind's stages, its open stages and its 'this quarter' stage", () => {
    expect(OPPORTUNITIES_KIND.stages.map((stage) => stage.label)).toEqual([
      'Discovery',
      'Qualification',
      'Solution Validation',
      'Proposal / Price Review',
      'Negotiation',
      'Closed Won',
      'Closed Lost',
    ]);
    expect(OPPORTUNITIES_KIND.openStages).not.toContain('closed_won');
    expect(OPPORTUNITIES_KIND.openStages).not.toContain('closed_lost');
    expect(OPPORTUNITIES_KIND.collapsedStages).toEqual(['closed_lost']);
    expect(RISKS_KIND.openStages).toEqual(['open']);
    expect(PIPELINE_KINDS.risks.doneStage).toBe('mitigated');
  });

  it('writes the date line in each kind\'s words', () => {
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-10-12', days: 12 }, true)).toBe('Closes in 12d');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-25', days: -5 }, true)).toBe('Overdue 5d');
    expect(dateText(OPPORTUNITIES_KIND, { value: null, days: null }, true)).toBe('No date');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-30', days: 0 }, true)).toBe('Closes today');
    expect(dateText(RISKS_KIND, { value: '2026-10-20', days: 20 }, true)).toBe('Due in 20d');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-05', days: -25 }, false)).toBe('Expected 5 Sep 2026');
    expect(dateText(RISKS_KIND, { value: '2026-09-05', days: -25 }, false)).toBe('Was due 5 Sep 2026');
  });

  it('counts whole calendar days, across a daylight-saving change', () => {
    expect(daysFrom('2026-10-07', '2026-09-30')).toBe(7);
    expect(daysFrom('2026-09-25', '2026-09-30')).toBe(-5);
    expect(daysFrom('2026-11-02', '2026-10-30')).toBe(3);
  });

  it('moves a row to a stage, recomputing open, overdue and its one signal', () => {
    const won = rowWithStage(globexUplift, 'closed_won', OPPORTUNITIES_KIND);
    expect(won).toMatchObject({ stage: { value: 'closed_won', label: 'Closed Won' }, open: false, overdue: false, signal: null });
    expect(rowWithStage(won, 'negotiation', OPPORTUNITIES_KIND)).toMatchObject({ open: true, overdue: true, signal: { kind: 'overdue' } });
    expect(rowWithStage(emeaSeats, 'discovery', OPPORTUNITIES_KIND).signal).toEqual({ kind: 'high_priority', label: 'High priority' });
  });

  it("gives the forms a record built from the row", () => {
    expect(opportunityRecord(emeaSeats)).toMatchObject({
      id: 41,
      title: 'EMEA seats',
      mrr: '2000.00',
      stage: 'negotiation',
      priority: 'high',
      department: 'cs',
      companies: [{ id: 7, name: 'Pizza Hut' }],
      account_id: 12,
      account_name: 'Pizza Hut EMEA',
      expected_close: '2026-10-07',
    });
    expect(opportunityRecord(analyticsAddOn)).toMatchObject({ account_id: null, account_name: null, expected_close: null });
    expect(riskRecord(budgetFreeze)).toMatchObject({ stage: 'open', due_by: '2026-09-28' });
  });

  it("reads a Deals & risks item's date line from its own record", () => {
    expect(dealDateLine(opportunityRecord(globexUplift), '2026-09-30')).toEqual({ text: 'Overdue 5d', overdue: true });
    expect(dealDateLine(riskRecord(adminLeft), '2026-09-30')).toEqual({ text: 'Due in 20d', overdue: false });
    expect(dealDateLine({ ...opportunityRecord(emeaSeats), expected_close: undefined }, '2026-09-30')).toEqual({ text: 'No date', overdue: false });
    expect(dealDateLine({ ...opportunityRecord(globexUplift), stage: 'closed_lost' }, '2026-09-30')).toEqual({
      text: 'Expected 25 Sep 2026',
      overdue: false,
    });
  });

  it('offers each kind its sorts and groups, and links a parent to its page', () => {
    expect(pipelineSortOptions(RISKS_KIND).map((option) => option.label)).toEqual(['MRR', 'Due date', 'Priority', 'Stage', 'Title']);
    expect(pipelineGroupOptions(OPPORTUNITIES_KIND, false).map((option) => option.label)).toEqual([
      'None',
      'Stage',
      'Close month',
      'Organization or account',
      'Owner',
      'Department',
      'Priority',
    ]);
    expect(pipelineGroupOptions(OPPORTUNITIES_KIND, true)[0].value).toBe('stage');
    expect(parentHref({ type: 'account', id: 12, name: 'Pizza Hut EMEA' })).toBe('/accounts/12');
    expect(parentHref({ type: 'organisation', id: 7, name: 'Pizza Hut' })).toBe('/organizations/7');
    expect(withArticle('opportunity')).toBe('an opportunity');
    expect(withArticle('risk')).toBe('a risk');
  });
});
```

```ts
// src/features/pipelines/pipelineApi.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdatePipeline, exportPipeline, fetchPipeline } from './pipelineApi';
import { pipelineBulkBodies, pipelineQueries, stubPipelines } from './testPipelines';

describe('the Pipelines API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads each kind at its own path with the query it is given', async () => {
    const spy = stubPipelines();
    const data = await fetchPipeline('risks', 'group=stage&sort=-mrr');
    expect(pipelineQueries(spy, 'risks')[0].get('group')).toBe('stage');
    expect(data.kind).toBe('risks');
    await fetchPipeline('opportunities', '');
    expect(String(spy.mock.calls[1][0])).toMatch(/\/api\/v1\/pipelines\/opportunities\/$/);
  });

  it('posts a bulk edit to the kind and returns what was updated and what failed', async () => {
    const spy = stubPipelines();
    const result = await bulkUpdatePipeline('opportunities', { ids: [41, 999], action: 'set_date', value: null });
    expect(result).toEqual({ updated: [41], failed: [{ id: 999, reason: 'Not found.' }] });
    expect(pipelineBulkBodies(spy, 'opportunities')).toEqual([{ ids: [41, 999], action: 'set_date', value: null }]);
  });

  it('downloads the export through the session, named for the kind and the day', async () => {
    const spy = stubPipelines();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await exportPipeline('risks', 'owner=2&sort=-mrr', new Date('2026-10-01T12:00:00Z'));
    const call = spy.mock.calls.find(([input]) => String(input).includes('/pipelines/risks/export.csv'));
    expect(String(call?.[0])).toContain('export.csv?owner=2&sort=-mrr');
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('risks-2026-10-01.csv');
  });
});
```

```ts
// src/features/pipelines/testPipelines.test.ts
import { describe, expect, it } from 'vitest';
import { OPPORTUNITY_ROWS, RISK_ROWS, buildPipelinePage } from './testPipelines';

// The stub answers as the contract says, so the page tests prove something.
const read = (query: string, kind: 'opportunities' | 'risks' = 'opportunities') =>
  buildPipelinePage(kind, new URLSearchParams(query), kind === 'opportunities' ? OPPORTUNITY_ROWS : RISK_ROWS);

describe('the Pipelines stub', () => {
  it('lists the open stages by default, with tiles over every stage', () => {
    const page = read('limit=50');
    expect(page.results.map((row) => row.id)).toEqual([41, 42, 43]);
    expect(page.summary.open).toEqual({ count: 3, mrr: 7300 });
    expect(page.summary.within['30']).toEqual({ count: 1, mrr: 2000 });
    expect(page.summary.overdue).toEqual({ count: 1, mrr: 5000 });
    expect(page.summary.done_this_quarter).toEqual({ stage: 'closed_won', count: 1, mrr: 1500 });
    expect(page.summary.stages.map((stage) => stage.count)).toEqual([1, 0, 0, 1, 1, 1, 1]);
  });

  it('groups in the backend order and narrows one group with group_value', () => {
    expect(read('group=stage').groups.map((group) => group.label)).toEqual(['Discovery', 'Proposal / Price Review', 'Negotiation']);
    expect(read('group=month').groups.map((group) => group.key)).toEqual(['overdue', '2026-10', 'none']);
    const all = 'stage=discovery,qualification,solution_validation,proposal_price_review,negotiation,closed_won,closed_lost';
    expect(read(`${all}&group=owner`).groups.map((group) => group.label)).toEqual(['Carl CSM', 'Priya', 'Not in your book', 'Unassigned']);
    const column = read('group=stage&group_value=negotiation');
    expect(column.results.map((row) => row.id)).toEqual([41]);
    expect(column.count).toBe(1);
    expect(column.groups).toHaveLength(3);
  });

  it('applies every filter but stage to the tiles', () => {
    const page = read('stage=closed_won&changed=quarter');
    expect(page.results.map((row) => row.id)).toEqual([44]);
    expect(read('owner=outside&stage=closed_won').results.map((row) => row.id)).toEqual([44]);
    expect(read('date=overdue', 'risks').results.map((row) => row.id)).toEqual([72]);
    expect(read('department=none').results.map((row) => row.id)).toEqual([42]);
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/features/pipelines`
Expected: PASS.

- [ ] **Step 7: Typecheck (the fixtures and forms still compile) and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/features/customers/customersSlice.ts src/features/pipelines
git commit -m "feat(pipelines): the book's contract, the two kinds and the API

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The URL state and the chips

**Files:**
- Create: `src/features/pipelines/pipelineParams.ts`, `src/features/pipelines/pipelineChips.ts`
- Create: `src/components/pipelines/portfolio/usePipelineParams.ts`
- Test: `src/features/pipelines/pipelineParams.test.ts`, `src/features/pipelines/pipelineChips.test.ts`, `src/components/pipelines/portfolio/usePipelineParams.test.tsx`

**Interfaces:**
- Consumes: `PIPELINE_KINDS`, `NO_DEPARTMENT`, `PipelineKind` (Task 4); `MAX_IDS`, `toggleIn` (`features/organizations/portfolioParams`); `countText` stays in `features/organizations/filterChips`.
- Produces:

```ts
// pipelineParams.ts
export type PipelineGroupKey = 'stage' | 'month' | 'parent' | 'owner' | 'department' | 'priority';
export type PipelineView = 'list' | 'board';
export type DateFilter = '' | '30' | '90' | '180' | 'overdue' | 'none';
export interface PipelineParams { kind: PipelineKindKey; search: string; organisation: string[]; account: string[]; owner: string; stage: string[]; priority: string[]; department: string[]; date: DateFilter; changed: '' | 'quarter'; ids: number[]; sort: string; group: PipelineGroupKey | '' }
export const DEFAULT_PIPELINE_SORT = '-mrr'; export const DEFAULT_PIPELINE_GROUP: PipelineGroupKey = 'stage';
export const EMPTY_PIPELINE_FILTERS: Partial<PipelineParams>;
export function parsePipelineParams(search: URLSearchParams): PipelineParams;
export function pipelineUrlSearch(p: PipelineParams): URLSearchParams;
export function defaultStages(kind: PipelineKind, view: PipelineView): string[];
export function pipelineApiQuery(p: PipelineParams, view: PipelineView, extra?: Record<string, string>): string;
export function hasPipelineFilters(p: PipelineParams): boolean;
export function boardPipelineParams(p: PipelineParams): PipelineParams;
export function withKind(search: URLSearchParams, kind: PipelineKindKey): URLSearchParams;
// pipelineChips.ts
export interface PipelineChip { key: string; label: string; patch: Partial<PipelineParams> }
export function pipelineChips(p: PipelineParams, options: PipelineFilterOptions | null, kind: PipelineKind): PipelineChip[];
export function dateFilterLabel(kind: PipelineKind, date: DateFilter): string;
// usePipelineParams.ts
export function usePipelineParams(): { params: PipelineParams; update: (patch: Partial<PipelineParams>) => void; clearFilters: () => void };
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/pipelines/pipelineParams.test.ts
import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES_KIND, RISKS_KIND } from './pipelineKinds';
import {
  boardPipelineParams,
  defaultStages,
  hasPipelineFilters,
  parsePipelineParams,
  pipelineApiQuery,
  pipelineUrlSearch,
  withKind,
} from './pipelineParams';

const parse = (query: string) => parsePipelineParams(new URLSearchParams(query));

describe('the Pipelines URL state', () => {
  it('defaults to opportunities, open stages, -mrr and grouping by stage', () => {
    expect(parse('')).toEqual({
      kind: 'opportunities',
      search: '',
      organisation: [],
      account: [],
      owner: '',
      stage: [],
      priority: [],
      department: [],
      date: '',
      changed: '',
      ids: [],
      sort: '-mrr',
      group: 'stage',
    });
    expect(pipelineUrlSearch(parse('')).toString()).toBe('');
  });

  it('keeps what it understands and drops the rest, as the backend does', () => {
    const p = parse(
      'kind=risks&owner=outside&stage=open,closed_won,mitigated&priority=high,urgent&department=cs,none,bogus&date=overdue&changed=quarter&organisation=7,x&account=12&sort=-date&group=month&ids=4,5',
    );
    expect(p).toMatchObject({
      kind: 'risks',
      owner: 'outside',
      stage: ['open', 'mitigated'],
      priority: ['high'],
      department: ['cs', 'none'],
      date: 'overdue',
      changed: 'quarter',
      organisation: ['7'],
      account: ['12'],
      sort: '-date',
      group: 'month',
      ids: [4, 5],
    });
    expect(parse('kind=deals&sort=-arr&group=health&date=45&owner=me')).toMatchObject({
      kind: 'opportunities',
      sort: '-mrr',
      group: 'stage',
      date: '',
      owner: '',
    });
    expect(parse('group=none').group).toBe('');
  });

  it('writes the URL with the defaults left out', () => {
    const p = { ...parse(''), kind: 'risks' as const, owner: 'unassigned', group: '' as const, sort: 'title' };
    expect(pipelineUrlSearch(p).toString()).toBe('kind=risks&owner=unassigned&sort=title&group=none');
  });

  it("sends the view's stages: none on the List (the server's open default), every one on the Board", () => {
    expect(defaultStages(OPPORTUNITIES_KIND, 'list')).toEqual(OPPORTUNITIES_KIND.openStages);
    expect(defaultStages(RISKS_KIND, 'board')).toEqual(['open', 'mitigated', 'realised', 'abandoned']);
    const list = new URLSearchParams(pipelineApiQuery(parse('owner=2'), 'list', { limit: '1' }));
    expect(list.get('stage')).toBeNull();
    expect(list.get('sort')).toBe('-mrr');
    expect(list.get('group')).toBe('stage');
    expect(list.get('limit')).toBe('1');
    expect(list.get('kind')).toBeNull();
    const board = new URLSearchParams(pipelineApiQuery(parse('kind=risks'), 'board'));
    expect(board.get('stage')).toBe('open,mitigated,realised,abandoned');
    expect(new URLSearchParams(pipelineApiQuery(parse('stage=open'), 'board')).get('stage')).toBe('open');
  });

  it('knows when a filter is on, and gives the Board a group', () => {
    expect(hasPipelineFilters(parse('kind=risks&sort=title&group=owner'))).toBe(false);
    expect(hasPipelineFilters(parse('date=none'))).toBe(true);
    expect(boardPipelineParams(parse('group=none')).group).toBe('stage');
    const grouped = parse('group=owner');
    expect(boardPipelineParams(grouped)).toBe(grouped);
  });

  it('switches kind keeping the shared filters and dropping stage, changed and ids', () => {
    const next = withKind(new URLSearchParams('owner=2&stage=negotiation&changed=quarter&ids=41&group=month&search=emea'), 'risks');
    expect(next.toString()).toBe('owner=2&group=month&search=emea&kind=risks');
    expect(withKind(new URLSearchParams('kind=risks&owner=2'), 'opportunities').toString()).toBe('owner=2');
  });
});
```

```ts
// src/features/pipelines/pipelineChips.test.ts
import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES_KIND, RISKS_KIND } from './pipelineKinds';
import { dateFilterLabel, pipelineChips } from './pipelineChips';
import { parsePipelineParams } from './pipelineParams';
import { PIPELINE_FILTER_OPTIONS } from './testPipelines';

const OPTIONS = { ...PIPELINE_FILTER_OPTIONS, stages: [] };

describe('the Pipelines chips', () => {
  it('names every active filter from the options, in a fixed order', () => {
    const p = parsePipelineParams(
      new URLSearchParams('ids=41,42&search=emea&owner=outside&organisation=7&account=12&stage=closed_won&changed=quarter&priority=high&department=none&date=30'),
    );
    expect(pipelineChips(p, OPTIONS, OPPORTUNITIES_KIND).map((chip) => chip.label)).toEqual([
      'Chosen items (2)',
      'Search: emea',
      'Owner: Not in your book',
      'Organization: Pizza Hut',
      'Account: Pizza Hut EMEA',
      'Stage: Closed Won',
      'Stage changed this quarter',
      'Priority: High',
      'Department: Whole company',
      'Closes within 30 days',
    ]);
  });

  it("removes one value of a list filter, and falls back to ids and labels it knows", () => {
    const p = parsePipelineParams(new URLSearchParams('kind=risks&stage=open,mitigated&owner=9&organisation=99'));
    const chips = pipelineChips(p, null, RISKS_KIND);
    expect(chips.map((chip) => chip.label)).toEqual(['Owner: User 9', 'Organization: Organization 99', 'Stage: Open', 'Stage: Mitigated']);
    expect(chips.find((chip) => chip.label === 'Stage: Open')?.patch).toEqual({ stage: ['mitigated'] });
    expect(chips[0].patch).toEqual({ owner: '' });
  });

  it("words the date filter in each kind's verb", () => {
    expect(dateFilterLabel(RISKS_KIND, '90')).toBe('Due within 90 days');
    expect(dateFilterLabel(OPPORTUNITIES_KIND, 'overdue')).toBe('Overdue');
    expect(dateFilterLabel(OPPORTUNITIES_KIND, 'none')).toBe('No date');
  });
});
```

```tsx
// src/components/pipelines/portfolio/usePipelineParams.test.tsx
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { usePipelineParams } from './usePipelineParams';

function wrapper(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
}

describe('usePipelineParams', () => {
  it('reads the URL, writes patches to it, and clears the filters but not the kind, sort or group', () => {
    const { result } = renderHook(
      () => {
        const state = usePipelineParams();
        return { ...state, search: useLocation().search };
      },
      { wrapper: wrapper('/pipelines/list?kind=risks&owner=2&sort=title') },
    );
    expect(result.current.params).toMatchObject({ kind: 'risks', owner: '2', sort: 'title' });
    act(() => result.current.update({ date: 'overdue' }));
    expect(result.current.search).toBe('?kind=risks&owner=2&date=overdue&sort=title');
    act(() => result.current.clearFilters());
    expect(result.current.search).toBe('?kind=risks&sort=title');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/pipelines/pipelineParams.test.ts src/features/pipelines/pipelineChips.test.ts src/components/pipelines/portfolio/usePipelineParams.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `pipelineParams.ts`**

```ts
// src/features/pipelines/pipelineParams.ts
import { FUNCTION_LABELS } from '../auth/authSlice';
import { MAX_IDS } from '../organizations/portfolioParams';
import { NO_DEPARTMENT, PIPELINE_KINDS, type PipelineKind } from './pipelineKinds';
import type { PipelineKindKey } from './pipelineTypes';

// Everything the Pipelines page reads from its URL (spec §1: "Everything
// lives in the URL"). A value the backend would not understand is dropped
// here too (services/pipelines_portfolio/params.py), so a stale link still
// opens the page.

export type PipelineGroupKey = 'stage' | 'month' | 'parent' | 'owner' | 'department' | 'priority';
export type PipelineView = 'list' | 'board';
export type DateFilter = '' | '30' | '90' | '180' | 'overdue' | 'none';

export interface PipelineParams {
  /** `?kind=`; opportunities when absent. */
  kind: PipelineKindKey;
  search: string;
  /** Organisation ids. */
  organisation: string[];
  /** Account ids. */
  account: string[];
  /** A user id, 'unassigned', 'outside' ("Not in your book") or '' for everyone. */
  owner: string;
  /** [] is the view's default stages (defaultStages). */
  stage: string[];
  priority: string[];
  /** User.Function values; 'none' is the whole company. */
  department: string[];
  date: DateFilter;
  /** 'quarter': the stage last changed this calendar quarter. */
  changed: '' | 'quarter';
  ids: number[];
  sort: string;
  /** '' is "no grouping" (URL `group=none`, the List only). */
  group: PipelineGroupKey | '';
}

export const DEFAULT_PIPELINE_SORT = '-mrr';
/** Both views group by stage when the URL says nothing (spec §1). */
export const DEFAULT_PIPELINE_GROUP: PipelineGroupKey = 'stage';
const SORT_KEYS = ['mrr', 'date', 'priority', 'stage', 'title'];
const GROUP_KEYS: PipelineGroupKey[] = ['stage', 'month', 'parent', 'owner', 'department', 'priority'];
const DATE_FILTERS: DateFilter[] = ['30', '90', '180', 'overdue', 'none'];
const PRIORITIES = ['high', 'medium', 'low'];
const DEPARTMENTS = [...Object.keys(FUNCTION_LABELS), NO_DEPARTMENT];

/** Every filter off; the kind, sort and group stay. */
export const EMPTY_PIPELINE_FILTERS: Partial<PipelineParams> = {
  search: '',
  organisation: [],
  account: [],
  owner: '',
  stage: [],
  priority: [],
  department: [],
  date: '',
  changed: '',
  ids: [],
};

const list = (raw: string | null) =>
  (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

function only<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

export function parsePipelineParams(search: URLSearchParams): PipelineParams {
  const kind: PipelineKindKey = search.get('kind') === 'risks' ? 'risks' : 'opportunities';
  const stages = PIPELINE_KINDS[kind].stages.map((stage) => stage.value);
  const owner = search.get('owner') ?? '';
  const sort = search.get('sort');
  const group = search.get('group');
  const digits = (key: string) => list(search.get(key)).filter((value) => /^\d+$/.test(value));
  return {
    kind,
    search: (search.get('search') ?? '').trim(),
    organisation: digits('organisation'),
    account: digits('account'),
    owner: owner === 'unassigned' || owner === 'outside' || /^\d+$/.test(owner) ? owner : '',
    stage: only(list(search.get('stage')), stages),
    priority: only(list(search.get('priority')), PRIORITIES),
    department: only(list(search.get('department')), DEPARTMENTS),
    date: only([search.get('date') ?? ''], DATE_FILTERS)[0] ?? '',
    changed: search.get('changed') === 'quarter' ? 'quarter' : '',
    ids: digits('ids').map(Number).slice(0, MAX_IDS),
    sort: sort && SORT_KEYS.includes(sort.replace(/^-/, '')) ? sort : DEFAULT_PIPELINE_SORT,
    group: group === 'none' ? '' : (only([group ?? ''], GROUP_KEYS)[0] ?? DEFAULT_PIPELINE_GROUP),
  };
}

function setFilters(query: URLSearchParams, p: PipelineParams, stages: string[]) {
  if (p.search) query.set('search', p.search);
  if (p.organisation.length) query.set('organisation', p.organisation.join(','));
  if (p.account.length) query.set('account', p.account.join(','));
  if (p.owner) query.set('owner', p.owner);
  if (stages.length) query.set('stage', stages.join(','));
  if (p.priority.length) query.set('priority', p.priority.join(','));
  if (p.department.length) query.set('department', p.department.join(','));
  if (p.date) query.set('date', p.date);
  if (p.changed) query.set('changed', p.changed);
  if (p.ids.length) query.set('ids', p.ids.join(','));
}

/** The page URL's query: the kind only when it is risks, defaults left out,
 *  "no grouping" written as none. */
export function pipelineUrlSearch(p: PipelineParams): URLSearchParams {
  const query = new URLSearchParams();
  if (p.kind !== 'opportunities') query.set('kind', p.kind);
  setFilters(query, p, p.stage);
  if (p.sort !== DEFAULT_PIPELINE_SORT) query.set('sort', p.sort);
  if (p.group === '') query.set('group', 'none');
  else if (p.group !== DEFAULT_PIPELINE_GROUP) query.set('group', p.group);
  return query;
}

/** The stages a view lists when the URL names none: the open ones on the
 *  List (the server's default), every one on the Board (the contract: "the
 *  Board sends every stage"). */
export function defaultStages(kind: PipelineKind, view: PipelineView): string[] {
  return view === 'list' ? kind.openStages : kind.stages.map((stage) => stage.value);
}

/** The API's query (the kind is in the path, never here): the Board sends
 *  every stage when the URL names none; sort always, group when grouping,
 *  then `extra` (limit, cursor, group_value) as given. */
export function pipelineApiQuery(p: PipelineParams, view: PipelineView, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  const stages = p.stage.length || view === 'list' ? p.stage : defaultStages(PIPELINE_KINDS[p.kind], view);
  setFilters(query, p, stages);
  query.set('sort', p.sort);
  if (p.group) query.set('group', p.group);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

/** Whether any filter is on (a stage choice included): the empty state and
 *  "N of M" read it. */
export function hasPipelineFilters(p: PipelineParams): boolean {
  const query = new URLSearchParams();
  setFilters(query, p, p.stage);
  return query.toString() !== '';
}

/** What the Board reads: a board always has columns, so the List's "no
 *  grouping" reads as stage. Grouped params come back unchanged. */
export function boardPipelineParams(p: PipelineParams): PipelineParams {
  return p.group === '' ? { ...p, group: DEFAULT_PIPELINE_GROUP } : p;
}

/** The URL for the other kind (plan Decision 5): the shared filters stay;
 *  stage, changed and ids belong to one kind and go. */
export function withKind(search: URLSearchParams, kind: PipelineKindKey): URLSearchParams {
  const next = new URLSearchParams(search);
  for (const key of ['kind', 'stage', 'changed', 'ids']) next.delete(key);
  if (kind !== 'opportunities') next.set('kind', kind);
  return next;
}
```

- [ ] **Step 4: Write `pipelineChips.ts`**

```ts
// src/features/pipelines/pipelineChips.ts
import { stageLabel, type PipelineKind, NO_DEPARTMENT } from './pipelineKinds';
import type { DateFilter, PipelineParams } from './pipelineParams';
import type { PipelineFilterOptions } from './pipelineTypes';
import type { Option } from '../organizations/portfolioTypes';

export interface PipelineChip {
  key: string;
  label: string;
  /** What removing this chip writes to the URL. */
  patch: Partial<PipelineParams>;
}

const nameIn = (options: Option[] | undefined, value: string) => options?.find((option) => option.value === value)?.name;
const OWNER_BUCKETS: Record<string, string> = { unassigned: 'Unassigned', outside: 'Not in your book' };
const PRIORITY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** "Closes within 30 days" / "Due within 30 days", "Overdue", "No date". */
export function dateFilterLabel(kind: PipelineKind, date: DateFilter): string {
  if (date === 'overdue') return 'Overdue';
  if (date === 'none') return 'No date';
  return `${kind.dateVerb} within ${date} days`;
}

/** One removable chip per active filter, in a fixed order (spec §1). */
export function pipelineChips(p: PipelineParams, options: PipelineFilterOptions | null, kind: PipelineKind): PipelineChip[] {
  const chips: PipelineChip[] = [];
  if (p.ids.length) chips.push({ key: 'ids', label: `Chosen items (${p.ids.length})`, patch: { ids: [] } });
  if (p.search) chips.push({ key: 'search', label: `Search: ${p.search}`, patch: { search: '' } });
  if (p.owner) {
    const name = OWNER_BUCKETS[p.owner] ?? nameIn(options?.owners, p.owner) ?? `User ${p.owner}`;
    chips.push({ key: 'owner', label: `Owner: ${name}`, patch: { owner: '' } });
  }
  for (const id of p.organisation) {
    const name = nameIn(options?.organisations, id) ?? `Organization ${id}`;
    chips.push({ key: `organisation:${id}`, label: `Organization: ${name}`, patch: { organisation: p.organisation.filter((v) => v !== id) } });
  }
  for (const id of p.account) {
    const name = nameIn(options?.accounts, id) ?? `Account ${id}`;
    chips.push({ key: `account:${id}`, label: `Account: ${name}`, patch: { account: p.account.filter((v) => v !== id) } });
  }
  for (const stage of p.stage) {
    chips.push({ key: `stage:${stage}`, label: `Stage: ${stageLabel(kind, stage)}`, patch: { stage: p.stage.filter((v) => v !== stage) } });
  }
  if (p.changed) chips.push({ key: 'changed', label: 'Stage changed this quarter', patch: { changed: '' } });
  for (const priority of p.priority) {
    chips.push({ key: `priority:${priority}`, label: `Priority: ${PRIORITY[priority]}`, patch: { priority: p.priority.filter((v) => v !== priority) } });
  }
  for (const department of p.department) {
    const name = department === NO_DEPARTMENT ? 'Whole company' : (nameIn(options?.departments, department) ?? department);
    chips.push({ key: `department:${department}`, label: `Department: ${name}`, patch: { department: p.department.filter((v) => v !== department) } });
  }
  if (p.date) chips.push({ key: 'date', label: dateFilterLabel(kind, p.date), patch: { date: '' } });
  return chips;
}
```

- [ ] **Step 5: Write `usePipelineParams.ts`**

```ts
// src/components/pipelines/portfolio/usePipelineParams.ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EMPTY_PIPELINE_FILTERS,
  parsePipelineParams,
  pipelineUrlSearch,
  type PipelineParams,
} from '../../../features/pipelines/pipelineParams';

/** The Pipelines page's URL state, shared by the List and the Board. Updates
 *  replace the history entry, like the portfolios' filters, so Back leaves
 *  the page rather than undoing a chip. */
export function usePipelineParams() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parsePipelineParams(search), [search]);

  const update = useCallback(
    (patch: Partial<PipelineParams>) => {
      setSearch((prev) => pipelineUrlSearch({ ...parsePipelineParams(prev), ...patch }), { replace: true });
    },
    [setSearch],
  );

  const clearFilters = useCallback(() => update(EMPTY_PIPELINE_FILTERS), [update]);

  return { params, update, clearFilters };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/features/pipelines src/components/pipelines/portfolio/usePipelineParams.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/pipelines/pipelineParams.ts src/features/pipelines/pipelineParams.test.ts src/features/pipelines/pipelineChips.ts src/features/pipelines/pipelineChips.test.ts src/components/pipelines/portfolio/usePipelineParams.ts src/components/pipelines/portfolio/usePipelineParams.test.tsx
git commit -m "feat(pipelines): the page's URL state and its chips

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The item parts, the forms' date and Closed Lost, and the Deals & risks date line

**Files:**
- Create: `src/components/pipelines/portfolio/itemParts.tsx`
- Modify: `src/components/pipelines/kanbanConfig.ts` (the two `*_STAGE_COLUMNS` arrays)
- Modify: `src/components/pipelines/OpportunityFormModal.tsx`, `src/components/pipelines/RiskFormModal.tsx`
- Modify: `src/components/organizations/detail/DealItem.tsx`
- Test: `src/components/pipelines/portfolio/itemParts.test.tsx`, `src/components/pipelines/pipelineForms.test.tsx`, `src/components/organizations/detail/DealItem.test.tsx` (one test added)

**Interfaces:**
- Consumes: `parentHref`, `dealDateLine`, `OPPORTUNITY_STAGES`, `RISK_STAGES`, `PipelineRow` (Task 4); `PRIORITY_COLORS`; `localDay` (`features/organizations/storyDays`); `stubPipelines`, `recordWrites` (Task 4).
- Produces:

```ts
// itemParts.tsx
export function PipelineSignal(props: { signal: PipelineRow['signal'] }): JSX.Element | null;
export function DateLine(props: { text: string; overdue: boolean }): JSX.Element;
export function StageTag(props: { label: string }): JSX.Element;
export function PriorityTag(props: { priority: PipelineRow['priority'] }): JSX.Element;
export function PartOf(props: { row: PipelineRow }): JSX.Element;
// DealItem.tsx
export function DealItem(props: { deal: Opportunity | Risk; onOpen: () => void; today?: string }): JSX.Element;
// Both forms: a date field ("Expected close" / "Due by"); Closed Lost; `onSaved` after every successful save.
```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/pipelines/portfolio/itemParts.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { analyticsAddOn, emeaSeats } from '../../../features/pipelines/testPipelines';
import { DateLine, PartOf, PipelineSignal, PriorityTag, StageTag } from './itemParts';

describe('the Pipelines item parts', () => {
  it("links Part of to the organisation's or account's page, naming an account's organisation", () => {
    render(
      <MemoryRouter>
        <PartOf row={emeaSeats} />
        <PartOf row={analyticsAddOn} />
      </MemoryRouter>,
    );
    const account = screen.getByRole('link', { name: 'Pizza Hut EMEA' });
    expect(account).toHaveAttribute('href', '/accounts/12');
    expect(account.closest('p')).toHaveTextContent('Part of Pizza Hut EMEA · Pizza Hut');
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
  });

  it('shows the date in DM Mono, in danger when overdue, and one signal by kind', () => {
    render(
      <>
        <DateLine text="Overdue 5d" overdue />
        <DateLine text="Closes in 7d" overdue={false} />
        <PipelineSignal signal={{ kind: 'overdue', label: 'Overdue' }} />
        <PipelineSignal signal={{ kind: 'high_priority', label: 'High priority' }} />
        <PipelineSignal signal={null} />
        <PriorityTag priority={{ value: 'low', label: 'Low' }} />
        <StageTag label="Negotiation" />
      </>,
    );
    expect(screen.getByText('Overdue 5d')).toHaveClass('font-mono-brand', 'tabular-nums', 'text-danger');
    expect(screen.getByText('Closes in 7d')).toHaveClass('text-ink-muted');
    expect(screen.getByText('Overdue')).toHaveClass('bg-danger-dim');
    expect(screen.getByText('High priority')).toHaveClass('bg-warning-dim');
    expect(screen.getByText('Low priority')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toHaveAttribute('data-field', 'stage');
  });
});
```

```tsx
// src/components/pipelines/pipelineForms.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import customersReducer from '../../features/customers/customersSlice';
import { opportunityRecord, riskRecord } from '../../features/pipelines/pipelineKinds';
import { budgetFreeze, emeaSeats, recordWrites, stubPipelines } from '../../features/pipelines/testPipelines';
import { OpportunityFormModal } from './OpportunityFormModal';
import { RiskFormModal } from './RiskFormModal';

function renderForm(ui: ReactNode) {
  const store = configureStore({ reducer: { auth: authReducer, customers: customersReducer } });
  render(<Provider store={store}>{ui}</Provider>);
}

describe('the opportunity and risk forms (pipelines spec §1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers Closed Lost, edits the expected close, and calls onSaved after the edit', async () => {
    const spy = stubPipelines();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm(<OpportunityFormModal opportunity={opportunityRecord(emeaSeats)} onClose={onClose} onSaved={onSaved} />);
    expect(within(screen.getByLabelText('Stage')).getAllByRole('option').map((option) => option.textContent)).toContain('Closed Lost');
    const date = screen.getByLabelText('Expected close');
    expect(date).toHaveValue('2026-10-07');
    fireEvent.change(date, { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(recordWrites(spy)).toEqual([
      { method: 'PATCH', path: '/opportunities/41/', body: expect.objectContaining({ expected_close: '2026-11-01', stage: 'negotiation' }) },
    ]);
  });

  it('clears a due-by date as null', async () => {
    const spy = stubPipelines();
    const onSaved = vi.fn();
    renderForm(<RiskFormModal risk={riskRecord(budgetFreeze)} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Due by'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(recordWrites(spy)[0]).toMatchObject({ method: 'PATCH', path: '/risks/72/', body: { due_by: null } });
  });

  it('adds on a chosen organisation with its date, then calls onSaved', async () => {
    const spy = stubPipelines();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm(
      <OpportunityFormModal companies={[{ id: 7, name: 'Pizza Hut' }]} defaultStage="qualification" onClose={onClose} onSaved={onSaved} />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/^Company/), '7');
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seats');
    fireEvent.change(screen.getByLabelText('Expected close'), { target: { value: '2026-12-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add Opportunity' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(recordWrites(spy)).toEqual([
      {
        method: 'POST',
        path: '/opportunities/',
        body: expect.objectContaining({ customer_id: 7, title: 'Seats', stage: 'qualification', expected_close: '2026-12-01' }),
      },
    ]);
  });
});
```

Append to the `describe` in `src/components/organizations/detail/DealItem.test.tsx` (the existing four tests stay as they are):

```tsx
  it('adds the date line, and marks an open item past its date Overdue (pipelines spec §1)', () => {
    render(
      <Provider store={makeDetailStore()}>
        <ul>
          <DealItem deal={{ ...OPPORTUNITIES[0], expected_close: '2026-09-25' }} onOpen={vi.fn()} today="2026-09-30" />
          <DealItem deal={{ ...RISKS[0], due_by: '2026-10-20' }} onOpen={vi.fn()} today="2026-09-30" />
          <DealItem deal={OPPORTUNITIES[1]} onOpen={vi.fn()} today="2026-09-30" />
        </ul>
      </Provider>,
    );
    expect(screen.getByText('Overdue 5d')).toHaveClass('text-danger');
    expect(screen.getByText('Overdue')).toHaveClass('bg-danger-dim');
    expect(screen.getByText('Due in 20d')).toBeInTheDocument();
    expect(screen.getByText('No date')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines src/components/organizations/detail/DealItem.test.tsx`
Expected: FAIL — `./itemParts` unresolved; no "Expected close" field; no date line.

- [ ] **Step 3: Write `itemParts.tsx`**

```tsx
// src/components/pipelines/portfolio/itemParts.tsx
import { Link } from 'react-router-dom';
import { parentHref } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { FOCUS } from '../../organizations/portfolio/styles';
import { PRIORITY_COLORS } from '../kanbanConfig';

// The pieces of a Pipelines item and card (spec §1 "List items"), also used
// by the organisation and account pages' Deals & risks items.

const SIGNAL_TONE = {
  overdue: 'bg-danger-dim text-danger',
  high_priority: 'bg-warning-dim text-warning',
} as const;

/** At most one: Overdue first, then High priority on an open item. */
export function PipelineSignal({ signal }: { signal: PipelineRow['signal'] }) {
  if (!signal) return null;
  return (
    <span data-field="signal" className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SIGNAL_TONE[signal.kind]}`}>
      {signal.label}
    </span>
  );
}

/** "Closes in 12d", "Overdue 5d", "No date" (dateText), danger when overdue. */
export function DateLine({ text, overdue }: { text: string; overdue: boolean }) {
  return (
    <span data-field="date" className={`font-mono-brand tabular-nums text-[11px] ${overdue ? 'font-semibold text-danger' : 'text-ink-muted'}`}>
      {text}
    </span>
  );
}

export function StageTag({ label }: { label: string }) {
  return (
    <span data-field="stage" className="inline-flex shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink">
      {label}
    </span>
  );
}

/** Priority is the item's one colour: it carries severity. */
export function PriorityTag({ priority }: { priority: PipelineRow['priority'] }) {
  return (
    <span data-field="priority" className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${PRIORITY_COLORS[priority.value]}`}>
      {priority.label} priority
    </span>
  );
}

/** "Part of Pizza Hut EMEA · Pizza Hut": the item's organisation or account
 *  as a link (the server sends a row only when the viewer may open it), and
 *  for an account-level item the first organisation of that account the
 *  viewer may open (plan Decision 12). */
export function PartOf({ row }: { row: PipelineRow }) {
  const organisation = row.parent.type === 'account' ? row.companies[0]?.name : undefined;
  return (
    <p className="min-w-0 truncate text-[11px] text-ink-muted">
      Part of{' '}
      <Link
        to={parentHref(row.parent)}
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        data-field="parent"
        className={`inline-flex min-h-11 items-center rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`}
      >
        {row.parent.name}
      </Link>
      {organisation ? ` · ${organisation}` : null}
    </p>
  );
}
```

- [ ] **Step 4: The stage columns come from the kinds**

In `src/components/pipelines/kanbanConfig.ts`, add `import { OPPORTUNITY_STAGES, RISK_STAGES } from '../../features/pipelines/pipelineKinds';` and replace the two literal arrays with:

```ts
// Opportunity.Stage / Risk.Stage on the backend, in board order (Closed
// Lost included since 2026-09-30), named once in pipelineKinds.ts.
export const OPPORTUNITY_STAGE_COLUMNS: { stage: Opportunity['stage']; title: string }[] = OPPORTUNITY_STAGES.map(({ value, label }) => ({
  stage: value,
  title: label,
}));

export const RISK_STAGE_COLUMNS: { stage: Risk['stage']; title: string }[] = RISK_STAGES.map(({ value, label }) => ({ stage: value, title: label }));
```

- [ ] **Step 5: The opportunity form gains the date, Closed Lost and `onSaved` after every save**

In `src/components/pipelines/OpportunityFormModal.tsx`:

1. Delete the `// Matches Opportunity.Stage …` comment and the `STAGE_OPTIONS` constant; add `import { OPPORTUNITY_STAGES } from '../../features/pipelines/pipelineKinds';` and change `{STAGE_OPTIONS.map((opt) => (` to `{OPPORTUNITY_STAGES.map((opt) => (`.
2. Replace the `onSaved` prop's doc comment with:

```ts
  /** Called after every successful save (an add or an edit), so the caller
   * can read its own list again: the Deals & risks tab after a scoped add,
   * the Pipelines page after any add or edit (plan 2026-10-01 Decision 8). */
```

3. After `const [priority, setPriority] = …;` add:

```ts
  const [closeDate, setCloseDate] = useState(opportunity?.expected_close ?? '');
```

4. Replace `const data = { title: title.trim(), mrr: mrr.trim() || '0', stage, priority, department };` with:

```ts
    const data = { title: title.trim(), mrr: mrr.trim() || '0', stage, priority, department, expected_close: closeDate || null };
```

5. Delete both `onSaved?.();` lines inside the branches, and change the `onClose();` that follows the branches (inside `try`) to:

```ts
      onSaved?.();
      onClose();
```

   Replace the edit branch's comment `// No onSaved() — updateOpportunity's own extraReducers already` / `// patch every list this Opportunity could be showing in.` with `// updateOpportunity's own extraReducers patch every list this Opportunity` / `// could be showing in; onSaved() below reloads a page's own book.`

6. After the Stage `SelectField` (its closing `</SelectField>`), add:

```tsx
          <DateField label="Expected close" value={closeDate} onChange={setCloseDate} />
```

7. After the `TextField` component at the bottom of the file, add:

```tsx
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-ink-muted mb-1">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
      />
    </div>
  );
}
```

- [ ] **Step 6: The risk form, the same way**

In `src/components/pipelines/RiskFormModal.tsx`, the same six changes with the risk's names:
1. `STAGE_OPTIONS` → `import { RISK_STAGES } from '../../features/pipelines/pipelineKinds';` and `{RISK_STAGES.map((opt) => (`.
2. The `onSaved` doc comment as above.
3. `const [dueBy, setDueBy] = useState(risk?.due_by ?? '');` after the priority state.
4. `const data = { title: title.trim(), mrr: mrr.trim() || '0', stage, priority, department, due_by: dueBy || null };`
5. The same `onSaved?.();` move (and the edit branch's comment: "updateRisk's own extraReducers patch every list this Risk could be showing in; onSaved() below reloads a page's own book.").
6. `<DateField label="Due by" value={dueBy} onChange={setDueBy} />` after the Stage select, and the same `DateField` component.

- [ ] **Step 7: The Deals & risks item gains the date line**

Replace `src/components/organizations/detail/DealItem.tsx` with:

```tsx
import { useOrgCurrency } from '../../../hooks';
import type { Opportunity, Risk } from '../../../features/customers/customersSlice';
import { formatMoney } from '../../../features/customers/formatters';
import { localDay } from '../../../features/organizations/storyDays';
import { dealDateLine } from '../../../features/pipelines/pipelineKinds';
import { PRIORITY_COLORS } from '../../pipelines/kanbanConfig';
import { DateLine, PipelineSignal } from '../../pipelines/portfolio/itemParts';
import { FOCUS } from '../portfolio/styles';
import { AccountTag } from './ListParts';
import { META } from './listStyles';

const OVERDUE = { kind: 'overdue', label: 'Overdue' } as const;

/** One opportunity or risk (spec 2026-09-27 §3): the title and its MRR,
 *  then stage, priority, department, the account tag and (pipelines spec
 *  2026-09-30 §1) the date line with the Overdue signal. The whole item
 *  opens the record's existing edit form. Priority and Overdue are the only
 *  colours: they carry severity. `today` is the viewer's (tests pin it). */
export function DealItem({ deal, onOpen, today = localDay(new Date()) }: { deal: Opportunity | Risk; onOpen: () => void; today?: string }) {
  const currency = useOrgCurrency();
  const date = dealDateLine(deal, today);
  return (
    <li data-deal={deal.id}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex min-h-11 w-full min-w-0 flex-col px-3 py-2.5 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
      >
        <span className="flex w-full min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{deal.title}</span>
          <span className="shrink-0 text-[13px] text-ink-muted">
            <span className="font-mono-brand tabular-nums text-ink">{formatMoney(deal.mrr, currency)}</span> MRR
          </span>
        </span>
        <span className={META}>
          <span className="rounded-full bg-subtle px-2 py-0.5 text-ink">{deal.stage_display}</span>
          <span className={`rounded-full border px-2 py-0.5 ${PRIORITY_COLORS[deal.priority]}`}>{deal.priority_display} priority</span>
          <span>{deal.department ? deal.department_display : 'Whole company'}</span>
          <AccountTag record={deal} />
          <DateLine text={date.text} overdue={date.overdue} />
          {date.overdue ? <PipelineSignal signal={OVERDUE} /> : null}
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 8: Run the tests, and every Deals & risks and form test**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines src/components/organizations/detail src/components/accounts/detail src/pages/organizations/DetailsLists.test.tsx src/pages/accounts/Details.test.tsx`
Expected: PASS, with the earlier assertions unchanged.

- [ ] **Step 9: Typecheck, lint and commit**

Run: `npx tsc -b && npx eslint src/components/pipelines src/components/organizations/detail`

```bash
git add src/components/pipelines src/components/organizations/detail/DealItem.tsx src/components/organizations/detail/DealItem.test.tsx
git commit -m "feat(pipelines): expected close, due by and Closed Lost in the forms and the Deals & risks items

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The book, the item and the sections

**Files:**
- Create: `src/components/pipelines/portfolio/usePipelineBook.ts`, `PipelineItem.tsx`, `PipelineSections.tsx`
- Test: `src/components/pipelines/portfolio/usePipelineBook.test.tsx`, `PipelineItem.test.tsx`, `PipelineSections.test.tsx`

**Interfaces:**
- Consumes: `usePagedRead`, `PagedRead` (Task 1); `EmptyState`, `ErrorBlock`, `MoreButton`, `RowSkeleton`, `sectionStartsOpen` (`PortfolioSections.tsx`); `TITLE_BUTTON` (`organizations/detail/listStyles.ts`); `PipelineKind`, `dateText` (Task 4); `pipelineApiQuery`, `hasPipelineFilters`, `EMPTY_PIPELINE_FILTERS` (Task 5); `itemParts` (Task 6).
- Produces:

```ts
// usePipelineBook.ts
export const PIPELINE_PAGE_SIZE = 50; export const PIPELINE_SECTION_SIZE = 25;
export interface PipelineBook extends PagedRead<PipelineRow, PipelinePage> { total: number | null }
export function usePipelineBook(kind: PipelineKind, params: PipelineParams, view: PipelineView, version: number, onLoaded?: (rows: PipelineRow[]) => void, totalVersion?: number): PipelineBook;
// PipelineItem.tsx
export interface PipelineItemProps { row: PipelineRow; kind: PipelineKind; currency: CurrencyCode; selecting: boolean; selected: boolean; selectDisabled?: boolean; atLimit?: boolean; onToggleSelect: (id: number) => void; onOpen: (row: PipelineRow) => void }
export function PipelineItem(props: PipelineItemProps): JSX.Element;
// PipelineSections.tsx
export type PipelineItemRenderer = (row: PipelineRow, state: { loading: boolean }) => ReactNode;
export function PipelineSections(props: { kind; params: PipelineParams; version: number; book: PipelineBook; currency: CurrencyCode; filtered: boolean; renderItem: PipelineItemRenderer; onRowsLoaded: (rows: PipelineRow[]) => void; onClearFilters: () => void; onAdd: () => void }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/pipelines/portfolio/usePipelineBook.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams } from '../../../features/pipelines/pipelineParams';
import { pipelineQueries, stubPipelines } from '../../../features/pipelines/testPipelines';
import { usePipelineBook } from './usePipelineBook';

const params = (query: string) => parsePipelineParams(new URLSearchParams(query));

describe('usePipelineBook', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a flat page of rows, and M for "N of M" when a filter is on', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params('owner=3&group=none'), 'list', 0));
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([43]));
    await waitFor(() => expect(result.current.total).toBe(3));
    const probe = pipelineQueries(spy, 'opportunities').find((query) => query.get('limit') === '1');
    expect(probe?.get('owner')).toBeNull();
  });

  it('reads only the frame when grouped, and no M without a filter', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params(''), 'list', 0));
    await waitFor(() => expect(result.current.data?.count).toBe(3));
    expect(result.current.rows).toEqual([]);
    expect(result.current.total).toBeNull();
    expect(pipelineQueries(spy, 'opportunities').map((query) => query.get('limit'))).toEqual(['1']);
  });
});
```

```tsx
// src/components/pipelines/portfolio/PipelineItem.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OPPORTUNITIES_KIND, RISKS_KIND } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { adminLeft, analyticsAddOn, emeaSeats, globexUplift, initechWin } from '../../../features/pipelines/testPipelines';
import { PipelineItem, type PipelineItemProps } from './PipelineItem';

function renderItem(row: PipelineRow, props: Partial<PipelineItemProps> = {}) {
  const onOpen = vi.fn();
  const onToggleSelect = vi.fn();
  render(
    <MemoryRouter>
      <ul>
        <PipelineItem
          row={row}
          kind={row.kind === 'risk' ? RISKS_KIND : OPPORTUNITIES_KIND}
          currency="USD"
          selecting={false}
          selected={false}
          onToggleSelect={onToggleSelect}
          onOpen={onOpen}
          {...props}
        />
      </ul>
    </MemoryRouter>,
  );
  const item = document.querySelector(`[data-item-id="${row.id}"]`) as HTMLElement;
  return { item, onOpen, onToggleSelect };
}

describe('PipelineItem (spec §1 "List items")', () => {
  it('shows the title, Part of, MRR, stage, department, date and one signal', () => {
    const { item } = renderItem(emeaSeats);
    expect(within(item).getByRole('button', { name: 'EMEA seats' })).toHaveClass('min-h-11');
    expect(within(item).getByRole('link', { name: 'Pizza Hut EMEA' })).toHaveAttribute('href', '/accounts/12');
    expect(within(item).getByText('$2K')).toHaveClass('font-mono-brand', 'tabular-nums');
    for (const text of ['Negotiation', 'Customer Success', 'Closes in 7d']) expect(within(item).getByText(text)).toBeInTheDocument();
    // The signal says High priority; the tag would only repeat it (plan Decision 17).
    expect(within(item).getAllByText('High priority')).toHaveLength(1);
    expect(item.querySelector('table')).toBeNull();
  });

  it('marks an overdue item, and reads a whole-company, undated one', () => {
    renderItem(globexUplift);
    expect(screen.getByText('Overdue 5d')).toHaveClass('text-danger');
    expect(screen.getByText('Overdue')).toHaveClass('bg-danger-dim');
    expect(screen.getByText('Low priority')).toBeInTheDocument();
    renderItem(analyticsAddOn);
    expect(screen.getByText('Whole company')).toBeInTheDocument();
    expect(screen.getByText('No date')).toBeInTheDocument();
  });

  it("words a risk's date, and a closed item's past date", () => {
    renderItem(adminLeft);
    expect(screen.getByText('Due in 20d')).toBeInTheDocument();
    renderItem(initechWin);
    expect(screen.getByText('Expected 10 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Medium priority')).toBeInTheDocument();
  });

  it('opens from its title or its body; the Part-of link does not open it', async () => {
    const { item, onOpen } = renderItem(emeaSeats);
    await userEvent.click(within(item).getByRole('button', { name: 'EMEA seats' }));
    expect(onOpen).toHaveBeenCalledWith(emeaSeats);
    await userEvent.click(within(item).getByText('Negotiation'));
    expect(onOpen).toHaveBeenCalledTimes(2);
    await userEvent.click(within(item).getByRole('link', { name: 'Pizza Hut EMEA' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('selects instead of opening while selecting, with a 44px checkbox', async () => {
    const { item, onOpen, onToggleSelect } = renderItem(emeaSeats, { selecting: true });
    const checkbox = within(item).getByRole('checkbox', { name: 'Select EMEA seats' });
    expect(checkbox.closest('label')).toHaveClass('w-11', 'h-11', 'flex');
    await userEvent.click(within(item).getByRole('button', { name: 'EMEA seats' }));
    await userEvent.click(within(item).getByText('Negotiation'));
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
```

```tsx
// src/components/pipelines/portfolio/PipelineSections.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PIPELINE_KINDS } from '../../../features/pipelines/pipelineKinds';
import { hasPipelineFilters, parsePipelineParams } from '../../../features/pipelines/pipelineParams';
import { pipelineQueries, stubPipelines } from '../../../features/pipelines/testPipelines';
import { PipelineSections } from './PipelineSections';
import { usePipelineBook } from './usePipelineBook';

function Harness({ query, onClear = vi.fn(), onAdd = vi.fn() }: { query: string; onClear?: () => void; onAdd?: () => void }) {
  const params = parsePipelineParams(new URLSearchParams(query));
  const kind = PIPELINE_KINDS[params.kind];
  const book = usePipelineBook(kind, params, 'list', 0);
  return (
    <PipelineSections
      kind={kind}
      params={params}
      version={0}
      book={book}
      currency="USD"
      filtered={hasPipelineFilters(params)}
      renderItem={(row) => <li key={row.id}>{row.title}</li>}
      onRowsLoaded={() => {}}
      onClearFilters={onClear}
      onAdd={onAdd}
    />
  );
}

describe('PipelineSections', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups by stage with each section counting its items and MRR, and reading its own rows', async () => {
    const spy = stubPipelines();
    render(<Harness query="" />);
    const negotiation = await screen.findByRole('button', { name: /^Negotiation/ });
    expect(negotiation).toHaveTextContent('Negotiation · 1 · $2K');
    expect(negotiation).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Discovery/ })).toHaveTextContent('Discovery · 1 · $300');
    expect(await screen.findByText('EMEA seats')).toBeInTheDocument();
    const column = pipelineQueries(spy, 'opportunities').find((query) => query.get('group_value') === 'negotiation');
    expect(column?.get('limit')).toBe('25');
    expect(column?.get('stage')).toBeNull();
  });

  it('lists flat with group=none', async () => {
    stubPipelines();
    render(<Harness query="group=none" />);
    expect(await screen.findByText('Globex uplift')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Opportunities list' })).toHaveClass('sr-only');
  });

  it('says when filters match nothing, and when there is nothing open yet', async () => {
    stubPipelines({ opportunities: [], risks: [] });
    const onClear = vi.fn();
    const { unmount } = render(<Harness query="owner=2" onClear={onClear} />);
    expect(await screen.findByText('No opportunities match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
    unmount();
    const onAdd = vi.fn();
    render(<Harness query="kind=risks" onAdd={onAdd} />);
    expect(await screen.findByText('No open risks')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add risk' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('shows a failed first read with Try again', async () => {
    const spy = stubPipelines({ pipeline: () => ({ status: 500, body: { detail: 'Server error' } }) });
    render(<Harness query="" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(pipelineQueries(spy, 'opportunities')).toHaveLength(2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `usePipelineBook.ts`**

```ts
// src/components/pipelines/portfolio/usePipelineBook.ts
import { useCallback, useEffect, useState } from 'react';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import {
  EMPTY_PIPELINE_FILTERS,
  hasPipelineFilters,
  pipelineApiQuery,
  type PipelineParams,
  type PipelineView,
} from '../../../features/pipelines/pipelineParams';
import type { PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { usePagedRead, type PagedRead } from '../../organizations/portfolio/usePagedRead';

export const PIPELINE_PAGE_SIZE = 50;
export const PIPELINE_SECTION_SIZE = 25;

export interface PipelineBook extends PagedRead<PipelineRow, PipelinePage> {
  /** M in "N of M": the kind's whole book in the view's default stages.
   *  Null when no filter is on (the page then says "N opportunities"), and
   *  never less than N. */
  total: number | null;
}

/** The page's frame read of the kind's book (the tiles, groups, filter
 *  options, count and currency), with the rows when the List is flat.
 *  Grouped, each section or column reads its own rows and this read asks
 *  for one row only. `totalVersion` reloads the M probe (default:
 *  `version`); the Board passes one that skips its moves, which cannot
 *  change M. */
export function usePipelineBook(
  kind: PipelineKind,
  params: PipelineParams,
  view: PipelineView,
  version: number,
  onLoaded?: (rows: PipelineRow[]) => void,
  totalVersion: number = version,
): PipelineBook {
  const grouped = params.group !== '';
  const frame = usePagedRead<PipelineRow, PipelinePage>(
    kind.fetch,
    kind.noun,
    pipelineApiQuery(params, view, { limit: String(grouped ? 1 : PIPELINE_PAGE_SIZE) }),
    true,
    version,
    grouped ? undefined : onLoaded,
  );
  const noopLoadMore = useCallback(async () => {}, []);

  const probeQuery = hasPipelineFilters(params)
    ? pipelineApiQuery({ ...params, ...EMPTY_PIPELINE_FILTERS, group: '' }, view, { limit: '1' })
    : null;
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
        // M stays unknown; the page says "N opportunities" instead of a guess.
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

- [ ] **Step 4: Write `PipelineItem.tsx`**

```tsx
// src/components/pipelines/portfolio/PipelineItem.tsx
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { dateText, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { TITLE_BUTTON } from '../../organizations/detail/listStyles';
import { FOCUS } from '../../organizations/portfolio/styles';
import { DateLine, PartOf, PipelineSignal, PriorityTag, StageTag } from './itemParts';

export interface PipelineItemProps {
  row: PipelineRow;
  kind: PipelineKind;
  currency: CurrencyCode;
  /** Any item is selected (or the phone Select mode is on): taps select. */
  selecting: boolean;
  selected: boolean;
  /** Its list is loading or a bulk action is running: no checkbox. */
  selectDisabled?: boolean;
  /** The selection is at its 500-id cap. */
  atLimit?: boolean;
  onToggleSelect: (id: number) => void;
  /** Opens the item's form. */
  onOpen: (row: PipelineRow) => void;
}

/** One opportunity or risk as a rounded item, never a table row (spec §1
 *  "List items"). In a wide column it is one line: title and Part of, MRR,
 *  stage, priority, department, date, signal. In a narrow one (phones, or
 *  beside a rail) the title takes the first line and the facts wrap under
 *  it. The title, the item's body and a tap all open its form; while
 *  selecting they select instead. */
export function PipelineItem({
  row,
  kind,
  currency,
  selecting,
  selected,
  selectDisabled = false,
  atLimit = false,
  onToggleSelect,
  onOpen,
}: PipelineItemProps) {
  const checkboxDisabled = selectDisabled || (atLimit && !selected);
  const activate = () => (selecting ? onToggleSelect(row.id) : onOpen(row));

  return (
    <li
      data-item-id={row.id}
      className={`group rounded-xl bg-surface transition-shadow duration-[var(--dur-fast)] hover:shadow-sm ${selected ? 'ring-1 ring-accent' : ''}`}
    >
      <div
        data-part="item"
        onClick={activate}
        className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 @min-[60rem]:flex-nowrap"
      >
        <div className="flex min-w-0 basis-full items-start gap-2 @min-[60rem]:basis-auto @min-[60rem]:flex-1">
          <label
            onClick={(event) => event.stopPropagation()}
            className={`shrink-0 items-center justify-center w-11 h-11 -my-2 -ml-2 sm:w-6 sm:h-6 sm:m-0 ${
              selecting ? 'flex' : 'hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
            }`}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={checkboxDisabled}
              onChange={() => onToggleSelect(row.id)}
              aria-label={`Select ${row.title}`}
              title={atLimit && !selected ? '500 is the most you can select at once' : undefined}
              className={`w-4 h-4 cursor-pointer accent-accent ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </label>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              data-field="title"
              aria-haspopup="dialog"
              onClick={(event) => {
                event.stopPropagation();
                activate();
              }}
              className={`${TITLE_BUTTON} text-[13px] font-semibold text-ink`}
            >
              {row.title}
            </button>
            <PartOf row={row} />
          </div>
        </div>
        <span data-field="mrr" className="font-mono-brand tabular-nums text-[13px] text-ink @min-[60rem]:w-20 @min-[60rem]:text-right">
          {formatCompactMoney(row.mrr, currency)}
        </span>
        <StageTag label={row.stage.label} />
        {row.signal?.kind === 'high_priority' ? null : <PriorityTag priority={row.priority} />}
        <span data-field="department" className="min-w-0 truncate text-[11px] text-ink-muted @min-[60rem]:w-32">
          {row.department.label || 'Whole company'}
        </span>
        <span className="@min-[60rem]:w-28">
          <DateLine text={dateText(kind, row.date, row.open)} overdue={row.overdue} />
        </span>
        <span className="flex min-w-0 @min-[60rem]:w-28 @min-[60rem]:justify-end">
          <PipelineSignal signal={row.signal} />
        </span>
      </div>
    </li>
  );
}
```

- [ ] **Step 5: Write `PipelineSections.tsx`**

```tsx
// src/components/pipelines/portfolio/PipelineSections.tsx
import { useId, useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { withArticle, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import { pipelineApiQuery, type PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineGroup, PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { EmptyState, ErrorBlock, MoreButton, RowSkeleton, sectionStartsOpen } from '../../organizations/portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../../organizations/portfolio/styles';
import { usePagedRead } from '../../organizations/portfolio/usePagedRead';
import { PIPELINE_SECTION_SIZE, type PipelineBook } from './usePipelineBook';

/** An item renderer that also gets its own section's (or the flat list's)
 *  `loading`, so it can disable that item's checkbox meanwhile. */
export type PipelineItemRenderer = (row: PipelineRow, state: { loading: boolean }) => ReactNode;

function Section({
  kind,
  group,
  groupsKey,
  params,
  version,
  currency,
  defaultOpen,
  renderItem,
  onRowsLoaded,
}: {
  kind: PipelineKind;
  group: PipelineGroup;
  /** The joined keys of every group shown: when the set changes, this
   *  section re-applies the start-open rule (as on Organizations). */
  groupsKey: string;
  params: PipelineParams;
  version: number;
  currency: CurrencyCode;
  defaultOpen: boolean;
  renderItem: PipelineItemRenderer;
  onRowsLoaded: (rows: PipelineRow[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [seenGroups, setSeenGroups] = useState(groupsKey);
  if (seenGroups !== groupsKey) {
    setSeenGroups(groupsKey);
    setOpen(defaultOpen);
  }
  const bodyId = useId();
  const page = usePagedRead<PipelineRow, PipelinePage>(
    kind.fetch,
    kind.noun,
    pipelineApiQuery(params, 'list', { group_value: group.key, limit: String(PIPELINE_SECTION_SIZE) }),
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
          {group.label}{' '}
          <span className="font-normal text-ink-muted">
            {' · '}
            <span className="font-mono-brand tabular-nums">{group.count}</span>
            {' · '}
            <span className="font-mono-brand tabular-nums">{formatCompactMoney(group.mrr, currency)}</span>
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
            <RowSkeleton count={Math.min(3, group.count)} label={`Loading ${kind.noun.many}`} />
          ) : (
            <ul className="flex flex-col gap-1.5" aria-busy={page.loading}>
              {page.rows.map((row) => renderItem(row, { loading: page.loading }))}
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

/** The List's body: grouped sections (each with its own pages) or one flat
 *  list, with the loading, empty and error states (the Organizations list's,
 *  in this kind's words). */
export function PipelineSections({
  kind,
  params,
  version,
  book,
  currency,
  filtered,
  renderItem,
  onRowsLoaded,
  onClearFilters,
  onAdd,
}: {
  kind: PipelineKind;
  params: PipelineParams;
  version: number;
  book: PipelineBook;
  currency: CurrencyCode;
  filtered: boolean;
  renderItem: PipelineItemRenderer;
  onRowsLoaded: (rows: PipelineRow[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  const { data, error } = book;
  if (!data && error) return <ErrorBlock message={error} onRetry={book.retry} />;
  if (!data) return <RowSkeleton count={6} label={`Loading ${kind.noun.many}`} />;

  if (data.count === 0) {
    return filtered ? (
      <EmptyState
        title={`No ${kind.noun.many} match these filters`}
        detail="Remove a filter, or clear them all."
        action={
          <button type="button" onClick={onClearFilters} className={`${QUIET} border border-line`}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState
        title={`No open ${kind.noun.many}`}
        detail={`Add ${withArticle(kind.noun.one)}, or show the closed stages from Filters.`}
        action={
          <button type="button" onClick={onAdd} className={`${QUIET} bg-accent text-on-accent hover:bg-accent-hover`}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {`Add ${kind.noun.one}`}
          </button>
        }
      />
    );
  }

  // A stale-but-still-shown re-fetch failure: keep the last good list.
  const staleError = error ? (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
      {error} Showing the last result.
      <button type="button" onClick={book.retry} className={QUIET}>
        Try again
      </button>
    </p>
  ) : null;

  if (params.group === '') {
    return (
      <div aria-busy={book.loading}>
        <h2 className="sr-only">{`${kind.title} list`}</h2>
        {staleError}
        <ul className="flex flex-col gap-1.5">{book.rows.map((row) => renderItem(row, { loading: book.loading }))}</ul>
        <MoreButton
          next={book.next}
          loading={book.loadingMore}
          error={book.moreError}
          label={`Show more ${kind.noun.many}`}
          onClick={() => void book.loadMore()}
        />
      </div>
    );
  }

  const groupsKey = data.groups.map((group) => group.key).join('|');
  return (
    <div className="flex flex-col gap-4" aria-busy={book.loading}>
      {staleError}
      {data.groups.map((group, index) => (
        <Section
          key={group.key}
          kind={kind}
          group={group}
          groupsKey={groupsKey}
          params={params}
          version={version}
          currency={currency}
          defaultOpen={sectionStartsOpen(index, data.groups.length)}
          renderItem={renderItem}
          onRowsLoaded={onRowsLoaded}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/pipelines/portfolio
git commit -m "feat(pipelines): the book, the list item with its Part-of and date lines, and the sections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The tiles, with the stage strip

**Files:**
- Create: `src/components/pipelines/portfolio/PipelineTiles.tsx`
- Test: `src/components/pipelines/portfolio/PipelineTiles.test.tsx`

**Interfaces:**
- Consumes: `Tile`, `Switch`, `FilterButton`, `TileButton`, `TilesSkeleton` (Task 2); `MONO` (styles); `PipelineKind` (Task 4); `PipelineParams` (Task 5); `PipelineSummary`.
- Produces:

```ts
export function PipelineTiles(props: {
  kind: PipelineKind; summary: PipelineSummary | null; failed?: boolean; currency: CurrencyCode;
  params: PipelineParams; onFilter: (patch: Partial<PipelineParams>) => void;
}): JSX.Element;
```

Tile → filter (spec §1 and the backend's "each tile is its filter's rule"): Closing/Due → `date=30|90`; Overdue → `date=overdue`; Won/Mitigated this quarter → `stage=<done>&changed=quarter`; a stage in the strip → `stage=<value>`. Pressed when the URL already says exactly that; pressing again clears it. The Open pipeline / MRR at risk tile is a figure (Decision 3).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pipelines/portfolio/PipelineTiles.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OPPORTUNITIES_KIND, RISKS_KIND } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams } from '../../../features/pipelines/pipelineParams';
import { OPPORTUNITY_ROWS, RISK_ROWS, buildPipelinePage } from '../../../features/pipelines/testPipelines';
import { PipelineTiles } from './PipelineTiles';

const OPPORTUNITIES = buildPipelinePage('opportunities', new URLSearchParams(), OPPORTUNITY_ROWS).summary;
const RISKS = buildPipelinePage('risks', new URLSearchParams(), RISK_ROWS).summary;

function renderTiles(query = '', kind = OPPORTUNITIES_KIND, summary = OPPORTUNITIES) {
  const onFilter = vi.fn();
  render(<PipelineTiles kind={kind} summary={summary} currency="USD" params={parsePipelineParams(new URLSearchParams(query))} onFilter={onFilter} />);
  return onFilter;
}

describe('PipelineTiles (spec §1 "Summary tiles")', () => {
  it("shows the open pipeline, closing, overdue and won-this-quarter figures over every filtered row", () => {
    renderTiles();
    const open = screen.getByRole('group', { name: 'Open pipeline' });
    expect(open).toHaveTextContent('3');
    expect(open).toHaveTextContent('$7.3K MRR');
    expect(within(open).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Closing within 30 days: 1' })).toHaveTextContent('$2K MRR');
    expect(screen.getByRole('button', { name: 'Overdue: 1' })).toHaveTextContent('$5K MRR');
    expect(screen.getByRole('button', { name: 'Won this quarter: 1' })).toHaveTextContent('$1.5K MRR');
  });

  it('strips the open stages only, empty ones included', () => {
    renderTiles();
    const strip = screen.getByRole('group', { name: 'Stages' });
    expect(within(strip).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Discovery 1',
      'Qualification 0',
      'Solution Validation 0',
      'Proposal / Price Review 1',
      'Negotiation 1',
    ]);
  });

  it("sets each tile's filter", async () => {
    const onFilter = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: 'Closing within 30 days: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: '30' });
    await userEvent.click(screen.getByRole('button', { name: '90d' }));
    await userEvent.click(screen.getByRole('button', { name: 'Closing within 90 days: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: '90' });
    await userEvent.click(screen.getByRole('button', { name: 'Overdue: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: 'overdue' });
    await userEvent.click(screen.getByRole('button', { name: 'Won this quarter: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ stage: ['closed_won'], changed: 'quarter' });
    await userEvent.click(within(screen.getByRole('group', { name: 'Stages' })).getByRole('button', { name: /Negotiation/ }));
    expect(onFilter).toHaveBeenLastCalledWith({ stage: ['negotiation'] });
  });

  it('clears a pressed tile', async () => {
    const onFilter = renderTiles('stage=closed_won&changed=quarter&date=overdue');
    const won = screen.getByRole('button', { name: 'Won this quarter: 1' });
    expect(won).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(won);
    expect(onFilter).toHaveBeenLastCalledWith({ stage: [], changed: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Overdue: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ date: '' });
  });

  it("words the risks' tiles", () => {
    renderTiles('kind=risks', RISKS_KIND, RISKS);
    expect(screen.getByRole('group', { name: 'MRR at risk' })).toHaveTextContent('$2K MRR');
    expect(screen.getByRole('button', { name: 'Due within 30 days: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mitigated this quarter: 1' })).toHaveTextContent('$600 MRR');
    expect(within(screen.getByRole('group', { name: 'Stages' })).getAllByRole('button')).toHaveLength(1);
  });

  it('waits with a skeleton, and says when the summary could not load', () => {
    const { rerender } = render(
      <PipelineTiles kind={OPPORTUNITIES_KIND} summary={null} currency="USD" params={parsePipelineParams(new URLSearchParams())} onFilter={vi.fn()} />,
    );
    expect(screen.getByRole('status', { name: 'Loading summary' })).toBeInTheDocument();
    rerender(
      <PipelineTiles kind={OPPORTUNITIES_KIND} summary={null} failed currency="USD" params={parsePipelineParams(new URLSearchParams())} onFilter={vi.fn()} />,
    );
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/PipelineTiles.test.tsx`
Expected: FAIL — `./PipelineTiles` unresolved.

- [ ] **Step 3: Write `PipelineTiles.tsx`**

```tsx
// src/components/pipelines/portfolio/PipelineTiles.tsx
import { useState } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineSummary } from '../../../features/pipelines/pipelineTypes';
import { MONO } from '../../organizations/portfolio/styles';
import { FilterButton, Switch, Tile, TileButton, TilesSkeleton } from '../../organizations/portfolio/tileParts';

type Span = '30' | '90';
const SPANS: { value: Span; label: string }[] = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];
const only = (values: string[], value: string) => values.length === 1 && values[0] === value;

/** The five tiles (spec §1, and the backend ruling: they ignore only the
 *  stage filter). Every figure is the server's, over every filtered row. A
 *  tile sets its filter and pressing it again clears it; the first tile is
 *  the List's default view, so it is a figure only (plan Decision 3). The
 *  strip lists the open stages from `summary.stages`, empty ones included.
 *  On phones the row swipes sideways; the page never scrolls sideways. */
export function PipelineTiles({
  kind,
  summary,
  failed = false,
  currency,
  params,
  onFilter,
}: {
  kind: PipelineKind;
  summary: PipelineSummary | null;
  failed?: boolean;
  currency: CurrencyCode;
  params: PipelineParams;
  onFilter: (patch: Partial<PipelineParams>) => void;
}) {
  // The Closing tile's window follows a 30/90 date filter set elsewhere
  // (the Filters panel, a chip). Synced during render.
  const [span, setSpan] = useState<Span>(params.date === '90' ? '90' : '30');
  const [seenDate, setSeenDate] = useState(params.date);
  if (seenDate !== params.date) {
    setSeenDate(params.date);
    if (params.date === '30' || params.date === '90') setSpan(params.date);
  }

  if (!summary) {
    if (!failed) return <TilesSkeleton />;
    return (
      <div className="rounded-xl bg-surface p-3">
        <p className="text-[13px] font-semibold text-ink">Summary unavailable</p>
        <p className="text-[11px] text-ink-muted">The tiles return once the list loads.</p>
      </div>
    );
  }

  const money = (value: number) => `${formatCompactMoney(value, currency)} MRR`;
  const within = summary.within[span];
  const done = summary.done_this_quarter;
  const doneOn = only(params.stage, done.stage) && params.changed === 'quarter';
  const stages = summary.stages.filter((stage) => kind.openStages.includes(stage.value));
  const stageMax = Math.max(1, ...stages.map((stage) => stage.count));
  const figure = (count: number, mrr: number) => (
    <>
      <span className={`${MONO} block text-[22px] leading-tight text-ink`}>{count}</span>
      <span className={`${MONO} block text-[11px] text-ink-muted`}>{money(mrr)}</span>
    </>
  );

  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 @min-[50rem]:grid-cols-5">
      <Tile title={kind.tiles.open}>{figure(summary.open.count, summary.open.mrr)}</Tile>

      <Tile title={kind.tiles.within} action={<Switch label={`${kind.tiles.within} window`} value={span} onChange={setSpan} options={SPANS} />}>
        <TileButton
          pressed={params.date === span}
          label={`${kind.tiles.within} within ${span} days: ${within.count}`}
          onClick={() => onFilter({ date: params.date === span ? '' : span })}
        >
          {figure(within.count, within.mrr)}
        </TileButton>
      </Tile>

      <Tile title="Overdue">
        <TileButton
          pressed={params.date === 'overdue'}
          label={`Overdue: ${summary.overdue.count}`}
          onClick={() => onFilter({ date: params.date === 'overdue' ? '' : 'overdue' })}
        >
          {figure(summary.overdue.count, summary.overdue.mrr)}
        </TileButton>
      </Tile>

      <Tile title={kind.tiles.done}>
        <TileButton
          pressed={doneOn}
          label={`${kind.tiles.done}: ${done.count}`}
          onClick={() => onFilter(doneOn ? { stage: [], changed: '' } : { stage: [done.stage], changed: 'quarter' })}
        >
          {figure(done.count, done.mrr)}
        </TileButton>
      </Tile>

      <Tile title="Stages">
        {stages.map((stage) => (
          <FilterButton
            key={stage.value}
            pressed={only(params.stage, stage.value)}
            onClick={() => onFilter({ stage: only(params.stage, stage.value) ? [] : [stage.value] })}
          >
            <span title={stage.label} className="min-w-0 flex-1 truncate text-left">
              {stage.label}
            </span>{' '}
            <span aria-hidden="true" className="mx-1 h-1 w-10 shrink-0 rounded-full bg-line">
              <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${(stage.count / stageMax) * 100}%` }} />
            </span>
            <span className={`${MONO} text-ink`}>{stage.count}</span>
          </FilterButton>
        ))}
      </Tile>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/PipelineTiles.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pipelines/portfolio/PipelineTiles.tsx src/components/pipelines/portfolio/PipelineTiles.test.tsx
git commit -m "feat(pipelines): the tiles and the open-stage strip

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The toolbar and the Filters panel

**Files:**
- Create: `src/components/pipelines/portfolio/PipelineFilters.tsx` (`PipelineFilters`, `PipelineGroupSort`), `PipelineToolbar.tsx`
- Test: `src/components/pipelines/portfolio/PipelineToolbar.test.tsx`

**Interfaces:**
- Consumes: `FilterSheet`, `Check`, `Radio`, `FilterGroup`, `FILTER_SELECT`, `GroupSortFields`, `useSearchText` (Task 2); `BUTTON`, `PRIMARY`, `FOCUS`; `toggleIn` (`features/organizations/portfolioParams`); `pipelineGroupOptions`, `pipelineSortOptions`, `PRIORITY_CHOICES`, `NO_DEPARTMENT` (Task 4); `defaultStages`, `PipelineParams`, `PipelineView`, `DateFilter`, `PipelineGroupKey` (Task 5); `pipelineChips` (Task 5).
- Produces:

```ts
export function PipelineGroupSort(props: { kind: PipelineKind; view: PipelineView; params: PipelineParams; update: (patch: Partial<PipelineParams>) => void }): JSX.Element;
export function PipelineFilters(props: { kind; view; params; update; options: PipelineFilterOptions | null; isSm: boolean; onClose: () => void; onExport: () => void; exporting: boolean; onAdd: () => void; triggerRef?: RefObject<HTMLElement | null> }): JSX.Element;
export function PipelineToolbar(props: { kind; view; params; update; options: PipelineFilterOptions | null; isSm: boolean; onExport: () => void; exporting: boolean; onAdd: () => void; searchRef: RefObject<HTMLInputElement | null>; selectMode?: boolean; onToggleSelectMode?: () => void }): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pipelines/portfolio/PipelineToolbar.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PIPELINE_KINDS } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams, type PipelineView } from '../../../features/pipelines/pipelineParams';
import { PIPELINE_FILTER_OPTIONS } from '../../../features/pipelines/testPipelines';
import { PipelineToolbar } from './PipelineToolbar';

const OPTIONS = { ...PIPELINE_FILTER_OPTIONS, stages: [] };
const OPEN = ['discovery', 'qualification', 'solution_validation', 'proposal_price_review', 'negotiation'];

function renderToolbar(query = '', { view = 'list', isSm = true }: { view?: PipelineView; isSm?: boolean } = {}) {
  const update = vi.fn();
  const onExport = vi.fn();
  const onAdd = vi.fn();
  const onToggleSelectMode = vi.fn();
  const params = parsePipelineParams(new URLSearchParams(query));
  function Harness() {
    const searchRef = useRef<HTMLInputElement>(null);
    return (
      <PipelineToolbar
        kind={PIPELINE_KINDS[params.kind]}
        view={view}
        params={params}
        update={update}
        options={OPTIONS}
        isSm={isSm}
        onExport={onExport}
        exporting={false}
        onAdd={onAdd}
        searchRef={searchRef}
        onToggleSelectMode={onToggleSelectMode}
      />
    );
  }
  render(<Harness />);
  return { update, onExport, onAdd, onToggleSelectMode };
}

const dialog = () => screen.getByRole('dialog', { name: 'Filters' });

describe('PipelineToolbar (spec §1 "Toolbar")', () => {
  it('searches titles and organisation or account names, 300ms after typing stops', async () => {
    const { update } = renderToolbar();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by title, organization or account' }), 'emea');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ search: 'emea' }));
  });

  it("offers the kind's groups and sorts, and Export and Add from sm", async () => {
    const { update, onAdd } = renderToolbar();
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'None',
      'Stage',
      'Close month',
      'Organization or account',
      'Owner',
      'Department',
      'Priority',
    ]);
    expect(within(screen.getByRole('combobox', { name: 'Sort by' })).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'MRR',
      'Close date',
      'Priority',
      'Stage',
      'Title',
    ]);
    await userEvent.selectOptions(group, 'month');
    expect(update).toHaveBeenCalledWith({ group: 'month' });
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('filters by owner (with Not in your book), organisation, account, priority, department and date', async () => {
    const { update } = renderToolbar('owner=2&date=30');
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('2');
    const owner = within(dialog()).getByRole('combobox', { name: 'Owner' });
    expect(owner).toHaveFocus();
    expect(within(owner).getAllByRole('option').map((option) => option.textContent)).toEqual(['Everyone', 'Carl CSM', 'Priya', 'Not in your book', 'Unassigned']);
    await userEvent.selectOptions(owner, 'outside');
    expect(update).toHaveBeenLastCalledWith({ owner: 'outside' });
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Pizza Hut' }));
    expect(update).toHaveBeenLastCalledWith({ organisation: ['7'] });
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Pizza Hut EMEA' }));
    expect(update).toHaveBeenLastCalledWith({ account: ['12'] });
    await userEvent.click(within(within(dialog()).getByRole('group', { name: 'Priority' })).getByRole('checkbox', { name: 'High' }));
    expect(update).toHaveBeenLastCalledWith({ priority: ['high'] });
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Whole company' }));
    expect(update).toHaveBeenLastCalledWith({ department: ['none'] });
    const closes = within(dialog()).getByRole('group', { name: 'Closes' });
    expect(within(closes).getByRole('radio', { name: 'Within 30 days' })).toBeChecked();
    await userEvent.click(within(closes).getByRole('radio', { name: 'Overdue' }));
    expect(update).toHaveBeenLastCalledWith({ date: 'overdue' });
  });

  it('shows the open stages checked on the List; a closed stage is opt-in', async () => {
    const { update } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const stages = within(dialog()).getByRole('group', { name: 'Stage' });
    expect(within(stages).getByRole('checkbox', { name: 'Negotiation' })).toBeChecked();
    expect(within(stages).getByRole('checkbox', { name: 'Closed Won' })).not.toBeChecked();
    await userEvent.click(within(stages).getByRole('checkbox', { name: 'Closed Won' }));
    expect(update).toHaveBeenLastCalledWith({ stage: [...OPEN, 'closed_won'] });
    await userEvent.click(within(stages).getByRole('checkbox', { name: 'Discovery' }));
    expect(update).toHaveBeenLastCalledWith({ stage: OPEN.slice(1) });
  });

  it('shows every stage checked on the Board, whose groups have no None', async () => {
    const { update } = renderToolbar('', { view: 'board' });
    expect(within(screen.getByRole('combobox', { name: 'Group' })).queryByRole('option', { name: 'None' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const stages = within(dialog()).getByRole('group', { name: 'Stage' });
    expect(within(stages).getByRole('checkbox', { name: 'Closed Lost' })).toBeChecked();
    await userEvent.click(within(stages).getByRole('checkbox', { name: 'Closed Lost' }));
    expect(update).toHaveBeenLastCalledWith({ stage: [...OPEN, 'closed_won'] });
  });

  it('puts group, sort, Export and Add in the phone sheet, with a Select toggle in the bar', async () => {
    const { onExport, onToggleSelectMode } = renderToolbar('kind=risks', { isSm: false });
    expect(screen.queryByRole('combobox', { name: 'Group' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(onToggleSelectMode).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog()).getByRole('combobox', { name: 'Group' })).toBeInTheDocument();
    expect(within(dialog()).getByRole('group', { name: 'Due' })).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Add risk' })).toHaveClass('min-h-11');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/PipelineToolbar.test.tsx`
Expected: FAIL — `./PipelineToolbar` unresolved.

- [ ] **Step 3: Write `PipelineFilters.tsx`**

```tsx
// src/components/pipelines/portfolio/PipelineFilters.tsx
import { useId, useRef, type RefObject } from 'react';
import { Download, Plus } from 'lucide-react';
import { toggleIn } from '../../../features/organizations/portfolioParams';
import {
  NO_DEPARTMENT,
  PRIORITY_CHOICES,
  pipelineGroupOptions,
  pipelineSortOptions,
  type PipelineKind,
} from '../../../features/pipelines/pipelineKinds';
import {
  defaultStages,
  type DateFilter,
  type PipelineGroupKey,
  type PipelineParams,
  type PipelineView,
} from '../../../features/pipelines/pipelineParams';
import type { PipelineFilterOptions } from '../../../features/pipelines/pipelineTypes';
import { Check, FILTER_SELECT, FilterGroup, FilterSheet, GroupSortFields, Radio } from '../../organizations/portfolio/filterParts';
import { FOCUS, PRIMARY } from '../../organizations/portfolio/styles';

/** Group and sort with the kind's own choices; the Board offers no "None". */
export function PipelineGroupSort({
  kind,
  view,
  params,
  update,
}: {
  kind: PipelineKind;
  view: PipelineView;
  params: PipelineParams;
  update: (patch: Partial<PipelineParams>) => void;
}) {
  return (
    <GroupSortFields
      group={params.group || 'none'}
      sort={params.sort}
      groupOptions={pipelineGroupOptions(kind, view === 'board')}
      sortOptions={pipelineSortOptions(kind)}
      onGroup={(value) => update({ group: value === 'none' ? '' : (value as PipelineGroupKey) })}
      onSort={(sort) => update({ sort })}
    />
  );
}

/** Every filter from spec §1, applied at once (they write the URL), in the
 *  shared Filters frame: a popover from `sm`, a bottom sheet below it that
 *  also holds group, sort, Export and Add. The stage checkboxes show the
 *  view's default stages checked when the URL names none (List: open,
 *  Board: all; plan Decision 6); a choice equal to the default writes none. */
export function PipelineFilters({
  kind,
  view,
  params,
  update,
  options,
  isSm,
  onClose,
  onExport,
  exporting,
  onAdd,
  triggerRef,
}: {
  kind: PipelineKind;
  view: PipelineView;
  params: PipelineParams;
  update: (patch: Partial<PipelineParams>) => void;
  options: PipelineFilterOptions | null;
  isSm: boolean;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const ownerRef = useRef<HTMLSelectElement>(null);
  const ownerId = useId();
  const defaults = defaultStages(kind, view);
  const chosen = params.stage.length ? params.stage : defaults;
  const toggleStage = (value: string) => {
    const next = toggleIn(chosen, value);
    const isDefault = next.length === 0 || (next.length === defaults.length && next.every((stage) => defaults.includes(stage)));
    update({ stage: isDefault ? [] : kind.stages.map((stage) => stage.value).filter((stage) => next.includes(stage)) });
  };
  const dates: { value: DateFilter; label: string }[] = [
    { value: '', label: 'Any time' },
    { value: '30', label: 'Within 30 days' },
    { value: '90', label: 'Within 90 days' },
    { value: '180', label: 'Within 180 days' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'none', label: 'No date' },
  ];

  return (
    <FilterSheet isSm={isSm} onClose={onClose} triggerRef={triggerRef} initialFocusRef={ownerRef}>
      {!isSm ? (
        <div className="flex flex-wrap items-center gap-3">
          <PipelineGroupSort kind={kind} view={view} params={params} update={update} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={ownerId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Owner
        </label>
        {/* The server's options already include "Not in your book" and Unassigned. */}
        <select ref={ownerRef} id={ownerId} className={FILTER_SELECT} value={params.owner} onChange={(event) => update({ owner: event.target.value })}>
          <option value="">Everyone</option>
          {(options?.owners ?? []).map((owner) => (
            <option key={owner.value} value={owner.value}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>

      <FilterGroup legend="Organization">
        {options?.organisations.length ? (
          options.organisations.map((organisation) => (
            <Check
              key={organisation.value}
              label={organisation.name}
              checked={params.organisation.includes(organisation.value)}
              onChange={() => update({ organisation: toggleIn(params.organisation, organisation.value) })}
            />
          ))
        ) : (
          <p className="text-[13px] text-ink-muted">No organizations to filter by yet.</p>
        )}
      </FilterGroup>

      <FilterGroup legend="Account">
        {options?.accounts.length ? (
          options.accounts.map((account) => (
            <Check
              key={account.value}
              label={account.name}
              checked={params.account.includes(account.value)}
              onChange={() => update({ account: toggleIn(params.account, account.value) })}
            />
          ))
        ) : (
          <p className="text-[13px] text-ink-muted">No accounts to filter by yet.</p>
        )}
      </FilterGroup>

      <FilterGroup legend="Stage">
        {kind.stages.map((stage) => (
          <Check key={stage.value} label={stage.label} checked={chosen.includes(stage.value)} onChange={() => toggleStage(stage.value)} />
        ))}
      </FilterGroup>

      <FilterGroup legend="Priority">
        {PRIORITY_CHOICES.map((priority) => (
          <Check
            key={priority.value}
            label={priority.name}
            checked={params.priority.includes(priority.value)}
            onChange={() => update({ priority: toggleIn(params.priority, priority.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup legend="Department">
        {(options?.departments ?? []).map((department) => (
          <Check
            key={department.value}
            label={department.value === NO_DEPARTMENT ? 'Whole company' : department.name}
            checked={params.department.includes(department.value)}
            onChange={() => update({ department: toggleIn(params.department, department.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup legend={kind.dateVerb}>
        {dates.map((date) => (
          <Radio key={date.label} name="pipeline-date" label={date.label} checked={params.date === date.value} onChange={() => update({ date: date.value })} />
        ))}
      </FilterGroup>

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
          <button type="button" onClick={onAdd} className={`${PRIMARY} min-h-11 justify-center`}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {`Add ${kind.noun.one}`}
          </button>
        </div>
      ) : null}
    </FilterSheet>
  );
}
```

- [ ] **Step 4: Write `PipelineToolbar.tsx`**

```tsx
// src/components/pipelines/portfolio/PipelineToolbar.tsx
import { useCallback, useRef, useState, type RefObject } from 'react';
import { CheckSquare, Download, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { pipelineChips } from '../../../features/pipelines/pipelineChips';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineParams, PipelineView } from '../../../features/pipelines/pipelineParams';
import type { PipelineFilterOptions } from '../../../features/pipelines/pipelineTypes';
import { BUTTON, FOCUS, PRIMARY } from '../../organizations/portfolio/styles';
import { useSearchText } from '../../organizations/portfolio/useSearchText';
import { PipelineFilters, PipelineGroupSort } from './PipelineFilters';

const LABEL = 'Search by title, organization or account';

/** Search, group and sort, Filters (with a count of active filters),
 *  Export and Add from `sm`; below `sm` the bar is Search, Filters and the
 *  Select toggle, and the sheet holds the rest (the Organizations toolbar's
 *  shape). */
export function PipelineToolbar({
  kind,
  view,
  params,
  update,
  options,
  isSm,
  onExport,
  exporting,
  onAdd,
  searchRef,
  selectMode = false,
  onToggleSelectMode,
}: {
  kind: PipelineKind;
  view: PipelineView;
  params: PipelineParams;
  update: (patch: Partial<PipelineParams>) => void;
  options: PipelineFilterOptions | null;
  isSm: boolean;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Phones: selection mode is on (checkboxes show). The List only. */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
}) {
  const commitSearch = useCallback((search: string) => update({ search }), [update]);
  const [text, setText] = useSearchText(params.search, commitSearch);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = pipelineChips(params, null, kind).length;

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-sm">
        <span className="sr-only">{LABEL}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={isSm ? LABEL : 'Search'}
          className={`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong ${FOCUS}`}
        />
      </label>

      {isSm ? <PipelineGroupSort kind={kind} view={view} params={params} update={update} /> : null}

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
        className={BUTTON}
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        Filters
        {count > 0 ? <span className="rounded-full bg-accent px-1.5 font-mono-brand tabular-nums text-[11px] text-on-accent">{count}</span> : null}
      </button>

      {!isSm && onToggleSelectMode ? (
        <button type="button" aria-pressed={selectMode} onClick={onToggleSelectMode} className={`${BUTTON} ${selectMode ? 'bg-accent-dim' : ''}`}>
          <CheckSquare className="w-4 h-4" aria-hidden="true" />
          Select
        </button>
      ) : null}

      {isSm ? (
        <>
          <button type="button" onClick={onExport} disabled={exporting} className={BUTTON}>
            <Download className="w-4 h-4" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button type="button" onClick={onAdd} className={PRIMARY}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {`Add ${kind.noun.one}`}
          </button>
        </>
      ) : null}

      {open ? (
        <PipelineFilters
          kind={kind}
          view={view}
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
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/PipelineToolbar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/pipelines/portfolio/PipelineFilters.tsx src/components/pipelines/portfolio/PipelineToolbar.tsx src/components/pipelines/portfolio/PipelineToolbar.test.tsx
git commit -m "feat(pipelines): the toolbar and the Filters panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The List page, its frame and the kind switch

**Files:**
- Create: `src/components/pipelines/portfolio/usePipelineForms.ts`, `PipelineModals.tsx`, `PipelineKindSwitch.tsx`
- Create: `src/pages/pipelines/List.tsx`
- Create (test only): `src/pages/pipelines/testPages.tsx`
- Modify: `src/App.tsx` (the `/pipelines/list` route and its import)
- Modify: `src/components/layout/Navbar.tsx` (imports; `isPipelines`; `isFramed`; the Pipelines branch)
- Modify: `src/layouts/DashboardLayout.tsx` (`isPipelinesView`, the `p-0` condition)
- Modify: `src/components/layout/Navbar.test.tsx`, `src/layouts/DashboardLayout.test.tsx` (the example route, Decision 14)
- Test: `src/pages/pipelines/List.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–9; `useSelection`, `OrganizationsFrame`, `ConfirmDialog`, `fetchCustomers`, `deleteOpportunity`, `deleteRisk`, `countText`.
- Produces:

```ts
// usePipelineForms.ts
export function usePipelineForms(): {
  remember: (rows: PipelineRow[]) => void; titleOf: (id: number) => string;
  editing: PipelineRow | null; openEdit: (row: PipelineRow) => void; closeEdit: () => void;
  deleting: PipelineRow | null; requestDelete: (row: PipelineRow) => void; closeDelete: () => void;
  adding: { stage?: string } | null; openAdd: (stage?: string) => void; closeAdd: () => void;
  companies: { id: number; name: string }[];
};
export type PipelineForms = ReturnType<typeof usePipelineForms>;
// PipelineModals.tsx
export function PipelineModals(props: { kind: PipelineKind; forms: PipelineForms; onSaved: () => void }): JSX.Element;
// PipelineKindSwitch.tsx
export function PipelineKindSwitch(props: { variant: 'bar' | 'page' }): JSX.Element; // nav "Opportunities or risks"
// pages/pipelines/List.tsx
export function List(): JSX.Element;
// pages/pipelines/testPages.tsx (test only)
export function Where(): JSX.Element;
export function renderPipelines(url: string, options?: { width?: number; nav?: boolean }): { store };
```

- [ ] **Step 1: Write the test harness**

```tsx
// src/pages/pipelines/testPages.tsx
// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { List } from './List';

// Test-only. The Pipelines routes on the real auth, customers and
// notifications slices and the real router, as App.tsx routes them. Only
// fetch is stubbed, by the caller, with stubPipelines().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function makeStore() {
  return configureStore({
    reducer: {
      customers: customersReducer,
      auth: authReducer,
      notifications: notificationsReducer,
      files: filesReducer,
      calls: callsReducer,
    },
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

/** The Pipelines views on the real store and router. `nav` adds the real
 *  Navbar (List | Board and the kind switch). */
export function renderPipelines(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              path="/pipelines/list"
              element={
                <>
                  <List />
                  <Where />
                </>
              }
            />
            <Route path="/organizations/:id" element={<><p>Organization page</p><Where /></>} />
            <Route path="/accounts/:id" element={<><p>Account page</p><Where /></>} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

- [ ] **Step 2: Write the failing page test**

```tsx
// src/pages/pipelines/List.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pipelineBulkBodies, pipelineQueries, recordWrites, stubPipelines } from '../../features/pipelines/testPipelines';
import { resetViewport } from '../../test/viewport';
import { renderPipelines } from './testPages';

// Integration tier: the real page, store and router; fetch stubbed with the
// backend's shapes (features/pipelines/testPipelines.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
type Spy = ReturnType<typeof stubPipelines>;
const paths = (spy: Spy) => [...new Set(spy.mock.calls.map(([input]) => new URL(String(input)).pathname.replace(/^\/api\/v1/, '')))];

describe('Pipelines list', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('lists the open opportunities by stage under the tiles, reading only the book', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    expect(await screen.findByText('3 opportunities')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Open pipeline' })).toHaveTextContent('$7.3K MRR');
    // The section's heading (the tiles' stage strip has a Negotiation button too).
    expect(screen.getByRole('heading', { name: /^Negotiation/ })).toHaveTextContent('Negotiation · 1 · $2K');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Count' })).toBeNull();
    expect(paths(spy)).toEqual(['/pipelines/opportunities/']);
  });

  it('reads the risks with ?kind=risks', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list?kind=risks');
    expect(await screen.findByText('2 risks')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Admin left' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'MRR at risk' })).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities')).toEqual([]);
  });

  it('keeps the filters in the URL, with chips and "N of M"', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('combobox', { name: 'Owner' }), '3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(where().searchParams.get('owner')).toBe('3'));
    expect(await screen.findByText('1 of 3 opportunities')).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities').some((query) => query.get('owner') === '3')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Owner: Priya' }));
    await waitFor(() => expect(where().searchParams.get('owner')).toBeNull());
  });

  it('filters from a tile, and clears it from the same tile', async () => {
    stubPipelines();
    renderPipelines('/pipelines/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Overdue: 1' }));
    await waitFor(() => expect(where().searchParams.get('date')).toBe('overdue'));
    expect(await screen.findByRole('button', { name: 'Globex uplift' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'EMEA seats' })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Overdue: 1' }));
    await waitFor(() => expect(where().searchParams.get('date')).toBeNull());
  });

  it('opens an item in its form with its date, saves it and reads the book again', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA seats' }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
    const date = screen.getByLabelText('Expected close');
    expect(date).toHaveValue('2026-10-07');
    fireEvent.change(date, { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(recordWrites(spy)).toHaveLength(1));
    expect(recordWrites(spy)[0]).toMatchObject({ method: 'PATCH', path: '/opportunities/41/', body: { expected_close: '2026-11-01' } });
    expect(await screen.findByText('Closes in 32d')).toBeInTheDocument();
  });

  it('adds an opportunity on a chosen organisation', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    expect(screen.getByRole('heading', { name: 'Add Opportunity' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Pizza Hut' });
    await userEvent.selectOptions(screen.getByLabelText(/^Company/), '7');
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seats');
    await userEvent.click(screen.getByRole('button', { name: 'Add Opportunity' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'POST', path: '/opportunities/', body: expect.objectContaining({ customer_id: 7, title: 'Seats' }) }]));
    expect(await screen.findByRole('button', { name: 'Seats' })).toBeInTheDocument();
    expect(paths(spy)).toContain('/customers/');
  });

  it('deletes from the form after a confirmation', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Analytics add-on' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete Analytics add-on?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'DELETE', path: '/opportunities/42/', body: null }]));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Analytics add-on' })).toBeNull());
  });

  it('bulk-sets a stage, a department and a cleared date, naming what failed', async () => {
    const spy = stubPipelines({
      bulk: (_kind, body) => ({
        updated: body.ids.filter((id) => id !== 42),
        failed: body.ids.includes(42) ? [{ id: 42, reason: 'Not found.' }] : [],
      }),
    });
    renderPipelines('/pipelines/list?group=none');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Analytics add-on' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set stage' }), 'closed_lost');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')).toEqual([{ ids: [41, 42], action: 'set_stage', value: 'closed_lost' }]));
    expect(await within(bar).findByText('Updated 1 opportunity. 1 failed:')).toBeInTheDocument();
    expect(within(bar).getByText('Analytics add-on')).toBeInTheDocument();
    // The failure stays selected for a retry.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Analytics add-on' })).toBeChecked());
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set department' }), 'none');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')[1]).toEqual({ ids: [42], action: 'set_department', value: '' }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Clear date' }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')[2]).toEqual({ ids: [42], action: 'set_date', value: null }));
  });

  it('exports the view, and the selection by ids', async () => {
    const spy = stubPipelines();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPipelines('/pipelines/list?owner=2&group=none');
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }));
    const exports = () => spy.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith('/pipelines/opportunities/export.csv'));
    await waitFor(() => expect(exports()).toHaveLength(1));
    expect(exports()[0].searchParams.get('owner')).toBe('2');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exports()).toHaveLength(2));
    expect(exports()[1].search).toBe('?ids=41');
  });

  it('wears the framed bar: Pipelines, List | Board keeping the query, the kind switch, no avatar', async () => {
    stubPipelines();
    renderPipelines('/pipelines/list?owner=2&stage=negotiation', { nav: true });
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16');
    expect(screen.getByRole('heading', { name: 'Pipelines' })).toBeInTheDocument();
    const views = screen.getByRole('navigation', { name: 'Pipelines views' });
    expect(within(views).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/pipelines/board?owner=2&stage=negotiation');
    const kinds = screen.getByRole('navigation', { name: 'Opportunities or risks' });
    expect(header).toContainElement(kinds);
    expect(within(kinds).getByRole('link', { name: 'Opportunities' })).toHaveAttribute('aria-current', 'page');
    expect(within(kinds).getByRole('link', { name: 'Risks' })).toHaveAttribute('href', '/pipelines/list?owner=2&kind=risks');
    expect(screen.queryByAltText('Alice')).toBeNull();
    await userEvent.click(within(kinds).getByRole('link', { name: 'Risks' }));
    // Owner 2 stays; the stage (an opportunity's) goes.
    expect(await screen.findByText('1 of 2 risks')).toBeInTheDocument();
  });

  it('works on a phone: the kind switch leads the page, targets are 44px', async () => {
    stubPipelines();
    renderPipelines('/pipelines/list', { width: 375 });
    const kinds = await screen.findByRole('navigation', { name: 'Opportunities or risks' });
    expect(within(kinds).getByRole('link', { name: 'Risks' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveClass('min-h-11');
    expect(await screen.findByRole('button', { name: 'EMEA seats' })).toHaveClass('min-h-11');
    await userEvent.click(within(kinds).getByRole('link', { name: 'Risks' }));
    await waitFor(() => expect(where().searchParams.get('kind')).toBe('risks'));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines/List.test.tsx`
Expected: FAIL — `./List` unresolved.

- [ ] **Step 4: Write the form wiring**

```ts
// src/components/pipelines/portfolio/usePipelineForms.ts
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchCustomers } from '../../../features/customers/customersSlice';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';

/** What both Pipelines views need to add, edit and delete with the existing
 *  forms: every loaded row remembered by id (a bulk report names it), the
 *  row being edited (the form is built from it, plan Decision 2), the one
 *  being deleted, and the organisations Add picks from (read when Add opens,
 *  as on Accounts). */
export function usePipelineForms() {
  const dispatch = useAppDispatch();
  // Written in fetch callbacks, read in event handlers.
  const rows = useRef(new Map<number, PipelineRow>());
  const remember = useCallback((list: PipelineRow[]) => {
    for (const row of list) rows.current.set(row.id, row);
  }, []);
  const titleOf = useCallback((id: number) => rows.current.get(id)?.title ?? `Item ${id}`, []);

  const [editing, setEditing] = useState<PipelineRow | null>(null);
  const openEdit = useCallback((row: PipelineRow) => setEditing(row), []);
  const closeEdit = useCallback(() => setEditing(null), []);

  const [deleting, setDeleting] = useState<PipelineRow | null>(null);
  const requestDelete = useCallback((row: PipelineRow) => {
    setEditing(null);
    setDeleting(row);
  }, []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const customers = useAppSelector((state) => state.customers.customers);
  const companies = useMemo(() => customers.map((customer) => ({ id: customer.id, name: customer.name })), [customers]);
  const [adding, setAdding] = useState<{ stage?: string } | null>(null);
  const openAdd = useCallback(
    (stage?: string) => {
      void dispatch(fetchCustomers());
      setAdding({ stage });
    },
    [dispatch],
  );
  const closeAdd = useCallback(() => setAdding(null), []);

  return { remember, titleOf, editing, openEdit, closeEdit, deleting, requestDelete, closeDelete, adding, openAdd, closeAdd, companies };
}

export type PipelineForms = ReturnType<typeof usePipelineForms>;
```

```tsx
// src/components/pipelines/portfolio/PipelineModals.tsx
import { useAppDispatch } from '../../../hooks';
import { deleteOpportunity, deleteRisk, type Opportunity, type Risk } from '../../../features/customers/customersSlice';
import { opportunityRecord, riskRecord, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import { ConfirmDialog } from '../../organizations/ConfirmDialog';
import { OpportunityFormModal } from '../OpportunityFormModal';
import { RiskFormModal } from '../RiskFormModal';
import type { PipelineForms } from './usePipelineForms';

/** The existing Opportunity / Risk forms and the delete confirmation, for
 *  the kind on screen. Every save and delete reloads the page's book. */
export function PipelineModals({ kind, forms, onSaved }: { kind: PipelineKind; forms: PipelineForms; onSaved: () => void }) {
  const dispatch = useAppDispatch();
  const { adding, editing, deleting } = forms;
  const confirm = deleting ? (
    <ConfirmDialog
      title={`Delete ${deleting.title}?`}
      message="This can't be undone."
      confirmLabel="Delete"
      danger
      onConfirm={async () => {
        if (kind.key === 'opportunities') await dispatch(deleteOpportunity(deleting.id)).unwrap();
        else await dispatch(deleteRisk(deleting.id)).unwrap();
        onSaved();
      }}
      onClose={forms.closeDelete}
    />
  ) : null;

  if (kind.key === 'opportunities') {
    return (
      <>
        {adding ? (
          <OpportunityFormModal
            companies={forms.companies}
            defaultStage={adding.stage as Opportunity['stage'] | undefined}
            onClose={forms.closeAdd}
            onSaved={onSaved}
          />
        ) : null}
        {editing ? (
          <OpportunityFormModal
            opportunity={opportunityRecord(editing)}
            onClose={forms.closeEdit}
            onSaved={onSaved}
            onDeleteRequest={() => forms.requestDelete(editing)}
          />
        ) : null}
        {confirm}
      </>
    );
  }
  return (
    <>
      {adding ? (
        <RiskFormModal companies={forms.companies} defaultStage={adding.stage as Risk['stage'] | undefined} onClose={forms.closeAdd} onSaved={onSaved} />
      ) : null}
      {editing ? (
        <RiskFormModal risk={riskRecord(editing)} onClose={forms.closeEdit} onSaved={onSaved} onDeleteRequest={() => forms.requestDelete(editing)} />
      ) : null}
      {confirm}
    </>
  );
}
```

- [ ] **Step 5: Write the kind switch**

```tsx
// src/components/pipelines/portfolio/PipelineKindSwitch.tsx
import { Link, useLocation } from 'react-router-dom';
import { PIPELINE_KINDS } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams, withKind } from '../../../features/pipelines/pipelineParams';
import type { PipelineKindKey } from '../../../features/pipelines/pipelineTypes';
import { FOCUS } from '../../organizations/portfolio/styles';

const KEYS: PipelineKindKey[] = ['opportunities', 'risks'];

/** Opportunities | Risks (spec §1): in the top bar from `sm` (`bar`), and
 *  as the page's first row below `sm` (`page`; plan Decision 5). Each link
 *  keeps the view and the shared filters (`withKind`). */
export function PipelineKindSwitch({ variant }: { variant: 'bar' | 'page' }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const current = parsePipelineParams(search).kind;
  return (
    <nav
      aria-label="Opportunities or risks"
      className={variant === 'bar' ? 'flex rounded-lg border border-line p-0.5' : 'grid grid-cols-2 gap-1 rounded-lg border border-line p-0.5'}
    >
      {KEYS.map((key) => {
        const next = withKind(search, key).toString();
        const active = current === key;
        return (
          <Link
            key={key}
            to={{ pathname: location.pathname, search: next ? `?${next}` : '' }}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex ${variant === 'bar' ? 'min-h-9' : 'min-h-11'} items-center justify-center rounded-md px-3 text-[13px] font-semibold ${FOCUS} ${
              active ? 'bg-subtle text-ink' : 'text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle'
            }`}
          >
            {PIPELINE_KINDS[key].title}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 6: Write the List page**

```tsx
// src/pages/pipelines/List.tsx
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { countText } from '../../features/organizations/filterChips';
import { bulkUpdatePipeline, exportPipeline } from '../../features/pipelines/pipelineApi';
import { pipelineChips } from '../../features/pipelines/pipelineChips';
import { DEPARTMENT_CHOICES, NO_DEPARTMENT, PIPELINE_KINDS, PRIORITY_CHOICES, stageTargets } from '../../features/pipelines/pipelineKinds';
import { hasPipelineFilters, pipelineApiQuery, type PipelineParams } from '../../features/pipelines/pipelineParams';
import type { PipelineBulkAction } from '../../features/pipelines/pipelineTypes';
import { ChipRow } from '../../components/organizations/portfolio/FilterChips';
import { CLEAR_DATE, SelectionActionsBar, type BulkReport } from '../../components/organizations/portfolio/SelectionActionsBar';
import { FOCUS } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useSelection } from '../../components/organizations/portfolio/useSelection';
import { PipelineItem } from '../../components/pipelines/portfolio/PipelineItem';
import { PipelineKindSwitch } from '../../components/pipelines/portfolio/PipelineKindSwitch';
import { PipelineModals } from '../../components/pipelines/portfolio/PipelineModals';
import { PipelineSections, type PipelineItemRenderer } from '../../components/pipelines/portfolio/PipelineSections';
import { PipelineTiles } from '../../components/pipelines/portfolio/PipelineTiles';
import { PipelineToolbar } from '../../components/pipelines/portfolio/PipelineToolbar';
import { usePipelineBook } from '../../components/pipelines/portfolio/usePipelineBook';
import { usePipelineForms } from '../../components/pipelines/portfolio/usePipelineForms';
import { usePipelineParams } from '../../components/pipelines/portfolio/usePipelineParams';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const DISMISS = `inline-flex w-11 h-11 sm:w-8 sm:h-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

/** What the bulk endpoint takes for a choice (plan Decision 13): the whole
 *  company is '', a cleared date is null. */
function bulkValue(action: PipelineBulkAction, value: string): string | null {
  if (action === 'set_department' && value === NO_DEPARTMENT) return '';
  if (action === 'set_date' && value === CLEAR_DATE) return null;
  return value;
}

/** /pipelines/list (spec 2026-09-30 §1): one book of opportunities or risks
 *  across organisations and accounts. Items, groups, tiles and totals come
 *  from GET /pipelines/<kind>/; every filter, sort and group is URL state;
 *  bulk edits go to POST /pipelines/<kind>/bulk/. Keyed on the kind, so
 *  nothing (a selection, an open form) crosses from one kind to the other. */
export function List() {
  const { params } = usePipelineParams();
  return <PipelinesList key={params.kind} />;
}

function PipelinesList() {
  const { params, update, clearFilters } = usePipelineParams();
  const kind = PIPELINE_KINDS[params.kind];
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = usePipelineForms();
  const book = usePipelineBook(kind, params, 'list', version, forms.remember);
  const selection = useSelection();
  const { prune, clear: clearSelection } = selection;
  const searchRef = useRef<HTMLInputElement>(null);
  const grouped = params.group !== '';

  // The portfolios' selection rule: a different list landing clears it when
  // grouped and prunes it to page one when flat; a reload of the same query
  // keeps it, so failed ids stay selected for a retry. Adjusted during render.
  const { loadedQuery } = book;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  const [report, setReport] = useState<BulkReport | null>(null);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    if (grouped) clearSelection();
    else prune(book.rows.map((row) => row.id));
    setReport(null);
  }
  // Read by runBulk after its await: the query that is loaded by then.
  const loadedQueryRef = useRef(loadedQuery);
  useLayoutEffect(() => {
    loadedQueryRef.current = loadedQuery;
  });

  const [exporting, setExporting] = useState(false);
  const [actionRunning, setActionRunning] = useState(false);
  // Phones: the toolbar's Select toggle shows the checkboxes.
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

  const currency = book.data?.currency ?? orgCurrency;
  const options = book.data?.filters ?? null;
  const failed = !book.data && book.error !== null;
  const chips = pipelineChips(params, options, kind);

  const runExport = async (query: string) => {
    setExporting(true);
    setNotice(null);
    try {
      await exportPipeline(kind.key, query);
    } catch (err) {
      setNotice(errorMessage(err, `Could not export ${kind.noun.many}.`));
    } finally {
      setExporting(false);
    }
  };

  const runBulk = async (action: PipelineBulkAction, value: string | null) => {
    const ids = [...selection.selected];
    const startQuery = loadedQueryRef.current;
    setActionRunning(true);
    setReport(null);
    try {
      const result = await bulkUpdatePipeline(kind.key, { ids, action, value });
      setReport({
        updated: result.updated.length,
        failed: result.failed.map((failure) => ({ ...failure, name: forms.titleOf(failure.id) })),
      });
      // Failures stay selected for a retry, unless a different list landed meanwhile.
      if (loadedQueryRef.current === startQuery) selection.replace(result.failed.map((failure) => failure.id));
      else selection.clear();
    } catch (err) {
      setReport({ updated: 0, failed: [], error: errorMessage(err, `Could not update these ${kind.noun.many}.`) });
    } finally {
      setActionRunning(false);
      reload();
    }
  };

  const applyFilter = (patch: Partial<PipelineParams>) => {
    update(patch);
    searchRef.current?.focus();
  };

  const renderItem: PipelineItemRenderer = (row, { loading }) => (
    <PipelineItem
      key={row.id}
      row={row}
      kind={kind}
      currency={currency}
      selecting={selecting}
      selected={selection.selected.has(row.id)}
      selectDisabled={loading || book.loading || actionRunning}
      atLimit={selection.atLimit}
      onToggleSelect={selection.toggle}
      onOpen={forms.openEdit}
    />
  );

  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        {!isSm ? <PipelineKindSwitch variant="page" /> : null}
        {/* Containers: the tiles and items follow this column, not the window. */}
        <div className="@container">
          <PipelineTiles kind={kind} summary={book.data?.summary ?? null} failed={failed} currency={currency} params={params} onFilter={update} />
        </div>
        <PipelineToolbar
          kind={kind}
          view="list"
          params={params}
          update={update}
          options={options}
          isSm={isSm}
          onExport={() => void runExport(pipelineApiQuery(params, 'list'))}
          exporting={exporting}
          onAdd={() => forms.openAdd()}
          searchRef={searchRef}
          selectMode={selecting}
          onToggleSelectMode={toggleSelectMode}
        />
        <ChipRow
          chips={chips}
          status={countText(book.data?.count ?? null, book.total, chips.length > 0, failed, kind.noun)}
          onChange={applyFilter}
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
        <div className="@container">
          <PipelineSections
            kind={kind}
            params={params}
            version={version}
            book={book}
            currency={currency}
            filtered={hasPipelineFilters(params)}
            renderItem={renderItem}
            onRowsLoaded={forms.remember}
            onClearFilters={clearFilters}
            onAdd={() => forms.openAdd()}
          />
        </div>
        <SelectionActionsBar
          count={selection.selected.size}
          noun={kind.noun}
          choices={[
            { key: 'set_stage', label: 'Set stage', options: stageTargets(kind) },
            { key: 'set_priority', label: 'Set priority', options: PRIORITY_CHOICES },
            { key: 'set_department', label: 'Set department', options: DEPARTMENT_CHOICES },
          ]}
          dateChoice={{ key: 'set_date', label: 'Set date', clearLabel: 'Clear date' }}
          activity={actionRunning ? 'applying' : exporting ? 'exporting' : null}
          loading={book.loading}
          report={report}
          onApply={(key, value) => {
            const action = key as PipelineBulkAction;
            void runBulk(action, bulkValue(action, value));
          }}
          onExport={() => void runExport(new URLSearchParams({ ids: [...selection.selected].join(',') }).toString())}
          onClose={endSelection}
        />
      </div>
      <PipelineModals kind={kind} forms={forms} onSaved={reload} />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 7: Route it, and frame it**

1. `src/App.tsx`: add `import { List as PipelinesList } from './pages/pipelines/List';` beside the Accounts imports, and change `<Route path="list" element={<PipelinesPage view="list" />} />` to `<Route path="list" element={<PipelinesList />} />`. (The Board route moves in Task 11.)
2. `src/layouts/DashboardLayout.tsx`: after the `isAccountsView` constant add

```ts
  // The Pipelines list and board wear the Organizations frame too (pipelines
  // spec 2026-09-30 §1), whose own px-4 pb-4 gutters them.
  const isPipelinesView = /^\/pipelines\/(list|board)\/?$/.test(location.pathname);
```

   and add `|| isPipelinesView` after `isAccountsView` inside the `p-0` condition.
3. `src/components/layout/Navbar.tsx`:
   - add `import { SM, useMediaQuery } from '../../lib/useMediaQuery';` and `import { PipelineKindSwitch } from '../pipelines/portfolio/PipelineKindSwitch';` to the imports;
   - after `const { setSlot } = useContext(NavActionsSlotContext);` add `const isSm = useMediaQuery(SM);`;
   - replace `const isPipelines = location.pathname.startsWith('/pipelines');` with

```ts
  // The Pipelines list and board wear the Organizations frame (pipelines spec
  // 2026-09-30 §1): the transparent bar, "Pipelines", List | Board carrying
  // the query, Opportunities | Risks from sm (the page shows it below sm),
  // the actions slot (empty until delivery 2's Ask) and no avatar.
  const isPipelinesView = /^\/pipelines\/(list|board)\/?$/.test(location.pathname);
```

   - add `|| isPipelinesView` to the end of `isFramed`;
   - replace the whole `) : isPipelines ? ( <> … </> ) : isSettings ? (` branch (the old ChevronDown title and the two bordered NavLinks) with:

```tsx
        ) : isPipelinesView ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Pipelines</h1>
            <nav aria-label="Pipelines views" className="flex items-center gap-4 h-full">
              {[
                { to: '/pipelines/list', label: 'List' },
                { to: '/pipelines/board', label: 'Board' },
              ].map((view) => (
                <NavLink
                  key={view.to}
                  // The two views share their URL state (kind, filters, sort,
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
            {isSm ? <PipelineKindSwitch variant="bar" /> : null}
          </div>
        ) : isSettings ? (
```

4. Move the two tests' example of an unframed page (Decision 14):

```bash
sed -i '' "s#'/pipelines/board'#'/users'#g; s#path=\"/pipelines/board\"#path=\"/users\"#; s#Pipelines Marker#Users Marker#g" src/components/layout/Navbar.test.tsx
sed -i '' "s#renderAt('/pipelines/board')#renderAt('/users')#" src/layouts/DashboardLayout.test.tsx
```

   and in `src/layouts/DashboardLayout.test.tsx` add to the `it.each` list, after `'/accounts/abc',`:

```ts
    // The Pipelines list and board, framed like Accounts' (pipelines spec
    // 2026-09-30 §1).
    '/pipelines/list',
    '/pipelines/board',
```

- [ ] **Step 8: Run the page, frame and layout tests**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines/List.test.tsx src/components/layout src/layouts src/components/pipelines`
Expected: PASS.

- [ ] **Step 9: Typecheck, lint and commit**

Run: `npx tsc -b && npx eslint src/pages/pipelines src/components/pipelines src/components/layout src/layouts src/App.tsx`

```bash
git add src/pages/pipelines/List.tsx src/pages/pipelines/List.test.tsx src/pages/pipelines/testPages.tsx src/components/pipelines/portfolio src/App.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat(pipelines): the List as one book of opportunities or risks, framed with both switches

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The Board

**Files:**
- Create: `src/components/pipelines/portfolio/pipelineMove.ts`, `usePipelineMove.ts`, `PipelineCard.tsx`, `PipelineColumn.tsx`, `PipelineBoard.tsx`
- Create: `src/pages/pipelines/Board.tsx`
- Modify: `src/pages/pipelines/testPages.tsx` (the Board route), `src/App.tsx` (the `/pipelines/board` route; the `PipelinesPage` import goes)
- Test: `src/components/pipelines/portfolio/pipelineMove.test.ts`, `src/pages/pipelines/Board.test.tsx`

**Interfaces:**
- Consumes: `useOverlayActive` (`organizations/portfolio/boardMove.ts`), `BoardSkeleton`, `CardSkeleton`, `MoveToMenu` (Task 2), `usePagedRead` (Task 1), `useEndSentinel`, `EmptyState`, `ErrorBlock`, `MoreButton`; `rowWithStage`, `stageLabel`, `withArticle`, `dateText` (Task 4); `pipelineApiQuery`, `boardPipelineParams` (Task 5); `itemParts` (Task 6); `usePipelineBook`, `PIPELINE_SECTION_SIZE` (Task 7); `PipelineTiles` (Task 8); `PipelineToolbar` (Task 9); `usePipelineForms`, `PipelineModals`, `PipelineKindSwitch`, `renderPipelines` (Task 10); `updateOpportunity`, `updateRisk`.
- Produces:

```ts
// pipelineMove.ts
export interface PipelineMove { token: number; row: PipelineRow; from: string; to: string; saved?: boolean }
export interface PipelineColumnSpec { key: string; label: string; count: number; mrr: number; collapsible: boolean }
export function pipelineColumns(group: PipelineGroupKey, groups: PipelineGroup[], kind: PipelineKind): PipelineColumnSpec[];
export function withPipelineMove(spec: PipelineColumnSpec, move: PipelineMove | null): PipelineColumnSpec;
export function withMovedPipelineRow(rows: PipelineRow[], key: string, move: PipelineMove | null, kind: PipelineKind): PipelineRow[];
// usePipelineMove.ts
export interface PipelineMoveState { move: PipelineMove | null; saving: boolean; busy: boolean; notice: string | null; error: string | null; moveTo: (row: PipelineRow, to: string) => void; dismissError: () => void; settle: (token: number) => void; reset: () => void }
export function usePipelineMove(kind: PipelineKind, onSaved: (move: PipelineMove) => void): PipelineMoveState;
// PipelineCard.tsx, PipelineColumn.tsx, PipelineBoard.tsx: see the code
// pages/pipelines/Board.tsx
export function Board(): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/pipelines/portfolio/pipelineMove.test.ts
import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { analyticsAddOn, emeaSeats } from '../../../features/pipelines/testPipelines';
import { pipelineColumns, withMovedPipelineRow, withPipelineMove } from './pipelineMove';

const GROUPS = [
  { key: 'discovery', label: 'Discovery', count: 1, mrr: 300 },
  { key: 'negotiation', label: 'Negotiation', count: 1, mrr: 2000 },
];
const MOVE = { token: 1, row: emeaSeats, from: 'negotiation', to: 'closed_won' };

describe('the Pipelines Board columns', () => {
  it('gives every stage a column by stage, empty ones included, with Closed Lost collapsible', () => {
    const columns = pipelineColumns('stage', GROUPS, OPPORTUNITIES_KIND);
    expect(columns.map((column) => `${column.label} ${column.count}`)).toEqual([
      'Discovery 1',
      'Qualification 0',
      'Solution Validation 0',
      'Proposal / Price Review 0',
      'Negotiation 1',
      'Closed Won 0',
      'Closed Lost 0',
    ]);
    expect(columns.filter((column) => column.collapsible).map((column) => column.key)).toEqual(['closed_lost']);
    expect(pipelineColumns('priority', [{ key: 'high', label: 'High', count: 2, mrr: 5 }], OPPORTUNITIES_KIND)).toEqual([
      { key: 'high', label: 'High', count: 2, mrr: 5, collapsible: false },
    ]);
  });

  it('moves one item and its MRR between the two columns a move touches', () => {
    const [negotiation, won] = [
      { key: 'negotiation', label: 'Negotiation', count: 1, mrr: 2000, collapsible: false },
      { key: 'closed_won', label: 'Closed Won', count: 0, mrr: 0, collapsible: false },
    ];
    expect(withPipelineMove(negotiation, MOVE)).toMatchObject({ count: 0, mrr: 0 });
    expect(withPipelineMove(won, MOVE)).toMatchObject({ count: 1, mrr: 2000 });
    expect(withPipelineMove(won, null)).toBe(won);
  });

  it('shows the moved card on top of its new column, in its new stage, and nowhere else', () => {
    expect(withMovedPipelineRow([emeaSeats, analyticsAddOn], 'negotiation', MOVE, OPPORTUNITIES_KIND).map((row) => row.id)).toEqual([42]);
    const [moved, ...rest] = withMovedPipelineRow([analyticsAddOn], 'closed_won', MOVE, OPPORTUNITIES_KIND);
    expect(moved).toMatchObject({ id: 41, stage: { value: 'closed_won', label: 'Closed Won' }, open: false, signal: null });
    expect(rest.map((row) => row.id)).toEqual([42]);
  });
});
```

```tsx
// src/pages/pipelines/Board.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pipelineQueries, recordWrites, stubPipelines } from '../../features/pipelines/testPipelines';
import { resetViewport } from '../../test/viewport';
import { renderPipelines } from './testPages';

const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
/** A column once the frame has landed (before it, there are none). */
async function findColumn(key: string): Promise<HTMLElement> {
  await waitFor(() => expect(column(key)).not.toBeNull());
  return column(key);
}
const ALL = 'discovery,qualification,solution_validation,proposal_price_review,negotiation,closed_won,closed_lost';

describe('Pipelines board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('shows every stage as a column, reading every stage, with Closed Lost collapsed until shown', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    expect(await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(await screen.findByText('5 opportunities')).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities')[0].get('stage')).toBe(ALL);
    expect(within(column('closed_won')).getByRole('heading')).toHaveTextContent('Closed Won · 1 · $1.5K');
    expect(await within(column('closed_won')).findByRole('button', { name: 'Initech expansion' })).toBeInTheDocument();
    expect(within(column('closed_lost')).getByRole('heading')).toHaveTextContent('Closed Lost · 1 · $800');
    expect(within(column('closed_lost')).queryByRole('button', { name: 'Hooli pilot' })).toBeNull();
    await userEvent.click(within(column('closed_lost')).getByRole('button', { name: 'Show Closed Lost' }));
    expect(await within(column('closed_lost')).findByRole('button', { name: 'Hooli pilot' })).toBeInTheDocument();
    await userEvent.click(within(column('closed_lost')).getByRole('button', { name: 'Hide Closed Lost' }));
    expect(within(column('closed_lost')).queryByRole('button', { name: 'Hooli pilot' })).toBeNull();
  });

  it('moves a card with Move to…, saving its stage and landing it in its new column', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'Move EMEA seats to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move EMEA seats to' })).getByRole('menuitem', { name: 'Closed Won' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'closed_won' } }]));
    expect(await within(column('closed_won')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    await waitFor(() => expect(within(column('negotiation')).queryByRole('button', { name: 'EMEA seats' })).toBeNull());
    expect(screen.getByText('Moved EMEA seats to Closed Won.')).toBeInTheDocument();
  });

  it('puts a card back, with the reason, when its save fails', async () => {
    stubPipelines({ patch: () => ({ status: 400, body: { detail: 'Stage is locked.' } }) });
    renderPipelines('/pipelines/board');
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'Move EMEA seats to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move EMEA seats to' })).getByRole('menuitem', { name: 'Closed Won' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't move EMEA seats to Closed Won.");
    expect(within(column('negotiation')).getByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(within(column('closed_won')).queryByRole('button', { name: 'EMEA seats' })).toBeNull();
  });

  it('drags a card onto another column on desktop', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    const card = (await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).closest('li') as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(card);
    fireEvent.dragOver(column('discovery'));
    fireEvent.drop(column('discovery'));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'discovery' } }]));
  });

  it('offers no moves when grouped by something else, and opens a card in its form', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board?group=priority');
    const high = await findColumn('high');
    await within(high).findByRole('button', { name: 'EMEA seats' });
    expect(within(high).queryByRole('button', { name: 'Move EMEA seats to…' })).toBeNull();
    await userEvent.click(within(high).getByRole('button', { name: 'EMEA seats' }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
  });

  it("adds a risk to a column's stage", async () => {
    stubPipelines();
    renderPipelines('/pipelines/board?kind=risks');
    await userEvent.click(await screen.findByRole('button', { name: 'Add risk to Mitigated' }));
    expect(screen.getByRole('heading', { name: 'Add Risk' })).toBeInTheDocument();
    expect(screen.getByLabelText('Stage')).toHaveValue('mitigated');
  });

  it('works on a phone: column tabs, and Move to… in place of a drag', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board', { width: 375 });
    const tabs = await screen.findByRole('navigation', { name: 'Board columns' });
    expect(within(tabs).getAllByRole('button').map((tab) => tab.textContent)).toEqual([
      'Discovery 1',
      'Qualification 0',
      'Solution Validation 0',
      'Proposal / Price Review 1',
      'Negotiation 1',
      'Closed Won 1',
      'Closed Lost 1',
    ]);
    const card = (await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).closest('li') as HTMLElement;
    expect(card).not.toHaveAttribute('draggable', 'true');
    expect(within(card).getByRole('button', { name: 'Move EMEA seats to…' })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/pipelineMove.test.ts src/pages/pipelines/Board.test.tsx`
Expected: FAIL — unresolved imports; no Board route.

- [ ] **Step 3: Write `pipelineMove.ts` and `usePipelineMove.ts`**

```ts
// src/components/pipelines/portfolio/pipelineMove.ts
import { rowWithStage, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineGroupKey } from '../../../features/pipelines/pipelineParams';
import type { PipelineGroup, PipelineRow } from '../../../features/pipelines/pipelineTypes';

/** One item moving between stage columns. `token` is unique per move, so a
 *  column can tell a new move from one it has already seen. */
export interface PipelineMove {
  token: number;
  row: PipelineRow;
  from: string;
  to: string;
  /** The PATCH has succeeded; the move now waits for its reloads to land. */
  saved?: boolean;
}

export interface PipelineColumnSpec {
  /** The group key: the column's `group_value`. */
  key: string;
  label: string;
  count: number;
  mrr: number;
  /** Starts collapsed on the Board (Closed Lost; spec §1). */
  collapsible: boolean;
}

/** The Board's columns. By stage, every stage is a column in board order,
 *  empty ones included, so there is always somewhere to drop (`groups` lists
 *  only non-empty ones). Any other grouping shows the server's groups. */
export function pipelineColumns(group: PipelineGroupKey, groups: PipelineGroup[], kind: PipelineKind): PipelineColumnSpec[] {
  if (group !== 'stage') return groups.map((g) => ({ key: g.key, label: g.label, count: g.count, mrr: g.mrr, collapsible: false }));
  return kind.stages.map((stage) => {
    const found = groups.find((g) => g.key === stage.value);
    return {
      key: stage.value,
      label: stage.label,
      count: found?.count ?? 0,
      mrr: found?.mrr ?? 0,
      collapsible: kind.collapsedStages.includes(stage.value),
    };
  });
}

/** A column header with a move applied: one item and its MRR out of
 *  `from`, into `to`. */
export function withPipelineMove(spec: PipelineColumnSpec, move: PipelineMove | null): PipelineColumnSpec {
  if (!move) return spec;
  if (spec.key === move.from) return { ...spec, count: Math.max(0, spec.count - 1), mrr: spec.mrr - move.row.mrr };
  if (spec.key === move.to) return { ...spec, count: spec.count + 1, mrr: spec.mrr + move.row.mrr };
  return spec;
}

/** A column's cards with a move applied: the moved card leaves every column
 *  but its new one, where it sits on top, once, reading as its new stage. */
export function withMovedPipelineRow(rows: PipelineRow[], key: string, move: PipelineMove | null, kind: PipelineKind): PipelineRow[] {
  if (!move) return rows;
  const others = rows.filter((row) => row.id !== move.row.id);
  if (key !== move.to) return others;
  return [rowWithStage(move.row, move.to, kind), ...others];
}
```

```ts
// src/components/pipelines/portfolio/usePipelineMove.ts
import { useCallback, useRef, useState } from 'react';
import { useAppDispatch } from '../../../hooks';
import { updateOpportunity, updateRisk, type Opportunity, type Risk } from '../../../features/customers/customersSlice';
import { stageLabel, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import type { PipelineMove } from './pipelineMove';

export interface PipelineMoveState {
  /** The current move: shown at once, marked `saved` on success, kept until
   *  the board reports every reload it triggered has landed (`settle`).
   *  Null after a failure, so the card goes back. */
  move: PipelineMove | null;
  saving: boolean;
  /** A move is saving or settling: one at a time. */
  busy: boolean;
  /** "Moved EMEA seats to Closed Won.", for a polite live region. */
  notice: string | null;
  /** The failure, ending with the server's reason. */
  error: string | null;
  moveTo: (row: PipelineRow, to: string) => void;
  dismissError: () => void;
  settle: (token: number) => void;
  reset: () => void;
}

/** Moving one item between stage columns (spec §1 "dragging a card sets its
 *  stage"): optimistic, one at a time, saved through the item's own PATCH
 *  (the slice's updateOpportunity / updateRisk, which the Deals & risks
 *  boards use too), rolled back with the server's reason. The Organizations
 *  board's useBoardMove, for stages instead of lifecycles. */
export function usePipelineMove(kind: PipelineKind, onSaved: (move: PipelineMove) => void): PipelineMoveState {
  const dispatch = useAppDispatch();
  const [move, setMove] = useState<PipelineMove | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const moveTo = useCallback(
    (row: PipelineRow, to: string) => {
      const from = row.stage.value;
      if (to === from || saving || move !== null) return;
      setError(null);
      setNotice(null);
      tokenRef.current += 1;
      const next: PipelineMove = { token: tokenRef.current, row, from, to };
      setMove(next);
      setSaving(true);
      const label = stageLabel(kind, to);
      const save: Promise<unknown> =
        kind.key === 'opportunities'
          ? dispatch(updateOpportunity({ id: row.id, stage: to as Opportunity['stage'] })).unwrap()
          : dispatch(updateRisk({ id: row.id, stage: to as Risk['stage'] })).unwrap();
      save
        .then(
          () => {
            setMove((current) => (current?.token === next.token ? { ...current, saved: true } : current));
            setNotice(`Moved ${row.title} to ${label}.`);
            onSaved(next);
          },
          (reason: unknown) => {
            setMove((current) => (current?.token === next.token ? null : current));
            const why = typeof reason === 'string' ? reason : `Could not update ${kind.noun.one}.`;
            setError(`Couldn't move ${row.title} to ${label}. ${why}`);
          },
        )
        .finally(() => setSaving(false));
    },
    [dispatch, kind, move, onSaved, saving],
  );

  const dismissError = useCallback(() => setError(null), []);
  const settle = useCallback((token: number) => setMove((current) => (current?.token === token ? null : current)), []);
  const reset = useCallback(() => setMove(null), []);

  return { move, saving, busy: saving || move !== null, notice, error, moveTo, dismissError, settle, reset };
}
```

- [ ] **Step 4: Write the card and the column**

```tsx
// src/components/pipelines/portfolio/PipelineCard.tsx
import { memo, type DragEvent } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { dateText, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { TITLE_BUTTON } from '../../organizations/detail/listStyles';
import { MoveToMenu } from '../../organizations/portfolio/MoveToMenu';
import { DateLine, PartOf, PipelineSignal, PriorityTag } from './itemParts';

export interface PipelineCardProps {
  row: PipelineRow;
  kind: PipelineKind;
  currency: CurrencyCode;
  /** From `sm`. HTML5 drag has no touch support, so phones move with the menu only. */
  isSm: boolean;
  /** Grouped by stage: the card drags and has a Move to… menu. */
  canMove: boolean;
  /** A move is saving or settling (one at a time). */
  moveDisabled: boolean;
  moveNote?: string | null;
  onOpen: (row: PipelineRow) => void;
  /** `fromMenu`: a Move to… choice, whose card keeps focus in its new column. */
  onMove: (row: PipelineRow, to: string, fromMenu?: boolean) => void;
  onDragStart: (row: PipelineRow) => void;
  onDragEnd: () => void;
}

/** One item on the Board (spec §1): the list item's content as a card —
 *  the title (its form opens from it, `data-part="open"`, where focus
 *  returns after a Move to…), Part of, then MRR, priority, the date line and
 *  the signal. Memoised: dragging re-renders the board. */
function PipelineCardView({
  row,
  kind,
  currency,
  isSm,
  canMove,
  moveDisabled,
  moveNote = null,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: PipelineCardProps) {
  const draggable = isSm && canMove && !moveDisabled;
  const targets = kind.stages.filter((stage) => stage.value !== row.stage.value);

  const startDrag = (event: DragEvent<HTMLLIElement>) => {
    // jsdom has no DataTransfer. Browsers get the id so Firefox starts the drag.
    event.dataTransfer?.setData('text/plain', String(row.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    onDragStart(row);
  };

  return (
    <li
      data-card-id={row.id}
      draggable={draggable}
      onDragStart={draggable ? startDrag : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onOpen(row)}
      className={`cursor-pointer rounded-xl bg-surface p-3 transition-shadow duration-[var(--dur-fast)] hover:shadow-sm ${draggable ? 'active:cursor-grabbing' : ''}`}
    >
      <div data-part="card-header" className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            data-part="open"
            aria-haspopup="dialog"
            draggable={false}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(row);
            }}
            className={`${TITLE_BUTTON} text-[13px] font-semibold text-ink`}
          >
            {row.title}
          </button>
          <PartOf row={row} />
        </div>
        {canMove ? (
          <MoveToMenu name={row.title} disabled={moveDisabled} note={moveNote} targets={targets} onChoose={(to) => onMove(row, to, true)} />
        ) : null}
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <span data-field="mrr" className="font-mono-brand tabular-nums text-[13px] text-ink">
          {formatCompactMoney(row.mrr, currency)}
        </span>
        {row.signal?.kind === 'high_priority' ? null : <PriorityTag priority={row.priority} />}
        <DateLine text={dateText(kind, row.date, row.open)} overdue={row.overdue} />
        <PipelineSignal signal={row.signal} />
      </div>
    </li>
  );
}

export const PipelineCard = memo(PipelineCardView);
```

```tsx
// src/components/pipelines/portfolio/PipelineColumn.tsx
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { EyeOff, Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { CardSkeleton } from '../../organizations/portfolio/BoardColumn';
import { useOverlayActive } from '../../organizations/portfolio/boardMove';
import { MoreButton } from '../../organizations/portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../../organizations/portfolio/styles';
import { useEndSentinel } from '../../organizations/portfolio/useEndSentinel';
import { usePagedRead } from '../../organizations/portfolio/usePagedRead';
import { PipelineCard } from './PipelineCard';
import { withMovedPipelineRow, type PipelineColumnSpec, type PipelineMove } from './pipelineMove';

const ICON_BUTTON = `inline-flex min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle ${FOCUS}`;

export interface PipelineColumnProps {
  kind: PipelineKind;
  /** The header's figures, already adjusted for an optimistic move. */
  spec: PipelineColumnSpec;
  /** Closed Lost before "Show": a drop target that reads nothing. */
  collapsed: boolean;
  /** This column's read: the view's query plus group_value and limit. */
  query: string;
  enabled: boolean;
  version: number;
  currency: CurrencyCode;
  isSm: boolean;
  canMove: boolean;
  saving: boolean;
  pausedNote?: string | null;
  move: PipelineMove | null;
  filtered: boolean;
  /** The card moved here from its Move to… menu: focus returns to its title. */
  focusId: number | null;
  dragging: PipelineRow | null;
  onOpen: (row: PipelineRow) => void;
  onMove: (row: PipelineRow, to: string, fromMenu?: boolean) => void;
  onDragStart: (row: PipelineRow) => void;
  onDragEnd: () => void;
  onHandedOver: (key: string, token: number) => void;
  onRowsLoaded: (rows: PipelineRow[]) => void;
  /** Stage columns: the header's "+" adds an item already in this stage. */
  onAdd?: (stage: string) => void;
  /** A collapsible column's Show / Hide. */
  onToggleCollapsed?: () => void;
  /** Phones: the panel the column tabs scroll to. */
  panelRef?: (element: HTMLElement | null) => void;
}

/** One Board column: its own cursor-paged read (group_value=<key>) that
 *  loads its next page when its end scrolls into view, with Show more as
 *  the fallback. By stage, a column is a drop target. BoardColumn's
 *  behaviour, for pipeline items. */
export function PipelineColumn({
  kind,
  spec,
  collapsed,
  query,
  enabled,
  version,
  currency,
  isSm,
  canMove,
  saving,
  pausedNote = null,
  move,
  filtered,
  focusId,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onHandedOver,
  onRowsLoaded,
  onAdd,
  onToggleCollapsed,
  panelRef,
}: PipelineColumnProps) {
  const headingId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [over, setOver] = useState(false);
  const page = usePagedRead<PipelineRow, PipelinePage>(kind.fetch, kind.noun, query, enabled, version, onRowsLoaded);
  // The move shows here until this column's own fresh page one lands.
  const overlay = useOverlayActive(move?.token ?? null, page.loadedKey);
  const loaded = enabled ? page.rows : [];
  const rows = overlay ? withMovedPipelineRow(loaded, spec.key, move, kind) : loaded;
  const handedOver = move?.saved === true && enabled && (!overlay || page.error !== null);
  useEffect(() => {
    if (handedOver && move) onHandedOver(spec.key, move.token);
  }, [handedOver, move, spec.key, onHandedOver]);
  // A browser drops focus to <body> when the focused card's node moves or
  // remounts: put it back on its title while the board still wants it here.
  useEffect(() => {
    if (focusId === null) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    sectionRef.current?.querySelector<HTMLElement>(`[data-card-id="${focusId}"] [data-part="open"]`)?.focus();
  });
  const sentinelRef = useEndSentinel(
    () => void page.loadMore(),
    enabled && page.next !== null && !page.loadingMore && page.moreError === null,
  );
  const dropEnabled = canMove && !saving && dragging !== null && dragging.stage.value !== spec.key;
  // A drag cancelled with Escape sends no dragleave here.
  if (over && dragging === null) setOver(false);

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!dropEnabled) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (!over) setOver(true);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOver(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    if (dropEnabled && dragging) onMove(dragging, spec.key);
  };

  let body: ReactNode;
  if (collapsed) {
    body = (
      <button type="button" onClick={onToggleCollapsed} className={`${QUIET} w-full border border-dashed border-line`}>
        {`Show ${spec.label}`}
      </button>
    );
  } else if (page.error && rows.length === 0) {
    body = (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
        {page.error}
        <button type="button" onClick={page.retry} className={QUIET}>
          Try again
        </button>
      </p>
    );
  } else if (enabled && page.loading && rows.length === 0) {
    body = <CardSkeleton label={spec.label} count={Math.min(3, spec.count)} />;
  } else if (rows.length === 0) {
    body = (
      <p className="rounded-xl border border-dashed border-line p-3 text-[13px] text-ink-muted">
        {filtered ? 'None match these filters.' : `No ${kind.noun.many} in ${spec.label}.`}
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-2" aria-busy={page.loading}>
        {rows.map((row) => (
          <PipelineCard
            key={row.id}
            row={row}
            kind={kind}
            currency={currency}
            isSm={isSm}
            canMove={canMove}
            moveDisabled={saving}
            moveNote={pausedNote}
            onOpen={onOpen}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        <li ref={sentinelRef} data-sentinel="" aria-hidden="true" className="h-px" />
      </ul>
    );
  }

  return (
    <section
      ref={(element) => {
        sectionRef.current = element;
        panelRef?.(element);
      }}
      data-column={spec.key}
      aria-labelledby={headingId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-0 shrink-0 flex-col gap-2 rounded-xl p-1 transition-colors duration-[var(--dur-fast)] ${
        isSm ? (collapsed ? 'w-44' : 'w-72') : 'w-full snap-start'
      } ${over && dropEnabled ? 'bg-accent-dim ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-center gap-1">
        <h2 id={headingId} className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold text-ink">
          {spec.label}
          <span className="font-normal text-ink-muted">
            {' · '}
            <span data-part="count" className="font-mono-brand tabular-nums">
              {spec.count}
            </span>
            {' · '}
            <span data-part="mrr" className="font-mono-brand tabular-nums">
              {formatCompactMoney(spec.mrr, currency)}
            </span>
          </span>
        </h2>
        {onToggleCollapsed && !collapsed ? (
          <button type="button" onClick={onToggleCollapsed} aria-label={`Hide ${spec.label}`} className={ICON_BUTTON}>
            <EyeOff className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null}
        {onAdd ? (
          <button type="button" onClick={() => onAdd(spec.key)} aria-label={`Add ${kind.noun.one} to ${spec.label}`} className={ICON_BUTTON}>
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div data-scroll-root={isSm ? '' : undefined} className={isSm ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
        {body}
        <MoreButton
          next={enabled ? page.next : null}
          loading={page.loadingMore}
          error={page.moreError}
          label={`Show more ${spec.label}`}
          onClick={() => void page.loadMore()}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write the board**

```tsx
// src/components/pipelines/portfolio/PipelineBoard.tsx
import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { withArticle, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import { pipelineApiQuery, type PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { useOverlayActive } from '../../organizations/portfolio/boardMove';
import { BoardSkeleton } from '../../organizations/portfolio/PortfolioBoard';
import { EmptyState, ErrorBlock } from '../../organizations/portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../../organizations/portfolio/styles';
import { PipelineColumn } from './PipelineColumn';
import { pipelineColumns, withPipelineMove, type PipelineMove } from './pipelineMove';
import { PIPELINE_SECTION_SIZE, type PipelineBook } from './usePipelineBook';

/** The phone panels' gap (`gap-3`), for reading which panel a swipe rests on. */
const PANEL_GAP = 12;
/** How long a tab's smooth scroll may take before swipes are followed again. */
const JUMP_MS = 1000;
const PAUSED = 'Moving is paused until the board reloads.';

export interface PipelineBoardProps {
  kind: PipelineKind;
  /** The Board's params (boardPipelineParams): `group` is never ''. */
  params: PipelineParams;
  /** The frame read: groups (the column headers), count and currency. */
  book: PipelineBook;
  /** Reloads everything when bumped (Add, Edit, Delete). */
  version: number;
  /** Per-column reload counters, bumped for the two columns a move touched. */
  columnBumps: Record<string, number>;
  currency: CurrencyCode;
  isSm: boolean;
  filtered: boolean;
  move: PipelineMove | null;
  /** A move is saving or settling: moving is off (one at a time). */
  saving: boolean;
  onOpen: (row: PipelineRow) => void;
  onMove: (row: PipelineRow, to: string) => void;
  onRowsLoaded: (rows: PipelineRow[]) => void;
  onClearFilters: () => void;
  /** Add from the empty state (no stage) or a stage column's "+". */
  onAdd: (stage?: string) => void;
  /** A saved move's reloads have all landed (the frame and both columns). */
  onMoveSettled: (token: number) => void;
}

/** The Board's body (spec §1 "Board"), on the Organizations board's model:
 *  columns are the groups; by stage every stage is a column (Closed Lost
 *  collapsed until shown) and cards move between them. From `sm` the columns
 *  sit in a row that scrolls sideways and each scrolls on its own; below `sm`
 *  they are full-width panels that snap, with a strip of column tabs. */
export function PipelineBoard({
  kind,
  params,
  book,
  version,
  columnBumps,
  currency,
  isSm,
  filtered,
  move,
  saving,
  onOpen,
  onMove,
  onRowsLoaded,
  onClearFilters,
  onAdd,
  onMoveSettled,
}: PipelineBoardProps) {
  const [dragging, setDragging] = useState<PipelineRow | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [handed, setHanded] = useState<{ token: number; keys: string[] } | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const panels = useRef(new Map<string, HTMLElement>());
  const jumping = useRef<{ key: string; until: number } | null>(null);
  // The header counts show the move until the frame's own reload lands.
  const countsMoved = useOverlayActive(move?.token ?? null, book.loadedKey);
  const { data, error } = book;

  // The columns belong to the frame on screen: while a new frame loads they
  // keep the inputs that frame was read with (as on Organizations).
  const current = { params, version, columnBumps };
  const [frameInputs, setFrameInputs] = useState(current);
  const fresh = !book.loading && !error;
  if (fresh && (frameInputs.params !== params || frameInputs.version !== version || frameInputs.columnBumps !== columnBumps)) {
    setFrameInputs(current);
  }
  const inputs = fresh ? current : frameInputs;

  const group = inputs.params.group || 'stage';
  const canMove = group === 'stage';
  const columns = data ? pipelineColumns(group, data.groups, kind) : [];
  const collapsed = (key: string) => canMove && kind.collapsedStages.includes(key) && !expanded.includes(key);
  const reads = (key: string) => columns.some((spec) => spec.key === key && spec.count > 0 && !collapsed(key));

  // A saved move settles when the frame's reload has landed and each of its
  // two columns has handed over to its own fresh page (or reads nothing).
  const columnDone = (key: string) => (handed !== null && handed.token === move?.token && handed.keys.includes(key)) || !reads(key);
  const settled = move?.saved === true && fresh && !countsMoved && columnDone(move.from) && columnDone(move.to);
  useEffect(() => {
    if (settled && move) onMoveSettled(move.token);
  }, [settled, move, onMoveSettled]);

  const onHandedOver = useCallback((key: string, token: number) => {
    setHanded((was) =>
      was?.token === token ? (was.keys.includes(key) ? was : { token, keys: [...was.keys, key] }) : { token, keys: [key] },
    );
  }, []);

  // Stable, so the memoised cards don't all re-render on every board render.
  const moveCard = useCallback(
    (row: PipelineRow, to: string, fromMenu = false) => {
      setDragging(null);
      // A Move to… choice keeps focus on the card in its new column; a
      // mouse drag leaves focus alone.
      if (fromMenu) setFocusId(row.id);
      onMove(row, to);
    },
    [onMove],
  );
  const endDrag = useCallback(() => setDragging(null), []);
  const toggleCollapsed = useCallback(
    (key: string) => setExpanded((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    [],
  );

  // Focus is held on the moved card until its move settles (or fails).
  const [focusFor, setFocusFor] = useState<number | null>(null);
  if (focusId !== null && move !== null && focusFor !== move.token) setFocusFor(move.token);
  if (focusId !== null && move === null && focusFor !== null) {
    setFocusId(null);
    setFocusFor(null);
  }

  // The user moving focus somewhere else themselves releases it.
  useEffect(() => {
    if (focusId === null) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(`[data-card-id="${focusId}"]`)) setFocusId(null);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [focusId]);

  // A drag the card never hears the end of must not leave `dragging` set.
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('dragend', endDrag);
    window.addEventListener('drop', endDrag);
    return () => {
      window.removeEventListener('dragend', endDrag);
      window.removeEventListener('drop', endDrag);
    };
  }, [dragging, endDrag]);

  if (!data && error) return <ErrorBlock message={error} onRetry={book.retry} />;
  if (!data) return <BoardSkeleton isSm={isSm} narrow={false} />;
  if (data.count === 0) {
    return filtered ? (
      <EmptyState
        title={`No ${kind.noun.many} match these filters`}
        detail="Remove a filter, or clear them all."
        action={
          <button type="button" onClick={onClearFilters} className={`${QUIET} border border-line`}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState
        title={`No ${kind.noun.many} yet`}
        detail={`Add ${withArticle(kind.noun.one)} to start your pipeline.`}
        action={
          <button type="button" onClick={() => onAdd()} className={`${QUIET} bg-accent text-on-accent hover:bg-accent-hover`}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {`Add ${kind.noun.one}`}
          </button>
        }
      />
    );
  }

  const shown = columns.map((spec) => (countsMoved ? withPipelineMove(spec, move) : spec));
  const activeKey = active !== null && shown.some((spec) => spec.key === active) ? active : (shown[0]?.key ?? null);

  // `at` is the click's event timeStamp, the clock the scroll events use.
  const jump = (key: string, at: number) => {
    setActive(key);
    jumping.current = { key, until: at + JUMP_MS };
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panels.current.get(key)?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.clientWidth === 0) return;
    const key = shown[Math.round(el.scrollLeft / (el.clientWidth + PANEL_GAP))]?.key;
    const pending = jumping.current;
    if (pending) {
      if (key === pending.key || event.timeStamp > pending.until) jumping.current = null;
      else return;
    }
    if (key && key !== activeKey) setActive(key);
  };

  // A saved move settles only once the frame reloads: while that reload
  // fails, moving stays off, and the alert and each control say why.
  const paused = error !== null && move !== null;
  const staleError = error ? (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
      {error} Showing the last result.{paused ? ` ${PAUSED}` : ''}
      <button type="button" onClick={book.retry} className={QUIET}>
        Try again
      </button>
    </p>
  ) : null;

  const columnEls = columns.map((spec, index) => (
    <PipelineColumn
      key={spec.key}
      kind={kind}
      spec={shown[index]}
      collapsed={collapsed(spec.key)}
      query={pipelineApiQuery(inputs.params, 'board', { group_value: spec.key, limit: String(PIPELINE_SECTION_SIZE) })}
      enabled={spec.count > 0 && !collapsed(spec.key)}
      version={inputs.version + (inputs.columnBumps[spec.key] ?? 0)}
      currency={currency}
      isSm={isSm}
      canMove={canMove}
      saving={saving}
      pausedNote={paused ? PAUSED : null}
      move={move}
      filtered={filtered}
      focusId={focusId}
      dragging={dragging}
      onOpen={onOpen}
      onMove={moveCard}
      onDragStart={setDragging}
      onDragEnd={endDrag}
      onHandedOver={onHandedOver}
      onRowsLoaded={onRowsLoaded}
      onAdd={canMove ? onAdd : undefined}
      onToggleCollapsed={canMove && spec.collapsible ? () => toggleCollapsed(spec.key) : undefined}
      panelRef={
        isSm
          ? undefined
          : (element) => {
              if (element) panels.current.set(spec.key, element);
              else panels.current.delete(spec.key);
            }
      }
    />
  ));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-busy={book.loading}>
      {staleError}
      {isSm ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">{columnEls}</div>
      ) : (
        <>
          <nav aria-label="Board columns" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {shown.map((spec) => (
              <button
                key={spec.key}
                type="button"
                aria-current={spec.key === activeKey ? 'true' : undefined}
                onClick={(event) => jump(spec.key, event.timeStamp)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] ${
                  spec.key === activeKey ? 'bg-accent-dim font-semibold text-ink' : 'text-ink-muted hover:bg-subtle active:bg-line-subtle'
                } ${FOCUS}`}
              >
                {spec.label} <span className="font-mono-brand tabular-nums text-[11px]">{spec.count}</span>
              </button>
            ))}
          </nav>
          <div data-part="panels" onScroll={onScroll} className="flex snap-x snap-mandatory gap-3 overflow-x-auto">
            {columnEls}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the Board page, and route it**

```tsx
// src/pages/pipelines/Board.tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { countText } from '../../features/organizations/filterChips';
import { exportPipeline } from '../../features/pipelines/pipelineApi';
import { pipelineChips } from '../../features/pipelines/pipelineChips';
import { PIPELINE_KINDS } from '../../features/pipelines/pipelineKinds';
import { boardPipelineParams, hasPipelineFilters, pipelineApiQuery } from '../../features/pipelines/pipelineParams';
import { ChipRow } from '../../components/organizations/portfolio/FilterChips';
import { FOCUS } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { PipelineBoard } from '../../components/pipelines/portfolio/PipelineBoard';
import { PipelineKindSwitch } from '../../components/pipelines/portfolio/PipelineKindSwitch';
import { PipelineModals } from '../../components/pipelines/portfolio/PipelineModals';
import type { PipelineMove } from '../../components/pipelines/portfolio/pipelineMove';
import { PipelineTiles } from '../../components/pipelines/portfolio/PipelineTiles';
import { PipelineToolbar } from '../../components/pipelines/portfolio/PipelineToolbar';
import { usePipelineBook } from '../../components/pipelines/portfolio/usePipelineBook';
import { usePipelineForms } from '../../components/pipelines/portfolio/usePipelineForms';
import { usePipelineMove } from '../../components/pipelines/portfolio/usePipelineMove';
import { usePipelineParams } from '../../components/pipelines/portfolio/usePipelineParams';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const DISMISS = `inline-flex w-11 h-11 sm:w-8 sm:h-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

/** /pipelines/board (spec 2026-09-30 §1 "Board"): the book as stage
 *  columns. The tiles, toolbar and chips are the List's, on the same URL;
 *  a card moves by drag or Move to…, saved through the item's own PATCH;
 *  a card opens its form. No selection mode: bulk work stays on the List.
 *  Keyed on the kind, as the List is. */
export function Board() {
  const { params } = usePipelineParams();
  return <PipelinesBoard key={params.kind} />;
}

function PipelinesBoard() {
  const { params: urlParams, update, clearFilters } = usePipelineParams();
  const params = useMemo(() => boardPipelineParams(urlParams), [urlParams]);
  const kind = PIPELINE_KINDS[params.kind];
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  // `version` reloads everything (Add, Edit, Delete). A saved move reloads
  // only the frame and the two columns it touched.
  const [version, setVersion] = useState(0);
  const [frameBump, setFrameBump] = useState(0);
  const [columnBumps, setColumnBumps] = useState<Record<string, number>>({});
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = usePipelineForms();

  // A move's frame reload skips the M probe: a stage move can't change M.
  const book = usePipelineBook(kind, params, 'board', version + frameBump, undefined, version);

  const onSaved = useCallback((move: PipelineMove) => {
    setFrameBump((n) => n + 1);
    setColumnBumps((bumps) => ({
      ...bumps,
      [move.from]: (bumps[move.from] ?? 0) + 1,
      [move.to]: (bumps[move.to] ?? 0) + 1,
    }));
  }, []);
  const board = usePipelineMove(kind, onSaved);

  // A different list landing (a filter, sort or group change) forgets a move.
  const { loadedQuery } = book;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    board.reset();
  }

  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const currency = book.data?.currency ?? orgCurrency;
  const options = book.data?.filters ?? null;
  const failed = !book.data && book.error !== null;
  const chips = pipelineChips(params, options, kind);

  const runExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      await exportPipeline(kind.key, pipelineApiQuery(params, 'board'));
    } catch (err) {
      setNotice(errorMessage(err, `Could not export ${kind.noun.many}.`));
    } finally {
      setExporting(false);
    }
  };

  return (
    <OrganizationsFrame>
      {/* From sm the page fills the frame and the columns scroll; phones scroll the page. */}
      <div data-part="board-page" className={`flex flex-col gap-4 pb-4 ${isSm ? 'min-h-0 flex-1' : ''}`}>
        <div className="flex shrink-0 flex-col gap-4">
          {!isSm ? <PipelineKindSwitch variant="page" /> : null}
          <div className="@container">
            <PipelineTiles kind={kind} summary={book.data?.summary ?? null} failed={failed} currency={currency} params={params} onFilter={update} />
          </div>
          <PipelineToolbar
            kind={kind}
            view="board"
            params={params}
            update={update}
            options={options}
            isSm={isSm}
            onExport={() => void runExport()}
            exporting={exporting}
            onAdd={() => forms.openAdd()}
            searchRef={searchRef}
          />
          <ChipRow
            chips={chips}
            status={countText(book.data?.count ?? null, book.total, chips.length > 0, failed, kind.noun)}
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
          <PipelineBoard
            kind={kind}
            params={params}
            book={book}
            version={version}
            columnBumps={columnBumps}
            currency={currency}
            isSm={isSm}
            filtered={hasPipelineFilters(params)}
            move={board.move}
            saving={board.busy}
            onOpen={forms.openEdit}
            onMove={board.moveTo}
            onRowsLoaded={forms.remember}
            onClearFilters={clearFilters}
            onAdd={forms.openAdd}
            onMoveSettled={board.settle}
          />
        </div>
      </div>
      <PipelineModals kind={kind} forms={forms} onSaved={reload} />
    </OrganizationsFrame>
  );
}
```

Then:
1. `src/pages/pipelines/testPages.tsx`: add `import { Board } from './Board';` and, after the `/pipelines/list` route, a `/pipelines/board` route rendering `<><Board /><Where /></>`.
2. `src/App.tsx`: replace `import { PipelinesPage } from './pages/pipelines/PipelinesPage';` with `import { Board as PipelinesBoard } from './pages/pipelines/Board';`, and `<Route path="board" element={<PipelinesPage view="board" />} />` with `<Route path="board" element={<PipelinesBoard />} />`. Keep `<Route index element={<Navigate to="list" replace />} />`.

- [ ] **Step 7: Run the Board, List and move tests**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio src/pages/pipelines/Board.test.tsx src/pages/pipelines/List.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint and commit**

Run: `npx tsc -b && npx eslint src/pages/pipelines src/components/pipelines src/App.tsx`

```bash
git add src/components/pipelines/portfolio src/pages/pipelines/Board.tsx src/pages/pipelines/Board.test.tsx src/pages/pipelines/testPages.tsx src/App.tsx
git commit -m "feat(pipelines): the stage Board, with Closed Lost collapsed and moves saved on the item

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Retire the old page and the dead tab; the house rules over the new files

**Files:**
- Delete: `src/pages/pipelines/PipelinesPage.tsx`, `src/pages/pipelines/PipelinesPage.test.tsx`
- Delete: `src/components/shared/PipelinesTab.tsx`, `src/components/shared/PipelinesTab.test.tsx`
- Modify: `src/components/shared/index.ts` (the two `PipelinesTab` export lines)
- Modify: `src/components/organizations/detail/alignment.test.tsx` (the `PipelinesTab` import, `PIPELINE_PROPS`, the `PipelinesTab` test)
- Modify: comments that still name the removed files (`src/components/pipelines/*`, `src/features/customers/customersSlice.ts`)
- Create: `src/components/pipelines/portfolio/houseRules.test.ts`

**Interfaces:**
- Consumes: `houseRuleSuite` (`src/test/houseRules.ts`).
- Produces: nothing new. With the old page go the Count/MRR toggle, the stat-card banner, the `<table>` list, the client-side filter popover and the client totals (spec §1 "Removed").

- [ ] **Step 1: Write the house-rules suite (it fails until Tasks 6–11 are in; they are)**

```ts
// src/components/pipelines/portfolio/houseRules.test.ts
import { houseRuleSuite } from '../../../test/houseRules';

// The Pipelines portfolio (spec 2026-09-30 §1): its components and its two
// pages. The older forms and KanbanBoard beside this folder predate the
// house rules and are not scanned (as on Organizations).
houseRuleSuite('pipelines portfolio house rules', {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob(['../../../pages/pipelines/List.tsx', '../../../pages/pipelines/Board.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>),
});
```

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/houseRules.test.ts`
Expected: PASS. A failure names the file and the rule; fix the file, not the rule.

- [ ] **Step 2: Remove the dead tab's test case from the alignment suite**

In `src/components/organizations/detail/alignment.test.tsx`:
1. Delete `import { PipelinesTab } from '../../shared/PipelinesTab';`.
2. Delete the `const PIPELINE_PROPS = { … };` block.
3. Delete the whole `it('PipelinesTab: embedded has no scroll area, padding or max width; the default is unchanged', () => { … });`.
4. Rename the `describe('People and Deals & risks render flush, other routes keep their inset', …)` to `describe('People renders flush, other routes keep their inset', …)`. Its ContactsTab test is unchanged.

- [ ] **Step 3: Delete the old page and the dead tab**

```bash
git rm src/pages/pipelines/PipelinesPage.tsx src/pages/pipelines/PipelinesPage.test.tsx src/components/shared/PipelinesTab.tsx src/components/shared/PipelinesTab.test.tsx
```

In `src/components/shared/index.ts`, delete:

```ts
export { PipelinesTab } from './PipelinesTab';
export type { PipelinesTabProps } from './PipelinesTab';
```

- [ ] **Step 4: Point the comments that named them at what replaced them**

```bash
grep -rln "PipelinesTab\|PipelinesPage" src | xargs sed -i '' \
  -e 's#components/shared/PipelinesTab\.tsx#components/organizations/detail/DealsTab.tsx#g' \
  -e 's#PipelinesTab\.tsx#organizations/detail/DealsTab.tsx#g' \
  -e 's#PipelinesTab#DealsTab#g' \
  -e 's#pages/pipelines/PipelinesPage\.tsx#pages/pipelines/List.tsx and Board.tsx#g' \
  -e 's#PipelinesPage\.tsx#pages/pipelines/List.tsx and Board.tsx#g' \
  -e 's#PipelinesPage#the Pipelines pages#g'
grep -rn "PipelinesTab\|PipelinesPage" src
```

Expected: the last grep prints nothing. Read the diff (`git diff src/components/pipelines src/features/customers`): only comments changed.

- [ ] **Step 5: Run everything the removals touch**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/detail src/components/shared src/components/pipelines src/pages/pipelines src/pages/organizations src/pages/accounts`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npx tsc -b && npm run lint`

```bash
git add -A src/pages/pipelines src/components/shared src/components/organizations/detail/alignment.test.tsx src/components/pipelines src/features/customers/customersSlice.ts
git commit -m "refactor(pipelines): retire the old page, its table and banner, and the unused PipelinesTab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The end-to-end journey and the product documents

**Files:**
- Create: `src/e2e/pipelines.test.tsx`
- Modify: `docs/03-ui-ux-design.md` (the component inventory's portfolio and `KanbanBoard` rows; a new "Portfolio rows and board (Pipelines)" section before "Account page"; the focus-trap debt list)
- Modify: `docs/04-app-flow.md` (the route table's `/pipelines/{list,board}` row; §4.5 Pipelines)
- Modify: `.agents/workflows/repo-architecture.md` (the tree, the route map, the portfolio file table, §10 Pipelines, the organization page's "Other tabs")

**Interfaces:**
- Consumes: `renderPipelines` (Tasks 10–11), `stubPipelines`, `pipelineBulkBodies`, `recordWrites`.
- Produces: the journey and the documents.

- [ ] **Step 1: Write the journey**

```tsx
// src/e2e/pipelines.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pipelineBulkBodies, recordWrites, stubPipelines } from '../features/pipelines/testPipelines';
import { renderPipelines } from '../pages/pipelines/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, pages, store, router
// and every Pipelines component. Only fetch is stubbed, with the backend's
// shapes (branch feat/pipelines-portfolio).
const where = () => screen.getByTestId('where').textContent;
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;

describe('Pipelines', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters the book, sets dates in bulk, carries the view to the Board, moves a card and switches to risks', { timeout: 30000 }, async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list', { nav: true });
    expect(screen.getByRole('heading', { name: 'Pipelines' })).toBeInTheDocument();
    expect(await screen.findByText('3 opportunities')).toBeInTheDocument();

    // 1. Carl's book, from the Filters panel.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('2 of 3 opportunities')).toBeInTheDocument();

    // 2. A flat list; both items get an expected close in one go.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'none');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Analytics add-on' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    fireEvent.change(within(bar).getByLabelText('Set date'), { target: { value: '2026-10-15' } });
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')).toEqual([{ ids: [41, 42], action: 'set_date', value: '2026-10-15' }]));
    expect(await within(bar).findByText('Updated 2 opportunities.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Closes in 15d')).toHaveLength(2));

    // 3. Part of links the account's page.
    expect(screen.getByRole('link', { name: 'Pizza Hut EMEA' })).toHaveAttribute('href', '/accounts/12');

    // 4. The Board keeps the filter (and reads "no grouping" as by stage).
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Pipelines views' })).getByRole('link', { name: 'Board' }));
    await waitFor(() => expect(where()).toBe('/pipelines/board?owner=2&group=none'));
    await waitFor(() => expect(column('negotiation')).not.toBeNull());
    await within(column('negotiation')).findByRole('button', { name: 'EMEA seats' });

    // 5. Won: saved on the opportunity, landing in Closed Won.
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'Move EMEA seats to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move EMEA seats to' })).getByRole('menuitem', { name: 'Closed Won' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'closed_won' } }]));
    expect(await within(column('closed_won')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();

    // 6. Risks, on the same Board, for the same owner.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Opportunities or risks' })).getByRole('link', { name: 'Risks' }));
    await waitFor(() => expect(where()).toBe('/pipelines/board?owner=2&group=none&kind=risks'));
    await waitFor(() => expect(column('open')).not.toBeNull());
    expect(await within(column('open')).findByRole('button', { name: 'Admin left' })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/e2e/pipelines.test.tsx`
Expected: PASS.

- [ ] **Step 2: `docs/03-ui-ux-design.md`**

1. In the component inventory, append to the "Portfolio rows and board" row: `The primitives they share with Pipelines (usePagedRead, tileParts, filterParts, ChipRow, MoveToMenu, useSearchText, SelectionActionsBar) live in the same folder.` Add a row after it:

```markdown
| Pipelines book (`components/pipelines/portfolio/`) | `/pipelines/list` and `/pipelines/board`: `PipelineItem` (a rounded item: title, Part of, MRR, stage, priority, department, date line, one signal), `PipelineSections`, `PipelineTiles` (with the open-stage strip), `PipelineToolbar`/`PipelineFilters`, `PipelineBoard`/`PipelineColumn`/`PipelineCard`, `PipelineKindSwitch`, `PipelineModals`. Its own kinds (`OPPORTUNITIES_KIND`, `RISKS_KIND`), on the shared portfolio primitives. See "Portfolio rows and board (Pipelines)" below |
```

2. Change the `KanbanBoard` row's "used by Pipelines" to "used by the Deals & risks tabs' board (organisation and account pages)".
3. Before `### Account page (`/accounts/:id`)`, add:

```markdown
### Portfolio rows and board (Pipelines)

`/pipelines/list` and `/pipelines/board` are one book of opportunities or
risks across organisations and accounts (spec
`docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md` §1), read
from `GET /pipelines/{opportunities,risks}/`. They look and behave like the
Organizations and Accounts portfolios, with their own kinds (`PipelineKind`:
`OPPORTUNITIES_KIND`, `RISKS_KIND` in `features/pipelines/pipelineKinds.ts`)
because a pipeline item has no health, lifecycle or ARR:

- The top bar is the framed one: "Pipelines", List | Board keeping the query,
  and Opportunities | Risks (`?kind=risks`; opportunities when absent). Below
  `sm` the kind switch is the page's first row instead. The actions slot waits
  for Ask (delivery 2); there is no rail yet.
- Five tiles, every figure the server's over every filtered row (the stage
  filter is the only one they ignore): Open pipeline / MRR at risk (a figure,
  count · MRR), Closing / Due within 30 or 90 days, Overdue, Won / Mitigated
  this quarter, and a strip of the open stages. Each but the first sets its
  filter and clears it when pressed again.
- An item is never a table row: the title (it opens the Opportunity or Risk
  form), "Part of" the organisation or account as a link (and an account's
  organisation), MRR in the workspace's currency, the stage tag, priority,
  department ("Whole company" when blank), the date line ("Closes in 12d",
  "Overdue 5d" in danger, "No date"; risks "Due in 12d"; a closed item past its
  date "Expected 5 Sep 2026") and at most one signal (Overdue, else High
  priority on an open item, which then stands in for the priority tag). In a
  narrow column the facts wrap under the title; targets are 44px on phones.
- Group by stage (the default on both views), close / due month (Overdue,
  the months, No date), organisation or account, owner (named people, "Not
  in your book", Unassigned), department or priority; the List also offers
  None. Sort by MRR, date, priority, stage or title. Filters: owner,
  organisation, account, stage (the List's default is the open stages, the
  Board's every stage), priority, department and the date windows. Everything
  is in the URL.
- Selection (the List only) offers Set stage, Set priority, Set department
  and Set date (a date, or Clear date), each armed and applied with "Apply to
  N", and Export selected.
- The Board has a column per stage; Closed Lost starts collapsed ("Show
  Closed Lost") and stays a drop target. Dragging a card (from `sm`) or its
  Move to… menu saves the item's stage; a card opens its form.
- The organisation and account pages' Deals & risks items gain the same date
  line and the Overdue signal; both forms gain the date ("Expected close" /
  "Due by") and Closed Lost.
```

4. In the focus-trap debt item, replace `` `PipelinesPage`, `` with nothing (the page is gone; the forms it opened are listed under their own names elsewhere).

- [ ] **Step 3: `docs/04-app-flow.md`**

1. Route table: replace the row `| `/pipelines/{list,board}` | `PipelinesPage` | auth |` with

```markdown
| `/pipelines/{list,board}` | `PipelinesList`, `PipelinesBoard` (`pages/pipelines/List.tsx`, `Board.tsx`): one book of opportunities or risks across organisations and accounts, `?kind=risks` for risks; `/pipelines` redirects to the List | auth |
```

2. Replace §4.5's body with:

```markdown
1. `/pipelines/list` reads `GET /pipelines/{opportunities|risks}/` (the kind
   from `?kind=`, opportunities when absent):
   - Its state is in the URL: `kind, search, organisation, account, owner
     (id|unassigned|outside), stage, priority, department (none = whole
     company), date (30|90|180|overdue|none), changed (quarter), ids, sort,
     group`. `group` defaults to stage; `group=none` turns grouping off. With
     no `stage` the server lists the open stages.
   - A `limit=1` frame read gives the tiles, groups, filter options, count and
     currency; each open section reads its own rows with `group_value`; with a
     filter on, a `limit=1` probe gives M for "N of M opportunities".
   - Selecting items offers Set stage, priority, department and date through
     `POST /pipelines/<kind>/bulk/`; a failure is named per item and stays
     selected. Export sends the view's query, or `ids`, to
     `GET /pipelines/<kind>/export.csv`.
2. `/pipelines/board` uses the same state; with no `stage` it asks for every
   stage. A move is `PATCH /opportunities/<id>/` or `/risks/<id>/` with the
   new `stage`, then the frame and the two columns it touched read again.
3. An item or card opens `OpportunityFormModal` / `RiskFormModal`, built from
   its row. Save PATCHes `/opportunities/<id>/` (or `/risks/<id>/`), Delete
   confirms and DELETEs; Add reads `GET /customers/` for its organisation
   picker, then `GET /customers/<id>/accounts/`, and POSTs `/opportunities/`
   (or `/risks/`) with `customer_id` or `account_id`. The page reads its book
   again after each.
4. Opportunities | Risks keeps the view and the shared filters and drops
   `stage`, `changed` and `ids`. Ask on Pipelines is delivery 2.
```

- [ ] **Step 4: `.agents/workflows/repo-architecture.md`**

1. Tree: under `components/`, after the `accounts/detail/` line, add
   `│   │   ├── pipelines/          ← OpportunityFormModal, RiskFormModal, KanbanBoard (the Deals & risks board); portfolio/ holds the Pipelines book's parts`;
   under `features/`, add `│   │   ├── pipelines/          ← the Pipelines book: types, API, kinds (OPPORTUNITIES_KIND, RISKS_KIND), URL state, chips`;
   under `pages/`, change `pipelines/          ← Pipelines board + list view` to `pipelines/          ← List and Board (one book of opportunities or risks)`.
2. Route map: replace the three `pipelines/` lines with

```
└── pipelines/
    ├── (index)                → Redirects to /pipelines/list
    ├── list                   → PipelinesList (List.tsx on GET /pipelines/<kind>/, ?kind=risks)
    └── board                  → PipelinesBoard (Board.tsx: stage columns, moves PATCH the item)
```

3. Portfolio file table: add

```markdown
| `components/organizations/portfolio/{usePagedRead,tileParts,filterParts,MoveToMenu,useSearchText,SelectionActionsBar}` | The shape-agnostic parts the Organizations, Accounts and Pipelines books share: the cursor-paged read, tiles, the Filters sheet and fields, the Move to… menu, the debounced search box, the selection bar with any choices and a date |
| `features/pipelines/*`, `components/pipelines/portfolio/*` | The Pipelines book: `pipelineTypes`, `pipelineApi`, `pipelineKinds` (`OPPORTUNITIES_KIND`, `RISKS_KIND`, date line, row → form record), `pipelineParams`, `pipelineChips`; `PipelineItem`, `PipelineSections`, `PipelineTiles`, `PipelineToolbar`, `PipelineFilters`, `PipelineBoard`, `PipelineColumn`, `PipelineCard`, `PipelineKindSwitch`, `PipelineModals`, `usePipelineBook`, `usePipelineMove`, `usePipelineForms`; `features/pipelines/testPipelines.ts` (`stubPipelines`) and `pages/pipelines/testPages.tsx` (`renderPipelines`) for tests |
```

4. Replace §10's body with: "One book of opportunities or risks across organisations and accounts (spec `docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md`): the portfolio design (tiles with an open-stage strip, URL filters, list items with Part of and a date line, selection with bulk stage / priority / department / date, export) and a stage Board whose moves PATCH the item. See `docs/03-ui-ux-design.md` "Portfolio rows and board (Pipelines)"." and retitle it `### 10. Pipelines (`pages/pipelines/List.tsx`, `Board.tsx`)`.
5. In the organization page's **Other tabs** line, change `DealsTab` (`PipelinesTab`) to `DealsTab` (items with the date line and Overdue; `KanbanBoard` from `sm`); in the dependency graph change `shared/PipelinesTab` to `detail/DealsTab`; in the Organizations board paragraph change "`KanbanBoard` is no longer used here (Pipelines keeps it)" to "`KanbanBoard` is no longer used here (the Deals & risks tabs keep it)".

- [ ] **Step 5: Format and commit**

Run: `npx prettier --check docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md || true` (the docs are not prettier-gated here; keep the existing line style).

```bash
git add src/e2e/pipelines.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs(pipelines): the book in the product documents, and its end-to-end journey

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Final verification

**Files:** none new.

- [ ] **Step 1: The whole suite, one process**

Run: `npx vitest run --maxWorkers=2`
Expected: every file passes, the Organizations, Accounts and Deals & risks suites with their assertions unchanged (`git diff origin/main --stat -- src/pages/organizations src/pages/accounts src/components/organizations/detail/DealsTab.test.tsx` shows no test edits there; `DealItem.test.tsx` only gains one test; `alignment.test.tsx` only loses the dead tab's).

- [ ] **Step 2: Types, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no errors (the existing `react-hooks/set-state-in-effect` warnings in the forms are the known ones).

- [ ] **Step 3: Nothing left of the old page**

Run: `grep -rn "PipelinesPage\|PipelinesTab\|TabPill\|applyFilters(" src`
Expected: no output.

- [ ] **Step 4: The anti-slop bar on the new files**

Run: `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|text-\[(1[024]|12|14|16|18)(\.5)?px\]|h-screen" src/components/pipelines/portfolio/*.tsx src/pages/pipelines/*.tsx src/components/organizations/portfolio/{tileParts,filterParts,MoveToMenu,SelectionActionsBar}.tsx`
Expected: no output.

- [ ] **Step 5: Commit any fix** the steps above needed, with a message naming it (`fix(pipelines): …`).

---

### Task 15: Browser check, then finishing the branch

**Files:** none (a fix found here gets its own commit).

- [ ] **Step 1: Run the app against the backend branch**

The backend `feat/pipelines-portfolio` must be running locally with its migration applied and demo opportunities and risks seeded (`seed_demo_opportunities`, `seed_demo_risks`; set a few `expected_close` / `due_by` values in the admin so the tiles and the Overdue line have data). Start the frontend with `npm run dev` and sign in as an admin, then as a CSM limited to one department.

- [ ] **Step 2: Check at 1440px, light and dark** (claude-in-chrome or playwright-cli; screenshots into the PR)

- `/pipelines/list`: the bar reads Pipelines · List | Board · Opportunities | Risks, no avatar; five tiles; the stage strip lists only open stages; items are rounded rows with Part of links, the date line (an overdue one in danger), one signal; sections by stage with count · MRR; the Filters popover; a chip per filter; "N of M".
- A tile toggles its filter; the kind switch keeps the owner filter; `?kind=risks` reads "MRR at risk", "Due within", "Mitigated this quarter".
- Select two items: Set stage / priority / department / date and Export selected; a failure is named.
- Click an item: the form shows Expected close (risks: Due by) and Closed Lost; save; the item's date line changes.
- `/pipelines/board`: every stage a column, Closed Lost collapsed; drag a card and use Move to…; a failed move (edit the item away in another tab) comes back with the reason; group by priority: no Move to….
- The organisation page and an account page, Deals & risks tab: each item has the date line; an overdue one says Overdue.
- Dark mode: every surface is a token (no light-only greys), the Overdue tone reads on both.

- [ ] **Step 3: Check at 375px**

One column; the kind switch leads the page; tiles swipe sideways and the page never does; the toolbar is Search, Filters and Select; the Filters sheet holds group, sort, Export and Add; item facts wrap under the title; every control is at least 44px; the Board shows column tabs and one panel at a time, with Move to… and no drag.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch. The merge order is fixed: **the backend PR (`feat/pipelines-portfolio`) merges and deploys first**, then this frontend PR, whose description links it, lists the Decisions above for the owner, and carries the 1440/375 screenshots in both themes. End the PR description with the attribution line the session asks for.

---

## Self-review

**Spec coverage** (spec §1, §4, §5 frontend and the three backend rulings):

| Requirement | Task |
|---|---|
| Framed bar: Pipelines, List \| Board, Opportunities \| Risks, actions slot, bell; content scrolls; empty rail slot; routes kept; `?kind=` | 10 (Navbar, DashboardLayout, `PipelineKindSwitch`, `OrganizationsFrame` without a rail) |
| Tiles for both kinds, clickable, toggling; totals over every filtered row; tiles ignore only stage; strip shows open stages from `summary.stages` | 8 |
| Search (title, organisation or account name), Group (incl. close month order, owner with outside/Unassigned), Sort, Filters (organisation, account, owner incl. outside, stage open by default, priority, department, date windows, overdue, no date), everything in the URL | 5, 9 |
| Export CSV, + Add, selection with bulk Set stage / priority / department / date | 4 (API), 3 (bar), 10 |
| List items never a table; Part of link; MRR in workspace currency; stage, priority, department; the date line in both kinds' words; one signal | 6, 7 |
| Clicking an item opens the existing form with the date and Closed Lost | 6 (forms), 10 (`PipelineModals`, `opportunityRecord`) |
| Phones: one column, facts wrap under the title, 44px | 7, 9, 10, 11, 15 |
| Board: stage columns, Closed Lost collapsed, cards like items, drag sets stage | 11 |
| Add: organisation or account, title, MRR, stage, priority, department, date | 6, 10 (Decision 7) |
| Removed: Count/MRR toggle, banner, `<table>` lists, client filter popover and totals, `PipelinesTab` with its tests | 10 (routes), 12 |
| Deals & risks: date line and Overdue; forms gain date and Closed Lost | 6 |
| Tests: units for rows, tiles, params; integration with contract-shaped fetch; a jsdom journey; house rules; Organizations/Accounts/Deals & risks still pass | 1–13, 14 |
| Delivery order: backend merges and deploys first | 15 |

Ask on Pipelines (§3) is delivery 2 and out of scope; the frame's actions slot and rail slot are left for it.

**Placeholder scan:** every code step carries its code; no "TBD", "similar to", or unnamed helper.

**Type consistency:** `PipelineKind.fetch` is a property (a stable reader for `usePagedRead`); `PipelineParams` and `pipelineApiQuery(p, view, extra)` are used with the same names in Tasks 5, 7, 9, 10 and 11; `PipelineMove` / `PipelineColumnSpec` (Task 11) are the Board's only move types; `BulkChoice` / `CLEAR_DATE` (Task 3) are what the List imports; `withArticle` lives in `pipelineKinds.ts` (Task 4) for Tasks 7 and 11.
