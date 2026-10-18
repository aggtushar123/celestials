import { vi } from 'vitest';
import { LIFECYCLE_VALUES } from './portfolioParams';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type {
  BulkRequest,
  BulkResult,
  HealthBand,
  LifecycleValue,
  Option,
  PortfolioResponse,
  PortfolioRow,
  PortfolioSummary,
} from './portfolioTypes';

// Test-only: §2-shaped rows and a fetch stub that answers the portfolio,
// export, bulk, customer and members endpoints the way the backend does.

export const pizzaHut: PortfolioRow = {
  id: 7,
  name: 'Pizza Hut',
  initials: 'PH',
  owner: { id: 2, name: 'Carl CSM' },
  lifecycle: { value: 'live', label: 'Live' },
  health: { score: 4.9, category: 'average', trend: [6.2, 5.8, 5.5, 5.1, 5.0, 4.9] },
  renewal: { date: '2026-08-09', days: -47 },
  arr: 69600,
  risk: { score: 73, direction: 'declining' },
  pulse: {
    csm: 3,
    ai: 1,
    ai_category: 'high_risk',
    ai_label: 'High Risk',
    reason: 'Usage fell after the admin left.',
    history: [1, 2, 2],
    disagree: true,
  },
  last_touch_days: 33,
  urgent_tickets: 0,
  signal: { kind: 'renewal_overdue', label: 'Renewal overdue' },
  is_archived: false,
  churned: false,
  details: {
    commercial: {
      currency: 'USD',
      arr_billed_at_account: 69600,
      arr_billed_at_hq: 72000,
      total_contract_value: 140000,
      total_forecasted_renewal_revenue: 73080,
      implementation_fee: 5000,
    },
    contract: {
      joined_date: '2024-08-01',
      contract_start_date: '2024-08-09',
      renewal_date: '2026-08-09',
      contract_end_date: '2026-08-09',
    },
    adoption: {
      total_contracted_seats: 100,
      total_active_seats: 16,
      seat_utilization_percentage: 16,
      total_hires: 4,
      products: { primary: { id: 1, name: 'Hiring' }, additional_count: 1 },
      scope_web_app: 'Full',
    },
    voice: { nps_score: -80, csat_score: 62, ces_percentage: 71, ai_pulse_reason: 'Usage fell after the admin left.' },
    profile: { revenact_id: 7, domain: 'pizzahut.example', address: 'Plano, TX', top_source_channel: 'Direct Sales' },
    history: {
      created_by: { id: 1, name: 'Alice Admin' },
      created_at: '2024-08-01T09:00:00Z',
      modified_by: { id: 2, name: 'Carl CSM' },
      updated_at: '2026-09-01T10:00:00Z',
      churn_date: null,
      churn_reason: '',
      churn_reason_label: '',
      churn_comment: '',
    },
  },
};

export const globex: PortfolioRow = {
  ...pizzaHut,
  id: 1,
  name: 'Globex',
  initials: 'GL',
  owner: { id: 3, name: 'Priya' },
  lifecycle: { value: 'adoption', label: 'Adoption' },
  health: { score: 8.2, category: 'good', trend: [7.9, 8.0, 8.1, 8.1, 8.2, 8.2] },
  renewal: { date: '2027-01-23', days: 120 },
  arr: 120000,
  risk: { score: 12, direction: 'flat' },
  pulse: { csm: 4, ai: 4, ai_category: 'satisfied', ai_label: 'Satisfied', reason: 'Steady usage.', history: [1, 1, 1], disagree: false },
  last_touch_days: 2,
  signal: null,
  details: {
    ...pizzaHut.details,
    profile: { revenact_id: 1, domain: 'globex.example', address: 'Chicago, IL', top_source_channel: 'Partner' },
  },
};

export const initech: PortfolioRow = {
  ...pizzaHut,
  id: 2,
  name: 'Initech',
  initials: 'IN',
  owner: null,
  lifecycle: { value: 'churn', label: 'Churn' },
  health: { score: 2.8, category: 'poor', trend: [4.0, 3.6, 3.1, 2.9, 2.8, 2.8] },
  renewal: { date: null, days: null },
  arr: 30000,
  risk: { score: 62, direction: 'declining' },
  pulse: { csm: 1, ai: 2, ai_category: 'moderate', ai_label: 'Moderate', reason: 'No logins in a month.', history: [2, 2, 0], disagree: false },
  last_touch_days: null,
  // Churned rows carry no signal (backend pre-flight #18).
  signal: null,
  churned: true,
  details: {
    ...pizzaHut.details,
    profile: { revenact_id: 2, domain: 'initech.example', address: 'Austin, TX', top_source_channel: 'Inbound' },
    history: {
      ...pizzaHut.details.history,
      churn_date: '2026-07-01',
      churn_reason: 'budget',
      churn_reason_label: 'Budget cuts',
      churn_comment: 'Lost the budget line.',
    },
  },
};

