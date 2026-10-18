// Test-only: the people, records and tasks the Work tests share. Alice
// (id 1) is makeRulesStore's default user; Carl and Dana report to her.
import type { ScopeKey } from '../brain/brainTypes';
import { ACT_CANVAS_CREATE, ACT_DRAFT_TICKET, ACT_LIFECYCLE, ACT_PLAN_START, ACT_SEGMENT_CREATE, ACT_TASK_CREATE } from '../agents/testAgentsFixtures';
import type { AssigneeOption, PersonRef, RecommendationRow, TaskDetail, TaskEvent, TaskParent, TaskPerson, WorkSettings } from './workTypes';

export const TODAY = '2026-10-07';
export const NOW = '2026-10-07T10:00:00.000000Z';

export const ALICE: TaskPerson = { id: 1, name: 'Alice', active: true };
export const MONA: TaskPerson = { id: 2, name: 'Mona Manager', active: true };
export const CARL: TaskPerson = { id: 3, name: 'Carl CSM', active: true };
export const DANA: TaskPerson = { id: 4, name: 'Dana CSM', active: true };
export const ERIN_GONE: TaskPerson = { id: 5, name: 'Erin Former', active: false };

export const refOf = (person: TaskPerson): PersonRef => ({ id: person.id, name: person.name });

export const PIZZA: TaskParent = { kind: 'customer', id: 7, name: 'Pizza Hut' };
export const UBER: TaskParent = { kind: 'account', id: 9, name: 'Uber EMEA' };

const PRIORITY_DISPLAY = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const STATUS_DISPLAY = { pending: 'Pending', 'in-progress': 'In Progress', blocked: 'Blocked', completed: 'Completed' } as const;

export function taskEvent(id: number, kind: TaskEvent['kind'], actor: PersonRef | null, data: Record<string, unknown>, body = '', created_at = NOW): TaskEvent {
  return { id, kind, actor, data, body, created_at };
}

/** A task as GET /tasks/<id>/ answers it, on Pizza Hut and Alice's unless `over` says otherwise. */
export function taskDetail(over: Partial<TaskDetail> & Pick<TaskDetail, 'id' | 'title' | 'due_date'>): TaskDetail {
  // An explicit `parent: null` stays null (a to-do).
  const parent = over.parent === undefined ? PIZZA : over.parent;
  const assignee = over.assignee === undefined ? ALICE : over.assignee;
  const priority = over.priority ?? 'medium';
  const status = over.status ?? 'pending';
  return {
    description: '',
    priority,
    priority_display: PRIORITY_DISPLAY[priority],
    status,
    status_display: STATUS_DISPLAY[status],
    blocked_reason: '',
    source: 'manual',
    parent,
    parent_name: parent ? parent.name : null,
    parent_type: parent ? parent.kind : null,
    private: parent === null,
    assignee,
    assignee_name: assignee?.name ?? '',
    created_by: refOf(MONA),
    created_at: '2026-10-01T08:00:00.000000Z',
    plan: null,
    milestone: null,
    initiative: null,
    // A to-do's editable list ends in "record" (contract §1.3).
    editable: parent ? ['title', 'description', 'status', 'due_date', 'priority', 'assignee'] : ['title', 'description', 'status', 'due_date', 'priority', 'assignee', 'record'],
    events: [],
    ...over,
  };
}

