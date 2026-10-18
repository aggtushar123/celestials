import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { sizeCharts } from '../../../../../test/chartSize';
import { healthRow } from '../testUtils';
import { buildFlow } from '../movement';
import { HealthFlowChart } from './HealthFlowChart';

// Every element reports a 600px-wide box, which the chart measures.
sizeCharts(600, 320);

const trail = (...statuses: ('Good' | 'Average' | 'Poor')[]) =>
  statuses.map((status, i) => ({ month: `M${i}`, status }));

const flow = buildFlow(
  [
    healthRow({ id: '1', history: trail('Good', 'Average', 'Poor') }),
    healthRow({ id: '2', history: trail('Poor', 'Average', 'Good') }),
    healthRow({ id: '3', history: trail('Good', 'Good', 'Average') }),
  ],
  3,
);

const figure = () => screen.getByRole('img', { name: /Health state flow/ });

describe('HealthFlowChart', () => {
  it('lays out at the card’s real width, so its text is drawn at true size', () => {
    render(<HealthFlowChart flow={flow} />);
    expect(figure()).not.toHaveAttribute('viewBox');
    expect(figure()).toHaveAttribute('width', '600');
  });

  it('keeps every label at 10px or more', () => {
    render(<HealthFlowChart flow={flow} />);
    const texts = [...figure().querySelectorAll('text')];
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(Number(text.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
  });

  it('annotates the first column as well as the last', () => {
    render(<HealthFlowChart flow={flow} />);
    // First month: two Good, one Poor. Last month: one each.
    expect(screen.getByTestId('flow-start')).toHaveTextContent('2Good1Poor');
    expect(screen.getByTestId('flow-end')).toHaveTextContent('1Good1Average1Poor');
  });

  it('states the scale the column heights are drawn to', () => {
    render(<HealthFlowChart flow={flow} />);
    expect(screen.getByText('Tallest column = 3 accounts')).toBeInTheDocument();
  });
});
