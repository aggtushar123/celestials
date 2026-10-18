import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, sent, stubWork } from './testWork';
import { CALL_PIZZA, CARL, WORK_SETTINGS } from './testWorkFixtures';
import type { AssignAnswer, RecommendationsPayload, TaskDetail, TeamPayload, WorkSettings } from './workTypes';

const get = async (path: string, init?: RequestInit) => {
  const response = await fetch(`http://localhost/api/v1${path}`, init);
  return { status: response.status, body: await response.json() };
};
const patch = (path: string, body: unknown) => get(path, { method: 'PATCH', body: JSON.stringify(body) });

describe('stubWork (contract 2026-10-07-work-tasks-api.md)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses Blocked without a reason and an assignee who can’t open the record, and writes one event per change', async () => {
    const { spy } = stubWork();
    expect((await patch('/tasks/41/', { status: 'blocked' })).body).toEqual({ blocked_reason: ["Say what it's blocked on."] });
    expect((await patch('/tasks/41/', { assignee_id: 4 })).body).toEqual({
      code: 'ASSIGNEE_CANNOT_OPEN',
      detail: "That person can't open this organisation.",
    });
    const { status, body } = (await patch('/tasks/41/', { status: 'blocked', blocked_reason: 'Waiting on legal', priority: 'low' })) as {
      status: number;
      body: TaskDetail;
    };
    expect(status).toBe(200);
    expect(body.status).toBe('blocked');
    expect(body.events.slice(1).map((e) => [e.kind, e.data])).toEqual([
      ['edited', { field: 'priority', from: 'high', to: 'low' }],
      ['status', { from: 'pending', to: 'blocked', reason: 'Waiting on legal' }],
    ]);
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual(['/tasks/41/', '/tasks/41/', '/tasks/41/']);
    expect(sent(spy, 'PATCH', '/tasks/')[2]).toEqual({ status: 'blocked', blocked_reason: 'Waiting on legal', priority: 'low' });
  });

  it('keeps a plan task’s other fields for its editors (403)', async () => {
    stubWork();
    expect((await patch('/tasks/47/', { title: 'Renamed' })).status).toBe(403);
    expect((await patch('/tasks/47/', { status: 'in-progress' })).status).toBe(200);
  });

  it('counts Team from the same tasks, refuses a scope not offered, and drills by state', async () => {
    stubWork({ offered: ['me', 'team'], teamHidden: { team: 2 } });
    const team = (await get('/work/team/?scope=team')) as { body: TeamPayload };
    expect(team.body.people.map((p) => [p.person.name, p.open, p.overdue, p.blocked, p.oldest_overdue])).toEqual([
      ['Alice', 6, 1, 1, '2026-10-05'],
      ['Carl CSM', 1, 1, 0, '2026-10-03'],
      ['Erin Former', 1, 1, 0, '2026-10-02'],
      ['Dana CSM', 0, 0, 0, null],
    ]);
    expect(team.body.hidden).toBe(2);
    expect((await get('/work/team/?scope=company')).status).toBe(403);
    expect((await get('/work/team/?scope=nope')).status).toBe(400);
    expect(((await get('/work/tasks/?assignee=1&state=blocked')).body as { tasks: { id: number }[] }).tasks.map((t) => t.id)).toEqual([45]);
    expect((await get('/work/tasks/?state=open')).status).toBe(400);
  });

  it('serves a task, comments on it, and makes a new one on either kind of record', async () => {
    stubWork();
    expect((await get('/tasks/41/')).body).toEqual(CALL_PIZZA);
    expect((await get('/tasks/999/')).status).toBe(404);
    const comment = await get('/tasks/41/comments/', { method: 'POST', body: JSON.stringify({ body: 'Called.' }) });
    expect(comment.status).toBe(201);
    expect((comment.body as { kind: string }).kind).toBe('comment');
    expect((await get('/tasks/41/comments/', { method: 'POST', body: JSON.stringify({ body: ' ' }) })).body).toEqual({ body: ['Write a comment.'] });
    const made = await get('/accounts/9/tasks/', { method: 'POST', body: JSON.stringify({ title: 'Prep', due_date: '2026-10-14', priority: 'low' }) });
    expect(made.status).toBe(201);
    expect((made.body as { parent: unknown; assignee: { name: string } }).parent).toEqual({ kind: 'account', id: 9, name: 'Uber EMEA' });
    expect(((await get('/work/assignees/?customer=7')).body as { people: unknown[] }).people).toHaveLength(4);
    expect((await get('/work/assignees/')).status).toBe(400);
  });

  it('answers 200 with editable: [] when a hand-off takes the task outside the reader’s chain, then 404 on the next read', async () => {
    stubWork();
    const result = (await patch('/tasks/41/', { assignee_id: 2 })) as { status: number; body: TaskDetail };
    expect(result.status).toBe(200);
    expect(result.body.assignee).toEqual({ id: 2, name: 'Mona Manager', active: true });
    expect(result.body.editable).toEqual([]);
    expect((await get('/tasks/41/')).status).toBe(404);
    expect((await patch('/tasks/41/', { priority: 'low' })).status).toBe(404);
    expect((await get('/tasks/41/comments/', { method: 'POST', body: JSON.stringify({ body: 'Still there?' }) })).status).toBe(404);
  });

  it('reads every task with view_all_accounts or Leadership (viewAll), bypassing the chain; without it, the same read is 404', async () => {
    stubWork({ viewAll: true });
    expect((await get('/tasks/48/')).status).toBe(200);
    stubWork();
    expect((await get('/tasks/48/')).status).toBe(404);
  });

  it('restricts a plan task’s status to its assignee, its creator or a plan editor; a view-all reader who is neither cannot tick it', async () => {
    stubWork({ reader: CARL, viewAll: true });
    const read = (await get('/tasks/47/')) as { body: TaskDetail };
    expect(read.body.editable).toEqual([]);
    const refused = await patch('/tasks/47/', { status: 'in-progress' });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ detail: "Only the task's assignee, its creator or the plan's editors can tick it." });
  });

  it('lets a plan task’s checker resend the whole form: only the actually-changed fields count against editable', async () => {
    stubWork();
    const result = await patch('/tasks/47/', { status: 'in-progress', title: 'Kick-off call' });
    expect(result.status).toBe(200);
  });

  it('refuses a plan task’s combined change (status and another field) from a disallowed reader as NOT_EDITOR, not NOT_CHECKER', async () => {
    stubWork({ reader: CARL, viewAll: true });
    const refused = await patch('/tasks/47/', { status: 'in-progress', title: 'Renamed' });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ detail: "Only the plan's owner or their managers can change it." });
  });
});

