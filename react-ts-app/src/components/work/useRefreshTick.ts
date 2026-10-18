import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFeedChanges, useRecommendationChanges, useTaskChanges } from './taskChanges';

/** A number that grows after every taskChanged(),
 *  recommendationsChanged() and feedChanged() and every route change (never on the first
 *  render), for the Work counts to read again on (Decision 4). A task
 *  assigned by someone else arrives as a notification, then a navigation. */
export function useRefreshTick(): number {
  const [tick, setTick] = useState(0);
  const { pathname } = useLocation();
  const seenPath = useRef<string | null>(null);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useTaskChanges(bump);
  useRecommendationChanges(bump);
  useFeedChanges(bump);
  useEffect(() => {
    if (seenPath.current === null) seenPath.current = pathname;
    else if (seenPath.current !== pathname) {
      seenPath.current = pathname;
      bump();
    }
  }, [pathname, bump]);
  return tick;
}
