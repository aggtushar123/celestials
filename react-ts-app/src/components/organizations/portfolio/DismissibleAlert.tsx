import { X } from 'lucide-react';
import { ICON_BUTTON } from '../../ui';

/** A portfolio page's failure line (an export, a move) with its Dismiss
 *  button: Accounts' List and Board, and the Pipelines List. */
export function DismissibleAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger-ink">
      {message}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className={ICON_BUTTON}>
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </p>
  );
}
