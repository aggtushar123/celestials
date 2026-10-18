import type { ReactNode, Ref } from 'react';
import { FOCUS } from './styles';

/** The switch's button: the words beside the track, 44px below sm. */
export const SWITCH = `inline-flex min-h-11 sm:min-h-9 items-center gap-2 rounded-lg px-1 text-[13px] font-semibold text-ink hover:bg-subtle disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed aria-busy:cursor-progress ${FOCUS}`;

/** The track and knob, for sight only (the button carries the role and state). */
export function Track({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  );
}

/** The one switch (UI foundations spec §5.5, promoted from the rules'
 *  RuleSwitch): a `role="switch"` button whose click asks for the other
 *  state. Its name is `label`, or the visible `children` beside the track. */
export function Switch({
  checked,
  onChange,
  label,
  describedBy,
  disabled = false,
  busy = false,
  className = '',
  ref,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  describedBy?: string;
  disabled?: boolean;
  /** A save is running: aria-busy, presses ignored, focus kept. */
  busy?: boolean;
  /** Layout only, such as `self-start`. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={() => {
        if (!busy) onChange(!checked);
      }}
      className={`${SWITCH} ${className}`.trim()}
    >
      <Track on={checked} />
      {children}
    </button>
  );
}
