import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's MetricListView exactly — see docs/API_CONTRACTS.md
// -> metrics -> GET /api/v1/metrics/.
//
// The metric layer: every headline number defined once on the backend, read
// through the same rollups the dashboards draw, whole-organisation, with the
// last month-end beside it. Initiatives reads it; the Brain's scoped figures
// come from /api/v1/brain/ (features/brain).

export type MetricUnit = 'money' | 'percent' | 'count';
/** Which direction is good news. 'none' is context, not a target. */
export type MetricDirection = 'up' | 'down' | 'none';

export interface Metric {
  key: string;
  label: string;
  unit: MetricUnit;
  better: MetricDirection;
  note: string;
  /** Null when unmeasured — an empty book has no NRR — never zero. */
  value: number | null;
  /** The most recent month-end snapshot, null before the first is recorded. */
  previous: { period_end: string; value: number | null } | null;
  /** Null whenever either side is unmeasured: "unknown" to 40 is not a rise of 40. */
  change: number | null;
  /** The cuts this metric has — 'owner', 'product', 'segment', 'lifecycle'. */
  dimensions: string[];
}

/** One member of a cut: an owner, a product, a size band, a lifecycle stage. */
export interface SliceMember {
  member: string;
  label: string;
  value: number | null;
  previous: { period_end: string; value: number | null } | null;
  change: number | null;
}

export interface SlicePayload {
  metric: Pick<Metric, 'key' | 'label' | 'unit' | 'better' | 'note' | 'dimensions'>;
  dimension: { key: string; label: string };
  currency: CurrencyCode;
  members: SliceMember[];
}

export interface MetricsPayload {
  as_of: string;
  currency: CurrencyCode;
  metrics: Metric[];
}

interface MetricsState {
  data: MetricsPayload | null;
  isLoading: boolean;
  error: string | null;
  /** Keyed `${metric}:${dimension}` — a cut fetched once is kept. */
  slices: Record<string, SlicePayload>;
  sliceLoading: string | null;
  sliceError: string | null;
}

const initialState: MetricsState = {
  data: null,
  isLoading: false,
  error: null,
  slices: {},
  sliceLoading: null,
  sliceError: null,
};

export const sliceKey = (metric: string, dimension: string) => `${metric}:${dimension}`;

export const fetchMetricSlice = createAsyncThunk<
  SlicePayload,
  { metric: string; dimension: string },
  { rejectValue: string }
>('metrics/fetchSlice', async ({ metric, dimension }, { rejectWithValue }) => {
  try {
    return await apiFetch<SlicePayload>(`/metrics/${metric}/by/${dimension}/`);
  } catch (err) {
    return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load that cut.');
  }
});

export const fetchMetrics = createAsyncThunk<MetricsPayload, void, { rejectValue: string }>(
  'metrics/fetch',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<MetricsPayload>('/metrics/');
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load the metrics.');
    }
  }
);

const metricsSlice = createSlice({
  name: 'metrics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMetrics.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMetrics.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(fetchMetrics.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the metrics.';
      })
      .addCase(fetchMetricSlice.pending, (state, action) => {
        state.sliceLoading = sliceKey(action.meta.arg.metric, action.meta.arg.dimension);
        state.sliceError = null;
      })
      .addCase(fetchMetricSlice.fulfilled, (state, action) => {
        state.sliceLoading = null;
        state.slices[sliceKey(action.payload.metric.key, action.payload.dimension.key)] =
          action.payload;
      })
      .addCase(fetchMetricSlice.rejected, (state, action) => {
        state.sliceLoading = null;
        state.sliceError = action.payload ?? 'Could not load that cut.';
      });
  },
});

export default metricsSlice.reducer;
