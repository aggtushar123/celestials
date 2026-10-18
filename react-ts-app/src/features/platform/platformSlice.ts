// The internal portal's data: revenact-backend's /api/v1/platform/ (see
// docs/API_CONTRACTS.md, "The internal portal"). Every call needs a staff
// account signed in with a second factor; a 403 with MFA_REQUIRED means the
// person is staff but this session skipped it.
//
// Metadata only, by construction on the server: nothing here ever holds a
// tenant's customers, emails or notes.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';

export interface PlatformOverview {
  organisations: { total: number; pending: number; active: number; suspended: number; archived: number };
  members_active: number;
  pending_requests: number;
  open_invitations: number;
  verified_domains: number;
  staff: number;
  gmail: { enabled_workspaces: number; connected: number; test_user_cap: number };
}

export interface PlatformOwner {
  id: number;
  name: string;
  email: string;
}

/** A workspace's two-way Gmail: the pilot switch, and its live Google
 *  connections (each holds a Google test-user slot) and how many are paused. */
export interface PlatformGmail {
  enabled: boolean;
  connected: number;
  paused: number;
}

export interface PlatformOrganisationSummary {
  id: number;
  name: string;
  slug: string;
  status: 'pending' | 'active' | 'suspended' | 'archived';
  created_at: string | null;
  owner: PlatformOwner | null;
  members_active: number;
  pending_requests: number;
  domains: { domain: string; verification_status: 'pending' | 'verified' | 'revoked' }[];
  plan: PlatformBilling | null;
  gmail: PlatformGmail;
}

export interface PlatformMembership {
  id: number;
  user_id: number;
  name: string;
  email: string;
  role: string | null;
  department: string | null;
  status: string;
  is_owner: boolean;
  is_active: boolean;
  approved_at: string | null;
  last_login: string | null;
}

export interface PlatformOrganisation extends PlatformOrganisationSummary {
  open_invitations: number;
  memberships: PlatformMembership[];
  domains: {
    id: number;
    domain: string;
    is_primary: boolean;
    verification_status: 'pending' | 'verified' | 'revoked';
    verified_at: string | null;
  }[];
  recent_events: { action: string; actor: string; outcome: string; target: string; at: string }[];
}

export interface PlatformStaffMember {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  mfa_enrolled: boolean;
  last_login: string | null;
}

export interface PlatformBilling {
  plan: { code: string; name: string; seats_included: number; monthly_credits: number; price_cents: number; currency: string; is_trial: boolean };
  status: string;
  seats: { used: number; limit: number };
  credits: { balance: number };
  trial_ends_at: string | null;
  current_period_end: string | null;
  enforced: boolean;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  ledger?: { id: number; kind: string; amount: number; balance_after: number; reason: string; actor: string | null; at: string }[];
  plans?: { code: string; name: string; seats_included: number; monthly_credits: number }[];
}

interface PlatformState {
  overview: PlatformOverview | null;
  organisations: PlatformOrganisationSummary[];
  organisation: PlatformOrganisation | null;
  billing: PlatformBilling | null;
  staff: PlatformStaffMember[];
  isLoading: boolean;
  error: string | null;
}

const initialState: PlatformState = {
  overview: null,
  organisations: [],
  organisation: null,
  billing: null,
  staff: [],
  isLoading: false,
  error: null,
};

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { message?: string }; detail?: string } | undefined;
    if (body?.detail === 'MFA_REQUIRED') return 'Platform access needs two-factor authentication on this session.';
    return body?.error?.message ?? body?.detail ?? err.message ?? fallback;
  }
  return fallback;
}

export const fetchOverview = createAsyncThunk<PlatformOverview, void, { rejectValue: string }>(
  'platform/overview',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<PlatformOverview>('/platform/overview/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load the overview.'));
    }
  }
);

export const fetchOrganisations = createAsyncThunk<
  PlatformOrganisationSummary[],
  { q?: string; status?: string } | void,
  { rejectValue: string }
