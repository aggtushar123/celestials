import { useCallback, useState } from 'react';
import { MAX_IDS } from '../../../features/organizations/portfolioParams';

/** Selected account ids, capped at MAX_IDS (matching the `ids` filter's own
 *  cap). There is no reset keyed off the filter string: the page calls
 *  `prune(visibleIds)` or `clear()` once a different list has actually
 *  landed (the portfolio hook's `loadedQuery` changed), never on a reload
 *  of the same query, so ids a bulk action failed on stay selected. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= MAX_IDS) return prev;
      return new Set(prev).add(id);
    });
  }, []);

  const replace = useCallback((ids: number[]) => setSelected(new Set(ids.slice(0, MAX_IDS))), []);
  const clear = useCallback(() => setSelected(new Set()), []);

  /** Drops any selected id not in `visibleIds`. Returns the same Set
   *  (no re-render) when nothing changes. */
  const prune = useCallback((visibleIds: number[]) => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleIds);
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  return {
    selected,
    selecting: selected.size > 0,
    atLimit: selected.size >= MAX_IDS,
    toggle,
    replace,
    clear,
    prune,
  };
}
