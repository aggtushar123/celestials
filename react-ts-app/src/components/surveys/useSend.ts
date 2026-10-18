import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchSend } from '../../features/surveys/surveyApi';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type SendLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; send: SurveySend };

/** One send, read for the reader: `missing` for a 404, which is the same
 *  for a send that does not exist and one not shared with them. `replace`
 *  swaps in a newer copy (after an edit); `retry` reads again. */
export function useSend(id: number): [SendLoad, (send: SurveySend) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: SendLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSend(id).then(
      (send) => {
        if (alive) setAnswer({ key, load: { status: 'ready', send } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this survey.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((send: SurveySend) => setAnswer({ key, load: { status: 'ready', send } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
