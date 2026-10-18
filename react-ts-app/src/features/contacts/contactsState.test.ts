import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer, {
  CONTACT_NOT_FOUND,
  deleteContact,
  fetchAllContacts,
  fetchContactById,
  fetchContactHistory,
  loadMoreContacts,
} from '../customers/customersSlice';
import { LUKAS, LUKAS_HISTORY, stubContactsApi } from './testContacts';

const makeStore = () => configureStore({ reducer: { customers: customersReducer } });

describe('the Contacts page state (spec 2026-09-28 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the summary over the whole filtered set', async () => {
    stubContactsApi();
    const store = makeStore();
    await store.dispatch(fetchAllContacts('/contacts/?customer=7'));
    const state = store.getState().customers;
    expect(state.allContacts.map((c) => c.name)).toEqual(['Mira Patel', 'Owen Price']);
    expect(state.allContactsSummary).toEqual({ total: 2, positive: 1, neutral: 0, negative: 1, decision_makers: 1, active: 1 });
  });

  it('never lets a slower, earlier read land over a newer one', async () => {
    let release: (value: unknown) => void = () => {};
    const slow = new Promise((resolve) => (release = resolve));
    const spy = stubContactsApi();
    const fast = spy.getMockImplementation()!;
    spy.mockImplementationOnce(async (...args) => {
      await slow;
      return fast(...args);
    });
    const store = makeStore();
    const first = store.dispatch(fetchAllContacts('/contacts/'));
    await store.dispatch(fetchAllContacts('/contacts/?sentiment=negative'));
    release(null);
    await first;
    expect(store.getState().customers.allContacts.map((c) => c.name)).toEqual(['Owen Price']);
  });

  it('appends the next page, and drops one that no longer continues the list', async () => {
    stubContactsApi({ pageSize: 2 });
    const store = makeStore();
    await store.dispatch(fetchAllContacts('/contacts/'));
    const next = store.getState().customers.allContactsNext!;
    expect(next).toContain('page=2');
    await store.dispatch(loadMoreContacts(next));
    expect(store.getState().customers.allContacts).toHaveLength(3);
    expect(store.getState().customers.allContactsNext).toBeNull();

    await store.dispatch(fetchAllContacts('/contacts/'));
    await store.dispatch(fetchAllContacts('/contacts/?role=other'));
    await store.dispatch(loadMoreContacts(next));
    expect(store.getState().customers.allContacts).toEqual([]);
  });

  it('a Load more still in flight when someone is deleted never lands on the list read after it', async () => {
    let release: (value: unknown) => void = () => {};
    const held = new Promise((resolve) => (release = resolve));
    const spy = stubContactsApi({ pageSize: 1 });
    const store = makeStore();
    await store.dispatch(fetchAllContacts('/contacts/'));
    const next = store.getState().customers.allContactsNext!;
    const fast = spy.getMockImplementation()!;
    // The old page 2 (Mira) is read now, and answers late.
    spy.mockImplementationOnce(async (...args) => {
      const reply = await fast(...args);
      await held;
      return reply;
    });
    const more = store.dispatch(loadMoreContacts(next));
    await store.dispatch(deleteContact(42));
    expect(store.getState().customers.allContactsLoadingMore).toBe(false);
    await store.dispatch(fetchAllContacts('/contacts/'));
    // The new list continues at the same URL, so only the request id tells them apart.
    expect(store.getState().customers.allContactsNext).toBe(next);
    release(null);
    await more;
    expect(store.getState().customers.allContacts.map((c) => c.name)).toEqual(['Lukas Vermeer']);
  });

  it('reads a person and their history; a 404 says they cannot be opened', async () => {
    stubContactsApi();
    const store = makeStore();
    await store.dispatch(fetchContactById(41));
    await store.dispatch(fetchContactHistory(41));
    expect(store.getState().customers.selectedContact).toEqual(LUKAS);
    expect(store.getState().customers.selectedContactHistory).toEqual(LUKAS_HISTORY);

    await store.dispatch(fetchContactById(999));
    await store.dispatch(fetchContactHistory(999));
    expect(store.getState().customers.selectedContactError).toBe(CONTACT_NOT_FOUND);
    expect(store.getState().customers.selectedContactHistoryError).toBe(CONTACT_NOT_FOUND);
    expect(store.getState().customers.selectedContactHistory).toBeNull();
  });
});
