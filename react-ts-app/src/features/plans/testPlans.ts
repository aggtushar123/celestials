// Test-only: plans in the contract's shapes (spec §4) and one fetch stub for
// every endpoint the Plans pages read. It keeps state and mirrors the status
// rules of spec §1.2: the first ticked task or done milestone puts a plan on
// track; a milestone completes with its last task and re-opens when one
// re-opens, unless it was marked done by hand; the last done milestone
// finishes the plan. Paths it does not own fall through to stubRules (then
// stubSurveys, then stubSegments). The viewer is ME (Alice, id 1) of "Acme
// Inc"; Carl reports to her.
import { vi } from 'vitest';
import type { AgentKind } from '../agents/agentTypes';
import { stubRules, type RulesStub } from '../rules/testRules';
import type { PersonRef } from '../segments/segmentTypes';
import { CARL, DANA, ME, TEAM } from '../segments/testSegments';
import { OPEN_STATUSES, STATUSES } from './planOptions';
import { addDays, daysBetween, defaultPlanName, isOpen } from './planText';
import { readableTemplate, TEMPLATES, withCounts } from './testTemplates';
import type {
  Milestone,
  Plan,
  PlanKind,
  PlanRecord,
  PlanRow,
  PlanStatus,
  PlanTask,
  PlanTemplate,
  Priority,
  RecordKind,
  RecordRef,
  StartMilestone,
  TaskStatus,
  TemplateMilestone,
} from './planTypes';

type Answer = { status: number; body: unknown };

/** The stub's today: `is_overdue` is "before this day". */
export const TODAY = '2026-10-04';
const NOW = '2026-10-04T09:00:00Z';
export const NOT_EDITOR = "Only the plan's owner or their managers can change it.";

/** The backend's exact words (revenact-backend services/plans/validation.py),
 *  copied, not imported from the client, so a test catches the client's copy
 *  drifting from the server's. */
export const SERVER = {
  CHOOSE_NAME: 'Give it a name.',
  NO_TITLE: 'Give the task a title.',
  MILESTONE_COUNT: 'Choose 1 to 12 milestones.',
  TOO_MANY_MILESTONES: 'A plan holds at most 12 milestones.',
  LAST_MILESTONE: 'A plan needs at least one milestone.',
  TOO_MANY_TASKS: 'Keep it to 50 tasks in all.',
  OFFSET_RANGE: 'Choose 0 to 365 days.',
  CHOOSE_TEMPLATE: 'Choose a template you can use.',
  CHOOSE_RECORD: 'Choose an organisation or an account.',
  CANT_OPEN: "They can't open this record.",
  NO_TEAMMATES: 'Choose at least one teammate.',
  TEMPLATE_LIMIT: 'You can own at most 50 templates.',
  CHOOSE_DATE: 'Choose a date.',
  DATE_RANGE: 'Choose a date from the start date to a year after it.',
  CHOOSE_MILESTONE: 'Choose a milestone in this plan.',
  REORDER: 'List every milestone once.',
  DONE_NEEDS_MILESTONES: 'Mark every milestone done first.',
  PLAN_FINISHED: 'This plan is finished; only its tasks can change.',
  PLAN_OPEN: 'This record already has an open plan from this template.',
  NOT_DRAFT: 'Only a draft plan can be started.',
  START_DRAFT: 'Start a draft plan with Start plan.',
  HAS_DONE_WORK: 'Cancel it instead: some of its work is done.',
  MILESTONE_HAS_DONE_WORK: 'Some of its work is done; mark it done instead.',
} as const;
/** The backend's refusal of a structure edit on a done or cancelled plan (Contract note 19). */
export const FINISHED_PLAN = SERVER.PLAN_FINISHED;
export const LAST_MILESTONE = SERVER.LAST_MILESTONE;

/** GET customers/:id/ and accounts/:id/ as Plans reads them. Ids match the
 *  segments stub's record search (Globex 1, Initech 2, Pizza Hut 7; Pizza
 *  EMEA 12, Globex NA 13, Initech APAC 14). */
export const RECORDS: PlanRecord[] = [
  { kind: 'organization', id: 1, name: 'Globex', owner: ME },
  { kind: 'organization', id: 2, name: 'Initech', owner: CARL },
  { kind: 'organization', id: 7, name: 'Pizza Hut', owner: CARL },
  { kind: 'account', id: 12, name: 'Pizza EMEA', owner: CARL },
  { kind: 'account', id: 13, name: 'Globex NA', owner: ME },
  { kind: 'account', id: 14, name: 'Initech APAC', owner: DANA },
];
/** Who can't open which record (spec §1.3): Dana can't open Globex. */
const CANT_OPEN: Record<string, number[]> = { 'organization:1': [DANA.id] };
const cantOpen = (record: { kind: RecordKind; id: number }, person: number) => (CANT_OPEN[`${record.kind}:${record.id}`] ?? []).includes(person);

/** GET /auth/members/: Carl reports to Alice, so she has reports. */
export const MEMBERS = TEAM.map((person) => ({ ...person, reports_to: person.id === CARL.id ? { id: ME.id, name: ME.name } : null }));
const active = (id: number): PersonRef | null => {
  const found = TEAM.find((person) => person.id === id && person.is_active);
  return found ? { id: found.id, name: found.name } : null;
};

