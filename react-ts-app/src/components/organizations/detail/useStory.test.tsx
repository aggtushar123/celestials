import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  buildStory,
  EMEA,
  manyItems,
  NORTH_AMERICA,
  PIZZA_ATTENTION,
  QUIET_ATTENTION,
  STORY_ITEMS,
  storyQueries,
  stubOrganizationPage,
} from '../../../features/organizations/testStory';
import { useStory } from './useStory';

function fakeResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

type Pending = { url: URL; resolve: (value: unknown) => void };

/** A fetch mock whose promises resolve only when told to, so a test can
 *  choose the order two in-flight requests land in — the shape the
 *  `generation`/`inFlight` refs and the effect's own `cancelled` flag exist
 *  to handle. */
function deferredFetchSpy() {
  const pending: Pending[] = [];
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Promise((resolve) => {
      pending.push({ url, resolve });
    });
  });
  vi.stubGlobal('fetch', spy);
  function resolveNext(match: (url: URL) => boolean, body: unknown, status = 200) {
    const index = pending.findIndex((entry) => match(entry.url));
    if (index === -1) throw new Error('deferredFetchSpy: no matching pending request');
    const [entry] = pending.splice(index, 1);
    entry.resolve(fakeResponse(status, body));
  }
  return { spy, resolveNext };
}

describe('useStory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads page one, then appends the next page with the cursor it was given', async () => {
    const spy = stubOrganizationPage({ items: manyItems(35) });
    const { result } = renderHook(() => useStory(7, 'limit=30', 0, true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    expect(result.current.next).toBe('30');
    expect(result.current.data?.counts.by_group.tasks).toBe(35);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items).toHaveLength(35);
    expect(result.current.next).toBeNull();
    expect(storyQueries(spy).map((query) => query.get('cursor'))).toEqual([null, '30']);
  });

  it('reads nothing while disabled', () => {
    const spy = stubOrganizationPage();
    const { result } = renderHook(() => useStory(7, 'limit=30', 0, false));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the last answer on screen while a new query loads', async () => {
    stubOrganizationPage();
    const { result, rerender } = renderHook(({ query }) => useStory(7, query, 0, true), {
      initialProps: { query: 'limit=30' },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    rerender({ query: 'group=tickets&limit=30' });
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toHaveLength(5);
    expect(result.current.next).toBeNull();
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([88]));
  });

  it('reports a failed read, and Try again reads again', async () => {
    stubOrganizationPage({ failStory: 1 });
    const { result } = renderHook(() => useStory(7, 'limit=30', 0, true));
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.data).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    expect(result.current.error).toBeNull();
  });

  it('reads again when the version changes (after something was added)', async () => {
    const spy = stubOrganizationPage();
    const { rerender } = renderHook(({ version }) => useStory(7, 'limit=30', version, true), { initialProps: { version: 0 } });
    await waitFor(() => expect(storyQueries(spy)).toHaveLength(1));
    rerender({ version: 1 });
    await waitFor(() => expect(storyQueries(spy)).toHaveLength(2));
  });

  it('shows only the new query\'s items when the old query\'s page one lands late', async () => {
    const { resolveNext } = deferredFetchSpy();
    const { result, rerender } = renderHook(({ query }) => useStory(7, query, 0, true), {
      initialProps: { query: 'limit=30' },
    });
    rerender({ query: 'group=tickets&limit=30' });

    // The new query's page one lands first.
    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname) && url.searchParams.get('group') === 'tickets',
      buildStory(new URLSearchParams('group=tickets&limit=30'), STORY_ITEMS, PIZZA_ATTENTION, [EMEA.id, NORTH_AMERICA.id]),
    );
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([88]));

    // The old query's page one, abandoned, lands after — it must never show.
    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname) && !url.searchParams.get('group'),
      buildStory(new URLSearchParams('limit=30'), STORY_ITEMS, PIZZA_ATTENTION, [EMEA.id, NORTH_AMERICA.id]),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.items.map((item) => item.id)).toEqual([88]);
  });

  it('never appends a stale load-more page (a concurrent call is a no-op, and an ABA query change is dropped)', async () => {
    const { spy, resolveNext } = deferredFetchSpy();
    const { result, rerender } = renderHook(({ query }) => useStory(7, query, 0, true), {
      initialProps: { query: 'limit=30' },
    });

    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname) && !url.searchParams.get('cursor') && !url.searchParams.get('group'),
      buildStory(new URLSearchParams('limit=30'), manyItems(35), QUIET_ATTENTION, []),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    expect(result.current.next).toBe('30');

    let more: Promise<void> | undefined;
    act(() => {
      more = result.current.loadMore();
    });

    // inFlight: a second call while one is already running issues no request.
    const callsBeforeSecondCall = spy.mock.calls.length;
    act(() => {
      void result.current.loadMore();
    });
    expect(spy.mock.calls.length).toBe(callsBeforeSecondCall);

    // Away, then back to the exact same query: the key recurs (an ABA change) while the first load-more is still in flight.
    rerender({ query: 'group=tickets&limit=30' });
    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname) && url.searchParams.get('group') === 'tickets',
      buildStory(new URLSearchParams('group=tickets&limit=30'), STORY_ITEMS, PIZZA_ATTENTION, [EMEA.id, NORTH_AMERICA.id]),
    );
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([88]));

    rerender({ query: 'limit=30' });
    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname) && !url.searchParams.get('cursor') && !url.searchParams.get('group'),
      buildStory(new URLSearchParams('limit=30'), manyItems(3), QUIET_ATTENTION, []),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    // The very first load-more's page, abandoned two query changes ago, lands last — it must not be appended.
    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname) && url.searchParams.get('cursor') === '30',
      buildStory(new URLSearchParams('limit=30&cursor=30'), manyItems(35), QUIET_ATTENTION, []),
    );
    await act(async () => {
      await more;
    });
    expect(result.current.items).toHaveLength(3);
  });

  it('updates nothing and logs nothing when page one lands after unmount', async () => {
    const { resolveNext } = deferredFetchSpy();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useStory(7, 'limit=30', 0, true));
    unmount();

    resolveNext(
      (url) => /\/organizations\/7\/story\/$/.test(url.pathname),
      buildStory(new URLSearchParams('limit=30'), STORY_ITEMS, PIZZA_ATTENTION, [EMEA.id, NORTH_AMERICA.id]),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
