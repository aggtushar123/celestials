import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip, FilterChipRow, RemovableChip } from './FilterChip';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <FilterChipRow label="Status">
      <FilterChip label="Open" pressed={open} onToggle={() => setOpen((value) => !value)} />
    </FilterChipRow>
  );
}

describe('FilterChip (UI foundations spec §5.4)', () => {
  it('toggles aria-pressed, outline when off and accent tint when on, never black', async () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Open' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveClass('min-h-11', 'sm:min-h-8', 'rounded-full', 'border-line', 'bg-surface', 'text-ink-muted');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveClass('border-accent', 'bg-accent-dim', 'font-semibold', 'text-ink');
    expect(chip).not.toHaveClass('bg-accent');
  });

  it('sits in a labelled row that scrolls on a phone and wraps from sm', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Status' })).toHaveClass('overflow-x-auto', 'rv-scroll-fade', 'sm:flex-wrap');
  });

  it('removes an active filter from its own named button', async () => {
    const onRemove = vi.fn();
    render(<RemovableChip label="Owner: Carl" onRemove={onRemove} />);
    expect(screen.getByText('Owner: Carl')).toHaveClass('bg-subtle', 'border-transparent', 'text-ink');
    const remove = screen.getByRole('button', { name: 'Remove filter: Owner: Carl' });
    expect(remove).toHaveClass('min-h-11', 'min-w-11');
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
  it('shows a count after the label, inside the name, and points at a description', () => {
    render(
      <>
        <p id="why">Waiting for the account.</p>
        <FilterChip label="Story" count={12} pressed={false} onToggle={() => {}} describedBy="why" />
      </>,
    );
    const chip = screen.getByRole('button', { name: 'Story 12' });
    expect(chip).toHaveAttribute('aria-describedby', 'why');
    expect(screen.getByText('12')).toHaveClass('text-[11px]', 'tabular-nums');
  });

  it('shows no count while it is not known', () => {
    render(<FilterChip label="Story" count={null} pressed={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Story' })).toBeInTheDocument();
  });
});
