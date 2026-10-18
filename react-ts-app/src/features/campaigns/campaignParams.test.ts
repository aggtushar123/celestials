import { describe, expect, it } from 'vitest';
import { campaignsTab, deliveryQuery, listQuery, openSendOf, showArchived, withArchived, withOpenSend, withTab } from './campaignParams';

const at = (query: string) => new URLSearchParams(query);

describe('campaign URL state (Decisions 3, 7, 8)', () => {
  it('reads Mine unless ?tab=shared, and archived only as 1', () => {
    expect(campaignsTab(at(''))).toBe('mine');
    expect(campaignsTab(at('tab=shared'))).toBe('shared');
    expect(campaignsTab(at('tab=nonsense'))).toBe('mine');
    expect(showArchived(at('archived=1'))).toBe(true);
    expect(showArchived(at('archived=yes'))).toBe(false);
    expect(withTab(at('tab=shared&archived=1'), 'mine').toString()).toBe('archived=1');
    expect(withArchived(at('tab=shared'), true).toString()).toBe('tab=shared&archived=1');
    expect(withArchived(at('archived=1'), false).toString()).toBe('');
  });

  it('reads and writes the open send', () => {
    expect(openSendOf(at('send=41'))).toBe(41);
    expect(openSendOf(at('send=x'))).toBeNull();
    expect(withOpenSend(at(''), 41).toString()).toBe('send=41');
    expect(withOpenSend(at('send=41'), null).toString()).toBe('');
  });

  it('builds the list and deliveries queries, a reason only with Skipped', () => {
    expect(listQuery('mine', false, null)).toBe('tab=mine');
    expect(listQuery('shared', true, 'abc')).toBe('tab=shared&archived=1&cursor=abc');
    expect(deliveryQuery('all', 'unsubscribed', null)).toBe('');
    expect(deliveryQuery('sent', 'unsubscribed', null)).toBe('status=sent');
    expect(deliveryQuery('skipped', 'unsubscribed', 'c2')).toBe('status=skipped&reason=unsubscribed&cursor=c2');
  });
});
