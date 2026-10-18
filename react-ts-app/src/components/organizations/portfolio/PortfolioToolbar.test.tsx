import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioToolbar } from './PortfolioToolbar';
import { BOARD_GROUP, boardParams, parseParams } from '../../../features/organizations/portfolioParams';
import { BOARD_GROUP_OPTIONS } from './FiltersPanel';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';
import { resetViewport, setViewport } from '../../../test/viewport';

afterEach(resetViewport);

function renderToolbar(search = '', isSm = true, extra: Partial<React.ComponentProps<typeof PortfolioToolbar>> = {}) {
  setViewport(isSm ? 1440 : 390);
  const props = {
    params: parseParams(new URLSearchParams(search)),
    update: vi.fn(),
    options: FILTER_OPTIONS,
    isSm,
    pins: [],
    onTogglePin: vi.fn(),
    onExport: vi.fn(),
    exporting: false,
    onAdd: vi.fn(),
    searchRef: createRef<HTMLInputElement>(),
    count: '14 organizations',
    ...extra,
  };
  render(<PortfolioToolbar {...props} />);
  return props;
}

describe('PortfolioToolbar', () => {
  it('debounces search into one update', async () => {
    const { update } = renderToolbar();
    const input = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    expect(input).toHaveAttribute('placeholder', 'Search by name or ID');
    await userEvent.type(input, 'pizza');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ search: 'pizza' }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('keeps the search a usable width and lets the row wrap when the column narrows', () => {
    renderToolbar();
    const input = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    const field = input.closest('label')!.parentElement!;
    expect(field).toHaveClass('min-w-0', 'flex-1', 'sm:min-w-[12rem]');
    expect(field.closest('[data-part="toolbar-search"]')!.parentElement).toHaveClass('flex-wrap');
  });

  it('groups and sorts', async () => {
    const { update } = renderToolbar();
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(group).toHaveValue('health');
    await userEvent.selectOptions(group, 'none');
    expect(update).toHaveBeenLastCalledWith({ group: '' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'renewal');
    expect(update).toHaveBeenLastCalledWith({ sort: '-renewal' });
    await userEvent.click(screen.getByRole('button', { name: 'Descending' }));
    expect(update).toHaveBeenLastCalledWith({ sort: 'arr' });
  });

  it('is the one toolbar: search and count first, filters, two secondaries, the primary last', () => {
    renderToolbar('', true, { onSaveAsSegment: vi.fn() });
    const search = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    expect(search).toHaveAttribute('placeholder', 'Search by name or ID');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('14 organizations');
    expect(status.parentElement).toContainElement(search);
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim());
    expect(names.slice(-3)).toEqual(['Save as segment', 'Export', 'Add organization']);
    expect(screen.getByRole('button', { name: 'Add organization' })).toHaveClass('bg-accent');
    expect(screen.getByLabelText('Group').tagName).toBe('SELECT');
  });

  it('keeps Add and Export in the Filters sheet on a phone, and Select in reach', () => {
    renderToolbar('', false, { onToggleSelectMode: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Add organization' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('counts active filters on the Filters button and opens the panel', async () => {
    renderToolbar('health=poor&owner=2');
    const button = screen.getByRole('button', { name: /^Filters/ });
    expect(button).toHaveTextContent('2');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  it('exports, adds and opens the pin menu', async () => {
    const { onExport, onAdd } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    expect(onAdd).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Pin fields' }));
    expect(screen.getByRole('dialog', { name: 'Pin fields' })).toBeInTheDocument();
  });

  it('pushes Pin fields and the actions after it to the right, one group on row 2', () => {
    renderToolbar();
    const pin = screen.getByRole('button', { name: 'Pin fields' });
    // Pin fields rides in the actions' own group, so they wrap as one.
    expect(pin.className).not.toMatch(/ml-auto|ml-0/);
    expect(pin.parentElement).toHaveClass('ml-auto');
    expect(pin.parentElement).toContainElement(screen.getByRole('button', { name: 'Export' }));
    expect(pin.parentElement).not.toContainElement(screen.getByRole('button', { name: /Filters/ }));
  });

  it('returns focus to the Filters button when the panel closes', async () => {
    renderToolbar();
    const button = screen.getByRole('button', { name: /^Filters/ });
    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('returns focus to the Pin fields button when the menu closes', async () => {
    renderToolbar();
    const button = screen.getByRole('button', { name: 'Pin fields' });
    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Pin fields' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Pin fields' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes the Filters popover on an outside click without forcing focus back to the trigger', async () => {
    renderToolbar();
    const button = screen.getByRole('button', { name: /^Filters/ });
    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    expect(button).not.toHaveFocus();
  });

  it('an outside click into the search box closes Filters and leaves focus there', async () => {
    renderToolbar();
    const button = screen.getByRole('button', { name: /^Filters/ });
    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    await userEvent.click(search);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it('toggles the Filters popover closed via its own trigger, rather than reopening it', async () => {
    renderToolbar();
    const button = screen.getByRole('button', { name: /^Filters/ });
    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('collapses to Search and Filters on phones', () => {
    renderToolbar('', false);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
    for (const name of ['Export', 'Add organization', 'Pin fields']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
  });
});

describe('PortfolioToolbar on the Board', () => {
  function renderBoardToolbar(search = '', isSm = true) {
    const props = {
      params: boardParams(parseParams(new URLSearchParams(search), BOARD_GROUP)),
      update: vi.fn(),
      options: FILTER_OPTIONS,
      isSm,
      onExport: vi.fn(),
      exporting: false,
      onAdd: vi.fn(),
      searchRef: createRef<HTMLInputElement>(),
      groupOptions: BOARD_GROUP_OPTIONS,
      count: '14 organizations',
    };
    render(<PortfolioToolbar {...props} />);
    return props;
  }

  it('offers every grouping but None, starts on lifecycle, and has no Pin fields or Select', async () => {
    const { update } = renderBoardToolbar();
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(group).toHaveValue('lifecycle');
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Health',
      'Owner',
      'Lifecycle',
      'Product',
      'Renewal window',
    ]);
    expect(screen.queryByRole('button', { name: 'Pin fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
    await userEvent.selectOptions(group, 'owner');
    expect(update).toHaveBeenLastCalledWith({ group: 'owner' });
  });

  it('shows lifecycle, not None, when the URL says group=none', () => {
    renderBoardToolbar('group=none');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('lifecycle');
  });

  it('keeps None out of the phone Filters sheet too', async () => {
    renderBoardToolbar('', false);
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).queryByRole('option', { name: 'None' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });
});
