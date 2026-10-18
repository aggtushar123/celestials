// Test-only: the feed routes of the work-in-one-place contract
// (2026-10-12-work-one-place-api.md), in front of stubWork. Tasks, to-dos
// and recommendations live in stubWork's own maps, so a Done, an assign or
// a dismiss made through stubWork shows in the very next feed read; the
// decide items live here. Agent-action and rule-review decisions are
// answered here unless `decisions: 'pass'` hands them on (to stubAgents).
import { vi } from 'vitest';
import { ALICE, NOW, RECORDS, TODAY, ASSIGNEES, WORK_TASKS, refOf, taskDetail, taskEvent } from './testWorkFixtures';
import { DECIDE_ITEMS, TODOS, suggestionItem, taskItem } from './testFeedFixtures';
import { stubWork, type WorkStub } from './testWork';
import type { QueueRow } from '../agents/bundleTypes';
import type { ReviewFeedItem, FeedGroup, FeedGroupKey, FeedItem, FeedKind, TaskDetail, TaskGroupKey, TaskPerson, TeamScope } from './workTypes';
import { FEED_KINDS } from './workTypes';
import type { Meeting } from '../calendar/calendarApi';

export interface FeedStub extends WorkStub {
  /** Bundles, reviews, questions and drafts. Default DECIDE_ITEMS. */
  decide?: FeedItem[];
  /** To-dos (tasks with no record), added to `tasks`. Default TODOS. */
  todos?: TaskDetail[];
  /** The feed's `hidden`. Default 0. */
  feedHidden?: number;
  /** How many reads fail each source first (task and todo fail together). */
  failKinds?: Partial<Record<FeedKind, number>>;
  /** How many whole-feed reads answer 500 first. */
  failFeed?: number;
  /** Items per group page. Default 50. */
  pageSize?: number;
  /** 'pass' hands agent-action and review decisions to `passThrough`. */
  decisions?: 'stub' | 'pass';
  /** The next agent-action or review decision answers this instead (a 409 also takes the item off the desk). */
  refuseNextAction?: { status: number; body: unknown };
  /** The next POST /work/todos/ answers this instead. */
  refuseNextTodo?: { status: number; body: unknown };
  /** The Team queue's items per scope, each with `for` (delivery 2). Default none. */
  team?: Partial<Record<TeamScope, FeedItem[]>>;
  /** The queue's `hidden`. Default 0. */
  queueHidden?: number;
  /** How many queue reads answer 500 first. */
  failQueue?: number;
  /** GET /work/queues/'s rows. Default: Mine (the badge), My team and Rest of company per `offered`, History. */
  queues?: QueueRow[];
  /** Queue keys whose count failed: `count: null`, and the key in `failed` (contract §10.3). */
  failQueueKeys?: string[];
  /** How many queue-list reads answer 500 first. */
  failQueues?: number;
  /** GET /calendar/meetings/'s meetings (Google Calendar). Default: not stubbed, a 404. */
  meetings?: Meeting[];
  /** POST /agents/ops/run/ answers this instead of a card. */
  runRefusal?: { status: number; body: unknown };
}

// Every kind the real feed knows: a page that asks for one this stub keeps no
// rows of (meeting proposals, email suggestions) gets an empty group, not a 400.
const KINDS: readonly FeedKind[] = FEED_KINDS;
const GROUPS: readonly FeedGroupKey[] = ['decide', 'overdue', 'today', 'week', 'later', 'no_date', 'blocked', 'suggested'];
const DECIDE: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft'];
/** Contract §10.1: at equal times a rule review comes before a bundle. */
const DECIDE_TIE: readonly FeedKind[] = ['rule_review', 'bundle', 'question', 'draft'];
const TEAM_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'task', 'suggestion'];
/** `approval` is read as `bundle` (contract D9). */
const asKinds = (raw: string) => raw.split(',').map((kind) => (kind === 'approval' ? 'bundle' : kind)) as FeedKind[];
const SUGGESTED = ['renewal_due', 'health_drop', 'urgent_tickets', 'anomaly'];
const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const RECORD = { record: ['Choose an organisation or account you can open.'] };

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function taskGroup(task: TaskDetail): TaskGroupKey {
  if (task.status === 'blocked') return 'blocked';
  if (task.due_date === null) return 'no_date';
  if (task.due_date < TODAY) return 'overdue';
  if (task.due_date === TODAY) return 'today';
  return task.due_date <= addDays(TODAY, 7) ? 'week' : 'later';
}

