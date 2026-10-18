# Organizations portfolio, frontend (delivery 2: the Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/organizations/board` on `GET /organizations/portfolio/`. It shares the List's top half and URL state, and each column pages itself (lifecycle by default, with every stage shown). Compact cards open their six panels beside the board. An account moves by drag or by a **Move to…** menu, optimistically, through the single-customer PATCH. The page has phone panels with stage tabs and the List's transparent frame, and `MetricsPanel`/`RenewalPopover` retire.

**Architecture:** The page (`pages/organizations/Board.tsx`) composes the List's `SummaryTiles`, `PortfolioToolbar` and `FilterChips` over `usePortfolio` (the frame read, `limit=1`), with `usePortfolioParams(BOARD_GROUP)` so an absent `group` means lifecycle here and health on the List. The board body is new, in `components/organizations/portfolio/`:
- `PortfolioBoard` lays out the columns (a row from `sm`, snapping panels with stage tabs below it).
- Each `BoardColumn` is one `usePagedPortfolio` read with `group_value=<key>`. An `IntersectionObserver` sentinel pages it, and a visible Show more is the fallback.
- `BoardCard` is the compact card.
- `AccountSidePanel` is the desktop opened card, reusing `AccountDetails`.
- `useBoardMove` owns the move: an optimistic overlay, `updateCustomer` (the single `PATCH /customers/<id>/`), rollback, and handing churn to `ChurnOrganizationModal`.

The overlay is pure (`boardMove.ts`). It ends for each read when that read's fresh page one lands, so after a save the frame and the two touched columns reload and the server's answer replaces the guess without a flicker. No backend change is needed (spec §1 "Backend: none").

