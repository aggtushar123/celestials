import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePortfolioParams } from '../../../components/organizations/portfolio/usePortfolioParams';
import { defaultGroupOf, toContextFilters } from '../../../features/organizations/askContext';
import { detailContext, detailIdOf } from '../../../features/organizations/detailAskContext';
import { parseDetailParams } from '../../../features/organizations/detailParams';
import { boardParams } from '../../../features/organizations/portfolioParams';
import type { OrganizationDetailContext, OrganizationsContext, OrganizationsView } from '../../copilot/types';

/** Which Organizations page a URL shows: the List, the Board, one
 *  organisation's page, or null for any other. */
export function parseOrganizationsView(pathname: string): OrganizationsView | 'detail' | null {
  if (pathname === '/organizations/list') return 'list';
  if (pathname === '/organizations/board') return 'board';
  if (detailIdOf(pathname) !== null) return 'detail';
  return null;
}

/** Where the person is on Organizations, as the server needs it (spec §3):
 *  on the List and the Board the view and the portfolio's params as that
 *  page reads them (the Board's with its lifecycle default, never ungrouped);
 *  on an organisation's page its id and the account chip. Never figures or
 *  names: the server recomputes the page. Null off these routes. */
export function useOrganizationsContext(): OrganizationsContext | OrganizationDetailContext | null {
  const { pathname, search } = useLocation();
  const view = parseOrganizationsView(pathname);
  const { params } = usePortfolioParams(defaultGroupOf(view === 'board' ? 'board' : 'list'));
  // The page's context changes only with the organisation or the account it
  // carries, not with every story filter or search keystroke.
  const organization = detailIdOf(pathname);
  const account = organization === null ? null : detailContext(organization, parseDetailParams(new URLSearchParams(search))).account;
  // On the detail view, `params` is not a dependency: the page's context is
  // only its organisation and account, so a story filter or search keystroke
  // (which changes `params`' identity, not these) never rebuilds it.
  const listParams = view === 'detail' ? null : params;
  return useMemo(() => {
    if (!view) return null;
    if (view === 'detail') return { surface: 'organizations', view, organization: organization!, account, focus: null };
    const shown = view === 'board' ? boardParams(listParams!) : listParams!;
    return { surface: 'organizations', view, filters: toContextFilters(shown, view), focus: null };
  }, [view, listParams, organization, account]);
}
