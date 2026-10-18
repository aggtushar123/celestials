import { ListCard, LoadingState } from '../ui';

/** Team while it loads: one list card of row skeletons. */
export function TeamSkeleton() {
  return <ListCard label="Loading the team" state={<LoadingState label="Loading the team" count={3} />} />;
}
