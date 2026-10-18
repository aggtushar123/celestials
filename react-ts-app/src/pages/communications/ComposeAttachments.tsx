// The files on a message being written (two-way Gmail D3, Decision 9):
// uploads (with their progress while they go up), the Gmail draft's own
// parts and the forwarded originals, each with Remove; once there are files,
// the message's size against the draft's limit (bodies count too, contract
// decision 20); and Attach files. A part a send could not get from Gmail
// (409 ATTACHMENT_UNAVAILABLE, 410 ATTACHMENT_GONE) has a danger edge; the
// sentence is the composer's alert.

import { useRef } from 'react';
import { LoaderCircle, Paperclip, X } from 'lucide-react';
import type { DraftAttachment } from '../../features/mail/mailDrafts';
import type { Upload } from '../../features/mail/draftSession';
import { ATTACH, ATTACHMENTS_LABEL, CHOOSE_FILES, FROM_ORIGINAL, removeFile, sizeUsed, uploadingLabel } from '../../features/mail/mailText';
import { FILE_ACCEPT, formatSize } from '../../features/files/fileFormat';
import { Figured } from '../../components/brain/Figured';
import { BUTTON, ICON_BUTTON, NUM, TYPE } from '../../components/ui';

const CHIP = 'inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-lg border pl-2.5 pr-1 py-1 sm:min-h-9';

export function ComposeAttachments({
  files,
  uploads,
  total,
  max,
  failedId,
  onAttach,
  onRemove,
}: {
  files: DraftAttachment[];
  uploads: Upload[];
  /** Decoded bytes so far, bodies included (contract decision 20). */
  total: number;
  /** The draft's max_bytes (MAIL_SEND_MAX_BYTES before a draft exists). */
  max: number;
  failedId: number | null;
  onAttach: (files: File[]) => void;
  onRemove: (id: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const any = files.length > 0 || uploads.length > 0;
  return (
    <div className="flex flex-col gap-2">
      {any ? (
        <ul aria-label={ATTACHMENTS_LABEL} className="flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id} className={`${CHIP} ${failedId === file.id ? 'border-danger' : 'border-line'}`}>
              <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className={`min-w-0 truncate ${TYPE.body}`}>{file.filename}</span>
              <span className={`shrink-0 ${TYPE.meta}`}>
                {file.origin === 'forward' ? `${FROM_ORIGINAL} · ` : ''}
                <span className={NUM}>{formatSize(file.size)}</span>
              </span>
              <button type="button" aria-label={removeFile(file.filename)} onClick={() => onRemove(file.id)} className={ICON_BUTTON}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
          {uploads.map((upload) => (
            <li key={`upload-${upload.key}`} className={`${CHIP} border-line pr-2.5`}>
              <LoaderCircle className="h-4 w-4 shrink-0 text-ink-muted motion-safe:animate-spin" aria-hidden="true" />
              <span className={`min-w-0 truncate ${TYPE.body}`}>{upload.name}</span>
              <progress max={100} value={Math.round(upload.fraction * 100)} aria-label={uploadingLabel(upload.name)} className="h-1 w-16 shrink-0 accent-accent" />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} className={BUTTON}>
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {ATTACH}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          tabIndex={-1}
          aria-label={CHOOSE_FILES}
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files ? [...event.target.files] : [];
            event.target.value = '';
            if (chosen.length > 0) onAttach(chosen);
          }}
        />
        {any ? (
          <span className={TYPE.meta}>
            <Figured text={sizeUsed(total, max)} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
