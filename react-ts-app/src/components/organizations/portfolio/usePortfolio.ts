import { useCallback } from 'react';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type {
  FilterOptions,
  OrganizationFilters,
  PortfolioPage,
  PortfolioRow,
  PortfolioRowBase,
} from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { usePagedBook, type PagedBook } from './usePagedBook';
import { usePagedRead, type PagedRead } from './usePagedRead';

export { errorMessage } from './usePagedRead';

export const PAGE_SIZE = 50;
export const SECTION_PAGE_SIZE = 25;

export type PagedState<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters> = PagedRead<
  R,
  PortfolioPage<R, F>
>;

/** One cursor-paged read of the kind's portfolio endpoint (`kind.fetch`):
 *  `usePagedRead` with the kind's reader and noun. */
export function usePagedPortfolio<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>(
  query: string,
  enabled: boolean,
  version: number,
  onLoaded?: (rows: R[]) => void,
): PagedState<R, F> {
  const kind = usePortfolioKind();
  const read = useCallback((q: string) => kind.fetch(q) as Promise<PortfolioPage<R, F>>, [kind]);
  return usePagedRead<R, PortfolioPage<R, F>>(read, kind.noun, query, enabled, version, onLoaded);
}

export interface PortfolioState<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>
  extends PagedBook<R, PortfolioPage<R, F>> {
  /** M in "N of M": the whole visible book, in the view's scope (the kind's
   *  `totalQuery`). Null when no filter is active (the page then says
   *  "N organizations"). Never less than N (the frame's own filtered count)
   *  even if the probe's answer is momentarily stale. */
  total: number | null;
}

/** `totalVersion` reloads the M probe (default: `version`). The Board passes
 *  a smaller one that skips its lifecycle moves, which can't change M. */
export function usePortfolio<R extends PortfolioRowBase = PortfolioRow, F extends FilterOptions = OrganizationFilters>(
  params: PortfolioParams,
  version: number,
  onLoaded?: (rows: R[]) => void,
  totalVersion: number = version,
): PortfolioState<R, F> {
  const kind = usePortfolioKind();
  const read = useCallback((q: string) => kind.fetch(q) as Promise<PortfolioPage<R, F>>, [kind]);
  // Grouped, the frame only needs summary, groups, filters, count and
  // currency; each section reads its own rows (plan pre-flight #6).
  const grouped = params.group !== '';
  return usePagedBook<R, PortfolioPage<R, F>>(
    read,
    kind.noun,
    toApiQuery(params, { limit: String(grouped ? 1 : PAGE_SIZE) }),
    grouped,
    version,
    onLoaded,
    kind.totalQuery(params),
    totalVersion,
  );
}
