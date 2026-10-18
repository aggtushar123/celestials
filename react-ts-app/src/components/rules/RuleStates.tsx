import { Link } from 'react-router-dom';
import { BUTTON, Card, EmptyState, ErrorState, LoadingState } from '../ui';

export function RuleLoading() {
  return (
    <Card pad="none">
      <LoadingState label="Loading rule" />
    </Card>
  );
}

/** A 404: missing and not shared read the same (backend Access rule). */
export function RuleMissing() {
  return (
    <Card pad="none">
      <EmptyState
        title="Rule not found"
        detail={"It may have been deleted, or it isn't shared with you."}
        action={
          <Link to="/scenarios" className={BUTTON}>
            All rules
          </Link>
        }
      />
    </Card>
  );
}

export function RuleFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card pad="none">
      <ErrorState message={message} onRetry={onRetry} />
    </Card>
  );
}
