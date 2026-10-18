import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { MEMBERS, PIZZA_QBR, PLANS, SERVER, stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const milestone = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const editForms = () => screen.queryAllByRole('form').map((form) => form.getAttribute('aria-label')).filter((name) => name?.startsWith('Edit '));
const open = async (id: number, edit = true) => {
  renderPlans(`/projects/${id}`);
  await screen.findByRole('heading', { level: 1 });
  if (edit) await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
};

describe('editing a plan (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('turns each milestone into a form under Edit, and back under Done editing', async () => {
    stubPlans();
    await open(43);
    expect(screen.getByRole('button', { name: 'Done editing' })).toHaveAttribute('aria-pressed', 'true');
    expect(editForms()).toEqual(['Edit Prepare', 'Edit Meet', 'Edit Follow up']);
    await userEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(editForms()).toEqual([]);
  });

  it("closes a task's open form with Done editing, so Edit opens on the plain list again", async () => {
    stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Draft the deck' }));
    expect(screen.getByRole('form', { name: 'Edit Draft the deck' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('form', { name: 'Edit Draft the deck' })).toBeNull();
  });

  it('renames and re-dates a milestone', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'Edit Prepare' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Milestone name' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Milestone name' }), 'Prepare the review');
    fireEvent.change(within(form).getByLabelText('Milestone due'), { target: { value: '2026-10-07' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Prepare the review' })).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/milestones\/431\/$/)[0].body).toEqual({ name: 'Prepare the review', due_date: '2026-10-07' });
  });

  it("bounds a milestone's and a task's dates by the plan's start, and checks them before asking", async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'Edit Prepare' });
    const due = within(form).getByLabelText('Milestone due');
    expect(due).toHaveAttribute('min', '2026-10-06');
    expect(due).toHaveAttribute('max', '2027-10-06');
    fireEvent.change(due, { target: { value: '2026-10-01' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByText(SERVER.DATE_RANGE)).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'New milestone' })).getByLabelText('New milestone due')).toHaveAttribute('max', '2027-10-06');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Draft the deck' }));
    const task = screen.getByRole('form', { name: 'Edit Draft the deck' });
    expect(within(task).getByLabelText('Due')).toHaveAttribute('min', '2026-10-06');
    fireEvent.change(within(task).getByLabelText('Due'), { target: { value: '2028-01-01' } });
    await userEvent.click(within(task).getByRole('button', { name: 'Save task' }));
    expect(within(task).getByText(SERVER.DATE_RANGE)).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /milestones|tasks/)).toHaveLength(0);
  });

  it('checks a milestone name before asking', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'Edit Meet' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Milestone name' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByText('Give the milestone a name.')).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /milestones/)).toHaveLength(0);
  });

  it('moves a milestone up with its button', async () => {
    const { spy } = stubPlans();
    await open(43);
    expect(screen.getByRole('button', { name: 'Move Prepare up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Follow up down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Follow up up' }));
    await waitFor(() => expect(editForms()).toEqual(['Edit Prepare', 'Edit Follow up', 'Edit Meet']));
    expect(requestsOf(spy, 'POST', /^\/plans\/43\/milestones\/reorder\/$/)[0].body).toEqual({ order: [431, 433, 432] });
  });

  it('removes a milestone after asking', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meet' }));
    expect(screen.getByText('Remove Meet?')).toBeInTheDocument();
    expect(screen.getByText('Its tasks are deleted with it.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(editForms()).toEqual(['Edit Prepare', 'Edit Follow up']));
    expect(requestsOf(spy, 'DELETE', /^\/plans\/43\/milestones\/432\/$/)).toHaveLength(1);
  });

  it("closing the remove confirm with its X saves nothing", async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meet' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove Meet?' })).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Remove Meet?')).toBeNull();
    expect(requestsOf(spy, 'PATCH', /milestones/)).toHaveLength(0);
    expect(requestsOf(spy, 'DELETE', /milestones/)).toHaveLength(0);
  });

  it('offers no Remove on a milestone with work done, and says why', async () => {
    const { spy } = stubPlans();
    await open(41);
    const remove = screen.getByRole('button', { name: 'Remove Kick-off' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(SERVER.MILESTONE_HAS_DONE_WORK);
    expect(within(milestone('Kick-off')).getByText(SERVER.MILESTONE_HAS_DONE_WORK)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove Set up' })).toBeEnabled();
    expect(requestsOf(spy, 'DELETE', /milestones/)).toHaveLength(0);
  });

  it("shows the server's refusal when a hidden task in the milestone is done", async () => {
    const hiddenDone = {
      ...PIZZA_QBR,
      milestones: PIZZA_QBR.milestones.map((m) => (m.id === 432 ? { ...m, tasks: [...m.tasks, { ...m.tasks[0], id: 4329, status: 'completed' as const, visible: false }] } : m)),
    };
    stubPlans({ plans: PLANS.map((plan) => (plan.id === 43 ? hiddenDone : plan)) });
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meet' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await within(screen.getByRole('dialog', { name: 'Remove Meet?' })).findByRole('alert')).toHaveTextContent(SERVER.MILESTONE_HAS_DONE_WORK);
    expect(editForms()).toEqual(['Edit Prepare', 'Edit Meet', 'Edit Follow up']);
  });

  it('adds a milestone at the end, and the target date follows it', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'New milestone' });
    expect(form).toHaveTextContent('3/12 milestones');
    await userEvent.type(within(form).getByRole('textbox', { name: 'New milestone' }), 'Wrap up');
    fireEvent.change(within(form).getByLabelText('New milestone due'), { target: { value: '2026-10-30' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Add milestone' }));
    await waitFor(() => expect(editForms()).toEqual(['Edit Prepare', 'Edit Meet', 'Edit Follow up', 'Edit Wrap up']));
    expect(requestsOf(spy, 'POST', /^\/plans\/43\/milestones\/$/)[0].body).toEqual({ name: 'Wrap up', due_date: '2026-10-30' });
    expect(document.querySelector('[data-part="meta"]')).toHaveTextContent('6 Oct 2026 → 30 Oct 2026');
  });

  it('adds a task under a milestone without Edit', async () => {
    const { spy } = stubPlans();
    await open(43, false);
    await userEvent.click(within(milestone('Meet')).getByRole('button', { name: 'Add task' }));
    const form = screen.getByRole('form', { name: 'New task in Meet' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Task' }), 'Book the room');
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alice'));
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Assignee' }), '4');
    fireEvent.change(within(form).getByLabelText('Due'), { target: { value: '2026-10-15' } });
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Priority' }), 'low');
    await userEvent.click(within(form).getByRole('button', { name: 'Add task' }));
    expect(await within(milestone('Meet')).findByRole('checkbox', { name: 'Book the room' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New task in Meet' })).toBeNull();
    expect(requestsOf(spy, 'POST', /^\/plans\/43\/tasks\/$/)[0].body).toEqual({ milestone: 432, title: 'Book the room', priority: 'low', due_date: '2026-10-15', assignee: 4 });
  });

  it('edits a task, moving it to another milestone', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Draft the deck' }));
    const form = screen.getByRole('form', { name: 'Edit Draft the deck' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Task' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Task' }), 'Draft the QBR deck');
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Milestone' }), '432');
    await userEvent.click(within(form).getByRole('button', { name: 'Save task' }));
    expect(await within(milestone('Meet')).findByRole('checkbox', { name: 'Draft the QBR deck' })).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/tasks\/4312\/$/)[0].body).toEqual({
      milestone: 432, title: 'Draft the QBR deck', priority: 'medium', due_date: '2026-10-11', assignee: 4,
    });
  });

  it('names an assignee who is no longer active instead of waiting for them to load', async () => {
    stubPlans({ members: MEMBERS.map((member) => (member.name === 'Carl CSM' ? { ...member, is_active: false } : member)) });
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Draft the deck' }));
    const select = within(screen.getByRole('form', { name: 'Edit Draft the deck' })).getByRole('combobox', { name: 'Assignee' });
    await waitFor(() => expect(select).toHaveDisplayValue('Carl CSM (no longer active)'));
    expect(within(select).queryByText('Loading teammates')).toBeNull();
  });

  it('removes a task after asking', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Send notes and next steps' }));
    expect(screen.getByText("It is deleted from the plan and from its owner's list.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Send notes and next steps' })).toBeNull());
    expect(requestsOf(spy, 'DELETE', /^\/plans\/43\/tasks\/4331\/$/)).toHaveLength(1);
  });

  it("shows the server's refusal at the task's field", async () => {
    stubPlans();
    await open(41, false);
    await userEvent.click(within(milestone('Set up')).getByRole('button', { name: 'Add task' }));
    const form = screen.getByRole('form', { name: 'New task in Set up' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Task' }), 'Ask Dana');
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alice'));
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Assignee' }), '5');
    await userEvent.click(within(form).getByRole('button', { name: 'Add task' }));
    expect(await within(form).findByText("They can't open this record.")).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'Assignee' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers a reader no Edit and no Add task', async () => {
    stubPlans();
    await open(42, false);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
  });

  it('leaves focus on the message after a field-less refusal on a milestone save', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'Edit Prepare' });
    spy.mockImplementationOnce(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ non_field_errors: ['Could not save this milestone.'] }),
      blob: async () => new Blob(),
    }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent('Could not save this milestone.');
    expect(document.activeElement).toBe(alert);
  });

  it('leaves focus on the message after a field-less refusal on a task save', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Draft the deck' }));
    const form = screen.getByRole('form', { name: 'Edit Draft the deck' });
    spy.mockImplementationOnce(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ non_field_errors: ['Could not save this task.'] }),
      blob: async () => new Blob(),
    }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save task' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent('Could not save this task.');
    expect(document.activeElement).toBe(alert);
  });
});
