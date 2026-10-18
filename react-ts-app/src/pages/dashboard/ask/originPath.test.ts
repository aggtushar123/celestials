import { describe, it, expect } from 'vitest';
import { originPath } from './originPath';

const filters = { owner: '', lifecycle: '', customer: '' };

describe('originPath', () => {
  it('goes back to the view with its filters', () => {
    expect(originPath({ surface: 'dashboard', area: 'overview', view: null, filters })).toBe('/dashboard/overview');
    expect(originPath({ surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { ...filters, owner: '2', lifecycle: 'customer' } })).toBe(
      '/dashboard/revenue/forecast?owner=2&lifecycle=customer',
    );
    expect(originPath({ surface: 'dashboard', area: 'health', view: null, filters })).toBe('/dashboard/health');
  });

  it('goes back to an Organizations view with its filters', () => {
    expect(
      originPath({ surface: 'organizations', view: 'board', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] }),
    ).toBe('/organizations/board?owner=2');
  });

  it("goes back to an organisation's page with its account chip", () => {
    const page = { surface: 'organizations' as const, view: 'detail' as const, organization: 7, account: null, label: 'Pizza Hut' };
    expect(originPath(page)).toBe('/organizations/7');
    expect(originPath({ ...page, account: 31, label: 'Pizza Hut · EMEA' })).toBe('/organizations/7?account=31');
  });

  it('reopens a Contacts conversation on its person or its filtered list', () => {
    expect(originPath({ surface: 'contacts', view: 'person', contact: 41, label: 'x' })).toBe('/contacts/41');
    expect(originPath({ surface: 'contacts', view: 'list', filters: { sentiment: 'negative' }, label: 'x' })).toBe(
      '/contacts?sentiment=negative',
    );
  });

  it('reopens an Accounts conversation on its List, Board or account', () => {
    expect(originPath({ surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'x' })).toBe(
      '/accounts/board?renews_within=30',
    );
    expect(originPath({ surface: 'accounts', view: 'list', filters: {}, label: 'Accounts' })).toBe('/accounts/list');
    expect(originPath({ surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' })).toBe('/accounts/12');
  });

  it('reopens a Pipelines conversation on its view, with its kind and filters', () => {
    expect(originPath({ surface: 'pipelines', kind: 'risks', view: 'board', filters: { priority: 'high' }, label: 'x' })).toBe(
      '/pipelines/board?kind=risks&priority=high',
    );
    expect(originPath({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, label: 'Pipelines · Opportunities' })).toBe(
      '/pipelines/list',
    );
  });

  it('reopens a Brain conversation on its tab, with its scope', () => {
    expect(originPath({ surface: 'brain', scope: 'team', tab: 'changed' })).toBe('/brain?scope=team');
    expect(originPath({ surface: 'brain', scope: 'me', tab: 'waiting' })).toBe('/brain/waiting?scope=me');
  });
});
