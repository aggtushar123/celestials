import { describe, expect, it } from 'vitest';
import { NO_FILTERS, contactsApiPath, hasFilters, parseContactsParams, toContactsSearch, withFilter } from './contactsParams';

const parse = (query: string) => parseContactsParams(new URLSearchParams(query));

describe('contactsParams (spec 2026-09-28 §3)', () => {
  it('reads the search and the four filters from the URL', () => {
    expect(parse('q=lukas&customer=6&account=31&sentiment=negative&role=champion')).toEqual({
      q: 'lukas',
      customer: '6',
      account: '31',
      sentiment: 'negative',
      role: 'champion',
    });
  });

  it('reads unknown values as all, and an account only inside an organisation', () => {
    expect(parse('customer=x&sentiment=furious&role=boss')).toEqual(NO_FILTERS);
    expect(parse('account=31')).toEqual(NO_FILTERS);
    expect(parse('customer=0')).toEqual(NO_FILTERS);
  });

  it('writes one URL for equal filters, empties left out', () => {
    const p = { ...NO_FILTERS, role: 'champion' as const, customer: '6', q: '  ' };
    expect(toContactsSearch(p).toString()).toBe('customer=6&role=champion');
    expect(toContactsSearch(parse('role=champion&customer=6')).toString()).toBe('customer=6&role=champion');
  });

  it('asks the API with `search` and `customer`', () => {
    expect(contactsApiPath(NO_FILTERS)).toBe('/contacts/');
    expect(contactsApiPath(parse('q=%20lukas%20&customer=6&account=31&sentiment=positive&role=other'))).toBe(
      '/contacts/?search=lukas&customer=6&account=31&sentiment=positive&role=other',
    );
  });

  it('a new organisation clears the account; other filters keep it', () => {
    const p = parse('customer=6&account=31');
    expect(withFilter(p, 'customer', '7')).toEqual({ ...NO_FILTERS, customer: '7' });
    expect(withFilter(p, 'sentiment', 'neutral')).toEqual({ ...p, sentiment: 'neutral' });
  });

  it('knows when anything narrows the list', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters(parse('q=%20'))).toBe(false);
    expect(hasFilters(parse('role=other'))).toBe(true);
  });
});
