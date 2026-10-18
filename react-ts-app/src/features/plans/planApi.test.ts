import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { requestsOf } from '../surveys/testSurveys';
import {
  addMilestone,
  addTask,
  createTemplate,
  deleteMilestone,
  deletePlan,
  deleteTask,
  fetchPlan,
  fetchPlanRecord,
  fetchPlans,
  fetchRecordPlans,
  fetchTemplate,
  fetchTemplates,
  reorderMilestones,
  saveAsTemplate,
  searchPlanRecords,
  startDraftPlan,
  startPlan,
  updateMilestone,
  updatePlan,
  updateTask,
  updateTemplate,
} from './planApi';
import { FINISHED_PLAN, GLOBEX_ONBOARDING, LAST_MILESTONE, NOT_EDITOR, PIZZA_ONBOARDING_DRAFT, PLANS, SERVER, stubPlans, TODAY } from './testPlans';

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err instanceof ApiError ? { status: err.status, body: err.body } : err;
  }
  throw new Error('expected a refusal');
};
const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

describe('the plans API on the contract stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists open plans newest first, with every status counted, never an unreadable one', async () => {
    stubPlans();
    const page = await fetchPlans('status=open');
    expect(ids(page.results)).toEqual([47, 43, 42, 41]);
    expect(page.counts).toEqual({ draft: 0, not_started: 2, on_track: 1, at_risk: 1, done: 1, cancelled: 1 });
    expect(page.next).toBeNull();
    expect(page.results.find((row) => row.id === 42)).toMatchObject({
      record: { kind: 'account', id: 14, name: 'Initech APAC' }, owner: { id: 5, name: 'Dana CSM' }, status: 'at_risk',
      milestones_done: 1, milestones_total: 3, tasks_done: 1, tasks_total: 3, next_due: '2026-09-15', is_overdue: true, can_edit: false,
    });
  });

  it('filters by kind, owner, my tasks, search, record and status', async () => {
    stubPlans();
    expect(ids((await fetchPlans('status=open&kind=save')).results)).toEqual([47, 42]);
    expect((await fetchPlans('status=open&kind=save')).counts).toEqual({ draft: 0, not_started: 1, on_track: 0, at_risk: 1, done: 0, cancelled: 0 });
    expect(ids((await fetchPlans('owner=me&status=open')).results)).toEqual([43, 41]);
    expect(ids((await fetchPlans('mine=tasks&status=open')).results)).toEqual([42, 41]);
    expect(ids((await fetchPlans('q=pizza&status=open')).results)).toEqual([47, 43]);
    expect(ids((await fetchPlans('customer=1&status=open')).results)).toEqual([41]);
    expect(ids((await fetchPlans('account=12&status=open')).results)).toEqual([47]);
    expect(ids((await fetchPlans('status=done')).results)).toEqual([44]);
    expect(ids((await fetchPlans('status=open&status=done&status=cancelled')).results)).toEqual([47, 45, 44, 43, 42, 41]);
  });

  it('pages under an opaque cursor', async () => {
    const { spy } = stubPlans({ pageSize: 2 });
    const first = await fetchPlans('status=open');
    expect(ids(first.results)).toEqual([47, 43]);
    const second = await fetchPlans(`status=open&cursor=${encodeURIComponent(first.next!)}`);
    expect(ids(second.results)).toEqual([42, 41]);
    expect(second.next).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/plans\/$/)[1].query.get('cursor')).toBe(first.next);
  });

  it('reads one plan: milestones in order, visible tasks, hidden counts, overdue marks; unreadable is a 404', async () => {
    stubPlans();
    const plan = await fetchPlan(42);
    expect(plan.milestones.map((m) => [m.name, m.is_overdue, m.hidden_tasks, m.tasks.length])).toEqual([
      ['Diagnose', false, 0, 2],
      ['Act', true, 2, 0],
      ['Confirm', true, 0, 1],
    ]);
    expect(plan).toMatchObject({ hidden_tasks: 2, can_edit: false, can_delete: false, status_set_by: 'system', template: { id: 3, name: 'Save plan' } });
    expect(plan.milestones[0].tasks.map((task) => [task.title, task.can_check])).toEqual([
      ['Talk to the champion about the risk', false],
      ['Write down the root cause', true],
    ]);
    expect(await fetchPlan(47)).toMatchObject({ started_by: null, started_by_rule: { id: 10, name: 'Save at-risk renewals' } });
    expect(await refusal(fetchPlan(46))).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });

  it('starts a plan from a template as it is, owned by me, record-owner tasks to the record owner', async () => {
    stubPlans();
    const plan = await startPlan({ template: 1, customer: 2 });
    expect(plan).toMatchObject({ id: 500, name: 'Onboarding · Initech', status: 'not_started', owner: { id: 1 }, start_date: '2026-10-04', target_date: '2026-12-03' });
    expect(plan.milestones.map((m) => m.due_date)).toEqual(['2026-10-04', '2026-10-18', '2026-11-03', '2026-12-03']);
    expect(plan.milestones[3].tasks.map((task) => [task.title, task.assignee?.name])).toEqual([
      ['Run the onboarding review', 'Carl CSM'],
      ['Hand over to the account owner', 'Alice'],
    ]);
  });

  it('starts a plan from an edited copy', async () => {
    const { spy } = stubPlans();
    const body = {
      template: 3, account: 13, name: 'Save Globex NA', owner: 1, start_date: '2026-10-05',
      milestones: [{ name: 'Diagnose', due_date: '2026-10-05', tasks: [{ title: 'Call the champion', priority: 'high' as const, due_date: '2026-10-06', assignee: 1 }] }],
    };
    const plan = await startPlan(body);
    expect(plan).toMatchObject({ id: 500, name: 'Save Globex NA', target_date: '2026-10-05', milestones: [{ name: 'Diagnose', tasks: [{ title: 'Call the champion' }] }] });
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)[0].body).toEqual(body);
  });

  it('refuses a second open plan from one template, and people who cannot open the record', async () => {
    stubPlans();
    expect(await refusal(startPlan({ template: 1, customer: 1 }))).toEqual({
      status: 409,
      body: { code: 'PLAN_OPEN', plan_id: 41, detail: 'This record already has an open plan from this template.' },
    });
    expect(await refusal(startPlan({ template: 2, customer: 1, owner: 5 }))).toEqual({ status: 400, body: { owner: ["They can't open this record."] } });
    const tasks = [
      { title: 'x', priority: 'low' as const, due_date: '2026-10-04', assignee: 1 },
      { title: 'y', priority: 'low' as const, due_date: '2026-10-04', assignee: 5 },
    ];
    expect(await refusal(startPlan({ template: 2, customer: 1, milestones: [{ name: 'A', due_date: '2026-10-04', tasks }] }))).toEqual({
      status: 400,
      body: { milestones: [{ tasks: [{}, { assignee: ["They can't open this record."] }] }] },
    });
  });

  it('moves a plan on track at its first ticked task, and completes a milestone with its last', async () => {
    stubPlans();
    let plan = await updateTask(43, 4311, { status: 'completed' });
    expect(plan.status).toBe('on_track');
    expect(plan.milestones[0].done_at).toBeNull();
    plan = await updateTask(43, 4312, { status: 'completed' });
    expect(plan.milestones[0].done_at).not.toBeNull();
    plan = await updateTask(43, 4312, { status: 'pending' });
    expect(plan.milestones[0].done_at).toBeNull();
  });

  it('marks milestones done by hand, refuses Done early, and finishes the plan with the last one', async () => {
    stubPlans();
    await updateMilestone(43, 431, { done: true });
    expect(await refusal(updatePlan(43, { status: 'done' }))).toEqual({ status: 400, body: { status: ['Mark every milestone done first.'] } });
    await updateMilestone(43, 432, { done: true });
    const plan = await updateMilestone(43, 433, { done: true });
    expect(plan).toMatchObject({ status: 'done', milestones_done: 3 });
    expect(plan.done_at).not.toBeNull();
  });

  it("edits milestones and tasks for editors; a reader may tick only their own task", async () => {
    stubPlans();
    let plan = await addMilestone(43, { name: 'Wrap up', due_date: '2026-10-30' });
    const wrap = plan.milestones[3].id;
    expect(plan.target_date).toBe('2026-10-30');
    plan = await updateMilestone(43, 431, { name: 'Prepare the review' });
    plan = await reorderMilestones(43, [433, 431, 432, wrap]);
    expect(plan.milestones.map((m) => m.name)).toEqual(['Follow up', 'Prepare the review', 'Meet', 'Wrap up']);
    plan = await deleteMilestone(43, wrap);
    expect(plan.milestones).toHaveLength(3);
    plan = await addTask(43, { milestone: 432, title: 'Book the room', priority: 'low', due_date: '2026-10-15', assignee: 4 });
    const room = plan.milestones.find((m) => m.id === 432)!.tasks.find((task) => task.title === 'Book the room')!;
    plan = await updateTask(43, room.id, { milestone: 433 });
    expect(plan.milestones.find((m) => m.id === 433)!.tasks.map((task) => task.title)).toContain('Book the room');
    plan = await deleteTask(43, room.id);
    expect(plan.milestones.flatMap((m) => m.tasks).map((task) => task.title)).not.toContain('Book the room');
    expect(await refusal(updatePlan(42, { status: 'on_track' }))).toEqual({ status: 403, body: { detail: NOT_EDITOR } });
    expect((await updateTask(42, 4212, { status: 'completed' })).milestones[0].tasks[1].status).toBe('completed');
    expect(await refusal(updateTask(42, 4231, { status: 'completed' }))).toEqual({ status: 403, body: { detail: NOT_EDITOR } });
    expect(await refusal(addTask(41, { milestone: 412, title: 'Ask Dana', priority: 'low', due_date: '2026-10-04', assignee: 5 }))).toEqual({
      status: 400,
      body: { assignee: ["They can't open this record."] },
    });
    expect(await refusal(updateTask(41, 4142, { status: 'completed' }))).toMatchObject({ status: 404 });
    expect(await refusal(addMilestone(44, { name: 'Late', due_date: '2026-10-30' }))).toEqual({ status: 400, body: { non_field_errors: [FINISHED_PLAN] } });
    await deleteMilestone(43, 431);
    await deleteMilestone(43, 432);
    expect(await refusal(deleteMilestone(43, 433))).toEqual({ status: 400, body: { non_field_errors: [LAST_MILESTONE] } });
  });

  it("refuses as the server does, in the server's words", async () => {
    stubPlans();
    const said = (field: string, words: string) => ({ status: 400, body: { [field]: [words] } });
    expect(await refusal(deleteMilestone(41, 411))).toEqual(said('non_field_errors', SERVER.MILESTONE_HAS_DONE_WORK));
    expect(await refusal(updatePlan(44, { name: 'Renamed' }))).toEqual(said('non_field_errors', SERVER.PLAN_FINISHED));
    expect(await refusal(updatePlan(45, { status: 'on_track' }))).toEqual(said('non_field_errors', SERVER.PLAN_FINISHED));
    expect(await refusal(updatePlan(43, { name: ' ' }))).toEqual(said('name', SERVER.CHOOSE_NAME));
    expect(await refusal(addMilestone(43, { name: 'Early', due_date: '2026-10-05' }))).toEqual(said('due_date', SERVER.DATE_RANGE));
    expect(await refusal(updateMilestone(43, 431, { due_date: '2027-10-07' }))).toEqual(said('due_date', SERVER.DATE_RANGE));
    expect(await refusal(addTask(43, { milestone: 432, title: 'Late', priority: 'low', due_date: '2027-10-07', assignee: 1 }))).toEqual(said('due_date', SERVER.DATE_RANGE));
    expect(await refusal(addTask(43, { milestone: 999, title: 'Lost', priority: 'low', due_date: '2026-10-07', assignee: 1 }))).toEqual(said('milestone', SERVER.CHOOSE_MILESTONE));
    expect(await refusal(addTask(43, { milestone: 432, title: ' ', priority: 'low', due_date: '2026-10-07', assignee: 1 }))).toEqual(said('title', SERVER.NO_TITLE));
    expect(await refusal(reorderMilestones(43, [431]))).toEqual(said('order', SERVER.REORDER));
    for (let n = 3; n < 12; n += 1) await addMilestone(43, { name: `Step ${n}`, due_date: '2026-10-30' });
    expect(await refusal(addMilestone(43, { name: 'Thirteenth', due_date: '2026-10-30' }))).toEqual(said('non_field_errors', SERVER.TOO_MANY_MILESTONES));
    for (let n = 5; n < 50; n += 1) await addTask(43, { milestone: 432, title: `Task ${n}`, priority: 'low', due_date: '2026-10-07', assignee: 1 });
    expect(await refusal(addTask(43, { milestone: 432, title: 'Fifty-first', priority: 'low', due_date: '2026-10-07', assignee: 1 }))).toEqual(
      said('non_field_errors', SERVER.TOO_MANY_TASKS),
    );
  });

  it('deletes a plan only while none of its work is done', async () => {
    stubPlans();
    expect(await refusal(deletePlan(41))).toEqual({ status: 409, body: { code: 'PLAN_HAS_DONE_WORK', detail: 'Cancel it instead: some of its work is done.' } });
    expect(await deletePlan(43)).toBeNull();
    expect(await refusal(fetchPlan(43))).toMatchObject({ status: 404 });
  });

  it('lists templates by section, creates one, and refuses edits that are not the owner\'s', async () => {
    const { spy } = stubPlans();
    const lists = await fetchTemplates();
    expect(lists.builtin.map((t) => t.name)).toEqual(['Onboarding', 'Success plan', 'Save plan', 'QBR']);
    expect(lists.builtin[0]).toMatchObject({ milestone_count: 4, task_count: 7, length_days: 60, is_builtin: true, owner: null });
    expect(lists.mine.map((t) => t.name)).toEqual(['Renewal prep']);
    expect(lists.shared.map((t) => t.name)).toEqual(["Carl's expansion play"]);
    const body = { name: 'Escalation', kind: 'save' as const, description: '', sharing: 'private' as const, shared_with: [], milestones: [{ name: 'Call', offset_days: 0, tasks: [] }] };
    expect(await createTemplate(body)).toMatchObject({ id: 900, name: 'Escalation', is_owner: true, milestone_count: 1, task_count: 0, length_days: 0 });
    expect(requestsOf(spy, 'POST', /^\/plans\/templates\/$/)[0].body).toEqual(body);
    expect(await refusal(updateTemplate(1, { name: 'Mine now' }))).toEqual({ status: 403, body: { detail: "Built-in templates can't be changed." } });
    expect(await refusal(updateTemplate(11, { name: 'Mine now' }))).toEqual({ status: 403, body: { detail: "Only the template's owner can change it." } });
    expect(await refusal(fetchTemplate(12))).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });

  it("saves a plan as a template: offsets from its start, the record's owner by role", async () => {
    stubPlans();
    const made = await saveAsTemplate(41, { name: 'Our onboarding' });
    expect(made).toMatchObject({ id: 900, name: 'Our onboarding', is_owner: true, sharing: 'private' });
    expect(made.milestones.map((m) => m.offset_days)).toEqual([0, 14, 30, 60]);
    expect(made.milestones[1].tasks.map((task) => [task.title, task.offset_days, task.assignee_role])).toEqual([
      ['Connect data sources', 10, 'record_owner'],
      ["Invite the customer's team", 14, 'plan_owner'],
    ]);
    expect(made.milestones[3].tasks.map((task) => task.title)).toEqual(['Run the onboarding review']);
  });

  it("reads a record's plans open first, the record's owner, and searches both kinds", async () => {
    stubPlans();
    expect(ids((await fetchRecordPlans({ kind: 'organization', id: 2 })).results)).toEqual([45]);
    expect(ids((await fetchRecordPlans({ kind: 'account', id: 13 })).results)).toEqual([44]);
    expect(await fetchPlanRecord('account', 14)).toEqual({ kind: 'account', id: 14, name: 'Initech APAC', owner: { id: 5, name: 'Dana CSM' } });
    expect(await searchPlanRecords('initech')).toEqual([
      { kind: 'organization', id: 2, name: 'Initech' },
      { kind: 'account', id: 14, name: 'Initech APAC' },
    ]);
  });
});

