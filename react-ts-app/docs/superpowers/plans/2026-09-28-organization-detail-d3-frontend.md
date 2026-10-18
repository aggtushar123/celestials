# Ask Revenact on the organisation page, frontend (delivery 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Ask Revenact beside `/organizations/:id`. The page joins `OrganizationsAskLayout`, so one conversation lasts from the List into an organisation and back. Each question carries `{surface: "organizations", view: "detail", organization, account, focus}`. The chip reads "Pizza Hut" or "Pizza Hut · EMEA". "Ask about this" on a story item focuses one question. History tags a conversation with the server's label and reopens `/organizations/{id}?account=…`.

**Architecture:** The organisation route moves under `OrganizationsAskLayout`. The layout draws the page's own `bleed` frame there, so the page keeps its full width and 24px gutter while the rail is closed. `useOrganizationsContext` builds a detail context from the path and `?account=`. A new `features/organizations/detailAskContext.ts` holds the pure pieces: the context, the chip, the History path and the focus words. The page reports its names to the layout through a small context, as the List reports its filter options. The shared Ask focus slot widens from `DashboardFocus` to `AskFocus` (adding `StoryFocus`). A stable `AskDraftContext` lets each story item prefill a question without re-rendering the story on every send. A `400` under `context.organization` or `context.account` shows on the rail as a refusal, with no Retry.

**Tech Stack:** React 19, TypeScript, react-router 7, Redux Toolkit, Tailwind 4 (container queries `@container` / `@min-[…]:`), lucide-react, Vitest with Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-26-organization-detail-design.md`. §3 "Ask Revenact on the page (delivery 3)" is binding, with §1.1 (frame), §1.11 (phones), §4 item 3 and §5. Read `docs/superpowers/specs/2026-09-27-organization-detail-delivery-2.md` for the page as it is now: the chips above the tabs, shown only on Story, People, Deals & risks and Files. The backend contract is `revenact-backend/docs/superpowers/plans/2026-09-28-organization-detail-d3-backend.md`, especially its pre-flight rows 2, 3 and 5 and "Notes for the frontend plan".

## Global Constraints

- **Entry points** (spec §3): "The ✦ pill in the top bar and the glass rail beside the page, as on the List and Board. The page joins `OrganizationsAskLayout`, so one conversation lasts from the List into the organisation and back." "On phones, a sheet." "The old "Ask Copilot" link to `/copilot` is removed."
- **Context** (spec §3): "`{surface: "organizations", view: "detail", organization: id, account?: id, focus}`. The chip reads "Pizza Hut" or "Pizza Hut · EMEA"." Send `account: null` for every account, never a name, figure or `label`. The backend ignores a client `label` and builds its own.
- **Focus** (spec §3): "Ask about this" on a story item sets `{kind, id}` for one question. `kind` is the item's `kind` and `id` is its `id`. The server re-checks it and drops an unreadable one silently.
- **History** (spec §3): "The tag is "Pizza Hut" or "Pizza Hut · EMEA", from server-built labels. Restoring opens `/organizations/{id}?account=…`." The backend's origin is `{surface, view: "detail", organization, account, label}`.
- **Errors** (backend plan, frontend notes): "A `400` under `context.organization` or `context.account` means the page is no longer the asker's to ask about. Show it as an error on the rail rather than retrying without the account."
- **Placement** (owner, 2026-09-27, and this brief): with the rail closed, the page keeps its full width (`max-w-[1800px]` column) and 24px gutter (`sm:px-6`). With it open, the content reflows beside it. On phones the rail is a sheet.
- **House rules** (`.claude/skills/revenact-design/SKILL.md` §4): tokens only; type sizes 11/13/15/22px only; Lucide icons only; 44px targets below `sm`; glass is the Ask rail's alone (story items, tiles and sheets stay solid); layouts that exist only on phones or only on desktop are rendered conditionally, never hidden with CSS alone.
- The suites `src/components/organizations/detail/houseRules.test.ts` and `src/components/organizations/detail/alignment.test.tsx` must stay green.
- Tests come in three tiers (`.claude/skills/testing`): unit, integration through the real store and router with `fetch` mocked in contract shapes, and end-to-end in jsdom. Run one file with `npx vitest run <path>`. Run the whole suite as one process with `npx vitest run --maxWorkers=2`.
- Work on `feat/organization-detail-d3` in `.worktrees/frontend-d3`. It is stacked on `feat/organization-detail-d2` (PR #87), which merges first. Do not switch branches. The backend PR (delivery 3) merges and deploys before this one (spec §4).
- Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Pre-flight: where the spec meets the code

| # | Spec or brief says | Code has | Resolution |
|---|---|---|---|
| 1 | The page joins `OrganizationsAskLayout` | `App.tsx` mounts `/organizations/:id` beside the layout, not in it. The layout draws `OrganizationsFrame` (`px-4`). The page draws its own `bleed` frame (`px-0 sm:px-6`, gutter inside the column below `sm`). Inside the layout a page's frame passes through (`InFrame`). | Move the route into the layout. The layout passes `bleed` when `parseOrganizationsView(pathname) === 'detail'`, so the one frame is the page's own. The page's `OrganizationsFrame bleed` stays: on its own (tests, a future route) it still draws the frame. |
| 2 | "The chip reads "Pizza Hut" or "Pizza Hut · EMEA"" | The live context carries no names. The server's `label` arrives only on a stored turn. The List names its chips from options it reports to the layout (`PortfolioOptionsContext`). | **Decision:** the page reports `{organization, name, accounts}` through a new `DetailNamesContext`. The live chip is built from those names. A stored context's `label` wins (as the List's stored `labels` do). Until the page has loaded, the chip reads "This organization" (and "Account"). |
| 3 | "following `?account=`" | `?account=` is an id, `none` ("Organization": records on the organisation itself) or empty. The chips show only on Story, People, Deals & risks and Files, but `?account=` stays in the URL on Details and Knowledge. The backend's `account` is an id or null. | **Decision:** `account` is the chip's id on the four chip tabs. It is `null` for All, for `none` (the server has no organisation-only scope, so the question covers the whole organisation and the chip says "Pizza Hut"), and on Details and Knowledge (whole-organisation tabs, where no chip shows). |
| 4 | "Ask about this" as a focus lasting one question | The shared slot is `DashboardFocus` (`companies`, `attention`). `withFocus` keeps only `companies` on Organizations. `AskProvider` drops a focus on any change to the path or query and on send. `draft` (prefill and reveal) lives only on the whole `AskState`, whose identity changes on every send. | Add `StoryFocus {kind: StoryKind, id}` and `AskFocus = DashboardFocus \| StoryFocus` (the kinds never overlap). `withFocus` gives each screen only its own kind. `draft` becomes a stable callback exposed on `AskDraftContext`, so each story item reads only that. The question prefills "What should I know about this call?", editable, never sent by itself. The existing "any URL change drops the focus" rule applies. |
| 5 | History tag and restore | `originTag` joins `["Organizations", ...labels]`; `originPath` → `organizationsPath`. Both assume list/board. | Dispatch on `origin.view === 'detail'`: the tag is `origin.label`; the path is `/organizations/{organization}` plus `?account={account}` when set. Cross-surface handover (Dashboard ↔ Organizations) already works through `originPath`. |
| 6 | A `400` for an invisible organisation or account | `extractErrorMessage` reads only a top-level field's array, so `{"context": {"account": [...]}}` shows "Request failed (400)" with Retry, which would ask the same again. | `refusalMessage(err)` in `useCopilotThread`: "You can no longer ask about this organization." or "You can no longer ask about this account. Choose All and ask again.". `FailedTurn.refused` hides Retry. Every other 400 is unchanged (the existing "generic error with Retry" test stays). |
| 7 | "Content reflows beside it" | The frame is a flex row: the content column is `flex-1 min-w-0`, and the rail is `shrink-0 w-[320px]`, so the page narrows. The tiles are `grid-cols-4` from `sm` by the window. Beside the rail on a 1024px window the column is about 572px, which leaves about 134px per tile. | Tiles wrap to their column: `@container` on the tiles, `grid-cols-2 @min-[36rem]:grid-cols-4`. With the rail closed, the column is at least 592px at every width from `sm` (640 − 48), so four across is unchanged there. The Details panels (`md:`/`xl:` by the window) still fit two or three columns beside the rail at `lg`/`xl`, so they are left as they are. |
| 8 | Remove the old "Ask Copilot" link | Delivery 1 already removed it from the organisation page. The only one left is on `/accounts/:id` (`pages/accounts/Details.tsx`), which spec §6 plans as its own page. | Nothing to remove here. A test pins that the organisation page has no `/copilot` link. The account page is out of scope. |
| 9 | Phones: a sheet | `AskRail` below `sm` renders the full-screen dialog sheet, with focus trap and Close. | Unchanged. Tests pin it on the organisation page, including "Ask about this" opening the sheet prefilled. |

## File Structure

| File | Responsibility |
|---|---|
| `src/pages/copilot/types.ts` | `StoryFocus`, `AskFocus`, `OrganizationDetailContext`, `OrganizationDetailOrigin`; the unions widen |
| `src/features/organizations/detailAskContext.ts` (new) | `DetailNames`, `detailIdOf`, `detailContext`, `isStoryFocus`, `storyFocusLabel`, `askAboutQuestion`, `detailLabel`, `detailPath` |
| `src/components/copilot/surfaceLabels.ts` | chip and History tag dispatch on `view: 'detail'` |
| `src/pages/dashboard/ask/originPath.ts` | restore path dispatch on `view: 'detail'` |
| `src/pages/dashboard/ask/context.ts` | `AskFocus` in `AskState`; `withFocus` per screen; `AskDraftContext` |
| `src/pages/dashboard/ask/AskProvider.tsx` | `AskFocus` state; stable `draft` on `AskDraftContext` |
| `src/pages/organizations/ask/useAskFocus.ts` | `AskFocus` type |
| `src/pages/organizations/ask/useOrganizationsContext.ts` | the detail view and its context |
| `src/pages/organizations/ask/detailNames.ts` (new) | `DetailNamesContext`, `useReportDetailNames` |
| `src/pages/organizations/ask/OrganizationsAskLayout.tsx` | `bleed` on the detail route; names for the chip |
| `src/App.tsx` | the `:id` route under the layout |
| `src/pages/organizations/Details.tsx` | reports its names |
| `src/components/organizations/detail/HeaderTiles.tsx` | tiles wrap to their column |
| `src/components/organizations/detail/StoryItemRow.tsx` | "Ask about this" |
| `src/components/copilot/useCopilotThread.ts`, `CopilotRail.tsx` | the refusal, with no Retry |
| `src/components/copilot/testCopilot.ts`, `src/pages/organizations/testDetail.tsx`, `src/pages/organizations/ask/testOrganizationsAsk.ts` | test doubles: server label, refusal, the page under the layout |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.claude/skills/revenact-design/SKILL.md` | the product docs and the glass exception |

---

### Task 1: The detail context: its shape, chip, History tag, restore path and focus

**Files:**
- Modify: `src/pages/copilot/types.ts`
- Create: `src/features/organizations/detailAskContext.ts`
- Modify: `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts`, `src/pages/dashboard/ask/AskProvider.tsx`, `src/pages/organizations/ask/useAskFocus.ts`
- Test: `src/features/organizations/detailAskContext.test.ts` (new), `src/pages/dashboard/ask/context.test.ts` (new), `src/components/copilot/surfaceLabels.test.ts`, `src/pages/dashboard/ask/originPath.test.ts`

