// Contract-shaped response bodies for the Overview's tests, plus a fetch stub
// routed by path the way the real backend is.
import { vi } from 'vitest';

export const attentionBody = {
  items: [
    {
      key: 'renewal:12',
      kind: 'renewal',
      title: 'Uber',
      reason: 'renewal 45 days overdue · health Average',
      at_stake: 42_000,
      urgency: 1,
      score: 42_000,
      customer_id: 12,
      companies: [],
      fingerprint: { band: 'average' },
    },
  ],
  currency: 'USD',
  filters: {
    owners: [{ value: '2', name: 'Carl CSM' }],
    lifecycles: [{ value: 'customer_active', name: 'Active' }],
    customers: [{ value: '12', name: 'Uber' }],
  },
};

export const forecastBody = {
  horizon_days: 365,
  bridge: {
    opening_arr: 924_700,
    churn: 175_430,
    contraction: 33_120,
    expansion: 131_880,
    forecast_arr: 848_030,
    net_change: -76_670,
    nrr: 91.7,
  },
  scenarios: { worst: 150_200, likely: 848_030, best: 1_189_900 },
  pipeline: [],
  swing: [],
  accounts: 12,
  renewing_count: 10,
  unpriced_count: 0,
  currency: 'USD',
  filters: { owners: [], lifecycles: [], customers: [] },
};

function healthRow(id: number, name: string, ownerId: number, category: 'good' | 'average' | 'poor', triage: number) {
  return {
    id,
    name,
    owner_id: ownerId,
    owner_name: ownerId === 2 ? 'Carl CSM' : 'Dana CSM',
    lifecycle_stage: 'customer_active',
    lifecycle_stage_display: 'Active',
    renewal_date: null,
    health_score: category === 'good' ? '80' : '30',
    health_category: category,
    csm_pulse_score: null,
    csm_pulse_modified_at: null,
    ai_pulse_value: null,
    ai_pulse_reason: '',
    arr: 10_000,
    days_since_touch: 5,
    risk_of_loss: 0,
    risk_factors: [],
    total_active_seats: null,
    triage_score: triage,
    triage_factors: [],
    triage_direction: 'flat',
    history: [],
  };
}

export const healthBody = {
  results: [
    healthRow(12, 'Uber', 2, 'poor', 60),
    healthRow(7, 'Pizza Hut', 2, 'good', 0),
    healthRow(9, 'Shopify', 2, 'good', 5),
    // Another owner's account: filtered out by owner=2.
    healthRow(3, 'Lyft', 3, 'poor', 90),
  ],
  count: 4,
  history_months: 6,
  truncated: false,
  currency: 'USD',
  unconverted_count: 0,
};

export const ticketStatsBody = {
  kpis: {
    total: 14,
    on_hold: 1,
    avg_lifetime_days: 3.2,
    resolution_rate: 71,
    positive_sentiment: 40,
    negative_sentiment: 10,
    open_count: 4,
    oldest_open_days: 9,
  },
  priority: [],
  status: [],
  origin: [],
  assignees: [],
  sentiment_timeline: [],
  filters: { owners: [], customers: [], accounts: [], connectors: [], priorities: [] },
};

/** A global `fetch` stub answering each Overview endpoint by path. `fail`
 *  names paths that answer 500 instead. */
export function mockOverviewFetch(fail: string[] = []) {
  const bodies: [string, unknown][] = [
    ['/dashboard/attention/', attentionBody],
    ['/customers/forecast/', forecastBody],
    ['/customers/health/', healthBody],
    ['/tickets/stats/', ticketStatsBody],
  ];
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url: string) => {
    const hit = bodies.find(([path]) => url.includes(path));
    const failed = fail.some((path) => url.includes(path));
    const status = failed || !hit ? 500 : 200;
    return Promise.resolve({
      ok: status === 200,
      status,
      json: async () => (status === 200 ? hit![1] : { detail: 'Server error' }),
    });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

export const urlsFor = (spy: ReturnType<typeof mockOverviewFetch>, path: string) =>
  spy.mock.calls.map(([url]) => url).filter((url) => url.includes(path));
