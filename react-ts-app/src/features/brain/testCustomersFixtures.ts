// Test-only: §3-shaped "What customers are saying" on 5 Oct 2026, by scope:
// Alice's own book (Me: nothing yet), her desk with Carl (My team), the
// company; and Carl's own book for the CSM journeys. /requests/ and
// /anomalies/ answer per scope from the same names (their `arr` a string,
// Contract note 2), and the graph per scope (Contract note 8). Names are
// companies and people, never personal data.
import { requestRow } from '../../test/requestsFixtures';
import type { AnomalyRow } from '../anomalies/anomaliesApi';
import type { GraphNode, GraphPayload } from '../graph/graphTypes';
import type { FeatureRequestRow } from '../requests/types';
import type { CustomerAsk, CustomersPayload, ScopeKey, TurnedNegative } from './brainTypes';

export const TRACKING_SINCE = '2026-08-01';
const UBER = { type: 'customer' as const, id: 3, name: 'Uber' };
const APPLE = { type: 'customer' as const, id: 6, name: 'Apple Inc' };
const PIZZA_HUT = { type: 'customer' as const, id: 7, name: 'Pizza Hut' };
const GLOBEX = { type: 'account' as const, id: 9, name: 'Globex EMEA' };

const OLIVIA: TurnedNegative = { contact: { id: 41, name: 'Olivia Park' }, record: APPLE, previous: 'neutral', changed_at: '2026-10-02T07:00:00Z' };
const SAM: TurnedNegative = { contact: { id: 52, name: 'Sam Lee' }, record: GLOBEX, previous: 'positive', changed_at: '2026-09-28T09:00:00Z' };

const ask = (id: number, title: string, status: CustomerAsk['status'], arr: number, companies: number, last: number, previous: number): CustomerAsk => ({
  id, title, status, arr, companies, last_90_days: last, previous_90_days: previous,
});
const SSO_TEAM = ask(2, 'SSO with Okta', 'planned', 182000, 3, 12, 7);
const SSO_CARL = ask(2, 'SSO with Okta', 'planned', 120000, 2, 8, 5);
const SLACK = ask(4, 'Slack alerts', 'open', 40000, 1, 2, 2);
const CSV = ask(5, 'CSV export', 'open', 150000, 2, 3, 0);
const AUDIT = ask(8, 'Audit log', 'shipped', 90000, 2, 0, 0);
const DARK = ask(11, 'Dark mode', 'declined', 20000, 1, 1, 4);
const USAGE = ask(13, 'Usage export', 'open', 10000, 1, 1, 0);
const SAML = ask(14, 'SAML', 'open', 5000, 1, 0, 1);

const GATED = { id: 4, title: 'Similar reports across 2 of your companies', status: 'live' as const, arr: 90000, companies: 2, last_seen_at: '2026-10-04T10:00:00Z' };
const SSO_FAILURES = { id: 4, title: 'SSO login failures', status: 'live' as const, arr: 300000, companies: 6, last_seen_at: '2026-10-04T10:00:00Z' };
const SLOW_SUPPORT = { survey_type: 'nps' as const, score: 4, comment: 'Support is slow lately.', record: UBER, answered_at: '2026-10-03T08:00:00Z' };

/** Alice's own book: nothing yet, every empty state. */
export const ME_CUSTOMERS: CustomersPayload = {
  scope: 'me', currency: 'USD',
  asks: { total: 0, top: [] },
  anomalies: { total: 0, top: [] },
  scores: {
    nps: { now: null, then: null, responses: 2, previous_responses: 1 },
    csat: { now: null, then: null, responses: 3, previous_responses: 0 },
    ces: { now: null, then: null, responses: 0, previous_responses: 0 },
    comments: [], hidden: 0,
  },
  sentiment: { negative: 0, tracking_since: TRACKING_SINCE, turned_negative: [] },
};

export const TEAM_CUSTOMERS: CustomersPayload = {
  scope: 'team', currency: 'USD',
  asks: { total: 2, top: [SSO_TEAM, SLACK] },
  anomalies: { total: 1, top: [GATED] },
  scores: {
    nps: { now: 18, then: 25, responses: 22, previous_responses: 19 },
    csat: { now: 82.5, then: 80, responses: 40, previous_responses: 31 },
    // CES counts organisation-level answers only (Contract note 5).
    ces: { now: null, then: null, responses: 3, previous_responses: 0 },
    comments: [SLOW_SUPPORT], hidden: 1,
  },
  sentiment: { negative: 4, tracking_since: TRACKING_SINCE, turned_negative: [OLIVIA] },
};

