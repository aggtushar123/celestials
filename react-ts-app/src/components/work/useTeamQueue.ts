import { chipOf, queueKindsOf, type FeedChip } from '../../features/work/feed';
import { fetchTeamQueue, fetchTeamQueueGroup } from '../../features/work/workApi';
import type { FeedGroupKey, QueueScope } from '../../features/work/workTypes';
import { useFeedSource } from './useFeedSource';

/** One string per (scope, chip): useFeedSource keys its reads on it, so an object would read forever. */
type Key = `${QueueScope}|${string}`;
const keyOf = (scope: QueueScope, chip: FeedChip | null): Key => `${scope}|${chip ?? ''}`;
const parts = (key: Key) => {
  const at = key.lastIndexOf('|');
  return { scope: key.slice(0, at) as QueueScope, kinds: queueKindsOf(chipOf(key.slice(at + 1) || null)) };
};
const read = (key: Key) => {
  const { scope, kinds } = parts(key);
  return fetchTeamQueue(scope, kinds);
};
const readGroup = (key: Key, group: FeedGroupKey, cursor: string | null) => {
  const { scope, kinds } = parts(key);
  return fetchTeamQueueGroup(scope, group, kinds, cursor);
};

/** GET /work/feed/team/ for one queue and kind filter (agent bundles D1
 *  §10.2). A 403 SCOPE_NOT_ALLOWED goes to `refused` (the inbox reads the
 *  queues again and falls back to Mine) and shows no error of its own. */
export function useTeamQueue(scope: QueueScope, chip: FeedChip | null, refused: (err: unknown) => boolean) {
  return useFeedSource(keyOf(scope, chip), read, readGroup, refused);
}
