// Test-only: one stateful fetch stub for /api/v1/brain/ (spec §4, Waiting
// spec §3), and What's being done (Doing §3), with the initiative starts
// and edits it sends. It checks in
// the backend's order: an unknown or missing scope is 400 SCOPE_UNKNOWN
// before a scope the reader can't use is 403 SCOPE_NOT_ALLOWED; an unknown
// metric is 404 after both (Contract notes 1, 2). A proposal decision
// answers 404 (not found) before 403 (the reader may not decide it) before
// 409 (decided already) — the real backend's order (controller note); a
// rule review's queryset is scoped to the owner, so someone else's review
// 404s where a proposal would 403 (controller note (b), round 2). Writes
// are kept, so a later read returns them. The two Company knowledge
// panels' reads answer empty (Contract note 11).
// What customers are saying (customers §3): customers/ and graph/, and
// /requests/ and /anomalies/ narrowed by ?scope= (list and detail; no
// scope is today's list).
import { vi } from 'vitest';
import type { AnomalyRow } from '../anomalies/anomaliesApi';
import type { GraphPayload } from '../graph/graphTypes';
import type { FeatureRequestRow } from '../requests/types';
import {
  SCOPE_KEYS,
  type BookInitiativeWrite,
  type ChangedPayload,
  type CustomersPayload,
  type DeskMember,
  type DoingInitiative,
  type InitiativePatch,
  type InitiativeWrite,
  type ScopeBrief,
  type ScopeExplanation,
  type ScopeKey,
  type WaitingPerson,
} from './brainTypes';
import { COMPANY, COMPANY_BRIEF, COMPANY_EXPLANATION, LABELS, ME_BASELINE, ME_STALE_BRIEF, METRIC_KEYS, TEAM } from './testBrainFixtures';
import { ANOMALY_ROWS, CUSTOMERS, GRAPHS, REQUEST_ROWS } from './testCustomersFixtures';
import { DOING_REST, doingWorld, MEMBERS, METRIC_LIST, STARTING_VALUE, TRACKABLE_METRICS, type DoingRest, type DoingWorld } from './testDoingFixtures';
import { ALICE } from './testDeskFixtures';

export interface BrainStub {
  /** The scopes the reader may use. Default: all three (a manager with view_all_accounts). */
  offered?: ScopeKey[];
  changed?: Partial<Record<ScopeKey, ChangedPayload>>;
  /** Kept briefs by scope. Default: a Company brief and a stale Me brief. */
  briefs?: Partial<Record<ScopeKey, ScopeBrief>>;
  /** Kept explanations. Default: Company's ARR at risk. */
  explanations?: ScopeExplanation[];
  /** `hidden` on explanations the stub writes. */
  hidden?: number;
  /** How many scopes/ reads fail (500) first. */
  failScopes?: number;
  /** How many changed/ reads fail (500) first. */
  failChanged?: number;
  /** The next write (brief or explanation) answers this instead, once. */
  refuseNextWrite?: { status: number; detail: string };
  /** Writes wait until `releaseWrites()`. */
  holdWrites?: boolean;
  /** Every request outside /brain/ goes here instead (e.g. stubRules' spy). */
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

  /** Who is reading (Doing Decision 2, §1.3). Default ALICE (id 1, the store's user). */
  reader?: WaitingPerson;
  /** Whether the reader holds view_all_accounts. Default: Company is offered. */
  viewAll?: boolean;
  /** Initiatives, shared between stubs so a second reader sees the first's. Default: a fresh doingWorld(). */
  world?: DoingWorld;
  /** Plans, rules and hidden by scope. Default DOING_REST. */
  doing?: Partial<Record<ScopeKey, DoingRest>>;
  /** How many doing/ reads fail (500) first. */
  failDoing?: number;
  /** The next initiative start or edit answers this instead, once. */
  refuseNextInitiative?: { status: number; body: unknown };
  /** GET /auth/members/. Default MEMBERS. */
  members?: DeskMember[];
  /** How many /auth/members/ reads fail (500) first. */
  failMembers?: number;

