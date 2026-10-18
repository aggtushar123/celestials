// The selection's actions (spec §4 "Bulk select", Decision 14): tick
// conversations, or every one on the page, then Mark done, Mark read or
// unread, Label or Delete, each in one request (contract §3,
// POST mail/actions/); in a two-way Gmail's Drafts, Delete discards only the drafts (D3). Gmail's own actions show for Gmail only; every
// action but Clear waits while a bulk request runs or the mailbox cannot
// reach Gmail.

import { ArchiveRestore, Check, Inbox, Mail, MailOpen, Trash2 } from 'lucide-react';
import type { MailFolder, MailLabelEntry, MailOp, MailThread } from '../../features/mail/mailboxSlice';
import { labelState } from '../../features/mail/mailOptimistic';
import { BULK_SELECT_ALL, BULK_SELECTED, BULK_TOOLBAR, type MailActionGate } from '../../features/mail/mailText';
import { BUTTON, FOCUS, NUM, QUIET, TYPE } from '../../components/ui';
import { LabelMenu } from './LabelMenu';

export function MailBulkBar({
  rows,
  checked,
  folder,
  gate,
  writer,
  labels,
  busy,
  onCheck,
  onBulk,
  onDiscard,
  onCreateLabel,
}: {
  rows: MailThread[];
  checked: readonly number[];
  folder: MailFolder;
  gate: MailActionGate;
  labels: MailLabelEntry[];
  busy: boolean;
  /** The new ticked set: every row on the page, or none. */
  onCheck: (ids: number[]) => void;
  onBulk: (op: MailOp, labelId?: number) => void;
  /** Drafts: Delete discards only the drafts (D3 Decision 11). */
  onDiscard: () => void;
  /** Gmail two-way (D3 Decision 3): only its Drafts discard; Outlook, IMAP and read-only Gmail keep D2's bar. */
  writer: boolean;
  /** Creates a label and applies it to the selection. */
  onCreateLabel: (name: string) => Promise<string | null>;
}) {
  const ids = rows.map((row) => row.id);
  const all = ids.length > 0 && ids.every((id) => checked.includes(id));
  const some = checked.length > 0 && !all;
  const selected = rows.filter((row) => checked.includes(row.id));
  const anyUnread = selected.some((row) => !row.is_read);
  const off = busy || Boolean(gate.blocked);
  const title = gate.blocked ?? undefined;

  return (
    <div role="toolbar" aria-label={BULK_TOOLBAR} className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-1">
      <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-9">
        <input
          type="checkbox"
          checked={all}
          ref={(box) => {
            if (box) box.indeterminate = some;
          }}
          onChange={() => onCheck(all ? [] : ids)}
          aria-label={BULK_SELECT_ALL}
          className={`h-4 w-4 accent-accent ${FOCUS}`}
        />
        {checked.length > 0 ? (
          <span className={TYPE.meta}>
            <span className={NUM}>{checked.length}</span> {BULK_SELECTED}
          </span>
        ) : null}
      </label>
      {checked.length > 0 ? (
        folder === 'drafts' && writer ? (
          <>
            <button type="button" onClick={onDiscard} disabled={busy || !selected.some((row) => row.draft)} className={BUTTON}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
            <button type="button" onClick={() => onCheck([])} className={QUIET}>
              Clear
            </button>
          </>
        ) : (
          <>
            {folder === 'done' ? (
              <button type="button" onClick={() => onBulk('inbox')} disabled={off} title={title} className={BUTTON}>
                <Inbox className="h-4 w-4" aria-hidden="true" />
                Move to Inbox
              </button>
            ) : (
              <button type="button" onClick={() => onBulk('archive')} disabled={off} title={title} className={BUTTON}>
                <Check className="h-4 w-4" aria-hidden="true" />
                Mark done
              </button>
            )}
            <button type="button" onClick={() => onBulk(anyUnread ? 'read' : 'unread')} disabled={off} title={title} className={BUTTON}>
              {anyUnread ? <MailOpen className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
              {anyUnread ? 'Mark read' : 'Mark unread'}
            </button>
            {gate.gmail ? (
              <LabelMenu
                variant="button"
                labels={labels}
                stateOf={(id) => labelState(selected, id)}
                disabled={off}
                disabledReason={gate.blocked}
                onToggle={(id, add) => onBulk(add ? 'label_add' : 'label_remove', id)}
                onCreate={onCreateLabel}
              />
            ) : null}
            {gate.gmail ? (
              folder === 'trash' ? (
                <button type="button" onClick={() => onBulk('untrash')} disabled={off} title={title} className={BUTTON}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                  Restore
                </button>
              ) : (
                <button type="button" onClick={() => onBulk('trash')} disabled={off} title={title} className={BUTTON}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              )
            ) : null}
            <button type="button" onClick={() => onCheck([])} className={QUIET}>
              Clear
            </button>
          </>
        )
      ) : null}
    </div>
  );
}