export const ALL_ROWS: PortfolioRow[] = [pizzaHut, globex, initech];

export const FILTER_OPTIONS: PortfolioResponse['filters'] = {
  owners: [
    { value: '2', name: 'Carl CSM' },
    { value: '3', name: 'Priya' },
    { value: 'unassigned', name: 'Unassigned' },
  ],
  lifecycles: [
    { value: 'adoption', name: 'Adoption' },
    { value: 'live', name: 'Live' },
    { value: 'churn', name: 'Churn' },
  ],
  products: [{ value: '1', name: 'Hiring' }] satisfies Option[],
};

const BAND_ORDER: HealthBand[] = ['poor', 'average', 'good'];
const BAND_LABEL: Record<HealthBand, string> = { poor: 'Poor', average: 'Average', good: 'Good' };
const sumArr = (rows: PortfolioRow[]) => rows.reduce((total, row) => total + (row.arr ?? 0), 0);

function summarise(rows: PortfolioRow[]): PortfolioSummary {
  const band = (b: HealthBand) => rows.filter((row) => row.health.category === b);
  const money = (divisor: number) => ({
    good: sumArr(band('good')) / divisor,
    average: sumArr(band('average')) / divisor,
    poor: sumArr(band('poor')) / divisor,
  });
  const stages = new Map<LifecycleValue, string>(rows.map((row) => [row.lifecycle.value, row.lifecycle.label]));
  const within = (days: number) => rows.filter((row) => row.renewal.days !== null && row.renewal.days <= days).length;
  return {
    health: { good: band('good').length, average: band('average').length, poor: band('poor').length, arr: money(1), mrr: money(12) },
    nps: { score: 44, promoters: 6, passives: 1, detractors: 2 },
    lifecycle: [...stages].map(([value, label]) => ({
      value,
      label,
      count: rows.filter((row) => row.lifecycle.value === value).length,
      arr: sumArr(rows.filter((row) => row.lifecycle.value === value)),
    })),
    accounts: rows.length,
    arr: sumArr(rows),
    unconverted_count: 0,
    renewing: { '30': within(30), '90': within(90) },
  };
}

/** What the backend answers for `query`, over `rows`: filters, health groups
 *  (Poor, Average, Good), whole-set summary, `group_value` scoping, and a
 *  cursor (opaque to the page; an offset here). */
/** The `owner` group key: the owner's id, or 'unassigned'. */
const ownerKey = (row: PortfolioRow) => (row.owner ? String(row.owner.id) : 'unassigned');

export function buildPortfolio(query: URLSearchParams, rows: PortfolioRow[] = ALL_ROWS): PortfolioResponse {
  const list = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean);
  const ids = list('ids').map(Number);
  const health = list('health');
  const lifecycle = list('lifecycle');
  const owner = query.get('owner') ?? '';
  const search = (query.get('search') ?? '').toLowerCase();
  const churnIncluded = query.get('include_churned') === '1' || lifecycle.includes('churn') || ids.length > 0;
  const set = rows.filter(
    (row) =>
      (churnIncluded || !row.churned) &&
      (ids.length === 0 || ids.includes(row.id)) &&
      (health.length === 0 || health.includes(row.health.category)) &&
      (lifecycle.length === 0 || lifecycle.includes(row.lifecycle.value)) &&
      (!search || row.name.toLowerCase().includes(search)) &&
      (!owner || (owner === 'unassigned' ? row.owner === null : String(row.owner?.id) === owner)),
  );
  const group = query.get('group') ?? '';
  // Only `health` scopes group_value for real (Task 1's parked note) — this
  // adds `lifecycle` too (T13 fix round 1: a test needs more than 4 groups
  // to exercise "only the first section starts open").
  const groups =
    group === 'health'
      ? BAND_ORDER.map((band) => ({ band, rows: set.filter((row) => row.health.category === band) }))
          .filter((g) => g.rows.length > 0)
          .map((g) => ({ key: g.band, label: BAND_LABEL[g.band], count: g.rows.length, arr: sumArr(g.rows) }))
      : group === 'lifecycle'
        ? LIFECYCLE_VALUES.map((value) => set.filter((row) => row.lifecycle.value === value))
            .filter((groupRows) => groupRows.length > 0)
            .map((groupRows) => ({
              key: groupRows[0].lifecycle.value,
              label: groupRows[0].lifecycle.label,
              count: groupRows.length,
              arr: sumArr(groupRows),
            }))
        : group === 'owner'
          ? [...new Set(set.map(ownerKey))].map((key) => {
              const groupRows = set.filter((row) => ownerKey(row) === key);
              return { key, label: groupRows[0].owner?.name ?? 'Unassigned', count: groupRows.length, arr: sumArr(groupRows) };
            })
          : [];
  const groupValue = query.get('group_value');
  const scoped =
    groupValue && group === 'health'
      ? set.filter((row) => row.health.category === groupValue)
      : groupValue && group === 'lifecycle'
        ? set.filter((row) => row.lifecycle.value === groupValue)
        : groupValue && group === 'owner'
          ? set.filter((row) => ownerKey(row) === groupValue)
          : set;
  const limit = Number(query.get('limit') ?? 50);
  const start = Number(query.get('cursor') ?? 0);
  return {
    results: scoped.slice(start, start + limit),
    next_cursor: start + limit < scoped.length ? String(start + limit) : null,
    count: set.length,
    groups,
    summary: summarise(set),
    filters: FILTER_OPTIONS,
    currency: 'USD',
  };
}

