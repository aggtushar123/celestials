import { createAsyncThunk, createSlice, current } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { discardMailDraft, discardMailDrafts, type MailDraftRef } from './mailDrafts';
import type { ComposeTarget } from './draftSession';
import type { MailImport, PausedReason } from './mailSlice';
import {
  actionFailure,
  BULK_FAILED,
  COUNTS_FAILED,
  DISCARD_FAILED,
  LABEL_CREATE_FAILED,
  LABELS_FAILED,
  LIST_FAILED,
  LIST_MORE_FAILED,
  REPLY_FAILED,
  sendFailure,
  THREAD_FAILED,
  UPDATE_FAILED,
  type ActionFailure,
} from './mailText';
import { leavesView, patchOfOp, patchRow, patchThread } from './mailOptimistic';

/**
 * The person's own inbox on the Communications page.
 *
 * Mirrors `revenact-backend`'s `/api/v1/mail/messages/` family exactly (see
 * that repo's `docs/API_CONTRACTS.md`, "The person's own inbox"). Two fetches:
 * the list (conversations from D2), which refetches on every control, and the summary (folder counts
 * and the Categories block), which refetches only when something changed.
 */

/** `all` is everything outside Spam and Trash (contract D2 decision 18). */
export type MailFolder = 'inbox' | 'all' | 'drafts' | 'sent' | 'done' | 'muted' | 'spam' | 'trash' | 'starred' | 'important';
export type MailCategory = 'general' | 'financial' | 'newsletters' | 'notifications' | 'promotions' | 'social';
export type MailState = 'open' | 'done' | 'muted';

export interface MailAccount {
  id: number;
  name: string;
  type: 'customer' | 'account';
}

/** A Gmail user label, resolved by the server (contract §6). `id` is
 *  Revenact's MailLabel id; `color` is Gmail's pair, or null. */
export interface MailLabel {
  id: number;
  name: string;
  color: { background: string; text: string } | null;
  /** Made here and not yet created in Gmail (D2 contract decision 21). */
  pending: boolean;
}

/** One row of `GET mail/labels/` (D2 contract §4): the sidebar's label with
 *  its unread conversations. `gmail_id` is null while pending. */
export interface MailLabelEntry extends MailLabel {
  gmail_id: string | null;
  unread: number;
}

/** A change that did not reach Gmail (D2 contract §5), already a sentence. */
export interface SyncIssue {
  text: string;
  at: string;
}

/** One MIME part's details (D1 §6) and, from D2, how to open it (D2 §6). */
export interface MailAttachmentMeta {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  is_inline: boolean;
  content_id: string;
  /** Cached, or its Google mailbox is connected and not paused. */
  available: boolean;
  /** Served inline (PNG, JPEG, GIF, WebP, PDF): it opens in the viewer. */
  preview: boolean;
  /** `/api/v1/mail/attachments/<id>/download/`; null when not available. */
  download_url: string | null;
}

export interface MailMessage {
  id: number;
  thread_id: string;
  direction: 'sent' | 'received';
  from_name: string;
  from_address: string;
  to: [string, string][];
  /** Gmail rows from D1 on; `[]` for Outlook, IMAP and older Gmail rows (contract decision 14). */
  cc: [string, string][];
  bcc: [string, string][];
  labels: MailLabel[];
  has_attachments: boolean;
  subject: string;
  snippet: string;
  sent_at: string;
  folder: 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';
  category: MailCategory;
  state: MailState;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  priority: boolean;
  account: MailAccount | null;
  /** The newest change that did not reach Gmail, or null (D2 contract §5). */
  sync_issue: SyncIssue | null;
  /** A live draft's handle (D3 contract §2); absent reads as null. */
  draft?: MailDraftRef | null;
}

export interface MailMessageDetail extends MailMessage {
  body: string;
  /** Sanitised at store; "" when there is none or it was too large: show `body`. */
  html_body: string;
  attachments: MailAttachmentMeta[];
  /** Added to Revenact: its filed copy is shared on the customer (2026-10-17). Absent from older backends. */
  shared?: boolean;
}

export interface MailPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: MailMessage[];
}

export interface MailParticipant {
  name: string;
  address: string;
}

/** One conversation in the list (D2 contract §2). `id` is the newest
 *  matching message's id: the handle for `mail/messages/<id>/thread/`. */
