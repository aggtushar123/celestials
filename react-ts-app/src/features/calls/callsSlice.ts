import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { accountBase } from '../../lib/accountPaths';
import { listScope, parentScope } from '../../lib/listScope';
import type { Analysis } from '../contacts/contactsTypes';
import type { Attachment, FileParent } from '../files/filesSlice';

// CallSense on an organisation or account — see revenact-backend
// docs/API_CONTRACTS.md -> Calls. A call is logged with a summary, or with
// a transcript the model summarises; either way it is classified for
// sentiment so the Account Pulse counts it.

export type Sentiment = 'positive' | 'neutral' | 'negative' | '';

export interface Call {
  id: number;
  title: string;
  host_name: string;
  occurred_at: string;
  duration_minutes: number | null;
  summary: string;
  sentiment: Sentiment;
  /** Whether the call has been read (spec 2026-09-28 §1): `sentiment` is a
   *  reading only when this is `analysed`. Optional: older fixtures have none. */
  analysis?: Analysis;
  ai_area: string;
  ai_category: string;
  recording_url: string;
  connector_name: string | null;
  connector_provider: string | null;
  logged_by: { id: number; name: string } | null;
  transcript: Attachment | null;
  /** Who from the customer's side was on it; the call's sentiment is theirs. */
  participants: { id: number; name: string; role_display: string; sentiment: string }[];
  links: number;
  created_at: string;
  /** The account it is on; null on the organization itself. The
   *  organization's list rolls up its visible accounts' calls. */
  account_id?: number | null;
  account_name?: string | null;
}

export interface LogCallInput {
  title: string;
  host_name?: string;
  occurred_at: string;
  duration_minutes?: number | null;
  summary?: string;
  recording_url?: string;
  transcript_text?: string;
  transcriptFile?: File | null;
  participant_ids?: number[];
}

export function callsPath({ entityType, customerId, accountId }: FileParent): string {
  if (entityType === 'organization') {
    if (customerId == null) throw new Error('callsPath: an organisation read needs a customerId.');
    return `/customers/${customerId}/calls/`;
  }
  if (accountId == null) throw new Error('callsPath: an account read needs an accountId.');
  return `${accountBase(accountId, customerId)}/calls/`;
}

interface CallsState {
  items: Call[];
  isLoading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  /** Whose calls `items` holds (listScope); null while none are. */
  scope: string | null;
  /** The last read asked for: a slower, earlier one never lands. */
  requestId?: string;
}

const initialState: CallsState = { items: [], isLoading: false, error: null, saving: false, saveError: null, scope: null };

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export const fetchCalls = createAsyncThunk<Call[], FileParent, { rejectValue: string }>(
  'calls/fetch',
  async (parent, { rejectWithValue }) => {
    try {
      return await apiFetch<Call[]>(callsPath(parent));
    } catch (err) {
      return rejectWithValue(message(err, 'Could not load the calls.'));
    }
  }
);

export const logCall = createAsyncThunk<Call, FileParent & { input: LogCallInput }, { rejectValue: string }>(
  'calls/log',
  async ({ input, ...parent }, { rejectWithValue }) => {
    try {
      const { transcriptFile, ...fields } = input;
      if (transcriptFile) {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach((v) => formData.append(key, String(v)));
          else if (value !== undefined && value !== null && value !== '') formData.append(key, String(value));
        });
        formData.append('transcript', transcriptFile, transcriptFile.name);
        return await apiFetch<Call>(callsPath(parent), { method: 'POST', formData });
      }
      return await apiFetch<Call>(callsPath(parent), { method: 'POST', body: fields });
    } catch (err) {
      return rejectWithValue(message(err, 'Could not log that call.'));
    }
  }
);

const callsSlice = createSlice({
  name: 'calls',
  initialState,
  reducers: {
    clearCalls(state) {
      state.items = [];
      state.error = null;
      state.scope = null;
    },
    /** A new log-a-call form starts clean, not with the last one's failure. */
    clearCallSaveError(state) {
      state.saveError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCalls.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.requestId = action.meta.requestId;
        // Another organization's or account's calls never show under this one.
        if (parentScope(action.meta.arg) !== state.scope) {
          state.items = [];
          state.scope = null;
        }
      })
      .addCase(fetchCalls.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.isLoading = false;
        state.items = action.payload;
        state.scope = parentScope(action.meta.arg);
      })
      .addCase(fetchCalls.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the calls.';
      })
      .addCase(logCall.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(logCall.fulfilled, (state, action) => {
        state.saving = false;
        // Only into the list it belongs to: its own, or its organization's roll-up.
        const { customerId } = action.meta.arg;
        const rollUp = customerId !== null && state.scope === listScope(customerId);
        if (state.scope !== parentScope(action.meta.arg) && !rollUp) return;
        state.items = [action.payload, ...state.items].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      })
      .addCase(logCall.rejected, (state, action) => {
        state.saving = false;
        state.saveError = action.payload ?? 'Could not log that call.';
      });
  },
});

export const { clearCalls, clearCallSaveError } = callsSlice.actions;
export default callsSlice.reducer;
