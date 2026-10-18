import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { FilterNamesProvider } from './FilterNamesProvider';
import { parseDashboardPath, useDashboardContext } from './useDashboardContext';

const options = {
  owners: [{ value: '2', name: 'Priya' }],
  lifecycles: [{ value: 'customer', name: 'Customer' }],
  customers: [{ value: '12', name: 'Uber' }],
};

function wrapperAt(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <FilterNamesProvider>
        {/* The toolbar every view renders is what reports the names. */}
        <DashboardToolbar subViews={[]} filters={bookFilters(options)} />
        {children}
      </FilterNamesProvider>
    </MemoryRouter>
  );
}

describe('useDashboardContext', () => {
  it.each([
    ['/dashboard/overview', { area: 'overview', view: null, filters: { owner: '', lifecycle: '', customer: '' } }, 'Overview'],
    ['/dashboard/revenue/forecast?owner=2&lifecycle=customer', { area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: 'customer', customer: '' } }, 'Revenue › Forecast · Owner: Priya · Lifecycle: Customer'],
    ['/dashboard/health/triage?customer=12&period=90', { area: 'health', view: 'triage', filters: { owner: '', lifecycle: '', customer: '12' } }, 'Health › Triage · Account: Uber'],
    ['/dashboard/support/topics?owner=9', { area: 'support', view: 'topics', filters: { owner: '9', lifecycle: '', customer: '' } }, 'Support › Topics · Owner: 9'],
  ])('%s', async (url, expected, label) => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper: wrapperAt(url) });
    expect(result.current.context).toEqual({ surface: 'dashboard', focus: null, ...expected });
    await waitFor(() => expect(result.current.label).toBe(label));
  });

  it('has no context off a real view (mid-redirect, unknown view, another page)', () => {
    expect(parseDashboardPath('/dashboard/revenue')).toBeNull();
    expect(parseDashboardPath('/dashboard/revenue/bogus')).toBeNull();
    expect(parseDashboardPath('/organizations')).toBeNull();
    const { result } = renderHook(() => useDashboardContext(), { wrapper: wrapperAt('/dashboard/health') });
    expect(result.current).toEqual({ context: null, label: '' });
  });
});
