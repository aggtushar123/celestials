import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubAccountsPortfolio } from '../../features/accounts/testPortfolio';
import { stubContactsApi } from '../../features/contacts/testContacts';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPortfolio } from '../../features/organizations/testPortfolio';
import { resetViewport } from '../../test/viewport';
import { renderAccounts } from '../accounts/testList';
import { renderContactsPage } from '../contacts/testPage';
import { renderList } from '../organizations/testList';

const where = () => screen.getByTestId('where').textContent;

// Spec §3: "Save as segment" beside Filters turns the list's current URL
// filters into a new segment's rules and opens the builder (plan Decision 5).
describe('Save as segment on the lists', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("opens the builder as a modal over Organizations, from the list's own filters, and Cancel leaves the list as it was", async () => {
    stubPortfolio();
    renderList('/organizations/list?owner=2&health=poor&search=pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    const dialog = await screen.findByRole('dialog', { name: 'New segment' });
    expect(within(dialog).getByRole('radio', { name: 'Organisations' })).toBeChecked();
    expect(within(dialog).getAllByRole('combobox', { name: /^Condition \d field$/ }).map((select) => (select as HTMLSelectElement).value)).toEqual(['owner', 'health_category']);
    expect(within(within(dialog).getByRole('list', { name: 'From the list' })).getByText(/The search "pizza" isn't carried over/)).toBeInTheDocument();
    expect(where()).toBe('/organizations/list?owner=2&health=poor&search=pizza');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/organizations/list?owner=2&health=poor&search=pizza');
  });

  it('opens it over Accounts with its organisation filter', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list?organisation=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    const dialog = await screen.findByRole('dialog', { name: 'New segment' });
    expect(within(dialog).getByRole('radio', { name: 'Accounts' })).toBeChecked();
    expect(within(dialog).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('Organisation');
    expect(where()).toBe('/accounts/list?organisation=7');
  });

  it('opens it over Contacts with its organisation and role', async () => {
    stubContactsApi();
    renderContactsPage('/contacts?customer=6&role=champion');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    const dialog = await screen.findByRole('dialog', { name: 'New segment' });
    expect(within(dialog).getByRole('radio', { name: 'Contacts' })).toBeChecked();
    expect(within(dialog).getAllByRole('combobox', { name: /^Condition \d field$/ })).toHaveLength(2);
    expect(where()).toBe('/contacts?customer=6&role=champion');
  });
});
