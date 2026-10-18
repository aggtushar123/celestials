import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { login } from '../../features/auth/authSlice';
import { ProtectedRoute } from './ProtectedRoute';

// Matches revenact-backend's login response shape — see
// revenact-backend/docs/API_CONTRACTS.md.
const mockUser = {
  id: 1,
  email: 'demo@revenact.io',
  name: 'Demo User',
  avatar: 'https://i.pravatar.cc/150?u=demo@revenact.io',
  role: 'admin' as const,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc' },
  is_active: true,
};

function renderAt(path: string, store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects unauthenticated visitors to the login page', () => {
    renderAt('/dashboard', makeStore());
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('renders protected content once the user is logged in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' }),
      })
    );

    const store = makeStore();
    await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));

    renderAt('/dashboard', store);
    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });
});
