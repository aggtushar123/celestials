import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import knowledgeReducer from '../../features/knowledge/knowledgeSlice';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import copilotSessionsReducer from '../../features/copilotSessions/copilotSessionsSlice';
import { CopilotIndex } from './Index';
import type { Conversation } from './types';
import type { CopilotSession } from '../../features/copilotSessions/types';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Integration tier — the "Ask Copilot about this account" entry point
// through to a real, backend-shaped session: Make Live, a redirect, and
// a hand-off. Phase 2a — see revenact-backend's services/copilot/models.py
// — real cross-user sessions over polling, no WebSocket push yet. Only
// the fetch boundary is mocked; a small in-test `sessionState` mutable
// object stands in for the real backend's own CopilotSession row so a
// POST .../session/ (make-live/handoff) and a later GET see consistent
// state, the same way the real backend would.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const PLACEHOLDER = "Ask anything — @mention a colleague or a function to route a question to them";
const alice = { id: 1, name: 'Alice' };

function conversationWith(userMessages: string[]): Conversation {
  const messages: Conversation['messages'] = [];
  userMessages.forEach((text, i) => {
    messages.push({ id: i * 2 + 1, role: 'user', content: text, sources: [], questions: [], created_at: '2026-09-05T10:00:00Z' });
    messages.push({ id: i * 2 + 2, role: 'assistant', content: `Real reply #${i + 1}`, sources: [], questions: [], created_at: '2026-09-05T10:00:05Z' });
  });
  return { id: 99, title: userMessages[0], messages, created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:05Z' };
}

function makeStore() {
  return configureStore({
    reducer: { auth: authReducer, copilotSessions: copilotSessionsReducer, knowledge: knowledgeReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'admin' as const,
          role_id: 1,
          role_name: 'Admin',
          permissions: ALL_CAPABILITIES,
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1,
            name: 'Acme Inc',
            slug: 'acme-inc',
            currency: 'USD' as const,
            currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '',
            ai_agent_enabled: true,
            ai_agent_tone: 'professional' as const,
            ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token',
        refreshToken: 'refresh',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
}

function renderAtEntryPoint() {
  render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={['/copilot?forCustomerId=7&forCustomerName=Pizza%20Hut']}>
        <CopilotIndex />
      </MemoryRouter>
    </Provider>
  );
}

/** A minimal stand-in for the real backend's own CopilotSession row —
 * mutated by the same POST bodies SessionView/SessionHandoffView would
 * act on, read back by the same GET a poll would hit. Starts `null`
 * (no session exists yet), same as a real conversation before "Make
 * this a live session" or a hand-off ever happens. */
function makeFetchMock() {
  let session: CopilotSession | null = null;

  return vi.fn((url: string, options?: { method?: string; body?: string }) => {
    const body = options?.body ? JSON.parse(options.body) : {};

    if (url.endsWith('/copilot/messages/') && options?.method === 'POST') {
      // Real backend behaviour being simulated here: a message into a
      // conversation that already has a session logs a real
      // `redirected` SessionEvent (see SendMessageView's own docstring)
      // — mirrored onto the mock session so the next fetchSession poll
      // picks it up, same as the real one would.
      if (body.conversation_id && session) {
        session = {
          ...session,
          events: [
            ...session.events,
            {
              id: session.events.length + 1,
              kind: 'redirected',
              actor: alice,
              message: { id: 3, role: 'user', created_at: 't3' },
              payload: {},
              created_at: 't3',
            },
          ],
        };
      }
      return Promise.resolve(
        jsonResponse(
          200,
          body.conversation_id
            ? conversationWith(['Why is Pizza Hut at risk?', 'Focus on the champion leaving'])
            : conversationWith(['Why is Pizza Hut at risk?'])
        )
      );
    }

    if (url.match(/\/copilot\/conversations\/\d+\/session\/$/) && options?.method === 'POST') {
      session = {
        id: 1,
        conversation_id: 99,
        owner: alice,
        customer_id: body.customer_id ?? null,
        customer_name: body.customer_id ? 'Pizza Hut' : null,
        account_id: null,
        account_name: null,
        status: 'live',
        participants: [{ user: alice, joined_at: 't1', left_at: null }],
        events: [{ id: 1, kind: 'made_live', actor: alice, message: null, payload: {}, created_at: 't1' }],
        created_at: 't1',
        closed_at: null,
      };
      return Promise.resolve(jsonResponse(200, session));
    }

    if (url.match(/\/copilot\/conversations\/\d+\/session\/handoff\/$/) && options?.method === 'POST') {
      session = {
        id: 1,
        conversation_id: 99,
        owner: alice,
        customer_id: body.customer_id ?? null,
        customer_name: body.customer_id ? 'Pizza Hut' : null,
        account_id: null,
        account_name: null,
        status: 'awaiting_handoff',
        participants: [{ user: alice, joined_at: 't1', left_at: null }],
        events: [
          {
            id: 2,
            kind: 'handed_off',
            actor: alice,
            message: null,
            payload: { to_user_id: body.to_user_id, to_user_name: 'Priya', note: body.note },
            created_at: 't2',
          },
        ],
        created_at: 't1',
        closed_at: null,
      };
      return Promise.resolve(jsonResponse(200, session));
    }

    if (url.match(/\/copilot\/conversations\/\d+\/session\/$/) && options?.method !== 'POST') {
      return session
        ? Promise.resolve(jsonResponse(200, session))
        : Promise.resolve(jsonResponse(404, { detail: 'no session' }));
    }

    if (url.endsWith('/auth/members/')) {
      return Promise.resolve(jsonResponse(200, [{ id: 2, name: 'Priya', email: 'priya@acme.io' }]));
    }

    return Promise.resolve(jsonResponse(200, []));
  });
}

describe('Multiplayer Copilot', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the "About" chip before the first message, from the entry-point query params', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderAtEntryPoint();

    expect(await screen.findByText('About: Pizza Hut')).toBeInTheDocument();
  });

  it('the first real message offers "Make this a live session" before any real session row exists', async () => {
    vi.stubGlobal('fetch', makeFetchMock());
    const user = userEvent.setup();
    renderAtEntryPoint();

    const input = await screen.findByPlaceholderText(PLACEHOLDER);
    await user.type(input, 'Why is Pizza Hut at risk?');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Make this a live session')).toBeInTheDocument();
  });

  it('"Make this a live session" is explicit opt-in and shows a real Live badge once clicked', async () => {
    vi.stubGlobal('fetch', makeFetchMock());
    const user = userEvent.setup();
    renderAtEntryPoint();

    await user.type(await screen.findByPlaceholderText(PLACEHOLDER), 'Why is Pizza Hut at risk?');
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Live')).not.toBeInTheDocument();

    await user.click(await screen.findByText('Make this a live session'));

    expect(await screen.findByText('Live')).toBeInTheDocument();
  });

  it('a second real message into an already-live session is tagged as a real redirect', async () => {
    vi.stubGlobal('fetch', makeFetchMock());
    const user = userEvent.setup();
    renderAtEntryPoint();

    const input = await screen.findByPlaceholderText(PLACEHOLDER);
    await user.type(input, 'Why is Pizza Hut at risk?');
    await user.keyboard('{Enter}');
    await screen.findByText('Real reply #1');
    await user.click(await screen.findByText('Make this a live session'));
    await screen.findByText('Live');

    await user.type(input, 'Focus on the champion leaving');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('↳ Redirected by Alice')).toBeInTheDocument();
  });

  it('hand-off picks a real teammate via /auth/members/, creates the session directly, and sets it to awaiting hand-off', async () => {
    vi.stubGlobal('fetch', makeFetchMock());
    const user = userEvent.setup();
    renderAtEntryPoint();

    await user.type(await screen.findByPlaceholderText(PLACEHOLDER), 'Why is Pizza Hut at risk?');
    await user.keyboard('{Enter}');
    await screen.findByText('Real reply #1');

    // Hand-off is available even though "Make this a live session" was
    // never clicked — see SessionHandoffView's own docstring on the
    // backend for why it independently creates the session.
    await user.click(screen.getByText('Hand off to…'));
    await user.selectOptions(await screen.findByLabelText('Hand off to'), '2');
    await user.type(screen.getByLabelText('Next action'), 'Own the recovery call.');
    await user.click(screen.getByRole('button', { name: 'Hand off' }));

    expect(await screen.findByText('Awaiting hand-off')).toBeInTheDocument();
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
  });
});
