import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { ACCOUNT_LISTS } from '../features/accounts/testAccountPage';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubAccountsAsk } from '../pages/accounts/ask/testAccountsAsk';
import { renderAccounts } from '../pages/accounts/testList';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Accounts List, Board and
// account page under AccountsAskLayout, with the real Navbar, rail and pill,
// store and router. Only fetch is stubbed: the Accounts endpoints and the
// Copilot's (stubAccountsAsk), in the backend's shapes.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const views = () => screen.getByRole('navigation', { name: 'Accounts views' });

// The conversation as History lists it after the journey below: its origin
// is the first Ask context (the List's) without its focus, labelled by the server.
const ASKED = { id: 15, title: 'Who needs me first?', created_at: '', updated_at: '', origin: { surface: 'accounts', view: 'list', filters: { owner: '2' }, label: 'Accounts · Owner: Carl CSM' } };

describe('Ask Revenact on Accounts, end to end (spec 2026-09-29 §3)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('asks on the List, the Board and an account in one conversation, asks about a story item, and finds it in History', { timeout: 30000 }, async () => {
    const { copilot } = stubAccountsAsk({ copilot: { conversations: [ASKED] }, page: { lists: ACCOUNT_LISTS } });
    renderAccounts('/accounts/list?owner=2', { width: 1440, nav: true, realPage: true, ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });

    // 1. The List: the chip names Carl; the question carries the filter alone.
    expect(await within(rail()).findByText('Accounts · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who needs me first?{Enter}');
    await screen.findByText('Answer to: Who needs me first?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'accounts', view: 'list', filters: { owner: '2' } });

    // 2. The Board, carrying the query: the same conversation, the Board's view.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where()).toBe('/accounts/board?owner=2');
    await userEvent.type(composer(), 'What renews soon?{Enter}');
    await screen.findByText('Answer to: What renews soon?');
    expect(screen.getByText('Answer to: Who needs me first?')).toBeInTheDocument();
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'accounts', view: 'board', filters: { owner: '2' } });

    // 3. Into Pizza EMEA: the chip moves to the account; the conversation stays.
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
    expect(where()).toBe('/accounts/12');
    expect(await within(rail()).findByText('Pizza EMEA')).toBeInTheDocument();
    expect(screen.getByText('Answer to: What renews soon?')).toBeInTheDocument();

    // 4. "Ask about this" on the call: typed in, not sent; sending names it.
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA check-in' }));
    expect(await within(rail()).findByText('Pizza EMEA · This call')).toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(2);
    await userEvent.type(composer(), '{Enter}');
    await screen.findByText('Answer to: What should I know about this call?');
    expect(postedBodies(copilot)[2].context).toEqual({ surface: 'accounts', view: 'detail', account: 12, focus: { kind: 'call', id: 112 } });

    // 5. History lists it, tagged with the server's label and the Accounts icon.
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /Who needs me first\?/ });
    expect(item).toHaveAccessibleName(/Who needs me first\?\s*Started on Accounts · Owner: Carl CSM/);
    expect(item.querySelector('svg.lucide-layers')).not.toBeNull();
  });
});
