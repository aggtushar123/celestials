import { useCallback, useEffect, useRef, useState } from 'react';
import { FEED, withGroup, withPage, type FailedSlot } from '../../features/work/feed';
import type { FeedGroupKey, FeedPage, FeedPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Loaded<K, P> = { key: K; payload: P };
type Failure<K> = { key: K; message: string };

/** One feed reader (spec §5) for a chip or a Team scope. A reload keeps the list on screen
 *  until the answer lands; another key starts empty (its skeleton); an error
 *  shows only while there is no list. Show more appends a group's next page;
 *  Try again reads a failed group's first page, or the whole feed for the
 *  task source (Decision 4). An item placed (`place`) while a load is on
 *  its way survives it: that answer is dropped and the feed read again. */
export function useFeedSource<K, P extends FeedPayload>(
  key: K,
  read: (key: K) => Promise<P>,
  readGroupPage: (key: K, group: FeedGroupKey, cursor: string | null) => Promise<FeedPage>,
  refused?: (err: unknown) => boolean,
) {
  const [attempt, setAttempt] = useState(0);
  // Whole-payload reads that have answered or failed for good (not a stale
  // one that reads again, not a page or an update): Ask the agent waits on it.
  const [reads, setReads] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<K, P> | null>(null);
  const [failure, setFailure] = useState<Failure<K> | null>(null);
  const [paging, setPaging] = useState<Partial<Record<FeedGroupKey, 'busy' | string>>>({});

  // One id per load (key change or reload): a group read started under an
  // older id is ignored, data and paging alike (Decision 5).
  const generation = useRef(0);
  const reading = useRef(new Set<FeedGroupKey>());
  // A load is on its way; `stale`: something was placed locally meanwhile,
  // so its answer (read before) is dropped for one more read.
  const loading = useRef(false);
  const stale = useRef(false);

  useEffect(() => {
    let alive = true;
    generation.current += 1;
    reading.current.clear();
    loading.current = true;
    stale.current = false;
    setPaging({});
    read(key).then(
      (payload) => {
        if (!alive) return;
        loading.current = false;
        if (stale.current) {
          // Keep the list on screen (it holds the local insert) and read again.
          setLoaded((current) => (current && current.key === key ? current : { key, payload }));
          setAttempt((n) => n + 1);
          return;
        }
        setLoaded({ key, payload });
        setFailure(null);
        setReads((n) => n + 1);
      },
      (err: unknown) => {
        if (!alive) return;
        loading.current = false;
        if (refused?.(err)) return;
        if (stale.current) setAttempt((n) => n + 1);
        else {
          setFailure({ key, message: errorMessage(err, FEED.LOAD) });
          setReads((n) => n + 1);
        }
      },
    );
    return () => {
      alive = false;
    };
    // read, readGroup and refused are stable for the page's life (module functions and useBrainScope's callback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const data = loaded && loaded.key === key ? loaded.payload : null;
  const error = !data && failure && failure.key === key ? failure.message : null;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const update = useCallback((change: (feed: P) => P) => {
    setLoaded((current) => (current ? { ...current, payload: change(current.payload) } : current));
  }, []);
  /** `update` for an item the server now holds (quick-add): a load already
   *  on its way was read before it, so the feed is read once more after. */
  const place = useCallback(
    (change: (feed: P) => P) => {
      update(change);
      if (loading.current) stale.current = true;
    },
    [update],
  );

  const readGroup = useCallback(
    async (group: FeedGroupKey, cursor: string | null, retried: FeedPayload['failed']) => {
      const mine = generation.current;
      reading.current.add(group);
      setPaging((current) => ({ ...current, [group]: 'busy' }));
      try {
        const answer = await readGroupPage(key, group, cursor);
        if (generation.current !== mine) return;
        setLoaded((current) => {
          if (!current || current.key !== key) return current;
          const payload = cursor ? withPage(current.payload, answer.group) : withGroup(current.payload, answer.group, answer.failed, retried);
          return { ...current, payload };
        });
        reading.current.delete(group);
        setPaging((current) => {
          const next = { ...current };
          delete next[group];
          return next;
        });
      } catch (err) {
        if (generation.current !== mine) return;
        reading.current.delete(group);
        setPaging((current) => ({ ...current, [group]: errorMessage(err, FEED.MORE_FAILED) }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const showMore = useCallback((group: FeedGroupKey, cursor: string) => (reading.current.has(group) ? Promise.resolve() : readGroup(group, cursor, [])), [readGroup]);
  const retry = useCallback(
    (slot: FailedSlot) => {
      if (slot.retry === 'all') reload();
      else void readGroup(slot.retry, null, slot.kinds);
    },
    [readGroup, reload],
  );

  return { data, error, reads, reload, update, place, showMore, retry, paging };
}
