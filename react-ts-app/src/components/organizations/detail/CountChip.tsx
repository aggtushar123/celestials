import { FilterChip, FOCUS, NUM } from '../../ui';

const CHIP = `inline-flex min-h-11 sm:min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${FOCUS}`;

/** A pressable chip with an optional count: the account chips and the
 *  story's filters. A `FilterChip` (the chosen one the accent tint, never
 *  black-filled); dimmed, an outline that filters nothing here. */
export function CountChip({
  label,
  count,
  pressed,
  onClick,
  dimmed = false,
  describedBy,
}: {
  label: string;
  /** Null until the story has counted: the chip shows no number. */
  count: number | null;
  pressed: boolean;
  onClick: () => void;
  /** Muted ink, and the chosen one outlined rather than filled: the chip
   *  still works but filters nothing here. */
  dimmed?: boolean;
  /** The id of a note that says why the chip is dimmed. */
  describedBy?: string;
}) {
  if (!dimmed) return <FilterChip label={label} count={count} pressed={pressed} onToggle={onClick} describedBy={describedBy} />;
  // Clearly fainter than a live chip at rest: it filters nothing here.
  const look = `${pressed ? 'border-accent' : 'border-line-subtle'} bg-surface text-ink-faint hover:bg-subtle`;
  return (
    <button type="button" aria-pressed={pressed} aria-describedby={describedBy} onClick={onClick} className={`${CHIP} ${look}`}>
      <span className="max-w-[12rem] truncate">{label}</span>
      {count == null ? null : (
        <>
          {' '}
          <span className={`text-[11px] ${NUM}`}>{count}</span>
        </>
      )}
    </button>
  );
}
