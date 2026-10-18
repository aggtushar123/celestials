import { useEffect, useState } from 'react';
import { fetchHistory } from '../../features/agents/bundlesApi';
import { BRIEF, briefCounts, briefSummary, overdueCountText } from '../../features/work/feed';
import type { FeedPayload } from '../../features/work/workTypes';
import { TYPE, Tile } from '../ui';

/** How many bundles Revenact finished for the reader: null while it reads
 *  or when it could not (the tile shows a dash; the page never waits). */
function useDoneCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchHistory({ agent: null, step_kind: null, status: null, page: 1 })
      .then((answer) => {
        if (live && typeof answer?.count === 'number') setCount(answer.count);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return count;
}

/** Work home's summary line and three tiles (owner, 2026-10-17): Needs you
 *  and Due today jump to their sections; Done with Revenact opens History. */
export function WorkBrief({ data, onJump, summary = true }: { data: FeedPayload; onJump: (to: 'ready' | 'todos') => void; summary?: boolean }) {
  const done = useDoneCount();
  const { waiting, overdue, today } = briefCounts(data);
  return (
    <>
      {summary ? (
        <p data-part="brief-summary" className={TYPE.bodyMuted}>
          {briefSummary(data)}
        </p>
      ) : null}
      <div className="@container">
        <div data-part="brief-tiles" className="grid grid-cols-1 items-start gap-3 @min-[36rem]:grid-cols-3">
          <Tile label={BRIEF.NEEDS_YOU} value={waiting} onOpen={() => onJump('ready')} />
          <Tile
            label={BRIEF.DUE_TODAY}
            value={overdue + today}
            meta={overdue > 0 ? <span className="text-danger-ink">{overdueCountText(overdue)}</span> : undefined}
            onOpen={() => onJump('todos')}
          />
          <Tile
            label={BRIEF.DONE}
            value={done ?? BRIEF.NO_FIGURE}
            to="/work?queue=history"
          />
        </div>
      </div>
    </>
  );
}
