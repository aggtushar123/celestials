import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { SHARED_KEYS, toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { ForecastContext } from './forecast/ControlsView';

/** Windows the forecast offers. A quarter is what a sales team commits to, a
 *  year is what a board asks for, and two is as far as renewal dates are worth
 *  planning against. */
const HORIZONS = [
  { value: '90', label: 'Next quarter' },
  { value: '365', label: 'Next 12 months' },
  { value: '730', label: 'Next 24 months' },
];
const DEFAULTS = { horizon_days: '365' };
const KEYS = [...SHARED_KEYS, 'horizon_days'];

/**
 * The Revenue Forecast shell and its bar.
 *
 * The same three filters as every other dashboard, plus the one control this
 * screen needs that the others don't: the horizon. A forecast without a stated
 * window is a number nobody can check, and changing it is the first thing
 * anyone does with one.
 */
export function ForecastContainer() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.forecast.stats?.filters);
  const accounts = useAppSelector((state) => state.forecast.stats?.accounts ?? 0);
  const { values } = useDashboardFilters(KEYS, DEFAULTS);
  const context: ForecastContext = { query: toQuery(values) };

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        defaults={DEFAULTS}
        count={`${accounts} ${accounts === 1 ? 'account' : 'accounts'}`}
        filters={[
          { key: 'horizon_days', label: 'Horizon', clearable: false, options: HORIZONS },
          ...bookFilters(options),
        ]}
      />
      <div className="flex-1 w-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
