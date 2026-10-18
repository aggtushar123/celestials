import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Capability, User, UserFunction } from '../auth/authSlice';

// A member is just a User as seen by someone with `manage_users` — the
// same shape UserSerializer returns everywhere else. See
// revenact-backend's docs/API_CONTRACTS.md → GET/POST /api/v1/auth/users/.
//
// This list used to be CSMs only (`/auth/csms/`), which meant an admin
// couldn't see or manage themselves or any fellow admin on the Users
// page at all.
export type Member = User;

export interface Role {
  id: number;
  name: string;
  slug: string;
  permissions: Capability[];
  /** The built-in Admin/CSM roles — not renamable, editable, or
   * deletable (the backend rejects those, see RoleSerializer). */
  is_system: boolean;
  users_count: number;
  created_at: string;
}

/** One entry of the capability vocabulary, fetched from the backend so
 * the role editor's checkboxes can't drift from what's enforced. */
export interface CapabilityOption {
  key: Capability;
  label: string;
}

interface UserManagementState {
  members: Member[];
  roles: Role[];
  capabilities: CapabilityOption[];
  isLoading: boolean;
  error: string | null;
}

const initialState: UserManagementState = {
  members: [],
  roles: [],
  capabilities: [],
  isLoading: false,
  error: null,
};

// ── Members ───────────────────────────────────────────────────────────

export const fetchMembers = createAsyncThunk<Member[], void, { rejectValue: string }>(
  'userManagement/fetchMembers',
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiFetch<{ results: Member[] }>('/auth/users/');
      return data.results;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load team members.';
      return rejectWithValue(message);
    }
  }
);

export const addMember = createAsyncThunk<
  Member,
  { name: string; email: string; password: string; role_id?: number; function?: UserFunction; reports_to_id?: number | null },
  { rejectValue: string }
>('userManagement/addMember', async (data, { rejectWithValue }) => {
  try {
    return await apiFetch<Member>('/auth/users/', { method: 'POST', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not add team member.';
    return rejectWithValue(message);
  }
});

interface UpdateMemberArgs {
  id: number;
  name?: string;
  is_active?: boolean;
  role_id?: number;
  password?: string;
  function?: UserFunction;
  reports_to_id?: number | null;
}

export const updateMember = createAsyncThunk<Member, UpdateMemberArgs, { rejectValue: string }>(
  'userManagement/updateMember',
  async ({ id, ...body }, { rejectWithValue }) => {
    try {
      return await apiFetch<Member>(`/auth/users/${id}/`, { method: 'PATCH', body });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update team member.';
      return rejectWithValue(message);
    }
  }
);

// ── Roles & capabilities ──────────────────────────────────────────────

export const fetchRoles = createAsyncThunk<Role[], void, { rejectValue: string }>(
  'userManagement/fetchRoles',
  async (_, { rejectWithValue }) => {
    try {
      // Pagination is off on this endpoint (see RoleListCreateView's own
      // docstring) — a plain array.
      return await apiFetch<Role[]>('/auth/roles/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load roles.';
      return rejectWithValue(message);
    }
  }
);

export const fetchCapabilities = createAsyncThunk<
  CapabilityOption[],
  void,
  { rejectValue: string }
>('userManagement/fetchCapabilities', async (_, { rejectWithValue }) => {
  try {
    return await apiFetch<CapabilityOption[]>('/auth/capabilities/');
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load permissions.';
    return rejectWithValue(message);
  }
});

export const addRole = createAsyncThunk<
  Role,
  { name: string; permissions: Capability[] },
  { rejectValue: string }
>('userManagement/addRole', async (data, { rejectWithValue }) => {
  try {
    return await apiFetch<Role>('/auth/roles/', { method: 'POST', body: data });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not create this role.';
    return rejectWithValue(message);
  }
});

export const updateRole = createAsyncThunk<
  Role,
  { id: number; name?: string; permissions?: Capability[] },
  { rejectValue: string }
>('userManagement/updateRole', async ({ id, ...body }, { rejectWithValue }) => {
  try {
    return await apiFetch<Role>(`/auth/roles/${id}/`, { method: 'PATCH', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update this role.';
    return rejectWithValue(message);
  }
});

export const deleteRole = createAsyncThunk<number, number, { rejectValue: string }>(
  'userManagement/deleteRole',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<null>(`/auth/roles/${id}/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete this role.';
      return rejectWithValue(message);
    }
  }
);

const userManagementSlice = createSlice({
  name: 'userManagement',
  initialState,
  reducers: {
    // The forms surface their own failures inline; this clears the
    // page-level banner between actions.
    clearUserManagementError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMembers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMembers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.members = action.payload;
      })
      .addCase(fetchMembers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(addMember.fulfilled, (state, action) => {
        state.members.push(action.payload);
        state.members.sort((a, b) => a.name.localeCompare(b.name));
      })
      .addCase(updateMember.fulfilled, (state, action) => {
        const index = state.members.findIndex((member) => member.id === action.payload.id);
        if (index !== -1) state.members[index] = action.payload;
      })
      // addMember's own rejection is shown inline in its modal form
      // instead (it has the fields to react to); updateMember's
      // deactivate/role-change controls have no form of their own, so
      // their failures — including the real last-user-manager guardrail
      // the backend enforces — surface in the page banner.
      .addCase(updateMember.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.roles = action.payload;
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchCapabilities.fulfilled, (state, action) => {
        state.capabilities = action.payload;
      })
      .addCase(addRole.fulfilled, (state, action) => {
        state.roles.push(action.payload);
        state.roles.sort((a, b) => a.name.localeCompare(b.name));
      })
      .addCase(updateRole.fulfilled, (state, action) => {
        const index = state.roles.findIndex((role) => role.id === action.payload.id);
        if (index !== -1) state.roles[index] = action.payload;
      })
      .addCase(updateRole.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(deleteRole.fulfilled, (state, action) => {
        state.roles = state.roles.filter((role) => role.id !== action.payload);
      })
      .addCase(deleteRole.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      });
  },
});

export const { clearUserManagementError } = userManagementSlice.actions;
export default userManagementSlice.reducer;
