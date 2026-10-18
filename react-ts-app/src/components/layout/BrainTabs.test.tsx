import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { BrainTabs } from './BrainTabs';

const mockUser = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice Admin',
  avatar: 'https://i.pravatar.cc/150?u=alice@acme.io',
  role: 'admin' as const,
  role_id: 1,
  role_name: 'Admin',
  permissions: ALL_CAPABILITIES,
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional' },
  is_active: true,
};

function renderTabs(url: string) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: { user: mockUser, accessToken: 'access.jwt', refreshToken: 'refresh.jwt', isAuthenticated: true, isLoading: false, error: null },
    },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <BrainTabs />
      </MemoryRouter>
    </Provider>,
  );
}

describe('BrainTabs (brain UI spec 2026-10-06 §1.1)', () => {
  const countOf = (n: number) => vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ count: n }) }));
  const tabs = () => within(screen.getByRole('navigation', { name: 'Brain' }));

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', countOf(3));
  });

  it.each([
    ['/brain', 'What changed'],
    ['/brain/doing', "What's being done"],
    ['/brain/customers', 'Customers'],
    ['/brain/requests', 'Customers'],
    ['/brain/anomalies', 'Customers'],
  ])('on %s: the three tabs, "%s" current', async (url, current) => {
    renderTabs(url);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(tabs().getAllByRole('link').map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual([
      'What changed',
      "What's being done",
      'Customers',
    ]);
    const lit = tabs().getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(lit).toEqual([tabs().getByRole('link', { name: current })]);
  });

  it('lights no tab on the Knowledge graph', async () => {
    renderTabs('/brain/graph?scope=team');
    expect(tabs().getAllByRole('link').some((link) => link.hasAttribute('aria-current'))).toBe(false);
  });

  it('carries ?scope= to every tab, and nothing else from the query', async () => {
    renderTabs('/brain/doing?section=plans&scope=team');
    expect(tabs().getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/brain?scope=team',
      '/brain/doing?scope=team',
      '/brain/customers?scope=team',
    ]);
  });

  it('keeps the tabs on one line, the row scrolling sideways on phones', () => {
    renderTabs('/brain/customers');
    const nav = screen.getByRole('navigation', { name: 'Brain' });
    expect(nav.firstElementChild).toHaveClass('overflow-x-auto', 'rv-scroll-fade');
    expect(nav.firstElementChild).not.toHaveClass('flex-wrap');
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('whitespace-nowrap', 'shrink-0', 'min-h-11');
  });

  it('keeps a tab’s focus ring inside it despite the row scrolling sideways (fix wave item 11)', () => {
    renderTabs('/brain');
    for (const link of tabs().getAllByRole('link')) expect(link).toHaveClass('focus-visible:outline-offset-[-2px]');
  });

  it('reads no Waiting count any more', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderTabs('/brain');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
