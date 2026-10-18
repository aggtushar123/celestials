import { vi } from 'vitest';
import type { Account } from '../customers/customersSlice';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import { LIFECYCLE_VALUES } from '../organizations/portfolioParams';
import type { BulkResult, HealthBand, LifecycleValue, PortfolioGroup, PortfolioSummary } from '../organizations/portfolioTypes';
import type { AccountBulkRequest, AccountFilterOptions, AccountPortfolioResponse, AccountPortfolioRow } from './portfolioTypes';

// Test-only: rows shaped like backend #74's GET /accounts/portfolio/ and a
// fetch stub that answers the portfolio, export, bulk, single-account read,
// update and create, organisation list and members endpoints the way the
// backend does. A PATCH writes into the stub's copy of the book, so a reload
// after a move or an edit sees it.

export const pizzaEmea: AccountPortfolioRow = {
  id: 12,
  name: 'Pizza EMEA',
  initials: 'PE',
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
  organisation: { id: 7, name: 'Pizza Hut' },
  extra_organisations: 1,
  details: {
    commercial: { arr: 69600, renewal_date: '2026-08-09' },
    voice: { nps_score: -80, csat_score: 62, ai_pulse_reason: 'Usage fell after the admin left.' },
    profile: {
      revenact_id: 12,
      domain: 'emea.pizzahut.example',
      industry: 'Restaurants',
      email: 'emea@pizzahut.example',
      phone: '+1 555 0100',
      address: 'London, UK',
      organisations: [
        { id: 7, name: 'Pizza Hut' },
        { id: 9, name: 'Yum Brands' },
      ],
    },
    history: {
      created_at: '2024-08-01T09:00:00+00:00',
      updated_at: '2026-09-01T10:00:00+00:00',
      pulse_recorded_on: '2026-09-20',
      csm_pulse_modified_at: '2026-09-18T08:00:00+00:00',
    },
  },
};

export const globexNa: AccountPortfolioRow = {
  ...pizzaEmea,
  id: 13,
  name: 'Globex NA',
  initials: 'GN',
  owner: { id: 3, name: 'Priya' },
  lifecycle: { value: 'adoption', label: 'Adoption' },
  health: { score: 8.2, category: 'good', trend: [7.9, 8.0, 8.1, 8.1, 8.2, 8.2] },
  renewal: { date: '2027-01-23', days: 120 },
  arr: 120000,
  risk: { score: 12, direction: 'flat' },
  pulse: { csm: 4, ai: 4, ai_category: 'satisfied', ai_label: 'Satisfied', reason: 'Steady usage.', history: [1, 1, 1], disagree: false },
  last_touch_days: 2,
  signal: null,
  organisation: { id: 1, name: 'Globex' },
  extra_organisations: 0,
  details: {
    commercial: { arr: 120000, renewal_date: '2027-01-23' },
    voice: { nps_score: 40, csat_score: 88, ai_pulse_reason: 'Steady usage.' },
    profile: { revenact_id: 13, domain: '', industry: '', email: '', phone: '', address: '', organisations: [{ id: 1, name: 'Globex' }] },
    history: {
      created_at: '2025-01-10T09:00:00+00:00',
      updated_at: '2026-09-20T10:00:00+00:00',
      pulse_recorded_on: null,
      csm_pulse_modified_at: null,
    },
  },
};

/** An account the viewer may open (they own it) under organisations they
 *  may not: `organisation` is null and none are named. */
