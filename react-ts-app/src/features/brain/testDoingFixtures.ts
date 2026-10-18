// Test-only: §3-shaped "What's being done" on 5 Oct 2026. Alice (1)
// manages Carl (5); Bob (2) manages Dana (7). Initiatives live in one
// mutable world the stub filters per reader and scope (spec Decision 2), so
// a second reader sees what the first started; plans, rules and `hidden`
// are fixed per scope, in the server's order (open first, then the last 30
// days' done). Names are people, plans, rules and records, never personal data.
//
// Controller override (real backend contract, wins over the brief):
// `doing/` carries a top-level `trackable` — the registry's owner-cut
// metrics (forecast_arr, nrr, at_risk_arr, healthy_share, poor_health_count)
// — rather than a fixed list in doingText.ts (doingText has no
// OWNER_CUT_METRICS export); TRACKABLE_METRICS here is that list, used both
// as the fixture's `trackable` and by the stub to validate a book start.
import type { MetricsPayload } from '../metrics/metricsSlice';
import type {
  BookInitiativeWrite,
  DeskMember,
  DoingInitiative,
  DoingPayload,
  DoingPlan,
  DoingRule,
  InitiativeWrite,
  ScopeKey,
  TrackableMetric,
} from './brainTypes';
import { ALICE, CARL, DANA } from './testDeskFixtures';

export const BOB = { id: 2, name: 'Bob Lead' };
export const FIRST_NEW_ID = 100;

export const MEMBERS: DeskMember[] = [
  { id: 1, name: 'Alice Admin', reports_to: null, is_active: true },
  { id: 2, name: 'Bob Lead', reports_to: null, is_active: true },
  { id: 5, name: 'Carl CSM', reports_to: { id: 1, name: 'Alice Admin' }, is_active: true },
  { id: 7, name: 'Dana CSM', reports_to: { id: 2, name: 'Bob Lead' }, is_active: true },
];

/** The registry's owner-cut metrics (controller override): the book-mode
 *  "New initiative" form's choices, and `doing/`'s own `trackable`. */
export const TRACKABLE_METRICS: TrackableMetric[] = [
  { key: 'forecast_arr', label: 'Forecast ARR', unit: 'money', better: 'up' },
  { key: 'nrr', label: 'Net revenue retention', unit: 'percent', better: 'up' },
  { key: 'at_risk_arr', label: 'ARR at risk', unit: 'money', better: 'down' },
  { key: 'healthy_share', label: 'Healthy share', unit: 'percent', better: 'up' },
  { key: 'poor_health_count', label: 'Customers in poor health', unit: 'count', better: 'down' },
];

export const ALICE_INITIATIVE: DoingInitiative = {
  id: 1, title: 'Fewer customers in poor health', metric: 'poor_health_count', metric_label: 'Customers in poor health',
  for: { dimension: 'owner', member: '1', label: 'Alice Admin' }, status: 'active', owner: ALICE, target_by: '2026-12-31',
  progress: { baseline: 6, current: 5, target: 2, progress_pct: 25, days_left: 87, direction: 'down', unit: 'count', better: 'down' },
  work: { open: 0, done: 0, tasks: [] }, hypothesis: 'Weekly check-ins lift health.', outcome: '', can_edit: true,
};

export const CARL_INITIATIVE: DoingInitiative = {
  id: 3, title: 'Halve ARR at risk on Analytics Suite', metric: 'at_risk_arr', metric_label: 'ARR at risk',
  for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, status: 'active', owner: CARL, target_by: '2026-11-30',
  progress: { baseline: 64100, current: 52000, target: 32000, progress_pct: 37.7, days_left: 56, direction: 'down', unit: 'money', better: 'down' },
  work: {
    open: 1,
    done: 1,
    tasks: [
      { id: 21, title: 'Save play: Pizza Hut', parent_name: 'Pizza Hut', parent_type: 'customer', parent_id: 6, assignee_name: 'Carl CSM', due_date: '2026-10-20', priority: 'high', status: 'pending' },
      { id: 20, title: 'Usage review', parent_name: 'Uber EMEA', parent_type: 'account', parent_id: 12, assignee_name: 'Carl CSM', due_date: '2026-09-25', priority: 'medium', status: 'completed' },
    ],
  },
  hypothesis: 'Save plays on the two renewals halve the risk.', outcome: '', can_edit: true,
};

