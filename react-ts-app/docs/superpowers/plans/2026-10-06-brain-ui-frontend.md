# Brain UI (one frame, top tabs, tiles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every `/brain*` route in one framed shell (a "Brain" bar with four tabs and the scope switch, a full-width `BrainFrame`, one sidebar item) and open each Brain page with a row of tiles built from data it already loads.

**Architecture:** The Navbar gains a Brain branch (`BrainTabs`) that joins `isFramed`, so the bar's actions slot appears and `BrainControls` portals the scope switch into it. It renders inline below `sm`. `BrainFrame` replaces each page's centred `max-w-4xl` wrapper, and `DashboardLayout` stops padding Brain routes. Tiles reuse the Organizations `tileParts` (`Tile`, `TileButton`, `TilesSkeleton`) for What changed and Waiting on you. Doing and Customers use a link-shaped `JumpTile` that sets `?section=` exactly as the old section links did. Pure helpers (`metricTiles`, `doingFigures`, `customerTiles`, the tab rules) live in `src/features/brain/*` and get unit tests.

**Tech Stack:** React 19, TypeScript, react-router 7, Tailwind v4 tokens, Redux Toolkit, Vitest + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-06-brain-ui-design.md`. Read it together with this plan.

## Global Constraints

- Frontend only. Make **no data or behaviour changes**: no new API endpoints, no change to scope rules, privacy (twice-filter), curation gating, the delivery 4 stale-scope guards, the graph URL filters, or empty, error and refusal states. Those states are only restyled into the frame.
- **Tokens only**: no hex, `rgb()`, or named Tailwind palette colours in any `.tsx` (`src/test/houseRules.ts` `RAW`).
- **Type sizes 11/13/15/22 only** (`text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`), at most four per surface. No named sizes (`text-sm`, …).
- **Figures in DM Mono**: every number uses `MONO` (`font-mono-brand tabular-nums`) or goes through `<Figured />`. Tile figures are 22px.
- **44px targets**: every `<button>`, `<Link>`, `<select>` and text input reaches `min-h-11` on phones, directly or through a compliant style constant (`rowsIconsTargetsSuite`).
- **No `font-display` h1 on any Brain page.** The only Brain `h1` is "Brain" in the bar. Section headings use the tile label style (11px, uppercase, tracking, `text-ink-muted`), and reading text is capped at about 70ch.
- Lucide icons only, each with `aria-hidden="true"`. No emoji. No em dash (`—`) in any file under `src/components/brain/` or `src/pages/brain/`, comments included (the Brain house-rules suite checks this).
- Below `sm`, a tile row scrolls sideways (snap), and no page scrolls horizontally at 375px.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; use a WIP commit if you must set work aside).
- Every commit message ends with the trailer line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Run Vitest with **`--maxWorkers=2`**, e.g. `npx vitest run <path> --maxWorkers=2`.
- `noUnusedLocals` is on: when an edit stops using an import, delete the import in the same step.
- Branch: in this worktree, run `git switch -c feat/brain-ui` before Task 1. Once #114, #115 and #116 merge, rebase onto `origin/main`.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/components/brain/BrainFrame.tsx` | create | Full-width scroll column, `px-4 pb-6`, `rail` slot |
| `src/components/brain/BrainControls.tsx` | create | Portals `ScopeSwitch` into the bar's slot from `sm`; inline otherwise |
| `src/features/brain/brainTabs.ts` | create | Tab list, which tab a path lights, the query a tab carries |
| `src/components/layout/BrainTabs.tsx` | create | "Brain" h1 + the four tabs with the waiting badge |
| `src/components/layout/Navbar.tsx` | modify | Brain branch, `isFramed` |
| `src/components/layout/Sidebar.tsx` | modify | One `BrainNavItem` |
| `src/layouts/DashboardLayout.tsx` | modify | `p-0` on Brain routes |
| `src/components/brain/styles.ts` | modify | `SECTION_TITLE`, `tileRow()` |
| `src/components/brain/ChangedTiles.tsx` | create | What changed's metric tiles |
| `src/components/brain/BrainTiles.tsx` | create | `JumpTile` (a tile that jumps to a section) |
| `src/components/brain/DoingTiles.tsx` | create | Doing's three jump tiles |
| `src/components/brain/CustomerTiles.tsx` | create | Customers' five jump tiles |
| `src/components/brain/BrainBackLink.tsx` | create | "‹ Customers" / "‹ What changed" keeping scope |
| `src/features/brain/brainText.ts` | modify | `TILE_KEYS`, `metricTiles`, `SAY.NO_FIGURE`, `SAY.TILES` |
| `src/features/brain/doingText.ts` | modify | `doingFigures`, `isOnTrack`, tile words |
| `src/features/brain/customersText.ts` | modify | `customerTiles`, `CS.NEGATIVE`, `CS.BACK` |
| `src/components/brain/WaitingDesk.tsx`, `WaitingSkeleton.tsx` | modify | Tiles replace chips; toolbar slot |
| `src/components/brain/MovesList.tsx`, `MeasureTable.tsx`, `ScopeBriefCard.tsx` | modify | Section label style; Watch list width |
| `src/pages/brain/{WhatChanged,Waiting,Doing,Customers,FeatureRequests,Anomalies,Graph}.tsx` | modify | Frame, controls, tiles |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | Describe the frame |

---

### Task 1: BrainFrame and no layout padding on Brain routes

**Files:**
- Create: `src/components/brain/BrainFrame.tsx`
- Test: `src/components/brain/BrainFrame.test.tsx`
- Modify: `src/layouts/DashboardLayout.tsx:59-60,127`
- Test: `src/layouts/DashboardLayout.test.tsx`

**Interfaces:**
- Produces: `BrainFrame({ rail?: ReactNode; children: ReactNode })`. The scroll column carries `data-brain-frame=""`, and its single child is the `flex flex-col gap-4 px-4 pb-6` stack. Tasks 5 to 8 wrap every Brain page in it, and Task 9's house rules check for `<BrainFrame`.

- [ ] **Step 1: Write the failing BrainFrame test**

Create `src/components/brain/BrainFrame.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrainFrame } from './BrainFrame';

describe('BrainFrame (brain UI spec §1.4)', () => {
  it('scrolls one full-width column with a 16px gutter and no centred column', () => {
    render(
      <BrainFrame>
        <p>Body</p>
      </BrainFrame>,
    );
    const column = document.querySelector('[data-brain-frame]') as HTMLElement;
    expect(column).toHaveClass('h-full', 'overflow-y-auto');
    const stack = screen.getByText('Body').parentElement as HTMLElement;
    expect(stack).toHaveClass('flex', 'flex-col', 'gap-4', 'px-4', 'pb-6');
    for (const element of [column, stack]) expect(element.className).not.toMatch(/\bmx-auto\b|\bmax-w-/);
  });

  it('draws the rail beside the column when one is given, and nothing there otherwise', () => {
    const { rerender } = render(
      <BrainFrame>
        <p>Body</p>
      </BrainFrame>,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
    rerender(
      <BrainFrame rail={<aside aria-label="Ask">rail</aside>}>
        <p>Body</p>
      </BrainFrame>,
    );
    const column = document.querySelector('[data-brain-frame]') as HTMLElement;
    expect(column.nextElementSibling).toBe(screen.getByRole('complementary', { name: 'Ask' }));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/brain/BrainFrame.test.tsx --maxWorkers=2`
Expected: FAIL. Vite cannot resolve `./BrainFrame`.

- [ ] **Step 3: Write BrainFrame**

Create `src/components/brain/BrainFrame.tsx`:

```tsx
import type { ReactNode } from 'react';

/** Every Brain route's body (brain UI spec 2026-10-06 §1.4): one full-width
 *  column under the transparent Brain bar that owns its scroll, a 16px
 *  gutter, no centred column and no max width, as OrganizationsFrame lays
 *  out the Organizations list. `rail` is kept for Ask Revenact on the Brain
 *  (the next delivery): it sits beside the column, outside its scroll. */
export function BrainFrame({ rail = null, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 w-full flex-1 gap-3">
      <div data-brain-frame="" className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 pb-6">{children}</div>
      </div>
      {rail}
    </div>
  );
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run src/components/brain/BrainFrame.test.tsx --maxWorkers=2`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing layout test**

In `src/layouts/DashboardLayout.test.tsx`, add these two tests directly after `it('keeps the padding on other pages', …)`:

```tsx
  // The Brain wears its own frame (brain UI spec 2026-10-06 §1.4): BrainFrame's
  // px-4 pb-6 gutters every Brain route, so <main> adds nothing around it.
  it.each(['/brain', '/brain/', '/brain/waiting', '/brain/doing', '/brain/customers', '/brain/requests', '/brain/anomalies', '/brain/graph'])(
    'adds no padding around the Brain at %s',
    (url) => {
      const main = renderAt(url);
      expect(main).toHaveClass('p-0');
      expect(main).not.toHaveClass('p-2');
    },
  );

  it('keeps the padding on a route that only starts with the letters "brain"', () => {
    expect(renderAt('/brainstorm')).toHaveClass('p-2', 'md:p-3', 'lg:p-4');
  });
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run src/layouts/DashboardLayout.test.tsx --maxWorkers=2`
Expected: FAIL. The 8 Brain cases fail with `expected … to have class "p-0"`.

- [ ] **Step 7: Take the padding off Brain routes**

In `src/layouts/DashboardLayout.tsx`, insert after the `isCanvas` line (`const isCanvas = /^\/canvas(\/\d+)?\/?$/.test(location.pathname);`):

```tsx
  // The Brain wears BrainFrame (brain UI spec 2026-10-06 §1.4), whose own
  // px-4 pb-6 gutters it: every /brain route, not a path that only begins
  // with the same letters.
  const isBrain = /^\/brain(\/|$)/.test(location.pathname);
```

Then change the `<main>` condition from

```tsx
(isScenarios || isSettings || isAccountSettings || isCopilot || isCommunications || isDashboard || isOrgView || isContacts || isAccountsView || isPipelinesView || isSegments || isRules || isProjects || isCampaigns || isCanvas) ? 'p-0'
```

to

```tsx
(isScenarios || isSettings || isAccountSettings || isCopilot || isCommunications || isDashboard || isOrgView || isContacts || isAccountsView || isPipelinesView || isSegments || isRules || isProjects || isCampaigns || isCanvas || isBrain) ? 'p-0'
```

- [ ] **Step 8: Run both tests to make sure they pass**

Run: `npx vitest run src/layouts/DashboardLayout.test.tsx src/components/brain/BrainFrame.test.tsx src/layouts/houseRules.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/brain/BrainFrame.tsx src/components/brain/BrainFrame.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat(brain): BrainFrame, and no layout padding on Brain routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: BrainControls (the scope switch in the bar, inline below sm)

**Files:**
- Create: `src/components/brain/BrainControls.tsx`
- Test: `src/components/brain/BrainControls.test.tsx`

**Interfaces:**
- Consumes: `NavActionsSlotContext` (`src/layouts/navActionsSlot.ts`), `ScopeSwitch({ scopes, value, onChange })`, `BrainScope` from `useBrainScope.ts`, and `SM` / `useMediaQuery` from `src/lib/useMediaQuery.ts`.
- Produces: `BrainControls({ brain }: { brain: Pick<BrainScope, 'offered' | 'scope' | 'choose'> })`. It renders nothing until `offered` and `scope` are both set. From `sm` with a slot it portals into the slot; otherwise it renders `<div data-brain-controls="inline">` in place. Pages pass the whole `useBrainScope()` result: `<BrainControls brain={brain} />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/BrainControls.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ScopesPayload } from '../../features/brain/brainTypes';
import { SlotHost } from '../../test/SlotHost';
import { resetViewport, setViewport } from '../../test/viewport';
import { BrainControls } from './BrainControls';
import type { BrainScope } from './useBrainScope';

const OFFERED: ScopesPayload = {
  scopes: [
    { key: 'me', label: 'Me' },
    { key: 'team', label: 'My team' },
    { key: 'company', label: 'Company' },
  ],
  default: 'company',
};
type Controls = Pick<BrainScope, 'offered' | 'scope' | 'choose'>;
const brain = (over: Partial<Controls> = {}): Controls => ({ offered: OFFERED, scope: 'team', choose: vi.fn(), ...over });

