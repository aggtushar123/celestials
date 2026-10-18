import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import { MemoryRouter } from 'react-router-dom';
import { HealthDistribution } from './HealthDistribution';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Integration tier (see the `testing` skill): a real Redux store (this
// page dispatches fetchCustomerStats, same thunk MetricsPanel/
// LifecyclePage already use) plus the fetch boundary mocked — same
// convention as those tests' own.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function customer(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: 'Globex Corp',
    address: '',
    domain: '',
    email: '',
    phone: '',
    owner: null,
    created_by: null,
    modified_by: null,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    lifecycle_stage: 'live',
    health_score: '8.0',
    health_category: 'good',
    pulse: [],
    ai_pulse_score: 'satisfied',
    ai_pulse_reason: '',
    nps_score: 20,
    csat_score: null,
    joined_date: null,
    renewal_date: null,
    contract_start_date: null,
    contract_end_date: null,
    currency: 'USD',
    currency_display: 'US Dollar ($)',
    arr_billed_at_account: '0.00',
    arr_billed_at_hq: '0.00',
    implementation_fee: '0.00',
    total_contract_value: '0.00',
    total_forecasted_renewal_revenue: '0.00',
    primary_product: null,
  primary_product_name: '',
    additional_products_count: null,
    top_source_channel: '',
    total_contracted_seats: null,
    total_active_seats: null,
    seat_utilization_percentage: null,
    total_hires: null,
    scope_web_app: '',
    ces_percentage: null,
    churn_date: null,
    churn_reason: '' as const,
    churn_comment: '',
    is_archived: false,
    ...overrides,
  };
}

function account(overrides: Record<string, unknown>) {
  return {
    id: 1,
    customers: [{ id: 1, name: 'Globex Corp' }],
    name: 'Globex EMEA',
    domain: '',
    address: '',
    email: '',
    phone: '',
    owner: null,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    lifecycle_stage: 'live',
    health_score: '8.0',
    health_category: 'good',
    pulse: [],
    ai_pulse_score: 'satisfied',
    ai_pulse_reason: '',
    nps_score: null,
    csat_score: null,
    renewal_date: null,
    arr: '0',
    ...overrides,
  };
}

const STATS = {
  health: {
    good: { count: 5, mrr: 20000, arr: 240000 },
    average: { count: 2, mrr: 5000, arr: 60000 },
    poor: { count: 1, mrr: 500, arr: 6000 },
  },
  nps: { promoters: 4, passives: 1, detractors: 2, score: 25 },
  lifecycle: Object.fromEntries(
    ['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other'].map((s) => [
      s,
      { count: 0, mrr: 0, arr: 0 },
    ])
  ),
};

const ACCOUNT_STATS = {
  health: {
    good: { count: 1, mrr: 0, arr: 0 },
    average: { count: 0, mrr: 0, arr: 0 },
    poor: { count: 3, mrr: 0, arr: 0 },
  },
  nps: { promoters: 0, passives: 0, detractors: 0, score: 0 },
  lifecycle: Object.fromEntries(
    ['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other'].map((s) => [
      s,
      { count: 0, mrr: 0, arr: 0 },
    ])
  ),
};

