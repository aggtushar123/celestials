import { describe, expect, it } from 'vitest';
import { countText, filterChips } from './filterChips';
import { parseParams } from './portfolioParams';
import { FILTER_OPTIONS } from './testPortfolio';

describe('filterChips', () => {
  it('names every active filter, dashboard ids first', () => {
    const params = parseParams(
      new URLSearchParams('ids=7,2&search=piz&owner=2&lifecycle=live&health=poor&product=1&renews_within=90&nps=detractor&include_churned=1'),
    );
    expect(filterChips(params, FILTER_OPTIONS).map((c) => c.label)).toEqual([
      'Opened from the dashboard (2)',
      'Search: piz',
      'Owner: Carl CSM',
      'Lifecycle: Live',
      'Health: Poor',
      'Product: Hiring',
      'Renews within 90 days',
      'NPS: Detractors',
      'Includes churned',
    ]);
  });

  it('removes one value from a multi filter', () => {
    const params = parseParams(new URLSearchParams('health=poor,average'));
    const poor = filterChips(params, FILTER_OPTIONS).find((c) => c.label === 'Health: Poor')!;
    expect(poor.patch).toEqual({ health: ['average'] });
  });

  it('falls back to known labels before the options load', () => {
    const params = parseParams(new URLSearchParams('owner=unassigned&lifecycle=renewal'));
    expect(filterChips(params, null).map((c) => c.label)).toEqual(['Owner: Unassigned', 'Lifecycle: Renewal']);
  });

  it('writes the count', () => {
    expect(countText(3, 12, true)).toBe('3 of 12 organizations');
    expect(countText(1, null, false)).toBe('1 organization');
    expect(countText(12, null, false)).toBe('12 organizations');
    expect(countText(null, null, true)).toBe('Loading organizations…');
    expect(countText(null, null, false, true)).toBe('Organizations unavailable');
  });
});
