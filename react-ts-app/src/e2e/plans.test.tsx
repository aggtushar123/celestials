import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubPlans } from '../features/plans/testPlans';
import { requestsOf } from '../features/surveys/testSurveys';
import { renderPlans } from '../pages/plans/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Plans pages, the
// store and the router. Only fetch is stubbed, by a stateful stub in the
// contract's shapes that applies spec §1.2's status rules (spec §2.6: start
// a plan from a template, tick a task, mark a milestone done, and see the
// board card move to On track).
const where = () => screen.getByTestId('where').textContent;

describe('Plans', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
    localStorage.clear();
  });

  it('starts a plan from a template, ticks a task, marks a milestone done, and sees it On track on the board', { timeout: 30000 }, async () => {
    const { spy } = stubPlans();

    // 1. Project Management, then New plan over the list.
    const first = renderPlans('/projects', { nav: true });
    expect(screen.getByRole('heading', { name: 'Project Management' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('link', { name: 'New plan' }));
    const modal = await screen.findByRole('dialog', { name: 'New plan' });

    // 2. A record and a template; the review copies the template.
    await userEvent.type(within(modal).getByRole('searchbox', { name: 'Organisation or account' }), 'Initech');
    await userEvent.click(within(await within(modal).findByRole('list', { name: 'Organisations' })).getByRole('button', { name: 'Initech' }));
    await userEvent.click(await within(modal).findByRole('radio', { name: /^Onboarding/ }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Onboarding · Initech');

    // 3. Start it: the plan's page opens under "‹ Project Management".
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(where()).toBe('/projects/500'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Onboarding · Initech' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Project Management' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Not started');

    // 4. Tick a task: the plan goes on track.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hold the kick-off call' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('On track'));

    // 5. Mark Kick-off done by hand; its other task is still open.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Kick-off done' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Kick-off done' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Confirm goals and success criteria' })).not.toBeChecked();
    first.unmount();

    // 6. The board: the card sits in On track, not Not started.
    renderPlans('/projects', { nav: true });
    await userEvent.click(screen.getByRole('tab', { name: 'Board' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: /^On track/ })).getByRole('link', { name: 'Onboarding · Initech' })).toBeInTheDocument());
    expect(within(screen.getByRole('region', { name: /^Not started/ })).queryByRole('link', { name: 'Onboarding · Initech' })).toBeNull();
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)).toHaveLength(1);
    expect(requestsOf(spy, 'PATCH', /^\/plans\/500\/milestones\/\d+\/$/)[0].body).toEqual({ done: true });
  });
});
