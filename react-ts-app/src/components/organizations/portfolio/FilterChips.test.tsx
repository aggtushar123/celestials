import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips } from './FilterChips';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';

describe('FilterChips', () => {
  it('removes a chip and clears all', async () => {
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(
      <FilterChips
        params={parseParams(new URLSearchParams('owner=2&ids=7'))}
        options={FILTER_OPTIONS}
        onChange={onChange}
        onClearAll={onClearAll}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Opened from the dashboard (1)' }));
    expect(onChange).toHaveBeenCalledWith({ ids: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('renders each active filter as a removable chip and Clear all, and nothing when no filter is on', () => {
    const { rerender } = render(
      <FilterChips params={parseParams(new URLSearchParams('health=poor'))} options={null} onChange={vi.fn()} onClearAll={vi.fn()} />,
    );
    const group = screen.getByRole('group', { name: 'Active filters' });
    expect(within(group).getByRole('button', { name: /^Remove filter: / })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
    rerender(<FilterChips params={parseParams(new URLSearchParams())} options={null} onChange={vi.fn()} onClearAll={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull();
  });
});
