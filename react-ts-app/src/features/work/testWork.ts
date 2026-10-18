// Test-only: one stateful fetch stub for the Work routes, in the delivery 1
// contract's shapes and refusal order. Writes are kept, so a later read
// returns them; every answer is a copy, so nothing on screen shares state
// with the stub. Brain's scopes/, /auth/members/, the
// record search and /notifications/ answer too, so a page renders whole.
//
// Contract fix-round note: a change that hands a task outside the reader's
// chain (its creator, its assignee, or anyone above either) still answers
// 200 with the task as saved and `editable: []`; the next read of it is
// 404, exactly as if it never existed for that reader. `canRead` below is
// recomputed fresh from the task's current, persisted state on every
// request, so this falls out of the same check rather than a separate flag.
//
// Fix round 1: `viewAll` (view_all_accounts or the Leadership function) is
// the contract's fourth read condition, bypassing the chain entirely. A
// plan task's `editable` is reader-sensitive too: `['status']` for its
// assignee or creator (no plan-editor fixture exists here, so that third
// way in is never reached), else `[]`, with its own refusal for a status
// PATCH from anyone else.
//
// Delivery 2: GET /work/recommendations/ (me: the reader is the recipient;
// team: everything they may decide, which is the recipient, anyone above the
// suggested person, or `viewAll`, here standing for view_all_accounts), the
// assign and dismiss decisions in the contract's refusal order (404, 403
// CANT_DECIDE, 400 fields, 409 ALREADY_DECIDED, 400 ASSIGNEE_CANNOT_OPEN),
// Run now, and GET/PATCH /work/settings/ with the contract's limits.
import { vi } from 'vitest';
import type { ScopeKey } from '../brain/brainTypes';
import { ASSIGNEES, MEMBERS, NOW, RECOMMENDATIONS, RECORDS, TEAM_PEOPLE, TODAY, ALICE, WORK_SETTINGS, refOf, taskDetail, taskEvent, WORK_TASKS } from './testWorkFixtures';
import type {
  AssigneeOption,
  DecidedRecommendation,
  DismissReason,
  RecKind,
  RecScope,
  RecommendationRow,
  RefreshResult,
  SourceSettings,
  TaskDetail,
  TaskPerson,
  TaskRow,
  TaskStatus,
  TeamPerson,
  WorkSettings,
} from './workTypes';

