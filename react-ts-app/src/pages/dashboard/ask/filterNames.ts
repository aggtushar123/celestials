import { createContext, useContext, useEffect } from 'react';
import type { FilterNames, SharedFilterKey } from '../../../components/copilot/dashboardLabels';
import type { ToolbarFilter } from '../shared/DashboardToolbar';

/** The names each view's filter options give the shared filter values. Only
 *  DashboardToolbar sees a view's options, so it reports them here, and the
 *  Ask rail's chips can say "Owner: Priya" rather than "Owner: 2". */
export interface FilterNamesState {
  names: FilterNames;
  report: (key: SharedFilterKey, names: Record<string, string>) => void;
}

export const FilterNamesContext = createContext<FilterNamesState | null>(null);

const SHARED = new Set<string>(['owner', 'lifecycle', 'customer']);

/** value → the name the chip shows, skipping "All" (''). */
export function namesOf(filter: ToolbarFilter): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of filter.options) {
    const list = 'options' in entry ? entry.options : [entry];
    for (const option of list) if (option.value) out[option.value] = option.display ?? option.label;
  }
  return out;
}

export function useReportFilterNames(filters: ToolbarFilter[]): void {
  const report = useContext(FilterNamesContext)?.report;
  // A string, so the effect runs when the options change rather than on
  // every render's new array.
  const signature = JSON.stringify(filters.filter((f) => SHARED.has(f.key)).map((f) => [f.key, namesOf(f)]));
  useEffect(() => {
    if (!report) return;
    for (const [key, names] of JSON.parse(signature) as [SharedFilterKey, Record<string, string>][]) report(key, names);
  }, [report, signature]);
}

export function useFilterNames(): FilterNames {
  return useContext(FilterNamesContext)?.names ?? {};
}
