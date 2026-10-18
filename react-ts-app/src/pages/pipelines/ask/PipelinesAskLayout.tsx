import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { pipelinesContextOf, type PipelinesNames } from '../../../features/pipelines/askContext';
import { same } from '../../../lib/same';
import { PIPELINES_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { OrganizationsFrame } from '../../organizations/OrganizationsFrame';
import { PipelinesNamesContext } from './pipelinesNames';

/** The Pipelines routes' Ask (spec 2026-09-30 §3): one conversation above
 *  the List and the Board, for both kinds, so it lasts through every view,
 *  kind and filter change. The frame and its rail (with the pill) sit here,
 *  beside the Outlet, so a route or kind change never remounts the rail;
 *  each page's own OrganizationsFrame inside passes its content straight
 *  through. */
export function PipelinesAskLayout() {
  const { pathname, search } = useLocation();
  const context = useMemo(() => pipelinesContextOf(pathname, search), [pathname, search]);
  const [names, setNames] = useState<PipelinesNames | null>(null);
  // A report that changes nothing keeps the same object, so the chip's
  // callback, and AskProvider's value, don't churn.
  const report = useCallback((next: PipelinesNames) => setNames((prev) => same<PipelinesNames | null>(prev, next)), []);
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { pipelines: names }),
    [names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'pipelines', context, chipLabel }), [context, chipLabel]);
  // Another view or kind starts at the top of the shared scroll column (a
  // view change remounted the page before Ask; a kind change now does the
  // same); a filter change keeps the place.
  const scrollKey = context ? `${context.view}:${context.kind}` : null;
  return (
    <PipelinesNamesContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={PIPELINES_ASK_KEY}>
        <OrganizationsFrame rail={<AskRail />} scrollKey={scrollKey}>
          <Outlet />
        </OrganizationsFrame>
      </AskProvider>
    </PipelinesNamesContext.Provider>
  );
}
