import { AREAS } from '../../pages/dashboard/areas';
import type { DashboardArea, DashboardFocus, DashboardOrigin } from '../../pages/copilot/types';

export type SharedFilterKey = 'owner' | 'lifecycle' | 'customer';

/** value → display name per shared filter, as the dashboard's own filter
 *  options name them (reported by DashboardToolbar). */
export type FilterNames = Partial<Record<SharedFilterKey, Record<string, string>>>;

const FILTER_LABELS: Record<SharedFilterKey, string> = { owner: 'Owner', lifecycle: 'Lifecycle', customer: 'Account' };
const ORDER: SharedFilterKey[] = ['owner', 'lifecycle', 'customer'];

/** "Overview", or "Revenue › Forecast". */
export function viewLabel(area: DashboardArea, view: string | null): string {
  if (area === 'overview') return 'Overview';
  const found = AREAS.find((a) => a.key === area);
  if (!found) return area;
  const sub = found.views.find((v) => v.path === view);
  return sub ? `${found.label} › ${sub.label}` : found.label;
}

export function focusLabel(focus: DashboardFocus | null): string {
  if (!focus) return '';
  if (focus.kind === 'attention') return 'This attention item';
  return focus.ids.length === 1 ? '1 account' : `${focus.ids.length} accounts`;
}

/** The chip: "Revenue › Forecast · Owner: Priya · 12 accounts". A value
 *  with no known name shows as itself rather than being hidden. */
export function contextLabel(context: DashboardOrigin & { focus?: DashboardFocus | null }, names: FilterNames = {}): string {
  const parts = [viewLabel(context.area, context.view)];
  for (const key of ORDER) {
    const value = context.filters[key];
    if (value) parts.push(`${FILTER_LABELS[key]}: ${names[key]?.[value] ?? value}`);
  }
  const focus = focusLabel(context.focus ?? null);
  if (focus) parts.push(focus);
  return parts.join(' · ');
}
