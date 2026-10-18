// A portfolio toolbar's shared pieces (Organizations, Accounts, Pipelines):
// the search box, the Filters trigger (with its active-filter count), the
// phone Select toggle and Save as segment. Each toolbar still owns its own
// layout, debounce and open/closed state.
import type { RefObject } from 'react';
import { BookmarkPlus, CheckSquare, Search, SlidersHorizontal } from 'lucide-react';
import { Badge } from '../../ui';
import { BUTTON, FOCUS } from './styles';

export function ToolbarSearch({
  label,
  searchRef,
  value,
  onChange,
  isSm,
}: {
  label: string;
  searchRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  isSm: boolean;
}) {
  return (
    <label className="relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-sm">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
      <input
        ref={searchRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={isSm ? label : 'Search'}
        className={`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong ${FOCUS}`}
      />
    </label>
  );
}

/** The "Filters" button: a count badge once any filter is active. */
export function FiltersTrigger({
  triggerRef,
  open,
  onClick,
  count,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button ref={triggerRef} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={onClick} className={BUTTON}>
      <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
      Filters
      {count > 0 ? <Badge>{count}</Badge> : null}
    </button>
  );
}

/** Phones: turns selection mode on without a long press. */
export function SelectToggle({ pressed, onClick }: { pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`${BUTTON} ${pressed ? 'bg-accent-dim' : ''}`}>
      <CheckSquare className="w-4 h-4" aria-hidden="true" />
      Select
    </button>
  );
}

/** "Save as segment" (segments spec 2026-10-03 §3): the list's current
 *  filters as a new segment's rules. Beside Filters on Organizations and
 *  Accounts, before Add on Contacts. */
export function SaveAsSegmentButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`${BUTTON} ${className}`}>
      <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
      Save as segment
    </button>
  );
}
