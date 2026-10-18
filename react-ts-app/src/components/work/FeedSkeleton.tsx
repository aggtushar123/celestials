import { FEED } from '../../features/work/feed';
import { ListCard, LoadingState } from '../ui';

/** My work while it loads: one list's rows, the shape of the first group. */
export function FeedSkeleton() {
  return <ListCard label={FEED.LOADING} state={<LoadingState label={FEED.LOADING} count={4} />} />;
}
