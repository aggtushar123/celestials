import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's ProductUsageView response exactly — see
// docs/API_CONTRACTS.md -> customers -> GET /api/v1/customers/products/.
//
// One row per product, compared against each other. Like the Customer
// Overview payload and unlike the working dashboards, it includes churned
// customers: churn by product is half of what this screen is for.
//
// Products became rows in backend migration 0030 (/api/v1/products/), so a
// row carries an id, the filter takes one, and the `spellings` count this
// payload used to carry is gone — there is nothing left to fold.

export interface ProductRow {
  /** The Product id, or null for the "no product recorded" bucket. */
  id: number | null;
  product: string;
  customers: number;
  arr: number;
  /** Share of the whole book's ARR. Set server-side across all rows. */
  share: number;
  /** Active customers with no exchange rate — counted in the seat and logo
   *  figures, in none of the money ones. */
  unpriced: number;
  /** Seats over seats, not the mean of per-account percentages. Null when no
   *  seats are recorded: unmeasured is not unused. */
  utilisation: number | null;
  contracted_seats: number;
  active_seats: number;
  health: Record<'good' | 'average' | 'poor', number>;
  healthy_share: number | null;
  /** ARR sitting in accounts that are not Good. What "weakest" ranks on. */
  unhealthy_arr: number;
  /** Null when nobody on this product answered a survey — not zero, which
   *  would make it the worst-rated product on the screen. */
  ces: number | null;
  nps: number | null;
  open_tickets: number;
  tickets_per_customer: number | null;
  churned: number;
  churned_arr: number;
  /** Of everyone this product ever led, the share who left. */
  churn_rate: number | null;
}

export interface ProductKpis {
  products: number;
  customers: number;
  arr: number;
  largest: { product: string; share: number; arr: number } | null;
  /** The most ARR sitting in unhealthy accounts — money at stake, not the
   *  worst percentage. Null when nothing is unhealthy. */
  weakest: {
    product: string;
    unhealthy_arr: number;
    healthy_share: number | null;
    customers: number;
    healthy: number;
  } | null;
  worst_churn: { product: string; churned: number; churned_arr: number } | null;
  /** Products in the catalogue with nobody on them **in this selection** —
   *  the rows are the whole catalogue while the customers are scoped to the
   *  caller's book and the filters, so this is not "unsold". */
  without_customers: string[];
}

/** Why these numbers are not a revenue split. Stated on the screen. */
export interface Attribution {
  basis: string;
  note: string;
}

export interface ProductStats {
  rows: ProductRow[];
  kpis: ProductKpis;
  attribution: Attribution;
  currency: CurrencyCode;
  filters: {
    products: { value: string; name: string }[];
    owners: { value: string; name: string }[];
    lifecycles: { value: string; name: string }[];
  };
}

interface ProductsState {
  stats: ProductStats | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: ProductsState = { stats: null, isLoading: false, error: null };

export const fetchProductUsage = createAsyncThunk<
  ProductStats,
  string | void,
  { rejectValue: string }
>('products/fetch', async (query, { rejectWithValue }) => {
  try {
    return await apiFetch<ProductStats>(
      query ? `/customers/products/?${query}` : '/customers/products/'
    );
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load product usage.';
    return rejectWithValue(message);
  }
});

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProductUsage.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchProductUsage.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchProductUsage.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load product usage.';
      });
  },
});

export default productsSlice.reducer;
