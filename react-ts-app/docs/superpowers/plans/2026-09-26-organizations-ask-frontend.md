# Organizations portfolio, frontend (delivery 3: Ask Revenact on Organizations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Dashboard's Ask Revenact rail and ✦ pill on `/organizations/list` and `/organizations/board`. Questions are grounded on the server in the filtered portfolio (`surface: "organizations"`). An opened row or card focuses one question on that account. History reopens an Organizations conversation on its view with its filters, and the Dashboard stays byte-for-byte the same.

**Architecture:** `AskProvider` stops calling `useDashboardContext()` itself. It takes an `AskSurface` value (`{name, context, chipLabel}`) and a `preferenceKey` instead.
- The Dashboard passes its surface through a thin `DashboardAskProvider`.
- Organizations passes its surface through `OrganizationsAskLayout`, a pathless layout route above the List and the Board, so one conversation survives the tab switch.
- `useOrganizationsContext()` turns the URL into `{surface, view, filters, focus}`. The filters are the portfolio params in the API's own string form, only the set keys sent (`features/organizations/askContext.ts`).
- The pages report their portfolio filter options, so the chips name owners ("Owner: Carl CSM").
- `CopilotRail` learns a surface-neutral `RailContext` (`kind: 'surface'`) and a `chipLabel` prop. The History tag comes from `originTag()`, which joins the server's `origin.labels` for Organizations (there is no `origin_label` field).
- Restoring history is surface-aware. A same-surface conversation navigates and shows as today. One from the other surface navigates to its page with `askConversationId` in the navigation state, and that page's provider fetches and shows it.
- Layout: the rail wins its 320px. Board columns narrow to `w-64`. Below `xl` a card opens as the bottom sheet rather than the side panel. List rows and tiles wrap by container query, not by viewport.

