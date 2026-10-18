import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's CustomerUsageView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/customers/usage/.
//
// No colours in here. The backend returns names and numbers; the charts map a
// band key to a CSS variable themselves, the same way every other real-data
// chart in this app does.

export interface UsageKpis {
  accounts: number;
  contracted_seats: number;
  active_seats: number;
  /** Seats over seats across the book — **not** the mean of each account's
   *  percentage. Null when nothing in scope has seats recorded. */
  utilisation: number | null;
  idle_seats: number;
  /** ARR attached to seats nobody uses. A proxy, not a refund calculation —
   *  see the backend module. */
  shelfware_arr: number;
  at_capacity_arr: number;
  at_capacity_count: number;
  /** Accounts with no seat data at all. They are in `accounts` and in no
   *  other figure on the screen, which is why the number is on the screen. */
  unmeasured_count: number;
  measured_count: number;
  /** Accounts whose ARR has no exchange rate, so they count in seats and not
   *  in money. */
  unpriced_count: number;
}

export interface UsageBand {
  key: string;
  name: string;
  accounts: number;
  arr: number;
  idle_seats: number;
}

export interface AdoptionBucket {
  key: string;
  name: string;
  accounts: number;
  arr: number;
}

/** One account, as the scatter and the two work lists read it. */
export interface UsageAccount {
  id: number;
  name: string;
  owner: string;
  lifecycle_stage: string;
  health_category: 'good' | 'average' | 'poor';
  utilisation: number | null;
  active_seats: number | null;
  contracted_seats: number | null;
  idle_seats: number;
  arr: number | null;
  shelfware_arr: number;
  products: number;
  renewal_date: string | null;
  band: string | null;
}

export interface UsageFilterOption {
  value: string;
  name: string;
}

export interface UsageStats {
  kpis: UsageKpis;
  bands: UsageBand[];
  adoption: AdoptionBucket[];
  scatter: UsageAccount[];
  shelfware: UsageAccount[];
  at_capacity: UsageAccount[];
  currency: CurrencyCode;
  filters: {
    owners: UsageFilterOption[];
    lifecycles: UsageFilterOption[];
    customers: UsageFilterOption[];
  };
}

interface UsageState {
  stats: UsageStats | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: UsageState = {
  stats: null,
  isLoading: false,
  error: null,
};

/** Takes a raw query string (`owner=5&lifecycle=live`) rather than an options
 *  object — same shape as fetchTicketStats and fetchInteractionStats, because
 *  the filter bar already builds one with URLSearchParams. */
export const fetchUsageStats = createAsyncThunk<UsageStats, string | void, { rejectValue: string }>(
  'usage/fetchStats',
  async (query, { rejectWithValue }) => {
    try {
      return await apiFetch<UsageStats>(
        query ? `/customers/usage/?${query}` : '/customers/usage/'
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load usage.';
      return rejectWithValue(message);
    }
  }
);

const usageSlice = createSlice({
  name: 'usage',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsageStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsageStats.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchUsageStats.rejected, (state, action) => {
        state.isLoading = false;
        // The previous stats stay: a filter change that fails shouldn't blank
        // a dashboard that was showing real numbers a moment ago.
        state.error = action.payload ?? 'Could not load usage.';
      });
  },
});

export default usageSlice.reducer;
