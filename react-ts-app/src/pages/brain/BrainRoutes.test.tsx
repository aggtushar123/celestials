import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { Where } from '../organizations/testList';
import { BrainRoutes } from './BrainRoutes';

// The pages themselves have their own tests; this one is about the gate.
vi.mock('./WhatChanged', () => ({ WhatChangedPage: () => <h1>What changed</h1> }));
vi.mock('./Doing', () => ({ DoingPage: () => <h1>What's being done</h1> }));
vi.mock('./Graph', () => ({ GraphPage: () => <h1>Knowledge graph</h1> }));
vi.mock('./FeatureRequests', () => ({ FeatureRequestsPage: () => <h1>Feature requests</h1> }));
vi.mock('./Anomalies', () => ({ AnomaliesPage: () => <h1>Anomalies</h1> }));
vi.mock('./Customers', () => ({ CustomersPage: () => <h1>What customers are saying</h1> }));

function renderAt(url: string, role: 'admin' | 'csm') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1, role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role), function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '',
            ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/brain/*" element={<BrainRoutes />} />
          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          <Route path="/settings/*" element={<h1>Settings</h1>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </Provider>,
  );
}
const where = () => screen.getByTestId('where').textContent;

describe('/brain (rules spec §2.4, controller ruling on backend gap 1)', () => {
  it.each(['/brain/waiting?scope=team', '/brain/review'])('sends %s to Work, keeping the query (Approvals only for review)', (url) => {
    renderAt(url, 'csm');
    expect(where()).toBe(url === '/brain/review' ? '/work?queue=mine&kind=approval' : '/work?scope=team&queue=mine');
  });

  it('opens What changed to everyone (spec §2.1)', () => {
    renderAt('/brain', 'csm');
    expect(screen.getByRole('heading', { name: 'What changed' })).toBeInTheDocument();
    expect(where()).toBe('/brain');
  });

  it("opens What's being done to everyone (Doing spec §2.2)", () => {
    renderAt('/brain/doing', 'csm');
    expect(screen.getByRole('heading', { name: "What's being done" })).toBeInTheDocument();
    expect(where()).toBe('/brain/doing');
  });

  it('opens What customers are saying to everyone (customers spec §2.1)', () => {
    renderAt('/brain/customers', 'csm');
    expect(screen.getByRole('heading', { name: 'What customers are saying' })).toBeInTheDocument();
    expect(where()).toBe('/brain/customers');
  });

  it.each(['csm', 'admin'] as const)("sends /brain/initiatives to What's being done's Initiatives for %s (Doing Decision 7)", (role) => {
    renderAt('/brain/initiatives', role);
    expect(where()).toBe('/brain/doing?section=initiatives');
    expect(screen.getByRole('heading', { name: "What's being done" })).toBeInTheDocument();
  });

  it.each(['/brain/dashboard', '/brain/nowhere'])('sends %s to /brain for everyone (Decision 14)', (url) => {
    renderAt(url, 'csm');
    expect(where()).toBe('/brain');
    expect(screen.getByRole('heading', { name: 'What changed' })).toBeInTheDocument();
  });

  it.each([
    ['/brain/agents', '/settings/ai/usage'],
    ['/brain/skills', '/settings/ai/skills'],
    ['/brain/feedback', '/settings/ai/feedback'],
  ])('redirects %s to %s (spec §2.1)', (url, path) => {
    renderAt(url, 'admin');
    expect(where()).toBe(path);
  });

  it.each([
    ['/brain/graph', 'Knowledge graph'],
    ['/brain/requests', 'Feature requests'],
    ['/brain/anomalies', 'Anomalies'],
  ])('opens %s to everyone (customers plan Decision 10)', (url, heading) => {
    renderAt(url, 'csm');
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(where()).toBe(url);
  });
});
