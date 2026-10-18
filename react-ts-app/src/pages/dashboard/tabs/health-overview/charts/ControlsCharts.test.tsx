import { describe, it, expect } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HealthDataRow, HealthStatus } from '../../../../../features/health/types';
import { AccountsByRenewalDateBar } from './AccountsByRenewalDateBar';
import { HealthChangeOverTimeStacked } from './HealthChangeOverTimeStacked';
import { topSegment } from '../../../shared/stackedTotalLabel';
import { healthRow, renderWithDrill } from '../testUtils';

// Both of these charts used to ignore the data they were handed and draw
// invented numbers — a hardcoded month list scaled by row count, and a
// `20 + i * 15` ramp. Recharts needs a sized container jsdom won't give it, so
// these assert on the derived summary text instead of on bars; the point is
// that the output moves with the input at all, which it previously did not.

const M = ['Jan 31, 2026', 'Feb 28, 2026', 'Mar 31, 2026', 'Apr 30, 2026'];

function makeRow(statuses: HealthStatus[], overrides: Partial<HealthDataRow> = {}): HealthDataRow {
  return healthRow({
    healthStatus: statuses[statuses.length - 1] ?? 'Good',
    history: statuses.map((status, i) => ({ month: M[i], status })),
    ...overrides,
  });
}

describe('AccountsByRenewalDateBar', () => {
  const at = (id: string, renewalDate: string) => makeRow(['Good'], { id, renewalDate });

  it('names the busiest renewal month from the data', () => {
    renderWithDrill(
      <AccountsByRenewalDateBar
        data={[
          at('1', 'Jul 1, 2026'),
          at('2', 'Jul 14, 2026'),
          at('3', 'Jul 30, 2026'),
          at('4', 'Sep 2, 2026'),
        ]}
      />,
    );
    expect(screen.getByText(/Busiest: Jul 2026 · 3 renewing/)).toBeInTheDocument();
  });

  it('follows the data rather than a fixed month list', () => {
    renderWithDrill(<AccountsByRenewalDateBar data={[at('1', 'Jul 1, 2026')]} />);
    expect(screen.getByText(/Busiest: Jul 2026 · 1 renewing/)).toBeInTheDocument();

    cleanup();
    renderWithDrill(
      <AccountsByRenewalDateBar data={[at('1', 'Mar 3, 2027'), at('2', 'Mar 9, 2027')]} />,
    );
    expect(screen.getByText(/Busiest: Mar 2027 · 2 renewing/)).toBeInTheDocument();
    expect(screen.queryByText(/Jul 2026/)).not.toBeInTheDocument();
  });

  it('says so when no renewal date can be read', () => {
    renderWithDrill(<AccountsByRenewalDateBar data={[at('1', ''), at('2', 'whenever')]} />);
    expect(screen.getByText(/No readable renewal dates/i)).toBeInTheDocument();
  });

  it('renders nothing misleading for an empty selection', () => {
    renderWithDrill(<AccountsByRenewalDateBar data={[]} />);
    expect(screen.getByText(/No readable renewal dates/i)).toBeInTheDocument();
    expect(screen.queryByText(/Busiest/)).not.toBeInTheDocument();
  });
});

describe('AccountsByRenewalDateBar drill', () => {
  const julyGood = healthRow({ id: '1', account: 'JulyGood', renewalDate: 'Jul 1, 2026', healthStatus: 'Good' });
  // Near miss: same month, a different health status.
  const julyPoor = healthRow({ id: '2', account: 'JulyPoor', renewalDate: 'Jul 14, 2026', healthStatus: 'Poor' });
  // Near miss: same health status, a different month.
  const augustPoor = healthRow({ id: '3', account: 'AugustPoor', renewalDate: 'Aug 2, 2026', healthStatus: 'Poor' });

  it('opens exactly the accounts in one month × health segment', async () => {
    const user = userEvent.setup();
    renderWithDrill(<AccountsByRenewalDateBar data={[julyGood, julyPoor, augustPoor]} />);

    await user.click(screen.getByRole('button', { name: 'Jul 2026 · Good 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'JulyGood' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'JulyPoor' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'AugustPoor' })).not.toBeInTheDocument();
  });

  it('opens a different segment for the same status in a different month', async () => {
    const user = userEvent.setup();
    renderWithDrill(<AccountsByRenewalDateBar data={[julyGood, julyPoor, augustPoor]} />);

    await user.click(screen.getByRole('button', { name: 'Aug 2026 · Poor 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'AugustPoor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'JulyPoor' })).not.toBeInTheDocument();
  });

  it('offers no target at all when drillable is false (a truncated book)', () => {
    renderWithDrill(<AccountsByRenewalDateBar data={[julyGood, julyPoor]} drillable={false} />);
    expect(screen.queryAllByRole('button', { name: /show accounts/ })).toHaveLength(0);
  });

  it('offers no target for an empty month-status segment', () => {
    renderWithDrill(<AccountsByRenewalDateBar data={[julyGood]} />);
    expect(screen.queryByRole('button', { name: /Jul 2026 · Poor/ })).not.toBeInTheDocument();
  });
});

describe('HealthChangeOverTimeStacked', () => {
  it('reports how many months of real history it found', () => {
    render(<HealthChangeOverTimeStacked data={[makeRow(['Good', 'Average', 'Poor'])]} />);
    expect(screen.getByText(/3 months of recorded history/)).toBeInTheDocument();
  });

  it('follows the history it is given rather than a fixed ramp', () => {
    render(<HealthChangeOverTimeStacked data={[makeRow(['Good', 'Average'])]} />);
    expect(screen.getByText(/2 months of recorded history/)).toBeInTheDocument();

    cleanup();
    render(<HealthChangeOverTimeStacked data={[makeRow(['Good', 'Average', 'Poor', 'Good'])]} />);
    expect(screen.getByText(/4 months of recorded history/)).toBeInTheDocument();
  });

  it('handles a single month without claiming plural', () => {
    render(<HealthChangeOverTimeStacked data={[makeRow(['Good'])]} />);
    expect(screen.getByText(/1 month of recorded history/)).toBeInTheDocument();
  });

  it('says so when the selection carries no history', () => {
    render(<HealthChangeOverTimeStacked data={[makeRow([])]} />);
    expect(screen.getByText(/No health history for the current selection/i)).toBeInTheDocument();
  });

  it('renders nothing misleading for an empty selection', () => {
    render(<HealthChangeOverTimeStacked data={[]} />);
    expect(screen.getByText(/No health history for the current selection/i)).toBeInTheDocument();
  });
});

describe('topSegment', () => {
  const d = (Good: number, Average: number, Poor: number) => ({
    Good,
    Average,
    Poor,
    total: Good + Average + Poor,
  });

  it('picks the highest segment that actually has accounts', () => {
    expect(topSegment(d(3, 2, 1))).toBe('Good');
    // The bug this exists for: a bar with no Good accounts still needs its
    // total drawn, on whichever segment is on top instead.
    expect(topSegment(d(0, 2, 1))).toBe('Average');
    expect(topSegment(d(0, 0, 4))).toBe('Poor');
  });

  it('returns nothing for an empty bar', () => {
    expect(topSegment(d(0, 0, 0))).toBeUndefined();
  });
});
