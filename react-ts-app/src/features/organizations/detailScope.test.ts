import { describe, expect, it } from 'vitest';
import { resolveScope, scopeProps, scopeSlot, storyPathOf, storyScope } from './detailScope';

const EMEA = { kind: 'account' as const, id: 12, name: 'Pizza EMEA' };

describe('a detail part\'s page', () => {
  it('is the organisation named by customerId, or the scope it was given', () => {
    expect(resolveScope({ customerId: 7 })).toEqual({ kind: 'organization', id: 7 });
    expect(resolveScope({ scope: EMEA })).toBe(EMEA);
    expect(scopeProps({ kind: 'organization', id: 7 })).toEqual({ customerId: 7 });
    expect(scopeProps(EMEA)).toEqual({ scope: EMEA });
  });

  it('never falls back to a silent id 0 when given neither', () => {
    expect(() => resolveScope({} as never)).toThrow();
    expect(() => resolveScope({ customerId: undefined, scope: undefined } as never)).toThrow();
  });

  it('files its lists where the account thunks file them', () => {
    expect(scopeSlot({ kind: 'organization', id: 7 })).toBe('organization:7');
    expect(scopeSlot(EMEA)).toBe('account:12');
  });

  it('reads its story from the organisation story or the account story', () => {
    expect(storyScope(7)).toEqual({ kind: 'organization', id: 7 });
    expect(storyScope(EMEA)).toBe(EMEA);
    expect(storyPathOf({ kind: 'organization', id: 7 })).toBe('/organizations/7/story/');
    expect(storyPathOf(EMEA)).toBe('/accounts/12/story/');
  });
});
