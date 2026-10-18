import { useLocation } from 'react-router-dom';
import { AREAS } from '../areas';
import { SHARED_KEYS, useDashboardFilters } from '../shared/useDashboardFilters';
import { contextLabel } from '../../../components/copilot/dashboardLabels';
import type { DashboardArea, DashboardContext } from '../../copilot/types';
import { useFilterNames } from './filterNames';

/** The area and view a dashboard URL shows, or null when it is not a view
 *  (an index route about to redirect, an unknown view, another page). */
export function parseDashboardPath(pathname: string): { area: DashboardArea; view: string | null } | null {
  const [, root, area, view] = pathname.split('/');
  if (root !== 'dashboard') return null;
  if (area === 'overview') return { area: 'overview', view: null };
  const found = AREAS.find((a) => a.key === area);
  if (!found || !found.views.some((v) => v.path === view)) return null;
  return { area: found.key, view };
}

/** Where the person is on the dashboard, as the server needs it, and the
 *  chip that says so. Read at send time: each question carries the screen
 *  as it is at that moment. Never figures; the server computes those. */
export function useDashboardContext(): { context: DashboardContext | null; label: string } {
  const { pathname } = useLocation();
  const { values } = useDashboardFilters(SHARED_KEYS);
  const names = useFilterNames();
  const where = parseDashboardPath(pathname);
  if (!where) return { context: null, label: '' };
  const context: DashboardContext = {
    surface: 'dashboard',
    ...where,
    filters: { owner: values.owner, lifecycle: values.lifecycle, customer: values.customer },
    focus: null,
  };
  return { context, label: contextLabel(context, names) };
}
