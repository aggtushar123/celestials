import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fetchContactsForCustomer } from '../../features/customers/customersSlice';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { makeDetailStore } from '../../pages/organizations/testDetail';
import { ContactsTab } from './ContactsTab';

// These tests pinned the organization page's People tab while it rendered
// this shared tab (delivery 1). Delivery 2 gives that page its own list; the
// account page still renders ContactsTab, so they stay here, on a harness
// that reads one organization's contacts the way the old People tab did.
function Harness({ customerId }: { customerId: number }) {
  const dispatch = useAppDispatch();
  const { contacts, contactsLoading, contactsError } = useAppSelector((state) => state.customers);
  useEffect(() => {
    dispatch(fetchContactsForCustomer(customerId));
  }, [dispatch, customerId]);
  return <ContactsTab contacts={contacts} isLoading={contactsLoading} error={contactsError} customerId={customerId} />;
}

function renderPeople() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <Harness customerId={10} />
      </MemoryRouter>
    </Provider>,
  );
}


// Minimal but real shape, matching revenact-backend's CustomerSerializer —
// see customersSlice.test.ts / docs/API_CONTRACTS.md -> customers.
const globex = {
  id: 10,
  name: 'Globex Corp',
  address: '123 Main St',
  domain: 'globex.example',
  owner: null,
  created_by: null,
  modified_by: null,
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  lifecycle_stage: 'onboarding' as const,
  health_score: '5.0',
  health_category: 'average' as const,
  pulse: [],
  ai_pulse_score: '' as const,
  ai_pulse_reason: '',
  account_pulse: {
    value: '2.3',
    label: 'At risk' as const,
    category: 2 as const,
    breakdown: [
      { key: 'ai_pulse' as const, label: 'AI pulse', weight: '3.0', reading: '2.0', note: 'what the model reads' },
      { key: 'csm_pulse' as const, label: 'CSM pulse', weight: '2.5', reading: null, note: 'not set' },
      { key: 'sentiment' as const, label: 'Recent sentiment', weight: '2.0', reading: '3.0', note: '1 positive, 1 negative of 2 in the last 30 days' },
      { key: 'touch' as const, label: 'Last contact', weight: '1.5', reading: '4.8', note: '4 days ago' },
      { key: 'support' as const, label: 'Open tickets', weight: '1.0', reading: '1.0', note: '12 open' },
    ],
  },
  nps_score: null,
  csat_score: null,
  joined_date: null,
  renewal_date: null,
  contract_start_date: null,
  contract_end_date: null,
  currency: 'USD' as const,
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
  churn_reason_display: '',
  churn_comment: '',
  is_archived: false,
};

