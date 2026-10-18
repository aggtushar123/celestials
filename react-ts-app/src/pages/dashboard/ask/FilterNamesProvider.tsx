import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FilterNames, SharedFilterKey } from '../../../components/copilot/dashboardLabels';
import { FilterNamesContext } from './filterNames';

export function FilterNamesProvider({ children }: { children: ReactNode }) {
  const [names, setNames] = useState<FilterNames>({});
  const report = useCallback((key: SharedFilterKey, next: Record<string, string>) => {
    setNames((prev) => {
      // A view still loading reports no options; keep what is known rather
      // than blanking the chip for a moment.
      if (Object.keys(next).length === 0) return prev;
      if (JSON.stringify(prev[key]) === JSON.stringify(next)) return prev;
      return { ...prev, [key]: next };
    });
  }, []);
  const value = useMemo(() => ({ names, report }), [names, report]);
  return <FilterNamesContext.Provider value={value}>{children}</FilterNamesContext.Provider>;
}
