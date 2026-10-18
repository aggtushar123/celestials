import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TEAM_SUGGESTION, suggestionItem, taskItem } from '../../features/work/testFeedFixtures';
import { CALL_PIZZA, REC_RENEWAL, REC_TICKETS } from '../../features/work/testWorkFixtures';
import { sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage } from '../../pages/work/testPages';
import { FeedRow, type FeedRowProps } from './FeedRow';
import { useRecommendationChanges, useTaskChanges } from './taskChanges';

const handlers = () => ({ onDone: vi.fn(), onSettled: vi.fn(), onGone: vi.fn(), onLost: vi.fn() });
const props = (over: Partial<FeedRowProps>) => ({
  item: suggestionItem(REC_RENEWAL), group: 'suggested', isSm: true, me: 1, busy: false, error: null, ...handlers(), ...over,
}) as FeedRowProps & ReturnType<typeof handlers>;

describe('FeedRow and the suggestion row (spec §5 rows)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes a task to the task row', () => {
    stubFeed();
    renderPage(<ul><FeedRow {...props({ item: taskItem(CALL_PIZZA), group: 'overdue' })} /></ul>, '/work/mine');
    expect(screen.getByRole('button', { name: 'Mark “Call Pizza Hut” done' })).toBeInTheDocument();
  });

  it('offers Assign and Dismiss but not Add to my work in the Team queue', () => {
    stubFeed();
    renderPage(<ul><FeedRow {...props({ item: TEAM_SUGGESTION, group: 'suggested' })} /></ul>, '/work/team');
    expect(screen.queryByRole('button', { name: 'Add to my work' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByText('For Carl CSM')).toBeInTheDocument();
  });

  it('adds a suggestion to my work in one click, as a task for me', async () => {
    const { spy } = stubFeed();
    const p = props({});
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    const article = screen.getByRole('article', { name: "Prepare Pizza Hut's renewal" });
    expect(article.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · Revenact');
    expect(within(article).getByRole('list')).toHaveTextContent('Renews in 9 days');
    await userEvent.dblClick(within(article).getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(p.onSettled).toHaveBeenCalledTimes(1));
    expect(p.onSettled.mock.calls[0][1].text).toBe("Added to your work: Prepare Pizza Hut's renewal.");
    expect(p.onSettled.mock.calls[0][1].link.label).toBe('Open task');
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1 }]);
  });

  it('fires the task-changed signal after Add to my work', async () => {
    stubFeed();
    const changed = vi.fn();
    function Listener() {
      useTaskChanges(changed);
      return null;
    }
    renderPage(<><Listener /><ul><FeedRow {...props({})} /></ul></>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  });

  it('from sm shows Assign and Dismiss as buttons; Assign sends the chosen person and signals a task change', async () => {
    const { spy } = stubFeed();
    const changed = vi.fn();
    function Listener() {
      useTaskChanges(changed);
      return null;
    }
    const p = props({ item: suggestionItem(REC_TICKETS) });
    renderPage(<><Listener /><ul><FeedRow {...p} /></ul></>, '/work/mine');
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to my work' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    const who = await screen.findByLabelText('Who does it');
    await vi.waitFor(() => expect(who).toBeEnabled());
    const person = within(who).getAllByRole('option').find((o) => (o as HTMLOptionElement).value !== '' && (o as HTMLOptionElement).value !== '1');
    await userEvent.selectOptions(who, (person as HTMLOptionElement).value);
    await userEvent.click(screen.getByRole('button', { name: 'Assign task' }));
    await vi.waitFor(() => expect(p.onSettled).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/work/recommendations/6/assign/')).toEqual([expect.objectContaining({ assignee_id: Number((person as HTMLOptionElement).value) })]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('Dismiss sends the reason, settles the row and signals a recommendations change', async () => {
    const { spy } = stubFeed();
    const changed = vi.fn();
    function Listener() {
      useRecommendationChanges(changed);
      return null;
    }
    const p = props({ item: suggestionItem(REC_TICKETS) });
    renderPage(<><Listener /><ul><FeedRow {...p} /></ul></>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'not_relevant');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss it' }));
    await vi.waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(p.item, { text: "Dismissed: Get Uber EMEA's urgent tickets moving." }));
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'not_relevant' }]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('on a phone keeps Add to my work and folds Assign and Dismiss into the row menu', async () => {
    stubFeed();
    renderPage(<ul><FeedRow {...props({ isSm: false })} /></ul>, '/work/mine');
    expect(screen.getByRole('button', { name: 'Add to my work' })).toHaveClass('min-h-11');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Assign' }));
    expect(await screen.findByLabelText('Who does it')).toBeInTheDocument();
  });

  it('a suggestion decided elsewhere leaves in the server words; one gone is lost', async () => {
    stubFeed({ refuseNextDecision: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already assigned this.' } } });
    const p = props({});
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(p.onGone).toHaveBeenCalledWith(p.item, 'Mona Manager already assigned this.'));
    vi.unstubAllGlobals();
    stubFeed({ recommendations: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(p.onLost).toHaveBeenCalledWith(p.item, "This recommendation isn't there any more."));
  });
});