**Interfaces:**
- Consumes: `DetailParams`, `ACCOUNT_TABS` (`features/organizations/detailParams.ts`); `KIND_NAME`, `isStoryKind` (`storyKinds.ts`); `StoryKind` (`storyTypes.ts`).
- Produces:
  - Types in `pages/copilot/types.ts`: `StoryFocus {kind: StoryKind; id: number}`, `AskFocus = DashboardFocus | StoryFocus`, `OrganizationDetailContext {surface: 'organizations'; view: 'detail'; organization: number; account: number | null; focus: StoryFocus | null; label?: string}`, `OrganizationDetailOrigin {surface; view: 'detail'; organization; account; label: string}`. `SurfaceContext` and `SurfaceOrigin` include them.
  - `detailAskContext.ts`: `interface DetailNames {organization: number; name: string; accounts: Record<number, string>}`, `detailIdOf(pathname: string): number | null`, `detailContext(organization: number, params: DetailParams): OrganizationDetailContext`, `isStoryFocus(focus: AskFocus | null | undefined): focus is StoryFocus`, `storyFocusLabel(focus: StoryFocus): string`, `askAboutQuestion(focus: StoryFocus): string`, `detailLabel(context: OrganizationDetailContext, names?: DetailNames | null): string`, `detailPath(origin: OrganizationDetailOrigin): string`.
  - `SurfaceNames.detail?: DetailNames | null` in `surfaceLabels.ts`.
  - `AskState.focus: AskFocus | null`, `focusOn(focus: AskFocus)`, `draft(question: string, focus: AskFocus)`, `ask(question: string, focus: AskFocus | null)`; `withFocus(context: SurfaceContext, focus: AskFocus | null): SurfaceContext`; `AskFocusOnContext: Context<((focus: AskFocus) => void) | null>`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/organizations/detailAskContext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  askAboutQuestion,
  detailContext,
  detailIdOf,
  detailLabel,
  detailPath,
  isStoryFocus,
  storyFocusLabel,
  type DetailNames,
} from './detailAskContext';
import { parseDetailParams } from './detailParams';

const params = (query: string) => parseDetailParams(new URLSearchParams(query));
const NAMES: DetailNames = { organization: 7, name: 'Pizza Hut', accounts: { 31: 'EMEA', 32: 'North America' } };
const base = { surface: 'organizations' as const, view: 'detail' as const, organization: 7 };

describe('the organisation page as a question carries it', () => {
  it('reads the organisation id from the path only', () => {
    expect(detailIdOf('/organizations/7')).toBe(7);
    expect(detailIdOf('/organizations/list')).toBeNull();
    expect(detailIdOf('/organizations/board')).toBeNull();
    expect(detailIdOf('/organizations/007')).toBeNull();
    expect(detailIdOf('/organizations/7/story')).toBeNull();
  });

  it('carries the account chip on the tabs that show it, and never "none"', () => {
    expect(detailContext(7, params(''))).toEqual({ ...base, account: null, focus: null });
    expect(detailContext(7, params('account=31'))).toEqual({ ...base, account: 31, focus: null });
    expect(detailContext(7, params('account=31&tab=people')).account).toBe(31);
    expect(detailContext(7, params('account=31&tab=files')).account).toBe(31);
    expect(detailContext(7, params('account=none')).account).toBeNull();
    // Details and Knowledge are the whole organisation's: no chips, no account.
    expect(detailContext(7, params('account=31&tab=details')).account).toBeNull();
    expect(detailContext(7, params('account=31&tab=knowledge')).account).toBeNull();
  });

  it('tells a story focus from a Dashboard or List one', () => {
    expect(isStoryFocus({ kind: 'note', id: 4 })).toBe(true);
    expect(isStoryFocus({ kind: 'calendar_event', id: 4 })).toBe(true);
    expect(isStoryFocus({ kind: 'companies', ids: [7] })).toBe(false);
    expect(isStoryFocus({ kind: 'attention', key: 'renewal' })).toBe(false);
    expect(isStoryFocus(null)).toBe(false);
  });

  it('words the focus and the question it prefills', () => {
    expect(storyFocusLabel({ kind: 'note', id: 4 })).toBe('This note');
    expect(storyFocusLabel({ kind: 'calendar_event', id: 4 })).toBe('This calendar event');
    expect(askAboutQuestion({ kind: 'health', id: 2 })).toBe('What should I know about this health change?');
  });

  it('names the chip from the page, then the focus', () => {
    expect(detailLabel({ ...base, account: null, focus: null }, NAMES)).toBe('Pizza Hut');
    expect(detailLabel({ ...base, account: 31, focus: null }, NAMES)).toBe('Pizza Hut · EMEA');
    expect(detailLabel({ ...base, account: 31, focus: { kind: 'email', id: 41 } }, NAMES)).toBe('Pizza Hut · EMEA · This email');
    // Before the page has loaded, or names for another organisation.
    expect(detailLabel({ ...base, account: 31, focus: null })).toBe('This organization · Account');
    expect(detailLabel({ ...base, organization: 9, account: null, focus: null }, NAMES)).toBe('This organization');
  });

  it("uses the server's label on a stored context, whatever the page reported", () => {
    expect(detailLabel({ ...base, account: 31, focus: null, label: 'Pizza Hut · EMEA' })).toBe('Pizza Hut · EMEA');
    expect(detailLabel({ ...base, account: null, focus: { kind: 'note', id: 4 }, label: 'Pizza Hut' }, { ...NAMES, name: 'Renamed' })).toBe(
      'Pizza Hut · This note',
    );
  });

  it('reopens the page with its account chip', () => {
    expect(detailPath({ ...base, account: null, label: 'Pizza Hut' })).toBe('/organizations/7');
    expect(detailPath({ ...base, account: 31, label: 'Pizza Hut · EMEA' })).toBe('/organizations/7?account=31');
  });
});
```

Create `src/pages/dashboard/ask/context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DashboardContext, OrganizationDetailContext, OrganizationsContext } from '../../copilot/types';
import { withFocus } from './context';

const DASH: DashboardContext = { surface: 'dashboard', area: 'health', view: 'triage', filters: { owner: '', lifecycle: '', customer: '' }, focus: null };
const LIST: OrganizationsContext = { surface: 'organizations', view: 'list', filters: {}, focus: null };
const PAGE: OrganizationDetailContext = { surface: 'organizations', view: 'detail', organization: 7, account: null, focus: null };

