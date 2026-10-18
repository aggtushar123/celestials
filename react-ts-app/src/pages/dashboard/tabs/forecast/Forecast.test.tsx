import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import forecastReducer from '../../../../features/forecast/forecastSlice';
import authReducer from '../../../../features/auth/authSlice';
import { AreaLayout } from '../../AreaLayout';
import { ForecastContainer } from '../ForecastContainer';
import { ControlsView } from './ControlsView';
import { DrillProvider } from '../../drill/DrillContext';
import { DrillPanel } from '../../drill/DrillPanel';
import { mockFetchRouted, drillResponse } from '../../drill/testDrill';

// Integration tier: container + view + charts through the real router, with
// only the fetch boundary mocked. The bridge is Recharts and needs a sized
// container jsdom won't give it, so it is asserted on through its own headline
// figures; the range, the table and the pipeline are plain DOM.

const stats = {
  horizon_days: 365,
  bridge: {
    opening_arr: 924_700,
    churn: 175_430,
    contraction: 33_120,
    expansion: 131_880,
    forecast_arr: 848_030,
    net_change: -76_670,
    nrr: 91.7,
  },
  scenarios: { worst: 150_200, likely: 848_030, best: 1_189_900 },
  pipeline: [
    { key: 'discovery', name: 'Discovery', open: 75_600, weighted: 7_560, count: 2 },
    { key: 'negotiation', name: 'Negotiation', open: 68_400, weighted: 54_720, count: 3 },
  ],
  swing: [
    {
      id: 14,
      name: 'Uber',
      owner: 'Carl CSM',
      arr: 95_000,
      renewal_date: '2027-01-10',
      days_to_renewal: 120,
      renews_in_horizon: true,
      risk: 0.6,
      factors: [
        { label: 'Poor health', points: 0.5 },
        { label: 'No contact in 95 days', points: 0.1 },
      ],
      churn_exposure: 57_000,
      risk_exposure: 0,
      downside: 57_000,
      expansion: 13_440,
      open_pipeline: 16_800,
      net: -43_560,
      health_category: 'poor' as const,
    },
    {
      id: 9,
      name: 'Shopify',
      owner: 'Carl CSM',
      arr: 175_000,
      renewal_date: '2027-05-15',
      days_to_renewal: 600,
      renews_in_horizon: false,
      risk: 0.05,
      factors: [{ label: 'Good health', points: 0.05 }],
      churn_exposure: 0,
      risk_exposure: 8_750,
      downside: 8_750,
      expansion: 31_080,
      open_pipeline: 38_850,
      net: 22_330,
      health_category: 'good' as const,
    },
  ],
  accounts: 12,
  renewing_count: 10,
  unpriced_count: 0,
  currency: 'USD' as const,
  filters: {
    owners: [{ value: '5', name: 'Carl CSM' }],
    lifecycles: [{ value: 'live', name: 'Live' }],
    customers: [{ value: '14', name: 'Uber' }],
  },
};

