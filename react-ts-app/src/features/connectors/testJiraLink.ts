// Contract-shaped stubs for the Jira link (round 2 D2 contract §2). Fake data only; no em dash.
import { vi } from 'vitest';
import type { JiraLink, JiraLinkState } from './jiraLink';

export const LINKED: JiraLink = {
  name: 'Carl Lee',
  email: 'carl@acme.io',
  status: 'linked',
  sites: [{ url: 'https://acme.atlassian.net', name: 'acme' }],
  covers: [6],
  linked_at: '2026-10-14T09:00:00Z',
};
export const LOST_LINK: JiraLink = { ...LINKED, status: 'lost' };
export const JIRA_STATE: JiraLinkState = { configured: true, connectors: [{ id: 6, name: 'Jira', host: 'acme.atlassian.net' }], link: LINKED };

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

export function stubJiraLink(initial: Partial<JiraLinkState> = {}, opts: { failRead?: boolean; failStart?: { status: number; body: unknown }; failUnlink?: { status: number; body: unknown }; next?: Fetch } = {}) {
  const state: JiraLinkState = { ...JIRA_STATE, ...initial };
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname !== '/api/v1/connectors/jira-link/') return opts.next ? opts.next(input, init) : json(404, {});
    const method = init?.method ?? 'GET';
    if (method === 'GET') return opts.failRead ? json(500, {}) : json(200, state);
    if (method === 'POST' && opts.failStart) return json(opts.failStart.status, opts.failStart.body);
    if (method === 'POST') return json(200, { authorize_url: 'https://auth.atlassian.com/authorize?state=s1' });
    if (opts.failUnlink) return json(opts.failUnlink.status, opts.failUnlink.body);
    state.link = null;
    return json(204, null);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}
