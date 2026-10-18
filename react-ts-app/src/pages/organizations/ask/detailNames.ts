import { createContext, useContext, useEffect } from 'react';
import type { DetailNames } from '../../../features/organizations/detailAskContext';

/** Only the organisation page knows its name and its accounts' names, so it
 *  reports them here, and a live question's chip can say "Pizza Hut · EMEA"
 *  before the server has labelled it. Null outside OrganizationsAskLayout. */
export const DetailNamesContext = createContext<((names: DetailNames) => void) | null>(null);

export function useReportDetailNames(names: DetailNames | null): void {
  const report = useContext(DetailNamesContext);
  useEffect(() => {
    if (report && names) report(names);
  }, [report, names]);
}
