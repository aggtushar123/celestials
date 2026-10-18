import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { accountIdOf, accountsViewOf, NO_ACCOUNTS_NAMES, type AccountsNames } from '../../../features/accounts/askContext';
import { same } from '../../../lib/same';
import { ACCOUNTS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { OrganizationsFrame } from '../../organizations/OrganizationsFrame';
import { AccountsNamesContext } from './accountsNames';
import { useAccountsContext } from './useAccountsContext';

/** The Accounts routes' Ask (spec 2026-09-29 §3): one conversation above the
 *  List, the Board and every account's page, so it lasts from the List into
 *  an account and back, through every filter. The frame and its rail (with
 *  the pill) sit here, beside the Outlet, so a route change never remounts
 *  the rail; each page's own OrganizationsFrame inside passes its content
 *  straight through. On an account's page the frame is the `bleed` variant,
 *  as the page draws it on its own. */
export function AccountsAskLayout() {
  const { pathname } = useLocation();
  const context = useAccountsContext();
  const [names, setNames] = useState<AccountsNames>(NO_ACCOUNTS_NAMES);
  // A report that changes nothing keeps the same object, so the chip's
  // callback, and AskProvider's value, don't churn.
  const report = useCallback((patch: Partial<AccountsNames>) => setNames((prev) => same(prev, { ...prev, ...patch })), []);
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { accounts: names }),
    [names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'accounts', context, chipLabel }), [context, chipLabel]);
  // Another account, or the List or the Board, starts at the top of the
  // shared scroll column; a tab or query change does not.
  const view = accountsViewOf(pathname);
  const scrollKey = view === 'detail' ? `detail:${accountIdOf(pathname) ?? pathname}` : view;
  return (
    <AccountsNamesContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={ACCOUNTS_ASK_KEY}>
        <OrganizationsFrame rail={<AskRail />} bleed={view === 'detail'} scrollKey={scrollKey}>
          <Outlet />
        </OrganizationsFrame>
      </AskProvider>
    </AccountsNamesContext.Provider>
  );
}
