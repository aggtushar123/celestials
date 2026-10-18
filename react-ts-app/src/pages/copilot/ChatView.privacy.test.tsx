import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatView } from './ChatView';
import type { CopilotSession, SessionEvent } from '../../features/copilotSessions/types';

// The backend nulls customer_name, account_name and a hand-off's note for
// a viewer who may not see them. The chat must never print "null".
const alice = { id: 1, name: 'Alice' };

function handedOff(note: string | null): SessionEvent {
  return {
    id: 7,
    kind: 'handed_off',
    actor: alice,
    message: null,
    payload: { to_user_id: 2, to_user_name: 'Priya', note },
    created_at: '2026-09-12T10:05:00Z',
  };
}

function session(overrides: Partial<CopilotSession> = {}): CopilotSession {
  return {
    id: 1,
    conversation_id: 9,
    owner: alice,
    customer_id: 3,
    customer_name: null,
    account_id: 4,
    account_name: null,
    status: 'awaiting_handoff',
    participants: [{ user: alice, joined_at: '2026-09-12T10:00:00Z', left_at: null }],
    events: [handedOff(null)],
    created_at: '2026-09-12T10:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

const message = { id: 1, role: 'user' as const, content: 'Who owns the renewal?', sources: [], questions: [], created_at: '2026-09-12T10:00:00Z' };

function renderView(s: CopilotSession) {
  return render(
    <MemoryRouter>
      <ChatView messages={[message]} onSendPrompt={() => {}} session={s} currentUserId={1} />
    </MemoryRouter>
  );
}

describe('ChatView with privacy-nulled session fields', () => {
  it('renders a hand-off with a null note without the note and without "null"', () => {
    const { container } = renderView(session());
    expect(screen.getByText('Alice → Priya')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null|undefined/);
  });

  it('renders the note when the viewer may see it', () => {
    renderView(session({ events: [handedOff('Renewal is yours now.')] }));
    expect(screen.getByText('Alice → Priya — "Renewal is yours now."')).toBeInTheDocument();
  });

  it('shows no "About:" label when neither name is visible', () => {
    renderView(session());
    expect(screen.queryByText(/About:/)).not.toBeInTheDocument();
  });

  it('shows the account name when only that is visible', () => {
    renderView(session({ account_name: 'Pizza Hut EU' }));
    expect(screen.getByText(/About: Pizza Hut EU/)).toBeInTheDocument();
  });
});