function renderPage(url = '/dashboard/health/distribution') {
  const store = configureStore({
    reducer: { customers: customersReducer, auth: authReducer },
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
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
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
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <HealthDistribution />
      </MemoryRouter>
    </Provider>
  );
}

function fetchMockWith(customers: unknown[], accounts: unknown[] = []) {
  return vi.fn((url: string) => {
    if (url.includes('/customers/stats/')) return Promise.resolve(jsonResponse(200, STATS));
    if (url.includes('/accounts/stats/')) return Promise.resolve(jsonResponse(200, ACCOUNT_STATS));
    if (url.includes('/accounts/')) {
      return Promise.resolve(jsonResponse(200, { count: accounts.length, next: null, previous: null, results: accounts }));
    }
    if (url.includes('/customers/')) {
      return Promise.resolve(jsonResponse(200, { count: customers.length, next: null, previous: null, results: customers }));
    }
    return Promise.resolve(jsonResponse(404, {}));
  });
}

describe('HealthDistribution', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders real per-category counts from the stats endpoint', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage();

    const goodCard = (await screen.findByText('Good')).closest('button')!;
    expect(within(goodCard).getByText('5')).toBeInTheDocument();

    const poorCard = screen.getByText('Poor').closest('button')!;
    expect(within(poorCard).getByText('1')).toBeInTheDocument();
  });

  it('switching to MRR shows compact money values instead of counts', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Good');
    await user.click(screen.getByRole('button', { name: /mrr/i }));

    const goodCard = screen.getByText('Good').closest('button')!;
    expect(within(goodCard).getByText('$20.0K')).toBeInTheDocument();
  });

  it('shows an "excluded" caveat on MRR only, only for Organizations, when some customers lack a configured exchange rate', async () => {
    const statsWithUnconverted = { ...STATS, unconverted_count: 3 };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/customers/stats/')) return Promise.resolve(jsonResponse(200, statsWithUnconverted));
      if (url.includes('/accounts/stats/')) return Promise.resolve(jsonResponse(200, ACCOUNT_STATS));
      if (url.includes('/accounts/')) return Promise.resolve(jsonResponse(200, { count: 0, next: null, previous: null, results: [] }));
      return Promise.resolve(jsonResponse(200, { count: 0, next: null, previous: null, results: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Good');
    expect(screen.queryByText(/excluded/)).not.toBeInTheDocument(); // COUNT tab (default)

    await user.click(screen.getByRole('button', { name: /mrr/i }));
    expect(await screen.findByText(/3 organizations excluded/)).toBeInTheDocument();

    // Accounts has no currency of its own — AccountStats never carries
    // unconverted_count, so switching there never shows this caveat.
    await user.click(screen.getByRole('button', { name: /^accounts$/i }));
    expect(screen.queryByText(/excluded/)).not.toBeInTheDocument();
  });

  it('renders the real NPS breakdown', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage();

    expect(await screen.findByText('+25')).toBeInTheDocument();
    expect(screen.getByText(/4 Promoters/)).toBeInTheDocument();
    expect(screen.getByText(/2 Detractors/)).toBeInTheDocument();
  });

  it('renders real AI Pulse counts derived from the fetched organizations', async () => {
    const customers = [
      customer({ id: 1, name: 'Globex', ai_pulse_score: 'satisfied' }),
      customer({ id: 2, name: 'Initech', ai_pulse_score: 'high_risk' }),
    ];
    vi.stubGlobal('fetch', fetchMockWith(customers));
    renderPage();

    expect(await screen.findByText('Satisfied · 1')).toBeInTheDocument();
    expect(screen.getByText('High Risk · 1')).toBeInTheDocument();
    expect(screen.getByText('Very Satisfied · 0')).toBeInTheDocument();
  });

  it('clicking a health category filters the organization table to just that category', async () => {
    const customers = [
      customer({ id: 1, name: 'Globex', health_category: 'good' }),
      customer({ id: 2, name: 'Initech', health_category: 'poor' }),
    ];
    vi.stubGlobal('fetch', fetchMockWith(customers));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Globex');
    expect(screen.getByText('Initech')).toBeInTheDocument();

    const poorCard = screen.getAllByText('Poor').map((el) => el.closest('button')).find(Boolean)!;
    await user.click(poorCard);

    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(screen.queryByText('Globex')).not.toBeInTheDocument();

    await user.click(screen.getByText('Clear filter'));
    expect(await screen.findByText('Globex')).toBeInTheDocument();
  });

  it('switching to Accounts shows real account stats and an account table with a Company column', async () => {
    const accounts = [account({ id: 1, name: 'Globex EMEA', customers: [{ id: 1, name: 'Globex Corp' }], health_category: 'poor' })];
    vi.stubGlobal('fetch', fetchMockWith([], accounts));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Good');
    await user.click(screen.getByRole('button', { name: /^accounts$/i }));

    const poorCard = await screen.findByText('Poor');
    expect(within(poorCard.closest('button')!).getByText('3')).toBeInTheDocument();

    expect(await screen.findByText('Globex EMEA')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Globex Corp')).toBeInTheDocument();
  });

  it('surfaces a stats fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/customers/stats/')) return Promise.resolve(jsonResponse(500, { detail: 'Server error.' }));
        return Promise.resolve(jsonResponse(200, { count: 0, next: null, previous: null, results: [] }));
      })
    );
    renderPage();

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('warns that a shared filter is on, since /customers/stats/ and /accounts/stats/ can\'t honour it', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage('/dashboard/health/distribution?owner=1');

    expect(await screen.findByText(
      'Covers the whole book; the filters above do not apply to this section.'
    )).toBeInTheDocument();
  });

  it('says nothing when no shared filter is on', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage('/dashboard/health/distribution');

    await screen.findByText('Good'); // wait for the section to render
    expect(
      screen.queryByText('Covers the whole book; the filters above do not apply to this section.')
    ).not.toBeInTheDocument();
  });

  it('draws no share bar for an empty category, and writes a zero MRR as "$0"', async () => {
    vi.stubGlobal('fetch', fetchMockWith([], []));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Good');
    await user.click(screen.getByRole('button', { name: /^accounts$/i }));
    // Accounts: 1 Good, 0 Average, 3 Poor.
    const averageCard = (await screen.findByText('Average')).closest('button')!;
    await within(averageCard).findByText('0');
    expect(within(averageCard).getByTestId('health-share-bar')).toHaveStyle({ width: '0%' });
    const goodCard = screen.getByText('Good').closest('button')!;
    expect(within(goodCard).getByTestId('health-share-bar')).toHaveStyle({ width: '33%' });

    await user.click(screen.getByRole('button', { name: /mrr/i }));
    expect(within(averageCard).getByText('$0')).toBeInTheDocument();
  });

  it('lays the three tiles out in a grid that stacks on a phone', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage();
    const grid = (await screen.findByText('Good')).closest('button')!.parentElement!;
    expect(grid.className).toMatch(/\bgrid\b/);
    expect(grid.className).toContain('sm:grid-cols-3');
  });

  it('scrolls the table inside its card, header pinned on an opaque surface', async () => {
    vi.stubGlobal('fetch', fetchMockWith([customer({ id: 1, name: 'Globex' })]));
    renderPage();

    await screen.findByText('Globex');
    const region = screen.getByRole('region', { name: /organizations/i });
    expect(region).toHaveStyle({ maxHeight: '520px' });
    expect(region.className).toContain('overflow-auto');
    // The header row itself no longer carries a translucent sticky band;
    // ScrollTable pins each th on bg-surface instead.
    const headerRow = within(region).getAllByRole('row')[0];
    expect(headerRow.className).not.toContain('sticky');
    expect(headerRow.className).not.toContain('bg-subtle/40');
  });
});
