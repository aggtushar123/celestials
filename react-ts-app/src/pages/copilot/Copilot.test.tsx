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
import type { Conversation, ConversationSummary } from './types';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Integration tier (see the `testing` skill): only the fetch boundary is
// mocked — real component tree, same convention as the Campaigns pages'
// own tests, now that a real copilot app backs this (see
// docs/API_CONTRACTS.md's `copilot` section). Wrapped in a real Redux
// Provider + MemoryRouter now that Multiplayer Copilot sessions (see
// features/copilotSessions/) need both — real auth state for
// ownerId/ownerName, real router context for useSearchParams.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const PLACEHOLDER = "Ask anything — @mention a colleague or a function to route a question to them";

const existingConversation: ConversationSummary = {
  id: 1,
  title: "What's my churn risk?",
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:05:00Z',
};

function conversationDetail(overrides: Partial<Conversation> = {}): Conversation {
  return {
    ...existingConversation,
    messages: [
      { id: 1, role: 'user', content: "What's my churn risk?", sources: [], questions: [], created_at: '2026-09-01T00:00:00Z' },
      { id: 2, role: 'assistant', content: 'Two accounts look at risk.', sources: [], questions: [], created_at: '2026-09-01T00:00:05Z' },
    ],
    ...overrides,
  };
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

function renderCopilot() {
  render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={['/copilot']}>
        <CopilotIndex />
      </MemoryRouter>
    </Provider>
  );
}

async function expandSidebar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Expand sidebar'));
}

describe('Copilot (/copilot)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // jsdom doesn't implement scrollIntoView — HomeView's own
    // selected-skill effect calls it (pre-existing, unrelated to this
    // feature) once a skill card is actually selected.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('loads real conversation history on mount and renders it in the sidebar', async () => {
    // The questions inbox asks /questions/ on mount; everything else here is the history list.
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(jsonResponse(200, String(url).includes('/questions/') ? [] : [existingConversation]))));
    const user = userEvent.setup();
    renderCopilot();

    await expandSidebar(user);

    expect(await screen.findByText("What's my churn risk?")).toBeInTheDocument();
  });

  it('sending a message POSTs to /copilot/messages/ and renders the real assistant reply', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url.endsWith('/copilot/conversations/')) {
        return Promise.resolve(jsonResponse(200, []));
      }
      if (url.endsWith('/copilot/messages/') && options?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, conversationDetail()));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCopilot();

    const input = await screen.findByPlaceholderText(PLACEHOLDER);
    await user.type(input, "What's my churn risk?");
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Two accounts look at risk.')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall![1]!.body!);
    expect(body).toEqual({ conversation_id: undefined, content: "What's my churn risk?" });
  });

  it('selecting a past conversation loads its real messages', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/copilot/conversations/')) {
        return Promise.resolve(jsonResponse(200, [existingConversation]));
      }
      if (url.endsWith('/copilot/conversations/1/')) {
        return Promise.resolve(jsonResponse(200, conversationDetail()));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCopilot();

    await expandSidebar(user);
    await user.click(await screen.findByText("What's my churn risk?"));

    expect(await screen.findByText('Two accounts look at risk.')).toBeInTheDocument();
  });

  it('a disabled-Copilot 403 surfaces as a real error message, not a crash', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url.endsWith('/copilot/conversations/')) {
        return Promise.resolve(jsonResponse(200, []));
      }
      if (url.endsWith('/copilot/messages/') && options?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(403, { detail: 'AI Copilot is disabled for your organisation.' })
        );
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCopilot();

    const input = await screen.findByPlaceholderText(PLACEHOLDER);
    await user.type(input, 'Hello');
    await user.keyboard('{Enter}');

    expect(
      await screen.findByText('AI Copilot is disabled for your organisation.')
    ).toBeInTheDocument();
  });

  it('a Built-in Skill card can be run for a real send', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url.endsWith('/copilot/conversations/')) {
        return Promise.resolve(jsonResponse(200, []));
      }
      if (url.endsWith('/copilot/messages/') && options?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, conversationDetail({ title: 'Skill run' })));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCopilot();

    await user.click(await screen.findByRole('button', { name: /Internal Business Review/ }));
    await user.click(await screen.findByRole('button', { name: 'Run skill' }));

    const postCall = await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
      expect(call).toBeTruthy();
      return call!;
    });
    const body = JSON.parse((postCall[1] as { body: string }).body);
    expect(body.content).toContain('Internal Business Review');
  });
});
