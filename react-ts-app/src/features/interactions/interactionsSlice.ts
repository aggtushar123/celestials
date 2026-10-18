import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

// Mirrors revenact-backend's InteractionStatsView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/interactions/stats/.
//
// An "interaction" is an email, a call or a ticket: the three record types the
// AI Trending Topics dashboard counts together.
//
// No colours in here. The backend returns names and numbers; each chart maps a
// name to a CSS variable itself, the same way the Ticket Overview and Health
// charts already do. Only the mock this replaced carried `fill` in its data.

/** Every breakdown comes back the same shape: `name` is what a chart renders,
 *  `key` the machine value its filter sends back, `value` the count. */
export interface InteractionBucket {
  key: string;
  name: string;
  value: number;
}

/** One week of the sentiment trend. `date` is pre-formatted by the backend
 *  ("Jun 15, 2025") because the axis renders it verbatim. */
export interface SentimentPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

/** A row of the Detailed Activity Breakdown table. Every field is a display
 *  label already — the taxonomy ones are empty strings for an interaction
 *  nothing has classified yet, which the table shows as a dash. */
export interface InteractionRow {
  /** `ticket:12` — kind and primary key, the handle a correction is sent for. */
  id: string;
  source: string;
  account: string;
  title: string;
  sentiment: string;
  area: string;
  category: string;
  subcategory: string;
  /** The stored values behind the labels above, for prefilling a correction. */
  keys: { sentiment: string; area: string; category: string; subcategory: string };
  /** True once a person has corrected the tags by hand; a reclassify then leaves the row alone. */
  corrected: boolean;
  occurred_on: string;
}

export interface CorrectionResult {
  id: string;
  keys: InteractionRow['keys'];
  labels: { area: string; category: string; subcategory: string; sentiment: string };
  corrected: boolean;
}

/** A person correcting the model's tags on one row — logged on the backend
 *  as feedback, and outranking every later reclassify. */
export const correctClassification = createAsyncThunk<
  CorrectionResult,
  { id: string; fields: Partial<InteractionRow['keys']>; note?: string },
  { rejectValue: string }
>('interactions/correct', async ({ id, fields, note }, { rejectWithValue }) => {
  const [kind, pk] = id.split(':');
  try {
    return await apiFetch<CorrectionResult>(`/interactions/${kind}/${pk}/classification/`, {
      method: 'PATCH',
      body: { ...fields, note: note ?? '' },
    });
  } catch (err) {
    return rejectWithValue(err instanceof ApiError ? err.message : 'Could not save that correction.');
  }
});

export interface InteractionFilterOption {
  value: string;
  name: string;
}

/** A subcategory option carries its parent category, so the filter bar can
 *  narrow that dropdown to the category already chosen. */
export interface SubcategoryOption extends InteractionFilterOption {
  category: string;
}

export interface InteractionFilterOptions {
  customers: { id: number; name: string }[];
  accounts: { id: number; name: string }[];
  types: InteractionFilterOption[];
  sentiments: InteractionFilterOption[];
  areas: InteractionFilterOption[];
  categories: InteractionFilterOption[];
  subcategories: SubcategoryOption[];
  revenue_brackets: InteractionFilterOption[];
}

export interface InteractionStats {
  /** Every interaction in scope. */
  total: number;
  /** How many of those carry an AI classification. The three taxonomy charts
   *  count only these, so the screen can say what share of the book it is
   *  describing rather than implying an empty donut means an empty book. */
  classified: number;
  by_type: InteractionBucket[];
  sentiment: InteractionBucket[];
  areas: InteractionBucket[];
  categories: InteractionBucket[];
  subcategories: InteractionBucket[];
  sentiment_timeline: SentimentPoint[];
  recent: InteractionRow[];
  /** Shipped alongside the numbers so the filter bar needs no second round
   *  trip, and so its options are scoped the same way the numbers are. */
  filters: InteractionFilterOptions;
}

interface InteractionsState {
  stats: InteractionStats | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: InteractionsState = {
  stats: null,
  isLoading: false,
  error: null,
};

/** Takes a raw query string (`type=call&sentiment=negative`) rather than an
 *  options object — same "the caller builds it with URLSearchParams" shape as
 *  fetchTicketStats, because the filter bar already has one. */
export const fetchInteractionStats = createAsyncThunk<
  InteractionStats,
  string | void,
  { rejectValue: string }
>('interactions/fetchStats', async (query, { rejectWithValue }) => {
  try {
    return await apiFetch<InteractionStats>(
      query ? `/interactions/stats/?${query}` : '/interactions/stats/'
    );
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load activity insights.';
    return rejectWithValue(message);
  }
});

const interactionsSlice = createSlice({
  name: 'interactions',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(correctClassification.fulfilled, (state, action) => {
        const row = state.stats?.recent.find((r) => r.id === action.payload.id);
        if (row) {
          row.keys = action.payload.keys;
          row.area = action.payload.labels.area;
          row.category = action.payload.labels.category;
          row.subcategory = action.payload.labels.subcategory;
          row.sentiment = action.payload.labels.sentiment;
          row.corrected = action.payload.corrected;
        }
      })
      .addCase(fetchInteractionStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchInteractionStats.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchInteractionStats.rejected, (state, action) => {
        state.isLoading = false;
        // The previous stats are deliberately left in place: a filter change
        // that fails shouldn't blank a dashboard that was showing real
        // numbers a moment ago. The view shows the error above them.
        state.error = action.payload ?? 'Could not load activity insights.';
      });
  },
});

export default interactionsSlice.reducer;
