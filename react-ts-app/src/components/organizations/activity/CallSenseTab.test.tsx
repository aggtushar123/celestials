import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../../features/auth/authSlice';
import callsReducer from '../../../features/calls/callsSlice';
import filesReducer from '../../../features/files/filesSlice';
import { CallSenseTab } from './CallSenseTab';

const renewal = {
  id: 1, title: 'EMEA Retail - Renewal readiness', host_name: 'Chamath Gamage', occurred_at: '2026-09-16T11:12:00Z',
  duration_minutes: 45, summary: 'They want the enterprise tier by Q4 and asked about SSO.', sentiment: 'positive' as const,
  ai_area: 'product_growth', ai_category: 'Expansion', recording_url: 'https://tldv.io/r/1', connector_name: 'tl;dv', connector_provider: 'zoom',
  logged_by: null, transcript: null, participants: [{ id: 3, name: 'Sam Pizza', role_display: 'Champion', sentiment: 'positive' }],
  links: 0, created_at: '2026-09-16T12:00:00Z',
};
const checkin = {
  id: 2, title: 'Support escalation', host_name: 'Carl', occurred_at: '2026-09-10T09:00:00Z',
  duration_minutes: null, summary: '', sentiment: 'negative' as const, ai_area: '', ai_category: '', recording_url: '',
  connector_name: null, connector_provider: null, logged_by: { id: 3, name: 'Carl' },
  transcript: { id: 8, name: 'esc.vtt', content_type: 'text/vtt', size: 10, description: '', source: 'transcript' as const, uploaded_by: { id: 3, name: 'Carl' }, download_url: '/api/v1/files/8/download/', created_at: '2026-09-10T09:00:00Z' },
  participants: [], links: 0, created_at: '2026-09-10T09:00:00Z',
};
const sam = {
  id: 3, name: 'Sam Pizza', role: 'champion', role_display: 'Champion', email: 'sam@pizzahut.com', phone: '', status: 'active',
  sentiment: 'positive', sentiment_source: 'computed', sentiment_evidence: { score: 0.6, calls: 1, emails: 0, tickets: 0, positive: 1, neutral: 0, negative: 0, latest_at: null },
  sentiment_computed_at: '2026-09-16T12:00:00Z', last_contacted_at: null, companies: [{ id: 10, name: 'Pizza Hut' }], account_name: 'Pizza Hut UK',
};

function mockApi() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: true, status, json: async () => body });
    if (url.endsWith('/contacts/')) return ok([sam]);
    if (init?.method === 'POST') {
      const isForm = init.body instanceof FormData;
      const fields = isForm ? Object.fromEntries((init.body as FormData).entries()) : JSON.parse(String(init.body));
      return ok({ ...checkin, id: 9, title: fields.title, host_name: fields.host_name ?? 'Alice', occurred_at: fields.occurred_at,
        duration_minutes: fields.duration_minutes ? Number(fields.duration_minutes) : null, summary: fields.summary ?? 'Written from the transcript.',
        sentiment: 'neutral', transcript: null, logged_by: { id: 1, name: 'Alice' },
        participants: (fields.participant_ids ? [].concat(fields.participant_ids) : []).map(() => ({ id: 3, name: 'Sam Pizza', role_display: 'Champion', sentiment: 'positive' })) }, 201);
    }
    return ok([renewal, checkin]);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTab() {
  const store = configureStore({
    reducer: { auth: authReducer, calls: callsReducer, files: filesReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role: 'csm', role_id: 1, role_name: 'CSM', permissions: [],
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
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
  render(
    <Provider store={store}>
      <CallSenseTab entityType="account" entityId={5} customerId={10} />
    </Provider>
  );
}

describe('CallSenseTab', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows the real calls with host, source, sentiment, duration and summary', async () => {
    const spy = mockApi();
    renderTab();

    expect(await screen.findByText('EMEA Retail - Renewal readiness')).toBeInTheDocument();
    expect(spy.mock.calls[0][0]).toMatch(/\/customers\/10\/accounts\/5\/calls\/$/);
    expect(screen.getByText('Chamath Gamage')).toBeInTheDocument();
    expect(screen.getByText('· via tl;dv')).toBeInTheDocument();
    expect(screen.getByText('Positive')).toBeInTheDocument();
    expect(screen.getAllByText('45 min').length).toBeGreaterThan(0);
    expect(screen.getByText(/enterprise tier by Q4/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Recording/ })).toHaveAttribute('href', 'https://tldv.io/r/1');

    expect(within(screen.getByLabelText('Participants')).getByText('Sam Pizza')).toBeInTheDocument();
    expect(screen.getByText('· logged by Carl')).toBeInTheDocument();
    expect(screen.getByText('No summary yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transcript/ })).toBeInTheDocument();

    const stats = screen.getByLabelText('Call stats');
    expect(within(stats).getByText('calls')).toHaveTextContent('2 calls');
    expect(within(stats).getByText('positive')).toHaveTextContent('1 positive');
    expect(within(stats).getByText('negative')).toHaveTextContent('1 negative');
  });

  it('logs a call with a written summary as JSON', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('EMEA Retail - Renewal readiness');

    await user.click(screen.getByRole('button', { name: 'Log a call' }));
    await user.type(screen.getByLabelText('Call title'), 'Kick-off');
    await user.type(screen.getByLabelText('When'), '2026-09-17T14:30');
    await user.type(screen.getByLabelText('Duration in minutes'), '30');
    await user.type(screen.getByLabelText('Summary'), 'Agreed the rollout plan.');
    const picker = screen.getByLabelText('Who was on the call');
    await user.click(within(picker).getByRole('button', { name: 'Sam Pizza' }));
    expect(within(picker).getByRole('button', { name: 'Sam Pizza' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Log call' }));

    expect(await screen.findByText('Kick-off')).toBeInTheDocument();
    const post = spy.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({ title: 'Kick-off', duration_minutes: 30, summary: 'Agreed the rollout plan.', participant_ids: [3] });
    expect(body.occurred_at).toMatch(/^2026-09-17T/);
    expect(body).not.toHaveProperty('transcriptFile');
    expect(screen.queryByLabelText('Call title')).not.toBeInTheDocument(); // form closed
  });

  it('sends a transcript file as multipart and shows the written summary', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('EMEA Retail - Renewal readiness');

    await user.click(screen.getByRole('button', { name: 'Log a call' }));
    await user.type(screen.getByLabelText('Call title'), 'QBR');
    await user.type(screen.getByLabelText('When'), '2026-09-17T10:00');
    await user.upload(screen.getByLabelText('Transcript file'), new File(['WEBVTT'], 'qbr.vtt', { type: 'text/vtt' }));
    await user.click(screen.getByRole('button', { name: 'Log call' }));

    expect(await screen.findByText('Written from the transcript.')).toBeInTheDocument();
    const post = spy.mock.calls.find(([, init]) => init?.method === 'POST');
    const form = post?.[1]?.body as FormData;
    expect((form.get('transcript') as File).name).toBe('qbr.vtt');
    expect(form.get('title')).toBe('QBR');
    expect(form.get('summary')).toBeNull();
  });
});
