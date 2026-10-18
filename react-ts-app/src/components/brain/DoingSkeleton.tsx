import { DO } from '../../features/brain/doingText';
import { Card, LoadingState } from '../ui';

/** The page's shape while it loads: one announced status. */
export function DoingSkeleton() {
  return (
    <Card pad="none">
      <LoadingState label={DO.LOADING} count={6} />
    </Card>
  );
}
