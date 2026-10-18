import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { B_PIZZA, TEAM_BUNDLE } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { stubFeed } from '../features/work/testFeed';
import { TEAM_ITEMS, TEAM_REC } from '../features/work/testFeedFixtures';
import { RECOMMENDATIONS } from '../features/work/testWorkFixtures';
import { sent, stubWork } from '../features/work/testWork';
import { renderPage, renderWork, where } from '../pages/work/testPages';
import { WorkRecommendationsPage } from '../pages/settings/WorkRecommendationsPage';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, WorkRoutes, the
// task panel host and the router. Only fetch is stubbed: the feed stub
// (work in one place contract), with the bundles stub (agent bundles D1) in
// front where a bundle is run, and the Work stub for settings.
// Mine (work in one place spec §5): open a task, block it, comment, read
// the activity; add a to-do, run a bundle, finish a task; take a suggestion
// and dismiss another. A manager reassigns from My team and runs what waits
// on the team; an admin saves the recommender settings and a member reads
// them.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Work: a member works their day on My work', () => {
  it('opens a task from My work, blocks it with a reason, comments, reads the activity', { timeout: 30000 }, async () => {
    const { spy } = stubFeed({ recommendations: [] });
    renderWork('/work/mine', { nav: true, role: 'csm' });
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));

    // Work home's brief: the greeting is the bar's heading, where "Work" was (owner, 2026-10-18).
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([expect.stringMatching(/^Good (morning|afternoon|evening), Alice$/)]);
    const overdue = await screen.findByRole('region', { name: 'Overdue 1' });
    await userEvent.click(within(overdue).getByRole('link', { name: 'Call Pizza Hut' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&task=41'));
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });

    await userEvent.selectOptions(await within(panel).findByLabelText('Status'), 'blocked');
    await userEvent.type(within(panel).getByLabelText('Blocked on'), 'Waiting on the contract');
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark blocked' }));
    await within(panel).findByText('You marked it blocked: Waiting on the contract');
    await userEvent.type(within(panel).getByLabelText('Add a comment'), 'Legal promised Friday.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Comment' }));
    const trail = within(panel).getByRole('list', { name: 'Activity' });
    await waitFor(() =>
      expect(within(trail).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual([
        'Mona Manager created this task for you.',
        'You marked it blocked: Waiting on the contract',
        'You commented',
      ]),
    );
    expect(trail).toHaveTextContent('Legal promised Friday.');

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    expect(await screen.findByRole('region', { name: 'Blocked 2' })).toHaveTextContent('Blocked: Waiting on the contract');
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'blocked', blocked_reason: 'Waiting on the contract' }]);
  });

  it('adds a to-do, runs a bundle, finishes a task, and the badge drops', { timeout: 30000 }, async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine', { nav: true, sidebarItem: true, role: 'csm' });

    // 1. A to-do from the quick-add box lands in No date, only for me.
    await screen.findByRole('region', { name: 'No date 1' });
    expect(await screen.findByRole('link', { name: 'Work, 4 to decide, 1 overdue' })).toHaveAttribute('href', '/work');
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a to-do' }), 'Call the florist{Enter}');
    const noDate = await screen.findByRole('region', { name: 'No date 2' });
    expect(within(noDate).getByRole('link', { name: 'Call the florist' })).toBeInTheDocument();
    expect(within(noDate).getAllByText('Only you')).toHaveLength(2);

    // 2. A bundle run from its panel leaves the list, which the summary says.
    const decide = screen.getByRole('region', { name: 'Ready to run 4' });
    await userEvent.click(within(decide).getByRole('link', { name: `Review & run ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('Done: all 2 steps ran.')).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    expect(await screen.findByRole('region', { name: 'Ready to run 3' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Work, 3 to decide, 1 overdue' })).toBeInTheDocument();

    // 3. The overdue task, done.
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    await waitFor(() => expect(document.querySelector('[data-part="work-toast"]')).toHaveTextContent('Done: Call Pizza Hut.'));
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    expect(await screen.findByRole('link', { name: 'Work, 3 to decide' })).toBeInTheDocument();
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call the florist', priority: 'medium', due_date: null }]);
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'completed' }]);
    expect(sent(spy, 'POST', `/agents/bundles/${B_PIZZA.id}/run/`)).toHaveLength(1);
  });
});

describe('Work: a manager reads the team', () => {
  it('opens My team, opens a report’s row, reassigns their overdue task, and the counts follow', { timeout: 30000 }, async () => {
    const { spy } = stubFeed({ offered: ['me', 'team'], teamHidden: { team: 2 } });
    renderWork('/work?queue=mine', { nav: true, role: 'csm' });

    await userEvent.click(await within(screen.getByRole('navigation', { name: 'Queues' })).findByRole('link', { name: /^My team/ }));
    await waitFor(() => expect(where()).toBe('/work?queue=team'));
    expect(await screen.findByText("2 tasks you can't open")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: /^Carl CSM: 1 open, 1 overdue/ }));
    await userEvent.click(await screen.findByRole('link', { name: 'Chase the exec sponsor' }));
    const panel = await screen.findByRole('dialog', { name: 'Chase the exec sponsor' });
    expect(await within(panel).findByRole('option', { name: "Dana CSM · Can't open this organisation" })).toBeDisabled();
    await userEvent.selectOptions(within(panel).getByLabelText('Assignee'), '2');
    expect(await within(panel).findByText('You assigned it to Mona Manager (was Carl CSM).')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('button', { name: /^Carl CSM: 0 open/ })).toBeInTheDocument();
    expect(await screen.findByText('No open tasks you can see.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/46/')).toEqual([{ assignee_id: 2 }]);
  });

  it('filters the team queue to Suggestions without asking it for private Slack messages', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ team: { team: [...TEAM_ITEMS], company: [] }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    renderWork('/work?queue=team&kind=suggestion', { nav: true });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    await waitFor(() => expect(within(queue).getAllByText('For Carl CSM').length).toBeGreaterThan(0));
    const asked = spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/work/feed/team/'));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => !url.includes('slack_message'))).toBe(true);
  });

  it('a manager clears what waits on the team: runs a bundle, assigns a suggestion, opens an overdue task, and Ask the agent runs at Rest of company', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ team: { team: [...TEAM_ITEMS], company: [...TEAM_ITEMS] }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    renderWork('/work/team?scope=team', { nav: true });
    await waitFor(() => expect(where()).toBe('/work?queue=team'));

    // 1. The queue sits above the counts, for Carl, with no Done and no Add.
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    await waitFor(() => expect(within(queue).getAllByText('For Carl CSM').length).toBeGreaterThan(0));
    expect(within(queue).queryByRole('button', { name: 'Add to my work' })).toBeNull();

    // 2. Run Carl's bundle from its panel: the row leaves.
    await userEvent.click(within(queue).getByRole('link', { name: `Review ${TEAM_BUNDLE.title}` }));
    const panel = await screen.findByRole('dialog', { name: TEAM_BUNDLE.title });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.querySelector(`[data-item="bundle:${TEAM_BUNDLE.id}"]`)).toBeNull());

    // 3. Assign the suggestion to Carl through the form.
    const suggestion = document.querySelector('[data-item="recommendation:61"]') as HTMLElement;
    await userEvent.click(within(suggestion).getByRole('button', { name: 'Assign' }));
    await userEvent.click(within(suggestion).getByRole('button', { name: 'Assign task' }));
    await waitFor(() => expect(document.querySelector('[data-item="recommendation:61"]')).toBeNull());

    // 4. The overdue task opens the panel over Team.
    await userEvent.click(within(queue).getByRole('link', { name: 'Chase the exec sponsor' }));
    await waitFor(() => expect(where()).toBe('/work?queue=team&task=46'));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Chase the exec sponsor' })).getByRole('button', { name: 'Close' }));

    // 5. Rest of company: Ask the agent runs once.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Queues' })).getByRole('link', { name: /^Rest of company/ }));
    expect(await screen.findByRole('region', { name: 'Waiting on the rest of the company' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask the agent' }));
    await waitFor(() => expect(spy.mock.calls.filter(([url, init]) => String(url).endsWith('/agents/ops/run/') && init?.method === 'POST')).toHaveLength(1));
  });
});

describe('Work at phone width', () => {
  it('opens the panel as a bottom sheet, with 44px controls', async () => {
    stubFeed();
    renderWork('/work?queue=mine&task=41', { width: 375, nav: true });
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(panel.closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
    expect(within(panel).getByLabelText('Title')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Add', hidden: true })).toHaveClass('min-h-11');
  });
});

describe('Work: a member decides what Revenact suggests', () => {
  it('adds one to their work, finds it in This week, and dismisses another for a reason of its own', { timeout: 30000 }, async () => {
    const { spy } = stubFeed();
    renderWork('/work/recommended', { nav: true });
    await waitFor(() => expect(where()).toBe('/work?kind=suggestion&queue=mine'));
    const renewal = await screen.findByRole('article', { name: "Prepare Pizza Hut's renewal" });
    await userEvent.click(within(renewal).getByRole('button', { name: 'Add to my work' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent("Added to your work: Prepare Pizza Hut's renewal."));
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1 }]);

    const tickets = screen.getByRole('article', { name: "Get Uber EMEA's urgent tickets moving" });
    await userEvent.click(within(tickets).getByRole('button', { name: 'Dismiss' }));
    await userEvent.selectOptions(within(tickets).getByLabelText('Reason'), 'other');
    await userEvent.type(within(tickets).getByLabelText('Say why'), 'Handled on the QBR call');
    await userEvent.click(within(tickets).getByRole('button', { name: 'Dismiss it' }));
    await waitFor(() => expect(toast).toHaveTextContent("Dismissed: Get Uber EMEA's urgent tickets moving."));
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'other', note: 'Handled on the QBR call' }]);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    const week = await screen.findByRole('region', { name: 'This week 3' });
    expect(within(week).getByRole('link', { name: "Prepare Pizza Hut's renewal" })).toBeInTheDocument();
    expect(week).toHaveTextContent('Recommended by Revenact');
    // Suggestions live on their chip, not in the brief (owner, 2026-10-18).
    expect(screen.queryByRole('region', { name: /^Suggested/ })).toBeNull();
  });
});

describe('Work: an admin tunes the recommender, and a member reads it', () => {
  it('saves who receives them and a threshold, runs it now, and a member sees the saved values', { timeout: 30000 }, async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, '/settings/work/recommendations');
    await userEvent.click(await screen.findByRole('radio', { name: 'The suggested person' }));
    const days = screen.getByLabelText('Within (days)');
    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ recommend_to: 'owner' }, { sources: { renewal_due: { days: 45 } } }]));
    await userEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText(/Run finished/)).toHaveTextContent('Run finished: 2 new, 5 updated, 1 expired. 2 people told.');

    cleanup();
    vi.unstubAllGlobals();
    stubWork({ workSettings: { ...settings, can_edit: false } });
    renderPage(<WorkRecommendationsPage />, '/settings/work/recommendations', { role: 'csm' });
    expect(await screen.findByText('The suggested person')).toBeInTheDocument();
    expect(document.querySelector('[data-source="renewal_due"]')).toHaveTextContent('Renewal due: On · Within (days) 45');
  });
});