describe('withFocus', () => {
  it('gives each screen only its own kind of focus', () => {
    const companies = { kind: 'companies' as const, ids: [7] };
    const attention = { kind: 'attention' as const, key: 'renewal' };
    const note = { kind: 'note' as const, id: 4 };
    expect(withFocus(DASH, companies)).toEqual({ ...DASH, focus: companies });
    expect(withFocus(DASH, attention)).toEqual({ ...DASH, focus: attention });
    expect(withFocus(DASH, note)).toEqual(DASH);
    expect(withFocus(LIST, companies)).toEqual({ ...LIST, focus: companies });
    expect(withFocus(LIST, note)).toEqual(LIST);
    expect(withFocus(PAGE, note)).toEqual({ ...PAGE, focus: note });
    expect(withFocus(PAGE, companies)).toEqual(PAGE);
    expect(withFocus(PAGE, null)).toEqual(PAGE);
  });
});
```

In `src/components/copilot/surfaceLabels.test.ts`, replace:

```ts
import type { DashboardContext, OrganizationsContext } from '../../pages/copilot/types';
```

with:

```ts
import type { DashboardContext, OrganizationDetailContext, OrganizationsContext } from '../../pages/copilot/types';
```

In `src/components/copilot/surfaceLabels.test.ts`, replace:

```ts
const ORG: OrganizationsContext = { surface: 'organizations', view: 'list', filters: { owner: '2' }, focus: null };
```

with:

```ts
const ORG: OrganizationsContext = { surface: 'organizations', view: 'list', filters: { owner: '2' }, focus: null };
const PAGE: OrganizationDetailContext = { surface: 'organizations', view: 'detail', organization: 7, account: 31, focus: null };
```

In `src/components/copilot/surfaceLabels.test.ts`, replace:

```ts
    expect(originTag({ origin: null })).toBeNull();
  });
});
```

with:

```ts
    expect(originTag({ origin: null })).toBeNull();
  });

  it("names an organisation page's question from the page, or from the server's label once stored", () => {
    const detail = { organization: 7, name: 'Pizza Hut', accounts: { 31: 'EMEA' } };
    expect(surfaceLabel(PAGE, { detail })).toBe('Pizza Hut · EMEA');
    expect(surfaceLabel({ ...PAGE, focus: { kind: 'call', id: 12 } }, { detail })).toBe('Pizza Hut · EMEA · This call');
    expect(surfaceLabel({ ...PAGE, label: 'Pizza Hut · EMEA' })).toBe('Pizza Hut · EMEA');
  });

  it("tags a conversation started on an organisation's page with the server's label", () => {
    const origin = { surface: 'organizations' as const, view: 'detail' as const, organization: 7, account: null, label: 'Pizza Hut' };
    expect(originTag({ origin })).toBe('Pizza Hut');
    expect(originTag({ origin: { ...origin, account: 31, label: 'Pizza Hut · EMEA' } })).toBe('Pizza Hut · EMEA');
  });
});
```

In `src/pages/dashboard/ask/originPath.test.ts`, replace:

```ts
    ).toBe('/organizations/board?owner=2');
  });
});
```

with:

```ts
    ).toBe('/organizations/board?owner=2');
  });

  it("goes back to an organisation's page with its account chip", () => {
    const page = { surface: 'organizations' as const, view: 'detail' as const, organization: 7, account: null, label: 'Pizza Hut' };
    expect(originPath(page)).toBe('/organizations/7');
    expect(originPath({ ...page, account: 31, label: 'Pizza Hut · EMEA' })).toBe('/organizations/7?account=31');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/features/organizations/detailAskContext.test.ts src/pages/dashboard/ask/context.test.ts src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.test.ts`
Expected: FAIL. `detailAskContext.test.ts` cannot resolve `./detailAskContext`. The new label, tag and path tests read `filters`/`labels` of a detail context and throw. `context.test.ts` fails on the story-focus cases.

- [ ] **Step 3: The types**

In `src/pages/copilot/types.ts`, replace:

```ts
// docs/API_CONTRACTS.md -> copilot.

export type MessageRole
```

with:

```ts
// docs/API_CONTRACTS.md -> copilot.

import type { StoryKind } from '../../features/organizations/storyTypes';

export type MessageRole
```

In `src/pages/copilot/types.ts`, replace:

```ts
/** Every structured context a question can carry, told apart by `surface`. */
export type SurfaceContext = DashboardContext | OrganizationsContext;
export type SurfaceOrigin = DashboardOrigin | OrganizationsOrigin;
```

with:

```ts
/** "Ask about this" on one story item (spec 2026-09-26 §3): the item's own
 *  `kind` and `id`, for one question. The server re-reads it under the
 *  story's rules and stores `null` when the asker may not read it. */
export interface StoryFocus {
  kind: StoryKind;
  id: number;
}

/** Whatever the shared Ask slot narrows the next question to: a dashboard
 *  drill or attention item, an Organizations row, or a story item. The kinds
 *  never overlap, so `kind` tells them apart. */
export type AskFocus = DashboardFocus | StoryFocus;

/** Where a question on one organisation's page was asked (spec 2026-09-26
 *  §3, backend delivery 3). `account` is the account chip, null for every
 *  account. The client never sends names: the server builds `label` ("Pizza
 *  Hut" or "Pizza Hut · EMEA") and echoes it on a stored context. */
export interface OrganizationDetailContext {
  surface: 'organizations';
  view: 'detail';
  organization: number;
  account: number | null;
  focus: StoryFocus | null;
  label?: string;
}

/** A conversation's first organisation-page context without its focus;
 *  `label` is always there, built by the server. */
export interface OrganizationDetailOrigin {
  surface: 'organizations';
  view: 'detail';
  organization: number;
  account: number | null;
  label: string;
}

/** Every structured context a question can carry, told apart by `surface`
 *  (and, on Organizations, by `view`). */
export type SurfaceContext = DashboardContext | OrganizationsContext | OrganizationDetailContext;
export type SurfaceOrigin = DashboardOrigin | OrganizationsOrigin | OrganizationDetailOrigin;
```

- [ ] **Step 4: The detail context's pure pieces**

Create `src/features/organizations/detailAskContext.ts`:

```ts
import type { AskFocus, OrganizationDetailContext, OrganizationDetailOrigin, StoryFocus } from '../../pages/copilot/types';
import { ACCOUNT_TABS, type DetailParams } from './detailParams';
import { KIND_NAME, isStoryKind } from './storyKinds';

// Ask Revenact on one organisation's page (spec 2026-09-26 §3): the context
// a question carries, its chip, the History tag and the path a restore opens.

const SEPARATOR = ' · ';

/** What the organisation page reports so a live question's chip can name
 *  it before the server has: the organisation's name and its accounts'. */
export interface DetailNames {
  organization: number;
  name: string;
  accounts: Record<number, string>;
}

/** `/organizations/7` gives 7; any other path gives null. */
export function detailIdOf(pathname: string): number | null {
  const match = /^\/organizations\/([1-9]\d*)$/.exec(pathname);
  return match ? Number(match[1]) : null;
}

/** The page as a question carries it. The account follows the account chip
 *  (`?account=`) on the tabs that show the chips. It is null for All, for
 *  "Organization" (`none`, which the server has no scope for), and on
 *  Details and Knowledge, which are the whole organisation's. */
export function detailContext(organization: number, params: DetailParams): OrganizationDetailContext {
  const account = ACCOUNT_TABS.has(params.tab) && /^[1-9]\d*$/.test(params.account) ? Number(params.account) : null;
  return { surface: 'organizations', view: 'detail', organization, account, focus: null };
}

/** A story item's focus, as opposed to a Dashboard or List one. */
export function isStoryFocus(focus: AskFocus | null | undefined): focus is StoryFocus {
  return focus != null && isStoryKind(focus.kind);
}

function kindWords(focus: StoryFocus): string {
  return (KIND_NAME[focus.kind] ?? 'Item').toLowerCase();
}

/** The focus part of the chip: "This note", "This calendar event". */
export function storyFocusLabel(focus: StoryFocus): string {
  return `This ${kindWords(focus)}`;
}

/** The question "Ask about this" prefills. The person can edit it. */
export function askAboutQuestion(focus: StoryFocus): string {
  return `What should I know about this ${kindWords(focus)}?`;
}

/** The chip: "Pizza Hut" or "Pizza Hut · EMEA", then the focus. A stored
 *  context's `label` is the server's and wins. A live one is named from what
 *  the page reported, and reads "This organization" or "Account" until the
 *  page has loaded. The focus is never in `label`, so it is always named
 *  from `focus`. */
export function detailLabel(context: OrganizationDetailContext, names: DetailNames | null = null): string {
  const ours = names?.organization === context.organization ? names : null;
  const parts = context.label
    ? [context.label]
    : [ours?.name ?? 'This organization', ...(context.account === null ? [] : [ours?.accounts[context.account] ?? 'Account'])];
  if (context.focus) parts.push(storyFocusLabel(context.focus));
  return parts.join(SEPARATOR);
}

/** Where a conversation started on an organisation's page reopens (spec §3):
 *  the page, with its account chip when there was one. */
export function detailPath(origin: OrganizationDetailOrigin): string {
  const path = `/organizations/${origin.organization}`;
  return origin.account === null ? path : `${path}?account=${origin.account}`;
}
```

- [ ] **Step 5: Chip, History tag and restore path dispatch on the view**

Replace the contents of `src/components/copilot/surfaceLabels.ts` with:

```ts
import { organizationsLabel } from '../../features/organizations/askContext';
import { detailLabel, type DetailNames } from '../../features/organizations/detailAskContext';
import type { PortfolioResponse } from '../../features/organizations/portfolioTypes';
import type { ConversationSummary, SurfaceContext } from '../../pages/copilot/types';
import { contextLabel, viewLabel, type FilterNames } from './dashboardLabels';

/** What each surface names its filter values with: the dashboard views'
 *  filter options, the portfolio's `filters` options, and the names the
 *  organisation page reports. */
export interface SurfaceNames {
  dashboard?: FilterNames;
  organizations?: PortfolioResponse['filters'] | null;
  detail?: DetailNames | null;
}

/** A question's chip, on whichever surface it was asked. */
export function surfaceLabel(context: SurfaceContext, names: SurfaceNames = {}): string {
  if (context.surface === 'dashboard') return contextLabel(context, names.dashboard);
  if (context.view === 'detail') return detailLabel(context, names.detail ?? null);
  return organizationsLabel(context, names.organizations ?? null);
}

/** History's tag for a conversation: a dashboard one's area and view; an
 *  Organizations list or board one's is "Organizations" followed by the
 *  server's own `labels` (it knows the owner's name), joined with " · "; an
 *  organisation page's is the server's `label`, "Pizza Hut" or "Pizza Hut ·
 *  EMEA". Null for a conversation started anywhere else. */
export function originTag(summary: Pick<ConversationSummary, 'origin'>): string | null {
  const { origin } = summary;
  if (!origin) return null;
  if (origin.surface === 'dashboard') return viewLabel(origin.area, origin.view);
  if (origin.view === 'detail') return origin.label;
  return ['Organizations', ...origin.labels].join(' · ');
}
```

In `src/pages/dashboard/ask/originPath.ts`, replace:

```ts
import { organizationsPath } from '../../../features/organizations/askContext';
```

with:

```ts
import { organizationsPath } from '../../../features/organizations/askContext';
import { detailPath } from '../../../features/organizations/detailAskContext';
```

In `src/pages/dashboard/ask/originPath.ts`, replace:

```ts
/** The page a conversation started on, with its filters: a dashboard view,
 *  or the Organizations list or board. */
export function originPath(origin: SurfaceOrigin): string {
  return origin.surface === 'organizations' ? organizationsPath(origin) : dashboardPath(origin);
}
```

with:

```ts
/** The page a conversation started on, with its filters: a dashboard view,
 *  the Organizations list or board, or an organisation's page with its
 *  account chip. */
export function originPath(origin: SurfaceOrigin): string {
  if (origin.surface === 'dashboard') return dashboardPath(origin);
  return origin.view === 'detail' ? detailPath(origin) : organizationsPath(origin);
}
```

- [ ] **Step 6: The shared focus slot takes a story item**

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
import type { Conversation, DashboardFocus, SurfaceContext, SurfaceName } from '../../copilot/types';
```

with:

```ts
import { isStoryFocus } from '../../../features/organizations/detailAskContext';
import type { AskFocus, Conversation, SurfaceContext, SurfaceName } from '../../copilot/types';
```

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
  focus: DashboardFocus | null;
  /** The chip's ×
```

with:

```ts
  focus: AskFocus | null;
  /** The chip's ×
```

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
  focusOn: (focus: DashboardFocus) => void;
```

with:

```ts
  focusOn: (focus: AskFocus) => void;
```

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
  draft: (question: string, focus: DashboardFocus) => void;
```

with:

```ts
  draft: (question: string, focus: AskFocus) => void;
```

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
  ask: (question: string, focus: DashboardFocus | null) => void;
```

with:

```ts
  ask: (question: string, focus: AskFocus | null) => void;
```

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
/** The surface's context narrowed by `focus`. The shared slot is a
 *  DashboardFocus; Organizations only takes a companies focus, so any other
 *  kind (never written there) reads as no focus rather than a cast. */
export function withFocus(context: SurfaceContext, focus: DashboardFocus | null): SurfaceContext {
  if (context.surface === 'dashboard') return { ...context, focus };
  return { ...context, focus: focus?.kind === 'companies' ? focus : null };
}
```

with:

```ts
/** The surface's context narrowed by `focus`. Each screen takes only its
 *  own kind: the Dashboard a drill or attention item, the List and the Board
 *  a companies focus, an organisation's page a story item. Any other kind
 *  (never written there) reads as no focus rather than a cast. */
export function withFocus(context: SurfaceContext, focus: AskFocus | null): SurfaceContext {
  if (context.surface === 'dashboard') return { ...context, focus: focus && !isStoryFocus(focus) ? focus : null };
  if (context.view === 'detail') return { ...context, focus: isStoryFocus(focus) ? focus : null };
  return { ...context, focus: focus?.kind === 'companies' ? focus : null };
}
```

In `src/pages/dashboard/ask/context.ts`, replace:

```ts
export const AskFocusOnContext = createContext<((focus: DashboardFocus) => void) | null>(null);
```

with:

```ts
export const AskFocusOnContext = createContext<((focus: AskFocus) => void) | null>(null);
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```ts
import type { Conversation, DashboardFocus } from '../../copilot/types';
```

with:

```ts
import type { AskFocus, Conversation } from '../../copilot/types';
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```ts
  const [focus, setFocus] = useState<DashboardFocus | null>(null);
```

with:

```ts
  const [focus, setFocus] = useState<AskFocus | null>(null);
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```ts
  const focusOn = useCallback((next: DashboardFocus) => setFocus(next), []);
```

with:

```ts
  const focusOn = useCallback((next: AskFocus) => setFocus(next), []);
```

In `src/pages/organizations/ask/useAskFocus.ts`, replace:

```ts
import type { DashboardFocus } from '../../copilot/types';
```

with:

```ts
import type { AskFocus } from '../../copilot/types';
```

In `src/pages/organizations/ask/useAskFocus.ts`, replace:

```ts
export function useAskFocusOn(): ((focus: DashboardFocus) => void) | null {
```

with:

```ts
export function useAskFocusOn(): ((focus: AskFocus) => void) | null {
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run src/features/organizations/detailAskContext.test.ts src/pages/dashboard/ask/context.test.ts src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.test.ts src/pages/dashboard/ask/AskProvider.test.tsx src/pages/organizations/ask`
Expected: PASS.

Run: `npx tsc -b`
Expected: PASS (no output). Before Step 5 it reported `surfaceLabels.ts`, `originPath.ts` and `context.ts` reading `filters`/`labels` off a detail context; those dispatches are what fix it.

- [ ] **Step 8: Commit**

```bash
git add src/pages/copilot/types.ts src/features/organizations/detailAskContext.ts src/features/organizations/detailAskContext.test.ts src/components/copilot/surfaceLabels.ts src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.ts src/pages/dashboard/ask/originPath.test.ts src/pages/dashboard/ask/context.ts src/pages/dashboard/ask/context.test.ts src/pages/dashboard/ask/AskProvider.tsx src/pages/organizations/ask/useAskFocus.ts
git commit -m "feat(organizations): the organisation page's Ask context, chip, History tag and path

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The page joins the Ask layout: one frame, one conversation, the chip

**Files:**
- Modify: `src/pages/organizations/ask/useOrganizationsContext.ts`, `src/pages/organizations/ask/OrganizationsAskLayout.tsx`, `src/App.tsx`, `src/pages/organizations/Details.tsx`
- Create: `src/pages/organizations/ask/detailNames.ts`
- Modify (test doubles): `src/components/copilot/testCopilot.ts`, `src/pages/organizations/testDetail.tsx`, `src/pages/organizations/ask/testOrganizationsAsk.ts`
- Test: `src/pages/organizations/ask/useOrganizationsContext.test.tsx`, `src/pages/organizations/ask/detailAsk.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `detailIdOf`, `detailContext`, `DetailNames`, `OrganizationDetailContext`, `SurfaceNames.detail`.
- Produces:
  - `parseOrganizationsView(pathname): OrganizationsView | 'detail' | null`; `useOrganizationsContext(): OrganizationsContext | OrganizationDetailContext | null`.
  - `DetailNamesContext: Context<((names: DetailNames) => void) | null>` and `useReportDetailNames(names: DetailNames | null): void` in `pages/organizations/ask/detailNames.ts`.
  - `renderOrganizationPage(url, { …, ask?: boolean })`: with `ask`, both routes sit under `OrganizationsAskLayout`, with the Navbar actions slot (`data-testid="nav-actions"` unless `nav`) and the dashboard routes (each a `Where`).
  - `stubOrganizationPageAsk({ copilot?, page? }) → { copilot, page, release }` in `testOrganizationsAsk.ts`.
  - `stubCopilot({ label?: (context) => string })`: the stored context and origin gain that `label`.

- [ ] **Step 1: Write the failing tests and the test doubles**

In `src/pages/organizations/ask/useOrganizationsContext.test.tsx`, replace:

```tsx
  it('has no context off the list and the board', () => {
    expect(parseOrganizationsView('/organizations/7')).toBeNull();
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at('/organizations/7') });
    expect(result.current).toBeNull();
  });
```

with:

```tsx
  it.each([
    ['/organizations/7', { organization: 7, account: null }],
    ['/organizations/7?account=31', { organization: 7, account: 31 }],
    ['/organizations/7?account=31&tab=people&q=renewal', { organization: 7, account: 31 }],
    // "Organization" (records on the organisation itself) and the whole-organisation tabs carry no account.
    ['/organizations/7?account=none', { organization: 7, account: null }],
    ['/organizations/7?account=31&tab=details', { organization: 7, account: null }],
  ])("%s: an organisation's page", (url, expected) => {
    expect(parseOrganizationsView(url.split('?')[0])).toBe('detail');
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at(url) });
    expect(result.current).toEqual({ surface: 'organizations', view: 'detail', focus: null, ...expected });
  });

  it('has no context off the list, the board and an organisation', () => {
    for (const path of ['/organizations', '/organizations/new', '/dashboard/overview']) expect(parseOrganizationsView(path)).toBeNull();
    const { result } = renderHook(() => useOrganizationsContext(), { wrapper: at('/organizations/new') });
    expect(result.current).toBeNull();
  });
```

In `src/components/copilot/testCopilot.ts`, replace:

```ts
export function stubCopilot(
  options: { statuses?: number[]; hold?: boolean; conversations?: unknown[]; conversationById?: Record<number, unknown> } = {},
) {
```

with:

```ts
export function stubCopilot(
  options: {
    statuses?: number[];
    hold?: boolean;
    conversations?: unknown[];
    conversationById?: Record<number, unknown>;
    /** The server's label for an organisation page's context ("Pizza Hut ·
     *  EMEA"), stored on the context and the origin as the backend does. */
    label?: (context: Record<string, unknown>) => string;
  } = {},
) {
```

In `src/components/copilot/testCopilot.ts`, replace:

```ts
      const body = JSON.parse(String(init.body)) as { content: string; context?: Record<string, unknown> };
      if (body.context && origin === null) {
```

with:

```ts
      const body = JSON.parse(String(init.body)) as { content: string; context?: Record<string, unknown> };
      if (body.context && options.label) body.context = { ...body.context, label: options.label(body.context) };
      if (body.context && origin === null) {
```

In `src/pages/organizations/ask/testOrganizationsAsk.ts`, replace:

```ts
import { stubPortfolio, type PortfolioStub } from '../../../features/organizations/testPortfolio';
```

with:

```ts
import { stubPortfolio, type PortfolioStub } from '../../../features/organizations/testPortfolio';
import { stubOrganizationPage, type OrganizationPageStub } from '../../../features/organizations/testStory';
```

Append to `src/pages/organizations/ask/testOrganizationsAsk.ts`:

```ts

/** Test-only. The organisation page's endpoints (stubOrganizationPage) and
 *  the Copilot's behind one fetch. `copilot` is the spy postedBodies reads;
 *  `page` the one storyQueries and requestPaths read. */
export function stubOrganizationPageAsk(options: { copilot?: Parameters<typeof stubCopilot>[0]; page?: OrganizationPageStub } = {}) {
  const copilot = stubCopilot(options.copilot);
  const page = stubOrganizationPage(options.page);
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : page(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, page, release: copilot.release };
}
```

In `src/pages/organizations/testDetail.tsx`, replace:

```tsx
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
```

with:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
```

In `src/pages/organizations/testDetail.tsx`, replace:

```tsx
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { Details } from './Details';
```

with:

```tsx
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { dashboardRoutes } from '../dashboard/routes';
import { OrganizationsAskLayout } from './ask/OrganizationsAskLayout';
import { Details } from './Details';
```

In `src/pages/organizations/testDetail.tsx`, replace:

```tsx
/** The organization page on the real store and router. `list` puts the real
 *  List at /organizations/list (a marker otherwise); `nav` adds the real
 *  Navbar. Only fetch is stubbed, by the caller (stubOrganizationPage). */
export function renderOrganizationPage(
  url = '/organizations/7',
  {
    width = 1440,
    nav = false,
    list = false,
    history = false,
    goTo,
  }: { width?: number; nav?: boolean; list?: boolean; history?: boolean; goTo?: string } = {},
) {
  setViewport(width);
  const store = makeDetailStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        {nav ? <Navbar /> : null}
        <Routes>
          <Route
            path="/organizations/:id"
            element={
              <>
                <Details />
                <Where />
                {history || goTo ? <History goTo={goTo} /> : null}
              </>
            }
          />
          <Route
            path="/organizations/list"
            element={
              <>
                {list ? <List /> : <p>Organizations list</p>}
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

with:

```tsx
/** DashboardLayout's Navbar actions slot, where the Ask pill portals. With
 *  the real Navbar (`nav`) the Navbar renders the slot element; without it a
 *  bare one stands in (`data-testid="nav-actions"`). */
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

/** The organization page on the real store and router. `list` puts the real
 *  List at /organizations/list (a marker otherwise); `nav` adds the real
 *  Navbar. `ask` puts both under OrganizationsAskLayout, as App.tsx does,
 *  with the Navbar's actions slot and the real dashboard routes beside them
 *  (every view a Where) for History's cross-surface handover. Only fetch is
 *  stubbed, by the caller (stubOrganizationPage, or stubOrganizationPageAsk
 *  with `ask`). */
export function renderOrganizationPage(
  url = '/organizations/7',
  {
    width = 1440,
    nav = false,
    list = false,
    history = false,
    goTo,
    ask = false,
  }: { width?: number; nav?: boolean; list?: boolean; history?: boolean; goTo?: string; ask?: boolean } = {},
) {
  setViewport(width);
  const store = makeDetailStore();
  const pages = [
    <Route
      key="page"
      path="/organizations/:id"
      element={
        <>
          <Details />
          <Where />
          {history || goTo ? <History goTo={goTo} /> : null}
        </>
      }
    />,
    <Route
      key="list"
      path="/organizations/list"
      element={
        <>
          {list ? <List /> : <p>Organizations list</p>}
          <Where />
        </>
      }
    />,
  ];
  const routes = (
    <Routes>
      {ask ? <Route element={<OrganizationsAskLayout />}>{pages}</Route> : pages}
      {ask ? dashboardRoutes(() => <Where />) : null}
    </Routes>
  );
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        {ask ? (
          <SlotHost bare={!nav}>
            {nav ? <Navbar /> : null}
            {routes}
          </SlotHost>
        ) : (
          <>
            {nav ? <Navbar /> : null}
            {routes}
          </>
        )}
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

Create `src/pages/organizations/ask/detailAsk.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: the real organisation page under OrganizationsAskLayout,
// the real rail and pill, store and router; fetch answers the page and the
// Copilot with contract-shaped bodies (backend delivery 3).
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const heading = () => screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
const column = () => document.querySelector('[data-part="column"]') as HTMLElement;
const page = { surface: 'organizations', view: 'detail', organization: 7 };

describe('Ask Revenact on the organisation page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("keeps the page's full width and 24px gutter while the rail is closed, in one frame", async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true, width: 1100 });
    await heading();
    expect(rail()).not.toBeInTheDocument();
    expect(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' })).toHaveAttribute('aria-pressed', 'false');
    expect(column()).toHaveClass('w-full', 'max-w-[1800px]', 'mx-auto');
    expect(column().parentElement).toHaveClass('flex-1', 'min-w-0', 'px-4', 'sm:px-0');
    expect(column().parentElement!.parentElement).toHaveClass('px-0', 'sm:px-6');
    // The layout's frame is the only one: the page's own passes through.
    expect(document.querySelectorAll('[data-part="column"]')).toHaveLength(1);
    expect(column().parentElement!.parentElement!.parentElement!.closest('.sm\\:px-6')).toBeNull();
  });

  it('puts the glass rail beside the page from xl, and the page reflows beside it', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    const frame = column().parentElement!.parentElement!;
    expect(rail()).toHaveClass('w-[320px]');
    expect(frame).toContainElement(rail());
    expect(column().parentElement!.contains(rail())).toBe(false);
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    // Glass is the rail's alone: the page's surfaces stay solid.
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
  });

  it('reads "Pizza Hut", then "Pizza Hut · EMEA" when the account chip is chosen', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    expect(await within(rail()!).findByText('Pizza Hut')).toBeInTheDocument();
    const chips = await screen.findByRole('group', { name: 'Filter by account' });
    await userEvent.click(await within(chips).findByRole('button', { name: /^EMEA/ }));
    expect(await within(rail()!).findByText('Pizza Hut · EMEA')).toBeInTheDocument();
    // Details is the whole organisation's: no chips there, and no account.
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(await within(rail()!).findByText('Pizza Hut')).toBeInTheDocument();
  });

  it("asks with the page's context, and the question keeps the server's label", async () => {
    const { copilot } = stubOrganizationPageAsk({ copilot: { label: () => 'Pizza Hut · EMEA' } });
    renderOrganizationPage('/organizations/7?account=31', { ask: true });
    await heading();
    await within(rail()!).findByText('Pizza Hut · EMEA');
    await userEvent.type(composer(), 'What changed this month?{enter}');
    await screen.findByText('Answer to: What changed this month?');
    expect(postedBodies(copilot)[0]).toEqual({ content: 'What changed this month?', context: { ...page, account: 31, focus: null } });
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
  });

  it('keeps one conversation from the List into the organisation and back', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/list', { ask: true, list: true, history: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.type(composer(), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    await userEvent.click(screen.getByRole('link', { name: 'Pizza Hut' }));
    await heading();
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Answer to: Who renews first?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And here?{enter}');
    expect(await within(log).findByText('Answer to: And here?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(within(screen.getByRole('log', { name: 'Ask Revenact messages' })).getByText('Answer to: And here?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/organizations/ask/useOrganizationsContext.test.tsx src/pages/organizations/ask/detailAsk.test.tsx`
Expected: FAIL. `parseOrganizationsView('/organizations/7')` is `null`. On the page the layout's frame is `px-4` (not the page's `bleed`), and the rail shows no chip because the context is null.

- [ ] **Step 3: The detail view in the context hook**

Replace the contents of `src/pages/organizations/ask/useOrganizationsContext.ts` with:

```ts
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePortfolioParams } from '../../../components/organizations/portfolio/usePortfolioParams';
import { defaultGroupOf, toContextFilters } from '../../../features/organizations/askContext';
import { detailContext, detailIdOf } from '../../../features/organizations/detailAskContext';
import { parseDetailParams } from '../../../features/organizations/detailParams';
import { boardParams } from '../../../features/organizations/portfolioParams';
import type { OrganizationDetailContext, OrganizationsContext, OrganizationsView } from '../../copilot/types';

/** Which Organizations page a URL shows: the List, the Board, one
 *  organisation's page, or null for any other. */
export function parseOrganizationsView(pathname: string): OrganizationsView | 'detail' | null {
  if (pathname === '/organizations/list') return 'list';
  if (pathname === '/organizations/board') return 'board';
  if (detailIdOf(pathname) !== null) return 'detail';
  return null;
}

/** Where the person is on Organizations, as the server needs it (spec §3):
 *  on the List and the Board the view and the portfolio's params as that
 *  page reads them (the Board's with its lifecycle default, never ungrouped);
 *  on an organisation's page its id and the account chip. Never figures or
 *  names: the server recomputes the page. Null off these routes. */
export function useOrganizationsContext(): OrganizationsContext | OrganizationDetailContext | null {
  const { pathname, search } = useLocation();
  const view = parseOrganizationsView(pathname);
  const { params } = usePortfolioParams(defaultGroupOf(view === 'board' ? 'board' : 'list'));
  // The page's context changes only with the organisation or the account it
  // carries, not with every story filter or search keystroke.
  const organization = detailIdOf(pathname);
  const account = organization === null ? null : detailContext(organization, parseDetailParams(new URLSearchParams(search))).account;
  return useMemo(() => {
    if (!view) return null;
    if (view === 'detail') return { surface: 'organizations', view, organization: organization!, account, focus: null };
    const shown = view === 'board' ? boardParams(params) : params;
    return { surface: 'organizations', view, filters: toContextFilters(shown, view), focus: null };
  }, [view, params, organization, account]);
}
```

- [ ] **Step 4: The page reports its names; the layout draws its frame**

Create `src/pages/organizations/ask/detailNames.ts`:

```ts
import { createContext, useContext, useEffect } from 'react';
import type { DetailNames } from '../../../features/organizations/detailAskContext';

/** Only the organisation page knows its name and its accounts' names, so it
 *  reports them here, and a live question's chip can say "Pizza Hut · EMEA"
 *  before the server has labelled it. Null outside OrganizationsAskLayout. */
export const DetailNamesContext = createContext<((names: DetailNames) => void) | null>(null);

export function useReportDetailNames(names: DetailNames | null): void {
  const report = useContext(DetailNamesContext);
  useEffect(() => {
    if (report && names) report(names);
  }, [report, names]);
}
```

Replace the contents of `src/pages/organizations/ask/OrganizationsAskLayout.tsx` with:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import type { DetailNames } from '../../../features/organizations/detailAskContext';
import { ORGANIZATIONS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { OrganizationsFrame } from '../OrganizationsFrame';
import { DetailNamesContext } from './detailNames';
import { PortfolioOptionsContext, type PortfolioOptions } from './portfolioOptions';
import { parseOrganizationsView, useOrganizationsContext } from './useOrganizationsContext';

const same = <T,>(prev: T | null, next: T) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);

/** The Organizations routes' Ask (spec §3): one conversation above the List,
 *  the Board and every organisation's page, so it lasts from the List into
 *  an organisation and back, through every filter. The frame and its rail
 *  (with the pill) sit here too, beside the Outlet, so the rail is never
 *  remounted by a route change: react-router applies that change in a
 *  transition, after a History pick's conversation has already shown. On an
 *  organisation's page the frame is the page's own `bleed` variant, so the
 *  page keeps its full width and 24px gutter while the rail is closed. */
export function OrganizationsAskLayout() {
  const { pathname } = useLocation();
  const context = useOrganizationsContext();
  const [options, setOptions] = useState<PortfolioOptions | null>(null);
  const [names, setNames] = useState<DetailNames | null>(null);
  const report = useCallback((next: PortfolioOptions) => setOptions((prev) => same(prev, next)), []);
  const reportNames = useCallback((next: DetailNames) => setNames((prev) => same(prev, next)), []);
  // Stable across renders that don't change `context`, `options` or `names`,
  // so AskProvider's value doesn't churn on every unrelated render (spec:
  // a send must not re-render the whole List).
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { organizations: options, detail: names }),
    [options, names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'organizations', context, chipLabel }), [context, chipLabel]);
  return (
    <PortfolioOptionsContext.Provider value={report}>
      <DetailNamesContext.Provider value={reportNames}>
        <AskProvider surface={surface} preferenceKey={ORGANIZATIONS_ASK_KEY}>
          <OrganizationsFrame rail={<AskRail />} bleed={parseOrganizationsView(pathname) === 'detail'}>
            <Outlet />
          </OrganizationsFrame>
        </AskProvider>
      </DetailNamesContext.Provider>
    </PortfolioOptionsContext.Provider>
  );
}
```

In `src/pages/organizations/Details.tsx`, replace:

```tsx
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
```

with:

```tsx
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
```

In `src/pages/organizations/Details.tsx`, replace:

```tsx
import { bulkUpdate } from '../../features/organizations/portfolioApi';
```

with:

```tsx
import type { DetailNames } from '../../features/organizations/detailAskContext';
import { bulkUpdate } from '../../features/organizations/portfolioApi';
```

In `src/pages/organizations/Details.tsx`, replace:

```tsx
import { AccountFormModal } from './AccountFormModal';
```

with:

```tsx
import { AccountFormModal } from './AccountFormModal';
import { useReportDetailNames } from './ask/detailNames';
```

In `src/pages/organizations/Details.tsx`, replace:

```tsx
 *  four requests; every other tab reads its data when first opened. Ask on
 *  this page is delivery 3, so the frame has no rail yet. */
```

with:

```tsx
 *  four requests; every other tab reads its data when first opened. Ask sits
 *  beside it (delivery 3): OrganizationsAskLayout draws the frame and the
 *  rail, and the page reports its names for the question's chip. */
```

In `src/pages/organizations/Details.tsx`, replace:

```tsx
  const chipCounts = useChipCounts(params.tab, story.data?.counts.by_account ?? null, accounts, orgId ?? 0);
```

with:

```tsx
  const chipCounts = useChipCounts(params.tab, story.data?.counts.by_account ?? null, accounts, orgId ?? 0);

  // The Ask chip's names: "Pizza Hut · EMEA" (spec §3).
  const orgName = org.row?.name ?? null;
  const names = useMemo<DetailNames | null>(
    () =>
      orgId !== null && orgName !== null
        ? { organization: orgId, name: orgName, accounts: Object.fromEntries(accounts.map((account) => [account.id, account.name])) }
        : null,
    [orgId, orgName, accounts],
  );
  useReportDetailNames(names);
```

The hook sits above the page's early returns (not found, error), so the hook order never changes.

- [ ] **Step 5: The route moves under the layout**

In `src/App.tsx`, replace:

```tsx
            {/* One Ask conversation above both views (spec §3). */}
            <Route element={<OrganizationsAskLayout />}>
              <Route path="list" element={<List />} />
              <Route path="board" element={<Board />} />
            </Route>
            <Route path=":id" element={<OrganizationDetails />} />
```

with:

```tsx
            {/* One Ask conversation above both views and every
                organization's page (spec §3). */}
            <Route element={<OrganizationsAskLayout />}>
              <Route path="list" element={<List />} />
              <Route path="board" element={<Board />} />
              <Route path=":id" element={<OrganizationDetails />} />
            </Route>
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/pages/organizations src/components/organizations/detail src/pages/dashboard/ask`
Expected: PASS, including `alignment.test.tsx` ("the page uses the full width inside a 24px gutter": the page on its own still draws its `bleed` frame) and every Organizations Ask test (the List and the Board keep `px-4`).

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/organizations/ask/useOrganizationsContext.ts src/pages/organizations/ask/useOrganizationsContext.test.tsx src/pages/organizations/ask/detailNames.ts src/pages/organizations/ask/OrganizationsAskLayout.tsx src/App.tsx src/pages/organizations/Details.tsx src/components/copilot/testCopilot.ts src/pages/organizations/testDetail.tsx src/pages/organizations/ask/testOrganizationsAsk.ts src/pages/organizations/ask/detailAsk.test.tsx
git commit -m "feat(organizations): Ask Revenact beside the organisation page, one conversation from the List

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The page reflows beside the rail; phones; no `/copilot` link

**Files:**
- Modify: `src/components/organizations/detail/HeaderTiles.tsx`
- Test: `src/components/organizations/detail/HeaderTiles.test.tsx`, `src/pages/organizations/Details.test.tsx`, `src/pages/organizations/ask/detailAsk.test.tsx`

**Interfaces:**
- Consumes: Task 2's `renderOrganizationPage(…, { ask: true })`, `stubOrganizationPageAsk`.
- Produces: the tile grid `grid grid-cols-2 gap-3 @min-[36rem]:grid-cols-4` inside an `@container` (from `sm`; the phone strip is unchanged).

- [ ] **Step 1: Write the failing tests**

In `src/components/organizations/detail/HeaderTiles.test.tsx`, replace:

```tsx
  it('is a four-column grid from sm', () => {
    renderTiles({ isSm: true });
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('grid', 'grid-cols-4');
  });
```

with:

```tsx
  it('is a grid from sm that wraps to its column: four across from 36rem, two beside the Ask rail', () => {
    renderTiles({ isSm: true });
    const grid = screen.getByRole('button', { name: /^ARR/ }).parentElement!;
    expect(grid).toHaveClass('grid', 'grid-cols-2', '@min-[36rem]:grid-cols-4');
    expect(grid.parentElement).toHaveClass('@container');
  });
```

In `src/pages/organizations/Details.test.tsx`, replace:

```tsx
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('grid', 'grid-cols-4');
```

with:

```tsx
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('grid', '@min-[36rem]:grid-cols-4');
```

In `src/pages/organizations/ask/detailAsk.test.tsx`, replace:

```tsx
    expect(within(screen.getByRole('log', { name: 'Ask Revenact messages' })).getByText('Answer to: And here?')).toBeInTheDocument();
  });
});
```

with:

```tsx
    expect(within(screen.getByRole('log', { name: 'Ask Revenact messages' })).getByText('Answer to: And here?')).toBeInTheDocument();
  });

  it('wraps the tiles to the page column, so they reflow beside the rail', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    const grid = screen.getByRole('button', { name: /^ARR/ }).parentElement!;
    expect(grid).toHaveClass('grid-cols-2', '@min-[36rem]:grid-cols-4');
    expect(grid.closest('[class~="@container"]')).not.toBeNull();
    expect(column().contains(grid)).toBe(true);
  });

  it('opens as a full-screen sheet on phones, with the page left as it was', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7?account=31', { ask: true, width: 375 });
    await heading();
    expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(column().parentElement).toHaveClass('px-4', 'sm:px-0');
    await userEvent.click(screen.getByRole('button', { name: 'Show Copilot' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close Ask Revenact' }));
    expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument();
  });

  it('never links to the old Copilot page', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    expect(screen.queryByRole('link', { name: /Ask Copilot/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/copilot"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/components/organizations/detail/HeaderTiles.test.tsx src/pages/organizations/Details.test.tsx src/pages/organizations/ask/detailAsk.test.tsx`
Expected: FAIL on the three tile tests (the grid is `grid-cols-4` by the window, with no `@container`). The phone sheet and `/copilot` tests already pass. They pin behaviour Task 2 brought (the shared `AskRail` sheet) and delivery 1 (the link's removal).

- [ ] **Step 3: The tiles wrap to their column**

In `src/components/organizations/detail/HeaderTiles.tsx`, replace:

```tsx
/** The four tiles (spec §1.3). Health opens its breakdown below them; ARR,
 *  Renewal and Pulse jump to their Details panel. A four-column grid from
 *  `sm`; a strip that snaps sideways on phones. */
```

with:

```tsx
/** The four tiles (spec §1.3). Health opens its breakdown below them; ARR,
 *  Renewal and Pulse jump to their Details panel. From `sm` a grid that
 *  wraps to its own column, not the window (`@container`): four across once
 *  the column is 36rem wide, which it always is from `sm` with the Ask rail
 *  closed, and two beside the open rail on a narrow window. A strip that
 *  snaps sideways on phones. */
```

In `src/components/organizations/detail/HeaderTiles.tsx`, replace:

```tsx
    <div className="flex flex-col gap-3">
      <div className={isSm ? 'grid grid-cols-4 gap-3' : '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4'}>
```

with:

```tsx
    <div className="@container flex flex-col gap-3">
      <div
        className={
          isSm ? 'grid grid-cols-2 gap-3 @min-[36rem]:grid-cols-4' : '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4'
        }
      >
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations`
Expected: PASS, including `houseRules.test.ts` and `alignment.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/HeaderTiles.tsx src/components/organizations/detail/HeaderTiles.test.tsx src/pages/organizations/Details.test.tsx src/pages/organizations/ask/detailAsk.test.tsx
git commit -m "feat(organizations): the organisation page's tiles reflow beside the Ask rail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: "Ask about this" on a story item

**Files:**
- Modify: `src/pages/dashboard/ask/context.ts`, `src/pages/dashboard/ask/AskProvider.tsx`, `src/components/organizations/detail/StoryItemRow.tsx`
- Test: `src/components/organizations/detail/StoryItemRow.test.tsx` (new), `src/pages/organizations/ask/askAboutThis.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `askAboutQuestion`, `StoryFocus`, `AskFocus`, `withFocus`; Task 2's test doubles.
- Produces: `AskDraftContext: Context<((question: string, focus: AskFocus) => void) | null>` in `pages/dashboard/ask/context.ts`. `AskProvider`'s `draft` is one `useCallback` (deps `[reveal]`) used for both `AskState.draft` and `AskDraftContext`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/organizations/detail/StoryItemRow.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STORY_ITEMS } from '../../../features/organizations/testStory';
import { AskDraftContext } from '../../../pages/dashboard/ask/context';
import { StoryItemRow } from './StoryItemRow';

const call = STORY_ITEMS.find((item) => item.kind === 'call')!;

function renderRow(draft: ((question: string, focus: unknown) => void) | null) {
  return render(
    <AskDraftContext.Provider value={draft}>
      <ul>
        <StoryItemRow item={call} onOpenEmail={() => {}} />
      </ul>
    </AskDraftContext.Provider>,
  );
}

describe('StoryItemRow: Ask about this', () => {
  it('prefills a question about this one item, focused on it', async () => {
    const draft = vi.fn();
    renderRow(draft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    expect(draft).toHaveBeenCalledWith('What should I know about this call?', { kind: 'call', id: 12 });
  });

  it('is a 44px target on phones, the meta line size from sm', () => {
    renderRow(vi.fn());
    const button = screen.getByRole('button', { name: /^Ask about this/ });
    expect(button).toHaveClass('min-h-11', 'sm:min-h-0');
    expect(button).toHaveTextContent('Ask about this');
  });

  it('is not offered outside an Ask provider', () => {
    renderRow(null);
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
```

Create `src/pages/organizations/ask/askAboutThis.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: "Ask about this" on a story item (spec §3), through the
// real page, layout, rail, store and router.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact') as HTMLInputElement;
const page = { surface: 'organizations', view: 'detail', organization: 7 };

describe('Ask about this', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens the rail with a question about the item, focused on it for one question', async () => {
    const { copilot } = stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7?account=31', { ask: true, width: 1100 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Re: Renewal pricing' }));
    expect(await within(rail()).findByText('Pizza Hut · EMEA · This email')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this email?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this email?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...page, account: 31, focus: { kind: 'email', id: 41 } });
    // Spent by the send: the chip is the page again, and so is the next question.
    expect(within(rail()).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the renewal?{enter}');
    await screen.findByText('Answer to: And the renewal?');
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, account: 31, focus: null });
  });

  it("drops the focus with the chip's ×, keeping the question", async () => {
    const { copilot } = stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    await within(rail()).findByText('Pizza Hut · This call');
    await userEvent.click(within(rail()).getByRole('button', { name: 'Remove focus' }));
    expect(within(rail()).getByText('Pizza Hut')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this call?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this call?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...page, account: null, focus: null });
  });

  it('drops the focus when the story filters change', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    await within(rail()).findByText('Pizza Hut · This call');
    const chips = screen.getByRole('group', { name: 'Filter by account' });
    await userEvent.click(within(chips).getByRole('button', { name: /^EMEA/ }));
    expect(await within(rail()).findByText('Pizza Hut · EMEA')).toBeInTheDocument();
    expect(within(rail()).queryByText(/This call/)).not.toBeInTheDocument();
  });

  it('opens the sheet on phones, prefilled', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true, width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pizza Hut · This call')).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue('What should I know about this call?');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/components/organizations/detail/StoryItemRow.test.tsx src/pages/organizations/ask/askAboutThis.test.tsx`
Expected: FAIL. `AskDraftContext` is not exported from `context.ts`, and no row has an "Ask about this" button.

- [ ] **Step 3: A stable `draft` in its own context**

Append to `src/pages/dashboard/ask/context.ts`:

```ts

/** Just `draft`, in its own context, for the same reason: its identity
 *  changes only with the viewport, so a story item's "Ask about this" can
 *  read it here without re-rendering the whole story on every send. */
export const AskDraftContext = createContext<((question: string, focus: AskFocus) => void) | null>(null);
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```tsx
import { AskContext, AskFocusOnContext, withFocus, type AskState, type AskSurface } from './context';
```

with:

```tsx
import { AskContext, AskDraftContext, AskFocusOnContext, withFocus, type AskState, type AskSurface } from './context';
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```tsx
  const markSent = useCallback(() => {
    setFocus(null);
    setPendingDraft(null);
  }, []);
```

with:

```tsx
  const markSent = useCallback(() => {
    setFocus(null);
    setPendingDraft(null);
  }, []);
  const draft = useCallback(
    (question: string, nextFocus: AskFocus) => {
      setFocus(nextFocus);
      // A new nonce remounts the composer with the new text. After markSent
      // the key is 0, so restarting at 1 still differs from the last key.
      setPendingDraft((prev) => ({ text: question, nonce: (prev?.nonce ?? 0) + 1 }));
      reveal();
    },
    [reveal],
  );
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```tsx
      pendingDraft,
      draft: (question, nextFocus) => {
        setFocus(nextFocus);
        // A new nonce remounts the composer with the new text. After markSent
        // the key is 0, so restarting at 1 still differs from the last key.
        setPendingDraft((prev) => ({ text: question, nonce: (prev?.nonce ?? 0) + 1 }));
        reveal();
      },
      ask:
```

with:

```tsx
      pendingDraft,
      draft,
      ask:
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```tsx
    [surface, open, setOpen, reveal, conversation, setConversation, thread, focus, clearFocus, focusOn, markSent, pendingDraft, navigate],
```

with:

```tsx
    [surface, open, setOpen, reveal, conversation, setConversation, thread, focus, clearFocus, focusOn, markSent, pendingDraft, draft, navigate],
```

In `src/pages/dashboard/ask/AskProvider.tsx`, replace:

```tsx
      <AskFocusOnContext.Provider value={focusOn}>{children}</AskFocusOnContext.Provider>
```

with:

```tsx
      <AskFocusOnContext.Provider value={focusOn}>
        <AskDraftContext.Provider value={draft}>{children}</AskDraftContext.Provider>
      </AskFocusOnContext.Provider>
```

- [ ] **Step 4: The button on each story item**

In `src/components/organizations/detail/StoryItemRow.tsx`, replace:

```tsx
import { useId, useLayoutEffect, useRef, useState } from 'react';
```

with:

```tsx
import { useContext, useId, useLayoutEffect, useRef, useState } from 'react';
```

In `src/components/organizations/detail/StoryItemRow.tsx`, replace:

```tsx
  Phone,
  SquareCheck,
```

with:

```tsx
  Phone,
  Sparkles,
  SquareCheck,
```

In `src/components/organizations/detail/StoryItemRow.tsx`, replace:

```tsx
import { KIND_NAME, sourceName } from '../../../features/organizations/storyKinds';
```

with:

```tsx
import { askAboutQuestion } from '../../../features/organizations/detailAskContext';
import { KIND_NAME, sourceName } from '../../../features/organizations/storyKinds';
```

In `src/components/organizations/detail/StoryItemRow.tsx`, replace:

```tsx
import type { StoryItem, StoryKind } from '../../../features/organizations/storyTypes';
import { FOCUS } from '../portfolio/styles';
```

with:

```tsx
import type { StoryItem, StoryKind } from '../../../features/organizations/storyTypes';
import { AskDraftContext } from '../../../pages/dashboard/ask/context';
import { FOCUS } from '../portfolio/styles';
```

In `src/components/organizations/detail/StoryItemRow.tsx`, replace:

```tsx
/** One story item (spec §1.6): icon, title, time, a one-line summary, then
 *  the account tag and kind · who · source. An email with a thread opens it;
 *  any other item with more to show opens in place. */
export function StoryItemRow({ item, onOpenEmail }: { item: StoryItem; onOpenEmail: (item: StoryItem) => void }) {
```

with:

```tsx
/** "Ask about this" (spec §3): prefills a question about this one item and
 *  opens the Ask rail, the item the focus of that question only. Only inside
 *  an Ask provider. */
function AskAbout({ item }: { item: StoryItem }) {
  const draft = useContext(AskDraftContext);
  if (!draft) return null;
  const focus = { kind: item.kind, id: item.id };
  return (
    <button
      type="button"
      onClick={() => draft(askAboutQuestion(focus), focus)}
      aria-label={`Ask about this: ${item.title}`}
      className={`ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-sm font-semibold text-ink-muted hover:text-ink active:opacity-70 sm:min-h-0 ${FOCUS}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      Ask about this
    </button>
  );
}

/** One story item (spec §1.6): icon, title, time, a one-line summary, then
 *  the account tag, kind · who · source, and "Ask about this". An email with
 *  a thread opens it; any other item with more to show opens in place. */
export function StoryItemRow({ item, onOpenEmail }: { item: StoryItem; onOpenEmail: (item: StoryItem) => void }) {
```

In `src/components/organizations/detail/StoryItemRow.tsx`, replace:

```tsx
          <span className="min-w-0 truncate">{meta}</span>
        </p>
```

with:

```tsx
          <span className="min-w-0 truncate">{meta}</span>
          <AskAbout item={item} />
        </p>
```

The button inherits the meta line's 11px type. Its accessible name starts with its visible words ("Ask about this: Quarterly check-in"), so voice control finds it by what it shows, and each row's is unique.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations src/pages/dashboard`
Expected: PASS, including `houseRules.test.ts` over `StoryItemRow.tsx` and the Dashboard's drill "Ask about these" (`drillAsk.test.tsx`), which uses the same `draft`.

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/ask/context.ts src/pages/dashboard/ask/AskProvider.tsx src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/StoryItemRow.test.tsx src/pages/organizations/ask/askAboutThis.test.tsx
git commit -m "feat(organizations): Ask about this on a story item, for one question

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: History: the server's tag, and restoring the page with its account

**Files:**
- Test: `src/pages/organizations/ask/detailHistory.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `originTag`/`originPath` dispatch; Task 2's layout, route and test doubles; `AskProvider.openFromHistory` (unchanged: same surface navigates to `originPath(origin)` and shows the thread; another surface hands the conversation over in navigation state).
- Produces: nothing new. This task pins the History behaviour end to end, through the popover, the router and both surfaces.

- [ ] **Step 1: Write the tests**

Create `src/pages/organizations/ask/detailHistory.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: History on an organisation's page (spec §3). The tag is
// the server's label; restoring opens /organizations/{id}?account=….
const where = () => screen.getByTestId('where').textContent;
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

const emeaOrigin = { surface: 'organizations', view: 'detail', organization: 7, account: 31, label: 'Pizza Hut · EMEA' };
const wholeOrigin = { surface: 'organizations', view: 'detail', organization: 7, account: null, label: 'Pizza Hut' };
const listOrigin = { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] };

function chat(id: number, title: string, origin: Record<string, unknown>, answer: string, focus: unknown = null) {
  const summary = { id, title, created_at: '', updated_at: '', origin };
  const full = {
    ...summary,
    messages: [
      { id: 1, role: 'user', content: title, context: { ...origin, focus }, sources: [], questions: [], created_at: '' },
      { id: 2, role: 'assistant', content: answer, sources: [], questions: [], created_at: '' },
    ],
  };
  return { summary, full };
}

const emea = chat(21, 'What changed in EMEA?', emeaOrigin, 'The admin left.', { kind: 'call', id: 12 });
const whole = chat(22, 'Is Pizza Hut healthy?', wholeOrigin, 'Mostly, but the renewal is close.');
const renews = chat(9, 'Who renews first?', listOrigin, 'Pizza Hut, and it is overdue.');

function stubHistory() {
  return stubOrganizationPageAsk({
    copilot: {
      conversations: [emea.summary, whole.summary, renews.summary],
      conversationById: { 21: emea.full, 22: whole.full, 9: renews.full },
    },
  });
}

async function pick(title: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: 'History' }));
  const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', { name: title });
  await userEvent.click(item);
}

