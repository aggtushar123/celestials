import type { Attachment } from './filesSlice';

/** What the Files upload accepts (the backend enforces the same list). */
export const FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.vtt,.srt,.json,.png,.jpg,.jpeg,.gif,.webp,.mp3,.m4a,.wav';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The uploader or an admin may delete a file (the server applies the same
 *  rule). A filed email's attachment is never deleted here: it lives as
 *  long as the mailbox's copy (two-way Gmail D2, contract §6). */
export function canDeleteFile(file: Pick<Attachment, 'uploaded_by'> & Partial<Pick<Attachment, 'source'>>, meId: number | null, isAdmin: boolean): boolean {
  if (file.source === 'email') return false;
  return isAdmin || (meId !== null && file.uploaded_by?.id === meId);
}
