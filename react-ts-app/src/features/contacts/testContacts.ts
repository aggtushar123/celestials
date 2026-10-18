// Test-only fixtures and a fetch stub for the Contacts page, in the backend's
// contract shapes (revenact-backend docs/API_CONTRACTS.md: GET /contacts/,
// GET /contacts/<id>/, GET /contacts/<id>/history/). These serve the new
// readable-evidence shape (PR fix/contacts-readable-evidence, not merged
// there yet): rows carry `calls`, history carries `sentiment_readable`,
// neither carries `sentiment_evidence`. A dedicated old-shape test proves
// the frontend's fallback for the old backend, which this frontend deploys
// ahead of (ContactsPage.test.tsx).
import { vi } from 'vitest';
import type { Contact } from '../customers/customersSlice';
import type { ContactHistory, ContactsSummary } from './contactsTypes';

const KRAFT = { id: 6, name: 'Kraft Heinz' };
const KRAFT_EMEA = { id: 31, name: 'Kraft Heinz EMEA' };
const PIZZA = { id: 7, name: 'Pizza Hut' };

function person(id: number, name: string, extra: Partial<Contact>): Contact {
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
    companies: [PIZZA],
    organisation: PIZZA,
    account_id: null,
    account_name: null,
    account: null,
    calls: 0,
    ...extra,
  };
}

/** On Kraft Heinz's EMEA account; neutral, read from six calls and two emails. */
export const LUKAS: Contact = person(41, 'Lukas Vermeer', {
  role: 'champion',
  role_display: 'Champion',
  email: 'lukas@kraftheinz.example',
  phone: '+44 20 7946 0001',
  sentiment: 'neutral',
  sentiment_source: 'computed',
  sentiment_computed_at: '2026-09-12T11:00:00Z',
  last_contacted_at: '2026-09-12T10:00:00Z',
  companies: [KRAFT],
  organisation: KRAFT,
  account_id: 31,
  account_name: 'Kraft Heinz EMEA',
  account: KRAFT_EMEA,
  calls: 6,
});

/** On Pizza Hut itself; positive, set by hand. */
export const MIRA: Contact = person(42, 'Mira Patel', {
  role: 'decision_maker',
  role_display: 'Decision Maker',
  email: 'mira@pizzahut.example',
  sentiment: 'positive',
});

/** On Pizza Hut itself; negative, set by hand, never contacted, inactive. */
export const OWEN: Contact = person(43, 'Owen Price', {
  role: 'finance_manager',
  role_display: 'Finance Manager',
  status: 'inactive',
  sentiment: 'negative',
});

export const PEOPLE: Contact[] = [LUKAS, MIRA, OWEN];

export const CUSTOMERS = [
  { ...KRAFT, id: 6 },
  { ...PIZZA, id: 7 },
];

export const ACCOUNTS: Record<number, { id: number; name: string }[]> = {
  6: [KRAFT_EMEA, { id: 32, name: 'Kraft Heinz NA' }],
  7: [],
};

const NO_CLASS = { area: '', category: '', subcategory: '' };

/** Lukas's history: an analysed call, a call with nothing to read, one still
 *  pending, an email and a ticket. */
