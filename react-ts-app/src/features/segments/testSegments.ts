// Test-only: segments in the backend's contract shapes (revenact-backend PR
// #84, docs/API_CONTRACTS.md `segments`) and one fetch stub answering every
// endpoint the Segments pages read, plus the portfolio reads Save as segment
// and the Organizations list use.
import { vi } from 'vitest';
import type { AccountPortfolioRow } from '../accounts/portfolioTypes';
import { ACCOUNT_ROWS, buildAccountPortfolio } from '../accounts/testPortfolio';
import { BUILT_SEGMENT_ID, MADE_BY_OPS } from '../agents/testAgentsFixtures';
import { PEOPLE } from '../contacts/testContacts';
import type { Contact } from '../customers/customersSlice';
import type { PortfolioRow } from '../organizations/portfolioTypes';
import { ALL_ROWS, buildPortfolio } from '../organizations/testPortfolio';
import {
  NO_LABELS,
  type PersonRef,
  type PreviewRequest,
  type PreviewResponse,
  type Segment,
  type SegmentChanges,
  type SegmentKind,
  type SegmentListRow,
  type SegmentSummary,
} from './segmentTypes';

/** The signed-in user in pages/segments/testPages.tsx. */
export const ME: PersonRef = { id: 1, name: 'Alice' };
export const CARL: PersonRef = { id: 4, name: 'Carl CSM' };
export const DANA: PersonRef = { id: 5, name: 'Dana CSM' };
/** Deactivated: still on GET /auth/members/, never a teammate to share with. */
export const ERIN: PersonRef = { id: 6, name: 'Erin Left' };
/** GET /auth/members/. */
export const TEAM = [
  ...[ME, CARL, DANA].map((person) => ({ ...person, email: '', is_active: true })),
  { ...ERIN, email: '', is_active: false },
];

const BASE = {
  description: '',
  labels: NO_LABELS,
  pinned_ids: [] as number[],
  excluded_ids: [] as number[],
  shared_with: [] as PersonRef[],
  alert_on_changes: false,
  paused: false,
  last_evaluated_on: '2026-10-03',
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-03T09:12:00Z',
};

/** Mine: organisations, shared with the workspace, alerts on. */
export const RENEWAL_RISK: Segment = {
  ...BASE,
  id: 7,
  name: 'Renewal risk',
  description: 'Unhappy and renewing soon',
  kind: 'customer',
  rules: {
    match: 'all',
    conditions: [
      { field: 'csat_score', op: 'lt', value: 60 },
      {
        group: {
          match: 'any',
          conditions: [
            { field: 'renewal_date', op: 'within_next', value: 90 },
            { field: 'health_category', op: 'is', value: 'poor' },
          ],
        },
      },
    ],
  },
  sharing: 'workspace',
  owner: ME,
  is_owner: true,
  alert_on_changes: true,
  member_count: 3,
};

/** Carl's: accounts, shared with me by name. Its rule names one organisation
 *  I may open and one I may not (`null`, no label). Carl keeps Initech APAC
 *  out, and I may open it, so its id reaches me (`openable_ids`). */
export const EMEA_ACCOUNTS: Segment = {
  ...BASE,
  id: 8,
  name: 'EMEA accounts',
  kind: 'account',
  rules: { match: 'all', conditions: [{ field: 'organisation', op: 'in', value: [7, null] }] },
  labels: { ...NO_LABELS, organisations: { '7': 'Pizza Hut' } },
  sharing: 'people',
  shared_with: [ME],
  owner: CARL,
  is_owner: false,
  excluded_ids: [14],
  member_count: null,
};

/** Mine: contacts, private. */
export const CHAMPIONS: Segment = {
  ...BASE,
  id: 9,
  name: 'Champions',
  kind: 'contact',
  rules: { match: 'all', conditions: [{ field: 'role', op: 'is', value: 'champion' }] },
  sharing: 'private',
  owner: ME,
  is_owner: true,
  member_count: 3,
};

export const SEGMENTS: Segment[] = [RENEWAL_RISK, EMEA_ACCOUNTS, CHAMPIONS];

/** Dana's: organisations, private, not shared with me or the workspace.
 *  Unreadable to the viewer (`ME`), so it must 404 like a missing id, the
 *  same way the backend's `get_readable` (services/segments/access.py) does. */
