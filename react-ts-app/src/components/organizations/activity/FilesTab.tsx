import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileText, Image as ImageIcon, FileAudio, FileSpreadsheet, Presentation, Download, Trash2, UploadCloud, Mic } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../../hooks';
import { clearFiles, deleteFile, downloadAttachment, fetchFiles, uploadFile, type Attachment, type FileParent } from '../../../features/files/filesSlice';
import { canDeleteFile, FILE_ACCEPT, formatSize } from '../../../features/files/fileFormat';
import { formatDate } from '../../../features/customers/formatters';

/**
 * The Files tab: the contract, the QBR deck, the transcript of last week's
 * call — every document the team keeps on this organisation or account.
 * Anyone who may open the company may see and add files; the person who
 * uploaded one, or an admin, may remove it. Downloads go through the
 * session (the API never exposes a plain file URL), so a link cannot be
 * forwarded to someone outside the company.
 */

function iconFor(file: Attachment) {
  const type = file.content_type;
  const cls = 'w-4 h-4';
  if (file.source === 'transcript') return <Mic className={`${cls} text-accent`} />;
  if (type.startsWith('image/')) return <ImageIcon className={`${cls} text-info`} />;
  if (type.startsWith('audio/')) return <FileAudio className={`${cls} text-warning`} />;
  if (type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return <FileSpreadsheet className={`${cls} text-success`} />;
  if (type.includes('presentation') || type.includes('powerpoint')) return <Presentation className={`${cls} text-warning`} />;
  return <FileText className={`${cls} text-ink-muted`} />;
}

export interface FilesTabProps {
  entityType: 'organization' | 'account';
  entityId: number | string;
  customerId?: number;
}

export function FilesTab({ entityType, entityId, customerId }: FilesTabProps) {
  const dispatch = useAppDispatch();
  const { items, isLoading, error, uploading, uploadError } = useAppSelector((s) => s.files);
  const me = useAppSelector((s) => s.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const parent: FileParent | null =
    entityType === 'organization'
      ? { entityType, customerId: Number(entityId) }
      : customerId !== undefined
        ? { entityType, customerId, accountId: Number(entityId) }
        : null;

  useEffect(() => {
    if (parent) dispatch(fetchFiles(parent));
    else dispatch(clearFiles());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, entityType, entityId, customerId]);

  async function send(files: FileList | File[]) {
    if (!parent) return;
    for (const file of Array.from(files)) {
      await dispatch(uploadFile({ ...parent, file, description: description.trim() || undefined }));
    }
    setDescription('');
    if (input.current) input.current.value = '';
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void send(e.dataTransfer.files);
  }

  async function download(file: Attachment) {
    setDownloadError(null);
    try {
      await downloadAttachment(file);
    } catch {
      setDownloadError(`Could not download ${file.name}.`);
    }
  }

  const canDelete = (file: Attachment) => canDeleteFile(file, me?.id ?? null, isAdmin);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface">
      <div className="px-6 py-3 border-b border-line-subtle flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[14px] font-bold text-ink">Files</h3>
            <span className="text-[11.5px] text-ink-faint">Contracts, decks, transcripts — everything the team keeps on this {entityType === 'organization' ? 'organisation' : 'account'}. Up to 25 MB each.</span>
          </div>
          {parent && (
            <div className="flex items-center gap-2">
              <input
                aria-label="Description for the next upload"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent w-56"
              />
              <input ref={input} type="file" multiple accept={FILE_ACCEPT} className="sr-only" aria-label="Choose files" onChange={(e) => e.target.files && void send(e.target.files)} />
              <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold disabled:opacity-50">
                <UploadCloud className="w-3.5 h-3.5" /> {uploading ? 'Uploading…' : 'Upload file'}
              </button>
            </div>
          )}
        </div>
        {(uploadError || downloadError) && (
          <div className="text-[12px] text-danger font-semibold" role="alert">{uploadError ?? downloadError}</div>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto custom-scrollbar px-6 py-4 transition-colors ${dragging ? 'bg-accent-dim/40' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (parent) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {isLoading ? (
          <div className="py-16 text-center text-sm font-semibold text-ink-faint opacity-60">Loading files…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm font-semibold text-danger">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-line rounded-2xl text-center">
            <UploadCloud className="w-10 h-10 text-ink-faint mb-2" />
            <span className="text-sm font-semibold text-ink-muted">No files yet</span>
            {parent && <span className="text-[12px] text-ink-faint mt-1">Drop files here or use Upload file.</span>}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line-subtle border border-line-subtle rounded-xl overflow-hidden" aria-label="Files">
            {items.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-subtle/50 group">
                <div className="w-8 h-8 rounded-lg bg-subtle border border-line-subtle flex items-center justify-center shrink-0">{iconFor(file)}</div>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => void download(file)} className="text-[13px] font-bold text-ink hover:text-accent truncate max-w-full text-left" title={`Download ${file.name}`}>
                    {file.name}
                  </button>
                  <div className="text-[11.5px] text-ink-faint truncate">
                    {formatSize(file.size)}
                    {file.uploaded_by && <> · {file.uploaded_by.name}</>}
                    {' · '}{formatDate(file.created_at.slice(0, 10))}
                    {file.source === 'transcript' && <> · call transcript</>}
                    {file.source === 'email' && file.email && <> · email from {file.email.from}</>}
                    {file.description && <span className="text-ink-muted"> · {file.description}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => void download(file)} className="p-1.5 rounded-lg text-ink-faint hover:text-accent hover:bg-subtle" aria-label={`Download ${file.name}`}>
                  <Download className="w-4 h-4" />
                </button>
                {canDelete(file) && (
                  <button type="button" onClick={() => dispatch(deleteFile(file.id))} className="p-1.5 rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10" aria-label={`Delete ${file.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
