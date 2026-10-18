import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import { RootRedirect } from './RootRedirect';

// Integration tier: real store and router; the redirect is pure routing.

const USER = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice',
  avatar: '',
  role: 'admin',
  role_id: 1,
  role_name: 'Admin',
  permissions: [],
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
} as unknown as User;

function renderRoot(user: User | null) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: { user, accessToken: user ? 'token' : null, refreshToken: user ? 'refresh' : null, isAuthenticated: user !== null, isLoading: false, error: null },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/work" element={<div>WORK</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/onboarding" element={<div>TOUR</div>} />
          <Route path="/platform" element={<div>PORTAL</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('RootRedirect', () => {
  it('sends a signed-in member home, to Work (owner, 2026-10-17)', () => {
    renderRoot(USER);
    expect(screen.getByText('WORK')).toBeInTheDocument();
  });

  it('sends a visitor to sign in', () => {
    renderRoot(null);
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  it('sends someone who owes the tour to it first', () => {
    renderRoot({ ...USER, tour_completed_at: null } as User);
    expect(screen.getByText('TOUR')).toBeInTheDocument();
  });

  it('sends staff to the portal', () => {
    renderRoot({ ...USER, is_superuser: true } as User);
    expect(screen.getByText('PORTAL')).toBeInTheDocument();
  });
});
