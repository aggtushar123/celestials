import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoryAttention } from '../../../features/organizations/storyTypes';
import { PIZZA_ATTENTION, QUIET_ATTENTION } from '../../../features/organizations/testStory';
import { AttentionBlock } from './AttentionBlock';

function renderBlock(attention: StoryAttention = PIZZA_ATTENTION) {
  const handlers = { onFilter: vi.fn(), onOpenTab: vi.fn(), onJump: vi.fn() };
  const { container } = render(<AttentionBlock attention={attention} {...handlers} />);
  return { ...handlers, container };
}

/** A row's main text, whole, though its numbers are their own elements. */
const main = (text: string) =>
  screen.getByText((_, el) => el?.tagName === 'SPAN' && el.hasAttribute('data-main') && el.textContent === text);

describe('AttentionBlock (spec §1.6 "Needs attention")', () => {
  it('lists each thing that needs attention, in words', () => {
    renderBlock();
    const block = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(block).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Renewal 47d overdue · 9 Aug 2026',
      '2 open High or Critical tickets · oldest 9d',
      '1 overdue task · oldest 4d',
      '3 unanswered questions',
      'Similar reports across 1 of your companies · 21 Sep 2026',
    ]);
  });

  it("shows the anomaly's title as the server sends it, and a renewal that is coming", () => {
    renderBlock({
      ...QUIET_ATTENTION,
      renewal: { date: '2026-10-10', days: 14, overdue: false },
      anomaly: { id: 9, title: 'Logins fell 60%', first_seen_at: '2026-09-20T08:00:00+00:00', last_seen_at: '2026-09-21T08:00:00+00:00' },
    });
    expect(main('Renews in 14d')).toBeInTheDocument();
    expect(screen.getByText('Logins fell 60%')).toBeInTheDocument();
  });

  it('takes each row to what it is about', async () => {
    const { onFilter, onOpenTab, onJump } = renderBlock();
    await userEvent.click(screen.getByRole('button', { name: /^Renewal 47d overdue/ }));
    await userEvent.click(screen.getByRole('button', { name: /^2 open High or Critical tickets/ }));
    await userEvent.click(screen.getByRole('button', { name: /^1 overdue task/ }));
    await userEvent.click(screen.getByRole('button', { name: '3 unanswered questions' }));
    expect(onJump).toHaveBeenCalledWith('contract');
    expect(onFilter.mock.calls.map(([group]) => group)).toEqual(['tickets', 'tasks']);
    expect(onOpenTab).toHaveBeenCalledWith('knowledge');
    expect(screen.queryByRole('button', { name: /Similar reports/ })).not.toBeInTheDocument();
  });

  it('is not shown when nothing needs attention', () => {
    const { container } = renderBlock(QUIET_ATTENTION);
    expect(container).toBeEmptyDOMElement();
  });

  it('colours an overdue renewal and overdue tasks as danger, and a renewal due soon as warning', () => {
    renderBlock();
    const overdueRenewalRow = main('Renewal 47d overdue').closest('li');
    const overdueTasksRow = main('1 overdue task').closest('li');
    expect(overdueRenewalRow?.querySelector('svg')).toHaveClass('text-danger');
    expect(overdueTasksRow?.querySelector('svg')).toHaveClass('text-danger');

    renderBlock({ ...QUIET_ATTENTION, renewal: { date: '2026-10-10', days: 14, overdue: false } });
    const dueSoonRow = main('Renews in 14d').closest('li');
    expect(dueSoonRow?.querySelector('svg')).toHaveClass('text-warning');
  });

  it('sets only the numbers in each row\'s main text in tabular figures, the words plain', () => {
    renderBlock();
    for (const [text, number] of [
      ['Renewal 47d overdue', '47d'],
      ['2 open High or Critical tickets', '2'],
      ['1 overdue task', '1'],
      ['3 unanswered questions', '3'],
    ]) {
      const phrase = main(text);
      expect(phrase).not.toHaveClass('tabular-nums');
      expect(within(phrase).getByText(number)).toHaveClass('tabular-nums');
      expect(within(phrase).getByText(number)).not.toHaveClass('font-mono-brand');
    }
    // The anomaly's title is server prose, not a count: it stays plain.
    expect(screen.getByText('Similar reports across 1 of your companies')).not.toHaveClass('tabular-nums');
  });

  it('is a card titled Needs attention whose rows are divided, figures in tabular body figures', () => {
    renderBlock();
    const region = screen.getByRole('region', { name: 'Needs attention' });
    expect(region).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.getByRole('heading', { level: 2, name: 'Needs attention' })).toHaveClass('text-[15px]');
    expect(region.querySelector('ul')).toHaveClass('divide-y');
    expect(region.querySelector('.font-mono-brand')).toBeNull();
  });
});
