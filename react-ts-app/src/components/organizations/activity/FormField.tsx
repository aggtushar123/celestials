import type { ReactNode } from 'react';

/** A labelled field of the create forms (see formStyles.ts): the label
 *  above its control, a hint under it. */
export function Field({
  id,
  label,
  hint,
  error,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  /** The server's refusal for this field (workApi's `readRefusal`). */
  error?: string;
  /** Spans both columns when the form has two. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? '@xl:col-span-2' : ''}`}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
