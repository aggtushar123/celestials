# Dashboard drill-down, frontend (PR 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a dashboard number opens a side panel listing the complete set of companies behind it, each linking to its company page, with "Open as a list" into the Organizations list.

**Architecture:** A `DrillProvider` on `DashboardFrame` holds the open request; `DrillPanel` renders it beside the scroll area (a sheet below `lg`). A request carries either rows the page already has (Health, Usage) or a server segment (`?drill=` on the stats endpoint, backend PR 2a). `Kpi` gains `onDrill`; charts use recharts `onClick` for pointers plus a `DrillTargets` list of real buttons for keyboards and screen readers.

**Tech Stack:** React 19, TypeScript, react-router 7, Redux Toolkit, recharts 3, Tailwind v4 tokens, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-dashboard-redesign-design.md` §3 "Drill-down" (amended 2026-09-24). Backend contract: `revenact-backend/docs/superpowers/plans/2026-09-24-dashboard-drill-backend.md` (Global Constraints: response shape and segments).

**Branch:** `feat/dashboard-drill`, stacked on `feat/dashboard-redesign` (PR #73). Open its PR only after #73 merges (CI does not run `build_and_test` on PRs whose base is not main); then rebuild on main and target main.

## Global Constraints

- A panel opens only where the list is complete. Never drill from a capped list (Forecast `swing`, Activity `going_dark`, Customers `concentration` beyond its top 3, Topics `recent`).
- Server drill response: `{drill: {segment, value_label, count, truncated, companies: [{id, name, owner, arr, value}]}, currency}`; request = the view's current API query string plus `drill=<segment>`.
- Server segments: tickets `all | on_hold | sentiment:<v> | priority:<v> | status:<v> | origin:<connector id|none> | assignee:<name>`; interactions `all | type:<email|call|ticket> | sentiment:<v> | area:<v> | category:<v> | subcategory:<v>`; forecast `at_risk | churn | contraction | expansion`; activity `gone_quiet`; overview `churned_12m`.
- Company links: `/organizations/<id>`. "Open as a list": `/organizations/list?ids=<comma ids>` (shown only when `count <= 500` and not truncated).
- Accessibility: every drill trigger is reachable by keyboard with an accessible name "<label> <figure>, show accounts"; the panel is `role="dialog"` with `aria-labelledby`, focus moves into it on open, Escape and the close button close it, and focus returns to the trigger.
- Motion: the panel slides in within `--dur-base` with `ease-out`, no animation under reduced motion (the global override handles it).
- Tokens only; one monochrome primary; numbers in `font-mono-brand tabular-nums`; at most four type sizes.
- Tests per `.claude/skills/testing`; `npm run lint` 0 errors, `npx tsc -b --noEmit`, `npx vitest run`, `npm run build` pass.
- Commits: `type(scope): subject`, ending `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Structure

New under `src/pages/dashboard/drill/`:

| File | Responsibility |
|---|---|
| `types.ts` | `DrillRow`, `DrillSource`, `DrillRequest` |
| `DrillContext.tsx` | `DrillProvider`, `useDrill()` |
| `DrillPanel.tsx` | The panel: header, rows, states, "Open as a list" |
| `drillApi.ts` | `fetchDrill(path, query, segment)` → `DrillRow[]` + meta |
| `DrillTargets.tsx` | Keyboard/screen-reader buttons for a chart's drillable parts |
| `rows.ts` | `fromHealthRows`, `fromUsageRows` mappers |
| tests beside each |

Modified: `pages/dashboard/DashboardFrame.tsx`, `pages/dashboard/shared/Kpi.tsx`, `pages/organizations/List.tsx`, and the views/charts wired in Tasks 5–10.

---

### Task 1: Drill types, provider and panel (rows source)

**Files:**
- Create: `src/pages/dashboard/drill/types.ts`, `DrillContext.tsx`, `DrillPanel.tsx`, `DrillPanel.test.tsx`
- Modify: `src/pages/dashboard/DashboardFrame.tsx`

**Interfaces:**
- Produces:

