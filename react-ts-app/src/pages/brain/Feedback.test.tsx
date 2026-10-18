import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import feedbackReducer from '../../features/feedback/feedbackSlice';
import { FeedbackLogPage } from './Feedback';
import { capabilitiesForRole } from '../../test/capabilities';

const entries = [
  {
    id: 9, kind: 'classification' as const, kind_display: 'Classification corrected', subject_type: 'ticket', subject_id: 12,
    subject_label: 'Slow page load for large accounts',
    before: { area: 'support_operations', category: 'integration_support', subcategory: 'webhook_failure', sentiment: 'neutral' },
    after: { area: 'product_growth', category: 'bug_report', subcategory: 'performance_issue', sentiment: 'neutral' },
    note: "It's a perf bug, not a webhook.", made_by: 'Carl CSM', created_at: '2026-09-12T18:20:11Z',
  },
  {
    id: 8, kind: 'proposal' as const, kind_display: 'Proposal decided', subject_type: 'proposal', subject_id: 3,
    subject_label: 'Assign owner and initiate kickoff for Twilio account',
    before: { kind: 'task', action: {}, rationale: 'r' }, after: { decision: 'rejected' },
    note: 'Already in hand', made_by: 'Alice', created_at: '2026-09-12T18:00:00Z',
  },
  {
    id: 7, kind: 'health_override' as const, kind_display: 'Health score overridden', subject_type: 'customer', subject_id: 7,
    subject_label: 'Pizza Hut', before: { health_score: '4.9' }, after: { health_score_override: '7.0' },
    note: '', made_by: 'Carl CSM', created_at: '2026-09-12T17:00:00Z',
  },
];

function mockApi() {
  const spy = vi.fn<(url: string) => Promise<unknown>>((url) => {
    const kind = new URL(url, 'http://x').searchParams.get('kind');
    const rows = kind ? entries.filter((e) => e.kind === kind) : entries;
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ counts: { classification: 1, proposal: 1, health_override: 1 }, feedback: rows }) });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderPage(role: 'admin' | 'csm' = 'admin') {
  const store = configureStore({
    reducer: { auth: authReducer, feedback: feedbackReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
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
      <FeedbackLogPage />
    </Provider>
  );
}

describe('FeedbackLogPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows each correction as what the system said and what the person said', async () => {
    mockApi();
    renderPage();

    const row = (await screen.findByText('Slow page load for large accounts')).closest('li') as HTMLElement;
    expect(screen.getByRole('heading', { level: 1, name: 'AI' })).toHaveClass('text-[22px]', 'font-semibold');
    expect(within(row).getByText('webhook_failure')).toHaveClass('line-through');
    expect(within(row).getByText('performance_issue')).toBeInTheDocument();
    // Unchanged fields are not listed as changes.
    expect(within(row).queryByText('sentiment:')).not.toBeInTheDocument();
    expect(within(row).getByText("“It's a perf bug, not a webhook.”")).toBeInTheDocument();
    const override = screen.getByText('Pizza Hut').closest('li') as HTMLElement;
    expect(within(override).getByText('4.9')).toHaveClass('line-through');
    expect(within(override).getByText('7.0')).toBeInTheDocument();
    const decided = screen.getByText(/Twilio/).closest('li') as HTMLElement;
    expect(within(decided).getByText('rejected')).toHaveClass('text-danger-ink');
  });

  it('filters by kind, with counts on the tabs', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Slow page load for large accounts');
    expect(screen.getByRole('tab', { name: /All 3/ })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Proposals 1/ }));

    expect(await screen.findByText(/Twilio/)).toBeInTheDocument();
    expect(screen.queryByText('Slow page load for large accounts')).not.toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).includes('kind=proposal'))).toBe(true);
  });

  it('switches kinds with the ui tabs, the list in one card under them', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Slow page load for large accounts');
    const tabs = screen.getByRole('tablist', { name: 'Kinds' });
    expect(within(tabs).getByRole('tab', { name: /All 3/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByRole('list', { name: 'Corrections' }));
    const kind = within(screen.getByText('Slow page load for large accounts').closest('li')!).getByText('Classification corrected');
    expect(kind).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(kind.className).not.toMatch(/uppercase/);
  });

  it('keeps focus on the selected kind tab as the list reloads', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Slow page load for large accounts');
    await user.click(screen.getByRole('tab', { name: /Proposals 1/ }));
    await screen.findByText(/Twilio/);
    expect(screen.getByRole('tab', { name: /Proposals 1/ })).toHaveFocus();
  });

  it('explains the gate to someone without view-all-accounts', () => {
    const spy = mockApi();
    renderPage('csm');

    expect(screen.getByText(/needs the view-all-accounts capability/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('FeedbackLogPage: a failed read and a reload', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows the error with Try again inside the Corrections card when there is nothing to show', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ detail: 'Could not load the log.' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ counts: { classification: 1, proposal: 1, health_override: 1 }, feedback: entries }) });
    vi.stubGlobal('fetch', spy);
    const user = userEvent.setup();
    renderPage();
    const corrections = screen.getByRole('region', { name: 'Corrections' });
    expect(await within(corrections).findByRole('alert')).toHaveTextContent('Could not load the log.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(within(corrections).getByRole('button', { name: 'Try again' }));
    expect(await within(corrections).findByText('Pizza Hut')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps the list on screen, marked busy with a quiet cue, while another kind loads', async () => {
    let release: () => void = () => {};
    const all = { counts: { classification: 1, proposal: 1, health_override: 1 }, feedback: entries };
    const spy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => all })
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ ok: true, status: 200, json: async () => ({ ...all, feedback: [entries[2]] }) }))));
    vi.stubGlobal('fetch', spy);
    const user = userEvent.setup();
    renderPage();
    const corrections = screen.getByRole('region', { name: 'Corrections' });
    await within(corrections).findByText('Slow page load for large accounts');
    await user.click(screen.getByRole('tab', { name: /Health overrides/ }));
    const list = within(corrections).getByRole('list', { name: 'Corrections' });
    expect(list.closest('[aria-busy="true"]')).not.toBeNull();
    expect(within(corrections).getByText('Updating…')).toHaveClass('text-[11px]', 'text-ink-muted');
    await act(async () => release());
    await waitFor(() => expect(within(corrections).queryByText('Slow page load for large accounts')).toBeNull());
    expect(list.closest('[aria-busy="true"]')).toBeNull();
    expect(within(corrections).queryByText('Updating…')).toBeNull();
  });
});
