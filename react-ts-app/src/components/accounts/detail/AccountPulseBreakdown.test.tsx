import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AccountPulseBreakdown } from './AccountPulseBreakdown';
import type { AccountPulse } from '../../../features/customers/customersSlice';

function pulse(overrides: Partial<AccountPulse> = {}): AccountPulse {
  return {
    value: '3.5',
    label: 'Watch',
    category: 1,
    breakdown: [],
    ...overrides,
  };
}

describe('AccountPulseBreakdown (decision 3)', () => {
  it('shows a designed one-line empty state instead of an empty list when nothing was measured', () => {
    render(<AccountPulseBreakdown id="pulse" pulse={pulse({ breakdown: [] })} error={null} />);
    expect(screen.getByText('No signals measured yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('treats a non-numeric reading as no reading, not a "Poor" band with a NaN-width bar', () => {
    render(
      <AccountPulseBreakdown
        id="pulse"
        pulse={pulse({
          breakdown: [{ key: 'ai_pulse', label: 'AI pulse', weight: '1', reading: 'not-a-number', note: '' }],
        })}
        error={null}
      />,
    );
    const row = screen.getByText('AI pulse').closest('li')!;
    expect(within(row).getByText('No data')).toBeInTheDocument();
    expect(within(row).queryByText('Poor')).not.toBeInTheDocument();
    const bar = row.querySelector('[style]');
    expect(bar?.getAttribute('style') ?? '').not.toContain('NaN');
  });

  it('still shows a real numeric reading in its band', () => {
    render(
      <AccountPulseBreakdown
        id="pulse"
        pulse={pulse({
          breakdown: [{ key: 'ai_pulse', label: 'AI pulse', weight: '1', reading: '4.5', note: '' }],
        })}
        error={null}
      />,
    );
    const row = screen.getByText('AI pulse').closest('li')!;
    expect(row).toHaveTextContent('Good');
  });
});
