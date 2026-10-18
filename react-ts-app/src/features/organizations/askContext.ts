import { focusLabel } from '../../components/copilot/dashboardLabels';
import type { OrganizationsFilters, OrganizationsFocus, OrganizationsOrigin, OrganizationsView } from '../../pages/copilot/types';
import { filterChips } from './filterChips';
import {
  BOARD_GROUP,
  DEFAULT_GROUP,
  DEFAULT_SORT,
  ORGANIZATION_PARAMS,
  parseParams,
  type ParamSpec,
  type PortfolioParams,
} from './portfolioParams';
import type { GroupKey, PortfolioResponse } from './portfolioTypes';

/** Each view's own default grouping (an absent `group` in a stored context
 *  means this). */
export function defaultGroupOf(view: OrganizationsView): GroupKey {
  return view === 'board' ? BOARD_GROUP : DEFAULT_GROUP;
}

/** The params as a question carries them (spec §3: every portfolio param
 *  except the cursor), in the API's own string form — **only the set keys**.
 *  Backend ruling: an unset key is never sent as `''` (the backend reads a
 *  literal `ids: ''` as "names nothing"). `group` is sent only when it
 *  differs from `defaultGroupOf(view)`, and `group: ''` only for an explicit
 *  "None" (the Board never reaches that branch: `boardParams` keeps its
 *  group non-empty). */
export function toContextFilters(p: PortfolioParams, view: OrganizationsView): OrganizationsFilters {
  const filters: OrganizationsFilters = {};
  if (p.search) filters.search = p.search;
  if (p.owner) filters.owner = p.owner;
  if (p.lifecycle.length) filters.lifecycle = p.lifecycle.join(',');
  if (p.health.length) filters.health = p.health.join(',');
  if (p.product.length) filters.product = p.product.join(',');
  if (p.renews_within) filters.renews_within = p.renews_within;
  if (p.nps) filters.nps = p.nps;
  if (p.ids.length) filters.ids = p.ids.join(',');
  if (p.include_churned) filters.include_churned = '1';
  if (p.sort !== DEFAULT_SORT) filters.sort = p.sort;
  const defaultGroup = defaultGroupOf(view);
  if (p.group === '') filters.group = '';
  else if (p.group !== defaultGroup) filters.group = p.group;
  return filters;
}

/** A context's filters back to params, through the URL parser, so a value
 *  the page would not accept is dropped the same way. A key left out behaves
 *  as it would off the URL; `group: ''` is "no grouping" (the URL's
 *  `group=none`), and a missing `group` is the view's own default. `spec`
 *  parameterises which params a kind of portfolio reads, so Accounts'
 *  `fromAccountsFilters` reuses this rather than copying it. */
export function fromContextFilters(
  filters: OrganizationsFilters,
  view: OrganizationsView,
  spec: ParamSpec = ORGANIZATION_PARAMS,
): PortfolioParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  if (filters.group === '') search.set('group', 'none');
  return parseParams(search, defaultGroupOf(view), spec);
}

/** A view's own URL under `base` (`/organizations/list`, or another
 *  surface's own routes, e.g. Accounts' `/accounts/board`), with `filters`
 *  as its query. `filters` is used as-is (already only the set keys) —
 *  except `group: ''` (the stored "None"), which the URL spells `group=none`;
 *  the page only reads that sentinel as ungrouped, and would otherwise fall
 *  back to its own default group for a bare `group=`. Parameterised by
 *  `base` so Accounts' `accountsPath` reuses this rather than copying it. */
export function viewPath(base: string, view: OrganizationsView, filters: OrganizationsFilters): string {
  const patched = filters.group === '' ? { ...filters, group: 'none' } : filters;
  const query = new URLSearchParams(patched as Record<string, string>).toString();
  return query ? `/${base}/${view}?${query}` : `/${base}/${view}`;
}

/** The page a conversation started on, with its filters (History restore). */
export function organizationsPath(origin: OrganizationsOrigin): string {
  return viewPath('organizations', origin.view, origin.filters);
}

/** The chip: "Organizations · Owner: Carl CSM · 1 account". When the server
 *  already stored `labels` on this context (a past message, or an origin,
 *  which always carries them), those are used as-is (C2) — the asker's own
 *  filter options at the time, which may differ from (or be unavailable to)
 *  whoever is reading the chip now. Only a live, still-being-asked context
 *  (`labels` absent) falls back to recomputing the filter chips here, named
 *  from the portfolio's options; an unknown value then shows as those chips
 *  show it ("User 9"). The focus part is never stored in `labels` (it is
 *  spent by the send), so it is always named fresh, from `focus`. */
export function organizationsLabel(
  context: Omit<OrganizationsOrigin, 'labels'> & { labels?: string[]; focus?: OrganizationsFocus | null },
  options: PortfolioResponse['filters'] | null = null,
): string {
  const parts = context.labels?.length
    ? ['Organizations', ...context.labels]
    : ['Organizations', ...filterChips(fromContextFilters(context.filters ?? {}, context.view), options).map((chip) => chip.label)];
  const focus = focusLabel(context.focus ?? null);
  if (focus) parts.push(focus);
  return parts.join(' · ');
}
