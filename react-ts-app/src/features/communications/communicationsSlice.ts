import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { QueueDraft } from '../agents/draftTypes';
import { sendFailure } from '../mail/mailText';

/**
 * The Communications page's own state.
 *
 * Mirrors `revenact-backend`'s `GET /api/v1/communications/` and
 * `/communications/stats/` exactly — see that repo's `docs/API_CONTRACTS.md`
 * and `react-ts-app/docs/design/communications.md`, the specification this was
 * built from.
 *
 * Two fetches, not one, and deliberately so: clicking a tile narrows the queue,
 * and the other three counts must not move underneath it while you are
 * choosing. The list refetches on every filter change; the tiles only when the
 * scope does.
 */

/** Which channel a row came from: the four tiles, or `slack`, read only
 *  when the sidebar's Slack asks for it (no tile, not in the counts). */
export type CommunicationKind = TileKind | 'slack';
/** The four channels with a tile and a count. */
export type TileKind = 'email' | 'question' | 'ticket' | 'call';

export const KINDS: TileKind[] = ['email', 'question', 'ticket', 'call'];

/** What the composer under a row's detail should be. */
export type CommunicationAction = 'reply' | 'answer' | 'open_external' | 'summarise' | 'none';

export interface CommunicationAccount {
  id: number;
  name: string;
  type: 'customer' | 'account';
}

/**
 * The four numbers that sit above the reply box.
 *
 * Travels with the row rather than being fetched per selection: a renewal
 * question answered without the renewal date in view is the mistake the page
 * exists to prevent, and a second request per click would make the pane
 * flicker on every arrow key.
 */
export interface CommunicationContext {
  health_score: number | null;
  health_category: string;
  arr: number | null;
  renewal_date: string | null;
  days_to_renewal: number | null;
  owner: string;
}

export interface CommunicationRow {
  /** `"email:412"` — the kind and the primary key, unique across four models. */
  id: string;
  kind: CommunicationKind;
  /** The person, or the ticket reference. */
  who: string;
  /** Their contact role, the ticket's priority, the call's length. */
  detail: string;
  subject: string;
  snippet: string;
  /** Up to 1200 characters, enough for the detail pane without a second call. */
  preview: string;
  /** The language the writer writes in, when a contact of theirs says so.
   *  Empty for rows nobody wrote (a question, a task) and for a writer the
   *  company has no contact for. */
  writer_language?: string;
  sentiment: string;
  waiting_since: string;
  waiting_days: number;
  account: CommunicationAccount | null;
  context: CommunicationContext | null;
  action: CommunicationAction;
  external_url: string;
  /** The reader's own open agent draft for this email or ticket (Agents
   *  delivery 2); null when there is none. Question and call rows leave it out. */
  draft?: QueueDraft | null;
}

export interface CommunicationsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: CommunicationRow[];
  /** True when one channel hit the server's per-kind cap. The page says so
   *  rather than presenting a prefix as the whole queue. */
  truncated: boolean;
  mode: 'needs' | 'everything';
  scope?: CommunicationScope;
}

export interface CommunicationsStats {
  counts: Record<TileKind, number>;
  total: number;
  /** Null when nothing is waiting. */
  oldest_waiting_days: number | null;
  stale_questions: number;
  /** False means the replies tile shows a dash, never a zero — zero would be
   *  a lie when no mailbox has ever been read. */
  has_mailbox: boolean;
  scope: CommunicationScope;
  ticket_scope_note: string;
}

export type CommunicationScope = 'mine' | 'team';
export type CommunicationMode = 'needs' | 'everything';

interface CommunicationsState {
  page: CommunicationsPage | null;
  isLoading: boolean;
  error: string | null;

  stats: CommunicationsStats | null;
  statsLoading: boolean;
  statsError: string | null;

  /** Whose queue. */
  scope: CommunicationScope;
  /** The queue, or the stream over the same records. */
  mode: CommunicationMode;
  /** One tile, or null for all four. */
  kind: CommunicationKind | null;
  search: string;
  /** Row id. Null means "the first row", resolved at render so the pane is
   *  never empty while rows exist. */
  selectedId: string | null;
  replying: boolean;
  replyError: string | null;
  /** The row id whose reply just went out; the pane says so. */
  repliedId: string | null;
}

const initialState: CommunicationsState = {
  page: null,
  isLoading: false,
  error: null,
  stats: null,
  statsLoading: false,
  statsError: null,
  scope: 'mine',
  mode: 'needs',
  kind: null,
  search: '',
  selectedId: null,
  replying: false,
  replyError: null,
  repliedId: null,
};

export interface QueueQuery {
  scope: CommunicationScope;
  mode: CommunicationMode;
  kind: CommunicationKind | null;
  search: string;
  /** An absolute DRF `next`/`previous` link, used verbatim when paging. */
  url?: string;
}

