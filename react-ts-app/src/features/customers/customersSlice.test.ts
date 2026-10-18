import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer, {
  fetchCustomers,
  fetchUpcomingRenewals,
  fetchCustomerStats,
  fetchCustomerById,
  fetchAccountsForCustomer,
  createAccount,
  updateAccount,
  createCustomer,
  updateCustomer,
  fetchActivitiesForCustomer,
  fetchActivitiesForAccount,
  clearActivities,
  fetchEmailsForCustomer,
  fetchEmailsForAccount,
  clearEmails,
  fetchTasksForCustomer,
  fetchTasksForAccount,
  clearTasks,
  fetchNotesForCustomer,
  fetchNotesForAccount,
  clearNotes,
  fetchHeadlinesForCustomer,
  fetchHeadlinesForAccount,
  clearHeadlines,
  regenerateHeadlines,
  fetchTicketsForCustomer,
  fetchTicketsForAccount,
  clearTickets,
  fetchCalendarEventsForCustomer,
  fetchCalendarEventsForAccount,
  clearCalendarEvents,
  fetchSurveysForCustomer,
  fetchSurveysForAccount,
  clearSurveys,
} from './customersSlice';

function makeStore() {
  return configureStore({ reducer: { customers: customersReducer } });
}

// Minimal but real shape, matching revenact-backend's CustomerSerializer —
// see docs/API_CONTRACTS.md -> customers.
const globex = {
  id: 1,
  name: 'Globex Corp',
  address: '',
  domain: '',
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
  nps_score: null,
  csat_score: null,
  joined_date: null,
  renewal_date: null,
  contract_start_date: null,
  contract_end_date: null,
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

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

describe('customersSlice', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty', () => {
    const state = makeStore().getState().customers;
    expect(state.customers).toEqual([]);
    expect(state.count).toBe(0);
    expect(state.totalCount).toBe(0);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchCustomers loads a page and tracks the pagination envelope', async () => {
    mockFetchOnce(200, {
      count: 30,
      next: 'http://localhost:8000/api/v1/customers/?page=2',
      previous: null,
      results: [globex],
    });

    const store = makeStore();
    await store.dispatch(fetchCustomers());

    const state = store.getState().customers;
    expect(state.isLoading).toBe(false);
    expect(state.customers).toEqual([globex]);
    expect(state.count).toBe(30);
    expect(state.next).toBe('http://localhost:8000/api/v1/customers/?page=2');
    expect(state.previous).toBeNull();
  });

  it('paging forward calls fetch with the exact next URL the server gave back, unprefixed', async () => {
    mockFetchOnce(200, {
      count: 30,
      next: 'http://localhost:8000/api/v1/customers/?page=2',
      previous: null,
      results: [globex],
    });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 30, next: null, previous: 'http://localhost:8000/api/v1/customers/', results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(fetchCustomers(store.getState().customers.next!));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/customers/?page=2',
      expect.anything()
    );
  });

  it('sets an error on failure without clearing already-loaded data', async () => {
    mockFetchOnce(200, { count: 1, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    mockFetchOnce(500, { detail: 'Server error.' });
    await store.dispatch(fetchCustomers());

    const state = store.getState().customers;
    expect(state.error).toBe('Server error.');
    expect(state.customers).toEqual([globex]);
  });

  it('an unfiltered fetch updates totalCount ("organisations onboarded")', async () => {
    mockFetchOnce(200, { count: 12, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    expect(store.getState().customers.totalCount).toBe(12);
  });

  it('a search-filtered fetch updates count but leaves totalCount alone', async () => {
    mockFetchOnce(200, { count: 12, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    mockFetchOnce(200, { count: 1, next: null, previous: null, results: [globex] });
    await store.dispatch(fetchCustomers('/customers/?search=globex'));

    const state = store.getState().customers;
    expect(state.count).toBe(1);
    expect(state.totalCount).toBe(12);
  });

  it('a page reached mid-search (next link still carrying ?search=) also leaves totalCount alone', async () => {
    mockFetchOnce(200, { count: 12, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    mockFetchOnce(200, {
      count: 2,
      next: 'http://localhost:8000/api/v1/customers/?search=globex&page=2',
      previous: null,
      results: [globex],
    });
    await store.dispatch(fetchCustomers('/customers/?search=globex'));

    mockFetchOnce(200, { count: 2, next: null, previous: null, results: [globex] });
    await store.dispatch(fetchCustomers(store.getState().customers.next!));

    expect(store.getState().customers.totalCount).toBe(12);
  });

  it('fetchUpcomingRenewals hits ?renewal_within= with the given window and stores the results separately', async () => {
    const wework = { ...globex, id: 3, name: 'WeWork' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 1, next: null, previous: null, results: [wework] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    await store.dispatch(fetchUpcomingRenewals(30));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/?renewal_within=30'),
      expect.anything()
    );
    const state = store.getState().customers;
    expect(state.renewals).toEqual([wework]);
    expect(state.renewalsCount).toBe(1);
    expect(state.renewalsLoading).toBe(false);
    // Doesn't touch the main table's own list/count/totalCount.
    expect(state.customers).toEqual([]);
    expect(state.totalCount).toBe(0);
  });

  it('fetchUpcomingRenewals sets its own error, separate from the main list error', async () => {
    mockFetchOnce(500, { detail: 'Server error.' });
    const store = makeStore();
    await store.dispatch(fetchUpcomingRenewals(90));

    const state = store.getState().customers;
    expect(state.renewalsError).toBe('Server error.');
    expect(state.error).toBeNull();
  });

  it('fetchCustomerStats hits /customers/stats/ and stores the health/nps/lifecycle rollup', async () => {
    const stats = {
      health: {
        good: { count: 9, mrr: 1000, arr: 12000 },
        average: { count: 2, mrr: 200, arr: 2400 },
        poor: { count: 3, mrr: 300, arr: 3600 },
      },
      nps: { promoters: 9, passives: 1, detractors: 4, score: 36 },
      lifecycle: {
        onboarding: { count: 1, mrr: 0, arr: 0 },
        kickoff: { count: 0, mrr: 0, arr: 0 },
        adoption: { count: 0, mrr: 0, arr: 0 },
        live: { count: 10, mrr: 0, arr: 0 },
        renewal: { count: 0, mrr: 0, arr: 0 },
        churn: { count: 3, mrr: 0, arr: 0 },
        expansion: { count: 0, mrr: 0, arr: 0 },
        other: { count: 0, mrr: 0, arr: 0 },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    await store.dispatch(fetchCustomerStats());

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/customers/stats/'), expect.anything());
    const state = store.getState().customers;
    expect(state.stats).toEqual(stats);
    expect(state.statsLoading).toBe(false);
    expect(state.statsError).toBeNull();
  });

  it('fetchCustomerStats sets its own error, separate from the main list and renewals errors', async () => {
    mockFetchOnce(500, { detail: 'Server error.' });
    const store = makeStore();
    await store.dispatch(fetchCustomerStats());

    const state = store.getState().customers;
    expect(state.statsError).toBe('Server error.');
    expect(state.stats).toBeNull();
    expect(state.error).toBeNull();
    expect(state.renewalsError).toBeNull();
  });

  it('createCustomer POSTs to /customers/ and unshifts the result, bumping count and totalCount', async () => {
    mockFetchOnce(200, { count: 1, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    const initech = { ...globex, id: 2, name: 'Initech' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => initech });
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(createCustomer({ name: 'Initech' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/'),
      expect.objectContaining({ method: 'POST' })
    );
    const state = store.getState().customers;
    expect(state.customers).toEqual([initech, globex]);
    expect(state.count).toBe(2);
    expect(state.totalCount).toBe(2);
  });

  it('updateCustomer PATCHes /customers/<id>/ and replaces the matching entry in place', async () => {
    mockFetchOnce(200, { count: 1, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    const renamed = { ...globex, name: 'Globex Renamed' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => renamed });
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(updateCustomer({ id: globex.id, name: 'Globex Renamed' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/customers/${globex.id}/`),
      expect.objectContaining({ method: 'PATCH' })
    );
    const state = store.getState().customers;
    expect(state.customers).toEqual([renamed]);
    expect(state.count).toBe(1);
  });

  it('updateCustomer with is_archived:true removes the row from the list and decrements counts', async () => {
    mockFetchOnce(200, { count: 1, next: null, previous: null, results: [globex] });
    const store = makeStore();
    await store.dispatch(fetchCustomers());

    const archived = { ...globex, is_archived: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => archived }));

    await store.dispatch(updateCustomer({ id: globex.id, is_archived: true }));

    const state = store.getState().customers;
    expect(state.customers).toEqual([]);
    expect(state.count).toBe(0);
    expect(state.totalCount).toBe(0);
  });

  describe('fetchCustomerById (Details.tsx)', () => {
    it('GETs /customers/<id>/ and stores the result as selectedCustomer', async () => {
      mockFetchOnce(200, globex);
      const store = makeStore();

      await store.dispatch(fetchCustomerById(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.selectedCustomer).toEqual(globex);
      expect(state.selectedCustomerLoading).toBe(false);
      expect(state.selectedCustomerError).toBeNull();
    });

    it('sets an error and leaves selectedCustomer null on a 404 (out-of-org or nonexistent id)', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchCustomerById(999));

      const state = store.getState().customers;
      expect(state.selectedCustomer).toBeNull();
      expect(state.selectedCustomerError).toBe('Not found.');
    });

    it('clears a previous selectedCustomer as soon as a new fetch starts', async () => {
      mockFetchOnce(200, globex);
      const store = makeStore();
      await store.dispatch(fetchCustomerById(globex.id));
      expect(store.getState().customers.selectedCustomer).toEqual(globex);

      // Simulate navigating straight from this org's Details page to
      // another's — dispatch a second fetch without awaiting it yet.
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchCustomerById(2));

      expect(store.getState().customers.selectedCustomer).toBeNull();
    });

    it('updateCustomer keeps selectedCustomer in sync when it edits the currently-viewed organization', async () => {
      mockFetchOnce(200, globex);
      const store = makeStore();
      await store.dispatch(fetchCustomerById(globex.id));

      const renamed = { ...globex, name: 'Globex Renamed' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => renamed }));
      await store.dispatch(updateCustomer({ id: globex.id, name: 'Globex Renamed' }));

      expect(store.getState().customers.selectedCustomer).toEqual(renamed);
    });
  });

  describe('fetchAccountsForCustomer (Details.tsx Accounts tab)', () => {
    const account = {
      id: 1,
      customers: [{ id: globex.id, name: globex.name }],
      name: 'North America Enterprise',
      domain: '',
      owner: null,
      created_at: '2026-08-31T00:00:00Z',
      updated_at: '2026-08-31T00:00:00Z',
      lifecycle_stage: 'live' as const,
      health_score: '9.5',
      health_category: 'good' as const,
      pulse: [1, 1, 1, 1, 0],
      ai_pulse_score: 'very_satisfied' as const,
      ai_pulse_reason: '',
      nps_score: 100,
      csat_score: '100.00',
      renewal_date: '2026-03-02',
      arr: '33600.00',
    };

    it('GETs /customers/<id>/accounts/ and stores the plain array as accountsForCustomer', async () => {
      mockFetchOnce(200, [account]);
      const store = makeStore();

      await store.dispatch(fetchAccountsForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.accountsForCustomer).toEqual([account]);
      expect(state.accountsLoading).toBe(false);
      expect(state.accountsError).toBeNull();
    });

    it('sets an error and leaves accountsForCustomer empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchAccountsForCustomer(999));

      const state = store.getState().customers;
      expect(state.accountsForCustomer).toEqual([]);
      expect(state.accountsError).toBe('Not found.');
    });

    it('clears a previous accountsForCustomer as soon as a new fetch starts', async () => {
      mockFetchOnce(200, [account]);
      const store = makeStore();
      await store.dispatch(fetchAccountsForCustomer(globex.id));
      expect(store.getState().customers.accountsForCustomer).toEqual([account]);

      // Simulate navigating straight from this org's Accounts tab to
      // another's — dispatch a second fetch without awaiting it yet.
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchAccountsForCustomer(2));

      expect(store.getState().customers.accountsForCustomer).toEqual([]);
    });

    describe('createAccount/updateAccount (Add/Edit Account)', () => {
      it('createAccount POSTs to /customers/<id>/accounts/', async () => {
        mockFetchOnce(200, [account]);
        const store = makeStore();
        await store.dispatch(fetchAccountsForCustomer(globex.id));

        const created = { ...account, id: 2, name: 'EMEA' };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => created }));

        await store.dispatch(createAccount({ customerId: globex.id, name: 'EMEA' }));

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/customers/${globex.id}/accounts/`),
          expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'EMEA' }) })
        );
        // No auto-patch here — now that an Account could land in either
        // accountsForCustomer (this Organization Details page's own
        // Accounts tab) or the standalone Accounts page's own
        // allAccounts, createAccount doesn't know which; the caller
        // refetches its own list instead (see AccountFormModal's own
        // onSaved), same "caller refetches" reasoning as
        // createContactForCustomer.
        expect(store.getState().customers.accountsForCustomer).toEqual([account]);
      });

      it('updateAccount PATCHes /customers/<id>/accounts/<id>/ and replaces the matching entry in place', async () => {
        mockFetchOnce(200, [account]);
        const store = makeStore();
        await store.dispatch(fetchAccountsForCustomer(globex.id));

        const renamed = { ...account, name: 'North America Renamed' };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => renamed });
        vi.stubGlobal('fetch', fetchMock);

        await store.dispatch(
          updateAccount({ customerId: globex.id, id: account.id, name: 'North America Renamed' })
        );

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/customers/${globex.id}/accounts/${account.id}/`),
          expect.objectContaining({ method: 'PATCH' })
        );
        expect(store.getState().customers.accountsForCustomer).toEqual([renamed]);
      });

      it('createAccount surfaces the backend error on rejection', async () => {
        mockFetchOnce(400, { name: ['This field is required.'] });
        const store = makeStore();

        const result = await store.dispatch(createAccount({ customerId: globex.id, name: '' }));

        expect(createAccount.rejected.match(result)).toBe(true);
        expect(result.payload).toBe('This field is required.');
      });
    });
  });

  describe('fetchActivitiesForCustomer / fetchActivitiesForAccount (ActivityFeed\'s Activities filter)', () => {
    const orgActivity = {
      id: 1,
      type: 'health_check_review',
      type_display: 'Health Check Review',
      occurred_at: '2026-02-28',
      links: 2,
      watchers: 3,
    };
    const accountActivity = {
      id: 2,
      type: 'renewal_proposal_submitted',
      type_display: 'Renewal Proposal Submitted',
      occurred_at: '2026-03-15',
      links: 1,
      watchers: 4,
    };

    it('fetchActivitiesForCustomer GETs /customers/<id>/activities/ and stores the result', async () => {
      mockFetchOnce(200, [orgActivity]);
      const store = makeStore();

      await store.dispatch(fetchActivitiesForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/activities/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.activities).toEqual([orgActivity]);
      expect(state.activitiesLoading).toBe(false);
      expect(state.activitiesError).toBeNull();
    });

    it('fetchActivitiesForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountActivity]);
      const store = makeStore();

      await store.dispatch(fetchActivitiesForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/activities/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.activities).toEqual([accountActivity]);
    });

    // This is the direct regression guard for the bug that prompted this
    // feature: every real account used to show the exact same hardcoded
    // mock activities (ACCOUNT_ID_MAP's `?? 101` fallback). Dispatching
    // for two different accounts back to back must leave each one's own,
    // distinct activities in the single `activities` slot — not a stale
    // mix or the first account's data reused for the second.
    it('activities for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountActivity]);
      const store = makeStore();
      await store.dispatch(fetchActivitiesForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.activities).toEqual([accountActivity]);

      const otherAccountActivity = { ...orgActivity, id: 3, type_display: 'Success Plan Updated' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [otherAccountActivity] })
      );
      await store.dispatch(fetchActivitiesForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.activities).toEqual([otherAccountActivity]);
    });

    it('sets an error and leaves activities empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchActivitiesForCustomer(999));

      const state = store.getState().customers;
      expect(state.activities).toEqual([]);
      expect(state.activitiesError).toBe('Not found.');
    });

    it('clears a previous fetch\'s activities as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgActivity]);
      const store = makeStore();
      await store.dispatch(fetchActivitiesForCustomer(globex.id));
      expect(store.getState().customers.activities).toEqual([orgActivity]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchActivitiesForCustomer(2));

      expect(store.getState().customers.activities).toEqual([]);
    });

    it('clearActivities empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgActivity]);
      const store = makeStore();
      await store.dispatch(fetchActivitiesForCustomer(globex.id));
      expect(store.getState().customers.activities).toEqual([orgActivity]);

      store.dispatch(clearActivities());

      const state = store.getState().customers;
      expect(state.activities).toEqual([]);
      expect(state.activitiesError).toBeNull();
    });
  });

  describe('fetchEmailsForCustomer / fetchEmailsForAccount (ActivityFeed\'s Emails filter)', () => {
    const orgEmail = {
      id: 1,
      subject: 'Quarterly Business Review - Q4 2025 Recap',
      sender_name: 'Edgar Holmes',
      recipient_name: 'Sarah Chen',
      body: 'Hi Sarah, please find attached the QBR deck for Q4.',
      sent_at: '2026-01-15T15:45:00Z',
      links: 5,
      watchers: 3,
      is_starred: true,
    };
    const accountEmail = {
      id: 2,
      subject: 'Renewal Prep: Expansion Proposal Draft',
      sender_name: 'Sarah Chen',
      recipient_name: 'Edgar Holmes',
      body: 'Draft expansion proposal attached.',
      sent_at: '2026-03-15T14:00:00Z',
      links: 1,
      watchers: 2,
      is_starred: false,
    };

    it('fetchEmailsForCustomer GETs /customers/<id>/emails/ and stores the result', async () => {
      mockFetchOnce(200, [orgEmail]);
      const store = makeStore();

      await store.dispatch(fetchEmailsForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/emails/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.emails).toEqual([orgEmail]);
      expect(state.emailsLoading).toBe(false);
      expect(state.emailsError).toBeNull();
    });

    it('fetchEmailsForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountEmail]);
      const store = makeStore();

      await store.dispatch(fetchEmailsForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/emails/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.emails).toEqual([accountEmail]);
    });

    // Same regression shape as the Activities leak-guard above — one
    // account's emails must never bleed into another account's fetch.
    it('emails for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountEmail]);
      const store = makeStore();
      await store.dispatch(fetchEmailsForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.emails).toEqual([accountEmail]);

      const otherAccountEmail = { ...orgEmail, id: 3, subject: 'Escalation: Critical Integration Issue' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [otherAccountEmail] })
      );
      await store.dispatch(fetchEmailsForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.emails).toEqual([otherAccountEmail]);
    });

    it('sets an error and leaves emails empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchEmailsForCustomer(999));

      const state = store.getState().customers;
      expect(state.emails).toEqual([]);
      expect(state.emailsError).toBe('Not found.');
    });

    it('clears a previous fetch\'s emails as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgEmail]);
      const store = makeStore();
      await store.dispatch(fetchEmailsForCustomer(globex.id));
      expect(store.getState().customers.emails).toEqual([orgEmail]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchEmailsForCustomer(2));

      expect(store.getState().customers.emails).toEqual([]);
    });

    it('clearEmails empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgEmail]);
      const store = makeStore();
      await store.dispatch(fetchEmailsForCustomer(globex.id));
      expect(store.getState().customers.emails).toEqual([orgEmail]);

      store.dispatch(clearEmails());

      const state = store.getState().customers;
      expect(state.emails).toEqual([]);
      expect(state.emailsError).toBeNull();
    });
  });

  describe('fetchTasksForCustomer / fetchTasksForAccount (ActivityFeed\'s Tasks filter)', () => {
    const orgTask = {
      id: 1,
      title: 'Prepare QBR deck for Q1',
      assignee_name: 'Edgar Holmes',
      due_date: '2026-03-15',
      priority: 'high',
      status: 'in-progress',
    };
    const accountTask = {
      id: 2,
      title: 'Draft renewal commercial terms',
      assignee_name: 'Edgar Holmes',
      due_date: '2026-03-28',
      priority: 'high',
      status: 'in-progress',
    };

    it('fetchTasksForCustomer GETs /customers/<id>/tasks/ and stores the result', async () => {
      mockFetchOnce(200, [orgTask]);
      const store = makeStore();

      await store.dispatch(fetchTasksForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/tasks/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.tasks).toEqual([orgTask]);
      expect(state.tasksLoading).toBe(false);
      expect(state.tasksError).toBeNull();
    });

    it('fetchTasksForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountTask]);
      const store = makeStore();

      await store.dispatch(fetchTasksForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/tasks/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.tasks).toEqual([accountTask]);
    });

    // Same regression shape as the Activities/Emails leak-guards above
    // — one account's tasks must never bleed into another account's
    // fetch.
    it('tasks for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountTask]);
      const store = makeStore();
      await store.dispatch(fetchTasksForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.tasks).toEqual([accountTask]);

      const otherAccountTask = { ...orgTask, id: 3, title: 'Resolve integration escalation' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [otherAccountTask] })
      );
      await store.dispatch(fetchTasksForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.tasks).toEqual([otherAccountTask]);
    });

    it('sets an error and leaves tasks empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchTasksForCustomer(999));

      const state = store.getState().customers;
      expect(state.tasks).toEqual([]);
      expect(state.tasksError).toBe('Not found.');
    });

    it('clears a previous fetch\'s tasks as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgTask]);
      const store = makeStore();
      await store.dispatch(fetchTasksForCustomer(globex.id));
      expect(store.getState().customers.tasks).toEqual([orgTask]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchTasksForCustomer(2));

      expect(store.getState().customers.tasks).toEqual([]);
    });

    it('clearTasks empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgTask]);
      const store = makeStore();
      await store.dispatch(fetchTasksForCustomer(globex.id));
      expect(store.getState().customers.tasks).toEqual([orgTask]);

      store.dispatch(clearTasks());

      const state = store.getState().customers;
      expect(state.tasks).toEqual([]);
      expect(state.tasksError).toBeNull();
    });
  });

  describe('fetchNotesForCustomer / fetchNotesForAccount (ActivityFeed\'s Notes filter)', () => {
    const orgNote = {
      id: 1,
      title: 'Call Notes: Product Feedback Session',
      author_name: 'Edgar Holmes',
      body: 'Customer expressed interest in AI-powered analytics.',
      logged_at: '2026-03-04',
      links: 2,
    };
    const accountNote = {
      id: 2,
      title: 'Commercial Negotiation Summary',
      author_name: 'Edgar Holmes',
      body: 'Customer requested 15% discount for 3-year commitment.',
      logged_at: '2026-03-15',
      links: 1,
    };

    it('fetchNotesForCustomer GETs /customers/<id>/notes/ and stores the result', async () => {
      mockFetchOnce(200, [orgNote]);
      const store = makeStore();

      await store.dispatch(fetchNotesForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/notes/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.notes).toEqual([orgNote]);
      expect(state.notesLoading).toBe(false);
      expect(state.notesError).toBeNull();
    });

    it('fetchNotesForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountNote]);
      const store = makeStore();

      await store.dispatch(fetchNotesForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/notes/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.notes).toEqual([accountNote]);
    });

    // Same regression shape as the Activities/Emails/Tasks leak-guards
    // above — one account's notes must never bleed into another
    // account's fetch.
    it('notes for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountNote]);
      const store = makeStore();
      await store.dispatch(fetchNotesForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.notes).toEqual([accountNote]);

      const otherAccountNote = { ...orgNote, id: 3, title: 'Escalation Meeting Summary' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [otherAccountNote] })
      );
      await store.dispatch(fetchNotesForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.notes).toEqual([otherAccountNote]);
    });

    it('sets an error and leaves notes empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchNotesForCustomer(999));

      const state = store.getState().customers;
      expect(state.notes).toEqual([]);
      expect(state.notesError).toBe('Not found.');
    });

    it('clears a previous fetch\'s notes as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgNote]);
      const store = makeStore();
      await store.dispatch(fetchNotesForCustomer(globex.id));
      expect(store.getState().customers.notes).toEqual([orgNote]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchNotesForCustomer(2));

      expect(store.getState().customers.notes).toEqual([]);
    });

    it('clearNotes empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgNote]);
      const store = makeStore();
      await store.dispatch(fetchNotesForCustomer(globex.id));
      expect(store.getState().customers.notes).toEqual([orgNote]);

      store.dispatch(clearNotes());

      const state = store.getState().customers;
      expect(state.notes).toEqual([]);
      expect(state.notesError).toBeNull();
    });
  });

  describe('fetchHeadlinesForCustomer / fetchHeadlinesForAccount (the Headlines sub-tab)', () => {
    const summary = {
      id: 1,
      kind: 'summary' as const,
      kind_display: 'Summary',
      title: 'TL;DR (Last 3 months)',
      content: 'Account shows exceptional health with strong renewal momentum.',
      status: '' as const,
      status_display: '',
      period_start: null,
      period_end: null,
      time_period_label: 'Last 3 months',
      data_sources: ['notes' as const, 'emails' as const],
      data_sources_display: 'Notes and Emails',
      group: '',
      generated_at: null,
      created_at: '2026-01-21T00:00:00Z',
    };
    const accountHeadline = {
      ...summary,
      id: 2,
      kind: 'headline' as const,
      kind_display: 'Headline',
      title: 'Apple EMEA Retail Operations Renewal and Expansion',
      status: 'open' as const,
      status_display: 'Open',
      period_start: '2025-11-20',
      period_end: '2026-01-21',
      time_period_label: '',
      group: 'January 2026',
    };

    it('fetchHeadlinesForCustomer GETs /customers/<id>/headlines/ and stores the result', async () => {
      mockFetchOnce(200, [summary]);
      const store = makeStore();

      await store.dispatch(fetchHeadlinesForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/headlines/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.headlines).toEqual([summary]);
      expect(state.headlinesLoading).toBe(false);
      expect(state.headlinesError).toBeNull();
    });

    it('fetchHeadlinesForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountHeadline]);
      const store = makeStore();

      await store.dispatch(fetchHeadlinesForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/headlines/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.headlines).toEqual([accountHeadline]);
    });

    // The defect this whole feature replaces: the tab used to render
    // one hardcoded array for every account, because the component
    // resolved every real account id onto the same stub. This is the
    // guard that the fetch is genuinely per-account now.
    it('headlines for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountHeadline]);
      const store = makeStore();
      await store.dispatch(fetchHeadlinesForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.headlines).toEqual([accountHeadline]);

      const otherAccountHeadline = { ...accountHeadline, id: 3, title: 'APAC Rollout' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => [otherAccountHeadline],
        })
      );
      await store.dispatch(fetchHeadlinesForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.headlines).toEqual([otherAccountHeadline]);
    });

    it('sets an error and leaves headlines empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchHeadlinesForCustomer(999));

      const state = store.getState().customers;
      expect(state.headlines).toEqual([]);
      expect(state.headlinesError).toBe('Not found.');
    });

    it('clears a previous fetch\'s headlines as soon as a new one starts', async () => {
      mockFetchOnce(200, [summary]);
      const store = makeStore();
      await store.dispatch(fetchHeadlinesForCustomer(globex.id));
      expect(store.getState().customers.headlines).toEqual([summary]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchHeadlinesForCustomer(2));

      expect(store.getState().customers.headlines).toEqual([]);
    });

    it('clearHeadlines empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [summary]);
      const store = makeStore();
      await store.dispatch(fetchHeadlinesForCustomer(globex.id));
      expect(store.getState().customers.headlines).toEqual([summary]);

      store.dispatch(clearHeadlines());

      const state = store.getState().customers;
      expect(state.headlines).toEqual([]);
      expect(state.headlinesError).toBeNull();
    });

    it('regenerateHeadlines POSTs the account generate endpoint and swaps in the result', async () => {
      const store = makeStore();
      mockFetchOnce(200, [summary]);
      await store.dispatch(fetchHeadlinesForAccount({ customerId: globex.id, accountId: 17 }));

      const regenerated = { ...summary, id: 9, content: 'Freshly written.' };
      mockFetchOnce(201, [regenerated]);
      await store.dispatch(regenerateHeadlines({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/headlines/generate/`),
        expect.objectContaining({ method: 'POST' })
      );
      // The endpoint returns the full new list, so no refetch is needed.
      expect(store.getState().customers.headlines).toEqual([regenerated]);
      expect(store.getState().customers.headlinesGenerating).toBe(false);
    });

    it('regenerateHeadlines POSTs the customer endpoint when no accountId is given', async () => {
      mockFetchOnce(201, [summary]);
      const store = makeStore();

      await store.dispatch(regenerateHeadlines({ customerId: globex.id }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/headlines/generate/`),
        expect.objectContaining({ method: 'POST' })
      );
    });

    // The backend does its delete and insert in one transaction, so a
    // failed regenerate leaves the stored cards intact — the slice has
    // to leave the on-screen ones intact to match, or the user loses
    // something perfectly readable to a failure that changed nothing.
    it('a failed regenerate keeps the existing cards and reports separately', async () => {
      const store = makeStore();
      mockFetchOnce(200, [summary]);
      await store.dispatch(fetchHeadlinesForCustomer(globex.id));

      mockFetchOnce(422, {
        detail: 'Globex has no notes, emails, tickets or activities in the last 90 days.',
      });
      await store.dispatch(regenerateHeadlines({ customerId: globex.id }));

      const state = store.getState().customers;
      expect(state.headlines).toEqual([summary]);
      expect(state.headlinesError).toBeNull();
      expect(state.headlinesGenerateError).toBe(
        'Globex has no notes, emails, tickets or activities in the last 90 days.'
      );
    });

    it('passes through the backend\'s unconfigured-provider message verbatim', async () => {
      mockFetchOnce(503, {
        detail: "Copilot isn't configured yet — set ANTHROPIC_API_KEY in your .env.",
      });
      const store = makeStore();

      await store.dispatch(regenerateHeadlines({ customerId: globex.id }));

      expect(store.getState().customers.headlinesGenerateError).toBe(
        "Copilot isn't configured yet — set ANTHROPIC_API_KEY in your .env."
      );
    });

    it('does not blank the cards while a regenerate is in flight', async () => {
      const store = makeStore();
      mockFetchOnce(200, [summary]);
      await store.dispatch(fetchHeadlinesForCustomer(globex.id));

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(regenerateHeadlines({ customerId: globex.id }));

      const state = store.getState().customers;
      expect(state.headlines).toEqual([summary]);
      expect(state.headlinesGenerating).toBe(true);
    });
  });

  describe('fetchTicketsForCustomer / fetchTicketsForAccount (ActivityFeed\'s Tickets filter)', () => {
    const orgTicket = {
      id: 1,
      ticket_number: 'TKT-1042',
      title: 'Dashboard loading slow on large datasets',
      assignee_name: 'Support Team',
      status: 'in-progress',
      priority: 'high',
      opened_at: '2026-03-03',
      links: 2,
      connector_name: null, connector_provider: null, department: '', department_display: '', description: '', requester_name: '', requester_email: '', external_url: '', synced_at: null,
    };
    const accountTicket = {
      id: 2,
      ticket_number: 'TKT-2003',
      title: 'Mobile app login fails on iOS 18',
      assignee_name: 'Engineering',
      status: 'open',
      priority: 'critical',
      opened_at: '2026-03-29',
      links: 0,
      connector_name: null, connector_provider: null, department: '', department_display: '', description: '', requester_name: '', requester_email: '', external_url: '', synced_at: null,
    };

    it('fetchTicketsForCustomer GETs /customers/<id>/tickets/ and stores the result', async () => {
      mockFetchOnce(200, [orgTicket]);
      const store = makeStore();

      await store.dispatch(fetchTicketsForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/tickets/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.tickets).toEqual([orgTicket]);
      expect(state.ticketsLoading).toBe(false);
      expect(state.ticketsError).toBeNull();
    });

    it('fetchTicketsForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountTicket]);
      const store = makeStore();

      await store.dispatch(fetchTicketsForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/tickets/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.tickets).toEqual([accountTicket]);
    });

    // Same regression shape as the Activities/Emails/Tasks/Notes
    // leak-guards above — one account's tickets must never bleed into
    // another account's fetch.
    it('tickets for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountTicket]);
      const store = makeStore();
      await store.dispatch(fetchTicketsForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.tickets).toEqual([accountTicket]);

      const otherAccountTicket = { ...orgTicket, id: 3, title: 'Salesforce sync failure' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [otherAccountTicket] })
      );
      await store.dispatch(fetchTicketsForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.tickets).toEqual([otherAccountTicket]);
    });

    it('sets an error and leaves tickets empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchTicketsForCustomer(999));

      const state = store.getState().customers;
      expect(state.tickets).toEqual([]);
      expect(state.ticketsError).toBe('Not found.');
    });

    it('clears a previous fetch\'s tickets as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgTicket]);
      const store = makeStore();
      await store.dispatch(fetchTicketsForCustomer(globex.id));
      expect(store.getState().customers.tickets).toEqual([orgTicket]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchTicketsForCustomer(2));

      expect(store.getState().customers.tickets).toEqual([]);
    });

    it('clearTickets empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgTicket]);
      const store = makeStore();
      await store.dispatch(fetchTicketsForCustomer(globex.id));
      expect(store.getState().customers.tickets).toEqual([orgTicket]);

      store.dispatch(clearTickets());

      const state = store.getState().customers;
      expect(state.tickets).toEqual([]);
      expect(state.ticketsError).toBeNull();
    });
  });

  describe('fetchSurveysForCustomer / fetchSurveysForAccount (ActivityFeed\'s Surveys filter)', () => {
    const orgSurvey = {
      id: 1,
      survey_type: 'nps',
      survey_type_display: 'NPS',
      status: 'sent',
      status_display: 'Sent',
      score: null,
      sent_at: '2026-09-01',
      responded_at: null,
      companies: [{ id: globex.id, name: 'Globex Corp' }],
      account_id: null,
      account_name: null,
      created_at: '2026-09-01T00:00:00Z',
    };
    const accountSurvey = {
      ...orgSurvey,
      id: 2,
      survey_type: 'csat',
      survey_type_display: 'CSAT',
      account_id: 17,
      account_name: 'North America',
    };

    it('fetchSurveysForCustomer GETs /customers/<id>/surveys/ and stores the result', async () => {
      mockFetchOnce(200, [orgSurvey]);
      const store = makeStore();

      await store.dispatch(fetchSurveysForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/surveys/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.entitySurveys).toEqual([orgSurvey]);
      expect(state.entitySurveysLoading).toBe(false);
      expect(state.entitySurveysError).toBeNull();
    });

    it('fetchSurveysForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountSurvey]);
      const store = makeStore();

      await store.dispatch(fetchSurveysForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/surveys/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.entitySurveys).toEqual([accountSurvey]);
    });

    it('sets an error and leaves entitySurveys empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchSurveysForCustomer(999));

      const state = store.getState().customers;
      expect(state.entitySurveys).toEqual([]);
      expect(state.entitySurveysError).toBe('Not found.');
    });

    it('clears a previous fetch\'s surveys as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgSurvey]);
      const store = makeStore();
      await store.dispatch(fetchSurveysForCustomer(globex.id));
      expect(store.getState().customers.entitySurveys).toEqual([orgSurvey]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchSurveysForCustomer(2));

      expect(store.getState().customers.entitySurveys).toEqual([]);
    });

    it('clearSurveys empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgSurvey]);
      const store = makeStore();
      await store.dispatch(fetchSurveysForCustomer(globex.id));
      expect(store.getState().customers.entitySurveys).toEqual([orgSurvey]);

      store.dispatch(clearSurveys());

      const state = store.getState().customers;
      expect(state.entitySurveys).toEqual([]);
      expect(state.entitySurveysError).toBeNull();
    });
  });

  describe('fetchCalendarEventsForCustomer / fetchCalendarEventsForAccount (ActivityFeed\'s Calendar Events filter)', () => {
    const orgEvent = {
      id: 1,
      title: 'Quarterly Business Review',
      description: 'Q1 2026 QBR with stakeholders',
      type: 'review',
      event_date: '2026-03-15',
      start_time: '10:00:00',
      end_time: '11:30:00',
      attendee_count: 3,
    };
    const accountEvent = {
      id: 2,
      title: 'Renewal Negotiation Call',
      description: 'Commercial terms alignment for 3-year renewal proposal',
      type: 'call',
      event_date: '2026-04-10',
      start_time: '11:00:00',
      end_time: '12:00:00',
      attendee_count: 2,
    };

    it('fetchCalendarEventsForCustomer GETs /customers/<id>/calendar-events/ and stores the result', async () => {
      mockFetchOnce(200, [orgEvent]);
      const store = makeStore();

      await store.dispatch(fetchCalendarEventsForCustomer(globex.id));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/calendar-events/`),
        expect.objectContaining({ method: 'GET' })
      );
      const state = store.getState().customers;
      expect(state.calendarEvents).toEqual([orgEvent]);
      expect(state.calendarEventsLoading).toBe(false);
      expect(state.calendarEventsError).toBeNull();
    });

    it('fetchCalendarEventsForAccount GETs the nested account endpoint and stores the result', async () => {
      mockFetchOnce(200, [accountEvent]);
      const store = makeStore();

      await store.dispatch(fetchCalendarEventsForAccount({ customerId: globex.id, accountId: 17 }));

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${globex.id}/accounts/17/calendar-events/`),
        expect.objectContaining({ method: 'GET' })
      );
      expect(store.getState().customers.calendarEvents).toEqual([accountEvent]);
    });

    // Same regression shape as the other feed filters' leak-guards
    // above — one account's events must never bleed into another
    // account's fetch.
    it('events for one account never leak into another account\'s fetch', async () => {
      mockFetchOnce(200, [accountEvent]);
      const store = makeStore();
      await store.dispatch(fetchCalendarEventsForAccount({ customerId: globex.id, accountId: 17 }));
      expect(store.getState().customers.calendarEvents).toEqual([accountEvent]);

      const otherAccountEvent = { ...orgEvent, id: 3, title: 'Escalation Follow-Up' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [otherAccountEvent] })
      );
      await store.dispatch(fetchCalendarEventsForAccount({ customerId: globex.id, accountId: 6 }));

      expect(store.getState().customers.calendarEvents).toEqual([otherAccountEvent]);
    });

    it('sets an error and leaves calendarEvents empty on a 404', async () => {
      mockFetchOnce(404, { detail: 'Not found.' });
      const store = makeStore();

      await store.dispatch(fetchCalendarEventsForCustomer(999));

      const state = store.getState().customers;
      expect(state.calendarEvents).toEqual([]);
      expect(state.calendarEventsError).toBe('Not found.');
    });

    it('clears a previous fetch\'s calendarEvents as soon as a new one starts', async () => {
      mockFetchOnce(200, [orgEvent]);
      const store = makeStore();
      await store.dispatch(fetchCalendarEventsForCustomer(globex.id));
      expect(store.getState().customers.calendarEvents).toEqual([orgEvent]);

      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      store.dispatch(fetchCalendarEventsForCustomer(2));

      expect(store.getState().customers.calendarEvents).toEqual([]);
    });

    it('clearCalendarEvents empties the slot outright (ActivityFeed\'s no-resolvable-id fallback)', async () => {
      mockFetchOnce(200, [orgEvent]);
      const store = makeStore();
      await store.dispatch(fetchCalendarEventsForCustomer(globex.id));
      expect(store.getState().customers.calendarEvents).toEqual([orgEvent]);

      store.dispatch(clearCalendarEvents());

      const state = store.getState().customers;
      expect(state.calendarEvents).toEqual([]);
      expect(state.calendarEventsError).toBeNull();
    });
  });
});
