import { vi } from 'vitest';
import type { CanvasRow } from '../canvas/canvasTypes';
import type { Call } from '../calls/callsSlice';
import type { Account, Contact, Opportunity, Risk, Survey } from '../customers/customersSlice';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { CustomObjectDefinition, CustomObjectRecord } from '../customObjects/types';
import type { Attachment } from '../files/filesSlice';
import type { LifecycleValue } from '../organizations/portfolioTypes';
import type { PlanRow } from '../plans/planTypes';
import type { StoryAttention, StoryItem } from '../organizations/storyTypes';
import { bodyOf, CALLS, CONTACTS, FILES, json, MEMBERS, OPPORTUNITIES, RISKS, buildStory } from '../organizations/testStory';
import type { AccountPortfolioRow } from './portfolioTypes';
import { accountFixture, buildAccountPortfolio, pizzaEmea } from './testPortfolio';

// Test-only: the account page (/accounts/:id) in backend #75's shapes, and a
// fetch stub that answers it. It serves the portfolio row by `ids`, the
// record (GET/PATCH /accounts/<id>/ and the nested PATCH the edit form may
// use), the story (the organisation story's rules, `account` ignored), the
// tab lists and their creates on /accounts/<id>/…, record edits and deletes,
// members, AI attributes and custom objects. Anything else goes to
// `fallback` (the Accounts list's stub in the e2e journey) or reads 404.
// `bodyOf`/`json` are testStory's own — not redefined here.

export const PIZZA_EMEA_REF = { id: 12, name: 'Pizza EMEA' };
const NO_LINK = { thread_id: null, url: null };

/** Pizza EMEA's story, newest first; noon UTC keeps each item on its day everywhere. */
export const ACCOUNT_STORY_ITEMS: StoryItem[] = [
  {
    id: 141,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-25T12:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'Re: EMEA renewal',
    summary: 'Can we see the quote before Friday?',
    actor: { id: null, name: 'Dana Buyer' },
    link: { thread_id: 't-9', url: null },
  },
  {
    id: 112,
    kind: 'call',
    source: 'revenact',
    occurred_at: '2026-09-25T11:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'EMEA check-in',
    summary: 'Usage fell after the admin left.',
    actor: { id: null, name: 'Carl CSM' },
    link: NO_LINK,
  },
  {
    id: 188,
    kind: 'ticket',
    source: 'zendesk',
    occurred_at: '2026-09-24T00:00:00+00:00',
    all_day: true,
    account: PIZZA_EMEA_REF,
    title: 'SSO login fails',
    summary: 'ZD-188 · High · Open',
    actor: { id: null, name: 'Sam Admin' },
    link: { thread_id: null, url: 'https://acme.zendesk.example/tickets/188' },
  },
  {
    id: 105,
    kind: 'task',
    source: 'revenact',
    occurred_at: '2026-09-20T12:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'Send the EMEA quote',
    summary: 'Due 2026-09-22 · High · Pending',
    actor: { id: 2, name: 'Carl CSM' },
    link: NO_LINK,
  },
  {
    id: 103,
    kind: 'health',
    source: 'revenact',
    occurred_at: '2026-08-31T00:00:00+00:00',
    all_day: true,
    account: PIZZA_EMEA_REF,
    title: 'Health fell to Average',
    summary: 'Health 5.0 → 4.9',
    actor: null,
    link: NO_LINK,
  },
];

/** Thread t-9 as `?thread=t-9` returns it, newest first. */
export const ACCOUNT_THREAD: StoryItem[] = [
  ACCOUNT_STORY_ITEMS[0],
  {
    id: 140,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-24T10:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'EMEA renewal',
    summary: 'Sharing the quote ahead of your board meeting.',
    actor: { id: 2, name: 'Carl CSM' },
    link: { thread_id: 't-9', url: null },
  },
];

/** Accounts have no Knowledge questions and no anomaly (backend #75). */
export const ACCOUNT_ATTENTION: StoryAttention = {
  renewal: { date: '2026-08-09', days: -47, overdue: true },
  tickets: { count: 1, oldest_days: 6 },
  overdue_tasks: { count: 1, oldest_days: 8 },
  questions: null,
  anomaly: null,
};

