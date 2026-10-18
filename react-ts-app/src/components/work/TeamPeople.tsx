import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { fetchTeam } from '../../features/work/workApi';
import { QUEUE } from '../../features/work/queues';
import { WORK, hiddenTeamText } from '../../features/work/workText';
import type { TeamPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Card, EmptyState, ErrorState, ListCard, TYPE } from '../ui';
import { useTaskChanges } from './taskChanges';
import { TeamRow } from './TeamRow';
import { TeamSkeleton } from './TeamSkeleton';

/** My team's people under its queue (contract D23): one row per person with
 *  their open, overdue and blocked counts; what the reader can't open is
 *  counted, never named. */
export function TeamPeople() {
  const titleId = useId();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<TeamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTeam('team').then(
      (payload) => {
        if (!alive) return;
        setData(payload);
        setError(null);
      },
      (err: unknown) => alive && setError(errorMessage(err, WORK.LOAD_TEAM)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);

  let body: ReactNode;
  if (!data && error)
    body = (
      <Card pad="none">
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  else if (!data) body = <TeamSkeleton />;
  else if (data.people.length === 0)
    body = (
      <Card pad="none">
        <EmptyState title={WORK.NOBODY} detail={WORK.NOBODY_DETAIL} />
      </Card>
    );
  else
    body = (
      <ListCard label={QUEUE.PEOPLE}>
        {data.people.map((row) => (
          <TeamRow key={row.person.id} row={row} today={data.today} />
        ))}
      </ListCard>
    );
  const hidden = data ? hiddenTeamText(data.hidden) : null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className={TYPE.title}>
        {QUEUE.PEOPLE}
      </h2>
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
    </section>
  );
}
