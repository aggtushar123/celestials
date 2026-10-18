import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { healthRow } from '../testUtils';
import { RenewalQueueTable } from './RenewalQueueTable';
import { renewalQueue, renewalRows } from '../renewal';

/** Local midnight, matching the other suites, so calendar-day maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

describe('RenewalQueueTable', () => {
  const cold = healthRow({ id: '1', account: 'ColdAcct', renewalDate: 'Jul 1, 2026', daysSinceTouch: 200 });
  const { rows } = renewalRows([cold], NOW);

  it('keys the colours the Last contact column is drawn in', () => {
    render(<RenewalQueueTable queue={renewalQueue(rows)} currency="USD" />);
    const key = screen.getByText('No contact 60d+').closest('ul') as HTMLElement;
    expect(within(key).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'No contact 60d+',
      '30–60d',
    ]);
  });

  it('is a bounded list of at most 12 rows, so it does not scroll inside its card', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      healthRow({ id: String(i), account: `Acct ${i}`, renewalDate: 'Jul 1, 2026' }),
    );
    const { rows: scored } = renewalRows(many, NOW);
    render(<RenewalQueueTable queue={renewalQueue(scored)} currency="USD" />);
    expect(screen.getAllByRole('row')).toHaveLength(13); // header + 12
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
