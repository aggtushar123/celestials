import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import portfolioReducer from '../../../../features/portfolio/portfolioSlice';
import authReducer from '../../../../features/auth/authSlice';
import { AreaLayout } from '../../AreaLayout';
import { CustomerOverviewContainer } from '../CustomerOverviewContainer';
import { ControlsView } from './ControlsView';
import { DrillProvider } from '../../drill/DrillContext';
import { DrillPanel } from '../../drill/DrillPanel';
import { mockFetchRouted, drillResponse } from '../../drill/testDrill';

// Integration tier: container + view + charts through the real router, with
// only the fetch boundary mocked. The two Recharts charts need a sized
// container jsdom won't give them, so they're asserted on through their own
// headline text; the lists and tiles are plain DOM.

const stats = {
  kpis: {
    active: 9,
    active_arr: 688_600,
    average_arr: 76_511.11,
    churned: 4,
    churned_arr: 236_100,
    churned_12m: 3,
    churned_arr_12m: 212_100,
    logo_retention: 69.2,
    unpriced: 0,
  },
  concentration: {
    rows: [
      {
        rank: 1,
        id: 9,
        name: 'Shopify',
        arr: 175_000,
        share: 25.4,
        cumulative_share: 25.4,
        owner: 'Carl CSM',
        health_category: 'good' as const,
      },
      {
        rank: 2,
        id: 11,
        name: 'Stripe',
        arr: 112_000,
        share: 16.3,
        cumulative_share: 41.7,
        owner: 'Carl CSM',
        health_category: 'good' as const,
      },
      {
        rank: 3,
        id: 14,
        name: 'Uber',
        arr: 95_000,
        share: 13.8,
        cumulative_share: 55.5,
        owner: 'Carl CSM',
        health_category: 'poor' as const,
      },
    ],
    total_arr: 688_600,
    counted: 9,
    rest_count: 6,
    rest_arr: 306_600,
    top_three_share: 55.5,
  },
  cohorts: {
    rows: [
      { year: 2023, joined: 5, retained: 4, churned: 1, retention: 80.0 },
      { year: 2024, joined: 6, retained: 4, churned: 2, retention: 66.7 },
      { year: 2025, joined: 3, retained: 3, churned: 0, retention: 100.0 },
    ],
    undated: 1,
  },
  // Every reason on the closed list comes back, including the ones nobody
  // left for — see the backend's own portfolio.py.
  churn_reasons: [
    { value: 'other', reason: 'Other', customers: 2, arr: 212_100 },
    { value: 'budget', reason: 'Budget cut', customers: 2, arr: 24_000 },
    { value: 'price', reason: 'Price', customers: 0, arr: 0 },
    { value: 'product_gap', reason: 'Missing capability', customers: 0, arr: 0 },
  ],
  segments: {
    rows: [
      { key: 'under_25k', name: 'Under $25K', customers: 1, arr: 0 },
      { key: '25k_50k', name: '$25K – $50K', customers: 2, arr: 80_400 },
      { key: '50k_100k', name: '$50K – $100K', customers: 4, arr: 321_200 },
      { key: 'over_100k', name: '$100K and above', customers: 2, arr: 287_000 },
    ],
    unplaced: 0,
  },
  lifecycle: [
    { key: 'live', name: 'Live', customers: 1, arr: 67_200 },
    { key: 'renewal', name: 'Renewal', customers: 2, arr: 137_000 },
  ],
  currency: 'USD' as const,
  filters: {
    owners: [{ value: '5', name: 'Carl CSM' }],
    lifecycles: [{ value: 'live', name: 'Live' }],
    customers: [
      { value: '14', name: 'Uber' },
      { value: '21', name: 'WeWork' },
    ],
  },
};

