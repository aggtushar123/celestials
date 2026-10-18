import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import type { Account } from '../../../features/customers/customersSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { DetailTiles } from '../../organizations/detail/HeaderTiles';
import { AccountPulseBreakdown } from './AccountPulseBreakdown';

/** The account page's four tiles (spec 2026-09-29 §2.3): ARR in the
 *  workspace's currency, Renewal to the Commercial panel (where an account's
 *  renewal date lives), Health opening the account pulse. */
export function AccountTiles({
  row,
  currency,
  account,
  accountError,
  onJump,
}: {
  row: AccountPortfolioRow;
  currency: CurrencyCode;
  /** GET /accounts/<id>/; null while it loads or when it failed. */
  account: Account | null;
  accountError: string | null;
  onJump: (panel: PanelKey) => void;
}) {
  const arr = row.arr == null ? '—' : formatCompactMoney(row.arr, currency);
  return (
    <DetailTiles
      row={row}
      arr={arr}
      arrNote={`Annual, in ${currency}`}
      renewalPanel="commercial"
      breakdownWord="account pulse"
      breakdown={(id) => <AccountPulseBreakdown id={id} pulse={account?.account_pulse ?? null} error={accountError} />}
      onJump={onJump}
    />
  );
}
