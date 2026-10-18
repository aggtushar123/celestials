import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { fetchCalls } from '../../../features/calls/callsSlice';
import { fetchContactsForCustomer, fetchOpportunitiesForCustomer, fetchRisksForCustomer } from '../../../features/customers/customersSlice';
import { fetchFiles } from '../../../features/files/filesSlice';
import type { DetailTab } from '../../../features/organizations/detailParams';
import { ACCOUNTS, CALLS, CONTACTS, FILES, OPPORTUNITIES, RISKS } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { useChipCounts } from './useChipCounts';

const ORG = { entityType: 'organization' as const, customerId: 7 };

function setup(tab: DetailTab, storyCounts: Record<string, number> | null = null, customerId = 7) {
  const store = makeDetailStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useChipCounts(tab, storyCounts, ACCOUNTS, customerId), { wrapper });
  return { store, result };
}

describe('useChipCounts: the chips count the active tab (spec 2026-09-27 §1)', () => {
  it("Story: the story's own facet counts", () => {
    expect(setup('story', { all: 5, none: 3, '31': 1, '32': 1 }).result.current).toEqual({ all: 5, none: 3, '31': 1, '32': 1 });
  });

  it('People: the people by account, and no numbers while they load', () => {
    const { store, result } = setup('people');
    act(() => {
      store.dispatch(fetchContactsForCustomer.pending('r1', 7));
    });
    expect(result.current).toBeNull();
    act(() => {
      store.dispatch(fetchContactsForCustomer.fulfilled(CONTACTS, 'r1', 7));
    });
    expect(result.current).toEqual({ all: 3, none: 1, '31': 1, '32': 1 });
  });

  it('Deals & risks: opportunities plus risks, once both have landed', () => {
    const { store, result } = setup('deals');
    act(() => {
      store.dispatch(fetchOpportunitiesForCustomer.pending('r1', 7));
      store.dispatch(fetchRisksForCustomer.pending('r2', 7));
      store.dispatch(fetchOpportunitiesForCustomer.fulfilled(OPPORTUNITIES, 'r1', 7));
    });
    expect(result.current).toBeNull();
    act(() => {
      store.dispatch(fetchRisksForCustomer.fulfilled(RISKS, 'r2', 7));
    });
    expect(result.current).toEqual({ all: 3, none: 1, '31': 1, '32': 1 });
  });

  it('Deals & risks: counts the opportunities alone when the risks failed', () => {
    const { store, result } = setup('deals');
    act(() => {
      store.dispatch(fetchOpportunitiesForCustomer.pending('r1', 7));
      store.dispatch(fetchRisksForCustomer.pending('r2', 7));
      store.dispatch(fetchOpportunitiesForCustomer.fulfilled(OPPORTUNITIES, 'r1', 7));
      store.dispatch(fetchRisksForCustomer.rejected(null, 'r2', 7, 'Could not load risks.'));
    });
    expect(result.current).toEqual({ all: 2, none: 1, '31': 1, '32': 0 });
  });

  it('Files: counts the files alone when the calls failed', () => {
    const { store, result } = setup('files');
    act(() => {
      store.dispatch(fetchFiles.pending('r1', ORG));
      store.dispatch(fetchCalls.pending('r2', ORG));
      store.dispatch(fetchFiles.fulfilled(FILES, 'r1', ORG));
      store.dispatch(fetchCalls.rejected(null, 'r2', ORG, 'Could not load the calls.'));
    });
    expect(result.current).toEqual({ all: 2, none: 1, '31': 1, '32': 0 });
  });

  it('Files: files plus calls', () => {
    const { store, result } = setup('files');
    act(() => {
      store.dispatch(fetchFiles.pending('r1', ORG));
      store.dispatch(fetchCalls.pending('r2', ORG));
      store.dispatch(fetchFiles.fulfilled(FILES, 'r1', ORG));
      store.dispatch(fetchCalls.fulfilled(CALLS, 'r2', ORG));
    });
    expect(result.current).toEqual({ all: 4, none: 2, '31': 2, '32': 0 });
  });

  it("shows no numbers while the lists hold another organization's records", () => {
    const { store, result } = setup('people', null, 8);
    act(() => {
      store.dispatch(fetchContactsForCustomer.pending('r1', 7));
      store.dispatch(fetchContactsForCustomer.fulfilled(CONTACTS, 'r1', 7));
      store.dispatch(fetchFiles.pending('r2', ORG));
      store.dispatch(fetchFiles.fulfilled(FILES, 'r2', ORG));
      store.dispatch(fetchCalls.pending('r3', ORG));
      store.dispatch(fetchCalls.fulfilled(CALLS, 'r3', ORG));
      store.dispatch(fetchOpportunitiesForCustomer.pending('r4', 7));
      store.dispatch(fetchOpportunitiesForCustomer.fulfilled(OPPORTUNITIES, 'r4', 7));
      store.dispatch(fetchRisksForCustomer.pending('r5', 7));
      store.dispatch(fetchRisksForCustomer.fulfilled(RISKS, 'r5', 7));
    });
    expect(result.current).toBeNull();
    const files = renderHook(() => useChipCounts('files', null, ACCOUNTS, 8), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    });
    expect(files.result.current).toBeNull();
    const deals = renderHook(() => useChipCounts('deals', null, ACCOUNTS, 8), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    });
    expect(deals.result.current).toBeNull();
  });

  it('shows no numbers after a failed read', () => {
    const { store, result } = setup('people');
    act(() => {
      store.dispatch(fetchContactsForCustomer.pending('r1', 7));
      store.dispatch(fetchContactsForCustomer.rejected(null, 'r1', 7, 'Could not load contacts.'));
    });
    expect(result.current).toBeNull();
  });

  it('has nothing to count on Details and Knowledge', () => {
    expect(setup('details').result.current).toBeNull();
    expect(setup('knowledge').result.current).toBeNull();
  });
});
