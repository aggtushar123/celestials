// The open message's attachments as chips (contract §6): name, type and
// size; inline parts (images inside the HTML) are left out. From D2 a chip
// opens its file: images and PDFs in the viewer, anything else saved
// (Decision 9). A file that cannot be fetched is a plain chip saying why.

import { useState } from 'react';
import { CircleAlert, LoaderCircle, Paperclip } from 'lucide-react';
import type { MailAttachmentMeta } from '../../features/mail/mailboxSlice';
import { openAttachment, saveUrl } from '../../features/mail/mailAttachments';
import { ATTACHMENT_UNAVAILABLE, attachmentFailure } from '../../features/mail/mailText';
import { formatSize } from '../../features/files/fileFormat';
import { FOCUS, NUM, TYPE } from '../../components/ui';
import { AttachmentViewer } from './AttachmentViewer';

const CHIP = 'inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left sm:min-h-9';

function kindOf(file: MailAttachmentMeta): string {
  const dot = file.filename.lastIndexOf('.');
  return dot > 0 && dot < file.filename.length - 1 ? file.filename.slice(dot + 1).toUpperCase() : 'File';
}

export function MailAttachments({ attachments }: { attachments: MailAttachmentMeta[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ file: MailAttachmentMeta; url: string; type: string } | null>(null);
  const files = attachments.filter((a) => !a.is_inline);
  if (files.length === 0) return null;

  async function open(file: MailAttachmentMeta) {
    if (busyId !== null) return;
    setBusyId(file.id);
    setError(null);
    try {
      const opened = await openAttachment(file);
      if (opened) setViewing({ file, ...opened });
    } catch (err) {
      setError(attachmentFailure(err, file.filename));
    } finally {
      setBusyId(null);
    }
  }

  function close() {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <ul role="list" aria-label="Attachments" className="flex flex-wrap gap-2">
        {files.map((file) => {
          const content = (
            <>
              {busyId === file.id ? (
                <LoaderCircle className="h-4 w-4 shrink-0 text-ink-muted motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              )}
              <span className={`min-w-0 truncate ${TYPE.body}`}>{file.filename}</span>
              <span className={`shrink-0 ${TYPE.meta}`}>
                {kindOf(file)} · <span className={NUM}>{formatSize(file.size)}</span>
              </span>
            </>
          );
          return (
            <li key={file.id} className="min-w-0 max-w-full">
              {file.available && file.download_url ? (
                <button type="button" onClick={() => void open(file)} aria-busy={busyId === file.id || undefined} className={`${CHIP} hover:bg-subtle active:bg-line-subtle ${FOCUS}`}>
                  {content}
                </button>
              ) : (
                <span title={ATTACHMENT_UNAVAILABLE} className={CHIP}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-5 text-danger-ink">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {viewing ? <AttachmentViewer name={viewing.file.filename} url={viewing.url} type={viewing.type} onDownload={() => saveUrl(viewing.url, viewing.file.filename)} onClose={close} /> : null}
    </div>
  );
}
