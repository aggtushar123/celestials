import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { UsageAccount, UsageBand } from '../../../../../features/usage/usageSlice';
import { DrillProvider } from '../../../drill/DrillContext';
import { sizeCharts } from '../../../../../test/chartSize';
import { UtilisationBandChart } from './UtilisationBandChart';
import { UsageScatter } from './UsageScatter';
import { AccountUsageList } from './AccountUsageList';
import { AdoptionBreadthChart } from './AdoptionBreadthChart';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts(900, 360);

const BANDS: UsageBand[] = [
  { key: 'dormant', name: 'Dormant (<25%)', accounts: 1, arr: 10_000, idle_seats: 40 },
  { key: 'low', name: 'Low (25–50%)', accounts: 1, arr: 20_000, idle_seats: 20 },
  { key: 'fair', name: 'Fair (50–75%)', accounts: 0, arr: 0, idle_seats: 0 },
  { key: 'healthy', name: 'Healthy (75–90%)', accounts: 1, arr: 30_000, idle_seats: 2 },
  { key: 'at_capacity', name: 'At capacity (90–100%)', accounts: 1, arr: 40_000, idle_seats: 0 },
  { key: 'over', name: 'Over-deployed (100%+)', accounts: 0, arr: 0, idle_seats: 0 },
];

const account = (overrides: Partial<UsageAccount>): UsageAccount => ({
  id: 1,
  name: 'Acme',
  owner: 'Carl',
  lifecycle_stage: 'Live',
  health_category: 'good',
  utilisation: 20,
  active_seats: 2,
  contracted_seats: 10,
  idle_seats: 8,
  arr: 10_000,
  shelfware_arr: 8_000,
  products: 1,
  renewal_date: null,
  band: 'dormant',
  ...overrides,
});

const tickTexts = (container: HTMLElement, axis: 'x' | 'y') =>
  [...container.querySelectorAll(`.recharts-${axis}Axis-tick-labels text`)];

function expectReadableTicks(container: HTMLElement) {
  const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
  expect(ticks.length).toBeGreaterThan(0);
  for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
}

describe('UtilisationBandChart legend and axes', () => {
  const draw = () =>
    render(
      <DrillProvider>
        <UtilisationBandChart bands={BANDS} scatter={[]} currency="USD" unmeasured={0} />
      </DrillProvider>,
    );

  it('titles both axes, the money one with its currency', () => {
    draw();
    expect(screen.getByText('Seat utilisation')).toBeInTheDocument();
    expect(screen.getByText('ARR (USD)')).toBeInTheDocument();
  });

  it('writes each band with its range on a second line', () => {
    const { container } = draw();
    const low = tickTexts(container, 'x').find((t) => t.textContent?.startsWith('Low'))!;
    expect([...low.querySelectorAll('tspan')].map((t) => t.textContent)).toEqual(['Low', '25–50%']);
    expectReadableTicks(container);
  });

  it('marks an empty band "$0" rather than leaving a gap', () => {
    const { container } = draw();
    const labels = [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);
    expect(labels).toEqual(['$0', '$0']);
  });
});

describe('UsageScatter legend and axes', () => {
  const points = [account({ band: 'dormant' }), account({ id: 2, band: 'over', utilisation: 110 })];

  it('keys every band in a legend of its own', () => {
    render(<UsageScatter points={points} currency="USD" />);
    const legend = screen.getByText('Dormant').closest('ul') as HTMLElement;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Dormant',
      'Low',
      'Fair',
      'Healthy',
      'At capacity',
      'Over',
    ]);
  });

  it('titles both axes with their units', () => {
    const { container } = render(<UsageScatter points={points} currency="USD" />);
    expect(screen.getByText('Seat utilisation %')).toBeInTheDocument();
    expect(screen.getByText('ARR (USD)')).toBeInTheDocument();
    expectReadableTicks(container);
  });
});

describe('AccountUsageList', () => {
  const draw = (rows: UsageAccount[]) =>
    render(
      <AccountUsageList
        title="Shelfware — what to fix"
        subtitle="Biggest first"
        rows={rows}
        currency="USD"
        moneyColumn="shelfware"
        emptyMessage="Nothing here."
      />,
    );

  it('scrolls inside its card with the header pinned', () => {
    draw([account({})]);
    const region = screen.getByRole('region', { name: 'Shelfware — what to fix' });
    expect(region).toHaveStyle({ maxHeight: '420px' });
    expect(within(region).getByRole('columnheader', { name: 'Account' })).toBeInTheDocument();
  });

  it('names each account\'s band in words, not by the dot\'s colour alone', () => {
    draw([account({ band: 'dormant' })]);
    const row = screen.getByText('Acme').closest('tr')!;
    expect(within(row).getByText(/Dormant/)).toBeInTheDocument();
  });

  it('prints a long account name in full', () => {
    draw([account({ name: 'Globex International Holdings Group' })]);
    expect(screen.getByText('Globex International Holdings Group').className).not.toContain('truncate');
  });
});

describe('AdoptionBreadthChart', () => {
  const buckets = [
    { key: '1', name: '1 product', accounts: 2, arr: 20_000 },
    { key: '2', name: '2 products', accounts: 0, arr: 0 },
  ];

  it('draws its bars in ink, not the accent', () => {
    const { container } = render(<AdoptionBreadthChart buckets={buckets} currency="USD" />);
    const bars = container.querySelectorAll('[data-testid="adoption-bar"]');
    expect(bars).toHaveLength(2);
    for (const bar of bars) expect(bar.className).not.toContain('bg-accent');
  });

  it('writes a zero bucket\'s money as "$0"', () => {
    render(<AdoptionBreadthChart buckets={buckets} currency="USD" />);
    expect(screen.getByText(/\$0 · 0 accounts/)).toBeInTheDocument();
  });

  it('is a bounded list, not a scroll area', () => {
    render(<AdoptionBreadthChart buckets={buckets} currency="USD" />);
    expect(screen.getByRole('list').className).not.toMatch(/overflow/);
  });
});
