import { useCallback, useRef, useState } from 'react';

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** One write at a time, however often it is asked for (Decision 17): the
 *  guard is a ref, set before React re-renders, so Enter twice or a double
 *  click sends one request. A call made while one runs answers null.
 *
 *  `holdOnSuccess` keeps the guard shut after a success too, so a second
 *  click that lands after the write settled but before the page moved on
 *  (navigated away, or re-rendered with the new version) answers null
 *  instead of writing again. A refusal always frees it for a retry;
 *  `release()` frees it once the page has moved on and may write again. */
export function useSubmitOnce({ holdOnSuccess = false }: { holdOnSuccess?: boolean } = {}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(work: () => Promise<T>): Promise<Outcome<T> | null> => {
      if (running.current) return null;
      running.current = true;
      setBusy(true);
      try {
        const value = await work();
        if (!holdOnSuccess) running.current = false;
        return { ok: true, value };
      } catch (error) {
        running.current = false;
        return { ok: false, error };
      } finally {
        setBusy(false);
      }
    },
    [holdOnSuccess],
  );
  const release = useCallback(() => {
    running.current = false;
  }, []);
  return { busy, run, release };
}
