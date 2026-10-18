import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard, Where } from './testAsk';
import { ASK_PREFERENCE_KEY } from './askPreference';

const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

describe('reopening from history on the dashboard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('goes to the view and filters the conversation started on, then shows it', async () => {
    stubCopilot({
      conversations: [{ id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin }],
      conversationById: {
        9: {
          id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin,
          messages: [
            { id: 1, role: 'user', content: 'Why is at-risk ARR up?', context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
            { id: 2, role: 'assistant', content: 'Two renewals slipped.', sources: [], questions: [], created_at: '' },
          ],
        },
      },
    });
    renderDashboard('/dashboard/overview', () => <Where />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    await userEvent.click(await within(panel).findByRole('button', { name: /Why is at-risk ARR up\?/ }));
    expect(await screen.findByText('Two renewals slipped.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2'));
  });

  it('opens a conversation from elsewhere where you are', async () => {
    stubCopilot({
      conversations: [{ id: 4, title: 'Pizza Hut mail', created_at: '', updated_at: '', origin: null }],
      conversationById: { 4: { id: 4, title: 'Pizza Hut mail', created_at: '', updated_at: '', origin: null, messages: [{ id: 1, role: 'assistant', content: 'They replied.', sources: [], questions: [], created_at: '' }] } },
    });
    renderDashboard('/dashboard/health/triage', () => <Where />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut mail' }));
    expect(await screen.findByText('They replied.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/health/triage'));
  });

  const pizza = {
    conversations: [{ id: 4, title: 'Pizza Hut mail', created_at: '', updated_at: '', origin: null }],
    conversationById: { 4: { id: 4, title: 'Pizza Hut mail', created_at: '', updated_at: '', origin: null, messages: [{ id: 1, role: 'assistant', content: 'They replied.', sources: [], questions: [], created_at: '' }] } },
  };

  it('opens from History without saving the open choice', async () => {
    stubCopilot(pizza);
    renderDashboard('/dashboard/overview', () => <Where />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut mail' }));
    expect(await screen.findByText('They replied.')).toBeInTheDocument();
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBeNull();
  });

  it('keeps a conversation picked while an answer was in flight when that answer lands', async () => {
    const { spy, release } = stubCopilot({ ...pizza, hold: true });
    renderDashboard('/dashboard/overview', () => <Where />, 1440);
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What needs me?{enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Thinking…');
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut mail' }));
    expect(await screen.findByText('They replied.')).toBeInTheDocument();
    // Let the held answer land, and wait for the thread to have received it
    // (the POST's reply delivered), not for a tick.
    act(() => release());
    const post = spy.mock.calls.findIndex(([url, init]) => String(url).includes('/copilot/messages/') && init?.method === 'POST');
    await waitFor(() => expect(spy.mock.settledResults[post]?.type).toBe('fulfilled'));
    expect(postedBodies(spy)).toHaveLength(1);
    // The picked conversation stays on screen; the late answer is dropped.
    expect(await screen.findByText('They replied.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Answer to: What needs me?')).not.toBeInTheDocument());
  });
});
