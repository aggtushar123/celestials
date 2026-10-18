import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { CockpitView } from './CockpitView';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Integration tier (see the `testing` skill): only the fetch boundary is
// mocked — real Cockpit backing data now (see docs/API_CONTRACTS.md ->
// customers -> Task / Cockpit summary), replacing the old fully-mock
// Redux tasksSlice this page used to read from.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const EMPTY_SUMMARY = {
  customers: { count: 0, value: 0, health: { good: 0, average: 0, poor: 0 } },
  accounts: { count: 0, value: 0, health: { good: 0, average: 0, poor: 0 } },
  renewals: { window_days: 30, customers: { count: 0, value: 0 }, accounts: { count: 0, value: 0 }, items: [] },
};

const EMPTY_FEED = { groups: [], hidden: 0, failed: [] };

function makeStore() {
  return configureStore({
    reducer: { auth: authReducer },
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

function renderCockpit() {
  render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={['/copilot']}>
        <Routes>
          <Route path="/copilot" element={<CockpitView />} />
          <Route path="/organizations/:id" element={<div>ORG DETAIL PAGE</div>} />
          <Route path="/accounts/:id" element={<div>ACCOUNT DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('CockpitView', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders real portfolio/renewal numbers from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/cockpit/summary/')) {
          return Promise.resolve(
            jsonResponse(200, {
              customers: { count: 4, value: 12000, health: { good: 3, average: 1, poor: 0 } },
              accounts: { count: 2, value: 5000, health: { good: 2, average: 0, poor: 0 } },
              renewals: {
                window_days: 30,
                customers: { count: 1, value: 1200 },
                accounts: { count: 0, value: 0 },
                items: [],
              },
            })
          );
        }
        if (url.includes('/work/feed/')) return Promise.resolve(jsonResponse(200, EMPTY_FEED));
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    renderCockpit();

    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByText('$12.0K')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('$5.0K')).toBeInTheDocument();
  });

  it('surfaces a fetch failure instead of silently showing zeros', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))));
    renderCockpit();

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('the Renewals window dropdown really refetches with a new ?days=', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/cockpit/summary/')) return Promise.resolve(jsonResponse(200, EMPTY_SUMMARY));
      if (url.includes('/work/feed/')) return Promise.resolve(jsonResponse(200, EMPTY_FEED));
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCockpit();

    await screen.findByText('Next 30 Days');
    await user.click(screen.getByText('Next 30 Days'));
    await user.click(screen.getByText('Next 60 Days'));

    expect(await screen.findByText('Next 60 Days')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('days=60'));
    expect(call).toBeTruthy();
  });

  it('keeps the renewals drill-down list collapsed until its toggle is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/cockpit/summary/')) {
          return Promise.resolve(
            jsonResponse(200, {
              ...EMPTY_SUMMARY,
              renewals: {
                window_days: 30,
                customers: { count: 1, value: 1200 },
                accounts: { count: 0, value: 0 },
                items: [
                  { id: 42, name: 'Acme Co', type: 'customer', value: 1200, renewal_date: '2026-09-12' },
                ],
              },
            })
          );
        }
        if (url.includes('/work/feed/')) return Promise.resolve(jsonResponse(200, EMPTY_FEED));
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    const user = userEvent.setup();
    renderCockpit();

    const toggle = await screen.findByText('View 1 renewing item');
    expect(screen.queryByText('Acme Co')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText('Acme Co')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByText('Acme Co')).not.toBeInTheDocument();
  });

  it('clicking a renewing customer navigates to its real detail page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/cockpit/summary/')) {
          return Promise.resolve(
            jsonResponse(200, {
              ...EMPTY_SUMMARY,
              renewals: {
                window_days: 30,
                customers: { count: 1, value: 1200 },
                accounts: { count: 0, value: 0 },
                items: [
                  { id: 42, name: 'Acme Co', type: 'customer', value: 1200, renewal_date: '2026-09-12' },
                ],
              },
            })
          );
        }
        if (url.includes('/work/feed/')) return Promise.resolve(jsonResponse(200, EMPTY_FEED));
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    const user = userEvent.setup();
    renderCockpit();

    // The drill-down list is collapsed behind this toggle by default (see
    // CockpitView's own comment on it) — real users open it the same way.
    await user.click(await screen.findByText('View 1 renewing item'));
    await user.click(await screen.findByText('Acme Co'));

    expect(await screen.findByText('ORG DETAIL PAGE')).toBeInTheDocument();
  });

  it('shows Next up where My tasks was', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/cockpit/summary/')) return Promise.resolve(jsonResponse(200, EMPTY_SUMMARY));
        if (url.includes('/work/feed/')) return Promise.resolve(jsonResponse(200, EMPTY_FEED));
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    renderCockpit();
    expect(await screen.findByRole('region', { name: /Next up/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My tasks' })).toBeNull();
  });
});
