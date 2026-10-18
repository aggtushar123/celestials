import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUP,
  DEFAULT_SORT,
  filterQuery,
  hasFilters,
  parseParams,
  toApiQuery,
  toUrlSearch,
  toggleIn,
  type PortfolioParams,
} from './portfolioParams';

const full: PortfolioParams = {
  search: 'pizza',
  owner: '2',
  lifecycle: ['live', 'renewal'],
  health: ['poor', 'average'],
  product: ['1'],
  renews_within: '90',
  nps: 'detractor',
  ids: [7, 1],
  include_churned: true,
  sort: 'renewal',
  group: 'owner',
};

describe('portfolio params', () => {
  it('defaults to health groups sorted by ARR, with no filters', () => {
    const params = parseParams(new URLSearchParams());
    expect(params.group).toBe(DEFAULT_GROUP);
    expect(params.sort).toBe(DEFAULT_SORT);
    expect(hasFilters(params)).toBe(false);
  });

  it('round-trips every key through the URL', () => {
    expect(parseParams(toUrlSearch(full))).toEqual(full);
  });

  it('writes nothing for the defaults and "none" for no grouping', () => {
    expect(toUrlSearch(parseParams(new URLSearchParams())).toString()).toBe('');
    expect(toUrlSearch({ ...parseParams(new URLSearchParams()), group: '' }).get('group')).toBe('none');
    expect(parseParams(new URLSearchParams('group=none')).group).toBe('');
  });

  it('ignores unknown values, as the backend does', () => {
    const params = parseParams(
      new URLSearchParams('owner=bob&lifecycle=live,nope&health=great&product=x,3&renews_within=45&nps=fan&sort=-colour&group=city&ids=7,abc'),
    );
    expect(params).toMatchObject({
      owner: '',
      lifecycle: ['live'],
      health: [],
      product: ['3'],
      renews_within: '',
      nps: '',
      sort: DEFAULT_SORT,
      group: DEFAULT_GROUP,
      ids: [7],
    });
  });

  it('keeps an unassigned owner, a numeric sort key and descending sorts', () => {
    const params = parseParams(new URLSearchParams('owner=unassigned&sort=-total_contract_value'));
    expect(params.owner).toBe('unassigned');
    expect(params.sort).toBe('-total_contract_value');
  });

  it('caps ids at 500', () => {
    const ids = Array.from({ length: 600 }, (_, i) => i + 1).join(',');
    expect(parseParams(new URLSearchParams(`ids=${ids}`)).ids).toHaveLength(500);
  });

  it('builds the API query with sort and group always set, and extras last', () => {
    const query = new URLSearchParams(toApiQuery(full, { limit: '25', group_value: 'poor' }));
    expect(query.get('lifecycle')).toBe('live,renewal');
    expect(query.get('ids')).toBe('7,1');
    expect(query.get('include_churned')).toBe('1');
    expect(query.get('sort')).toBe('renewal');
    expect(query.get('group')).toBe('owner');
    expect(query.get('limit')).toBe('25');
    expect(query.get('group_value')).toBe('poor');
    expect(new URLSearchParams(toApiQuery({ ...full, group: '' })).has('group')).toBe(false);
  });

  it('filterQuery ignores sort and group, so only filters reset a selection', () => {
    expect(filterQuery({ ...full, sort: 'name', group: '' })).toBe(filterQuery(full));
    expect(filterQuery({ ...full, owner: '3' })).not.toBe(filterQuery(full));
  });

  it('toggleIn adds and removes', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});
