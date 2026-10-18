import { useEffect, useRef, useState } from 'react';
import { Link, type To } from 'react-router-dom';
import { X } from 'lucide-react';
import { FEED } from '../../features/work/feed';
import { BUTTON, FOCUS, ICON_BUTTON, OVERLAY, QUIET, TYPE } from '../ui';

export interface Toast {
  /** A new id is a new toast (focus moves again). */
  id: number;
  text: string;
  link?: { label: string; to: To; state?: unknown };
  undo?: () => Promise<void>;
  /** Take focus: true after a row left (Decision 1), false after quick-add. */
  focus: boolean;
}

/** My work's one toast (Decision 1): the live region stays mounted (sr-only
 *  while empty); the next toast replaces it; Close empties it. No timer.
 *  Undo is aria-disabled while it runs, not disabled, so focus stays on it;
 *  its busy state belongs to the toast it started on, so a newer toast's
 *  Undo is usable at once. Close hands focus back to what had it before the
 *  toast took it, or, when that is gone, to `fallbackFocus`. */
export function WorkToast({ toast, onClose, fallbackFocus }: { toast: Toast | null; onClose: () => void; fallbackFocus?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const undoing = toast !== null && undoingId === toast.id;
  useEffect(() => {
    if (!toast?.focus) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !rootRef.current?.contains(active)) returnTo.current = active;
    textRef.current?.focus();
  }, [toast]);

  async function undo() {
    if (!toast?.undo || undoing) return;
    const id = toast.id;
    setUndoingId(id);
    try {
      await toast.undo();
    } finally {
      setUndoingId((current) => (current === id ? null : current));
    }
  }

  function close() {
    const back = returnTo.current;
    returnTo.current = null;
    onClose();
    if (back?.isConnected) back.focus();
    else fallbackFocus?.();
  }

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      data-part="work-toast"
      className={toast ? `fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center gap-2 px-4 py-2 sm:left-auto sm:right-6 sm:max-w-md ${OVERLAY}` : 'sr-only'}
    >
      {toast ? (
        <>
          <p ref={textRef} tabIndex={-1} className={`min-w-0 flex-1 break-words ${TYPE.body} ${FOCUS}`}>
            {toast.text}
          </p>
          {toast.link ? (
            <Link to={toast.link.to} state={toast.link.state} className={QUIET}>
              {toast.link.label}
            </Link>
          ) : null}
          {toast.undo ? (
            <button type="button" aria-disabled={undoing || undefined} onClick={() => void undo()} className={BUTTON}>
              {undoing ? FEED.UNDOING : FEED.UNDO}
            </button>
          ) : null}
          <button type="button" aria-label={FEED.CLOSE} onClick={close} className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}
