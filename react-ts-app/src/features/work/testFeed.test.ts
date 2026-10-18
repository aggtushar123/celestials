import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_SKIPS } from '../campaigns/campaignText';
import { B_CAMPAIGN, bundleItem } from '../agents/testBundleFixtures';
import { stubFeed } from './testFeed';
import { BUNDLE_ITEM, DRAFT, QUESTION, REVIEW, TEAM_ITEMS, TEAM_QUESTION, TEAM_REC } from './testFeedFixtures';
import { RECOMMENDATIONS } from './testWorkFixtures';
import type { FeedCount, FeedGroup, FeedPage, FeedPayload, TodoAnswer } from './workTypes';

const call = async (path: string, init?: RequestInit) => {
  const response = (await fetch(`http://localhost/api/v1${path}`, init)) as unknown as { status: number; json: () => Promise<unknown> };
  return { status: response.status, body: await response.json() };
};
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) });

describe('stubFeed (contract §2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("answers Alice's desk in eight groups, in order, with full counts", async () => {
    stubFeed();
    const { body } = (await call('/work/feed/')) as { body: FeedPayload };
    expect(body.groups.map((g) => [g.key, g.count])).toEqual([
      ['decide', 4], ['overdue', 1], ['today', 1], ['week', 2], ['later', 1], ['no_date', 1], ['blocked', 1], ['suggested', 2],
    ]);
    expect(body.groups[0].items.map((i) => i.key)).toEqual(['rule_review:14', 'question:31', 'draft:7', 'bundle:12']);
    expect(body.groups[3].items.map((i) => i.id)).toEqual([47, 43]);
    expect(body.groups[5].items[0]).toMatchObject({ key: 'task:60', kind: 'todo', private: true, record: null, due_date: null });
    expect(body.groups[7].items.map((i) => i.key)).toEqual(['recommendation:5', 'recommendation:6']);
    expect(body).toMatchObject({ hidden: 0, failed: [] });
  });

  it('orders equal-time decide items rule_review, bundle, question, draft, then id (contract §10.1)', async () => {
    const at = '2026-10-06T12:00:00Z';
    const tied = [DRAFT, QUESTION, BUNDLE_ITEM, REVIEW, bundleItem({ ...B_CAMPAIGN, id: 11 })].map((item) => ({ ...item, at }));
    stubFeed({ decide: tied });
    const { body } = (await call('/work/feed/')) as { body: FeedPayload };
    expect(body.groups[0].items.map((i) => i.key)).toEqual(['rule_review:14', 'bundle:11', 'bundle:12', 'question:31', 'draft:7']);
  });

  it('filters by kind and refuses an unknown one', async () => {
    stubFeed();
    const { body } = (await call('/work/feed/?kind=bundle,rule_review')) as { body: FeedPayload };
    expect(body.groups.map((g) => g.count)).toEqual([2, 0, 0, 0, 0, 0, 0, 0]);
    expect(((await call('/work/feed/?kind=approval')).body as FeedPayload).groups[0].items.map((i) => i.key)).toEqual(['bundle:12']);
    expect(await call('/work/feed/?kind=nope')).toEqual({ status: 400, body: { kind: ['Choose bundle, rule_review, question, draft, task, todo, suggestion, slack_message, meeting_proposal or email_suggestion.'] } });
  });

  it('pages a group by its cursor', async () => {
    stubFeed({ pageSize: 1 });
    const first = (await call('/work/feed/')) as { body: FeedPayload };
    const week = first.body.groups[3];
    expect([week.items.length, week.next]).toEqual([1, 'week:1']);
    const page = (await call(`/work/feed/?group=week&cursor=${week.next}`)) as { body: FeedPage };
    expect(page.body.group).toMatchObject({ key: 'week', count: 2, next: null });
    expect(page.body.group.items.map((i) => i.id)).toEqual([43]);
    expect((await call('/work/feed/?group=today&cursor=week:1')).body).toEqual({ cursor: ['That list has changed. Reload Work.'] });
  });

  it('fails a source on its own, then recovers on the group read', async () => {
    stubFeed({ failKinds: { bundle: 1 } });
    const { body } = (await call('/work/feed/')) as { body: FeedPayload };
    expect(body.failed).toEqual(['bundle']);
    expect(body.groups[0].count).toBe(3);
    const retry = (await call('/work/feed/?group=decide')) as { body: FeedPage };
    expect(retry.body).toMatchObject({ failed: [], group: { count: 4 } });
  });

  it('counts the badge, and drops a decided review from it', async () => {
    stubFeed();
    expect((await call('/work/feed/count/')).body as FeedCount).toEqual({ decide: 4, overdue: 1, badge: 5, failed: [] });
    expect((await post('/rules/reviews/14/approve/', {})).status).toBe(200);
    expect(((await call('/work/feed/count/')).body as FeedCount).decide).toBe(3);
  });

  it('makes a to-do, and refuses each single fault with the contract message', async () => {
    stubFeed();
    const made = (await post('/work/todos/', { title: 'Call the florist', priority: 'medium', due_date: null })) as { status: number; body: TodoAnswer };
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ group: 'no_date', item: { kind: 'todo', title: 'Call the florist', private: true }, task: { parent: null, private: true } });
    expect((await post('/work/todos/', { title: ' ' })).body).toEqual({ title: ['Give the task a title.'] });
    expect((await post('/work/todos/', { title: 'x', assignee_id: 3 })).body).toEqual({ assignee: ['A to-do without a record can only be yours.'] });
    expect((await post('/work/todos/', { title: 'x', customer_id: 7 })).body).toEqual({ due_date: ['Choose a date.'] });
    expect((await post('/work/todos/', { title: 'x', customer_id: 99, due_date: '2026-10-09' })).body).toEqual({ record: ['Choose an organisation or account you can open.'] });
    const theirs = (await post('/work/todos/', { title: 'Call Ann', customer_id: 7, due_date: '2026-10-09', assignee_id: 3 })) as { body: TodoAnswer };
    expect(theirs.body).toMatchObject({ item: null, group: null, task: { assignee: { id: 3 } } });
  });

  it('settles two faults at once by the contract order (title, then record, then the rest)', async () => {
    stubFeed();
    expect((await post('/work/todos/', { title: ' ', customer_id: 99 })).body).toEqual({ title: ['Give the task a title.'] });
    expect((await post('/work/todos/', { title: 'x', customer_id: 99, assignee_id: 3 })).body).toEqual({ record: ['Choose an organisation or account you can open.'] });
    expect((await post('/work/todos/', { title: 'x', customer_id: 7, assignee_id: 4 })).body).toEqual({ due_date: ['Choose a date.'] });
  });

  it('attaches a record to a to-do, asking for a date first (contract §1.2)', async () => {
    stubFeed();
    expect((await call('/tasks/60/', { method: 'PATCH', body: JSON.stringify({ customer_id: 7 }) })).body).toEqual({ due_date: ['Choose a date.'] });
    const attached = await call('/tasks/60/', { method: 'PATCH', body: JSON.stringify({ customer_id: 7, due_date: '2026-10-09' }) });
    expect(attached.body).toMatchObject({ parent: { kind: 'customer', id: 7 }, private: false, due_date: '2026-10-09' });
  });

  it('applies every field of a record-attaching PATCH together', async () => {
    stubFeed();
    const saved = await call('/tasks/60/', {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: 7, due_date: '2026-10-09', title: 'Book the big room', priority: 'high', status: 'blocked', blocked_reason: 'No room free' }),
    });
    expect(saved.body).toMatchObject({ parent: { kind: 'customer', id: 7 }, due_date: '2026-10-09', title: 'Book the big room', priority: 'high', status: 'blocked', blocked_reason: 'No room free' });
    expect(((await call('/tasks/60/')).body as { title: string; parent: unknown }).parent).toMatchObject({ id: 7 });
  });

  it('applies the other fields of a PATCH that clears the date', async () => {
    stubFeed();
    const dated = await call('/tasks/60/', { method: 'PATCH', body: JSON.stringify({ due_date: '2026-10-09' }) });
    expect((dated.body as { due_date: string }).due_date).toBe('2026-10-09');
    const cleared = await call('/tasks/60/', { method: 'PATCH', body: JSON.stringify({ due_date: null, title: 'Book any room', priority: 'low' }) });
    expect(cleared.body).toMatchObject({ due_date: null, title: 'Book any room', priority: 'low' });
  });

  it('checks the assignee of a record-attaching PATCH against the new record', async () => {
    stubFeed();
    const patch = (body: unknown) => call('/tasks/60/', { method: 'PATCH', body: JSON.stringify(body) });
    expect((await patch({ assignee_id: 3 })).body).toEqual({ assignee: ['A to-do without a record can only be yours.'] });
    expect((await patch({ customer_id: 7, due_date: '2026-10-09', assignee_id: 4 })).body).toEqual({ code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." });
    expect((await patch({ account_id: 9, due_date: '2026-10-09', assignee_id: 4 })).body).toEqual({ code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this account." });
    expect((await call('/tasks/60/')).body).toMatchObject({ parent: null });
    expect((await patch({ customer_id: 7, due_date: '2026-10-09', assignee_id: 3 })).body).toMatchObject({ parent: { id: 7 }, assignee: { id: 3 } });
  });

  it('answers rule-review decisions per contract section 2.3', async () => {
    const campaign = { ...REVIEW, key: 'rule_review:16', id: 16, detail: { rule_id: 9, rule_name: 'Win-back blast', review_kind: 'campaign' as const, counts: { reach: 40, skipped: NO_SKIPS }, review: null } };
    stubFeed({ decide: [REVIEW, campaign] });
    expect((await post('/rules/reviews/16/approve/', {})).body).toEqual({ campaign_send_id: 32 });
    expect((await post('/rules/reviews/14/approve/', {})).body).toEqual({ survey_send_id: 31 });
    expect(await post('/rules/reviews/14/skip/', {})).toEqual({ status: 409, body: { detail: 'This review has already been decided.' } });
    expect(await post('/rules/reviews/99/approve/', {})).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });
});

describe('stubFeed: the Team queue (delivery 2 contract §1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers the queue in three groups with for, refuses me, and pages', async () => {
    stubFeed({ team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC], pageSize: 1 });
    const { body } = (await call('/work/feed/team/?scope=team')) as { body: { scope: string; groups: FeedGroup[] } };
    expect(body.scope).toBe('team');
    expect(body.groups.map((g) => g.key)).toEqual(['decide', 'overdue', 'suggested']);
    const decide = body.groups[0];
    expect(decide.count).toBe(2);
    expect(decide.items[0].for).toEqual({ id: 3, name: 'Carl CSM' });
    const next = (await call(`/work/feed/team/?scope=team&group=decide&cursor=${decide.next}`)) as { body: { group: FeedGroup } };
    expect(next.body.group.items).toHaveLength(1);
    expect(await call('/work/feed/team/?scope=me')).toEqual({ status: 400, body: { code: 'SCOPE_UNKNOWN', detail: 'Choose team or company.' } });
  });

  it('refuses a scope the reader is not offered, and drops what was decided', async () => {
    stubFeed({ offered: ['me', 'team'], team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    expect(await call('/work/feed/team/?scope=company')).toEqual({ status: 403, body: { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." } });
    await post(`/questions/${TEAM_QUESTION.id}/answer/`, { body: 'Yes.' });
    const { body } = (await call('/work/feed/team/?scope=team')) as { body: { groups: FeedGroup[] } };
    expect(body.groups[0].items.map((i) => i.key)).toEqual(['bundle:18']);
  });

  it('answers a question once, and refuses a blank answer', async () => {
    stubFeed();
    expect(await post(`/questions/${QUESTION.id}/answer/`, { body: '  ' })).toEqual({ status: 400, body: { detail: 'Say something.' } });
    expect((await post(`/questions/${QUESTION.id}/answer/`, { body: 'Legal.' })).status).toBe(200);
    expect(((await call('/work/feed/')).body as FeedPayload).groups[0].items.map((i) => i.key)).not.toContain('question:31');
  });

  it('no longer answers /work/today/', async () => {
    stubFeed();
    expect((await call('/work/today/')).status).toBe(404);
  });
});

describe('stubFeed: queues and Team kinds (agent bundles D1 contract §10)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the queues the reader is offered, with counts, and fails on request', async () => {
    stubFeed({ team: { team: TEAM_ITEMS, company: [bundleItem(B_CAMPAIGN, true)] }, failQueues: 1 });
    expect((await call('/work/queues/')).status).toBe(500);
    expect((await call('/work/queues/')).body).toEqual({
      queues: [
        { key: 'mine', label: 'Mine', count: 5 },
        { key: 'team', label: 'My team', count: 3 },
        { key: 'company', label: 'Rest of company', count: 1 },
        { key: 'history', label: 'History', count: null },
      ],
      failed: [],
    });
    stubFeed({ offered: ['me'] });
    expect(((await call('/work/queues/')).body as { queues: { key: string }[] }).queues.map((q) => q.key)).toEqual(['mine', 'history']);
  });

  it('filters the Team queue by kind, reads approval as bundle, and refuses todo and draft', async () => {
    stubFeed({ team: { team: TEAM_ITEMS } });
    const keys = async (kind: string) => ((await call(`/work/feed/team/?scope=team&kind=${kind}`)).body as { groups: FeedGroup[] }).groups.flatMap((g) => g.items.map((i) => i.key));
    expect(await keys('bundle')).toEqual(['bundle:18']);
    expect(await keys('approval')).toEqual(['bundle:18']);
    expect(await keys('question,task')).toEqual(['question:72', 'task:46']);
    const refused = { status: 400, body: { kind: ['Choose bundle, rule_review, question, task or suggestion.'] } };
    expect(await call('/work/feed/team/?scope=team&kind=todo')).toEqual(refused);
    expect(await call('/work/feed/team/?scope=team&kind=draft')).toEqual(refused);
  });
});
