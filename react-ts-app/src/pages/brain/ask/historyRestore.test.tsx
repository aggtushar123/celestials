import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { DO } from '../../../features/brain/doingText';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier (brain ask final review, Important 1): History restore
// and the shared reader's view, on the real Brain pages and router. Only
// fetch is stubbed (stubBrainAsk). The Brain is the one surface whose scope
// settles asynchronously, after arrival, so this is where a handover
// regression (useBrainScope's `replace` navigation, AskProvider's
// handover-clearing navigate) would hide.
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const history = () => within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' });

const conversation = (id: number, title: string, origin: Record<string, unknown>) => ({
  id,
  title,
  created_at: '',
  updated_at: '',
  origin,
  messages: [
    { id: 1, role: 'user', content: title, context: { ...origin }, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: `Answer: ${title}`, sources: [], questions: [], created_at: '' },
  ],
});

const ON_DOING_TEAM = conversation(31, 'Which initiatives slipped?', { surface: 'brain', scope: 'team', tab: 'doing' });
const ON_CHANGED_TEAM = conversation(32, 'Why did it move?', { surface: 'brain', scope: 'team', tab: 'changed' });

// A mentioned reader's view of a shared conversation whose reply is
// withheld (revenact-backend services/copilot/views.py REDACTED_REPLY): the
// user turn comes back with its Ask context stripped, and the conversation
// has no origin, so it carries no History tag either.
const WITHHELD_SUMMARY = { id: 33, title: 'Withheld question', created_at: '', updated_at: '', origin: null };
const REDACTED_REPLY = "This reply isn't shared with you: it draws on records outside what you may see.";
const WITHHELD = {
  ...WITHHELD_SUMMARY,
  visibility: 'partial',
  messages: [
    { id: 1, role: 'user', content: 'Withheld question', context: null, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: REDACTED_REPLY, sources: [], questions: [], created_at: '' },
  ],
};

describe('History on the Brain (brain ask final review, Important 1)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('picks a conversation from another Brain tab and scope, and reopens it on its own', async () => {
    const { copilot } = stubBrainAsk({ copilot: { conversations: [ON_DOING_TEAM], conversationById: { 31: ON_DOING_TEAM } } });
    renderBrain('/brain?scope=me');
    await screen.findByRole('group', { name: 'View' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /Which initiatives slipped\?/ });
    await userEvent.click(item);
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=team'));
    await screen.findByRole('heading', { level: 2, name: DO.INITIATIVES });
    expect(await within(log()).findByText('Answer: Which initiatives slipped?')).toBeInTheDocument();
    await userEvent.type(composer(), 'Which first?{Enter}');
    expect(await within(log()).findByText('Answer to: Which first?')).toBeInTheDocument();
    expect(postedBodies(copilot).at(-1)).toMatchObject({ content: 'Which first?', context: { surface: 'brain', scope: 'team', tab: 'doing' } });
  });

  it("opens a conversation handed over from another surface's History, on its Brain tab and scope", async () => {
    stubBrainAsk();
    renderBrain({ pathname: '/brain', search: '?scope=team', state: { askConversationId: 32, askConversation: ON_CHANGED_TEAM } }, { width: 1100 });
    expect(await within(log()).findByText('Answer: Why did it move?')).toBeInTheDocument();
    expect(where()).toBe('/brain?scope=team');
  });

  it('lists a withheld conversation with no tag, and opens it here, its question with no chip', async () => {
    stubBrainAsk({ copilot: { conversations: [WITHHELD_SUMMARY], conversationById: { 33: WITHHELD } } });
    renderBrain('/brain?scope=team');
    await screen.findByText('Since 30 Sep month-end');
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /Withheld question/ });
    expect(item).toHaveAccessibleName('Withheld question');
    await userEvent.click(item);
    const question = await within(log()).findByText('Withheld question');
    expect(question.parentElement!.children).toHaveLength(1);
    expect(within(log()).getByText(REDACTED_REPLY)).toBeInTheDocument();
    expect(where()).toBe('/brain?scope=team');
  });
});
