import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountDetails, npsBand, timelinePositions } from './AccountDetails';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';

describe('AccountDetails', () => {
  it('shows the six panels in the spec order', () => {
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Commercial',
      'Contract timeline',
      'Adoption',
      'Voice of the customer',
      'Profile',
      'History',
    ]);
  });

  it('keeps the panels out of the landmark list: headed sections, not named regions', () => {
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('prints commercial money in the account currency and numbers with tabular figures', () => {
    const { container } = render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    const tcv = container.querySelector('[data-field="tcv"]');
    expect(tcv).toHaveTextContent('$140,000.00');
    expect(tcv).toHaveClass('tabular-nums');
  });

  it('colours an overdue renewal danger, in the timeline and the date', () => {
    const { container } = render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(container.querySelector('[data-field="renewalDate"]')).toHaveClass('text-danger-ink');
    expect(container.querySelector('[data-mark="renewalDate"]')).toHaveClass('bg-danger');
  });

  it('names the NPS band by the backend sign rule', () => {
    expect(npsBand(-80)).toBe('Detractor');
    expect(npsBand(0)).toBe('Passive');
    expect(npsBand(12)).toBe('Promoter');
    expect(npsBand(null)).toBe('No NPS yet');
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(screen.getByText('Detractor')).toBeInTheDocument();
  });

  it('meters active of contracted seats and quotes the AI pulse reason', () => {
    render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    const meter = screen.getByRole('meter', { name: 'Active of contracted seats' });
    expect(meter).toHaveAttribute('aria-valuenow', '16');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('Usage fell after the admin left.').tagName).toBe('BLOCKQUOTE');
  });

  it('shows the churn fields only for a churned account', () => {
    const { container, rerender } = render(<AccountDetails row={pizzaHut} today="2026-09-25" />);
    expect(container.querySelector('[data-field="churnReason"]')).toBeNull();
    rerender(<AccountDetails row={initech} today="2026-09-25" />);
    const history = container.querySelector('[data-panel="history"]') as HTMLElement;
    expect(within(history).getByText('Budget cuts')).toBeInTheDocument();
    expect(within(history).getByText('Lost the budget line.')).toBeInTheDocument();
  });

  it('offers Edit details when given a handler', async () => {
    const onEdit = vi.fn();
    render(<AccountDetails row={pizzaHut} today="2026-09-25" onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledWith(7);
  });

  it('places timeline marks and today between the earliest and latest date', () => {
    const { marks, today } = timelinePositions(['2024-01-01', null, '2026-01-01'], '2025-01-01');
    expect(marks[0]).toBe(0);
    expect(marks[1]).toBeNull();
    expect(marks[2]).toBe(100);
    expect(today).toBeCloseTo(50, 0);
    expect(timelinePositions([null, null], '2025-01-01')).toEqual({ marks: [null, null], today: null });
  });
});