function mockFetch(body: unknown = stats, status = 200) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderCustomerOverview(url = '/dashboard/revenue/customers') {
  // `auth` is here only so `useOrgCurrency` (read by the drill panel's row
  // list) has a slice to select from — its default state has no user, which
  // is exactly what falls back to 'USD', matching this file's fixtures.
  // `DrillProvider` + `DrillPanel` mirror DashboardFrame's real, app-wide
  // pairing so a click on a drillable Kpi opens a real dialog instead of
  // throwing on a missing `useDrill()` provider.
  const store = configureStore({ reducer: { portfolio: portfolioReducer, auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <DrillProvider>
          <Routes>
            <Route path="/dashboard/revenue" element={<AreaLayout area="revenue" />}>
              <Route element={<CustomerOverviewContainer />}>
                <Route path="customers" element={<ControlsView />} />
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

// getByText would be ambiguous for "Customers": the sub-view switch in the
// bar reads the same word as the KPI tile it sits above.
const tile = (label: string) =>
  screen.getAllByText(label).find((el) => el.tagName !== 'A')!.parentElement as HTMLElement;

describe('Customer Overview', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the portfolio on mount', async () => {
    const fetchMock = mockFetch();
    renderCustomerOverview();

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('/customers/overview/'));
  });

  it('leads with how many customers there are and what they average', async () => {
    mockFetch();
    renderCustomerOverview();

    await screen.findAllByText('Customers');
    expect(within(tile('Customers')).getByText('9')).toBeInTheDocument();
    expect(within(tile('Customers')).getByText(/\$688\.6K · \$76\.5K average/)).toBeInTheDocument();
  });

  it('reports logo retention against every logo ever signed', async () => {
    // The figure only means something because churned customers are counted;
    // over survivors alone it would always be 100%.
    mockFetch();
    renderCustomerOverview();

    await screen.findByText('Logo retention');
    expect(within(tile('Logo retention')).getByText('69.2%')).toBeInTheDocument();
    expect(
      within(tile('Logo retention')).getByText('4 of 13 ever signed have left')
    ).toBeInTheDocument();
  });

  it('separates churn in the last year from churn all time', async () => {
    mockFetch();
    renderCustomerOverview();

    await screen.findByText('Churned in 12 months');
    expect(within(tile('Churned in 12 months')).getByText('3')).toBeInTheDocument();
    expect(
      within(tile('Churned in 12 months')).getByText('$212.1K left · $236.1K all time')
    ).toBeInTheDocument();
  });

  it('puts concentration on its own tile and flags it when it is high', async () => {
    mockFetch();
    renderCustomerOverview();

    await screen.findByText('Top 3 concentration');
    const card = tile('Top 3 concentration');
    expect(within(card).getByText('55.5%')).toBeInTheDocument();
    expect(within(card).getByText('of ARR in the three largest accounts')).toBeInTheDocument();
  });

  it('shows a dash rather than a flattering number on an empty book', async () => {
    mockFetch({
      ...stats,
      kpis: { ...stats.kpis, active: 0, churned: 0, logo_retention: null, average_arr: null },
      concentration: { ...stats.concentration, rows: [], top_three_share: null },
    });
    renderCustomerOverview();

    await screen.findByText('Logo retention');
    expect(within(tile('Logo retention')).getByText('—')).toBeInTheDocument();
    expect(within(tile('Top 3 concentration')).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No customers match these filters.')).toBeInTheDocument();
  });

  it('draws the concentration Pareto and names the folded tail', async () => {
    mockFetch();
    renderCustomerOverview();

    expect(await screen.findByText('Revenue concentration')).toBeInTheDocument();
    expect(screen.getByText('top 3 = 55.5% of ARR')).toBeInTheDocument();
    expect(
      screen.getByText('6 smaller accounts hold the remaining $306.6K.')
    ).toBeInTheDocument();
  });

  it('draws cohorts and counts the undated apart', async () => {
    mockFetch();
    renderCustomerOverview();

    expect(await screen.findByText('Cohort survival')).toBeInTheDocument();
    expect(
      screen.getByText('1 customer with no join date recorded, counted in no cohort.')
    ).toBeInTheDocument();
  });

  it('ranks churn reasons by the money that left', async () => {
    mockFetch();
    renderCustomerOverview();

    await screen.findByText('Why they left');
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText(/\$212\.1K · 2/)).toBeInTheDocument();
  });

  it('summarises the reasons nobody left for instead of drawing empty bars', async () => {
    // A closed list makes "nothing lost to a missing capability" sayable at
    // all — the free-text field it replaced had no row for a reason nobody
    // typed. It is one line, though: an empty reason is worth knowing and is
    // not worth a bar of its own.
    mockFetch();
    renderCustomerOverview();

    await screen.findByText('Why they left');
    expect(screen.getByText('Nothing lost to: Price, Missing capability.')).toBeInTheDocument();
    expect(screen.queryByText(/similar wordings stay separate/)).not.toBeInTheDocument();
  });

  it('says nothing has churned when every reason is at zero', async () => {
    mockFetch({
      ...stats,
      churn_reasons: [{ value: 'price', reason: 'Price', customers: 0, arr: 0 }],
    });
    renderCustomerOverview();

    expect(
      await screen.findByText('No customers in this selection have churned.')
    ).toBeInTheDocument();
  });

  it('says so when nothing has churned', async () => {
    mockFetch({ ...stats, churn_reasons: [] });
    renderCustomerOverview();

    expect(
      await screen.findByText('No customers in this selection have churned.')
    ).toBeInTheDocument();
  });

  it('shows composition by size and by lifecycle, with counts and money', async () => {
    mockFetch();
    renderCustomerOverview();

    await screen.findByText('By size');
    expect(screen.getByText(/\$321\.2K · 4 customers/)).toBeInTheDocument();
    expect(screen.getByText('By lifecycle stage')).toBeInTheDocument();
    expect(screen.getByText(/\$137\.0K · 2 customers/)).toBeInTheDocument();
  });

  it('names customers left out of the money figures', async () => {
    mockFetch({ ...stats, kpis: { ...stats.kpis, unpriced: 2 } });
    renderCustomerOverview();

    expect(
      await screen.findByText(/2 customers counted in the logo figures and in none of the money/)
    ).toBeInTheDocument();
  });

  // ── the bar ───────────────────────────────────────────────────────

  it('offers churned customers in the Account filter, unlike the other dashboards', async () => {
    mockFetch();
    renderCustomerOverview();

    const accounts = await screen.findByLabelText('Account');
    // WeWork is churned on the real book; this screen is about it.
    expect(within(accounts).getByRole('option', { name: 'WeWork' })).toBeInTheDocument();
  });

  it('refetches with a query string when a filter changes', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderCustomerOverview();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('owner=5'));
  });

  it('clears the filters', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderCustomerOverview();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');
    await user.click(await screen.findByRole('button', { name: 'Clear 1' }));

    await waitFor(() => expect(lastUrl(fetchMock)).toMatch(/\/customers\/overview\/$/));
  });

  it('sends the URL filters to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);
    renderCustomerOverview('/dashboard/revenue/customers?owner=5&lifecycle=live');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('owner=5');
    expect(url).toContain('lifecycle=live');
  });

  it('surfaces a failed fetch', async () => {
    mockFetch({ detail: 'Server exploded' }, 500);
    renderCustomerOverview();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not load/);
  });
});

