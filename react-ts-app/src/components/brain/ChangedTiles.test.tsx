import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SAY } from '../../features/brain/brainText';
import { TILE_METRICS } from '../../features/brain/testBrainFixtures';
import { ChangedTiles } from './ChangedTiles';

describe('ChangedTiles (brain UI spec §2)', () => {
  it('draws ARR, NRR, ARR at risk and the healthy share, in that order, as a snap row', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const row = screen.getByRole('group', { name: SAY.TILES });
    const tiles = within(row).getAllByRole('group');
    ['ARR', 'Net revenue retention', 'ARR at risk', 'Book in good health'].forEach((name, i) => expect(tiles[i]).toHaveAccessibleName(name));
    expect(tiles).toHaveLength(4);
    expect(row).toHaveClass('overflow-x-auto', 'snap-x', 'sm:grid', '@min-[50rem]:grid-cols-4');
  });

  it('sets the figure at 22px in tabular figures, and the change as a sentence in its trend colour', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const arr = screen.getByRole('group', { name: 'ARR' });
    expect(within(arr).getByText('$688.6K')).toHaveClass('tabular-nums', 'text-[22px]');
    expect(arr.innerHTML).not.toMatch(/font-mono-brand/);
    const change = arr.querySelector('[data-part="change"]');
    expect(change).toHaveTextContent('down $13.4K, worse');
    expect(change).toHaveClass('text-danger-ink');
    expect(screen.getByRole('group', { name: 'Book in good health' }).querySelector('[data-part="change"]')).toHaveClass('text-success-ink');
  });

  it('draws each figure as a standard tile in a container-sized row, the change in readable ink', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const row = screen.getByRole('group', { name: SAY.TILES });
    expect(row).toHaveClass('items-start', '@min-[50rem]:grid-cols-4');
    const tile = within(row).getAllByRole('group')[0];
    expect(tile).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'p-3');
    const change = tile.querySelector('[data-part="change"]');
    if (change) expect(change.className).toMatch(/text-(success|danger)-ink|text-ink-muted/);
    expect(tile.innerHTML).not.toMatch(/font-mono-brand/);
  });

  it('says "No figure" for a withheld figure, with no change', () => {
    render(<ChangedTiles metrics={TILE_METRICS} currency="USD" />);
    const nrr = screen.getByRole('group', { name: 'Net revenue retention' });
    expect(within(nrr).getByText(SAY.NO_FIGURE)).toBeInTheDocument();
    expect(nrr.querySelector('[data-part="change"]')).toBeNull();
  });

  it('skips what the scope lacks, and narrows the grid to what is left', () => {
    render(<ChangedTiles metrics={TILE_METRICS.filter((m) => m.key !== 'nrr' && m.key !== 'healthy_share')} currency="USD" />);
    const row = screen.getByRole('group', { name: SAY.TILES });
    const tiles = within(row).getAllByRole('group');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName('ARR');
    expect(tiles[1]).toHaveAccessibleName('ARR at risk');
    expect(row).toHaveClass('@min-[50rem]:grid-cols-2');
  });

  it('draws nothing when the scope has none of the four', () => {
    const { container } = render(<ChangedTiles metrics={TILE_METRICS.filter((m) => m.key === 'active_customers')} currency="USD" />);
    expect(container).toBeEmptyDOMElement();
  });
});
