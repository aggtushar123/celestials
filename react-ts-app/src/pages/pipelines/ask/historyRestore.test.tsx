import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderPipelines } from '../testPages';
import { stubPipelinesAsk } from './testPipelinesAsk';

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

const ON_RISKS_BOARD = conversation(16, 'Which risks are urgent?', {
  surface: 'pipelines',
  kind: 'risks',
  view: 'board',
  filters: { priority: 'high' },
  label: 'Pipelines · Risks · Priority: High',
});
const UNGROUPED = conversation(18, 'What is unassigned?', {
  surface: 'pipelines',
  kind: 'opportunities',
  view: 'list',
  filters: { owner: '2', group: 'none' },
  label: 'Pipelines · Opportunities · Owner: Carl CSM',
});
const ON_EMEA = conversation(15, 'What does this mean for EMEA?', { surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' });

// A mentioned reader's view of a shared conversation whose reply is
// withheld (backend fix, 2026-10-01): the user turn comes back with its Ask
// context stripped, and the conversation has no origin.
const WITHHELD_SUMMARY = { id: 17, title: 'Withheld question', created_at: '', updated_at: '', origin: null };
// The reply itself (revenact-backend services/copilot/views.py REDACTED_REPLY),
// included for defence in depth: no chip assertion depends on its content.
const REDACTED_REPLY = "This reply isn't shared with you: it draws on records outside what you may see.";
const WITHHELD = {
  ...WITHHELD_SUMMARY,
  visibility: 'partial',
  messages: [
    { id: 1, role: 'user', content: 'Withheld question', context: null, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: REDACTED_REPLY, sources: [], questions: [], created_at: '' },
  ],
};

describe('History on Pipelines', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("tags a risks conversation with the server's label and reopens it on the risks Board with its filters", async () => {
    stubPipelinesAsk({ copilot: { conversations: [ON_RISKS_BOARD], conversationById: { 16: ON_RISKS_BOARD } } });
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /Which risks are urgent\?/ });
    expect(within(item).getByText('Pipelines · Risks · Priority: High')).toBeInTheDocument();
    await userEvent.click(item);
    await waitFor(() => expect(where()).toHaveTextContent('/pipelines/board?kind=risks&priority=high'));
    expect(await within(log()).findByText('Answer: Which risks are urgent?')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Admin left' })).toBeInTheDocument();
  });

  it('reopens an ungrouped List as group=none', async () => {
    stubPipelinesAsk({ copilot: { conversations: [UNGROUPED], conversationById: { 18: UNGROUPED } } });
    renderPipelines('/pipelines/board', { ask: true });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /What is unassigned\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/pipelines/list?owner=2&group=none'));
  });

  it("sends another surface's conversation to its own page", async () => {
    stubPipelinesAsk({ copilot: { conversations: [ON_EMEA], conversationById: { 15: ON_EMEA } } });
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /What does this mean for EMEA\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/12'));
  });

  it("opens a conversation handed over from another surface's History in the rail, even below xl", async () => {
    stubPipelinesAsk();
    renderPipelines(
      { pathname: '/pipelines/board', search: '?kind=risks&priority=high', state: { askConversationId: 16, askConversation: ON_RISKS_BOARD } },
      { ask: true, width: 1100 },
    );
    expect(await within(log()).findByText('Answer: Which risks are urgent?')).toBeInTheDocument();
  });

  it('lists a withheld conversation with no tag, and opens it here, its question with no chip', async () => {
    stubPipelinesAsk({ copilot: { conversations: [WITHHELD_SUMMARY], conversationById: { 17: WITHHELD } } });
    renderPipelines('/pipelines/list?owner=2', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /Withheld question/ });
    expect(item).toHaveAccessibleName('Withheld question');
    await userEvent.click(item);
    const question = await within(log()).findByText('Withheld question');
    expect(question.parentElement!.children).toHaveLength(1);
    expect(where()).toHaveTextContent('/pipelines/list?owner=2');
  });
});
