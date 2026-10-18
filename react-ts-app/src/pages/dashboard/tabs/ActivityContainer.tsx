import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { SHARED_KEYS, toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { ActivityContext } from './activity/ControlsView';

/** Windows the screen offers. A month is the cadence a CSM is held to, a
 *  quarter is what a review looks back over, and a year is for judging whether
 *  a book has ever really been worked. */
const WINDOWS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
];
const DEFAULTS = { days: '90' };
// `days` is also Tickets' key (Support area); safe because area links carry only SHARED_KEYS.
const KEYS = [...SHARED_KEYS, 'days'];

/** Health › Activity. The window is always sent; the book filters narrow it. */
export function ActivityContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.activity.stats?.filters);
  const accounts = useAppSelector((state) => state.activity.stats?.kpis.accounts ?? 0);
  const { values } = useDashboardFilters(KEYS, DEFAULTS);
  const context: ActivityContext = { query: toQuery(values) };

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        defaults={DEFAULTS}
        count={`${accounts} ${accounts === 1 ? 'account' : 'accounts'}`}
        filters={[
          { key: 'days', label: 'Window', clearable: false, options: WINDOWS },
          ...bookFilters(options),
        ]}
      />
      <div className="flex-1 w-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
