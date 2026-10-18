import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { parseDetailParams } from '../../../features/organizations/detailParams';
import type { StoryResponse } from '../../../features/organizations/storyTypes';
import { SLACK_ITEM, stubSlackConversation } from '../../../features/organizations/testSlack';
import {
  ACCOUNTS,
  CONTACTS,
  PIZZA_ATTENTION,
  STORY_ITEMS,
  postBodies,
  storyQueries,
  stubOrganizationPage,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { StoryTab } from './StoryTab';
import type { StoryState } from './useStory';

const DATA: StoryResponse = {
  items: STORY_ITEMS,
  next_cursor: null,
  counts: {
    by_group: { all: 5, conversations: 2, tickets: 1, tasks: 1, feedback: 0, health: 1 },
    by_kind: { activity: 0, calendar_event: 0, call: 1, email: 1, health: 1, note: 0, slack: 0, survey: 0, task: 1, ticket: 1 },
    by_account: { all: 5, none: 3, '31': 1, '32': 1 },
  },
  attention: PIZZA_ATTENTION,
};

function story(partial: Partial<StoryState> = {}): StoryState {
  return {
    data: DATA,
    items: STORY_ITEMS,
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

function renderTab(state: StoryState = story(), search = '') {
  const handlers = { onUpdate: vi.fn(), onAdded: vi.fn(), onOpenTab: vi.fn(), onJump: vi.fn() };
  const store = makeDetailStore();
  const tab = (active: boolean) => (
    <Provider store={store}>
      <MemoryRouter>
        <StoryTab
          orgId={7}
          story={state}
          params={parseDetailParams(new URLSearchParams(search))}
          accounts={ACCOUNTS}
          isSm
          active={active}
          {...handlers}
        />
      </MemoryRouter>
    </Provider>
  );
  const { rerender } = render(tab(true));
  return { ...handlers, setActive: (active: boolean) => rerender(tab(active)) };
}

describe('StoryTab (spec §1.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('shows Needs attention, the toolbar and the stream, and wires each to the URL', async () => {
    stubOrganizationPage();
    const { onUpdate, onOpenTab, onJump } = renderTab();
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-story-item]')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: /^1 overdue task/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tickets 1' }));
    await userEvent.click(screen.getByRole('button', { name: '3 unanswered questions' }));
    await userEvent.click(screen.getByRole('button', { name: /^Renewal 47d overdue/ }));
    expect(onUpdate.mock.calls.map(([patch]) => patch)).toEqual([{ group: 'tasks', q: '', sources: [] }, { group: 'tickets' }]);
    expect(onOpenTab).toHaveBeenCalledWith('knowledge');
    expect(onJump).toHaveBeenCalledWith('contract');
  });

  it('writes the search with replace', async () => {
    stubOrganizationPage();
    const { onUpdate } = renderTab();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the story' }), 'quote{Enter}');
    expect(onUpdate).toHaveBeenCalledWith({ q: 'quote' }, { replace: true });
  });

  it('Clear filters clears the account, the filter, the sources and the search', async () => {
    stubOrganizationPage();
    const { onUpdate } = renderTab(story({ items: [] }), 'account=31&group=tasks&q=zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onUpdate).toHaveBeenCalledWith({ account: '', group: '', sources: [], q: '' });
  });

  it('adds on the chosen account, closes the sheet, and says so', async () => {
    const spy = stubOrganizationPage();
    const { onAdded } = renderTab(story(), 'account=31');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog).toHaveAccessibleDescription('On EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onAdded).toHaveBeenCalledOnce();
    expect(screen.getByText('Added to the story.')).toBeInTheDocument();
    expect(postBodies(spy, '/customers/7/accounts/31/notes/')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add to the story' })).toHaveFocus();
  });

  it('schedules a meeting with a contact: Google invites them, and the story says so', async () => {
    const spy = stubOrganizationPage({ lists: { contacts: CONTACTS } });
    const { onAdded } = renderTab(story());
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Schedule meeting' }));
    const dialog = screen.getByRole('dialog', { name: 'Schedule meeting' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Renewal call');
    await userEvent.type(within(dialog).getByLabelText('Date'), '2026-10-20');
    await userEvent.type(within(dialog).getByLabelText('Starts'), '10:00');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Dana Buyer/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book meeting' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Meeting booked with a Meet link. Google is emailing the invites.')).toBeInTheDocument();
    expect(onAdded).toHaveBeenCalledWith('meeting');
    expect(postBodies(spy, '/calendar/meetings/')).toEqual([expect.objectContaining({ customer_id: 7, contact_ids: [51], title: 'Renewal call' })]);
  });

  it('opens an email as its thread, read with ?thread= whatever account is chosen', async () => {
    const spy = stubOrganizationPage();
    renderTab(story(), 'account=31');
    await userEvent.click(screen.getByRole('button', { name: 'Re: Renewal pricing' }));
    const dialog = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(await within(dialog).findAllByRole('listitem')).toHaveLength(2);
    expect(Object.fromEntries(storyQueries(spy)[0])).toEqual({ thread: 't-1', limit: '100' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Re: Renewal pricing' })).toHaveFocus();
  });

  it('opens a Slack thread as a sheet and Escape closes it', async () => {
    stubOrganizationPage();
    stubSlackConversation();
    renderTab(story({ items: [...STORY_ITEMS, SLACK_ITEM] }));
    await userEvent.click(screen.getByRole('button', { name: SLACK_ITEM.title }));
    const dialog = screen.getByRole('dialog', { name: SLACK_ITEM.title });
    expect(await within(dialog).findByText('Looking now.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes an attention row to its filter from a clean slate: the search and the sources go too', async () => {
    stubOrganizationPage();
    const { onUpdate } = renderTab(story(), 'group=conversations&source=email&q=quote');
    await userEvent.click(screen.getByRole('button', { name: /^2 open High or Critical tickets/ }));
    expect(onUpdate).toHaveBeenCalledWith({ group: 'tickets', q: '', sources: [] });
  });

  it('adds on the organization when ?account= names no account it has', async () => {
    const spy = stubOrganizationPage();
    const { onAdded } = renderTab(story(), 'account=99');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog).toHaveAccessibleDescription('On the organization');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/customers/7/notes/')).toHaveLength(1);
    expect(postBodies(spy, '/customers/7/accounts/99/notes/')).toHaveLength(0);
  });

  it('closes + Add and an open email when the tab is hidden, and gives the page its scroll back', async () => {
    stubOrganizationPage();
    const { setActive } = renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    setActive(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    setActive(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Re: Renewal pricing' }));
    expect(screen.getByRole('dialog', { name: 'Re: Renewal pricing' })).toBeInTheDocument();
    setActive(false);
    setActive(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tells the page what kind of record was added', async () => {
    stubOrganizationPage();
    const { onAdded } = renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('note'));
  });
});
