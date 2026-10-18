import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubAccountPage, type AccountPageStub } from '../../../features/accounts/testAccountPage';
import { stubAccountsPortfolio, type AccountsStub } from '../../../features/accounts/testPortfolio';

/** Test-only. The Accounts portfolio (stubAccountsPortfolio), the account
 *  page (stubAccountPage, which hands everything else to the portfolio) and
 *  the Copilot (stubCopilot) behind one fetch, so every page and its rail
 *  answer. `copilot` is the spy postedBodies reads. The page stub answers
 *  `/accounts/portfolio/?ids=…` itself, so list tests here don't filter by
 *  `ids`. */
export function stubAccountsAsk(
  options: { copilot?: Parameters<typeof stubCopilot>[0]; portfolio?: AccountsStub; page?: AccountPageStub } = {},
) {
  const copilot = stubCopilot(options.copilot);
  const portfolio = stubAccountsPortfolio(options.portfolio);
  const page = stubAccountPage({ ...options.page, fallback: portfolio });
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : page(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, portfolio, page, release: copilot.release };
}
