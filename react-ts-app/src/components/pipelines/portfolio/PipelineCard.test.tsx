import type { ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { emeaSeats, globexUplift } from '../../../features/pipelines/testPipelines';
import { AskDraftContext } from '../../../pages/dashboard/ask/context';
import { PipelineCard } from './PipelineCard';

function renderCard(draft: ContextType<typeof AskDraftContext>, row: PipelineRow = globexUplift) {
  const onOpen = vi.fn();
  render(
    <MemoryRouter>
      <AskDraftContext.Provider value={draft}>
        <ul>
          <PipelineCard
            row={row}
            kind={OPPORTUNITIES_KIND}
            currency="USD"
            isSm
            canMove
            moveDisabled={false}
            onOpen={onOpen}
            onMove={vi.fn()}
            onDragStart={vi.fn()}
            onDragEnd={vi.fn()}
          />
        </ul>
      </AskDraftContext.Provider>
    </MemoryRouter>,
  );
  return { onOpen };
}

describe('PipelineCard: Ask about this (spec §3)', () => {
  it('prefills a question about this card, focused on it, without opening its form; the button itself is draggable=false', async () => {
    const draft = vi.fn();
    const { onOpen } = renderCard(draft);
    const button = screen.getByRole('button', { name: 'Ask about this: Globex uplift' });
    expect(button).toHaveAttribute('draggable', 'false');
    await userEvent.click(button);
    expect(draft).toHaveBeenCalledWith('What should I know about this opportunity?', { kind: 'opportunity', id: 43 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is one standard card: no shadow, the facts on one line, the buttons over its corner on hover', () => {
    renderCard(vi.fn());
    const card = document.querySelector('[data-card-id]')!;
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'p-3', 'group', 'relative');
    expect(card.className).not.toMatch(/shadow/);
    const facts = card.querySelector('[data-part="facts"]')!;
    expect(facts).not.toHaveClass('flex-wrap');
    expect(within(facts as HTMLElement).getByText('Low')).toHaveClass('rounded-full');
    const ask = screen.getByRole('button', { name: /^Ask about this/ });
    expect(ask.parentElement).toHaveClass('sm:absolute', 'sm:opacity-0', 'sm:group-hover:opacity-100');
    expect(card.querySelector('[data-field="signal"]')).toBeNull();
  });

  it('says "High priority" only for High, and keeps the whole date beside it', () => {
    renderCard(null);
    const low = document.querySelector('[data-part="facts"]') as HTMLElement;
    expect(within(low).getByText('Low')).toBeInTheDocument();
    expect(low).not.toHaveTextContent('priority');
    const date = low.querySelector('[data-field="date"]') as HTMLElement;
    expect(date).toHaveTextContent('Overdue 5d');
    expect(date.parentElement).toHaveClass('whitespace-nowrap', 'shrink-0');
    expect(date.parentElement).not.toHaveClass('truncate');
    document.body.innerHTML = '';
    renderCard(null, emeaSeats);
    expect(within(document.querySelector('[data-part="facts"]') as HTMLElement).getByText('High priority')).toBeInTheDocument();
  });

  it('is not offered outside an Ask provider', () => {
    renderCard(null);
    expect(screen.getByRole('button', { name: 'Globex uplift' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
