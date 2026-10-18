// The primary "Compose" button, with the reason it is disabled in its title.
//
// Kept from the Communications top bar, which no longer shows it (the open
// conversation has its own composer). Any page that can start an email to a
// known account can use it with `ComposeEmailModal`.

import { PenSquare } from 'lucide-react';

export interface ComposeButtonProps {
  onClick: () => void;
  /** Why composing is not possible right now; when set, the button is disabled and says so. */
  disabledReason?: string | null;
  label?: string;
  className?: string;
}

export function ComposeButton({ onClick, disabledReason = null, label = 'Compose', className = '' }: ComposeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? label}
      className={`h-11 px-4 rounded-xl bg-accent text-on-accent text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity duration-[var(--dur-fast)] ${className}`}
    >
      {label}
      <PenSquare className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}