export const LUKAS_HISTORY: ContactHistory = {
  contact_id: 41,
  sentiment: 'neutral',
  sentiment_source: 'computed',
  sentiment_readable: { calls: 6, emails: 2, tickets: 0, positive: 3, neutral: 2, negative: 1, latest_at: '2026-09-12T10:00:00Z', others: false },
  counts: { calls: 3, emails: 2, tickets: 2 },
  calls: [
    {
      id: 71,
      title: 'Renewal readiness',
      occurred_at: '2026-09-12T10:00:00Z',
      duration_minutes: 45,
      host_name: 'Carl CSM',
      summary: 'They want the enterprise tier. Budget is agreed for Q4.',
      analysis: 'analysed',
      sentiment: 'positive',
      classification: { area: 'Customer Success', category: 'Account Management', subcategory: '' },
      organisation: KRAFT,
      account: KRAFT_EMEA,
      link: { url: 'https://zoom.us/rec/71' },
    },
    {
      id: 72,
      title: 'Call',
      occurred_at: '2026-09-10T10:00:00Z',
      duration_minutes: null,
      host_name: 'Carl CSM',
      summary: '',
      analysis: 'not_analysable',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { url: null },
    },
    {
      id: 73,
      title: 'Kick-off',
      occurred_at: '2026-09-01T10:00:00Z',
      duration_minutes: 30,
      host_name: 'Rita Rep',
      summary: 'Plan agreed.',
      analysis: 'pending',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: KRAFT_EMEA,
      link: { url: 'javascript:alert(1)' },
    },
  ],
  emails: [
    {
      id: 88,
      subject: 'Thanks for the call',
      sent_at: '2026-09-11T08:00:00Z',
      sender_name: 'Lukas Vermeer',
      snippet: 'Thanks for walking us through the plan.',
      analysis: 'analysed',
      sentiment: 'positive',
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { thread_id: 't-19' },
    },
    {
      id: 87,
      subject: 'Kick-off agenda',
      sent_at: '2026-09-09T08:00:00Z',
      sender_name: 'Lukas Vermeer',
      snippet: 'Here is what we plan to cover on the call.',
      analysis: 'analysed',
      sentiment: 'neutral',
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      // The backend serves no thread id for an email it cannot thread.
      link: { thread_id: null },
    },
  ],
  tickets: [
    {
      id: 7,
      ticket_number: 'ZD-1042',
      title: 'Export fails',
      status: 'open',
      status_display: 'Open',
      opened_at: '2026-09-10',
      analysis: 'pending',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { url: 'https://kraft.zendesk.example/t/1042' },
    },
    {
      id: 8,
      ticket_number: 'ZD-1050',
      title: 'Invoice mismatch',
      status: 'open',
      status_display: 'Open',
      department_display: 'Billing',
      opened_at: '2026-09-08',
      analysis: 'not_analysable',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { url: null },
    },
  ],
};

export function emptyHistory(contact: Contact): ContactHistory {
  return {
    contact_id: contact.id,
    sentiment: contact.sentiment,
    sentiment_source: contact.sentiment_source,
    sentiment_readable: null,
    counts: { calls: 0, emails: 0, tickets: 0 },
    calls: [],
    emails: [],
    tickets: [],
  };
}

const DECISION = new Set(['executive_sponsor', 'decision_maker', 'economic_buyer']);

