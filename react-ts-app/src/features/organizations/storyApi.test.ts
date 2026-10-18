import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStory, fetchThread, storyPath, storyQuery } from './storyApi';
import { manyItems, requestPaths, storyQueries, stubOrganizationPage, THREAD_ITEMS } from './testStory';
import type { StoryResponse } from './storyTypes';

const ALL = { group: '' as const, sources: [], account: '', q: '' };

describe('storyQuery', () => {
  it('writes only the filters that are set, in one fixed order, with the page size', () => {
    expect(storyQuery(ALL)).toBe('limit=30');
    const query = new URLSearchParams(
      storyQuery({ group: 'conversations', sources: ['email', 'call'], account: 'none', q: '  renewal ' }),
    );
    expect([...query.keys()]).toEqual(['group', 'source', 'account', 'q', 'limit']);
    expect(query.get('source')).toBe('call,email');
    expect(query.get('account')).toBe('none');
    expect(query.get('q')).toBe('renewal');
    expect(new URLSearchParams(storyQuery(ALL, 5)).get('limit')).toBe('5');
  });

  it('sorts the sources, so equal filters make the same key whatever order they were chosen in', () => {
    const a = storyQuery({ ...ALL, group: 'conversations', sources: ['email', 'call'] });
    const b = storyQuery({ ...ALL, group: 'conversations', sources: ['call', 'email'] });
    expect(a).toBe(b);
    expect(new URLSearchParams(a).get('source')).toBe('call,email');
  });
});

describe('fetchStory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads GET /api/v1/organizations/<id>/story/ and passes the cursor back verbatim', async () => {
    const spy = stubOrganizationPage({ items: manyItems(35) });
    const first = await fetchStory(7, storyQuery(ALL));
    expect(first.items).toHaveLength(30);
    expect(first.next_cursor).toBe('30');
    const second = await fetchStory(7, storyQuery(ALL), first.next_cursor);
    expect(second.items).toHaveLength(5);
    expect(second.next_cursor).toBeNull();
    expect(storyQueries(spy).map((query) => query.get('cursor'))).toEqual([null, '30']);
    expect(new URL(String(spy.mock.calls[0][0])).pathname).toBe('/api/v1/organizations/7/story/');
    expect(storyPath(7)).toBe('/organizations/7/story/');
  });

  it('counts each facet without its own filter, as the backend does', async () => {
    stubOrganizationPage();
    const data = await fetchStory(7, storyQuery({ ...ALL, group: 'tickets' }));
    expect(data.items.map((item) => `${item.kind}:${item.id}`)).toEqual(['ticket:88']);
    expect(data.counts.by_group).toEqual({ all: 5, conversations: 2, tickets: 1, tasks: 1, feedback: 0, health: 1 });
    expect(data.counts.by_kind).toEqual({
      activity: 0,
      calendar_event: 0,
      call: 1,
      email: 1,
      health: 1,
      note: 0,
      slack: 0,
      survey: 0,
      task: 1,
      ticket: 1,
    });
    expect(data.counts.by_account).toEqual({ all: 1, none: 0, '31': 0, '32': 1 });
  });

  it('reads one email thread through ?thread=, every page, oldest first', async () => {
    const spy = stubOrganizationPage();
    const thread = await fetchThread(7, 't-1');
    expect(thread.map((item) => item.id)).toEqual([40, 41]);
    expect(thread.every((item) => item.kind === 'email' && item.link.thread_id === 't-1')).toBe(true);
    expect(requestPaths(spy)).toEqual(['GET /organizations/7/story/']);
    expect(Object.fromEntries(storyQueries(spy)[0])).toEqual({ thread: 't-1', limit: '100' });
  });

  it('follows the cursor across a paged thread, returning every message oldest first', async () => {
    // THREAD_ITEMS is [41 (newer), 40 (older)], newest first, as the backend
    // sends it. Split across two pages, with next_cursor set on the first.
    const counts: StoryResponse['counts'] = {
      by_group: { all: 0, conversations: 0, tickets: 0, tasks: 0, feedback: 0, health: 0 },
      by_kind: { activity: 0, calendar_event: 0, call: 0, email: 0, health: 0, note: 0, slack: 0, survey: 0, task: 0, ticket: 0 },
      by_account: { all: 0, none: 0 },
    };
    const attention: StoryResponse['attention'] = {
      renewal: null,
      tickets: null,
      overdue_tasks: null,
      questions: null,
      anomaly: null,
    };
    const spy = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const onPageTwo = url.searchParams.get('cursor') === 'page-2';
      const body: StoryResponse = onPageTwo
        ? { items: [THREAD_ITEMS[1]], next_cursor: null, counts, attention }
        : { items: [THREAD_ITEMS[0]], next_cursor: 'page-2', counts, attention };
      return { ok: true, status: 200, json: async () => body };
    });
    vi.stubGlobal('fetch', spy);

    const thread = await fetchThread(7, 't-1');

    expect(thread.map((item) => item.id)).toEqual([40, 41]);
    expect(storyQueries(spy).map((query) => query.get('cursor'))).toEqual([null, 'page-2']);
    expect(storyQueries(spy).map((query) => query.get('thread'))).toEqual(['t-1', 't-1']);
  });
});
