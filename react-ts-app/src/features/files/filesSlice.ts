import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiFetch, apiFetchBlob, ApiError } from '../../lib/apiClient';
import { accountBase } from '../../lib/accountPaths';
import { listScope, parentScope } from '../../lib/listScope';

// The Files tab on an organisation or account — see revenact-backend
// docs/API_CONTRACTS.md -> Files. Anyone who may open the company may list
// and upload; the uploader or an admin may delete. The bytes never come
// through the store: downloads go straight to a Blob.

export interface Attachment {
  id: number;
  name: string;
  content_type: string;
  size: number;
  description: string;
  /** `email`: an attachment of mail filed on this record (two-way Gmail D2 §6), never deleted here. */
  source: 'upload' | 'transcript' | 'email';
  uploaded_by: { id: number; name: string } | null;
  download_url: string;
  created_at: string;
  /** The account it is on; null on the organization itself. The
   *  organization's list rolls up its visible accounts' files. */
  account_id?: number | null;
  account_name?: string | null;
  /** The filed email an `email` row came with; null on uploads. */
  email?: { id: number; subject: string; from: string } | null;
}

export interface FileParent {
  entityType: 'organization' | 'account';
  /** The organisation; null for an account read on its own page (the flat route). */
  customerId: number | null;
  accountId?: number;
}

export function filesPath({ entityType, customerId, accountId }: FileParent): string {
  if (entityType === 'organization') {
    if (customerId == null) throw new Error('filesPath: an organisation read needs a customerId.');
    return `/customers/${customerId}/files/`;
  }
  if (accountId == null) throw new Error('filesPath: an account read needs an accountId.');
  return `${accountBase(accountId, customerId)}/files/`;
}

interface FilesState {
  items: Attachment[];
  isLoading: boolean;
  error: string | null;
  uploading: boolean;
  uploadError: string | null;
  /** Whose files `items` holds (listScope); null while none are. */
  scope: string | null;
  /** The last read asked for: a slower, earlier one never lands. */
  requestId?: string;
}

const initialState: FilesState = { items: [], isLoading: false, error: null, uploading: false, uploadError: null, scope: null };

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export const fetchFiles = createAsyncThunk<Attachment[], FileParent, { rejectValue: string }>(
  'files/fetch',
  async (parent, { rejectWithValue }) => {
    try {
      return await apiFetch<Attachment[]>(filesPath(parent));
    } catch (err) {
      return rejectWithValue(message(err, 'Could not load the files.'));
    }
  }
);

export const uploadFile = createAsyncThunk<
  Attachment,
  FileParent & { file: File; description?: string },
  { rejectValue: string }
>('files/upload', async ({ file, description, ...parent }, { rejectWithValue }) => {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (description) formData.append('description', description);
    return await apiFetch<Attachment>(filesPath(parent), { method: 'POST', formData });
  } catch (err) {
    return rejectWithValue(message(err, 'Could not upload that file.'));
  }
});

export const deleteFile = createAsyncThunk<number, number, { rejectValue: string }>(
  'files/delete',
  async (id, { rejectWithValue }) => {
    try {
      await apiFetch<void>(`/files/${id}/`, { method: 'DELETE' });
      return id;
    } catch (err) {
      return rejectWithValue(message(err, 'Could not delete that file.'));
    }
  }
);

/** Fetch the bytes with the session's token and hand them to the browser
 * as a download — the API never exposes a URL a plain link could open. */
export async function downloadAttachment(file: Pick<Attachment, 'download_url' | 'name'>): Promise<void> {
  const blob = await apiFetchBlob(file.download_url);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    clearFiles(state) {
      state.items = [];
      state.error = null;
      state.scope = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFiles.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.requestId = action.meta.requestId;
        // Another organization's or account's files never show under this one.
        if (parentScope(action.meta.arg) !== state.scope) {
          state.items = [];
          state.scope = null;
        }
      })
      .addCase(fetchFiles.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.isLoading = false;
        state.items = action.payload;
        state.scope = parentScope(action.meta.arg);
      })
      .addCase(fetchFiles.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load the files.';
      })
      .addCase(uploadFile.pending, (state) => {
        state.uploading = true;
        state.uploadError = null;
      })
      .addCase(uploadFile.fulfilled, (state, action) => {
        state.uploading = false;
        // Only into the list it belongs to: its own, or its organization's roll-up.
        const { customerId } = action.meta.arg;
        const rollUp = customerId !== null && state.scope === listScope(customerId);
        if (state.scope === parentScope(action.meta.arg) || rollUp) state.items.unshift(action.payload);
      })
      .addCase(uploadFile.rejected, (state, action) => {
        state.uploading = false;
        state.uploadError = action.payload ?? 'Could not upload that file.';
      })
      .addCase(deleteFile.fulfilled, (state, action) => {
        state.items = state.items.filter((f) => f.id !== action.payload);
      })
      .addCase(deleteFile.rejected, (state, action) => {
        state.uploadError = action.payload ?? 'Could not delete that file.';
      });
  },
});

export const { clearFiles } = filesSlice.actions;
export default filesSlice.reducer;
