import { useEffect, useState } from 'react';
import { fetchSegments } from '../../features/segments/segmentApi';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** The caller's own segments (GET /segments/?scope=mine): a survey goes
 *  only to the sender's own segment (spec Decisions, "Who builds"). */
export function useMySegments(): { rows: SegmentListRow[] | null; error: string | null } {
  const [state, setState] = useState<{ rows: SegmentListRow[] | null; error: string | null }>({ rows: null, error: null });
  useEffect(() => {
    let alive = true;
    fetchSegments('mine', '').then(
      (rows) => {
        if (alive) setState({ rows, error: null });
      },
      (err: unknown) => {
        if (alive) setState({ rows: [], error: errorMessage(err, 'Could not load your segments.') });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
