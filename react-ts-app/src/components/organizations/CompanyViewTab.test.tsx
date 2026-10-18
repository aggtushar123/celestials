import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import knowledgeReducer from '../../features/knowledge/knowledgeSlice';
import { CompanyViewTab } from './CompanyViewTab';
import { capabilitiesForRole } from '../../test/capabilities';

const contributions = [
  { id: 1, customer_id: 7, customer_name: 'Pizza Hut', author: { id: 5, name: 'Priya Nair' }, function: 'engineering' as const, function_display: 'Engineering', body: 'SSO drops sessions on token refresh; fix in 2.4.', created_at: '2026-09-13T08:00:00Z', updated_at: '2026-09-13T08:00:00Z' },
  { id: 2, customer_id: 7, customer_name: 'Pizza Hut', author: { id: 6, name: 'Raj Mehta' }, function: 'sales' as const, function_display: 'Sales', body: 'Renewal at 15% uplift stalled on procurement.', created_at: '2026-09-12T08:00:00Z', updated_at: '2026-09-12T08:00:00Z' },
];
const responsible = [
  { function: 'cs' as const, function_display: 'Customer Success', reports_to: null, user: { id: 2, name: 'Carl CSM' } },
  { function: 'engineering' as const, function_display: 'Engineering', user: { id: 5, name: 'Priya Nair' } },
  { function: 'sales' as const, function_display: 'Sales', user: null },
  { function: 'analytics' as const, function_display: 'Analytics', user: null },
  { function: 'leadership' as const, function_display: 'Leadership', user: null },
  { function: 'other' as const, function_display: 'Other', user: null },
];

function mockApi() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: true, status, json: async () => body });
    if (url.includes('/auth/members/')) return ok([{ id: 2, name: 'Carl CSM', function: 'cs' }, { id: 5, name: 'Priya Nair', function: 'engineering' }, { id: 6, name: 'Raj Mehta', function: 'sales' }]);
    if (url.includes('/responsible/') && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      return ok({ responsible: responsible.map((r) => (r.function === body.function ? { ...r, user: { id: body.user_id, name: 'Raj Mehta' } } : r)) });
    }
    if (url.includes('/responsible/')) return ok({ responsible });
    if (url.includes('/questions/')) return ok([]);
    // The brief panel sits above this view (AccountBriefPanel): an empty
    // brief with no gaps keeps these tests about what they are about.
    if (url.includes('/brief/'))
      return ok({ use_cases: [], stakeholders: [], open_threads: [], sources: [], hidden_sources: 0, generated_at: null, generated_by: null, gaps: [] });
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return ok({ ...contributions[0], id: 9, author: { id: 1, name: 'Alice' }, function: 'leadership', function_display: 'Leadership', body: body.body }, 201);
    }
    return ok(contributions);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTab(role: 'admin' | 'csm' = 'admin') {
  const store = configureStore({
    reducer: { auth: authReducer, knowledge: knowledgeReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
          function: 'leadership' as const, function_display: 'Leadership', reports_to: null,
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
      <CompanyViewTab customerId={7} customerName="Pizza Hut" />
    </Provider>
  );
}

describe('CompanyViewTab', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows who answers in each function and what every function knows', async () => {
    mockApi();
    renderTab();

    await screen.findByText(/SSO drops sessions/);
    expect(screen.getByLabelText('Engineering by Priya Nair')).toBeInTheDocument();
    expect(screen.getByLabelText('Sales by Raj Mehta')).toBeInTheDocument();
    expect(screen.getByLabelText('Engineering owner')).toHaveValue('5');
    expect(screen.getByLabelText('Sales owner')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'All 2' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Engineering 1' }));
    expect(screen.queryByLabelText('Sales by Raj Mehta')).not.toBeInTheDocument();
  });

  it('adds a contribution filed under the writer, and assigns a responsible person', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderTab();

    await screen.findByText(/SSO drops sessions/);
    expect(screen.getByText(/filed under Leadership as Alice/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/What do you know about Pizza Hut/), 'Board wants this account kept.');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('Leadership by Alice')).toBeInTheDocument();
    const post = spy.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ body: 'Board wants this account kept.' });

    // Only people in Sales are offered for the Sales row.
    const salesOptions = Array.from((screen.getByLabelText('Sales owner') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(salesOptions).toContain('Raj Mehta');
    expect(salesOptions).not.toContain('Priya Nair');
    expect(salesOptions).not.toContain('Carl CSM');
    await user.selectOptions(screen.getByLabelText('Sales owner'), '6');
    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ function: 'sales', user_id: 6 });
    expect(await screen.findByLabelText('Sales owner')).toHaveValue('6');
  });

  it('reads only, for someone who cannot assign', async () => {
    mockApi();
    renderTab('csm');
    await screen.findByText(/SSO drops sessions/);
    expect(screen.queryByLabelText('Engineering owner')).not.toBeInTheDocument();
    expect(screen.getAllByText('Priya Nair').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('combobox', { name: /owner$/ })).toHaveLength(0);
  });

  it('draws flat cards: no card inside another, no shadow, neutral function tags, sentence-case titles', async () => {
    mockApi();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTab();
    await screen.findByRole('heading', { level: 2, name: /^Who answers for/ });
    await screen.findByText(/SSO drops sessions/);
    expect(errors).not.toHaveBeenCalledWith('Card inside Card');
    const cards = document.querySelectorAll('.rounded-xl.border-line.bg-surface');
    for (const card of cards) expect(card.querySelector('.rounded-xl.border-line.bg-surface')).toBeNull();
    expect(document.querySelector('[class*="shadow-sm"], [class*="shadow-md"]')).toBeNull();
    expect(document.querySelector('.uppercase')).toBeNull();
    const tags = document.querySelectorAll('li .rounded-full');
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toHaveClass('bg-subtle', 'text-ink-muted');
    errors.mockRestore();
  });
});
