import { useMemo } from 'react';
import { useAppSelector } from '../../../hooks';
import type { Account } from '../../../features/customers/customersSlice';
import { countByAccount, type AccountTagged } from '../../../features/organizations/accountScope';
import type { DetailTab } from '../../../features/organizations/detailParams';
import { listScope } from '../../../lib/listScope';

type Status = 'ready' | 'loading' | 'failed';

/** A list slot's state for this organization: ready once it holds this
 *  organization's records (kept while they read again), failed after an
 *  error, loading otherwise (another organization's records included). */
function status(held: string | null, scope: string, loading: boolean, error: string | null): Status {
  if (error !== null) return loading ? 'loading' : 'failed';
  return held === scope ? 'ready' : 'loading';
}

/** Counts from the lists that landed; null while one still loads, or when
 *  none did. A failed list leaves the others' numbers standing. */
function combine(parts: [Status, AccountTagged[]][], ids: number[]): Record<string, number> | null {
  if (parts.some(([s]) => s === 'loading')) return null;
  const ready = parts.filter(([s]) => s === 'ready');
  return ready.length ? countByAccount(ready.flatMap(([, records]) => records), ids) : null;
}

/** The account chips' numbers on the active tab (spec 2026-09-27 §1): the
 *  story's own facet counts on Story; people, opportunities plus risks, and
 *  files plus calls on the other three, counted from the lists those tabs
 *  read. Null while a list loads, while its slot holds another
 *  organization's records, or when every list it counts failed, so a chip
 *  shows no number rather than a wrong one; and on Details and Knowledge. */
export function useChipCounts(
  tab: DetailTab,
  storyCounts: Record<string, number> | null,
  accounts: Account[],
  customerId: number,
): Record<string, number> | null {
  const scope = listScope(customerId);
  const contacts = useAppSelector((state) => state.customers.contacts);
  const contactsStatus = useAppSelector((state) =>
    status(state.customers.contactsFor, scope, state.customers.contactsLoading, state.customers.contactsError),
  );
  const opportunities = useAppSelector((state) => state.customers.pipelineOpportunities);
  const opportunitiesStatus = useAppSelector((state) =>
    status(
      state.customers.pipelineOpportunitiesFor,
      scope,
      state.customers.pipelineOpportunitiesLoading,
      state.customers.pipelineOpportunitiesError,
    ),
  );
  const risks = useAppSelector((state) => state.customers.pipelineRisks);
  const risksStatus = useAppSelector((state) =>
    status(state.customers.pipelineRisksFor, scope, state.customers.pipelineRisksLoading, state.customers.pipelineRisksError),
  );
  const files = useAppSelector((state) => state.files.items);
  const filesStatus = useAppSelector((state) => status(state.files.scope, scope, state.files.isLoading, state.files.error));
  const calls = useAppSelector((state) => state.calls.items);
  const callsStatus = useAppSelector((state) => status(state.calls.scope, scope, state.calls.isLoading, state.calls.error));

  return useMemo(() => {
    const ids = accounts.map((account) => account.id);
    switch (tab) {
      case 'story':
        return storyCounts;
      case 'people':
        return combine([[contactsStatus, contacts]], ids);
      case 'deals':
        return combine(
          [
            [opportunitiesStatus, opportunities],
            [risksStatus, risks],
          ],
          ids,
        );
      case 'files':
        return combine(
          [
            [filesStatus, files],
            [callsStatus, calls],
          ],
          ids,
        );
      default:
        return null;
    }
  }, [tab, storyCounts, accounts, contacts, contactsStatus, opportunities, opportunitiesStatus, risks, risksStatus, files, filesStatus, calls, callsStatus]);
}
