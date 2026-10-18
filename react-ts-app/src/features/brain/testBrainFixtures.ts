// Test-only: §4-shaped payloads for a manager (Alice, view_all_accounts, one
// report) on 5 Oct 2026, compared with the 30 Sep month-end. Names are
// owners, products and segments only, never customers (spec §1.4).
import type { ChangedMetric, ChangedPayload, ChangedSignal, MetricUnit, ScopeBrief, ScopeExplanation, ScopeKey, Better } from './brainTypes';

export const AS_OF = '2026-10-05';
export const MONTH_END = '2026-09-30';
export const LABELS: Record<ScopeKey, string> = { me: 'Me', team: 'My team', company: 'Company' };
export const METRIC_KEYS = ['arr', 'arr_at_risk', 'expansion', 'nrr', 'usage'];

function metric(key: string, label: string, unit: MetricUnit, better: Better, now: number | null, then: number | null, material = false): ChangedMetric {
  return { key, label, unit, better, now, then, change: now === null || then === null ? null : now - then, material };
}

export const AT_RISK_SIGNAL: ChangedSignal = {
  key: 'arr_at_risk', label: 'ARR at risk', unit: 'money', better: 'down', now: 114540, then: 64090, change: 50450, improved: false,
  drivers: [{ dimension: 'product', member: '4', label: 'Analytics Suite', change: 50450 }],
};

export const EXPANSION_SIGNAL: ChangedSignal = {
  key: 'expansion', label: 'Expansion ARR', unit: 'money', better: 'up', now: 42000, then: 30000, change: 12000, improved: true,
  drivers: [{ dimension: 'segment', member: 'enterprise', label: 'Enterprise', change: 9000 }],
};

export const COMPANY: ChangedPayload = {
  scope: 'company', as_of: AS_OF, since: MONTH_END, since_kind: 'month_end', team_changed_on: null, currency: 'USD', empty: false,
  metrics: [
    metric('arr', 'ARR', 'money', 'up', 688600, 702000),
    metric('arr_at_risk', 'ARR at risk', 'money', 'down', 114540, 64090, true),
    metric('expansion', 'Expansion ARR', 'money', 'up', 42000, 30000, true),
    metric('nrr', 'Net revenue retention', 'percent', 'up', 104, 108),
    metric('usage', 'Weekly active usage', 'percent', 'up', null, null),
  ],
  // Bad news first, as the server orders them.
  signals: [AT_RISK_SIGNAL, EXPANSION_SIGNAL],
};

export const TEAM: ChangedPayload = {
  ...COMPANY,
  scope: 'team',
  metrics: [
    metric('arr', 'ARR', 'money', 'up', 240000, 251000),
    metric('arr_at_risk', 'ARR at risk', 'money', 'down', 90000, 40000, true),
    metric('usage', 'Weekly active usage', 'percent', 'up', null, null),
  ],
  signals: [
    {
      ...AT_RISK_SIGNAL, now: 90000, then: 40000, change: 50000,
      drivers: [{ dimension: 'product', member: '4', label: 'Analytics Suite', change: 50000 }],
      handover: { in: 0, out: 2, people: ['Dana CSM'] },
    },
  ],
};

/** Alice's first look at Me: a baseline taken today, nothing material. */
export const ME_BASELINE: ChangedPayload = {
  ...COMPANY,
  scope: 'me',
  since: AS_OF,
  since_kind: 'baseline',
  metrics: [
    metric('arr', 'ARR', 'money', 'up', 120000, 120000),
    metric('arr_at_risk', 'ARR at risk', 'money', 'down', 12000, 11000),
    metric('usage', 'Weekly active usage', 'percent', 'up', null, null),
  ],
  signals: [],
};

export const ME_EMPTY: ChangedPayload = {
  ...ME_BASELINE,
  empty: true,
  metrics: ME_BASELINE.metrics.map((m) => ({ ...m, now: null, then: null, change: null })),
};

export const TEAM_RESET: ChangedPayload = {
  ...TEAM,
  as_of: '2026-10-12',
  since: '2026-10-12',
  since_kind: 'baseline',
  team_changed_on: '2026-10-12',
  metrics: TEAM.metrics.map((m) => ({ ...m, then: m.now, change: m.now === null ? null : 0, material: false })),
  signals: [],
};

/** Company before its first month-end (§4: `since` null, every `then` null). */
export const COMPANY_FIRST: ChangedPayload = {
  ...COMPANY,
  since: null,
  metrics: COMPANY.metrics.map((m) => ({ ...m, then: null, change: null, material: false })),
  signals: [],
};

export const COMPANY_BRIEF: ScopeBrief = {
  id: 9, scope: 'company', as_of: AS_OF, baseline: MONTH_END,
  headline: 'Risk rose on Analytics Suite',
  body: 'ARR at risk rose by $50.5K since the month-end.\n\nEnterprise expansion offset part of it.',
  watch: ['Analytics Suite renewals in November'],
  generated_at: '2026-10-05T09:12:00Z', generated_by: 'Alice Admin', stale: false,
};

export const ME_STALE_BRIEF: ScopeBrief = {
  ...COMPANY_BRIEF, id: 10, scope: 'me', headline: 'Your book held steady', generated_at: '2026-10-01T09:00:00Z', stale: true,
};

/** The tiles' metrics under the registry's real keys
 *  (revenact-backend services/metrics/registry.py), out of order, with one
 *  key the tiles skip (active_customers) and a withheld NRR. */
export const TILE_METRICS: ChangedMetric[] = [
  metric('active_customers', 'Active customers', 'count', 'none', 40, 41),
  metric('healthy_share', 'Book in good health', 'percent', 'up', 62, 60),
  metric('at_risk_arr', 'ARR at risk', 'money', 'down', 114540, 64090, true),
  metric('nrr', 'Net revenue retention', 'percent', 'up', null, 108),
  metric('active_arr', 'ARR', 'money', 'up', 688600, 702000),
];

export const COMPANY_TILES: ChangedPayload = { ...COMPANY, metrics: TILE_METRICS };

export const COMPANY_EXPLANATION: ScopeExplanation = {
  id: 4, metric: 'arr_at_risk', scope: 'company', as_of: AS_OF,
  text: 'Two Analytics Suite renewals slipped into the risk band.',
  evidence: ['ARR at risk 64,090 to 114,540'], hidden: 0,
  generated_at: '2026-10-05T09:20:00Z', generated_by: 'Alice Admin', stale: false,
};
