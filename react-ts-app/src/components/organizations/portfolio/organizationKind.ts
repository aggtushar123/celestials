import { createElement } from 'react';
import { updateCustomer } from '../../../features/customers/customersSlice';
import { fetchPortfolio } from '../../../features/organizations/portfolioApi';
import { PORTFOLIO_FIELDS, SORT_OPTIONS } from '../../../features/organizations/portfolioFields';
import { BOARD_GROUP_OPTIONS, GROUP_OPTIONS } from '../../../features/organizations/portfolioGroups';
import { ORGANIZATION_NOUN } from '../../../features/organizations/portfolioLabels';
import { ORGANIZATION_PARAMS, hasFilters, includesChurned } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { AccountDetails } from './AccountDetails';
import type { PortfolioKind } from './portfolioKind';
import { touchText } from './rowParts';

/** Organizations' portfolio, exactly as its pages have always behaved:
 *  GET /organizations/portfolio/, churned hidden unless asked for, Churn
 *  through its own modal, the six panels, the organization page. */
export const ORGANIZATION_KIND: PortfolioKind<PortfolioRow> = {
  noun: ORGANIZATION_NOUN,
  nameField: 'organization',
  params: ORGANIZATION_PARAMS,
  sortOptions: SORT_OPTIONS,
  groupOptions: GROUP_OPTIONS,
  boardGroupOptions: BOARD_GROUP_OPTIONS,
  filters: { product: true, organisation: false, churned: true },
  renewalWindow: '30',
  churnByModal: true,
  fetch: (query) => fetchPortfolio(query),
  totalQuery: (params) => (hasFilters(params) ? (includesChurned(params) ? 'include_churned=1&limit=1' : 'limit=1') : null),
  churnVisible: (params) => includesChurned(params),
  saveStage: (row, to, dispatch) => dispatch(updateCustomer({ id: row.id, lifecycle_stage: to })).unwrap(),
  // Churn has its own modal, one organisation at a time (ruling R2).
  addsTo: (stage) => stage !== 'churn',
  editable: () => true,
  href: (row) => `/organizations/${row.id}`,
  linkState: () => undefined,
  subtitle: (row) => [
    { text: PORTFOLIO_FIELDS.owner.value(row), field: 'owner' },
    { text: row.lifecycle.label, field: 'lifecycleStage' },
    { text: touchText(row.last_touch_days) },
  ],
  cardSubtitle: (row) => PORTFOLIO_FIELDS.owner.value(row),
  status: (row) => (row.is_archived ? 'Archived' : row.churned ? 'Churned' : null),
  renderDetails: ({ row, id, today, onEdit, stacked }) => createElement(AccountDetails, { row, id, today, onEdit, stacked }),
};
