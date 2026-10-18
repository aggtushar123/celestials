import type { ReactNode } from 'react';
import { FOCUS } from './styles';

/** The breakdown cards' filter row button (SummaryTiles, BreakdownCard). */
export function FilterButton({
  pressed,
  onClick,
  compact = false,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full min-w-0 min-h-11 ${compact ? 'sm:min-h-6' : 'sm:min-h-7'} items-center justify-between gap-2 rounded-md px-1.5 text-[11px] hover:bg-subtle active:bg-line-subtle ${FOCUS} ${
        pressed ? 'bg-subtle font-semibold text-ink' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}
