import type { CurrencyCode } from '../../../features/auth/authSlice';
import { fetchAccountPortfolio } from '../../../features/accounts/portfolioApi';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import type { Account } from '../../../features/customers/customersSlice';
import { useDetailRecord, type DetailSource } from '../../organizations/detail/useDetailRecord';

export interface AccountState {
  /** The Accounts list's row for this account; null until it lands, or when
   *  not found. The last one that landed stays while a reload runs or fails. */
  row: AccountPortfolioRow | null;
  /** The workspace's currency, which the row's ARR is in. */
  currency: CurrencyCode;
  /** GET /accounts/<id>/: the owner and their function, the account pulse and the edit form's record. */
  account: Account | null;
  /** The row for the current id and version has not landed (or failed) yet. */
  loading: boolean;
  /** Not a number, or the viewer may not open it (no row for its id). */
  notFound: boolean;
  error: string | null;
  accountError: string | null;
  retry: () => void;
}

const ACCOUNT_SOURCE: DetailSource<AccountPortfolioRow, CurrencyCode> = {
  readRow: (id) =>
    fetchAccountPortfolio(new URLSearchParams({ ids: String(id), limit: '1' }).toString()).then((data) => ({
      row: data.results.find((row) => row.id === id) ?? null,
      extra: data.currency,
    })),
  recordPath: (id) => `/accounts/${id}/`,
  rowError: 'Could not load this account.',
  recordError: "Could not load this account's record.",
};

/** The account page's two reads (spec 2026-09-29 §2), by the URL id alone
 *  and fired together: the portfolio row by `ids` and the record. A new
 *  `version` (after an edit or an owner change) reloads both while the old
 *  row stays on screen; a row for another id never shows. */
export function useAccount(id: number | null, version: number): AccountState {
  const state = useDetailRecord<AccountPortfolioRow, CurrencyCode, Account>(id, version, ACCOUNT_SOURCE);
  return {
    row: state.row,
    // Only read beside a row; USD stands in while there is none to price.
    currency: state.extra ?? 'USD',
    account: state.record,
    loading: state.loading,
    notFound: state.notFound,
    error: state.error,
    accountError: state.recordError,
    retry: state.retry,
  };
}
