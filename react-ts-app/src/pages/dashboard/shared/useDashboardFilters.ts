import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Dashboard filters live in the URL, not in component state.
 *
 * Each tab used to hold its own `useState` filters, so switching tabs reset
 * them and a filtered view could not be linked. The URL survives both. The
 * three shared keys are the ones every stats endpoint already reads.
 */
export const SHARED_KEYS = ['owner', 'lifecycle', 'customer'] as const;

/** The part of a query string that travels between dashboard areas: the
 *  shared book filters only. A view's own keys (a period, a scope) mean
 *  nothing in another area, so they are left behind. Returns '' or '?…'. */
export function sharedSearch(search: string): string {
  const current = new URLSearchParams(search);
  const shared = new URLSearchParams();
  for (const key of SHARED_KEYS) {
    const value = current.get(key);
    if (value) shared.set(key, value);
  }
  const query = shared.toString();
  return query ? `?${query}` : '';
}

export function useDashboardFilters(keys: readonly string[], defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of keys) out[key] = params.get(key) ?? defaults[key] ?? '';
    return out;
    // keys/defaults are module constants at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(
    (key: string, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(
    (toClear: readonly string[]) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of toClear) next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const activeCount = useCallback(
    (of: readonly string[]) => of.filter((key) => Boolean(params.get(key))).length,
    [params],
  );

  return { values, set, clear, activeCount };
}

/** The API query string for a set of filter values. Empty values are left
 *  out so "All" is the absence of a filter, which is what the backend reads. */
export function toQuery(values: Record<string, string>, rename: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(rename[key] ?? key, value);
  }
  return params.toString();
}
