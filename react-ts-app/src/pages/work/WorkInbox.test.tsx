import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { calls } from '../../features/work/testWork';
import { RECOMMENDATIONS } from '../../features/work/testWorkFixtures';
import { stubUnmatched } from '../../features/work/testUnmatched';
import { stubBundles } from '../../features/agents/testBundles';
import { BUNDLES, B_DEPT, MESSAGE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { TEAM_ITEMS, TEAM_QUESTION, TEAM_REC, teamItem } from '../../features/work/testFeedFixtures';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';
import { json } from '../../features/organizations/testStory';
import { QUESTION } from '../../features/work/testFeedFixtures';
import { refOf, CARL } from '../../features/work/testWorkFixtures';

describe('Work inbox (spec §8.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
  });

  it('shows the queues with counts, Mine open, and moves between queues in the URL', async () => {
    stubBundles();
    renderWork('/work');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    const mine = await within(rail).findByRole('link', { name: /^Mine \d+$/ });
    expect(mine).toHaveAttribute('aria-current', 'page');
    expect(within(rail).getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /^Ready to run/ })).toBeInTheDocument();
    await userEvent.click(within(rail).getByRole('link', { name: /^My team/ }));
    await waitFor(() => expect(where()).toBe('/work?queue=team'));
    expect(await screen.findByRole('heading', { name: 'Waiting on your team' })).toBeInTheDocument();
  });

  it('shows no figure for a queue with nothing to decide or overdue (Work home, 2026-10-17)', async () => {
    stubBundles({
      queues: [
        { key: 'mine', label: 'Mine', count: 0 },
        { key: 'team', label: 'My team', count: 3 },
        { key: 'history', label: 'History', count: null },
      ],
    });
    renderWork('/work?queue=mine');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    expect(await within(rail).findByRole('link', { name: 'My team 3' })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: 'Mine' })).toHaveTextContent(/^Mine$/);
  });

  it('keeps the kind filter in the URL and drops it when the queue changes', async () => {
    stubBundles();
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Bundles' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=bundle'));
    expect(await screen.findByRole('region', { name: 'Needs your decision 1' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Queues' })).getByRole('link', { name: /^Rest of company/ }));
    await waitFor(() => expect(where()).toBe('/work?queue=company'));
  });

  it('is a select on phones', async () => {
    stubBundles();
    renderWork('/work?queue=mine', { width: 390 });
    const select = await screen.findByLabelText('Queue');
    expect(screen.queryByRole('navigation', { name: 'Queues' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(select).getByRole('option', { name: /^My team \(\d+\)$/ })).toBeInTheDocument());
    await userEvent.selectOptions(select, 'history');
    await waitFor(() => expect(where()).toBe('/work?queue=history'));
  });

  it('falls back to Mine for a queue the reader is not offered', async () => {
    stubBundles({ offered: ['me'] });
    renderWork('/work?queue=company&kind=bundle', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
  });

  it('offers the default reader Mine, My team, Rest of company and History', async () => {
    stubBundles();
    renderWork('/work');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    await within(rail).findByRole('link', { name: /^Rest of company/ });
    expect(within(rail).getAllByRole('link').map((a) => a.textContent?.replace(/ *\d*$/, ''))).toEqual(['Mine', 'My team', 'Rest of company', 'History']);
  });

  it('shows a queue whose count failed by its label alone, not 0', async () => {
    stubBundles({ failQueueKeys: ['team'] });
    renderWork('/work');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    const team = await within(rail).findByRole('link', { name: /^My team/ });
    expect(team.textContent).toBe('My team');
  });
});

describe('Work inbox: My team people and queues (spec §1.5, §8.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
  });

  it('lists every person with counts, overdue highlighted, the hidden count, and opens a row into their tasks', async () => {
    const { spy } = stubBundles({ offered: ['me', 'team'], teamHidden: { team: 2 } });
    renderWork('/work?queue=team', { role: 'csm' });
    const list = await screen.findByRole('list', { name: 'People' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Alice: 6 open, 1 overdue, 1 blocked, oldest due 5 Oct 2026',
      'Carl CSM: 1 open, 1 overdue, 0 blocked, oldest due 3 Oct 2026',
      'Unassigned (was Erin Former): 1 open, 1 overdue, 0 blocked, oldest due 2 Oct 2026',
      'Dana CSM: 0 open, 0 overdue, 0 blocked',
    ]);
    expect(rows[1].querySelector('.text-danger-ink')).toHaveTextContent('1 overdue');
    expect(rows[3].querySelector('.text-danger-ink')).toBeNull();
    expect(screen.getByText("2 tasks you can't open")).toBeInTheDocument();

    await userEvent.click(rows[1]);
    expect(rows[1]).toHaveAttribute('aria-expanded', 'true');
    const carl = await screen.findByRole('list', { name: 'Carl CSM: open tasks' });
    expect(within(carl).getByRole('link', { name: 'Chase the exec sponsor' })).toHaveAttribute('href', '/work?queue=team&task=46');
    expect(carl).toHaveTextContent('Overdue');
    expect(calls(spy, 'GET', '/work/tasks/')).toEqual(['/work/tasks/?assignee=3&state=open']);

    await userEvent.click(rows[3]);
    expect(await screen.findByText('No open tasks you can see.')).toBeInTheDocument();
  });

  it('answers a question in place only where the item offers answer, sent once, the row leaving with the toast (Chrome test B2)', async () => {
    const answerable = teamItem({ ...QUESTION, id: 73, key: 'question:73', title: 'Who owns the Uber QBR?' }, refOf(CARL), ['answer']);
    const { spy } = stubBundles({ offered: ['me', 'team'], team: { team: [TEAM_QUESTION, answerable] } });
    renderWork('/work?queue=team', { role: 'csm' });
    const theirs = await screen.findByRole('article', { name: TEAM_QUESTION.title });
    expect(within(theirs).queryByRole('button', { name: 'Answer' })).toBeNull();
    const mine = screen.getByRole('article', { name: 'Who owns the Uber QBR?' });
    await userEvent.click(within(mine).getByRole('button', { name: 'Answer' }));
    await userEvent.type(within(mine).getByRole('textbox'), 'Carl does.');
    const send = within(mine).getByRole('button', { name: 'Send answer' });
    await userEvent.click(send);
    await userEvent.click(send);
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(within(toast).getByText('Answered: Who owns the Uber QBR?')).toHaveFocus());
    expect(screen.queryByRole('article', { name: 'Who owns the Uber QBR?' })).toBeNull();
    const answers = spy.mock.calls.filter(([url, init]) => /\/questions\/73\/answer\/$/.test(String(url)) && (init as RequestInit | undefined)?.method === 'POST');
    expect(answers).toHaveLength(1);
  });

  it('shows a zero overdue or blocked count only in the row’s name, and overdue in the danger ink', async () => {
    stubBundles({ offered: ['me', 'team'] });
    renderWork('/work?queue=team', { role: 'csm' });
    const calm = await screen.findByRole('button', { name: /^Dana CSM: 0 open, 0 overdue, 0 blocked/ });
    expect(within(calm).queryByText(/overdue|blocked/)).toBeNull();
    const late = screen.getByRole('button', { name: /^Carl CSM:/ });
    expect(within(late).getByText('overdue').closest('span')).toHaveClass('font-semibold', 'text-danger-ink');
  });

  it('lists what waits on the team above the counts, for whom, with the allowed buttons', async () => {
    stubBundles({ offered: ['me', 'team'], team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC], queueHidden: 1 });
    renderWork('/work?queue=team', { role: 'csm' });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(await within(queue).findByRole('heading', { level: 3, name: /To decide/ })).toBeInTheDocument();
    expect(within(queue).getAllByText('For Carl CSM')).toHaveLength(4);
    expect(within(queue).getByRole('link', { name: /^Review / })).toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: /done/i })).toBeNull();
    expect(within(queue).queryByRole('button', { name: 'Add to my work' })).toBeNull();
    expect(within(queue).getByText("1 more on a record you can't open")).toBeInTheDocument();
    const counts = await screen.findByRole('list', { name: 'People' });
    expect(queue.compareDocumentPosition(counts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never shows a to-do or a draft, and never reads My work’s feed', async () => {
    const { spy } = stubBundles({ offered: ['me', 'team'], team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    renderWork('/work?queue=team', { role: 'csm' });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    await within(queue).findByRole('heading', { level: 3, name: /To decide/ });
    const keys = Array.from(queue.querySelectorAll('[data-item]')).map((el) => el.getAttribute('data-item'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => key?.startsWith('draft:'))).toEqual([]);
    expect(keys.every((key) => TEAM_ITEMS.some((item) => item.key === key))).toBe(true);
    expect(within(queue).queryByText('Only you')).toBeNull();
    // The right pane's Scheduled card reads the reader's own dated to-dos and
    // tasks (kind=task,todo, owner 2026-10-16); the queue itself never reads My work.
    const own = (url: string) => /kind=task(%2C|,)todo/.test(url);
    expect(spy.mock.calls.filter(([url]) => /\/work\/feed\/(\?|$)/.test(String(url)) && !own(String(url)))).toEqual([]);
  });

  it('shows an empty queue, and Try again after a failed read', async () => {
    const { spy } = stubBundles({ offered: ['me', 'team'], team: { team: [] }, failQueue: 1 });
    renderWork('/work?queue=team', { role: 'csm' });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    await userEvent.click(await within(queue).findByRole('button', { name: 'Try again' }));
    expect(await within(queue).findByText('Nothing is waiting on your team.')).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/feed/team/')).length).toBe(2);
  });

  it('shows a skeleton, then Try again after a failed read', async () => {
    const { spy } = stubBundles({ failTeam: 1 });
    renderWork('/work?queue=team');
    expect(screen.getByText('Loading the team')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
    expect(calls(spy, 'GET', '/work/team/')).toHaveLength(2);
  });

  it('a row whose tasks fail to load offers Try again', async () => {
    stubBundles({ failDrill: 1 });
    renderWork('/work?queue=team');
    await userEvent.click(await screen.findByRole('button', { name: /^Carl CSM:/ }));
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Chase the exec sponsor' })).toBeInTheDocument();
  });

  it('reads again after a task changes in the panel', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=team&task=46');
    // The picker is disabled until its people land.
    await screen.findByRole('option', { name: 'Mona Manager' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '2');
    await waitFor(() => expect(calls(spy, 'GET', '/work/team/')).toHaveLength(2));
    expect(await screen.findByRole('button', { name: /^Carl CSM: 0 open/ })).toBeInTheDocument();
  });

  it('Ask the agent at Company scope, for view-all only: it runs, says so, and reads the queue again', async () => {
    const { spy } = stubBundles({ team: { company: [] } });
    renderWork('/work?queue=company');
    const ask = await screen.findByRole('button', { name: 'Ask the agent' });
    expect(screen.getByText('Runs the Ops agent now. Uses AI credits.')).toBeInTheDocument();
    await userEvent.click(ask);
    expect(await screen.findByText(/^The Ops agent ran/)).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url, init]) => String(url).endsWith('/agents/ops/run/') && init?.method === 'POST')).toHaveLength(1);
    await waitFor(() => expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/feed/team/?scope=company')).length).toBe(2));
  });

  it('offers no Ask the agent at My team, or to a reader without view-all', async () => {
    stubBundles({ offered: ['me', 'team'] });
    renderWork('/work?queue=team', { role: 'csm' });
    await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(screen.queryByRole('button', { name: 'Ask the agent' })).toBeNull();
  });

  it('shows a refusal from the run as an alert', async () => {
    stubBundles({ team: { company: [] }, runRefusal: { status: 409, body: { code: 'AI_OFF', detail: 'AI is switched off for this workspace.' } } });
    renderWork('/work?queue=company');
    await userEvent.click(await screen.findByRole('button', { name: 'Ask the agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI is switched off for this workspace.');
  });

  const posts = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([url, init]) => String(url).endsWith('/agents/ops/run/') && (init as RequestInit | undefined)?.method === 'POST').length;

  it('holds Ask the agent after a run: a double press sends one run, a press after the queue is read again sends a second', async () => {
    const { spy } = stubBundles({ team: { company: [] } });
    // The queue's read after the run is held back until both presses landed:
    // the stub answers in microtasks, so without it the read could land
    // between the two clicks and rightly free the button.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (posts(spy) > 0 && String(input).includes('/work/feed/team/')) await gate;
      return spy(input, init);
    });
    renderWork('/work?queue=company');
    const ask = await screen.findByRole('button', { name: 'Ask the agent' });
    await userEvent.dblClick(ask);
    expect(await screen.findByText(/^The Ops agent ran/)).toBeInTheDocument();
    expect(posts(spy)).toBe(1);
    expect(screen.getByRole('button', { name: 'Ask the agent' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    expect(posts(spy)).toBe(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask the agent' })).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    await waitFor(() => expect(posts(spy)).toBe(2));
  });

  it('frees Ask the agent at once after a refused run', async () => {
    const { spy } = stubBundles({ team: { company: [] }, runRefusal: { status: 409, body: { code: 'AI_OFF', detail: 'AI is switched off for this workspace.' } } });
    renderWork('/work?queue=company');
    const ask = await screen.findByRole('button', { name: 'Ask the agent' });
    await userEvent.click(ask);
    await screen.findByRole('alert');
    await userEvent.click(ask);
    await waitFor(() => expect(posts(spy)).toBe(2));
  });
});

describe('department and Unassigned queues (agent bundles D2; Decision 1)', () => {
  it('lists them in the rail with counts and shows their bundles without chips', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true });
    renderWork('/work?queue=department:cs');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    expect(await within(rail).findByRole('link', { name: 'Customer Success 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(rail).getByRole('link', { name: 'Unassigned 1' })).toHaveAttribute('href', '/work?queue=unassigned');
    const queue = await screen.findByRole('region', { name: 'Waiting in Customer Success' });
    expect(within(queue).getByRole('heading', { name: B_DEPT.title })).toBeInTheDocument();
    expect(within(queue).queryByRole('group', { name: 'Show' })).not.toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: 'Ask the agent' })).not.toBeInTheDocument();
  });

  it('shows the queue loading, never a bare "Waiting in", and reads it only once the queues answer', async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/work/queues/')) await gate;
      return spy(input, init);
    });
    renderWork('/work?queue=department:cs');
    expect(await screen.findByText('Loading the queue')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Waiting in/ })).not.toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).includes('/work/feed/team/'))).toBe(false);
    release();
    const queue = await screen.findByRole('region', { name: 'Waiting in Customer Success' });
    expect(await within(queue).findByRole('heading', { name: B_DEPT.title })).toBeInTheDocument();
  });

  it('says the queues could not load, with Try again, rather than a bare title', async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    let fail = true;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (fail && String(input).includes('/work/queues/')) return json(500, { detail: 'Server error.' });
      return spy(input, init);
    });
    renderWork('/work?queue=department:cs');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('heading', { name: /^Waiting in/ })).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('region', { name: 'Waiting in Customer Success' })).toBeInTheDocument();
  });

  it('says so when nothing waits for an owner', async () => {
    stubBundles({ bundles: BUNDLES, unassigned: true });
    stubUnmatched({ items: [] });
    renderWork('/work?queue=unassigned');
    expect(await screen.findByText('Nothing is waiting for an owner.')).toBeInTheDocument();
  });

  it('ignores a kind filter in the URL (notification links carry one)', async () => {
    const { spy } = stubBundles({ bundles: BUNDLES, unassigned: true });
    stubUnmatched({ items: [] });
    renderWork('/work?queue=unassigned&kind=bundle');
    expect(await screen.findByText('Nothing is waiting for an owner.')).toBeInTheDocument();
    const reads = spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/work/feed/team/'));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((url) => !url.includes('kind='))).toBe(true);
  });

  it('falls back to Mine when the queue is not offered', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    renderWork('/work?queue=department:cs');
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
  });

  it('offers them in the phone select', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    renderWork('/work?queue=mine', { width: 390 });
    const select = await screen.findByLabelText('Queue');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Customer Success (1)' })).toBeInTheDocument());
  });
});
