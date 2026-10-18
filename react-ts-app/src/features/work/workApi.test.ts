import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  answerQuestion,
  assignRecommendation,
  createTodo,
  createWorkTask,
  dismissRecommendation,
  fetchAssignees,
  fetchDrill,
  fetchFeed,
  fetchFeedCount,
  fetchFeedGroup,
  fetchQueues,
  fetchRecommendations,
  fetchTask,
  fetchTeam,
  fetchTeamQueue,
  fetchTeamQueueGroup,
  fetchWorkSettings,
  isMissing,
  patchTask,
  patchWorkSettings,
  postComment,
  readRefusal,
  refreshRecommendations,
} from './workApi';

const respond = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function spyFetch() {
  const spy = vi.fn(async () => respond(200, {}));
  vi.stubGlobal('fetch', spy);
  return () =>
    spy.mock.calls.map((call) => {
      const [input, init] = call as unknown as [string, RequestInit | undefined];
      const url = new URL(input);
      return {
        path: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
    });
}

describe('workApi: the delivery 1 routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads Team, the drill-down, the picker and a task', async () => {
    const calls = spyFetch();
    await fetchTeam('team');
    await fetchDrill(3);
    await fetchDrill(3, 'blocked');
    await fetchAssignees({ kind: 'customer', id: 7 });
    await fetchAssignees({ kind: 'account', id: 9 });
    await fetchTask(41);
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /work/team/?scope=team',
      'GET /work/tasks/?assignee=3&state=open',
      'GET /work/tasks/?assignee=3&state=blocked',
      'GET /work/assignees/?customer=7',
      'GET /work/assignees/?account=9',
      'GET /tasks/41/',
    ]);
  });

  it('writes a change, a comment and a new task on either kind of record', async () => {
    const calls = spyFetch();
    await patchTask(41, { status: 'blocked', blocked_reason: 'Waiting on legal' });
    await postComment(41, 'Called.');
    await createWorkTask({ kind: 'customer', id: 7 }, { title: 'Prep the QBR', due_date: '2026-10-14', priority: 'medium', assignee_id: 3 });
    await createWorkTask({ kind: 'account', id: 9 }, { title: 'Call', due_date: '2026-10-14', priority: 'low' });
    expect(calls()).toEqual([
      { path: '/tasks/41/', method: 'PATCH', body: { status: 'blocked', blocked_reason: 'Waiting on legal' } },
      { path: '/tasks/41/comments/', method: 'POST', body: { body: 'Called.' } },
      { path: '/customers/7/tasks/', method: 'POST', body: { title: 'Prep the QBR', due_date: '2026-10-14', priority: 'medium', assignee_id: 3 } },
      { path: '/accounts/9/tasks/', method: 'POST', body: { title: 'Call', due_date: '2026-10-14', priority: 'low' } },
    ]);
  });
});

describe('workApi: reading a refusal', () => {
  const refusal = (status: number, body: unknown) => new ApiError(status, body, 'message');

  it('puts ASSIGNEE_CANNOT_OPEN under the assignee, with the server’s sentence', () => {
    expect(readRefusal(refusal(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." }), 'x')).toEqual({
      field: { assignee_id: "That person can't open this organisation." },
      form: null,
    });
  });

  it('puts field errors under their fields, and the rest on the form', () => {
    expect(readRefusal(refusal(400, { blocked_reason: ["Say what it's blocked on."] }), 'x')).toEqual({
      field: { blocked_reason: "Say what it's blocked on." },
      form: null,
    });
    expect(readRefusal(refusal(400, { body: ['Write a comment.'] }), 'x').field.body).toBe('Write a comment.');
    expect(readRefusal(refusal(400, { non_field_errors: ['This plan is finished; only its tasks can change.'] }), 'x')).toEqual({
      field: {},
      form: 'This plan is finished; only its tasks can change.',
    });
    expect(readRefusal(refusal(403, { detail: "Only the plan's owner or their managers can change it." }), 'x').form).toBe(
      "Only the plan's owner or their managers can change it.",
    );
    expect(readRefusal(new Error('offline'), 'Could not save that change.')).toEqual({ field: {}, form: 'Could not save that change.' });
  });

  it('knows a missing task', () => {
    expect(isMissing(refusal(404, { detail: 'No such task.' }))).toBe(true);
    expect(isMissing(refusal(500, {}))).toBe(false);
    expect(isMissing(new Error('x'))).toBe(false);
  });

  it('puts a Work setting’s refusal under its field (delivery 3)', () => {
    expect(
      readRefusal(refusal(400, { timezone: ['Choose a timezone from the list.'], digest_hour: ['Choose a whole number from 0 to 23.'] }), 'x'),
    ).toEqual({ field: { timezone: 'Choose a timezone from the list.', digest_hour: 'Choose a whole number from 0 to 23.' }, form: null });
    expect(readRefusal(refusal(400, { working_days: ['Choose at least one working day.'] }), 'x').field.working_days).toBe('Choose at least one working day.');
    expect(readRefusal(refusal(400, { escalate_after_days: ['Choose a whole number from 1 to 30.'] }), 'x').field.escalate_after_days).toBe(
      'Choose a whole number from 1 to 30.',
    );
    expect(readRefusal(refusal(400, { digest_enabled: ['Choose on or off.'] }), 'x').field.digest_enabled).toBe('Choose on or off.');
  });
});

describe('workApi: the delivery 2 routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads and decides recommendations, runs the recommender, and reads and writes the settings', async () => {
    const calls = spyFetch();
    await fetchRecommendations();
    await fetchRecommendations('me');
    await assignRecommendation(5, { assignee_id: 3, due_date: '2026-10-09', title: 'Prep' });
    await dismissRecommendation(6, { reason: 'other', note: 'Handled by phone' });
    await refreshRecommendations();
    await fetchWorkSettings();
    await patchWorkSettings({ sources: { renewal_due: { days: 45 } } });
    expect(calls()).toEqual([
      { method: 'GET', path: '/work/recommendations/', body: undefined },
      { method: 'GET', path: '/work/recommendations/?scope=me', body: undefined },
      { method: 'POST', path: '/work/recommendations/5/assign/', body: { assignee_id: 3, due_date: '2026-10-09', title: 'Prep' } },
      { method: 'POST', path: '/work/recommendations/6/dismiss/', body: { reason: 'other', note: 'Handled by phone' } },
      { method: 'POST', path: '/work/recommendations/refresh/', body: undefined },
      { method: 'GET', path: '/work/settings/', body: undefined },
      { method: 'PATCH', path: '/work/settings/', body: { sources: { renewal_due: { days: 45 } } } },
    ]);
  });

  it('reads a dismiss refusal under its field', () => {
    expect(readRefusal(new ApiError(400, { note: ['Say why.'] }, 'x'), 'fallback')).toEqual({ field: { note: 'Say why.' }, form: null });
    expect(readRefusal(new ApiError(400, { reason: ['Choose already handled, not relevant, wrong person or other.'] }, 'x'), 'fallback').field.reason).toBe(
      'Choose already handled, not relevant, wrong person or other.',
    );
  });
});

