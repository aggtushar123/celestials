import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { ACCOUNTS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { renderAccounts } from '../testList';
import { stubAccountsAsk } from './testAccountsAsk';

// Integration tier: the real Accounts List and Board under AccountsAskLayout,
// the real rail and pill, store and router; fetch answers the portfolio and
// the Copilot in the backend's shapes (feat/accounts-ask). `filters` carry
// only the set keys; a view's own default group is never sent, and neither is
// a focus.
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const views = () => screen.getByRole('navigation', { name: 'Accounts views' });
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;

describe('Ask Revenact on the Accounts List and Board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the pill in the top bar and the glass rail beside the list, open from xl', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    const bar = within(screen.getByTestId('nav-actions'));
    expect(bar.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    // Glass is the rail's alone: rows stay solid.
    expect(document.querySelector('[data-row-id="12"]')!.closest('.bg-surface')).not.toBeNull();
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the list's filters, names them in the chip, and keeps the server's label", async () => {
    const { copilot } = stubAccountsAsk({ copilot: { label: () => 'Accounts · Owner: Carl CSM · Organisation: Pizza Hut' } });
    renderAccounts('/accounts/list?owner=2&organisation=7', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(await within(rail()!).findByText('Accounts · Owner: Carl CSM · Organization: Pizza Hut')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who needs me first?{enter}');
    await screen.findByText('Answer to: Who needs me first?');
    expect(postedBodies(copilot)[0]).toEqual({
      content: 'Who needs me first?',
      context: { surface: 'accounts', view: 'list', filters: { owner: '2', organisation: '7' } },
    });
    // The asked question shows the server's word, not the client's.
    expect(within(log()).getByText('Accounts · Owner: Carl CSM · Organisation: Pizza Hut')).toBeInTheDocument();
  });

  it('moves the chip with the filters', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list?owner=2&organisation=7', { ask: true });
    await within(rail()!).findByText('Accounts · Owner: Carl CSM · Organization: Pizza Hut');
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' }));
    expect(await within(rail()!).findByText('Accounts · Organization: Pizza Hut')).toBeInTheDocument();
  });

  it('is on the board too: opening a card narrows nothing, and the conversation survives the switch to the list', async () => {
    const { copilot } = stubAccountsAsk();
    renderAccounts('/accounts/board?owner=2', { ask: true, nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    expect(await within(rail()!).findByText('Accounts · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'What renews soon?{enter}');
    await screen.findByText('Answer to: What renews soon?');
    // lifecycle is the Board's own default, so no group; and no focus.
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'accounts', view: 'board', filters: { owner: '2' } });

    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(screen.getByText('Answer to: What renews soon?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And here?{enter}');
    await screen.findByText('Answer to: And here?');
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2' } });
  });

  it("narrows the board's columns while the rail is open", async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/board', { ask: true });
    await screen.findByRole('button', { name: 'Open Pizza EMEA' });
    expect(column('live')).toHaveClass('w-64');
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(column('live')).toHaveClass('w-72'));
  });

  it('keeps the side panel beside the rail from xl', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/board', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    expect(screen.getByRole('complementary', { name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(rail()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pizza EMEA' })).not.toBeInTheDocument();
  });

  it('below xl the rail wins: opening it closes the side panel, narrows the columns, and a card then opens as the sheet', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/board', { ask: true, width: 1100 });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza EMEA' }));
    // The rail is closed below xl by default: the side panel, as before.
    expect(screen.getByRole('complementary', { name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(column('live')).toHaveClass('w-72');

    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza EMEA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pizza EMEA' })).not.toBeInTheDocument();
    expect(column('live')).toHaveClass('w-64');

    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza EMEA' }));
    expect(await screen.findByRole('dialog', { name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza EMEA' })).not.toBeInTheDocument();
    expect(rail()).toBeInTheDocument();
  });

  it('refuses an organisation filter the asker cannot open, with no Retry', async () => {
    const { copilot } = stubAccountsAsk({ copilot: { refuse: { filters: { organisation: ['Not an organisation you can open.'] } } } });
    renderAccounts('/accounts/list?organisation=7', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.type(composer(), 'Who is at risk?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent("You can't ask about this list. Clear the filters and ask again.");
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('is a full-screen sheet from the switch on a phone, never a rail', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list', { ask: true, width: 375 });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('dialog', { name: 'Ask Revenact' })).toHaveAttribute('aria-modal', 'true');
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(ACCOUNTS_ASK_KEY)).toBeNull();
  });

  it("keeps Accounts' own open/closed choice", async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Hide Copilot' }));
    expect(localStorage.getItem(ACCOUNTS_ASK_KEY)).toBe('closed');
    expect(localStorage.getItem('revenact_organizations_ask')).toBeNull();
  });

  it('mounts nothing outside the Ask layout', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/list');
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    expect(rail()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copilot$/ })).not.toBeInTheDocument();
  });
});