export interface MailThread {
  id: number;
  thread_id: string;
  subject: string;
  snippet: string;
  last_sent_at: string;
  message_count: number;
  unread_count: number;
  /** Distinct senders, oldest first, up to 3; recipients for a Sent or Drafts row. */
  participants: MailParticipant[];
  more_participants: number;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  priority: boolean;
  state: MailState;
  folder: MailMessage['folder'];
  has_attachments: boolean;
  labels: MailLabel[];
  account: MailAccount | null;
  sync_issue: SyncIssue | null;
  /** D3 contract §2; absent reads as null. */
  draft?: MailDraftRef | null;
  /** Client only: a Sent or Drafts message as a row (Decision 1); the title reads "To <who>". */
  sent?: boolean;
}

export interface MailThreadPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: MailThread[];
}

/** `GET mail/messages/<id>/thread/` (D2 contract §2): messages oldest first. */
export interface MailThreadDetail {
  thread_id: string;
  subject: string;
  labels: MailLabel[];
  account: MailAccount | null;
  sync_issue: SyncIssue | null;
  /** More than 100 messages: the oldest are only in Gmail. */
  truncated: boolean;
  messages: MailMessageDetail[];
}

/** A conversation PATCH (D2 contract §3); at most one of state, trashed and spam. */
export interface ThreadPatch {
  is_read?: boolean;
  is_starred?: boolean;
  state?: MailState;
  trashed?: boolean;
  spam?: boolean;
  add_labels?: number[];
  remove_labels?: number[];
}

/** `POST mail/actions/` ops (D2 contract §3). */
export type MailOp = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'inbox' | 'trash' | 'untrash' | 'spam' | 'not_spam' | 'label_add' | 'label_remove' | 'mute' | 'unmute';

export interface BulkResult {
  op: MailOp;
  messages: number;
  threads: number;
  unchanged: number;
}

export interface MailCategoryBlock {
  category: MailCategory;
  label: string;
  count: number;
  subjects: string[];
  senders: string[];
  more_senders: number;
}

export interface MailSummary {
  has_mailbox: boolean;
  address: string;
  last_synced_at: string | null;
  /** null without a live Google mailbox. */
  import: MailImport | null;
  paused_reason: PausedReason | null;
  folders: Record<'inbox' | 'drafts' | 'sent' | 'done' | 'muted', number>;
  unread: number;
  categories: MailCategoryBlock[];
}

export interface MailQuery {
  folder: MailFolder;
  /** A user label's id: the label view, where `folder` is `all` (D2 contract decision 18). */
  label: number | null;
  category: MailCategory | null;
  unread: boolean;
  priority: boolean;
  /** The search box (D1's `q`: subject, sender, snippet); "" or absent for none. */
  q?: string;
}

/** One optimistic change's before-values (Decision 3). */
interface Undo {
  /** The list it was taken from: a restore never lands in another view. */
  path: string;
  rows: { index: number; row: MailThread }[];
  thread: MailThreadDetail | null;
}

interface MailboxState extends MailQuery {
  /** The conversations on screen (messages in Sent and Drafts, Decision 1). */
  list: MailThreadPage | null;
  loading: boolean;
  error: string | null;
  summary: MailSummary | null;
  /** The open conversation's handle: the row's id, or the bell's message id. */
  selectedId: number | null;
  thread: MailThreadDetail | null;
  threadLoading: boolean;
  /** Why the open conversation could not be read; lives in the reading pane. */
  threadError: string | null;
  /** Gmail user labels with their unread conversations; [] for Outlook and IMAP. */
  labels: MailLabelEntry[];
  /** Ticked conversations on this page, by handle (Decision 14). */
  checked: number[];
  /** Why the last action did not take, in the server's words. */
  actionError: ActionFailure | null;
  bulkBusy: boolean;
  /** Before-values by request id, put back if that request fails. */
  undo: Record<string, Undo>;
  loadingMore: boolean;
  replying: boolean;
  replyError: string | null;
  /** The id of the message whose reply just went out; the pane says so. */
  repliedId: number | null;
  /** The open composer (D3, Decision 2): it takes the reading pane. */
  compose: ComposeTarget | null;
  /** A quiet line after a send or a discard. */
  notice: string | null;
}

const initialState: MailboxState = {
  folder: 'inbox',
  label: null,
  category: null,
  unread: false,
  priority: false,
  q: '',
  list: null,
  loading: false,
  error: null,
  summary: null,
  selectedId: null,
  thread: null,
  threadLoading: false,
  threadError: null,
  labels: [],
  checked: [],
  actionError: null,
  bulkBusy: false,
  undo: {},
  loadingMore: false,
  replying: false,
  replyError: null,
  repliedId: null,
  compose: null,
  notice: null,
};

