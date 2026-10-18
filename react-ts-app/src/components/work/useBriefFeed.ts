import { useEffect, useState } from 'react';
import { kindsOf } from '../../features/work/feed';
import { fetchFeed } from '../../features/work/workApi';
import type { FeedPayload } from '../../features/work/workTypes';
import { useRefreshTick } from './useRefreshTick';

/** The whole feed, unfiltered, for the brief's tiles while a kind chip
 *  narrows the list (owner, 2026-10-18: the three tiles stay the same on
 *  every chip). Read only while `on`, again on every refresh tick; a failed
 *  read keeps the last answer; null until the first. */
export function useBriefFeed(on: boolean): FeedPayload | null {
  const tick = useRefreshTick();
  const [data, setData] = useState<FeedPayload | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    fetchFeed(kindsOf(null)).then(
      (answer) => {
        if (alive && answer && Array.isArray(answer.groups)) setData(answer);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [on, tick]);
  return on ? data : null;
}
