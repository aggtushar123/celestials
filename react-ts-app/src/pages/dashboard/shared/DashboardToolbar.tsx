import { NavLink, useLocation } from 'react-router-dom';
import { FilterSelect } from '../../../components/shared/FilterSelect';
import type { FilterGroup, FilterOption } from '../../../components/shared/FilterSelect';
import { useDashboardFilters } from './useDashboardFilters';
import { useReportFilterNames } from '../ask/filterNames';

export interface ToolbarFilter {
  key: string;
  label: string;
  options: (FilterOption | FilterGroup)[];
  /** False for a period control: it is the question being asked, not a
   *  narrowing of the book, so Clear leaves it alone. */
  clearable?: boolean;
}

function labelFor(options: (FilterOption | FilterGroup)[], value: string): string {
  for (const entry of options) {
    const list = 'options' in entry ? entry.options : [entry];
    const hit = list.find((option) => option.value === value);
    if (hit) return hit.display ?? hit.label;
  }
  return 'All';
}

/**
 * The single row under the area tabs: sub-view switch on the left, filters on
 * the right. Replaces the eight copies of this bar that lived in each tab.
 */
export function DashboardToolbar({
  subViews,
  filters,
  defaults = {},
  count,
}: {
  subViews: { label: string; path: string }[];
  filters: ToolbarFilter[];
  defaults?: Record<string, string>;
  count?: string;
}) {
  const { search } = useLocation();
  const keys = filters.map((filter) => filter.key);
  const clearable = filters.filter((filter) => filter.clearable !== false).map((filter) => filter.key);
  const { values, set, clear, activeCount } = useDashboardFilters(keys, defaults);
  useReportFilterNames(filters);
  const active = activeCount(clearable);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
      {subViews.length > 1 && (
        <nav aria-label="Views" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {subViews.map((view) => (
            <NavLink
              key={view.path}
              // `view.path` is the area's absolute path (`AreaLayout`
              // builds it), not a bare segment — resolving it relative to
              // wherever this toolbar happens to be mounted is what broke
              // it in production, where a pathless container sits between
              // the area route and the view.
              to={{ pathname: view.path, search }}
              className={({ isActive }) =>
                `min-h-8 px-3 inline-flex items-center rounded-md text-[13px] font-semibold transition-colors duration-[var(--dur-fast)] ${
                  isActive ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-subtle'
                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`
              }
            >
              {view.label}
            </NavLink>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-1 ml-auto min-h-9">
        {filters.map((filter) => (
          <FilterSelect
            key={filter.key}
            label={filter.label}
            value={labelFor(filter.options, values[filter.key])}
            selected={values[filter.key]}
            onChange={(value) => set(filter.key, value)}
            options={filter.options}
            // Active means "moved off its default": a period on its default
            // is the question being asked, not a narrowing someone applied.
            isActive={values[filter.key] !== (defaults[filter.key] ?? '')}
          />
        ))}
        {active > 0 && (
          <>
            {count && <span className="ml-2 text-[11px] text-ink-muted whitespace-nowrap font-mono-brand tabular-nums">{count}</span>}
            <button
              type="button"
              onClick={() => clear(clearable)}
              className="ml-2 min-h-8 px-2 text-[13px] font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
            >
              Clear {active}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