export function summaryOf(rows: Contact[]): ContactsSummary {
  return {
    total: rows.length,
    positive: rows.filter((r) => r.sentiment === 'positive').length,
    neutral: rows.filter((r) => r.sentiment === 'neutral').length,
    negative: rows.filter((r) => r.sentiment === 'negative').length,
    decision_makers: rows.filter((r) => DECISION.has(r.role)).length,
    active: rows.filter((r) => r.status === 'active').length,
  };
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export interface ContactsStub {
  people?: Contact[];
  histories?: Record<number, ContactHistory>;
  /** Rows per page (the backend's is 25). */
  pageSize?: number;
  /** How many list reads fail (500) before they succeed. */
  failList?: number;
  /** How many history reads fail (500) before they succeed. */
  failHistory?: number;
  /** Organisations past the first page of /customers/, found by id. */
  moreCustomers?: { id: number; name: string }[];
  /** The summary's `growth_30d_pct`; left out of it when not given. */
  growth?: number | null;
}

/** Stubs fetch with the Contacts page's endpoints, filtering as the backend
 *  does. Returns the spy; `paths(spy)` lists what was asked. */
export function stubContactsApi(stub: ContactsStub = {}) {
  let people = [...(stub.people ?? PEOPLE)];
  const histories: Record<number, ContactHistory> = { 41: LUKAS_HISTORY, ...stub.histories };
  const pageSize = stub.pageSize ?? 25;
  let listFailures = stub.failList ?? 0;
  let historyFailures = stub.failHistory ?? 0;

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const q = url.searchParams;

    if (path === '/contacts/' && method === 'GET') {
      if (listFailures > 0) {
        listFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      const search = (q.get('search') ?? '').toLowerCase();
      const customer = Number(q.get('customer') ?? q.get('company')) || null;
      const account = Number(q.get('account')) || null;
      const rows = people.filter(
        (p) =>
          (!search || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(search)) &&
          (!customer || p.organisation?.id === customer) &&
          (!account || p.account?.id === account) &&
          (!q.get('sentiment') || p.sentiment === q.get('sentiment')) &&
          (!q.get('role') || p.role === q.get('role')),
      );
      const page = Number(q.get('page') ?? '1');
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      let next: string | null = null;
      if (page * pageSize < rows.length) {
        const nextUrl = new URL(url);
        nextUrl.searchParams.set('page', String(page + 1));
        next = nextUrl.toString();
      }
      return json(200, { count: rows.length, next, previous: null, results: slice, summary: { ...summaryOf(rows), ...('growth' in stub ? { growth_30d_pct: stub.growth } : {}) } });
    }

    const one = /^\/contacts\/(\d+)\/$/.exec(path);
    if (one) {
      const id = Number(one[1]);
      const found = people.find((p) => p.id === id);
      if (!found) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        people = people.filter((p) => p.id !== id);
        return { ok: true, status: 204, json: async () => null };
      }
      if (method === 'PATCH') {
        const { campaigns_unsubscribed: optIn, ...patch } = JSON.parse(String(init?.body ?? '{}')) as Partial<Contact> & { campaigns_unsubscribed?: boolean };
        // As ContactSerializer does: a sent sentiment is a hand-set one.
        const manual = 'sentiment' in patch ? { sentiment_source: 'manual' as const, sentiment_computed_at: null } : {};
        // Re-subscribing clears the date (campaigns spec §1.6).
        const subscribed = optIn === false ? { campaigns_unsubscribed_at: null } : {};
        const updated = { ...found, ...patch, ...manual, ...subscribed };
        people = people.map((p) => (p.id === id ? updated : p));
        return json(200, updated);
      }
      return json(200, found);
    }

    const history = /^\/contacts\/(\d+)\/history\/$/.exec(path);
    if (history) {
      const id = Number(history[1]);
      const found = people.find((p) => p.id === id);
      if (!found) return json(404, { detail: 'Not found.' });
      if (historyFailures > 0) {
        historyFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      // The sentiment is the person's own, as it stands now; a hand-set one
      // rests on nothing the viewer can point to (sentiment_readable is
      // null for it).
      const base = histories[id] ?? emptyHistory(found);
      return json(200, {
        ...base,
        sentiment: found.sentiment,
        sentiment_source: found.sentiment_source,
        sentiment_readable: found.sentiment_source === 'manual' ? null : base.sentiment_readable,
      });
    }

    if (path === '/customers/') {
      return json(200, { count: CUSTOMERS.length, next: null, previous: null, results: CUSTOMERS });
    }

    const customer = /^\/customers\/(\d+)\/$/.exec(path);
    if (customer) {
      const found = [...CUSTOMERS, ...(stub.moreCustomers ?? [])].find((c) => c.id === Number(customer[1]));
      return found ? json(200, found) : json(404, { detail: 'Not found.' });
    }

    const accounts = /^\/customers\/(\d+)\/accounts\/$/.exec(path);
    if (accounts) return json(200, ACCOUNTS[Number(accounts[1])] ?? []);

    return json(404, { detail: `No stub for ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Every path and query the page asked for, in order. */
export function requested(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map(([input]) => {
    const url = new URL(String(input));
    return `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
  });
}
