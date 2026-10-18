import { useEffect, useState } from 'react';
import { fetchPlanRecord } from '../../features/plans/planApi';
import type { PlanRecord, RecordKind } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** The chosen record's name and owner (Contract note 9); nothing while none is chosen. */
export function usePlanRecord(target: { kind: RecordKind; id: number } | null): { record: PlanRecord | null; error: string | null } {
  const kind = target?.kind ?? null;
  const id = target?.id ?? null;
  const key = kind && id !== null ? `${kind}:${id}` : '';
  const [answer, setAnswer] = useState<{ key: string; record: PlanRecord | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!kind || id === null) return;
    let alive = true;
    fetchPlanRecord(kind, id).then(
      (record) => {
        if (alive) setAnswer({ key: `${kind}:${id}`, record, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: `${kind}:${id}`, record: null, error: errorMessage(err, 'Could not load this record.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, id]);
  return answer && answer.key === key ? { record: answer.record, error: answer.error } : { record: null, error: null };
}