**Tech Stack:** React 19, TypeScript, react-router 7 (`useSearchParams`, `NavLink`), Redux Toolkit (the existing `auth`/`customers` slices; `updateCustomer` for the move), Tailwind v4 tokens, lucide-react, Vitest + Testing Library + user-event (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md`. This plan covers §1 "Board (`PortfolioBoard`)" with its owner decisions dated 2026-09-26, the Board's parts of §1 "House rules" and "Phones", §4 item 2 and the Board parts of §5. The List (delivery 1, merged and deployed) is the base. Ask Revenact on Organizations (§3, delivery 3) is out of scope.

**Branch:** `feat/organizations-board` (it already exists and holds the spec's 2026-09-26 decisions commit). Frontend only: the portfolio endpoint's `group_value` and cursor already page each column (spec §4).

## Global Constraints

- Endpoint: `GET /organizations/portfolio/` (via `apiFetch`, which prefixes `/api/v1`) takes `search, owner, lifecycle, health, product, renews_within, nps, ids, include_churned, sort, group, group_value, cursor, limit`. `limit` defaults to 50, max 100. `sort` defaults to `-arr`. Unknown values are ignored.
- `groups` lists **only non-empty groups**, in the server's order (lifecycle groups in stage order). `group_value` (with `group` only) narrows **only `results` and `count`**; `groups` and `summary` stay whole. So column headers read the frame's `groups`, never a column response's `count`.
- `next_cursor` is opaque, `null` on the last page, and passed back verbatim (URL-encoded) as `cursor`. Board columns page `SECTION_PAGE_SIZE` (25) at a time, the value exported from `usePortfolio.ts`.
- Churned accounts (a `churn_date` or the Churn stage) are listed only when `include_churned=1`, `lifecycle` includes `churn`, or `ids` is present (the backend rule; `includesChurned(p)` in Task 1).
- A move saves through **one** `PATCH /customers/<id>/` with `{lifecycle_stage}`, dispatched as `updateCustomer` from `features/customers/customersSlice.ts`. It applies the archive gate, the inactive-owner rule and every other update rule, and it rejects with the server's message (`ApiError.message`, from `detail` or the first field error). The Board never PATCHes `churn`: Churn opens `ChurnOrganizationModal`, which records date, reason and comment. The bulk endpoint is not used on the Board.
- URL state is shared between `/organizations/list` and `/organizations/board`. An absent `group` means `health` on the List and `lifecycle` on the Board. `group=none` means no grouping on the List, and on the Board it reads as lifecycle with the URL left untouched. `sort` is omitted when it is `-arr`.
- House rules (spec §1):
  - Tokens only: no hex, `rgb(`, or named palette colours in `.tsx`.
  - One monochrome primary; semantic colour only for status. Numbers in `font-mono-brand tabular-nums`.
  - Type sizes **11/13/15/22 px only** inside `components/organizations/portfolio/` (`houseRules.test.ts` scans every `.tsx` there, new files included).
  - No card-in-card: columns sit on the canvas with no surface of their own, cards and the side panel are `bg-surface` items on it. **No glass.**
  - Skeletons shaped like cards and columns. Designed empty and error states.
  - Hover, focus-visible (`FOCUS` from `portfolio/styles.ts`), active and disabled states throughout. 44px touch targets below `sm`. Reduced motion is respected: the global override in `src/index.css` covers `transition-*` and `animate-pulse`, and the stage tabs scroll with `behavior: 'auto'` under `prefers-reduced-motion: reduce`.
- Copy: sentence case, no em dashes in new UI copy, "organizations" (US spelling) in UI text.
- Phones are `< 640px` (`SM = '(min-width: 640px)'` from `src/lib/useMediaQuery.ts`). jsdom has no `matchMedia`, so **`useMediaQuery` reads false (phone) in tests unless `setViewport(1440)` from `src/test/viewport.ts` runs first**. The page reads `isSm` once and passes it down. Controls that exist in one layout only (stage tabs, side panel, bottom sheet) are rendered conditionally on `isSm`. They are never only CSS-hidden, because jsdom ignores CSS and duplicates would collide in queries.
- jsdom has no `IntersectionObserver`, `DataTransfer` or `Element.prototype.scrollIntoView`. The code guards all three: without an observer, Show more does the paging; drag handlers use `event.dataTransfer?.`; `scrollIntoView?.()`. Tests use `installIntersectionObserver()` from `src/test/intersection.ts` (Task 3), pass a plain `dataTransfer` object to `fireEvent.drag*`, and assign a `vi.fn()` to `scrollIntoView`.
- Tests follow `.claude/skills/testing/SKILL.md`: unit, integration (real store and router, network mocked at `fetch` with §2-shaped bodies via `stubPortfolio`), and e2e in `src/e2e/`.
- Gates: `npm run lint` passes with 0 errors, `npx tsc -b --noEmit`, `npx vitest run --maxWorkers=2`, and `npm run build`.
- Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Pre-flight: where the spec meets the code

| # | Spec / owner decision says | Code today | Resolution in this plan |
|---|---|---|---|
| 1 | The Board shares the List's top half; URL params are shared between tabs; group defaults to lifecycle on the Board (health on the List). | `parseParams`/`toUrlSearch` hard-code `DEFAULT_GROUP = 'health'`: absent means health and health is omitted from the URL. `usePortfolioParams()` takes no argument. | `parseParams(search, defaultGroup = DEFAULT_GROUP)`, `toUrlSearch(p, defaultGroup = DEFAULT_GROUP)` and `usePortfolioParams(defaultGroup = DEFAULT_GROUP)`. The Board passes `BOARD_GROUP = 'lifecycle'`. An absent `group` is each route's own default, and a route writes `group` only when it differs from its default. So the List and Board each show their default until the user picks a group, and an explicit pick (`group=owner`) carries across. |
| 2 | `group=none` makes no sense on a board. | The List writes `group=none` for "no grouping". | On the Board `boardParams(p)` turns `''` into `lifecycle` for reading only. The URL keeps `group=none`, so switching back to the List still shows no grouping. The Board's Group menu is `BOARD_GROUP_OPTIONS` (no None, Task 2). |
| 3 | "Filters live in the URL, so switching tabs keeps them." | The Navbar's List/Board `NavLink`s point at bare paths, so switching tabs drops the query. | On both routes the tabs link to `{ pathname, search: location.search }` (Task 10). |
| 4 | The Board gets the transparent top bar, empty rail slot and `p-0` padding, like the List. | `isOrgList` (Navbar) and `isOrgList` (DashboardLayout) match `/organizations/list` only. The Navbar tests use `/organizations/board` as their "unframed page" (the account menu, decorative icons), and the layout test uses it as its "padded page". | `isOrgView` matches both routes in both files. The Navbar tests that need an unframed page move to `/pipelines/board`, and the layout's padded example moves to `/accounts/list` (Task 10). `OrganizationsFrame` is reused unchanged (`rail` stays null). |
| 5 | Columns: every stage in canonical order, empty ones included. | `groups` lists only non-empty groups, and its labels come only with those groups. | `boardColumns('lifecycle', groups, churnVisible)` maps `LIFECYCLE_VALUES` (onboarding, kickoff, adoption, live, renewal, churn, expansion, other). The count and ARR come from `groups`, with 0 when a stage is absent, and the label from `LIFECYCLE_LABELS`. The old board's order (Churn after Expansion) gives way to the canonical order. |
| 6 | Churn is shown only when the view includes churned accounts; otherwise it is a drop target only. | The backend hides churned rows unless `include_churned`, a `churn` lifecycle, or `ids`. | `includesChurned(p)` (Task 1) is that rule, shared with `usePortfolio`'s M probe. When false, Churn is `dropOnly`: its header has no count, and it has no read. Its dashed body says "Churned accounts are hidden." with the drag or Move to… hint and a **Show churned** button (`update({include_churned: true})`). It still takes drops, which open the churn modal. |
| 7 | Each column is one `usePagedPortfolio` read with `group_value=<key>`. | A read of a column with no accounts would cost a request that returns nothing. | A column reads only when the frame has landed and its **server** count is above 0 (and it is not drop-only). Empty columns show "No organizations in Kickoff." or, with filters, "None match these filters.", and make no request. A column that gains a card from a move starts reading when the reloaded frame gives it a count. |
| 8 | Loads more when the end scrolls into view. | Nothing in `src/` uses `IntersectionObserver`, and jsdom lacks it. | `useEndSentinel(onEnd, active)` (Task 3) returns a callback ref for a 1px `<li data-sentinel>` after the cards (`rootMargin: '200px'`, re-observed whenever `active` flips back on after a page lands). `MoreButton` (exported from `PortfolioSections`) stays visible as the fallback. The test seam is `src/test/intersection.ts`. |
| 9 | Column header shows count and ARR from the frame's `groups`. | `PortfolioGroup = {key, label, count, arr}` in the org currency. | Header: `Live · 1 · $69.6K` (`formatCompactMoney(arr, currency)`), with the count and ARR in mono and `data-part="count"`/`"arr"`. During an optimistic move the counts are adjusted by `withMove` until the frame reloads. |
| 10 | The card is a compact card (ring, name link, owner, ARR, signal tag, trend). | `AccountRow` is a list row with selection, long-press and pinned chips. | A new `BoardCard` composes the same `rowParts` (`HealthRing`, `SignalTag`, `TrendLine`), plus an Open button (`aria-expanded`) and, when moving is on, the Move to… menu. A card click opens it and the name is a link (`stopPropagation`). `AccountRow` is untouched. |
| 11 | Clicking a card opens the six panels in a side panel (desktop) or `AccountSheet` (phones), reusing `AccountDetails`, with Edit details. | `AccountDetails`' grid is viewport-based (`md:grid-cols-2 xl:grid-cols-3`), so it would be three columns wide inside a 26rem panel at `xl`. | `AccountDetails` gains `stacked?: boolean` (one column). `AccountSidePanel` is a non-modal `<aside>` beside the columns (id `board-account-details`). Focus goes to "Close details" on open and back to the opener on close, and Escape inside it closes it. Phones reuse `AccountSheet` unchanged. Edit details is the List's flow: `GET /customers/<id>/` → `OrganizationFormModal` → reload. |
| 12 | Move: HTML5 drag between lifecycle columns plus a per-card Move to… menu for keyboard and touch. | The old board used `KanbanBoard`'s drag. HTML5 drag has no touch support. | Cards are `draggable` from `sm` only, when moving is on and nothing is saving. The dragged row is held in `PortfolioBoard` state (not read back from `dataTransfer`). A column takes the drop only for a different lifecycle and highlights while dragged over. Move to… is a native `<select aria-label="Move <name> to">` (every other stage, Churn included): keyboard- and touch-native, and it resets after a choice. |
| 13 | Optimistic move; one PATCH; rollback with the server's reason; after success, reload the affected columns and the frame. | `usePagedPortfolio(query, enabled, version, onLoaded)` keys its fetch on `version`. `updateCustomer` rejects with the message string. | `useBoardMove` (Task 8) sets `move = {token, row, from, to}`, dispatches `updateCustomer({id, lifecycle_stage: to}).unwrap()`, and on success bumps a frame counter and per-column counters for `from` and `to` only. The frame reads at `version + frameBump`, each column at `version + columnBumps[key]`. On failure `move` is cleared (so the card goes back) and an alert reads "Couldn't move Pizza Hut to Adoption. \<server reason\>" with a Dismiss button. One move at a time: cards stop dragging and the menus disable while saving. A polite status says "Moved Pizza Hut to Adoption." |
| 14 | The optimistic state must not flicker back before the reloads land. | Each read's `loadedKey` changes only when a fresh page one lands. | `useOverlayActive(token, loadedKey)` (Task 4) records the read's `loadedKey` when a move first appears. It applies the move until that key changes. The header counts use the frame's key, and each column's cards use its own key. `withMovedRow` also dedupes, so a column re-mounting mid-move cannot show the card twice. A different list landing (`loadedQuery` changes) resets the move. |
| 15 | Moving to Churn opens `ChurnOrganizationModal`; success reloads the columns; cancel changes nothing. | The modal takes `customerIds`, `customerNames`, `onChurned` and `onClose`, and PATCHes through `updateCustomer` itself. Its markup predates the house rules (`text-[12px]`, `bg-black/40`). | `moveTo(row, 'churn')` never PATCHes. It calls `onChurn(row)`, which opens the modal. `onChurned` bumps `version` (the frame and every column reload), and `onClose` alone changes nothing. The modal is reused as is, the same as on the List (it is shared and outside `portfolio/`). |
| 16 | Moving is disabled for other groupings. | — | `canMove = group === 'lifecycle'`. Otherwise there is no Move to… menu, cards are not draggable, and columns take no drops. For other groupings the columns are the server's `groups` (non-empty only), in its order. |
| 17 | Phones: full-width snapping column panels with a strip of stage tabs. | — | Below `sm`, `PortfolioBoard` renders a `<nav aria-label="Board columns">` of 44px buttons ("Live 1", `aria-current` on the active one). A tap calls `scrollIntoView({inline: 'start'})` on that panel. Swiping updates the active tab from `scrollLeft / (clientWidth + 12)`. Panels are `w-full snap-start` in a `snap-x snap-mandatory` row. Nothing is CSS-hidden: the tabs exist only when `!isSm`. |
| 18 | Selection and bulk on the Board: the owner's choice. | `PortfolioToolbar` shows its Select toggle only when given `onToggleSelectMode`, and `SelectionBar` is the List's. | **No selection mode on the Board** in this delivery (the simpler option the owner leans to). No checkboxes, no `SelectionBar`, no Select toggle. Bulk work stays on the List, one tab away with the same filters. |
| 19 | Pinned fields. | Cards show no pinned chips (spec card content), yet the toolbar always shows Pin fields. | `pins`/`onTogglePin` become optional on `PortfolioToolbar`, and Pin fields shows only when `onTogglePin` is given. The Board omits both. |
| 20 | The old board's per-column "+" (add into that stage). | `KanbanBoard`'s `onAddClick`. | Dropped. Add organization stays in the toolbar (the org's default stage), the same as on the List. |
| 21 | Retire `MetricsPanel` and `RenewalPopover`; `KanbanBoard` stays for Pipelines. | Grep: `components/organizations/MetricsPanel` is imported only by `pages/organizations/Board.tsx` (and its own test). `RenewalPopover` is imported only by `MetricsPanel`. `components/accounts/MetricsPanel` and `components/contacts/MetricsPanel` are separate files. `fetchUpcomingRenewals`/`fetchCustomerStats` are still used by `pages/health/HealthDistribution.tsx` and `pages/lifecycle/LifecyclePage.tsx`. `KanbanBoard` is used by `pages/pipelines/PipelinesPage.tsx`, `components/shared/PipelinesTab.tsx` and `pages/accounts/Board.tsx`. | Task 11 deletes `components/organizations/MetricsPanel.tsx`, `MetricsPanel.test.tsx` and `RenewalPopover.tsx` after re-running the grep. The slice thunks and `KanbanBoard` stay. The accounts MetricsPanel test's comment that pointed at the deleted test is reworded. |
| 22 | Test harness. | `stubPortfolio` reads a fixed `ALL_ROWS` and answers `/customers/<id>/` (any method) only with `stub.customer`. `buildPortfolio` groups and scopes `health` and `lifecycle`. `renderList` renders only the List route. | Task 8: `stubPortfolio({rows, patch})` keeps a mutable copy of the book, answers `PATCH /customers/<id>/` by applying `lifecycle_stage` (Churn marks the row churned, with no signal), and `patchBodies(spy)` lists the PATCHes. Task 9: `renderOrganizations(url, {width, nav})` renders both routes (and optionally the real `Navbar`), with `renderList`/`renderBoard` as thin wrappers. |
| 23 | Sort on the Board. | — | The toolbar's sort applies within every column (each column's query carries `sort`). |
| 24 | §5 e2e "filter → open → pin → select → board → ask". | `src/e2e/organizationsPortfolio.test.tsx` covers filter → open → pin → select. | A new `src/e2e/organizationsBoard.test.tsx` continues from a List filter through the real Navbar tab to the Board: open, move, drag into Churn, back to the List. A second flow pages a long column and moves on a phone. "Ask" joins in delivery 3. |

## File map

Create:
- `src/features/organizations/portfolioParams.board.test.ts`: per-route default, `boardParams`, `includesChurned`.
- `src/test/intersection.ts`: fake `IntersectionObserver` (`installIntersectionObserver`).
- `src/components/organizations/portfolio/`:
  - `useEndSentinel.ts` (+ `.test.tsx`)
  - `boardMove.ts` (+ `.test.ts`)
  - `BoardCard.tsx` (+ `.test.tsx`)
  - `AccountSidePanel.tsx` (+ `.test.tsx`)
  - `BoardColumn.tsx`
  - `PortfolioBoard.tsx` (+ `.test.tsx`, covering `BoardColumn` too)
  - `useBoardMove.ts` (+ `.test.tsx`)
- `src/e2e/organizationsBoard.test.tsx`.

Modify:
- `src/features/organizations/portfolioParams.ts`
- `src/components/organizations/portfolio/`:
  - `usePortfolioParams.ts` (+ test)
  - `usePortfolio.ts`
  - `FiltersPanel.tsx`
  - `PortfolioToolbar.tsx` (+ test)
  - `AccountDetails.tsx`
  - `PortfolioSections.tsx` (export `ErrorBlock`, `EmptyState`, `MoreButton`; `QUIET` from styles)
  - `styles.ts` (`QUIET`)
- `src/features/organizations/testPortfolio.ts` (the book, PATCH, `patchBodies`).
- `src/pages/organizations/Board.tsx` (rewrite), `Board.test.tsx` (rewrite), `testList.tsx`, `OrganizationsFrame.tsx` (comment).
- `src/components/layout/Navbar.tsx` and `Navbar.test.tsx`.
- `src/layouts/DashboardLayout.tsx` and `DashboardLayout.test.tsx`.
- `src/components/accounts/MetricsPanel.test.tsx` (one comment).
- Docs: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.agents/workflows/repo-architecture.md`.

Delete (Task 11): `src/components/organizations/MetricsPanel.tsx`, `MetricsPanel.test.tsx`, `RenewalPopover.tsx`.

---
### Task 1: URL state: a per-route default group, `boardParams` and `includesChurned`

**Files:**
- Modify: `src/features/organizations/portfolioParams.ts` (`DEFAULT_GROUP` block, `parseParams`, `toUrlSearch`, new exports at the end)
- Modify: `src/components/organizations/portfolio/usePortfolioParams.ts`
- Modify: `src/components/organizations/portfolio/usePortfolio.ts` (the M probe's churn rule)
- Test: `src/features/organizations/portfolioParams.board.test.ts` (new)
- Test: `src/components/organizations/portfolio/usePortfolioParams.test.tsx` (append)

**Interfaces:**
- Consumes: `PortfolioParams`, `DEFAULT_GROUP`, `GROUP_KEYS`, `parseParams`, `toUrlSearch` (existing, `portfolioParams.ts`). `GroupKey` (`portfolioTypes.ts`).
- Produces:
  - `BOARD_GROUP: GroupKey` (`'lifecycle'`)
  - `parseParams(search: URLSearchParams, defaultGroup?: GroupKey): PortfolioParams`
  - `toUrlSearch(p: PortfolioParams, defaultGroup?: GroupKey): URLSearchParams`
  - `boardParams(p: PortfolioParams): PortfolioParams` (returns `p` itself when already grouped)
  - `includesChurned(p: PortfolioParams): boolean`
  - `usePortfolioParams(defaultGroup?: GroupKey): { params, update, clearFilters }` (same return shape as today)
  - Both defaults are `DEFAULT_GROUP`, so every existing call is unchanged.

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/portfolioParams.board.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BOARD_GROUP,
  DEFAULT_GROUP,
  boardParams,
  includesChurned,
  parseParams,
  toUrlSearch,
} from './portfolioParams';

// Owner decision 2026-09-26: the Board shares the List's URL state, but an
// absent `group` means lifecycle there (health on the List).

describe('per-route default group', () => {
  it('reads an absent or unknown group as the route default and leaves the default out of the URL', () => {
    expect(BOARD_GROUP).toBe('lifecycle');
    expect(parseParams(new URLSearchParams('')).group).toBe(DEFAULT_GROUP);
    expect(parseParams(new URLSearchParams(''), BOARD_GROUP).group).toBe('lifecycle');
    expect(parseParams(new URLSearchParams('group=bogus'), BOARD_GROUP).group).toBe('lifecycle');
    expect(parseParams(new URLSearchParams('group=health'), BOARD_GROUP).group).toBe('health');

    const onBoard = parseParams(new URLSearchParams(''), BOARD_GROUP);
    expect(toUrlSearch(onBoard, BOARD_GROUP).toString()).toBe('');
    expect(toUrlSearch({ ...onBoard, group: 'health' }, BOARD_GROUP).toString()).toBe('group=health');
    // Each route writes the other's default out, so a pick survives the switch.
    expect(toUrlSearch({ ...onBoard, group: 'lifecycle' }).toString()).toBe('group=lifecycle');
  });
});

describe('boardParams', () => {
  it('shows lifecycle columns for group=none but keeps none in the URL for the List', () => {
    const p = parseParams(new URLSearchParams('group=none&owner=2'), BOARD_GROUP);
    expect(p.group).toBe('');
    expect(boardParams(p)).toMatchObject({ group: 'lifecycle', owner: '2' });
    expect(toUrlSearch(p, BOARD_GROUP).get('group')).toBe('none');
  });

  it('returns grouped params untouched', () => {
    const grouped = parseParams(new URLSearchParams('group=owner'), BOARD_GROUP);
    expect(boardParams(grouped)).toBe(grouped);
  });
});

describe('includesChurned', () => {
  it('is the backend rule: include_churned, a churn lifecycle, or named ids', () => {
    const p = parseParams(new URLSearchParams(''));
    expect(includesChurned(p)).toBe(false);
    expect(includesChurned({ ...p, include_churned: true })).toBe(true);
    expect(includesChurned({ ...p, lifecycle: ['live', 'churn'] })).toBe(true);
    expect(includesChurned({ ...p, lifecycle: ['live'] })).toBe(false);
    expect(includesChurned({ ...p, ids: [7] })).toBe(true);
  });
});
```

Append to `src/components/organizations/portfolio/usePortfolioParams.test.tsx`. First add this import below the existing `import { usePortfolioParams } from './usePortfolioParams';` line:
```tsx
import { BOARD_GROUP } from '../../../features/organizations/portfolioParams';
```
Then add at the end of the file:
```tsx
function BoardProbe() {
  const { params, update } = usePortfolioParams(BOARD_GROUP);
  const location = useLocation();
  return (
    <div>
      <p data-testid="where">{location.search}</p>
      <p data-testid="group">{params.group || 'none'}</p>
      <button type="button" onClick={() => update({ health: ['poor'] })}>Poor</button>
      <button type="button" onClick={() => update({ group: 'health' })}>By health</button>
      <button type="button" onClick={() => update({ group: 'lifecycle' })}>By lifecycle</button>
    </div>
  );
}

describe('usePortfolioParams on the Board', () => {
  it('reads an absent group as lifecycle and writes only other groups', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/board']}>
        <BoardProbe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('group')).toHaveTextContent('lifecycle');
    await userEvent.click(screen.getByRole('button', { name: 'Poor' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?health=poor');
    await userEvent.click(screen.getByRole('button', { name: 'By health' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('group')).toBe('health');
    await userEvent.click(screen.getByRole('button', { name: 'By lifecycle' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).has('group')).toBe(false);
    expect(screen.getByTestId('group')).toHaveTextContent('lifecycle');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/organizations/portfolioParams.board.test.ts src/components/organizations/portfolio/usePortfolioParams.test.tsx`
Expected: FAIL. `BOARD_GROUP`, `boardParams` and `includesChurned` are not exported, and the Board probe reads `health`.

- [ ] **Step 3: Implement**

In `src/features/organizations/portfolioParams.ts`, replace:
```ts
export const DEFAULT_GROUP: GroupKey = 'health';
```
with:
```ts
/** The List's default grouping (an absent `group` on /organizations/list). */
export const DEFAULT_GROUP: GroupKey = 'health';
/** The Board's default grouping (owner decision 2026-09-26): an absent
 *  `group` on /organizations/board. The two routes share every other param. */
export const BOARD_GROUP: GroupKey = 'lifecycle';
```

Replace the `parseParams` signature line:
```ts
export function parseParams(search: URLSearchParams): PortfolioParams {
```
with:
```ts
export function parseParams(search: URLSearchParams, defaultGroup: GroupKey = DEFAULT_GROUP): PortfolioParams {
```
and inside it replace:
```ts
    group: group === 'none' ? '' : (only([group ?? ''], GROUP_KEYS)[0] ?? DEFAULT_GROUP),
```
with:
```ts
    group: group === 'none' ? '' : (only([group ?? ''], GROUP_KEYS)[0] ?? defaultGroup),
```

Replace the whole `toUrlSearch` function:
```ts
/** The page URL's query: defaults left out, "no grouping" written as none. */
export function toUrlSearch(p: PortfolioParams): URLSearchParams {
  const query = new URLSearchParams();
  setFilters(query, p);
  if (p.sort !== DEFAULT_SORT) query.set('sort', p.sort);
  if (p.group === '') query.set('group', 'none');
  else if (p.group !== DEFAULT_GROUP) query.set('group', p.group);
  return query;
}
```
with:
```ts
/** The page URL's query: defaults left out (the route's own default group
 *  included), "no grouping" written as none. */
export function toUrlSearch(p: PortfolioParams, defaultGroup: GroupKey = DEFAULT_GROUP): URLSearchParams {
  const query = new URLSearchParams();
  setFilters(query, p);
  if (p.sort !== DEFAULT_SORT) query.set('sort', p.sort);
  if (p.group === '') query.set('group', 'none');
  else if (p.group !== defaultGroup) query.set('group', p.group);
  return query;
}
```

Append at the end of the file:
```ts
/** What the Board reads: a board always has columns, so the List's
 *  "no grouping" (group=none, kept in the URL for the List) reads as
 *  lifecycle here. Grouped params come back unchanged (same object). */
export function boardParams(p: PortfolioParams): PortfolioParams {
  return p.group === '' ? { ...p, group: BOARD_GROUP } : p;
}

/** Whether this view lists churned accounts: the backend includes them only
 *  for include_churned=1, a `churn` lifecycle, or explicitly named ids. */
export function includesChurned(p: PortfolioParams): boolean {
  return p.include_churned || p.lifecycle.includes('churn') || p.ids.length > 0;
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

/** The portfolio's URL state, shared by the List and the Board. An absent
 *  `group` is the route's `defaultGroup` (health on the List, lifecycle on
 *  the Board). Updates replace the history entry, like the dashboard's
 *  filters, so Back leaves the page rather than undoing a chip. */
export function usePortfolioParams(defaultGroup: GroupKey = DEFAULT_GROUP) {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseParams(search, defaultGroup), [search, defaultGroup]);

  const update = useCallback(
    (patch: Partial<PortfolioParams>) => {
      setSearch((prev) => toUrlSearch({ ...parseParams(prev, defaultGroup), ...patch }, defaultGroup), { replace: true });
    },
    [setSearch, defaultGroup],
  );

  const clearFilters = useCallback(() => update(EMPTY_FILTERS), [update]);

  return { params, update, clearFilters };
}
```

In `src/components/organizations/portfolio/usePortfolio.ts`, replace the import line:
```ts
import { hasFilters, toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
```
with:
```ts
import { hasFilters, includesChurned, toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
```
and replace:
```ts
  const withChurn = params.include_churned || params.lifecycle.includes('churn') || params.ids.length > 0;
```
with:
```ts
  const withChurn = includesChurned(params);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/organizations src/components/organizations/portfolio/usePortfolioParams.test.tsx src/components/organizations/portfolio/usePortfolio.test.tsx`
Expected: PASS, including the existing `portfolioParams.test.ts` and `usePortfolio.test.tsx` (defaults unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/portfolioParams.ts src/features/organizations/portfolioParams.board.test.ts src/components/organizations/portfolio/usePortfolioParams.ts src/components/organizations/portfolio/usePortfolioParams.test.tsx src/components/organizations/portfolio/usePortfolio.ts
git commit -m "feat(organizations): per-route default group so the board groups by lifecycle on shared URL state

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Toolbar variants for the Board (no "None" group, optional Pin fields)

**Files:**
- Modify: `src/components/organizations/portfolio/FiltersPanel.tsx` (`GROUP_OPTIONS`, `GroupSortControls`, `FiltersPanel` props)
- Modify: `src/components/organizations/portfolio/PortfolioToolbar.tsx`
- Test: `src/components/organizations/portfolio/PortfolioToolbar.test.tsx` (append)

**Interfaces:**
- Consumes: `BOARD_GROUP`, `boardParams`, `parseParams` (Task 1).
- Produces:
  - `interface GroupOption { value: GroupKey | 'none'; label: string }`
  - `GROUP_OPTIONS: GroupOption[]` (unchanged values)
  - `BOARD_GROUP_OPTIONS: GroupOption[]` (every option but None)
  - `GroupSortControls({params, update, groupOptions?})`
  - `FiltersPanel({…, groupOptions?})`
  - `PortfolioToolbar` props: `pins?: ColumnId[]`, `onTogglePin?: (id: ColumnId) => void`, `groupOptions?: GroupOption[]`. With no `onTogglePin` there is no Pin fields button. With no `onToggleSelectMode` there is no Select toggle (already so).

- [ ] **Step 1: Write the failing tests**

In `src/components/organizations/portfolio/PortfolioToolbar.test.tsx`, replace:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
```
with:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
```
replace:
```tsx
import { parseParams } from '../../../features/organizations/portfolioParams';
```
with:
```tsx
import { BOARD_GROUP, boardParams, parseParams } from '../../../features/organizations/portfolioParams';
import { BOARD_GROUP_OPTIONS } from './FiltersPanel';
```
and append at the end of the file:
```tsx
describe('PortfolioToolbar on the Board', () => {
  function renderBoardToolbar(search = '', isSm = true) {
    const props = {
      params: boardParams(parseParams(new URLSearchParams(search), BOARD_GROUP)),
      update: vi.fn(),
      options: FILTER_OPTIONS,
      isSm,
      onExport: vi.fn(),
      exporting: false,
      onAdd: vi.fn(),
      searchRef: createRef<HTMLInputElement>(),
      groupOptions: BOARD_GROUP_OPTIONS,
    };
    render(<PortfolioToolbar {...props} />);
    return props;
  }

  it('offers every grouping but None, starts on lifecycle, and has no Pin fields or Select', async () => {
    const { update } = renderBoardToolbar();
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(group).toHaveValue('lifecycle');
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Health',
      'Owner',
      'Lifecycle',
      'Product',
      'Renewal window',
    ]);
    expect(screen.queryByRole('button', { name: 'Pin fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
    await userEvent.selectOptions(group, 'owner');
    expect(update).toHaveBeenLastCalledWith({ group: 'owner' });
  });

  it('shows lifecycle, not None, when the URL says group=none', () => {
    renderBoardToolbar('group=none');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('lifecycle');
  });

  it('keeps None out of the phone Filters sheet too', async () => {
    renderBoardToolbar('', false);
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).queryByRole('option', { name: 'None' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioToolbar.test.tsx`
Expected: FAIL. `BOARD_GROUP_OPTIONS` is not exported, and the Group menu still lists None.

- [ ] **Step 3: Implement**

In `src/components/organizations/portfolio/FiltersPanel.tsx`, replace:
```tsx
export const GROUP_OPTIONS: { value: GroupKey | 'none'; label: string }[] = [
```
with:
```tsx
export interface GroupOption {
  value: GroupKey | 'none';
  label: string;
}

export const GROUP_OPTIONS: GroupOption[] = [
```
Replace:
```tsx
  { value: 'renewal', label: 'Renewal window' },
];
```
with:
```tsx
  { value: 'renewal', label: 'Renewal window' },
];

/** The Board always has columns, so it offers no "None". */
export const BOARD_GROUP_OPTIONS: GroupOption[] = GROUP_OPTIONS.filter((option) => option.value !== 'none');
```
Replace the `GroupSortControls` signature:
```tsx
export function GroupSortControls({
  params,
  update,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
}) {
```
with:
```tsx
export function GroupSortControls({
  params,
  update,
  groupOptions = GROUP_OPTIONS,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  /** The Board passes BOARD_GROUP_OPTIONS. */
  groupOptions?: GroupOption[];
}) {
```
and inside it replace:
```tsx
          {GROUP_OPTIONS.map((option) => (
```
with:
```tsx
          {groupOptions.map((option) => (
```
In `FiltersPanel`'s props, replace:
```tsx
  triggerRef,
}: {
```
with:
```tsx
  triggerRef,
  groupOptions,
}: {
```
replace:
```tsx
  triggerRef?: RefObject<HTMLElement | null>;
}) {
```
with:
```tsx
  triggerRef?: RefObject<HTMLElement | null>;
  /** The phone sheet's Group choices (the Board passes BOARD_GROUP_OPTIONS). */
  groupOptions?: GroupOption[];
}) {
```
and replace:
```tsx
          <GroupSortControls params={params} update={update} />
```
with:
```tsx
          <GroupSortControls params={params} update={update} groupOptions={groupOptions} />
```

In `src/components/organizations/portfolio/PortfolioToolbar.tsx`, replace:
```tsx
import { FiltersPanel, GroupSortControls } from './FiltersPanel';
```
with:
```tsx
import { FiltersPanel, GroupSortControls, type GroupOption } from './FiltersPanel';
```
In the destructured props, replace:
```tsx
  pins,
  onTogglePin,
```
with:
```tsx
  pins = [],
  onTogglePin,
```
and replace:
```tsx
  selectMode = false,
  onToggleSelectMode,
}: {
```
with:
```tsx
  selectMode = false,
  onToggleSelectMode,
  groupOptions,
}: {
```
In the props type, replace:
```tsx
  pins: ColumnId[];
  onTogglePin: (id: ColumnId) => void;
```
with:
```tsx
  /** Omitted on the Board, whose cards show no pinned chips: no Pin fields then. */
  pins?: ColumnId[];
  onTogglePin?: (id: ColumnId) => void;
```
and replace:
```tsx
  onToggleSelectMode?: () => void;
}) {
```
with:
```tsx
  onToggleSelectMode?: () => void;
  /** The Group choices; the Board passes BOARD_GROUP_OPTIONS (no "None"). */
  groupOptions?: GroupOption[];
}) {
```
Replace:
```tsx
      {isSm ? <GroupSortControls params={params} update={update} /> : null}
```
with:
```tsx
      {isSm ? <GroupSortControls params={params} update={update} groupOptions={groupOptions} /> : null}
```
Replace:
```tsx
          <button ref={pinsTriggerRef} type="button" aria-expanded={open === 'pins'} aria-haspopup="dialog" onClick={() => setOpen(open === 'pins' ? null : 'pins')} className={BUTTON}>
            <Pin className="w-4 h-4" aria-hidden="true" />
            Pin fields
          </button>
```
with:
```tsx
          {onTogglePin ? (
            <button ref={pinsTriggerRef} type="button" aria-expanded={open === 'pins'} aria-haspopup="dialog" onClick={() => setOpen(open === 'pins' ? null : 'pins')} className={BUTTON}>
              <Pin className="w-4 h-4" aria-hidden="true" />
              Pin fields
            </button>
          ) : null}
```
Replace:
```tsx
          triggerRef={filtersTriggerRef}
        />
```
with:
```tsx
          triggerRef={filtersTriggerRef}
          groupOptions={groupOptions}
        />
```
Replace:
```tsx
      {open === 'pins' ? <PinFieldsMenu pins={pins} onToggle={onTogglePin} onClose={close} triggerRef={pinsTriggerRef} /> : null}
```
with:
```tsx
      {open === 'pins' && onTogglePin ? (
        <PinFieldsMenu pins={pins} onToggle={onTogglePin} onClose={close} triggerRef={pinsTriggerRef} />
      ) : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioToolbar.test.tsx src/components/organizations/portfolio/FiltersPanel.test.tsx src/pages/organizations/List.test.tsx`
Expected: PASS. The List still passes pins and gets the full Group menu.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/FiltersPanel.tsx src/components/organizations/portfolio/PortfolioToolbar.tsx src/components/organizations/portfolio/PortfolioToolbar.test.tsx
git commit -m "feat(organizations): toolbar takes the board's group options and hides Pin fields without pins

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The end-of-column sentinel and the IntersectionObserver test seam

**Files:**
- Create: `src/test/intersection.ts`
- Create: `src/components/organizations/portfolio/useEndSentinel.ts`
- Test: `src/components/organizations/portfolio/useEndSentinel.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `useEndSentinel(onEnd: () => void, active: boolean): (element: Element | null) => void` (a callback ref).
  - Test-only `installIntersectionObserver(): { reveal(target: Element): void; watching(target: Element): boolean }`. It stubs the global, and `vi.unstubAllGlobals()` removes it.

- [ ] **Step 1: Write the test seam**

`src/test/intersection.ts`:
```ts
import { vi } from 'vitest';

type Entry = { isIntersecting: boolean; target: Element };
type Watcher = { callback: (entries: Entry[]) => void; targets: Set<Element> };

/** jsdom has no IntersectionObserver. This installs a fake one: `reveal`
 *  plays "this element scrolled into view" to every observer watching it,
 *  and `watching` says whether any observer still watches it. Unlike a
 *  browser, nothing fires on `observe`; a test calls `reveal` (inside
 *  `act`). `vi.unstubAllGlobals()` removes it. */
export function installIntersectionObserver() {
  const watchers = new Set<Watcher>();

  class FakeIntersectionObserver {
    private watcher: Watcher;

    constructor(callback: (entries: Entry[]) => void) {
      this.watcher = { callback, targets: new Set() };
      watchers.add(this.watcher);
    }

    observe(target: Element) {
      this.watcher.targets.add(target);
    }

    unobserve(target: Element) {
      this.watcher.targets.delete(target);
    }

    disconnect() {
      this.watcher.targets.clear();
      watchers.delete(this.watcher);
    }

    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

  return {
    reveal(target: Element) {
      for (const watcher of [...watchers]) {
        if (watcher.targets.has(target)) watcher.callback([{ isIntersecting: true, target }]);
      }
    },
    watching(target: Element) {
      return [...watchers].some((watcher) => watcher.targets.has(target));
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

`src/components/organizations/portfolio/useEndSentinel.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { installIntersectionObserver } from '../../../test/intersection';
import { useEndSentinel } from './useEndSentinel';

function Paged({ onEnd, active }: { onEnd: () => void; active: boolean }) {
  const ref = useEndSentinel(onEnd, active);
  return (
    <ul>
      <li>Row</li>
      <li data-testid="end" ref={ref} />
    </ul>
  );
}

describe('useEndSentinel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls onEnd when the end scrolls into view, only while active', () => {
    const io = installIntersectionObserver();
    const onEnd = vi.fn();
    const { rerender } = render(<Paged onEnd={onEnd} active />);
    const end = screen.getByTestId('end');
    expect(io.watching(end)).toBe(true);
    act(() => io.reveal(end));
    expect(onEnd).toHaveBeenCalledTimes(1);

    rerender(<Paged onEnd={onEnd} active={false} />);
    expect(io.watching(end)).toBe(false);
    act(() => io.reveal(end));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onEnd', () => {
    const io = installIntersectionObserver();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Paged onEnd={first} active />);
    rerender(<Paged onEnd={second} active />);
    act(() => io.reveal(screen.getByTestId('end')));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does nothing without IntersectionObserver (Show more covers it)', () => {
    const onEnd = vi.fn();
    expect(() => render(<Paged onEnd={onEnd} active />)).not.toThrow();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/useEndSentinel.test.tsx`
Expected: FAIL with "Failed to resolve import "./useEndSentinel"".

- [ ] **Step 4: Implement**

`src/components/organizations/portfolio/useEndSentinel.ts`:
```ts
import { useEffect, useRef, useState } from 'react';

/** A callback ref for the element at the end of a paged list. `onEnd` runs
 *  whenever that element scrolls into view (200px early) while `active`
 *  (there is a next page and none is loading). Turning `active` off and on
 *  again (a page landed) re-observes, and a browser observer fires at once
 *  if the end is still in view, so a short column keeps filling. Without
 *  IntersectionObserver (jsdom, very old browsers) it does nothing and the
 *  visible "Show more" button does the job. */
export function useEndSentinel(onEnd: () => void, active: boolean): (element: Element | null) => void {
  const [element, setElement] = useState<Element | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!active || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onEndRef.current();
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, element]);

  return setElement;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/components/organizations/portfolio/useEndSentinel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/test/intersection.ts src/components/organizations/portfolio/useEndSentinel.ts src/components/organizations/portfolio/useEndSentinel.test.tsx
git commit -m "feat(organizations): end-of-list sentinel hook with an IntersectionObserver test seam

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The board's move model (`boardMove.ts`)

**Files:**
- Create: `src/components/organizations/portfolio/boardMove.ts`
- Test: `src/components/organizations/portfolio/boardMove.test.ts`

**Interfaces:**
- Consumes: `LIFECYCLE_VALUES` (`portfolioParams.ts`), `LIFECYCLE_LABELS` (`features/customers/formatters.ts`), `GroupKey`, `LifecycleValue`, `PortfolioGroup`, `PortfolioRow` (`portfolioTypes.ts`). Fixtures `pizzaHut`, `globex`, `initech` (`testPortfolio.ts`).
- Produces:
  - `interface BoardMove { token: number; row: PortfolioRow; from: LifecycleValue; to: LifecycleValue }`
  - `interface BoardColumnSpec { key: string; label: string; count: number; arr: number; dropOnly: boolean }`
  - `boardColumns(group: GroupKey, groups: PortfolioGroup[], churnVisible: boolean): BoardColumnSpec[]`
  - `withMove(spec: BoardColumnSpec, move: BoardMove | null): BoardColumnSpec`
  - `withMovedRow(rows: PortfolioRow[], key: string, move: BoardMove | null): PortfolioRow[]`
  - `useOverlayActive(token: number | null, loadedKey: string | null): boolean`

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/boardMove.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { globex, initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { boardColumns, useOverlayActive, withMove, withMovedRow, type BoardMove } from './boardMove';

const groups = [
  { key: 'adoption', label: 'Adoption', count: 1, arr: 120000 },
  { key: 'live', label: 'Live', count: 1, arr: 69600 },
];
const move: BoardMove = { token: 1, row: pizzaHut, from: 'live', to: 'adoption' };

describe('boardColumns', () => {
  it('gives every lifecycle stage a column in canonical order, empty ones at zero', () => {
    const columns = boardColumns('lifecycle', groups, false);
    expect(columns.map((column) => column.key)).toEqual([
      'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other',
    ]);
    expect(columns.find((column) => column.key === 'kickoff')).toEqual({ key: 'kickoff', label: 'Kickoff', count: 0, arr: 0, dropOnly: false });
    expect(columns.find((column) => column.key === 'live')).toEqual({ key: 'live', label: 'Live', count: 1, arr: 69600, dropOnly: false });
  });

  it('makes Churn a drop target only while churned accounts are hidden', () => {
    expect(boardColumns('lifecycle', groups, false).find((column) => column.key === 'churn')).toEqual({
      key: 'churn', label: 'Churn', count: 0, arr: 0, dropOnly: true,
    });
    const withChurn = [...groups, { key: 'churn', label: 'Churn', count: 1, arr: 30000 }];
    expect(boardColumns('lifecycle', withChurn, true).find((column) => column.key === 'churn')).toEqual({
      key: 'churn', label: 'Churn', count: 1, arr: 30000, dropOnly: false,
    });
  });

  it('uses only the server groups, in its order, for other groupings', () => {
    const health = [
      { key: 'average', label: 'Average', count: 1, arr: 69600 },
      { key: 'good', label: 'Good', count: 1, arr: 120000 },
    ];
    expect(boardColumns('health', health, false)).toEqual([
      { key: 'average', label: 'Average', count: 1, arr: 69600, dropOnly: false },
      { key: 'good', label: 'Good', count: 1, arr: 120000, dropOnly: false },
    ]);
  });
});

describe('withMove', () => {
  it('moves one count and its ARR from the old column to the new, and leaves the rest', () => {
    const columns = boardColumns('lifecycle', groups, false);
    const live = columns.find((column) => column.key === 'live')!;
    const adoption = columns.find((column) => column.key === 'adoption')!;
    const kickoff = columns.find((column) => column.key === 'kickoff')!;
    expect(withMove(live, move)).toMatchObject({ count: 0, arr: 0 });
    expect(withMove(adoption, move)).toMatchObject({ count: 2, arr: 189600 });
    expect(withMove(kickoff, move)).toBe(kickoff);
    expect(withMove(live, null)).toBe(live);
  });
});

describe('withMovedRow', () => {
  it('takes the card out of every other column and puts it on top of its new one, once, with its new stage', () => {
    expect(withMovedRow([pizzaHut, initech], 'live', move).map((row) => row.id)).toEqual([2]);
    const moved = withMovedRow([globex], 'adoption', move);
    expect(moved.map((row) => row.id)).toEqual([7, 1]);
    expect(moved[0].lifecycle).toEqual({ value: 'adoption', label: 'Adoption' });
    expect(withMovedRow([globex, pizzaHut], 'adoption', move).map((row) => row.id)).toEqual([7, 1]);
    expect(withMovedRow([globex], 'adoption', null)).toEqual([globex]);
  });
});

describe('useOverlayActive', () => {
  it('holds a move until a fresh page lands, and never without a move', () => {
    const { result, rerender } = renderHook(({ token, loadedKey }) => useOverlayActive(token, loadedKey), {
      initialProps: { token: null as number | null, loadedKey: 'a' as string | null },
    });
    expect(result.current).toBe(false);
    rerender({ token: 1, loadedKey: 'a' });
    expect(result.current).toBe(true);
    rerender({ token: 1, loadedKey: 'a' });
    expect(result.current).toBe(true);
    rerender({ token: 1, loadedKey: 'b' });
    expect(result.current).toBe(false);
    rerender({ token: 2, loadedKey: 'b' });
    expect(result.current).toBe(true);
    rerender({ token: null, loadedKey: 'b' });
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/boardMove.test.ts`
Expected: FAIL with "Failed to resolve import "./boardMove"".

- [ ] **Step 3: Implement**

`src/components/organizations/portfolio/boardMove.ts`:
```ts
import { useState } from 'react';
import { LIFECYCLE_LABELS } from '../../../features/customers/formatters';
import { LIFECYCLE_VALUES } from '../../../features/organizations/portfolioParams';
import type {
  GroupKey,
  LifecycleValue,
  PortfolioGroup,
  PortfolioRow,
} from '../../../features/organizations/portfolioTypes';

/** One account moving between lifecycle columns. `token` is unique per
 *  move, so an overlay can tell a new move from one it has already seen. */
export interface BoardMove {
  token: number;
  row: PortfolioRow;
  from: LifecycleValue;
  to: LifecycleValue;
}

export interface BoardColumnSpec {
  /** The group key: the column's `group_value`. */
  key: string;
  label: string;
  count: number;
  arr: number;
  /** The Churn column while churned accounts are hidden: a drop target
   *  with no cards, no count and no read. */
  dropOnly: boolean;
}

/** The Board's columns. Grouped by lifecycle, every stage gets a column
 *  in stage order, empty ones included, so there is always somewhere to
 *  drop (`groups` lists only non-empty groups, so the count and ARR default
 *  to 0 and the label comes from LIFECYCLE_LABELS). Any other grouping shows
 *  the server's groups as they are. */
export function boardColumns(group: GroupKey, groups: PortfolioGroup[], churnVisible: boolean): BoardColumnSpec[] {
  if (group !== 'lifecycle') {
    return groups.map((g) => ({ key: g.key, label: g.label, count: g.count, arr: g.arr, dropOnly: false }));
  }
  return LIFECYCLE_VALUES.map((value) => {
    const found = groups.find((g) => g.key === value);
    const dropOnly = value === 'churn' && !churnVisible;
    return {
      key: value,
      label: found?.label ?? LIFECYCLE_LABELS[value],
      count: dropOnly ? 0 : (found?.count ?? 0),
      arr: dropOnly ? 0 : (found?.arr ?? 0),
      dropOnly,
    };
  });
}

/** A column header's figures with a move applied: one account (and its
 *  ARR) out of `from`, into `to`. */
export function withMove(spec: BoardColumnSpec, move: BoardMove | null): BoardColumnSpec {
  if (!move || spec.dropOnly) return spec;
  const arr = move.row.arr ?? 0;
  if (spec.key === move.from) return { ...spec, count: Math.max(0, spec.count - 1), arr: spec.arr - arr };
  if (spec.key === move.to) return { ...spec, count: spec.count + 1, arr: spec.arr + arr };
  return spec;
}

/** A column's cards with a move applied: the moved card leaves every column
 *  but its new one, where it sits on top, once, showing its new stage. */
export function withMovedRow(rows: PortfolioRow[], key: string, move: BoardMove | null): PortfolioRow[] {
  if (!move) return rows;
  const others = rows.filter((row) => row.id !== move.row.id);
  if (key !== move.to) return others;
  return [{ ...move.row, lifecycle: { value: move.to, label: LIFECYCLE_LABELS[move.to] } }, ...others];
}

/** Whether a read (the frame, or one column) should still show the move
 *  `token`. It notes the read's `loadedKey` when a move first appears, and it
 *  shows the move until that key changes, which happens only when a fresh
 *  page one lands (a `loadMore` append leaves it alone). So after a save
 *  bumps the reads, each one's own answer replaces the guess exactly when it
 *  arrives, with no flicker back. Adjusted during render, not in an effect. */
export function useOverlayActive(token: number | null, loadedKey: string | null): boolean {
  const [seen, setSeen] = useState<{ token: number; key: string | null } | null>(null);
  if (token === null) return false;
  if (seen?.token !== token) {
    setSeen({ token, key: loadedKey });
    return true;
  }
  return seen.key === loadedKey;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/organizations/portfolio/boardMove.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/boardMove.ts src/components/organizations/portfolio/boardMove.test.ts
git commit -m "feat(organizations): board columns and the optimistic move overlay

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: `BoardCard`, the compact card

**Files:**
- Create: `src/components/organizations/portfolio/BoardCard.tsx`
- Test: `src/components/organizations/portfolio/BoardCard.test.tsx`

**Interfaces:**
- Consumes:
  - `HealthRing`, `SignalTag`, `TrendLine` (`rowParts.tsx`) and `FOCUS` (`styles.ts`).
  - `PORTFOLIO_FIELDS.owner.value(row)` (`portfolioFields.ts`), `LIFECYCLE_VALUES` (`portfolioParams.ts`).
  - `LIFECYCLE_LABELS` and `formatCompactMoney` (`features/customers/formatters.ts`).
- Produces:
  - `DETAILS_PANEL_ID = 'board-account-details'` (the side panel's id, Task 6).
  - `interface BoardCardProps { row; currency; isSm; open; canMove; moveDisabled; onOpen(row); onMove(row, to: LifecycleValue); onDragStart(row); onDragEnd() }`.
  - `BoardCard(props)`: an `<li data-card-id>`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/BoardCard.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { globex, pizzaHut } from '../../../features/organizations/testPortfolio';
import { BoardCard, type BoardCardProps } from './BoardCard';

function renderCard(overrides: Partial<BoardCardProps> = {}) {
  const props: BoardCardProps = {
    row: pizzaHut,
    currency: 'USD',
    isSm: true,
    open: false,
    canMove: true,
    moveDisabled: false,
    onOpen: vi.fn(),
    onMove: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <ul>
        <BoardCard {...props} />
      </ul>
    </MemoryRouter>,
  );
  return props;
}
const card = (id = 7) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

describe('BoardCard', () => {
  it('shows the ring, name link, owner, ARR, signal and trend', () => {
    renderCard();
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(screen.getByText('Carl CSM')).toBeInTheDocument();
    expect(screen.getByText('$69.6K')).toBeInTheDocument();
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Health falling from 6.2 to 4.9 over 6 months' })).toBeInTheDocument();
  });

  it('opens on a click anywhere but the name, and from its Open button', async () => {
    const { onOpen } = renderCard();
    await userEvent.click(screen.getByText('$69.6K'));
    expect(onOpen).toHaveBeenLastCalledWith(pizzaHut);
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('says when it is open, and which panel it controls', () => {
    renderCard({ open: true });
    const button = screen.getByRole('button', { name: 'Close Pizza Hut' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'board-account-details');
    expect(card()).toHaveClass('ring-1', 'ring-accent');
  });

  it('moves from the Move to… menu (every other stage, Churn included) without opening', async () => {
    const { onMove, onOpen } = renderCard();
    const menu = screen.getByRole('combobox', { name: 'Move Pizza Hut to' });
    expect(within(menu).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Move to…', 'Onboarding', 'Kickoff', 'Adoption', 'Renewal', 'Churn', 'Expansion', 'Other',
    ]);
    await userEvent.selectOptions(menu, 'adoption');
    expect(onMove).toHaveBeenCalledWith(pizzaHut, 'adoption');
    expect(onOpen).not.toHaveBeenCalled();
    expect(menu).toHaveValue('');
  });

  it('drags from sm, handing over its id', () => {
    const { onDragStart, onDragEnd } = renderCard();
    expect(card()).toHaveAttribute('draggable', 'true');
    const dataTransfer = { setData: vi.fn(), effectAllowed: 'all' };
    fireEvent.dragStart(card(), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith(pizzaHut);
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '7');
    expect(dataTransfer.effectAllowed).toBe('move');
    fireEvent.dragEnd(card());
    expect(onDragEnd).toHaveBeenCalled();
  });

  it('does not drag on phones, where Move to… is the way', () => {
    renderCard({ isSm: false });
    expect(card()).toHaveAttribute('draggable', 'false');
    expect(screen.getByRole('combobox', { name: 'Move Pizza Hut to' })).toBeEnabled();
  });

  it('neither drags nor moves while a move is saving', () => {
    const { onDragStart } = renderCard({ moveDisabled: true });
    expect(card()).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(card(), { dataTransfer: { setData: vi.fn() } });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Move Pizza Hut to' })).toBeDisabled();
  });

  it('has no Move to… and does not drag for other groupings', () => {
    renderCard({ canMove: false });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(card()).toHaveAttribute('draggable', 'false');
  });

  it('prints a dash for ARR with no exchange rate, and no tag without a signal', () => {
    renderCard({ row: { ...globex, arr: null } });
    expect(within(card(1)).getByText('—')).toBeInTheDocument();
    expect(within(card(1)).queryByText('Renewal overdue')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/BoardCard.test.tsx`
Expected: FAIL with "Failed to resolve import "./BoardCard"".

- [ ] **Step 3: Implement**

`src/components/organizations/portfolio/BoardCard.tsx`:
```tsx
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { PanelRight } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { LIFECYCLE_LABELS, formatCompactMoney } from '../../../features/customers/formatters';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import { LIFECYCLE_VALUES } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { HealthRing, SignalTag, TrendLine } from './rowParts';
import { FOCUS } from './styles';

/** The id of the Board's side panel (AccountSidePanel), which an open card controls. */
export const DETAILS_PANEL_ID = 'board-account-details';

export interface BoardCardProps {
  row: PortfolioRow;
  currency: CurrencyCode;
  /** From `sm`. HTML5 drag has no touch support, so phones move with the menu only. */
  isSm: boolean;
  /** Its details are showing (side panel from `sm`, bottom sheet below). */
  open: boolean;
  /** Grouped by lifecycle: the card drags and has a Move to… menu. */
  canMove: boolean;
  /** A move is saving (one at a time). */
  moveDisabled: boolean;
  onOpen: (row: PortfolioRow) => void;
  onMove: (row: PortfolioRow, to: LifecycleValue) => void;
  onDragStart: (row: PortfolioRow) => void;
  onDragEnd: () => void;
}

/** One account on the Board (spec §1 "Board"): AccountRow's phone-card
 *  content (ring, name, owner, then ARR, signal and trend) as a compact
 *  card. A click opens its details beside the board. The name links to the
 *  organization page. Move to… is the keyboard and touch path for a move. */
export function BoardCard({
  row,
  currency,
  isSm,
  open,
  canMove,
  moveDisabled,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: BoardCardProps) {
  const draggable = isSm && canMove && !moveDisabled;
  const arr = row.arr == null ? '—' : formatCompactMoney(row.arr, currency);
  const targets = LIFECYCLE_VALUES.filter((value) => value !== row.lifecycle.value);

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
      <div className="flex items-start gap-2.5">
        <HealthRing score={row.health.score} category={row.health.category} />
        <div className="min-w-0 flex-1">
          <Link
            to={`/organizations/${row.id}`}
            draggable={false}
            onClick={(event) => event.stopPropagation()}
            className={`flex min-h-11 min-w-0 items-center truncate rounded-sm text-[13px] font-semibold text-ink hover:underline sm:block sm:min-h-0 ${FOCUS}`}
          >
            <span className="truncate">{row.name}</span>
          </Link>
          <p className="truncate text-[11px] text-ink-muted">{PORTFOLIO_FIELDS.owner.value(row)}</p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row);
          }}
          aria-expanded={open}
          aria-controls={open && isSm ? DETAILS_PANEL_ID : undefined}
          aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
          className={`inline-flex w-11 h-11 sm:w-8 sm:h-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
        >
          <PanelRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span className="font-mono-brand tabular-nums text-[13px] text-ink">{arr}</span>
        <SignalTag signal={row.signal} />
        <TrendLine trend={row.health.trend} category={row.health.category} className="ml-auto" />
      </div>
      {canMove ? (
        <select
          value=""
          disabled={moveDisabled}
          aria-label={`Move ${row.name} to`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            if (event.target.value) onMove(row, event.target.value as LifecycleValue);
          }}
          className={`mt-2 w-full min-h-11 sm:min-h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-muted hover:border-line-strong disabled:opacity-50 ${FOCUS}`}
        >
          <option value="" disabled>
            Move to…
          </option>
          {targets.map((value) => (
            <option key={value} value={value}>
              {LIFECYCLE_LABELS[value]}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 4: Run it, and the house rules, to verify they pass**

Run: `npx vitest run src/components/organizations/portfolio/BoardCard.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS (9 + 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/BoardCard.tsx src/components/organizations/portfolio/BoardCard.test.tsx
git commit -m "feat(organizations): compact board card with drag and a Move to menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `AccountSidePanel` (and `AccountDetails` stacked)

**Files:**
- Modify: `src/components/organizations/portfolio/AccountDetails.tsx` (the `AccountDetails` signature and its two grid class strings)
- Create: `src/components/organizations/portfolio/AccountSidePanel.tsx`
- Test: `src/components/organizations/portfolio/AccountSidePanel.test.tsx`

**Interfaces:**
- Consumes: `AccountDetails` (existing, gains `stacked`), `DETAILS_PANEL_ID` (Task 5), `HealthRing`, `PulsePair`, `RenewalRunway`, `SignalTag`, `TrendLine`, `touchText` (`rowParts.tsx`), `PORTFOLIO_FIELDS`, `formatCompactMoney`.
- Produces:
  - `AccountDetails({row, id?, today?, onEdit?, stacked?})`. `stacked` gives one column at every width.
  - `AccountSidePanel({row, currency, onClose, onEdit?})`: an `<aside id="board-account-details">` named by the account.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/AccountSidePanel.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { AccountSidePanel } from './AccountSidePanel';

describe('AccountSidePanel', () => {
  it('shows the account, its signals and the six panels in one column, with Edit details', async () => {
    const onEdit = vi.fn();
    render(
      <MemoryRouter>
        <AccountSidePanel row={pizzaHut} currency="USD" onClose={vi.fn()} onEdit={onEdit} />
      </MemoryRouter>,
    );
    const panel = screen.getByRole('complementary', { name: 'Pizza Hut' });
    expect(panel).toHaveAttribute('id', 'board-account-details');
    expect(within(panel).getByText('Carl CSM · Live · Touched 33d ago')).toBeInTheDocument();
    expect(within(panel).getByText('$69.6K')).toBeInTheDocument();
    expect(within(panel).getByText('47d overdue')).toBeInTheDocument();
    expect(panel.querySelectorAll('[data-panel]')).toHaveLength(6);
    const grid = panel.querySelector('[data-panel="commercial"]')!.parentElement!;
    expect(grid).not.toHaveClass('md:grid-cols-2');
    expect(grid).not.toHaveClass('xl:grid-cols-3');
    expect(within(panel).getByRole('link', { name: 'Open organization page' })).toHaveAttribute('href', '/organizations/7');
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledWith(7);
  });

  it('takes focus on open, closes on Escape, and hands focus back to the opener', async () => {
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>
            Open it
          </button>
          {open ? (
            <AccountSidePanel
              row={pizzaHut}
              currency="USD"
              onClose={() => {
                onClose();
                setOpen(false);
              }}
            />
          ) : null}
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Close details' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes from its Close button', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AccountSidePanel row={pizzaHut} currency="USD" onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/AccountSidePanel.test.tsx`
Expected: FAIL with "Failed to resolve import "./AccountSidePanel"".

- [ ] **Step 3: Give `AccountDetails` a stacked layout**

In `src/components/organizations/portfolio/AccountDetails.tsx`, replace:
```tsx
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
```
with:
```tsx
export function AccountDetails({
  row,
  id,
  today = new Date().toISOString().slice(0, 10),
  onEdit,
  stacked = false,
}: {
  row: PortfolioRow;
  id?: string;
  today?: string;
  onEdit?: (id: number) => void;
  /** One column at every width: the Board's side panel is narrow even on
   *  a wide screen, where the viewport-based grid would give three. */
  stacked?: boolean;
}) {
  const churned = row.churned;
  return (
    <div
      id={id}
      className={`grid gap-x-8 gap-y-5 border-t border-line-subtle px-3 pt-3 pb-4 ${stacked ? '' : 'md:grid-cols-2 xl:grid-cols-3'}`}
    >
```
and replace:
```tsx
        <div className="flex justify-end md:col-span-2 xl:col-span-3">
```
with:
```tsx
        <div className={`flex justify-end ${stacked ? '' : 'md:col-span-2 xl:col-span-3'}`}>
```

- [ ] **Step 4: Write the side panel**

`src/components/organizations/portfolio/AccountSidePanel.tsx`:
```tsx
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { AccountDetails } from './AccountDetails';
import { DETAILS_PANEL_ID } from './BoardCard';
import { HealthRing, PulsePair, RenewalRunway, SignalTag, TrendLine, touchText } from './rowParts';
import { FOCUS } from './styles';

/** The Board's opened card from `sm` (owner decision 2026-09-26): the
 *  row's signals and the six panels in a column beside the board, which
 *  stays in place and usable. It is not modal. Focus moves to Close on open
 *  and back to the opener on close, and Escape inside the panel closes it.
 *  A `bg-surface` item on the canvas, beside the columns, never inside one. */
export function AccountSidePanel({
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

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
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
          <p className="truncate text-[11px] text-ink-muted">
            {`${PORTFOLIO_FIELDS.owner.value(row)} · ${row.lifecycle.label} · ${touchText(row.last_touch_days)}`}
          </p>
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
      <AccountDetails row={row} onEdit={onEdit} stacked />
      <div className="px-3 pb-4">
        <Link
          to={`/organizations/${row.id}`}
          className={`flex min-h-9 items-center justify-center rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-hover ${FOCUS}`}
        >
          Open organization page
        </Link>
      </div>
    </aside>
  );
}
```
The panel exists from `sm` only, so its controls use desktop sizes (`w-8 h-8`, `min-h-9`). Phones get `AccountSheet`, whose targets are 44px.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/portfolio/AccountSidePanel.test.tsx src/components/organizations/portfolio/AccountDetails.test.tsx src/components/organizations/portfolio/fieldCoverage.test.tsx src/components/organizations/portfolio/houseRules.test.ts`
Expected: PASS. The List's opened row keeps its responsive grid (`stacked` defaults to false).

- [ ] **Step 6: Commit**

```bash
git add src/components/organizations/portfolio/AccountDetails.tsx src/components/organizations/portfolio/AccountSidePanel.tsx src/components/organizations/portfolio/AccountSidePanel.test.tsx
git commit -m "feat(organizations): side panel for an opened board card, reusing the six detail panels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: `BoardColumn` and `PortfolioBoard` (columns, paging, drag and drop, phone panels, states)

**Files:**
- Modify: `src/components/organizations/portfolio/styles.ts` (add `QUIET`)
- Modify: `src/components/organizations/portfolio/PortfolioSections.tsx` (use `QUIET` from styles; export `ErrorBlock`, `EmptyState`, `MoreButton`)
- Create: `src/components/organizations/portfolio/BoardColumn.tsx`
- Create: `src/components/organizations/portfolio/PortfolioBoard.tsx`
- Test: `src/components/organizations/portfolio/PortfolioBoard.test.tsx` (it covers `BoardColumn` through the board)

**Interfaces:**
- Consumes:
  - `usePagedPortfolio(query, enabled, version, onLoaded)`, `SECTION_PAGE_SIZE` and `PortfolioState` (`usePortfolio.ts`); `toApiQuery`, `includesChurned` (Task 1); `useEndSentinel` (Task 3).
  - `boardColumns`, `withMove`, `withMovedRow`, `useOverlayActive`, `BoardMove`, `BoardColumnSpec` (Task 4); `BoardCard` (Task 5).
  - `ErrorBlock`, `EmptyState`, `MoreButton` (exported here from `PortfolioSections`).
- Produces:
  - `QUIET` (`styles.ts`).
  - `CardSkeleton({label, count})` and `BoardColumn(props: BoardColumnProps)` (`BoardColumn.tsx`).
  - `interface PortfolioBoardProps { params; portfolio; version; columnBumps: Record<string, number>; currency; isSm; filtered; move: BoardMove | null; saving; openId: number | null; onOpen(row); onMove(row, to); onRowsLoaded(rows); onClearFilters(); onAdd(); onShowChurned() }`.
  - `PortfolioBoard(props)`: `<section data-column="<key>">` per column (named by its header), `[data-sentinel]` at each column's end, `<nav aria-label="Board columns">` and `[data-part="panels"]` below `sm`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/portfolio/PortfolioBoard.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  ALL_ROWS,
  buildPortfolio,
  pizzaHut,
  portfolioQueries,
  stubPortfolio,
} from '../../../features/organizations/testPortfolio';
import { BOARD_GROUP, boardParams, parseParams, toApiQuery } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { installIntersectionObserver } from '../../../test/intersection';
import { PortfolioBoard, type PortfolioBoardProps } from './PortfolioBoard';
import type { PortfolioState } from './usePortfolio';

// Component tier: the board with a ready frame (built by the test stub's own
// buildPortfolio), while every column reads through the real
// usePagedPortfolio against stubPortfolio.

type Options = Partial<PortfolioBoardProps> & { rows?: PortfolioRow[]; frame?: Partial<PortfolioState> };

function renderBoard(search = '', { rows = ALL_ROWS, frame = {}, ...overrides }: Options = {}) {
  const params = boardParams(parseParams(new URLSearchParams(search), BOARD_GROUP));
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
    ...frame,
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
    onShowChurned: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <PortfolioBoard {...props} />
    </MemoryRouter>,
  );
  return props;
}

const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const heading = (key: string) => within(column(key)).getByRole('heading');
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: 'all', dropEffect: 'none' });
const many = Array.from({ length: 30 }, (_, i) => ({ ...pizzaHut, id: 100 + i, name: `Account ${i + 1}` }));

describe('PortfolioBoard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('gives every lifecycle stage a column in order with count and ARR, and reads only the non-empty ones', async () => {
    const spy = stubPortfolio();
    renderBoard();
    expect([...document.querySelectorAll('[data-column]')].map((el) => el.getAttribute('data-column'))).toEqual([
      'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other',
    ]);
    expect(heading('live')).toHaveTextContent('Live · 1 · $69.6K');
    expect(heading('kickoff')).toHaveTextContent('Kickoff · 0 · $0');
    expect(await within(column('live')).findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(await within(column('adoption')).findByRole('link', { name: 'Globex' })).toBeInTheDocument();
    expect(within(column('kickoff')).getByText('No organizations in Kickoff.')).toBeInTheDocument();
    expect(portfolioQueries(spy).map((q) => q.get('group_value')).sort()).toEqual(['adoption', 'live']);
    const live = portfolioQueries(spy).find((q) => q.get('group_value') === 'live')!;
    expect(live.get('group')).toBe('lifecycle');
    expect(live.get('limit')).toBe('25');
    expect(live.get('sort')).toBe('-arr');
  });

  it('keeps Churn a drop target only while churned accounts are hidden', async () => {
    stubPortfolio();
    const { onShowChurned } = renderBoard();
    const churn = column('churn');
    expect(heading('churn').textContent).toBe('Churn');
    expect(within(churn).getByText('Churned accounts are hidden.')).toBeInTheDocument();
    expect(within(churn).getByText('Drop a card here to churn it.')).toBeInTheDocument();
    await userEvent.click(within(churn).getByRole('button', { name: 'Show churned' }));
    expect(onShowChurned).toHaveBeenCalled();
  });

  it('lists churned accounts in Churn when the view includes them', async () => {
    const spy = stubPortfolio();
    renderBoard('include_churned=1');
    expect(heading('churn')).toHaveTextContent('Churn · 1 · $30K');
    expect(await within(column('churn')).findByRole('link', { name: 'Initech' })).toBeInTheDocument();
    expect(portfolioQueries(spy).find((q) => q.get('group_value') === 'churn')!.get('include_churned')).toBe('1');
  });

  it('loads the next page when a column end scrolls into view', async () => {
    const io = installIntersectionObserver();
    const spy = stubPortfolio({ portfolio: (q) => buildPortfolio(q, many) });
    renderBoard('', { rows: many });
    const live = column('live');
    await waitFor(() => expect(within(live).getAllByRole('link')).toHaveLength(25));
    await act(async () => io.reveal(live.querySelector('[data-sentinel]')!));
    await waitFor(() => expect(within(live).getAllByRole('link')).toHaveLength(30));
    expect(portfolioQueries(spy).some((q) => q.get('group_value') === 'live' && q.get('cursor') === '25')).toBe(true);
    expect(within(live).queryByRole('button', { name: 'Show more Live' })).not.toBeInTheDocument();
  });

  it('falls back to a visible Show more without IntersectionObserver', async () => {
    stubPortfolio({ portfolio: (q) => buildPortfolio(q, many) });
    renderBoard('', { rows: many });
    const live = column('live');
    await userEvent.click(await within(live).findByRole('button', { name: 'Show more Live' }));
    await waitFor(() => expect(within(live).getAllByRole('link')).toHaveLength(30));
  });

  it('shows a column that fails with its own Try again', async () => {
    let fail = true;
    stubPortfolio({
      portfolio: (q) => (fail && q.get('group_value') === 'live' ? { status: 500, body: { detail: 'Server error' } } : buildPortfolio(q)),
    });
    renderBoard();
    const live = column('live');
    expect(await within(live).findByRole('alert')).toHaveTextContent('Server error');
    fail = false;
    await userEvent.click(within(live).getByRole('button', { name: 'Try again' }));
    expect(await within(live).findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('moves a dragged card onto another lifecycle column, never onto its own', async () => {
    stubPortfolio();
    const { onMove } = renderBoard();
    await within(column('live')).findByRole('link', { name: 'Pizza Hut' });
    const dt = dataTransfer();
    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('live'), { dataTransfer: dt });
    fireEvent.drop(column('live'), { dataTransfer: dt });
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('renewal'), { dataTransfer: dt });
    expect(column('renewal')).toHaveClass('ring-2', 'ring-accent');
    fireEvent.drop(column('renewal'), { dataTransfer: dt });
    expect(onMove).toHaveBeenCalledWith(pizzaHut, 'renewal');
    expect(column('renewal')).not.toHaveClass('ring-2');
  });

  it('takes a drop on the drop-only Churn column (the page opens the churn modal)', async () => {
    stubPortfolio();
    const { onMove } = renderBoard();
    await within(column('live')).findByRole('link', { name: 'Pizza Hut' });
    const dt = dataTransfer();
    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('churn'), { dataTransfer: dt });
    fireEvent.drop(column('churn'), { dataTransfer: dt });
    expect(onMove).toHaveBeenCalledWith(pizzaHut, 'churn');
  });

  it('takes no drops while a move is saving', async () => {
    stubPortfolio();
    const { onMove } = renderBoard('', { saving: true });
    await within(column('live')).findByRole('link', { name: 'Pizza Hut' });
    const dt = dataTransfer();
    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('renewal'), { dataTransfer: dt });
    fireEvent.drop(column('renewal'), { dataTransfer: dt });
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Move Pizza Hut to' })).toBeDisabled();
  });

  it('shows the server groups and moves nothing for other groupings', async () => {
    stubPortfolio();
    renderBoard('group=health');
    expect([...document.querySelectorAll('[data-column]')].map((el) => el.getAttribute('data-column'))).toEqual(['average', 'good']);
    expect(heading('average')).toHaveTextContent('Average · 1 · $69.6K');
    await within(column('average')).findByRole('link', { name: 'Pizza Hut' });
    expect(screen.queryByRole('combobox', { name: 'Move Pizza Hut to' })).not.toBeInTheDocument();
    expect(card(7)).toHaveAttribute('draggable', 'false');
  });

  it('shows a move in the header counts and its new column at once', async () => {
    stubPortfolio();
    renderBoard('', { move: { token: 1, row: pizzaHut, from: 'live', to: 'renewal' }, saving: true });
    expect(heading('renewal')).toHaveTextContent('Renewal · 1 · $69.6K');
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(column('renewal')).getByRole('combobox', { name: 'Move Pizza Hut to' })).toBeDisabled();
  });

  it('marks the open card', async () => {
    stubPortfolio();
    renderBoard('', { openId: 7 });
    expect(await within(column('live')).findByRole('button', { name: 'Close Pizza Hut' })).toHaveAttribute('aria-expanded', 'true');
  });

  describe('phones', () => {
    it('lays columns out as snapping panels with a strip of column tabs', async () => {
      stubPortfolio();
      renderBoard('', { isSm: false });
      const tabs = screen.getByRole('navigation', { name: 'Board columns' });
      expect(within(tabs).getAllByRole('button').map((button) => button.textContent)).toEqual([
        'Onboarding 0', 'Kickoff 0', 'Adoption 1', 'Live 1', 'Renewal 0', 'Churn', 'Expansion 0', 'Other 0',
      ]);
      expect(within(tabs).getByRole('button', { name: 'Onboarding 0' })).toHaveAttribute('aria-current', 'true');
      expect(column('live')).toHaveClass('w-full', 'snap-start');
      expect(within(column('churn')).getByText('Use a card’s Move to… menu to churn it.')).toBeInTheDocument();
      await within(column('live')).findByRole('link', { name: 'Pizza Hut' });
      expect(card(7)).toHaveAttribute('draggable', 'false');
    });

    it('jumps to a column from its tab and follows a swipe', async () => {
      stubPortfolio();
      renderBoard('', { isSm: false });
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const tabs = screen.getByRole('navigation', { name: 'Board columns' });
      await userEvent.click(within(tabs).getByRole('button', { name: 'Live 1' }));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      expect(scrollIntoView.mock.contexts[0]).toBe(column('live'));
      expect(within(tabs).getByRole('button', { name: 'Live 1' })).toHaveAttribute('aria-current', 'true');

      const panels = document.querySelector('[data-part="panels"]') as HTMLElement;
      Object.defineProperty(panels, 'clientWidth', { configurable: true, value: 375 });
      Object.defineProperty(panels, 'scrollLeft', { configurable: true, value: 2 * (375 + 12) });
      fireEvent.scroll(panels);
      expect(within(tabs).getByRole('button', { name: 'Adoption 1' })).toHaveAttribute('aria-current', 'true');
    });

    it('has no tabs from sm', () => {
      stubPortfolio();
      renderBoard();
      expect(screen.queryByRole('navigation', { name: 'Board columns' })).not.toBeInTheDocument();
      expect(column('live')).toHaveClass('w-72');
    });
  });

  describe('states', () => {
    it('shows the frame error with Try again', async () => {
      stubPortfolio();
      const { portfolio } = renderBoard('', { frame: { data: null, error: 'Could not load organizations.' } });
      expect(screen.getByText('Could not load organizations.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(portfolio.retry).toHaveBeenCalled();
    });

    it('shows a board-shaped skeleton while the frame loads', () => {
      stubPortfolio();
      renderBoard('', { frame: { data: null, loading: true } });
      expect(screen.getByRole('status', { name: 'Loading the board' })).toBeInTheDocument();
    });

    it('offers Clear filters when nothing matches', async () => {
      stubPortfolio({ portfolio: (q) => buildPortfolio(q, []) });
      const filtered = renderBoard('owner=9', { rows: [], filtered: true });
      expect(screen.getByText('No organizations match these filters')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(filtered.onClearFilters).toHaveBeenCalled();
    });

    it('offers Add organization for an empty book', async () => {
      stubPortfolio({ portfolio: (q) => buildPortfolio(q, []) });
      const empty = renderBoard('', { rows: [] });
      expect(screen.getByText('No organizations yet')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
      expect(empty.onAdd).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioBoard.test.tsx`
Expected: FAIL with "Failed to resolve import "./PortfolioBoard"".

- [ ] **Step 3: Share `QUIET` and export the section states**

Append to `src/components/organizations/portfolio/styles.ts`:
```ts

/** The quiet borderless button (Try again, Show more, empty-state actions). */
export const QUIET = `inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:opacity-50 ${FOCUS}`;
```

In `src/components/organizations/portfolio/PortfolioSections.tsx`:
- Replace `import { FOCUS } from './styles';` with `import { FOCUS, QUIET } from './styles';`.
- Delete the line that starts `const QUIET = ` (its string is the one now in `styles.ts`, character for character).
- Replace `function ErrorBlock(` with `export function ErrorBlock(`.
- Replace `function EmptyState(` with `export function EmptyState(`.
- Replace `function MoreButton(` with `export function MoreButton(`.

- [ ] **Step 4: Write `BoardColumn`**

`src/components/organizations/portfolio/BoardColumn.tsx`:
```tsx
import { useId, useState, type DragEvent, type ReactNode } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { BoardCard } from './BoardCard';
import { useOverlayActive, withMovedRow, type BoardColumnSpec, type BoardMove } from './boardMove';
import { MoreButton } from './PortfolioSections';
import { useEndSentinel } from './useEndSentinel';
import { usePagedPortfolio } from './usePortfolio';
import { QUIET } from './styles';

export interface BoardColumnProps {
  /** The header's figures, already adjusted for an optimistic move. */
  spec: BoardColumnSpec;
  /** This column's read: the view's query plus group_value and limit. */
  query: string;
  /** Whether to read at all: false for a column the server counts empty
   *  and for the drop-only Churn column. */
  enabled: boolean;
  version: number;
  currency: CurrencyCode;
  isSm: boolean;
  canMove: boolean;
  saving: boolean;
  move: BoardMove | null;
  filtered: boolean;
  openId: number | null;
  /** The card being dragged, if any (held by the board, not read back from dataTransfer). */
  dragging: PortfolioRow | null;
  onOpen: (row: PortfolioRow) => void;
  onMove: (row: PortfolioRow, to: LifecycleValue) => void;
  onDragStart: (row: PortfolioRow) => void;
  onDragEnd: () => void;
  onRowsLoaded: (rows: PortfolioRow[]) => void;
  onShowChurned: () => void;
  /** Phones: the panel the column tabs scroll to. */
  panelRef?: (element: HTMLElement | null) => void;
}

/** Card-shaped loading placeholders. */
export function CardSkeleton({ label, count }: { label: string; count: number }) {
  return (
    <div role="status" aria-label={`Loading ${label}`}>
      <ul aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
            <span className="flex items-center gap-2.5">
              <span className="h-10 w-10 animate-pulse rounded-full bg-subtle" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="block h-3 w-28 animate-pulse rounded bg-subtle" />
                <span className="block h-2.5 w-20 animate-pulse rounded bg-subtle" />
              </span>
            </span>
            <span className="block h-3 w-24 animate-pulse rounded bg-subtle" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One Board column (spec §1 "Board"): its own cursor-paged read
 *  (group_value=<key>) that loads its next page when its end scrolls into
 *  view, with a visible Show more as the fallback. Lifecycle columns are
 *  drop targets. The column has no surface of its own (cards are the items). */
export function BoardColumn({
  spec,
  query,
  enabled,
  version,
  currency,
  isSm,
  canMove,
  saving,
  move,
  filtered,
  openId,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onRowsLoaded,
  onShowChurned,
  panelRef,
}: BoardColumnProps) {
  const headingId = useId();
  const [over, setOver] = useState(false);
  const page = usePagedPortfolio(query, enabled, version, onRowsLoaded);
  // The move shows here until this column's own fresh page one lands.
  const overlay = useOverlayActive(move?.token ?? null, page.loadedKey);
  const loaded = enabled ? page.rows : [];
  const rows = overlay ? withMovedRow(loaded, spec.key, move) : loaded;
  const sentinelRef = useEndSentinel(
    () => void page.loadMore(),
    enabled && page.next !== null && !page.loadingMore && page.moreError === null,
  );
  const dropEnabled = canMove && !saving && dragging !== null && dragging.lifecycle.value !== spec.key;

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
    if (dropEnabled && dragging) onMove(dragging, spec.key as LifecycleValue);
  };

  let body: ReactNode;
  if (spec.dropOnly) {
    body = (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line p-3 text-[13px] text-ink-muted">
        <p>Churned accounts are hidden.</p>
        <p>{isSm ? 'Drop a card here to churn it.' : 'Use a card’s Move to… menu to churn it.'}</p>
        <button type="button" onClick={onShowChurned} className={`${QUIET} border border-line`}>
          Show churned
        </button>
      </div>
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
        {filtered ? 'None match these filters.' : `No organizations in ${spec.label}.`}
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-2" aria-busy={page.loading}>
        {rows.map((row) => (
          <BoardCard
            key={row.id}
            row={row}
            currency={currency}
            isSm={isSm}
            open={openId === row.id}
            canMove={canMove}
            moveDisabled={saving}
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
      ref={panelRef}
      data-column={spec.key}
      aria-labelledby={headingId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-0 shrink-0 flex-col gap-2 rounded-xl p-1 transition-colors duration-[var(--dur-fast)] ${
        isSm ? 'w-72' : 'w-full snap-start'
      } ${over ? 'bg-accent-dim ring-2 ring-accent' : ''}`}
    >
      <h2 id={headingId} className="px-1 text-[13px] font-semibold text-ink">
        {spec.label}
        {spec.dropOnly ? null : (
          <span className="font-normal text-ink-muted">
            {' · '}
            <span data-part="count" className="font-mono-brand tabular-nums">
              {spec.count}
            </span>
            {' · '}
            <span data-part="arr" className="font-mono-brand tabular-nums">
              {formatCompactMoney(spec.arr, currency)}
            </span>
          </span>
        )}
      </h2>
      <div className={isSm ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
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

- [ ] **Step 5: Write `PortfolioBoard`**

`src/components/organizations/portfolio/PortfolioBoard.tsx`:
```tsx
import { useRef, useState, type UIEvent } from 'react';
import { Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { includesChurned, toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { BoardColumn } from './BoardColumn';
import { boardColumns, useOverlayActive, withMove, type BoardMove } from './boardMove';
import { EmptyState, ErrorBlock } from './PortfolioSections';
import { SECTION_PAGE_SIZE, type PortfolioState } from './usePortfolio';
import { FOCUS, QUIET } from './styles';

/** The phone panels' gap (`gap-3`), for reading which panel a swipe rests on. */
const PANEL_GAP = 12;

export interface PortfolioBoardProps {
  /** The Board's params (boardParams): `group` is never '' here. */
  params: PortfolioParams;
  /** The frame read: groups (the column headers), count and currency. */
  portfolio: PortfolioState;
  /** Reloads everything when bumped (Add, Edit, Churn). */
  version: number;
  /** Per-column reload counters, bumped for the two columns a move touched. */
  columnBumps: Record<string, number>;
  currency: CurrencyCode;
  isSm: boolean;
  filtered: boolean;
  move: BoardMove | null;
  saving: boolean;
  openId: number | null;
  onOpen: (row: PortfolioRow) => void;
  onMove: (row: PortfolioRow, to: LifecycleValue) => void;
  onRowsLoaded: (rows: PortfolioRow[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
  onShowChurned: () => void;
}

function BoardSkeleton({ isSm }: { isSm: boolean }) {
  return (
    <div role="status" aria-label="Loading the board" className="flex gap-3 overflow-hidden">
      {Array.from({ length: isSm ? 4 : 1 }, (_, i) => (
        <div key={i} aria-hidden="true" className={`flex shrink-0 flex-col gap-2 p-1 ${isSm ? 'w-72' : 'w-full'}`}>
          <span className="block h-3 w-24 animate-pulse rounded bg-subtle" />
          {[0, 1, 2].map((j) => (
            <span key={j} className="block h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The Board's body (spec §1 "Board", owner decisions 2026-09-26). Columns
 *  are the groups; grouped by lifecycle every stage is a column and cards
 *  move between them. From `sm` the columns sit in a row that scrolls
 *  sideways, and each column scrolls on its own. Below `sm` they are
 *  full-width panels that snap, with a strip of column tabs. */
export function PortfolioBoard({
  params,
  portfolio,
  version,
  columnBumps,
  currency,
  isSm,
  filtered,
  move,
  saving,
  openId,
  onOpen,
  onMove,
  onRowsLoaded,
  onClearFilters,
  onAdd,
  onShowChurned,
}: PortfolioBoardProps) {
  const [dragging, setDragging] = useState<PortfolioRow | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const panels = useRef(new Map<string, HTMLElement>());
  // The header counts show the move until the frame's own reload lands.
  const countsMoved = useOverlayActive(move?.token ?? null, portfolio.loadedKey);
  const { data, error } = portfolio;

  if (!data && error) return <ErrorBlock message={error} onRetry={portfolio.retry} />;
  if (!data) return <BoardSkeleton isSm={isSm} />;
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

  const group = params.group || 'lifecycle';
  const canMove = group === 'lifecycle';
  const columns = boardColumns(group, data.groups, includesChurned(params));
  const shown = columns.map((spec) => (countsMoved ? withMove(spec, move) : spec));
  const activeKey = active !== null && shown.some((spec) => spec.key === active) ? active : (shown[0]?.key ?? null);

  const moveCard = (row: PortfolioRow, to: LifecycleValue) => {
    setDragging(null);
    onMove(row, to);
  };

  const jump = (key: string) => {
    setActive(key);
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panels.current.get(key)?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.clientWidth === 0) return;
    const key = shown[Math.round(el.scrollLeft / (el.clientWidth + PANEL_GAP))]?.key;
    if (key && key !== activeKey) setActive(key);
  };

  const staleError = error ? (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
      {error} Showing the last result.
      <button type="button" onClick={portfolio.retry} className={QUIET}>
        Try again
      </button>
    </p>
  ) : null;

  const columnEls = columns.map((spec, index) => (
    <BoardColumn
      key={spec.key}
      spec={shown[index]}
      query={toApiQuery(params, { group_value: spec.key, limit: String(SECTION_PAGE_SIZE) })}
      enabled={spec.count > 0 && !spec.dropOnly}
      version={version + (columnBumps[spec.key] ?? 0)}
      currency={currency}
      isSm={isSm}
      canMove={canMove}
      saving={saving}
      move={move}
      filtered={filtered}
      openId={openId}
      dragging={dragging}
      onOpen={onOpen}
      onMove={moveCard}
      onDragStart={setDragging}
      onDragEnd={() => setDragging(null)}
      onRowsLoaded={onRowsLoaded}
      onShowChurned={onShowChurned}
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-busy={portfolio.loading}>
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
                onClick={() => jump(spec.key)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] ${
                  spec.key === activeKey ? 'bg-accent-dim font-semibold text-ink' : 'text-ink-muted hover:bg-subtle active:bg-line-subtle'
                } ${FOCUS}`}
              >
                {spec.label}
                {spec.dropOnly ? null : (
                  <>
                    {' '}
                    <span className="font-mono-brand tabular-nums text-[11px]">{spec.count}</span>
                  </>
                )}
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

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/portfolio`
Expected: PASS, including `PortfolioSections.test.tsx` (unchanged behaviour) and `houseRules.test.ts` over the new `.tsx` files.

- [ ] **Step 7: Commit**

```bash
git add src/components/organizations/portfolio/styles.ts src/components/organizations/portfolio/PortfolioSections.tsx src/components/organizations/portfolio/BoardColumn.tsx src/components/organizations/portfolio/PortfolioBoard.tsx src/components/organizations/portfolio/PortfolioBoard.test.tsx
git commit -m "feat(organizations): board columns that page themselves, take drops and snap on phones

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: `useBoardMove` and a PATCH-aware test stub

**Files:**
- Modify: `src/features/organizations/testPortfolio.ts` (the stub's book, `PATCH /customers/<id>/`, `patchBodies`)
- Create: `src/components/organizations/portfolio/useBoardMove.ts`
- Test: `src/components/organizations/portfolio/useBoardMove.test.tsx`

**Interfaces:**
- Consumes: `updateCustomer` (`customersSlice.ts`, a thunk that PATCHes `/customers/<id>/` and rejects with the server's message string), `useAppDispatch` (`src/hooks.ts`), `LIFECYCLE_LABELS`, `BoardMove` (Task 4).
- Produces:
  - `useBoardMove({onSaved, onChurn}): BoardMoveState`, where `BoardMoveState = { move: BoardMove | null; saving: boolean; notice: string | null; error: string | null; moveTo(row, to): void; dismissError(): void; reset(): void }`.
  - The stub gains `PortfolioStub.rows?: PortfolioRow[]` (the book the default answer reads, copied so PATCHes can change it) and `PortfolioStub.patch?: (id, body) => {status, body}`. The default PATCH applies `lifecycle_stage`: Churn marks the row churned and drops its signal.
  - `patchBodies(spy): {id: number; body: Record<string, unknown>}[]`.

- [ ] **Step 1: Teach the stub to PATCH**

In `src/features/organizations/testPortfolio.ts`:

Add below `import { LIFECYCLE_VALUES } from './portfolioParams';`:
```ts
import { LIFECYCLE_LABELS } from '../customers/formatters';
```

Replace the `PortfolioStub` interface:
```ts
export interface PortfolioStub {
  /** Answer the portfolio endpoint. Return `{status, body}` for an error. */
  portfolio?: (query: URLSearchParams) => PortfolioResponse | { status: number; body: unknown };
  bulk?: (body: BulkRequest) => BulkResult;
  customer?: unknown;
  /** GET /auth/members/ (the bulk owner targets). */
  members?: unknown[];
}
```
with:
```ts
export interface PortfolioStub {
  /** Answer the portfolio endpoint. Return `{status, body}` for an error. */
  portfolio?: (query: URLSearchParams) => PortfolioResponse | { status: number; body: unknown };
  bulk?: (body: BulkRequest) => BulkResult;
  customer?: unknown;
  /** GET /auth/members/ (the bulk owner targets). */
  members?: unknown[];
  /** The book the default portfolio answer reads (default ALL_ROWS). It is
   *  copied, and a PATCH to /customers/<id>/ writes into the copy, so a
   *  reload after a move sees the move. */
  rows?: PortfolioRow[];
  /** Answer PATCH /customers/<id>/ yourself (for a failure, say). */
  patch?: (id: number, body: Record<string, unknown>) => { status: number; body: unknown };
}

/** What PATCH /customers/<id>/ does to the stub's book: a new stage. Churn
 *  marks the row churned, and a churned row carries no signal (backend rule). */
function applyPatch(book: PortfolioRow[], id: number, body: Record<string, unknown>) {
  const index = book.findIndex((row) => row.id === id);
  if (index < 0) return { status: 404, body: { detail: 'Not found.' } };
  const stage = body.lifecycle_stage as LifecycleValue | undefined;
  if (stage) {
    const churned = book[index].churned || stage === 'churn';
    book[index] = {
      ...book[index],
      lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] },
      churned,
      signal: churned ? null : book[index].signal,
    };
  }
  return {
    status: 200,
    body: { ...customerFixture, id, name: book[index].name, lifecycle_stage: book[index].lifecycle.value },
  };
}
```

In `stubPortfolio`, replace:
```ts
export function stubPortfolio(stub: PortfolioStub = {}) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/organizations/portfolio/') {
      const out = (stub.portfolio ?? ((q: URLSearchParams) => buildPortfolio(q)))(url.searchParams);
```
with:
```ts
export function stubPortfolio(stub: PortfolioStub = {}) {
  const book = [...(stub.rows ?? ALL_ROWS)];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/organizations/portfolio/') {
      const out = (stub.portfolio ?? ((q: URLSearchParams) => buildPortfolio(q, book)))(url.searchParams);
```
and replace:
```ts
    if (/^\/customers\/\d+\/$/.test(path) && stub.customer) return json(200, stub.customer);
```
with:
```ts
    const customer = /^\/customers\/(\d+)\/$/.exec(path);
    if (customer && init?.method === 'PATCH') {
      const id = Number(customer[1]);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const out = stub.patch ? stub.patch(id, body) : applyPatch(book, id, body);
      return json(out.status, out.body);
    }
    if (customer && stub.customer) return json(200, stub.customer);
```

Append at the end of the file:
```ts

/** Every PATCH /customers/<id>/ so far, oldest first. */
export function patchBodies(spy: FetchSpy): { id: number; body: Record<string, unknown> }[] {
  return spy.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input)).pathname, init }))
    .filter(({ path, init }) => init?.method === 'PATCH' && /\/customers\/\d+\/$/.test(path))
    .map(({ path, init }) => ({
      id: Number(/\/customers\/(\d+)\/$/.exec(path)![1]),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    }));
}
```

- [ ] **Step 2: Check the List still passes on the new stub**

Run: `npx vitest run src/pages/organizations/List.test.tsx src/e2e/organizationsPortfolio.test.tsx`
Expected: PASS. The List's Edit details and Churn now PATCH through the stub's book. They get a 200 as before, now with a `customerFixture`-shaped body.

- [ ] **Step 3: Write the failing test**

`src/components/organizations/portfolio/useBoardMove.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer from '../../../features/customers/customersSlice';
import { patchBodies, pizzaHut, stubPortfolio } from '../../../features/organizations/testPortfolio';
import { useBoardMove } from './useBoardMove';

function setup() {
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onSaved = vi.fn();
  const onChurn = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useBoardMove({ onSaved, onChurn }), { wrapper });
  return { ...hook, onSaved, onChurn };
}

describe('useBoardMove', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the move at once, saves it with one PATCH, then reports it', async () => {
    const spy = stubPortfolio();
    const { result, onSaved } = setup();
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    expect(result.current.move).toMatchObject({ row: pizzaHut, from: 'live', to: 'adoption' });
    expect(result.current.saving).toBe(true);
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(patchBodies(spy)).toEqual([{ id: 7, body: { lifecycle_stage: 'adoption' } }]);
    expect(onSaved).toHaveBeenCalledWith(result.current.move);
    expect(result.current.notice).toBe('Moved Pizza Hut to Adoption.');
    expect(result.current.error).toBeNull();
  });

  it('puts it back with the server reason when the save fails', async () => {
    stubPortfolio({ patch: () => ({ status: 403, body: { detail: 'You do not have permission to perform this action.' } }) });
    const { result, onSaved } = setup();
    act(() => result.current.moveTo(pizzaHut, 'renewal'));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.move).toBeNull();
    expect(result.current.error).toBe("Couldn't move Pizza Hut to Renewal. You do not have permission to perform this action.");
    expect(onSaved).not.toHaveBeenCalled();
    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it('hands churn to the modal without a PATCH, and ignores a move to the same stage', () => {
    const spy = stubPortfolio();
    const { result, onChurn } = setup();
    act(() => result.current.moveTo(pizzaHut, 'churn'));
    expect(onChurn).toHaveBeenCalledWith(pizzaHut);
    act(() => result.current.moveTo(pizzaHut, 'live'));
    expect(result.current.move).toBeNull();
    expect(patchBodies(spy)).toEqual([]);
  });

  it('takes one move at a time, and forgets the last one on reset', async () => {
    const spy = stubPortfolio();
    const { result } = setup();
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    act(() => result.current.moveTo(pizzaHut, 'renewal'));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(patchBodies(spy)).toHaveLength(1);
    expect(result.current.move?.to).toBe('adoption');
    act(() => result.current.reset());
    expect(result.current.move).toBeNull();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/portfolio/useBoardMove.test.tsx`
Expected: FAIL with "Failed to resolve import "./useBoardMove"".

- [ ] **Step 5: Implement**

`src/components/organizations/portfolio/useBoardMove.ts`:
```ts
import { useCallback, useRef, useState } from 'react';
import { useAppDispatch } from '../../../hooks';
import { updateCustomer } from '../../../features/customers/customersSlice';
import { LIFECYCLE_LABELS } from '../../../features/customers/formatters';
import type { LifecycleValue, PortfolioRow } from '../../../features/organizations/portfolioTypes';
import type { BoardMove } from './boardMove';

export interface BoardMoveState {
  /** The latest move. It shows at once and stays until the reloads it
   *  triggers land (useOverlayActive). Null after a failure, so the card
   *  goes back. */
  move: BoardMove | null;
  saving: boolean;
  /** "Moved Pizza Hut to Adoption.", for a polite live region. */
  notice: string | null;
  /** The failure, ending with the server's reason. */
  error: string | null;
  moveTo: (row: PortfolioRow, to: LifecycleValue) => void;
  dismissError: () => void;
  /** Forget the last move (a different list landed). */
  reset: () => void;
}

/** Moving one account between lifecycle columns (owner decisions
 *  2026-09-26). The move is optimistic and one at a time. It saves through
 *  the single-customer PATCH, which applies the archive gate, the
 *  inactive-owner rule and every other update rule, and it rolls back with
 *  the server's reason. Churn is never PATCHed from here: the row goes to
 *  `onChurn`, whose ChurnOrganizationModal records the date and reason. */
export function useBoardMove({
  onSaved,
  onChurn,
}: {
  onSaved: (move: BoardMove) => void;
  onChurn: (row: PortfolioRow) => void;
}): BoardMoveState {
  const dispatch = useAppDispatch();
  const [move, setMove] = useState<BoardMove | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const moveTo = useCallback(
    (row: PortfolioRow, to: LifecycleValue) => {
      const from = row.lifecycle.value;
      if (to === from || saving) return;
      setError(null);
      setNotice(null);
      if (to === 'churn') {
        onChurn(row);
        return;
      }
      tokenRef.current += 1;
      const next: BoardMove = { token: tokenRef.current, row, from, to };
      setMove(next);
      setSaving(true);
      dispatch(updateCustomer({ id: row.id, lifecycle_stage: to }))
        .unwrap()
        .then(
          () => {
            setNotice(`Moved ${row.name} to ${LIFECYCLE_LABELS[to]}.`);
            onSaved(next);
          },
          (reason: unknown) => {
            setMove((current) => (current?.token === next.token ? null : current));
            const why = typeof reason === 'string' ? reason : 'Could not update organization.';
            setError(`Couldn't move ${row.name} to ${LIFECYCLE_LABELS[to]}. ${why}`);
          },
        )
        .finally(() => setSaving(false));
    },
    [dispatch, onChurn, onSaved, saving],
  );

  const dismissError = useCallback(() => setError(null), []);
  const reset = useCallback(() => setMove(null), []);

  return { move, saving, notice, error, moveTo, dismissError, reset };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/portfolio/useBoardMove.test.tsx src/features/organizations`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/organizations/testPortfolio.ts src/components/organizations/portfolio/useBoardMove.ts src/components/organizations/portfolio/useBoardMove.test.tsx
git commit -m "feat(organizations): optimistic board move saved by the single-customer PATCH, with rollback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: The page: rewrite `Board.tsx` on the portfolio (integration tests, phones included)

**Files:**
- Modify (rewrite): `src/pages/organizations/Board.tsx`
- Modify (rewrite): `src/pages/organizations/Board.test.tsx`
- Modify (rewrite): `src/pages/organizations/testList.tsx`
- Modify: `src/pages/organizations/OrganizationsFrame.tsx` (its comment only)

**Interfaces:**
- Consumes: everything from Tasks 1–8; `SummaryTiles`, `FilterChips`, `AccountSheet`, `usePortfolio`, `errorMessage` (existing); `OrganizationFormModal`, `ChurnOrganizationModal` (unchanged); `apiFetch`, `exportPortfolio`; `useOrgCurrency`, `useAppSelector`; `SM`, `useMediaQuery`; `Navbar` and `notificationsSlice` (for the test harness).
- Produces:
  - `Board` (same export name, so the route in `App.tsx` is unchanged).
  - Test helpers `renderOrganizations(url: string, opts?: { width?: number; nav?: boolean })` (both Organizations routes, and the real `Navbar` with `nav`), `renderList(url?, {width?})`, `renderBoard(url?, {width?})` and `Where` (`data-testid="where"`).

- [ ] **Step 1: Rewrite the test helper**

Replace the whole of `src/pages/organizations/testList.tsx` with:
```tsx
// Test-only helpers, never hot-reloaded: Where sits beside the render
// helpers so a test imports one module, not two.
/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { Board } from './Board';
import { List } from './List';

// Test-only. The real auth, customers and notifications slices (the modals
// dispatch into customers; the Navbar reads notifications). Only fetch is
// stubbed, by the caller, with stubPortfolio().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
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

/** Both Organizations routes (and the organization page they link to) on the
 *  real store and router. `nav` adds the real Navbar, whose List/Board tabs
 *  switch between them carrying the query. */
export function renderOrganizations(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        {nav ? <Navbar /> : null}
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
          <Route
            path="/organizations/board"
            element={
              <>
                <Board />
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

export function renderList(url = '/organizations/list', { width = 1440 }: { width?: number } = {}) {
  return renderOrganizations(url, { width });
}

export function renderBoard(url = '/organizations/board', { width = 1440 }: { width?: number } = {}) {
  return renderOrganizations(url, { width });
}
```
The `auth` object is the one `testList.tsx` preloads today, key for key.

- [ ] **Step 2: Rewrite the integration test (it fails against today's board)**

Replace the whole of `src/pages/organizations/Board.test.tsx` with:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderBoard } from './testList';
import { resetViewport } from '../../test/viewport';
import {
  buildPortfolio,
  customerFixture,
  patchBodies,
  portfolioQueries,
  stubPortfolio,
} from '../../features/organizations/testPortfolio';

// Integration tier: the real page, store and router; fetch stubbed with
// §2-shaped bodies, and PATCH /customers/<id>/ writing into the stub's book
// (features/organizations/testPortfolio.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const heading = (key: string) => within(column(key)).getByRole('heading');
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: 'all', dropEffect: 'none' });
const ready = async () => {
  await screen.findByRole('link', { name: 'Pizza Hut' });
  await screen.findByRole('link', { name: 'Globex' });
};

/** Holds every PATCH until release(); everything else goes straight to the stub. */
function holdPatches(spy: ReturnType<typeof stubPortfolio>) {
  const waiting: (() => void)[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') await new Promise<void>((resolve) => waiting.push(resolve));
    return spy(input, init);
  });
  return { release: () => waiting.splice(0).forEach((resolve) => resolve()) };
}

describe('Organizations board (portfolio)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("shares the List's top half and groups by lifecycle by default", async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    expect(screen.getByRole('group', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toBeInTheDocument();
    expect(screen.getByText('2 organizations')).toBeInTheDocument();
    const [frame] = portfolioQueries(spy);
    expect(frame.get('group')).toBe('lifecycle');
    expect(frame.get('limit')).toBe('1');
    expect(column('live')).toContainElement(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(heading('adoption')).toHaveTextContent('Adoption · 1 · $120K');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('lifecycle');
    // No selection mode and no pinned fields on the Board.
    expect(screen.queryByRole('button', { name: 'Pin fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Select / })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
    expect(where().search).toBe('');
  });

  it('filters through the URL like the List; group=none still shows lifecycle columns', async () => {
    const spy = stubPortfolio();
    renderBoard('/organizations/board?group=none&owner=2');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(portfolioQueries(spy)[0].get('group')).toBe('lifecycle');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('lifecycle');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Owner: Carl CSM' }));
    expect(where().searchParams.has('owner')).toBe(false);
    expect(where().searchParams.get('group')).toBe('none');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'health');
    expect(where().searchParams.get('group')).toBe('health');
    expect(await screen.findByRole('heading', { name: 'Average · 1 · $69.6K' })).toBeInTheDocument();
    await within(column('average')).findByRole('link', { name: 'Pizza Hut' });
    expect(screen.queryByRole('combobox', { name: 'Move Pizza Hut to' })).not.toBeInTheDocument();
  });

  it('moves a card optimistically with Move to…, saves one PATCH, then reloads the frame and the two columns', async () => {
    const spy = stubPortfolio();
    const gate = holdPatches(spy);
    renderBoard();
    await ready();
    const before = portfolioQueries(spy).length;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move Pizza Hut to' }), 'renewal');

    // At once: the card sits in Renewal, the counts follow, and moving is off while it saves.
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(column('live')).queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(heading('renewal')).toHaveTextContent('Renewal · 1 · $69.6K');
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    expect(screen.getByRole('combobox', { name: 'Move Globex to' })).toBeDisabled();

    gate.release();
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 7, body: { lifecycle_stage: 'renewal' } }]));
    expect(await screen.findByText('Moved Pizza Hut to Renewal.')).toBeInTheDocument();
    await waitFor(() => {
      const after = portfolioQueries(spy).slice(before);
      expect(after.some((q) => q.get('limit') === '1' && !q.has('group_value'))).toBe(true);
      expect(after.some((q) => q.get('group_value') === 'renewal')).toBe(true);
    });
    // Only the columns the move touched reload.
    expect(portfolioQueries(spy).slice(before).some((q) => q.get('group_value') === 'adoption')).toBe(false);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Move Globex to' })).toBeEnabled());
    expect(heading('renewal')).toHaveTextContent('Renewal · 1 · $69.6K');
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it("puts the card back with the server's reason when the save fails", async () => {
    stubPortfolio({ patch: () => ({ status: 403, body: { detail: 'You do not have permission to perform this action.' } }) });
    renderBoard();
    await ready();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move Pizza Hut to' }), 'adoption');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't move Pizza Hut to Adoption. You do not have permission to perform this action.",
    );
    expect(within(column('live')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(column('adoption')).queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(heading('live')).toHaveTextContent('Live · 1 · $69.6K');
    expect(heading('adoption')).toHaveTextContent('Adoption · 1 · $120K');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('drags a card between lifecycle columns', async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    const dt = dataTransfer();
    fireEvent.dragStart(card(1), { dataTransfer: dt });
    fireEvent.dragOver(column('live'), { dataTransfer: dt });
    fireEvent.drop(column('live'), { dataTransfer: dt });
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 1, body: { lifecycle_stage: 'live' } }]));
    await waitFor(() => expect(within(column('live')).getByRole('link', { name: 'Globex' })).toBeInTheDocument());
    await waitFor(() => expect(heading('live')).toHaveTextContent('Live · 2 · $189.6K'));
  });

  it('opens the churn modal on a drop into Churn: cancel changes nothing, confirming churns and reloads', async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    const dt = dataTransfer();
    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('churn'), { dataTransfer: dt });
    fireEvent.drop(column('churn'), { dataTransfer: dt });
    expect(screen.getByRole('heading', { name: 'Churn Pizza Hut?' })).toBeInTheDocument();
    const before = portfolioQueries(spy).length;
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Churn Pizza Hut?' })).not.toBeInTheDocument();
    expect(patchBodies(spy)).toEqual([]);
    expect(portfolioQueries(spy)).toHaveLength(before);
    expect(within(column('live')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();

    // The same modal from the Move to… menu; confirming PATCHes churn and reloads the board.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move Pizza Hut to' }), 'churn');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Churn' }));
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(1));
    expect(patchBodies(spy)[0]).toMatchObject({ id: 7, body: { lifecycle_stage: 'churn', churn_reason: '' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument());
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    expect(screen.getByText('1 organization')).toBeInTheDocument();
  });

  it('lists churned cards in Churn once the view includes them', async () => {
    stubPortfolio();
    renderBoard();
    await ready();
    expect(within(column('churn')).getByText('Churned accounts are hidden.')).toBeInTheDocument();
    await userEvent.click(within(column('churn')).getByRole('button', { name: 'Show churned' }));
    expect(where().searchParams.get('include_churned')).toBe('1');
    expect(screen.getByRole('button', { name: 'Remove Includes churned' })).toBeInTheDocument();
    expect(column('churn')).toContainElement(await screen.findByRole('link', { name: 'Initech' }));
    expect(heading('churn')).toHaveTextContent('Churn · 1 · $30K');
  });

  it('opens a card beside the board from sm, with Edit details, and keeps the board in place', async () => {
    stubPortfolio({ customer: customerFixture });
    renderBoard();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    const panel = screen.getByRole('complementary', { name: 'Pizza Hut' });
    expect(within(panel).getByText('Detractor')).toBeInTheDocument();
    expect(column('live')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Pizza Hut' })).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Pizza Hut' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Pizza Hut' })).not.toBeInTheDocument());

    await userEvent.click(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });

  it('lays columns out as snapping panels with column tabs on phones, and opens cards in the bottom sheet', async () => {
    const spy = stubPortfolio();
    renderBoard('/organizations/board', { width: 375 });
    await ready();
    const tabs = screen.getByRole('navigation', { name: 'Board columns' });
    expect(column('live')).toHaveClass('w-full', 'snap-start');
    expect(card(7)).toHaveAttribute('draggable', 'false');

    await userEvent.click(within(column('live')).getByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('dialog', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move Pizza Hut to' }), 'renewal');
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(1));
    expect(within(tabs).getByRole('button', { name: 'Renewal 1' })).toBeInTheDocument();
    await waitFor(() => expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument());
  });

  it('shows a designed error with Try again when the board cannot load', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Server error' } } : buildPortfolio(q)) });
    renderBoard();
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/pages/organizations/Board.test.tsx`
Expected: FAIL. Today's board reads `/customers/` (the stub answers 404 "Not stubbed: /customers/"), so there are no tiles, no `[data-column]` sections and no Move to… menus.

- [ ] **Step 4: Rewrite the page**

Replace the whole of `src/pages/organizations/Board.tsx` with:
```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppSelector, useOrgCurrency } from '../../hooks';
import { apiFetch } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import type { Customer } from '../../features/customers/customersSlice';
import { exportPortfolio } from '../../features/organizations/portfolioApi';
import { BOARD_GROUP, boardParams, hasFilters, toApiQuery } from '../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../features/organizations/portfolioTypes';
import { OrganizationFormModal } from '../../components/organizations/OrganizationFormModal';
import { ChurnOrganizationModal } from '../../components/organizations/ChurnOrganizationModal';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { AccountSidePanel } from '../../components/organizations/portfolio/AccountSidePanel';
import type { BoardMove } from '../../components/organizations/portfolio/boardMove';
import { BOARD_GROUP_OPTIONS } from '../../components/organizations/portfolio/FiltersPanel';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioBoard } from '../../components/organizations/portfolio/PortfolioBoard';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { useBoardMove } from '../../components/organizations/portfolio/useBoardMove';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { FOCUS } from '../../components/organizations/portfolio/styles';
import { OrganizationsFrame } from './OrganizationsFrame';

/** /organizations/board: the portfolio as columns (spec 2026-09-25 §1
 *  "Board", owner decisions 2026-09-26). The top half is the List's: tiles,
 *  toolbar, chips and "N of M", on the same URL params, so switching tabs
 *  keeps the filters. Group defaults to lifecycle here. Each column pages
 *  itself. A card moves by drag or Move to…, and the move PATCHes that one
 *  customer. No selection mode: bulk work stays on the List. */
export function Board() {
  const { params: urlParams, update, clearFilters } = usePortfolioParams(BOARD_GROUP);
  const params = useMemo(() => boardParams(urlParams), [urlParams]);
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();
  const defaultLifecycleStage = useAppSelector(
    (state) => state.auth.user?.organisation.default_lifecycle_stage || undefined,
  ) as Customer['lifecycle_stage'] | undefined;

  // `version` reloads everything (Add, Edit details, Churn). A saved move
  // reloads only the frame and the two columns it touched.
  const [version, setVersion] = useState(0);
  const [frameBump, setFrameBump] = useState(0);
  const [columnBumps, setColumnBumps] = useState<Record<string, number>>({});
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const portfolio = usePortfolio(params, version + frameBump);

  const [openRow, setOpenRow] = useState<PortfolioRow | null>(null);
  // Any column's page landing swaps the opened card for its fresh copy, so
  // the side panel or sheet shows what a reload brought back.
  const onRowsLoaded = useCallback((rows: PortfolioRow[]) => {
    setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
  }, []);

  const [churning, setChurning] = useState<PortfolioRow | null>(null);
  const onSaved = useCallback((move: BoardMove) => {
    setFrameBump((n) => n + 1);
    setColumnBumps((bumps) => ({
      ...bumps,
      [move.from]: (bumps[move.from] ?? 0) + 1,
      [move.to]: (bumps[move.to] ?? 0) + 1,
    }));
  }, []);
  const board = useBoardMove({ onSaved, onChurn: setChurning });

  // A different list landing (a filter, sort or group change) forgets the
  // last move, so a column mounting later never replays it. Adjusted during
  // render, not in an effect.
  const { loadedQuery } = portfolio;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    board.reset();
  }

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;

  const toggleOpen = useCallback((row: PortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)), []);
  const closeOpen = useCallback(() => setOpenRow(null), []);

  const openEdit = useCallback(async (id: number) => {
    setNotice(null);
    try {
      setEditing(await apiFetch<Customer>(`/customers/${id}/`));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not open this organization for editing.'));
    }
  }, []);

  const runExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      await exportPortfolio(toApiQuery(params));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not export organizations.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <OrganizationsFrame>
      <div className="flex h-full min-h-0 flex-col gap-4 pb-4">
        <div className="flex shrink-0 flex-col gap-4">
          <SummaryTiles
            summary={portfolio.data?.summary ?? null}
            failed={failed}
            currency={currency}
            params={params}
            onFilter={update}
          />
          <PortfolioToolbar
            params={params}
            update={update}
            options={options}
            isSm={isSm}
            onExport={() => void runExport()}
            exporting={exporting}
            onAdd={() => setAdding(true)}
            searchRef={searchRef}
            groupOptions={BOARD_GROUP_OPTIONS}
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
            <p role="alert" className="text-[13px] text-danger">
              {notice}
            </p>
          ) : null}
          {board.error ? (
            <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
              {board.error}
              <button
                type="button"
                onClick={board.dismissError}
                aria-label="Dismiss"
                className={`inline-flex w-11 h-11 sm:w-8 sm:h-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="sr-only">
            {board.notice ?? ''}
          </p>
        </div>
        <div className="flex min-h-[24rem] flex-1 gap-3">
          <PortfolioBoard
            params={params}
            portfolio={portfolio}
            version={version}
            columnBumps={columnBumps}
            currency={currency}
            isSm={isSm}
            filtered={hasFilters(params)}
            move={board.move}
            saving={board.saving}
            openId={openRow?.id ?? null}
            onOpen={toggleOpen}
            onMove={board.moveTo}
            onRowsLoaded={onRowsLoaded}
            onClearFilters={clearFilters}
            onAdd={() => setAdding(true)}
            onShowChurned={() => update({ include_churned: true })}
          />
          {isSm && openRow ? <AccountSidePanel row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}
        </div>
      </div>

      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}

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
          customerIds={[churning.id]}
          customerNames={[churning.name]}
          onChurned={reload}
          onClose={() => setChurning(null)}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
```

In `src/pages/organizations/OrganizationsFrame.tsx`, replace the comment's first line:
```tsx
/** The Organizations list's frame: DashboardFrame's body, class for class
```
with:
```tsx
/** The Organizations list's and board's frame: DashboardFrame's body, class for class
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/organizations src/components/organizations/portfolio`
Expected: PASS: the new `Board.test.tsx` (10 tests), `List.test.tsx` through the rewritten `testList.tsx`, `OrganizationsFrame.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/organizations/Board.tsx src/pages/organizations/Board.test.tsx src/pages/organizations/testList.tsx src/pages/organizations/OrganizationsFrame.tsx
git commit -m "feat(organizations): the board moves onto the portfolio with the list's top half

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Chrome: the transparent top bar and `p-0` on `/organizations/board`, and tabs that carry the query

**Files:**
- Modify: `src/components/layout/Navbar.tsx` (the `isOrgList` block around line 126, the `isOrgList ?` branch, the views `NavLink`)
- Modify: `src/components/layout/Navbar.test.tsx`
- Modify: `src/layouts/DashboardLayout.tsx`
- Modify: `src/layouts/DashboardLayout.test.tsx`

**Interfaces:**
- Consumes: `useLocation()` (already in both files).
- Produces: `isOrgView` (both files) matches `/organizations/list` and `/organizations/board`. The views nav links to `{ pathname, search: location.search }`.

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Navbar.test.tsx`:
- In `renderNavbar`'s `<Routes>`, add after `<Route path="/organizations/board" element={<div>Organizations Marker</div>} />`:
  ```tsx
            <Route path="/pipelines/board" element={<div>Pipelines Marker</div>} />
  ```
- In `describe('Navbar account menu', …)`, replace each of the five `renderNavbar('/organizations/board');` calls with `renderNavbar('/pipelines/board');`, and replace `await user.click(screen.getByText('Organizations Marker'));` with `await user.click(screen.getByText('Pipelines Marker'));`. The board now wears the frame, which has no avatar, so the menu tests need an unframed page.
- In the test `'keeps the other pages as they were, with no slot'`, replace `renderNavbar('/organizations/board', null, null, [], setSlot);` with `renderNavbar('/pipelines/board', null, null, [], setSlot);`.
- Replace the whole test:
  ```tsx
  it('leaves the board header as it was', () => {
    renderNavbar('/organizations/board');
    expect(document.querySelector('header')).toHaveClass('h-[64px]', 'border-b', 'bg-surface');
    expect(screen.queryByRole('navigation', { name: 'Organizations views' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board');
  });
  ```
  with:
  ```tsx
  it('wears the same frame on /organizations/board, and both tabs carry the query', () => {
    const setSlot = vi.fn();
    renderNavbar('/organizations/board?owner=2&health=poor', null, null, [], setSlot);
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    for (const cls of ['bg-surface', 'border-b', 'shadow-sm']) expect(header).not.toHaveClass(cls);
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(header!.querySelector('[data-nav-actions-slot]')).not.toBeNull();
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
    const views = screen.getByRole('navigation', { name: 'Organizations views' });
    expect(within(views).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/organizations/list?owner=2&health=poor');
    const board = within(views).getByRole('link', { name: 'Board' });
    expect(board).toHaveAttribute('href', '/organizations/board?owner=2&health=poor');
    expect(board).toHaveAttribute('aria-current', 'page');
  });
  ```

In `src/layouts/DashboardLayout.test.tsx`, replace:
```tsx
  it.each(['/dashboard/overview', '/communications', '/organizations/list'])('adds no padding around %s', (url) => {
```
with:
```tsx
  it.each(['/dashboard/overview', '/communications', '/organizations/list', '/organizations/board'])('adds no padding around %s', (url) => {
```
and replace:
```tsx
    const main = renderAt('/organizations/board');
```
with:
```tsx
    const main = renderAt('/accounts/list');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.test.tsx`
Expected: FAIL. The board's header is still the bordered one, the tabs have no query, and `<main>` pads `/organizations/board`.

- [ ] **Step 3: Implement**

In `src/components/layout/Navbar.tsx`, replace:
```tsx
  // The Organizations list wears the dashboard's frame (portfolio spec §1):
  // the transparent top bar, the actions slot (empty until Ask Revenact
  // lands on Organizations), and no avatar. The board keeps today's header
  // until it moves onto the portfolio (delivery 2).
  const isOrgList = location.pathname === '/organizations/list';
  const isFramed = isDashboard || isOrgList;
```
with:
```tsx
  // The Organizations list and board wear the dashboard's frame (portfolio
  // spec §1, owner decisions 2026-09-26): the transparent top bar, the
  // actions slot (empty until Ask Revenact lands on Organizations), and no
  // avatar.
  const isOrgView = location.pathname === '/organizations/list' || location.pathname === '/organizations/board';
  const isFramed = isDashboard || isOrgView;
```
Replace:
```tsx
        ) : isOrgList ? (
```
with:
```tsx
        ) : isOrgView ? (
```
and in that branch replace:
```tsx
                <NavLink
                  key={view.to}
                  to={view.to}
```
with:
```tsx
                <NavLink
                  key={view.to}
                  // The two views share their URL state (filters, sort,
                  // group), so switching tabs keeps it.
                  to={{ pathname: view.to, search: location.search }}
```

In `src/layouts/DashboardLayout.tsx`, replace:
```tsx
  // The Organizations list pads itself the same way (OrganizationsFrame).
  const isOrgList = location.pathname === '/organizations/list';
```
with:
```tsx
  // The Organizations list and board pad themselves the same way (OrganizationsFrame).
  const isOrgView = location.pathname === '/organizations/list' || location.pathname === '/organizations/board';
```
and replace `|| isDashboard || isOrgList)` with `|| isDashboard || isOrgView)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout src/layouts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat(organizations): the board wears the list's frame, and the tabs carry the filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Retire `MetricsPanel` and `RenewalPopover`

**Files:**
- Delete: `src/components/organizations/MetricsPanel.tsx`, `src/components/organizations/MetricsPanel.test.tsx`, `src/components/organizations/RenewalPopover.tsx`
- Modify: `src/components/accounts/MetricsPanel.test.tsx` (one comment line)
- **Keep:**
  - `components/pipelines/KanbanBoard.tsx`: `pages/pipelines/PipelinesPage.tsx`, `components/shared/PipelinesTab.tsx` and `pages/accounts/Board.tsx` use it.
  - `components/accounts/MetricsPanel.tsx`, `components/contacts/MetricsPanel.tsx`: separate files, used by Accounts and Contacts.
  - `fetchUpcomingRenewals`/`fetchCustomerStats` in `customersSlice.ts`: `pages/health/HealthDistribution.tsx` and `pages/lifecycle/LifecyclePage.tsx` use them.

**Interfaces:** none. This removes files nothing imports after Task 9.

- [ ] **Step 1: Prove nothing else imports them**

Run:
```bash
grep -rnE "organizations/MetricsPanel|organizations/RenewalPopover|from '\./(MetricsPanel|RenewalPopover)'" src
```
Expected: exactly four hits:
- `src/components/organizations/MetricsPanel.tsx` importing `./RenewalPopover`.
- `src/components/organizations/MetricsPanel.test.tsx` importing `./MetricsPanel`.
- `src/components/accounts/MetricsPanel.test.tsx:7` importing its own `./MetricsPanel` (the accounts one, a different file, which stays).
- The same file's comment on line 14, naming `organizations/MetricsPanel.test.tsx`.

If any other file appears (in particular `pages/organizations/Board.tsx`), stop: it still depends on the old panel.

- [ ] **Step 2: Delete them and reword the dangling comment**

```bash
git rm src/components/organizations/MetricsPanel.tsx src/components/organizations/MetricsPanel.test.tsx src/components/organizations/RenewalPopover.tsx
```
In `src/components/accounts/MetricsPanel.test.tsx`, replace:
```tsx
// (see organizations/MetricsPanel.test.tsx, which this mirrors).
```
with:
```tsx
// (it mirrored the organizations MetricsPanel test, retired with the old board).
```

- [ ] **Step 3: Check nothing broke**

Run: `npx tsc -b --noEmit && npx vitest run --maxWorkers=2 src/components/organizations src/components/accounts src/pages/organizations src/pages/accounts src/pages/health src/pages/lifecycle src/pages/pipelines`
Expected: no type errors, all pass.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/organizations src/components/accounts/MetricsPanel.test.tsx
git commit -m "refactor(organizations): retire MetricsPanel and RenewalPopover with the old board

KanbanBoard stays for Pipelines and the Accounts board.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: End-to-end (jsdom): list filter → board tab → open → move → drag into Churn → back; and a long column on a phone

**Files:**
- Create: `src/e2e/organizationsBoard.test.tsx`

**Interfaces:**
- Consumes: `renderOrganizations` (Task 9), `stubPortfolio`, `patchBodies`, `portfolioQueries`, `pizzaHut` (Tasks 1 and 8 of delivery 1, extended in Task 8), `installIntersectionObserver` (Task 3), the real `Navbar` (Task 10).
- Produces: no production code. This is the "board" step of spec §5's e2e flow; "ask" joins in delivery 3.

- [ ] **Step 1: Write the flows**

`src/e2e/organizationsBoard.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderOrganizations } from '../pages/organizations/testList';
import { patchBodies, pizzaHut, portfolioQueries, stubPortfolio } from '../features/organizations/testPortfolio';
import { installIntersectionObserver } from '../test/intersection';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, both Organizations
// pages, the store and the router. Only fetch is stubbed, with §2-shaped
// bodies, and PATCH /customers/<id>/ writes into the stub's book.
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const views = () => screen.getByRole('navigation', { name: 'Organizations views' });

describe('Organizations board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('keeps a list filter on the board, opens a card, moves it, churns it by drag, and goes back', { timeout: 30000 }, async () => {
    const spy = stubPortfolio();
    renderOrganizations('/organizations/list', { nav: true });
    await screen.findByRole('link', { name: 'Globex' });

    // 1. Filter on the List: owner Carl CSM.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();

    // 2. The Board tab in the real top bar carries the filter; the board groups by lifecycle.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where().pathname).toBe('/organizations/board');
    expect(where().searchParams.get('owner')).toBe('2');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Owner: Carl CSM' })).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(column('live')).toContainElement(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument();
    expect(
      portfolioQueries(spy).some((q) => q.get('group') === 'lifecycle' && q.get('owner') === '2' && q.get('limit') === '1'),
    ).toBe(true);

    // 3. Open Pizza Hut beside the board.
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByText('Detractor')).toBeInTheDocument();

    // 4. Move it to Renewal with its Move to… menu (the keyboard path); the open panel follows.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move Pizza Hut to' }), 'renewal');
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 7, body: { lifecycle_stage: 'renewal' } }]));
    expect(await screen.findByText('Moved Pizza Hut to Renewal.')).toBeInTheDocument();
    await waitFor(() => expect(within(column('renewal')).getByRole('heading')).toHaveTextContent('Renewal · 1 · $69.6K'));
    expect(within(column('live')).getByRole('heading')).toHaveTextContent('Live · 0 · $0');
    await waitFor(() =>
      expect(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByText(/^Carl CSM · Renewal ·/)).toBeInTheDocument(),
    );

    // 5. Drag it into Churn: the churn modal opens; confirming churns it and it leaves the board.
    const dt = { setData: vi.fn(), effectAllowed: 'all', dropEffect: 'none' };
    fireEvent.dragStart(document.querySelector('[data-card-id="7"]') as HTMLElement, { dataTransfer: dt });
    fireEvent.dragOver(column('churn'), { dataTransfer: dt });
    fireEvent.drop(column('churn'), { dataTransfer: dt });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Churn' }));
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(2));
    expect(patchBodies(spy)[1].body).toMatchObject({ lifecycle_stage: 'churn' });
    expect(await screen.findByText('No organizations match these filters')).toBeInTheDocument();

    // 6. Back to the List: the filter is still there.
    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    expect(where().pathname).toBe('/organizations/list');
    expect(where().searchParams.get('owner')).toBe('2');
  });

  it('pages a long column as it scrolls, and moves a card on a phone from the column tabs', { timeout: 30000 }, async () => {
    const io = installIntersectionObserver();
    const many = Array.from({ length: 30 }, (_, i) => ({ ...pizzaHut, id: 100 + i, name: `Account ${i + 1}` }));
    const spy = stubPortfolio({ rows: many });
    renderOrganizations('/organizations/board', { width: 375, nav: true });
    await screen.findByRole('link', { name: 'Account 1' });
    const live = column('live');
    expect(within(live).getAllByRole('link')).toHaveLength(25);
    await act(async () => io.reveal(live.querySelector('[data-sentinel]')!));
    await waitFor(() => expect(within(live).getAllByRole('link')).toHaveLength(30));

    Element.prototype.scrollIntoView = vi.fn();
    const tabs = screen.getByRole('navigation', { name: 'Board columns' });
    await userEvent.click(within(tabs).getByRole('button', { name: 'Renewal 0' }));
    expect(within(tabs).getByRole('button', { name: 'Renewal 0' })).toHaveAttribute('aria-current', 'true');

    await userEvent.selectOptions(within(live).getByRole('combobox', { name: 'Move Account 1 to' }), 'renewal');
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 100, body: { lifecycle_stage: 'renewal' } }]));
    await waitFor(() => expect(within(tabs).getByRole('button', { name: 'Renewal 1' })).toBeInTheDocument());
    await waitFor(() => expect(within(column('renewal')).getByRole('link', { name: 'Account 1' })).toBeInTheDocument());
    await waitFor(() => expect(within(tabs).getByRole('button', { name: 'Live 29' })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/organizationsBoard.test.tsx`
Expected: PASS (2 tests). A failure here means a wiring bug in Tasks 9–10 (a prop not passed through, or the tabs dropping the query). Fix it in `Board.tsx` or `Navbar.tsx` rather than weakening the test.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/organizationsBoard.test.tsx
git commit -m "test(organizations): e2e board flow: list filter, board tab, open, move, churn by drag, phone paging

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Docs: `04-app-flow`, `03-ui-ux-design`, repo architecture

**Files:**
- Modify: `docs/04-app-flow.md` (§4.2)
- Modify: `docs/03-ui-ux-design.md` (§6 "Data display", "Portfolio rows", "Overlays", §10)
- Modify: `.agents/workflows/repo-architecture.md` (route tree, the dependency tree, "### 3. Organizations")

**Interfaces:** docs only. They describe what Tasks 1–12 built, in the same PR (the product-docs rule).

- [ ] **Step 1: `docs/04-app-flow.md` §4.2**

Replace:
```markdown
`/organizations/board` is unchanged in this release: it still reads
`/customers/` and `MetricsPanel`, and keeps its old header.
```
with:
```markdown
`/organizations/board` shares the list's top half (the transparent top bar,
tiles, toolbar, chips and "N of M") and its URL state; the List/Board tabs
carry the query across. `group` defaults to lifecycle here (health on the
list); `group=none` from the list reads as lifecycle, and the board's Group
menu offers no None. The frame call (`limit=1`) gives each column header its
count and ARR from `groups`. Grouped by lifecycle, every stage is a column in
stage order, empty ones included. Churn lists churned accounts only when the
view includes them (`include_churned`, a `churn` lifecycle, or `ids`), and is
otherwise a drop target with "Show churned". Each non-empty column reads its
own cards with `group_value=<key>&limit=25` and loads the next page when its
end scrolls into view, with "Show more" as the fallback. A card (ring, name,
owner, ARR, signal, trend) opens its six panels in a side panel beside the
board, or the bottom sheet on phones, with **Edit details**. Grouped by
lifecycle, a card moves by drag (from `sm`) or its **Move to…** menu: the card
and the counts move at once, `PATCH /customers/<id>/` saves `lifecycle_stage`,
and then the frame and the two columns reload; a failure puts the card back
and shows the server's reason. Moving into Churn opens
`ChurnOrganizationModal` instead (confirming reloads the board, cancelling
changes nothing). Other groupings do not move cards. Below `sm` the columns
are full-width panels that snap sideways, with a strip of column tabs that
jumps to one. The board has no selection mode; bulk work stays on the list.
```
Replace:
```markdown
Add and edit run through `OrganizationFormModal`; churn through
`ChurnOrganizationModal`, one account at a time; archive, owner and lifecycle
changes through `POST /organizations/bulk/`.
```
with:
```markdown
Add and edit run through `OrganizationFormModal`; churn through
`ChurnOrganizationModal`, one account at a time; archive, owner and lifecycle
changes through `POST /organizations/bulk/` on the list, and a board move
through `PATCH /customers/<id>/`, one account at a time.
```

- [ ] **Step 2: `docs/03-ui-ux-design.md`**

In §6 "Data display", replace the row that starts `| Portfolio rows (\`components/organizations/portfolio/\`) |` with:
```markdown
| Portfolio rows and board (`components/organizations/portfolio/`) | `/organizations/list`: `AccountRow` (a rounded item, not a table row; a two-line card below `sm`), `AccountDetails` (six panels, part of the row), `SummaryTiles`, `PortfolioToolbar`/`FiltersPanel`/`PinFieldsMenu`, `FilterChips`, `SelectionBar`, `PortfolioSections`, `AccountSheet`. `/organizations/board`: `PortfolioBoard`, `BoardColumn`, `BoardCard`, `AccountSidePanel`. See "Portfolio rows and board" below |
```
Replace:
```markdown
| `KanbanBoard` | Generic over stage and item; HTML5 drag events; used by Pipelines, Organizations Board and Accounts Board |
```
with:
```markdown
| `KanbanBoard` | Generic over stage and item; HTML5 drag events; used by Pipelines and the Accounts board |
```
Replace:
```markdown
| `MetricsPanel` | Organizations Board (until it moves to the portfolio), Accounts, Contacts: count, health donut with COUNT/MRR/ARR toggle, NPS, lifecycle donut, renewal window |
```
with:
```markdown
| `MetricsPanel` | Accounts and Contacts (each its own): count, health donut with COUNT/MRR/ARR toggle, NPS, lifecycle donut, renewal window |
```
Replace the heading `### Portfolio rows (Organizations list)` with `### Portfolio rows and board (Organizations)`, and replace:
```markdown
- Frame: the Navbar on `/organizations/list` is the dashboard's transparent top
  bar ("Organizations", List/Board, the actions slot, the bell, no avatar);
  `OrganizationsFrame` is `DashboardFrame`'s body with an empty `rail` slot that
  Ask Revenact on Organizations fills later.
```
with:
```markdown
- Frame: the Navbar on `/organizations/list` and `/organizations/board` is the
  dashboard's transparent top bar ("Organizations", List/Board carrying the
  query, the actions slot, the bell, no avatar); `OrganizationsFrame` is
  `DashboardFrame`'s body with an empty `rail` slot that Ask Revenact on
  Organizations fills later.
- Board: columns sit on the canvas with no surface of their own, and cards
  (`bg-surface`, ring, name, owner, ARR, signal, trend) are the items, so there
  is no card in a card. A column header reads "Live · 1 · $69.6K". A dragged-over
  column shows `bg-accent-dim` with an accent ring. The drop-only Churn column
  is a dashed box. The opened card is `AccountSidePanel`, a `bg-surface` column
  beside the board, not over it. Skeletons are card-shaped; a column with
  nothing says so in words.
```
In "### Overlays", replace:
```markdown
(response bands at true scale), `RenewalPopover`, the Organizations
```
with:
```markdown
(response bands at true scale), the Organizations
```
In §10 "Responsive", append after the Organizations list paragraph:
```markdown

The Organizations board below `sm`: each column is a full-width panel in a row
that snaps sideways, with a strip of column tabs ("Live 1") that jumps to one
and follows a swipe. Cards do not drag there; each card's Move to… menu moves
it, and a tapped card opens in the bottom sheet. Every control is 44px.
```

- [ ] **Step 3: `.agents/workflows/repo-architecture.md`**

- Route tree: replace `│   ├── board                  → Board (KanbanBoard on /customers/, unchanged)` with `│   ├── board                  → Board (Board.tsx: PortfolioBoard on GET /organizations/portfolio/)`.
- In the dependency tree, delete the line `  │     ├── components/organizations/MetricsPanel (or AccountMetricsPanel)` under `pages/organizations/Details.tsx & pages/accounts/Details.tsx`. Neither file imports it; `AccountMetricsPanel` does not exist.
- Replace:
  ```markdown
    ├── pages/organizations/Board.tsx
    │     └── components/organizations/MetricsPanel (until the board moves to the portfolio)
  ```
  with:
  ```markdown
    ├── pages/organizations/Board.tsx  (GET /organizations/portfolio/, PATCH /customers/<id>/)
    │     ├── OrganizationsFrame; SummaryTiles, PortfolioToolbar, FilterChips (shared with the list)
    │     └── components/organizations/portfolio/PortfolioBoard → BoardColumn → BoardCard
    │           + AccountSidePanel / AccountSheet, useBoardMove (optimistic move), boardMove, useEndSentinel
  ```
- In the List View table, replace the `usePortfolio.ts` row's text `(one cursor-paged read: the frame, each section, later each board column)` with `(one cursor-paged read: the frame, each section, each board column)`. Replace the `components/organizations/portfolio/*` row's list with `` `AccountRow`, `rowParts`, `AccountDetails`, `AccountSheet`, `SummaryTiles`, `PortfolioToolbar`, `FiltersPanel`, `PinFieldsMenu`, `FilterChips`, `SelectionBar`, `PortfolioSections`, `useSelection`, `usePins`, `usePortfolioParams`; for the board `PortfolioBoard`, `BoardColumn`, `BoardCard`, `AccountSidePanel`, `useBoardMove`, `boardMove`, `useEndSentinel` ``. In the test-helpers row, replace `` `renderList(url, {width})` `` with `` `renderOrganizations(url, {width, nav})`, `renderList`, `renderBoard`; `src/test/intersection.ts` (fake IntersectionObserver) ``.
- Replace:
  ```markdown
  #### Board View (`pages/organizations/Board.tsx`)
  `KanbanBoard` grouped by lifecycle on `/customers/`, with `MetricsPanel`.
  Unchanged until delivery 2 moves it onto `usePagedPortfolio` per column.
  ```
  with:
  ```markdown
  #### Board View (`pages/organizations/Board.tsx`)
  The portfolio as columns (spec §1 "Board", owner decisions 2026-09-26), in
  `OrganizationsFrame` with the list's tiles, toolbar and chips on the same URL
  state (`usePortfolioParams(BOARD_GROUP)`: an absent `group` is lifecycle here).
  `PortfolioBoard` builds the columns from the frame's `groups` (`boardColumns`:
  every lifecycle stage, Churn drop-only while churned accounts are hidden).
  Each `BoardColumn` is one `usePagedPortfolio` read with `group_value`, paged by
  `useEndSentinel` or Show more. `useBoardMove` moves a card optimistically through
  `updateCustomer` (the single PATCH), rolls back with the server's reason, and
  hands Churn to `ChurnOrganizationModal`. `useOverlayActive` keeps the guess
  until each read's fresh page lands. From `sm` an opened card is
  `AccountSidePanel`; below it, `AccountSheet`, with column tabs over snapping
  panels. `KanbanBoard` is no longer used here (Pipelines and the Accounts
  board keep it).
  ```

- [ ] **Step 4: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md
git commit -m "docs(organizations): app flow, UI/UX and architecture for the portfolio board

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Full checks

**Files:** none, unless a check fails. A fix goes back into the task that owns the behaviour and gets its own commit.

- [ ] **Step 1: Static and test gates**

Run each and read the output:
```bash
npm run lint                              # expected: 0 errors; no new warnings in files this plan touched
npx tsc -b --noEmit                       # expected: no output
npx vitest run --maxWorkers=2             # expected: every file passes, including src/e2e/organizationsBoard.test.tsx
npm run build                             # expected: vite build completes
```
To check the warnings: `npx eslint $(git diff --name-only main -- 'src/**/*.ts' 'src/**/*.tsx')` should report none. The accepted exception is `react-refresh/only-export-components` in `testList.tsx`, which is already disabled at the top of the file as before.

- [ ] **Step 2: House anti-slop scan on the touched files**

```bash
git diff main --name-only --diff-filter=AM -- 'src/**/*.tsx' | xargs grep -nE '#[0-9a-fA-F]{3,6}\b|rgba?\(|text-(blue|rose|purple|amber|emerald|red|green)-|text-\[(1[0246]|12|14|16|17|18)px\]' || echo "no raw colours or off-scale sizes"
```
Expected: the scan prints hits only in `src/components/layout/Navbar.tsx`, from its pre-existing `text-[17px]`/`text-[16px]`/`text-[13.5px]`/`text-[12px]` headers, which this plan does not change. Anything in `Board.tsx` or `components/organizations/portfolio/` is a failure to fix. `houseRules.test.ts` already enforces the portfolio folder.

- [ ] **Step 3: Nothing still imports the retired files**

```bash
grep -rnE "organizations/MetricsPanel|RenewalPopover|pages/organizations/Board.*KanbanBoard" src || echo "retired"
```
Expected: `retired`, apart from the reworded comment in `src/components/accounts/MetricsPanel.test.tsx`, which names no path.

---

### Task 15: Browser check at desktop and 375px, both themes (controller)

**Files:** none, unless a check fails (then fix it in the owning task, with a commit). The controller does this task, not a subagent.

- [ ] **Step 1: Run both apps**

- Backend: in `../revenact-backend` on `main` (the portfolio endpoint is merged and deployed), run it on `http://localhost:8000`, seeded with a book that has accounts in at least three stages, one churned account, one stage with more than 25 accounts (or `limit` lowered locally), and one account owned by an inactive user.
- Frontend: `npm run dev` (Vite on `http://localhost:5173`), signed in as a CSM with `view_all_accounts`.

- [ ] **Step 2: Desktop, 1440×900, light theme**

Drive it with `npm run pw` (playwright-cli) or Claude in Chrome. On `/organizations/board`:
1. The top bar is transparent: "Organizations", List/Board, then the bell. There is no avatar and no page-level horizontal scroll. The tiles, toolbar and chips match the List's, and the Group menu reads Lifecycle and has no None.
2. Columns run Onboarding → Other in stage order, empty ones included. Each header reads "Stage · N · $ARR" and agrees with the tile totals. Churn is a dashed drop box reading "Churned accounts are hidden."; Show churned lists them.
3. Scroll a long column: its next page loads before the end, with no Show more click. Show more is still there as the fallback.
4. Click a card: its panels open in the side panel on the right, and the board stays in place and scrolls. Edit details opens the form; Save updates the card. The name link goes to `/organizations/:id`.
5. Drag a card to another stage: it moves at once, the header counts follow, and it stays after the reload (the tiles' Lifecycle mix updates). Use Move to… by keyboard (Tab to it, arrow keys, Enter) for another card.
6. Move the inactive owner's account, or one you may not change. The card goes back, with the server's reason in the alert, and Dismiss clears it.
7. Drag a card onto Churn: the churn modal opens. Cancel changes nothing; Confirm churns it and the board reloads.
8. Group by Owner, then Health: columns follow the server's groups, there are no Move to… menus, and cards do not drag.
9. Set a filter on the List, switch to Board and back: the filter, the chips and "N of M" survive both ways.
10. Tab through the board: every card, Open, Move to…, tab strip button and panel control shows a focus ring.

- [ ] **Step 3: Phone, 375×812, light theme**

1. The columns are full-width panels that snap, with the column tab strip above. Tapping "Renewal" jumps there; swiping updates the active tab. There is no horizontal page scroll outside the panel row.
2. Tapping a card opens the bottom sheet (focus on Close; Escape returns focus). There is no side panel.
3. Cards do not drag. Move to… opens the native picker and moves the card, and the tab counts follow.
4. Every control is at least 44px (tab buttons, Open, Move to…, Show churned, Dismiss).

- [ ] **Step 4: Dark theme, both widths**

Switch the theme in Settings > Personalization and repeat 2.1–2.5 and 3.1–3.3. Check that cards, rings, column highlight (`bg-accent-dim`), dashed drop boxes, skeletons, the side panel and the sheet all use tokens (nothing stays light), and that danger, warning and success tones stay readable on `bg-surface`.

- [ ] **Step 5: Record and stop**

Save screenshots at 1440 and 375 in both themes for the PR description. Then the branch is ready for `superpowers:finishing-a-development-branch`. Do not push.

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| §1 Board: columns are the groups (lifecycle default; owner, health, renewal window and product as alternatives), header count and ARR | 4, 7, 9 |
| §1 Board: cards use the phone-card layout (ring, name, owner, ARR, signal tag, trend) | 5 |
| §1 Board: each column loads more as it scrolls (paginated per column), no cap | 3, 7, 12 |
| §1 Board: drag between lifecycle columns changes the stage; a drop into Churn opens the churn modal | 5, 7, 8, 9, 12 |
| §1 Board: drag disabled for other groupings | 5, 7, 9 |
| 2026-09-26 shared top of the page (frame, tiles, toolbar, filters, chips, "N of M"), filters kept across tabs, lifecycle default on the Board | 1, 2, 9, 10, 12 |
| 2026-09-26 columns: one `usePagedPortfolio` read each (`group_value`), load on end in view, every stage a column, empty ones included | 4, 7 (pre-flight 5–8) |
| 2026-09-26 card click opens the six panels in a side panel (bottom sheet on phones); the name links to `/organizations/:id` | 5, 6, 9 |
| 2026-09-26 moving: drag or Move to…, optimistic, single-customer update, rollback with a message; Churn opens the modal; off for other groupings | 4, 5, 7, 8, 9 (pre-flight 12–16) |
| 2026-09-26 phones: full-width panels you swipe between, a strip of stage tabs | 7, 9, 12 |
| 2026-09-26 chrome: transparent top bar and the empty rail slot like the List; `MetricsPanel` and `RenewalPopover` retire; `KanbanBoard` stays for Pipelines | 9 (frame), 10, 11 |
| 2026-09-26 backend: none | Architecture; no backend task |
| §1 House rules on the Board: tokens, monochrome primary, mono numbers, 11/13/15/22, no card-in-card, no glass, card skeletons, empty/error states, focus-visible, 44px, reduced motion | 5, 6, 7 (`houseRules.test.ts`), 14, 15 |
| §1 Selection mode: not on the Board (owner's option, taken) | Pre-flight 18; 9 asserts its absence |
| §4 item 2: frontend-only, on the portfolio endpoint | Whole plan |
| §5 unit and integration per component | 1–10 |
| §5 board pagination and drag | 7, 9, 12 |
| §5 phone layouts (cards, bottom sheet) | 7, 9, 12 |
| §5 e2e "… → board" (ask joins in delivery 3) | 12 |
| §5 browser check, desktop and 375, both themes | 15 |
| Docs: app flow, UI/UX, repo architecture | 13 |
| Full checks: lint, tsc, vitest `--maxWorkers=2`, build | 14 |

**Placeholder scan:** no step says "TBD", "handle edge cases" or "similar to Task N". Every code step has its code, every test step has its test, and every edit names the exact text it replaces.

**Type consistency, checked across tasks:**
- `BOARD_GROUP`, `boardParams`, `includesChurned` and `parseParams`/`toUrlSearch`'s `defaultGroup` (Task 1) are used in Tasks 2, 7 and 9, plus `usePortfolio`.
- `GroupOption` and `BOARD_GROUP_OPTIONS` (Task 2) are used in Task 9. `PortfolioToolbar`'s now-optional `pins`/`onTogglePin` are omitted by the Board and still passed by the List.
- `useEndSentinel(onEnd, active)` (Task 3) is used in `BoardColumn` (Task 7). `installIntersectionObserver().reveal` is used in Tasks 7 and 12.
- `BoardMove {token, row, from, to}`, `BoardColumnSpec`, `boardColumns`, `withMove`, `withMovedRow` and `useOverlayActive` (Task 4) are used in Tasks 7, 8 and 9.
- `BoardCardProps` and `DETAILS_PANEL_ID` (Task 5) are used in Task 7 (`BoardColumn`) and Task 6 (`AccountSidePanel`).
- `AccountDetails`' `stacked` (Task 6) is used by `AccountSidePanel`.
- `PortfolioBoardProps` (`columnBumps: Record<string, number>`, `move`, `saving`, `openId`, `onShowChurned`) (Task 7) is wired in Task 9.
- `useBoardMove({onSaved, onChurn})` → `{move, saving, notice, error, moveTo, dismissError, reset}` (Task 8) is used in Task 9.
- `stubPortfolio({rows, patch})` and `patchBodies` (Task 8) are used in Tasks 9 and 12. `renderOrganizations(url, {width, nav})`, `renderBoard` and `renderList` (Task 9) are used in Task 12 and by the existing `List.test.tsx` and `organizationsPortfolio.test.tsx`.
- `ErrorBlock`, `EmptyState`, `MoreButton` (exported in Task 7) and `QUIET` (`styles.ts`, Task 7) are used by `BoardColumn`, `PortfolioBoard` and `PortfolioSections`.
