import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DashboardToolbar } from './DashboardToolbar';

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

const filters = [
  { key: 'days', label: 'Window', clearable: false, options: [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }] },
  { key: 'owner', label: 'Primary Owner', options: [{ value: '', label: 'All' }, { value: '7', label: 'Carl CSM (9)', display: 'Carl CSM' }] },
];

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/dashboard/health/:view"
          element={
            <>
              <DashboardToolbar
                subViews={[
                  { label: 'Usage', path: '/dashboard/health/usage' },
                  { label: 'Activity', path: '/dashboard/health/activity' },
                ]}
                filters={filters}
                defaults={{ days: '90' }}
                count="3 of 9 accounts"
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardToolbar', () => {
  it('marks the current sub-view and keeps filters when switching', async () => {
    renderAt('/dashboard/health/usage?owner=7');
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('link', { name: 'Activity' }));
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/health/activity?owner=7');
  });

  it('writes a picked filter to the URL', async () => {
    renderAt('/dashboard/health/usage');
    await userEvent.selectOptions(screen.getByLabelText('Primary Owner'), '7');
    expect(screen.getByTestId('where').textContent).toContain('owner=7');
  });

  it('shows the count and a Clear that leaves the period alone', async () => {
    renderAt('/dashboard/health/usage?owner=7&days=30');
    expect(screen.getByText('3 of 9 accounts')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear 1' }));
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/health/usage?days=30');
  });

  it('hides the count and Clear with no active filter', () => {
    renderAt('/dashboard/health/usage?days=30');
    expect(screen.queryByText('3 of 9 accounts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear/ })).not.toBeInTheDocument();
  });

  // The chip's visible face (the span the opacity-0 <select> sits over).
  const chip = (label: string) =>
    screen.getByLabelText(label).parentElement!.querySelector('span:not(.sr-only)') as HTMLElement;

  it('shows the short display label on the chip, the counted label only in the dropdown', () => {
    renderAt('/dashboard/health/usage?owner=7');
    expect(chip('Primary Owner')).toHaveTextContent(/^Primary OwnerCarl CSM$/);
    expect(screen.getByRole('option', { name: 'Carl CSM (9)' })).toBeInTheDocument();
  });

  it('styles a period as active only when it differs from its default', () => {
    const { unmount } = renderAt('/dashboard/health/usage?days=90');
    expect(chip('Window')).not.toHaveClass('border-accent');
    unmount();
    renderAt('/dashboard/health/usage?days=30');
    expect(chip('Window')).toHaveClass('border-accent');
  });

  it('styles a clearable filter as active only when set', () => {
    const { unmount } = renderAt('/dashboard/health/usage');
    expect(chip('Primary Owner')).not.toHaveClass('border-accent');
    unmount();
    renderAt('/dashboard/health/usage?owner=7');
    expect(chip('Primary Owner')).toHaveClass('border-accent');
  });

  it('lets the filter row grow when it wraps, with chips a fixed height', () => {
    renderAt('/dashboard/health/usage');
    const label = screen.getByLabelText('Primary Owner').parentElement as HTMLElement;
    expect(label).toHaveClass('h-9');
    const row = label.parentElement as HTMLElement;
    expect(row).toHaveClass('min-h-9');
    expect(row).not.toHaveClass('h-9');
  });

  it('shows keyboard focus on the visible chip', () => {
    renderAt('/dashboard/health/usage');
    expect(chip('Primary Owner')).toHaveClass(
      'group-focus-within:outline',
      'group-focus-within:outline-2',
      'group-focus-within:outline-accent',
    );
  });
});
