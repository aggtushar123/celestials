import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { apiFetch } from '../../lib/apiClient';
import { fetchCustomers, type Account } from '../../features/customers/customersSlice';
import type { AccountPortfolioRow } from '../../features/accounts/portfolioTypes';
import type { LifecycleValue } from '../../features/organizations/portfolioTypes';
import { errorMessage } from '../../components/organizations/portfolio/usePortfolio';

/** What both Accounts pages need to add and edit with the existing
 *  AccountFormModal: every loaded row remembered by id (its name for a bulk
 *  report, its organisation for the edit read), the Account that Edit
 *  details reads from GET /customers/<organisation>/accounts/<id>/, and the
 *  organisations Add picks from (read when Add opens). */
export function useAccountEditing(onError: (message: string) => void) {
  const dispatch = useAppDispatch();
  // Written in fetch callbacks, read in event handlers.
  const rows = useRef(new Map<number, AccountPortfolioRow>());
  const remember = useCallback((list: AccountPortfolioRow[]) => {
    for (const row of list) rows.current.set(row.id, row);
  }, []);
  const nameOf = useCallback((id: number) => rows.current.get(id)?.name ?? `Account ${id}`, []);

  const [editing, setEditing] = useState<Account | null>(null);
  const openEdit = useCallback(
    async (id: number) => {
      const organisation = rows.current.get(id)?.organisation;
      // The kind offers Edit details only on an account with one (`editable`).
      if (!organisation) return;
      try {
        setEditing(await apiFetch<Account>(`/customers/${organisation.id}/accounts/${id}/`));
      } catch (err) {
        onError(errorMessage(err, 'Could not open this account for editing.'));
      }
    },
    [onError],
  );
  const closeEdit = useCallback(() => setEditing(null), []);

  const customers = useAppSelector((state) => state.customers.customers);
  const companies = useMemo(() => customers.map((customer) => ({ id: customer.id, name: customer.name })), [customers]);
  const [adding, setAdding] = useState<{ stage?: LifecycleValue } | null>(null);
  const openAdd = useCallback(
    (stage?: LifecycleValue) => {
      void dispatch(fetchCustomers());
      setAdding({ stage });
    },
    [dispatch],
  );
  const closeAdd = useCallback(() => setAdding(null), []);

  return { remember, nameOf, editing, openEdit, closeEdit, adding, openAdd, closeAdd, companies };
}
