import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountPatches, stubAccountsPortfolio } from '../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderAccounts } from './testList';

// Integration tier: the real page, store and router; fetch stubbed with
// backend #74's shapes, and PATCH /customers/<cid>/accounts/<id>/ writing
// into the stub's book.
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
/** Move to… is a button opening a menu; nothing moves until a stage is chosen. */
const chooseMove = async (id: number, name: string, stage: string) => {
  await userEvent.click(within(card(id)).getByRole('button', { name: `Move ${name} to…` }));
  await userEvent.click(within(screen.getByRole('menu', { name: `Move ${name} to` })).getByRole('menuitem', { name: stage }));
};

describe('Accounts board (portfolio)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('has a column for every stage, empty ones included, each with its count and ARR', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect([...document.querySelectorAll('[data-column]')].map((el) => el.getAttribute('data-column'))).toEqual([
      'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other',
    ]);
    expect(within(column('live')).getByRole('heading')).toHaveTextContent('Live · 1 · $69.6K');
    expect(within(column('onboarding')).getByRole('heading')).toHaveTextContent('Onboarding · 0 · $0');
    expect(within(column('onboarding')).getByText('No accounts in Onboarding.')).toBeInTheDocument();
  });

  it('lists Churn like any other stage: its accounts show, and it takes a "+"', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(await within(column('churn')).findByRole('link', { name: 'Initech APAC' })).toHaveAttribute('href', '/accounts/14');
    expect(within(column('churn')).getByRole('button', { name: 'Add account to Churn' })).toBeInTheDocument();
    expect(screen.queryByText('Churned accounts are hidden.')).not.toBeInTheDocument();
  });

  it('moves a card with Move to…, saving it through the account update', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(within(card(12)).getByText('Pizza Hut +1')).toBeInTheDocument();
    await chooseMove(12, 'Pizza EMEA', 'Adoption');
    await waitFor(() => expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: { lifecycle_stage: 'adoption' } }]));
    await waitFor(() => expect(column('adoption').querySelector('[data-card-id="12"]')).not.toBeNull());
    expect(screen.getByText('Moved Pizza EMEA to Adoption.')).toBeInTheDocument();
    await waitFor(() => expect(within(column('adoption')).getByRole('heading')).toHaveTextContent('Adoption · 2'));
  });

  it('moves a card to Churn with no churn form: Churn is only a stage', async () => {
    const spy = stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Globex NA' });
    await chooseMove(13, 'Globex NA', 'Churn');
    await waitFor(() => expect(accountPatches(spy)).toEqual([{ customerId: 1, id: 13, body: { lifecycle_stage: 'churn' } }]));
    await waitFor(() => expect(column('churn').querySelector('[data-card-id="13"]')).not.toBeNull());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("puts a card back, with the server's reason, when the save fails", async () => {
    stubAccountsPortfolio({
      patch: () => ({ status: 400, body: { detail: 'Owner must be an active member of your organisation.' } }),
    });
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await chooseMove(12, 'Pizza EMEA', 'Adoption');
    expect(
      await screen.findByText("Couldn't move Pizza EMEA to Adoption. Owner must be an active member of your organisation."),
    ).toBeInTheDocument();
    await waitFor(() => expect(column('live').querySelector('[data-card-id="12"]')).not.toBeNull());
    expect(column('adoption').querySelector('[data-card-id="12"]')).toBeNull();
  });

  it('does not offer to move an account none of whose organizations the viewer may open', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Initech APAC' });
    expect(within(card(14)).queryByRole('button', { name: 'Move Initech APAC to…' })).not.toBeInTheDocument();
    expect(card(14)).toHaveAttribute('draggable', 'false');
  });

  it('opens a card in the side panel with its panels, and the account page from there', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(within(card(12)).getByRole('button', { name: 'Open Pizza EMEA' }));
    const panel = screen.getByRole('complementary', { name: 'Pizza EMEA' });
    expect(panel).toHaveTextContent('Pizza Hut +1 · Carl CSM · Live · Touched 33d ago');
    expect(within(panel).getByRole('heading', { name: 'Voice of the customer' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('link', { name: 'Open account page' }));
    expect(await screen.findByTestId('account-page')).toHaveTextContent('Account page 12');
  });

  it('turns moving off when grouped by owner', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board?group=owner');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(screen.queryAllByRole('button', { name: /^Move .+ to…$/ })).toHaveLength(0);
    const group = screen.getByRole('combobox', { name: 'Group' });
    expect(within(group).getAllByRole('option').map((option) => option.textContent)).toEqual(['Health', 'Owner', 'Lifecycle', 'Renewal window']);
  });

  it("adds from a column with that column's stage chosen", async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(within(column('renewal')).getByRole('button', { name: 'Add account to Renewal' }));
    expect(await screen.findByRole('heading', { name: 'Add Account' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Renewal')).toBeInTheDocument();
  });

  it('shows full-width columns with stage tabs on phones, and opens a card as a sheet', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/board', { width: 375 });
    const tabs = await screen.findByRole('navigation', { name: 'Board columns' });
    expect(within(tabs).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Onboarding 0', 'Kickoff 0', 'Adoption 1', 'Live 1', 'Renewal 0', 'Churn 1', 'Expansion 0', 'Other 0',
    ]);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    expect(screen.getByRole('dialog', { name: 'Pizza EMEA' })).toBeInTheDocument();
  });
});
