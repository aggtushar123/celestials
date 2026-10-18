import { accountsPath } from '../../../features/accounts/askContext';
import { brainPath } from '../../../features/brain/askContext';
import { contactsPath } from '../../../features/contacts/askContext';
import { organizationsPath } from '../../../features/organizations/askContext';
import { detailPath } from '../../../features/organizations/detailAskContext';
import { pipelinesPath } from '../../../features/pipelines/askContext';
import type { DashboardOrigin, SurfaceOrigin } from '../../copilot/types';
import { toQuery } from '../shared/useDashboardFilters';

/** A dashboard view with its shared filters. A missing view lands on the
 *  area, which redirects to its first view. */
function dashboardPath(origin: DashboardOrigin): string {
  const path =
    origin.area === 'overview'
      ? '/dashboard/overview'
      : origin.view
        ? `/dashboard/${origin.area}/${origin.view}`
        : `/dashboard/${origin.area}`;
  const query = toQuery({ owner: origin.filters.owner, lifecycle: origin.filters.lifecycle, customer: origin.filters.customer });
  return query ? `${path}?${query}` : path;
}

/** The page a conversation started on, with its filters: a dashboard view,
 *  the Organizations list or board, an organisation's page with its account
 *  chip, a Contacts person or filtered list, an Accounts List, Board or
 *  account, or a Pipelines view with its kind. */
export function originPath(origin: SurfaceOrigin): string {
  if (origin.surface === 'brain') return brainPath(origin);
  if (origin.surface === 'pipelines') return pipelinesPath(origin);
  if (origin.surface === 'accounts') return accountsPath(origin);
  if (origin.surface === 'contacts') return contactsPath(origin);
  if (origin.surface === 'dashboard') return dashboardPath(origin);
  return origin.view === 'detail' ? detailPath(origin) : organizationsPath(origin);
}
