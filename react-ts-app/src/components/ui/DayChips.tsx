import { FOCUS } from './styles';

const CHIP = `inline-flex min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 items-center justify-center rounded-md border text-[13px] font-semibold ${FOCUS}`;

/** The week as seven toggles (settings production spec §5.5): the first
 *  letter shown, the full day as each one's name, pressed when chosen. */
export function DayChips({
  label,
  days,
  value,
  onChange,
  describedBy,
}: {
  label: string;
  days: readonly { value: number; label: string }[];
  value: readonly number[];
  onChange: (next: number[]) => void;
  describedBy?: string;
}) {
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex flex-wrap gap-1">
      {days.map((day) => {
        const on = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={on}
            aria-label={day.label}
            onClick={() => onChange((on ? value.filter((d) => d !== day.value) : [...value, day.value]).slice().sort((a, b) => a - b))}
            className={`${CHIP} ${on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-muted hover:text-ink'}`}
          >
            {day.label.charAt(0)}
          </button>
        );
      })}
    </div>
  );
}
