import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_GROUP,
  EMPTY_FILTERS,
  parseParams,
  toUrlSearch,
  type PortfolioParams,
} from '../../../features/organizations/portfolioParams';
import type { GroupKey } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';

/** The portfolio's URL state, shared by the List and the Board, parsed with
 *  the kind's own parameters (its sorts, groups and filters). An absent
 *  `group` is the route's `defaultGroup` (health on the List, lifecycle on
 *  the Board). A group the URL already names stays in it, even the route's
 *  own default, so a pick carries across the tabs. Updates replace the
 *  history entry, like the dashboard's filters, so Back leaves the page
 *  rather than undoing a chip. */
export function usePortfolioParams(defaultGroup: GroupKey = DEFAULT_GROUP) {
  const [search, setSearch] = useSearchParams();
  const spec = usePortfolioKind().params;
  const params = useMemo(() => parseParams(search, defaultGroup, spec), [search, defaultGroup, spec]);

  const update = useCallback(
    (patch: Partial<PortfolioParams>) => {
      setSearch(
        (prev) => toUrlSearch({ ...parseParams(prev, defaultGroup, spec), ...patch }, defaultGroup, prev),
        { replace: true },
      );
    },
    [setSearch, defaultGroup, spec],
  );

  const clearFilters = useCallback(() => update(EMPTY_FILTERS), [update]);

  return { params, update, clearFilters };
}
