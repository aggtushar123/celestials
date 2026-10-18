// Pinned to a non-UTC, non-DST zone (IST, UTC+5:30) so the export test's
// timezone assertions can actually fail on a UTC CI runner. Set before any
// Date is used; Node re-reads process.env.TZ on every local-time
// computation (storyDays.test.ts does the same).
process.env.TZ = 'Asia/Kolkata';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdateAccounts, exportAccountPortfolio, fetchAccountPortfolio } from './portfolioApi';
import { accountPortfolioQueries, stubAccountsPortfolio } from './testPortfolio';

describe('the Accounts portfolio API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads GET /accounts/portfolio/ with the query it is given', async () => {
    const spy = stubAccountsPortfolio();
    const data = await fetchAccountPortfolio('group=lifecycle&sort=-risk');
    const [query] = accountPortfolioQueries(spy);
    expect(query.get('group')).toBe('lifecycle');
    expect(query.get('sort')).toBe('-risk');
    // Nothing is hidden for churn: Initech APAC (Churn) is in the book.
    expect(data.results.map((row) => row.id)).toEqual([12, 13, 14]);
    expect(data.filters.organisations.map((option) => option.name)).toEqual(['Globex', 'Pizza Hut', 'Yum Brands']);
  });

  it('reads the bare path when there is no query', async () => {
    const spy = stubAccountsPortfolio();
    await fetchAccountPortfolio('');
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/v1\/accounts\/portfolio\/$/);
  });

  it('posts a bulk edit and returns what was updated and what failed', async () => {
    const spy = stubAccountsPortfolio({
      bulk: (body) => ({ updated: [body.ids[0]], failed: [{ id: body.ids[1], reason: 'Not found.' }] }),
    });
    const result = await bulkUpdateAccounts({ ids: [12, 13], action: 'set_lifecycle', value: 'churn' });
    expect(result).toEqual({ updated: [12], failed: [{ id: 13, reason: 'Not found.' }] });
    const call = spy.mock.calls.find(([input]) => String(input).endsWith('/accounts/bulk/'));
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ids: [12, 13], action: 'set_lifecycle', value: 'churn' });
  });

  it.each([
    ['just after local midnight', new Date(2026, 8, 29, 0, 30)],
    ['just before local midnight', new Date(2026, 8, 29, 23, 30)],
  ])("downloads the export through the session, named for the viewer's own calendar day (%s)", async (_label, today) => {
    const spy = stubAccountsPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await exportAccountPortfolio('organisation=7&sort=-arr', today);

    const call = spy.mock.calls.find(([input]) => String(input).includes('/accounts/portfolio/export.csv'));
    expect(String(call?.[0])).toContain('export.csv?organisation=7&sort=-arr');
    // The viewer's local date (IST here), not toISOString's UTC date: at
    // 00:30 IST this moment is still 2026-09-28 in UTC.
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('accounts-2026-09-29.csv');
  });
});
