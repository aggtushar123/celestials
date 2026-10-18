import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BUILT_TEMPLATE_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import type { PlanTemplate } from '../../features/plans/planTypes';
import { BUILTINS, MINE_TEMPLATE, TEMPLATES } from '../../features/plans/testTemplates';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const where = () => screen.getByTestId('where').textContent;
// A list card is a section named by its heading (no region role without a label).
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;
const item = (name: string) => screen.getByRole('button', { name }).closest('li') as HTMLElement;

describe('templates (spec §2.4)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists Built-in, Yours and Shared with you; only yours can be edited or deleted', async () => {
    stubPlans();
    renderPlans('/projects/templates');
    expect(await screen.findByRole('heading', { level: 1, name: 'Templates' })).toBeInTheDocument();
    await waitFor(() => expect(within(section('Built-in')).getAllByRole('listitem')).toHaveLength(4));
    expect(within(section('Yours')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(section('Shared with you')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(section('Built-in')).queryByRole('link', { name: /^Edit/ })).toBeNull();
    expect(within(section('Yours')).getByRole('link', { name: 'Edit Renewal prep' })).toHaveAttribute('href', '/projects/templates/10/edit');
    expect(item("Carl's expansion play")).toHaveTextContent('From Carl CSM');
    expect(item('Onboarding')).toHaveTextContent('4 milestones · 7 tasks · 60 days');
  });

  it('opens a template in place to view it, and Use starts a plan from it', async () => {
    stubPlans();
    renderPlans('/projects/templates');
    const name = await screen.findByRole('button', { name: 'Onboarding' });
    expect(name).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'true');
    const view = item('Onboarding');
    expect(view).toHaveTextContent('Day 0 · Kick-off');
    expect(view).toHaveTextContent('Hand over to the account owner');
    expect(view).toHaveTextContent("The plan's owner");
    expect(within(view).getByRole('link', { name: 'Use' })).toHaveAttribute('href', '/projects/new?template=1');
  });

  it('makes a new template, counting its milestones and tasks, and lists it', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates/new');
    const modal = await screen.findByRole('dialog', { name: 'New template' });
    expect(modal).toHaveTextContent('1/12 milestones · 0/50 tasks');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Escalation');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Kind' }), 'save');
    const first = modal.querySelector('[data-template-milestone="0"]') as HTMLElement;
    await userEvent.type(within(first).getByRole('textbox', { name: 'Milestone' }), 'Call the sponsor');
    await userEvent.click(within(first).getByRole('button', { name: 'Add task' }));
    await userEvent.type(within(first).getByRole('textbox', { name: 'Task' }), 'Book the call');
    fireEvent.change(within(first).getByRole('spinbutton', { name: 'Task day' }), { target: { value: '2' } });
    await userEvent.selectOptions(within(first).getByRole('combobox', { name: 'Assignee role' }), 'plan_owner');
    expect(modal).toHaveTextContent('1/12 milestones · 1/50 tasks');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(where()).toBe('/projects/templates'));
    expect(requestsOf(spy, 'POST', /^\/plans\/templates\/$/)[0].body).toEqual({
      name: 'Escalation',
      kind: 'save',
      description: '',
      milestones: [{ name: 'Call the sponsor', offset_days: 0, tasks: [{ title: 'Book the call', priority: 'medium', offset_days: 2, assignee_role: 'plan_owner' }] }],
      sharing: 'private',
      shared_with: [],
    });
    await waitFor(() => expect(within(section('Yours')).getAllByRole('listitem')).toHaveLength(2));
  });

  it('checks the name and the days before asking', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates/new');
    const modal = await screen.findByRole('dialog', { name: 'New template' });
    const first = modal.querySelector('[data-template-milestone="0"]') as HTMLElement;
    fireEvent.change(within(first).getByRole('spinbutton', { name: 'Day' }), { target: { value: '400' } });
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    expect(within(modal).getByText('Give the template a name.')).toBeInTheDocument();
    expect(within(first).getByText('Choose 0 to 365 days.')).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(requestsOf(spy, 'POST', /^\/plans\/templates\/$/)).toHaveLength(0);
  });

  it('edits your own template with the whole body', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates/10/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Renewal prep' });
    await waitFor(() => expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Renewal prep'));
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewal prep v2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(where()).toBe('/projects/templates'));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/templates\/10\/$/)[0].body).toMatchObject({ name: 'Renewal prep v2', kind: 'other', sharing: 'private' });
  });

  it.each([
    ['/projects/templates/1/edit', "Built-in templates can't be changed"],
    ['/projects/templates/11/edit', 'Only Carl CSM can edit this template'],
  ])('reads %s as a template you cannot edit', async (url, title) => {
    stubPlans();
    renderPlans(url);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save template' })).toBeNull();
  });

  it('deletes your own template after asking', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Renewal prep' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(section('Yours')).queryAllByRole('listitem')).toHaveLength(0));
    expect(requestsOf(spy, 'DELETE', /^\/plans\/templates\/10\/$/)).toHaveLength(1);
    expect(within(section('Yours')).getByText('Save a plan as a template, or make one from scratch.')).toBeInTheDocument();
  });

  it("saves a plan as a template from the plan's page, then links to it", async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/41');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save as template' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as template' });
    // One status region, mounted (sr-only) before the save and kept after it.
    const region = within(dialog).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass('empty:sr-only');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Onboarding · Globex');
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Our onboarding');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    expect(await within(dialog).findByText('Saved as Our onboarding.')).toBe(region);
    expect(within(dialog).getByRole('link', { name: 'Open template' })).toHaveAttribute('href', '/projects/templates/900/edit');
    expect(requestsOf(spy, 'POST', /^\/plans\/41\/save-as-template\/$/)[0].body).toEqual({ name: 'Our onboarding', sharing: 'private' });
  });

  it('focuses a field-less refusal in the template editor (controller ruling F2)', async () => {
    const mine = Array.from({ length: 50 }, (_, i) => ({ ...MINE_TEMPLATE, id: 200 + i }));
    stubPlans({ templates: [...BUILTINS, ...mine] });
    renderPlans('/projects/templates/new');
    const modal = await screen.findByRole('dialog', { name: 'New template' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Escalation');
    const first = modal.querySelector('[data-template-milestone="0"]') as HTMLElement;
    await userEvent.type(within(first).getByRole('textbox', { name: 'Milestone' }), 'Call the sponsor');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    const alert = await within(modal).findByText('You can own at most 50 templates.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('focuses a field-less refusal in Save as template (controller ruling F2)', async () => {
    const { spy, plansOf } = stubPlans();
    renderPlans('/projects/41');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save as template' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as template' });
    const plans = plansOf();
    plans.splice(plans.findIndex((plan) => plan.id === 41), 1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    const alert = await within(dialog).findByText('It is no longer there, or you can no longer open it.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveClass('text-danger-ink');
    expect(requestsOf(spy, 'POST', /^\/plans\/41\/save-as-template\/$/)).toHaveLength(1);
  });

  it('says an agent wrote a template, on its row and in its editor (Agents delivery 3)', async () => {
    const agentTemplate: PlanTemplate = {
      ...MINE_TEMPLATE,
      id: BUILT_TEMPLATE_ID,
      name: 'Save play for at-risk renewals',
      kind: 'save',
      sharing: 'workspace',
      made_by: MADE_BY_OPS,
    };
    stubPlans({ templates: [...TEMPLATES, agentTemplate] });
    renderPlans('/projects/templates');
    await waitFor(() => expect(within(section('Yours')).getAllByRole('listitem')).toHaveLength(2));
    const row = item('Save play for at-risk renewals');
    expect(row.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
    expect(item('Renewal prep').querySelector('[data-part="made-by"]')).toBeNull();
    await userEvent.click(within(row).getByRole('link', { name: 'Edit Save play for at-risk renewals' }));
    const modal = await screen.findByRole('dialog', { name: 'Edit Save play for at-risk renewals' });
    expect(modal.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('shows the made-by line to a reader who cannot edit the template', async () => {
    const shared = TEMPLATES.find((t) => t.id === 11) as PlanTemplate;
    stubPlans({ templates: [...TEMPLATES.filter((t) => t.id !== 11), { ...shared, made_by: MADE_BY_OPS }] });
    renderPlans('/projects/templates/11/edit');
    const modal = await screen.findByRole('dialog');
    expect(await within(modal).findByText('Only Carl CSM can edit this template')).toBeInTheDocument();
    expect(modal.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });
});

describe('templates on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('names the page once, one primary, each section a list card, no duplicate New template link', async () => {
    stubPlans();
    renderPlans('/projects/templates');
    expect(await screen.findByRole('heading', { level: 1, name: 'Templates' })).toHaveClass('text-[22px]');
    expect(screen.getAllByRole('link', { name: 'New template' })).toHaveLength(1);
    const yours = screen.getByRole('heading', { name: 'Yours' }).closest('section')!;
    expect(yours).toHaveClass('rounded-xl', 'border-line');
  });

  it('flattens the editor: milestones are divided sections inside the dialog, never bordered boxes', async () => {
    stubPlans();
    renderPlans('/projects/templates/new');
    const dialog = await screen.findByRole('dialog');
    const milestones = within(dialog).getByRole('list', { name: 'Template milestones' });
    expect(milestones).toHaveClass('divide-y', 'divide-line-subtle');
    for (const item of within(milestones).getAllByRole('listitem').filter((li) => li.hasAttribute('data-template-milestone'))) {
      expect(item.className).not.toMatch(/\bborder-line\b|rounded-lg/);
    }
  });
});
