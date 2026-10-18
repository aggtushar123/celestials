import { useEffect, useState } from 'react';
import type { ScopeKey } from '../../features/brain/brainTypes';

type Answer<T> = { scope: ScopeKey; key: string; data: T | null; error: string | null };

/** One scoped GET (customers/, graph/; customers plan Decision 2), with
 *  useDoing's rules: read once the scope settles and again on Try again; a
 *  slower answer for another scope is dropped; a kept answer shows only for
 *  the scope it was read for, so a switch drops to the skeleton (no stale
 *  rows) while a retry on the same scope keeps the last one on screen. A 403
 *  SCOPE_NOT_ALLOWED goes to `onRefused` and shows no error of its own. The
 *  answer is keyed by the scope asked for, since graph/ carries no `scope`. */
export function useScopedRead<T>(scope: ScopeKey | null, read: (scope: ScopeKey) => Promise<T>, onRefused: (err: unknown) => boolean, fallback: string) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    read(scope).then(
      (data) => alive && setAnswer({ scope, key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ scope, key, data: null, error: fallback });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `read`, `onRefused` and `fallback` are stable for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const data = answer?.data && answer.scope === scope ? answer.data : null;
  return { data, error: key && answer?.key === key ? answer.error : null, retry: () => setAttempt((n) => n + 1) };
}
