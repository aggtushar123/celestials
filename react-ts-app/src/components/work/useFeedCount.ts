import { useEffect, useState } from 'react';
import { fetchFeedCount } from '../../features/work/workApi';
import type { FeedCount } from '../../features/work/workTypes';
import { useRefreshTick } from './useRefreshTick';

type Answer = { userId: number; count: FeedCount };

/** The one Work badge (spec §5; Decision 12): GET /work/feed/count/, read on
 *  mount, for another user and on every refresh tick. A failed read keeps
 *  the last answer; null until the first. */
export function useFeedCount(userId: number | null): FeedCount | null {
  const tick = useRefreshTick();
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    fetchFeedCount().then(
      (count) => {
        if (alive && typeof count?.badge === 'number') setAnswer({ userId, count });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [userId, tick]);
  return answer !== null && answer.userId === userId ? answer.count : null;
}