export const COMPANY_CUSTOMERS: CustomersPayload = {
  scope: 'company', currency: 'USD',
  asks: { total: 7, top: [SSO_TEAM, CSV, AUDIT, SLACK, DARK] },
  anomalies: { total: 1, top: [SSO_FAILURES] },
  scores: {
    nps: { now: 30, then: 30, responses: 80, previous_responses: 70 },
    csat: { now: 84, then: 86, responses: 120, previous_responses: 100 },
    ces: { now: 72.35, then: 65, responses: 30, previous_responses: 25 },
    comments: [{ survey_type: 'ces', score: 6, comment: 'Setup took one call.', record: GLOBEX, answered_at: '2026-10-04T08:00:00Z' }, SLOW_SUPPORT],
    hidden: 0,
  },
  sentiment: { negative: 9, tracking_since: TRACKING_SINCE, turned_negative: [OLIVIA, SAM] },
};

/** Carl's Me: his own book, smaller than his manager's My team. */
export const CARL_CUSTOMERS: CustomersPayload = {
  scope: 'me', currency: 'USD',
  asks: { total: 2, top: [SSO_CARL, SLACK] },
  anomalies: { total: 1, top: [GATED] },
  scores: {
    nps: { now: 10, then: null, responses: 6, previous_responses: 2 },
    csat: { now: 90, then: 85, responses: 8, previous_responses: 6 },
    ces: { now: null, then: null, responses: 0, previous_responses: 0 },
    comments: [{ survey_type: 'csat', score: 5, comment: 'Onboarding was quick.', record: PIZZA_HUT, answered_at: '2026-10-02T09:00:00Z' }],
    hidden: 0,
  },
  sentiment: { negative: 1, tracking_since: TRACKING_SINCE, turned_negative: [OLIVIA] },
};

export const CUSTOMERS: Record<ScopeKey, CustomersPayload> = { me: ME_CUSTOMERS, team: TEAM_CUSTOMERS, company: COMPANY_CUSTOMERS };

/** The same asks as /requests/ rows: `arr` a decimal string (Contract note 2). */
const row = (a: CustomerAsk): FeatureRequestRow =>
  requestRow({ id: a.id, title: a.title, status: a.status, arr: String(a.arr), companies: a.companies, interactions: a.last_90_days + a.previous_90_days, last_90_days: a.last_90_days, previous_90_days: a.previous_90_days, summary: '' });

export const REQUEST_ROWS: Record<ScopeKey, FeatureRequestRow[]> = {
  me: [],
  team: [row(SSO_TEAM), row(SLACK)],
  company: [SSO_TEAM, CSV, AUDIT, SLACK, DARK, USAGE, SAML].map(row),
};
export const CARL_REQUEST_ROWS: FeatureRequestRow[] = [row(SSO_CARL), row(SLACK)];

export function anomalyRow(overrides: Partial<AnomalyRow> = {}): AnomalyRow {
  return {
    id: 4, title: 'SSO login failures', summary: '', status: 'live', arr: '300000', companies: 6, interactions: 11,
    first_seen_at: '2026-09-28T09:00:00Z', last_seen_at: '2026-10-04T10:00:00Z', acknowledged_by: null, ...overrides,
  };
}

export const ANOMALY_ROWS: Record<ScopeKey, AnomalyRow[]> = {
  me: [],
  team: [anomalyRow({ title: GATED.title, arr: '90000', companies: 2, interactions: 3 })],
  company: [anomalyRow()],
};