export const CALL_PIZZA = taskDetail({
  id: 41,
  title: 'Call Pizza Hut',
  due_date: '2026-10-05',
  priority: 'high',
  events: [taskEvent(1, 'created', refOf(MONA), { source: 'manual', assignee: refOf(ALICE) }, '', '2026-10-01T08:00:00.000000Z')],
});
export const QBR_DECK = taskDetail({ id: 42, title: 'Send the QBR deck', due_date: TODAY, status: 'in-progress' });
export const RENEWAL_PRICING = taskDetail({ id: 43, title: 'Prep renewal pricing', due_date: '2026-10-10', priority: 'low', parent: UBER });
export const ROADMAP = taskDetail({ id: 44, title: 'Plan the 2027 roadmap review', due_date: '2026-11-20' });
export const SECURITY = taskDetail({ id: 45, title: 'Get the security review signed', due_date: '2026-10-01', status: 'blocked', blocked_reason: 'Waiting on legal' });
export const CARL_CHASE = taskDetail({ id: 46, title: 'Chase the exec sponsor', due_date: '2026-10-03', priority: 'high', assignee: CARL });
export const KICKOFF = taskDetail({
  id: 47,
  title: 'Kick-off call',
  due_date: '2026-10-08',
  source: 'plan',
  plan: { id: 12, name: 'Onboarding · Pizza Hut' },
  milestone: { id: 120, name: 'Start' },
  editable: ['status'],
});
export const ERIN_OLD = taskDetail({ id: 48, title: 'Close the onboarding ticket', due_date: '2026-10-02', assignee: ERIN_GONE });

export const WORK_TASKS: TaskDetail[] = [CALL_PIZZA, QBR_DECK, RENEWAL_PRICING, ROADMAP, SECURITY, CARL_CHASE, KICKOFF, ERIN_OLD];

/** GET /work/assignees/: every active member by name; Dana can't open the records. */
export const ASSIGNEES: AssigneeOption[] = [
  { id: 1, name: 'Alice', function: 'cs', can_open: true },
  { id: 3, name: 'Carl CSM', function: 'cs', can_open: true },
  { id: 4, name: 'Dana CSM', function: 'cs', can_open: false },
  { id: 2, name: 'Mona Manager', function: 'leadership', can_open: true },
];

/** The people of each scope (Me, Alice's team, the workspace). */
export const TEAM_PEOPLE: Record<ScopeKey, TaskPerson[]> = {
  me: [ALICE],
  team: [ALICE, CARL, DANA, ERIN_GONE],
  company: [ALICE, MONA, CARL, DANA, ERIN_GONE],
};

function member(person: TaskPerson, reportsTo: TaskPerson | null) {
  return {
    id: person.id,
    name: person.name,
    email: `${person.name.split(' ')[0].toLowerCase()}@acme.io`,
    avatar: '',
    role: 'csm',
    role_id: 1,
    role_name: 'CSM',
    permissions: [],
    function: 'cs',
    function_display: 'Customer Success',
    reports_to: reportsTo ? refOf(reportsTo) : null,
    is_active: person.active,
  };
}

/** GET /auth/members/: Alice has reports (Carl and Dana). */
export const MEMBERS = [member(ALICE, MONA), member(MONA, null), member(CARL, ALICE), member(DANA, ALICE)];

/** GET /customers/?search= and /accounts/?search= (New task's record search). */
export const RECORDS = {
  customers: [{ id: 7, name: 'Pizza Hut' }],
  accounts: [{ id: 9, name: 'Uber EMEA' }],
};

/** A recommendation as GET /work/recommendations/ lists it: on Pizza Hut,
 *  suggested for Carl, in Alice's queue, unless `over` says otherwise. */
export function recRow(over: Partial<RecommendationRow> & Pick<RecommendationRow, 'id' | 'kind' | 'title'>): RecommendationRow {
  // An explicit `record: null` stays null (an agent action with no record).
  const record = over.record === undefined ? PIZZA : over.record;
  return {
    why: { facts: [], evidence: record ? [{ label: record.name, link: record.kind === 'customer' ? `/organizations/${record.id}` : `/accounts/${record.id}` }] : [] },
    record,
    suggested_assignee: { ...refOf(CARL), active: true, can_open: true },
    recipient: refOf(ALICE),
    defaults: { title: over.title, due_date: '2026-10-12', priority: 'high' },
    agent_action: null,
    created_at: NOW,
    ...over,
  };
}

