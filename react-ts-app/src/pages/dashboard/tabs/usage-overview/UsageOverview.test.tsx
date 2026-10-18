import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import usageReducer from '../../../../features/usage/usageSlice';
import type { UsageAccount } from '../../../../features/usage/usageSlice';
import authReducer from '../../../../features/auth/authSlice';
import { AreaLayout } from '../../AreaLayout';
import { UsageOverviewContainer } from '../UsageOverviewContainer';
import { ControlsView } from './ControlsView';
import { niceMax } from './chartTheme';
import { DrillProvider } from '../../drill/DrillContext';
import { DrillPanel } from '../../drill/DrillPanel';

// Integration tier: container + view + charts through the real router, with
// only the fetch boundary mocked. Recharts needs a sized container jsdom won't
// give it, so these assert on the numbers, the lists and the controls.

const account = (over = {}) => ({
  id: 1,
  name: 'Uber',
  owner: 'Carl CSM',
  lifecycle_stage: 'Live',
  health_category: 'average' as const,
  utilisation: 31.4,
  active_seats: 220,
  contracted_seats: 700,
  idle_seats: 480,
  arr: 95_000,
  shelfware_arr: 65_142,
  products: 2,
  renewal_date: '2027-03-01',
  band: 'low',
  ...over,
});

const stats = {
  kpis: {
    accounts: 12,
    contracted_seats: 8055,
    active_seats: 5228,
    utilisation: 64.9,
    idle_seats: 2827,
    shelfware_arr: 275_014.42,
    at_capacity_arr: 175_000,
    at_capacity_count: 1,
    unmeasured_count: 1,
    measured_count: 11,
    unpriced_count: 0,
  },
  bands: [
    { key: 'dormant', name: 'Dormant (<25%)', accounts: 3, arr: 135_600, idle_seats: 1141 },
    { key: 'low', name: 'Low (25–50%)', accounts: 2, arr: 184_400, idle_seats: 960 },
    { key: 'fair', name: 'Fair (50–75%)', accounts: 2, arr: 105_600, idle_seats: 405 },
    { key: 'healthy', name: 'Healthy (75–90%)', accounts: 3, arr: 324_100, idle_seats: 201 },
    { key: 'at_capacity', name: 'At capacity (90–100%)', accounts: 1, arr: 175_000, idle_seats: 120 },
    { key: 'over', name: 'Over-deployed (100%+)', accounts: 0, arr: 0, idle_seats: 0 },
  ],
  adoption: [
    { key: '0', name: 'No product recorded', accounts: 0, arr: 0 },
    { key: '1', name: '1 product', accounts: 4, arr: 277_500 },
    { key: '2', name: '2 products', accounts: 2, arr: 133_400 },
    { key: '3', name: '3 products', accounts: 4, arr: 321_200 },
    { key: '4+', name: '4+ products', accounts: 2, arr: 287_000 },
  ],
  scatter: [account(), account({ id: 2, name: 'Shopify', utilisation: 92, band: 'at_capacity' })],
  shelfware: [account()],
  at_capacity: [
    account({
      id: 2,
      name: 'Shopify',
      utilisation: 92,
      active_seats: 1380,
      contracted_seats: 1500,
      arr: 175_000,
      shelfware_arr: 0,
      band: 'at_capacity',
    }),
  ],
  currency: 'USD' as const,
  filters: {
    owners: [
      { value: '5', name: 'Carl CSM' },
      { value: 'unassigned', name: 'Unassigned' },
    ],
    lifecycles: [
      { value: 'live', name: 'Live' },
      { value: 'onboarding', name: 'Onboarding' },
    ],
    customers: [{ value: '1', name: 'Uber' }],
  },
};