export interface StoredTask extends PlanTask {
  /** Whether ME may see it (spec §1.3: creator, assignee, their managers). */
  visible: boolean;
}
export interface StoredMilestone {
  id: number;
  name: string;
  due_date: string;
  done_at: string | null;
  /** Marked done by a person; stays done when a task re-opens. */
  by_hand: boolean;
  tasks: StoredTask[];
}
export interface StoredPlan {
  id: number;
  name: string;
  kind: PlanKind;
  status: PlanStatus;
  status_set_by: 'person' | 'system';
  record: RecordRef;
  owner: PersonRef;
  start_date: string;
  template: { id: number; name: string } | null;
  started_by: PersonRef | null;
  started_by_rule: { id: number | null; name: string } | null;
  done_at: string | null;
  created_at: string;
  can_edit: boolean;
  readable: boolean;
  milestones: StoredMilestone[];
  /** The agent whose action started it (Agents delivery 2). */
  agent?: AgentKind | null;
  /** A Draft's snapshotted tasks, made again by Start plan. */
  pending?: { milestone: number; task: StoredTask }[];
}

const T = (
  id: number,
  title: string,
  priority: Priority,
  due_date: string,
  assignee: PersonRef | null,
  status: TaskStatus = 'pending',
  extra: Partial<StoredTask> = {},
): StoredTask => ({ id, title, priority, status, due_date, assignee, can_check: true, visible: true, ...extra });
const M = (id: number, name: string, due_date: string, tasks: StoredTask[], done_at: string | null = null): StoredMilestone => ({
  id,
  name,
  due_date,
  done_at,
  by_hand: done_at !== null,
  tasks,
});
const BASE = { status_set_by: 'person' as const, started_by: ME, started_by_rule: null, done_at: null, can_edit: true, readable: true };

/** Mine, on track: Kick-off done, Set up due today, one task hidden. */
export const GLOBEX_ONBOARDING: StoredPlan = {
  ...BASE, id: 41, name: 'Onboarding · Globex', kind: 'onboarding', status: 'on_track', record: { kind: 'organization', id: 1, name: 'Globex' },
  owner: ME, start_date: '2026-09-20', template: { id: 1, name: 'Onboarding' }, created_at: '2026-09-20T09:00:00Z',
  milestones: [
    M(411, 'Kick-off', '2026-09-20', [
      T(4111, 'Hold the kick-off call', 'high', '2026-09-20', ME, 'completed'),
      T(4112, 'Confirm goals and success criteria', 'high', '2026-09-23', ME, 'completed'),
    ], '2026-09-22T10:00:00Z'),
    M(412, 'Set up', '2026-10-04', [T(4121, 'Connect data sources', 'high', '2026-09-30', ME), T(4122, "Invite the customer's team", 'medium', '2026-10-04', CARL)]),
    M(413, 'First value', '2026-10-20', [T(4131, 'Review first results with the champion', 'high', '2026-10-18', ME)]),
    M(414, 'Hand-off', '2026-11-19', [
      T(4141, 'Run the onboarding review', 'medium', '2026-11-14', ME),
      T(4142, 'Hand over to the account owner', 'medium', '2026-11-19', DANA, 'pending', { visible: false }),
    ]),
  ],
};
/** Dana's, at risk (the night set it), Act overdue with both tasks hidden; I may tick only my own task. */
export const INITECH_APAC_SAVE: StoredPlan = {
  ...BASE, id: 42, name: 'Save plan · Initech APAC', kind: 'save', status: 'at_risk', status_set_by: 'system',
  record: { kind: 'account', id: 14, name: 'Initech APAC' }, owner: DANA, start_date: '2026-09-01', template: { id: 3, name: 'Save plan' },
  started_by: DANA, created_at: '2026-09-01T09:00:00Z', can_edit: false,
  milestones: [
    M(421, 'Diagnose', '2026-09-01', [
      T(4211, 'Talk to the champion about the risk', 'high', '2026-09-03', DANA, 'completed', { can_check: false }),
      T(4212, 'Write down the root cause', 'high', '2026-09-06', ME),
    ], '2026-09-03T10:00:00Z'),
    M(422, 'Act', '2026-09-15', [
      T(4221, 'Agree a recovery plan with the customer', 'high', '2026-09-11', DANA, 'pending', { visible: false, can_check: false }),
      T(4222, 'Bring in an executive sponsor', 'medium', '2026-09-15', DANA, 'pending', { visible: false, can_check: false }),
    ]),
    M(423, 'Confirm', '2026-10-01', [T(4231, 'Check health and usage have recovered', 'high', '2026-10-01', DANA, 'pending', { can_check: false })]),
  ],
};
/** Mine, not started, nothing done: deletable. */
export const PIZZA_QBR: StoredPlan = {
  ...BASE, id: 43, name: 'QBR · Pizza Hut', kind: 'qbr', status: 'not_started', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: ME, start_date: '2026-10-06', template: { id: 4, name: 'QBR' }, created_at: '2026-10-03T09:00:00Z',
  milestones: [
    M(431, 'Prepare', '2026-10-06', [T(4311, "Pull the quarter's usage and outcomes", 'medium', '2026-10-06', CARL), T(4312, 'Draft the deck', 'medium', '2026-10-11', CARL)]),
    M(432, 'Meet', '2026-10-16', [T(4321, 'Hold the business review', 'high', '2026-10-16', CARL)]),
    M(433, 'Follow up', '2026-10-20', [T(4331, 'Send notes and next steps', 'high', '2026-10-18', CARL), T(4332, 'Log decisions on the account', 'medium', '2026-10-20', CARL)]),
  ],
};
/** Mine, done. */
export const GLOBEX_NA_SUCCESS: StoredPlan = {
  ...BASE, id: 44, name: 'Success plan · Globex NA', kind: 'success', status: 'done', status_set_by: 'system', record: { kind: 'account', id: 13, name: 'Globex NA' },
  owner: ME, start_date: '2026-06-01', template: { id: 2, name: 'Success plan' }, done_at: '2026-09-01T09:00:00Z', created_at: '2026-06-01T09:00:00Z',
  milestones: [
    M(441, 'Agree outcomes', '2026-06-01', [T(4411, 'Write the success plan with the customer', 'high', '2026-06-08', ME, 'completed')], '2026-06-08T09:00:00Z'),
    M(442, 'Check-in', '2026-07-01', [T(4421, 'Review progress against outcomes', 'medium', '2026-07-01', ME, 'completed')], '2026-07-01T09:00:00Z'),
    M(443, 'Expand adoption', '2026-07-31', [T(4431, 'Find the next team or use case', 'medium', '2026-07-31', ME, 'completed')], '2026-07-31T09:00:00Z'),
    M(444, 'Review', '2026-08-30', [T(4441, 'Run the quarterly success review', 'high', '2026-08-30', ME, 'completed')], '2026-09-01T09:00:00Z'),
  ],
};
/** Mine, cancelled. */
export const INITECH_RENEWAL: StoredPlan = {
  ...BASE, id: 45, name: 'Renewal prep · Initech', kind: 'other', status: 'cancelled', record: { kind: 'organization', id: 2, name: 'Initech' },
  owner: ME, start_date: '2026-08-01', template: { id: 10, name: 'Renewal prep' }, created_at: '2026-08-01T09:00:00Z',
  milestones: [M(451, 'Prepare', '2026-08-01', [T(4511, 'Review the contract', 'high', '2026-08-01', ME)]), M(452, 'Renew', '2026-08-31', [])],
};
/** On a record I can't open: never listed, a 404. */
export const DANA_PRIVATE_PLAN: StoredPlan = {
  ...BASE, id: 46, name: "Dana's plan", kind: 'other', status: 'on_track', record: { kind: 'organization', id: 99, name: 'Hooli' },
  owner: DANA, start_date: '2026-09-01', template: null, started_by: DANA, created_at: '2026-09-01T09:00:00Z', can_edit: false, readable: false,
  milestones: [M(461, 'Call', '2026-09-30', [])],
};
/** Carl's (my report, so I edit it), started by a rule. */
export const PIZZA_EMEA_SAVE: StoredPlan = {
  ...BASE, id: 47, name: 'Save plan · Pizza EMEA', kind: 'save', status: 'not_started', status_set_by: 'system',
  record: { kind: 'account', id: 12, name: 'Pizza EMEA' }, owner: CARL, start_date: '2026-10-05', template: { id: 3, name: 'Save plan' },
  started_by: null, started_by_rule: { id: 10, name: 'Save at-risk renewals' }, created_at: '2026-10-04T02:00:00Z',
  milestones: [
    M(471, 'Diagnose', '2026-10-05', [T(4711, 'Talk to the champion about the risk', 'high', '2026-10-07', CARL), T(4712, 'Write down the root cause', 'high', '2026-10-10', CARL)]),
    M(472, 'Act', '2026-10-19', [T(4721, 'Agree a recovery plan with the customer', 'high', '2026-10-15', CARL), T(4722, 'Bring in an executive sponsor', 'medium', '2026-10-19', CARL)]),
    M(473, 'Confirm', '2026-11-04', [T(4731, 'Check health and usage have recovered', 'high', '2026-11-04', CARL)]),
  ],
};
/** Mine, a Draft: the CS agent started it and an undo sent it back, its
 *  three tasks waiting for Start plan. Not in PLANS: a test adds it. */