export const initechApac: AccountPortfolioRow = {
  ...pizzaEmea,
  id: 14,
  name: 'Initech APAC',
  initials: 'IA',
  owner: null,
  lifecycle: { value: 'churn', label: 'Churn' },
  health: { score: 2.8, category: 'poor', trend: [4.0, 3.6, 3.1, 2.9, 2.8, 2.8] },
  renewal: { date: null, days: null },
  arr: 30000,
  risk: { score: 62, direction: 'declining' },
  pulse: { csm: null, ai: null, ai_category: null, ai_label: '', reason: '', history: [], disagree: false },
  last_touch_days: null,
  signal: null,
  organisation: null,
  extra_organisations: 0,
  details: {
    commercial: { arr: 30000, renewal_date: null },
    voice: { nps_score: null, csat_score: null, ai_pulse_reason: '' },
    profile: { revenact_id: 14, domain: '', industry: '', email: '', phone: '', address: '', organisations: [] },
    history: {
      created_at: '2023-03-01T09:00:00+00:00',
      updated_at: '2026-06-01T10:00:00+00:00',
      pulse_recorded_on: null,
      csm_pulse_modified_at: null,
    },
  },
};

export const ACCOUNT_ROWS: AccountPortfolioRow[] = [pizzaEmea, globexNa, initechApac];

export const ACCOUNT_FILTER_OPTIONS: AccountFilterOptions = {
  organisations: [
    { value: '1', name: 'Globex' },
    { value: '7', name: 'Pizza Hut' },
    { value: '9', name: 'Yum Brands' },
  ],
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
};

const BAND_ORDER: HealthBand[] = ['poor', 'average', 'good'];
const BAND_LABEL: Record<HealthBand, string> = { poor: 'Poor', average: 'Average', good: 'Good' };
const sumArr = (rows: AccountPortfolioRow[]) => rows.reduce((total, row) => total + (row.arr ?? 0), 0);
const ownerKey = (row: AccountPortfolioRow) => (row.owner ? String(row.owner.id) : 'unassigned');

function summarise(rows: AccountPortfolioRow[]): PortfolioSummary {
  const band = (b: HealthBand) => rows.filter((row) => row.health.category === b);
  const money = (divisor: number) => ({
    good: sumArr(band('good')) / divisor,
    average: sumArr(band('average')) / divisor,
    poor: sumArr(band('poor')) / divisor,
  });
  const within = (days: number) => rows.filter((row) => row.renewal.days !== null && row.renewal.days <= days).length;
  return {
    health: { good: band('good').length, average: band('average').length, poor: band('poor').length, arr: money(1), mrr: money(12) },
    nps: { score: 20, promoters: 1, passives: 0, detractors: 1 },
    lifecycle: LIFECYCLE_VALUES.map((value) => {
      const stage = rows.filter((row) => row.lifecycle.value === value);
      return { value, label: LIFECYCLE_LABELS[value], count: stage.length, arr: sumArr(stage) };
    }),
    accounts: rows.length,
    arr: sumArr(rows),
    unconverted_count: 0,
    renewing: { '30': within(30), '90': within(90) },
  };
}

function inGroup(group: string, key: string, row: AccountPortfolioRow): boolean {
  if (group === 'health') return row.health.category === key;
  if (group === 'lifecycle') return row.lifecycle.value === key;
  if (group === 'owner') return ownerKey(row) === key;
  return true;
}

function groupLabel(group: string, key: string, row: AccountPortfolioRow): string {
  if (group === 'health') return BAND_LABEL[key as HealthBand];
  if (group === 'lifecycle') return row.lifecycle.label;
  return row.owner?.name ?? 'Unassigned';
}

/** What the backend answers for `query` over `rows`: filters (organisation
 *  included; nothing hidden for churn), non-empty groups only, the whole-set
 *  summary, `group_value` scoping of results and count, and a cursor (an
 *  offset here). */
