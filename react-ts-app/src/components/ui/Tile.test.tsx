import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Tile } from './Tile';
import { tileRow } from './tileRow';

describe('Tile (UI foundations spec §4.3)', () => {
  it('is a group named by its eyebrow label, with the figure at display size in tabular figures', () => {
    render(<Tile label="Accounts" value="128" meta="$4.2M ARR" action={<button type="button">Filter</button>} />);
    const tile = screen.getByRole('group', { name: 'Accounts' });
    expect(tile).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'p-3', 'min-w-[15rem]', 'snap-start', 'sm:min-w-0', 'max-w-80', 'sm:max-w-none');
    expect(screen.getByText('Accounts')).toHaveClass('text-[11px]', 'uppercase', 'tracking-wider');
    expect(screen.getByText('128')).toHaveClass('mt-1', 'text-[22px]', 'font-semibold', 'tabular-nums');
    expect(screen.getByText('$4.2M ARR')).toHaveClass('text-[11px]', 'line-clamp-2');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('shows its breakdown rows under the meta line', () => {
    render(
      <Tile label="Health" value="72">
        <span>Good 40</span>
        <span>Poor 8</span>
      </Tile>,
    );
    expect(screen.getByText('Good 40').parentElement).toHaveClass('mt-2', 'flex-col');
  });

  it('is one pressable button when it filters, ringed while pressed', async () => {
    const onPress = vi.fn();
    const { rerender } = render(<Tile label="At risk" value="9" onPress={onPress} />);
    const button = screen.getByRole('button', { name: /At risk/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveClass('min-h-11', 'w-full', 'p-3', 'text-left');
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Tile label="At risk" value="9" onPress={onPress} pressed />);
    expect(screen.getByRole('button', { name: /At risk/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /At risk/ }).parentElement).toHaveClass('bg-subtle', 'ring-1', 'ring-accent');
  });

  it('marks every kind of tile with its data-part: static, pressable, with an action, and a link', () => {
    const { rerender } = render(<Tile label="At risk" value="9" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: /At risk/ }).closest('[data-part="tile"]')).not.toBeNull();
    rerender(<Tile label="At risk" value="9" onOpen={() => {}} action={<span>Open</span>} />);
    expect(screen.getByRole('button', { name: /At risk/ }).closest('[data-part="tile"]')).not.toBeNull();
    rerender(
      <MemoryRouter>
        <Tile label="At risk" value="9" to="#risk" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /At risk/ }).closest('[data-part="tile"]')).not.toBeNull();
    rerender(<Tile label="At risk" value="9" />);
    expect(screen.getByRole('group', { name: 'At risk' })).toHaveAttribute('data-part', 'tile');
  });
});

describe('tileRow', () => {
  it('keeps the phone snap strip and the sm grid, adds the lg columns, and never stretches tiles', () => {
    const row = tileRow(4);
    for (const part of ['-mx-4', 'flex', 'snap-x', 'snap-mandatory', 'overflow-x-auto', 'gap-3', 'sm:grid', 'sm:grid-cols-2', 'lg:grid-cols-4', 'items-start']) {
      expect(row.split(' ')).toContain(part);
    }
    expect(tileRow(3)).toContain('lg:grid-cols-3');
  });
  it("keeps the action outside a filter tile's button, which its label and value name", async () => {
    const onPress = vi.fn();
    render(<Tile label="Renewing" value="4" meta="within 30 days" onPress={onPress} pressed action={<button type="button">30d</button>} />);
    const button = screen.getByRole('button', { name: 'Renewing 4' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).not.toContainElement(screen.getByRole('button', { name: '30d' }));
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens rather than presses: aria-expanded and aria-controls, never aria-pressed', () => {
    render(<Tile label="Health" value="6.2" onOpen={() => {}} expanded controls="breakdown" buttonLabel="Health 6.2, Average. Hide the breakdown" />);
    const button = screen.getByRole('button', { name: 'Health 6.2, Average. Hide the breakdown' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'breakdown');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('sizes the columns by the container when asked (the Ask rail narrows the column, not the window)', () => {
    const row = tileRow(4, 'container').split(' ');
    expect(row).toContain('@min-[50rem]:grid-cols-4');
    expect(row).not.toContain('lg:grid-cols-4');
  });
  it('jumps as a link when given `to`, the current one marked as the location', async () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <Tile label="Open plans" value="2" meta="1 at risk" to={{ search: '?section=plans' }} replace current onOpen={onOpen} buttonLabel="Open plans: 2, 1 at risk" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Open plans: 2, 1 at risk' });
    expect(link).toHaveAttribute('aria-current', 'location');
    expect(link).toHaveAttribute('href', '/?section=plans');
    expect(link).toHaveClass('bg-subtle', 'min-h-11', 'p-3');
    expect(link.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
