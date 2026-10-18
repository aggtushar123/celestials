import { CS } from '../../features/brain/customersText';
import { Card, LoadingState } from '../ui';

/** The page's shape while it loads: one announced status. */
export function CustomersSkeleton() {
  return (
    <Card pad="none">
      <LoadingState label={CS.LOADING} count={6} />
    </Card>
  );
}
