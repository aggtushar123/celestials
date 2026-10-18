# Ask Revenact on Accounts (frontend, delivery 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the ✦ Ask rail and pill on `/accounts/list`, `/accounts/board` and `/accounts/:id`. There is one conversation across all three. Questions carry the list's filters or the open account, "Ask about this" on a story item narrows one question to that item, the rail is a sheet on phones, and History reopens an Accounts conversation where it was asked.

**Architecture:** Accounts becomes the fourth Ask surface, beside the Dashboard, Organizations and Contacts. It reuses the shared pieces with no change to how they behave:
- `AskProvider` holds the conversation, the open state, the focus and the prefilled draft.
- `AskRail` draws the rail and the phone sheet, `AskControls` draws the pill, and `CopilotRail` draws History.
- A pure module, `src/features/accounts/askContext.ts`, builds the context, the live chip and the restore path.
- `AccountsAskLayout` is a layout route above the three Accounts routes, as `OrganizationsAskLayout` is for Organizations. It draws `OrganizationsFrame` once, with `AskRail` in its `rail` slot. The frame uses the `bleed` variant on an account's page. The pages' own `OrganizationsFrame` inside it passes straight through. The List, the Board and the account page already wear that frame.
- "Ask about this" is already built into `StoryItemRow`: it renders whenever an `AskDraftContext` is present. Putting the account page under the layout turns it on. This plan adds only the accounts branch of `withFocus` and the tests.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-accounts-redesign-design.md` §3 (Ask Revenact on Accounts, delivery 3), frontend bullet. The backend contract is `revenact-backend` branch `feat/accounts-ask`:
- `docs/API_CONTRACTS.md`, "Asked from Accounts" and the `GET /copilot/conversations/` origin examples
- `services/copilot/accounts_context.py`

Read a file with `git -C ../revenact-backend show feat/accounts-ask:<path>` if that checkout has moved.

## Global Constraints

- **Backend contract** (`feat/accounts-ask`). `POST /api/v1/copilot/messages/` takes one of two `context` shapes:
  - **List or Board:** `{"surface": "accounts", "view": "list" | "board", "filters": {...}}`.
    - `filters` holds the portfolio's own URL keys: `search`, `organisation`, `owner`, `lifecycle`, `health`, `renews_within`, `nps`, `ids`, `sort`, `group`.
    - Send only the set keys. The default sort (`-arr`) is left out.
    - `group` is sent only when it differs from the view's default (the List's `health`, the Board's `lifecycle`). `group: ""` means "not grouped" (the URL spells it `group=none`).
    - `focus` is ignored on these views: the server drops it unvalidated. The client never sends one here.
  - **One account:** `{"surface": "accounts", "view": "detail", "account": <id>, "focus": {"kind", "id"} | null}`.
    - `focus.kind` is a story kind: `activity`, `calendar_event`, `call`, `email`, `note`, `survey`, `task`, `ticket` or `health`.
  - **Labels:** the server ignores a client `label`. It builds its own and stores it on the context and the origin:
    - on the List and the Board, "Accounts · Owner: Carl CSM · Health: Poor"
    - on an account's page, the account's own name ("EMEA")
  - **Origin:** the stored context without `focus`: `{surface, view, filters, label}` or `{surface, view: "detail", account, label}`. History's tag is `label` itself.
  - **Refusals** read the same whether the record exists or not:
    - `400 {"context": {"filters": {"organisation": ["Not an organisation you can open."]}}}`
    - `400 {"context": {"account": ["Not an account you can open."]}}`
    - `400 {"context": {"focus": ["Not a story item you can open."]}}`. Unlike the organisation page, which drops such an item silently, the account page refuses the send outright.
  - Metered as purpose `accounts` ("Ask Revenact on Accounts"). A `429` reads the existing budget message.
- **Spec §3, frontend:**
  - `AccountsAskLayout` wraps the three routes (the List, the Board and the account page) with one `AskProvider`, using the shared `AskRail`, pill and sheet.
  - History reopens `/accounts?<filters>`, `/accounts/board?<filters>` or `/accounts/:id`. See Decision 1 for the list path.
  - "Ask about this" on a story item sets the focus.
  - There is one conversation across all three routes.
- **Privacy:**
  - The client never names anything from data the viewer cannot see. A live chip, before the server has labelled it, uses only what the viewer's own page loaded: the portfolio's `filters` options and the account row's name. Anything else reads as a placeholder ("This account", "User 9"), never as a guessed name.
  - A sent question shows the server's `label` once it comes back.
- **House rules** (`.claude/skills/revenact-design/SKILL.md` §1 and §4):
  - Tokens only, no raw colours.
  - Lucide icons, `aria-hidden` when they sit beside text.
  - Glass on the Ask rail only. Rows, cards, tiles, story items, side panel and sheets stay solid. Spec 2026-09-26 §3 already made this exception for the Organizations rail; Accounts wears that same frame and rail.
  - 44px targets below `sm`.
  - Sentence-case copy, both themes, no new motion.
- **Tests** follow the `testing` skill:
  - unit tests for the pure module and each surface branch
  - integration tests through the real store, router, layout, rail and pages, with `fetch` stubbed in contract shapes
  - an end-to-end journey in jsdom
  - the house-rules suite, extended to the new layout file
- Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time. Add no new dependencies.
- **Branch:** `feat/accounts-ask` in `react-ts-app`, stacked on `feat/account-page` (frontend #94). Stay on it.
  - Merge order: backend #75 → frontend #94 → backend Ask PR (`feat/accounts-ask`) → this PR. The PR's base is `feat/account-page` until #94 merges; after that, rebase onto `main`.
  - Commits are conventional (`feat(accounts): …`, `test(accounts): …`, `docs(accounts): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` and `.agents/workflows/repo-architecture.md`.

## Decisions this plan makes where the spec is silent

1. **History reopens the List at `/accounts/list?<filters>`, not `/accounts?<filters>`.**
   - `App.tsx` routes `/accounts` to `<Navigate to="list" replace />`, and that redirect drops the query string. A restore through it would lose every filter.
   - `/accounts/list` is the List's own URL, the one the Navbar's List tab links to. The spec's "`/accounts?<filters>`" means the List route, as the brief says.
2. **Accounts keeps its own rail preference, `revenact_accounts_ask`.**
   - Hiding the rail on Accounts says nothing about Organizations, and the reverse, as Contacts already decided for itself.
   - The rule is otherwise the shared one: a rail beside the page from `sm`, open by default from `xl`, the person's own choice wins, and a sheet below `sm`.
3. **No focus on the List or the Board.**
   - On Organizations, opening a row or card narrows the next question (`useAskFocusOnOpen`). The Accounts backend drops `focus` on these views unvalidated, so a "1 account" chip would promise something the answer ignores.
   - Opening a row or card on Accounts changes nothing in the rail. The only Accounts focus is "Ask about this" on the account page.
4. **The live chip, before the server has labelled a question, uses the page's own words.**
   - **List and Board:** "Accounts", then the page's filter chips (`filterChips` with the options that page's portfolio read reported), for example "Accounts · Owner: Carl CSM · Organization: Pizza Hut". The spelling is the toolbar chips' ("Organization:", "Search: x", "Opened from the dashboard (N)"), which can differ slightly from the server's ("Organisation:", `Search: "x"`, "Chosen accounts (N)"). Organizations made the same choice.
   - **Account page:** the name of the row the page loaded, or "This account" until it lands. It never shows an id.
   - A stored context's `label` always wins, and so does an origin's. The focus part (" · This email") is always named from `focus`, because it is never stored in `label`.
5. **The refusal copy for Accounts.** `refusalMessage` takes the turn's context (optional), so the same `account` key can read differently per surface:
   - `account` → "You can no longer ask about this account."
   - `focus` → "You can no longer ask about this item. Ask about the account instead."
   - `filters` → the existing "You can't ask about this list. Clear the filters and ask again."
   - All three are refusals, so there is no Retry. The organisation page keeps its own "Choose All and ask again".
6. **The account page's context is its id alone.**
   - It is null for a non-numeric id. That page shows "Account not found", and the rail has no chip, exactly as on `/organizations/abc`.
   - A numeric id the viewer cannot open still carries its id. The server's 400 answers it with the refusal above. The chip then reads "This account" because no row ever landed.
   - A tab switch or story filter never rebuilds the context. A story filter change (a URL change) still drops a pending focus and an untouched prefill, by `AskProvider`'s shared rule.
7. **History's icon for Accounts** is `Layers`, the sidebar's Accounts icon, with "Started on " for screen readers.
8. **The frame.** `AccountsAskLayout` reuses `OrganizationsFrame`, with `bleed` on an account's page and `scrollKey` per page, rather than a new frame. The three pages already render inside it, and `DashboardLayout` and `Navbar` already frame `/accounts/*` for it, including the actions slot the pill portals into.

## File structure

| File | Responsibility |
|---|---|
| `src/pages/copilot/types.ts` | `AccountsFilters`, `AccountsListContext`, `AccountDetailContext`, `AccountsListOrigin`, `AccountDetailOrigin` (Task 1). They join `SurfaceContext` and `SurfaceOrigin` in Task 2. |
| `src/features/accounts/askContext.ts` (new) | `accountsViewOf`, `accountIdOf`, `toAccountsFilters`, `fromAccountsFilters`, `accountsContextOf`, `AccountsNames`, `NO_ACCOUNTS_NAMES`, `accountsLabel`, `accountsPath` |
| `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts` (`withFocus`), `src/components/copilot/useCopilotThread.ts` (`refusalMessage`), `src/components/copilot/CopilotRail.tsx` (History tag), `src/pages/dashboard/ask/askPreference.ts` | The accounts branch in each function keyed by surface, plus `ACCOUNTS_ASK_KEY` |
| `src/pages/accounts/ask/AccountsAskLayout.tsx`, `accountsNames.ts`, `useAccountsContext.ts` (new) | The layout route, the names the pages report, and the context read from the route |
| `src/App.tsx` | The layout route around `accounts/list`, `accounts/board` and `accounts/:id` |
| `src/pages/accounts/List.tsx`, `Board.tsx`, `Details.tsx` | Report the filter options or the account name. The comments that said "delivery 3" are updated. |
| `src/components/layout/Navbar.tsx` | A comment only: the pill has landed |
| `src/pages/accounts/testList.tsx` | `renderAccounts(url, {ask})`, and `url` may carry navigation state |
| `src/pages/accounts/ask/testAccountsAsk.ts` (new, test only) | `stubAccountsAsk`: the portfolio, the account page and the Copilot behind one `fetch` |
| `src/components/copilot/testCopilot.ts` | `refuse` accepts a nested body (`{filters: {organisation: [...]}}`) |
| `src/e2e/accountsAsk.test.tsx` (new) | The end-to-end journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

---

### Task 1: The contract types and the pure Accounts Ask module

**Files:**
- Modify: `src/pages/copilot/types.ts`. Add the five types after `ContactsPersonOrigin`. Do not touch the unions yet.
- Create: `src/features/accounts/askContext.ts`
- Test: `src/features/accounts/askContext.test.ts`

**Interfaces:**
- Consumes (existing):
  - `parseParams(search, defaultGroup, spec)`, `toUrlSearch(p, defaultGroup)`, `boardParams(p)`, `PortfolioParams` from `features/organizations/portfolioParams`
  - `defaultGroupOf(view)` from `features/organizations/askContext`
  - `filterChips(p, options)` from `features/organizations/filterChips`
  - `storyFocusLabel(focus)` from `features/organizations/detailAskContext`
  - `ACCOUNT_PARAMS` from `features/accounts/portfolioParams`
  - `parseAccountId(raw)` from `features/accounts/accountPageParams`
  - `AccountFilterOptions` from `features/accounts/portfolioTypes`
- Produces:
  - `type AccountsView = OrganizationsView | 'detail'`
  - `accountsViewOf(pathname: string): AccountsView | null`
  - `accountIdOf(pathname: string): number | null`
  - `toAccountsFilters(p: PortfolioParams, view: OrganizationsView): AccountsFilters`
  - `fromAccountsFilters(filters: AccountsFilters, view: OrganizationsView): PortfolioParams`
  - `accountsContextOf(pathname: string, search: string): AccountsListContext | AccountDetailContext | null`
  - `interface AccountsNames { options: AccountFilterOptions | null; account: { id: number; name: string } | null }` and `NO_ACCOUNTS_NAMES`
  - `accountsLabel(context: AccountsListContext | AccountDetailContext, names?: AccountsNames | null): string`
  - `accountsPath(origin: AccountsListOrigin | AccountDetailOrigin): string`

- [ ] **Step 1: Add the types** to `src/pages/copilot/types.ts`, directly after `ContactsPersonOrigin`:

```ts
/** The Accounts portfolio's URL filters as a question carries them (backend
 *  `accounts_context.FILTER_KEYS`): only the set keys, in the page's own URL
 *  spelling. `sort` only when it is not the default; `group` only when it
 *  differs from the view's default, or `''` for the List's "None". */