export function buildAccountPortfolio(query: URLSearchParams, rows: AccountPortfolioRow[] = ACCOUNT_ROWS): AccountPortfolioResponse {
  const list = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean);
  const ids = list('ids').map(Number);
  const organisations = list('organisation').map(Number);
  const health = list('health');
  const lifecycle = list('lifecycle');
  const owner = query.get('owner') ?? '';
  const search = (query.get('search') ?? '').toLowerCase();
  const set = rows.filter(
    (row) =>
      (ids.length === 0 || ids.includes(row.id)) &&
      (organisations.length === 0 || row.details.profile.organisations.some((org) => organisations.includes(org.id))) &&
      (health.length === 0 || health.includes(row.health.category)) &&
      (lifecycle.length === 0 || lifecycle.includes(row.lifecycle.value)) &&
      (!search || row.name.toLowerCase().includes(search)) &&
      (!owner || (owner === 'unassigned' ? row.owner === null : String(row.owner?.id) === owner)),
  );
  const group = query.get('group') ?? '';
  const keys: string[] =
    group === 'health' ? BAND_ORDER : group === 'lifecycle' ? LIFECYCLE_VALUES : group === 'owner' ? [...new Set(set.map(ownerKey))] : [];
  const groups: PortfolioGroup[] = keys
    .map((key) => ({ key, rows: set.filter((row) => inGroup(group, key, row)) }))
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ key: g.key, label: groupLabel(group, g.key, g.rows[0]), count: g.rows.length, arr: sumArr(g.rows) }));
  const groupValue = query.get('group_value');
  const scoped = groupValue && group ? set.filter((row) => inGroup(group, groupValue, row)) : set;
  const limit = Number(query.get('limit') ?? 50);
  const start = Number(query.get('cursor') ?? 0);
  return {
    results: scoped.slice(start, start + limit),
    next_cursor: start + limit < scoped.length ? String(start + limit) : null,
    count: scoped.length,
    groups,
    summary: summarise(set),
    filters: ACCOUNT_FILTER_OPTIONS,
    currency: 'USD',
  };
}

/** GET /customers/<cid>/accounts/<id>/ for a row: the Account the edit form reads. */
export function accountFixture(row: AccountPortfolioRow): Account {
  const profile = row.details.profile;
  return {
    id: row.id,
    customers: profile.organisations,
    name: row.name,
    domain: profile.domain,
    industry: profile.industry,
    address: profile.address,
    email: profile.email,
    phone: profile.phone,
    owner: null,
    created_at: row.details.history.created_at,
    updated_at: row.details.history.updated_at,
    lifecycle_stage: row.lifecycle.value,
    health_score: row.health.score.toFixed(1),
    health_category: row.health.category,
    pulse: row.pulse.history,
    ai_pulse_score: '',
    ai_pulse_reason: row.details.voice.ai_pulse_reason,
    account_pulse: { value: null, label: 'No signal', category: 0, breakdown: [] },
    nps_score: row.details.voice.nps_score,
    csat_score: row.details.voice.csat_score == null ? null : String(row.details.voice.csat_score),
    renewal_date: row.details.commercial.renewal_date,
    arr: String(row.details.commercial.arr ?? 0),
  };
}

export interface AccountsStub {
  /** Answer the portfolio endpoint. Return `{status, body}` for an error. */
  portfolio?: (query: URLSearchParams) => AccountPortfolioResponse | { status: number; body: unknown };
  bulk?: (body: AccountBulkRequest) => BulkResult;
  /** GET /auth/members/ (the bulk owner targets and the form's owners). */
  members?: unknown[];
  /** The book the default portfolio answer reads (default ACCOUNT_ROWS), copied. */
  rows?: AccountPortfolioRow[];
  /** Answer PATCH /customers/<cid>/accounts/<id>/ yourself (for a failure, say). */
  patch?: (customerId: number, id: number, body: Record<string, unknown>) => { status: number; body: unknown };
}

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

function applyPatch(book: AccountPortfolioRow[], id: number, body: Record<string, unknown>) {
  const index = book.findIndex((row) => row.id === id);
  if (index < 0) return { status: 404, body: { detail: 'Not found.' } };
  const stage = body.lifecycle_stage as LifecycleValue | undefined;
  if (stage) book[index] = { ...book[index], lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] } };
  if (typeof body.name === 'string') book[index] = { ...book[index], name: body.name };
  return { status: 200, body: accountFixture(book[index]) };
}

