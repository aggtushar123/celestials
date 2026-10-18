import { useEffect, useState } from 'react';
import { fetchChanged } from '../../features/brain/brainApi';
import { SAY } from '../../features/brain/brainText';
import type { ChangedPayload, ScopeKey } from '../../features/brain/brainTypes';

type Answer = { key: string; data: ChangedPayload | null; error: string | null };

/** GET changed/?scope= for the settled scope, read again on Try again; a
 *  slower answer for another scope is dropped. A 403 SCOPE_NOT_ALLOWED goes
 *  to `onRefused` and shows no error of its own. */
export function useChanged(scope: ScopeKey | null, onRefused: (err: unknown) => boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    fetchChanged(scope).then(
      (data) => alive && setAnswer({ key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ key, data: null, error: SAY.LOAD_CHANGED });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `onRefused` is the page's stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = key && answer?.key === key ? answer : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1) };
}
