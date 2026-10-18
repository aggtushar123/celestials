import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { sizeCharts } from '../../../../../test/chartSize';
import { ConcentrationChart } from './ConcentrationChart';
import { CohortChart } from './CohortChart';
import { CompositionSplit } from './CompositionSplit';

// Unit tier: each Customers chart on its own, with the element box stubbed
// so Recharts draws its axes (see sizeCharts).
sizeCharts(900, 360);

const legendOf = (first: string) =>
  within(screen.getByText(first).closest('ul') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

const tickSizes = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-cartesian-axis-tick text')].map((t) =>
    Number(t.getAttribute('font-size')),
  );

describe('ConcentrationChart', () => {
  const row = (id: number, name: string, health: 'good' | 'average' | 'poor', arr: number, cumulative: number) => ({
    rank: id,
    id,
    name,
    owner: 'Carl',
    arr,
    share: 10,
    cumulative_share: cumulative,
    health_category: health,
  });
  const renderChart = () =>
    render(
      <ConcentrationChart
        currency="USD"
        concentration={{
          rows: [
            row(1, 'Globex International Holdings', 'poor', 300_000, 40),
            row(2, 'Uber', 'good', 200_000, 66),
            row(3, 'Initech', 'average', 100_000, 80),
          ],
          top_three_share: 80,
          total_arr: 600_000,
          counted: 3,
          rest_count: 0,
          rest_arr: 0,
        }}
      />,
    );

  it('keys the health colours and names the cumulative line', () => {
    renderChart();
    expect(legendOf('Good')).toEqual(['Good', 'Average', 'Poor', 'Cumulative share of ARR']);
  });

  it('titles both value axes, so each series has its scale', () => {
    renderChart();
    expect(screen.getByText('ARR (USD)')).toBeInTheDocument();
    expect(screen.getByText('Cumulative % of ARR')).toBeInTheDocument();
  });

  it('prints full account names flat at 10px when the chart has the room', () => {
    const { container } = renderChart();
    const name = [...container.querySelectorAll('.recharts-xAxis text, .recharts-cartesian-axis-tick-label text')].find(
      (t) => [...t.querySelectorAll('tspan')].map((line) => line.textContent).join(' ').includes('Globex International Holdings'),
    );
    expect(name).toBeDefined();
    expect(name).not.toHaveAttribute('transform');
    expect(name).toHaveAttribute('font-size', '10');
    expect(Math.min(...tickSizes(container))).toBeGreaterThanOrEqual(10);
  });
});

describe('CohortChart', () => {
  const renderChart = () =>
    render(
      <CohortChart
        undated={0}
        rows={[
          { year: 2024, joined: 10, retained: 8, churned: 2, retention: 80 },
          { year: 2025, joined: 6, retained: 6, churned: 0, retention: 100 },
        ]}
      />,
    );

  it('keys retained and churned', () => {
    renderChart();
    expect(legendOf('Retained')).toEqual(['Retained', 'Churned']);
  });

  it('titles the count axis', () => {
    const { container } = renderChart();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Year joined')).toBeInTheDocument();
    expect(Math.min(...tickSizes(container))).toBeGreaterThanOrEqual(10);
  });
});

describe('CompositionSplit', () => {
  it('lets its few fixed buckets set the card height instead of scrolling them', () => {
    render(
      <CompositionSplit
        title="By lifecycle stage"
        subtitle="Where the active book sits today"
        currency="USD"
        emptyMessage="None"
        rows={[
          { key: 'onboarding', name: 'Onboarding', customers: 2, arr: 40_000 },
          { key: 'live', name: 'Live', customers: 8, arr: 400_000 },
        ]}
      />,
    );
    const list = screen.getByText('Onboarding').closest('ul') as HTMLElement;
    expect(list).not.toHaveClass('overflow-y-auto');
  });
});
