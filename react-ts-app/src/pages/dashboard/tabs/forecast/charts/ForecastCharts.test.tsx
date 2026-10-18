import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { sizeCharts } from '../../../../../test/chartSize';
import { DrillProvider } from '../../../drill/DrillContext';
import { ArrBridgeChart } from './ArrBridgeChart';
import { ScenarioRange } from './ScenarioRange';
import { SwingTable } from './SwingTable';
import { PipelineByStage } from './PipelineByStage';

// Unit tier: each Forecast chart on its own, with the element box stubbed so
// Recharts draws its axes (see sizeCharts).
sizeCharts();

const bridge = {
  opening_arr: 924_700,
  churn: 175_430,
  contraction: 33_120,
  expansion: 131_880,
  forecast_arr: 848_030,
  net_change: -76_670,
  nrr: 91.7,
};

/** The label of each item in the legend that holds `first`. */
const legendOf = (first: string) =>
  within(screen.getByText(first).closest('ul') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('ArrBridgeChart', () => {
  const renderBridge = () =>
    render(
      <DrillProvider>
        <ArrBridgeChart bridge={bridge} currency="USD" horizonDays={365} query="" />
      </DrillProvider>,
    );

  it('keys increase, decrease, total and the outlined forecast', () => {
    renderBridge();
    expect(legendOf('Increase')).toEqual(['Increase', 'Decrease', 'Total', 'Forecast']);
  });

  it('titles the value axis with its currency', () => {
    renderBridge();
    expect(screen.getByText('ARR (USD)')).toBeInTheDocument();
  });

  it('labels every step with its signed value, so reading it needs no hover', () => {
    const { container } = renderBridge();
    const labels = [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);
    expect(labels).toEqual(['$924.7K', '−$175.4K', '−$33.1K', '+$131.9K', '$848.0K']);
  });

  it('labels a zero step "$0" so its column never looks missing', () => {
    const { container } = render(
      <DrillProvider>
        <ArrBridgeChart bridge={{ ...bridge, contraction: 0 }} currency="USD" horizonDays={365} query="" />
      </DrillProvider>,
    );
    const labels = [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);
    expect(labels[2]).toBe('$0');
    expect(labels).toHaveLength(5);
  });

  it('keeps tick text at 10px or more', () => {
    const { container } = renderBridge();
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-value')];
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
  });
});

describe('ScenarioRange', () => {
  const renderRange = () =>
    render(
      <ScenarioRange scenarios={{ worst: 150_200, likely: 848_030, best: 1_189_900 }} opening={924_700} currency="USD" />,
    );

  it('marks worst, likely, best and today on the track itself', () => {
    renderRange();
    const track = screen.getByRole('img', { name: /Forecast range from/ });
    expect(within(track).getByText('Worst')).toBeInTheDocument();
    expect(within(track).getByText('Likely')).toBeInTheDocument();
    expect(within(track).getByText('Best')).toBeInTheDocument();
    expect(within(track).getByText('Today')).toBeInTheDocument();
  });

  it('gives the scale both its ends', () => {
    renderRange();
    const scale = screen.getByTestId('range-scale');
    expect(scale.firstElementChild).toHaveTextContent(/^\$0$/);
    expect(scale).toHaveTextContent('$1.2M');
  });

  it('sits at the top of its card rather than floating mid-way', () => {
    renderRange();
    expect(screen.getByLabelText('Scenarios').parentElement).not.toHaveClass('justify-center');
  });

  it('draws today as a dashed marker so it cannot be mistaken for likely', () => {
    renderRange();
    expect(screen.getByTestId('range-today')).toHaveClass('border-dashed');
  });
});

describe('SwingTable', () => {
  it('scrolls inside a 420px region with the header pinned', () => {
    render(
      <SwingTable
        currency="USD"
        rows={[
          {
            id: 1,
            name: 'Uber',
            owner: 'Carl',
            arr: 95_000,
            renewal_date: '2027-01-10',
            days_to_renewal: 120,
            renews_in_horizon: true,
            risk: 0.6,
            factors: [],
            churn_exposure: 0,
            risk_exposure: 0,
            downside: 0,
            expansion: 0,
            open_pipeline: 0,
            net: 0,
            health_category: 'poor',
          },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'What moves the number' });
    expect(region).toHaveStyle({ maxHeight: '420px' });
    expect(region).toHaveClass('[&_thead_th]:sticky');
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });
});

describe('PipelineByStage', () => {
  it('keys weighted against open in ink and faint, not the gain colour', () => {
    const { container } = render(
      <PipelineByStage
        currency="USD"
        stages={[{ key: 'd', name: 'Discovery', open: 75_600, weighted: 7_560, count: 2 }]}
      />,
    );
    expect(legendOf('Weighted')).toEqual(['Weighted', 'Open, not yet weighted']);
    expect(container.innerHTML).not.toContain('bg-success');
  });
});
