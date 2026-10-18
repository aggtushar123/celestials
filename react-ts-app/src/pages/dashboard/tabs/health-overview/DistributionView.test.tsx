import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../../../features/customers/customersSlice';
import authReducer from '../../../../features/auth/authSlice';
import healthReducer, { NO_FILTERS } from '../../../../features/health/healthSlice';
import { ALL_CAPABILITIES } from '../../../../test/capabilities';
import { DistributionView } from './DistributionView';
import { DrillProvider } from '../../drill/DrillContext';
import { healthRow } from './testUtils';
import type { HealthDataRow } from '../../../../features/health/types';

// Integration tier: DistributionView is `ControlsView` (the old "Controls"
// portfolio mix, reading `state.health`) stacked over `HealthDistribution`
// (the old /health rollup, reading `state.customers.stats`/`accountStats`).
// Real stores for both, fetch mocked at the boundary — same convention as
// HealthDistribution.test.tsx, which covers the rollup itself; this file
// only proves the two halves render together.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const STATS = {
  health: {
    good: { count: 5, mrr: 20000, arr: 240000 },
    average: { count: 2, mrr: 5000, arr: 60000 },
    poor: { count: 1, mrr: 500, arr: 6000 },
  },
  nps: { promoters: 4, passives: 1, detractors: 2, score: 25 },
  lifecycle: Object.fromEntries(
    ['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other'].map((s) => [
      s,
      { count: 0, mrr: 0, arr: 0 },
    ])
  ),
};

function fetchMock() {
  return vi.fn((url: string) => {
    if (url.includes('/customers/stats/')) return Promise.resolve(jsonResponse(200, STATS));
    if (url.includes('/accounts/stats/')) return Promise.resolve(jsonResponse(200, STATS));
    return Promise.resolve(jsonResponse(200, { count: 0, next: null, previous: null, results: [] }));
  });
}

function renderDistribution({ rows = [], truncated = false }: { rows?: HealthDataRow[]; truncated?: boolean } = {}) {
  const store = configureStore({
    reducer: { customers: customersReducer, auth: authReducer, health: healthReducer },
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
          function: 'cs' as const,
          function_display: 'Customer Success',
          reports_to: null,
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
      // Preloaded (`loadedAt` set) so ControlsView's `useHealthOverview`
      // doesn't fire its own fetch thunk — this test is about the two
      // halves rendering together, not about loading either one's data.
      health: {
        rows,
        isLoading: false,
        error: null,
        historyMonths: 12,
        truncated,
        loadedAt: '2026-09-11T00:00:00.000Z',
        currency: 'USD' as const,
        unconvertedCount: 0,
        filters: NO_FILTERS,
      },
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <DrillProvider>
          <DistributionView />
        </DrillProvider>
      </MemoryRouter>
    </Provider>
  );
}

describe('DistributionView', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the health mix and the organisations/accounts switch', async () => {
    vi.stubGlobal('fetch', fetchMock());
    renderDistribution();

    expect(screen.getByRole('button', { name: /organizations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accounts/i })).toBeInTheDocument();
  });

  it('no longer draws the invented "Accounts by Last Touch" curve', async () => {
    // That chart scaled a hardcoded twelve-month shape by the row count
    // rather than reading `daysSinceTouch` at all — removed rather than
    // fixed, since there was no real per-month touch date to draw it from.
    vi.stubGlobal('fetch', fetchMock());
    renderDistribution();

    expect(screen.queryByText(/Accounts by Last Touch/i)).not.toBeInTheDocument();
  });

  const book = [
    healthRow({ id: '1', account: 'Acme', csmPulseScore: 3, aiPulseScore: 2, renewalDate: 'Dec 31, 2026', healthStatus: 'Good' }),
    healthRow({ id: '2', account: 'Globex', csmPulseScore: 1, aiPulseScore: 1, renewalDate: 'Jan 15, 2027', healthStatus: 'Poor' }),
  ];

  it('offers drills from the mix when the book is complete', () => {
    vi.stubGlobal('fetch', fetchMock());
    renderDistribution({ rows: book });

    expect(screen.getAllByRole('button', { name: /, show accounts$/ }).length).toBeGreaterThan(0);
  });

  it('offers no drill anywhere in the mix when the book is truncated', () => {
    vi.stubGlobal('fetch', fetchMock());
    renderDistribution({ rows: book, truncated: true });

    expect(screen.queryAllByRole('button', { name: /, show accounts$/ })).toHaveLength(0);
    // No DrillTargets list at all — not just empty buttons.
    for (const label of ['Health by owner', 'CSM Pulse', 'AI Pulse', 'Accounts by renewal date']) {
      expect(screen.queryByRole('list', { name: new RegExp(label, 'i') })).not.toBeInTheDocument();
    }
  });

  it('never fixes a row of cards to one height, so cards that stack below xl are not clipped', () => {
    vi.stubGlobal('fetch', fetchMock());
    const { container } = renderDistribution({ rows: book });

    // A row or card is a flex box; a chart's own plot area has a definite
    // height by design and is not one.
    const fixed = [...container.querySelectorAll('[class~="flex"]')].filter((el) =>
      el.getAttribute('class')!.split(/\s+/).some((token) => /^h-\[\d+px\]$/.test(token)),
    );
    expect(fixed.map((el) => el.getAttribute('class'))).toEqual([]);
  });

  it('sits the donut and owner cards at their own height, not stretched to the pulse cards', () => {
    vi.stubGlobal('fetch', fetchMock());
    renderDistribution({ rows: book });
    const donutRow = screen.getByText('Current health').closest('[data-row]')!;
    expect(donutRow.className).toContain('items-start');
    expect(within(donutRow as HTMLElement).queryByText('CSM Pulse Score')).toBeNull();
  });

  it('draws no empty filter row above the cards when no filter is on', () => {
    vi.stubGlobal('fetch', fetchMock());
    renderDistribution({ rows: book });
    expect(screen.queryByRole('button', { name: /Clear active filter/ })).toBeNull();
    expect(document.querySelector('.h-\\[24px\\]')).toBeNull();
  });
});
