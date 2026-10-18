import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchSegment } from '../../features/segments/segmentApi';
import type { Segment } from '../../features/segments/segmentTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type SegmentLoad =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; segment: Segment };

/** One segment, read for the reader: `missing` for a 404, which is the
 *  same for a segment that does not exist and one not shared with them.
 *  `replace` swaps in a newer copy (after a pin, say); `retry` reads again. */
export function useSegment(id: number): [SegmentLoad, (segment: Segment) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: SegmentLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSegment(id).then(
      (segment) => {
        if (alive) setAnswer({ key, load: { status: 'ready', segment } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this segment.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((segment: Segment) => setAnswer({ key, load: { status: 'ready', segment } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
