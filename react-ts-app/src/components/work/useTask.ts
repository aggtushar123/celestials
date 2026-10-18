import { useCallback, useEffect, useState } from 'react';
import { fetchTask, isMissing } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskDetail, TaskEvent } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type State = { id: number; task: TaskDetail | null; error: string | null; missing: boolean };

/** GET /tasks/<id>/ for the panel. A retry keeps what is on screen until the
 *  answer lands; `replace` takes a PATCH's answer, `append` a new comment. */
export function useTask(id: number) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTask(id).then(
      (task) => {
        if (alive) setState({ id, task, error: null, missing: false });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = isMissing(err);
        setState((prev) => ({ id, task: prev?.id === id ? prev.task : null, error: missing ? null : errorMessage(err, WORK.LOAD_TASK), missing }));
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);
  const current = state?.id === id ? state : null;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const replace = useCallback((task: TaskDetail) => setState((prev) => (prev ? { ...prev, task, error: null, missing: false } : prev)), []);
  const append = useCallback(
    (event: TaskEvent) => setState((prev) => (prev?.task ? { ...prev, task: { ...prev.task, events: [...prev.task.events, event] } } : prev)),
    [],
  );
  /** A write answered 404: the task has left the reader's reach. */
  const lose = useCallback(() => setState((prev) => (prev ? { ...prev, task: null, error: null, missing: true } : prev)), []);
  return { task: current?.task ?? null, error: current?.error ?? null, missing: current?.missing ?? false, retry, replace, append, lose };
}
