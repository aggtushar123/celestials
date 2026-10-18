import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import agentsReducer from '../../features/agents/agentsSlice';
import { AgentsPage } from './Agents';
import { capabilitiesForRole } from '../../test/capabilities';

const purposes = [
  { purpose: 'brief', label: 'Management brief', calls: 3, ok: 2, failed: 1, input_tokens: 9_000, output_tokens: 1_500, spent: 10_500, budget: 2_000_000, remaining: 1_989_500, custom_budget: false },
  { purpose: 'proposals', label: 'Ops agent proposals', calls: 2, ok: 2, failed: 0, input_tokens: 40_000, output_tokens: 5_000, spent: 45_000, budget: 50_000, remaining: 5_000, custom_budget: true },
];
const usage = {
  month_start: '2026-09-01',
  purposes,
  default_budget: 2_000_000,
  recent: [
    { id: 1, purpose: 'brief', purpose_label: 'Management brief', user: 'Alice', model: 'claude', input_tokens: 3000, output_tokens: 500, latency_ms: 8400, outcome: 'ok' as const, error: '', created_at: '2026-09-12T15:40:02Z' },
    { id: 2, purpose: 'brief', purpose_label: 'Management brief', user: null, model: 'claude', input_tokens: 0, output_tokens: 0, latency_ms: 12, outcome: 'over_budget' as const, error: 'Monthly token budget spent.', created_at: '2026-09-12T15:41:02Z' },
  ],
};

function mockApi() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((_url, init) => {
    const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      return ok({ month_start: '2026-09-01', purposes: purposes.map((p) => p.purpose === body.purpose ? { ...p, budget: body.monthly_tokens ?? 2_000_000, custom_budget: body.monthly_tokens !== null } : p) });
    }
    return ok(usage);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderPage(role: 'admin' | 'csm' = 'admin') {
  const store = configureStore({
    reducer: { auth: authReducer, agents: agentsReducer },
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
      <AgentsPage />
    </Provider>
  );
}

const card = (label: string) => screen.getByRole('heading', { name: label }).closest('li') as HTMLElement;

describe('AgentsPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows spend against budget per purpose, and the recent calls with their outcomes', async () => {
    mockApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Management brief' });
    expect(screen.getByRole('heading', { level: 1, name: 'AI' })).toHaveClass('text-[22px]', 'font-semibold');
    expect(within(card('Management brief')).getByText('11K')).toBeInTheDocument();
    expect(within(card('Management brief')).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1 failed' && el.classList.contains('text-danger-ink'))).toBeInTheDocument();
    expect(within(card('Ops agent proposals')).getByText('90%')).toBeInTheDocument();
    expect(within(card('Ops agent proposals')).getByText(/budget set for this organisation/)).toBeInTheDocument();
    expect(screen.getByText('Over budget')).toHaveClass('text-danger-ink');
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('lets an organisation settings manager set and clear a budget', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Management brief' });
    await user.click(within(card('Management brief')).getByRole('button', { name: 'Set budget' }));
    const input = screen.getByLabelText('Tokens a month');
    await user.clear(input);
    await user.type(input, '250000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(within(card('Management brief')).getByText(/budget set for this organisation/)).toBeInTheDocument());
    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ purpose: 'brief', monthly_tokens: 250000 });

    await user.click(within(card('Ops agent proposals')).getByRole('button', { name: 'Use default' }));
    await waitFor(() => expect(within(card('Ops agent proposals')).getByText(/default budget/)).toBeInTheDocument());
  });

  it('explains the gate to someone without view-all-accounts', () => {
    const spy = mockApi();
    renderPage('csm');

    expect(screen.getByText(/needs the view-all-accounts capability/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('AI usage on the settings frame (UI foundations spec §4.2, §7)', () => {
  it('lists the purposes as rows, the share in tabular figures, and the recent calls flush in their card', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { name: 'Management brief' });
    expect(screen.getByRole('list', { name: 'Spend by purpose' })).toHaveClass('divide-y');
    expect(within(card('Ops agent proposals')).getByText('90%')).toHaveClass('tabular-nums');
    const table = screen.getByRole('table', { name: 'Recent calls' });
    expect(table.closest('.rounded-xl')).not.toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'In' })).toHaveClass('text-right');
    expect(screen.queryByText('Company Brain')).toBeNull();
  });

  it('draws a budget bar under 70% in the neutral ink, not blue', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { name: 'Management brief' });
    const brief = card('Management brief');
    expect(brief.querySelector('[data-part="spend"]')).toHaveClass('bg-ink-muted');
    expect(within(brief).queryByText(/of the budget/)).toBeNull();
  });

  it('says in words when a budget is near or past its limit, not by colour alone', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { name: 'Ops agent proposals' });
    const ops = card('Ops agent proposals');
    expect(ops.querySelector('[data-part="spend"]')).toHaveClass('bg-danger');
    expect(within(ops).getByText('90% of the budget or more')).toHaveClass('text-danger-ink');
  });

  it('moves focus into the budget field, and back to Set budget when the form closes', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Management brief' });
    await user.click(within(card('Management brief')).getByRole('button', { name: 'Set budget' }));
    expect(screen.getByLabelText('Tokens a month')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(card('Management brief')).getByRole('button', { name: 'Set budget' })).toHaveFocus();

    await user.click(within(card('Management brief')).getByRole('button', { name: 'Set budget' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(card('Management brief')).getByRole('button', { name: 'Set budget' })).toHaveFocus());
  });

  it('moves focus to Set budget when Use default removes the button that had it', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Ops agent proposals' });
    await user.click(within(card('Ops agent proposals')).getByRole('button', { name: 'Use default' }));
    await waitFor(() => expect(within(card('Ops agent proposals')).queryByRole('button', { name: 'Use default' })).toBeNull());
    expect(within(card('Ops agent proposals')).getByRole('button', { name: 'Set budget' })).toHaveFocus();
  });
});

describe('AI usage: budget thresholds read the rounded share', () => {
  beforeEach(() => vi.unstubAllGlobals());

  function stubShare(spent: number) {
    const row = { ...purposes[1], spent, budget: 1000, remaining: 1000 - spent };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...usage, purposes: [row] }) }))
    );
  }

  it.each([
    { spent: 696, shown: '70%', bar: 'bg-warning', words: '70% of the budget or more', ink: 'text-warning-ink' },
    { spent: 896, shown: '90%', bar: 'bg-danger', words: '90% of the budget or more', ink: 'text-danger-ink' },
  ])('$spent of 1000 shows $shown with the matching bar and words', async ({ spent, shown, bar, words, ink }) => {
    stubShare(spent);
    renderPage();
    await screen.findByRole('heading', { name: 'Ops agent proposals' });
    const ops = card('Ops agent proposals');
    expect(within(ops).getByText(shown)).toBeInTheDocument();
    expect(ops.querySelector('[data-part="spend"]')).toHaveClass(bar);
    expect(within(ops).getByText(words)).toHaveClass(ink);
  });

  it('694 of 1000 shows 69% and stays neutral', async () => {
    stubShare(694);
    renderPage();
    await screen.findByRole('heading', { name: 'Ops agent proposals' });
    const ops = card('Ops agent proposals');
    expect(within(ops).getByText('69%')).toBeInTheDocument();
    expect(ops.querySelector('[data-part="spend"]')).toHaveClass('bg-ink-muted');
    expect(within(ops).queryByText(/of the budget or more/)).toBeNull();
  });
});
