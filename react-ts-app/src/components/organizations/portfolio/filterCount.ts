import { countText, filterChips } from '../../../features/organizations/filterChips';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';

/** The toolbar's live count (UI foundations spec §5.6): "14 organizations",
 *  "3 of 120 organizations" under a filter, the kind's own words. */
export function useFilterCount(
  params: PortfolioParams,
  options: FilterOptions | null,
  count: number | null,
  total: number | null,
  failed = false,
): string {
  const kind = usePortfolioKind();
  return countText(count, total, filterChips(params, options).length > 0, failed, kind.noun);
}
