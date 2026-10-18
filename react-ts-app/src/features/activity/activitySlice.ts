import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's ActivityTrackingView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/customers/activity/, which
// also carries the three definitions that decide what these numbers mean.

export interface ActivityKpis {
  /** Work we logged inside the window: activities, calls, emails, notes,
   *  meetings. Tickets are not touches — see `inbound`. */
  touches: number;
  /** Tickets raised in the window. Customer-initiated, so counted apart from
   *  team output; the ratio between the two is the point. */
  inbound: number;
  accounts: number;
  touched_accounts: number;
  /** Percentage of accounts touched inside the window, or null on an empty
   *  book — never a misleading zero. */
  coverage: number | null;
  dark_accounts: number;
  dark_arr: number;
  open_tasks: number;
  overdue_tasks: number;
  completed_tasks: number;
}

/** One week of logged work, one field per source. */
export interface ActivityWeek {
  /** Pre-formatted label, e.g. "Jun 8" — the axis renders it verbatim. */
  date: string;
  iso: string;
  activities: number;
  calls: number;
  emails: number;
  notes: number;
  meetings: number;
}

export interface SourceCount {
  key: string;
  name: string;
  count: number;
}

export interface CadenceBucket {
  key: string;
  name: string;
  accounts: number;
  arr: number;
}

export interface OwnerCoverage {
  owner: string;
  accounts: number;
  touched: number;
  dark: number;
  arr_dark: number;
}

export interface DarkAccount {
  id: number;
  name: string;
  owner: string;
  arr: number | null;
  health_category: 'good' | 'average' | 'poor';
  lifecycle_stage: string;
  last_contact: string | null;
  /** Days since any logged contact, or null when there has never been one. */
  days_since_contact: number | null;
  /** The health rubric's narrower measure — activities only. Shown beside the
   *  broader one because the two can legitimately differ. */
  renewal_date: string | null;
}

export interface ActivityStats {
  window_days: number;
  kpis: ActivityKpis;
  timeline: ActivityWeek[];
  sources: SourceCount[];
  cadence: CadenceBucket[];
  by_owner: OwnerCoverage[];
  going_dark: DarkAccount[];
  going_dark_threshold: number;
  currency: CurrencyCode;
  filters: {
    owners: { value: string; name: string }[];
    lifecycles: { value: string; name: string }[];
    customers: { value: string; name: string }[];
  };
}

interface ActivityState {
  stats: ActivityStats | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: ActivityState = { stats: null, isLoading: false, error: null };

export const fetchActivityStats = createAsyncThunk<
  ActivityStats,
  string | void,
  { rejectValue: string }
>('activity/fetchStats', async (query, { rejectWithValue }) => {
  try {
    return await apiFetch<ActivityStats>(
      query ? `/customers/activity/?${query}` : '/customers/activity/'
    );
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load activity.';
    return rejectWithValue(message);
  }
});

const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchActivityStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchActivityStats.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchActivityStats.rejected, (state, action) => {
        state.isLoading = false;
        // Previous numbers stay: a failed refetch shouldn't blank a dashboard
        // someone is reading.
        state.error = action.payload ?? 'Could not load activity.';
      });
  },
});

export default activitySlice.reducer;
