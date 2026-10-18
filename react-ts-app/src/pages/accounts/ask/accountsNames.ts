import { createContext, useContext, useEffect } from 'react';
import type { AccountsNames } from '../../../features/accounts/askContext';
import type { AccountFilterOptions } from '../../../features/accounts/portfolioTypes';

/** Only the pages know what they loaded: the List and the Board their
 *  portfolio read's filter options, the account page its row's name. Each
 *  reports its part here, so a live question's chip can name them before the
 *  server has. Null outside AccountsAskLayout. */
export const AccountsNamesContext = createContext<((patch: Partial<AccountsNames>) => void) | null>(null);

export function useReportAccountsOptions(options: AccountFilterOptions | null): void {
  const report = useContext(AccountsNamesContext);
  useEffect(() => {
    if (report && options) report({ options });
  }, [report, options]);
}

/** `name` is '' until the row lands: nothing is reported until then. */
export function useReportAccountName(id: number, name: string): void {
  const report = useContext(AccountsNamesContext);
  useEffect(() => {
    if (report && name) report({ account: { id, name } });
  }, [report, id, name]);
}
