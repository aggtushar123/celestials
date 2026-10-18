import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BrainFrame } from '../../../components/brain/BrainFrame';
import { BrainTabs } from '../../../components/layout/BrainTabs';
import { PageHeader } from '../../../components/ui';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { ASK_AFTER_SCOPE, ASK_FROM_A_TAB, BRAIN_STARTERS, brainAskContext, brainAskTabOf } from '../../../features/brain/askContext';
import type { ScopeKey } from '../../../features/brain/brainTypes';
import { same } from '../../../lib/same';
import type { SurfaceContext } from '../../copilot/types';
import { BRAIN_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { BrainScopeReportContext, resolveBrainScope, type BrainScopeReport } from './brainScopeReport';

/** A Brain question's chip names only the tab and the scope, so it needs no
 *  names reported from a page; one function, so AskProvider's value doesn't churn. */
const chipLabel = (asked: SurfaceContext) => surfaceLabel(asked);

/** The Brain routes' Ask (brain ask spec §2.2): one conversation above every
 *  Brain page, through every tab and scope change. The frame and its rail
 *  (with the pill) sit here, beside the Outlet, so the rail is never
 *  remounted; each page's own BrainFrame inside passes its content straight
 *  through. The tab comes from the route and the scope from the page, once
 *  it settles; until then the context is null and the rail sends nothing.
 *  It also draws the Brain bar's title and tabs once (UI foundations spec
 *  §6.1), so a tab change or an opened request never redraws them. */
export function BrainAskLayout() {
  const { pathname, search } = useLocation();
  const [reported, setReported] = useState<BrainScopeReport | null>(null);
  // The last scope settled on any Brain path: a tab switch's fresh page
  // briefly reports nothing, so this stands in while the URL still names
  // the same scope (fix wave item 2), rather than flashing ASK_AFTER_SCOPE.
  const [lastScope, setLastScope] = useState<ScopeKey | null>(null);
  const report = useCallback((next: BrainScopeReport) => {
    if (next.scope !== null) setLastScope(next.scope);
    setReported((prev) => same<BrainScopeReport | null>(prev, next));
  }, []);
  const tab = brainAskTabOf(pathname);
  const urlScope = new URLSearchParams(search).get('scope');
  const scope = resolveBrainScope(reported, pathname, urlScope, lastScope);
  const context = useMemo(() => (tab !== null && scope !== null ? brainAskContext(tab, scope) : null), [tab, scope]);
  // Off the four tabs nothing can be asked at all; on one, nothing until the
  // page's scope settles.
  const unavailable = tab === null ? ASK_FROM_A_TAB : context === null ? ASK_AFTER_SCOPE : null;
  const surface: AskSurface = useMemo(
    () => ({ name: 'brain', context, chipLabel, unavailable, starters: context ? BRAIN_STARTERS[context.tab] : undefined }),
    [context, unavailable],
  );
  return (
    <BrainScopeReportContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={BRAIN_ASK_KEY}>
        <BrainFrame rail={<AskRail />} scrollKey={pathname}>
          <PageHeader title="Brain" tabs={<BrainTabs />} />
          <Outlet />
        </BrainFrame>
      </AskProvider>
    </BrainScopeReportContext.Provider>
  );
}
