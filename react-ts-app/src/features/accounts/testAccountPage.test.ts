import { afterEach, describe, expect, it, vi } from 'vitest';
import { initechApac } from './testPortfolio';
import { ACCOUNT_LISTS, stubAccountPage } from './testAccountPage';

// The stub answers the account page as backend #75 does.
async function read(path: string, init?: RequestInit) {
  const response = (await fetch(`http://api.test/api/v1${path}`, init)) as unknown as { status: number; json: () => Promise<unknown> };
  return { status: response.status, body: await response.json() };
}

describe('stubAccountPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers the row by ids, the record and the story, ignoring an account chip', async () => {
    stubAccountPage();
    const portfolio = (await read('/accounts/portfolio/?ids=12&limit=1')).body as { results: { id: number }[]; currency: string };
    expect(portfolio.results.map((row) => row.id)).toEqual([12]);
    expect(portfolio.currency).toBe('USD');
    expect(((await read('/accounts/12/')).body as { name: string }).name).toBe('Pizza EMEA');
    const story = (await read('/accounts/12/story/?account=31&limit=30')).body as { items: unknown[]; counts: { by_account: object } };
    expect(story.items).toHaveLength(5);
    expect(story.counts.by_account).toEqual({ all: 5, none: 0, '12': 5 });
  });

  it('reads 404 for an account the viewer cannot open, and no row', async () => {
    stubAccountPage({ row: null });
    expect((await read('/accounts/12/')).status).toBe(404);
    expect((await read('/accounts/12/story/?limit=30')).status).toBe(404);
    expect(((await read('/accounts/portfolio/?ids=12&limit=1')).body as { results: unknown[] }).results).toEqual([]);
  });

  it('tags a saved record with the account and answers its lists', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const saved = await read('/accounts/12/contacts/', { method: 'POST', body: JSON.stringify({ name: 'Robin Ops', email: 'r@x.example' }) });
    expect(saved.body).toMatchObject({ name: 'Robin Ops', account_id: 12, account_name: 'Pizza EMEA' });
    expect(((await read('/accounts/12/contacts/')).body as unknown[]).length).toBe(ACCOUNT_LISTS.contacts.length + 1);
  });

  it('hands an owner change to the next row read', async () => {
    stubAccountPage();
    await read('/accounts/12/', { method: 'PATCH', body: JSON.stringify({ owner_id: 1, handover_note: 'Cover' }) });
    const portfolio = (await read('/accounts/portfolio/?ids=12&limit=1')).body as { results: { owner: { name: string } }[] };
    expect(portfolio.results[0].owner.name).toBe('Alice');
    expect(((await read('/accounts/12/')).body as { owner: { name: string } }).owner.name).toBe('Alice');
  });

  it('serves an account with no openable organisation on its own id', async () => {
    stubAccountPage({ row: initechApac });
    expect(((await read('/accounts/14/')).body as { customers: unknown[] }).customers).toEqual([]);
    expect((await read('/accounts/12/')).status).toBe(404);
  });
});
