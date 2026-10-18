import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPIGrid } from './KPIGrid';
import type { TicketKpis } from '../../../../../features/tickets/ticketsSlice';
import { DrillProvider } from '../../../drill/DrillContext';

const KPIS: TicketKpis = {
  total: 42,
  on_hold: 5,
  avg_lifetime_days: 3.2,
  resolution_rate: 88,
  positive_sentiment: 19,
  negative_sentiment: 7,
};

// KPIGrid calls useDrill() unconditionally (it wires four of the six figures
// to a server drill), so every render here needs a DrillProvider above it —
// the same requirement ArrBridgeChart's own tests carry.
function renderGrid(kpis: TicketKpis | null) {
  return render(
    <DrillProvider>
      <KPIGrid kpis={kpis} query="" />
    </DrillProvider>
  );
}

// On Hold, Avg. Lifetime and Resolution Rate used to carry amber/green with
// no meaning behind it — a ticket sitting on hold isn't a caution, and a
// lower lifetime isn't a gain the way an actual loss/gain figure is. Only a
// negative-sentiment count is unambiguously a loss.
describe('KPIGrid', () => {
  it('colours only Negative Sentiment Tickets, everything else stays ink', () => {
    renderGrid(KPIS);

    expect(screen.getByText('7').className).toContain('text-danger');

    for (const value of ['42', '5', '3.2', '88%', '19']) {
      const figure = screen.getByText(value);
      expect(figure.className).not.toContain('text-danger');
      expect(figure.className).not.toContain('text-warning');
      expect(figure.className).not.toContain('text-success');
    }
  });

  it('renders every figure in the mono numeral face', () => {
    renderGrid(KPIS);
    expect(screen.getByText('42').className).toContain('font-mono-brand');
    expect(screen.getByText('42').className).toContain('tabular-nums');
  });

  it('shows an em-dash rather than a claimed zero before the first fetch', () => {
    renderGrid(null);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('KPIGrid layout', () => {
  // The card is a quarter of the row from lg (~200px). Three — or even two —
  // columns there wrapped labels onto three or four lines (measured in
  // Chrome); two from md and one from lg keeps every label to two at most.
  it('is two across from md and one across from lg', () => {
    const { container } = renderGrid(KPIS);
    const strip = container.querySelector('ul') as HTMLElement;
    expect(strip).toHaveClass('md:grid-cols-2', 'lg:grid-cols-1');
    expect(strip).not.toHaveClass('md:grid-cols-3');
  });
});
