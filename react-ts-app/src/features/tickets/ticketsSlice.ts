import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

// Mirrors revenact-backend's TicketStatsView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/tickets/stats/.
//
// Note there are no colours in here. The backend returns names and
// numbers; each chart maps a name to a CSS variable itself, the same
// way SurveyTrendChart and HealthDistribution already do. Only the mock this
// replaced carried `fill` in its data.

/** A `{name, value}` pair — what the two donuts and the origin bar eat. */
export interface TicketBucket {
  name: string;
  value: number;
}

export interface TicketOrigin extends TicketBucket {
  provider: string;
  /** Null for tickets raised in Revenact itself rather than pulled
   * from a connected system. */
  connector_id: number | null;
}

/** One row of the stacked assignee chart. The status keys are the
 * human labels because the chart stacks and legends by them, and
 * `total` is precomputed because the chart draws it through an
 * invisible bar rather than deriving it. */
export interface TicketAssigneeRow {
  name: string;
  total: number;
  [status: string]: string | number;
}

export interface TicketSentimentPoint {
  /** Pre-formatted ("Jun 2026") — the chart renders it verbatim as a
   * category tick. */
  date: string;
  positive: number;
  negative: number;
}

export interface TicketKpis {
  total: number;
  on_hold: number;
  /** Null, not zero, when nothing has resolved yet — an average of no
   * samples is undefined, and 0 would read as "everything closed
   * instantly". */
  avg_lifetime_days: number | null;
  resolution_rate: number;
  positive_sentiment: number;
  negative_sentiment: number;
  /** Unresolved tickets in scope (backend PR #62). Optional so a fixture
   *  written before the field existed still type-checks. */
  open_count?: number;
  /** Age of the oldest unresolved ticket; null when none is open. */
  oldest_open_days?: number | null;
}

export interface TicketFilterOptions {
  owners: { id: number; name: string }[];
  customers: { id: number; name: string }[];
  accounts: { id: number; name: string }[];
  connectors: { id: number; name: string; provider: string }[];
  priorities: { value: string; name: string }[];
}

export interface TicketStats {
  kpis: TicketKpis;
  priority: TicketBucket[];
  status: TicketBucket[];
  origin: TicketOrigin[];
  assignees: TicketAssigneeRow[];
  sentiment_timeline: TicketSentimentPoint[];
  /** Shipped alongside the numbers so the filter bar doesn't need a
   * second round trip, and so its options are scoped the same way the
   * numbers are. */
  filters: TicketFilterOptions;
}

interface TicketsState {
  stats: TicketStats | null;
  statsLoading: boolean;
  statsError: string | null;
  /** The query `stats` answers ('' for none); null before the first load.
   *  A reader showing a different query treats `stats` as not yet loaded. */
  statsQuery: string | null;
  /** The latest request. An older one landing late is ignored, so a slow
   *  answer to a previous filter never overwrites the current one. */
  statsRequestId: string | null;
}

const initialState: TicketsState = {
  stats: null,
  statsLoading: false,
  statsError: null,
  statsQuery: null,
  statsRequestId: null,
};

/** Takes a raw query string (`priority=high&from=2026-01-01`) rather
 * than an options object — the same "caller builds it with
 * URLSearchParams" convention `fetchAllAccounts` uses, which keeps the
 * thunk from having to know about every filter the bar grows. */
export const fetchTicketStats = createAsyncThunk<TicketStats, string | void, { rejectValue: string }>(
  'tickets/fetchTicketStats',
  async (query, { rejectWithValue }) => {
    try {
      return await apiFetch<TicketStats>(query ? `/tickets/stats/?${query}` : '/tickets/stats/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load ticket stats.';
      return rejectWithValue(message);
    }
  }
);

const ticketsSlice = createSlice({
  name: 'tickets',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // `stats` is deliberately left in place while a refetch runs, so
      // changing a filter dims the existing charts rather than
      // blanking the dashboard and reflowing it.
      .addCase(fetchTicketStats.pending, (state, action) => {
        state.statsLoading = true;
        state.statsError = null;
        state.statsRequestId = action.meta.requestId;
      })
      .addCase(fetchTicketStats.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.statsRequestId) return;
        state.statsLoading = false;
        state.stats = action.payload;
        state.statsQuery = action.meta.arg ?? '';
      })
      .addCase(fetchTicketStats.rejected, (state, action) => {
        if (action.meta.requestId !== state.statsRequestId) return;
        state.statsLoading = false;
        state.statsError = action.payload ?? 'Could not load ticket stats.';
      });
  },
});

export default ticketsSlice.reducer;
