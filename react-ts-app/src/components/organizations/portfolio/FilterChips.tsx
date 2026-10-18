import { filterChips } from '../../../features/organizations/filterChips';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { FilterChipRow, QUIET, RemovableChip } from '../../ui';

/** One active filter, for any params shape: removing it writes `patch`. */
export interface ActiveFilter<P> {
  key: string;
  label: string;
  patch: Partial<P>;
}

/** The active filters under a toolbar (UI foundations spec §5.4): one
 *  removable chip each, then Clear all. Nothing while none is active; the
 *  count lives in the toolbar. Organizations, Accounts and Pipelines. */
export function ActiveFilterChips<P>({
  chips,
  onChange,
  onClearAll,
}: {
  chips: ActiveFilter<P>[];
  onChange: (patch: Partial<P>) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <FilterChipRow label="Active filters">
      {chips.map((chip) => (
        <RemovableChip key={chip.key} label={chip.label} onRemove={() => onChange(chip.patch)} />
      ))}
      <button type="button" onClick={onClearAll} className={QUIET}>
        Clear all
      </button>
    </FilterChipRow>
  );
}

/** The portfolios' active filters, from their params and options. */
export function FilterChips({
  params,
  options,
  onChange,
  onClearAll,
}: {
  params: PortfolioParams;
  options: FilterOptions | null;
  onChange: (patch: Partial<PortfolioParams>) => void;
  onClearAll: () => void;
}) {
  return <ActiveFilterChips<PortfolioParams> chips={filterChips(params, options)} onChange={onChange} onClearAll={onClearAll} />;
}
