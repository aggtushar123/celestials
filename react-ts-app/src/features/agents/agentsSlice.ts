import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

// Mirrors revenact-backend's /api/v1/copilot/usage/ — see docs/API_CONTRACTS.md
// -> copilot -> ModelCall / ModelBudget.
//
// What the brain has spent this month, per purpose, against its budget —
// and the last fifty model calls, whoever asked for them.

export type CallOutcome = 'ok' | 'failed' | 'unconfigured' | 'over_budget';

export interface PurposeUsage {
  purpose: string;
  label: string;
  calls: number;
  ok: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
  /** input + output this month. */
  spent: number;
  budget: number;
  remaining: number;
  /** True when this organisation set its own budget rather than the default. */
  custom_budget: boolean;
}

export interface ModelCallRow {
  id: number;
  purpose: string;
  purpose_label: string;
  user: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  outcome: CallOutcome;
  error: string;
  created_at: string;
}

export interface UsagePayload {
  month_start: string;
  purposes: PurposeUsage[];
  default_budget: number;
  recent: ModelCallRow[];
}

interface AgentsState {
  data: UsagePayload | null;
  isLoading: boolean;
  error: string | null;
  saveError: string | null;
}

const initialState: AgentsState = { data: null, isLoading: false, error: null, saveError: null };

export const fetchUsage = createAsyncThunk<UsagePayload, void, { rejectValue: string }>(
  'agents/fetchUsage',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<UsagePayload>('/copilot/usage/');
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load model usage.');
    }
  }
);

/** Set one purpose's monthly budget, or null to return it to the default. */
export const setBudget = createAsyncThunk<
  Pick<UsagePayload, 'month_start' | 'purposes'>,
  { purpose: string; monthly_tokens: number | null },
  { rejectValue: string }
>('agents/setBudget', async (body, { rejectWithValue }) => {
  try {
    return await apiFetch<Pick<UsagePayload, 'month_start' | 'purposes'>>('/copilot/usage/budgets/', {
      method: 'PATCH',
      body,
    });
  } catch (err) {
    return rejectWithValue(err instanceof ApiError ? err.message : 'Could not save that budget.');
  }
});

const agentsSlice = createSlice({
  name: 'agents',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsage.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsage.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(fetchUsage.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load model usage.';
      })
      .addCase(setBudget.pending, (state) => {
        state.saveError = null;
      })
      .addCase(setBudget.fulfilled, (state, action) => {
        if (state.data) state.data.purposes = action.payload.purposes;
      })
      .addCase(setBudget.rejected, (state, action) => {
        state.saveError = action.payload ?? 'Could not save that budget.';
      });
  },
});

export default agentsSlice.reducer;