/** A GET /customers/<id>/ body, enough for OrganizationFormModal's edit form. */
export const customerFixture = {
  id: 7,
  name: 'Pizza Hut',
  address: 'Plano, TX',
  domain: 'pizzahut.example',
  industry: '',
  email: '',
  phone: '',
  owner: null,
  created_by: null,
  modified_by: null,
  created_at: '2024-08-01T09:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  lifecycle_stage: 'live',
  currency: 'USD',
  joined_date: '2024-08-01',
  renewal_date: '2026-08-09',
  contract_start_date: '2024-08-09',
  contract_end_date: '2026-08-09',
  is_archived: false,
};

export interface PortfolioStub {
  /** Answer the portfolio endpoint. Return `{status, body}` for an error. */
  portfolio?: (query: URLSearchParams) => PortfolioResponse | { status: number; body: unknown };
  bulk?: (body: BulkRequest) => BulkResult;
  customer?: unknown;
  /** GET /auth/members/ (the bulk owner targets). */
  members?: unknown[];
  /** The book the default portfolio answer reads (default ALL_ROWS). It is
   *  copied, and a PATCH to /customers/<id>/ writes into the copy, so a
   *  reload after a move sees the move. */
  rows?: PortfolioRow[];
  /** Answer PATCH /customers/<id>/ yourself (for a failure, say). */
  patch?: (id: number, body: Record<string, unknown>) => { status: number; body: unknown };
}

/** What PATCH /customers/<id>/ does to the stub's book: a new stage. Churn
 *  marks the row churned, and a churned row carries no signal (backend rule). */
function applyPatch(book: PortfolioRow[], id: number, body: Record<string, unknown>) {
  const index = book.findIndex((row) => row.id === id);
  if (index < 0) return { status: 404, body: { detail: 'Not found.' } };
  const stage = body.lifecycle_stage as LifecycleValue | undefined;
  if (stage) {
    const churned = book[index].churned || stage === 'churn';
    book[index] = {
      ...book[index],
      lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] },
      churned,
      signal: churned ? null : book[index].signal,
    };
  }
  return {
    status: 200,
    body: { ...customerFixture, id, name: book[index].name, lifecycle_stage: book[index].lifecycle.value },
  };
}

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

export function stubPortfolio(stub: PortfolioStub = {}) {
  const book = [...(stub.rows ?? ALL_ROWS)];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/organizations/portfolio/') {
      const out = (stub.portfolio ?? ((q: URLSearchParams) => buildPortfolio(q, book)))(url.searchParams);
      return 'results' in out ? json(200, out) : json(out.status, out.body);
    }
    if (path === '/organizations/portfolio/export.csv') {
      return {
        ok: true,
        status: 200,
        json: async () => null,
        blob: async () => new Blob(['id,name\n7,Pizza Hut\n'], { type: 'text/csv' }),
      };
    }
    if (path === '/organizations/bulk/' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as BulkRequest;
      return json(200, (stub.bulk ?? ((b: BulkRequest) => ({ updated: b.ids, failed: [] })))(body));
    }
    const customer = /^\/customers\/(\d+)\/$/.exec(path);
    if (customer && init?.method === 'PATCH') {
      const id = Number(customer[1]);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const out = stub.patch ? stub.patch(id, body) : applyPatch(book, id, body);
      return json(out.status, out.body);
    }
    if (customer && stub.customer) return json(200, stub.customer);
    if (path === '/auth/members/') return json(200, stub.members ?? []);
    return json(404, { detail: `Not stubbed: ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchSpy = ReturnType<typeof stubPortfolio>;

/** Every portfolio request so far, as parsed query strings, oldest first. */
export function portfolioQueries(spy: FetchSpy): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/organizations/portfolio/'))
    .map((url) => url.searchParams);
}

export function bulkBodies(spy: FetchSpy): BulkRequest[] {
  return spy.mock.calls
    .filter(([input, init]) => String(input).endsWith('/organizations/bulk/') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as BulkRequest);
}

/** Every PATCH /customers/<id>/ so far, oldest first. */
export function patchBodies(spy: FetchSpy): { id: number; body: Record<string, unknown> }[] {
  return spy.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input)).pathname, init }))
    .filter(({ path, init }) => init?.method === 'PATCH' && /\/customers\/\d+\/$/.test(path))
    .map(({ path, init }) => ({
      id: Number(/\/customers\/(\d+)\/$/.exec(path)![1]),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    }));
}