**Tech Stack:** React 19, TypeScript, react-router 7 (`useLocation().state`, pathless layout routes), Redux Toolkit (existing `auth`/`customers`/`notifications` slices only), Tailwind v4 tokens and container queries (`@container`, `@min-[…]:`), lucide-react, Vitest + Testing Library + user-event (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md`. This plan covers §3 "Ask Revenact on Organizations" (binding), the Ask parts of §1 (decisions table "Ask Revenact", the page anatomy's rail and pill, "Glass only on the Ask rail", "Phones: Ask Revenact is a full-screen sheet opened from ✦"), §4 item 3 (frontend half) and the Ask parts of §5. Deliveries 1 and 2 (List and Board) are merged into `feat/organizations-board`, which this branch is cut from.

**Branch:** `feat/organizations-ask` (already checked out; cut from `feat/organizations-board`). Do not switch branches. The companion backend plan (`revenact-backend`, same branch name) adds the surface, grounding, `origin.labels` and metering; per spec §4 the backend merges and deploys first.

## Global Constraints

- **Wire contract, `POST /copilot/messages/`:** body `{conversation_id?, content, context?}`. The Organizations `context` is exactly
  `{surface: 'organizations', view: 'list' | 'board', filters: {...only the set keys...}, focus: null | {kind: 'companies', ids: [<id>]}}`.
  - **`filters` carries only the keys that are set, in the portfolio's own string form.** An unset key is left out entirely — never sent as `''`. `lifecycle`, `health`, `product` and `ids` are comma-joined when set; `include_churned` is sent only as `'1'` (omitted when false); `sort` is sent only when it differs from the default (`-arr`); `ids` is omitted whenever empty (the backend reads a literal `ids: ''` as "names nothing", so an unset ids filter must never be sent that way).
  - `group` follows the same rule, with one more case: it is sent only when the page's grouping differs from the view's own default (`health` on the List, `lifecycle` on the Board) — omitted otherwise, so the server applies that default. `group: ''` is sent only when the person explicitly chose no grouping (the List's "None"; the Board never offers this — `boardParams` keeps its group non-empty).
  - `focus`, when not null, is always `{kind: 'companies', ids: [...]}`; the server `400`s on any other `kind`.
  - `cursor`, `group_value` and `limit` are never sent.
  - The Dashboard's context is unchanged: `{surface: 'dashboard', area, view, filters: {owner, lifecycle, customer}, focus}`.
- **Wire contract, conversations:**
  - There is no `origin_label` field. `origin` is the first surface context without its `focus` — for Organizations that is `{surface, view, filters, labels}`, where `labels` is a list of strings the server builds from the caller's own filter options (e.g. `["Owner: Carl CSM"]`). The Dashboard's origin shape is unchanged (no `labels`).
  - Each user `Message.context` also carries `labels` for an Organizations turn (the server's validated context); the client never sends `labels` itself.
  - The History tag for an Organizations conversation is `["Organizations", ...origin.labels].join(' · ')`. Restoring it opens `/organizations/<origin.view>?<URLSearchParams(origin.filters)>`.
- **Dashboard unchanged:** every existing test under `src/pages/dashboard`, `src/components/copilot`, `src/pages/communications`, `src/pages/copilot` and `src/e2e/dashboardAsk.test.tsx` passes. The only edits to existing tests are `CopilotRail.test.tsx`'s mechanical renames (`kind: 'dashboard'` → `kind: 'surface'`, `names` → `chipLabel`), and every assertion in it stays as it is. `revenact_dashboard_ask` keeps its meaning.
- **Glass:** only the rail is glass (`CopilotRail variant="glass"`, whose conversation section is `.rv-card-glass`). Rows, cards, tiles, the side panel and every sheet stay solid `bg-surface`. The owner approved glass for this rail on 2026-09-26, and the `revenact-design` skill's exception is updated in the docs task.
- **Breakpoints** (`src/lib/useMediaQuery.ts`): `SM = 640px`, `XL = 1280px`.
  - The rail is open by default from `xl`, hidden (not rendered) below it until switched on, and a full-screen sheet below `sm`.
  - Organizations' open/closed choice is kept under `revenact_organizations_ask` (`ORGANIZATIONS_ASK_KEY`), read and written in try/catch.
  - An entry point (a History pick, New chat, a handover) opens the rail for that visit without writing it.
- **Layout rule: the rail wins.**
  - From `sm` with the rail open, Board columns are `w-64` (otherwise `w-72`).
  - From `xl` the side panel and the rail show together.
  - Below `xl`, with the rail open, a card opens in `AccountSheet`. Opening the rail below `xl` closes an open side panel, and its focus stays.
  - List rows go `flex-nowrap` only when their `@container` is at least `60rem` wide. Tiles go five-across only when theirs is at least `50rem` wide.
- **House rules** (spec §1):
  - Tokens only: no hex, `rgb(`, or named palette colours in `.tsx`.
  - One monochrome primary. Semantic colour for status only.
  - Numbers in `font-mono-brand tabular-nums`.
  - Type sizes 11/13/15/22 px only inside `components/organizations/portfolio/` (`houseRules.test.ts`).
  - No card-in-card.
  - Hover, focus-visible, active and disabled states on every control. 44px touch targets below `sm`. Reduced motion respected: the global override in `src/index.css` covers the rail's `animate-slide-in-right`.
- **Copy:** sentence case, no em dashes in new UI copy, "organizations" (US spelling) in UI text. New screen-reader copy: "Started on " before an Organizations tag.
- **jsdom:**
  - There is no `matchMedia`, so `useMediaQuery` reads false (phone) unless `setViewport(width)` from `src/test/viewport.ts` runs first.
  - CSS is not applied, so container queries and widths are asserted by class, and the browser check verifies them.
  - `localStorage` is cleared after every test (`src/test/setup.ts`).
- **Tests** follow `.claude/skills/testing/SKILL.md` at three levels:
  - unit;
  - integration through the real store and router with only `fetch` mocked (`stubOrganizationsAsk` = `stubPortfolio` + `stubCopilot`);
  - jsdom e2e in `src/e2e/`.
- **Gates:** `npm run lint` passes with 0 errors, `npx tsc -b --noEmit`, `npx vitest run --maxWorkers=2`, and `npm run build`.
- Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Pre-flight: where the spec meets the code

| # | Spec / owner decision says | Code today | Resolution in this plan |
|---|---|---|---|
| 1 | "The provider generalises to take a context builder per surface"; the Dashboard's behaviour stays byte-for-byte. | `AskProvider` calls `useDashboardContext()` inside itself; `AskRail` calls it again plus `useFilterNames()` for the chip. | `AskProvider({surface, preferenceKey})` takes an `AskSurface` value `{name, context, chipLabel}` and exposes it as `ask.surface`; `AskRail` reads only `ask.surface`. The Dashboard's surface is built by `DashboardAskProvider` (the same two hooks, in the same place in the tree). The value object was already rebuilt every render (`useDashboardContext` returns a fresh object), so memoisation is unchanged. Task 3 runs every dashboard suite. |
| 2 | `useOrganizationsContext` builds `{surface: "organizations", view, filters: {portfolio params except cursor}, focus}`. Backend ruling: `filters` carries only the set keys, in the portfolio's own string form; never `''` for an unset key; `group` only when it differs from the view's default, `group: ''` only for an explicit "None". | `PortfolioParams` holds arrays and a boolean; the backend's portfolio view parses query strings. | `toContextFilters(params, view)` builds a **sparse** `OrganizationsFilters` (all keys optional): it sets a key only when the param is non-empty, joins `lifecycle`/`health`/`product`/`ids` with commas, sends `include_churned` only as `'1'`, sends `sort` only when it differs from `-arr`, and sends `group` only when it differs from `defaultGroupOf(view)` (or `''` when the param is explicitly empty). `ids` is never sent as `''` (the backend reads that as "names nothing"): an empty `ids` param is simply omitted. `view` comes from the pathname. The Board's params go through `boardParams` first (its `group` is never `''`, since the Board offers no "None"). `fromContextFilters` reads the sparse object back through `parseParams` (any key not present behaves as unset), so a value the page would reject is dropped the same way. |
| 3 | Backend accepts `view ∈ {list, board}`, required and closed (a `400` on a missing or unknown value); `focus.kind` accepts `companies` only (`400` on anything else, e.g. `attention`); its plan is written in parallel. | `DashboardContextSerializer` accepts `surface: 'dashboard'` only, and its focus also accepts `attention`. | The contract is fixed in Global Constraints for the companion plan to match. `OrganizationsContext.focus` is typed `OrganizationsFocus \| null` (`{kind: 'companies'; ids: number[]}`), narrower than the Dashboard's `DashboardFocus`, since Organizations never offers an attention entry point — only `useAskFocusOnOpen` ever builds one, and it only ever builds `{kind: 'companies', ...}`. Until the backend deploys, a send answers `400`, which the rail already shows as a generic error with Retry (no new UI). Backend merges first (spec §4). |
| 4 | Rail and ✦ pill on both `/organizations/list` and `/organizations/board`: pill in the Navbar slot, rail in `OrganizationsFrame`'s `rail`. | The Navbar already renders `data-nav-actions-slot` on both routes (`isOrgView`); `OrganizationsFrame`'s `rail` is null. The List and Board are sibling routes, so a provider inside each page would reset the conversation on every tab switch. | A pathless layout route, `OrganizationsAskLayout`, wraps `list` and `board` in `App.tsx` and holds the provider. Each page passes `<AskRail />` to `OrganizationsFrame`'s `rail`; `AskRail` portals the pill through the existing `AskControls`. No Navbar logic changes (one comment). |
| 5 | Glass on the rail only, as on the Dashboard; update the skill's exception. | `.claude/skills/revenact-design/SKILL.md` rule 4 and `docs/03-ui-ux-design.md` name Communications and the Dashboard's rail only. | The rail is `CopilotRail variant="glass"` from `sm`; the phone sheet is `plain`. A test asserts exactly one `.rv-card-glass` on the list (the rail's). Task 9 widens the exception to "the Ask rail on the Dashboard and Organizations (rail only)". |
| 6 | Opening a List row or a Board card's side panel or sheet sets `focus: {kind: "companies", ids: [id]}` for one question. | The provider sets focus only through `draft()` and `ask()`, and both open the rail. Rows and cards keep `openRow` in page state. | New `focusOn(focus)` on `AskState` sets the focus without opening the rail or drafting. `useAskFocusOnOpen(openId)` calls it whenever an account opens. The existing rules still drop it (the send via `markSent`, the chip's ×, a URL change). **Closing the account keeps the focus**, as a dashboard drill's focus outlives the drill panel. Opening another account replaces it. |
| 7 | Chips name the filters ("Organizations · Owner: Carl CSM"). | Dashboard names come from `FilterNamesProvider`. Organizations' option names are in the portfolio response's `filters` (`owners`, `lifecycles`, `products`), held inside List/Board. | `PortfolioOptionsContext` + `useReportPortfolioOptions(options)`: each page reports its last read's options to the layout. `organizationsLabel` is `"Organizations"`, then `filterChips(...)`'s own chip labels, then the focus label, joined by ` · `. |
| 8 | Chips on every question, on this surface. | `CopilotRail` chips come only from `names` (dashboard `FilterNames`) through `contextLabel`, typed `DashboardOrigin`. `RailContext` has `kind: 'dashboard'`. | Types widen to `SurfaceContext = DashboardContext \| OrganizationsContext` (messages, turns, `sendMessage`). `RailContext`'s structured kind is renamed `'surface'`. `names` is replaced by `chipLabel?: (context) => string`, and without it there are still no chips (Communications). `surfaceLabel(context, names)` dispatches by surface. |
| 9 | History: reopening restores filters and view on `/organizations/list` or `/organizations/board`. | `originPath` builds dashboard URLs only. `AskProvider` navigates for any origin. `HistoryPopover` and `CopilotSidebar` call `viewLabel(origin.area, …)`, which would print "undefined" for an Organizations origin. | `originPath` dispatches by `surface` (`organizationsPath` for Organizations). `openFromHistory` navigates and shows in place when the origin's surface is the provider's own. **For the other surface it navigates there with `{askConversationId}` in the navigation state**, and that page's provider fetches the conversation and opens its rail for the visit. So an Organizations conversation picked on the Dashboard still lands on its view with its filters, and vice versa. Communications and `/copilot` still open in place. |
| 10 | History tag "Organizations · Owner: Carl CSM". There is no `origin_label` field: the backend returns `origin = {surface, view, filters, labels: string[]}` on both the conversation summary and detail, and each user `Message.context` also carries `labels`. | `ConversationSummary` has no such field; the tag is `viewLabel`. | `ConversationSummary.origin?: SurfaceOrigin \| null`, where `OrganizationsOrigin` carries `labels: string[]`. `originTag(summary)` returns `["Organizations", ...origin.labels].join(' · ')` for Organizations, and `viewLabel` for the Dashboard. The tag uses the sidebar's Organizations icon (`Network`) and screen-reader text "Started on ". It is capped at 60% of the row and truncates. |
| 11 | On desktop the Board's columns get less width when the rail is open. | Columns and their skeleton are `w-72` from `sm`. | `PortfolioBoard`/`BoardColumn` take `narrow` → `w-64`. The Board passes `narrow={railOpen}`. |
| 12 | The side panel and the rail must not fight; decide which wins. | `AccountSidePanel` is `w-[26rem]` beside the columns. At 1280px with the rail open, about 416px would be left for columns; below `xl` there is no room for both. | **The rail wins.** From `xl` both show (columns narrow and scroll sideways). Below `xl`, with the rail open, a card opens in `AccountSheet` (the phone sheet, which is modal). Opening the rail below `xl` closes an open side panel (adjusted during render), and the card's focus stays for the next question. With the rail closed nothing changes. |
| 13 | The rail must fit the List. | `AccountRow`'s header is `sm:flex-nowrap` with fixed parts, needing about 930px. At 1280px with the rail the content column is about 844px, so the row overflows sideways (it already does between 640 and about 1060px without the rail). `SummaryTiles` goes five-across at `lg` whatever the column width. | Container queries. List and Board wrap `SummaryTiles`, and the List wraps `PortfolioSections`, in `<div className="@container">`. The row becomes `@min-[60rem]:flex-nowrap`, and the tiles `@min-[50rem]:grid-cols-5`. Rows wrap onto two lines in a narrow column instead of overflowing. The wrappers hold no fixed-position descendants (the sheets and modals render outside them). |
| 14 | Phones: the rail becomes a sheet. | `AskRail` below `sm` is a full-screen `aria-modal` sheet (z-40). `AccountSheet` and `FiltersPanel` are z-50 sheets. | Reused unchanged. The two sheets can't both open: each covers the other's opener. |
| 15 | Preference. | One key, `revenact_dashboard_ask`. | `readAskPreference(key)`/`writeAskPreference(open, key)`, defaulting to the dashboard key. Organizations uses `ORGANIZATIONS_ASK_KEY = 'revenact_organizations_ask'`, so a closed rail on one page says nothing about the other. |
| 16 | Tests through the real store and router. | `renderOrganizations` renders the pages with no provider or slot. `stubPortfolio` and `stubCopilot` each replace `fetch`. | `renderOrganizations(url, {width, nav, ask})`: `ask` adds the layout route, a slot host (`data-testid="nav-actions"` when there is no real Navbar), and the real dashboard routes (`dashboardRoutes(() => <Where />)`) for cross-surface history. `stubOrganizationsAsk()` routes `/copilot/` to `stubCopilot` and everything else to `stubPortfolio`. |
| 17 | Shared sessions, grounding, metering, privacy. | Backend only. | No frontend change: a withheld reply renders as plain text, as today. |
| 18 | §5 e2e "filter → open → pin → select → board → ask". | `organizationsPortfolio` and `organizationsBoard` e2e flows stop before "ask". | New `src/e2e/organizationsAsk.test.tsx`: filter, ask, open a row and ask, switch to the Board and ask, then New chat and reopen from History. |
| 19 | Communications opens any conversation in place. | `CommunicationsPage` passes no `names` and handles History itself. | Unchanged: no `chipLabel`, so it shows plain text, with the new tag in its History. |

## File map

Create:
- `src/features/organizations/askContext.ts` (+ `askContext.test.ts`): `defaultGroupOf`, `toContextFilters`, `fromContextFilters`, `organizationsPath`, `organizationsLabel`.
- `src/components/copilot/surfaceLabels.ts` (+ `surfaceLabels.test.ts`): `SurfaceNames`, `surfaceLabel`, `originTag`.
- `src/pages/dashboard/ask/DashboardAskProvider.tsx`.
- `src/pages/dashboard/ask/AskProvider.test.tsx`.
- `src/pages/organizations/ask/`:
  - `useOrganizationsContext.ts` (+ `.test.tsx`)
  - `portfolioOptions.ts`
  - `useAskFocus.ts`
  - `OrganizationsAskLayout.tsx` (+ `.test.tsx`)
  - `testOrganizationsAsk.ts`
  - `organizationsAsk.test.tsx`
  - `askLayout.test.tsx`
  - `historyRestore.test.tsx`
- `src/components/organizations/portfolio/containerFit.test.tsx`.
- `src/e2e/organizationsAsk.test.tsx`.

Modify:
- `src/pages/copilot/types.ts`, `src/pages/copilot/copilotApi.ts`
- `src/components/copilot/`: `railContext.ts`, `useCopilotThread.ts`, `CopilotRail.tsx`, `CopilotRail.test.tsx`, `HistoryPopover.test.tsx`
- `src/pages/copilot/CopilotSidebar.tsx` (+ `CopilotSidebar.origin.test.tsx`)
- `src/pages/dashboard/ask/`: `originPath.ts` (+ test), `context.ts`, `AskProvider.tsx`, `AskRail.tsx`, `askPreference.ts` (+ test), `useAsk.ts`
- `src/pages/dashboard/DashboardFrame.tsx`
- `src/App.tsx`
- `src/pages/organizations/`: `List.tsx`, `Board.tsx`, `OrganizationsFrame.tsx` (comment), `testList.tsx`
- `src/components/organizations/portfolio/`: `PortfolioBoard.tsx` (+ test), `BoardColumn.tsx`, `AccountRow.tsx`, `SummaryTiles.tsx`
- `src/components/layout/Navbar.tsx` (comment only)
- Docs: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.agents/workflows/repo-architecture.md`, `.claude/skills/revenact-design/SKILL.md`.

---

### Task 1: The Organizations context: types, filters ↔ params, restore path, chip

**Files:**
- Modify: `src/pages/copilot/types.ts` (add types after `DashboardOrigin`)
- Create: `src/features/organizations/askContext.ts`
- Test: `src/features/organizations/askContext.test.ts`

**Interfaces:**
- Consumes: `parseParams`, `DEFAULT_GROUP`, `BOARD_GROUP`, `DEFAULT_SORT`, `PortfolioParams` (`features/organizations/portfolioParams.ts`); `filterChips` (`filterChips.ts`); `PortfolioResponse` (`portfolioTypes.ts`); `focusLabel` (`components/copilot/dashboardLabels.ts`).
- Produces (types, `pages/copilot/types.ts`):
  - `OrganizationsView = 'list' | 'board'`
  - `OrganizationsFilters` (eleven string keys, **all optional** — only a set key is present)
  - `OrganizationsFocus {kind: 'companies'; ids: number[]}` (the only focus kind Organizations ever sends; the backend `400`s on any other `kind`)
  - `OrganizationsContext {surface: 'organizations'; view; filters; focus: OrganizationsFocus | null; labels?: string[]}` — `labels` is never set by the client; it is present only on a context the server has validated and echoed back (a stored `Message.context`)
  - `OrganizationsOrigin {surface: 'organizations'; view; filters; labels: string[]}` — a conversation's origin always carries the server's `labels`, so this is its own shape rather than `Omit<OrganizationsContext, 'focus'>`
  - `SurfaceContext = DashboardContext | OrganizationsContext`
  - `SurfaceOrigin = DashboardOrigin | OrganizationsOrigin`
  - `SurfaceName = SurfaceContext['surface']`
- Produces (`features/organizations/askContext.ts`):
  - `defaultGroupOf(view: OrganizationsView): GroupKey`
  - `toContextFilters(p: PortfolioParams, view: OrganizationsView): OrganizationsFilters` — sparse: a key is present only when the param is set, `group` only when it differs from `defaultGroupOf(view)` (or `''` for an explicit "None")
  - `fromContextFilters(filters: OrganizationsFilters, view: OrganizationsView): PortfolioParams`
  - `organizationsPath(origin: OrganizationsOrigin): string` — `/organizations/<view>?<URLSearchParams(filters)>`, filters used exactly as stored (they are already the page's own URL parameters)
  - `organizationsLabel(context: OrganizationsOrigin & {focus?: OrganizationsFocus | null}, options?: PortfolioResponse['filters'] | null): string`

- [ ] **Step 1: Add the types**

In `src/pages/copilot/types.ts`, directly after the line `export type DashboardOrigin = Omit<DashboardContext, 'focus'>;`, add:
```ts

/** The Organizations pages a question can be asked from. */
export type OrganizationsView = 'list' | 'board';

/** The portfolio's params as GET /organizations/portfolio/ reads them (spec
 *  §2), **only the set keys present** — an unset key is left out, never sent
 *  as `''` (the backend reads a literal `ids: ''` as "names nothing", and a
 *  missing `group` as the view's own default). Lists are comma-joined,
 *  `include_churned` is present only as `'1'`, `sort` only when it differs
 *  from the default, `group` only when it differs from the view's default
 *  (or `''` for an explicit "None", which the Board never offers). The
 *  paging params (`cursor`, `group_value`, `limit`) are never part of it. */
export interface OrganizationsFilters {
  search?: string;
  owner?: string;
  lifecycle?: string;
  health?: string;
  product?: string;
  renews_within?: string;
  nps?: string;
  ids?: string;
  include_churned?: string;
  sort?: string;
  group?: string;
}

/** The only focus shape Organizations ever sends; the server `400`s on any
 *  other `kind` (e.g. the Dashboard's `attention`). */
export interface OrganizationsFocus {
  kind: 'companies';
  ids: number[];
}

/** Where an Organizations question was asked (spec §3). The server
 *  recomputes the filtered list for the asker; the client never sends
 *  figures, and never sends `labels` — the server builds them from the
 *  asker's own filter options and echoes them back on a stored context. */
export interface OrganizationsContext {
  surface: 'organizations';
  view: OrganizationsView;
  filters: OrganizationsFilters;
  focus: OrganizationsFocus | null;
  labels?: string[];
}

/** A conversation's first Organizations context without its focus. Unlike
 *  `OrganizationsContext`, `labels` is required: an origin is only ever
 *  built server-side, from the first message's validated context, which
 *  always carries them. */
export interface OrganizationsOrigin {
  surface: 'organizations';
  view: OrganizationsView;
  filters: OrganizationsFilters;
  labels: string[];
}

/** Every structured context a question can carry, told apart by `surface`. */
export type SurfaceContext = DashboardContext | OrganizationsContext;
export type SurfaceOrigin = DashboardOrigin | OrganizationsOrigin;
export type SurfaceName = SurfaceContext['surface'];
```

- [ ] **Step 2: Write the failing test**

`src/features/organizations/askContext.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fromContextFilters, organizationsLabel, organizationsPath, toContextFilters } from './askContext';
import { BOARD_GROUP, boardParams, parseParams } from './portfolioParams';
import { FILTER_OPTIONS } from './testPortfolio';

const listParams = (query: string) => parseParams(new URLSearchParams(query));
const boardOf = (query: string) => boardParams(parseParams(new URLSearchParams(query), BOARD_GROUP));

describe('organizations ask context', () => {
  it("carries only the set portfolio params, in the API's own string form", () => {
    expect(toContextFilters(listParams(''), 'list')).toEqual({});
    expect(
      toContextFilters(
        listParams('search=pizza&owner=2&lifecycle=live,renewal&health=poor&product=1&renews_within=90&nps=detractor&ids=3,7&include_churned=1&sort=-renewal&group=owner'),
        'list',
      ),
    ).toEqual({
      search: 'pizza', owner: '2', lifecycle: 'live,renewal', health: 'poor', product: '1', renews_within: '90', nps: 'detractor', ids: '3,7', include_churned: '1', sort: '-renewal', group: 'owner',
    });
    // An explicit "None" is sent as '', never omitted.
    expect(toContextFilters(listParams('group=none'), 'list')).toEqual({ group: '' });
    // The view's own default is omitted, never sent as itself.
    expect(toContextFilters(listParams(''), 'list')).not.toHaveProperty('group');
    // The board never asks ungrouped: group=none reads as lifecycle there, its own default, so it too is omitted.
    expect(toContextFilters(boardOf('group=none'), 'board')).not.toHaveProperty('group');
  });

  it('never sends an unset key as an empty string (the backend reads ids: "" as "names nothing")', () => {
    const none = toContextFilters(listParams(''), 'list');
    expect(none).not.toHaveProperty('ids');
    expect(none).not.toHaveProperty('include_churned');
    expect(none).not.toHaveProperty('sort');
    expect(none).not.toHaveProperty('search');
  });

  it('reads a context back to the same params', () => {
    const list = listParams('owner=2&lifecycle=live&group=none&sort=name');
    expect(fromContextFilters(toContextFilters(list, 'list'), 'list')).toEqual(list);
    const board = boardOf('health=good');
    expect(fromContextFilters(toContextFilters(board, 'board'), 'board')).toEqual(board);
  });

  it('drops a value the page would not accept', () => {
    expect(fromContextFilters({ lifecycle: 'live,bogus', owner: 'x' }, 'list')).toMatchObject({ lifecycle: ['live'], owner: '' });
  });

  it('goes back to the view with its filters, using the stored filters as-is', () => {
    expect(organizationsPath({ surface: 'organizations', view: 'list', filters: {}, labels: [] })).toBe('/organizations/list');
    expect(organizationsPath({ surface: 'organizations', view: 'list', filters: { owner: '2', lifecycle: 'live,renewal' }, labels: [] })).toBe(
      '/organizations/list?owner=2&lifecycle=live%2Crenewal',
    );
    // An explicit "None" round-trips as the stored empty value, not the URL's 'none' sentinel.
    expect(organizationsPath({ surface: 'organizations', view: 'list', filters: { group: '' }, labels: [] })).toBe('/organizations/list?group=');
    expect(organizationsPath({ surface: 'organizations', view: 'board', filters: {}, labels: [] })).toBe('/organizations/board');
    expect(organizationsPath({ surface: 'organizations', view: 'board', filters: { sort: 'name', group: 'owner' }, labels: [] })).toBe(
      '/organizations/board?sort=name&group=owner',
    );
  });

  it('names the chip from the filter options, then the focus', () => {
    const base = { surface: 'organizations' as const, view: 'list' as const, labels: [] };
    expect(organizationsLabel({ ...base, filters: {} })).toBe('Organizations');
    expect(organizationsLabel({ ...base, filters: { owner: '2', lifecycle: 'live' } }, FILTER_OPTIONS)).toBe(
      'Organizations · Owner: Carl CSM · Lifecycle: Live',
    );
    // No options yet: the value shows as the page's own chip would show it.
    expect(organizationsLabel({ ...base, filters: { owner: '2' } })).toBe('Organizations · Owner: User 2');
    expect(organizationsLabel({ ...base, filters: { ids: '3,7' }, focus: { kind: 'companies', ids: [7] } })).toBe(
      'Organizations · Opened from the dashboard (2) · 1 account',
    );
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/features/organizations/askContext.test.ts`
Expected: FAIL with "Failed to resolve import "./askContext"".

- [ ] **Step 4: Write the module**

`src/features/organizations/askContext.ts`:
```ts
import { focusLabel } from '../../components/copilot/dashboardLabels';
import type { OrganizationsFilters, OrganizationsFocus, OrganizationsOrigin, OrganizationsView } from '../../pages/copilot/types';
import { filterChips } from './filterChips';
import { BOARD_GROUP, DEFAULT_GROUP, DEFAULT_SORT, parseParams, type PortfolioParams } from './portfolioParams';
import type { GroupKey, PortfolioResponse } from './portfolioTypes';

/** Each view's own default grouping (an absent `group` in a stored context
 *  means this). */
export function defaultGroupOf(view: OrganizationsView): GroupKey {
  return view === 'board' ? BOARD_GROUP : DEFAULT_GROUP;
}

/** The params as a question carries them (spec §3: every portfolio param
 *  except the cursor), in the API's own string form — **only the set keys**.
 *  Backend ruling: an unset key is never sent as `''` (the backend reads a
 *  literal `ids: ''` as "names nothing"). `group` is sent only when it
 *  differs from `defaultGroupOf(view)`, and `group: ''` only for an explicit
 *  "None" (the Board never reaches that branch: `boardParams` keeps its
 *  group non-empty). */
export function toContextFilters(p: PortfolioParams, view: OrganizationsView): OrganizationsFilters {
  const filters: OrganizationsFilters = {};
  if (p.search) filters.search = p.search;
  if (p.owner) filters.owner = p.owner;
  if (p.lifecycle.length) filters.lifecycle = p.lifecycle.join(',');
  if (p.health.length) filters.health = p.health.join(',');
  if (p.product.length) filters.product = p.product.join(',');
  if (p.renews_within) filters.renews_within = p.renews_within;
  if (p.nps) filters.nps = p.nps;
  if (p.ids.length) filters.ids = p.ids.join(',');
  if (p.include_churned) filters.include_churned = '1';
  if (p.sort !== DEFAULT_SORT) filters.sort = p.sort;
  const defaultGroup = defaultGroupOf(view);
  if (p.group === '') filters.group = '';
  else if (p.group !== defaultGroup) filters.group = p.group;
  return filters;
}

/** A context's filters back to params, through the URL parser, so a value
 *  the page would not accept is dropped the same way. A key left out behaves
 *  as it would off the URL; `group: ''` is "no grouping" (the URL's
 *  `group=none`), and a missing `group` is the view's own default. */
export function fromContextFilters(filters: OrganizationsFilters, view: OrganizationsView): PortfolioParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  if (filters.group === '') search.set('group', 'none');
  return parseParams(search, defaultGroupOf(view));
}

/** The page a conversation started on, with its filters (History restore).
 *  `origin.filters` is already the page's own URL parameters, only the set
 *  keys present (backend ruling), so it is used as-is rather than round-
 *  tripped through the params parser. */
export function organizationsPath(origin: OrganizationsOrigin): string {
  const query = new URLSearchParams(origin.filters as Record<string, string>).toString();
  return query ? `/organizations/${origin.view}?${query}` : `/organizations/${origin.view}`;
}

/** The chip: "Organizations · Owner: Carl CSM · 1 account". The filter parts
 *  are the page's own filter chips, named from the portfolio's options; an
 *  unknown value shows as those chips show it ("User 9"). */
export function organizationsLabel(
  context: OrganizationsOrigin & { focus?: OrganizationsFocus | null },
  options: PortfolioResponse['filters'] | null = null,
): string {
  const params = fromContextFilters(context.filters, context.view);
  const parts = ['Organizations', ...filterChips(params, options).map((chip) => chip.label)];
  const focus = focusLabel(context.focus ?? null);
  if (focus) parts.push(focus);
  return parts.join(' · ');
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run src/features/organizations/askContext.test.ts && npx tsc -b --noEmit`
Expected: PASS (5 tests); tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/pages/copilot/types.ts src/features/organizations/askContext.ts src/features/organizations/askContext.test.ts
git commit -m "feat(organizations): the Ask context for Organizations: filters, restore path and chip

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The Copilot plumbing knows two surfaces (types, rail, chips, History tag, restore path)

**Files:**
- Modify: `src/pages/copilot/types.ts` (`CopilotMessage.context`, `ConversationSummary`)
- Modify: `src/pages/copilot/copilotApi.ts` (`sendMessage`)
- Modify: `src/components/copilot/useCopilotThread.ts` (`Turn`)
- Modify: `src/components/copilot/railContext.ts`
- Modify: `src/components/copilot/CopilotRail.tsx` (header comment, imports, props, `chipOf`, `send`, the History tag)
- Create: `src/components/copilot/surfaceLabels.ts`
- Modify: `src/pages/copilot/CopilotSidebar.tsx` (the history subtext)
- Modify: `src/pages/dashboard/ask/originPath.ts`
- Modify: `src/pages/dashboard/ask/AskRail.tsx` (interim: the new kind and `chipLabel`)
- Test: `src/components/copilot/surfaceLabels.test.ts` (new), `CopilotRail.test.tsx`, `HistoryPopover.test.tsx`, `src/pages/copilot/CopilotSidebar.origin.test.tsx`, `src/pages/dashboard/ask/originPath.test.ts`

**Interfaces:**
- Consumes: Task 1's `SurfaceContext`, `SurfaceOrigin`, `OrganizationsContext`, `OrganizationsFocus`, `organizationsLabel`, `organizationsPath`; `contextLabel`, `viewLabel`, `FilterNames` (`dashboardLabels.ts`).
- Produces:
  - `CopilotMessage.context?: SurfaceContext | null`
  - `ConversationSummary.origin?: SurfaceOrigin | null`. There is no `origin_label` field.
  - `sendMessage({conversationId?, content, context?: SurfaceContext})`
  - `Turn.context?: SurfaceContext`
  - `RailContext = {kind: 'label'; label; icon?} | {kind: 'surface'; context: SurfaceContext; label: string}`
  - `CopilotRailProps.chipLabel?: (context: SurfaceContext) => string` (replaces `names`)
  - `SurfaceNames {dashboard?: FilterNames; organizations?: PortfolioResponse['filters'] | null}`
  - `surfaceLabel(context: SurfaceContext, names?: SurfaceNames): string`
  - `originTag(summary: Pick<ConversationSummary, 'origin'>): string | null` — for Organizations, `["Organizations", ...origin.labels].join(' · ')`
  - `originPath(origin: SurfaceOrigin): string`

- [ ] **Step 1: Write the failing tests**

`src/components/copilot/surfaceLabels.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FILTER_OPTIONS } from '../../features/organizations/testPortfolio';
import type { DashboardContext, OrganizationsContext } from '../../pages/copilot/types';
import { originTag, surfaceLabel } from './surfaceLabels';

const DASH: DashboardContext = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' }, focus: null };
const ORG: OrganizationsContext = { surface: 'organizations', view: 'list', filters: { owner: '2' }, focus: null };

describe('surface labels', () => {
  it("names a question on either surface with that surface's names", () => {
    expect(surfaceLabel(DASH, { dashboard: { owner: { '2': 'Priya' } } })).toBe('Revenue › Forecast · Owner: Priya');
    expect(surfaceLabel(DASH)).toBe('Revenue › Forecast · Owner: 2');
    expect(surfaceLabel(ORG, { organizations: FILTER_OPTIONS })).toBe('Organizations · Owner: Carl CSM');
    expect(surfaceLabel({ ...ORG, focus: { kind: 'companies', ids: [7] } })).toBe('Organizations · Owner: User 2 · 1 account');
  });

  it('tags a conversation with where it started', () => {
    expect(originTag({ origin: { surface: 'dashboard', area: 'health', view: 'triage', filters: DASH.filters } })).toBe('Health › Triage');
    expect(
      originTag({ origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] } }),
    ).toBe('Organizations · Owner: Carl CSM');
    expect(originTag({ origin: { surface: 'organizations', view: 'board', filters: {}, labels: [] } })).toBe('Organizations');
    expect(originTag({ origin: null })).toBeNull();
  });
});
```

In `src/components/copilot/HistoryPopover.test.tsx`, add inside the `describe`, after the existing test:
```tsx
  it("tags an Organizations conversation with the server's labels", async () => {
    stubCopilot({
      conversations: [
        {
          id: 3,
          title: 'Who renews first?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Who renews first\?/ });
    expect(within(tagged).getByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Who renews first\?\s*Started on Organizations · Owner: Carl CSM/);
  });
```

In `src/pages/copilot/CopilotSidebar.origin.test.tsx`, add inside the `describe`, after the existing test:
```tsx
  it("shows the server's tag for an Organizations conversation", () => {
    const store = configureStore({ reducer: { knowledge: knowledgeReducer } });
    const conversations = [
      {
        id: 2,
        title: 'Who renews first?',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        origin: { surface: 'organizations' as const, view: 'list' as const, filters: { owner: '2' }, labels: ['Owner: Carl CSM'] },
      },
    ];
    render(
      <Provider store={store}>
        <CopilotSidebar isExpanded setIsExpanded={() => {}} conversations={conversations} activeConversationId={null} sessions={{}} myInvites={[]} />
      </Provider>,
    );
    expect(screen.getByText(/^Organizations · Owner: Carl CSM · /)).toBeInTheDocument();
  });
```

In `src/pages/dashboard/ask/originPath.test.ts`, add inside the `describe`, after the existing test:
```ts
  it('goes back to an Organizations view with its filters', () => {
    expect(
      originPath({ surface: 'organizations', view: 'board', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] }),
    ).toBe('/organizations/board?owner=2');
  });
```

In `src/components/copilot/CopilotRail.test.tsx`:
- Replace every `kind: 'dashboard'` with `kind: 'surface'` (eight occurrences; use replace-all).
- Replace the import line `import type { Conversation, DashboardContext } from '../../pages/copilot/types';` with:
```ts
import type { Conversation, DashboardContext, OrganizationsContext, SurfaceContext } from '../../pages/copilot/types';
import { surfaceLabel } from './surfaceLabels';
```
- In the test `'each question shows the screen it was asked on, and a follow-up carries the new screen'`, replace:
```ts
    const names = { owner: { '2': 'Priya', '5': 'Omar' } };
    const { rerenderRail } = renderRail({ names, context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast · Owner: Priya' } });
```
with:
```ts
    const names = { owner: { '2': 'Priya', '5': 'Omar' } };
    const chipLabel = (asked: SurfaceContext) => surfaceLabel(asked, { dashboard: names });
    const { rerenderRail } = renderRail({ chipLabel, context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast · Owner: Priya' } });
```
and replace `    rerenderRail({ names, context: { kind: 'surface', context: moved, label: 'Revenue › Forecast · Owner: Omar' } });` with `    rerenderRail({ chipLabel, context: { kind: 'surface', context: moved, label: 'Revenue › Forecast · Owner: Omar' } });`.
- Rename the test title `'shows no per-message chip where no names are given (a dashboard thread reopened elsewhere is plain text)'` to `'shows no per-message chip where no chip label is given (a dashboard thread reopened elsewhere is plain text)'`.
- Add, after the test `'sends a dashboard context as the structured field, with no text prefix'`:
```tsx
  it('sends an organizations context as the structured field, and chips each question with the label given', async () => {
    const { spy } = stubCopilot();
    const ORG: OrganizationsContext = {
      surface: 'organizations',
      view: 'board',
      filters: { owner: '2' },
      focus: null,
    };
    renderRail({
      chipLabel: (asked) => (asked.surface === 'organizations' ? 'Organizations · Owner: Carl CSM' : 'elsewhere'),
      context: { kind: 'surface', context: ORG, label: 'Organizations · Owner: Carl CSM' },
    });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    expect(postedBodies(spy)).toEqual([{ content: 'Who renews first?', context: ORG }]);
    expect(within(screen.getByRole('log', { name: 'Copilot messages' })).getByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/copilot src/pages/copilot/CopilotSidebar.origin.test.tsx src/pages/dashboard/ask/originPath.test.ts`
Expected: FAIL. `surfaceLabels.test.ts` cannot resolve `./surfaceLabels`. `CopilotRail.test.tsx` fails on `kind: 'surface'` (and on type errors under `tsc`). The HistoryPopover, CopilotSidebar and originPath Organizations cases print "undefined" or the wrong path.

- [ ] **Step 3: Widen the types and the send path**

In `src/pages/copilot/types.ts`, replace:
```ts
  /** User turns asked on the dashboard: the context as the server validated
   *  it (focus ids already intersected with the viewer's book). Null or
   *  absent everywhere else. */
  context?: DashboardContext | null;
```
with:
```ts
  /** User turns asked on the Dashboard or Organizations: the context as the
   *  server validated it (focus ids already intersected with the viewer's
   *  book). Null or absent everywhere else. */
  context?: SurfaceContext | null;
```
and replace:
```ts
  /** Where a dashboard conversation started; null for every other one. */
  origin?: DashboardOrigin | null;
```
with:
```ts
  /** Where a Dashboard or Organizations conversation started; null for every
   *  other one. There is no separate `origin_label`: an Organizations
   *  origin carries its own `labels`, server-built, that the History tag
   *  joins as `["Organizations", ...labels].join(' · ')`. */
  origin?: SurfaceOrigin | null;
```

In `src/pages/copilot/copilotApi.ts`, replace `import type { DraftReply, Conversation, ConversationSummary, DashboardContext } from './types';` with `import type { DraftReply, Conversation, ConversationSummary, SurfaceContext } from './types';`. Then replace `export function sendMessage(params: { conversationId?: number; content: string; context?: DashboardContext }): Promise<Conversation> {` with `export function sendMessage(params: { conversationId?: number; content: string; context?: SurfaceContext }): Promise<Conversation> {`. Finally, replace the comment above it:
```ts
// Omit `conversationId` to start a new Conversation (titled from this
// message) — see SendMessageView's own docstring. `context` is the
// dashboard's structured "where I am"; without it the body is exactly what
// it has always been, so Communications and the Copilot page are unchanged.
```
with:
```ts
// Omit `conversationId` to start a new Conversation (titled from this
// message) — see SendMessageView's own docstring. `context` is the
// Dashboard's or Organizations' structured "where I am"; without it the body
// is exactly what it has always been, so Communications and the Copilot page
// are unchanged.
```

In `src/components/copilot/useCopilotThread.ts`, replace `import type { Conversation, DashboardContext } from '../../pages/copilot/types';` with `import type { Conversation, SurfaceContext } from '../../pages/copilot/types';`, and replace:
```ts
/** One question: what the bubble shows (`text`), what is sent (`content`,
 *  which carries Communications' prefix), and the dashboard context. */
export interface Turn {
  text: string;
  content: string;
  context?: DashboardContext;
}
```
with:
```ts
/** One question: what the bubble shows (`text`), what is sent (`content`,
 *  which carries Communications' prefix), and the Dashboard's or
 *  Organizations' structured context. */
export interface Turn {
  text: string;
  content: string;
  context?: SurfaceContext;
}
```

Replace the whole of `src/components/copilot/railContext.ts` with:
```ts
import type { ReactNode } from 'react';
import type { SurfaceContext } from '../../pages/copilot/types';

/** What the rail's questions are about.
 *  - `label`: Communications. Sent as a `[About: <label>] ` text prefix, as always.
 *  - `surface`: the Dashboard or Organizations. Sent as the structured
 *    `context` field with no prefix; `label` is the chip text, e.g.
 *    "Revenue › Forecast · Owner: Priya" or "Organizations · Owner: Carl CSM". */
export type RailContext =
  | { kind: 'label'; label: string; icon?: ReactNode }
  | { kind: 'surface'; context: SurfaceContext; label: string };
```

- [ ] **Step 4: Write `surfaceLabels.ts`**

`src/components/copilot/surfaceLabels.ts`:
```ts
import { organizationsLabel } from '../../features/organizations/askContext';
import type { PortfolioResponse } from '../../features/organizations/portfolioTypes';
import type { ConversationSummary, SurfaceContext } from '../../pages/copilot/types';
import { contextLabel, viewLabel, type FilterNames } from './dashboardLabels';

/** What each surface names its filter values with: the dashboard views'
 *  filter options, and the portfolio's `filters` options. */
export interface SurfaceNames {
  dashboard?: FilterNames;
  organizations?: PortfolioResponse['filters'] | null;
}

/** A question's chip, on whichever surface it was asked. */
export function surfaceLabel(context: SurfaceContext, names: SurfaceNames = {}): string {
  return context.surface === 'organizations'
    ? organizationsLabel(context, names.organizations ?? null)
    : contextLabel(context, names.dashboard);
}

/** History's tag for a conversation: a dashboard one's area and view; an
 *  Organizations one's is "Organizations" followed by the server's own
 *  `labels` (it knows the owner's name), joined with " · ". Null for a
 *  conversation started anywhere else. */
export function originTag(summary: Pick<ConversationSummary, 'origin'>): string | null {
  const { origin } = summary;
  if (!origin) return null;
  if (origin.surface === 'organizations') return ['Organizations', ...origin.labels].join(' · ');
  return viewLabel(origin.area, origin.view);
}
```

- [ ] **Step 5: The rail: `chipLabel`, the `surface` kind and the tag**

In `src/components/copilot/CopilotRail.tsx`, replace the header comment (lines 1–7) with:
```ts
// The Copilot in a rail: shared by Communications (beside the inbox), the
// Dashboard (beside the figures) and Organizations (beside the list and the
// board).
//
// A conversation is real (`sendMessage` to /copilot/messages/); the rail holds
// one at a time. The context says what a question is about: Communications
// sends its picked source as a text prefix, the Dashboard and Organizations
// send where the person is as a structured `context` the server grounds the
// answer in.
```
Replace:
```ts
import { ChevronDown, Clock, LayoutDashboard, MessageSquare, Plus, Search, X } from 'lucide-react';
```
with:
```ts
import { ChevronDown, Clock, LayoutDashboard, MessageSquare, Network, Plus, Search, X } from 'lucide-react';
```
Replace:
```ts
import type { Conversation, ConversationSummary, CopilotMessage, DashboardContext } from '../../pages/copilot/types';
import { contextLabel, viewLabel, type FilterNames } from './dashboardLabels';
import type { RailContext } from './railContext';
```
with:
```ts
import type { Conversation, ConversationSummary, CopilotMessage, SurfaceContext } from '../../pages/copilot/types';
import type { RailContext } from './railContext';
import { originTag } from './surfaceLabels';
```
Replace:
```ts
  /** Names for filter values. Per-message chips render only when given, so a
   *  dashboard conversation reopened elsewhere reads as plain text. */
  names?: FilterNames;
```
with:
```ts
  /** Each question's own chip, worded by the surface it was asked on.
   *  Per-message chips render only when given, so a surface conversation
   *  reopened elsewhere (Communications) reads as plain text. */
  chipLabel?: (context: SurfaceContext) => string;
```
In the parameter list, replace `  names,\n  draft,` with `  chipLabel,\n  draft,`.
Replace:
```ts
  const chipOf = (asked: DashboardContext | null | undefined) => (names && asked ? contextLabel(asked, names) : undefined);
```
with:
```ts
  const chipOf = (asked: SurfaceContext | null | undefined) => (chipLabel && asked ? chipLabel(asked) : undefined);
```
Replace `      context?.kind === 'dashboard'` with `      context?.kind === 'surface'`.
In `HistoryPopover`, replace:
```tsx
                    {c.origin ? (
                      <span className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md bg-surface border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
                        <LayoutDashboard className="w-3 h-3" aria-hidden="true" />
                        <span className="sr-only">Started on the dashboard: </span>
                        {' '}
                        {viewLabel(c.origin.area, c.origin.view)}
                      </span>
                    ) : null}
```
with:
```tsx
                    {c.origin ? (
                      <span className="ml-auto min-w-0 max-w-[60%] shrink-0 inline-flex items-center gap-1 rounded-md bg-surface border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
                        {c.origin.surface === 'organizations' ? (
                          <Network className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <LayoutDashboard className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span className="sr-only">{c.origin.surface === 'organizations' ? 'Started on ' : 'Started on the dashboard: '}</span>
                        {' '}
                        <span className="truncate">{originTag(c)}</span>
                      </span>
                    ) : null}
```

- [ ] **Step 6: The Copilot page's history, the restore path and the dashboard rail (interim)**

In `src/pages/copilot/CopilotSidebar.tsx`, replace `import { viewLabel } from '../../components/copilot/dashboardLabels';` with `import { originTag } from '../../components/copilot/surfaceLabels';`, and replace:
```tsx
                conversations.map((conversation) => {
                  const session = sessions[conversation.id];
                  return (
                    <ChatItem
                      key={conversation.id}
                      text={conversation.title}
                      subtext={
                        conversation.origin
                          ? `${viewLabel(conversation.origin.area, conversation.origin.view)} · ${formatRelativeTime(conversation.updated_at)}`
                          : formatRelativeTime(conversation.updated_at)
                      }
```
with:
```tsx
                conversations.map((conversation) => {
                  const session = sessions[conversation.id];
                  const tag = originTag(conversation);
                  return (
                    <ChatItem
                      key={conversation.id}
                      text={conversation.title}
                      subtext={
                        tag
                          ? `${tag} · ${formatRelativeTime(conversation.updated_at)}`
                          : formatRelativeTime(conversation.updated_at)
                      }
```

Replace the whole of `src/pages/dashboard/ask/originPath.ts` with:
```ts
import { organizationsPath } from '../../../features/organizations/askContext';
import type { DashboardOrigin, SurfaceOrigin } from '../../copilot/types';
import { toQuery } from '../shared/useDashboardFilters';

/** A dashboard view with its shared filters. A missing view lands on the
 *  area, which redirects to its first view. */
function dashboardPath(origin: DashboardOrigin): string {
  const path =
    origin.area === 'overview'
      ? '/dashboard/overview'
      : origin.view
        ? `/dashboard/${origin.area}/${origin.view}`
        : `/dashboard/${origin.area}`;
  const query = toQuery({ owner: origin.filters.owner, lifecycle: origin.filters.lifecycle, customer: origin.filters.customer });
  return query ? `${path}?${query}` : path;
}

/** The page a conversation started on, with its filters: a dashboard view,
 *  or the Organizations list or board. */
export function originPath(origin: SurfaceOrigin): string {
  return origin.surface === 'organizations' ? organizationsPath(origin) : dashboardPath(origin);
}
```

In `src/pages/dashboard/ask/AskRail.tsx` (interim until Task 3), replace `import { contextLabel } from '../../../components/copilot/dashboardLabels';` with:
```ts
import { contextLabel } from '../../../components/copilot/dashboardLabels';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import type { SurfaceContext } from '../../copilot/types';
```
and replace:
```ts
  const railContext: RailContext | null = asked ? { kind: 'dashboard', context: asked, label: contextLabel(asked, names) } : null;
```
with:
```ts
  const railContext: RailContext | null = asked ? { kind: 'surface', context: asked, label: contextLabel(asked, names) } : null;
```
and, in `railProps`, replace `    names,` with `    chipLabel: (context: SurfaceContext) => surfaceLabel(context, { dashboard: names }),`.

- [ ] **Step 7: Run the new tests and every Dashboard, Copilot and Communications suite**

Run: `npx vitest run src/components/copilot src/pages/copilot src/pages/dashboard src/pages/communications src/e2e/dashboardAsk.test.tsx && npx tsc -b --noEmit`
Expected: PASS, with no dashboard assertion changed. tsc prints nothing.

- [ ] **Step 8: Commit**

```bash
git add src/pages/copilot/types.ts src/pages/copilot/copilotApi.ts src/pages/copilot/CopilotSidebar.tsx src/pages/copilot/CopilotSidebar.origin.test.tsx \
  src/components/copilot src/pages/dashboard/ask/originPath.ts src/pages/dashboard/ask/originPath.test.ts src/pages/dashboard/ask/AskRail.tsx
git commit -m "feat(copilot): the rail, chips, History tag and restore path know the Organizations surface

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Generalise `AskProvider`: a surface per page, a preference key, `focusOn`, and handing a conversation to its own page

**Files:**
- Modify: `src/pages/dashboard/ask/context.ts` (rewrite)
- Modify: `src/pages/dashboard/ask/AskProvider.tsx` (rewrite)
- Modify: `src/pages/dashboard/ask/askPreference.ts` (rewrite), `askPreference.test.ts`
- Modify: `src/pages/dashboard/ask/AskRail.tsx` (read `ask.surface`)
- Modify: `src/pages/dashboard/ask/useAsk.ts` (comment)
- Create: `src/pages/dashboard/ask/DashboardAskProvider.tsx`
- Modify: `src/pages/dashboard/DashboardFrame.tsx`
- Test: `src/pages/dashboard/ask/AskProvider.test.tsx` (new)

**Interfaces:**
- Consumes: `SurfaceContext`, `SurfaceName`, `DashboardFocus`, `Conversation` (types); `originPath` (Task 2); `surfaceLabel` (Task 2); `fetchConversation` (`pages/copilot/copilotApi.ts`); `useDashboardContext`, `useFilterNames` (existing).
- Produces:
  - `AskSurface {name: SurfaceName; context: SurfaceContext | null; chipLabel: (context: SurfaceContext) => string}`
  - `AskState` gains `surface: AskSurface` and `focusOn: (focus: DashboardFocus) => void`. Every existing field is unchanged. `focus`/`focusOn`/`draft`/`ask` keep the shared, surface-agnostic `DashboardFocus` shape (the Dashboard's own `attention` focus included); on Organizations only `useAskFocusOnOpen` (Task 4) ever writes here, and only ever with `{kind: 'companies'}`, so `ask()`'s cast to `SurfaceContext` when building an Organizations send is safe in practice even though `OrganizationsContext.focus` is typed narrower (`OrganizationsFocus | null`).
  - `AskProvider({surface, preferenceKey = ASK_PREFERENCE_KEY, children})`
  - `AskHandover {askConversationId?: number}`: the navigation state a cross-surface History pick sends.
  - `ORGANIZATIONS_ASK_KEY = 'revenact_organizations_ask'`
  - `readAskPreference(key = ASK_PREFERENCE_KEY)`, `writeAskPreference(open, key = ASK_PREFERENCE_KEY)`
  - `DashboardAskProvider({children})`

- [ ] **Step 1: Write the failing tests**

`src/pages/dashboard/ask/AskProvider.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { resetViewport, setViewport } from '../../../test/viewport';
import type { Conversation, SurfaceName } from '../../copilot/types';
import { ASK_PREFERENCE_KEY, ORGANIZATIONS_ASK_KEY } from './askPreference';
import { AskProvider } from './AskProvider';
import type { AskSurface } from './context';
import { useAsk } from './useAsk';

const orgConversation: Conversation = {
  id: 9,
  title: 'Who renews first?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] },
  messages: [],
};
const dashConversation: Conversation = {
  id: 4,
  title: 'Why is at-risk ARR up?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } },
  messages: [],
};

function Probe() {
  const ask = useAsk()!;
  const { pathname, search } = useLocation();
  return (
    <div>
      <p data-testid="where">{pathname + search}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="title">{ask.conversation?.title ?? 'none'}</p>
      <p data-testid="open">{String(ask.open)}</p>
      <p data-testid="focus">{JSON.stringify(ask.focus)}</p>
      <button type="button" onClick={() => ask.openFromHistory(orgConversation)}>Open organizations chat</button>
      <button type="button" onClick={() => ask.openFromHistory(dashConversation)}>Open dashboard chat</button>
      <button type="button" onClick={() => ask.focusOn({ kind: 'companies', ids: [7] })}>Focus Pizza Hut</button>
      <button type="button" onClick={() => ask.setOpen(true)}>Show rail</button>
    </div>
  );
}

const surfaceOf = (name: SurfaceName): AskSurface => ({ name, context: null, chipLabel: () => '' });

// Two component types, so moving between the routes mounts a fresh provider,
// as moving between DashboardFrame and OrganizationsAskLayout does.
function DashboardSide() {
  return (
    <AskProvider surface={surfaceOf('dashboard')}>
      <Probe />
    </AskProvider>
  );
}
function OrganizationsSide() {
  return (
    <AskProvider surface={surfaceOf('organizations')} preferenceKey={ORGANIZATIONS_ASK_KEY}>
      <Probe />
    </AskProvider>
  );
}

function renderAt(url: string, width: number) {
  setViewport(width);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dashboard/*" element={<DashboardSide />} />
        <Route path="/organizations/*" element={<OrganizationsSide />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AskProvider', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('narrows the next question with focusOn, without opening the rail', async () => {
    renderAt('/organizations/list', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Focus Pizza Hut' }));
    expect(screen.getByTestId('focus')).toHaveTextContent('{"kind":"companies","ids":[7]}');
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });

  it("keeps each surface's open choice under its own key", async () => {
    renderAt('/organizations/list', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Show rail' }));
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBe('open');
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBeNull();
  });

  it("reopens its own surface's conversation where it started, and shows it", async () => {
    renderAt('/organizations/board', 1100);
    await userEvent.click(screen.getByRole('button', { name: 'Open organizations chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/list?owner=2');
    expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?');
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBeNull();
  });

  it("sends another surface's conversation to its own page, whose rail shows it for that visit", async () => {
    stubCopilot({ conversationById: { 9: orgConversation } });
    renderAt('/dashboard/overview', 1100);
    expect(screen.getByTestId('surface')).toHaveTextContent('dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'Open organizations chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('organizations');
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Who renews first?'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBeNull();
  });

  it('hands a dashboard conversation picked on Organizations to the dashboard, as a sheet on a phone', async () => {
    stubCopilot({ conversationById: { 4: dashConversation } });
    renderAt('/organizations/list', 375);
    await userEvent.click(screen.getByRole('button', { name: 'Open dashboard chat' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Why is at-risk ARR up?'));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
  });
});
```

In `src/pages/dashboard/ask/askPreference.test.ts`, replace the import line with `import { ASK_PREFERENCE_KEY, ORGANIZATIONS_ASK_KEY, readAskPreference, writeAskPreference } from './askPreference';`, and add inside the `describe`:
```ts
  it("keeps another surface's choice under its own key", () => {
    writeAskPreference(false, ORGANIZATIONS_ASK_KEY);
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBe('closed');
    expect(readAskPreference(ORGANIZATIONS_ASK_KEY)).toBe(false);
    expect(readAskPreference()).toBeNull();
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/dashboard/ask/AskProvider.test.tsx src/pages/dashboard/ask/askPreference.test.ts`
Expected: FAIL. `ORGANIZATIONS_ASK_KEY` is not exported, `AskProvider` rejects the `surface` prop (type error, and at runtime `useDashboardContext` gives a null context and no `surface`), and `ask.focusOn` is not a function.

- [ ] **Step 3: The preference keys**

Replace the whole of `src/pages/dashboard/ask/askPreference.ts` with:
```ts
export const ASK_PREFERENCE_KEY = 'revenact_dashboard_ask';
/** Organizations' rail keeps its own choice: hiding it there says nothing
 *  about the Dashboard, and the reverse. */
export const ORGANIZATIONS_ASK_KEY = 'revenact_organizations_ask';

/** The person's own open/closed choice for a rail, or null before one. A
 *  private window or blocked storage reads as "no choice", so the default
 *  (open from xl) applies. */
export function readAskPreference(key = ASK_PREFERENCE_KEY): boolean | null {
  try {
    const value = localStorage.getItem(key);
    return value === 'open' ? true : value === 'closed' ? false : null;
  } catch {
    return null;
  }
}

export function writeAskPreference(open: boolean, key = ASK_PREFERENCE_KEY): void {
  try {
    localStorage.setItem(key, open ? 'open' : 'closed');
  } catch {
    /* forgotten next visit; the default applies */
  }
}
```

- [ ] **Step 4: The state's shape**

Replace the whole of `src/pages/dashboard/ask/context.ts` with:
```ts
import { createContext } from 'react';
import type { CopilotThread } from '../../../components/copilot/useCopilotThread';
import type { Conversation, DashboardFocus, SurfaceContext, SurfaceName } from '../../copilot/types';

/** One page's side of Ask Revenact: which surface it is, where the person is
 *  on it now (null off a real view, e.g. mid-redirect), and how it words a
 *  question's context as a chip. */
export interface AskSurface {
  name: SurfaceName;
  context: SurfaceContext | null;
  chipLabel: (context: SurfaceContext) => string;
}

export interface AskState {
  /** The surface this rail asks from. */
  surface: AskSurface;
  /** The rail is expanded (sm and up) or the sheet is open (below sm). */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The surface's one conversation; survives tab and filter changes. */
  conversation: Conversation | null;
  setConversation: (conversation: Conversation | null) => void;
  thread: CopilotThread;
  /** What the next question is narrowed to, if anything. */
  focus: DashboardFocus | null;
  /** The chip's ×: drop the focus, keep the screen. */
  clearFocus: () => void;
  /** Narrow the next question to `focus` without opening the rail or
   *  prefilling anything (an opened Organizations row or card). */
  focusOn: (focus: DashboardFocus) => void;
  /** A question left: its focus and prefilled draft are spent. */
  markSent: () => void;
  pendingDraft: { text: string; nonce: number } | null;
  /** Prefill an editable question about `focus` and open the rail; never sends. */
  draft: (question: string, focus: DashboardFocus) => void;
  /** Open the rail and send `question` now, grounded in the screen as it is. */
  ask: (question: string, focus: DashboardFocus | null) => void;
  /** Start over: an empty conversation, with the rail shown for this visit. */
  newChat: () => void;
  /** Show a conversation picked in History. */
  openFromHistory: (conversation: Conversation) => void;
}

export const AskContext = createContext<AskState | null>(null);
```

- [ ] **Step 5: The provider**

Replace the whole of `src/pages/dashboard/ask/AskProvider.tsx` with:
```tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCopilotThread } from '../../../components/copilot/useCopilotThread';
import { SM, XL, useMediaQuery } from '../../../lib/useMediaQuery';
import { fetchConversation } from '../../copilot/copilotApi';
import type { Conversation, DashboardFocus, SurfaceContext } from '../../copilot/types';
import { ASK_PREFERENCE_KEY, readAskPreference, writeAskPreference } from './askPreference';
import { AskContext, type AskState, type AskSurface } from './context';
import { originPath } from './originPath';

/** The navigation state another surface's History sends with a conversation
 *  that started on this page. */
export interface AskHandover {
  askConversationId?: number;
}

/** Holds one surface's conversation (the Dashboard's above its areas,
 *  Organizations' above the List and the Board), so it survives tab and
 *  filter changes. Also the rail's open state, the focus an entry point hands
 *  it, and the question a drill prefills. `surface` is where the person is on
 *  that page and how its chips read; `preferenceKey` is where the rail's own
 *  open/closed choice is kept. */
export function AskProvider({
  surface,
  preferenceKey = ASK_PREFERENCE_KEY,
  children,
}: {
  surface: AskSurface;
  preferenceKey?: string;
  children: ReactNode;
}) {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  const isSm = useMediaQuery(SM);
  const isXl = useMediaQuery(XL);
  // Read once, on arrival: a conversation another surface's History sent here.
  const [handedId] = useState<number | null>(() => (state as AskHandover | null)?.askConversationId ?? null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const thread = useCopilotThread(conversation, setConversation);
  // A handed-over conversation shows for this visit, whatever the saved choice.
  const [choice, setChoice] = useState<boolean | null>(() => (handedId !== null ? true : readAskPreference(preferenceKey)));
  const [sheetOpen, setSheetOpen] = useState(handedId !== null);
  const [focus, setFocus] = useState<DashboardFocus | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{ text: string; nonce: number } | null>(null);

  useEffect(() => {
    if (handedId === null) return;
    let cancelled = false;
    fetchConversation(handedId).then(
      (found) => {
        if (!cancelled) setConversation(found);
      },
      () => {
        // The rail opens empty; History still lists the conversation.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [handedId]);

  // A focus names accounts on the screen it came from, so another area or
  // filter drops it (a drill closes on the same change). Adjusted during
  // render, as DrillContext does. The typed draft stays: it is the person's text.
  const locationKey = pathname + search;
  const [madeAt, setMadeAt] = useState(locationKey);
  if (madeAt !== locationKey) {
    setMadeAt(locationKey);
    setFocus(null);
  }

  // Open by default from xl; the person's own choice wins once made. Below
  // sm the rail is a sheet, which always starts closed (unless a
  // conversation was handed over).
  const railOpen = choice ?? isXl;
  const open = isSm ? railOpen : sheetOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (isSm) {
        setChoice(next);
        writeAskPreference(next, preferenceKey);
      } else {
        setSheetOpen(next);
      }
    },
    [isSm, preferenceKey],
  );

  // Entry points (a drill's "Ask about these", an attention row's "Why?",
  // New chat, a History pick) open the rail for this visit only; the saved choice is the person's own
  // toggle, so one click never overwrites a remembered "collapsed".
  const reveal = useCallback(() => {
    if (isSm) setChoice(true);
    else setSheetOpen(true);
  }, [isSm]);

  const clearFocus = useCallback(() => setFocus(null), []);
  const focusOn = useCallback((next: DashboardFocus) => setFocus(next), []);
  const markSent = useCallback(() => {
    setFocus(null);
    setPendingDraft(null);
  }, []);

  const value = useMemo<AskState>(
    () => ({
      surface,
      open,
      setOpen,
      conversation,
      setConversation,
      thread,
      focus,
      clearFocus,
      focusOn,
      markSent,
      pendingDraft,
      draft: (question, nextFocus) => {
        setFocus(nextFocus);
        // A new nonce remounts the composer with the new text. After markSent
        // the key is 0, so restarting at 1 still differs from the last key.
        setPendingDraft((prev) => ({ text: question, nonce: (prev?.nonce ?? 0) + 1 }));
        reveal();
      },
      ask: (question, nextFocus) => {
        // One question at a time: while an answer is on its way the thread
        // would drop this send, so leave the draft and its focus as they are.
        const context = surface.context;
        if (!context || thread.pending) return;
        reveal();
        // `focus` is the shared, surface-agnostic slot (the Dashboard also
        // offers an `attention` focus); on Organizations only
        // `useAskFocusOnOpen` ever writes here, and it only ever builds a
        // `{kind: 'companies'}` value, so this cast is safe in practice even
        // though `OrganizationsContext.focus` is typed narrower than
        // `DashboardFocus`.
        void thread.send({ text: question, content: question, context: { ...context, focus: nextFocus } as SurfaceContext });
        // The send above carries its own focus; an earlier draft's focus and
        // text are spent, or the chip would name accounts nobody asked about.
        setFocus(null);
        setPendingDraft(null);
      },
      newChat: () => {
        setConversation(null);
        reveal();
      },
      openFromHistory: (next) => {
        const origin = next.origin;
        if (origin && origin.surface !== surface.name) {
          // Started on the other surface: it reopens on that page, beside
          // what it was about, and that page's rail picks it up.
          const handover: AskHandover = { askConversationId: next.id };
          navigate(originPath(origin), { state: handover });
          return;
        }
        // One from this surface reopens where it was asked, so its first
        // answer sits beside the figures it was about.
        if (origin) navigate(originPath(origin));
        setConversation(next);
        reveal();
      },
    }),
    [surface, open, setOpen, reveal, conversation, thread, focus, clearFocus, focusOn, markSent, pendingDraft, navigate],
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
```

- [ ] **Step 6: The Dashboard's surface, the rail reading it, and the frame**

`src/pages/dashboard/ask/DashboardAskProvider.tsx`:
```tsx
import type { ReactNode } from 'react';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { AskProvider } from './AskProvider';
import type { AskSurface } from './context';
import { useFilterNames } from './filterNames';
import { useDashboardContext } from './useDashboardContext';

/** The Dashboard's side of Ask: where the person is on it (read at send
 *  time, never figures), and chips named from the views' filter options.
 *  Sits inside FilterNamesProvider, where the old provider read the same. */
export function DashboardAskProvider({ children }: { children: ReactNode }) {
  const { context } = useDashboardContext();
  const names = useFilterNames();
  const surface: AskSurface = {
    name: 'dashboard',
    context,
    chipLabel: (asked) => surfaceLabel(asked, { dashboard: names }),
  };
  return <AskProvider surface={surface}>{children}</AskProvider>;
}
```

In `src/pages/dashboard/DashboardFrame.tsx`, replace `import { AskProvider } from './ask/AskProvider';` with `import { DashboardAskProvider } from './ask/DashboardAskProvider';`, replace `      <AskProvider>` with `      <DashboardAskProvider>`, and replace `      </AskProvider>` with `      </DashboardAskProvider>`.

In `src/pages/dashboard/ask/AskRail.tsx`:
- Replace the import block
```ts
import { contextLabel } from '../../../components/copilot/dashboardLabels';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import type { SurfaceContext } from '../../copilot/types';
```
with nothing (delete those three lines).
- Delete the lines `import { useFilterNames } from './filterNames';` and `import { useDashboardContext } from './useDashboardContext';`.
- Replace the doc comment's first line `/** The Ask rail beside the dashboard, shaped like Communications' Copilot` with `/** The Ask rail beside the Dashboard or Organizations, shaped like Communications' Copilot`.
- Delete the two lines `  const { context } = useDashboardContext();` and `  const names = useFilterNames();`.
- Replace:
```ts
  const asked = context ? { ...context, focus: ask.focus } : null;
  const railContext: RailContext | null = asked ? { kind: 'surface', context: asked, label: contextLabel(asked, names) } : null;
```
with:
```ts
  const { context, chipLabel } = ask.surface;
  // ask.focus is the shared DashboardFocus | null slot (Task 3); on
  // Organizations it is only ever a companies focus, narrower than
  // OrganizationsContext.focus's own static type, hence the cast.
  const asked = context ? ({ ...context, focus: ask.focus } as NonNullable<typeof context>) : null;
  const railContext: RailContext | null = asked ? { kind: 'surface', context: asked, label: chipLabel(asked) } : null;
```
- In `railProps`, replace `    chipLabel: (context: SurfaceContext) => surfaceLabel(context, { dashboard: names }),` with `    chipLabel,`.

In `src/pages/dashboard/ask/useAsk.ts`, replace the comment:
```ts
/** The dashboard's Ask rail, or null outside DashboardFrame (a view or list
 *  rendered on its own in a test), where the entry points hide themselves. */
```
with:
```ts
/** The page's Ask rail, or null outside an Ask provider (DashboardFrame,
 *  OrganizationsAskLayout), e.g. a view or list rendered on its own in a
 *  test, where the entry points hide themselves. */
```

- [ ] **Step 7: Run the new tests and every Dashboard suite**

Run: `npx vitest run src/pages/dashboard src/components/copilot src/pages/communications src/pages/copilot src/e2e/dashboardAsk.test.tsx && npx tsc -b --noEmit`
Expected: PASS. That is the new `AskProvider.test.tsx` (5 tests), `askPreference.test.ts` (3 tests), and every existing dashboard test with no assertion changed. tsc prints nothing.

- [ ] **Step 8: Commit**

```bash
git add src/pages/dashboard/ask src/pages/dashboard/DashboardFrame.tsx
git commit -m "refactor(ask): AskProvider takes a surface and a preference key; focusOn; cross-surface history handover

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Organizations surface: context hook, filter-option names, focus on open, and the layout route

**Files:**
- Create: `src/pages/organizations/ask/useOrganizationsContext.ts`
- Create: `src/pages/organizations/ask/portfolioOptions.ts`
- Create: `src/pages/organizations/ask/useAskFocus.ts`
- Create: `src/pages/organizations/ask/OrganizationsAskLayout.tsx`
- Modify: `src/App.tsx` (import and the `organizations` routes)
- Test: `src/pages/organizations/ask/useOrganizationsContext.test.tsx`, `src/pages/organizations/ask/OrganizationsAskLayout.test.tsx`

**Interfaces:**
- Consumes: `defaultGroupOf`, `toContextFilters` (Task 1); `boardParams` (`portfolioParams.ts`); `usePortfolioParams` (`components/organizations/portfolio/usePortfolioParams.ts`); `AskProvider`, `AskSurface`, `ORGANIZATIONS_ASK_KEY`, `useAsk` (Task 3); `surfaceLabel` (Task 2).
- Produces:
  - `parseOrganizationsView(pathname: string): OrganizationsView | null`
  - `useOrganizationsContext(): OrganizationsContext | null`
  - `PortfolioOptions = PortfolioResponse['filters']`
  - `PortfolioOptionsContext` (a `(options: PortfolioOptions) => void` or null)
  - `useReportPortfolioOptions(options: PortfolioOptions | null): void`
  - `useAskFocusOnOpen(openId: number | null): void`
  - `OrganizationsAskLayout()`, a layout route element rendering `<Outlet />`

- [ ] **Step 1: Write the failing tests**

`src/pages/organizations/ask/useOrganizationsContext.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseOrganizationsView, useOrganizationsContext } from './useOrganizationsContext';

const at = (url: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };

describe('useOrganizationsContext', () => {
  it.each([
    ['/organizations/list', { view: 'list', filters: {} }],
    [
      '/organizations/list?owner=2&lifecycle=live,renewal&sort=name&include_churned=1',
      { view: 'list', filters: { owner: '2', lifecycle: 'live,renewal', include_churned: '1', sort: 'name' } },
    ],
    // An explicit "None" is sent as '', never omitted.
    ['/organizations/list?group=none&ids=3,7', { view: 'list', filters: { ids: '3,7', group: '' } }],
    // The List's own default (health) and the Board's (lifecycle) are omitted, never sent as themselves.
    ['/organizations/board', { view: 'board', filters: {} }],
    // The Board never asks ungrouped: group=none there reads back as lifecycle, its own default, so it too is omitted.
    ['/organizations/board?group=none&owner=unassigned', { view: 'board', filters: { owner: 'unassigned' } }],
    ['/organizations/board?group=owner&search=pizza', { view: 'board', filters: { search: 'pizza', group: 'owner' } }],
  ])('%s', (url, expected) => {
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at(url) });
    expect(result.current).toEqual({ surface: 'organizations', focus: null, ...expected });
  });

  it('has no context off the list and the board', () => {
    expect(parseOrganizationsView('/organizations/7')).toBeNull();
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at('/organizations/7') });
    expect(result.current).toBeNull();
  });
});
```

`src/pages/organizations/ask/OrganizationsAskLayout.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';
import type { SurfaceContext } from '../../copilot/types';
import { useAsk } from '../../dashboard/ask/useAsk';
import { OrganizationsAskLayout } from './OrganizationsAskLayout';
import { useReportPortfolioOptions } from './portfolioOptions';
import { useAskFocusOnOpen } from './useAskFocus';

function Page({ name }: { name: string }) {
  const ask = useAsk()!;
  const [openId, setOpenId] = useState<number | null>(null);
  useReportPortfolioOptions(FILTER_OPTIONS);
  useAskFocusOnOpen(openId);
  const { context, chipLabel } = ask.surface;
  return (
    <div>
      <p data-testid="page">{name}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="view">{context?.surface === 'organizations' ? context.view : 'none'}</p>
      {/* ask.focus is the shared DashboardFocus | null slot; on Organizations
          it is only ever a companies focus (useAskFocusOnOpen), narrower
          than OrganizationsContext.focus's own type expects statically. */}
      <p data-testid="chip">{context ? chipLabel({ ...context, focus: ask.focus } as SurfaceContext) : 'none'}</p>
      <p data-testid="conversation">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.setConversation({ id: 3, title: 'Kept', created_at: '', updated_at: '', messages: [] })}>
        Start
      </button>
      <button type="button" onClick={() => setOpenId(7)}>Open Pizza Hut</button>
      <button type="button" onClick={() => setOpenId(null)}>Close Pizza Hut</button>
      <Link to="/organizations/board?owner=2">Board</Link>
    </div>
  );
}

function renderLayout(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/organizations" element={<OrganizationsAskLayout />}>
          <Route path="list" element={<Page name="List" />} />
          <Route path="board" element={<Page name="Board" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrganizationsAskLayout', () => {
  it('asks from the organizations surface, naming filters from the options a page reports', async () => {
    renderLayout('/organizations/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('organizations');
    expect(screen.getByTestId('view')).toHaveTextContent('list');
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Organizations · Owner: Carl CSM'));
  });

  it('focuses an opened account, and keeps the focus when it closes', async () => {
    renderLayout('/organizations/list');
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Organizations · 1 account'));
    await userEvent.click(screen.getByRole('button', { name: 'Close Pizza Hut' }));
    expect(screen.getByTestId('chip')).toHaveTextContent('Organizations · 1 account');
  });

  it('keeps one conversation across the List and the Board', async () => {
    renderLayout('/organizations/list?owner=2');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('link', { name: 'Board' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Board');
    expect(screen.getByTestId('view')).toHaveTextContent('board');
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/organizations/ask`
Expected: FAIL with "Failed to resolve import "./useOrganizationsContext"" (and the same for the layout).

- [ ] **Step 3: Write the four modules**

`src/pages/organizations/ask/useOrganizationsContext.ts`:
```ts
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePortfolioParams } from '../../../components/organizations/portfolio/usePortfolioParams';
import { defaultGroupOf, toContextFilters } from '../../../features/organizations/askContext';
import { boardParams } from '../../../features/organizations/portfolioParams';
import type { OrganizationsContext, OrganizationsView } from '../../copilot/types';

/** Which Organizations page a URL shows, or null for any other. */
export function parseOrganizationsView(pathname: string): OrganizationsView | null {
  if (pathname === '/organizations/list') return 'list';
  if (pathname === '/organizations/board') return 'board';
  return null;
}

/** Where the person is on Organizations, as the server needs it (spec §3):
 *  the view, and the portfolio's params as that page reads them (the
 *  Board's with its lifecycle default, never ungrouped). Never figures: the
 *  server recomputes the list. Null off the two routes. */
export function useOrganizationsContext(): OrganizationsContext | null {
  const { pathname } = useLocation();
  const view = parseOrganizationsView(pathname);
  const { params } = usePortfolioParams(defaultGroupOf(view ?? 'list'));
  return useMemo(() => {
    if (!view) return null;
    const shown = view === 'board' ? boardParams(params) : params;
    return { surface: 'organizations', view, filters: toContextFilters(shown, view), focus: null };
  }, [view, params]);
}
```

`src/pages/organizations/ask/portfolioOptions.ts`:
```ts
import { createContext, useContext, useEffect } from 'react';
import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';

export type PortfolioOptions = PortfolioResponse['filters'];

/** Only the List and the Board see the portfolio's filter options, so each
 *  reports its last read's here, and the Ask chips can say "Owner: Carl CSM"
 *  rather than "Owner: User 2". Null outside OrganizationsAskLayout. */
export const PortfolioOptionsContext = createContext<((options: PortfolioOptions) => void) | null>(null);

export function useReportPortfolioOptions(options: PortfolioOptions | null): void {
  const report = useContext(PortfolioOptionsContext);
  useEffect(() => {
    if (report && options) report(options);
  }, [report, options]);
}
```

`src/pages/organizations/ask/useAskFocus.ts`:
```ts
import { useEffect } from 'react';
import { useAsk } from '../../dashboard/ask/useAsk';

/** Opening an account (a List row, a Board card's side panel or sheet)
 *  narrows the next question to it (spec §3), as a dashboard drill does: for
 *  one question, dropped by the send, the chip's × or a filter change.
 *  Closing the account keeps it; opening another replaces it. Nothing
 *  happens outside an Ask provider. */
export function useAskFocusOnOpen(openId: number | null): void {
  const focusOn = useAsk()?.focusOn;
  useEffect(() => {
    if (openId !== null) focusOn?.({ kind: 'companies', ids: [openId] });
  }, [openId, focusOn]);
}
```

`src/pages/organizations/ask/OrganizationsAskLayout.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { ORGANIZATIONS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import type { AskSurface } from '../../dashboard/ask/context';
import { PortfolioOptionsContext, type PortfolioOptions } from './portfolioOptions';
import { useOrganizationsContext } from './useOrganizationsContext';

/** The Organizations routes' Ask (spec §3): one conversation above the List
 *  and the Board, so it survives the tab switch and every filter. Each page
 *  mounts the rail (and with it the pill) in OrganizationsFrame's rail slot. */
export function OrganizationsAskLayout() {
  const context = useOrganizationsContext();
  const [options, setOptions] = useState<PortfolioOptions | null>(null);
  const report = useCallback((next: PortfolioOptions) => {
    setOptions((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const surface: AskSurface = {
    name: 'organizations',
    context,
    chipLabel: (asked) => surfaceLabel(asked, { organizations: options }),
  };
  return (
    <PortfolioOptionsContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={ORGANIZATIONS_ASK_KEY}>
        <Outlet />
      </AskProvider>
    </PortfolioOptionsContext.Provider>
  );
}
```

- [ ] **Step 4: The routes**

In `src/App.tsx`, after `import { Details as OrganizationDetails } from './pages/organizations/Details';` add `import { OrganizationsAskLayout } from './pages/organizations/ask/OrganizationsAskLayout';`, and replace:
```tsx
          <Route path="organizations">
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<List />} />
            <Route path="board" element={<Board />} />
            <Route path=":id" element={<OrganizationDetails />} />
          </Route>
```
with:
```tsx
          <Route path="organizations">
            <Route index element={<Navigate to="list" replace />} />
            {/* One Ask conversation above both views (spec §3). */}
            <Route element={<OrganizationsAskLayout />}>
              <Route path="list" element={<List />} />
              <Route path="board" element={<Board />} />
            </Route>
            <Route path=":id" element={<OrganizationDetails />} />
          </Route>
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/pages/organizations/ask && npx tsc -b --noEmit`
Expected: PASS (7 + 3 tests); tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/pages/organizations/ask src/App.tsx
git commit -m "feat(organizations): the Ask surface: context from the URL, option names, focus on open, one layout above both views

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The rail and pill on the List and the Board (harness and integration)

**Files:**
- Modify: `src/pages/organizations/List.tsx` (imports, two hooks, `rail`)
- Modify: `src/pages/organizations/Board.tsx` (imports, two hooks, `rail`)
- Modify: `src/pages/organizations/OrganizationsFrame.tsx` (doc comment)
- Modify: `src/components/layout/Navbar.tsx` (one comment)
- Modify: `src/pages/organizations/testList.tsx` (rewrite: `ask` option, slot host, dashboard routes)
- Create: `src/pages/organizations/ask/testOrganizationsAsk.ts`
- Test: `src/pages/organizations/ask/organizationsAsk.test.tsx`

**Interfaces:**
- Consumes: `AskRail` (Task 3); `useReportPortfolioOptions`, `useAskFocusOnOpen`, `OrganizationsAskLayout` (Task 4); `stubCopilot`, `postedBodies` (`components/copilot/testCopilot.ts`); `stubPortfolio`, `PortfolioStub` (`features/organizations/testPortfolio.ts`); `dashboardRoutes` (`pages/dashboard/routes.tsx`); `NavActionsSlotContext`.
- Produces:
  - `renderOrganizations(url, {width?, nav?, ask?})`. With `ask`, the List and Board sit under `OrganizationsAskLayout`, a bare `data-testid="nav-actions"` slot stands in for the Navbar's when `nav` is false, and `/dashboard/*` is the real `dashboardRoutes(() => <Where />)`. Existing calls are unchanged.
  - `stubOrganizationsAsk({copilot?, portfolio?}) → {copilot, portfolio, release}`: `copilot` is the spy `postedBodies` reads, `portfolio` the one `portfolioQueries` reads.

- [ ] **Step 1: The harness**

`src/pages/organizations/ask/testOrganizationsAsk.ts`:
```ts
import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubPortfolio, type PortfolioStub } from '../../../features/organizations/testPortfolio';

/** Test-only. The portfolio's endpoints (stubPortfolio) and the Copilot's
 *  (stubCopilot) behind one fetch, so a page and its rail both answer.
 *  `copilot` is the spy postedBodies reads; `portfolio` the one
 *  portfolioQueries and patchBodies read. */
export function stubOrganizationsAsk(options: { copilot?: Parameters<typeof stubCopilot>[0]; portfolio?: PortfolioStub } = {}) {
  const copilot = stubCopilot(options.copilot);
  const portfolio = stubPortfolio(options.portfolio);
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : portfolio(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, portfolio, release: copilot.release };
}
```

Replace the whole of `src/pages/organizations/testList.tsx` with:
```tsx
// Test-only helpers, never hot-reloaded: Where sits beside the render
// helpers so a test imports one module, not two.
/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { dashboardRoutes } from '../dashboard/routes';
import { OrganizationsAskLayout } from './ask/OrganizationsAskLayout';
import { Board } from './Board';
import { List } from './List';

// Test-only. The real auth, customers and notifications slices (the modals
// dispatch into customers; the Navbar reads notifications). Only fetch is
// stubbed, by the caller, with stubPortfolio() or stubOrganizationsAsk().

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

/** DashboardLayout's Navbar actions slot. With the real Navbar (`nav`) the
 *  Navbar renders the slot element; without it a bare one stands in
 *  (`data-testid="nav-actions"`). */
function SlotHost({ bare, children }: { bare: boolean; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <NavActionsSlotContext.Provider value={value}>
      {bare ? <div ref={setSlot} data-testid="nav-actions" /> : null}
      {children}
    </NavActionsSlotContext.Provider>
  );
}

/** Both Organizations routes (and the organization page they link to) on the
 *  real store and router. `nav` adds the real Navbar, whose List/Board tabs
 *  switch between them carrying the query. `ask` puts both under
 *  OrganizationsAskLayout, as App.tsx does, with the real dashboard routes
 *  beside them (every view a Where) for History's cross-surface handover. */
export function renderOrganizations(
  url: string,
  { width = 1440, nav = false, ask = false }: { width?: number; nav?: boolean; ask?: boolean } = {},
) {
  setViewport(width);
  const store = makeStore();
  const pages = [
    <Route
      key="list"
      path="/organizations/list"
      element={
        <>
          <List />
          <Where />
        </>
      }
    />,
    <Route
      key="board"
      path="/organizations/board"
      element={
        <>
          <Board />
          <Where />
        </>
      }
    />,
  ];
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            {ask ? <Route element={<OrganizationsAskLayout />}>{pages}</Route> : pages}
            <Route path="/organizations/:id" element={<p>Organization page</p>} />
            {ask ? dashboardRoutes(() => <Where />) : null}
          </Routes>
        </SlotHost>
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

- [ ] **Step 2: Write the failing integration tests**

`src/pages/organizations/ask/organizationsAsk.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { ORGANIZATIONS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { renderList, renderOrganizations } from '../testList';
import { stubOrganizationsAsk } from './testOrganizationsAsk';

// Integration tier: the real List and Board under OrganizationsAskLayout, the
// real rail and pill, store and router; fetch answers the portfolio and the
// Copilot with contract-shaped bodies. `filters` below carry only the set
// keys (backend ruling): a view's own default group is never sent.
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const views = () => screen.getByRole('navigation', { name: 'Organizations views' });

describe('Ask Revenact on Organizations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the pill in the top bar and the glass rail beside the list, open from xl', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    const bar = within(screen.getByTestId('nav-actions'));
    expect(bar.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    // Glass is the rail's alone: rows stay solid surfaces.
    expect(document.querySelector('[data-row-id="7"]')).toHaveClass('bg-surface');
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the list's filters and names them in the chip", async () => {
    const { copilot } = stubOrganizationsAsk();
    renderOrganizations('/organizations/list?owner=2&lifecycle=live', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(await within(rail()!).findByText('Organizations · Owner: Carl CSM · Lifecycle: Live')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    expect(postedBodies(copilot)[0]).toEqual({
      content: 'Who renews first?',
      context: { surface: 'organizations', view: 'list', filters: { owner: '2', lifecycle: 'live' }, focus: null },
    });
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Organizations · Owner: Carl CSM · Lifecycle: Live')).toBeInTheDocument();
  });

  it('narrows the next question to an opened row, for that question only', async () => {
    const { copilot } = stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(await within(rail()!).findByText('Organizations · 1 account')).toBeInTheDocument();
    await userEvent.type(composer(), 'Why is this at risk?{enter}');
    await screen.findByText('Answer to: Why is this at risk?');
    expect(postedBodies(copilot)[0].context).toMatchObject({ focus: { kind: 'companies', ids: [7] } });
    await userEvent.type(composer(), 'And the rest?{enter}');
    await screen.findByText('Answer to: And the rest?');
    expect(postedBodies(copilot)[1].context).toMatchObject({ focus: null });
  });

  it('is on the board too: a card focuses it, and the conversation survives the switch to the list', async () => {
    const { copilot } = stubOrganizationsAsk();
    renderOrganizations('/organizations/board?owner=2', { ask: true, nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(await within(rail()!).findByText('Organizations · Owner: Carl CSM · 1 account')).toBeInTheDocument();
    await userEvent.type(composer(), 'Why this one?{enter}');
    await screen.findByText('Answer to: Why this one?');
    expect(postedBodies(copilot)[0].context).toEqual({
      surface: 'organizations',
      view: 'board',
      // group is omitted: lifecycle is the Board's own default.
      filters: { owner: '2' },
      focus: { kind: 'companies', ids: [7] },
    });

    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await screen.findByText('1 of 2 organizations');
    expect(screen.getByText('Answer to: Why this one?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And here?{enter}');
    await screen.findByText('Answer to: And here?');
    // group is omitted here too: health is the List's own default.
    expect(postedBodies(copilot)[1].context).toMatchObject({ view: 'list', filters: { owner: '2' }, focus: null });
  });

  it('is a full-screen sheet from the switch on a phone, never a rail', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true, width: 375 });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBeNull();
  });

  it('mounts nothing outside the Ask layout', async () => {
    stubOrganizationsAsk();
    renderList('/organizations/list');
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(rail()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copilot$/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/pages/organizations/ask/organizationsAsk.test.tsx`
Expected: FAIL. `rail()` is null (the pages pass no `rail`), and there is no pill in `nav-actions`. The last test passes already.

- [ ] **Step 4: Mount the rail and wire the hooks**

In `src/pages/organizations/List.tsx`, after `import { useSelection } from '../../components/organizations/portfolio/useSelection';` add:
```ts
import { AskRail } from '../dashboard/ask/AskRail';
import { useReportPortfolioOptions } from './ask/portfolioOptions';
import { useAskFocusOnOpen } from './ask/useAskFocus';
```
Replace:
```ts
  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;

  const toggleOpen
```
with:
```ts
  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  // Ask Revenact (spec §3): the chips name owners and products from this
  // read's options, and an opened row narrows the next question to it.
  useReportPortfolioOptions(options);
  useAskFocusOnOpen(openRow?.id ?? null);

  const toggleOpen
```
Replace `    <OrganizationsFrame>` with `    <OrganizationsFrame rail={<AskRail />}>`.

In `src/pages/organizations/Board.tsx`, after `import { FOCUS } from '../../components/organizations/portfolio/styles';` add:
```ts
import { AskRail } from '../dashboard/ask/AskRail';
import { useReportPortfolioOptions } from './ask/portfolioOptions';
import { useAskFocusOnOpen } from './ask/useAskFocus';
```
Replace:
```ts
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;
```
with:
```ts
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;
  // Ask Revenact (spec §3): chips named from this read's options; an opened
  // card (side panel or sheet) narrows the next question to it.
  useReportPortfolioOptions(options);
  useAskFocusOnOpen(openRow?.id ?? null);
```
Replace `    <OrganizationsFrame>` with `    <OrganizationsFrame rail={<AskRail />}>`.

In `src/pages/organizations/OrganizationsFrame.tsx`, replace:
```ts
 *  Ask rail beside it. Delivery 3 passes the rail and portals the pill into
 *  the Navbar's actions slot, which this route already renders. Until then
 *  the slot is empty and the content takes the full width. */
```
with:
```ts
 *  Ask rail beside it. The List and the Board pass `AskRail`, which also
 *  portals the pill into the Navbar's actions slot; hidden, or outside
 *  OrganizationsAskLayout, it renders nothing and the content takes the
 *  full width. */
```

In `src/components/layout/Navbar.tsx`, replace:
```tsx
          {/* The dashboard puts its Ask controls here (portaled from
              DashboardFrame) in place of the decorative icons. */}
```
with:
```tsx
          {/* The dashboard and the Organizations list and board put their
              Ask controls here (portaled by AskRail) in place of the
              decorative icons. */}
```

- [ ] **Step 5: Run the new tests and the delivery 1 and 2 suites**

Run: `npx vitest run src/pages/organizations src/components/organizations src/e2e/organizationsPortfolio.test.tsx src/e2e/organizationsBoard.test.tsx && npx tsc -b --noEmit`
Expected: PASS (6 new tests). Every existing List and Board test is unchanged, because without `ask` there is no provider and `AskRail` renders nothing. tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/pages/organizations src/components/layout/Navbar.tsx
git commit -m "feat(organizations): Ask Revenact rail and pill on the list and the board

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Fitting the rail: narrower columns, the rail wins over the side panel, rows and tiles wrap to their column

**Files:**
- Modify: `src/components/organizations/portfolio/PortfolioBoard.tsx` (props, skeleton, column element)
- Modify: `src/components/organizations/portfolio/BoardColumn.tsx` (prop, width class)
- Modify: `src/components/organizations/portfolio/AccountRow.tsx` (header class)
- Modify: `src/components/organizations/portfolio/SummaryTiles.tsx` (grid class, twice)
- Modify: `src/pages/organizations/Board.tsx` (rail state, side panel rule, `narrow`, tiles wrapper)
- Modify: `src/pages/organizations/List.tsx` (tiles and sections wrappers)
- Test: `src/components/organizations/portfolio/PortfolioBoard.test.tsx` (append), `src/components/organizations/portfolio/containerFit.test.tsx` (new), `src/pages/organizations/ask/askLayout.test.tsx` (new)

**Interfaces:**
- Consumes: `useAsk` (Task 3); `XL` (`lib/useMediaQuery.ts`); `renderOrganizations(…, {ask})` and `stubOrganizationsAsk` (Task 5).
- Produces:
  - `PortfolioBoardProps.narrow?: boolean` and `BoardColumnProps.narrow?: boolean` (`w-64` instead of `w-72` from `sm`; default false)
  - `AccountRow`'s header is `@min-[60rem]:flex-nowrap`
  - `SummaryTiles`' grid is `@min-[50rem]:grid-cols-5`
  - List and Board wrap tiles (and the List its sections) in `@container`

- [ ] **Step 1: Write the failing tests**

In `src/components/organizations/portfolio/PortfolioBoard.test.tsx`, insert after:
```ts
      expect(column('live')).toHaveClass('w-72');
    });
```
the test:
```ts

    it('narrows its columns beside the Ask rail', () => {
      stubPortfolio();
      renderBoard('', { narrow: true });
      expect(column('live')).toHaveClass('w-64');
      expect(column('live')).not.toHaveClass('w-72');
    });
```

`src/components/organizations/portfolio/containerFit.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { AccountRow } from './AccountRow';
import { SummaryTiles } from './SummaryTiles';

// jsdom applies no CSS: these pin the classes that make the row and the
// tiles follow their content column (which the Ask rail narrows) rather
// than the window. The browser check verifies the layout itself.
describe('fitting the content column', () => {
  it('lets a row wrap until its container is 60rem wide', () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <AccountRow
            row={pizzaHut}
            currency="USD"
            pins={[]}
            isSm
            selecting={false}
            selected={false}
            open={false}
            onToggleSelect={vi.fn()}
            onLongPress={vi.fn()}
            onToggleOpen={vi.fn()}
          />
        </ul>
      </MemoryRouter>,
    );
    const header = container.querySelector('[data-part="header"]');
    expect(header).toHaveClass('flex-wrap', '@min-[60rem]:flex-nowrap');
    expect(header).not.toHaveClass('sm:flex-nowrap');
  });

  it('puts five tiles in a row only when their container is 50rem wide', () => {
    const { container } = render(
      <SummaryTiles summary={null} failed={false} currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />,
    );
    const grid = container.querySelector('[class*="grid-cols-5"]');
    expect(grid).toHaveClass('@min-[50rem]:grid-cols-5');
    expect(grid).not.toHaveClass('lg:grid-cols-5');
  });
});
```

`src/pages/organizations/ask/askLayout.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizations } from '../testList';
import { stubOrganizationsAsk } from './testOrganizationsAsk';

// Integration tier: the rail wins its 320px (plan pre-flight 11–13).
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const askRail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });

describe('the Ask rail beside the list and the board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("narrows the board's columns while the rail is open", async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/board', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(column('live')).toHaveClass('w-64');
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(column('live')).toHaveClass('w-72'));
  });

  it('keeps the side panel beside the rail from xl', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/board', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(askRail()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });

  it('below xl the rail wins: opening it closes the side panel, and a card then opens as the sheet', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/board', { ask: true, width: 1100 });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    // The rail is closed below xl by default: the side panel, as before.
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    // The card's focus outlived its panel.
    expect(within(askRail()).getByText('Organizations · 1 account')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(await screen.findByRole('dialog', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });

  it('wraps list rows and tiles to the content column, not the window', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    const header = document.querySelector('[data-row-id="7"] [data-part="header"]') as HTMLElement;
    expect(header.closest('[class~="@container"]')).not.toBeNull();
    const tiles = document.querySelector('[class*="@min-[50rem]:grid-cols-5"]') as HTMLElement;
    expect(tiles.closest('[class~="@container"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioBoard.test.tsx src/components/organizations/portfolio/containerFit.test.tsx src/pages/organizations/ask/askLayout.test.tsx`
Expected: FAIL. Columns are `w-72` with `narrow`, the row is `sm:flex-nowrap`, the tiles are `lg:grid-cols-5` with no `@container` wrapper, and below `xl` the side panel stays when the rail opens.

- [ ] **Step 3: `narrow` columns**

In `src/components/organizations/portfolio/PortfolioBoard.tsx`:
- Replace:
```ts
  currency: CurrencyCode;
  isSm: boolean;
  filtered: boolean;
```
with:
```ts
  currency: CurrencyCode;
  isSm: boolean;
  /** The Ask rail is open beside the board (from `sm`): columns are w-64
   *  rather than w-72, so more of them fit beside it. */
  narrow?: boolean;
  filtered: boolean;
```
- Replace:
```tsx
function BoardSkeleton({ isSm }: { isSm: boolean }) {
  return (
    <div role="status" aria-label="Loading the board" className="flex gap-3 overflow-hidden">
      {Array.from({ length: isSm ? 4 : 1 }, (_, i) => (
        <div key={i} aria-hidden="true" className={`flex shrink-0 flex-col gap-2 p-1 ${isSm ? 'w-72' : 'w-full'}`}>
```
with:
```tsx
function BoardSkeleton({ isSm, narrow }: { isSm: boolean; narrow: boolean }) {
  return (
    <div role="status" aria-label="Loading the board" className="flex gap-3 overflow-hidden">
      {Array.from({ length: isSm ? 4 : 1 }, (_, i) => (
        <div key={i} aria-hidden="true" className={`flex shrink-0 flex-col gap-2 p-1 ${isSm ? (narrow ? 'w-64' : 'w-72') : 'w-full'}`}>
```
- In the `PortfolioBoard` parameter list, replace `  currency,\n  isSm,\n  filtered,` with `  currency,\n  isSm,\n  narrow = false,\n  filtered,`.
- Replace `  if (!data) return <BoardSkeleton isSm={isSm} />;` with `  if (!data) return <BoardSkeleton isSm={isSm} narrow={narrow} />;`.
- In `columnEls`, replace `      isSm={isSm}\n      canMove={canMove}` with `      isSm={isSm}\n      narrow={narrow}\n      canMove={canMove}`.

In `src/components/organizations/portfolio/BoardColumn.tsx`:
- Replace `  isSm: boolean;\n  canMove: boolean;` (in `BoardColumnProps`) with:
```ts
  isSm: boolean;
  /** Beside the open Ask rail: w-64 rather than w-72 (from sm). */
  narrow?: boolean;
  canMove: boolean;
```
- In the `BoardColumn` parameter list, replace `  isSm,\n  canMove,` with `  isSm,\n  narrow = false,\n  canMove,`.
- Replace `        isSm ? 'w-72' : 'w-full snap-start'` with `        isSm ? (narrow ? 'w-64' : 'w-72') : 'w-full snap-start'`.

- [ ] **Step 4: Rows and tiles follow their container**

In `src/components/organizations/portfolio/AccountRow.tsx`, replace `className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 cursor-pointer select-none sm:select-auto"` with `className="flex flex-wrap @min-[60rem]:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 cursor-pointer select-none sm:select-auto"`.

In `src/components/organizations/portfolio/SummaryTiles.tsx`, replace both occurrences of `lg:grid-cols-5` with `@min-[50rem]:grid-cols-5` (replace-all; one is in `Skeleton`, one in the tiles' row).

In `src/pages/organizations/List.tsx`, replace:
```tsx
        <SummaryTiles
          summary={portfolio.data?.summary ?? null}
          failed={!portfolio.data && portfolio.error !== null}
          currency={currency}
          params={params}
          onFilter={update}
        />
```
with:
```tsx
        {/* Containers: the tiles and rows follow this column, which the Ask
            rail narrows, not the window. */}
        <div className="@container">
          <SummaryTiles
            summary={portfolio.data?.summary ?? null}
            failed={!portfolio.data && portfolio.error !== null}
            currency={currency}
            params={params}
            onFilter={update}
          />
        </div>
```
and replace:
```tsx
        <PortfolioSections
          params={params}
          version={version}
          portfolio={portfolio}
          currency={currency}
          filtered={hasFilters(params)}
          renderRow={renderRow}
          onRowsLoaded={onRowsLoaded}
          onClearFilters={clearFilters}
          onAdd={() => setAdding(true)}
        />
```
with:
```tsx
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
            onAdd={() => setAdding(true)}
          />
        </div>
```

- [ ] **Step 5: The Board: rail state, which wins, and the tiles**

In `src/pages/organizations/Board.tsx`:
- Replace `import { SM, useMediaQuery } from '../../lib/useMediaQuery';` with `import { SM, XL, useMediaQuery } from '../../lib/useMediaQuery';`, and after `import { AskRail } from '../dashboard/ask/AskRail';` add `import { useAsk } from '../dashboard/ask/useAsk';`.
- Replace:
```ts
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();
```
with:
```ts
  const isSm = useMediaQuery(SM);
  const isXl = useMediaQuery(XL);
  const ask = useAsk();
  // The Ask rail (spec §3), open beside the board from sm, wins the room
  // (plan pre-flight 12): the columns narrow, and below xl, where a 320px
  // rail and the 26rem side panel don't both fit, an opened card is the
  // bottom sheet instead of the side panel.
  const railOpen = isSm && Boolean(ask?.open);
  const sidePanel = isSm && (!railOpen || isXl);
  const orgCurrency = useOrgCurrency();
```
- Replace:
```ts
  const onRowsLoaded = useCallback((rows: PortfolioRow[]) => {
    setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
  }, []);
```
with:
```ts
  const onRowsLoaded = useCallback((rows: PortfolioRow[]) => {
    setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
  }, []);

  // Opening the rail below xl takes the side panel's room: the open card
  // closes rather than turning into a sheet over the rail, and its focus
  // stays for the next question. Adjusted during render, not in an effect.
  const [railWas, setRailWas] = useState(railOpen);
  if (railWas !== railOpen) {
    setRailWas(railOpen);
    if (railOpen && !isXl) setOpenRow(null);
  }
```
- Replace:
```tsx
          <SummaryTiles
            summary={portfolio.data?.summary ?? null}
            failed={failed}
            currency={currency}
            params={params}
            onFilter={update}
          />
```
with:
```tsx
          <div className="@container">
            <SummaryTiles
              summary={portfolio.data?.summary ?? null}
              failed={failed}
              currency={currency}
              params={params}
              onFilter={update}
            />
          </div>
```
- Replace `            isSm={isSm}\n            filtered={hasFilters(params)}` with `            isSm={isSm}\n            narrow={railOpen}\n            filtered={hasFilters(params)}`.
- Replace `          {isSm && openRow ? <AccountSidePanel row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}` with `          {sidePanel && openRow ? <AccountSidePanel row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}`.
- Replace `      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}` with `      {!sidePanel && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}`.

- [ ] **Step 6: Run the new tests and everything Organizations**

Run: `npx vitest run src/components/organizations src/pages/organizations src/e2e/organizationsPortfolio.test.tsx src/e2e/organizationsBoard.test.tsx && npx tsc -b --noEmit`
Expected: PASS. That includes `houseRules.test.ts`: no new type sizes or colours in `portfolio/`. tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/components/organizations/portfolio src/pages/organizations
git commit -m "feat(organizations): the Ask rail wins its room: narrower columns, sheet below xl, rows and tiles follow their column

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: History restore on Organizations, both directions (integration)

**Files:**
- Test: `src/pages/organizations/ask/historyRestore.test.tsx` (new)

**Interfaces:**
- Consumes: `renderOrganizations(…, {ask})` with its dashboard routes (Task 5), `stubOrganizationsAsk` (Task 5), `openFromHistory`'s same-surface navigate and cross-surface handover (Task 3), `originPath`/`originTag` (Task 2).
- Produces: no production code. It proves the wiring across Tasks 2–5. A failure here is fixed in the task that owns the behaviour, with its own commit.

- [ ] **Step 1: Write the tests**

`src/pages/organizations/ask/historyRestore.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizations } from '../testList';
import { stubOrganizationsAsk } from './testOrganizationsAsk';

const where = () => screen.getByTestId('where').textContent;
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

// filters carry only the set keys; group is sent only when it differs from
// the view's own default (backend ruling), and labels are server-built.
const listOrigin = { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] };
const boardOrigin = { surface: 'organizations', view: 'board', filters: { owner: '2', group: 'owner' }, labels: ['Owner: Carl CSM'] };
const dashOrigin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

function chat(id: number, title: string, origin: unknown, answer: string) {
  const summary = { id, title, created_at: '', updated_at: '', origin };
  const full = {
    ...summary,
    messages: [
      { id: 1, role: 'user', content: title, context: origin ? { ...(origin as object), focus: null } : null, sources: [], questions: [], created_at: '' },
      { id: 2, role: 'assistant', content: answer, sources: [], questions: [], created_at: '' },
    ],
  };
  return { summary, full };
}

const renews = chat(9, 'Who renews first?', listOrigin, 'Pizza Hut, and it is overdue.');
const byOwner = chat(10, 'Whose book is riskiest?', boardOrigin, 'Carl CSM, by ARR at risk.');
const atRisk = chat(4, 'Why is at-risk ARR up?', dashOrigin, 'Two renewals slipped.');
const elsewhere = chat(5, 'Pizza Hut mail', null, 'They replied.');

function stubHistory() {
  return stubOrganizationsAsk({
    copilot: {
      conversations: [renews.summary, byOwner.summary, atRisk.summary, elsewhere.summary],
      conversationById: { 9: renews.full, 10: byOwner.full, 4: atRisk.full, 5: elsewhere.full },
    },
  });
}

async function pick(title: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: 'History' }));
  const panel = screen.getByRole('dialog', { name: 'History' });
  const item = await within(panel).findByRole('button', { name: title });
  await userEvent.click(item);
}

describe('History on Organizations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("tags an Organizations conversation with the server's tag, and reopens it on its view with its filters", async () => {
    stubHistory();
    renderOrganizations('/organizations/board', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', { name: /Who renews first\?/ });
    expect(within(item).getByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.click(item);
    expect(await within(log()).findByText('Pizza Hut, and it is overdue.')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/organizations/list?owner=2'));
    // The question's own chip, named from the list's options.
    expect(await within(log()).findByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
  });

  it('restores the board with its grouping', async () => {
    stubHistory();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Whose book is riskiest\?/);
    expect(await within(log()).findByText('Carl CSM, by ARR at risk.')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/organizations/board?owner=2&group=owner'));
  });

  it('sends a dashboard conversation to the dashboard, whose rail shows it', async () => {
    stubHistory();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Why is at-risk ARR up\?/);
    await waitFor(() => expect(where()).toBe('/dashboard/revenue/forecast?owner=2'));
    expect(await within(log()).findByText('Two renewals slipped.')).toBeInTheDocument();
  });

  it('brings an Organizations conversation picked on the dashboard back to its view', async () => {
    stubHistory();
    renderOrganizations('/dashboard/overview', { ask: true });
    await pick(/Who renews first\?/);
    await waitFor(() => expect(where()).toBe('/organizations/list?owner=2'));
    expect(await within(log()).findByText('Pizza Hut, and it is overdue.')).toBeInTheDocument();
  });

  it('opens a conversation from elsewhere where you are', async () => {
    stubHistory();
    renderOrganizations('/organizations/board?owner=2', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Pizza Hut mail/);
    expect(await within(log()).findByText('They replied.')).toBeInTheDocument();
    expect(where()).toBe('/organizations/board?owner=2');
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/pages/organizations/ask/historyRestore.test.tsx`
Expected: PASS (5 tests). A failure means a wiring bug in Tasks 2–5 (for example, the handover state not read on mount, or the route tree missing the dashboard routes). Fix it there rather than weakening the test.

- [ ] **Step 3: Commit**

```bash
git add src/pages/organizations/ask/historyRestore.test.tsx
git commit -m "test(organizations): History restores an Organizations conversation's view and filters, across surfaces too

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: End-to-end (jsdom): ask on a filtered list, focus a row, follow the board, reopen from History

**Files:**
- Create: `src/e2e/organizationsAsk.test.tsx`

**Interfaces:**
- Consumes: `renderOrganizations(url, {nav, ask})` (Task 5), `stubOrganizationsAsk` (Task 5), `postedBodies` (`testCopilot.ts`), the real `Navbar` (List/Board tabs carry the query) and `FiltersPanel`.
- Produces: no production code. This is the "ask" step of spec §5's e2e flow.

- [ ] **Step 1: Write the flow**

`src/e2e/organizationsAsk.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubOrganizationsAsk } from '../pages/organizations/ask/testOrganizationsAsk';
import { renderOrganizations } from '../pages/organizations/testList';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, both Organizations
// pages under OrganizationsAskLayout, the rail and pill, the store and the
// router. Only fetch is stubbed: the portfolio's endpoints and the Copilot's.
// filters below carry only the set keys, and group only when it differs from
// the view's own default (backend ruling).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const views = () => screen.getByRole('navigation', { name: 'Organizations views' });
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');

// lifecycle is the Board's own default group, so it is left out here.
const origin = { surface: 'organizations', view: 'board', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] };
const earlier = { id: 9, title: 'Which renewals slipped?', created_at: '', updated_at: '', origin };

describe('Ask Revenact on Organizations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks on a filtered list, about one opened row, follows the board, and reopens a board conversation from History', { timeout: 30000 }, async () => {
    const { copilot } = stubOrganizationsAsk({
      copilot: {
        conversations: [earlier],
        conversationById: {
          9: {
            ...earlier,
            messages: [
              { id: 1, role: 'user', content: 'Which renewals slipped?', context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
              { id: 2, role: 'assistant', content: 'Pizza Hut slipped 47 days.', sources: [], questions: [], created_at: '' },
            ],
          },
        },
      },
    });
    renderOrganizations('/organizations/list', { nav: true, ask: true });
    await screen.findByRole('link', { name: 'Globex' });

    // 1. Filter the list to Carl CSM's book.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();

    // 2. Ask: the question carries the list and its filter, named in the chip.
    expect(await within(rail()).findByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'organizations', view: 'list', filters: { owner: '2' }, focus: null });

    // 3. Open Pizza Hut's row: the next question is about it alone, once.
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(await within(rail()).findByText('Organizations · Owner: Carl CSM · 1 account')).toBeInTheDocument();
    await userEvent.type(composer(), 'Why is it at risk?{enter}');
    await screen.findByText('Answer to: Why is it at risk?');
    expect(postedBodies(copilot)[1].context).toMatchObject({ view: 'list', focus: { kind: 'companies', ids: [7] } });

    // 4. The Board tab keeps the filter and the conversation; a follow-up carries the board.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where().pathname).toBe('/organizations/board');
    expect(screen.getByText('Answer to: Why is it at risk?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And by stage?{enter}');
    await screen.findByText('Answer to: And by stage?');
    // group is omitted: lifecycle is the Board's own default.
    expect(postedBodies(copilot)[2].context).toEqual({
      surface: 'organizations',
      view: 'board',
      filters: { owner: '2' },
      focus: null,
    });

    // 5. Back on the List, start over, then reopen an earlier board conversation from History.
    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(screen.queryByText('Answer to: Who renews first?')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', { name: /Which renewals slipped\?/ });
    expect(item).toHaveAccessibleName(/Started on Organizations · Owner: Carl CSM/);
    await userEvent.click(item);
    expect(await within(rail()).findByText('Pizza Hut slipped 47 days.')).toBeInTheDocument();
    await waitFor(() => expect(where().pathname).toBe('/organizations/board'));
    expect(where().searchParams.get('owner')).toBe('2');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/organizationsAsk.test.tsx`
Expected: PASS (1 test). A failure means a wiring bug in Tasks 3–6. Fix it in the owning task rather than weakening the test.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/organizationsAsk.test.tsx
git commit -m "test(organizations): e2e Ask flow: filtered list, focused row, board follow-up, History reopen

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Docs and the design skill's glass exception

**Files:**
- Modify: `docs/04-app-flow.md` (§4.2, and the Dashboard Ask section)
- Modify: `docs/03-ui-ux-design.md` ("Ask rail", "Portfolio rows and board", §10, §11 item 4, standing-violations row 8)
- Modify: `.agents/workflows/repo-architecture.md` (Ask Revenact table, Organizations section, dependency tree)
- Modify: `.claude/skills/revenact-design/SKILL.md` (rule 4's exception)

**Interfaces:** docs only. They describe what Tasks 1–8 built, in the same PR (the product-docs rule).

- [ ] **Step 1: `docs/04-app-flow.md`**

Replace:
```markdown
that jumps to one. The board has no selection mode; bulk work stays on the
list.

### 4.3 Accounts
```
with:
```markdown
that jumps to one. The board has no selection mode; bulk work stays on the
list.

**Ask Revenact** is on both routes (spec §3). `OrganizationsAskLayout`, a
pathless layout route above the list and the board, holds one conversation
(the shared `AskProvider` with the `organizations` surface), so it survives
the tab switch and every filter. Each page puts `AskRail` in
`OrganizationsFrame`'s `rail` slot, and the rail portals the pill (New chat,
History, the Sparkles switch) into the Navbar's actions slot. Each question
posts `context: {surface:'organizations', view:'list'|'board',
filters:{search, owner, lifecycle, health, product, renews_within, nps, ids,
include_churned, sort, group}, focus}`: the portfolio params as the API reads
them, only the set keys present (never `ids: ''` or another unset key as
`''`), never a cursor, `group` only when it differs from the view's own
default, and the board's `group` never empty. The chip reads "Organizations ·
Owner: Carl CSM", with names from the
portfolio's filter options, which each page reports to the layout. Opening a
row on the list, or a card's side panel or sheet on the board, sets
`focus: {kind:'companies', ids:[id]}` for one question without opening the
rail. The send, the chip's × or a filter change drops it; closing the account
does not. The rail is the Dashboard's: a 320px glass column, open by default
from `xl`, a full-screen sheet below `sm`, with its own remembered choice
(`revenact_organizations_ask`). The rail wins its room. Beside it the board's
columns narrow to `w-64`. From `xl` the side panel sits between the columns
and the rail. Below `xl`, with the rail open, a card opens in the bottom
sheet, and opening the rail closes a side panel that was open. List rows and
the summary tiles wrap to their content column (container queries), not the
window. History tags an Organizations conversation with "Organizations"
followed by the server's own `labels`, joined with " · " ("Organizations ·
Owner: Carl CSM"; there is no `origin_label` field), and reopening one goes to
its view with its filters, then shows the thread. A conversation that started
on the Dashboard, picked here, goes to its dashboard view with
`askConversationId` in the navigation state, and the Dashboard's rail fetches
and shows it for that visit (and the reverse).

### 4.3 Accounts
```
Replace:
```markdown
- **Ask Revenact.** `DashboardFrame` mounts `FilterNamesProvider` →
  `AskProvider` → `DrillProvider` around `[scroll area][AskRail]`
```
with:
```markdown
- **Ask Revenact.** `DashboardFrame` mounts `FilterNamesProvider` →
  `DashboardAskProvider` (the shared `AskProvider` with the dashboard
  surface) → `DrillProvider` around `[scroll area][AskRail]`
```
Replace:
```markdown
    question's own chip. Reopening one on the dashboard navigates to its area,
    view and filters, then shows the thread. From Communications or `/copilot`
    it opens where you are, as plain text, with the tag shown.
```
with:
```markdown
    question's own chip. Reopening one on the dashboard navigates to its area,
    view and filters, then shows the thread. A conversation that started on
    Organizations reopens there instead, with its view and filters (§4.2).
    From Communications or `/copilot` it opens where you are, as plain text,
    with the tag shown (an Organizations one's is "Organizations" followed by
    the server's own `labels`; there is no `origin_label` field).
```

- [ ] **Step 2: `docs/03-ui-ux-design.md`**

Replace:
```markdown
`src/components/copilot/CopilotRail.tsx`, shared by Communications and the
Dashboard, both variant `glass` at `w-[320px]` (the Dashboard's glass is the
owner's decision of 2026-09-24; `plain`, a bordered `bg-surface` column, is
left for the phone sheet).
```
with:
```markdown
`src/components/copilot/CopilotRail.tsx`, shared by Communications, the
Dashboard and Organizations (list and board), all variant `glass` at
`w-[320px]` (the Dashboard's glass is the owner's decision of 2026-09-24,
Organizations' of 2026-09-26; `plain`, a bordered `bg-surface` column, is
left for the phone sheet).
```
Replace:
```markdown
    collapsed, so the figures narrow rather than being covered.
- **Chips.**
```
with:
```markdown
    collapsed, so the figures narrow rather than being covered.
- **Organizations shape.** The same pill in the same transparent top bar, and
  the same rail in `OrganizationsFrame`'s `rail` slot, on `/organizations/list`
  and `/organizations/board`. Only the rail is glass: rows, cards, tiles, the
  side panel and the sheets stay solid `bg-surface`. The rail wins its room.
  Board columns are `w-64` beside it (`w-72` otherwise). From `xl` the side
  panel sits between the columns and the rail. Below `xl`, with the rail open,
  a card opens in the bottom sheet, and opening the rail closes an open side
  panel. List rows (`@min-[60rem]:flex-nowrap`) and the tiles
  (`@min-[50rem]:grid-cols-5`) respond to their `@container`, the content
  column, so they wrap beside the rail instead of scrolling sideways.
- **Chips.**
```
Replace:
```markdown
  - Each user question carries its own 11px `bg-subtle` chip above its bubble,
    on the dashboard only (a dashboard conversation reopened in Communications
    or `/copilot` shows no chip, since only the dashboard passes `names`).
```
with:
```markdown
  - Each user question carries its own 11px `bg-subtle` chip above its bubble,
    on the Dashboard and Organizations (a conversation reopened in
    Communications or `/copilot` shows no chip, since only those two pass
    `chipLabel`). Organizations' chip is "Organizations", then the page's own
    filter-chip labels, then the focus ("1 account").
```
Replace:
```markdown
- **History.** An 11px origin tag (LayoutDashboard icon + "Revenue › Forecast")
  on dashboard conversations — the area and view only, never the filters it
  was asked with; a question's own chip is what carries those.
```
with:
```markdown
- **History.** An 11px origin tag (LayoutDashboard icon + "Revenue › Forecast")
  on dashboard conversations — the area and view only, never the filters it
  was asked with; a question's own chip is what carries those. Organizations
  conversations carry the Network icon and "Organizations" followed by the
  server's own `labels` ("Organizations · Owner: Carl CSM"; there is no
  `origin_label` field), capped at 60% of the row and truncated.
```
Replace:
```markdown
  summary tiles sit on the canvas. No glass anywhere on the list.
```
with:
```markdown
  summary tiles sit on the canvas. No glass on the list or the board
  themselves; only the Ask rail beside them is glass.
```
Replace:
```markdown
  `DashboardFrame`'s body with an empty `rail` slot that Ask Revenact on
  Organizations fills later.
```
with:
```markdown
  `DashboardFrame`'s body, with the Ask rail in its `rail` slot (see "Ask
  rail", Organizations shape).
```
Replace:
```markdown
The dashboard's Ask rail changes shape at `sm` (sheet below it) and `xl` (open
by default from it); from `lg` the drill panel takes the rail's box (over the
rail when it shows, in its place when it does not).
```
with:
```markdown
The dashboard's Ask rail changes shape at `sm` (sheet below it) and `xl` (open
by default from it); from `lg` the drill panel takes the rail's box (over the
rail when it shows, in its place when it does not).

Organizations' Ask rail changes shape at the same `sm` and `xl`. Below `xl`
it and the board's side panel never share the row: with the rail open a card
opens in the bottom sheet. Below `sm` it is the full-screen sheet from ✦,
which cannot open at the same time as an account's bottom sheet.
```
Replace:
```markdown
   glassmorphism on product surfaces. Exception, by the owner's decision on
   2026-09-21: Communications (and, by the owner's decision on 2026-09-24,
   the Dashboard's Ask rail), whose cards are `.rv-card-glass` /
```
with:
```markdown
   glassmorphism on product surfaces. Exception, by the owner's decision on
   2026-09-21: Communications (and, by the owner's decisions on 2026-09-24
   and 2026-09-26, the Ask rail on the Dashboard and on the Organizations
   list and board, the rail only), whose cards are `.rv-card-glass` /
```
Replace:
```markdown
| 8 | `backdrop-blur-sm` on placeholder routes | Glassmorphism is banned on product surfaces (Communications' `.rv-card-glass`, also used by the Dashboard's Ask rail, is the one sanctioned exception) |
```
with:
```markdown
| 8 | `backdrop-blur-sm` on placeholder routes | Glassmorphism is banned on product surfaces (Communications' `.rv-card-glass`, also used by the Ask rail on the Dashboard and Organizations, is the one sanctioned exception) |
```

- [ ] **Step 3: `.agents/workflows/repo-architecture.md`**

- Replace `#### Ask Revenact (\`pages/dashboard/ask/\`, \`components/copilot/\`)` with `#### Ask Revenact (\`pages/dashboard/ask/\`, \`pages/organizations/ask/\`, \`components/copilot/\`)`.
- Replace ``or `{kind:'dashboard'}` (structured `context` field). Props for `variant`, `top`, `thread`, `names`, `suggestions`, `draft`, `onSent`.`` with ``or `{kind:'surface'}` (the Dashboard's or Organizations' structured `context` field). Props for `variant`, `top`, `thread`, `chipLabel` (per-question chips; absent in Communications), `draft`, `onSent`. `HistoryPopover` tags a conversation with `originTag`.``
- Replace the row `| \`components/copilot/dashboardLabels.ts\`, \`suggestions.ts\` | Chip text (\`viewLabel\` for the history tag, \`contextLabel\` for a message's own chip), three questions per area |` with:
```markdown
| `components/copilot/dashboardLabels.ts`, `surfaceLabels.ts` | Chip text: `viewLabel`/`contextLabel` (dashboard), `surfaceLabel` (a question's chip on either surface), `originTag` (History's tag: the dashboard's area › view, or "Organizations" followed by the server's own `origin.labels`; there is no `origin_label` field) |
```
- Replace `| \`ask/context.ts\`, \`useAsk.ts\`, \`AskProvider.tsx\` | The dashboard's one conversation and thread,` with `| \`ask/context.ts\`, \`useAsk.ts\`, \`AskProvider.tsx\`, \`DashboardAskProvider.tsx\` | One surface's conversation and thread (\`AskProvider({surface, preferenceKey})\`; the Dashboard's surface via \`DashboardAskProvider\`, Organizations' via \`OrganizationsAskLayout\`), \`focusOn\` (an opened Organizations account), a conversation from the other surface handed over by \`askConversationId\` in the navigation state,`.
- After the row that starts `| \`ask/testAsk.tsx\`, \`components/copilot/testCopilot.ts\` |`, add:
```markdown
| `pages/organizations/ask/` | `OrganizationsAskLayout` (the layout route above List and Board: `AskProvider` with the `organizations` surface and `revenact_organizations_ask`), `useOrganizationsContext` (view + `toContextFilters`), `portfolioOptions` (pages report the portfolio's filter options for chips), `useAskFocusOnOpen`, `testOrganizationsAsk` (`stubOrganizationsAsk`) |
| `features/organizations/askContext.ts` | `toContextFilters`/`fromContextFilters` (params ↔ the context's string form), `organizationsPath` (History restore), `organizationsLabel` (the chip) |
```
- Replace `inside \`OrganizationsFrame\` (the dashboard's body, with an empty Ask rail slot).` with `inside \`OrganizationsFrame\` (the dashboard's body, with the Ask rail in its \`rail\` slot), under \`OrganizationsAskLayout\`.`
- Replace ``; `renderOrganizations(url, {width, nav})`,`` with ``; `renderOrganizations(url, {width, nav, ask})`,``.
- Replace `  │     ├── DashboardFrame → FilterNamesProvider + AskProvider + DrillProvider, then [scroll area → AreaLayout …][AskRail][DrillPanel over the rail]` with `  │     ├── DashboardFrame → FilterNamesProvider + DashboardAskProvider (AskProvider) + DrillProvider, then [scroll area → AreaLayout …][AskRail][DrillPanel over the rail]`.
- Replace `  │     ├── ask/ — AskProvider/useAsk, AskRail, useDashboardContext, filterNames` with `  │     ├── ask/ — AskProvider/useAsk (shared by both surfaces), DashboardAskProvider, AskRail, useDashboardContext, filterNames`.
- Replace `  │     ├── OrganizationsFrame (rail slot, empty until Ask on Organizations)` with `  │     ├── OrganizationsAskLayout (AskProvider, organizations surface) → OrganizationsFrame (rail slot: AskRail)`.

- [ ] **Step 4: The design skill's exception**

In `.claude/skills/revenact-design/SKILL.md`, rule 4, replace:
```markdown
**One exception, by the owner's decision (2026-09-21): Communications and the Dashboard Ask rail** (the rail added by the owner's decision of 2026-09-24).
```
with:
```markdown
**One exception, by the owner's decision (2026-09-21): Communications and the Ask rail**: on the Dashboard (owner's decision of 2026-09-24) and on the Organizations list and board (owner's decision of 2026-09-26). On Organizations it is the rail only: rows, cards, tiles, the side panel and the sheets stay solid.
```

- [ ] **Step 5: Check the edits landed and nothing still says "empty rail slot"**

Run: `grep -rn "empty \`rail\` slot\|empty Ask rail slot\|empty until Ask on Organizations\|only the dashboard passes \`names\`" docs .agents .claude/skills/revenact-design || echo "docs current"`
Expected: `docs current`.

- [ ] **Step 6: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md .claude/skills/revenact-design/SKILL.md
git commit -m "docs(organizations): Ask Revenact on Organizations; glass exception covers the rail there

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Full checks

**Files:** none, unless a check fails. A fix goes back into the task that owns the behaviour and gets its own commit.

- [ ] **Step 1: Static and test gates**

Run each and read the output:
```bash
npm run lint                              # expected: 0 errors; no new warnings in files this plan touched
npx tsc -b --noEmit                       # expected: no output
npx vitest run --maxWorkers=2             # expected: every file passes, including src/e2e/organizationsAsk.test.tsx and every dashboard suite
npm run build                             # expected: vite build completes, and the container-query classes compile (no unknown-utility warning)
```
To check the warnings: `npx eslint $(git diff --name-only feat/organizations-board -- 'src/**/*.ts' 'src/**/*.tsx')` should report none. The accepted exception is `react-refresh/only-export-components` in `testList.tsx`, already disabled at the top of the file.

- [ ] **Step 2: The Dashboard is unchanged**

```bash
git diff feat/organizations-board -- 'src/pages/dashboard/*.test.ts*' 'src/components/copilot/*.test.ts*' 'src/e2e/dashboardAsk.test.tsx' | grep '^-' | grep -v '^---' || echo "no dashboard test line removed"
```
Expected: the only removed lines are:
- in `src/components/copilot/CopilotRail.test.tsx`: the eight `kind: 'dashboard'` lines, the two `names` lines, the old test title and the old type import;
- in `src/pages/dashboard/ask/askPreference.test.ts`: its import line.

No `expect(` line appears among them.

- [ ] **Step 3: House anti-slop scan on the touched files**

```bash
git diff feat/organizations-board --name-only --diff-filter=AM -- 'src/**/*.tsx' | xargs grep -nE '#[0-9a-fA-F]{3,6}\b|rgba?\(|text-(blue|rose|purple|amber|emerald|red|green)-|text-\[(1[0246]|12|14|16|17|18)px\]' || echo "no raw colours or off-scale sizes"
```
Expected: hits only in `src/components/layout/Navbar.tsx` (its existing `text-[17px]`/`text-[16px]`/`text-[13.5px]`/`text-[12px]` headers, where this plan changes one comment) and `src/components/copilot/CopilotRail.tsx` (HistoryPopover's existing `text-[16px]`/`text-[13.5px]` headings, unchanged). Any hit in `pages/organizations/` or `components/organizations/portfolio/` is a failure to fix.

---

### Task 11: Browser check at desktop and 375px, both themes (controller)

**Files:** none, unless a check fails (then fix it in the owning task, with a commit). The controller does this task, not a subagent.

- [ ] **Step 1: Run both apps**

- Backend: `../revenact-backend` on its `feat/organizations-ask` branch (the companion plan's surface, grounding and `origin.labels`), on `http://localhost:8000`. Seed it with at least two owners, accounts in three stages, and one account with an overdue renewal.
- Frontend: `npm run dev` (Vite on `http://localhost:5173`), signed in as a CSM with `view_all_accounts`.

- [ ] **Step 2: Desktop, 1440×900, light theme**

Drive it with `npm run pw` (playwright-cli) or Claude in Chrome.
1. `/organizations/list`: the top bar shows "Organizations", List/Board, the pill (New chat, History, ✦ pressed), then the bell. The 320px glass rail is beside the content at the same top, running the full height. The rows and tiles are solid. There is no horizontal scroll anywhere.
2. Set Owner and Lifecycle filters. The composer chip reads "Organizations · Owner: <name> · Lifecycle: <stage>". Ask a question: the answer is about that book (compare with the tiles), and the question's chip matches.
3. Open a row. The chip gains "· 1 account", × removes it, and reopening the row brings it back. Ask, then check that the next question has no focus.
4. Switch to Board: the conversation stays. The columns are visibly narrower (`w-64`). Open a card: the side panel sits between the columns and the rail, and the columns scroll sideways.
5. Hide the rail with ✦: the columns widen back to `w-72` and the content takes the full width. Reload: the rail stays hidden (`revenact_organizations_ask`), while `/dashboard` still shows its own saved state.
6. History: an Organizations conversation shows the Network icon and "Organizations · Owner: <name>", truncated if long. Pick one asked on the Board from the List: it goes to the Board with its filters and shows the thread. Pick a dashboard conversation: the Dashboard opens with its rail showing it. From the Dashboard, pick an Organizations one: it comes back here.
7. Tab through the pill, the rail and the History popover: every control shows a focus ring, and Escape closes History.

- [ ] **Step 3: Narrow desktop, 1100×800 and 1280×800, light theme**

1. At 1100 the rail is hidden by default. Open a card (side panel), then press ✦: the side panel closes, the rail opens, and the chip says "Organizations · 1 account". Open another card: it opens in the bottom sheet over the page, not beside the rail.
2. At 1280 with the rail open, on the List: rows wrap onto two lines with nothing clipped and no sideways scroll. The tiles are two across below a 50rem column and five across above it.

- [ ] **Step 4: Phone, 375×812, light theme**

1. No rail. ✦ opens the full-screen sheet with focus in the composer, and Escape or Close returns focus to ✦. Nothing is saved to `localStorage`.
2. Open a row (bottom sheet), close it, then ask: the question is focused on that account.
3. Every control in the pill and the sheet is at least 44px.

- [ ] **Step 5: Dark theme, all widths**

Switch the theme in Settings > Personalization and repeat 2.1–2.4, 3.1 and 4.1. The rail's glass reads over the dark canvas, the tag, chips, skeleton and error line use tokens (nothing stays light), and the rows beside the rail stay solid.

- [ ] **Step 6: Record and stop**

Save screenshots at 1440, 1100 and 375 in both themes for the PR description. Then the branch is ready for `superpowers:finishing-a-development-branch`. Do not push.

---

## Spec coverage (self-review)

| Spec / owner item | Task |
|---|---|
| §3 Frontend reuse: rail and pill from `components/copilot` and `pages/dashboard/ask`; the provider takes a context builder per surface | 2, 3, 5 |
| §3 Context `{surface: "organizations", filters: {portfolio params except cursor}, focus}` (+ owner: `view ∈ {list, board}`) | 1, 4, 5 (pre-flight 2–3) |
| §3 Focus: an opened row (owner: or a Board card's side panel or sheet) sets `{kind: "companies", ids: [id]}` for one question | 3 (`focusOn`), 4 (`useAskFocusOnOpen`), 5, 6, 8 |
| §3 History: tag "Organizations · Owner: Carl CSM" (backend supplies `origin.labels`, no `origin_label` field); reopening restores the filters (owner: and the view) | 2 (`originTag`, `originPath`), 3 (handover), 7, 8 |
| §3 Shared sessions unchanged; grounding, validation, metering | Backend (companion plan); pre-flight 3, 17 |
| §1 decisions table: rail and pill as on Dashboard and Communications, grounded in the filtered list, opening a row focuses it | 5, 8 |
| §1 page anatomy: pill in the transparent top bar, full-height 320px glass rail that ✦ hides completely | 5 (pill, rail), 6 (the content narrows) |
| §1 House rules: glass only on the Ask rail | 5 (one `.rv-card-glass`), 9 (skill and docs), 10, 11 |
| §1 Phones: Ask is a full-screen sheet from ✦ | 5, 11 |
| Owner 1: generalise the provider, Dashboard byte-for-byte, run its tests | 2 and 3 (step 7 of each), 10 step 2 |
| Owner 3: rail and pill on both routes; glass on the rail only; skill note updated | 5, 9 |
| Owner 5: restore view and filters; backend tag | 2, 3, 7, 8 |
| Owner 6: columns narrower with the rail; phones sheet; side panel vs rail decided and stated | 6 (pre-flight 11–14) |
| Owner 7: unit, integration (real store and router, fetch mocked) and jsdom e2e (ask on the list with a filter, focus a row, reopen from history) | 1–6 (unit and integration), 7 (integration), 8 (e2e) |
| Owner 8: docs task, full checks, browser check at desktop and 375 in both themes by the controller | 9, 10, 11 |
| §4 item 3 (frontend half); backend merges first | Whole plan; header |
| §5 Frontend e2e "… → ask" | 8 |

**Placeholder scan:** no step says "TBD", "handle edge cases" or "similar to Task N". Every code step has its code, every test step has its test, and every edit names the exact text it replaces. Task 2's interim `AskRail` edit is replaced in full in Task 3 step 6, with both texts given.

**Type consistency, checked across tasks:**
- `OrganizationsFilters`, `OrganizationsContext`, `OrganizationsFocus`, `OrganizationsOrigin`, `OrganizationsView`, `SurfaceContext`, `SurfaceOrigin` and `SurfaceName` (Task 1) are used in Tasks 2, 3 and 4.
- `ConversationSummary.origin` (Task 2), whose `OrganizationsOrigin` branch carries `labels: string[]` (there is no `origin_label` field), is used by `originTag` (Task 2) and in the fixtures of Tasks 3, 7 and 8.
- `toContextFilters`, `fromContextFilters`, `organizationsPath`, `organizationsLabel` and `defaultGroupOf` (Task 1) are used by `originPath` and `surfaceLabel` (Task 2) and by `useOrganizationsContext` (Task 4).
- `RailContext {kind: 'surface'}` and `CopilotRailProps.chipLabel` (Task 2) are used by `AskRail` (Tasks 2 and 3).
- `surfaceLabel(context, {dashboard?, organizations?})` (Task 2) is used by `DashboardAskProvider` (Task 3) and `OrganizationsAskLayout` (Task 4).
- `AskSurface {name, context, chipLabel}`, `AskState.surface`, `AskState.focusOn(focus)`, `AskProvider({surface, preferenceKey})`, `AskHandover {askConversationId}` and `ORGANIZATIONS_ASK_KEY` (Task 3) are used in Tasks 4–8.
- `useReportPortfolioOptions(options)`, `useAskFocusOnOpen(openId)` and `OrganizationsAskLayout` (Task 4) are used by `List.tsx`/`Board.tsx` and `testList.tsx` (Task 5).
- `renderOrganizations(url, {width, nav, ask})` and `stubOrganizationsAsk({copilot, portfolio}) → {copilot, portfolio, release}` (Task 5) are used in Tasks 6, 7 and 8. The existing `renderList`/`renderBoard` signatures are unchanged.
- `PortfolioBoardProps.narrow` and `BoardColumnProps.narrow` (Task 6) are passed by `Board.tsx` as `narrow={railOpen}`.
