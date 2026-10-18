import type { Account } from '../../../features/customers/customersSlice';
import { resolveScope, scopeProps, type ScopeProps } from '../../../features/organizations/detailScope';
import { CallsSection } from './CallsSection';
import { FilesSection } from './FilesSection';

type FilesCallsTabProps = ScopeProps & {
  account: string;
  accounts: Account[];
  isSm: boolean;
  /** Whether this tab is showing (it stays mounted, hidden, once visited). */
  active: boolean;
  /** Bumped when the Story's + Add logs a call, so the calls read again. */
  callsVersion?: number;
  /** A call was logged on this tab. */
  onCallLogged: () => void;
  onShowAll: () => void;
};

/** Files (spec 2026-09-27 §4; account spec §2.9): two sections, Files then
 *  Calls — the organization's own records and every visible account's,
 *  tagged and narrowed by the account chip, or one account's own. */
export function FilesCallsTab(props: FilesCallsTabProps) {
  const { account, accounts, isSm, active, callsVersion = 0, onCallLogged, onShowAll } = props;
  const where = scopeProps(resolveScope(props));
  return (
    <div className="flex flex-col gap-6">
      <FilesSection {...where} account={account} accounts={accounts} isSm={isSm} onShowAll={onShowAll} />
      <CallsSection
        {...where}
        account={account}
        accounts={accounts}
        isSm={isSm}
        active={active}
        version={callsVersion}
        onLogged={onCallLogged}
        onShowAll={onShowAll}
      />
    </div>
  );
}
