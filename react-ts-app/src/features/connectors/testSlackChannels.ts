import { vi } from 'vitest';
import type { SlackChannelList, SlackChannelRow } from './slackChannels';

// Fake channels in the Slack escalations D3 contract's shapes (§2.2, §3).
// Nothing is sent to Slack. No em dash.

const row = (fields: Partial<SlackChannelRow> & Pick<SlackChannelRow, 'id' | 'name'>): SlackChannelRow => ({
  included: true,
  member: true,
  shared: false,
  private: false,
  record: null,
  conversations: 0,
  join_error: '',
  read_at: '2026-10-17T09:30:00Z',
  chosen_by: null,
  ...fields,
});

export const EVENTS_AT = '2026-10-17T09:25:00Z';

export const CHANNEL_ROWS: SlackChannelRow[] = [
  row({ id: 'C0CA7PPRP7A', name: 'all-alfiee', conversations: 12 }),
  row({ id: 'C0RANDOM', name: 'random' }),
  row({ id: 'C0GLOBEX', name: 'globex-escalations', member: false, read_at: null }),
  row({ id: 'C0SHARED', name: 'globex-shared', shared: true, included: false, member: false, read_at: null }),
];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const refusal = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

/** GET and PATCH /connectors/<id>/slack-channels/... with `rows`; anything
 *  else goes to `fallback` (the page's other calls). `refuse`: the next
 *  PATCH answers it. */
export function stubSlackChannels({
  rows = CHANNEL_ROWS,
  canJoin = true,
  eventsAt = EVENTS_AT,
  refuse,
  fallback = () => ok([]),
}: {
  rows?: SlackChannelRow[];
  canJoin?: boolean;
  eventsAt?: string | null;
  refuse?: { status: number; body: unknown };
  fallback?: (url: URL, init?: RequestInit) => unknown;
} = {}) {
  let current = rows.map((r) => ({ ...r }));
  let refusing = refuse;
  const patches: { channel: string; body: Record<string, unknown> }[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const one = /\/connectors\/\d+\/slack-channels\/([^/]+)\/$/.exec(url.pathname);
    if (one && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push({ channel: decodeURIComponent(one[1]), body });
      if (refusing) {
        const r = refusing;
        refusing = undefined;
        return refusal(r.status, r.body);
      }
      const found = current.find((c) => c.id === decodeURIComponent(one[1]));
      if (!found) return refusal(404, { code: 'NO_SUCH_CHANNEL', detail: 'No such channel.' });
      const next: SlackChannelRow = { ...found, join_error: '', chosen_by: { id: 1, name: 'Tushar Aggarwal' } };
      if (typeof body.included === 'boolean') next.included = body.included;
      if ('record' in body) {
        const record = body.record as { type: 'customer' | 'account'; id: number } | null;
        next.record = record ? { ...record, name: record.id === 29 ? 'Globex (QA)' : `Record ${record.id}` } : null;
      }
      current = current.map((c) => (c.id === next.id ? next : c));
      return ok(next);
    }
    if (/\/connectors\/\d+\/slack-channels\/$/.test(url.pathname)) {
      const list: SlackChannelList = { channels: current, can_join: canJoin, synced: current.filter((c) => c.included).length, total: current.length, events_at: eventsAt };
      return ok(list);
    }
    return fallback(url, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, patches };
}
