import { describe, expect, it } from 'vitest';
import { accountTag, byAccount, chosenAccount, countByAccount, inAccount, scopeLabel } from './accountScope';
import { ACCOUNTS } from './testStory';

const onEmea = { account_id: 31 };
const onOrg = { account_id: null };
const untagged = {};

describe('the account chips on the lists (spec 2026-09-27 §1)', () => {
  it('All takes everything; Organization only records on the organization itself; an id only its own', () => {
    expect([onEmea, onOrg, untagged].map((r) => inAccount(r, ''))).toEqual([true, true, true]);
    expect([onEmea, onOrg, untagged].map((r) => inAccount(r, 'none'))).toEqual([false, true, true]);
    expect([onEmea, onOrg, untagged].map((r) => inAccount(r, '31'))).toEqual([true, false, false]);
  });

  it('filters a list, and hands All back the same array', () => {
    const list = [onEmea, onOrg];
    expect(byAccount(list, '')).toBe(list);
    expect(byAccount(list, '31')).toEqual([onEmea]);
    expect(byAccount(list, 'none')).toEqual([onOrg]);
  });

  it("counts in the story's shape: all, none, and every account at 0 when it has none", () => {
    expect(countByAccount([onEmea, onEmea, onOrg, { account_id: 99 }], [31, 32])).toEqual({
      all: 4,
      none: 1,
      '31': 2,
      '32': 0,
      '99': 1,
    });
    expect(countByAccount([], [31])).toEqual({ all: 0, none: 0, '31': 0 });
  });

  it('names the chosen account, and nothing for All, Organization or an id the organization does not have', () => {
    expect(chosenAccount(ACCOUNTS, '31')?.name).toBe('EMEA');
    expect(chosenAccount(ACCOUNTS, '')).toBeUndefined();
    expect(chosenAccount(ACCOUNTS, 'none')).toBeUndefined();
    expect(chosenAccount(ACCOUNTS, '99')).toBeUndefined();
  });

  it('labels the scope an empty list is empty for', () => {
    expect(scopeLabel(ACCOUNTS, '')).toBeNull();
    expect(scopeLabel(ACCOUNTS, 'none')).toBe('the organization itself');
    expect(scopeLabel(ACCOUNTS, '32')).toBe('North America');
    expect(scopeLabel(ACCOUNTS, '99')).toBe('this account');
  });

  it('tags a record with its account, or Organization', () => {
    expect(accountTag({ account_name: 'EMEA' })).toBe('EMEA');
    expect(accountTag({ account_name: null })).toBe('Organization');
    expect(accountTag({})).toBe('Organization');
  });

  it("names the tag from the organization's accounts when it has them, so a rename shows at once", () => {
    const renamed = ACCOUNTS.map((a) => (a.id === 31 ? { ...a, name: 'EMEA West' } : a));
    expect(accountTag({ account_id: 31, account_name: 'EMEA' }, renamed)).toBe('EMEA West');
    expect(accountTag({ account_id: 99, account_name: 'Gone' }, renamed)).toBe('Gone');
    expect(accountTag({ account_id: null, account_name: null }, renamed)).toBe('Organization');
  });
});