export function buildQuery({ scope, mode, kind, search }: Omit<QueueQuery, 'url'>): string {
  const params = new URLSearchParams();
  if (scope === 'team') params.set('scope', 'team');
  if (mode === 'everything') params.set('needs', 'false');
  if (kind) params.set('kind', kind);
  if (search.trim()) params.set('q', search.trim());
  const query = params.toString();
  return query ? `/communications/?${query}` : '/communications/';
}

export const fetchCommunications = createAsyncThunk<
  CommunicationsPage,
  QueueQuery,
  { rejectValue: string }
>('communications/fetch', async (query, { rejectWithValue }) => {
  try {
    // An absolute `next` link is passed through untouched — apiClient lets
    // `http(s)://` paths past, which is how every other paged list here walks.
    return await apiFetch<CommunicationsPage>(query.url ?? buildQuery(query));
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load your queue.';
    return rejectWithValue(message);
  }
});

export const fetchCommunicationsStats = createAsyncThunk<
  CommunicationsStats,
  CommunicationScope,
  { rejectValue: string }
>('communications/fetchStats', async (scope, { rejectWithValue }) => {
  try {
    const suffix = scope === 'team' ? '?scope=team' : '';
    return await apiFetch<CommunicationsStats>(`/communications/stats/${suffix}`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load your counts.';
    return rejectWithValue(message);
  }
});

/** Reply to a queue email from the person's own mailbox; the copy is
 *  filed on the customer. `rowId` is the row's "email:<id>". */
export const replyToEmail = createAsyncThunk<
  { id: number },
  { rowId: string; body: string },
  { rejectValue: string }
>('communications/reply', async ({ rowId, body }, { rejectWithValue }) => {
  const id = Number(rowId.split(':')[1]);
  try {
    return await apiFetch<{ id: number }>(`/communications/emails/${id}/reply/`, { method: 'POST', body: { body } });
  } catch (err) {
    return rejectWithValue(sendFailure(err, 'Could not send the reply.'));
  }
});

const communicationsSlice = createSlice({
  name: 'communications',
  initialState,
  reducers: {
    setScope(state, action: PayloadAction<CommunicationScope>) {
      state.scope = action.payload;
      state.selectedId = null;
    },
    setMode(state, action: PayloadAction<CommunicationMode>) {
      state.mode = action.payload;
      state.selectedId = null;
    },
    /** Clicking the tile already chosen clears it, so one control both
     *  narrows and widens rather than needing a separate "All" tile. */
    toggleKind(state, action: PayloadAction<CommunicationKind>) {
      state.kind = state.kind === action.payload ? null : action.payload;
      state.selectedId = null;
    },
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
      state.selectedId = null;
    },
    selectRow(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
      state.replyError = null;
      state.repliedId = null;
    },
    clearCommunications() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(replyToEmail.pending, (state) => {
        state.replying = true;
        state.replyError = null;
      })
      .addCase(replyToEmail.fulfilled, (state, action) => {
        state.replying = false;
        state.repliedId = action.meta.arg.rowId;
      })
      .addCase(replyToEmail.rejected, (state, action) => {
        state.replying = false;
        state.replyError = action.payload ?? 'Could not send the reply.';
      })
      // The previous page stays on screen while a refetch runs, so changing a
      // filter dims the queue rather than blanking it and reflowing the pane.
      .addCase(fetchCommunications.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCommunications.fulfilled, (state, action) => {
        state.isLoading = false;
        state.page = action.payload;
      })
      .addCase(fetchCommunications.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load your queue.';
        state.page = null;
      })
      .addCase(fetchCommunicationsStats.pending, (state) => {
        state.statsLoading = true;
        state.statsError = null;
      })
      .addCase(fetchCommunicationsStats.fulfilled, (state, action) => {
        state.statsLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchCommunicationsStats.rejected, (state, action) => {
        state.statsLoading = false;
        state.statsError = action.payload ?? 'Could not load your counts.';
      });
  },
});

export const { setScope, setMode, toggleKind, setSearch, selectRow, clearCommunications } =
  communicationsSlice.actions;

export default communicationsSlice.reducer;

/**
 * Which row the detail pane shows.
 *
 * Falls back to the first row rather than showing an empty pane beside a full
 * list: a selection that points at a row the current filter removed is stale,
 * not a reason to show nothing.
 */
export function resolveSelected(
  rows: CommunicationRow[],
  selectedId: string | null
): CommunicationRow | null {
  if (rows.length === 0) return null;
  return rows.find((row) => row.id === selectedId) ?? rows[0];
}

/** Amber from three days, red from seven. Used by the row, the chip and the
 *  tile so the three can never disagree about what counts as late. */
export function waitingTone(days: number): 'danger' | 'warning' | 'muted' {
  if (days >= 7) return 'danger';
  if (days >= 3) return 'warning';
  return 'muted';
}