describe('the feed routes (work in one place, contract §2)', () => {
  const seen: { url: string; method: string; body: unknown }[] = [];
  beforeEach(() => {
    seen.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        seen.push({ url: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the whole feed, with or without kinds', async () => {
    await fetchFeed(null);
    await fetchFeed(['bundle', 'rule_review']);
    expect(seen.map((call) => call.url)).toEqual(['/work/feed/', '/work/feed/?kind=bundle%2Crule_review']);
  });

  it('pages one group with its cursor, and retries one group without one', async () => {
    await fetchFeedGroup('week', null, 'week:50');
    await fetchFeedGroup('decide', ['bundle', 'rule_review']);
    expect(seen.map((call) => call.url)).toEqual(['/work/feed/?group=week&cursor=week%3A50', '/work/feed/?group=decide&kind=bundle%2Crule_review']);
  });

  it('reads the count and posts a to-do', async () => {
    await fetchFeedCount();
    await createTodo({ title: 'Book the QBR room', priority: 'medium', due_date: null });
    expect(seen).toEqual([
      { url: '/work/feed/count/', method: 'GET', body: undefined },
      { url: '/work/todos/', method: 'POST', body: { title: 'Book the QBR room', priority: 'medium', due_date: null } },
    ]);
  });

  it('reads the queues, and a Team queue with its kind filter', async () => {
    await fetchQueues();
    await fetchTeamQueue('team', null);
    await fetchTeamQueue('company', ['bundle', 'question']);
    await fetchTeamQueueGroup('company', 'overdue', ['task'], 'abc');
    await fetchTeamQueueGroup('team', 'decide', null);
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /work/queues/',
      'GET /work/feed/team/?scope=team',
      'GET /work/feed/team/?scope=company&kind=bundle%2Cquestion',
      'GET /work/feed/team/?scope=company&group=overdue&cursor=abc&kind=task',
      'GET /work/feed/team/?scope=team&group=decide',
    ]);
  });

  it('answers a question', async () => {
    await answerQuestion(12, 'Legal signs off.');
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /questions/12/answer/']);
    expect(seen[0].body).toEqual({ body: 'Legal signs off.' });
  });

  it('reads the to-do refusals under their fields', () => {
    expect(readRefusal(new ApiError(400, { record: ['Choose an organisation or account you can open.'] }, ''), 'x').field.record).toBe('Choose an organisation or account you can open.');
    expect(readRefusal(new ApiError(400, { assignee: ['A to-do without a record can only be yours.'] }, ''), 'x').field.assignee).toBe('A to-do without a record can only be yours.');
    expect(readRefusal(new ApiError(400, { customer_id: ['Choose an organisation or account you can open.'] }, ''), 'x').field.customer_id).toBe('Choose an organisation or account you can open.');
  });

  it('reads a department or the Unassigned queue as a team scope (agent bundles D2 contract §4.6)', async () => {
    await fetchTeamQueue('department:cs', null);
    await fetchTeamQueue('unassigned', ['bundle']);
    await fetchTeamQueueGroup('department:engineering', 'decide', null, 'decide:50');
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /work/feed/team/?scope=department%3Acs',
      'GET /work/feed/team/?scope=unassigned&kind=bundle',
      'GET /work/feed/team/?scope=department%3Aengineering&group=decide&cursor=decide%3A50',
    ]);
  });
});