/** GET /accounts/12/: the edit form's record, the owner with their function, the account pulse. */
export const pizzaEmeaRecord: Account = {
  ...accountFixture(pizzaEmea),
  owner: { id: 2, name: 'Carl CSM', function: 'cs' } as Account['owner'],
  ai_pulse_value: 1,
  csm_pulse_score: 3,
  account_pulse: {
    value: '2.4',
    label: 'At risk',
    category: 2,
    breakdown: [
      { key: 'ai_pulse', label: 'AI pulse', weight: '3.0', reading: '1.0', note: 'High Risk' },
      { key: 'csm_pulse', label: 'CSM pulse', weight: '2.5', reading: '3.0', note: 'Set 12 days ago' },
      { key: 'sentiment', label: 'Recent sentiment', weight: '2.0', reading: '2.2', note: '3 of 10 classified negative' },
      { key: 'touch', label: 'Last contact', weight: '1.5', reading: '3.6', note: '33 days ago' },
      { key: 'support', label: 'Open tickets', weight: '1.0', reading: null, note: 'No tickets' },
    ],
  },
};

/** The CSAT survey fixture, defined once and reused for every survey row. */
function surveyFixture(id: number, extra: Partial<Survey>): Survey {
  return {
    id,
    survey_type: 'csat',
    survey_type_display: 'CSAT',
    status: 'responded',
    status_display: 'Responded',
    score: null,
    sent_at: '2026-09-01',
    responded_at: '2026-09-03',
    companies: [{ id: 7, name: 'Pizza Hut' }],
    account_id: 12,
    account_name: 'Pizza EMEA',
    created_at: '2026-09-01T10:00:00Z',
    ...extra,
  };
}

/** Two answered CSAT surveys (very satisfied and neutral), an NPS and an unanswered CSAT. */
export const ACCOUNT_SURVEYS: Survey[] = [
  surveyFixture(401, { score: 90 }),
  surveyFixture(402, { score: 55 }),
  surveyFixture(403, { survey_type: 'nps', survey_type_display: 'NPS', score: 40 }),
  surveyFixture(404, { status: 'sent', status_display: 'Sent', responded_at: null }),
];

export const ACCOUNT_CANVASES: CanvasRow[] = [
  { id: 301, name: 'EMEA buying group', record: { kind: 'account', id: 12, name: 'Pizza EMEA' }, people: 2, updated_at: '2026-09-28T10:00:00Z', updated_by: null },
];

export const LINE_ITEMS: CustomObjectDefinition = {
  id: 4,
  name: 'Line item',
  api_name: 'line_item',
  applies_to_customer: false,
  applies_to_account: true,
  fields: [
    { id: 9, name: 'Product', api_name: 'product', field_type: 'text', field_type_display: 'Text', is_required: true, picklist_options: [], order: 1, created_at: '2026-09-06T00:00:00Z' },
    { id: 10, name: 'Quantity', api_name: 'qty', field_type: 'number', field_type_display: 'Number', is_required: false, picklist_options: [], order: 2, created_at: '2026-09-06T00:00:00Z' },
  ],
  records_count: 1,
  created_at: '2026-09-06T00:00:00Z',
};

export const LINE_ITEM_RECORDS: CustomObjectRecord[] = [
  {
    id: 21,
    object_definition_id: 4,
    customer_id: null,
    account_id: 12,
    parent_name: 'Pizza EMEA',
    parent_type: 'account',
    data: { product: 'Seat licence', qty: 50 },
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
  },
];

const onEmea = <T extends { account_id?: number | null; account_name?: string | null }>(record: T): T => ({
  ...record,
  account_id: 12,
  account_name: 'Pizza EMEA',
});

export interface AccountLists {
  contacts?: Contact[];
  opportunities?: Opportunity[];
  risks?: Risk[];
  files?: Attachment[];
  calls?: Call[];
  surveys?: Survey[];
  canvases?: CanvasRow[];
}

