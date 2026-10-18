import { kindsOf, type FeedChip } from '../../features/work/feed';
import { fetchFeed, fetchFeedGroup } from '../../features/work/workApi';
import type { FeedGroupKey } from '../../features/work/workTypes';
import { useFeedSource } from './useFeedSource';

const read = (chip: FeedChip | null) => fetchFeed(kindsOf(chip));
const readGroup = (chip: FeedChip | null, group: FeedGroupKey, cursor: string | null) => fetchFeedGroup(group, kindsOf(chip), cursor);

/** GET /work/feed/ for one chip (spec §5): see useFeedSource for the rules. */
export function useFeed(chip: FeedChip | null) {
  return useFeedSource(chip, read, readGroup);
}
