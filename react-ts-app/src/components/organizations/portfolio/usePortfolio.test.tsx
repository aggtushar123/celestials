import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePagedPortfolio, usePortfolio } from './usePortfolio';
import { useSelection } from './useSelection';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio, portfolioQueries, stubPortfolio } from '../../../features/organizations/testPortfolio';
import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';

const params = (search = '') => parseParams(new URLSearchParams(search));

/** A fetch stub whose responses are resolved by hand, in whatever order the
 *  test picks, so a "superseded request lands late" race can be reproduced. */
function stubDeferred() {
  const calls: { search: string; resolve: (body: PortfolioResponse) => void }[] = [];
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Promise((resolve) => {
      calls.push({
        search: url.search,
        resolve: (body: PortfolioResponse) => resolve({ ok: true, status: 200, json: async () => body }),
      });
    });
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}

const answer = (search: string) => buildPortfolio(new URLSearchParams(search.slice(1)));

describe('usePortfolio', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the frame only (limit 1) when grouped', async () => {
    const spy = stubPortfolio();
    const { result } = renderHook(() => usePortfolio(params(), 0));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const [frame] = portfolioQueries(spy);
    expect(frame.get('limit')).toBe('1');
    expect(frame.get('group')).toBe('health');
    expect(result.current.rows).toEqual([]);
    expect(result.current.data?.groups.map((g) => g.key)).toEqual(['average', 'good']);
    expect(result.current.total).toBeNull();
  });

  it('pages an ungrouped list with the cursor and reports each page', async () => {
    const spy = stubPortfolio({
      portfolio: (q) => {
        const two = new URLSearchParams(q);
        two.set('limit', '2');
        return buildPortfolio(two);
      },
    });
    const onLoaded = vi.fn();
    const { result } = renderHook(() => usePortfolio(params('group=none&include_churned=1'), 0, onLoaded));
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual([7, 1]));
    expect(portfolioQueries(spy)[0].get('limit')).toBe('50');
    expect(result.current.next).toBe('2');
    await act(() => result.current.loadMore());
    expect(result.current.rows.map((r) => r.id)).toEqual([7, 1, 2]);
    expect(result.current.next).toBeNull();
    expect(portfolioQueries(spy).at(-1)?.get('cursor')).toBe('2');
    expect(onLoaded).toHaveBeenCalledTimes(2);
  });

  it('probes the unfiltered book for M when filtered, keeping the churn scope', async () => {
    const spy = stubPortfolio();
    const { result } = renderHook(() => usePortfolio(params('health=average'), 0));
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.data?.count).toBe(1);
    const probe = portfolioQueries(spy).find((q) => q.toString() === 'limit=1');
    expect(probe).toBeDefined();

    const churn = renderHook(() => usePortfolio(params('include_churned=1&owner=2'), 0));
    await waitFor(() => expect(churn.result.current.total).toBe(3));
  });

  it('re-probes M on its own version only, so a reload that cannot change M (a lifecycle move) skips it', async () => {
    const spy = stubPortfolio();
    const { result, rerender } = renderHook(({ version, totalVersion }) => usePortfolio(params('health=average'), version, undefined, totalVersion), {
      initialProps: { version: 0, totalVersion: 0 },
    });
    await waitFor(() => expect(result.current.total).toBe(2));
    const probes = () => portfolioQueries(spy).filter((q) => q.toString() === 'limit=1').length;
    expect(probes()).toBe(1);
    rerender({ version: 1, totalVersion: 0 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(probes()).toBe(1);
    expect(result.current.total).toBe(2);
    rerender({ version: 2, totalVersion: 1 });
    await waitFor(() => expect(probes()).toBe(2));
  });

  it('clamps the M probe so it is never less than the frame count', async () => {
    stubPortfolio({
      portfolio: (q) => {
        const built = buildPortfolio(q);
        // Pretend the unfiltered-book probe answers with a stale, smaller M.
        return q.toString() === 'limit=1' ? { ...built, count: 1 } : built;
      },
    });
    const { result } = renderHook(() => usePortfolio(params('health=average,good'), 0));
    await waitFor(() => expect(result.current.total).not.toBeNull());
    expect(result.current.data?.count).toBe(2);
    expect(result.current.total).toBe(2);
  });

  it('never pages the frame itself when grouped, even if the backend implies more', async () => {
    const spy = stubPortfolio({ portfolio: (q) => ({ ...buildPortfolio(q), next_cursor: '1' }) });
    const { result } = renderHook(() => usePortfolio(params(), 0));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.next).toBeNull();
    await act(() => result.current.loadMore());
    expect(portfolioQueries(spy)).toHaveLength(1);
  });

  it('reports an error and retries', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Boom' } } : buildPortfolio(q)) });
    const { result } = renderHook(() => usePortfolio(params(), 0));
    await waitFor(() => expect(result.current.error).toBe('Boom'));
    expect(result.current.data).toBeNull();
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('refetches when the version changes', async () => {
    const spy = stubPortfolio();
    const { result, rerender } = renderHook(({ version }) => usePortfolio(params(), version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ version: 1 });
    await waitFor(() => expect(portfolioQueries(spy)).toHaveLength(2));
  });

  it('reports the loaded query, which a version bump does not change', async () => {
    stubPortfolio();
    const { result, rerender } = renderHook(({ search, version }) => usePortfolio(params(search), version), {
      initialProps: { search: '', version: 0 },
    });
    expect(result.current.loadedQuery).toBeNull();
    await waitFor(() => expect(result.current.loadedQuery).not.toBeNull());
    const first = result.current.loadedQuery;
    expect(first).toContain('group=health');
    rerender({ search: '', version: 1 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadedQuery).toBe(first);
    rerender({ search: 'health=good', version: 1 });
    await waitFor(() => expect(result.current.loadedQuery).toContain('health=good'));
  });

  it('does not fetch while disabled', async () => {
    const spy = stubPortfolio();
    const { result } = renderHook(() => usePagedPortfolio('group=health&group_value=poor&limit=25', false, 0));
    expect(result.current.loading).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  // Ruling: a stale cursor is tied to the old filters/sort/group and silently
  // returns page one, so a superseded request landing late must never win.
  it('ignores a response from a superseded request when the query changes mid-flight', async () => {
    const calls = stubDeferred();
    const { result, rerender } = renderHook(({ query }) => usePagedPortfolio(query, true, 0), {
      initialProps: { query: 'owner=2&limit=50' },
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    rerender({ query: 'owner=3&limit=50' });
    await waitFor(() => expect(calls).toHaveLength(2));

    // The fresh (second) request lands first.
    await act(async () => {
      calls[1].resolve(answer(calls[1].search));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.rows.map((r) => r.id)).toEqual([1]);

    // The superseded (first) request resolves late; it must be ignored.
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(result.current.rows.map((r) => r.id)).toEqual([1]);
    expect(result.current.loading).toBe(false);
  });

  it('does not send a stale cursor when Show more follows a params change', async () => {
    const calls = stubDeferred();
    const { result, rerender } = renderHook(({ query }) => usePagedPortfolio(query, true, 0), {
      initialProps: { query: 'limit=1' },
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(result.current.next).toBe('1');

    // Params change before the next page is requested.
    rerender({ query: 'owner=2&limit=1' });
    await waitFor(() => expect(calls).toHaveLength(2));

    // "Show more" clicked before the new page-one request has landed: it
    // must not fire a request carrying the old (now-stale) cursor.
    await act(() => result.current.loadMore());
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.search.includes('cursor='))).toBe(false);

    await act(async () => {
      calls[1].resolve(answer(calls[1].search));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.rows.map((r) => r.id)).toEqual([7]);
  });

  it('does nothing on a second concurrent Show more while one is in flight', async () => {
    const calls = stubDeferred();
    const onLoaded = vi.fn();
    const { result } = renderHook(() => usePagedPortfolio('limit=1', true, 0, onLoaded));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(result.current.next).toBe('1');
    onLoaded.mockClear();

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await waitFor(() => expect(calls).toHaveLength(2));

    await act(async () => {
      calls[1].resolve(answer(calls[1].search));
    });
    expect(result.current.loading).toBe(false);

    // Exactly one load-more request went out, and rows were appended once.
    expect(calls).toHaveLength(2);
    expect(result.current.rows.map((r) => r.id)).toEqual([7, 1]);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('clears a stale load-more error once the params change', async () => {
    stubPortfolio({
      portfolio: (q) =>
        q.has('cursor') ? { status: 500, body: { detail: 'Boom' } } : (() => {
          const one = new URLSearchParams(q);
          one.set('limit', '1');
          return buildPortfolio(one);
        })(),
    });
    const { result, rerender } = renderHook(({ query }) => usePagedPortfolio(query, true, 0), {
      initialProps: { query: 'limit=1' },
    });
    await waitFor(() => expect(result.current.next).not.toBeNull());

    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreError).toBe('Boom'));

    rerender({ query: 'owner=2&limit=1' });
    expect(result.current.moreError).toBeNull();
  });

  it('drops a load-more response that lands after the params have changed', async () => {
    const calls = stubDeferred();
    const onLoaded = vi.fn();
    const { result, rerender } = renderHook(({ query }) => usePagedPortfolio(query, true, 0, onLoaded), {
      initialProps: { query: 'limit=1' },
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(result.current.next).toBe('1');
    onLoaded.mockClear();

    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(result.current.loadingMore).toBe(true);

    // Params change while that load-more is still in flight.
    rerender({ query: 'owner=2&limit=1' });
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(result.current.loadingMore).toBe(false);

    // The stale load-more's answer lands late; it must be dropped entirely.
    await act(async () => {
      calls[1].resolve(answer(calls[1].search));
    });
    expect(onLoaded).not.toHaveBeenCalled();
    expect(result.current.moreError).toBeNull();

    // The fresh page-one request for the new params resolves normally.
    await act(async () => {
      calls[2].resolve(answer(calls[2].search));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.rows.map((r) => r.id)).toEqual([7]);
  });

  it('does not warn or update state when unmounted while the initial fetch is in flight', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = stubDeferred();
    const { unmount } = renderHook(() => usePagedPortfolio('limit=50', true, 0));
    await waitFor(() => expect(calls).toHaveLength(1));
    unmount();
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not warn or update state when unmounted while Show more is in flight', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = stubDeferred();
    const { result, unmount } = renderHook(() => usePagedPortfolio('limit=1', true, 0));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(result.current.next).toBe('1');

    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(calls).toHaveLength(2));

    unmount();
    await act(async () => {
      calls[1].resolve(answer(calls[1].search));
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // ABA: the key goes A -> B -> A while a Show more issued under the first A
  // is still in flight. A guard keyed on the `key` string alone cannot tell
  // that second "A" apart from the first, so the abandoned answer can be let
  // through (appending a duplicate page) and its cleanup can clobber a
  // legitimate later call's own in-flight guard. A per-call token that only
  // ever increases (never reused) is required instead.
  it('does not resurrect a stale load-more when the key returns to a previous value (A to B to A)', async () => {
    const calls = stubDeferred();
    const { result, rerender } = renderHook(({ query }) => usePagedPortfolio(query, true, 0), {
      initialProps: { query: 'limit=1' }, // "A"
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
      calls[0].resolve(answer(calls[0].search));
    });
    expect(result.current.next).toBe('1');

    // Start "Show more" under A; leave its fetch pending.
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(result.current.loadingMore).toBe(true);

    // Switch to B while that request is still in flight.
    rerender({ query: 'owner=2&limit=1' }); // "B"
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(result.current.loadingMore).toBe(false);
    await act(async () => {
      calls[2].resolve(answer(calls[2].search));
    });
    expect(result.current.loading).toBe(false);

    // Switch back to the exact same key string as the original "A".
    rerender({ query: 'limit=1' });
    await waitFor(() => expect(calls).toHaveLength(4));
    await act(async () => {
      calls[3].resolve(answer(calls[3].search));
    });
    await waitFor(() => expect(result.current.next).toBe('1'));

    // Bug check 1: returning to a previously-seen key must not resurrect the
    // abandoned load-more's spinner.
    expect(result.current.loadingMore).toBe(false);

    // A second "Show more" under the "new" A must still work.
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(calls).toHaveLength(5));
    expect(result.current.loadingMore).toBe(true);

    // The original, long-abandoned load-more finally resolves.
    await act(async () => {
      calls[1].resolve(answer(calls[1].search));
    });

    // Bug check 2: it must not append a duplicate page, and must not clear
    // the second call's own in-flight guard.
    expect(result.current.rows.map((r) => r.id)).toEqual([7]);
    expect(result.current.loadingMore).toBe(true);

    // The second (legitimate) "Show more" resolves normally.
    await act(async () => {
      calls[4].resolve(answer(calls[4].search));
    });
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.rows.map((r) => r.id)).toEqual([7, 1]);
  });

  // Ruling: selection resets when NEW rows have loaded (not on the filter
  // string alone), using the hook's `loadedKey` and useSelection's `prune`.
  it('prunes a selected id once new rows load after a params change', async () => {
    stubPortfolio();

    function useCombined(query: string) {
      const portfolio = usePagedPortfolio(query, true, 0);
      const selection = useSelection();
      useEffect(() => {
        selection.prune(portfolio.rows.map((r) => r.id));
        // Intentionally keyed on loadedKey alone: it changes only when a
        // fresh page one lands, never on a mere `loadMore` append.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [portfolio.loadedKey]);
      return { portfolio, selection };
    }

    const { result, rerender } = renderHook(({ query }) => useCombined(query), {
      initialProps: { query: 'include_churned=1' },
    });
    await waitFor(() => expect(result.current.portfolio.rows.length).toBe(3));

    act(() => result.current.selection.toggle(2)); // Initech: only visible with include_churned=1
    expect(result.current.selection.selected.has(2)).toBe(true);

    rerender({ query: '' });
    await waitFor(() => expect(result.current.portfolio.rows.map((r) => r.id)).toEqual([7, 1]));
    expect(result.current.selection.selected.has(2)).toBe(false);
  });
});