export interface AccountsFilters {
  search?: string;
  organisation?: string;
  owner?: string;
  lifecycle?: string;
  health?: string;
  renews_within?: string;
  nps?: string;
  ids?: string;
  sort?: string;
  group?: string;
}

/** A question asked on the Accounts List or Board (spec 2026-09-29 §3). No
 *  focus: the server drops one on these views. The server builds `label`
 *  ("Accounts · Owner: Carl CSM") and echoes it on a stored context. */
export interface AccountsListContext {
  surface: 'accounts';
  view: OrganizationsView;
  filters: AccountsFilters;
  label?: string;
}

/** A question asked on one account's page. `focus` is "Ask about this" on a
 *  story item; the server refuses (400) an item the asker cannot open. The
 *  server builds `label` (the account's name). */
export interface AccountDetailContext {
  surface: 'accounts';
  view: 'detail';
  account: number;
  focus: StoryFocus | null;
  label?: string;
}

export interface AccountsListOrigin {
  surface: 'accounts';
  view: OrganizationsView;
  filters: AccountsFilters;
  label: string;
}

export interface AccountDetailOrigin {
  surface: 'accounts';
  view: 'detail';
  account: number;
  label: string;
}
```

- [ ] **Step 2: Write the failing test** `src/features/accounts/askContext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  accountsContextOf,
  accountsLabel,
  accountsPath,
  accountsViewOf,
  fromAccountsFilters,
} from './askContext';
import { ACCOUNT_FILTER_OPTIONS } from './testPortfolio';

const names = { options: ACCOUNT_FILTER_OPTIONS, account: { id: 12, name: 'Pizza EMEA' } };
const list = (search: string) => accountsContextOf('/accounts/list', search);
const board = (search: string) => accountsContextOf('/accounts/board', search);

describe('accountsViewOf / accountIdOf', () => {
  it('reads the List, the Board and one account from the path', () => {
    expect(accountsViewOf('/accounts/list')).toBe('list');
    expect(accountsViewOf('/accounts/board/')).toBe('board');
    expect(accountsViewOf('/accounts/12')).toBe('detail');
    expect(accountsViewOf('/accounts/abc')).toBe('detail');
    expect(accountsViewOf('/accounts')).toBeNull();
    expect(accountsViewOf('/accounts/12/notes')).toBeNull();
    expect(accountsViewOf('/organizations/list')).toBeNull();
    expect(accountIdOf('/accounts/12')).toBe(12);
    expect(accountIdOf('/accounts/12/')).toBe(12);
    expect(accountIdOf('/accounts/012')).toBeNull();
    expect(accountIdOf('/accounts/abc')).toBeNull();
    expect(accountIdOf('/accounts/list')).toBeNull();
  });
});

describe('accountsContextOf', () => {
  it("sends the List's set filters only, in the URL's own spelling", () => {
    expect(list('?owner=2&health=poor')).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2', health: 'poor' } });
    expect(list('?organisation=7,9&sort=risk&renews_within=30')).toEqual({
      surface: 'accounts',
      view: 'list',
      filters: { organisation: '7,9', sort: 'risk', renews_within: '30' },
    });
    expect(list('')).toEqual({ surface: 'accounts', view: 'list', filters: {} });
  });

  it("drops what the Accounts portfolio doesn't read, and the default sort", () => {
    expect(list('?product=3&include_churned=1&sort=-arr&cursor=abc&owner=bob')).toMatchObject({ filters: {} });
  });

  it("sends group only when it isn't the view's default, and '' for the List's None", () => {
    expect(list('?group=health')).toMatchObject({ filters: {} });
    expect(list('?group=lifecycle')).toMatchObject({ filters: { group: 'lifecycle' } });
    expect(list('?group=none')).toMatchObject({ filters: { group: '' } });
    expect(list('?group=product')).toMatchObject({ filters: {} });
    expect(board('?group=lifecycle')).toEqual({ surface: 'accounts', view: 'board', filters: {} });
    // A board always has columns: the List's None reads as lifecycle there.
    expect(board('?group=none')).toMatchObject({ filters: {} });
    expect(board('?group=owner&owner=2')).toMatchObject({ filters: { group: 'owner', owner: '2' } });
  });

  it("carries one account's id alone, never its tab or story filters", () => {
    expect(accountsContextOf('/accounts/12', '?tab=details&kinds=email')).toEqual({
      surface: 'accounts',
      view: 'detail',
      account: 12,
      focus: null,
    });
    expect(accountsContextOf('/accounts/abc', '')).toBeNull();
    expect(accountsContextOf('/contacts', '')).toBeNull();
  });

  it('round-trips through fromAccountsFilters', () => {
    const params = fromAccountsFilters({ owner: '2', organisation: '7', group: '' }, 'list');
    expect(params).toMatchObject({ owner: '2', organisation: ['7'], group: '' });
    expect(fromAccountsFilters({}, 'board').group).toBe('lifecycle');
  });
});

describe('accountsLabel', () => {
  it("names a live List or Board question from the page's own filter options", () => {
    const context = { surface: 'accounts', view: 'list', filters: { owner: '2', organisation: '7', health: 'poor' } } as const;
    expect(accountsLabel(context, names)).toBe('Accounts · Owner: Carl CSM · Organization: Pizza Hut · Health: Poor');
    // Before the page has reported options, nothing is guessed.
    expect(accountsLabel(context)).toBe('Accounts · Owner: User 2 · Organization: Organization 7 · Health: Poor');
    expect(accountsLabel({ surface: 'accounts', view: 'board', filters: {} }, names)).toBe('Accounts');
  });

  it("shows the server's label once stored", () => {
    expect(
      accountsLabel({ surface: 'accounts', view: 'board', filters: { owner: '2' }, label: 'Accounts · Owner: Carl CSM' }, null),
    ).toBe('Accounts · Owner: Carl CSM');
    expect(accountsLabel({ surface: 'accounts', view: 'detail', account: 12, focus: null, label: 'EMEA' }, names)).toBe('EMEA');
  });

  it('names an account from the row the page loaded, else "This account", then the focus', () => {
    const page = { surface: 'accounts', view: 'detail', account: 12, focus: null } as const;
    expect(accountsLabel(page, names)).toBe('Pizza EMEA');
    expect(accountsLabel({ ...page, account: 13 }, names)).toBe('This account');
    expect(accountsLabel(page)).toBe('This account');
    expect(accountsLabel({ ...page, focus: { kind: 'email', id: 141 } }, names)).toBe('Pizza EMEA · This email');
    expect(accountsLabel({ ...page, focus: { kind: 'call', id: 112 }, label: 'EMEA' })).toBe('EMEA · This call');
  });
});