/** Sent and Drafts read by recipient, which a conversation row does not
 *  carry, so they list messages (Decision 1). Every other view lists conversations. */
export const MESSAGE_FOLDERS: ReadonlySet<MailFolder> = new Set<MailFolder>(['sent', 'drafts']);

export function buildListPath({ folder, label, category, unread, priority, q }: MailQuery): string {
  const params = new URLSearchParams();
  if (folder !== 'inbox') params.set('folder', folder);
  if (label !== null) params.set('label', String(label));
  if (category) params.set('category', category);
  if (unread) params.set('unread', 'true');
  if (priority) params.set('priority', 'true');
  if (q) params.set('q', q);
  const base = MESSAGE_FOLDERS.has(folder) ? '/mail/messages/' : '/mail/threads/';
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** A Sent or Drafts message as a list row (Decision 1): its own conversation
 *  handle, addressed to its recipients. */
export function rowOfMessage(m: MailMessage): MailThread {
  const sent = m.direction === 'sent';
  return {
    id: m.id,
    thread_id: m.thread_id,
    subject: m.subject,
    snippet: m.snippet,
    last_sent_at: m.sent_at,
    message_count: 1,
    unread_count: m.is_read ? 0 : 1,
    participants: sent ? m.to.map(([name, address]) => ({ name, address })) : [{ name: m.from_name, address: m.from_address }],
    more_participants: 0,
    is_read: m.is_read,
    is_starred: m.is_starred,
    is_important: m.is_important,
    priority: m.priority,
    state: m.state,
    folder: m.folder,
    has_attachments: m.has_attachments,
    labels: m.labels,
    account: m.account,
    sync_issue: m.sync_issue,
    draft: m.draft ?? null,
    sent,
  };
}

/** A page from either list route, as rows. DRF's absolute `next` links go through untouched. */
async function readList(path: string): Promise<MailThreadPage> {
  if (path.includes('/mail/messages/')) {
    const page = await apiFetch<MailPage>(path);
    return { ...page, results: page.results.map(rowOfMessage) };
  }
  return apiFetch<MailThreadPage>(path);
}

function reason(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

const failed = (text: string): ActionFailure => ({ text, reconnect: false, code: null });

export const fetchMailList = createAsyncThunk<MailThreadPage, MailQuery, { rejectValue: string }>('mailbox/list', async (query, { rejectWithValue }) => {
  try {
    return await readList(buildListPath(query));
  } catch (err) {
    return rejectWithValue(reason(err, LIST_FAILED));
  }
});

/** The next page, appended: month groups stay contiguous because the
 *  server orders by date and each page continues where the last stopped. */
export const loadMoreList = createAsyncThunk<MailThreadPage, string, { rejectValue: string }>('mailbox/listMore', async (next, { rejectWithValue }) => {
  try {
    return await readList(next);
  } catch (err) {
    return rejectWithValue(reason(err, LIST_MORE_FAILED));
  }
});

export const fetchMailSummary = createAsyncThunk<MailSummary, void, { rejectValue: string }>('mailbox/summary', async (_, { rejectWithValue }) => {
  try {
    return await apiFetch<MailSummary>('/mail/messages/summary/');
  } catch (err) {
    return rejectWithValue(reason(err, COUNTS_FAILED));
  }
});

/** The conversation holding message `id` (D2 contract §2). GET never marks it read. */
export const fetchThread = createAsyncThunk<MailThreadDetail, number, { rejectValue: string }>('mailbox/thread', async (id, { rejectWithValue }) => {
  try {
    return await apiFetch<MailThreadDetail>(`/mail/messages/${id}/thread/`);
  } catch (err) {
    return rejectWithValue(reason(err, THREAD_FAILED));
  }
});

/** One conversation's change (D2 contract §3). The screen changes in the
 *  pending reducer; a refusal puts it back (Decision 3). */
export const updateThread = createAsyncThunk<MailThreadDetail, { id: number; patch: ThreadPatch }, { rejectValue: ActionFailure }>(
  'mailbox/updateThread',
  async ({ id, patch }, { rejectWithValue }) => {
    try {
      return await apiFetch<MailThreadDetail>(`/mail/messages/${id}/thread/`, { method: 'PATCH', body: patch });
    } catch (err) {
      return rejectWithValue(actionFailure(err, UPDATE_FAILED));
    }
  },
);

/** Many conversations at once (D2 contract §3, `POST mail/actions/`). */
export const bulkMailAction = createAsyncThunk<BulkResult, { op: MailOp; ids: number[]; labelId?: number }, { rejectValue: ActionFailure }>(
  'mailbox/bulk',
  async ({ op, ids, labelId }, { rejectWithValue }) => {
    try {
      const body = labelId === undefined ? { op, thread_of: ids } : { op, thread_of: ids, label_id: labelId };
      return await apiFetch<BulkResult>('/mail/actions/', { method: 'POST', body });
    } catch (err) {
      return rejectWithValue(actionFailure(err, BULK_FAILED));
    }
  },
);

export const fetchMailLabels = createAsyncThunk<MailLabelEntry[], void, { rejectValue: string }>('mailbox/labels', async (_, { rejectWithValue }) => {
  try {
    return await apiFetch<MailLabelEntry[]>('/mail/labels/');
  } catch (err) {
    return rejectWithValue(reason(err, LABELS_FAILED));
  }
});

/** A new label, pending until Gmail creates it (D2 contract §4). A name the
 *  mailbox already has answers 409 LABEL_EXISTS with its id: that label is
 *  the answer, so applying it still works (Decision 13). */
export const createMailLabel = createAsyncThunk<{ id: number; label: MailLabelEntry | null }, string, { rejectValue: ActionFailure }>(
  'mailbox/createLabel',
  async (name, { rejectWithValue }) => {
    try {
      const label = await apiFetch<MailLabelEntry>('/mail/labels/', { method: 'POST', body: { name } });
      return { id: label.id, label };
    } catch (err) {
      const body = err instanceof ApiError && err.status === 409 ? (err.body as { code?: unknown; label_id?: unknown } | null) : null;
      if (body?.code === 'LABEL_EXISTS' && typeof body.label_id === 'number') return { id: body.label_id, label: null };
      return rejectWithValue(actionFailure(err, LABEL_CREATE_FAILED));
    }
  },
);

export const replyToMailMessage = createAsyncThunk<MailMessageDetail, { id: number; body: string }, { rejectValue: string }>(
  'mailbox/reply',
  async ({ id, body }, { rejectWithValue }) => {
    try {
      return await apiFetch<MailMessageDetail>(`/mail/messages/${id}/reply/`, { method: 'POST', body: { body } });
    } catch (err) {
      return rejectWithValue(sendFailure(err, REPLY_FAILED));
    }
  },
);

/** Delete in Drafts discards only the drafts (contract decision 12): one is
 *  `DELETE mail/drafts/<id>/`, more are `POST mail/drafts/discard/`. The
 *  rows leave at once and come back if refused (Decision 11). A 404 on the
 *  single DELETE means it is already gone, which counts as done (P6); the
 *  bulk 404 is all or nothing and names no id, so it is a refusal. */
export const discardDrafts = createAsyncThunk<void, { rowIds: number[]; draftIds: number[] }, { rejectValue: ActionFailure }>(
  'mailbox/discardDrafts',
  async ({ draftIds }, { rejectWithValue }) => {
    try {
      if (draftIds.length === 1) await discardMailDraft(draftIds[0]);
      else await discardMailDrafts(draftIds);
    } catch (err) {
      if (draftIds.length === 1 && err instanceof ApiError && err.status === 404) return;
      return rejectWithValue(actionFailure(err, DISCARD_FAILED));
    }
  },
);

/** Applies a change to the rows and the open conversation it names, and
 *  keeps their before-values under the request id (Decision 3). */
function optimistic(state: MailboxState, requestId: string, ids: number[], patch: ThreadPatch) {
  const undo: Undo = { path: buildListPath(state), rows: [], thread: null };
  const leaves = leavesView(state, patch);
  if (state.list) {
    const kept: MailThread[] = [];
    state.list.results.forEach((row, index) => {
      if (!ids.includes(row.id)) {
        kept.push(row);
        return;
      }
      const before = current(row);
      undo.rows.push({ index, row: before });
      if (!leaves) kept.push(patchRow(before, patch, state.labels));
    });
    if (leaves) state.list.count -= undo.rows.length;
    state.list.results = kept;
  }
  if (state.thread && state.selectedId !== null && ids.includes(state.selectedId)) {
    const before = current(state.thread);
    undo.thread = before;
    state.thread = patchThread(before, patch, state.labels);
  }
  state.undo[requestId] = undo;
}

/** Takes rows off the list at once, keeping them to put back (Decision 11). */
function removeRows(state: MailboxState, requestId: string, ids: number[]) {
  const undo: Undo = { path: buildListPath(state), rows: [], thread: null };
  if (state.list) {
    const kept: MailThread[] = [];
    state.list.results.forEach((row, index) => {
      if (ids.includes(row.id)) undo.rows.push({ index, row: current(row) });
      else kept.push(row);
    });
    state.list.results = kept;
    state.list.count -= undo.rows.length;
  }
  state.undo[requestId] = undo;
}

/** Puts a refused change back: each row at its old place, only into the
 *  same list; the conversation only while it is still open. */
function restore(state: MailboxState, requestId: string) {
  const undo = state.undo[requestId];
  if (!undo) return;
  delete state.undo[requestId];
  if (state.list && buildListPath(state) === undo.path) {
    for (const { index, row } of undo.rows) {
      const at = state.list.results.findIndex((r) => r.id === row.id);
      if (at >= 0) {
        state.list.results[at] = row;
      } else {
        state.list.results.splice(Math.min(index, state.list.results.length), 0, row);
        state.list.count += 1;
      }
    }
  }
  if (undo.thread && state.thread?.thread_id === undo.thread.thread_id) state.thread = undo.thread;
}

/** Whether a list request is for the view now on screen. */
function isCurrentQuery(state: MailboxState, query: MailQuery): boolean {
  return buildListPath(query) === buildListPath(state);
}

/** Any change to what the list shows closes the open conversation and the selection. */
function closeConversation(state: MailboxState) {
  state.selectedId = null;
  state.thread = null;
  state.checked = [];
  // A view change closes the composer; its unmount saves.
  state.compose = null;
}

const mailboxSlice = createSlice({
  name: 'mailbox',
  initialState,
  reducers: {
    setMailFolder(state, action: PayloadAction<MailFolder>) {
      state.folder = action.payload;
      state.label = null;
      closeConversation(state);
    },
    /** A label in the sidebar: everything outside Spam and Trash that carries it. */
    setMailLabel(state, action: PayloadAction<number>) {
      state.folder = 'all';
      state.label = action.payload;
      state.category = null;
      closeConversation(state);
    },
    /** Picking the category already picked clears it, so the block both
     *  narrows and widens. */
    toggleMailCategory(state, action: PayloadAction<MailCategory>) {
      state.category = state.category === action.payload ? null : action.payload;
      closeConversation(state);
    },
    setMailUnread(state, action: PayloadAction<boolean>) {
      state.unread = action.payload;
      closeConversation(state);
    },
    setMailPriority(state, action: PayloadAction<boolean>) {
      state.priority = action.payload;
      closeConversation(state);
    },
    setMailSearch(state, action: PayloadAction<string>) {
      state.q = action.payload;
      closeConversation(state);
    },
    selectThread(state, action: PayloadAction<number | null>) {
      // Never show the last conversation under a new one while it loads.
      if (state.selectedId !== action.payload) state.thread = null;
      state.selectedId = action.payload;
      state.threadError = null;
      state.actionError = null;
      state.replyError = null;
      state.repliedId = null;
      state.notice = null;
    },
    toggleChecked(state, action: PayloadAction<number>) {
      const id = action.payload;
      state.checked = state.checked.includes(id) ? state.checked.filter((x) => x !== id) : [...state.checked, id];
    },
    setChecked(state, action: PayloadAction<number[]>) {
      state.checked = action.payload;
    },
    clearMailActionError(state) {
      state.actionError = null;
    },
    openCompose(state, action: PayloadAction<ComposeTarget>) {
      state.compose = action.payload;
      state.notice = null;
    },
    closeCompose(state) {
      state.compose = null;
    },
    setMailNotice(state, action: PayloadAction<string | null>) {
      state.notice = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMailList.pending, (state, action) => {
        if (!isCurrentQuery(state, action.meta.arg)) return;
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMailList.fulfilled, (state, action) => {
        // An answer for a view the person has left must not show under the new one.
        if (!isCurrentQuery(state, action.meta.arg)) return;
        state.loading = false;
        state.list = action.payload;
        const shown = new Set(action.payload.results.map((row) => row.id));
        state.checked = state.checked.filter((id) => shown.has(id));
      })
      .addCase(fetchMailList.rejected, (state, action) => {
        if (!isCurrentQuery(state, action.meta.arg)) return;
        state.loading = false;
        state.error = action.payload ?? LIST_FAILED;
      })
      .addCase(loadMoreList.pending, (state) => {
        state.loadingMore = true;
      })
      .addCase(loadMoreList.fulfilled, (state, action) => {
        state.loadingMore = false;
        const seen = new Set(state.list?.results.map((row) => row.id) ?? []);
        state.list = { ...action.payload, results: [...(state.list?.results ?? []), ...action.payload.results.filter((row) => !seen.has(row.id))] };
      })
      .addCase(loadMoreList.rejected, (state, action) => {
        state.loadingMore = false;
        state.error = action.payload ?? LIST_MORE_FAILED;
      })
      .addCase(fetchMailSummary.fulfilled, (state, action) => {
        state.summary = action.payload;
      })
      .addCase(fetchThread.pending, (state) => {
        state.threadLoading = true;
        state.threadError = null;
      })
      .addCase(fetchThread.fulfilled, (state, action) => {
        state.threadLoading = false;
        if (state.selectedId === action.meta.arg) state.thread = action.payload;
      })
      .addCase(fetchThread.rejected, (state, action) => {
        state.threadLoading = false;
        if (state.selectedId === action.meta.arg) state.threadError = action.payload ?? THREAD_FAILED;
      })
      .addCase(updateThread.pending, (state, action) => {
        state.actionError = null;
        optimistic(state, action.meta.requestId, [action.meta.arg.id], action.meta.arg.patch);
      })
      .addCase(updateThread.fulfilled, (state, action) => {
        delete state.undo[action.meta.requestId];
        // Only over a conversation already on screen: the read PATCH sent on
        // open must not stand in for a GET that failed (its error stays shown).
        if (state.selectedId === action.meta.arg.id && state.thread) state.thread = action.payload;
      })
      .addCase(updateThread.rejected, (state, action) => {
        restore(state, action.meta.requestId);
        state.actionError = action.payload ?? failed(UPDATE_FAILED);
      })
      .addCase(bulkMailAction.pending, (state, action) => {
        const { op, ids, labelId } = action.meta.arg;
        state.actionError = null;
        state.bulkBusy = true;
        optimistic(state, action.meta.requestId, ids, patchOfOp(op, labelId ?? null));
      })
      .addCase(bulkMailAction.fulfilled, (state, action) => {
        delete state.undo[action.meta.requestId];
        state.bulkBusy = false;
        state.checked = state.checked.filter((id) => !action.meta.arg.ids.includes(id));
      })
      .addCase(bulkMailAction.rejected, (state, action) => {
        restore(state, action.meta.requestId);
        state.bulkBusy = false;
        state.actionError = action.payload ?? failed(BULK_FAILED);
      })
      .addCase(discardDrafts.pending, (state, action) => {
        state.actionError = null;
        state.bulkBusy = true;
        removeRows(state, action.meta.requestId, action.meta.arg.rowIds);
      })
      .addCase(discardDrafts.fulfilled, (state, action) => {
        delete state.undo[action.meta.requestId];
        state.bulkBusy = false;
        state.checked = state.checked.filter((id) => !action.meta.arg.rowIds.includes(id));
      })
      .addCase(discardDrafts.rejected, (state, action) => {
        restore(state, action.meta.requestId);
        state.bulkBusy = false;
        state.actionError = action.payload ?? failed(DISCARD_FAILED);
      })
      .addCase(fetchMailLabels.fulfilled, (state, action) => {
        state.labels = action.payload;
      })
      .addCase(createMailLabel.fulfilled, (state, action) => {
        const { label } = action.payload;
        if (label && !state.labels.some((l) => l.id === label.id)) state.labels = [...state.labels, label].sort((a, b) => a.name.localeCompare(b.name));
      })
      .addCase(replyToMailMessage.pending, (state) => {
        state.replying = true;
        state.replyError = null;
      })
      .addCase(replyToMailMessage.fulfilled, (state, action) => {
        state.replying = false;
        state.repliedId = action.meta.arg.id;
        // The backend marks the original read; the conversation should say so too.
        const original = state.thread?.messages.find((m) => m.id === action.meta.arg.id);
        if (original) original.is_read = true;
      })
      .addCase(replyToMailMessage.rejected, (state, action) => {
        state.replying = false;
        state.replyError = action.payload ?? REPLY_FAILED;
      });
  },
});

export const { setMailFolder, setMailLabel, toggleMailCategory, setMailUnread, setMailPriority, setMailSearch, selectThread, toggleChecked, setChecked, clearMailActionError, openCompose, closeCompose, setMailNotice } = mailboxSlice.actions;
export default mailboxSlice.reducer;
