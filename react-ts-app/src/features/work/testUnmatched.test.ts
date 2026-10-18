import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEMS_CS, ITEM_JIRA, stubUnmatched } from './testUnmatched';
import { dismissUnmatched, fetchUnmatched, matchUnmatched } from './unmatched';
import { ApiError } from '../../lib/apiClient';

afterEach(() => vi.unstubAllGlobals());

describe('stubUnmatched (round 2 D3 contract §3)', () => {
  it('pages thirty rows as 25 and 5', async () => {
    stubUnmatched({ items: ITEMS_CS });
    const first = await fetchUnmatched('department:cs');
    expect(first.items).toHaveLength(25);
    expect(first.count).toBe(30);
    expect(first.next).toBe('p2');
    const second = await fetchUnmatched('department:cs', first.next);
    expect(second.items).toHaveLength(5);
    expect(second.next).toBeNull();
  });

  it('refuses a cursor it does not know', async () => {
    stubUnmatched({ items: ITEMS_CS });
    const err = await fetchUnmatched('department:cs', 'old').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).body).toEqual({ cursor: ['That list has changed. Reload Work.'] });
  });

  it('answers 403 SCOPE_NOT_ALLOWED when forbidden', async () => {
    stubUnmatched({ forbidden: true });
    const err = await fetchUnmatched('department:cs').catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).body).toEqual({ code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
  });

  it('matches a row away and names the record', async () => {
    stubUnmatched();
    const answer = await matchUnmatched(ITEM_JIRA.id, { customer_id: 7, add_contact: true });
    expect(answer.record).toEqual({ type: 'customer', id: 7, name: 'Pizza Hut' });
    expect(answer.contact_added).toBe(true);
    expect((await fetchUnmatched('department:cs')).items.map((i) => i.id)).toEqual([42]);
  });

  it('refuses once with GONE, then matches', async () => {
    stubUnmatched({ refuseNextMatch: { status: 409, body: { code: 'GONE', detail: 'Someone else dealt with this message. Reload the list.' } } });
    const err = await matchUnmatched(41, { customer_id: 7 }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).body).toMatchObject({ code: 'GONE' });
    await expect(matchUnmatched(41, { customer_id: 7 })).resolves.toBeTruthy();
  });

  it('dismisses a row', async () => {
    stubUnmatched();
    await dismissUnmatched(41);
    expect((await fetchUnmatched('unassigned')).items.map((i) => i.id)).toEqual([42]);
  });
});
