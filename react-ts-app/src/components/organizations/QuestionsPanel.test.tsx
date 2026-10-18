import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import knowledgeReducer from '../../features/knowledge/knowledgeSlice';
import { QuestionsPanel } from './QuestionsPanel';
import { capabilitiesForRole } from '../../test/capabilities';

const mei = { id: 5, name: 'Mei Tanaka', function: 'analytics' as const };
const alice = { id: 1, name: 'Alice Admin', function: 'leadership' as const };
const open = {
  id: 11, customer: { id: 7, name: 'Pizza Hut' }, asked_by: alice, assignee: mei,
  text: '@Mei Tanaka why is Pizza Hut usage down?', status: 'open' as const, status_display: 'Open',
  answer: null, message_id: null, days_open: 0, created_at: '2026-09-13T09:00:00Z', answered_at: null,
};
const answered = {
  ...open, id: 12, status: 'answered' as const, status_display: 'Answered', text: 'Is the SSO fix on track?',
  assignee: { id: 6, name: 'Priya Nair', function: 'engineering' as const },
  answer: { id: 40, customer_id: 7, customer_name: 'Pizza Hut', author: { id: 6, name: 'Priya Nair' }, function: 'engineering' as const, function_display: 'Engineering', reports_to: null, body: 'In answer to Alice Admin\'s question "Is the SSO fix on track?": Yes, 25 Sep.', created_at: '2026-09-13T10:00:00Z', updated_at: '2026-09-13T10:00:00Z' },
  answered_at: '2026-09-13T10:00:00Z',
};

function mockApi() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: true, status, json: async () => body });
    if (url.includes('/answer/')) {
      const body = JSON.parse(String(init?.body));
      return ok({ ...open, status: 'answered', status_display: 'Answered', answer: { ...answered.answer, id: 41, author: { id: 5, name: 'Mei Tanaka' }, function: 'analytics', function_display: 'Analytics', reports_to: null, body: `In answer to Alice Admin's question "${open.text}": ${body.body}` } });
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return ok([{ ...open, id: 13, text: body.text, assignee: body.assignee_id === 6 ? answered.assignee : mei }], 201);
    }
    return ok([open, answered]);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderPanel(userId: number) {
  const store = configureStore({
    reducer: { auth: authReducer, knowledge: knowledgeReducer },
    preloadedState: {
      auth: {
        user: {
          id: userId, email: 'x@acme.io', name: userId === 5 ? 'Mei Tanaka' : 'Alice Admin', avatar: '', role: 'admin', role_id: 1,
          role_name: 'Admin', permissions: capabilitiesForRole('admin'),
          function: userId === 5 ? ('analytics' as const) : ('leadership' as const), function_display: 'x', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  const members = [
    { id: 1, name: 'Alice Admin', function: 'leadership' as const },
    { id: 5, name: 'Mei Tanaka', function: 'analytics' as const },
    { id: 6, name: 'Priya Nair', function: 'engineering' as const },
  ] as unknown as import('../../features/auth/authSlice').User[];
  render(
    <Provider store={store}>
      <QuestionsPanel customerId={7} customerName="Pizza Hut" members={members} />
    </Provider>
  );
}

describe('QuestionsPanel', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('lists open questions first with who asked whom, and answers stripped of their preamble', async () => {
    mockApi();
    renderPanel(1);

    const cards = await screen.findAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('Alice Admin asked Mei Tanaka (Analytics)');
    expect(cards[0]).toHaveTextContent('Waiting on Mei Tanaka.');
    expect(cards[1]).toHaveTextContent('Yes, 25 Sep.');
    expect(cards[1]).not.toHaveTextContent('In answer to');
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('asks a named person, and lets the person asked answer', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderPanel(1);

    await screen.findAllByRole('listitem');
    await user.type(screen.getByLabelText('Ask a question about Pizza Hut'), 'Is the renewal at risk?');
    await user.selectOptions(screen.getByLabelText('Who should answer'), '6');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Is the renewal at risk?')).toBeInTheDocument();
    const post = spy.mock.calls.find(([u, init]) => init?.method === 'POST' && !String(u).includes('/answer/'));
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ text: 'Is the renewal at risk?', assignee_id: 6 });
    // The asker cannot answer her own question to Mei.
    expect(screen.queryByLabelText(/Your answer/)).not.toBeInTheDocument();
  });

  it('shows the answer box only to the person asked, and the answer becomes the record', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPanel(5);

    const card = (await screen.findAllByRole('listitem'))[0];
    await user.type(within(card).getByLabelText(/Your answer, stored as knowledge under Analytics/), 'Reporting module broke in March.');
    await user.click(within(card).getByRole('button', { name: 'Answer' }));
    expect(await screen.findByText('Reporting module broke in March.')).toBeInTheDocument();
    expect(screen.queryByText('open')).not.toBeInTheDocument();
  });

  it('counts open questions in neutral ink and marks each status with a badge', async () => {
    mockApi();
    renderPanel(1);
    expect(await screen.findByText('open')).not.toHaveClass('text-warning');
    expect(screen.getByText(open.status_display)).toHaveClass('rounded-full', 'bg-subtle');
    expect(screen.getByText(answered.status_display)).toHaveClass('bg-success-dim', 'text-success-ink');
    expect(screen.getByRole('combobox', { name: 'Who should answer' })).toHaveClass('min-h-11');
  });
});
