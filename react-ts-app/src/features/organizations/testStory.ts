import { vi } from 'vitest';
import type { Account, Contact, Customer, Opportunity, Risk } from '../customers/customersSlice';
import type { Attachment } from '../files/filesSlice';
import type { CanvasRow } from '../canvas/canvasTypes';
import type { Call } from '../calls/callsSlice';
import type { BulkRequest, PortfolioRow } from './portfolioTypes';
import type { PlanRow } from '../plans/planTypes';
import { GROUP_KEYS, KIND_GROUP, STORY_KINDS } from './storyKinds';
import type { StoryActor, StoryAttention, StoryCounts, StoryItem, StoryKind, StoryRef, StoryResponse } from './storyTypes';
import { NO_HEADS } from '../knowledge/testHeads';
import { buildPortfolio, customerFixture, pizzaHut } from './testPortfolio';

// Test-only: story bodies in the backend's shapes (revenact-backend
// services/organizations/story/) and one fetch stub for the organization
// page. It answers the header's two reads, the accounts, the story (with the
// backend's facet counts, its `thread` read, its horizon and paging; the
// cursor is an offset here), the create endpoints "+ Add" uses (each adds its
// record to the story as the backend would render it), archive and PATCH,
// and the lists People, Deals & risks and Files read (empty unless `lists`
// is given), with their saves, edits and deletes.

export const EMEA: StoryRef = { id: 31, name: 'EMEA' };
export const NORTH_AMERICA: StoryRef = { id: 32, name: 'North America' };
const CARL: StoryActor = { id: 2, name: 'Carl CSM' };
const ALICE: StoryActor = { id: 1, name: 'Alice' };
const NO_LINK = { thread_id: null, url: null };

function accountFixture(ref: StoryRef, extra: Partial<Account> = {}): Account {
  return {
    id: ref.id,
    customers: [{ id: 7, name: 'Pizza Hut' }],
    name: ref.name,
    domain: '',
    industry: '',
    address: '',
    email: '',
    phone: '',
    owner: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    lifecycle_stage: 'live',
    health_score: '5.0',
    health_category: 'average',
    pulse: [],
    ai_pulse_score: '',
    ai_pulse_reason: '',
    account_pulse: { value: null, label: 'No signal', category: 0, breakdown: [] },
    nps_score: null,
    csat_score: null,
    renewal_date: null,
    arr: '0.00',
    ai_pulse_value: null,
    ...extra,
  };
}

/** EMEA carries what the Details tab's Accounts section shows (owner, domain,
 *  pulse dots, AI score and reason, health, lifecycle, ARR, renewal, NPS,
 *  CSAT and CSM pulse); North America carries only what every account always
 *  has (a default health/lifecycle/ARR), leaving its renewal, NPS, CSAT and
 *  CSM pulse blank — accounts do store health, ARR, renewal and CSM pulse
 *  (round-1/round-2 fixes, 2026-09-27), so this fixture exercises both a
 *  fully-populated and a mostly-blank row. */
export const ACCOUNTS: Account[] = [
  accountFixture(EMEA, {
    domain: 'emea.northwind.example',
    owner: { id: 2, name: 'Carl CSM' } as Account['owner'],
    pulse: [1, 1, 3],
    ai_pulse_score: 'satisfied',
    ai_pulse_value: 4,
    ai_pulse_reason: 'Usage is steady and the renewal talks are friendly.',
    lifecycle_stage: 'expansion',
    health_score: '8.6',
    health_category: 'good',
    arr: '150000.00',
    renewal_date: '2026-10-15',
    nps_score: 42,
    csm_pulse_score: 5,
    csat_score: '88.5',
  }),
  accountFixture(NORTH_AMERICA),
];

/** GET /customers/7/: the edit form's fields plus the health rubric. */
export const pizzaHutCustomer = {
  ...customerFixture,
  health_score: '4.9',
  health_category: 'average',
  health_score_is_overridden: false,
  health_breakdown: [
    { key: 'usage', label: 'Product usage', weight: '3.0', points: '1.2', ratio: 0.4, available: true },
    { key: 'support', label: 'Support load', weight: '2.0', points: '1.6', ratio: 0.8, available: true },
    { key: 'sentiment', label: 'Sentiment', weight: '2.0', points: '0.9', ratio: 0.45, available: true },
    { key: 'engagement', label: 'Engagement', weight: '2.0', points: '1.2', ratio: 0.6, available: true },
    { key: 'nps', label: 'NPS', weight: '1.0', points: '0.0', ratio: null, available: false },
  ],
  csat_breakdown: { responses: 0, bands: [] },
} as unknown as Customer;

