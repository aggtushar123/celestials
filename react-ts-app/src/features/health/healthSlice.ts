import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';
import { toHealthDataRows } from './toHealthDataRow';
import type { CustomerHealthApiResponse } from './toHealthDataRow';
import type { HealthDataRow } from './types';

/**
 * The Health Overview dashboard's own state.
 *
 * One fetch serves all four tabs — Triage, Divergence, Movement and Controls
 * read the same book differently rather than needing different data, so a
 * fetch per tab would pull the same rows four times. The thunk-per-fetch shape
 * follows customersSlice.ts.
 */

interface HealthState {
  rows: HealthDataRow[];
  isLoading: boolean;
  error: string | null;
  /** How many months of history the server actually returned. */
  historyMonths: number;
  /** True when the book was larger than the endpoint's cap. The tabs say so
   *  rather than charting a partial book as though it were the whole one. */
  truncated: boolean;
  /** Null until the first successful load. */
  loadedAt: string | null;
  /** The currency every row's `arr` is denominated in — the organisation's own
   *  reporting currency, per the backend's conversion. */
  currency: CurrencyCode;
  /** Rows whose ARR couldn't be converted into it. The Renewal tab names this
   *  rather than quietly totalling a partial book. */
  unconvertedCount: number;
  /**
   * The bar's three filters. Null is "All".
   *
   * Here rather than in the container's own React state because all five tabs
   * have to honour them, and they read their rows through one hook. State the
   * hook can see is state a tab cannot forget to apply — a filter that silently
   * doesn't apply on one of five tabs is worse than no filter at all.
   *
   * They survive a tab switch on purpose: narrowing to one CSM and then moving
   * from Triage to Movement is one thought, not two.
   */
  filters: HealthFilters;
}

/**
 * Owner / lifecycle stage / account, each a key off `HealthDataRow`.
 *
 * Keys, never labels — an owner's name, a stage's display text and a company's
 * name are all things people rename, and a filter keyed on one of those merges
 * or loses a book the day it changes. See `ownerKey`/`lifecycleKey` on the row.
 */
export interface HealthFilters {
  /** `HealthDataRow.ownerKey` — an owner id, or 'unassigned'. */
  owner: string | null;
  /** `HealthDataRow.lifecycleKey`, e.g. 'customer_active'. */
  lifecycle: string | null;
  /** `HealthDataRow.id` — one company. */
  account: string | null;
}

export const NO_FILTERS: HealthFilters = { owner: null, lifecycle: null, account: null };

/** How each filter finds its value on a row. One place, so the dropdown that
 *  offers a value and the predicate that applies it can't disagree. */
export const FILTER_KEYS: Record<keyof HealthFilters, (row: HealthDataRow) => string> = {
  owner: (row) => row.ownerKey,
  lifecycle: (row) => row.lifecycleKey,
  account: (row) => row.id,
};

/**
 * Broadest to narrowest. A whole CSM's book, then a stage within it, then one
 * company — which is the order someone narrows by, and the order that decides
 * two things elsewhere: which dropdown is filtered by which (see
 * `filterOptions`), and which filter gives way when two contradict.
 */
export const FILTER_ORDER = ['owner', 'lifecycle', 'account'] as const;

export function matchesFilters(row: HealthDataRow, filters: HealthFilters): boolean {
  return (Object.keys(FILTER_KEYS) as (keyof HealthFilters)[]).every(
    (key) => filters[key] === null || FILTER_KEYS[key](row) === filters[key]
  );
}

/**
 * Drop any filter that would select nothing from `rows`.
 *
 * Two things need this. A refreshed book may no longer contain the CSM or the
 * company being filtered by — someone left, an account was reassigned or
 * archived. And narrowing by owner can strand an account filter on a company
 * that owner doesn't hold.
 *
 * Either way the alternative is every tab going empty with a name still on the
 * chip and nothing on screen saying that the *filter*, not the book, is what
 * emptied them. Applied narrowest-first: an account filter is dropped before
 * the owner filter that contradicts it, because the broader one is the choice
 * the user just made.
 */
export function pruneFilters(rows: HealthDataRow[], filters: HealthFilters): HealthFilters {
  const pruned = { ...filters };

  for (const key of [...FILTER_ORDER].reverse()) {
    if (pruned[key] === null) continue;
    const survives = rows.some((row) => matchesFilters(row, { ...pruned, [key]: pruned[key] }));
    if (!survives) pruned[key] = null;
  }

  return pruned;
}

const initialState: HealthState = {
  rows: [],
  isLoading: false,
  error: null,
  historyMonths: 0,
  truncated: false,
  loadedAt: null,
  // A placeholder until the first load, not a claim: nothing renders money
  // before `loadedAt` is set.
  currency: 'USD',
  unconvertedCount: 0,
  filters: NO_FILTERS,
};

interface HealthPayload {
  rows: HealthDataRow[];
  historyMonths: number;
  truncated: boolean;
  currency: CurrencyCode;
  unconvertedCount: number;
}

export const fetchHealthOverview = createAsyncThunk<
  HealthPayload,
  { historyMonths?: number } | void,
  { rejectValue: string }
>('health/fetchHealthOverview', async (options, { rejectWithValue }) => {
  const months = options && 'historyMonths' in options ? options.historyMonths : undefined;
  const query = months ? `?history_months=${months}` : '';
  try {
    const data = await apiFetch<CustomerHealthApiResponse>(`/customers/health/${query}`);
    return {
      rows: toHealthDataRows(data.results),
      historyMonths: data.history_months,
      truncated: data.truncated,
      currency: data.currency,
      unconvertedCount: data.unconverted_count,
    };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load account health.';
    return rejectWithValue(message);
  }
});

export const healthSlice = createSlice({
  name: 'health',
  initialState,
  reducers: {
    setHealthFilter(
      state,
      action: PayloadAction<{ key: keyof HealthFilters; value: string | null }>
    ) {
      const next = { ...state.filters, [action.payload.key]: action.payload.value };
      // Pruned on every change, not only on refresh: picking an owner who
      // doesn't hold the account currently filtered to would otherwise empty
      // the dashboard with both chips looking perfectly reasonable.
      state.filters = pruneFilters(state.rows, next);
    },
    /** Set all three filters exactly as given — no pruning. The Health
     *  container copies the URL in with this: pruning here against rows that
     *  may not have loaded yet (a deep link on a cold load) dropped every
     *  filter to null while the URL still carried it. Contradictions are
     *  resolved in the URL instead, once rows exist (see the container). */
    replaceHealthFilters(state, action: PayloadAction<HealthFilters>) {
      state.filters = { ...action.payload };
    },
    clearHealthFilters(state) {
      state.filters = NO_FILTERS;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHealthOverview.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchHealthOverview.fulfilled, (state, action) => {
        state.isLoading = false;
        state.rows = action.payload.rows;
        state.historyMonths = action.payload.historyMonths;
        state.truncated = action.payload.truncated;
        state.currency = action.payload.currency;
        state.unconvertedCount = action.payload.unconvertedCount;
        state.filters = pruneFilters(action.payload.rows, state.filters);
        state.loadedAt = new Date().toISOString();
      })
      .addCase(fetchHealthOverview.rejected, (state, action) => {
        state.isLoading = false;
        // Previously loaded rows are kept: a failed refresh shouldn't blank a
        // dashboard the user is reading.
        state.error = action.payload ?? 'Could not load account health.';
      });
  },
});

export const { setHealthFilter, replaceHealthFilters, clearHealthFilters } = healthSlice.actions;

export default healthSlice.reducer;
