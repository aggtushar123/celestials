// Test-only: a Slack thread in the contract's shapes (Slack escalations D1 §3,
// §4) and a stub for GET /api/v1/slack-conversations/<id>/ that passes every
// other request on. Fake people and channels. No em dash.
import { vi } from 'vitest';
import type { SlackConversationDetail } from './slackApi';
import type { LinkedTicket, StoryItem } from './storyTypes';

export const SLACK_THREAD: SlackConversationDetail = {
  id: 41,
  record: { type: 'customer', id: 29, name: 'Globex (QA)' },
  channel: '#all-alfiee',
  url: 'https://slack.com/archives/C0CA7PPRP7A/p1792041415357099',
  title: 'Hi team, our CSV exports have been failing since this morning, urgent.',
  started_by: { id: null, name: 'Mohd faiz' },
  matched_by: 'name',
  messages: [
    { ts: '1792041415.357099', name: 'Mohd faiz', at: '2026-10-15T05:16:55Z', text: 'Hi team, our CSV exports have been failing since this morning, urgent. Can someone look?', bot: false },
    { ts: '1792041450.000100', name: 'Jesh', at: '2026-10-15T05:17:30Z', text: 'Looking now.', bot: false },
    { ts: '1792041500.000100', name: 'alfiee', at: '2026-10-15T05:18:20Z', text: 'Logged as KAN-2.', bot: true },
  ],
};

export const SLACK_ITEM: StoryItem = {
  id: 41,
  kind: 'slack',
  source: 'slack',
  occurred_at: '2026-10-15T05:18:20Z',
  all_day: false,
  account: null,
  title: SLACK_THREAD.title,
  summary: '#all-alfiee · 2 replies',
  actor: { id: null, name: 'Mohd faiz' },
  link: { thread_id: null, url: SLACK_THREAD.url },
  replies: 2,
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

export function stubSlackConversation(stub: { detail?: SlackConversationDetail; status?: number; body?: unknown; failFirst?: number } = {}) {
  const next = globalThis.fetch as unknown as Fetch;
  let failures = stub.failFirst ?? 0;
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
    if (/^\/slack-conversations\/\d+\/$/.test(path)) {
      if (failures > 0) {
        failures -= 1;
        return json(500, { detail: 'Down.' });
      }
      if (stub.status) return json(stub.status, stub.body ?? { detail: 'Not found.' });
      return json(200, stub.detail ?? SLACK_THREAD);
    }
    return next(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy };
}

export const KAN_2: LinkedTicket = { id: 812, number: 'KAN-2', status: 'in-progress', assignee: 'Faiz Jamal', url: 'https://alfiee.atlassian.net/browse/KAN-2' };

/** The D1 thread with its ticket (contract §2.3). */
export const SLACK_ITEM_LINKED: StoryItem = { ...SLACK_ITEM, tickets: [KAN_2], hidden_links: 0 };

/** The ticket filed from it (contract §2.4). */
export const TICKET_ITEM_FROM_SLACK: StoryItem = {
  id: 812,
  kind: 'ticket',
  source: 'jira',
  occurred_at: '2026-10-10T00:00:00Z',
  all_day: true,
  account: null,
  title: 'CSV exports fail',
  summary: 'KAN-2 · High · In Progress',
  actor: { id: null, name: 'Tushar Aggarwal' },
  link: { thread_id: null, url: 'https://alfiee.atlassian.net/browse/KAN-2' },
  from_slack: { id: 41, channel: '#all-alfiee', started_by: 'Mohd faiz' },
  hidden_links: 0,
};

export const SLACK_THREAD_LINKED: SlackConversationDetail = { ...SLACK_THREAD, tickets: [KAN_2], hidden_links: 1 };