describe("History on an organisation's page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("tags a conversation with the server's label", async () => {
    stubHistory();
    renderOrganizationPage('/organizations/list', { ask: true, list: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    expect(within(await within(panel).findByRole('button', { name: /What changed in EMEA\?/ })).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
    expect(within(within(panel).getByRole('button', { name: /Is Pizza Hut healthy\?/ })).getByText('Pizza Hut')).toBeInTheDocument();
  });

  it('reopens on the organisation with its account chip, from the List', async () => {
    stubHistory();
    renderOrganizationPage('/organizations/list', { ask: true, list: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/What changed in EMEA\?/);
    await waitFor(() => expect(where()).toBe('/organizations/7?account=31'));
    expect(await within(log()).findByText('The admin left.')).toBeInTheDocument();
    // The question's own chip: the server's label, then its focus.
    expect(within(log()).getByText('Pizza Hut · EMEA · This call')).toBeInTheDocument();
    const chips = await screen.findByRole('group', { name: 'Filter by account' });
    expect(await within(chips).findByRole('button', { name: /^EMEA/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reopens on the whole organisation, and a List conversation back on the List', async () => {
    stubHistory();
    renderOrganizationPage('/organizations/7?account=31', { ask: true, list: true });
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    await pick(/Is Pizza Hut healthy\?/);
    await waitFor(() => expect(where()).toBe('/organizations/7'));
    expect(await within(log()).findByText('Mostly, but the renewal is close.')).toBeInTheDocument();
    await pick(/Who renews first\?/);
    await waitFor(() => expect(where()).toBe('/organizations/list?owner=2'));
    expect(await within(log()).findByText('Pizza Hut, and it is overdue.')).toBeInTheDocument();
  });

  it('brings a conversation picked on the dashboard back to the organisation', async () => {
    stubHistory();
    renderOrganizationPage('/dashboard/overview', { ask: true });
    await pick(/What changed in EMEA\?/);
    await waitFor(() => expect(where()).toBe('/organizations/7?account=31'));
    expect(await within(log()).findByText('The admin left.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/pages/organizations/ask/detailHistory.test.tsx`
Expected: PASS (4 tests). Tasks 1 and 2 built this behaviour: the tag (`originTag`), the path (`originPath`), the route under the layout, and the handover from the Dashboard. If one fails, fix the task that owns the behaviour, not this test. To see the tests bite, temporarily make `detailPath` return `/organizations/list`. Three tests should fail. Then revert.

- [ ] **Step 3: Commit**

```bash
git add src/pages/organizations/ask/detailHistory.test.tsx
git commit -m "test(organizations): History tags and restores an organisation page's conversation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A refused organisation or account shows on the rail, with no Retry

**Files:**
- Modify: `src/components/copilot/useCopilotThread.ts`, `src/components/copilot/CopilotRail.tsx`
- Modify (test double): `src/components/copilot/testCopilot.ts`
- Test: `src/components/copilot/CopilotRail.test.tsx`, `src/pages/organizations/ask/detailAsk.test.tsx`

**Interfaces:**
- Consumes: `ApiError {status, body}` (`lib/apiClient.ts`); Task 2's test doubles.
- Produces: `refusalMessage(err: unknown): string | null` exported from `useCopilotThread.ts`; `FailedTurn.refused: boolean`; `stubCopilot({ refuse?: Record<string, string[]> })` answers every question with a context with `400 {"context": refuse}`.

- [ ] **Step 1: Write the failing tests**

In `src/components/copilot/testCopilot.ts`, replace:

```ts
    label?: (context: Record<string, unknown>) => string;
  } = {},
) {
```

with:

```ts
    label?: (context: Record<string, unknown>) => string;
    /** A `400 {"context": refuse}` for every question asked with a context,
     *  as the backend answers an organisation or account the asker may not open. */
    refuse?: Record<string, string[]>;
  } = {},
) {
```

In `src/components/copilot/testCopilot.ts`, replace:

```ts
      if (body.context && options.label) body.context = { ...body.context, label: options.label(body.context) };
```

with:

```ts
      if (body.context && options.refuse) return reply({ context: options.refuse }, 400);
      if (body.context && options.label) body.context = { ...body.context, label: options.label(body.context) };
```

In `src/components/copilot/CopilotRail.test.tsx`, replace:

```tsx
  it('leaves focus where the person moved it while the answer was on its way', async () => {
```

with:

```tsx
  it("says an organisation or account that is no longer the asker's was refused, and offers no retry", async () => {
    const page: SurfaceContext = { surface: 'organizations', view: 'detail', organization: 7, account: 31, focus: null };
    const cases: [Record<string, string[]>, string][] = [
      [{ account: ['Not an account of this organisation you can open.'] }, 'You can no longer ask about this account. Choose All and ask again.'],
      [{ organization: ['Not an organisation you can open.'] }, 'You can no longer ask about this organization.'],
    ];
    for (const [refuse, message] of cases) {
      const { spy } = stubCopilot({ refuse });
      const { unmount } = renderRail({ context: { kind: 'surface', context: page, label: 'Pizza Hut · EMEA' } });
      await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What changed?{enter}');
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      // The question stays, with its chip.
      expect(screen.getByText('What changed?')).toBeInTheDocument();
      expect(postedBodies(spy)).toHaveLength(1);
      unmount();
    }
  });

  it('leaves focus where the person moved it while the answer was on its way', async () => {
```

In `src/pages/organizations/ask/detailAsk.test.tsx`, replace:

```tsx
    expect(document.querySelector('a[href^="/copilot"]')).toBeNull();
  });
});
```

with:

```tsx
    expect(document.querySelector('a[href^="/copilot"]')).toBeNull();
  });

  it("says so on the rail when the account is no longer the asker's, without retrying", async () => {
    const { copilot } = stubOrganizationPageAsk({ copilot: { refuse: { account: ['Not an account of this organisation you can open.'] } } });
    renderOrganizationPage('/organizations/7?account=31', { ask: true });
    await heading();
    await userEvent.type(composer(), 'What changed?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent('You can no longer ask about this account. Choose All and ask again.');
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/components/copilot/CopilotRail.test.tsx src/pages/organizations/ask/detailAsk.test.tsx`
Expected: FAIL on the two refusal tests. The alert reads "Request failed (400)" (`extractErrorMessage` finds no top-level array), and Retry is offered.

- [ ] **Step 3: Read the refusal**

In `src/components/copilot/useCopilotThread.ts`, replace:

```ts
export interface FailedTurn extends Turn {
  /** A 429: the month's AI budget is spent, so there is nothing to retry. */
  budget: boolean;
  message: string;
}
```

with:

```ts
export interface FailedTurn extends Turn {
  /** A 429: the month's AI budget is spent, so there is nothing to retry. */
  budget: boolean;
  /** A 400 refusing the page itself (an organisation or account the asker
   *  may no longer open): asking again would ask the same, so no retry. */
  refused: boolean;
  message: string;
}
```

In `src/components/copilot/useCopilotThread.ts`, replace:

```ts
export const BUDGET_MESSAGE = "This month's AI budget is used up.";
```

with:

```ts
export const BUDGET_MESSAGE = "This month's AI budget is used up.";

/** What a `400 {"context": {"organization" | "account": [...]}}` means to the
 *  asker (backend delivery 3): the page is no longer theirs to ask about.
 *  Null for any other failure. */
export function refusalMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const context = (err.body as { context?: unknown } | null)?.context;
  if (!context || typeof context !== 'object') return null;
  if ('organization' in context) return 'You can no longer ask about this organization.';
  if ('account' in context) return 'You can no longer ask about this account. Choose All and ask again.';
  return null;
}
```

In `src/components/copilot/useCopilotThread.ts`, replace:

```ts
      const budget = err instanceof ApiError && err.status === 429;
      const message = budget ? BUDGET_MESSAGE : err instanceof ApiError ? err.message : 'The Copilot did not answer.';
      setFailed({ ...turn, budget, message });
```

with:

```ts
      const budget = err instanceof ApiError && err.status === 429;
      const refusal = refusalMessage(err);
      const message = budget
        ? BUDGET_MESSAGE
        : (refusal ?? (err instanceof ApiError ? err.message : 'The Copilot did not answer.'));
      setFailed({ ...turn, budget, refused: refusal !== null, message });
```

In `src/components/copilot/useCopilotThread.ts`, replace:

```ts
  function retry() {
    if (!failed || failed.budget) return;
```

with:

```ts
  function retry() {
    if (!failed || failed.budget || failed.refused) return;
```

In `src/components/copilot/CopilotRail.tsx`, replace:

```tsx
                {failed.budget ? null : (
```

with:

```tsx
                {failed.budget || failed.refused ? null : (
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/copilot src/pages/organizations/ask src/pages/dashboard/ask src/pages/communications`
Expected: PASS, including the existing "shows a 400 as the generic error with Retry" (a 400 without `context.organization`/`account` is unchanged) and Communications' rail.

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/copilot/useCopilotThread.ts src/components/copilot/CopilotRail.tsx src/components/copilot/testCopilot.ts src/components/copilot/CopilotRail.test.tsx src/pages/organizations/ask/detailAsk.test.tsx
git commit -m "feat(copilot): a refused organisation or account shows on the rail, without Retry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The product docs and the glass exception

**Files:**
- Modify: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.claude/skills/revenact-design/SKILL.md`

**Interfaces:**
- Consumes: Tasks 1–6 as built.
- Produces: docs only.

- [ ] **Step 1: App flow**

In `docs/04-app-flow.md`, replace:

```md
6. Ask Revenact on this page is delivery 3 of that spec; there is no Ask link
   here meanwhile.
```

with:

```md
6. Ask Revenact sits beside this page (delivery 3 of that spec): the page is
   a child of `OrganizationsAskLayout`, so one conversation lasts from the List
   into an organisation and back. Each question posts `context:
   {surface:'organizations', view:'detail', organization, account, focus}`:
   `account` is the account chip on Story, People, Deals & risks and Files
   (null for All, for `none`, and on Details and Knowledge), never a name. The
   chip reads "Pizza Hut" or "Pizza Hut · EMEA", from the names the page
   reports to the layout; a sent question shows the server's `label`. "Ask
   about this" on a story item prefills "What should I know about this call?"
   and sets `focus: {kind, id}` for that one question (the send, the chip's ×
   or any change to the URL drops it). A `400` under `context.organization` or
   `context.account` shows "You can no longer ask about this organization." or
   "…this account. Choose All and ask again." on the rail, with no Retry. There
   is no link to `/copilot`.
```

In `docs/04-app-flow.md`, replace:

```md
**Ask Revenact** is on both routes (spec §3). `OrganizationsAskLayout`, a
pathless layout route above the list and the board, draws `OrganizationsFrame`
```

with:

```md
**Ask Revenact** is on both routes (spec §3), and on every organisation's page
(delivery 3, item 6 above). `OrganizationsAskLayout`, a
pathless layout route above the list, the board and `/organizations/:id`,
draws `OrganizationsFrame` (the `bleed` variant on an organisation's page)
```

In `docs/04-app-flow.md`, replace:

```md
there is no `origin_label` field), and reopening one goes to its view with
its filters, then shows the thread.
```

with:

```md
there is no `origin_label` field), and reopening one goes to its view with
its filters, then shows the thread. One started on an organisation's page is
tagged with the server's `label` ("Pizza Hut · EMEA") and reopens
`/organizations/{id}`, with `?account={account}` when it had one.
```

- [ ] **Step 2: UI/UX**

In `docs/03-ui-ux-design.md`, replace:

```md
  the same rail in `OrganizationsFrame`'s `rail` slot, on `/organizations/list`
  and `/organizations/board`. `OrganizationsAskLayout` draws the frame and the
  rail once, above both views; each page's own `OrganizationsFrame` inside it
  passes its content straight through rather than drawing a second frame.
```

with:

```md
  the same rail in `OrganizationsFrame`'s `rail` slot, on `/organizations/list`,
  `/organizations/board` and `/organizations/:id`. `OrganizationsAskLayout`
  draws the frame and the rail once, above all three; each page's own
  `OrganizationsFrame` inside it passes its content straight through rather
  than drawing a second frame. On an organisation's page the layout draws
  the page's `bleed` frame, so with the rail closed the page keeps its full
  width and 24px gutter; with it open the page narrows beside it, and the
  tiles wrap to their column (`@container`, four across from 36rem).
```

In `docs/03-ui-ux-design.md`, replace:

```md
  conversations carry the Network icon and "Organizations" followed by the
  server's own `labels` ("Organizations · Owner: Carl CSM"; there is no
  `origin_label` field), capped at 60% of the row and truncated.
```

with:

```md
  conversations carry the Network icon and "Organizations" followed by the
  server's own `labels` ("Organizations · Owner: Carl CSM"; there is no
  `origin_label` field), or, when started on an organisation's page, the
  server's `label` ("Pizza Hut · EMEA"), capped at 60% of the row and truncated.
```

In `docs/03-ui-ux-design.md`, replace:

```md
The organization's story, framed like the list (transparent top bar with
"‹ Organizations", `OrganizationsFrame`, no rail until Ask arrives in delivery 3).
```

with:

```md
The organization's story, framed like the list (transparent top bar with
"‹ Organizations", `OrganizationsFrame`, and the glass Ask rail beside it,
a sheet on phones). Each story item's meta line ends with a quiet "Ask about
this" (Sparkles, 11px, a 44px target below `sm`).
```

- [ ] **Step 3: The design skill's glass exception**

In `.claude/skills/revenact-design/SKILL.md`, replace:

```md
and on the Organizations list and board (owner's decision of 2026-09-26, spec §3, Ask Revenact on Organizations). On Organizations it is the rail only: rows, cards, tiles, the side panel and the sheets stay solid.
```

with:

```md
and on the Organizations list and board (owner's decision of 2026-09-26, spec §3, Ask Revenact on Organizations) and each organisation's page (spec 2026-09-26-organization-detail-design §3, delivery 3). On Organizations it is the rail only: rows, cards, tiles, story items, the side panel and the sheets stay solid.
```

- [ ] **Step 4: Check the anchors landed**

Run: `grep -c "view:'detail'" docs/04-app-flow.md && grep -c "and \`/organizations/:id\`. \`OrganizationsAskLayout\`" docs/03-ui-ux-design.md && grep -c "each organisation's page (spec 2026-09-26-organization-detail-design" .claude/skills/revenact-design/SKILL.md`
Expected: PASS, printing `1` three times.

- [ ] **Step 5: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .claude/skills/revenact-design/SKILL.md
git commit -m "docs(organizations): Ask Revenact on the organisation page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none changed, unless a check fails. A failure is fixed in the task that owns it, and then this task is run again from Step 1.

- [ ] **Step 1: The whole suite, as one process**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS. Every file passes, including `src/components/organizations/detail/houseRules.test.ts`, `src/components/organizations/detail/alignment.test.tsx` and `src/e2e/organizationDetail.test.tsx`. Record the file and test counts. The branch before this plan had 297 test files; this plan adds 6 (303 in the dry run, 2,564 tests).

- [ ] **Step 2: Types**

Run: `npx tsc -b`
Expected: PASS (no output).

- [ ] **Step 3: Lint**

Run: `npx eslint .`
Expected: `0 errors`. The 16 warnings that are already on the branch are in files this plan does not touch (`ContactFormModal`, `OpportunityFormModal`, `RiskFormModal`, `SurveyFormModal`, `CampaignsList`, `CommunicationsPage`, `CockpitView`, `copilot/Index`, `Profile`, `EditNodePane`, `ScenariosList`). None may be in a file this plan changed.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS (`tsc -b && vite build`, ending with `✓ built in …`).

- [ ] **Step 5: Report**

Use superpowers:verification-before-completion. Report the four results with their numbers. Do not open the PR until the backend PR for delivery 3 has merged and production accepts `view: "detail"` (spec §4).

---

### Task 9: Controller browser check

The controller does this, not a subagent. It needs the app and the delivery 3 backend running locally (`npm run dev` here, the backend worktree's `runserver`), signed in as a user who can open Pizza Hut (or any organisation with at least one account and story items). Use the claude-in-chrome tools. Check each point at 1440×900 and 375×812, in light and dark themes, and take a screenshot of each.

- [ ] **Step 1: Placement, rail closed.** Open `/organizations/{id}` with the rail hidden (✦ off). The page spans the width with the 24px gutter, exactly as before this branch: compare with the same URL on the branch base. There is one frame and no second gutter.
- [ ] **Step 2: Placement, rail open.** Turn ✦ on at 1440. The glass rail (320px) sits to the right, and the page narrows beside it with no horizontal scroll. At 1024 wide with the rail open, the tiles show two across. Nothing else on the page is glass.
- [ ] **Step 3: The chip.** With All chosen, the chip reads the organisation's name. Choose an account chip: it reads "Name · Account". Open Details: it reads the name alone.
- [ ] **Step 4: Ask.** Send a question on an account chip. The answer arrives. The question's chip shows the server's label. In the network panel, the POST body's `context` is `{surface, view: "detail", organization, account, focus: null}`.
- [ ] **Step 5: Ask about this.** On the Story tab, press "Ask about this" on a call. The rail opens with "What should I know about this call?" and the chip "… · This call". Send it: the POST carries `focus: {kind: "call", id}`, and the next question carries `focus: null`.
- [ ] **Step 6: One conversation.** From `/organizations/list`, ask a question, open the organisation, ask again, then go Back. The same thread shows in all three places.
- [ ] **Step 7: History.** Open History: the conversation is tagged "Name · Account". Go to the Dashboard, open History and pick it. You land on `/organizations/{id}?account={account}` with the thread showing.
- [ ] **Step 8: Phones.** At 375, ✦ opens the full-screen sheet. "Ask about this" opens the sheet prefilled, with a 44px target. The sheet closes with Close and with Escape. There is no horizontal scroll with the sheet closed or open.
- [ ] **Step 9: Refusal.** In a second browser, sign in as a user who cannot open that account (or remove the grant). Ask with the account chip selected. The rail says "You can no longer ask about this account. Choose All and ask again." and offers no Retry.
- [ ] **Step 10: Themes.** Repeat Steps 2, 5 and 8 in the other theme. Check that the rail's glass and the "Ask about this" colours come from tokens in both themes.

## Self-review

**Spec coverage.**

| Requirement | Where |
|---|---|
| §3 the ✦ pill and the glass rail beside the page, joining `OrganizationsAskLayout` | Task 2 (route, layout, `bleed`), tests "keeps the page's full width…" and "puts the glass rail…"; Task 9 Steps 1–2 |
| One conversation from the List into the organisation and back | Task 2 test "keeps one conversation…"; Task 9 Step 6 |
| Full width and alignment with the rail closed; reflow when open | Task 2 (frame classes), Task 3 (tiles `@container`); `alignment.test.tsx` unchanged; Task 9 Steps 1–2 |
| Phones: a sheet | Task 3 test "opens as a full-screen sheet…"; Task 4 "opens the sheet on phones, prefilled"; Task 9 Step 8 |
| "Ask Copilot" link to `/copilot` removed | Pre-flight 8; Task 3 test "never links to the old Copilot page" |
| Context `{surface, view: "detail", organization, account?, focus}` | Task 1 (types, `detailContext`), Task 2 (hook, send test) |
| Chip "Pizza Hut" / "Pizza Hut · EMEA", following `?account=` | Task 1 (`detailLabel`), Task 2 (names, chip test); Task 9 Step 3 |
| "Ask about this" as a focus lasting one question | Task 1 (`StoryFocus`, `withFocus`), Task 4; Task 9 Step 5 |
| History tag from server labels; restore `/organizations/{id}?account=…` | Task 1 (`originTag`, `detailPath`), Task 5; Task 9 Step 7 |
| Backend 400 for an invisible organisation/account shown on the rail | Task 6; Task 9 Step 9 |
| House rules and alignment suites green | Tasks 3, 4 and 8 |
| Docs updated in the same PR | Task 7 |

**Placeholder scan.** Every code step gives the complete code, or an exact replace with a unique anchor. Every run step gives its command and what it should print.

**Type consistency.**
- `StoryFocus`, `AskFocus`, `OrganizationDetailContext` and `OrganizationDetailOrigin` are defined in Task 1 and used unchanged in Tasks 2, 4 and 6.
- `DetailNames {organization, name, accounts}` is defined in Task 1, reported in Task 2 (`useReportDetailNames`), and read by `surfaceLabel(…, { detail })`.
- `detailContext(organization, params)` (Task 1) is the only place the account rule lives. `useOrganizationsContext` (Task 2) calls it.
- `AskDraftContext`'s function is `(question: string, focus: AskFocus) => void`, which matches `AskState.draft` (Task 1) and its caller in `StoryItemRow` (Task 4).
- `stubCopilot`'s `label` (Task 2) and `refuse` (Task 6), `stubOrganizationPageAsk` and `renderOrganizationPage(…, { ask })` (Task 2) are used with the same names in Tasks 3–6.