describe('accountsPath', () => {
  it('reopens the List or the Board with its filters, or the account', () => {
    expect(accountsPath({ surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'x' })).toBe(
      '/accounts/board?renews_within=30',
    );
    expect(accountsPath({ surface: 'accounts', view: 'list', filters: { owner: '2', group: '' }, label: 'x' })).toBe(
      '/accounts/list?owner=2&group=none',
    );
    expect(accountsPath({ surface: 'accounts', view: 'list', filters: {}, label: 'Accounts' })).toBe('/accounts/list');
    expect(accountsPath({ surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' })).toBe('/accounts/12');
  });

  it('restores exactly the page a context was built from', () => {
    for (const search of ['?owner=2&group=none', '?organisation=7&sort=risk', '']) {
      const context = list(search)!;
      if (context.view === 'detail') throw new Error('not a list');
      const path = accountsPath({ ...context, label: 'x' });
      const again = accountsContextOf('/accounts/list', path.split('?')[1] ?? '');
      expect(again).toEqual(context);
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/accounts/askContext.test.ts`
Expected: FAIL, "Failed to resolve import './askContext'".

- [ ] **Step 4: Write the module** `src/features/accounts/askContext.ts`:

```ts
import type {
  AccountDetailContext,
  AccountDetailOrigin,
  AccountsFilters,
  AccountsListContext,
  AccountsListOrigin,
  OrganizationsView,
} from '../../pages/copilot/types';
import { defaultGroupOf } from '../organizations/askContext';
import { storyFocusLabel } from '../organizations/detailAskContext';
import { filterChips } from '../organizations/filterChips';
import { boardParams, parseParams, toUrlSearch, type PortfolioParams } from '../organizations/portfolioParams';
import { parseAccountId } from './accountPageParams';
import { ACCOUNT_PARAMS } from './portfolioParams';
import type { AccountFilterOptions } from './portfolioTypes';

// Ask Revenact on Accounts (spec 2026-09-29 §3): the context a question
// carries, its live chip, and the page a History pick reopens.

const SEPARATOR = ' · ';
const LIST = /^\/accounts\/list\/?$/;
const BOARD = /^\/accounts\/board\/?$/;
const ONE = /^\/accounts\/([^/]+)\/?$/;

export type AccountsView = OrganizationsView | 'detail';

/** Which Accounts page a path shows. Any other single segment is an
 *  account's page, as the router reads `/accounts/:id` (a non-numeric one
 *  shows "Account not found" there). Null off these routes. */
export function accountsViewOf(pathname: string): AccountsView | null {
  if (LIST.test(pathname)) return 'list';
  if (BOARD.test(pathname)) return 'board';
  return ONE.test(pathname) ? 'detail' : null;
}

/** `/accounts/12` gives 12; a non-numeric id, or any other path, null. The
 *  page reads its id with the same rule (`parseAccountId`). */
export function accountIdOf(pathname: string): number | null {
  if (accountsViewOf(pathname) !== 'detail') return null;
  return parseAccountId(ONE.exec(pathname)![1]);
}

/** The params as a question carries them: the page's own URL query, so only
 *  the set keys, the default sort and the view's own default group left out.
 *  The URL's `group=none` is sent as `''`. The Board reads the List's None
 *  as lifecycle, its default, so it never sends `''`. */
export function toAccountsFilters(p: PortfolioParams, view: OrganizationsView): AccountsFilters {
  const shown = view === 'board' ? boardParams(p) : p;
  const filters: AccountsFilters = Object.fromEntries(toUrlSearch(shown, defaultGroupOf(view)));
  if (filters.group === 'none') filters.group = '';
  return filters;
}

/** Filters back to params, through the page's own parser, so a value the page
 *  would not read is dropped the same way. */
export function fromAccountsFilters(filters: AccountsFilters, view: OrganizationsView): PortfolioParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  if (filters.group === '') search.set('group', 'none');
  return parseParams(search, defaultGroupOf(view), ACCOUNT_PARAMS);
}

/** Where the person is on Accounts, as the server needs it: the view and its
 *  filters, or one account's id. Never a name or a figure: the server
 *  recomputes the page. Null off these routes and on a non-numeric id. */
export function accountsContextOf(pathname: string, search: string): AccountsListContext | AccountDetailContext | null {
  const view = accountsViewOf(pathname);
  if (view === null) return null;
  if (view === 'detail') {
    const account = accountIdOf(pathname);
    return account === null ? null : { surface: 'accounts', view, account, focus: null };
  }
  const params = parseParams(new URLSearchParams(search), defaultGroupOf(view), ACCOUNT_PARAMS);
  return { surface: 'accounts', view, filters: toAccountsFilters(params, view) };
}

/** What the pages report, so a live question's chip can name things before
 *  the server has: the List's or Board's filter options (from the viewer's
 *  own portfolio read) and the open account's name (from its own row). */
export interface AccountsNames {
  options: AccountFilterOptions | null;
  account: { id: number; name: string } | null;
}

export const NO_ACCOUNTS_NAMES: AccountsNames = { options: null, account: null };

/** The chip. A stored context's `label` is the server's and wins. A live one
 *  uses the page's own words: "Accounts" and the toolbar's filter chips, or
 *  the account row's name ("This account" until it lands). The focus is
 *  never in `label`, so it is always named from `focus`. */
export function accountsLabel(context: AccountsListContext | AccountDetailContext, names: AccountsNames | null = null): string {
  if (context.view !== 'detail') {
    if (context.label) return context.label;
    const chips = filterChips(fromAccountsFilters(context.filters, context.view), names?.options ?? null);
    return ['Accounts', ...chips.map((chip) => chip.label)].join(SEPARATOR);
  }
  const named = names?.account?.id === context.account ? names.account.name : null;
  const base = context.label ?? named ?? 'This account';
  return context.focus ? `${base}${SEPARATOR}${storyFocusLabel(context.focus)}` : base;
}

/** Where a conversation started on Accounts reopens. The List is
 *  `/accounts/list`, not `/accounts`, whose redirect drops the query. The
 *  stored "None" (`group: ''`) is the URL's `group=none`. */
export function accountsPath(origin: AccountsListOrigin | AccountDetailOrigin): string {
  if (origin.view === 'detail') return `/accounts/${origin.account}`;
  const filters = origin.filters.group === '' ? { ...origin.filters, group: 'none' } : origin.filters;
  const query = new URLSearchParams(filters as Record<string, string>).toString();
  return query ? `/accounts/${origin.view}?${query}` : `/accounts/${origin.view}`;
}
```

- [ ] **Step 5: Run the test and the type-check**

Run: `npx vitest run --maxWorkers=2 src/features/accounts/askContext.test.ts`. Expected: PASS.

Run: `npx tsc -b`. Expected: exit 0. The new types are not in the unions yet, so no other file changes.

If the round-trip case fails on key order, note that `toEqual` ignores key order. A real difference in the filters is a bug in `toAccountsFilters`: fix it there, not in the test.

- [ ] **Step 6: Commit**

```bash
git add src/pages/copilot/types.ts src/features/accounts/askContext.ts src/features/accounts/askContext.test.ts
git commit -m "feat(accounts): the Accounts Ask context, live chip and restore path

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The Accounts branch in every function keyed by surface

**Files:**
- Modify: `src/pages/copilot/types.ts`. Add the Accounts types to `SurfaceContext` and `SurfaceOrigin`, and update the doc comments that list the surfaces.
- Modify: `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts`, `src/pages/dashboard/ask/askPreference.ts`, `src/components/copilot/useCopilotThread.ts`, `src/components/copilot/CopilotRail.tsx`
- Test: `src/components/copilot/surfaceLabels.test.ts`, `src/pages/dashboard/ask/originPath.test.ts`, `src/pages/dashboard/ask/context.test.ts`, `src/components/copilot/useCopilotThread.test.tsx`, `src/components/copilot/HistoryPopover.test.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `SurfaceNames.accounts?: AccountsNames | null`
  - `surfaceLabel(context, { accounts })`
  - `originTag` and `originPath` for Accounts origins
  - `withFocus` for Accounts contexts
  - `ACCOUNTS_ASK_KEY = 'revenact_accounts_ask'`
  - `refusalMessage(err: unknown, context?: SurfaceContext | null): string | null`

- [ ] **Step 1: Write the failing tests.** Append each block to the `describe` it names.

`src/components/copilot/surfaceLabels.test.ts`: add `import { ACCOUNT_FILTER_OPTIONS } from '../../features/accounts/testPortfolio';` at the top, then:

```ts
  it('labels an Accounts question from the page, and tags an Accounts conversation with the server label', () => {
    const accounts = { options: ACCOUNT_FILTER_OPTIONS, account: { id: 12, name: 'Pizza EMEA' } };
    expect(surfaceLabel({ surface: 'accounts', view: 'board', filters: { owner: '2' } }, { accounts })).toBe('Accounts · Owner: Carl CSM');
    expect(surfaceLabel({ surface: 'accounts', view: 'detail', account: 12, focus: { kind: 'call', id: 112 } }, { accounts })).toBe(
      'Pizza EMEA · This call',
    );
    expect(surfaceLabel({ surface: 'accounts', view: 'detail', account: 12, focus: null, label: 'EMEA' })).toBe('EMEA');
    expect(
      originTag({ origin: { surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'Accounts · Renews within 30 days' } }),
    ).toBe('Accounts · Renews within 30 days');
    expect(originTag({ origin: { surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' } })).toBe('EMEA');
  });
```

`src/pages/dashboard/ask/originPath.test.ts`:

```ts
  it('reopens an Accounts conversation on its List, Board or account', () => {
    expect(originPath({ surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'x' })).toBe(
      '/accounts/board?renews_within=30',
    );
    expect(originPath({ surface: 'accounts', view: 'list', filters: {}, label: 'Accounts' })).toBe('/accounts/list');
    expect(originPath({ surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' })).toBe('/accounts/12');
  });
```

`src/pages/dashboard/ask/context.test.ts`:

```ts
  it("gives an account's page only a story focus, and the Accounts List and Board none", () => {
    const page = { surface: 'accounts', view: 'detail', account: 12, focus: null } as const;
    const list = { surface: 'accounts', view: 'list', filters: { owner: '2' } } as const;
    expect(withFocus(page, { kind: 'email', id: 141 })).toEqual({ ...page, focus: { kind: 'email', id: 141 } });
    expect(withFocus(page, { kind: 'companies', ids: [12] })).toEqual(page);
    expect(withFocus(page, { kind: 'sentiment' })).toEqual(page);
    // The server drops a focus on these views: the client never sends one.
    expect(withFocus(list, { kind: 'companies', ids: [12] })).toEqual(list);
    expect(withFocus(list, { kind: 'email', id: 141 })).not.toHaveProperty('focus');
  });
```

`src/components/copilot/useCopilotThread.test.tsx`, inside `describe('refusalMessage')`:

```ts
  it('reads an Accounts refusal by the context it was asked in', () => {
    const page = { surface: 'accounts', view: 'detail', account: 12, focus: { kind: 'email', id: 141 } } as const;
    const list = { surface: 'accounts', view: 'list', filters: { organisation: '9' } } as const;
    const bad = (context: unknown) => new ApiError(400, { context }, 'Bad');
    expect(refusalMessage(bad({ account: ['Not an account you can open.'] }), page)).toBe('You can no longer ask about this account.');
    expect(refusalMessage(bad({ focus: ['Not a story item you can open.'] }), page)).toBe(
      'You can no longer ask about this item. Ask about the account instead.',
    );
    expect(refusalMessage(bad({ filters: { organisation: ['Not an organisation you can open.'] } }), list)).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
    expect(refusalMessage(new ApiError(500, {}, 'Oops'), page)).toBeNull();
  });

  it("keeps the organisation page's own account refusal, and a Dashboard focus 400 is no refusal", () => {
    const org = { surface: 'organizations', view: 'detail', organization: 7, account: 31, focus: null } as const;
    expect(refusalMessage(new ApiError(400, { context: { account: ['x'] } }, 'Bad'), org)).toBe(
      'You can no longer ask about this account. Choose All and ask again.',
    );
    expect(refusalMessage(new ApiError(400, { context: { account: ['x'] } }, 'Bad'))).toBe(
      'You can no longer ask about this account. Choose All and ask again.',
    );
    expect(refusalMessage(new ApiError(400, { context: { focus: { key: ['Not an item on your list.'] } } }, 'Bad'))).toBeNull();
  });
```

`src/components/copilot/HistoryPopover.test.tsx`:

```ts
  it("tags a conversation started on Accounts with the server's label and the Accounts icon", async () => {
    stubCopilot({
      conversations: [
        {
          id: 14,
          title: 'What renews soon?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'Accounts · Renews within 30 days' },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /What renews soon\?/ });
    expect(within(tagged).getByText('Accounts · Renews within 30 days')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/What renews soon\?\s*Started on Accounts · Renews within 30 days/);
    expect(tagged.querySelector('svg.lucide-layers')).not.toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.test.ts src/pages/dashboard/ask/context.test.ts src/components/copilot/useCopilotThread.test.tsx src/components/copilot/HistoryPopover.test.tsx`

Expected: the new cases FAIL. For example, `surfaceLabel` falls through to `organizationsLabel` and throws on `labels`, and `originPath` returns `/organizations/...`.

- [ ] **Step 3: Add the Accounts types to the unions** in `src/pages/copilot/types.ts`:

```ts
/** Every structured context a question can carry, told apart by `surface`
 *  (and, on Organizations, Contacts and Accounts, by `view`). */
export type SurfaceContext =
  | DashboardContext
  | OrganizationsContext
  | OrganizationDetailContext
  | ContactsListContext
  | ContactsPersonContext
  | AccountsListContext
  | AccountDetailContext;
export type SurfaceOrigin =
  | DashboardOrigin
  | OrganizationsOrigin
  | OrganizationDetailOrigin
  | ContactsListOrigin
  | ContactsPersonOrigin
  | AccountsListOrigin
  | AccountDetailOrigin;
```

- [ ] **Step 4: Add the branches**

`src/components/copilot/surfaceLabels.ts`:

```ts
import { accountsLabel, type AccountsNames } from '../../features/accounts/askContext';
// …
export interface SurfaceNames {
  dashboard?: FilterNames;
  organizations?: PortfolioResponse['filters'] | null;
  detail?: DetailNames | null;
  contacts?: ContactsNames | null;
  /** What the Accounts pages report: filter options and the open account's name. */
  accounts?: AccountsNames | null;
}

export function surfaceLabel(context: SurfaceContext, names: SurfaceNames = {}): string {
  if (context.surface === 'accounts') return accountsLabel(context, names.accounts ?? null);
  if (context.surface === 'contacts') return contactsLabel(context, names.contacts ?? null);
  // …unchanged
}
```

In `originTag`, replace the Contacts line with:

```ts
  // Contacts and Accounts store one server-built label: the tag is that label.
  if (origin.surface === 'contacts' || origin.surface === 'accounts') return origin.label;
```

In the same doc comment, add "an Accounts one's is the server's `label` ("Accounts · Renews within 30 days", "EMEA")".

`src/pages/dashboard/ask/originPath.ts`:

```ts
import { accountsPath } from '../../../features/accounts/askContext';
// …
export function originPath(origin: SurfaceOrigin): string {
  if (origin.surface === 'accounts') return accountsPath(origin);
  if (origin.surface === 'contacts') return contactsPath(origin);
  // …unchanged
}
```

Update the doc comment to read "…a Contacts person or filtered list, or an Accounts List, Board or account."

`src/pages/dashboard/ask/context.ts` (`withFocus`). This branch goes first, before the `context.view === 'detail'` line, which would otherwise treat an account's page as an organisation's:

```ts
  if (context.surface === 'accounts') {
    // Only an account's page takes a focus, a story item's; the server drops
    // one on the List and the Board, so it is never sent there.
    return context.view === 'detail' ? { ...context, focus: isStoryFocus(focus) ? focus : null } : context;
  }
```

Extend the function's doc comment with this sentence: "An account's page takes only a story item; the Accounts List and Board take none."

`src/pages/dashboard/ask/askPreference.ts`:

```ts
/** Accounts' rail keeps its own choice too. */
export const ACCOUNTS_ASK_KEY = 'revenact_accounts_ask';
```

`src/components/copilot/useCopilotThread.ts`:

```ts
/** What a `400 {"context": {…}}` means to the asker: the page, or the item
 *  asked about, is no longer theirs to ask about. `context` is the question's
 *  own, so a key can read per surface: an Accounts `account` is the page
 *  itself, an organisation page's `account` is its account chip. Null for any
 *  other failure. */
export function refusalMessage(err: unknown, context?: SurfaceContext | null): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const body = (err.body as { context?: unknown } | null)?.context;
  if (!body || typeof body !== 'object') return null;
  if (context?.surface === 'accounts') {
    if ('account' in body) return 'You can no longer ask about this account.';
    if ('focus' in body) return 'You can no longer ask about this item. Ask about the account instead.';
    if ('filters' in body) return "You can't ask about this list. Clear the filters and ask again.";
    return null;
  }
  if ('contact' in body) return "You can't ask about this person here.";
  if ('filters' in body) return "You can't ask about this list. Clear the filters and ask again.";
  if ('organization' in body) return 'You can no longer ask about this organization.';
  if ('account' in body) return 'You can no longer ask about this account. Choose All and ask again.';
  return null;
}
```

In `send`, pass the turn's context: `const refusal = refusalMessage(err, turn.context);`.

`src/components/copilot/CopilotRail.tsx` (History tag). Add `Layers` to the `lucide-react` import, then:

```tsx
                        {c.origin.surface === 'organizations' ? (
                          <Network className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : c.origin.surface === 'contacts' ? (
                          <Users className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : c.origin.surface === 'accounts' ? (
                          <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <LayoutDashboard className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span className="sr-only">
                          {c.origin.surface === 'dashboard' ? 'Started on the dashboard: ' : 'Started on '}
                        </span>
```

- [ ] **Step 5: Run the tests and the type-check**

Run the Step 2 command. Expected: PASS, with the old cases unchanged.

Run: `npx tsc -b`. Expected: exit 0. If `tsc` flags another switch on `SurfaceContext`, add the same Accounts branch there, with a test. The known ones are the six files above.

- [ ] **Step 6: Commit**

```bash
git add src/pages/copilot/types.ts src/components/copilot src/pages/dashboard/ask
git commit -m "feat(accounts): the accounts branch in the shared Ask functions

Chip, History tag and icon, restore path, focus, refusal copy per surface,
and the rail's own preference key.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The layout route, the names the pages report, and the route context

**Files:**
- Create: `src/pages/accounts/ask/accountsNames.ts`, `src/pages/accounts/ask/useAccountsContext.ts`, `src/pages/accounts/ask/AccountsAskLayout.tsx`
- Modify: `src/App.tsx` (the `accounts` routes), `src/pages/accounts/houseRules.test.ts` (glob the layout)
- Test: `src/pages/accounts/ask/AccountsAskLayout.test.tsx`

**Interfaces:**
- Consumes:
  - `accountsContextOf`, `accountsViewOf`, `accountIdOf`, `AccountsNames`, `NO_ACCOUNTS_NAMES` (Task 1)
  - `surfaceLabel(…, { accounts })` and `ACCOUNTS_ASK_KEY` (Task 2)
  - `AskProvider`, `AskRail`, `AskSurface` and `OrganizationsFrame({rail, bleed, scrollKey})` (existing)
- Produces:
  - `AccountsAskLayout()`
  - `useAccountsContext(): AccountsListContext | AccountDetailContext | null`
  - `AccountsNamesContext`
  - `useReportAccountsOptions(options: AccountFilterOptions | null): void`
  - `useReportAccountName(id: number, name: string): void`

- [ ] **Step 1: Write the failing test** `src/pages/accounts/ask/AccountsAskLayout.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ACCOUNT_FILTER_OPTIONS } from '../../../features/accounts/testPortfolio';
import { useAsk } from '../../dashboard/ask/useAsk';
import { AccountsAskLayout } from './AccountsAskLayout';
import { useReportAccountName, useReportAccountsOptions } from './accountsNames';

function Page({ name }: { name: string }) {
  const ask = useAsk()!;
  useReportAccountsOptions(ACCOUNT_FILTER_OPTIONS);
  const { context, chipLabel } = ask.surface;
  return (
    <div>
      <p data-testid="page">{name}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="context">{JSON.stringify(context)}</p>
      <p data-testid="chip">{context ? chipLabel(context) : 'none'}</p>
      <p data-testid="conversation">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.setConversation({ id: 3, title: 'Kept', created_at: '', updated_at: '', messages: [] })}>
        Start
      </button>
      <Link to="/accounts/board?owner=2">Board</Link>
      <Link to="/accounts/12?tab=details">Account</Link>
    </div>
  );
}

function AccountPage() {
  useReportAccountName(12, 'Pizza EMEA');
  return <Page name="Account" />;
}

function renderLayout(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/accounts" element={<AccountsAskLayout />}>
          <Route path="list" element={<Page name="List" />} />
          <Route path="board" element={<Page name="Board" />} />
          <Route path=":id" element={<AccountPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const context = () => JSON.parse(screen.getByTestId('context').textContent!);

describe('AccountsAskLayout', () => {
  it('asks from the accounts surface, naming filters from the options a page reports', async () => {
    renderLayout('/accounts/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('accounts');
    expect(context()).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2' } });
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Accounts · Owner: Carl CSM'));
  });

  it("names an account's page from the name it reports, carrying only its id", async () => {
    renderLayout('/accounts/12?tab=details');
    expect(context()).toEqual({ surface: 'accounts', view: 'detail', account: 12, focus: null });
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Pizza EMEA'));
  });

  it('keeps one conversation across the List, the Board and an account', async () => {
    renderLayout('/accounts/list');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('link', { name: 'Board' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Board');
    expect(context()).toEqual({ surface: 'accounts', view: 'board', filters: { owner: '2' } });
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
    await userEvent.click(screen.getByRole('link', { name: 'Account' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Account');
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
  });

  it('has no context on an id that is not an account', () => {
    renderLayout('/accounts/abc');
    expect(screen.getByTestId('chip')).toHaveTextContent('none');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts/ask/AccountsAskLayout.test.tsx`
Expected: FAIL, "Failed to resolve import './AccountsAskLayout'".

- [ ] **Step 3: Write the names module** `src/pages/accounts/ask/accountsNames.ts`:

```ts
import { createContext, useContext, useEffect } from 'react';
import type { AccountsNames } from '../../../features/accounts/askContext';
import type { AccountFilterOptions } from '../../../features/accounts/portfolioTypes';

/** Only the pages know what they loaded: the List and the Board their
 *  portfolio read's filter options, the account page its row's name. Each
 *  reports its part here, so a live question's chip can name them before the
 *  server has. Null outside AccountsAskLayout. */
export const AccountsNamesContext = createContext<((patch: Partial<AccountsNames>) => void) | null>(null);

export function useReportAccountsOptions(options: AccountFilterOptions | null): void {
  const report = useContext(AccountsNamesContext);
  useEffect(() => {
    if (report && options) report({ options });
  }, [report, options]);
}

/** `name` is '' until the row lands: nothing is reported until then. */
export function useReportAccountName(id: number, name: string): void {
  const report = useContext(AccountsNamesContext);
  useEffect(() => {
    if (report && name) report({ account: { id, name } });
  }, [report, id, name]);
}
```

- [ ] **Step 4: Write the context hook** `src/pages/accounts/ask/useAccountsContext.ts`:

```ts
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { accountsContextOf, accountsViewOf } from '../../../features/accounts/askContext';
import type { AccountDetailContext, AccountsListContext } from '../../copilot/types';

/** Where the person is on Accounts, as the server needs it (spec §3). On an
 *  account's page the query (its tab and story filters) is not part of it,
 *  so a tab switch or a story filter never rebuilds the context. */
export function useAccountsContext(): AccountsListContext | AccountDetailContext | null {
  const { pathname, search } = useLocation();
  const query = accountsViewOf(pathname) === 'detail' ? '' : search;
  return useMemo(() => accountsContextOf(pathname, query), [pathname, query]);
}
```

- [ ] **Step 5: Write the layout** `src/pages/accounts/ask/AccountsAskLayout.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { accountIdOf, accountsViewOf, NO_ACCOUNTS_NAMES, type AccountsNames } from '../../../features/accounts/askContext';
import { ACCOUNTS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { OrganizationsFrame } from '../../organizations/OrganizationsFrame';
import { AccountsNamesContext } from './accountsNames';
import { useAccountsContext } from './useAccountsContext';

/** The Accounts routes' Ask (spec 2026-09-29 §3): one conversation above the
 *  List, the Board and every account's page, so it lasts from the List into
 *  an account and back, through every filter. The frame and its rail (with
 *  the pill) sit here, beside the Outlet, so a route change never remounts
 *  the rail; each page's own OrganizationsFrame inside passes its content
 *  straight through. On an account's page the frame is the `bleed` variant,
 *  as the page draws it on its own. */
export function AccountsAskLayout() {
  const { pathname } = useLocation();
  const context = useAccountsContext();
  const [names, setNames] = useState<AccountsNames>(NO_ACCOUNTS_NAMES);
  // A report that changes nothing keeps the same object, so the chip's
  // callback, and AskProvider's value, don't churn.
  const report = useCallback(
    (patch: Partial<AccountsNames>) =>
      setNames((prev) => {
        const next = { ...prev, ...patch };
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      }),
    [],
  );
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { accounts: names }),
    [names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'accounts', context, chipLabel }), [context, chipLabel]);
  // Another account, or the List or the Board, starts at the top of the
  // shared scroll column; a tab or query change does not.
  const view = accountsViewOf(pathname);
  const scrollKey = view === 'detail' ? `detail:${accountIdOf(pathname) ?? pathname}` : view;
  return (
    <AccountsNamesContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={ACCOUNTS_ASK_KEY}>
        <OrganizationsFrame rail={<AskRail />} bleed={view === 'detail'} scrollKey={scrollKey}>
          <Outlet />
        </OrganizationsFrame>
      </AskProvider>
    </AccountsNamesContext.Provider>
  );
}
```

- [ ] **Step 6: Route it** in `src/App.tsx`. Import `AccountsAskLayout` beside the other Accounts imports (`import { AccountsAskLayout } from './pages/accounts/ask/AccountsAskLayout';`) and change the `accounts` block to:

```tsx
          <Route path="accounts">
            <Route index element={<Navigate to="list" replace />} />
            {/* One Ask conversation above both views and every account's
                page (accounts spec 2026-09-29 §3). */}
            <Route element={<AccountsAskLayout />}>
              <Route path="list" element={<AccountsList />} />
              <Route path="board" element={<AccountsBoard />} />
              <Route path=":id" element={<AccountDetails />} />
            </Route>
          </Route>
```

- [ ] **Step 7: Put the layout under the house rules.** In `src/pages/accounts/houseRules.test.ts`, change the glob to `['./List.tsx', './Board.tsx', './Details.tsx', './ask/AccountsAskLayout.tsx']` and the comment to "The Accounts pages: the portfolio List and Board, the account page, and their Ask layout."

- [ ] **Step 8: Run the tests and the type-check**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts/ask/AccountsAskLayout.test.tsx src/pages/accounts/houseRules.test.ts`. Expected: PASS.

Run: `npx tsc -b`. Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/pages/accounts/ask src/App.tsx src/pages/accounts/houseRules.test.ts
git commit -m "feat(accounts): one Ask conversation above the List, the Board and every account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The rail on the List and the Board

**Files:**
- Modify: `src/pages/accounts/List.tsx`, `src/pages/accounts/Board.tsx`, `src/components/layout/Navbar.tsx` (comment only)
- Modify (test harness): `src/pages/accounts/testList.tsx` (the `ask` option), `src/components/copilot/testCopilot.ts` (`refuse` accepts a nested body)
- Create (test only): `src/pages/accounts/ask/testAccountsAsk.ts`
- Test: `src/pages/accounts/ask/accountsAsk.test.tsx`

**Interfaces:**
- Consumes: `AccountsAskLayout` and `useReportAccountsOptions` (Task 3), `ACCOUNTS_ASK_KEY` (Task 2), `stubCopilot` and `postedBodies`, `stubAccountsPortfolio` and `AccountsStub`, `stubAccountPage` and `AccountPageStub` (existing).
- Produces:
  - `renderAccounts(url, { width, nav, realPage, ask })`. The new `ask?: boolean` wraps the three routes in `AccountsAskLayout`.
  - `stubAccountsAsk({ copilot?, portfolio?, page? }): { copilot, portfolio, page, release }`

- [ ] **Step 1: The harness.**

`src/components/copilot/testCopilot.ts`: widen the option to `refuse?: Record<string, unknown>;`. Keep its doc comment and add "(nested, as `{filters: {organisation: [...]}}`, allowed)".

`src/pages/accounts/ask/testAccountsAsk.ts`:

```ts
import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubAccountPage, type AccountPageStub } from '../../../features/accounts/testAccountPage';
import { stubAccountsPortfolio, type AccountsStub } from '../../../features/accounts/testPortfolio';

/** Test-only. The Accounts portfolio (stubAccountsPortfolio), the account
 *  page (stubAccountPage, which hands everything else to the portfolio) and
 *  the Copilot (stubCopilot) behind one fetch, so every page and its rail
 *  answer. `copilot` is the spy postedBodies reads. The page stub answers
 *  `/accounts/portfolio/?ids=…` itself, so list tests here don't filter by
 *  `ids`. */
export function stubAccountsAsk(
  options: { copilot?: Parameters<typeof stubCopilot>[0]; portfolio?: AccountsStub; page?: AccountPageStub } = {},
) {
  const copilot = stubCopilot(options.copilot);
  const portfolio = stubAccountsPortfolio(options.portfolio);
  const page = stubAccountPage({ ...options.page, fallback: portfolio });
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : page(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, portfolio, page, release: copilot.release };
}
```

`src/pages/accounts/testList.tsx`:
- Import `AccountsAskLayout` from `./ask/AccountsAskLayout`.
- Add `ask?: boolean` (default `false`) to the options, and add to the doc comment: "`ask` puts the three routes under AccountsAskLayout, as App.tsx does".
- Build the three route elements into a `pages` array, each with a `key`, and render the routes like this:

```tsx
          <Routes>
            {ask ? <Route element={<AccountsAskLayout />}>{pages}</Route> : pages}
            <Route path="/organizations/:id" element={<><p>Organization page</p><Where /></>} />
          </Routes>
```

- [ ] **Step 2: Write the failing test** `src/pages/accounts/ask/accountsAsk.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { ACCOUNTS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { renderAccounts } from '../testList';
import { stubAccountsAsk } from './testAccountsAsk';

// Integration tier: the real Accounts List and Board under AccountsAskLayout,
// the real rail and pill, store and router; fetch answers the portfolio and
// the Copilot in the backend's shapes (feat/accounts-ask). `filters` carry
// only the set keys; a view's own default group is never sent, and neither is
// a focus.
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const views = () => screen.getByRole('navigation', { name: 'Accounts views' });

describe('Ask Revenact on the Accounts List and Board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the pill in the top bar and the glass rail beside the list, open from xl', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    const bar = within(screen.getByTestId('nav-actions'));
    expect(bar.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    // Glass is the rail's alone: rows stay solid.
    expect(document.querySelector('[data-row-id="12"]')).toHaveClass('bg-surface');
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the list's filters, names them in the chip, and keeps the server's label", async () => {
    const { copilot } = stubAccountsAsk({ copilot: { label: () => 'Accounts · Owner: Carl CSM · Organisation: Pizza Hut' } });
    renderAccounts('/accounts/list?owner=2&organisation=7', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(await within(rail()!).findByText('Accounts · Owner: Carl CSM · Organization: Pizza Hut')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who needs me first?{enter}');
    await screen.findByText('Answer to: Who needs me first?');
    expect(postedBodies(copilot)[0]).toEqual({
      content: 'Who needs me first?',
      context: { surface: 'accounts', view: 'list', filters: { owner: '2', organisation: '7' } },
    });
    // The asked question shows the server's word, not the client's.
    expect(within(log()).getByText('Accounts · Owner: Carl CSM · Organisation: Pizza Hut')).toBeInTheDocument();
  });

  it('moves the chip with the filters', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list?owner=2&organisation=7', { ask: true });
    await within(rail()!).findByText('Accounts · Owner: Carl CSM · Organization: Pizza Hut');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Owner: Carl CSM' }));
    expect(await within(rail()!).findByText('Accounts · Organization: Pizza Hut')).toBeInTheDocument();
  });

  it('is on the board too: opening a card narrows nothing, and the conversation survives the switch to the list', async () => {
    const { copilot } = stubAccountsAsk();
    renderAccounts('/accounts/board?owner=2', { ask: true, nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    expect(await within(rail()!).findByText('Accounts · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'What renews soon?{enter}');
    await screen.findByText('Answer to: What renews soon?');
    // lifecycle is the Board's own default, so no group; and no focus.
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'accounts', view: 'board', filters: { owner: '2' } });

    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(screen.getByText('Answer to: What renews soon?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And here?{enter}');
    await screen.findByText('Answer to: And here?');
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2' } });
  });

  it('refuses an organisation filter the asker cannot open, with no Retry', async () => {
    const { copilot } = stubAccountsAsk({ copilot: { refuse: { filters: { organisation: ['Not an organisation you can open.'] } } } });
    renderAccounts('/accounts/list?organisation=7', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.type(composer(), 'Who is at risk?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent("You can't ask about this list. Clear the filters and ask again.");
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('is a full-screen sheet from the switch on a phone, never a rail', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list', { ask: true, width: 375 });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('dialog', { name: 'Ask Revenact' })).toHaveAttribute('aria-modal', 'true');
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(ACCOUNTS_ASK_KEY)).toBeNull();
  });

  it("keeps Accounts' own open/closed choice", async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Hide Copilot' }));
    expect(localStorage.getItem(ACCOUNTS_ASK_KEY)).toBe('closed');
    expect(localStorage.getItem('revenact_organizations_ask')).toBeNull();
  });

  it('mounts nothing outside the Ask layout', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(rail()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copilot$/ })).not.toBeInTheDocument();
  });
});
```

The row selector `[data-row-id="12"]` is the one `AccountRow` renders. If a query name differs from these, take it from the Organizations twin (`src/pages/organizations/ask/organizationsAsk.test.tsx`) or from `src/pages/accounts/List.test.tsx` and `Board.test.tsx`. Keep what each case asserts.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts/ask/accountsAsk.test.tsx`

Expected: the chip cases FAIL, reading "Accounts · Owner: User 2 · Organization: Organization 7", because the pages do not report their options yet. The rail and layout cases already pass through the harness.

- [ ] **Step 4: Report the options from the pages.**

`src/pages/accounts/List.tsx`: import `useReportAccountsOptions` from `./ask/accountsNames`. Directly after `const options = portfolio.data?.filters ?? null;` add:

```ts
  // Ask Revenact (spec §3): the chip names owners and organisations from
  // this read's options. Opening a row narrows nothing: the server drops a
  // focus on the List (plan Decision 3).
  useReportAccountsOptions(options);
```

Also change the `@container` comment to: "Containers: the tiles and rows follow this column, which the Ask rail narrows, not the window."

`src/pages/accounts/Board.tsx`: the same import, and the same call after its `const options = portfolio.data?.filters ?? null;` (line 93), with the comment reading "…on the Board".

`src/components/layout/Navbar.tsx`: in the `isAccountsView` comment, replace "the actions slot (the Ask pill lands there in delivery 3)" with "the actions slot (where `AccountsAskLayout`'s rail portals the Ask pill)".

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts src/components/copilot/testCopilot.ts src/components/layout/Navbar.test.tsx`
Expected: PASS. The existing `List.test.tsx`, `Board.test.tsx` and `Details.test.tsx` render without `ask` and are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/pages/accounts src/components/copilot/testCopilot.ts src/components/layout/Navbar.tsx
git commit -m "feat(accounts): Ask Revenact beside the Accounts List and Board

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The rail on an account's page, and "Ask about this"

**Files:**
- Modify: `src/pages/accounts/Details.tsx`
- Test: `src/pages/accounts/ask/detailAsk.test.tsx`

**Interfaces:**
- Consumes: `useReportAccountName(id, name)` (Task 3), `renderAccounts(url, { ask, realPage })` and `stubAccountsAsk` (Task 4), and the existing `StoryItemRow`'s `AskAbout`, which prefills `askAboutQuestion(focus)` through `AskDraftContext`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test** `src/pages/accounts/ask/detailAsk.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { resetViewport } from '../../../test/viewport';
import { renderAccounts } from '../testList';
import { stubAccountsAsk } from './testAccountsAsk';

// Integration tier: the real account page under AccountsAskLayout, the real
// rail and pill, store and router; fetch answers the page (backend #75) and
// the Copilot (feat/accounts-ask).
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact') as HTMLInputElement;
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const landed = () => screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
const column = () => document.querySelector('[data-part="column"]') as HTMLElement;
const page = { surface: 'accounts', view: 'detail', account: 12 };

describe('Ask Revenact on an account page', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("draws one bleed frame with the glass rail beside the page, whose surfaces stay solid", async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    expect(rail()).toHaveClass('w-[320px]');
    expect(column().parentElement!.parentElement).toHaveClass('px-0', 'sm:px-6');
    expect(column().parentElement!.parentElement).toContainElement(rail());
    expect(document.querySelectorAll('[data-part="column"]')).toHaveLength(1);
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the account's id alone, whatever the tab, and keeps the server's label", async () => {
    const { copilot } = stubAccountsAsk({ copilot: { label: () => 'EMEA (server)' } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    expect(await within(rail()!).findByText('Pizza EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'What changed this month?{enter}');
    await screen.findByText('Answer to: What changed this month?');
    expect(postedBodies(copilot)[0]).toEqual({ content: 'What changed this month?', context: { ...page, focus: null } });
    expect(within(log()).getByText('EMEA (server)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await userEvent.type(composer(), 'And the owner?{enter}');
    await screen.findByText('Answer to: And the owner?');
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, focus: null });
  });

  it('opens the rail with a question about a story item, focused on it for one question', async () => {
    const { copilot } = stubAccountsAsk();
    renderAccounts('/accounts/12', { ask: true, realPage: true, width: 1100 });
    await landed();
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Re: EMEA renewal' }));
    expect(await within(rail()!).findByText('Pizza EMEA · This email')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this email?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this email?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...page, focus: { kind: 'email', id: 141 } });
    // Spent by the send: the chip is the account again, and so is the next question.
    expect(within(rail()!).getByText('Pizza EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the renewal?{enter}');
    await screen.findByText('Answer to: And the renewal?');
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, focus: null });
  });

  it('opens the sheet with the question on a phone', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/12', { ask: true, realPage: true, width: 375 });
    await landed();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA check-in' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pizza EMEA · This call')).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue('What should I know about this call?');
  });

  it('refuses an account the asker can no longer open, with no Retry', async () => {
    const { copilot } = stubAccountsAsk({ copilot: { refuse: { account: ['Not an account you can open.'] } } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    await userEvent.type(composer(), 'What changed?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent('You can no longer ask about this account.');
    expect(within(rail()!).queryByRole('alert')).not.toHaveTextContent('Choose All');
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('refuses a story item the asker cannot open, and the next question is about the account', async () => {
    stubAccountsAsk({ copilot: { refuse: { focus: ['Not a story item you can open.'] } } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Re: EMEA renewal' }));
    await userEvent.type(composer(), '{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent(
      'You can no longer ask about this item. Ask about the account instead.',
    );
    await waitFor(() => expect(within(rail()!).getByText('Pizza EMEA')).toBeInTheDocument());
  });

  it("names nothing it could not open: an account that isn't the viewer's reads \"This account\"", async () => {
    stubAccountsAsk({ page: { row: null } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await screen.findByText('Account not found');
    expect(within(rail()!).getByText('This account')).toBeInTheDocument();
    expect(within(rail()!).queryByText(/12/)).not.toBeInTheDocument();
  });
});
```

The story titles (`Re: EMEA renewal` for email 141, `EMEA check-in` for call 112) are `ACCOUNT_STORY_ITEMS` in `src/features/accounts/testAccountPage.ts`. The "Account not found" copy is `Details.tsx`'s `NotFound`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts/ask/detailAsk.test.tsx`

Expected: the chip cases FAIL, reading "This account" where "Pizza EMEA" is expected, because the page does not report its name yet. "Ask about this" already shows, since `StoryItemRow` renders it under any Ask provider. The refusal cases pass on Task 2's copy.

- [ ] **Step 3: Report the name from the page.** In `src/pages/accounts/Details.tsx`, import `useReportAccountName` from `./ask/accountsNames`. After `const scope = useMemo<DetailScope>(…)`, and before any early return, add:

```ts
  // Ask Revenact (spec §3): the chip names this account from its own row
  // until the server's label comes back; "This account" until it lands.
  useReportAccountName(accountId, name);
```

In `AccountPage`'s doc comment, replace "The rail slot waits for Ask (delivery 3)." with "Ask Revenact sits beside it (`AccountsAskLayout`), and each story item's \"Ask about this\" narrows one question to that item."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/accounts
git commit -m "feat(accounts): Ask Revenact on the account page, and Ask about this on its story

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: History reopens an Accounts conversation where it was asked

**Files:**
- Modify (test harness): `src/pages/accounts/testList.tsx`. `url` may be an entry with navigation state.
- Test: `src/pages/accounts/ask/historyRestore.test.tsx`

**Interfaces:**
- Consumes: `accountsPath` and `originPath` (Tasks 1 and 2), `renderAccounts` and `stubAccountsAsk` (Task 4), and `AskHandover` (`{askConversationId?, askConversation?}`) from `AskProvider`.
- Produces: `renderAccounts(url: string | { pathname: string; search?: string; state?: unknown }, …)`.

- [ ] **Step 1: Widen the harness.** In `src/pages/accounts/testList.tsx`, change the first parameter to `url: string | { pathname: string; search?: string; state?: unknown }`. `MemoryRouter`'s `initialEntries={[url]}` already takes either form. Add "`url` may carry navigation state (a History handover)." to the doc comment.

- [ ] **Step 2: Write the test** `src/pages/accounts/ask/historyRestore.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { resetViewport } from '../../../test/viewport';
import { renderAccounts } from '../testList';
import { stubAccountsAsk } from './testAccountsAsk';

const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const where = () => screen.getByTestId('where');
const history = () => within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' });

const conversation = (id: number, title: string, origin: Record<string, unknown>) => ({
  id,
  title,
  created_at: '',
  updated_at: '',
  origin,
  messages: [
    { id: 1, role: 'user', content: title, context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: `Answer: ${title}`, sources: [], questions: [], created_at: '' },
  ],
});

const ON_BOARD = conversation(14, 'What renews soon?', {
  surface: 'accounts',
  view: 'board',
  filters: { renews_within: '30' },
  label: 'Accounts · Renews within 30 days',
});
const ON_EMEA = conversation(15, 'What does this mean for EMEA?', { surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' });
const UNGROUPED = conversation(16, 'Who is unassigned?', {
  surface: 'accounts',
  view: 'list',
  filters: { owner: 'unassigned', group: '' },
  label: 'Accounts · Owner: Unassigned',
});
const ON_ORGANIZATIONS = conversation(9, 'Which accounts need me first?', {
  surface: 'organizations',
  view: 'list',
  filters: { owner: '2' },
  labels: ['Owner: Carl CSM'],
});

describe('History on Accounts', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("tags a Board conversation with the server's label and reopens it on the Board with its filters", async () => {
    stubAccountsAsk({ copilot: { conversations: [ON_BOARD], conversationById: { 14: ON_BOARD } } });
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /What renews soon\?/ });
    expect(within(item).getByText('Accounts · Renews within 30 days')).toBeInTheDocument();
    await userEvent.click(item);
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/board?renews_within=30'));
    expect(await within(log()).findByText('Answer: What renews soon?')).toBeInTheDocument();
  });

  it("reopens an account's conversation on its page", async () => {
    stubAccountsAsk({ copilot: { conversations: [ON_EMEA], conversationById: { 15: ON_EMEA } } });
    renderAccounts('/accounts/list', { ask: true, realPage: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /What does this mean for EMEA\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/12'));
    await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
    expect(await within(log()).findByText('Answer: What does this mean for EMEA?')).toBeInTheDocument();
  });

  it("reopens an ungrouped List as the URL's group=none", async () => {
    stubAccountsAsk({ copilot: { conversations: [UNGROUPED], conversationById: { 16: UNGROUPED } } });
    renderAccounts('/accounts/board', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /Who is unassigned\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/list?owner=unassigned&group=none'));
  });

  it("sends another surface's conversation to its own page", async () => {
    stubAccountsAsk({ copilot: { conversations: [ON_ORGANIZATIONS], conversationById: { 9: ON_ORGANIZATIONS } } });
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /Which accounts need me first\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/organizations/list?owner=2'));
  });

  it("opens a conversation handed over from another surface's History in the rail", async () => {
    stubAccountsAsk();
    renderAccounts({ pathname: '/accounts/12', state: { askConversationId: 15, askConversation: ON_EMEA } }, { ask: true, realPage: true, width: 1100 });
    await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
    expect(await within(log()).findByText('Answer: What does this mean for EMEA?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts/ask/historyRestore.test.tsx`

Expected: PASS. The logic landed in Tasks 2–5, and these tests pin it end to end through the real History popover.

If a case fails, debug it with superpowers:systematic-debugging. The likely causes:
- `accountsPath`'s query order. The expected strings follow `URLSearchParams` insertion order of the stored filters.
- The History item's accessible name. Copy it from `src/pages/contacts/ask/historyRestore.test.tsx`.

Fix the code, not the expectation, unless the expectation contradicts the contract.

- [ ] **Step 4: Commit**

```bash
git add src/pages/accounts/testList.tsx src/pages/accounts/ask/historyRestore.test.tsx
git commit -m "test(accounts): History reopens an Accounts conversation where it was asked

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: End to end in jsdom, and the product documents

**Files:**
- Create: `src/e2e/accountsAsk.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: Write the journey** `src/e2e/accountsAsk.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { ACCOUNT_LISTS } from '../features/accounts/testAccountPage';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubAccountsAsk } from '../pages/accounts/ask/testAccountsAsk';
import { renderAccounts } from '../pages/accounts/testList';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Accounts List, Board and
// account page under AccountsAskLayout, with the real Navbar, rail and pill,
// store and router. Only fetch is stubbed: the Accounts endpoints and the
// Copilot's (stubAccountsAsk), in the backend's shapes.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const views = () => screen.getByRole('navigation', { name: 'Accounts views' });

// The conversation as History lists it after the journey below: its origin
// is the first Ask context (the List's) without its focus, labelled by the server.
const ASKED = { id: 15, title: 'Who needs me first?', created_at: '', updated_at: '', origin: { surface: 'accounts', view: 'list', filters: { owner: '2' }, label: 'Accounts · Owner: Carl CSM' } };

describe('Ask Revenact on Accounts, end to end (spec 2026-09-29 §3)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('asks on the List, the Board and an account in one conversation, asks about a story item, and finds it in History', { timeout: 30000 }, async () => {
    const { copilot } = stubAccountsAsk({ copilot: { conversations: [ASKED] }, page: { lists: ACCOUNT_LISTS } });
    renderAccounts('/accounts/list?owner=2', { width: 1440, nav: true, realPage: true, ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });

    // 1. The List: the chip names Carl; the question carries the filter alone.
    expect(await within(rail()).findByText('Accounts · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who needs me first?{Enter}');
    await screen.findByText('Answer to: Who needs me first?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2' } });

    // 2. The Board, carrying the query: the same conversation, the Board's view.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where()).toBe('/accounts/board?owner=2');
    await userEvent.type(composer(), 'What renews soon?{Enter}');
    await screen.findByText('Answer to: What renews soon?');
    expect(screen.getByText('Answer to: Who needs me first?')).toBeInTheDocument();
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'accounts', view: 'board', filters: { owner: '2' } });

    // 3. Into Pizza EMEA: the chip moves to the account; the conversation stays.
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
    expect(where()).toBe('/accounts/12');
    expect(await within(rail()).findByText('Pizza EMEA')).toBeInTheDocument();
    expect(screen.getByText('Answer to: What renews soon?')).toBeInTheDocument();

    // 4. "Ask about this" on the call: typed in, not sent; sending names it.
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA check-in' }));
    expect(await within(rail()).findByText('Pizza EMEA · This call')).toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(2);
    await userEvent.type(composer(), '{Enter}');
    await screen.findByText('Answer to: What should I know about this call?');
    expect(postedBodies(copilot)[2].context).toEqual({ surface: 'accounts', view: 'detail', account: 12, focus: { kind: 'call', id: 112 } });

    // 5. History lists it, tagged with the server's label and the Accounts icon.
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /Who needs me first\?/ });
    expect(item).toHaveAccessibleName(/Who needs me first\?\s*Started on Accounts · Owner: Carl CSM/);
    expect(item.querySelector('svg.lucide-layers')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run --maxWorkers=2 src/e2e/accountsAsk.test.tsx`. Expected: PASS.

- [ ] **Step 3: Update the product documents.**
  - **`docs/03-ui-ux-design.md`:**
    - "Portfolio rows and board (Accounts)" (about line 528): replace "The rail slot stays empty until Ask" with the ✦ rail and pill as on Organizations. `AccountsAskLayout` draws the frame and the glass rail once above the List, the Board and every account's page. It is open by default from `xl`, remembers its own choice (`revenact_accounts_ask`), and is a sheet below `sm`. Opening a row or card narrows nothing.
    - "Account page (`/accounts/:id`)" (about line 542): replace "the rail slot kept empty until Ask (delivery 3)" with the glass rail beside the bleed frame. Each story item's meta line ends with the quiet "Ask about this", which types in "What should I know about this <kind>?" with the chip "<account> · This <kind>" and does not send.
    - "Ask rail" (about line 303):
      - Add Accounts to the surfaces.
      - The live chip wording: "Accounts · Owner: …", or the account's name, else "This account". The server's label replaces it once asked.
      - The refusal copy: "You can no longer ask about this account."; "You can no longer ask about this item. Ask about the account instead."; and the list copy.
      - The History tag with the `Layers` icon.
      - Note that the glass exception covers the Accounts rail, as it does the Organizations rail.
  - **`docs/04-app-flow.md`:**
    - In the route table row for `/accounts/*`, add that `AccountsAskLayout` wraps list, board and `:id` in one `AskProvider` (surface `accounts`, key `revenact_accounts_ask`).
    - The contexts: `{surface:'accounts', view:'list'|'board', filters}` (set keys only, no focus) and `{view:'detail', account, focus}`.
    - "Ask about this" sets a story focus for one question.
    - The three refusals and their copy.
    - History reopens `/accounts/list?<filters>` (not `/accounts`, whose redirect drops the query), `/accounts/board?<filters>` or `/accounts/:id`.
    - In "4.3 Accounts", one line: Ask Revenact on all three routes, one conversation.
  - **`.agents/workflows/repo-architecture.md`:**
    - Add `pages/accounts/ask/` to the "Ask Revenact" heading and a table row: `AccountsAskLayout` (the layout route above `accounts/list`, `accounts/board` and `accounts/:id`: one `AskProvider` with the `accounts` surface and `revenact_accounts_ask`, `OrganizationsFrame`'s `rail` slot holding `AskRail`, `bleed` on an account), `useAccountsContext`, `accountsNames.ts` (`useReportAccountsOptions`, `useReportAccountName`) and `testAccountsAsk` (`stubAccountsAsk`).
    - Add `features/accounts/askContext.ts` to the features list.
    - In the `AskProvider` row, add "Accounts' via `AccountsAskLayout`". Note that `refusalMessage` now takes the question's context.
    - In the route tree under `accounts/`, note the layout route.

- [ ] **Step 4: Commit**

```bash
git add src/e2e/accountsAsk.test.tsx docs .agents
git commit -m "test(accounts): the Ask on Accounts journey end to end; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none change unless a check fails.

- [ ] **Step 1:** Run `npx vitest run --maxWorkers=2`. Expected: every file passes, including the Organizations, Contacts and Dashboard Ask suites, which pass unchanged.
- [ ] **Step 2:** Run `npx tsc -b`. Expected: exit 0.
- [ ] **Step 3:** Run `npm run lint`. Expected: 0 errors, and no new warnings in the files `git diff --name-only feat/account-page` lists.
- [ ] **Step 4:** Run `npm run build`. Expected: it completes. The existing chunk-size warning is not new.
- [ ] **Step 5:** If anything fails, fix it with superpowers:systematic-debugging, commit it as `fix(accounts): <what>`, and repeat Steps 1–4. Use superpowers:verification-before-completion before claiming green.

---

### Task 9: Browser check at 1440px (light and dark) and 375px, then finishing

The controller runs this task, not a subagent.

**Before starting:**
- Run the backend `revenact-backend` on branch `feat/accounts-ask`, which includes #75: `docker compose up -d` for Postgres and Redis, then `python manage.py migrate && python manage.py runserver 8000`.
- Run `npm run dev` in `react-ts-app`.
- Use the claude-in-chrome tools. Where the window cannot be resized, load the app in a same-origin iframe of the target width, as the earlier deliveries' checks did.

- [ ] **1440px, light:**
  - `/accounts/list?owner=<me>`: the pill (New chat, History, ✦) sits in the top bar, and the glass rail is open beside the list. Rows, tiles and the side sheet stay solid, and the tiles reflow in the narrower column.
  - Ask a question. The chip first reads the page's words, then the server's label on the sent bubble.
  - Switch to the Board. The conversation stays, and a card's side panel adds no focus.
  - Open an account. The chip is its name.
  - Click "Ask about this" on a story item. The question is typed in and not sent; send it. The answer stays within what the viewer may open.
  - History tags each conversation (with the `Layers` icon for Accounts) and reopens it on its page.
- [ ] **1440px, dark:** repeat the list and the account page visually. The rail's glass, the chip and the History tags read in both themes, and no raw colours appear.
- [ ] **375px:**
  - The pill's ✦ opens the full-screen sheet. Close and Escape return focus to the switch.
  - "Ask about this" on an account's story opens the sheet with the question.
  - Nothing scrolls sideways.
- [ ] **From the Dashboard:** in History, pick an Accounts conversation. It lands on `/accounts/…` with the conversation in the rail.
- [ ] **Record:** fix anything off on this branch, with a test, before the PR, or list it as a follow-up in the PR.
- [ ] **Finish:** use superpowers:finishing-a-development-branch.
  - Push `feat/accounts-ask`.
  - Open the PR against `feat/account-page` (frontend #94). Retarget it to `main` once #94 merges.
  - In the PR body, state the merge order: backend #75 → frontend #94 → backend Ask PR → this. Include the screenshots (1440 light and dark, 375) and the decisions above.
  - End the PR body with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".

---

## Self-review

**Spec coverage (§3, frontend):**
- `AccountsAskLayout` wraps the three routes with one `AskProvider` → Task 3 (layout and route), Tasks 4 and 5 (each page inside it).
- The shared `AskRail`, pill and sheet → Tasks 4 and 5: the rail at xl, the pill in the slot, the sheet at 375.
- One conversation across all three routes → Task 3 (unit), Task 4 (Board to List), Task 7 (List to Board to account).
- History reopens the List, the Board or the account → Tasks 1, 2 and 6. See Decision 1 for `/accounts/list`.
- "Ask about this" on a story item sets the focus → Task 2 (`withFocus`) and Task 5.
- Server-built labels, and the client never names hidden data → Tasks 1 and 2 (the stored label wins) and Task 5 ("This account" for an account the viewer can't open).
- The 400s → Task 2 (copy) and Tasks 4 and 5 (in the rail).
- Tests: unit (Tasks 1 and 2), integration (Tasks 3–6), jsdom journey (Task 7), house rules (Task 3).
- Docs → Task 7. Browser check and finishing → Task 9.

**Placeholder scan:** every code step shows its code. Tasks 4 and 6 each name the file to copy one accessible name from, in case the shared rail's wording has moved.

**Type consistency:**
- The context types match the backend: `AccountsListContext` / `AccountDetailContext` (`filters`, `account`, `focus: StoryFocus | null`, `label?`) and their origins (`label` required).
- `AccountsNames` (`options`, `account {id, name}`) is the same in Tasks 1, 2 and 3.
- `useReportAccountsOptions(options)` and `useReportAccountName(id, name)` are the same in Tasks 3, 4 and 5.
- `ACCOUNTS_ASK_KEY` is `'revenact_accounts_ask'` in Tasks 2 and 4.
- `stubAccountsAsk` returns `{copilot, portfolio, page, release}` in Tasks 4–7.
- `renderAccounts(url, {width, nav, realPage, ask})`, where `url` may be an entry, in Tasks 4–7.