function mockFetch(body: unknown = stats, status = 200) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderForecast(url = '/dashboard/revenue/forecast') {
  // `auth` is here only so `useOrgCurrency` (read by the drill panel's row
  // list) has a slice to select from — its default state has no user, which
  // is exactly what falls back to 'USD', matching this file's fixtures.
  // `DrillProvider` + `DrillPanel` mirror DashboardFrame's real, app-wide
  // pairing so a click on a drillable Kpi or chart segment opens a real
  // dialog instead of throwing on a missing `useDrill()` provider.
  const store = configureStore({ reducer: { forecast: forecastReducer, auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <DrillProvider>
          <Routes>
            <Route path="/dashboard/revenue" element={<AreaLayout area="revenue" />}>
              <Route element={<ForecastContainer />}>
                <Route path="forecast" element={<ControlsView />} />
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

const tile = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe('Revenue Forecast', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the forecast on mount with an explicit horizon', async () => {
    // Always sent, so the number on screen and the window it covers can never
    // come from different requests.
    const fetchMock = mockFetch();
    renderForecast();

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('/customers/forecast/'));
    expect(lastUrl(fetchMock)).toContain('horizon_days=365');
  });

  it('leads with today, the forecast, and the gap between them', async () => {
    mockFetch();
    renderForecast();

    await screen.findByText('ARR today');
    expect(within(tile('ARR today')).getByText('$924.7K')).toBeInTheDocument();
    expect(within(tile('Forecast ARR')).getByText('$848.0K')).toBeInTheDocument();
    expect(within(tile('Forecast ARR')).getByText(/-\$76\.7K against today/)).toBeInTheDocument();
  });

  it('puts net revenue retention on the screen as its own number', async () => {
    mockFetch();
    renderForecast();

    await screen.findByText('Net revenue retention');
    expect(within(tile('Net revenue retention')).getByText('91.7%')).toBeInTheDocument();
  });

  it('shows a dash rather than a fake 100% when there is nothing to divide by', async () => {
    mockFetch({
      ...stats,
      accounts: 0,
      bridge: { ...stats.bridge, opening_arr: 0, forecast_arr: 0, net_change: 0, nrr: null },
    });
    renderForecast();

    await screen.findByText('Net revenue retention');
    expect(within(tile('Net revenue retention')).getByText('—')).toBeInTheDocument();
  });

  it('draws the bridge with the net change and NRR on it', async () => {
    mockFetch();
    renderForecast();

    expect(await screen.findByText('ARR bridge')).toBeInTheDocument();
    expect(screen.getByText('-$76.7K')).toBeInTheDocument();
    expect(screen.getByText('91.7% net revenue retention')).toBeInTheDocument();
  });

  it('presents the forecast as a range, not a single number', async () => {
    mockFetch();
    renderForecast();

    await screen.findByText('Forecast range');
    // The scale's far end is also $1.2M, so this reads the scenario figures.
    const scenarios = within(screen.getByLabelText('Scenarios'));
    expect(scenarios.getByText('$150.2K')).toBeInTheDocument();
    expect(scenarios.getByText('$1.2M')).toBeInTheDocument();
    // And each scenario against where the book stands today.
    expect(scenarios.getByText('16% of today')).toBeInTheDocument();
  });

  it('ranks the swing list by how far each account moves the number', async () => {
    mockFetch();
    renderForecast();

    const rows = (await screen.findAllByRole('row')).slice(1);

    expect(within(rows[0]).getByText('Uber')).toBeInTheDocument();
    expect(within(rows[0]).getByText('−$43,560.00')).toBeInTheDocument();
    expect(within(rows[1]).getByText('+$22,330.00')).toBeInTheDocument();
  });

  it('shows the reasons behind each risk, the same ones the Renewal tab prints', async () => {
    mockFetch();
    renderForecast();

    // "Uber" is also an option in the Account dropdown, so this takes the
    // table's own first row.
    const row = (await screen.findAllByRole('row'))[1];

    expect(within(row).getByText('Poor health · No contact in 95 days')).toBeInTheDocument();
    expect(within(row).getByText('60%')).toBeInTheDocument();
  });

  it('shows weighted pipeline against what is actually open', async () => {
    mockFetch();
    renderForecast();

    await screen.findByText('Expansion pipeline');
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText(/\$54\.7K of \$68\.4K · 3/)).toBeInTheDocument();
    // The totals line: what the forecast carries, of what exists.
    expect(screen.getByText('$62.3K of $144.0K')).toBeInTheDocument();
  });

  it('names accounts it had to leave out of the money', async () => {
    mockFetch({ ...stats, unpriced_count: 2 });
    renderForecast();

    expect(
      await screen.findByText(/2 accounts excluded from every figure below/)
    ).toBeInTheDocument();
  });

  // ── the bar ───────────────────────────────────────────────────────

  it('refetches when the horizon changes', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForecast();

    await screen.findByLabelText('Horizon');
    await user.selectOptions(screen.getByLabelText('Horizon'), '90');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('horizon_days=90'));
  });

  it('refetches when a filter changes, keeping the horizon', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForecast();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('owner=5'));
    expect(lastUrl(fetchMock)).toContain('horizon_days=365');
  });

  it('clears the filters without resetting the horizon', async () => {
    // The horizon is the window being asked about, not a filter on the book.
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForecast();

    await screen.findByLabelText('Horizon');
    await user.selectOptions(screen.getByLabelText('Horizon'), '730');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');
    await user.click(await screen.findByRole('button', { name: 'Clear 1' }));

    await waitFor(() => expect(lastUrl(fetchMock)).not.toContain('owner='));
    expect(lastUrl(fetchMock)).toContain('horizon_days=730');
  });

  it('sends the URL filters and the horizon to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);
    renderForecast('/dashboard/revenue/forecast?owner=5&horizon_days=90');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('owner=5');
    expect(url).toContain('horizon_days=90');
  });

  // ── failure and empty states ──────────────────────────────────────

  it('surfaces a failed fetch', async () => {
    mockFetch({ detail: 'Server exploded' }, 500);
    renderForecast();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not load/);
  });

  it('keeps the previous numbers when a refetch fails', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForecast();

    await screen.findByText('$924.7K');

    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Nope' }) })
    );
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');

    await screen.findByRole('alert');
    expect(screen.getByText('$924.7K')).toBeInTheDocument();
  });

  it('says the selection is empty rather than charting nothing', async () => {
    mockFetch({
      ...stats,
      accounts: 0,
      swing: [],
      pipeline: [],
      bridge: { ...stats.bridge, opening_arr: 0, forecast_arr: 0, net_change: 0, nrr: null },
    });
    renderForecast();

    expect(await screen.findByText('No accounts match these filters.')).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing in this selection moves the forecast/)
    ).toBeInTheDocument();
    expect(screen.getByText('No open opportunities in this selection.')).toBeInTheDocument();
  });
});

