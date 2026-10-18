import { describe, expect, it } from 'vitest';
import { ACCOUNT_PAGE_TABS, parseAccountId, parseAccountPageParams, toAccountPageSearch, withAccountPagePatch } from './accountPageParams';

const parse = (search: string) => parseAccountPageParams(new URLSearchParams(search));

describe('the account page\'s URL state', () => {
  it('has the seven tabs in the spec\'s order', () => {
    expect(ACCOUNT_PAGE_TABS.map((tab) => tab.label)).toEqual([
      'Story',
      'Details',
      'People',
      'Maps',
      'Deals & risks',
      'Files',
      'Custom objects',
    ]);
  });

  it('opens on Story, reads a known tab and ignores an unknown one', () => {
    expect(parse('').tab).toBe('story');
    expect(parse('tab=objects').tab).toBe('objects');
    expect(parse('tab=maps').tab).toBe('maps');
    expect(parse('tab=canvases').tab).toBe('maps');
    expect(parse('tab=knowledge').tab).toBe('story');
  });

  it('reads the story filters and never an account chip', () => {
    expect(parse('group=conversations&source=email,call&q=quote&account=31')).toEqual({
      tab: 'story',
      account: '',
      group: 'conversations',
      sources: ['email', 'call'],
      q: 'quote',
    });
    expect(parse('group=tickets&source=email').sources).toEqual([]);
  });

  it('writes a canonical URL, the default tab left out', () => {
    expect(toAccountPageSearch(parse('account=31')).toString()).toBe('');
    expect(toAccountPageSearch(parse('tab=files&source=call,email&group=conversations')).toString()).toBe(
      'tab=files&group=conversations&source=call%2Cemail',
    );
  });

  it('patches without letting an account chip in', () => {
    const next = withAccountPagePatch(parse('tab=people'), { tab: 'story', account: '31', group: 'tasks' });
    expect(next).toEqual({ tab: 'story', account: '', group: 'tasks', sources: [], q: '' });
  });

  it('reads an id as a positive whole number only', () => {
    expect(parseAccountId('12')).toBe(12);
    for (const bad of [undefined, '', '0', '-3', '12a', '1.5', 'abc']) expect(parseAccountId(bad)).toBeNull();
  });
});
