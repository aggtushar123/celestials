import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJiraLink, startJiraLink, unlinkJira } from './jiraLink';

afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe('the Jira link API (round 2 D2 contract §2)', () => {
  it('reads my link', async () => {
    const spy = answer(200, { configured: true, connectors: [], link: null });
    vi.stubGlobal('fetch', spy);
    expect(await fetchJiraLink()).toEqual({ configured: true, connectors: [], link: null });
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/connectors/jira-link/');
  });

  it('starts linking with a POST and unlinks with a DELETE', async () => {
    const spy = answer(200, { authorize_url: 'https://auth.atlassian.com/authorize?x=1' });
    vi.stubGlobal('fetch', spy);
    expect((await startJiraLink()).authorize_url).toContain('auth.atlassian.com');
    expect(((spy.mock.calls[0] as unknown[])[1] as RequestInit).method).toBe('POST');
    const gone = answer(204, null);
    vi.stubGlobal('fetch', gone);
    await unlinkJira();
    expect(((gone.mock.calls[0] as unknown[])[1] as RequestInit).method).toBe('DELETE');
  });

  it('starts linking with credentials, so the browser keeps the same-browser cookie (SOC2:AUTH-01)', async () => {
    // The page and the API are different origins locally: without
    // credentials the browser drops the start's Set-Cookie and every
    // callback is refused as "another browser".
    const spy = answer(200, { authorize_url: 'https://auth.atlassian.com/authorize?x=1' });
    vi.stubGlobal('fetch', spy);
    await startJiraLink();
    expect(((spy.mock.calls[0] as unknown[])[1] as RequestInit).credentials).toBe('include');
  });
});
