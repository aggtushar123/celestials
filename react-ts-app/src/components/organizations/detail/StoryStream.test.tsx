import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { StoryItem, StoryResponse } from '../../../features/organizations/storyTypes';
import { QUIET_ATTENTION, STORY_ITEMS } from '../../../features/organizations/testStory';
import { installIntersectionObserver } from '../../../test/intersection';
import { StoryStream } from './StoryStream';
import type { StoryState } from './useStory';

const response = (items: StoryItem[]): StoryResponse => ({
  items,
  next_cursor: null,
  counts: {
    by_group: { all: 0, conversations: 0, tickets: 0, tasks: 0, feedback: 0, health: 0 },
    by_kind: { activity: 0, calendar_event: 0, call: 0, email: 0, health: 0, note: 0, slack: 0, survey: 0, task: 0, ticket: 0 },
    by_account: { all: 0, none: 0 },
  },
  attention: QUIET_ATTENTION,
});

function state(partial: Partial<StoryState> = {}): StoryState {
  const items = partial.items ?? STORY_ITEMS;
  return {
    data: response(items),
    items,
    next: null,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: vi.fn(async () => {}),
    retry: vi.fn(),
    ...partial,
  };
}

function renderStream(story: StoryState, filtered = false) {
  const handlers = { onClearFilters: vi.fn(), onOpenEmail: vi.fn(), onOpenSlack: vi.fn() };
  render(
    <MemoryRouter>
      <StoryStream story={story} filtered={filtered} today="2026-09-25" {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

const row = (key: string) => document.querySelector(`[data-story-item="${key}"]`) as HTMLElement;

describe('StoryStream (spec §1.6 "Stream")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** jsdom lays nothing out: make every one-line summary read as clipped. */
  const clipSummaries = () => vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(500);

  it('draws each day as one card titled by the day, its items divided', () => {
    renderStream(state());
    const today = screen.getByRole('list', { name: 'Today' });
    expect(today).toHaveClass('divide-y');
    expect(today.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toHaveClass('text-[15px]');
    expect(screen.getByRole('heading', { level: 2, name: 'Today' }).className).not.toMatch(/uppercase/);
  });

  it('groups the items by day, newest first', () => {
    renderStream(state());
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Today',
      'Yesterday',
      '20 Sep 2026',
      '31 Aug 2026',
    ]);
    expect(within(screen.getByRole('list', { name: 'Today' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('gives each item its kind, account, who and source, and its time unless it is all-day', () => {
    renderStream(state());
    expect(within(row('email:41')).getByText('EMEA')).toBeInTheDocument();
    expect(within(row('email:41')).getByText('Email · Dana Buyer · via Gmail')).toBeInTheDocument();
    // An organisation's own item says nothing of the organisation (spec §7).
    expect(within(row('call:12')).queryByText('Organization')).toBeNull();
    expect(within(row('call:12')).getByText('The admin left and usage fell. Agreed a retraining session.')).toBeInTheDocument();
    // Logged in Revenact: no "via".
    expect(within(row('call:12')).getByText('Call · Carl CSM')).toBeInTheDocument();
    expect(within(row('ticket:88')).getByText('Ticket · Sam Admin · via Zendesk')).toBeInTheDocument();
    expect(within(row('health:3')).getByText('Health change')).toBeInTheDocument();
    expect(row('call:12').querySelector('time')).not.toBeNull();
    expect(row('ticket:88').querySelector('time')).toBeNull();
    expect(row('health:3').querySelector('time')).toBeNull();
    expect(row('email:41').querySelector('img')).toBeNull();
  });

  it('opens an email that has a thread as its thread', async () => {
    const { onOpenEmail } = renderStream(state());
    const title = within(row('email:41')).getByRole('button', { name: 'Re: Renewal pricing' });
    expect(title).toHaveAttribute('aria-haspopup', 'dialog');
    // A 44px line box on phones, one plain line from sm (Records S4).
    expect(title).toHaveClass('max-sm:leading-[2.75rem]');
    expect(title.className).not.toMatch(/sm:leading-9|sm:min-h-9/);
    await userEvent.click(title);
    expect(onOpenEmail).toHaveBeenCalledWith(STORY_ITEMS[0]);
  });

  it('opens another item in place, with its link in the source system', async () => {
    renderStream(state());
    const title = within(row('ticket:88')).getByRole('button', { name: 'SSO login fails' });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    const link = within(row('ticket:88')).getByRole('link', { name: 'Open in Zendesk' });
    expect(link).toHaveAttribute('href', 'https://acme.zendesk.example/tickets/88');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('min-h-11', 'sm:min-h-9');
    expect(link).not.toHaveClass('sm:min-h-0');
  });

  it('opens an email with no thread in place, links only http(s), and has no toggle with nothing to show', async () => {
    clipSummaries();
    const onDay = { occurred_at: '2026-09-20T00:00:00+00:00', all_day: true };
    const items: StoryItem[] = [
      { ...STORY_ITEMS[0], id: 59, title: 'Logged email', summary: 'Typed in Revenact.', source: 'revenact', link: { thread_id: null, url: null } },
      { ...STORY_ITEMS[1], id: 60, title: 'Recorded call', link: { thread_id: null, url: 'http://rec.example/60' } },
      { ...STORY_ITEMS[3], ...onDay, id: 61, kind: 'note', title: 'Odd link', summary: 'x', link: { thread_id: null, url: 'javascript:alert(1)' } },
      { ...STORY_ITEMS[3], id: 62, kind: 'task', title: 'Bare task', summary: '', link: { thread_id: null, url: null } },
    ];
    const { onOpenEmail } = renderStream(state({ items }));
    const logged = within(row('email:59')).getByRole('button', { name: 'Logged email' });
    expect(logged).not.toHaveAttribute('aria-haspopup');
    await userEvent.click(logged);
    expect(logged).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenEmail).not.toHaveBeenCalled();
    await userEvent.click(within(row('call:60')).getByRole('button', { name: 'Recorded call' }));
    expect(within(row('call:60')).getByRole('link', { name: 'Open the recording' })).toHaveAttribute('href', 'http://rec.example/60');
    await userEvent.click(within(row('note:61')).getByRole('button', { name: 'Odd link' }));
    expect(within(row('note:61')).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row('task:62')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a skeleton before the first page', () => {
    renderStream(state({ data: null, items: [], loading: true }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading the story');
  });

  it('shows the error with Try again', async () => {
    const story = state({ data: null, items: [], error: 'Try later.' });
    renderStream(story);
    expect(screen.getByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(story.retry).toHaveBeenCalledOnce();
  });

  it('says when nothing matches the filters, with Clear filters', async () => {
    const { onClearFilters } = renderStream(state({ items: [] }), true);
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('says when there is nothing yet', () => {
    renderStream(state({ items: [] }));
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('loads the next page when the end scrolls into view, or on Show more', async () => {
    const io = installIntersectionObserver();
    const story = state({ next: '30' });
    renderStream(story);
    act(() => io.reveal(document.querySelector('[data-sentinel]') as Element));
    expect(story.loadMore).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(story.loadMore).toHaveBeenCalledTimes(2);
  });

  it('does not ask again while a page is loading', () => {
    const io = installIntersectionObserver();
    const story = state({ next: '30', loadingMore: true });
    renderStream(story);
    expect(io.watching(document.querySelector('[data-sentinel]') as Element)).toBe(false);
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('shows a failed page under Show more and stops asking until Show more is pressed', async () => {
    const io = installIntersectionObserver();
    const story = state({ next: '30', moreError: 'Could not load more of the story.' });
    renderStream(story);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more of the story.');
    expect(io.watching(document.querySelector('[data-sentinel]') as Element)).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(story.loadMore).toHaveBeenCalledTimes(1);
  });

  it('offers no toggle when the summary fits its line and there is no link', () => {
    const items: StoryItem[] = [{ ...STORY_ITEMS[3], id: 70, kind: 'note', title: 'Short note', summary: 'Fits.', link: { thread_id: null, url: null } }];
    renderStream(state({ items }));
    expect(within(row('note:70')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('note:70')).getByText('Short note')).toBeInTheDocument();
  });

  it('offers the toggle when the summary is cut off, or runs to more lines', async () => {
    const items: StoryItem[] = [
      { ...STORY_ITEMS[3], id: 71, kind: 'note', title: 'Two lines', summary: 'First.\nSecond.', link: { thread_id: null, url: null } },
    ];
    renderStream(state({ items }));
    await userEvent.click(within(row('note:71')).getByRole('button', { name: 'Two lines' }));
    expect(within(row('note:71')).getByRole('button', { name: 'Two lines' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers the toggle when the one-line summary is clipped', () => {
    clipSummaries();
    const items: StoryItem[] = [{ ...STORY_ITEMS[3], id: 72, kind: 'note', title: 'Long note', summary: 'A long summary.', link: { thread_id: null, url: null } }];
    renderStream(state({ items }));
    expect(within(row('note:72')).getByRole('button', { name: 'Long note' })).toHaveAttribute('aria-expanded', 'false');
  });

  it("ellipsizes a long account tag (a pill capped at 10rem)", () => {
    renderStream(state());
    const tag = within(row('email:41')).getByText('EMEA');
    expect(tag).toHaveClass('min-w-0', 'truncate');
    expect(tag.parentElement).toHaveClass('max-w-[10rem]');
  });
});