```ts
// types.ts
export interface DrillRow {
  id: string;            // customer id as a string
  name: string;
  owner?: string;
  arr?: number | null;
  detail?: string;       // one short line, e.g. "45 days overdue"
}
export type DrillSource =
  | { kind: 'rows'; rows: DrillRow[] }
  | { kind: 'server'; path: string; query: string; segment: string };
export interface DrillRequest {
  title: string;          // e.g. "At risk"
  figure: string;         // e.g. "$114.5K" — shown beside the title
  source: DrillSource;
}
```

  - `DrillProvider({ children })`, `useDrill(): { current: DrillRequest | null; open(req: DrillRequest, trigger?: HTMLElement | null): void; close(): void }`
  - `DrillPanel()` renders nothing when `current` is null.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/pages/dashboard/drill/DrillPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DrillProvider, useDrill } from './DrillContext';
import { DrillPanel } from './DrillPanel';

const rows = [
  { id: '3', name: 'Uber', owner: 'Carl CSM', arr: 42000, detail: '197 days to renewal' },
  { id: '7', name: 'Pizza Hut', owner: 'Carl CSM', arr: 38100, detail: '45 days overdue' },
];

function Opener() {
  const { open } = useDrill();
  return (
    <button onClick={(e) => open({ title: 'At risk', figure: '$114.5K', source: { kind: 'rows', rows } }, e.currentTarget)}>
      At risk
    </button>
  );
}

function renderPanel() {
  // A minimal store with the auth currency the panel's money formatter reads;
  // copy the preloaded auth shape an existing test uses (grep useOrgCurrency tests).
  const store = configureStore({ reducer: { auth: (s = { organisation: { currency: 'USD' } }) => s } });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <DrillProvider>
          <Opener />
          <DrillPanel />
        </DrillProvider>
      </MemoryRouter>
    </Provider>,
  );
}

describe('DrillPanel', () => {
  it('opens as a labelled dialog listing each company with a link', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    const dialog = screen.getByRole('dialog', { name: /At risk/ });
    expect(dialog).toHaveTextContent('$114.5K');
    expect(screen.getByRole('link', { name: 'Uber' })).toHaveAttribute('href', '/organizations/3');
    expect(screen.getByText('45 days overdue')).toBeInTheDocument();
  });

  it('offers Open as a list with every id', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    expect(screen.getByRole('link', { name: /Open as a list/ })).toHaveAttribute(
      'href',
      '/organizations/list?ids=3,7',
    );
  });

  it('moves focus in, closes on Escape and returns focus to the trigger', async () => {
    renderPanel();
    const trigger = screen.getByRole('button', { name: 'At risk' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('says so when a number has no companies behind it', async () => {
    function EmptyOpener() {
      const { open } = useDrill();
      return <button onClick={() => open({ title: 'Declining', figure: '0', source: { kind: 'rows', rows: [] } })}>Declining</button>;
    }
    const store = configureStore({ reducer: { auth: (s = { organisation: { currency: 'USD' } }) => s } });
    render(
      <Provider store={store}>
        <MemoryRouter>
          <DrillProvider>
            <EmptyOpener />
            <DrillPanel />
          </DrillProvider>
        </MemoryRouter>
      </Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Declining' }));
    expect(screen.getByText('No accounts behind this number.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open as a list/ })).not.toBeInTheDocument();
  });
});
```

Before running, check how `useOrgCurrency` (`src/hooks.ts:12`) reads the store and shape the test reducer to match.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/dashboard/drill/DrillPanel.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```tsx
// DrillContext.tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DrillRequest } from './types';

interface DrillState {
  current: DrillRequest | null;
  open: (request: DrillRequest, trigger?: HTMLElement | null) => void;
  close: () => void;
}

const DrillContext = createContext<DrillState | null>(null);

/** Holds the one open drill for the whole dashboard. One panel, not one per
 *  view: opening another number replaces what is shown. */
export function DrillProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DrillRequest | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const open = useCallback((request: DrillRequest, from?: HTMLElement | null) => {
    trigger.current = from ?? (document.activeElement as HTMLElement | null);
    setCurrent(request);
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    const back = trigger.current;
    trigger.current = null;
    // After the panel unmounts, so focus lands on something still in the page.
    requestAnimationFrame(() => back?.focus());
  }, []);

  const value = useMemo(() => ({ current, open, close }), [current, open, close]);
  return <DrillContext.Provider value={value}>{children}</DrillContext.Provider>;
}

export function useDrill(): DrillState {
  const state = useContext(DrillContext);
  if (!state) throw new Error('useDrill must be used inside DrillProvider');
  return state;
}
```

If `requestAnimationFrame` makes the focus-return test flaky in jsdom, focus synchronously in a `useEffect` inside `DrillPanel`'s cleanup instead; the test pins the behaviour.

```tsx
// DrillPanel.tsx
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useOrgCurrency } from '../../../hooks';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { useDrill } from './DrillContext';
import type { DrillRow } from './types';

const LIST_LIMIT = 500;

/** The rows behind one number. Beside the scroll area from `lg`, a sheet
 *  over the page below it. */
export function DrillPanel() {
  const { current, close } = useDrill();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!current) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, close]);

  if (!current) return null;
  return (
    <aside
      role="dialog"
      aria-labelledby={titleId}
      className="fixed inset-0 z-40 bg-surface lg:static lg:inset-auto lg:z-auto lg:w-[360px] lg:shrink-0 lg:border lg:border-line lg:rounded-xl flex flex-col min-h-0"
    >
      <header className="flex items-start justify-between gap-3 p-4 border-b border-line">
        <h2 id={titleId} className="text-[15px] font-semibold text-ink">
          {current.title}{' '}
          <span className="font-mono-brand tabular-nums text-ink-muted">{current.figure}</span>
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close"
          className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </header>
      {current.source.kind === 'rows' ? <RowList rows={current.source.rows} /> : <ServerRows />}
    </aside>
  );
}

