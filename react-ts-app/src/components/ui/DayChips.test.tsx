import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayChips } from './DayChips';

const DAYS = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }, { value: 7, label: 'Sunday' },
];

describe('DayChips (settings production spec §5.5)', () => {
  it('names each chip by its full day and shows its first letter', () => {
    render(<DayChips label="Working days" days={DAYS} value={[1, 2]} onChange={vi.fn()} />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    expect(monday).toHaveTextContent('M');
    expect(monday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Working days' })).toBeInTheDocument();
  });

  it('adds and removes a day, keeping the order', async () => {
    const onChange = vi.fn();
    render(<DayChips label="Working days" days={DAYS} value={[3, 1]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3]);
    await userEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(onChange).toHaveBeenLastCalledWith([1]);
  });
});
