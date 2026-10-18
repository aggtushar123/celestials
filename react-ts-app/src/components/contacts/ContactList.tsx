import type { Contact } from '../../features/customers/customersSlice';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ListCard, LoadingState } from '../ui';
import { ContactListItem } from './ContactListItem';

/** The Contacts list (spec 2026-09-28 §3): an item per person, "Load more"
 *  at the end, and designed loading, error and empty states. */
export function ContactList({
  rows,
  count,
  loading,
  error,
  filtered,
  next,
  loadingMore,
  moreError,
  selectedId,
  linkFor,
  onRetry,
  onClear,
  onMore,
}: {
  rows: Contact[];
  count: number;
  loading: boolean;
  error: string | null;
  /** Whether a search or filter narrows the list (the empty state offers to clear them). */
  filtered: boolean;
  next: string | null;
  loadingMore: boolean;
  moreError: string | null;
  selectedId: number | null;
  linkFor: (id: number) => string;
  onRetry: () => void;
  onClear: () => void;
  onMore: () => void;
}) {
  const state = error ? (
    <UiErrorState message={error} onRetry={onRetry} />
  ) : loading ? (
    <LoadingState label="Loading people" count={6} />
  ) : rows.length === 0 ? (
    filtered ? (
      <UiEmptyState
        title="Nobody matches"
        detail="Try another word or filter, or clear them."
        action={
          <button type="button" onClick={onClear} className={BUTTON}>
            Clear filters
          </button>
        }
      />
    ) : (
      <UiEmptyState title="No people yet" detail="People appear here when they are added to an organisation or an account." />
    )
  ) : undefined;
  return (
    <div>
      <ListCard label="People" state={state}>
        {rows.map((contact) => (
          <ContactListItem key={contact.id} contact={contact} to={linkFor(contact.id)} selected={contact.id === selectedId} />
        ))}
      </ListCard>
      {state ? null : (
        <MoreButton next={next} loading={loadingMore} error={moreError} label={`Load more (${rows.length} of ${count})`} onClick={onMore} className="mt-1.5" />
      )}
    </div>
  );
}
