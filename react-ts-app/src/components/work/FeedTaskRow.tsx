import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle } from 'lucide-react';
import { undoEmailTask } from '../../features/work/workApi';
import { doneLabel } from '../../features/work/workText';
import type { FeedGroupKey, TaskFeedItem } from '../../features/work/workTypes';
import { FOCUS, ICON_BUTTON, QUIET, TYPE } from '../ui';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';
import { useTaskLink } from './useTaskLink';

// As TaskRowItem's; defined here so the house rules' 44px check sees it.
const ROW_TITLE = `inline-flex min-h-11 max-w-full items-center self-start break-words text-left text-[13px] font-semibold text-ink hover:underline active:opacity-70 sm:min-h-0 ${FOCUS}`;

/** A task or a to-do on My work (spec §5): Done first when the row offers it
 *  (the Team queue's rows only open the panel, the kind's icon in its place), the title opens the
 *  task panel over this page, then the meta line, what a Blocked task waits
 *  on, and a Done refusal. Flat inside its group's list. Done is
 *  aria-disabled while it sends, not disabled, so focus stays on it; the
 *  page drops a second press (its running set). */
export function FeedTaskRow({
  item,
  group,
  busy,
  error,
  onDone,
  onUndone,
}: {
  item: TaskFeedItem;
  group: FeedGroupKey;
  busy: boolean;
  error: string | null;
  onDone: () => void;
  /** A task the email agent made, taken back (2026-10-17). */
  onUndone?: () => void;
}) {
  const taskLink = useTaskLink();
  const row = item.detail;
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  // Read once when the row mounts: Undo stays offered until the next load past its deadline.
  const [mountedAt] = useState(() => Date.now());
  const canUndo = Boolean(onUndone && row.from_email && new Date(row.from_email.undo_until).getTime() > mountedAt);

  async function undo() {
    if (undoing) return;
    setUndoing(true);
    setUndoError(null);
    try {
      await undoEmailTask(item.id);
      onUndone?.();
    } catch {
      setUndoError("Couldn't undo it. Try again.");
      setUndoing(false);
    }
  }
  // Without Done (the Team queue's rows) the kind's icon leads, as on the
  // decide rows, rather than an empty gap where Done would be.
  const canDone = item.actions.includes('done');
  const Icon = KIND_ICON[item.kind];
  return (
    <li data-item={item.key} className={`flex items-start px-4 ${canDone ? 'gap-2 py-2' : 'gap-3 py-3'} ${ROW_FOCUS}`}>
      {canDone ? (
        <button type="button" onClick={onDone} aria-disabled={busy || undefined} aria-label={doneLabel(item.title)} className={ICON_BUTTON}>
          <Circle className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <Icon data-part="kind-icon" className="mt-3.5 h-4 w-4 sm:mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
      )}
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${canDone ? 'py-1' : ''}`}>
        <Link {...taskLink(item.id)} className={ROW_TITLE}>
          {item.title}
        </Link>
        <FeedRowMeta item={item} group={group} />
        {row.status === 'blocked' ? (
          <p data-part="blocked" className={`max-w-[68ch] break-words ${TYPE.body}`}>
            <span className="font-semibold text-warning-ink">Blocked:</span> {row.blocked_reason}
          </p>
        ) : null}
        {canUndo ? (
          <button type="button" onClick={() => void undo()} aria-disabled={undoing || undefined} aria-label={`Undo task ${item.title}`} className={`${QUIET} self-start`}>
            Undo
          </button>
        ) : null}
        {error || undoError ? (
          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
            {error ?? undoError}
          </p>
        ) : null}
      </div>
    </li>
  );
}
