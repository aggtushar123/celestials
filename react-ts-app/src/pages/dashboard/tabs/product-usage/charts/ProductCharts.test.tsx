import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { sizeCharts } from '../../../../../test/chartSize';
import type { ProductRow } from '../../../../../features/products/productsSlice';
import { ProductMoneyChart } from './ProductMoneyChart';
import { ProductChurnChart } from './ProductChurnChart';
import { ProductScorecard } from './ProductScorecard';

// Unit tier: each Products chart on its own, with the element box stubbed so
// Recharts draws its axes (see sizeCharts).
sizeCharts(900, 360);

const product = (overrides: Partial<ProductRow> = {}): ProductRow => ({
  id: 1,
  product: 'Revenue intelligence suite',
  customers: 4,
  arr: 443_600,
  share: 64.4,
  unpriced: 0,
  utilisation: 75.1,
  contracted_seats: 1040,
  active_seats: 781,
  health: { good: 3, average: 1, poor: 0 },
  healthy_share: 75,
  unhealthy_arr: 100_000,
  ces: 84.5,
  nps: 57.5,
  open_tickets: 33,
  tickets_per_customer: 8.2,
  churned: 1,
  churned_arr: 24_000,
  churn_rate: 20,
  ...overrides,
});

const rows = [product(), product({ id: 2, product: 'Seats', arr: 200_000, churned_arr: 10_000 })];

const legendOf = (first: string) =>
  within(screen.getByText(first).closest('ul') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

const axisTexts = (container: HTMLElement) => [...container.querySelectorAll('.recharts-xAxis text, .recharts-cartesian-axis-tick-label text')];

/** The tick carrying the whole first product name, however it wrapped. */
const fullName = (container: HTMLElement) => {
  const tick = axisTexts(container).find((t) =>
    [...t.querySelectorAll('tspan')].map((line) => line.textContent).join(' ').includes('Revenue intelligence suite'),
  );
  expect(tick).toBeDefined();
  return tick;
};

describe('ProductMoneyChart', () => {
  it('keys the three segments in stack order', () => {
    render(<ProductMoneyChart rows={rows} currency="USD" />);
    expect(legendOf('In good health')).toEqual(['In good health', 'Not in good health', 'Already churned']);
  });

  it('titles the value axis with its currency', () => {
    render(<ProductMoneyChart rows={rows} currency="USD" />);
    expect(screen.getByText('ARR (USD)')).toBeInTheDocument();
  });

  it('prints full product names flat at 10px when the chart has the room', () => {
    const { container } = render(<ProductMoneyChart rows={rows} currency="USD" />);
    const name = fullName(container);
    expect(name).not.toHaveAttribute('transform');
    for (const tick of axisTexts(container)) {
      expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('ProductChurnChart', () => {
  it('names the bar and the line', () => {
    render(<ProductChurnChart rows={rows} currency="USD" />);
    expect(legendOf('ARR lost')).toEqual(['ARR lost', 'Churn rate']);
  });

  it('titles both value axes', () => {
    render(<ProductChurnChart rows={rows} currency="USD" />);
    expect(screen.getByText('ARR lost (USD)')).toBeInTheDocument();
    expect(screen.getByText('Churn rate %')).toBeInTheDocument();
  });

  it('prints full product names flat when the chart has the room', () => {
    const { container } = render(<ProductChurnChart rows={rows} currency="USD" />);
    expect(fullName(container)).not.toHaveAttribute('transform');
  });
});

describe('ProductScorecard', () => {
  it('scrolls inside a 420px region with the header pinned', () => {
    render(<ProductScorecard rows={rows} currency="USD" />);
    const region = screen.getByRole('region', { name: 'Product by product' });
    expect(region).toHaveStyle({ maxHeight: '420px' });
    expect(region).toHaveClass('[&_thead_th]:sticky');
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });

  it('keys the seat-use bar and the CES and NPS tones', () => {
    render(<ProductScorecard rows={rows} currency="USD" />);
    expect(legendOf('Seat use under 50%')).toEqual(['Seat use under 50%', 'Seat use 90% or more']);
    expect(legendOf('Poor: CES under 50, NPS under 0')).toEqual([
      'Poor: CES under 50, NPS under 0',
      'Fair: CES under 75, NPS under 30',
      'Good: above both',
    ]);
  });
});
