import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { resetViewport } from '../../../test/viewport';
import { renderAccounts } from '../testList';
import { stubAccountsAsk } from './testAccountsAsk';

const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const where = () => screen.getByTestId('where');
const history = () => within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' });

const conversation = (id: number, title: string, origin: Record<string, unknown>) => ({
  id,
  title,
  created_at: '',
  updated_at: '',
  origin,
  messages: [
    { id: 1, role: 'user', content: title, context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: `Answer: ${title}`, sources: [], questions: [], created_at: '' },
  ],
});

const ON_BOARD = conversation(14, 'What renews soon?', {
  surface: 'accounts',
  view: 'board',
  filters: { renews_within: '30' },
  label: 'Accounts · Renews within 30 days',
});
const ON_EMEA = conversation(15, 'What does this mean for EMEA?', { surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' });
const UNGROUPED = conversation(16, 'Who is unassigned?', {
  surface: 'accounts',
  view: 'list',
  filters: { owner: 'unassigned', group: '' },
  label: 'Accounts · Owner: Unassigned',
});
const ON_ORGANIZATIONS = conversation(9, 'Which accounts need me first?', {
  surface: 'organizations',
  view: 'list',
  filters: { owner: '2' },
  labels: ['Owner: Carl CSM'],
});

describe('History on Accounts', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("tags a Board conversation with the server's label and reopens it on the Board with its filters", async () => {
    stubAccountsAsk({ copilot: { conversations: [ON_BOARD], conversationById: { 14: ON_BOARD } } });
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /What renews soon\?/ });
    expect(within(item).getByText('Accounts · Renews within 30 days')).toBeInTheDocument();
    await userEvent.click(item);
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/board?renews_within=30'));
    expect(await within(log()).findByText('Answer: What renews soon?')).toBeInTheDocument();
  });

  it("reopens an account's conversation on its page", async () => {
    stubAccountsAsk({ copilot: { conversations: [ON_EMEA], conversationById: { 15: ON_EMEA } } });
    renderAccounts('/accounts/list', { ask: true, realPage: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /What does this mean for EMEA\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/12'));
    await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
    expect(await within(log()).findByText('Answer: What does this mean for EMEA?')).toBeInTheDocument();
  });

  it("reopens an ungrouped List as the URL's group=none", async () => {
    stubAccountsAsk({ copilot: { conversations: [UNGROUPED], conversationById: { 16: UNGROUPED } } });
    renderAccounts('/accounts/board', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /Who is unassigned\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/list?owner=unassigned&group=none'));
  });

  it("sends another surface's conversation to its own page", async () => {
    stubAccountsAsk({ copilot: { conversations: [ON_ORGANIZATIONS], conversationById: { 9: ON_ORGANIZATIONS } } });
    renderAccounts('/accounts/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza EMEA' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /Which accounts need me first\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/organizations/list?owner=2'));
  });

  it("opens a conversation handed over from another surface's History in the rail", async () => {
    stubAccountsAsk();
    renderAccounts({ pathname: '/accounts/12', state: { askConversationId: 15, askConversation: ON_EMEA } }, { ask: true, realPage: true, width: 1100 });
    await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' });
    expect(await within(log()).findByText('Answer: What does this mean for EMEA?')).toBeInTheDocument();
  });
});