/** Pizza Hut's lists, filed on Pizza EMEA. */
export const ACCOUNT_LISTS: Required<AccountLists> = {
  contacts: CONTACTS.map(onEmea),
  opportunities: OPPORTUNITIES.map(onEmea),
  risks: RISKS.map(onEmea),
  files: FILES.map(onEmea),
  calls: CALLS.map(onEmea),
  surveys: ACCOUNT_SURVEYS,
  canvases: ACCOUNT_CANVASES,
};

export interface AccountPageStub {
  /** The account (default Pizza EMEA). null: the viewer may not open it, so
   *  no row and 404 for its record, story and lists. */
  row?: AccountPortfolioRow | null;
  /** GET /accounts/<id>/ (default pizzaEmeaRecord for Pizza EMEA, else accountFixture(row)). */
  record?: Account;
  items?: StoryItem[];
  attention?: StoryAttention;
  lists?: AccountLists;
  definitions?: CustomObjectDefinition[];
  records?: CustomObjectRecord[];
  /** How many portfolio reads fail (500 "Try later.") before they succeed. */
  failPortfolio?: number;
  /** How many story reads fail before they succeed. */
  failStory?: number;
  /** Answers every request this stub does not (the Accounts list's stub, say). */
  fallback?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
  /** GET accounts/:id/plans/ (default none). */
  plans?: PlanRow[];
}

const byNewest = (items: StoryItem[]) => [...items].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));