  /** customers/ by scope. Default CUSTOMERS. */
  customers?: Partial<Record<ScopeKey, CustomersPayload>>;
  /** How many customers/ reads fail (500) first. */
  failCustomers?: number;
  /** graph/ by scope. Default GRAPHS. */
  graphs?: Partial<Record<ScopeKey, GraphPayload>>;
  /** How many graph/ reads fail (500) first. */
  failGraph?: number;
  /** /requests/ rows by scope. Default REQUEST_ROWS. */
  requestRows?: Partial<Record<ScopeKey, FeatureRequestRow[]>>;
  /** /anomalies/ rows by scope. Default ANOMALY_ROWS. */
  anomalyRows?: Partial<Record<ScopeKey, AnomalyRow[]>>;
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const SCOPE_UNKNOWN = { code: 'SCOPE_UNKNOWN', detail: 'Choose me, team or company.' };
const SCOPE_NOT_ALLOWED = { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." };
/** Company POST's own refusal (progress.md Ruling, fix round 1): distinct
 *  from the general not-offered case above, same code. */
const COMPANY_POST_REFUSED = { code: 'SCOPE_NOT_ALLOWED', detail: 'Company initiatives are started from the Company initiatives page.' };
/** PATCH fields the real backend never accepts here (dispatch, fix round 1). */
const PATCH_FORBIDDEN_FIELDS = ['metric', 'dimension', 'member', 'owner_id', 'for_user'] as const;
/** The real backend's own wording (controller item (a), round 3). */
const NOT_BELOW = 'Choose yourself or someone below you.';
const FIELD_LOCKED = "This can't be changed here.";
const INITIATIVE_NOT_FOUND = { detail: 'No Initiative matches the given query.' };
const WRITTEN_AT = '2026-10-05T12:00:00Z';
const ACTIVITY_SINCE = '2026-09-05';

export function stubBrain(stub: BrainStub = {}) {
  const offered = new Set<ScopeKey>(stub.offered ?? SCOPE_KEYS);
  const changed: Record<ScopeKey, ChangedPayload> = { me: ME_BASELINE, team: TEAM, company: COMPANY, ...stub.changed };
  const briefs = new Map<ScopeKey, ScopeBrief>(Object.entries(stub.briefs ?? { company: COMPANY_BRIEF, me: ME_STALE_BRIEF }) as [ScopeKey, ScopeBrief][]);
  const explanations = new Map<string, ScopeExplanation>((stub.explanations ?? [COMPANY_EXPLANATION]).map((e) => [`${e.scope}:${e.metric}`, e]));
  let failScopes = stub.failScopes ?? 0;
  let failChanged = stub.failChanged ?? 0;
  let refusal = stub.refuseNextWrite ?? null;
  let nextId = 500;
  let release: () => void = () => {};
  const gate = stub.holdWrites ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();

  /** A write waits for the gate, then answers the queued refusal once. */
  async function refusedWrite() {
    await gate;
    if (!refusal) return null;
    const answer = json(refusal.status, { detail: refusal.detail });
    refusal = null;
    return answer;
  }


  const reader = stub.reader ?? ALICE;
  const viewAll = stub.viewAll ?? offered.has('company');
  const world = stub.world ?? doingWorld();
  const members = stub.members ?? MEMBERS;
  const rest: Record<ScopeKey, DoingRest> = { ...DOING_REST, ...stub.doing };
  let failDoing = stub.failDoing ?? 0;
  let failMembers = stub.failMembers ?? 0;
  let initiativeRefusal = stub.refuseNextInitiative ?? null;
  const FORBIDDEN = { detail: 'You do not have permission to perform this action.' };

  const customers: Record<ScopeKey, CustomersPayload> = { ...CUSTOMERS, ...stub.customers };
  const graphs: Record<ScopeKey, GraphPayload> = { ...GRAPHS, ...stub.graphs };
  const requestRows: Record<ScopeKey, FeatureRequestRow[]> = { ...REQUEST_ROWS, ...stub.requestRows };
  const anomalyRows: Record<ScopeKey, AnomalyRow[]> = { ...ANOMALY_ROWS, ...stub.anomalyRows };
  let failCustomers = stub.failCustomers ?? 0;
  let failGraph = stub.failGraph ?? 0;

  /** /requests/ and /anomalies/ (customers §1.2, Contract note 1): no scope is
   *  today's list (the reader's reach); unknown 400 before not offered 403;
   *  a row outside the scope 404s on its detail. */
  function scopedList<T extends { id: number; status: string }>(url: URL, rows: Record<ScopeKey, T[]>, id: string | undefined, detail: (row: T) => unknown) {
    const raw = url.searchParams.get('scope');
    if (raw && !SCOPE_KEYS.includes(raw as ScopeKey)) return json(400, SCOPE_UNKNOWN);
    if (raw && !offered.has(raw as ScopeKey)) return json(403, SCOPE_NOT_ALLOWED);
    const inScope = rows[raw ? (raw as ScopeKey) : viewAll ? 'company' : 'me'];
    if (id !== undefined) {
      const found = inScope.find((r) => r.id === Number(id));
      return found ? json(200, detail(found)) : json(404, { detail: 'Not found.' });
    }
    const status = url.searchParams.get('status');
    return json(200, status ? inScope.filter((r) => r.status === status) : inScope);
  }

  /** Everyone below `id` through reports_to. */
  function below(id: number): Set<number> {
    const out = new Set<number>();
    let frontier = [id];
    while (frontier.length > 0) {
      const next = members.filter((m) => m.reports_to !== null && frontier.includes(m.reports_to.id) && !out.has(m.id)).map((m) => m.id);
      next.forEach((n) => out.add(n));
      frontier = next;
    }
    return out;
  }
  const deskOf = (scope: ScopeKey) => new Set(scope === 'me' ? [reader.id] : [reader.id, ...below(reader.id)]);
  /** §1.3: the owner, anyone above them, or view_all_accounts. */
  const canEdit = (one: DoingInitiative) => viewAll || (one.owner !== null && (one.owner.id === reader.id || below(reader.id).has(one.owner.id)));
  const asSeen = (one: DoingInitiative): DoingInitiative => ({ ...one, can_edit: canEdit(one) });
  /** Decision 2: owned by, or cut to, someone on the desk; Company sees all. */
  function initiativesIn(scope: ScopeKey): DoingInitiative[] {
    if (scope === 'company') return world.initiatives.map(asSeen);
    const desk = deskOf(scope);
    return world.initiatives
      .filter((one) => (one.owner !== null && desk.has(one.owner.id)) || (one.for?.dimension === 'owner' && desk.has(Number(one.for.member))))
      .map(asSeen);
  }
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? (id === reader.id ? reader.name : `Member ${id}`);
  function refusedInitiative() {
    if (!initiativeRefusal) return null;
    const answer = json(initiativeRefusal.status, initiativeRefusal.body);
    initiativeRefusal = null;
    return answer;
  }

  /** POST initiatives/?scope=me|team (§1.3). */
  async function startOnBook(scope: ScopeKey, body: BookInitiativeWrite) {
    await gate;
    const refused = refusedInitiative();
    if (refused) return refused;
    const metric = TRACKABLE_METRICS.find((m) => m.key === body.metric);
    if (!metric) return json(400, { detail: "That number can't be tracked for one person's book." });
    // Controller item (b): `for_user` is checked against the desk on every
    // scope, not only `team` — a Me POST naming someone else is refused,
    // never silently pinned back to the reader.
    const forId = body.for_user ?? reader.id;
    if (!deskOf(scope).has(forId)) return json(400, { for_user: [NOT_BELOW] });
    const baseline = STARTING_VALUE[metric.key];
    const target = Number(body.target_value);
    const person = { id: forId, name: nameOf(forId) };
    const made: DoingInitiative = {
      id: world.nextId++, title: body.title, metric: metric.key, metric_label: metric.label,
      for: { dimension: 'owner', member: String(forId), label: person.name }, status: body.status, owner: person, target_by: body.target_by,
      progress: { baseline, current: baseline, target, progress_pct: 0, days_left: 56, direction: target < baseline ? 'down' : 'up', unit: metric.unit, better: metric.better },
      work: { open: 0, done: 0, tasks: [] }, hypothesis: body.hypothesis, outcome: '', can_edit: true,
    };
    world.initiatives.unshift(made);
    return json(201, asSeen(made));
  }

  /** POST /metrics/initiatives/ (Contract note 8): view_all_accounts only. */
  async function startForCompany(body: InitiativeWrite) {
    await gate;
    if (!viewAll) return json(403, FORBIDDEN);
    const refused = refusedInitiative();
    if (refused) return refused;
    const metric = METRIC_LIST.metrics.find((m) => m.key === body.metric);
    if (!metric) return json(400, { metric: [`No metric called '${body.metric}'.`] });
    const baseline = STARTING_VALUE[metric.key] ?? 0;
    const target = Number(body.target_value);
    const label = body.dimension === 'owner' ? nameOf(Number(body.member)) : 'Analytics Suite';
    const made: DoingInitiative = {
      id: world.nextId++, title: body.title, metric: metric.key, metric_label: metric.label,
      for: body.dimension ? { dimension: body.dimension, member: body.member, label } : null, status: 'active',
      owner: body.owner_id === null ? null : { id: body.owner_id, name: nameOf(body.owner_id) }, target_by: body.target_by,
      progress: { baseline, current: baseline, target, progress_pct: 0, days_left: 87, direction: target < baseline ? 'down' : 'up', unit: metric.unit, better: metric.better },
      work: { open: 0, done: 0, tasks: [] }, hypothesis: body.hypothesis, outcome: '', can_edit: true,
    };
    world.initiatives.unshift(made);
    return json(201, { id: made.id, title: made.title });
  }

  /** PATCH initiatives/<id>/ (§1.3): 404, then 403, then the queued refusal. */
  async function editOne(id: number, patch: InitiativePatch) {
    await gate;
    const one = world.initiatives.find((i) => i.id === id);
    if (!one) return json(404, INITIATIVE_NOT_FOUND);
    if (!canEdit(one)) return json(403, { detail: "You can't change this initiative." });
    const badField = PATCH_FORBIDDEN_FIELDS.find((key) => key in (patch as Record<string, unknown>));
    if (badField) return json(400, { [badField]: [FIELD_LOCKED] });
    const refused = refusedInitiative();
    if (refused) return refused;
    const { target_value: targetValue, ...fields } = patch;
    Object.assign(one, fields);
    if (targetValue !== undefined && one.progress) one.progress = { ...one.progress, target: Number(targetValue) };
    return json(200, asSeen(one));
  }

  const sliceOf = (metric: string, dimension: string) => {
    const known = METRIC_LIST.metrics.find((m) => m.key === metric);
    const rows = dimension === 'owner' ? members.map((m) => ({ member: String(m.id), label: m.name })) : [{ member: '4', label: 'Analytics Suite' }];
    return {
      metric: known, dimension: { key: dimension, label: dimension }, currency: 'USD',
      members: rows.map((m) => ({ ...m, value: null, previous: null, change: null })),
    };
  };
  const bodyOf = (init?: RequestInit) => (init?.body ? JSON.parse(String(init.body)) : {});

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const full = url.pathname.replace(/^\/api\/v1/, '');
    if (stub.passThrough && !full.startsWith('/brain/')) return stub.passThrough(input, init);
    const listed = /^\/(requests|anomalies)\/(?:(\d+)\/)?$/.exec(full);
    if (listed && method === 'GET') {
      return listed[1] === 'requests'
        ? scopedList(url, requestRows, listed[2], (r) => ({ ...r, companies_asking: [], evidence: [] }))
        : scopedList(url, anomalyRows, listed[2], (r) => ({ ...r, companies_hit: [], evidence: [] }));
    }
    if (url.pathname.endsWith('/questions/')) return json(200, []);
    if (url.pathname.endsWith('/knowledge/activity/')) return json(200, { days: 30, since: ACTIVITY_SINCE, functions: [] });
    if (full === '/auth/members/' && method === 'GET') {
      if (failMembers > 0) { failMembers -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, members);
    }
    if (full === '/metrics/' && method === 'GET') return viewAll ? json(200, METRIC_LIST) : json(403, FORBIDDEN);
    const cut = /^\/metrics\/([^/]+)\/by\/([^/]+)\/$/.exec(full);
    if (cut && method === 'GET') return viewAll ? json(200, sliceOf(cut[1], cut[2])) : json(403, FORBIDDEN);
    if (full === '/metrics/initiatives/' && method === 'POST') return startForCompany(bodyOf(init) as InitiativeWrite);

    const path = url.pathname.replace(/^\/api\/v1\/brain/, '');
    const edit = /^\/initiatives\/(\d+)\/$/.exec(path);
    if (edit && method === 'PATCH') return editOne(Number(edit[1]), bodyOf(init) as InitiativePatch);

    if (path === '/scopes/' && method === 'GET') {
      if (failScopes > 0) { failScopes -= 1; return json(500, { detail: 'Try later.' }); }
      const scopes = SCOPE_KEYS.filter((key) => offered.has(key)).map((key) => ({ key, label: LABELS[key] }));
      // §1.1: the default is the widest scope offered.
      return json(200, { scopes, default: scopes[scopes.length - 1]?.key ?? 'me' });
    }

    const route = /^\/(changed|brief|doing|customers|graph|initiatives|explanations\/([^/]+))\/$/.exec(path);
    if (!route) return json(404, { detail: `Not stubbed: ${method} ${path}` });
    const raw = url.searchParams.get('scope');
    if (!SCOPE_KEYS.includes(raw as ScopeKey)) return json(400, SCOPE_UNKNOWN);
    const scope = raw as ScopeKey;
    if (!offered.has(scope)) return json(403, SCOPE_NOT_ALLOWED);

    if (route[1] === 'changed' && method === 'GET') {
      if (failChanged > 0) { failChanged -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, changed[scope]);
    }

    if (route[1] === 'doing' && method === 'GET') {
      if (failDoing > 0) { failDoing -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, { scope, currency: 'USD', trackable: TRACKABLE_METRICS, ...rest[scope], initiatives: initiativesIn(scope) });
    }

    if (route[1] === 'customers' && method === 'GET') {
      if (failCustomers > 0) { failCustomers -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, customers[scope]);
    }

    if (route[1] === 'graph' && method === 'GET') {
      if (failGraph > 0) { failGraph -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, graphs[scope]);
    }

    if (route[1] === 'initiatives' && method === 'POST') {
      // §3: Company starts use /metrics/initiatives/ (progress.md Ruling: its own sentence).
      if (scope === 'company') return json(403, COMPANY_POST_REFUSED);
      return startOnBook(scope, bodyOf(init) as BookInitiativeWrite);
    }

    if (route[1] === 'brief') {
      if (method === 'GET') return json(200, { brief: briefs.get(scope) ?? null });
      if (method === 'POST') {
        const refused = await refusedWrite();
        if (refused) return refused;
        const c = changed[scope];
        const brief: ScopeBrief = {
          id: nextId++, scope, as_of: c.as_of, baseline: c.since,
          headline: `A fresh brief for ${LABELS[scope]}`, body: 'What moved, and why.\n\nWhat to do next.',
          watch: ['Renewals next month'], generated_at: WRITTEN_AT, generated_by: 'Alice Admin', stale: false,
        };
        briefs.set(scope, brief);
        return json(201, { brief });
      }
    }

    const metric = route[2];
    if (metric !== undefined) {
      if (!METRIC_KEYS.includes(metric)) return json(404, { detail: 'No such metric.' });
      const id = `${scope}:${metric}`;
      if (method === 'GET') return json(200, { explanation: explanations.get(id) ?? null });
      if (method === 'POST') {
        const refused = await refusedWrite();
        if (refused) return refused;
        const explanation: ScopeExplanation = {
          id: nextId++, metric, scope, as_of: changed[scope].as_of,
          text: `Why ${metric} moved for ${LABELS[scope]}.`, evidence: ['Two renewals slipped'], hidden: stub.hidden ?? 0,
          generated_at: WRITTEN_AT, generated_by: 'Alice Admin', stale: false,
        };
        explanations.set(id, explanation);
        return json(201, { explanation });
      }
    }
    return json(405, { detail: 'Method not allowed.' });
  });
  vi.stubGlobal('fetch', spy);

  return {
    spy,
    /** The reader loses a scope (an org-chart change): later calls for it answer 403. */
    revoke: (key: ScopeKey) => offered.delete(key),
    releaseWrites: () => release(),
  };
}

/** Every `method` request whose path contains `part`, as path + query without /api/v1. */
export function requests(spy: ReturnType<typeof vi.fn>, method: string, part: string): string[] {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), method: (init as RequestInit | undefined)?.method ?? 'GET' }))
    .filter((call) => call.method === method && call.url.pathname.includes(part))
    .map((call) => `${call.url.pathname.replace(/^\/api\/v1/, '')}${call.url.search}`);
}

/** The JSON bodies of every `method` request whose path contains `part`. */
export function bodies(spy: ReturnType<typeof vi.fn>, method: string, part: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(input)).pathname.includes(part))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
