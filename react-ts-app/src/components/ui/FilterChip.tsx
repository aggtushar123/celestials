import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { FOCUS } from './styles';
import { useScrollFade } from './useScrollFade';

const CHIP = `inline-flex min-h-11 sm:min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${FOCUS}`;

/** A toggle chip (UI foundations spec §5.4): off is a quiet outline, on is
 *  the accent tint with `aria-pressed`. Never black-filled. */
export function FilterChip({
  label,
  pressed,
  onToggle,
  count,
  describedBy,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  /** A figure after the label ("Story 12"); null while unknown. */
  count?: number | null;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={`${CHIP} ${pressed ? 'border-accent bg-accent-dim font-semibold text-ink' : 'border-line bg-surface text-ink-muted hover:bg-subtle hover:text-ink'}`}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
      {count == null ? null : (
        <>
          {' '}
          <span className={`text-[11px] tabular-nums ${pressed ? 'text-ink' : 'text-ink-muted'}`}>{count}</span>
        </>
      )}
    </button>
  );
}

/** An active filter, with its own remove button ("Remove filter: Owner: Carl"). */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-11 sm:min-h-8 shrink-0 items-center gap-1 rounded-full border border-transparent bg-subtle pl-3 pr-1 text-[13px] text-ink">
      {label}
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        onClick={onRemove}
        className={`inline-flex min-h-11 min-w-11 sm:min-h-6 sm:min-w-6 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink ${FOCUS}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

/** A labelled row of chips: one sideways-scrolling line on a phone (with
 *  the edge fade while it overflows), wrapping from sm. */
export function FilterChipRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useScrollFade<HTMLDivElement>();
  return (
    <div ref={ref} role="group" aria-label={label} className="flex gap-2 overflow-x-auto rv-scroll-fade sm:flex-wrap sm:overflow-visible">
      {children}
    </div>
  );
}
