import { useCallback, useEffect, useState } from 'react';
import { fetchDoing } from '../../features/brain/brainApi';
import type { DoingInitiative, DoingPayload, ScopeKey } from '../../features/brain/brainTypes';
import { DO } from '../../features/brain/doingText';

type Answer = { key: string; data: DoingPayload | null; error: string | null };

/** GET doing/?scope= for the settled scope, read again on Try again and
 *  after a start; a slower answer for another scope is dropped. A 403
 *  SCOPE_NOT_ALLOWED goes to `onRefused` and shows no error of its own.
 *  `replace` puts an edited initiative back in its place.
 *
 *  Minor (final review): the last payload stays visible while a retry's
 *  answer is in flight, the way `usePagedRead` keeps its last page — so the
 *  whole page doesn't drop to `DoingSkeleton` and lose scroll position and
 *  focus after a start. Only `error` is gated by `key`: a stale error must
 *  not linger once a retry is under way.
 *
 *  Fix (final re-review): `key` carries the attempt too, so "same scope,
 *  new attempt" and "scope changed" both change it — keeping the last
 *  payload on `key` alone let a scope switch briefly render the old
 *  scope's rows under the new scope's label. `data` is gated on the
 *  payload's own `scope` instead: a kept answer is shown only while it
 *  still matches the scope being read, so a switch drops straight to the
 *  skeleton until the new scope's rows land. */
export function useDoing(scope: ScopeKey | null, onRefused: (err: unknown) => boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    fetchDoing(scope).then(
      (data) => alive && setAnswer({ key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ key, data: null, error: DO.LOAD });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `onRefused` is the page's stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const replace = useCallback(
    (next: DoingInitiative) =>
      setAnswer((last) =>
        last?.data ? { ...last, data: { ...last.data, initiatives: last.data.initiatives.map((one) => (one.id === next.id ? next : one)) } } : last,
      ),
    [],
  );
  const data = answer?.data && answer.data.scope === scope ? answer.data : null;
  return { data, error: key && answer?.key === key ? answer.error : null, retry: () => setAttempt((n) => n + 1), replace };
}
