import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { trapTab } from '../../lib/focusTrap';
import { FOCUS, QUIET } from './portfolio/styles';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** The confirm button's word while it works. Default "Working…". */
  busyLabel?: string;
  /** Red confirm button for a destructive-ish action (e.g. Archive); the
   * default (accent) reads as a neutral/positive confirmation. */
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

const CONFIRM = `inline-flex min-h-11 sm:min-h-9 items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold text-on-accent shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

/** Generic yes/no confirmation modal — used for Archive (a reversible
 * soft-hide, so this lighter one-click confirm is enough; Churn gets its
 * own dedicated form instead, since it needs to capture a reason too).
 *
 * A modal dialog labelled by its title: focus moves to Cancel when it
 * opens, Tab stays inside, Escape closes it (not while the confirm is
 * working), and focus goes back to whatever opened it. A refusal is
 * announced. */
export function ConfirmDialog({ title, message, confirmLabel, busyLabel = 'Working…', danger, onConfirm, onClose }: ConfirmDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const messageId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  async function handleConfirm() {
    setError(null);
    setIsSaving(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Something went wrong.');
      setIsSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // Handled here, so a dialog or sheet underneath does not close too.
      event.preventDefault();
      event.stopPropagation();
      if (!isSaving) onClose();
    }
    if (event.key === 'Tab' && ref.current) trapTab(event.nativeEvent, ref.current);
  }

  return (
    <div className="fixed inset-0 bg-scrim flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={onKeyDown}
        className="bg-surface border border-line rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="min-w-0 break-words text-[15px] font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <p id={messageId} className="text-[13px] text-ink-muted">
          {message}
        </p>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-[13px] text-danger">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button ref={cancelRef} type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className={`${CONFIRM} ${danger ? 'bg-danger hover:opacity-90' : 'bg-accent hover:bg-accent-hover'}`}
          >
            {isSaving ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
