import { describe, expect, it } from 'vitest';
import { countText, filterChips } from './filterChips';
import { BOARD_GROUP_OPTIONS, GROUP_OPTIONS } from './portfolioGroups';
import { ORGANIZATION_NOUN, capitalise } from './portfolioLabels';
import {
  EMPTY_FILTERS,
  ORGANIZATION_PARAMS,
  filterQuery,
  hasFilters,
  parseParams,
  toApiQuery,
  toUrlSearch,
  type ParamSpec,
} from './portfolioParams';
import type { FilterOptions, PortfolioPage, PortfolioResponse, PortfolioRowBase } from './portfolioTypes';
import { pizzaHut } from './testPortfolio';

// A second kind's parameters (Accounts, by shape): organisation instead of
// product, no churned switch, five sorts and four groups.
const OTHER: ParamSpec = {
  sortKeys: ['risk', 'arr', 'renewal', 'health', 'name'],
  groupKeys: ['health', 'lifecycle', 'owner', 'renewal'],
  product: false,
  churned: false,
  organisation: true,
};

describe('portfolio params for more than one kind', () => {
  it('reads organisation ids for a kind that has them, and drops product and churned', () => {
    const p = parseParams(
      new URLSearchParams('organisation=7,x,1&product=3&include_churned=1&sort=-risk&group=renewal'),
      'health',
      OTHER,
    );
    expect(p.organisation).toEqual(['7', '1']);
    expect(p.product).toEqual([]);
    expect(p.include_churned).toBe(false);
    expect(p.sort).toBe('-risk');
    expect(p.group).toBe('renewal');
  });

  it('falls back to the defaults for a sort or group the kind does not offer', () => {
    const p = parseParams(new URLSearchParams('sort=touch&group=product'), 'health', OTHER);
    expect(p.sort).toBe('-arr');
    expect(p.group).toBe('health');
  });

  it('leaves Organizations exactly as it was: no organisation key, product and churned kept', () => {
    const p = parseParams(new URLSearchParams('organisation=7&product=3&include_churned=1'));
    expect('organisation' in p).toBe(false);
    expect(p.product).toEqual(['3']);
    expect(p.include_churned).toBe(true);
    expect(parseParams(new URLSearchParams(), 'health', ORGANIZATION_PARAMS)).toEqual(parseParams(new URLSearchParams()));
  });

  it('writes organisation to the URL and the API query, and counts it as a filter', () => {
    const p = parseParams(new URLSearchParams('organisation=7,1'), 'health', OTHER);
    expect(toUrlSearch(p).get('organisation')).toBe('7,1');
    expect(new URLSearchParams(toApiQuery(p)).get('organisation')).toBe('7,1');
    expect(filterQuery(p)).toBe('organisation=7%2C1');
    expect(hasFilters(p)).toBe(true);
    expect(hasFilters({ ...p, ...EMPTY_FILTERS })).toBe(false);
  });
});

describe('filter chips and the count for more than one kind', () => {
  const options: FilterOptions = {
    owners: [{ value: '2', name: 'Carl CSM' }],
    lifecycles: [],
    organisations: [{ value: '7', name: 'Pizza Hut' }],
  };

  it('names an organisation chip from the options, and removing it drops only that id', () => {
    const p = parseParams(new URLSearchParams('organisation=7,1&owner=2'), 'health', OTHER);
    const chips = filterChips(p, options);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Owner: Carl CSM',
      'Organization: Pizza Hut',
      'Organization: Organization 1',
    ]);
    expect(chips[1].patch).toEqual({ organisation: ['1'] });
  });

  it("counts in the kind's own words", () => {
    const accounts = { one: 'account', many: 'accounts' };
    expect(countText(1, null, false, false, accounts)).toBe('1 account');
    expect(countText(2, 5, true, false, accounts)).toBe('2 of 5 accounts');
    expect(countText(null, null, false, false, accounts)).toBe('Loading accounts…');
    expect(countText(null, null, false, true, accounts)).toBe('Accounts unavailable');
    expect(countText(3, null, false)).toBe('3 organizations');
    expect(capitalise(ORGANIZATION_NOUN.many)).toBe('Organizations');
  });
});

describe('group options', () => {
  it('moved out of the filters panel unchanged', () => {
    expect(GROUP_OPTIONS.map((option) => option.value)).toEqual(['none', 'health', 'owner', 'lifecycle', 'product', 'renewal']);
    expect(BOARD_GROUP_OPTIONS.map((option) => option.value)).toEqual(['health', 'owner', 'lifecycle', 'product', 'renewal']);
  });
});

describe('portfolio types', () => {
  it('an organisation row is a portfolio row, and its response a portfolio page', () => {
    const row: PortfolioRowBase = pizzaHut;
    const page: PortfolioPage | null = null as PortfolioResponse | null;
    expect(row.id).toBe(7);
    expect(page).toBeNull();
  });
});
