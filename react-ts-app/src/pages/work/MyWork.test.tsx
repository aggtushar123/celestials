import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { QUESTION, REVIEW } from '../../features/work/testFeedFixtures';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderPage, where } from './testPages';
import { MyWorkPage } from './MyWork';
import { taskChanged } from '../../components/work/taskChanges';

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('My work (spec §5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
  });

  it('opens on the brief: Ready to run, then Your to-dos; suggestions stay on their chip (owner, 2026-10-18)', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    expect(screen.getByText('Loading your work')).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Ready to run 4' });
    expect(headings()).toEqual(['Ready to run 4', 'Your to-dos 7']);
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('under a chip shows the groups in order with their counts, empty ones hidden', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine&kind=task');
    await screen.findByRole('region', { name: 'Overdue 1' });
    expect(headings()).toEqual(['Overdue 1', 'Today 1', 'This week 2', 'Later 1', 'Blocked 1']);
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('filters by chip through the URL', async () => {
    const { spy } = stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'Ready to run 4' });
    await userEvent.click(screen.getByRole('button', { name: 'Approvals' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=approval'));
    expect(await screen.findByRole('region', { name: 'Needs your decision 1' })).toBeInTheDocument();
    expect(headings()).toEqual(['Needs your decision 1']);
    expect(screen.getByRole('button', { name: 'Approvals' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    // The chipped list reads its kinds; the tiles read the whole feed while a
    // chip is on (owner, 2026-10-18); All reads the whole feed again.
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/', '/work/feed/?kind=rule_review', '/work/feed/', '/work/feed/']);
  });

  it('shows more of a long group', async () => {
    stubFeed({ pageSize: 1 });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const week = await screen.findByRole('region', { name: 'This week 2' });
    expect(within(week).getAllByRole('listitem')).toHaveLength(1);
    expect(week).toHaveTextContent('Showing 1 of 2');
    await userEvent.click(within(week).getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(week).getAllByRole('listitem')).toHaveLength(2));
    expect(within(week).queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('moves focus to the first new row after Show more (Chrome test B3)', async () => {
    stubFeed({ pageSize: 1 });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const week = await screen.findByRole('region', { name: 'This week 2' });
    await userEvent.click(within(week).getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(week).getAllByRole('listitem')).toHaveLength(2));
    const second = within(week).getAllByRole('listitem')[1];
    await waitFor(() => expect(second).toHaveFocus());
    expect(second).toHaveAttribute('tabindex', '-1');
    // Focusable only for that move.
    await userEvent.tab();
    expect(second).not.toHaveAttribute('tabindex');
  });

  it('answers a question in place, sent once; the row leaves and the toast takes focus (Chrome test B2)', async () => {
    const { spy } = stubFeed({ decide: [QUESTION] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const question = await screen.findByRole('article', { name: QUESTION.title });
    expect(within(question).queryByRole('link', { name: 'Answer' })).toBeNull();
    expect(within(question).getByRole('link', { name: 'Open thread' })).toHaveAttribute('href', '/organizations/3?tab=knowledge');
    await userEvent.click(within(question).getByRole('button', { name: 'Answer' }));
    const box = within(question).getByRole('textbox', { name: 'Answer Bob Sales' });
    await waitFor(() => expect(box).toHaveFocus());
    await userEvent.type(box, 'Legal signs off.');
    const send = within(question).getByRole('button', { name: 'Send answer' });
    await userEvent.click(send);
    await userEvent.click(send);
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(within(toast).getByText(`Answered: ${QUESTION.title}`)).toHaveFocus());
    expect(screen.queryByRole('article', { name: QUESTION.title })).toBeNull();
    const answers = spy.mock.calls.filter(([url, init]) => /\/answer\/?$/.test(String(url)) && (init as RequestInit | undefined)?.method === 'POST');
    expect(answers).toHaveLength(1);
    await userEvent.click(within(toast).getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('Add a to-do')).toHaveFocus();
  });

  it('marks a task done, and Undo brings it back', async () => {
    const { spy } = stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const overdue = await screen.findByRole('region', { name: 'Overdue 1' });
    await userEvent.click(within(overdue).getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent('Done: Call Pizza Hut.'));
    expect(within(toast).getByText('Done: Call Pizza Hut.')).toHaveFocus();
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(toast).toHaveTextContent('Reopened: Call Pizza Hut.'));
    expect(await screen.findByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'completed' }, { status: 'pending' }]);
    await userEvent.click(within(toast).getByRole('button', { name: 'Close' }));
    expect(toast).toHaveClass('sr-only');
    expect(toast).toBeEmptyDOMElement();
  });

  it('closing the toast after Done puts focus in the quick-add box, the row being gone', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(within(toast).getByText('Done: Call Pizza Hut.')).toHaveFocus());
    await userEvent.click(within(toast).getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('Add a to-do')).toHaveFocus();
  });

  it('leaves room under the last row while the toast shows, so it can scroll clear', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'Overdue 1' });
    expect(document.querySelector('[data-part="toast-room"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent('Done: Call Pizza Hut.'));
    const room = document.querySelector('[data-part="toast-room"]') as HTMLElement;
    expect(room).toHaveAttribute('aria-hidden', 'true');
    expect(room.className).toMatch(/\bh-32\b/);
    await userEvent.click(within(toast).getByRole('button', { name: 'Close' }));
    expect(document.querySelector('[data-part="toast-room"]')).toBeNull();
  });

  it('an Undo that lands under a chip the item does not belong to leaves it out', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent('Done: Call Pizza Hut.'));
    await userEvent.click(screen.getByRole('button', { name: 'Approvals' }));
    await screen.findByRole('region', { name: 'Needs your decision 1' });
    // The reload after Undo would hide a wrong insert at once: watch every render.
    let seen = false;
    const watch = new MutationObserver(() => {
      if (document.querySelector('[data-group="overdue"]')) seen = true;
    });
    watch.observe(document.body, { childList: true, subtree: true });
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(toast).toHaveTextContent('Reopened: Call Pizza Hut.'));
    watch.disconnect();
    expect(seen).toBe(false);
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    expect(headings()).toEqual(['Needs your decision 1']);
  });

  it('keeps a group whose loaded rows all left while the server has more: heading and Show more stay', async () => {
    stubFeed({ decide: [REVIEW, QUESTION], pageSize: 1 });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const review = await screen.findByRole('article', { name: 'Survey from Detractor follow-up' });
    await userEvent.click(within(review).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Survey from Detractor follow-up' })).toBeNull());
    const decide = screen.getByRole('region', { name: 'Ready to run 1' });
    expect(within(decide).getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('keeps Done focusable and aria-disabled while it sends, sends once, and keeps focus on a refusal', async () => {
    const { spy } = stubFeed({ refuseNextPatch: { status: 400, body: { detail: 'Not now.' } } });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') await gate;
      return spy(input, init);
    });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const done = await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' });
    done.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(done).toHaveAttribute('aria-disabled', 'true'));
    expect(done).not.toBeDisabled();
    expect(done).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    release();
    expect(await screen.findByText('Not now.')).toBeInTheDocument();
    expect(done).toHaveFocus();
    expect(done).not.toHaveAttribute('aria-disabled');
    expect(calls(spy, 'PATCH', '/tasks/41/')).toHaveLength(1);
  });

  it('removes a task the reader lost, and counts it as hidden', async () => {
    stubFeed({ refuseNextPatch: { status: 404, body: { detail: 'No such task.' } } });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    expect(await screen.findByText("1 more on a record you can't open")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark “Call Pizza Hut” done' })).toBeNull();
  });

  it('shows a failed source in its group place, and the rest of the page', async () => {
    const { spy } = stubFeed({ failKinds: { bundle: 1 } });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const notice = await screen.findByText("Couldn't load bundles.");
    expect(await screen.findByRole('region', { name: 'Ready to run 3' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
    await userEvent.click(within(notice.closest('[data-failed]') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Ready to run 4' })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load approvals.")).toBeNull();
    expect(calls(spy, 'GET', '/work/feed/')).toContain('/work/feed/?group=decide');
  });

  it('shows Try again when the feed cannot load at all', async () => {
    stubFeed({ failFeed: 1 });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
  });

  it('says nothing waits, with the quick-add still there', async () => {
    stubFeed({ tasks: [], todos: [], decide: [], recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    expect(await screen.findByText("You're clear. Revenact will put new work here as it comes in.")).toBeInTheDocument();
    expect(screen.getByText('Nothing waits on you.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('says what the chip filters when it has nothing, with Show all (Chrome test 63)', async () => {
    stubFeed({ decide: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine&kind=approval');
    expect(await screen.findByText('No approvals waiting.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing waiting on you.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    expect(await screen.findByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
    // The button left with the empty state: focus is on the All chip, not the body.
    await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toHaveFocus());
  });

  it('places a quick-added to-do without a reload of its own', async () => {
    const { spy } = stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'No date 1' });
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call the florist{Enter}');
    const noDate = await screen.findByRole('region', { name: 'No date 2' });
    expect(within(noDate).getByRole('link', { name: 'Call the florist' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="work-toast"]')).toHaveTextContent('Added: Call the florist.');
    expect(screen.getByLabelText('Add a to-do')).toHaveFocus();
    // R8: the page places the answer itself; the feed is read once, on mount.
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/']);
  });

  it('keeps a to-do quick-added while an older reload is in flight: the feed is read again once it lands', async () => {
    const { spy } = stubFeed({ recommendations: [] });
    let hold: Promise<void> | null = null;
    let release = () => {};
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      // The answer is built now, before the add, and handed over later.
      const answer = await spy(input, init);
      if (hold && (init?.method ?? 'GET') === 'GET' && String(input).includes('/work/feed/') && !String(input).includes('count')) await hold;
      return answer;
    });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'No date 1' });
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    act(() => taskChanged());
    await waitFor(() => expect(calls(spy, 'GET', '/work/feed/')).toHaveLength(2));
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call the florist{Enter}');
    await screen.findByRole('region', { name: 'No date 2' });
    // The older answer, without the to-do, never replaces the list on screen.
    let dropped = false;
    const watch = new MutationObserver(() => {
      if (screen.queryByRole('region', { name: 'No date 1' })) dropped = true;
    });
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    hold = null;
    release();
    await waitFor(() => expect(calls(spy, 'GET', '/work/feed/')).toHaveLength(3));
    watch.disconnect();
    expect(dropped).toBe(false);
    const noDate = await screen.findByRole('region', { name: 'No date 2' });
    expect(within(noDate).getByRole('link', { name: 'Call the florist' })).toBeInTheDocument();
  });

  it('offers the Work settings gear only to those who manage workspace settings', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine');
    expect(await screen.findByRole('link', { name: 'Work settings' })).toHaveAttribute('href', '/settings/work');
  });

  it('hides the gear from a member', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine', { role: 'csm' });
    await screen.findByRole('region', { name: 'Overdue 1' });
    expect(screen.queryByRole('link', { name: 'Work settings' })).toBeNull();
  });

  it('on a phone is one column with 44px controls, the chips scrolling sideways', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work?queue=mine&kind=suggestion', { width: 375 });
    await screen.findAllByRole('button', { name: 'Add to my work' });
    expect(screen.getByRole('group', { name: 'Show' })).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('min-h-11');
    expect(screen.getAllByRole('button', { name: 'Add to my work' })[0]).toHaveClass('min-h-11');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });
});
