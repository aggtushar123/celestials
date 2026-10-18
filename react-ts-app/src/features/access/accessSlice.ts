// Who may join, and how: the admin side of revenact-backend's
// services/identity (see docs/API_CONTRACTS.md, "Tenant administration").
//
//   GET/POST /identity/domains/, POST /identity/domains/<id>/verify/
//   GET      /identity/access-requests/, POST .../<id>/approve|reject/
//   GET/POST /identity/invitations/,     POST .../<id>/cancel/
//
// Every call is scoped server-side through the caller's membership. There
// is no organisation id to send, which is the point: nothing here can be
// pointed at another tenant.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

export interface AccessRequest {
  id: number;
  email: string;
  user_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  requested_at: string;
  reviewed_at: string | null;
  rejection_reason: string;
}

export interface Invitation {
  id: number;
  email: string;
  role_id: number;
  role_name: string;
  department_id: number | null;
  department_name: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invited_by_name: string;
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface OrganisationDomain {
  id: number;
  domain: string;
  is_primary: boolean;
  verification_status: 'pending' | 'verified' | 'revoked';
  verified_at: string | null;
  /** Exactly what to publish; null once verified. */
  dns_record: { type: 'TXT'; name: string; value: string } | null;
  created_at: string;
}

interface AccessState {
  requests: AccessRequest[];
  invitations: Invitation[];
  domains: OrganisationDomain[];
  isLoading: boolean;
  error: string | null;
}

const initialState: AccessState = {
  requests: [],
  invitations: [],
  domains: [],
  isLoading: false,
  error: null,
};

/** The identity endpoints answer `{ success: false, error: { code, message } }`;
 * the message is written for people, so it is what we show. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { message?: string }; detail?: string } | undefined;
    return body?.error?.message ?? body?.detail ?? err.message ?? fallback;
  }
  return fallback;
}

export const fetchAccessRequests = createAsyncThunk<AccessRequest[], void, { rejectValue: string }>(
  'access/fetchRequests',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<AccessRequest[]>('/identity/access-requests/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load access requests.'));
    }
  }
);

export const decideAccessRequest = createAsyncThunk<
  { id: number; status: AccessRequest['status'] },
  { id: number; decision: 'approve' | 'reject'; roleId?: number; reason?: string },
  { rejectValue: string }
>('access/decide', async ({ id, decision, roleId, reason }, { rejectWithValue }) => {
  try {
    const body = decision === 'approve' ? { role_id: roleId } : { reason: reason ?? '' };
    const data = await apiFetch<{ status: AccessRequest['status'] }>(
      `/identity/access-requests/${id}/${decision}/`,
      { method: 'POST', body }
    );
    return { id, status: data.status };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not record that decision.'));
  }
});

export const fetchInvitations = createAsyncThunk<Invitation[], void, { rejectValue: string }>(
  'access/fetchInvitations',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<Invitation[]>('/identity/invitations/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load invitations.'));
    }
  }
);

export const sendInvitation = createAsyncThunk<
  Invitation,
  { email: string; roleId: number },
  { rejectValue: string }
>('access/invite', async ({ email, roleId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Invitation>('/identity/invitations/', {
      method: 'POST',
      body: { email, role_id: roleId },
    });
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not send that invitation.'));
  }
});

export const cancelInvitation = createAsyncThunk<number, number, { rejectValue: string }>(
  'access/cancelInvitation',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch(`/identity/invitations/${id}/cancel/`, { method: 'POST' });
      return id;
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not cancel that invitation.'));
    }
  }
);

export const fetchDomains = createAsyncThunk<OrganisationDomain[], void, { rejectValue: string }>(
  'access/fetchDomains',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<OrganisationDomain[]>('/identity/domains/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load domains.'));
    }
  }
);

export const addDomain = createAsyncThunk<OrganisationDomain, string, { rejectValue: string }>(
  'access/addDomain',
  async (domain, { rejectWithValue }) => {
    try {
      return await apiFetch<OrganisationDomain>('/identity/domains/', {
        method: 'POST',
        body: { domain },
      });
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not add that domain.'));
    }
  }
);

export const verifyDomain = createAsyncThunk<OrganisationDomain, number, { rejectValue: string }>(
  'access/verifyDomain',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<OrganisationDomain>(`/identity/domains/${id}/verify/`, {
        method: 'POST',
      });
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not verify that domain.'));
    }
  }
);

const accessSlice = createSlice({
  name: 'access',
  initialState,
  reducers: {
    clearAccessError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccessRequests.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAccessRequests.fulfilled, (state, action) => {
        state.isLoading = false;
        state.requests = action.payload;
      })
      .addCase(fetchAccessRequests.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Something went wrong.';
      })
      // A decided request leaves the pending list; the list only ever
      // shows what is still waiting.
      .addCase(decideAccessRequest.fulfilled, (state, action) => {
        state.requests = state.requests.filter((r) => r.id !== action.payload.id);
      })
      .addCase(decideAccessRequest.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchInvitations.fulfilled, (state, action) => {
        state.invitations = action.payload;
      })
      .addCase(fetchInvitations.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(sendInvitation.fulfilled, (state, action) => {
        // 200 on a re-send returns the existing row: replace, do not duplicate.
        const index = state.invitations.findIndex((i) => i.id === action.payload.id);
        if (index >= 0) state.invitations[index] = action.payload;
        else state.invitations.unshift(action.payload);
      })
      .addCase(cancelInvitation.fulfilled, (state, action) => {
        state.invitations = state.invitations.filter((i) => i.id !== action.payload);
      })
      .addCase(cancelInvitation.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchDomains.fulfilled, (state, action) => {
        state.domains = action.payload;
      })
      .addCase(fetchDomains.rejected, (state, action) => {
        state.error = action.payload ?? 'Something went wrong.';
      })
      .addCase(addDomain.fulfilled, (state, action) => {
        state.domains.push(action.payload);
      })
      .addCase(verifyDomain.fulfilled, (state, action) => {
        const index = state.domains.findIndex((d) => d.id === action.payload.id);
        if (index >= 0) state.domains[index] = action.payload;
      });
  },
});

export const { clearAccessError } = accessSlice.actions;
export default accessSlice.reducer;
