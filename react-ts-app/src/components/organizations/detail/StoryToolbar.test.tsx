import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryToolbar } from './StoryToolbar';

const COUNTS = { all: 5, conversations: 2, tickets: 1, tasks: 1, feedback: 0, health: 1 };
const BY_KIND = { activity: 0, calendar_event: 0, call: 1, email: 1, health: 1, note: 0, slack: 0, survey: 0, task: 1, ticket: 1 };

function renderToolbar(props: Partial<ComponentProps<typeof StoryToolbar>> = {}) {
  const handlers = { onGroup: vi.fn(), onSources: vi.fn(), onSearch: vi.fn(), onAdd: vi.fn() };
  const base = { group: '' as const, sources: [], q: '', byGroup: COUNTS, byKind: BY_KIND, ...handlers };
  const view = render(<StoryToolbar {...base} {...props} />);
  return { ...handlers, rerender: (next: Partial<ComponentProps<typeof StoryToolbar>>) => view.rerender(<StoryToolbar {...base} {...props} {...next} />) };
}

const filters = () => within(screen.getByRole('group', { name: 'Show' })).getAllByRole('button');

describe('StoryToolbar (spec §1.6)', () => {
  it('shows the six filters with their counts, All pressed', () => {
    renderToolbar();
    expect(filters().map((button) => button.textContent)).toEqual([
      'All 5',
      'Conversations 2',
      'Tickets 1',
      'Tasks & notes 1',
      'Feedback 0',
      'Health & usage 1',
    ]);
    expect(screen.getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the filters without numbers until the story has counted', () => {
    renderToolbar({ byGroup: null, byKind: null });
    expect(filters().map((button) => button.textContent)).toEqual(['All', 'Conversations', 'Tickets', 'Tasks & notes', 'Feedback', 'Health & usage']);
  });

  it('chooses a filter', async () => {
    const { onGroup } = renderToolbar({ group: 'tickets' });
    expect(screen.getByRole('button', { name: 'Tickets 1' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Conversations 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'All 5' }));
    expect(onGroup.mock.calls.map(([group]) => group)).toEqual(['conversations', '']);
  });

  it("offers the chosen filter's exact sources that have data, and resets them", async () => {
    const { onSources } = renderToolbar({ group: 'conversations', sources: ['email'] });
    const sources = screen.getByRole('button', { name: 'Sources · 1' });
    await userEvent.click(sources);
    expect(sources).toHaveAttribute('aria-expanded', 'true');
    const boxes = screen.getAllByRole('checkbox');
    // by_kind has no activities or calendar events, so neither is offered.
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual(['Calls', 'Emails']);
    expect(screen.getByRole('checkbox', { name: 'Emails' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Calls' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Emails' }));
    await userEvent.click(screen.getByRole('button', { name: 'Every source' }));
    expect(onSources.mock.calls.map(([next]) => next)).toEqual([['email', 'call'], [], []]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(sources).toHaveFocus();
  });

  it('searches once typing stops, and at once on Enter', async () => {
    const { onSearch } = renderToolbar();
    const box = screen.getByRole('searchbox', { name: 'Search the story' });
    await userEvent.type(box, 'retraining');
    expect(onSearch).not.toHaveBeenCalled();
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('retraining'));
    expect(onSearch).toHaveBeenCalledTimes(1);
    await userEvent.clear(box);
    await userEvent.type(box, ' quote {Enter}');
    expect(onSearch).toHaveBeenLastCalledWith('quote');
  });

  it('follows a search that changes from outside (Clear filters)', () => {
    const { rerender } = renderToolbar({ q: 'quote' });
    expect(screen.getByRole('searchbox', { name: 'Search the story' })).toHaveValue('quote');
    rerender({ q: '' });
    expect(screen.getByRole('searchbox', { name: 'Search the story' })).toHaveValue('');
  });

  it('+ Add offers only the flows it is given (an account page has no meeting)', async () => {
    renderToolbar({ addKinds: ['call', 'task', 'note', 'survey'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    expect(screen.queryByRole('menuitem', { name: 'Schedule meeting' })).toBeNull();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  it('+ Add offers the create flows, Schedule meeting last', async () => {
    const { onAdd } = renderToolbar();
    const add = screen.getByRole('button', { name: 'Add to the story' });
    // The primary: accent fill and its own text colour, with no surface fill to fight it.
    expect(add).toHaveClass('bg-accent', 'text-on-accent');
    expect(add).not.toHaveClass('bg-surface');
    expect(add).not.toHaveClass('text-ink');
    await userEvent.click(add);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Log a call', 'New task', 'New note', 'Log survey', 'Schedule meeting']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    expect(onAdd).toHaveBeenCalledWith('task');
  });

  it('lets the filters scroll sideways on phones', () => {
    renderToolbar();
    expect(screen.getByRole('group', { name: 'Show' })).toHaveClass('overflow-x-auto');
  });

  it('puts the search with its count on the first toolbar row, Sources and + Add after it', () => {
    renderToolbar();
    const search = screen.getByRole('search');
    expect(search.closest('[data-part="toolbar-search"]')).toHaveClass('basis-full');
    expect(search).toHaveClass('min-w-0', 'flex-1');
    expect(search.parentElement).not.toContainElement(screen.getByRole('button', { name: 'Add to the story' }));
  });
});
