# Dashboard frame and restructure (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight-tab "Advance Dashboards" with Overview + Revenue / Health / Support areas, one URL-backed filter bar, shared KPI/panel/state components and token-only chart colours, with `/health` folded in as Health › Distribution.

**Architecture:** Restructure in place. The eight existing tab containers keep their data logic, selectors and charts; their hand-rolled filter bars are replaced by one `DashboardToolbar` that reads and writes the URL, and they are re-mounted under three area routes. Old URLs redirect. Overview is a placeholder in this PR (PR 3 builds it); drill-down is PR 2.

**Tech Stack:** React 19, TypeScript, react-router 7, Redux Toolkit, Tailwind v4 tokens (`src/index.css`), recharts, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-dashboard-redesign-design.md` (sections 1 and 3, minus drill-down).

## Global Constraints

- Tokens only: zero raw hex/rgb/named colours in any `.tsx` or `chartTheme.ts` touched (house rule 1, `.claude/skills/revenact-design`).
- One monochrome primary; danger only for loss, success only for gain; never colour-only meaning.
- Numbers in DM Mono with `tabular-nums` (`font-mono-brand tabular-nums`).
- At most four type sizes per surface: 11px (labels/meta), 13px (body), 15px (panel titles), 22px (KPI figures).
- `rounded-xl` panels, `border-line`, no card-in-card, no coloured left borders.
- Shared URL filter keys are exactly `owner` (user id or `unassigned`), `lifecycle` (a `Customer.LifecycleStage` value), `customer` (customer id). Backend already accepts these on every stats endpoint.
- Every UI change ships with tests (`.claude/skills/testing`); `npm run lint`, `npm run build`, `npx vitest run` pass.
- Commit format per `commit-messages` skill: `type(scope): subject`, body wrapped at 72, ending `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Brain Overview's metric layer is month-end, organisation-wide (SystemActor) and is not the same figure as the viewer-scoped dashboard; this PR links its groups to the dashboard rather than replacing its values (refinement of the spec, noted in the PR).

## File Structure

New, under `src/pages/dashboard/shared/`:

| File | Responsibility |
|---|---|
| `useDashboardFilters.ts` | Read/write dashboard filters in the URL query string |
| `Panel.tsx` | The one container style |
| `Kpi.tsx` | `Kpi` and `KpiStrip` |
| `DataState.tsx` | Loading / error / empty / truncated states |
| `DashboardToolbar.tsx` | Sub-view switch + filter chips + clear |
| `chartPalette.ts` | Colour roles and axis helpers shared by all charts |
| `*.test.tsx` next to each | Unit tests |

New, under `src/pages/dashboard/`:

| File | Responsibility |
|---|---|
| `areas.ts` | The three areas, their sub-views and the legacy-path map |
| `AreaLayout.tsx` | Renders an area's sub-view outlet and hands the sub-view list down |
| `Overview.tsx` | Placeholder landing (PR 3 replaces the body) |
| `routes.test.tsx` | Every legacy URL lands on its new home |

Modified: `src/App.tsx` (routes), `components/layout/Navbar.tsx` (area tabs), `components/layout/Sidebar.tsx` (Health leaves Setup), the eight containers, the six `ControlsView`s with a local `Tile`, `health-overview/RenewalView.tsx`, three `chartTheme.ts`, `pages/health/HealthPage.tsx` (body extracted), `components/brain/MetricLayerPanel.tsx` (links), `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`.

Deleted: `src/pages/dashboard/AdvanceDashboard.tsx`, `health-overview/HealthDataState.tsx` (re-exported from shared first, then removed once no imports remain).

---

### Task 1: URL-backed filters

**Files:**
- Create: `src/pages/dashboard/shared/useDashboardFilters.ts`
- Test: `src/pages/dashboard/shared/useDashboardFilters.test.tsx`

**Interfaces:**
- Produces:
  - `useDashboardFilters(keys: readonly string[], defaults?: Record<string,string>): { values: Record<string,string>; set(key: string, value: string): void; clear(keys: readonly string[]): void; activeCount(keys: readonly string[]): number }`
  - `toQuery(values: Record<string,string>, rename?: Record<string,string>): string` — builds the API query string, skipping empty values; `rename` maps a URL key to the API key (e.g. `{ customer: 'account' }`).
  - `SHARED_KEYS = ['owner', 'lifecycle', 'customer'] as const`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/dashboard/shared/useDashboardFilters.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useDashboardFilters, toQuery, SHARED_KEYS } from './useDashboardFilters';

function Probe() {
  const { values, set, clear, activeCount } = useDashboardFilters([...SHARED_KEYS, 'days'], { days: '90' });
  const location = useLocation();
  return (
    <div>
      <span data-testid="values">{JSON.stringify(values)}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="active">{activeCount(SHARED_KEYS)}</span>
      <button onClick={() => set('owner', '7')}>owner</button>
      <button onClick={() => set('owner', '')}>unset</button>
      <button onClick={() => clear(SHARED_KEYS)}>clear</button>
    </div>
  );
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );

describe('useDashboardFilters', () => {
  it('reads values from the URL and fills defaults for missing keys', () => {
    renderAt('/x?lifecycle=customer_active');
    expect(JSON.parse(screen.getByTestId('values').textContent!)).toEqual({
      owner: '',
      lifecycle: 'customer_active',
      customer: '',
      days: '90',
    });
  });

  it('writes a value into the URL and removes it when emptied', async () => {
    renderAt('/x?lifecycle=customer_active');
    await userEvent.click(screen.getByText('owner'));
    expect(screen.getByTestId('search').textContent).toContain('owner=7');
    await userEvent.click(screen.getByText('unset'));
    expect(screen.getByTestId('search').textContent).not.toContain('owner=');
    expect(screen.getByTestId('search').textContent).toContain('lifecycle=customer_active');
  });

  it('clears only the named keys and counts active ones', async () => {
    renderAt('/x?owner=7&lifecycle=customer_active&days=30');
    expect(screen.getByTestId('active').textContent).toBe('2');
    await userEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('search').textContent).toBe('?days=30');
  });
});

