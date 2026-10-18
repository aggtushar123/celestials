import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B_PIZZA, bundleItem } from '../../features/agents/testBundleFixtures';
import { BRIEF } from '../../features/work/feed';
import { stubFeed } from '../../features/work/testFeed';
import { BUNDLE_ITEM, QUESTION, REVIEW } from '../../features/work/testFeedFixtures';
import { recRow } from '../../features/work/testWorkFixtures';
import type { BundleFeedItem } from '../../features/work/workTypes';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderPage, renderWork, where } from '../../pages/work/testPages';
import { MyWorkPage } from '../../pages/work/MyWork';

const HISTORY = '/agents/bundles/history/';
const history = (count: number | 'fail') => async (input: RequestInfo | URL) => {
  const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
  if (path !== HISTORY) return { ok: false, status: 404, json: async () => ({ detail: 'Not found.' }) };
  if (count === 'fail') return { ok: false, status: 500, json: async () => ({ detail: 'Down.' }) };
  return { ok: true, status: 200, json: async () => ({ count, next: null, previous: null, results: [], hidden: 0 }) };
};

/** A bundle like Pizza Hut's, with its own id, title and step labels. */
function bundle(id: number, title: string, kinds = BUNDLE_ITEM.detail.kinds, source: BundleFeedItem['detail']['source'] = BUNDLE_ITEM.detail.source): BundleFeedItem {
  return { ...BUNDLE_ITEM, key: `bundle:${id}`, id, title, at: '2026-10-01T12:00:00Z', detail: { ...BUNDLE_ITEM.detail, kinds, source } };
}

const tile = (label: RegExp) => screen.getAllByRole('button').concat(screen.getAllByRole('link')).find((el) => label.test(el.textContent ?? '')) as HTMLElement;

