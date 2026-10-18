import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import billingReducer from '../../features/billing/billingSlice';
import { PlanBillingPage } from './PlanBillingPage';

const summary = {
  plan: { code: 'trial', name: 'Trial', seats_included: 3, monthly_credits: 200, price_cents: 0, currency: 'USD', is_trial: true },
  status: 'trialing',
  seats: { used: 3, limit: 3 },
  credits: { balance: 0 },
  trial_ends_at: '2026-10-05T00:00:00Z',
  current_period_end: null,
  enforced: true,
};
const TEAM = { code: 'team', name: 'Team', seats_included: 10, monthly_credits: 2000, price_cents: 4900, currency: 'USD' };
const LEDGER = [{ id: 1, kind: 'grant', amount: 200, balance_after: 200, reason: 'Trial', actor: null, at: '2026-09-21T00:00:00Z' }];

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

function stub({ ledger = true, account = 200 }: { ledger?: boolean; account?: number } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/billing/account/')) return account === 200 ? jsonResponse(200, summary) : jsonResponse(account, { detail: 'Could not load the plan.' });
    if (url.includes('/billing/plans/')) return jsonResponse(200, [TEAM]);
    if (url.includes('/billing/ledger/') && ledger) return jsonResponse(200, LEDGER);
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(permissions: string[]) {
  const user = { id: 1, email: 'a@acme.io', name: 'A', permissions, organisation: { id: 1, name: 'Acme', slug: 'acme' }, is_active: true } as unknown as User;
  const store = configureStore({
    reducer: { auth: authReducer, billing: billingReducer },
    preloadedState: { auth: { user, accessToken: 'a', refreshToken: 'r', isAuthenticated: true, isLoading: false, error: null } },
  });
  render(
    <Provider store={store}>
      <PlanBillingPage />
    </Provider>,
  );
}

describe('Settings › Plan & billing (UI foundations spec §6.3, §9.1)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('heads the page from the nav, shows seats and credits as tiles, and the plan status as a neutral trial badge', async () => {
    stub();
    renderPage(['manage_org_settings']);
    expect(screen.getByRole('heading', { level: 1, name: 'Plan & billing' })).toHaveClass('text-[22px]', 'font-semibold');
    const seats = await screen.findByRole('group', { name: 'Seats' });
    expect(within(seats).getByText('3')).toHaveClass('tabular-nums');
    expect(within(seats).getByText(/Every seat is taken/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'AI credits' })).toHaveTextContent('None left: the Copilot will refuse');
    const plan = screen.getByRole('region', { name: 'Current plan' });
    expect(within(plan).getByText('Trial', { selector: 'span' })).toHaveClass('bg-subtle', 'text-ink-muted');
  });

  it('lists the plans with the current one marked by a neutral badge, and the credit history flush in its card', async () => {
    stub();
    renderPage(['manage_org_settings']);
    const plans = await screen.findByRole('list', { name: 'Plans' });
    expect(within(plans).getByText('Team')).toBeInTheDocument();
    expect(within(plans).getByText('$49')).toHaveClass('tabular-nums');
    const table = await screen.findByRole('table', { name: 'Credit history' });
    expect(table.closest('.rounded-xl')).not.toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'Change' })).toHaveClass('text-right');
    expect(within(table).getByText('+200')).not.toHaveClass('text-success');
  });

  it('scrolls the credit history in a fading row, and keeps its columns narrow enough for Balance to show at 390', async () => {
    stub();
    renderPage(['manage_org_settings']);
    const table = await screen.findByRole('table', { name: 'Credit history' });
    expect(table.parentElement).toHaveClass('overflow-x-auto', 'rv-scroll-fade');
    const [when, what] = within(table).getAllByRole('cell');
    // The date wraps rather than pushing Balance off the screen.
    expect(when).not.toHaveClass('whitespace-nowrap');
    // What: the short kind, the reason as a muted line below it.
    expect(within(what).getByText('Granted')).toBeInTheDocument();
    expect(within(what).getByText('Trial')).toHaveClass('text-[11px]', 'text-ink-muted');
  });

  it('hides the credit history from someone without manage_org_settings and never asks for it', async () => {
    const fetchMock = stub({ ledger: false });
    renderPage([]);
    await screen.findByRole('region', { name: 'Current plan' });
    expect(screen.queryByRole('region', { name: 'Credit history' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/billing/ledger/'), expect.anything());
  });

  it('shows a failed read inside a card, with nothing partial', async () => {
    stub({ account: 500 });
    renderPage([]);
    const alert = await screen.findByRole('alert');
    expect(alert.closest('.rounded-xl')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Seats' })).toBeNull();
  });
});
