import { useEffect, useRef } from 'react';

/** How often a send still `sending` is read again: send-now (campaigns and
 *  surveys both) only claims — it writes queued invites/deliveries and
 *  answers at once; the `deliver_pending` minute runner delivers and
 *  finishes it in the background. Poll the detail until it says so. */
export const SENDING_POLL_MS = 5000;

/** How far a run of failed reads backs off: doubling each time, capped at
 *  eight intervals (40s on the default 5s interval) so a mail-server blip
 *  does not end up polling once a minute. */
const MAX_BACKOFF_FACTOR = 8;

/** While `item.status` is `sending`, read it again every `intervalMs`
 *  (backing off on a failed read, reset on success); each answer is handed
 *  to `onUpdate`. Stops once the item leaves `sending`, the component
 *  unmounts, or late — a failed read's own answer arrives after either.
 *  `key` identifies what is being polled (its id, typically): changing it
 *  resets the backoff, so reusing the hook for a different item never
 *  inherits a stranger's failure count.
 *
 *  Shared by campaigns' and surveys' own send-detail pages — the two
 *  differed only in the fetcher and the type, which is exactly what used
 *  to drift between two copies of the backoff and stop rules. */
export function useSendingPoll<T extends { status: string }>(
  key: string | number,
  item: T,
  read: () => Promise<T>,
  onUpdate: (item: T) => void,
  intervalMs = SENDING_POLL_MS,
) {
  const update = useRef(onUpdate);
  useEffect(() => {
    update.current = onUpdate;
  }, [onUpdate]);
  const readNow = useRef(read);
  useEffect(() => {
    readNow.current = read;
  }, [read]);

  const failures = useRef(0);
  const lastKey = useRef(key);

  useEffect(() => {
    // Checked here, not during render: refs are only ever read or written
    // from an effect or an event handler in this codebase.
    if (lastKey.current !== key) {
      lastKey.current = key;
      failures.current = 0;
    }
    if (item.status !== 'sending') {
      failures.current = 0;
      return;
    }
    let alive = true;
    const factor = Math.min(2 ** failures.current, MAX_BACKOFF_FACTOR);
    const timer = window.setTimeout(() => {
      readNow.current().then(
        (next) => {
          if (!alive) return;
          failures.current = 0;
          update.current(next);
        },
        () => {
          if (!alive) return;
          failures.current += 1;
          update.current({ ...item });
        },
      );
    }, intervalMs * factor);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key, item, intervalMs]);
}
