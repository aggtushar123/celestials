import type { ParamSpec } from '../organizations/portfolioParams';

/** The Accounts portfolio's URL parameters (backend #74): organisation
 *  instead of product, no churned switch, five sorts and four groups. */
export const ACCOUNT_PARAMS: ParamSpec = {
  sortKeys: ['risk', 'arr', 'renewal', 'health', 'name'],
  groupKeys: ['health', 'lifecycle', 'owner', 'renewal'],
  product: false,
  churned: false,
  organisation: true,
};