const post = (path: string, body?: unknown) => get(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

describe('stubWork: delivery 2 (contract 2026-10-07-work-recommended-api.md)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists what the reader may decide, newest first: team by default for a manager, me for a member', async () => {
    stubWork({ recHidden: { team: 2 } });
    const team = (await get('/work/recommendations/')).body as RecommendationsPayload;
    expect([team.scope, team.items.map((r) => r.id), team.count, team.hidden]).toEqual(['team', [5, 6, 7], 3, 2]);
    const mine = (await get('/work/recommendations/?scope=me')).body as RecommendationsPayload;
    expect([mine.scope, mine.items.map((r) => r.id), mine.hidden]).toEqual(['me', [5, 6], 0]);
    expect((await get('/work/recommendations/?scope=company')).body).toEqual({ code: 'SCOPE_UNKNOWN', detail: 'Choose me or team.' });
    vi.unstubAllGlobals();
    stubWork({ reader: CARL });
    const carl = (await get('/work/recommendations/')).body as RecommendationsPayload;
    expect([carl.scope, carl.items.map((r) => r.id)]).toEqual(['me', [7]]);
  });

  it('assigns: refusals in the contract order, then one task and a decided recommendation; deciding again is a 409', async () => {
    const { tasks } = stubWork();
    expect((await post('/work/recommendations/99/assign/', { assignee_id: 3 })).status).toBe(404);
    expect((await post('/work/recommendations/5/assign/', {})).body).toEqual({ assignee_id: ['Choose who does it.'] });
    expect((await post('/work/recommendations/5/assign/', { assignee_id: 4 })).body).toEqual({
      code: 'ASSIGNEE_CANNOT_OPEN',
      detail: "That person can't open this organisation.",
    });
    const { status, body } = await post('/work/recommendations/5/assign/', { assignee_id: 1, due_date: '2026-10-06' });
    expect(status).toBe(201);
    const answer = body as AssignAnswer;
    expect(answer.recommendation).toMatchObject({ id: 5, status: 'assigned', decided_by: { id: 1, name: 'Alice' }, task_id: answer.task.id });
    expect(answer.task).toMatchObject({
      title: "Prepare Pizza Hut's renewal",
      due_date: '2026-10-06',
      priority: 'high',
      source: 'recommendation',
      assignee: { id: 1, name: 'Alice', active: true },
    });
    const task = tasks.get(answer.task.id)!;
    expect(task.description).toBe('Recommended by Revenact:\n- Renews in 9 days\n- Renewal date 16 Oct');
    expect(task.events.map((event) => event.kind)).toEqual(['created', 'recommended']);
    expect((await post('/work/recommendations/5/dismiss/', { reason: 'not_relevant' })).body).toEqual({
      code: 'ALREADY_DECIDED',
      detail: 'Alice already assigned this.',
      recommendation: answer.recommendation,
    });
    expect(((await get('/work/recommendations/')).body as RecommendationsPayload).items.map((r) => r.id)).toEqual([6, 7]);
  });

  it('refuses a reader who may not decide before reading the body (CANT_DECIDE)', async () => {
    stubWork({ reader: CARL });
    expect((await post('/work/recommendations/5/assign/', {})).body).toEqual({ code: 'CANT_DECIDE', detail: "You can't decide this recommendation." });
  });

  it('dismisses with a reason, and Other only with a note', async () => {
    const { recommendations } = stubWork();
    expect((await post('/work/recommendations/6/dismiss/', {})).body).toEqual({ reason: ['Choose already handled, not relevant, wrong person or other.'] });
    expect((await post('/work/recommendations/6/dismiss/', { reason: 'other', note: ' ' })).body).toEqual({ note: ['Say why.'] });
    const { body } = await post('/work/recommendations/6/dismiss/', { reason: 'other', note: 'Handled by phone' });
    expect((body as { recommendation: unknown }).recommendation).toMatchObject({ status: 'dismissed', dismiss_reason: 'other', dismiss_note: 'Handled by phone' });
    expect(recommendations.get(6)!.decided.status).toBe('dismissed');
  });

  it('reads and saves the settings within the contract limits; a member reads but neither saves nor runs', async () => {
    const { settings } = stubWork();
    expect(((await get('/work/settings/')).body as WorkSettings).sources.renewal_due).toEqual({ enabled: true, days: 30 });
    expect((await patch('/work/settings/', { sources: { renewal_due: { days: 121 } } })).body).toEqual({
      sources: { renewal_due: { days: ['Choose a whole number from 1 to 120.'] } },
    });
    expect((await patch('/work/settings/', { sources: { health_drop: { drop: 0 } }, dismiss_cooldown_days: -1 })).body).toEqual({
      dismiss_cooldown_days: ['Choose a whole number from 0 to 120.'],
      sources: { health_drop: { drop: ['Choose a number from 0.1 to 5.'] } },
    });
    const saved = (await patch('/work/settings/', { recommend_to: 'owner', sources: { health_drop: { enabled: false, drop: 1.25 } } })).body as WorkSettings;
    expect(saved.recommend_to).toBe('owner');
    expect(saved.sources.health_drop).toEqual({ enabled: false, drop: 1.3, window_days: 14 });
    expect(settings.recommend_to).toBe('owner');
    expect((await post('/work/recommendations/refresh/')).body).toEqual({ created: 2, updated: 5, expired: 1, unrouted: 0, notified: 2, failed: [] });
    vi.unstubAllGlobals();
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    expect((await patch('/work/settings/', { recommend_to: 'owner' })).status).toBe(403);
    expect((await post('/work/recommendations/refresh/')).status).toBe(403);
  });

  it('reads and saves the delivery 3 settings within the contract limits (2026-10-08-work-tracking-api.md)', async () => {
    const { settings } = stubWork();
    const read = (await get('/work/settings/')).body as WorkSettings;
    expect([read.timezone, read.working_days, read.escalate_after_days, read.digest_enabled, read.digest_hour, read.email_ready]).toEqual([
      'UTC',
      [0, 1, 2, 3, 4],
      2,
      true,
      8,
      true,
    ]);
    expect(
      (await patch('/work/settings/', { timezone: 'Mars/Olympus', working_days: [], escalate_after_days: 31, digest_enabled: 'yes', digest_hour: 24 })).body,
    ).toEqual({
      timezone: ['Choose a timezone from the list.'],
      working_days: ['Choose at least one working day.'],
      escalate_after_days: ['Choose a whole number from 1 to 30.'],
      digest_enabled: ['Choose on or off.'],
      digest_hour: ['Choose a whole number from 0 to 23.'],
    });
    expect((await patch('/work/settings/', { working_days: [7] })).body).toEqual({ working_days: ['Choose at least one working day.'] });
    const saved = (await patch('/work/settings/', { timezone: 'Asia/Kolkata', working_days: [4, 0, 0], escalate_after_days: 3, digest_enabled: false, digest_hour: 0 }))
      .body as WorkSettings;
    expect([saved.timezone, saved.working_days, saved.escalate_after_days, saved.digest_enabled, saved.digest_hour]).toEqual(['Asia/Kolkata', [0, 4], 3, false, 0]);
    expect(settings.working_days).toEqual([0, 4]);
    // email_ready and can_edit are read only: sending them changes nothing.
    expect(((await patch('/work/settings/', { email_ready: false, can_edit: false })).body as WorkSettings).email_ready).toBe(true);
  });
});
