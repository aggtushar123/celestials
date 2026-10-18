import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import skillsReducer from '../../features/skills/skillsSlice';
import { SkillsPage } from './Skills';
import { capabilitiesForRole } from '../../test/capabilities';

const payload = {
  month_start: '2026-09-01',
  skills: [
    {
      purpose: 'proposals', name: 'Ops agent', summary: 'Proposes the next actions from the figures.',
      reads: ['The metric layer'], may: ['Propose a task on an account'], never: ['Run anything without approval'],
      trigger: 'A manager asks the agent', gate: 'view_all_accounts', surface: '/brain/review',
      usage: { calls: 2, ok: 2, failed: 0, spent: 45_000, budget: 500_000, remaining: 455_000, custom_budget: true },
      last_run: { at: '2026-09-12T16:00:00Z', outcome: 'ok' as const, user: 'Alice' },
      produced: { label: 'proposals', count: 4, approved: 1 },
    },
    {
      purpose: 'classification', name: 'Interaction classifier', summary: 'Tags emails, calls and tickets.',
      reads: ['The text of each record'], may: ['Write the four tags'], never: ['Overwrite a tag a person corrected'],
      trigger: 'The classify_interactions job', gate: 'Scheduled', surface: '/dashboard/ai-trending',
      usage: { calls: 0, ok: 0, failed: 0, spent: 0, budget: 2_000_000, remaining: 2_000_000, custom_budget: false },
      last_run: null,
      produced: null,
    },
  ],
};

function renderPage(role: 'admin' | 'csm' = 'admin') {
  const spy = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => payload }));
  vi.stubGlobal('fetch', spy);
  const store = configureStore({
    reducer: { auth: authReducer, skills: skillsReducer },
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
      <MemoryRouter>
        <SkillsPage />
      </MemoryRouter>
    </Provider>
  );
  return spy;
}

describe('SkillsPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('lists each skill with its reach, its month and what it produced', async () => {
    renderPage();

    const ops = await screen.findByRole('article', { name: 'Ops agent' });
    expect(within(ops).getByText('Propose a task on an account')).toBeInTheDocument();
    expect(within(ops).getByText('Run anything without approval')).toBeInTheDocument();
    expect(within(ops).getByText('45K')).toBeInTheDocument();
    expect(ops).toHaveTextContent('4 proposals · 1 approved');
    expect(ops).toHaveTextContent(/last run .* by Alice: OK/);
    expect(within(ops).getByRole('link', { name: '/brain/review' })).toHaveAttribute('href', '/brain/review');

    const classifier = screen.getByRole('article', { name: 'Interaction classifier' });
    expect(within(classifier).getByText('never run')).toBeInTheDocument();
    expect(within(classifier).queryByText(/approved/)).not.toBeInTheDocument();
  });

  it('heads the page with the nav label and lists skills in one card, the Shows on link outside any truncation', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'AI' })).toHaveClass('text-[22px]');
    const ops = await screen.findByRole('article', { name: 'Ops agent' });
    expect(ops.closest('ul')).toHaveAttribute('aria-label', 'Skills');
    const link = within(ops).getByRole('link', { name: '/brain/review' });
    expect(link.closest('.truncate')).toBeNull();
    expect(link.className).toContain('before:h-11');
    expect(within(ops).getByText('May')).not.toHaveClass('text-success');
    expect(within(ops).getByText('Never')).not.toHaveClass('text-danger');
    expect(screen.getByRole('link', { name: 'Budgets and the call log' })).toHaveAttribute('href', '/settings/ai/usage');
  });

  it('explains the gate to someone without view-all-accounts, without fetching', () => {
    const spy = renderPage('csm');
    expect(screen.getByText(/needs the view-all-accounts capability/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
