import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChatView } from './ChatView';
import type { CopilotMessage } from './types';

const answer: CopilotMessage = {
  id: 2,
  role: 'assistant',
  content: 'Two renewals need attention:\n\n1. **Pizza Hut** renews on `2026-10-22` with usage down 30%.\n2. Sardine has an open escalation.\n\n- Both owners are on leave this week.',
  sources: [],
  questions: [],
  created_at: '2026-09-22T10:00:00Z',
};

const question: CopilotMessage = { id: 1, role: 'user', content: 'Which renewals are at risk?', sources: [], questions: [], created_at: '2026-09-22T09:59:00Z' };

function renderChat(props: Partial<React.ComponentProps<typeof ChatView>> = {}) {
  return render(
    <MemoryRouter>
      <ChatView messages={[question, answer]} onSendPrompt={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

describe('ChatView answers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders an answer as structure: lists, emphasis and code, not a wall of text', () => {
    renderChat();
    const article = screen.getByRole('article', { name: /copilot answer/i });
    expect(within(article).getAllByRole('listitem')).toHaveLength(3);
    expect(within(article).getByText('Pizza Hut').tagName).toBe('STRONG');
    expect(within(article).getByText('2026-10-22').tagName).toBe('CODE');
    expect(within(article).getByText(/Two renewals need attention/)).toBeInTheDocument();
  });

  it('Copy puts the answer on the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderChat();
    const article = screen.getByRole('article', { name: /copilot answer/i });
    await userEvent.click(within(article).getByRole('button', { name: /copy answer/i }));
    expect(writeText).toHaveBeenCalledWith(answer.content);
    expect(await within(article).findByText('Copied')).toBeInTheDocument();
    // Nothing records a thumbs up or down, so there is no such button.
    expect(within(article).queryByRole('button', { name: /thumbs|helpful/i })).not.toBeInTheDocument();
  });

  it('shows the thinking state as a live region, and the send button only lights up with text', async () => {
    renderChat({ isSending: true });
    expect(screen.getByRole('status')).toHaveTextContent(/thinking/i);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
  });

  it('uses no raw white anywhere, so dark mode has no light band behind the ask box', () => {
    const { container } = renderChat();
    expect(container.querySelector('[class*="from-white"], [class*="bg-white"], [class*="text-white"]')).toBeNull();
    expect(container.querySelector('[class*="blur-sm"], [class*="animate-bounce"]')).toBeNull();
  });
});