function order(group: FeedGroupKey, a: FeedItem, b: FeedItem): number {
  const rank = (item: FeedItem) => PRIORITY[item.priority ?? 'medium'];
  if (group === 'decide') return a.at.localeCompare(b.at) || DECIDE_TIE.indexOf(a.kind) - DECIDE_TIE.indexOf(b.kind) || a.id - b.id;
  if (group === 'suggested') return b.at.localeCompare(a.at) || b.id - a.id;
  if (group === 'no_date') return rank(a) - rank(b) || a.at.localeCompare(b.at) || a.id - b.id;
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || rank(a) - rank(b) || a.at.localeCompare(b.at) || a.id - b.id;
}

const kindGroups = (kind: FeedKind): readonly FeedGroupKey[] =>
  DECIDE.includes(kind) ? ['decide'] : kind === 'suggestion' ? ['suggested'] : ['overdue', 'today', 'week', 'later', 'no_date', 'blocked'];

function recordOf(body: Record<string, unknown>) {
  if (typeof body.customer_id === 'number') {
    const found = RECORDS.customers.find((r) => r.id === body.customer_id);
    return found ? { kind: 'customer' as const, id: found.id, name: found.name } : null;
  }
  const found = RECORDS.accounts.find((r) => r.id === body.account_id);
  return found ? { kind: 'account' as const, id: found.id, name: found.name } : null;
}

