import { Card, LoadingState } from '../ui';

/** The page's shape while it loads: one card of rows under the tiles. */
export function ChangedSkeleton() {
  return (
    <Card pad="none">
      <LoadingState label="Loading what changed" count={5} />
    </Card>
  );
}
