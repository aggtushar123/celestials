import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBundle, fetchHistory, fetchStepOptions, historyQuery, refreshBundle, rejectBundle, retryStep, runBundle, saveStep } from './bundlesApi';

type Seen = { method: string; url: string; body: unknown };

function spyFetch() {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push({ method: init?.method ?? 'GET', url: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
  return seen;
}

describe('bundle routes (agent bundles D1 contract §5, §10.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads, runs, retries and rejects a bundle', async () => {
    const seen = spyFetch();
    await fetchBundle(12);
    await runBundle(12, { steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }] });
    await retryStep(12, 41);
    await retryStep(12, 41, { title: 'Call now' });
    await rejectBundle(12, 'not_relevant', '');
    await rejectBundle(12, 'other', 'We called them.');
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /agents/bundles/12/',
      'POST /agents/bundles/12/run/',
      'POST /agents/bundles/12/steps/41/retry/',
      'POST /agents/bundles/12/steps/41/retry/',
      'POST /agents/bundles/12/reject/',
      'POST /agents/bundles/12/reject/',
    ]);
    expect(seen[1].body).toEqual({ steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }] });
    expect(seen[2].body).toEqual({});
    expect(seen[3].body).toEqual({ fields: { title: 'Call now' } });
    expect(seen[4].body).toEqual({ reason: 'not_relevant' });
    expect(seen[5].body).toEqual({ reason: 'other', note: 'We called them.' });
  });

  it('writes History filters into the query, page 1 left out', async () => {
    expect(historyQuery({ agent: null, step_kind: null, status: null, page: 1 })).toBe('');
    expect(historyQuery({ agent: 'cs', step_kind: 'task.create', status: 'partly_done', page: 3 })).toBe('?agent=cs&step_kind=task.create&status=partly_done&page=3');
    const seen = spyFetch();
    await fetchHistory({ agent: 'ops', step_kind: null, status: null, page: 1 });
    expect(seen[0].url).toBe('/agents/bundles/history/?agent=ops');
  });

  it('saves a step and refreshes a bundle (agent bundles D2 contract §4.1, §4.2)', async () => {
    const seen = spyFetch();
    await saveStep(12, 41, { fields: { title: 'Call today' } });
    await saveStep(12, 42, { selected: false });
    await refreshBundle(12);
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual(['PATCH /agents/bundles/12/steps/41/', 'PATCH /agents/bundles/12/steps/42/', 'POST /agents/bundles/12/refresh/']);
    expect(seen.map((r) => r.body)).toEqual([{ fields: { title: 'Call today' } }, { selected: false }, undefined]);
  });

  it('reads a step pick list (agent bundles D3 contract §5.2)', async () => {
    const seen = spyFetch();
    await fetchStepOptions(12, 41, 'jira_projects');
    await fetchStepOptions(12, 41, 'jira_issue_types', { project: 'SUP' });
    await fetchStepOptions(12, 42, 'jira_assignees', { project: 'SUP', query: 'pri ya' });
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /agents/bundles/12/steps/41/options/jira_projects/',
      'GET /agents/bundles/12/steps/41/options/jira_issue_types/?project=SUP',
      'GET /agents/bundles/12/steps/42/options/jira_assignees/?project=SUP&query=pri+ya',
    ]);
  });

  it('asks for the live Slack list with live=1', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ options: [], more: false, note: null }) }));
    vi.stubGlobal('fetch', spy);
    await fetchStepOptions(12, 41, 'slack_channels', { query: 'esc', live: true });
    const url = new URL(String((spy.mock.calls[0] as unknown[])[0]));
    expect([url.searchParams.get('live'), url.searchParams.get('query')]).toEqual(['1', 'esc']);
  });
});
