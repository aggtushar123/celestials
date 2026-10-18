import { FileText, Mail, Mic, Trash2 } from 'lucide-react';
import { formatDate } from '../../../features/customers/formatters';
import { formatSize } from '../../../features/files/fileFormat';
import type { Attachment } from '../../../features/files/filesSlice';
import { ICON_BUTTON, IconChip, ListRow, NUM } from '../../ui';
import { AccountTag } from './ListParts';

/** One file (spec 2026-09-27 §4) as a list row: the name downloads it; one
 *  meta line of size, description, who uploaded it, its source and date; the
 *  account tag; delete on hover where the viewer may. */
export function FileItem({
  file,
  canDelete,
  onDownload,
  onDelete,
}: {
  file: Attachment;
  canDelete: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const source = file.source === 'transcript' ? 'Call transcript' : file.source === 'email' ? `Email from ${file.email?.from || 'someone'}` : 'Upload';
  const Icon = file.source === 'transcript' ? Mic : file.source === 'email' ? Mail : FileText;
  // A filed email's attachment has no description: its email's subject says what it is.
  const about = file.description || file.email?.subject || '';
  const who = [file.uploaded_by?.name, source].filter(Boolean).join(' · ');
  return (
    <ListRow
      dataAttrs={{ 'data-file': file.id }}
      title={file.name}
      onSelect={onDownload}
      leading={<IconChip icon={Icon} />}
      meta={
        <>
          <span className={NUM}>{formatSize(file.size)}</span>
          {about ? ` · ${about}` : null}
          {` · ${who} · `}
          <time dateTime={file.created_at} className={NUM}>
            {formatDate(file.created_at.slice(0, 10))}
          </time>
        </>
      }
      trailing={<AccountTag record={file} />}
      actions={
        canDelete ? (
          <button type="button" onClick={onDelete} aria-label={`Delete ${file.name}`} className={`${ICON_BUTTON} hover:text-danger-ink`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null
      }
    />
  );
}
