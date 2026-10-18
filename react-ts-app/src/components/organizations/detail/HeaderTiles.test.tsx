import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer } from '../../../features/customers/customersSlice';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { pizzaHutCustomer } from '../../../features/organizations/testStory';
import { HeaderTiles } from './HeaderTiles';

function renderTiles({
  row = pizzaHut,
  customer = pizzaHutCustomer as Customer | null,
  customerError = null as string | null,
} = {}) {
  const onJump = vi.fn();
  render(<HeaderTiles row={row} customer={customer} customerError={customerError} onJump={onJump} />);
  return onJump;
}

describe('HeaderTiles (spec §1.3)', () => {
  it('shows the health score and its trend, ARR, the renewal runway and the pulse pair', () => {
    renderTiles();
    expect(within(screen.getByRole('button', { name: /^Health 4\.9, Average/ })).getByText('4.9')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Health falling from 6\.2 to 4\.9/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^Renewal/ })).getByText('47d overdue')).toBeInTheDocument();
    expect(screen.getByText('9 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('AI 1 · CSM 3')).toBeInTheDocument();
    expect(screen.getByText(/pulses disagree/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Pulse history/ })).toBeInTheDocument();
  });

  it("shows ARR in the customer's own currency", () => {
    const euros: PortfolioRow = {
      ...pizzaHut,
      details: { ...pizzaHut.details, commercial: { ...pizzaHut.details.commercial, currency: 'EUR' } },
    };
    renderTiles({ row: euros });
    expect(screen.getByRole('button', { name: /^ARR €69\.6K/ })).toBeInTheDocument();
    expect(screen.getByText('Billed at account, in EUR')).toBeInTheDocument();
  });

  it('ARR, Renewal and Pulse jump to their Details panels', async () => {
    const onJump = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: /^ARR/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Renewal/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Pulse/ }));
    expect(onJump.mock.calls.map(([panel]) => panel)).toEqual(['commercial', 'contract', 'voice']);
  });

  it('Health opens and closes the five-part breakdown', async () => {
    renderTiles();
    const health = screen.getByRole('button', { name: /^Health 4\.9, Average/ });
    expect(health).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(health);
    expect(health).toHaveAttribute('aria-expanded', 'true');
    const breakdown = screen.getByRole('region', { name: 'Health breakdown' });
    expect(health).toHaveAttribute('aria-controls', breakdown.id);
    expect(within(breakdown).getAllByRole('listitem')).toHaveLength(5);
    expect(within(breakdown).getByText('Product usage').closest('li')).toHaveTextContent('1.2/3.0 · Average');
    expect(within(breakdown).getByText('Support load').closest('li')).toHaveTextContent('1.6/2.0 · Good');
    expect(within(breakdown).getByText('NPS').closest('li')).toHaveTextContent('No data');
    expect(breakdown).toHaveTextContent('Scored on the 4 components with data; the other is left out rather than counted as zero.');
    await userEvent.click(health);
    expect(screen.queryByRole('region', { name: 'Health breakdown' })).not.toBeInTheDocument();
  });

  it('says so while the breakdown loads', async () => {
    renderTiles({ customer: null });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading the health breakdown');
  });

  it('shows the read error in place of the breakdown', async () => {
    renderTiles({ customer: null, customerError: 'Could not load the health breakdown.' });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the health breakdown.');
  });

  it('is a grid from sm that wraps to its column: four across from 50rem, two beside the Ask rail', () => {
    renderTiles();
    const grid = screen.getByRole('button', { name: /^ARR/ }).parentElement!.parentElement!;
    expect(grid).toHaveClass('sm:grid', 'sm:grid-cols-2', '@min-[50rem]:grid-cols-4');
    expect(grid.parentElement).toHaveClass('@container');
  });

  it('is a snapping strip on phones', () => {
    renderTiles();
    const strip = screen.getByRole('button', { name: /^ARR/ }).parentElement!.parentElement;
    expect(strip).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');
    // Snap points sit inside the 16px gutter, so the strip starts unscrolled.
    expect(strip).toHaveClass('scroll-px-4');
  });

  it('draws four standard tiles: eyebrow label, display figure, one meta line, in a container-sized row', () => {
    renderTiles();
    const health = screen.getByRole('button', { name: /^Health \d+\.\d, \w+\. Show the breakdown$/ });
    expect(health).toHaveAttribute('aria-expanded', 'false');
    expect(health).not.toHaveAttribute('aria-pressed');
    const row = health.parentElement!.parentElement!; // button, its Card, the tile row
    expect(row).toHaveClass('@min-[50rem]:grid-cols-4', 'items-start');
    for (const label of ['Health', 'ARR', 'Renewal', 'Pulse']) {
      expect(screen.getByText(label)).toHaveClass('uppercase', 'text-[11px]');
    }
    expect(screen.getByRole('button', { name: /^ARR .*Show commercial details$/ }).querySelector('.text-\\[22px\\]')).toHaveClass('tabular-nums');
  });

  it('gives every tile exactly one fixed-height child row, so the four are one height', () => {
    renderTiles();
    for (const name of [/^Health/, /^ARR/, /^Renewal/, /^Pulse/]) {
      const rows = screen.getByRole('button', { name }).querySelectorAll('.flex.h-5.items-center');
      expect(rows).toHaveLength(1);
    }
    // ARR has nothing to draw there: a blank spacer, hidden from screen readers.
    expect(screen.getByRole('button', { name: /^ARR/ }).querySelector('.h-5.items-center')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows an overdue renewal in danger ink, and no renewal date as the no-value mark with the words below', () => {
    renderTiles();
    expect(within(screen.getByRole('button', { name: /^Renewal/ })).getByText('47d overdue')).toHaveClass('text-danger-ink');
    cleanup();
    renderTiles({ row: { ...pizzaHut, renewal: { date: null, days: null } } });
    const renewal = screen.getByRole('button', { name: /^Renewal/ });
    expect(within(renewal).getByText('\u2014')).toBeInTheDocument();
    const words = within(renewal).getByText('No renewal date');
    expect(words).not.toHaveClass('tabular-nums');
    expect(words.className).not.toContain('text-[22px]');
  });
});