export const DANA_PRIVATE: Segment = {
  ...BASE,
  id: 10,
  name: "Dana's pipeline",
  kind: 'customer',
  rules: { match: 'all', conditions: [] },
  sharing: 'private',
  owner: DANA,
  is_owner: false,
  member_count: null,
};

/** Agents delivery 3: the segment the Ops agent built and Alice approved
 *  (private, hers). Not in SEGMENTS, so the list's counts stay. */
export const AGENT_SEGMENT: Segment = {
  ...RENEWAL_RISK,
  id: BUILT_SEGMENT_ID,
  name: 'Poor health renewals',
  description: 'Organisations renewing within 60 days with poor health.',
  sharing: 'private',
  made_by: MADE_BY_OPS,
};

/** The list's row for a segment: the owner's figures only on mine (S8). */
export function listRow(segment: Segment): SegmentListRow {
  const own = segment.is_owner;
  return {
    id: segment.id,
    name: segment.name,
    kind: segment.kind,
    owner: segment.owner,
    is_owner: own,
    sharing: segment.sharing,
    paused: segment.paused,
    member_count: own ? segment.member_count : null,
    today: own ? { entered: 3, left: 1 } : null,
    sparkline: own ? [1, 2, 2, 3] : null,
    updated_at: segment.updated_at,
  };
}

export function summaryOf(members: number, kind: SegmentKind): SegmentSummary {
  return kind === 'contact'
    ? { members, arr: null, unconverted_count: 0, avg_health: null, avg_csat: null, entered_7d: 1, left_7d: 0, currency: 'USD' }
    : { members, arr: 512000, unconverted_count: 0, avg_health: 5.4, avg_csat: 71.2, entered_7d: 6, left_7d: 2, currency: 'USD' };
}

/** Two days: the newest names one entry of two (`more` 1) and one exit. */
export const CHANGES: SegmentChanges = {
  kind: 'customer',
  days: [
    {
      date: '2026-10-03',
      entered: [{ id: 7, name: 'Pizza Hut', reason: ['csat_score', 'health_category'] }],
      left: [{ id: 1, name: 'Globex', reason: ['access'] }],
      totals: { entered: 2, left: 1 },
      more: { entered: 1, left: 0 },
    },
    {
      date: '2026-10-01',
      entered: [{ id: 2, name: 'Initech', reason: ['pinned'] }],
      left: [],
      totals: { entered: 1, left: 0 },
      more: { entered: 0, left: 0 },
    },
  ],
  hidden_count: 3,
};

type Answer = { status: number; body: unknown };

export interface SegmentsStub {
  /** The store the stub reads and writes (copied; default SEGMENTS). */
  segments?: Segment[];
  list?: () => Answer;
  create?: (body: Record<string, unknown>) => Answer;
  patch?: (id: number, body: Record<string, unknown>) => Answer;
  preview?: (body: PreviewRequest) => Answer;
  changes?: (id: number, days: number) => Answer;
  /** PATCH /segments/<id>/members/<record_id>/ (default: the owner's write). */
  member?: (id: number, recordId: number, state: unknown) => Answer;
  /** DELETE /segments/<id>/ (default: the owner's delete). */
  remove?: (id: number) => Answer;
  /** GET /segments/<id>/members/: an answer overrides the default; undefined
   *  falls through to it. */
  members?: (id: number, query: URLSearchParams) => Answer | undefined;
  /** Members' `hidden_count` (default 0 for the owner, 2 for anyone else). */
  hidden?: number;
  /** GET /attributes/definitions/ (default none). */
  attributes?: unknown[];
  /** Each kind's records, for members and the preview (default the
   *  portfolio and Contacts fixtures). */
  rows?: { customer?: PortfolioRow[]; account?: AccountPortfolioRow[]; contact?: Contact[] };
}

type Rows = { customer: PortfolioRow[]; account: AccountPortfolioRow[]; contact: Contact[] };

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

/** What POST /segments/preview/ answers: every row of the kind's fixtures,
 *  or, with no conditions, only the pins (as the backend: no rule matches
 *  nobody, then pins are added). */
