import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TicketAssigneeRow, TicketOrigin } from '../../../../../features/tickets/ticketsSlice';
import { sizeCharts } from '../../../../../test/chartSize';
import { DrillProvider } from '../../../drill/DrillContext';
import { PriorityDonut } from './PriorityDonut';
import { StatusDonut } from './StatusDonut';
import { OriginBar } from './OriginBar';
import { AssigneesStackedBar } from './AssigneesStackedBar';
import { SentimentLineChart } from './SentimentLineChart';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts(600, 320);

/** The chart's key: the shared ChartLegend is the one `role="list"`. */
const legendOf = (container: HTMLElement) =>
  within(container.querySelector('ul[role="list"]') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

function expectReadableTicks(container: HTMLElement) {
  const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
  expect(ticks.length).toBeGreaterThan(0);
  for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
}

const inDrill = (node: React.ReactNode) => render(<DrillProvider>{node}</DrillProvider>);

describe('PriorityDonut', () => {
  const data = [
    { name: 'Critical', value: 10 },
    { name: 'High', value: 30 },
    { name: 'Medium', value: 40 },
    { name: 'Low', value: 20 },
  ];

  it('keys every priority with its count and share, not colour alone', () => {
    const { container } = inDrill(<PriorityDonut data={data} query="" />);
    expect(legendOf(container)).toEqual([
      'Critical, 10 · 10%',
      'High, 30 · 30%',
      'Medium, 40 · 40%',
      'Low, 20 · 20%',
    ]);
  });

  it('draws no labels outside the ring, which clipped at the card edge', () => {
    const { container } = inDrill(<PriorityDonut data={data} query="" />);
    expect(container.querySelector('.recharts-pie-labels')).toBeNull();
  });

  it('has no dead expand button', () => {
    inDrill(<PriorityDonut data={data} query="" drillable={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('StatusDonut', () => {
  const data = [
    { name: 'Open', value: 3 },
    { name: 'Resolved', value: 1 },
  ];

  it('keys every status with its count and share', () => {
    const { container } = inDrill(<StatusDonut data={data} query="" />);
    expect(legendOf(container)).toEqual(['Open, 3 · 75%', 'Resolved, 1 · 25%']);
  });

  it('centres the total in the ring', () => {
    const { container } = inDrill(<StatusDonut data={data} query="" />);
    expect(container.querySelector('.recharts-pie-labels')).toBeNull();
    expect(screen.getByText('4').parentElement!.className).not.toContain('pb-6');
  });
});

describe('OriginBar', () => {
  const origins = (n: number): TicketOrigin[] =>
    Array.from({ length: n }, (_, i) => ({ name: `Origin ${i + 1}`, value: 10 + i, provider: 'zendesk', connector_id: i + 1 }));

  it('grows with the origins instead of squashing them into 280px', () => {
    inDrill(<OriginBar data={origins(12)} query="" />);
    expect(screen.getByTestId('origin-plot')).toHaveStyle({ height: `${12 * 26}px` });
  });

  it('stays inside its card: no negative margin', () => {
    inDrill(<OriginBar data={origins(2)} query="" />);
    expect(screen.getByTestId('origin-plot').className).not.toMatch(/-ml-/);
  });

  it('prints a connector name in full when it fits', () => {
    const { container } = inDrill(
      <OriginBar data={[{ name: 'Zendesk (support)', value: 4, provider: 'zendesk', connector_id: 1 }]} query="" />,
    );
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')].map((t) => t.textContent);
    expect(ticks).toContain('Zendesk (support)');
    expectReadableTicks(container);
  });
});

describe('AssigneesStackedBar', () => {
  const row = (name: string): TicketAssigneeRow => ({
    name,
    Open: 2,
    'In Progress': 1,
    'On Hold': 0,
    Resolved: 3,
    Closed: 1,
    total: 7,
  });

  it('keys the five statuses in stack order', () => {
    const { container } = inDrill(<AssigneesStackedBar data={[row('Ana')]} query="" />);
    expect(legendOf(container)).toEqual(['Open', 'In Progress', 'On Hold', 'Resolved', 'Closed']);
  });

  it('gives each assignee a row and scrolls a big team inside the card', () => {
    const team = Array.from({ length: 20 }, (_, i) => row(`Agent ${i + 1}`));
    inDrill(<AssigneesStackedBar data={team} query="" />);
    expect(screen.getByTestId('assignee-plot')).toHaveStyle({ height: `${20 * 28}px` });
    expect(screen.getByRole('region', { name: 'Ticket assignees by status' })).toHaveStyle({ maxHeight: '420px' });
  });

  it('prints each assignee total past the bar, and names in full', () => {
    const { container } = inDrill(<AssigneesStackedBar data={[row('Alexandra Montgomery')]} query="" />);
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')].map((t) => t.textContent);
    expect(ticks).toContain('Alexandra Montgomery');
    expect([...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent)).toContain('7');
    expectReadableTicks(container);
  });

  it('draws no helper total series beside the stack', () => {
    // The old transparent `total` bar sat beside the stack, knocked it
    // off-centre in its row and added a "total" line to the tooltip.
    const { container } = inDrill(<AssigneesStackedBar data={[row('Ana'), row('Ben')]} query="" />);
    expect(container.querySelectorAll('.recharts-bar')).toHaveLength(5);
  });
});

describe('SentimentLineChart', () => {
  const points = Array.from({ length: 12 }, (_, i) => ({
    date: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]} 2026`,
    positive: 10 + i,
    negative: 5 + i,
  }));

  it('titles the count axis and the month axis', () => {
    const { container } = render(<SentimentLineChart data={points} />);
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.getByText('Created month')).toBeInTheDocument();
    expectReadableTicks(container);
  });

  it('writes months short', () => {
    const { container } = render(<SentimentLineChart data={points} />);
    // jsdom measures every string as the whole stubbed box, so Recharts keeps
    // only the end tick here; a browser shows more, formatted the same way.
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map((t) => t.textContent);
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(tick).toMatch(/^[A-Z][a-z]{2} ?'\d\d$/);
  });

  it('labels only the last point of each line, so twelve months do not collide', () => {
    const { container } = render(<SentimentLineChart data={points} />);
    const labels = [...container.querySelectorAll('.recharts-label-list text, .recharts-line-labels text')].map(
      (t) => t.textContent,
    );
    expect(labels.sort()).toEqual(['16', '21']);
  });

  it('keys both lines with the shared legend', () => {
    const { container } = render(<SentimentLineChart data={points} />);
    expect(legendOf(container)).toEqual(['Positive', 'Negative']);
  });
});
