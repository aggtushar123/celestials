import { FOCUS } from './styles';

const SEGMENT = {
  md: 'min-h-11 sm:min-h-8 px-3 text-[13px]',
  sm: 'min-h-11 sm:min-h-6 px-2 text-[11px]',
} as const;

/** Two to four short options that filter or re-scope the same view (UI
 *  foundations spec §5.3): scope, kind, window, Appearance. Five or more
 *  use Select. `sm` is the size inside tiles. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex ${SEGMENT[size]} items-center justify-center rounded-md font-semibold ${FOCUS} ${active ? 'bg-subtle text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
