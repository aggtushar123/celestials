import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { GLOBEX_ONBOARDING, PIZZA_EMEA_SAVE, PIZZA_ONBOARDING_DRAFT, PLANS, SERVER, stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const milestone = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const open = async (id: number) => {
  renderPlans(`/projects/${id}`);
  // While loading, the bar's sr-only "Plan" is the page's one h1; once the
  // plan is ready its name is, and the bar only leads back.
  await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Plan' })).toBeNull());
  const [heading, ...others] = screen.getAllByRole('heading', { level: 1 });
  expect(others).toHaveLength(0);
  return heading;
};

describe('a plan (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("heads the page with its record, kind, owner, dates and the editor's status select", async () => {
    stubPlans();
    expect(await open(41)).toHaveTextContent('Onboarding · Globex');
    const meta = document.querySelector('[data-part="meta"]') as HTMLElement;
    expect(within(meta).getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/organizations/1');
    expect(meta).toHaveTextContent('Onboarding');
    expect(meta).toHaveTextContent('Alice');
    expect(Array.from(meta.querySelectorAll('.tabular-nums')).map((node) => node.textContent)).toEqual(['20 Sep 2026', '19 Nov 2026']);
    expect(meta).toHaveTextContent('20 Sep 2026 → 19 Nov 2026');
    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(status).toHaveDisplayValue('On track');
    expect(within(status).getByRole('option', { name: 'Done' })).toBeDisabled();
  });

  it('lays the milestones down the page with their dates, progress, tasks and hidden counts', async () => {
    stubPlans();
    await open(41);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Kick-off', 'Set up', 'First value', 'Hand-off']);
    expect(within(milestone('Kick-off')).getByRole('checkbox', { name: 'Kick-off done' })).toBeChecked();
    const setUp = milestone('Set up');
    expect(setUp).toHaveTextContent('4 Oct 2026');
    expect(setUp).toHaveTextContent('0/2 tasks done');
    const invite = within(setUp).getByRole('checkbox', { name: "Invite the customer's team" }).closest('li') as HTMLElement;
    expect(invite).toHaveTextContent('Carl CSM');
    expect(invite).toHaveTextContent('Medium');
    expect(invite.querySelector('.tabular-nums')).toHaveTextContent('4 Oct');
    expect(within(milestone('Kick-off')).getByRole('checkbox', { name: 'Hold the kick-off call' })).toBeChecked();
    expect(milestone('Hand-off').querySelector('[data-part="hidden"]')).toHaveTextContent("1 task you can't see");
  });

  it('ticks a task, and the plan goes on track', async () => {
    const { spy } = stubPlans();
    await open(43);
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Not started');
    await userEvent.click(screen.getByRole('checkbox', { name: "Pull the quarter's usage and outcomes" }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('On track'));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/tasks\/4311\/$/)[0].body).toEqual({ status: 'completed' });
  });

  it('marks a milestone done by hand', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Meet done' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Meet done' })).toBeChecked());
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/milestones\/432\/$/)[0].body).toEqual({ done: true });
  });

  it("shows a reader the status as a pill, the overdue milestones, and lets them tick only their own task", async () => {
    const { spy } = stubPlans();
    await open(42);
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(document.querySelector('[data-status="at_risk"]')).toHaveTextContent('At risk');
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Act done' })).toBeNull();
    expect(milestone('Act').querySelector('[data-part="overdue"]')).toHaveTextContent('Overdue');
    expect(milestone('Act').querySelector('[data-part="hidden"]')).toHaveTextContent("2 tasks you can't see");
    expect(milestone('Diagnose').querySelector('[data-part="overdue"]')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Check health and usage have recovered' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Write down the root cause' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Write down the root cause' })).toBeChecked());
    expect(requestsOf(spy, 'PATCH', /^\/plans\/42\/tasks\/4212\/$/)).toHaveLength(1);
  });

  it("changes the status from the select, and shows the server's refusal", async () => {
    const { spy } = stubPlans();
    await open(41);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'at_risk');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('At risk'));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/41\/$/)[0].body).toEqual({ status: 'at_risk' });
    vi.unstubAllGlobals();
    stubPlans({ patch: () => ({ status: 403, body: { detail: "Only the plan's owner or their managers can change it." } }) });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'on_track');
    expect(await screen.findByRole('alert')).toHaveTextContent("Only the plan's owner or their managers can change it.");
  });

  it('cancels a plan after asking; its tasks can still be ticked', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancel plan' }));
    expect(screen.getByText("Its open tasks stay on their owners' lists.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));
    expect(await screen.findByText("This plan was cancelled. Its open tasks stay on their owners' lists, and only tasks can still be ticked.")).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/$/)[0].body).toEqual({ status: 'cancelled' });
    expect(document.querySelector('[data-status="cancelled"]')).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Draft the deck' })).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Meet done' })).toBeNull();
  });

  it('deletes a plan with nothing done after asking, and offers no Delete once work is done', async () => {
    const { spy } = stubPlans();
    const first = renderPlans('/projects/41');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    first.unmount();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    expect(requestsOf(spy, 'DELETE', /^\/plans\/43\/$/)).toHaveLength(1);
  });

  it('replaces a deleted plan with the list, so Back does not land on it', async () => {
    stubPlans();
    renderPlans('/projects/43', { history: ['/projects?kind=qbr'] });
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    await userEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(where()).toBe('/projects?kind=qbr'));
  });

  it('says to cancel instead when work was done meanwhile', async () => {
    stubPlans({ remove: () => ({ status: 409, body: { code: 'PLAN_HAS_DONE_WORK', detail: 'Cancel it instead: some of its work is done.' } }) });
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Cancel it instead: some of its work is done.')).toBeInTheDocument();
    expect(where()).toBe('/projects/43');
  });

  it.each(['/projects/46', '/projects/abc'])('reads %s as a plan that does not exist or cannot be opened', async (url) => {
    stubPlans();
    renderPlans(url);
    expect(await screen.findByText('Plan not found')).toBeInTheDocument();
    expect(screen.getByText("This plan doesn't exist or you can't open its record.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All plans' })).toHaveAttribute('href', '/projects');
  });

  it('names the rule that started a plan, linked only when the reader may read it', async () => {
    stubPlans();
    const first = renderPlans('/projects/47');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Save at-risk renewals' })).toHaveAttribute('href', '/scenarios/rules/10');
    first.unmount();
    vi.unstubAllGlobals();
    stubPlans({ plans: [{ ...PIZZA_EMEA_SAVE, started_by_rule: { id: null, name: 'a rule' } }] });
    await open(47);
    expect(document.querySelector('[data-part="started-by"]')).toHaveTextContent('Started by a rule');
    expect(screen.queryByRole('link', { name: 'a rule' })).toBeNull();
  });

  it('marks a done plan read-only apart from its tasks', async () => {
    const { spy } = stubPlans();
    await open(44);
    expect(screen.getByText('This plan is done. Only its tasks can still be ticked.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Review done' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Run the quarterly success review' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Run the quarterly success review' })).not.toBeChecked());
    expect(requestsOf(spy, 'PATCH', /^\/plans\/44\/tasks\/4441\/$/)[0].body).toEqual({ status: 'pending' });
  });

  it('shows a skeleton timeline while the plan loads', async () => {
    stubPlans();
    renderPlans('/projects/41');
    expect(screen.getByText('Loading plan').closest('[role="status"]')).toBeInTheDocument();
    await screen.findByRole('heading', { level: 1 });
  });
});

