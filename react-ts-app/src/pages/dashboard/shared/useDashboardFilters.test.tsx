import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useDashboardFilters, toQuery, sharedSearch, SHARED_KEYS } from './useDashboardFilters';

function Probe() {
  const { values, set, clear, activeCount } = useDashboardFilters([...SHARED_KEYS, 'days'], { days: '90' });
  const location = useLocation();
  return (
    <div>
      <span data-testid="values">{JSON.stringify(values)}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="active">{activeCount(SHARED_KEYS)}</span>
      <button onClick={() => set('owner', '7')}>owner</button>
      <button onClick={() => set('owner', '')}>unset</button>
      <button onClick={() => clear(SHARED_KEYS)}>clear</button>
    </div>
  );
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );

describe('useDashboardFilters', () => {
  it('reads values from the URL and fills defaults for missing keys', () => {
    renderAt('/x?lifecycle=customer_active');
    expect(JSON.parse(screen.getByTestId('values').textContent!)).toEqual({
      owner: '',
      lifecycle: 'customer_active',
      customer: '',
      days: '90',
    });
  });

  it('writes a value into the URL and removes it when emptied', async () => {
    renderAt('/x?lifecycle=customer_active');
    await userEvent.click(screen.getByText('owner'));
    expect(screen.getByTestId('search').textContent).toContain('owner=7');
    await userEvent.click(screen.getByText('unset'));
    expect(screen.getByTestId('search').textContent).not.toContain('owner=');
    expect(screen.getByTestId('search').textContent).toContain('lifecycle=customer_active');
  });

  it('clears only the named keys and counts active ones', async () => {
    renderAt('/x?owner=7&lifecycle=customer_active&days=30');
    expect(screen.getByTestId('active').textContent).toBe('2');
    await userEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('search').textContent).toBe('?days=30');
  });
});

describe('toQuery', () => {
  it('skips empty values and renames keys', () => {
    expect(toQuery({ owner: '7', lifecycle: '', customer: '3' }, { customer: 'account' })).toBe(
      'owner=7&account=3',
    );
  });
});

describe('sharedSearch', () => {
  it('keeps only the shared book filters', () => {
    expect(sharedSearch('?owner=7&days=30&customer=3&scope=x')).toBe('?owner=7&customer=3');
  });
  it('is empty when none are set', () => {
    expect(sharedSearch('?days=30')).toBe('');
  });
});
