import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useNavigationType } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { calls, stubWork } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage, where } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { MyWorkPage } from '../../pages/work/MyWork';

/** How the router last moved: POP after a step back, REPLACE after a replace. */
function Moved() {
  return <p data-testid="moved">{useNavigationType()}</p>;
}
const moved = () => screen.getByTestId('moved').textContent;

describe('the task panel (spec §1.5: a side sheet at ?task=<id> on any route)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('opens over any page, reads the task, and closes back to the same URL', async () => {
    const { spy } = stubWork();
    renderPage(<p>Waiting on you</p>, '/brain/waiting?scope=me&task=41');
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(panel.closest('[data-shape]')).toHaveAttribute('data-shape', 'panel');
    expect(within(panel).getByLabelText('Priority')).toHaveValue('high');
    expect(within(panel).getByLabelText('Due')).toHaveValue('2026-10-05');
    expect(within(panel).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(within(panel).getByText(/by Mona Manager/)).toBeInTheDocument();
    expect(within(within(panel).getByRole('list', { name: 'Activity' })).getByText('Mona Manager created this task for you.')).toBeInTheDocument();
    expect(calls(spy, 'GET', '/tasks/')).toEqual(['/tasks/41/']);

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/brain/waiting?scope=me');
  });

  it('closing a panel opened from a link steps back, so Back is not a dead entry', async () => {
    stubFeed();
    renderPage(
      <>
        <MyWorkPage />
        <Moved />
      </>,
      '/work/mine?kind=task',
    );
    await userEvent.click(await screen.findByRole('link', { name: 'Call Pizza Hut' }));
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(where()).toBe('/work/mine?kind=task&task=41');
    expect(moved()).toBe('PUSH');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/work/mine?kind=task');
    expect(moved()).toBe('POP');
  });

  it('closing a panel the page was loaded with drops ?task= in place', async () => {
    stubWork();
    renderPage(<Moved />, '/work/mine?kind=task&task=41');
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/work/mine?kind=task');
    expect(moved()).toBe('REPLACE');
  });

  // The time-zone-specific version of this test (a late-UTC created_at that
  // crosses midnight in the reader's zone, asserted against a concrete
  // expected date) lives in TaskSheetCreatedDate.test.tsx, pinned to IST;
  // see that file for why it's separate.

  it('is a bottom sheet on a phone', async () => {
    stubWork();
    renderPage(<p>My work</p>, '/work/mine?task=41', { width: 375 });
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(panel.closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
  });

  it('shows a plan task’s plan, and a skeleton until the task lands', async () => {
    stubWork();
    renderPage(<p>My work</p>, '/work/mine?task=47');
    // A synchronous check, not `findBy`: the mock fetch resolves over pure
    // microtasks, so an awaited `findBy` can observe this transient skeleton
    // only to have it unmount before its own promise chain settles (same
    // race the codebase avoids elsewhere, e.g. CustomerFacts.test.tsx's
    // loading assertion). Checking synchronously, right after render and
    // before any microtask runs, is the deterministic way to catch it.
    expect(screen.getByLabelText('Loading the task')).toBeInTheDocument();
    const panel = await screen.findByRole('dialog', { name: 'Kick-off call' });
    expect(within(panel).getByRole('link', { name: 'Onboarding · Pizza Hut · Start' })).toHaveAttribute('href', '/projects/12');
    expect(within(panel).getByText('No activity recorded yet.')).toBeInTheDocument();
  });

  it('says so for a task that is gone or not the reader’s to open', async () => {
    stubWork();
    renderPage(<p>My work</p>, '/work/mine?task=999');
    const panel = await screen.findByRole('dialog', { name: 'Task not found' });
    expect(within(panel).getByText("This task isn't there, or you can't open it.")).toBeInTheDocument();
  });

  it('offers Try again when the read fails', async () => {
    const { spy } = stubWork({ failTask: 1 });
    renderPage(<p>My work</p>, '/work/mine?task=41');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut' })).toBeInTheDocument();
    expect(calls(spy, 'GET', '/tasks/')).toHaveLength(2);
  });

  it('opens nothing without a task id, or with one that is not a number', () => {
    const { spy } = stubWork();
    renderPage(<p>My work</p>, '/work/mine?task=abc');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls(spy, 'GET', '/tasks/')).toEqual([]);
  });
});
