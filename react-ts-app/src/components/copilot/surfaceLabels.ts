import { accountsLabel, type AccountsNames } from '../../features/accounts/askContext';
import { brainLabel } from '../../features/brain/askContext';
import { contactsLabel, type ContactsNames } from '../../features/contacts/askContext';
import { organizationsLabel } from '../../features/organizations/askContext';
import { detailLabel, type DetailNames } from '../../features/organizations/detailAskContext';
import type { PortfolioResponse } from '../../features/organizations/portfolioTypes';
import { pipelinesLabel, type PipelinesNames } from '../../features/pipelines/askContext';
import type { ConversationSummary, SurfaceContext } from '../../pages/copilot/types';
import { contextLabel, viewLabel, type FilterNames } from './dashboardLabels';

/** What each surface names its filter values with: the dashboard views'
 *  filter options, the portfolio's `filters` options, the names the
 *  organisation page reports, the names the Contacts page reports, the
 *  names the Accounts pages report, and the names the Pipelines List or
 *  Board reports. */
export interface SurfaceNames {
  dashboard?: FilterNames;
  organizations?: PortfolioResponse['filters'] | null;
  detail?: DetailNames | null;
  contacts?: ContactsNames | null;
  /** What the Accounts pages report: filter options and the open account's name. */
  accounts?: AccountsNames | null;
  /** What the Pipelines List or Board reports: its read's filter options and their kind. */
  pipelines?: PipelinesNames | null;
}

/** A question's chip, on whichever surface it was asked. */
export function surfaceLabel(context: SurfaceContext, names: SurfaceNames = {}): string {
  if (context.surface === 'brain') return brainLabel(context);
  if (context.surface === 'pipelines') return pipelinesLabel(context, names.pipelines ?? null);
  if (context.surface === 'accounts') return accountsLabel(context, names.accounts ?? null);
  if (context.surface === 'contacts') return contactsLabel(context, names.contacts ?? null);
  if (context.surface === 'dashboard') return contextLabel(context, names.dashboard);
  if (context.view === 'detail') return detailLabel(context, names.detail ?? null);
  return organizationsLabel(context, names.organizations ?? null);
}

/** History's tag for a conversation: a dashboard one's area and view; an
 *  Organizations list or board one's is "Organizations" followed by the
 *  server's own `labels` (it knows the owner's name), joined with " · "; an
 *  organisation page's is the server's `label`, "Pizza Hut" or "Pizza Hut ·
 *  EMEA"; a Contacts one's is the server's own `label` too; an Accounts one's
 *  is the server's `label` ("Accounts · Renews within 30 days", "EMEA"); a
 *  Pipelines one's is the server's `label` ("Pipelines · Risks · Priority:
 *  High"). Null for a conversation started anywhere else. */
export function originTag(summary: Pick<ConversationSummary, 'origin'>): string | null {
  const { origin } = summary;
  if (!origin) return null;
  // A Brain origin carries no server label: the tab and scope name it.
  if (origin.surface === 'brain') return brainLabel(origin);
  if (origin.surface === 'dashboard') return viewLabel(origin.area, origin.view);
  // Contacts, Accounts and Pipelines store one server-built label: the tag is that label.
  if (origin.surface === 'contacts' || origin.surface === 'accounts' || origin.surface === 'pipelines') return origin.label;
  if (origin.view === 'detail') return origin.label;
  return ['Organizations', ...origin.labels].join(' · ');
}
