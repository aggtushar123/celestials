import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { sizeCharts } from '../../../../../test/chartSize';
import { healthRow } from '../testUtils';
import { layOut } from '../divergence';
import { PulseDivergenceScatter } from './PulseDivergenceScatter';

// Sized so Recharts draws its axes (see sizeCharts).
sizeCharts(600, 400);

const NOW = new Date(2026, 5, 15);
const laid = layOut(
  [
    healthRow({ id: '1', csmPulseScore: 5, aiPulseScore: 2, healthStatus: 'Poor' }),
    healthRow({ id: '2', csmPulseScore: 3, aiPulseScore: 3, healthStatus: 'Good' }),
  ],
  NOW,
);

describe('PulseDivergenceScatter', () => {
  it('keys the health colours, best first', () => {
    render(<PulseDivergenceScatter laid={laid} />);
    const legend = screen.getByText('Good').closest('ul') as HTMLElement;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Good',
      'Average',
      'Poor',
    ]);
  });

  it('titles both axes with their 1–5 scale', () => {
    render(<PulseDivergenceScatter laid={laid} />);
    expect(screen.getByText('CSM Pulse (1–5)')).toBeInTheDocument();
    expect(screen.getByText('AI Pulse (1–5)')).toBeInTheDocument();
  });

  it('keeps tick text at 10px or more', () => {
    const { container } = render(<PulseDivergenceScatter laid={laid} />);
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-labels text')];
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(Number(tick.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
  });
});
