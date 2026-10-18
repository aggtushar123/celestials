import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithDrill, healthRow } from '../testUtils';
import { RenewalRunwayChart } from './RenewalRunwayChart';
import { renewalBuckets } from '../movement';
import { sizeCharts } from '../../../../../test/chartSize';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts();

/** Local midnight, matching the other suites, so calendar-day maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

// Recharts' <Bar onClick> only fires on a real, sized SVG layout, which jsdom
// doesn't give it — same limitation ControlsCharts.test.tsx and
// MovementView.test.tsx work around. `DrillTargets` renders plain buttons
// alongside the chart precisely so keyboard users (and these tests) have a
// real, clickable element regardless of chart layout.

describe('RenewalRunwayChart drill', () => {
  const soonPoor = healthRow({ id: '1', account: 'SoonPoor', renewalDate: 'Jul 1, 2026', healthStatus: 'Poor' }); // 16d
  // Near miss: same bucket, different health status.
  const soonGood = healthRow({ id: '2', account: 'SoonGood', renewalDate: 'Jul 2, 2026', healthStatus: 'Good' }); // 17d
  // Near miss: same health status, a different (much later) bucket.
  const farPoor = healthRow({ id: '3', account: 'FarPoor', renewalDate: 'Dec 1, 2027', healthStatus: 'Poor' }); // 534d

  const buckets = renewalBuckets([soonPoor, soonGood, farPoor], NOW);

  it('opens exactly the accounts in one bucket × health segment via the keyboard target', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalRunwayChart buckets={buckets} />);

    await user.click(screen.getByRole('button', { name: '0–90 days · Poor 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'SoonPoor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'SoonGood' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'FarPoor' })).not.toBeInTheDocument();
  });

  it('opens a different segment for the same status in a later bucket', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalRunwayChart buckets={buckets} />);

    await user.click(screen.getByRole('button', { name: '271+ days · Poor 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'FarPoor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'SoonPoor' })).not.toBeInTheDocument();
  });

  it('offers no target for an empty bucket-status segment', () => {
    renderWithDrill(<RenewalRunwayChart buckets={buckets} />);
    // No account in this book renews in 91-180 or 181-270 days at all.
    expect(screen.queryByRole('button', { name: /91–180 days/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /181–270 days/ })).not.toBeInTheDocument();
  });
});

describe('RenewalRunwayChart legend and axes', () => {
  const soonPoor = healthRow({ id: '1', account: 'SoonPoor', renewalDate: 'Jul 1, 2026', healthStatus: 'Poor' });
  const soonGood = healthRow({ id: '2', account: 'SoonGood', renewalDate: 'Jul 2, 2026', healthStatus: 'Good' });
  const farPoor = healthRow({ id: '3', account: 'FarPoor', renewalDate: 'Dec 1, 2027', healthStatus: 'Poor' });
  const buckets = renewalBuckets([soonPoor, soonGood, farPoor], NOW);
  const labels = (container: HTMLElement) =>
    [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);

  it('keys the three health colours on its own card', () => {
    renderWithDrill(<RenewalRunwayChart buckets={buckets} />);
    const legend = screen.getByText('Good').closest('ul') as HTMLElement;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Good',
      'Average',
      'Poor',
    ]);
  });

  it('titles the bucket axis', () => {
    renderWithDrill(<RenewalRunwayChart buckets={buckets} />);
    expect(screen.getByText('Days to renewal')).toBeInTheDocument();
  });

  it('puts each total on its own bucket and marks the empty ones "0"', () => {
    const { container } = renderWithDrill(<RenewalRunwayChart buckets={buckets} />);
    // 0–90 holds two accounts, 271+ one; the two middle buckets are empty.
    expect(labels(container).sort()).toEqual(['0', '0', '1', '2']);
  });

  it('keeps tick text at 10px or more', () => {
    const { container } = renderWithDrill(<RenewalRunwayChart buckets={buckets} />);
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
  });
});
