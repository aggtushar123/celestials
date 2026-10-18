import { describe, expect, it } from 'vitest';
import { accountBase } from './accountPaths';
import { listScope, parentScope } from './listScope';

describe('accountBase', () => {
  it('is the nested route through an organisation, and the flat one without', () => {
    expect(accountBase(31, 7)).toBe('/customers/7/accounts/31');
    expect(accountBase(12)).toBe('/accounts/12');
    expect(accountBase(12, null)).toBe('/accounts/12');
  });
});

describe('listScope', () => {
  it('keeps the keys it always had for an organisation and an account read through one', () => {
    expect(listScope(7)).toBe('organization:7');
    expect(listScope(7, null)).toBe('organization:7');
    expect(listScope(7, 31)).toBe('account:7:31');
  });

  it('keys an account read on its own by the account alone', () => {
    expect(listScope(null, 12)).toBe('account:12');
    expect(listScope(undefined, 12)).toBe('account:12');
    expect(parentScope({ entityType: 'account', customerId: null, accountId: 12 })).toBe('account:12');
    expect(parentScope({ entityType: 'account', customerId: 7, accountId: 31 })).toBe('account:7:31');
    expect(parentScope({ entityType: 'organization', customerId: 7 })).toBe('organization:7');
  });
});
