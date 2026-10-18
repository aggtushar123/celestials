import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { SettingsPage } from './SettingsPage';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Custom Objects (see the describe block near the bottom of this file)
// is the one sub-tab whose real content (CustomObjectsPage) reads
// state.auth.user for its own admin gate — same convention as
// WebhooksPage.test.tsx's own makeStore/renderPage. Every other
// sub-tab here talks to apiFetch directly with no store at all (see
// this file's own original comment above), so only that one describe
// block wraps in a real Provider.
// The global configuration card refreshes the profile when it opens; mocks
// answer /auth/me/ with whatever user the store was built with.
let currentStore: ReturnType<typeof configureStore> | null = null;

function renderSettingsPageAsAdmin() {
  const store = configureStore({
    reducer: { auth: authReducer },
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
  currentStore = store;
  render(
    <Provider store={store}>
      <SettingsPage />
    </Provider>
  );
}

// Integration tier (see the `testing` skill): no store needed at all —
// this page talks to apiFetch directly (there's no dedicated "walk
// every page of customers" thunk in customersSlice, see SettingsPage's
// own docstring on why), so only the fetch boundary needs mocking.
// Two customers, one with domain/renewal_date/churn_reason filled in
// and one without, pins down the real Usage% math (50%, not a
// fabricated per-row number the old mock had).
const filledOrg = {
  id: 1,
  name: 'Globex Corp',
  address: 'Chicago, IL',
  domain: 'globex.com',
  email: 'contact@globex.com',
  phone: '+1 555 0100',
  owner: { id: 1, name: 'Alice', email: 'alice@acme.io', avatar: '', role: 'admin', organisation: { id: 1, name: 'Acme', slug: 'acme' }, is_active: true },
  created_by: null,
  modified_by: null,
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  lifecycle_stage: 'live',
  health_score: '8.0',
  health_category: 'good',
  pulse: [1, 1, 1, 0, 0],
  ai_pulse_score: 'satisfied',
  ai_pulse_reason: 'Steady usage.',
  nps_score: 40,
  csat_score: '80.00',
  joined_date: '2024-01-01',
  renewal_date: '2026-01-01',
  contract_start_date: '2024-01-01',
  contract_end_date: '2026-01-01',
  arr_billed_at_account: '60000.00',
  arr_billed_at_hq: '60000.00',
  implementation_fee: '10000.00',
  total_contract_value: '70000.00',
  total_forecasted_renewal_revenue: '73500.00',
  primary_product: 1,
  primary_product_name: 'Product A',
  additional_products_count: 2,
  top_source_channel: 'Direct Sales',
  total_contracted_seats: 100,
  total_active_seats: 80,
  seat_utilization_percentage: 80,
  total_hires: 10,
  scope_web_app: 'Full',
  ces_percentage: '90.00',
  churn_date: null,
  churn_reason: '' as const,
  churn_reason_display: '',
  churn_comment: '',
  is_archived: false,
};

const blankOrg = {
  ...filledOrg,
  id: 2,
  name: 'Initech',
  domain: '',
  owner: null,
  renewal_date: null,
  arr_billed_at_account: '0.00',
  nps_score: null,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('SettingsPage — Data tab, Organization sub-tab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches every organization and renders real Custom/System attribute sections', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsPageAsAdmin();

    expect(await screen.findByRole('region', { name: 'Custom attributes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Attributes' })).toHaveClass('text-[22px]', 'font-semibold');
    expect(screen.getByRole('region', { name: 'System attributes' })).toBeInTheDocument();
    // Real field names/counts, not the old mock's fabricated ones.
    expect(screen.queryByText('Starting SaaS MRR')).not.toBeInTheDocument();
    expect(screen.getByText('lifecycle_stage')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/customers/'), expect.anything());
  });

  it('puts Global configuration in a section after the tab panel, not in a side rail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] }))));
    renderSettingsPageAsAdmin();
    await screen.findByRole('region', { name: 'Custom attributes' });
    const form = screen.getByRole('form', { name: 'Global configuration' });
    expect(form).not.toHaveClass('md:w-[320px]');
    const panel = screen.getByRole('tabpanel');
    expect(panel.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(form).getByRole('region', { name: 'Global configuration' })).toBeInTheDocument();
  });

  it('switches attribute sets with tabs directly under the heading, one tab row only', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(jsonResponse(200, /\/(opportunities|risks)\//.test(String(url)) ? [] : { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] }))));
    renderSettingsPageAsAdmin();
    const tabs = screen.getByRole('tablist', { name: 'Attribute sets' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Organization', 'Account', 'Contact', 'Pipeline', 'Custom objects']);
    expect(within(tabs).getByRole('tab', { name: 'Organization' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(tabs).getByRole('tab', { name: 'Organization' }).id);
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Pipeline' }));
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Pipeline records' })).toBeInTheDocument();
  });

  it('draws attribute rows on the grid: the API name as code, a neutral Required badge, no dead controls', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] }))));
    renderSettingsPageAsAdmin();
    const system = await screen.findByRole('region', { name: 'System attributes' });
    const list = within(system).getByRole('list', { name: 'System attributes' });
    const row = within(list).getAllByRole('listitem')[0];
    expect(row).toHaveClass('@min-[40rem]:grid', '@min-[40rem]:grid-cols-[minmax(14rem,1fr)_7rem_6rem_8rem]');
    expect(row.querySelector('.font-mono-brand')).not.toBeNull();
    expect(within(system).queryAllByText('Visible')).toEqual([]);
    expect(within(system).queryAllByText('UI Editable')).toEqual([]);
    for (const required of within(system).queryAllByText('Required', { selector: 'span.rounded-full' })) expect(required).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(row.querySelector('button')).toBeNull();
  });

  it('walks every page of /customers/ via `next`, not just the first', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/customers/')) {
        return Promise.resolve(
          jsonResponse(200, {
            count: 2,
            next: 'http://localhost:8000/api/v1/customers/?page=2',
            previous: null,
            results: [filledOrg],
          })
        );
      }
      return Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [blankOrg] })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsPageAsAdmin();
    await screen.findByRole('region', { name: 'Custom attributes' });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/customers/?page=2',
        expect.anything()
      )
    );
  });

  it('computes a real Usage% from the fetched organizations, not a fabricated one', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsPageAsAdmin();
    await screen.findByText('Domain');

    // Domain: filledOrg has one, blankOrg's is '' -- 1 of 2 = 50%.
    const domainRow = screen.getByText('Domain').closest('li')!;
    expect(domainRow.textContent).toContain('50%');

    // Name: both set -- 2 of 2 = 100%. ("Name" also matches each
    // section's own column header <th> -- the attribute row's own is
    // the <span>.)
    const nameCell = screen.getAllByText('Name').find((el) => el.closest('li') !== null)!;
    expect(nameCell.closest('li')!.textContent).toContain('100%');
  });

  it('shows the backend error message instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))));

    renderSettingsPageAsAdmin();

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('searching filters the attribute list by display name or field name', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(200, { count: 1, next: null, previous: null, results: [filledOrg] }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await screen.findByRole('region', { name: 'Custom attributes' });
    expect(screen.getByText('Lifecycle Stage')).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: /Search \d+ organization attributes/ }),
      'lifecycle'
    );

    expect(screen.queryByText('Domain')).not.toBeInTheDocument();
    expect(screen.getByText('Lifecycle Stage')).toBeInTheDocument();
  });

  it('resets the attribute filters when the sub-tab changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
        return Promise.resolve(jsonResponse(200, { count: 1, next: null, previous: null, results: [filledOrg] }));
      }),
    );
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await screen.findByRole('region', { name: 'Custom attributes' });
    await user.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Date' }));
    expect(screen.getByRole('button', { name: 'Filter attributes, 1 active' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Account' }));
    expect(await screen.findByRole('button', { name: 'Filter attributes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter attributes, 1 active' })).toBeNull();
  });

  it('switching to Custom Objects shows the real page, not the table', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.includes('/custom-objects/definitions/')) return Promise.resolve(jsonResponse(200, []));
      return Promise.resolve(jsonResponse(200, { count: 0, next: null, previous: null, results: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await screen.findByRole('region', { name: 'Custom attributes' });

    await user.click(screen.getByRole('tab', { name: 'Custom objects' }));

    expect(screen.queryByRole('region', { name: 'Custom attributes' })).not.toBeInTheDocument();
    expect(await screen.findByText('No custom objects yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New object' })).toBeInTheDocument();
  });
});