/** Carl's book: 6 nodes, 6 relations (owner:5 is Carl, Contract note 9). */
export const CARL_GRAPH: GraphPayload = {
  as_of: '2026-10-05', currency: 'USD', hidden: 0,
  nodes: [
    { id: 'owner:5', kind: 'owner', label: 'Carl CSM', customers: 2, arr: 169_600, downside: 17_400 },
    { id: 'customer:7', kind: 'customer', label: 'Pizza Hut', arr: 69_600, downside: 17_400, risk: 0.25, health_category: 'average', health_score: 5.1, days_to_renewal: -34, open_tasks: 1 },
    { id: 'customer:8', kind: 'customer', label: 'Fine', arr: 100_000, downside: 0, risk: 0.05, health_category: 'good', health_score: 8.5, days_to_renewal: 200, open_tasks: 0 },
    { id: 'product:4', kind: 'product', label: 'Analytics Suite', customers: 2, arr: 169_600, downside: 17_400 },
    { id: 'initiative:1', kind: 'initiative', label: 'Halve the ARR at risk on Analytics Suite', status: 'active', metric: 'at_risk_arr', metric_label: 'ARR at risk', member_label: 'Analytics Suite', target_value: 32_000, target_by: '2026-11-30', owner: 'Carl CSM' },
    { id: 'agent_action:5', kind: 'agent_action', label: 'Save play on Pizza Hut', agent: 'cs', action_kind: 'task.create', action_id: 5 },
  ],
  edges: [
    { from: 'owner:5', to: 'customer:7', kind: 'owns' },
    { from: 'owner:5', to: 'customer:8', kind: 'owns' },
    { from: 'customer:7', to: 'product:4', kind: 'runs_on' },
    { from: 'customer:8', to: 'product:4', kind: 'runs_on' },
    { from: 'initiative:1', to: 'product:4', kind: 'targets' },
    { from: 'agent_action:5', to: 'customer:7', kind: 'acts_on' },
  ],
};

const ALICE_OWNER = { id: 'owner:1', kind: 'owner' as const, label: 'Alice Admin', customers: 1, arr: 50_000, downside: 0 };
const UBER_NODE = { id: 'customer:3', kind: 'customer' as const, label: 'Uber', arr: 50_000, downside: 0, risk: 0.05, health_category: 'good' as const, health_score: 8, days_to_renewal: 120, open_tasks: 0 };

/** Alice's own book: 3 nodes, 2 relations. */
export const ME_GRAPH: GraphPayload = {
  as_of: '2026-10-05', currency: 'USD', hidden: 0,
  nodes: [ALICE_OWNER, UBER_NODE, { id: 'product:4', kind: 'product', label: 'Analytics Suite', customers: 1, arr: 50_000, downside: 0 }],
  edges: [{ from: 'owner:1', to: 'customer:3', kind: 'owns' }, { from: 'customer:3', to: 'product:4', kind: 'runs_on' }],
};

/** Alice and Carl: 8 nodes, 8 relations. */
export const TEAM_GRAPH: GraphPayload = {
  ...CARL_GRAPH,
  nodes: [...CARL_GRAPH.nodes, ALICE_OWNER, UBER_NODE],
  edges: [...CARL_GRAPH.edges, ...ME_GRAPH.edges],
};

/** The company: 10 nodes, 10 relations; 2 customers this reader can't open. */
export const COMPANY_GRAPH: GraphPayload = {
  ...TEAM_GRAPH,
  hidden: 2,
  nodes: [
    ...TEAM_GRAPH.nodes,
    { id: 'owner:7', kind: 'owner', label: 'Dana CSM', customers: 1, arr: 40_000, downside: 0 },
    { id: 'customer:12', kind: 'customer', label: 'Globex', arr: 40_000, downside: 0, risk: 0.1, health_category: 'good', health_score: 7.4, days_to_renewal: 300, open_tasks: 0 },
  ],
  edges: [...TEAM_GRAPH.edges, { from: 'owner:7', to: 'customer:12', kind: 'owns' }, { from: 'customer:12', to: 'product:4', kind: 'runs_on' }],
};

export const EMPTY_GRAPH: GraphPayload = { as_of: '2026-10-05', currency: 'USD', hidden: 0, nodes: [], edges: [] };

/** Agents delivery 3: a builder action, workspace-level, so no relation.
 *  Not in any default graph, so their counts stay. */
export const SEGMENT_ACTION_NODE: GraphNode = {
  id: 'agent_action:94', kind: 'agent_action', label: 'Build a segment of poor health renewals', agent: 'ops', action_kind: 'segment.create', action_id: 94,
};
/** Final review #2: every live customer in this scope is one the reader can't open. */
export const HIDDEN_EMPTY_GRAPH: GraphPayload = { as_of: '2026-10-05', currency: 'USD', hidden: 3, nodes: [], edges: [] };
export const GRAPHS: Record<ScopeKey, GraphPayload> = { me: ME_GRAPH, team: TEAM_GRAPH, company: COMPANY_GRAPH };