export function stubFeed(stub: FeedStub = {}) {
  const reader: TaskPerson = stub.reader ?? ALICE;
  const work = stubWork({ ...stub, tasks: [...(stub.tasks ?? WORK_TASKS), ...(stub.todos ?? TODOS)] });
  const decide = new Map<string, FeedItem>((stub.decide ?? DECIDE_ITEMS).map((item) => [item.key, clone(item)]));
  /** Reviews decided (by this reader or, on a refused 409, by someone else). */
  const reviewed = new Set<string>();
  const fail: Partial<Record<FeedKind, number>> = { ...(stub.failKinds ?? {}) };
  if (fail.task || fail.todo) fail.task = fail.todo = Math.max(fail.task ?? 0, fail.todo ?? 0);
  let failFeed = stub.failFeed ?? 0;
  let refuseAction = stub.refuseNextAction ?? null;
  let refuseTodo = stub.refuseNextTodo ?? null;
  const size = stub.pageSize ?? 50;
  let nextId = 950;
  let nextEvent = 9500;

  /** Queue items decided or answered here: they leave every list. */
  const queueGone = new Set<string>();
  let failQueue = stub.failQueue ?? 0;
  const offered = stub.offered ?? ['me', 'team', 'company'];
  const TEAM_GROUPS: readonly FeedGroupKey[] = ['decide', 'overdue', 'suggested'];
  const queued = (key: string) =>
    Object.values(stub.team ?? {})
      .flat()
      .find((item) => item.key === key && !queueGone.has(key));
  const pending = (key: string) => decide.get(key) ?? queued(key);

  const mine = (task: TaskDetail) => task.status !== 'completed' && (task.parent ? task.assignee?.id === reader.id : task.created_by?.id === reader.id);

  function everything(kinds: readonly FeedKind[], failed: readonly FeedKind[]): Record<FeedGroupKey, FeedItem[]> {
    const groups = Object.fromEntries(GROUPS.map((key) => [key, [] as FeedItem[]])) as Record<FeedGroupKey, FeedItem[]>;
    const ok = (kind: FeedKind) => kinds.includes(kind) && !failed.includes(kind);
    for (const item of decide.values()) if (ok(item.kind)) groups.decide.push(item);
    for (const task of work.tasks.values()) {
      if (!mine(task)) continue;
      const item = taskItem(task);
      if (ok(item.kind)) groups[taskGroup(task)].push(item);
    }
    for (const state of work.recommendations.values()) {
      const { row, decided: outcome } = state;
      if (outcome.status === 'open' && row.recipient.id === reader.id && SUGGESTED.includes(row.kind) && ok('suggestion')) groups.suggested.push(suggestionItem(row));
    }
    for (const key of GROUPS) groups[key].sort((a, b) => order(key, a, b));
    return groups;
  }

  const page = (key: FeedGroupKey, list: FeedItem[], from: number): FeedGroup => ({
    key,
    count: list.length,
    items: list.slice(from, from + size),
    next: from + size < list.length ? `${key}:${from + size}` : null,
  });

  /** The asked kinds failing this read; each read uses one failure up. */
  function failing(kinds: readonly FeedKind[], group: FeedGroupKey | null): FeedKind[] {
    const failed = kinds.filter((kind) => (fail[kind] ?? 0) > 0 && (group === null || kindGroups(kind).includes(group)));
    for (const kind of failed) fail[kind] = (fail[kind] ?? 1) - 1;
    return failed;
  }

  function feed(url: URL) {
    const asked = url.searchParams.get('kind');
    const kinds = asked === null ? KINDS : asKinds(asked);
    if (kinds.length === 0 || kinds.some((kind) => !KINDS.includes(kind))) {
      return json(400, { kind: ['Choose bundle, rule_review, question, draft, task, todo, suggestion, slack_message, meeting_proposal or email_suggestion.'] });
    }
    const group = url.searchParams.get('group') as FeedGroupKey | null;
    const cursor = url.searchParams.get('cursor');
    if (cursor !== null && group === null) return json(400, { cursor: ['Say which group to page.'] });
    if (group !== null && !GROUPS.includes(group)) {
      return json(400, { group: ['Choose decide, overdue, today, week, later, no_date, blocked or suggested.'] });
    }
    if (group === null) {
      if (failFeed > 0) {
        failFeed -= 1;
        return json(500, { detail: 'Down.' });
      }
      const failed = failing(kinds, null);
      const groups = everything(kinds, failed);
      return json(200, { groups: GROUPS.map((key) => page(key, groups[key], 0)), hidden: stub.feedHidden ?? 0, failed: KINDS.filter((k) => failed.includes(k)) });
    }
    let from = 0;
    if (cursor !== null) {
      const [key, offset] = cursor.split(':');
      if (key !== group || !/^\d+$/.test(offset ?? '')) return json(400, { cursor: ['That list has changed. Reload Work.'] });
      from = Number(offset);
    }
    const failed = failing(kinds, group);
    return json(200, { group: page(group, everything(kinds, failed)[group], from), failed: KINDS.filter((k) => failed.includes(k)) });
  }

  function queueItems(scope: TeamScope, kinds: readonly FeedKind[]): Record<FeedGroupKey, FeedItem[]> {
    const groups = Object.fromEntries(TEAM_GROUPS.map((key) => [key, [] as FeedItem[]])) as Record<FeedGroupKey, FeedItem[]>;
    for (const item of stub.team?.[scope] ?? []) {
      if (queueGone.has(item.key) || !kinds.includes(item.kind)) continue;
      if (item.kind === 'suggestion' && work.recommendations.get(item.id)?.decided.status !== 'open') continue;
      if ((item.kind === 'task' || item.kind === 'todo') && work.tasks.get(item.id)?.status === 'completed') continue;
      const key: FeedGroupKey = item.kind === 'suggestion' ? 'suggested' : item.kind === 'task' || item.kind === 'todo' ? 'overdue' : 'decide';
      groups[key].push(clone(item));
    }
    for (const key of TEAM_GROUPS) groups[key].sort((a, b) => order(key, a, b));
    return groups;
  }

  function queue(url: URL) {
    const scope = url.searchParams.get('scope') ?? (offered.includes('company') ? 'company' : 'team');
    if (scope !== 'team' && scope !== 'company') return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose team or company.' });
    if (!offered.includes(scope)) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
    const asked = url.searchParams.get('kind');
    const kinds = asked === null ? TEAM_KINDS : asKinds(asked);
    if (kinds.length === 0 || kinds.some((kind) => !TEAM_KINDS.includes(kind))) return json(400, { kind: ['Choose bundle, rule_review, question, task or suggestion.'] });
    const group = url.searchParams.get('group') as FeedGroupKey | null;
    const cursor = url.searchParams.get('cursor');
    if (cursor !== null && group === null) return json(400, { cursor: ['Say which group to page.'] });
    if (group !== null && !TEAM_GROUPS.includes(group)) return json(400, { group: ['Choose decide, overdue or suggested.'] });
    const lists = queueItems(scope, kinds);
    if (group === null) {
      if (failQueue > 0) {
        failQueue -= 1;
        return json(500, { detail: 'Down.' });
      }
      return json(200, { scope, groups: TEAM_GROUPS.map((key) => page(key, lists[key], 0)), hidden: stub.queueHidden ?? 0, failed: [] });
    }
    let from = 0;
    if (cursor !== null) {
      const [key, offset] = cursor.split(':');
      if (key !== group || !/^\d+$/.test(offset ?? '')) return json(400, { cursor: ['That list has changed. Reload Work.'] });
      from = Number(offset);
    }
    return json(200, { scope, group: page(group, lists[group], from), failed: [] });
  }

  let failQueues = stub.failQueues ?? 0;
  function queues() {
    if (failQueues > 0) {
      failQueues -= 1;
      return json(500, { detail: 'Down.' });
    }
    const broken = stub.failQueueKeys ?? [];
    const answer = (rows: QueueRow[]) => json(200, { queues: rows.map((row) => (broken.includes(row.key) ? { ...row, count: null } : row)), failed: broken });
    if (stub.queues) return answer(stub.queues);
    const groups = everything(KINDS, []);
    const rows: QueueRow[] = [{ key: 'mine', label: 'Mine', count: groups.decide.length + groups.overdue.length }];
    const waiting = (scope: TeamScope) => (stub.team?.[scope] ?? []).filter((item) => !queueGone.has(item.key) && item.kind !== 'suggestion').length;
    if (offered.includes('team')) rows.push({ key: 'team', label: 'My team', count: waiting('team') });
    if (offered.includes('company')) rows.push({ key: 'company', label: 'Rest of company', count: waiting('company') });
    return answer([...rows, { key: 'history', label: 'History', count: null }]);
  }

  function answerAsked(id: number, body: Record<string, unknown>) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) return json(400, { detail: 'Say something.' });
    const key = `question:${id}`;
    if (!pending(key)) return json(404, { detail: 'Not found.' });
    decide.delete(key);
    queueGone.add(key);
    return json(200, { id, status: 'answered' });
  }

  function count() {
    const groups = everything(KINDS, []);
    return json(200, { decide: groups.decide.length, overdue: groups.overdue.length, badge: groups.decide.length + groups.overdue.length, failed: [] });
  }

  function todo(body: Record<string, unknown>) {
    if (refuseTodo) {
      const answer = refuseTodo;
      refuseTodo = null;
      return json(answer.status, answer.body);
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return json(400, { title: ['Give the task a title.'] });
    if (title.length > 255) return json(400, { title: ['Keep the title under 255 characters.'] });
    if (body.due_date != null && !isDate(body.due_date)) return json(400, { due_date: ['Choose a date.'] });
    if (body.priority !== undefined && !['high', 'medium', 'low'].includes(String(body.priority))) return json(400, { priority: ['Choose high, medium or low.'] });
    const wantsRecord = body.customer_id != null || body.account_id != null;
    if (body.customer_id != null && body.account_id != null) return json(400, { record: ['Choose an organisation or an account, not both.'] });
    const record = wantsRecord ? recordOf(body) : null;
    if (wantsRecord && !record) return json(400, RECORD);
    if (!record && body.assignee_id != null && body.assignee_id !== reader.id) return json(400, { assignee: ['A to-do without a record can only be yours.'] });
    if (record && !isDate(body.due_date)) return json(400, { due_date: ['Choose a date.'] });
    let assignee: TaskPerson = reader;
    if (record && body.assignee_id != null && body.assignee_id !== reader.id) {
      const person = ASSIGNEES.find((p) => p.id === body.assignee_id);
      if (!person || !person.can_open) {
        return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${record.kind === 'customer' ? 'organisation' : 'account'}.` });
      }
      assignee = { id: person.id, name: person.name, active: true };
    }
    const task = taskDetail({
      id: nextId++,
      title,
      due_date: (body.due_date as string | null | undefined) ?? null,
      priority: (body.priority as TaskDetail['priority'] | undefined) ?? 'medium',
      parent: record,
      assignee,
      created_by: refOf(reader),
      created_at: NOW,
      editable: record ? ['title', 'description', 'status', 'due_date', 'priority', 'assignee'] : ['title', 'description', 'status', 'due_date', 'priority', 'assignee', 'record'],
      events: [taskEvent(nextEvent++, 'created', refOf(reader), { source: 'manual', assignee: refOf(assignee) })],
    });
    work.tasks.set(task.id, task);
    const ours = assignee.id === reader.id;
    return json(201, { task, item: ours ? taskItem(task) : null, group: ours ? taskGroup(task) : null });
  }

  /** PATCH on a to-do: the to-do rules (contract §1.2) alongside every ordinary field, which stubWork's own rules apply; null when nothing here is special. */
  async function patchTodo(task: TaskDetail, body: Record<string, unknown>, input: RequestInfo | URL, init: RequestInit | undefined) {
    const attaching = body.customer_id != null || body.account_id != null;
    const clearing = 'due_date' in body && body.due_date === null;
    if (!attaching && !clearing && !(body.assignee_id != null && body.assignee_id !== reader.id)) return null;
    if (body.customer_id != null && body.account_id != null) return json(400, { record: ['Choose an organisation or an account, not both.'] });
    const record = attaching ? recordOf(body) : null;
    if (attaching && !record) return json(400, RECORD);
    if (record) {
      const due = 'due_date' in body ? body.due_date : task.due_date;
      if (!isDate(due)) return json(400, { due_date: ['Choose a date.'] });
    }
    if (body.assignee_id != null && body.assignee_id !== reader.id) {
      if (!record) return json(400, { assignee: ['A to-do without a record can only be yours.'] });
      const person = ASSIGNEES.find((p) => p.id === body.assignee_id);
      if (!person || !person.can_open) {
        return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${record.kind === 'customer' ? 'organisation' : 'account'}.` });
      }
    }
    // The ordinary fields (title, priority, status, assignee, a new date) go through stubWork.
    const rest = { ...body };
    delete rest.customer_id;
    delete rest.account_id;
    if (clearing) delete rest.due_date;
    const answer = (await work.spy(input, { ...init, body: JSON.stringify(rest) })) as { status: number };
    if (answer.status !== 200) return answer;
    if (clearing) {
      task.events.push(taskEvent(nextEvent++, 'due_changed', refOf(reader), { from: task.due_date, to: null }));
      task.due_date = null;
    }
    if (record) {
      task.parent = record;
      task.parent_name = record.name;
      task.parent_type = record.kind;
      task.private = false;
      task.editable = task.editable.filter((field) => field !== 'record');
      task.events.push(taskEvent(nextEvent++, 'edited', refOf(reader), { field: 'record', from: null, to: { kind: record.kind, id: record.id, name: record.name } }));
    }
    return json(200, task);
  }

  function reviewDecision(id: number, verb: string) {
    const key = `rule_review:${id}`;
    if (refuseAction) {
      const answer = refuseAction;
      refuseAction = null;
      if (answer.status === 409) {
        decide.delete(key);
        queueGone.add(key);
        reviewed.add(key);
      }
      return json(answer.status, answer.body);
    }
    const item = pending(key) as ReviewFeedItem | undefined;
    if (!item) return reviewed.has(key) ? json(409, { detail: 'This review has already been decided.' }) : json(404, { detail: 'Not found.' });
    decide.delete(key);
    queueGone.add(key);
    reviewed.add(key);
    if (verb !== 'approve') return json(200, { id, status: 'skipped' });
    return json(200, item.detail.review_kind === 'campaign' ? { campaign_send_id: 32 } : { survey_send_id: 31 });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method === 'GET' && path === '/calendar/meetings/' && stub.meetings) return json(200, { meetings: stub.meetings });
    if (method === 'GET' && path === '/work/feed/') return feed(url);
    if (method === 'GET' && path === '/work/feed/count/') return count();
    if (method === 'POST' && path === '/work/todos/') return todo(body);
    if (method === 'GET' && path === '/work/feed/team/') return queue(url);
    if (method === 'GET' && path === '/work/queues/') return queues();
    if (method === 'POST' && path === '/agents/ops/run/') {
      if (stub.runRefusal) return json(stub.runRefusal.status, stub.runRefusal.body);
      return json(200, { kind: 'ops', label: 'Ops agent', enabled: true, monthly_credits: 134, spent_this_month: 3, resets_on: '2026-11-01', last_run: { at: NOW, proposed: 1, applied: 0, dropped: 0, skipped_reason: null } });
    }
    const answered = /^\/questions\/(\d+)\/answer\/$/.exec(path);
    if (answered && method === 'POST') return answerAsked(Number(answered[1]), body);
    const detail = /^\/tasks\/(\d+)\/$/.exec(path);
    if (detail && method === 'PATCH') {
      const task = work.tasks.get(Number(detail[1]));
      if (task && task.parent === null && task.created_by?.id === reader.id) {
        const answer = await patchTodo(task, body, input, init);
        if (answer) return answer;
      }
    }
    const review = /^\/rules\/reviews\/(\d+)\/(approve|skip)\/$/.exec(path);
    if (review && method === 'POST' && stub.decisions !== 'pass') return reviewDecision(Number(review[1]), review[2]);
    return work.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, work, decide };
}
