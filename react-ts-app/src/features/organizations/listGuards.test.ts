import { describe, expect, it } from 'vitest';
import { fetchCalls } from '../calls/callsSlice';
import { fetchContactsForCustomer, fetchOpportunitiesForCustomer, fetchRisksForCustomer } from '../customers/customersSlice';
import { fetchFiles } from '../files/filesSlice';
import { makeDetailStore } from '../../pages/organizations/testDetail';
import { CALLS, CONTACTS, FILES, OPPORTUNITIES, RISKS } from './testStory';

// The organization page's lists share one slot each across organizations:
// a slower read for the organization before never lands under the next one.

const A = 7;
const B = 8;

describe('list slots keep a slower read for another organization out', () => {
  it('contacts', () => {
    const store = makeDetailStore();
    store.dispatch(fetchContactsForCustomer.pending('a', A));
    store.dispatch(fetchContactsForCustomer.pending('b', B));
    store.dispatch(fetchContactsForCustomer.fulfilled(CONTACTS, 'a', A));
    expect(store.getState().customers.contacts).toEqual([]);
    expect(store.getState().customers.contactsLoading).toBe(true);
    store.dispatch(fetchContactsForCustomer.rejected(null, 'a', A, 'Could not load contacts.'));
    expect(store.getState().customers.contactsError).toBeNull();
    store.dispatch(fetchContactsForCustomer.fulfilled([CONTACTS[0]], 'b', B));
    expect(store.getState().customers.contacts.map((c) => c.id)).toEqual([51]);
    expect(store.getState().customers.contactsFor).toBe('organization:8');
  });

  it('opportunities and risks', () => {
    const store = makeDetailStore();
    store.dispatch(fetchOpportunitiesForCustomer.pending('a1', A));
    store.dispatch(fetchRisksForCustomer.pending('a2', A));
    store.dispatch(fetchOpportunitiesForCustomer.pending('b1', B));
    store.dispatch(fetchRisksForCustomer.pending('b2', B));
    store.dispatch(fetchOpportunitiesForCustomer.fulfilled(OPPORTUNITIES, 'a1', A));
    store.dispatch(fetchRisksForCustomer.fulfilled(RISKS, 'a2', A));
    const state = store.getState().customers;
    expect(state.pipelineOpportunities).toEqual([]);
    expect(state.pipelineRisks).toEqual([]);
    expect(state.pipelineOpportunitiesLoading).toBe(true);
    expect(state.pipelineRisksLoading).toBe(true);
  });

  it('files and calls: another organization leaves nothing behind while the next one loads', () => {
    const store = makeDetailStore();
    store.dispatch(fetchFiles.pending('a1', { entityType: 'organization', customerId: A }));
    store.dispatch(fetchFiles.fulfilled(FILES, 'a1', { entityType: 'organization', customerId: A }));
    store.dispatch(fetchCalls.pending('a2', { entityType: 'organization', customerId: A }));
    store.dispatch(fetchCalls.fulfilled(CALLS, 'a2', { entityType: 'organization', customerId: A }));
    store.dispatch(fetchFiles.pending('a3', { entityType: 'organization', customerId: A }));
    store.dispatch(fetchFiles.pending('b1', { entityType: 'organization', customerId: B }));
    store.dispatch(fetchCalls.pending('b2', { entityType: 'organization', customerId: B }));
    expect(store.getState().files.items).toEqual([]);
    expect(store.getState().calls.items).toEqual([]);
    store.dispatch(fetchFiles.fulfilled(FILES, 'a3', { entityType: 'organization', customerId: A }));
    expect(store.getState().files.items).toEqual([]);
    expect(store.getState().files.isLoading).toBe(true);
    store.dispatch(fetchFiles.fulfilled([FILES[1]], 'b1', { entityType: 'organization', customerId: B }));
    expect(store.getState().files.items.map((f) => f.id)).toEqual([82]);
    expect(store.getState().files.scope).toBe('organization:8');
    expect(store.getState().calls.scope).toBeNull();
  });

  it('a read again for the same organization keeps its rows until the new ones land', () => {
    const store = makeDetailStore();
    const org = { entityType: 'organization' as const, customerId: A };
    store.dispatch(fetchContactsForCustomer.pending('a', A));
    store.dispatch(fetchContactsForCustomer.fulfilled(CONTACTS, 'a', A));
    store.dispatch(fetchOpportunitiesForCustomer.pending('b', A));
    store.dispatch(fetchOpportunitiesForCustomer.fulfilled(OPPORTUNITIES, 'b', A));
    store.dispatch(fetchFiles.pending('c', org));
    store.dispatch(fetchFiles.fulfilled(FILES, 'c', org));
    store.dispatch(fetchCalls.pending('d', org));
    store.dispatch(fetchCalls.fulfilled(CALLS, 'd', org));

    store.dispatch(fetchContactsForCustomer.pending('a2', A));
    store.dispatch(fetchOpportunitiesForCustomer.pending('b2', A));
    store.dispatch(fetchFiles.pending('c2', org));
    store.dispatch(fetchCalls.pending('d2', org));
    const { customers, files, calls } = store.getState();
    expect(customers.contacts).toHaveLength(3);
    expect(customers.contactsFor).toBe('organization:7');
    expect(customers.pipelineOpportunities).toHaveLength(2);
    expect(files.items).toHaveLength(2);
    expect(calls.items).toHaveLength(2);
  });
});