function applyCreate(book: AccountPortfolioRow[], customerId: number, body: Record<string, unknown>) {
  const id = Math.max(0, ...book.map((row) => row.id)) + 1;
  const name = ACCOUNT_FILTER_OPTIONS.organisations.find((org) => Number(org.value) === customerId)?.name ?? `Organization ${customerId}`;
  const organisation = { id: customerId, name };
  const stage = (body.lifecycle_stage as LifecycleValue | undefined) ?? 'onboarding';
  const row: AccountPortfolioRow = {
    ...globexNa,
    id,
    name: String(body.name ?? 'New account'),
    lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] },
    organisation,
    extra_organisations: 0,
    details: { ...globexNa.details, profile: { ...globexNa.details.profile, revenact_id: id, organisations: [organisation] } },
  };
  book.push(row);
  return { status: 201, body: accountFixture(row) };
}

export function stubAccountsPortfolio(stub: AccountsStub = {}) {
  const book = [...(stub.rows ?? ACCOUNT_ROWS)];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (path === '/accounts/portfolio/') {
      const out = (stub.portfolio ?? ((q: URLSearchParams) => buildAccountPortfolio(q, book)))(url.searchParams);
      return 'results' in out ? json(200, out) : json(out.status, out.body);
    }
    if (path === '/accounts/portfolio/export.csv') {
      return {
        ok: true,
        status: 200,
        json: async () => null,
        blob: async () => new Blob(['Account,Revenact ID\nPizza EMEA,12\n'], { type: 'text/csv' }),
      };
    }
    if (path === '/accounts/bulk/' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as AccountBulkRequest;
      return json(200, (stub.bulk ?? ((b: AccountBulkRequest) => ({ updated: b.ids, failed: [] })))(body));
    }
    const account = /^\/customers\/(\d+)\/accounts\/(\d+)\/$/.exec(path);
    if (account && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const out = stub.patch ? stub.patch(Number(account[1]), Number(account[2]), body) : applyPatch(book, Number(account[2]), body);
      return json(out.status, out.body);
    }
    if (account) {
      const row = book.find((r) => r.id === Number(account[2]));
      return row ? json(200, accountFixture(row)) : json(404, { detail: 'Not found.' });
    }
    const accounts = /^\/customers\/(\d+)\/accounts\/$/.exec(path);
    if (accounts && method === 'POST') {
      const out = applyCreate(book, Number(accounts[1]), JSON.parse(String(init?.body)) as Record<string, unknown>);
      return json(out.status, out.body);
    }
    if (path === '/customers/') {
      return json(200, { count: 2, next: null, previous: null, results: [{ id: 7, name: 'Pizza Hut' }, { id: 1, name: 'Globex' }] });
    }
    if (path === '/auth/members/') return json(200, stub.members ?? []);
    return json(404, { detail: `Not stubbed: ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchSpy = ReturnType<typeof stubAccountsPortfolio>;

/** Every GET /accounts/portfolio/ so far, as parsed query strings, oldest first. */
export function accountPortfolioQueries(spy: FetchSpy): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/accounts/portfolio/'))
    .map((url) => url.searchParams);
}

export function accountBulkBodies(spy: FetchSpy): AccountBulkRequest[] {
  return spy.mock.calls
    .filter(([input, init]) => String(input).endsWith('/accounts/bulk/') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as AccountBulkRequest);
}

/** Every PATCH /customers/<cid>/accounts/<id>/ so far, oldest first. */
export function accountPatches(spy: FetchSpy): { customerId: number; id: number; body: Record<string, unknown> }[] {
  return spy.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input)).pathname, init }))
    .filter(({ path, init }) => init?.method === 'PATCH' && /\/customers\/\d+\/accounts\/\d+\/$/.test(path))
    .map(({ path, init }) => {
      const [, customerId, id] = /\/customers\/(\d+)\/accounts\/(\d+)\/$/.exec(path)!;
      return { customerId: Number(customerId), id: Number(id), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
    });
}