export const PIZZA_ONBOARDING_DRAFT: StoredPlan = {
  ...BASE, id: 48, name: 'Onboarding · Pizza Hut', kind: 'onboarding', status: 'draft', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: ME, start_date: '2026-10-01', template: { id: 1, name: 'Onboarding' }, created_at: '2026-10-01T09:00:00Z', agent: 'cs',
  milestones: [M(481, 'Kick-off', '2026-10-01', []), M(482, 'Set up', '2026-10-15', [])],
  pending: [
    { milestone: 481, task: T(4811, 'Hold the kick-off call', 'high', '2026-10-01', ME) },
    { milestone: 481, task: T(4812, 'Confirm goals and success criteria', 'high', '2026-10-04', ME) },
    { milestone: 482, task: T(4821, 'Connect data sources', 'high', '2026-10-12', CARL) },
  ],
};

export const PLANS: StoredPlan[] = [GLOBEX_ONBOARDING, INITECH_APAC_SAVE, PIZZA_QBR, GLOBEX_NA_SUCCESS, INITECH_RENEWAL, DANA_PRIVATE_PLAN, PIZZA_EMEA_SAVE];

const NOT_FOUND: Answer = { status: 404, body: { detail: 'Not found.' } };
const bad = (body: unknown): Answer => ({ status: 400, body });
const blank = (value: unknown) => typeof value !== 'string' || !value.trim();
const NAMELESS = { name: [SERVER.CHOOSE_NAME] };
const TITLELESS = { title: [SERVER.NO_TITLE] };
const finished = bad({ non_field_errors: [SERVER.PLAN_FINISHED] });
/** A plan's dates lie from its start to a year after it. */
const dateRefused = (start: string, value: unknown): Answer | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad({ due_date: [SERVER.CHOOSE_DATE] });
  return value < start || value > addDays(start, 365) ? bad({ due_date: [SERVER.DATE_RANGE] }) : null;
};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });
const clonePlan = (plan: StoredPlan): StoredPlan => ({
  ...plan,
  milestones: plan.milestones.map((milestone) => ({ ...milestone, tasks: milestone.tasks.map((one) => ({ ...one })) })),
});
const cloneTemplate = (one: PlanTemplate): PlanTemplate => ({ ...one, milestones: one.milestones.map((m) => ({ ...m, tasks: m.tasks.map((t) => ({ ...t })) })) });