/** Pizza Hut's story, newest first, as the backend renders it. Timed items
 *  are at noon UTC (and 11:00) so the calendar day is the same in every time
 *  zone a test runs in; date-only items (`all_day`) are at midnight UTC. */
export const STORY_ITEMS: StoryItem[] = [
  {
    id: 41,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-25T12:00:00+00:00',
    all_day: false,
    account: EMEA,
    title: 'Re: Renewal pricing',
    summary: 'Can we see the quote before the board meets on Friday?',
    actor: { id: null, name: 'Dana Buyer' },
    link: { thread_id: 't-1', url: null },
  },
  {
    id: 12,
    kind: 'call',
    source: 'revenact',
    occurred_at: '2026-09-25T11:00:00+00:00',
    all_day: false,
    account: null,
    title: 'Quarterly check-in',
    summary: 'The admin left and usage fell. Agreed a retraining session.',
    actor: { id: null, name: 'Carl CSM' },
    link: NO_LINK,
  },
  {
    id: 88,
    kind: 'ticket',
    source: 'zendesk',
    occurred_at: '2026-09-24T00:00:00+00:00',
    all_day: true,
    account: NORTH_AMERICA,
    title: 'SSO login fails',
    summary: 'ZD-88 · High · Open',
    actor: { id: null, name: 'Sam Admin' },
    link: { thread_id: null, url: 'https://acme.zendesk.example/tickets/88' },
  },
  {
    id: 5,
    kind: 'task',
    source: 'revenact',
    occurred_at: '2026-09-20T12:00:00+00:00',
    all_day: false,
    account: null,
    title: 'Send the renewal quote',
    summary: 'Due 2026-09-22 · High · Pending',
    actor: CARL,
    link: NO_LINK,
  },
  {
    id: 3,
    kind: 'health',
    source: 'revenact',
    occurred_at: '2026-08-31T00:00:00+00:00',
    all_day: true,
    account: null,
    title: 'Health fell to Average',
    summary: 'Health 5.5 → 4.9 · AI pulse 3 → 2',
    actor: null,
    link: NO_LINK,
  },
];

/** Thread t-1 as `?thread=t-1` returns it (newest first): the email in the
 *  story (41) and the message it answers (40), filed on the organization
 *  itself. 40 is left out of the default book so the other counts stay small. */
export const THREAD_ITEMS: StoryItem[] = [
  STORY_ITEMS[0],
  {
    id: 40,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-24T10:00:00+00:00',
    all_day: false,
    account: null,
    title: 'Renewal pricing',
    summary: 'Sharing the renewal quote ahead of your board meeting.',
    actor: CARL,
    link: { thread_id: 't-1', url: null },
  },
];

export const PIZZA_ATTENTION: StoryAttention = {
  renewal: { date: '2026-08-09', days: -47, overdue: true },
  tickets: { count: 2, oldest_days: 9 },
  overdue_tasks: { count: 1, oldest_days: 4 },
  questions: { count: 3 },
  anomaly: {
    id: 17,
    title: 'Similar reports across 1 of your companies',
    first_seen_at: '2026-09-19T08:00:00+00:00',
    last_seen_at: '2026-09-21T08:00:00+00:00',
  },
};

export const QUIET_ATTENTION: StoryAttention = {
  renewal: null,
  tickets: null,
  overdue_tasks: null,
  questions: null,
  anomaly: null,
};

export const MEMBERS = [
  { id: 1, name: 'Alice', function: 'cs' },
  { id: 2, name: 'Carl CSM', function: 'cs' },
];

const PIZZA_REF = [{ id: 7, name: 'Pizza Hut' }];

function contactFixture(id: number, name: string, extra: Partial<Contact>): Contact {
  return {
    id,
    name,
    role: 'other',
    role_display: 'Other',
    email: '',
    phone: '',
    status: 'active',
    sentiment: 'neutral',
    sentiment_source: 'manual',
    sentiment_computed_at: null,
    last_contacted_at: null,
    companies: PIZZA_REF,
    account_name: null,
    account_id: null,
    ...extra,
  };
}

/** Pizza Hut's people: one on each account and one on the organization.
 *  The phone number is in Ofcom's range reserved for drama. */
