import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { InteractionBucket, SentimentPoint } from '../../../../../features/interactions/interactionsSlice';
import { sizeCharts } from '../../../../../test/chartSize';
import { DrillProvider } from '../../../drill/DrillContext';
import { ActivityTypeDonut } from './ActivityTypeDonut';
import { ActivitySentimentDonut } from './ActivitySentimentDonut';
import { ActivitiesByAIAreaDonut } from './ActivitiesByAIAreaDonut';
import { ActivitiesByAICategoryBar } from './ActivitiesByAICategoryBar';
import { ActivitiesByAISubCategoryBar } from './ActivitiesByAISubCategoryBar';
import { SentimentOverTimeLine } from './SentimentOverTimeLine';

// Sized so Recharts draws its axes and labels (see sizeCharts).
sizeCharts(600, 360);

/** The chart's key: the shared ChartLegend is the one `role="list"`. */
const legendOf = (container: HTMLElement) =>
  within(container.querySelector('ul[role="list"]') as HTMLElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

const ticksOf = (container: HTMLElement, axis: 'x' | 'y') =>
  [...container.querySelectorAll(`.recharts-${axis}Axis-tick-labels text`)];

function expectReadableTicks(container: HTMLElement) {
  const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
  expect(ticks.length).toBeGreaterThan(0);
  for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
}

const inDrill = (node: React.ReactNode) => render(<DrillProvider>{node}</DrillProvider>);

describe('topic donuts', () => {
  it('ActivityTypeDonut keys each source with its count and share, no labels outside the ring', () => {
    const data: InteractionBucket[] = [
      { key: 'email', name: 'Email', value: 1234 },
      { key: 'call', name: 'Call', value: 766 },
      { key: 'ticket', name: 'Ticket', value: 0 },
    ];
    const { container } = inDrill(<ActivityTypeDonut data={data} query="" />);
    expect(legendOf(container)).toEqual(['Email, 1,234 · 62%', 'Call, 766 · 38%', 'Ticket, 0 · 0%']);
    expect(container.querySelector('.recharts-pie-labels')).toBeNull();
  });

  it('ActivitySentimentDonut keys each sentiment with its count and share', () => {
    const data: InteractionBucket[] = [
      { key: 'positive', name: 'Positive', value: 3 },
      { key: 'neutral', name: 'Neutral', value: 1 },
      { key: 'negative', name: 'Negative', value: 0 },
    ];
    const { container } = inDrill(<ActivitySentimentDonut data={data} query="" />);
    expect(legendOf(container)).toEqual(['Positive, 3 · 75%', 'Neutral, 1 · 25%', 'Negative, 0 · 0%']);
    expect(container.querySelector('.recharts-pie-labels')).toBeNull();
  });

  it('ActivitiesByAIAreaDonut keys each area with its count and share of what it plots', () => {
    const data: InteractionBucket[] = [
      { key: 'cs', name: 'Customer Success', value: 1 },
      { key: 'so', name: 'Support & Operations', value: 3 },
    ];
    const { container } = inDrill(
      <ActivitiesByAIAreaDonut data={data} classified={4} total={4} query="" />,
    );
    expect(legendOf(container)).toEqual(['Customer Success, 1 · 25%', 'Support & Operations, 3 · 75%']);
    expect(container.querySelector('.recharts-pie-labels')).toBeNull();
  });
});

describe.each([
  ['ActivitiesByAICategoryBar', ActivitiesByAICategoryBar],
  ['ActivitiesByAISubCategoryBar', ActivitiesByAISubCategoryBar],
])('%s', (_, Chart) => {
  const ranked: InteractionBucket[] = [
    { key: 'a', name: 'Integration Support Requests', value: 30 },
    { key: 'b', name: 'Billing', value: 20 },
    { key: 'c', name: 'Onboarding', value: 10 },
  ];

  it('reads biggest first, top to bottom', () => {
    const { container } = inDrill(<Chart data={ranked} classified={60} total={60} query="" />);
    // A long name wraps onto a second line rather than being cut.
    const names = ticksOf(container, 'y').map((t) => [...t.querySelectorAll('tspan')].map((l) => l.textContent).join(' '));
    expect(names).toEqual(['Integration Support Requests', 'Billing', 'Onboarding']);
    expect(container.querySelector('.recharts-yAxis-tick-labels title')).toBeNull();
    expectReadableTicks(container);
  });

  it('labels the bars instead of repeating the values on an axis', () => {
    const { container } = inDrill(<Chart data={ranked} classified={60} total={60} query="" />);
    expect(ticksOf(container, 'x')).toHaveLength(0);
    const labels = [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);
    expect(labels).toEqual(['30', '20', '10']);
  });

  it('shortens only a name past two lines, keeping it whole on hover', () => {
    const long = 'Contract Renewal Negotiation And Pricing Questions';
    const { container } = inDrill(
      <Chart data={[{ key: 'x', name: long, value: 5 }]} classified={5} total={5} query="" />,
    );
    const tick = ticksOf(container, 'y')[0];
    expect(tick.querySelector('title')?.textContent).toBe(long);
  });
});

describe('SentimentOverTimeLine', () => {
  const weeks: SentimentPoint[] = [
    { date: 'Sep 15, 2025', positive: 2, neutral: 1, negative: 0 },
    { date: 'Sep 22, 2025', positive: 1, neutral: 3, negative: 1 },
  ];

  it('titles the count axis and the week axis', () => {
    const { container } = render(<SentimentOverTimeLine data={weeks} />);
    expect(screen.getByText('Interactions')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expectReadableTicks(container);
  });

  it('writes weeks short and flat', () => {
    const { container } = render(<SentimentOverTimeLine data={weeks} />);
    const ticks = ticksOf(container, 'x');
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.textContent).toMatch(/^\d{1,2} ?Sep$/);
      expect(tick.getAttribute('transform') ?? '').not.toContain('rotate');
    }
  });

  it('keys the three lines with the shared legend', () => {
    const { container } = render(<SentimentOverTimeLine data={weeks} />);
    expect(legendOf(container)).toEqual(['Positive', 'Neutral', 'Negative']);
  });
});