describe('People tab (the Contacts tab inside the organization page)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and renders this organization\'s own real contacts on the Contacts tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/contacts/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [
              {
                id: 1,
                name: 'Sarah Chen',
                role: 'executive_sponsor',
                role_display: 'Executive Sponsor',
                email: 'sarah.chen@globex.example',
                phone: '+1 (408) 555-0123',
                status: 'active',
                sentiment: 'positive',
                last_contacted_at: '2026-08-31T00:00:00Z',
                companies: [{ id: 10, name: 'Globex Corp' }],
                account_name: null,
                sentiment_source: 'manual' as const, sentiment_computed_at: null,
              },
            ],
          });
        }
        const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      })
    );

    renderPeople();

    expect(await screen.findByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('Executive Sponsor')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/customers/10/contacts/'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  describe('Contacts tab search/Add/Edit/Delete', () => {
    const sarahChen = {
      id: 1,
      name: 'Sarah Chen',
      role: 'executive_sponsor',
      role_display: 'Executive Sponsor',
      email: 'sarah.chen@globex.example',
      phone: '+1 (408) 555-0123',
      status: 'active',
      sentiment: 'positive',
      last_contacted_at: '2026-08-31T00:00:00Z',
      companies: [{ id: 10, name: 'Globex Corp' }],
      account_name: null,
      sentiment_source: 'manual' as const, sentiment_computed_at: null,
    };
    const jamesWilson = {
      ...sarahChen,
      id: 2,
      name: 'James Wilson',
      role_display: 'Champion',
      email: 'j.wilson@globex.example',
    };

    async function openContactsTab(fetchMock: ReturnType<typeof vi.fn>) {
      vi.stubGlobal('fetch', fetchMock);
      renderPeople();
      const user = userEvent.setup();
      await screen.findByText('Sarah Chen');
      return user;
    }

    function baseFetchMock(contactsResponse: unknown) {
      return vi.fn((url: string, options?: { method?: string; body?: string }) => {
        const method = options?.method ?? 'GET';
        if (method === 'GET' && url.includes('/contacts/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => contactsResponse });
        }
        const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      });
    }

    it('filters the already-loaded contacts client-side as you type', async () => {
      const user = await openContactsTab(baseFetchMock([sarahChen, jamesWilson]));
      expect(screen.getByText('James Wilson')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Search contacts by name, role or email...'), 'sarah');

      expect(screen.queryByText('James Wilson')).not.toBeInTheDocument();
      expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    });

    it('shows both organisation-level and account-level contacts together, labeled by Account', async () => {
      const accountLevelContact = {
        ...jamesWilson,
        id: 3,
        name: 'Priya Nair',
        account_name: 'North America',
      };
      await openContactsTab(baseFetchMock([sarahChen, accountLevelContact]));

      expect(screen.getByText('Priya Nair')).toBeInTheDocument();
      // Sarah Chen (org-level, account_name: null) shows "Organization";
      // Priya Nair (account-level) shows her account's own name.
      expect(screen.getByText('Organization')).toBeInTheDocument();
      expect(screen.getByText('North America')).toBeInTheDocument();
    });

    it('adding a contact with an Account picked posts to the account-level endpoint instead', async () => {
      const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
        const method = options?.method ?? 'GET';
        if (method === 'GET' && url.endsWith('/customers/10/accounts/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [{ id: 17, name: 'North America', customers: [{ id: 10, name: 'Globex Corp' }] }],
          });
        }
        if (method === 'POST' && url.endsWith('/customers/10/accounts/17/contacts/')) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ ...sarahChen, id: 99, name: 'New Person', account_name: 'North America' }),
          });
        }
        if (method === 'GET' && url.includes('/contacts/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [sarahChen] });
        }
        const body = url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      });
      const user = await openContactsTab(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Add Contact' }));
      await user.type(screen.getByLabelText('Name *'), 'New Person');
      await user.type(screen.getByLabelText('Email *'), 'new.person@globex.example');
      await user.selectOptions(await screen.findByLabelText('Account (optional)'), '17');
      const submitButton = screen
        .getAllByRole('button', { name: 'Add Contact' })
        .find((btn) => btn.closest('form'))!;
      await user.click(submitButton);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/customers/10/accounts/17/contacts/'),
          expect.objectContaining({ method: 'POST' })
        )
      );
    });

    it('adding a contact posts to /customers/10/contacts/ (organization-level)', async () => {
      const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
        const method = options?.method ?? 'GET';
        if (method === 'POST' && url.endsWith('/customers/10/contacts/')) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ ...sarahChen, id: 99, name: 'New Person' }),
          });
        }
        if (method === 'GET' && url.includes('/contacts/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [sarahChen] });
        }
        const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      });
      const user = await openContactsTab(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Add Contact' }));
      await user.type(screen.getByLabelText('Name *'), 'New Person');
      await user.type(screen.getByLabelText('Email *'), 'new.person@globex.example');
      const submitButton = screen
        .getAllByRole('button', { name: 'Add Contact' })
        .find((btn) => btn.closest('form'))!;
      await user.click(submitButton);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/customers/10/contacts/'),
          expect.objectContaining({ method: 'POST' })
        )
      );
    });

    it('editing a contact PATCHes /api/v1/contacts/<id>/ and updates it in place', async () => {
      const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
        const method = options?.method ?? 'GET';
        if (method === 'PATCH' && url.endsWith('/contacts/1/')) {
          const body = JSON.parse(options!.body!);
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...sarahChen, ...body }) });
        }
        if (method === 'GET' && url.includes('/contacts/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [sarahChen] });
        }
        const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      });
      const user = await openContactsTab(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Actions for Sarah Chen' }));
      await user.click(screen.getByRole('button', { name: 'Edit Contact' }));
      const nameInput = screen.getByLabelText('Name *');
      await user.clear(nameInput);
      await user.type(nameInput, 'Sarah Chen-Wu');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/contacts/1/'),
          expect.objectContaining({ method: 'PATCH' })
        )
      );
      expect(await screen.findByText('Sarah Chen-Wu')).toBeInTheDocument();
    });

    it('deleting a contact DELETEs /api/v1/contacts/<id>/ and removes the row', async () => {
      const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
        const method = options?.method ?? 'GET';
        if (method === 'DELETE' && url.endsWith('/contacts/1/')) {
          return Promise.resolve({ ok: true, status: 204, json: async () => null });
        }
        if (method === 'GET' && url.includes('/contacts/')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [sarahChen] });
        }
        const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      });
      const user = await openContactsTab(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Actions for Sarah Chen' }));
      await user.click(screen.getByRole('button', { name: 'Delete Contact' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/contacts/1/'),
          expect.objectContaining({ method: 'DELETE' })
        )
      );
      expect(screen.queryByText('Sarah Chen')).not.toBeInTheDocument();
    });
  });
});
