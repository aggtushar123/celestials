import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

// Mirrors revenact-backend's feedback payloads — see docs/API_CONTRACTS.md
// -> metrics -> Feedback.
//
// The feedback log: every correction a person made to something the system
// said, with what the system said and what the person said in the same row.

export type FeedbackKind = 'classification' | 'proposal' | 'health_override';

export interface FeedbackEntry {
  id: number;
  kind: FeedbackKind;
  kind_display: string;
  subject_type: string;
  subject_id: number;
  subject_label: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  note: string;
  made_by: string | null;
  created_at: string;
}

export interface FeedbackPayload {
  counts: Record<FeedbackKind, number>;
  feedback: FeedbackEntry[];
}

interface FeedbackState {
  data: FeedbackPayload | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: FeedbackState = { data: null, isLoading: false, error: null };

export const fetchFeedback = createAsyncThunk<FeedbackPayload, FeedbackKind | '' | void, { rejectValue: string }>(
  'feedback/fetch',
  async (kind, { rejectWithValue }) => {
    try {
      return await apiFetch<FeedbackPayload>(kind ? `/metrics/feedback/?kind=${kind}` : '/metrics/feedback/');
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load the feedback log.');
    }
  }
);

const feedbackSlice = createSlice({
  name: 'feedback',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeedback.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchFeedback.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(fetchFeedback.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the feedback log.';
      });
  },
});

export default feedbackSlice.reducer;
