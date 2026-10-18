import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BundleSheet } from '../../components/work/BundleSheet';
import { QueueRail, QueueSelect } from '../../components/work/QueueRail';
import { TeamPeople } from '../../components/work/TeamPeople';
import { TeamQueue } from '../../components/work/TeamQueue';
import { useQueues } from '../../components/work/useQueues';
import { WorkAskPane } from '../../components/work/WorkAskPane';
import { WorkFrame } from '../../components/work/WorkFrame';
import { Card, ErrorState, ListCard, LoadingState } from '../../components/ui';
import { FALLBACK_QUEUES, isQueueRefusal, isRoutedQueue, queueOf } from '../../features/work/queues';
import { TEAM_QUEUE } from '../../features/work/teamQueue';
import { useCapability } from '../../hooks';
import { LG, SM, useMediaQuery } from '../../lib/useMediaQuery';
import { HistoryPage } from './History';
import { MyWorkPage } from './MyWork';

/** /work (spec §8.1; frontend Decisions 1, 2, 16): the queue rail (a select
 *  on phones), the open queue's list, and the bundle panel over it. A queue
 *  the server does not offer falls back to Mine once the list is known. */
export function WorkInbox() {
  const [params, setParams] = useSearchParams();
  const queues = useQueues();
  const isSm = useMediaQuery(SM);
  const isLg = useMediaQuery(LG);
  const canSeeAll = useCapability('view_all_accounts');
  const listRef = useRef<HTMLDivElement>(null);
  const asked = queueOf(params);
  const rows = queues.data?.queues ?? FALLBACK_QUEUES;
  const offered = !queues.data || asked === 'mine' || rows.some((row) => row.key === asked);
  const queue = offered ? asked : 'mine';

  useEffect(() => {
    if (offered) return;
    setParams(new URLSearchParams({ queue: 'mine' }), { replace: true });
  }, [offered, setParams]);

  const refused = (err: unknown) => {
    if (!isQueueRefusal(err)) return false;
    queues.reload();
    return true;
  };

  let body: ReactNode;
  if (queue === 'history') body = <HistoryPage />;
  else if (queue === 'team')
    body = (
      <>
        <TeamQueue key="team" scope="team" canAsk={false} onRefused={refused} />
        <TeamPeople />
      </>
    );
  else if (queue === 'company') body = <TeamQueue key="company" scope="company" canAsk={canSeeAll} onRefused={refused} />;
  else if (isRoutedQueue(queue)) {
    const row = rows.find((candidate) => candidate.key === queue);
    // The title needs the queue row's label: until the queues answer, the
    // queue's skeleton, and its feed is not read yet.
    if (row) body = <TeamQueue key={queue} scope={queue} label={row.label} canAsk={false} onRefused={refused} />;
    else if (queues.error)
      body = (
        <Card pad="none">
          <ErrorState message={queues.error} onRetry={queues.reload} />
        </Card>
      );
    else body = <ListCard label={TEAM_QUEUE.LOADING_QUEUE} state={<LoadingState label={TEAM_QUEUE.LOADING_QUEUE} count={3} />} />;
  } else body = <MyWorkPage boxInPane={isLg} />;

  const inbox = (
    <WorkFrame width={queue === 'mine' ? 'full' : 'reading'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {isSm ? <QueueRail rows={rows} current={queue} /> : <QueueSelect rows={rows} current={queue} />}
        <div ref={listRef} data-part="queue" className="flex min-w-0 flex-1 flex-col gap-4">
          {body}
        </div>
      </div>
      <BundleSheet fallbackFocus={() => listRef.current?.querySelector<HTMLElement>('h2')} />
    </WorkFrame>
  );
  if (!isLg) return inbox;
  // From lg: Add a to-do and Ask Revenact in a pane on the right (owner, 2026-10-16).
  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1">{inbox}</div>
      <div className="flex min-h-0 shrink-0 py-3 pr-3">
        <WorkAskPane />
      </div>
    </div>
  );
}
