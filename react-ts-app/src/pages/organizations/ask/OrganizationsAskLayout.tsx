import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { detailIdOf, type DetailNames } from '../../../features/organizations/detailAskContext';
import { same } from '../../../lib/same';
import { ORGANIZATIONS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { OrganizationsFrame } from '../OrganizationsFrame';
import { DetailNamesContext } from './detailNames';
import { PortfolioOptionsContext, type PortfolioOptions } from './portfolioOptions';
import { parseOrganizationsView, useOrganizationsContext } from './useOrganizationsContext';

/** The Organizations routes' Ask (spec §3): one conversation above the List,
 *  the Board and every organisation's page, so it lasts from the List into
 *  an organisation and back, through every filter. The frame and its rail
 *  (with the pill) sit here too, beside the Outlet, so the rail is never
 *  remounted by a route change: react-router applies that change in a
 *  transition, after a History pick's conversation has already shown. On an
 *  organisation's page the frame is the page's own `bleed` variant, so the
 *  page keeps its full width and 24px gutter while the rail is closed. */
export function OrganizationsAskLayout() {
  const { pathname } = useLocation();
  const context = useOrganizationsContext();
  const [options, setOptions] = useState<PortfolioOptions | null>(null);
  const [names, setNames] = useState<DetailNames | null>(null);
  const report = useCallback((next: PortfolioOptions) => setOptions((prev) => same(prev, next)), []);
  const reportNames = useCallback((next: DetailNames) => setNames((prev) => same(prev, next)), []);
  // Stable across renders that don't change `context`, `options` or `names`,
  // so AskProvider's value doesn't churn on every unrelated render (spec:
  // a send must not re-render the whole List).
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { organizations: options, detail: names }),
    [options, names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'organizations', context, chipLabel }), [context, chipLabel]);
  // The page in the shared scroll column: another organisation, or the List
  // or the Board, starts at the top; a tab or query change does not.
  const view = parseOrganizationsView(pathname);
  const scrollKey = view === 'detail' ? `detail:${detailIdOf(pathname)}` : view;
  return (
    <PortfolioOptionsContext.Provider value={report}>
      <DetailNamesContext.Provider value={reportNames}>
        <AskProvider surface={surface} preferenceKey={ORGANIZATIONS_ASK_KEY}>
          <OrganizationsFrame rail={<AskRail />} bleed={view === 'detail'} scrollKey={scrollKey}>
            <Outlet />
          </OrganizationsFrame>
        </AskProvider>
      </DetailNamesContext.Provider>
    </PortfolioOptionsContext.Provider>
  );
}