// Minimal but real shape, matching revenact-backend's AccountSerializer
// — see docs/API_CONTRACTS.md -> customers -> Account.
const filledAccount = {
  id: 1,
  customers: [{ id: 6, name: 'Apple Inc' }],
  name: 'North America Enterprise',
  domain: 'na.acme.com',
  address: 'Austin, TX',
  email: 'na@acme.com',
  phone: '+1 555 0100',
  owner: { id: 1, name: 'Alice', email: 'alice@acme.io', avatar: '', role: 'admin', organisation: { id: 1, name: 'Acme', slug: 'acme' }, is_active: true },
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  lifecycle_stage: 'live',
  health_score: '9.5',
  health_category: 'good',
  pulse: [1, 1, 1, 1, 0],
  ai_pulse_score: 'very_satisfied',
  ai_pulse_reason: 'Strong engagement.',
  nps_score: 100,
  csat_score: '100.00',
  renewal_date: '2026-03-02',
  arr: '33600.00',
};

const blankAccount = {
  ...filledAccount,
  id: 2,
  name: 'EMEA',
  domain: '',
  owner: null,
  renewal_date: null,
  arr: '0.00',
};

describe('SettingsPage — Data tab, Account sub-tab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches every account and renders real Custom/System attribute sections', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [filledAccount, blankAccount] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Account' }));

    expect(await screen.findByRole('region', { name: 'Custom attributes' })).toBeInTheDocument();
    expect(screen.getByText('lifecycle_stage')).toBeInTheDocument();
    // Account's own "Organizations" (customers) field, System not
    // Custom -- no current form actually sends customer_ids.
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/accounts/'), expect.anything());
  });

  it('walks every page of /accounts/ via `next`, not just the first', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/accounts/')) {
        return Promise.resolve(
          jsonResponse(200, {
            count: 2,
            next: 'http://localhost:8000/api/v1/accounts/?page=2',
            previous: null,
            results: [filledAccount],
          })
        );
      }
      return Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [blankAccount] })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Account' }));
    await screen.findByRole('region', { name: 'Custom attributes' });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/accounts/?page=2',
        expect.anything()
      )
    );
  });

  it('computes a real Usage% from the fetched accounts, not a fabricated one', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [filledAccount, blankAccount] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Account' }));
    await screen.findByText('Domain');

    // Domain: filledAccount has one, blankAccount's is '' -- 1 of 2 = 50%.
    const domainRow = screen.getByText('Domain').closest('li')!;
    expect(domainRow.textContent).toContain('50%');

    // Name: both set -- 2 of 2 = 100%.
    const nameCell = screen.getAllByText('Name').find((el) => el.closest('li') !== null)!;
    expect(nameCell.closest('li')!.textContent).toContain('100%');
  });

  it('shows the backend error message instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))));
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Account' }));

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('searching filters the attribute list by display name or field name', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(200, { count: 1, next: null, previous: null, results: [filledAccount] }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Account' }));
    await screen.findByRole('region', { name: 'Custom attributes' });
    expect(screen.getByText('Lifecycle Stage')).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: /Search \d+ account attributes/ }),
      'lifecycle'
    );

    expect(screen.queryByText('Domain')).not.toBeInTheDocument();
    expect(screen.getByText('Lifecycle Stage')).toBeInTheDocument();
  });
});

