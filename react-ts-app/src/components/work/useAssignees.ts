import { useCallback, useEffect, useState } from 'react';
import { fetchAssignees } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { AssigneeOption, ParentKind } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Answer = { key: string; people: AssigneeOption[] | null; error: string | null };

/** GET /work/assignees/ for one record; nothing without one. An answer is
 *  kept for the record it was read for, so another record starts empty.
 *  `retry` reads again after a failure. */
export function useAssignees(parent: { kind: ParentKind; id: number } | null): {
  people: AssigneeOption[] | null;
  error: string | null;
  retry: () => void;
} {
  const kind = parent?.kind ?? null;
  const id = parent?.id ?? null;
  const key = kind && id !== null ? `${kind}:${id}` : '';
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!kind || id === null) return;
    let alive = true;
    const asked = `${kind}:${id}`;
    fetchAssignees({ kind, id }).then(
      (data) => {
        if (alive) setAnswer({ key: asked, people: Array.isArray(data?.people) ? data.people : [], error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: asked, people: null, error: errorMessage(err, WORK.LOAD_PEOPLE) });
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, id, attempt]);
  const retry = useCallback(() => {
    setAnswer(null);
    setAttempt((n) => n + 1);
  }, []);
  return answer && answer.key === key ? { people: answer.people, error: answer.error, retry } : { people: null, error: null, retry };
}
