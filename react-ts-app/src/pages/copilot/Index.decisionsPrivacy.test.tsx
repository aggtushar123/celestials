import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

// Privacy fix (SOC2:AUTH-02): session/decisions/ (GET and POST) and
// session/close/ with capture now come back with a `hidden` /
// `decisions_hidden` count alongside `proposals` / `decisions` — some
// task proposals left out because this reader can't open the customer
// they name. Index.tsx must keep that count across every one of those
// calls, and must not claim "nothing was decided" when the only thing
// that happened is that it's all hidden.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A promise this test can resolve on its own schedule — stands in for a
 *  real response that takes its time, landing well after the user has
 *  already moved on to another conversation. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets every microtask queued by a resolved fetch (response await,
 *  `.json()`, the `.then` chain in handleSelectChat) actually run before
 *  the next assertion — a single `await` only yields once. */
async function flushAsync() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const alice = { id: 1, name: 'Alice' };
const PLACEHOLDER = "Ask anything — @mention a colleague or a function to route a question to them";

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

/** Same shape as MultiplayerCopilot.test.tsx's own mock — a mutable
 * stand-in for the real backend's CopilotSession row — plus the two
 * decisions routes this fix touches. */
function makeFetchMock(decisionsResponse: { proposals: unknown[]; hidden: number }, closeResponse: { decisions: unknown[]; decisions_error: string | null; decisions_hidden: number }) {
  let session: CopilotSession | null = null;

  return vi.fn((url: string, options?: { method?: string }) => {
    if (url.endsWith('/copilot/messages/') && options?.method === 'POST') {
      return Promise.resolve(jsonResponse(200, conversationWith(['Why is Pizza Hut at risk?'])));
    }

    if (url.match(/\/copilot\/conversations\/\d+\/session\/$/) && options?.method === 'POST') {
      session = {
        id: 1,
        conversation_id: 99,
        owner: alice,
        customer_id: 7,
        customer_name: 'Pizza Hut',
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

    if (url.match(/\/copilot\/conversations\/\d+\/session\/$/) && options?.method !== 'POST') {
      return session
        ? Promise.resolve(jsonResponse(200, session))
        : Promise.resolve(jsonResponse(404, { detail: 'no session' }));
    }

    if (url.match(/\/session\/decisions\/$/) && options?.method === 'POST') {
      return Promise.resolve(jsonResponse(201, decisionsResponse));
    }

    if (url.match(/\/session\/close\/$/) && options?.method === 'POST') {
      session = session && { ...session, status: 'closed', closed_at: 't9' };
      return Promise.resolve(jsonResponse(200, { ...session, ...closeResponse }));
    }

    return Promise.resolve(jsonResponse(200, []));
  });
}

async function makeLiveAndOpen(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByPlaceholderText(PLACEHOLDER);
  await user.type(input, 'Why is Pizza Hut at risk?');
  await user.keyboard('{Enter}');
  await user.click(await screen.findByText('Make this a live session'));
  await screen.findByText('Live');
}

describe('Session decisions privacy (SOC2:AUTH-02)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the hidden count (not "nothing was decided") when a capture is entirely hidden', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ proposals: [], hidden: 2 }, { decisions: [], decisions_error: null, decisions_hidden: 0 }));
    const user = userEvent.setup();
    renderAtEntryPoint();
    await makeLiveAndOpen(user);

    await user.click(await screen.findByText('Capture decisions'));

    expect(await screen.findByText("2 more decisions about records you can't open")).toBeInTheDocument();
    expect(screen.queryByText('Nothing was decided in this session yet.')).not.toBeInTheDocument();
  });

  it('shows the hidden count (not "nothing was decided") when closing with a capture that is entirely hidden', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ proposals: [], hidden: 0 }, { decisions: [], decisions_error: null, decisions_hidden: 1 }));
    const user = userEvent.setup();
    renderAtEntryPoint();
    await makeLiveAndOpen(user);

    await user.click(await screen.findByText('Close session'));
    await user.click(await screen.findByText('Close and capture decisions'));

    expect(await screen.findByText("1 more decision about a record you can't open")).toBeInTheDocument();
    expect(screen.queryByText('Nothing was decided in this session.')).not.toBeInTheDocument();
  });

  it('picks up the hidden count from the GET when a chat is reopened from the sidebar', async () => {
    let session: CopilotSession | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        if (url.endsWith('/copilot/conversations/')) {
          return Promise.resolve(
            jsonResponse(200, [{ id: 99, title: 'Why is Pizza Hut at risk?', created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:00Z' }])
          );
        }
        if (url.match(/\/copilot\/conversations\/99\/$/)) {
          return Promise.resolve(jsonResponse(200, conversationWith(['Why is Pizza Hut at risk?'])));
        }
        if (url.match(/\/copilot\/conversations\/\d+\/session\/$/) && options?.method !== 'POST') {
          session = {
            id: 1,
            conversation_id: 99,
            owner: alice,
            customer_id: 7,
            customer_name: 'Pizza Hut',
            account_id: null,
            account_name: null,
            status: 'live',
            participants: [{ user: alice, joined_at: 't1', left_at: null }],
            events: [],
            created_at: 't1',
            closed_at: null,
          };
          return Promise.resolve(jsonResponse(200, session));
        }
        if (url.match(/\/session\/decisions\/$/) && options?.method !== 'POST') {
          return Promise.resolve(jsonResponse(200, { proposals: [], hidden: 5 }));
        }
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    const user = userEvent.setup();
    render(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={['/copilot']}>
          <CopilotIndex />
        </MemoryRouter>
      </Provider>
    );

    await user.click(await screen.findByLabelText('Expand sidebar'));
    await user.click(await screen.findByText('Why is Pizza Hut at risk?'));

    expect(await screen.findByText("5 more decisions about records you can't open")).toBeInTheDocument();
  });

  it('resets the hidden count on switch, so a failed or stale GET on the new conversation never leaves the old count showing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        if (url.endsWith('/copilot/conversations/')) {
          return Promise.resolve(
            jsonResponse(200, [
              { id: 99, title: 'Why is Pizza Hut at risk?', created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:00Z' },
              { id: 100, title: 'A second, unrelated chat', created_at: '2026-09-05T10:05:00Z', updated_at: '2026-09-05T10:05:00Z' },
            ])
          );
        }
        if (url.match(/\/copilot\/conversations\/99\/$/)) {
          return Promise.resolve(jsonResponse(200, conversationWith(['Why is Pizza Hut at risk?'])));
        }
        if (url.match(/\/copilot\/conversations\/100\/$/)) {
          return Promise.resolve(jsonResponse(200, conversationWith(['A second, unrelated chat'])));
        }
        // Both conversations have a real session, so the chat's decisions
        // area renders for either one — the bug isn't about that area
        // disappearing, it's about the figure inside it going stale.
        if (url.match(/\/copilot\/conversations\/(99|100)\/session\/$/) && options?.method !== 'POST') {
          const conversationId = url.includes('/99/') ? 99 : 100;
          return Promise.resolve(
            jsonResponse(200, {
              id: conversationId,
              conversation_id: conversationId,
              owner: alice,
              customer_id: 7,
              customer_name: 'Pizza Hut',
              account_id: null,
              account_name: null,
              status: 'live',
              participants: [{ user: alice, joined_at: 't1', left_at: null }],
              events: [],
              created_at: 't1',
              closed_at: null,
            })
          );
        }
        if (url.match(/\/copilot\/conversations\/99\/session\/decisions\/$/) && options?.method !== 'POST') {
          return Promise.resolve(jsonResponse(200, { proposals: [], hidden: 5 }));
        }
        if (url.match(/\/copilot\/conversations\/100\/session\/decisions\/$/) && options?.method !== 'POST') {
          // The second conversation's own GET fails outright — this must
          // not leave the first conversation's hidden count on screen.
          return Promise.resolve(jsonResponse(500, { detail: 'server error' }));
        }
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    const user = userEvent.setup();
    render(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={['/copilot']}>
          <CopilotIndex />
        </MemoryRouter>
      </Provider>
    );

    await user.click(await screen.findByLabelText('Expand sidebar'));
    await user.click(await screen.findByText('Why is Pizza Hut at risk?'));
    expect(await screen.findByText("5 more decisions about records you can't open")).toBeInTheDocument();

    await user.click(screen.getByText('A second, unrelated chat'));
    expect(screen.queryByText("5 more decisions about records you can't open")).not.toBeInTheDocument();
  });

  it('never lets an earlier conversation\'s slow decisions GET land after a switch and clobber the new one', async () => {
    const aDecisions = deferred<ReturnType<typeof jsonResponse>>();

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        if (url.endsWith('/copilot/conversations/')) {
          return Promise.resolve(
            jsonResponse(200, [
              { id: 99, title: 'Conversation A', created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:00Z' },
              { id: 100, title: 'Conversation B', created_at: '2026-09-05T10:05:00Z', updated_at: '2026-09-05T10:05:00Z' },
            ])
          );
        }
        if (url.match(/\/copilot\/conversations\/99\/$/)) {
          return Promise.resolve(jsonResponse(200, conversationWith(['First conversation'])));
        }
        if (url.match(/\/copilot\/conversations\/100\/$/)) {
          return Promise.resolve(jsonResponse(200, conversationWith(['Second conversation'])));
        }
        if (url.match(/\/copilot\/conversations\/(99|100)\/session\/$/) && options?.method !== 'POST') {
          const conversationId = url.includes('/99/') ? 99 : 100;
          return Promise.resolve(
            jsonResponse(200, {
              id: conversationId,
              conversation_id: conversationId,
              owner: alice,
              customer_id: 7,
              customer_name: 'Pizza Hut',
              account_id: null,
              account_name: null,
              status: 'live',
              participants: [{ user: alice, joined_at: 't1', left_at: null }],
              events: [],
              created_at: 't1',
              closed_at: null,
            })
          );
        }
        if (url.match(/\/copilot\/conversations\/99\/session\/decisions\/$/) && options?.method !== 'POST') {
          // A's own GET — slow. Resolved explicitly, below, well after B
          // has already been selected.
          return aDecisions.promise;
        }
        if (url.match(/\/copilot\/conversations\/100\/session\/decisions\/$/) && options?.method !== 'POST') {
          return Promise.resolve(jsonResponse(200, { proposals: [], hidden: 7 }));
        }
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    const user = userEvent.setup();
    render(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={['/copilot']}>
          <CopilotIndex />
        </MemoryRouter>
      </Provider>
    );

    await user.click(await screen.findByLabelText('Expand sidebar'));
    await user.click(await screen.findByText('Conversation A'));
    // A's conversation and session load fine; only its decisions GET is
    // held open.
    await screen.findByText('First conversation');

    // Switch away before A's decisions GET ever resolves.
    await user.click(screen.getByText('Conversation B'));
    expect(await screen.findByText("7 more decisions about records you can't open")).toBeInTheDocument();

    // A's slow GET finally lands, long after the switch.
    aDecisions.resolve(jsonResponse(200, { proposals: [], hidden: 42 }));
    await flushAsync();

    // B's own, correct count must still be the one on screen.
    expect(screen.getByText("7 more decisions about records you can't open")).toBeInTheDocument();
    expect(screen.queryByText("42 more decisions about records you can't open")).not.toBeInTheDocument();
  });

  it('still shows "nothing was decided" when a capture truly found nothing', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ proposals: [], hidden: 0 }, { decisions: [], decisions_error: null, decisions_hidden: 0 }));
    const user = userEvent.setup();
    renderAtEntryPoint();
    await makeLiveAndOpen(user);

    await user.click(await screen.findByText('Capture decisions'));

    expect(await screen.findByText('Nothing was decided in this session yet.')).toBeInTheDocument();
  });
});