// ── drill ─────────────────────────────────────────────────────────────

describe('Customer Overview drill', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the churned-in-12-months drill against the server', async () => {
    const fetchMock = mockFetchRouted(stats, {
      churned_12m: drillResponse(
        [{ id: 21, name: 'WeWork', owner: 'Unassigned', arr: 24_000, value: 24_000 }],
        'ARR',
      ),
    });
    const user = userEvent.setup();
    renderCustomerOverview();

    await user.click(
      await screen.findByRole('button', { name: 'Churned in 12 months 3, show accounts' })
    );

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/customers/overview/?drill=churned_12m')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'WeWork' })).toBeInTheDocument();
  });

  it('carries the current filters into the churned-in-12-months drill request', async () => {
    const fetchMock = mockFetchRouted(stats, { churned_12m: drillResponse([], 'ARR') });
    const user = userEvent.setup();
    renderCustomerOverview('/dashboard/revenue/customers?owner=5');

    await user.click(
      await screen.findByRole('button', { name: 'Churned in 12 months 3, show accounts' })
    );

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/customers/overview/?owner=5&drill=churned_12m'
      )
    );
  });

  it('opens the top-3 concentration as exactly those three accounts, client-side', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderCustomerOverview();

    await user.click(
      await screen.findByRole('button', { name: 'Top 3 concentration 55.5%, show accounts' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Shopify' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Stripe' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Uber' })).toBeInTheDocument();
    expect(within(dialog).getByText('25.4% of ARR')).toBeInTheDocument();
    expect(within(dialog).getByText('16.3% of ARR')).toBeInTheDocument();
    expect(within(dialog).getByText('13.8% of ARR')).toBeInTheDocument();
  });

  it('offers no top-3 drill when there is no share or no accounts to list', async () => {
    mockFetch({
      ...stats,
      concentration: { ...stats.concentration, rows: [], top_three_share: null },
    });
    renderCustomerOverview();

    // Wait for the figures to land, not just the label (drawn before them).
    await screen.findByText('69.2%');
    expect(screen.queryByRole('button', { name: /Top 3 concentration/ })).not.toBeInTheDocument();
  });

  it('offers no top-3 drill when a share comes with no rows behind it', async () => {
    mockFetch({
      ...stats,
      concentration: { ...stats.concentration, rows: [] },
    });
    renderCustomerOverview();

    // Wait for the figures to land, not just the label (drawn before them).
    await screen.findByText('69.2%');
    expect(screen.queryByRole('button', { name: /Top 3 concentration/ })).not.toBeInTheDocument();
  });

  it('does not make a button of the non-drillable KPIs', async () => {
    mockFetch();
    renderCustomerOverview();

    await screen.findAllByText('Customers');
    expect(screen.getByText('9').closest('button')).toBeNull();
    expect(screen.getByText('69.2%').closest('button')).toBeNull();
  });
});
