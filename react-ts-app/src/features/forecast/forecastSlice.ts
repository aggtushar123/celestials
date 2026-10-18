import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's CustomerForecastView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/customers/forecast/.
//
// Every weighting behind these numbers lives in the backend (churn.py and
// forecast.py), including the churn rule the Health Overview's Renewal tab
// prints on its own rows. Nothing here re-derives any of it.

export interface ForecastBridge {
  opening_arr: number;
  /** Expected loss from renewals inside the horizon, weighted by churn risk. */
  churn: number;
  /** Expected loss from open risks, weighted by priority. */
  contraction: number;
  /** Expected gain from open opportunities, weighted by sales stage. */
  expansion: number;
  forecast_arr: number;
  net_change: number;
  /** Net revenue retention as a percentage, or null on an empty book — never
   *  a fake 100%. */
  nrr: number | null;
}

export interface ForecastScenarios {
  worst: number;
  likely: number;
  best: number;
}

export interface PipelineStage {
  key: string;
  name: string;
  /** Everything open at this stage. */
  open: number;
  /** The same, weighted by the stage's own probability. The gap between them
   *  is how much of the upside is a conversation rather than a commitment. */
  weighted: number;
  count: number;
}

export interface SwingAccount {
  id: number;
  name: string;
  owner: string;
  arr: number | null;
  renewal_date: string | null;
  days_to_renewal: number | null;
  renews_in_horizon: boolean;
  risk: number;
  factors: { label: string; points: number }[];
  churn_exposure: number;
  risk_exposure: number;
  downside: number;
  expansion: number;
  open_pipeline: number;
  /** Expansion minus downside: this account's effect on the forecast. */
  net: number;
  health_category: 'good' | 'average' | 'poor';
}

export interface ForecastStats {
  horizon_days: number;
  bridge: ForecastBridge;
  scenarios: ForecastScenarios;
  pipeline: PipelineStage[];
  swing: SwingAccount[];
  accounts: number;
  renewing_count: number;
  unpriced_count: number;
  currency: CurrencyCode;
  filters: {
    owners: { value: string; name: string }[];
    lifecycles: { value: string; name: string }[];
    customers: { value: string; name: string }[];
  };
}

interface ForecastState {
  stats: ForecastStats | null;
  isLoading: boolean;
  error: string | null;
  /** The query `stats` answers ('' for none); null before the first load.
   *  A reader showing a different query treats `stats` as not yet loaded. */
  query: string | null;
  /** The latest request. An older one landing late is ignored, so a slow
   *  answer to a previous filter never overwrites the current one. */
  requestId: string | null;
}

const initialState: ForecastState = { stats: null, isLoading: false, error: null, query: null, requestId: null };

export const fetchForecast = createAsyncThunk<ForecastStats, string | void, { rejectValue: string }>(
  'forecast/fetch',
  async (query, { rejectWithValue }) => {
    try {
      return await apiFetch<ForecastStats>(
        query ? `/customers/forecast/?${query}` : '/customers/forecast/'
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load the forecast.';
      return rejectWithValue(message);
    }
  }
);

const forecastSlice = createSlice({
  name: 'forecast',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchForecast.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchForecast.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.isLoading = false;
        state.stats = action.payload;
        state.query = action.meta.arg ?? '';
      })
      .addCase(fetchForecast.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.isLoading = false;
        // Previous numbers stay: a failed refetch shouldn't blank a forecast
        // someone is reading out loud.
        state.error = action.payload ?? 'Could not load the forecast.';
      });
  },
});

export default forecastSlice.reducer;