// Minimal but real shape, matching revenact-backend's ContactSerializer
// — see docs/API_CONTRACTS.md -> customers -> Contact.
const filledContact = {
  id: 1,
  name: 'Sarah Chen',
  role: 'executive_sponsor',
  role_display: 'Executive Sponsor',
  email: 'sarah.chen@acme.io',
  phone: '+1 555 0100',
  status: 'active',
  sentiment: 'positive',
  last_contacted_at: '2026-08-31T00:00:00Z',
  companies: [{ id: 6, name: 'Apple Inc' }],
  account_name: null,
  sentiment_source: 'manual' as const, sentiment_computed_at: null,
};

const blankContact = {
  ...filledContact,
  id: 2,
  name: 'James Wilson',
  phone: '',
  last_contacted_at: null,
};

describe('SettingsPage — Data tab, Contact sub-tab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches every contact and renders real Custom/System attribute sections', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [filledContact, blankContact] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Contact' }));

    expect(await screen.findByRole('region', { name: 'Custom attributes' })).toBeInTheDocument();
    expect(screen.getByText('sentiment')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/contacts/'), expect.anything());
  });

  it('walks every page of /contacts/ via `next`, not just the first', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/contacts/')) {
        return Promise.resolve(
          jsonResponse(200, {
            count: 2,
            next: 'http://localhost:8000/api/v1/contacts/?page=2',
            previous: null,
            results: [filledContact],
          })
        );
      }
      return Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [blankContact] })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Contact' }));
    await screen.findByRole('region', { name: 'Custom attributes' });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/contacts/?page=2',
        expect.anything()
      )
    );
  });

  it('computes a real Usage% from the fetched contacts, not a fabricated one', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [filledContact, blankContact] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Contact' }));
    await screen.findByText('Phone');

    // Phone: filledContact has one, blankContact's is '' -- 1 of 2 = 50%.
    const phoneRow = screen.getByText('Phone').closest('li')!;
    expect(phoneRow.textContent).toContain('50%');

    // Name: both set -- 2 of 2 = 100%.
    const nameCell = screen.getAllByText('Name').find((el) => el.closest('li') !== null)!;
    expect(nameCell.closest('li')!.textContent).toContain('100%');
  });

  it('shows the backend error message instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))));
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Contact' }));

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('searching filters the attribute list by display name or field name', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(200, { count: 1, next: null, previous: null, results: [filledContact] }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Contact' }));
    await screen.findByRole('region', { name: 'Custom attributes' });
    expect(screen.getByText('Sentiment')).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: /Search \d+ contact attributes/ }),
      'sentiment'
    );

    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.getByText('Sentiment')).toBeInTheDocument();
  });
});

