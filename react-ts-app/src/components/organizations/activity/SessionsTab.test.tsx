import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SessionsTab } from './SessionsTab';
import type { CopilotSession } from '../../../features/copilotSessions/types';

const carl = { id: 1, name: 'Carl' };

function session(overrides: Partial<CopilotSession> = {}): CopilotSession {
  return {
    id: 9,
    conversation_id: 1,
    owner: carl,
    customer_id: 7,
    customer_name: 'Pizza Hut',
    account_id: null,
    account_name: null,
    status: 'private',
    participants: [{ user: carl, joined_at: '2026-09-05T10:00:00Z', left_at: null }],
    events: [],
    created_at: '2026-09-05T10:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

function renderTab(sessions: CopilotSession[]) {
  render(
    <MemoryRouter initialEntries={['/organizations/7']}>
      <Routes>
        <Route path="/organizations/7" element={<SessionsTab sessions={sessions} />} />
        <Route path="/copilot" element={<div>COPILOT PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SessionsTab', () => {
  it('shows an empty state with no sessions', () => {
    renderTab([]);
    expect(screen.getByText('No Copilot sessions yet')).toBeInTheDocument();
  });

  it('renders a session with its own real company, owner, and status', () => {
    renderTab([session()]);
    expect(screen.getByText('Pizza Hut')).toBeInTheDocument();
    expect(screen.getByText('Carl')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('shows a live session with a Live status pill', () => {
    renderTab([session({ status: 'live' })]);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('sorts sessions newest-first', () => {
    renderTab([
      session({ id: 1, customer_name: 'Older Co', created_at: '2026-09-01T00:00:00Z' }),
      session({ id: 2, customer_name: 'Newer Co', created_at: '2026-09-05T00:00:00Z' }),
    ]);
    const rendered = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(rendered).toEqual(['Newer Co', 'Older Co']);
  });

  it('clicking a session navigates to its own real Copilot conversation link', async () => {
    const user = userEvent.setup();
    renderTab([session()]);

    await user.click(screen.getByText('Pizza Hut'));

    expect(await screen.findByText('COPILOT PAGE')).toBeInTheDocument();
  });
});
