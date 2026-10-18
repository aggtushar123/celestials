import { useCallback, useEffect, useState } from 'react';
import { fetchDrill } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskRow } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useTaskChanges } from './taskChanges';

type Answer = { tasks: TaskRow[] | null; error: string | null };

/** One person's open tasks the reader may read (GET /work/tasks/), read
 *  once the row opens, again on Try again and after any task changes. */
export function useDrill(assignee: number, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchDrill(assignee).then(
      (data) => {
        if (alive) setAnswer({ tasks: data.tasks, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((prev) => ({ tasks: prev?.tasks ?? null, error: errorMessage(err, WORK.LOAD_DRILL) }));
      },
    );
    return () => {
      alive = false;
    };
  }, [assignee, enabled, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);
  return { tasks: answer?.tasks ?? null, error: answer?.error ?? null, reload };
}
