// Thin apiFetch wrappers over revenact-backend's Accounts portfolio endpoints (backend #74).
import { apiFetch } from '../../lib/apiClient';
import { downloadAttachment } from '../files/filesSlice';
import { localDay } from '../organizations/storyDays';
import type { BulkResult } from '../organizations/portfolioTypes';
import type { AccountBulkRequest, AccountPortfolioResponse } from './portfolioTypes';

export const ACCOUNTS_PORTFOLIO_PATH = '/accounts/portfolio/';

export function fetchAccountPortfolio(query: string): Promise<AccountPortfolioResponse> {
  return apiFetch<AccountPortfolioResponse>(query ? `${ACCOUNTS_PORTFOLIO_PATH}?${query}` : ACCOUNTS_PORTFOLIO_PATH);
}

/** Every row of the query as CSV with every Account field, fetched with
 *  the session's token (the API never exposes a URL a plain link could open).
 *  Named for the viewer's own calendar day, not UTC's. */
export function exportAccountPortfolio(query: string, today: Date = new Date()): Promise<void> {
  const path = query ? `${ACCOUNTS_PORTFOLIO_PATH}export.csv?${query}` : `${ACCOUNTS_PORTFOLIO_PATH}export.csv`;
  return downloadAttachment({ download_url: path, name: `accounts-${localDay(today)}.csv` });
}

export function bulkUpdateAccounts(body: AccountBulkRequest): Promise<BulkResult> {
  return apiFetch<BulkResult>('/accounts/bulk/', { method: 'POST', body });
}