function previewOf(request: PreviewRequest, book: Rows): PreviewResponse {
  const all: PreviewResponse['results'] =
    request.kind === 'contact'
      ? book.contact.map((person) => ({ id: person.id, name: person.name, role: person.role_display, parent: { kind: 'customer' as const, id: 7, name: 'Pizza Hut' } }))
      : (request.kind === 'customer' ? book.customer : book.account).map((row) => ({
          id: row.id,
          name: row.name,
          owner: row.owner,
          health: { score: row.health.score, category: row.health.category },
        }));
  const matched = request.rules.conditions.length === 0 ? all.filter((row) => (request.pinned_ids ?? []).includes(row.id)) : all;
  // Ten at most, as PREVIEW_SIZE (fixture order, not by name: the pages
  // only read which records come back).
  const results = matched.slice(0, 10);
  return { kind: request.kind, count: matched.length, results, summary: { ...summaryOf(matched.length, request.kind), entered_7d: null, left_7d: null } };
}

/** GET /segments/<id>/members/: the kind's own fixture rows through the
 *  list builders, keep-outs removed; the tiles over all of them. Contacts
 *  page by (name, pk), the cursor here an offset into that order. */
function membersOf(segment: Segment, query: URLSearchParams, hidden: number, book: Rows) {
  const keep = <R extends { id: number }>(rows: R[]) => rows.filter((row) => !segment.excluded_ids.includes(row.id));
  const listQuery = new URLSearchParams(query);
  listQuery.set('include_churned', '1');
  let page: { results: unknown[]; next_cursor: string | null; count: number; groups: unknown[] };
  let total: number;
  if (segment.kind === 'customer') {
    const rows = keep(book.customer);
    page = buildPortfolio(listQuery, rows);
    total = rows.length;
  } else if (segment.kind === 'account') {
    const rows = keep(book.account);
    page = buildAccountPortfolio(listQuery, rows);
    total = rows.length;
  } else {
    const search = (query.get('search') ?? '').toLowerCase();
    const rows = keep(book.contact);
    const found = rows
      .filter((person) => person.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    const limit = Number(query.get('limit') ?? 50);
    const start = Number(query.get('cursor') ?? 0);
    page = {
      results: found.slice(start, start + limit),
      next_cursor: start + limit < found.length ? String(start + limit) : null,
      count: found.length,
      groups: [],
    };
    total = rows.length;
  }
  return {
    kind: segment.kind,
    results: page.results,
    next_cursor: page.next_cursor,
    count: page.count,
    groups: page.groups,
    currency: 'USD',
    hidden_count: hidden,
    summary: summaryOf(total, segment.kind),
  };
}

/** Readable to the viewer (`ME`): their own, shared with the workspace, or
 *  shared with people that include them — the same test `get_readable`
 *  (services/segments/access.py) applies. A segment that fails it must 404
 *  exactly as a missing id does, on every one of a segment's sub-paths. */
function readableByViewer(segment: Segment): boolean {
  return segment.is_owner || segment.sharing === 'workspace' || (segment.sharing === 'people' && segment.shared_with.some((p) => p.id === ME.id));
}

const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((person) => person.id === id).map(({ id: pk, name }) => ({ id: pk, name })));

