import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  accountBulkBodies,
  accountPatches,
  accountPortfolioQueries,
  stubAccountsPortfolio,
} from '../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderAccounts } from './testList';

// Integration tier: the real page, store and router; fetch stubbed with
// backend #74's shapes (features/accounts/testPortfolio.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
type Spy = ReturnType<typeof stubAccountsPortfolio>;
const paths = (spy: Spy) => spy.mock.calls.map(([input]) => new URL(String(input)).pathname.replace(/^\/api\/v1/, ''));
const exports = (spy: Spy) =>
  spy.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith('/accounts/portfolio/export.csv'));

describe('Accounts list (portfolio)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('shows accounts as rows under the tiles, reading only the portfolio', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    const pizza = await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(pizza.closest('li')).toHaveTextContent('Pizza Hut +1 · Carl CSM · Live · Touched 33d ago');
    expect(await screen.findByRole('link', { name: 'Globex NA' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Initech APAC' })).toBeInTheDocument();
    expect(screen.getByText('3 accounts')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByText('within 90 days, overdue included')).toBeInTheDocument();
    expect([...new Set(paths(spy).filter((path) => path.startsWith('/accounts')))]).toEqual(['/accounts/portfolio/']);
  });

  it('keeps the filters, sort and group in the URL, with chips and "N of M accounts"', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(within(sort).getAllByRole('option').map((option) => option.textContent)).toEqual(['Risk', 'ARR', 'Renewal date', 'Health score', 'Name']);
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual(['None', 'Health', 'Owner', 'Lifecycle', 'Renewal window']);
    await userEvent.selectOptions(sort, 'risk');
    await waitFor(() => expect(where().searchParams.get('sort')).toBe('-risk'));

    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).queryByRole('group', { name: 'Product' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Include churned' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Pizza Hut' }));
    await waitFor(() => expect(where().searchParams.get('organisation')).toBe('7'));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 3 accounts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Organization: Pizza Hut' })).toBeInTheDocument();
    expect(accountPortfolioQueries(spy).some((query) => query.get('organisation') === '7' && query.get('sort') === '-risk')).toBe(true);
  });

  it("opens an account's page from its name, by its id alone", async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    expect(await screen.findByTestId('account-page')).toHaveTextContent('Account page 12');
    expect(where().pathname).toBe('/accounts/12');
  });

  it('opens a row inline with its four panels, and edits it with the account form', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    const details = document.getElementById('account-12-details') as HTMLElement;
    expect(within(details).getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7?account=12');
    const before = accountPortfolioQueries(spy).length;
    await userEvent.click(within(details).getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Pizza EMEA' })).toBeInTheDocument();
    expect(paths(spy)).toContain('/customers/7/accounts/12/');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: expect.objectContaining({ name: 'Pizza EMEA' }) }]),
    );
    await waitFor(() => expect(accountPortfolioQueries(spy).length).toBeGreaterThan(before));
  });

  it('offers no Edit details on an account none of whose organizations the viewer may open', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Open Initech APAC' }));
    const details = document.getElementById('account-14-details') as HTMLElement;
    expect(within(details).getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-row-id="14"]')).toHaveTextContent('Unassigned · Churn · Never contacted');
  });

  it('bulk-edits the lifecycle, Churn included, reporting failures by name, with no Archive or Churn button', async () => {
    const spy = stubAccountsPortfolio({
      members: [
        { id: 2, name: 'Carl CSM', is_active: true },
        { id: 3, name: 'Priya', is_active: true },
      ],
      bulk: (body) => ({
        updated: body.ids.filter((id) => id !== 13),
        failed: body.ids.includes(13) ? [{ id: 13, reason: 'Not found.' }] : [],
      }),
    });
    renderAccounts('/accounts/list');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza EMEA' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex NA' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(bar).toHaveTextContent('2 selected');
    expect(within(bar).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set lifecycle' }), 'churn');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(accountBulkBodies(spy)).toEqual([{ ids: [12, 13], action: 'set_lifecycle', value: 'churn' }]));
    expect(await within(bar).findByText('Globex NA')).toBeInTheDocument();
    expect(bar).toHaveTextContent('Updated 1 account. 1 failed:');
    expect(bar).toHaveTextContent('Globex NA: Not found.');
    expect(bar).toHaveTextContent('1 selected');
  });

  it('exports the view, and the selection alone', async () => {
    const spy = stubAccountsPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAccounts('/accounts/list?health=poor');
    await screen.findByRole('link', { name: 'Initech APAC' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exports(spy)).toHaveLength(1));
    expect(exports(spy)[0].searchParams.get('health')).toBe('poor');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Initech APAC' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exports(spy)).toHaveLength(2));
    expect(exports(spy)[1].search).toBe('?ids=14');
  });

  it('adds an account to an organization with the account form', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(paths(spy)).not.toContain('/customers/');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByRole('heading', { name: 'Add Account' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(paths(spy)).toContain('/customers/');
  });

  it('opens a row as a bottom sheet on phones', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list', { width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    const sheet = screen.getByRole('dialog', { name: 'Pizza EMEA' });
    expect(within(sheet).getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open account page' })).toHaveAttribute('href', '/accounts/12');
  });

  it('says so when there are no accounts yet', async () => {
    stubAccountsPortfolio({ rows: [] });
    renderAccounts('/accounts/list');
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getByText('Add an account to start your portfolio.')).toBeInTheDocument();
  });

  it('keeps nothing on screen when the first read fails, and offers Try again', async () => {
    stubAccountsPortfolio({ portfolio: () => ({ status: 500, body: { detail: 'Server error.' } }) });
    renderAccounts('/accounts/list');
    expect(await screen.findByText('Accounts unavailable')).toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  });

  it('dismisses the export-failure notice', async () => {
    const spy = stubAccountsPortfolio();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('export.csv')
        ? { ok: false, status: 500, json: async () => ({ detail: 'Export broke' }) }
        : spy(input, init),
    );
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Export broke')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Export broke')).not.toBeInTheDocument();
  });
});