describe('Work home: the daily brief (2026-10-17)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
  });

  it.each([
    [9, 'Good morning, Alice'],
    [14, 'Good afternoon, Alice'],
    [19, 'Good evening, Alice'],
  ])('greets by the local hour (%i)', async (hour, text) => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 7, hour, 0, 0));
    stubFeed({ recommendations: [] });
    // The greeting is the bar's heading, where "Work" was (owner, 2026-10-18).
    renderWork('/work?queue=mine', { nav: true, user: { id: 1, name: 'Alice Admin' } });
    expect(await screen.findByRole('heading', { level: 1, name: text })).toBeInTheDocument();
  });

  it('keeps "Work" in the bar once a kind chip is chosen', async () => {
    stubFeed({ recommendations: [] });
    renderWork('/work?queue=mine&kind=task', { nav: true, user: { id: 1, name: 'Alice Admin' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Work' })).toBeInTheDocument();
  });

  it('sums the feed up in one line, and the tiles show the counts and the history count', async () => {
    stubFeed({ recommendations: [], passThrough: history(12) });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'Ready to run 4' });
    const summary = document.querySelector('[data-part="brief-summary"]') as HTMLElement;
    expect(summary).toHaveTextContent('Revenact prepared 1 plan of action · 4 wait on you · 2 due today');
    expect(tile(/^Needs you/)).toHaveTextContent('Needs you4');
    expect(tile(/^Due today/)).toHaveTextContent('Due today21 overdue');
    await waitFor(() => expect(tile(/^Done with Revenact/)).toHaveTextContent('Done with Revenact12'));
    expect(tile(/^Done with Revenact/)).toHaveAttribute('href', '/work?queue=history');
  });

  it('shows a dash for Done with Revenact when History cannot be read, and the page still renders', async () => {
    stubFeed({ recommendations: [], passThrough: history('fail') });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'Ready to run 4' });
    expect(tile(/^Done with Revenact/)).toHaveTextContent(`Done with Revenact${BRIEF.NO_FIGURE}`);
  });

  it('says the reader is clear when nothing waits', async () => {
    stubFeed({ decide: [], tasks: [], todos: [], recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    expect(await screen.findByText("You're clear. Revenact will put new work here as it comes in.")).toBeInTheDocument();
    expect(screen.getByText('Nothing waits on you.')).toBeInTheDocument();
    expect(screen.getByText('Nothing on your list.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('Needs you and Due today jump to their sections', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: 'Ready to run 4' });
    await userEvent.click(tile(/^Due today/));
    expect(screen.getByRole('heading', { name: /^Your to-dos/ })).toHaveFocus();
    await userEvent.click(tile(/^Needs you/));
    expect(screen.getByRole('heading', { name: /^Ready to run/ })).toHaveFocus();
  });

  it('draws a bundle with its source and step chain, and only the first Review & run is primary', async () => {
    const jira = bundle(13, 'Checkout outage at Pizza Hut', ['Create a Jira issue', 'Reply in Slack', 'Create a task', 'Send a survey'], { kind: 'slack_message', label: 'Slack', channel: null });
    stubFeed({ decide: [jira, BUNDLE_ITEM], recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const ready = await screen.findByRole('region', { name: 'Ready to run 2' });
    const first = within(ready).getByRole('article', { name: jira.title });
    expect(within(first).getByText('Slack message')).toBeInTheDocument();
    expect(within(within(first).getByRole('list', { name: 'Steps' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Jira', 'Reply', 'To-do', 'Survey']);
    const second = within(ready).getByRole('article', { name: B_PIZZA.title });
    expect(within(second).getByText('Nightly review')).toBeInTheDocument();
    const runs = within(ready).getAllByRole('link', { name: /^Review & run / });
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveClass('bg-accent');
    expect(runs[1]).not.toHaveClass('bg-accent');
    await userEvent.click(runs[0]);
    expect(where()).toBe('/work?queue=mine&bundle=13');
  });

  it('caps a long step chain at five, then +N', async () => {
    const long = bundle(14, 'A long plan', ['Create a task', 'File a note', 'Start a plan', 'Build a segment', 'Send a survey', 'Reply in Slack', 'Create a Jira issue']);
    stubFeed({ decide: [long], recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const steps = await screen.findByRole('list', { name: 'Steps' });
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['To-do', 'Note', 'Plan', 'Segment', 'Survey', '+2']);
  });

  it('shows five waiting items, then Show all expands in place', async () => {
    const many = [REVIEW, QUESTION, ...[21, 22, 23, 24, 25].map((id) => bundle(id, `Plan ${id}`))];
    stubFeed({ decide: many, recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const ready = await screen.findByRole('region', { name: 'Ready to run 7' });
    const list = within(ready).getByRole('list', { name: 'Ready to run' });
    expect(within(list).getAllByRole('article')).toHaveLength(5);
    await userEvent.click(within(ready).getByRole('button', { name: 'Show all 7' }));
    expect(within(list).getAllByRole('article')).toHaveLength(7);
    expect(where()).toBe('/work?queue=mine');
  });

  it('lists the to-do groups under Your to-dos with their own headings', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    const todos = await screen.findByRole('region', { name: 'Your to-dos 7' });
    expect(within(todos).getAllByRole('heading', { level: 3 }).filter((h) => h.id.startsWith('work-feed-')).map((h) => h.textContent)).toEqual([
      'Overdue 1',
      'Today 1',
      'This week 2',
      'Later 1',
      'No date 1',
      'Blocked 1',
    ]);
  });

  it('has no Suggested column: suggestions stay on their chip (owner, 2026-10-18)', async () => {
    const recs = [1, 2, 3].map((n) => recRow({ id: 100 + n, kind: 'health_drop', title: `Suggestion ${n}`, created_at: `2026-10-0${n}T12:00:00.000000Z` }));
    stubFeed({ recommendations: recs });
    renderPage(<MyWorkPage />, '/work?queue=mine');
    await screen.findByRole('region', { name: /^Ready to run/ });
    expect(screen.queryByRole('region', { name: /^Suggested/ })).toBeNull();
    expect(screen.queryByText('Suggestion 3')).toBeNull();
    expect(document.querySelector('[data-part="brief-summary"]')).toHaveTextContent('3 suggestions');
  });

  it('with a chip selected shows the plain grouped list, no brief', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine&kind=bundle');
    expect(await screen.findByRole('region', { name: 'Needs your decision 1' })).toBeInTheDocument();
    expect(screen.queryByText(/^Good (morning|afternoon|evening)/)).toBeNull();
    // The tiles stay on every chip (owner, 2026-10-18); the summary line does not.
    expect(document.querySelector('[data-part="brief-summary"]')).toBeNull();
    expect(screen.getByRole('link', { name: `Review ${bundleItem(B_PIZZA).title}` })).toBeInTheDocument();
  });

  it('keeps the three tiles and their counts on every chip, read from the whole feed', async () => {
    stubFeed({ recommendations: [], passThrough: history(12) });
    renderPage(<MyWorkPage />, '/work?queue=mine&kind=task');
    // The same figures as the unchipped brief (see the test above): Tasks alone has no decisions.
    await waitFor(() => expect(tile(/^Needs you/)).toHaveTextContent('Needs you4'));
    expect(tile(/^Due today/)).toHaveTextContent('Due today2');
    await waitFor(() => expect(tile(/^Done with Revenact/)).toHaveTextContent('Done with Revenact12'));
  });

  it('with a chip on, Needs you clears the chip and jumps to Ready to run', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine&kind=task');
    await waitFor(() => expect(tile(/^Needs you/)).toHaveTextContent('Needs you4'));
    await userEvent.click(tile(/^Needs you/));
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^Ready to run/ })));
  });

  it('fits a phone: tiles stack in one column, no row wider than the page', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work?queue=mine', { width: 375 });
    await screen.findByRole('region', { name: 'Ready to run 4' });
    expect(document.querySelector('[data-part="brief-tiles"]')).toHaveClass('grid-cols-1');
  });
});
