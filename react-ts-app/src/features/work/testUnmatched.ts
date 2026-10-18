// Test-only: a stub for /api/v1/work/unmatched/ in the round 2 D3 contract's
// shapes (§3). It wraps the current global fetch, answers its own paths and
// passes every other request on, the way testJiraLink.ts composes. No em dash.
import { vi } from 'vitest';
import type { MatchAnswer, UnmatchedItem, UnmatchedPage } from './unmatched';

export const ITEM_JIRA: UnmatchedItem = {
  id: 41,
  source: 'jira',
  connector: { id: 6, name: 'Jira SUP' },
  number: 'SUP-31',
  title: 'Export fails for the whole team',
  text: 'Since this morning nobody on our side can export reports.',
  from: { name: 'Ann Lee', email: 'ann@newco.io' },
  url: 'https://acme.atlassian.net/browse/SUP-31',
  priority: 'critical',
  opened_on: '2026-10-14',
  last_seen_at: '2026-10-14T09:12:00Z',
  deletes_on: '2026-11-13',
  can_add_contact: true,
  mentioned: [],
};

export const ITEM_SLACK: UnmatchedItem = {
  id: 42,
  source: 'slack',
  connector: { id: 7, name: 'Slack #support' },
  number: '#support',
  title: 'Is anyone seeing the dashboard time out?',
  text: 'Is anyone seeing the dashboard time out? It has been slow since lunch.',
  from: { name: 'Ben Ode', email: '' },
  url: '',
  priority: 'medium',
  opened_on: '2026-10-13',
  last_seen_at: '2026-10-13T15:40:00Z',
  deletes_on: '2026-11-12',
  can_add_contact: false,
  mentioned: [
    { type: 'customer', id: 29, name: 'Globex (QA)' },
    { type: 'customer', id: 30, name: 'Initech (QA)' },
  ],
};

/** Thirty rows, newest first, for paging (25 then 5). */
export const ITEMS_CS: UnmatchedItem[] = Array.from({ length: 30 }, (_, i) => ({
  ...ITEM_JIRA,
  id: 100 + i,
  number: `SUP-${200 - i}`,
  title: `Message ${i + 1} that matched no customer`,
  last_seen_at: new Date(Date.UTC(2026, 9, 14, 9, 0) - i * 60_000).toISOString(),
}));

export interface UnmatchedStub {
  /** Rows for every queue asked about. Default [ITEM_JIRA, ITEM_SLACK]. */
  items?: UnmatchedItem[];
  /** The next match answers this instead, once. */
  refuseNextMatch?: { status: number; body: unknown };
  /** The next dismiss answers this instead, once. */
  refuseNextDismiss?: { status: number; body: unknown };
  /** How many reads of the list fail (500) first. */
  failList?: number;
  /** The list answers 403 SCOPE_NOT_ALLOWED. */
  forbidden?: boolean;
}

const PAGE = 25;
const CURSOR = 'p2';
const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

export function stubUnmatched(stub: UnmatchedStub = {}) {
  const next = globalThis.fetch as unknown as Fetch;
  let rows: UnmatchedItem[] = JSON.parse(JSON.stringify(stub.items ?? [ITEM_JIRA, ITEM_SLACK]));
  let failList = stub.failList ?? 0;
  let refuseMatch = stub.refuseNextMatch ?? null;
  let refuseDismiss = stub.refuseNextDismiss ?? null;

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (method === 'GET' && path === '/work/unmatched/') {
      if (stub.forbidden) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
      if (failList > 0) {
        failList -= 1;
        return json(500, { detail: 'Down.' });
      }
      const cursor = url.searchParams.get('cursor');
      if (cursor !== null && cursor !== CURSOR) return json(400, { cursor: ['That list has changed. Reload Work.'] });
      const start = cursor === CURSOR ? PAGE : 0;
      const page: UnmatchedPage = {
        queue: url.searchParams.get('queue') ?? '',
        count: rows.length,
        items: rows.slice(start, start + PAGE),
        next: start + PAGE < rows.length ? CURSOR : null,
      };
      return json(200, page);
    }
    const one = /^\/work\/unmatched\/(\d+)\/(match|dismiss)\/$/.exec(path);
    if (one && method === 'POST') {
      const id = Number(one[1]);
      const refusal = one[2] === 'match' ? refuseMatch : refuseDismiss;
      if (one[2] === 'match') refuseMatch = null;
      else refuseDismiss = null;
      if (refusal) return json(refusal.status, refusal.body);
      const row = rows.find((r) => r.id === id);
      if (!row) return json(404, { detail: 'Not found.' });
      if (one[2] === 'dismiss') {
        rows = rows.filter((r) => r.id !== id);
        return json(200, { dismissed: true });
      }
      const body = init?.body ? (JSON.parse(String(init.body)) as { customer_id?: number; account_id?: number; add_contact?: boolean }) : {};
      if ((body.customer_id === undefined) === (body.account_id === undefined)) return json(400, { record: ['Choose one customer or account.'] });
      if (row.source === 'slack' && body.add_contact) return json(400, { add_contact: ['A Slack message is from a colleague. Match it without adding a contact.'] });
      if (body.add_contact && !row.from.email) return json(400, { add_contact: ['This message has no sender email to add.'] });
      rows = rows.filter((r) => r.id !== id);
      // The real server answers the record's real name: take it from the row's
      // mentioned entry of the same type and id when there is one.
      const named = (type: 'customer' | 'account', id: number, fallback: string) => row.mentioned.find((m) => m.type === type && m.id === id)?.name ?? fallback;
      const record: MatchAnswer['record'] =
        body.customer_id !== undefined
          ? { type: 'customer', id: body.customer_id, name: named('customer', body.customer_id, body.customer_id === 7 ? 'Pizza Hut' : `Customer ${body.customer_id}`) }
          : { type: 'account', id: body.account_id as number, name: named('account', body.account_id as number, `Account ${body.account_id}`) };
      const answer: MatchAnswer =
        row.source === 'slack'
          ? { record, ticket: null, conversation: { id: 900 + id }, contact_added: false }
          : { record, ticket: { id: 800 + id, number: row.number, record }, conversation: null, contact_added: body.add_contact === true && row.can_add_contact };
      return json(200, answer);
    }
    return next(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy };
}
