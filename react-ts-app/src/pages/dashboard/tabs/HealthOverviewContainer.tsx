import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import {
  FILTER_ORDER,
  clearHealthFilters,
  pruneFilters,
  replaceHealthFilters,
} from '../../../features/health/healthSlice';
import type { HealthFilters } from '../../../features/health/healthSlice';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { SHARED_KEYS, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { FilterOption } from './health-overview/useHealthOverview';
import { useHealthOverview } from './health-overview/useHealthOverview';

/** "All" plus one entry per option, each carrying its own count — picking an
 *  owner with two accounts and one with forty are different decisions, and
 *  the dropdown is where that is worth knowing. Once picked, the chip shows
 *  the name alone (`display`): the count there is noise, not a choice. */
const choices = (options: FilterOption[]) => [
  { value: '', label: 'All' },
  ...options.map((option) => ({
    value: option.key,
    label: `${option.name} (${option.count})`,
    display: option.name,
  })),
];

/**
 * Health's five real views (Triage, Divergence, Movement, Renewals,
 * Distribution) share one book and one filter bar. The URL is the only
 * source of truth for the bar's three filters — `DashboardToolbar` reads
 * and writes it — and this container mirrors it into `state.health` on every
 * change, because the views and their tests already read filters from Redux.
 * URL `customer` is Redux `account`: both are a customer id.
 *
 * The copy is exact (`replaceHealthFilters`, no pruning): a deep link can
 * arrive before the book does, and pruning against no rows would drop every
 * filter in Redux while the URL, the chips and the Clear count still showed
 * it. A combination the loaded book cannot honour is fixed in the URL itself,
 * so every reader of the URL — chips, Clear, other areas — agrees.
 */
export function HealthOverviewContainer() {
  const dispatch = useAppDispatch();
  const subViews = useSubViews();
  const { values, clear } = useDashboardFilters(SHARED_KEYS);
  const { owners, lifecycles, accounts, rows, totalCount } = useHealthOverview();
  const book = useAppSelector((state) => state.health.rows);
  const loadedAt = useAppSelector((state) => state.health.loadedAt);

  useEffect(() => {
    dispatch(
      replaceHealthFilters({
        owner: values.owner || null,
        lifecycle: values.lifecycle || null,
        account: values.customer || null,
      }),
    );
  }, [dispatch, values.owner, values.lifecycle, values.customer]);

  // Once a book has loaded, drop from the URL any filter it cannot honour —
  // narrowest first, per `pruneFilters` (an account the chosen owner doesn't
  // hold, an owner who has left). Never before a load: no rows yet is not
  // "nothing matches".
  useEffect(() => {
    if (loadedAt === null) return;
    const wanted: HealthFilters = {
      owner: values.owner || null,
      lifecycle: values.lifecycle || null,
      account: values.customer || null,
    };
    const kept = pruneFilters(book, wanted);
    const drop = FILTER_ORDER.filter((key) => wanted[key] !== kept[key]).map((key) =>
      key === 'account' ? 'customer' : key,
    );
    if (drop.length > 0) clear(drop);
  }, [book, loadedAt, values.owner, values.lifecycle, values.customer, clear]);

  // The URL stays the only source of truth: without this, leaving Health
  // would leave a stale filter sitting in Redux, narrowing whatever reads
  // `state.health.filters` next even though no URL says so any more.
  useEffect(() => {
    return () => {
      dispatch(clearHealthFilters());
    };
  }, [dispatch]);

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar
        subViews={subViews}
        count={`${rows.length} of ${totalCount} accounts`}
        filters={[
          { key: 'owner', label: 'Primary Owner', options: choices(owners) },
          { key: 'lifecycle', label: 'Lifecycle Stage', options: choices(lifecycles) },
          { key: 'customer', label: 'Account', options: choices(accounts) },
        ]}
      />
      <div className="flex-1 w-full h-full">
        <Outlet />
      </div>
    </div>
  );
}
