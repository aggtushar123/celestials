import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: the real organisation page under OrganizationsAskLayout,
// the real rail and pill, store and router; fetch answers the page and the
// Copilot with contract-shaped bodies (backend delivery 3).
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const heading = () => screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
const column = () => document.querySelector('[data-part="column"]') as HTMLElement;
const page = { surface: 'organizations', view: 'detail', organization: 7 };

describe('Ask Revenact on the organisation page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("keeps the page's full width and 16px gutter while the rail is closed, in one frame", async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true, width: 1100 });
    await heading();
    expect(rail()).not.toBeInTheDocument();
    expect(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' })).toHaveAttribute('aria-pressed', 'false');
    expect(column()).toHaveClass('w-full', 'max-w-[1800px]', 'mx-auto');
    expect(column().parentElement).toHaveClass('flex-1', 'min-w-0', 'px-4', 'sm:px-0');
    expect(column().parentElement!.parentElement).toHaveClass('px-0', 'sm:px-4');
    // The layout's frame is the only one: the page's own passes through.
    expect(document.querySelectorAll('[data-part="column"]')).toHaveLength(1);
    expect(column().parentElement!.parentElement!.parentElement!.closest('.sm\\:px-6')).toBeNull();
  });

  it('puts the glass rail beside the page from xl, and the page reflows beside it', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    const frame = column().parentElement!.parentElement!;
    expect(rail()).toHaveClass('w-[320px]');
    expect(frame).toContainElement(rail());
    expect(column().parentElement!.contains(rail())).toBe(false);
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    // Glass is the rail's alone: the page's surfaces stay solid.
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
  });

  it('reads "Pizza Hut", then "Pizza Hut · EMEA" when the account chip is chosen', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    expect(await within(rail()!).findByText('Pizza Hut')).toBeInTheDocument();
    const chips = await screen.findByRole('group', { name: 'Filter by account' });
    await userEvent.click(await within(chips).findByRole('button', { name: /^EMEA/ }));
    expect(await within(rail()!).findByText('Pizza Hut · EMEA')).toBeInTheDocument();
    // Details is the whole organisation's: no chips there, and no account.
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(await within(rail()!).findByText('Pizza Hut')).toBeInTheDocument();
  });

  it("asks with the page's context, and the question keeps the server's label", async () => {
    // The server's label differs from what the client would work out itself
    // ("Pizza Hut · EMEA"), so this proves the chip shows the server's word,
    // not a client recomputation that happens to match it.
    const { copilot } = stubOrganizationPageAsk({ copilot: { label: () => 'Pizza Hut · EMEA (server)' } });
    renderOrganizationPage('/organizations/7?account=31', { ask: true });
    await heading();
    await within(rail()!).findByText('Pizza Hut · EMEA');
    await userEvent.type(composer(), 'What changed this month?{enter}');
    await screen.findByText('Answer to: What changed this month?');
    expect(postedBodies(copilot)[0]).toEqual({ content: 'What changed this month?', context: { ...page, account: 31, focus: null } });
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Pizza Hut · EMEA (server)')).toBeInTheDocument();
  });

  it('keeps one conversation from the List into the organisation and back', async () => {
    const { copilot } = stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/list', { ask: true, list: true, history: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.type(composer(), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    await userEvent.click(screen.getByRole('link', { name: 'Pizza Hut' }));
    await heading();
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Answer to: Who renews first?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And here?{enter}');
    expect(await within(log).findByText('Answer to: And here?')).toBeInTheDocument();
    // The second question was asked on the organisation's page, not the List
    // it started the conversation on.
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, account: null, focus: null });
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(within(screen.getByRole('log', { name: 'Ask Revenact messages' })).getByText('Answer to: And here?')).toBeInTheDocument();
  });

  it('wraps the tiles to the page column, so they reflow beside the rail', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    const grid = screen.getByRole('button', { name: /^ARR/ }).parentElement!.parentElement!;
    expect(grid).toHaveClass('sm:grid-cols-2', '@min-[50rem]:grid-cols-4');
    expect(grid.closest('[class~="@container"]')).not.toBeNull();
    expect(column().contains(grid)).toBe(true);
  });

  it('opens as a full-screen sheet on phones, with the page left as it was', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7?account=31', { ask: true, width: 375 });
    await heading();
    expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(column().parentElement).toHaveClass('px-4', 'sm:px-0');
    await userEvent.click(screen.getByRole('button', { name: 'Show Copilot' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close Ask Revenact' }));
    expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument();
  });

  it('never links to the old Copilot page', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await heading();
    expect(screen.queryByRole('link', { name: /Ask Copilot/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/copilot"]')).toBeNull();
  });

  it("says so on the rail when the account is no longer the asker's, without retrying", async () => {
    const { copilot } = stubOrganizationPageAsk({ copilot: { refuse: { account: ['Not an account of this organisation you can open.'] } } });
    renderOrganizationPage('/organizations/7?account=31', { ask: true });
    await heading();
    await userEvent.type(composer(), 'What changed?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent('You can no longer ask about this account. Choose All and ask again.');
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('clears a refusal once the person moves to another organisation, even in the same conversation', async () => {
    stubOrganizationPageAsk({ copilot: { refuse: { organization: ['Not an organisation you can open.'] } } });
    renderOrganizationPage('/organizations/7', { ask: true, goTo: '/organizations/9' });
    await heading();
    await userEvent.type(composer(), 'What changed?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent('You can no longer ask about this organization.');
    await userEvent.click(screen.getByRole('link', { name: 'Go to /organizations/9' }));
    await screen.findByText('Organization not found');
    expect(within(rail()!).queryByRole('alert')).not.toBeInTheDocument();
  });
});
