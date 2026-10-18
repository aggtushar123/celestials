import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import { LifecyclePage } from './LifecyclePage';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Integration tier (see the `testing` skill): a real Redux store (this
// page dispatches fetchCustomerStats, same thunk MetricsPanel already
// uses) plus the fetch boundary mocked — same convention as
// MetricsPanel.test.tsx/SettingsPage.test.tsx's own.

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
    ai_pulse_score: '',
    ai_pulse_reason: '',
    nps_score: null,
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
    ai_pulse_score: '',
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
    good: { count: 0, mrr: 0, arr: 0 },
    average: { count: 0, mrr: 0, arr: 0 },
    poor: { count: 0, mrr: 0, arr: 0 },
  },
  nps: { promoters: 0, passives: 0, detractors: 0, score: 0 },
  lifecycle: {
    onboarding: { count: 2, mrr: 1000, arr: 12000 },
    kickoff: { count: 1, mrr: 500, arr: 6000 },
    adoption: { count: 0, mrr: 0, arr: 0 },
    live: { count: 5, mrr: 20000, arr: 240000 },
    renewal: { count: 1, mrr: 3000, arr: 36000 },
    churn: { count: 1, mrr: 0, arr: 0 },
    expansion: { count: 1, mrr: 8000, arr: 96000 },
    other: { count: 0, mrr: 0, arr: 0 },
  },
};

const ACCOUNT_STATS = {
  health: {
    good: { count: 0, mrr: 0, arr: 0 },
    average: { count: 0, mrr: 0, arr: 0 },
    poor: { count: 0, mrr: 0, arr: 0 },
  },
  nps: { promoters: 0, passives: 0, detractors: 0, score: 0 },
  lifecycle: {
    onboarding: { count: 0, mrr: 0, arr: 0 },
    kickoff: { count: 0, mrr: 0, arr: 0 },
    adoption: { count: 0, mrr: 0, arr: 0 },
    live: { count: 9, mrr: 15000, arr: 180000 },
    renewal: { count: 0, mrr: 0, arr: 0 },
    churn: { count: 0, mrr: 0, arr: 0 },
    expansion: { count: 0, mrr: 0, arr: 0 },
    other: { count: 0, mrr: 0, arr: 0 },
  },
};

function renderPage() {
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
      <LifecyclePage />
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

describe('LifecyclePage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders real per-stage counts from the stats endpoint', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage();

    const onboardingCard = (await screen.findByText('Onboarding')).closest('button')!;
    expect(within(onboardingCard).getByText('2')).toBeInTheDocument();

    const liveCard = screen.getByText('Live').closest('button')!;
    expect(within(liveCard).getByText('5')).toBeInTheDocument();
  });

  it('shows an "excluded" caveat on MRR only, only for Organizations, when some customers lack a configured exchange rate', async () => {
    const statsWithUnconverted = { ...STATS, unconverted_count: 4 };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/customers/stats/')) return Promise.resolve(jsonResponse(200, statsWithUnconverted));
      if (url.includes('/accounts/stats/')) return Promise.resolve(jsonResponse(200, ACCOUNT_STATS));
      return Promise.resolve(jsonResponse(200, { count: 0, next: null, previous: null, results: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Onboarding');
    expect(screen.queryByText(/excluded/)).not.toBeInTheDocument(); // COUNT tab (default)

    await user.click(screen.getByRole('button', { name: /mrr/i }));
    expect(await screen.findByText(/4 organizations excluded/)).toBeInTheDocument();

    // Accounts has no currency of its own — AccountStats never carries
    // unconverted_count, so switching there never shows this caveat.
    await user.click(screen.getByRole('button', { name: /^accounts$/i }));
    expect(screen.queryByText(/excluded/)).not.toBeInTheDocument();
  });

  it('switching to MRR shows compact money values instead of counts', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Onboarding');
    await user.click(screen.getByRole('button', { name: /mrr/i }));

    const liveCard = screen.getByText('Live').closest('button')!;
    expect(within(liveCard).getByText('$20.0K')).toBeInTheDocument();
  });

  it('shows the real Expansion/Churn outcomes branching off Renewal', async () => {
    vi.stubGlobal('fetch', fetchMockWith([]));
    renderPage();

    expect(await screen.findByText('Expansion')).toBeInTheDocument();
    expect(screen.getByText('Churn')).toBeInTheDocument();
  });

  it('clicking a stage filters the organization table to just that stage', async () => {
    const customers = [
      customer({ id: 1, name: 'Globex', lifecycle_stage: 'live' }),
      customer({ id: 2, name: 'Initech', lifecycle_stage: 'onboarding' }),
    ];
    vi.stubGlobal('fetch', fetchMockWith(customers));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Globex');
    expect(screen.getByText('Initech')).toBeInTheDocument();

    // "Onboarding" appears twice — the funnel card label and Initech's
    // own stage badge in the table below; the funnel card is the first
    // and is a real <button>, the badge is a plain <span>.
    const onboardingCard = screen.getAllByText('Onboarding').map((el) => el.closest('button')).find(Boolean)!;
    await user.click(onboardingCard);

    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(screen.queryByText('Globex')).not.toBeInTheDocument();
    expect(screen.getByText('Clear filter')).toBeInTheDocument();

    await user.click(screen.getByText('Clear filter'));
    expect(await screen.findByText('Globex')).toBeInTheDocument();
  });

  it('switching to Accounts shows real account stats and an account table with a Company column', async () => {
    const accounts = [account({ id: 1, name: 'Globex EMEA', customers: [{ id: 1, name: 'Globex Corp' }], lifecycle_stage: 'live' })];
    vi.stubGlobal('fetch', fetchMockWith([], accounts));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Onboarding');
    await user.click(screen.getByRole('button', { name: /^accounts$/i }));

    const liveCard = (await screen.findAllByText('Live')).map((el) => el.closest('button')).find(Boolean)!;
    expect(within(liveCard).getByText('9')).toBeInTheDocument();

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
});
