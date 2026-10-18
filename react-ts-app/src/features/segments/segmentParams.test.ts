import { describe, expect, it } from 'vitest';
import { membersQuery, parseListParams, parseSegmentPage, toListSearch, toSegmentPageSearch } from './segmentParams';

const q = (text: string) => new URLSearchParams(text);

describe('segments URL state', () => {
  it("reads the list's scope and search, All by default, and writes only what is set", () => {
    expect(parseListParams(q(''))).toEqual({ scope: 'all', search: '' });
    expect(parseListParams(q('scope=shared&search= risk '))).toEqual({ scope: 'shared', search: 'risk' });
    expect(parseListParams(q('scope=everyone')).scope).toBe('all');
    expect(toListSearch({ scope: 'all', search: '' }).toString()).toBe('');
    expect(toListSearch({ scope: 'mine', search: 'risk' }).toString()).toBe('scope=mine&search=risk');
  });

  it("reads a segment page's tab, search, sort, group and window, dropping what the kind does not take", () => {
    expect(parseSegmentPage(q(''), 'customer')).toEqual({ tab: 'members', search: '', sort: '-arr', group: '', days: 30 });
    expect(parseSegmentPage(q('tab=changes&days=90&sort=name&group=owner&search=piz'), 'customer')).toEqual({
      tab: 'changes', search: 'piz', sort: 'name', group: 'owner', days: 90,
    });
    // Accounts have no product grouping or seat sort; 45 is not a window.
    expect(parseSegmentPage(q('group=product&sort=-seat_utilization_percentage&days=45'), 'account')).toEqual({
      tab: 'members', search: '', sort: '-arr', group: '', days: 30,
    });
  });

  it('writes the page URL with its defaults left out', () => {
    expect(toSegmentPageSearch({ tab: 'members', search: '', sort: '-arr', group: '', days: 30 }).toString()).toBe('');
    expect(toSegmentPageSearch({ tab: 'changes', search: 'a', sort: 'name', group: 'health', days: 7 }).toString()).toBe(
      'tab=changes&search=a&sort=name&group=health&days=7',
    );
  });

  it('asks the members endpoint only for the names it reads, and contacts only for search', () => {
    const p = { tab: 'members' as const, search: 'piz', sort: 'name', group: 'health', days: 30 as const };
    expect(membersQuery(p, 'customer', { limit: '50' })).toBe('search=piz&sort=name&group=health&limit=50');
    expect(membersQuery(p, 'contact', { limit: '50' })).toBe('search=piz&limit=50');
  });
});
