import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  accountsContextOf,
  accountsLabel,
  accountsPath,
  accountsViewOf,
  fromAccountsFilters,
} from './askContext';
import { ACCOUNT_FILTER_OPTIONS } from './testPortfolio';

const names = { options: ACCOUNT_FILTER_OPTIONS, account: { id: 12, name: 'Pizza EMEA' } };
const list = (search: string) => accountsContextOf('/accounts/list', search);
const board = (search: string) => accountsContextOf('/accounts/board', search);

describe('accountsViewOf / accountIdOf', () => {
  it('reads the List, the Board and one account from the path', () => {
    expect(accountsViewOf('/accounts/list')).toBe('list');
    expect(accountsViewOf('/accounts/board/')).toBe('board');
    expect(accountsViewOf('/accounts/12')).toBe('detail');
    expect(accountsViewOf('/accounts/abc')).toBe('detail');
    expect(accountsViewOf('/accounts')).toBeNull();
    expect(accountsViewOf('/accounts/12/notes')).toBeNull();
    expect(accountsViewOf('/organizations/list')).toBeNull();
    expect(accountIdOf('/accounts/12')).toBe(12);
    expect(accountIdOf('/accounts/12/')).toBe(12);
    expect(accountIdOf('/accounts/012')).toBeNull();
    expect(accountIdOf('/accounts/abc')).toBeNull();
    expect(accountIdOf('/accounts/list')).toBeNull();
  });

  it('reads the New plan modal over an account as its page', () => {
    expect(accountsViewOf('/accounts/12/plans/new')).toBe('detail');
    expect(accountIdOf('/accounts/12/plans/new')).toBe(12);
  });
});

describe('accountsContextOf', () => {
  it("sends the List's set filters only, in the URL's own spelling", () => {
    expect(list('?owner=2&health=poor')).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2', health: 'poor' } });
    expect(list('?organisation=7,9&sort=risk&renews_within=30')).toEqual({
      surface: 'accounts',
      view: 'list',
      filters: { organisation: '7,9', sort: 'risk', renews_within: '30' },
    });
    expect(list('')).toEqual({ surface: 'accounts', view: 'list', filters: {} });
  });

  it("drops what the Accounts portfolio doesn't read, and the default sort", () => {
    expect(list('?product=3&include_churned=1&sort=-arr&cursor=abc&owner=bob')).toEqual({
      surface: 'accounts',
      view: 'list',
      filters: {},
    });
  });

  it("sends group only when it isn't the view's default, and '' for the List's None", () => {
    expect(list('?group=health')).toEqual({ surface: 'accounts', view: 'list', filters: {} });
    expect(list('?group=lifecycle')).toEqual({ surface: 'accounts', view: 'list', filters: { group: 'lifecycle' } });
    expect(list('?group=none')).toEqual({ surface: 'accounts', view: 'list', filters: { group: '' } });
    expect(list('?group=product')).toEqual({ surface: 'accounts', view: 'list', filters: {} });
    expect(board('?group=lifecycle')).toEqual({ surface: 'accounts', view: 'board', filters: {} });
    // A board always has columns: the List's None reads as lifecycle there,
    // so the Board never sends ''.
    expect(board('?group=none')).toEqual({ surface: 'accounts', view: 'board', filters: {} });
    expect(board('?group=owner&owner=2')).toEqual({ surface: 'accounts', view: 'board', filters: { group: 'owner', owner: '2' } });
  });

  it("carries one account's id alone, never its tab or story filters", () => {
    expect(accountsContextOf('/accounts/12', '?tab=details&kinds=email')).toEqual({
      surface: 'accounts',
      view: 'detail',
      account: 12,
      focus: null,
    });
    expect(accountsContextOf('/accounts/abc', '')).toBeNull();
    expect(accountsContextOf('/contacts', '')).toBeNull();
  });

  it('round-trips through fromAccountsFilters', () => {
    const params = fromAccountsFilters({ owner: '2', organisation: '7', group: '' }, 'list');
    expect(params).toMatchObject({ owner: '2', organisation: ['7'], group: '' });
    expect(fromAccountsFilters({}, 'board').group).toBe('lifecycle');
  });
});

describe('accountsLabel', () => {
  it("names a live List or Board question from the page's own filter options", () => {
    const context = { surface: 'accounts', view: 'list', filters: { owner: '2', organisation: '7', health: 'poor' } } as const;
    expect(accountsLabel(context, names)).toBe('Accounts · Owner: Carl CSM · Organization: Pizza Hut · Health: Poor');
    // Before the page has reported options, nothing is guessed.
    expect(accountsLabel(context)).toBe('Accounts · Owner: User 2 · Organization: Organization 7 · Health: Poor');
    expect(accountsLabel({ surface: 'accounts', view: 'board', filters: {} }, names)).toBe('Accounts');
  });

  // Ruling F3 (pipelines Ask plan): the label function guards against a
  // context missing `filters` rather than trusting every caller to supply
  // one. Without the `filters ?? {}` guard this throws
  // (`Object.entries(undefined)`).
  it('does not throw for a context missing filters', () => {
    const bare = { surface: 'accounts', view: 'list' } as unknown as Parameters<typeof accountsLabel>[0];
    expect(() => accountsLabel(bare)).not.toThrow();
    expect(accountsLabel(bare)).toBe('Accounts');
  });

  it("shows the server's label once stored", () => {
    expect(
      accountsLabel({ surface: 'accounts', view: 'board', filters: { owner: '2' }, label: 'Accounts · Owner: Carl CSM' }, null),
    ).toBe('Accounts · Owner: Carl CSM');
    expect(accountsLabel({ surface: 'accounts', view: 'detail', account: 12, focus: null, label: 'EMEA' }, names)).toBe('EMEA');
  });

  it('names an account from the row the page loaded, else "This account", then the focus', () => {
    const page = { surface: 'accounts', view: 'detail', account: 12, focus: null } as const;
    expect(accountsLabel(page, names)).toBe('Pizza EMEA');
    expect(accountsLabel({ ...page, account: 13 }, names)).toBe('This account');
    expect(accountsLabel(page)).toBe('This account');
    expect(accountsLabel({ ...page, focus: { kind: 'email', id: 141 } }, names)).toBe('Pizza EMEA · This email');
    expect(accountsLabel({ ...page, focus: { kind: 'call', id: 112 }, label: 'EMEA' })).toBe('EMEA · This call');
  });
});

describe('accountsPath', () => {
  it('reopens the List or the Board with its filters, or the account', () => {
    expect(accountsPath({ surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'x' })).toBe(
      '/accounts/board?renews_within=30',
    );
    expect(accountsPath({ surface: 'accounts', view: 'list', filters: { owner: '2', group: '' }, label: 'x' })).toBe(
      '/accounts/list?owner=2&group=none',
    );
    expect(accountsPath({ surface: 'accounts', view: 'list', filters: {}, label: 'Accounts' })).toBe('/accounts/list');
    expect(accountsPath({ surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' })).toBe('/accounts/12');
  });

  it('restores exactly the page a context was built from', () => {
    for (const search of ['?owner=2&group=none', '?organisation=7&sort=risk', '']) {
      const context = list(search)!;
      if (context.view === 'detail') throw new Error('not a list');
      const path = accountsPath({ ...context, label: 'x' });
      const again = accountsContextOf('/accounts/list', path.split('?')[1] ?? '');
      expect(again).toEqual(context);
    }
  });
});
