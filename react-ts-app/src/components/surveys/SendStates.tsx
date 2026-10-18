import { Link } from 'react-router-dom';
import { BUTTON, Card, EmptyState, ErrorState, LoadingState } from '../ui';

export function SendLoading() {
  return (
    <Card pad="none">
      <LoadingState label="Loading survey" />
    </Card>
  );
}

/** A 404: missing and not shared read the same (backend Access rule). */
export function SendMissing() {
  return (
    <Card pad="none">
      <EmptyState
        title="Survey not found"
        detail={"It may have been deleted, or it isn't shared with you."}
        action={
          <Link to="/surveys" className={BUTTON}>
            All surveys
          </Link>
        }
      />
    </Card>
  );
}

export function SendFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card pad="none">
      <ErrorState message={message} onRetry={onRetry} />
    </Card>
  );
}
