import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { healthRow } from '../testUtils';
import { triage, RENEWAL_URGENT_DAYS } from '../triage';
import { TriageQueue } from './TriageQueue';

const NOW = new Date(2026, 5, 15);
const scored = triage(
  Array.from({ length: 30 }, (_, i) => healthRow({ id: String(i), account: `Acct ${i}` })),
  NOW,
);

describe('TriageQueue', () => {
  it('keys the health colours and both red glyph states', () => {
    render(<TriageQueue scored={scored} />);
    const legend = screen.getByText('Pulses disagree').closest('ul') as HTMLElement;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Good',
      'Average',
      'Poor',
      'Pulses disagree',
      `Renews ≤ ${RENEWAL_URGENT_DAYS} days`,
    ]);
  });

  it('scrolls the expanded queue inside one capped region with the header pinned', () => {
    render(<TriageQueue scored={scored} limit={scored.length} />);
    const region = screen.getByRole('region', { name: 'Accounts by risk score' });
    expect(region).toHaveStyle({ maxHeight: '640px' });
    // One scroller for both directions: no inner overflow-x track to trap rows.
    expect(region).toHaveClass('overflow-auto');
    expect(within(region).getAllByRole('listitem')).toHaveLength(30);
    expect(within(region).getByText('Account').parentElement).toHaveClass('sticky', 'top-0', 'bg-surface');
  });
});
