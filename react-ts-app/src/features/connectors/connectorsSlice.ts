import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { UserFunction } from '../auth/authSlice';

// Mirrors revenact-backend's services/connectors: see docs/API_CONTRACTS.md
// -> connectors. A connector records that the organisation uses a system
// and which companies it covers. Ticket sources (Zendesk, Jira, Slack,
// Freshdesk, the inbound webhook) are live: an integrations manager hands
// them credentials, the scheduler pulls tickets every ten minutes, and the
// tickets are readable by the connector's department only.

export type Provider =
  | 'zendesk' | 'jira' | 'freshdesk' | 'webhook' | 'intercom' | 'salesforce' | 'hubspot' | 'slack'
  | 'gmail' | 'ms_teams' | 'zoom' | 'github' | 'figma';

export type ConnectorStatus = 'not_connected' | 'connected' | 'error';

export interface SetupField {
  name: string;
  label: string;
  secret: boolean;
  placeholder: string;
  required: boolean;
}

/** The connect form a ticket source needs; null for an attribution-only system. */
export interface ConnectorSetup {
  key: string;
  label: string;
  fields: SetupField[];
  uses_oauth: boolean;
  help: string;
}

/** What agents may do through this connector (agent bundles D3 contract §4.3). */
export interface ConnectorAgents {
  kinds: string[];
  can_act: boolean;
  needs: 'reconnect' | 'consent' | 'token' | 'permission' | null;
  allowed_by: { id: number; name: string } | null;
  allowed_at: string | null;
}

export interface Connector {
  id: number;
  provider: Provider;
  provider_display: string;
  name: string;
  is_enabled: boolean;
  department: UserFunction | '';
  department_display: string;
  customers: { id: number; name: string }[];
  accounts: { id: number; name: string }[];
  is_organisation_wide: boolean;
  /** Records already attributed to this connector. */
  ticket_count: number;
  conversation_count: number;
  call_count: number;
  /** ISO date of the newest attributed record, or null. */
  last_record_at: string | null;
  has_credentials: boolean;
  config: Record<string, string>;
  status: ConnectorStatus;
  error: string;
  last_synced_at: string | null;
  last_sync_note: string;
  setup: ConnectorSetup | null;
  /** Absent from an older backend (agent bundles D3 contract §4.3). */
  agents?: ConnectorAgents;
  /** Slack escalations D3 contract §2.1: a Slack connection's channels and Slack's last event; null for another tool, absent from an older backend. */
  slack_channels?: { synced: number; total: number; can_join: boolean; events_at?: string | null } | null;
  created_at: string;
}

/** What connect/ answers: the connector, plus the webhook's one-time secret. */
export interface ConnectResult extends Connector {
  token?: string;
  inbound_url?: string;
}

interface ConnectorsState {
  items: Connector[];
  isLoading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
}

const initialState: ConnectorsState = { items: [], isLoading: false, error: null, saving: false, saveError: null };

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** A form's refusal: the server's sentence, and each field's own message
 *  (DRF's `{"name": ["..."]}`) so the form can put it under that field. */
export interface Refusal {
  message: string;
  fields: Record<string, string>;
}

function refusal(err: unknown, fallback: string): Refusal {
  const fields: Record<string, string> = {};
  const body = err instanceof ApiError ? err.body : null;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key !== 'detail' && key !== 'non_field_errors' && Array.isArray(value) && typeof value[0] === 'string') fields[key] = value[0];
    }
  }
  return { message: message(err, fallback), fields };
}

export const fetchConnectors = createAsyncThunk<Connector[], void, { rejectValue: string }>(
  'connectors/fetch',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<Connector[]>('/connectors/');
    } catch (err) {
      return rejectWithValue(message(err, 'Could not load the connectors.'));
    }
  }
);

export const createConnector = createAsyncThunk<
  Connector,
  { provider: Provider; name: string; department?: UserFunction | '' },
  { rejectValue: Refusal }
>('connectors/create', async (body, { rejectWithValue }) => {
  try {
    return await apiFetch<Connector>('/connectors/', { method: 'POST', body });
  } catch (err) {
    return rejectWithValue(refusal(err, 'Could not connect that system.'));
  }
});

export const updateConnector = createAsyncThunk<
  Connector,
  { id: number; is_enabled?: boolean; department?: UserFunction | ''; customer_ids?: number[]; account_ids?: number[] },
  { rejectValue: string }
>('connectors/update', async ({ id, ...body }, { rejectWithValue }) => {
  try {
    return await apiFetch<Connector>(`/connectors/${id}/`, { method: 'PATCH', body });
  } catch (err) {
    return rejectWithValue(message(err, 'Could not update that connector.'));
  }
});

export const connectConnector = createAsyncThunk<
  ConnectResult,
  { id: number; form: Record<string, string> },
  { rejectValue: string }
>('connectors/connect', async ({ id, form }, { rejectWithValue }) => {
  try {
    return await apiFetch<ConnectResult>(`/connectors/${id}/connect/`, { method: 'POST', body: form });
  } catch (err) {
    return rejectWithValue(message(err, 'Could not connect that source.'));
  }
});

export const startConnectorOAuth = createAsyncThunk<
  { authorize_url: string },
  { id: number; form: Record<string, string> },
  { rejectValue: string }
