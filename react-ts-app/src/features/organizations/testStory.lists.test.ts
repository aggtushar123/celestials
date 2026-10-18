import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contact, Opportunity } from '../customers/customersSlice';
import type { Call } from '../calls/callsSlice';
import { ORGANIZATION_LISTS, stubOrganizationPage } from './testStory';

const read = async (path: string, init?: RequestInit) => (await fetch(`http://localhost/api/v1${path}`, init)).json();

describe('stubOrganizationPage: the lists People, Deals & risks and Files read', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serves empty lists by default, and the given ones when asked', async () => {
    stubOrganizationPage();
    expect(await read('/customers/7/contacts/')).toEqual([]);
    vi.unstubAllGlobals();
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    expect(((await read('/customers/7/contacts/')) as Contact[]).map((c) => c.name)).toEqual(['Dana Buyer', 'Sam Admin', 'Pat Finance']);
    expect(((await read('/customers/7/calls/')) as Call[]).map((c) => c.account_id)).toEqual([null, 31]);
  });

  it('tags an upload with the account whose path it was sent to, and lists it first', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    const form = new FormData();
    form.append('file', new File(['x'], 'Notes.txt', { type: 'text/plain' }));
    const saved = await read('/customers/7/accounts/31/files/', { method: 'POST', body: form });
    expect(saved).toMatchObject({ name: 'Notes.txt', account_id: 31, account_name: 'EMEA' });
    expect((await read('/customers/7/files/'))[0].id).toBe(saved.id);
  });

  it('saves an opportunity on an account, edits it and deletes it', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    const saved = await read('/customers/7/accounts/32/opportunities/', { method: 'POST', body: JSON.stringify({ title: 'Upsell' }) });
    expect(saved).toMatchObject({ title: 'Upsell', account_id: 32, account_name: 'North America' });
    await read(`/opportunities/${saved.id}/`, { method: 'PATCH', body: JSON.stringify({ title: 'Upsell v2' }) });
    expect(((await read('/customers/7/opportunities/')) as Opportunity[]).map((o) => o.title)).toContain('Upsell v2');
    await fetch(`http://localhost/api/v1/opportunities/${saved.id}/`, { method: 'DELETE' });
    expect(((await read('/customers/7/opportunities/')) as Opportunity[]).map((o) => o.id)).toEqual([61, 62]);
  });
});