export interface WorkStub {
  /** Default WORK_TASKS (copied). */
  tasks?: TaskDetail[];
  /** Who is reading. Default ALICE (the store's user). */
  reader?: TaskPerson;
  /** GET /work/team/'s `hidden` by scope. Default 0. */
  teamHidden?: Partial<Record<ScopeKey, number>>;
  /** Brain's scopes. Default all three. */
  offered?: ScopeKey[];
  /** GET /work/assignees/. Default ASSIGNEES. */
  assignees?: AssigneeOption[];
  /** GET /auth/members/. Default MEMBERS; also read for the reader's chain. */
  members?: unknown[];
  /** Whether the reader holds view_all_accounts or the Leadership function:
   *  the contract's fourth "who may read a task" condition, bypassing the
   *  chain. Default false. */
  viewAll?: boolean;
  /** How many reads of each fail (500) first. */
  failTeam?: number;
  failDrill?: number;
  failTask?: number;
  failAssignees?: number;
  /** The next PATCH /tasks/<id>/ answers this instead, once. */
  refuseNextPatch?: { status: number; body: unknown };
  /** The next comment answers this instead, once. */
  refuseNextComment?: { status: number; body: unknown };
  /** The recommendations, all open. Default RECOMMENDATIONS (copied). */
  recommendations?: RecommendationRow[];
  /** GET /work/recommendations/'s `hidden` by scope. Default 0. */
  recHidden?: Partial<Record<RecScope, number>>;
  /** How many reads of GET /work/recommendations/ fail (500) first. */
  failRecommendations?: number;
  /** The next assign or dismiss the reader may make answers this instead, once. */
  refuseNextDecision?: { status: number; body: unknown };
  /** GET /work/settings/. Default WORK_SETTINGS (copied); `can_edit: false` is a member. */
  workSettings?: WorkSettings;
  /** How many reads of GET /work/settings/ fail (500) first. */
  failSettings?: number;
  /** The next PATCH /work/settings/ answers this instead, once. */
  refuseNextSettings?: { status: number; body: unknown };
  /** POST /work/recommendations/refresh/'s answer. */
  refreshResult?: RefreshResult;
  /** Every request this stub does not know goes here instead. */
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const DOWN = { detail: 'Down.' };
const NO_TASK = { detail: 'No such task.' };
const NOT_EDITOR = "Only the plan's owner or their managers can change it.";
const NOT_CHECKER = "Only the task's assignee, its creator or the plan's editors can tick it.";
const SCOPE_LABEL: Record<ScopeKey, string> = { me: 'Me', team: 'My team', company: 'Company' };
const SCOPES: readonly ScopeKey[] = ['me', 'team', 'company'];
const STATUSES: readonly TaskStatus[] = ['pending', 'in-progress', 'blocked', 'completed'];
const PRIORITIES = ['high', 'medium', 'low'];
const PRIORITY_DISPLAY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_DISPLAY: Record<TaskStatus, string> = { pending: 'Pending', 'in-progress': 'In Progress', blocked: 'Blocked', completed: 'Completed' };

interface ChainMember {
  id: number;
  reports_to: { id: number } | null;
}

/** One recommendation as the stub keeps it: the row as listed, and its outcome. */
export interface RecState {
  row: RecommendationRow;
  decided: DecidedRecommendation;
}

const NO_SETTINGS = "You don't have permission to change organisation settings.";
const DISMISS_CODES: readonly DismissReason[] = ['already_handled', 'not_relevant', 'wrong_person', 'other'];
const SOURCE_FIELDS: Record<RecKind, readonly string[]> = {
  renewal_due: ['days'],
  health_drop: ['drop', 'window_days'],
  urgent_tickets: ['min'],
  anomaly: [],
};
const LIMITS: Record<string, { lo: number; hi: number; whole: boolean }> = {
  days: { lo: 1, hi: 120, whole: true },
  window_days: { lo: 1, hi: 120, whole: true },
  min: { lo: 1, hi: 50, whole: true },
  drop: { lo: 0.1, hi: 5, whole: false },
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const inRange = (value: unknown, lo: number, hi: number, whole: boolean) =>
  typeof value === 'number' && value >= lo && value <= hi && (!whole || Number.isInteger(value));
const openDecision = (id: number): DecidedRecommendation => ({
  id,
  status: 'open',
  decided_by: null,
  decided_at: null,
  task_id: null,
  dismiss_reason: '',
  dismiss_note: '',
});

function alreadyText(decided: DecidedRecommendation): string {
  if (decided.status === 'expired') return 'This recommendation has expired.';
  return `${decided.decided_by?.name ?? 'Someone'} already ${decided.status} this.`;
}

/** The contract's timezones: whatever this runtime knows, plus UTC. */
function knownZone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    // supportedValuesOf lists canonical names only (Asia/Calcutta, not Asia/Kolkata); the constructor accepts every alias.
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const isWeekdays = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every((day) => inRange(day, 0, 6, true));

/** PATCH /work/settings/'s 400 body, or null when the body is fine. */
function settingsRefusal(body: unknown): Record<string, unknown> | null {
  if (!isObject(body)) return { non_field_errors: ['Send the fields as one object.'] };
  const errors: Record<string, unknown> = {};
  if ('recommend_to' in body && body.recommend_to !== 'manager' && body.recommend_to !== 'owner') errors.recommend_to = ['Choose manager or owner.'];
  if ('dismiss_cooldown_days' in body && !inRange(body.dismiss_cooldown_days, 0, 120, true)) {
    errors.dismiss_cooldown_days = ['Choose a whole number from 0 to 120.'];
  }
  if ('timezone' in body && !knownZone(body.timezone)) errors.timezone = ['Choose a timezone from the list.'];
  if ('working_days' in body && !isWeekdays(body.working_days)) errors.working_days = ['Choose at least one working day.'];
  if ('escalate_after_days' in body && !inRange(body.escalate_after_days, 1, 30, true)) {
    errors.escalate_after_days = ['Choose a whole number from 1 to 30.'];
  }
  if ('digest_enabled' in body && typeof body.digest_enabled !== 'boolean') errors.digest_enabled = ['Choose on or off.'];
  if ('digest_hour' in body && !inRange(body.digest_hour, 0, 23, true)) errors.digest_hour = ['Choose a whole number from 0 to 23.'];
  if ('sources' in body) {
    if (!isObject(body.sources)) errors.sources = ['Send the sources as one object.'];
    else {
      const sources: Record<string, unknown> = {};
      for (const [kind, change] of Object.entries(body.sources)) {
        if (!(kind in SOURCE_FIELDS)) {
          sources[kind] = ['Unknown source.'];
          continue;
        }
        if (!isObject(change)) {
          sources[kind] = ["Send each source's settings as one object."];
          continue;
        }
        const fields: Record<string, string[]> = {};
        for (const [field, value] of Object.entries(change)) {
          if (field === 'enabled') {
            if (typeof value !== 'boolean') fields.enabled = ['Choose on or off.'];
          } else if (!SOURCE_FIELDS[kind as RecKind].includes(field)) {
            fields[field] = ['Unknown setting.'];
          } else {
            const { lo, hi, whole } = LIMITS[field];
            if (!inRange(value, lo, hi, whole)) fields[field] = [whole ? `Choose a whole number from ${lo} to ${hi}.` : `Choose a number from ${lo} to ${hi}.`];
          }
        }
        if (Object.keys(fields).length > 0) sources[kind] = fields;
      }
      if (Object.keys(sources).length > 0) errors.sources = sources;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

const byDue = (a: TaskDetail, b: TaskDetail) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.id - b.id;
const isOpen = (task: TaskDetail) => task.status !== 'completed';
const lateOf = (task: TaskDetail) => task.status !== 'blocked' && task.due_date !== null && task.due_date < TODAY;
/** To-dos never reach /work/team/ or /work/tasks/ (contract §1). */
const onRecord = (task: TaskDetail) => task.parent !== null;

function rowOf(task: TaskDetail): TaskRow {
  const { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan } = task;
  return { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan, private: parent === null };
}

/** Mirrors the backend's `_asked()` (work-be services/customers/task_views.py):
 * the fields the body actually changes, in `editable`'s names. A field sent
 * with its current value is not asked for, so a client may resend the whole
 * form with one real change. `blocked_reason` rides with `status`: a new
 * reason on an already-Blocked task is a status change too. */
function askedFields(task: TaskDetail, data: Record<string, unknown>): Set<TaskDetail['editable'][number]> {
  const asked = new Set<TaskDetail['editable'][number]>();
  if ('title' in data && data.title !== task.title) asked.add('title');
  if ('description' in data && data.description !== task.description) asked.add('description');
  if ('priority' in data && data.priority !== task.priority) asked.add('priority');
  if ('due_date' in data && data.due_date !== task.due_date) asked.add('due_date');
  if ('assignee_id' in data && data.assignee_id !== task.assignee?.id) asked.add('assignee');
  const newStatus = ('status' in data ? data.status : task.status) as TaskStatus;
  const reasonChanged = newStatus === 'blocked' && 'blocked_reason' in data && String(data.blocked_reason ?? '').trim() !== task.blocked_reason;
  if (newStatus !== task.status || reasonChanged) asked.add('status');
  return asked;
}

export function stubWork(stub: WorkStub = {}) {
  const reader = stub.reader ?? ALICE;
  const me = refOf(reader);
  const tasks = new Map<number, TaskDetail>((stub.tasks ?? WORK_TASKS).map((task) => [task.id, JSON.parse(JSON.stringify(task)) as TaskDetail]));
  const offered = stub.offered ?? [...SCOPES];
  const assignees = stub.assignees ?? ASSIGNEES;
  const members = (stub.members as ChainMember[] | undefined) ?? MEMBERS;
  const viewAll = stub.viewAll ?? false;
  let failTeam = stub.failTeam ?? 0;
  let failDrill = stub.failDrill ?? 0;
  let failTask = stub.failTask ?? 0;
  let failAssignees = stub.failAssignees ?? 0;
  let refusePatch = stub.refuseNextPatch ?? null;
  let refuseComment = stub.refuseNextComment ?? null;
  let nextTask = 900;
  let nextEvent = 9000;
  const recommendations = new Map<number, RecState>(
    (stub.recommendations ?? RECOMMENDATIONS).map((row) => [row.id, { row: JSON.parse(JSON.stringify(row)) as RecommendationRow, decided: openDecision(row.id) }]),
  );
  const settings: WorkSettings = JSON.parse(JSON.stringify(stub.workSettings ?? WORK_SETTINGS));
  let failRecommendations = stub.failRecommendations ?? 0;
  let failSettings = stub.failSettings ?? 0;
  let refuseDecision = stub.refuseNextDecision ?? null;
  let refuseSettings = stub.refuseNextSettings ?? null;
  const hasReports = members.some((person) => person.reports_to?.id === reader.id);

  /** Is `managerId` that person, or above them, walking `reports_to`. */
  function isAbove(managerId: number, personId: number): boolean {
    let current: number | undefined = personId;
    const seen = new Set<number>();
    while (current !== undefined && !seen.has(current)) {
      if (current === managerId) return true;
      seen.add(current);
      current = members.find((person) => person.id === current)?.reports_to?.id;
    }
    return false;
  }

  /** The reader may read a task they created or are assigned, stand above
   * either in the reporting chain, or hold view_all_accounts or the
   * Leadership function (`viewAll`). Recomputed fresh from the task's
   * current state, so a hand-off outside the chain makes the very next
   * read 404. */
  function canRead(task: TaskDetail): boolean {
    if (viewAll) return true;
    const ids = [task.created_by?.id, task.assignee?.id].filter((id): id is number => id != null);
    return ids.some((id) => isAbove(reader.id, id));
  }

  /** The fields the reader may change. All six on an ordinary task, for
   * every reader. On a plan task: `['status']` for its assignee or its
   * creator (no plan-editor fixture exists here, so that third way in is
   * never reached by these tests), otherwise none. */
  function editableOf(task: TaskDetail): TaskDetail['editable'] {
    if (!task.plan) return task.editable;
    if (task.assignee?.id === reader.id || task.created_by?.id === reader.id) return ['status'];
    return [];
  }

  function team(scope: ScopeKey) {
    const people: TeamPerson[] = [];
    for (const person of TEAM_PEOPLE[scope]) {
      const open = [...tasks.values()].filter(onRecord).filter((t) => t.assignee?.id === person.id && isOpen(t));
      if (!person.active && open.length === 0) continue;
      const late = open.filter(lateOf).sort(byDue);
      people.push({
        person,
        open: open.length,
        overdue: late.length,
        blocked: open.filter((t) => t.status === 'blocked').length,
        oldest_overdue: late[0]?.due_date ?? null,
      });
    }
    people.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.person.name.localeCompare(b.person.name));
    return { scope, today: TODAY, people, hidden: stub.teamHidden?.[scope] ?? 0 };
  }

  /** Contract: its recipient, anyone above its suggested person, or view-all. */
  function mayDecide(row: RecommendationRow): boolean {
    if (viewAll || row.recipient.id === reader.id) return true;
    const person = row.suggested_assignee;
    return person !== null && person.id !== reader.id && isAbove(reader.id, person.id);
  }

  function recList(scope: RecScope) {
    const open = [...recommendations.values()]
      .filter((state) => state.decided.status === 'open')
      .map((state) => state.row)
      .filter((row) => (scope === 'me' ? row.recipient.id === reader.id : mayDecide(row)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return { scope, items: open.slice(0, 100), count: open.length, hidden: stub.recHidden?.[scope] ?? 0 };
  }

  function decide(id: number, action: 'assign' | 'dismiss', body: unknown) {
    const state = recommendations.get(id);
    if (!state) return json(404, { detail: 'No such recommendation.' });
    const { row } = state;
    if (!mayDecide(row)) return json(403, { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." });
    if (refuseDecision) {
      const answer = refuseDecision;
      refuseDecision = null;
      return json(answer.status, answer.body);
    }
    const asked: Record<string, unknown> = isObject(body) ? body : {};
    if (action === 'assign') {
      if (typeof asked.assignee_id !== 'number') return json(400, { assignee_id: ['Choose who does it.'] });
      if ('due_date' in asked && !/^\d{4}-\d{2}-\d{2}$/.test(String(asked.due_date))) return json(400, { due_date: ['Choose a date.'] });
      if ('title' in asked) {
        const title = String(asked.title ?? '').trim();
        if (!title) return json(400, { title: ['Give the task a title.'] });
        if (title.length > 255) return json(400, { title: ['Keep the title under 255 characters.'] });
      }
      if ('priority' in asked && !PRIORITIES.includes(String(asked.priority))) return json(400, { priority: ['Choose high, medium or low.'] });
    } else {
      if (!DISMISS_CODES.includes(asked.reason as DismissReason)) {
        return json(400, { reason: ['Choose already handled, not relevant, wrong person or other.'] });
      }
      if (asked.reason === 'other') {
        const note = String(asked.note ?? '').trim();
        if (!note) return json(400, { note: ['Say why.'] });
        if (note.length > 255) return json(400, { note: ['Keep the note under 255 characters.'] });
      }
    }
    if (state.decided.status !== 'open') {
      return json(409, { code: 'ALREADY_DECIDED', detail: alreadyText(state.decided), recommendation: state.decided });
    }
    if (action === 'dismiss') {
      const reason = asked.reason as DismissReason;
      state.decided = {
        ...state.decided,
        status: 'dismissed',
        decided_by: me,
        decided_at: NOW,
        dismiss_reason: reason,
        dismiss_note: reason === 'other' ? String(asked.note).trim() : '',
      };
      return json(200, { recommendation: state.decided });
    }
    // Nothing to assign on a row with no record (Agents delivery 3).
    if (!row.record) return json(404, { detail: 'No such recommendation.' });
    const person = assignees.find((option) => option.id === asked.assignee_id);
    if (!person || !person.can_open) {
      return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${row.record.kind === 'customer' ? 'organisation' : 'account'}.` });
    }
    const source = row.kind === 'agent_action' ? ('agent' as const) : ('recommendation' as const);
    const facts = row.why.facts;
    const task = taskDetail({
      id: nextTask++,
      title: typeof asked.title === 'string' ? asked.title.trim() : row.defaults?.title ?? row.title,
      due_date: typeof asked.due_date === 'string' ? asked.due_date : row.defaults?.due_date ?? TODAY,
      priority: typeof asked.priority === 'string' ? (asked.priority as TaskDetail['priority']) : row.defaults?.priority ?? 'medium',
      parent: row.record,
      assignee: { id: person.id, name: person.name, active: true },
      created_by: me,
      created_at: NOW,
      source,
      description: `Recommended by Revenact:\n${facts.map((fact) => `- ${fact}`).join('\n')}`,
      events: [
        taskEvent(nextEvent++, 'created', me, {
          source,
          assignee: { id: person.id, name: person.name },
          recommendation: row.id,
          ...(row.agent_action ? { proposal: row.agent_action.id } : {}),
        }),
        taskEvent(nextEvent++, 'recommended', null, { facts }),
      ],
    });
    tasks.set(task.id, task);
    state.decided = { ...state.decided, status: 'assigned', decided_by: me, decided_at: NOW, task_id: task.id };
    return json(201, { recommendation: state.decided, task: rowOf(task) });
  }

  function saveSettings(body: unknown) {
    if (!settings.can_edit) return json(403, { detail: NO_SETTINGS });
    if (refuseSettings) {
      const answer = refuseSettings;
      refuseSettings = null;
      return json(answer.status, answer.body);
    }
    const refusal = settingsRefusal(body);
    if (refusal) return json(400, refusal);
    const asked = body as Record<string, unknown>;
    if (asked.recommend_to === 'manager' || asked.recommend_to === 'owner') settings.recommend_to = asked.recommend_to;
    if (typeof asked.dismiss_cooldown_days === 'number') settings.dismiss_cooldown_days = asked.dismiss_cooldown_days;
    if (typeof asked.timezone === 'string') settings.timezone = asked.timezone;
    if (isWeekdays(asked.working_days)) settings.working_days = [...new Set(asked.working_days)].sort((a, b) => a - b);
    if (typeof asked.escalate_after_days === 'number') settings.escalate_after_days = asked.escalate_after_days;
    if (typeof asked.digest_enabled === 'boolean') settings.digest_enabled = asked.digest_enabled;
    if (typeof asked.digest_hour === 'number') settings.digest_hour = asked.digest_hour;
    if (isObject(asked.sources)) {
      for (const [kind, change] of Object.entries(asked.sources)) {
        const next = { ...settings.sources[kind as RecKind], ...(change as Partial<SourceSettings>) };
        if (typeof next.drop === 'number') next.drop = Math.round(next.drop * 10) / 10;
        settings.sources[kind as RecKind] = next;
      }
    }
    return json(200, settings);
  }

  function write(task: TaskDetail, kind: 'edited' | 'due_changed' | 'status' | 'assigned', data: Record<string, unknown>) {
    task.events.push(taskEvent(nextEvent++, kind, me, data));
  }

  function patch(task: TaskDetail, body: unknown) {
    if (refusePatch) {
      const answer = refusePatch;
      refusePatch = null;
      return json(answer.status, answer.body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { non_field_errors: ['Send the fields as one object.'] });
    const asked = body as Record<string, unknown>;
    const allowed = editableOf(task);
    const askedSet = askedFields(task, asked);
    // Backend priority (_refuse): any asked field besides status that isn't
    // allowed refuses as NOT_EDITOR first; only when status is the sole
    // disallowed asked field does it refuse as NOT_CHECKER.
    if (![...askedSet].every((field) => allowed.includes(field))) {
      if ([...askedSet].some((field) => field !== 'status')) return json(403, { detail: NOT_EDITOR });
      return json(403, { detail: NOT_CHECKER });
    }
    if ('title' in asked && !String(asked.title ?? '').trim()) return json(400, { title: ['Give the task a title.'] });
    if ('status' in asked && !STATUSES.includes(asked.status as TaskStatus)) return json(400, { status: ['Choose pending, in progress, blocked or completed.'] });
    if ('priority' in asked && !PRIORITIES.includes(String(asked.priority))) return json(400, { priority: ['Choose high, medium or low.'] });
    if ('due_date' in asked && !/^\d{4}-\d{2}-\d{2}$/.test(String(asked.due_date))) return json(400, { due_date: ['Choose a date.'] });
    let assignee: AssigneeOption | undefined;
    if ('assignee_id' in asked) {
      if (typeof asked.assignee_id !== 'number') return json(400, { assignee_id: ['Choose who does it.'] });
      assignee = assignees.find((person) => person.id === asked.assignee_id);
      if (!assignee || !assignee.can_open) {
        return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${task.parent?.kind === 'account' ? 'account' : 'organisation'}.` });
      }
    }
    const status = (asked.status as TaskStatus | undefined) ?? task.status;
    const reason = status === 'blocked' ? String(asked.blocked_reason ?? task.blocked_reason).trim() : '';
    if (status === 'blocked' && !reason) return json(400, { blocked_reason: ["Say what it's blocked on."] });

    if (typeof asked.title === 'string' && asked.title !== task.title) {
      write(task, 'edited', { field: 'title', from: task.title, to: asked.title });
      task.title = asked.title;
    }
    if (typeof asked.description === 'string' && asked.description !== task.description) {
      write(task, 'edited', { field: 'description' });
      task.description = asked.description;
    }
    if (typeof asked.priority === 'string' && asked.priority !== task.priority) {
      write(task, 'edited', { field: 'priority', from: task.priority, to: asked.priority });
      task.priority = asked.priority as TaskDetail['priority'];
      task.priority_display = PRIORITY_DISPLAY[asked.priority];
    }
    if (typeof asked.due_date === 'string' && asked.due_date !== task.due_date) {
      write(task, 'due_changed', { from: task.due_date, to: asked.due_date });
      task.due_date = asked.due_date;
    }
    if (status !== task.status) {
      write(task, 'status', status === 'blocked' ? { from: task.status, to: status, reason } : { from: task.status, to: status });
      task.status = status;
      task.status_display = STATUS_DISPLAY[status];
    }
    task.blocked_reason = reason;
    if (assignee && assignee.id !== task.assignee?.id) {
      write(task, 'assigned', { from: task.assignee ? refOf(task.assignee) : null, to: { id: assignee.id, name: assignee.name } });
      task.assignee = { id: assignee.id, name: assignee.name, active: true };
      task.assignee_name = assignee.name;
    }
    if (!canRead(task)) return json(200, { ...task, editable: [] });
    return json(200, { ...task, editable: editableOf(task) });
  }

  function create(kind: 'customers' | 'accounts', id: number, body: Record<string, unknown>) {
    const record = (kind === 'customers' ? RECORDS.customers : RECORDS.accounts).find((r) => r.id === id);
    if (!record) return json(404, { detail: 'Not found.' });
    const title = String(body.title ?? '').trim();
    if (!title) return json(400, { title: ['Give the task a title.'] });
    let person: TaskPerson = reader;
    if (body.assignee_id !== undefined && body.assignee_id !== null) {
      const chosen = assignees.find((p) => p.id === body.assignee_id);
      if (!chosen || !chosen.can_open) {
        return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${kind === 'customers' ? 'organisation' : 'account'}.` });
      }
      person = { id: chosen.id, name: chosen.name, active: true };
    }
    const parent = { kind: kind === 'customers' ? ('customer' as const) : ('account' as const), id: record.id, name: record.name };
    const task = taskDetail({
      id: nextTask++,
      title,
      due_date: String(body.due_date),
      priority: (body.priority as TaskDetail['priority']) ?? 'medium',
      parent,
      assignee: person,
      created_by: me,
      created_at: NOW,
      events: [taskEvent(nextEvent++, 'created', me, { source: 'manual', assignee: refOf(person) })],
    });
    tasks.set(task.id, task);
    return json(201, { ...rowOf(task), description: '', created_at: NOW });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (method === 'GET' && path === '/brain/scopes/') {
      return json(200, { scopes: offered.map((key) => ({ key, label: SCOPE_LABEL[key] })), default: offered[offered.length - 1] });
    }
    if (method === 'GET' && path === '/auth/members/') return json(200, stub.members ?? MEMBERS);
    if (method === 'GET' && path === '/notifications/') return json(200, []);
    if (method === 'GET' && (path === '/customers/' || path === '/accounts/')) {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const rows = (path === '/customers/' ? RECORDS.customers : RECORDS.accounts).filter((r) => r.name.toLowerCase().includes(search));
      return json(200, { count: rows.length, next: null, previous: null, results: rows });
    }
    if (method === 'GET' && path === '/work/team/') {
      const scope = url.searchParams.get('scope') as ScopeKey | null;
      if (!scope || !SCOPES.includes(scope)) return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose me, team or company.' });
      if (!offered.includes(scope)) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
      if (failTeam > 0) {
        failTeam -= 1;
        return json(500, DOWN);
      }
      return json(200, team(scope));
    }
    if (method === 'GET' && path === '/work/tasks/') {
      const assignee = url.searchParams.get('assignee');
      const state = url.searchParams.get('state') ?? 'open';
      if (!assignee || !/^\d+$/.test(assignee)) return json(400, { assignee: ['Choose a person.'] });
      if (!['open', 'overdue', 'blocked'].includes(state)) return json(400, { state: ['Choose open, overdue or blocked.'] });
      if (failDrill > 0) {
        failDrill -= 1;
        return json(500, DOWN);
      }
      const rows = [...tasks.values()]
        .filter(onRecord)
        .filter((t) => t.assignee?.id === Number(assignee) && isOpen(t))
        .filter((t) => (state === 'overdue' ? lateOf(t) : state === 'blocked' ? t.status === 'blocked' : true))
        .sort(byDue)
        .map(rowOf);
      return json(200, { tasks: rows });
    }
    if (method === 'GET' && path === '/work/assignees/') {
      const named = ['customer', 'account'].filter((key) => url.searchParams.has(key));
      if (named.length !== 1 || !/^\d+$/.test(url.searchParams.get(named[0]) ?? '')) return json(400, { detail: 'Name one organisation or account.' });
      if (failAssignees > 0) {
        failAssignees -= 1;
        return json(500, DOWN);
      }
      return json(200, { people: assignees });
    }
    if (method === 'GET' && path === '/work/recommendations/') {
      const asked = url.searchParams.get('scope');
      if (asked !== null && asked !== 'me' && asked !== 'team') return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose me or team.' });
      if (failRecommendations > 0) {
        failRecommendations -= 1;
        return json(500, DOWN);
      }
      return json(200, recList((asked as RecScope | null) ?? (hasReports || viewAll ? 'team' : 'me')));
    }
    if (method === 'POST' && path === '/work/recommendations/refresh/') {
      if (!settings.can_edit) return json(403, { detail: NO_SETTINGS });
      return json(200, stub.refreshResult ?? { created: 2, updated: 5, expired: 1, unrouted: 0, notified: 2, failed: [] });
    }
    const decision = /^\/work\/recommendations\/(\d+)\/(assign|dismiss)\/$/.exec(path);
    if (decision && method === 'POST') return decide(Number(decision[1]), decision[2] as 'assign' | 'dismiss', body);
    if (path === '/work/settings/' && method === 'GET') {
      if (failSettings > 0) {
        failSettings -= 1;
        return json(500, DOWN);
      }
      return json(200, settings);
    }
    if (path === '/work/settings/' && method === 'PATCH') return saveSettings(body);
    const detail = /^\/tasks\/(\d+)\/$/.exec(path);
    if (detail) {
      const task = tasks.get(Number(detail[1]));
      if (!task || !canRead(task)) return json(404, NO_TASK);
      if (method === 'GET') {
        if (failTask > 0) {
          failTask -= 1;
          return json(500, DOWN);
        }
        return json(200, { ...task, editable: editableOf(task) });
      }
      if (method === 'PATCH') return patch(task, body);
    }
    const comments = /^\/tasks\/(\d+)\/comments\/$/.exec(path);
    if (comments && method === 'POST') {
      const task = tasks.get(Number(comments[1]));
      if (!task || !canRead(task)) return json(404, NO_TASK);
      if (refuseComment) {
        const answer = refuseComment;
        refuseComment = null;
        return json(answer.status, answer.body);
      }
      const text = String((body as { body?: unknown } | undefined)?.body ?? '').trim();
      if (!text) return json(400, { body: ['Write a comment.'] });
      const event = taskEvent(nextEvent++, 'comment', me, {}, text);
      task.events.push(event);
      return json(201, event);
    }
    const made = /^\/(customers|accounts)\/(\d+)\/tasks\/$/.exec(path);
    if (made && method === 'POST') return create(made[1] as 'customers' | 'accounts', Number(made[2]), (body ?? {}) as Record<string, unknown>);
    if (stub.passThrough) return stub.passThrough(input, init);
    return json(404, { detail: 'Not found.' });
  });
  vi.stubGlobal('fetch', spy);
  return { spy, tasks, recommendations, settings };
}

/** Every `method` request whose path contains `part`, as `/path?query` without /api/v1. */
export function calls(spy: ReturnType<typeof vi.fn>, method: string, part: string): string[] {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), method: (init as RequestInit | undefined)?.method ?? 'GET' }))
    .filter((call) => call.method === method && call.url.pathname.includes(part))
    .map((call) => `${call.url.pathname.replace(/^\/api\/v1/, '')}${call.url.search}`);
}

/** The JSON bodies of every `method` request whose path contains `part`. */
export function sent(spy: ReturnType<typeof vi.fn>, method: string, part: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(input)).pathname.includes(part))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