export const COMPANY_INITIATIVE: DoingInitiative = {
  id: 4, title: 'Lift NRR to 110%', metric: 'nrr', metric_label: 'Net revenue retention', for: null, status: 'planned',
  owner: null, target_by: '2026-12-31',
  progress: { baseline: 104, current: 104, target: 110, progress_pct: 0, days_left: 87, direction: 'up', unit: 'percent', better: 'up' },
  work: { open: 0, done: 0, tasks: [] }, hypothesis: '', outcome: '', can_edit: true,
};

/** Controller item (c): on Carl's book (visible on Alice's My team), but
 *  tracking a company-wide cut the reader can't see — the server sends no
 *  `for` and no `progress` for it, rather than guessing a figure it has no
 *  right to show. */
export const OUTSIDE_VIEW_INITIATIVE: DoingInitiative = {
  id: 11, title: 'Lift company NRR from the ground up', metric: 'nrr', metric_label: 'Net revenue retention',
  for: null, status: 'active', owner: CARL, target_by: '2026-12-31',
  progress: null, work: { open: 0, done: 0, tasks: [] }, hypothesis: '', outcome: '', can_edit: true,
};

/** An owner-cut initiative a reader who can't use Company reads before it
 *  captured a baseline (final review follow-up): `current`, `target`,
 *  `days_left`, `unit`, `better` and `direction` are all present, but
 *  `baseline` and `progress_pct` are null, unlike OUTSIDE_VIEW_INITIATIVE's
 *  `progress: null` above. */
export const NO_BASELINE_INITIATIVE: DoingInitiative = {
  id: 12, title: 'Grow the healthy share', metric: 'healthy_share', metric_label: 'Healthy share',
  for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, status: 'active', owner: CARL, target_by: '2026-12-15',
  progress: { baseline: null, current: 72, target: 85, progress_pct: null, days_left: 71, direction: 'up', unit: 'percent', better: 'up' },
  work: { open: 0, done: 0, tasks: [] }, hypothesis: '', outcome: '', can_edit: true,
};

export const DANA_INITIATIVE: DoingInitiative = {
  id: 5, title: "Clear Dana's at-risk book", metric: 'at_risk_arr', metric_label: 'ARR at risk',
  for: { dimension: 'owner', member: '7', label: 'Dana CSM' }, status: 'done', owner: DANA, target_by: '2026-09-30',
  progress: { baseline: 20000, current: 0, target: 0, progress_pct: 100, days_left: -5, direction: 'down', unit: 'money', better: 'down' },
  work: { open: 0, done: 2, tasks: [] }, hypothesis: '', outcome: 'Both renewals saved.', can_edit: true,
};

// Controller note: health_score is 0-10 (one decimal, per e1f93d0), not 0-100.
export const CARL_PLAN: DoingPlan = {
  id: 8, name: 'Renewal save play', status: 'at_risk', record: { type: 'customer', id: 6, name: 'Pizza Hut' }, owner: CARL,
  target_date: '2026-11-01', milestones: { done: 1, total: 4 },
  then: { health_score: 4.8, arr: 69600, taken_on: '2026-09-20' }, now: { health_score: 5.5, arr: 69600 },
};

/** Started before starting figures were kept (spec Decision 4). */
export const ALICE_PLAN: DoingPlan = {
  id: 9, name: 'Onboarding', status: 'on_track', record: { type: 'account', id: 12, name: 'Uber EMEA' }, owner: ALICE,
  target_date: '2026-10-30', milestones: { done: 3, total: 5 }, then: null, now: { health_score: 7.1, arr: 44000 },
};

export const DANA_PLAN: DoingPlan = {
  id: 10, name: 'QBR prep', status: 'done', record: { type: 'customer', id: 3, name: 'Uber' }, owner: DANA,
  target_date: '2026-09-15', milestones: { done: 2, total: 2 },
  then: { health_score: 6.2, arr: 40000, taken_on: '2026-09-01' }, now: { health_score: 7.1, arr: 44000 },
};

