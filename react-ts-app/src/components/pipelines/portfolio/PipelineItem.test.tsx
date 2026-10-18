import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OPPORTUNITIES_KIND, RISKS_KIND } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { adminLeft, analyticsAddOn, emeaSeats, globexUplift, initechWin } from '../../../features/pipelines/testPipelines';
import { AskDraftContext } from '../../../pages/dashboard/ask/context';
import { PipelineItem, type PipelineItemProps } from './PipelineItem';

function renderItem(row: PipelineRow, props: Partial<PipelineItemProps> = {}) {
  const onOpen = vi.fn();
  const onToggleSelect = vi.fn();
  render(
    <MemoryRouter>
      <ul>
        <PipelineItem
          row={row}
          kind={row.kind === 'risk' ? RISKS_KIND : OPPORTUNITIES_KIND}
          currency="USD"
          selecting={false}
          selected={false}
          onToggleSelect={onToggleSelect}
          onOpen={onOpen}
          {...props}
        />
      </ul>
    </MemoryRouter>,
  );
  const item = document.querySelector(`[data-item-id="${row.id}"]`) as HTMLElement;
  return { item, onOpen, onToggleSelect };
}

describe('PipelineItem (spec §1 "List items")', () => {
  it('shows the title, Part of, MRR, stage, department and date', () => {
    const { item } = renderItem(emeaSeats);
    expect(within(item).getByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(item).toHaveClass('min-h-14');
    expect(within(item).getByRole('link', { name: 'Pizza Hut EMEA' })).toHaveAttribute('href', '/accounts/12');
    expect(item.querySelector('[data-field="mrr"]')).toHaveTextContent('$2.0K');
    expect(item.querySelector('[data-field="mrr"]')).toHaveClass('tabular-nums');
    expect(item.querySelector('[data-field="stage"]')).toHaveTextContent('Negotiation');
    expect(item.querySelector('[data-field="department"]')).toHaveTextContent('Customer Success');
    expect(item.querySelector('[data-field="date"]')).toHaveTextContent('Closes in 7d');
    expect(item.querySelector('[data-field="signal"]')).toBeNull();
    expect(item.querySelector('table')).toBeNull();
  });

  it('marks an overdue item with a red date, and reads a whole-company, undated one', () => {
    const { item } = renderItem(globexUplift);
    expect(item.querySelector('[data-field="date"]')).toHaveTextContent('Overdue 5d');
    expect(item.querySelector('[data-field="date"]')).toHaveClass('font-semibold', 'text-danger-ink');
    expect(item.querySelector('[data-field="priority"]')).toHaveTextContent('Low');
    const other = renderItem(analyticsAddOn).item;
    expect(other.querySelector('[data-field="department"]')).toHaveTextContent('Whole company');
    expect(other.querySelector('[data-field="date"]')).toHaveTextContent('No date');
  });

  it("words a risk's date, and a closed item's past date", () => {
    expect(renderItem(adminLeft).item.querySelector('[data-field="date"]')).toHaveTextContent('Due in 20d');
    const closed = renderItem(initechWin).item;
    expect(closed.querySelector('[data-field="date"]')).toHaveTextContent('Expected 10 Sep 2026');
    expect(closed.querySelector('[data-field="priority"]')).toHaveTextContent('Medium');
  });

  it('keeps priority in its own column on every item, High the one warning', () => {
    const { item } = renderItem({ ...emeaSeats, open: false, stage: { value: 'closed_won', label: 'Closed Won' }, signal: null });
    expect(within(item.querySelector('[data-field="priority"]') as HTMLElement).getByText('High')).toHaveClass('bg-warning-dim', 'text-warning-ink');
    expect(within(renderItem(globexUplift).item.querySelector('[data-field="priority"]') as HTMLElement).getByText('Low')).toHaveClass('bg-subtle', 'text-ink-muted');
  });

  it('opens from its title; the Part-of link does not open it', async () => {
    const { item, onOpen } = renderItem(emeaSeats);
    await userEvent.click(within(item).getByRole('button', { name: 'EMEA seats' }));
    expect(onOpen).toHaveBeenCalledWith(emeaSeats);
    await userEvent.click(within(item).getByRole('link', { name: 'Pizza Hut EMEA' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('offers no checkbox until selecting, so the title starts flush with the column label', () => {
    const { item } = renderItem(emeaSeats);
    expect(within(item).queryByRole('checkbox')).toBeNull();
    expect(item.querySelector('label')).toBeNull();
  });

  it('selects instead of opening while selecting, with a 44px checkbox', async () => {
    const { item, onOpen, onToggleSelect } = renderItem(emeaSeats, { selecting: true });
    const checkbox = within(item).getByRole('checkbox', { name: 'Select EMEA seats' });
    expect(checkbox.closest('label')).toHaveClass('w-11', 'h-11');
    await userEvent.click(within(item).getByRole('button', { name: 'EMEA seats' }));
    expect(onToggleSelect).toHaveBeenCalledWith(emeaSeats.id);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is a flat ListRow: a flex line below 60rem, a grid on the Pipelines template from it', () => {
    const { item } = renderItem(emeaSeats);
    expect(item.className).not.toMatch(/rounded-xl|bg-surface|shadow/);
    expect(item).toHaveClass('flex', '@min-[60rem]:grid', 'px-4', 'hover:bg-subtle');
    expect(item.className).toContain('@min-[60rem]:grid-cols-[minmax(14rem,1fr)_5rem_8rem_5.5rem_8rem_7rem_6.5rem]');
  });

  it('says the facts in the meta line below the breakpoint, the overdue date in the danger ink', () => {
    const { item } = renderItem(globexUplift);
    const narrow = item.querySelector('.\\@min-\\[60rem\\]\\:hidden') as HTMLElement;
    expect(narrow).toHaveTextContent(/· Low ·/);
    expect(narrow).not.toHaveTextContent('priority');
    expect(narrow).toHaveTextContent('Overdue 5d');
    expect(narrow.querySelector('[data-field="date"]')).toHaveClass('text-danger-ink');
  });

  it('leads the phone meta line with the money, stage, High priority and date, Part of last', () => {
    const { item } = renderItem(emeaSeats);
    const narrow = item.querySelector('.\\@min-\\[60rem\\]\\:hidden') as HTMLElement;
    expect(narrow.textContent).toBe('$2.0K · Negotiation · High priority · Closes in 7d · ');
    const parent = within(item).getByRole('link', { name: 'Pizza Hut EMEA' });
    expect(narrow.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(narrow.parentElement).toHaveTextContent(/Closes in 7d · Part of Pizza Hut EMEA$|Closes in 7d · Part of Pizza Hut EMEA · /);
  });

  it('marks the selected row', () => {
    const { item } = renderItem(emeaSeats, { selected: true });
    expect(item).toHaveClass('bg-subtle');
    expect(within(item).getByRole('button', { name: 'EMEA seats' })).toHaveAttribute('aria-current', 'true');
  });

  it('disables the checkbox while its list loads, and at the 500 limit unless selected', () => {
    renderItem(emeaSeats, { selecting: true, selectDisabled: true });
    expect(screen.getByRole('checkbox', { name: 'Select EMEA seats' })).toBeDisabled();
    renderItem(globexUplift, { selecting: true, atLimit: true });
    expect(screen.getByRole('checkbox', { name: 'Select Globex uplift' })).toBeDisabled();
    renderItem(adminLeft, { selecting: true, atLimit: true, selected: true });
    expect(screen.getByRole('checkbox', { name: 'Select Admin left' })).toBeEnabled();
  });
});

describe('PipelineItem: Ask about this (spec §3)', () => {
  function renderAsking(row: PipelineRow, selecting = false) {
    const draft = vi.fn();
    const onOpen = vi.fn();
    const ui = (isSelecting: boolean) => (
      <MemoryRouter>
        <AskDraftContext.Provider value={draft}>
          <ul>
            <PipelineItem
              row={row}
              kind={row.kind === 'risk' ? RISKS_KIND : OPPORTUNITIES_KIND}
              currency="USD"
              selecting={isSelecting}
              selected={false}
              onToggleSelect={vi.fn()}
              onOpen={onOpen}
            />
          </ul>
        </AskDraftContext.Provider>
      </MemoryRouter>
    );
    const { rerender } = render(ui(selecting));
    return { draft, onOpen, select: () => rerender(ui(true)) };
  }

  it('prefills a question about this item, focused on it, without opening its form', async () => {
    const { draft, onOpen } = renderAsking(adminLeft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this: Admin left' }));
    expect(draft).toHaveBeenCalledWith('What should I know about this risk?', { kind: 'risk', id: 71 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('puts Ask about this in the row actions: shown on touch, an icon below sm', () => {
    renderAsking(emeaSeats);
    const ask = screen.getByRole('button', { name: 'Ask about this: EMEA seats' });
    expect(ask.parentElement).toHaveClass('[@media(hover:none)]:opacity-100', 'sm:opacity-0');
    expect(within(ask).getByText('Ask about this')).toHaveClass('max-sm:sr-only');
  });

  it('is hidden while selecting, when a tap selects', () => {
    const { select } = renderAsking(emeaSeats);
    expect(screen.getByRole('button', { name: 'Ask about this: EMEA seats' })).toBeInTheDocument();
    select();
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });

  it('is not offered outside an Ask provider', () => {
    renderItem(emeaSeats);
    expect(screen.getByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