export function stubSegments(stub: SegmentsStub = {}) {
  const store: Segment[] = (stub.segments ?? SEGMENTS).map((segment) => ({ ...segment }));
  const book: Rows = { customer: ALL_ROWS, account: ACCOUNT_ROWS, contact: PEOPLE, ...stub.rows };
  let nextId = 100;
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    if (path === '/segments/' && method === 'GET') {
      if (stub.list) return reply(stub.list());
      const scope = url.searchParams.get('scope');
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const rows = store
        .filter((s) => (scope === 'mine' ? s.is_owner : scope === 'shared' ? !s.is_owner : true))
        .filter((s) => s.name.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(listRow);
      return json(200, rows);
    }
    if (path === '/segments/' && method === 'POST') {
      if (stub.create) return reply(stub.create(body));
      const created = {
        ...BASE,
        ...body,
        id: nextId++,
        shared_with: teammates(body.shared_with),
        owner: ME,
        is_owner: true,
        member_count: 0,
      } as Segment;
      store.push(created);
      return json(201, created);
    }
    if (path === '/segments/preview/' && method === 'POST') {
      const request = body as unknown as PreviewRequest;
      return stub.preview ? reply(stub.preview(request)) : json(200, previewOf(request, book));
    }
    const found = /^\/segments\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const segment = store.find((s) => s.id === id);
      // Unreadable reads the same as missing, before any of GET, members/ or
      // changes/ below so none of them can leak a segment the viewer can't open.
      if (!segment || !readableByViewer(segment)) return json(404, { detail: 'Not found.' });
      const forbidden = json(403, { detail: "Only the segment's owner can change it." });
      if (rest === '' && method === 'GET') return json(200, segment);
      if (rest === '' && method === 'PATCH') {
        if (stub.patch) return reply(stub.patch(id, body));
        if (!segment.is_owner) return forbidden;
        Object.assign(segment, body, 'shared_with' in body ? { shared_with: teammates(body.shared_with) } : {});
        return json(200, segment);
      }
      if (rest === '' && method === 'DELETE') {
        if (stub.remove) return reply(stub.remove(id));
        if (!segment.is_owner) return forbidden;
        store.splice(store.indexOf(segment), 1);
        return json(204, null);
      }
      if (rest === 'duplicate/' && method === 'POST') {
        const copy: Segment = {
          ...segment,
          id: 200,
          name: `${segment.name} (copy)`,
          owner: ME,
          is_owner: true,
          sharing: 'private',
          shared_with: [],
          alert_on_changes: false,
          member_count: 0,
        };
        store.push(copy);
        return json(201, copy);
      }
      if (rest === 'members/' && method === 'GET') {
        const override = stub.members?.(id, url.searchParams);
        if (override) return reply(override);
        return json(200, membersOf(segment, url.searchParams, stub.hidden ?? (segment.is_owner ? 0 : 2), book));
      }
      if (rest === 'members/export.csv') {
        return { ok: true, status: 200, json: async () => null, blob: async () => new Blob(['id,name\n'], { type: 'text/csv' }) };
      }
      const member = /^members\/(\d+)\/$/.exec(rest);
      if (member && method === 'PATCH') {
        if (!segment.is_owner) return forbidden;
        const recordId = Number(member[1]);
        if (stub.member) return reply(stub.member(id, recordId, body.state));
        segment.pinned_ids = segment.pinned_ids.filter((pk) => pk !== recordId);
        segment.excluded_ids = segment.excluded_ids.filter((pk) => pk !== recordId);
        if (body.state === 'pinned') segment.pinned_ids = [...segment.pinned_ids, recordId];
        if (body.state === 'excluded') segment.excluded_ids = [...segment.excluded_ids, recordId];
        return json(200, { pinned_ids: segment.pinned_ids, excluded_ids: segment.excluded_ids });
      }
      if (rest === 'changes/' && method === 'GET') {
        const days = Number(url.searchParams.get('days'));
        return stub.changes ? reply(stub.changes(id, days)) : json(200, { ...CHANGES, kind: segment.kind });
      }
    }
    if (path === '/auth/members/') return json(200, TEAM);
    if (path === '/attributes/definitions/') return json(200, stub.attributes ?? []);
    if (path === '/products/') return json(200, [{ id: 3, name: 'Analytics', is_active: true, customers: 1, created_at: '', updated_at: '' }]);
    if (path === '/customers/' || path === '/accounts/') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const rows = (path === '/customers/' ? ALL_ROWS : ACCOUNT_ROWS)
        .filter((row) => row.name.toLowerCase().includes(search))
        .map(({ id, name }) => ({ id, name }));
      return json(200, { count: rows.length, next: null, previous: null, results: rows });
    }
    if (path === '/organizations/portfolio/') return json(200, buildPortfolio(url.searchParams));
    if (path === '/accounts/portfolio/') return json(200, buildAccountPortfolio(url.searchParams));
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

export type SegmentsSpy = ReturnType<typeof stubSegments>;

/** Every `method` request whose path (without /api/v1) matches `pattern`,
 *  oldest first, with its query and JSON body. */
export function requests(spy: SegmentsSpy, method: string, pattern: RegExp) {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => (init?.method ?? 'GET') === method && pattern.test(url.pathname.replace(/^\/api\/v1/, '')))
    .map(({ url, init }) => ({
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}