// ── drill (server) ──────────────────────────────────────────────────

describe('Revenue Forecast drill', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the at-risk drill against the server, carrying the horizon', async () => {
    const fetchMock = mockFetchRouted(stats, {
      at_risk: drillResponse(
        [{ id: 14, name: 'Uber', owner: 'Carl CSM', arr: 95_000, value: 57_000 }],
        'downside',
      ),
    });
    const user = userEvent.setup();
    renderForecast();

    await user.click(await screen.findByRole('button', { name: 'At risk $208.6K, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/customers/forecast/?horizon_days=365&drill=at_risk')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Uber' })).toBeInTheDocument();
    expect(within(dialog).getByText('$57.0K downside')).toBeInTheDocument();
  });

  it('carries the current filters into the at-risk drill request', async () => {
    const fetchMock = mockFetchRouted(stats, { at_risk: drillResponse([], 'downside') });
    const user = userEvent.setup();
    renderForecast('/dashboard/revenue/forecast?owner=5');

    await user.click(await screen.findByRole('button', { name: 'At risk $208.6K, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/customers/forecast/?owner=5&horizon_days=365&drill=at_risk'
      )
    );
  });

  it('drills into the Churn bar of the ARR bridge', async () => {
    const fetchMock = mockFetchRouted(stats, {
      churn: drillResponse(
        [{ id: 21, name: 'WeWork', owner: null, arr: 24_000, value: 24_000 }],
        'downside',
      ),
    });
    const user = userEvent.setup();
    renderForecast();

    await user.click(await screen.findByRole('button', { name: 'Churn $175.4K, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/customers/forecast/?horizon_days=365&drill=churn')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'WeWork' })).toBeInTheDocument();
    expect(within(dialog).getByText('$24.0K downside')).toBeInTheDocument();
  });

  it('drills into the Contraction bar of the ARR bridge', async () => {
    const fetchMock = mockFetchRouted(stats, {
      contraction: drillResponse(
        [{ id: 9, name: 'Shopify', owner: 'Carl CSM', arr: 175_000, value: 8_750 }],
        'downside',
      ),
    });
    const user = userEvent.setup();
    renderForecast();

    await user.click(await screen.findByRole('button', { name: 'Contraction $33.1K, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/customers/forecast/?horizon_days=365&drill=contraction'
      )
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Shopify' })).toBeInTheDocument();
    expect(within(dialog).getByText('$8.8K downside')).toBeInTheDocument();
  });

  it('drills into the Expansion bar of the ARR bridge', async () => {
    const fetchMock = mockFetchRouted(stats, {
      expansion: drillResponse(
        [{ id: 9, name: 'Shopify', owner: 'Carl CSM', arr: 175_000, value: 31_080 }],
        'expected expansion',
      ),
    });
    const user = userEvent.setup();
    renderForecast();

    await user.click(await screen.findByRole('button', { name: 'Expansion $131.9K, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/customers/forecast/?horizon_days=365&drill=expansion'
      )
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Shopify' })).toBeInTheDocument();
    expect(within(dialog).getByText('$31.1K expected expansion')).toBeInTheDocument();
  });

  it('offers no server drill while a refetch is pending with the old figures on screen', async () => {
    // The first answer lands; the one after a filter change never does. The
    // old figures stay up (dimmed), but a drill now would send the NEW query
    // and list accounts under the OLD figure, so nothing is a button.
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;
        if (calls > 1) return new Promise(() => {});
        return Promise.resolve({ ok: true, status: 200, json: async () => stats });
      }),
    );
    const user = userEvent.setup();
    renderForecast();

    await screen.findByRole('button', { name: 'At risk $208.6K, show accounts' });
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');

    await waitFor(() => expect(calls).toBeGreaterThan(1));
    expect(screen.getByText('$208.6K')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /At risk/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Churn/ })).not.toBeInTheDocument();
  });

  it('does not offer a drill from the Opening or Forecast bars', async () => {
    mockFetchRouted(stats, {});
    renderForecast();

    await screen.findByText('ARR bridge');
    expect(screen.queryByRole('button', { name: /^Opening/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Forecast \$/ })).not.toBeInTheDocument();
  });

  it('does not make a button of the non-drillable KPIs', async () => {
    mockFetchRouted(stats, {});
    renderForecast();

    await screen.findByText('ARR today');
    expect(screen.getByText('$924.7K').closest('button')).toBeNull();
    expect(within(tile('Forecast ARR')).getByText('$848.0K').closest('button')).toBeNull();
    expect(screen.getByText('91.7%').closest('button')).toBeNull();
  });
});