export function stubAccountPage(stub: AccountPageStub = {}) {
  let row: AccountPortfolioRow | null = stub.row === undefined ? pizzaEmea : stub.row;
  let record: Account | null = stub.record ?? (row ? (row.id === pizzaEmea.id ? pizzaEmeaRecord : accountFixture(row)) : null);
  const book = [...(stub.items ?? ACCOUNT_STORY_ITEMS)];
  let portfolioFailures = stub.failPortfolio ?? 0;
  let storyFailures = stub.failStory ?? 0;
  let created = 0;
  const lists = {
    contacts: [...(stub.lists?.contacts ?? [])],
    opportunities: [...(stub.lists?.opportunities ?? [])],
    risks: [...(stub.lists?.risks ?? [])],
    files: [...(stub.lists?.files ?? [])],
    calls: [...(stub.lists?.calls ?? [])],
    surveys: [...(stub.lists?.surveys ?? [])],
    canvases: [...(stub.lists?.canvases ?? [])],
  };
  type ListKey = keyof typeof lists;
  const definitions = stub.definitions ?? [];
  const objectRecords = [...(stub.records ?? [])];

  /** A PATCH as the backend applies it to the record and to the next row read. */
  function patch(body: Record<string, unknown>) {
    if (!row || !record) return;
    if ('owner_id' in body) {
      const member = MEMBERS.find((m) => m.id === body.owner_id) ?? null;
      record = { ...record, owner: member as Account['owner'] };
      row = { ...row, owner: member ? { id: member.id, name: member.name } : null };
    }
    if (typeof body.name === 'string') {
      record = { ...record, name: body.name };
      row = { ...row, name: body.name };
    }
    if (typeof body.lifecycle_stage === 'string') {
      const stage = body.lifecycle_stage as LifecycleValue;
      record = { ...record, lifecycle_stage: stage };
      row = { ...row, lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] } };
    }
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';

    if (path === '/accounts/portfolio/' && url.searchParams.has('ids')) {
      if (portfolioFailures > 0) {
        portfolioFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      return json(200, buildAccountPortfolio(url.searchParams, row ? [row] : []));
    }

    const nested = /^\/customers\/\d+\/accounts\/(\d+)\/$/.exec(path);
    if (nested && method === 'PATCH' && row && Number(nested[1]) === row.id) {
      patch(bodyOf(init));
      return json(200, record);
    }

    if (/^\/accounts\/\d+\/plans\/$/.test(path) && method === 'GET') return json(200, { results: stub.plans ?? [] });
    const own = /^\/accounts\/(\d+)\/(.*)$/.exec(path);
    if (own) {
      if (!row || !record || Number(own[1]) !== row.id) return json(404, { detail: 'Not found.' });
      const rest = own[2];
      const tag = { account_id: row.id, account_name: row.name };
      const ref = { id: row.id, name: row.name };
      if (rest === '' && method === 'GET') return json(200, record);
      if (rest === '' && method === 'PATCH') {
        patch(bodyOf(init));
        return json(200, record);
      }
      if (rest === 'story/') {
        if (storyFailures > 0) {
          storyFailures -= 1;
          return json(500, { detail: 'Try later.' });
        }
        const query = new URLSearchParams(url.searchParams);
        // One account has no chips: `account` is ignored (backend #75).
        query.delete('account');
        const attention = stub.attention ?? ACCOUNT_ATTENTION;
        const thread = query.get('thread');
        if (thread) {
          query.delete('thread');
          const whole = buildStory(query, book, attention, [row.id]);
          const emails = thread === 't-9' ? ACCOUNT_THREAD : book.filter((item) => item.kind === 'email' && item.link.thread_id === thread);
          return json(200, { ...whole, items: byNewest(emails), next_cursor: null });
        }
        return json(200, buildStory(query, book, attention, [row.id]));
      }
      if (rest === 'canvases/' && method === 'GET') return json(200, { results: lists.canvases.map((item) => ({ ...item })) });
      const list = /^(contacts|opportunities|risks|files|calls|surveys)\/$/.exec(rest);
      if (list && method === 'GET') {
        // A fresh copy of each record: the store freezes what it keeps.
        return json(200, (lists[list[1] as ListKey] as object[]).map((item) => ({ ...item })));
      }
      if (list && method === 'POST') {
        const body = bodyOf(init);
        created += 1;
        const id = 900 + created;
        const now = new Date().toISOString();
        const companies = row.details.profile.organisations;
        if (list[1] === 'contacts') {
          const contact: Contact = {
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
          lists.contacts.push(contact);
          return json(201, contact);
        }
        if (list[1] === 'opportunities' || list[1] === 'risks') {
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
          if (list[1] === 'opportunities') {
            const opportunity: Opportunity = { ...deal, stage: (body.stage as Opportunity['stage']) ?? 'discovery', stage_display: 'Discovery' };
            lists.opportunities.push(opportunity);
            return json(201, opportunity);
          }
          const risk: Risk = { ...deal, stage: (body.stage as Risk['stage']) ?? 'open', stage_display: 'Open' };
          lists.risks.push(risk);
          return json(201, risk);
        }
        if (list[1] === 'files') {
          const file = body.file as File;
          const attachment: Attachment = {
            id,
            name: file.name,
            content_type: file.type || 'application/octet-stream',
            size: file.size,
            description: String(body.description ?? ''),
            source: 'upload',
            uploaded_by: { id: 1, name: 'Alice' },
            download_url: `/api/v1/files/${id}/download/`,
            created_at: now,
            ...tag,
          };
          lists.files.unshift(attachment);
          return json(201, attachment);
        }
        if (list[1] === 'surveys') {
          const type = String(body.survey_type ?? 'nps') as Survey['survey_type'];
          const sent = String(body.sent_at ?? now).slice(0, 10);
          const saved = surveyFixture(id, { survey_type: type, survey_type_display: type.toUpperCase(), status: 'sent', status_display: 'Sent', sent_at: sent, responded_at: null, companies });
          lists.surveys.push(saved);
          book.push({ id, kind: 'survey', source: 'revenact', occurred_at: `${sent}T00:00:00+00:00`, all_day: true, account: ref, title: `${type.toUpperCase()} survey`, summary: 'Sent · awaiting a response', actor: null, link: NO_LINK });
          return json(201, saved);
        }
        if (list[1] === 'calls') {
          const at = body.occurred_at ? new Date(String(body.occurred_at)).toISOString() : now;
          const call: Call = {
            id,
            title: String(body.title ?? ''),
            host_name: 'Alice',
            occurred_at: at,
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
            ...tag,
          };
          lists.calls.unshift(call);
          book.push({ id, kind: 'call', source: 'revenact', occurred_at: at, all_day: false, account: ref, title: call.title, summary: call.summary, actor: { id: null, name: 'Alice' }, link: NO_LINK });
          return json(201, call);
        }
      }
      const create = /^(tasks|notes)\/$/.exec(rest);
      if (create && method === 'POST') {
        const body = bodyOf(init);
        created += 1;
        const id = 900 + created;
        const now = new Date().toISOString();
        const title = String(body.title ?? '');
        const actor = { id: 1, name: 'Alice' };
        if (create[1] === 'tasks') {
          book.push({ id, kind: 'task', source: 'revenact', occurred_at: now, all_day: false, account: ref, title, summary: `Due ${String(body.due_date)} · Medium · Pending`, actor, link: NO_LINK });
          return json(201, { id, title, assignee_name: 'Alice', assignee: actor, created_by: actor, due_date: body.due_date, priority: body.priority, status: 'pending' });
        }
        book.push({ id, kind: 'note', source: 'revenact', occurred_at: `${now.slice(0, 10)}T00:00:00+00:00`, all_day: true, account: ref, title, summary: String(body.body ?? ''), actor, link: NO_LINK });
        return json(201, { id, title, author_name: 'Alice', author: actor, body: body.body, logged_at: now.slice(0, 10), links: 0 });
      }
      return json(404, { detail: `Not stubbed: ${method} ${path}` });
    }

    const one = /^\/(contacts|opportunities|risks|files)\/(\d+)\/$/.exec(path);
    if (one && (method === 'PATCH' || method === 'DELETE')) {
      const target = lists[one[1] as ListKey] as { id: number }[];
      const at = target.findIndex((item) => item.id === Number(one[2]));
      if (at === -1) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        target.splice(at, 1);
        return json(204, null);
      }
      target[at] = { ...target[at], ...bodyOf(init) };
      return json(200, target[at]);
    }

    if (path === '/custom-objects/definitions/' && method === 'GET') return json(200, definitions);
    if (path === '/custom-objects/records/' && method === 'GET') {
      const definition = Number(url.searchParams.get('definition'));
      const account = Number(url.searchParams.get('account'));
      return json(200, objectRecords.filter((r) => r.object_definition_id === definition && r.account_id === account));
    }
    if (path === '/custom-objects/records/' && method === 'POST') {
      const body = bodyOf(init) as { object_definition_id: number; account_id: number; data: CustomObjectRecord['data'] };
      created += 1;
      const saved: CustomObjectRecord = {
        id: 900 + created,
        object_definition_id: body.object_definition_id,
        customer_id: null,
        account_id: body.account_id,
        parent_name: row?.name ?? '',
        parent_type: 'account',
        data: body.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      objectRecords.push(saved);
      return json(201, saved);
    }
    const objectRecord = /^\/custom-objects\/records\/(\d+)\/$/.exec(path);
    if (objectRecord && (method === 'PATCH' || method === 'DELETE')) {
      const at = objectRecords.findIndex((r) => r.id === Number(objectRecord[1]));
      if (at === -1) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        objectRecords.splice(at, 1);
        return json(204, null);
      }
      objectRecords[at] = { ...objectRecords[at], ...(bodyOf(init) as Partial<CustomObjectRecord>) };
      return json(200, objectRecords[at]);
    }

    if (method === 'GET' && path === '/auth/members/') return json(200, MEMBERS);
    if (method === 'GET' && path === '/attributes/values/') return json(200, []);
    if (stub.fallback) return stub.fallback(input, init);
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type Calls = { mock: { calls: [RequestInfo | URL, RequestInit?][] } };

/** Every account story request so far, as parsed query strings, oldest first. */
export function accountStoryQueries(spy: Calls): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => /\/accounts\/\d+\/story\/$/.test(url.pathname))
    .map((url) => url.searchParams);
}
