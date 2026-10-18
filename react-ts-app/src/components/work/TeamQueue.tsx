import { useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isRoutedQueue } from '../../features/work/queues';
import { chipOf, emptyTitle, failedSlots, feedTotal, hiddenFeedText } from '../../features/work/feed';
import { TEAM_GROUP_LABEL, TEAM_GROUP_ORDER, TEAM_QUEUE, queueEmpty, queueTitle } from '../../features/work/teamQueue';
import type { QueueScope } from '../../features/work/workTypes';
import { useAppSelector } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { Card, EmptyState, ErrorState, ListCard, LoadingState, TYPE } from '../ui';
import { AskTheAgent } from './AskTheAgent';
import { FeedGroups } from './FeedGroups';
import { NeedsCustomer } from './NeedsCustomer';
import { KindChips } from './KindChips';
import { useTaskChanges } from './taskChanges';
import { useFeedSettle } from './useFeedSettle';
import { useTeamQueue } from './useTeamQueue';
import { WorkToast } from './WorkToast';

const NOTHING = new Set<string>();
const NO_ERRORS: Record<string, string> = {};

/** Work › Team's "Waiting on your team" (spec §5 Team; delivery 2 contract
 *  §1): what waits on the people in scope, the reader's own left out (on My
 *  work). Rows decide in place with the allowed buttons; a task row only
 *  opens the panel. Ask the agent sits in the header for view-all readers at
 *  Company scope (frontend Decision 6). */
export function TeamQueue({ scope, label = '', canAsk, onRefused }: { scope: QueueScope; label?: string; canAsk: boolean; onRefused: (err: unknown) => boolean }) {
  const titleId = useId();
  const [params] = useSearchParams();
  // Routed queues have no chips to clear a kind filter, so the URL's is ignored there.
  const routed = isRoutedQueue(scope);
  const chip = routed ? null : chipOf(params.get('kind'));
  const queue = useTeamQueue(scope, chip, onRefused);
  useTaskChanges(queue.reload);
  const settle = useFeedSettle(queue.update);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const isSm = useMediaQuery(SM);
  const data = queue.data;
  // How many messages need a customer: null until that list answers (routed queues only).
  const [counted, setCounted] = useState<{ scope: QueueScope; n: number | 'failed' } | null>(null);
  const needs = !routed ? 0 : counted?.scope === scope ? counted.n : null;

  let body: ReactNode;
  if (!data && queue.error)
    body = (
      <Card pad="none">
        <ErrorState message={queue.error} onRetry={queue.reload} />
      </Card>
    );
  else if (!data) {
    const loading = routed ? TEAM_QUEUE.LOADING_QUEUE : TEAM_QUEUE.LOADING;
    body = <ListCard label={loading} state={<LoadingState label={loading} count={3} />} />;
  }
  else if (routed && needs === null && feedTotal(data) === 0) {
    body = <ListCard label={TEAM_QUEUE.LOADING_QUEUE} state={<LoadingState label={TEAM_QUEUE.LOADING_QUEUE} count={3} />} />;
  } else {
    const slots = failedSlots(data.failed);
    body =
      feedTotal(data) === 0 && slots.length === 0 && needs === 0 ? (
        <Card pad="none">
          <EmptyState title={chip ? emptyTitle(chip) : queueEmpty(scope, label)} detail={routed ? TEAM_QUEUE.ROUTED_EMPTY_DETAIL : TEAM_QUEUE.EMPTY_DETAIL} />
        </Card>
      ) : (
        <FeedGroups
          data={data}
          slots={slots}
          paging={queue.paging}
          isSm={isSm}
          me={me}
          pending={NOTHING}
          errors={NO_ERRORS}
          order={TEAM_GROUP_ORDER}
          labels={TEAM_GROUP_LABEL}
          heading="h3"
          idPrefix="work-team"
          onMore={(group, cursor) => void queue.showMore(group, cursor)}
          onRetry={queue.retry}
          handlers={{ onDone: () => undefined, onSettled: settle.leave, onGone: settle.gone, onLost: settle.lost, onAnswered: settle.leave }}
        />
      );
  }
  const hidden = data ? hiddenFeedText(data.hidden) : null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className={TYPE.title}>
          {queueTitle(scope, label)}
        </h2>
        {canAsk ? <AskTheAgent reads={queue.reads} onRan={queue.reload} /> : null}
      </div>
      <KindChips queue={scope} />
      {routed ? <NeedsCustomer key={scope} queue={scope} onCount={(n) => setCounted({ scope, n })} onToast={(text) => settle.say({ text })} onRefused={onRefused} /> : null}
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
      {settle.toast ? <div aria-hidden="true" data-part="toast-room" className="h-32 shrink-0 sm:h-20" /> : null}
      <WorkToast toast={settle.toast} onClose={settle.close} />
    </section>
  );
}
