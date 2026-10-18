import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchPlan } from '../../features/plans/planApi';
import type { Plan } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type PlanLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; plan: Plan };

/** One plan, read for the reader: `missing` for a 404, the same for a plan
 *  that does not exist and one on a record they can't open (spec §1.3).
 *  `replace` swaps in the plan a write answered with; `retry` reads again. */
export function usePlan(id: number): [PlanLoad, (plan: Plan) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: PlanLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPlan(id).then(
      (plan) => {
        if (alive) setAnswer({ key, load: { status: 'ready', plan } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this plan.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((plan: Plan) => setAnswer({ key, load: { status: 'ready', plan } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