export const CONTACTS: Contact[] = [
  contactFixture(51, 'Dana Buyer', {
    role: 'decision_maker',
    role_display: 'Decision Maker',
    email: 'dana@emea.northwind.example',
    phone: '+44 20 7946 0000',
    sentiment: 'positive',
    last_contacted_at: '2026-09-25T12:00:00Z',
    account_id: 31,
    account_name: 'EMEA',
  }),
  contactFixture(52, 'Sam Admin', {
    role: 'technical_lead',
    role_display: 'Technical Lead',
    email: 'sam@na.northwind.example',
    account_id: 32,
    account_name: 'North America',
  }),
  contactFixture(53, 'Pat Finance', { role: 'finance_manager', role_display: 'Finance Manager', status: 'inactive', sentiment: 'negative' }),
];

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: 61,
    title: 'EMEA seat expansion',
    mrr: '1200.00',
    stage: 'negotiation',
    stage_display: 'Negotiation',
    priority: 'high',
    priority_display: 'High',
    department: 'cs',
    department_display: 'Customer Success',
    companies: PIZZA_REF,
    account_id: 31,
    account_name: 'EMEA',
  },
  {
    id: 62,
    title: 'Analytics add-on',
    mrr: '300.00',
    stage: 'discovery',
    stage_display: 'Discovery',
    priority: 'medium',
    priority_display: 'Medium',
    department: '',
    department_display: '',
    companies: PIZZA_REF,
    account_id: null,
    account_name: null,
  },
];

export const RISKS: Risk[] = [
  {
    id: 71,
    title: 'Admin left',
    mrr: '800.00',
    stage: 'open',
    stage_display: 'Open',
    priority: 'high',
    priority_display: 'High',
    department: 'cs',
    department_display: 'Customer Success',
    companies: PIZZA_REF,
    account_id: 32,
    account_name: 'North America',
  },
];

export const FILES: Attachment[] = [
  {
    id: 81,
    name: 'Order form.pdf',
    content_type: 'application/pdf',
    size: 245760,
    description: 'Signed order form',
    source: 'upload',
    uploaded_by: { id: 1, name: 'Alice' },
    download_url: '/api/v1/files/81/download/',
    created_at: '2026-09-20T12:00:00Z',
    account_id: 31,
    account_name: 'EMEA',
  },
  {
    id: 82,
    name: 'QBR deck.pptx',
    content_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    size: 3145728,
    description: '',
    source: 'upload',
    uploaded_by: { id: 2, name: 'Carl CSM' },
    download_url: '/api/v1/files/82/download/',
    created_at: '2026-09-18T12:00:00Z',
    account_id: null,
    account_name: null,
  },
];

function callFixture(extra: Partial<Call> & Pick<Call, 'id' | 'title' | 'occurred_at'>): Call {
  return {
    host_name: 'Carl CSM',
    duration_minutes: 30,
    summary: '',
    sentiment: '',
    ai_area: '',
    ai_category: '',
    recording_url: '',
    connector_name: null,
    connector_provider: null,
    logged_by: { id: 2, name: 'Carl CSM' },
    transcript: null,
    participants: [],
    links: 0,
    created_at: extra.occurred_at,
    account_id: null,
    account_name: null,
    ...extra,
  };
}

/** Newest first, at noon UTC so each stays on its calendar day everywhere. */
export const CALLS: Call[] = [
  callFixture({
    id: 12,
    title: 'Quarterly check-in',
    occurred_at: '2026-09-25T12:00:00Z',
    summary: 'The admin left and usage fell. Agreed a retraining session.',
    sentiment: 'negative',
    participants: [{ id: 53, name: 'Pat Finance', role_display: 'Finance Manager', sentiment: 'negative' }],
  }),
  callFixture({
    id: 13,
    title: 'EMEA renewal call',
    occurred_at: '2026-09-24T12:00:00Z',
    summary: 'Quote accepted in principle.',
    sentiment: 'positive',
    duration_minutes: 45,
    recording_url: 'https://recordings.example/13',
    account_id: 31,
    account_name: 'EMEA',
  }),
];

/** What People, Deals & risks and Files read for Pizza Hut. */
export interface OrganizationLists {
  contacts?: Contact[];
  opportunities?: Opportunity[];
  risks?: Risk[];
  files?: Attachment[];
  calls?: Call[];
}

