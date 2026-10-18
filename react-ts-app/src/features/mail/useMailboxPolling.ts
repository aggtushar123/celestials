import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchMailbox, syncWaitExpired } from './mailSlice';

/** How often a queued Sync now asks whether the tick has run. */
export const SYNC_POLL_MS = 5000;
/** Asks before giving up on a queued sync: two minutes. */
export const SYNC_POLL_LIMIT = 24;
/** How often a running import's progress is read again. */
export const IMPORT_POLL_MS = 15000;

/** Reads GET mail/connection/ again while a queued Sync now has not landed
 *  (every 5 s, at most two minutes) and, with `whileImporting`, while the
 *  12-month import runs (every 15 s). Nothing polls otherwise (Decision 8). */
export function useMailboxPolling({ whileImporting }: { whileImporting: boolean }) {
  const dispatch = useAppDispatch();
  const syncQueued = useAppSelector((state) => state.mail?.syncQueued ?? false);
  const importing = useAppSelector((state) => state.mail?.connection?.import?.state === 'importing');
  const paused = useAppSelector((state) => Boolean(state.mail?.connection?.paused_reason));
  // A paused Google row never moves its import, so there is nothing to watch.
  const watchImport = whileImporting && importing && !paused;

  useEffect(() => {
    if (!syncQueued && !watchImport) return;
    let asks = 0;
    const timer = setInterval(
      () => {
        asks += 1;
        void dispatch(fetchMailbox());
        if (syncQueued && asks >= SYNC_POLL_LIMIT) dispatch(syncWaitExpired());
      },
      syncQueued ? SYNC_POLL_MS : IMPORT_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [dispatch, syncQueued, watchImport]);
}
