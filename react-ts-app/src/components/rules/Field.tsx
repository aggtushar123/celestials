import type { ReactNode } from 'react';
import { TYPE } from '../ui';

type Aria = { 'aria-describedby'?: string; 'aria-invalid': boolean };

/** One field: its label above, then the control, then the hint and the
 *  error below (house rule). The control takes `aria` for its description
 *  and its invalid state. The label is `TYPE.label` (UI foundations spec §2:
 *  labels are sentence case); every builder that uses `Field` (rules, plans,
 *  campaigns, surveys, the Work task panel) changes with it. */
export function Field({ id, label, hint, error, hideLabel = false, children }: {
  id: string;
  label: string;
  /** The label for screen readers only, when a heading beside it already says it. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (aria: Aria) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : TYPE.label}>
        {label}
      </label>
      {children({ 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {hint ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