describe('toQuery', () => {
  it('skips empty values and renames keys', () => {
    expect(toQuery({ owner: '7', lifecycle: '', customer: '3' }, { customer: 'account' })).toBe(
      'owner=7&account=3',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/dashboard/shared/useDashboardFilters.test.tsx`
Expected: FAIL, cannot resolve `./useDashboardFilters`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/pages/dashboard/shared/useDashboardFilters.ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Dashboard filters live in the URL, not in component state.
 *
 * Each tab used to hold its own `useState` filters, so switching tabs reset
 * them and a filtered view could not be linked. The URL survives both. The
 * three shared keys are the ones every stats endpoint already reads.
 */
export const SHARED_KEYS = ['owner', 'lifecycle', 'customer'] as const;

export function useDashboardFilters(keys: readonly string[], defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of keys) out[key] = params.get(key) ?? defaults[key] ?? '';
    return out;
    // keys/defaults are module constants at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(
    (key: string, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(
    (toClear: readonly string[]) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of toClear) next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const activeCount = useCallback(
    (of: readonly string[]) => of.filter((key) => Boolean(params.get(key))).length,
    [params],
  );

  return { values, set, clear, activeCount };
}

/** The API query string for a set of filter values. Empty values are left
 *  out so "All" is the absence of a filter, which is what the backend reads. */
export function toQuery(values: Record<string, string>, rename: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(rename[key] ?? key, value);
  }
  return params.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/dashboard/shared/useDashboardFilters.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/shared/useDashboardFilters.ts src/pages/dashboard/shared/useDashboardFilters.test.tsx
git commit -m "feat(dashboard): keep dashboard filters in the URL"
```

---

### Task 2: Panel, Kpi and DataState

**Files:**
- Create: `src/pages/dashboard/shared/Panel.tsx`, `Kpi.tsx`, `DataState.tsx`
- Test: `src/pages/dashboard/shared/Kpi.test.tsx`, `DataState.test.tsx`
- Modify: `src/pages/dashboard/tabs/health-overview/HealthDataState.tsx` (becomes re-exports)

**Interfaces:**
- Produces:
  - `Panel({ title?: string; action?: ReactNode; className?: string; children }): JSX.Element`
  - `Kpi({ label: string; value: string; detail?: string; tone?: 'neutral' | 'loss' | 'gain' }): JSX.Element`
  - `KpiStrip({ children }): JSX.Element` — 2 columns under `md`, 4 from `md`, hairline dividers
  - `Loading({ label?: string })`, `ErrorState({ message: string; detail?: string })`, `Empty({ label: string })`, `TruncatedNotice({ children })`
  - `HealthLoading`, `HealthError`, `HealthEmpty`, `HealthTruncatedNotice` keep their names and wording (re-exported from `HealthDataState.tsx` so Health's tests are untouched)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/pages/dashboard/shared/Kpi.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kpi, KpiStrip } from './Kpi';

describe('Kpi', () => {
  it('renders label, figure in the mono face, and detail', () => {
    render(<Kpi label="ARR today" value="$688.6K" detail="9 accounts" />);
    expect(screen.getByText('ARR today')).toBeInTheDocument();
    const figure = screen.getByText('$688.6K');
    expect(figure.className).toContain('font-mono-brand');
    expect(figure.className).toContain('tabular-nums');
    expect(screen.getByText('9 accounts')).toBeInTheDocument();
  });

  it('colours only the figure, and only for loss or gain', () => {
    render(<Kpi label="At risk" value="$114.5K" tone="loss" />);
    expect(screen.getByText('$114.5K').className).toContain('text-danger');
    render(<Kpi label="Expansion" value="$31K" tone="gain" />);
    expect(screen.getByText('$31K').className).toContain('text-success');
  });

  it('has no coloured left border', () => {
    const { container } = render(<Kpi label="x" value="1" tone="loss" />);
    expect(container.innerHTML).not.toMatch(/border-l-(danger|success|info)/);
  });

  it('KpiStrip lays out children in a list', () => {
    render(
      <KpiStrip>
        <Kpi label="a" value="1" />
        <Kpi label="b" value="2" />
      </KpiStrip>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
```

```tsx
// src/pages/dashboard/shared/DataState.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading, ErrorState, Empty } from './DataState';

describe('DataState', () => {
  it('loading is announced politely', () => {
    render(<Loading label="Loading forecast…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading forecast…');
  });
  it('error is an alert and says nothing partial is shown', () => {
    render(<ErrorState message="Could not load the forecast." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the forecast.');
  });
  it('empty says what is empty', () => {
    render(<Empty label="No tickets in this window." />);
    expect(screen.getByText('No tickets in this window.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/dashboard/shared/Kpi.test.tsx src/pages/dashboard/shared/DataState.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```tsx
// src/pages/dashboard/shared/Panel.tsx
import type { ReactNode } from 'react';

/** The one container on the dashboard. Never nest one inside another: group
 *  inside a panel with `divide-y` or whitespace instead. */
export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`bg-surface border border-line rounded-xl p-4 ${className}`}>
      {(title || action) && (
        <header className="flex items-baseline justify-between gap-3 mb-3">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
```

```tsx
// src/pages/dashboard/shared/Kpi.tsx
import type { ReactNode } from 'react';

const FIGURE_TONE = {
  neutral: 'text-ink',
  loss: 'text-danger',
  gain: 'text-success',
} as const;

/** One headline number. Colour is reserved for a figure that *means* loss or
 *  gain; everything else is ink. Replaces the six local `Tile`s, which tinted
 *  a left border by tone and so coloured numbers that meant nothing. */
export function Kpi({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: keyof typeof FIGURE_TONE;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`font-mono-brand tabular-nums text-[22px] leading-tight mt-1 ${FIGURE_TONE[tone]}`}>
        {value}
      </div>
      {detail && <div className="text-[11px] text-ink-muted mt-0.5">{detail}</div>}
    </div>
  );
}

/** Four across from `md`, two below, separated by hairlines rather than boxes. */
export function KpiStrip({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <ul className="grid grid-cols-2 md:grid-cols-4 gap-y-4 bg-surface border border-line rounded-xl p-4 md:divide-x md:divide-line">
      {items.map((child, i) => (
        <li key={i} className="md:px-4 md:first:pl-0">
          {child}
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// src/pages/dashboard/shared/DataState.tsx
import type { ReactNode } from 'react';

/** Loading, error, empty and truncated, worded once for every dashboard view.
 *  Generalised from Health's own set so eight views stop describing the same
 *  outage eight ways. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="px-2 py-10 text-center text-[13px] text-ink-muted">
      {label}
    </p>
  );
}

export function ErrorState({
  message,
  detail = 'Nothing is shown rather than a partial picture.',
}: {
  message: string;
  detail?: string;
}) {
  return (
    <div role="alert" className="px-2 py-10 text-center">
      <p className="text-[13px] font-semibold text-danger">{message}</p>
      <p className="text-[11px] text-ink-muted mt-1">{detail}</p>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <p className="px-2 py-10 text-center text-[13px] text-ink-muted">{label}</p>;
}

export function TruncatedNotice({ children }: { children: ReactNode }) {
  return <p className="px-2 text-[11px] text-warning font-semibold">{children}</p>;
}
```

Replace the body of `src/pages/dashboard/tabs/health-overview/HealthDataState.tsx` with wrappers that keep Health's exact wording:

```tsx
import { Loading, ErrorState, Empty, TruncatedNotice } from '../../shared/DataState';

/** Health's wording on the shared states; kept so its tests and copy are unchanged. */
export const HealthLoading = () => <Loading label="Loading account health…" />;
export const HealthError = ({ message }: { message: string }) => (
  <ErrorState
    message={message}
    detail="Nothing is shown rather than a partial picture — every tab here counts the whole book."
  />
);
export const HealthEmpty = () => <Empty label="No accounts to show yet." />;
export const HealthTruncatedNotice = () => (
  <TruncatedNotice>
    Showing the first accounts only — this book is larger than this screen loads in one
    request, so the figures below cover part of it.
  </TruncatedNotice>
);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/dashboard/shared src/pages/dashboard/tabs/health-overview`
Expected: PASS (new tests plus every existing Health test).

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/shared src/pages/dashboard/tabs/health-overview/HealthDataState.tsx
git commit -m "feat(dashboard): one panel, KPI and data-state set for every view"
```

---

### Task 3: DashboardToolbar

**Files:**
- Create: `src/pages/dashboard/shared/DashboardToolbar.tsx`
- Test: `src/pages/dashboard/shared/DashboardToolbar.test.tsx`

**Interfaces:**
- Consumes: `useDashboardFilters`, `SHARED_KEYS` (Task 1); `FilterSelect`, `FilterOption`, `FilterGroup` from `components/shared/FilterSelect`.
- Produces:
  - `type ToolbarFilter = { key: string; label: string; options: (FilterOption | FilterGroup)[]; clearable?: boolean }` (`clearable` defaults true; a period control sets it false so Clear leaves it alone)
  - `DashboardToolbar({ subViews: { label: string; path: string }[]; filters: ToolbarFilter[]; defaults?: Record<string,string>; count?: string }): JSX.Element` — `count` is the "9 of 12 accounts" text shown while any clearable filter is active.
  - The sub-view links keep the current query string, so filters survive switching.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/dashboard/shared/DashboardToolbar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DashboardToolbar } from './DashboardToolbar';

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

const filters = [
  { key: 'days', label: 'Window', clearable: false, options: [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }] },
  { key: 'owner', label: 'Primary Owner', options: [{ value: '', label: 'All' }, { value: '7', label: 'Carl CSM' }] },
];

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/dashboard/health/:view"
          element={
            <>
              <DashboardToolbar
                subViews={[{ label: 'Usage', path: 'usage' }, { label: 'Activity', path: 'activity' }]}
                filters={filters}
                defaults={{ days: '90' }}
                count="3 of 9 accounts"
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardToolbar', () => {
  it('marks the current sub-view and keeps filters when switching', async () => {
    renderAt('/dashboard/health/usage?owner=7');
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('link', { name: 'Activity' }));
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/health/activity?owner=7');
  });

  it('writes a picked filter to the URL', async () => {
    renderAt('/dashboard/health/usage');
    await userEvent.selectOptions(screen.getByLabelText('Primary Owner'), '7');
    expect(screen.getByTestId('where').textContent).toContain('owner=7');
  });

  it('shows the count and a Clear that leaves the period alone', async () => {
    renderAt('/dashboard/health/usage?owner=7&days=30');
    expect(screen.getByText('3 of 9 accounts')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear 1' }));
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/health/usage?days=30');
  });

  it('hides the count and Clear with no active filter', () => {
    renderAt('/dashboard/health/usage?days=30');
    expect(screen.queryByText('3 of 9 accounts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear/ })).not.toBeInTheDocument();
  });
});
```

Note: `getByLabelText('Primary Owner')` relies on `FilterSelect`'s `<label>` wrapping an sr-only span and the `<select>`; if the existing test for `FilterSelect` queries differently, follow that file's query.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/dashboard/shared/DashboardToolbar.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// src/pages/dashboard/shared/DashboardToolbar.tsx
import { NavLink, useLocation } from 'react-router-dom';
import { FilterSelect } from '../../../components/shared/FilterSelect';
import type { FilterGroup, FilterOption } from '../../../components/shared/FilterSelect';
import { useDashboardFilters } from './useDashboardFilters';

export interface ToolbarFilter {
  key: string;
  label: string;
  options: (FilterOption | FilterGroup)[];
  /** False for a period control: it is the question being asked, not a
   *  narrowing of the book, so Clear leaves it alone. */
  clearable?: boolean;
}

function labelFor(options: (FilterOption | FilterGroup)[], value: string): string {
  for (const entry of options) {
    const list = 'options' in entry ? entry.options : [entry];
    const hit = list.find((option) => option.value === value);
    if (hit) return hit.label;
  }
  return 'All';
}

/**
 * The single row under the area tabs: sub-view switch on the left, filters on
 * the right. Replaces the eight copies of this bar that lived in each tab.
 */
export function DashboardToolbar({
  subViews,
  filters,
  defaults = {},
  count,
}: {
  subViews: { label: string; path: string }[];
  filters: ToolbarFilter[];
  defaults?: Record<string, string>;
  count?: string;
}) {
  const { search } = useLocation();
  const keys = filters.map((filter) => filter.key);
  const clearable = filters.filter((filter) => filter.clearable !== false).map((filter) => filter.key);
  const { values, set, clear, activeCount } = useDashboardFilters(keys, defaults);
  const active = activeCount(clearable);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
      {subViews.length > 1 && (
        <nav aria-label="Views" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {subViews.map((view) => (
            <NavLink
              key={view.path}
              to={{ pathname: `../${view.path}`, search }}
              relative="path"
              className={({ isActive }) =>
                `min-h-8 px-3 inline-flex items-center rounded-md text-[13px] font-semibold transition-colors duration-[var(--dur-fast)] ${
                  isActive ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-subtle'
                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`
              }
            >
              {view.label}
            </NavLink>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-1 ml-auto h-9">
        {filters.map((filter) => (
          <FilterSelect
            key={filter.key}
            label={filter.label}
            value={labelFor(filter.options, values[filter.key])}
            selected={values[filter.key]}
            onChange={(value) => set(filter.key, value)}
            options={filter.options}
          />
        ))}
        {active > 0 && (
          <>
            {count && <span className="ml-2 text-[11px] text-ink-muted whitespace-nowrap">{count}</span>}
            <button
              type="button"
              onClick={() => clear(clearable)}
              className="ml-2 min-h-8 px-2 text-[13px] font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
            >
              Clear {active}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/pages/dashboard/shared/DashboardToolbar.test.tsx`
Expected: PASS (4 tests). If `NavLink` does not set `aria-current="page"` for the relative target, assert `toHaveClass('bg-accent')` instead and keep the rest.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/shared/DashboardToolbar.tsx src/pages/dashboard/shared/DashboardToolbar.test.tsx
git commit -m "feat(dashboard): one toolbar for sub-views and filters"
```

---

### Task 4: Areas, routes, redirects and the Navbar tabs

**Files:**
- Create: `src/pages/dashboard/areas.ts`, `src/pages/dashboard/AreaLayout.tsx`, `src/pages/dashboard/Overview.tsx`, `src/pages/dashboard/routes.test.tsx`
- Modify: `src/App.tsx:214-330` (the whole `dashboard` route block), `src/components/layout/Navbar.tsx:366-385`
- Delete: `src/pages/dashboard/AdvanceDashboard.tsx`

**Interfaces:**
- Produces:
  - `AREAS: { key: 'revenue' | 'health' | 'support'; label: string; views: { label: string; path: string }[] }[]`
  - `LEGACY: Record<string, string>` — old path (after `/dashboard/advance/`) → new absolute path
  - `AreaLayout({ area })` renders `<Outlet context={{ subViews }} />`; containers read `useOutletContext<{ subViews: {label,path}[] }>()`
  - `useSubViews(): { label: string; path: string }[]`

- [ ] **Step 1: Write the failing routing test**

```tsx
// src/pages/dashboard/routes.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { dashboardRoutes } from './routes';

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

// Each view is stubbed: this test is about where URLs land, not what renders.
const stub = () => <Where />;

const cases: [string, string][] = [
  ['/dashboard', '/dashboard/overview'],
  ['/dashboard/advance', '/dashboard/overview'],
  ['/dashboard/advance/health', '/dashboard/health/triage'],
  ['/dashboard/advance/health/triage', '/dashboard/health/triage'],
  ['/dashboard/advance/health/divergence', '/dashboard/health/divergence'],
  ['/dashboard/advance/health/movement', '/dashboard/health/movement'],
  ['/dashboard/advance/health/renewal-date', '/dashboard/health/renewals'],
  ['/dashboard/advance/health/controls', '/dashboard/health/distribution'],
  ['/dashboard/advance/health/primary-owner', '/dashboard/health/triage'],
  ['/dashboard/advance/usage/controls', '/dashboard/health/usage'],
  ['/dashboard/advance/activity/controls', '/dashboard/health/activity'],
  ['/dashboard/advance/revenue/controls', '/dashboard/revenue/forecast'],
  ['/dashboard/advance/customer/controls', '/dashboard/revenue/customers'],
  ['/dashboard/advance/product/controls', '/dashboard/revenue/products'],
  ['/dashboard/advance/ticket/ticket-priority', '/dashboard/support/tickets'],
  ['/dashboard/advance/ai-trending/controls', '/dashboard/support/topics'],
  ['/dashboard/custom', '/dashboard/overview'],
  ['/dashboard/revenue', '/dashboard/revenue/forecast'],
  ['/dashboard/health', '/dashboard/health/triage'],
  ['/dashboard/support', '/dashboard/support/tickets'],
  ['/health', '/dashboard/health/distribution'],
];

describe('dashboard routes', () => {
  it.each(cases)('%s lands on %s', (from, to) => {
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>{dashboardRoutes(stub)}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('keeps the query string through a legacy redirect', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/advance/revenue/controls?owner=7']}>
        <Routes>{dashboardRoutes(stub)}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/revenue/forecast?owner=7');
  });
});
```

`dashboardRoutes(render?)` is a function returning the `<Route>` elements so the test can stub every view; `App.tsx` calls it with no argument to get the real elements.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/dashboard/routes.test.tsx`
Expected: FAIL, `./routes` not found.

- [ ] **Step 3: Implement areas, layout, overview and routes**

```ts
// src/pages/dashboard/areas.ts
export type AreaKey = 'revenue' | 'health' | 'support';

export interface SubView {
  label: string;
  path: string;
}

export const AREAS: { key: AreaKey; label: string; views: SubView[] }[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    views: [
      { label: 'Forecast', path: 'forecast' },
      { label: 'Customers', path: 'customers' },
      { label: 'Products', path: 'products' },
    ],
  },
  {
    key: 'health',
    label: 'Health',
    views: [
      { label: 'Triage', path: 'triage' },
      { label: 'Divergence', path: 'divergence' },
      { label: 'Movement', path: 'movement' },
      { label: 'Renewals', path: 'renewals' },
      { label: 'Usage', path: 'usage' },
      { label: 'Activity', path: 'activity' },
      { label: 'Distribution', path: 'distribution' },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    views: [
      { label: 'Tickets', path: 'tickets' },
      { label: 'Topics', path: 'topics' },
    ],
  },
];

/** Every path the old "Advance Dashboards" served, and where it lives now.
 *  Anything under an old tab that is not listed (the retired filter-chip
 *  paths) falls back to that tab's entry with no suffix. */
export const LEGACY: Record<string, string> = {
  health: '/dashboard/health/triage',
  'health/triage': '/dashboard/health/triage',
  'health/divergence': '/dashboard/health/divergence',
  'health/movement': '/dashboard/health/movement',
  'health/renewal-date': '/dashboard/health/renewals',
  'health/controls': '/dashboard/health/distribution',
  usage: '/dashboard/health/usage',
  activity: '/dashboard/health/activity',
  revenue: '/dashboard/revenue/forecast',
  customer: '/dashboard/revenue/customers',
  product: '/dashboard/revenue/products',
  ticket: '/dashboard/support/tickets',
  'ai-trending': '/dashboard/support/topics',
};
```

```tsx
// src/pages/dashboard/AreaLayout.tsx
import { Outlet, useOutletContext } from 'react-router-dom';
import { AREAS } from './areas';
import type { AreaKey, SubView } from './areas';

/** Hands the area's sub-view list to whichever container is mounted, so each
 *  container's toolbar can render the switch without knowing its area. */
export function AreaLayout({ area }: { area: AreaKey }) {
  const subViews = AREAS.find((a) => a.key === area)!.views;
  return (
    <div className="h-full w-full">
      <Outlet context={{ subViews }} />
    </div>
  );
}

export function useSubViews(): SubView[] {
  return useOutletContext<{ subViews?: SubView[] } | undefined>()?.subViews ?? [];
}
```

```tsx
// src/pages/dashboard/Overview.tsx
import { Link } from 'react-router-dom';
import { AREAS } from './areas';
import { Panel } from './shared/Panel';

/** Placeholder landing until the attention list lands (PR 3). Links each area
 *  so /dashboard is never a dead end in the meantime. */
export function Overview() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {AREAS.map((area) => (
        <Panel key={area.key} title={area.label}>
          <Link to={`/dashboard/${area.key}`} className="text-[13px] font-semibold text-ink hover:underline">
            Open {area.label} →
          </Link>
        </Panel>
      ))}
    </div>
  );
}
```

Create `src/pages/dashboard/routes.tsx`:

```tsx
import type { ReactElement } from 'react';
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';
import { AREAS, LEGACY } from './areas';
import { AreaLayout } from './AreaLayout';
import { Overview } from './Overview';
import { AITrendingTopics } from './tabs/AITrendingTopics';
import { ControlsView as TopicsView } from './tabs/ai-trending/ControlsView';
import { HealthOverviewContainer } from './tabs/HealthOverviewContainer';
import { TriageView } from './tabs/health-overview/TriageView';
import { DivergenceView } from './tabs/health-overview/DivergenceView';
import { MovementView } from './tabs/health-overview/MovementView';
import { RenewalView } from './tabs/health-overview/RenewalView';
import { DistributionView } from './tabs/health-overview/DistributionView';
import { CustomerOverviewContainer } from './tabs/CustomerOverviewContainer';
import { ControlsView as CustomersView } from './tabs/customer-overview/ControlsView';
import { ActivityContainer } from './tabs/ActivityContainer';
import { ControlsView as ActivityView } from './tabs/activity/ControlsView';
import { ForecastContainer } from './tabs/ForecastContainer';
import { ControlsView as ForecastView } from './tabs/forecast/ControlsView';
import { UsageOverviewContainer } from './tabs/UsageOverviewContainer';
import { ControlsView as UsageView } from './tabs/usage-overview/ControlsView';
import { ProductUsageContainer } from './tabs/ProductUsageContainer';
import { ControlsView as ProductsView } from './tabs/product-usage/ControlsView';
import { TicketOverviewContainer } from './tabs/ticket-overview/TicketOverviewContainer';
import { ControlsView as TicketsView } from './tabs/ticket-overview/ControlsView';

/** Redirect preserving the query string, so a filtered old link stays filtered. */
function Keep({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

function LegacyRedirect() {
  const { '*': rest = '' } = useParams();
  const [tab, sub] = rest.split('/');
  const target = LEGACY[`${tab}/${sub}`] ?? LEGACY[tab] ?? '/dashboard/overview';
  return <Keep to={target} />;
}

const first = (key: string) => `/dashboard/${key}/${AREAS.find((a) => a.key === key)!.views[0].path}`;

/**
 * The dashboard's route tree. A function so tests can pass `stub` to replace
 * every view with a probe and assert on where each URL lands.
 */
export function dashboardRoutes(stub?: () => ReactElement) {
  const el = (real: ReactElement) => (stub ? stub() : real);
  const shell = (real: ReactElement) => (stub ? undefined : real);
  return (
    <>
      <Route path="dashboard">
        <Route index element={<Keep to="/dashboard/overview" />} />
        <Route path="overview" element={el(<Overview />)} />
        <Route path="advance" element={<Keep to="/dashboard/overview" />} />
        <Route path="advance/*" element={<LegacyRedirect />} />
        <Route path="custom" element={<Keep to="/dashboard/overview" />} />

        <Route path="revenue" element={<AreaLayout area="revenue" />}>
          <Route index element={<Keep to={first('revenue')} />} />
          <Route element={shell(<ForecastContainer />)}>
            <Route path="forecast" element={el(<ForecastView />)} />
          </Route>
          <Route element={shell(<CustomerOverviewContainer />)}>
            <Route path="customers" element={el(<CustomersView />)} />
          </Route>
          <Route element={shell(<ProductUsageContainer />)}>
            <Route path="products" element={el(<ProductsView />)} />
          </Route>
          <Route path="*" element={<Keep to={first('revenue')} />} />
        </Route>

        <Route path="health" element={<AreaLayout area="health" />}>
          <Route index element={<Keep to={first('health')} />} />
          <Route element={shell(<HealthOverviewContainer />)}>
            <Route path="triage" element={el(<TriageView />)} />
            <Route path="divergence" element={el(<DivergenceView />)} />
            <Route path="movement" element={el(<MovementView />)} />
            <Route path="renewals" element={el(<RenewalView />)} />
            <Route path="distribution" element={el(<DistributionView />)} />
          </Route>
          <Route element={shell(<UsageOverviewContainer />)}>
            <Route path="usage" element={el(<UsageView />)} />
          </Route>
          <Route element={shell(<ActivityContainer />)}>
            <Route path="activity" element={el(<ActivityView />)} />
          </Route>
          <Route path="*" element={<Keep to={first('health')} />} />
        </Route>

        <Route path="support" element={<AreaLayout area="support" />}>
          <Route index element={<Keep to={first('support')} />} />
          <Route element={shell(<TicketOverviewContainer />)}>
            <Route path="tickets" element={el(<TicketsView />)} />
          </Route>
          <Route element={shell(<AITrendingTopics />)}>
            <Route path="topics" element={el(<TopicsView />)} />
          </Route>
          <Route path="*" element={<Keep to={first('support')} />} />
        </Route>
      </Route>
      <Route path="health" element={<Keep to="/dashboard/health/distribution" />} />
    </>
  );
}
```

`DistributionView` is created in Task 7. Until then, create it as a stub so this task compiles:

```tsx
// src/pages/dashboard/tabs/health-overview/DistributionView.tsx
export function DistributionView() {
  return null;
}
```

A layout route with `element={undefined}` renders its children directly, which is what the stub test needs (containers need a store). If react-router rejects `element={undefined}`, pass `shell = (real) => (stub ? <Outlet /> : real)` instead.

In `src/App.tsx`: delete the entire `<Route path="dashboard"> … </Route>` block (lines 214-330) and the existing `<Route path="health" element={<HealthPage />} />` route; add `{dashboardRoutes()}` in their place inside the tenant shell; remove the now-unused imports (`AdvanceDashboard`, the per-tab containers/views, `HealthPage`) and import `dashboardRoutes` from `./pages/dashboard/routes`. Delete `src/pages/dashboard/AdvanceDashboard.tsx`.

In `src/components/layout/Navbar.tsx`, replace the two pill `NavLink`s in the `isDashboard` branch with the four area tabs (import `AREAS` from `../../pages/dashboard/areas`):

```tsx
<nav aria-label="Dashboard areas" className="flex items-center gap-4 h-full">
  {[{ key: 'overview', label: 'Overview' }, ...AREAS].map((area) => (
    <NavLink
      key={area.key}
      to={`/dashboard/${area.key}`}
      className={({ isActive }) =>
        `h-full inline-flex items-center text-[13px] font-semibold border-b-2 transition-colors duration-[var(--dur-fast)] ${
          isActive ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
        }`
      }
    >
      {area.label}
    </NavLink>
  ))}
</nav>
```

Keep the `<h1>Dashboard</h1>` before it.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/pages/dashboard/routes.test.tsx && npx tsc -b --noEmit`
Expected: routes test PASS (22 cases); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/App.tsx src/pages/dashboard src/components/layout/Navbar.tsx
git commit -m "feat(dashboard): Overview plus Revenue, Health and Support areas

Old /dashboard/advance links and /health redirect to their new homes,
keeping any query string."
```

---

### Task 5: Server-filtered containers on the shared toolbar

Five containers read their data from the backend with the shared keys: Forecast, Customer Overview, Product Usage, Usage Overview, Activity. Each keeps its slice and its `ControlsView`; only the bar changes.

**Files:**
- Modify: `src/pages/dashboard/tabs/ForecastContainer.tsx`, `CustomerOverviewContainer.tsx`, `ProductUsageContainer.tsx`, `UsageOverviewContainer.tsx`, `ActivityContainer.tsx`
- Create: `src/pages/dashboard/shared/bookFilters.ts`
- Test: update `forecast/Forecast.test.tsx`, `customer-overview/CustomerOverview.test.tsx`, `product-usage/ProductUsage.test.tsx`, `usage-overview/UsageOverview.test.tsx`, `activity/Activity.test.tsx`

**Interfaces:**
- Consumes: `DashboardToolbar`, `ToolbarFilter` (Task 3); `useDashboardFilters`, `toQuery`, `SHARED_KEYS` (Task 1); `useSubViews` (Task 4).
- Produces: `bookFilters(options?: { owners?: Opt[]; lifecycles?: Opt[]; customers?: Opt[] }): ToolbarFilter[]` where `Opt = { value: string; name: string }` — the Owner / Lifecycle / Account trio every server-filtered view shows. Each container keeps passing `{ query }` down as its `ControlsView` already expects.

- [ ] **Step 1: Update the Activity test to drive filters through the URL**

In `activity/Activity.test.tsx`, change the render helper so the tree matches production routing and starts at a URL:

```tsx
function renderActivity(url = '/dashboard/health/activity') {
  const store = configureStore({ reducer: { activity: activityReducer } });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/dashboard/health" element={<AreaLayout area="health" />}>
            <Route element={<ActivityContainer />}>
              <Route path="activity" element={<ControlsView />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}
```

Add a test that the URL filter reaches the request:

```tsx
it('sends the URL filters and the window to the API', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
  vi.stubGlobal('fetch', fetchMock);
  renderActivity('/dashboard/health/activity?owner=7&days=30');
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toContain('owner=7');
  expect(url).toContain('days=30');
});
```

Replace any existing test that clicked a filter and asserted local state with the equivalent URL assertion (`toContain('owner=')` on the fetch URL after `userEvent.selectOptions`). Keep every assertion about what the view renders.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/dashboard/tabs/activity`
Expected: FAIL (the container still uses local state, so the URL filter never reaches fetch).

- [ ] **Step 3: Implement `bookFilters` and rewrite `ActivityContainer`**

```ts
// src/pages/dashboard/shared/bookFilters.ts
import type { ToolbarFilter } from './DashboardToolbar';

type Opt = { value: string; name: string };

const choices = (list: Opt[] | undefined) => [
  { value: '', label: 'All' },
  ...(list ?? []).map((option) => ({ value: option.value, label: option.name })),
];

/** Owner, Lifecycle and Account: the three filters every book-level view
 *  offers, with options from that view's own response. */
export function bookFilters(options?: { owners?: Opt[]; lifecycles?: Opt[]; customers?: Opt[] }): ToolbarFilter[] {
  return [
    { key: 'owner', label: 'Primary Owner', options: choices(options?.owners) },
    { key: 'lifecycle', label: 'Lifecycle Stage', options: choices(options?.lifecycles) },
    { key: 'customer', label: 'Account', options: choices(options?.customers) },
  ];
}
```

```tsx
// src/pages/dashboard/tabs/ActivityContainer.tsx
import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { SHARED_KEYS, toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../AreaLayout';
import type { ActivityContext } from './activity/ControlsView';

/** Windows the screen offers. A month is the cadence a CSM is held to, a
 *  quarter is what a review looks back over, and a year is for judging whether
 *  a book has ever really been worked. */
const WINDOWS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
];
const DEFAULTS = { days: '90' };
const KEYS = [...SHARED_KEYS, 'days'];

/** Health › Activity. The window is always sent; the book filters narrow it. */
export function ActivityContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.activity.stats?.filters);
  const accounts = useAppSelector((state) => state.activity.stats?.kpis.accounts ?? 0);
  const { values } = useDashboardFilters(KEYS, DEFAULTS);
  const context: ActivityContext = { query: toQuery(values) };

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        defaults={DEFAULTS}
        count={`${accounts} ${accounts === 1 ? 'account' : 'accounts'}`}
        filters={[
          { key: 'days', label: 'Window', clearable: false, options: WINDOWS },
          ...bookFilters(options),
        ]}
      />
      <div className="flex-1 w-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run Activity tests**

Run: `npx vitest run src/pages/dashboard/tabs/activity`
Expected: PASS.

- [ ] **Step 5: Apply the same shape to the other four, one at a time, running each test file after its change**

`ForecastContainer.tsx`: keep `HORIZONS` exactly as it is; `DEFAULTS = { horizon_days: '365' }` (today's default, "Next 12 months"); `KEYS = [...SHARED_KEYS, 'horizon_days']`; filters `[{ key: 'horizon_days', label: 'Horizon', clearable: false, options: HORIZONS }, ...bookFilters(options)]`; count from `state.forecast.stats` the same way the current file derives it; context `{ query: toQuery(values) }`.

`CustomerOverviewContainer.tsx`: `KEYS = SHARED_KEYS`, no defaults, filters `bookFilters(options)` from `state.portfolio.stats?.filters`.

`UsageOverviewContainer.tsx`: `KEYS = SHARED_KEYS`, filters `bookFilters(options)` from `state.usage.stats?.filters`.

`ProductUsageContainer.tsx`: `KEYS = ['product', 'owner', 'lifecycle']`; filters `[{ key: 'product', label: 'Product', options: [{ value: '', label: 'All' }, ...(options?.products ?? []).map((o) => ({ value: o.value, label: o.name }))] }, ...bookFilters(options).slice(0, 2)]` (Products has no Account filter today; keep it that way).

For each, write the full file in the Activity pattern above (imports, constants, `useSubViews`, `useDashboardFilters`, `DashboardToolbar`, `<Outlet context>`), update its test's render helper to the routed form with the matching area and path (`revenue/forecast`, `revenue/customers`, `revenue/products`, `health/usage`), add the "sends the URL filters to the API" test, and run:

```bash
npx vitest run src/pages/dashboard/tabs/forecast
npx vitest run src/pages/dashboard/tabs/customer-overview
npx vitest run src/pages/dashboard/tabs/usage-overview
npx vitest run src/pages/dashboard/tabs/product-usage
```

Expected: each PASS before moving to the next.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/shared/bookFilters.ts src/pages/dashboard/tabs
git commit -m "refactor(dashboard): five views read their filters from the URL"
```

---

### Task 6: Tickets and Topics on the shared toolbar

**Files:**
- Modify: `src/pages/dashboard/tabs/ticket-overview/TicketOverviewContainer.tsx`, `src/pages/dashboard/tabs/AITrendingTopics.tsx`
- Test: `ticket-overview/TicketOverview.test.tsx`, `ai-trending/AITrending.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Tickets URL keys: `days` (preset, `clearable: false`), `owner`, `priority`, `customer`. The API expects `from` (ISO date) instead of `days` and reads `customer` (and, today, `account`); build the query as `toQuery({ owner, priority, customer })` plus `from=isoDaysAgo(days)` when `days` is set, using the file's existing `isoDaysAgo` and `DATE_PRESETS`. The response's `TicketFilterOptions` has both `customers` and `accounts` (`{ id, name }[]`); the shared Account chip uses `customers` under key `customer` (options `{ value: String(c.id), label: c.name }`), which the backend already reads. Owners are `{ id, name }` too, so map them the same way rather than through `bookFilters`.
- Topics URL keys: `customer`, `type`, `sentiment`, `area`, `category`, `subcategory`, `revenue_bracket`. The Account Name chip today encodes `kind:id` for organisations or accounts; keep its grouped options but store it under URL key `scope` with value `customer:12` / `account:4`, and translate to the API's `customer=12` / `account=4` when building the query. Subcategory options stay filtered by the chosen category exactly as today.

- [ ] **Step 1: Update both tests to routed, URL-first renders** (same helper shape as Task 5, paths `support/tickets` and `support/topics`), and add for each a test asserting that a URL filter reaches the fetch URL:

```tsx
it('turns the URL date preset into a from= date', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
  vi.stubGlobal('fetch', fetchMock);
  renderTickets('/dashboard/support/tickets?days=30&priority=high');
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
  expect(url).toContain('priority=high');
});
```

```tsx
it('sends the Account Name scope as customer or account', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
  vi.stubGlobal('fetch', fetchMock);
  renderTopics('/dashboard/support/topics?scope=account:4&sentiment=negative');
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toContain('account=4');
  expect(url).toContain('sentiment=negative');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/dashboard/tabs/ticket-overview src/pages/dashboard/tabs/ai-trending`
Expected: FAIL.

- [ ] **Step 3: Rewrite both containers in the Task 5 pattern** with the key handling above; the Topics subcategory chip keeps `options.subcategories.filter((s) => !values.category || s.category === values.category)`, and picking a new category clears `subcategory` (call `set('subcategory', '')` inside the category chip's change handler by giving `DashboardToolbar` a filter whose `options` already exclude stale values; if the stale value is still in the URL, the chip shows "All" and the query omits it because `toQuery` sends it only when it is in the filtered list).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/dashboard/tabs/ticket-overview src/pages/dashboard/tabs/ai-trending`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/tabs/ticket-overview src/pages/dashboard/tabs/AITrendingTopics.tsx src/pages/dashboard/tabs/ai-trending
git commit -m "refactor(dashboard): Tickets and Topics read their filters from the URL"
```

---

### Task 7: Health area: URL filters, Distribution, and `/health` folded in

**Files:**
- Modify: `src/pages/dashboard/tabs/HealthOverviewContainer.tsx`
- Create: `src/pages/health/HealthDistribution.tsx` (extracted body of `HealthPage`)
- Replace stub: `src/pages/dashboard/tabs/health-overview/DistributionView.tsx`
- Modify: `src/pages/health/HealthPage.tsx` (becomes a thin wrapper, kept only if imported elsewhere; otherwise deleted), `src/components/layout/Sidebar.tsx:150` (remove the Health item and the `HeartPulse` import if unused)
- Test: `health-overview/healthFilters.test.tsx`, new `health-overview/DistributionView.test.tsx`

**Interfaces:**
- Health filters stay in Redux (`setHealthFilter`) because five views and their tests read them there; the container syncs **URL → Redux** on every URL change and the toolbar writes the URL. URL `customer` maps to Redux `account` (a customer id, same value).
- `HealthDistribution()` renders what `HealthPage` rendered below its title.
- `DistributionView()` renders the old Health Controls charts (`ControlsView` from `health-overview/ControlsView.tsx`) followed by `<HealthDistribution />`.

- [ ] **Step 1: Write the failing tests**

In `healthFilters.test.tsx`, add:

```tsx
it('applies URL filters to the book', async () => {
  renderHealthAt('/dashboard/health/triage?owner=1', {
    rows: [healthRow({ id: '1', ownerKey: '1' }), healthRow({ id: '2', ownerKey: '2', account: 'Beta' })],
  });
  expect(await screen.findByText('1 of 2 accounts')).toBeInTheDocument();
});
```

where `renderHealthAt(url, opts)` builds on `renderWithHealth` from `testUtils.tsx` and wraps a `MemoryRouter` at `url` with routes `/dashboard/health` → `AreaLayout area="health"` → `HealthOverviewContainer` → `triage` → `TriageView`. Add `renderHealthAt` to `testUtils.tsx` so other Health tests can use it.

```tsx
// src/pages/dashboard/tabs/health-overview/DistributionView.test.tsx
// Renders DistributionView with the customers/accounts stats slices preloaded
// (copy the preload shape from src/pages/health tests if present, else from
// features/customers/customersSlice initial state) and asserts:
it('shows the health mix and the organisations/accounts switch', async () => {
  renderDistribution();
  expect(screen.getByRole('button', { name: /organizations/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /accounts/i })).toBeInTheDocument();
});
```

Before writing this test, open `src/pages/health/HealthPage.tsx` and use its actual toggle labels and the store keys it selects (`state.customers.stats`, `accountStats`, …) in the preload.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/dashboard/tabs/health-overview`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

`HealthOverviewContainer.tsx`: remove `SUBTABS`, the `NavLink` row and the `location.pathname` redirect; keep `useHealthOverview()`; add

```tsx
const subViews = useSubViews();
const { values } = useDashboardFilters(SHARED_KEYS);
useEffect(() => {
  dispatch(setHealthFilter({ key: 'owner', value: values.owner || null }));
  dispatch(setHealthFilter({ key: 'lifecycle', value: values.lifecycle || null }));
  dispatch(setHealthFilter({ key: 'account', value: values.customer || null }));
}, [dispatch, values.owner, values.lifecycle, values.customer]);
```

and render `<DashboardToolbar subViews={subViews} count={`${rows.length} of ${totalCount} accounts`} filters={[{ key: 'owner', label: 'Primary Owner', options: choices(owners) }, { key: 'lifecycle', label: 'Lifecycle Stage', options: choices(lifecycles) }, { key: 'customer', label: 'Account', options: choices(accounts) }]} />` above `<Outlet />`, keeping the existing `choices` helper that appends counts. On unmount, dispatch `clearHealthFilters()` so the URL stays the only source of truth.

`HealthDistribution.tsx`: move everything inside `HealthPage`'s returned JSX except its page title/header into `export function HealthDistribution()`, with the hooks it needs. `HealthPage` then renders the header plus `<HealthDistribution />`; since `/health` now redirects, delete `HealthPage.tsx` if `grep -rn "HealthPage" src` shows no other importer.

`DistributionView.tsx`:

```tsx
import { ControlsView as HealthMix } from './ControlsView';
import { HealthDistribution } from '../../../health/HealthDistribution';

/** Health › Distribution: the portfolio mix (the old Controls tab) and the
 *  organisations/accounts × count/MRR rollup that used to live at /health. */
export function DistributionView() {
  return (
    <div className="flex flex-col gap-4">
      <HealthMix />
      <HealthDistribution />
    </div>
  );
}
```

`Sidebar.tsx`: delete the `<NavItem to="/health" … />` line and the `HeartPulse` import if nothing else uses it.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/dashboard/tabs/health-overview src/pages/health src/components/layout`
Expected: PASS. Update any Sidebar test that asserted a Health link.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/dashboard/tabs src/pages/health src/components/layout/Sidebar.tsx
git commit -m "feat(dashboard): Health reads URL filters and gains Distribution

/health's rollup moves to Dashboard > Health > Distribution and leaves
the Setup group."
```

---

### Task 8: One KPI component everywhere

**Files:**
- Modify: `tabs/forecast/ControlsView.tsx`, `tabs/activity/ControlsView.tsx`, `tabs/customer-overview/ControlsView.tsx`, `tabs/product-usage/ControlsView.tsx`, `tabs/usage-overview/ControlsView.tsx`, `tabs/health-overview/RenewalView.tsx` (each has a local `function Tile`)
- Test: the existing test file beside each

**Interfaces:**
- Consumes: `Kpi`, `KpiStrip`, `Panel` (Task 2).
- Tone mapping from the old `Tile`: `tone="danger"` → `tone="loss"` only where the figure is a loss (at-risk ARR, churn, dark ARR, overdue); `tone="success"` → `tone="gain"` only for expansion/gains; every other `danger`/`success` becomes neutral. Record each mapping decision in the commit body.

- [ ] **Step 1: Add a guard test** to `src/pages/dashboard/shared/Kpi.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

it('no dashboard view defines its own Tile', () => {
  const offenders = globSync('src/pages/dashboard/tabs/**/*.tsx').filter((file) =>
    /function Tile\(/.test(readFileSync(file, 'utf8')),
  );
  expect(offenders).toEqual([]);
});
```

If `glob` is not a dev dependency, use `import.meta.glob('../tabs/**/*.tsx', { query: '?raw', eager: true, import: 'default' })` instead and iterate its entries.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/dashboard/shared/Kpi.test.tsx`
Expected: FAIL listing the six files.

- [ ] **Step 3: In each of the six files**, delete `interface TileProps` and `function Tile`, import `{ Kpi, KpiStrip }` from the shared module, and replace the grid of `<Tile …/>` with `<KpiStrip>` containing `<Kpi label=… value=… detail=… tone=…/>` per the mapping. Replace each panel wrapper `className="bg-surface border border-line-subtle rounded-lg shadow-sm …"` with `<Panel title=…>` where the wrapper had a heading, keeping the inner content. Run that file's test after each file.

- [ ] **Step 4: Run all dashboard tests**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS including the guard.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard
git commit -m "refactor(dashboard): one KPI and panel across every view"
```

---

### Task 9: Token-only chart colours

**Files:**
- Create: `src/pages/dashboard/shared/chartPalette.ts`, `chartPalette.test.ts`
- Modify: `tabs/ai-trending/chartTheme.ts`, `tabs/ticket-overview/chartTheme.ts`, `tabs/usage-overview/chartTheme.ts`, and the forecast ARR bridge chart (`tabs/forecast/charts/ArrBridgeChart.tsx`)

**Interfaces:**
- Produces:
  - `ROLE = { ink: 'var(--text-primary)', muted: 'var(--text-secondary)', faint: 'var(--text-tertiary)', loss: 'var(--danger)', gain: 'var(--success)', caution: 'var(--warning)' } as const`
  - `CATEGORICAL = [ROLE.ink, ROLE.muted, ROLE.faint] as const` — for non-semantic categories, always with direct labels
  - `niceMax(values: number[], fallback?: number): number`, `ticksTo(max: number, count?: number): number[]`, `percentOf(value: number, total: number): string`, `compact(value: number): string` — moved verbatim from the tab files

- [ ] **Step 1: Write the failing test**

```ts
// src/pages/dashboard/shared/chartPalette.test.ts
import { describe, it, expect } from 'vitest';
import * as ai from '../tabs/ai-trending/chartTheme';
import * as tickets from '../tabs/ticket-overview/chartTheme';
import * as usage from '../tabs/usage-overview/chartTheme';
import { niceMax, compact, percentOf, ticksTo } from './chartPalette';

const HEX = /#[0-9a-f]{3,8}\b|rgb\(/i;

describe('chart colours', () => {
  it('are tokens only', () => {
    for (const mod of [ai, tickets, usage]) {
      for (const value of Object.values(mod)) {
        if (value && typeof value === 'object') {
          expect(JSON.stringify(value)).not.toMatch(HEX);
        }
      }
    }
  });

  it('keep semantic colours for meaning only', () => {
    expect(ai.SOURCE_COLORS.Email).not.toMatch(/danger|success/);
    expect(ai.SENTIMENT_COLORS.Negative).toBe('var(--danger)');
    expect(tickets.PRIORITY_COLORS.Critical).toBe('var(--danger)');
  });
});

describe('helpers', () => {
  it('niceMax rounds up to a clean boundary', () => expect(niceMax([0, 37])).toBe(40));
  it('compact leaves small numbers plain', () => expect(compact(300)).toBe('300'));
  it('percentOf handles an empty total', () => expect(percentOf(1, 0)).toBe('0'));
  it('ticksTo spaces evenly', () => expect(ticksTo(40)).toEqual([0, 10, 20, 30, 40]));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/dashboard/shared/chartPalette.test.ts`
Expected: FAIL (module missing; `Critical` is `#8B2E2E`).

- [ ] **Step 3: Implement.** Create `chartPalette.ts` with `ROLE`, `CATEGORICAL` and the four helpers copied from the tab files. In each `chartTheme.ts`, delete its local helpers and re-export them from `chartPalette` (so chart imports keep working), and remap:
  - AI: `SOURCE_COLORS` → Email `ROLE.ink`, Call `ROLE.muted`, Ticket `ROLE.faint`; `AREA_COLORS` → the three `CATEGORICAL` entries in order; `SENTIMENT_COLORS` → Positive `ROLE.gain`, Neutral `ROLE.faint`, Negative `ROLE.loss`; `FALLBACK_COLOR` → `ROLE.faint`.
  - Tickets: `STATUS_COLORS` → Open `ROLE.ink`, In Progress `ROLE.muted`, On Hold `ROLE.faint`, Resolved `ROLE.gain`, Closed `ROLE.faint`; `PRIORITY_COLORS` → Low `ROLE.faint`, Medium `ROLE.muted`, High `ROLE.caution`, Critical `ROLE.loss` (and delete the comment explaining the old literal).
  - Usage: `BAND_COLORS` → dormant `ROLE.loss`, low `ROLE.caution`, fair `ROLE.muted`, healthy `ROLE.gain`, at_capacity `ROLE.ink`, over `ROLE.ink`; keep the comment's reasoning, updated to say at-capacity is ink because it is an opportunity, not a state to alarm on.
  - ARR bridge: opening and forecast bars `ROLE.ink` (forecast drawn as an outline: `fill="transparent"` `stroke={ROLE.ink}`), churn and contraction `ROLE.loss`, expansion `ROLE.gain`.
  - Then check each chart that used colour alone has a legend or direct labels; the donuts already label slices, the bars have axes.

- [ ] **Step 4: Run all dashboard tests**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard
git commit -m "style(dashboard): chart colours from tokens, semantic colour for meaning only"
```

---

### Task 10: Brain Overview links and docs

**Files:**
- Modify: `src/components/brain/MetricLayerPanel.tsx` (group headers link to their dashboard home), `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`
- Test: the existing MetricLayerPanel test (find with `grep -rln MetricLayerPanel src --include=*.test.tsx`)

**Interfaces:**
- Group → link: Revenue → `/dashboard/revenue/forecast`, Retention → `/dashboard/revenue/customers`, Usage → `/dashboard/health/usage`, Engagement → `/dashboard/health/activity`.

- [ ] **Step 1: Write the failing test** in the MetricLayerPanel test file:

```tsx
it('links each group to its dashboard home', async () => {
  renderPanel(); // the file's existing render helper
  expect(await screen.findByRole('link', { name: /Revenue in the dashboard/i })).toHaveAttribute(
    'href',
    '/dashboard/revenue/forecast',
  );
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run src/components/brain` → FAIL.

- [ ] **Step 3: Implement.** Add `href` to each entry of the groups array at `MetricLayerPanel.tsx:17-20` and render beside each group title:

```tsx
<Link to={group.href} className="text-[11px] text-ink-muted hover:text-ink" aria-label={`${group.title} in the dashboard`}>
  Open in dashboard →
</Link>
```

Update `docs/04-app-flow.md`: replace the Dashboard section with the new route tree (Overview; Revenue/Health/Support and their sub-views; URL filters; `/health` and `/dashboard/advance/*` redirects). Update `docs/03-ui-ux-design.md`: the toolbar, `Kpi`/`KpiStrip`, `Panel`, `DataState`, and the chart colour roles.

- [ ] **Step 4: Run tests.** `npx vitest run src/components/brain` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain docs
git commit -m "docs(dashboard): app flow and UI notes for the new dashboard

Brain Overview's metric groups link to their dashboard homes."
```

---

### Task 11: Verify, polish, screenshot

**Files:** none new, fixes only.

- [ ] **Step 1: Full checks**

Run: `npm run lint && npx tsc -b --noEmit && npx vitest run && npm run build`
Expected: lint 0 errors, typecheck clean, all tests pass, build succeeds.

- [ ] **Step 2: Anti-slop audit.** Run `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/pages/dashboard --include=*.tsx --include=*.ts | grep -v test` and fix any hit in files this PR touched. Load `react-ts-app:impeccable` and run its `critique` on Overview, one Revenue, one Health and one Support sub-view in the running app (`http://localhost:5173/dashboard`); fix findings that fall inside this PR's scope (typography sizes, spacing, states), list the rest in the PR body.

- [ ] **Step 3: Screenshots** at 1440px and 375px for Overview, Revenue › Forecast, Health › Triage, Health › Distribution, Support › Tickets, before (from `main`) and after. Check at 375px that nothing scrolls sideways.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A src
git commit -m "style(dashboard): polish from the design critique"
```

- [ ] **Step 5: Hand off** to `finishing-a-development-branch`: request a code review, push, open the PR with the screenshots, and note that Brain's metric values were kept (linked, not replaced) because they are month-end organisation-wide figures, not the viewer's book.

---

## Next plans

- PR 2, drill-down (`DrillPanel`, `drill=` on ticket and interaction stats, URL filters on Organizations and Communications): written after this merges, against the components above.
- PR 3, Overview and the attention list (backend endpoint, `AttentionSnooze`): written after PR 2.
