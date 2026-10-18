import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Email } from '../customers/customersSlice';
import { sendFailure } from './mailText';

// A person's own connected mailbox — see revenact-backend services/mail.
// Credentials never come to the browser; the OAuth dance goes through the
// backend, which bounces back to /integrations?mailbox=connected|error.

export type MailProviderKey = 'google' | 'microsoft' | 'imap';

/** The pre-OAuth gates, first failure first (contract §1). */
export type GmailGate = 'GMAIL_NOT_ENABLED' | 'MEMBER_SUSPENDED' | 'NO_SEAT' | 'NO_VERIFIED_DOMAIN';

/** Why a Google mailbox is not syncing (contract decision 23). */
export type PausedReason = 'no_seat' | 'suspended' | 'workspace_off' | 'token_revoked';

export interface MailProviderOption {
  key: MailProviderKey;
  label: string;
  uses_oauth: boolean;
  /** Google only: the first failing pre-OAuth gate, shown instead of Connect. */
  gate: GmailGate | null;
}

/** The 12-month import. `total_estimate` is Gmail's messagesTotal for the
 *  whole mailbox, so the screen says "about"; `done` is final. */
export interface MailImport {
  state: 'importing' | 'done';
  imported: number;
  total_estimate: number | null;
  done_at: string | null;
}

export interface MailSignature {
  text: string;
  editable: boolean;
  source: 'gmail' | 'revenact';
}

export interface MailboxConnection {
  id: number;
  /** The email agent may read this person's sent internal mail (owner decision A, 2026-10-17; off by default). */
  agent_reads_mail?: boolean;
  provider: MailProviderKey;
  provider_display: string;
  address: string;
  display_name: string;
  status: 'connected' | 'error';
  error: string;
  last_synced_at: string | null;
  created_at: string;
  two_way: boolean;
  needs_reconnect: boolean;
  granted_scopes: string[];
  /** null for Outlook and IMAP. */
  import: MailImport | null;
  push: boolean;
  paused_reason: PausedReason | null;
  /** Round 2 D1 contract §4.3: Gmail's (read only), an Outlook one its owner
   *  writes, null for IMAP; absent from an older backend. */
  signature?: MailSignature | null;
}

/** A Google mailbox disconnected within the last 30 days: its personal
 *  copies are kept until `delete_after` (contract decision 9). */
export interface DisconnectedMailbox {
  provider: MailProviderKey;
  address: string;
  disconnected_at: string;
  delete_after: string;
}

export interface MailboxPayload {
  connection: MailboxConnection | null;
  disconnected: DisconnectedMailbox | null;
  providers: MailProviderOption[];
}

type SyncExtras = { filed?: number | null; queued?: boolean };

export interface ImapForm {
  address: string;
  password: string;
  imap_host: string;
  imap_port?: number;
  smtp_host: string;
  smtp_port?: number;
  username?: string;
  display_name?: string;
}

interface MailState {
  connection: MailboxConnection | null;
  disconnected: DisconnectedMailbox | null;
  /** A Google Sync now answered 202: waiting for the loop's tick. */
  syncQueued: boolean;
  /** `last_synced_at` when it was queued; the wait ends when it moves. */
  syncQueuedFrom: string | null;
  providers: MailProviderOption[];
  loaded: boolean;
  saving: boolean;
  error: string | null;
  sending: boolean;
  sendError: string | null;
}

const initialState: MailState = {
  connection: null,
  disconnected: null,
  syncQueued: false,
  syncQueuedFrom: null,
  providers: [],
  loaded: false,
  saving: false,
  error: null,
  sending: false,
  sendError: null,
};

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export const fetchMailbox = createAsyncThunk<
  MailboxPayload,
  void,
  { rejectValue: string }
>('mail/fetchMailbox', async (_, { rejectWithValue }) => {
  try {
    return await apiFetch('/mail/connection/');
  } catch (err) {
    return rejectWithValue(message(err, 'Could not load your mailbox.'));
  }
});

/** For an OAuth provider: where to send the browser. Credentialed, so this
 *  browser stores the cookie the callback checks: a forwarded authorize link
 *  can't be finished anywhere else (contract decision 33). */
export const startOAuth = createAsyncThunk<{ authorize_url: string }, MailProviderKey, { rejectValue: string }>(
  'mail/startOAuth',
  async (provider, { rejectWithValue }) => {
    try {
      return await apiFetch(`/mail/connect/${provider}/`, { method: 'POST', body: {}, credentials: 'include' });
    } catch (err) {
      return rejectWithValue(message(err, 'Could not start the connection.'));
    }
  },
);

export const connectImap = createAsyncThunk<MailboxConnection, ImapForm, { rejectValue: string }>(
  'mail/connectImap',
  async (form, { rejectWithValue }) => {
    try {
      return await apiFetch('/mail/connect/imap/', { method: 'POST', body: form });
    } catch (err) {
      return rejectWithValue(message(err, 'Could not connect the mailbox.'));
    }
  },
);