describe('BrainControls (brain UI spec §1.2)', () => {
  afterEach(resetViewport);

  it('portals the scope switch into the bar’s actions slot from sm, as AskControls does', () => {
    setViewport(1440);
    render(
      <SlotHost bare>
        <main>
          <BrainControls brain={brain()} />
        </main>
      </SlotHost>,
    );
    const slot = screen.getByTestId('nav-actions');
    expect(within(slot).getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('main')).queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('renders inline at the top of the page below sm, as a select, even with a slot', () => {
    setViewport(375);
    render(
      <SlotHost bare>
        <main>
          <BrainControls brain={brain()} />
        </main>
      </SlotHost>,
    );
    expect(within(screen.getByTestId('nav-actions')).queryByRole('combobox')).toBeNull();
    expect(within(screen.getByRole('main')).getByRole('combobox', { name: 'View' })).toHaveValue('team');
  });

  it('renders inline when there is no slot (a page rendered on its own)', () => {
    setViewport(1440);
    render(
      <main>
        <BrainControls brain={brain()} />
      </main>,
    );
    expect(within(screen.getByRole('main')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('renders nothing until the scope settles', () => {
    setViewport(1440);
    render(
      <SlotHost bare>
        <BrainControls brain={brain({ scope: null })} />
      </SlotHost>,
    );
    expect(screen.getByTestId('nav-actions')).toBeEmptyDOMElement();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/brain/BrainControls.test.tsx --maxWorkers=2`
Expected: FAIL. `./BrainControls` cannot be resolved.

- [ ] **Step 3: Write BrainControls**

Create `src/components/brain/BrainControls.tsx`:

```tsx
import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ScopeSwitch } from './ScopeSwitch';
import type { BrainScope } from './useBrainScope';

/** A Brain page's controls (brain UI spec 2026-10-06 §1.2): the scope
 *  switch, portaled into the Brain bar's actions slot the way AskControls
 *  portals the Ask pill. Below sm, where the slot may not fit beside the
 *  tabs, or with no slot at all (a page rendered on its own), it renders in
 *  place at the top of the page instead. Nothing until the scope settles. */
export function BrainControls({ brain }: { brain: Pick<BrainScope, 'offered' | 'scope' | 'choose'> }) {
  const { slot } = useContext(NavActionsSlotContext);
  const wide = useMediaQuery(SM);
  if (!brain.offered || !brain.scope) return null;
  const controls = <ScopeSwitch scopes={brain.offered.scopes} value={brain.scope} onChange={brain.choose} />;
  if (slot && wide) {
    return createPortal(
      <div data-brain-controls="bar" className="flex items-center gap-3">
        {controls}
      </div>,
      slot,
    );
  }
  return (
    <div data-brain-controls="inline" className="flex">
      {controls}
    </div>
  );
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run src/components/brain/BrainControls.test.tsx src/components/brain/houseRules.test.ts --maxWorkers=2`
Expected: PASS. The house-rules suite picks up the new file through `./*.tsx` and passes, since the file has no controls of its own.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/BrainControls.tsx src/components/brain/BrainControls.test.tsx
git commit -m "feat(brain): BrainControls portals the scope switch into the bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The framed Brain bar (tabs and the waiting badge)

**Files:**
- Create: `src/features/brain/brainTabs.ts`
- Test: `src/features/brain/brainTabs.test.ts`
- Create: `src/components/layout/BrainTabs.tsx`
- Modify: `src/components/layout/Navbar.tsx:1-33,103-106,156-157,520-524`
- Test: `src/components/layout/Navbar.test.tsx:871-898`
- Modify: `src/e2e/brain.test.tsx:11,43,98,103,119-120,190,228`

**Interfaces:**
- Consumes: `useWaitingCount(userId: number | null): number | null` (`src/components/brain/useWaitingCount.ts`).
- Produces (in `src/features/brain/brainTabs.ts`):
  - `BRAIN_TABS: readonly { path: string; label: string }[]` (What changed, Waiting on you, What's being done, Customers)
  - `WAITING_TAB = '/brain/waiting'`
  - `isBrainPath(pathname: string): boolean` (Task 4 uses it for the sidebar)
  - `brainTabOf(pathname: string): string | null`
  - `tabSearch(search: string): string`, which returns `?scope=…` or `''`
  - `tabName(label: string, count: number | null): string`
- Produces: `BrainTabs()` in `src/components/layout/BrainTabs.tsx`.

- [ ] **Step 1: Write the failing unit test for the tab rules**

Create `src/features/brain/brainTabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BRAIN_TABS, brainTabOf, isBrainPath, tabName, tabSearch } from './brainTabs';

describe('the Brain bar’s tabs (brain UI spec §1.1)', () => {
  it('lists the four questions, Customers last', () => {
    expect(BRAIN_TABS.map((tab) => [tab.label, tab.path])).toEqual([
      ['What changed', '/brain'],
      ['Waiting on you', '/brain/waiting'],
      ["What's being done", '/brain/doing'],
      ['Customers', '/brain/customers'],
    ]);
  });

  it.each([
    ['/brain', '/brain'],
    ['/brain/', '/brain'],
    ['/brain/waiting', '/brain/waiting'],
    ['/brain/doing/', '/brain/doing'],
    ['/brain/customers', '/brain/customers'],
    ['/brain/requests', '/brain/customers'],
    ['/brain/anomalies', '/brain/customers'],
    ['/brain/graph', null],
  ])('lights the right tab on %s', (path, tab) => {
    expect(brainTabOf(path)).toBe(tab);
  });

  it('knows a Brain route from a path that only begins with the same letters', () => {
    expect(['/brain', '/brain/', '/brain/graph'].map(isBrainPath)).toEqual([true, true, true]);
    expect(isBrainPath('/brainstorm')).toBe(false);
  });

  it('carries ?scope= and nothing else', () => {
    expect(tabSearch('?section=plans&scope=team')).toBe('?scope=team');
    expect(tabSearch('?scope=company&product=product%3A4')).toBe('?scope=company');
    expect(tabSearch('?section=asks')).toBe('');
    expect(tabSearch('')).toBe('');
  });

  it('puts the count in the tab’s own name, and none at 0', () => {
    expect(tabName('Waiting on you', 3)).toBe('Waiting on you, 3 waiting');
    expect(tabName('Waiting on you', 0)).toBe('Waiting on you');
    expect(tabName('Waiting on you', null)).toBe('Waiting on you');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/features/brain/brainTabs.test.ts --maxWorkers=2`
Expected: FAIL. `./brainTabs` cannot be resolved.

- [ ] **Step 3: Write the tab rules**

Create `src/features/brain/brainTabs.ts`:

```ts
// The Brain bar's tabs (brain UI spec 2026-10-06 §1.1), kept free of React
// so the rules are unit-tested on their own.

export interface BrainTab {
  path: string;
  label: string;
}

export const WAITING_TAB = '/brain/waiting';

export const BRAIN_TABS: readonly BrainTab[] = [
  { path: '/brain', label: 'What changed' },
  { path: WAITING_TAB, label: 'Waiting on you' },
  { path: '/brain/doing', label: "What's being done" },
  { path: '/brain/customers', label: 'Customers' },
];

/** Every Brain route wears the Brain bar; `/brainstorm` would not. */
export function isBrainPath(pathname: string): boolean {
  return /^\/brain(\/|$)/.test(pathname);
}

/** The tab a Brain route lights. What changed lights only at /brain itself.
 *  Customers also lights on Feature Requests and Anomalies, which open from
 *  its See all. The Knowledge graph lights none. */
export function brainTabOf(pathname: string): string | null {
  if (/^\/brain\/?$/.test(pathname)) return '/brain';
  if (/^\/brain\/waiting\/?$/.test(pathname)) return WAITING_TAB;
  if (/^\/brain\/doing\/?$/.test(pathname)) return '/brain/doing';
  if (/^\/brain\/(customers|requests|anomalies)(\/|$)/.test(pathname)) return '/brain/customers';
  return null;
}

/** The query a tab carries: the scope only. `?section=` and the graph's
 *  `?owner=` / `?product=` belong to one page, not to the next one. */
export function tabSearch(search: string): string {
  const scope = new URLSearchParams(search).get('scope');
  return scope ? `?${new URLSearchParams({ scope }).toString()}` : '';
}

/** "Waiting on you, 3 waiting": the count belongs in the tab's own
 *  accessible name, as on the sidebar (Waiting review I2). */
export function tabName(label: string, count: number | null): string {
  return count ? `${label}, ${count} waiting` : label;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run src/features/brain/brainTabs.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Write the failing Navbar tests**

In `src/components/layout/Navbar.test.tsx`, inside `describe('Navbar on the Brain and Settings > AI (spec 2026-10-05 §2.1)', …)`, delete the four tests that start `it('titles /brain without a heading…`, `it('titles /brain/waiting without a heading…`, `it("titles /brain/doing without a heading…` and `it('titles /brain/customers without a heading…`. Keep that describe's `beforeEach` and its two Settings > AI tests. Rename the describe to `'Navbar on Settings > AI (spec 2026-10-05 §2.1)'`. Then add this new describe directly after it:

```tsx
describe('Navbar on the Brain (brain UI spec 2026-10-06 §1.1)', () => {
  const countOf = (n: number) => vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ count: n }) }));
  const tabs = () => within(screen.getByRole('navigation', { name: 'Brain' }));

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', countOf(3));
  });

  it.each([
    ['/brain', 'What changed'],
    ['/brain/waiting', 'Waiting on you, 3 waiting'],
    ['/brain/doing', "What's being done"],
    ['/brain/customers', 'Customers'],
    ['/brain/requests', 'Customers'],
    ['/brain/anomalies', 'Customers'],
  ])('on %s: the framed bar, "Brain" as its h1, the four tabs, "%s" current', async (url, current) => {
    const setSlot = vi.fn();
    renderNavbar(url, null, null, [], setSlot);
    expect(screen.getByRole('heading', { level: 1, name: 'Brain' })).toBeInTheDocument();
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    await tabs().findByRole('link', { name: 'Waiting on you, 3 waiting' });
    expect(tabs().getAllByRole('link').map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual([
      'What changed',
      'Waiting on you, 3 waiting',
      "What's being done",
      'Customers',
    ]);
    const lit = tabs().getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(lit).toEqual([tabs().getByRole('link', { name: current })]);
  });

  it('lights no tab on the Knowledge graph', async () => {
    renderNavbar('/brain/graph?scope=team');
    await tabs().findByRole('link', { name: 'Waiting on you, 3 waiting' });
    expect(tabs().getAllByRole('link').some((link) => link.hasAttribute('aria-current'))).toBe(false);
  });

  it('carries ?scope= to every tab, and nothing else from the query', async () => {
    renderNavbar('/brain/doing?section=plans&scope=team');
    await tabs().findByRole('link', { name: 'Waiting on you, 3 waiting' });
    expect(tabs().getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/brain?scope=team',
      '/brain/waiting?scope=team',
      '/brain/doing?scope=team',
      '/brain/customers?scope=team',
    ]);
  });

  it('shows the reader’s Me count on Waiting on you, as the sidebar badge does', async () => {
    renderNavbar('/brain');
    const waiting = await tabs().findByRole('link', { name: 'Waiting on you, 3 waiting' });
    expect(within(waiting).getByText('3')).toHaveClass('bg-warning', 'font-mono-brand', 'tabular-nums');
  });

  it('shows no badge and no count in the name at 0', async () => {
    vi.stubGlobal('fetch', countOf(0));
    renderNavbar('/brain');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const waiting = tabs().getByRole('link', { name: 'Waiting on you' });
    expect(waiting.querySelector('.bg-warning')).toBeNull();
  });

  it('keeps the tabs on one line, the row scrolling sideways on phones', () => {
    renderNavbar('/brain/customers');
    const nav = screen.getByRole('navigation', { name: 'Brain' });
    expect(nav).toHaveClass('overflow-x-auto');
    expect(nav).not.toHaveClass('flex-wrap');
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('whitespace-nowrap', 'shrink-0', 'min-h-11');
  });

  it('keeps no avatar in the Brain bar', () => {
    renderNavbar('/brain');
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `npx vitest run src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: FAIL. The new describe fails with `Unable to find role="navigation" and name "Brain"`.

- [ ] **Step 7: Write BrainTabs**

Create `src/components/layout/BrainTabs.tsx`:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { BRAIN_TABS, brainTabOf, tabName, tabSearch, WAITING_TAB } from '../../features/brain/brainTabs';
import { useWaitingCount } from '../brain/useWaitingCount';

const TAB =
  'inline-flex h-full min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-semibold transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** The Brain bar (brain UI spec 2026-10-06 §1.1): "Brain", then the four
 *  questions as underline tabs, class for class the Organizations tabs. The
 *  tabs carry `?scope=`. Below sm the row scrolls sideways and never wraps.
 *  Waiting on you shows the reader's Me count, as the sidebar badge does,
 *  folded into its accessible name. */
export function BrainTabs() {
  const location = useLocation();
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const count = useWaitingCount(userId);
  const current = brainTabOf(location.pathname);
  const search = tabSearch(location.search);
  return (
    <div className="flex h-full min-w-0 items-center gap-4">
      <h1 className="shrink-0 text-[15px] font-bold tracking-tight text-ink">Brain</h1>
      <nav aria-label="Brain" className="flex h-full min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none]">
        {BRAIN_TABS.map((tab) => {
          const active = tab.path === current;
          const badge = tab.path === WAITING_TAB && count ? count : null;
          return (
            <Link
              key={tab.path}
              to={{ pathname: tab.path, search }}
              aria-current={active ? 'page' : undefined}
              aria-label={badge ? tabName(tab.label, badge) : undefined}
              className={`${TAB} ${active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {tab.label}
              {badge ? (
                <span
                  aria-hidden="true"
                  className="h-4 min-w-[16px] rounded-full bg-warning px-1 text-center font-mono-brand text-[11px] font-bold leading-4 tabular-nums text-on-accent"
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 8: Wire it into the Navbar**

In `src/components/layout/Navbar.tsx`:

1. Add two imports after `import { pipelinesViewOf } from '../../features/pipelines/askContext';`:

```tsx
import { isBrainPath } from '../../features/brain/brainTabs';
```

and after `import { UserAvatar } from './UserAvatar';`:

```tsx
import { BrainTabs } from './BrainTabs';
```

2. Replace

```tsx
  // /brain, /brain/waiting, /brain/doing and /brain/customers draw their own
  // h1 (delivery 1 Decision 12; Waiting plan Decision 9; Doing plan Decision
  // 13; customers plan Decision 13).
  const isBrainHome = /^\/brain(\/waiting|\/doing|\/customers)?\/?$/.test(location.pathname);
```

with

```tsx
  // Every Brain route wears the framed bar (brain UI spec 2026-10-06 §1.1):
  // "Brain" and the four tabs, the actions slot (where BrainControls portals
  // the scope switch), and no avatar.
  const isBrain = isBrainPath(location.pathname);
```

3. In the `isFramed` expression, change the tail `|| isCanvas || isCanvasPage;` to `|| isCanvas || isCanvasPage || isBrain;`.

4. Replace

```tsx
        ) : isBrainHome ? (
          <div className="flex min-w-0 items-center gap-2 py-1.5 px-2 -ml-2 rounded-md">
            <p className="min-w-0 truncate text-[15px] font-bold text-ink tracking-tight">Brain</p>
          </div>
        ) : (
```

with

```tsx
        ) : isBrain ? (
          <BrainTabs />
        ) : (
```

- [ ] **Step 9: Run the Navbar and layout suites**

Run: `npx vitest run src/components/layout --maxWorkers=2`
Expected: PASS, including `components/layout house rules` and the touch-target suite. `BrainTabs`' `<Link className={`${TAB} …`}>` complies through `TAB`.

- [ ] **Step 10: Keep the e2e journeys green under the new bar**

The journeys render the real Navbar (`nav: true`). It now draws "Brain" as an h1 and its own "Waiting on you, N waiting" tab, which also reads the count. Edit `src/e2e/brain.test.tsx`:

1. Delete the line `import { WAIT } from '../features/brain/waitingText';` (its only use goes away below).
2. Replace each of these four lines

```tsx
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([SAY.TITLE]);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([WAIT.TITLE]);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([DO.TITLE]);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([CS.TITLE]);
```

with

```tsx
    expect(screen.getByRole('heading', { level: 1, name: 'Brain' })).toBeInTheDocument();
```

3. In `'a manager sees a report’s task proposal in My team and approves it once'`, replace

```tsx
    // 1. Me: my own desk, with the badge's count in the link's own accessible name (I2).
    const link = await screen.findByRole('link', { name: 'Waiting on you, 4 waiting' });
```

with

```tsx
    // 1. Me: my own desk, with the badge's count in the tab's own accessible name (I2).
    const link = await within(screen.getByRole('navigation', { name: 'Brain' })).findByRole('link', { name: 'Waiting on you, 4 waiting' });
```

4. In the same test, replace

```tsx
    // 4. The badge read again: Carl's proposal was never on my own desk.
    await waitFor(() => expect(requests(spy, 'GET', '/brain/waiting/count/')).toHaveLength(2));
```

with

```tsx
    // 4. The badges read again: Carl's proposal was never on my own desk.
    // Two badges read the count now (the bar's tab and the sidebar's item),
    // each once on mount and once after the decision.
    await waitFor(() => expect(requests(spy, 'GET', '/brain/waiting/count/')).toHaveLength(4));
```

- [ ] **Step 11: Run the journeys and the type check**

Run: `npx vitest run src/e2e/brain.test.tsx src/e2e/rules.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS, and tsc reports no errors.

- [ ] **Step 12: Commit**

```bash
git add src/features/brain/brainTabs.ts src/features/brain/brainTabs.test.ts src/components/layout/BrainTabs.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/e2e/brain.test.tsx
git commit -m "feat(brain): the framed Brain bar with four tabs and the waiting badge

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The sidebar keeps one Brain item

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:3,83-87,204-215,305-329`
- Test: `src/components/layout/Sidebar.test.tsx:180-273`
- Modify: `src/pages/brain/testPages.tsx:6,21-33`
- Modify: `src/e2e/brain.test.tsx` (the two Waiting journeys)

**Interfaces:**
- Consumes: `isBrainPath(pathname)` from Task 3.
- Produces: `BrainNavItem({ expanded?: boolean })`, exported from `Sidebar.tsx` (it replaces `WaitingNavItem`). Its accessible name is `"Brain"`, or `"Brain, N waiting"` when the count is above 0. `renderBrain`'s option `waitingLink` is renamed `brainLink`.

- [ ] **Step 1: Write the failing sidebar tests**

In `src/components/layout/Sidebar.test.tsx`, replace the whole `describe('Sidebar Brain group (spec 2026-10-05 §2.1)', () => { … });` block with:

```tsx
describe('Sidebar Brain item (brain UI spec 2026-10-06 §1.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  const countSpy = (...counts: number[]) =>
    vi.fn<(url: string) => Promise<unknown>>((url) =>
      Promise.resolve(url.includes('/brain/waiting/count/') ? jsonResponse(200, { count: counts.length > 1 ? counts.shift() : counts[0] }) : jsonResponse(200, [])),
    );

  it('gives every member one Brain item to /brain, with the Me count in its accessible name, and none of the four questions', async () => {
    const spy = countSpy(3);
    vi.stubGlobal('fetch', spy);
    renderSidebar('csm');
    const brain = await screen.findByRole('link', { name: 'Brain, 3 waiting' });
    expect(brain).toHaveAttribute('href', '/brain');
    expect(within(brain).getByText('3')).toBeInTheDocument();
    for (const name of ['What changed', 'Waiting on you', "What's being done", 'What customers are saying', 'Review Queue', 'Initiatives', 'Feature Requests', 'Anomalies', 'Knowledge Graph', 'Users']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(spy.mock.calls.some(([url]) => url.includes('/metrics/proposals/'))).toBe(false);
  });

  it.each(['/brain', '/brain/waiting', '/brain/doing', '/brain/customers', '/brain/requests', '/brain/anomalies', '/brain/graph'])('lights Brain on %s', async (url) => {
    renderSidebar('csm', url);
    expect(await screen.findByRole('link', { name: /^Brain/ })).toHaveAttribute('aria-current', 'page');
  });

  it('does not light Brain anywhere else', async () => {
    renderSidebar('csm', '/dashboard');
    expect(await screen.findByRole('link', { name: /^Brain/ })).not.toHaveAttribute('aria-current');
  });

  it('reads the count again when a decision asks it to', async () => {
    vi.stubGlobal('fetch', countSpy(3, 2));
    renderSidebar('csm');
    const brain = await screen.findByRole('link', { name: 'Brain, 3 waiting' });
    act(() => refreshWaitingCount());
    await waitFor(() => expect(brain).toHaveAttribute('aria-label', 'Brain, 2 waiting'));
    expect(within(brain).getByText('2')).toBeInTheDocument();
  });

  it('refreshes the badge on a route change, not only on refreshWaitingCount() (M9)', async () => {
    vi.stubGlobal('fetch', countSpy(3, 2));
    renderSidebarWithRoutes('csm', '/brain/waiting');
    const brain = await screen.findByRole('link', { name: 'Brain, 3 waiting' });
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    await waitFor(() => expect(brain).toHaveAttribute('aria-label', 'Brain, 2 waiting'));
  });

  it('shows no badge at 0, and its name carries no count', async () => {
    vi.stubGlobal('fetch', countSpy(0));
    renderSidebar('csm');
    const brain = await screen.findByRole('link', { name: 'Brain' });
    await waitFor(() => expect(brain.querySelector('.bg-warning')).toBeNull());
    expect(screen.queryByRole('link', { name: /^brain,/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx --maxWorkers=2`
Expected: FAIL. `Unable to find role="link" and name "Brain, 3 waiting"`.

- [ ] **Step 3: Collapse the sidebar's Brain group to one item**

In `src/components/layout/Sidebar.tsx`:

1. In the lucide import on line 3, delete `Flag, `, `Inbox, ` and `MessagesSquare, ` (each was used only by the removed items). Keep `Brain`.
2. After `import { MD, useMediaQuery } from '../../lib/useMediaQuery';`, add:

```tsx
import { isBrainPath } from '../../features/brain/brainTabs';
```

3. Delete these lines:

```tsx
  // Final review minor #6: Feature Requests, Anomalies and the graph are off
  // the sidebar (customers Decision 10), but requests and anomalies still
  // open from What customers are saying's See all, so light that item for
  // them. The graph has its own "See on the graph" link, not this one.
  const isCustomersActive = location.pathname.startsWith('/brain/requests') || location.pathname.startsWith('/brain/anomalies');
```

4. Replace

```tsx
        {/* KNOWLEDGE BRAIN (spec 2026-10-05 §2.1; Waiting §2.2; Doing §2.2;
            customers §2.3): the four questions, for every member: What
            changed, Waiting on you (with the reader's Me count), What's
            being done, What customers are saying. Feature Requests and
            Anomalies open from What customers are saying's See all; the
            Knowledge graph from What changed and What customers are saying;
            Agents, Skills and Feedback Log live in Settings > AI. */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>
        <NavItem to="/brain" end icon={<Brain className="w-5 h-5" aria-hidden="true" />} label="What changed" expanded={isOpen} />
        <WaitingNavItem expanded={isOpen} />
        <NavItem to="/brain/doing" icon={<Flag className="w-5 h-5" aria-hidden="true" />} label="What's being done" expanded={isOpen} />
        <NavItem to="/brain/customers" icon={<MessagesSquare className="w-5 h-5" aria-hidden="true" />} label="What customers are saying" forceActive={isCustomersActive} expanded={isOpen} />
```

with

```tsx
        {/* KNOWLEDGE BRAIN (brain UI spec 2026-10-06 §1.3): one item for every
            member, lit on every Brain route, with the reader's Me count. The
            four questions are the Brain bar's tabs; Agents, Skills and
            Feedback Log live in Settings > AI. */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>
        <BrainNavItem expanded={isOpen} />
```

5. Replace the whole `WaitingNavItem` function, from its doc comment `/** Waiting on you with the reader's Me count (Waiting spec Decision 5), for` through its closing `}`, with:

```tsx
/** The Brain (brain UI spec 2026-10-06 §1.3): one item for every member, to
 *  /brain, lit on every Brain route (the bar's tabs carry the four
 *  questions), with the reader's Me count as its badge (Waiting spec
 *  Decision 5). Exported for the Brain's jsdom journeys. The count also
 *  refreshes on every route change (M9): answering a question or finishing
 *  a task on another page doesn't go through `refreshWaitingCount()`, and
 *  the backend says the count is cheap to re-read. The first render's
 *  pathname is skipped so mounting doesn't double the initial read. */
export function BrainNavItem({ expanded = false }: { expanded?: boolean }) {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const count = useWaitingCount(userId);
  const location = useLocation();
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) refreshWaitingCount();
    else mounted.current = true;
  }, [location.pathname]);
  return (
    <NavItem
      to="/brain"
      icon={<Brain className="w-5 h-5" aria-hidden="true" />}
      label="Brain"
      badge={count ?? undefined}
      forceActive={isBrainPath(location.pathname)}
      expanded={expanded}
    />
  );
}
```

- [ ] **Step 4: Rename the journeys' helper option**

In `src/pages/brain/testPages.tsx`, change `import { WaitingNavItem } from '../../components/layout/Sidebar';` to `import { BrainNavItem } from '../../components/layout/Sidebar';`. Rename the option `waitingLink` to `brainLink` in the destructuring (`brainLink = false,`) and in its type (`brainLink?: boolean;`). Replace `{waitingLink ? <WaitingNavItem /> : null}` with `{brainLink ? <BrainNavItem /> : null}`.

In `src/e2e/brain.test.tsx`:
- `renderBrain('/brain/waiting?scope=me', { nav: true, role: 'csm', waitingLink: true });` becomes `renderBrain('/brain/waiting?scope=me', { nav: true, role: 'csm', brainLink: true });`
- `renderBrain('/brain/review', { role: 'csm', waitingLink: true });` becomes `renderBrain('/brain/review', { role: 'csm', brainLink: true });`
- In `'a member without view_all_accounts lands from the old link, skips a review, and the badge drops'`, replace `const link = await screen.findByRole('link', { name: 'Waiting on you, 4 waiting' });` with `const link = await screen.findByRole('link', { name: 'Brain, 4 waiting' });`.

- [ ] **Step 5: Run the suites**

Run: `npx vitest run src/components/layout src/e2e/brain.test.tsx src/pages/brain --maxWorkers=2 && npx tsc -b`
Expected: PASS, and tsc reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/pages/brain/testPages.tsx src/e2e/brain.test.tsx
git commit -m "feat(brain): one Brain item in the sidebar, lit on every Brain route

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: What changed: tiles and the two-column body

**Files:**
- Modify: `src/components/brain/styles.ts`
- Modify: `src/features/brain/brainText.ts`
- Test: `src/features/brain/brainText.test.ts`
- Modify: `src/features/brain/testBrainFixtures.ts`
- Create: `src/components/brain/ChangedTiles.tsx`
- Test: `src/components/brain/ChangedTiles.test.tsx`
- Modify: `src/components/brain/MovesList.tsx:16-18`, `src/components/brain/MeasureTable.tsx:14-17`, `src/components/brain/ScopeBriefCard.tsx:57`
- Modify (whole file): `src/pages/brain/WhatChanged.tsx`
- Test: `src/pages/brain/WhatChanged.test.tsx`

**Interfaces:**
- Consumes: `BrainFrame` (Task 1) and `BrainControls` (Task 2). From `tileParts`: `Tile({ title, action?, children })`, which renders `role="group"` named by an `h2`, and `TilesSkeleton({ count? })`.
- Produces in `src/components/brain/styles.ts`: `SECTION_TITLE: string` and `tileRow(columns: 2 | 3 | 4 | 5): string`. Tasks 6 and 7 use both.
- Produces in `brainText.ts`:
  - `TILE_KEYS = ['active_arr', 'nrr', 'at_risk_arr', 'healthy_share']`
  - `MetricTile { key; label; figure: string | null; change: { text: string; tone: Tone } | null }`
  - `metricTiles(metrics: ChangedMetric[], currency: CurrencyCode): MetricTile[]`
  - `SAY.NO_FIGURE = 'No figure'` and `SAY.TILES = 'Headline figures'`
- Produces in fixtures: `TILE_METRICS: ChangedMetric[]` and `COMPANY_TILES: ChangedPayload`.

**Metric keys.** These are the backend registry's own keys (`revenact-backend/services/metrics/registry.py` `METRICS`). `services/brain/changed.py` emits one row per registry metric, keyed `metric.key`: ARR is `active_arr`, NRR is `nrr`, ARR at risk is `at_risk_arr`, and the healthy share is `healthy_share` ("Book in good health"). The registry has **no renewals-due metric**, so What changed shows four tiles. The existing test fixtures use `arr` / `arr_at_risk`, which match no registry key. Leave them alone: the explanation tests depend on them. New fixtures with the real keys follow.

- [ ] **Step 1: Add the fixtures**

Append to `src/features/brain/testBrainFixtures.ts`:

```ts
/** The tiles' metrics under the registry's real keys
 *  (revenact-backend services/metrics/registry.py), out of order, with one
 *  key the tiles skip (active_customers) and a withheld NRR. */
export const TILE_METRICS: ChangedMetric[] = [
  metric('active_customers', 'Active customers', 'count', 'none', 40, 41),
  metric('healthy_share', 'Book in good health', 'percent', 'up', 62, 60),
  metric('at_risk_arr', 'ARR at risk', 'money', 'down', 114540, 64090, true),
  metric('nrr', 'Net revenue retention', 'percent', 'up', null, 108),
  metric('active_arr', 'ARR', 'money', 'up', 688600, 702000),
];

export const COMPANY_TILES: ChangedPayload = { ...COMPANY, metrics: TILE_METRICS };
```

- [ ] **Step 2: Write the failing unit tests for `metricTiles`**

Append to `src/features/brain/brainText.test.ts`. Add `metricTiles` to the existing `./brainText` import, and add `import { TILE_METRICS } from './testBrainFixtures';` (or extend that import if one exists):

```ts
describe('metricTiles (brain UI spec §2, What changed)', () => {
  it('takes ARR, NRR, ARR at risk and the healthy share by registry key, in that order', () => {
    expect(metricTiles(TILE_METRICS, 'USD').map((tile) => tile.key)).toEqual(['active_arr', 'nrr', 'at_risk_arr', 'healthy_share']);
  });

  it('skips a key the scope does not have', () => {
    const noNrr = TILE_METRICS.filter((m) => m.key !== 'nrr');
    expect(metricTiles(noNrr, 'USD').map((tile) => tile.key)).toEqual(['active_arr', 'at_risk_arr', 'healthy_share']);
  });

  it('gives the figure now, the change, and whether that is better or worse, read from `better`', () => {
    const [arr, , atRisk, healthy] = metricTiles(TILE_METRICS, 'USD');
    expect(arr).toEqual({ key: 'active_arr', label: 'ARR', figure: '$688.6K', change: { text: 'down $13.4K, worse', tone: 'bad' } });
    expect(atRisk.change).toEqual({ text: 'up $50.5K, worse', tone: 'bad' });
    expect(healthy).toMatchObject({ figure: '62%', change: { text: 'up 2 pts, better', tone: 'good' } });
  });

  it('withholds what the server withheld: no figure, no change', () => {
    expect(metricTiles(TILE_METRICS, 'USD')[1]).toEqual({ key: 'nrr', label: 'Net revenue retention', figure: null, change: null });
  });

  it('says "Not compared" with nothing then, and "unchanged" with no move, with no direction word', () => {
    const arr = TILE_METRICS.find((m) => m.key === 'active_arr')!;
    const nrr = TILE_METRICS.find((m) => m.key === 'nrr')!;
    const tiles = metricTiles([{ ...arr, then: null, change: null }, { ...nrr, now: 104, then: 104, change: 0 }], 'USD');
    expect(tiles.map((tile) => tile.change)).toEqual([
      { text: 'Not compared', tone: 'neutral' },
      { text: 'unchanged', tone: 'neutral' },
    ]);
  });
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `npx vitest run src/features/brain/brainText.test.ts --maxWorkers=2`
Expected: FAIL. `metricTiles` is not exported.

- [ ] **Step 4: Write `metricTiles`**

In `src/features/brain/brainText.ts`:
1. Change the type import to `import type { Better, ChangedMetric, ChangedPayload, Driver, Handover, MetricUnit, ScopeBrief, ScopeKey } from './brainTypes';`.
2. Inside `SAY`, after `KNOWLEDGE_GRAPH: 'Knowledge graph',`, add:

```ts
  TILES: 'Headline figures',
  NO_FIGURE: 'No figure',
```

3. Append:

```ts
/** What changed's tiles (brain UI spec 2026-10-06 §2), by the backend
 *  registry's own keys (services/metrics/registry.py): ARR, NRR, ARR at
 *  risk and the healthy share. The registry has no renewals-due metric, so
 *  there are four. */
export const TILE_KEYS = ['active_arr', 'nrr', 'at_risk_arr', 'healthy_share'] as const;

export interface MetricTile {
  key: string;
  label: string;
  /** Null when the server withheld it: the tile says "No figure". */
  figure: string | null;
  change: { text: string; tone: Tone } | null;
}

/** The tiles in TILE_KEYS order, skipping a key the scope doesn't have. The
 *  change is a sentence ("down $13.4K, worse"): the direction is a word,
 *  never colour alone. */
export function metricTiles(metrics: ChangedMetric[], currency: CurrencyCode): MetricTile[] {
  return TILE_KEYS.flatMap((key): MetricTile[] => {
    const m = metrics.find((one) => one.key === key);
    if (!m) return [];
    if (m.now === null) return [{ key, label: m.label, figure: null, change: null }];
    const tone = toneOf(m.better, m.change);
    const direction = tone === 'good' ? ', better' : tone === 'bad' ? ', worse' : '';
    return [{ key, label: m.label, figure: valueText(m.unit, m.now, currency), change: { text: `${changeText(m.unit, m.change, currency)}${direction}`, tone } }];
  });
}
```

- [ ] **Step 5: Run them to make sure they pass**

Run: `npx vitest run src/features/brain/brainText.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Add the shared styles**

Append to `src/components/brain/styles.ts`:

```ts
/** A section's heading on a Brain page: the tile label style (brain UI spec §1.5). */
export const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

const TILE_COLUMNS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' } as const;

/** A row of tiles, as Organizations' SummaryTiles lays it out: below sm a
 *  sideways snap strip that bleeds to the frame's edge (the page never
 *  scrolls sideways), from sm a grid of two, and `columns` from lg. */
export function tileRow(columns: 2 | 3 | 4 | 5): string {
  return `-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 ${TILE_COLUMNS[columns]}`;
}
```

- [ ] **Step 7: Write the failing ChangedTiles test**

Create `src/components/brain/ChangedTiles.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SAY } from '../../features/brain/brainText';
import { TILE_METRICS } from '../../features/brain/testBrainFixtures';
import { ChangedTiles } from './ChangedTiles';

describe('ChangedTiles (brain UI spec §2)', () => {
  it('draws ARR, NRR, ARR at risk and the healthy share, in that order, as a snap row', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const row = screen.getByRole('group', { name: SAY.TILES });
    expect(within(row).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['ARR', 'Net revenue retention', 'ARR at risk', 'Book in good health']);
    expect(row).toHaveClass('overflow-x-auto', 'snap-x', 'sm:grid', 'lg:grid-cols-4');
  });

  it('sets the figure at 22px in DM Mono, and the change as a sentence in its trend colour', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const arr = screen.getByRole('group', { name: 'ARR' });
    expect(within(arr).getByText('$688.6K')).toHaveClass('font-mono-brand', 'tabular-nums', 'text-[22px]');
    const change = arr.querySelector('[data-part="change"]');
    expect(change).toHaveTextContent('down $13.4K, worse');
    expect(change).toHaveClass('text-danger');
    expect(screen.getByRole('group', { name: 'Book in good health' }).querySelector('[data-part="change"]')).toHaveClass('text-success');
  });

  it('says "No figure" for a withheld figure, with no change', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const nrr = screen.getByRole('group', { name: 'Net revenue retention' });
    expect(within(nrr).getByText(SAY.NO_FIGURE)).toBeInTheDocument();
    expect(nrr.querySelector('[data-part="change"]')).toBeNull();
  });

  it('skips what the scope lacks, and narrows the grid to what is left', () => {
    render(<ChangedTiles metrics={TILE_METRICS.filter((m) => m.key !== 'nrr' && m.key !== 'healthy_share')} currency="USD" />);
    const row = screen.getByRole('group', { name: SAY.TILES });
    expect(within(row).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['ARR', 'ARR at risk']);
    expect(row).toHaveClass('lg:grid-cols-2');
  });

  it('draws nothing when the scope has none of the four', () => {
    const { container } = render(<ChangedTiles metrics={TILE_METRICS.filter((m) => m.key === 'active_customers')} currency="USD" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 8: Run it to make sure it fails**

Run: `npx vitest run src/components/brain/ChangedTiles.test.tsx --maxWorkers=2`
Expected: FAIL. `./ChangedTiles` cannot be resolved.

- [ ] **Step 9: Write ChangedTiles**

Create `src/components/brain/ChangedTiles.tsx`:

```tsx
import type { CurrencyCode } from '../../features/auth/authSlice';
import { metricTiles, SAY } from '../../features/brain/brainText';
import type { ChangedMetric } from '../../features/brain/brainTypes';
import { MONO } from '../organizations/portfolio/styles';
import { Tile } from '../organizations/portfolio/tileParts';
import { Figured } from './Figured';
import { TONE_CLASS, tileRow } from './styles';

/** What changed's tiles (brain UI spec 2026-10-06 §2): ARR, NRR, ARR at
 *  risk and the healthy share, matched by registry key and skipped when the
 *  scope has none. Each shows its figure now at 22px in DM Mono, then the
 *  change against then as a sentence beside its colour. */
export function ChangedTiles({ metrics, currency }: { metrics: ChangedMetric[]; currency: CurrencyCode }) {
  const tiles = metricTiles(metrics, currency);
  if (tiles.length === 0) return null;
  const columns = Math.min(5, Math.max(2, tiles.length)) as 2 | 3 | 4 | 5;
  return (
    <div role="group" aria-label={SAY.TILES} className={tileRow(columns)}>
      {tiles.map((tile) => (
        <Tile key={tile.key} title={tile.label}>
          {tile.figure === null ? (
            <p data-part="figure" className="text-[13px] text-ink-muted">
              {SAY.NO_FIGURE}
            </p>
          ) : (
            <p data-part="figure" className={`${MONO} text-[22px] leading-tight text-ink`}>
              {tile.figure}
            </p>
          )}
          {tile.change ? (
            <p data-part="change" className={`mt-1 text-[13px] font-semibold ${TONE_CLASS[tile.change.tone]}`}>
              <Figured text={tile.change.text} />
            </p>
          ) : null}
        </Tile>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Run it to make sure it passes**

Run: `npx vitest run src/components/brain/ChangedTiles.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 11: Write the failing page tests**

In `src/pages/brain/WhatChanged.test.tsx`:

1. Change the fixtures import to `import { COMPANY_FIRST, COMPANY_TILES, ME_EMPTY, TEAM_RESET } from '../../features/brain/testBrainFixtures';`, and add `within` to the `@testing-library/react` import.
2. In `'opens on the server default, in the URL, with the switch pressed'`, replace `expect(screen.getByRole('heading', { level: 1, name: SAY.TITLE })).toBeInTheDocument();` with:

```tsx
    // The title lives in the Brain bar (brain UI spec §1.5): no page h1, no display font.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelector('.font-display')).toBeNull();
```

3. Append a new describe:

```tsx
describe('What changed: the frame and tiles (brain UI spec 2026-10-06)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens with the tiles in registry order, skipping a metric the scope lacks; a withheld figure says so', async () => {
    stubBrain({ changed: { company: COMPANY_TILES } });
    renderBrain('/brain?scope=company');
    const row = await screen.findByRole('group', { name: SAY.TILES });
    expect(within(row).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['ARR', 'Net revenue retention', 'ARR at risk', 'Book in good health']);
    expect(within(row).getByRole('group', { name: 'Net revenue retention' })).toHaveTextContent(SAY.NO_FIGURE);
    expect(within(row).getByRole('group', { name: 'ARR' }).querySelector('[data-part="change"]')).toHaveTextContent('down $13.4K, worse');
  });

  it('sits in BrainFrame, full width, with the scope switch in the bar’s slot', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    await screen.findByText('Since 30 Sep month-end');
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(document.querySelector('.max-w-4xl, .mx-auto')).toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('puts the brief and What moved side by side from lg, Everything we measure full width beneath', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    const brief = await screen.findByRole('region', { name: SAY.BRIEF });
    const pair = brief.parentElement as HTMLElement;
    expect(pair).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(within(pair).getByRole('heading', { name: SAY.MOVED })).toBeInTheDocument();
    expect(within(pair).queryByRole('heading', { name: SAY.MEASURE })).toBeNull();
  });

  it('titles its sections in the tile label style', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    for (const name of [SAY.MOVED, SAY.MEASURE]) {
      expect(await screen.findByRole('heading', { name })).toHaveClass('text-[11px]', 'uppercase', 'tracking-wider', 'text-ink-muted');
    }
  });

  it('shows the tiles’ skeleton with the page’s while loading', () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    expect(screen.getByRole('status', { name: 'Loading summary' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading what changed' })).toBeInTheDocument();
  });

  it('keeps the switch inline at the top of the page below sm', async () => {
    stubBrain();
    renderBrain('/brain?scope=team', { width: 375 });
    expect(await screen.findByRole('combobox', { name: 'View' })).toBeInTheDocument();
    expect(within(screen.getByTestId('nav-actions')).queryByRole('combobox')).toBeNull();
  });
});
```

- [ ] **Step 12: Run them to make sure they fail**

Run: `npx vitest run src/pages/brain/WhatChanged.test.tsx --maxWorkers=2`
Expected: FAIL. The page still draws a `font-display` h1, has no tiles, and puts the switch inline.

- [ ] **Step 13: Restyle the section headings and cap the Watch list**

- `src/components/brain/MovesList.tsx`: replace `<h2 id="moves-heading" className="text-[15px] font-semibold text-ink">` with `<h2 id="moves-heading" className={SECTION_TITLE}>`, and change `import { TONE_CLASS } from './styles';` to `import { SECTION_TITLE, TONE_CLASS } from './styles';`.
- `src/components/brain/MeasureTable.tsx`: replace `<h2 id="measure-heading" className="text-[15px] font-semibold text-ink">` with `<h2 id="measure-heading" className={SECTION_TITLE}>`, and change `import { TONE_CLASS } from './styles';` to `import { SECTION_TITLE, TONE_CLASS } from './styles';`.
- `src/components/brain/ScopeBriefCard.tsx`: replace `<ul className="flex list-disc flex-col gap-1 pl-5">` with `<ul className="flex max-w-prose list-disc flex-col gap-1 pl-5">`.

- [ ] **Step 14: Rewrite the page**

Replace `src/pages/brain/WhatChanged.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { ChangedSkeleton } from '../../components/brain/ChangedSkeleton';
import { ChangedTiles } from '../../components/brain/ChangedTiles';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { MeasureTable } from '../../components/brain/MeasureTable';
import { MovesList } from '../../components/brain/MovesList';
import { ScopeBriefCard } from '../../components/brain/ScopeBriefCard';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useChanged } from '../../components/brain/useChanged';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { QUIET } from '../../components/organizations/portfolio/styles';
import { TilesSkeleton } from '../../components/organizations/portfolio/tileParts';
import { emptyTitle, graphHref, SAY, sinceLine } from '../../features/brain/brainText';

/** Two columns from lg, stacked below; the columns can shrink below their content. */
const PAIR = 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]';

/** /brain: What changed (spec 2026-10-05 §2.3), for every member, scoped Me ·
 *  My team · Company, in the Brain frame (brain UI spec 2026-10-06): the
 *  since line and the graph link, the headline tiles, then the brief beside
 *  What moved, and every metric beneath. */
export function WhatChangedPage() {
  const brain = useBrainScope();
  const changed = useChanged(brain.scope, brain.refused);
  const data = changed.data;
  const scope = brain.scope;

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (changed.error) body = <ErrorBlock message={changed.error} onRetry={changed.retry} />;
  else if (!scope || !data)
    body = (
      <>
        <TilesSkeleton count={4} />
        <ChangedSkeleton />
      </>
    );
  else if (data.empty) body = <EmptyState title={emptyTitle(scope)} detail={SAY.EMPTY_DETAIL} action={null} />;
  else
    body = (
      <>
        <ChangedTiles metrics={data.metrics} currency={data.currency} />
        <div className={PAIR}>
          <ScopeBriefCard key={`brief-${scope}`} scope={scope} scopeLabel={brain.label} onRefused={brain.refused} />
          <MovesList key={`moves-${scope}`} changed={data} onRefused={brain.refused} />
        </div>
        <MeasureTable changed={data} />
      </>
    );

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {scope ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[13px] text-ink-muted">{data ? sinceLine(data) : null}</p>
          <Link to={graphHref(scope)} className={`${QUIET} gap-1.5`}>
            <Network className="h-4 w-4" aria-hidden="true" />
            {SAY.KNOWLEDGE_GRAPH}
          </Link>
        </div>
      ) : null}
      {body}
    </BrainFrame>
  );
}
```

- [ ] **Step 15: Run the What changed suites**

Run: `npx vitest run src/pages/brain/WhatChanged.test.tsx src/components/brain src/features/brain src/e2e/brain.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS, and tsc reports no errors.

- [ ] **Step 16: Commit**

```bash
git add src/components/brain/styles.ts src/features/brain/brainText.ts src/features/brain/brainText.test.ts src/features/brain/testBrainFixtures.ts src/components/brain/ChangedTiles.tsx src/components/brain/ChangedTiles.test.tsx src/components/brain/MovesList.tsx src/components/brain/MeasureTable.tsx src/components/brain/ScopeBriefCard.tsx src/pages/brain/WhatChanged.tsx src/pages/brain/WhatChanged.test.tsx
git commit -m "feat(brain): What changed in the frame, with headline tiles and two columns

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Waiting on you: filter tiles

**Files:**
- Modify (whole file): `src/components/brain/WaitingDesk.tsx`
- Modify (whole file): `src/components/brain/WaitingSkeleton.tsx`
- Modify: `src/pages/brain/Waiting.tsx:1-17,53,83-125`
- Test: `src/pages/brain/Waiting.test.tsx`

**Interfaces:**
- Consumes: `tileRow(5)` and `SECTION_TITLE` (Task 5), `Tile` and `TileButton({ pressed, label, onClick, children })` and `TilesSkeleton` from `tileParts`, `KIND_CHIPS` and `totalOf` from `waitingText.ts`, plus `BrainFrame` and `BrainControls`.
- Produces: `WaitingDesk({ data, scope, now, toolbar: ReactNode, onGone })`, where `toolbar` is new. Tile buttons keep the accessible names `"All 6"`, `"Questions 2"` and so on, so the journeys' `getByRole('button', { name: 'Proposals 0' })` still holds.

- [ ] **Step 1: Write the failing page tests**

In `src/pages/brain/Waiting.test.tsx`:

1. In `'Me: the one h1, my desk oldest first, and no "who" on my own items'`, rename the test to `'Me: no page title, my desk oldest first, and no "who" on my own items'`, and replace `expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([WAIT.TITLE]);` with `expect(screen.queryByRole('heading', { level: 1 })).toBeNull();`.
2. In `'filters by kind with the full counts, and back to All on a scope switch'`, replace

```tsx
    const chips = within(screen.getByRole('group', { name: WAIT.SHOW })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['All 6', 'Rule reviews 1', 'Proposals 1', 'Questions 2', 'Overdue tasks 2']);
```

with

```tsx
    const tiles = within(screen.getByRole('group', { name: WAIT.SHOW })).getAllByRole('button');
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual(['All 6', 'Rule reviews 1', 'Proposals 1', 'Questions 2', 'Overdue tasks 2']);
```

3. In `'moves focus to the "Waiting on you" heading when the last row leaves (fix round 2, I1)'`, replace `expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: WAIT.TITLE }));` with `expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: WAIT.TITLE }));`.
4. Rename `'at 375px the switch is a select and the chips wrap'` to `'at 375px the switch is a select and the tiles scroll sideways'`, and replace `expect(screen.getByRole('group', { name: WAIT.SHOW })).toHaveClass('flex-wrap');` with `expect(screen.getByRole('group', { name: WAIT.SHOW })).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');`.
5. Append inside the same describe:

```tsx
  it('opens with five tiles, All then one per kind, each its full count at 22px in DM Mono', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=team', { role: 'csm' });
    await list();
    const tiles = screen.getByRole('group', { name: WAIT.SHOW });
    expect(within(tiles).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['All', 'Rule reviews', 'Proposals', 'Questions', 'Overdue tasks']);
    expect(within(within(tiles).getByRole('button', { name: 'Questions 2' })).getByText('2')).toHaveClass('font-mono-brand', 'tabular-nums', 'text-[22px]');
  });

  it('pressing the pressed tile goes back to All', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=team', { role: 'csm' });
    await list();
    await userEvent.click(screen.getByRole('button', { name: 'Questions 2' }));
    expect(screen.getByRole('button', { name: 'Questions 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(order()).toEqual(['question-31', 'question-32']);
    await userEvent.click(screen.getByRole('button', { name: 'Questions 2' }));
    expect(screen.getByRole('button', { name: 'All 6' })).toHaveAttribute('aria-pressed', 'true');
    expect(order()).toHaveLength(6);
  });

  it('puts Ask the agent in a toolbar row between the tiles and the list, in Company', async () => {
    stubBrain();
    renderBrain('/brain/waiting?scope=company');
    await list();
    const tiles = screen.getByRole('group', { name: WAIT.SHOW });
    const ask = screen.getByRole('button', { name: WAIT.ASK });
    expect(tiles.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ask.compareDocumentPosition(screen.getByRole('list', { name: WAIT.LIST })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(WAIT.ASK_HINT)).toBeInTheDocument();
  });

  it('sits in BrainFrame with the switch in the bar, and loads tiles then rows', async () => {
    stubBrain();
    renderBrain('/brain/waiting?scope=team');
    expect(screen.getByRole('status', { name: 'Loading summary' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: WAIT.LOADING })).toBeInTheDocument();
    await list();
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(document.querySelector('.font-display')).toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/brain/Waiting.test.tsx --maxWorkers=2`
Expected: FAIL. The page still renders chips, an h1 and an inline switch.

- [ ] **Step 3: Rewrite the desk**

Replace `src/components/brain/WaitingDesk.tsx` with:

```tsx
import { useState, type ReactNode } from 'react';
import type { ScopeKey, WaitingItem, WaitingKind, WaitingPayload } from '../../features/brain/brainTypes';
import { cappedText, hiddenItemsText, KIND_CHIPS, totalOf, WAIT, waitingEmpty } from '../../features/brain/waitingText';
import { EmptyState } from '../organizations/portfolio/PortfolioSections';
import { MONO } from '../organizations/portfolio/styles';
import { Tile, TileButton } from '../organizations/portfolio/tileParts';
import { tileRow } from './styles';
import { WaitingRow } from './WaitingRow';

/** The desk (spec §2.1; brain UI spec 2026-10-06 §2): five tiles with the
 *  full counts, All then one per kind. A tile filters the list, and pressing
 *  the pressed one goes back to All. Then the page's toolbar, then one list
 *  in the server's order, the 200 cap and the hidden count. The filter is
 *  this component's state, so a scope switch (a new key) starts at All. */
export function WaitingDesk({ data, scope, now, toolbar, onGone }: {
  data: WaitingPayload;
  scope: ScopeKey;
  now: Date;
  /** The page's toolbar row (its section label, Ask the agent): between the tiles and the list. */
  toolbar: ReactNode;
  onGone: (item: WaitingItem, message: string) => void;
}) {
  const [kind, setKind] = useState<WaitingKind | 'all'>('all');
  const total = totalOf(data.counts);
  const hidden = hiddenItemsText(data.hidden);
  const hiddenLine = hidden ? (
    <p data-part="hidden" className="text-[13px] text-ink-muted">
      {hidden}
    </p>
  ) : null;

  if (total === 0 && data.items.length === 0) {
    return (
      <>
        {toolbar}
        <EmptyState title={waitingEmpty(scope)} detail={WAIT.EMPTY_DETAIL} action={null} />
        {hiddenLine}
      </>
    );
  }

  const items = kind === 'all' ? data.items : data.items.filter((item) => item.kind === kind);
  const capped = kind === 'all' ? cappedText(data.counts, data.items.length) : null;
  return (
    <>
      <div role="group" aria-label={WAIT.SHOW} className={tileRow(5)}>
        {KIND_CHIPS.map((chip) => {
          const count = chip.key === 'all' ? total : data.counts[chip.key];
          const on = chip.key === kind;
          return (
            <Tile key={chip.key} title={chip.label}>
              <TileButton pressed={on} label={`${chip.label} ${count}`} onClick={() => setKind(on ? 'all' : chip.key)}>
                <span className={`${MONO} block text-[22px] leading-tight text-ink`}>{count}</span>
              </TileButton>
            </Tile>
          );
        })}
      </div>
      {toolbar}
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p data-part="none" className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-muted">
            {WAIT.NONE_OF_KIND}
          </p>
        ) : (
          <ul aria-label={WAIT.LIST} className="divide-y divide-line rounded-xl border border-line bg-surface">
            {items.map((item) => (
              <WaitingRow key={`${item.kind}-${item.id}`} item={item} scope={scope} now={now} onGone={onGone} />
            ))}
          </ul>
        )}
        {capped ? <p className="text-[11px] text-ink-muted">{capped}</p> : null}
        {hiddenLine}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Trim the skeleton to the rows**

Replace `src/components/brain/WaitingSkeleton.tsx` with:

```tsx
import { WAIT } from '../../features/brain/waitingText';

const BAR = 'block animate-pulse rounded bg-subtle';

/** The list's shape while it loads: four rows. The tiles' shape is the
 *  page's own TilesSkeleton above it (brain UI spec §2). */
export function WaitingSkeleton() {
  return (
    <div role="status" aria-label={WAIT.LOADING} className="flex flex-col gap-3">
      <ul aria-hidden="true" className="divide-y divide-line rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex flex-col gap-2 px-4 py-3">
            <span className={`${BAR} h-3 w-40`} />
            <span className={`${BAR} h-4 w-2/3`} />
            <span className={`${BAR} h-9 w-28`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Put the page in the frame**

In `src/pages/brain/Waiting.tsx`:

1. Replace the imports (lines 1–17) with:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { SECTION_TITLE } from '../../components/brain/styles';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useWaiting } from '../../components/brain/useWaiting';
import { refreshWaitingCount } from '../../components/brain/useWaitingCount';
import { WaitingDesk } from '../../components/brain/WaitingDesk';
import { WaitingSkeleton } from '../../components/brain/WaitingSkeleton';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY } from '../../components/organizations/portfolio/styles';
import { TilesSkeleton } from '../../components/organizations/portfolio/tileParts';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { askAgent } from '../../features/brain/brainApi';
import type { ScopeKey, WaitingItem } from '../../features/brain/brainTypes';
import { WAIT } from '../../features/brain/waitingText';
import { useCapability } from '../../hooks';
```

2. Leave everything from `export function WaitingPage() {` down to the end of `askTheAgent()` unchanged. `titleRef` stays `useRef<HTMLHeadingElement>(null)`.
3. Replace everything from `  let body: ReactNode;` to the end of the file with:

```tsx
  // The toolbar row (brain UI spec §2): the section label, which takes focus
  // when the last row leaves (fix round 2, I1), and Ask the agent. On the
  // desk it sits between the tiles and the list.
  const toolbar = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 ref={titleRef} tabIndex={-1} className={`${SECTION_TITLE} ${FOCUS}`}>
        {WAIT.TITLE}
      </h2>
      {canAsk ? (
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <button type="button" onClick={() => void askTheAgent()} disabled={asking} className={PRIMARY}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {asking ? WAIT.ASKING : WAIT.ASK}
          </button>
          <p className="text-[11px] text-ink-muted">{WAIT.ASK_HINT}</p>
        </div>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (brain.error)
    body = (
      <>
        {toolbar}
        <ErrorBlock message={brain.error} onRetry={brain.retry} />
      </>
    );
  else if (waiting.error)
    body = (
      <>
        {toolbar}
        <ErrorBlock message={waiting.error} onRetry={waiting.retry} />
      </>
    );
  else if (!scope || !data)
    body = (
      <>
        <TilesSkeleton count={5} />
        {toolbar}
        <WaitingSkeleton />
      </>
    );
  else body = <WaitingDesk key={scope} data={data} scope={scope} now={new Date()} toolbar={toolbar} onGone={gone} />;

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {askError ? (
        <p role="alert" className="text-[13px] text-danger">
          {askError}
        </p>
      ) : null}
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {/* M10: `empty:hidden` is `display:none` while empty, and some
          screen readers never announce the first text written into a
          region that was hidden; a steady `min-h` keeps it in the tree
          and in the layout, empty or not. */}
      <p role="status" data-part="waiting-status" className="min-h-[1.1em] text-[13px] text-ink-muted">
        {status && status.scope === scope ? status.text : ''}
      </p>
      {body}
    </BrainFrame>
  );
}
```

- [ ] **Step 6: Run the Waiting suites**

Run: `npx vitest run src/pages/brain/Waiting.test.tsx src/components/brain src/e2e/brain.test.tsx src/e2e/rules.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS, and tsc reports no errors. The house rules still find `<WaitingSkeleton />`, `<ErrorBlock ` and `useSubmitOnce(` in Waiting.tsx, and `<EmptyState `, `NONE_OF_KIND`, `MONO` and `divide-y divide-line rounded-xl border border-line` in WaitingDesk.tsx.

- [ ] **Step 7: Commit**

```bash
git add src/components/brain/WaitingDesk.tsx src/components/brain/WaitingSkeleton.tsx src/pages/brain/Waiting.tsx src/pages/brain/Waiting.test.tsx
git commit -m "feat(brain): Waiting on you in the frame, with filter tiles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: What's being done and Customers: jump tiles, and Customers in two columns

**Files:**
- Create: `src/components/brain/BrainTiles.tsx`
- Create: `src/components/brain/DoingTiles.tsx`
- Create: `src/components/brain/CustomerTiles.tsx`
- Modify: `src/features/brain/doingText.ts`
- Test: `src/features/brain/doingText.test.ts`
- Modify: `src/features/brain/customersText.ts`
- Test: `src/features/brain/customersText.test.ts`
- Modify: `src/pages/brain/Doing.tsx`, `src/pages/brain/Customers.tsx`
- Test: `src/pages/brain/Doing.test.tsx`, `src/pages/brain/Customers.test.tsx`

**Interfaces:**
- Consumes: `tileRow`, `SECTION_TITLE` and `TONE_CLASS` (`styles.ts`), `withSection(search, key)` (`doingText.ts`), `scoreFigure` and `scoreChange` (`customersText.ts`), `TYPE_LABEL` (`features/surveys/questions`), `Figured`, `TilesSkeleton`, `BrainFrame` and `BrainControls`.
- Produces:
  - `JumpTile({ title, label, section, current, onSame, children })` is a `Link` to `?section=` (replace), with `aria-label={label}` and `aria-current="location"` when current. A click on the current section calls `onSame()`.
  - `doingFigures(data: Pick<DoingPayload, 'initiatives' | 'plans' | 'rules'>): DoingFigures`, where `DoingFigures = { active, onTrack, openPlans, atRisk, running, fired }`, plus `isOnTrack(one)`, `onTrackText(n)`, `atRiskText(n)` and `firedText(n)`. New strings: `DO.OPEN_PLANS = 'Open plans'` and `DO.RULES_RUNNING = 'Rules running'`.
  - `customerTiles(data): CustomerTile[]`, where `CustomerTile = { key; title; section: CustomerSectionKey; figure: string; muted: boolean; detail: { text; tone } | null; label: string }`. New strings: `CS.NEGATIVE = 'Negative contacts'` and `CS.BACK = 'Customers'` (Task 8 uses `CS.BACK`).
  - `DoingTiles({ data, current, onSame })` and `CustomerTiles({ data, current, onSame })`. Each is a `<nav aria-label="Sections">` built with `tileRow`.

**Definitions** (the payloads carry nothing more; see the report's ambiguity list):
- Initiatives tile: the count of `status === 'active'`. An active initiative is "on track" when its progress is visible (`progress !== null`), measurable (`progress_pct !== null`) and inside its date (`days_left >= 0`). The payload has no start date, so pace can't be judged.
- Open plans: plans whose status is not `done` or `cancelled` (`doing/` also returns the last 30 days' done and cancelled). "At risk" means `status === 'at_risk'`.
- Rules running: `is_active` rules. "Fired last night" is the sum of their `last_run.fired`; a rule that hasn't run yet adds 0.
- Customers' anomalies tile is titled **"Anomalies"**, not "Live anomalies": `anomalies.total` counts every status (`services/anomalies/views.rows_for` has no status filter).

- [ ] **Step 1: Write the failing unit tests for the figures**

Append to `src/features/brain/doingText.test.ts`. Extend its imports with `doingFigures, onTrackText, atRiskText, firedText` from `./doingText`; `ALICE_INITIATIVE, CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE, OUTSIDE_VIEW_INITIATIVE, NO_BASELINE_INITIATIVE, ALICE_PLAN, CARL_PLAN, DANA_PLAN, MY_DOING_RULE, CARL_DOING_RULE, CARL_READABLE_RULE, DANA_DOING_RULE` from `./testDoingFixtures`; and `type InitiativeProgress` from `./brainTypes`. Merge with any existing imports of the same modules.

```ts
describe('doingFigures (brain UI spec §2, What’s being done)', () => {
  it('counts active initiatives, and the ones on track: measured and inside their date', () => {
    const late = { ...CARL_INITIATIVE, id: 30, progress: { ...(CARL_INITIATIVE.progress as InitiativeProgress), days_left: -2 } };
    const figures = doingFigures({
      initiatives: [ALICE_INITIATIVE, CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE, OUTSIDE_VIEW_INITIATIVE, NO_BASELINE_INITIATIVE, late],
      plans: [],
      rules: [],
    });
    // Active: Alice, Carl, outside view, no baseline, late. On track: Alice, Carl.
    expect(figures).toMatchObject({ active: 5, onTrack: 2 });
  });

  it('counts open plans (not done or cancelled) and the ones at risk', () => {
    const cancelled = { ...CARL_PLAN, id: 31, status: 'cancelled' as const };
    expect(doingFigures({ initiatives: [], plans: [CARL_PLAN, ALICE_PLAN, DANA_PLAN, cancelled], rules: [] })).toMatchObject({ openPlans: 2, atRisk: 1 });
  });

  it('counts running rules and what they fired last night; a rule not run yet adds nothing', () => {
    expect(doingFigures({ initiatives: [], plans: [], rules: [MY_DOING_RULE, CARL_DOING_RULE, CARL_READABLE_RULE, DANA_DOING_RULE] })).toMatchObject({ running: 3, fired: 6 });
  });

  it('words the tiles', () => {
    expect([onTrackText(2), atRiskText(1), firedText(6)]).toEqual(['2 on track', '1 at risk', '6 fired last night']);
  });
});
```

Append to `src/features/brain/customersText.test.ts`. Extend its imports with `customerTiles` and `CS` from `./customersText`, and `ME_CUSTOMERS, TEAM_CUSTOMERS` from `./testCustomersFixtures`.

```ts
describe('customerTiles (brain UI spec §2, Customers)', () => {
  it('reads Asks, Anomalies, NPS, CSAT and Negative contacts from the payload, each jumping to its section', () => {
    expect(customerTiles(TEAM_CUSTOMERS).map((tile) => [tile.label, tile.section])).toEqual([
      ['Asks: 2', 'asks'],
      ['Anomalies: 1', 'anomalies'],
      ['NPS: +18, down 7 pts from +25', 'scores'],
      ['CSAT: 82.5%, up 2.5 pts from 80%', 'scores'],
      ['Negative contacts: 4', 'sentiment'],
    ]);
  });

  it('says "Not enough answers" under 5, with no change, as Scores does', () => {
    const [, , nps, csat] = customerTiles(ME_CUSTOMERS);
    expect(nps).toMatchObject({ figure: CS.NOT_ENOUGH, muted: true, detail: null, label: 'NPS: Not enough answers' });
    expect(csat).toMatchObject({ muted: true, detail: null });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/brain/doingText.test.ts src/features/brain/customersText.test.ts --maxWorkers=2`
Expected: FAIL. `doingFigures` and `customerTiles` are not exported.

- [ ] **Step 3: Write the figures**

In `src/features/brain/doingText.ts`:
1. Add `DoingPayload,` to the `./brainTypes` type import list.
2. Inside `DO`, after `RULES: 'Rules at work',`, add:

```ts
  OPEN_PLANS: 'Open plans',
  RULES_RUNNING: 'Rules running',
```

3. Append:

```ts
export interface DoingFigures {
  active: number;
  onTrack: number;
  openPlans: number;
  atRisk: number;
  running: number;
  fired: number;
}

/** On track (brain UI spec §2): active, with figures the reader can see and
 *  measure, and still inside its target date. The payload carries no start
 *  date, so pace can't be judged. */
export function isOnTrack(one: Pick<DoingInitiative, 'status' | 'progress'>): boolean {
  return one.status === 'active' && one.progress !== null && one.progress.progress_pct !== null && one.progress.days_left >= 0;
}

/** The three tiles' figures, from the `doing/` payload the page already reads. */
export function doingFigures(data: Pick<DoingPayload, 'initiatives' | 'plans' | 'rules'>): DoingFigures {
  const active = data.initiatives.filter((one) => one.status === 'active');
  const open = data.plans.filter((plan) => plan.status !== 'done' && plan.status !== 'cancelled');
  const running = data.rules.filter((rule) => rule.is_active);
  return {
    active: active.length,
    onTrack: active.filter(isOnTrack).length,
    openPlans: open.length,
    atRisk: open.filter((plan) => plan.status === 'at_risk').length,
    running: running.length,
    fired: running.reduce((sum, rule) => sum + (rule.last_run?.fired ?? 0), 0),
  };
}

export const onTrackText = (n: number): string => `${n} on track`;
export const atRiskText = (n: number): string => `${n} at risk`;
export const firedText = (n: number): string => `${n} fired last night`;
```

In `src/features/brain/customersText.ts`:
1. Change the `./brainTypes` import to `import type { ContactSentiment, CustomerAnomaly, CustomerAsk, CustomersPayload, ScoreComment, ScoreFigure, ScopeKey } from './brainTypes';`.
2. Inside `CS`, after `SENTIMENT: 'Sentiment',`, add:

```ts
  NEGATIVE: 'Negative contacts',
  BACK: 'Customers',
```

3. Append:

```ts
export interface CustomerTile {
  key: string;
  title: string;
  section: CustomerSectionKey;
  figure: string;
  /** "Not enough answers": set at 13px, not as a 22px figure. */
  muted: boolean;
  detail: { text: string; tone: Tone } | null;
  /** The tile's accessible name: "NPS: +18, down 7 pts from +25". */
  label: string;
}

/** The five tiles (brain UI spec §2), from the `customers/` payload the page
 *  already reads. NPS and CSAT reuse Scores' figure and change words. The
 *  anomalies tile is the total, every status, as the section's "Top 5 of N". */
export function customerTiles(data: Pick<CustomersPayload, 'asks' | 'anomalies' | 'scores' | 'sentiment'>): CustomerTile[] {
  const tile = (key: string, title: string, section: CustomerSectionKey, figure: string, muted = false, detail: CustomerTile['detail'] = null): CustomerTile => ({
    key,
    title,
    section,
    figure,
    muted,
    detail,
    label: `${title}: ${figure}${detail ? `, ${detail.text}` : ''}`,
  });
  const score = (kind: 'nps' | 'csat') => {
    const figure = data.scores[kind];
    return tile(kind, TYPE_LABEL[kind], 'scores', scoreFigure(kind, figure), figure.now === null, scoreChange(kind, figure));
  };
  return [
    tile('asks', CS.ASKS, 'asks', String(data.asks.total)),
    tile('anomalies', CS.ANOMALIES, 'anomalies', String(data.anomalies.total)),
    score('nps'),
    score('csat'),
    tile('negative', CS.NEGATIVE, 'sentiment', String(data.sentiment.negative)),
  ];
}
```

- [ ] **Step 4: Run them to make sure they pass**

Run: `npx vitest run src/features/brain/doingText.test.ts src/features/brain/customersText.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Write the failing page tests**

In `src/pages/brain/Doing.test.tsx`:

1. In `'Me: my initiative on my book, …'`, replace `expect(screen.getByRole('heading', { level: 1, name: DO.TITLE })).toBeInTheDocument();` with `expect(screen.queryByRole('heading', { level: 1 })).toBeNull();`.
2. Replace the body of `'lands on ?section= and focuses its heading; a section link moves there, keeping the scope (Decision 2)'` with:

```tsx
    stubBrain();
    renderBrain('/brain/doing?section=plans&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus());
    const nav = screen.getByRole('navigation', { name: DO.SECTIONS });
    expect(within(nav).getByRole('link', { name: /^Open plans/ })).toHaveAttribute('aria-current', 'location');
    await userEvent.click(within(nav).getByRole('link', { name: /^Rules running/ }));
    expect(where()).toBe('/brain/doing?section=rules&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.RULES })).toHaveFocus());
    expect(within(nav).getByRole('link', { name: /^Rules running/ })).toHaveAttribute('aria-current', 'location');
```

3. Rename `'at 375px the view is a select and the section links wrap'` to `'at 375px the view is a select and the tiles scroll sideways'`, and replace `expect(screen.getByRole('navigation', { name: DO.SECTIONS })).toHaveClass('flex-wrap');` with `expect(screen.getByRole('navigation', { name: DO.SECTIONS })).toHaveClass('overflow-x-auto', 'snap-x');`.
4. Append to the file's main describe:

```tsx
  it('opens with three tiles read from the payload: initiatives on track, open plans at risk, rules that fired', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=team');
    await rowOf('[data-initiative="3"]');
    const nav = screen.getByRole('navigation', { name: DO.SECTIONS });
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Initiatives: 2 active, 2 on track',
      'Open plans: 2, 1 at risk',
      'Rules running: 2, 6 fired last night',
    ]);
    expect(within(within(nav).getByRole('link', { name: /^Open plans/ })).getByText('2')).toHaveClass('font-mono-brand', 'text-[22px]');
  });

  it('a tile on the section already named moves focus there again', async () => {
    stubBrain();
    renderBrain('/brain/doing?section=plans&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus());
    screen.getByRole('button', { name: DO.NEW }).focus();
    await userEvent.click(screen.getByRole('link', { name: /^Open plans/ }));
    expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus();
  });

  it('sits in BrainFrame, its sections titled in the tile label style', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    await rowOf('[data-initiative="1"]');
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(document.querySelector('.font-display')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: DO.INITIATIVES })).toHaveClass('text-[11px]', 'uppercase');
  });
```

The team payload behind these figures: Alice's desk holds Alice's and Carl's active initiatives (both measured and in date), CARL_PLAN (at risk) and ALICE_PLAN, and three rules, two of them running (fired 4 + 2).

In `src/pages/brain/Customers.test.tsx`:

1. In `'moves focus to the section the URL names once the data is in, and a section link keeps ?scope='`, replace `getByRole('link', { name: CS.SENTIMENT })` with `getByRole('link', { name: /^Negative contacts/ })`.
2. Replace the body of `'stacks at 375px with the switch as a select and wrapping section links'` (and rename the test to `'stacks at 375px with the switch as a select and the tiles scrolling sideways'`) with:

```tsx
    stubBrain();
    renderBrain('/brain/customers?scope=team', { width: 375 });
    expect(await screen.findByRole('combobox', { name: 'View' })).toHaveValue('team');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(await screen.findByRole('navigation', { name: CS.SECTIONS })).toHaveClass('overflow-x-auto', 'snap-x');
```

3. Append to the main describe:

```tsx
  it('opens with five tiles read from the payload, each jumping to its section and setting ?section=', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    const nav = await screen.findByRole('navigation', { name: CS.SECTIONS });
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Asks: 2',
      'Anomalies: 1',
      'NPS: +18, down 7 pts from +25',
      'CSAT: 82.5%, up 2.5 pts from 80%',
      'Negative contacts: 4',
    ]);
    await userEvent.click(within(nav).getByRole('link', { name: /^CSAT/ }));
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=team&section=scores'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: CS.SCORES })).toHaveFocus());
    expect(within(nav).getByRole('link', { name: /^NPS/ })).toHaveAttribute('aria-current', 'location');
  });

  it('says "Not enough answers" on a score tile under 5', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=me');
    const nav = await screen.findByRole('navigation', { name: CS.SECTIONS });
    expect(within(nav).getByRole('link', { name: `NPS: ${CS.NOT_ENOUGH}` })).toBeInTheDocument();
  });

  it('puts Asks beside Anomalies, and Scores beside Sentiment, from lg', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    const asks = await screen.findByRole('region', { name: CS.ASKS });
    expect(asks.parentElement).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(asks.parentElement).toContainElement(screen.getByRole('region', { name: CS.ANOMALIES }));
    const scores = screen.getByRole('region', { name: CS.SCORES });
    expect(scores.parentElement).toHaveClass('lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(scores.parentElement).toContainElement(screen.getByRole('region', { name: CS.SENTIMENT }));
    expect(screen.getByRole('heading', { level: 2, name: CS.ASKS })).toHaveClass('text-[11px]', 'uppercase');
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
  });
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `npx vitest run src/pages/brain/Doing.test.tsx src/pages/brain/Customers.test.tsx --maxWorkers=2`
Expected: FAIL. There are no tiles yet, and the pages still render an h1.

- [ ] **Step 7: Write JumpTile, DoingTiles and CustomerTiles**

Create `src/components/brain/BrainTiles.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { withSection } from '../../features/brain/doingText';
import { FOCUS } from '../organizations/portfolio/styles';
import { SECTION_TITLE } from './styles';

const JUMP = `flex min-h-11 min-w-[15rem] shrink-0 snap-start flex-col gap-1 rounded-xl p-3 text-left hover:bg-subtle active:bg-line-subtle sm:min-w-0 ${FOCUS}`;

/** A tile that jumps to its section (brain UI spec 2026-10-06 §2), in
 *  place of the old section links: it sets `?section=` (the page then moves
 *  focus to that heading), and on the section already named it moves focus
 *  there again. A link with a label, not a heading, so the section's own
 *  heading stays the one heading by that name. */
export function JumpTile({ title, label, section, current, onSame, children }: {
  title: string;
  /** The accessible name: the title and its figures, e.g. "Open plans: 2, 1 at risk". */
  label: string;
  section: string;
  current: boolean;
  onSame: () => void;
  children: ReactNode;
}) {
  const { search } = useLocation();
  return (
    <Link
      to={{ search: withSection(search, section) }}
      replace
      aria-label={label}
      aria-current={current ? 'location' : undefined}
      onClick={() => {
        if (current) onSame();
      }}
      className={`${JUMP} ${current ? 'bg-subtle' : 'bg-surface'}`}
    >
      <span className={SECTION_TITLE}>{title}</span>
      {children}
    </Link>
  );
}
```

Create `src/components/brain/DoingTiles.tsx`:

```tsx
import type { DoingPayload } from '../../features/brain/brainTypes';
import { atRiskText, DO, doingFigures, firedText, onTrackText, type SectionKey } from '../../features/brain/doingText';
import { MONO } from '../organizations/portfolio/styles';
import { JumpTile } from './BrainTiles';
import { Figured } from './Figured';
import { tileRow } from './styles';

const FIGURE = `${MONO} text-[22px] leading-tight text-ink`;
const DETAIL = 'text-[13px] text-ink-muted';

/** What's being done's tiles (brain UI spec §2): initiatives (active, and
 *  on track), open plans (and at risk), rules running (and what they fired
 *  last night). Each jumps to its section, replacing the section links. */
export function DoingTiles({ data, current, onSame }: {
  data: Pick<DoingPayload, 'initiatives' | 'plans' | 'rules'>;
  current: SectionKey | null;
  onSame: (key: SectionKey) => void;
}) {
  const f = doingFigures(data);
  return (
    <nav aria-label={DO.SECTIONS} className={tileRow(3)}>
      <JumpTile
        title={DO.INITIATIVES}
        label={`${DO.INITIATIVES}: ${f.active} active, ${onTrackText(f.onTrack)}`}
        section="initiatives"
        current={current === 'initiatives'}
        onSame={() => onSame('initiatives')}
      >
        <span className={FIGURE}>{f.active}</span>
        <span className={DETAIL}>
          <Figured text={onTrackText(f.onTrack)} />
        </span>
      </JumpTile>
      <JumpTile
        title={DO.OPEN_PLANS}
        label={`${DO.OPEN_PLANS}: ${f.openPlans}, ${atRiskText(f.atRisk)}`}
        section="plans"
        current={current === 'plans'}
        onSame={() => onSame('plans')}
      >
        <span className={FIGURE}>{f.openPlans}</span>
        <span className={DETAIL}>
          <Figured text={atRiskText(f.atRisk)} />
        </span>
      </JumpTile>
      <JumpTile
        title={DO.RULES_RUNNING}
        label={`${DO.RULES_RUNNING}: ${f.running}, ${firedText(f.fired)}`}
        section="rules"
        current={current === 'rules'}
        onSame={() => onSame('rules')}
      >
        <span className={FIGURE}>{f.running}</span>
        <span className={DETAIL}>
          <Figured text={firedText(f.fired)} />
        </span>
      </JumpTile>
    </nav>
  );
}
```

Create `src/components/brain/CustomerTiles.tsx`:

```tsx
import type { CustomersPayload } from '../../features/brain/brainTypes';
import { CS, customerTiles, type CustomerSectionKey } from '../../features/brain/customersText';
import { MONO } from '../organizations/portfolio/styles';
import { JumpTile } from './BrainTiles';
import { Figured } from './Figured';
import { TONE_CLASS, tileRow } from './styles';

/** What customers are saying's tiles (brain UI spec §2): asks, anomalies,
 *  NPS, CSAT and negative contacts, each jumping to its section in place
 *  of the section links. A score under 5 answers reads "Not enough
 *  answers", as Scores does. */
export function CustomerTiles({ data, current, onSame }: {
  data: CustomersPayload;
  current: CustomerSectionKey | null;
  onSame: (key: CustomerSectionKey) => void;
}) {
  return (
    <nav aria-label={CS.SECTIONS} className={tileRow(5)}>
      {customerTiles(data).map((tile) => (
        <JumpTile
          key={tile.key}
          title={tile.title}
          label={tile.label}
          section={tile.section}
          current={current === tile.section}
          onSame={() => onSame(tile.section)}
        >
          <span data-part="figure" className={tile.muted ? 'text-[13px] text-ink-muted' : `${MONO} text-[22px] leading-tight text-ink`}>
            {tile.figure}
          </span>
          {tile.detail ? (
            <span data-part="change" className={`text-[13px] font-semibold ${TONE_CLASS[tile.detail.tone]}`}>
              <Figured text={tile.detail.text} />
            </span>
          ) : null}
        </JumpTile>
      ))}
    </nav>
  );
}
```

- [ ] **Step 8: Put What's being done in the frame**

In `src/pages/brain/Doing.tsx`:

1. Replace the imports (lines 1–19) with:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { DoingPlanRow } from '../../components/brain/DoingPlanRow';
import { DoingRuleRow } from '../../components/brain/DoingRuleRow';
import { DoingSkeleton } from '../../components/brain/DoingSkeleton';
import { DoingTiles } from '../../components/brain/DoingTiles';
import { InitiativeForm } from '../../components/brain/InitiativeForm';
import { InitiativeRow } from '../../components/brain/InitiativeRow';
import { KnowledgeByFunctionPanel } from '../../components/brain/KnowledgeByFunctionPanel';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { SECTION_TITLE } from '../../components/brain/styles';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useDoing } from '../../components/brain/useDoing';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY } from '../../components/organizations/portfolio/styles';
import { TilesSkeleton } from '../../components/organizations/portfolio/tileParts';
import { SAY } from '../../features/brain/brainText';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { canStart, DO, hiddenPlansText, initiativesEmpty, sectionOf, type SectionKey } from '../../features/brain/doingText';
import { useAppSelector, useCapability } from '../../hooks';
```

2. In `Section`, replace `<h2 id={headingId(id)} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>` with `<h2 id={headingId(id)} tabIndex={-1} className={`${SECTION_TITLE} ${FOCUS}`}>`.
3. Delete the line `  const { search } = useLocation();`.
4. Replace everything from `  return (\n    <div className="h-full w-full overflow-y-auto">` to the end of the file with:

```tsx
  // The tiles (brain UI spec §2) replace the section links: each sets
  // `?section=` and the effect above moves focus there; on the section
  // already named, it moves focus there again.
  let tiles: ReactNode = null;
  if (!brain.error && !doing.error) {
    tiles =
      scope && data && reader ? (
        <DoingTiles data={data} current={section} onSame={(key) => document.getElementById(headingId(key))?.focus()} />
      ) : (
        <TilesSkeleton count={3} />
      );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {tiles}
      <p role="status" data-part="doing-status" className="min-h-[1.1em] text-[13px] text-ink-muted">
        {status && status.scope === scope ? status.text : ''}
      </p>
      {body}
    </BrainFrame>
  );
}
```

- [ ] **Step 9: Put Customers in the frame, in two columns**

Replace `src/pages/brain/Customers.tsx` with:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Network } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { AnomalyList, AskList, SeeAll } from '../../components/brain/CustomerLists';
import { CustomersSkeleton } from '../../components/brain/CustomersSkeleton';
import { CustomerTiles } from '../../components/brain/CustomerTiles';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { ScoresPanel } from '../../components/brain/ScoresPanel';
import { SentimentPanel } from '../../components/brain/SentimentPanel';
import { SECTION_TITLE } from '../../components/brain/styles';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useScopedRead } from '../../components/brain/useScopedRead';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../../components/organizations/portfolio/styles';
import { TilesSkeleton } from '../../components/organizations/portfolio/tileParts';
import { fetchCustomers } from '../../features/brain/brainApi';
import { graphHref } from '../../features/brain/brainText';
import { CS, customerSectionOf, type CustomerSectionKey } from '../../features/brain/customersText';

const headingId = (key: CustomerSectionKey) => `customers-${key}`;
/** Two sections side by side from lg, stacked below (brain UI spec §2). */
const PAIR = 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]';

function Section({ id, title, action, children }: { id: CustomerSectionKey; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={headingId(id)} data-section={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId(id)} tabIndex={-1} className={`${SECTION_TITLE} ${FOCUS}`}>
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
 *  team · Company, in the Brain frame (brain UI spec 2026-10-06): the graph
 *  link, the tiles, then Asks beside Anomalies and Scores beside Sentiment
 *  from lg. Reads only. */
export function CustomersPage() {
  const brain = useBrainScope();
  const scope = brain.scope;
  const read = useScopedRead(scope, fetchCustomers, brain.refused, CS.LOAD);
  const data = read.data;
  const [params] = useSearchParams();
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
        <div className={PAIR}>
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
        </div>
        <div className={PAIR}>
          <Section id="scores" title={CS.SCORES}>
            <ScoresPanel scores={data.scores} />
          </Section>
          <Section id="sentiment" title={CS.SENTIMENT}>
            <SentimentPanel sentiment={data.sentiment} today={today} />
          </Section>
        </div>
      </>
    );

  // The tiles (brain UI spec §2) replace the section links: each sets
  // `?section=` and the effect above moves focus there.
  let tiles: ReactNode = null;
  if (!brain.error && !read.error) {
    tiles =
      scope && data ? (
        <CustomerTiles data={data} current={section} onSame={(key) => document.getElementById(headingId(key))?.focus()} />
      ) : (
        <TilesSkeleton count={5} />
      );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {scope ? (
        <div className="flex justify-end">
          <Link to={graphHref(scope)} className={`${QUIET} gap-1.5`}>
            <Network className="h-4 w-4" aria-hidden="true" />
            {CS.GRAPH}
          </Link>
        </div>
      ) : null}
      {tiles}
      {body}
    </BrainFrame>
  );
}
```

- [ ] **Step 10: Run the Doing and Customers suites**

Run: `npx vitest run src/pages/brain/Doing.test.tsx src/pages/brain/Customers.test.tsx src/components/brain src/features/brain src/e2e/brain.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS, and tsc reports no errors. The house rules still find `<DoingSkeleton />`, `initiativesEmpty(`, `DO.NO_PLANS`, `DO.NO_RULES`, `className={PRIMARY}` and the bordered list in Doing.tsx, and `<CustomersSkeleton />`, `<ErrorBlock ` and no `PRIMARY` in Customers.tsx. `JumpTile`'s `Link` complies through `JUMP`.

- [ ] **Step 11: Commit**

```bash
git add src/components/brain/BrainTiles.tsx src/components/brain/DoingTiles.tsx src/components/brain/CustomerTiles.tsx src/features/brain/doingText.ts src/features/brain/doingText.test.ts src/features/brain/customersText.ts src/features/brain/customersText.test.ts src/pages/brain/Doing.tsx src/pages/brain/Customers.tsx src/pages/brain/Doing.test.tsx src/pages/brain/Customers.test.tsx
git commit -m "feat(brain): jump tiles on What's being done and Customers, Customers in two columns

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Feature Requests, Anomalies and the Knowledge graph move into the frame

**Files:**
- Create: `src/components/brain/BrainBackLink.tsx`
- Modify: `src/pages/brain/FeatureRequests.tsx:9-25,155-169,232,346-347,370,446`
- Modify: `src/pages/brain/Anomalies.tsx:9-30,146-160,220,334-335,358,434`
- Modify: `src/pages/brain/Graph.tsx:1-16,358-371`
- Test: `src/pages/brain/FeatureRequests.test.tsx`, `src/pages/brain/Anomalies.test.tsx`, `src/pages/brain/Graph.test.tsx`

**Interfaces:**
- Consumes: `BrainFrame`, `BrainControls`, `CS.BACK` (Task 7) and `SAY.TITLE`.
- Produces: `BrainBackLink({ to: string; scope: ScopeKey | null; label: string })`. It renders a link to `${to}?scope=${scope}` when a scope is set, and `to` otherwise.

- [ ] **Step 1: Write the failing tests**

Append to the describe in `src/pages/brain/FeatureRequests.test.tsx` that holds `'opens a request in the same scope'`:

```tsx
  it('sits in the Brain frame: back to Customers in the same scope, a 15px title, the switch in the bar', async () => {
    stubBrain();
    renderBrain('/brain/requests?scope=team');
    const back = await screen.findByRole('link', { name: 'Customers' });
    await waitFor(() => expect(back).toHaveAttribute('href', '/brain/customers?scope=team'));
    expect(screen.getByRole('heading', { level: 2, name: 'Feature Requests' })).toHaveClass('text-[15px]', 'font-semibold');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelector('.font-display')).toBeNull();
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });
```

In the same file, change `expect(await screen.findByRole('heading', { level: 1, name: 'SSO with Okta' })).toBeInTheDocument();` to `expect(await screen.findByRole('heading', { level: 2, name: 'SSO with Okta' })).toBeInTheDocument();`. Add `waitFor` and `within` to the file's `@testing-library/react` import if they are missing.

Append to the describe in `src/pages/brain/Anomalies.test.tsx` that uses `renderBrain('/brain/anomalies?scope=team')`:

```tsx
  it('sits in the Brain frame: back to Customers in the same scope, a 15px title, the switch in the bar', async () => {
    stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    const back = await screen.findByRole('link', { name: 'Customers' });
    await waitFor(() => expect(back).toHaveAttribute('href', '/brain/customers?scope=team'));
    expect(screen.getByRole('heading', { level: 2, name: 'Anomalies' })).toHaveClass('text-[15px]', 'font-semibold');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelector('.font-display')).toBeNull();
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });
```

Add `within` and `waitFor` to that file's `@testing-library/react` import if they are missing, and `stubBrain` / `renderBrain` if they are missing (both are already imported, at lines 13 and 258 of the current file).

Append to `describe('Knowledge graph (customers spec §2.2, Decision 5)', …)` in `src/pages/brain/Graph.test.tsx`:

```tsx
  it('sits in the Brain frame: back to What changed in the same scope, a 15px title, the switch in the bar', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    const back = await screen.findByRole('link', { name: SAY.TITLE });
    await waitFor(() => expect(back).toHaveAttribute('href', '/brain?scope=team'));
    expect(screen.getByRole('heading', { level: 2, name: 'Knowledge graph' })).toHaveClass('text-[15px]', 'font-semibold');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/brain/FeatureRequests.test.tsx src/pages/brain/Anomalies.test.tsx src/pages/brain/Graph.test.tsx --maxWorkers=2`
Expected: FAIL. `Unable to find role="link" and name "Customers"` (and "What changed").

- [ ] **Step 3: Write the back link**

Create `src/components/brain/BrainBackLink.tsx`:

```tsx
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { FOCUS } from '../organizations/portfolio/styles';

const BACK = `-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:min-h-9 ${FOCUS}`;

/** A Brain sub-page's way back (brain UI spec 2026-10-06 §2): "Customers"
 *  on Feature Requests and Anomalies, "What changed" on the Knowledge graph,
 *  keeping the scope the reader is in. */
export function BrainBackLink({ to, scope, label }: { to: string; scope: ScopeKey | null; label: string }) {
  return (
    <Link to={scope ? `${to}?scope=${scope}` : to} className={BACK}>
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 4: Feature Requests into the frame**

In `src/pages/brain/FeatureRequests.tsx`:

1. Replace `import { ScopeSwitch } from '../../components/brain/ScopeSwitch';` with:

```tsx
import { BrainBackLink } from '../../components/brain/BrainBackLink';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
```

and replace `import { asksEmpty } from '../../features/brain/customersText';` with `import { asksEmpty, CS } from '../../features/brain/customersText';`.

2. In `FeatureRequestsPage`'s list view, replace

```tsx
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-5 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[22px] text-ink">Feature Requests</h1>
          <p className="text-[13px] text-ink-faint font-medium mt-0.5">
```

with

```tsx
    <BrainFrame>
      <BrainControls brain={brain} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <BrainBackLink to="/brain/customers" scope={scope} label={CS.BACK} />
          <h2 className="text-[15px] font-semibold text-ink">Feature Requests</h2>
          <p className="max-w-[70ch] text-[13px] text-ink-faint font-medium">
```

3. Delete the line `          {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}`.
4. The list view's closing `    </div>` (current line 232, directly before `  );\n}\n\nfunction RequestRow(`) becomes `    </BrainFrame>`.
5. In `RequestDetail`, replace `    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-5 max-w-4xl">` with `    <BrainFrame>`. Replace its closing `    </div>` (current line 446, directly before `  );\n}\n\nfunction Figure(`) with `    </BrainFrame>`. Replace `              <h1 className="font-display text-[22px] text-ink">{detail.title}</h1>` with `              <h2 className="text-[15px] font-semibold text-ink">{detail.title}</h2>`.

- [ ] **Step 5: Anomalies into the frame**

In `src/pages/brain/Anomalies.tsx`:

1. Replace `import { ScopeSwitch } from '../../components/brain/ScopeSwitch';` with:

```tsx
import { BrainBackLink } from '../../components/brain/BrainBackLink';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
```

and add `import { CS } from '../../features/brain/customersText';` after `import type { ScopeKey } from '../../features/brain/brainTypes';`.

2. Replace

```tsx
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-5 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[22px] text-ink">Anomalies</h1>
          <p className="text-[13px] text-ink-faint font-medium mt-0.5">
```

with

```tsx
    <BrainFrame>
      <BrainControls brain={brain} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <BrainBackLink to="/brain/customers" scope={scope} label={CS.BACK} />
          <h2 className="text-[15px] font-semibold text-ink">Anomalies</h2>
          <p className="max-w-[70ch] text-[13px] text-ink-faint font-medium">
```

3. Delete the line `          {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}`.
4. The list view's closing `    </div>` (current line 220, directly before `  );\n}\n\nfunction AnomalyListRow(`) becomes `    </BrainFrame>`.
5. In `AnomalyPane`, replace `    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-5 max-w-4xl">` with `    <BrainFrame>`, and its closing `    </div>` (current line 434, directly before `  );\n}\n\nfunction Figure(`) with `    </BrainFrame>`. Replace `              <h1 className="font-display text-[22px] text-ink">{detail.title}</h1>` with `              <h2 className="text-[15px] font-semibold text-ink">{detail.title}</h2>`.

- [ ] **Step 6: The Knowledge graph into the frame**

In `src/pages/brain/Graph.tsx`:

1. Replace `import { ScopeSwitch } from '../../components/brain/ScopeSwitch';` with:

```tsx
import { BrainBackLink } from '../../components/brain/BrainBackLink';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
```

2. Replace `GraphPage`'s return block

```tsx
  return (
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-ink tracking-tight">Knowledge graph</h1>
          <p className="text-[13px] text-ink-faint font-medium mt-0.5">
            Who owns what, what runs on which product, where the downside sits, and what has been decided about it. Every node is a real record; every line a real relation. Click a node to see its figures and neighbours.
          </p>
        </div>
        {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
      </header>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {body}
    </div>
  );
```

with

```tsx
  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      <div className="flex min-w-0 flex-col gap-1">
        <BrainBackLink to="/brain" scope={scope} label={SAY.TITLE} />
        <h2 className="text-[15px] font-semibold text-ink">Knowledge graph</h2>
        <p className="max-w-[70ch] text-[13px] text-ink-faint font-medium">
          Who owns what, what runs on which product, where the downside sits, and what has been decided about it. Every node is a real record; every line a real relation. Click a node to see its figures and neighbours.
        </p>
      </div>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {body}
    </BrainFrame>
  );
```

The graph's own body (columns, Detail pane, filters and its 12px captions) stays as it is. The owner's brain-polish brief kept the Graph outside the house-rules suite, and the spec says its content stays the same.

- [ ] **Step 7: Run the sub-page suites**

Run: `npx vitest run src/pages/brain src/components/brain src/e2e/brain.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS, and tsc reports no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/BrainBackLink.tsx src/pages/brain/FeatureRequests.tsx src/pages/brain/Anomalies.tsx src/pages/brain/Graph.tsx src/pages/brain/FeatureRequests.test.tsx src/pages/brain/Anomalies.test.tsx src/pages/brain/Graph.test.tsx
git commit -m "feat(brain): Feature Requests, Anomalies and the graph in the Brain frame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: House rules, the journeys, the docs and the browser check

**Files:**
- Modify: `src/components/brain/houseRules.test.ts`
- Modify: `src/e2e/brain.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`

**Interfaces:**
- Consumes: everything above. Produces no new code.

- [ ] **Step 1: Write the house-rule additions**

In `src/components/brain/houseRules.test.ts`:

1. After the `shared` constant, add:

```ts
// Every Brain route's page, the Graph included (brain UI spec 2026-10-06 §1.4,
// §1.5): the frame, the controls and the title rules hold on all seven.
const pages = {
  ...raw(import.meta.glob('../../pages/brain/WhatChanged.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Waiting.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Doing.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Customers.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/FeatureRequests.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Anomalies.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/Graph.tsx', { query: '?raw', eager: true, import: 'default' })),
};
```

2. In `'covers the page and every new component'`, add these entries to the `arrayContaining` list:

```ts
        './BrainFrame.tsx',
        './BrainControls.tsx',
        './BrainTiles.tsx',
        './BrainBackLink.tsx',
        './ChangedTiles.tsx',
        './DoingTiles.tsx',
        './CustomerTiles.tsx',
```

3. In `'sets every figure in DM Mono with tabular-nums'`, add `'./ChangedTiles.tsx'`, `'./DoingTiles.tsx'` and `'./CustomerTiles.tsx'` to the file list.
4. Append these tests inside `describe('brain: coverage, figures, states, storage, copy', …)`:

```ts
  it('draws no DM Serif Display title and no h1 on any Brain page: "Brain" in the bar is the title', () => {
    expect(Object.keys(pages)).toHaveLength(7);
    expect(Object.entries(pages).filter(([, s]) => /font-display|<h1\b/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('frames every Brain page with BrainFrame, full width, with no centred column', () => {
    for (const [file, source] of Object.entries(pages)) {
      expect(source, file).toMatch(/<BrainFrame>/);
      expect(source, file).not.toMatch(/\bmx-auto\b|max-w-(4xl|6xl)/);
    }
  });

  it('puts every scope switch through BrainControls, never inline on a page', () => {
    for (const [file, source] of Object.entries(pages)) {
      expect(source, file).not.toMatch(/<ScopeSwitch\b/);
      expect(source, file).toMatch(/<BrainControls brain=\{brain\} \/>/);
    }
  });

  it('opens each of the four questions with tiles built from tileParts or JumpTile', () => {
    expect(files['./ChangedTiles.tsx']).toMatch(/<Tile /);
    expect(files['./WaitingDesk.tsx']).toMatch(/<TileButton /);
    expect(files['./DoingTiles.tsx']).toMatch(/<JumpTile/);
    expect(files['./CustomerTiles.tsx']).toMatch(/<JumpTile/);
    for (const page of ['../../pages/brain/WhatChanged.tsx', '../../pages/brain/Waiting.tsx', '../../pages/brain/Doing.tsx', '../../pages/brain/Customers.tsx']) {
      expect(files[page], page).toMatch(/<TilesSkeleton count=\{\d\} \/>/);
    }
  });
```

- [ ] **Step 2: Run the house rules**

Run: `npx vitest run src/components/brain/houseRules.test.ts src/components/layout/houseRules.test.ts src/layouts/houseRules.test.ts --maxWorkers=2`
Expected: PASS. If a size, token, em dash or target rule fails, fix the named file. Do not loosen the rule.

- [ ] **Step 3: Tighten the journeys and add one across the tabs**

In `src/e2e/brain.test.tsx`:

1. Replace each of the four `expect(screen.getByRole('heading', { level: 1, name: 'Brain' })).toBeInTheDocument();` lines (added in Task 3) with:

```tsx
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
```

2. Append a new describe at the end of the file:

```tsx
describe('Brain: the frame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a manager moves between the questions on the bar’s tabs, keeping the scope, with the switch in the bar', { timeout: 30000 }, async () => {
    stubBrain();
    renderBrain('/brain?scope=team', { nav: true });
    const tabs = () => within(screen.getByRole('navigation', { name: 'Brain' }));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(tabs().getByRole('link', { name: 'What changed' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('banner')).getByRole('group', { name: 'View' })).toBeInTheDocument();

    await userEvent.click(tabs().getByRole('link', { name: "What's being done" }));
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=team'));
    expect(tabs().getByRole('link', { name: "What's being done" })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(tabs().getByRole('link', { name: 'Customers' }));
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=team'));
    await userEvent.click(await screen.findByRole('link', { name: CS.SEE_ALL_ASKS }));
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=team'));
    expect(tabs().getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
  });
});
```

- [ ] **Step 4: Run the journeys**

Run: `npx vitest run src/e2e --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Update `docs/03-ui-ux-design.md`**

1. Insert this section directly above `### Brain: What changed`:

```markdown
### Brain: the frame

Spec `docs/superpowers/specs/2026-10-06-brain-ui-design.md`. Every `/brain*`
route wears the framed bar: "Brain" as its `h1` at 15px, then a
`<nav aria-label="Brain">` of four underline tabs: What changed, Waiting on
you (the reader's Me count as a badge, also in its accessible name), What's
being done, and Customers, which stays lit on Feature Requests and
Anomalies. The Knowledge graph lights no tab. The tabs carry `?scope=` only;
below `sm` the row scrolls sideways and never wraps. The scope switch sits in
the bar's actions slot (`BrainControls`), and inline at the top of the page
below `sm`. The body is `BrainFrame`: full width, `px-4 pb-6`, no centred
column, with a `rail` slot kept for Ask Revenact. No Brain page draws a DM
Serif Display title. Section headings use the tile label style (11px,
uppercase, `text-ink-muted`), body text is 13px, figures are DM Mono, and
tile figures are 22px. Each of the four questions opens with a row of tiles
(`tileParts`, or `JumpTile` where a tile jumps to a section): a grid of 2 to
5 columns that scrolls sideways with snap below `sm`, loading as
`TilesSkeleton`. Feature Requests, Anomalies and the Knowledge graph lead
back ("‹ Customers", "‹ What changed", keeping the scope) above a 15px
semibold title. The sidebar has one Brain item (Lucide `Brain`), lit on
every `/brain*` route, with the Me count as its badge.
```

2. Replace

```markdown
- **Header.** An `h1` at 22px in DM Serif Display ("What changed"), the since
  line below it, and the scope switch: a segmented control from `sm`, a
  select below it; one scope offered reads as a label, not a control.
```

with

```markdown
- **Top of the page.** A toolbar row with the since line and the quiet
  "Knowledge graph" link, then four tiles: ARR, Net revenue retention, ARR at
  risk and Book in good health, matched by the registry keys `active_arr`,
  `nrr`, `at_risk_arr` and `healthy_share` (a key the scope lacks is
  skipped; the registry has no renewals-due metric). Each tile shows its
  label, the figure at 22px in DM Mono, then "down $13.4K, worse" in its
  trend colour. A withheld figure reads "No figure". The scope switch is in
  the bar: a segmented control from `sm`, a select below it, and one scope
  offered reads as a label, not a control.
- **Body.** From `lg` the brief (reading width) and What moved side by side,
  stacked below. Everything we measure runs full width beneath.
```

3. Replace

```markdown
- No glass anywhere on the page. The Navbar shows "Brain" as a paragraph, not
  a heading, on `/brain`, `/brain/waiting`, `/brain/doing` and
  `/brain/customers`. Knowledge by function has moved to What's being done.
```

with

```markdown
- No glass anywhere on the page. Knowledge by function has moved to What's
  being done.
```

4. Replace

```markdown
- **Header.** An `h1` at 22px in DM Serif Display ("Waiting on you"), the
  same scope switch, and in Company, for `view_all_accounts` readers, the
  page's one primary button, Ask the agent, with "Uses AI credits." below it.
- **Chips.** All · Rule reviews · Proposals · Questions · Overdue tasks, each
  with its full count in DM Mono; pill buttons that wrap, `aria-pressed`.
```

with

```markdown
- **Tiles.** All, Rule reviews, Proposals, Questions, Overdue tasks, each with
  its full count at 22px in DM Mono. The whole tile is a toggle
  (`aria-pressed`), and pressing the pressed one goes back to All.
- **Toolbar.** Between the tiles and the list: the "Waiting on you" section
  label (it takes focus when the last row leaves) and, in Company for
  `view_all_accounts` readers, the page's one primary button, Ask the agent,
  with "Uses AI credits." below it.
```

5. Replace `- **States.** A skeleton of chips and rows,` with `- **States.** A skeleton of tiles and rows,`.
6. Replace

```markdown
- **Sidebar.** Waiting on you (Lucide `Inbox`) after What changed, with the
  reader's Me count as its badge.
```

with

```markdown
- **Badge.** The reader's Me count shows on the Waiting on you tab and on
  the sidebar's one Brain item.
```

7. Replace

```markdown
- **Header.** An `h1` at 22px in DM Serif Display ("What's being done"), the
  same scope switch, and section links (Initiatives · Plans · Rules at work):
  quiet links that set `?section=` and move focus to that section's heading;
  they wrap below `sm`.
```

with

```markdown
- **Tiles.** Three tiles that jump to their section, setting `?section=` and
  moving focus to its heading (`navigation` "Sections", in place of the
  section links): Initiatives (active, and how many are on track: measured
  and inside their date), Open plans (and how many are at risk), and Rules
  running (and how many fired last night).
```

8. Replace

```markdown
- **Sidebar.** What's being done (Lucide `Flag`) after Waiting on you, for
  every member; Initiatives is gone from the sidebar.
```

with

```markdown
- **Sections.** Their headings use the tile label style and take focus from
  a tile or `?section=`.
```

9. Replace

```markdown
- **Header.** An `h1` at 22px in DM Serif Display ("What customers are
  saying"), a quiet "See on the graph" link (Lucide `Network`) to the graph in
  the same scope, the same scope switch, and section links (Asks · Anomalies ·
  Scores · Sentiment) that set `?section=` and move focus to that heading.
```

with

```markdown
- **Top of the page.** A quiet "See on the graph" link (Lucide `Network`) to
  the graph in the same scope, then five tiles that jump to their section:
  Asks (the total), Anomalies (the total, every status), NPS and CSAT (the
  Scores figures, "Not enough answers" under 5) and Negative contacts. From
  `lg`, Asks sits beside Anomalies and Scores beside Sentiment.
```

10. Replace

```markdown
- **Sidebar.** What customers are saying (Lucide `MessagesSquare`) after
  What's being done, for every member. Feature Requests and Anomalies have
  left the sidebar: the Brain group is the four questions.
```

with

```markdown
- **Feature Requests and Anomalies** open from See all, in the Brain frame,
  with the Customers tab lit and "‹ Customers" leading back.
```

- [ ] **Step 6: Update `docs/04-app-flow.md`**

1. Replace

```markdown
Campaigns, Canvas), KNOWLEDGE BRAIN — the four questions, for everyone:
What changed, Waiting on you (with the reader's Me count as its badge),
What's being done, What customers are saying (which lights for Feature
Requests and Anomalies too, since those left the sidebar and now open from
its See all) — SETUP (Settings, Lifecycle, Health, Users, Integrations).
```

with

```markdown
Campaigns, Canvas), KNOWLEDGE BRAIN — one Brain item for everyone, lit on
every `/brain*` route, with the reader's Me count as its badge; the four
questions are the Brain bar's tabs — SETUP (Settings, Lifecycle, Health,
Users, Integrations).
```

2. Directly after the heading `### 4.11 Brain` and its blank line, insert:

```markdown
Every `/brain*` page sits under the Brain bar (spec 2026-10-06 Brain UI): the
tabs What changed, Waiting on you, What's being done and Customers carry
`?scope=` between pages, the scope switch is in the bar (inline below `sm`),
and each of the four questions opens with tiles built from the data it
already reads. On What's being done and What customers are saying a tile sets
`?section=` and moves focus to that section, as the section links did; on
Waiting on you a tile filters the list, and pressing it again goes back to
All.

```

3. Replace `A quiet "Knowledge graph" link (Lucide \`Network\`) sits in the header for` with `A quiet "Knowledge graph" link (Lucide \`Network\`) sits in the toolbar row for`.
4. Replace `decision is sent once and asks the sidebar badge (\`GET` with `decision is sent once and asks both badges (the Waiting on you tab's and the sidebar Brain item's; \`GET`.
5. Replace `and how many plans the reader can't open. Section links set \`?section=\`,` with `and how many plans the reader can't open. Its tiles set \`?section=\`,`.

- [ ] **Step 7: Full verification**

Run, in order:

```bash
npm run lint
npx vitest run --maxWorkers=2
npm run build
```

Expected: lint has no errors, every test passes, and the build succeeds.

- [ ] **Step 8: Browser check (spec §4)**

Start the backend and `npm run dev` (or use the `run` skill), and sign in as a manager with `view_all_accounts`. For each of `/brain`, `/brain/waiting`, `/brain/doing`, `/brain/customers`, `/brain/requests`, `/brain/anomalies` and `/brain/graph`, at **1440px and 375px**, in **light and dark**:
- Take a screenshot. Check that "Brain" and the tabs are in the bar, the right tab is lit (none on the graph), and the scope switch is in the bar at 1440 and inline at the top at 375.
- In the console, measure the gutters and overflow:

```js
const stack = document.querySelector('[data-brain-frame] > div');
const cs = getComputedStyle(stack);
({ left: cs.paddingLeft, right: cs.paddingRight, pageOverflows: document.documentElement.scrollWidth > window.innerWidth, frameOverflows: stack.parentElement.scrollWidth > stack.parentElement.clientWidth });
```

Expected: `left` and `right` are `"16px"`, and both overflow flags are `false`. At 375px, the tile rows scroll sideways inside themselves only.
- Write the 28 results (7 routes × 2 widths × 2 themes) into the PR description. No commit for this step.

- [ ] **Step 9: Commit**

```bash
git add src/components/brain/houseRules.test.ts src/e2e/brain.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "test(brain): house rules and a tabs journey for the Brain frame; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| §1.1 every `/brain*` in `isFramed`; h1 "Brain"; `<nav aria-label="Brain">` with four tabs; What changed exact; waiting badge + "…, N waiting"; Customers on requests/anomalies; graph none; `?scope=` kept; phones scroll, never wrap; old branch removed | 3 |
| §1.2 `BrainControls` portals `ScopeSwitch`; inline below `sm`; pages without scope keep none | 2 (component), 5–8 (pages) |
| §1.3 one "Brain" item, Brain icon, `forceActive` on `/brain*`, badge and route refresh kept, three items removed | 4 |
| §1.4 `p-0` in DashboardLayout; `BrainFrame` (`h-full overflow-y-auto`, `flex flex-col gap-4 px-4 pb-6`, no max width, `rail`); all seven routes use it | 1, 5–8, 9 (house rule) |
| §1.5 no `font-display` h1; section headings as tile labels; 13px body; DM Mono; 22px tile figures; four sizes; ~70ch reading | 5–8, 9 |
| §2 tile rows (2–5 cols, snap below `sm`, `TilesSkeleton`, no new calls) | 5–7 |
| What changed: five tiles by key, skip missing, now + change + direction, "No figure"; brief + moves at `lg`; measure full width; graph link in toolbar | 5 (four tiles: no renewals metric) |
| Waiting: four kind tiles with counts, pressed, press again clears; All N; list full width; Ask the agent toolbar above list | 6 |
| Doing: three tiles that jump and set `?section=`; sections full width; Knowledge by function | 7 |
| Customers: five tiles (NPS/CSAT via ScoresPanel logic incl. "Not enough answers"); Asks+Anomalies and Scores+Sentiment side by side at `lg`; tiles replace section links | 7 |
| Requests/Anomalies/Graph: BrainFrame, 15px semibold title with back link keeping scope, BrainControls, full width | 8 |
| §3 nothing else changes | Global Constraints; no API or behaviour edits in any task |
| §4 tests: Navbar, Sidebar, BrainControls, each page, house rules, e2e, browser check | 3, 4, 2, 5–8, 9 |

**2. Placeholder scan.** No TBD or TODO entries. Every code step carries its code. Doc edits name exact old and new text.

**3. Type consistency.** `BrainControls({ brain })` is used the same way in Tasks 5–8, and so is `BrainFrame({ rail?, children })`. `tileRow(2|3|4|5)` and `SECTION_TITLE` are defined in Task 5 and used in Tasks 6 and 7. `withSection(search, key)` comes from `doingText.ts`. `DoingTiles({ data, current, onSame })` and `CustomerTiles({ data, current, onSame })` match their page call sites. `CS.BACK` is defined in Task 7 and used in Task 8. `BrainNavItem` and `brainLink` from Task 4 match the e2e edits there, and `isBrainPath` from Task 3 is used in Task 4.
