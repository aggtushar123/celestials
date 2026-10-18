import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { taskItem, teamItem, TODO_ROOM } from '../../features/work/testFeedFixtures';
import { CALL_PIZZA, CARL, CARL_CHASE, KICKOFF, SECURITY, refOf } from '../../features/work/testWorkFixtures';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage, where } from '../../pages/work/testPages';
import { FeedTaskRow } from './FeedTaskRow';

describe('FeedTaskRow (spec §5 rows)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the record, the due date, Overdue, the priority, and opens the panel', async () => {
    stubFeed();
    const onDone = vi.fn();
    renderPage(<ul><FeedTaskRow item={taskItem(CALL_PIZZA)} group="overdue" busy={false} error={null} onDone={onDone} /></ul>, '/work/mine?kind=task');
    const row = screen.getByRole('listitem');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · Due 5 Oct 2026 · Overdue · High priority');
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    await userEvent.click(within(row).getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    await userEvent.click(within(row).getByRole('link', { name: 'Call Pizza Hut' }));
    expect(where()).toBe('/work/mine?kind=task&task=41');
  });

  it('has no Done without the done action, and names who it is for', () => {
    stubFeed();
    renderPage(<ul><FeedTaskRow item={teamItem(taskItem(CARL_CHASE), refOf(CARL), ['open'])} group="overdue" busy={false} error={null} onDone={() => undefined} /></ul>, '/work/team');
    expect(screen.queryByRole('button', { name: /done/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Chase the exec sponsor' })).toBeInTheDocument();
    expect(screen.getByText('For Carl CSM')).toBeInTheDocument();
    // No empty gap where Done would be (Chrome test 52): the kind's icon, as on the decide rows.
    const row = screen.getByRole('listitem');
    expect(row.querySelector('[data-part="done-gap"]')).toBeNull();
    expect(row.querySelector('svg[data-part="kind-icon"]')).not.toBeNull();
  });

  it('names the colleague who sent it from Slack, with a link back to the message (2026-10-18)', () => {
    const base = taskItem(CALL_PIZZA);
    const item = { ...base, detail: { ...base.detail, from_slack: { by: 'Faiz', permalink: 'https://slack.com/archives/C1/p1' } } };
    renderPage(<ul><FeedTaskRow item={item} group="week" busy={false} error={null} onDone={() => undefined} /></ul>, '/work/mine');
    expect(screen.getByText('From Slack by Faiz')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Slack' })).toHaveAttribute('href', 'https://slack.com/archives/C1/p1');
  });

  it('leaves out a Slack link that is not https', () => {
    const base = taskItem(CALL_PIZZA);
    const item = { ...base, detail: { ...base.detail, from_slack: { by: 'Faiz', permalink: 'javascript:alert(1)' } } };
    renderPage(<ul><FeedTaskRow item={item} group="week" busy={false} error={null} onDone={() => undefined} /></ul>, '/work/mine');
    expect(screen.getByText('From Slack by Faiz')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Slack' })).toBeNull();
  });

  it('marks a to-do Only you, with no record and No date', () => {
    stubFeed();
    renderPage(<ul><FeedTaskRow item={taskItem(TODO_ROOM)} group="no_date" busy={false} error={null} onDone={() => undefined} /></ul>, '/work/mine');
    const meta = screen.getByRole('listitem').querySelector('[data-part="meta"]');
    expect(meta).toHaveTextContent('No date · Medium priority · Only you');
    expect(meta?.textContent).not.toMatch(/Due/);
    expect(within(screen.getByRole('listitem')).queryByRole('link', { name: 'Pizza Hut' })).toBeNull();
  });

  it('says what a Blocked task waits on, names its plan, and shows a refusal', () => {
    stubFeed();
    renderPage(
      <ul>
        <FeedTaskRow item={taskItem(SECURITY)} group="blocked" busy error="Could not mark that done. Try again." onDone={() => undefined} />
        <FeedTaskRow item={taskItem(KICKOFF)} group="week" busy={false} error={null} onDone={() => undefined} />
      </ul>,
      '/work/mine',
    );
    const [blocked, plan] = screen.getAllByRole('listitem');
    expect(blocked).toHaveTextContent('Blocked: Waiting on legal');
    expect(within(blocked).getByRole('button', { name: /done$/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(blocked).getByRole('button', { name: /done$/ })).not.toBeDisabled();
    expect(within(blocked).getByRole('alert')).toHaveTextContent('Could not mark that done. Try again.');
    expect(plan.querySelector('[data-part="meta"]')).toHaveTextContent('From Onboarding · Pizza Hut');
  });
});
