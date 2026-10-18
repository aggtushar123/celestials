// Pinned to a non-UTC, non-DST zone (IST, UTC+5:30) so the export test's
// timezone assertions can actually fail on a UTC CI runner. Set before any
// Date is used; Node re-reads process.env.TZ on every local-time
// computation (storyDays.test.ts does the same).
process.env.TZ = 'Asia/Kolkata';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdate, exportPortfolio, fetchPortfolio } from './portfolioApi';
import { portfolioQueries, stubPortfolio } from './testPortfolio';

describe('portfolioApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the portfolio with the query it is given', async () => {
    const spy = stubPortfolio();
    const data = await fetchPortfolio('group=health&sort=-arr');
    const [query] = portfolioQueries(spy);
    expect(query.get('group')).toBe('health');
    expect(query.get('sort')).toBe('-arr');
    expect(data.currency).toBe('USD');
    // Churned customers stay out unless asked for, as on the backend.
    expect(data.results.map((row) => row.id)).toEqual([7, 1]);
    expect(data.groups.map((group) => group.key)).toEqual(['average', 'good']);
  });

  it('reads the bare path when there is no query', async () => {
    const spy = stubPortfolio();
    await fetchPortfolio('');
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/v1\/organizations\/portfolio\/$/);
  });

  it('posts a bulk edit and returns what was updated and what failed', async () => {
    const spy = stubPortfolio({
      bulk: (body) => ({ updated: [body.ids[0]], failed: [{ id: body.ids[1], reason: 'No permission.' }] }),
    });
    const result = await bulkUpdate({ ids: [7, 1], action: 'set_owner', value: 3 });
    expect(result).toEqual({ updated: [7], failed: [{ id: 1, reason: 'No permission.' }] });
    const call = spy.mock.calls.find(([input]) => String(input).endsWith('/organizations/bulk/'));
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ids: [7, 1], action: 'set_owner', value: 3 });
  });

  it.each([
    ['just after local midnight', new Date(2026, 8, 25, 0, 30)],
    ['just before local midnight', new Date(2026, 8, 25, 23, 30)],
  ])("downloads the export through the session, named for the viewer's own calendar day (%s)", async (_label, today) => {
    const spy = stubPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await exportPortfolio('health=poor&sort=-arr', today);

    const call = spy.mock.calls.find(([input]) => String(input).includes('/organizations/portfolio/export.csv'));
    expect(String(call?.[0])).toContain('export.csv?health=poor&sort=-arr');
    expect((call?.[1]?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(URL.createObjectURL).toHaveBeenCalled();
    // The viewer's local date (IST here), not toISOString's UTC date: at
    // 00:30 IST this moment is still 2026-09-24 in UTC.
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('organizations-2026-09-25.csv');
  });
});
