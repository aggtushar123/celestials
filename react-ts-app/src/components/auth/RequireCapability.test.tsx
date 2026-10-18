import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import type { Capability } from '../../features/auth/authSlice';
import { RequireCapability } from './RequireCapability';

// Integration tier (see the `testing` skill): real store + real router,
// nothing mocked — this component is pure gating logic.

function renderGuard(permissions: Capability[]) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'support-lead',
          role_id: 3,
          role_name: 'Support Lead',
          permissions,
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

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route
            path="/users"
            element={
              <RequireCapability capability="manage_users">
                <div>USER MANAGEMENT</div>
              </RequireCapability>
            }
          />
          <Route path="/work" element={<div>WORK HOME</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('RequireCapability', () => {
  it('renders the page for someone holding the capability', () => {
    renderGuard(['manage_users']);
    expect(screen.getByText('USER MANAGEMENT')).toBeInTheDocument();
  });

  it('redirects to the home page, Work, for someone without it', () => {
    renderGuard(['manage_integrations']);
    expect(screen.getByText('WORK HOME')).toBeInTheDocument();
    expect(screen.queryByText('USER MANAGEMENT')).not.toBeInTheDocument();
  });

  it('redirects when the user holds no capabilities at all', () => {
    renderGuard([]);
    expect(screen.getByText('WORK HOME')).toBeInTheDocument();
  });

  it('gates on the capability, not on holding a role named "admin"', () => {
    // The whole point of the change: a custom role that happens to
    // grant manage_users gets in, even though its slug isn't "admin".
    renderGuard(['manage_users', 'manage_fx_rates']);
    expect(screen.getByText('USER MANAGEMENT')).toBeInTheDocument();
  });
});
