import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { ORGANIZATIONS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { renderList, renderOrganizations } from '../testList';
import { stubOrganizationsAsk } from './testOrganizationsAsk';

// Integration tier: the real List and Board under OrganizationsAskLayout, the
// real rail and pill, store and router; fetch answers the portfolio and the
// Copilot with contract-shaped bodies. `filters` below carry only the set
// keys (backend ruling): a view's own default group is never sent.
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const views = () => screen.getByRole('navigation', { name: 'Organizations views' });

describe('Ask Revenact on Organizations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the pill in the top bar and the glass rail beside the list, open from xl', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    const bar = within(screen.getByTestId('nav-actions'));
    expect(bar.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    // Glass is the rail's alone: rows stay solid surfaces.
    expect(document.querySelector('[data-row-id="7"]')!.closest('.bg-surface')).not.toBeNull();
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the list's filters and names them in the chip", async () => {
    const { copilot } = stubOrganizationsAsk();
    renderOrganizations('/organizations/list?owner=2&lifecycle=live', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(await within(rail()!).findByText('Organizations · Owner: Carl CSM · Lifecycle: Live')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who renews first?{enter}');
    await screen.findByText('Answer to: Who renews first?');
    expect(postedBodies(copilot)[0]).toEqual({
      content: 'Who renews first?',
      context: { surface: 'organizations', view: 'list', filters: { owner: '2', lifecycle: 'live' }, focus: null },
    });
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Organizations · Owner: Carl CSM · Lifecycle: Live')).toBeInTheDocument();
  });

  it('narrows the next question to an opened row, for that question only', async () => {
    const { copilot } = stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(await within(rail()!).findByText('Organizations · 1 account')).toBeInTheDocument();
    await userEvent.type(composer(), 'Why is this at risk?{enter}');
    await screen.findByText('Answer to: Why is this at risk?');
    expect(postedBodies(copilot)[0].context).toMatchObject({ focus: { kind: 'companies', ids: [7] } });
    await userEvent.type(composer(), 'And the rest?{enter}');
    await screen.findByText('Answer to: And the rest?');
    expect(postedBodies(copilot)[1].context).toMatchObject({ focus: null });
  });

  it('is on the board too: a card focuses it, and the conversation survives the switch to the list', async () => {
    const { copilot } = stubOrganizationsAsk();
    renderOrganizations('/organizations/board?owner=2', { ask: true, nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(await within(rail()!).findByText('Organizations · Owner: Carl CSM · 1 account')).toBeInTheDocument();
    await userEvent.type(composer(), 'Why this one?{enter}');
    await screen.findByText('Answer to: Why this one?');
    expect(postedBodies(copilot)[0].context).toEqual({
      surface: 'organizations',
      view: 'board',
      // group is omitted: lifecycle is the Board's own default.
      filters: { owner: '2' },
      focus: { kind: 'companies', ids: [7] },
    });

    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await screen.findByText('1 of 2 organizations');
    expect(screen.getByText('Answer to: Why this one?')).toBeInTheDocument();
    await userEvent.type(composer(), 'And here?{enter}');
    await screen.findByText('Answer to: And here?');
    // group is omitted here too: health is the List's own default.
    expect(postedBodies(copilot)[1].context).toMatchObject({ view: 'list', filters: { owner: '2' }, focus: null });
  });

  it('is a full-screen sheet from the switch on a phone, never a rail', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true, width: 375 });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(ORGANIZATIONS_ASK_KEY)).toBeNull();
  });

  it('mounts nothing outside the Ask layout', async () => {
    stubOrganizationsAsk();
    renderList('/organizations/list');
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(rail()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copilot$/ })).not.toBeInTheDocument();
  });
});