// Minimal but real shape, matching revenact-backend's Opportunity/Risk
// serializers — see docs/API_CONTRACTS.md -> customers -> Opportunity/
// Risk. Unlike Organization/Account/Contact, /opportunities/ and
// /risks/ return a plain array, not a paginated envelope (see
// OpportunityListView/RiskListView's own docstrings) — no `next` to
// walk here.
const filledOpportunity = {
  id: 1,
  title: 'Renewal Expansion',
  mrr: '30000.00',
  stage: 'qualification',
  stage_display: 'Qualification',
  priority: 'high',
  priority_display: 'High',
  department: '' as const, department_display: '',
  companies: [{ id: 6, name: 'Apple Inc' }],
  account_name: null,
};

const blankOpportunity = {
  ...filledOpportunity,
  id: 2,
  title: 'Seat Expansion',
  mrr: '0.00',
  account_name: 'North America',
};

const filledRisk = {
  id: 1,
  title: 'Contract Expiry Risk',
  mrr: '8500.00',
  stage: 'open',
  stage_display: 'Open',
  priority: 'high',
  priority_display: 'High',
  department: '' as const, department_display: '',
  companies: [{ id: 6, name: 'Apple Inc' }],
  account_name: null,
};

describe('SettingsPage — Data tab, Pipeline sub-tab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to Opportunities and fetches the real, unpaginated endpoint', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/opportunities/')) {
        return Promise.resolve(jsonResponse(200, [filledOpportunity, blankOpportunity]));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Pipeline' }));

    expect(await screen.findByRole('region', { name: 'Custom attributes' })).toBeInTheDocument();
    expect(screen.getByText('stage_display')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/opportunities/'), expect.anything());
  });

  it('switching to the Risks toggle fetches /risks/ and shows its own attributes', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/risks/')) return Promise.resolve(jsonResponse(200, [filledRisk]));
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Pipeline' }));
    await screen.findByRole('region', { name: 'Custom attributes' });

    await user.click(screen.getByRole('button', { name: 'Risks' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/risks/'), expect.anything())
    );
    expect(screen.getByRole('searchbox', { name: 'Search 9 risk attributes' })).toBeInTheDocument();
  });

  it('computes a real Usage% from the fetched opportunities, not a fabricated one', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/opportunities/')) {
        return Promise.resolve(jsonResponse(200, [filledOpportunity, blankOpportunity]));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Pipeline' }));
    await screen.findByText('MRR');

    // MRR: filledOpportunity has one, blankOpportunity's is '0.00' -- 1 of 2 = 50%.
    const mrrRow = screen.getByText('MRR').closest('li')!;
    expect(mrrRow.textContent).toContain('50%');

    // Title: both set -- 2 of 2 = 100%.
    const titleRow = screen.getByText('Title').closest('li')!;
    expect(titleRow.textContent).toContain('100%');
  });

  it('shows the backend error message instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))));
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Pipeline' }));

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('searching filters the attribute list by display name or field name', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
      if (url.endsWith('/opportunities/')) return Promise.resolve(jsonResponse(200, [filledOpportunity]));
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await user.click(screen.getByRole('tab', { name: 'Pipeline' }));
    await screen.findByRole('region', { name: 'Custom attributes' });
    expect(screen.getByText('Priority')).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: /Search \d+ opportunity attributes/ }),
      'priority'
    );

    expect(screen.queryByText('Stage')).not.toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
  });
});
