import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCOUNTS } from '../../../features/organizations/testStory';
import { AccountChips } from './AccountChips';

function renderChips(props: Partial<ComponentProps<typeof AccountChips>> = {}) {
  const handlers = { onSelect: vi.fn(), onRetry: vi.fn(), onEdit: vi.fn() };
  render(
    <AccountChips
      accounts={ACCOUNTS}
      loading={false}
      error={null}
      counts={{ all: 5, none: 3, '31': 1, '32': 1 }}
      selected=""
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const chips = () => within(screen.getByRole('group', { name: 'Filter by account' })).queryAllByRole('button');

describe('AccountChips (spec §1.4)', () => {
  it("shows All, each account and the organization itself with the story's counts", () => {
    renderChips();
    expect(chips().map((chip) => chip.textContent)).toEqual(['All 5', 'EMEA 1', 'North America 1', 'Organization 3']);
    expect(screen.getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no numbers until the story has counted', () => {
    renderChips({ counts: null });
    expect(chips().map((chip) => chip.textContent)).toEqual(['All', 'EMEA', 'North America', 'Organization']);
  });

  it('leaves out an account the story does not count (outside this viewer\'s scope), and keeps Organization at 0 when it has none', () => {
    renderChips({ counts: { all: 2, none: 0, '31': 2 } });
    expect(chips().map((chip) => chip.textContent)).toEqual(['All 2', 'EMEA 2', 'Organization 0']);
  });

  it('keeps an in-scope account with nothing matching as 0', () => {
    renderChips({ counts: { all: 2, none: 0, '31': 2, '32': 0 } });
    expect(chips().map((chip) => chip.textContent)).toEqual(['All 2', 'EMEA 2', 'North America 0', 'Organization 0']);
  });

  it('chooses an account, and pressing it again goes back to All', async () => {
    const { onSelect } = renderChips({ selected: '31' });
    expect(screen.getByRole('button', { name: 'EMEA 1' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'North America 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'EMEA 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Organization 3' }));
    expect(onSelect.mock.calls.map(([value]) => value)).toEqual(['32', '', 'none']);
  });

  it('edits the chosen account, and leaves adding one to the name row', async () => {
    const { onEdit } = renderChips({ selected: '31' });
    expect(screen.queryByRole('button', { name: 'Add account' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
    expect(onEdit).toHaveBeenCalledWith(ACCOUNTS[0]);
  });

  it('offers no edit while All is chosen, and nothing when there are no accounts', () => {
    renderChips({ accounts: [] });
    expect(chips()).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('shows a skeleton while the accounts load', () => {
    renderChips({ accounts: [], loading: true });
    expect(screen.getByRole('status', { name: 'Loading accounts' })).toBeInTheDocument();
  });

  it('shows the error with Try again', async () => {
    const { onRetry } = renderChips({ accounts: [], error: 'Could not load accounts.' });
    expect(screen.getByText('Could not load accounts.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the chips and Edit in one wrapping row from sm', () => {
    renderChips({ selected: '31' });
    const group = screen.getByRole('group', { name: 'Filter by account' });
    expect(group).toHaveClass('sm:contents');
    expect(group.parentElement).toHaveClass('flex', 'flex-wrap');
    expect(screen.getByRole('button', { name: 'Edit EMEA' }).parentElement).toBe(group.parentElement);
  });

  it('gives each chip a 44px target below sm and 32px from sm, the chosen one tinted, never black-filled', () => {
    renderChips({ selected: '31' });
    for (const chip of chips()) expect(chip).toHaveClass('min-h-11', 'sm:min-h-8');
    expect(chips()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(chips()[1]).toHaveClass('bg-accent-dim');
    expect(chips()[1]).not.toHaveClass('bg-accent', 'text-on-accent');
  });

  describe('where the chips do not apply (Details and Knowledge, owner 2026-09-28)', () => {
    const NOTE = 'Details and Knowledge cover the whole organization';

    it('filters by default: no note, no dimming', () => {
      renderChips();
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
      for (const chip of chips()) {
        expect(chip).not.toHaveAttribute('aria-describedby');
        // A live FilterChip: tinted when chosen, its ink darkening on hover
        // otherwise; a dimmed chip's ink stays muted.
        expect(chip).toHaveClass(chip.getAttribute('aria-pressed') === 'true' ? 'bg-accent-dim' : 'hover:text-ink');
      }
    });

    it('dims every chip with the muted ink, ties the note to it, and shows names only', () => {
      renderChips({ applies: false, selected: '31' });
      const note = screen.getByText(NOTE);
      expect(note.id).not.toBe('');
      expect(chips().map((chip) => chip.textContent)).toEqual(['All', 'EMEA', 'North America', 'Organization']);
      for (const chip of chips()) {
        expect(chip).toHaveClass('min-h-11', 'sm:min-h-8');
        expect(chip).not.toHaveClass('hover:text-ink');
        // Clearly fainter than a live chip at rest (border-line, text-ink-muted).
        expect(chip).toHaveClass('text-ink-faint');
        expect(chip).not.toHaveClass('text-ink-muted');
        expect(chip).toHaveAttribute('aria-describedby', note.id);
        expect(chip).not.toHaveAttribute('aria-disabled');
        expect(chip).toBeEnabled();
      }
      // The chosen one stays marked, outlined rather than filled.
      expect(chips()[1]).toHaveAttribute('aria-pressed', 'true');
      expect(chips()[1]).not.toHaveClass('bg-accent');
      expect(chips()[0]).toHaveClass('border-line-subtle');
    });

    it('still changes the remembered account, and Edit stays usable', async () => {
      const { onSelect, onEdit } = renderChips({ applies: false, selected: '31' });
      await userEvent.click(screen.getByRole('button', { name: 'North America' }));
      expect(onSelect).toHaveBeenCalledWith('32');
      await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
      expect(onEdit).toHaveBeenCalledWith(ACCOUNTS[0]);
    });
  });
});
