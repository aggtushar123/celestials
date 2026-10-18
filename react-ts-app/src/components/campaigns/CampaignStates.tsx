import { Link } from 'react-router-dom';
import { BUTTON, Card, EmptyState, ErrorState, LoadingState } from '../ui';

export function CampaignLoading() {
  return (
    <Card pad="none">
      <LoadingState label="Loading campaign" />
    </Card>
  );
}

/** A 404: missing and not shared read the same (backend Access rule). */
export function CampaignMissing() {
  return (
    <Card pad="none">
      <EmptyState
        title="Campaign not found"
        detail={"It may have been deleted, or it isn't shared with you."}
        action={
          <Link to="/campaigns" className={BUTTON}>
            All campaigns
          </Link>
        }
      />
    </Card>
  );
}

export function CampaignFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card pad="none">
      <ErrorState message={message} onRetry={onRetry} />
    </Card>
  );
}
