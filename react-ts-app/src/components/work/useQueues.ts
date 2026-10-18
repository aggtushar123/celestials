import { useCallback, useEffect, useState } from 'react';
import type { QueuesPayload } from '../../features/agents/bundleTypes';
import { fetchQueues } from '../../features/work/workApi';
import { QUEUE } from '../../features/work/queues';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useRefreshTick } from './useRefreshTick';

/** GET /work/queues/ (contract §10.3): read on mount, on every Work change
 *  (the badge's tick) and on `reload`. A failed read keeps the last answer. */
export function useQueues() {
  const tick = useRefreshTick();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<QueuesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchQueues().then(
      (payload) => {
        if (!alive) return;
        setData(payload);
        setError(null);
      },
      (err: unknown) => alive && setError(errorMessage(err, QUEUE.LOAD)),
    );
    return () => {
      alive = false;
    };
  }, [tick, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, reload };
}