/** In Alice's queue, suggested for Carl, who can open Pizza Hut. */
export const REC_RENEWAL = recRow({
  id: 5,
  kind: 'renewal_due',
  title: "Prepare Pizza Hut's renewal",
  why: { facts: ['Renews in 9 days', 'Renewal date 16 Oct'], evidence: [{ label: 'Pizza Hut', link: '/organizations/7' }] },
  defaults: { title: "Prepare Pizza Hut's renewal", due_date: '2026-10-09', priority: 'high' },
  created_at: '2026-10-07T00:05:00.000000Z',
});

/** In Alice's queue, suggested for Dana, who can no longer open Uber EMEA. */
export const REC_TICKETS = recRow({
  id: 6,
  kind: 'urgent_tickets',
  title: "Get Uber EMEA's urgent tickets moving",
  record: UBER,
  why: { facts: ['3 urgent tickets open', 'Oldest opened 6 days ago'], evidence: [{ label: 'Uber EMEA', link: '/accounts/9' }] },
  suggested_assignee: { ...refOf(DANA), active: true, can_open: false },
  defaults: { title: "Get Uber EMEA's urgent tickets moving", due_date: '2026-10-12', priority: 'high' },
  created_at: '2026-10-06T00:05:00.000000Z',
});

/** The AI agent's proposal 22, in Carl's own queue: Alice decides it as his manager. */
export const REC_AGENT = recRow({
  id: 7,
  kind: 'agent_action',
  title: 'Call Pizza Hut about the renewal',
  why: { facts: [], evidence: [] },
  recipient: refOf(CARL),
  defaults: { title: 'Call Pizza Hut about the renewal', due_date: '2026-10-14', priority: 'medium' },
  agent_action: { ...ACT_TASK_CREATE, id: 22 },
  created_at: '2026-10-05T00:05:00.000000Z',
});

/** The CS agent's lifecycle change on Pizza Hut, in Alice's queue: Apply or Reject (no defaults). */
export const REC_AGENT_LIFECYCLE: RecommendationRow = recRow({
  id: 6,
  kind: 'agent_action',
  title: 'Move Pizza Hut to Renewal',
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_LIFECYCLE,
});

/** The CS agent's plan start on Pizza Hut (Ask is its cap): Apply or Reject. */
export const REC_AGENT_PLAN: RecommendationRow = recRow({
  id: 8,
  kind: 'agent_action',
  title: 'Start the Onboarding plan on Pizza Hut',
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_PLAN_START,
});

/** The CS agent's reply on a Zendesk ticket, waiting on Ask. */
export const REC_AGENT_DRAFT: RecommendationRow = recRow({
  id: 9,
  kind: 'agent_action',
  title: 'Draft a reply on TKT-1042',
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_DRAFT_TICKET,
});

/** The CS agent's map of Pizza Hut's people, waiting on Ask (Agents delivery 3). */
export const REC_AGENT_CANVAS: RecommendationRow = recRow({
  id: 12,
  kind: 'agent_action',
  title: ACT_CANVAS_CREATE.title,
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_CANVAS_CREATE,
});

/** An agent action with no record. The contract keeps these out of
 *  Recommended; the card must still not crash on one (Decision 5). */
export const REC_AGENT_NO_RECORD: RecommendationRow = recRow({
  id: 13,
  kind: 'agent_action',
  title: ACT_SEGMENT_CREATE.title,
  record: null,
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_SEGMENT_CREATE,
});

export const RECOMMENDATIONS: RecommendationRow[] = [REC_RENEWAL, REC_TICKETS, REC_AGENT];

/** GET /work/settings/ with the spec §2.1 defaults, for an admin. */
export const WORK_SETTINGS: WorkSettings = {
  recommend_to: 'manager',
  sources: {
    renewal_due: { enabled: true, days: 30 },
    health_drop: { enabled: true, drop: 0.5, window_days: 14 },
    urgent_tickets: { enabled: true, min: 1 },
    anomaly: { enabled: true },
  },
  dismiss_cooldown_days: 14,
  timezone: 'UTC',
  working_days: [0, 1, 2, 3, 4],
  escalate_after_days: 2,
  digest_enabled: true,
  digest_hour: 8,
  email_ready: true,
  can_edit: true,
};