describe('a Draft plan (Agents delivery 2, Decisions 12 and 13)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  const withDraft = (extra: typeof PLANS = []) => stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT, ...extra] });

  it('says it is a draft and who started it; Edit and Delete stay, the status select and Cancel go', async () => {
    withDraft();
    expect(await open(48)).toHaveTextContent('Onboarding · Pizza Hut');
    expect(document.querySelector('[data-part="draft"]')).toHaveTextContent('This plan is a draft: Start plan creates its 3 tasks, due from today.');
    expect(document.querySelector('[data-part="started-by"]')).toHaveTextContent('Started by the CS agent');
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(document.querySelector('[data-status="draft"]')).toHaveTextContent('Draft');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Cancel plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
  });

  it('says nothing about tasks under a Draft milestone: the banner says what Start plan creates', async () => {
    withDraft();
    await open(48);
    expect(document.querySelector('[data-part="draft"]')).toBeInTheDocument();
    expect(screen.queryByText('No tasks.')).toBeNull();
  });

  it('edits a Draft milestones', async () => {
    withDraft();
    await open(48);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Add milestone' })).toBeInTheDocument();
  });

  it('starts it: the tasks come back, the banner goes, and a focused status says so', async () => {
    const { spy } = withDraft();
    await open(48);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Start plan' }));
    const status = await screen.findByText('Started the plan.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(requestsOf(spy, 'POST', /^\/plans\/48\/start\/$/)).toHaveLength(1);
    expect(document.querySelector('[data-part="draft"]')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Not started');
    expect(screen.getByRole('checkbox', { name: 'Hold the kick-off call' })).toBeInTheDocument();
  });

  it('shows PLAN_OPEN in the server words with a link to the open plan', async () => {
    withDraft([{ ...GLOBEX_ONBOARDING, id: 49, record: { kind: 'organization', id: 7, name: 'Pizza Hut' } }]);
    await open(48);
    await userEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SERVER.PLAN_OPEN);
    expect(within(alert).getByRole('link', { name: 'Open that plan' })).toHaveAttribute('href', '/projects/49');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('shows NOT_DRAFT in the server words when someone started it first', async () => {
    const { plansOf } = withDraft();
    await open(48);
    plansOf().find((plan) => plan.id === 48)!.status = 'on_track';
    await userEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    // The server's sentence lands in the focused status line, and the plan is read again quietly.
    const status = await screen.findByText(SERVER.NOT_DRAFT);
    expect(status).toHaveAttribute('role', 'status');
    await waitFor(() => expect(status).toHaveFocus());
    await waitFor(() => expect(document.querySelector('[data-part="draft"]')).toBeNull());
    expect(status).toHaveTextContent(SERVER.NOT_DRAFT);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the status line in the accessibility tree without dead space before any write', async () => {
    withDraft();
    await open(48);
    // The header keeps its own (empty) region; this is the page's notice line.
    const status = screen.getAllByRole('status').find((node) => node.tagName === 'P')!;
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveClass('empty:sr-only');
    expect(status).not.toHaveClass('hidden');
    expect(status).not.toHaveClass('empty:hidden');
    expect(status).not.toHaveClass('min-h-[1.1em]');
  });

  it("tells a reader who can't edit who may start it", async () => {
    stubPlans({ plans: [...PLANS, { ...PIZZA_ONBOARDING_DRAFT, can_edit: false }] });
    await open(48);
    expect(screen.queryByRole('button', { name: 'Start plan' })).toBeNull();
    expect(screen.getByText("Only the plan's owner or their managers can start it.")).toBeInTheDocument();
  });
});

describe('a plan on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the status select and Edit, and keeps Save as template, Cancel plan and Delete in ⋯ (danger last)', async () => {
    stubPlans();
    renderPlans(`/projects/${GLOBEX_ONBOARDING.id}`);
    await screen.findByRole('heading', { level: 1, name: GLOBEX_ONBOARDING.name });
    const actions = document.querySelector('[data-part="actions"]') as HTMLElement;
    expect(within(actions).getByRole('combobox', { name: 'Status' })).toHaveClass('appearance-none');
    expect(within(actions).getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(actions).queryByRole('button', { name: 'Save as template' })).toBeNull();
    await userEvent.click(within(actions).getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Save as template');
    expect(items.slice(1).every((item) => item.classList.contains('text-danger-ink'))).toBe(true);
  });

  it('never starts a wrapped meta line with a dot: each part carries its own trailing dot', async () => {
    stubPlans();
    renderPlans(`/projects/${GLOBEX_ONBOARDING.id}`);
    await screen.findByRole('heading', { level: 1, name: GLOBEX_ONBOARDING.name });
    const meta = document.querySelector('[data-part="meta"]') as HTMLElement;
    const parts = Array.from(meta.children);
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(part.textContent!.trim().startsWith('·')).toBe(false);
    expect(parts[parts.length - 1].textContent!.trim().endsWith('·')).toBe(false);
    expect(parts[0].textContent!.trim().endsWith('·')).toBe(true);
  });

  it('pads a milestone header evenly when nothing renders below it (a Draft with no tasks yet)', async () => {
    stubPlans({ plans: [...PLANS, { ...PIZZA_ONBOARDING_DRAFT, can_edit: false }] });
    renderPlans(`/projects/${PIZZA_ONBOARDING_DRAFT.id}`);
    const milestones = await screen.findByRole('list', { name: 'Milestones' });
    const first = milestones.querySelector('[data-milestone]') as HTMLElement;
    const header = first.firstElementChild as HTMLElement;
    expect(header).toHaveClass('pb-4');
    expect(header).not.toHaveClass('pb-2');
  });

  it('draws each milestone as a card with its tasks divided inside it', async () => {
    stubPlans();
    renderPlans(`/projects/${GLOBEX_ONBOARDING.id}`);
    const milestones = await screen.findByRole('list', { name: 'Milestones' });
    const first = within(milestones).getAllByRole('listitem').find((item) => item.hasAttribute('data-milestone'))!;
    expect(first).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(milestones).not.toHaveClass('border-l');
    const tasks = within(first).queryByRole('list', { name: /^Tasks in/ });
    if (tasks) expect(tasks).toHaveClass('divide-y', 'divide-line-subtle');
  });
});