export const disconnectMailbox = createAsyncThunk<void, void, { rejectValue: string }>(
  'mail/disconnect',
  async (_, { rejectWithValue }) => {
    try {
      await apiFetch('/mail/connection/', { method: 'DELETE' });
    } catch (err) {
      return rejectWithValue(message(err, 'Could not disconnect.'));
    }
  },
);

/** Google answers 202 with `queued: true` (the loop runs the tick); Outlook
 *  and IMAP sync inline and answer 200 with `filed` (contract §3). */
export const syncMailbox = createAsyncThunk<MailboxConnection & { filed: number | null; queued?: boolean }, void, { rejectValue: string }>(
  'mail/sync',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch('/mail/sync/', { method: 'POST', body: {} });
    } catch (err) {
      return rejectWithValue(message(err, 'Sync failed.'));
    }
  },
);

/** The server's own sentence: a 409's `detail`, a 400's first `signature` message. */
function refusal(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.body === 'object' && err.body !== null) {
    const body = err.body as { detail?: unknown; signature?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.signature) && typeof body.signature[0] === 'string') return body.signature[0];
  }
  return fallback;
}

/** An Outlook mailbox's signature, written by its owner (round 2 D1 contract §4.3). */
export const saveSignature = createAsyncThunk<MailboxConnection, string, { rejectValue: string }>(
  'mail/saveSignature',
  async (text, { rejectWithValue }) => {
    try {
      const answer = (await apiFetch('/mail/connection/', { method: 'PATCH', body: { signature: text } })) as { connection: MailboxConnection };
      return answer.connection;
    } catch (err) {
      return rejectWithValue(refusal(err, 'Could not save the signature.'));
    }
  },
);

export const sendEmail = createAsyncThunk<
  Email,
  { customerId: number; accountId?: number; to: string[]; subject: string; body: string },
  { rejectValue: string }
>('mail/send', async ({ customerId, accountId, ...body }, { rejectWithValue }) => {
  const path = accountId
    ? `/customers/${customerId}/accounts/${accountId}/emails/send/`
    : `/customers/${customerId}/emails/send/`;
  try {
    return await apiFetch<Email>(path, { method: 'POST', body });
  } catch (err) {
    return rejectWithValue(sendFailure(err, 'Could not send the email.'));
  }
});

const mailSlice = createSlice({
  name: 'mail',
  initialState,
  reducers: {
    clearSendError(state) {
      state.sendError = null;
    },
    /** Two minutes without the tick landing: stop saying "Syncing…". */
    syncWaitExpired(state) {
      state.syncQueued = false;
      state.syncQueuedFrom = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMailbox.fulfilled, (state, action) => {
        state.connection = action.payload?.connection ?? null;
        state.disconnected = action.payload?.disconnected ?? null;
        state.providers = Array.isArray(action.payload?.providers) ? action.payload.providers : [];
        state.loaded = true;
        state.error = null;
        const c = state.connection;
        if (state.syncQueued && (!c || c.last_synced_at !== state.syncQueuedFrom || c.status === 'error' || Boolean(c.paused_reason))) {
          state.syncQueued = false;
          state.syncQueuedFrom = null;
        }
      })
      .addCase(fetchMailbox.rejected, (state, action) => {
        state.loaded = true;
        state.error = action.payload ?? 'Could not load your mailbox.';
      })
      .addCase(connectImap.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(connectImap.fulfilled, (state, action) => {
        state.saving = false;
        state.connection = action.payload;
      })
      .addCase(connectImap.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? 'Could not connect the mailbox.';
      })
      .addCase(startOAuth.rejected, (state, action) => {
        state.error = action.payload ?? 'Could not start the connection.';
      })
      .addCase(disconnectMailbox.fulfilled, (state) => {
        state.connection = null;
        state.syncQueued = false;
        state.syncQueuedFrom = null;
      })
      .addCase(syncMailbox.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(syncMailbox.fulfilled, (state, action) => {
        state.saving = false;
        const answer: MailboxConnection & SyncExtras = { ...action.payload };
        const queued = answer.queued === true;
        delete answer.filed;
        delete answer.queued;
        state.connection = answer;
        if (queued) {
          state.syncQueued = true;
          state.syncQueuedFrom = answer.last_synced_at;
        }
      })
      .addCase(syncMailbox.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? 'Sync failed.';
      })
      .addCase(saveSignature.fulfilled, (state, action) => {
        state.connection = action.payload;
      })
      .addCase(sendEmail.pending, (state) => {
        state.sending = true;
        state.sendError = null;
      })
      .addCase(sendEmail.fulfilled, (state) => {
        state.sending = false;
      })
      .addCase(sendEmail.rejected, (state, action) => {
        state.sending = false;
        state.sendError = action.payload ?? 'Could not send the email.';
      });
  },
});

export const { clearSendError, syncWaitExpired } = mailSlice.actions;
export default mailSlice.reducer;
