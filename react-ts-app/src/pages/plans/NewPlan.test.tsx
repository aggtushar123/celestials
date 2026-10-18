import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const open = async (url = '/projects/new') => {
  renderPlans(url);
  return screen.findByRole('dialog', { name: 'New plan' });
};
async function pickRecord(modal: HTMLElement, search: string, group: 'Organisations' | 'Accounts', name: string) {
  await userEvent.type(within(modal).getByRole('searchbox', { name: 'Organisation or account' }), search);
  const list = await within(modal).findByRole('list', { name: group });
  await userEvent.click(within(list).getByRole('button', { name }));
}
async function pickTemplate(modal: HTMLElement, name: RegExp) {
  await userEvent.click(await within(modal).findByRole('radio', { name }));
}
const milestone = (modal: HTMLElement, index: number) => modal.querySelector(`[data-milestone-draft="${index}"]`) as HTMLElement;
const task = (row: HTMLElement, index: number) => row.querySelector(`[data-task-draft="${index}"]`) as HTMLElement;

describe('New plan (spec §2.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens over the list, finds a record by name, offers templates with their length, and reviews the copy', async () => {
    stubPlans();
    const modal = await open();
    expect(where()).toBe('/projects/new');
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    expect(modal.querySelector('[data-part="record"]')).toHaveTextContent('Initech');
    const onboarding = await within(modal).findByRole('radio', { name: /^Onboarding/ });
    expect(onboarding.closest('label')).toHaveTextContent('4 milestones · 7 tasks · 60 days');
    expect(within(modal).getByRole('group', { name: 'Yours' })).toHaveTextContent('Renewal prep');
    expect(within(modal).getByRole('group', { name: 'Shared with you' })).toHaveTextContent("Carl's expansion play");
    await userEvent.click(onboarding);
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Onboarding · Initech');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Owner' })).toHaveDisplayValue('Alice'));
    expect(within(modal).getByLabelText('Start date')).toHaveValue('2026-10-04');
    const handoff = milestone(modal, 3);
    expect(within(handoff).getByRole('textbox', { name: 'Milestone' })).toHaveValue('Hand-off');
    expect(within(handoff).getByLabelText('Milestone due')).toHaveValue('2026-12-03');
    await waitFor(() => expect(within(task(handoff, 0)).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Carl CSM'));
    expect(within(task(handoff, 1)).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alice');
    expect(modal).toHaveTextContent('4/12 milestones · 7/50 tasks');
  });

  it('starts the reviewed copy, edits and all, and opens the plan', async () => {
    const { spy } = stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^Onboarding/);
    const kickoff = milestone(modal, 0);
    await userEvent.clear(within(kickoff).getByRole('textbox', { name: 'Milestone' }));
    await userEvent.type(within(kickoff).getByRole('textbox', { name: 'Milestone' }), 'Kick-off call');
    await waitFor(() => expect(within(task(kickoff, 0)).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Carl CSM'));
    await userEvent.selectOptions(within(task(kickoff, 0)).getByRole('combobox', { name: 'Assignee' }), '1');
    fireEvent.change(within(milestone(modal, 1)).getByLabelText('Milestone due'), { target: { value: '2026-10-20' } });
    const value = milestone(modal, 2);
    await userEvent.click(within(value).getByRole('button', { name: 'Remove Review first results with the champion' }));
    await userEvent.click(within(value).getByRole('button', { name: 'Add task' }));
    await userEvent.type(within(task(value, 0)).getByRole('textbox', { name: 'Task' }), 'Book the review');
    await userEvent.selectOptions(within(task(value, 0)).getByRole('combobox', { name: 'Assignee' }), '5');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(where()).toBe('/projects/500'));
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)[0].body).toEqual({
      template: 1,
      customer: 2,
      name: 'Onboarding · Initech',
      owner: 1,
      start_date: '2026-10-04',
      milestones: [
        {
          name: 'Kick-off call',
          due_date: '2026-10-04',
          tasks: [
            { title: 'Hold the kick-off call', priority: 'high', due_date: '2026-10-04', assignee: 1 },
            { title: 'Confirm goals and success criteria', priority: 'high', due_date: '2026-10-07', assignee: 4 },
          ],
        },
        {
          name: 'Set up',
          due_date: '2026-10-20',
          tasks: [
            { title: 'Connect data sources', priority: 'high', due_date: '2026-10-14', assignee: 4 },
            { title: "Invite the customer's team", priority: 'medium', due_date: '2026-10-18', assignee: 4 },
          ],
        },
        { name: 'First value', due_date: '2026-11-03', tasks: [{ title: 'Book the review', priority: 'medium', due_date: '2026-11-03', assignee: 5 }] },
        {
          name: 'Hand-off',
          due_date: '2026-12-03',
          tasks: [
            { title: 'Run the onboarding review', priority: 'medium', due_date: '2026-11-28', assignee: 4 },
            { title: 'Hand over to the account owner', priority: 'medium', due_date: '2026-12-03', assignee: 1 },
          ],
        },
      ],
    });
  });

  it('starts once however often Start plan is pressed', async () => {
    const { spy } = stubPlans({ start: () => new Promise(() => {}) });
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^QBR/);
    const start = within(modal).getByRole('button', { name: 'Start plan' });
    await userEvent.click(start);
    await userEvent.click(start);
    await userEvent.keyboard('{Enter}');
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)).toHaveLength(1);
    expect(within(modal).getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('moves every date by the same days when the start date changes', async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^Onboarding/);
    fireEvent.change(within(modal).getByLabelText('Start date'), { target: { value: '2026-10-06' } });
    expect(within(milestone(modal, 3)).getByLabelText('Milestone due')).toHaveValue('2026-12-05');
    expect(within(task(milestone(modal, 0), 1)).getByLabelText('Due')).toHaveValue('2026-10-09');
  });

  it("says the record already has an open plan from that template, links to it, and focuses the sentence", async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Glo', 'Organisations', 'Globex');
    await pickTemplate(modal, /^Onboarding/);
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    const conflict = await within(modal).findByText('This record already has an open Onboarding plan.', { exact: false });
    const line = conflict.closest('[data-part="plan-open"]') as HTMLElement;
    expect(within(line).getByRole('link', { name: 'Open that plan' })).toHaveAttribute('href', '/projects/41');
    await waitFor(() => expect(line).toHaveFocus());
    expect(where()).toBe('/projects/new');
  });

  it("keeps the list's filters under the modal and back on Cancel", async () => {
    stubPlans();
    const modal = await open('/projects/new?kind=qbr&status=all');
    expect(screen.getByRole('link', { name: 'New plan' })).toHaveAttribute('href', '/projects/new?kind=qbr&status=all');
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/projects?kind=qbr&status=all'));
  });

  it("drops Templates' ?template= on Cancel", async () => {
    stubPlans();
    const modal = await open('/projects/new?template=3');
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/projects'));
  });

  it('replaces the modal with the new plan, so Back does not reopen it', async () => {
    stubPlans();
    renderPlans('/projects/new', { history: ['/projects?kind=qbr'] });
    const modal = await screen.findByRole('dialog', { name: 'New plan' });
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^QBR/);
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(where()).toBe('/projects/500'));
    await userEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(where()).toBe('/projects?kind=qbr'));
    expect(screen.queryByRole('dialog', { name: 'New plan' })).toBeNull();
  });

  it('puts refusals at their fields and focuses the first', async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Glo', 'Organisations', 'Globex');
    await pickTemplate(modal, /^Success plan/);
    const owner = within(modal).getByRole('combobox', { name: 'Owner' });
    await waitFor(() => expect(owner).toHaveDisplayValue('Alice'));
    await userEvent.selectOptions(owner, '5');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(owner).toHaveFocus());
    expect(owner).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(owner.getAttribute('aria-describedby')!)).toHaveTextContent("They can't open this record.");
    await userEvent.selectOptions(owner, '1');
    const first = task(milestone(modal, 0), 0);
    await userEvent.selectOptions(within(first).getByRole('combobox', { name: 'Assignee' }), '5');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(within(first).getByRole('combobox', { name: 'Assignee' })).toHaveFocus());
    expect(first).toHaveTextContent("They can't open this record.");
  });

  it('checks the name before asking', async () => {
    const { spy } = stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^QBR/);
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Name' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    expect(await within(modal).findByText('Give the plan a name.')).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)).toHaveLength(0);
  });

  it('starts from the template Use chose', async () => {
    stubPlans();
    const modal = await open('/projects/new?template=3');
    expect(await within(modal).findByRole('radio', { name: /^Save plan/ })).toBeChecked();
  });

  it('keeps the draft on a scrim click; Cancel goes back to the list', async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'New plan' })).toHaveTextContent('Initech');
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
