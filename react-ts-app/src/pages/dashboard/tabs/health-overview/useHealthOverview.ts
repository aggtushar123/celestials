import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import {
  FILTER_KEYS,
  FILTER_ORDER,
  fetchHealthOverview,
  matchesFilters,
} from '../../../../features/health/healthSlice';
import { NO_FILTERS } from '../../../../features/health/healthSlice';
import type { HealthFilters } from '../../../../features/health/healthSlice';
import { UNASSIGNED_KEY } from '../../../../features/health/toHealthDataRow';
import type { HealthDataRow } from '../../../../features/health/types';

export interface FilterOption {
  /** The value the filter stores — an owner id, a lifecycle value, a row id. */
  key: string;
  name: string;
  count: number;
}

/** Unassigned sorts last however many accounts it holds: it isn't a person,
 *  and a book with a lot of unowned accounts shouldn't push the actual owners
 *  down the list. */
function compareOptions(a: FilterOption, b: FilterOption) {
  if (a.key === UNASSIGNED_KEY) return 1;
  if (b.key === UNASSIGNED_KEY) return -1;
  return a.name.localeCompare(b.name);
}

/**
 * The values one filter can offer, with how many accounts each covers.
 *
 * Narrowed by the filters **broader** than this one, and only those — see
 * FILTER_ORDER. Offering a company the selected owner doesn't hold is a choice
 * whose only outcome is an empty dashboard, so the Account list follows the
 * Owner and Lifecycle selections.
 *
 * The reverse would be a trap. If the Owner list were narrowed by the selected
 * Account, picking a company would leave exactly one owner on offer and no way
 * to switch without clearing first — a dashboard you can get stuck in. Widening
 * instead is always reachable: changing a broader filter drops a narrower one
 * that contradicts it (`pruneFilters`).
 *
 * Derived from loaded rows rather than fetched, so a CSM with nothing in this
 * book can't sit in the dropdown returning nothing.
 */
export function filterOptions(
  rows: HealthDataRow[],
  key: keyof HealthFilters,
  filters: HealthFilters,
  label: (row: HealthDataRow) => string
): FilterOption[] {
  const broader = FILTER_ORDER.slice(0, FILTER_ORDER.indexOf(key));
  const others = { ...NO_FILTERS };
  for (const other of broader) others[other] = filters[other];
  const byKey = new Map<string, FilterOption>();

  for (const row of rows) {
    if (!matchesFilters(row, others)) continue;
    const value = FILTER_KEYS[key](row);
    const existing = byKey.get(value);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(value, { key: value, name: label(row), count: 1 });
    }
  }

  return [...byKey.values()].sort(compareOptions);
}

/**
 * The Health Overview's shared data, fetched once for all five tabs.
 *
 * Each tab calls this; the fetch only runs when there is nothing loaded and
 * nothing already in flight, so switching between Triage, Divergence, Movement,
 * Renewal Date and Controls re-reads the same rows instead of re-fetching the
 * book.
 *
 * **The bar's filters are applied here, not in the tabs.** All five read their
 * rows through this hook, so filtering in one place is the only version of this
 * that can't have a tab quietly ignoring the chips above it. `rows` is always
 * what the caller should render; `totalCount` is the unfiltered book, so a tab
 * can say what it is showing a part of.
 */
export function useHealthOverview() {
  const dispatch = useAppDispatch();
  const { rows, isLoading, error, truncated, loadedAt, currency, unconvertedCount, filters } =
    useAppSelector((state) => state.health);

  useEffect(() => {
    if (loadedAt === null && !isLoading) {
      dispatch(fetchHealthOverview());
    }
  }, [dispatch, loadedAt, isLoading]);

  const visible = useMemo(
    () => rows.filter((row) => matchesFilters(row, filters)),
    [rows, filters]
  );

  const owners = useMemo(
    () => filterOptions(rows, 'owner', filters, (row) => row.owner),
    [rows, filters]
  );
  const lifecycles = useMemo(
    () => filterOptions(rows, 'lifecycle', filters, (row) => row.lifecycleStage),
    [rows, filters]
  );
  const accounts = useMemo(
    () => filterOptions(rows, 'account', filters, (row) => row.account),
    [rows, filters]
  );

  return {
    rows: visible,
    error,
    truncated,
    /** For the Renewal tab's money totals — see the slice's own notes. */
    currency,
    unconvertedCount,
    /** True only on the first load — a refresh keeps the old rows on screen. */
    isInitialLoad: isLoading && loadedAt === null,
    hasLoaded: loadedAt !== null,
    /** Each filter's options (with counts), for the bar's dropdowns. */
    owners,
    lifecycles,
    accounts,
    /** The whole book, before any filter. */
    totalCount: rows.length,
  };
}