/** The plan as the reader reads it (spec §4 `Plan`). */
function toPlan(plan: StoredPlan): Plan {
  const milestones: Milestone[] = plan.milestones.map((milestone, position) => {
    const seen: PlanTask[] = milestone.tasks
      .filter((one) => one.visible)
      .map((one) => ({ id: one.id, title: one.title, priority: one.priority, status: one.status, due_date: one.due_date, assignee: one.assignee, can_check: one.can_check }));
    return {
      id: milestone.id,
      name: milestone.name,
      position,
      due_date: milestone.due_date,
      done_at: milestone.done_at,
      is_overdue: milestone.done_at === null && milestone.due_date < TODAY,
      tasks: seen,
      hidden_tasks: milestone.tasks.length - seen.length,
      tasks_done: seen.filter((one) => one.status === 'completed').length,
      tasks_total: seen.length,
    };
  });
  const next_due = milestones.filter((m) => m.done_at === null).map((m) => m.due_date).sort()[0] ?? null;
  return {
    id: plan.id,
    name: plan.name,
    kind: plan.kind,
    status: plan.status,
    record: plan.record,
    owner: plan.owner,
    start_date: plan.start_date,
    target_date: plan.milestones.length > 0 ? plan.milestones[plan.milestones.length - 1].due_date : plan.start_date,
    milestones_done: milestones.filter((m) => m.done_at !== null).length,
    milestones_total: milestones.length,
    tasks_done: milestones.reduce((n, m) => n + m.tasks_done, 0),
    tasks_total: milestones.reduce((n, m) => n + m.tasks_total, 0),
    next_due,
    is_overdue: next_due !== null && next_due < TODAY,
    can_edit: plan.can_edit,
    pending_tasks: plan.status === 'draft' ? (plan.pending?.length ?? 0) : 0,
    started_by_agent: plan.agent ?? null,
    template: plan.template,
    started_by: plan.started_by,
    started_by_rule: plan.started_by_rule,
    status_set_by: plan.status_set_by,
    done_at: plan.done_at,
    created_at: plan.created_at,
    milestones,
    hidden_tasks: milestones.reduce((n, m) => n + m.hidden_tasks, 0),
    can_delete: plan.can_edit && !plan.milestones.some((m) => m.tasks.some((one) => one.status === 'completed')),
  };
}

function toRow(plan: StoredPlan): PlanRow {
  const full = toPlan(plan);
  return {
    id: full.id, name: full.name, kind: full.kind, status: full.status, record: full.record, owner: full.owner, start_date: full.start_date,
    target_date: full.target_date, milestones_done: full.milestones_done, milestones_total: full.milestones_total, tasks_done: full.tasks_done,
    tasks_total: full.tasks_total, next_due: full.next_due, is_overdue: full.is_overdue, can_edit: full.can_edit, pending_tasks: full.pending_tasks, started_by_agent: full.started_by_agent,
  };
}

/** Spec §1.2, in brief. A finished plan's status never moves here. */
function progressed(plan: StoredPlan) {
  if (!isOpen(plan.status)) return;
  const any = plan.milestones.some((m) => m.done_at !== null || m.tasks.some((one) => one.status === 'completed'));
  if (plan.status === 'not_started' && any) Object.assign(plan, { status: 'on_track', status_set_by: 'system' });
  if (plan.milestones.length > 0 && plan.milestones.every((m) => m.done_at !== null)) Object.assign(plan, { status: 'done', status_set_by: 'system', done_at: NOW });
}

function settle(plan: StoredPlan, milestone: StoredMilestone) {
  if (milestone.tasks.length > 0) {
    const all = milestone.tasks.every((one) => one.status === 'completed');
    if (all && milestone.done_at === null) Object.assign(milestone, { done_at: NOW, by_hand: false });
    if (!all && milestone.done_at !== null && !milestone.by_hand) milestone.done_at = null;
  }
  progressed(plan);
}

/** A template's milestone list, checked as the backend would (spec §1.1). */
function checkMilestones(milestones: unknown): Answer | null {
  if (!Array.isArray(milestones) || milestones.length === 0 || milestones.length > 12) return bad({ milestones: [SERVER.MILESTONE_COUNT] });
  const list = milestones as TemplateMilestone[];
  if (list.reduce((n, m) => n + m.tasks.length, 0) > 50) return bad({ milestones: [SERVER.TOO_MANY_TASKS] });
  const errors = list.map((m) => {
    const field: Record<string, unknown> = {};
    if (blank(m.name)) field.name = [SERVER.CHOOSE_NAME];
    if (!Number.isInteger(m.offset_days) || m.offset_days < 0 || m.offset_days > 365) field.offset_days = [SERVER.OFFSET_RANGE];
    const tasks = m.tasks.map((one) => (blank(one.title) ? TITLELESS : {}));
    if (tasks.some((one) => Object.keys(one).length > 0)) field.tasks = tasks;
    return field;
  });
  return errors.some((one) => Object.keys(one).length > 0) ? bad({ milestones: errors }) : null;
}

