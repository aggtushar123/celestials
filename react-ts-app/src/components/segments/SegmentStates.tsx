import { Link } from 'react-router-dom';
import { BUTTON, Card, EmptyState, ErrorState, LoadingState } from '../ui';

export function SegmentLoading() {
  return (
    <Card pad="none">
      <LoadingState label="Loading segment" />
    </Card>
  );
}

/** A 404: missing and not-shared read the same (backend Access rule). */
export function SegmentMissing() {
  return (
    <Card pad="none">
      <EmptyState
        title="Segment not found"
        detail="It may have been deleted, or it isn't shared with you."
        action={
          <Link to="/segments" className={BUTTON}>
            All segments
          </Link>
        }
      />
    </Card>
  );
}

export function SegmentFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card pad="none">
      <ErrorState message={message} onRetry={onRetry} />
    </Card>
  );
}
