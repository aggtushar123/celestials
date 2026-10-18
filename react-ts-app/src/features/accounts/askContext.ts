import type {
  AccountDetailContext,
  AccountDetailOrigin,
  AccountsFilters,
  AccountsListContext,
  AccountsListOrigin,
  OrganizationsView,
} from '../../pages/copilot/types';
import { defaultGroupOf, fromContextFilters, viewPath } from '../organizations/askContext';
import { storyFocusLabel } from '../organizations/detailAskContext';
import { filterChips } from '../organizations/filterChips';
import { boardParams, parseParams, toUrlSearch, type PortfolioParams } from '../organizations/portfolioParams';
import { parseAccountId } from './accountPageParams';
import { ACCOUNT_PARAMS } from './portfolioParams';
import type { AccountFilterOptions } from './portfolioTypes';

// Ask Revenact on Accounts (spec 2026-09-29 §3): the context a question
// carries, its live chip, and the page a History pick reopens.

const SEPARATOR = ' · ';
const LIST = /^\/accounts\/list\/?$/;
const BOARD = /^\/accounts\/board\/?$/;
// …/plans/new is the New plan modal over this page (plans spec §2.2).
const ONE = /^\/accounts\/([^/]+)(?:\/plans\/new)?\/?$/;

export type AccountsView = OrganizationsView | 'detail';

/** Which Accounts page a path shows. Any other single segment is an
 *  account's page, as the router reads `/accounts/:id` (a non-numeric one
 *  shows "Account not found" there). Null off these routes. */
export function accountsViewOf(pathname: string): AccountsView | null {
  if (LIST.test(pathname)) return 'list';
  if (BOARD.test(pathname)) return 'board';
  return ONE.test(pathname) ? 'detail' : null;
}

/** `/accounts/12` gives 12; a non-numeric id, or any other path, null. The
 *  page reads its id with the same rule (`parseAccountId`). */
export function accountIdOf(pathname: string): number | null {
  if (accountsViewOf(pathname) !== 'detail') return null;
  return parseAccountId(ONE.exec(pathname)![1]);
}

/** The params as a question carries them: the page's own URL query, so only
 *  the set keys, the default sort and the view's own default group left out.
 *  The URL's `group=none` is sent as `''`. The Board reads the List's None
 *  as lifecycle, its default, so it never sends `''`. */
export function toAccountsFilters(p: PortfolioParams, view: OrganizationsView): AccountsFilters {
  const shown = view === 'board' ? boardParams(p) : p;
  const filters: AccountsFilters = Object.fromEntries(toUrlSearch(shown, defaultGroupOf(view)));
  if (filters.group === 'none') filters.group = '';
  return filters;
}

/** Filters back to params, through the page's own parser (Organizations'
 *  `fromContextFilters`, parameterised by Accounts' own `ParamSpec`), so a
 *  value the page would not read is dropped the same way. */
export function fromAccountsFilters(filters: AccountsFilters, view: OrganizationsView): PortfolioParams {
  return fromContextFilters(filters, view, ACCOUNT_PARAMS);
}

/** Where the person is on Accounts, as the server needs it: the view and its
 *  filters, or one account's id. Never a name or a figure: the server
 *  recomputes the page. Null off these routes and on a non-numeric id. */
export function accountsContextOf(pathname: string, search: string): AccountsListContext | AccountDetailContext | null {
  const view = accountsViewOf(pathname);
  if (view === null) return null;
  if (view === 'detail') {
    const account = accountIdOf(pathname);
    return account === null ? null : { surface: 'accounts', view, account, focus: null };
  }
  const params = parseParams(new URLSearchParams(search), defaultGroupOf(view), ACCOUNT_PARAMS);
  return { surface: 'accounts', view, filters: toAccountsFilters(params, view) };
}

/** What the pages report, so a live question's chip can name things before
 *  the server has: the List's or Board's filter options (from the viewer's
 *  own portfolio read) and the open account's name (from its own row). */
export interface AccountsNames {
  options: AccountFilterOptions | null;
  account: { id: number; name: string } | null;
}

export const NO_ACCOUNTS_NAMES: AccountsNames = { options: null, account: null };

/** The chip. A stored context's `label` is the server's and wins. A live one
 *  uses the page's own words: "Accounts" and the toolbar's filter chips, or
 *  the account row's name ("This account" until it lands). The focus is
 *  never in `label`, so it is always named from `focus`. */
export function accountsLabel(context: AccountsListContext | AccountDetailContext, names: AccountsNames | null = null): string {
  if (context.view !== 'detail') {
    if (context.label) return context.label;
    const chips = filterChips(fromAccountsFilters(context.filters ?? {}, context.view), names?.options ?? null);
    return ['Accounts', ...chips.map((chip) => chip.label)].join(SEPARATOR);
  }
  const named = names?.account?.id === context.account ? names.account.name : null;
  const base = context.label ?? named ?? 'This account';
  return context.focus ? `${base}${SEPARATOR}${storyFocusLabel(context.focus)}` : base;
}

/** Where a conversation started on Accounts reopens. The List and the Board
 *  reuse Organizations' `viewPath` (base `'accounts'`) rather than copying
 *  it: `/accounts/list`, not `/accounts`, whose redirect drops the query.
 *  The stored "None" (`group: ''`) is the URL's `group=none`. */
export function accountsPath(origin: AccountsListOrigin | AccountDetailOrigin): string {
  if (origin.view === 'detail') return `/accounts/${origin.account}`;
  return viewPath('accounts', origin.view, origin.filters);
}
