import { Loading, ErrorState, Empty, TruncatedNotice } from '../../shared/DataState';

/** Health's wording on the shared states; kept so its tests and copy are unchanged. */
export const HealthLoading = () => <Loading label="Loading account health…" />;
export const HealthError = ({ message }: { message: string }) => (
  <ErrorState
    message={message}
    detail="Nothing is shown rather than a partial picture — every tab here counts the whole book."
  />
);
export const HealthEmpty = () => <Empty label="No accounts to show yet." />;
export const HealthTruncatedNotice = () => (
  <TruncatedNotice>
    Showing the first accounts only — this book is larger than this screen loads in one
    request, so the figures below cover part of it.
  </TruncatedNotice>
);
