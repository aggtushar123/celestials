import { useCallback, useEffect, useRef, useState } from 'react';

/** Only the field-less refusal (an inline form's `[data-error]` line). */
export const FORM_REFUSAL = '[data-error]';
/** The first refusal or invalid field (a dialog's body). */
export const ANY_REFUSAL = '[data-error], [aria-invalid="true"]';

/** A refusal takes focus (spec §2.2/§2.3): `focusRefusal()` bumps a tick
 *  when a new refusal arrives, and the effect focuses the first `selector`
 *  match inside `ref` once, after it renders, rather than on every render. */
export function useRefusalFocus<T extends HTMLElement>(selector: string) {
  const ref = useRef<T>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0) return;
    ref.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [tick, selector]);
  const focusRefusal = useCallback(() => setTick((n) => n + 1), []);
  return { ref, focusRefusal };
}
