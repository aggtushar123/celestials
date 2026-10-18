import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KnowledgeByFunctionPanel } from './KnowledgeByFunctionPanel';

import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';

function withAdmin(children: React.ReactNode) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role: 'admin', role_id: 1,
          role_name: 'Admin', permissions: capabilitiesForRole('admin'),
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
  return <Provider store={store}>{children}</Provider>;
}

const payload = {
  days: 30, since: '2026-08-14',
  functions: [
    { function: 'cs', label: 'Customer Success', members: 2, contributors: 0, contributions: 0, questions_asked: 0, questions_answered: 0, questions_waiting: 0, avg_days_to_answer: null },
    { function: 'analytics', label: 'Analytics', members: 1, contributors: 1, contributions: 3, questions_asked: 2, questions_answered: 1, questions_waiting: 1, avg_days_to_answer: 2 },
    { function: 'other', label: 'Other', members: 0, contributors: 0, contributions: 0, questions_asked: 0, questions_answered: 0, questions_waiting: 0, avg_days_to_answer: null },
  ],
};

describe('KnowledgeByFunctionPanel', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows each staffed function, flags the silent ones, and hides the empty ones', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => payload })));
    render(withAdmin(<KnowledgeByFunctionPanel />));

    const analytics = await screen.findByRole('row', { name: 'Analytics' });
    const cells = within(analytics).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['Analytics', '1', '1', '3', '2', '1', '1', '2']);
    const cs = screen.getByRole('row', { name: 'Customer Success' });
    expect(cs).toHaveTextContent('nothing yet');
    expect(screen.queryByRole('row', { name: 'Other' })).not.toBeInTheDocument();
    expect(screen.getByText(/last 30 days/i)).toBeInTheDocument();
  });

  it('is one card with its table flush inside, counts neutral, a missing average shown as the no-value mark', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => payload })));
    render(withAdmin(<KnowledgeByFunctionPanel />));
    const card = (await screen.findByRole('heading', { level: 2, name: 'Knowledge by function' })).closest('section')!;
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(within(card).getByRole('table')).toHaveClass('w-full', 'text-left');
    expect(within(card).getByRole('columnheader', { name: 'Waiting' })).toHaveClass('text-[11px]', 'text-right');
    expect(card.innerHTML).not.toMatch(/text-warning|text-accent|uppercase/);
    expect(within(card).getAllByText('\u2014').length).toBeGreaterThan(0);
  });
});