describe('Start plan on a Draft (Agents delivery 2 contract, "Plans")', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists a Draft only when asked, never as open, with its pending tasks and agent', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    expect(ids((await fetchPlans('status=open')).results)).not.toContain(48);
    const drafts = await fetchPlans('status=draft');
    expect(drafts.results).toEqual([expect.objectContaining({ id: 48, status: 'draft', pending_tasks: 3, started_by_agent: 'cs', tasks_total: 0 })]);
    expect(drafts.counts.draft).toBe(1);
  });

  it('starts a Draft: its tasks come back due from today and it is Not started', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    const plan = await startDraftPlan(48);
    expect(plan).toMatchObject({ status: 'not_started', start_date: TODAY, pending_tasks: 0, tasks_total: 3 });
    expect(plan.milestones[0].tasks.map((task) => task.due_date)).toEqual([TODAY, '2026-10-07']);
  });

  it('refuses NOT_DRAFT and PLAN_OPEN in the server words', async () => {
    const clash = { ...GLOBEX_ONBOARDING, id: 49, record: { kind: 'organization' as const, id: 7, name: 'Pizza Hut' } };
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT, clash] });
    await expect(startDraftPlan(41)).rejects.toMatchObject({ status: 409, body: { code: 'NOT_DRAFT', detail: SERVER.NOT_DRAFT } });
    await expect(startDraftPlan(48)).rejects.toMatchObject({ status: 409, body: { code: 'PLAN_OPEN', plan_id: 49, detail: SERVER.PLAN_OPEN } });
  });
});