>('connectors/oauth', async ({ id, form }, { rejectWithValue }) => {
  try {
    return await apiFetch<{ authorize_url: string }>(`/connectors/${id}/connect/`, {
      method: 'POST',
      body: { ...form, oauth: true },
      credentials: 'include',
    });
  } catch (err) {
    return rejectWithValue(message(err, 'Could not start the sign-in.'));
  }
});

/** POST /connectors/<id>/agents/ (contract §5.3): the connector, or Slack's consent link. */
export const setConnectorAgents = createAsyncThunk<
  { connector: Connector } | { authorize_url: string },
  { id: number; canAct: boolean },
  { rejectValue: string }
>('connectors/agents', async ({ id, canAct }, { rejectWithValue }) => {
  try {
    const answer = await apiFetch<Connector | { authorize_url: string }>(`/connectors/${id}/agents/`, {
      method: 'POST',
      body: { can_act: canAct },
      // The consent's binding cookie must come back with the browser (contract D3-22).
      credentials: 'include',
    });
    return 'authorize_url' in answer ? { authorize_url: answer.authorize_url } : { connector: answer };
  } catch (err) {
    return rejectWithValue(message(err, 'Could not change what agents may do.'));
  }
});

export const disconnectConnector = createAsyncThunk<number, number, { rejectValue: string }>(
  'connectors/disconnect',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<void>(`/connectors/${id}/credentials/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      return rejectWithValue(message(err, 'Could not disconnect that source.'));
    }
  }
);

export const syncConnector = createAsyncThunk<
  Connector & { created: number; updated: number; unmatched: number },
  number,
  { rejectValue: string }
>('connectors/sync', async (id, { rejectWithValue }) => {
  try {
    return await apiFetch<Connector & { created: number; updated: number; unmatched: number }>(
      `/connectors/${id}/sync/`,
      { method: 'POST' }
    );
  } catch (err) {
    return rejectWithValue(message(err, 'Could not sync that source.'));
  }
});

function replace(state: ConnectorsState, connector: Connector) {
  const index = state.items.findIndex((c) => c.id === connector.id);
  if (index >= 0) state.items[index] = connector;
  else state.items.push(connector);
}

const connectorsSlice = createSlice({
  name: 'connectors',
  initialState,
  reducers: {
    clearConnectorSaveError(state) {
      state.saveError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConnectors.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchConnectors.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload;
      })
      .addCase(fetchConnectors.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the connectors.';
      })
      .addCase(createConnector.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(createConnector.fulfilled, (state, action) => {
        state.saving = false;
        state.items.push(action.payload);
      })
      // The add form shows its own refusal, under the field it names.
      .addCase(createConnector.rejected, (state) => {
        state.saving = false;
      })
      .addCase(updateConnector.pending, (state) => {
        state.saveError = null;
      })
      .addCase(updateConnector.fulfilled, (state, action) => {
        replace(state, action.payload);
      })
      .addCase(updateConnector.rejected, (state, action) => {
        // A department or customer change has its own form, which shows the refusal.
        if (action.meta.arg.department !== undefined || action.meta.arg.customer_ids !== undefined) return;
        state.saveError = action.payload ?? 'Could not update that connector.';
      })
      .addCase(connectConnector.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(connectConnector.fulfilled, (state, action) => {
        state.saving = false;
        // The one-time secret never lives in the store.
        const connector: ConnectResult = { ...action.payload };
        delete connector.token;
        delete connector.inbound_url;
        replace(state, connector);
      })
      // The credentials form shows these beside its Connect button.
      .addCase(connectConnector.rejected, (state) => {
        state.saving = false;
      })
      .addCase(setConnectorAgents.fulfilled, (state, action) => {
        if ('connector' in action.payload) replace(state, action.payload.connector);
      })
      .addCase(disconnectConnector.fulfilled, (state, action) => {
        const connector = state.items.find((c) => c.id === action.payload);
        if (connector) {
          connector.has_credentials = false;
          connector.status = 'not_connected';
          connector.error = '';
          connector.config = {};
          // Backend FR-7 (contract §4.3): a disconnect also switches agents off.
          // The config is gone, so Slack reads as a pasted-token Slack again.
          if (connector.agents) {
            const { kinds } = connector.agents;
            const needs = kinds.length === 0 ? null : connector.provider === 'jira' ? 'permission' : 'token';
            connector.agents = { kinds, can_act: false, needs, allowed_by: null, allowed_at: null };
          }
        }
      })
      .addCase(disconnectConnector.rejected, (state, action) => {
        state.saveError = action.payload ?? 'Could not disconnect that source.';
      })
      .addCase(syncConnector.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(syncConnector.fulfilled, (state, action) => {
        state.saving = false;
        const connector: Partial<typeof action.payload> = { ...action.payload };
        delete connector.created;
        delete connector.updated;
        delete connector.unmatched;
        replace(state, connector as Connector);
      })
      .addCase(syncConnector.rejected, (state, action) => {
        state.saving = false;
        state.saveError = action.payload ?? 'Could not sync that source.';
      });
  },
});

export const { clearConnectorSaveError } = connectorsSlice.actions;
export default connectorsSlice.reducer;
