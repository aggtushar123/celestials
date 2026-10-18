import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseScope, forgetScope, isScopeKey, readStoredScope, SCOPE_STORAGE_KEY, storeScope, withoutScope } from './brainScope';
import type { ScopesPayload } from './brainTypes';

const ALL: ScopesPayload = {
  scopes: [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }, { key: 'company', label: 'Company' }],
  default: 'company',
};
const ME_ONLY: ScopesPayload = { scopes: [{ key: 'me', label: 'Me' }], default: 'me' };

describe('the remembered scope (spec §2.2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads, writes and forgets revenact_brain_scope, ignoring anything that is not a scope', () => {
    expect(readStoredScope()).toBeNull();
    storeScope('team');
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('team');
    expect(readStoredScope()).toBe('team');
    localStorage.setItem(SCOPE_STORAGE_KEY, 'everything');
    expect(readStoredScope()).toBeNull();
    forgetScope();
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
  });

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readStoredScope()).toBeNull();
    expect(() => storeScope('me')).not.toThrow();
    expect(() => forgetScope()).not.toThrow();
  });

  it('knows the three keys only', () => {
    expect(['me', 'team', 'company', 'all', null].map(isScopeKey)).toEqual([true, true, true, false, false]);
  });
});

describe('chooseScope', () => {
  it('takes the URL when the server offers it', () => {
    expect(chooseScope('team', 'me', ALL)).toEqual({ key: 'team', dropStored: false, urlRefused: false });
  });

  it('falls back to the remembered choice, then the server default', () => {
    expect(chooseScope(null, 'me', ALL)).toEqual({ key: 'me', dropStored: false, urlRefused: false });
    expect(chooseScope(null, null, ALL)).toEqual({ key: 'company', dropStored: false, urlRefused: false });
  });

  it('drops a remembered scope the server no longer offers, without a notice', () => {
    expect(chooseScope(null, 'company', ME_ONLY)).toEqual({ key: 'me', dropStored: true, urlRefused: false });
  });

  it('refuses a URL scope the reader is not offered (Decision 4), but replaces junk silently', () => {
    expect(chooseScope('company', null, ME_ONLY)).toEqual({ key: 'me', dropStored: false, urlRefused: true });
    expect(chooseScope('everything', null, ME_ONLY)).toEqual({ key: 'me', dropStored: false, urlRefused: false });
  });

  it('withoutScope drops one scope and moves the default off it', () => {
    const offered: ScopesPayload = { scopes: [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }], default: 'team' };
    expect(withoutScope(offered, 'me')).toEqual({ scopes: [{ key: 'team', label: 'My team' }], default: 'team' });
    const onlyMe: ScopesPayload = { scopes: [{ key: 'me', label: 'Me' }, { key: 'company', label: 'Company' }], default: 'me' };
    expect(withoutScope(onlyMe, 'me').default).toBe('company');
  });
});
