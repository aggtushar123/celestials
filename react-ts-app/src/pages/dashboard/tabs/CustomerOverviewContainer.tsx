import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { SHARED_KEYS, toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { CustomerOverviewContext } from './customer-overview/ControlsView';

const KEYS = SHARED_KEYS;

/**
 * The Customer Overview shell and its bar.
 *
 * The same three filters as the other dashboards, with one difference worth
 * knowing: its Account list includes churned customers, because this is the
 * screen about them — being unable to filter to a customer who left would be
 * strange here and is right everywhere else.
 *
 * No window control. Composition and concentration are statements about now,
 * and the historical cuts (cohorts, churn reasons) carry their own periods —
 * a single window across all of them would mean four different things.
 */
export function CustomerOverviewContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.portfolio.stats?.filters);
  const active = useAppSelector((state) => state.portfolio.stats?.kpis.active ?? 0);
  const { values } = useDashboardFilters(KEYS);
  const context: CustomerOverviewContext = { query: toQuery(values) };

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        count={`${active} active`}
        filters={bookFilters(options)}
      />
      <div className="flex-1 w-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