export const MY_DOING_RULE: DoingRule = {
  id: 3, name: 'Detractor follow-up', segment: 'Detractors', is_active: true, paused_reason: null, paused_message: null, mine: true, readable: true,
  last_run: { run_on: '2026-10-05', fired: 4, matched: 12, skipped: 2 },
};
export const CARL_DOING_RULE: DoingRule = {
  id: 6, name: 'Renewal nudge', segment: 'Renewals in 90 days', is_active: false, paused_reason: 'segment_gone', paused_message: 'Its segment was deleted.', mine: false, readable: false,
  last_run: { run_on: '2026-10-04', fired: 1 },
};
export const DANA_DOING_RULE: DoingRule = {
  id: 8, name: 'Win-back watch', segment: null, is_active: true, paused_reason: null, paused_message: null, mine: false, readable: false, last_run: null,
};
/** Carl's own rule, not Alice's — but she manages him, so the server marks
 *  it `readable` (controller override, fix round 2: link on `readable`,
 *  not `mine`), unlike CARL_DOING_RULE above (fix round 1: a rule shared
 *  with, but not owned by, the reader). */
export const CARL_READABLE_RULE: DoingRule = {
  id: 9, name: 'Expansion watch', segment: 'Expansion candidates', is_active: true, paused_reason: null, paused_message: null, mine: false, readable: true,
  last_run: { run_on: '2026-10-03', fired: 2 },
};

export type DoingRest = Pick<DoingPayload, 'plans' | 'rules' | 'hidden'>;
export const DOING_REST: Record<ScopeKey, DoingRest> = {
  me: { plans: [ALICE_PLAN], rules: [MY_DOING_RULE], hidden: 0 },
  team: { plans: [CARL_PLAN, ALICE_PLAN], rules: [MY_DOING_RULE, CARL_DOING_RULE, CARL_READABLE_RULE], hidden: 0 },
  company: { plans: [CARL_PLAN, ALICE_PLAN, DANA_PLAN], rules: [MY_DOING_RULE, CARL_DOING_RULE, CARL_READABLE_RULE, DANA_DOING_RULE], hidden: 2 },
};

export interface DoingWorld {
  initiatives: DoingInitiative[];
  nextId: number;
}

/** A fresh, mutable world; copies, so a test never changes the fixtures. */
export function doingWorld(initiatives: DoingInitiative[] = [ALICE_INITIATIVE, CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE]): DoingWorld {
  return { initiatives: initiatives.map((one) => ({ ...one })), nextId: FIRST_NEW_ID };
}

/** The baseline a new initiative captures, per metric. */
export const STARTING_VALUE: Record<string, number> = {
  at_risk_arr: 52000, forecast_arr: 300000, nrr: 104, healthy_share: 60, poor_health_count: 3, active_customers: 40,
};

export const METRIC_LIST: MetricsPayload = {
  as_of: '2026-10-05',
  currency: 'USD',
  metrics: [
    { key: 'at_risk_arr', label: 'ARR at risk', unit: 'money', better: 'down', note: '', value: 114540, previous: null, change: null, dimensions: ['owner', 'product'] },
    { key: 'nrr', label: 'Net revenue retention', unit: 'percent', better: 'up', note: '', value: 104, previous: null, change: null, dimensions: ['owner', 'product'] },
    { key: 'active_customers', label: 'Active customers', unit: 'count', better: 'none', note: '', value: 40, previous: null, change: null, dimensions: ['segment', 'lifecycle'] },
  ],
};

export const BOOK_BODY: BookInitiativeWrite = {
  title: 'Halve ARR at risk on my book', hypothesis: 'Save plays on the two renewals.', metric: 'at_risk_arr',
  target_value: '26000', target_by: '2026-11-30', status: 'active',
};

export const COMPANY_BODY: InitiativeWrite = {
  title: "Cut Carl's ARR at risk", hypothesis: '', metric: 'at_risk_arr', dimension: 'owner', member: '5',
  target_value: '30000', target_by: '2026-12-31', owner_id: 5,
};
