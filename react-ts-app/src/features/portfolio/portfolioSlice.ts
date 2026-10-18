import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's CustomerOverviewView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/customers/overview/.
//
// This is the one dashboard payload that includes churned customers, which is
// what makes retention and cohort figures possible at all. Every field says
// which population it speaks for.

export interface PortfolioKpis {
  active: number;
  active_arr: number;
  /** Null on an empty book rather than a flattering zero. */
  average_arr: number | null;
  churned: number;
  churned_arr: number;
  churned_12m: number;
  churned_arr_12m: number;
  /** Logos kept, of every logo ever signed. Null when nothing ever was. */
  logo_retention: number | null;
  /** Customers whose ARR has no exchange rate, so they count in the logo
   *  figures and in no money figure. */
  unpriced: number;
}

export interface ConcentrationRow {
  rank: number;
  id: number;
  name: string;
  arr: number;
  share: number;
  cumulative_share: number;
  owner: string;
  health_category: 'good' | 'average' | 'poor';
}

export interface Concentration {
  rows: ConcentrationRow[];
  total_arr: number;
  counted: number;
  /** The tail beyond the named rows — folded, not dropped, so a reader can see
   *  how little of the book it is. */
  rest_count: number;
  rest_arr: number;
  top_three_share: number | null;
}

export interface CohortRow {
  year: number;
  joined: number;
  retained: number;
  churned: number;
  retention: number | null;
}

export interface ChurnReason {
  /** The stored value — one of Customer.ChurnReason, or '' for a churned
   *  customer whose reason nobody recorded (not the same as 'other'). */
  value: string;
  /** The label, from the API, so this screen keeps no copy of the taxonomy. */
  reason: string;
  customers: number;
  arr: number;
}

export interface CompositionRow {
  key: string;
  name: string;
  customers: number;
  arr: number;
}

export interface PortfolioStats {
  kpis: PortfolioKpis;
  concentration: Concentration;
  cohorts: { rows: CohortRow[]; undated: number };
  churn_reasons: ChurnReason[];
  segments: { rows: CompositionRow[]; unplaced: number };
  lifecycle: CompositionRow[];
  currency: CurrencyCode;
  filters: {
    owners: { value: string; name: string }[];
    lifecycles: { value: string; name: string }[];
    customers: { value: string; name: string }[];
  };
}

interface PortfolioState {
  stats: PortfolioStats | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: PortfolioState = { stats: null, isLoading: false, error: null };

export const fetchPortfolio = createAsyncThunk<
  PortfolioStats,
  string | void,
  { rejectValue: string }
>('portfolio/fetch', async (query, { rejectWithValue }) => {
  try {
    return await apiFetch<PortfolioStats>(
      query ? `/customers/overview/?${query}` : '/customers/overview/'
    );
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load the portfolio.';
    return rejectWithValue(message);
  }
});

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPortfolio.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchPortfolio.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the portfolio.';
      });
  },
});

export default portfolioSlice.reducer;