function mockFetch(body: unknown = stats, status = 200) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderUsageOverview(url = '/dashboard/health/usage') {
  // `auth` is here only so `useOrgCurrency` (read by the drill panel's row
  // list) has a slice to select from — its default state has no user, which
  // is exactly what falls back to 'USD', matching this file's fixtures.
  // `DrillProvider` + `DrillPanel` mirror DashboardFrame's real, app-wide
  // pairing (see health-overview/testUtils.tsx `renderWithDrill`) so a click
  // on a drillable Kpi or chart segment opens a real dialog instead of
  // throwing on a missing `useDrill()` provider.
  const store = configureStore({ reducer: { usage: usageReducer, auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <DrillProvider>
          <Routes>
            <Route path="/dashboard/health" element={<AreaLayout area="health" />}>
              <Route element={<UsageOverviewContainer />}>
                <Route path="usage" element={<ControlsView />} />
              </Route>
            </Route>
          </Routes>
          <DrillPanel />
        </DrillProvider>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

const lastUrl = (spy: ReturnType<typeof mockFetch>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0];

/** The stat tile carrying `label`. "At capacity" also names a band in the
 *  scatter's key, so chart legends are skipped. */
const tile = (label: string) =>
  screen.getAllByText(label).find((el) => !el.closest('[role="list"]'))!.parentElement as HTMLElement;

describe('Usage Overview', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches real usage on mount instead of reading a fixture', async () => {
    const fetchMock = mockFetch();
    renderUsageOverview();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/customers/usage/'),
        expect.objectContaining({ method: 'GET' })
      )
    );
  });

  it('leads with the book-wide utilisation and the seats behind it', async () => {
    mockFetch();
    renderUsageOverview();

    const card = await screen.findByText('Seat utilisation');
    expect(within(card.parentElement!).getByText('64.9%')).toBeInTheDocument();
    expect(
      within(card.parentElement!).getByText('5,228 of 8,055 seats active')
    ).toBeInTheDocument();
  });

  it('puts a number on the shelfware and on the capacity', async () => {
    mockFetch();
    renderUsageOverview();

    await screen.findByText('Shelfware');
    expect(within(tile('Shelfware')).getByText('$275.0K')).toBeInTheDocument();
    expect(within(tile('Shelfware')).getByText(/2,827 idle seats/)).toBeInTheDocument();
    expect(within(tile('At capacity')).getByText('$175.0K')).toBeInTheDocument();
    expect(within(tile('At capacity')).getByText(/1 account is out of room/)).toBeInTheDocument();
  });

  it('says how many accounts it cannot speak for at all', async () => {
    // The whole screen is silent about these; the tile is where that is said.
    mockFetch();
    renderUsageOverview();

    await screen.findByText('No seat data');
    expect(within(tile('No seat data')).getByText('1')).toBeInTheDocument();
    expect(
      within(tile('No seat data')).getByText(/of 12 accounts · absent from every figure here/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no seat data and .*not counted here/i)
    ).toBeInTheDocument();
  });

  it('shows the shelfware work list ranked by money', async () => {
    mockFetch();
    renderUsageOverview();

    // "Uber" is also an option in the Account dropdown, so this finds the
    // one inside the work list.
    const list = (await screen.findByText('Shelfware — what to fix')).closest('div')!
      .parentElement!;
    const row = within(list).getByText('Uber').closest('tr')!;

    expect(within(row).getByText('31.4%')).toBeInTheDocument();
    expect(within(row).getByText('220 / 700')).toBeInTheDocument();
    expect(within(row).getByText('$65,142.00')).toBeInTheDocument();
  });

  it('shows the capacity list with what the account already pays', async () => {
    mockFetch();
    renderUsageOverview();

    const row = (await screen.findByText('Shopify')).closest('tr')!;

    expect(within(row).getByText('92%')).toBeInTheDocument();
    expect(within(row).getByText('$175,000.00')).toBeInTheDocument();
  });

  it('says so rather than drawing an empty list when there is no shelfware', async () => {
    mockFetch({ ...stats, shelfware: [], at_capacity: [] });
    renderUsageOverview();

    expect(
      await screen.findByText('Nothing in this selection is below 75% used.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nobody in this selection is near their seat count.')
    ).toBeInTheDocument();
  });

  it('renders adoption breadth by ARR', async () => {
    mockFetch();
    renderUsageOverview();

    await screen.findByText('Adoption breadth');
    expect(screen.getByText('1 product')).toBeInTheDocument();
    expect(screen.getByText(/\$287\.0K · 2 accounts/)).toBeInTheDocument();
  });

  // ── the filter bar ────────────────────────────────────────────────

  it('offers the real filter options rather than a hardcoded list', async () => {
    mockFetch();
    renderUsageOverview();

    const owner = await screen.findByLabelText('Primary Owner');
    expect(within(owner).getByRole('option', { name: 'Carl CSM' })).toBeInTheDocument();
    expect(within(owner).getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Lifecycle Stage')).getByRole('option', { name: 'Live' })
    ).toBeInTheDocument();
  });

  it('refetches with a query string when a filter changes', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderUsageOverview();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('owner=5'));
  });

  it('sends unassigned as its own owner value', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderUsageOverview();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), 'unassigned');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('owner=unassigned'));
  });

  it('counts the active filters and clears them', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderUsageOverview();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');
    await user.selectOptions(screen.getByLabelText('Lifecycle Stage'), 'live');

    await user.click(await screen.findByRole('button', { name: 'Clear 2' }));

    await waitFor(() => expect(lastUrl(fetchMock)).toMatch(/\/customers\/usage\/$/));
  });

  it('sends the URL filters to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);
    renderUsageOverview('/dashboard/health/usage?owner=5&lifecycle=live');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('owner=5');
    expect(url).toContain('lifecycle=live');
  });

  // ── failure and empty states ──────────────────────────────────────

  it('surfaces a failed fetch rather than rendering empty charts silently', async () => {
    mockFetch({ detail: 'Server exploded' }, 500);
    renderUsageOverview();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not load/);
  });

  it('keeps the previous numbers when a refetch fails', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderUsageOverview();

    await screen.findByText('64.9%');

    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Nope' }) })
    );
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');

    await screen.findByRole('alert');
    expect(screen.getByText('64.9%')).toBeInTheDocument();
  });

  it('shows a dash rather than 0% before anything has loaded', async () => {
    // "0% used" is a claim about the book; "—" is an admission that nothing
    // has loaded yet.
    mockFetch();
    renderUsageOverview();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('says the selection is empty rather than charting nothing', async () => {
    mockFetch({
      ...stats,
      kpis: { ...stats.kpis, accounts: 0, unmeasured_count: 0 },
      scatter: [],
      shelfware: [],
      at_capacity: [],
    });
    renderUsageOverview();

    expect(await screen.findByText('No accounts match these filters.')).toBeInTheDocument();
    expect(
      screen.getByText('No account in this selection has seat data recorded.')
    ).toBeInTheDocument();
  });
});