function RowList({ rows, total }: { rows: DrillRow[]; total?: number }) {
  const currency = useOrgCurrency();
  if (rows.length === 0) {
    return <p className="p-4 text-[13px] text-ink-muted">No accounts behind this number.</p>;
  }
  const count = total ?? rows.length;
  return (
    <div className="flex flex-col min-h-0">
      {count <= LIST_LIMIT && rows.length === count && (
        <Link
          to={`/organizations/list?ids=${rows.map((r) => r.id).join(',')}`}
          className="mx-4 mt-3 text-[13px] font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
        >
          Open as a list <span aria-hidden="true">→</span>
        </Link>
      )}
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-line px-4 py-2">
        {rows.map((row) => (
          <li key={row.id} className="py-2.5 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={`/organizations/${row.id}`}
                className="block truncate text-[13px] font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
              >
                {row.name}
              </Link>
              {(row.detail || row.owner) && (
                <div className="text-[11px] text-ink-muted truncate">
                  {[row.detail, row.owner].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {row.arr != null && (
              <span className="font-mono-brand tabular-nums text-[13px] text-ink shrink-0">
                {formatCompactMoney(row.arr, currency)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Replaced in Task 3.
function ServerRows() {
  return null;
}
```

`DashboardFrame.tsx`:

```tsx
import { Outlet } from 'react-router-dom';
import { DrillProvider } from './drill/DrillContext';
import { DrillPanel } from './drill/DrillPanel';

/** (keep the existing comment) … The drill panel sits beside the scroll
 *  area from `lg`, so opening it never scrolls the page away. */
export function DashboardFrame() {
  return (
    <DrillProvider>
      <div className="flex-1 min-h-0 w-full flex gap-4 p-4">
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
          <Outlet />
        </div>
        <DrillPanel />
      </div>
    </DrillProvider>
  );
}
```

Update `routes.test.tsx`'s "dashboard frame" assertions if they pinned the old single-div classes (the scroll container is now the inner div; keep a test that one element owns `overflow-y-auto`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/dashboard/drill src/pages/dashboard/routes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/drill src/pages/dashboard/DashboardFrame.tsx src/pages/dashboard/routes.test.tsx
git commit -m "feat(dashboard): the drill panel beside the dashboard"
```

---

### Task 2: Drill triggers — `Kpi.onDrill` and `DrillTargets`

**Files:**
- Modify: `src/pages/dashboard/shared/Kpi.tsx`, `Kpi.test.tsx`
- Create: `src/pages/dashboard/drill/DrillTargets.tsx`, `DrillTargets.test.tsx`

**Interfaces:**
- `Kpi` gains `onDrill?: (trigger: HTMLElement) => void`. With it, the whole tile is a `<button type="button">` whose accessible name is `"<label> <value>, show accounts"` (via `aria-label`, which must contain the visible label and value in that order to satisfy label-in-name), with hover (`bg-subtle`), `focus-visible` outline and `cursor-pointer`. Without it, unchanged.
- `DrillTargets({ label, items }: { label: string; items: { name: string; figure: string; onSelect: (trigger: HTMLElement) => void }[] })` renders a `<ul aria-label={label}>` of buttons `"<name> <figure>, show accounts"`. Visually hidden (`sr-only`) until any of its buttons has focus, then shown as a compact chip row above the chart (`focus-within:not-sr-only`). Place it immediately before the chart it serves.

- [ ] **Step 1: Write the failing tests**

```tsx
// add to Kpi.test.tsx
it('becomes a button with a full accessible name when drillable', async () => {
  const onDrill = vi.fn();
  render(<Kpi label="At risk" value="$114.5K" onDrill={onDrill} />);
  const button = screen.getByRole('button', { name: 'At risk $114.5K, show accounts' });
  await userEvent.click(button);
  expect(onDrill).toHaveBeenCalledWith(button);
});

it('stays a plain figure without onDrill', () => {
  render(<Kpi label="NRR" value="99.6%" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

```tsx
// DrillTargets.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrillTargets } from './DrillTargets';

describe('DrillTargets', () => {
  it('gives keyboard users one button per drillable part', async () => {
    const onSelect = vi.fn();
    render(<DrillTargets label="Ticket priority" items={[{ name: 'High', figure: '135', onSelect }]} />);
    const list = screen.getByRole('list', { name: 'Ticket priority' });
    const button = screen.getByRole('button', { name: 'High 135, show accounts' });
    expect(list).toContainElement(button);
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(button);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/dashboard/shared/Kpi.test.tsx src/pages/dashboard/drill/DrillTargets.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `Kpi.tsx`, keep the inner markup in a `body` constant and:

```tsx
  if (!onDrill) return <div className="min-w-0">{body}</div>;
  return (
    <button
      type="button"
      onClick={(event) => onDrill(event.currentTarget)}
      aria-label={`${label} ${value}, show accounts`}
      className="min-w-0 w-full text-left rounded-lg -m-1 p-1 cursor-pointer hover:bg-subtle transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {body}
    </button>
  );
```

```tsx
// DrillTargets.tsx
/** Real buttons for a chart's drillable parts. Recharts draws SVG that a
 *  keyboard cannot reach; these give keyboard and screen-reader users the
 *  same drill a pointer gets by clicking a segment. Hidden until focused so
 *  the chart stays uncluttered. */
export function DrillTargets({
  label,
  items,
}: {
  label: string;
  items: { name: string; figure: string; onSelect: (trigger: HTMLElement) => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className="sr-only focus-within:not-sr-only focus-within:flex focus-within:flex-wrap focus-within:gap-1 focus-within:mb-2"
    >
      {items.map((item) => (
        <li key={item.name}>
          <button
            type="button"
            onClick={(event) => item.onSelect(event.currentTarget)}
            className="min-h-8 px-2 rounded-md border border-line bg-surface text-[11px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {item.name} <span className="font-mono-brand tabular-nums">{item.figure}</span>
            <span className="sr-only">, show accounts</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

(The accessible name is the text content: "High 135, show accounts".)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/dashboard/shared src/pages/dashboard/drill`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/shared/Kpi.tsx src/pages/dashboard/shared/Kpi.test.tsx src/pages/dashboard/drill/DrillTargets.tsx src/pages/dashboard/drill/DrillTargets.test.tsx
git commit -m "feat(dashboard): numbers and chart parts that open the drill panel"
```

---

### Task 3: Server drill source

**Files:**
- Create: `src/pages/dashboard/drill/drillApi.ts`, `drillApi.test.ts`
- Modify: `src/pages/dashboard/drill/DrillPanel.tsx` (replace `ServerRows`), `DrillPanel.test.tsx`

**Interfaces:**
- `fetchDrill(path: string, query: string, segment: string): Promise<{ rows: DrillRow[]; count: number; truncated: boolean }>` — calls `apiFetch(`${path}?${query}${query ? '&' : ''}drill=${encodeURIComponent(segment)}`)`, maps each company to `DrillRow` with `id: String(c.id)`, `owner`, `arr`, `detail: formatDetail(value, value_label, currency)`.
- `formatDetail(value, label, currency)`: money labels (`downside`, `expected expansion`, `ARR`) → `formatCompactMoney(value, currency) + ' ' + label` (ARR shown only once, so for `ARR` return `''`); `days since contact` → `"never contacted"` for null, else `"<n> days since contact"`; counts (`tickets`, `interactions`) → `"<n> ticket(s)"` / `"<n> interaction(s)"`.
- `ServerRows` loads on mount / when the request changes, shows `Loading` (DataState) while pending, `ErrorState` on failure ("Could not load the accounts behind this number."), and `RowList` with `total={count}` when done (so "Open as a list" hides for truncated lists and says "Showing 500 of N" above the list when truncated).

- [ ] **Step 1: Write the failing tests** — in `drillApi.test.ts`, stub `fetch` (same pattern as `CustomObjectsTab.test.tsx`: `vi.stubGlobal('fetch', …)` returning `{ ok, status, json }`) and assert: the URL contains the existing query and `drill=priority%3Ahigh`; rows map ids to strings; `formatDetail` for each label family (`2 tickets`, `1 ticket`, `never contacted`, `45 days since contact`, `$12K downside`). In `DrillPanel.test.tsx`, add: a server request shows "Loading…" then the rows; a failed fetch shows the error; a truncated response shows "Showing 500 of 812" and no "Open as a list".

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/pages/dashboard/drill` → FAIL.

- [ ] **Step 3: Implement** `drillApi.ts` per the interface and replace `ServerRows`:

```tsx
function ServerRows({ path, query, segment }: { path: string; query: string; segment: string }) {
  const currency = useOrgCurrency();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'done'; rows: DrillRow[]; count: number; truncated: boolean }
  >({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fetchDrill(path, query, segment, currency)
      .then((result) => live && setState({ status: 'done', ...result }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [path, query, segment, currency]);

  if (state.status === 'loading') return <Loading label="Loading the accounts behind this number…" />;
  if (state.status === 'error') return <ErrorState message="Could not load the accounts behind this number." detail="Try again, or open the area's full view." />;
  return (
    <>
      {state.truncated && (
        <p className="mx-4 mt-3 text-[11px] text-ink-muted">
          Showing <span className="font-mono-brand tabular-nums">{state.rows.length}</span> of{' '}
          <span className="font-mono-brand tabular-nums">{state.count}</span>
        </p>
      )}
      <RowList rows={state.rows} total={state.count} />
    </>
  );
}
```

(`fetchDrill` takes `currency` as a 4th argument for `formatDetail`; update the interface line above accordingly.) Render it as `<ServerRows {...current.source} />` for server sources. The react-hooks lint rule may flag `setState` inside the effect (`react-hooks/set-state-in-effect`); if so, key `ServerRows` on `path+query+segment` from the parent and initialise `loading` from `useState` instead of resetting it in the effect.

- [ ] **Step 4: Run tests** — `npx vitest run src/pages/dashboard/drill` → PASS; `npx eslint src/pages/dashboard/drill` → 0 errors.

- [ ] **Step 5: Commit** — `git add src/pages/dashboard/drill && git commit -m "feat(dashboard): drill lists the server computes"`

---

### Task 4: Organizations list reads `?ids=`

**Files:**
- Modify: `src/pages/organizations/List.tsx`
- Test: the Organizations list test file (find with `grep -rl "organizations/List" src --include=*.test.tsx`; create `List.test.tsx` beside it if none)

**Interfaces:**
- `/organizations/list?ids=3,7` fetches `/customers/?ids=3,7` (plus `&search=` when searching), and shows a notice above the table: "Showing <n> accounts from the dashboard · Show all" where "Show all" removes `ids` from the URL.

- [ ] **Step 1: Write the failing test** — render the page at `/organizations/list?ids=3,7` with fetch stubbed; assert the first fetch URL contains `/customers/?ids=3%2C7` (or `ids=3,7` — match how the code encodes it) and the notice text; click "Show all" and assert the next fetch has no `ids`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — read `ids` with `useSearchParams`; build the fetch URL from `URLSearchParams` with `search` and `ids` (replacing the current template-string URL at List.tsx:38); keep pagination behaviour; render the notice with a button that deletes `ids` via `setSearchParams`.
- [ ] **Step 4: Run** the Organizations tests → PASS.
- [ ] **Step 5: Commit** — `feat(organizations): open a dashboard drill as a list`

---

### Task 5: Health › Triage, Divergence and Movement

**Files:**
- Create: `src/pages/dashboard/drill/rows.ts`, `rows.test.ts`
- Modify: `health-overview/charts/TriageTiles.tsx`, `health-overview/TriageView.tsx`, `health-overview/DivergenceView.tsx`, `health-overview/MovementView.tsx`, `health-overview/charts/RenewalRunwayChart.tsx`, and their tests

**Interfaces:**
- `fromHealthRows(rows: HealthDataRow[], detail?: (row: HealthDataRow) => string | undefined): DrillRow[]` → `{ id: row.id, name: row.account, owner: row.owner, arr: row.arr, detail: detail?.(row) }`.
- Drills (all `kind: 'rows'`), each predicate exactly as the number is computed today:
  - Triage KPIs (TriageTiles): **Needs action now** → scored rows with `score >= 40` (detail `"risk <score>"`); **Declining** → `direction === 'declining'`; **Book at Good** → `row.healthStatus === 'Good'`.
  - Divergence headline: **disagreeing** → `kind === 'ai-colder' || kind === 'csm-colder'`; **urgent blind spots** → `kind === 'ai-colder' && daysToRenewal !== null && daysToRenewal <= 90`; **unrated** → `kind === 'unrated'`. Each number in the sentence becomes an inline `<button>` (underlined, same text) calling `open`.
  - Movement tiles: **Downgrades** → rows with any consecutive pair in the last `windowMonths` of `history` whose ladder index drops; **Upgrades** → rises; **Net movement** is not drillable. Use the ladder and window `movement.ts` already uses (export a small `movedRows(rows, windowMonths, direction)` from `movement.ts` and test it there).
  - RenewalRunwayChart bars: `renewalBuckets` bucket × `healthStatus`, via `<Bar onClick>` and a `DrillTargets` list.

- [ ] **Step 1: Write the failing tests** — `rows.test.ts` for `fromHealthRows`; in `TriageView.test.tsx` click "Needs action now 3, show accounts" and assert the dialog lists exactly the three `score >= 40` accounts from the fixture (render inside `DrillProvider` + `DrillPanel`; add a `renderWithDrill` helper to `health-overview/testUtils.tsx`); in `DivergenceView.test.tsx` the "unrated" number opens the unrated accounts; in `movement.test.ts` `movedRows` returns the expected ids for a fixture with one downgrade and one upgrade; in `MovementView.test.tsx` the Downgrades tile opens those accounts.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — in each component, `const { open } = useDrill();` and pass `onDrill={(trigger) => open({ title, figure, source: { kind: 'rows', rows: fromHealthRows(picked, detail) } }, trigger)}`. For Movement's hand-built tiles, replace them with `Kpi`/`KpiStrip` (`columns={3}`) so they get `onDrill` for free; keep their labels, values and details.
- [ ] **Step 4: Run** `npx vitest run src/pages/dashboard/tabs/health-overview src/pages/dashboard/drill` → PASS.
- [ ] **Step 5: Commit** — `feat(dashboard): drill into Triage, Divergence and Movement`

---

### Task 6: Health › Renewals and Distribution; remove the fake chart

**Files:**
- Modify: `health-overview/RenewalView.tsx`, `charts/RenewalQuarterChart.tsx`, `charts/RenewalCoverageChart.tsx`, `charts/OwnerLoadChart.tsx`, `health-overview/ControlsView.tsx` (Distribution's upper half), `charts/HealthByOwnerStackedBar.tsx`, `charts/CSMPulseBar.tsx`, `charts/AIPulseBar.tsx`, `charts/AccountsByRenewalDateBar.tsx`, tests
- Delete: `charts/AccountsLastTouchLine.tsx` (and its import/usage and any test)

**Interfaces / predicates** (over `renewalRows(rows).rows` for Renewals, `rows` for Distribution):
- Renewals KPIs: **Up for renewal** `0 <= days <= 90`; **Forecast at risk** same set with `arr !== null` (detail `"<risk>% risk"`); **No recent contact** `0 <= days <= 90 && coverage === 'cold'`; **Past due** `days < 0` (detail `"<n> days overdue"`).
- RenewalQuarterChart bars: `days >= 0`, renewal date in that quarter, `healthStatus === status`.
- RenewalCoverageChart bars: `windowKey === band.key && coverage === series`.
- OwnerLoadChart items: `0 <= days <= 180 && row.ownerKey === entry.ownerKey` — switch the grouping key from owner **name** to `ownerKey` (two owners with the same name must not merge), keeping the displayed name.
- HealthByOwnerStackedBar: `ownerKey` × `healthStatus` (same name→key fix in `controls.ts` `healthByOwner`).
- CSM / AI pulse bars: `csmPulseScore` (or `aiPulseScore`) `=== n && healthStatus === s`.
- AccountsByRenewalDateBar: renewal month × `healthStatus`.
- `CurrentHealthDonut` keeps its existing page-level filter behaviour (not a drill). `AccountHealthByRecruiters` sums seats (not accounts) and stays non-drillable.

- [ ] **Step 1: Write the failing tests** — for each KPI one click test asserting the listed names; for each chart a `DrillTargets` test (keyboard path) asserting the right accounts; for `healthByOwner`/OwnerLoad a test with two owners sharing a name that asserts they stay separate; a test that Distribution no longer renders "Accounts by Last Touch".
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — recharts: `<Bar dataKey=… onClick={(entry) => open(requestFor(entry.payload, status))} cursor="pointer" />` (read `entry.payload` for the bucket; check recharts 3's `onClick` signature in one chart first and use it consistently), plus `<DrillTargets label="<chart title>" items={…} />` before each chart built from the same data.
- [ ] **Step 4: Run** health-overview + health tests → PASS.
- [ ] **Step 5: Commit** — `feat(dashboard): drill into Renewals and Distribution; drop the invented last-touch curve`

---

### Task 7: Health › Usage

**Files:**
- Modify: `usage-overview/ControlsView.tsx`, `usage-overview/charts/UtilisationBandChart.tsx`, `usage-overview/UsageOverview.test.tsx`; add `fromUsageRows` to `drill/rows.ts`

**Interfaces / predicates** (over `stats.scatter`, every measured account):
- `fromUsageRows(rows: UsageAccount[], detail?)` → `{ id: String(r.id), name: r.name, owner: r.owner, arr: r.arr, detail }`.
- **Seat utilisation** → all scatter rows (detail `"<utilisation>% used"`); **Shelfware** → `shelfware_arr > 0` (detail `"<idle_seats> idle seats"`); **At capacity** → `utilisation >= 90`; **No seat data** is not drillable (count only).
- UtilisationBandChart cells → `band === key`, via `<Cell onClick>` + `DrillTargets`.

- [ ] **Step 1–5:** tests per KPI and band (keyboard path via `DrillTargets`), implement, run `npx vitest run src/pages/dashboard/tabs/usage-overview src/pages/dashboard/drill`, commit `feat(dashboard): drill into seat usage`.

---

### Task 8: Revenue › Forecast and Customers (server)

**Files:**
- Modify: `forecast/ControlsView.tsx`, `forecast/charts/ArrBridgeChart.tsx`, `customer-overview/ControlsView.tsx`, tests

**Interfaces:**
- The view's current API query string is already in its outlet context (`useOutletContext<{ query: string }>()`); pass it as `source.query`.
- Forecast: **At risk** KPI → server `/customers/forecast/` segment `at_risk`; ArrBridge **Churn**, **Contraction**, **Expansion** cells → `churn`, `contraction`, `expansion` (Opening and Forecast cells stay non-drillable) via `<Cell onClick>` + `DrillTargets`.
- Customers: **Churned in 12 months** → server `/customers/overview/` segment `churned_12m`; **Top 3 concentration** → rows `concentration.rows.slice(0, 3)` (complete: it is exactly the three the number sums), `kind: 'rows'`.

- [ ] **Step 1–5:** tests assert the request each click makes (stub fetch; assert the drill URL `…/customers/forecast/?horizon_days=365&drill=churn` etc. and the listed rows from a stubbed response), implement, run the two tab test folders, commit `feat(dashboard): drill into the forecast and churn`.

---

### Task 9: Health › Activity (server)

**Files:** `activity/ControlsView.tsx`, `activity/Activity.test.tsx`

- **Gone quiet** KPI → server `/customers/activity/` segment `gone_quiet` with the view's query (window included). Touches logged, Coverage and Overdue tasks stay non-drillable.
- [ ] **Step 1–5:** test the request and the rendered "never contacted" / "<n> days since contact" details from a stubbed response; implement; run; commit `feat(dashboard): drill into accounts gone quiet`.

---

### Task 10: Support › Tickets and Topics (server)

**Files:** `ticket-overview/charts/KPIGrid.tsx`, `PriorityDonut.tsx`, `StatusDonut.tsx`, `OriginBar.tsx`, `AssigneesStackedBar.tsx`, `ticket-overview/ControlsView.tsx`; `ai-trending/charts/ActivityTypeDonut.tsx`, `ActivitySentimentDonut.tsx`, `ActivitiesByAIAreaDonut.tsx`, `ActivitiesByAICategoryBar.tsx`, `ActivitiesByAISubCategoryBar.tsx`, `ai-trending/ControlsView.tsx`; tests

**Interfaces:**
- Tickets (`/tickets/stats/`): KPIs **Total** → `all`, **On hold** → `on_hold`, **Positive** → `sentiment:positive`, **Negative** → `sentiment:negative` (resolution rate and average lifetime stay plain). Priority slices → `priority:<value>` and Status slices → `status:<value>`: the stats rows carry display labels only, so map label → value with the `Ticket.Priority` / `Ticket.Status` value lists (add a `PRIORITY_VALUES` / `STATUS_VALUES` map in `ticket-overview/chartTheme.ts` keyed by label: `Low→low`, `Medium→medium`, `High→high`, `Critical→critical`, `Open→open`, `In Progress→in-progress`, `On Hold→on-hold`, `Resolved→resolved`, `Closed→closed`; confirm against the backend model). Origin bars → `origin:<connector_id>` or `origin:none` when `connector_id` is null. Assignee bars (whole bar) → `assignee:<name>`.
- Topics (`/interactions/stats/`): Activity-type slices → `type:<key>`; sentiment slices → `sentiment:<key>`; area → `area:<key>`; category → `category:<key>`; subcategory → `subcategory:<key>` (rows carry `key`).
- Each chart gets `onClick` on its `Pie`/`Cell`/`Bar` plus a `DrillTargets` list.

- [ ] **Step 1–5:** tests assert the drill URL for one KPI and one segment of each chart, and that the stubbed companies render; implement; run the two tab folders; commit `feat(dashboard): drill into tickets and topics`.

---

### Task 11: Docs and verification

- [ ] **Step 1:** Update `docs/04-app-flow.md` (drill panel, what is drillable, "Open as a list") and `docs/03-ui-ux-design.md` (the panel, `Kpi` as a button, `DrillTargets`), and `.agents/workflows/repo-architecture.md` (the `drill/` folder).
- [ ] **Step 2:** Full checks: `npm run lint` (0 errors), `npx tsc -b --noEmit`, `npx vitest run`, `npm run build`.
- [ ] **Step 3:** In the running app (backend on the drill branch): open one drill per area by mouse and by keyboard; check focus return, Escape, "Open as a list", a truncated list if the data allows, and the sheet below 1024px.
- [ ] **Step 4:** Commit fixes; hand off to `finishing-a-development-branch` (PR opens after #73 merges and the backend PR merges).
