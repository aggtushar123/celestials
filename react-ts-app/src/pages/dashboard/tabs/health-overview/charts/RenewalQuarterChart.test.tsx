import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithDrill, healthRow } from '../testUtils';
import { RenewalQuarterChart } from './RenewalQuarterChart';
import { quarterColumns, renewalRows } from '../renewal';
import { sizeCharts } from '../../../../../test/chartSize';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts();

/** The label of each item in the legend that holds `first`. */
const legendOf = (first: string) =>
  within(screen.getByText(first).closest('ul') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

/** Local midnight, matching the other suites, so calendar-day maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

// Recharts' <Bar onClick> only fires on a real, sized SVG layout, which jsdom
// doesn't give it — same limitation RenewalRunwayChart.test.tsx works around.
// `DrillTargets` renders plain buttons alongside the chart precisely so
// keyboard users (and these tests) have a real, clickable element regardless
// of chart layout.

describe('RenewalQuarterChart drill', () => {
  const soonPoor = healthRow({ id: '1', account: 'SoonPoor', renewalDate: 'Jul 1, 2026', healthStatus: 'Poor', arr: 10_000 });
  // Near miss: same quarter, a different health status.
  const soonGood = healthRow({ id: '2', account: 'SoonGood', renewalDate: 'Jul 2, 2026', healthStatus: 'Good', arr: 20_000 });
  // Near miss: same health status, a much later quarter.
  const laterPoor = healthRow({ id: '3', account: 'LaterPoor', renewalDate: 'Mar 1, 2027', healthStatus: 'Poor', arr: 5_000 });

  const { rows } = renewalRows([soonPoor, soonGood, laterPoor], NOW);
  const columns = quarterColumns(rows, NOW, 4);

  it('opens exactly the accounts in one quarter × health segment', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);

    await user.click(screen.getByRole('button', { name: "Q3 '26 · Poor $10.0K, show accounts" }));
    const dialog = screen.getByRole('dialog');
    // The figure is the money the bar segment shows, not a count of accounts.
    expect(dialog).toHaveTextContent("Q3 '26 · Poor $10.0K");

    expect(within(dialog).getByRole('link', { name: 'SoonPoor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'SoonGood' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'LaterPoor' })).not.toBeInTheDocument();
  });

  it('opens a different segment for the same status in a later quarter', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);

    await user.click(screen.getByRole('button', { name: "Q1 '27 · Poor $5.0K, show accounts" }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'LaterPoor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'SoonPoor' })).not.toBeInTheDocument();
  });

  it('offers no target for an empty quarter-status segment', () => {
    renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);
    expect(screen.queryByRole('button', { name: /Q4 '26/ })).not.toBeInTheDocument();
  });
});

describe('RenewalQuarterChart legend and axes', () => {
  const soonPoor = healthRow({ id: '1', account: 'SoonPoor', renewalDate: 'Jul 1, 2026', healthStatus: 'Poor', arr: 10_000 });
  const laterGood = healthRow({ id: '2', account: 'LaterGood', renewalDate: 'Mar 1, 2027', healthStatus: 'Good', arr: 5_000 });
  const { rows } = renewalRows([soonPoor, laterGood], NOW);
  const columns = quarterColumns(rows, NOW, 4);

  it('keys the three health colours, best first', () => {
    renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);
    expect(legendOf('Good')).toEqual(['Good', 'Average', 'Poor']);
  });

  it('titles the value axis with its currency', () => {
    renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);
    expect(screen.getByText('ARR renewing (USD)')).toBeInTheDocument();
  });

  it('labels an empty quarter "$0" so its column never looks missing', () => {
    const { container } = renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);
    const labels = [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);
    // Q4 '26 has no renewals in this book.
    expect(labels).toContain('$0');
  });

  it('keeps tick text at 10px or more', () => {
    const { container } = renderWithDrill(<RenewalQuarterChart columns={columns} currency="USD" />);
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
  });
});