// A small, hand-picked account builder, shared by the "drill" suites below —
// every threshold they exercise (90% at-capacity, >0 shelfware ARR, a
// truncated `scatter`) needs a near miss sitting just the wrong side of it,
// and the top-of-file `stats` fixture wasn't built with those in mind.
function acct(over: Partial<UsageAccount> = {}): UsageAccount {
  return {
    id: 1,
    name: 'Acct',
    owner: 'Carl',
    lifecycle_stage: 'Live',
    health_category: 'average' as const,
    utilisation: 50,
    active_seats: 500,
    contracted_seats: 1000,
    idle_seats: 500,
    arr: 10_000,
    shelfware_arr: 0,
    products: 1,
    renewal_date: null,
    band: 'fair',
    ...over,
  };
}

describe('Usage Overview drill', () => {
  const atCap = acct({
    id: 1,
    name: 'AtCap',
    owner: 'Carl',
    utilisation: 92,
    active_seats: 920,
    idle_seats: 80,
    arr: 50_000,
    band: 'at_capacity',
  });
  // Near miss: just under the At capacity threshold (89.x%, not 90%).
  const nearMissAtCap = acct({
    id: 2,
    name: 'NearMissAtCap',
    owner: 'Carl',
    utilisation: 89.9,
    active_seats: 890,
    idle_seats: 110,
    arr: 40_000,
    band: 'healthy',
  });
  // Boundary, included: exactly 90% clears the `>= 90` line.
  const atNinety = acct({
    id: 5,
    name: 'AtNinety',
    owner: 'Eve',
    utilisation: 90,
    active_seats: 900,
    idle_seats: 100,
    arr: 25_000,
    band: 'at_capacity',
  });
  const shelfy = acct({
    id: 3,
    name: 'Shelfy',
    owner: 'Dana',
    utilisation: 30,
    active_seats: 300,
    idle_seats: 700,
    arr: 60_000,
    shelfware_arr: 42_000,
    band: 'low',
  });
  // Near miss: no shelfware at all (the boundary is `> 0`).
  const nearMissShelf = acct({
    id: 4,
    name: 'NearMissShelf',
    owner: 'Dana',
    utilisation: 80,
    active_seats: 800,
    idle_seats: 200,
    arr: 30_000,
    shelfware_arr: 0,
    band: 'healthy',
  });

  const scatter = [atCap, nearMissAtCap, shelfy, nearMissShelf, atNinety];

  const drillStats = {
    kpis: {
      accounts: 6,
      contracted_seats: 5000,
      active_seats: 3810,
      utilisation: 76.2,
      idle_seats: 1190,
      shelfware_arr: 42_000,
      at_capacity_arr: 75_000,
      at_capacity_count: 2,
      unmeasured_count: 1,
      measured_count: 5,
      unpriced_count: 0,
    },
    bands: [
      { key: 'dormant', name: 'Dormant (<25%)', accounts: 0, arr: 0, idle_seats: 0 },
      { key: 'low', name: 'Low (25–50%)', accounts: 1, arr: 60_000, idle_seats: 700 },
      { key: 'fair', name: 'Fair (50–75%)', accounts: 0, arr: 0, idle_seats: 0 },
      { key: 'healthy', name: 'Healthy (75–90%)', accounts: 2, arr: 70_000, idle_seats: 310 },
      { key: 'at_capacity', name: 'At capacity (90–100%)', accounts: 2, arr: 75_000, idle_seats: 180 },
      { key: 'over', name: 'Over-deployed (100%+)', accounts: 0, arr: 0, idle_seats: 0 },
    ],
    adoption: [],
    scatter,
    shelfware: [shelfy],
    at_capacity: [atCap, atNinety],
    currency: 'USD' as const,
    filters: { owners: [], lifecycles: [], customers: [] },
  };

  function renderDrill() {
    mockFetch(drillStats);
    return renderUsageOverview();
  }

  // ── Kpi tiles ──────────────────────────────────────────────────────

  it('opens the seat-utilisation drill with every measured account', async () => {
    const user = userEvent.setup();
    renderDrill();

    await user.click(
      await screen.findByRole('button', { name: 'Seat utilisation 76.2%, show accounts' })
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'AtCap' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'NearMissAtCap' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Shelfy' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'NearMissShelf' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'AtNinety' })).toBeInTheDocument();
    // The figure is a book-wide ratio, not a count of these rows — each row's
    // own detail is what ties it back to that ratio.
    expect(within(dialog).getByText('92% used')).toBeInTheDocument();
  });

  it('opens the shelfware drill with only the accounts carrying idle ARR', async () => {
    const user = userEvent.setup();
    renderDrill();

    await user.click(await screen.findByRole('button', { name: 'Shelfware $42.0K, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'Shelfy' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'AtCap' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'NearMissAtCap' })).not.toBeInTheDocument();
    // The near miss: same book, zero shelfware ARR.
    expect(within(dialog).queryByRole('link', { name: 'NearMissShelf' })).not.toBeInTheDocument();
    // The tile's figure is idle ARR, which the row's own trailing amount
    // (contract ARR) doesn't add up to — the detail is what explains it.
    expect(within(dialog).getByText('$42.0K idle · 700 idle seats')).toBeInTheDocument();
  });

  it('opens the at-capacity drill with only accounts at or above 90% utilisation, boundary included', async () => {
    const user = userEvent.setup();
    renderDrill();

    await user.click(
      await screen.findByRole('button', { name: 'At capacity $75.0K, show accounts' })
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'AtCap' })).toBeInTheDocument();
    // Boundary, included: exactly 90%.
    expect(within(dialog).getByRole('link', { name: 'AtNinety' })).toBeInTheDocument();
    // Boundary, excluded: 89.9%, just short of the line.
    expect(within(dialog).queryByRole('link', { name: 'NearMissAtCap' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('92% used')).toBeInTheDocument();
    expect(within(dialog).getByText('90% used')).toBeInTheDocument();
  });

  it('does not offer a drill for accounts with no seat data at all', async () => {
    // `unmeasured_count` accounts aren't in `scatter` — there is no rows/
    // predicate combination that reproduces them, so the tile stays a plain
    // count rather than pretending to explain itself.
    renderDrill();

    const tileValue = await screen.findByText('No seat data');
    expect(tileValue.closest('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /No seat data/ })).not.toBeInTheDocument();
  });

  // ── Utilisation band chart ────────────────────────────────────────

  it('opens exactly the accounts in one utilisation band from a keyboard target', async () => {
    const user = userEvent.setup();
    renderDrill();

    await user.click(
      await screen.findByRole('button', { name: 'Healthy (75–90%) $70.0K, show accounts' })
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'NearMissAtCap' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'NearMissShelf' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'AtCap' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Shelfy' })).not.toBeInTheDocument();
  });

  it('opens a different band for the same book', async () => {
    const user = userEvent.setup();
    renderDrill();

    await user.click(
      await screen.findByRole('button', { name: 'Low (25–50%) $60.0K, show accounts' })
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'Shelfy' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'NearMissAtCap' })).not.toBeInTheDocument();
  });

  it('includes the exact-90% boundary account in the at-capacity band target', async () => {
    const user = userEvent.setup();
    renderDrill();

    await user.click(
      await screen.findByRole('button', { name: 'At capacity (90–100%) $75.0K, show accounts' })
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'AtCap' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'AtNinety' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'NearMissAtCap' })).not.toBeInTheDocument();
  });

  it('offers no keyboard target for a band with no accounts in it', async () => {
    renderDrill();

    await screen.findByText('Where the money sits');
    expect(screen.queryByRole('button', { name: /Dormant/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fair/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Over-deployed/ })).not.toBeInTheDocument();
  });
});

describe('Usage Overview drill — truncated scatter', () => {
  // The backend caps `scatter` at 500 rows with no `truncated` flag of its
  // own — `measured_count` (3) being larger than `scatter.length` (2) here
  // is what stands in for that cap. A drill from this list would only ever
  // show 2 of the 3 measured accounts a figure counted, so nothing on this
  // screen should offer one.
  const a = acct({
    id: 1,
    name: 'TruncA',
    utilisation: 92,
    shelfware_arr: 5_000,
    idle_seats: 50,
    arr: 10_000,
    band: 'at_capacity',
  });
  const b = acct({
    id: 2,
    name: 'TruncB',
    utilisation: 40,
    shelfware_arr: 0,
    idle_seats: 100,
    arr: 20_000,
    band: 'low',
  });

  const truncatedStats = {
    kpis: {
      accounts: 4,
      contracted_seats: 3000,
      active_seats: 1250,
      utilisation: 41.7,
      idle_seats: 500,
      shelfware_arr: 5_000,
      at_capacity_arr: 10_000,
      at_capacity_count: 1,
      unmeasured_count: 1,
      measured_count: 3, // one measured account isn't in `scatter` below
      unpriced_count: 0,
    },
    bands: [
      { key: 'dormant', name: 'Dormant (<25%)', accounts: 0, arr: 0, idle_seats: 0 },
      { key: 'low', name: 'Low (25–50%)', accounts: 1, arr: 20_000, idle_seats: 100 },
      { key: 'fair', name: 'Fair (50–75%)', accounts: 0, arr: 0, idle_seats: 0 },
      { key: 'healthy', name: 'Healthy (75–90%)', accounts: 0, arr: 0, idle_seats: 0 },
      { key: 'at_capacity', name: 'At capacity (90–100%)', accounts: 1, arr: 10_000, idle_seats: 50 },
      { key: 'over', name: 'Over-deployed (100%+)', accounts: 0, arr: 0, idle_seats: 0 },
    ],
    adoption: [],
    scatter: [a, b], // only 2 of the 3 measured accounts — a truncated page
    shelfware: [a],
    at_capacity: [a],
    currency: 'USD' as const,
    filters: { owners: [], lifecycles: [], customers: [] },
  };

  function renderTruncated() {
    mockFetch(truncatedStats);
    return renderUsageOverview();
  }

  it('offers no Kpi drill once loaded, when scatter is shorter than measured_count', async () => {
    renderTruncated();

    // Waits for the real, post-fetch figure — not just the static label,
    // which is on screen from the very first render and would make this
    // assertion pass for the wrong reason (too soon to mean anything).
    await screen.findByText('41.7%');

    expect(screen.queryByRole('button', { name: /Seat utilisation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Shelfware/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /At capacity/ })).not.toBeInTheDocument();
    // Still a plain figure, not a dead button.
    expect(screen.getByText('41.7%').closest('button')).toBeNull();
  });

  it('offers no band DrillTargets once loaded, when scatter is shorter than measured_count', async () => {
    renderTruncated();

    await screen.findByText('41.7%');

    expect(screen.queryByRole('button', { name: /Low \(/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /At capacity \(/ })).not.toBeInTheDocument();
  });
});

describe('usage chartTheme', () => {
  it('niceMax rounds up past the data rather than clipping it', () => {
    expect(niceMax([324_100, 175_000])).toBe(400_000);
  });

  it('niceMax falls back rather than returning zero for an empty chart', () => {
    expect(niceMax([])).toBe(10);
  });
});
