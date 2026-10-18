import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import callsReducer, { fetchCalls, logCall } from '../calls/callsSlice';
import filesReducer, { fetchFiles, uploadFile } from '../files/filesSlice';
import customersReducer, {
  createContactForAccount,
  createNote,
  createOpportunityForAccount,
  createRiskForAccount,
  createSurveyForAccount,
  createTask,
  fetchContactsForAccount,
  fetchOpportunitiesForAccount,
  fetchRisksForAccount,
  fetchSurveysForAccount,
  updateAccount,
} from './customersSlice';

// Backend #75 serves an account's tabs at /accounts/<id>/…, keyed by the
// account alone. Without an organisation the thunks use that route; with one
// they keep the nested route every existing caller uses.

function stubFetch() {
  const spy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = method === 'GET' ? [] : { id: 900, name: 'Saved', created_at: '2026-09-30T10:00:00Z' };
    return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => body, blob: async () => new Blob([]) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type Spy = ReturnType<typeof stubFetch>;
const sent = (spy: Spy) =>
  spy.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${new URL(String(input)).pathname.replace(/^\/api\/v1/, '')}`);
const makeStore = () => configureStore({ reducer: { customers: customersReducer, files: filesReducer, calls: callsReducer } });

describe('account-scoped thunks without an organisation (backend #75)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('read an account alone on the flat routes', async () => {
    const spy = stubFetch();
    const store = makeStore();
    await store.dispatch(fetchContactsForAccount({ accountId: 12 }));
    await store.dispatch(fetchOpportunitiesForAccount({ accountId: 12 }));
    await store.dispatch(fetchRisksForAccount({ accountId: 12 }));
    await store.dispatch(fetchSurveysForAccount({ accountId: 12 }));
    await store.dispatch(fetchFiles({ entityType: 'account', customerId: null, accountId: 12 }));
    await store.dispatch(fetchCalls({ entityType: 'account', customerId: null, accountId: 12 }));
    expect(sent(spy)).toEqual([
      'GET /accounts/12/contacts/',
      'GET /accounts/12/opportunities/',
      'GET /accounts/12/risks/',
      'GET /accounts/12/surveys/',
      'GET /accounts/12/files/',
      'GET /accounts/12/calls/',
    ]);
  });

  it('save on an account alone on the flat routes', async () => {
    const spy = stubFetch();
    const store = makeStore();
    await store.dispatch(createContactForAccount({ accountId: 12, name: 'Robin Ops', email: 'robin@pizzahut.example' }));
    await store.dispatch(createOpportunityForAccount({ accountId: 12, title: 'Upsell' }));
    await store.dispatch(createRiskForAccount({ accountId: 12, title: 'Budget freeze' }));
    await store.dispatch(createSurveyForAccount({ accountId: 12, survey_type: 'nps', sent_at: '2026-09-30' }));
    await store.dispatch(createTask({ accountId: 12, title: 'Book the retraining', due_date: '2026-10-01', priority: 'medium' }));
    await store.dispatch(createNote({ accountId: 12, title: 'Kickoff', body: 'Met the new admin.' }));
    await store.dispatch(updateAccount({ id: 12, owner_id: 1, handover_note: 'Covering while Carl is away' }));
    await store.dispatch(uploadFile({ entityType: 'account', customerId: null, accountId: 12, file: new File(['x'], 'Notes.txt') }));
    await store.dispatch(
      logCall({ entityType: 'account', customerId: null, accountId: 12, input: { title: 'Check-in', occurred_at: '2026-09-30T10:00' } }),
    );
    expect(sent(spy)).toEqual([
      'POST /accounts/12/contacts/',
      'POST /accounts/12/opportunities/',
      'POST /accounts/12/risks/',
      'POST /accounts/12/surveys/',
      'POST /accounts/12/tasks/',
      'POST /accounts/12/notes/',
      'PATCH /accounts/12/',
      'POST /accounts/12/files/',
      'POST /accounts/12/calls/',
    ]);
  });

  it('keep the nested routes when an organisation is given', async () => {
    const spy = stubFetch();
    const store = makeStore();
    await store.dispatch(fetchContactsForAccount({ customerId: 7, accountId: 31 }));
    await store.dispatch(createTask({ customerId: 7, accountId: 31, title: 'T', due_date: '2026-10-01', priority: 'medium' }));
    await store.dispatch(createTask({ customerId: 7, title: 'T', due_date: '2026-10-01', priority: 'medium' }));
    await store.dispatch(updateAccount({ customerId: 7, id: 31, name: 'EMEA' }));
    await store.dispatch(fetchFiles({ entityType: 'account', customerId: 7, accountId: 31 }));
    expect(sent(spy)).toEqual([
      'GET /customers/7/accounts/31/contacts/',
      'POST /customers/7/accounts/31/tasks/',
      'POST /customers/7/tasks/',
      'PATCH /customers/7/accounts/31/',
      'GET /customers/7/accounts/31/files/',
    ]);
  });

  it('file an account-alone read under account:<id>, and an upload lands in it', async () => {
    stubFetch();
    const store = makeStore();
    await store.dispatch(fetchContactsForAccount({ accountId: 12 }));
    await store.dispatch(fetchFiles({ entityType: 'account', customerId: null, accountId: 12 }));
    expect(store.getState().customers.contactsFor).toBe('account:12');
    expect(store.getState().files.scope).toBe('account:12');
    await store.dispatch(uploadFile({ entityType: 'account', customerId: null, accountId: 12, file: new File(['x'], 'Notes.txt') }));
    expect(store.getState().files.items.map((file) => file.id)).toEqual([900]);
  });
});
