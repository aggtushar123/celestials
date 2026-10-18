import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

// Mirrors revenact-backend's /api/v1/copilot/skills/ — see docs/API_CONTRACTS.md
// -> copilot -> skills. What each agent may do, beside how it has been used.

export interface SkillUsage {
  calls: number;
  ok: number;
  failed: number;
  spent: number;
  budget: number;
  remaining: number;
  custom_budget: boolean;
}

export interface Skill {
  purpose: string;
  name: string;
  summary: string;
  reads: string[];
  may: string[];
  never: string[];
  trigger: string;
  gate: string;
  surface: string;
  usage: SkillUsage;
  last_run: { at: string; outcome: 'ok' | 'failed' | 'unconfigured' | 'over_budget'; user: string | null } | null;
  /** All-time artefacts, where the count is exact; null where it is not. */
  produced: { label: string; count: number; approved?: number } | null;
}

export interface SkillsPayload {
  month_start: string;
  skills: Skill[];
}

interface SkillsState {
  data: SkillsPayload | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: SkillsState = { data: null, isLoading: false, error: null };

export const fetchSkills = createAsyncThunk<SkillsPayload, void, { rejectValue: string }>(
  'skills/fetch',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<SkillsPayload>('/copilot/skills/');
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load the skills.');
    }
  }
);

const skillsSlice = createSlice({
  name: 'skills',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSkills.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSkills.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(fetchSkills.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the skills.';
      });
  },
});

export default skillsSlice.reducer;
