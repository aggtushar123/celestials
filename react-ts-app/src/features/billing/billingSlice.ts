// The tenant's own billing, from revenact-backend's /api/v1/billing/ (see
// docs/API_CONTRACTS.md, "Billing"). Read-only here: buying happens through
// the payment provider (next phase) and staff change plans from the portal.
// Nothing on the client decides what an organisation has.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

export interface BillingPlan {
  code: string;
  name: string;
  seats_included: number;
  monthly_credits: number;
  price_cents: number;
  currency: string;
  is_trial?: boolean;
}

export interface BillingSummary {
  plan: BillingPlan & { is_trial: boolean };
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  seats: { used: number; limit: number };
  credits: { balance: number };
  trial_ends_at: string | null;
  current_period_end: string | null;
  enforced: boolean;
}

export interface LedgerRow {
  id: number;
  kind: 'grant' | 'consume' | 'refund' | 'adjust' | 'expire';
  amount: number;
  balance_after: number;
  reason: string;
  actor: string | null;
  at: string;
}

interface BillingState {
  summary: BillingSummary | null;
  ledger: LedgerRow[];
  plans: BillingPlan[];
  isLoading: boolean;
  error: string | null;
}

const initialState: BillingState = { summary: null, ledger: [], plans: [], isLoading: false, error: null };

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { message?: string }; detail?: string } | undefined;
    return body?.error?.message ?? body?.detail ?? err.message ?? fallback;
  }
  return fallback;
}

export const fetchBillingSummary = createAsyncThunk<BillingSummary, void, { rejectValue: string }>(
  'billing/summary',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<BillingSummary>('/billing/account/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load your plan.'));
    }
  }
);

export const fetchBillingLedger = createAsyncThunk<LedgerRow[], void, { rejectValue: string }>(
  'billing/ledger',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<LedgerRow[]>('/billing/ledger/?limit=100');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load the credit history.'));
    }
  }
);

export const fetchPlans = createAsyncThunk<BillingPlan[], void, { rejectValue: string }>(
  'billing/plans',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<BillingPlan[]>('/billing/plans/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load plans.'));
    }
  }
);

const billingSlice = createSlice({
  name: 'billing',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBillingSummary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchBillingSummary.fulfilled, (state, action) => {
        state.isLoading = false;
        state.summary = action.payload;
      })
      .addCase(fetchBillingSummary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchBillingLedger.fulfilled, (state, action) => {
        state.ledger = action.payload;
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.plans = action.payload;
      });
  },
});

export default billingSlice.reducer;
