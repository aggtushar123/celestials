import { Link } from 'react-router-dom';
import { SAY } from '../../features/plans/planOptions';
import { BUTTON, Card, EmptyState, ErrorState, LoadingState } from '../ui';

export function PlanLoading() {
  return (
    <Card pad="none">
      <LoadingState label="Loading plan" variant="block" />
    </Card>
  );
}

/** A 404: missing and not shared read the same (backend Access rule). */
export function PlanMissing() {
  return (
    <Card pad="none">
      <EmptyState
        title="Plan not found"
        detail={SAY.NOT_FOUND}
        action={
          <Link to="/projects" className={BUTTON}>
            All plans
          </Link>
        }
      />
    </Card>
  );
}

export function PlanFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card pad="none">
      <ErrorState message={message} onRetry={onRetry} />
    </Card>
  );
}
