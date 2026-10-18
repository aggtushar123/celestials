import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { SHARED_KEYS, toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { UsageOverviewContext } from './usage-overview/ControlsView';

const KEYS = SHARED_KEYS;

/**
 * The Usage Overview shell and its filter bar.
 *
 * Same three filters as the Health bar and the same reasons — owner, lifecycle
 * stage, one account — but applied server-side here, because this screen asks
 * the server for rollups rather than for rows. That difference is the only one:
 * the chips read the same, and the options come back alongside the numbers so
 * the bar needs no fetch of its own and can't offer a company the numbers
 * don't cover.
 */
export function UsageOverviewContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.usage.stats?.filters);
  const accounts = useAppSelector((state) => state.usage.stats?.kpis.accounts ?? 0);
  const { values } = useDashboardFilters(KEYS);
  const context: UsageOverviewContext = { query: toQuery(values) };

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        count={`${accounts} ${accounts === 1 ? 'account' : 'accounts'}`}
        filters={bookFilters(options)}
      />
      <div className="flex-1 w-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