>('platform/organisations', async (params, { rejectWithValue }) => {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query}` : '';
    return await apiFetch<PlatformOrganisationSummary[]>(`/platform/organisations/${suffix}`);
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not load organisations.'));
  }
});

export const fetchOrganisation = createAsyncThunk<PlatformOrganisation, number, { rejectValue: string }>(
  'platform/organisation',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<PlatformOrganisation>(`/platform/organisations/${id}/`);
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load that organisation.'));
    }
  }
);

export const setOrganisationStatus = createAsyncThunk<
  { id: number; status: PlatformOrganisation['status'] },
  { id: number; status: 'active' | 'suspended'; reason: string },
  { rejectValue: string }
>('platform/status', async ({ id, status, reason }, { rejectWithValue }) => {
  try {
    const data = await apiFetch<{ status: PlatformOrganisation['status'] }>(
      `/platform/organisations/${id}/status/`,
      { method: 'POST', body: { status, reason } }
    );
    return { id, status: data.status };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not change the status.'));
  }
});

export const transferOwnership = createAsyncThunk<
  { id: number; owner: PlatformOwner },
  { id: number; userId: number },
  { rejectValue: string }
>('platform/owner', async ({ id, userId }, { rejectWithValue }) => {
  try {
    const data = await apiFetch<{ owner: PlatformOwner }>(`/platform/organisations/${id}/owner/`, {
      method: 'POST',
      body: { user_id: userId },
    });
    return { id, owner: data.owner };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not transfer ownership.'));
  }
});

export const createOrganisation = createAsyncThunk<
  PlatformOrganisationSummary & { owner_mailed: boolean },
  { name: string; ownerEmail: string; ownerName: string },
  { rejectValue: string }
>('platform/create', async ({ name, ownerEmail, ownerName }, { rejectWithValue }) => {
  try {
    return await apiFetch<PlatformOrganisationSummary & { owner_mailed: boolean }>('/platform/organisations/', {
      method: 'POST',
      body: { name, owner_email: ownerEmail, owner_name: ownerName },
    });
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not create the organisation.'));
  }
});

export const renameOrganisation = createAsyncThunk<
  { id: number; name: string },
  { id: number; name: string },
  { rejectValue: string }
>('platform/rename', async ({ id, name }, { rejectWithValue }) => {
  try {
    const data = await apiFetch<{ id: number; name: string }>(`/platform/organisations/${id}/`, {
      method: 'PATCH',
      body: { name },
    });
    return { id, name: data.name };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not rename the organisation.'));
  }
});

export const archiveOrganisation = createAsyncThunk<{ id: number }, { id: number; reason: string }, { rejectValue: string }>(
  'platform/archive',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      await apiFetch(`/platform/organisations/${id}/`, { method: 'DELETE', body: { reason } });
      return { id };
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not archive the organisation.'));
    }
  }
);

export const setGmailTwoWay = createAsyncThunk<
  { id: number; gmail: PlatformGmail },
  { id: number; enabled: boolean; reason: string },
  { rejectValue: string }
>('platform/gmail', async ({ id, enabled, reason }, { rejectWithValue }) => {
  try {
    const data = await apiFetch<{ gmail: PlatformGmail }>(`/platform/organisations/${id}/gmail/`, { method: 'POST', body: { enabled, reason } });
    return { id, gmail: data.gmail };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not change Google two-way mail.'));
  }
});

export type PlatformDomain = PlatformOrganisation['domains'][number];

/** Staff vouch for a domain that cannot carry a DNS record (a Google-owned
 * `*.onworkspace.com` Workspace domain): a reason is required and lands on the
 * tenant's own audit trail. The backend refuses personal domains and any
 * domain another workspace proved in DNS. */
export const verifyDomain = createAsyncThunk<
  { id: number; domain: PlatformDomain },
  { id: number; domainId: number; reason: string },
  { rejectValue: string }
>('platform/verifyDomain', async ({ id, domainId, reason }, { rejectWithValue }) => {
  try {
    const data = await apiFetch<Omit<PlatformDomain, 'is_primary'>>(`/platform/organisations/${id}/domains/${domainId}/verify/`, { method: 'POST', body: { reason } });
    return { id, domain: data as PlatformDomain };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not verify the domain.'));
  }
});

export const fetchOrganisationBilling = createAsyncThunk<PlatformBilling, number, { rejectValue: string }>(
  'platform/billing',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<PlatformBilling>(`/platform/organisations/${id}/billing/`);
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load billing.'));
    }
  }
);

export const billingAction = createAsyncThunk<
  PlatformBilling,
  { id: number; action: 'credits' | 'seats' | 'plan'; body: Record<string, unknown> },
  { rejectValue: string }
>('platform/billingAction', async ({ id, action, body }, { rejectWithValue }) => {
  try {
    return await apiFetch<PlatformBilling>(`/platform/organisations/${id}/billing/${action}/`, { method: 'POST', body });
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not update billing.'));
  }
});

export const fetchStaff = createAsyncThunk<PlatformStaffMember[], void, { rejectValue: string }>(
  'platform/staff',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<PlatformStaffMember[]>('/platform/staff/');
    } catch (err) {
      return rejectWithValue(messageOf(err, 'Could not load staff.'));
    }
  }
);

const platformSlice = createSlice({
  name: 'platform',
  initialState,
  reducers: {
    clearPlatformError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const failed = (state: PlatformState, action: { payload?: string }) => {
      state.isLoading = false;
      state.error = action.payload ?? 'Something went wrong.';
    };
    builder
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.overview = action.payload;
      })
      .addCase(fetchOverview.rejected, failed)
      .addCase(fetchOrganisations.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrganisations.fulfilled, (state, action) => {
        state.isLoading = false;
        state.organisations = action.payload;
      })
      .addCase(fetchOrganisations.rejected, failed)
      .addCase(fetchOrganisation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.organisation = null;
      })
      .addCase(fetchOrganisation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.organisation = action.payload;
      })
      .addCase(fetchOrganisation.rejected, failed)
      .addCase(setOrganisationStatus.fulfilled, (state, action) => {
        if (state.organisation?.id === action.payload.id) state.organisation.status = action.payload.status;
        const row = state.organisations.find((o) => o.id === action.payload.id);
        if (row) row.status = action.payload.status;
      })
      .addCase(setOrganisationStatus.rejected, failed)
      .addCase(transferOwnership.fulfilled, (state, action) => {
        if (state.organisation?.id === action.payload.id) {
          state.organisation.owner = action.payload.owner;
          for (const m of state.organisation.memberships) {
            m.is_owner = m.user_id === action.payload.owner.id;
            if (m.is_owner) m.role = 'Admin';
          }
          state.organisation.memberships.sort((a, b) => Number(b.is_owner) - Number(a.is_owner));
        }
      })
      .addCase(transferOwnership.rejected, failed)
      .addCase(createOrganisation.fulfilled, (state, action) => {
        state.organisations.unshift(action.payload);
        state.organisations.sort((a, b) => a.name.localeCompare(b.name));
      })
      // The modal reports its own failure; a page-level banner too would say
      // the same thing twice.
      .addCase(renameOrganisation.fulfilled, (state, action) => {
        if (state.organisation?.id === action.payload.id) state.organisation.name = action.payload.name;
        const row = state.organisations.find((o) => o.id === action.payload.id);
        if (row) row.name = action.payload.name;
      })
      .addCase(renameOrganisation.rejected, failed)
      .addCase(archiveOrganisation.fulfilled, (state, action) => {
        if (state.organisation?.id === action.payload.id) state.organisation.status = 'archived';
        state.organisations = state.organisations.filter((o) => o.id !== action.payload.id);
      })
      .addCase(archiveOrganisation.rejected, failed)
      .addCase(setGmailTwoWay.fulfilled, (state, action) => {
        if (state.organisation?.id === action.payload.id) state.organisation.gmail = action.payload.gmail;
        const row = state.organisations.find((o) => o.id === action.payload.id);
        if (row) row.gmail = action.payload.gmail;
      })
      .addCase(verifyDomain.fulfilled, (state, action) => {
        if (state.organisation?.id !== action.payload.id) return;
        const { domain } = action.payload;
        state.organisation.domains = state.organisation.domains.map((d) => (d.id === domain.id ? { ...d, verification_status: domain.verification_status, verified_at: domain.verified_at } : d));
      })
      .addCase(fetchOrganisationBilling.fulfilled, (state, action) => {
        state.billing = action.payload;
      })
      .addCase(fetchOrganisationBilling.rejected, failed)
      .addCase(billingAction.fulfilled, (state, action) => {
        // The action answers with the summary only; keep the ledger and plans we had.
        state.billing = { ...(state.billing ?? {}), ...action.payload, ledger: state.billing?.ledger, plans: state.billing?.plans } as PlatformBilling;
      })
      .addCase(fetchStaff.fulfilled, (state, action) => {
        state.staff = action.payload;
      })
      .addCase(fetchStaff.rejected, failed);
  },
});

export const { clearPlatformError } = platformSlice.actions;
export default platformSlice.reducer;