export interface PlansStub {
  plans?: StoredPlan[];
  templates?: PlanTemplate[];
  /** GET /auth/members/ (default MEMBERS: Carl reports to Alice). */
  members?: unknown[];
  /** Rows a page holds (default 50). */
  pageSize?: number;
  /** GET plans/: an answer overrides; undefined falls through. */
  list?: (query: URLSearchParams) => Answer | undefined;
  /** POST plans/: an answer (or a promise of one) overrides; undefined falls through. */
  start?: (body: Record<string, unknown>) => Answer | Promise<Answer> | undefined;
  /** PATCH plans/:id/: an answer overrides; undefined falls through. */
  patch?: (id: number, body: Record<string, unknown>) => Answer | undefined;
  /** DELETE plans/:id/: an answer overrides; undefined falls through. */
  remove?: (id: number) => Answer | undefined;
  /** GET customers/:id/plans/ and accounts/:id/plans/: an answer overrides. */
  recordPlans?: (kind: RecordKind, id: number) => Answer | undefined;
  /** Passed to stubRules for everything this stub does not own. */
  rules?: RulesStub;
}

export function stubPlans(stub: PlansStub = {}) {
  const plans = (stub.plans ?? PLANS).map(clonePlan);
  const templates = (stub.templates ?? TEMPLATES).map(cloneTemplate);
  const pageSize = stub.pageSize ?? 50;
  const rules = stubRules(stub.rules);
  let nextPlan = 500;
  let nextMilestone = 5000;
  let nextTask = 50000;
  let nextTemplate = 900;

  const readable = () => plans.filter((plan) => plan.readable);
  const matching = (query: URLSearchParams, withStatus: boolean) => {
    let rows = readable();
    const kind = query.get('kind');
    if (kind) rows = rows.filter((plan) => plan.kind === kind);
    const owner = query.get('owner');
    if (owner) rows = rows.filter((plan) => plan.owner.id === (owner === 'me' ? ME.id : Number(owner)));
    if (query.get('mine') === 'tasks') rows = rows.filter((plan) => plan.milestones.some((m) => m.tasks.some((one) => one.visible && one.assignee?.id === ME.id)));
    const customer = query.get('customer');
    if (customer) rows = rows.filter((plan) => plan.record.kind === 'organization' && plan.record.id === Number(customer));
    const account = query.get('account');
    if (account) rows = rows.filter((plan) => plan.record.kind === 'account' && plan.record.id === Number(account));
    const q = (query.get('q') ?? '').toLowerCase();
    if (q) rows = rows.filter((plan) => plan.name.toLowerCase().includes(q) || plan.record.name.toLowerCase().includes(q));
    if (withStatus) {
      const asked = query.getAll('status');
      const wanted = new Set<string>((asked.length > 0 ? asked : ['open']).flatMap((status) => (status === 'open' ? [...OPEN_STATUSES] : [status])));
      rows = rows.filter((plan) => wanted.has(plan.status));
    }
    return rows.sort((a, b) => b.id - a.id);
  };

  const templateLists = () => {
    const seen = templates.filter(readableTemplate);
    return { builtin: seen.filter((one) => one.is_builtin), mine: seen.filter((one) => one.is_owner), shared: seen.filter((one) => !one.is_builtin && !one.is_owner) };
  };

  const start = (data: Record<string, unknown>): Answer => {
    const template = templates.find((one) => one.id === data.template && readableTemplate(one));
    if (!template) return bad({ template: [SERVER.CHOOSE_TEMPLATE] });
    const kind: RecordKind | null = data.customer !== undefined && data.account === undefined ? 'organization' : data.account !== undefined && data.customer === undefined ? 'account' : null;
    if (!kind) return bad({ non_field_errors: [SERVER.CHOOSE_RECORD] });
    const record = RECORDS.find((one) => one.kind === kind && one.id === Number(kind === 'organization' ? data.customer : data.account));
    if (!record) return NOT_FOUND;
    if ('name' in data && blank(data.name)) return bad(NAMELESS);
    const clash = plans.find((plan) => plan.template?.id === template.id && plan.record.kind === record.kind && plan.record.id === record.id && isOpen(plan.status));
    if (clash) return { status: 409, body: { code: 'PLAN_OPEN', plan_id: clash.id, detail: SERVER.PLAN_OPEN } };
    const ownerId = Number(data.owner ?? ME.id);
    const owner = active(ownerId);
    if (!owner || cantOpen(record, ownerId)) return bad({ owner: [SERVER.CANT_OPEN] });
    const startDate = typeof data.start_date === 'string' ? data.start_date : TODAY;
    const sent: StartMilestone[] = Array.isArray(data.milestones)
      ? (data.milestones as StartMilestone[])
      : template.milestones.map((m) => ({
          name: m.name,
          due_date: addDays(startDate, m.offset_days),
          tasks: m.tasks.map((one) => ({
            title: one.title,
            priority: one.priority,
            due_date: addDays(startDate, one.offset_days),
            assignee: one.assignee_role === 'record_owner' && record.owner ? record.owner.id : ownerId,
          })),
        }));
    if (sent.length === 0 || sent.length > 12) return bad({ milestones: [SERVER.MILESTONE_COUNT] });
    if (sent.reduce((n, m) => n + m.tasks.length, 0) > 50) return bad({ milestones: [SERVER.TOO_MANY_TASKS] });
    const errors = sent.map((m) => {
      const own: Record<string, unknown> = {};
      if (dateRefused(startDate, m.due_date)) own.due_date = [SERVER.DATE_RANGE];
      const tasks = m.tasks.map((one) => {
        const task: Record<string, string[]> = {};
        if (active(one.assignee) === null || cantOpen(record, one.assignee)) task.assignee = [SERVER.CANT_OPEN];
        if (dateRefused(startDate, one.due_date)) task.due_date = [SERVER.DATE_RANGE];
        return task;
      });
      if (tasks.some((one) => Object.keys(one).length > 0)) own.tasks = tasks;
      return own;
    });
    if (errors.some((one) => Object.keys(one).length > 0)) return bad({ milestones: errors });
    const plan: StoredPlan = {
      ...BASE,
      id: nextPlan++,
      name: typeof data.name === 'string' ? data.name.trim() : defaultPlanName(template.name, record.name),
      kind: template.kind,
      status: 'not_started',
      record: { kind: record.kind, id: record.id, name: record.name },
      owner,
      start_date: startDate,
      template: { id: template.id, name: template.name },
      created_at: NOW,
      milestones: sent.map((m) => M(nextMilestone++, m.name, m.due_date, m.tasks.map((one) => T(nextTask++, one.title, one.priority, one.due_date, active(one.assignee))))),
    };
    plans.push(plan);
    return { status: 201, body: toPlan(plan) };
  };

  const planRoute = (plan: StoredPlan, rest: string, method: string, data: Record<string, unknown>): Answer => {
    const forbidden = { status: 403, body: { detail: NOT_EDITOR } };
    if (rest === '' && method === 'GET') return { status: 200, body: toPlan(plan) };
    if (rest === 'start/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      if (plan.status !== 'draft') return { status: 409, body: { code: 'NOT_DRAFT', detail: SERVER.NOT_DRAFT } };
      const clash = plans.find(
        (other) => other !== plan && plan.template !== null && other.template?.id === plan.template.id && other.record.kind === plan.record.kind && other.record.id === plan.record.id && isOpen(other.status),
      );
      if (clash) return { status: 409, body: { code: 'PLAN_OPEN', plan_id: clash.id, detail: SERVER.PLAN_OPEN } };
      // Each task's due date moves by (today - start_date); start_date becomes today.
      const shift = daysBetween(plan.start_date, TODAY);
      for (const { milestone, task } of plan.pending ?? []) {
        plan.milestones.find((m) => m.id === milestone)?.tasks.push({ ...task, due_date: addDays(task.due_date, shift) });
      }
      Object.assign(plan, { pending: [], status: 'not_started', status_set_by: 'person', start_date: TODAY });
      return { status: 200, body: toPlan(plan) };
    }
    if (rest === '' && method === 'PATCH') {
      const override = stub.patch?.(plan.id, data);
      if (override) return override;
      if (!plan.can_edit) return forbidden;
      if ('status' in data && (plan.status === 'draft' || data.status === 'draft')) return bad({ status: [SERVER.START_DRAFT] });
      if (!isOpen(plan.status) && plan.status !== 'draft') return finished;
      if ('name' in data && blank(data.name)) return bad(NAMELESS);
      if ('owner' in data) {
        const owner = active(Number(data.owner));
        if (!owner || cantOpen(plan.record, Number(data.owner))) return bad({ owner: [SERVER.CANT_OPEN] });
        plan.owner = owner;
      }
      if ('name' in data) plan.name = String(data.name).trim();
      if ('status' in data) {
        const next = data.status as PlanStatus;
        if (next === 'done' && plan.milestones.some((m) => m.done_at === null)) return bad({ status: [SERVER.DONE_NEEDS_MILESTONES] });
        Object.assign(plan, { status: next, status_set_by: 'person', done_at: next === 'done' ? NOW : null });
      }
      return { status: 200, body: toPlan(plan) };
    }
    if (rest === '' && method === 'DELETE') {
      const override = stub.remove?.(plan.id);
      if (override) return override;
      if (!plan.can_edit) return forbidden;
      if (!toPlan(plan).can_delete) return { status: 409, body: { code: 'PLAN_HAS_DONE_WORK', detail: SERVER.HAS_DONE_WORK } };
      plans.splice(plans.indexOf(plan), 1);
      return { status: 204, body: null };
    }
    if (rest === 'save-as-template/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      if (blank(data.name)) return bad(NAMELESS);
      const recordOwner = RECORDS.find((one) => one.kind === plan.record.kind && one.id === plan.record.id)?.owner?.id ?? null;
      const made = withCounts({
        id: nextTemplate++,
        name: String(data.name).trim(),
        kind: plan.kind,
        description: '',
        is_builtin: false,
        is_owner: true,
        owner: ME,
        sharing: (data.sharing as PlanTemplate['sharing'] | undefined) ?? 'private',
        shared_with: ((data.shared_with as number[] | undefined) ?? []).flatMap((id) => (active(id) ? [active(id)!] : [])),
        milestones: plan.milestones.map((m) => ({
          name: m.name,
          offset_days: daysBetween(plan.start_date, m.due_date),
          // Only the tasks the caller can see (Contract note 20).
          tasks: m.tasks.filter((one) => one.visible).map((one) => ({
            title: one.title,
            priority: one.priority,
            offset_days: daysBetween(plan.start_date, one.due_date),
            assignee_role: one.assignee !== null && one.assignee.id === recordOwner ? ('record_owner' as const) : ('plan_owner' as const),
          })),
        })),
        updated_at: NOW,
      });
      templates.push(made);
      return { status: 201, body: made };
    }
    const milestoneOf = (taskId: number) => plan.milestones.find((m) => m.tasks.some((one) => one.id === taskId)) ?? null;
    const statusOnly = Object.keys(data).every((key) => key === 'status');
    const structure = rest.startsWith('milestones/') || (rest.startsWith('tasks/') && !(method === 'PATCH' && statusOnly));
    if (structure && plan.can_edit && !isOpen(plan.status) && plan.status !== 'draft') return finished;
    if (rest === 'milestones/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      if (blank(data.name)) return bad(NAMELESS);
      const late = dateRefused(plan.start_date, data.due_date);
      if (late) return late;
      if (plan.milestones.length >= 12) return bad({ non_field_errors: [SERVER.TOO_MANY_MILESTONES] });
      plan.milestones.push(M(nextMilestone++, String(data.name).trim(), String(data.due_date), []));
      return { status: 201, body: toPlan(plan) };
    }
    if (rest === 'milestones/reorder/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      const order = (data.order as number[] | undefined) ?? [];
      const known = plan.milestones.map((m) => m.id);
      if (order.length !== known.length || !known.every((id) => order.includes(id))) return bad({ order: [SERVER.REORDER] });
      plan.milestones.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      return { status: 200, body: toPlan(plan) };
    }
    const milestoneMatch = /^milestones\/(\d+)\/$/.exec(rest);
    if (milestoneMatch) {
      const milestone = plan.milestones.find((m) => m.id === Number(milestoneMatch[1]));
      if (!milestone) return NOT_FOUND;
      if (!plan.can_edit) return forbidden;
      if (method === 'DELETE') {
        if (plan.milestones.length === 1) return bad({ non_field_errors: [SERVER.LAST_MILESTONE] });
        // Hidden tasks included: work done is never deleted by a milestone.
        if (milestone.tasks.some((one) => one.status === 'completed')) return bad({ non_field_errors: [SERVER.MILESTONE_HAS_DONE_WORK] });
        plan.milestones.splice(plan.milestones.indexOf(milestone), 1);
        progressed(plan);
        return { status: 200, body: toPlan(plan) };
      }
      if (method === 'PATCH') {
        if ('name' in data && blank(data.name)) return bad(NAMELESS);
        if ('due_date' in data) {
          const late = dateRefused(plan.start_date, data.due_date);
          if (late) return late;
        }
        if ('name' in data) milestone.name = String(data.name).trim();
        if ('due_date' in data) milestone.due_date = String(data.due_date);
        if (data.done === true) Object.assign(milestone, { done_at: NOW, by_hand: true });
        if (data.done === false) Object.assign(milestone, { done_at: null, by_hand: false });
        progressed(plan);
        return { status: 200, body: toPlan(plan) };
      }
    }
    if (rest === 'tasks/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      const milestone = plan.milestones.find((m) => m.id === Number(data.milestone));
      if (!milestone) return bad({ milestone: [SERVER.CHOOSE_MILESTONE] });
      if (blank(data.title)) return bad(TITLELESS);
      const late = dateRefused(plan.start_date, data.due_date);
      if (late) return late;
      if (plan.milestones.reduce((n, m) => n + m.tasks.length, 0) >= 50) return bad({ non_field_errors: [SERVER.TOO_MANY_TASKS] });
      const assignee = active(Number(data.assignee));
      if (!assignee || cantOpen(plan.record, assignee.id)) return bad({ assignee: [SERVER.CANT_OPEN] });
      milestone.tasks.push(T(nextTask++, String(data.title).trim(), data.priority as Priority, String(data.due_date), assignee));
      return { status: 201, body: toPlan(plan) };
    }
    const taskMatch = /^tasks\/(\d+)\/$/.exec(rest);
    if (taskMatch) {
      const taskId = Number(taskMatch[1]);
      const milestone = milestoneOf(taskId);
      const one = milestone?.tasks.find((candidate) => candidate.id === taskId);
      if (!milestone || !one || !one.visible) return NOT_FOUND;
      if (method === 'DELETE') {
        if (!plan.can_edit) return forbidden;
        milestone.tasks.splice(milestone.tasks.indexOf(one), 1);
        return { status: 200, body: toPlan(plan) };
      }
      if (method === 'PATCH') {
        const onlyStatus = Object.keys(data).every((key) => key === 'status');
        if (!(plan.can_edit || (onlyStatus && one.can_check))) return forbidden;
        if ('title' in data && blank(data.title)) return bad(TITLELESS);
        if ('due_date' in data) {
          const late = dateRefused(plan.start_date, data.due_date);
          if (late) return late;
        }
        if ('assignee' in data) {
          const assignee = active(Number(data.assignee));
          if (!assignee || cantOpen(plan.record, assignee.id)) return bad({ assignee: [SERVER.CANT_OPEN] });
          one.assignee = assignee;
        }
        if ('title' in data) one.title = String(data.title).trim();
        if ('priority' in data) one.priority = data.priority as Priority;
        if ('due_date' in data) one.due_date = String(data.due_date);
        if ('status' in data) one.status = data.status as TaskStatus;
        if ('milestone' in data && Number(data.milestone) !== milestone.id) {
          const target = plan.milestones.find((m) => m.id === Number(data.milestone));
          if (!target) return bad({ milestone: [SERVER.CHOOSE_MILESTONE] });
          milestone.tasks.splice(milestone.tasks.indexOf(one), 1);
          target.tasks.push(one);
          settle(plan, target);
        }
        settle(plan, milestone);
        return { status: 200, body: toPlan(plan) };
      }
    }
    return NOT_FOUND;
  };

  const templateRoute = (one: PlanTemplate, method: string, data: Record<string, unknown>): Answer => {
    if (method === 'GET') return { status: 200, body: one };
    if (one.is_builtin) return { status: 403, body: { detail: "Built-in templates can't be changed." } };
    if (!one.is_owner) return { status: 403, body: { detail: "Only the template's owner can change it." } };
    if (method === 'DELETE') {
      templates.splice(templates.indexOf(one), 1);
      return { status: 204, body: null };
    }
    if ('name' in data && blank(data.name)) return bad(NAMELESS);
    if ('milestones' in data) {
      const refused = checkMilestones(data.milestones);
      if (refused) return refused;
    }
    const people = 'shared_with' in data ? ((data.shared_with as number[]) ?? []).flatMap((id) => (active(id) ? [active(id)!] : [])) : one.shared_with;
    const sharing = (data.sharing as PlanTemplate['sharing'] | undefined) ?? one.sharing;
    if (sharing === 'people' && people.length === 0) return bad({ shared_with: [SERVER.NO_TEAMMATES] });
    const next = withCounts({ ...one, ...(data as Partial<PlanTemplate>), sharing, shared_with: sharing === 'people' ? people : [], updated_at: NOW });
    templates.splice(templates.indexOf(one), 1, next);
    return { status: 200, body: next };
  };

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const data = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    if (path === '/auth/members/') return json(200, stub.members ?? MEMBERS);
    if (path === '/plans/' && method === 'GET') {
      const override = stub.list?.(url.searchParams);
      if (override) return reply(override);
      const rows = matching(url.searchParams, true);
      const base = matching(url.searchParams, false);
      const startAt = url.searchParams.get('cursor') ? Number(atob(url.searchParams.get('cursor')!)) || 0 : 0;
      const counts = Object.fromEntries(STATUSES.map((status) => [status, base.filter((plan) => plan.status === status).length])) as Record<PlanStatus, number>;
      return json(200, {
        results: rows.slice(startAt, startAt + pageSize).map(toRow),
        next: startAt + pageSize < rows.length ? btoa(String(startAt + pageSize)) : null,
        counts,
      });
    }
    if (path === '/plans/' && method === 'POST') {
      const override = await stub.start?.(data);
      return reply(override ?? start(data));
    }
    if (path === '/plans/templates/' && method === 'GET') return json(200, templateLists());
    if (path === '/plans/templates/' && method === 'POST') {
      if (blank(data.name)) return reply(bad(NAMELESS));
      const refused = checkMilestones(data.milestones);
      if (refused) return reply(refused);
      const people = ((data.shared_with as number[] | undefined) ?? []).flatMap((id) => (active(id) ? [active(id)!] : []));
      if (data.sharing === 'people' && people.length === 0) return reply(bad({ shared_with: [SERVER.NO_TEAMMATES] }));
      if (templates.filter((one) => one.is_owner).length >= 50) return reply(bad({ non_field_errors: [SERVER.TEMPLATE_LIMIT] }));
      const made = withCounts({
        id: nextTemplate++,
        name: String(data.name).trim(),
        kind: data.kind as PlanKind,
        description: String(data.description ?? ''),
        is_builtin: false,
        is_owner: true,
        owner: ME,
        sharing: data.sharing as PlanTemplate['sharing'],
        shared_with: data.sharing === 'people' ? people : [],
        milestones: data.milestones as TemplateMilestone[],
        updated_at: NOW,
      });
      templates.push(made);
      return json(201, made);
    }
    const templateMatch = /^\/plans\/templates\/(\d+)\/$/.exec(path);
    if (templateMatch) {
      const one = templates.find((candidate) => candidate.id === Number(templateMatch[1]));
      if (!one || !readableTemplate(one)) return reply(NOT_FOUND);
      return reply(templateRoute(one, method, data));
    }
    const recordPlans = /^\/(customers|accounts)\/(\d+)\/plans\/$/.exec(path);
    if (recordPlans && method === 'GET') {
      const kind: RecordKind = recordPlans[1] === 'customers' ? 'organization' : 'account';
      const id = Number(recordPlans[2]);
      const override = stub.recordPlans?.(kind, id);
      if (override) return reply(override);
      if (!RECORDS.some((one) => one.kind === kind && one.id === id)) return reply(NOT_FOUND);
      const rows = readable()
        .filter((plan) => plan.record.kind === kind && plan.record.id === id)
        .sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)) || b.id - a.id)
        .map(toRow);
      return json(200, { results: rows });
    }
    const recordRead = /^\/(customers|accounts)\/(\d+)\/$/.exec(path);
    if (recordRead && method === 'GET') {
      const kind: RecordKind = recordRead[1] === 'customers' ? 'organization' : 'account';
      const found = RECORDS.find((one) => one.kind === kind && one.id === Number(recordRead[2]));
      return found ? json(200, { id: found.id, name: found.name, owner: found.owner }) : reply(NOT_FOUND);
    }
    const planMatch = /^\/plans\/(\d+)\/(.*)$/.exec(path);
    if (planMatch) {
      const plan = plans.find((candidate) => candidate.id === Number(planMatch[1]));
      // A plan on a record the reader can't open reads as missing, on every sub-path.
      if (!plan || !plan.readable) return reply(NOT_FOUND);
      return reply(planRoute(plan, planMatch[2], method, data));
    }
    return rules.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, runNight: rules.runNight, plansOf: () => plans };
}

export type PlansSpy = ReturnType<typeof stubPlans>['spy'];
