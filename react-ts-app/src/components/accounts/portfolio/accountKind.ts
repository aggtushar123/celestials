import { createElement } from 'react';
import { updateAccount } from '../../../features/customers/customersSlice';
import {
  ACCOUNT_BOARD_GROUP_OPTIONS,
  ACCOUNT_GROUP_OPTIONS,
  ACCOUNT_NOUN,
  ACCOUNT_SORT_OPTIONS,
  organisationText,
} from '../../../features/accounts/accountFields';
import { fetchAccountPortfolio } from '../../../features/accounts/portfolioApi';
import { ACCOUNT_PARAMS } from '../../../features/accounts/portfolioParams';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { hasFilters } from '../../../features/organizations/portfolioParams';
import type { PortfolioKind } from '../../organizations/portfolio/portfolioKind';
import { touchText } from '../../organizations/portfolio/rowParts';
import { AccountPanels } from './AccountPanels';

/** The Accounts portfolio (spec 2026-09-29 §1): GET /accounts/portfolio/,
 *  nothing hidden for churn (Churn is an ordinary stage, with no form of its
 *  own), organisation as a filter, four panels. A move saves through the
 *  single-account PATCH on the first linked organisation the viewer may
 *  open. */
export const ACCOUNT_KIND: PortfolioKind<AccountPortfolioRow> = {
  noun: ACCOUNT_NOUN,
  nameField: 'account',
  params: ACCOUNT_PARAMS,
  sortOptions: ACCOUNT_SORT_OPTIONS,
  groupOptions: ACCOUNT_GROUP_OPTIONS,
  boardGroupOptions: ACCOUNT_BOARD_GROUP_OPTIONS,
  filters: { product: false, organisation: true, churned: false },
  renewalWindow: '90',
  pulseValueField: 'aiPulseValue csmPulseScore',
  churnByModal: false,
  fetch: (query) => fetchAccountPortfolio(query),
  // No churn to scope: M is the whole visible book.
  totalQuery: (params) => (hasFilters(params) ? 'limit=1' : null),
  churnVisible: () => true,
  saveStage: (row, to, dispatch) => {
    // `editable` keeps Move to… off such a row; this only guards the type.
    if (!row.organisation) return Promise.reject(`${row.name} has no organization you can open.`);
    return dispatch(updateAccount({ customerId: row.organisation.id, id: row.id, lifecycle_stage: to })).unwrap();
  },
  addsTo: () => true,
  // Editing and moving address /customers/<cid>/accounts/<id>/, which needs
  // a linked organisation the viewer may open.
  editable: (row) => row.organisation !== null,
  href: (row) => `/accounts/${row.id}`,
  // The account page reads everything from its URL id (spec 2026-09-29 §2).
  linkState: () => undefined,
  subtitle: (row) => {
    const organisation = organisationText(row);
    return [
      ...(organisation ? [{ text: organisation }] : []),
      { text: row.owner?.name ?? 'Unassigned', field: 'owner' },
      { text: row.lifecycle.label, field: 'lifecycleStage' },
      { text: touchText(row.last_touch_days) },
    ];
  },
  cardSubtitle: (row) => organisationText(row) ?? row.owner?.name ?? 'Unassigned',
  status: () => null,
  renderDetails: (props) => createElement(AccountPanels, props),
};
