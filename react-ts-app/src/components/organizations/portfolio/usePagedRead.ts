import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, SessionChangedError } from '../../../lib/apiClient';
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';

export function errorMessage(err: unknown, fallback: string): string {
  // A dropped answer (the session changed) is not a failure to show. Components
  // that test `instanceof ApiError` themselves still show their fallback text
  // for one; low risk, as sign-out unmounts them.
  if (err instanceof SessionChangedError) return '';
  return err instanceof ApiError ? err.message : fallback;
}

/** What a cursor-paged endpoint returns, at least. */
export interface Paged<R> {
  results: R[];
  next_cursor: string | null;
}

type Loaded<R, P extends Paged<R>> =
  | { key: string; query: string; data: P; rows: R[]; next: string | null }
  | { key: string; error: string };

type MoreState = { key: string; token: number; loading: boolean; error: string | null };

export interface PagedRead<R, P extends Paged<R>> {
  /** The latest response. While a new query loads, the previous one stays so
   *  the list does not flash empty. `loading` says it is stale. */
  data: P | null;
  rows: R[];
  next: string | null;
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: () => Promise<void>;
  retry: () => void;
  /** The key of the data currently shown (null before any page has landed).
   *  Unlike `rows`, it does not change on a `loadMore` append — only when a
   *  fresh page one lands, including a reload of the same query. */
  loadedKey: string | null;
  /** The query of the data currently shown (null before any page has
   *  landed). Unlike `loadedKey` it ignores the version and retry counters,
   *  so a reload of the same query leaves it unchanged: the signal for
   *  "a different list landed" (the page clears or prunes the selection on it). */
  loadedQuery: string | null;
}

/** One cursor-paged read through `read` (a portfolio kind's endpoint, or a
 *  Pipelines kind's). A frame, a grouped section and a board column are each
 *  one of these. Loading is derived from which query the stored answer
 *  belongs to, so no state is set synchronously inside the effect. `read`
 *  and `noun` must be stable: they are effect dependencies. */
export function usePagedRead<R, P extends Paged<R>>(
  read: (query: string) => Promise<P>,
  noun: PortfolioNoun,
  query: string,
  enabled: boolean,
  version: number,
  onLoaded?: (rows: R[]) => void,
): PagedRead<R, P> {
  const [attempt, setAttempt] = useState(0);
  const key = `${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded<R, P> | null>(null);
  const [moreState, setMoreState] = useState<MoreState | null>(null);
  // A generation counter, bumped every time the fetch effect's cleanup runs
  // (a params/version change, or unmount) — never reset, so it never repeats.
  // The `key` string, by contrast, CAN repeat (a filter changed away and back
  // reproduces the same string) — guarding a `loadMore` by key alone lets an
  // answer abandoned under the first occurrence of that key be mistaken for
  // current when the key recurs (an ABA race). `loadMoreCallRef` holds the
  // generation a `loadMore` call was issued under, or null when none is in
  // flight: a second concurrent call sees it already set and backs off, and
  // a call whose generation no longer matches `generationRef` knows its
  // answer is stale and drops it — never appended, never surfaced as an
  // error, and never able to clear a different (later) call's own guard.
  const generationRef = useRef(0);
  const loadMoreCallRef = useRef<number | null>(null);
  // The latest callback, so a caller passing an inline function does not
  // refetch on every render.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    read(query).then(
      (data) => {
        if (cancelled) return;
        setLoaded({ key, query, data, rows: data.results, next: data.next_cursor });
        onLoadedRef.current?.(data.results);
      },
      (err: unknown) => {
        if (!cancelled && !(err instanceof SessionChangedError)) setLoaded({ key, error: errorMessage(err, `Could not load ${noun.many}.`) });
      },
    );
    return () => {
      cancelled = true;
      generationRef.current += 1;
      loadMoreCallRef.current = null;
      // Any in-flight (or just-finished) load-more belonged to the
      // generation that's ending — its answer, whenever it lands, is
      // dropped anyway (below), but the spinner must not wait for that to
      // clear it: nothing about the new generation has asked for a page two
      // yet.
      setMoreState(null);
    };
  }, [enabled, key, query, read, noun]);

  const current = loaded && 'data' in loaded ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current || current.key !== key || !current.next || loadMoreCallRef.current !== null) return;
    const token = generationRef.current;
    loadMoreCallRef.current = token;
    const cursor = current.next;
    setMoreState({ key, token, loading: true, error: null });
    try {
      const page = await read(`${query}&cursor=${encodeURIComponent(cursor)}`);
      if (generationRef.current !== token) {
        // Superseded — drop the answer. Never clear a newer call's own
        // moreState; only clear if it's still (somehow) this stale one's.
        setMoreState((prev) => (prev && prev.token === token ? null : prev));
        return;
      }
      setLoaded((prev) =>
        prev && 'data' in prev && prev.key === key
          ? { ...prev, rows: [...prev.rows, ...page.results], next: page.next_cursor }
          : prev,
      );
      onLoadedRef.current?.(page.results);
      setMoreState({ key, token, loading: false, error: null });
    } catch (err) {
      if (err instanceof SessionChangedError) return;
      if (generationRef.current !== token) {
        // Superseded — never surface a stale error.
        setMoreState((prev) => (prev && prev.token === token ? null : prev));
        return;
      }
      setMoreState({ key, token, loading: false, error: errorMessage(err, `Could not load more ${noun.many}.`) });
    } finally {
      if (loadMoreCallRef.current === token) loadMoreCallRef.current = null;
    }
  }, [current, key, query, read, noun]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    data: current?.data ?? null,
    rows: current?.rows ?? [],
    next: current?.next ?? null,
    loading: enabled && loaded?.key !== key,
    error: loaded && 'error' in loaded && loaded.key === key ? loaded.error : null,
    loadingMore: moreState?.key === key ? moreState.loading : false,
    moreError: moreState?.key === key ? moreState.error : null,
    loadMore,
    retry,
    loadedKey: current?.key ?? null,
    loadedQuery: current?.query ?? null,
  };
}
