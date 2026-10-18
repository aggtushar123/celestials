import { useEffect, useState } from 'react';
import { fetchRecordMaps } from '../../features/canvas/canvasApi';
import type { CanvasRow, RecordKind } from '../../features/canvas/canvasTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Answer = { key: string; rows: CanvasRow[] | null; error: string | null };

/** A record's maps (spec §1.5), read again on Try again; a slower answer for
 *  another record or attempt is dropped. */
export function useRecordMaps(record: { kind: RecordKind; id: number }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${record.kind}:${record.id}#${attempt}`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRecordMaps(record).then(
      ({ results }) => alive && setAnswer({ key, rows: results, error: null }),
      (err: unknown) => alive && setAnswer({ key, rows: null, error: errorMessage(err, 'Could not load maps.') }),
    );
    return () => {
      alive = false;
    };
    // `key` carries the record and the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = answer?.key === key ? answer : null;
  return { rows: current?.rows ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1) };
}