export const ORGANIZATION_LISTS: OrganizationLists = {
  contacts: CONTACTS,
  opportunities: OPPORTUNITIES,
  risks: RISKS,
  files: FILES,
  calls: CALLS,
};

/** `n` tasks on the organization, newest first, created an hour apart (a
 *  task is in the story at its `created_at`). */
export function manyItems(n: number): StoryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    kind: 'task' as const,
    source: 'revenact',
    occurred_at: new Date(Date.UTC(2026, 8, 20, 12) - i * 3_600_000).toISOString(),
    all_day: false,
    account: null,
    title: `Task ${i + 1}`,
    summary: 'Due 2026-10-01 · Medium · Pending',
    actor: ALICE,
    link: NO_LINK,
  }));
}

const newestFirst = (items: StoryItem[]) =>
  [...items].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.kind.localeCompare(a.kind) || b.id - a.id);

/** Tomorrow's midnight UTC: the backend leaves out anything dated from then on. */
function horizon(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** The backend's story rules over a book: the horizon, every filter, the
 *  facet counts (each facet without its own filter, `all` totals, every
 *  account in scope listed), search never matching health, and an offset
 *  cursor. `accountIds` are the organization's accounts in scope. */
export function buildStory(
  query: URLSearchParams,
  book: StoryItem[],
  attention: StoryAttention,
  accountIds: number[],
): StoryResponse {
  const group = query.get('group') ?? '';
  const sources = (query.get('source') ?? '').split(',').filter(Boolean);
  const account = query.get('account') ?? '';
  const q = (query.get('q') ?? '').trim().toLowerCase();
  const inGroup = (item: StoryItem) => !group || KIND_GROUP[item.kind] === group;
  const inSources = (item: StoryItem) => sources.length === 0 || sources.includes(item.kind);
  const inAccount = (item: StoryItem) =>
    !account || (account === 'none' ? item.account === null : String(item.account?.id) === account);
  const matches = (item: StoryItem) =>
    !q || (item.kind !== 'health' && `${item.title} ${item.summary} ${item.actor?.name ?? ''}`.toLowerCase().includes(q));
  const until = horizon();
  const sorted = newestFirst(book).filter((item) => Date.parse(item.occurred_at) < until);
  const set = sorted.filter((item) => inGroup(item) && inSources(item) && inAccount(item) && matches(item));

  const byKind = Object.fromEntries(STORY_KINDS.map((k) => [k.kind, 0])) as Record<StoryKind, number>;
  for (const item of sorted) if (inAccount(item) && matches(item)) byKind[item.kind] += 1;
  const byGroup = { all: 0, ...Object.fromEntries(GROUP_KEYS.map((key) => [key, 0])) } as StoryCounts['by_group'];
  for (const k of STORY_KINDS) {
    byGroup[k.group] += byKind[k.kind];
    byGroup.all += byKind[k.kind];
  }
  const byAccount: Record<string, number> = { all: 0, none: 0 };
  for (const id of accountIds) byAccount[String(id)] = 0;
  for (const item of sorted) {
    if (!inGroup(item) || !inSources(item) || !matches(item)) continue;
    const key = item.account ? String(item.account.id) : 'none';
    if (!(key in byAccount)) continue;
    byAccount[key] += 1;
    byAccount.all += 1;
  }

  const limit = Number(query.get('limit') ?? 30);
  const start = Number(query.get('cursor') ?? 0);
  return {
    items: set.slice(start, start + limit),
    next_cursor: start + limit < set.length ? String(start + limit) : null,
    counts: { by_group: byGroup, by_kind: byKind, by_account: byAccount },
    attention,
  };
}

export interface OrganizationPageStub {
  /** The organization the portfolio returns (default Pizza Hut); null means
   *  not visible to this viewer: no row, and 404s for its records. */
  row?: PortfolioRow | null;
  customer?: unknown;
  accounts?: Account[];
  /** The story's book (default STORY_ITEMS). "+ Add" appends to a copy. */
  items?: StoryItem[];
  attention?: StoryAttention;
  /** What `?thread=<id>` returns, by thread id (default: t-1 is THREAD_ITEMS).
   *  A thread not listed reads the book's emails in that thread. */
  threads?: Record<string, StoryItem[]>;
  /** How many portfolio reads fail (500 "Try later.") before they succeed. */
  failPortfolio?: number;
  /** How many GET /customers/{id}/ reads fail (500 "Try later.") before they succeed. */
  failCustomer?: number;
  /** How many story reads fail (500 "Try later.") before they succeed. */
  failStory?: number;
  /** What People, Deals & risks and Files read (default: every list empty).
   *  Saves on these paths append, tagged with the account as the backend's
   *  serializers tag them; PATCH and DELETE change them in place. */
  lists?: OrganizationLists;
  /** GET customers/:id/plans/ (default none). */
  plans?: PlanRow[];
  /** GET customers/:id/canvases/ (default none). */
  canvases?: CanvasRow[];
}

const EMPTY_LIST =
  /^\/customers\/\d+\/(?:accounts\/\d+\/)?(?:contacts|opportunities|risks|headlines|files|calls|questions|contributions)\/$/;
const EMPTY_BRIEF = {
  use_cases: [],
  stakeholders: [],
  open_threads: [],
  sources: [],
  hidden_sources: 0,
  generated_at: null,
  generated_by: null,
  gaps: [],
};

/** A fetch Response shaped enough for these stubs: `ok`/`status`/`json`/`blob`.
 *  Shared by every page's stub (testPortfolio's own `json` stays local — it
 *  predates this one and is identical, not worth churning). */
export function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

/** A stubbed request's body, whichever shape it was sent in. */
export function bodyOf(init?: RequestInit): Record<string, unknown> {
  if (init?.body instanceof FormData) return Object.fromEntries(init.body.entries());
  return init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
}

export function stubOrganizationPage(stub: OrganizationPageStub = {}) {
  let current: PortfolioRow | null = stub.row === undefined ? pizzaHut : stub.row;
  const book = [...(stub.items ?? STORY_ITEMS)];
  let portfolioFailures = stub.failPortfolio ?? 0;
  let customerFailures = stub.failCustomer ?? 0;
  let storyFailures = stub.failStory ?? 0;
  let created = 0;
  const accounts = stub.accounts ?? ACCOUNTS;
  const lists = {
    contacts: [...(stub.lists?.contacts ?? [])],
    opportunities: [...(stub.lists?.opportunities ?? [])],
    risks: [...(stub.lists?.risks ?? [])],
    files: [...(stub.lists?.files ?? [])],
    calls: [...(stub.lists?.calls ?? [])],
  };
  type ListKey = keyof typeof lists;

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const orgPath = current ? `/customers/${current.id}/` : null;
    if (/^\/customers\/\d+\/plans\/$/.test(path) && method === 'GET') return json(200, { results: stub.plans ?? [] });
    if (/^\/customers\/\d+\/canvases\/$/.test(path) && method === 'GET') return json(200, { results: stub.canvases ?? [] });

    if (path === '/organizations/portfolio/') {
      if (portfolioFailures > 0) {
        portfolioFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      return json(200, buildPortfolio(url.searchParams, current ? [current] : []));
    }

    const story = /^\/organizations\/(\d+)\/story\/$/.exec(path);
    if (story) {
      if (!current || Number(story[1]) !== current.id) return json(404, { detail: 'Not found.' });
      if (storyFailures > 0) {
        storyFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      const accountIds = accounts.map((a) => a.id);
      const thread = url.searchParams.get('thread');
      if (thread) {
        // `thread` narrows the items to that thread's emails, never the counts.
        const rest = new URLSearchParams(url.searchParams);
        rest.delete('thread');
        const whole = buildStory(rest, book, stub.attention ?? PIZZA_ATTENTION, accountIds);
        const emails =
          stub.threads?.[thread] ??
          (thread === 't-1' ? THREAD_ITEMS : book.filter((item) => item.kind === 'email' && item.link.thread_id === thread));
        return json(200, { ...whole, items: newestFirst(emails), next_cursor: null });
      }
      return json(200, buildStory(url.searchParams, book, stub.attention ?? PIZZA_ATTENTION, accountIds));
    }

    if (path === '/organizations/bulk/' && method === 'POST') {
      const body = bodyOf(init) as unknown as BulkRequest;
      if (current && body.action === 'archive' && body.ids.includes(current.id)) current = { ...current, is_archived: true };
      return json(200, { updated: body.ids, failed: [] });
    }

    if (current && path === orgPath && method === 'PATCH') {
      const body = bodyOf(init);
      if (typeof body.name === 'string') current = { ...current, name: body.name };
      if (body.lifecycle_stage === 'churn') {
        current = { ...current, churned: true, lifecycle: { value: 'churn', label: 'Churn' }, signal: null };
      }
      return json(200, { ...((stub.customer ?? pizzaHutCustomer) as object), ...body });
    }

    const save = /^\/customers\/(\d+)\/(?:accounts\/(\d+)\/)?(contacts|opportunities|risks|files)\/$/.exec(path);
    if (save && method === 'POST') {
      const body = bodyOf(init);
      const accountId = save[2] ? Number(save[2]) : null;
      const account = accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null;
      const tag = { account_id: accountId, account_name: account?.name ?? null };
      created += 1;
      const id = 900 + created;
      if (save[3] === 'files') {
        const file = body.file as File;
        const record: Attachment = {
          id,
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          size: file.size,
          description: String(body.description ?? ''),
          source: 'upload',
          uploaded_by: { id: 1, name: 'Alice' },
          download_url: `/api/v1/files/${id}/download/`,
          created_at: new Date().toISOString(),
          ...tag,
        };
        lists.files.unshift(record);
        return json(201, record);
      }
      const companies = [{ id: Number(save[1]), name: current?.name ?? '' }];
      if (save[3] === 'contacts') {
        const record: Contact = {
          id,
          name: String(body.name ?? ''),
          role: (body.role as Contact['role']) ?? 'other',
          role_display: 'Other',
          email: String(body.email ?? ''),
          phone: String(body.phone ?? ''),
          status: 'active',
          sentiment: 'neutral',
          sentiment_source: 'manual',
          sentiment_computed_at: null,
          last_contacted_at: null,
          companies,
          ...tag,
        };
        lists.contacts.push(record);
        return json(201, record);
      }
      const deal = {
        id,
        title: String(body.title ?? ''),
        mrr: String(body.mrr || '0.00'),
        priority: (body.priority as Opportunity['priority']) ?? 'medium',
        priority_display: 'Medium',
        department: (body.department as Opportunity['department']) ?? '',
        department_display: '',
        companies,
        ...tag,
      };
      if (save[3] === 'opportunities') {
        const record: Opportunity = { ...deal, stage: (body.stage as Opportunity['stage']) ?? 'discovery', stage_display: 'Discovery' };
        lists.opportunities.push(record);
        return json(201, record);
      }
      const record: Risk = { ...deal, stage: (body.stage as Risk['stage']) ?? 'open', stage_display: 'Open' };
      lists.risks.push(record);
      return json(201, record);
    }

    const one = /^\/(contacts|opportunities|risks|files)\/(\d+)\/$/.exec(path);
    if (one && (method === 'PATCH' || method === 'DELETE')) {
      const list = lists[one[1] as ListKey] as { id: number }[];
      const at = list.findIndex((item) => item.id === Number(one[2]));
      if (at === -1) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        list.splice(at, 1);
        return json(204, null);
      }
      list[at] = { ...list[at], ...bodyOf(init) };
      return json(200, list[at]);
    }

    const create = /^\/customers\/(\d+)\/(?:accounts\/(\d+)\/)?(tasks|notes|surveys|calls)\/$/.exec(path);
    if (create && method === 'POST') {
      const body = bodyOf(init);
      const accountId = create[2] ? Number(create[2]) : null;
      const account = accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null;
      const ref = account ? { id: account.id, name: account.name } : null;
      created += 1;
      const id = 900 + created;
      const now = new Date().toISOString();
      const today = `${now.slice(0, 10)}T00:00:00+00:00`;
      const title = String(body.title ?? '');
      // Each new record joins the book as the backend renders it (items.py).
      const logged = { id, source: 'revenact', account: ref, link: NO_LINK };
      if (create[3] === 'tasks') {
        book.push({ ...logged, kind: 'task', occurred_at: now, all_day: false, title, summary: `Due ${String(body.due_date)} · Medium · Pending`, actor: ALICE });
        return json(201, { id, title, assignee_name: 'Alice', assignee: ALICE, created_by: ALICE, due_date: body.due_date, priority: body.priority, status: 'pending' });
      }
      if (create[3] === 'notes') {
        book.push({ ...logged, kind: 'note', occurred_at: today, all_day: true, title, summary: String(body.body ?? ''), actor: ALICE });
        return json(201, { id, title, author_name: 'Alice', author: ALICE, body: body.body, logged_at: now.slice(0, 10), links: 0 });
      }
      if (create[3] === 'surveys') {
        const type = String(body.survey_type ?? 'nps');
        const sent = String(body.sent_at ?? now).slice(0, 10);
        book.push({ ...logged, kind: 'survey', occurred_at: `${sent}T00:00:00+00:00`, all_day: true, title: `${type.toUpperCase()} survey`, summary: 'Sent · awaiting a response', actor: null });
        return json(201, {
          id,
          survey_type: type,
          survey_type_display: type.toUpperCase(),
          status: 'sent',
          status_display: 'Sent',
          score: null,
          sent_at: body.sent_at,
          responded_at: null,
          companies: [{ id: Number(create[1]), name: current?.name ?? '' }],
          account_id: accountId,
          account_name: account?.name ?? null,
          created_at: now,
        });
      }
      const at = body.occurred_at ? new Date(String(body.occurred_at)).toISOString() : now;
      book.push({ ...logged, kind: 'call', occurred_at: at, all_day: false, title, summary: String(body.summary ?? ''), actor: { id: null, name: 'Alice' } });
      const call: Call = {
        id,
        title,
        host_name: 'Alice',
        occurred_at: String(body.occurred_at ?? at),
        duration_minutes: null,
        summary: String(body.summary ?? ''),
        sentiment: '',
        ai_area: '',
        ai_category: '',
        recording_url: '',
        connector_name: null,
        connector_provider: null,
        logged_by: { id: 1, name: 'Alice' },
        transcript: null,
        participants: [],
        links: 0,
        created_at: now,
        account_id: accountId,
        account_name: account?.name ?? null,
      };
      lists.calls.unshift(call);
      return json(201, call);
    }

    if (method === 'GET') {
      if (orgPath && path === orgPath) {
        if (customerFailures > 0) {
          customerFailures -= 1;
          return json(500, { detail: 'Try later.' });
        }
        return json(200, stub.customer ?? pizzaHutCustomer);
      }
      if (orgPath && path === `${orgPath}accounts/`) return json(200, accounts);
      if (path === '/auth/members/') return json(200, MEMBERS);
      if (/^\/customers\/\d+\/brief\/$/.test(path)) return json(200, EMPTY_BRIEF);
      if (/^\/customers\/\d+\/responsible\/$/.test(path)) return json(200, { responsible: [] });
      if (path === '/function-heads/') return json(200, NO_HEADS);
      const listRead = /^\/customers\/(\d+)\/(contacts|opportunities|risks|files|calls)\/$/.exec(path);
      if (listRead && current && Number(listRead[1]) === current.id) {
        // A fresh copy of each record: the store freezes what it keeps.
        return json(200, (lists[listRead[2] as ListKey] as object[]).map((record) => ({ ...record })));
      }
      if (EMPTY_LIST.test(path) || path === '/attributes/values/' || path === '/knowledge/gaps/') return json(200, []);
    }
    if (path === '/calendar/meetings/' && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      return json(201, { meeting: { id: 900, title: body.title, starts_at: body.starts_at, ends_at: body.ends_at, all_day: false, status: 'confirmed', owner: null, organizer_email: '', attendee_count: body.contact_ids.length, meet_url: 'https://meet.google.com/x', customer: { id: 7, name: 'Pizza Hut' }, account: null } });
    }
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type Calls = { mock: { calls: [RequestInfo | URL, RequestInit?][] } };

/** Every portfolio request so far, as parsed query strings, oldest first. */
export function portfolioRequests(spy: Calls): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/organizations/portfolio/'))
    .map((url) => url.searchParams);
}

/** Every story request so far, as parsed query strings, oldest first. */
export function storyQueries(spy: Calls): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => /\/organizations\/\d+\/story\/$/.test(url.pathname))
    .map((url) => url.searchParams);
}

/** The JSON bodies POSTed to `path` (e.g. '/customers/7/tasks/'), oldest first. */
export function postBodies(spy: Calls, path: string): Record<string, unknown>[] {
  return spy.mock.calls
    .filter(([input, init]) => new URL(String(input)).pathname === `/api/v1${path}` && init?.method === 'POST')
    .map(([, init]) => bodyOf(init));
}

/** Every request's method and path (no query), oldest first: "GET /customers/7/". */
export function requestPaths(spy: Calls): string[] {
  return spy.mock.calls.map(
    ([input, init]) => `${init?.method ?? 'GET'} ${new URL(String(input)).pathname.replace(/^\/api\/v1/, '')}`,
  );
}
