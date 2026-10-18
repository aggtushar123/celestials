import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { accountsContextOf, accountsViewOf } from '../../../features/accounts/askContext';
import type { AccountDetailContext, AccountsListContext } from '../../copilot/types';

/** Where the person is on Accounts, as the server needs it (spec §3). On an
 *  account's page the query (its tab and story filters) is not part of it,
 *  so a tab switch or a story filter never rebuilds the context. */
export function useAccountsContext(): AccountsListContext | AccountDetailContext | null {
  const { pathname, search } = useLocation();
  const query = accountsViewOf(pathname) === 'detail' ? '' : search;
  return useMemo(() => accountsContextOf(pathname, query), [pathname, query]);
}
