import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountBulkBodies, accountPatches, stubAccountsPortfolio } from '../features/accounts/testPortfolio';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { renderAccounts } from '../pages/accounts/testList';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, pages, store, router
// and every portfolio component. Only fetch is stubbed, with backend #74's
// shapes.
const where = () => screen.getByTestId('where').textContent;
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;

describe('Accounts portfolio', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters, opens, bulk-edits, carries the filters to the Board, moves a card and opens the account', { timeout: 30000 }, async () => {
    const spy = stubAccountsPortfolio({
      members: [
        { id: 2, name: 'Carl CSM', is_active: true },
        { id: 3, name: 'Priya', is_active: true },
      ],
    });
    renderAccounts('/accounts/list', { nav: true });
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(await screen.findByText('3 accounts')).toBeInTheDocument();

    // 1. Filter to Pizza Hut's accounts.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('checkbox', { name: 'Pizza Hut' }));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 3 accounts')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex NA' })).not.toBeInTheDocument());

    // 2. Open Pizza EMEA inline: its organisations link with it chosen.
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    const details = document.getElementById('account-12-details') as HTMLElement;
    expect(within(details).getByRole('link', { name: 'Yum Brands' })).toHaveAttribute('href', '/organizations/9?account=12');

    // 3. Reassign it to Priya.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza EMEA' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Change owner' }), '3');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(accountBulkBodies(spy)).toEqual([{ ids: [12], action: 'set_owner', value: 3 }]));
    expect(await within(bar).findByText('Updated 1 account.')).toBeInTheDocument();

    // 4. The Board tab keeps the filter.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Accounts views' })).getByRole('link', { name: 'Board' }));
    await waitFor(() => expect(where()).toBe('/accounts/board?organisation=7'));
    expect(await within(column('live')).findByRole('link', { name: 'Pizza EMEA' })).toBeInTheDocument();

    // 5. Move it to Churn: saved on the account, with no churn form.
    await userEvent.click(screen.getByRole('button', { name: 'Move Pizza EMEA to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move Pizza EMEA to' })).getByRole('menuitem', { name: 'Churn' }));
    await waitFor(() => expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: { lifecycle_stage: 'churn' } }]));
    expect(await within(column('churn')).findByRole('link', { name: 'Pizza EMEA' })).toBeInTheDocument();

    // 6. Its name opens the account page by its id alone.
    await userEvent.click(within(column('churn')).getByRole('link', { name: 'Pizza EMEA' }));
    expect(await screen.findByTestId('account-page')).toHaveTextContent('Account page 12');
  });
});
