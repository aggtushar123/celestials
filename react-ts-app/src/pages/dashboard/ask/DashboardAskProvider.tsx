import { useCallback, useMemo, type ReactNode } from 'react';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { AskProvider } from './AskProvider';
import type { AskSurface } from './context';
import { useFilterNames } from './filterNames';
import { useDashboardContext } from './useDashboardContext';

/** The Dashboard's side of Ask: where the person is on it (read at send
 *  time, never figures), and chips named from the views' filter options.
 *  Sits inside FilterNamesProvider, where the old provider read the same.
 *  `surface` is memoised so AskProvider's value doesn't churn on every
 *  unrelated render. */
export function DashboardAskProvider({ children }: { children: ReactNode }) {
  const { context } = useDashboardContext();
  const names = useFilterNames();
  const chipLabel = useCallback((asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { dashboard: names }), [names]);
  const surface: AskSurface = useMemo(() => ({ name: 'dashboard', context, chipLabel }), [context, chipLabel]);
  return <AskProvider surface={surface}>{children}</AskProvider>;
}
