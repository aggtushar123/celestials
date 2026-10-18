import { createContext, useContext, useEffect } from 'react';
import type { PortfolioResponse } from '../../../features/organizations/portfolioTypes';

export type PortfolioOptions = PortfolioResponse['filters'];

/** Only the List and the Board see the portfolio's filter options, so each
 *  reports its last read's here, and the Ask chips can say "Owner: Carl CSM"
 *  rather than "Owner: User 2". Null outside OrganizationsAskLayout. */
export const PortfolioOptionsContext = createContext<((options: PortfolioOptions) => void) | null>(null);

export function useReportPortfolioOptions(options: PortfolioOptions | null): void {
  const report = useContext(PortfolioOptionsContext);
  useEffect(() => {
    if (report && options) report(options);
  }, [report, options]);
}
