import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { resetViewport } from '../../../test/viewport';
import { renderAccounts } from '../testList';
import { stubAccountsAsk } from './testAccountsAsk';

// Integration tier: the real account page under AccountsAskLayout, the real
// rail and pill, store and router; fetch answers the page (backend #75) and
// the Copilot (feat/accounts-ask).
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact') as HTMLInputElement;
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const landed = () => screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
const column = () => document.querySelector('[data-part="column"]') as HTMLElement;
const page = { surface: 'accounts', view: 'detail', account: 12 };

describe('Ask Revenact on an account page', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("draws one bleed frame with the glass rail beside the page, whose surfaces stay solid", async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    expect(rail()).toHaveClass('w-[320px]');
    expect(column().parentElement!.parentElement).toHaveClass('px-0', 'sm:px-4');
    expect(column().parentElement!.parentElement).toContainElement(rail());
    expect(document.querySelectorAll('[data-part="column"]')).toHaveLength(1);
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the account's id alone, whatever the tab, and keeps the server's label", async () => {
    const { copilot } = stubAccountsAsk({ copilot: { label: () => 'EMEA (server)' } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    expect(await within(rail()!).findByText('Pizza EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'What changed this month?{enter}');
    await screen.findByText('Answer to: What changed this month?');
    expect(postedBodies(copilot)[0]).toEqual({ content: 'What changed this month?', context: { ...page, focus: null } });
    expect(within(log()).getByText('EMEA (server)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await userEvent.type(composer(), 'And the owner?{enter}');
    await screen.findByText('Answer to: And the owner?');
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, focus: null });
  });

  it('opens the rail with a question about a story item, focused on it for one question', async () => {
    const { copilot } = stubAccountsAsk();
    renderAccounts('/accounts/12', { ask: true, realPage: true, width: 1100 });
    await landed();
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Re: EMEA renewal' }));
    expect(await within(rail()!).findByText('Pizza EMEA · This email')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this email?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this email?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...page, focus: { kind: 'email', id: 141 } });
    // Spent by the send: the chip is the account again, and so is the next question.
    expect(within(rail()!).getByText('Pizza EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the renewal?{enter}');
    await screen.findByText('Answer to: And the renewal?');
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, focus: null });
  });

  it('opens the sheet with the question on a phone', async () => {
    stubAccountsAsk();
    renderAccounts('/accounts/12', { ask: true, realPage: true, width: 375 });
    await landed();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA check-in' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pizza EMEA · This call')).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue('What should I know about this call?');
  });

  it('refuses an account the asker can no longer open, with no Retry', async () => {
    const { copilot } = stubAccountsAsk({ copilot: { refuse: { account: ['Not an account you can open.'] } } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    await userEvent.type(composer(), 'What changed?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent('You can no longer ask about this account.');
    expect(within(rail()!).queryByRole('alert')).not.toHaveTextContent('Choose All');
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  // Controller ruling: the stub's `refuse` is one-shot (testCopilot.ts), so
  // this asserts what the title says — the refused send, then a real second
  // question whose context is the account, not the spent focus.
  it('refuses a story item the asker cannot open, and the next question is about the account', async () => {
    const { copilot } = stubAccountsAsk({ copilot: { refuse: { focus: ['Not a story item you can open.'] } } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await landed();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Re: EMEA renewal' }));
    await userEvent.type(composer(), '{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent(
      'You can no longer ask about this item. Ask about the account instead.',
    );
    await waitFor(() => expect(within(rail()!).getByText('Pizza EMEA')).toBeInTheDocument());
    await userEvent.type(composer(), 'And the renewal?{enter}');
    await screen.findByText('Answer to: And the renewal?');
    expect(postedBodies(copilot).at(-1)!.context).toEqual({ ...page, focus: null });
  });

  it("names nothing it could not open: an account that isn't the viewer's reads \"This account\"", async () => {
    stubAccountsAsk({ page: { row: null } });
    renderAccounts('/accounts/12', { ask: true, realPage: true });
    await screen.findByText('Account not found');
    expect(within(rail()!).getByText('This account')).toBeInTheDocument();
    expect(within(rail()!).queryByText(/12/)).not.toBeInTheDocument();
  });
});
