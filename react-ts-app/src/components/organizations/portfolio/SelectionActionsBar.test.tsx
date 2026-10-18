import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLEAR_DATE, SelectionActionsBar, type BulkReport } from './SelectionActionsBar';

const NOUN = { one: 'opportunity', many: 'opportunities' };
const CHOICES = [
  {
    key: 'set_stage',
    label: 'Set stage',
    options: [
      { value: 'negotiation', name: 'Negotiation' },
      { value: 'closed_lost', name: 'Closed Lost' },
    ],
  },
  { key: 'set_priority', label: 'Set priority', options: [{ value: 'high', name: 'High' }] },
];
const DATE = { key: 'set_date', label: 'Set date', clearLabel: 'Clear date' };

function renderBar(report: BulkReport | null = null, count = 2) {
  const onApply = vi.fn();
  render(
    <SelectionActionsBar
      count={count}
      noun={NOUN}
      choices={CHOICES}
      dateChoice={DATE}
      activity={null}
      report={report}
      onApply={onApply}
      onExport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onApply;
}

describe('SelectionActionsBar', () => {
  it('arms one choice at a time and applies it with "Apply to N"', async () => {
    const onApply = renderBar();
    const bar = screen.getByRole('region', { name: 'Selection' });
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set stage' }), 'closed_lost');
    expect(within(bar).getAllByRole('button', { name: 'Apply to 2' })).toHaveLength(1);
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set priority' }), 'high');
    expect(within(bar).getByRole('combobox', { name: 'Set stage' })).toHaveValue('');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    expect(onApply).toHaveBeenCalledWith('set_priority', 'high');
    expect(bar).toHaveFocus();
  });

  it('sets a date, or clears it with its own button', async () => {
    const onApply = renderBar();
    const bar = screen.getByRole('region', { name: 'Selection' });
    // user-event cannot type into a date input in jsdom; a change event is what the browser sends.
    fireEvent.change(within(bar).getByLabelText('Set date'), { target: { value: '2026-11-15' } });
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    expect(onApply).toHaveBeenLastCalledWith('set_date', '2026-11-15');
    await userEvent.click(within(bar).getByRole('button', { name: 'Clear date' }));
    expect(within(bar).getByRole('button', { name: 'Clear date' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    expect(onApply).toHaveBeenLastCalledWith('set_date', CLEAR_DATE);
  });

  it('reports in the noun, naming each failure', () => {
    renderBar({ updated: 1, failed: [{ id: 42, name: 'Analytics add-on', reason: 'Not found.' }] }, 1);
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByText('Updated 1 opportunity. 1 failed:')).toBeInTheDocument();
    expect(within(bar).getByText('Analytics add-on')).toBeInTheDocument();
  });
});
